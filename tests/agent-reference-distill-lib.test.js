import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import { getReferenceIntakeRecord, recordReferenceIntake } from "../scripts/agent-reference-intake-lib.mjs";
import { reviewEphemeralDelegationTask, runEphemeralDelegationTask } from "../scripts/agent-delegation-lib.mjs";
import {
  assertAllowedReferenceWriteTargets,
  assertReferenceDistillationChangedFilesWithinScope,
  evaluateReferenceDistillationChangeScope,
  materializeReferenceDistillationDocs,
  runReferenceDistillation,
} from "../scripts/agent-reference-distill-lib.mjs";

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf-8");
}

function buildSuccessfulReferenceRuntime(root, intakeRecord) {
  return {
    runTask: async (projectRoot, task) => {
      const targetDoc = path.join(projectRoot, task.scopePaths.find((entry) => entry.startsWith("docs/REFERENCE_") && entry !== "docs/REFERENCE_INDEX.md"));
      const existedBefore = fs.existsSync(targetDoc);
      const materialized = await materializeReferenceDistillationDocs(projectRoot, intakeRecord);
      const changedFiles = [
        {
          path: materialized.targetDoc,
          changeType: materialized.createdTopic || !existedBefore ? "added" : "modified",
        },
      ];
      if (materialized.indexUpdated) {
        changedFiles.unshift({
          path: "docs/REFERENCE_INDEX.md",
          changeType: "modified",
        });
      }
      return {
        taskId: task.taskId,
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
      reviewNotes: ["docs-only reference distillation accepted"],
    }),
  };
}

describe("Agent Reference Distill Lib", () => {
  it("should update an existing topic doc instead of creating a duplicate topic", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-distill-update-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-distill-update-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      writeText(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n");
      writeText(path.join(root, "docs", "REFERENCE_PLUGIN_MENU_PATTERNS.md"), [
        "# Plugin Menu Patterns",
        "",
        "原有人工摘要。",
        "",
      ].join("\n"));
      writeText(path.join(root, "reference", "plugin", "demo-menu", "menu.js"), "window.addEventListener('popupshowing', () => menuitem.hidden = false);\n");
      writeText(path.join(root, "reference", "plugin", "demo-menu", "submenu.js"), "function buildSubmenu() { return 'menuitem'; }\n");
      writeText(path.join(root, "reference", "plugin", "demo-menu", "reader.js"), "function renderToolbar() { return true; }\n");

      const intake = await recordReferenceIntake(root, {
        sessionId: "session-update",
        taskId: "task-update",
        topicHint: "Plugin Menu Patterns",
        rawReferenceFiles: [
          "reference/plugin/demo-menu/menu.js",
          "reference/plugin/demo-menu/submenu.js",
          "reference/plugin/demo-menu/reader.js",
        ],
      });
      const run = await runReferenceDistillation(root, {
        intakeId: intake.latestRecord.intakeId,
        ...buildSuccessfulReferenceRuntime(root, intake.latestRecord),
      });
      const topicDoc = readText(path.join(root, "docs", "REFERENCE_PLUGIN_MENU_PATTERNS.md"));

      assert.equal(run.status, "distilled");
      assert.equal(run.createdTopic, false);
      assert.equal(run.indexUpdated, false);
      assert.ok(run.delegationTaskId.startsWith("REFERENCE-DISTILL-PLUGIN_MENU_PATTERNS-"));
      assert.equal(run.reviewStatus, "accepted");
      assert.equal(run.providerResultPresent, true);
      assert.deepEqual(run.delegationProfile.scopePaths, [
        "docs/REFERENCE_PLUGIN_MENU_PATTERNS.md",
        "docs/REFERENCE_INDEX.md",
      ]);
      assert.ok(run.delegationProfile.prompt.includes("REFERENCE_INDEX -> REFERENCE_* -> raw reference/*"));
      assert.deepEqual((run.changedFiles || []).map((item) => item.path), ["docs/REFERENCE_PLUGIN_MENU_PATTERNS.md"]);
      assert.ok(topicDoc.includes("原有人工摘要。"));
      assert.ok(topicDoc.includes("## 自动整理摘要"));
      assert.ok(topicDoc.includes("popupshowing"));
      assert.ok(topicDoc.includes("renderToolbar"));
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

  it("should create a new topic doc and patch REFERENCE_INDEX for a new topic", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-distill-create-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-distill-create-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      writeText(path.join(root, "docs", "REFERENCE_INDEX.md"), [
        "# Reference 路由",
        "",
        "## 当前参考资产",
        "",
        "- 现有专题占位。",
        "",
      ].join("\n"));
      writeText(path.join(root, "reference", "Templetereference", "claude-code", "runtime.md"), "queue worker bridge state store\n");
      writeText(path.join(root, "reference", "plugin", "demo-queue", "service.js"), "enqueue(job); worker.start();\n");

      const intake = await recordReferenceIntake(root, {
        sessionId: "session-create",
        taskId: "task-create",
        topicHint: "Reference Queue Governance",
        rawReferenceFiles: [
          "reference/Templetereference/claude-code/runtime.md",
          "reference/plugin/demo-queue/service.js",
        ],
      });
      const run = await runReferenceDistillation(root, {
        intakeId: intake.latestRecord.intakeId,
        ...buildSuccessfulReferenceRuntime(root, intake.latestRecord),
      });
      const targetDoc = path.join(root, run.targetDoc);
      const indexDoc = readText(path.join(root, "docs", "REFERENCE_INDEX.md"));

      assert.equal(run.status, "distilled");
      assert.equal(run.createdTopic, true);
      assert.equal(run.indexUpdated, true);
      assert.deepEqual(run.delegationProfile.scopePaths, [
        "docs/REFERENCE_QUEUE_GOVERNANCE.md",
        "docs/REFERENCE_INDEX.md",
      ]);
      assert.deepEqual((run.changedFiles || []).map((item) => item.path), [
        "docs/REFERENCE_INDEX.md",
        "docs/REFERENCE_QUEUE_GOVERNANCE.md",
      ]);
      assert.ok(fs.existsSync(targetDoc));
      assert.ok(readText(targetDoc).includes("queue"));
      assert.ok(indexDoc.includes("REFERENCE_QUEUE_GOVERNANCE.md"));
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

  it("should reject any write target outside REFERENCE docs scope", () => {
    assert.throws(() => {
      assertAllowedReferenceWriteTargets([
        "docs/REFERENCE_PLUGIN_MENU_PATTERNS.md",
        "docs/CURRENT_BACKLOG.md",
      ]);
    }, /write scope exceeded/u);
  });

  it("should mark the intake as failed when provider-backed delegation cannot start and should not fallback to local materialization", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-distill-provider-failure-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-distill-provider-failure-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      writeText(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n");

      const intake = await recordReferenceIntake(root, {
        sessionId: "session-provider-failure",
        taskId: "task-provider-failure",
        topicHint: "Plugin Menu Patterns",
        rawReferenceFiles: [
          "reference/plugin/demo-provider/menu.js",
          "reference/plugin/demo-provider/context.js",
          "reference/plugin/demo-provider/reader.js",
        ],
      });

      const run = await runReferenceDistillation(root, {
        intakeId: intake.latestRecord.intakeId,
        runTask: async (projectRoot, task) => ({
          taskId: task.taskId,
          exitCode: null,
          signal: null,
          commandLine: "mco run",
          changedFiles: [],
          outOfScopeFiles: [],
          providerResultPresent: false,
          executionErrorMessage: "spawn mco ENOENT",
        }),
        reviewTask: async () => ({
          reviewStatus: "needs-fix",
          reviewNotes: ["provider unavailable"],
        }),
      });
      const persisted = await getReferenceIntakeRecord(root, intake.latestRecord.intakeId);

      assert.equal(run.status, "failed");
      assert.equal(run.providerResultPresent, false);
      assert.equal(run.reviewStatus, "needs-fix");
      assert.equal(persisted.status, "failed");
      assert.equal(fs.existsSync(path.join(root, "docs", "REFERENCE_PLUGIN_MENU_PATTERNS.md")), false);
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

  it("should fail reference distillation when review rejects out-of-scope raw reference edits", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-distill-review-failure-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-reference-distill-review-failure-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      writeText(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n");
      writeText(path.join(root, "reference", "plugin", "demo-review", "menu.js"), "popupshowing\n");
      writeText(path.join(root, "reference", "plugin", "demo-review", "reader.js"), "renderToolbar\n");
      writeText(path.join(root, "reference", "plugin", "demo-review", "service.js"), "queue worker\n");

      const intake = await recordReferenceIntake(root, {
        sessionId: "session-review-failure",
        taskId: "task-review-failure",
        topicHint: "Plugin Menu Patterns",
        rawReferenceFiles: [
          "reference/plugin/demo-review/menu.js",
          "reference/plugin/demo-review/reader.js",
          "reference/plugin/demo-review/service.js",
        ],
      });

      const run = await runReferenceDistillation(root, {
        intakeId: intake.latestRecord.intakeId,
        runTask: async (projectRoot, task, taskOptions) => await runEphemeralDelegationTask(projectRoot, task, {
          ...taskOptions,
          executeCommand: async () => {
            await materializeReferenceDistillationDocs(projectRoot, intake.latestRecord);
            writeText(path.join(projectRoot, "reference", "plugin", "demo-review", "menu.js"), "popupshowing drifted\n");
            return {
              exitCode: 0,
              signal: null,
              stdout: JSON.stringify({
                status: "completed",
                owner_role: "reference-distill-worker",
                summary: "updated docs and accidentally touched raw reference",
                changed_files: [
                  "docs/REFERENCE_PLUGIN_MENU_PATTERNS.md",
                  "reference/plugin/demo-review/menu.js",
                ],
                checks_run: [],
                risks: ["out-of-scope raw reference edit"],
                blockers: [],
                next_action: "revert raw reference change",
              }),
              stderr: "",
            };
          },
        }),
        reviewTask: async (projectRoot, task, reviewOptions) => await reviewEphemeralDelegationTask(projectRoot, task, reviewOptions),
      });
      const persisted = await getReferenceIntakeRecord(root, intake.latestRecord.intakeId);

      assert.equal(run.status, "failed");
      assert.equal(run.reviewStatus, "rejected");
      assert.deepEqual(run.outOfScopeFiles, ["reference/plugin/demo-review/menu.js"]);
      assert.equal(persisted.status, "failed");
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

  it("should flag raw reference or truth files as out of scope during actual change review", () => {
    const report = evaluateReferenceDistillationChangeScope([
      {
        path: "docs/REFERENCE_PLUGIN_MENU_PATTERNS.md",
        changeType: "modified",
      },
      {
        path: "reference/plugin/demo-menu/menu.js",
        changeType: "modified",
      },
      {
        path: "docs/CURRENT_BACKLOG.md",
        changeType: "modified",
      },
    ], [
      "docs/REFERENCE_PLUGIN_MENU_PATTERNS.md",
    ]);

    assert.equal(report.withinScope, false);
    assert.deepEqual(report.outOfScopeFiles, [
      "docs/CURRENT_BACKLOG.md",
      "reference/plugin/demo-menu/menu.js",
    ]);
    assert.throws(() => {
      assertReferenceDistillationChangedFilesWithinScope([
        {
          path: "reference/plugin/demo-menu/menu.js",
          changeType: "modified",
        },
      ], [
        "docs/REFERENCE_PLUGIN_MENU_PATTERNS.md",
      ]);
    }, /after execution/u);
  });
});
