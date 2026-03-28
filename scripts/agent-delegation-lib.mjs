import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import { createScriptError } from "./script-runtime-lib.mjs";

export const DELEGATION_TASK_LANE_LABELS = Object.freeze({
  "codex-high-logic": "Codex 高逻辑",
  "opencode-low-logic": "Opencode 低逻辑",
});

export const DELEGATION_REVIEW_STATUS_LABELS = Object.freeze({
  accepted: "已接受",
  "needs-fix": "需修补",
  "reworked-by-codex": "已由 Codex 重做",
  rejected: "已驳回",
});

export const DELEGATION_GIT_CLOSURE_MILESTONE_LABELS = Object.freeze({
  "module-framework": "模块框架搭建完成",
  "module-feature": "模块功能基本实现",
  "batch-closure": "阶段收口",
});

const DEFAULT_MANIFEST_PATH = "config/agent-delegation-tasks.json";
const SNAPSHOT_IGNORE_DIRS = new Set([
  ".git",
  "build",
  "dist",
  "node_modules",
  "reference",
]);

function normalizeString(value) {
  return String(value || "").trim();
}

function toPosixRelativePath(value) {
  const normalized = normalizeString(value).replaceAll("\\", "/").replace(/^\.\/+/u, "");
  if (!normalized) {
    throw createScriptError("validation", "Delegation path must be a non-empty relative path", {
      failedStage: "delegation-path",
    });
  }
  if (normalized.startsWith("/") || normalized.startsWith("../") || normalized.includes("/../")) {
    throw createScriptError("validation", `Delegation path must stay under repository root: ${value}`, {
      failedStage: "delegation-path",
    });
  }
  return normalized;
}

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeString(value))
      .filter(Boolean),
  ));
}

function sortStrings(values) {
  return values.slice().sort((a, b) => a.localeCompare(b, "en"));
}

function normalizeStringArray(values, fieldName, { allowEmpty = true } = {}) {
  const normalized = uniqueStrings(values);
  if (!allowEmpty && normalized.length === 0) {
    throw createScriptError("validation", `Delegation task field '${fieldName}' must not be empty`, {
      failedStage: "delegation-manifest",
    });
  }
  return normalized;
}

function normalizeScopePaths(scopePaths) {
  return normalizeStringArray(scopePaths, "scopePaths", { allowEmpty: false })
    .map((entry) => toPosixRelativePath(entry));
}

function normalizeDelegationGitClosure(gitClosure, taskId, taskTitle) {
  if (gitClosure == null) {
    return null;
  }
  if (!gitClosure || typeof gitClosure !== "object" || Array.isArray(gitClosure)) {
    throw createScriptError("validation", `Delegation task '${taskId}' has invalid gitClosure config`, {
      failedStage: "delegation-manifest",
    });
  }

  const milestone = normalizeString(gitClosure?.milestone) || "module-feature";
  if (!Object.hasOwn(DELEGATION_GIT_CLOSURE_MILESTONE_LABELS, milestone)) {
    throw createScriptError("validation", `Delegation task '${taskId}' has invalid gitClosure.milestone: ${milestone || "-"}`, {
      failedStage: "delegation-manifest",
    });
  }

  return {
    enabled: gitClosure?.enabled !== false,
    milestone,
    milestoneLabel: DELEGATION_GIT_CLOSURE_MILESTONE_LABELS[milestone],
    summary: normalizeString(gitClosure?.summary) || normalizeString(taskTitle) || taskId,
    commitMessage: normalizeString(gitClosure?.commitMessage) || null,
  };
}

function validateTaskShape(task, knownTaskIds) {
  const taskId = normalizeString(task?.taskId);
  if (!taskId) {
    throw createScriptError("validation", "Delegation task is missing taskId", {
      failedStage: "delegation-manifest",
    });
  }

  const lane = normalizeString(task?.lane);
  if (!Object.hasOwn(DELEGATION_TASK_LANE_LABELS, lane)) {
    throw createScriptError("validation", `Delegation task '${taskId}' has invalid lane: ${lane || "-"}`, {
      failedStage: "delegation-manifest",
    });
  }

  const dependsOn = normalizeStringArray(task?.dependsOn, "dependsOn");
  dependsOn.forEach((dependency) => {
    if (!knownTaskIds.has(dependency)) {
      throw createScriptError("validation", `Delegation task '${taskId}' depends on unknown task '${dependency}'`, {
        failedStage: "delegation-manifest",
      });
    }
  });

  return {
    taskId,
    title: normalizeString(task?.title),
    lane,
    laneLabel: DELEGATION_TASK_LANE_LABELS[lane],
    scopePaths: normalizeScopePaths(task?.scopePaths),
    dependsOn,
    promptTemplate: normalizeString(task?.promptTemplate),
    reviewChecklist: normalizeStringArray(task?.reviewChecklist, "reviewChecklist"),
    testCommands: normalizeStringArray(task?.testCommands, "testCommands"),
    handoffArtifacts: normalizeStringArray(task?.handoffArtifacts, "handoffArtifacts"),
    gitClosure: normalizeDelegationGitClosure(task?.gitClosure, taskId, task?.title),
  };
}

export function resolveDelegationManifestPath(projectRoot, manifestPath = DEFAULT_MANIFEST_PATH) {
  return path.resolve(projectRoot, normalizeString(manifestPath) || DEFAULT_MANIFEST_PATH);
}

export function resolveDelegationTaskArtifacts(projectRoot, taskId) {
  const baseDir = resolveAgentArtifactPath(projectRoot, "agent-delegation", taskId);
  return {
    baseDir,
    taskJSON: path.join(baseDir, "task.json"),
    invocationJSON: path.join(baseDir, "invocation.json"),
    beforeSnapshotJSON: path.join(baseDir, "before-snapshot.json"),
    afterSnapshotJSON: path.join(baseDir, "after-snapshot.json"),
    runJSON: path.join(baseDir, "run.json"),
    providerResultJSON: path.join(baseDir, "provider-result.json"),
    providerStdoutTXT: path.join(baseDir, "provider-stdout.txt"),
    providerStderrTXT: path.join(baseDir, "provider-stderr.txt"),
    reviewJSON: path.join(baseDir, "review.json"),
    reviewMD: path.join(baseDir, "review.md"),
    gitClosureJSON: path.join(baseDir, "git-closure.json"),
    gitClosureMD: path.join(baseDir, "git-closure.md"),
  };
}

export async function loadDelegationManifest(projectRoot, options = {}) {
  const manifestPath = resolveDelegationManifestPath(projectRoot, options.manifestPath);
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  const schemaVersion = Number(raw?.schemaVersion || 0);
  if (schemaVersion !== 1) {
    throw createScriptError("validation", `Unsupported delegation manifest schemaVersion: ${schemaVersion}`, {
      failedStage: "delegation-manifest",
    });
  }

  const rawTasks = Array.isArray(raw?.tasks) ? raw.tasks : [];
  if (rawTasks.length === 0) {
    throw createScriptError("validation", "Delegation manifest does not contain any tasks", {
      failedStage: "delegation-manifest",
    });
  }

  const knownTaskIds = new Set();
  rawTasks.forEach((task) => {
    const taskId = normalizeString(task?.taskId);
    if (!taskId) {
      throw createScriptError("validation", "Delegation manifest contains a task without taskId", {
        failedStage: "delegation-manifest",
      });
    }
    if (knownTaskIds.has(taskId)) {
      throw createScriptError("validation", `Delegation manifest contains duplicate taskId '${taskId}'`, {
        failedStage: "delegation-manifest",
      });
    }
    knownTaskIds.add(taskId);
  });

  const tasks = rawTasks.map((task) => validateTaskShape(task, knownTaskIds));
  const taskMap = Object.fromEntries(tasks.map((task) => [task.taskId, task]));

  return {
    manifestPath,
    schemaVersion,
    generatedAt: normalizeString(raw?.generatedAt) || null,
    tasks,
    taskMap,
  };
}

export function buildDelegationPrompt(task) {
  const lines = [
    `任务 ID: ${task.taskId}`,
    `任务标题: ${task.title || task.taskId}`,
    `执行 lane: ${task.laneLabel}`,
    "",
    "你是通过 mco 调度的 Opencode worker。",
    "这是一个已冻结契约的低逻辑任务：只能在给定路径范围内做实现、透传、展示、测试或文档同步，不能擅自改变边界、策略、白名单范围或风险模型。",
    "",
    "允许修改路径:",
    ...task.scopePaths.map((item) => `- ${item}`),
  ];

  if (task.dependsOn.length > 0) {
    lines.push("", `前置依赖: ${task.dependsOn.join("、")}`);
  }

  lines.push(
    "",
    "任务契约:",
    task.promptTemplate || "-",
  );

  if (task.reviewChecklist.length > 0) {
    lines.push("", "审查清单:");
    task.reviewChecklist.forEach((item) => {
      lines.push(`- ${item}`);
    });
  }

  if (task.testCommands.length > 0) {
    lines.push("", "完成后请自行运行这些命令:");
    task.testCommands.forEach((item) => {
      lines.push(`- ${item}`);
    });
  }

  if (task.handoffArtifacts.length > 0) {
    lines.push("", "交接时需要说明的工件:");
    task.handoffArtifacts.forEach((item) => {
      lines.push(`- ${item}`);
    });
  }

  lines.push(
    "",
    "硬约束:",
    "- 不要改 scopePaths 之外的文件。",
    "- 不要把需要 Codex 决策的高逻辑问题偷偷实现成代码改动。",
    "- 若遇到契约不够或需要改变边界，只在结果里说明，不要越权扩面。",
  );

  return lines.join("\n");
}

export function buildMcoRunInvocation(task, projectRoot, options = {}) {
  if (task?.lane !== "opencode-low-logic") {
    throw createScriptError("validation", `Task '${task?.taskId || "-"}' is not runnable by Opencode`, {
      failedStage: "delegation-run",
    });
  }

  const artifacts = resolveDelegationTaskArtifacts(projectRoot, task.taskId);
  const prompt = options.prompt || buildDelegationPrompt(task);
  const scopeList = task.scopePaths.join(",");
  const command = normalizeString(process.env.MCO_BINARY) || "mco";
  const args = [
    "run",
    "--repo", ".",
    "--prompt", prompt,
    "--providers", "opencode",
    "--task-id", task.taskId,
    "--target-paths", scopeList,
    "--allow-paths", scopeList,
    "--enforcement-mode", "strict",
    "--result-mode", "both",
    "--json",
    "--save-artifacts",
    "--artifact-base", artifacts.baseDir,
  ];

  return {
    command,
    args,
    cwd: projectRoot,
    taskId: task.taskId,
    artifactBase: artifacts.baseDir,
    targetPaths: task.scopePaths.slice(),
    allowPaths: task.scopePaths.slice(),
    prompt,
  };
}

function scopeContainsPath(scopePath, filePath) {
  return filePath === scopePath || filePath.startsWith(`${scopePath}/`);
}

function tasksOverlap(left, right) {
  return left.scopePaths.some((scope) => right.scopePaths.some((candidate) => (
    scopeContainsPath(scope, candidate) || scopeContainsPath(candidate, scope)
  )));
}

export function assertDelegationBatchSafe(tasks) {
  const lowTasks = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task?.lane === "opencode-low-logic");

  for (let index = 0; index < lowTasks.length; index += 1) {
    for (let offset = index + 1; offset < lowTasks.length; offset += 1) {
      if (tasksOverlap(lowTasks[index], lowTasks[offset])) {
        throw createScriptError(
          "validation",
          `Delegation tasks '${lowTasks[index].taskId}' and '${lowTasks[offset].taskId}' have overlapping scopePaths and must not run together`,
          { failedStage: "delegation-batch" },
        );
      }
    }
  }
}

function shouldIgnoreSnapshotPath(relativePath) {
  const normalized = toPosixRelativePath(relativePath);
  const segments = normalized.split("/");
  return segments.some((segment) => SNAPSHOT_IGNORE_DIRS.has(segment));
}

async function walkSnapshotFiles(projectRoot, relativeDir = "", files = []) {
  const absoluteDir = path.join(projectRoot, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const nextRelative = relativeDir
      ? `${relativeDir.replaceAll("\\", "/")}/${entry.name}`
      : entry.name;

    if (shouldIgnoreSnapshotPath(nextRelative)) {
      continue;
    }

    const absolutePath = path.join(projectRoot, nextRelative);
    if (entry.isDirectory()) {
      await walkSnapshotFiles(projectRoot, nextRelative, files);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const buffer = await fs.readFile(absolutePath);
    files.push({
      path: toPosixRelativePath(nextRelative),
      size: buffer.byteLength,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    });
  }

  return files;
}

export async function captureProjectSnapshot(projectRoot) {
  const files = await walkSnapshotFiles(projectRoot);
  return {
    capturedAt: new Date().toISOString(),
    fileCount: files.length,
    files,
  };
}

export function diffProjectSnapshots(beforeSnapshot, afterSnapshot) {
  const beforeFiles = new Map(
    (Array.isArray(beforeSnapshot?.files) ? beforeSnapshot.files : [])
      .map((entry) => [toPosixRelativePath(entry?.path || ""), entry]),
  );
  const afterFiles = new Map(
    (Array.isArray(afterSnapshot?.files) ? afterSnapshot.files : [])
      .map((entry) => [toPosixRelativePath(entry?.path || ""), entry]),
  );
  const allPaths = sortStrings(Array.from(new Set([
    ...beforeFiles.keys(),
    ...afterFiles.keys(),
  ])));

  return allPaths.flatMap((filePath) => {
    const before = beforeFiles.get(filePath) || null;
    const after = afterFiles.get(filePath) || null;
    if (!before && after) {
      return [{
        path: filePath,
        changeType: "added",
        beforeSHA256: null,
        afterSHA256: after.sha256 || null,
      }];
    }
    if (before && !after) {
      return [{
        path: filePath,
        changeType: "deleted",
        beforeSHA256: before.sha256 || null,
        afterSHA256: null,
      }];
    }
    if (before?.sha256 !== after?.sha256) {
      return [{
        path: filePath,
        changeType: "modified",
        beforeSHA256: before?.sha256 || null,
        afterSHA256: after?.sha256 || null,
      }];
    }
    return [];
  });
}

export function isPathWithinScopes(filePath, scopePaths) {
  const normalizedPath = toPosixRelativePath(filePath);
  return (Array.isArray(scopePaths) ? scopePaths : [])
    .map((item) => toPosixRelativePath(item))
    .some((scope) => scopeContainsPath(scope, normalizedPath));
}

function summarizeFailedTests(testResults) {
  return (Array.isArray(testResults) ? testResults : [])
    .filter((item) => item?.ok !== true)
    .map((item) => ({
      command: normalizeString(item?.command),
      exitCode: item?.exitCode ?? null,
    }));
}

function normalizeChangedFiles(changedFiles) {
  return (Array.isArray(changedFiles) ? changedFiles : [])
    .filter((item) => item && typeof item === "object" && normalizeString(item.path))
    .map((item) => ({
      path: toPosixRelativePath(item.path),
      changeType: normalizeString(item.changeType) || "modified",
      beforeSHA256: normalizeString(item.beforeSHA256) || null,
      afterSHA256: normalizeString(item.afterSHA256) || null,
    }))
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
}

export function buildDelegationReview(task, runRecord, options = {}) {
  const reviewer = normalizeString(options.reviewer) || "codex";
  const changedFiles = normalizeChangedFiles(runRecord?.changedFiles);
  const acceptedFiles = [];
  const rejectedFiles = [];

  changedFiles.forEach((entry) => {
    if (isPathWithinScopes(entry.path, task.scopePaths)) {
      acceptedFiles.push(entry.path);
      return;
    }
    rejectedFiles.push(entry.path);
  });

  const testResults = Array.isArray(options.testResults) ? options.testResults : [];
  const failedTests = summarizeFailedTests(testResults);
  const reviewNotes = [];
  let reviewStatus = "accepted";

  if (rejectedFiles.length > 0) {
    reviewStatus = "rejected";
    reviewNotes.push(`发现越界改动 ${rejectedFiles.length} 个：${rejectedFiles.join("、")}`);
  }

  if (runRecord?.exitCode !== 0 && reviewStatus !== "rejected") {
    reviewStatus = "needs-fix";
    reviewNotes.push(`委托执行未成功退出，exitCode=${runRecord?.exitCode ?? "unknown"}`);
  }

  if (failedTests.length > 0 && reviewStatus !== "rejected") {
    reviewStatus = "needs-fix";
    reviewNotes.push(`聚焦测试失败 ${failedTests.length} 个：${failedTests.map((item) => item.command).join("；")}`);
  }

  if (reviewNotes.length === 0) {
    reviewNotes.push("改动范围与聚焦测试均符合任务契约。");
  }

  return {
    reviewedAt: new Date().toISOString(),
    taskId: task.taskId,
    reviewer,
    reviewStatus,
    reviewStatusLabel: DELEGATION_REVIEW_STATUS_LABELS[reviewStatus] || reviewStatus,
    reviewNotes,
    acceptedFiles,
    rejectedFiles,
    changedFiles,
    testResults,
  };
}

export function renderDelegationReviewMarkdown(review) {
  const lines = [
    `# Delegation Review / ${review.taskId}`,
    "",
    `- 审查人: ${review.reviewer || "codex"}`,
    `- 结论: ${review.reviewStatusLabel || review.reviewStatus || "-"}`,
    `- 时间: ${review.reviewedAt || "-"}`,
    "",
    "## 审查说明",
    "",
    ...((review.reviewNotes || []).map((item) => `- ${item}`)),
    "",
    "## 接受文件",
    "",
    ...((review.acceptedFiles || []).length > 0
      ? review.acceptedFiles.map((item) => `- ${item}`)
      : ["- -"]),
    "",
    "## 驳回文件",
    "",
    ...((review.rejectedFiles || []).length > 0
      ? review.rejectedFiles.map((item) => `- ${item}`)
      : ["- -"]),
    "",
    "## 测试结果",
    "",
  ];

  if (!Array.isArray(review.testResults) || review.testResults.length === 0) {
    lines.push("- 未执行");
    return lines.join("\n");
  }

  review.testResults.forEach((item) => {
    lines.push(`- ${item.ok ? "通过" : "失败"} | ${item.command || "-"} | exit=${item.exitCode ?? "-"}`);
  });
  return lines.join("\n");
}
