const CATEGORY_LABELS = Object.freeze({
  args: "参数错误",
  config: "配置错误",
  environment: "环境错误",
  execution: "执行错误",
  validation: "验证错误",
  timeout: "超时错误",
});

function normalizeCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, normalized)
    ? normalized
    : null;
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
  return parts.join("；");
}

export function summarizeEngineeringHardening({ e2e = null, autofix = null, gate = null } = {}) {
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
  };
  summary.summary = buildSummaryLine(summary);
  return summary;
}
