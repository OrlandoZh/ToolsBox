export const DEFAULT_PROFILER_SCENARIO_NAME = "profiler diagnostics";

const DEFAULT_TOP_STACK_LIMIT = 8;
const DEFAULT_TOP_BUCKET_LIMIT = 8;

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeNumber(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeNonNegativeNumber(value, fallback = 0) {
  const normalized = normalizeNumber(value, fallback);
  return normalized >= 0 ? normalized : fallback;
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
    return {
      ageMinutes: null,
      ageText: "-",
    };
  }
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const ageMinutes = Math.round(diffMs / 60000);
  return {
    ageMinutes,
    ageText: formatAgeMinutes(ageMinutes),
  };
}

function roundPercent(value) {
  return Number((normalizeNumber(value, 0) * 100).toFixed(2));
}

function getFieldIndex(schema, fieldName) {
  if (Array.isArray(schema)) {
    return schema.indexOf(fieldName);
  }
  if (schema && typeof schema === "object") {
    const value = schema[fieldName];
    return Number.isInteger(value) ? value : -1;
  }
  return -1;
}

function getRowValue(row, index) {
  if (!Array.isArray(row) || index < 0) {
    return undefined;
  }
  return row[index];
}

export function resolveProfilerCallStack(stackIndex, stackTable, frameTable, stringTable) {
  const frames = [];
  const stackRows = Array.isArray(stackTable?.data) ? stackTable.data : [];
  const frameRows = Array.isArray(frameTable?.data) ? frameTable.data : [];
  const strings = Array.isArray(stringTable) ? stringTable : [];
  const prefixIndex = getFieldIndex(stackTable?.schema, "prefix");
  const frameIndex = getFieldIndex(stackTable?.schema, "frame");
  const locationIndex = getFieldIndex(frameTable?.schema, "location");
  const seen = new Set();
  let current = Number.isInteger(stackIndex) ? stackIndex : null;

  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);
    const stackRow = stackRows[current];
    if (!Array.isArray(stackRow)) {
      break;
    }
    const frameRow = frameRows[getRowValue(stackRow, frameIndex)];
    const locationValue = getRowValue(frameRow, locationIndex);
    const location = typeof locationValue === "number"
      ? strings[locationValue]
      : locationValue;
    if (location) {
      frames.unshift(String(location));
    }
    const parent = getRowValue(stackRow, prefixIndex);
    current = Number.isInteger(parent) ? parent : null;
  }

  return frames.join(" -> ");
}

export function parseProfilerData(profileData) {
  const threads = Array.isArray(profileData?.threads) ? profileData.threads : [];
  return threads.map((thread) => {
    const samples = Array.isArray(thread?.samples?.data) ? thread.samples.data : [];
    const stackIndex = getFieldIndex(thread?.samples?.schema, "stack");
    const cpuDeltaIndex = getFieldIndex(thread?.samples?.schema, "threadCPUDelta");
    const cpuByStack = new Map();
    let totalCpuTime = 0;

    for (const sample of samples) {
      const cpuDelta = Math.max(0, normalizeNumber(getRowValue(sample, cpuDeltaIndex), 0));
      totalCpuTime += cpuDelta;
      const sampleStackIndex = getRowValue(sample, stackIndex);
      if (!Number.isInteger(sampleStackIndex)) {
        continue;
      }
      const callStack = resolveProfilerCallStack(
        sampleStackIndex,
        thread.stackTable,
        thread.frameTable,
        thread.stringTable,
      );
      if (!callStack) {
        continue;
      }
      cpuByStack.set(callStack, (cpuByStack.get(callStack) || 0) + cpuDelta);
    }

    const stacks = Array.from(cpuByStack.entries())
      .map(([callStack, cpuTime]) => ({
        callStack,
        cpuTime,
        percent: totalCpuTime > 0 ? cpuTime / totalCpuTime : 0,
      }))
      .sort((left, right) => right.cpuTime - left.cpuTime || left.callStack.localeCompare(right.callStack));

    return {
      name: normalizeString(thread?.name) || "unknown-thread",
      totalCpuTime,
      sampleCount: samples.length,
      stacks,
    };
  });
}

function normalizeKeyList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeString(value))
      .filter(Boolean),
  ));
}

function buildBucketDefinitions(context = {}) {
  const currentPluginKeys = normalizeKeyList([
    ...(Array.isArray(context.currentPluginKeys) ? context.currentPluginKeys : []),
    context.addonRef ? `chrome://${context.addonRef}/` : null,
    context.addonRef ? `resource://${context.addonRef}/` : null,
    context.addonId,
  ]);
  const activeExtensionRoots = normalizeKeyList(context.activeExtensionRoots)
    .filter((key) => !currentPluginKeys.some((pluginKey) => key.includes(pluginKey) || pluginKey.includes(key)));

  return [
    {
      id: "current-plugin",
      label: "Current Plugin",
      keys: currentPluginKeys,
    },
    {
      id: "zotero-reader",
      label: "Zotero Reader",
      keys: ["resource://zotero/reader"],
    },
    {
      id: "zotero-note-editor",
      label: "Zotero Note Editor",
      keys: ["resource://zotero/note-editor"],
    },
    {
      id: "zotero-main",
      label: "Zotero Main",
      keys: ["chrome://zotero/"],
    },
    {
      id: "other-extension",
      label: "Other Active Extensions",
      keys: activeExtensionRoots,
    },
    {
      id: "unknown-other",
      label: "Unknown / Other",
      keys: [],
      fallback: true,
    },
  ];
}

function pickBucket(callStack, buckets) {
  const normalizedStack = normalizeString(callStack);
  return buckets.find((bucket) => (
    !bucket.fallback
    && bucket.keys.some((key) => normalizedStack.includes(key))
  )) || buckets.find((bucket) => bucket.fallback);
}

export function analyzeProfilerData(profileData, context = {}, options = {}) {
  const threads = parseProfilerData(profileData);
  const bucketDefinitions = buildBucketDefinitions(context);
  const topStackLimit = Math.max(1, Math.floor(normalizeNonNegativeNumber(options.topStackLimit, DEFAULT_TOP_STACK_LIMIT)));
  const bucketMap = new Map(bucketDefinitions.map((bucket) => [bucket.id, {
    id: bucket.id,
    label: bucket.label,
    cpuTime: 0,
    percent: 0,
    stackCount: 0,
    topStacks: [],
  }]));
  const allStacks = [];
  let totalCpuTime = 0;
  let sampleCount = 0;

  for (const thread of threads) {
    totalCpuTime += thread.totalCpuTime;
    sampleCount += thread.sampleCount;
    for (const stack of thread.stacks) {
      const bucket = pickBucket(stack.callStack, bucketDefinitions);
      const bucketSummary = bucketMap.get(bucket.id);
      bucketSummary.cpuTime += stack.cpuTime;
      bucketSummary.stackCount += 1;
      allStacks.push({
        thread: thread.name,
        bucketId: bucket.id,
        bucketLabel: bucket.label,
        callStack: stack.callStack,
        cpuTime: stack.cpuTime,
      });
    }
  }

  const topStacks = allStacks
    .sort((left, right) => right.cpuTime - left.cpuTime || left.callStack.localeCompare(right.callStack))
    .map((entry) => ({
      ...entry,
      percent: totalCpuTime > 0 ? entry.cpuTime / totalCpuTime : 0,
    }));
  const buckets = Array.from(bucketMap.values())
    .map((bucket) => ({
      ...bucket,
      percent: totalCpuTime > 0 ? bucket.cpuTime / totalCpuTime : 0,
      topStacks: topStacks
        .filter((stack) => stack.bucketId === bucket.id)
        .slice(0, topStackLimit),
    }))
    .sort((left, right) => right.cpuTime - left.cpuTime || left.id.localeCompare(right.id));

  return {
    ok: true,
    totalCpuTime,
    sampleCount,
    threadCount: threads.length,
    threads: threads.map((thread) => ({
      name: thread.name,
      totalCpuTime: thread.totalCpuTime,
      sampleCount: thread.sampleCount,
      topStacks: thread.stacks.slice(0, topStackLimit),
    })),
    buckets,
    topStacks: topStacks.slice(0, topStackLimit),
    bucketDefinitions,
  };
}

function extractScenarioResult(scenarioResult, scenarioName = DEFAULT_PROFILER_SCENARIO_NAME) {
  const results = Array.isArray(scenarioResult?.results) ? scenarioResult.results : [];
  return results.find((entry) => normalizeString(entry?.name) === scenarioName) || results[0] || null;
}

function summarizeProfileActivity(activity, context, options = {}) {
  const base = {
    actionId: normalizeString(activity?.actionId) || "unknown-action",
    label: normalizeString(activity?.label || activity?.actionId) || "unknown-action",
    durationMs: normalizeNonNegativeNumber(activity?.durationMs, 0),
    ready: activity?.ready !== false,
    surfaceId: normalizeString(activity?.surfaceId) || null,
    captureKind: normalizeString(activity?.captureKind) || null,
    profilerOk: activity?.profile?.ok === true,
    profilerError: normalizeString(activity?.profile?.error?.message || activity?.profile?.errorMessage) || null,
    analysis: null,
  };

  if (activity?.profile?.ok === true && activity.profile.profileData) {
    base.analysis = analyzeProfilerData(activity.profile.profileData, context, options);
  }

  return base;
}

export function buildProfileReport({
  scenarioResult,
  profileData = null,
  profileContext = {},
  scenarioName = DEFAULT_PROFILER_SCENARIO_NAME,
  includeDetails = false,
  generatedAt = new Date().toISOString(),
  durationMs = 0,
} = {}) {
  const scenario = scenarioResult ? extractScenarioResult(scenarioResult, scenarioName) : null;
  const details = scenario?.details && typeof scenario.details === "object" ? scenario.details : {};
  const context = {
    ...(details.profileContext || {}),
    ...(profileContext || {}),
  };
  const rawActivities = Array.isArray(details.activities) ? details.activities : [];
  const activities = profileData
    ? [{
        actionId: "fixture.profile",
        label: "Fixture Profile",
        durationMs: 0,
        ready: true,
        profile: {
          ok: true,
          profileData,
        },
      }]
    : rawActivities;
  const summarizedActivities = activities.map((activity) => summarizeProfileActivity(activity, context, {
    includeDetails,
  }));
  const successfulActivityCount = summarizedActivities.filter((activity) => activity.profilerOk && activity.analysis).length;
  const failedActivityCount = summarizedActivities.length - successfulActivityCount;
  const totalCpuTime = summarizedActivities.reduce((sum, activity) => sum + normalizeNonNegativeNumber(activity.analysis?.totalCpuTime, 0), 0);

  return {
    version: 1,
    generatedAt,
    kind: "agent-zotero-profile",
    advisory: true,
    gateEffect: "non-blocking",
    scenarioName,
    status: successfulActivityCount > 0 ? "passed" : "attention",
    statusLabel: successfulActivityCount > 0 ? "通过" : "需关注",
    durationMs: normalizeNonNegativeNumber(durationMs, 0),
    includeDetails: includeDetails === true,
    activityCount: summarizedActivities.length,
    successfulActivityCount,
    failedActivityCount,
    totalCpuTime,
    profileContext: context,
    scenarioStatus: scenario?.status || null,
    scenarioError: scenario?.error || null,
    activities: summarizedActivities.map((activity) => includeDetails ? activity : ({
      ...activity,
      analysis: activity.analysis ? {
        ...activity.analysis,
        threads: undefined,
        bucketDefinitions: undefined,
        buckets: activity.analysis.buckets.slice(0, DEFAULT_TOP_BUCKET_LIMIT).map((bucket) => ({
          ...bucket,
          topStacks: bucket.topStacks.slice(0, 3),
        })),
        topStacks: activity.analysis.topStacks.slice(0, 3),
      } : null,
    })),
    summary: successfulActivityCount > 0
      ? `profiler diagnostics captured ${successfulActivityCount}/${summarizedActivities.length} activity profile(s)`
      : "profiler diagnostics did not capture usable CPU profile data",
  };
}

function formatPercent(value) {
  return `${(normalizeNumber(value, 0) * 100).toFixed(2)}%`;
}

function formatStack(stack) {
  const text = normalizeString(stack?.callStack).replaceAll("\n", " ");
  return text.length > 180 ? `${text.slice(0, 177)}...` : text || "-";
}

export function buildProfileMarkdown(report) {
  const lines = [
    "# Agent Zotero Profile 诊断报告",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- 状态: \`${report.statusLabel || report.status || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- Gate effect: \`${report.gateEffect || "-"}\``,
    `- 场景: \`${report.scenarioName || "-"}\``,
    `- 活动: \`${report.successfulActivityCount ?? 0}/${report.activityCount ?? 0}\``,
    `- 摘要: ${report.summary || "-"}`,
    "",
  ];

  for (const activity of report.activities || []) {
    lines.push(`## ${activity.label || activity.actionId}`);
    lines.push("");
    lines.push(`- actionId: \`${activity.actionId || "-"}\``);
    lines.push(`- duration: \`${activity.durationMs ?? 0}ms\``);
    lines.push(`- profiler: \`${activity.profilerOk ? "captured" : "missing"}\``);
    if (activity.profilerError) {
      lines.push(`- error: ${activity.profilerError}`);
    }
    if (activity.analysis) {
      lines.push(`- total CPU time: \`${activity.analysis.totalCpuTime}\``);
      lines.push(`- samples: \`${activity.analysis.sampleCount}\``);
      lines.push("");
      lines.push("| Bucket | CPU time | Percent | Stacks |");
      lines.push("|---|---:|---:|---:|");
      for (const bucket of activity.analysis.buckets || []) {
        lines.push(`| ${bucket.label} | ${bucket.cpuTime} | ${formatPercent(bucket.percent)} | ${bucket.stackCount} |`);
      }
      lines.push("");
      lines.push("| Top stack | Bucket | CPU time | Percent |");
      lines.push("|---|---|---:|---:|");
      for (const stack of activity.analysis.topStacks || []) {
        lines.push(`| ${formatStack(stack).replaceAll("|", "\\|")} | ${stack.bucketLabel || stack.bucketId || "-"} | ${stack.cpuTime} | ${formatPercent(stack.percent)} |`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function summarizeProfileReport(report, options = {}) {
  const reportJSON = normalizeString(options.reportJSON) || null;
  const reportMD = normalizeString(options.reportMD) || null;
  const parseError = normalizeString(options.parseError);
  const now = options.now || new Date();

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
      totalCpuTime: 0,
      currentPluginCpuPercent: 0,
      unknownCpuPercent: 0,
      topBucket: null,
      topAction: null,
      reportJSON,
      reportMD,
      summary: `CPU profiler 报告无法解析：${parseError}`,
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
      totalCpuTime: 0,
      currentPluginCpuPercent: 0,
      unknownCpuPercent: 0,
      topBucket: null,
      topAction: null,
      reportJSON,
      reportMD,
      summary: "未采集手动 CPU profiler",
      errorMessage: null,
    };
  }

  const { ageMinutes, ageText } = summarizeAge(report.generatedAt, now);
  const activities = Array.isArray(report.activities) ? report.activities : [];
  const totalCpuTime = normalizeNonNegativeNumber(report.totalCpuTime, 0);
  const bucketMap = new Map();
  const actionSummaries = [];

  for (const activity of activities) {
    const actionCpuTime = normalizeNonNegativeNumber(activity?.analysis?.totalCpuTime, 0);
    actionSummaries.push({
      actionId: normalizeString(activity?.actionId) || "unknown-action",
      label: normalizeString(activity?.label || activity?.actionId) || "unknown-action",
      cpuTime: actionCpuTime,
      durationMs: normalizeNonNegativeNumber(activity?.durationMs, 0),
    });
    const buckets = Array.isArray(activity?.analysis?.buckets) ? activity.analysis.buckets : [];
    for (const bucket of buckets) {
      const id = normalizeString(bucket?.id) || "unknown";
      if (!bucketMap.has(id)) {
        bucketMap.set(id, {
          id,
          label: normalizeString(bucket?.label) || id,
          cpuTime: 0,
          stackCount: 0,
        });
      }
      const summary = bucketMap.get(id);
      summary.cpuTime += normalizeNonNegativeNumber(bucket?.cpuTime, 0);
      summary.stackCount += normalizeNonNegativeNumber(bucket?.stackCount, 0);
    }
  }

  const buckets = Array.from(bucketMap.values())
    .map((bucket) => ({
      ...bucket,
      percent: totalCpuTime > 0 ? bucket.cpuTime / totalCpuTime : 0,
      percentLabel: formatPercent(totalCpuTime > 0 ? bucket.cpuTime / totalCpuTime : 0),
    }))
    .sort((left, right) => right.cpuTime - left.cpuTime || left.label.localeCompare(right.label));
  const topBucket = buckets[0] || null;
  const topAction = actionSummaries
    .sort((left, right) => right.cpuTime - left.cpuTime || left.actionId.localeCompare(right.actionId))[0] || null;
  const currentPluginCpuTime = normalizeNonNegativeNumber(bucketMap.get("current-plugin")?.cpuTime, 0);
  const unknownCpuTime = normalizeNonNegativeNumber(bucketMap.get("unknown-other")?.cpuTime, 0);

  return {
    present: true,
    advisory: report.advisory !== false,
    gateEffect: normalizeString(report.gateEffect) || "non-blocking",
    status: normalizeString(report.status) || "unknown",
    statusLabel: normalizeString(report.statusLabel) || normalizeString(report.status) || "未知",
    generatedAt: normalizeString(report.generatedAt) || null,
    ageMinutes,
    ageText,
    activityCount: normalizeNonNegativeNumber(report.activityCount, activities.length),
    successfulActivityCount: normalizeNonNegativeNumber(report.successfulActivityCount, 0),
    failedActivityCount: normalizeNonNegativeNumber(report.failedActivityCount, 0),
    totalCpuTime,
    currentPluginCpuPercent: totalCpuTime > 0 ? roundPercent(currentPluginCpuTime / totalCpuTime) : 0,
    unknownCpuPercent: totalCpuTime > 0 ? roundPercent(unknownCpuTime / totalCpuTime) : 0,
    topBucket: topBucket ? {
      id: topBucket.id,
      label: topBucket.label,
      cpuTime: topBucket.cpuTime,
      percent: roundPercent(topBucket.percent),
      percentLabel: topBucket.percentLabel,
    } : null,
    topAction,
    reportJSON,
    reportMD,
    summary: normalizeString(report.summary) || "CPU profiler 诊断报告已采集",
    errorMessage: null,
  };
}

export function parseProfileArgs(argv = []) {
  const options = {
    scenario: DEFAULT_PROFILER_SCENARIO_NAME,
    includeDetails: false,
    durationMs: 0,
    profileFixture: null,
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
      case "--duration-ms":
        options.durationMs = normalizeNonNegativeNumber(argv[++index], 0);
        break;
      case "--profile-fixture":
        options.profileFixture = normalizeString(argv[++index]);
        if (!options.profileFixture) {
          throw new Error("--profile-fixture requires a value");
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
