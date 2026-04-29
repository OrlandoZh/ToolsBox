const CATEGORY_LABELS = Object.freeze({
  args: "参数错误",
  config: "配置错误",
  environment: "环境错误",
  execution: "执行错误",
  validation: "验证错误",
  timeout: "超时错误",
});

const PERFORMANCE_RECOMMENDATION_SEVERITY_RANK = Object.freeze({
  high: 3,
  medium: 2,
  low: 1,
});

function normalizeCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, normalized)
    ? normalized
    : null;
}

function normalizeNumber(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function isPresent(summary) {
  return summary && typeof summary === "object" && summary.present === true;
}

function buildReportRefs(...summaries) {
  const refs = [];
  for (const summary of summaries) {
    if (!summary || typeof summary !== "object") {
      continue;
    }
    if (summary.reportJSON) {
      refs.push(String(summary.reportJSON));
    }
    if (summary.reportMD) {
      refs.push(String(summary.reportMD));
    }
  }
  return Array.from(new Set(refs));
}

function collectValidationFailure(source, summary) {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const category = normalizeCategory(summary.errorCategory);
  if (!category) {
    return null;
  }

  return {
    source,
    category,
    label: CATEGORY_LABELS[category],
    failedStage: String(summary.failedStage || "").trim() || null,
  };
}

function buildValidationCategorySummary(entries) {
  const categoryMap = new Map();
  entries.forEach((entry) => {
    if (!entry) {
      return;
    }
    if (!categoryMap.has(entry.category)) {
      categoryMap.set(entry.category, {
        category: entry.category,
        label: entry.label,
        count: 0,
        sources: new Set(),
        failedStages: new Set(),
      });
    }
    const current = categoryMap.get(entry.category);
    current.count += 1;
    current.sources.add(entry.source);
    if (entry.failedStage) {
      current.failedStages.add(entry.failedStage);
    }
  });

  return Array.from(categoryMap.values())
    .map((entry) => ({
      category: entry.category,
      label: entry.label,
      count: entry.count,
      sources: Array.from(entry.sources),
      failedStages: Array.from(entry.failedStages),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-CN"));
}

export function buildPerformanceRecommendations({
  performanceBudget = null,
  cpuProfiler = null,
  memoryDiagnostics = null,
} = {}) {
  const recommendations = [];
  const pushRecommendation = (entry) => {
    recommendations.push({
      kind: entry.kind,
      severity: entry.severity || "low",
      title: entry.title,
      summary: entry.summary,
      recommendedAction: entry.recommendedAction,
      supportingSignals: Array.isArray(entry.supportingSignals) ? entry.supportingSignals : [],
      reportRefs: Array.isArray(entry.reportRefs) ? entry.reportRefs : [],
      advisory: true,
      gateEffect: "non-blocking",
    });
  };

  if (normalizeNumber(performanceBudget?.violationCount, 0) > 0) {
    pushRecommendation({
      kind: "performance-budget-violations",
      severity: "high",
      title: "性能预算存在超限 action",
      summary: performanceBudget?.violationSummary || performanceBudget?.summary || "performanceBudget 记录到超预算项。",
      recommendedAction: "先查看 `performanceBudget` 超预算 action，再按 action 复跑 CPU profiler / memory diagnostics 做归因。",
      supportingSignals: [
        `violationCount=${normalizeNumber(performanceBudget?.violationCount, 0)}`,
        `activities=${normalizeNumber(performanceBudget?.measuredActivityCount, 0)}/${normalizeNumber(performanceBudget?.expectedActivityCount, 0)}`,
      ],
      reportRefs: buildReportRefs(performanceBudget),
    });
  }

  if (normalizeNumber(cpuProfiler?.currentPluginCpuPercent, 0) >= 25) {
    pushRecommendation({
      kind: "current-plugin-cpu-hotspot",
      severity: "high",
      title: "当前插件 CPU 占比偏高",
      summary: `Current Plugin CPU ${normalizeNumber(cpuProfiler?.currentPluginCpuPercent, 0)}%，top action 为 ${cpuProfiler?.topAction?.label || cpuProfiler?.topAction?.actionId || "未知"}。`,
      recommendedAction: "使用 `npm run agent:zotero:profile -- --include-details` 定位插件 stack，并优先检查 top action 的同步循环、重复渲染或高频监听器。",
      supportingSignals: [
        `currentPluginCpuPercent=${normalizeNumber(cpuProfiler?.currentPluginCpuPercent, 0)}`,
        `topBucket=${cpuProfiler?.topBucket?.label || "-"}`,
      ],
      reportRefs: buildReportRefs(cpuProfiler),
    });
  }

  if (normalizeNumber(cpuProfiler?.unknownCpuPercent, 0) >= 30) {
    pushRecommendation({
      kind: "unknown-cpu-attribution",
      severity: "medium",
      title: "Unknown CPU 归因偏高",
      summary: `Unknown CPU ${normalizeNumber(cpuProfiler?.unknownCpuPercent, 0)}%，当前 CPU 归因仍有较大未知段。`,
      recommendedAction: "打开 profiler details，检查 unknown stack、第三方扩展资源和宿主噪声；必要时用干净 Zotero profile 做对照。",
      supportingSignals: [
        `unknownCpuPercent=${normalizeNumber(cpuProfiler?.unknownCpuPercent, 0)}`,
      ],
      reportRefs: buildReportRefs(cpuProfiler),
    });
  }

  const rssDeltaMb = normalizeNumber(memoryDiagnostics?.rssDeltaMb, 0);
  const residentDeltaMb = normalizeNumber(memoryDiagnostics?.residentDeltaMb, 0);
  const explicitDeltaMb = normalizeNumber(memoryDiagnostics?.explicitDeltaMb, 0);
  if (rssDeltaMb >= 20 || residentDeltaMb >= 20 || explicitDeltaMb >= 10) {
    pushRecommendation({
      kind: "memory-growth",
      severity: "medium",
      title: "内存增长需要复核",
      summary: `RSS delta ${rssDeltaMb} MB，resident delta ${residentDeltaMb} MB，explicit delta ${explicitDeltaMb} MB；top growing action 为 ${memoryDiagnostics?.topGrowingAction?.label || memoryDiagnostics?.topGrowingAction?.actionId || "未知"}。`,
      recommendedAction: "复跑 `npm run agent:zotero:memory -- --include-details`，优先检查 top growing action 的缓存、DOM 节点持有和未释放监听器。",
      supportingSignals: [
        `rssDeltaMb=${rssDeltaMb}`,
        `residentDeltaMb=${residentDeltaMb}`,
        `explicitDeltaMb=${explicitDeltaMb}`,
      ],
      reportRefs: buildReportRefs(memoryDiagnostics),
    });
  }

  const cpuFailed = normalizeNumber(cpuProfiler?.failedActivityCount, 0);
  const memoryFailed = normalizeNumber(memoryDiagnostics?.failedActivityCount, 0);
  if (cpuFailed > 0 || memoryFailed > 0) {
    pushRecommendation({
      kind: "sampling-incomplete",
      severity: "medium",
      title: "性能采样存在失败活动",
      summary: `CPU profiler failedActivityCount=${cpuFailed}，memory diagnostics failedActivityCount=${memoryFailed}。`,
      recommendedAction: "缩短 duration 或单独复跑失败 action；先确认诊断数据完整，再判断是否存在真实性能问题。",
      supportingSignals: [
        `cpuFailedActivityCount=${cpuFailed}`,
        `memoryFailedActivityCount=${memoryFailed}`,
      ],
      reportRefs: buildReportRefs(cpuProfiler, memoryDiagnostics),
    });
  }

  if (!isPresent(cpuProfiler) || !isPresent(memoryDiagnostics)) {
    const missing = [];
    if (!isPresent(cpuProfiler)) {
      missing.push("CPU profiler");
    }
    if (!isPresent(memoryDiagnostics)) {
      missing.push("memory diagnostics");
    }
    pushRecommendation({
      kind: "diagnostics-missing",
      severity: "low",
      title: "手动性能诊断证据不完整",
      summary: `当前缺少 ${missing.join(" / ")} 手动诊断报告。`,
      recommendedAction: "按需运行 `npm run agent:zotero:profile` 或 `npm run agent:zotero:memory`，再执行 `npm run agent:monitor` 刷新 advisory 摘要。",
      supportingSignals: missing.map((item) => `missing=${item}`),
      reportRefs: buildReportRefs(cpuProfiler, memoryDiagnostics),
    });
  }

  return recommendations.sort((left, right) => {
    const rankDiff = (PERFORMANCE_RECOMMENDATION_SEVERITY_RANK[right.severity] || 0)
      - (PERFORMANCE_RECOMMENDATION_SEVERITY_RANK[left.severity] || 0);
    return rankDiff || left.kind.localeCompare(right.kind);
  });
}

function buildSummaryLine(summary) {
  const parts = [];
  parts.push(summary.errorBoundaryHitCount > 0
    ? `错误边界命中 ${summary.errorBoundaryHitCount} 次`
    : "错误边界未命中");
  parts.push(summary.validationFailureCount > 0
    ? `校验失败分类 ${summary.validationFailureCategories.map((item) => `${item.label} x${item.count}`).join("；")}`
    : "未记录新的校验失败分类");
  parts.push(`HTTP timeout ${summary.httpTimeoutCount} 次`);
  parts.push(`慢操作 ${summary.httpSlowOperationCount} 次`);
  parts.push(`生命周期慢操作 ${summary.lifecycleSlowOperationCount} 次`);
  parts.push(`时序 ${summary.hostReadyDurationMs}/${summary.startupDurationMs}/${summary.shutdownDurationMs}ms`);
  if (summary.performanceBudget?.present) {
    parts.push(`性能预算 ${summary.performanceBudget.statusLabel || summary.performanceBudget.status || "未知"} / 超预算 ${summary.performanceBudget.violationCount ?? 0} 项`);
  }
  if (summary.cpuProfiler?.present) {
    parts.push(`CPU profiler ${summary.cpuProfiler.statusLabel || summary.cpuProfiler.status || "未知"} / 活动 ${summary.cpuProfiler.successfulActivityCount ?? 0}/${summary.cpuProfiler.activityCount ?? 0}`);
  }
  if (summary.memoryDiagnostics?.present) {
    parts.push(`内存诊断 ${summary.memoryDiagnostics.statusLabel || summary.memoryDiagnostics.status || "未知"} / RSS delta ${summary.memoryDiagnostics.rssDeltaMb ?? "-"} MB`);
  }
  if (Array.isArray(summary.performanceRecommendations) && summary.performanceRecommendations.length > 0) {
    parts.push(`性能建议 ${summary.performanceRecommendations.length} 条`);
  }
  return parts.join("；");
}

export function summarizeEngineeringHardening({ e2e = null, autofix = null, gate = null, cpuProfiler = null, memoryDiagnostics = null } = {}) {
  const validationFailures = [
    collectValidationFailure("agent:zotero:e2e", e2e),
    collectValidationFailure("agent:zotero:autofix", autofix),
    collectValidationFailure("agent:gate", gate),
  ].filter(Boolean);
  const validationFailureCategories = buildValidationCategorySummary(validationFailures);
  const errorBoundaryEvents = Array.isArray(e2e?.errorBoundaryEvents)
    ? e2e.errorBoundaryEvents
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        event: String(entry.event || "").trim() || "unknown",
        count: Number(entry.count || 0),
      }))
      .filter((entry) => entry.count > 0)
    : [];
  const httpSlowOperationCount = Number(e2e?.httpSlowOperationCount || 0);
  const httpTimeoutCount = Number(e2e?.httpTimeoutCount || 0);
  const httpRetryCount = Number(e2e?.httpRetryCount || 0);
  const httpRequestCount = Number(e2e?.httpRequestCount || 0);
  const lifecycleSlowOperationCount = Number(e2e?.lifecycleSlowOperationCount || 0);
  const summary = {
    observed: Boolean(e2e || autofix || gate),
    errorBoundaryHitCount: Number(e2e?.errorBoundaryHitCount || 0),
    errorBoundaryEvents,
    validationFailureCount: validationFailures.length,
    validationFailureCategories,
    validationFailureSources: validationFailures,
    httpObserved: Boolean(e2e?.httpObserved) || httpRequestCount > 0,
    httpRequestCount,
    httpSuccessCount: Number(e2e?.httpSuccessCount || 0),
    httpFailureCount: Number(e2e?.httpFailureCount || 0),
    httpTimeoutCount,
    httpRetryCount,
    httpSlowOperationCount,
    slowOperationCount: httpSlowOperationCount,
    httpSlowThresholdMs: Number(e2e?.httpSlowThresholdMs || 0),
    httpLastRequest: e2e?.httpLastRequest || null,
    httpLastErrorKind: e2e?.httpLastErrorKind || null,
    httpLastErrorMessage: e2e?.httpLastErrorMessage || null,
    hostReadyDurationMs: Number(e2e?.hostReadyDurationMs || 0),
    startupDurationMs: Number(e2e?.startupDurationMs || 0),
    shutdownDurationMs: Number(e2e?.shutdownDurationMs || 0),
    lifecycleSlowOperationCount,
    lifecycleSlowThresholdMs: Number(e2e?.lifecycleSlowThresholdMs || 2000),
    lifecycleLastSlowStage: typeof e2e?.lifecycleLastSlowStage === "string"
      && e2e.lifecycleLastSlowStage.trim()
      ? e2e.lifecycleLastSlowStage
      : null,
    performanceBudget: e2e?.performanceBudget && typeof e2e.performanceBudget === "object"
      ? e2e.performanceBudget
      : {
        present: false,
        observed: false,
        status: "missing",
        statusLabel: "缺失",
        summary: "当前未采集 dev-only performance budget",
        violationCount: 0,
        measuredActivityCount: 0,
        expectedActivityCount: 0,
        violationSummary: null,
      },
    cpuProfiler: cpuProfiler && typeof cpuProfiler === "object"
      ? cpuProfiler
      : {
        present: false,
        advisory: true,
        gateEffect: "non-blocking",
        status: "missing",
        statusLabel: "缺失",
        summary: "未采集手动 CPU profiler",
        activityCount: 0,
        successfulActivityCount: 0,
        failedActivityCount: 0,
        totalCpuTime: 0,
        currentPluginCpuPercent: 0,
        unknownCpuPercent: 0,
        topBucket: null,
        topAction: null,
      },
    memoryDiagnostics: memoryDiagnostics && typeof memoryDiagnostics === "object"
      ? memoryDiagnostics
      : {
        present: false,
        advisory: true,
        gateEffect: "non-blocking",
        status: "missing",
        statusLabel: "缺失",
        summary: "未采集手动内存诊断",
        activityCount: 0,
        successfulActivityCount: 0,
        failedActivityCount: 0,
        rssBeforeMb: null,
        rssAfterMb: null,
        rssDeltaMb: null,
        residentDeltaMb: null,
        explicitDeltaMb: null,
        topGrowingAction: null,
      },
  };
  summary.performanceRecommendations = buildPerformanceRecommendations({
    performanceBudget: summary.performanceBudget,
    cpuProfiler: summary.cpuProfiler,
    memoryDiagnostics: summary.memoryDiagnostics,
  });
  summary.summary = buildSummaryLine(summary);
  return summary;
}
