import { describe, it, assert } from "./test-framework.js";
import {
  buildGateFrontpageSummary,
  buildMonitorFrontpageSummary,
  selectAgentNextAction,
} from "../scripts/agent-frontpage-summary-lib.mjs";

describe("Agent Frontpage Summary Lib", () => {
  it("should prioritize watch recovery command for failed recovery blockers", () => {
    const nextAction = selectAgentNextAction([
      "建议查看 `dist/agent-zotero-e2e.md`。",
      "重新执行 `npm run agent:zotero:watch-recovery`，确认恢复链已重新闭环。",
      "必要时执行 `npm run agent:zotero:autofix`。",
    ], {
      watchStatus: "healthy",
      e2eStatus: "passed",
      watchRecoveryStatus: "failed",
    });

    assert.equal(nextAction, "重新执行 `npm run agent:zotero:watch-recovery`，确认恢复链已重新闭环。");
  });

  it("should prioritize e2e rerun when reader event bridge is blocking", () => {
    const nextAction = selectAgentNextAction([
      "建议查看 `dist/agent-zotero-e2e.md`。",
      "重新执行 `npm run agent:zotero:e2e`，刷新 Reader 事件桥与细粒度 Hook 的真机结论。",
      "必要时执行 `npm run agent:zotero:autofix`。",
    ], {
      watchStatus: "healthy",
      e2eStatus: "passed",
      watchRecoveryStatus: "passed",
      readerEventStatus: "failed",
    });

    assert.equal(nextAction, "重新执行 `npm run agent:zotero:e2e`，刷新 Reader 事件桥与细粒度 Hook 的真机结论。");
  });

  it("should prefer watch refresh over e2e rerun when watch is stale", () => {
    const nextAction = selectAgentNextAction([
      "重新执行 `npm run agent:zotero:e2e`，刷新 Reader 事件桥与细粒度 Hook 的真机结论。",
      "重新执行 `npm run zotero:watch`，刷新当前热重载健康状态。",
      "必要时执行 `npm run agent:zotero:autofix`。",
    ], {
      watchStatus: "stale",
      e2eStatus: "failed",
      watchRecoveryStatus: "passed",
      readerEventStatus: "failed",
    });

    assert.equal(nextAction, "重新执行 `npm run zotero:watch`，刷新当前热重载健康状态。");
  });

  it("should return default watch refresh when watch is stale but no watch recommendation exists", () => {
    const nextAction = selectAgentNextAction([
      "建议查看 `dist/agent-zotero-e2e.md`。",
      "重新执行 `npm run agent:zotero:e2e`，刷新 Reader 事件桥与细粒度 Hook 的真机结论。",
      "必要时执行 `npm run agent:zotero:autofix`。",
    ], {
      watchStatus: "stale",
      e2eStatus: "failed",
      watchRecoveryStatus: "passed",
      readerEventStatus: "failed",
    });

    assert.equal(nextAction, "npm run zotero:watch");
  });

  it("should prefer baseline refresh over autofix for pure visual geometry mismatch", () => {
    const nextAction = selectAgentNextAction([
      "重新执行 `npm run agent:zotero:autofix`，确认恢复动作是否能覆盖这次新的失败。",
      "当前主阻断属于视觉基线几何不匹配；截图已稳定且几何不一致，如当前 UI 变化属预期，可执行 `npm run agent:zotero:e2e:update-baseline` 刷新基线后复验。",
    ], {
      watchStatus: "healthy",
      e2eStatus: "failed",
      watchRecoveryStatus: "passed",
      pureVisualReaderFailure: true,
      visualPrimaryBlockerKind: "baseline-geometry-mismatch",
      readerEventStatus: "passed",
    });

    assert.equal(nextAction, "当前主阻断属于视觉基线几何不匹配；截图已稳定且几何不一致，如当前 UI 变化属预期，可执行 `npm run agent:zotero:e2e:update-baseline` 刷新基线后复验。");
  });

  it("should prefer obsidian over baseline refresh for partial canonical coverage", () => {
    const nextAction = selectAgentNextAction([
      "当前主阻断属于视觉基线几何不匹配；截图已稳定且几何不一致，如当前 UI 变化属预期，可执行 `npm run agent:zotero:e2e:update-baseline` 刷新基线后复验。",
      "当前主阻断仍是视觉基线几何不匹配，但 canonical baseline 只部分覆盖；仍不匹配：hot-reload-library.png、hot-reload-reader.png。当前先执行 `npm run agent:obsidian` 固化证据并决定后续人工收口，不再默认重复刷新 baseline。",
    ], {
      watchStatus: "healthy",
      e2eStatus: "failed",
      watchRecoveryStatus: "passed",
      pureVisualReaderFailure: true,
      visualPrimaryBlockerKind: "baseline-geometry-mismatch",
      visualCanonicalCoverageKind: "partial",
      readerEventStatus: "passed",
    });

    assert.equal(nextAction, "当前主阻断仍是视觉基线几何不匹配，但 canonical baseline 只部分覆盖；仍不匹配：hot-reload-library.png、hot-reload-reader.png。当前先执行 `npm run agent:obsidian` 固化证据并决定后续人工收口，不再默认重复刷新 baseline。");
  });

  it("should prefer e2e rerun over autofix or obsidian for capture-command-failed", () => {
    const nextAction = selectAgentNextAction([
      "重新执行 `npm run agent:zotero:autofix`，确认恢复动作是否能覆盖这次新的失败。",
      "当前主阻断已排除采集稳定性、几何漂移与 canonical coverage 缺口；先执行 `npm run agent:obsidian` 固化 Reader UI / scenario 的人工复核结论。",
      "library（截图调用失败：could not create image from rect）；先复核窗口 bounds、前台激活与 screencapture 调用，再重新执行 `npm run agent:zotero:e2e`，暂不建议进入 autofix、刷新视觉基线或走 obsidian-first。",
    ], {
      watchStatus: "healthy",
      e2eStatus: "failed",
      watchRecoveryStatus: "passed",
      pureVisualReaderFailure: true,
      visualPrimaryBlockerKind: "capture-command-failed",
      readerEventStatus: "passed",
    });

    assert.equal(nextAction, "library（截图调用失败：could not create image from rect）；先复核窗口 bounds、前台激活与 screencapture 调用，再重新执行 `npm run agent:zotero:e2e`，暂不建议进入 autofix、刷新视觉基线或走 obsidian-first。");
  });

  it("should prefer obsidian for pure visual ui regression candidates after canonical coverage is complete", () => {
    const nextAction = selectAgentNextAction([
      "当前主阻断已排除采集稳定性、几何漂移与 canonical coverage 缺口；先执行 `npm run agent:obsidian` 固化 Reader UI / scenario 的人工复核结论。",
      "完成 Reader UI / scenario 复核后，重新执行 `npm run agent:zotero:e2e` 确认视觉结论。",
    ], {
      watchStatus: "healthy",
      e2eStatus: "failed",
      watchRecoveryStatus: "passed",
      pureVisualReaderFailure: true,
      visualPrimaryBlockerKind: "ui-regression-candidate",
      visualCanonicalCoverageKind: "complete",
      readerEventStatus: "passed",
    });

    assert.equal(nextAction, "当前主阻断已排除采集稳定性、几何漂移与 canonical coverage 缺口；先执行 `npm run agent:obsidian` 固化 Reader UI / scenario 的人工复核结论。");
  });

  it("should point monitor next action to functional closure for visual-not-needed batches", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "1 分钟",
        latestTrigger: "startup",
      },
      zoteroValidation: {
        e2e: {
          present: false,
          status: "missing",
          statusLabel: "缺失",
          ageText: "-",
        },
        autofix: {
          present: false,
          status: "missing",
          statusLabel: "缺失",
          ageText: "-",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "1 分钟",
          latestTrigger: "session-restart-recovery",
        },
      },
      validationDecision: {
        level: "visual-not-needed",
        levelLabel: "无需视觉验证",
        decisionSource: "validation-domain",
        reasons: ["当前变更域集中在 runtime-config。"],
        matchedDomain: ["runtime-config"],
        matchedProjectOverride: [],
        requiredChecks: [
          "继续以 `npm run check` -> `npm run agent:zotero:e2e` -> `npm run agent:monitor` / `npm run agent:gate` 完成功能闭环。",
        ],
        requiredEvidence: [
          "继续以 `npm run check` -> `npm run agent:zotero:e2e` -> `npm run agent:monitor` / `npm run agent:gate` 完成功能闭环。",
        ],
        escalatedByRuntimeSignals: false,
        deferredEvidenceAction: null,
      },
    });

    assert.ok(String(frontpage.nextAction || "").includes("npm run check"));
    assert.equal(String(frontpage.nextAction || "").includes("agent:obsidian"), false);
  });

  it("should keep gate next action on functional closure for non-visual batches instead of visual review", () => {
    const frontpage = buildGateFrontpageSummary({
      gatePassed: false,
      profile: "dev",
      issues: [
        "最近 Zotero E2E 未通过：失败。",
      ],
      recommendations: [
        "先运行 `npm run agent:check` 修复基础质量问题。",
        "建议在下一次合并前执行 `npm run agent:zotero:e2e` 补齐视觉证据（非阻断）。",
        "当前主阻断已排除采集稳定性、几何漂移与 canonical coverage 缺口；先执行 `npm run agent:obsidian` 固化 Reader UI / scenario 的人工复核结论。",
      ],
      watchStatus: {
        status: "healthy",
        statusLabel: "健康",
        ageText: "1 分钟",
      },
      zoteroValidation: {
        e2e: {
          present: false,
          status: "missing",
          statusLabel: "缺失",
          ageText: "-",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "1 分钟",
        },
      },
      validationDecision: {
        level: "visual-recommended",
        levelLabel: "建议视觉验证",
        decisionSource: "validation-domain",
        reasons: ["当前变更域命中 host-wrapper。"],
        matchedDomain: ["host-wrapper"],
        matchedProjectOverride: [],
        requiredChecks: [
          "先完成 `npm run check` -> `npm run agent:zotero:e2e` -> `npm run agent:monitor` / `npm run agent:gate`。",
        ],
        requiredEvidence: [
          "先完成 `npm run check` -> `npm run agent:zotero:e2e` -> `npm run agent:monitor` / `npm run agent:gate`。",
        ],
        escalatedByRuntimeSignals: false,
        deferredEvidenceAction: "建议在下一次合并前执行 `npm run agent:zotero:e2e` 补齐视觉证据（非阻断）。",
      },
    });

    assert.ok(String(frontpage.nextAction || "").includes("npm run check"));
    assert.equal(String(frontpage.nextAction || "").includes("agent:obsidian"), false);
  });

  it("should surface reference distillation as advisory signals without changing main monitor action", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "1 分钟",
      },
      zoteroValidation: {
        e2e: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "1 分钟",
        },
        autofix: {
          present: true,
          status: "clean",
          statusLabel: "干净",
          ageText: "1 分钟",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "1 分钟",
        },
      },
      referenceDistillation: {
        status: "queued",
        statusLabel: "后台排队中",
        summary: "reference distillation queued in background",
        pendingCount: 1,
        lastTopic: "Plugin Menu Patterns",
        lastDistilledAt: "2026-04-08T04:00:00.000Z",
        nextSuggestedAction: "等待后台 reference distillation 完成。",
      },
    });

    assert.equal(frontpage.status, "stable");
    assert.equal(frontpage.nextAction, "npm run agent:gate");
    assert.equal(frontpage.referenceDistillation.status, "queued");
    assert.ok(frontpage.advisorySignals.some((item) => item.includes("queued in background")));
  });

  it("should surface fresh debug probe results as advisory without changing stable next action", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "1 分钟",
      },
      zoteroValidation: {
        e2e: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "1 分钟",
        },
        autofix: {
          present: true,
          status: "clean",
          statusLabel: "干净",
          ageText: "1 分钟",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "1 分钟",
        },
        debugProbe: {
          present: true,
          status: "completed",
          statusLabel: "已完成",
          ageText: "1 分钟",
          executedProbeCount: 1,
          selectedProbeCount: 1,
          failedProbeCount: 0,
          promotions: ["interaction-proved"],
          summary: "已选 1 个 bundle；已执行 1 个 bundle；完成 1 个；promotion interaction-proved",
          freshForLatestE2E: true,
        },
      },
    });

    assert.equal(frontpage.status, "stable");
    assert.equal(frontpage.nextAction, "npm run agent:gate");
    assert.equal(frontpage.debugProbe.status, "completed");
    assert.ok(frontpage.advisorySignals.some((item) => item.includes("debug probe ready")));
  });

  it("should recommend debug probe as advisory when latest failed e2e has no fresh probe", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "1 分钟",
      },
      zoteroValidation: {
        e2e: {
          present: true,
          status: "failed",
          statusLabel: "失败",
          ageText: "1 分钟",
          note: "Reader sidebar toggle 未闭环。",
        },
        autofix: {
          present: false,
          status: "missing",
          statusLabel: "缺失",
          ageText: "-",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "1 分钟",
        },
        debugProbe: {
          present: true,
          status: "completed",
          statusLabel: "已完成",
          ageText: "20 分钟",
          executedProbeCount: 1,
          selectedProbeCount: 1,
          failedProbeCount: 0,
          promotions: ["interaction-proved"],
          summary: "上一轮 probe 已完成。",
          freshForLatestE2E: false,
        },
      },
    });

    assert.equal(frontpage.status, "attention");
    assert.equal(frontpage.nextAction, "npm run agent:zotero:e2e");
    assert.ok(frontpage.primarySignals.some((item) => item.includes("尚未对齐最新 debug probe")));
    assert.ok(frontpage.advisorySignals.some((item) => item.includes("fresh debug probe")));
  });

  it("should surface dead-chain audit as advisory signals without changing stable next action", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "1 分钟",
      },
      zoteroValidation: {
        e2e: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "1 分钟",
        },
        autofix: {
          present: true,
          status: "clean",
          statusLabel: "干净",
          ageText: "1 分钟",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "1 分钟",
        },
      },
      deadChainAudit: {
        status: "warning",
        summary: "发现 2 个硬死链入口，另有 1 个已退休旧链路候选。",
        hardDeadCount: 2,
        retiredChainCount: 1,
        safeDeleteCandidateCount: 0,
      },
    });

    assert.equal(frontpage.status, "stable");
    assert.equal(frontpage.nextAction, "npm run agent:gate");
    assert.equal(frontpage.deadChainAudit.status, "warning");
    assert.equal(frontpage.deadChainAudit.hardDeadCount, 2);
    assert.ok(frontpage.advisorySignals.some((item) => item.includes("dead-chain audit warning")));
  });

  it("should surface dead-chain audit in gate frontpage summary without turning it into a blocker", () => {
    const frontpage = buildGateFrontpageSummary({
      gatePassed: true,
      profile: "dev",
      issues: [],
      recommendations: [
        "当前已满足 agent 质量闸门，可继续推进后续开发或发布流程。",
      ],
      watchStatus: {
        status: "healthy",
        statusLabel: "健康",
        ageText: "1 分钟",
      },
      zoteroValidation: {
        e2e: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "1 分钟",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "1 分钟",
        },
      },
      deadChainAudit: {
        status: "advisory",
        summary: "未发现硬死链，也没有待收缩的 delegation 历史链；另有 1 个历史治理保留项（superseded framework bundle）。",
        hardDeadCount: 0,
        retiredChainCount: 1,
        actionableRetiredChainCount: 0,
        historyRetainedCount: 1,
        supersededBundleCount: 1,
        safeDeleteCandidateCount: 0,
      },
    });

    assert.equal(frontpage.status, "ready");
    assert.equal(frontpage.primaryBlockers.length, 0);
    assert.equal(frontpage.deadChainAudit.status, "advisory");
    assert.equal(frontpage.deadChainAudit.statusLabel, "历史保留");
    assert.equal(frontpage.deadChainAudit.retiredChainCount, 1);
    assert.equal(frontpage.deadChainAudit.historyRetainedCount, 1);
    assert.ok(frontpage.advisorySignals.some((item) => item.includes("dead-chain audit advisory")));
  });

  it("should surface fresh debug probe in gate frontpage summary without turning it into a blocker", () => {
    const frontpage = buildGateFrontpageSummary({
      gatePassed: false,
      profile: "dev",
      issues: [
        "最近 Zotero E2E 未通过：失败。",
      ],
      recommendations: [
        "优先重新执行 `npm run agent:zotero:e2e`，确认真实 Zotero 动作、测试与视觉基线是否全部通过。",
      ],
      watchStatus: {
        status: "healthy",
        statusLabel: "健康",
        ageText: "1 分钟",
      },
      zoteroValidation: {
        e2e: {
          present: true,
          status: "failed",
          statusLabel: "失败",
          ageText: "1 分钟",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "1 分钟",
        },
        debugProbe: {
          present: true,
          status: "completed",
          statusLabel: "已完成",
          ageText: "1 分钟",
          selectedProbeCount: 1,
          executedProbeCount: 1,
          failedProbeCount: 0,
          promotions: ["interaction-proved"],
          summary: "已选 1 个 bundle；已执行 1 个 bundle；完成 1 个；promotion interaction-proved",
          freshForLatestE2E: true,
        },
      },
    });

    assert.equal(frontpage.status, "blocked");
    assert.equal(frontpage.debugProbe.status, "completed");
    assert.ok(frontpage.advisorySignals.some((item) => item.includes("debug probe ready")));
    assert.equal(frontpage.primaryBlockers.length, 1);
  });

  it("should prefer concrete watch recovery action over generic validation pipeline guidance", () => {
    const frontpage = buildGateFrontpageSummary({
      gatePassed: false,
      profile: "dev",
      issues: [
        "最近 watch 恢复回归未通过，说明受控故障下的恢复链路仍不稳定。",
      ],
      recommendations: [
        "先运行 `npm run agent:check` 修复基础质量问题。",
        "重新执行 `npm run agent:zotero:watch-recovery`，确认恢复链已重新闭环。",
        "建议在下一次合并前执行 `npm run agent:zotero:e2e` 补齐视觉证据（非阻断）。",
      ],
      watchStatus: {
        status: "healthy",
        statusLabel: "健康",
        ageText: "1 分钟",
      },
      zoteroValidation: {
        e2e: {
          present: false,
          status: "missing",
          statusLabel: "缺失",
          ageText: "-",
        },
        watchRecovery: {
          present: true,
          status: "failed",
          statusLabel: "失败",
          ageText: "1 分钟",
          latestTrigger: "runtime-recovery",
        },
      },
      validationDecision: {
        level: "visual-recommended",
        levelLabel: "建议视觉验证",
        decisionSource: "validation-domain",
        reasons: ["当前变更域命中 host-wrapper。"],
        matchedDomain: ["host-wrapper"],
        matchedProjectOverride: [],
        requiredChecks: [
          "先完成 `npm run check` -> `npm run agent:zotero:e2e` -> `npm run agent:monitor` / `npm run agent:gate`。",
        ],
        requiredEvidence: [
          "先完成 `npm run check` -> `npm run agent:zotero:e2e` -> `npm run agent:monitor` / `npm run agent:gate`。",
        ],
        escalatedByRuntimeSignals: false,
        deferredEvidenceAction: "建议在下一次合并前执行 `npm run agent:zotero:e2e` 补齐视觉证据（非阻断）。",
      },
    });

    assert.equal(frontpage.nextAction, "npm run agent:zotero:watch-recovery");
  });

  it("should build stable monitor frontpage summary when all zotero signals are healthy", () => {
    const frontpage = buildMonitorFrontpageSummary({
      latest: {
        runName: "gate-pass-case",
        success: true,
        exitCode: 0,
        startedAtISO: "2026-03-20T10:00:00.000Z",
      },
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "5 分钟",
        latestTrigger: "watch-change",
      },
      zoteroValidation: {
        e2e: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "10 分钟",
          strategy: "hot",
          readerEventReport: {
            present: true,
            status: "passed",
            statusLabel: "通过",
            available: true,
            syntheticFallbackAvailable: true,
            knownTypeCount: 8,
            probeCompatibleTypeCount: 8,
          },
        },
        autofix: {
          present: true,
          status: "clean",
          statusLabel: "无需恢复",
          ageText: "10 分钟",
          attempts: 1,
          patchPlanStatus: "missing",
          patchPlanStatusLabel: "缺失",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "9 分钟",
          latestTrigger: "session-restart-recovery",
        },
      },
    });

    assert.equal(frontpage.status, "stable");
    assert.equal(frontpage.statusLabel, "稳定");
    assert.equal(frontpage.nextAction, "npm run agent:gate");
    assert.equal(frontpage.watch.status, "healthy");
    assert.equal(frontpage.e2e.status, "passed");
    assert.equal(frontpage.e2e.readerEvent.status, "passed");
    assert.equal(frontpage.watchRecovery.status, "passed");
    assert.equal(frontpage.primarySignals.length, 0);
  });

  it("should keep stable monitor next action on fresh healthy runs even if old autofix history is unrecovered", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "1 分钟",
        latestTrigger: "startup",
      },
      zoteroValidation: {
        e2e: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "6 分钟",
          strategy: "hot",
          readerEventReport: {
            present: true,
            status: "passed",
            statusLabel: "通过",
            available: true,
            syntheticFallbackAvailable: true,
          },
        },
        autofix: {
          present: true,
          status: "unrecovered",
          statusLabel: "未恢复",
          ageText: "30 小时",
          attempts: 3,
          patchPlanStatus: "review-ready",
          patchPlanStatusLabel: "可进入受限补丁审阅",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "178 小时",
          latestTrigger: "session-restart-recovery",
        },
      },
      agentMemory: {
        recommendation: {
          title: "优先复用历史最优恢复路径",
          nextAction: "npm run agent:zotero:autofix",
          summary: "该指纹历史最优路径成功率更高。",
        },
      },
    });

    assert.equal(frontpage.status, "stable");
    assert.equal(frontpage.nextAction, "npm run agent:gate");
    assert.equal(frontpage.primarySignals.length, 0);
    assert.equal(String(frontpage.headline || "").includes("历史建议"), false);
  });

  it("should build blocked gate frontpage summary with prioritized blockers", () => {
    const frontpage = buildGateFrontpageSummary({
      gatePassed: false,
      profile: "dev",
      issues: [
        "最近 watch 恢复回归未通过：失败。",
        "最近 Zotero E2E 未通过：失败。",
      ],
      recommendations: [
        "优先查看 `dist/zotero-watch-recovery-regression.md`，确认卡在哪个恢复触发阶段。",
        "重新执行 `npm run agent:zotero:watch-recovery`，确认恢复链已重新闭环。",
        "必要时执行 `npm run agent:zotero:autofix`，自动串联 fresh + restart、测试与场景复验。",
      ],
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "2 分钟",
        latestTrigger: "watch-change",
      },
      zoteroValidation: {
        e2e: {
          present: true,
          status: "failed",
          statusLabel: "失败",
          ageText: "2 分钟",
          strategy: "hot",
          readerEventReport: {
            present: true,
            status: "failed",
            statusLabel: "异常",
          },
        },
        watchRecovery: {
          present: true,
          status: "failed",
          statusLabel: "失败",
          ageText: "2 分钟",
          latestTrigger: "runtime-recovery",
        },
      },
    });

    assert.equal(frontpage.status, "blocked");
    assert.equal(frontpage.statusLabel, "需先处理");
    assert.equal(frontpage.primaryBlockers[0], "最近 watch 恢复回归未通过：失败。");
    assert.equal(frontpage.nextAction, "npm run agent:zotero:watch-recovery");
    assert.equal(frontpage.watchRecovery.status, "failed");
    assert.equal(frontpage.e2e.readerEvent.status, "failed");
  });

  it("should prefer memory recommendation for monitor next action when e2e is failing", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "2 分钟",
      },
      zoteroValidation: {
        e2e: {
          present: true,
          status: "failed",
          statusLabel: "失败",
          ageText: "2 分钟",
          note: "真机失败",
          readerEventReport: {
            present: true,
            status: "passed",
            statusLabel: "通过",
            available: true,
            syntheticFallbackAvailable: true,
          },
        },
        autofix: {
          present: true,
          status: "unrecovered",
          statusLabel: "未恢复",
          ageText: "1 分钟",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "3 分钟",
        },
      },
      agentMemory: {
        recommendation: {
          title: "优先复用历史最优恢复路径",
          nextAction: "npm run agent:zotero:autofix",
          summary: "该指纹历史最优路径成功率更高。",
          candidateFiles: ["src/app/plugin.js"],
        },
      },
    });

    assert.equal(frontpage.nextAction, "npm run agent:zotero:autofix");
    assert.equal(frontpage.memoryRecommendation?.nextAction, "npm run agent:zotero:autofix");
    assert.ok(String(frontpage.headline || "").includes("历史建议"));
  });

  it("should avoid autofix and prefer e2e rerun for pure visual unstable reader failure", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "2 分钟",
      },
      zoteroValidation: {
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
            summary: "Reader 相关视觉基线发生漂移或缺失。",
          },
          visualPrimaryBlockerKind: "capture-unstable",
          visualPrimaryBlockerKindLabel: "采集未稳定",
          visualCanonicalCoverageKind: "complete",
          visualGeometrySummary: "library 几何不一致 2000x1200 / 3388x2172；reader 几何不一致 2000x1200 / 3388x2172",
          visualCaptureStabilityStages: [
            { kind: "library", stable: true, attemptCount: 2, selectionReason: "stable-hash-pair" },
            { kind: "reader", stable: false, attemptCount: 3, selectionReason: "max-attempt-reached" },
          ],
          readerEventReport: {
            present: true,
            status: "passed",
            statusLabel: "通过",
            available: true,
            syntheticFallbackAvailable: true,
            hookScenarioStatus: "passed",
            fineGrainedScenarioStatus: "passed",
          },
        },
        autofix: {
          present: true,
          status: "unrecovered",
          statusLabel: "未恢复",
          ageText: "1 分钟",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "3 分钟",
        },
      },
      agentMemory: {
        recommendation: {
          title: "优先复用历史最优恢复路径",
          nextAction: "npm run agent:zotero:autofix",
          summary: "该指纹历史最优路径成功率更高。",
        },
      },
    });

    assert.equal(frontpage.nextAction, "npm run agent:zotero:e2e");
    assert.equal(frontpage.e2e.visualPrimaryBlockerKind, "capture-unstable");
    assert.ok(String(frontpage.e2e.visualPrimaryBlockerSummary || "").includes("采集未稳定"));
    assert.ok(String(frontpage.e2e.visualPrimaryBlockerSummary || "").includes("用尽预算 stage：reader（3 次）"));
    assert.ok(String(frontpage.e2e.visualPrimaryBlockerSummary || "").includes("先重跑 E2E"));
    assert.ok(String(frontpage.headline || "").includes("reader（3 次）"));
    assert.equal(String(frontpage.headline || "").includes("历史建议"), false);
  });

  it("should route partial canonical coverage to obsidian in monitor frontpage summary", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "2 分钟",
      },
      zoteroValidation: {
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
            summary: "Reader 相关视觉基线发生漂移或缺失。",
          },
          visualPrimaryBlockerKind: "baseline-geometry-mismatch",
          visualPrimaryBlockerKindLabel: "基线几何不匹配",
          visualGeometrySummary: "library 几何不一致 2000x1200 / 3388x2172；reader 几何不一致 2000x1200 / 3388x2172",
          visualCanonicalCoverageKind: "partial",
          visualCanonicalCoverageKindLabel: "canonical 基线覆盖部分",
          visualCanonicalCoverageSummary: "canonical 基线覆盖部分：已对齐 2/4；仍不匹配 hot-reload-library.png、hot-reload-reader.png",
          visualCanonicalMismatchedTargets: ["hot-reload-library.png", "hot-reload-reader.png"],
          readerEventReport: {
            present: true,
            status: "passed",
            statusLabel: "通过",
            available: true,
            syntheticFallbackAvailable: true,
            hookScenarioStatus: "passed",
            fineGrainedScenarioStatus: "passed",
          },
        },
        autofix: {
          present: true,
          status: "unrecovered",
          statusLabel: "未恢复",
          ageText: "1 分钟",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "3 分钟",
        },
      },
      agentMemory: {
        recommendation: {
          title: "优先复用历史最优恢复路径",
          nextAction: "npm run agent:zotero:autofix",
          summary: "该指纹历史最优路径成功率更高。",
        },
      },
    });

    assert.equal(frontpage.nextAction, "npm run agent:obsidian");
    assert.equal(frontpage.e2e.visualCanonicalCoverageKind, "partial");
    assert.ok(String(frontpage.e2e.visualPrimaryBlockerSummary || "").includes("canonical 基线覆盖部分"));
  });

  it("should route complete canonical coverage ui regression candidates to obsidian in monitor frontpage summary", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "2 分钟",
      },
      zoteroValidation: {
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
            summary: "Reader 相关视觉基线发生漂移或缺失。",
          },
          visualPrimaryBlockerKind: "ui-regression-candidate",
          visualPrimaryBlockerKindLabel: "疑似真实界面回归",
          visualGeometrySummary: "library 几何一致 2000x1200；reader 几何一致 2000x1200",
          visualCanonicalCoverageKind: "complete",
          visualCanonicalCoverageKindLabel: "canonical 基线覆盖完整",
          visualCanonicalCoverageSummary: "canonical 基线覆盖完整：4/4 已对齐",
          visualCanonicalMismatchedTargets: [],
          readerEventReport: {
            present: true,
            status: "passed",
            statusLabel: "通过",
            available: true,
            syntheticFallbackAvailable: true,
            hookScenarioStatus: "passed",
            fineGrainedScenarioStatus: "passed",
          },
        },
        autofix: {
          present: true,
          status: "unrecovered",
          statusLabel: "未恢复",
          ageText: "1 分钟",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "3 分钟",
        },
      },
      agentMemory: {
        recommendation: {
          title: "优先复用历史最优恢复路径",
          nextAction: "npm run agent:zotero:autofix",
          summary: "该指纹历史最优路径成功率更高。",
        },
      },
    });

    assert.equal(frontpage.nextAction, "npm run agent:obsidian");
    assert.equal(frontpage.e2e.visualCanonicalCoverageKind, "complete");
    assert.equal(String(frontpage.headline || "").includes("历史建议"), false);
  });

  it("should mark monitor frontpage as attention when reader event bridge is missing", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "healthy",
        statusLabel: "健康",
        ageText: "2 分钟",
      },
      zoteroValidation: {
        e2e: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "2 分钟",
          strategy: "hot",
          capabilityStatuses: [{
            id: "reader-event-hooks",
            label: "Reader 事件桥",
            status: "passed",
            scenarioNames: ["reader event hook diagnostics"],
          }],
        },
        autofix: {
          present: true,
          status: "clean",
          statusLabel: "无需恢复",
          ageText: "1 分钟",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "3 分钟",
        },
      },
    });

    assert.equal(frontpage.status, "attention");
    assert.equal(frontpage.nextAction, "npm run agent:zotero:e2e");
    assert.ok(frontpage.primarySignals.some((item) => item.includes("Reader 事件桥摘要缺失")));
  });

  it("should keep watch refresh as monitor next action when watch is stale and e2e is failing", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "stale",
        statusLabel: "已过期",
        ageText: "39 小时",
      },
      zoteroValidation: {
        e2e: {
          present: true,
          status: "failed",
          statusLabel: "失败",
          ageText: "2 分钟",
          note: "Reader renderToolbar / 官方 listener 桥接存在漂移。",
          readerEventReport: {
            present: true,
            status: "failed",
            statusLabel: "异常",
            available: true,
            syntheticFallbackAvailable: true,
          },
        },
        autofix: {
          present: true,
          status: "unrecovered",
          statusLabel: "未恢复",
          ageText: "1 分钟",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "3 分钟",
        },
      },
      agentMemory: {
        recommendation: {
          title: "历史建议",
          nextAction: "npm run agent:zotero:autofix",
          summary: "该指纹历史上常通过 autofix 恢复。",
        },
      },
    });

    assert.equal(frontpage.status, "attention");
    assert.equal(frontpage.nextAction, "npm run zotero:watch");
    assert.ok(frontpage.primarySignals[0].includes("Zotero watch 当前为 已过期"));
  });

  it("should keep watch refresh as monitor next action when watch failed but e2e still points to obsidian", () => {
    const frontpage = buildMonitorFrontpageSummary({
      watchStatus: {
        present: true,
        status: "failed",
        statusLabel: "失败",
        ageText: "1 分钟内",
      },
      zoteroValidation: {
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
            summary: "Reader 相关视觉基线发生漂移或缺失。",
          },
          visualPrimaryBlockerKind: "ui-regression-candidate",
          visualPrimaryBlockerKindLabel: "疑似真实界面回归",
          visualCanonicalCoverageKind: "complete",
          visualCanonicalCoverageKindLabel: "canonical 基线覆盖完整",
          readerEventReport: {
            present: true,
            status: "passed",
            statusLabel: "通过",
            available: true,
            syntheticFallbackAvailable: true,
            hookScenarioStatus: "passed",
            fineGrainedScenarioStatus: "passed",
          },
        },
        autofix: {
          present: true,
          status: "unrecovered",
          statusLabel: "未恢复",
          ageText: "1 分钟",
        },
        watchRecovery: {
          present: true,
          status: "passed",
          statusLabel: "通过",
          ageText: "3 分钟",
        },
      },
      agentMemory: {
        recommendation: {
          title: "历史建议",
          nextAction: "npm run agent:obsidian",
          summary: "更早的视觉证据曾建议进入人工复核。",
        },
      },
    });

    assert.equal(frontpage.status, "attention");
    assert.equal(frontpage.nextAction, "npm run zotero:watch");
    assert.ok(frontpage.primarySignals[0].includes("Zotero watch 当前为 失败"));
  });
});
