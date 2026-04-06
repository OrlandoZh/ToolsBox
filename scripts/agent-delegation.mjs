import { spawn } from "node:child_process";
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
  captureProjectSnapshot,
  diffProjectSnapshots,
  loadDelegationManifest,
  loadDelegationRuntimeContext,
  renderDelegationReviewMarkdown,
  resolveDelegationTaskArtifacts,
} from "./agent-delegation-lib.mjs";
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

function tryParseJSON(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return null;
  }
  try {
    return JSON.parse(normalized);
  }
  catch {
    return null;
  }
}

function formatCommandLine(command, args) {
  return [command, ...args].map((part) => {
    const value = String(part ?? "");
    if (!value || /[\s"'`]/u.test(value)) {
      return JSON.stringify(value);
    }
    return value;
  }).join(" ");
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

async function executeCommand(command, args, { cwd, shell = false } = {}) {
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

async function writeTaskSnapshot(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeJSONArtifact(filePath, payload);
}

async function runDelegationTask(task, options = {}) {
  const artifacts = resolveDelegationTaskArtifacts(projectRoot, task.taskId);
  await fs.mkdir(artifacts.baseDir, { recursive: true });
  const runtimeContext = await loadDelegationRuntimeContext(projectRoot);

  const prompt = buildDelegationPrompt(task, {
    manifestPath: options.manifestPath,
    inlineContract: options.inlineContract,
    runtimeContext,
  });
  const invocation = buildMcoRunInvocation(task, projectRoot, {
    prompt,
    manifestPath: options.manifestPath,
    inlineContract: options.inlineContract,
    runtimeContext,
  });
  const startedAt = Date.now();
  const beforeSnapshot = await captureProjectSnapshot(projectRoot);

  await Promise.all([
    writeTaskSnapshot(artifacts.taskJSON, {
      savedAt: new Date().toISOString(),
      task,
    }),
    writeTaskSnapshot(artifacts.invocationJSON, {
      savedAt: new Date().toISOString(),
      command: invocation.command,
      args: invocation.args,
      commandLine: formatCommandLine(invocation.command, invocation.args),
      cwd: invocation.cwd,
      prompt,
      promptMode: invocation.promptMode,
      contractReference: invocation.contractReference,
      runtimeContextProfile: invocation.runtimeContextProfile,
      runtimeContextDigest: invocation.runtimeContextDigest,
      promptAssembly: invocation.promptAssembly,
    }),
    writeTaskSnapshot(artifacts.beforeSnapshotJSON, beforeSnapshot),
  ]);

  const result = await executeCommand(invocation.command, invocation.args, { cwd: projectRoot });
  const afterSnapshot = await captureProjectSnapshot(projectRoot);
  const changedFiles = diffProjectSnapshots(beforeSnapshot, afterSnapshot);
  const outOfScopeFiles = changedFiles
    .filter((entry) => !task.scopePaths.some((scope) => entry.path === scope || entry.path.startsWith(`${scope}/`)))
    .map((entry) => entry.path);
  const parsedProviderResult = tryParseJSON(result.stdout);
  const durationMs = Math.max(0, Date.now() - startedAt);
  const runRecord = {
    taskId: task.taskId,
    executedAt: new Date().toISOString(),
    durationMs,
    exitCode: result.exitCode,
    signal: result.signal,
    commandLine: formatCommandLine(invocation.command, invocation.args),
    changedFiles,
    outOfScopeFiles,
    providerResultPresent: Boolean(parsedProviderResult),
  };

  await Promise.all([
    writeTaskSnapshot(artifacts.afterSnapshotJSON, afterSnapshot),
    fs.writeFile(artifacts.providerStdoutTXT, result.stdout, "utf-8"),
    fs.writeFile(artifacts.providerStderrTXT, result.stderr, "utf-8"),
    writeTaskSnapshot(artifacts.providerResultJSON, {
      capturedAt: new Date().toISOString(),
      parsed: parsedProviderResult,
      stdoutFile: path.basename(artifacts.providerStdoutTXT),
      stderrFile: path.basename(artifacts.providerStderrTXT),
    }),
    writeTaskSnapshot(artifacts.runJSON, runRecord),
  ]);

  if (result.exitCode !== 0) {
    throw createScriptError("execution", `Delegation task '${task.taskId}' failed with exit code ${result.exitCode ?? "unknown"}`, {
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
  const artifacts = resolveDelegationTaskArtifacts(projectRoot, task.taskId);
  const runRecord = JSON.parse(await fs.readFile(artifacts.runJSON, "utf-8"));
  const testResults = [];
  for (const command of task.testCommands) {
    testResults.push(await runTestCommand(command));
  }

  const review = buildDelegationReview(task, runRecord, {
    reviewer,
    testResults,
  });

  await Promise.all([
    writeTaskSnapshot(artifacts.reviewJSON, review),
    fs.writeFile(artifacts.reviewMD, `${renderDelegationReviewMarkdown(review)}\n`, "utf-8"),
  ]);

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
    for (const task of tasks) {
      await runDelegationTask(task, options);
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
