import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import {
  buildPackageProtectionGuidedAttackProfileKey,
  GUIDED_AI_TIERS,
  GUIDED_ATTACKER_TIERS,
  GUIDED_ATTACK_METHODS,
  GUIDED_ROUND_MODES,
  GUIDED_TIME_BUCKETS,
} from "./package-protection-guided-attack-score.mjs";
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

export const PACKAGE_PROTECTION_EXPERIMENT_COMPARE_VARIANTS = Object.freeze([
  "shielded-descriptor-bind",
  "shielded-jsconfuser-string",
  "shielded-pref-bridge",
  "shielded-surface-scrub",
  "shielded-surface-scrub-wasm-digest",
]);

const STATUS_LABELS = Object.freeze({
  passed: "通过",
  attention: "关注",
  failed: "失败",
  missing: "缺失",
});

const DECISION_LABELS = Object.freeze({
  "runtime-only": "runtime-only",
  "hardening-win": "hardening-win",
  "needs-manual-ab": "needs-manual-ab",
  "leaning-same": "leaning-same",
  regression: "regression",
  "missing-evidence": "missing-evidence",
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

function normalizeVariant(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "descriptor-bind") {
    return "shielded-descriptor-bind";
  }
  if (normalized === "jsconfuser-string") {
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
  return PACKAGE_PROTECTION_EXPERIMENT_COMPARE_VARIANTS.includes(normalized)
    ? normalized
    : null;
}

export function resolvePackageProtectionExperimentCompareBaseVariant(variant) {
  return normalizeVariant(variant) === "shielded-surface-scrub-wasm-digest"
    ? "shielded-surface-scrub"
    : "shielded";
}

function normalizeChannel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "stable" || normalized === "beta"
    ? normalized
    : null;
}

export function parsePackageProtectionExperimentCompareArgs(argv = process.argv.slice(2)) {
  const options = {
    variant: null,
    channel: "stable",
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
        options.channel = normalizeChannel(argv[index + 1]) || null;
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

  assertScript(Boolean(options.variant), "--variant must be one of shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest", {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.channel), "--channel must be stable or beta", {
    category: "args",
    failedStage: "parse-args",
  });

  return options;
}

function summarizeSmoke(report) {
  if (!report) {
    return {
      present: false,
      variant: null,
      channel: null,
      status: "missing",
      automatedStatus: "missing",
      xpiBytes: 0,
      bundleBytes: 0,
      medianDurationMs: 0,
      medianDecodeDurationMs: 0,
      medianPrepareDurationMs: 0,
      llmSinglePassResult: null,
      hostBindingAvailableCount: 0,
      hostBindingDBAvailableCount: 0,
      hostBindingNoncePresentCount: 0,
      capabilityManifestDetailLevels: {},
      capabilityManifestOverlayAvailableCount: 0,
      capabilityManifestOverlayAppliedCount: 0,
      capabilityManifestActivationSatisfiedCount: 0,
    };
  }

  const normalized = normalizePackageProtectionSmokeReport(report);
  return {
    present: true,
    variant: normalized.variant,
    channel: normalized.channel,
    status: String(normalized.status || "missing"),
    automatedStatus: String(normalized.automatedScorecard?.status || "missing"),
    xpiBytes: Number(normalized.xpi?.sizeBytes || 0),
    bundleBytes: Number(normalized.bundle?.sizeBytes || 0),
    medianDurationMs: (() => {
      const values = (Array.isArray(normalized.runs) ? normalized.runs : [])
        .map((run) => Number(run?.durationMs || 0))
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right);
      if (values.length === 0) {
        return 0;
      }
      const middle = Math.floor(values.length / 2);
      if (values.length % 2 === 1) {
        return values[middle];
      }
      return (values[middle - 1] + values[middle]) / 2;
    })(),
    medianDecodeDurationMs: Number(normalized.medianDecodeDurationMs || 0),
    medianPrepareDurationMs: Number(normalized.medianPrepareDurationMs || 0),
    llmSinglePassResult: normalized.manualScorecard?.llmSinglePassResult || null,
    hostBindingAvailableCount: Number(normalized.hostBindingAvailableCount || 0),
    hostBindingDBAvailableCount: Number(normalized.hostBindingDBAvailableCount || 0),
    hostBindingNoncePresentCount: Number(normalized.hostBindingNoncePresentCount || 0),
    capabilityManifestDetailLevels: normalized.capabilityManifestDetailLevels || {},
    capabilityManifestOverlayAvailableCount: Number(normalized.capabilityManifestOverlayAvailableCount || 0),
    capabilityManifestOverlayAppliedCount: Number(normalized.capabilityManifestOverlayAppliedCount || 0),
    capabilityManifestActivationSatisfiedCount: Number(normalized.capabilityManifestActivationSatisfiedCount || 0),
  };
}

function summarizeWebcrack(report) {
  if (!report) {
    return {
      present: false,
      status: "missing",
      rating: null,
      effectiveOutputSource: null,
      semanticAnchorCount: null,
      semanticMatchCount: null,
      loaderAnchorCount: null,
      loaderMatchCount: null,
      primaryDurationMs: null,
      fallbackDurationMs: null,
    };
  }

  return {
    present: true,
    status: String(report.status || "missing"),
    rating: String(report.suggestedWebcrackRating || "").trim() || null,
    effectiveOutputSource: String(report.effectiveOutputSource || "").trim() || null,
    semanticAnchorCount: Number(report.outputScan?.semanticAnchorCount || 0),
    semanticMatchCount: Number(report.outputScan?.semanticMatchCount || 0),
    loaderAnchorCount: Number(report.outputScan?.loaderAnchorCount || 0),
    loaderMatchCount: Number(report.outputScan?.loaderMatchCount || 0),
    primaryDurationMs: Number(report.primaryAttempt?.durationMs || 0),
    fallbackDurationMs: Number(report.fallbackAttempt?.durationMs || 0),
  };
}

function summarizePreflight(report) {
  if (!report) {
    return {
      present: false,
      status: "missing",
      semanticDelta: null,
      toolVersion: null,
      growthRatio: null,
    };
  }

  return {
    present: true,
    status: String(report.status || "missing"),
    semanticDelta: report.semanticDelta || null,
    toolVersion: String(report.tool?.version || "").trim() || null,
    growthRatio: Number(report.attempt?.growthRatio || 0),
  };
}

function summarizeInnerAudit(report, expectedVariant = null) {
  if (!report) {
    return {
      present: false,
      status: "missing",
      rating: null,
      overlayEntryCount: 0,
      architectureAnchorCount: 0,
      moduleRecoveryAnchorCount: 0,
      decodeMethod: null,
      prepareDurationMs: 0,
    };
  }

  const variants = Array.isArray(report.variants) ? report.variants : [];
  const selected = variants.find((variant) => String(variant?.variant || "").trim() === String(expectedVariant || "").trim())
    || variants[0]
    || null;
  if (!selected) {
    return {
      present: false,
      status: "missing",
      rating: null,
      overlayEntryCount: 0,
      architectureAnchorCount: 0,
      moduleRecoveryAnchorCount: 0,
      decodeMethod: null,
      prepareDurationMs: 0,
    };
  }

  return {
    present: true,
    status: String(selected.status || report.status || "missing"),
    rating: String(selected.suggestedProxyLLMRating || "").trim() || null,
    overlayEntryCount: Number(selected.overlay?.entryCount || 0),
    architectureAnchorCount: Number(selected.innerSemanticScan?.architectureAnchorCount || 0),
    moduleRecoveryAnchorCount: Number(selected.moduleRecoveryScan?.totalAnchorCount || 0),
    decodeMethod: String(selected.packageProtection?.decodeMethod || "").trim() || null,
    prepareDurationMs: Number(selected.packageProtection?.prepareDurationMs || 0),
  };
}

function summarizeGuidedAttack(report) {
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
    };
  }

  return {
    present: true,
    rating: normalizeManualScorecardRating(report?.guidedAttack?.rating),
    resultTier: String(report?.guidedAttack?.resultTier || "").trim() || null,
    attackerTier: String(report?.guidedAttack?.attackerTier || "").trim() || null,
    aiTier: String(report?.guidedAttack?.aiTier || "").trim() || null,
    attackMethod: String(report?.guidedAttack?.attackMethod || "").trim() || null,
    timeBucket: String(report?.guidedAttack?.timeBucket || "").trim() || null,
    roundMode: String(report?.guidedAttack?.roundMode || "").trim() || null,
    relation: String(report?.comparison?.relation || "").trim() || null,
    nextAction: String(report?.nextAction || "").trim() || null,
  };
}

function normalizeGuidedAttackProfileKey(report) {
  const explicitProfileKey = String(
    report?.profileKey
    || report?.guidedAttack?.profileKey
    || "",
  ).trim();
  if (explicitProfileKey) {
    return explicitProfileKey;
  }
  return buildPackageProtectionGuidedAttackProfileKey(report?.guidedAttack || {});
}

function buildGuidedAttackProfileStrength(report) {
  const guidedAttack = report?.guidedAttack || {};
  return {
    attackerTier: Number(GUIDED_ATTACKER_TIER_ORDER[guidedAttack.attackerTier] ?? -1),
    aiTier: Number(GUIDED_AI_TIER_ORDER[guidedAttack.aiTier] ?? -1),
    attackMethod: Number(GUIDED_ATTACK_METHOD_ORDER[guidedAttack.attackMethod] ?? -1),
    roundMode: Number(GUIDED_ROUND_MODE_ORDER[guidedAttack.roundMode] ?? -1),
    timeBucket: Number(GUIDED_TIME_BUCKET_ORDER[guidedAttack.timeBucket] ?? -1),
    generatedAt: String(report?.generatedAt || ""),
  };
}

function compareGuidedAttackProfileStrength(left, right) {
  const leftStrength = buildGuidedAttackProfileStrength(left);
  const rightStrength = buildGuidedAttackProfileStrength(right);
  const keys = ["attackerTier", "aiTier", "attackMethod", "roundMode", "timeBucket"];
  for (const key of keys) {
    if (leftStrength[key] !== rightStrength[key]) {
      return leftStrength[key] - rightStrength[key];
    }
  }
  return leftStrength.generatedAt.localeCompare(rightStrength.generatedAt);
}

export function selectSharedGuidedAttackReports(guidedAggregateReport, options = {}) {
  const baseVariant = String(options.baseVariant || "shielded").trim();
  const candidateVariant = String(options.candidateVariant || "").trim();
  const channel = String(options.channel || "stable").trim();
  const baseFallbackReport = options.baseFallbackReport || null;
  const candidateFallbackReport = options.candidateFallbackReport || null;
  const reports = Array.isArray(guidedAggregateReport?.reports)
    ? guidedAggregateReport.reports
    : [];

  if (!candidateVariant || reports.length === 0) {
    return {
      source: "fallback-alias",
      selectedProfileKey: null,
      baseGuidedAttackReport: baseFallbackReport,
      candidateGuidedAttackReport: candidateFallbackReport,
    };
  }

  const baseReportsByProfile = new Map();
  const candidateReportsByProfile = new Map();

  reports.forEach((report) => {
    if (String(report?.channel || "").trim() !== channel) {
      return;
    }
    const variant = String(report?.variant || "").trim();
    const profileKey = normalizeGuidedAttackProfileKey(report);
    if (!profileKey) {
      return;
    }
    if (variant === baseVariant) {
      baseReportsByProfile.set(profileKey, report);
      return;
    }
    if (variant === candidateVariant) {
      candidateReportsByProfile.set(profileKey, report);
    }
  });

  const sharedReports = Array.from(baseReportsByProfile.entries())
    .filter(([profileKey]) => candidateReportsByProfile.has(profileKey))
    .map(([profileKey, baseReport]) => ({
      profileKey,
      baseReport,
      candidateReport: candidateReportsByProfile.get(profileKey),
    }));

  if (sharedReports.length === 0) {
    return {
      source: "fallback-alias",
      selectedProfileKey: null,
      baseGuidedAttackReport: baseFallbackReport,
      candidateGuidedAttackReport: candidateFallbackReport,
    };
  }

  sharedReports.sort((left, right) => {
    const strengthDelta = compareGuidedAttackProfileStrength(left.baseReport, right.baseReport);
    if (strengthDelta !== 0) {
      return -strengthDelta;
    }
    return String(right.profileKey || "").localeCompare(String(left.profileKey || ""));
  });

  const selected = sharedReports[0];
  return {
    source: "aggregate-shared",
    selectedProfileKey: selected.profileKey,
    baseGuidedAttackReport: selected.baseReport,
    candidateGuidedAttackReport: selected.candidateReport,
  };
}

function summarizeAuditComparison(variant, auditReport) {
  if (!auditReport) {
    return {
      present: false,
      sameRawSurface: null,
      rawAnchorDeltaCount: null,
      rawMatchDeltaCount: null,
      xpiSizeDeltaBytes: null,
      bundleSizeDeltaBytes: null,
      interpretation: "缺少 raw export 审计报告。",
    };
  }

  const normalizeMissingComparison = (comparison, fallbackInterpretation) => ({
    present: false,
    sameRawSurface: null,
    rawAnchorDeltaCount: null,
    rawMatchDeltaCount: null,
    sameUnpackedSurface: null,
    unpackedAnchorDeltaCount: null,
    unpackedMatchDeltaCount: null,
    xpiSizeDeltaBytes: null,
    bundleSizeDeltaBytes: null,
    interpretation: comparison?.interpretation || fallbackInterpretation,
    recommendedReading: comparison?.recommendedReading || null,
  });

  if (variant === "shielded-descriptor-bind") {
    const comparison = auditReport.descriptorBindComparison || null;
    return comparison?.present === true
      ? comparison
      : normalizeMissingComparison(comparison, "缺少 descriptor-bind 对比样本。");
  }

  if (variant === "shielded-pref-bridge") {
    const comparison = auditReport.prefBridgeComparison || null;
    return comparison?.present === true
      ? comparison
      : normalizeMissingComparison(comparison, "缺少 pref-bridge 对比样本。");
  }

  if (variant === "shielded-surface-scrub") {
    const comparison = auditReport.surfaceScrubComparison || null;
    return comparison?.present === true
      ? comparison
      : normalizeMissingComparison(comparison, "缺少 surface-scrub 对比样本。");
  }

  if (variant === "shielded-surface-scrub-wasm-digest") {
    const comparison = auditReport.surfaceScrubWasmDigestComparison || null;
    return comparison?.present === true
      ? comparison
      : normalizeMissingComparison(comparison, "缺少 surface-scrub-wasm-digest 对比样本。");
  }

  const comparison = auditReport.jsConfuserStringComparison || null;
  return comparison?.present === true
    ? comparison
    : normalizeMissingComparison(comparison, "缺少 jsconfuser-string 对比样本。");
}

function compareRatings(left, right) {
  const leftOrder = Object.prototype.hasOwnProperty.call(RATING_ORDER, left) ? RATING_ORDER[left] : null;
  const rightOrder = Object.prototype.hasOwnProperty.call(RATING_ORDER, right) ? RATING_ORDER[right] : null;
  if (leftOrder == null || rightOrder == null) {
    return null;
  }
  return leftOrder - rightOrder;
}

function compareGuidedResultTiers(left, right) {
  const normalizeTier = (value) => {
    const normalized = String(value || "").trim().toUpperCase();
    return /^R[0-4]$/u.test(normalized)
      ? Number.parseInt(normalized.slice(1), 10)
      : null;
  };

  const leftTier = normalizeTier(left);
  const rightTier = normalizeTier(right);
  if (leftTier == null || rightTier == null) {
    return null;
  }
  return leftTier - rightTier;
}

function hasUsablePreflightSemanticReduction(preflight) {
  if (preflight?.present !== true || preflight?.status !== "passed" || !preflight?.semanticDelta) {
    return false;
  }

  const inputAnchorCount = Number(preflight.semanticDelta.inputAnchorCount || 0);
  const outputAnchorCount = Number(preflight.semanticDelta.outputAnchorCount || 0);
  const reducedAnchorCount = Number(preflight.semanticDelta.reducedAnchorCount || 0);
  const reducedMatchCount = Number(preflight.semanticDelta.reducedMatchCount || 0);

  return reducedAnchorCount > 0
    || reducedMatchCount > 0
    || outputAnchorCount < inputAnchorCount;
}

function buildDeltas(baseSmoke, candidateSmoke, baseWebcrack, candidateWebcrack) {
  return {
    durationMs: Number(candidateSmoke.medianDurationMs || 0) - Number(baseSmoke.medianDurationMs || 0),
    xpiBytes: Number(candidateSmoke.xpiBytes || 0) - Number(baseSmoke.xpiBytes || 0),
    bundleBytes: Number(candidateSmoke.bundleBytes || 0) - Number(baseSmoke.bundleBytes || 0),
    decodeDurationMs: Number(candidateSmoke.medianDecodeDurationMs || 0) - Number(baseSmoke.medianDecodeDurationMs || 0),
    prepareDurationMs: Number(candidateSmoke.medianPrepareDurationMs || 0) - Number(baseSmoke.medianPrepareDurationMs || 0),
    webcrackLoaderAnchorDelta: candidateWebcrack.loaderAnchorCount == null || baseWebcrack.loaderAnchorCount == null
      ? null
      : Number(candidateWebcrack.loaderAnchorCount || 0) - Number(baseWebcrack.loaderAnchorCount || 0),
    webcrackSemanticAnchorDelta: candidateWebcrack.semanticAnchorCount == null || baseWebcrack.semanticAnchorCount == null
      ? null
      : Number(candidateWebcrack.semanticAnchorCount || 0) - Number(baseWebcrack.semanticAnchorCount || 0),
  };
}

function hasBoundedWasmDigestPerfDelta(baseSmoke, candidateSmoke) {
  const durationDelta = Number(candidateSmoke.medianDurationMs || 0) - Number(baseSmoke.medianDurationMs || 0);
  const prepareDelta = Number(candidateSmoke.medianPrepareDurationMs || 0) - Number(baseSmoke.medianPrepareDurationMs || 0);
  const decodeDelta = Number(candidateSmoke.medianDecodeDurationMs || 0) - Number(baseSmoke.medianDecodeDurationMs || 0);
  return durationDelta <= 150
    && prepareDelta <= 75
    && decodeDelta <= 75;
}

function hasDescriptorBindRuntimeSignals(candidateSmoke) {
  return candidateSmoke.hostBindingAvailableCount > 0
    && candidateSmoke.hostBindingDBAvailableCount > 0
    && candidateSmoke.hostBindingNoncePresentCount > 0
    && candidateSmoke.capabilityManifestOverlayAvailableCount > 0
    && candidateSmoke.capabilityManifestOverlayAppliedCount > 0
    && candidateSmoke.capabilityManifestActivationSatisfiedCount > 0
    && Number(candidateSmoke.capabilityManifestDetailLevels.full || 0) > 0;
}

function evaluateDescriptorBind({
  baseSmoke,
  candidateSmoke,
  baseWebcrack,
  candidateWebcrack,
  auditComparison,
  baseInnerAudit,
  candidateInnerAudit,
}) {
  if (!baseSmoke.present || !candidateSmoke.present) {
    return {
      status: "missing",
      decision: "missing-evidence",
      nextAction: "rerun-missing-artifacts",
      summary: "缺少 shielded 或 shielded-descriptor-bind 的 smoke 报告，无法比较。",
    };
  }

  if (
    baseSmoke.status !== "passed"
    || candidateSmoke.status !== "passed"
    || baseSmoke.automatedStatus !== "passed"
    || candidateSmoke.automatedStatus !== "passed"
  ) {
    return {
      status: "failed",
      decision: "regression",
      nextAction: "fix-runtime-regression",
      summary: "descriptor-bind 的 smoke/automated 结果没有保持通过，先修复运行时回归。",
    };
  }

  if (!hasDescriptorBindRuntimeSignals(candidateSmoke)) {
    return {
      status: "failed",
      decision: "regression",
      nextAction: "fix-runtime-regression",
      summary: "descriptor-bind 没有稳定回读到 host binding / overlay 激活信号，当前不能保留。",
    };
  }

  const webcrackDelta = compareRatings(candidateWebcrack.rating, baseWebcrack.rating);
  if (webcrackDelta != null && webcrackDelta > 0) {
    return {
      status: "attention",
      decision: "runtime-only",
      nextAction: "stop-current-candidate",
      summary: "descriptor-bind 的 runtime 语义恢复链路虽然成立，但 webcrack 自动评级更差，不值得继续扩面。",
    };
  }

  const rawSurfaceNote = auditComparison.present === true
    ? (auditComparison.sameRawSurface === true
        ? "raw surface 与基线一致，符合它“只做 runtime 语义恢复”的定位。"
        : "raw surface 与基线不同，需要额外复核它是否引入静态表面变化。")
    : "当前没有 fresh raw audit，但这不影响它作为 runtime-only 分支的结论。";
  const proxyLLMNote = baseInnerAudit.present && candidateInnerAudit.present
    ? (baseInnerAudit.rating !== candidateInnerAudit.rating
        ? `inner audit proxy 当前为 shielded=${baseInnerAudit.rating || "-"} / descriptor-bind=${candidateInnerAudit.rating || "-"}，更符合“runtime semantic recovery”而不是额外静态 hardening。`
        : `inner audit proxy 当前为 shielded=${baseInnerAudit.rating || "-"} / descriptor-bind=${candidateInnerAudit.rating || "-"}。`)
    : null;

  return {
    status: "passed",
    decision: "runtime-only",
    nextAction: "keep-runtime-only",
    summary: `descriptor-bind 已证明 host-binding-aware runtime descriptor recovery 可用；${rawSurfaceNote}${proxyLLMNote ? ` ${proxyLLMNote}` : ""}`,
  };
}

function evaluateJSConfuserString({
  baseSmoke,
  candidateSmoke,
  baseWebcrack,
  candidateWebcrack,
  auditComparison,
  preflight,
  baseInnerAudit,
  candidateInnerAudit,
  baseGuidedAttack,
  candidateGuidedAttack,
}) {
  if (!baseSmoke.present || !candidateSmoke.present || !baseWebcrack.present || !candidateWebcrack.present) {
    return {
      status: "missing",
      decision: "missing-evidence",
      nextAction: "rerun-missing-artifacts",
      summary: "缺少 shielded / shielded-jsconfuser-string 的 smoke 或 webcrack 报告，无法做 A/B 比较。",
    };
  }

  if (
    baseSmoke.status !== "passed"
    || candidateSmoke.status !== "passed"
    || baseSmoke.automatedStatus !== "passed"
    || candidateSmoke.automatedStatus !== "passed"
    || baseWebcrack.status !== "passed"
    || candidateWebcrack.status !== "passed"
  ) {
    return {
      status: "failed",
      decision: "regression",
      nextAction: "fix-runtime-regression",
      summary: "jsconfuser-string 的 smoke / automated / webcrack 至少有一项未通过，先修复实验回归。",
    };
  }

  const candidateLLM = candidateSmoke.llmSinglePassResult;
  const baseLLM = baseSmoke.llmSinglePassResult;
  if (!candidateLLM || !baseLLM) {
    const proxyNote = baseInnerAudit.present && candidateInnerAudit.present
      ? `inner audit proxy 当前为 shielded=${baseInnerAudit.rating || "-"} / jsconfuser-string=${candidateInnerAudit.rating || "-"}.`
      : "当前还没有对称的 inner audit proxy。";
    const preflightNote = hasUsablePreflightSemanticReduction(preflight)
      ? `preflight 已显示 ${preflight.semanticDelta.inputAnchorCount || 0} -> ${preflight.semanticDelta.outputAnchorCount || 0} 的语义锚点压缩，但 stable 产物还缺对称的 LLM 单轮评分。${proxyNote}`
      : preflight.present === true
        ? `preflight 当前还没有给出可用的语义压缩证据，但 stable 产物还缺对称的 LLM 单轮评分。${proxyNote}`
      : "当前仍缺对称的 LLM 单轮评分。";
    return {
      status: "attention",
      decision: "needs-manual-ab",
      nextAction: "collect-llm-score",
      summary: `jsconfuser-string 的 runtime 与 webcrack 都已通过；${preflightNote}`,
    };
  }

  const llmDelta = compareRatings(candidateLLM, baseLLM);
  const webcrackDelta = compareRatings(candidateWebcrack.rating, baseWebcrack.rating);
  const guidedRatingDelta = compareRatings(candidateGuidedAttack.rating, baseGuidedAttack.rating);
  const guidedResultTierDelta = compareGuidedResultTiers(candidateGuidedAttack.resultTier, baseGuidedAttack.resultTier);
  const candidateSinglePassBetter = (llmDelta != null && llmDelta < 0) || (llmDelta === 0 && webcrackDelta != null && webcrackDelta < 0);
  const guidedSymmetryPresent = baseGuidedAttack.present && candidateGuidedAttack.present;
  const guidedCandidateBetter = (guidedRatingDelta != null && guidedRatingDelta < 0)
    || (guidedRatingDelta === 0 && guidedResultTierDelta != null && guidedResultTierDelta < 0);
  const guidedCandidateSameOrWorse = guidedSymmetryPresent && !guidedCandidateBetter;

  if (candidateSinglePassBetter && baseGuidedAttack.present && !candidateGuidedAttack.present) {
    return {
      status: "attention",
      decision: "needs-manual-ab",
      nextAction: "collect-guided-attack",
      summary: "jsconfuser-string 虽然在单轮 LLM 上优于基线，但当前还缺少与 shielded 对称的 guided-attack 证据，不能直接升级为 hardening-win。",
    };
  }

  if (candidateSinglePassBetter && guidedSymmetryPresent && guidedCandidateSameOrWorse) {
    return {
      status: "attention",
      decision: "leaning-same",
      nextAction: "stop-current-candidate",
      summary: "jsconfuser-string 的单轮 LLM 阻力更高，但对称 guided-attack 仍落在与 shielded 相同的恢复层级，当前按 leaning-same 处理更稳妥。",
    };
  }

  if ((llmDelta != null && llmDelta < 0) || (llmDelta === 0 && webcrackDelta != null && webcrackDelta < 0)) {
    return {
      status: "passed",
      decision: "hardening-win",
      nextAction: "promote-experimental-candidate",
      summary: "jsconfuser-string 在当前威胁模型下比基线 shielded 有更好的单轮自动化解读阻力，可以继续保留为候选增强路线。",
    };
  }

  if ((llmDelta != null && llmDelta > 0) || (webcrackDelta != null && webcrackDelta > 0)) {
    return {
      status: "attention",
      decision: "regression",
      nextAction: "stop-current-candidate",
      summary: "jsconfuser-string 的自动化解读评级没有优于基线，且至少一侧更差，当前不值得继续投入。",
    };
  }

  const sameRawSurface = auditComparison.present === true && auditComparison.sameRawSurface === true;
  const sizeNote = sameRawSurface
    ? "raw surface 与基线一致，额外膨胀目前主要停留在 inner suppression。"
    : "当前 raw audit 不能证明它带来更好的静态表面收益。";

  return {
    status: "attention",
    decision: "leaning-same",
    nextAction: "stop-current-candidate",
    summary: `jsconfuser-string 当前看起来与基线 shielded 的单轮可读性基本相同；${sizeNote}`,
  };
}

function evaluatePrefBridge({
  baseSmoke,
  candidateSmoke,
  baseWebcrack,
  candidateWebcrack,
  auditComparison,
  baseInnerAudit,
  candidateInnerAudit,
}) {
  if (!baseSmoke.present || !candidateSmoke.present || !baseWebcrack.present || !candidateWebcrack.present) {
    return {
      status: "missing",
      decision: "missing-evidence",
      nextAction: "rerun-missing-artifacts",
      summary: "缺少 shielded / shielded-pref-bridge 的 smoke 或 webcrack 报告，无法做 A/B 比较。",
    };
  }

  if (
    baseSmoke.status !== "passed"
    || candidateSmoke.status !== "passed"
    || baseSmoke.automatedStatus !== "passed"
    || candidateSmoke.automatedStatus !== "passed"
  ) {
    return {
      status: "failed",
      decision: "regression",
      nextAction: "fix-runtime-regression",
      summary: "pref-bridge 的 smoke/automated 结果没有保持通过，先修复运行时回归。",
    };
  }

  const webcrackDelta = compareRatings(candidateWebcrack.rating, baseWebcrack.rating);
  const innerDelta = compareRatings(candidateInnerAudit.rating, baseInnerAudit.rating);
  if ((webcrackDelta != null && webcrackDelta > 0) || (innerDelta != null && innerDelta > 0)) {
    return {
      status: "attention",
      decision: "regression",
      nextAction: "stop-current-candidate",
      summary: "pref-bridge 没有保持与基线 shielded 相同的自动化解读阻力，当前不值得继续升级。",
    };
  }

  if (auditComparison.present !== true) {
    return {
      status: "attention",
      decision: "missing-evidence",
      nextAction: "collect-anchor-audit",
      summary: "pref-bridge 缺少最终 XPI 静态面审计证据，当前还不能判断它是否真的降低了解包后可读性。",
    };
  }

  const unpackedAnchorDelta = Number(auditComparison.unpackedAnchorDeltaCount || 0);
  const unpackedMatchDelta = Number(auditComparison.unpackedMatchDeltaCount || 0);
  const unpackedImproved = unpackedAnchorDelta < 0 || unpackedMatchDelta < 0;
  if (unpackedImproved) {
    return {
      status: "passed",
      decision: "hardening-win",
      nextAction: "promote-experimental-candidate",
      summary: "pref-bridge 在保持 shielded 级别自动化阻力的同时，进一步压缩了最终 XPI 的静态 support surface，可继续保留为低风险 hardening 候选。",
    };
  }

  return {
    status: "attention",
    decision: "leaning-same",
    nextAction: "stop-current-candidate",
    summary: "pref-bridge 当前没有证明自己比基线 shielded 更难静态直读，继续保留优先级不高。",
  };
}

function evaluateSurfaceScrub({
  baseSmoke,
  candidateSmoke,
  baseWebcrack,
  candidateWebcrack,
  auditComparison,
  baseInnerAudit,
  candidateInnerAudit,
}) {
  if (!baseSmoke.present || !candidateSmoke.present || !baseWebcrack.present || !candidateWebcrack.present) {
    return {
      status: "missing",
      decision: "missing-evidence",
      nextAction: "rerun-missing-artifacts",
      summary: "缺少 shielded / shielded-surface-scrub 的 smoke 或 webcrack 报告，无法做 A/B 比较。",
    };
  }

  if (
    baseSmoke.status !== "passed"
    || candidateSmoke.status !== "passed"
    || baseSmoke.automatedStatus !== "passed"
    || candidateSmoke.automatedStatus !== "passed"
  ) {
    return {
      status: "failed",
      decision: "regression",
      nextAction: "fix-runtime-regression",
      summary: "surface-scrub 的 smoke/automated 结果没有保持通过，先修复运行时回归。",
    };
  }

  const webcrackDelta = compareRatings(candidateWebcrack.rating, baseWebcrack.rating);
  const innerDelta = compareRatings(candidateInnerAudit.rating, baseInnerAudit.rating);
  if ((webcrackDelta != null && webcrackDelta > 0) || (innerDelta != null && innerDelta > 0)) {
    return {
      status: "attention",
      decision: "regression",
      nextAction: "stop-current-candidate",
      summary: "surface-scrub 没有保持与基线 shielded 相同的自动化解读阻力，当前不值得继续升级。",
    };
  }

  if (auditComparison.present !== true) {
    return {
      status: "attention",
      decision: "missing-evidence",
      nextAction: "collect-anchor-audit",
      summary: "surface-scrub 缺少最终 XPI 静态面审计证据，当前还不能判断它是否真的降低了解包后可读性。",
    };
  }

  const unpackedAnchorDelta = Number(auditComparison.unpackedAnchorDeltaCount || 0);
  const unpackedMatchDelta = Number(auditComparison.unpackedMatchDeltaCount || 0);
  const unpackedImproved = unpackedAnchorDelta < 0 || unpackedMatchDelta < 0;
  if (unpackedImproved) {
    const floorNote = auditComparison.residualFloorReached === true
      ? " 当前剩余静态暴露已收敛到 manifest 兼容性下限，只剩 addonVersion / update_url。"
      : "";
    return {
      status: "passed",
      decision: "hardening-win",
      nextAction: "promote-experimental-candidate",
      summary: `surface-scrub 在保持 shielded 级别自动化阻力的同时，继续压缩了最终 XPI 的静态 support surface，可进入 retained hardening review。${floorNote}`,
    };
  }

  return {
    status: "attention",
    decision: "leaning-same",
    nextAction: "stop-current-candidate",
    summary: "surface-scrub 当前没有证明自己比基线 shielded 更难静态直读，继续保留优先级不高。",
  };
}

function evaluateSurfaceScrubWasmDigest({
  baseSmoke,
  candidateSmoke,
  baseWebcrack,
  candidateWebcrack,
  auditComparison,
  baseInnerAudit,
  candidateInnerAudit,
  baseGuidedAttack,
  candidateGuidedAttack,
}) {
  if (!baseSmoke.present || !candidateSmoke.present || !baseWebcrack.present || !candidateWebcrack.present) {
    return {
      status: "missing",
      decision: "missing-evidence",
      nextAction: "rerun-missing-artifacts",
      summary: "缺少 shielded-surface-scrub / shielded-surface-scrub-wasm-digest 的 smoke 或 webcrack 报告，无法做 A/B 比较。",
    };
  }

  if (
    baseSmoke.status !== "passed"
    || candidateSmoke.status !== "passed"
    || baseSmoke.automatedStatus !== "passed"
    || candidateSmoke.automatedStatus !== "passed"
  ) {
    return {
      status: "failed",
      decision: "regression",
      nextAction: "fix-runtime-regression",
      summary: "surface-scrub-wasm-digest 的 smoke/automated 结果没有保持通过，先修复运行时回归。",
    };
  }

  const webcrackDelta = compareRatings(candidateWebcrack.rating, baseWebcrack.rating);
  const innerDelta = compareRatings(candidateInnerAudit.rating, baseInnerAudit.rating);
  const llmDelta = compareRatings(candidateSmoke.llmSinglePassResult, baseSmoke.llmSinglePassResult);
  const guidedRatingDelta = compareRatings(candidateGuidedAttack.rating, baseGuidedAttack.rating);
  const guidedResultTierDelta = compareGuidedResultTiers(candidateGuidedAttack.resultTier, baseGuidedAttack.resultTier);

  if (
    (webcrackDelta != null && webcrackDelta > 0)
    || (innerDelta != null && innerDelta > 0)
    || (llmDelta != null && llmDelta > 0)
    || (guidedRatingDelta != null && guidedRatingDelta > 0)
    || (guidedResultTierDelta != null && guidedResultTierDelta > 0)
  ) {
    return {
      status: "attention",
      decision: "regression",
      nextAction: "stop-current-candidate",
      summary: "surface-scrub-wasm-digest 没有保持与 surface-scrub 相同的自动化解读阻力，当前不继续推进。",
    };
  }

  if (auditComparison.present !== true) {
    return {
      status: "attention",
      decision: "missing-evidence",
      nextAction: "collect-anchor-audit",
      summary: "surface-scrub-wasm-digest 缺少静态暴露边界审计，当前还不能判断 Wasm 候选是否越界。",
    };
  }

  if (auditComparison.packageBoundaryWithinWasmAssets !== true) {
    return {
      status: "attention",
      decision: "regression",
      nextAction: "stop-current-candidate",
      summary: "surface-scrub-wasm-digest 新增 package-boundary 暴露超出了 content/lib/w/* 资产边界，按设计越界处理。",
    };
  }

  if (!hasBoundedWasmDigestPerfDelta(baseSmoke, candidateSmoke)) {
    return {
      status: "attention",
      decision: "regression",
      nextAction: "stop-current-candidate",
      summary: "surface-scrub-wasm-digest 相对 surface-scrub 出现了体感级启动回退风险，当前不继续沿 protection 主线推进。",
    };
  }

  const addedAssets = Array.isArray(auditComparison.newExposedFiles) && auditComparison.newExposedFiles.length > 0
    ? `新增 package-boundary 暴露仅限 ${auditComparison.newExposedFiles.join(", ")}。`
    : "当前没有观测到超出 surface-scrub 的新增 package-boundary 暴露。";

  return {
    status: "passed",
    decision: "hardening-win",
    nextAction: "promote-experimental-candidate",
    summary: `surface-scrub-wasm-digest 保持了与 surface-scrub 相同的自动化解读阻力，且新增静态暴露仍受限于 content/lib/w/* 的 digest micro-kernel 资产边界。${addedAssets}`,
  };
}

export function summarizePackageProtectionExperimentCompare({
  variant,
  channel = "stable",
  baseSmokeReport = null,
  candidateSmokeReport = null,
  baseWebcrackReport = null,
  candidateWebcrackReport = null,
  auditReport = null,
  preflightReport = null,
  baseInnerAuditReport = null,
  candidateInnerAuditReport = null,
  baseGuidedAttackReport = null,
  candidateGuidedAttackReport = null,
} = {}) {
  const normalizedVariant = normalizeVariant(variant);
  const normalizedChannel = normalizeChannel(channel) || "stable";
  const baseVariant = resolvePackageProtectionExperimentCompareBaseVariant(normalizedVariant);
  assertScript(Boolean(normalizedVariant), "variant must be one of shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest", {
    category: "args",
    failedStage: "summarize-compare",
  });

  const baseSmoke = summarizeSmoke(baseSmokeReport);
  const candidateSmoke = summarizeSmoke(candidateSmokeReport);
  const baseWebcrack = summarizeWebcrack(baseWebcrackReport);
  const candidateWebcrack = summarizeWebcrack(candidateWebcrackReport);
  const auditComparison = summarizeAuditComparison(normalizedVariant, auditReport);
  const preflight = normalizedVariant === "shielded-jsconfuser-string"
    ? summarizePreflight(preflightReport)
    : summarizePreflight(null);
  const baseInnerAudit = summarizeInnerAudit(baseInnerAuditReport, baseVariant);
  const candidateInnerAudit = summarizeInnerAudit(candidateInnerAuditReport, normalizedVariant);
  const baseGuidedAttack = summarizeGuidedAttack(baseGuidedAttackReport);
  const candidateGuidedAttack = summarizeGuidedAttack(candidateGuidedAttackReport);
  const deltas = buildDeltas(baseSmoke, candidateSmoke, baseWebcrack, candidateWebcrack);

  const evaluation = normalizedVariant === "shielded-descriptor-bind"
    ? evaluateDescriptorBind({
      baseSmoke,
      candidateSmoke,
      baseWebcrack,
      candidateWebcrack,
      auditComparison,
      baseInnerAudit,
      candidateInnerAudit,
    })
    : normalizedVariant === "shielded-pref-bridge"
      ? evaluatePrefBridge({
        baseSmoke,
        candidateSmoke,
        baseWebcrack,
        candidateWebcrack,
        auditComparison,
        baseInnerAudit,
        candidateInnerAudit,
      })
      : normalizedVariant === "shielded-surface-scrub"
        ? evaluateSurfaceScrub({
          baseSmoke,
          candidateSmoke,
          baseWebcrack,
          candidateWebcrack,
          auditComparison,
          baseInnerAudit,
          candidateInnerAudit,
        })
        : normalizedVariant === "shielded-surface-scrub-wasm-digest"
          ? evaluateSurfaceScrubWasmDigest({
            baseSmoke,
            candidateSmoke,
            baseWebcrack,
            candidateWebcrack,
            auditComparison,
            baseInnerAudit,
            candidateInnerAudit,
            baseGuidedAttack,
            candidateGuidedAttack,
          })
      : evaluateJSConfuserString({
        baseSmoke,
        candidateSmoke,
        baseWebcrack,
        candidateWebcrack,
        auditComparison,
        preflight,
        baseInnerAudit,
        candidateInnerAudit,
        baseGuidedAttack,
        candidateGuidedAttack,
      });

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    baseVariant,
    variant: normalizedVariant,
    channel: normalizedChannel,
    status: evaluation.status,
    statusLabel: STATUS_LABELS[evaluation.status] || STATUS_LABELS.attention,
    decision: evaluation.decision,
    decisionLabel: DECISION_LABELS[evaluation.decision] || evaluation.decision,
    summary: evaluation.summary,
    nextAction: evaluation.nextAction,
    evidence: {
      smokeComplete: baseSmoke.present && candidateSmoke.present,
      webcrackComplete: baseWebcrack.present && candidateWebcrack.present,
      auditPresent: auditComparison.present === true,
      preflightPresent: preflight.present === true,
      llmSymmetryComplete: Boolean(baseSmoke.llmSinglePassResult && candidateSmoke.llmSinglePassResult),
      innerAuditComplete: baseInnerAudit.present && candidateInnerAudit.present,
      guidedAttackSymmetryComplete: baseGuidedAttack.present && candidateGuidedAttack.present,
    },
    base: {
      smoke: baseSmoke,
      webcrack: baseWebcrack,
      innerAudit: baseInnerAudit,
      guidedAttack: baseGuidedAttack,
    },
    candidate: {
      smoke: candidateSmoke,
      webcrack: candidateWebcrack,
      innerAudit: candidateInnerAudit,
      guidedAttack: candidateGuidedAttack,
    },
    deltas,
    auditComparison,
    preflight,
  };
}

export function renderPackageProtectionExperimentCompareMarkdown(report) {
  const lines = [
    "# Package Protection Experiment Compare",
    "",
    `- 生成时间: \`${report.generatedAt}\``,
    `- baseVariant: \`${report.baseVariant}\``,
    `- variant: \`${report.variant}\``,
    `- channel: \`${report.channel}\``,
    `- 状态: \`${report.statusLabel}\``,
    `- decision: \`${report.decisionLabel}\``,
    `- nextAction: \`${report.nextAction}\``,
    `- 摘要: ${report.summary}`,
    "",
    "## Evidence",
    "",
    `- smokeComplete: \`${report.evidence.smokeComplete ? "yes" : "no"}\``,
    `- webcrackComplete: \`${report.evidence.webcrackComplete ? "yes" : "no"}\``,
    `- auditPresent: \`${report.evidence.auditPresent ? "yes" : "no"}\``,
    `- preflightPresent: \`${report.evidence.preflightPresent ? "yes" : "no"}\``,
    `- llmSymmetryComplete: \`${report.evidence.llmSymmetryComplete ? "yes" : "no"}\``,
    `- innerAuditComplete: \`${report.evidence.innerAuditComplete ? "yes" : "no"}\``,
    `- guidedAttackSymmetryComplete: \`${report.evidence.guidedAttackSymmetryComplete ? "yes" : "no"}\``,
    "",
    "## Base",
    "",
    `- smokeStatus: \`${report.base.smoke.status}\``,
    `- automatedStatus: \`${report.base.smoke.automatedStatus}\``,
    `- webcrackStatus: \`${report.base.webcrack.status}\``,
    `- webcrackRating: \`${report.base.webcrack.rating || "-"}\``,
    `- llmSinglePassResult: \`${report.base.smoke.llmSinglePassResult || "-"}\``,
    `- proxyLLMRating: \`${report.base.innerAudit.rating || "-"}\``,
    `- guidedAttackRating/resultTier: \`${report.base.guidedAttack.rating || "-"} / ${report.base.guidedAttack.resultTier || "-"}\``,
    `- xpiBytes: \`${report.base.smoke.xpiBytes}\``,
    `- bundleBytes: \`${report.base.smoke.bundleBytes}\``,
    `- medianDecodeDurationMs: \`${report.base.smoke.medianDecodeDurationMs}\``,
    `- medianPrepareDurationMs: \`${report.base.smoke.medianPrepareDurationMs}\``,
    "",
    "## Candidate",
    "",
    `- smokeStatus: \`${report.candidate.smoke.status}\``,
    `- automatedStatus: \`${report.candidate.smoke.automatedStatus}\``,
    `- webcrackStatus: \`${report.candidate.webcrack.status}\``,
    `- webcrackRating: \`${report.candidate.webcrack.rating || "-"}\``,
    `- llmSinglePassResult: \`${report.candidate.smoke.llmSinglePassResult || "-"}\``,
    `- proxyLLMRating: \`${report.candidate.innerAudit.rating || "-"}\``,
    `- guidedAttackRating/resultTier: \`${report.candidate.guidedAttack.rating || "-"} / ${report.candidate.guidedAttack.resultTier || "-"}\``,
    `- xpiBytes: \`${report.candidate.smoke.xpiBytes}\``,
    `- bundleBytes: \`${report.candidate.smoke.bundleBytes}\``,
    `- medianDecodeDurationMs: \`${report.candidate.smoke.medianDecodeDurationMs}\``,
    `- medianPrepareDurationMs: \`${report.candidate.smoke.medianPrepareDurationMs}\``,
    "",
    "## Deltas",
    "",
    `- durationMs: \`${report.deltas.durationMs}\``,
    `- xpiBytes: \`${report.deltas.xpiBytes}\``,
    `- bundleBytes: \`${report.deltas.bundleBytes}\``,
    `- decodeDurationMs: \`${report.deltas.decodeDurationMs}\``,
    `- prepareDurationMs: \`${report.deltas.prepareDurationMs}\``,
    `- webcrackLoaderAnchorDelta: \`${report.deltas.webcrackLoaderAnchorDelta ?? "-"}\``,
    `- webcrackSemanticAnchorDelta: \`${report.deltas.webcrackSemanticAnchorDelta ?? "-"}\``,
    "",
    "## Audit",
    "",
    `- present: \`${report.auditComparison.present ? "yes" : "no"}\``,
    `- sameRawSurface: \`${report.auditComparison.sameRawSurface == null ? "-" : (report.auditComparison.sameRawSurface ? "yes" : "no")}\``,
    `- rawAnchorDeltaCount: \`${report.auditComparison.rawAnchorDeltaCount ?? "-"}\``,
    `- rawMatchDeltaCount: \`${report.auditComparison.rawMatchDeltaCount ?? "-"}\``,
    `- sameUnpackedSurface: \`${report.auditComparison.sameUnpackedSurface == null ? "-" : (report.auditComparison.sameUnpackedSurface ? "yes" : "no")}\``,
    `- unpackedAnchorDeltaCount: \`${report.auditComparison.unpackedAnchorDeltaCount ?? "-"}\``,
    `- unpackedMatchDeltaCount: \`${report.auditComparison.unpackedMatchDeltaCount ?? "-"}\``,
    `- residualFloorReached: \`${report.auditComparison.residualFloorReached === true ? "yes" : "no"}\``,
    `- residualExposedFiles: \`${(report.auditComparison.residualExposedFiles || []).join(", ") || "-"}\``,
    `- residualAnchorIds: \`${(report.auditComparison.residualAnchorIds || []).join(", ") || "-"}\``,
    `- packageBoundaryWithinWasmAssets: \`${report.auditComparison.packageBoundaryWithinWasmAssets == null ? "-" : (report.auditComparison.packageBoundaryWithinWasmAssets ? "yes" : "no")}\``,
    `- newExposedFiles: \`${(report.auditComparison.newExposedFiles || []).join(", ") || "-"}\``,
    `- unexpectedExposedFiles: \`${(report.auditComparison.unexpectedExposedFiles || []).join(", ") || "-"}\``,
    `- interpretation: ${report.auditComparison.interpretation || "-"}`,
  ];

  if (report.preflight.present) {
    lines.push("");
    lines.push("## Preflight");
    lines.push("");
    lines.push(`- status: \`${report.preflight.status}\``);
    lines.push(`- toolVersion: \`${report.preflight.toolVersion || "-"}\``);
    lines.push(`- growthRatio: \`${report.preflight.growthRatio}\``);
    lines.push(`- inputAnchorCount: \`${report.preflight.semanticDelta?.inputAnchorCount ?? "-"}\``);
    lines.push(`- outputAnchorCount: \`${report.preflight.semanticDelta?.outputAnchorCount ?? "-"}\``);
    lines.push(`- reducedAnchorCount: \`${report.preflight.semanticDelta?.reducedAnchorCount ?? "-"}\``);
  }

  return lines.join("\n");
}

export async function persistPackageProtectionExperimentCompare(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const reportDir = resolveAgentArtifactPath(projectRootPath, "package-protection-compare");
  const reportBase = `${report.variant}-vs-${report.baseVariant}-${report.channel}`;
  const reportPath = path.join(reportDir, `${reportBase}.json`);
  const reportMDPath = path.join(reportDir, `${reportBase}.md`);

  await fs.mkdir(reportDir, { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionExperimentCompareMarkdown(report)}\n`, "utf-8"),
  ]);

  return {
    reportPath,
    reportMDPath,
  };
}

async function readOptionalJSON(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return null;
  }
  return readJSONFile(filePath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-optional-report",
    label: filePath,
  });
}

async function loadPackageProtectionExperimentCompareInputs(projectRootPath, variant, channel) {
  const baseVariant = resolvePackageProtectionExperimentCompareBaseVariant(variant);
  const baseSmokeReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-smoke", `${baseVariant}-${channel}.json`),
  );
  const candidateSmokeReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-smoke", `${variant}-${channel}.json`),
  );
  const baseWebcrackReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-webcrack", `${baseVariant}-${channel}.json`),
  );
  const candidateWebcrackReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-webcrack", `${variant}-${channel}.json`),
  );
  const auditReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-anchor-audit.json"),
  );
  const preflightReport = variant === "shielded-jsconfuser-string"
    ? await readOptionalJSON(resolveAgentArtifactPath(projectRootPath, "package-protection-jsconfuser-string-preflight.json"))
    : null;
  const baseInnerAuditReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-inner-audit", `${baseVariant}-${channel}.json`),
  );
  const candidateInnerAuditReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-inner-audit", `${variant}-${channel}.json`),
  );
  const guidedAttackAggregateReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-guided-attack.json"),
  );
  const baseGuidedAttackAliasReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-guided-attack", `${baseVariant}-${channel}.json`),
  );
  const candidateGuidedAttackAliasReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-guided-attack", `${variant}-${channel}.json`),
  );
  const guidedAttackSelection = selectSharedGuidedAttackReports(guidedAttackAggregateReport, {
    baseVariant,
    candidateVariant: variant,
    channel,
    baseFallbackReport: baseGuidedAttackAliasReport,
    candidateFallbackReport: candidateGuidedAttackAliasReport,
  });

  return {
    baseSmokeReport,
    candidateSmokeReport,
    baseWebcrackReport,
    candidateWebcrackReport,
    auditReport,
    preflightReport,
    baseInnerAuditReport,
    candidateInnerAuditReport,
    baseGuidedAttackReport: guidedAttackSelection.baseGuidedAttackReport,
    candidateGuidedAttackReport: guidedAttackSelection.candidateGuidedAttackReport,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionExperimentCompareArgs(argv);
  const inputs = await loadPackageProtectionExperimentCompareInputs(projectRoot, options.variant, options.channel);
  const report = summarizePackageProtectionExperimentCompare({
    variant: options.variant,
    channel: options.channel,
    ...inputs,
  });
  const paths = await persistPackageProtectionExperimentCompare(report);
  console.log(`Package protection compare generated: ${paths.reportPath}`);
  if (report.status === "failed" || report.status === "missing") {
    process.exitCode = 2;
  }
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
