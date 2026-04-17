import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import {
  buildManualScorecard,
  normalizeManualScorecardRating,
  normalizePackageProtectionSmokeReport,
  PACKAGE_PROTECTION_SMOKE_VARIANTS,
  persistPackageProtectionSmokeReport,
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

export function parsePackageProtectionWebcrackScoreArgs(argv = process.argv.slice(2)) {
  const options = {
    variant: null,
    channel: null,
    webcrack: null,
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
      default:
        throw createScriptError("args", `Unknown option: ${token}`, {
          failedStage: "parse-args",
          details: {
            option: token,
          },
        });
    }
  }

  assertScript(Boolean(options.variant), "--variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string", {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.channel), "--channel must be stable or beta", {
    category: "args",
    failedStage: "parse-args",
  });

  return options;
}

async function readWebcrackSuggestedRating({ projectRootPath, variant, channel }) {
  const reportPath = path.join(
    resolveAgentArtifactPath(projectRootPath, "package-protection-webcrack"),
    `${variant}-${channel}.json`,
  );
  const report = await readJSONFile(reportPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-webcrack-report",
    label: "package protection webcrack report",
  });
  const suggested = normalizeManualScorecardRating(report?.suggestedWebcrackRating);
  assertScript(Boolean(suggested), `Missing suggested webcrack rating for ${variant}/${channel}`, {
    category: "validation",
    failedStage: "read-webcrack-report",
    details: {
      variant,
      channel,
      reportPath,
    },
  });
  return {
    reportPath,
    suggested,
  };
}

export async function recordPackageProtectionWebcrackScore(options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const variant = normalizeVariant(options.variant);
  const channel = normalizeChannel(options.channel);
  const explicitWebcrack = normalizeManualScorecardRating(options.webcrack);

  assertScript(Boolean(variant), "variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string", {
    category: "args",
    failedStage: "validate-options",
  });
  assertScript(Boolean(channel), "channel must be stable or beta", {
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

  const inferredWebcrack = explicitWebcrack
    ? {
      suggested: explicitWebcrack,
      reportPath: null,
    }
    : await readWebcrackSuggestedRating({
      projectRootPath,
      variant,
      channel,
    });

  const currentManual = targetReport.manualScorecard || buildManualScorecard();
  const nextCompletedAt = currentManual.llmSinglePassResult
    ? String(options.completedAt || "").trim() || new Date().toISOString()
    : currentManual.completedAt;
  const updatedReport = normalizePackageProtectionSmokeReport({
    ...targetReport,
    manualScorecard: buildManualScorecard({
      webcrackInitialResult: inferredWebcrack.suggested,
      llmSinglePassResult: currentManual.llmSinglePassResult,
      status: currentManual.llmSinglePassResult ? "completed" : "pending",
      completedAt: nextCompletedAt,
    }),
  });
  const paths = await persistPackageProtectionSmokeReport(updatedReport, {
    projectRootPath,
  });

  return {
    report: updatedReport,
    paths,
    webcrackReportPath: inferredWebcrack.reportPath,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionWebcrackScoreArgs(argv);
  const { report, paths, webcrackReportPath } = await recordPackageProtectionWebcrackScore(options);
  console.log(`Package protection webcrack score recorded: ${paths.reportPath}`);
  if (webcrackReportPath) {
    console.log(`Webcrack advisory source: ${webcrackReportPath}`);
  }
  console.log(`Webcrack rating: ${report.manualScorecard.webcrackInitialResult || "-"}`);
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
