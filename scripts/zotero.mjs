import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  evaluateCycle,
  summarizeLogs,
} from "./agent-zotero-e2e-lib.mjs";
import {
  RdpClient,
  buildAddon,
  buildStartupArgs,
  createWatchSnapshot,
  diffWatchSnapshots,
  findFilesRecursive,
  findFreePort,
  getDefaultWatchRoots,
  installProxyAddon,
  prepareRuntime,
  readAddonRuntimeInfo,
  readRunnerConfig,
  stopChildProcess,
  toFileHref,
} from "./zotero-runner-lib.mjs";
import {
  clearCapturedLogs,
  ensurePluginReady,
  installRuntimeLogBridge,
  mergeLogSummaries,
  readCapturedLogs,
  runFunctionalActions,
} from "./zotero-agent-runtime-lib.mjs";
import { runWatchRecoveryFlow } from "./zotero-watch-recovery-lib.mjs";
import { buildWatchStatusMarkdown } from "./zotero-watch-report-lib.mjs";
import {
  buildWatchHealthSummaryNote,
  hasWatchBaselineRegistrationIssues,
  readWatchBaselineSnapshot,
  waitForWatchBaselineSettled,
} from "./zotero-watch-health-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const MODES = {
  dev: {
    devtools: false,
    fresh: false,
    keepOpen: true,
    watch: false,
    label: "Development",
  },
  console: {
    devtools: true,
    fresh: false,
    keepOpen: true,
    watch: false,
    label: "Console",
  },
  watch: {
    devtools: false,
    fresh: false,
    keepOpen: true,
    watch: true,
    label: "Watch",
  },
  test: {
    devtools: false,
    fresh: true,
    keepOpen: false,
    watch: false,
    label: "Integration Test",
  },
  scenario: {
    devtools: false,
    fresh: true,
    keepOpen: false,
    watch: false,
    label: "Scenario Validation",
  },
  smoke: {
    devtools: false,
    fresh: true,
    keepOpen: false,
    watch: false,
    label: "Smoke Test",
  },
};

function readWatchRecoveryTestOptions(env = process.env) {
  const injectFailure = String(env.ZOTERO_PLUGIN_WATCH_RECOVERY_INJECT || "").trim();
  if (!injectFailure) {
    return null;
  }
  return {
    injectFailure,
  };
}

function usage() {
  console.log(`Usage: node scripts/zotero.mjs <dev|console|watch|test|scenario|smoke> [--fresh] [--keep-open] [--watch] [--no-package]

Modes:
  dev      Launch isolated Zotero, install the current add-on, keep the app open
  console  Same as dev, but also open Zotero's Browser Toolbox with --jsdebugger
  watch    Keep Zotero open, watch source files, and reload the temporary add-on on change
  test     Run zotero-tests/*.test.js inside Zotero's chrome process and exit with a test status
  scenario Run zotero-scenarios/*.scenario.js inside Zotero's chrome process and exit with a scenario status
  smoke    Launch isolated Zotero, install the add-on, verify it through RDP, then exit
`);
}

function parseCli(argv) {
  const [mode, ...flags] = argv;
  if (!mode || mode === "--help" || mode === "-h") {
    usage();
    process.exit(mode ? 0 : 1);
  }

  if (!MODES[mode]) {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  return {
    mode,
    fresh: flags.includes("--fresh") || MODES[mode].fresh,
    keepOpen: flags.includes("--keep-open") || MODES[mode].keepOpen,
    watch: flags.includes("--watch") || MODES[mode].watch,
    skipPackage: flags.includes("--no-package"),
  };
}

function formatChangedFiles(filePaths) {
  const preview = filePaths.slice(0, 3).join(", ");
  if (filePaths.length <= 3) {
    return preview;
  }
  return `${preview} (+${filePaths.length - 3} more)`;
}

function parseChromeEvalResult(rawResult) {
  if (typeof rawResult === "string") {
    return JSON.parse(rawResult);
  }
  return rawResult;
}

function appendProcessLogs(processLogs, source, chunk) {
  const lines = String(chunk)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    processLogs.push({
      at: new Date().toISOString(),
      source,
      level: source === "zotero.stderr" ? "stderr" : "stdout",
      message: line,
    });
  }
  if (processLogs.length > 1200) {
    processLogs.splice(0, processLogs.length - 1200);
  }
}

async function persistWatchStatus(projectRoot, report) {
  const distDir = path.join(projectRoot, "dist");
  const jsonPath = path.join(distDir, "zotero-watch-status.json");
  const markdownPath = path.join(distDir, "zotero-watch-status.md");
  const latestReload = report.reloads.length > 0
    ? report.reloads[report.reloads.length - 1]
    : null;
  report.generatedAt = new Date().toISOString();
  report.latest = latestReload || report.startup || null;
  report.latestStatus = report.latest?.passed === false ? "failed" : "healthy";

  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  await fs.writeFile(markdownPath, `${buildWatchStatusMarkdown(report)}\n`, "utf-8");
  return { jsonPath, markdownPath };
}

async function createWatchHealthEntry({
  index,
  trigger,
  changedFiles,
  readinessMode,
  rdp,
  config,
  processLogs,
  processLogStart,
  summaryNote,
}) {
  const baselineSettle = await waitForWatchBaselineSettled({
    readSnapshot: () => readWatchBaselineSnapshot({ rdp, config }),
  });
  const checks = await runFunctionalActions({ rdp, config });
  const runtimeLogs = await readCapturedLogs(rdp);
  const nativeLogs = processLogs.slice(processLogStart);
  const nativeLogSummary = summarizeLogs(nativeLogs);
  const logs = mergeLogSummaries(nativeLogSummary, runtimeLogs);
  const evaluated = evaluateCycle({
    checks,
    logs,
  });
  const issues = [...evaluated.issues];
  const hasConcreteErrors = Array.isArray(logs.recentErrors) && logs.recentErrors.length > 0;
  if (!hasConcreteErrors) {
    const logIssueIndex = issues.findIndex((issue) => issue.includes("error 级日志"));
    if (logIssueIndex >= 0) {
      issues.splice(logIssueIndex, 1);
    }
  }
  const passed = issues.length === 0;

  return {
    index,
    trigger,
    at: new Date().toISOString(),
    changedFiles,
    readinessMode,
    checks,
    logs,
    passed,
    issues,
    hints: passed ? [] : evaluated.hints,
    summaryNote: buildWatchHealthSummaryNote({
      trigger,
      passed,
      baselineSettled: baselineSettle.settled,
      baselineRegistrationBlocking: hasWatchBaselineRegistrationIssues(issues),
      successSummaryNote: summaryNote,
    }),
  };
}

async function createWatchFailureEntry({
  index,
  trigger,
  changedFiles,
  error,
  rdp,
  processLogs,
  processLogStart,
}) {
  let runtimeLogs = null;
  try {
    runtimeLogs = await readCapturedLogs(rdp);
  }
  catch {
    runtimeLogs = null;
  }

  const nativeLogs = processLogs.slice(processLogStart);
  const nativeLogSummary = summarizeLogs(nativeLogs);
  const logs = mergeLogSummaries(nativeLogSummary, runtimeLogs);
  const issues = [`热重载失败：${error?.message || String(error)}`];
  if (Number(logs.errorCount || 0) > 0) {
    issues.push(`检测到 ${logs.errorCount} 条 error 级日志。`);
  }

  return {
    index,
    trigger,
    at: new Date().toISOString(),
    changedFiles,
    readinessMode: null,
    checks: null,
    logs,
    passed: false,
    issues,
    hints: [
      "先查看 `dist/zotero-watch-status.md` 的最近错误日志和问题清单。",
      "如需完整复验，可执行 `npm run agent:zotero:e2e` 或 `npm run agent:zotero:autofix`。",
    ],
    summaryNote: "热重载流程失败",
    error: {
      message: error?.message || String(error),
    },
  };
}

function pushWatchReloadEntry(report, entry) {
  report.reloads.push(entry);
  if (report.reloads.length > 20) {
    report.reloads.splice(0, report.reloads.length - 20);
  }
}

function attachChildProcessLogs(child, processLogs) {
  if (child.stdout) {
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      appendProcessLogs(processLogs, "zotero.stdout", chunk);
    });
  }
  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      appendProcessLogs(processLogs, "zotero.stderr", chunk);
    });
  }
}

function spawnManagedChild({
  binaryPath,
  args,
  processLogs,
}) {
  const child = spawn(binaryPath, args, {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  attachChildProcessLogs(child, processLogs);
  return child;
}

function attachSessionExitHandler({
  child,
  getCurrentChild,
  keepOpen,
  isShuttingDown,
}) {
  child.once("exit", (code, signal) => {
    if (child !== getCurrentChild()) {
      return;
    }
    if (!isShuttingDown() && keepOpen) {
      process.exit(code ?? (signal ? 1 : 0));
    }
  });
}

function logSessionActivation({
  mode,
  addon,
  addonState,
  readiness,
  config,
  devtools,
}) {
  console.log(
    `[zotero:${mode}] Add-on loaded: ${addon.name} (${addon.id})`,
  );
  if (addonState.found && addonState.userDisabled) {
    console.log(
      `[zotero:${mode}] Requested add-on enablement for ${config.addonId}.`,
    );
  }
  if (devtools) {
    console.log("[zotero:console] Browser Toolbox requested via --jsdebugger.");
  }
  if (readiness.mode === "manual") {
    console.log(
      `[zotero:${mode}] Applied chrome bootstrap fallback for ${config.instanceKey}.`,
    );
  }
  else if (readiness.mode === "plugins-init") {
    console.log(
      `[zotero:${mode}] Triggered Zotero.Plugins.init() for ${config.instanceKey}.`,
    );
  }
}

async function launchManagedSession({
  binaryPath,
  args,
  rdpPort,
  processLogs,
  config,
}) {
  const child = spawnManagedChild({
    binaryPath,
    args,
    processLogs,
  });
  const rdp = new RdpClient();
  await rdp.connect({ port: rdpPort });
  await installRuntimeLogBridge(rdp);

  let addon = await rdp.waitForAddonById(config.addonId);
  const addonState = await rdp.enableAddonById(config.addonId);
  if (addonState.found && addonState.isActive) {
    addon = await rdp.waitForAddonById(config.addonId);
  }

  const readiness = await ensurePluginReady({
    rdp,
    config,
  });

  return {
    child,
    rdp,
    addon,
    addonState,
    readiness,
  };
}

async function stopManagedSession(session) {
  if (!session) {
    return;
  }
  session.rdp.disconnect();
  await stopChildProcess(session.child);
}

async function discoverZoteroTests(projectRoot) {
  const testRoot = path.join(projectRoot, "zotero-tests");
  const files = await findFilesRecursive(
    testRoot,
    (filePath) => filePath.endsWith(".test.js"),
  );

  return files;
}

async function discoverZoteroScenarios(projectRoot) {
  const scenarioRoot = path.join(projectRoot, "zotero-scenarios");
  const files = await findFilesRecursive(
    scenarioRoot,
    (filePath) => filePath.endsWith(".scenario.js"),
  );

  return files;
}

function printTestResults(testResult) {
  console.log("[zotero:test] Results");
  for (const result of testResult.results) {
    const prefix = result.status === "passed" ? "PASS" : "FAIL";
    console.log(`[zotero:test] ${prefix} ${result.name} (${result.durationMs}ms)`);
    if (result.status === "failed" && result.error) {
      console.log(`[zotero:test]   ${result.error.message}`);
    }
  }
  console.log(
    `[zotero:test] Summary: ${testResult.summary.passed}/${testResult.summary.total} passed, ${testResult.summary.failed} failed`,
  );
}

function printScenarioResults(result) {
  console.log("[zotero:scenario] Results");
  for (const item of result.results) {
    const prefix = item.status === "passed" ? "PASS" : "FAIL";
    console.log(`[zotero:scenario] ${prefix} ${item.name} (${item.durationMs}ms)`);
    if (item.status === "failed" && item.error) {
      console.log(`[zotero:scenario]   ${item.error.message}`);
    }
  }
  console.log(
    `[zotero:scenario] Summary: ${result.summary.passed}/${result.summary.total} passed, ${result.summary.failed} failed`,
  );
}

async function startWatchLoop({
  projectRoot,
  intervalMs,
  onChange,
}) {
  const relativeRoots = getDefaultWatchRoots();
  let previousSnapshot = await createWatchSnapshot(projectRoot, relativeRoots);
  let running = false;

  const tick = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const nextSnapshot = await createWatchSnapshot(projectRoot, relativeRoots);
      const changedFiles = diffWatchSnapshots(previousSnapshot, nextSnapshot);
      if (changedFiles.length > 0) {
        previousSnapshot = nextSnapshot;
        await onChange(changedFiles);
      }
    }
    finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    tick().catch((error) => {
      console.error(`[zotero:watch] ${error.stack || error.message}`);
    });
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return () => {
    clearInterval(timer);
  };
}

async function runIntegratedTests({
  projectRoot,
  rdp,
  config,
}) {
  const testFiles = await discoverZoteroTests(projectRoot);
  if (testFiles.length === 0) {
    throw new Error("No Zotero integration tests found under zotero-tests/*.test.js");
  }

  const harnessHref = toFileHref(path.join(projectRoot, "scripts", "zotero-test-runtime.js"));
  const fileHrefs = testFiles.map((filePath) => toFileHref(filePath));
  const minimalConfig = {
    addonId: config.addonId,
    addonName: config.addonName,
    addonRef: config.addonRef,
    instanceKey: config.instanceKey,
  };

  const expression = `(async () => {
    const scope = {};
    Services.scriptloader.loadSubScript(${JSON.stringify(harnessHref)}, scope);
    return await scope.runCleanroomZoteroTests(${JSON.stringify({
      fileHrefs,
      addonConfig: minimalConfig,
    })});
  })()`;

  const rawResult = await rdp.evaluateInChrome(expression);
  const parsedResult = parseChromeEvalResult(rawResult);
  printTestResults(parsedResult);

  if (parsedResult.summary.failed > 0) {
    throw new Error(`Zotero integration tests failed: ${parsedResult.summary.failed}`);
  }
}

async function runIntegratedScenarios({
  projectRoot,
  rdp,
  config,
}) {
  const scenarioFiles = await discoverZoteroScenarios(projectRoot);
  if (scenarioFiles.length === 0) {
    throw new Error("No Zotero scenarios found under zotero-scenarios/*.scenario.js");
  }

  const harnessHref = toFileHref(path.join(projectRoot, "scripts", "zotero-scenario-runtime.js"));
  const fileHrefs = scenarioFiles.map((filePath) => toFileHref(filePath));
  const minimalConfig = {
    addonId: config.addonId,
    addonName: config.addonName,
    addonRef: config.addonRef,
    instanceKey: config.instanceKey,
  };

  const expression = `(async () => {
    const scope = {};
    Services.scriptloader.loadSubScript(${JSON.stringify(harnessHref)}, scope);
    return await scope.runCleanroomZoteroScenarios(${JSON.stringify({
      fileHrefs,
      addonConfig: minimalConfig,
    })});
  })()`;

  const rawResult = await rdp.evaluateInChrome(expression);
  const parsedResult = parseChromeEvalResult(rawResult);
  printScenarioResults(parsedResult);

  if (parsedResult.summary.failed > 0) {
    throw new Error(`Zotero scenarios failed: ${parsedResult.summary.failed}`);
  }
}

async function main() {
  const { mode, fresh, keepOpen, watch, skipPackage } = parseCli(process.argv.slice(2));
  const baseMode = MODES[mode];

  if (!skipPackage) {
    buildAddon(projectRoot);
  }

  const { config, buildPath, xpiPath } = await readAddonRuntimeInfo(projectRoot);
  const runnerConfig = await readRunnerConfig({ projectRoot, mode });
  const rdpPort = runnerConfig.rdpPort || await findFreePort();
  const watchRecoveryTestOptions = readWatchRecoveryTestOptions();

  await prepareRuntime({
    projectRoot,
    profilePath: runnerConfig.profilePath,
    dataDir: runnerConfig.dataDir,
    fresh,
  });
  await installProxyAddon({
    profilePath: runnerConfig.profilePath,
    addonId: config.addonId,
    addonPath: buildPath,
  });

  const args = buildStartupArgs({
    profilePath: runnerConfig.profilePath,
    dataDir: runnerConfig.dataDir,
    rdpPort,
    devtools: baseMode.devtools,
  });

  console.log(`[zotero:${mode}] ${baseMode.label}`);
  console.log(`[zotero:${mode}] Binary: ${runnerConfig.binaryPath}`);
  console.log(`[zotero:${mode}] Profile: ${runnerConfig.profilePath}`);
  console.log(`[zotero:${mode}] Data: ${runnerConfig.dataDir}`);
  console.log(`[zotero:${mode}] Build: ${buildPath}`);
  console.log(`[zotero:${mode}] Install Mode: proxy`);
  if (xpiPath) {
    console.log(`[zotero:${mode}] Package: ${xpiPath}`);
  }
  console.log(`[zotero:${mode}] RDP Port: ${rdpPort}`);
  if (watch) {
    console.log(`[zotero:${mode}] Watch Interval: ${runnerConfig.watchIntervalMs}ms`);
  }

  let session = null;
  let shuttingDown = false;
  let sessionTransitionDepth = 0;
  let stopWatching = null;
  const processLogs = [];
  const watchReport = {
    sessionStartedAt: new Date().toISOString(),
    instanceKey: config.instanceKey,
    startup: null,
    reloads: [],
  };
  let watchEntryIndex = 0;

  const cleanup = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (stopWatching) {
      stopWatching();
      stopWatching = null;
    }
    await stopManagedSession(session);
    session = null;
  };

  const getCurrentChild = () => session?.child || null;
  const attachExitWatcher = (child) => {
    attachSessionExitHandler({
      child,
      getCurrentChild,
      keepOpen,
      isShuttingDown: () => shuttingDown || sessionTransitionDepth > 0,
    });
  };
  const beginSessionTransition = () => {
    sessionTransitionDepth += 1;
  };
  const endSessionTransition = () => {
    sessionTransitionDepth = Math.max(0, sessionTransitionDepth - 1);
  };
  const getNextWatchIndex = () => {
    watchEntryIndex += 1;
    return watchEntryIndex;
  };
  const persistReport = async () => await persistWatchStatus(projectRoot, watchReport);

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(130);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(143);
  });

  try {
    session = await launchManagedSession({
      binaryPath: runnerConfig.binaryPath,
      args,
      rdpPort,
      processLogs,
      config,
    });
    attachExitWatcher(session.child);
    logSessionActivation({
      mode,
      addon: session.addon,
      addonState: session.addonState,
      readiness: session.readiness,
      config,
      devtools: baseMode.devtools,
    });

    if (watch) {
      await clearCapturedLogs(session.rdp);
      const startupProcessLogStart = processLogs.length;
      watchReport.startup = await createWatchHealthEntry({
        index: getNextWatchIndex(),
        trigger: "startup",
        changedFiles: [],
        readinessMode: session.readiness.mode,
        rdp: session.rdp,
        config,
        processLogs,
        processLogStart: startupProcessLogStart,
        summaryNote: "启动完成并通过健康检查",
      });
      const reportPaths = await persistReport();
      console.log(
        `[zotero:watch] Initial health ${watchReport.startup.passed ? "passed" : "failed"}: ${reportPaths.markdownPath}`,
      );
    }

    if (mode === "test") {
      await runIntegratedTests({
        projectRoot,
        rdp: session.rdp,
        config,
      });
    }

    if (mode === "scenario") {
      await runIntegratedScenarios({
        projectRoot,
        rdp: session.rdp,
        config,
      });
    }

    if (watch) {
      stopWatching = await startWatchLoop({
        projectRoot,
        intervalMs: runnerConfig.watchIntervalMs,
        onChange: async (changedFiles) => {
          const processLogStart = processLogs.length;
          await installRuntimeLogBridge(session.rdp);
          await clearCapturedLogs(session.rdp);
          console.log(
            `[zotero:watch] Detected changes: ${formatChangedFiles(changedFiles)}`,
          );
          try {
            buildAddon(projectRoot);
            const reloadedAddon = await session.rdp.reloadAddonById(config.addonId);
            const runtimeState = await session.rdp.restartAddonRuntime({
              addonId: config.addonId,
              addonRef: config.addonRef,
              instanceKey: config.instanceKey,
            });
            const reloadReadiness = await ensurePluginReady({
              rdp: session.rdp,
              config,
            });

            console.log(
              `[zotero:watch] Reloaded add-on: ${reloadedAddon.name} (${reloadedAddon.id})`,
            );
            if (runtimeState.started) {
              console.log(
                `[zotero:watch] Restarted chrome runtime for ${config.instanceKey}.`,
              );
            }

            const entry = await createWatchHealthEntry({
              index: getNextWatchIndex(),
              trigger: "watch-change",
              changedFiles,
              readinessMode: reloadReadiness.mode,
              rdp: session.rdp,
              config,
              processLogs,
              processLogStart,
              summaryNote: "热重载完成并通过健康检查",
            });
            pushWatchReloadEntry(watchReport, entry);
            const reportPaths = await persistReport();
            console.log(
              `[zotero:watch] Health ${entry.passed ? "passed" : "failed"}: ${reportPaths.markdownPath}`,
            );
            if (!entry.passed) {
              await runWatchRecoveryFlow({
                mode,
                changedFiles,
                config,
                processLogs,
                watchReport,
                getNextIndex: getNextWatchIndex,
                persistReport,
                getSession: () => session,
                setSession: (nextSession) => {
                  session = nextSession;
                },
                binaryPath: runnerConfig.binaryPath,
                args,
                rdpPort,
                attachExitWatcher,
                stopManagedSession,
                launchManagedSession,
                logSessionActivation,
                installRuntimeLogBridge,
                clearCapturedLogs,
                ensurePluginReady,
                createWatchHealthEntry,
                createWatchFailureEntry,
                pushWatchReloadEntry,
                beginSessionTransition,
                endSessionTransition,
                recoveryTestOptions: watchRecoveryTestOptions,
              });
            }
          }
          catch (error) {
            const entry = await createWatchFailureEntry({
              index: getNextWatchIndex(),
              trigger: "watch-change",
              changedFiles,
              error,
              rdp: session?.rdp,
              processLogs,
              processLogStart,
            });
            pushWatchReloadEntry(watchReport, entry);
            const reportPaths = await persistReport();
            console.error(`[zotero:watch] ${error.stack || error.message}`);
            console.error(`[zotero:watch] Status report updated: ${reportPaths.markdownPath}`);
            await runWatchRecoveryFlow({
              mode,
              changedFiles,
              config,
              processLogs,
              watchReport,
              getNextIndex: getNextWatchIndex,
              persistReport,
              getSession: () => session,
              setSession: (nextSession) => {
                session = nextSession;
              },
              binaryPath: runnerConfig.binaryPath,
              args,
              rdpPort,
              attachExitWatcher,
              stopManagedSession,
              launchManagedSession,
              logSessionActivation,
              installRuntimeLogBridge,
              clearCapturedLogs,
              ensurePluginReady,
              createWatchHealthEntry,
              createWatchFailureEntry,
              pushWatchReloadEntry,
              beginSessionTransition,
              endSessionTransition,
              recoveryTestOptions: watchRecoveryTestOptions,
            });
          }
        },
      });
      console.log(
        `[zotero:watch] Watching ${getDefaultWatchRoots().join(", ")} for changes.`,
      );
    }

    if (!keepOpen) {
      await cleanup();
      return;
    }

    await new Promise((resolve) => {
      session.child.once("exit", resolve);
    });
  }
  catch (error) {
    await cleanup();
    throw error;
  }
}

main().catch((error) => {
  console.error(`[zotero] ${error.stack || error.message}`);
  process.exit(1);
});
