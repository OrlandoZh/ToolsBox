import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CURRENT_TRUTH_SOURCE_FILE,
  readCurrentTruthState,
} from "./docs-current-truth-lib.mjs";
import {
  resolveAgentArtifactPath,
  resolveAgentContextArtifacts,
} from "./agent-artifacts.mjs";
import { loadReferenceDistillationState } from "./agent-reference-intake-lib.mjs";
import { writeJSONArtifact } from "./script-runtime-lib.mjs";

export const AGENT_CONTEXT_SCHEMA_VERSION = 2;
export const AGENT_CONTEXT_RUNTIME_COMPACT_PROFILE = "runtime-compact-v1";

const RUNTIME_COMPACT_MAX_TEXT_LENGTH = 120;
const RUNTIME_COMPACT_MAX_LIST_ITEMS = 3;
const RUNTIME_COMPACT_MAX_WARNINGS = 2;
const RUNTIME_COMPACT_MAX_EVIDENCE_REFS = 3;

function truncateList(list, max = 8) {
  return Array.isArray(list) ? list.filter(Boolean).slice(0, max) : [];
}

function normalizeCompactText(value, maxLength = RUNTIME_COMPACT_MAX_TEXT_LENGTH) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function collectObjectStringValues(payload, results = []) {
  if (typeof payload === "string") {
    const text = String(payload || "").trim();
    if (text) {
      results.push(text);
    }
    return results;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item) => collectObjectStringValues(item, results));
    return results;
  }
  if (!payload || typeof payload !== "object") {
    return results;
  }
  Object.values(payload).forEach((value) => collectObjectStringValues(value, results));
  return results;
}

function parseGeneratedAtMs(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function hashObject(payload, length = 16) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, length);
}

function sanitizeArchiveSegment(value) {
  return String(value || "")
    .replaceAll(":", "-")
    .replaceAll(".", "-")
    .replaceAll(/\s+/gu, "-");
}

function normalizeCommand(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  if (/^(npm|node|bun|pnpm|yarn|npx)\b/u.test(text)) {
    return text;
  }
  const matches = Array.from(text.matchAll(/`([^`]+)`/gu))
    .map((item) => String(item?.[1] || "").trim())
    .filter(Boolean);
  return matches.find((item) => /^(npm|node|bun|pnpm|yarn|npx)\b/u.test(item)) || null;
}

function buildCurrentTruthExcerpt(summaryText, max = 4) {
  return String(summaryText || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean)
    .slice(0, max);
}

function buildContextSignal(id, kind, message, recommendation) {
  return {
    id,
    kind,
    status: "warning",
    severity: "warning",
    message,
    recommendation: recommendation || null,
  };
}

async function loadJSONIfExists(filePath) {
  return await fs.readFile(filePath, "utf-8")
    .then((content) => JSON.parse(content))
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
}

async function readCurrentTruthContext(projectRoot) {
  const sourcePath = path.join(projectRoot, CURRENT_TRUTH_SOURCE_FILE);
  try {
    const [{ summary, meta, activeBatchId, currentWaveName, acceptanceTrack }, stats] = await Promise.all([
      Promise.resolve().then(() => readCurrentTruthState(projectRoot)),
      fs.stat(sourcePath),
    ]);
    return {
      present: true,
      sourceFile: CURRENT_TRUTH_SOURCE_FILE,
      updatedAt: stats.mtime.toISOString(),
      meta,
      activeBatchId,
      currentWaveNameFromTruth: currentWaveName,
      acceptanceTrackFromTruth: acceptanceTrack,
      summary,
      excerpt: buildCurrentTruthExcerpt(summary, 4),
    };
  } catch {
    return {
      present: false,
      sourceFile: CURRENT_TRUTH_SOURCE_FILE,
      updatedAt: null,
      meta: null,
      activeBatchId: null,
      currentWaveNameFromTruth: null,
      acceptanceTrackFromTruth: null,
      summary: null,
      excerpt: [],
    };
  }
}

function summarizeExpansionWave(record) {
  const payload = record && typeof record === "object" ? record : null;
  const currentWaveName = String(payload?.currentWaveName || "").trim() || null;
  const acceptanceTrack = String(payload?.acceptanceTrack || "").trim() || null;
  const inScopeModules = truncateList(payload?.inScopeModules, 12);
  const outOfScopeModules = truncateList(payload?.outOfScopeModules, 12);
  const explicitVisualUpgradeModules = truncateList(payload?.explicitVisualUpgradeModules, 12);
  const moduleArchetypes = Array.isArray(payload?.moduleArchetypes)
    ? payload.moduleArchetypes
      .map((item) => {
        const moduleName = String(item?.module || item?.path || "").trim();
        const archetype = String(item?.archetype || "").trim();
        return moduleName && archetype ? `${moduleName} -> ${archetype}` : "";
      })
      .filter(Boolean)
      .slice(0, 12)
    : [];
  return {
    present: Boolean(payload),
    missing: !payload,
    status: String(payload?.status || (currentWaveName ? "active" : "missing")).trim() || "missing",
    currentWaveName,
    acceptanceTrack,
    inScopeModules,
    outOfScopeModules,
    explicitVisualUpgradeModules,
    moduleArchetypes,
    summary: currentWaveName
      ? `${currentWaveName} / ${acceptanceTrack || "未声明 acceptance track"}`
      : payload
        ? "当前尚未声明项目 expansion wave。"
        : "缺少 project-expansion-wave mirror。",
  };
}

function summarizeValidationOverrides(record) {
  const payload = record && typeof record === "object" ? record : null;
  const overrides = Array.isArray(payload?.overrides) ? payload.overrides : [];
  const countsByLevel = {
    "visual-required": 0,
    "visual-recommended": 0,
    "visual-not-needed": 0,
  };
  const pathMatchers = [];
  overrides.forEach((item) => {
    const level = String(item?.decision || item?.level || "").trim();
    if (countsByLevel[level] !== undefined) {
      countsByLevel[level] += 1;
    }
    (Array.isArray(item?.pathMatchers) ? item.pathMatchers : []).forEach((matcher) => {
      const value = String(matcher || "").trim();
      if (value) {
        pathMatchers.push(value);
      }
    });
  });
  const summary = overrides.length > 0
    ? `项目覆盖 ${overrides.length} 条：required=${countsByLevel["visual-required"]} / recommended=${countsByLevel["visual-recommended"]} / not-needed=${countsByLevel["visual-not-needed"]}`
    : payload
      ? "当前未声明项目级 validation override。"
      : "缺少 project-validation-overrides mirror。";
  return {
    present: Boolean(payload),
    missing: !payload,
    summary,
    overrideCount: overrides.length,
    countsByLevel,
    pathMatchers: truncateList(pathMatchers, 12),
  };
}

function summarizeValidationDecision(decision) {
  const payload = decision && typeof decision === "object" ? decision : {};
  return {
    present: Boolean(decision && typeof decision === "object"),
    level: String(payload.level || "").trim() || null,
    levelLabel: String(payload.levelLabel || "").trim() || null,
    decisionSource: String(payload.decisionSource || payload.source || "").trim() || null,
    matchedDomain: truncateList(payload.matchedDomain, 8),
    matchedProjectOverride: truncateList(payload.matchedProjectOverride, 8),
    requiredChecks: truncateList(payload.requiredChecks, 8),
    requiredEvidence: truncateList(payload.requiredEvidence, 8),
    escalatedByRuntimeSignals: payload.escalatedByRuntimeSignals === true,
    deferredEvidenceAction: String(payload.deferredEvidenceAction || "").trim() || null,
  };
}

function summarizeMonitorContext(monitor) {
  const payload = monitor && typeof monitor === "object" ? monitor : null;
  const frontpage = payload?.frontpageSummary && typeof payload.frontpageSummary === "object"
    ? payload.frontpageSummary
    : {};
  return {
    present: Boolean(payload),
    generatedAt: payload?.generatedAt || null,
    status: String(frontpage.status || "").trim() || "missing",
    statusLabel: String(frontpage.statusLabel || "").trim() || "缺失",
    headline: String(frontpage.headline || "").trim() || (payload ? "当前缺少 frontpage 摘要。" : "缺少 agent-monitor 工件。"),
    nextAction: String(frontpage.nextAction || "").trim() || null,
    primarySignals: truncateList(frontpage.primarySignals, 6),
    watchStatus: String(frontpage.watch?.status || payload?.watchStatus?.status || "").trim() || "missing",
    watchStatusLabel: String(frontpage.watch?.statusLabel || payload?.watchStatus?.statusLabel || "").trim() || "缺失",
    e2eStatus: String(frontpage.e2e?.status || payload?.zoteroValidation?.e2e?.status || "").trim() || "missing",
    e2eStatusLabel: String(frontpage.e2e?.statusLabel || payload?.zoteroValidation?.e2e?.statusLabel || "").trim() || "缺失",
    watchRecoveryStatus: String(frontpage.watchRecovery?.status || payload?.zoteroValidation?.watchRecovery?.status || "").trim() || "missing",
    watchRecoveryStatusLabel: String(frontpage.watchRecovery?.statusLabel || payload?.zoteroValidation?.watchRecovery?.statusLabel || "").trim() || "缺失",
    summary: payload
      ? `${String(frontpage.statusLabel || "缺失")} / ${String(frontpage.headline || "当前缺少 frontpage 摘要。")}`
      : "缺少 agent-monitor 工件。",
  };
}

function summarizeMemoryContext(memory) {
  const payload = memory && typeof memory === "object" ? memory : null;
  const currentIncident = payload?.currentIncident && typeof payload.currentIncident === "object"
    ? payload.currentIncident
    : null;
  const recommendation = payload?.recommendation && typeof payload.recommendation === "object"
    ? payload.recommendation
    : null;
  return {
    present: Boolean(payload),
    generatedAt: payload?.generatedAt || null,
    summary: payload
      ? (recommendation?.summary || currentIncident?.featureLabel || "当前没有历史推荐。")
      : "缺少 agent-memory 工件。",
    currentIncident: currentIncident
      ? {
        fingerprint: currentIncident.fingerprint || null,
        featureLabel: currentIncident.featureLabel || null,
        contextSummary: currentIncident.context?.contextSummary || null,
        candidateFiles: truncateList(currentIncident.candidateFiles, 6),
        preferredStrategyLabel: currentIncident.preferredStrategy?.strategyLabel || null,
        contextMatchLevel: currentIncident.preferredStrategy?.contextMatchLevel || null,
        recentBlocker: currentIncident.recentReasons?.[0]?.label || null,
      }
      : null,
    recommendation: recommendation
      ? {
        title: recommendation.title || null,
        nextAction: recommendation.nextAction || null,
        confidence: recommendation.confidence || null,
        summary: recommendation.summary || null,
        candidateFiles: truncateList(recommendation.candidateFiles, 6),
      }
      : null,
  };
}

function summarizeGateContext(gate) {
  const payload = gate && typeof gate === "object" ? gate : null;
  const frontpage = payload?.frontpageSummary && typeof payload.frontpageSummary === "object"
    ? payload.frontpageSummary
    : {};
  return {
    present: Boolean(payload),
    generatedAt: payload?.generatedAt || null,
    gatePassed: typeof payload?.gatePassed === "boolean" ? payload.gatePassed : null,
    status: String(frontpage.status || "").trim() || (payload ? (payload.gatePassed ? "ready" : "blocked") : "missing"),
    statusLabel: String(frontpage.statusLabel || "").trim() || (payload ? (payload.gatePassed ? "可继续" : "需先处理") : "缺失"),
    headline: String(frontpage.headline || "").trim() || (payload ? "当前缺少 gate frontpage 摘要。" : "缺少 agent-gate 工件。"),
    nextAction: String(frontpage.nextAction || "").trim() || null,
    issues: truncateList(payload?.issues, 6),
    recommendations: truncateList(payload?.recommendations, 6),
    summary: payload
      ? `${payload.gatePassed ? "passed" : "blocked"} / ${String(frontpage.headline || "当前缺少 gate frontpage 摘要。")}`
      : "缺少 agent-gate 工件。",
  };
}

function summarizeReleaseContext(monitor, gate) {
  const releaseMatrix = monitor?.releaseMatrix && typeof monitor.releaseMatrix === "object"
    ? monitor.releaseMatrix
    : gate?.releaseMatrix && typeof gate.releaseMatrix === "object"
      ? gate.releaseMatrix
      : null;
  const remoteVerification = releaseMatrix?.remoteVerification && typeof releaseMatrix.remoteVerification === "object"
    ? releaseMatrix.remoteVerification
    : null;
  return {
    present: Boolean(releaseMatrix),
    generatedAt: monitor?.generatedAt || gate?.generatedAt || null,
    status: String(releaseMatrix?.status || "").trim() || "missing",
    statusLabel: String(releaseMatrix?.statusLabel || "").trim() || "缺失",
    summary: String(releaseMatrix?.summary || "").trim() || (releaseMatrix ? "当前缺少发布矩阵摘要。" : "缺少 release-matrix 摘要。"),
    remoteVerificationStatus: String(remoteVerification?.status || "").trim() || null,
    remoteVerificationStatusLabel: String(remoteVerification?.statusLabel || "").trim() || null,
    remoteVerificationSummary: String(remoteVerification?.summary || "").trim() || null,
  };
}

function summarizeDelegationContext(monitor) {
  const validationContext = monitor?.validationContext && typeof monitor.validationContext === "object"
    ? monitor.validationContext
    : null;
  const reviewSummary = validationContext?.reviewSummary && typeof validationContext.reviewSummary === "object"
    ? validationContext.reviewSummary
    : null;
  const changedPaths = truncateList(validationContext?.changedPaths, 8);
  return {
    present: Boolean(validationContext),
    reviewWindowCount: Number(validationContext?.reviewWindowCount || 0),
    changedPathCount: changedPaths.length,
    changedPaths,
    reviewSummary: reviewSummary
      ? {
        accepted: Number(reviewSummary.accepted || 0),
        reworkedByCodex: Number(reviewSummary.reworkedByCodex || 0),
        blocked: Number(reviewSummary.blocked || 0),
      }
      : null,
    summary: validationContext
      ? `reviewWindow=${Number(validationContext.reviewWindowCount || 0)} / changedPaths=${changedPaths.length}`
      : "缺少 delegation / validation context 摘要。",
  };
}

function collectUniqueSignalKinds(signals, max = 6) {
  return Array.from(new Set(
    (Array.isArray(signals) ? signals : [])
      .map((item) => String(item?.kind || "").trim())
      .filter(Boolean),
  )).slice(0, max);
}

function hasSignal(signals, id) {
  return (Array.isArray(signals) ? signals : []).some((item) => item?.id === id);
}

function resolveSourceAlignmentRepair({
  currentTruth = null,
  monitor = null,
  memory = null,
  gate = null,
  driftSignals = null,
} = {}) {
  const signals = Array.isArray(driftSignals?.signals) ? driftSignals.signals : [];

  if (!currentTruth?.present || hasSignal(signals, "missing-current-truth")) {
    return {
      command: "npm run agent:context",
      message: "先更新 `docs/CURRENT_BACKLOG.md` 的 current truth，再重新执行 `npm run agent:context`。",
      blocker: "缺少 current truth 摘要，当前无法确认稳定治理语义。",
      evidenceRefs: [CURRENT_TRUTH_SOURCE_FILE, "dist/agent-context.json"],
    };
  }

  if (!monitor?.present || hasSignal(signals, "missing-monitor")) {
    return {
      command: "npm run agent:monitor",
      message: "先执行 `npm run agent:monitor`，再重新汇总当前上下文。",
      blocker: "缺少 agent-monitor 工件，当前无法生成动态上下文主视图。",
      evidenceRefs: ["dist/agent-monitor.json", "dist/agent-context.json"],
    };
  }

  if (
    hasSignal(signals, "truth-wave-mismatch")
    || hasSignal(signals, "truth-acceptance-track-mismatch")
  ) {
    return {
      command: "npm run agent:context",
      message: "先对齐 `docs/CURRENT_BACKLOG.md` 与当前 project mirrors，再重新执行 `npm run agent:context`。",
      blocker: signals[0]?.message || "current truth 与 project mirror 之间存在 scope drift。",
      evidenceRefs: [
        CURRENT_TRUTH_SOURCE_FILE,
        "config/project-expansion-wave.json",
        "dist/agent-context.json",
      ],
    };
  }

  if (!gate?.present || hasSignal(signals, "gate-older-than-monitor")) {
    return {
      command: "npm run agent:gate",
      message: "执行 `npm run agent:gate`，让 gate 与最新 monitor/current truth 重新对齐。",
      blocker: !gate?.present
        ? "缺少 agent-gate 工件，当前上下文还未进入 post-gate 对齐态。"
        : "最新 gate 工件早于 monitor，当前上下文可能混入过期 gate 结论。",
      evidenceRefs: ["dist/agent-gate.json", "dist/agent-context.json"],
    };
  }

  if (!memory?.present || hasSignal(signals, "memory-older-than-monitor")) {
    return {
      command: "npm run agent:memory",
      message: "执行 `npm run agent:memory`，让记忆层与最新 monitor/current truth 对齐。",
      blocker: !memory?.present
        ? "缺少 agent-memory 工件，当前仍在引用不完整的记忆层上下文。"
        : "最新 agent-memory 工件早于 monitor，当前上下文仍在引用旧记忆快照。",
      evidenceRefs: ["dist/agent-memory.json", "dist/agent-context.json"],
    };
  }

  return {
    command: null,
    message: null,
    blocker: null,
    evidenceRefs: [],
  };
}

function buildSourceAlignment({
  currentTruth = null,
  monitor = null,
  memory = null,
  gate = null,
  driftSignals = null,
  generationStage = "standalone",
} = {}) {
  const warningKinds = collectUniqueSignalKinds(driftSignals?.signals, 6);
  const repair = resolveSourceAlignmentRepair({
    currentTruth,
    monitor,
    memory,
    gate,
    driftSignals,
  });
  if (
    repair.command
    && warningKinds.length === 0
    && (!currentTruth?.present || !monitor?.present || !memory?.present || !gate?.present)
  ) {
    warningKinds.push("missing-required-section");
  }
  const status = repair.command
    ? "repair-required"
    : warningKinds.length > 0
    ? "repair-required"
    : generationStage === "post-gate"
      ? "aligned"
      : "standalone";
  const preferredRepairCommand = repair.command || (generationStage === "post-gate" ? null : "npm run agent:gate");
  return {
    status,
    generationStage,
    preferredRepairCommand,
    warningKinds,
    summary: status === "aligned"
      ? "当前 agent-context 已和最新 gate/current truth 对齐。"
      : repair.message || "当前 agent-context 尚未进入 post-gate 对齐态。",
  };
}

function pickDecisionHints({
  currentTruth,
  monitor,
  memory,
  gate,
  validationDecision,
  driftSignals,
  generationStage = "standalone",
}) {
  const repair = resolveSourceAlignmentRepair({
    currentTruth,
    monitor,
    memory,
    gate,
    driftSignals,
  });
  if (repair.command) {
    return {
      nextAction: repair.message,
      nextActionCommand: repair.command,
      mainBlocker: repair.blocker,
      recommendedEvidence: truncateList(repair.evidenceRefs, 6),
      summary: `${repair.blocker}；下一步 ${repair.command}`,
    };
  }

  const nextAction = String(
    gate?.nextAction
    || monitor?.nextAction
    || memory?.recommendation?.nextAction
    || "npm run agent:monitor",
  ).trim();
  const mainBlocker = String(
    gate?.headline
    || monitor?.primarySignals?.[0]
    || monitor?.headline
    || memory?.currentIncident?.recentBlocker
    || "当前没有明确主阻断，优先刷新最新工件。",
  ).trim();
  const recommendedEvidence = truncateList(
    validationDecision?.requiredEvidence?.length > 0
      ? validationDecision.requiredEvidence
      : validationDecision?.requiredChecks?.length > 0
        ? validationDecision.requiredChecks
        : monitor?.validationDecision?.requiredEvidence || [],
    6,
  );
  return {
    nextAction,
    nextActionCommand: normalizeCommand(nextAction),
    mainBlocker,
    recommendedEvidence,
    summary: `${mainBlocker}；下一步 ${nextAction}`,
  };
}

export function evaluateAgentContextDrift({
  currentTruth = null,
  projectExpansionWave = null,
  monitor = null,
  memory = null,
  gate = null,
} = {}) {
  const signals = [];
  const truthWave = currentTruth?.currentWaveNameFromTruth || null;
  const truthAcceptanceTrack = currentTruth?.acceptanceTrackFromTruth || null;
  const mirrorWave = String(projectExpansionWave?.currentWaveName || "").trim() || null;
  const mirrorAcceptanceTrack = String(projectExpansionWave?.acceptanceTrack || "").trim() || null;
  const monitorMs = parseGeneratedAtMs(monitor?.generatedAt);
  const gateMs = parseGeneratedAtMs(gate?.generatedAt);
  const memoryMs = parseGeneratedAtMs(memory?.generatedAt);

  if (!currentTruth?.present) {
    signals.push(buildContextSignal(
      "missing-current-truth",
      "missing-required-section",
      "缺少 current truth 摘要，当前无法确认稳定治理语义。",
      "先补齐 `docs/CURRENT_BACKLOG.md` 的 current truth，再重新执行 `npm run agent:context`。",
    ));
  }
  if (!monitor || typeof monitor !== "object") {
    signals.push(buildContextSignal(
      "missing-monitor",
      "missing-required-section",
      "缺少 agent-monitor 工件，当前无法生成动态上下文主视图。",
      "先执行 `npm run agent:monitor`，再重新执行 `npm run agent:context`。",
    ));
  }
  if (truthWave && mirrorWave && truthWave !== mirrorWave) {
    signals.push(buildContextSignal(
      "truth-wave-mismatch",
      "scope-mismatch",
      `current truth 声明的 wave 为 ${truthWave}，但 project-expansion-wave mirror 为 ${mirrorWave}。`,
      "先对齐 `docs/CURRENT_BACKLOG.md` 与 `config/project-expansion-wave.json`，再刷新 agent-context。",
    ));
  }
  if (truthAcceptanceTrack && mirrorAcceptanceTrack && truthAcceptanceTrack !== mirrorAcceptanceTrack) {
    signals.push(buildContextSignal(
      "truth-acceptance-track-mismatch",
      "scope-mismatch",
      `current truth 的验收主线为 ${truthAcceptanceTrack}，但 project-expansion-wave mirror 为 ${mirrorAcceptanceTrack}。`,
      "先同步 current truth 与 expansion wave mirror 的 acceptance track，再刷新 agent-context。",
    ));
  }
  if (monitorMs !== null && gateMs !== null && gateMs < monitorMs) {
    signals.push(buildContextSignal(
      "gate-older-than-monitor",
      "freshness-mismatch",
      "最新 gate 工件早于 monitor，当前上下文可能混入过期 gate 结论。",
      "重新执行 `npm run agent:gate`，让 gate 与最新 monitor 对齐。",
    ));
  }
  if (monitorMs !== null && memoryMs !== null && memoryMs < monitorMs) {
    signals.push(buildContextSignal(
      "memory-older-than-monitor",
      "freshness-mismatch",
      "最新 agent-memory 工件早于 monitor，当前上下文可能仍在引用旧记忆快照。",
      "重新执行 `npm run agent:context` 或 `npm run agent:memory`，刷新记忆层快照。",
    ));
  }

  return {
    status: signals.length > 0 ? "warning" : "clear",
    warningCount: signals.length,
    summary: signals.length > 0
      ? signals[0].message
      : "当前未检测到 source-level context drift。",
    signals,
  };
}

function buildRuntimeCompactArtifactRefs() {
  return {
    currentTruth: CURRENT_TRUTH_SOURCE_FILE,
    monitor: "dist/agent-monitor.json",
    gate: "dist/agent-gate.json",
    memory: "dist/agent-memory.json",
    referenceIntake: "dist/agent-reference-intake/index.json",
    referenceDistill: "dist/agent-reference-distill/latest.json",
    contextJSON: "dist/agent-context.json",
    contextMarkdown: "dist/agent-context.md",
  };
}

export function evaluateRuntimeCompactBudget(runtimeCompact) {
  const payload = runtimeCompact && typeof runtimeCompact === "object" ? runtimeCompact : {};
  const driftWarnings = Array.isArray(payload?.driftRef?.warnings) ? payload.driftRef.warnings : [];
  const evidenceRefs = Array.isArray(payload?.evidenceRefs) ? payload.evidenceRefs : [];
  const stringValues = collectObjectStringValues(payload);
  const tooLongFields = stringValues.filter((item) => item.length > RUNTIME_COMPACT_MAX_TEXT_LENGTH);
  const missingArtifactKeys = [
    "currentTruth",
    "monitor",
    "gate",
    "memory",
    "referenceIntake",
    "referenceDistill",
    "contextJSON",
    "contextMarkdown",
  ].filter((key) => !String(payload?.artifactRefs?.[key] || "").trim());
  const missingAlignmentFields = [
    "status",
    "generationStage",
  ].filter((key) => !String(payload?.alignmentRef?.[key] || "").trim());
  const missingReferenceDistillationFields = [
    "status",
    "pendingCount",
    "lastTopic",
    "lastDistilledAt",
    "nextSuggestedAction",
  ].filter((key) => !Object.prototype.hasOwnProperty.call(payload?.referenceDistillationRef || {}, key));
  const violations = [];
  if (tooLongFields.length > 0) {
    violations.push(`存在 ${tooLongFields.length} 个超出 ${RUNTIME_COMPACT_MAX_TEXT_LENGTH} 字符预算的字段`);
  }
  if (driftWarnings.length > RUNTIME_COMPACT_MAX_WARNINGS) {
    violations.push(`drift warnings 超过 ${RUNTIME_COMPACT_MAX_WARNINGS} 条预算`);
  }
  if (evidenceRefs.length > RUNTIME_COMPACT_MAX_EVIDENCE_REFS) {
    violations.push(`evidence refs 超过 ${RUNTIME_COMPACT_MAX_EVIDENCE_REFS} 条预算`);
  }
  if (missingArtifactKeys.length > 0) {
    violations.push(`缺少 artifact refs：${missingArtifactKeys.join("、")}`);
  }
  if (missingAlignmentFields.length > 0) {
    violations.push(`缺少 alignment refs：${missingAlignmentFields.join("、")}`);
  }
  if (missingReferenceDistillationFields.length > 0) {
    violations.push(`缺少 reference distillation refs：${missingReferenceDistillationFields.join("、")}`);
  }
  return {
    profile: AGENT_CONTEXT_RUNTIME_COMPACT_PROFILE,
    maxTextLength: RUNTIME_COMPACT_MAX_TEXT_LENGTH,
    maxListItems: RUNTIME_COMPACT_MAX_LIST_ITEMS,
    maxWarnings: RUNTIME_COMPACT_MAX_WARNINGS,
    maxEvidenceRefs: RUNTIME_COMPACT_MAX_EVIDENCE_REFS,
    tooLongFieldCount: tooLongFields.length,
    missingArtifactKeys,
    missingAlignmentFields,
    missingReferenceDistillationFields,
    withinBudget: violations.length === 0,
    violationCount: violations.length,
    violations,
  };
}

export function buildRuntimeCompactView(context) {
  const payload = context && typeof context === "object" ? context : {};
  const stableContext = payload?.stableContext && typeof payload.stableContext === "object"
    ? payload.stableContext
    : {};
  const dynamicContext = payload?.dynamicContext && typeof payload.dynamicContext === "object"
    ? payload.dynamicContext
    : {};
  const decisionHints = payload?.decisionHints && typeof payload.decisionHints === "object"
    ? payload.decisionHints
    : {};
  const driftSignals = payload?.driftSignals && typeof payload.driftSignals === "object"
    ? payload.driftSignals
    : {};
  const sourceAlignment = payload?.sourceAlignment && typeof payload.sourceAlignment === "object"
    ? payload.sourceAlignment
    : {};
  const sourceFreshness = payload?.sourceFreshness && typeof payload.sourceFreshness === "object"
    ? payload.sourceFreshness
    : {};
  const referenceDistillation = payload?.dynamicContext?.referenceDistillation && typeof payload.dynamicContext.referenceDistillation === "object"
    ? payload.dynamicContext.referenceDistillation
    : {};
  const driftWarnings = (Array.isArray(driftSignals.signals) ? driftSignals.signals : [])
    .filter((item) => item?.status === "warning" || item?.severity === "warning")
    .map((item) => normalizeCompactText(item?.message))
    .filter(Boolean)
    .slice(0, RUNTIME_COMPACT_MAX_WARNINGS);
  const truthRef = {
    activeBatchId: normalizeCompactText(stableContext.currentTruth?.activeBatchId),
    currentWaveName: normalizeCompactText(
      stableContext.expansionWave?.currentWaveName || stableContext.governance?.truthWaveName,
    ),
    validationLevel: normalizeCompactText(
      stableContext.validation?.levelLabel || stableContext.validation?.level,
    ),
  };
  const actionRef = {
    nextAction: normalizeCompactText(decisionHints.nextActionCommand || normalizeCommand(decisionHints.nextAction) || decisionHints.nextAction),
    mainBlocker: normalizeCompactText(decisionHints.mainBlocker),
  };
  const statusRef = {
    stableContextKey: normalizeCompactText(stableContext.stableContextKey),
    dynamicFingerprint: normalizeCompactText(dynamicContext.dynamicFingerprint),
    monitorStatus: normalizeCompactText(dynamicContext.monitor?.statusLabel || dynamicContext.monitor?.status),
    gateStatus: normalizeCompactText(dynamicContext.gate?.statusLabel || dynamicContext.gate?.status),
    memoryFingerprint: normalizeCompactText(dynamicContext.memory?.currentIncident?.fingerprint),
    memoryStrategyLabel: normalizeCompactText(
      dynamicContext.memory?.currentIncident?.preferredStrategyLabel
      || dynamicContext.memory?.recommendation?.title,
    ),
    releaseStatus: normalizeCompactText(dynamicContext.release?.statusLabel || dynamicContext.release?.status),
  };
  const runtimeCompact = {
    truthRef,
    alignmentRef: {
      status: normalizeCompactText(sourceAlignment.status || "missing"),
      generationStage: normalizeCompactText(sourceAlignment.generationStage || "missing"),
      preferredRepairCommand: normalizeCompactText(sourceAlignment.preferredRepairCommand),
      warningKinds: truncateList(
        (Array.isArray(sourceAlignment.warningKinds) ? sourceAlignment.warningKinds : [])
          .map((item) => normalizeCompactText(item))
          .filter(Boolean),
        RUNTIME_COMPACT_MAX_LIST_ITEMS,
      ),
    },
    actionRef,
    statusRef,
    driftRef: {
      status: normalizeCompactText(driftSignals.status || "missing"),
      warningCount: Number(driftSignals.warningCount || 0),
      warnings: driftWarnings,
    },
    referenceDistillationRef: {
      status: normalizeCompactText(referenceDistillation.status || "idle") || "idle",
      pendingCount: Math.max(0, Number(referenceDistillation.pendingCount || 0)),
      lastTopic: normalizeCompactText(referenceDistillation.lastTopic),
      lastDistilledAt: normalizeCompactText(referenceDistillation.lastDistilledAt),
      nextSuggestedAction: normalizeCompactText(referenceDistillation.nextSuggestedAction),
    },
    evidenceRefs: truncateList(
      (Array.isArray(decisionHints.recommendedEvidence) ? decisionHints.recommendedEvidence : [])
        .map((item) => normalizeCompactText(item))
        .filter(Boolean),
      RUNTIME_COMPACT_MAX_EVIDENCE_REFS,
    ),
    artifactRefs: buildRuntimeCompactArtifactRefs(),
    freshness: {
      currentTruthUpdatedAt: sourceFreshness.currentTruthUpdatedAt || null,
      monitorGeneratedAt: sourceFreshness.monitorGeneratedAt || null,
      gateGeneratedAt: sourceFreshness.gateGeneratedAt || null,
      memoryGeneratedAt: sourceFreshness.memoryGeneratedAt || null,
    },
    budgetMeta: {
      profile: AGENT_CONTEXT_RUNTIME_COMPACT_PROFILE,
    },
  };
  const budget = evaluateRuntimeCompactBudget(runtimeCompact);
  runtimeCompact.budgetMeta = {
    ...budget,
    digest: hashObject({
      truthRef: runtimeCompact.truthRef,
      alignmentRef: runtimeCompact.alignmentRef,
      actionRef: runtimeCompact.actionRef,
      statusRef: runtimeCompact.statusRef,
      driftRef: runtimeCompact.driftRef,
      referenceDistillationRef: runtimeCompact.referenceDistillationRef,
      evidenceRefs: runtimeCompact.evidenceRefs,
      artifactRefs: runtimeCompact.artifactRefs,
      freshness: runtimeCompact.freshness,
    }),
  };
  return runtimeCompact;
}

export function summarizeAgentContextSnapshot(agentContext) {
  const payload = agentContext && typeof agentContext === "object" ? agentContext : null;
  const runtimeCompact = payload?.runtimeCompact && typeof payload.runtimeCompact === "object"
    ? payload.runtimeCompact
    : buildRuntimeCompactView(payload);
  return {
    present: Boolean(payload),
    generatedAt: payload?.generatedAt || null,
    truthRef: runtimeCompact.truthRef || {},
    alignmentRef: runtimeCompact.alignmentRef || {},
    sourceAlignment: runtimeCompact.alignmentRef || {},
    actionRef: runtimeCompact.actionRef || {},
    statusRef: runtimeCompact.statusRef || {},
    driftRef: runtimeCompact.driftRef || {},
    referenceDistillationRef: runtimeCompact.referenceDistillationRef || {},
    evidenceRefs: truncateList(runtimeCompact.evidenceRefs, RUNTIME_COMPACT_MAX_EVIDENCE_REFS),
    artifactRefs: runtimeCompact.artifactRefs || buildRuntimeCompactArtifactRefs(),
    freshness: runtimeCompact.freshness || {},
    budgetMeta: runtimeCompact.budgetMeta || {
      profile: AGENT_CONTEXT_RUNTIME_COMPACT_PROFILE,
      digest: null,
      withinBudget: false,
      violationCount: 1,
      violations: ["缺少 runtime compact budget metadata"],
    },
    summary: payload
      ? `${runtimeCompact.truthRef?.activeBatchId || "-"} / ${runtimeCompact.alignmentRef?.status || "missing"} / ${runtimeCompact.actionRef?.nextAction || "-"}`
      : "缺少 agent-context 工件。",
  };
}

export function buildAgentContext({
  currentTruth = null,
  projectExpansionWave = null,
  projectValidationOverrides = null,
  monitor = null,
  memory = null,
  gate = null,
  referenceDistillation = null,
} = {}, options = {}) {
  const generationStage = options.generationStage === "post-gate"
    ? "post-gate"
    : "standalone";
  const validationDecision = summarizeValidationDecision(
    gate?.validationDecision || monitor?.validationDecision || null,
  );
  const expansionWave = summarizeExpansionWave(projectExpansionWave);
  const validationOverrides = summarizeValidationOverrides(projectValidationOverrides);
  const monitorSummary = summarizeMonitorContext(monitor);
  const memorySummary = summarizeMemoryContext(memory);
  const gateSummary = summarizeGateContext(gate);
  const releaseSummary = summarizeReleaseContext(monitor, gate);
  const delegationSummary = summarizeDelegationContext(monitor);
  const referenceDistillationSummary = referenceDistillation && typeof referenceDistillation === "object"
    ? {
      status: String(referenceDistillation.status || "").trim() || "idle",
      statusLabel: String(referenceDistillation.statusLabel || "").trim() || "空闲",
      summary: String(referenceDistillation.summary || "").trim() || "reference distillation idle",
      pendingCount: Number(referenceDistillation.pendingCount || 0),
      lastTopic: String(referenceDistillation.lastTopic || "").trim() || null,
      lastDistilledAt: String(referenceDistillation.lastDistilledAt || "").trim() || null,
      nextSuggestedAction: String(referenceDistillation.nextSuggestedAction || "").trim() || null,
    }
    : {
      status: "idle",
      statusLabel: "空闲",
      summary: "reference distillation idle",
      pendingCount: 0,
      lastTopic: null,
      lastDistilledAt: null,
      nextSuggestedAction: "继续优先走 REFERENCE_INDEX 路由。",
    };
  const driftSignals = evaluateAgentContextDrift({
    currentTruth,
    projectExpansionWave,
    projectValidationOverrides,
    monitor,
    memory,
    gate,
  });
  const sourceAlignment = buildSourceAlignment({
    currentTruth,
    monitor: monitorSummary,
    memory: memorySummary,
    gate: gateSummary,
    driftSignals,
    generationStage,
  });
  const decisionHints = pickDecisionHints({
    currentTruth,
    monitor: monitorSummary,
    memory: memorySummary,
    gate: gateSummary,
    validationDecision,
    driftSignals,
    generationStage,
  });
  const stableContext = {
    currentTruth: {
      present: currentTruth?.present === true,
      sourceFile: CURRENT_TRUTH_SOURCE_FILE,
      updatedAt: currentTruth?.updatedAt || null,
      activeBatchId: currentTruth?.activeBatchId || null,
      summary: currentTruth?.summary || "缺少 current truth 摘要。",
      excerpt: truncateList(currentTruth?.excerpt, 6),
    },
    expansionWave,
    validation: validationDecision,
    hostVisibleScope: {
      inScopeModules: expansionWave.inScopeModules,
      explicitVisualUpgradeModules: expansionWave.explicitVisualUpgradeModules,
      matchedDomain: validationDecision.matchedDomain,
      matchedProjectOverride: validationDecision.matchedProjectOverride,
      summary: expansionWave.present
        ? `${expansionWave.inScopeModules.join("、") || "未声明 in-scope 模块"} / visual ${expansionWave.explicitVisualUpgradeModules.join("、") || "未声明"}`
        : "缺少 expansion wave mirror。",
    },
    governance: {
      cleanroomSummary: "`docs/CURRENT_BACKLOG.md` 仍是单一事实源；`agent-context` 只做派生汇总。",
      validationOverrideSummary: validationOverrides.summary,
      truthWaveName: currentTruth?.currentWaveNameFromTruth || null,
      truthAcceptanceTrack: currentTruth?.acceptanceTrackFromTruth || null,
      truthMetaSchemaVersion: Number(currentTruth?.meta?.schemaVersion || 0) || null,
    },
  };
  stableContext.stableContextKey = hashObject({
    activeBatchId: stableContext.currentTruth.activeBatchId,
    updatedAt: stableContext.currentTruth.updatedAt,
    currentWaveName: expansionWave.currentWaveName,
    acceptanceTrack: expansionWave.acceptanceTrack,
    inScopeModules: expansionWave.inScopeModules,
    explicitVisualUpgradeModules: expansionWave.explicitVisualUpgradeModules,
    validationLevel: validationDecision.level,
    matchedDomain: validationDecision.matchedDomain,
    matchedProjectOverride: validationDecision.matchedProjectOverride,
    overrideCount: validationOverrides.overrideCount,
  });

  const dynamicContext = {
    monitor: monitorSummary,
    memory: memorySummary,
    gate: gateSummary,
    release: releaseSummary,
    delegation: delegationSummary,
    referenceDistillation: referenceDistillationSummary,
  };
  dynamicContext.dynamicFingerprint = hashObject({
    monitor: {
      generatedAt: monitorSummary.generatedAt,
      status: monitorSummary.status,
      nextAction: monitorSummary.nextAction,
      headline: monitorSummary.headline,
    },
    memory: {
      generatedAt: memorySummary.generatedAt,
      fingerprint: memorySummary.currentIncident?.fingerprint || null,
      recommendation: memorySummary.recommendation?.nextAction || null,
    },
    gate: {
      generatedAt: gateSummary.generatedAt,
      gatePassed: gateSummary.gatePassed,
      status: gateSummary.status,
      nextAction: gateSummary.nextAction,
      headline: gateSummary.headline,
    },
    release: {
      status: releaseSummary.status,
      remoteVerificationStatus: releaseSummary.remoteVerificationStatus,
    },
    delegation: {
      reviewWindowCount: delegationSummary.reviewWindowCount,
      changedPathCount: delegationSummary.changedPathCount,
    },
    referenceDistillation: {
      status: referenceDistillationSummary.status,
      pendingCount: referenceDistillationSummary.pendingCount,
      lastTopic: referenceDistillationSummary.lastTopic,
      lastDistilledAt: referenceDistillationSummary.lastDistilledAt,
    },
  });

  const context = {
    schemaVersion: AGENT_CONTEXT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceFreshness: {
      currentTruthUpdatedAt: currentTruth?.updatedAt || null,
      monitorGeneratedAt: monitor?.generatedAt || null,
      gateGeneratedAt: gate?.generatedAt || null,
      memoryGeneratedAt: memory?.generatedAt || null,
    },
    stableContext,
    dynamicContext,
    sourceAlignment,
    decisionHints,
    driftSignals,
  };
  context.runtimeCompact = buildRuntimeCompactView(context);
  return context;
}

export function renderAgentContextMarkdown(context) {
  const stable = context?.stableContext && typeof context.stableContext === "object"
    ? context.stableContext
    : {};
  const dynamic = context?.dynamicContext && typeof context.dynamicContext === "object"
    ? context.dynamicContext
    : {};
  const sourceAlignment = context?.sourceAlignment && typeof context.sourceAlignment === "object"
    ? context.sourceAlignment
    : {};
  const decision = context?.decisionHints && typeof context.decisionHints === "object"
    ? context.decisionHints
    : {};
  const drift = context?.driftSignals && typeof context.driftSignals === "object"
    ? context.driftSignals
    : {};
  const runtimeCompact = context?.runtimeCompact && typeof context.runtimeCompact === "object"
    ? context.runtimeCompact
    : buildRuntimeCompactView(context);
  const lines = [
    "# Agent Context",
    "",
    `- 生成时间: \`${context?.generatedAt || "-"}\``,
    `- Stable Context Key: \`${stable.stableContextKey || "-"}\``,
    `- Dynamic Fingerprint: \`${dynamic.dynamicFingerprint || "-"}\``,
    `- Drift 状态: \`${drift.status || "missing"}\` / warning \`${drift.warningCount ?? 0}\``,
    "",
    "## Runtime Compact",
    "",
    `- Profile: \`${runtimeCompact?.budgetMeta?.profile || AGENT_CONTEXT_RUNTIME_COMPACT_PROFILE}\``,
    `- Digest: \`${runtimeCompact?.budgetMeta?.digest || "-"}\``,
    `- Truth Ref: batch=\`${runtimeCompact?.truthRef?.activeBatchId || "-"}\` / wave=\`${runtimeCompact?.truthRef?.currentWaveName || "-"}\` / validation=\`${runtimeCompact?.truthRef?.validationLevel || "-"}\``,
    `- Alignment Ref: status=\`${runtimeCompact?.alignmentRef?.status || "missing"}\` / stage=\`${runtimeCompact?.alignmentRef?.generationStage || "missing"}\` / repair=\`${runtimeCompact?.alignmentRef?.preferredRepairCommand || "-"}\` / kinds=${(Array.isArray(runtimeCompact?.alignmentRef?.warningKinds) ? runtimeCompact.alignmentRef.warningKinds : []).join("、") || "-"}`,
    `- Action Ref: next=\`${runtimeCompact?.actionRef?.nextAction || "-"}\` / blocker=${runtimeCompact?.actionRef?.mainBlocker || "-"}`,
    `- Status Ref: monitor=\`${runtimeCompact?.statusRef?.monitorStatus || "-"}\` / gate=\`${runtimeCompact?.statusRef?.gateStatus || "-"}\` / memory=\`${runtimeCompact?.statusRef?.memoryFingerprint || runtimeCompact?.statusRef?.memoryStrategyLabel || "-"}\` / release=\`${runtimeCompact?.statusRef?.releaseStatus || "-"}\``,
    `- Drift Ref: \`${runtimeCompact?.driftRef?.status || "missing"}\` / warning \`${runtimeCompact?.driftRef?.warningCount ?? 0}\` / ${(Array.isArray(runtimeCompact?.driftRef?.warnings) ? runtimeCompact.driftRef.warnings : []).join("；") || "当前未检测到 drift warning"}`,
    `- Reference Distillation Ref: status=\`${runtimeCompact?.referenceDistillationRef?.status || "idle"}\` / pending=\`${runtimeCompact?.referenceDistillationRef?.pendingCount ?? 0}\` / topic=\`${runtimeCompact?.referenceDistillationRef?.lastTopic || "-"}\` / last=\`${runtimeCompact?.referenceDistillationRef?.lastDistilledAt || "-"}\` / next=\`${runtimeCompact?.referenceDistillationRef?.nextSuggestedAction || "-"}\``,
    `- Evidence Refs: ${(Array.isArray(runtimeCompact?.evidenceRefs) ? runtimeCompact.evidenceRefs : []).join("；") || "当前没有额外建议证据。"}`,
    `- Artifact Refs: truth=\`${runtimeCompact?.artifactRefs?.currentTruth || CURRENT_TRUTH_SOURCE_FILE}\` / monitor=\`${runtimeCompact?.artifactRefs?.monitor || "dist/agent-monitor.json"}\` / gate=\`${runtimeCompact?.artifactRefs?.gate || "dist/agent-gate.json"}\` / memory=\`${runtimeCompact?.artifactRefs?.memory || "dist/agent-memory.json"}\` / reference-intake=\`${runtimeCompact?.artifactRefs?.referenceIntake || "dist/agent-reference-intake/index.json"}\` / reference-distill=\`${runtimeCompact?.artifactRefs?.referenceDistill || "dist/agent-reference-distill/latest.json"}\` / context=\`${runtimeCompact?.artifactRefs?.contextJSON || "dist/agent-context.json"}\``,
    `- Freshness: truth=\`${runtimeCompact?.freshness?.currentTruthUpdatedAt || "-"}\` / monitor=\`${runtimeCompact?.freshness?.monitorGeneratedAt || "-"}\` / gate=\`${runtimeCompact?.freshness?.gateGeneratedAt || "-"}\` / memory=\`${runtimeCompact?.freshness?.memoryGeneratedAt || "-"}\``,
    `- Budget: \`${runtimeCompact?.budgetMeta?.withinBudget ? "within-budget" : "warning"}\` / violation \`${runtimeCompact?.budgetMeta?.violationCount ?? 0}\``,
    "",
    "## Full Evidence Pointers",
    "",
    `- Current truth: \`${runtimeCompact?.artifactRefs?.currentTruth || CURRENT_TRUTH_SOURCE_FILE}\``,
    `- Monitor artifact: \`${runtimeCompact?.artifactRefs?.monitor || "dist/agent-monitor.json"}\``,
    `- Gate artifact: \`${runtimeCompact?.artifactRefs?.gate || "dist/agent-gate.json"}\``,
    `- Memory artifact: \`${runtimeCompact?.artifactRefs?.memory || "dist/agent-memory.json"}\``,
    `- Reference intake artifact: \`${runtimeCompact?.artifactRefs?.referenceIntake || "dist/agent-reference-intake/index.json"}\``,
    `- Reference distill artifact: \`${runtimeCompact?.artifactRefs?.referenceDistill || "dist/agent-reference-distill/latest.json"}\``,
    `- Agent context JSON: \`${runtimeCompact?.artifactRefs?.contextJSON || "dist/agent-context.json"}\``,
    `- Agent context Markdown: \`${runtimeCompact?.artifactRefs?.contextMarkdown || "dist/agent-context.md"}\``,
    "",
    "## 审计附录：稳定上下文",
    "",
    `- Truth Source: \`${stable.currentTruth?.sourceFile || CURRENT_TRUTH_SOURCE_FILE}\``,
    `- Truth 更新时间: \`${context?.sourceFreshness?.currentTruthUpdatedAt || "-"}\``,
    `- Truth Active Batch: \`${stable.currentTruth?.activeBatchId || "-"}\``,
    `- Truth 摘要: ${stable.currentTruth?.summary || "缺少 current truth 摘要。"}`,
    `- 当前 Wave: \`${stable.expansionWave?.currentWaveName || "-"}\``,
    `- 验收主线: \`${stable.expansionWave?.acceptanceTrack || "-"}\``,
    `- Validation Level: \`${stable.validation?.levelLabel || stable.validation?.level || "-"}\``,
    `- Host-visible Scope: ${stable.hostVisibleScope?.summary || "缺少 host-visible scope 摘要。"}`,
    `- Clean-room / Governance: ${stable.governance?.cleanroomSummary || "-"}`,
    `- Source Alignment: \`${sourceAlignment.status || "missing"}\` / stage \`${sourceAlignment.generationStage || "missing"}\` / repair \`${sourceAlignment.preferredRepairCommand || "-"}\` / ${(Array.isArray(sourceAlignment.warningKinds) ? sourceAlignment.warningKinds : []).join("、") || "当前没有 source-level warning kind"}`,
    "",
    "## 审计附录：动态上下文",
    "",
    `- Monitor: ${dynamic.monitor?.summary || "缺少 agent-monitor 工件。"}`,
    `- Memory: ${dynamic.memory?.summary || "缺少 agent-memory 工件。"}`,
    `- Gate: ${dynamic.gate?.summary || "缺少 agent-gate 工件。"}`,
    `- Release: ${dynamic.release?.summary || "缺少 release-matrix 摘要。"}`,
    `- Delegation: ${dynamic.delegation?.summary || "缺少 delegation / validation context 摘要。"}`,
    `- Reference Distillation: ${dynamic.referenceDistillation?.summary || "reference distillation idle"}`,
    "",
    "## 决策提示",
    "",
    `- 下一步: \`${decision.nextAction || "-"}\``,
    `- 主阻断: ${decision.mainBlocker || "-"}`,
    `- 建议证据: ${truncateList(decision.recommendedEvidence, 6).join("；") || "当前没有额外建议证据。"}`,
    "",
    "## Drift Signals",
    "",
  ];

  if (!Array.isArray(drift.signals) || drift.signals.length === 0) {
    lines.push("- 当前未检测到上下文 drift。");
  } else {
    drift.signals.forEach((signal) => {
      lines.push(`- [${signal.kind || "warning"}] ${signal.message}`);
      if (signal.recommendation) {
        lines.push(`  - 建议: ${signal.recommendation}`);
      }
    });
  }
  lines.push("");
  return lines.join("\n");
}

export async function writeAgentContextArtifacts(projectRoot, context) {
  const artifacts = resolveAgentContextArtifacts(projectRoot);
  const markdown = renderAgentContextMarkdown(context);
  const archiveName = sanitizeArchiveSegment(context?.generatedAt || new Date().toISOString());
  const archiveJSON = path.join(artifacts.archiveDir, `${archiveName}.json`);
  const archiveMD = path.join(artifacts.archiveDir, `${archiveName}.md`);

  await fs.mkdir(artifacts.artifactsDir, { recursive: true });
  await fs.mkdir(artifacts.archiveDir, { recursive: true });
  await Promise.all([
    writeJSONArtifact(artifacts.reportJSON, context),
    fs.writeFile(artifacts.reportMD, `${markdown}\n`, "utf-8"),
    writeJSONArtifact(artifacts.latestJSON, context),
    fs.writeFile(artifacts.latestMD, `${markdown}\n`, "utf-8"),
    writeJSONArtifact(archiveJSON, context),
    fs.writeFile(archiveMD, `${markdown}\n`, "utf-8"),
  ]);

  return {
    reportJSON: artifacts.reportJSON,
    reportMD: artifacts.reportMD,
    latestJSON: artifacts.latestJSON,
    latestMD: artifacts.latestMD,
    archiveJSON,
    archiveMD,
  };
}

export async function loadAgentContextSources(projectRoot) {
  const [currentTruth, projectExpansionWave, projectValidationOverrides, monitor, memory, gate, referenceDistillation] = await Promise.all([
    readCurrentTruthContext(projectRoot),
    loadJSONIfExists(path.join(projectRoot, "config", "project-expansion-wave.json")),
    loadJSONIfExists(path.join(projectRoot, "config", "project-validation-overrides.json")),
    loadJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-monitor.json")),
    loadJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-memory.json")),
    loadJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-gate.json")),
    loadReferenceDistillationState(projectRoot),
  ]);
  return {
    currentTruth,
    projectExpansionWave,
    projectValidationOverrides,
    monitor,
    memory,
    gate,
    referenceDistillation,
  };
}
