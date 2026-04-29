export const DEFAULT_MEMORY_SCENARIO_NAME = "memory diagnostics";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeNumber(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeMaybeNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeNonNegativeNumber(value, fallback = 0) {
  const normalized = normalizeNumber(value, fallback);
  return normalized >= 0 ? normalized : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(normalizeNumber(value, 0) * factor) / factor;
}

function bytesToMb(value) {
  const normalized = normalizeMaybeNumber(value);
  return normalized === null ? null : round(normalized / 1024 / 1024, 2);
}

function diffNumbers(after, before) {
  if (after === null || before === null) {
    return null;
  }
  return round(after - before, 2);
}

function normalizeAboutMemoryExport(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return {
      ok: false,
      included: false,
      reporterCount: 0,
      text: "",
      error: null,
    };
  }
  const text = normalizeString(candidate.text);
  const ok = candidate.ok === true && text.length > 0;
  return {
    ok,
    included: true,
    source: normalizeString(candidate.source) || "gecko-memory-reporter-manager",
    generatedAt: normalizeString(candidate.generatedAt) || null,
    reporterCount: normalizeNonNegativeNumber(candidate.reporterCount, 0),
    text,
    error: normalizeString(candidate.error?.message || candidate.errorMessage || candidate.error) || null,
  };
}

function parseDate(dateLike) {
  if (!dateLike) {
    return null;
  }
  const date = new Date(dateLike);
  return Number.isNaN(date.getTime()) ? null : date;
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
  return minutes === 0 ? `${hours} 小时` : `${hours} 小时 ${minutes} 分钟`;
}

function summarizeAge(dateLike, now = new Date()) {
  const date = parseDate(dateLike);
  if (!date) {
    return { ageMinutes: null, ageText: "-" };
  }
  const ageMinutes = Math.round(Math.max(0, now.getTime() - date.getTime()) / 60000);
  return { ageMinutes, ageText: formatAgeMinutes(ageMinutes) };
}

function pickScenarioResult(scenarioResult, scenarioName = DEFAULT_MEMORY_SCENARIO_NAME) {
  const results = Array.isArray(scenarioResult?.results) ? scenarioResult.results : [];
  return results.find((entry) => normalizeString(entry?.name) === scenarioName) || results[0] || null;
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return {
      ok: false,
      error: "missing memory snapshot",
      rssMb: null,
      residentMb: null,
      explicitMb: null,
      percentMem: null,
      raw: snapshot || null,
    };
  }
  const reporters = snapshot.reporters && typeof snapshot.reporters === "object"
    ? snapshot.reporters
    : {};
  const residentBytes = normalizeMaybeNumber(snapshot.residentBytes ?? reporters.resident);
  const explicitBytes = normalizeMaybeNumber(snapshot.explicitBytes ?? reporters.explicit);
  const rssMb = normalizeMaybeNumber(snapshot.rssMb ?? snapshot.rssMB);
  return {
    ok: snapshot.ok !== false,
    error: normalizeString(snapshot.error?.message || snapshot.errorMessage || snapshot.error) || null,
    rssMb: rssMb ?? bytesToMb(residentBytes),
    residentMb: bytesToMb(residentBytes),
    explicitMb: bytesToMb(explicitBytes),
    percentMem: normalizeMaybeNumber(snapshot.percentMem),
    raw: snapshot,
  };
}

function summarizeActivity(activity) {
  const before = normalizeSnapshot(activity?.memory?.before);
  const after = normalizeSnapshot(activity?.memory?.after);
  const rssDeltaMb = diffNumbers(after.rssMb, before.rssMb);
  const residentDeltaMb = diffNumbers(after.residentMb, before.residentMb);
  const explicitDeltaMb = diffNumbers(after.explicitMb, before.explicitMb);
  const memoryOk = activity?.memory?.ok !== false && before.ok && after.ok;
  const error = normalizeString(
    activity?.memory?.error?.message
    || activity?.memory?.errorMessage
    || before.error
    || after.error,
  ) || null;

  return {
    actionId: normalizeString(activity?.actionId) || "unknown-action",
    label: normalizeString(activity?.label || activity?.actionId) || "unknown-action",
    durationMs: normalizeNonNegativeNumber(activity?.durationMs, 0),
    ready: activity?.ready !== false,
    surfaceId: normalizeString(activity?.surfaceId) || null,
    captureKind: normalizeString(activity?.captureKind) || null,
    memoryOk,
    memoryError: error,
    before,
    after,
    rssBeforeMb: before.rssMb,
    rssAfterMb: after.rssMb,
    rssDeltaMb,
    residentDeltaMb,
    explicitDeltaMb,
  };
}

export function buildMemoryReport({
  scenarioResult,
  memoryFixture = null,
  scenarioName = DEFAULT_MEMORY_SCENARIO_NAME,
  includeDetails = false,
  includeAboutMemory = false,
  generatedAt = new Date().toISOString(),
  durationMs = 0,
} = {}) {
  const scenario = scenarioResult ? pickScenarioResult(scenarioResult, scenarioName) : null;
  const details = scenario?.details && typeof scenario.details === "object" ? scenario.details : {};
  const rawActivities = Array.isArray(memoryFixture?.activities)
    ? memoryFixture.activities
    : (Array.isArray(details.activities) ? details.activities : []);
  const activities = rawActivities.map(summarizeActivity);
  const successfulActivityCount = activities.filter((activity) => activity.memoryOk).length;
  const failedActivityCount = activities.length - successfulActivityCount;
  const firstWithBefore = activities.find((activity) => activity.rssBeforeMb !== null) || null;
  const lastWithAfter = activities.toReversed().find((activity) => activity.rssAfterMb !== null) || null;
  const rssBeforeMb = firstWithBefore?.rssBeforeMb ?? null;
  const rssAfterMb = lastWithAfter?.rssAfterMb ?? null;
  const rssDeltaMb = diffNumbers(rssAfterMb, rssBeforeMb);
  const residentDeltaMb = round(activities.reduce((sum, activity) => sum + normalizeNumber(activity.residentDeltaMb, 0), 0), 2);
  const explicitDeltaMb = round(activities.reduce((sum, activity) => sum + normalizeNumber(activity.explicitDeltaMb, 0), 0), 2);
  const topGrowingAction = activities
    .slice()
    .sort((left, right) => normalizeNumber(right.rssDeltaMb ?? right.residentDeltaMb, -Infinity) - normalizeNumber(left.rssDeltaMb ?? left.residentDeltaMb, -Infinity)
      || left.actionId.localeCompare(right.actionId))[0] || null;
  const aboutMemoryExport = normalizeAboutMemoryExport(
    memoryFixture?.aboutMemoryExport || details.aboutMemoryExport,
  );

  return {
    version: 1,
    generatedAt,
    kind: "agent-zotero-memory",
    advisory: true,
    gateEffect: "non-blocking",
    scenarioName,
    status: successfulActivityCount > 0 ? "passed" : "attention",
    statusLabel: successfulActivityCount > 0 ? "通过" : "需关注",
    durationMs: normalizeNonNegativeNumber(durationMs, 0),
    includeDetails: includeDetails === true,
    includeAboutMemory: includeAboutMemory === true || aboutMemoryExport.included === true,
    activityCount: activities.length,
    successfulActivityCount,
    failedActivityCount,
    rssBeforeMb,
    rssAfterMb,
    rssDeltaMb,
    residentDeltaMb,
    explicitDeltaMb,
    aboutMemoryExport: {
      ok: aboutMemoryExport.ok,
      included: includeAboutMemory === true || aboutMemoryExport.included === true,
      source: aboutMemoryExport.source || null,
      generatedAt: aboutMemoryExport.generatedAt || null,
      reporterCount: aboutMemoryExport.reporterCount,
      textLength: aboutMemoryExport.text.length,
      error: aboutMemoryExport.error,
      text: includeAboutMemory === true ? aboutMemoryExport.text : undefined,
    },
    topGrowingAction: topGrowingAction ? {
      actionId: topGrowingAction.actionId,
      label: topGrowingAction.label,
      rssDeltaMb: topGrowingAction.rssDeltaMb,
      residentDeltaMb: topGrowingAction.residentDeltaMb,
      explicitDeltaMb: topGrowingAction.explicitDeltaMb,
    } : null,
    scenarioStatus: scenario?.status || null,
    scenarioError: scenario?.error || null,
    activities: activities.map((activity) => includeDetails ? activity : ({
      actionId: activity.actionId,
      label: activity.label,
      durationMs: activity.durationMs,
      ready: activity.ready,
      surfaceId: activity.surfaceId,
      captureKind: activity.captureKind,
      memoryOk: activity.memoryOk,
      memoryError: activity.memoryError,
      rssBeforeMb: activity.rssBeforeMb,
      rssAfterMb: activity.rssAfterMb,
      rssDeltaMb: activity.rssDeltaMb,
      residentDeltaMb: activity.residentDeltaMb,
      explicitDeltaMb: activity.explicitDeltaMb,
    })),
    summary: successfulActivityCount > 0
      ? `memory diagnostics captured ${successfulActivityCount}/${activities.length} activity snapshot(s)`
      : "memory diagnostics did not capture usable memory data",
  };
}

function formatMb(value) {
  return value === null || value === undefined ? "-" : `${round(value, 2)} MB`;
}

export function buildMemoryMarkdown(report) {
  const lines = [
    "# Agent Zotero Memory 诊断报告",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- 状态: \`${report.statusLabel || report.status || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- Gate effect: \`${report.gateEffect || "-"}\``,
    `- 场景: \`${report.scenarioName || "-"}\``,
    `- 活动: \`${report.successfulActivityCount ?? 0}/${report.activityCount ?? 0}\``,
    `- RSS delta: \`${formatMb(report.rssDeltaMb)}\``,
    `- Resident delta: \`${formatMb(report.residentDeltaMb)}\``,
    `- Explicit delta: \`${formatMb(report.explicitDeltaMb)}\``,
    `- about:memory export: \`${report.aboutMemoryExport?.ok ? "captured" : (report.aboutMemoryExport?.included ? "failed" : "not requested")}\``,
    `- about:memory reporters: \`${report.aboutMemoryExport?.reporterCount ?? 0}\``,
    `- Top growing action: \`${report.topGrowingAction?.label || report.topGrowingAction?.actionId || "-"}\``,
    `- 摘要: ${report.summary || "-"}`,
    "",
    "| Action | Duration | RSS before | RSS after | RSS delta | Resident delta | Explicit delta | Status |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
  ];
  const activities = Array.isArray(report.activities) ? report.activities : [];
  if (activities.length === 0) {
    lines.push("| - | 0ms | - | - | - | - | - | missing |");
  } else {
    for (const activity of activities) {
      lines.push(`| ${activity.label || activity.actionId || "-"} | ${activity.durationMs ?? 0}ms | ${formatMb(activity.rssBeforeMb)} | ${formatMb(activity.rssAfterMb)} | ${formatMb(activity.rssDeltaMb)} | ${formatMb(activity.residentDeltaMb)} | ${formatMb(activity.explicitDeltaMb)} | ${activity.memoryOk ? "captured" : (activity.memoryError || "missing")} |`);
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

export function summarizeMemoryReport(report, options = {}) {
  const reportJSON = normalizeString(options.reportJSON) || null;
  const reportMD = normalizeString(options.reportMD) || null;
  const parseError = normalizeString(options.parseError);
  if (parseError) {
    return {
      present: false,
      advisory: true,
      gateEffect: "non-blocking",
      status: "attention",
      statusLabel: "需关注",
      generatedAt: null,
      ageMinutes: null,
      ageText: "-",
      activityCount: 0,
      successfulActivityCount: 0,
      failedActivityCount: 0,
      rssBeforeMb: null,
      rssAfterMb: null,
      rssDeltaMb: null,
      residentDeltaMb: null,
      explicitDeltaMb: null,
      aboutMemoryExport: null,
      topGrowingAction: null,
      reportJSON,
      reportMD,
      summary: `内存诊断报告无法解析：${parseError}`,
      errorMessage: parseError,
    };
  }
  if (!report || typeof report !== "object") {
    return {
      present: false,
      advisory: true,
      gateEffect: "non-blocking",
      status: "missing",
      statusLabel: "缺失",
      generatedAt: null,
      ageMinutes: null,
      ageText: "-",
      activityCount: 0,
      successfulActivityCount: 0,
      failedActivityCount: 0,
      rssBeforeMb: null,
      rssAfterMb: null,
      rssDeltaMb: null,
      residentDeltaMb: null,
      explicitDeltaMb: null,
      aboutMemoryExport: null,
      topGrowingAction: null,
      reportJSON,
      reportMD,
      summary: "未采集手动内存诊断",
      errorMessage: null,
    };
  }
  const { ageMinutes, ageText } = summarizeAge(report.generatedAt, options.now || new Date());
  return {
    present: true,
    advisory: report.advisory !== false,
    gateEffect: normalizeString(report.gateEffect) || "non-blocking",
    status: normalizeString(report.status) || "unknown",
    statusLabel: normalizeString(report.statusLabel) || normalizeString(report.status) || "未知",
    generatedAt: normalizeString(report.generatedAt) || null,
    ageMinutes,
    ageText,
    activityCount: normalizeNonNegativeNumber(report.activityCount, 0),
    successfulActivityCount: normalizeNonNegativeNumber(report.successfulActivityCount, 0),
    failedActivityCount: normalizeNonNegativeNumber(report.failedActivityCount, 0),
    rssBeforeMb: normalizeMaybeNumber(report.rssBeforeMb),
    rssAfterMb: normalizeMaybeNumber(report.rssAfterMb),
    rssDeltaMb: normalizeMaybeNumber(report.rssDeltaMb),
    residentDeltaMb: normalizeMaybeNumber(report.residentDeltaMb),
    explicitDeltaMb: normalizeMaybeNumber(report.explicitDeltaMb),
    aboutMemoryExport: report.aboutMemoryExport && typeof report.aboutMemoryExport === "object"
      ? {
          ok: report.aboutMemoryExport.ok === true,
          included: report.aboutMemoryExport.included === true,
          reporterCount: normalizeNonNegativeNumber(report.aboutMemoryExport.reporterCount, 0),
          textLength: normalizeNonNegativeNumber(report.aboutMemoryExport.textLength, 0),
          source: normalizeString(report.aboutMemoryExport.source) || null,
          textArtifact: normalizeString(report.aboutMemoryExport.textArtifact) || null,
          error: normalizeString(report.aboutMemoryExport.error) || null,
        }
      : null,
    topGrowingAction: report.topGrowingAction || null,
    reportJSON,
    reportMD,
    summary: normalizeString(report.summary) || "内存诊断报告已采集",
    errorMessage: null,
  };
}

export function parseMemoryArgs(argv = []) {
  const options = {
    scenario: DEFAULT_MEMORY_SCENARIO_NAME,
    includeDetails: false,
    includeAboutMemory: false,
    durationMs: 0,
    memoryFixture: null,
    skipBuild: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--scenario":
        options.scenario = normalizeString(argv[++index]);
        if (!options.scenario) {
          throw new Error("--scenario requires a value");
        }
        break;
      case "--include-details":
        options.includeDetails = true;
        break;
      case "--include-about-memory":
        options.includeAboutMemory = true;
        break;
      case "--duration-ms":
        options.durationMs = normalizeNonNegativeNumber(argv[++index], 0);
        break;
      case "--memory-fixture":
        options.memoryFixture = normalizeString(argv[++index]);
        if (!options.memoryFixture) {
          throw new Error("--memory-fixture requires a value");
        }
        break;
      case "--skip-build":
        options.skipBuild = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}
