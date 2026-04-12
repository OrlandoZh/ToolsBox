import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildAgentContext,
  loadAgentContextSources,
  summarizeAgentContextSnapshot,
} from "./agent-context-lib.mjs";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import { createScriptError, writeJSONArtifact } from "./script-runtime-lib.mjs";

export const DELEGATION_TASK_LANE_LABELS = Object.freeze({
  "codex-architecture-planning": "Codex 架构与规划",
  "opencode-implementation-delivery": "Opencode 实施与交付",
});

export const DELEGATION_TASK_LANE_ALIASES = Object.freeze({
  "codex-high-logic": "codex-architecture-planning",
  "opencode-low-logic": "opencode-implementation-delivery",
});

export function normalizeDelegationLane(value) {
  const lane = normalizeString(value);
  return DELEGATION_TASK_LANE_ALIASES[lane] || lane;
}

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
export const DELEGATION_SNAPSHOT_DEFAULT_IGNORE_DIRS = Object.freeze([
  ".git",
  "build",
  "dist",
  "node_modules",
  "reference",
]);
const MAX_RUNTIME_WARNING_LINES = 2;
const MAX_RUNTIME_EVIDENCE_REFS = 3;
const PROMPT_ASSEMBLY_DIGEST_LENGTH = 16;
const DELEGATION_BLOCKING_CONTEXT_WARNING_KINDS = new Set([
  "freshness-mismatch",
  "scope-mismatch",
  "missing-required-section",
]);

function normalizeString(value) {
  return String(value || "").trim();
}

function truncateText(value, maxLength = 120) {
  const text = normalizeString(value);
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function digestPromptSection(lines, length = PROMPT_ASSEMBLY_DIGEST_LENGTH) {
  return createHash("sha256")
    .update((Array.isArray(lines) ? lines : []).join("\n"))
    .digest("hex")
    .slice(0, length);
}

function sanitizeRuntimeContext(runtimeContext) {
  if (!runtimeContext || typeof runtimeContext !== "object" || runtimeContext.present !== true) {
    return null;
  }

  const warnings = uniqueStrings(runtimeContext?.driftRef?.warnings)
    .map((item) => truncateText(item, 120))
    .filter(Boolean)
    .slice(0, MAX_RUNTIME_WARNING_LINES);
  const evidenceRefs = uniqueStrings(runtimeContext?.evidenceRefs)
    .map((item) => truncateText(item, 120))
    .filter(Boolean)
    .slice(0, MAX_RUNTIME_EVIDENCE_REFS);
  const warningCount = Number.isFinite(Number(runtimeContext?.driftRef?.warningCount))
    ? Math.max(0, Math.trunc(Number(runtimeContext.driftRef.warningCount)))
    : warnings.length;

  return {
    present: true,
    truthRef: {
      activeBatchId: truncateText(runtimeContext?.truthRef?.activeBatchId, 96) || null,
      currentWaveName: truncateText(runtimeContext?.truthRef?.currentWaveName, 96) || null,
      validationLevel: truncateText(runtimeContext?.truthRef?.validationLevel, 96) || null,
    },
    alignmentRef: {
      status: truncateText(
        runtimeContext?.alignmentRef?.status || runtimeContext?.sourceAlignment?.status,
        48,
      ) || "missing",
      generationStage: truncateText(
        runtimeContext?.alignmentRef?.generationStage || runtimeContext?.sourceAlignment?.generationStage,
        48,
      ) || "missing",
      preferredRepairCommand: truncateText(
        runtimeContext?.alignmentRef?.preferredRepairCommand || runtimeContext?.sourceAlignment?.preferredRepairCommand,
        120,
      ) || null,
      warningKinds: uniqueStrings(
        runtimeContext?.alignmentRef?.warningKinds || runtimeContext?.sourceAlignment?.warningKinds,
      ).slice(0, MAX_RUNTIME_WARNING_LINES),
    },
    actionRef: {
      nextAction: truncateText(runtimeContext?.actionRef?.nextAction, 120) || null,
      mainBlocker: truncateText(runtimeContext?.actionRef?.mainBlocker, 120) || null,
    },
    statusRef: {
      stableContextKey: truncateText(runtimeContext?.statusRef?.stableContextKey, 80) || null,
      dynamicFingerprint: truncateText(runtimeContext?.statusRef?.dynamicFingerprint, 80) || null,
      monitorStatus: truncateText(runtimeContext?.statusRef?.monitorStatus, 80) || null,
      gateStatus: truncateText(runtimeContext?.statusRef?.gateStatus, 80) || null,
      memoryFingerprint: truncateText(runtimeContext?.statusRef?.memoryFingerprint, 80)
        || truncateText(runtimeContext?.statusRef?.memoryStrategyLabel, 80)
        || null,
      releaseStatus: truncateText(runtimeContext?.statusRef?.releaseStatus, 80) || null,
    },
    driftRef: {
      status: truncateText(runtimeContext?.driftRef?.status, 48) || "missing",
      warningCount: Math.min(warningCount, MAX_RUNTIME_WARNING_LINES),
      warnings,
    },
    evidenceRefs,
    artifactRefs: {
      currentTruth: truncateText(runtimeContext?.artifactRefs?.currentTruth, 120) || null,
      monitor: truncateText(runtimeContext?.artifactRefs?.monitor, 120) || null,
      gate: truncateText(runtimeContext?.artifactRefs?.gate, 120) || null,
      memory: truncateText(runtimeContext?.artifactRefs?.memory, 120) || null,
      contextJSON: truncateText(runtimeContext?.artifactRefs?.contextJSON, 120) || null,
    },
    budgetMeta: {
      profile: truncateText(runtimeContext?.budgetMeta?.profile, 64) || null,
      digest: truncateText(runtimeContext?.budgetMeta?.digest, 96) || null,
    },
  };
}

function resolveLaneLabel(task) {
  const lane = normalizeDelegationLane(task?.lane);
  return normalizeString(task?.laneLabel) || DELEGATION_TASK_LANE_LABELS[lane] || lane || "-";
}

function splitPromptTemplateIntoClauses(promptTemplate) {
  const normalized = normalizeString(promptTemplate)
    .replace(/^该任务仅供 Codex 跟踪。[。；\s]*/u, "")
    .replace(/\s+/gu, " ");
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/[。！？]/u)
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function buildPromptTemplateDigest(promptTemplate, maxItems = 3) {
  const clauses = splitPromptTemplateIntoClauses(promptTemplate);
  if (clauses.length === 0) {
    return [];
  }

  const digest = [];
  for (const clause of clauses) {
    const compactParts = clause
      .split(/[；;]/u)
      .map((item) => truncateText(item, 96))
      .filter(Boolean);
    for (const item of compactParts) {
      if (digest.includes(item)) {
        continue;
      }
      digest.push(item);
      if (digest.length >= maxItems) {
        return digest;
      }
    }
  }
  return digest;
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

  const lane = normalizeDelegationLane(task?.lane);
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

function tryParseJSON(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return null;
  }
  try {
    return JSON.parse(normalized);
  } catch {
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

async function executeDelegationCommand(command, args, { cwd, shell = false } = {}) {
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

async function writeDelegationTaskSnapshot(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeJSONArtifact(filePath, payload);
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

export async function loadDelegationRuntimeContext(projectRoot) {
  const contextPath = resolveAgentArtifactPath(projectRoot, "agent-context.json");
  try {
    const content = await fs.readFile(contextPath, "utf-8");
    const parsed = JSON.parse(content);
    return summarizeAgentContextSnapshot(parsed);
  } catch (error) {
    if (error && (error.code === "ENOENT" || error instanceof SyntaxError)) {
      const fallbackContext = buildAgentContext(await loadAgentContextSources(projectRoot));
      return summarizeAgentContextSnapshot(fallbackContext);
    }
    throw error;
  }
}

function collectDelegationContextWarningKinds(runtimeContext, contextGuard = null) {
  const guardKinds = uniqueStrings(
    (Array.isArray(contextGuard?.warnings) ? contextGuard.warnings : []).map((item) => item?.kind),
  );
  if (guardKinds.length > 0) {
    return guardKinds;
  }
  const alignmentKinds = uniqueStrings(
    runtimeContext?.alignmentRef?.warningKinds || runtimeContext?.sourceAlignment?.warningKinds,
  );
  if (alignmentKinds.length > 0) {
    return alignmentKinds;
  }
  if (runtimeContext?.driftRef?.status === "warning" && Number(runtimeContext?.driftRef?.warningCount || 0) > 0) {
    return ["freshness-mismatch"];
  }
  return [];
}

export function summarizeDelegationRuntimePreflight(runtimeContext, contextGuard = null) {
  const warningKinds = collectDelegationContextWarningKinds(runtimeContext, contextGuard);
  const blockingKinds = warningKinds.filter((kind) => DELEGATION_BLOCKING_CONTEXT_WARNING_KINDS.has(kind));
  const blocking = blockingKinds.length > 0;
  const preferredRepairCommand = runtimeContext?.alignmentRef?.preferredRepairCommand
    || runtimeContext?.sourceAlignment?.preferredRepairCommand
    || null;
  return {
    blocking,
    warningKinds,
    blockingKinds,
    preferredRepairCommand,
    message: blocking
      ? `Delegation runtime context is not safe to use: ${blockingKinds.join("、")}。`
      : "Delegation runtime context is usable.",
    recommendation: blocking
      ? contextGuard?.recommendation
        || preferredRepairCommand
        || "先刷新 agent-context，再重新运行 delegation。"
      : null,
  };
}

export async function runEphemeralDelegationTask(projectRoot, task, options = {}) {
  const artifacts = resolveDelegationTaskArtifacts(projectRoot, task.taskId);
  await fs.mkdir(artifacts.baseDir, { recursive: true });
  const runtimeContext = options.runtimeContext || await loadDelegationRuntimeContext(projectRoot);
  const captureSnapshotOptions = options.captureSnapshotOptions || {};
  const executeCommand = typeof options.executeCommand === "function"
    ? options.executeCommand
    : executeDelegationCommand;

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
  const beforeSnapshot = await captureProjectSnapshot(projectRoot, captureSnapshotOptions);

  await Promise.all([
    writeDelegationTaskSnapshot(artifacts.taskJSON, {
      savedAt: new Date().toISOString(),
      task,
    }),
    writeDelegationTaskSnapshot(artifacts.invocationJSON, {
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
    writeDelegationTaskSnapshot(artifacts.beforeSnapshotJSON, beforeSnapshot),
  ]);

  let result;
  let executionErrorMessage = null;
  try {
    result = await executeCommand(invocation.command, invocation.args, {
      cwd: projectRoot,
      shell: false,
      task,
      invocation,
    });
  } catch (error) {
    executionErrorMessage = String(error?.message || error || "Delegation command failed");
    result = {
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: executionErrorMessage,
    };
  }

  const afterSnapshot = await captureProjectSnapshot(projectRoot, captureSnapshotOptions);
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
    executionErrorMessage,
  };

  await Promise.all([
    writeDelegationTaskSnapshot(artifacts.afterSnapshotJSON, afterSnapshot),
    fs.writeFile(artifacts.providerStdoutTXT, result.stdout, "utf-8"),
    fs.writeFile(artifacts.providerStderrTXT, result.stderr, "utf-8"),
    writeDelegationTaskSnapshot(artifacts.providerResultJSON, {
      capturedAt: new Date().toISOString(),
      parsed: parsedProviderResult,
      stdoutFile: path.basename(artifacts.providerStdoutTXT),
      stderrFile: path.basename(artifacts.providerStderrTXT),
    }),
    writeDelegationTaskSnapshot(artifacts.runJSON, runRecord),
  ]);

  return {
    ...runRecord,
    artifactBase: artifacts.baseDir,
    parsedProviderResult,
  };
}

export async function reviewEphemeralDelegationTask(projectRoot, task, options = {}) {
  const artifacts = resolveDelegationTaskArtifacts(projectRoot, task.taskId);
  const runRecord = options.runRecord || JSON.parse(await fs.readFile(artifacts.runJSON, "utf-8"));
  const review = buildDelegationReview(task, runRecord, {
    reviewer: options.reviewer,
    testResults: options.testResults,
  });

  await Promise.all([
    writeDelegationTaskSnapshot(artifacts.reviewJSON, review),
    fs.writeFile(artifacts.reviewMD, `${renderDelegationReviewMarkdown(review)}\n`, "utf-8"),
  ]);

  return review;
}

function formatRuntimeContextLine(label, values) {
  const parts = (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.length > 0 ? `- ${label}: ${parts.join(" / ")}` : `- ${label}: -`;
}

function buildDelegationPromptAssembly(task, options = {}) {
  const manifestPath = normalizeString(options.manifestPath) || DEFAULT_MANIFEST_PATH;
  const inlineContract = options.inlineContract === true;
  const contractDigest = buildPromptTemplateDigest(task?.promptTemplate, 3);
  const runtimeContext = sanitizeRuntimeContext(options.runtimeContext);
  const promptMode = inlineContract ? "inline-contract" : "manifest-reference";
  const contractReference = `${manifestPath} -> ${task.taskId}`;
  const stablePrefixLines = [
    `任务 ID: ${task.taskId}`,
    `任务标题: ${task.title || task.taskId}`,
    `执行 lane: ${resolveLaneLabel(task)}`,
    `完整契约来源: ${contractReference}`,
    "",
    "你是通过 mco 调度的 Opencode worker。",
    "这是一个已冻结契约的实施与交付任务：只能在给定路径范围内做实现、透传、展示、测试或文档同步，不能擅自改变边界、策略、白名单范围或风险模型。",
    "为减少委托 prompt 的上下文占用，完整 contract 默认不再内联；开始前先读取 manifest 中该任务的完整记录，若当前 prompt 与 manifest 冲突，以 manifest 为准。",
    "",
    "允许修改路径:",
    ...task.scopePaths.map((item) => `- ${item}`),
  ];

  if (task.dependsOn.length > 0) {
    stablePrefixLines.push("", `前置依赖: ${task.dependsOn.join("、")}`);
  }

  if (inlineContract) {
    stablePrefixLines.push(
      "",
      "任务契约（内联）:",
      task.promptTemplate || "-",
    );
  } else {
    stablePrefixLines.push("", "最小任务摘要:");
    if (contractDigest.length === 0) {
      stablePrefixLines.push("- 请读取 manifest 中该任务的 `promptTemplate` 获取完整边界。");
    } else {
      contractDigest.forEach((item) => {
        stablePrefixLines.push(`- ${item}`);
      });
    }
  }

  if (task.reviewChecklist.length > 0) {
    stablePrefixLines.push("", "审查清单:");
    task.reviewChecklist.forEach((item) => {
      stablePrefixLines.push(`- ${item}`);
    });
  }

  if (task.testCommands.length > 0) {
    stablePrefixLines.push("", "完成后请自行运行这些命令:");
    task.testCommands.forEach((item) => {
      stablePrefixLines.push(`- ${item}`);
    });
  }

  if (task.handoffArtifacts.length > 0) {
    stablePrefixLines.push("", "交接时需要说明的工件:");
    task.handoffArtifacts.forEach((item) => {
      stablePrefixLines.push(`- ${item}`);
    });
  }

  stablePrefixLines.push(
    "",
    "硬约束:",
    "- 不要改 scopePaths 之外的文件。",
    "- 不要把需要 Codex 做架构与规划裁决的问题偷偷实现成代码改动。",
    "- 若遇到契约不够或需要改变边界，只在结果里说明，不要越权扩面。",
  );

  const dynamicTailLines = [];
  if (runtimeContext?.present) {
    dynamicTailLines.push(
      "动态运行时上下文（可变部分）:",
      `当前项目态（${runtimeContext.budgetMeta?.profile || "runtime-compact-v1"}）:`,
    );
    dynamicTailLines.push(formatRuntimeContextLine("Truth Ref", [
      `batch=${runtimeContext.truthRef?.activeBatchId || "-"}`,
      `wave=${runtimeContext.truthRef?.currentWaveName || "-"}`,
      `validation=${runtimeContext.truthRef?.validationLevel || "-"}`,
    ]));
    dynamicTailLines.push(formatRuntimeContextLine("Alignment Ref", [
      `status=${runtimeContext.alignmentRef?.status || "missing"}`,
      `stage=${runtimeContext.alignmentRef?.generationStage || "missing"}`,
      `repair=${runtimeContext.alignmentRef?.preferredRepairCommand || "-"}`,
      (Array.isArray(runtimeContext.alignmentRef?.warningKinds) ? runtimeContext.alignmentRef.warningKinds : []).join("；"),
    ]));
    dynamicTailLines.push(formatRuntimeContextLine("Action Ref", [
      `next=${runtimeContext.actionRef?.nextAction || "-"}`,
      `blocker=${runtimeContext.actionRef?.mainBlocker || "-"}`,
    ]));
    dynamicTailLines.push(formatRuntimeContextLine("Status Ref", [
      `stable=${runtimeContext.statusRef?.stableContextKey || "-"}`,
      `dynamic=${runtimeContext.statusRef?.dynamicFingerprint || "-"}`,
      `monitor=${runtimeContext.statusRef?.monitorStatus || "-"}`,
      `gate=${runtimeContext.statusRef?.gateStatus || "-"}`,
      `memory=${runtimeContext.statusRef?.memoryFingerprint || runtimeContext.statusRef?.memoryStrategyLabel || "-"}`,
      `release=${runtimeContext.statusRef?.releaseStatus || "-"}`,
    ]));
    dynamicTailLines.push(formatRuntimeContextLine("Drift Ref", [
      `status=${runtimeContext.driftRef?.status || "missing"}`,
      `warning=${runtimeContext.driftRef?.warningCount ?? 0}`,
      (Array.isArray(runtimeContext.driftRef?.warnings) ? runtimeContext.driftRef.warnings : []).join("；"),
    ]));
    dynamicTailLines.push(formatRuntimeContextLine("Evidence Refs", runtimeContext.evidenceRefs || []));
    dynamicTailLines.push(formatRuntimeContextLine("Artifact Refs", [
      `truth=${runtimeContext.artifactRefs?.currentTruth || "-"}`,
      `monitor=${runtimeContext.artifactRefs?.monitor || "-"}`,
      `gate=${runtimeContext.artifactRefs?.gate || "-"}`,
      `memory=${runtimeContext.artifactRefs?.memory || "-"}`,
      `context=${runtimeContext.artifactRefs?.contextJSON || "-"}`,
    ]));
  }

  const promptLines = dynamicTailLines.length > 0
    ? [...stablePrefixLines, "", ...dynamicTailLines]
    : stablePrefixLines;
  const runtimeContextProfile = runtimeContext?.budgetMeta?.profile || null;
  const runtimeContextDigest = runtimeContext?.budgetMeta?.digest || null;

  return {
    prompt: promptLines.join("\n"),
    promptMode,
    contractReference,
    runtimeContextProfile,
    runtimeContextDigest,
    budgetProfile: runtimeContextProfile || "task-contract-compact-v1",
    stablePrefixDigest: digestPromptSection(stablePrefixLines),
    dynamicTailDigest: digestPromptSection(dynamicTailLines),
    stablePrefixLineCount: stablePrefixLines.length,
    dynamicTailLineCount: dynamicTailLines.length,
  };
}

export function buildDelegationPrompt(task, options = {}) {
  return buildDelegationPromptAssembly(task, options).prompt;
}

export function buildMcoRunInvocation(task, projectRoot, options = {}) {
  if (normalizeDelegationLane(task?.lane) !== "opencode-implementation-delivery") {
    throw createScriptError("validation", `Task '${task?.taskId || "-"}' is not runnable by Opencode`, {
      failedStage: "delegation-run",
    });
  }

  const artifacts = resolveDelegationTaskArtifacts(projectRoot, task.taskId);
  const {
    prompt: assembledPrompt,
    ...promptAssembly
  } = buildDelegationPromptAssembly(task, options);
  const prompt = options.prompt || assembledPrompt;
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
    promptMode: promptAssembly.promptMode,
    contractReference: promptAssembly.contractReference,
    runtimeContextProfile: promptAssembly.runtimeContextProfile,
    runtimeContextDigest: promptAssembly.runtimeContextDigest,
    promptAssembly,
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
    .filter((task) => normalizeDelegationLane(task?.lane) === "opencode-implementation-delivery");

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

function resolveSnapshotIgnoreDirs(ignoreDirs) {
  return new Set(
    (Array.isArray(ignoreDirs) ? ignoreDirs : DELEGATION_SNAPSHOT_DEFAULT_IGNORE_DIRS)
      .map((item) => normalizeString(item))
      .filter(Boolean),
  );
}

function shouldIgnoreSnapshotPath(relativePath, options = {}) {
  const normalized = toPosixRelativePath(relativePath);
  const segments = normalized.split("/");
  const ignoreDirs = resolveSnapshotIgnoreDirs(options.ignoreDirs);
  return segments.some((segment) => ignoreDirs.has(segment));
}

async function walkSnapshotFiles(projectRoot, relativeDir = "", files = [], options = {}) {
  const absoluteDir = path.join(projectRoot, relativeDir);
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const nextRelative = relativeDir
      ? `${relativeDir.replaceAll("\\", "/")}/${entry.name}`
      : entry.name;

    if (shouldIgnoreSnapshotPath(nextRelative, options)) {
      continue;
    }

    const absolutePath = path.join(projectRoot, nextRelative);
    if (entry.isDirectory()) {
      await walkSnapshotFiles(projectRoot, nextRelative, files, options);
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

export async function captureProjectSnapshot(projectRoot, options = {}) {
  const files = await walkSnapshotFiles(projectRoot, "", [], options);
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
