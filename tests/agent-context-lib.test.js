import { describe, it, assert } from "./test-framework.js";
import {
  buildAgentContext,
  buildRuntimeCompactView,
  evaluateAgentContextDrift,
  evaluateRuntimeCompactBudget,
  renderAgentContextMarkdown,
  summarizeAgentContextSnapshot,
} from "../scripts/agent-context-lib.mjs";

function buildCurrentTruth(overrides = {}) {
  return {
    present: true,
    sourceFile: "docs/CURRENT_BACKLOG.md",
    updatedAt: "2026-04-03T00:00:00.000Z",
    meta: {
      schemaVersion: 1,
      activeBatchId: "ENG-HIGH-104",
      currentWaveName: "WAVE-1",
      acceptanceTrack: "functional-first",
    },
    activeBatchId: "ENG-HIGH-104",
    currentWaveNameFromTruth: "WAVE-1",
    acceptanceTrackFromTruth: "functional-first",
    summary: [
      "- 当前已显式进入 `WAVE-1`：保持 host-first 路径。",
      "- 当前验收主线：`functional-first`",
      "- 当前主线为 `ENG-HIGH-104`",
    ].join("\n"),
    excerpt: [
      "当前已显式进入 `WAVE-1`：保持 host-first 路径。",
      "当前验收主线：`functional-first`",
    ],
    ...overrides,
  };
}

function buildExpansionWave(overrides = {}) {
  return {
    schemaVersion: 1,
    status: "active",
    currentWaveName: "WAVE-1",
    acceptanceTrack: "functional-first",
    inScopeModules: ["host-action-runner", "surface-smoke"],
    outOfScopeModules: ["release-remote-distribution"],
    explicitVisualUpgradeModules: ["surface-smoke"],
    moduleArchetypes: [
      { module: "host-action-runner", archetype: "host-integration" },
    ],
    ...overrides,
  };
}

function buildValidationOverrides(overrides = {}) {
  return {
    schemaVersion: 1,
    summary: "Project-local validation overrides for WAVE-1.",
    overrides: [
      {
        id: "wave-1-visible-surface",
        decision: "visual-required",
        pathMatchers: ["^src/features/reader(?:/|\\.|$)"],
      },
    ],
    ...overrides,
  };
}

function buildMonitor(overrides = {}) {
  return {
    generatedAt: "2026-04-03T00:10:00.000Z",
    frontpageSummary: {
      status: "attention",
      statusLabel: "需关注",
      headline: "需要补齐真机验证。",
      nextAction: "npm run agent:zotero:e2e",
      primarySignals: ["需要补齐真机验证。"],
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
      watchRecovery: {
        status: "passed",
        statusLabel: "通过",
        ageText: "1 分钟",
      },
    },
    validationContext: {
      reviewWindowCount: 1,
      changedPaths: ["scripts/agent-context-lib.mjs"],
      reviewSummary: {
        accepted: 1,
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
    releaseMatrix: {
      status: "pending",
      statusLabel: "待验证",
      summary: "远端 update.json 尚未验证。",
      remoteVerification: {
        status: "pending",
        statusLabel: "待验证",
        summary: "等待远端分发验证。",
      },
    },
    ...overrides,
  };
}

function buildMemory(overrides = {}) {
  return {
    generatedAt: "2026-04-03T00:12:00.000Z",
    currentIncident: {
      fingerprint: "reader-ui:visual-drift",
      featureLabel: "Reader 视觉回归",
      context: {
        contextSummary: "hot-reload / zotero-8",
      },
      candidateFiles: ["src/features/reader.js"],
      recentReasons: [{ label: "截图几何不一致" }],
      preferredStrategy: {
        strategyLabel: "rerun-e2e",
        contextMatchLevel: "exact-context",
      },
    },
    recommendation: {
      title: "先重跑真机",
      nextAction: "npm run agent:zotero:e2e",
      confidence: "high",
      summary: "当前上下文已命中 hot-reload 样本，建议先重跑真机。",
      candidateFiles: ["src/features/reader.js"],
    },
    ...overrides,
  };
}

function buildGate(overrides = {}) {
  return {
    generatedAt: "2026-04-03T00:15:00.000Z",
    gatePassed: false,
    issues: ["最近 Zotero E2E 未通过：失败。"],
    recommendations: ["先执行 `npm run agent:zotero:e2e`。"],
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
    frontpageSummary: {
      status: "blocked",
      statusLabel: "需先处理",
      headline: "最近 Zotero E2E 未通过：失败。",
      nextAction: "npm run agent:zotero:e2e",
      primaryBlockers: ["最近 Zotero E2E 未通过：失败。"],
    },
    ...overrides,
  };
}

function buildReferenceDistillation(overrides = {}) {
  return {
    status: "pending",
    statusLabel: "待整理",
    summary: "reference distillation pending（1）",
    pendingCount: 1,
    lastTopic: "Plugin Menu Patterns",
    lastDistilledAt: "2026-04-03T00:09:00.000Z",
    nextSuggestedAction: "npm run agent:sync",
    ...overrides,
  };
}

describe("Agent Context Lib", () => {
  it("should keep stableContextKey tied to governance state instead of runtime outcomes", () => {
    const sources = {
      currentTruth: buildCurrentTruth(),
      projectExpansionWave: buildExpansionWave(),
      projectValidationOverrides: buildValidationOverrides(),
      monitor: buildMonitor(),
      memory: buildMemory(),
      gate: buildGate(),
    };
    const first = buildAgentContext(sources);
    const second = buildAgentContext({
      ...sources,
      monitor: buildMonitor({
        generatedAt: "2026-04-03T00:20:00.000Z",
        frontpageSummary: {
          ...buildMonitor().frontpageSummary,
          headline: "新的 monitor 结论。",
          nextAction: "npm run agent:gate",
        },
      }),
    });

    assert.equal(first.stableContext.stableContextKey, second.stableContext.stableContextKey);
    assert.ok(first.dynamicContext.dynamicFingerprint !== second.dynamicContext.dynamicFingerprint);
  });

  it("should change dynamicFingerprint when memory or gate changes", () => {
    const sources = {
      currentTruth: buildCurrentTruth(),
      projectExpansionWave: buildExpansionWave(),
      projectValidationOverrides: buildValidationOverrides(),
      monitor: buildMonitor(),
      memory: buildMemory(),
      gate: buildGate(),
    };
    const first = buildAgentContext(sources);
    const second = buildAgentContext({
      ...sources,
      memory: buildMemory({
        generatedAt: "2026-04-03T00:18:00.000Z",
        recommendation: {
          title: "改走 obsidian",
          nextAction: "npm run agent:obsidian",
          confidence: "medium",
          summary: "当前建议先人工固化证据。",
          candidateFiles: ["dist/agent-context.md"],
        },
      }),
    });

    assert.ok(first.dynamicContext.dynamicFingerprint !== second.dynamicContext.dynamicFingerprint);
  });

  it("should render explicit placeholders when memory or gate inputs are missing", () => {
    const context = buildAgentContext({
      currentTruth: buildCurrentTruth(),
      projectExpansionWave: buildExpansionWave(),
      projectValidationOverrides: buildValidationOverrides(),
      monitor: buildMonitor(),
      memory: null,
      gate: null,
    });
    const markdown = renderAgentContextMarkdown(context);

    assert.equal(context.dynamicContext.memory.present, false);
    assert.equal(context.dynamicContext.gate.present, false);
    assert.ok(markdown.includes("缺少 agent-memory 工件"));
    assert.ok(markdown.includes("缺少 agent-gate 工件"));
  });

  it("should build runtime compact view without inlining full truth or runtime summaries", () => {
    const context = buildAgentContext({
      currentTruth: buildCurrentTruth(),
      projectExpansionWave: buildExpansionWave(),
      projectValidationOverrides: buildValidationOverrides(),
      monitor: buildMonitor(),
      memory: buildMemory(),
      gate: buildGate(),
    });
    const compact = buildRuntimeCompactView(context);
    const compactValues = JSON.stringify(compact);

    assert.equal(compact.truthRef.activeBatchId, "ENG-HIGH-104");
    assert.equal(compact.truthRef.currentWaveName, "WAVE-1");
    assert.equal(compact.truthRef.validationLevel, "无需视觉验证");
    assert.equal(compact.alignmentRef.status, "standalone");
    assert.equal(compact.alignmentRef.generationStage, "standalone");
    assert.equal(compact.alignmentRef.preferredRepairCommand, "npm run agent:gate");
    assert.equal(compact.actionRef.nextAction, "npm run agent:zotero:e2e");
    assert.equal(compact.statusRef.monitorStatus, "需关注");
    assert.equal(compact.statusRef.gateStatus, "需先处理");
    assert.equal(compact.statusRef.memoryFingerprint, "reader-ui:visual-drift");
    assert.equal(compact.evidenceRefs.length <= 3, true);
    assert.equal(compact.artifactRefs.currentTruth, "docs/CURRENT_BACKLOG.md");
    assert.equal(compact.artifactRefs.monitor, "dist/agent-monitor.json");
    assert.equal(compact.artifactRefs.gate, "dist/agent-gate.json");
    assert.equal(compact.artifactRefs.memory, "dist/agent-memory.json");
    assert.equal(compact.artifactRefs.referenceIntake, "dist/agent-reference-intake/index.json");
    assert.equal(compact.artifactRefs.referenceDistill, "dist/agent-reference-distill/latest.json");
    assert.equal(compact.referenceDistillationRef.status, "idle");
    assert.equal(compact.referenceDistillationRef.pendingCount, 0);
    assert.equal(compactValues.includes(context.stableContext.currentTruth.summary), false);
    assert.equal(compactValues.includes(context.dynamicContext.monitor.summary), false);
    assert.equal(compactValues.includes(context.dynamicContext.memory.summary), false);
    assert.equal(compactValues.includes(context.dynamicContext.gate.summary), false);
  });

  it("should keep runtime compact within the fixed field budgets", () => {
    const context = buildAgentContext({
      currentTruth: buildCurrentTruth(),
      projectExpansionWave: buildExpansionWave(),
      projectValidationOverrides: buildValidationOverrides(),
      monitor: buildMonitor(),
      memory: buildMemory(),
      gate: buildGate(),
    });
    const compact = buildRuntimeCompactView(context);
    const budget = evaluateRuntimeCompactBudget(compact);

    assert.equal(budget.withinBudget, true);
    assert.equal(budget.violationCount, 0);
    assert.equal(Array.isArray(compact.driftRef.warnings), true);
    assert.equal(compact.driftRef.warnings.length <= 2, true);
    assert.equal(compact.evidenceRefs.length <= 3, true);
    assert.ok(String(compact.budgetMeta.digest || "").length > 0);
  });

  it("should summarize agent context snapshots through runtime compact view", () => {
    const context = buildAgentContext({
      currentTruth: buildCurrentTruth(),
      projectExpansionWave: buildExpansionWave(),
      projectValidationOverrides: buildValidationOverrides(),
      monitor: buildMonitor(),
      memory: buildMemory(),
      gate: buildGate(),
    });
    const snapshot = summarizeAgentContextSnapshot(context);

    assert.equal(snapshot.truthRef.activeBatchId, "ENG-HIGH-104");
    assert.equal(snapshot.alignmentRef.status, "standalone");
    assert.equal(snapshot.actionRef.nextAction, "npm run agent:zotero:e2e");
    assert.equal(snapshot.statusRef.gateStatus, "需先处理");
    assert.equal(snapshot.driftRef.status, "clear");
    assert.equal(snapshot.artifactRefs.contextJSON, "dist/agent-context.json");
    assert.equal(snapshot.budgetMeta.profile, "runtime-compact-v1");
    assert.equal(snapshot.referenceDistillationRef.status, "idle");
  });

  it("should expose reference distillation advisory in dynamic and compact context", () => {
    const context = buildAgentContext({
      currentTruth: buildCurrentTruth(),
      projectExpansionWave: buildExpansionWave(),
      projectValidationOverrides: buildValidationOverrides(),
      monitor: buildMonitor(),
      memory: buildMemory(),
      gate: buildGate(),
      referenceDistillation: buildReferenceDistillation(),
    });

    assert.equal(context.dynamicContext.referenceDistillation.status, "pending");
    assert.equal(context.runtimeCompact.referenceDistillationRef.status, "pending");
    assert.equal(context.runtimeCompact.referenceDistillationRef.pendingCount, 1);
    assert.equal(context.runtimeCompact.referenceDistillationRef.lastTopic, "Plugin Menu Patterns");
  });

  it("should mark post-gate contexts as aligned and keep business nextAction intact", () => {
    const context = buildAgentContext({
      currentTruth: buildCurrentTruth(),
      projectExpansionWave: buildExpansionWave(),
      projectValidationOverrides: buildValidationOverrides(),
      monitor: buildMonitor(),
      memory: buildMemory(),
      gate: buildGate(),
    }, {
      generationStage: "post-gate",
    });

    assert.equal(context.schemaVersion, 2);
    assert.equal(context.sourceAlignment.status, "aligned");
    assert.equal(context.sourceAlignment.generationStage, "post-gate");
    assert.equal(context.sourceAlignment.preferredRepairCommand, null);
    assert.equal(context.decisionHints.nextActionCommand, "npm run agent:zotero:e2e");
    assert.equal(context.runtimeCompact.alignmentRef.status, "aligned");
    assert.equal(context.runtimeCompact.alignmentRef.generationStage, "post-gate");
  });

  it("should detect freshness and scope drift across truth and source mirrors", () => {
    const drift = evaluateAgentContextDrift({
      currentTruth: buildCurrentTruth({
        currentWaveNameFromTruth: "WAVE-2",
        acceptanceTrackFromTruth: "visual-first",
      }),
      projectExpansionWave: buildExpansionWave({
        currentWaveName: "WAVE-1",
        acceptanceTrack: "functional-first",
      }),
      projectValidationOverrides: buildValidationOverrides({
        summary: "Project-local validation overrides for WAVE-0.",
      }),
      monitor: buildMonitor({
        generatedAt: "2026-04-03T00:20:00.000Z",
      }),
      memory: buildMemory({
        generatedAt: "2026-04-03T00:05:00.000Z",
      }),
      gate: buildGate({
        generatedAt: "2026-04-03T00:10:00.000Z",
      }),
    });

    assert.equal(drift.status, "warning");
    assert.ok(drift.signals.some((item) => item.kind === "scope-mismatch"));
    assert.ok(drift.signals.some((item) => item.kind === "freshness-mismatch"));
  });
});
