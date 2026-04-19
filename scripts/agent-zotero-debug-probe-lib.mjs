import { createScriptError } from "./script-runtime-lib.mjs";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeString(value))
      .filter(Boolean),
  ));
}

function normalizeMode(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) {
    return "smart";
  }
  if (normalized === "smart" || normalized === "force") {
    return normalized;
  }
  throw createScriptError("args", "mode must be one of: smart, force", {
    failedStage: "parse-args",
    details: {
      option: "mode",
      received: value ?? null,
    },
  });
}

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

export function pickDebugProbeStatusLabel(status) {
  switch (normalizeString(status)) {
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "no-candidates":
      return "无候选";
    case "pending":
      return "待执行";
    case "missing":
      return "缺失";
    default:
      return "未知";
  }
}

export const DEBUG_PROBE_BUNDLES = Object.freeze([
  Object.freeze({
    id: "preference-control-writeback",
    surfaceId: "preference-pane",
    capabilityId: "host-actions",
    summary: "Probe preference pane live control interaction, pref writeback, and root/control ownership.",
    scenarioNames: ["preference pane control interaction"],
    logPatterns: [],
  }),
  Object.freeze({
    id: "reader-sidebar-view-closure",
    surfaceId: "reader-sidebar-view",
    capabilityId: "host-actions",
    summary: "Probe reader sidebar toggle and thumbnails postcondition with DOM and reader snapshot evidence.",
    scenarioNames: ["reader surface smoke"],
    logPatterns: [
      "pdfdocument is null",
      "getoutline2",
    ],
  }),
]);

export function listDebugProbeBundles() {
  return DEBUG_PROBE_BUNDLES.map((bundle) => ({ ...bundle }));
}

export function getDebugProbeBundle(bundleID) {
  const normalized = normalizeString(bundleID);
  return DEBUG_PROBE_BUNDLES.find((bundle) => bundle.id === normalized) || null;
}

export function parseDebugProbeArgs(argv) {
  const options = {
    mode: "smart",
    probeIDs: [],
    fresh: false,
    skipBuild: false,
    listProbes: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--list-probes") {
      options.listProbes = true;
      continue;
    }
    if (arg === "--fresh") {
      options.fresh = true;
      continue;
    }
    if (arg === "--skip-build") {
      options.skipBuild = true;
      continue;
    }
    if (arg === "--mode") {
      index += 1;
      if (index >= argv.length) {
        throw createScriptError("args", "--mode requires a value", {
          failedStage: "parse-args",
        });
      }
      options.mode = normalizeMode(argv[index]);
      continue;
    }
    if (arg === "--probe") {
      index += 1;
      if (index >= argv.length) {
        throw createScriptError("args", "--probe requires a value", {
          failedStage: "parse-args",
        });
      }
      options.probeIDs.push(argv[index]);
      continue;
    }
    throw createScriptError("args", `Unknown option: ${arg}`, {
      failedStage: "parse-args",
    });
  }

  options.probeIDs = normalizeStringArray(options.probeIDs);
  if (options.probeIDs.length > 0) {
    const unknownProbeIDs = options.probeIDs.filter((probeID) => !getDebugProbeBundle(probeID));
    if (unknownProbeIDs.length > 0) {
      throw createScriptError("args", `Unknown debug probe: ${unknownProbeIDs[0]}`, {
        failedStage: "parse-args",
        details: {
          unknownProbeIDs,
        },
      });
    }
  }

  return options;
}

function collectFailedScenarioNames(e2eReport) {
  const cycles = Array.isArray(e2eReport?.cycles) ? e2eReport.cycles : [];
  const latestCycle = cycles[cycles.length - 1] || null;
  const results = Array.isArray(latestCycle?.scenarios?.results)
    ? latestCycle.scenarios.results
    : [];
  return normalizeStringArray(
    results
      .filter((entry) => entry?.status === "failed")
      .map((entry) => entry?.name),
  );
}

function collectRecentErrorMessages(e2eReport) {
  const cycles = Array.isArray(e2eReport?.cycles) ? e2eReport.cycles : [];
  const latestCycle = cycles[cycles.length - 1] || null;
  return normalizeStringArray(
    (latestCycle?.logs?.recentErrors || []).map((entry) => entry?.message),
  );
}

export function deriveSmartDebugProbeCandidates(e2eReport) {
  const failedScenarioNames = collectFailedScenarioNames(e2eReport);
  const recentErrorMessages = collectRecentErrorMessages(e2eReport);
  const matched = [];

  for (const bundle of DEBUG_PROBE_BUNDLES) {
    const reasons = [];
    if (bundle.scenarioNames.some((name) => failedScenarioNames.includes(name))) {
      reasons.push("failed-scenario");
    }
    if (bundle.logPatterns.some((pattern) => (
      recentErrorMessages.some((message) => message.toLowerCase().includes(pattern))
    ))) {
      reasons.push("recent-error-log");
    }
    if (reasons.length > 0) {
      matched.push({
        probeId: bundle.id,
        surfaceId: bundle.surfaceId,
        capabilityId: bundle.capabilityId,
        reasons,
      });
    }
  }

  return {
    failedScenarioNames,
    recentErrorMessages,
    candidates: matched,
  };
}

export function selectDebugProbeBundleIDs({ mode, probeIDs = [], e2eReport = null }) {
  const normalizedMode = normalizeMode(mode);
  const explicitProbeIDs = normalizeStringArray(probeIDs);
  if (explicitProbeIDs.length > 0) {
    return {
      mode: normalizedMode,
      selectedProbeIDs: explicitProbeIDs,
      selectionSource: "explicit",
      smartSelection: null,
    };
  }

  if (normalizedMode === "force") {
    return {
      mode: normalizedMode,
      selectedProbeIDs: DEBUG_PROBE_BUNDLES.map((bundle) => bundle.id),
      selectionSource: "force-all",
      smartSelection: null,
    };
  }

  const smartSelection = deriveSmartDebugProbeCandidates(e2eReport);
  return {
    mode: normalizedMode,
    selectedProbeIDs: smartSelection.candidates.map((item) => item.probeId),
    selectionSource: "smart",
    smartSelection,
  };
}

function buildDebugProbeSummaryText({
  status,
  selectedProbeCount,
  executedProbeCount,
  failedProbeCount,
  completedProbeCount,
  unsupportedProbeCount,
  smartCandidateCount,
  promotions,
  freshForLatestE2E,
  e2eGeneratedAt,
}) {
  if (status === "missing") {
    return "当前未采集 debug probe。";
  }
  if (status === "no-candidates") {
    return smartCandidateCount > 0
      ? `smart mode 命中 ${smartCandidateCount} 个候选，但本轮未执行 probe bundle。`
      : "smart mode 未命中任何 debug probe bundle。";
  }
  const parts = [];
  if (selectedProbeCount > 0) {
    parts.push(`已选 ${selectedProbeCount} 个 bundle`);
  }
  if (executedProbeCount > 0) {
    parts.push(`已执行 ${executedProbeCount} 个 bundle`);
  }
  if (completedProbeCount > 0) {
    parts.push(`完成 ${completedProbeCount} 个`);
  }
  if (failedProbeCount > 0) {
    parts.push(`失败 ${failedProbeCount} 个`);
  }
  if (unsupportedProbeCount > 0) {
    parts.push(`不支持 ${unsupportedProbeCount} 个`);
  }
  if (promotions.length > 0) {
    parts.push(`promotion ${promotions.join("、")}`);
  }
  if (freshForLatestE2E === false && e2eGeneratedAt) {
    parts.push("早于最新 E2E");
  }
  return parts.join("；") || "debug probe 已生成，但当前无更多摘要。";
}

function isNormalizedDebugProbeSummary(report) {
  return Boolean(
    report
    && typeof report === "object"
    && typeof report.present === "boolean"
    && Object.prototype.hasOwnProperty.call(report, "executedProbeCount")
  );
}

function buildMissingDebugProbeSummary(now = new Date()) {
  return {
    present: false,
    status: "missing",
    statusLabel: pickDebugProbeStatusLabel("missing"),
    generatedAt: null,
    ageMinutes: null,
    ageText: "-",
    mode: null,
    selectionSource: null,
    selectedProbeIDs: [],
    selectedProbeCount: 0,
    smartCandidateCount: 0,
    matchedReasonKinds: [],
    executedProbeCount: 0,
    completedProbeCount: 0,
    failedProbeCount: 0,
    unsupportedProbeCount: 0,
    promotions: [],
    lastPromotion: null,
    advisory: true,
    gateEffect: "non-blocking",
    freshForLatestE2E: null,
    latestE2EGeneratedAt: null,
    summary: "当前未采集 debug probe。",
    nextSuggestedAction: null,
    command: null,
    subprocessExitCode: null,
    reportJSON: null,
    reportMD: null,
    failedStage: null,
    errorMessage: null,
  };
}

export function summarizeDebugProbeReport(report, options = {}) {
  const now = parseDate(options.now) || new Date();
  if (!report || typeof report !== "object") {
    return buildMissingDebugProbeSummary(now);
  }

  if (isNormalizedDebugProbeSummary(report)) {
    const { ageMinutes, ageText } = summarizeAge(report.generatedAt, now);
    const status = normalizeString(report.status) || "missing";
    const latestE2EGeneratedAt = normalizeString(
      options.e2eGeneratedAt ?? report.latestE2EGeneratedAt,
    ) || null;
    const generatedAtDate = parseDate(report.generatedAt);
    const latestE2EDate = parseDate(latestE2EGeneratedAt);
    const freshForLatestE2E = latestE2EDate && generatedAtDate
      ? generatedAtDate.getTime() >= latestE2EDate.getTime()
      : report.freshForLatestE2E ?? null;
    const promotions = normalizeStringArray(report.promotions);
    return {
      ...buildMissingDebugProbeSummary(now),
      ...report,
      present: report.present !== false,
      status,
      statusLabel: normalizeString(report.statusLabel)
        || pickDebugProbeStatusLabel(status),
      ageMinutes,
      ageText,
      selectedProbeIDs: normalizeStringArray(report.selectedProbeIDs),
      selectedProbeCount: Number(report.selectedProbeCount || 0),
      smartCandidateCount: Number(report.smartCandidateCount || 0),
      matchedReasonKinds: normalizeStringArray(report.matchedReasonKinds),
      executedProbeCount: Number(report.executedProbeCount || 0),
      completedProbeCount: Number(report.completedProbeCount || 0),
      failedProbeCount: Number(report.failedProbeCount || 0),
      unsupportedProbeCount: Number(report.unsupportedProbeCount || 0),
      promotions,
      lastPromotion: normalizeString(report.lastPromotion) || promotions[promotions.length - 1] || null,
      advisory: report.advisory !== false,
      gateEffect: normalizeString(report.gateEffect) || "non-blocking",
      freshForLatestE2E,
      latestE2EGeneratedAt,
      summary: normalizeString(report.summary)
        || buildDebugProbeSummaryText({
          status,
          selectedProbeCount: Number(report.selectedProbeCount || 0),
          executedProbeCount: Number(report.executedProbeCount || 0),
          failedProbeCount: Number(report.failedProbeCount || 0),
          completedProbeCount: Number(report.completedProbeCount || 0),
          unsupportedProbeCount: Number(report.unsupportedProbeCount || 0),
          smartCandidateCount: Number(report.smartCandidateCount || 0),
          promotions,
          freshForLatestE2E,
          e2eGeneratedAt: latestE2EGeneratedAt,
        }),
      nextSuggestedAction: normalizeString(report.nextSuggestedAction) || null,
      command: normalizeString(report.command) || null,
      subprocessExitCode: Number.isFinite(Number(report.subprocessExitCode))
        ? Number(report.subprocessExitCode)
        : null,
      reportJSON: normalizeString(report.reportJSON) || null,
      reportMD: normalizeString(report.reportMD) || null,
      failedStage: normalizeString(report.failedStage) || null,
      errorMessage: normalizeString(report.errorMessage) || null,
    };
  }

  const selectedProbeIDs = normalizeStringArray(report.selectedProbeIDs);
  const executed = Array.isArray(report.executed) ? report.executed : [];
  const completedProbeCount = executed.filter((entry) => normalizeString(entry?.status) === "completed").length;
  const failedProbeCount = executed.filter((entry) => normalizeString(entry?.status) === "failed").length;
  const unsupportedProbeCount = executed.filter((entry) => normalizeString(entry?.status) === "unsupported").length;
  const promotions = normalizeStringArray(executed.map((entry) => entry?.promotion));
  const smartCandidates = Array.isArray(report?.smartSelection?.candidates)
    ? report.smartSelection.candidates
    : [];
  const matchedReasonKinds = normalizeStringArray(smartCandidates.flatMap((item) => item?.reasons || []));
  const rawStatus = normalizeString(report.status) || "missing";
  const latestE2EGeneratedAt = normalizeString(options.e2eGeneratedAt) || null;
  const generatedAtDate = parseDate(report.generatedAt);
  const latestE2EDate = parseDate(latestE2EGeneratedAt);
  const freshForLatestE2E = latestE2EDate && generatedAtDate
    ? generatedAtDate.getTime() >= latestE2EDate.getTime()
    : null;
  const { ageMinutes, ageText } = summarizeAge(report.generatedAt, now);

  let nextSuggestedAction = null;
  if (rawStatus === "failed") {
    nextSuggestedAction = "查看 `dist/agent-zotero-debug-probe.md`，确认失败 bundle 与 stopReason。";
  } else if (rawStatus === "no-candidates") {
    nextSuggestedAction = "如需继续追问，可显式指定 `--probe <id>` 或扩充 bundle catalog。";
  }

  return {
    present: true,
    status: rawStatus,
    statusLabel: pickDebugProbeStatusLabel(rawStatus),
    generatedAt: normalizeString(report.generatedAt) || null,
    ageMinutes,
    ageText,
    mode: normalizeString(report.mode) || null,
    selectionSource: normalizeString(report.selectionSource) || null,
    selectedProbeIDs,
    selectedProbeCount: selectedProbeIDs.length,
    smartCandidateCount: smartCandidates.length,
    matchedReasonKinds,
    executedProbeCount: executed.length,
    completedProbeCount,
    failedProbeCount,
    unsupportedProbeCount,
    promotions,
    lastPromotion: promotions[promotions.length - 1] || null,
    advisory: true,
    gateEffect: "non-blocking",
    freshForLatestE2E,
    latestE2EGeneratedAt,
    summary: buildDebugProbeSummaryText({
      status: rawStatus,
      selectedProbeCount: selectedProbeIDs.length,
      executedProbeCount: executed.length,
      failedProbeCount,
      completedProbeCount,
      unsupportedProbeCount,
      smartCandidateCount: smartCandidates.length,
      promotions,
      freshForLatestE2E,
      e2eGeneratedAt: latestE2EGeneratedAt,
    }),
    nextSuggestedAction,
    command: normalizeString(report.command) || null,
    subprocessExitCode: Number.isFinite(Number(report.subprocessExitCode))
      ? Number(report.subprocessExitCode)
      : null,
    reportJSON: normalizeString(report.reportJSON) || null,
    reportMD: normalizeString(report.reportMD) || null,
    failedStage: normalizeString(report.failedStage) || null,
    errorMessage: normalizeString(report.errorMessage) || null,
  };
}

function formatList(values) {
  const list = normalizeStringArray(values);
  return list.length > 0 ? list.join("；") : "-";
}

export function buildDebugProbeMarkdown(report) {
  const lines = [
    "# Zotero Debug Probe",
    "",
    `- 生成时间: \`${report?.generatedAt || "-"}\``,
    `- 模式: \`${report?.mode || "-"}\``,
    `- 选择来源: \`${report?.selectionSource || "-"}\``,
    `- 执行状态: \`${report?.status || "-"}\``,
    `- 已选 bundles: ${formatList(report?.selectedProbeIDs)}`,
  ];

  if (report?.smartSelection) {
    lines.push(`- smart failed scenarios: ${formatList(report.smartSelection.failedScenarioNames)}`);
    lines.push(`- smart recent errors: ${formatList(report.smartSelection.recentErrorMessages)}`);
  }

  lines.push("");
  lines.push("## Executed");
  const executed = Array.isArray(report?.executed) ? report.executed : [];
  if (executed.length === 0) {
    lines.push("- 本轮未执行 probe bundle。");
  } else {
    for (const entry of executed) {
      lines.push(`- \`${entry.probeId}\`: status=\`${entry.status}\`, promotion=\`${entry.promotion || "-"}\`, stopReason=\`${entry.stopReason || "-"}\``);
      if (entry.summary) {
        lines.push(`  - ${entry.summary}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}
