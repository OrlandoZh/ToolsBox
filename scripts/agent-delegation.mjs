import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  attachDelegationGitClosureTestResults,
  buildDelegationGitClosurePlan,
  commitDelegationGitClosure,
  listGitChangedFiles,
  renderDelegationGitClosureMarkdown,
} from "./agent-git-closure-lib.mjs";
import {
  assertDelegationBatchSafe,
  buildDelegationPrompt,
  buildDelegationReview,
  buildMcoRunInvocation,
  diffProjectSnapshots,
  loadDelegationManifest,
  loadDelegationRuntimeContext,
  reviewEphemeralDelegationTask,
  renderDelegationReviewMarkdown,
  resolveDelegationTaskArtifacts,
  runEphemeralDelegationTask,
  summarizeDelegationRuntimePreflight,
} from "./agent-delegation-lib.mjs";
import { evaluateAgentContextGuard } from "./agent-context-guard-lib.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function usage() {
  console.log(`Usage: node scripts/agent-delegation.mjs <command> [options]

Commands:
  list [--json] [--manifest <path>]
  run <taskId> [taskId...] [--manifest <path>] [--inline-contract]
  review <taskId> [taskId...] [--reviewer <name>] [--manifest <path>]
  close <taskId> [--dry-run] [--message <text>] [--json] [--manifest <path>]
`);
}

function parseArgs(argv) {
  const options = {
    command: null,
    taskIds: [],
    reviewer: "codex",
    json: false,
    dryRun: false,
    inlineContract: false,
    manifestPath: null,
    message: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "");
    if (!options.command && !arg.startsWith("--")) {
      options.command = arg;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--inline-contract") {
      options.inlineContract = true;
      continue;
    }
    if (arg === "--manifest") {
      options.manifestPath = String(argv[index + 1] || "").trim() || null;
      index += 1;
      continue;
    }
    if (arg === "--message") {
      options.message = String(argv[index + 1] || "").trim() || null;
      index += 1;
      continue;
    }
    if (arg === "--reviewer") {
      options.reviewer = String(argv[index + 1] || "codex").trim() || "codex";
      index += 1;
      continue;
    }
    if (!arg.startsWith("--")) {
      options.taskIds.push(arg);
      continue;
    }
    throw createScriptError("args", `Unknown option: ${arg}`, {
      failedStage: "parse-args",
    });
  }

  if (!options.command) {
    throw createScriptError("args", "Missing command: list | run | review", {
      failedStage: "parse-args",
    });
  }

  if ((options.command === "run" || options.command === "review" || options.command === "close") && options.taskIds.length === 0) {
    throw createScriptError("args", `${options.command} requires at least one taskId`, {
      failedStage: "parse-args",
    });
  }

  if (options.command === "close" && options.taskIds.length !== 1) {
    throw createScriptError("args", "close requires exactly one taskId so each local commit stays aligned to a single module milestone", {
      failedStage: "parse-args",
    });
  }

  return options;
}

function selectTasks(manifest, taskIds) {
  const taskMap = manifest?.taskMap || {};
  return taskIds.map((taskId) => {
    const task = taskMap[taskId];
    if (!task) {
      throw createScriptError("validation", `Unknown delegation taskId: ${taskId}`, {
        failedStage: "select-task",
      });
    }
    return task;
  });
}

async function writeTaskSnapshot(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeJSONArtifact(filePath, payload);
}

async function executeCommand(command, args, { cwd, shell = false } = {}) {
  const { spawn } = await import("node:child_process");
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (exitCode, signal) => {
      resolve({
        exitCode: typeof exitCode === "number" ? exitCode : null,
        signal: signal || null,
        stdout,
        stderr,
      });
    });
  });
}

async function runDelegationTask(task, options = {}) {
  const runRecord = await runEphemeralDelegationTask(projectRoot, task, {
    manifestPath: options.manifestPath,
    inlineContract: options.inlineContract,
    runtimeContext: options.runtimeContext || await loadDelegationRuntimeContext(projectRoot),
  });

  if (runRecord.exitCode !== 0) {
    throw createScriptError("execution", `Delegation task '${task.taskId}' failed with exit code ${runRecord.exitCode ?? "unknown"}`, {
      failedStage: `delegate:${task.taskId}`,
    });
  }

  return runRecord;
}

async function runTestCommand(command) {
  const startedAt = Date.now();
  const result = await executeCommand("/bin/zsh", ["-lc", command], { cwd: projectRoot });
  return {
    command,
    ok: result.exitCode === 0,
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: Math.max(0, Date.now() - startedAt),
    stdoutTail: String(result.stdout || "").trim().split(/\r?\n/u).slice(-8),
    stderrTail: String(result.stderr || "").trim().split(/\r?\n/u).slice(-8),
  };
}

async function reviewDelegationTask(task, reviewer) {
  const testResults = [];
  for (const command of task.testCommands) {
    testResults.push(await runTestCommand(command));
  }

  const review = await reviewEphemeralDelegationTask(projectRoot, task, {
    reviewer,
    testResults,
  });

  if (review.reviewStatus !== "accepted") {
    throw createScriptError("validation", `Delegation review for '${task.taskId}' finished as ${review.reviewStatus}`, {
      failedStage: `review:${task.taskId}`,
    });
  }

  return review;
}

async function closeDelegationTask(task, options) {
  const artifacts = resolveDelegationTaskArtifacts(projectRoot, task.taskId);
  await fs.mkdir(artifacts.baseDir, { recursive: true });
  const changedFiles = await listGitChangedFiles(projectRoot);
  const plan = buildDelegationGitClosurePlan(task, changedFiles, {
    commitMessage: options.message,
  });
  const testResults = [];
  for (const command of task.testCommands) {
    testResults.push(await runTestCommand(command));
  }

  const record = attachDelegationGitClosureTestResults(plan, testResults);
  record.closedAt = new Date().toISOString();
  record.status = record.eligible ? (options.dryRun ? "dry-run" : "committed") : "blocked";
  record.commitSha = null;
  record.currentBranch = null;

  if (record.eligible && !options.dryRun) {
    const commitResult = await commitDelegationGitClosure(projectRoot, record);
    record.commitSha = commitResult.commitSha;
    record.currentBranch = commitResult.currentBranch;
    record.closedAt = commitResult.committedAt;
  }

  await Promise.all([
    writeTaskSnapshot(artifacts.gitClosureJSON, record),
    fs.writeFile(artifacts.gitClosureMD, `${renderDelegationGitClosureMarkdown(record)}\n`, "utf-8"),
  ]);

  if (!record.eligible) {
    throw createScriptError("validation", `Delegation git closure for '${task.taskId}' is blocked by focused test failures`, {
      failedStage: `close:${task.taskId}`,
    });
  }

  return record;
}

async function handleList(manifest, options) {
  if (options.json) {
    console.log(JSON.stringify({
      schemaVersion: manifest.schemaVersion,
      generatedAt: manifest.generatedAt,
      tasks: manifest.tasks,
    }, null, 2));
    return;
  }

  manifest.tasks.forEach((task) => {
    console.log(`${task.taskId} | ${task.laneLabel} | ${task.title}`);
    console.log(`  scope: ${task.scopePaths.join("、")}`);
    console.log(`  dependsOn: ${task.dependsOn.join("、") || "-"}`);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await loadDelegationManifest(projectRoot, {
    manifestPath: options.manifestPath,
  });

  if (options.command === "list") {
    await handleList(manifest, options);
    return;
  }

  const tasks = selectTasks(manifest, options.taskIds);

  if (options.command === "run") {
    assertDelegationBatchSafe(tasks);
    const runtimeContext = await loadDelegationRuntimeContext(projectRoot);
    const contextGuard = await evaluateAgentContextGuard(projectRoot, {
      strict: false,
    });
    const runtimePreflight = summarizeDelegationRuntimePreflight(runtimeContext, contextGuard);
    if (runtimePreflight.blocking) {
      const recommendationSuffix = runtimePreflight.recommendation
        ? ` ${runtimePreflight.recommendation}`
        : "";
      throw createScriptError("validation", `${runtimePreflight.message}${recommendationSuffix}`, {
        failedStage: "delegation-context-preflight",
        details: {
          blockingKinds: runtimePreflight.blockingKinds,
          recommendation: runtimePreflight.recommendation,
        },
      });
    }
    for (const task of tasks) {
      await runDelegationTask(task, {
        ...options,
        runtimeContext,
      });
      console.log(`Delegation run completed: ${task.taskId}`);
    }
    return;
  }

  if (options.command === "review") {
    for (const task of tasks) {
      const review = await reviewDelegationTask(task, options.reviewer);
      console.log(`Delegation review completed: ${task.taskId} -> ${review.reviewStatus}`);
    }
    return;
  }

  if (options.command === "close") {
    const record = await closeDelegationTask(tasks[0], options);
    if (options.json) {
      console.log(JSON.stringify(record, null, 2));
      return;
    }
    console.log(`Delegation git closure completed: ${record.taskId} -> ${record.status}`);
    console.log(`Commit message: ${record.commitMessage}`);
    console.log(`Selected files: ${record.selectedFiles.length}`);
    if (record.commitSha) {
      console.log(`Commit SHA: ${record.commitSha}`);
    }
    return;
  }

  throw createScriptError("args", `Unknown command: ${options.command}`, {
    failedStage: "parse-args",
  });
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  console.error(`${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
