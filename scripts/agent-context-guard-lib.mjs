import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  buildRuntimeCompactView,
  evaluateAgentContextDrift,
  evaluateRuntimeCompactBudget,
  loadAgentContextSources,
  summarizeAgentContextSnapshot,
} from "./agent-context-lib.mjs";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";

function parseGeneratedAtMs(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
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

async function readJSONArtifact(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return {
      filePath,
      present: true,
      invalid: false,
      payload: JSON.parse(content),
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        filePath,
        present: false,
        invalid: false,
        payload: null,
      };
    }
    if (error instanceof SyntaxError) {
      return {
        filePath,
        present: true,
        invalid: true,
        payload: null,
      };
    }
    throw error;
  }
}

function buildSignal(id, kind, message, recommendation) {
  return {
    id,
    kind,
    status: "warning",
    severity: "warning",
    message,
    recommendation: recommendation || null,
  };
}

function listMissingTopLevelSections(payload) {
  const required = [
    "schemaVersion",
    "generatedAt",
    "sourceFreshness",
    "stableContext",
    "dynamicContext",
    "decisionHints",
    "driftSignals",
  ];
  return required.filter((key) => !Object.prototype.hasOwnProperty.call(payload || {}, key));
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

export function buildAgentContextGuardIssue(result) {
  if (!result || result.warningCount <= 0) {
    return null;
  }
  return result.warnings[0]?.message || result.message || null;
}

export function buildAgentContextGuardRecommendation(result) {
  if (!result || result.warningCount <= 0) {
    return null;
  }
  return result.warnings[0]?.recommendation || "优先执行 `npm run agent:context` 刷新当前上下文工件。";
}

export async function evaluateAgentContextGuard(projectRoot, options = {}) {
  const strict = options.strict === true;
  const contextArtifact = await readJSONArtifact(resolveAgentArtifactPath(projectRoot, "agent-context.json"));
  const sources = await loadAgentContextSources(projectRoot);
  const warnings = [];

  if (!contextArtifact.present) {
    warnings.push(buildSignal(
      "missing-agent-context",
      "missing-required-section",
      "缺少 agent-context 工件，当前无法确认统一上下文是否与最新工件一致。",
      "先执行 `npm run agent:context`，再根据需要运行 `npm run agent:context:guard`。",
    ));
  } else if (contextArtifact.invalid) {
    warnings.push(buildSignal(
      "invalid-agent-context",
      "missing-required-section",
      `agent-context 工件不是合法 JSON：${contextArtifact.filePath}`,
      "重新执行 `npm run agent:context`，覆盖损坏的上下文工件。",
    ));
  } else {
    const payload = contextArtifact.payload && typeof contextArtifact.payload === "object"
      ? contextArtifact.payload
      : {};
    const missingSections = listMissingTopLevelSections(payload);
    if (missingSections.length > 0) {
      warnings.push(buildSignal(
        "agent-context-missing-sections",
        "missing-required-section",
        `agent-context 缺少必需段落：${missingSections.join("、")}。`,
        "重新执行 `npm run agent:context`，确保上下文工件包含完整 top-level 字段。",
      ));
    }

    if (!payload.runtimeCompact || typeof payload.runtimeCompact !== "object") {
      warnings.push(buildSignal(
        "agent-context-missing-runtime-compact",
        "missing-required-section",
        "agent-context 缺少 runtime-compact-v1 视图，当前无法确认运行时上下文是否已被压缩收口。",
        "重新执行 `npm run agent:context`，生成最新 compact view。",
      ));
    }

    const runtimeCompact = payload.runtimeCompact && typeof payload.runtimeCompact === "object"
      ? payload.runtimeCompact
      : buildRuntimeCompactView(payload);
    const compactBudget = evaluateRuntimeCompactBudget(runtimeCompact);
    const compactStrings = collectObjectStringValues(runtimeCompact);
    const embeddedSummaryCandidates = [
      payload?.stableContext?.currentTruth?.summary,
      payload?.dynamicContext?.monitor?.summary,
      payload?.dynamicContext?.memory?.summary,
      payload?.dynamicContext?.gate?.summary,
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const inlinedLongSummaries = embeddedSummaryCandidates.filter((summary) => compactStrings.includes(summary));
    if (inlinedLongSummaries.length > 0) {
      warnings.push(buildSignal(
        "runtime-compact-inline-summary",
        "compaction-inline-summary",
        `runtime compact 误内联了 ${inlinedLongSummaries.length} 条 full summary，当前压缩层可能重新膨胀。`,
        "收紧 compact builder，只保留 ref / fingerprint / artifact refs，不要内联 full summary。",
      ));
    }
    if (Array.isArray(compactBudget.missingArtifactKeys) && compactBudget.missingArtifactKeys.length > 0) {
      warnings.push(buildSignal(
        "runtime-compact-missing-artifact-refs",
        "missing-artifact-refs",
        `runtime compact 缺少必需 artifact refs：${compactBudget.missingArtifactKeys.join("、")}。`,
        "补齐 compact view 的 truth / monitor / gate / memory / context artifact refs。",
      ));
    }
    if (!compactBudget.withinBudget) {
      warnings.push(buildSignal(
        "runtime-compact-budget-exceeded",
        "budget-exceeded",
        `runtime compact 超出既定预算：${compactBudget.violations.join("；")}。`,
        "收紧 compact 文本长度、warning 数量与 evidence refs 数量，保持 compact view 稳定在预算内。",
      ));
    }

    const contextGeneratedAtMs = parseGeneratedAtMs(payload.generatedAt);
    const monitorGeneratedAtMs = parseGeneratedAtMs(sources.monitor?.generatedAt);
    if (contextGeneratedAtMs !== null && monitorGeneratedAtMs !== null && contextGeneratedAtMs < monitorGeneratedAtMs) {
      warnings.push(buildSignal(
        "context-older-than-monitor",
        "freshness-mismatch",
        "agent-context 早于最新 monitor，当前上下文工件已经过期。",
        "先执行 `npm run agent:context`，让上下文重新对齐最新 monitor。",
      ));
    }

    const contextTruthUpdatedAtMs = parseGeneratedAtMs(payload.sourceFreshness?.currentTruthUpdatedAt);
    const latestTruthUpdatedAtMs = parseGeneratedAtMs(sources.currentTruth?.updatedAt);
    if (contextTruthUpdatedAtMs !== null && latestTruthUpdatedAtMs !== null && contextTruthUpdatedAtMs < latestTruthUpdatedAtMs) {
      warnings.push(buildSignal(
        "context-older-than-current-truth",
        "freshness-mismatch",
        "current truth 已更新，但 agent-context 仍在引用旧的 truth 时间戳。",
        "先同步 `docs/CURRENT_BACKLOG.md`，再执行 `npm run agent:context`。",
      ));
    }

    const actualWave = String(sources.projectExpansionWave?.currentWaveName || "").trim() || null;
    const contextWave = String(payload.stableContext?.expansionWave?.currentWaveName || "").trim() || null;
    if (actualWave && contextWave && actualWave !== contextWave) {
      warnings.push(buildSignal(
        "context-wave-mismatch",
        "scope-mismatch",
        `agent-context 记录的 wave 为 ${contextWave}，但当前 mirror 为 ${actualWave}。`,
        "先刷新 current truth / mirror，再重新执行 `npm run agent:context`。",
      ));
    }

    const contextNextAction = normalizeCommand(payload.decisionHints?.nextAction);
    const latestNextAction = normalizeCommand(
      sources.gate?.frontpageSummary?.nextAction
      || sources.monitor?.frontpageSummary?.nextAction,
    );
    if (contextNextAction && latestNextAction && contextNextAction !== latestNextAction) {
      warnings.push(buildSignal(
        "context-next-action-conflict",
        "next-action-conflict",
        `agent-context 的 nextAction 为 ${contextNextAction}，但最新 gate / monitor 建议为 ${latestNextAction}。`,
        "重新执行 `npm run agent:context`，让 nextAction 与最新工件重新对齐。",
      ));
    }
  }

  const sourceLevelDrift = evaluateAgentContextDrift(sources);
  warnings.push(...sourceLevelDrift.signals);

  const snapshot = summarizeAgentContextSnapshot(contextArtifact.payload);
  const status = warnings.length > 0 ? "warning" : "passed";
  return {
    projectRoot,
    artifactPath: contextArtifact.filePath,
    strict,
    status,
    ok: warnings.length === 0,
    violation: strict && warnings.length > 0,
    warningCount: warnings.length,
    message: warnings[0]?.message || "Agent context guard passed: current context is aligned.",
    recommendation: warnings[0]?.recommendation || null,
    warnings,
    context: snapshot,
    sourceFreshness: {
      currentTruthUpdatedAt: sources.currentTruth?.updatedAt || null,
      monitorGeneratedAt: sources.monitor?.generatedAt || null,
      gateGeneratedAt: sources.gate?.generatedAt || null,
      memoryGeneratedAt: sources.memory?.generatedAt || null,
    },
  };
}
