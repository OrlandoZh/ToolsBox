import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  buildUIDesignDelegationTask,
  listUIDesignWorkflows,
  runUIDesignWorkflow,
} from "../scripts/agent-ui-design-lib.mjs";

describe("Agent UI Design Lib", () => {
  it("should list the manual UI design workflow with an Obsidian Excalidraw target", () => {
    const root = "/tmp/addon-template";
    const result = listUIDesignWorkflows(root, {
      env: {},
    });

    assert.equal(result.workflows.length, 1);
    assert.equal(result.workflows[0].id, "product-ui-design-update");
    assert.equal(result.workflows[0].outputMode, "obsidian-excalidraw-only");
    assert.equal(
      result.workflows[0].notePath,
      "/tmp/addon-template/obsidian/agent-workbench/20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md",
    );
  });

  it("should build a strict delegation task that only writes the Excalidraw design note", () => {
    const root = "/tmp/addon-template";
    const workflow = buildUIDesignDelegationTask(root, "product-ui-design-update", {
      goal: "重做产品整体 UI 信息架构与 surface 演进批次。",
      env: {},
    });

    assert.equal(workflow.task.taskId, "OBSIDIAN-UI-DESIGN-001");
    assert.deepEqual(workflow.task.scopePaths, [
      "obsidian/agent-workbench/20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md",
    ]);
    assert.ok(workflow.task.promptTemplate.includes("Obsidian Excalidraw `.md` 格式"));
    assert.ok(workflow.task.promptTemplate.includes("重做产品整体 UI 信息架构与 surface 演进批次。"));
    assert.ok(workflow.task.promptTemplate.includes("只在这份 Excalidraw 中表达设计"));
  });

  it("should reject running the workflow against an external obsidian workspace", () => {
    assert.throws(
      () => buildUIDesignDelegationTask("/tmp/addon-template", "product-ui-design-update", {
        env: {
          AGENT_OBSIDIAN_DIR: "/tmp/external-obsidian",
        },
      }),
      (error) => error?.scriptErrorCategory === "validation" && error?.failedStage === "ui-design:workspace",
    );
  });

  it("should run and review the UI design workflow within strict scope", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-ui-design-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-ui-design-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      fs.mkdirSync(path.join(root, "obsidian", "agent-workbench"), { recursive: true });
      const result = await runUIDesignWorkflow(root, "product-ui-design-update", {
        goal: "补一版产品整体 UI 设计与更新流程图。",
        env: {},
        runtimeContext: {},
        executeCommand: async () => {
          const notePath = path.join(root, "obsidian", "agent-workbench", "20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md");
          fs.writeFileSync(notePath, [
            "---",
            "excalidraw-plugin: parsed",
            "tags: [excalidraw]",
            "---",
            "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'",
            "",
            "# Excalidraw Data",
            "",
            "## Text Elements",
            "%%",
            "## Drawing",
            "```json",
            "{\"type\":\"excalidraw\",\"version\":2,\"source\":\"https://github.com/zsviczian/obsidian-excalidraw-plugin\",\"elements\":[],\"appState\":{\"gridSize\":null,\"viewBackgroundColor\":\"#ffffff\"},\"files\":{}}",
            "```",
            "%%",
            "",
          ].join("\n"), "utf-8");
          return {
            exitCode: 0,
            signal: null,
            stdout: JSON.stringify({
              status: "completed",
              owner_role: "ui-design-worker",
              summary: "updated product UI design board",
              changed_files: ["obsidian/agent-workbench/20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md"],
              checks_run: [],
              risks: [],
              blockers: [],
              next_action: "review excalidraw board",
            }),
            stderr: "",
          };
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.review.reviewStatus, "accepted");
      assert.ok(result.notePath.endsWith("20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md"));
      assert.ok(fs.existsSync(path.join(result.artifactBase, "review.json")));
    } finally {
      if (previousArtifactsDir === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifactsDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  it("should reject out-of-scope writes during the UI design workflow", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-ui-design-reject-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-ui-design-reject-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      fs.mkdirSync(path.join(root, "obsidian", "agent-workbench"), { recursive: true });
      fs.writeFileSync(path.join(root, "docs.txt"), "baseline\n", "utf-8");
      const result = await runUIDesignWorkflow(root, "product-ui-design-update", {
        runtimeContext: {},
        executeCommand: async () => {
          fs.writeFileSync(
            path.join(root, "obsidian", "agent-workbench", "20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md"),
            "# in scope\n",
            "utf-8",
          );
          fs.writeFileSync(path.join(root, "docs.txt"), "out-of-scope\n", "utf-8");
          return {
            exitCode: 0,
            signal: null,
            stdout: "{}",
            stderr: "",
          };
        },
      });

      assert.equal(result.ok, false);
      assert.equal(result.review.reviewStatus, "rejected");
      assert.deepEqual(result.review.rejectedFiles, ["docs.txt"]);
    } finally {
      if (previousArtifactsDir === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifactsDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });
});
