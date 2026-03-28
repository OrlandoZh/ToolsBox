import { spawn } from "node:child_process";
import {
  DELEGATION_GIT_CLOSURE_MILESTONE_LABELS,
  isPathWithinScopes,
} from "./agent-delegation-lib.mjs";
import { createScriptError } from "./script-runtime-lib.mjs";

function normalizeString(value) {
  return String(value || "").trim();
}

function uniqueSortedStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeString(value))
      .filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, "en"));
}

async function executeGit(projectRoot, args) {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: projectRoot,
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
      if (exitCode === 0) {
        resolve({
          stdout,
          stderr,
          exitCode,
          signal,
        });
        return;
      }

      reject(createScriptError("execution", `Git command failed: git ${args.join(" ")}`, {
        failedStage: "git-closure",
        details: {
          args,
          exitCode,
          signal: signal || null,
          stderrTail: String(stderr || "").trim().split(/\r?\n/u).slice(-8),
        },
      }));
    });
  });
}

function parseLineList(text) {
  return uniqueSortedStrings(String(text || "").split(/\r?\n/u));
}

function buildDefaultCommitMessage(task) {
  const gitClosure = task?.gitClosure || null;
  if (gitClosure?.commitMessage) {
    return gitClosure.commitMessage;
  }

  const summary = normalizeString(gitClosure?.summary || task?.title || task?.taskId) || task?.taskId || "当前模块";
  switch (gitClosure?.milestone) {
    case "module-framework":
      return `feat: 完成${summary}模块框架搭建`;
    case "batch-closure":
      return `chore: 收口${summary}`;
    case "module-feature":
    default:
      return `feat: 基本实现${summary}`;
  }
}

export async function listGitChangedFiles(projectRoot) {
  const [unstaged, staged, untracked] = await Promise.all([
    executeGit(projectRoot, ["diff", "--name-only", "--relative"]),
    executeGit(projectRoot, ["diff", "--name-only", "--cached", "--relative"]),
    executeGit(projectRoot, ["ls-files", "--others", "--exclude-standard"]),
  ]);

  return uniqueSortedStrings([
    ...parseLineList(unstaged.stdout),
    ...parseLineList(staged.stdout),
    ...parseLineList(untracked.stdout),
  ]);
}

export function buildDelegationGitClosurePlan(task, changedFiles, options = {}) {
  const taskId = normalizeString(task?.taskId);
  if (!taskId) {
    throw createScriptError("validation", "Delegation git closure requires a task with taskId", {
      failedStage: "git-closure-plan",
    });
  }
  if (!task?.gitClosure?.enabled) {
    throw createScriptError("validation", `Delegation task '${taskId}' has not enabled gitClosure`, {
      failedStage: "git-closure-plan",
    });
  }

  const normalizedChangedFiles = uniqueSortedStrings(changedFiles);
  const scopeChangedFiles = normalizedChangedFiles.filter((filePath) => isPathWithinScopes(filePath, task.scopePaths));
  if (scopeChangedFiles.length === 0) {
    throw createScriptError("validation", `Delegation task '${taskId}' has no changed files under its scope`, {
      failedStage: "git-closure-plan",
      details: {
        taskId,
        scopePaths: task.scopePaths,
      },
    });
  }

  const outsideScopeChangedFiles = normalizedChangedFiles.filter((filePath) => !isPathWithinScopes(filePath, task.scopePaths));
  const commitMessage = normalizeString(options.commitMessage) || buildDefaultCommitMessage(task);
  const notes = [];
  if (outsideScopeChangedFiles.length > 0) {
    notes.push(`工作树中另有 ${outsideScopeChangedFiles.length} 个 scope 外改动，本次不会纳入 commit。`);
  }
  notes.push("本次 close 只会提交当前 task scope 内的本地改动，不会自动 push 远端。");

  return {
    plannedAt: new Date().toISOString(),
    taskId,
    gitClosure: {
      ...task.gitClosure,
      milestoneLabel: DELEGATION_GIT_CLOSURE_MILESTONE_LABELS[task.gitClosure.milestone] || task.gitClosure.milestone,
    },
    commitMessage,
    changedFiles: normalizedChangedFiles,
    selectedFiles: scopeChangedFiles,
    outsideScopeChangedFiles,
    notes,
  };
}

function summarizeFailedTests(testResults) {
  return (Array.isArray(testResults) ? testResults : [])
    .filter((item) => item?.ok !== true)
    .map((item) => ({
      command: normalizeString(item?.command),
      exitCode: item?.exitCode ?? null,
    }));
}

export function attachDelegationGitClosureTestResults(plan, testResults) {
  const normalizedPlan = plan && typeof plan === "object" ? plan : {};
  const normalizedTests = Array.isArray(testResults) ? testResults : [];
  const failedTests = summarizeFailedTests(normalizedTests);
  const notes = Array.isArray(normalizedPlan.notes) ? normalizedPlan.notes.slice() : [];
  if (failedTests.length > 0) {
    notes.push(`聚焦测试失败 ${failedTests.length} 个，当前不允许自动提交。`);
  } else {
    notes.push("聚焦测试通过，满足当前 task 的本地 Git 收口条件。");
  }

  return {
    ...normalizedPlan,
    testResults: normalizedTests,
    failedTests,
    eligible: failedTests.length === 0,
    notes,
  };
}

export async function commitDelegationGitClosure(projectRoot, plan) {
  const selectedFiles = uniqueSortedStrings(plan?.selectedFiles);
  if (selectedFiles.length === 0) {
    throw createScriptError("validation", "Delegation git closure has no selected files to commit", {
      failedStage: "git-closure-commit",
    });
  }

  const branchResult = await executeGit(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  await executeGit(projectRoot, ["add", "-A", "--", ...selectedFiles]);
  await executeGit(projectRoot, ["commit", "--only", "-m", normalizeString(plan?.commitMessage), "--", ...selectedFiles]);
  const shaResult = await executeGit(projectRoot, ["rev-parse", "HEAD"]);

  return {
    committedAt: new Date().toISOString(),
    currentBranch: normalizeString(branchResult.stdout) || "HEAD",
    commitSha: normalizeString(shaResult.stdout) || null,
  };
}

export function renderDelegationGitClosureMarkdown(record) {
  const lines = [
    `# Delegation Git Closure / ${record.taskId || "-"}`,
    "",
    `- 状态: ${record.status || "-"}`,
    `- 里程碑: ${record.gitClosure?.milestoneLabel || record.gitClosure?.milestone || "-"}`,
    `- 摘要: ${record.gitClosure?.summary || "-"}`,
    `- 提交信息: ${record.commitMessage || "-"}`,
    `- 分支: ${record.currentBranch || "-"}`,
    `- Commit SHA: ${record.commitSha || "-"}`,
    `- 时间: ${record.closedAt || record.plannedAt || "-"}`,
    "",
    "## 说明",
    "",
    ...((record.notes || []).map((item) => `- ${item}`)),
    "",
    "## 本次纳入文件",
    "",
    ...((record.selectedFiles || []).length > 0
      ? record.selectedFiles.map((item) => `- ${item}`)
      : ["- -"]),
    "",
    "## Scope 外改动（未纳入）",
    "",
    ...((record.outsideScopeChangedFiles || []).length > 0
      ? record.outsideScopeChangedFiles.map((item) => `- ${item}`)
      : ["- -"]),
    "",
    "## 聚焦测试",
    "",
  ];

  if (!Array.isArray(record.testResults) || record.testResults.length === 0) {
    lines.push("- 未执行");
    return lines.join("\n");
  }

  record.testResults.forEach((item) => {
    lines.push(`- ${item.ok ? "通过" : "失败"} | ${item.command || "-"} | exit=${item.exitCode ?? "-"}`);
  });
  return lines.join("\n");
}
