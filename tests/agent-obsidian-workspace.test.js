import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  resolveObsidianVisualsEnabled,
  resolveObsidianWorkspaceDir,
  resolveObsidianWorkspaceFiles,
} from "../scripts/agent-obsidian-workspace.mjs";
import {
  evaluateObsidianWorkspaceGuard,
  isPathWithinRoot,
} from "../scripts/agent-obsidian-guard-lib.mjs";

const projectRoot = "/tmp/addon-template";

function writeJSON(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content}\n`, "utf-8");
}

function writeCoherentWorkbench(workspaceDir, options = {}) {
  const generationId = options.generationId || "obsidian-test-generation";
  const summarySource = options.summarySource || "gate";
  const bootstrapShell = options.bootstrapShell === true;
  const statusNotePath = path.join(workspaceDir, "01-Zotero-Agent-当前状态总览.md");
  const canvasPath = path.join(workspaceDir, "00-Zotero-Agent-项目架构与闭环.canvas");
  const waveName = options.waveName || "";
  const validationSummary = options.validationSummary || "当前未声明项目级 validation override。";
  const validationLevel = options.validationLevel || "visual-not-needed";
  writeText(statusNotePath, [
    "---",
    `generated_at: ${options.generatedAt || "2026-04-02T00:00:02.000Z"}`,
    `handoff_generation_id: ${generationId}`,
    `summary_source: ${summarySource}`,
    `bootstrap_shell: ${bootstrapShell ? "true" : "false"}`,
    `current_wave_name: "${waveName}"`,
    'current_truth_active_batch: "ENG-HIGH-104"',
    `validation_level: ${validationLevel}`,
    'next_action: "请先执行 `npm run agent:sync` 刷新当前项目态工作台。"',
    "---",
    "",
    "# Zotero Agent 当前状态总览",
    "",
    `- 当前 wave：${waveName || "当前尚未声明项目 expansion wave。"}`,
    `- Validation mirror：${validationSummary}`,
    `- Validation level：${validationLevel}`,
    `- 摘要来源：${summarySource}`,
    options.includeFallback ? "- 当前缺少足够的自动化结论，请人工查看工件。" : "- Gate 结论：远端 release 闭环仍待补齐。",
  ].join("\n"));
  writeJSON(canvasPath, {
    nodes: [
      {
        id: "root0001",
        type: "text",
        x: 0,
        y: 0,
        width: 320,
        height: 180,
        text: options.includeFallback
          ? "当前项目态白板\n\n待人工介入\n当前缺少足够的自动化结论，请人工查看工件。"
          : `当前项目态白板\n\nWave：${waveName || "当前尚未声明项目 expansion wave。"}\nValidation：${validationSummary}`,
      },
      {
        id: "meta0002",
        type: "text",
        x: 0,
        y: -200,
        width: 320,
        height: 140,
        text: [
          "工作台元数据",
          `generation_id=${generationId}`,
          `summary_source=${summarySource}`,
          `bootstrap_shell=${bootstrapShell ? "true" : "false"}`,
        ].join("\n"),
      },
    ],
    edges: [],
  });
  return {
    statusNotePath,
    canvasPath,
  };
}

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

  it("should treat only in-project paths as owned workspace directories", () => {
    assert.equal(isPathWithinRoot("/tmp/project/obsidian/agent-workbench", "/tmp/project"), true);
    assert.equal(isPathWithinRoot("/tmp/project", "/tmp/project"), true);
    assert.equal(isPathWithinRoot("/tmp/another/obsidian", "/tmp/project"), false);
  });

  it("should report external workspaceDir as violation when not allowed", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-guard-root-"));
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-guard-artifacts-"));
    const externalWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-external-"));
    try {
      writeJSON(path.join(artifacts, "agent-obsidian-handoff.json"), {
        generatedAt: new Date().toISOString(),
        success: true,
        workspaceDir: externalWorkspace,
      });
      const result = await evaluateObsidianWorkspaceGuard(root, {
        strict: true,
        scope: "path",
        env: {
          AGENT_ARTIFACTS_DIR: artifacts,
        },
      });
      assert.equal(result.status, "external-blocked");
      assert.equal(result.violation, true);
      assert.equal(result.ok, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifacts, { recursive: true, force: true });
      fs.rmSync(externalWorkspace, { recursive: true, force: true });
    }
  });

  it("should allow external workspaceDir when AGENT_OBSIDIAN_ALLOW_EXTERNAL=1", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-allow-root-"));
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-allow-artifacts-"));
    const externalWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-allow-external-"));
    try {
      writeJSON(path.join(artifacts, "agent-obsidian-handoff.json"), {
        generatedAt: new Date().toISOString(),
        success: true,
        workspaceDir: externalWorkspace,
      });
      const result = await evaluateObsidianWorkspaceGuard(root, {
        strict: true,
        scope: "path",
        env: {
          AGENT_ARTIFACTS_DIR: artifacts,
          AGENT_OBSIDIAN_ALLOW_EXTERNAL: "1",
        },
      });
      assert.equal(result.status, "external-allowed");
      assert.equal(result.violation, false);
      assert.equal(result.ok, true);
      assert.equal(result.bypassed, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifacts, { recursive: true, force: true });
      fs.rmSync(externalWorkspace, { recursive: true, force: true });
    }
  });

  it("should resolve symlink workspaceDir by realpath and detect external target", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-symlink-root-"));
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-symlink-artifacts-"));
    const externalWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-symlink-external-"));
    const linkedPath = path.join(root, "obsidian", "linked-workbench");
    try {
      fs.mkdirSync(path.dirname(linkedPath), { recursive: true });
      fs.symlinkSync(externalWorkspace, linkedPath);
      writeJSON(path.join(artifacts, "agent-obsidian-handoff.json"), {
        generatedAt: new Date().toISOString(),
        success: true,
        workspaceDir: linkedPath,
      });
      const result = await evaluateObsidianWorkspaceGuard(root, {
        strict: true,
        scope: "path",
        env: {
          AGENT_ARTIFACTS_DIR: artifacts,
        },
      });
      assert.equal(result.status, "external-blocked");
      assert.equal(result.violation, true);
      assert.equal(result.inProject, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifacts, { recursive: true, force: true });
      fs.rmSync(externalWorkspace, { recursive: true, force: true });
    }
  });

  it("should warn on bootstrap shell and keep full guard non-blocking", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-bootstrap-root-"));
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-bootstrap-artifacts-"));
    const workspaceDir = path.join(root, "obsidian", "agent-workbench");
    const { statusNotePath, canvasPath } = writeCoherentWorkbench(workspaceDir, {
      generationId: "bootstrap-shell-generation",
      summarySource: "bootstrap-shell",
      bootstrapShell: true,
    });
    try {
      writeJSON(path.join(artifacts, "agent-obsidian-handoff.json"), {
        generatedAt: "2026-04-02T00:00:03.000Z",
        generationId: "bootstrap-shell-generation",
        success: true,
        workspaceDir,
        statusNote: statusNotePath,
        architectureCanvas: canvasPath,
        summarySource: "bootstrap-shell",
        bootstrapShell: true,
        projectContext: {
          expansionWave: { present: true },
          validationOverrides: { present: true, overrideCount: 0, summary: "当前未声明项目级 validation override。" },
          validationDecision: { level: "visual-not-needed" },
        },
      });
      const result = await evaluateObsidianWorkspaceGuard(root, {
        strict: true,
        env: {
          AGENT_ARTIFACTS_DIR: artifacts,
        },
      });
      assert.equal(result.ok, true);
      assert.equal(result.violation, false);
      assert.equal(result.freshnessStatus, "bootstrap-shell");
      assert.ok(result.warnings.some((item) => item.status === "bootstrap-shell"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it("should fail strict guard when handoff is stale or still contains fallback content", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-freshness-root-"));
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-obsidian-freshness-artifacts-"));
    const workspaceDir = path.join(root, "obsidian", "agent-workbench");
    const { statusNotePath, canvasPath } = writeCoherentWorkbench(workspaceDir, {
      generationId: "stale-generation",
      summarySource: "gate",
      waveName: "Phase E Extension Wave 1",
      validationSummary: "项目覆盖 1 条：required=1 / recommended=0 / not-needed=0",
      validationLevel: "visual-required",
      includeFallback: true,
    });
    try {
      writeJSON(path.join(artifacts, "agent-gate.json"), {
        generatedAt: "2026-04-02T00:00:05.000Z",
        frontpageSummary: {
          statusLabel: "可继续",
          headline: "当前 gate 已收敛为可继续。",
        },
      });
      writeJSON(path.join(artifacts, "agent-monitor.json"), {
        generatedAt: "2026-04-02T00:00:04.000Z",
        frontpageSummary: {
          statusLabel: "稳定",
          headline: "当前 monitor 已收敛为稳定。",
        },
      });
      writeJSON(path.join(artifacts, "agent-obsidian-handoff.json"), {
        generatedAt: "2026-04-02T00:00:03.000Z",
        generationId: "stale-generation",
        success: true,
        workspaceDir,
        statusNote: statusNotePath,
        architectureCanvas: canvasPath,
        summarySource: "gate",
        bootstrapShell: false,
        projectContext: {
          expansionWave: {
            present: true,
            currentWaveName: "Phase E Extension Wave 1",
            inScopeModules: ["src/features/reader-chat.js"],
          },
          validationOverrides: {
            present: true,
            overrideCount: 1,
            summary: "项目覆盖 1 条：required=1 / recommended=0 / not-needed=0",
          },
          validationDecision: {
            level: "visual-required",
          },
        },
      });
      const result = await evaluateObsidianWorkspaceGuard(root, {
        strict: true,
        env: {
          AGENT_ARTIFACTS_DIR: artifacts,
        },
      });
      assert.equal(result.ok, false);
      assert.equal(result.violation, true);
      assert.equal(result.freshnessStatus, "stale");
      assert.ok(result.violations.some((item) => item.status === "stale"));
      assert.ok(result.violations.some((item) => item.status === "fallback-drift"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });
});
