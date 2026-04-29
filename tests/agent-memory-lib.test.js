import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  archiveAgentSignalHistory,
  buildAgentMemoryMarkdown,
  summarizeAgentMemory,
  writeAgentMemoryArtifacts,
} from "../scripts/agent-memory-lib.mjs";

describe("Agent Memory Lib", () => {
  it("should summarize failure memory and fix outcome memory from autofix history", () => {
    const summary = summarizeAgentMemory({
      e2eReport: {
        passed: false,
        primaryDiagnosis: {
          fingerprint: "bootstrap:plugin-not-mounted",
          featureLabel: "启动与挂载",
          candidateFiles: ["src/app/plugin.js"],
        },
      },
      historyEntries: [
        {
          runId: "run-1",
          generatedAt: "2026-03-20T08:00:00.000Z",
          recovered: true,
          outcomeLabel: "已恢复",
          sourceDiagnosis: {
            fingerprint: "bootstrap:plugin-not-mounted",
            featureLabel: "启动与挂载",
            candidateFiles: ["src/app/plugin.js"],
          },
          patch: {
            whitelistRuleId: "bootstrap-runtime-bridge",
            featureLabel: "启动与挂载",
            draftOperations: [
              { operation: "replace", count: 1 },
            ],
            resultReasonSummary: [
              { reason: "applied", count: 1 },
            ],
            candidateFiles: ["scripts/zotero-agent-runtime-lib.mjs"],
          },
          verificationContract: {
            status: "verification-passed",
            checks: [
              {
                id: "item-pane-section-count",
                label: "ItemPane Section 注册计数",
                kind: "latest-cycle-check",
                required: true,
                satisfied: true,
              },
              {
                id: "cycle-failed-count",
                label: "失败轮次数",
                kind: "report-field",
                required: false,
                satisfied: false,
              },
            ],
          },
        },
        {
          runId: "run-2",
          generatedAt: "2026-03-21T09:00:00.000Z",
          recovered: false,
          outcomeLabel: "未恢复",
          sourceDiagnosis: {
            fingerprint: "bootstrap:plugin-not-mounted",
            featureLabel: "启动与挂载",
            candidateFiles: ["src/app/plugin.js"],
          },
          patch: {
            whitelistRuleId: "bootstrap-runtime-bridge",
            featureLabel: "启动与挂载",
            draftOperations: [
              { operation: "replace", count: 1 },
            ],
            resultReasonSummary: [
              { reason: "anchor-not-found", count: 1 },
            ],
          },
          verificationContract: {
            status: "verification-failed",
            checks: [
              {
                id: "restart-e2e",
                label: "重启策略 E2E 复验",
                kind: "all-cycle-check",
                required: true,
                satisfied: false,
              },
              {
                id: "item-pane-section-count",
                label: "ItemPane Section 注册计数",
                kind: "latest-cycle-check",
                required: true,
                satisfied: false,
              },
              {
                id: "service-unhealthy-count",
                label: "异常服务轮次数",
                kind: "report-field",
                required: false,
                satisfied: false,
              },
            ],
          },
        },
        {
          runId: "run-3",
          generatedAt: "2026-03-21T10:00:00.000Z",
          recovered: true,
          outcomeLabel: "已恢复",
          sourceDiagnosis: {
            fingerprint: "localization:item-pane-section-header-ftl-key-missing",
            featureLabel: "本地化引用修正",
            candidateFiles: ["addon-static/locale/zh-CN/main.ftl"],
          },
          patch: {
            whitelistRuleId: "localization-item-pane-section-header-ftl-key",
            featureLabel: "本地化引用修正",
            draftOperations: [
              { operation: "append", count: 1 },
            ],
            resultReasonSummary: [
              { reason: "applied", count: 1 },
            ],
          },
          verificationContract: {
            status: "verification-passed",
            checks: [
              {
                id: "locale-ftl-key",
                label: "Locale FTL Key 恢复",
                kind: "latest-cycle-check",
                required: true,
                satisfied: true,
              },
            ],
          },
        },
      ],
      signalTrends: {
        generatedAt: "2026-03-21T10:30:00.000Z",
        signals: [
          {
            signalId: "readerEvent",
            label: "Reader 事件桥",
            present: true,
            totalEntries: 2,
            okRate: 100,
            latestStatus: "passed",
            latestStatusLabel: "通过",
            latestObservedAt: "2026-03-21T10:00:00.000Z",
            trend: {
              direction: "flat",
              directionLabel: "持平",
            },
            metricHighlights: [
              {
                metricId: "knownTypeCount",
                label: "已知事件类型",
                latestValue: 8,
              },
            ],
          },
          {
            signalId: "e2e",
            label: "Zotero E2E",
            present: true,
            totalEntries: 2,
            okRate: 50,
            latestStatus: "failed",
            latestStatusLabel: "失败",
            latestObservedAt: "2026-03-21T10:00:00.000Z",
            trend: {
              direction: "flat",
              directionLabel: "持平",
            },
            metricHighlights: [
              {
                metricId: "testFailed",
                label: "失败测试",
                latestValue: 1,
              },
            ],
          },
        ],
        archive: {
          present: true,
          signalsDir: "dist/agent-memory/signals",
          signalIndexJSON: "dist/agent-memory/signals/index.json",
        },
      },
      now: "2026-03-21T10:30:00.000Z",
    });

    assert.equal(summary.present, true);
    assert.equal(summary.totalEntries, 3);
    assert.equal(summary.successCount, 2);
    assert.equal(summary.failureCount, 1);
    assert.equal(summary.uniqueFingerprintCount, 2);
    assert.equal(summary.currentIncident?.fingerprint, "bootstrap:plugin-not-mounted");
    assert.equal(summary.currentIncident?.seenBefore, true);
    assert.equal(summary.currentIncident?.historyCount, 2);
    assert.equal(summary.currentIncident?.preferredStrategy?.strategyId, "bootstrap-runtime-bridge");
    assert.equal(summary.currentIncident?.verificationPassedRate, 50);
    assert.equal(summary.currentIncident?.requiredFailedChecks?.[0]?.id, "item-pane-section-count");
    assert.equal(summary.currentIncident?.requiredFailedChecks?.[1]?.id, "restart-e2e");
    assert.equal(summary.currentIncident?.optionalFailedChecks?.[0]?.id, "cycle-failed-count");
    assert.equal(summary.currentIncident?.optionalFailedChecks?.[1]?.id, "service-unhealthy-count");
    assert.equal(summary.currentIncident?.failedCheckKinds?.[0]?.kind, "all-cycle-check");
    assert.equal(summary.currentIncident?.failedCheckKinds?.[1]?.kind, "latest-cycle-check");
    assert.equal(summary.currentIncident?.optionalFailedCheckKinds?.[0]?.kind, "report-field");
    assert.equal(summary.currentIncident?.optionalFailedCheckKinds?.[0]?.count, 2);
    assert.ok(summary.currentIncident?.candidateFiles.includes("src/app/plugin.js"));
    assert.equal(summary.failureMemory.hotFingerprints[0].fingerprint, "bootstrap:plugin-not-mounted");
    assert.equal(summary.failureMemory.hotFingerprints[0].count, 2);
    assert.equal(summary.failureMemory.hotFingerprints[0].verificationPassedRate, 50);
    assert.ok(summary.failureMemory.hotFingerprints[0].recentReasons.some((item) => item.reason === "anchor-not-found"));
    assert.ok(summary.fixOutcomeMemory.some((item) => item.preferredStrategy.strategyId === "bootstrap-runtime-bridge"));
    const bootstrapFixOutcome = summary.fixOutcomeMemory.find((item) => item.preferredStrategy?.strategyId === "bootstrap-runtime-bridge");
    assert.equal(bootstrapFixOutcome?.preferredStrategy?.verificationPassedRate, 50);
    assert.equal(bootstrapFixOutcome?.preferredStrategy?.requiredFailedChecks?.[0]?.id, "item-pane-section-count");
    assert.equal(bootstrapFixOutcome?.preferredStrategy?.optionalFailedCheckKinds?.[0]?.kind, "report-field");
    assert.equal(summary.reasonTrends?.topReasons?.[0]?.reason, "anchor-not-found");
    assert.equal(summary.reasonTrends?.topReasons?.[0]?.label, "锚点不存在");
    assert.equal(summary.reasonTrends?.topReasons?.[0]?.count, 1);
    assert.equal(summary.trend?.days?.[0]?.day, "2026-03-21");
    assert.equal(summary.trend?.days?.[0]?.total, 2);
    assert.equal(summary.trend?.days?.[1]?.day, "2026-03-20");
    assert.equal(summary.recentHistory?.length, 3);
    assert.equal(summary.fingerprints?.[0]?.latestOutcomeLabel, "未恢复");
    assert.equal(summary.fingerprints?.[0]?.trend?.days?.[0]?.day, "2026-03-21");
    assert.equal(summary.fingerprints?.[0]?.recentHistory?.[0]?.outcomeLabel, "未恢复");
    assert.equal(summary.signalTrends?.signals?.[0]?.signalId, "e2e");
    assert.equal(summary.recommendation?.nextAction, "npm run agent:zotero:autofix");
    assert.equal(summary.recommendation?.confidence, "low");
    assert.ok(String(summary.recommendation?.summary || "").includes("当前上下文"));
  });

  it("should recommend watch recovery action from regressing signals even without current incident", () => {
    const summary = summarizeAgentMemory({
      signalTrends: {
        generatedAt: "2026-03-21T10:30:00.000Z",
        signals: [
          {
            signalId: "watchRecovery",
            label: "恢复回归",
            latestStatus: "failed",
            latestStatusLabel: "失败",
            trend: {
              direction: "regressing",
              directionLabel: "回归中",
            },
            metricTrends: [
              {
                metricId: "missingTriggerCount",
                label: "缺失触发",
                latestValue: 1,
                direction: "regressing",
                directionLabel: "回归中",
              },
            ],
          },
        ],
      },
      now: "2026-03-21T10:30:00.000Z",
    });

    assert.equal(summary.recommendation?.nextAction, "npm run agent:zotero:watch-recovery");
    assert.equal(summary.recommendation?.confidence, "high");
    assert.ok(summary.recommendation?.supportingSignals.includes("watchRecovery"));
    assert.equal(summary.recommendation?.supportingMetrics?.[0]?.metricId, "missingTriggerCount");
  });

  it("should retain unsupported whitelist blockers in current incident reasons", () => {
    const summary = summarizeAgentMemory({
      e2eReport: {
        passed: false,
        primaryDiagnosis: {
          fingerprint: "menu-action:primary-action-failed",
          featureLabel: "主动作执行",
          candidateFiles: ["src/commands/run-primary-action.js"],
        },
      },
      historyEntries: [
        {
          runId: "run-unsupported-1",
          generatedAt: "2026-03-23T11:00:00.000Z",
          recovered: false,
          outcomeLabel: "未恢复",
          sourceDiagnosis: {
            fingerprint: "menu-action:primary-action-failed",
            featureLabel: "主动作执行",
            candidateFiles: ["src/commands/run-primary-action.js"],
          },
          patch: {
            whitelistRuleId: null,
            featureLabel: "主动作执行",
            unsupportedDiagnosisCategory: "behavioral-regression",
            unsupportedDiagnosisCategoryLabel: "行为回归",
            unsupportedDiagnosisReason: "当前故障表现为动作执行结果异常，仍需要先继续下钻成声明式入口或更小范围的结构化诊断。",
            resultReasonSummary: [],
          },
          verificationContract: {
            status: "verification-failed",
            checks: [],
          },
        },
      ],
      now: "2026-03-23T11:30:00.000Z",
    });

    assert.equal(summary.currentIncident?.fingerprint, "menu-action:primary-action-failed");
    assert.ok(summary.currentIncident?.recentReasons.some((item) => item.reason === "unsupported:behavioral-regression"));
    assert.ok(summary.reasonTrends?.topReasons.some((item) => item.reason === "unsupported:behavioral-regression"));
  });

  it("should retain all fixed unsupported blocker categories in current incident reasons", () => {
    const unsupportedTestCases = [
      {
        fingerprint: "bootstrap:plugin-not-mounted",
        category: "generic-runtime-failure",
        label: "泛化运行时失败",
      },
      {
        fingerprint: "menu-action:primary-action-failed",
        category: "behavioral-regression",
        label: "行为回归",
      },
      {
        fingerprint: "agent-action:agent-action-failed",
        category: "behavioral-regression",
        label: "行为回归",
      },
      {
        fingerprint: "tests:tests-failed",
        category: "unsafe-cross-file",
        label: "跨文件高风险回归",
      },
      {
        fingerprint: "scenarios:scenarios-failed",
        category: "unsafe-cross-file",
        label: "跨文件高风险回归",
      },
      {
        fingerprint: "runtime-logs:error-logs-present",
        category: "environment-or-host",
        label: "环境或宿主噪声",
      },
    ];

    for (const testCase of unsupportedTestCases) {
      const summary = summarizeAgentMemory({
        e2eReport: {
          passed: false,
          primaryDiagnosis: {
            fingerprint: testCase.fingerprint,
            featureLabel: "测试功能",
            candidateFiles: ["src/test.js"],
          },
        },
        historyEntries: [
          {
            runId: `run-unsupported-${testCase.fingerprint}`,
            generatedAt: "2026-03-23T11:00:00.000Z",
            recovered: false,
            outcomeLabel: "未恢复",
            sourceDiagnosis: {
              fingerprint: testCase.fingerprint,
              featureLabel: "测试功能",
              candidateFiles: ["src/test.js"],
            },
            patch: {
              whitelistRuleId: null,
              featureLabel: "测试功能",
              unsupportedDiagnosisCategory: testCase.category,
              unsupportedDiagnosisCategoryLabel: testCase.label,
              unsupportedDiagnosisReason: `诊断 ${testCase.fingerprint} 不在白名单内`,
              resultReasonSummary: [],
            },
            verificationContract: {
              status: "verification-failed",
              checks: [],
            },
          },
        ],
        now: "2026-03-23T11:30:00.000Z",
      });

      assert.equal(
        summary.currentIncident?.fingerprint,
        testCase.fingerprint,
        `Expected fingerprint ${testCase.fingerprint}`,
      );
      assert.ok(
        summary.currentIncident?.recentReasons.some((item) => item.reason === `unsupported:${testCase.category}`),
        `Expected unsupported:${testCase.category} in recentReasons for ${testCase.fingerprint}`,
      );
      assert.ok(
        summary.reasonTrends?.topReasons.some((item) => item.reason === `unsupported:${testCase.category}`),
        `Expected unsupported:${testCase.category} in reasonTrends for ${testCase.fingerprint}`,
      );
    }
  });

  it("should merge signal reason history into reason trends", () => {
    const summary = summarizeAgentMemory({
      signalTrends: {
        generatedAt: "2026-03-21T10:30:00.000Z",
        signals: [],
        reasonEntries: [
          {
            generatedAt: "2026-03-21T10:00:00.000Z",
            fingerprint: "signal:e2e",
            featureLabel: "Zotero E2E",
            success: false,
            outcomeLabel: "失败",
            strategyId: "signal:e2e",
            strategyLabel: "Zotero E2E 信号",
            candidateFiles: [],
            reason: "e2e:plugin-not-mounted",
            label: "Zotero E2E / 插件实例未挂载",
            weight: 2,
          },
        ],
      },
      now: "2026-03-21T10:30:00.000Z",
    });

    assert.equal(summary.reasonTrends?.topReasons?.[0]?.reason, "e2e:plugin-not-mounted");
    assert.equal(summary.reasonTrends?.topReasons?.[0]?.count, 2);
    assert.equal(summary.reasonTrends?.topReasons?.[0]?.trend?.days?.[0]?.total, 2);
    assert.equal(summary.reasonTrends?.topReasons?.[0]?.recentHistory?.[0]?.strategyLabel, "Zotero E2E 信号");
  });

  it("should classify signal issue text into stable reason categories", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-agent-memory-"));

    try {
      const signalTrends = await archiveAgentSignalHistory(tempRoot, {
        watch: {
          present: true,
          generatedAt: "2026-03-21T10:00:00.000Z",
          status: "failed",
          statusLabel: "失败",
          latestIssues: ["watch still unhealthy"],
          latestSummaryNote: "热重载后仍不健康",
        },
        e2e: {
          present: true,
          generatedAt: "2026-03-21T10:05:00.000Z",
          status: "failed",
          statusLabel: "失败",
          issues: [
            "插件实例未挂载到 Zotero[instanceKey]。",
            "服务健康异常：共 3 个服务，异常 1 个。",
          ],
          note: "动作链路失败",
          testFailed: 1,
          scenarioFailed: 1,
          visualDriftCount: 0,
          serviceUnhealthyCount: 1,
          capabilityUncoveredCount: 0,
        },
        readerEvent: {
          present: true,
          generatedAt: "2026-03-21T10:05:00.000Z",
          status: "failed",
          statusLabel: "异常",
          available: false,
          syntheticFallbackAvailable: false,
          hookScenarioStatus: "failed",
          fineGrainedScenarioStatus: "missing",
          note: "Reader 事件桥当前不可用。",
        },
        watchRecovery: {
          present: true,
          generatedAt: "2026-03-21T10:10:00.000Z",
          status: "failed",
          statusLabel: "失败",
          summaryNote: "恢复链未完成闭环",
          issues: [
            "未观测到 session-restart-recovery",
            "未观测到完整恢复触发序列：session-restart-recovery",
          ],
        },
        cpuProfiler: {
          present: true,
          generatedAt: "2026-03-21T10:12:00.000Z",
          status: "passed",
          statusLabel: "通过",
          summary: "profiler diagnostics captured 4/4 activity profile(s)",
          activityCount: 4,
          successfulActivityCount: 4,
          failedActivityCount: 0,
          totalCpuTime: 100,
          currentPluginCpuPercent: 40,
          unknownCpuPercent: 10,
        },
        memoryDiagnostics: {
          present: true,
          generatedAt: "2026-03-21T10:13:00.000Z",
          status: "passed",
          statusLabel: "通过",
          summary: "memory diagnostics captured 4/4 activity snapshot(s)",
          activityCount: 4,
          successfulActivityCount: 4,
          failedActivityCount: 0,
          rssDeltaMb: 16,
          residentDeltaMb: 16,
          explicitDeltaMb: 2,
        },
        gate: {
          generatedAt: "2026-03-21T10:15:00.000Z",
          gatePassed: false,
          issues: [
            "Zotero watch 健康状态已过期：最近一次状态时间距离现在约 2 小时。",
            "watch 问题：watch still unhealthy",
            "Reader 事件桥未通过：异常。",
            "Reader 事件 API 当前不可用，agent 无法稳定注册或观测 Reader Hook。",
            "Reader 事件桥缺少 synthetic-fallback，agent 无法稳定回放细粒度 Reader 探针事件。",
            "最近 Zotero E2E 未通过：失败。",
            "Zotero E2E 中仍有 1 条场景验证失败。",
            "能力地图仍有 2 个需场景覆盖的能力未被本次 E2E 覆盖。",
            "最近 Zotero E2E 未通过，且还没有对应的自动修复记录。",
            "最近 watch 恢复回归未通过，说明受控故障下的恢复链路仍不稳定。",
            "恢复回归问题：未观测到完整恢复触发序列：session-restart-recovery",
          ],
          recommendations: [],
          metrics: {
            recentFailed: 1,
            effectiveFailed: 1,
          },
        },
      }, {
        now: "2026-03-21T10:30:00.000Z",
      });

      const reasonKeys = Array.isArray(signalTrends.reasonEntries)
        ? signalTrends.reasonEntries.map((item) => item.reason)
        : [];

      assert.includes(reasonKeys, "watch:unhealthy");
      assert.includes(reasonKeys, "e2e:plugin-not-mounted");
      assert.includes(reasonKeys, "e2e:service-unhealthy");
      assert.includes(reasonKeys, "readerEvent:event-api-unavailable");
      assert.includes(reasonKeys, "readerEvent:synthetic-fallback-missing");
      assert.includes(reasonKeys, "readerEvent:hook-failed");
      assert.includes(reasonKeys, "readerEvent:fine-grained-missing");
      assert.includes(reasonKeys, "watchRecovery:missing-session-restart");
      assert.includes(reasonKeys, "watchRecovery:sequence-incomplete");
      assert.includes(reasonKeys, "gate:watch-stale");
      assert.includes(reasonKeys, "gate:watch-unhealthy");
      assert.includes(reasonKeys, "gate:reader-event-failed");
      assert.includes(reasonKeys, "gate:reader-event-api-unavailable");
      assert.includes(reasonKeys, "gate:reader-event-synthetic-fallback-missing");
      assert.includes(reasonKeys, "gate:e2e-failed");
      assert.includes(reasonKeys, "gate:scenario-failed");
      assert.includes(reasonKeys, "gate:capability-uncovered");
      assert.includes(reasonKeys, "gate:autofix-missing");
      assert.includes(reasonKeys, "gate:watch-recovery-failed");
      assert.includes(reasonKeys, "gate:watch-recovery-sequence-incomplete");
      const cpuProfiler = signalTrends.signals.find((item) => item.signalId === "cpuProfiler");
      assert.equal(cpuProfiler?.latestStatus, "passed");
      assert.equal(cpuProfiler?.metricTrends?.some((item) => item.metricId === "currentPluginCpuPercent"), true);
      const memoryDiagnostics = signalTrends.signals.find((item) => item.signalId === "memoryDiagnostics");
      assert.equal(memoryDiagnostics?.latestStatus, "passed");
      assert.equal(memoryDiagnostics?.metricTrends?.some((item) => item.metricId === "rssDeltaMb"), true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("should derive stable e2e reason categories from primary diagnosis fingerprints", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-agent-memory-e2e-diag-"));

    try {
      await archiveAgentSignalHistory(tempRoot, {
        e2e: {
          present: true,
          generatedAt: "2026-03-21T10:03:00.000Z",
          status: "failed",
          statusLabel: "失败",
          issues: [
            "静态运行时基线缺失：addon-static/bootstrap.js（bootstrap 启动脚本）。",
          ],
          note: "启动链路在静态体检阶段已发现 bootstrap 缺失。",
          primaryDiagnosis: {
            fingerprint: "bootstrap:bootstrap-file-missing",
          },
        },
      }, {
        now: "2026-03-21T10:04:00.000Z",
      });

      await archiveAgentSignalHistory(tempRoot, {
        e2e: {
          present: true,
          generatedAt: "2026-03-21T10:05:00.000Z",
          status: "failed",
          statusLabel: "失败",
          issues: [
            "偏好设置面板未注册。",
            "检测到 1 条 error 级日志。",
          ],
          note: "偏好设置面板未注册。",
          primaryDiagnosis: {
            fingerprint: "preferences:preference-pane-resource-missing",
          },
        },
      }, {
        now: "2026-03-21T10:06:00.000Z",
      });

      await archiveAgentSignalHistory(tempRoot, {
        e2e: {
          present: true,
          generatedAt: "2026-03-21T10:07:00.000Z",
          status: "failed",
          statusLabel: "失败",
          issues: [
            "检测到 1 条 error 级日志。",
          ],
          note: "结构化诊断指向生命周期缺口。",
          primaryDiagnosis: {
            fingerprint: "lifecycle:baseline-registration-missing",
          },
        },
      }, {
        now: "2026-03-21T10:08:00.000Z",
      });

      await archiveAgentSignalHistory(tempRoot, {
        e2e: {
          present: true,
          generatedAt: "2026-03-21T10:09:00.000Z",
          status: "failed",
          statusLabel: "失败",
          issues: [
            "检测到 1 条 error 级日志。",
          ],
          note: "结构化诊断指向本地化漂移。",
          primaryDiagnosis: {
            fingerprint: "localization:item-pane-info-row-l10n-id-drift",
          },
        },
      }, {
        now: "2026-03-21T10:10:00.000Z",
      });

      const signalTrends = await archiveAgentSignalHistory(tempRoot, {
        e2e: {
          present: true,
          generatedAt: "2026-03-21T10:11:00.000Z",
          status: "failed",
          statusLabel: "失败",
          issues: [
            "检测到 1 条 error 级日志。",
          ],
          note: "运行时仍有资源加载错误。",
          primaryDiagnosis: {
            fingerprint: "runtime-logs:style-sheet-resource-missing",
          },
        },
      }, {
        now: "2026-03-21T10:12:00.000Z",
      });

      const reasonKeys = Array.isArray(signalTrends.reasonEntries)
        ? signalTrends.reasonEntries.map((item) => item.reason)
        : [];

      assert.includes(reasonKeys, "e2e:preference-pane-resource-missing");
      assert.includes(reasonKeys, "e2e:baseline-registration-missing");
      assert.includes(reasonKeys, "e2e:item-pane-l10n-drift");
      assert.includes(reasonKeys, "e2e:style-resource-missing");
      assert.includes(reasonKeys, "e2e:bootstrap-file-missing");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("should fold legacy reader aliases into canonical fingerprint groups", () => {
    const summary = summarizeAgentMemory({
      e2eReport: {
        generatedAt: "2026-03-24T11:00:00.000Z",
        passed: false,
        primaryDiagnosis: {
          fingerprint: "reader-entry:declarative-reader-mapping-drift",
          featureLabel: "Reader 声明式入口映射",
          candidateFiles: ["src/app/feature-composer.js"],
        },
      },
      historyEntries: [
        {
          runId: "reader-alias-1",
          generatedAt: "2026-03-24T10:00:00.000Z",
          recovered: false,
          outcomeLabel: "未恢复",
          sourceDiagnosis: {
            fingerprint: "reader-entry:reader-summary-command-missing",
            featureLabel: "Reader 声明式入口映射",
            candidateFiles: ["src/app/feature-composer.js"],
          },
          patch: {
            whitelistRuleId: "reader-entry-declarative-mapping",
            featureLabel: "Reader 声明式入口映射",
            draftOperations: [{ operation: "replace-block", count: 1 }],
            resultReasonSummary: [{ reason: "anchor-not-found", count: 1 }],
          },
          verificationContract: {
            status: "verification-failed",
            checks: [
              {
                id: "reader-entry-check",
                label: "Reader 声明式入口检查",
                kind: "latest-cycle-check",
                required: true,
                satisfied: false,
              },
            ],
          },
        },
        {
          runId: "reader-alias-2",
          generatedAt: "2026-03-24T10:30:00.000Z",
          recovered: true,
          outcomeLabel: "已恢复",
          sourceDiagnosis: {
            fingerprint: "reader-entry:reader-summary-menu-missing",
            featureLabel: "Reader 声明式入口映射",
            candidateFiles: ["src/app/feature-composer.js"],
          },
          patch: {
            whitelistRuleId: "reader-entry-declarative-mapping",
            featureLabel: "Reader 声明式入口映射",
            draftOperations: [{ operation: "replace-block", count: 1 }],
            resultReasonSummary: [{ reason: "applied", count: 1 }],
          },
          verificationContract: {
            status: "verification-passed",
            checks: [
              {
                id: "reader-entry-check",
                label: "Reader 声明式入口检查",
                kind: "latest-cycle-check",
                required: true,
                satisfied: true,
              },
            ],
          },
        },
      ],
      now: "2026-03-24T11:05:00.000Z",
    });

    assert.equal(summary.uniqueFingerprintCount, 1);
    assert.equal(summary.currentIncident?.fingerprint, "reader-entry:declarative-reader-mapping-drift");
    assert.equal(summary.failureMemory.hotFingerprints?.[0]?.fingerprint, "reader-entry:declarative-reader-mapping-drift");
    assert.equal(summary.failureMemory.hotFingerprints?.[0]?.count, 2);
    assert.equal(summary.fixOutcomeMemory?.[0]?.fingerprint, "reader-entry:declarative-reader-mapping-drift");
    assert.ok(
      summary.failureMemory.hotFingerprints?.[0]?.recentHistory?.every(
        (item) => item.fingerprint === "reader-entry:declarative-reader-mapping-drift",
      ),
    );
  });

  it("should normalize legacy stale watch reasons into stable status categories", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-agent-memory-migrate-"));
    const legacyWatchPath = path.join(tempRoot, "dist", "agent-memory", "signals", "watch.json");

    try {
      fs.mkdirSync(path.dirname(legacyWatchPath), { recursive: true });
      fs.writeFileSync(legacyWatchPath, `${JSON.stringify({
        generatedAt: "2026-03-20T14:08:13.547Z",
        signalId: "watch",
        label: "Watch 热重载",
        entries: [
          {
            signalId: "watch",
            label: "Watch 热重载",
            observedAt: "2026-03-20T14:08:13.547Z",
            status: "stale",
            statusLabel: "已过期",
            ok: false,
            detail: "启动完成并通过健康检查",
            metrics: {
              latestTrigger: "startup",
              issueCount: 0,
            },
            reasons: [
              {
                reason: "watch:issue:issue",
                label: "Watch 热重载 / 启动完成并通过健康检查",
                count: 1,
                sourceSignalId: "watch",
                sourceSignalLabel: "Watch 热重载",
              },
            ],
          },
        ],
      }, null, 2)}\n`, "utf-8");

      const signalTrends = await archiveAgentSignalHistory(tempRoot, {
        watch: {
          present: true,
          generatedAt: "2026-03-20T14:08:13.547Z",
          status: "stale",
          statusLabel: "已过期",
          latestIssues: [],
          latestSummaryNote: "启动完成并通过健康检查",
        },
      }, {
        now: "2026-03-21T10:30:00.000Z",
      });

      const persisted = JSON.parse(fs.readFileSync(legacyWatchPath, "utf-8"));
      assert.includes(
        Array.isArray(signalTrends.reasonEntries) ? signalTrends.reasonEntries.map((item) => item.reason) : [],
        "watch:stale",
      );
      assert.equal(persisted.entries?.[0]?.reasons?.[0]?.reason, "watch:stale");
      assert.equal(persisted.entries?.[0]?.reasons?.[0]?.label, "Watch 热重载 / watch 健康状态已过期");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("should archive richer e2e metrics and prioritize high-signal highlights", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-agent-memory-e2e-metrics-"));

    try {
      const signalTrends = await archiveAgentSignalHistory(tempRoot, {
        e2e: {
          present: true,
          generatedAt: "2026-03-21T10:05:00.000Z",
          status: "failed",
          statusLabel: "失败",
          issues: [
            "服务健康异常：共 3 个服务，异常 2 个。",
            "能力地图仍有 3 个需场景覆盖的能力未被本次 E2E 覆盖。",
          ],
          note: "动作链路失败",
          failedCycles: 2,
          testFailed: 1,
          scenarioFailed: 1,
          logErrorCount: 4,
          visualDriftCount: 1,
          visualMissingCount: 2,
          serviceUnhealthyCount: 2,
          capabilityFailedCount: 1,
          capabilityUncoveredCount: 3,
          primaryActionCommandMissingCycles: 1,
        },
      }, {
        now: "2026-03-21T10:30:00.000Z",
      });

      const e2eSignal = signalTrends.signals.find((item) => item.signalId === "e2e");
      assert.ok(e2eSignal);
      assert.equal(e2eSignal.metricTrends.some((item) => item.metricId === "cycleFailedCount" && item.latestValue === 2), true);
      assert.equal(e2eSignal.metricTrends.some((item) => item.metricId === "logErrorCount" && item.latestValue === 4), true);
      assert.equal(e2eSignal.metricTrends.some((item) => item.metricId === "visualMissingCount" && item.latestValue === 2), true);
      assert.deepEqual(
        e2eSignal.metricHighlights.map((item) => item.metricId),
        ["logErrorCount", "capabilityUncoveredCount", "cycleFailedCount"],
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("should archive reader event signal metrics and prioritize degradations", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-agent-memory-reader-event-"));

    try {
      const signalTrends = await archiveAgentSignalHistory(tempRoot, {
        e2e: {
          present: true,
          generatedAt: "2026-03-21T10:05:00.000Z",
          status: "passed",
          statusLabel: "通过",
          capabilityStatuses: [{
            id: "reader-event-hooks",
            label: "Reader 事件桥",
            status: "passed",
            scenarioNames: ["reader event hook diagnostics"],
          }],
          readerEventReport: {
            present: true,
            status: "failed",
            statusLabel: "异常",
            available: false,
            knownTypeCount: 8,
            probeCompatibleTypeCount: 8,
            probeObservedTypeCount: 7,
            syntheticFallbackAvailable: false,
            hookScenarioStatus: "failed",
            fineGrainedScenarioStatus: "missing",
            note: "Reader 事件桥当前不可用。",
          },
        },
      }, {
        now: "2026-03-21T10:30:00.000Z",
      });

      const readerEventSignal = signalTrends.signals.find((item) => item.signalId === "readerEvent");
      assert.ok(readerEventSignal);
      assert.equal(readerEventSignal.latestStatus, "failed");
      assert.equal(readerEventSignal.metricTrends.some((item) => item.metricId === "unavailableCount" && item.latestValue === 1), true);
      assert.equal(readerEventSignal.metricTrends.some((item) => item.metricId === "syntheticFallbackMissingCount" && item.latestValue === 1), true);
      assert.equal(readerEventSignal.metricTrends.some((item) => item.metricId === "knownTypeCount" && item.latestValue === 8), true);
      assert.deepEqual(
        readerEventSignal.metricHighlights.map((item) => item.metricId),
        ["unavailableCount", "syntheticFallbackMissingCount", "hookFailedCount"],
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("should include richer e2e metrics in historical recommendation support", () => {
    const summary = summarizeAgentMemory({
      signalTrends: {
        generatedAt: "2026-03-21T10:30:00.000Z",
        signals: [
          {
            signalId: "e2e",
            label: "Zotero E2E",
            latestStatus: "failed",
            latestStatusLabel: "失败",
            trend: {
              direction: "regressing",
              directionLabel: "回归中",
            },
            metricTrends: [
              {
                metricId: "cycleFailedCount",
                label: "失败轮次",
                latestValue: 2,
                direction: "regressing",
                directionLabel: "回归中",
              },
              {
                metricId: "logErrorCount",
                label: "错误日志",
                latestValue: 4,
                direction: "regressing",
                directionLabel: "回归中",
              },
              {
                metricId: "visualMissingCount",
                label: "视觉缺失",
                latestValue: 1,
                direction: "regressing",
                directionLabel: "回归中",
              },
              {
                metricId: "serviceUnhealthyCount",
                label: "异常服务",
                latestValue: 2,
                direction: "regressing",
                directionLabel: "回归中",
              },
              {
                metricId: "capabilityUncoveredCount",
                label: "未覆盖能力",
                latestValue: 3,
                direction: "regressing",
                directionLabel: "回归中",
              },
            ],
          },
        ],
      },
      now: "2026-03-21T10:30:00.000Z",
    });

    assert.equal(summary.recommendation?.nextAction, "npm run agent:zotero:e2e");
    assert.ok(summary.recommendation?.supportingSignals.includes("e2e"));
    assert.equal(summary.recommendation?.supportingMetrics?.some((item) => item.metricId === "cycleFailedCount"), true);
    assert.equal(summary.recommendation?.supportingMetrics?.some((item) => item.metricId === "logErrorCount"), true);
    assert.equal(summary.recommendation?.supportingMetrics?.some((item) => item.metricId === "visualMissingCount"), true);
    assert.equal(summary.recommendation?.supportingMetrics?.some((item) => item.metricId === "capabilityUncoveredCount"), true);
  });

  it("should recommend e2e rerun when reader event signal is regressing", () => {
    const summary = summarizeAgentMemory({
      signalTrends: {
        generatedAt: "2026-03-21T10:30:00.000Z",
        signals: [
          {
            signalId: "readerEvent",
            label: "Reader 事件桥",
            latestStatus: "failed",
            latestStatusLabel: "异常",
            trend: {
              direction: "regressing",
              directionLabel: "回归中",
            },
            metricTrends: [
              {
                metricId: "unavailableCount",
                label: "事件 API 不可用",
                latestValue: 1,
                direction: "regressing",
                directionLabel: "回归中",
              },
              {
                metricId: "syntheticFallbackMissingCount",
                label: "缺少 synthetic-fallback",
                latestValue: 1,
                direction: "regressing",
                directionLabel: "回归中",
              },
            ],
          },
        ],
      },
      now: "2026-03-21T10:30:00.000Z",
    });

    assert.equal(summary.recommendation?.nextAction, "npm run agent:zotero:e2e");
    assert.equal(summary.recommendation?.confidence, "high");
    assert.ok(summary.recommendation?.supportingSignals.includes("readerEvent"));
    assert.equal(summary.recommendation?.supportingMetrics?.some((item) => item.metricId === "unavailableCount"), true);
    assert.equal(summary.recommendation?.supportingMetrics?.some((item) => item.metricId === "syntheticFallbackMissingCount"), true);
  });

  it("should prefer exact context strategy over stronger global history", () => {
    const summary = summarizeAgentMemory({
      e2eReport: {
        generatedAt: "2026-03-21T10:30:00.000Z",
        zoteroVersion: "8.0.2-beta.5+c35d7f21e",
        passed: false,
        primaryDiagnosis: {
          fingerprint: "bootstrap:plugin-not-mounted",
          featureLabel: "启动与挂载",
          candidateFiles: ["src/app/plugin.js"],
        },
        cycles: [
          { index: 1, bootMode: "hot-reload", passed: false },
        ],
      },
      historyEntries: [
        {
          runId: "ctx-hot-1",
          generatedAt: "2026-03-21T09:00:00.000Z",
          recovered: true,
          outcomeLabel: "已恢复",
          runtimeContext: {
            zoteroVersion: "8.0.2-beta.4",
            latestBootMode: "hot-reload",
            bootModes: ["hot-reload"],
          },
          sourceDiagnosis: {
            fingerprint: "bootstrap:plugin-not-mounted",
            featureLabel: "启动与挂载",
            candidateFiles: ["src/app/plugin.js"],
          },
          patch: {
            whitelistRuleId: "bootstrap-hot-context",
            featureLabel: "启动与挂载",
            draftOperations: [{ operation: "replace", count: 1 }],
            resultReasonSummary: [{ reason: "applied", count: 1 }],
          },
          verificationContract: {
            status: "verification-passed",
            checks: [
              {
                id: "restart-e2e",
                label: "重启策略 E2E 复验",
                kind: "all-cycle-check",
                required: true,
                satisfied: true,
              },
            ],
          },
        },
        {
          runId: "ctx-restart-1",
          generatedAt: "2026-03-21T08:00:00.000Z",
          recovered: true,
          outcomeLabel: "已恢复",
          runtimeContext: {
            zoteroVersion: "8.0.2-beta.4",
            latestBootMode: "restart",
            bootModes: ["restart"],
          },
          sourceDiagnosis: {
            fingerprint: "bootstrap:plugin-not-mounted",
            featureLabel: "启动与挂载",
          },
          patch: {
            whitelistRuleId: "bootstrap-restart-global",
            featureLabel: "启动与挂载",
            draftOperations: [{ operation: "replace", count: 1 }],
            resultReasonSummary: [{ reason: "applied", count: 1 }],
          },
          verificationContract: {
            status: "verification-passed",
            checks: [
              {
                id: "restart-e2e",
                label: "重启策略 E2E 复验",
                kind: "all-cycle-check",
                required: true,
                satisfied: true,
              },
            ],
          },
        },
        {
          runId: "ctx-restart-2",
          generatedAt: "2026-03-21T07:00:00.000Z",
          recovered: true,
          outcomeLabel: "已恢复",
          runtimeContext: {
            zoteroVersion: "8.0.1-beta.9",
            latestBootMode: "restart",
            bootModes: ["restart"],
          },
          sourceDiagnosis: {
            fingerprint: "bootstrap:plugin-not-mounted",
            featureLabel: "启动与挂载",
          },
          patch: {
            whitelistRuleId: "bootstrap-restart-global",
            featureLabel: "启动与挂载",
            draftOperations: [{ operation: "replace", count: 1 }],
            resultReasonSummary: [{ reason: "applied", count: 1 }],
          },
          verificationContract: {
            status: "verification-passed",
            checks: [
              {
                id: "restart-e2e",
                label: "重启策略 E2E 复验",
                kind: "all-cycle-check",
                required: true,
                satisfied: true,
              },
            ],
          },
        },
      ],
      now: "2026-03-21T10:35:00.000Z",
    });

    assert.equal(summary.currentIncident?.context?.latestBootMode, "hot-reload");
    assert.equal(summary.currentIncident?.context?.zoteroVersionBucket, "8.0-beta");
    assert.equal(summary.currentIncident?.preferredStrategy?.strategyId, "bootstrap-hot-context");
    assert.equal(summary.currentIncident?.preferredStrategy?.contextMatchLevel, "exact-context");
    assert.equal(summary.currentIncident?.preferredStrategy?.contextAttempts, 1);
    assert.equal(summary.currentIncident?.preferredStrategy?.contextSuccessRate, 100);
    assert.equal(summary.currentIncident?.preferredStrategy?.globalSuccessRate, 100);
    assert.ok(Array.isArray(summary.failureMemory.hotFingerprints?.[0]?.contexts));
    assert.equal(summary.failureMemory.hotFingerprints?.[0]?.contexts?.[0]?.latestBootMode, "restart");
    assert.equal(summary.recommendation?.nextAction, "npm run agent:zotero:autofix");
    assert.equal(summary.recommendation?.confidence, "high");
  });

  it("should fallback legacy history into fingerprint global without exact context", () => {
    const summary = summarizeAgentMemory({
      e2eReport: {
        generatedAt: "2026-03-21T10:30:00.000Z",
        zoteroVersion: "8.0.1",
        passed: false,
        primaryDiagnosis: {
          fingerprint: "bootstrap:plugin-not-mounted",
          featureLabel: "启动与挂载",
          candidateFiles: ["src/app/plugin.js"],
        },
        cycles: [
          { index: 1, bootMode: "hot-reload", passed: false },
        ],
      },
      historyEntries: [
        {
          runId: "legacy-1",
          generatedAt: "2026-03-21T09:00:00.000Z",
          recovered: false,
          outcomeLabel: "未恢复",
          sourceDiagnosis: {
            fingerprint: "bootstrap:plugin-not-mounted",
            featureLabel: "启动与挂载",
          },
          patch: {
            whitelistRuleId: "bootstrap-runtime-bridge",
            featureLabel: "启动与挂载",
            draftOperations: [{ operation: "replace", count: 1 }],
            resultReasonSummary: [{ reason: "anchor-not-found", count: 1 }],
          },
          verificationContract: {
            status: "verification-failed",
            checks: [
              {
                id: "restart-e2e",
                label: "重启策略 E2E 复验",
                kind: "all-cycle-check",
                required: true,
                satisfied: false,
              },
            ],
          },
        },
      ],
      now: "2026-03-21T10:35:00.000Z",
    });

    assert.equal(summary.currentIncident?.preferredStrategy?.contextMatchLevel, "fingerprint-global");
    assert.equal(summary.currentIncident?.preferredStrategy?.contextAttempts, 0);
    assert.equal(summary.currentIncident?.preferredStrategy?.contextSuccessRate, 0);
    assert.deepEqual(summary.failureMemory.hotFingerprints?.[0]?.contexts, []);
  });

  it("should archive release matrix signal metrics", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate4z-agent-memory-release-matrix-"));

    try {
      const signalTrends = await archiveAgentSignalHistory(tempRoot, {
        releaseMatrix: {
          generatedAt: "2026-03-21T10:20:00.000Z",
          status: "attention",
          statusLabel: "待补验证",
          summary: "Beta 渠道仍缺安装态 smoke。",
          failedProfileCount: 1,
          attentionProfileCount: 1,
          artifactChecks: [
            { id: "xpi-present", passed: true },
            { id: "xpi-hash-match", passed: false },
          ],
          profiles: [
            {
              id: "stable",
              label: "稳定版",
              installSmokePresent: true,
            },
            {
              id: "beta",
              label: "Beta 版",
              installSmokePresent: false,
            },
          ],
          blockingIssues: ["Beta 渠道 smoke 未通过"],
          attentionIssues: ["Beta 渠道尚未完成安装态 smoke"],
        },
      }, {
        now: "2026-03-21T10:30:00.000Z",
      });

      const releaseMatrixSignal = signalTrends.signals.find((item) => item.signalId === "releaseMatrix");
      assert.ok(releaseMatrixSignal);
      assert.equal(releaseMatrixSignal.latestStatus, "attention");
      assert.equal(releaseMatrixSignal.metricTrends.some((item) => item.metricId === "failedProfileCount" && item.latestValue === 1), true);
      assert.equal(releaseMatrixSignal.metricTrends.some((item) => item.metricId === "attentionProfileCount" && item.latestValue === 1), true);
      assert.equal(releaseMatrixSignal.metricTrends.some((item) => item.metricId === "installSmokeMissingCount" && item.latestValue === 1), true);
      assert.equal(releaseMatrixSignal.metricTrends.some((item) => item.metricId === "artifactCheckFailedCount" && item.latestValue === 1), true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("should render memory markdown in Chinese", () => {
    const markdown = buildAgentMemoryMarkdown({
      generatedAt: "2026-03-21T10:30:00.000Z",
      totalEntries: 2,
      successCount: 1,
      failureCount: 1,
      uniqueFingerprintCount: 1,
      currentIncident: {
        fingerprint: "bootstrap:plugin-not-mounted",
        featureLabel: "启动与挂载",
        seenBefore: true,
        historyCount: 2,
        successCount: 1,
        failureCount: 1,
        lastSeenAt: "2026-03-21T09:00:00.000Z",
        candidateFiles: ["src/app/plugin.js"],
        context: {
          latestBootMode: "hot-reload",
          zoteroVersionBucket: "8.0-beta",
        },
        preferredStrategy: {
          strategyLabel: "启动与挂载 / bootstrap-runtime-bridge",
          successRate: 50,
          verificationPassedRate: 50,
          successCount: 1,
          attempts: 2,
          contextMatchLevel: "exact-context",
          contextAttempts: 1,
          contextSuccessRate: 100,
          globalSuccessRate: 50,
          latestBootMode: "hot-reload",
          zoteroVersionBucket: "8.0-beta",
        },
        verificationPassedRate: 50,
        contexts: [{
          latestBootMode: "hot-reload",
          zoteroVersionBucket: "8.0-beta",
          attempts: 1,
        }],
        requiredFailedChecks: [{
          id: "restart-e2e",
          label: "重启策略 E2E 复验",
          count: 1,
        }],
        optionalFailedChecks: [{
          id: "visual-drift-count",
          label: "视觉漂移数量",
          count: 1,
        }],
        failedCheckKinds: [{
          kind: "all-cycle-check",
          label: "跨轮次检查",
          count: 1,
        }],
        optionalFailedCheckKinds: [{
          kind: "report-field",
          label: "聚合报告字段",
          count: 1,
        }],
        recentReasons: [{ label: "锚点不存在", count: 1 }],
        draftOperations: [{ label: "替换内容", count: 2 }],
      },
      trend: {
        direction: "improving",
        directionLabel: "改善中",
        summary: "最近窗口成功率更高。",
        recentWindow: {
          total: 2,
          successRate: 100,
        },
        previousWindow: {
          total: 1,
          successRate: 0,
        },
        days: [
          {
            day: "2026-03-21",
            total: 2,
            successCount: 2,
            failureCount: 0,
            successRate: 100,
            uniqueFingerprintCount: 1,
          },
        ],
      },
      recentHistory: [
        {
          generatedAt: "2026-03-21T09:00:00.000Z",
          fingerprint: "bootstrap:plugin-not-mounted",
          featureLabel: "启动与挂载",
          outcomeLabel: "未恢复",
          strategyLabel: "启动与挂载 / bootstrap-runtime-bridge",
          candidateFiles: ["src/app/plugin.js"],
        },
      ],
      signalTrends: {
        signals: [
          {
            signalId: "watch",
            label: "Watch 热重载",
            totalEntries: 3,
            okRate: 66.67,
            latestStatusLabel: "健康",
            latestObservedAt: "2026-03-21T09:30:00.000Z",
            trend: {
              directionLabel: "改善中",
            },
            metricHighlights: [
              {
                metricId: "issueCount",
                label: "问题数",
                latestValue: 2,
              },
            ],
          },
          {
            signalId: "releaseMatrix",
            label: "本地发布矩阵",
            totalEntries: 2,
            okRate: 50,
            latestStatusLabel: "待补验证",
            latestObservedAt: "2026-03-21T10:00:00.000Z",
            trend: {
              directionLabel: "持平",
            },
            metricHighlights: [
              {
                metricId: "installSmokeMissingCount",
                label: "缺失安装态 smoke",
                latestValue: 1,
              },
            ],
          },
        ],
        archive: {
          signalIndexJSON: "dist/agent-memory/signals/index.json",
        },
      },
      reasonTrends: {
        topReasons: [
          {
            reason: "anchor-not-found",
            label: "锚点不存在",
            count: 2,
            successRate: 0,
            lastSeenAt: "2026-03-21T09:00:00.000Z",
            uniqueFingerprintCount: 1,
            trend: {
              directionLabel: "回归中",
            },
          },
        ],
        archive: {
          reasonIndexJSON: "dist/agent-memory/reasons/index.json",
        },
      },
      recommendation: {
        title: "优先复用历史最优恢复路径",
        nextAction: "npm run agent:zotero:autofix",
        confidence: "medium",
        summary: "该指纹历史最优路径成功率更高。",
        candidateFiles: ["src/app/plugin.js"],
        supportingSignals: ["autofix"],
        supportingMetrics: [
          {
            signalLabel: "自动修复",
            metricLabel: "失败步骤",
            value: 1,
          },
        ],
      },
      failureMemory: {
        hotFingerprints: [
          {
            fingerprint: "bootstrap:plugin-not-mounted",
            featureLabel: "启动与挂载",
            count: 2,
            successRate: 50,
            lastSeenAt: "2026-03-21T09:00:00.000Z",
            contexts: [{
              latestBootMode: "hot-reload",
              zoteroVersionBucket: "8.0-beta",
              attempts: 1,
            }],
            preferredStrategy: {
              strategyLabel: "启动与挂载 / bootstrap-runtime-bridge",
              successRate: 50,
              successCount: 1,
              attempts: 2,
            },
          },
        ],
      },
      fixOutcomeMemory: [
        {
          fingerprint: "bootstrap:plugin-not-mounted",
          candidateFiles: ["src/app/plugin.js"],
          preferredStrategy: {
            strategyLabel: "启动与挂载 / bootstrap-runtime-bridge",
            latestBootMode: "hot-reload",
            zoteroVersionBucket: "8.0-beta",
            successRate: 50,
            verificationPassedRate: 50,
            lastSuccessfulAt: "2026-03-21T08:00:00.000Z",
          },
        },
      ],
      fingerprints: [
        {
          fingerprint: "bootstrap:plugin-not-mounted",
          trend: {
            directionLabel: "回归中",
          },
          latestOutcomeLabel: "未恢复",
          latestStrategyLabel: "启动与挂载 / bootstrap-runtime-bridge",
          lastSeenAt: "2026-03-21T09:00:00.000Z",
          recentHistory: [
            {
              generatedAt: "2026-03-21T09:00:00.000Z",
              outcomeLabel: "未恢复",
              strategyLabel: "启动与挂载 / bootstrap-runtime-bridge",
            },
          ],
          preferredStrategy: {
            strategyLabel: "启动与挂载 / bootstrap-runtime-bridge",
          },
        },
      ],
      archive: {
        present: true,
        reportJSON: "dist/agent-memory.json",
        reportMD: "dist/agent-memory.md",
        latestJSON: "dist/agent-memory/latest.json",
        latestMD: "dist/agent-memory/latest.md",
        snapshotJSON: "dist/agent-memory/snapshots/20260321T103000000Z.json",
        snapshotMD: "dist/agent-memory/snapshots/20260321T103000000Z.md",
        historyIndexJSON: "dist/agent-memory/history-index.json",
        fingerprintIndexJSON: "dist/agent-memory/fingerprints/index.json",
      },
    });

    assert.ok(markdown.includes("# Agent 记忆层"));
    assert.ok(markdown.includes("## 近期趋势"));
    assert.ok(markdown.includes("## 当前故障记忆"));
    assert.ok(markdown.includes("当前上下文"));
    assert.ok(markdown.includes("上下文命中级别"));
    assert.ok(markdown.includes("上下文成功率"));
    assert.ok(markdown.includes("全局成功率"));
    assert.ok(markdown.includes("复验通过率"));
    assert.ok(markdown.includes("常见必需失败"));
    assert.ok(markdown.includes("常见观察失败"));
    assert.ok(markdown.includes("失败类型画像"));
    assert.ok(markdown.includes("## 历史推荐"));
    assert.ok(markdown.includes("推荐置信度"));
    assert.ok(markdown.includes("支撑指标"));
    assert.ok(markdown.includes("## 最近样本"));
    assert.ok(markdown.includes("## 运行信号趋势"));
    assert.ok(markdown.includes("## 阻塞原因趋势"));
    assert.ok(markdown.includes("锚点不存在 / anchor-not-found"));
    assert.ok(markdown.includes("问题数 2"));
    assert.ok(markdown.includes("npm run agent:zotero:autofix"));
    assert.ok(markdown.includes("历史最优路径"));
    assert.ok(markdown.includes("## 故障记忆 Top"));
    assert.ok(markdown.includes("## 修复结果记忆"));
    assert.ok(markdown.includes("| 指纹 | 历史最优路径 | 上下文摘要 | 成功率 | 复验通过率 | 最近成功 | 候选文件 |"));
    assert.ok(markdown.includes("上下文摘要"));
    assert.ok(markdown.includes("## 重点指纹时间序列"));
    assert.ok(markdown.includes("回归中"));
    assert.ok(markdown.includes("## 归档工件"));
    assert.ok(markdown.includes("Watch 热重载"));
    assert.ok(markdown.includes("本地发布矩阵"));
    assert.ok(markdown.includes("bootstrap:plugin-not-mounted"));
  });

  it("should cap long reason archive filenames to avoid ENAMETOOLONG", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-memory-long-reason-"));
    const longReason = "issue " + "reader stage restart ".repeat(80);
    try {
      await writeAgentMemoryArtifacts(projectRoot, {
        generatedAt: "2026-03-21T10:30:00.000Z",
        present: true,
        reasonTrends: {
          topReasons: [
            {
              reason: longReason,
              label: "超长原因",
              count: 1,
              successRate: 0,
              successCount: 0,
              failureCount: 1,
              lastSeenAt: "2026-03-21T10:00:00.000Z",
              uniqueFingerprintCount: 1,
              trend: {
                direction: "baseline",
                directionLabel: "基线",
              },
              recentHistory: [],
            },
          ],
        },
      });

      const reasonIndexPath = path.join(projectRoot, "dist", "agent-memory", "reasons", "index.json");
      const reasonIndex = JSON.parse(fs.readFileSync(reasonIndexPath, "utf-8"));
      const firstEntry = Array.isArray(reasonIndex.entries) ? reasonIndex.entries[0] : null;
      assert.ok(firstEntry);
      const baseName = path.basename(String(firstEntry.path || ""));
      assert.ok(baseName.length <= 110, `expected capped filename, got ${baseName.length}: ${baseName}`);
      assert.ok(fs.existsSync(path.join(projectRoot, "dist", firstEntry.path)));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
