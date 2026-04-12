import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import { recordReferenceIntake, getReferenceIntakeRecord } from "../scripts/agent-reference-intake-lib.mjs";
import { materializeReferenceDistillationDocs, runReferenceDistillation } from "../scripts/agent-reference-distill-lib.mjs";
import { drainReferenceDistillationQueue } from "../scripts/agent-reference-drain-lib.mjs";

function writeJSON(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function buildSuccessfulReferenceRuntime(intakeRecord) {
  return {
    runTask: async (projectRoot) => {
      const materialized = await materializeReferenceDistillationDocs(projectRoot, intakeRecord);
      const changedFiles = [
        {
          path: materialized.targetDoc,
          changeType: materialized.createdTopic ? "added" : "modified",
        },
      ];
      if (materialized.indexUpdated) {
        changedFiles.unshift({
          path: "docs/REFERENCE_INDEX.md",
          changeType: "modified",
        });
      }
      return {
        taskId: "REFERENCE-DISTILL-TEST",
        exitCode: 0,
        signal: null,
        commandLine: "mco run",
        changedFiles,
        outOfScopeFiles: [],
        providerResultPresent: true,
      };
    },
    reviewTask: async () => ({
      reviewStatus: "accepted",
      reviewNotes: ["accepted"],
    }),
  };
}

describe("Agent Reference Drain Lib", () => {
  it("should keep pending intake untouched when gate or context is not aligned", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-drain-pending-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-drain-pending-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      writeText(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n");
      writeJSON(path.join(artifactsDir, "agent-gate.json"), {
        generatedAt: "2026-04-08T05:00:00.000Z",
        gatePassed: false,
      });
      writeJSON(path.join(artifactsDir, "agent-context.json"), {
        generatedAt: "2026-04-08T05:00:01.000Z",
        runtimeCompact: {
          alignmentRef: {
            status: "repair-required",
            generationStage: "standalone",
          },
        },
      });

      const intake = await recordReferenceIntake(root, {
        sessionId: "session-pending",
        taskId: "task-pending",
        topicHint: "Plugin Menu Patterns",
        rawReferenceFiles: [
          "reference/plugin/demo-a/menu.js",
          "reference/plugin/demo-a/context.js",
          "reference/plugin/demo-a/reader.js",
        ],
      });
      const result = await drainReferenceDistillationQueue(root, {
        background: false,
      });
      const persisted = await getReferenceIntakeRecord(root, intake.latestRecord.intakeId);

      assert.equal(result.status, "pending");
      assert.equal(result.queuedCount, 0);
      assert.equal(result.pendingCount, 1);
      assert.equal(persisted.status, "pending");
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

  it("should queue and run distillation after a settled sync context", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-drain-queue-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-drain-queue-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      writeText(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n\n## 当前参考资产\n");
      writeText(path.join(root, "reference", "plugin", "demo-b", "menu.js"), "popupshowing menuitem\n");
      writeText(path.join(root, "reference", "plugin", "demo-b", "reader.js"), "renderToolbar\n");
      writeText(path.join(root, "reference", "plugin", "demo-b", "service.js"), "queue worker\n");
      writeJSON(path.join(artifactsDir, "agent-gate.json"), {
        generatedAt: "2026-04-08T05:10:00.000Z",
        gatePassed: true,
      });
      writeJSON(path.join(artifactsDir, "agent-context.json"), {
        generatedAt: "2026-04-08T05:10:01.000Z",
        runtimeCompact: {
          alignmentRef: {
            status: "aligned",
            generationStage: "post-gate",
          },
        },
      });

      const intake = await recordReferenceIntake(root, {
        sessionId: "session-queue",
        taskId: "task-queue",
        topicHint: "Plugin Menu Patterns",
        rawReferenceFiles: [
          "reference/plugin/demo-b/menu.js",
          "reference/plugin/demo-b/reader.js",
          "reference/plugin/demo-b/service.js",
        ],
      });
      const result = await drainReferenceDistillationQueue(root, {
        background: false,
        runReferenceDistillation: async (projectRoot, distillOptions) => await runReferenceDistillation(projectRoot, {
          ...distillOptions,
          ...buildSuccessfulReferenceRuntime(intake.latestRecord),
        }),
      });
      const persisted = await getReferenceIntakeRecord(root, intake.latestRecord.intakeId);

      assert.equal(result.status, "distilled");
      assert.equal(result.queuedCount, 1);
      assert.equal(result.queued[0].mode, "foreground");
      assert.equal(persisted.status, "distilled");
      assert.ok(fs.existsSync(path.join(root, "docs", "REFERENCE_PLUGIN_MENU_PATTERNS.md")));
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

  it("should skip duplicate same-topic same-session inputs when the same source was already distilled", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-drain-duplicate-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-drain-duplicate-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      writeText(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n\n## 当前参考资产\n");
      writeText(path.join(root, "reference", "plugin", "demo-c", "menu.js"), "popupshowing menuitem renderToolbar queue\n");
      writeText(path.join(root, "reference", "plugin", "demo-c", "reader.js"), "renderToolbar\n");
      writeText(path.join(root, "reference", "plugin", "demo-c", "service.js"), "queue worker\n");
      writeJSON(path.join(artifactsDir, "agent-gate.json"), {
        generatedAt: "2026-04-08T05:20:00.000Z",
        gatePassed: true,
      });
      writeJSON(path.join(artifactsDir, "agent-context.json"), {
        generatedAt: "2026-04-08T05:20:01.000Z",
        runtimeCompact: {
          alignmentRef: {
            status: "aligned",
            generationStage: "post-gate",
          },
        },
      });

      const first = await recordReferenceIntake(root, {
        sessionId: "session-dup",
        taskId: "task-dup-a",
        topicHint: "Plugin Menu Patterns",
        rawReferenceFiles: [
          "reference/plugin/demo-c/menu.js",
          "reference/plugin/demo-c/reader.js",
          "reference/plugin/demo-c/service.js",
        ],
      });
      await runReferenceDistillation(root, {
        intakeId: first.latestRecord.intakeId,
        ...buildSuccessfulReferenceRuntime(first.latestRecord),
      });

      const second = await recordReferenceIntake(root, {
        sessionId: "session-dup",
        taskId: "task-dup-b",
        topicHint: "Plugin Menu Patterns",
        rawReferenceFiles: [
          "reference/plugin/demo-c/menu.js",
          "reference/plugin/demo-c/reader.js",
          "reference/plugin/demo-c/service.js",
        ],
      });
      const result = await drainReferenceDistillationQueue(root, {
        background: false,
      });
      const persisted = await getReferenceIntakeRecord(root, second.latestRecord.intakeId);

      assert.equal(result.queuedCount, 0);
      assert.equal(result.skippedCount, 1);
      assert.equal(persisted.status, "skipped");
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

  it("should keep background distillation advisory-only by leaving intake queued after scheduling", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-drain-background-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-drain-background-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      writeText(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n");
      writeJSON(path.join(artifactsDir, "agent-gate.json"), {
        generatedAt: "2026-04-08T05:30:00.000Z",
        gatePassed: true,
      });
      writeJSON(path.join(artifactsDir, "agent-context.json"), {
        generatedAt: "2026-04-08T05:30:01.000Z",
        runtimeCompact: {
          alignmentRef: {
            status: "aligned",
            generationStage: "post-gate",
          },
        },
      });

      const intake = await recordReferenceIntake(root, {
        sessionId: "session-background",
        taskId: "task-background",
        topicHint: "Plugin Menu Patterns",
        rawReferenceFiles: [
          "reference/plugin/demo-background/menu.js",
          "reference/plugin/demo-background/context.js",
          "reference/plugin/demo-background/reader.js",
        ],
      });
      const result = await drainReferenceDistillationQueue(root, {
        background: true,
        scheduleBackground: async () => ({
          mode: "background",
          pid: 4242,
        }),
      });
      const persisted = await getReferenceIntakeRecord(root, intake.latestRecord.intakeId);

      assert.equal(result.status, "queued");
      assert.equal(result.queuedCount, 1);
      assert.equal(result.queued[0].pid, 4242);
      assert.equal(persisted.status, "queued");
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
