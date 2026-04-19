import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  buildScriptFailureInfo,
  isExecutedAsScript,
  readJSONFile,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

const STATUS_LABELS = Object.freeze({
  passed: "通过",
  attention: "关注",
  failed: "失败",
  missing: "缺失",
});

const RETAINED_REVIEW_TASK_KINDS = Object.freeze([
  "review-experimental-hardening",
  "collect-experimental-llm-symmetry-evidence",
]);

function normalizeNonEmptyString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveCompareBaseVariant(variant) {
  return normalizeNonEmptyString(variant) === "shielded-surface-scrub-wasm-digest"
    || normalizeNonEmptyString(variant) === "shielded-surface-scrub-wasm-stage2-derive"
    ? "shielded-surface-scrub"
    : "shielded";
}

function normalizeReviewTask(task = {}) {
  return {
    id: normalizeNonEmptyString(task?.id),
    candidateId: normalizeNonEmptyString(task?.candidateId),
    variant: normalizeNonEmptyString(task?.variant),
    channel: normalizeNonEmptyString(task?.channel) || "stable",
    kind: normalizeNonEmptyString(task?.kind),
    reviewRank: normalizeFiniteNumber(task?.reviewRank),
    summary: normalizeNonEmptyString(task?.summary),
    rationale: normalizeNonEmptyString(task?.rationale),
    reviewPriority: {
      compareStatus: normalizeNonEmptyString(task?.reviewPriority?.compareStatus),
      compareDecision: normalizeNonEmptyString(task?.reviewPriority?.compareDecision),
      unpackedAnchorDeltaCount: normalizeFiniteNumber(task?.reviewPriority?.unpackedAnchorDeltaCount),
      unpackedMatchDeltaCount: normalizeFiniteNumber(task?.reviewPriority?.unpackedMatchDeltaCount),
      rawAnchorDeltaCount: normalizeFiniteNumber(task?.reviewPriority?.rawAnchorDeltaCount),
      rawMatchDeltaCount: normalizeFiniteNumber(task?.reviewPriority?.rawMatchDeltaCount),
      xpiDelta: normalizeFiniteNumber(task?.reviewPriority?.xpiDelta),
      bundleDelta: normalizeFiniteNumber(task?.reviewPriority?.bundleDelta),
      decodeDelta: normalizeFiniteNumber(task?.reviewPriority?.decodeDelta),
      prepareDelta: normalizeFiniteNumber(task?.reviewPriority?.prepareDelta),
    },
  };
}

function buildMatrixCandidateIndex(candidates = []) {
  return new Map(
    (Array.isArray(candidates) ? candidates : [])
      .map((candidate) => ({
        id: normalizeNonEmptyString(candidate?.id),
        variant: normalizeNonEmptyString(candidate?.variant || candidate?.compareVariant),
        channel: normalizeNonEmptyString(candidate?.signals?.channel || candidate?.channel) || "stable",
        recommendedAction: normalizeNonEmptyString(candidate?.recommendedAction),
        summary: normalizeNonEmptyString(candidate?.summary),
        signals: candidate?.signals || {},
      }))
      .filter((candidate) => candidate.id)
      .map((candidate) => [candidate.id, candidate]),
  );
}

function summarizeShieldedBaseline(matrixCandidates) {
  const currentShielded = matrixCandidates.get("shielded") || null;
  const signals = currentShielded?.signals || {};
  if (!currentShielded) {
    return {
      present: false,
      variant: "shielded",
      channel: "stable",
      sourceProxyReducedAnchorCount: null,
      sourceProxyReducedMatchCount: null,
      unpackedSurfaceAnchorCount: null,
      unpackedSurfaceExposedFiles: [],
    };
  }

  return {
    present: true,
    variant: normalizeNonEmptyString(currentShielded.variant) || "shielded",
    channel: normalizeNonEmptyString(currentShielded.channel) || "stable",
    sourceProxyReducedAnchorCount: normalizeFiniteNumber(signals?.sourceProxyReducedAnchorCount),
    sourceProxyReducedMatchCount: normalizeFiniteNumber(signals?.sourceProxyReducedMatchCount),
    unpackedSurfaceAnchorCount: normalizeFiniteNumber(signals?.unpackedSurfaceAnchorCount),
    unpackedSurfaceExposedFiles: Array.isArray(signals?.unpackedSurfaceExposedFiles)
      ? signals.unpackedSurfaceExposedFiles
      : [],
  };
}

function buildCompareIndex(compareReports = []) {
  return new Map(
    (Array.isArray(compareReports) ? compareReports : [])
      .map((report) => ({
        variant: normalizeNonEmptyString(report?.variant),
        channel: normalizeNonEmptyString(report?.channel) || "stable",
        status: normalizeNonEmptyString(report?.status),
        decision: normalizeNonEmptyString(report?.decision),
        nextAction: normalizeNonEmptyString(report?.nextAction),
        summary: normalizeNonEmptyString(report?.summary),
        auditComparison: report?.auditComparison || {},
        deltas: report?.deltas || {},
      }))
      .filter((report) => report.variant)
      .map((report) => [`${report.variant}:${report.channel}`, report]),
  );
}

function summarizeReviewCandidate(task, context = {}) {
  const matrixCandidate = context.matrixCandidates.get(task.candidateId) || null;
  const compareReport = context.compareReports.get(`${task.variant}:${task.channel}`) || null;
  const matrixSignals = matrixCandidate?.signals || {};
  const compareAudit = compareReport?.auditComparison || {};
  const compareDeltas = compareReport?.deltas || {};
  const reviewPriority = task.reviewPriority || {};

  return {
    id: task.candidateId || task.id,
    variant: task.variant,
    channel: task.channel,
    reviewRank: task.reviewRank,
    present: Boolean(matrixCandidate && compareReport),
    comparePresent: Boolean(compareReport),
    matrixPresent: Boolean(matrixCandidate),
    compareStatus: compareReport?.status || reviewPriority.compareStatus || "missing",
    compareDecision: compareReport?.decision || reviewPriority.compareDecision || "missing-evidence",
    recommendedAction: matrixCandidate?.recommendedAction || compareReport?.nextAction || null,
    matrixRecommendedAction: matrixCandidate?.recommendedAction || null,
    summary: compareReport?.summary || matrixCandidate?.summary || task.summary || "缺少 retained review 摘要。",
    rationale: task.rationale,
    signals: {
      unpackedAnchorDeltaCount: normalizeFiniteNumber(compareAudit?.unpackedAnchorDeltaCount ?? reviewPriority.unpackedAnchorDeltaCount),
      unpackedMatchDeltaCount: normalizeFiniteNumber(compareAudit?.unpackedMatchDeltaCount ?? reviewPriority.unpackedMatchDeltaCount),
      rawAnchorDeltaCount: normalizeFiniteNumber(compareAudit?.rawAnchorDeltaCount ?? reviewPriority.rawAnchorDeltaCount),
      rawMatchDeltaCount: normalizeFiniteNumber(compareAudit?.rawMatchDeltaCount ?? reviewPriority.rawMatchDeltaCount),
      xpiDelta: normalizeFiniteNumber(compareDeltas?.xpiBytes ?? reviewPriority.xpiDelta),
      bundleDelta: normalizeFiniteNumber(compareDeltas?.bundleBytes ?? reviewPriority.bundleDelta),
      decodeDelta: normalizeFiniteNumber(compareDeltas?.decodeDurationMs ?? reviewPriority.decodeDelta),
      prepareDelta: normalizeFiniteNumber(compareDeltas?.prepareDurationMs ?? reviewPriority.prepareDelta),
      sameRawSurface: compareAudit?.sameRawSurface === true,
      sameUnpackedSurface: compareAudit?.sameUnpackedSurface === true,
      residualFloorReached: compareAudit?.residualFloorReached === true,
      residualExposedFiles: Array.isArray(compareAudit?.residualExposedFiles)
        ? compareAudit.residualExposedFiles
        : [],
      residualAnchorIds: Array.isArray(compareAudit?.residualAnchorIds)
        ? compareAudit.residualAnchorIds
        : [],
      sourceProxyReducedAnchorCount: normalizeFiniteNumber(matrixSignals?.sourceProxyReducedAnchorCount),
      sourceProxyReducedMatchCount: normalizeFiniteNumber(matrixSignals?.sourceProxyReducedMatchCount),
      unpackedSurfaceAnchorCount: normalizeFiniteNumber(matrixSignals?.unpackedSurfaceAnchorCount),
      unpackedSurfaceExposedFiles: Array.isArray(matrixSignals?.unpackedSurfaceExposedFiles)
        ? matrixSignals.unpackedSurfaceExposedFiles
        : [],
    },
  };
}

export function summarizePackageProtectionRetainedReview({
  guidedAttackPlanReport = null,
  matrixReport = null,
  compareReports = [],
} = {}) {
  const reviewTasks = (Array.isArray(guidedAttackPlanReport?.tasks) ? guidedAttackPlanReport.tasks : [])
    .filter((task) => RETAINED_REVIEW_TASK_KINDS.includes(String(task?.kind || "").trim()))
    .map((task) => normalizeReviewTask(task))
    .sort((left, right) => Number(left.reviewRank ?? Number.MAX_SAFE_INTEGER) - Number(right.reviewRank ?? Number.MAX_SAFE_INTEGER));
  const matrixCandidates = buildMatrixCandidateIndex(matrixReport?.candidates);
  const baseline = summarizeShieldedBaseline(matrixCandidates);
  const compareReportsIndex = buildCompareIndex(compareReports);
  const reviewQueue = reviewTasks.map((task) => summarizeReviewCandidate(task, {
    matrixCandidates,
    compareReports: compareReportsIndex,
  }));
  const topCandidate = reviewQueue[0] || null;

  let status = "passed";
  let nextAction = "keep-top-retained-advisory";
  let summary = "当前 retained experiment review 队列已收口。";

  if (!guidedAttackPlanReport || reviewQueue.length === 0) {
    status = "missing";
    nextAction = "refresh-review-artifacts";
    summary = "缺少 retained experiment review 队列，先刷新 attack plan / matrix / compare 工件。";
  } else if (!topCandidate?.present) {
    status = "missing";
    nextAction = "refresh-review-artifacts";
    summary = "top retained candidate 仍缺 compare 或 matrix 工件，当前还不能给出稳定 review 结论。";
  } else if (topCandidate.compareStatus === "failed" || topCandidate.compareDecision === "regression") {
    status = "failed";
    nextAction = "fix-experiment-regression";
    summary = `top retained candidate ${topCandidate.variant} 出现回归，先修复实验分支再继续 review。`;
  } else if (
    topCandidate.compareStatus === "passed"
    && topCandidate.compareDecision === "hardening-win"
    && topCandidate.matrixRecommendedAction === "collect-llm-symmetry-evidence"
  ) {
    status = "attention";
    nextAction = "collect-llm-symmetry-evidence";
    summary = `top retained candidate ${topCandidate.variant} 仍缺对称 single-pass LLM 证据；继续保留候选，但先补 compare 对称性再谈 promotion。`;
  } else if (
    topCandidate.compareStatus === "passed"
    && topCandidate.compareDecision === "hardening-win"
    && topCandidate.matrixRecommendedAction === "promote-experimental-candidate"
  ) {
    if (topCandidate.variant === "shielded-surface-scrub") {
      nextAction = "keep-surface-scrub-advisory";
      summary = "shielded-surface-scrub 当前仍是 retained hardening review 首选，可继续保持 advisory 候选定位。";
    } else {
      nextAction = "keep-top-retained-advisory";
      summary = `${topCandidate.variant} 当前是 retained hardening review 首选，可继续保持 advisory 候选定位。`;
    }
  } else {
    status = "attention";
    nextAction = "review-next-retained-candidate";
    summary = `top retained candidate ${topCandidate.variant || "-"} 尚未形成稳定 hardening-win 收口，需继续复核 compare / matrix 证据。`;
  }

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status,
    statusLabel: STATUS_LABELS[status] || STATUS_LABELS.attention,
    summary,
    nextAction,
    sources: {
      guidedAttackPlanPresent: Boolean(guidedAttackPlanReport),
      matrixPresent: Boolean(matrixReport),
      compareReportCount: compareReportsIndex.size,
    },
    counters: {
      reviewTaskCount: reviewQueue.length,
    },
    baseline,
    topCandidate: topCandidate ? {
      id: topCandidate.id,
      variant: topCandidate.variant,
      channel: topCandidate.channel,
      reviewRank: topCandidate.reviewRank,
      compareStatus: topCandidate.compareStatus,
      compareDecision: topCandidate.compareDecision,
      recommendedAction: topCandidate.recommendedAction,
      summary: topCandidate.summary,
      rationale: topCandidate.rationale,
      signals: topCandidate.signals,
    } : null,
    reviewQueue,
  };
}

export function renderPackageProtectionRetainedReviewMarkdown(report) {
  const lines = [
    "# Package Protection Retained Review",
    "",
    `- 生成时间: \`${report.generatedAt}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- 状态: \`${report.statusLabel}\``,
    `- nextAction: \`${report.nextAction}\``,
    `- 摘要: ${report.summary}`,
    `- reviewTaskCount: \`${report.counters.reviewTaskCount}\``,
    "",
  ];

  if (report.baseline?.present) {
    lines.push("## Baseline");
    lines.push("");
    lines.push(`- variant/channel: \`${report.baseline.variant} / ${report.baseline.channel}\``);
    if (report.baseline.sourceProxyReducedAnchorCount != null) {
      lines.push(`- sourceProxyReducedAnchorCount: \`${report.baseline.sourceProxyReducedAnchorCount}\``);
    }
    if (report.baseline.sourceProxyReducedMatchCount != null) {
      lines.push(`- sourceProxyReducedMatchCount: \`${report.baseline.sourceProxyReducedMatchCount}\``);
    }
    if (report.baseline.unpackedSurfaceAnchorCount != null) {
      lines.push(`- unpackedSurfaceAnchorCount: \`${report.baseline.unpackedSurfaceAnchorCount}\``);
    }
    if (Array.isArray(report.baseline.unpackedSurfaceExposedFiles) && report.baseline.unpackedSurfaceExposedFiles.length > 0) {
      lines.push(`- exposedFiles: \`${report.baseline.unpackedSurfaceExposedFiles.join(", ")}\``);
    }
    lines.push("");
  }

  if (report.topCandidate) {
    lines.push("## Top Candidate");
    lines.push("");
    lines.push(`- id: \`${report.topCandidate.id}\``);
    lines.push(`- variant/channel: \`${report.topCandidate.variant} / ${report.topCandidate.channel}\``);
    lines.push(`- reviewRank: \`${report.topCandidate.reviewRank}\``);
    lines.push(`- compare: \`${report.topCandidate.compareStatus} / ${report.topCandidate.compareDecision}\``);
    lines.push(`- recommendedAction: \`${report.topCandidate.recommendedAction || "-"}\``);
    lines.push(`- rationale: ${report.topCandidate.rationale || "-"}`);
    lines.push(`- unpackedAnchorDeltaCount: \`${report.topCandidate.signals.unpackedAnchorDeltaCount ?? "-"}\``);
    lines.push(`- unpackedMatchDeltaCount: \`${report.topCandidate.signals.unpackedMatchDeltaCount ?? "-"}\``);
    lines.push(`- xpiDelta: \`${report.topCandidate.signals.xpiDelta ?? "-"}\``);
    lines.push(`- prepareDelta: \`${report.topCandidate.signals.prepareDelta ?? "-"}\``);
    lines.push(`- decodeDelta: \`${report.topCandidate.signals.decodeDelta ?? "-"}\``);
    if (report.topCandidate.signals.residualFloorReached === true) {
      lines.push(`- residualFloorReached: \`yes\``);
    }
    if (Array.isArray(report.topCandidate.signals.residualExposedFiles) && report.topCandidate.signals.residualExposedFiles.length > 0) {
      lines.push(`- residualExposedFiles: \`${report.topCandidate.signals.residualExposedFiles.join(", ")}\``);
    }
    if (Array.isArray(report.topCandidate.signals.residualAnchorIds) && report.topCandidate.signals.residualAnchorIds.length > 0) {
      lines.push(`- residualAnchorIds: \`${report.topCandidate.signals.residualAnchorIds.join(", ")}\``);
    }
    lines.push(`- summary: ${report.topCandidate.summary || "-"}`);
    lines.push("");
  }

  if (Array.isArray(report.reviewQueue) && report.reviewQueue.length > 0) {
    lines.push("## Queue");
    lines.push("");
    report.reviewQueue.forEach((candidate) => {
      lines.push(`### ${candidate.id}`);
      lines.push("");
      lines.push(`- variant/channel: \`${candidate.variant} / ${candidate.channel}\``);
      lines.push(`- reviewRank: \`${candidate.reviewRank}\``);
      lines.push(`- present: \`${candidate.present ? "yes" : "no"}\``);
      lines.push(`- compare: \`${candidate.compareStatus} / ${candidate.compareDecision}\``);
      lines.push(`- recommendedAction: \`${candidate.recommendedAction || "-"}\``);
      lines.push(`- unpackedAnchorDeltaCount: \`${candidate.signals.unpackedAnchorDeltaCount ?? "-"}\``);
      lines.push(`- xpiDelta: \`${candidate.signals.xpiDelta ?? "-"}\``);
      lines.push(`- prepareDelta: \`${candidate.signals.prepareDelta ?? "-"}\``);
      lines.push(`- decodeDelta: \`${candidate.signals.decodeDelta ?? "-"}\``);
      lines.push(`- summary: ${candidate.summary || "-"}`);
      lines.push("");
    });
  }

  return lines.join("\n");
}

export async function persistPackageProtectionRetainedReview(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const reportPath = resolveAgentArtifactPath(projectRootPath, "package-protection-retained-review.json");
  const reportMDPath = resolveAgentArtifactPath(projectRootPath, "package-protection-retained-review.md");

  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionRetainedReviewMarkdown(report)}\n`, "utf-8"),
  ]);

  return {
    reportPath,
    reportMDPath,
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

async function loadRetainedReviewInputs(projectRootPath) {
  const guidedAttackPlanReport = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-guided-attack-plan.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-guided-attack-plan",
      label: "package protection guided attack plan",
    },
  );
  const matrixReport = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-matrix.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-matrix-report",
      label: "package protection matrix",
    },
  );

  const reviewTasks = Array.isArray(guidedAttackPlanReport?.tasks)
    ? guidedAttackPlanReport.tasks.filter((task) => RETAINED_REVIEW_TASK_KINDS.includes(String(task?.kind || "").trim()))
    : [];
  const compareReports = await Promise.all(reviewTasks.map(async (task) => {
    const variant = normalizeNonEmptyString(task?.variant);
    const channel = normalizeNonEmptyString(task?.channel) || "stable";
    const compareBaseVariant = resolveCompareBaseVariant(variant);
    if (!variant) {
      return null;
    }
    return readJSONIfExists(
      resolveAgentArtifactPath(projectRootPath, "package-protection-compare", `${variant}-vs-${compareBaseVariant}-${channel}.json`),
      {
        missingCategory: "environment",
        invalidCategory: "validation",
        failedStage: "read-compare-report",
        label: `${variant}-vs-${compareBaseVariant}-${channel}`,
      },
    );
  }));

  return {
    guidedAttackPlanReport,
    matrixReport,
    compareReports: compareReports.filter(Boolean),
  };
}

async function main() {
  const inputs = await loadRetainedReviewInputs(projectRoot);
  const report = summarizePackageProtectionRetainedReview(inputs);
  const paths = await persistPackageProtectionRetainedReview(report);
  console.log(`Package protection retained review generated: ${paths.reportPath}`);
  console.log(`Package protection retained review nextAction: ${report.nextAction}`);
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
