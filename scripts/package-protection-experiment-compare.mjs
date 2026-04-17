import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import { normalizePackageProtectionSmokeReport } from "./package-protection-smoke.mjs";
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

function normalizeVariant(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "descriptor-bind") {
    return "shielded-descriptor-bind";
  }
  if (normalized === "jsconfuser-string") {
    return "shielded-jsconfuser-string";
  }
  return PACKAGE_PROTECTION_EXPERIMENT_COMPARE_VARIANTS.includes(normalized)
    ? normalized
    : null;
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

  assertScript(Boolean(options.variant), "--variant must be one of shielded-descriptor-bind|shielded-jsconfuser-string", {
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

function buildDeltas(baseSmoke, candidateSmoke, baseWebcrack, candidateWebcrack) {
  return {
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

function hasDescriptorBindRuntimeSignals(candidateSmoke) {
  return candidateSmoke.hostBindingAvailableCount > 0
    && candidateSmoke.hostBindingDBAvailableCount > 0
    && candidateSmoke.hostBindingNoncePresentCount > 0
    && candidateSmoke.capabilityManifestOverlayAvailableCount > 0
    && candidateSmoke.capabilityManifestOverlayAppliedCount > 0
    && candidateSmoke.capabilityManifestActivationSatisfiedCount > 0
    && Number(candidateSmoke.capabilityManifestDetailLevels.full || 0) > 0;
}

function evaluateDescriptorBind({ baseSmoke, candidateSmoke, baseWebcrack, candidateWebcrack, auditComparison }) {
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

  return {
    status: "passed",
    decision: "runtime-only",
    nextAction: "keep-runtime-only",
    summary: `descriptor-bind 已证明 host-binding-aware runtime descriptor recovery 可用；${rawSurfaceNote}`,
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
    const preflightNote = preflight.present === true && preflight.semanticDelta
      ? `preflight 已显示 ${preflight.semanticDelta.inputAnchorCount || 0} -> ${preflight.semanticDelta.outputAnchorCount || 0} 的语义锚点压缩，但 stable 产物还缺对称的 LLM 单轮评分。${proxyNote}`
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
} = {}) {
  const normalizedVariant = normalizeVariant(variant);
  const normalizedChannel = normalizeChannel(channel) || "stable";
  assertScript(Boolean(normalizedVariant), "variant must be one of shielded-descriptor-bind|shielded-jsconfuser-string", {
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
  const baseInnerAudit = summarizeInnerAudit(baseInnerAuditReport, "shielded");
  const candidateInnerAudit = summarizeInnerAudit(candidateInnerAuditReport, normalizedVariant);
  const deltas = buildDeltas(baseSmoke, candidateSmoke, baseWebcrack, candidateWebcrack);

  const evaluation = normalizedVariant === "shielded-descriptor-bind"
    ? evaluateDescriptorBind({
      baseSmoke,
      candidateSmoke,
      baseWebcrack,
      candidateWebcrack,
      auditComparison,
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
    });

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    baseVariant: "shielded",
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
    },
    base: {
      smoke: baseSmoke,
      webcrack: baseWebcrack,
      innerAudit: baseInnerAudit,
    },
    candidate: {
      smoke: candidateSmoke,
      webcrack: candidateWebcrack,
      innerAudit: candidateInnerAudit,
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
    "",
    "## Base",
    "",
    `- smokeStatus: \`${report.base.smoke.status}\``,
    `- automatedStatus: \`${report.base.smoke.automatedStatus}\``,
    `- webcrackStatus: \`${report.base.webcrack.status}\``,
    `- webcrackRating: \`${report.base.webcrack.rating || "-"}\``,
    `- llmSinglePassResult: \`${report.base.smoke.llmSinglePassResult || "-"}\``,
    `- proxyLLMRating: \`${report.base.innerAudit.rating || "-"}\``,
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
    `- xpiBytes: \`${report.candidate.smoke.xpiBytes}\``,
    `- bundleBytes: \`${report.candidate.smoke.bundleBytes}\``,
    `- medianDecodeDurationMs: \`${report.candidate.smoke.medianDecodeDurationMs}\``,
    `- medianPrepareDurationMs: \`${report.candidate.smoke.medianPrepareDurationMs}\``,
    "",
    "## Deltas",
    "",
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
  const baseSmokeReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-smoke", `shielded-${channel}.json`),
  );
  const candidateSmokeReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-smoke", `${variant}-${channel}.json`),
  );
  const baseWebcrackReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-webcrack", `shielded-${channel}.json`),
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
    resolveAgentArtifactPath(projectRootPath, "package-protection-inner-audit", `shielded-${channel}.json`),
  );
  const candidateInnerAuditReport = await readOptionalJSON(
    resolveAgentArtifactPath(projectRootPath, "package-protection-inner-audit", `${variant}-${channel}.json`),
  );

  return {
    baseSmokeReport,
    candidateSmokeReport,
    baseWebcrackReport,
    candidateWebcrackReport,
    auditReport,
    preflightReport,
    baseInnerAuditReport,
    candidateInnerAuditReport,
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
