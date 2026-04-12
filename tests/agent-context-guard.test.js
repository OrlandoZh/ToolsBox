import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  buildAgentContextGuardIssue,
  buildAgentContextGuardRecommendation,
  evaluateAgentContextGuard,
} from "../scripts/agent-context-guard-lib.mjs";

function writeJSON(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function writeCurrentTruth(rootDir, lines = []) {
  fs.mkdirSync(path.join(rootDir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "docs", "CURRENT_BACKLOG.md"), [
    "# 当前剩余任务清单",
    "",
    "## 当前单一事实源",
    "",
    "<!-- CURRENT-TRUTH-SUMMARY:START -->",
    ...lines,
    "<!-- CURRENT-TRUTH-SUMMARY:END -->",
    "",
    "<!-- CURRENT-TRUTH-META:START -->",
    JSON.stringify({
      schemaVersion: 1,
      activeBatchId: "ENG-HIGH-104",
      currentWaveName: "WAVE-1",
      acceptanceTrack: "functional-first",
    }, null, 2),
    "<!-- CURRENT-TRUTH-META:END -->",
    "",
  ].join("\n"), "utf-8");
}

function writeProjectMirrors(rootDir, options = {}) {
  writeJSON(path.join(rootDir, "config", "project-expansion-wave.json"), {
    schemaVersion: 1,
    status: "active",
    currentWaveName: options.currentWaveName || "WAVE-1",
    acceptanceTrack: options.acceptanceTrack || "functional-first",
    inScopeModules: ["surface-smoke"],
    explicitVisualUpgradeModules: ["surface-smoke"],
  });
  writeJSON(path.join(rootDir, "config", "project-validation-overrides.json"), {
    schemaVersion: 1,
    summary: options.overrideSummary || "Project-local validation overrides for WAVE-1.",
    overrides: [],
  });
}

function writeMonitor(rootDir, overrides = {}) {
  writeJSON(path.join(rootDir, "dist", "agent-monitor.json"), {
    generatedAt: "2026-04-03T00:10:00.000Z",
    frontpageSummary: {
      status: "stable",
      statusLabel: "稳定",
      headline: "当前 monitor 结论稳定。",
      nextAction: "npm run agent:gate",
      primarySignals: [],
    },
    ...overrides,
  });
}

describe("Agent Context Guard", () => {
  it("should warn when saved nextAction conflicts with the latest monitor conclusion", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-context-guard-"));
    try {
      writeCurrentTruth(root, [
        "- 当前已显式进入 `WAVE-1`：保持 host-first 路径。",
        "- 当前验收主线：`functional-first`",
        "- 当前主线为 `ENG-HIGH-104`",
      ]);
      writeProjectMirrors(root);
      writeMonitor(root);
      writeJSON(path.join(root, "dist", "agent-context.json"), {
        schemaVersion: 2,
        generatedAt: "2026-04-03T00:05:00.000Z",
        sourceFreshness: {
          currentTruthUpdatedAt: "2026-04-03T00:00:00.000Z",
          monitorGeneratedAt: "2026-04-03T00:05:00.000Z",
          gateGeneratedAt: null,
          memoryGeneratedAt: null,
        },
        stableContext: {
          stableContextKey: "stable-test",
          expansionWave: {
            currentWaveName: "WAVE-1",
          },
        },
        dynamicContext: {
          dynamicFingerprint: "dynamic-test",
        },
        sourceAlignment: {
          status: "standalone",
          generationStage: "standalone",
          preferredRepairCommand: "npm run agent:gate",
          warningKinds: [],
        },
        decisionHints: {
          nextAction: "npm run agent:obsidian",
          mainBlocker: "需要人工复核。",
          recommendedEvidence: [],
        },
        driftSignals: {
          status: "clear",
          warningCount: 0,
          signals: [],
        },
      });

      const result = await evaluateAgentContextGuard(root);
      assert.equal(result.status, "warning");
      assert.equal(result.violation, false);
      assert.ok(result.warnings.some((item) => item.kind === "next-action-conflict"));
      assert.ok(typeof buildAgentContextGuardIssue(result) === "string");
      assert.ok(String(buildAgentContextGuardRecommendation(result) || "").includes("agent:context"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("should warn when agent-context misses required top-level sections", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-context-missing-"));
    try {
      writeCurrentTruth(root, [
        "- 当前已显式进入 `WAVE-1`：保持 host-first 路径。",
        "- 当前验收主线：`functional-first`",
      ]);
      writeProjectMirrors(root);
      writeMonitor(root);
      writeJSON(path.join(root, "dist", "agent-context.json"), {
        generatedAt: "2026-04-03T00:05:00.000Z",
      });

      const result = await evaluateAgentContextGuard(root);
      assert.equal(result.status, "warning");
      assert.ok(result.warnings.some((item) => item.kind === "missing-required-section"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("should warn when runtime compact inlines full summaries or exceeds budget", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-context-compact-inline-"));
    try {
      writeCurrentTruth(root, [
        "- 当前已显式进入 `WAVE-1`：保持 host-first 路径。",
        "- 当前验收主线：`functional-first`",
        "- 当前主线为 `ENG-HIGH-104`",
      ]);
      writeProjectMirrors(root);
      writeMonitor(root);
      writeJSON(path.join(root, "dist", "agent-context.json"), {
        schemaVersion: 2,
        generatedAt: "2026-04-03T00:10:00.000Z",
        sourceFreshness: {
          currentTruthUpdatedAt: "2026-04-03T00:00:00.000Z",
          monitorGeneratedAt: "2026-04-03T00:10:00.000Z",
          gateGeneratedAt: "2026-04-03T00:10:00.000Z",
          memoryGeneratedAt: "2026-04-03T00:10:00.000Z",
        },
        stableContext: {
          stableContextKey: "stable-test",
          currentTruth: {
            summary: "这是一段完整 current truth summary，不应该回灌到 compact view。",
          },
          expansionWave: {
            currentWaveName: "WAVE-1",
          },
        },
        dynamicContext: {
          dynamicFingerprint: "dynamic-test",
          monitor: {
            summary: "这是一段 monitor summary，不应该重新内联。",
          },
          memory: {
            summary: "这是一段 memory summary，不应该重新内联。",
          },
          gate: {
            summary: "这是一段 gate summary，不应该重新内联。",
          },
        },
        sourceAlignment: {
          status: "repair-required",
          generationStage: "standalone",
          preferredRepairCommand: "npm run agent:gate",
          warningKinds: ["freshness-mismatch"],
        },
        decisionHints: {
          nextAction: "npm run agent:gate",
          mainBlocker: "需要补齐最新工件。",
          recommendedEvidence: [
            "evidence-1",
            "evidence-2",
            "evidence-3",
            "evidence-4",
          ],
        },
        driftSignals: {
          status: "warning",
          warningCount: 3,
          signals: [
            { status: "warning", severity: "warning", message: "warning-1" },
            { status: "warning", severity: "warning", message: "warning-2" },
            { status: "warning", severity: "warning", message: "warning-3" },
          ],
        },
        runtimeCompact: {
          truthRef: {
            activeBatchId: "ENG-HIGH-104",
            currentWaveName: "WAVE-1",
            validationLevel: "无需视觉验证",
            leakedSummary: "这是一段完整 current truth summary，不应该回灌到 compact view。",
          },
          alignmentRef: {
            status: "repair-required",
            generationStage: "standalone",
          },
          actionRef: {
            nextAction: "npm run agent:gate",
            mainBlocker: "需要补齐最新工件。",
          },
          statusRef: {
            stableContextKey: "stable-test",
            dynamicFingerprint: "dynamic-test",
            monitorStatus: "稳定",
            gateStatus: "稳定",
            memoryFingerprint: "reader-ui:visual-drift",
            releaseStatus: "待验证",
          },
          driftRef: {
            status: "warning",
            warningCount: 3,
            warnings: ["warning-1", "warning-2", "warning-3"],
          },
          evidenceRefs: ["evidence-1", "evidence-2", "evidence-3", "evidence-4"],
          artifactRefs: {
            currentTruth: "docs/CURRENT_BACKLOG.md",
            monitor: "dist/agent-monitor.json",
            gate: "dist/agent-gate.json",
          },
          freshness: {
            currentTruthUpdatedAt: "2026-04-03T00:00:00.000Z",
            monitorGeneratedAt: "2026-04-03T00:10:00.000Z",
            gateGeneratedAt: "2026-04-03T00:10:00.000Z",
            memoryGeneratedAt: "2026-04-03T00:10:00.000Z",
          },
          budgetMeta: {
            profile: "runtime-compact-v1",
            digest: "digest-test",
          },
        },
      });

      const result = await evaluateAgentContextGuard(root);
      assert.equal(result.status, "warning");
      assert.ok(result.warnings.some((item) => item.kind === "compaction-inline-summary"));
      assert.ok(result.warnings.some((item) => item.kind === "missing-artifact-refs"));
      assert.ok(result.warnings.some((item) => item.id === "runtime-compact-missing-reference-distillation-refs"));
      assert.ok(result.warnings.some((item) => item.kind === "budget-exceeded"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("should not treat pending reference distillation as a blocker when the compact schema is intact", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-context-reference-pending-"));
    try {
      writeCurrentTruth(root, [
        "- 当前已显式进入 `WAVE-1`：保持 host-first 路径。",
        "- 当前验收主线：`functional-first`",
      ]);
      writeProjectMirrors(root);
      writeMonitor(root);
      writeJSON(path.join(root, "dist", "agent-context.json"), {
        schemaVersion: 2,
        generatedAt: "2026-04-03T00:10:00.000Z",
        sourceFreshness: {
          currentTruthUpdatedAt: "2026-04-03T00:00:00.000Z",
          monitorGeneratedAt: "2026-04-03T00:10:00.000Z",
          gateGeneratedAt: null,
          memoryGeneratedAt: null,
        },
        stableContext: {
          stableContextKey: "stable-test",
          expansionWave: {
            currentWaveName: "WAVE-1",
          },
        },
        dynamicContext: {
          dynamicFingerprint: "dynamic-test",
          referenceDistillation: {
            status: "pending",
            pendingCount: 1,
            lastTopic: "Plugin Menu Patterns",
            lastDistilledAt: "2026-04-03T00:08:00.000Z",
            nextSuggestedAction: "npm run agent:sync",
          },
        },
        sourceAlignment: {
          status: "repair-required",
          generationStage: "standalone",
          preferredRepairCommand: "npm run agent:gate",
          warningKinds: [],
        },
        decisionHints: {
          nextAction: "npm run agent:gate",
          mainBlocker: "需要补齐最新工件。",
          recommendedEvidence: [],
        },
        driftSignals: {
          status: "clear",
          warningCount: 0,
          signals: [],
        },
        runtimeCompact: {
          truthRef: {
            activeBatchId: "ENG-HIGH-104",
            currentWaveName: "WAVE-1",
            validationLevel: "无需视觉验证",
          },
          alignmentRef: {
            status: "repair-required",
            generationStage: "standalone",
          },
          actionRef: {
            nextAction: "npm run agent:gate",
            mainBlocker: "需要补齐最新工件。",
          },
          statusRef: {
            stableContextKey: "stable-test",
            dynamicFingerprint: "dynamic-test",
            monitorStatus: "稳定",
            gateStatus: "缺失",
            memoryFingerprint: null,
            releaseStatus: "缺失",
          },
          driftRef: {
            status: "clear",
            warningCount: 0,
            warnings: [],
          },
          referenceDistillationRef: {
            status: "pending",
            pendingCount: 1,
            lastTopic: "Plugin Menu Patterns",
            lastDistilledAt: "2026-04-03T00:08:00.000Z",
            nextSuggestedAction: "npm run agent:sync",
          },
          evidenceRefs: [],
          artifactRefs: {
            currentTruth: "docs/CURRENT_BACKLOG.md",
            monitor: "dist/agent-monitor.json",
            gate: "dist/agent-gate.json",
            memory: "dist/agent-memory.json",
            referenceIntake: "dist/agent-reference-intake/index.json",
            referenceDistill: "dist/agent-reference-distill/latest.json",
            contextJSON: "dist/agent-context.json",
            contextMarkdown: "dist/agent-context.md",
          },
          freshness: {
            currentTruthUpdatedAt: "2026-04-03T00:00:00.000Z",
            monitorGeneratedAt: "2026-04-03T00:10:00.000Z",
            gateGeneratedAt: null,
            memoryGeneratedAt: null,
          },
          budgetMeta: {
            profile: "runtime-compact-v1",
            digest: "digest-test",
            withinBudget: true,
            violationCount: 0,
            violations: [],
          },
        },
      });

      const result = await evaluateAgentContextGuard(root);
      assert.equal(result.warnings.some((item) => String(item.id || "").includes("reference-distillation")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
