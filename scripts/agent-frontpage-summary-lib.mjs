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

function isVisualFocusedAction(text) {
  return /agent:obsidian|agent:zotero:e2e:update-baseline/u.test(String(text || ""));
}

function findRunnableRecommendation(recommendations, pattern) {
  const list = Array.isArray(recommendations) ? recommendations : [];
  const matched = list.find((item) => pattern.test(String(item || "")));
  return normalizeRunnableAction(matched) || null;
}

function selectReleaseNextAction(recommendations, issues = [], releaseMatrix = null) {
  const list = Array.isArray(recommendations) ? recommendations.filter(Boolean) : [];
  const normalizedIssues = Array.isArray(issues) ? issues.filter(Boolean) : [];
  const matrix = releaseMatrix && typeof releaseMatrix === "object" ? releaseMatrix : {};
  const profiles = Array.isArray(matrix.profiles) ? matrix.profiles : [];
  const remoteVerification = matrix.remoteVerification && typeof matrix.remoteVerification === "object"
    ? matrix.remoteVerification
    : null;

  if (
    normalizedIssues.some((item) => String(item).includes("release-plan"))
    || matrix.present === false
    || matrix.status === "missing"
  ) {
    return findRunnableRecommendation(list, /npm run agent:release/u) || "npm run agent:release";
  }

  const installSmokeTargets = profiles.filter((profile) => {
    if (!profile || typeof profile !== "object") {
      return false;
    }
    return profile.installSmokePresent !== true || profile.installSmokePassed !== true;
  });
  if (installSmokeTargets.length > 0) {
    const stableMissing = installSmokeTargets.some((profile) => profile.id === "stable");
    const betaMissing = installSmokeTargets.some((profile) => profile.id === "beta");
    if (stableMissing) {
      return findRunnableRecommendation(list, /npm run release:install-smoke:stable/u)
        || "npm run release:install-smoke:stable";
    }
    if (betaMissing) {
      return findRunnableRecommendation(list, /npm run release:install-smoke:beta/u)
        || "npm run release:install-smoke:beta";
    }
  }

  if (remoteVerification && (remoteVerification.status !== "passed" || remoteVerification.releaseReady !== true)) {
    return findRunnableRecommendation(list, /npm run release:preflight -- --verify-remote/u)
      || "npm run release:preflight -- --verify-remote";
  }

  if (matrix.status && matrix.status !== "passed") {
    return findRunnableRecommendation(list, /npm run release:matrix/u) || "npm run release:matrix";
  }

  return findRunnableRecommendation(list, /npm run agent:release|npm run release:matrix|npm run release:prepare|npm run release:preflight/u)
    || null;
}

function buildValidationPipelineAction(level, deferredEvidenceAction = null) {
  if (level === "visual-not-needed") {
    return "当前批次默认无需视觉阻断；先执行 `npm run check` -> `npm run agent:zotero:e2e` -> `npm run agent:monitor` / `npm run agent:gate` 完成功能闭环。";
  }
  if (level === "visual-recommended") {
    return deferredEvidenceAction
      ? `当前批次建议先执行 \`npm run check\` -> \`npm run agent:zotero:e2e\` -> \`npm run agent:monitor\` / \`npm run agent:gate\` 完成功能闭环；${deferredEvidenceAction}`
      : "当前批次建议先执行 `npm run check` -> `npm run agent:zotero:e2e` -> `npm run agent:monitor` / `npm run agent:gate` 完成功能闭环，再补一轮视觉证据归档。";
  }
  return null;
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

function normalizeReferenceDistillationSlice(source) {
  const record = source && typeof source === "object" ? source : {};
  const status = String(record.status || "").trim() || "idle";
  return {
    status,
    statusLabel: String(record.statusLabel || "").trim() || "空闲",
    pendingCount: Math.max(0, Number(record.pendingCount || 0)),
    lastTopic: String(record.lastTopic || "").trim() || null,
    lastDistilledAt: String(record.lastDistilledAt || "").trim() || null,
    nextSuggestedAction: String(record.nextSuggestedAction || "").trim() || null,
    summary: String(record.summary || "").trim() || "reference distillation idle",
  };
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
      } else if (context.visualPrimaryBlockerKind === "capture-command-failed") {
        preferencePatterns.push(/agent:zotero:e2e/u);
      } else if (
        context.visualPrimaryBlockerKind === "ui-regression-candidate"
        && context.visualCanonicalCoverageKind === "complete"
      ) {
        preferencePatterns.push(/agent:obsidian/u);
      } else if (context.visualPrimaryBlockerKind === "baseline-geometry-mismatch") {
        preferencePatterns.push(/agent:zotero:e2e:update-baseline/u);
        preferencePatterns.push(/agent:zotero:e2e/u);
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
  validationDecision = null,
  releaseMatrix = null,
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
  const actionCandidates = validationDecision?.level && validationDecision.level !== "visual-required"
    ? normalizedRecommendations.filter((item) => !isVisualFocusedAction(item))
    : normalizedRecommendations;
  const selectedNextAction = profile === "release"
    ? selectReleaseNextAction(actionCandidates, normalizedIssues, releaseMatrix)
    : selectAgentNextAction(actionCandidates, {
      watchStatus: watch.status,
      e2eStatus: e2e.status,
      watchRecoveryStatus: recovery.status,
      readerEventStatus: readerEvent.status,
      pureVisualReaderFailure,
      visualPrimaryBlockerKind: e2e.visualPrimaryBlockerKind || null,
      visualCanonicalCoverageKind: e2e.visualCanonicalCoverageKind || null,
    });
  const normalizedSelectedNextAction = normalizeRunnableAction(selectedNextAction) || selectedNextAction;
  const validationPipelineAction = (!gatePassed && watch.status === "healthy" && validationDecision?.level !== "visual-required")
    ? buildValidationPipelineAction(validationDecision?.level, validationDecision?.deferredEvidenceAction)
    : null;
  const preferConcreteRecoveryAction = recovery.status === "failed" || watch.status !== "healthy";

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
    nextAction: (preferConcreteRecoveryAction ? normalizedSelectedNextAction : null)
      || validationPipelineAction
      || normalizedSelectedNextAction
      || "npm run agent:check",
    validationDecision: validationDecision
      ? {
        level: validationDecision.level,
        levelLabel: validationDecision.levelLabel,
        decisionSource: validationDecision.decisionSource || validationDecision.source || "unknown",
        reasons: Array.isArray(validationDecision.reasons) ? validationDecision.reasons : [],
        matchedDomain: Array.isArray(validationDecision.matchedDomain) ? validationDecision.matchedDomain : [],
        matchedProjectOverride: Array.isArray(validationDecision.matchedProjectOverride)
          ? validationDecision.matchedProjectOverride
          : [],
        requiredChecks: Array.isArray(validationDecision.requiredChecks)
          ? validationDecision.requiredChecks
          : [],
        requiredEvidence: Array.isArray(validationDecision.requiredEvidence) ? validationDecision.requiredEvidence : [],
        escalatedByRuntimeSignals: validationDecision.escalatedByRuntimeSignals === true,
        deferredEvidenceAction: validationDecision.deferredEvidenceAction || null,
      }
      : null,
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
  const validationDecision = summary.validationDecision && typeof summary.validationDecision === "object"
    ? summary.validationDecision
    : null;
  const referenceDistillation = normalizeReferenceDistillationSlice(summary.referenceDistillation);
  const visualPrimaryBlockerSummary = buildPureVisualReaderFailureSummary(e2e)
    || buildVisualPrimaryBlockerSummary(e2e);
  const pureVisualNextAction = pureVisualReaderFailure
    ? pickPureVisualReaderNextAction(e2e)
    : null;
  const readerEventHealthy = !readerEventRelevant
    || (
      readerEvent.status === "passed"
      && readerEvent.syntheticFallbackAvailable !== false
    );
  const stable = watch.status === "healthy"
    && e2e.status === "passed"
    && watchRecovery.status === "passed"
    && readerEventHealthy;

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

  if (!stable && autofix.present && autofix.status === "unrecovered") {
    primarySignals.push("最近自动修复未恢复成功，建议回看补丁计划与诊断。");
  }
  const advisorySignals = [];
  if (referenceDistillation.status === "pending" && referenceDistillation.pendingCount > 0) {
    advisorySignals.push(`reference distillation pending：${referenceDistillation.pendingCount} 个 topic 等待在 fresh sync 后整理。`);
  } else if (referenceDistillation.status === "queued") {
    advisorySignals.push("reference distillation queued in background。");
  } else if (referenceDistillation.status === "failed") {
    advisorySignals.push("last reference distillation failed。");
  }
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
    advisorySignals: advisorySignals.slice(0, 3),
    nextAction: pickMonitorNextAction({
      watch,
      e2e,
      autofix,
      watchRecovery,
      memoryRecommendation,
      readerEvent,
      readerEventRelevant,
      pureVisualReaderFailure,
      validationDecision,
      stable,
    }),
    validationDecision: validationDecision
      ? {
        level: validationDecision.level,
        levelLabel: validationDecision.levelLabel,
        decisionSource: validationDecision.decisionSource || validationDecision.source || "unknown",
        reasons: Array.isArray(validationDecision.reasons) ? validationDecision.reasons : [],
        matchedDomain: Array.isArray(validationDecision.matchedDomain) ? validationDecision.matchedDomain : [],
        matchedProjectOverride: Array.isArray(validationDecision.matchedProjectOverride)
          ? validationDecision.matchedProjectOverride
          : [],
        requiredChecks: Array.isArray(validationDecision.requiredChecks)
          ? validationDecision.requiredChecks
          : [],
        requiredEvidence: Array.isArray(validationDecision.requiredEvidence) ? validationDecision.requiredEvidence : [],
        escalatedByRuntimeSignals: validationDecision.escalatedByRuntimeSignals === true,
        deferredEvidenceAction: validationDecision.deferredEvidenceAction || null,
      }
      : null,
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
    referenceDistillation,
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
  validationDecision,
  stable,
}) {
  if (!watch.present || watch.status !== "healthy") {
    return "npm run zotero:watch";
  }
  if (!e2e.present || e2e.status !== "passed") {
    if (validationDecision?.level === "visual-not-needed") {
      return buildValidationPipelineAction("visual-not-needed");
    }
    if (validationDecision?.level === "visual-recommended") {
      return buildValidationPipelineAction("visual-recommended", validationDecision?.deferredEvidenceAction);
    }
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
  if (stable) {
    return "npm run agent:gate";
  }
  if (autofix.present && autofix.status === "unrecovered") {
    return memoryRecommendation?.nextAction || "npm run agent:zotero:autofix";
  }
  return "npm run agent:gate";
}
