import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  MANUAL_SCORECARD_LEVELS,
  normalizeManualScorecardRating,
  normalizePackageProtectionSmokeReport,
  PACKAGE_PROTECTION_SMOKE_VARIANTS,
} from "./package-protection-smoke.mjs";
import {
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

export const GUIDED_ATTACKER_TIERS = Object.freeze([
  "A0",
  "A1",
  "A2",
  "A3",
  "A4",
]);

export const GUIDED_AI_TIERS = Object.freeze([
  "M0",
  "M1",
  "M2",
  "M3",
  "M4",
]);

export const GUIDED_ATTACK_METHODS = Object.freeze([
  "static-only",
  "static+webcrack",
  "static+reference",
  "dynamic-hooked",
  "runtime-rehosted",
]);

export const GUIDED_TIME_BUCKETS = Object.freeze([
  "<10m",
  "10-30m",
  "30-120m",
  ">120m",
]);

export const GUIDED_ROUND_MODES = Object.freeze([
  "single-pass",
  "multi-round",
]);

export const GUIDED_RESULT_TIERS = Object.freeze([
  "R0",
  "R1",
  "R2",
  "R3",
  "R4",
]);

const GUIDED_RESULT_LABELS = Object.freeze({
  R0: "only-loader",
  R1: "high-level-architecture",
  R2: "critical-flow-recovery",
  R3: "readable-module-recovery",
  R4: "patch-and-bypass-ready",
});

const GUIDED_LEGACY_ATTACK_PATH_ALIASES = Object.freeze({
  "static+webcrack+reference": "static+reference",
});

const RATING_ORDER = Object.freeze({
  "parse-fail / only-loader": 0,
  "high-level-architecture": 1,
  "readable-module-recovery": 2,
});

const GUIDED_TIME_BUCKET_SLUG_ALIASES = Object.freeze({
  "<10m": "lt10m",
  ">120m": "gt120m",
});

function normalizeVariant(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pref-bridge") {
    return "shielded-pref-bridge";
  }
  if (normalized === "surface-scrub") {
    return "shielded-surface-scrub";
  }
  if (normalized === "surface-scrub-wasm-digest" || normalized === "wasm-digest") {
    return "shielded-surface-scrub-wasm-digest";
  }
  return PACKAGE_PROTECTION_SMOKE_VARIANTS.includes(normalized)
    ? normalized
    : null;
}

function normalizeChannel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "stable" || normalized === "beta"
    ? normalized
    : null;
}

function normalizeNonEmptyString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeEnum(value, allowedValues) {
  const normalized = String(value || "").trim();
  return allowedValues.includes(normalized)
    ? normalized
    : null;
}

function normalizeAttackerTier(value) {
  return normalizeEnum(value, GUIDED_ATTACKER_TIERS);
}

function normalizeAITier(value) {
  return normalizeEnum(value, GUIDED_AI_TIERS);
}

function normalizeAttackMethod(value) {
  const normalized = String(value || "").trim();
  if (GUIDED_ATTACK_METHODS.includes(normalized)) {
    return normalized;
  }
  if (Object.prototype.hasOwnProperty.call(GUIDED_LEGACY_ATTACK_PATH_ALIASES, normalized)) {
    return GUIDED_LEGACY_ATTACK_PATH_ALIASES[normalized];
  }
  return null;
}

function normalizeTimeBucket(value) {
  return normalizeEnum(value, GUIDED_TIME_BUCKETS);
}

function normalizeRoundMode(value) {
  return normalizeEnum(value, GUIDED_ROUND_MODES);
}

function normalizeResultTier(value) {
  return normalizeEnum(value, GUIDED_RESULT_TIERS);
}

function slugifyGuidedAttackValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "unknown";
  }
  if (Object.prototype.hasOwnProperty.call(GUIDED_TIME_BUCKET_SLUG_ALIASES, normalized)) {
    return GUIDED_TIME_BUCKET_SLUG_ALIASES[normalized];
  }
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown";
}

export function buildPackageProtectionGuidedAttackProfileKey(input = {}) {
  return [
    slugifyGuidedAttackValue(input.attackerTier),
    slugifyGuidedAttackValue(input.aiTier),
    slugifyGuidedAttackValue(input.attackMethod),
    slugifyGuidedAttackValue(input.roundMode),
    slugifyGuidedAttackValue(input.timeBucket),
  ].join("__");
}

function compareRatings(left, right) {
  const leftOrder = Object.prototype.hasOwnProperty.call(RATING_ORDER, left) ? RATING_ORDER[left] : null;
  const rightOrder = Object.prototype.hasOwnProperty.call(RATING_ORDER, right) ? RATING_ORDER[right] : null;
  if (leftOrder == null || rightOrder == null) {
    return null;
  }
  return leftOrder - rightOrder;
}

async function summarizeEvidenceFile(filePath) {
  const stats = await fs.stat(filePath);
  return {
    path: filePath,
    sizeBytes: Number(stats.size || 0),
  };
}

function summarizeGuidedAttackComparison(report) {
  const guidedRating = normalizeManualScorecardRating(report?.guidedAttack?.rating);
  const singlePassRating = normalizeManualScorecardRating(report?.manualSinglePass?.llmSinglePassResult);
  const delta = compareRatings(guidedRating, singlePassRating);

  let relation = "no-single-pass-baseline";
  if (delta === 0) {
    relation = "same-as-single-pass-llm";
  } else if (typeof delta === "number" && delta > 0) {
    relation = "stronger-than-single-pass-llm";
  } else if (typeof delta === "number" && delta < 0) {
    relation = "weaker-than-single-pass-llm";
  }

  return {
    singlePassLLMRating: singlePassRating,
    singlePassAvailable: Boolean(singlePassRating),
    relation,
  };
}

function deriveNextAction({ rating, resultTier }) {
  if (resultTier === "R3" || resultTier === "R4" || rating === "readable-module-recovery") {
    return "open-future-hardening-wave";
  }
  if (resultTier === "R1" || resultTier === "R2" || rating === "high-level-architecture") {
    return "probe-candidate-hardening";
  }
  return "keep-current-shielded";
}

export function parsePackageProtectionGuidedAttackScoreArgs(argv = process.argv.slice(2)) {
  const options = {
    variant: null,
    channel: null,
    rating: null,
    resultTier: null,
    attackerTier: null,
    aiTier: null,
    attackMethod: null,
    timeBucket: null,
    roundMode: null,
    summary: null,
    notes: null,
    evidenceFiles: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--variant":
        options.variant = normalizeVariant(argv[index + 1]);
        index += 1;
        break;
      case "--channel":
        options.channel = normalizeChannel(argv[index + 1]);
        index += 1;
        break;
      case "--rating":
        options.rating = normalizeManualScorecardRating(argv[index + 1]);
        index += 1;
        break;
      case "--result-tier":
        options.resultTier = normalizeResultTier(argv[index + 1]);
        index += 1;
        break;
      case "--attacker-tier":
        options.attackerTier = normalizeAttackerTier(argv[index + 1]);
        index += 1;
        break;
      case "--ai-tier":
        options.aiTier = normalizeAITier(argv[index + 1]);
        index += 1;
        break;
      case "--attack-method":
        options.attackMethod = normalizeAttackMethod(argv[index + 1]);
        index += 1;
        break;
      case "--attack-path":
        options.attackMethod = normalizeAttackMethod(argv[index + 1]);
        index += 1;
        break;
      case "--time-bucket":
        options.timeBucket = normalizeTimeBucket(argv[index + 1]);
        index += 1;
        break;
      case "--cost-bucket":
        options.timeBucket = normalizeTimeBucket(argv[index + 1]);
        index += 1;
        break;
      case "--round-mode":
        options.roundMode = normalizeRoundMode(argv[index + 1]);
        index += 1;
        break;
      case "--summary":
        options.summary = normalizeNonEmptyString(argv[index + 1]);
        index += 1;
        break;
      case "--notes":
        options.notes = normalizeNonEmptyString(argv[index + 1]);
        index += 1;
        break;
      case "--evidence-file":
        options.evidenceFiles.push(path.resolve(String(argv[index + 1] || "")));
        index += 1;
        break;
      default:
        throw createScriptError("args", `Unknown option: ${token}`, {
          failedStage: "parse-args",
          details: {
            option: token,
          },
        });
    }
  }

  assertScript(Boolean(options.variant), "--variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest", {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.channel), "--channel must be stable or beta", {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.rating), `--rating must be one of: ${MANUAL_SCORECARD_LEVELS.join(" | ")}`, {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.resultTier), `--result-tier must be one of: ${GUIDED_RESULT_TIERS.join(" | ")}`, {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.attackerTier), `--attacker-tier must be one of: ${GUIDED_ATTACKER_TIERS.join(" | ")}`, {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.aiTier), `--ai-tier must be one of: ${GUIDED_AI_TIERS.join(" | ")}`, {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.attackMethod), `--attack-method must be one of: ${GUIDED_ATTACK_METHODS.join(" | ")}`, {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.timeBucket), `--time-bucket must be one of: ${GUIDED_TIME_BUCKETS.join(" | ")}`, {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.roundMode), `--round-mode must be one of: ${GUIDED_ROUND_MODES.join(" | ")}`, {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.summary), "--summary must be a non-empty string", {
    category: "args",
    failedStage: "parse-args",
  });

  return options;
}

function renderPackageProtectionGuidedAttackMarkdown(report) {
  const lines = [
    "# Package Protection Guided Attack",
    "",
    `- 生成时间: \`${report.generatedAt}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- variant/channel: \`${report.variant}/${report.channel}\``,
    `- profileKey: \`${report.profileKey}\``,
    `- rating: \`${report.guidedAttack.rating}\``,
    `- resultTier: \`${report.guidedAttack.resultTier}\` (${GUIDED_RESULT_LABELS[report.guidedAttack.resultTier] || "-"})`,
    `- attackerTier: \`${report.guidedAttack.attackerTier}\``,
    `- aiTier: \`${report.guidedAttack.aiTier}\``,
    `- attackMethod: \`${report.guidedAttack.attackMethod}\``,
    `- timeBucket: \`${report.guidedAttack.timeBucket}\``,
    `- roundMode: \`${report.guidedAttack.roundMode}\``,
    `- nextAction: \`${report.nextAction}\``,
    `- summary: ${report.guidedAttack.summary}`,
    "",
    "## Baseline",
    "",
    `- smokeStatus: \`${report.smokeStatus}\``,
    `- automatedStatus: \`${report.automatedStatus}\``,
    `- manualSinglePassStatus: \`${report.manualSinglePass.status}\``,
    `- manualSinglePassWebcrack: \`${report.manualSinglePass.webcrackInitialResult || "-"}\``,
    `- manualSinglePassLLM: \`${report.manualSinglePass.llmSinglePassResult || "-"}\``,
    `- comparison: \`${report.comparison.relation}\``,
    "",
    "## Evidence",
    "",
  ];

  if (Array.isArray(report.guidedAttack.evidenceFiles) && report.guidedAttack.evidenceFiles.length > 0) {
    report.guidedAttack.evidenceFiles.forEach((item) => {
      lines.push(`- \`${item.path}\` (${item.sizeBytes} bytes)`);
    });
  } else {
    lines.push("- 无");
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(`- ${report.guidedAttack.notes || "无"}`);
  lines.push("");

  return lines.join("\n");
}

async function persistPackageProtectionGuidedAttackReport(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const archiveDir = resolveAgentArtifactPath(projectRootPath, "package-protection-guided-attack");
  const profileKey = String(
    report.profileKey
    || report.guidedAttack?.profileKey
    || buildPackageProtectionGuidedAttackProfileKey(report.guidedAttack || {}),
  ).trim();
  const reportBaseName = `${report.variant}-${report.channel}-${profileKey}`;
  const reportPath = path.join(archiveDir, `${reportBaseName}.json`);
  const reportMDPath = path.join(archiveDir, `${reportBaseName}.md`);
  const aliasPath = path.join(archiveDir, `${report.variant}-${report.channel}.json`);
  const aliasMDPath = path.join(archiveDir, `${report.variant}-${report.channel}.md`);
  const aggregatePath = resolveAgentArtifactPath(projectRootPath, "package-protection-guided-attack.json");
  const aggregateMDPath = resolveAgentArtifactPath(projectRootPath, "package-protection-guided-attack.md");
  const existingAggregate = await fs.readFile(aggregatePath, "utf-8")
    .then((content) => JSON.parse(content))
    .catch((error) => {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    });
  const existingAlias = await fs.readFile(aliasPath, "utf-8")
    .then((content) => JSON.parse(content))
    .catch((error) => {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    });
  const existingAliasProfileKey = String(
    existingAlias?.profileKey
    || existingAlias?.guidedAttack?.profileKey
    || "",
  ).trim() || null;
  const previousReports = Array.isArray(existingAggregate?.reports)
    ? existingAggregate.reports.filter((item) => {
      const itemProfileKey = String(
        item?.profileKey
        || item?.guidedAttack?.profileKey
        || buildPackageProtectionGuidedAttackProfileKey(item?.guidedAttack || {}),
      ).trim();
      return `${item?.variant || ""}::${item?.channel || ""}::${itemProfileKey}` !== `${report.variant}::${report.channel}::${profileKey}`;
    })
    : [];
  const normalizedPreviousReports = previousReports.map((item) => {
    const itemProfileKey = String(
      item?.profileKey
      || item?.guidedAttack?.profileKey
      || buildPackageProtectionGuidedAttackProfileKey(item?.guidedAttack || {}),
    ).trim();
    return {
      ...item,
      profileKey: item?.profileKey || itemProfileKey,
      guidedAttack: item?.guidedAttack
        ? {
          ...item.guidedAttack,
          profileKey: item.guidedAttack.profileKey || itemProfileKey,
        }
        : item.guidedAttack,
    };
  });
  const aggregate = {
    generatedAt: new Date().toISOString(),
    reports: [report, ...normalizedPreviousReports]
      .sort((left, right) => String(right.generatedAt || "").localeCompare(String(left.generatedAt || ""))),
  };
  const aggregateMarkdown = [
    "# Package Protection Guided Attack Aggregate",
    "",
    `- 生成时间: \`${aggregate.generatedAt}\``,
    "",
    "## Reports",
    "",
    ...aggregate.reports.flatMap((item) => ([
      `### ${item.variant}/${item.channel}`,
      "",
      `- profileKey: \`${item.profileKey || item.guidedAttack?.profileKey || "-"}\``,
      `- rating: \`${item.guidedAttack?.rating || "-"}\``,
      `- resultTier: \`${item.guidedAttack?.resultTier || "-"}\``,
      `- attackerTier: \`${item.guidedAttack?.attackerTier || "-"}\``,
      `- aiTier: \`${item.guidedAttack?.aiTier || "-"}\``,
      `- attackMethod: \`${item.guidedAttack?.attackMethod || "-"}\``,
      `- timeBucket: \`${item.guidedAttack?.timeBucket || "-"}\``,
      `- roundMode: \`${item.guidedAttack?.roundMode || "-"}\``,
      `- comparison: \`${item.comparison?.relation || "-"}\``,
      `- nextAction: \`${item.nextAction || "-"}\``,
      `- summary: ${item.guidedAttack?.summary || "-"}`,
      "",
    ])),
  ].join("\n");

  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await fs.mkdir(archiveDir, { recursive: true });
  const aliasShouldUpdate = !existingAliasProfileKey || existingAliasProfileKey === profileKey;
  const writes = [
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionGuidedAttackMarkdown(report)}\n`, "utf-8"),
    fs.writeFile(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf-8"),
    fs.writeFile(aggregateMDPath, `${aggregateMarkdown}\n`, "utf-8"),
  ];
  if (aliasShouldUpdate) {
    writes.push(fs.writeFile(aliasPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"));
    writes.push(fs.writeFile(aliasMDPath, `${renderPackageProtectionGuidedAttackMarkdown(report)}\n`, "utf-8"));
  }
  await Promise.all(writes);

  return {
    profileKey,
    reportPath,
    reportMDPath,
    aliasPath,
    aliasMDPath,
    aliasUpdated: aliasShouldUpdate,
    aggregatePath,
    aggregateMDPath,
  };
}

export async function recordPackageProtectionGuidedAttack(options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const variant = normalizeVariant(options.variant);
  const channel = normalizeChannel(options.channel);
  const rating = normalizeManualScorecardRating(options.rating);
  const resultTier = normalizeResultTier(options.resultTier);
  const attackerTier = normalizeAttackerTier(options.attackerTier);
  const aiTier = normalizeAITier(options.aiTier);
  const attackMethod = normalizeAttackMethod(options.attackMethod);
  const timeBucket = normalizeTimeBucket(options.timeBucket);
  const roundMode = normalizeRoundMode(options.roundMode);
  const summary = normalizeNonEmptyString(options.summary);
  const notes = normalizeNonEmptyString(options.notes);
  const evidenceFiles = Array.isArray(options.evidenceFiles)
    ? options.evidenceFiles.map((item) => path.resolve(String(item || ""))).filter(Boolean)
    : [];
  const profileKey = buildPackageProtectionGuidedAttackProfileKey({
    attackerTier,
    aiTier,
    attackMethod,
    timeBucket,
    roundMode,
  });

  assertScript(Boolean(variant), "variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest", {
    category: "args",
    failedStage: "validate-options",
  });
  assertScript(Boolean(channel), "channel must be stable or beta", {
    category: "args",
    failedStage: "validate-options",
  });
  assertScript(Boolean(rating), `rating must be one of: ${MANUAL_SCORECARD_LEVELS.join(" | ")}`, {
    category: "args",
    failedStage: "validate-options",
  });
  assertScript(Boolean(resultTier), `resultTier must be one of: ${GUIDED_RESULT_TIERS.join(" | ")}`, {
    category: "args",
    failedStage: "validate-options",
  });
  assertScript(Boolean(attackerTier), `attackerTier must be one of: ${GUIDED_ATTACKER_TIERS.join(" | ")}`, {
    category: "args",
    failedStage: "validate-options",
  });
  assertScript(Boolean(aiTier), `aiTier must be one of: ${GUIDED_AI_TIERS.join(" | ")}`, {
    category: "args",
    failedStage: "validate-options",
  });
  assertScript(Boolean(attackMethod), `attackMethod must be one of: ${GUIDED_ATTACK_METHODS.join(" | ")}`, {
    category: "args",
    failedStage: "validate-options",
  });
  assertScript(Boolean(timeBucket), `timeBucket must be one of: ${GUIDED_TIME_BUCKETS.join(" | ")}`, {
    category: "args",
    failedStage: "validate-options",
  });
  assertScript(Boolean(roundMode), `roundMode must be one of: ${GUIDED_ROUND_MODES.join(" | ")}`, {
    category: "args",
    failedStage: "validate-options",
  });
  assertScript(Boolean(summary), "summary must be a non-empty string", {
    category: "args",
    failedStage: "validate-options",
  });

  const aggregatePath = resolveAgentArtifactPath(projectRootPath, "package-protection-smoke.json");
  const aggregate = await readJSONFile(aggregatePath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-smoke-aggregate",
    label: "package protection smoke aggregate",
  });
  const reports = Array.isArray(aggregate?.reports)
    ? aggregate.reports.map((report) => normalizePackageProtectionSmokeReport(report))
    : [];
  const targetReport = reports.find((report) => report.variant === variant && report.channel === channel);

  assertScript(Boolean(targetReport), `Missing smoke report for ${variant}/${channel}`, {
    category: "validation",
    failedStage: "select-target-report",
    details: {
      variant,
      channel,
    },
  });

  const evidenceSummaries = [];
  for (const filePath of evidenceFiles) {
    let summaryEntry;
    try {
      summaryEntry = await summarizeEvidenceFile(filePath);
    } catch (error) {
      throw createScriptError("validation", `Missing evidence file: ${filePath}`, {
        failedStage: "summarize-evidence-file",
        details: {
          path: filePath,
          reason: String(error?.code || error?.message || error),
        },
      });
    }
    evidenceSummaries.push(summaryEntry);
  }

  const report = {
    generatedAt: String(options.generatedAt || "").trim() || new Date().toISOString(),
    advisory: true,
    variant,
    channel,
    profileKey,
    smokeStatus: String(targetReport.status || "missing"),
    automatedStatus: String(targetReport.automatedScorecard?.status || "missing"),
    manualSinglePass: {
      status: String(targetReport.manualScorecard?.status || "pending"),
      webcrackInitialResult: targetReport.manualScorecard?.webcrackInitialResult || null,
      llmSinglePassResult: targetReport.manualScorecard?.llmSinglePassResult || null,
      completedAt: targetReport.manualScorecard?.completedAt || null,
    },
    guidedAttack: {
      rating,
      resultTier,
      attackerTier,
      aiTier,
      attackMethod,
      attackPath: attackMethod,
      timeBucket,
      costBucket: timeBucket,
      roundMode,
      profileKey,
      summary,
      notes,
      evidenceFiles: evidenceSummaries,
    },
    comparison: null,
    nextAction: deriveNextAction({ rating, resultTier }),
  };
  report.comparison = summarizeGuidedAttackComparison(report);

  const paths = await persistPackageProtectionGuidedAttackReport(report, {
    projectRootPath,
  });

  return {
    report,
    paths,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionGuidedAttackScoreArgs(argv);
  const { report, paths } = await recordPackageProtectionGuidedAttack(options);
  console.log(`Package protection guided attack recorded: ${paths.reportPath}`);
  console.log(`Guided attack rating: ${report.guidedAttack.rating}`);
  console.log(`Guided result tier: ${report.guidedAttack.resultTier}`);
  console.log(`Comparison: ${report.comparison.relation}`);
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch((error) => {
    const failureInfo = buildScriptFailureInfo(error, {
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    console.error(`${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}
