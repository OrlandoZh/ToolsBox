import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  GUIDED_AI_TIERS,
  GUIDED_ATTACKER_TIERS,
  GUIDED_ATTACK_METHODS,
  GUIDED_ROUND_MODES,
  GUIDED_TIME_BUCKETS,
} from "./package-protection-guided-attack-score.mjs";
import { selectStrongestGuidedAttackReport } from "./package-protection-matrix-report.mjs";
import {
  normalizeManualScorecardRating,
  normalizePackageProtectionSmokeReport,
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
const DEFAULT_REGISTRY_PATH = path.join(projectRoot, "config", "package-protection-candidates.json");

const STATUS_LABELS = Object.freeze({
  passed: "通过",
  attention: "关注",
  missing: "缺失",
});

const RATING_ORDER = Object.freeze({
  "parse-fail / only-loader": 0,
  "high-level-architecture": 1,
  "readable-module-recovery": 2,
});

const GUIDED_ATTACKER_TIER_ORDER = Object.freeze(
  Object.fromEntries(GUIDED_ATTACKER_TIERS.map((value, index) => [value, index])),
);
const GUIDED_AI_TIER_ORDER = Object.freeze(
  Object.fromEntries(GUIDED_AI_TIERS.map((value, index) => [value, index])),
);
const GUIDED_ATTACK_METHOD_ORDER = Object.freeze(
  Object.fromEntries(GUIDED_ATTACK_METHODS.map((value, index) => [value, index])),
);
const GUIDED_TIME_BUCKET_ORDER = Object.freeze(
  Object.fromEntries(GUIDED_TIME_BUCKETS.map((value, index) => [value, index])),
);
const GUIDED_ROUND_MODE_ORDER = Object.freeze(
  Object.fromEntries(GUIDED_ROUND_MODES.map((value, index) => [value, index])),
);

const FIXED_GUIDED_A2_M3_TARGET = Object.freeze({
  attackerTier: "A2",
  aiTier: "M3",
  attackMethod: "static+reference",
  roundMode: "multi-round",
  timeBucket: "30-120m",
});

function normalizeNonEmptyString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeArray(values = []) {
  return Array.isArray(values)
    ? values.map((item) => normalizeNonEmptyString(item)).filter(Boolean)
    : [];
}

function pickStatusLabel(status) {
  return STATUS_LABELS[String(status || "").trim()] || STATUS_LABELS.attention;
}

function compareRatings(left, right) {
  const leftOrder = Object.prototype.hasOwnProperty.call(RATING_ORDER, left) ? RATING_ORDER[left] : null;
  const rightOrder = Object.prototype.hasOwnProperty.call(RATING_ORDER, right) ? RATING_ORDER[right] : null;
  if (leftOrder == null || rightOrder == null) {
    return null;
  }
  return leftOrder - rightOrder;
}

function maxRating(...values) {
  const ratings = values
    .map((value) => normalizeManualScorecardRating(value))
    .filter(Boolean);
  if (ratings.length === 0) {
    return null;
  }
  return ratings.reduce((strongest, current) => {
    if (!strongest) {
      return current;
    }
    const delta = compareRatings(current, strongest);
    return typeof delta === "number" && delta > 0
      ? current
      : strongest;
  }, null);
}

function isReadableModuleRisk({ rating = null, resultTier = null } = {}) {
  return rating === "readable-module-recovery"
    || resultTier === "R3"
    || resultTier === "R4";
}

function isArchitectureRecoverable({ rating = null, resultTier = null } = {}) {
  return rating === "high-level-architecture"
    || resultTier === "R1"
    || resultTier === "R2";
}

function normalizeCandidateRegistry(registry = {}) {
  const candidates = Array.isArray(registry?.candidates)
    ? registry.candidates.map((candidate) => ({
      id: normalizeNonEmptyString(candidate?.id),
      class: normalizeNonEmptyString(candidate?.class) || "unknown",
      stage: normalizeNonEmptyString(candidate?.stage) || "unknown",
      baseVariant: normalizeNonEmptyString(candidate?.baseVariant),
      executionMode: normalizeNonEmptyString(candidate?.executionMode) || "unknown",
      evaluationKind: normalizeNonEmptyString(candidate?.evaluationKind) || "future",
      variant: normalizeNonEmptyString(candidate?.variant),
      compareVariant: normalizeNonEmptyString(candidate?.compareVariant),
      channel: normalizeNonEmptyString(candidate?.channel) || "stable",
      artifactCoverage: normalizeArray(candidate?.artifactCoverage),
      promotionGate: normalizeNonEmptyString(candidate?.promotionGate) || "advisory-only",
      status: normalizeNonEmptyString(candidate?.status) || "unknown",
      summary: normalizeNonEmptyString(candidate?.summary) || "No summary provided.",
    })).filter((candidate) => candidate.id)
    : [];

  return {
    schemaVersion: Number(registry?.schemaVersion || 1),
    updatedAt: normalizeNonEmptyString(registry?.updatedAt),
    summary: normalizeNonEmptyString(registry?.summary),
    candidates,
  };
}

async function readJSONIfExists(filePath, options = {}) {
  try {
    return await readJSONFile(filePath, options);
  } catch (error) {
    if (error?.scriptErrorCategory === "environment" && String(error?.message || "").includes("Missing JSON file")) {
      return null;
    }
    throw error;
  }
}

function indexSmokeReports(smokeAggregate = null) {
  const reports = Array.isArray(smokeAggregate?.reports)
    ? smokeAggregate.reports.map((report) => normalizePackageProtectionSmokeReport(report))
    : [];
  return new Map(
    reports.map((report) => [`${report.variant}:${report.channel}`, report]),
  );
}

function normalizeGuidedAttackReport(report = null) {
  if (!report) {
    return {
      present: false,
      rating: null,
      resultTier: null,
      attackerTier: null,
      aiTier: null,
      attackMethod: null,
      timeBucket: null,
      roundMode: null,
      relation: null,
      nextAction: null,
      summary: null,
      profileKey: null,
    };
  }

  return {
    present: true,
    rating: normalizeManualScorecardRating(report?.guidedAttack?.rating),
    resultTier: normalizeNonEmptyString(report?.guidedAttack?.resultTier),
    attackerTier: normalizeNonEmptyString(report?.guidedAttack?.attackerTier),
    aiTier: normalizeNonEmptyString(report?.guidedAttack?.aiTier),
    attackMethod: normalizeNonEmptyString(report?.guidedAttack?.attackMethod),
    timeBucket: normalizeNonEmptyString(report?.guidedAttack?.timeBucket),
    roundMode: normalizeNonEmptyString(report?.guidedAttack?.roundMode),
    relation: normalizeNonEmptyString(report?.comparison?.relation),
    nextAction: normalizeNonEmptyString(report?.nextAction),
    summary: normalizeNonEmptyString(report?.guidedAttack?.summary),
    profileKey: normalizeNonEmptyString(report?.profileKey || report?.guidedAttack?.profileKey),
  };
}

function normalizeWebcrackReport(report = null) {
  if (!report) {
    return {
      present: false,
      rating: null,
      nextAction: null,
      summary: null,
      loaderAnchorCount: 0,
      semanticAnchorCount: 0,
    };
  }
  return {
    present: true,
    rating: normalizeManualScorecardRating(report?.suggestedWebcrackRating),
    nextAction: normalizeNonEmptyString(report?.nextAction),
    summary: normalizeNonEmptyString(report?.summary),
    loaderAnchorCount: Number(report?.outputScan?.loaderAnchorCount || 0),
    semanticAnchorCount: Number(report?.outputScan?.semanticAnchorCount || 0),
  };
}

function normalizeCompareReport(report = null) {
  if (!report) {
    return {
      present: false,
      status: "missing",
      decision: null,
      nextAction: null,
      summary: null,
      guidedAttackSymmetryComplete: false,
      baseGuidedRating: null,
      candidateGuidedRating: null,
      baseGuidedResultTier: null,
      candidateGuidedResultTier: null,
    };
  }

  return {
    present: true,
    status: normalizeNonEmptyString(report?.status) || "missing",
    decision: normalizeNonEmptyString(report?.decision),
    nextAction: normalizeNonEmptyString(report?.nextAction),
    summary: normalizeNonEmptyString(report?.summary),
    guidedAttackSymmetryComplete: report?.evidence?.guidedAttackSymmetryComplete === true,
    baseGuidedRating: normalizeManualScorecardRating(report?.base?.guidedAttack?.rating),
    candidateGuidedRating: normalizeManualScorecardRating(report?.candidate?.guidedAttack?.rating),
    baseGuidedResultTier: normalizeNonEmptyString(report?.base?.guidedAttack?.resultTier),
    candidateGuidedResultTier: normalizeNonEmptyString(report?.candidate?.guidedAttack?.resultTier),
  };
}

function buildFixedProfileCoverage({ webcrackRating = null, llmSinglePassRating = null, guided = null, compare = null } = {}) {
  const singlePassAutomation = {
    webcrackPresent: Boolean(webcrackRating),
    llmPresent: Boolean(llmSinglePassRating),
    complete: Boolean(webcrackRating && llmSinglePassRating),
    rating: maxRating(webcrackRating, llmSinglePassRating),
  };

  const guidedA2M3 = {
    present: guided?.present === true,
    meetsTarget: false,
    attackerTier: guided?.attackerTier || null,
    aiTier: guided?.aiTier || null,
    attackMethod: guided?.attackMethod || null,
    roundMode: guided?.roundMode || null,
    timeBucket: guided?.timeBucket || null,
    profileKey: guided?.profileKey || null,
  };

  if (guidedA2M3.present) {
    guidedA2M3.meetsTarget = (
      Number(GUIDED_ATTACKER_TIER_ORDER[guidedA2M3.attackerTier] ?? -1) >= Number(GUIDED_ATTACKER_TIER_ORDER[FIXED_GUIDED_A2_M3_TARGET.attackerTier] ?? Number.MAX_SAFE_INTEGER)
      && Number(GUIDED_AI_TIER_ORDER[guidedA2M3.aiTier] ?? -1) >= Number(GUIDED_AI_TIER_ORDER[FIXED_GUIDED_A2_M3_TARGET.aiTier] ?? Number.MAX_SAFE_INTEGER)
      && Number(GUIDED_ATTACK_METHOD_ORDER[guidedA2M3.attackMethod] ?? -1) >= Number(GUIDED_ATTACK_METHOD_ORDER[FIXED_GUIDED_A2_M3_TARGET.attackMethod] ?? Number.MAX_SAFE_INTEGER)
      && Number(GUIDED_ROUND_MODE_ORDER[guidedA2M3.roundMode] ?? -1) >= Number(GUIDED_ROUND_MODE_ORDER[FIXED_GUIDED_A2_M3_TARGET.roundMode] ?? Number.MAX_SAFE_INTEGER)
      && Number(GUIDED_TIME_BUCKET_ORDER[guidedA2M3.timeBucket] ?? -1) >= Number(GUIDED_TIME_BUCKET_ORDER[FIXED_GUIDED_A2_M3_TARGET.timeBucket] ?? Number.MAX_SAFE_INTEGER)
    );
  }

  return {
    singlePassAutomation,
    guidedA2M3,
    compareGuidedSymmetry: compare?.present === true
      ? {
        present: true,
        complete: compare.guidedAttackSymmetryComplete === true,
      }
      : {
        present: false,
        complete: false,
      },
  };
}

function deriveResistanceLabel({ singlePassCeiling = null, guided = null } = {}) {
  if (guided?.present === true) {
    if (isReadableModuleRisk(guided)) {
      return "readable-module-risk";
    }
    if (isArchitectureRecoverable(guided)) {
      return "architecture-recoverable-under-stronger-profile";
    }
  }

  if (singlePassCeiling === "readable-module-recovery") {
    return "single-pass-readable-module-risk";
  }
  if (singlePassCeiling === "high-level-architecture") {
    return "single-pass-architecture-recovery";
  }
  if (singlePassCeiling === "parse-fail / only-loader") {
    return "single-pass-loader-only";
  }
  return "missing-attack-evidence";
}

function summarizeResistanceLabel(label, candidate) {
  const target = candidate.id || candidate.variant || candidate.compareVariant || "candidate";
  switch (label) {
    case "readable-module-risk":
      return `${target} 的最强已记录攻击画像已经进入 readable-module-recovery 风险区间。`;
    case "architecture-recoverable-under-stronger-profile":
      return `${target} 仍能挡住单轮自动化直读，但更强攻击画像已经可以稳定恢复高层架构。`;
    case "single-pass-readable-module-risk":
      return `${target} 当前单轮攻击证据已经落到 readable-module-recovery，不应继续按当前强度乐观判断。`;
    case "single-pass-architecture-recovery":
      return `${target} 当前单轮攻击证据已经能恢复高层架构，后续应优先看是否需要进一步 hardening。`;
    case "single-pass-loader-only":
      return `${target} 当前单轮攻击证据仍停留在 loader-only。`;
    default:
      return `${target} 还缺少足够的攻击证据，暂时不能做更强判断。`;
  }
}

function buildEvidenceStatus(candidate, { smoke = null, webcrack = null, guided = null, compare = null } = {}) {
  const coverage = new Set(candidate.artifactCoverage || []);
  const requiredChecks = [];

  if (coverage.has("smoke")) {
    requiredChecks.push(Boolean(smoke));
  }
  if (coverage.has("webcrack")) {
    requiredChecks.push(Boolean(webcrack?.present || smoke?.manualScorecard?.webcrackInitialResult));
  }
  if (coverage.has("guided-attack")) {
    requiredChecks.push(guided?.present === true);
  }
  if (coverage.has("compare")) {
    requiredChecks.push(compare?.present === true);
  }

  if (requiredChecks.length === 0) {
    return "planned";
  }
  if (requiredChecks.every(Boolean)) {
    return "complete";
  }
  if (requiredChecks.some(Boolean)) {
    return "partial";
  }
  return "missing";
}

function shouldRequireSinglePassCoverage(candidate, profileCoverage = null) {
  return candidate.class === "current"
    && Array.isArray(candidate.artifactCoverage)
    && candidate.artifactCoverage.includes("webcrack")
    && profileCoverage?.singlePassAutomation?.complete !== true;
}

function shouldRequireGuidedA2M3Coverage(candidate, profileCoverage = null) {
  return candidate.class === "current"
    && Array.isArray(candidate.artifactCoverage)
    && candidate.artifactCoverage.includes("guided-attack")
    && profileCoverage?.guidedA2M3?.meetsTarget !== true;
}

function summarizeAttackCandidate(candidate, context = {}) {
  const attackVariant = candidate.variant || candidate.compareVariant || null;
  const smoke = attackVariant
    ? context.smokeByVariant.get(`${attackVariant}:${candidate.channel}`) || null
    : null;
  const webcrack = attackVariant
    ? normalizeWebcrackReport(context.webcrackReports[`${attackVariant}:${candidate.channel}`] || null)
    : normalizeWebcrackReport(null);
  const guided = attackVariant
    ? normalizeGuidedAttackReport(selectStrongestGuidedAttackReport(context.guidedAggregateReport, {
      variant: attackVariant,
      channel: candidate.channel,
      fallbackReport: context.guidedAliasReports[`${attackVariant}:${candidate.channel}`] || null,
    }))
    : normalizeGuidedAttackReport(null);
  const compare = candidate.evaluationKind === "compare"
    ? normalizeCompareReport(context.compareReports[candidate.compareVariant] || null)
    : normalizeCompareReport(null);

  const webcrackRating = normalizeManualScorecardRating(smoke?.manualScorecard?.webcrackInitialResult) || webcrack.rating;
  const llmSinglePassRating = normalizeManualScorecardRating(smoke?.manualScorecard?.llmSinglePassResult);
  const strongestSinglePassRating = maxRating(webcrackRating, llmSinglePassRating);
  const strongestObservedRating = maxRating(strongestSinglePassRating, guided.rating);
  const resistanceLabel = deriveResistanceLabel({
    singlePassCeiling: strongestSinglePassRating,
    guided,
  });
  const profileCoverage = buildFixedProfileCoverage({
    webcrackRating,
    llmSinglePassRating,
    guided,
    compare,
  });
  const present = Boolean(smoke || webcrack.present || guided.present || compare.present);
  const evidenceStatus = buildEvidenceStatus(candidate, {
    smoke,
    webcrack,
    guided,
    compare,
  });
  const recommendedAction = compare.nextAction
    || (shouldRequireSinglePassCoverage(candidate, profileCoverage)
      ? "collect-single-pass-automation-evidence"
      : null)
    || (shouldRequireGuidedA2M3Coverage(candidate, profileCoverage)
      ? "collect-a2-m3-guided-evidence"
      : null)
    || guided.nextAction
    || (resistanceLabel === "missing-attack-evidence"
      ? "collect-attack-evidence"
      : candidate.promotionGate);

  return {
    id: candidate.id,
    class: candidate.class,
    stage: candidate.stage,
    variant: attackVariant,
    channel: candidate.channel,
    baseVariant: candidate.baseVariant,
    evaluationKind: candidate.evaluationKind,
    registryStatus: candidate.status,
    present,
    evidenceStatus,
    promotionGate: candidate.promotionGate,
    recommendedAction,
    resistanceLabel,
    profileCoverage,
    artifactCoverage: candidate.artifactCoverage,
    attack: {
      webcrackRating,
      llmSinglePassRating,
      strongestSinglePassRating,
      strongestObservedRating,
      guidedAttack: guided,
      webcrack: webcrack,
    },
    compare: compare.present
      ? compare
      : null,
    summary: compare.summary
      || guided.summary
      || webcrack.summary
      || summarizeResistanceLabel(resistanceLabel, candidate),
  };
}

function buildAttackReportSummary(candidates = []) {
  const currentPrimary = candidates.find((candidate) => candidate.id === "shielded") || null;
  const hardeningWins = candidates.filter((candidate) => candidate.class === "experiment" && candidate.compare?.decision === "hardening-win");

  if (!currentPrimary?.present) {
    return {
      status: "missing",
      nextAction: "collect-attack-evidence",
      summary: "缺少 shielded 当前主路线的攻击证据，先补 webcrack / llm / guided-attack 工件。",
    };
  }

  if (currentPrimary.attack?.guidedAttack?.present !== true) {
    return {
      status: "attention",
      nextAction: "collect-attack-evidence",
      summary: "shielded 当前缺少更强攻击画像证据，现阶段只能说明单轮自动化阻力。",
    };
  }

  if (currentPrimary.profileCoverage?.guidedA2M3?.meetsTarget !== true) {
    return {
      status: "attention",
      nextAction: "collect-a2-m3-guided-evidence",
      summary: "shielded 当前缺少固定 A2/M3 强档画像证据，现阶段不应把当前攻击结论当成稳定上限。",
    };
  }

  if (currentPrimary.resistanceLabel === "readable-module-risk" || currentPrimary.resistanceLabel === "single-pass-readable-module-risk") {
    return {
      status: "attention",
      nextAction: "open-future-hardening-wave",
      summary: "shielded 当前主路线已出现 readable-module-recovery 风险，应进入下一轮 hardening 设计。",
    };
  }

  if (hardeningWins.length > 0) {
    return {
      status: "passed",
      nextAction: "review-experimental-hardening",
      summary: `shielded 当前已覆盖单轮自动化与固定 A2/M3 强档画像，且仍压在 ${currentPrimary.resistanceLabel}；可继续评估 ${hardeningWins.map((candidate) => candidate.id).join(", ")} 这类 retained candidate 是否值得升级优先级。`,
    };
  }

  return {
    status: "passed",
    nextAction: "keep-current-shielded",
    summary: `shielded 当前已覆盖单轮自动化与固定 A2/M3 强档画像，且仍压在 ${currentPrimary.resistanceLabel}，暂无需要立即替换默认 protected 路线的实验候选。`,
  };
}

export function parsePackageProtectionAttackReportArgs(argv = process.argv.slice(2)) {
  const options = {
    projectRootPath: projectRoot,
    registryPath: DEFAULT_REGISTRY_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--project-root":
        options.projectRootPath = path.resolve(String(argv[index + 1] || "").trim() || projectRoot);
        index += 1;
        break;
      case "--registry":
        options.registryPath = path.resolve(String(argv[index + 1] || "").trim() || DEFAULT_REGISTRY_PATH);
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

  return options;
}

async function collectAttackArtifacts(projectRootPath, registry = null) {
  const smokeAggregate = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-smoke.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-smoke-aggregate",
      label: "package protection smoke aggregate",
    },
  );
  const guidedAggregateReport = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-guided-attack.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-guided-attack-aggregate",
      label: "package protection guided attack aggregate",
    },
  );

  const webcrackReports = {};
  const guidedAliasReports = {};
  const compareReports = {};

  const registryCandidates = Array.isArray(registry?.candidates) ? registry.candidates : [];
  for (const candidate of registryCandidates) {
    const attackVariant = candidate.variant || candidate.compareVariant || null;
    if (!attackVariant) {
      continue;
    }

    const key = `${attackVariant}:${candidate.channel}`;
    if (!Object.prototype.hasOwnProperty.call(guidedAliasReports, key)) {
      const guidedAliasPath = resolveAgentArtifactPath(
        projectRootPath,
        "package-protection-guided-attack",
        `${attackVariant}-${candidate.channel}.json`,
      );
      guidedAliasReports[key] = await readJSONIfExists(guidedAliasPath, {
        missingCategory: "environment",
        invalidCategory: "validation",
        failedStage: "read-guided-attack-alias",
        label: guidedAliasPath,
      });
    }

    if (!Object.prototype.hasOwnProperty.call(webcrackReports, key)) {
      const webcrackPath = resolveAgentArtifactPath(
        projectRootPath,
        "package-protection-webcrack",
        `${attackVariant}-${candidate.channel}.json`,
      );
      webcrackReports[key] = await readJSONIfExists(webcrackPath, {
        missingCategory: "environment",
        invalidCategory: "validation",
        failedStage: "read-webcrack-report",
        label: webcrackPath,
      });
    }

    if (candidate.evaluationKind === "compare" && candidate.compareVariant) {
      const compareBaseVariant = normalizeNonEmptyString(candidate?.baseVariant) || "shielded";
      const comparePath = resolveAgentArtifactPath(
        projectRootPath,
        "package-protection-compare",
        `${candidate.compareVariant}-vs-${compareBaseVariant}-${candidate.channel}.json`,
      );
      compareReports[candidate.compareVariant] = await readJSONIfExists(comparePath, {
        missingCategory: "environment",
        invalidCategory: "validation",
        failedStage: "read-compare-report",
        label: comparePath,
      });
    }
  }

  return {
    smokeAggregate,
    guidedAggregateReport,
    webcrackReports,
    guidedAliasReports,
    compareReports,
  };
}

export function summarizePackageProtectionAttackReport({
  registry = {},
  smokeAggregate = null,
  guidedAggregateReport = null,
  webcrackReports = {},
  guidedAliasReports = {},
  compareReports = {},
} = {}) {
  const normalizedRegistry = normalizeCandidateRegistry(registry);
  const smokeByVariant = indexSmokeReports(smokeAggregate);
  const attackCandidates = normalizedRegistry.candidates.filter((candidate) => (
    candidate.artifactCoverage.includes("webcrack")
    || candidate.artifactCoverage.includes("guided-attack")
    || candidate.evaluationKind === "compare"
    || candidate.class === "control"
    || candidate.id === "shielded"
    || candidate.id === "encrypted"
  ));
  const candidates = attackCandidates.map((candidate) => summarizeAttackCandidate(candidate, {
    smokeByVariant,
    guidedAggregateReport,
    webcrackReports,
    guidedAliasReports,
    compareReports,
  }));
  const reportSummary = buildAttackReportSummary(candidates);

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status: reportSummary.status,
    statusLabel: pickStatusLabel(reportSummary.status),
    summary: reportSummary.summary,
    nextAction: reportSummary.nextAction,
    registry: {
      schemaVersion: normalizedRegistry.schemaVersion,
      updatedAt: normalizedRegistry.updatedAt,
      summary: normalizedRegistry.summary,
      candidateCount: normalizedRegistry.candidates.length,
      attackCandidateCount: candidates.length,
    },
    sources: {
      smokePresent: Boolean(smokeAggregate),
      guidedAggregatePresent: Boolean(guidedAggregateReport),
    },
    candidates,
  };
}

export function renderPackageProtectionAttackMarkdown(report = {}) {
  const lines = [
    "# Package Protection Attack Report",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- 状态: \`${report.statusLabel || "-"}\``,
    `- nextAction: \`${report.nextAction || "-"}\``,
    `- 摘要: ${report.summary || "-"}`,
    `- registry: \`v${report.registry?.schemaVersion || 1}\` / attackCandidates=\`${report.registry?.attackCandidateCount || 0}\``,
    "",
  ];

  const classOrder = ["current", "experiment", "control", "preflight", "future", "paper", "preplan"];
  for (const candidateClass of classOrder) {
    const rows = (Array.isArray(report.candidates) ? report.candidates : [])
      .filter((candidate) => candidate.class === candidateClass);
    if (rows.length === 0) {
      continue;
    }

    lines.push(`## ${candidateClass}`);
    lines.push("");
    rows.forEach((candidate) => {
      const guided = candidate.attack?.guidedAttack || {};
      lines.push(`### ${candidate.id}`);
      lines.push("");
      lines.push(`- stage: \`${candidate.stage}\``);
      lines.push(`- variant/channel: \`${candidate.variant || "-"} / ${candidate.channel || "-" }\``);
      lines.push(`- evidenceStatus: \`${candidate.evidenceStatus}\``);
      lines.push(`- resistanceLabel: \`${candidate.resistanceLabel}\``);
      lines.push(`- recommendedAction: \`${candidate.recommendedAction || "-"}\``);
      lines.push(`- single-pass: webcrack=\`${candidate.attack?.webcrackRating || "-"}\` / llm=\`${candidate.attack?.llmSinglePassRating || "-"}\` / ceiling=\`${candidate.attack?.strongestSinglePassRating || "-"}\``);
      lines.push(`- fixedProfiles: singlePass=\`${candidate.profileCoverage?.singlePassAutomation?.complete ? "complete" : "partial"}\` / guidedA2M3=\`${candidate.profileCoverage?.guidedA2M3?.meetsTarget ? "covered" : "missing"}\``);
      lines.push(`- guided: rating=\`${guided.rating || "-"}\` / resultTier=\`${guided.resultTier || "-"}\` / profile=\`${guided.attackerTier || "-"} ${guided.aiTier || "-"} ${guided.attackMethod || "-"} ${guided.roundMode || "-"} ${guided.timeBucket || "-"}\``);
      if (candidate.compare) {
        lines.push(`- compare: status=\`${candidate.compare.status || "-"}\` / decision=\`${candidate.compare.decision || "-"}\` / symmetry=\`${candidate.compare.guidedAttackSymmetryComplete ? "yes" : "no"}\``);
      }
      lines.push(`- 摘要: ${candidate.summary || "-"}`);
      lines.push("");
    });
  }

  return lines.join("\n");
}

export async function persistPackageProtectionAttackReport(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const reportPath = resolveAgentArtifactPath(projectRootPath, "package-protection-attack-report.json");
  const reportMDPath = resolveAgentArtifactPath(projectRootPath, "package-protection-attack-report.md");
  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionAttackMarkdown(report)}\n`, "utf-8"),
  ]);
  return {
    reportPath,
    reportMDPath,
  };
}

export async function runPackageProtectionAttackReport(options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const registryPath = path.resolve(options.registryPath || DEFAULT_REGISTRY_PATH);
  const rawRegistry = await readJSONFile(registryPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-candidate-registry",
    label: "package protection candidate registry",
  });
  const registry = normalizeCandidateRegistry(rawRegistry);
  assertScript(registry.candidates.length > 0, "package protection candidate registry must include at least one candidate", {
    category: "validation",
    failedStage: "validate-candidate-registry",
  });

  const artifacts = await collectAttackArtifacts(projectRootPath, registry);
  const report = summarizePackageProtectionAttackReport({
    registry,
    ...artifacts,
  });
  const paths = await persistPackageProtectionAttackReport(report, {
    projectRootPath,
  });

  return {
    report,
    paths,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionAttackReportArgs(argv);
  const { report, paths } = await runPackageProtectionAttackReport(options);
  console.log(`Package protection attack report generated: ${paths.reportPath}`);
  console.log(`Package protection attack report status: ${report.status}`);
  console.log(`Package protection attack report nextAction: ${report.nextAction}`);
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
