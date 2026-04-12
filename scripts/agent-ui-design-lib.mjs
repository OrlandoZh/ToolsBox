import path from "node:path";
import { runEphemeralDelegationTask, reviewEphemeralDelegationTask } from "./agent-delegation-lib.mjs";
import { isPathWithinRoot } from "./agent-obsidian-guard-lib.mjs";
import { resolveObsidianWorkspaceDir } from "./agent-obsidian-workspace.mjs";
import {
  assertScript,
  createScriptError,
} from "./script-runtime-lib.mjs";

const DEFAULT_WORKFLOW_ID = "product-ui-design-update";
const PRODUCT_UI_DESIGN_NOTE_FILE = "20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md";
const DEFAULT_GOAL = "基于当前 truth、功能地图、技术脉络与现有 surface 概念图，刷新产品整体 UI 设计与更新流程草图。";

function normalizeString(value) {
  return String(value || "").trim();
}

function toPosixRelative(projectRoot, targetPath) {
  const relative = path.relative(projectRoot, targetPath).replaceAll("\\", "/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    return null;
  }
  return relative;
}

function buildWorkflowPreset(projectRoot, options = {}) {
  const env = options.env || process.env;
  const workspaceDir = resolveObsidianWorkspaceDir(projectRoot, env);
  const notePath = path.join(workspaceDir, PRODUCT_UI_DESIGN_NOTE_FILE);
  const notePathRelative = toPosixRelative(projectRoot, notePath);
  const workspaceInProject = isPathWithinRoot(workspaceDir, projectRoot);

  return {
    id: DEFAULT_WORKFLOW_ID,
    taskId: "OBSIDIAN-UI-DESIGN-001",
    title: "产品整体 UI 设计与更新流程草图",
    lane: "opencode-implementation-delivery",
    workspaceDir,
    workspaceInProject,
    notePath,
    notePathRelative,
    summary: "人工触发子 agent，只在 Obsidian Excalidraw 中创建或更新产品整体 UI 设计与演进草图。",
    outputMode: "obsidian-excalidraw-only",
    defaultGoal: DEFAULT_GOAL,
  };
}

function resolveWorkflowId(workflowId) {
  const normalized = normalizeString(workflowId);
  return normalized || DEFAULT_WORKFLOW_ID;
}

export function listUIDesignWorkflows(projectRoot, options = {}) {
  const preset = buildWorkflowPreset(projectRoot, options);
  return {
    projectRoot: path.resolve(projectRoot),
    workspaceDir: preset.workspaceDir,
    workspaceInProject: preset.workspaceInProject,
    workflows: [
      {
        id: preset.id,
        taskId: preset.taskId,
        title: preset.title,
        summary: preset.summary,
        outputMode: preset.outputMode,
        notePath: preset.notePath,
        notePathRelative: preset.notePathRelative,
        defaultGoal: preset.defaultGoal,
        workspaceInProject: preset.workspaceInProject,
      },
    ],
  };
}

export function buildUIDesignDelegationTask(projectRoot, workflowId, options = {}) {
  const normalizedWorkflowId = resolveWorkflowId(workflowId);
  assertScript(
    normalizedWorkflowId === DEFAULT_WORKFLOW_ID,
    `Unknown UI design workflow: ${normalizedWorkflowId}`,
    {
      category: "args",
      failedStage: "ui-design:workflow",
    },
  );

  const preset = buildWorkflowPreset(projectRoot, options);
  assertScript(
    preset.workspaceInProject && preset.notePathRelative,
    `UI design workflow currently only supports the in-repo Obsidian workspace. Current workspace: ${preset.workspaceDir}`,
    {
      category: "validation",
      failedStage: "ui-design:workspace",
    },
  );

  const goal = normalizeString(options.goal) || preset.defaultGoal;
  const promptTemplate = [
    `本轮只允许创建或更新 \`${preset.notePathRelative}\`，用于产品整体 UI 设计与更新流程的人工草图。`,
    "UI 设计呈现必须使用 Obsidian Excalidraw `.md` 格式，结构直接对齐当前工作台里现有 `07~11` 的 `.excalidraw.md` 文件样式。",
    "只在这份 Excalidraw 中表达设计，不额外创建 Markdown 设计稿、说明文档、TODO 清单、mirror 或业务实现文件。",
    `本轮人工目标：${goal}`,
    "可以把 `docs/CURRENT_BACKLOG.md`、`obsidian/agent-workbench/05-当前Zotero插件-功能与可见面地图.md`、`obsidian/agent-workbench/06-当前Zotero插件-技术脉络与宿主接入.md`，以及现有 `07~11` UI 概念图当作只读背景，但不得修改这些文件。",
    "图中至少同时表达：当前产品 UI 版图、目标演进方向、主要 surface 关系、以及推荐的更新步骤/批次节奏。",
    "最终 stdout 只返回单个 JSON brief，字段至少包含 `status`、`owner_role`、`summary`、`changed_files`、`checks_run`、`risks`、`blockers`、`next_action`。",
  ].join(" ");

  return {
    workflowId: preset.id,
    goal,
    notePath: preset.notePath,
    notePathRelative: preset.notePathRelative,
    task: {
      taskId: preset.taskId,
      title: preset.title,
      lane: preset.lane,
      scopePaths: [preset.notePathRelative],
      dependsOn: [],
      promptTemplate,
      reviewChecklist: [
        "只允许改目标 Excalidraw 草图文件，不得顺手改源码、truth 或自动生成指南。",
        "产物必须保持 Obsidian Excalidraw `.md` 结构，而不是普通 Markdown 草稿。",
      ],
      testCommands: [],
      handoffArtifacts: [preset.notePathRelative],
    },
  };
}

export async function runUIDesignWorkflow(projectRoot, workflowId, options = {}) {
  const workflow = buildUIDesignDelegationTask(projectRoot, workflowId, options);
  const manifestPath = `ephemeral://ui-design/${workflow.workflowId}`;
  const runRecord = await runEphemeralDelegationTask(projectRoot, workflow.task, {
    manifestPath,
    inlineContract: true,
    runtimeContext: options.runtimeContext,
    executeCommand: options.executeCommand,
  });
  const review = await reviewEphemeralDelegationTask(projectRoot, workflow.task, {
    reviewer: normalizeString(options.reviewer) || "codex-ui-design-controller",
    runRecord,
  });

  return {
    ok: review.reviewStatus === "accepted",
    workflowId: workflow.workflowId,
    goal: workflow.goal,
    notePath: workflow.notePath,
    notePathRelative: workflow.notePathRelative,
    artifactBase: runRecord.artifactBase,
    runRecord,
    review,
  };
}

export function pickUIDesignWorkflow(projectRoot, workflowId, options = {}) {
  const result = listUIDesignWorkflows(projectRoot, options);
  const targetId = resolveWorkflowId(workflowId);
  const workflow = result.workflows.find((item) => item.id === targetId);
  if (!workflow) {
    throw createScriptError("args", `Unknown UI design workflow: ${targetId}`, {
      failedStage: "ui-design:pick-workflow",
    });
  }
  return workflow;
}
