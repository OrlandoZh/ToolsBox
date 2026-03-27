import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildWatchRecoveryRegressionMarkdown,
  summarizeWatchRecoveryRegression,
} from "./zotero-watch-recovery-regression-lib.mjs";
import { resolveZoteroWatchRecoveryArtifacts } from "./zotero-agent-artifacts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const zoteroArtifacts = resolveZoteroWatchRecoveryArtifacts(projectRoot);
const runtimeDir = path.join(projectRoot, ".zotero-runtime", "watch-recovery");
const buildInjectFile = path.join(runtimeDir, "build-inject.txt");
const triggerFile = path.join(projectRoot, "config", ".watch-recovery-trigger.tmp");

function usage() {
  console.log(`Usage: node scripts/zotero-watch-recovery-regression.mjs [options]

Options:
  --timeout-ms <n>   Max wait time for recovery sequence (default: 120000)
  --no-fresh         Reuse existing watch runtime instead of --fresh
`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseArgs(argv) {
  const options = {
    timeoutMs: 120000,
    fresh: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = Number.parseInt(String(argv[index + 1] || "120000"), 10);
      index += 1;
      continue;
    }
    if (arg === "--no-fresh") {
      options.fresh = false;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  assert(Number.isInteger(options.timeoutMs) && options.timeoutMs >= 30000 && options.timeoutMs <= 600000, "timeout-ms must be 30000-600000");
  return options;
}

async function readJSON(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

async function removeIfExists(filePath) {
  await fs.rm(filePath, { force: true });
}

async function waitFor(condition, timeoutMs, intervalMs = 1000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await condition();
      if (value) {
        return value;
      }
    }
    catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

async function waitForStartup(sessionStartedAtISO, timeoutMs) {
  return await waitFor(async () => {
    const watchStatus = await readJSON(zoteroArtifacts.watchStatusJSON);
    const sessionStartedAt = Date.parse(String(watchStatus?.sessionStartedAt || ""));
    if (!Number.isFinite(sessionStartedAt) || sessionStartedAt < Date.parse(sessionStartedAtISO)) {
      return null;
    }
    if (watchStatus?.startup?.passed !== true) {
      return null;
    }
    return watchStatus;
  }, timeoutMs, 1000);
}

async function waitForRecoverySequence(sessionStartedAtISO, timeoutMs) {
  return await waitFor(async () => {
    const watchStatus = await readJSON(zoteroArtifacts.watchStatusJSON);
    const sessionStartedAt = Date.parse(String(watchStatus?.sessionStartedAt || ""));
    if (!Number.isFinite(sessionStartedAt) || sessionStartedAt < Date.parse(sessionStartedAtISO)) {
      return null;
    }
    const summary = summarizeWatchRecoveryRegression(watchStatus);
    if (!summary.passed) {
      return null;
    }
    return {
      watchStatus,
      summary,
    };
  }, timeoutMs, 1000);
}

async function writeReport(report) {
  await fs.mkdir(zoteroArtifacts.artifactsDir, { recursive: true });
  await fs.writeFile(zoteroArtifacts.reportJSON, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  await fs.writeFile(zoteroArtifacts.reportMD, `${buildWatchRecoveryRegressionMarkdown(report)}\n`, "utf-8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(runtimeDir, { recursive: true });
  await removeIfExists(buildInjectFile);
  await removeIfExists(triggerFile);

  const args = [path.join(projectRoot, "scripts", "zotero.mjs"), "watch"];
  if (options.fresh) {
    args.push("--fresh");
  }

  const sessionStartedAtISO = new Date().toISOString();
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ZOTERO_PLUGIN_BUILD_INJECT_FILE: buildInjectFile,
      ZOTERO_PLUGIN_WATCH_RECOVERY_INJECT: "runtime-recovery-once",
    },
  });

  let childExitCode = null;
  child.once("close", (code) => {
    childExitCode = code ?? 1;
  });

  try {
    await waitForStartup(sessionStartedAtISO, Math.min(options.timeoutMs, 60000));
    await fs.writeFile(buildInjectFile, "fail-once\n", "utf-8");
    await fs.writeFile(triggerFile, `${Date.now()}\n`, "utf-8");

    const { summary } = await waitForRecoverySequence(sessionStartedAtISO, options.timeoutMs);
    await writeReport(summary);
    console.log(`Zotero watch recovery regression report generated: ${zoteroArtifacts.reportJSON}`);
  }
  catch (error) {
    let watchStatus = null;
    try {
      watchStatus = await readJSON(zoteroArtifacts.watchStatusJSON);
    }
    catch {
      watchStatus = null;
    }
    const summary = summarizeWatchRecoveryRegression(watchStatus || {});
    summary.passed = false;
    summary.generatedAt = new Date().toISOString();
    summary.issues = Array.from(new Set([
      ...(summary.issues || []),
      error?.message || String(error),
      childExitCode === null ? "" : `watch 进程提前退出，退出码 ${childExitCode}`,
    ].filter(Boolean)));
    summary.summaryNote = "真机恢复回归未通过，请结合问题清单与 zotero-watch-status 报告排查。";
    await writeReport(summary);
    console.error(`Zotero watch recovery regression report generated: ${zoteroArtifacts.reportJSON}`);
    throw error;
  }
  finally {
    await removeIfExists(buildInjectFile);
    await removeIfExists(triggerFile);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGINT");
      await new Promise((resolve) => child.once("close", resolve));
    }
  }
}

main().catch((error) => {
  console.error(`[zotero-watch-recovery-regression] ${error.stack || error.message}`);
  process.exit(1);
});
