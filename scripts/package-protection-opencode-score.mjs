import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import { recordPackageProtectionLLMScore } from "./package-protection-llm-score.mjs";
import {
  normalizeManualScorecardRating,
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

function normalizeVariant(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "descriptor-bind") {
    return "shielded-descriptor-bind";
  }
  if (normalized === "jsconfuser-string" || normalized === "jsconfuser:string") {
    return "shielded-jsconfuser-string";
  }
  if (normalized === "pref-bridge") {
    return "shielded-pref-bridge";
  }
  if (normalized === "surface-scrub") {
    return "shielded-surface-scrub";
  }
  if (normalized === "surface-scrub-wasm-digest" || normalized === "wasm-digest") {
    return "shielded-surface-scrub-wasm-digest";
  }
  if (normalized === "surface-scrub-wasm-stage2-derive" || normalized === "wasm-stage2-derive") {
    return "shielded-surface-scrub-wasm-stage2-derive";
  }
  if (normalized === "surface-scrub-wasm-entitlement-legacy" || normalized === "wasm-entitlement-legacy") {
    return "shielded-surface-scrub-wasm-entitlement-legacy";
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

export function parsePackageProtectionOpencodeScoreArgs(argv = process.argv.slice(2)) {
  const options = {
    variant: null,
    channel: null,
    llm: null,
    projectRootPath: projectRoot,
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
      case "--variant":
        options.variant = normalizeVariant(argv[index + 1]);
        index += 1;
        break;
      case "--channel":
        options.channel = normalizeChannel(argv[index + 1]);
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

  assertScript(Boolean(options.variant), "--variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest|shielded-surface-scrub-wasm-stage2-derive|shielded-surface-scrub-wasm-entitlement-legacy", {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.channel), "--channel must be stable or beta", {
    category: "args",
    failedStage: "parse-args",
  });

  return options;
}

async function readOpencodeSuggestedRating({ projectRootPath, variant, channel }) {
  const reportPath = path.join(
    resolveAgentArtifactPath(projectRootPath, "package-protection-opencode"),
    `${variant}-${channel}.json`,
  );
  const report = await readJSONFile(reportPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-opencode-report",
    label: "package protection opencode report",
  });
  const suggested = normalizeManualScorecardRating(report?.suggestedLLMRating);
  assertScript(Boolean(suggested), `Missing suggested LLM rating for ${variant}/${channel}`, {
    category: "validation",
    failedStage: "read-opencode-report",
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

export async function recordPackageProtectionOpencodeScore(options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const variant = normalizeVariant(options.variant);
  const channel = normalizeChannel(options.channel);
  const explicitLLM = normalizeManualScorecardRating(options.llm);

  assertScript(Boolean(variant), "variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest|shielded-surface-scrub-wasm-stage2-derive|shielded-surface-scrub-wasm-entitlement-legacy", {
    category: "args",
    failedStage: "validate-options",
  });
  assertScript(Boolean(channel), "channel must be stable or beta", {
    category: "args",
    failedStage: "validate-options",
  });

  const inferredLLM = explicitLLM
    ? {
      suggested: explicitLLM,
      reportPath: null,
    }
    : await readOpencodeSuggestedRating({
      projectRootPath,
      variant,
      channel,
    });

  const result = await recordPackageProtectionLLMScore({
    projectRootPath,
    variant,
    channel,
    llm: inferredLLM.suggested,
    completedAt: options.completedAt,
  });

  return {
    ...result,
    opencodeReportPath: inferredLLM.reportPath,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionOpencodeScoreArgs(argv);
  const { report, paths, opencodeReportPath } = await recordPackageProtectionOpencodeScore(options);
  console.log(`Package protection opencode score recorded: ${paths.reportPath}`);
  if (opencodeReportPath) {
    console.log(`Opencode advisory source: ${opencodeReportPath}`);
  }
  console.log(`LLM rating: ${report.manualScorecard.llmSinglePassResult || "-"}`);
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
