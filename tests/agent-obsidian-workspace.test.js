import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  resolveObsidianVisualsEnabled,
  resolveObsidianWorkspaceDir,
  resolveObsidianWorkspaceFiles,
} from "../scripts/agent-obsidian-workspace.mjs";

const projectRoot = "/tmp/addon-template";

describe("Agent Obsidian Workspace", () => {
  it("should resolve default obsidian workspace paths", () => {
    const previous = process.env.AGENT_OBSIDIAN_DIR;
    delete process.env.AGENT_OBSIDIAN_DIR;
    try {
      const dir = resolveObsidianWorkspaceDir(projectRoot);
      const files = resolveObsidianWorkspaceFiles(projectRoot);
      assert.equal(dir, path.join(projectRoot, "obsidian", "agent-workbench"));
      assert.equal(files.statusNote, path.join(dir, "01-Zotero-Agent-当前状态总览.md"));
      assert.equal(files.humanQuickstartNote, path.join(dir, "03-Zotero-Agent-人工快速上手.md"));
      assert.equal(files.humanAdvancedGuideNote, path.join(dir, "04-Zotero-Agent-高级介入规范.md"));
      assert.equal(files.visualFlowNote, path.join(dir, "05-Zotero-Agent-闭环流程图.md"));
      assert.equal(files.visualVerdictExcalidrawNote, path.join(dir, "06-Zotero-Agent-人工复核决策.excalidraw.md"));
      assert.equal(files.humanWindowNote, path.join(dir, "10-Zotero-Agent-人工指令窗口.md"));
    } finally {
      if (previous !== undefined) {
        process.env.AGENT_OBSIDIAN_DIR = previous;
      }
    }
  });

  it("should resolve custom obsidian workspace paths", () => {
    const previous = process.env.AGENT_OBSIDIAN_DIR;
    process.env.AGENT_OBSIDIAN_DIR = "/tmp/custom-obsidian";
    try {
      const files = resolveObsidianWorkspaceFiles(projectRoot);
      assert.equal(files.dir, "/tmp/custom-obsidian");
      assert.equal(files.architectureCanvas, "/tmp/custom-obsidian/00-Zotero-Agent-项目架构与闭环.canvas");
      assert.equal(files.humanQuickstartNote, "/tmp/custom-obsidian/03-Zotero-Agent-人工快速上手.md");
      assert.equal(files.humanAdvancedGuideNote, "/tmp/custom-obsidian/04-Zotero-Agent-高级介入规范.md");
      assert.equal(files.visualFlowNote, "/tmp/custom-obsidian/05-Zotero-Agent-闭环流程图.md");
      assert.equal(files.visualVerdictExcalidrawNote, "/tmp/custom-obsidian/06-Zotero-Agent-人工复核决策.excalidraw.md");
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_OBSIDIAN_DIR;
      } else {
        process.env.AGENT_OBSIDIAN_DIR = previous;
      }
    }
  });

  it("should parse AGENT_OBSIDIAN_VISUALS flag safely", () => {
    assert.equal(resolveObsidianVisualsEnabled({}), false);
    assert.equal(resolveObsidianVisualsEnabled({ AGENT_OBSIDIAN_VISUALS: "0" }), false);
    assert.equal(resolveObsidianVisualsEnabled({ AGENT_OBSIDIAN_VISUALS: "1" }), true);
    assert.equal(resolveObsidianVisualsEnabled({ AGENT_OBSIDIAN_VISUALS: "true" }), true);
    assert.equal(resolveObsidianVisualsEnabled({ AGENT_OBSIDIAN_VISUALS: "yes" }), true);
  });

  it("should reject invalid obsidian workspace environment values", () => {
    assert.throws(
      () => resolveObsidianVisualsEnabled({ AGENT_OBSIDIAN_VISUALS: "maybe" }),
      (error) => error?.scriptErrorCategory === "environment" && error?.details?.envVar === "AGENT_OBSIDIAN_VISUALS",
    );
  });
});
