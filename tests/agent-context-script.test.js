import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, assert, beforeEach, afterEach } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
let artifactsDir = null;
let obsidianDir = null;

function artifactPath(...parts) {
  return path.join(artifactsDir, ...parts);
}

function scriptEnv() {
  return {
    ...process.env,
    AGENT_ARTIFACTS_DIR: artifactsDir,
    AGENT_OBSIDIAN_DIR: obsidianDir,
  };
}

function execNode(args) {
  return execFileSync("node", args, {
    cwd: projectRoot,
    stdio: "pipe",
    env: scriptEnv(),
  });
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf-8");
}

function writeJSON(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function buildMinimalMonitorSummary(overrides = {}) {
  return {
    generatedAt: "2026-04-03T00:10:00.000Z",
    total: 1,
    passed: 1,
    failed: 0,
    passRate: 100,
    averageDurationMs: 25,
    runs: [
      {
        runName: "check",
        success: true,
        exitCode: 0,
        status: "passed",
        startedAtISO: "2026-04-03T00:09:00.000Z",
      },
    ],
    frontpageSummary: {
      status: "stable",
      statusLabel: "稳定",
      headline: "当前 monitor 结论稳定。",
      nextAction: "npm run agent:gate",
      primarySignals: [],
      watch: {
        status: "healthy",
        statusLabel: "健康",
        ageText: "1 分钟",
      },
      e2e: {
        status: "missing",
        statusLabel: "缺失",
        ageText: "-",
      },
      autofix: {
        status: "missing",
        statusLabel: "缺失",
        ageText: "-",
      },
      watchRecovery: {
        status: "missing",
        statusLabel: "缺失",
        ageText: "-",
      },
    },
    validationContext: {
      reviewWindowCount: 0,
      changedPaths: ["scripts/agent-context-lib.mjs"],
      reviewSummary: {
        accepted: 0,
        reworkedByCodex: 0,
        blocked: 0,
      },
    },
    validationDecision: {
      level: "visual-not-needed",
      levelLabel: "无需视觉验证",
      decisionSource: "validation-domain",
      matchedDomain: ["runtime-config"],
      matchedProjectOverride: [],
      requiredChecks: ["先执行 `npm run check`。"],
      requiredEvidence: ["补齐最近的 `agent:monitor` / `agent:gate` 工件。"],
      deferredEvidenceAction: null,
      escalatedByRuntimeSignals: false,
    },
    ...overrides,
  };
}

describe("Agent Context Scripts", () => {
  beforeEach(() => {
    artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-agent-context-"));
    obsidianDir = path.join(artifactsDir, "obsidian-workbench");
  });

  afterEach(() => {
    if (artifactsDir && fs.existsSync(artifactsDir)) {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
    artifactsDir = null;
    obsidianDir = null;
  });

  it("should generate a minimal agent-context artifact from truth and monitor only", () => {
    writeJSON(artifactPath("agent-monitor.json"), buildMinimalMonitorSummary());

    execNode(["scripts/agent-context.mjs"]);

    const contextJSON = readJSON(artifactPath("agent-context.json"));
    const contextMD = readText(artifactPath("agent-context.md"));
    assert.equal(contextJSON.schemaVersion, 2);
    assert.equal(contextJSON.sourceAlignment.status, "repair-required");
    assert.equal(contextJSON.sourceAlignment.preferredRepairCommand, "npm run agent:gate");
    assert.ok(contextJSON.sourceFreshness.currentTruthUpdatedAt);
    assert.equal(contextJSON.runtimeCompact.budgetMeta.profile, "runtime-compact-v1");
    assert.equal(contextJSON.runtimeCompact.alignmentRef.status, "repair-required");
    assert.equal(contextJSON.runtimeCompact.artifactRefs.currentTruth, "docs/CURRENT_BACKLOG.md");
    assert.equal(contextJSON.runtimeCompact.referenceDistillationRef.status, "idle");
    assert.equal(contextJSON.dynamicContext.memory.present, false);
    assert.equal(contextJSON.dynamicContext.gate.present, false);
    assert.ok(contextMD.includes("## Runtime Compact"));
    assert.ok(contextMD.includes("Full Evidence Pointers"));
    assert.ok(contextMD.includes("缺少 agent-memory 工件"));
    assert.ok(contextMD.includes("缺少 agent-gate 工件"));
  });

  it("should keep gate verdict semantics unchanged after agent-context is introduced", () => {
    writeJSON(artifactPath("agent-monitor.json"), buildMinimalMonitorSummary());

    try {
      execNode(["scripts/agent-gate.mjs", "--min-pass-rate", "0", "--max-recent-failed", "999"]);
    } catch {
      // blocked gate is expected in this minimal setup
    }
    const firstGate = readJSON(artifactPath("agent-gate.json"));

    execNode(["scripts/agent-context.mjs"]);
    try {
      execNode(["scripts/agent-gate.mjs", "--min-pass-rate", "0", "--max-recent-failed", "999"]);
    } catch {
      // blocked gate is expected in this minimal setup
    }
    const secondGate = readJSON(artifactPath("agent-gate.json"));
    const secondContext = readJSON(artifactPath("agent-context.json"));

    assert.equal(firstGate.gatePassed, secondGate.gatePassed);
    assert.equal(firstGate.frontpageSummary?.nextAction, secondGate.frontpageSummary?.nextAction);
    assert.equal(secondGate.agentContext?.present, true);
    assert.equal(secondContext.sourceAlignment.status, "repair-required");
    assert.equal(secondContext.sourceAlignment.generationStage, "post-gate");
    assert.equal(secondContext.sourceAlignment.preferredRepairCommand, "npm run agent:memory");
    assert.equal(secondContext.sourceFreshness.gateGeneratedAt, secondGate.generatedAt);
  });

  it("should surface a unified current-context block in the obsidian handoff", () => {
    writeJSON(artifactPath("agent-monitor.json"), buildMinimalMonitorSummary());
    writeJSON(artifactPath("agent-gate.json"), {
      generatedAt: "2026-04-03T00:12:00.000Z",
      gatePassed: false,
      frontpageSummary: {
        status: "blocked",
        statusLabel: "需先处理",
        headline: "缺少 watch 工件。",
        nextAction: "npm run zotero:watch",
        primaryBlockers: ["缺少 watch 工件。"],
      },
      issues: ["缺少 watch 工件。"],
      recommendations: ["先执行 `npm run zotero:watch`。"],
    });

    execNode(["scripts/agent-context.mjs"]);
    execNode(["scripts/agent-obsidian-handoff.mjs"]);

    const statusNote = readText(path.join(obsidianDir, "01-当前Zotero插件-状态总览.md"));
    const evidenceNote = readText(path.join(obsidianDir, "02-当前Zotero插件-证据索引.md"));
    const handoff = readJSON(artifactPath("agent-obsidian-handoff.json"));
    assert.ok(statusNote.includes("## 当前开发上下文"));
    assert.ok(statusNote.includes("Compact Profile"));
    assert.ok(statusNote.includes("agent_context_digest:"));
    assert.ok(evidenceNote.includes("[[dist/agent-context.md]]"));
    assert.equal(typeof handoff.sourceAgentContextDigest, "string");
  });

  it("should keep agent-context guard in warning mode by default", () => {
    writeJSON(artifactPath("agent-monitor.json"), buildMinimalMonitorSummary());
    writeJSON(artifactPath("agent-context.json"), {
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
          currentWaveName: "ZOTERO-HOST-WAVE-001",
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
        mainBlocker: "等待人工复核。",
        recommendedEvidence: [],
      },
      driftSignals: {
        status: "clear",
        warningCount: 0,
        signals: [],
      },
    });

    const output = String(execNode(["scripts/agent-context-guard.mjs"]));
    assert.ok(output.includes("Agent context guard (warn): warning"));
    assert.ok(output.includes("Recommendation:"));
  });
});
