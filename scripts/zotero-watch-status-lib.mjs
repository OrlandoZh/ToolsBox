const DEFAULT_WATCH_STALE_AFTER_MINUTES = 30;

function parseDate(dateLike) {
  if (!dateLike) {
    return null;
  }
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function formatAgeMinutes(ageMinutes) {
  if (ageMinutes === null) {
    return "-";
  }
  if (ageMinutes < 1) {
    return "1 分钟内";
  }
  if (ageMinutes < 60) {
    return `${ageMinutes} 分钟`;
  }
  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;
  if (minutes === 0) {
    return `${hours} 小时`;
  }
  return `${hours} 小时 ${minutes} 分钟`;
}

function formatFutureSkewMinutes(skewMinutes) {
  if (skewMinutes === null) {
    return "-";
  }
  if (skewMinutes < 1) {
    return "不到 1 分钟";
  }
  if (skewMinutes < 60) {
    return `超前 ${skewMinutes} 分钟`;
  }
  const hours = Math.floor(skewMinutes / 60);
  const minutes = skewMinutes % 60;
  if (minutes === 0) {
    return `超前 ${hours} 小时`;
  }
  return `超前 ${hours} 小时 ${minutes} 分钟`;
}

function pickStatusLabel(status) {
  switch (status) {
    case "healthy":
      return "健康";
    case "future":
      return "时间异常";
    case "stale":
      return "已过期";
    case "failed":
      return "失败";
    case "warning":
      return "警告";
    case "missing":
      return "缺失";
    default:
      return "未知";
  }
}

function pickSeverity(status) {
  switch (status) {
    case "healthy":
      return "ok";
    case "future":
    case "stale":
    case "warning":
      return "warn";
    case "missing":
      return "info";
    default:
      return "error";
  }
}

export function summarizeZoteroWatchStatus(rawStatus, options = {}) {
  const staleAfterMinutes = Number.isFinite(options.staleAfterMinutes)
    ? Math.max(1, Math.round(options.staleAfterMinutes))
    : DEFAULT_WATCH_STALE_AFTER_MINUTES;
  const nowDate = parseDate(options.now) || new Date();

  if (!rawStatus || typeof rawStatus !== "object") {
    return {
      present: false,
      status: "missing",
      statusLabel: pickStatusLabel("missing"),
      severity: pickSeverity("missing"),
      ok: false,
      stale: false,
      staleAfterMinutes,
      generatedAt: null,
      ageMinutes: null,
      ageText: "-",
      latestTrigger: null,
      latestPassed: null,
      latestIssues: [],
      latestSummaryNote: null,
    };
  }

  const latestStatus = String(rawStatus.latestStatus || "").trim() || "unknown";
  const latest = rawStatus.latest && typeof rawStatus.latest === "object"
    ? rawStatus.latest
    : null;
  const generatedAt = rawStatus.generatedAt || latest?.at || null;
  const generatedDate = parseDate(generatedAt);
  const rawAgeMs = generatedDate
    ? nowDate.getTime() - generatedDate.getTime()
    : null;
  const future = rawAgeMs !== null && rawAgeMs < -60000;
  const ageMs = rawAgeMs === null || future
    ? null
    : Math.max(0, rawAgeMs);
  const ageMinutes = ageMs === null ? null : Math.round(ageMs / 60000);
  const futureSkewMinutes = future
    ? Math.round(Math.abs(rawAgeMs) / 60000)
    : null;
  const stale = latestStatus === "healthy"
    && ageMinutes !== null
    && ageMinutes > staleAfterMinutes;
  let status = latestStatus;
  if (future && latestStatus === "healthy") {
    status = "future";
  } else if (stale) {
    status = "stale";
  }

  return {
    present: true,
    status,
    baseStatus: latestStatus,
    statusLabel: pickStatusLabel(status),
    severity: pickSeverity(status),
    ok: latestStatus === "healthy" && !stale && !future,
    stale,
    future,
    staleAfterMinutes,
    generatedAt,
    ageMinutes,
    ageText: future
      ? formatFutureSkewMinutes(futureSkewMinutes)
      : formatAgeMinutes(ageMinutes),
    futureSkewMinutes,
    latestTrigger: latest?.trigger || null,
    latestPassed: latest?.passed ?? null,
    latestIssues: Array.isArray(latest?.issues) ? latest.issues : [],
    latestSummaryNote: latest?.summaryNote || rawStatus.startup?.summaryNote || null,
  };
}

export { DEFAULT_WATCH_STALE_AFTER_MINUTES };
