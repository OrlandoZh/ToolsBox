import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  resolveZoteroWasmKernelArtifacts,
  resolveZoteroWasmKernelScenarioArtifacts,
} from "./zotero-agent-artifacts.mjs";
import {
  assertNonEmptyString,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
} from "./script-runtime-lib.mjs";
import {
  WASM_KERNEL_PROBE_PATH,
  WASM_KERNEL_PROBE_WORKER_PATH,
} from "../src/utils/optional-bundle-paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

export const DEFAULT_WASM_KERNEL_SCENARIO_NAME = "wasm kernel probe diagnostics";
export const DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME = "wasm kernel digest diagnostics";
export const DEFAULT_WASM_KERNEL_UNLOCK_SCENARIO_NAME = "wasm kernel unlock diagnostics";

function resolveDefaultWasmKernelSmokeReportPath(projectRootPath, scenarioName) {
  const defaultArtifacts = resolveZoteroWasmKernelArtifacts(projectRootPath);
  const scenarioArtifacts = resolveZoteroWasmKernelScenarioArtifacts(projectRootPath, scenarioName);
  return scenarioArtifacts.isDefaultScenario
    ? defaultArtifacts.smokeJSON
    : scenarioArtifacts.smokeJSON;
}

function normalizeScenarioName(value) {
  return assertNonEmptyString(
    value,
    "scenario name",
    {
      category: "args",
      failedStage: "parse-args",
    },
  );
}

function resolveInputPath(value) {
  const normalized = assertNonEmptyString(value, "input path", {
    category: "args",
    failedStage: "parse-args",
  });
  return path.resolve(process.cwd(), normalized);
}

export function parseWasmKernelPerformanceArgs(argv = process.argv.slice(2)) {
  let smokeReportPathExplicit = false;
  const options = {
    inputPath: resolveAgentArtifactPath(projectRoot, "agent-zotero-e2e.json"),
    scenarioReportPath: resolveAgentArtifactPath(projectRoot, "zotero-scenario-last-run.json"),
    scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--input":
        options.inputPath = resolveInputPath(argv[index + 1]);
        index += 1;
        break;
      case "--scenario":
        options.scenarioName = normalizeScenarioName(argv[index + 1]);
        index += 1;
        break;
      case "--scenario-report":
        options.scenarioReportPath = resolveInputPath(argv[index + 1]);
        index += 1;
        break;
      case "--smoke-report":
        options.smokeReportPath = resolveInputPath(argv[index + 1]);
        smokeReportPathExplicit = true;
        index += 1;
        break;
      default:
        throw createScriptError("args", `Unknown option: ${token}`, {
          failedStage: "parse-args",
          details: {
            option: token,
          },
        });
    }
  }

  if (!smokeReportPathExplicit) {
    options.smokeReportPath = resolveDefaultWasmKernelSmokeReportPath(projectRoot, options.scenarioName);
  }

  return options;
}

function computeMedian(values = []) {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (numericValues.length === 0) {
    return 0;
  }

  const middle = Math.floor(numericValues.length / 2);
  if (numericValues.length % 2 === 1) {
    return numericValues[middle];
  }
  return (numericValues[middle - 1] + numericValues[middle]) / 2;
}

function computePercentile(values = [], percentile = 0.95) {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (numericValues.length === 0) {
    return 0;
  }

  const boundedPercentile = Math.min(1, Math.max(0, Number(percentile || 0)));
  if (boundedPercentile === 0) {
    return numericValues[0];
  }

  const rank = Math.max(0, Math.ceil(boundedPercentile * numericValues.length) - 1);
  return numericValues[Math.min(rank, numericValues.length - 1)];
}

function computeMax(values = []) {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return numericValues.length > 0
    ? Math.max(...numericValues)
    : 0;
}

function summarizeMetricSeries(values = []) {
  return {
    median: computeMedian(values),
    p95: computePercentile(values, 0.95),
    max: computeMax(values),
  };
}

function formatBytes(bytes) {
  const numeric = Math.max(0, Number(bytes || 0));
  if (numeric >= 1024 * 1024) {
    return `${(numeric / (1024 * 1024)).toFixed(2)}MB`;
  }
  if (numeric >= 1024) {
    return `${(numeric / 1024).toFixed(2)}KB`;
  }
  return `${numeric}B`;
}

function formatDuration(metrics = {}) {
  return `${Number(metrics.median || 0)}ms / ${Number(metrics.p95 || 0)}ms / ${Number(metrics.max || 0)}ms`;
}

function formatMetricSeries(metrics = {}, suffix = "ms") {
  return `${Number(metrics.median || 0)}${suffix} / ${Number(metrics.p95 || 0)}${suffix} / ${Number(metrics.max || 0)}${suffix}`;
}

function formatSignedBytes(bytes) {
  const numeric = Number(bytes || 0);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${formatBytes(Math.abs(numeric))}`;
}

function uniqueStrings(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, "en"));
}

function buildMissingAssetEntry(filePath) {
  return {
    path: filePath,
    present: false,
    sizeBytes: 0,
  };
}

async function statAsset(filePath) {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return buildMissingAssetEntry(filePath);
    }
    return {
      path: filePath,
      present: true,
      sizeBytes: Number(stats.size || 0),
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return buildMissingAssetEntry(filePath);
    }
    throw error;
  }
}

async function readAddonRef(projectRootPath) {
  const addonConfig = await readJSONFile(path.join(projectRootPath, "config", "addon.config.json"), {
    missingCategory: "config",
    invalidCategory: "config",
    missingStage: "read-addon-config",
    invalidStage: "read-addon-config",
    label: "config/addon.config.json",
  });
  return assertNonEmptyString(addonConfig?.addonRef, "addon.config.json:addonRef", {
    category: "config",
    failedStage: "read-addon-config",
  });
}

async function readJSONIfExists(filePath, options = {}) {
  try {
    return await readJSONFile(filePath, {
      missingCategory: "environment",
      invalidCategory: "validation",
      missingStage: options.missingStage || "read-json",
      invalidStage: options.invalidStage || "read-json",
      label: options.label || filePath,
    });
  } catch (error) {
    if (error?.scriptErrorCategory === "environment" && String(error?.message || "").includes("Missing JSON file")) {
      return null;
    }
    throw error;
  }
}

export async function collectWasmKernelAssetInventory(projectRootPath, addonRef) {
  const sourceWasmPath = path.join(projectRootPath, "addon-static", ...WASM_KERNEL_PROBE_PATH.split("/"));
  const sourceWorkerPath = path.join(projectRootPath, "addon-static", ...WASM_KERNEL_PROBE_WORKER_PATH.split("/"));
  const buildWasmPath = path.join(projectRootPath, "build", addonRef, ...WASM_KERNEL_PROBE_PATH.split("/"));
  const buildWorkerPath = path.join(projectRootPath, "build", addonRef, ...WASM_KERNEL_PROBE_WORKER_PATH.split("/"));

  const [sourceWasm, sourceWorker, buildWasm, buildWorker] = await Promise.all([
    statAsset(sourceWasmPath),
    statAsset(sourceWorkerPath),
    statAsset(buildWasmPath),
    statAsset(buildWorkerPath),
  ]);

  const sourceCombinedBytes = Number(sourceWasm.sizeBytes || 0) + Number(sourceWorker.sizeBytes || 0);
  const buildCombinedBytes = Number(buildWasm.sizeBytes || 0) + Number(buildWorker.sizeBytes || 0);

  return {
    addonRef,
    source: {
      wasm: sourceWasm,
      worker: sourceWorker,
      combinedBytes: sourceCombinedBytes,
    },
    build: {
      wasm: buildWasm,
      worker: buildWorker,
      combinedBytes: buildCombinedBytes,
    },
    deltas: {
      wasmBytes: Number(buildWasm.sizeBytes || 0) - Number(sourceWasm.sizeBytes || 0),
      workerBytes: Number(buildWorker.sizeBytes || 0) - Number(sourceWorker.sizeBytes || 0),
      combinedBytes: buildCombinedBytes - sourceCombinedBytes,
    },
  };
}

function extractScenarioRuns(e2eReport, scenarioName) {
  return (Array.isArray(e2eReport?.cycles) ? e2eReport.cycles : [])
    .map((cycle) => {
      const scenario = Array.isArray(cycle?.scenarios?.results)
        ? cycle.scenarios.results.find((entry) => entry?.name === scenarioName) || null
        : null;
      if (!scenario) {
        return null;
      }

      return {
        cycleIndex: Number(cycle?.index || 0),
        zoteroVersion: String(cycle?.zoteroVersion || e2eReport?.zoteroVersion || "").trim() || null,
        bootMode: String(cycle?.bootMode || "").trim() || null,
        status: String(scenario?.status || "missing"),
        durationMs: Number(scenario?.durationMs || 0),
        details: scenario?.details && typeof scenario.details === "object"
          ? scenario.details
          : {},
      };
    })
    .filter(Boolean);
}

function extractStandaloneScenarioRuns(lastRunReport, scenarioName) {
  const selectedScenario = Array.isArray(lastRunReport?.selectedScenarios)
    ? lastRunReport.selectedScenarios.find((entry) => entry?.name === scenarioName) || null
    : null;
  const result = Array.isArray(lastRunReport?.results)
    ? lastRunReport.results.find((entry) => entry?.name === scenarioName) || null
    : null;

  if (!selectedScenario && !result) {
    return [];
  }

  return [{
    cycleIndex: 1,
    zoteroVersion: null,
    bootMode: "scenario",
    status: String(result?.status || "missing"),
    durationMs: Number(result?.durationMs || 0),
    details: result?.details && typeof result.details === "object"
      ? result.details
      : {},
  }];
}

function extractSmokeRuns(smokeReport, scenarioName) {
  const normalizedScenarioName = String(scenarioName || "").trim();
  return (Array.isArray(smokeReport?.runs) ? smokeReport.runs : [])
    .filter((run) => {
      const runScenarioName = String(run?.scenarioName || smokeReport?.scenarioName || "").trim();
      return !normalizedScenarioName || runScenarioName === normalizedScenarioName;
    })
    .map((run) => ({
      cycleIndex: Number(run?.runIndex || 0),
      zoteroVersion: String(run?.zoteroVersion || smokeReport?.zoteroVersion || "").trim() || null,
      bootMode: String(run?.bootMode || "scenario").trim() || "scenario",
      status: String(run?.status || "missing"),
      durationMs: Number(run?.durationMs || 0),
      details: run?.details && typeof run.details === "object"
        ? run.details
        : {},
    }));
}

function summarizeTransportRuns(runs = [], transportKey) {
  const passingRuns = runs
    .filter((run) => run.status === "passed" && run?.details?.[transportKey]?.ok === true);
  const entries = passingRuns
    .map((run) => run.details?.[transportKey] || null)
    .filter(Boolean);

  return {
    sampleCount: entries.length,
    cacheHitCount: transportKey === "mainThread"
      ? entries.filter((entry) => entry?.cacheHit === true).length
      : 0,
    bytesLength: summarizeMetricSeries(entries.map((entry) => Number(entry?.bytesLength || 0))),
    initDurationMs: summarizeMetricSeries(entries.map((entry) => Number(entry?.timing?.initDurationMs || 0))),
    invokeDurationMs: summarizeMetricSeries(entries.map((entry) => Number(entry?.timing?.invokeDurationMs || 0))),
    totalDurationMs: summarizeMetricSeries(entries.map((entry) => Number(entry?.timing?.totalDurationMs || 0))),
    urls: uniqueStrings(entries.map((entry) => entry?.url || entry?.workerURL || "")),
    wasmURLs: uniqueStrings(entries.map((entry) => entry?.wasmURL || "")),
  };
}

function summarizeTopLevelProbeRuns(runs = []) {
  const passingRuns = runs.filter((run) => run.status === "passed");
  const timingSummaries = passingRuns
    .map((run) => run.details?.timingSummary || null)
    .filter(Boolean);

  return {
    sampleCount: timingSummaries.length,
    scenarioDurationMs: summarizeMetricSeries(passingRuns.map((run) => Number(run?.durationMs || 0))),
    probeTotalDurationMs: summarizeMetricSeries(timingSummaries.map((entry) => Number(entry?.totalDurationMs || 0))),
    probeInitDurationMs: summarizeMetricSeries(timingSummaries.map((entry) => Number(entry?.totalInitDurationMs || entry?.initDurationMs || 0))),
    probeInvokeDurationMs: summarizeMetricSeries(timingSummaries.map((entry) => Number(entry?.totalInvokeDurationMs || entry?.invokeDurationMs || 0))),
    measuredTransportDurationMs: summarizeMetricSeries(timingSummaries.map((entry) => Number(entry?.measuredTransportDurationMs || 0))),
    slowestTransports: uniqueStrings(timingSummaries.map((entry) => entry?.slowestTransport || "")),
  };
}

function buildTransportComparison(mainThread, worker) {
  return {
    initDurationMsDelta: Number(worker?.initDurationMs?.median || 0) - Number(mainThread?.initDurationMs?.median || 0),
    invokeDurationMsDelta: Number(worker?.invokeDurationMs?.median || 0) - Number(mainThread?.invokeDurationMs?.median || 0),
    totalDurationMsDelta: Number(worker?.totalDurationMs?.median || 0) - Number(mainThread?.totalDurationMs?.median || 0),
  };
}

function buildRecommendations({
  scenarioName = DEFAULT_WASM_KERNEL_SCENARIO_NAME,
  observedRunCount,
  failedRunCount,
  mainThread,
  worker,
  assets,
  digestSmokeObserved = false,
}) {
  const recommendations = [];

  if (observedRunCount === 0) {
    recommendations.push("missing-wasm-probe-scenario");
    return recommendations;
  }

  if (failedRunCount > 0) {
    recommendations.push("rerun-wasm-probe-scenario");
  }

  if (Number(mainThread?.cacheHitCount || 0) > 0) {
    recommendations.push("main-thread-cache-observed");
  } else {
    recommendations.push("main-thread-cold-load-observed");
  }

  if (Number(worker?.totalDurationMs?.median || 0) > Number(mainThread?.totalDurationMs?.median || 0)) {
    recommendations.push("worker-transport-heavier-than-main-thread");
  } else {
    recommendations.push("worker-transport-not-heavier-than-main-thread");
  }

  if (
    assets?.build?.wasm?.present === true
    && assets?.build?.worker?.present === true
    && Number(assets?.deltas?.combinedBytes || 0) === 0
  ) {
    recommendations.push("build-assets-match-source");
  } else if (
    assets?.build?.wasm?.present === true
    || assets?.build?.worker?.present === true
  ) {
    recommendations.push("build-assets-differ-from-source");
  } else {
    recommendations.push("build-assets-missing");
  }

  if (scenarioName === DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME) {
    recommendations.push(
      digestSmokeObserved
        ? "digest-smoke-observed"
        : "expand-digest-smoke-repeats",
    );
  } else if (!scenarioName || scenarioName === DEFAULT_WASM_KERNEL_SCENARIO_NAME) {
    recommendations.push(
      digestSmokeObserved
        ? "digest-smoke-observed"
        : "keep-wasm-kernel-planned-until-digest-smoke-exists",
    );
  } else {
    recommendations.push(
      observedRunCount >= 3 && failedRunCount === 0
        ? "custom-wasm-scenario-observed"
        : "expand-custom-wasm-scenario-repeats",
    );
  }
  return recommendations;
}

function resolveWasmKernelScenarioLabel(scenarioName = DEFAULT_WASM_KERNEL_SCENARIO_NAME) {
  if (scenarioName === DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME) {
    return "Wasm digest micro-kernel";
  }
  if (scenarioName === DEFAULT_WASM_KERNEL_UNLOCK_SCENARIO_NAME) {
    return "Wasm unlock derivation";
  }
  if (!scenarioName || scenarioName === DEFAULT_WASM_KERNEL_SCENARIO_NAME) {
    return "Wasm probe";
  }
  return `Wasm ${String(scenarioName || "").trim() || "custom scenario"}`;
}

function hasDigestSmokeObserved(digestSmokeReport = null) {
  if (!digestSmokeReport || String(digestSmokeReport?.scenarioName || "").trim() !== DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME) {
    return false;
  }
  return (
    String(digestSmokeReport?.status || "") === "passed"
    && Number(digestSmokeReport?.failedRunCount || 0) === 0
    && Number(digestSmokeReport?.passedRunCount || 0) >= 3
  );
}

export function summarizeWasmKernelPerformanceReport({
  e2eReport = {},
  scenarioLastRunReport = null,
  smokeReport = null,
  digestSmokeReport = null,
  e2eReportPath = resolveAgentArtifactPath(projectRoot, "agent-zotero-e2e.json"),
  scenarioLastRunPath = resolveAgentArtifactPath(projectRoot, "zotero-scenario-last-run.json"),
  smokeReportPath = null,
  scenarioName = DEFAULT_WASM_KERNEL_SCENARIO_NAME,
  assetInventory = {},
} = {}) {
  const normalizedSmokeReportPath = smokeReportPath || resolveDefaultWasmKernelSmokeReportPath(projectRoot, scenarioName);
  const smokeRuns = extractSmokeRuns(smokeReport, scenarioName);
  const e2eRuns = extractScenarioRuns(e2eReport, scenarioName);
  const standaloneRuns = smokeRuns.length === 0 && e2eRuns.length === 0
    ? extractStandaloneScenarioRuns(scenarioLastRunReport, scenarioName)
    : [];
  const runs = smokeRuns.length > 0
    ? smokeRuns
    : e2eRuns.length > 0
      ? e2eRuns
      : standaloneRuns;
  const artifactSource = smokeRuns.length > 0
    ? "wasm-kernel-smoke"
    : e2eRuns.length > 0
    ? "agent-zotero-e2e"
    : standaloneRuns.length > 0
      ? "zotero-scenario-last-run"
      : "missing";
  const observedRunCount = runs.length;
  const passedRunCount = runs.filter((run) => run.status === "passed").length;
  const failedRunCount = runs.filter((run) => run.status !== "passed").length;
  const mainThread = summarizeTransportRuns(runs, "mainThread");
  const worker = summarizeTransportRuns(runs, "worker");
  const overall = summarizeTopLevelProbeRuns(runs);
  const paths = {
    rootURIs: uniqueStrings(runs.map((run) => run?.details?.rootURI || "")),
    wasmRelativePaths: uniqueStrings(runs.map((run) => run?.details?.wasmRelativePath || "")),
    workerRelativePaths: uniqueStrings(runs.map((run) => run?.details?.workerRelativePath || "")),
    mainThreadURLs: uniqueStrings(runs.map((run) => run?.details?.mainThread?.url || "")),
    workerURLs: uniqueStrings(runs.map((run) => run?.details?.worker?.workerURL || "")),
    workerWasmURLs: uniqueStrings(runs.map((run) => run?.details?.worker?.wasmURL || "")),
  };
  const allCrossTransportConsistent = observedRunCount > 0
    ? runs.every((run) => run?.details?.consistentAcrossTransports === true)
    : null;
  const allReadinessOK = observedRunCount > 0
    ? runs.every((run) => run?.details?.readiness?.ok === true)
    : null;
  const digestSmokeObserved = scenarioName === DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME
    ? observedRunCount >= 3 && failedRunCount === 0
    : hasDigestSmokeObserved(digestSmokeReport);
  const recommendations = buildRecommendations({
    scenarioName,
    observedRunCount,
    failedRunCount,
    mainThread,
    worker,
    assets: assetInventory,
    digestSmokeObserved,
  });

  let status = "passed";
  let statusLabel = "完整";
  if (observedRunCount === 0) {
    status = "missing";
    statusLabel = "缺失";
  } else if (failedRunCount > 0 || allCrossTransportConsistent === false || allReadinessOK === false) {
    status = "partial";
    statusLabel = "部分缺失";
  }

  const scenarioLabel = resolveWasmKernelScenarioLabel(scenarioName);
  let summary = `${scenarioLabel} 成本量化已完成。`;
  if (status === "missing") {
    summary = `缺少场景 ${scenarioName} 的 E2E 产物，无法量化 ${scenarioLabel} 成本。`;
  } else {
    summary = [
      `已量化 ${passedRunCount}/${observedRunCount} 轮 ${scenarioLabel}`,
      `main-thread 中位 ${Number(mainThread.totalDurationMs.median || 0)}ms`,
      `worker 中位 ${Number(worker.totalDurationMs.median || 0)}ms`,
      `source 资产 ${formatBytes(assetInventory?.source?.combinedBytes || 0)}`,
      `当前结论仍保持 planned + default-disabled`,
    ].join("；");
  }

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status,
    statusLabel,
    scenarioName,
    artifactSource,
    e2eReportPath,
    scenarioLastRunPath,
    smokeReportPath: normalizedSmokeReportPath,
    zoteroVersion: String(
      e2eReport?.zoteroVersion
      || smokeReport?.zoteroVersion
      || "",
    ).trim() || null,
    cycleCount: smokeRuns.length > 0
      ? Number(smokeReport?.repeats || smokeRuns.length || 0)
      : Array.isArray(e2eReport?.cycles) ? e2eReport.cycles.length : 0,
    observedRunCount,
    passedRunCount,
    failedRunCount,
    consistency: {
      allCrossTransportConsistent,
      allReadinessOK,
    },
    paths,
    assets: assetInventory,
    overall,
    transports: {
      mainThread,
      worker,
    },
    comparisons: {
      workerVsMainThread: buildTransportComparison(mainThread, worker),
    },
    recommendations,
    summary,
  };
}

export function renderWasmKernelPerformanceMarkdown(report = {}) {
  const lines = [
    "# Wasm Kernel Performance",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- 状态: \`${report.statusLabel || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- 场景: \`${report.scenarioName || "-"}\``,
    `- 数据源: \`${report.artifactSource || "-"}\``,
    `- Zotero: \`${report.zoteroVersion || "-"}\``,
    `- E2E 报告: \`${report.e2eReportPath || "-"}\``,
    `- Scenario 报告: \`${report.scenarioLastRunPath || "-"}\``,
    `- Smoke 报告: \`${report.smokeReportPath || "-"}\``,
    `- 轮次: \`${report.passedRunCount || 0}/${report.observedRunCount || 0}\``,
    `- 摘要: ${report.summary || "-"}`,
    "",
    "## Asset Footprint",
    "",
    `- source combined: \`${formatBytes(report.assets?.source?.combinedBytes || 0)}\``,
    `- build combined: \`${formatBytes(report.assets?.build?.combinedBytes || 0)}\``,
    `- delta: \`${formatSignedBytes(report.assets?.deltas?.combinedBytes || 0)}\``,
    `- source wasm: \`${formatBytes(report.assets?.source?.wasm?.sizeBytes || 0)}\``,
    `- source worker: \`${formatBytes(report.assets?.source?.worker?.sizeBytes || 0)}\``,
    `- build wasm present: \`${report.assets?.build?.wasm?.present ? "yes" : "no"}\``,
    `- build worker present: \`${report.assets?.build?.worker?.present ? "yes" : "no"}\``,
    "",
    "## Overall Timing",
    "",
    `- scenario duration (median/p95/max): \`${formatDuration(report.overall?.scenarioDurationMs || {})}\``,
    `- probe total (median/p95/max): \`${formatDuration(report.overall?.probeTotalDurationMs || {})}\``,
    `- probe init (median/p95/max): \`${formatDuration(report.overall?.probeInitDurationMs || {})}\``,
    `- probe invoke (median/p95/max): \`${formatDuration(report.overall?.probeInvokeDurationMs || {})}\``,
    `- measured transport total (median/p95/max): \`${formatDuration(report.overall?.measuredTransportDurationMs || {})}\``,
    `- slowest transports: \`${(report.overall?.slowestTransports || []).join(", ") || "-"}\``,
    "",
    "## Transports",
    "",
  ];

  [
    ["main-thread", report.transports?.mainThread],
    ["worker", report.transports?.worker],
  ].forEach(([label, transport]) => {
    lines.push(`### ${label}`);
    lines.push("");
    lines.push(`- samples: \`${transport?.sampleCount || 0}\``);
    if (label === "main-thread") {
      lines.push(`- cache hits: \`${transport?.cacheHitCount || 0}\``);
    }
    lines.push(`- bytesLength (median/p95/max): \`${formatMetricSeries(transport?.bytesLength || {}, "B")}\``);
    lines.push(`- init (median/p95/max): \`${formatDuration(transport?.initDurationMs || {})}\``);
    lines.push(`- invoke (median/p95/max): \`${formatDuration(transport?.invokeDurationMs || {})}\``);
    lines.push(`- total (median/p95/max): \`${formatDuration(transport?.totalDurationMs || {})}\``);
    lines.push(`- URLs: \`${(transport?.urls || []).join(", ") || "-"}\``);
    if ((transport?.wasmURLs || []).length > 0) {
      lines.push(`- Wasm URLs: \`${transport.wasmURLs.join(", ")}\``);
    }
    lines.push("");
  });

  lines.push("## Comparison");
  lines.push("");
  lines.push(`- worker vs main init delta: \`${Number(report.comparisons?.workerVsMainThread?.initDurationMsDelta || 0)}ms\``);
  lines.push(`- worker vs main invoke delta: \`${Number(report.comparisons?.workerVsMainThread?.invokeDurationMsDelta || 0)}ms\``);
  lines.push(`- worker vs main total delta: \`${Number(report.comparisons?.workerVsMainThread?.totalDurationMsDelta || 0)}ms\``);
  lines.push(`- cross-transport consistent: \`${report.consistency?.allCrossTransportConsistent === null ? "-" : report.consistency?.allCrossTransportConsistent ? "yes" : "no"}\``);
  lines.push(`- readiness ok: \`${report.consistency?.allReadinessOK === null ? "-" : report.consistency?.allReadinessOK ? "yes" : "no"}\``);
  lines.push("");
  lines.push("## Recommendations");
  lines.push("");

  if (Array.isArray(report.recommendations) && report.recommendations.length > 0) {
    report.recommendations.forEach((item) => {
      lines.push(`- \`${item}\``);
    });
  } else {
    lines.push("- 当前没有额外建议。");
  }

  return lines.join("\n");
}

export async function persistWasmKernelPerformanceReport(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const defaultArtifacts = resolveZoteroWasmKernelArtifacts(projectRootPath);
  const scenarioArtifacts = resolveZoteroWasmKernelScenarioArtifacts(projectRootPath, report?.scenarioName);
  const markdown = `${renderWasmKernelPerformanceMarkdown(report)}\n`;
  const reportJSON = `${JSON.stringify(report, null, 2)}\n`;
  const writeTargets = [
    [scenarioArtifacts.performanceJSON, reportJSON],
    [scenarioArtifacts.performanceMD, markdown],
    [scenarioArtifacts.performanceLatestJSON, reportJSON],
    [scenarioArtifacts.performanceLatestMD, markdown],
  ];

  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await fs.mkdir(scenarioArtifacts.performanceDir, { recursive: true });

  if (scenarioArtifacts.isDefaultScenario) {
    await fs.mkdir(defaultArtifacts.performanceDir, { recursive: true });
    writeTargets.push(
      [defaultArtifacts.performanceJSON, reportJSON],
      [defaultArtifacts.performanceMD, markdown],
      [defaultArtifacts.performanceLatestJSON, reportJSON],
      [defaultArtifacts.performanceLatestMD, markdown],
    );
  }

  await Promise.all(writeTargets.map(([filePath, contents]) => fs.writeFile(filePath, contents, "utf-8")));

  return {
    reportPath: scenarioArtifacts.performanceJSON,
    reportMDPath: scenarioArtifacts.performanceMD,
    latestJSONPath: scenarioArtifacts.performanceLatestJSON,
    latestMDPath: scenarioArtifacts.performanceLatestMD,
    defaultReportPath: scenarioArtifacts.isDefaultScenario ? defaultArtifacts.performanceJSON : null,
    defaultReportMDPath: scenarioArtifacts.isDefaultScenario ? defaultArtifacts.performanceMD : null,
  };
}

export async function readWasmKernelDigestSmokeReportIfExists(projectRootPath) {
  const digestArtifacts = resolveZoteroWasmKernelScenarioArtifacts(
    projectRootPath,
    DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
  );
  return readJSONIfExists(digestArtifacts.smokeJSON, {
    missingStage: "read-digest-smoke-report",
    invalidStage: "read-digest-smoke-report",
    label: digestArtifacts.smokeJSON,
  });
}

async function main(argv = process.argv.slice(2)) {
  const options = parseWasmKernelPerformanceArgs(argv);
  const addonRef = await readAddonRef(projectRoot);
  const e2eReport = await readJSONIfExists(options.inputPath, {
    missingStage: "read-e2e-report",
    invalidStage: "read-e2e-report",
    label: options.inputPath,
  });
  const scenarioLastRunReport = await readJSONIfExists(options.scenarioReportPath, {
    missingStage: "read-scenario-report",
    invalidStage: "read-scenario-report",
    label: options.scenarioReportPath,
  });
  const smokeReport = await readJSONIfExists(options.smokeReportPath, {
    missingStage: "read-smoke-report",
    invalidStage: "read-smoke-report",
    label: options.smokeReportPath,
  });
  const digestSmokeReport = options.scenarioName === DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME
    ? smokeReport
    : await readWasmKernelDigestSmokeReportIfExists(projectRoot);
  if (!e2eReport && !scenarioLastRunReport && !smokeReport) {
    throw createScriptError("environment", "Missing wasm-kernel-smoke, agent-zotero-e2e, and zotero-scenario-last-run artifacts", {
      failedStage: "read-input-artifacts",
      details: {
        inputPath: options.inputPath,
        scenarioReportPath: options.scenarioReportPath,
        smokeReportPath: options.smokeReportPath,
      },
    });
  }
  const assetInventory = await collectWasmKernelAssetInventory(projectRoot, addonRef);
  const report = summarizeWasmKernelPerformanceReport({
    e2eReport,
    scenarioLastRunReport,
    smokeReport,
    digestSmokeReport,
    e2eReportPath: options.inputPath,
    scenarioLastRunPath: options.scenarioReportPath,
    smokeReportPath: options.smokeReportPath,
    scenarioName: options.scenarioName,
    assetInventory,
  });
  const paths = await persistWasmKernelPerformanceReport(report, {
    projectRootPath: projectRoot,
  });
  console.log(`Wasm kernel performance report generated: ${paths.reportPath}`);
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch((error) => {
    const failureInfo = buildScriptFailureInfo(error, {
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    console.error(`${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}
