import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import {
  buildManualScorecard,
  MANUAL_SCORECARD_LEVELS,
  normalizeManualScorecardRating,
  normalizePackageProtectionSmokeReport,
  PACKAGE_PROTECTION_SMOKE_VARIANTS,
  persistPackageProtectionSmokeReport,
  withPackageProtectionWorkflowLock,
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

export function parsePackageProtectionManualScoreArgs(argv = process.argv.slice(2)) {
  const options = {
    variant: null,
    channel: null,
    webcrack: null,
    llm: null,
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
      case "--webcrack":
        options.webcrack = normalizeManualScorecardRating(argv[index + 1]);
        index += 1;
        break;
      case "--llm":
        options.llm = normalizeManualScorecardRating(argv[index + 1]);
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
  assertScript(Boolean(options.webcrack), `--webcrack must be one of: ${MANUAL_SCORECARD_LEVELS.join(" | ")}`, {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.llm), `--llm must be one of: ${MANUAL_SCORECARD_LEVELS.join(" | ")}`, {
    category: "args",
    failedStage: "parse-args",
  });

  return options;
}

export async function recordPackageProtectionManualScore(options = {}) {
  return withPackageProtectionWorkflowLock("package-protection-manual-score.mjs", async () => {
    const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
    const variant = normalizeVariant(options.variant);
    const channel = normalizeChannel(options.channel);
    const webcrack = normalizeManualScorecardRating(options.webcrack);
    const llm = normalizeManualScorecardRating(options.llm);

    assertScript(Boolean(variant), "variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest", {
      category: "args",
      failedStage: "validate-options",
    });
    assertScript(Boolean(channel), "channel must be stable or beta", {
      category: "args",
      failedStage: "validate-options",
    });
    assertScript(Boolean(webcrack), `webcrack rating must be one of: ${MANUAL_SCORECARD_LEVELS.join(" | ")}`, {
      category: "args",
      failedStage: "validate-options",
    });
    assertScript(Boolean(llm), `llm rating must be one of: ${MANUAL_SCORECARD_LEVELS.join(" | ")}`, {
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

    const completedAt = String(options.completedAt || "").trim() || new Date().toISOString();
    const updatedReport = normalizePackageProtectionSmokeReport({
      ...targetReport,
      manualScorecard: buildManualScorecard({
        webcrackInitialResult: webcrack,
        llmSinglePassResult: llm,
        status: "completed",
        completedAt,
      }),
    });
    const paths = await persistPackageProtectionSmokeReport(updatedReport, {
      projectRootPath,
    });

    return {
      report: updatedReport,
      paths,
    };
  });
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionManualScoreArgs(argv);
  const { report, paths } = await recordPackageProtectionManualScore(options);
  console.log(`Package protection manual score recorded: ${paths.reportPath}`);
  console.log(`Manual score status: ${report.manualScorecard.status}`);
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
