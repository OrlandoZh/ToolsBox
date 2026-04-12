import path from "node:path";
import process from "node:process";
import {
  parseBooleanEnvFlag,
  resolveEnvPath,
} from "./script-runtime-lib.mjs";

export function resolveObsidianVisualsEnabled(env = process.env) {
  return parseBooleanEnvFlag(env, "AGENT_OBSIDIAN_VISUALS", {
    defaultValue: false,
  });
}

export function resolveObsidianWorkspaceDir(projectRoot, env = process.env) {
  const customDir = resolveEnvPath(env, "AGENT_OBSIDIAN_DIR");
  if (customDir) {
    return customDir;
  }
  return path.join(projectRoot, "obsidian", "agent-workbench");
}

export function resolveObsidianWorkspaceFiles(projectRoot, env = process.env) {
  const dir = resolveObsidianWorkspaceDir(projectRoot, env);
  return {
    dir,
    architectureCanvas: path.join(dir, "00-当前Zotero插件-功能与技术脉络.canvas"),
    statusNote: path.join(dir, "01-当前Zotero插件-状态总览.md"),
    evidenceNote: path.join(dir, "02-当前Zotero插件-证据索引.md"),
    humanQuickstartNote: path.join(dir, "03-模板协作-人工快速上手.md"),
    humanAdvancedGuideNote: path.join(dir, "04-模板协作-高级介入规范.md"),
    featureMapNote: path.join(dir, "05-当前Zotero插件-功能与可见面地图.md"),
    technicalLineageNote: path.join(dir, "06-当前Zotero插件-技术脉络与宿主接入.md"),
    preferencePaneConceptNote: path.join(dir, "07-当前Zotero插件-偏好设置面板 UI 概念.excalidraw.md"),
    paneConceptNote: path.join(dir, "08-当前Zotero插件-条目与上下文窗格 UI 概念.excalidraw.md"),
    readerConceptNote: path.join(dir, "09-当前Zotero插件-Reader UI 概念.excalidraw.md"),
    legacyHumanGuideNote: path.join(dir, "03-Zotero-Agent-人工使用指南.md"),
    humanWindowNote: path.join(dir, "10-模板协作-人工指令窗口.md"),
    menuConceptNote: path.join(dir, "11-当前Zotero插件-菜单与子菜单 UI 概念.excalidraw.md"),
    visualFlowNote: path.join(dir, "12-当前Zotero插件-交互流转图.md"),
    visualVerdictExcalidrawNote: path.join(dir, "13-当前Zotero插件-功能版图.excalidraw.md"),
    legacyWorkspaceFiles: [
      path.join(dir, "00-Zotero-Agent-项目架构与闭环.canvas"),
      path.join(dir, "01-Zotero-Agent-当前状态总览.md"),
      path.join(dir, "02-Zotero-Agent-证据索引.md"),
      path.join(dir, "03-Zotero-Agent-人工快速上手.md"),
      path.join(dir, "04-Zotero-Agent-高级介入规范.md"),
      path.join(dir, "05-Zotero-Agent-闭环流程图.md"),
      path.join(dir, "06-Zotero-Agent-人工复核决策.excalidraw.md"),
      path.join(dir, "10-Zotero-Agent-人工指令窗口.md"),
    ],
  };
}
