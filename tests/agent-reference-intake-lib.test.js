import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  listReferenceIntakeRecords,
  loadReferenceDistillationState,
  recordReferenceIntake,
} from "../scripts/agent-reference-intake-lib.mjs";

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

describe("Agent Reference Intake Lib", () => {
  it("should match threshold when the controller records three raw reference files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-intake-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-intake-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      writeText(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n");

      const result = await recordReferenceIntake(root, {
        sessionId: "session-a",
        taskId: "task-a",
        activeBatchId: "ENG-HIGH-104",
        topicHint: "Plugin Menu Patterns",
        routerMissReason: "router-too-broad",
        rawReferenceFiles: [
          "reference/plugin/demo-a/menu.js",
          "reference/plugin/demo-a/context-menu.js",
          "reference/plugin/demo-a/popupshowing.js",
        ],
      }, {
        now: "2026-04-08T03:00:00.000Z",
      });

      const record = result.latestRecord;
      assert.equal(record.thresholdMatched, true);
      assert.equal(record.thresholdReasons.rawReferenceFileCount, 3);
      assert.equal(record.thresholdReasons.fileThresholdMatched, true);
      assert.equal(record.thresholdReasons.projectThresholdMatched, false);
      assert.equal(record.status, "pending");
      assert.equal(record.distillTargetDoc, "docs/REFERENCE_PLUGIN_MENU_PATTERNS.md");
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

  it("should match threshold when the controller compares two distinct reference projects", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-projects-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-projects-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      writeText(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n");

      await recordReferenceIntake(root, {
        sessionId: "session-b",
        taskId: "task-b",
        topicHint: "Reference Queue Governance",
        rawReferenceFiles: [
          "reference/Templetereference/claude-code/runtime-queue.md",
          "reference/plugin/demo-b/queue.js",
        ],
      });

      const records = await listReferenceIntakeRecords(root, { sessionId: "session-b" });
      assert.equal(records.length, 1);
      assert.equal(records[0].thresholdMatched, true);
      assert.equal(records[0].thresholdReasons.distinctReferenceProjectCount, 2);
      assert.equal(records[0].thresholdReasons.projectThresholdMatched, true);
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

  it("should skip docs-only reference routing inputs and keep overall state non-blocking", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-docs-only-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-docs-only-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      writeText(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n");

      await recordReferenceIntake(root, {
        sessionId: "session-c",
        taskId: "task-c",
        topicHint: "Docs Only Route",
        rawReferenceFiles: [
          "docs/REFERENCE_INDEX.md",
          "docs/REFERENCE_PLUGIN_MENU_PATTERNS.md",
        ],
      });

      const records = await listReferenceIntakeRecords(root, { sessionId: "session-c" });
      const state = await loadReferenceDistillationState(root);
      assert.equal(records.length, 1);
      assert.equal(records[0].thresholdMatched, false);
      assert.equal(records[0].status, "skipped");
      assert.equal(state.status, "skipped");
      assert.equal(state.pendingCount, 0);
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
