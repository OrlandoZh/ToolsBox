import {
  buildPureVisualReaderFailureSummary,
  buildVisualPrimaryBlockerSummary,
  isPureVisualReaderFailure,
  pickPureVisualReaderNextAction,
} from "./agent-zotero-validation-lib.mjs";

function normalizeStatusSlice(source, extra = {}) {
  const record = source && typeof source === "object" ? source : {};
  return {
    status: record.status || "missing",
    statusLabel: record.statusLabel || "缺失",
    ageText: record.ageText || "-",
    latestTrigger: record.latestTrigger || null,
    ...extra,
  };
}

function getReaderEventSlice(e2e) {
  const readerEvent = e2e?.readerEventReport && typeof e2e.readerEventReport === "object"
    ? e2e.readerEventReport
    : {};
  return normalizeStatusSlice(readerEvent, {
    available: typeof readerEvent.available === "boolean" ? readerEvent.available : null,
    syntheticFallbackAvailable: typeof readerEvent.syntheticFallbackAvailable === "boolean"
      ? readerEvent.syntheticFallbackAvailable
      : null,
    knownTypeCount: readerEvent.knownTypeCount ?? null,
    probeCompatibleTypeCount: readerEvent.probeCompatibleTypeCount ?? null,
  });
}

function looksLikeCommand(text) {
  return /^(npm|node|bun|pnpm|yarn|npx)\b/u.test(String(text || "").trim());
}

function normalizeRunnableAction(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  if (looksLikeCommand(text)) {
    return text;
  }

  const backtickMatches = Array.from(text.matchAll(/`([^`]+)`/gu))
    .map((item) => String(item?.[1] || "").trim())
    .filter(Boolean);
  const commandMatch = backtickMatches.find((item) => looksLikeCommand(item));
  return commandMatch || null;
}

function isReaderEventRelevant(e2e) {
  const readerEvent = e2e?.readerEventReport && typeof e2e.readerEventReport === "object"
    ? e2e.readerEventReport
    : null;
  if (readerEvent?.present) {
    return true;
  }

  const capabilityStatuses = Array.isArray(e2e?.capabilityStatuses)
    ? e2e.capabilityStatuses
    : [];
  return capabilityStatuses.some((item) => item?.id === "reader-event-hooks" && item?.status !== "uncovered");
}

export function selectAgentNextAction(recommendations, context = {}) {
  const list = Array.isArray(recommendations) ? recommendations.filter(Boolean) : [];
  if (list.length === 0) {
    return null;
  }

  const watchStale = context.watchStatus && context.watchStatus !== "healthy";

  if (watchStale) {
    const watchPattern = /zotero:watch/u;
    const matched = list.find((item) => watchPattern.test(String(item)));
    return matched || "npm run zotero:watch";
  }

  const preferencePatterns = [];
  if (context.watchRecoveryStatus && context.watchRecoveryStatus === "failed") {
    preferencePatterns.push(/agent:zotero:watch-recovery/u);
  }
  if (context.e2eStatus && context.e2eStatus !== "passed") {
    if (context.pureVisualReaderFailure) {
      if (
        context.visualPrimaryBlockerKind === "baseline-geometry-mismatch"
        && context.visualCanonicalCoverageKind === "partial"
      ) {
        preferencePatterns.push(/agent:obsidian/u);
      } else if (
        context.visualPrimaryBlockerKind === "ui-regression-candidate"
        && context.visualCanonicalCoverageKind === "complete"
      ) {
        preferencePatterns.push(/agent:obsidian/u);
      } else if (context.visualPrimaryBlockerKind === "baseline-geometry-mismatch") {
        preferencePatterns.push(/agent:zotero:e2e:update-baseline|agent:zotero:e2e/u);
      } else {
        preferencePatterns.push(/agent:zotero:e2e/u);
      }
    } else {
      preferencePatterns.push(/agent:zotero:e2e|agent:zotero:autofix/u);
    }
  }
  if (context.readerEventStatus && context.readerEventStatus !== "passed") {
    preferencePatterns.push(/agent:zotero:e2e|zotero:scenario/u);
  }

  for (const pattern of preferencePatterns) {
    const matched = list.find((item) => pattern.test(String(item)));
    if (matched) {
      return matched;
    }
  }

  if (
    context.pureVisualReaderFailure
    && context.visualPrimaryBlockerKind === "baseline-geometry-mismatch"
    && context.visualCanonicalCoverageKind === "partial"
  ) {
    return "npm run agent:obsidian";
  }
  if (
    context.pureVisualReaderFailure
    && context.visualPrimaryBlockerKind === "ui-regression-candidate"
    && context.visualCanonicalCoverageKind === "complete"
  ) {
    return "npm run agent:obsidian";
  }

  const nonGeneric = list.find((item) => !String(item).includes("npm run agent:check"));
  return nonGeneric || list[0];
}

export function buildGateFrontpageSummary({
  gatePassed,
  profile,
  issues,
  recommendations,
  watchStatus,
  zoteroValidation,
}) {
  const normalizedIssues = Array.isArray(issues) ? issues.filter(Boolean) : [];
  const normalizedRecommendations = Array.isArray(recommendations) ? recommendations.filter(Boolean) : [];
  const watch = watchStatus && typeof watchStatus === "object" ? watchStatus : {};
  const e2e = zoteroValidation?.e2e && typeof zoteroValidation.e2e === "object" ? zoteroValidation.e2e : {};
  const recovery = zoteroValidation?.watchRecovery && typeof zoteroValidation.watchRecovery === "object"
    ? zoteroValidation.watchRecovery
    : {};
  const readerEvent = getReaderEventSlice(e2e);
  const pureVisualReaderFailure = isPureVisualReaderFailure(e2e);
  const pureVisualReaderSummary = buildPureVisualReaderFailureSummary(e2e);
  const selectedNextAction = selectAgentNextAction(normalizedRecommendations, {
    watchStatus: watch.status,
    e2eStatus: e2e.status,
    watchRecoveryStatus: recovery.status,
    readerEventStatus: readerEvent.status,
    pureVisualReaderFailure,
    visualPrimaryBlockerKind: e2e.visualPrimaryBlockerKind || null,
    visualCanonicalCoverageKind: e2e.visualCanonicalCoverageKind || null,
  });

  let headline = "当前已满足 agent 质量闸门，可继续推进后续开发或发布流程。";
  if (!gatePassed) {
    headline = normalizedIssues[0] || "当前未满足 agent 质量闸门，请先处理阻塞项。";
  } else if (watch.status === "healthy" && e2e.status === "passed" && recovery.status === "passed") {
    headline = "watch、真机验证与恢复回归均已通过，当前闭环状态稳定。";
  }

  return {
    gatePassed,
    profile: profile || "dev",
    status: gatePassed ? "ready" : "blocked",
    statusLabel: gatePassed ? "可继续" : "需先处理",
    headline,
    blockerCount: normalizedIssues.length,
    recommendationCount: normalizedRecommendations.length,
    primaryBlockers: normalizedIssues.slice(0, 5),
    nextAction: normalizeRunnableAction(selectedNextAction) || selectedNextAction,
    watch: normalizeStatusSlice(watch),
    e2e: normalizeStatusSlice(e2e, {
      strategy: e2e.strategy || null,
      readerEvent,
      visualPrimaryBlockerKind: e2e.visualPrimaryBlockerKind || "unknown",
      visualPrimaryBlockerKindLabel: e2e.visualPrimaryBlockerKindLabel || "未知视觉阻断",
      visualPrimaryBlockerSummary: pureVisualReaderSummary || buildVisualPrimaryBlockerSummary(e2e),
      visualGeometrySummary: e2e.visualGeometrySummary || null,
      visualCanonicalCoverageKind: e2e.visualCanonicalCoverageKind || "unknown",
      visualCanonicalCoverageKindLabel: e2e.visualCanonicalCoverageKindLabel || "canonical 基线覆盖待补证",
      visualCanonicalCoverageSummary: e2e.visualCanonicalCoverageSummary || null,
      visualCanonicalMismatchedTargets: Array.isArray(e2e.visualCanonicalMismatchedTargets)
        ? e2e.visualCanonicalMismatchedTargets
        : [],
    }),
    watchRecovery: normalizeStatusSlice(recovery),
  };
}

export function buildMonitorFrontpageSummary(summary) {
  const watch = summary.watchStatus && typeof summary.watchStatus === "object"
    ? summary.watchStatus
    : {};
  const zoteroValidation = summary.zoteroValidation && typeof summary.zoteroValidation === "object"
    ? summary.zoteroValidation
    : {};
  const e2e = zoteroValidation.e2e && typeof zoteroValidation.e2e === "object"
    ? zoteroValidation.e2e
    : {};
  const autofix = zoteroValidation.autofix && typeof zoteroValidation.autofix === "object"
    ? zoteroValidation.autofix
    : {};
  const watchRecovery = zoteroValidation.watchRecovery && typeof zoteroValidation.watchRecovery === "object"
    ? zoteroValidation.watchRecovery
    : {};
  const agentMemory = summary.agentMemory && typeof summary.agentMemory === "object"
    ? summary.agentMemory
    : {};
  const memoryRecommendation = agentMemory.recommendation && typeof agentMemory.recommendation === "object"
    ? agentMemory.recommendation
    : null;
  const readerEvent = getReaderEventSlice(e2e);
  const readerEventRelevant = isReaderEventRelevant(e2e);
  const pureVisualReaderFailure = isPureVisualReaderFailure(e2e);
  const visualPrimaryBlockerSummary = buildPureVisualReaderFailureSummary(e2e)
    || buildVisualPrimaryBlockerSummary(e2e);
  const pureVisualNextAction = pureVisualReaderFailure
    ? pickPureVisualReaderNextAction(e2e)
    : null;

  const primarySignals = [];
  if (!watch.present) {
    primarySignals.push("缺少 Zotero watch 状态产物，无法确认热重载链路。");
  } else if (watch.status !== "healthy") {
    primarySignals.push(`Zotero watch 当前为 ${watch.statusLabel || watch.status || "异常"}。`);
  }

  if (!e2e.present) {
    primarySignals.push("缺少 Zotero 真机 E2E 产物，无法确认插件功能闭环。");
  } else if (e2e.status !== "passed") {
    primarySignals.push(
      (pureVisualReaderFailure && visualPrimaryBlockerSummary)
        || e2e.note
        || e2e.primaryDiagnosis?.summary
        || `Zotero 真机验证当前为 ${e2e.statusLabel || e2e.status || "异常"}。`,
    );
  }

  if (!watchRecovery.present) {
    primarySignals.push("缺少恢复回归产物，尚未验证 watch 故障后的恢复韧性。");
  } else if (watchRecovery.status !== "passed") {
    primarySignals.push(
      watchRecovery.summaryNote
        || `恢复回归当前为 ${watchRecovery.statusLabel || watchRecovery.status || "异常"}。`,
    );
  }

  if (readerEventRelevant) {
    if (readerEvent.status === "missing") {
      primarySignals.push("Reader 事件桥摘要缺失，无法确认事件 Hook 与探针回放能力。");
    } else if (readerEvent.status !== "passed") {
      primarySignals.push(
        e2e.readerEventReport?.note
          || `Reader 事件桥当前为 ${readerEvent.statusLabel || readerEvent.status || "异常"}。`,
      );
    } else if (readerEvent.syntheticFallbackAvailable === false) {
      primarySignals.push("Reader 事件桥缺少 synthetic-fallback，agent 无法稳定回放细粒度事件探针。");
    }
  }

  if (autofix.present && autofix.status === "unrecovered") {
    primarySignals.push("最近自动修复未恢复成功，建议回看补丁计划与诊断。");
  }

  const stable = watch.status === "healthy"
    && e2e.status === "passed"
    && watchRecovery.status === "passed"
    && (
      !readerEventRelevant
      || (
        readerEvent.status === "passed"
        && readerEvent.syntheticFallbackAvailable !== false
      )
    );
  const incomplete = primarySignals.length > 0
    && primarySignals.every((item) => item.includes("缺少"));

  let status = "attention";
  let statusLabel = "需关注";
  let headline = primarySignals[0] || "当前监控已生成，可继续查看详细诊断。";
  if (stable) {
    status = autofix.status === "recovered" ? "recovered" : "stable";
    statusLabel = autofix.status === "recovered" ? "已恢复稳定" : "稳定";
    headline = autofix.status === "recovered"
      ? "watch、真机验证与恢复回归均正常，最近一次自动修复已帮助链路恢复到稳定状态。"
      : "watch、真机验证与恢复回归均正常，当前可作为 agent 持续开发的稳定基线。";
  } else if (incomplete) {
    status = "incomplete";
    statusLabel = "信息不完整";
    headline = primarySignals[0];
  }

  if (
    !stable
    && memoryRecommendation?.summary
    && (e2e.status !== "passed" || autofix.status === "unrecovered")
    && !pureVisualReaderFailure
  ) {
    headline = `${headline} 历史建议：${memoryRecommendation.summary}`;
  }

  return {
    status,
    statusLabel,
    headline,
    primarySignals: primarySignals.slice(0, 5),
    nextAction: pickMonitorNextAction({
      watch,
      e2e,
      autofix,
      watchRecovery,
      memoryRecommendation,
      readerEvent,
      readerEventRelevant,
      pureVisualReaderFailure,
    }),
    memoryRecommendation,
    watch: normalizeStatusSlice(watch),
    e2e: normalizeStatusSlice(e2e, {
      strategy: e2e.strategy || null,
      readerEvent,
      visualPrimaryBlockerKind: e2e.visualPrimaryBlockerKind || "unknown",
      visualPrimaryBlockerKindLabel: e2e.visualPrimaryBlockerKindLabel || "未知视觉阻断",
      visualPrimaryBlockerSummary,
      visualGeometrySummary: e2e.visualGeometrySummary || null,
      visualCanonicalCoverageKind: e2e.visualCanonicalCoverageKind || "unknown",
      visualCanonicalCoverageKindLabel: e2e.visualCanonicalCoverageKindLabel || "canonical 基线覆盖待补证",
      visualCanonicalCoverageSummary: e2e.visualCanonicalCoverageSummary || null,
      visualCanonicalMismatchedTargets: Array.isArray(e2e.visualCanonicalMismatchedTargets)
        ? e2e.visualCanonicalMismatchedTargets
        : [],
    }),
    autofix: {
      status: autofix.status || "missing",
      statusLabel: autofix.statusLabel || "缺失",
      ageText: autofix.ageText || "-",
      attempts: autofix.attempts ?? 0,
      patchPlanStatus: autofix.patchPlanStatus || "missing",
      patchPlanStatusLabel: autofix.patchPlanStatusLabel || "缺失",
    },
    watchRecovery: normalizeStatusSlice(watchRecovery),
    latestRun: summary.latest
      ? {
        runName: summary.latest.runName || null,
        status: summary.latest.success ? "passed" : "failed",
        exitCode: summary.latest.exitCode ?? null,
        startedAtISO: summary.latest.startedAtISO || null,
      }
      : null,
  };
}

function pickMonitorNextAction({
  watch,
  e2e,
  autofix,
  watchRecovery,
  memoryRecommendation,
  readerEvent,
  readerEventRelevant,
  pureVisualReaderFailure,
}) {
  if (!watch.present || watch.status !== "healthy") {
    return "npm run zotero:watch";
  }
  if (!e2e.present || e2e.status !== "passed") {
    if (pureVisualReaderFailure) {
      return pickPureVisualReaderNextAction(e2e) || "npm run agent:zotero:e2e";
    }
    return memoryRecommendation?.nextAction || "npm run agent:zotero:e2e";
  }
  if (
    readerEventRelevant
    && (
      readerEvent?.status !== "passed"
      || readerEvent?.syntheticFallbackAvailable === false
    )
  ) {
    return "npm run agent:zotero:e2e";
  }
  if (!watchRecovery.present || watchRecovery.status !== "passed") {
    return "npm run agent:zotero:watch-recovery";
  }
  if (autofix.present && autofix.status === "unrecovered") {
    return memoryRecommendation?.nextAction || "npm run agent:zotero:autofix";
  }
  return "npm run agent:gate";
}
