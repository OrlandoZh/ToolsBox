import { describe, it, assert } from "./test-framework.js";
import {
  buildZoteroLoopMarkdown,
  deriveZoteroLoopActions,
  summarizeZoteroLoopState,
} from "../scripts/agent-zotero-loop-lib.mjs";

describe("Agent Zotero Loop Lib", () => {
  it("should derive refresh and e2e actions for incomplete state", () => {
    const state = summarizeZoteroLoopState({
      watchStatus: { present: false, status: "missing", statusLabel: "缺失" },
      e2e: { present: false, status: "missing", statusLabel: "缺失" },
      autofix: { present: false, status: "missing", statusLabel: "缺失" },
      watchRecovery: { present: false, status: "missing", statusLabel: "缺失" },
      gate: null,
    });

    const actions = deriveZoteroLoopActions(state);
    assert.equal(state.watchNeedsRefresh, true);
    assert.equal(state.e2eNeedsRun, true);
    assert.equal(state.watchRecoveryNeeded, true);
    assert.equal(actions[0].id, "refresh-watch");
    assert.equal(actions[1].id, "run-e2e");
    assert.ok(actions.some((item) => item.id === "run-watch-recovery"));
    assert.equal(actions[actions.length - 1].id, "run-gate");
  });

  it("should recommend autofix for failed e2e state", () => {
    const state = summarizeZoteroLoopState({
      watchStatus: { present: true, status: "healthy", statusLabel: "健康", ageText: "1 分钟内" },
      e2e: { present: true, status: "failed", statusLabel: "失败", ageText: "2 分钟" },
      autofix: { present: true, status: "unrecovered", statusLabel: "未恢复", ageText: "2 分钟" },
      watchRecovery: { present: true, status: "passed", statusLabel: "通过", ageText: "3 分钟" },
      gate: {
        gatePassed: false,
        frontpageSummary: {
          status: "blocked",
          statusLabel: "需先处理",
          headline: "最近 Zotero E2E 未通过。",
        },
      },
    });

    const actions = deriveZoteroLoopActions(state);
    assert.equal(state.autofixRecommended, true);
    assert.equal(actions[0].id, "run-autofix");
    assert.equal(state.loopPassed, false);
  });

  it("should avoid autofix and refresh baseline for pure visual geometry mismatch", () => {
    const state = summarizeZoteroLoopState({
      watchStatus: { present: true, status: "healthy", statusLabel: "健康", ageText: "1 分钟内" },
      e2e: {
        present: true,
        status: "failed",
        statusLabel: "失败",
        ageText: "2 分钟",
        testFailed: 0,
        scenarioFailed: 0,
        logErrorCount: 0,
        primaryDiagnosis: {
          fingerprint: "reader-ui:reader-visual-drift",
        },
        visualPrimaryBlockerKind: "baseline-geometry-mismatch",
        visualPrimaryBlockerKindLabel: "基线几何不匹配",
        readerEventReport: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          hookScenarioStatus: "passed",
          fineGrainedScenarioStatus: "passed",
          syntheticFallbackAvailable: true,
        },
      },
      autofix: { present: true, status: "unrecovered", statusLabel: "未恢复", ageText: "2 分钟" },
      watchRecovery: { present: true, status: "passed", statusLabel: "通过", ageText: "3 分钟" },
      gate: {
        gatePassed: false,
        frontpageSummary: {
          status: "blocked",
          statusLabel: "需先处理",
          headline: "Reader 视觉阻断尚未收口。",
          nextAction: "npm run agent:zotero:e2e:update-baseline",
        },
      },
    });

    const actions = deriveZoteroLoopActions(state);
    assert.equal(state.pureVisualReaderFailure, true);
    assert.equal(state.autofixRecommended, false);
    assert.equal(state.pureVisualNeedsBaselineUpdate, true);
    assert.equal(actions[0].id, "update-visual-baseline");
    assert.equal(actions[0].commandLabel, "npm run agent:zotero:e2e:update-baseline");
  });

  it("should route partial canonical coverage to obsidian instead of repeating baseline refresh", () => {
    const state = summarizeZoteroLoopState({
      watchStatus: { present: true, status: "healthy", statusLabel: "健康", ageText: "1 分钟内" },
      e2e: {
        present: true,
        status: "failed",
        statusLabel: "失败",
        ageText: "2 分钟",
        testFailed: 0,
        scenarioFailed: 0,
        logErrorCount: 0,
        primaryDiagnosis: {
          fingerprint: "reader-ui:reader-visual-drift",
        },
        visualPrimaryBlockerKind: "baseline-geometry-mismatch",
        visualPrimaryBlockerKindLabel: "基线几何不匹配",
        visualCanonicalCoverageKind: "partial",
        visualCanonicalCoverageKindLabel: "canonical 基线覆盖部分",
        visualCanonicalCoverageSummary: "canonical 基线覆盖部分：仍不匹配 hot-reload-library.png、hot-reload-reader.png",
        visualCanonicalMismatchedTargets: ["hot-reload-library.png", "hot-reload-reader.png"],
        readerEventReport: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          hookScenarioStatus: "passed",
          fineGrainedScenarioStatus: "passed",
          syntheticFallbackAvailable: true,
        },
      },
      autofix: { present: true, status: "unrecovered", statusLabel: "未恢复", ageText: "2 分钟" },
      watchRecovery: { present: true, status: "passed", statusLabel: "通过", ageText: "3 分钟" },
      gate: {
        gatePassed: false,
        frontpageSummary: {
          status: "blocked",
          statusLabel: "需先处理",
          headline: "Reader 视觉阻断尚未收口。",
          nextAction: "npm run agent:obsidian",
        },
      },
    });

    const actions = deriveZoteroLoopActions(state);
    assert.equal(state.pureVisualReaderFailure, true);
    assert.equal(state.pureVisualNeedsBaselineUpdate, false);
    assert.equal(state.pureVisualNeedsObsidian, true);
    assert.equal(actions[0].id, "run-obsidian");
    assert.equal(actions[0].commandLabel, "npm run agent:obsidian");
  });

  it("should route complete canonical coverage ui regression candidates to obsidian", () => {
    const state = summarizeZoteroLoopState({
      watchStatus: { present: true, status: "healthy", statusLabel: "健康", ageText: "1 分钟内" },
      e2e: {
        present: true,
        status: "failed",
        statusLabel: "失败",
        ageText: "2 分钟",
        testFailed: 0,
        scenarioFailed: 0,
        logErrorCount: 0,
        primaryDiagnosis: {
          fingerprint: "reader-ui:reader-visual-drift",
        },
        visualPrimaryBlockerKind: "ui-regression-candidate",
        visualPrimaryBlockerKindLabel: "疑似真实界面回归",
        visualCanonicalCoverageKind: "complete",
        visualCanonicalCoverageKindLabel: "canonical 基线覆盖完整",
        visualCanonicalCoverageSummary: "canonical 基线覆盖完整：4/4 已对齐",
        visualCanonicalMismatchedTargets: [],
        readerEventReport: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          hookScenarioStatus: "passed",
          fineGrainedScenarioStatus: "passed",
          syntheticFallbackAvailable: true,
        },
      },
      autofix: { present: true, status: "unrecovered", statusLabel: "未恢复", ageText: "2 分钟" },
      watchRecovery: { present: true, status: "passed", statusLabel: "通过", ageText: "3 分钟" },
      gate: {
        gatePassed: false,
        frontpageSummary: {
          status: "blocked",
          statusLabel: "需先处理",
          headline: "Reader 视觉阻断尚未收口。",
          nextAction: "npm run agent:obsidian",
        },
      },
    });

    const actions = deriveZoteroLoopActions(state);
    assert.equal(state.pureVisualReaderFailure, true);
    assert.equal(state.pureVisualNeedsObsidian, true);
    assert.equal(state.pureVisualNeedsE2ERerun, false);
    assert.equal(actions[0].id, "run-obsidian");
    assert.equal(actions[0].commandLabel, "npm run agent:obsidian");
  });

  it("should keep capture-unstable complete path on e2e rerun and surface exhausted stages in summary", () => {
    const state = summarizeZoteroLoopState({
      watchStatus: { present: true, status: "healthy", statusLabel: "健康", ageText: "1 分钟内" },
      e2e: {
        present: true,
        status: "failed",
        statusLabel: "失败",
        ageText: "2 分钟",
        testFailed: 0,
        scenarioFailed: 0,
        logErrorCount: 0,
        primaryDiagnosis: {
          fingerprint: "reader-ui:reader-visual-drift",
        },
        visualPrimaryBlockerKind: "capture-unstable",
        visualPrimaryBlockerKindLabel: "采集未稳定",
        visualCanonicalCoverageKind: "complete",
        visualCanonicalCoverageKindLabel: "canonical 基线覆盖完整",
        visualCaptureStabilityStages: [
          { kind: "library", stable: false, attemptCount: 3, selectionReason: "max-attempt-reached" },
          { kind: "reader", stable: false, attemptCount: 3, selectionReason: "max-attempt-reached" },
        ],
        readerEventReport: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          hookScenarioStatus: "passed",
          fineGrainedScenarioStatus: "passed",
          syntheticFallbackAvailable: true,
        },
      },
      autofix: { present: true, status: "unrecovered", statusLabel: "未恢复", ageText: "2 分钟" },
      watchRecovery: { present: true, status: "passed", statusLabel: "通过", ageText: "3 分钟" },
      gate: {
        gatePassed: false,
        frontpageSummary: {
          status: "blocked",
          statusLabel: "需先处理",
          headline: "Reader 视觉阻断尚未收口。",
          nextAction: "npm run agent:zotero:e2e",
        },
      },
    });

    const actions = deriveZoteroLoopActions(state);
    assert.equal(state.pureVisualReaderFailure, true);
    assert.equal(state.pureVisualNeedsE2ERerun, true);
    assert.equal(state.pureVisualNeedsObsidian, false);
    assert.equal(actions[0].id, "run-e2e");
    assert.equal(actions[0].commandLabel, "npm run agent:zotero:e2e");
    assert.ok(String(state.frontpageSummary.headline || "").includes("library（3 次）"));
    assert.ok(String(state.frontpageSummary.headline || "").includes("reader（3 次）"));
    assert.ok(state.issues.some((item) => String(item).includes("用尽预算 stage：library（3 次）；reader（3 次）")));
  });

  it("should rerun e2e after refreshing stale watch before autofix", () => {
    const state = summarizeZoteroLoopState({
      watchStatus: { present: true, status: "stale", statusLabel: "已过期", ageText: "39 小时" },
      e2e: {
        present: true,
        status: "failed",
        statusLabel: "失败",
        ageText: "2 分钟",
      },
      autofix: { present: true, status: "unrecovered", statusLabel: "未恢复", ageText: "2 分钟" },
      watchRecovery: { present: true, status: "passed", statusLabel: "通过", ageText: "3 分钟" },
      gate: {
        gatePassed: false,
        frontpageSummary: {
          status: "blocked",
          statusLabel: "需先处理",
          headline: "Zotero watch 已过期，且 Reader 事件桥未通过。",
        },
      },
    });

    const actions = deriveZoteroLoopActions(state);
    assert.equal(state.watchNeedsRefresh, true);
    assert.equal(state.e2eNeedsRefresh, true);
    assert.equal(state.e2eNeedsRun, true);
    assert.equal(state.autofixRecommended, false);
    assert.equal(actions[0].id, "refresh-watch");
    assert.equal(actions[1].id, "run-e2e");
    assert.equal(actions.some((item) => item.id === "run-autofix"), false);
    assert.ok(state.issues.some((item) => item.includes("需在刷新后重新执行 Zotero 真机 E2E")));
  });

  it("should render markdown report with final summary", () => {
    const markdown = buildZoteroLoopMarkdown({
      generatedAt: "2026-03-20T11:00:00.000Z",
      dryRun: true,
      loopPassed: false,
      initialState: {
        watchNeedsRefresh: true,
        e2eNeedsRun: false,
        autofixRecommended: true,
        watchRecoveryNeeded: false,
      },
      steps: [{
        label: "执行 Zotero 自动修复闭环",
        status: "planned",
        commandLabel: "npm run agent:zotero:autofix",
      }],
      finalState: {
        frontpageSummary: {
          statusLabel: "需关注",
          headline: "最近自动修复未恢复成功，建议回看补丁计划与诊断。",
          nextAction: "npm run agent:zotero:autofix",
        },
        gate: {
          statusLabel: "需先处理",
          headline: "当前 gate 未通过。",
        },
        issues: ["最近自动修复未恢复成功。"],
      },
      nextAction: "npm run agent:zotero:autofix",
    });

    assert.ok(markdown.includes("# Zotero Agent 编排回合报告"));
    assert.ok(markdown.includes("执行模式"));
    assert.ok(markdown.includes("npm run agent:zotero:autofix"));
    assert.ok(markdown.includes("当前 gate 未通过"));
  });

  it("should render error fields in markdown when present", () => {
    const markdown = buildZoteroLoopMarkdown({
      generatedAt: "2026-03-24T12:00:00.000Z",
      dryRun: false,
      loopPassed: false,
      durationMs: 150,
      errorCategory: "execution",
      errorCategoryLabel: "执行错误",
      errorMessage: "E2E execution failed",
      failedStage: "run-e2e",
      initialState: {
        watchNeedsRefresh: false,
        e2eNeedsRun: true,
        autofixRecommended: false,
        watchRecoveryNeeded: false,
      },
      steps: [{
        label: "执行 Zotero 真机 E2E",
        status: "failed",
        exitCode: 1,
        durationMs: 120,
        commandLabel: "npm run agent:zotero:e2e",
      }],
      finalState: {
        frontpageSummary: {
          statusLabel: "失败",
          headline: "E2E 执行失败",
          nextAction: "npm run agent:zotero:e2e",
        },
        gate: {
          statusLabel: "需先处理",
          headline: "当前 gate 未通过。",
        },
        issues: ["E2E 执行失败。"],
      },
      nextAction: "npm run agent:zotero:e2e",
    });

    assert.ok(markdown.includes("# Zotero Agent 编排回合报告"));
    assert.ok(markdown.includes("分类: `执行错误`"));
    assert.ok(markdown.includes("阶段: `run-e2e`"));
    assert.ok(markdown.includes("E2E execution failed"));
    assert.ok(markdown.includes("执行 Zotero 真机 E2E"));
  });

  it("should summarize loop state with consistent field access", () => {
    const state = summarizeZoteroLoopState({
      watchStatus: { present: true, status: "healthy", statusLabel: "健康" },
      e2e: { present: true, status: "passed", statusLabel: "通过" },
      autofix: { present: true, status: "clean", statusLabel: "无需恢复" },
      watchRecovery: { present: true, status: "passed", statusLabel: "通过" },
      gate: {
        gatePassed: true,
        frontpageSummary: {
          status: "ready",
          statusLabel: "可继续",
          headline: "所有检查通过",
        },
      },
    });

    assert.equal(state.loopPassed, true);
    assert.equal(state.stable, true);
    assert.equal(state.watchNeedsRefresh, false);
    assert.equal(state.e2eNeedsRun, false);
    assert.equal(state.autofixRecommended, false);
    assert.equal(state.watchRecoveryNeeded, false);
    assert.equal(state.gate.present, true);
    assert.equal(state.gate.gatePassed, true);
    assert.equal(state.frontpageSummary.status, "stable");
  });

  it("should keep blocked gate context when validation artifacts are present", () => {
    const state = summarizeZoteroLoopState({
      watchStatus: { present: true, status: "healthy", statusLabel: "健康" },
      e2e: {
        present: true,
        status: "failed",
        statusLabel: "失败",
        errorCategory: "validation",
        failedStage: "validation-summary",
      },
      autofix: { present: true, status: "missing", statusLabel: "缺失" },
      watchRecovery: { present: true, status: "passed", statusLabel: "通过" },
      gate: {
        gatePassed: false,
        errorCategory: "validation",
        failedStage: "gate-evaluation",
        frontpageSummary: {
          status: "blocked",
          statusLabel: "需先处理",
          headline: "Reader Toolbar / 官方 listener 桥接存在漂移。",
          nextAction: "npm run agent:zotero:e2e",
        },
      },
    });

    assert.equal(state.gate.present, true);
    assert.equal(state.gate.status, "blocked");
    assert.equal(state.frontpageSummary.nextAction, "npm run agent:zotero:e2e");
    assert.ok(state.issues.some((item) => item.includes("Reader Toolbar / 官方 listener 桥接存在漂移")));
  });
});
