import path from "node:path";
import process from "node:process";

export function resolveObsidianVisualsEnabled(env = process.env) {
  const value = String(env?.AGENT_OBSIDIAN_VISUALS || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function resolveObsidianWorkspaceDir(projectRoot) {
  const customDir = String(process.env.AGENT_OBSIDIAN_DIR || "").trim();
  if (customDir) {
    return path.resolve(customDir);
  }
  return path.join(projectRoot, "obsidian", "agent-workbench");
}

export function resolveObsidianWorkspaceFiles(projectRoot) {
  const dir = resolveObsidianWorkspaceDir(projectRoot);
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
