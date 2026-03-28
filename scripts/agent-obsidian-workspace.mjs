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
    architectureCanvas: path.join(dir, "00-Zotero-Agent-项目架构与闭环.canvas"),
    statusNote: path.join(dir, "01-Zotero-Agent-当前状态总览.md"),
    evidenceNote: path.join(dir, "02-Zotero-Agent-证据索引.md"),
    humanQuickstartNote: path.join(dir, "03-Zotero-Agent-人工快速上手.md"),
    humanAdvancedGuideNote: path.join(dir, "04-Zotero-Agent-高级介入规范.md"),
    visualFlowNote: path.join(dir, "05-Zotero-Agent-闭环流程图.md"),
    visualVerdictExcalidrawNote: path.join(dir, "06-Zotero-Agent-人工复核决策.excalidraw.md"),
    legacyHumanGuideNote: path.join(dir, "03-Zotero-Agent-人工使用指南.md"),
    humanWindowNote: path.join(dir, "10-Zotero-Agent-人工指令窗口.md"),
  };
}
