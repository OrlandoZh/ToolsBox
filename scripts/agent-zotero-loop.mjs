import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  summarizeAutofixReport,
  summarizeE2EReport,
  summarizeWatchRecoveryReport,
} from "./agent-zotero-validation-lib.mjs";
import {
  deriveSmartDebugProbeCandidates,
  summarizeDebugProbeReport,
} from "./agent-zotero-debug-probe-lib.mjs";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import {
  buildZoteroLoopMarkdown,
  deriveZoteroLoopActions,
  summarizeZoteroLoopState,
} from "./agent-zotero-loop-lib.mjs";
import { parseHumanInterventionWindow } from "./agent-obsidian-handoff-lib.mjs";
import { resolveObsidianWorkspaceFiles } from "./agent-obsidian-workspace.mjs";
import {
  DEFAULT_WATCH_STALE_AFTER_MINUTES,
  summarizeZoteroWatchStatus,
} from "./zotero-watch-status-lib.mjs";
import {
  resolveZoteroDebugProbeArtifacts,
  resolveZoteroLoopArtifacts,
  resolveZoteroWatchRecoveryArtifacts,
} from "./zotero-agent-artifacts.mjs";
import {
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const loopArtifacts = resolveZoteroLoopArtifacts(projectRoot);
const watchRecoveryArtifacts = resolveZoteroWatchRecoveryArtifacts(projectRoot);
const obsidianWorkspace = resolveObsidianWorkspaceFiles(projectRoot);
const scriptStartedAt = Date.now();

function usage() {
  console.log(`Usage: node scripts/agent-zotero-loop.mjs [options]

Options:
  --dry-run                Only evaluate and write orchestration plan
  --watch-timeout-ms <n>   Wait time for watch startup refresh (default: 90000)
  --human-window-ms <n>    Wait for optional Obsidian human input before continuing (default: 0)
  --no-fresh-watch         Reuse existing watch runtime when refreshing watch
  --skip-watch-recovery    Do not require / execute watch recovery regression
`);
}

function assert(condition, message, options = {}) {
  assertScript(condition, message, {
    category: options.category || "args",
    failedStage: options.failedStage || "parse-args",
  });
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    watchTimeoutMs: 90000,
    humanWindowMs: 0,
    freshWatch: true,
    requireWatchRecovery: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--watch-timeout-ms") {
      options.watchTimeoutMs = Number.parseInt(String(argv[index + 1] || "90000"), 10);
      index += 1;
      continue;
    }
    if (arg === "--human-window-ms") {
      options.humanWindowMs = Number.parseInt(String(argv[index + 1] || "0"), 10);
      index += 1;
      continue;
    }
    if (arg === "--no-fresh-watch") {
      options.freshWatch = false;
      continue;
    }
    if (arg === "--skip-watch-recovery") {
      options.requireWatchRecovery = false;
      continue;
    }
    throw createScriptError("args", `Unknown option: ${arg}`, {
      failedStage: "parse-args",
    });
  }

  assert(Number.isInteger(options.watchTimeoutMs) && options.watchTimeoutMs >= 30000 && options.watchTimeoutMs <= 600000, "watch-timeout-ms must be 30000-600000");
  assert(Number.isInteger(options.humanWindowMs) && options.humanWindowMs >= 0 && options.humanWindowMs <= 600000, "human-window-ms must be 0-600000");
  return options;
}

async function readJSONIfExists(filePath) {
  return await fs.readFile(filePath, "utf-8")
    .then((content) => JSON.parse(content))
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function runCommand(command, args, label, commandLabel) {
  const startedAt = new Date();
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  const finishedAt = new Date();
  return {
    label,
    commandLabel,
    command: [command, ...args].join(" "),
    startedAtISO: startedAt.toISOString(),
    finishedAtISO: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    exitCode,
    ok: exitCode === 0,
    status: exitCode === 0 ? "passed" : "failed",
  };
}

async function waitFor(condition, timeoutMs, intervalMs = 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await condition();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

async function refreshWatchHealth(options) {
  const args = [path.join(projectRoot, "scripts", "zotero.mjs"), "watch"];
  if (options.freshWatch) {
    args.push("--fresh");
  }

  const sessionStartedAtISO = new Date().toISOString();
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  const startedAt = new Date();
  let exitCode = null;
  child.once("close", (code) => {
    exitCode = code ?? 1;
  });

  try {
    await waitFor(async () => {
      const rawWatchStatus = await readJSONIfExists(watchRecoveryArtifacts.watchStatusJSON);
      const sessionStartedAt = Date.parse(String(rawWatchStatus?.sessionStartedAt || ""));
      if (!Number.isFinite(sessionStartedAt) || sessionStartedAt < Date.parse(sessionStartedAtISO)) {
        return null;
      }
      if (rawWatchStatus?.startup?.passed !== true) {
        return null;
      }
      return rawWatchStatus;
    }, options.watchTimeoutMs, 1000);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGINT");
      await new Promise((resolve) => child.once("close", resolve));
    }
  }

  const finishedAt = new Date();
  const ok = exitCode === null || exitCode === 0 || exitCode === 130;
  return {
    label: "刷新 Zotero watch 健康状态",
    commandLabel: "内部刷新 `zotero:watch` 启动健康状态",
    command: `${process.execPath} ${args.join(" ")}`,
    startedAtISO: startedAt.toISOString(),
    finishedAtISO: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    exitCode: exitCode ?? 0,
    ok,
    status: ok ? "passed" : "failed",
  };
}

async function loadLoopInputs(options) {
  const debugProbeArtifacts = resolveZoteroDebugProbeArtifacts(projectRoot);
  const [rawWatchStatus, rawE2E, rawAutofix, rawWatchRecovery, rawGate, rawDebugProbe] = await Promise.all([
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "zotero-watch-status.json")),
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-zotero-e2e.json")),
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-zotero-autofix.json")),
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "zotero-watch-recovery-regression.json")),
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-gate.json")),
    readJSONIfExists(debugProbeArtifacts.reportJSON),
  ]);
  const smartProbeCandidates = deriveSmartDebugProbeCandidates(rawE2E);

  return {
    watchStatus: summarizeZoteroWatchStatus(rawWatchStatus, {
      staleAfterMinutes: DEFAULT_WATCH_STALE_AFTER_MINUTES,
    }),
    e2e: summarizeE2EReport(rawE2E),
    autofix: summarizeAutofixReport(rawAutofix),
    watchRecovery: summarizeWatchRecoveryReport(rawWatchRecovery),
    debugProbe: summarizeDebugProbeReport(rawDebugProbe, {
      e2eGeneratedAt: rawE2E?.generatedAt || null,
    }),
    debugProbeCandidates: {
      candidateCount: Array.isArray(smartProbeCandidates?.candidates)
        ? smartProbeCandidates.candidates.length
        : 0,
      probeIDs: Array.isArray(smartProbeCandidates?.candidates)
        ? smartProbeCandidates.candidates.map((item) => item?.probeId).filter(Boolean)
        : [],
    },
    gate: rawGate,
    options,
  };
}

function createAction(id, label, commandLabel, commandArgs = null) {
  return { id, label, commandLabel, commandArgs };
}

function actionFromOverride(commandText) {
  const text = String(commandText || "");
  if (!text) {
    return null;
  }
  if (text.includes("agent:zotero:e2e:update-baseline")) {
    return createAction(
      "update-visual-baseline",
      "刷新视觉基线并复验",
      "npm run agent:zotero:e2e:update-baseline",
      ["run", "agent:zotero:e2e:update-baseline"],
    );
  }
  if (text.includes("agent:zotero:autofix")) {
    return createAction("run-autofix", "执行 Zotero 自动修复闭环", "npm run agent:zotero:autofix", ["run", "agent:zotero:autofix"]);
  }
  if (text.includes("agent:zotero:watch-recovery")) {
    return createAction("run-watch-recovery", "执行 watch 恢复回归", "npm run agent:zotero:watch-recovery", ["run", "agent:zotero:watch-recovery"]);
  }
  if (text.includes("agent:obsidian")) {
    return createAction("run-obsidian", "刷新 Obsidian 人工介入工作台", "npm run agent:obsidian", ["run", "agent:obsidian"]);
  }
  if (text.includes("agent:zotero:e2e -- --probe-mode smart")) {
    return createAction(
      "run-e2e",
      "执行 Zotero 真机 E2E",
      "npm run agent:zotero:e2e -- --probe-mode smart",
      ["run", "agent:zotero:e2e", "--", "--probe-mode", "smart"],
    );
  }
  if (text.includes("agent:zotero:e2e")) {
    return createAction("run-e2e", "执行 Zotero 真机 E2E", "npm run agent:zotero:e2e", ["run", "agent:zotero:e2e"]);
  }
  if (text.includes("zotero:watch")) {
    return createAction("refresh-watch", "刷新 Zotero watch 健康状态", "内部刷新 `zotero:watch` 启动健康状态");
  }
  if (text.includes("agent:monitor")) {
    return createAction("run-monitor", "刷新 agent monitor", "npm run agent:monitor");
  }
  if (text.includes("agent:gate")) {
    return createAction("run-gate", "刷新 agent gate", "npm run agent:gate");
  }
  return null;
}

function insertAutofixIfNeeded(queue, currentIndex) {
  const exists = queue.some((item) => item.id === "run-autofix");
  if (!exists) {
    queue.splice(
      currentIndex + 1,
      0,
      createAction("run-autofix", "执行 Zotero 自动修复闭环", "npm run agent:zotero:autofix", ["run", "agent:zotero:autofix"]),
    );
  }
}

function applyHumanOverrideToQueue(queue, humanWindow) {
  const overrideAction = actionFromOverride(humanWindow?.nextActionOverride);
  if (!overrideAction) {
    return queue;
  }

  const nextQueue = queue.filter((item) => item.id !== overrideAction.id);
  const watchIndex = nextQueue.findIndex((item) => item.id === "refresh-watch");
  const insertIndex = watchIndex >= 0 && overrideAction.id !== "refresh-watch"
    ? watchIndex + 1
    : 0;
  nextQueue.splice(insertIndex, 0, overrideAction);
  return nextQueue;
}

async function refreshObsidianWorkspace() {
  return await runCommand(
    process.execPath,
    [path.join(projectRoot, "scripts", "agent-obsidian-handoff.mjs")],
    "刷新 Obsidian 人工介入工作台",
    "npm run agent:obsidian",
  );
}

async function waitForHumanInput(options) {
  if (!options.humanWindowMs || options.humanWindowMs <= 0) {
    return {
      enabled: false,
      waitedMs: 0,
      intervened: false,
      status: "skipped",
      notePath: obsidianWorkspace.humanWindowNote,
    };
  }

  const startedAt = Date.now();
  const result = await waitFor(async () => {
    const content = await fs.readFile(obsidianWorkspace.humanWindowNote, "utf-8").catch(() => "");
    const parsed = parseHumanInterventionWindow(content);
    if (parsed.intervened) {
      return parsed;
    }
    return null;
  }, options.humanWindowMs, 1000).catch(() => null);

  return {
    enabled: true,
    waitedMs: Math.max(0, Date.now() - startedAt),
    intervened: Boolean(result?.intervened),
    status: result?.intervened ? "intervened" : "timeout",
    notePath: obsidianWorkspace.humanWindowNote,
    decision: result || parseHumanInterventionWindow(await fs.readFile(obsidianWorkspace.humanWindowNote, "utf-8").catch(() => "")),
  };
}

async function executeAction(action, options) {
  if (action.id === "refresh-watch") {
    return await refreshWatchHealth(options);
  }
  const npm = getNpmCommand();
  if (action.id === "run-e2e") {
    return await runCommand(npm, Array.isArray(action.commandArgs) ? action.commandArgs : ["run", "agent:zotero:e2e"], action.label, action.commandLabel);
  }
  if (action.id === "update-visual-baseline") {
    return await runCommand(npm, Array.isArray(action.commandArgs) ? action.commandArgs : ["run", "agent:zotero:e2e:update-baseline"], action.label, action.commandLabel);
  }
  if (action.id === "run-autofix") {
    return await runCommand(npm, Array.isArray(action.commandArgs) ? action.commandArgs : ["run", "agent:zotero:autofix"], action.label, action.commandLabel);
  }
  if (action.id === "run-watch-recovery") {
    return await runCommand(npm, Array.isArray(action.commandArgs) ? action.commandArgs : ["run", "agent:zotero:watch-recovery"], action.label, action.commandLabel);
  }
  if (action.id === "run-obsidian") {
    return await runCommand(npm, Array.isArray(action.commandArgs) ? action.commandArgs : ["run", "agent:obsidian"], action.label, action.commandLabel);
  }
  if (action.id === "run-monitor") {
    return await runCommand(process.execPath, [path.join(projectRoot, "scripts", "agent-monitor.mjs")], action.label, action.commandLabel);
  }
  if (action.id === "run-gate") {
    return await runCommand(
      process.execPath,
      [path.join(projectRoot, "scripts", "agent-gate.mjs"), "--profile", "dev"],
      action.label,
      action.commandLabel,
    );
  }
  throw new Error(`Unknown action: ${action.id}`);
}

async function writeReport(report) {
  await fs.mkdir(loopArtifacts.artifactsDir, { recursive: true });
  await writeJSONArtifact(loopArtifacts.reportJSON, report);
  await fs.writeFile(loopArtifacts.reportMD, `${buildZoteroLoopMarkdown(report)}\n`, "utf-8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const initialInputs = await loadLoopInputs(options);
  const initialState = summarizeZoteroLoopState(initialInputs, options);
  await refreshObsidianWorkspace();
  const humanWindow = await waitForHumanInput(options);
  let plannedActions = deriveZoteroLoopActions(initialState);
  if (humanWindow.intervened) {
    plannedActions = applyHumanOverrideToQueue(plannedActions, humanWindow.decision);
  }
  const queue = plannedActions.map((action) => ({ ...action }));
  const steps = [];

  if (humanWindow.intervened && humanWindow.decision?.mode === "hold") {
    const finalInputs = await loadLoopInputs(options);
    const finalState = summarizeZoteroLoopState(finalInputs, options);
    const report = {
      generatedAt: new Date().toISOString(),
      dryRun: true,
      options,
      initialState,
      plannedActions,
      steps,
      humanWindow,
      finalState,
      loopPassed: false,
      nextAction: humanWindow.decision?.nextActionOverride || finalState.frontpageSummary?.nextAction || null,
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    };
    Object.assign(
      report,
      buildScriptFailureInfo(
        createScriptError("validation", report.finalState?.frontpageSummary?.headline || "Loop held by human override", {
          failedStage: "human-window",
        }),
        { durationMs: report.durationMs },
      ),
    );
    await writeReport(report);
    console.log(`当前 Zotero 插件编排报告已生成: ${loopArtifacts.reportJSON}`);
    process.exit(2);
  }

  if (!options.dryRun) {
    for (let index = 0; index < queue.length; index += 1) {
      const action = queue[index];
      const result = await executeAction(action, options);
      steps.push(result);

      const refreshedInputs = await loadLoopInputs(options);
      const currentState = summarizeZoteroLoopState(refreshedInputs, options);
      if (action.id === "run-e2e" && currentState.autofixRecommended) {
        insertAutofixIfNeeded(queue, index);
      }
    }
  } else {
    plannedActions.forEach((action) => {
      steps.push({
        label: action.label,
        commandLabel: action.commandLabel,
        status: "planned",
        ok: null,
        exitCode: null,
        startedAtISO: null,
        finishedAtISO: null,
        durationMs: 0,
      });
    });
  }

  const finalInputs = await loadLoopInputs(options);
  const finalState = summarizeZoteroLoopState(finalInputs, options);
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    options,
    initialState,
    plannedActions,
    steps,
    humanWindow,
    finalState,
    loopPassed: finalState.loopPassed,
    nextAction: finalState.frontpageSummary?.nextAction || finalState.gate?.nextAction || null,
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  };
  if (!report.loopPassed && !options.dryRun) {
    Object.assign(
      report,
      buildScriptFailureInfo(
        createScriptError("validation", finalState.frontpageSummary?.headline || "Zotero loop not passed", {
          failedStage: "loop-summary",
        }),
        { durationMs: report.durationMs },
      ),
    );
  } else {
    report.errorCategory = null;
    report.errorCategoryLabel = null;
    report.errorMessage = null;
    report.failedStage = null;
  }

  await writeReport(report);
  await refreshObsidianWorkspace();
  console.log(`当前 Zotero 插件编排报告已生成: ${loopArtifacts.reportJSON}`);
  if (!report.loopPassed && !options.dryRun) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  const fallbackReport = {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    options: parseArgs(process.argv.slice(2).filter((item) => item !== "--help" && item !== "-h")),
    initialState: null,
    plannedActions: [],
    steps: [],
    finalState: {
      frontpageSummary: {
        statusLabel: "失败",
        headline: error?.message || String(error),
        nextAction: "先查看 agent-zotero-loop 报告中的异常信息。",
      },
      gate: {
        statusLabel: "未知",
        headline: error?.message || String(error),
      },
      issues: [error?.message || String(error)],
    },
    loopPassed: false,
    nextAction: "先修复编排脚本错误，再重新执行 agent:zotero:loop。",
    durationMs: failureInfo.durationMs,
    ...failureInfo,
  };
  try {
    await writeReport(fallbackReport);
  } catch {
    // ignore secondary failure
  }
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
