import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildScriptFailureInfo, createScriptError, isExecutedAsScript, readJSONFile } from "./script-runtime-lib.mjs";
import {
  resolveZoteroWasmKernelArtifacts,
  resolveZoteroWasmKernelScenarioArtifacts,
} from "./zotero-agent-artifacts.mjs";
import { runScenarioMode } from "./zotero.mjs";
import {
  DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
  DEFAULT_WASM_KERNEL_SCENARIO_NAME,
  collectWasmKernelAssetInventory,
  persistWasmKernelPerformanceReport,
  readWasmKernelDigestSmokeReportIfExists,
  summarizeWasmKernelPerformanceReport,
} from "./wasm-kernel-performance-report.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function resolveNpmExecutable() {
  return process.platform === "win32"
    ? "npm.cmd"
    : "npm";
}

function normalizePositiveInteger(value, fallback = 0) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
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

function toSafeTimestamp(dateLike = new Date()) {
  return new Date(dateLike).toISOString().replace(/[:.]/gu, "-");
}

function formatOutputTail(output, limit = 12) {
  return String(output || "")
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-limit);
}

function formatProcessLogTail(processLogs = [], source, limit = 12) {
  return (Array.isArray(processLogs) ? processLogs : [])
    .filter((entry) => entry?.source === source)
    .map((entry) => String(entry?.message || "").trim())
    .filter(Boolean)
    .slice(-limit);
}

function normalizeTimestampMs(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export function parseWasmKernelSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    repeats: 3,
    scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--repeats":
        options.repeats = normalizePositiveInteger(argv[index + 1], 0);
        index += 1;
        break;
      case "--scenario":
        options.scenarioName = String(argv[index + 1] || "").trim() || "";
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

  if (options.repeats <= 0) {
    throw createScriptError("args", "--repeats must be a positive integer", {
      failedStage: "parse-args",
    });
  }
  if (!options.scenarioName) {
    throw createScriptError("args", "--scenario must be a non-empty string", {
      failedStage: "parse-args",
    });
  }

  return options;
}

function extractRunMetrics(details = {}) {
  return {
    rootURI: String(details.rootURI || "").trim() || null,
    mode: String(details.mode || "").trim() || null,
    consistentAcrossTransports: details.consistentAcrossTransports === true,
    readinessOK: details.readiness?.ok === true,
    mainThreadInitDurationMs: Number(details.mainThread?.timing?.initDurationMs || 0),
    mainThreadTotalDurationMs: Number(details.mainThread?.timing?.totalDurationMs || 0),
    workerInitDurationMs: Number(details.worker?.timing?.initDurationMs || 0),
    workerTotalDurationMs: Number(details.worker?.timing?.totalDurationMs || 0),
    probeTotalDurationMs: Number(details.timingSummary?.totalDurationMs || 0),
  };
}

function buildRunSummary({
  runIndex,
  scenarioName,
  startedAt,
  completedAt,
  command,
  processResult,
  scenarioResult,
  scenarioReport,
  artifact,
} = {}) {
  const details = scenarioResult?.details && typeof scenarioResult.details === "object"
    ? scenarioResult.details
    : {};
  const status = String(scenarioResult?.status || (processResult?.status === 0 ? "passed" : "failed"));
  const passed = status === "passed";
  const durationMs = Number(scenarioResult?.durationMs || 0);
  const metrics = extractRunMetrics(details);

  return {
    runIndex,
    scenarioName,
    generatedAt: new Date(completedAt || Date.now()).toISOString(),
    startedAt: new Date(startedAt || Date.now()).toISOString(),
    completedAt: new Date(completedAt || Date.now()).toISOString(),
    zoteroVersion: String(scenarioReport?.zoteroVersion || "").trim() || null,
    command,
    passed,
    status,
    statusLabel: passed ? "通过" : "失败",
    durationMs,
    details,
    metrics,
    artifact: artifact || null,
    failure: null,
    processStatus: Number(processResult?.status ?? 0),
    stdoutTail: formatOutputTail(processResult?.stdout || ""),
    stderrTail: formatOutputTail(processResult?.stderr || ""),
  };
}

function buildRunFailureSummary({
  runIndex,
  scenarioName,
  startedAt,
  completedAt,
  command,
  processResult,
  error,
} = {}) {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Number(completedAt || Date.now()) - Number(startedAt || Date.now())),
  });

  return {
    runIndex,
    scenarioName,
    generatedAt: new Date(completedAt || Date.now()).toISOString(),
    startedAt: new Date(startedAt || Date.now()).toISOString(),
    completedAt: new Date(completedAt || Date.now()).toISOString(),
    zoteroVersion: null,
    command,
    passed: false,
    status: "failed",
    statusLabel: "失败",
    durationMs: 0,
    details: {},
    metrics: extractRunMetrics({}),
    artifact: null,
    failure: failureInfo,
    processStatus: Number(processResult?.status ?? -1),
    stdoutTail: formatOutputTail(processResult?.stdout || ""),
    stderrTail: formatOutputTail(processResult?.stderr || ""),
  };
}

export function summarizeWasmKernelSmokeReport({
  scenarioName = DEFAULT_WASM_KERNEL_SCENARIO_NAME,
  repeats = 0,
  runs = [],
  assets = {},
} = {}) {
  const normalizedRuns = Array.isArray(runs) ? runs : [];
  const passedRunCount = normalizedRuns.filter((run) => run?.passed === true).length;
  const failedRunCount = normalizedRuns.length - passedRunCount;
  const status = failedRunCount === 0 ? "passed" : "failed";
  const zoteroVersions = Array.from(new Set(
    normalizedRuns
      .map((run) => String(run?.zoteroVersion || "").trim())
      .filter(Boolean),
  ));

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    scenarioName,
    repeats: Number(repeats || normalizedRuns.length || 0),
    passedRunCount,
    failedRunCount,
    status,
    statusLabel: status === "passed" ? "通过" : "失败",
    zoteroVersion: zoteroVersions.length === 1 ? zoteroVersions[0] : null,
    assets,
    metrics: {
      scenarioDurationMsMedian: computeMedian(normalizedRuns.map((run) => Number(run?.durationMs || 0))),
      probeTotalDurationMsMedian: computeMedian(normalizedRuns.map((run) => Number(run?.metrics?.probeTotalDurationMs || 0))),
      mainThreadInitDurationMsMedian: computeMedian(normalizedRuns.map((run) => Number(run?.metrics?.mainThreadInitDurationMs || 0))),
      mainThreadTotalDurationMsMedian: computeMedian(normalizedRuns.map((run) => Number(run?.metrics?.mainThreadTotalDurationMs || 0))),
      workerInitDurationMsMedian: computeMedian(normalizedRuns.map((run) => Number(run?.metrics?.workerInitDurationMs || 0))),
      workerTotalDurationMsMedian: computeMedian(normalizedRuns.map((run) => Number(run?.metrics?.workerTotalDurationMs || 0))),
    },
    consistentAcrossTransportsCount: normalizedRuns.filter((run) => run?.metrics?.consistentAcrossTransports === true).length,
    readinessOKCount: normalizedRuns.filter((run) => run?.metrics?.readinessOK === true).length,
    runs: normalizedRuns,
    summary: failedRunCount === 0
      ? `共 ${normalizedRuns.length} 次 run，全部通过；main-thread 中位 ${computeMedian(normalizedRuns.map((run) => Number(run?.metrics?.mainThreadTotalDurationMs || 0)))}ms，worker 中位 ${computeMedian(normalizedRuns.map((run) => Number(run?.metrics?.workerTotalDurationMs || 0)))}ms。`
      : `共 ${normalizedRuns.length} 次 run，失败 ${failedRunCount} 次；先检查 scenario 输出与 stdout/stderr tail。`,
  };
}

export function renderWasmKernelSmokeMarkdown(report = {}) {
  const lines = [
    "# Wasm Kernel Smoke",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- 场景: \`${report.scenarioName || "-"}\``,
    `- 状态: \`${report.statusLabel || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- 重复次数: \`${report.repeats || 0}\``,
    `- 通过次数: \`${report.passedRunCount || 0}/${report.repeats || 0}\``,
    `- Source 资产: \`${formatBytes(report.assets?.source?.combinedBytes || 0)}\``,
    `- Build 资产: \`${formatBytes(report.assets?.build?.combinedBytes || 0)}\``,
    `- Scenario duration 中位: \`${Number(report.metrics?.scenarioDurationMsMedian || 0)}ms\``,
    `- Probe total 中位: \`${Number(report.metrics?.probeTotalDurationMsMedian || 0)}ms\``,
    `- Main-thread total 中位: \`${Number(report.metrics?.mainThreadTotalDurationMsMedian || 0)}ms\``,
    `- Worker total 中位: \`${Number(report.metrics?.workerTotalDurationMsMedian || 0)}ms\``,
    `- Cross-transport consistent: \`${Number(report.consistentAcrossTransportsCount || 0)}/${report.repeats || 0}\``,
    `- Readiness OK: \`${Number(report.readinessOKCount || 0)}/${report.repeats || 0}\``,
    `- 摘要: ${report.summary || "-"}`,
    "",
    "## Runs",
    "",
  ];

  (Array.isArray(report.runs) ? report.runs : []).forEach((run) => {
    lines.push(`### Run ${run.runIndex}`);
    lines.push("");
    lines.push(`- 状态: \`${run.statusLabel || run.status || "-"}\``);
    lines.push(`- Scenario duration: \`${Number(run.durationMs || 0)}ms\``);
    lines.push(`- Probe total: \`${Number(run.metrics?.probeTotalDurationMs || 0)}ms\``);
    lines.push(`- Main-thread total/init: \`${Number(run.metrics?.mainThreadTotalDurationMs || 0)}ms / ${Number(run.metrics?.mainThreadInitDurationMs || 0)}ms\``);
    lines.push(`- Worker total/init: \`${Number(run.metrics?.workerTotalDurationMs || 0)}ms / ${Number(run.metrics?.workerInitDurationMs || 0)}ms\``);
    lines.push(`- Cross-transport consistent: \`${run.metrics?.consistentAcrossTransports === true ? "yes" : "no"}\``);
    lines.push(`- Readiness OK: \`${run.metrics?.readinessOK === true ? "yes" : "no"}\``);
    lines.push(`- stdout tail: \`${(run.stdoutTail || []).join(" | ") || "-"}\``);
    lines.push(`- stderr tail: \`${(run.stderrTail || []).join(" | ") || "-"}\``);
    if (run.failure?.errorMessage) {
      lines.push(`- failure: \`${run.failure.errorCategoryLabel || "错误"} / ${run.failure.failedStage || "-"} / ${run.failure.errorMessage}\``);
    }
    lines.push("");
  });

  return lines.join("\n");
}

export async function persistWasmKernelSmokeReport(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const artifacts = resolveZoteroWasmKernelArtifacts(projectRootPath);
  const scenarioArtifacts = resolveZoteroWasmKernelScenarioArtifacts(projectRootPath, report?.scenarioName);
  const timestamp = toSafeTimestamp(report?.generatedAt || new Date());
  const archiveJSONPath = path.join(scenarioArtifacts.smokeDir, `${timestamp}.json`);
  const archiveMDPath = path.join(scenarioArtifacts.smokeDir, `${timestamp}.md`);
  const markdown = `${renderWasmKernelSmokeMarkdown(report)}\n`;
  const reportJSON = `${JSON.stringify(report, null, 2)}\n`;
  const writeTargets = [
    [scenarioArtifacts.smokeJSON, reportJSON],
    [scenarioArtifacts.smokeMD, markdown],
    [scenarioArtifacts.smokeLatestJSON, reportJSON],
    [scenarioArtifacts.smokeLatestMD, markdown],
    [archiveJSONPath, reportJSON],
    [archiveMDPath, markdown],
  ];

  await fs.mkdir(artifacts.artifactsDir, { recursive: true });
  await fs.mkdir(scenarioArtifacts.smokeDir, { recursive: true });

  if (scenarioArtifacts.isDefaultScenario) {
    await fs.mkdir(artifacts.smokeDir, { recursive: true });
    writeTargets.push(
      [artifacts.smokeJSON, reportJSON],
      [artifacts.smokeMD, markdown],
      [artifacts.smokeLatestJSON, reportJSON],
      [artifacts.smokeLatestMD, markdown],
      [path.join(artifacts.smokeDir, `${timestamp}.json`), reportJSON],
      [path.join(artifacts.smokeDir, `${timestamp}.md`), markdown],
    );
  }

  await Promise.all(writeTargets.map(([filePath, contents]) => fs.writeFile(filePath, contents, "utf-8")));

  return {
    reportPath: scenarioArtifacts.smokeJSON,
    reportMDPath: scenarioArtifacts.smokeMD,
    latestJSONPath: scenarioArtifacts.smokeLatestJSON,
    latestMDPath: scenarioArtifacts.smokeLatestMD,
    archiveJSONPath,
    archiveMDPath,
    defaultReportPath: scenarioArtifacts.isDefaultScenario ? artifacts.smokeJSON : null,
    defaultReportMDPath: scenarioArtifacts.isDefaultScenario ? artifacts.smokeMD : null,
  };
}

export function buildWasmKernelSmokeCommand({
  projectRootPath,
  scenarioName,
} = {}) {
  return {
    bin: resolveNpmExecutable(),
    args: [
      "run",
      "zotero:scenario",
      "--",
      "--scenario",
      scenarioName,
    ],
    cwd: projectRootPath,
  };
}

export async function inspectWasmKernelScenarioArtifact({
  artifacts,
  startedAt,
  scenarioName,
  runIndex,
  readScenarioReport = (filePath) => readJSONFile(filePath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    missingStage: "read-scenario-last-run",
    invalidStage: "read-scenario-last-run",
    label: filePath,
  }),
  statScenarioReport = (filePath) => fs.stat(filePath),
} = {}) {
  const scenarioReport = await readScenarioReport(artifacts.scenarioLastRunJSON);
  const reportStats = await statScenarioReport(artifacts.scenarioLastRunJSON);
  const reportGeneratedAtMs = normalizeTimestampMs(scenarioReport?.generatedAt);
  const reportMtimeMs = normalizeTimestampMs(reportStats?.mtimeMs);
  const freshestArtifactMs = [reportGeneratedAtMs, reportMtimeMs]
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0] ?? null;
  const artifact = {
    scenarioLastRunJSON: artifacts.scenarioLastRunJSON,
    fresh: Number.isFinite(freshestArtifactMs) && freshestArtifactMs >= Number(startedAt || 0),
    generatedAt: Number.isFinite(reportGeneratedAtMs) ? new Date(reportGeneratedAtMs).toISOString() : null,
    mtime: Number.isFinite(reportMtimeMs) ? new Date(reportMtimeMs).toISOString() : null,
  };

  if (!artifact.fresh) {
    throw createScriptError("validation", `Scenario last-run artifact is stale: ${artifacts.scenarioLastRunJSON}`, {
      failedStage: "read-scenario-last-run",
      details: {
        runIndex,
        scenarioName,
        startedAt: new Date(startedAt || 0).toISOString(),
        reportGeneratedAt: artifact.generatedAt,
        reportMtime: artifact.mtime,
        scenarioLastRunJSON: artifacts.scenarioLastRunJSON,
      },
    });
  }

  const scenarioResult = (Array.isArray(scenarioReport?.results) ? scenarioReport.results : [])
    .find((entry) => entry?.name === scenarioName) || null;
  if (!scenarioResult) {
    throw createScriptError("validation", `Scenario result missing: ${scenarioName}`, {
      failedStage: "extract-scenario-result",
      details: {
        scenarioLastRunJSON: artifacts.scenarioLastRunJSON,
        runIndex,
      },
    });
  }

  return {
    scenarioReport,
    scenarioResult,
    artifact,
  };
}

export async function runSingleWasmKernelSmokeIteration({
  projectRootPath,
  runIndex,
  scenarioName,
  executeScenarioRun = ({ projectRootPath: cwd, scenarioName: selectedScenarioName }) => runScenarioMode({
    projectRootPath: cwd,
    scenarioPattern: selectedScenarioName,
    quiet: true,
  }),
  spawnScenarioProcess = null,
  readScenarioReport,
  statScenarioReport,
} = {}) {
  const artifacts = resolveZoteroWasmKernelArtifacts(projectRootPath);
  const command = buildWasmKernelSmokeCommand({
    projectRootPath,
    scenarioName,
  });
  const startedAt = Date.now();
  let processResult = null;

  if (executeScenarioRun) {
    let execution = null;
    try {
      execution = await Promise.resolve(executeScenarioRun({
        projectRootPath,
        scenarioName,
        runIndex,
        command,
      }));
    } catch (error) {
      const completedAt = Date.now();
      const processLogs = Array.isArray(error?.details?.processLogs) ? error.details.processLogs : [];
      processResult = {
        status: Number(error?.details?.processStatus ?? 1),
        stdout: formatProcessLogTail(processLogs, "zotero.stdout").join("\n"),
        stderr: formatProcessLogTail(processLogs, "zotero.stderr").join("\n"),
      };
      return buildRunFailureSummary({
        runIndex,
        scenarioName,
        startedAt,
        completedAt,
        command,
        processResult,
        error,
      });
    }

    const completedAt = Date.now();
    processResult = {
      status: execution?.scenarioResult?.failed > 0 || execution?.scenarioResult?.execution?.incomplete
        ? 1
        : 0,
      stdout: formatProcessLogTail(execution?.processLogs, "zotero.stdout").join("\n"),
      stderr: formatProcessLogTail(execution?.processLogs, "zotero.stderr").join("\n"),
    };

    try {
      const {
        scenarioReport,
        scenarioResult,
        artifact,
      } = await inspectWasmKernelScenarioArtifact({
        artifacts,
        startedAt,
        scenarioName,
        runIndex,
        readScenarioReport,
        statScenarioReport,
      });

      return buildRunSummary({
        runIndex,
        scenarioName,
        startedAt,
        completedAt,
        command,
        processResult,
        scenarioResult,
        scenarioReport,
        artifact,
      });
    } catch (error) {
      return buildRunFailureSummary({
        runIndex,
        scenarioName,
        startedAt,
        completedAt,
        command,
        processResult,
        error,
      });
    }
  }

  const legacySpawnScenarioProcess = spawnScenarioProcess || ((legacyCommand) => spawnSync(legacyCommand.bin, legacyCommand.args, {
    cwd: legacyCommand.cwd,
    encoding: "utf-8",
  }));

  try {
    processResult = await Promise.resolve(legacySpawnScenarioProcess(command));
  } catch (error) {
    const completedAt = Date.now();
    return buildRunFailureSummary({
      runIndex,
      scenarioName,
      startedAt,
      completedAt,
      command,
      processResult,
      error: createScriptError("execution", `Scenario command failed to start: ${scenarioName}`, {
        failedStage: "run-scenario",
        details: {
          runIndex,
          scenarioName,
          command,
        },
        cause: error,
      }),
    });
  }

  const completedAt = Date.now();
  if (processResult?.error) {
    return buildRunFailureSummary({
      runIndex,
      scenarioName,
      startedAt,
      completedAt,
      command,
      processResult,
      error: createScriptError("execution", `Scenario command failed: ${scenarioName}`, {
        failedStage: "run-scenario",
        details: {
          runIndex,
          scenarioName,
          command,
          causeMessage: String(processResult.error?.message || processResult.error || "spawn failed"),
        },
        cause: processResult.error,
      }),
    });
  }

  if (Number(processResult?.status ?? -1) !== 0) {
    return buildRunFailureSummary({
      runIndex,
      scenarioName,
      startedAt,
      completedAt,
      command,
      processResult,
      error: createScriptError("execution", `Scenario command exited with status ${Number(processResult?.status ?? -1)}`, {
        failedStage: "run-scenario",
        details: {
          runIndex,
          scenarioName,
          command,
          processStatus: Number(processResult?.status ?? -1),
        },
      }),
    });
  }

  try {
    const {
      scenarioReport,
      scenarioResult,
      artifact,
    } = await inspectWasmKernelScenarioArtifact({
      artifacts,
      startedAt,
      scenarioName,
      runIndex,
      readScenarioReport,
      statScenarioReport,
    });

    return buildRunSummary({
      runIndex,
      scenarioName,
      startedAt,
      completedAt,
      command,
      processResult,
      scenarioResult,
      scenarioReport,
      artifact,
    });
  } catch (error) {
    return buildRunFailureSummary({
      runIndex,
      scenarioName,
      startedAt,
      completedAt,
      command,
      processResult,
      error,
    });
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseWasmKernelSmokeArgs(argv);
  const addonConfig = await readJSONFile(path.join(projectRoot, "config", "addon.config.json"), {
    missingCategory: "config",
    invalidCategory: "config",
    missingStage: "read-addon-config",
    invalidStage: "read-addon-config",
    label: "config/addon.config.json",
  });
  const runs = [];

  for (let runIndex = 1; runIndex <= options.repeats; runIndex += 1) {
    runs.push(await runSingleWasmKernelSmokeIteration({
      projectRootPath: projectRoot,
      runIndex,
      scenarioName: options.scenarioName,
    }));
  }

  const assetInventory = await collectWasmKernelAssetInventory(projectRoot, addonConfig.addonRef);

  const smokeReport = summarizeWasmKernelSmokeReport({
    scenarioName: options.scenarioName,
    repeats: options.repeats,
    runs,
    assets: assetInventory,
  });
  const smokePaths = await persistWasmKernelSmokeReport(smokeReport, {
    projectRootPath: projectRoot,
  });
  const digestSmokeReport = options.scenarioName === DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME
    ? smokeReport
    : await readWasmKernelDigestSmokeReportIfExists(projectRoot);
  const performanceReport = summarizeWasmKernelPerformanceReport({
    smokeReport,
    digestSmokeReport,
    smokeReportPath: smokePaths.reportPath,
    scenarioName: options.scenarioName,
    assetInventory,
  });
  const performancePaths = await persistWasmKernelPerformanceReport(performanceReport, {
    projectRootPath: projectRoot,
  });

  console.log(`Wasm kernel smoke report generated: ${smokePaths.reportPath}`);
  console.log(`Wasm kernel performance report refreshed: ${performancePaths.reportPath}`);
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
