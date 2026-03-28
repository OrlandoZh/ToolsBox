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

function artifactPath(...parts) {
  return path.join(artifactsDir, ...parts);
}

function obsidianPath(...parts) {
  return path.join(artifactsDir, "obsidian-workbench", ...parts);
}

function scriptEnv() {
  return {
    ...process.env,
    AGENT_ARTIFACTS_DIR: artifactsDir,
    AGENT_OBSIDIAN_DIR: path.join(artifactsDir, "obsidian-workbench"),
  };
}

function execNode(args) {
  return execFileSync("node", args, {
    cwd: projectRoot,
    stdio: "pipe",
    env: scriptEnv(),
  });
}

function readArtifactJSON(name) {
  return readJSON(artifactPath(name));
}

function readArtifactText(name) {
  return fs.readFileSync(artifactPath(name), "utf-8");
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeWatchStatus(status) {
  const target = artifactPath("zotero-watch-status.json");
  fs.writeFileSync(target, `${JSON.stringify(status, null, 2)}\n`, "utf-8");
}

function writeE2EReport(report) {
  const target = artifactPath("agent-zotero-e2e.json");
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
}

function writeAutofixReport(report) {
  const target = artifactPath("agent-zotero-autofix.json");
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
}

function writeAutofixHistoryEntry(entry) {
  const dir = artifactPath("agent-zotero-autofix-history");
  fs.mkdirSync(dir, { recursive: true });
  const runId = String(entry?.runId || `run-${Date.now()}`);
  fs.writeFileSync(path.join(dir, `${runId}.json`), `${JSON.stringify(entry, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(dir, "latest.json"), `${JSON.stringify(entry, null, 2)}\n`, "utf-8");
}

function writeWatchRecoveryReport(report) {
  const target = artifactPath("zotero-watch-recovery-regression.json");
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
}

function writeReleaseMatrix(report) {
  const target = artifactPath("release-matrix.json");
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
}

function removeAutofixReport() {
  const target = artifactPath("agent-zotero-autofix.json");
  if (fs.existsSync(target)) {
    fs.rmSync(target, { force: true });
  }
}

describe("Agent Telemetry", () => {
  beforeEach(() => {
    artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-agent-"));
  });

  afterEach(() => {
    if (artifactsDir && fs.existsSync(artifactsDir)) {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
    artifactsDir = null;
  });

  it("should record an agent run log", () => {
    execNode(["scripts/agent-runner.mjs", "telemetry-test", "--", "node", "-e", "process.exit(0)"]);

    const runsDir = artifactPath("agent-runs");
    const runFiles = fs.readdirSync(runsDir).filter((name) => name.endsWith(".json"));
    assert.ok(runFiles.length > 0);

    const latest = readJSON(path.join(runsDir, "latest.json"));
    assert.equal(latest.runName, "telemetry-test");
    assert.equal(latest.success, true);
    assert.equal(latest.exitCode, 0);
    assert.ok(typeof latest.durationMs === "number");
  });

  it("should generate monitor summary from run logs", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
        summaryNote: "热重载后健康检查通过",
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: true,
      issues: [],
      hints: [],
      primaryDiagnosis: {
        fingerprint: "bootstrap:plugin-not-mounted",
        feature: "bootstrap",
        featureLabel: "启动与挂载",
        severity: "critical",
        confidence: 0.98,
        summary: "插件实例未稳定挂载到 Zotero 运行时。",
        candidateFiles: [
          "src/app/plugin.js",
          "scripts/zotero-agent-runtime-lib.mjs",
        ],
        recommendedActions: [
          "检查 bootstrap 生命周期是否完整执行。",
        ],
      },
      diagnostics: [
        {
          fingerprint: "bootstrap:plugin-not-mounted",
          feature: "bootstrap",
          featureLabel: "启动与挂载",
          severity: "critical",
          confidence: 0.98,
          summary: "插件实例未稳定挂载到 Zotero 运行时。",
          candidateFiles: [
            "src/app/plugin.js",
            "scripts/zotero-agent-runtime-lib.mjs",
          ],
          recommendedActions: [
            "检查 bootstrap 生命周期是否完整执行。",
          ],
        },
      ],
      cycles: [{
        index: 1,
        passed: true,
        summaryNote: "真机闭环通过",
        checks: {
          serviceTotal: 2,
          serviceHealthyCount: 2,
          serviceUnhealthyCount: 0,
          serviceHealthOK: true,
          serviceStatus: "healthy",
          httpObserved: true,
          httpRequestCount: 4,
          httpSuccessCount: 3,
          httpFailureCount: 1,
          httpTimeoutCount: 1,
          httpRetryCount: 2,
          httpSlowOperationCount: 1,
          httpSlowThresholdMs: 1200,
          httpLastError: {
            kind: "timeout",
            message: "HTTP request timed out after 1200ms",
          },
          hostReadyDurationMs: 2150,
          startupDurationMs: 3180,
          shutdownDurationMs: 860,
          lifecycleSlowOperationCount: 2,
          lifecycleSlowThresholdMs: 2000,
          lifecycleLastSlowStage: "startup",
          lifecycleBoundaryEvents: [
            {
              event: "plugin.start.failed",
              count: 1,
            },
            {
              event: "plugin.start.cleanup.failed",
              count: 1,
            },
          ],
          readerEventAPIAvailable: true,
          readerEventListenerCount: 8,
          readerEventKnownTypeCount: 8,
          readerEventProbeTypeCount: 8,
          readerEventSyntheticFallbackAvailable: true,
        },
        logs: {
          errorCount: 0,
          warnCount: 1,
          errorBoundaryHitCount: 1,
          errorBoundaryEvents: [
            {
              event: "plugin.start.failed",
              count: 1,
            },
          ],
        },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "baseline registration diagnostics", status: "passed" },
            { name: "real item selection diagnostics", status: "passed" },
            { name: "settings schema and preference pane diagnostics", status: "passed" },
            {
              name: "reader event hook diagnostics",
              status: "passed",
              details: {
                firstInvocation: {
                  type: "renderToolbar",
                },
                snapshot: {
                  eventListenerCount: 1,
                  eventListeners: [
                    { type: "renderToolbar", pluginID: "cleanroom-template@example.com" },
                  ],
                },
              },
            },
            {
              name: "reader fine-grained hook diagnostics",
              status: "passed",
              details: {
                selectionProbe: {
                  type: "renderTextSelectionPopup",
                  dispatchMode: "synthetic-fallback",
                },
                toolbarProbe: {
                  type: "renderToolbar",
                  dispatchMode: "customEvent",
                },
                sidebarHeaderProbe: {
                  type: "renderSidebarAnnotationHeader",
                  dispatchMode: "synthetic-fallback",
                },
                menuProbes: [
                  { type: "createViewContextMenu", dispatchMode: "synthetic-fallback" },
                  { type: "createAnnotationContextMenu", dispatchMode: "synthetic-fallback" },
                  { type: "createColorContextMenu", dispatchMode: "synthetic-fallback" },
                  { type: "createThumbnailContextMenu", dispatchMode: "synthetic-fallback" },
                  { type: "createSelectorContextMenu", dispatchMode: "synthetic-fallback" },
                ],
                snapshot: {
                  eventTypes: [
                    "renderToolbar",
                    "renderTextSelectionPopup",
                    "renderSidebarAnnotationHeader",
                    "createViewContextMenu",
                    "createAnnotationContextMenu",
                    "createColorContextMenu",
                    "createThumbnailContextMenu",
                    "createSelectorContextMenu",
                  ],
                },
              },
            },
          ],
        },
        visuals: {
          captureStability: {
            stages: [
              {
                kind: "library",
                stable: true,
                attemptCount: 2,
                selectedAttempt: 2,
                selectionReason: "stable-hash-pair",
              },
              {
                kind: "reader",
                stable: false,
                attemptCount: 3,
                selectedAttempt: 3,
                selectionReason: "max-attempt-reached",
              },
            ],
          },
          analysis: {
            baselines: [
              {
                kind: "library",
                status: "compared",
                ok: true,
              },
              {
                kind: "reader",
                status: "compared",
                ok: true,
              },
            ],
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: true,
      outcomeLabel: "无需恢复",
      attempts: [
        {
          index: 1,
          kind: "e2e",
          label: "初始 Zotero E2E 验证",
          exitCode: 1,
          durationMs: 1200,
          ok: false,
          note: "初始验证失败",
        },
        {
          index: 2,
          kind: "e2e",
          label: "使用 fresh + restart 策略重新验证",
          exitCode: 0,
          durationMs: 800,
          ok: true,
          note: "恢复成功",
        },
      ],
      patchPlan: {
        status: "review-ready",
        statusLabel: "可进入受限补丁审阅",
        mode: "review-only",
        featureLabel: "ItemPane 注册",
        allowedTargets: [
          "src/features/item-pane.js",
          "src/app/plugin.js",
        ],
        patchDrafts: [
          { file: "src/app/plugin.js", operation: "create" },
        ],
      },
      patchArchive: {
        present: true,
        runId: "20260321T101010000Z",
        entryJSON: "agent-zotero-autofix-history/20260321T101010000Z.json",
        verificationContract: {
          status: "verification-passed",
          statusLabel: "补丁复验通过",
          summary: "补丁后必须确认 ItemPane Section 注册计数恢复。",
          checks: [
            {
              id: "restart-e2e",
              label: "重启策略 E2E 复验",
              kind: "all-cycle-check",
              required: true,
              satisfied: true,
            },
            {
              id: "visual-drift-count",
              label: "视觉漂移数量",
              kind: "report-field",
              required: false,
              satisfied: false,
            },
          ],
        },
      },
      recommendations: ["初始验证已通过，无需触发恢复步骤。"],
    });
    writeAutofixHistoryEntry({
      runId: "20260321T080000000Z",
      generatedAt: "2026-03-21T08:00:00.000Z",
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
          {
            id: "visual-drift-count",
            label: "视觉漂移数量",
            kind: "report-field",
            required: false,
            satisfied: false,
          },
        ],
      },
    });
    writeAutofixHistoryEntry({
      runId: "20260321T090000000Z",
      generatedAt: "2026-03-21T09:00:00.000Z",
      recovered: false,
      outcomeLabel: "未恢复",
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
          { reason: "target-file-missing", count: 1 },
        ],
      },
      verificationContract: {
        status: "verification-failed",
        checks: [
          {
            id: "locale-ftl-key",
            label: "Locale FTL Key 恢复",
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
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: [
        "watch-change",
        "runtime-recovery",
        "session-restart-recovery",
      ],
      observedTriggers: [
        "watch-change",
        "runtime-recovery",
        "session-restart-recovery",
      ],
      summaryNote: "已观测到恢复链闭环",
      entries: [
        {
          trigger: "watch-change",
          passed: false,
          at: new Date().toISOString(),
          summaryNote: "热重载失败",
        },
        {
          trigger: "session-restart-recovery",
          passed: true,
          at: new Date().toISOString(),
          summaryNote: "会话重启恢复成功",
        },
      ],
      issues: [],
    });

    execNode(["scripts/agent-runner.mjs", "telemetry-test", "--", "node", "-e", "process.exit(0)"]);

    try {
      execNode(["scripts/agent-runner.mjs", "telemetry-fail-test", "--", "node", "-e", "process.exit(2)"]);
    } catch {
      // expected non-zero exit
    }

    execNode(["scripts/agent-monitor.mjs"]);

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const monitorMD = readArtifactText("agent-monitor.md");
    const memoryJSON = readArtifactJSON("agent-memory.json");
    const memoryMD = readArtifactText("agent-memory.md");

    assert.ok(typeof monitorJSON.total === "number");
    assert.ok(Array.isArray(monitorJSON.runs));
    assert.ok(Array.isArray(monitorJSON.byRunName));
    assert.ok(Array.isArray(monitorJSON.failureReasons));
    assert.equal(monitorJSON.frontpageSummary?.status, "stable");
    assert.equal(monitorJSON.frontpageSummary?.statusLabel, "稳定");
    assert.equal(monitorJSON.frontpageSummary?.nextAction, "npm run agent:gate");
    assert.equal(monitorJSON.frontpageSummary?.watch?.status, "healthy");
    assert.equal(monitorJSON.frontpageSummary?.e2e?.status, "passed");
    assert.equal(monitorJSON.frontpageSummary?.autofix?.status, "clean");
    assert.equal(monitorJSON.frontpageSummary?.watchRecovery?.status, "passed");
    assert.ok(Array.isArray(monitorJSON.frontpageSummary?.primarySignals));
    assert.equal(monitorJSON.frontpageSummary?.primarySignals?.length, 0);
    assert.equal(monitorJSON.readinessSummary?.status, "stable");
    assert.equal(monitorJSON.watchStatus?.status, "healthy");
    assert.equal(monitorJSON.watchStatus?.latestTrigger, "watch-change");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.status, "passed");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.serviceStatus, "healthy");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.serviceTotal, 2);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.serviceHealthyCount, 2);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.serviceUnhealthyCount, 0);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.serviceHealthOK, true);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.errorBoundaryHitCount, 1);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.httpTimeoutCount, 1);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.httpSlowOperationCount, 1);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.hostReadyDurationMs, 2150);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.startupDurationMs, 3180);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.shutdownDurationMs, 860);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.lifecycleSlowOperationCount, 2);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.lifecycleSlowThresholdMs, 2000);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.lifecycleLastSlowStage, "startup");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.lifecycleBoundaryEvents?.[0]?.event, "plugin.start.failed");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.primaryDiagnosis?.fingerprint, "bootstrap:plugin-not-mounted");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.diagnosisBlocking, true);
    assert.ok(Array.isArray(monitorJSON.zoteroValidation?.e2e?.recommendedActions));
    assert.equal(monitorJSON.zoteroValidation?.e2e?.capabilityObserved, true);
    assert.ok(monitorJSON.zoteroValidation?.e2e?.capabilityCoveredCount >= 3);
    assert.ok(Array.isArray(monitorJSON.zoteroValidation?.e2e?.capabilityStatuses));
    assert.equal(monitorJSON.zoteroValidation?.e2e?.readerEventReport?.status, "passed");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.readerEventReport?.available, true);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.readerEventReport?.knownTypeCount, 8);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.readerEventReport?.probeCompatibleTypeCount, 8);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.readerEventReport?.probeObservedTypeCount, 8);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.readerEventReport?.syntheticFallbackAvailable, true);
    assert.ok(monitorJSON.zoteroValidation?.e2e?.readerEventReport?.observedScenarioNames?.includes("reader event hook diagnostics"));
    assert.ok(monitorJSON.zoteroValidation?.e2e?.toolbarEvidenceSummary?.includes("Toolbar 宿主点已观测"));
    assert.ok(monitorJSON.zoteroValidation?.e2e?.toolbarEvidenceSummary?.includes("分发 customEvent"));
    assert.ok(monitorJSON.zoteroValidation?.e2e?.visualEvidenceSummary?.includes("library 已对齐"));
    assert.ok(monitorJSON.zoteroValidation?.e2e?.visualEvidenceSummary?.includes("reader 已对齐"));
    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualCaptureStabilityObserved, true);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualCaptureStageCount, 2);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualCaptureStableStageCount, 1);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualCaptureUnstableStageCount, 1);
    assert.ok(monitorJSON.zoteroValidation?.e2e?.visualCaptureStabilitySummary?.includes("library 稳定"));
    assert.ok(monitorJSON.zoteroValidation?.e2e?.visualCaptureStabilitySummary?.includes("reader 待稳"));
    assert.equal(monitorJSON.zoteroValidation?.autofix?.status, "clean");
    assert.equal(monitorJSON.zoteroValidation?.autofix?.failedAttempts, 1);
    assert.equal(monitorJSON.zoteroValidation?.autofix?.totalDurationMs, 2000);
    assert.equal(monitorJSON.zoteroValidation?.autofix?.averageDurationMs, 1000);
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchPlanStatus, "review-ready");
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchDraftCount, 1);
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchDraftOperations?.[0]?.operation, "create");
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchDraftOperations?.[0]?.label, "创建文件");
    assert.ok(Array.isArray(monitorJSON.zoteroValidation?.autofix?.recentAttempts));
    assert.equal(monitorJSON.zoteroValidation?.autofix?.recentAttempts?.length, 2);
    assert.equal(monitorJSON.zoteroValidation?.autofix?.recentAttempts?.[0]?.label, "使用 fresh + restart 策略重新验证");
    assert.ok(Array.isArray(monitorJSON.zoteroValidation?.autofix?.failedStepBreakdown));
    assert.equal(monitorJSON.zoteroValidation?.autofix?.failedStepBreakdown?.[0]?.label, "初始 Zotero E2E 验证");
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchVerificationRequiredTotal, 1);
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchVerificationRequiredPassed, 1);
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchVerificationOptionalFailed, 1);
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchVerificationOptionalFailedChecks?.[0]?.id, "visual-drift-count");
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchVerificationOptionalFailedCheckKinds?.[0]?.kind, "report-field");
    assert.equal(monitorJSON.zoteroValidation?.watchRecovery?.status, "passed");
    assert.equal(monitorJSON.zoteroValidation?.watchRecovery?.latestTrigger, "session-restart-recovery");
    assert.ok(Array.isArray(monitorJSON.zoteroValidation?.watchRecovery?.observedTriggers));
    assert.equal(monitorJSON.agentMemory?.present, true);
    assert.equal(monitorJSON.agentMemory?.totalEntries, 2);
    assert.equal(monitorJSON.agentMemory?.currentIncident, null);
    assert.equal(monitorJSON.agentMemory?.trend?.days?.length, 1);
    assert.equal(monitorJSON.agentMemory?.archive?.historyIndexJSON, "agent-memory/history-index.json");
    assert.ok(Array.isArray(monitorJSON.agentMemory?.signalTrends?.signals));
    assert.equal(monitorJSON.agentMemory?.signalTrends?.signals?.[0]?.signalId, "watch");
    assert.equal(monitorJSON.agentMemory?.signalTrends?.signals?.find((item) => item.signalId === "readerEvent")?.latestStatus, "passed");
    assert.equal(monitorJSON.agentMemory?.signalTrends?.archive?.signalIndexJSON, "agent-memory/signals/index.json");
    assert.equal(
      monitorJSON.agentMemory?.signalTrends?.signals?.find((item) => item.signalId === "readerEvent")?.metricHighlights?.[0]?.metricId,
      "knownTypeCount",
    );
    assert.equal(
      monitorJSON.agentMemory?.signalTrends?.signals?.find((item) => item.signalId === "autofix")?.metricHighlights?.[0]?.metricId,
      "failedAttempts",
    );
    assert.ok(monitorJSON.agentMemory?.failureMemory?.hotFingerprints?.some((item) => item.fingerprint === "bootstrap:plugin-not-mounted"));
    assert.equal(monitorJSON.agentMemory?.fixOutcomeMemory?.[0]?.preferredStrategy?.strategyId, "bootstrap-runtime-bridge");
    assert.equal(monitorJSON.agentMemory?.recommendation, null);
    assert.equal(monitorJSON.engineeringHardening?.errorBoundaryHitCount, 1);
    assert.equal(monitorJSON.engineeringHardening?.httpTimeoutCount, 1);
    assert.equal(monitorJSON.engineeringHardening?.httpSlowOperationCount, 1);
    assert.equal(monitorJSON.engineeringHardening?.hostReadyDurationMs, 2150);
    assert.equal(monitorJSON.engineeringHardening?.startupDurationMs, 3180);
    assert.equal(monitorJSON.engineeringHardening?.shutdownDurationMs, 860);
    assert.equal(monitorJSON.engineeringHardening?.lifecycleSlowOperationCount, 2);
    assert.equal(monitorJSON.engineeringHardening?.lifecycleSlowThresholdMs, 2000);
    assert.equal(monitorJSON.engineeringHardening?.lifecycleLastSlowStage, "startup");
    assert.ok(Array.isArray(monitorJSON.engineeringHardening?.errorBoundaryEvents));
    assert.equal(memoryJSON.totalEntries, 2);
    assert.equal(memoryJSON.archive?.latestJSON, "agent-memory/latest.json");
    assert.equal(memoryJSON.signalTrends?.signals?.[1]?.signalId, "e2e");
    assert.equal(memoryJSON.signalTrends?.signals?.[2]?.signalId, "readerEvent");
    assert.equal(memoryJSON.fixOutcomeMemory?.[0]?.preferredStrategy?.strategyId, "bootstrap-runtime-bridge");
    assert.ok(monitorJSON.byRunName.some((entry) => entry.runName === "telemetry-test"));
    assert.ok(monitorMD.includes("# Agent 执行监控报告"));
    assert.ok(monitorMD.includes("## 首页摘要"));
    assert.ok(monitorMD.includes("当前状态"));
    assert.ok(monitorMD.includes("下一步建议"));
    assert.ok(monitorMD.includes("## Zotero 热重载状态"));
    assert.ok(monitorMD.includes("## Zotero 真机闭环"));
    assert.ok(monitorMD.includes("服务状态"));
    assert.ok(monitorMD.includes("健康服务"));
    assert.ok(monitorMD.includes("### 结构化诊断"));
    assert.ok(monitorMD.includes("### Reader 事件桥"));
    assert.ok(monitorMD.includes("synthetic fallback"));
    assert.ok(monitorMD.includes("renderTextSelectionPopup"));
    assert.ok(monitorMD.includes("Toolbar 证据"));
    assert.ok(monitorMD.includes("视觉证据"));
    assert.ok(monitorMD.includes("视觉采集稳定性"));
    assert.ok(monitorMD.includes("### 能力覆盖"));
    assert.ok(monitorMD.includes("基线注册"));
    assert.ok(monitorMD.includes("### 诊断建议动作"));
    assert.ok(monitorMD.includes("bootstrap:plugin-not-mounted"));
    assert.ok(monitorMD.includes("补丁计划状态"));
    assert.ok(monitorMD.includes("补丁草案数"));
    assert.ok(monitorMD.includes("补丁动作摘要"));
    assert.ok(monitorMD.includes("复验总览"));
    assert.ok(monitorMD.includes("观察失败项"));
    assert.ok(monitorMD.includes("失败类型画像"));
    assert.ok(monitorMD.includes("### Watch 恢复回归"));
    assert.ok(monitorMD.includes("### 工程化硬化信号"));
    assert.ok(monitorMD.includes("HTTP timeout"));
    assert.ok(monitorMD.includes("生命周期慢操作"));
    assert.ok(monitorMD.includes("最近生命周期慢阶段"));
    assert.ok(monitorMD.includes("恢复回归"));
    assert.ok(monitorMD.includes("session-restart-recovery"));
    assert.ok(monitorMD.includes("### 最近恢复步骤"));
    assert.ok(monitorMD.includes("### 自动修复失败步骤分布"));
    assert.ok(monitorMD.includes("## Agent 记忆层"));
    assert.ok(monitorMD.includes("近期趋势"));
    assert.ok(monitorMD.includes("运行信号趋势"));
    assert.ok(monitorMD.includes("阻塞原因趋势"));
    assert.ok(monitorMD.includes("重点指纹时间序列"));
    assert.ok(monitorMD.includes("失败步骤 1"));
    assert.ok(monitorMD.includes("归档工件"));
    assert.ok(monitorMD.includes("故障记忆 Top"));
    assert.ok(monitorMD.includes("## 按任务分组"));
    assert.ok(monitorMD.includes("## 失败原因分布"));
    assert.ok(monitorMD.includes("## 最近执行记录"));
    assert.ok(memoryMD.includes("# Agent 记忆层"));
    assert.ok(memoryMD.includes("近期趋势"));
    assert.ok(memoryMD.includes("运行信号趋势"));
    assert.ok(memoryMD.includes("修复结果记忆"));
  });

  it("should render lifecycle hardening fields in dashboard and gate outputs", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "restart",
      passed: true,
      issues: [],
      hints: [],
      cycles: [{
        index: 1,
        passed: true,
        summaryNote: "生命周期遥测已采集",
        checks: {
          serviceTotal: 2,
          serviceHealthyCount: 2,
          serviceUnhealthyCount: 0,
          serviceHealthOK: true,
          serviceStatus: "healthy",
          httpObserved: true,
          httpRequestCount: 1,
          httpSuccessCount: 1,
          httpFailureCount: 0,
          httpTimeoutCount: 0,
          httpRetryCount: 0,
          httpSlowOperationCount: 0,
          httpSlowThresholdMs: 1200,
          hostReadyDurationMs: 2050,
          startupDurationMs: 2875,
          shutdownDurationMs: 910,
          lifecycleSlowOperationCount: 1,
          lifecycleSlowThresholdMs: 2000,
          lifecycleLastSlowStage: "startup",
          lifecycleBoundaryEvents: [
            {
              event: "plugin.start.failed",
              count: 1,
            },
          ],
        },
        logs: {
          errorCount: 0,
          warnCount: 0,
          errorBoundaryHitCount: 0,
          errorBoundaryEvents: [],
        },
        tests: { failed: 0 },
        scenarios: { failed: 0, results: [] },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });

    execNode(["scripts/agent-runner.mjs", "lifecycle-telemetry", "--", "node", "-e", "process.exit(0)"]);
    execNode(["scripts/agent-monitor.mjs"]);
    execNode(["scripts/agent-dashboard.mjs"]);
    try {
      execNode(["scripts/agent-gate.mjs", "--min-pass-rate", "0", "--max-recent-failed", "999"]);
    } catch {
      // gate may still mark the profile as failed while emitting the markdown/json artifacts we assert on here
    }

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const monitorMD = readArtifactText("agent-monitor.md");
    const dashboardHTML = readArtifactText("agent-dashboard.html");
    const gateMD = readArtifactText("agent-gate.md");

    assert.equal(monitorJSON.engineeringHardening?.hostReadyDurationMs, 2050);
    assert.equal(monitorJSON.engineeringHardening?.startupDurationMs, 2875);
    assert.equal(monitorJSON.engineeringHardening?.shutdownDurationMs, 910);
    assert.equal(monitorJSON.engineeringHardening?.lifecycleSlowOperationCount, 1);
    assert.equal(monitorJSON.engineeringHardening?.lifecycleLastSlowStage, "startup");
    assert.ok(monitorMD.includes("生命周期慢操作"));
    assert.ok(monitorMD.includes("生命周期时序"));
    assert.ok(dashboardHTML.includes("生命周期慢操作"));
    assert.ok(dashboardHTML.includes("最近生命周期慢阶段"));
    assert.ok(gateMD.includes("生命周期慢操作"));
    assert.ok(gateMD.includes("生命周期时序"));
  });

  it("should keep validation-stage e2e artifacts readable in monitor summary", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      errorCategory: "validation",
      errorCategoryLabel: "验证错误",
      errorMessage: "Reader Toolbar / 官方 listener 桥接存在漂移。",
      failedStage: "validation-summary",
      issues: ["Reader Toolbar / 官方 listener 桥接存在漂移。"],
      hints: [],
      diagnostics: [{
        fingerprint: "reader-event:toolbar-bridge-registration-drift",
        summary: "Reader Toolbar / 官方 listener 桥接存在漂移。",
        severity: "high",
        candidateFiles: ["src/features/reader.js"],
      }],
      primaryDiagnosis: {
        fingerprint: "reader-event:toolbar-bridge-registration-drift",
        summary: "Reader Toolbar / 官方 listener 桥接存在漂移。",
        severity: "high",
        candidateFiles: ["src/features/reader.js"],
      },
      cycles: [{
        index: 1,
        passed: false,
        summaryNote: "Reader Toolbar 宿主点未观测。",
        logs: { errorCount: 0, warnCount: 1 },
        tests: { failed: 0 },
        scenarios: { failed: 1 },
        checks: {
          readerEventHookScenarioObserved: true,
          readerEventHookScenarioPassed: true,
          readerEventFineGrainedScenarioObserved: true,
          readerEventFineGrainedScenarioPassed: false,
          readerEventSyntheticFallbackAvailable: true,
          readerEventToolbarHookObserved: false,
          staticRuntimeMissingCount: 0,
          staticRuntimeDriftCount: 0,
        },
        visuals: {
          captureStability: {
            stages: [
              { kind: "library", stable: true, attemptCount: 2, selectionReason: "stable-hash-pair" },
              { kind: "reader", stable: true, attemptCount: 2, selectionReason: "stable-hash-pair" },
            ],
          },
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const monitorMD = readArtifactText("agent-monitor.md");

    assert.equal(monitorJSON.zoteroValidation?.e2e?.errorCategory, "validation");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.errorCategoryLabel, "验证错误");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.failedStage, "validation-summary");
    assert.ok(String(monitorJSON.zoteroValidation?.e2e?.errorMessage || "").includes("Reader Toolbar / 官方 listener 桥接存在漂移"));
    assert.ok(String(monitorJSON.frontpageSummary?.headline || "").length > 0);
    assert.equal(monitorJSON.frontpageSummary?.nextAction, "npm run agent:zotero:e2e");
    assert.ok(monitorMD.includes("E2E 失败分类: `验证错误`"));
    assert.ok(monitorMD.includes("E2E 失败阶段: `validation-summary`"));
  });

  it("should route pure visual reader failures to baseline refresh instead of autofix", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      issues: ["library 截图与基线尺寸不一致：当前 2000x1200，基线 3388x2172"],
      hints: ["如果当前 UI 改动是预期行为，执行 `npm run agent:zotero:e2e:update-baseline` 刷新视觉基线后再复验。"],
      diagnostics: [{
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
        candidateFiles: ["src/features/reader.js"],
      }],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
        candidateFiles: ["src/features/reader.js"],
      },
      cycles: [{
        index: 1,
        passed: false,
        summaryNote: "发现 2 项视觉问题",
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            {
              name: "reader event hook diagnostics",
              status: "passed",
              details: {
                snapshot: {
                  eventListenerCount: 1,
                  eventListeners: [{ type: "renderToolbar" }],
                },
              },
            },
            {
              name: "reader fine-grained hook diagnostics",
              status: "passed",
              details: {
                toolbarProbe: {
                  type: "renderToolbar",
                  dispatchMode: "customEvent",
                },
              },
            },
          ],
        },
        checks: {
          readerEventHookScenarioObserved: true,
          readerEventHookScenarioPassed: true,
          readerEventFineGrainedScenarioObserved: true,
          readerEventFineGrainedScenarioPassed: true,
          readerEventSyntheticFallbackAvailable: true,
          readerEventToolbarHookObserved: true,
          staticRuntimeMissingCount: 0,
          staticRuntimeDriftCount: 0,
        },
        visuals: {
          captures: [
            { kind: "library", analysis: { width: 2000, height: 1200 } },
            { kind: "reader", analysis: { width: 2000, height: 1200 } },
          ],
          captureStability: {
            stages: [
              { kind: "library", stable: true, attemptCount: 2, selectionReason: "stable-hash-pair" },
              { kind: "reader", stable: true, attemptCount: 2, selectionReason: "stable-hash-pair" },
            ],
          },
          analysis: {
            baselines: [
              {
                kind: "library",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: false,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 3388,
                  baselineHeight: 2172,
                },
              },
              {
                kind: "reader",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: false,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 3388,
                  baselineHeight: 2172,
                },
              },
            ],
            summary: {
              baseline: {
                driftCount: 2,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      recommendations: [],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    });

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const gateJSON = readArtifactJSON("agent-gate.json");

    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualPrimaryBlockerKind, "baseline-geometry-mismatch");
    assert.ok(String(monitorJSON.zoteroValidation?.e2e?.visualGeometrySummary || "").includes("2000x1200 / 3388x2172"));
    assert.equal(monitorJSON.frontpageSummary?.nextAction, "npm run agent:zotero:e2e:update-baseline");
    assert.ok(String(gateJSON.frontpageSummary?.nextAction || "").includes("agent:zotero:e2e:update-baseline"));
    assert.equal(String(gateJSON.frontpageSummary?.nextAction || "").includes("agent:zotero:autofix"), false);
  });

  it("should surface exhausted visual stages while keeping capture-unstable failures on e2e rerun", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      issues: ["reader 截图与基线像素漂移过大：8.32% > 5.00%"],
      diagnostics: [{
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
        candidateFiles: ["src/features/reader.js"],
      }],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
        candidateFiles: ["src/features/reader.js"],
      },
      cycles: [{
        index: 1,
        bootMode: "hot-reload",
        passed: false,
        summaryNote: "视觉采集未在预算内收敛",
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
        },
        checks: {
          readerEventHookScenarioObserved: true,
          readerEventHookScenarioPassed: true,
          readerEventFineGrainedScenarioObserved: true,
          readerEventFineGrainedScenarioPassed: true,
          readerEventSyntheticFallbackAvailable: true,
          readerEventToolbarHookObserved: true,
          staticRuntimeMissingCount: 0,
          staticRuntimeDriftCount: 0,
        },
        visuals: {
          captures: [
            { kind: "library", analysis: { width: 2000, height: 1200 } },
            { kind: "reader", analysis: { width: 2000, height: 1200 } },
          ],
          captureStability: {
            stages: [
              {
                kind: "library",
                stable: false,
                attemptCount: 3,
                selectedAttempt: 3,
                selectionReason: "max-attempt-reached",
                attempts: [
                  { index: 1, sha256: "lib-1", width: 2000, height: 1200, bounds: { x: 100, y: 80, width: 1000, height: 600 } },
                  { index: 2, sha256: "lib-2", width: 2000, height: 1200, bounds: { x: 100, y: 80, width: 1000, height: 600 } },
                  { index: 3, sha256: "lib-3", width: 2000, height: 1200, bounds: { x: 100, y: 80, width: 1000, height: 600 } },
                ],
              },
              {
                kind: "reader",
                stable: false,
                attemptCount: 3,
                selectedAttempt: 3,
                selectionReason: "max-attempt-reached",
                attempts: [
                  { index: 1, sha256: "reader-1", width: 2000, height: 1200, bounds: { x: 100, y: 80, width: 1000, height: 600 } },
                  { index: 2, sha256: "reader-2", width: 2000, height: 1200, bounds: { x: 100, y: 80, width: 1000, height: 600 } },
                  { index: 3, sha256: "reader-3", width: 2000, height: 1200, bounds: { x: 100, y: 80, width: 1000, height: 600 } },
                ],
              },
            ],
          },
          analysis: {
            baselines: [
              {
                kind: "library",
                status: "compared",
                ok: true,
                metrics: {
                  sameDimensions: true,
                  changedRatio: 0,
                  meanChannelDiff: 0,
                },
              },
              {
                kind: "reader",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: true,
                  changedRatio: 0.0832,
                  meanChannelDiff: 6.27,
                },
              },
            ],
            summary: {
              baseline: {
                driftCount: 1,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      recommendations: [],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    execNode(["scripts/agent-dashboard.mjs"]);
    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    });

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const monitorMD = readArtifactText("agent-monitor.md");
    const gateJSON = readArtifactJSON("agent-gate.json");
    const dashboardHTML = readArtifactText("agent-dashboard.html");

    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualPrimaryBlockerKind, "capture-unstable");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualCanonicalCoverageKind, "complete");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualCaptureAttemptDiagnosisObserved, true);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualCaptureAttemptDiagnosisItemCount, 2);
    assert.ok(String(monitorJSON.zoteroValidation?.e2e?.visualCaptureAttemptDiagnosisSummary || "").includes("hash 全变"));
    assert.equal(monitorJSON.frontpageSummary?.nextAction, "npm run agent:zotero:e2e");
    assert.ok(String(monitorJSON.frontpageSummary?.headline || "").includes("library（3 次）"));
    assert.ok(String(monitorJSON.frontpageSummary?.headline || "").includes("reader（3 次）"));
    assert.ok(String(monitorJSON.frontpageSummary?.headline || "").includes("hash 全变"));
    assert.ok(monitorMD.includes("Attempt 诊断"));
    assert.ok(monitorMD.includes("hash 全变"));
    assert.ok(monitorMD.includes("用尽预算 stage：library（3 次）；reader（3 次）"));
    assert.ok(String(gateJSON.frontpageSummary?.nextAction || "").includes("agent:zotero:e2e"));
    assert.ok(gateJSON.recommendations.some((item) => String(item).includes("用尽预算 stage：library（3 次）；reader（3 次）")));
    assert.ok(dashboardHTML.includes("Attempt 诊断"));
    assert.ok(dashboardHTML.includes("hash 全变"));
    assert.ok(dashboardHTML.includes("用尽预算 stage：library（3 次）；reader（3 次）"));
  });

  it("should let gate recompute fresh capture-unstable validation even when monitor summary is stale", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
        summaryNote: "热重载后健康检查通过",
      },
    });
    writeE2EReport({
      generatedAt: "2026-03-26T12:00:00.000Z",
      strategy: "hot",
      passed: false,
      issues: ["library 截图与基线像素漂移过大：11.00% > 5.00%"],
      diagnostics: [{
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
      }],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
      },
      cycles: [{
        index: 1,
        bootMode: "hot-reload",
        passed: false,
        summaryNote: "library stage 仍需收敛",
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
        },
        logs: {
          errorCount: 0,
          warnCount: 0,
          recentErrors: [],
        },
        visuals: {
          captures: [
            { kind: "library", path: "/tmp/library.png", analysis: { width: 2000, height: 1200 } },
            { kind: "reader", path: "/tmp/reader.png", analysis: { width: 2000, height: 1200 } },
          ],
          captureStability: {
            stages: [
              { kind: "library", stable: false, attemptCount: 3, selectedAttempt: 3, selectionReason: "max-attempt-reached" },
              {
                kind: "reader",
                stable: true,
                attemptCount: 3,
                selectedAttempt: 3,
                selectionReason: "stable-low-drift-pair",
                stabilityMetrics: {
                  sameDimensions: true,
                  changedRatio: 0.008,
                  meanChannelDiff: 0.9,
                  thresholdChangedRatio: 0.0125,
                  thresholdMeanChannelDiff: 1.25,
                },
              },
            ],
          },
          analysis: {
            baselines: [
              {
                kind: "library",
                canonicalTarget: "hot-reload-library.png",
                path: "/tmp/hot-reload-library.png",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: true,
                  changedRatio: 0.11,
                  meanChannelDiff: 4.2,
                },
              },
              {
                kind: "reader",
                canonicalTarget: "hot-reload-reader.png",
                path: "/tmp/hot-reload-reader.png",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: true,
                  changedRatio: 0.08,
                  meanChannelDiff: 3.1,
                },
              },
            ],
            summary: {
              baseline: {
                comparedCount: 2,
                missingCount: 0,
                driftCount: 2,
                errorCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: "2026-03-26T11:58:00.000Z",
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      recommendations: [],
    });
    writeWatchRecoveryReport({
      generatedAt: "2026-03-26T11:59:00.000Z",
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    const staleMonitor = readArtifactJSON("agent-monitor.json");
    staleMonitor.zoteroValidation.e2e.visualPrimaryBlockerKind = "ui-regression-candidate";
    staleMonitor.zoteroValidation.e2e.visualPrimaryBlockerKindLabel = "疑似真实界面回归";
    staleMonitor.zoteroValidation.e2e.visualCanonicalCoverageKind = "complete";
    staleMonitor.frontpageSummary.nextAction = "npm run agent:obsidian";
    fs.writeFileSync(artifactPath("agent-monitor.json"), `${JSON.stringify(staleMonitor, null, 2)}\n`, "utf-8");

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    });

    const gateJSON = readArtifactJSON("agent-gate.json");
    assert.equal(gateJSON.zoteroValidation?.e2e?.visualPrimaryBlockerKind, "capture-unstable");
    assert.equal(gateJSON.frontpageSummary?.nextAction, "npm run agent:zotero:e2e");
    assert.ok(
      gateJSON.recommendations.some((item) => String(item).includes("用尽预算 stage：library（3 次）")),
    );
  });

  it("should route partial canonical baseline coverage to obsidian instead of repeating refresh", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      issues: ["reader 截图与基线尺寸不一致：当前 2000x1200，基线 3388x2172"],
      diagnostics: [{
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
        candidateFiles: ["src/features/reader.js"],
      }],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
        candidateFiles: ["src/features/reader.js"],
      },
      cycles: [{
        index: 1,
        bootMode: "restart",
        passed: false,
        checks: {
          readerEventHookScenarioObserved: true,
          readerEventHookScenarioPassed: true,
          readerEventFineGrainedScenarioObserved: true,
          readerEventFineGrainedScenarioPassed: true,
          readerEventSyntheticFallbackAvailable: true,
        },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
        },
        logs: { errorCount: 0, warnCount: 0, recentErrors: [] },
        visuals: {
          captures: [
            { kind: "library", analysis: { width: 2000, height: 1200 } },
            { kind: "reader", analysis: { width: 2000, height: 1200 } },
          ],
          captureStability: {
            stages: [
              { kind: "library", stable: true, attemptCount: 2, selectionReason: "stable-hash-pair" },
              { kind: "reader", stable: true, attemptCount: 2, selectionReason: "stable-hash-pair" },
            ],
          },
          analysis: {
            baselines: [
              {
                kind: "library",
                bootMode: "restart",
                canonicalTarget: "restart-library.png",
                status: "compared",
                ok: true,
                metrics: {
                  sameDimensions: true,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 2000,
                  baselineHeight: 1200,
                },
              },
              {
                kind: "reader",
                bootMode: "restart",
                canonicalTarget: "restart-reader.png",
                status: "compared",
                ok: true,
                metrics: {
                  sameDimensions: true,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 2000,
                  baselineHeight: 1200,
                },
              },
            ],
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }, {
        index: 2,
        bootMode: "hot-reload",
        passed: false,
        checks: {
          readerEventHookScenarioObserved: true,
          readerEventHookScenarioPassed: true,
          readerEventFineGrainedScenarioObserved: true,
          readerEventFineGrainedScenarioPassed: true,
          readerEventSyntheticFallbackAvailable: true,
        },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
        },
        logs: { errorCount: 0, warnCount: 0, recentErrors: [] },
        visuals: {
          captures: [
            { kind: "library", analysis: { width: 2000, height: 1200 } },
            { kind: "reader", analysis: { width: 2000, height: 1200 } },
          ],
          captureStability: {
            stages: [
              { kind: "library", stable: true, attemptCount: 2, selectionReason: "stable-hash-pair" },
              { kind: "reader", stable: true, attemptCount: 2, selectionReason: "stable-hash-pair" },
            ],
          },
          analysis: {
            baselines: [
              {
                kind: "library",
                bootMode: "hot-reload",
                canonicalTarget: "hot-reload-library.png",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: false,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 3388,
                  baselineHeight: 2172,
                },
              },
              {
                kind: "reader",
                bootMode: "hot-reload",
                canonicalTarget: "hot-reload-reader.png",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: false,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 3388,
                  baselineHeight: 2172,
                },
              },
            ],
            summary: {
              baseline: {
                driftCount: 2,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      recommendations: [],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    });

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const gateJSON = readArtifactJSON("agent-gate.json");

    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualCanonicalCoverageKind, "partial");
    assert.deepEqual(monitorJSON.zoteroValidation?.e2e?.visualCanonicalMismatchedTargets, [
      "hot-reload-library.png",
      "hot-reload-reader.png",
    ]);
    assert.equal(monitorJSON.frontpageSummary?.nextAction, "npm run agent:obsidian");
    assert.ok(String(gateJSON.frontpageSummary?.nextAction || "").includes("agent:obsidian"));
    assert.ok(String(gateJSON.frontpageSummary?.e2e?.visualCanonicalCoverageSummary || "").includes("hot-reload-library.png"));
  });

  it("should route complete-coverage ui regression candidates to obsidian for manual review", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "startup",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      issues: [
        "library 截图与基线平均通道差异过大：19.34 > 18.00",
        "reader 截图与基线像素漂移过大：95.22% > 5.00%",
      ],
      hints: ["如果当前 UI 改动是预期行为，执行 `npm run agent:zotero:e2e:update-baseline` 刷新视觉基线后再复验。"],
      diagnostics: [{
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
        candidateFiles: ["src/features/reader.js", "zotero-scenarios/baseline.scenario.js"],
      }],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
        candidateFiles: ["src/features/reader.js", "zotero-scenarios/baseline.scenario.js"],
      },
      testSummary: {
        passed: 2,
        failed: 0,
      },
      scenarioSummary: {
        passed: 3,
        failed: 0,
      },
      cycles: [{
        index: 1,
        bootMode: "hot-reload",
        passed: false,
        checks: {
          readerEventHookScenarioObserved: true,
          readerEventHookScenarioPassed: true,
          readerEventFineGrainedScenarioObserved: true,
          readerEventFineGrainedScenarioPassed: true,
          readerEventSyntheticFallbackAvailable: true,
        },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
        },
        logs: { errorCount: 0, warnCount: 0, recentErrors: [] },
        diagnostics: {
          primaryDiagnosis: {
            fingerprint: "reader-ui:reader-visual-drift",
            feature: "reader-ui",
            featureLabel: "Reader 与视觉回归",
            severity: "medium",
            confidence: 0.88,
            summary: "Reader 相关视觉基线发生漂移或缺失。",
          },
        },
        visuals: {
          captures: [
            { kind: "library", path: "/tmp/cycle-1-library.png", analysis: { width: 2000, height: 1200 } },
            { kind: "reader", path: "/tmp/cycle-1-reader.png", analysis: { width: 2000, height: 1200 } },
          ],
          captureStability: {
            stages: [
              { kind: "library", stable: true, attemptCount: 2, selectedAttempt: 2, selectionReason: "stable-hash-pair" },
              {
                kind: "reader",
                stable: true,
                attemptCount: 3,
                selectedAttempt: 3,
                selectionReason: "stable-low-drift-pair",
                stabilityMetrics: {
                  sameDimensions: true,
                  changedRatio: 0.008,
                  meanChannelDiff: 0.9,
                  thresholdChangedRatio: 0.0125,
                  thresholdMeanChannelDiff: 1.25,
                },
              },
            ],
          },
          analysis: {
            baselines: [
            {
              kind: "library",
              bootMode: "hot-reload",
              canonicalTarget: "hot-reload-library.png",
              path: "/tmp/hot-reload-library.png",
              status: "compared",
              ok: false,
              metrics: {
                sameDimensions: true,
                actualWidth: 2000,
                actualHeight: 1200,
                baselineWidth: 2000,
                baselineHeight: 1200,
                changedRatio: 0.2345,
                meanChannelDiff: 19.34,
              },
              issues: ["library 截图与基线平均通道差异过大：19.34 > 18.00"],
            },
            {
              kind: "reader",
              bootMode: "hot-reload",
              canonicalTarget: "hot-reload-reader.png",
              path: "/tmp/hot-reload-reader.png",
              status: "compared",
              ok: false,
              metrics: {
                sameDimensions: true,
                actualWidth: 2000,
                actualHeight: 1200,
                baselineWidth: 2000,
                baselineHeight: 1200,
                changedRatio: 0.9522,
                meanChannelDiff: 20.96,
              },
              issues: ["reader 截图与基线像素漂移过大：95.22% > 5.00%"],
            },
            ],
            summary: {
              baseline: {
                driftCount: 2,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      recommendations: [],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    });
    execNode(["scripts/agent-obsidian-handoff.mjs"]);

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const gateJSON = readArtifactJSON("agent-gate.json");
    const statusOverviewMD = fs.readFileSync(obsidianPath("01-Zotero-Agent-当前状态总览.md"), "utf-8");
    const evidenceIndexMD = fs.readFileSync(obsidianPath("02-Zotero-Agent-证据索引.md"), "utf-8");
    const humanWindowMD = fs.readFileSync(obsidianPath("10-Zotero-Agent-人工指令窗口.md"), "utf-8");

    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualPrimaryBlockerKind, "ui-regression-candidate");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualCanonicalCoverageKind, "complete");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualEvidenceItemCount, 2);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualEvidenceFailingItemCount, 2);
    assert.ok(String(monitorJSON.zoteroValidation?.e2e?.visualCaptureStabilitySummary || "").includes("低漂移收敛"));
    assert.equal(
      monitorJSON.zoteroValidation?.e2e?.visualCaptureStabilityStages?.[1]?.selectionReason,
      "stable-low-drift-pair",
    );
    assert.equal(
      monitorJSON.zoteroValidation?.e2e?.visualCaptureStabilityStages?.[1]?.stabilityMetrics?.thresholdChangedRatio,
      0.0125,
    );
    assert.equal(monitorJSON.frontpageSummary?.nextAction, "npm run agent:obsidian");
    assert.equal(String(monitorJSON.frontpageSummary?.headline || "").includes("历史建议"), false);
    assert.ok(String(gateJSON.frontpageSummary?.nextAction || "").includes("agent:obsidian"));
    assert.ok(gateJSON.recommendations.some((item) => String(item).includes("agent:obsidian")));
    assert.ok(statusOverviewMD.includes("当前阶段：等待人工 Reader verdict"));
    assert.ok(evidenceIndexMD.includes("[cycle-1-reader.png](/tmp/cycle-1-reader.png)"));
    assert.ok(evidenceIndexMD.includes("[hot-reload-reader.png](/tmp/hot-reload-reader.png)"));
    assert.ok(humanWindowMD.includes("当前阶段：等待人工 Reader verdict"));
    assert.ok(humanWindowMD.includes("视觉导航"));
    assert.ok(humanWindowMD.includes("低漂移收敛"));
    assert.ok(humanWindowMD.includes("当前主路径等待人工 Reader verdict，不默认执行 baseline refresh、autofix 或 rerun E2E。"));
    assert.equal(humanWindowMD.includes("刷新基线 x2"), false);
  });

  it("should fall back to zotero watch when fresh watch failed even if older visual evidence points to obsidian", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "failed",
      latest: {
        trigger: "startup",
        passed: false,
        issues: [
          "偏好设置面板未注册。",
          "ItemPane Section 未注册。",
          "ItemPane InfoRow 未注册。",
          "ItemTree 自定义列未注册。",
        ],
        summaryNote: "启动完成，但基线注册未在健康窗口内收敛",
      },
    });
    writeE2EReport({
      generatedAt: new Date(Date.now() - 60_000).toISOString(),
      strategy: "hot",
      passed: false,
      issues: [
        "library 截图与基线平均通道差异过大：19.34 > 18.00",
        "reader 截图与基线像素漂移过大：95.22% > 5.00%",
      ],
      hints: ["当前主阻断已排除采集稳定性、几何漂移与 canonical coverage 缺口；先执行 `npm run agent:obsidian` 固化 Reader UI / scenario 的人工复核结论。"],
      diagnostics: [{
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
        candidateFiles: ["src/features/reader.js", "zotero-scenarios/baseline.scenario.js"],
      }],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
        candidateFiles: ["src/features/reader.js", "zotero-scenarios/baseline.scenario.js"],
      },
      testSummary: {
        passed: 2,
        failed: 0,
      },
      scenarioSummary: {
        passed: 3,
        failed: 0,
      },
      cycles: [{
        index: 1,
        bootMode: "hot-reload",
        passed: false,
        summaryNote: "视觉漂移待人工确认",
        checks: {
          readerEventHookScenarioObserved: true,
          readerEventHookScenarioPassed: true,
          readerEventFineGrainedScenarioObserved: true,
          readerEventFineGrainedScenarioPassed: true,
          readerEventSyntheticFallbackAvailable: true,
          serviceTotal: 2,
          serviceHealthyCount: 2,
          serviceUnhealthyCount: 0,
          serviceHealthOK: true,
          serviceStatus: "healthy",
        },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
        },
        logs: { errorCount: 0, warnCount: 0, recentErrors: [] },
        diagnostics: {
          primaryDiagnosis: {
            fingerprint: "reader-ui:reader-visual-drift",
            feature: "reader-ui",
            featureLabel: "Reader 与视觉回归",
            severity: "medium",
            confidence: 0.88,
            summary: "Reader 相关视觉基线发生漂移或缺失。",
          },
        },
        visuals: {
          analysis: {
            baselines: [
              {
                kind: "library",
                bootMode: "hot-reload",
                canonicalTarget: "hot-reload-library.png",
                path: "/tmp/hot-reload-library.png",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: true,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 2000,
                  baselineHeight: 1200,
                  changedRatio: 0.2345,
                  meanChannelDiff: 19.34,
                },
                issues: ["library 截图与基线平均通道差异过大：19.34 > 18.00"],
              },
              {
                kind: "reader",
                bootMode: "hot-reload",
                canonicalTarget: "hot-reload-reader.png",
                path: "/tmp/hot-reload-reader.png",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: true,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 2000,
                  baselineHeight: 1200,
                  changedRatio: 0.9522,
                  meanChannelDiff: 20.96,
                },
                issues: ["reader 截图与基线像素漂移过大：95.22% > 5.00%"],
              },
            ],
            summary: {
              baseline: {
                driftCount: 2,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      recommendations: [],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    });

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const gateJSON = readArtifactJSON("agent-gate.json");

    assert.equal(monitorJSON.watchStatus?.status, "failed");
    assert.equal(monitorJSON.frontpageSummary?.nextAction, "npm run zotero:watch");
    assert.ok(String(monitorJSON.frontpageSummary?.headline || "").includes("Zotero watch 当前为 失败"));
    assert.ok(String(gateJSON.frontpageSummary?.nextAction || "").includes("zotero:watch"));
    assert.equal(gateJSON.recommendations.some((item) => String(item).includes("agent:obsidian")), false);
  });

  it("should generate html dashboard from monitor summary", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "startup",
        passed: true,
        issues: [],
        summaryNote: "启动后通过健康检查",
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "restart",
      passed: false,
      issues: [
        "插件实例未挂载到 Zotero[instanceKey]。",
        "服务健康异常：共 3 个服务，异常 1 个。",
      ],
      hints: ["检查 bootstrap 生命周期是否完整执行。"],
      primaryDiagnosis: {
        fingerprint: "bootstrap:plugin-not-mounted",
        feature: "bootstrap",
        featureLabel: "启动与挂载",
        severity: "critical",
        confidence: 0.98,
        summary: "插件实例未稳定挂载到 Zotero 运行时。",
        candidateFiles: [
          "src/app/plugin.js",
          "scripts/zotero-agent-runtime-lib.mjs",
        ],
        recommendedActions: [
          "检查 bootstrap 生命周期是否完整执行。",
          "核对 addon 配置与构建产物。",
        ],
      },
      diagnostics: [{
        fingerprint: "bootstrap:plugin-not-mounted",
        feature: "bootstrap",
        featureLabel: "启动与挂载",
        severity: "critical",
        confidence: 0.98,
        summary: "插件实例未稳定挂载到 Zotero 运行时。",
        candidateFiles: [
          "src/app/plugin.js",
          "scripts/zotero-agent-runtime-lib.mjs",
        ],
        recommendedActions: [
          "检查 bootstrap 生命周期是否完整执行。",
        ],
      }],
      cycles: [{
        index: 1,
        passed: false,
        summaryNote: "冷启动闭环失败",
        checks: {
          serviceTotal: 3,
          serviceHealthyCount: 2,
          serviceUnhealthyCount: 1,
          serviceHealthOK: false,
          serviceStatus: "degraded",
          readerEventAPIAvailable: true,
          readerEventListenerCount: 8,
          readerEventKnownTypeCount: 8,
          readerEventProbeTypeCount: 8,
          readerEventSyntheticFallbackAvailable: true,
        },
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "baseline registration diagnostics", status: "passed" },
            { name: "multi-window mount diagnostics", status: "failed" },
            {
              name: "reader event hook diagnostics",
              status: "passed",
              details: {
                firstInvocation: {
                  type: "renderToolbar",
                },
                snapshot: {
                  eventListenerCount: 1,
                  eventListeners: [
                    { type: "renderToolbar", pluginID: "cleanroom-template@example.com" },
                  ],
                },
              },
            },
            {
              name: "reader fine-grained hook diagnostics",
              status: "passed",
              details: {
                selectionProbe: {
                  type: "renderTextSelectionPopup",
                  dispatchMode: "synthetic-fallback",
                },
                toolbarProbe: {
                  type: "renderToolbar",
                  dispatchMode: "customEvent",
                },
                sidebarHeaderProbe: {
                  type: "renderSidebarAnnotationHeader",
                  dispatchMode: "synthetic-fallback",
                },
                menuProbes: [
                  { type: "createViewContextMenu", dispatchMode: "synthetic-fallback" },
                  { type: "createAnnotationContextMenu", dispatchMode: "synthetic-fallback" },
                ],
                snapshot: {
                  eventTypes: [
                    "renderToolbar",
                    "renderTextSelectionPopup",
                    "renderSidebarAnnotationHeader",
                    "createViewContextMenu",
                    "createAnnotationContextMenu",
                  ],
                },
              },
            },
          ],
        },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "restart",
      recovered: true,
      outcomeLabel: "已恢复",
      attempts: [{
        index: 1,
        kind: "e2e",
        label: "初始 Zotero E2E 验证",
        exitCode: 1,
        durationMs: 1000,
        ok: false,
        note: "初始验证失败",
      }, {
        index: 2,
        kind: "e2e",
        label: "使用 fresh + restart 策略重新验证",
        exitCode: 0,
        durationMs: 600,
        ok: true,
        note: "fresh + restart 恢复成功",
      }],
      patchPlan: {
        status: "review-ready",
        statusLabel: "可进入受限补丁审阅",
        mode: "review-only",
        featureLabel: "启动与挂载",
        allowedTargets: [
          "src/app/plugin.js",
          "scripts/zotero-agent-runtime-lib.mjs",
        ],
        patchDrafts: [
          { file: "src/app/plugin.js", operation: "replace" },
          { file: "scripts/zotero-agent-runtime-lib.mjs", operation: "append" },
        ],
      },
      patchArchive: {
        present: true,
        runId: "20260321T111111000Z",
        entryJSON: "agent-zotero-autofix-history/20260321T111111000Z.json",
        verificationContract: {
          status: "verification-failed",
          statusLabel: "补丁复验失败",
          summary: "补丁后仍有必需项和观察项未通过。",
          checks: [
            {
              id: "restart-e2e",
              label: "重启策略 E2E 复验",
              kind: "all-cycle-check",
              required: true,
              satisfied: false,
            },
            {
              id: "bootstrap-mounted",
              label: "插件实例挂载",
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
      recommendations: ["闭环已恢复，可继续进入真实功能开发与回归。"],
    });
    writeAutofixHistoryEntry({
      runId: "20260321T070000000Z",
      generatedAt: "2026-03-21T07:00:00.000Z",
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
          {
            id: "visual-drift-count",
            label: "视觉漂移数量",
            kind: "report-field",
            required: false,
            satisfied: false,
          },
        ],
      },
    });
    writeAutofixHistoryEntry({
      runId: "20260321T083000000Z",
      generatedAt: "2026-03-21T08:30:00.000Z",
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
          { operation: "append", count: 1 },
        ],
        resultReasonSummary: [
          { reason: "before-context-mismatch", count: 1 },
        ],
      },
      verificationContract: {
        status: "verification-failed",
        checks: [
          {
            id: "locale-ftl-key",
            label: "Locale FTL Key 恢复",
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
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: [
        "watch-change",
        "runtime-recovery",
        "session-restart-recovery",
      ],
      observedTriggers: [
        "watch-change",
        "runtime-recovery",
        "session-restart-recovery",
      ],
      summaryNote: "恢复链通过真机回归",
      entries: [{
        trigger: "watch-change",
        passed: false,
        at: new Date().toISOString(),
        summaryNote: "热重载流程失败",
      }, {
        trigger: "runtime-recovery",
        passed: false,
        at: new Date().toISOString(),
        summaryNote: "runtime 恢复失败",
      }, {
        trigger: "session-restart-recovery",
        passed: true,
        at: new Date().toISOString(),
        summaryNote: "会话重启恢复成功",
      }],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    execNode(["scripts/agent-dashboard.mjs"]);

    const dashboardHTML = readArtifactText("agent-dashboard.html");
    assert.ok(dashboardHTML.includes("<title>Agent 执行仪表板</title>"));
    assert.ok(dashboardHTML.includes("首页总览"));
    assert.ok(dashboardHTML.includes("下一步建议"));
    assert.ok(dashboardHTML.includes("npm run agent:zotero:autofix"));
    assert.ok(dashboardHTML.includes("冷启动闭环失败"));
    assert.ok(dashboardHTML.includes("需关注"));
    assert.ok(dashboardHTML.includes("Zotero 热重载状态"));
    assert.ok(dashboardHTML.includes("Zotero 真机闭环"));
    assert.ok(dashboardHTML.includes("最近自动修复"));
    assert.ok(dashboardHTML.includes("能力覆盖"));
    assert.ok(dashboardHTML.includes("多窗口挂载"));
    assert.ok(dashboardHTML.includes("初始 Zotero E2E 验证"));
    assert.ok(dashboardHTML.includes("总耗时"));
    assert.ok(dashboardHTML.includes("平均耗时"));
    assert.ok(dashboardHTML.includes("结构化诊断"));
    assert.ok(dashboardHTML.includes("Reader 事件桥"));
    assert.ok(dashboardHTML.includes("synthetic fallback"));
    assert.ok(dashboardHTML.includes("renderTextSelectionPopup"));
    assert.ok(dashboardHTML.includes("视觉采集稳定性"));
    assert.ok(dashboardHTML.includes("启动与挂载"));
    assert.ok(dashboardHTML.includes("bootstrap:plugin-not-mounted"));
    assert.ok(dashboardHTML.includes("检查 bootstrap 生命周期是否完整执行。"));
    assert.ok(dashboardHTML.includes("阻断级"));
    assert.ok(dashboardHTML.includes("服务状态"));
    assert.ok(dashboardHTML.includes("degraded"));
    assert.ok(dashboardHTML.includes("服务摘要"));
    assert.ok(dashboardHTML.includes("服务问题"));
    assert.ok(dashboardHTML.includes("补丁计划"));
    assert.ok(dashboardHTML.includes("可进入受限补丁审阅"));
    assert.ok(dashboardHTML.includes("补丁草案"));
    assert.ok(dashboardHTML.includes("补丁动作摘要"));
    assert.ok(dashboardHTML.includes("复验总览"));
    assert.ok(dashboardHTML.includes("必需失败"));
    assert.ok(dashboardHTML.includes("观察失败"));
    assert.ok(dashboardHTML.includes("类型画像"));
    assert.ok(dashboardHTML.includes("Agent 记忆层"));
    assert.ok(dashboardHTML.includes("故障记忆"));
    assert.ok(dashboardHTML.includes("修复结果记忆"));
    assert.ok(dashboardHTML.includes("近期趋势"));
    assert.ok(dashboardHTML.includes("最近样本"));
    assert.ok(dashboardHTML.includes("运行信号趋势"));
    assert.ok(dashboardHTML.includes("阻塞原因趋势"));
    assert.ok(dashboardHTML.includes("重点指纹时间序列"));
    assert.ok(dashboardHTML.includes("失败步骤 1"));
    assert.ok(dashboardHTML.includes("推荐置信度"));
    assert.ok(dashboardHTML.includes("历史最优路径"));
    assert.ok(dashboardHTML.includes("复验通过率"));
    assert.ok(dashboardHTML.includes("恢复回归"));
    assert.ok(dashboardHTML.includes("恢复回归验证"));
    assert.ok(dashboardHTML.includes("期望序列"));
    assert.ok(dashboardHTML.includes("session-restart-recovery"));
    assert.ok(dashboardHTML.includes("失败原因分布"));
    assert.ok(dashboardHTML.includes("最近执行记录"));
  });

  it("should generate standalone agent memory artifacts", () => {
    writeE2EReport({
      generatedAt: "2026-03-21T10:00:00.000Z",
      zoteroVersion: "8.0.1",
      strategy: "restart",
      passed: false,
      primaryDiagnosis: {
        fingerprint: "bootstrap:plugin-not-mounted",
        featureLabel: "启动与挂载",
        candidateFiles: ["src/app/plugin.js"],
      },
      cycles: [
        {
          index: 1,
          bootMode: "hot-reload",
          passed: false,
        },
      ],
    });
    writeAutofixReport({
      generatedAt: "2026-03-21T10:05:00.000Z",
      initialStrategy: "restart",
      recovered: false,
      outcomeLabel: "未恢复",
      runtimeContext: {
        zoteroVersion: "8.0.1",
        latestBootMode: "hot-reload",
        bootModes: ["hot-reload"],
      },
      patchPlan: {
        fingerprint: "bootstrap:plugin-not-mounted",
        featureLabel: "启动与挂载",
        candidateFiles: ["src/app/plugin.js"],
      },
      attempts: [],
      recommendations: [],
    });
    writeReleaseMatrix({
      generatedAt: "2026-03-21T10:15:00.000Z",
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
          installSmokePassed: true,
        },
        {
          id: "beta",
          label: "Beta 版",
          installSmokePresent: false,
          installSmokePassed: false,
        },
      ],
      blockingIssues: ["Beta 渠道 smoke 未通过"],
      attentionIssues: ["Beta 渠道尚未完成安装态 smoke"],
    });
    writeAutofixHistoryEntry({
      runId: "20260321T070000000Z",
      generatedAt: "2026-03-21T07:00:00.000Z",
      recovered: true,
      outcomeLabel: "已恢复",
      runtimeContext: {
        zoteroVersion: "8.0.1",
        latestBootMode: "hot-reload",
        bootModes: ["hot-reload"],
      },
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
          {
            id: "visual-drift-count",
            label: "视觉漂移数量",
            kind: "report-field",
            required: false,
            satisfied: false,
          },
        ],
      },
    });
    writeAutofixHistoryEntry({
      runId: "20260321T063000000Z",
      generatedAt: "2026-03-21T06:30:00.000Z",
      recovered: false,
      outcomeLabel: "未恢复",
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
          { reason: "target-file-missing", count: 1 },
        ],
      },
      verificationContract: {
        status: "verification-failed",
        checks: [
          {
            id: "locale-ftl-key",
            label: "Locale FTL Key 恢复",
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
    });

    execNode(["scripts/agent-memory.mjs"]);

    const memoryJSON = readArtifactJSON("agent-memory.json");
    const memoryMD = readArtifactText("agent-memory.md");
    const memoryArchiveLatest = readArtifactJSON(path.join("agent-memory", "latest.json"));
    const memoryHistoryIndex = readArtifactJSON(path.join("agent-memory", "history-index.json"));
    const fingerprintIndex = readArtifactJSON(path.join("agent-memory", "fingerprints", "index.json"));
    const reasonIndex = readArtifactJSON(path.join("agent-memory", "reasons", "index.json"));
    const signalIndex = readArtifactJSON(path.join("agent-memory", "signals", "index.json"));
    const fingerprintArchive = readArtifactJSON(fingerprintIndex.entries?.[0]?.path);
    const targetFileMissingReason = reasonIndex.entries?.find((item) => item.reason === "target-file-missing");
    const reasonArchive = readArtifactJSON(targetFileMissingReason?.path);

    assert.equal(memoryJSON.present, true);
    assert.equal(memoryJSON.errorCategory, null);
    assert.equal(memoryJSON.errorCategoryLabel, null);
    assert.equal(memoryJSON.errorMessage, null);
    assert.equal(memoryJSON.failedStage, null);
    assert.equal(memoryJSON.currentIncident?.fingerprint, "bootstrap:plugin-not-mounted");
    assert.equal(memoryJSON.currentIncident?.context?.latestBootMode, "hot-reload");
    assert.equal(memoryJSON.currentIncident?.context?.zoteroVersionBucket, "8.0-stable");
    assert.equal(memoryJSON.currentIncident?.preferredStrategy?.strategyId, "bootstrap-runtime-bridge");
    assert.equal(memoryJSON.currentIncident?.preferredStrategy?.contextMatchLevel, "exact-context");
    assert.equal(memoryJSON.currentIncident?.preferredStrategy?.contextSuccessRate, 100);
    assert.equal(memoryJSON.currentIncident?.verificationPassedRate, 100);
    assert.equal(memoryJSON.currentIncident?.optionalFailedChecks?.[0]?.id, "visual-drift-count");
    assert.equal(memoryJSON.recommendation?.nextAction, "npm run agent:zotero:autofix");
    assert.equal(memoryJSON.recommendation?.confidence, "high");
    assert.ok(memoryJSON.recommendation?.supportingSignals?.includes("autofix"));
    assert.equal(memoryJSON.archive?.latestJSON, "agent-memory/latest.json");
    assert.equal(memoryJSON.signalTrends?.archive?.signalIndexJSON, "agent-memory/signals/index.json");
    assert.equal(memoryJSON.reasonTrends?.archive?.reasonIndexJSON, "agent-memory/reasons/index.json");
    assert.ok(memoryJSON.signalTrends?.signals?.some((item) => item.signalId === "e2e"));
    assert.ok(memoryJSON.signalTrends?.signals?.some((item) => item.signalId === "releaseMatrix"));
    assert.ok(memoryJSON.reasonTrends?.topReasons?.some((item) => item.reason === "target-file-missing"));
    assert.equal(memoryJSON.fixOutcomeMemory?.[0]?.preferredStrategy?.verificationPassedRate, 100);
    assert.equal(memoryJSON.fixOutcomeMemory?.[0]?.preferredStrategy?.latestBootMode, "hot-reload");
    assert.equal(memoryArchiveLatest.currentIncident?.fingerprint, "bootstrap:plugin-not-mounted");
    assert.equal(memoryHistoryIndex.snapshots?.[0]?.snapshotId, memoryJSON.archive?.snapshotId);
    assert.ok(Array.isArray(fingerprintIndex.entries));
    assert.equal(fingerprintIndex.entries?.[0]?.fingerprint, "bootstrap:plugin-not-mounted");
    assert.equal(fingerprintIndex.entries?.[0]?.contexts?.[0]?.latestBootMode, "hot-reload");
    assert.equal(fingerprintIndex.entries?.[0]?.directionLabel, "基线");
    assert.equal(fingerprintIndex.entries?.[0]?.latestOutcomeLabel, "已恢复");
    assert.equal(fingerprintArchive.trend?.days?.[0]?.day, "2026-03-21");
    assert.equal(fingerprintArchive.contexts?.[0]?.latestBootMode, "hot-reload");
    assert.equal(fingerprintArchive.recentHistory?.[0]?.fingerprint, "bootstrap:plugin-not-mounted");
    assert.ok(Array.isArray(reasonIndex.entries));
    assert.ok(targetFileMissingReason);
    assert.equal(targetFileMissingReason?.directionLabel, "基线");
    assert.equal(reasonArchive.trend?.days?.[0]?.day, "2026-03-21");
    assert.equal(reasonArchive.recentHistory?.[0]?.fingerprint, "localization:item-pane-section-header-ftl-key-missing");
    assert.ok(Array.isArray(signalIndex.entries));
    assert.equal(signalIndex.entries?.[0]?.signalId, "watch");
    assert.ok(memoryMD.includes("# Agent 记忆层"));
    assert.ok(memoryMD.includes("当前故障记忆"));
    assert.ok(memoryMD.includes("当前上下文"));
    assert.ok(memoryMD.includes("上下文命中级别"));
    assert.ok(memoryMD.includes("复验通过率"));
    assert.ok(memoryMD.includes("常见观察失败"));
    assert.ok(memoryMD.includes("历史推荐"));
    assert.ok(memoryMD.includes("推荐置信度"));
    assert.ok(memoryMD.includes("运行信号趋势"));
    assert.ok(memoryMD.includes("本地发布矩阵"));
    assert.ok(memoryMD.includes("阻塞原因趋势"));
    assert.ok(memoryMD.includes("重点指纹时间序列"));
  });

  it("should show context aware memory and release matrix trend in monitor and dashboard", () => {
    writeWatchStatus({
      generatedAt: "2026-03-21T10:20:00.000Z",
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
        summaryNote: "热重载后健康检查通过",
      },
    });
    writeE2EReport({
      generatedAt: "2026-03-21T10:00:00.000Z",
      zoteroVersion: "8.0.2-beta.5+c35d7f21e",
      strategy: "restart",
      passed: false,
      primaryDiagnosis: {
        fingerprint: "bootstrap:plugin-not-mounted",
        featureLabel: "启动与挂载",
        candidateFiles: ["src/app/plugin.js"],
      },
      cycles: [
        {
          index: 1,
          bootMode: "hot-reload",
          passed: false,
          tests: { failed: 0 },
          scenarios: { failed: 0, results: [] },
          logs: { errorCount: 0, warnCount: 0 },
          visuals: {
            analysis: {
              summary: {
                baseline: {
                  driftCount: 0,
                  missingCount: 0,
                },
              },
            },
          },
        },
      ],
    });
    writeAutofixReport({
      generatedAt: "2026-03-21T10:05:00.000Z",
      initialStrategy: "restart",
      recovered: false,
      outcomeLabel: "未恢复",
      runtimeContext: {
        zoteroVersion: "8.0.2-beta.5+c35d7f21e",
        latestBootMode: "hot-reload",
        bootModes: ["hot-reload"],
      },
      patchPlan: {
        fingerprint: "bootstrap:plugin-not-mounted",
        featureLabel: "启动与挂载",
        candidateFiles: ["src/app/plugin.js"],
      },
      attempts: [],
      recommendations: [],
    });
    writeAutofixHistoryEntry({
      runId: "20260321T090000000Z",
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
        whitelistRuleId: "bootstrap-runtime-bridge",
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
    });
    writeReleaseMatrix({
      generatedAt: "2026-03-21T10:15:00.000Z",
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
          installSmokePassed: true,
        },
        {
          id: "beta",
          label: "Beta 版",
          installSmokePresent: false,
          installSmokePassed: false,
        },
      ],
      blockingIssues: ["Beta 渠道 smoke 未通过"],
      attentionIssues: ["Beta 渠道尚未完成安装态 smoke"],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    execNode(["scripts/agent-dashboard.mjs"]);

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const monitorMD = readArtifactText("agent-monitor.md");
    const dashboardHTML = readArtifactText("agent-dashboard.html");

    assert.equal(monitorJSON.agentMemory?.currentIncident?.context?.latestBootMode, "hot-reload");
    assert.equal(monitorJSON.agentMemory?.currentIncident?.context?.zoteroVersionBucket, "8.0-beta");
    assert.equal(monitorJSON.agentMemory?.currentIncident?.preferredStrategy?.contextMatchLevel, "exact-context");
    assert.ok(monitorJSON.agentMemory?.signalTrends?.signals?.some((item) => item.signalId === "releaseMatrix"));
    assert.ok(monitorMD.includes("当前上下文"));
    assert.ok(monitorMD.includes("上下文命中级别"));
    assert.ok(monitorMD.includes("本地发布矩阵"));
    assert.ok(dashboardHTML.includes("当前上下文"));
    assert.ok(dashboardHTML.includes("上下文命中级别"));
    assert.ok(dashboardHTML.includes("本地发布矩阵"));
  });

  it("should collapse legacy reader aliases into canonical fingerprints in monitor and dashboard outputs", () => {
    writeWatchStatus({
      generatedAt: "2026-03-24T11:20:00.000Z",
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
        summaryNote: "热重载后健康检查通过",
      },
    });
    writeE2EReport({
      generatedAt: "2026-03-24T11:00:00.000Z",
      strategy: "restart",
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-entry:reader-summary-command-missing",
        featureLabel: "Reader 声明式入口映射",
        candidateFiles: ["src/app/feature-composer.js"],
      },
      cycles: [
        {
          index: 1,
          bootMode: "hot-reload",
          passed: false,
          tests: { failed: 0 },
          scenarios: { failed: 0, results: [] },
          logs: { errorCount: 0, warnCount: 0 },
          visuals: {
            analysis: {
              summary: {
                baseline: {
                  driftCount: 0,
                  missingCount: 0,
                },
              },
            },
          },
        },
      ],
    });
    writeAutofixReport({
      generatedAt: "2026-03-24T11:05:00.000Z",
      initialStrategy: "restart",
      recovered: false,
      outcomeLabel: "未恢复",
      runtimeContext: {
        zoteroVersion: "8.0.2",
        latestBootMode: "hot-reload",
        bootModes: ["hot-reload"],
      },
      patchPlan: {
        fingerprint: "reader-entry:reader-summary-command-missing",
        featureLabel: "Reader 声明式入口映射",
        candidateFiles: ["src/app/feature-composer.js"],
      },
      attempts: [],
      recommendations: [],
    });
    writeAutofixHistoryEntry({
      runId: "20260324T103000000Z",
      generatedAt: "2026-03-24T10:30:00.000Z",
      recovered: true,
      outcomeLabel: "已恢复",
      runtimeContext: {
        zoteroVersion: "8.0.2",
        latestBootMode: "hot-reload",
        bootModes: ["hot-reload"],
      },
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
    });

    execNode(["scripts/agent-monitor.mjs"]);
    execNode(["scripts/agent-dashboard.mjs"]);

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const monitorMD = readArtifactText("agent-monitor.md");
    const dashboardHTML = readArtifactText("agent-dashboard.html");

    assert.equal(
      monitorJSON.agentMemory?.currentIncident?.fingerprint,
      "reader-entry:declarative-reader-mapping-drift",
    );
    assert.equal(
      monitorJSON.agentMemory?.failureMemory?.hotFingerprints?.[0]?.fingerprint,
      "reader-entry:declarative-reader-mapping-drift",
    );
    assert.ok(monitorMD.includes("reader-entry:declarative-reader-mapping-drift"));
    assert.equal(monitorMD.includes("reader-entry:reader-summary-command-missing"), false);
    assert.equal(monitorMD.includes("reader-entry:reader-summary-menu-missing"), false);
    assert.ok(dashboardHTML.includes("reader-entry:declarative-reader-mapping-drift"));
    assert.equal(dashboardHTML.includes("reader-entry:reader-summary-command-missing"), false);
    assert.equal(dashboardHTML.includes("reader-entry:reader-summary-menu-missing"), false);
  });

  it("should generate zotero loop dry-run report from current artifacts", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "failed",
      latest: {
        trigger: "runtime-recovery",
        passed: false,
        issues: ["watch still unhealthy"],
        summaryNote: "热重载后仍不健康",
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      issues: ["插件实例未挂载到 Zotero[instanceKey]。"],
      hints: ["检查 bootstrap 生命周期是否完整执行。"],
      cycles: [{
        index: 1,
        passed: false,
        checks: {
          serviceTotal: 2,
          serviceHealthyCount: 1,
          serviceUnhealthyCount: 1,
          serviceHealthOK: false,
          serviceStatus: "degraded",
        },
        logs: { errorCount: 1, warnCount: 0 },
        tests: { failed: 1 },
        scenarios: { failed: 0, results: [] },
        visuals: { analysis: { summary: { baseline: { driftCount: 0, missingCount: 0 } } } },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [{
        index: 1,
        kind: "e2e",
        label: "初始 Zotero E2E 验证",
        exitCode: 1,
        durationMs: 1200,
        ok: false,
        note: "初始验证失败",
      }],
      recommendations: ["建议先执行受控恢复。"],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: false,
      startupPassed: true,
      latestTrigger: "runtime-recovery",
      latestPassed: false,
      latestStatus: "failed",
      expectedTriggers: ["watch-change", "runtime-recovery", "session-restart-recovery"],
      observedTriggers: ["watch-change", "runtime-recovery"],
      summaryNote: "恢复链未完成闭环",
      entries: [],
      issues: ["未观测到 session-restart-recovery"],
    });

    execNode(["scripts/agent-zotero-loop.mjs", "--dry-run"]);

    const loopJSON = readArtifactJSON("agent-zotero-loop.json");
    const loopMD = readArtifactText("agent-zotero-loop.md");

    assert.equal(loopJSON.dryRun, true);
    assert.equal(loopJSON.loopPassed, false);
    assert.equal(loopJSON.initialState?.watchNeedsRefresh, true);
    assert.equal(loopJSON.initialState?.e2eNeedsRefresh, true);
    assert.equal(loopJSON.initialState?.autofixRecommended, false);
    assert.ok(Array.isArray(loopJSON.plannedActions));
    assert.ok(loopJSON.plannedActions.some((item) => item.id === "refresh-watch"));
    assert.ok(loopJSON.plannedActions.some((item) => item.id === "run-e2e"));
    assert.equal(loopJSON.plannedActions.some((item) => item.id === "run-autofix"), false);
    assert.ok(loopJSON.plannedActions.some((item) => item.id === "run-watch-recovery"));
    assert.ok(loopJSON.steps.every((item) => item.status === "planned"));
    assert.ok(loopMD.includes("# Zotero Agent 编排回合报告"));
    assert.ok(loopMD.includes("执行 Zotero 真机 E2E"));
    assert.ok(loopMD.includes("刷新 Zotero watch 健康状态"));
  });

  it("should generate obsidian intervention pack from current artifacts", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "failed",
      latest: {
        trigger: "runtime-recovery",
        passed: false,
        issues: ["watch still unhealthy"],
        summaryNote: "热重载后仍不健康",
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      primaryDiagnosis: {
        fingerprint: "bootstrap:plugin-not-mounted",
        feature: "bootstrap",
        featureLabel: "启动与挂载",
        severity: "critical",
        confidence: 0.98,
        summary: "插件实例未稳定挂载到 Zotero 运行时。",
        candidateFiles: ["src/app/plugin.js"],
      },
      cycles: [],
    });
    execNode(["scripts/agent-zotero-loop.mjs", "--dry-run"]);
    try {
      execNode(["scripts/agent-gate.mjs", "--profile", "dev", "--min-pass-rate", "0", "--max-recent-failed", "999"]);
    } catch {
      // expected gate failure for intervention pack sample
    }
    execNode(["scripts/agent-monitor.mjs"]);
    fs.mkdirSync(path.dirname(obsidianPath("05-Zotero-Agent-闭环流程图.md")), { recursive: true });
    fs.writeFileSync(obsidianPath("05-Zotero-Agent-闭环流程图.md"), "# stale", "utf-8");
    fs.writeFileSync(obsidianPath("06-Zotero-Agent-人工复核决策.excalidraw.md"), "# stale", "utf-8");
    execNode(["scripts/agent-obsidian-handoff.mjs"]);

    const handoffMD = fs.readFileSync(obsidianPath("01-Zotero-Agent-当前状态总览.md"), "utf-8");
    const handoffCanvas = fs.readFileSync(obsidianPath("00-Zotero-Agent-项目架构与闭环.canvas"), "utf-8");
    const humanQuickstartMD = fs.readFileSync(obsidianPath("03-Zotero-Agent-人工快速上手.md"), "utf-8");
    const humanAdvancedGuideMD = fs.readFileSync(obsidianPath("04-Zotero-Agent-高级介入规范.md"), "utf-8");
    const humanWindowMD = fs.readFileSync(obsidianPath("10-Zotero-Agent-人工指令窗口.md"), "utf-8");
    const visualFlowPath = obsidianPath("05-Zotero-Agent-闭环流程图.md");
    const visualExcalidrawPath = obsidianPath("06-Zotero-Agent-人工复核决策.excalidraw.md");

    assert.ok(handoffMD.includes("# Zotero Agent 当前状态总览"));
    assert.ok(handoffMD.includes("自动阻塞项"));
    assert.ok(handoffMD.includes("src/app/plugin.js"));
    assert.ok(handoffCanvas.includes("\"nodes\""));
    assert.ok(handoffCanvas.includes("人工指令窗口"));
    assert.ok(humanQuickstartMD.includes("# Zotero Agent 人工快速上手"));
    assert.ok(humanQuickstartMD.includes("[[04-Zotero-Agent-高级介入规范]]"));
    assert.ok(humanAdvancedGuideMD.includes("# Zotero Agent 高级介入规范"));
    assert.ok(humanAdvancedGuideMD.includes("## 介入规范建议"));
    assert.ok(humanWindowMD.includes("## 人工编辑区（保留）"));
    assert.equal(fs.existsSync(visualFlowPath), false);
    assert.equal(fs.existsSync(visualExcalidrawPath), false);
  });

  it("should generate optional visual companion artifacts when AGENT_OBSIDIAN_VISUALS=1", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
        summaryNote: "watch healthy",
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
        candidateFiles: ["src/features/reader.js"],
      },
      cycles: [],
    });
    execNode(["scripts/agent-zotero-loop.mjs", "--dry-run"]);
    execNode(["scripts/agent-monitor.mjs"]);
    const previousVisualFlag = process.env.AGENT_OBSIDIAN_VISUALS;
    process.env.AGENT_OBSIDIAN_VISUALS = "1";
    try {
      execNode(["scripts/agent-obsidian-handoff.mjs"]);
    } finally {
      if (previousVisualFlag === undefined) {
        delete process.env.AGENT_OBSIDIAN_VISUALS;
      } else {
        process.env.AGENT_OBSIDIAN_VISUALS = previousVisualFlag;
      }
    }

    const visualFlowMD = fs.readFileSync(obsidianPath("05-Zotero-Agent-闭环流程图.md"), "utf-8");
    const visualDecisionMD = fs.readFileSync(obsidianPath("06-Zotero-Agent-人工复核决策.excalidraw.md"), "utf-8");
    assert.ok(visualFlowMD.includes("# Zotero Agent 闭环流程图（Visual Companion）"));
    assert.ok(visualFlowMD.includes("```mermaid"));
    assert.ok(visualFlowMD.includes("agent:obsidian"));
    assert.ok(visualDecisionMD.includes("excalidraw-plugin: parsed"));
    assert.ok(visualDecisionMD.includes("# Excalidraw Data"));
    assert.ok(visualDecisionMD.includes("预期 UI 变化"));
  });

  it("should honor human override from obsidian window during zotero loop dry-run", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "startup",
        passed: true,
        issues: [],
        summaryNote: "启动后通过健康检查",
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      cycles: [{
        index: 1,
        passed: false,
        checks: {
          serviceTotal: 2,
          serviceHealthyCount: 1,
          serviceUnhealthyCount: 1,
          serviceHealthOK: false,
          serviceStatus: "degraded",
        },
        logs: { errorCount: 1, warnCount: 0 },
        tests: { failed: 1 },
        scenarios: { failed: 0, results: [] },
        visuals: { analysis: { summary: { baseline: { driftCount: 0, missingCount: 0 } } } },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      recommendations: [],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: false,
      startupPassed: true,
      latestTrigger: "runtime-recovery",
      latestPassed: false,
      latestStatus: "failed",
      expectedTriggers: ["watch-change", "runtime-recovery", "session-restart-recovery"],
      observedTriggers: ["watch-change", "runtime-recovery"],
      summaryNote: "恢复链未完成闭环",
      entries: [],
      issues: ["未观测到 session-restart-recovery"],
    });

    fs.mkdirSync(path.dirname(obsidianPath("10-Zotero-Agent-人工指令窗口.md")), { recursive: true });
    fs.writeFileSync(obsidianPath("10-Zotero-Agent-人工指令窗口.md"), [
      "# 旧内容",
      "## 人工编辑区（保留）",
      "",
      "状态: ready",
      "模式: force-next",
      "下一步指令: npm run agent:zotero:watch-recovery",
      "关注文件: src/app/plugin.js",
      "备注: 先人工要求补跑恢复回归",
      "",
    ].join("\n"), "utf-8");

    execNode(["scripts/agent-zotero-loop.mjs", "--dry-run", "--human-window-ms", "1000"]);

    const loopJSON = readArtifactJSON("agent-zotero-loop.json");
    assert.equal(loopJSON.humanWindow?.intervened, true);
    assert.equal(loopJSON.humanWindow?.decision?.nextActionOverride, "npm run agent:zotero:watch-recovery");
    assert.equal(loopJSON.plannedActions?.[0]?.id, "run-watch-recovery");
  });

  it("should evaluate agent gate and generate gate report", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: true,
      issues: [],
      hints: [],
      eventAPIReport: {
        available: true,
        registeredCount: 0,
        knownTypes: [
          "renderTextSelectionPopup",
          "renderSidebarAnnotationHeader",
          "renderToolbar",
          "createColorContextMenu",
          "createViewContextMenu",
          "createAnnotationContextMenu",
          "createThumbnailContextMenu",
          "createSelectorContextMenu",
        ],
        probeCompatibleTypes: [
          "renderTextSelectionPopup",
          "renderSidebarAnnotationHeader",
          "renderToolbar",
          "createColorContextMenu",
          "createViewContextMenu",
          "createAnnotationContextMenu",
          "createThumbnailContextMenu",
          "createSelectorContextMenu",
        ],
        probeDispatchModes: [
          "customEvent",
          "synthetic-fallback",
        ],
        syntheticFallbackAvailable: true,
      },
      cycles: [{
        index: 1,
        passed: true,
        summaryNote: "真机验证通过",
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: { failed: 0 },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: true,
      outcomeLabel: "无需恢复",
      attempts: [{
        index: 1,
        ok: true,
        durationMs: 700,
        note: "初始验证通过",
      }],
      recommendations: ["初始验证已通过，无需触发恢复步骤。"],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: [
        "watch-change",
        "runtime-recovery",
        "session-restart-recovery",
      ],
      observedTriggers: [
        "watch-change",
        "runtime-recovery",
        "session-restart-recovery",
      ],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-runner.mjs", "gate-pass-case", "--", "node", "-e", "process.exit(0)"]);
    execNode(["scripts/agent-monitor.mjs"]);
    execNode([
      "scripts/agent-gate.mjs",
      "--profile",
      "dev",
      "--require",
      "gate-pass-case",
      "--min-pass-rate",
      "0",
      "--max-recent-failed",
      "999",
    ]);

    const gateJSON = readArtifactJSON("agent-gate.json");
    const gateMD = readArtifactText("agent-gate.md");

    assert.equal(gateJSON.gatePassed, true);
    assert.equal(gateJSON.profile, "dev");
    assert.ok(Array.isArray(gateJSON.requiredChecks));
    assert.ok(typeof gateJSON.metrics?.effectivePassRate === "number");
    assert.equal(gateJSON.watchStatus?.status, "healthy");
    assert.equal(gateJSON.zoteroValidation?.e2e?.status, "passed");
    assert.equal(gateJSON.zoteroValidation?.e2e?.readerEventReport?.status, "passed");
    assert.equal(gateJSON.zoteroValidation?.autofix?.totalDurationMs, 700);
    assert.equal(gateJSON.zoteroValidation?.watchRecovery?.status, "passed");
    assert.equal(gateJSON.frontpageSummary?.status, "ready");
    assert.equal(gateJSON.readinessSummary?.status, "ready");
    assert.equal(gateJSON.frontpageSummary?.watch?.status, "healthy");
    assert.equal(gateJSON.frontpageSummary?.e2e?.status, "passed");
    assert.equal(gateJSON.frontpageSummary?.e2e?.readerEvent?.status, "passed");
    assert.equal(gateJSON.frontpageSummary?.watchRecovery?.status, "passed");
    assert.ok(typeof gateJSON.frontpageSummary?.headline === "string");
    assert.ok(typeof gateJSON.frontpageSummary?.nextAction === "string");
    assert.ok(gateJSON.requiredChecks.some((item) => item.runName === "gate-pass-case" && item.ok === true));
    assert.ok(gateMD.includes("# Agent 质量闸门报告"));
    assert.ok(gateMD.includes("## 关键任务检查"));
    assert.ok(gateMD.includes("## Zotero Watch"));
    assert.ok(gateMD.includes("## 恢复韧性摘要"));
    assert.ok(gateMD.includes("## Zotero 真机验证"));
    assert.ok(gateMD.includes("Reader 事件桥"));
    assert.ok(gateMD.includes("自动修复总耗时"));
    assert.ok(gateMD.includes("恢复回归"));
    assert.ok(gateMD.includes("恢复回归最新触发"));
  });

  it("should fail gate when required run latest status is failed", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });

    try {
      execNode(["scripts/agent-runner.mjs", "gate-fail-case", "--", "node", "-e", "process.exit(2)"]);
    } catch {
      // expected non-zero exit
    }

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--require",
        "gate-fail-case",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "gate should fail when required run latest status is failed");

    const gateJSON = readArtifactJSON("agent-gate.json");
    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.frontpageSummary?.status, "blocked");
    assert.ok(Array.isArray(gateJSON.frontpageSummary?.primaryBlockers));
    assert.ok(gateJSON.issues.some((item) => String(item).includes("gate-fail-case")));
  });

  it("should ignore unrecovered autofix history when fresh watch and e2e are already healthy", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "startup",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      strategy: "hot",
      passed: true,
      summaryNote: "真机验证通过",
      testFailed: 0,
      scenarioFailed: 0,
      logErrorCount: 0,
      serviceObserved: true,
      serviceStatus: "healthy",
      serviceTotal: 2,
      serviceHealthyCount: 2,
      serviceUnhealthyCount: 0,
      serviceHealthOK: true,
      capabilityObserved: true,
      capabilityRequiredCount: 10,
      capabilityCoveredCount: 10,
      capabilityPassedCount: 10,
      capabilityFailedCount: 0,
      capabilityUncoveredCount: 0,
      visualDriftCount: 0,
      visualEvidenceObserved: true,
      visualEvidenceItemCount: 4,
      visualEvidenceFailingItemCount: 0,
      visualCaptureStabilityObserved: true,
      visualCaptureStageCount: 2,
      visualPrimaryBlockerKind: "unknown",
      visualCanonicalCoverageKind: "complete",
      readerEventReport: {
        present: true,
        status: "passed",
        statusLabel: "通过",
        available: true,
        syntheticFallbackAvailable: true,
      },
      cycles: [{
        index: 1,
        passed: true,
        summaryNote: "真机验证通过",
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: { failed: 0 },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [{
        index: 1,
        ok: false,
        durationMs: 50,
        note: "初始验证失败，进入恢复流程",
      }],
      recommendations: ["查看 `dist/agent-zotero-autofix.md`。"],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: [
        "watch-change",
        "runtime-recovery",
        "session-restart-recovery",
      ],
      observedTriggers: [
        "watch-change",
        "runtime-recovery",
        "session-restart-recovery",
      ],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-runner.mjs", "gate-pass-case", "--", "node", "-e", "process.exit(0)"]);
    execNode(["scripts/agent-monitor.mjs"]);
    execNode([
      "scripts/agent-gate.mjs",
      "--profile",
      "dev",
      "--require",
      "gate-pass-case",
      "--min-pass-rate",
      "0",
      "--max-recent-failed",
      "999",
    ]);

    const gateJSON = readArtifactJSON("agent-gate.json");
    assert.equal(gateJSON.gatePassed, true);
    assert.equal(gateJSON.frontpageSummary?.status, "ready");
    assert.equal(gateJSON.issues.some((item) => String(item).includes("最近自动修复结果仍为未恢复")), false);
  });

  it("should fail dev gate when zotero watch status is unhealthy", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "failed",
      latest: {
        trigger: "session-restart-recovery",
        passed: false,
        issues: ["watch still unhealthy"],
      },
    });

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "gate should fail when watch status is unhealthy");

    const gateJSON = readArtifactJSON("agent-gate.json");
    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.watchStatus?.status, "failed");
    assert.ok(gateJSON.issues.some((item) => String(item).includes("Zotero watch 状态未恢复健康")));
  });

  it("should fail dev gate when zotero watch status is stale", () => {
    writeWatchStatus({
      generatedAt: "2000-01-01T00:00:00.000Z",
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "gate should fail when watch status is stale");

    const gateJSON = readArtifactJSON("agent-gate.json");
    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.watchStatus?.status, "stale");
    assert.ok(gateJSON.issues.some((item) => String(item).includes("健康状态已过期")));
  });

  it("should prioritize watch refresh before reader rerun when watch is stale and reader bridge is degraded", () => {
    writeWatchStatus({
      generatedAt: "2000-01-01T00:00:00.000Z",
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: true,
      issues: [],
      hints: ["重新执行 `npm run agent:zotero:e2e`，刷新 Reader 事件桥与细粒度 Hook 的真机结论。"],
      cycles: [{
        index: 1,
        passed: true,
        summaryNote: "Reader 事件桥未通过",
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: { failed: 0 },
        checks: {
          readerEventAPIAvailable: true,
          readerEventSyntheticFallbackAvailable: false,
          readerEventToolbarHookObserved: false,
          staticRuntimeMissingCount: 0,
          staticRuntimeDriftCount: 0,
        },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      recommendations: [],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    });

    const gateJSON = readArtifactJSON("agent-gate.json");
    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.watchStatus?.status, "stale");
    assert.ok(String(gateJSON.frontpageSummary?.nextAction || "").includes("zotero:watch"));
    const watchIssueIndex = gateJSON.issues.findIndex((item) => String(item).includes("健康状态已过期"));
    const readerIssueIndex = gateJSON.issues.findIndex((item) => {
      const text = String(item);
      return text.includes("Reader 事件桥") || text.includes("synthetic-fallback");
    });
    assert.ok(watchIssueIndex >= 0);
    assert.ok(readerIssueIndex >= 0);
    assert.ok(watchIssueIndex < readerIssueIndex);
    assert.ok(gateJSON.issues.some((item) => {
      const text = String(item);
      return text.includes("Reader 事件桥") || text.includes("synthetic-fallback");
    }));
  });

  it("should fail dev gate when zotero watch timestamp is in the future", () => {
    writeWatchStatus({
      generatedAt: "2999-01-01T00:00:00.000Z",
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "gate should fail when watch timestamp is in the future");

    const gateJSON = readArtifactJSON("agent-gate.json");
    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.watchStatus?.status, "future");
    assert.ok(gateJSON.issues.some((item) => String(item).includes("状态时间异常")));
  });

  it("should fail dev gate when zotero e2e report is failed", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      issues: ["动作链路失败"],
      hints: [],
      primaryDiagnosis: {
        fingerprint: "bootstrap:plugin-not-mounted",
        feature: "bootstrap",
        featureLabel: "启动与挂载",
        severity: "critical",
        confidence: 0.98,
        summary: "插件实例未稳定挂载到 Zotero 运行时。",
        candidateFiles: [
          "src/app/plugin.js",
          "scripts/zotero-agent-runtime-lib.mjs",
        ],
        recommendedActions: [
          "检查 bootstrap 生命周期是否完整执行。",
        ],
      },
      diagnostics: [{
        fingerprint: "bootstrap:plugin-not-mounted",
        feature: "bootstrap",
        featureLabel: "启动与挂载",
        severity: "critical",
        confidence: 0.98,
        summary: "插件实例未稳定挂载到 Zotero 运行时。",
        candidateFiles: [
          "src/app/plugin.js",
          "scripts/zotero-agent-runtime-lib.mjs",
        ],
        recommendedActions: [
          "检查 bootstrap 生命周期是否完整执行。",
        ],
      }],
      cycles: [{
        index: 1,
        passed: false,
        summaryNote: "动作链路失败",
        logs: { errorCount: 1, warnCount: 0 },
        tests: { failed: 1 },
        scenarios: { failed: 1 },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 1,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    removeAutofixReport();

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "gate should fail when zotero e2e is failed");

    const gateJSON = readArtifactJSON("agent-gate.json");
    const gateMD = readArtifactText("agent-gate.md");
    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.zoteroValidation?.e2e?.status, "failed");
    assert.equal(gateJSON.zoteroValidation?.e2e?.primaryDiagnosis?.fingerprint, "bootstrap:plugin-not-mounted");
    assert.equal(gateJSON.zoteroValidation?.e2e?.diagnosisBlocking, true);
    assert.ok(gateJSON.issues.some((item) => String(item).includes("最近 Zotero E2E 未通过")));
    assert.ok(gateJSON.issues.some((item) => String(item).includes("主诊断：启动与挂载")));
    assert.ok(gateJSON.issues.some((item) => String(item).includes("还没有对应的自动修复记录")));
    assert.ok(gateJSON.recommendations.some((item) => String(item).includes("阻断级问题")));
    assert.ok(gateJSON.recommendations.some((item) => String(item).includes("诊断建议：检查 bootstrap 生命周期是否完整执行。")));
    assert.ok(gateJSON.recommendations.some((item) => String(item).includes("src/app/plugin.js")));
    assert.ok(gateMD.includes("主诊断"));
    assert.ok(gateMD.includes("bootstrap:plugin-not-mounted"));
    assert.ok(gateMD.includes("诊断建议动作"));
  });

  it("should fail dev gate when zotero service health is degraded", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      issues: ["服务健康异常：共 2 个服务，异常 1 个。"],
      hints: ["检查 service registry 与服务健康检查实现。"],
      cycles: [{
        index: 1,
        passed: false,
        summaryNote: "服务健康异常",
        checks: {
          serviceTotal: 2,
          serviceHealthyCount: 1,
          serviceUnhealthyCount: 1,
          serviceHealthOK: false,
          serviceStatus: "degraded",
        },
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: { failed: 0 },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [{
        index: 1,
        ok: false,
        note: "服务健康异常未恢复",
      }],
      recommendations: ["请检查 service registry。"],
    });

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "gate should fail when zotero service health is degraded");

    const gateJSON = readArtifactJSON("agent-gate.json");
    const gateMD = readArtifactText("agent-gate.md");

    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.zoteroValidation?.e2e?.serviceStatus, "degraded");
    assert.equal(gateJSON.zoteroValidation?.e2e?.serviceUnhealthyCount, 1);
    assert.ok(gateJSON.issues.some((item) => String(item).includes("Zotero 服务健康异常")));
    assert.ok(gateJSON.recommendations.some((item) => String(item).includes("service registry")));
    assert.ok(gateMD.includes("服务状态"));
    assert.ok(gateMD.includes("异常服务"));
    assert.ok(gateMD.includes("服务健康问题"));
  });

  it("should fail dev gate when zotero e2e report is stale", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: "2000-01-01T00:00:00.000Z",
      strategy: "hot",
      passed: true,
      issues: [],
      hints: [],
      cycles: [{
        index: 1,
        passed: true,
        summaryNote: "旧的真机验证结果",
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: { failed: 0 },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "gate should fail when zotero e2e is stale");

    const gateJSON = readArtifactJSON("agent-gate.json");
    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.zoteroValidation?.e2e?.status, "passed");
    assert.ok(gateJSON.issues.some((item) => String(item).includes("最近 Zotero E2E 结果已过期")));
  });

  it("should fail dev gate when autofix report is older than failed zotero e2e", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: "2026-03-19T09:00:00.000Z",
      strategy: "hot",
      passed: false,
      issues: ["动作链路失败"],
      hints: [],
      cycles: [{
        index: 1,
        passed: false,
        summaryNote: "动作链路失败",
        logs: { errorCount: 1, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: { failed: 0 },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: "2026-03-19T08:00:00.000Z",
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [{
        index: 1,
        ok: false,
        note: "旧的恢复失败记录",
      }],
      recommendations: ["请先查看最新 E2E 报告。"],
    });

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "gate should fail when autofix is older than failed zotero e2e");

    const gateJSON = readArtifactJSON("agent-gate.json");
    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.zoteroValidation?.autofixRelation, "older");
    assert.ok(gateJSON.issues.some((item) => String(item).includes("自动修复记录仍早于这次失败结果")));
  });

  it("should surface patch precheck blockers in dev gate", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: "2026-03-19T09:00:00.000Z",
      strategy: "hot",
      passed: false,
      issues: ["注册链路失败"],
      hints: [],
      cycles: [{
        index: 1,
        passed: false,
        summaryNote: "注册链路失败",
        logs: { errorCount: 1, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: { failed: 0 },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: "2026-03-19T09:05:00.000Z",
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [{
        index: 1,
        ok: false,
        note: "补丁预检失败",
      }],
      patchPlan: {
        status: "review-ready",
        statusLabel: "可进入受限补丁审阅",
        mode: "review-only",
        featureLabel: "ItemPane 注册",
      },
      patchApplication: {
        attempted: true,
        ok: false,
        status: "precheck-failed",
        appliedFiles: [],
        results: [
          { file: "src/app/plugin.js", reason: "anchor-not-found" },
          { file: "src/features/item-pane.js", reason: "anchor-not-unique" },
        ],
      },
      recommendations: ["请先处理补丁预检阻塞。"],
    });

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "gate should fail when patch precheck is blocked");

    const gateJSON = readArtifactJSON("agent-gate.json");
    const gateMD = readArtifactText("agent-gate.md");

    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.zoteroValidation?.autofix?.patchApplicationStatus, "precheck-failed");
    assert.ok(gateJSON.issues.some((item) => String(item).includes("白名单补丁预检失败")));
    assert.ok(gateJSON.recommendations.some((item) => String(item).includes("锚点不存在")));
    assert.ok(gateMD.includes("补丁应用状态"));
    assert.ok(gateMD.includes("补丁预检阻塞"));
    assert.ok(gateMD.includes("锚点不唯一"));
  });

  it("should fail dev gate when capability coverage has uncovered items", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: true,
      issues: [],
      hints: [],
      cycles: [{
        index: 1,
        passed: true,
        summaryNote: "闭环通过但能力覆盖不完整",
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "baseline registration diagnostics", status: "passed" },
          ],
        },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    removeAutofixReport();

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "gate should fail when capability coverage is incomplete");

    const gateJSON = readArtifactJSON("agent-gate.json");
    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.zoteroValidation?.e2e?.capabilityObserved, true);
    assert.ok(Number(gateJSON.zoteroValidation?.e2e?.capabilityUncoveredCount || 0) > 0);
    assert.ok(gateJSON.issues.some((item) => String(item).includes("能力地图仍有")));
  });

  it("should fail dev gate when reader event bridge is degraded", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: true,
      issues: [],
      hints: [],
      capabilitySummary: {
        observed: true,
        total: 11,
        scenarioBoundTotal: 11,
        coveredCount: 11,
        passedCount: 11,
        failedCount: 0,
        uncoveredCount: 0,
        failedCapabilityIds: [],
        uncoveredCapabilityIds: [],
        capabilities: [
          {
            id: "reader-event-hooks",
            label: "Reader 事件桥",
            status: "passed",
            scenarioNames: [
              "reader event hook diagnostics",
              "reader fine-grained hook diagnostics",
            ],
            ownedBy: ["src/features/reader.js"],
          },
        ],
      },
      cycles: [{
        index: 1,
        passed: true,
        summaryNote: "主流程通过，但 Reader 事件桥退化",
        checks: {
          readerEventAPIAvailable: false,
          readerEventListenerCount: 0,
          readerEventKnownTypeCount: 8,
          readerEventProbeTypeCount: 8,
          readerEventSyntheticFallbackAvailable: false,
        },
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: { failed: 0, results: [] },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: true,
      outcomeLabel: "无需恢复",
      attempts: [{
        index: 1,
        ok: true,
        durationMs: 100,
        note: "主流程通过",
      }],
      recommendations: ["无需恢复。"],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: [
        "watch-change",
        "runtime-recovery",
        "session-restart-recovery",
      ],
      observedTriggers: [
        "watch-change",
        "runtime-recovery",
        "session-restart-recovery",
      ],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "gate should fail when reader event bridge is degraded");

    const gateJSON = readArtifactJSON("agent-gate.json");
    const gateMD = readArtifactText("agent-gate.md");
    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.zoteroValidation?.e2e?.status, "passed");
    assert.equal(gateJSON.zoteroValidation?.e2e?.readerEventReport?.status, "failed");
    assert.equal(gateJSON.frontpageSummary?.status, "blocked");
    assert.equal(gateJSON.frontpageSummary?.e2e?.readerEvent?.status, "failed");
    assert.ok(String(gateJSON.frontpageSummary?.nextAction || "").includes("agent:zotero:e2e"));
    assert.ok(gateJSON.issues.some((item) => String(item).includes("Reader 事件桥未通过")));
    assert.ok(gateJSON.issues.some((item) => String(item).includes("Reader 事件 API 当前不可用")));
    assert.ok(gateJSON.issues.some((item) => String(item).includes("synthetic-fallback")));
    assert.ok(gateJSON.recommendations.some((item) => String(item).includes("src/features/reader.js")));
    assert.ok(gateMD.includes("Reader 事件桥"));
    assert.ok(gateMD.includes("synthetic-fallback"));
  });

  it("should fail dev gate when watch recovery regression report is failed", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "session-restart-recovery",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: true,
      issues: [],
      hints: [],
      cycles: [{
        index: 1,
        passed: true,
        summaryNote: "闭环通过",
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: { failed: 0 },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: true,
      outcomeLabel: "无需恢复",
      attempts: [{
        index: 1,
        ok: true,
        durationMs: 100,
        note: "初始验证通过",
      }],
      recommendations: ["无需恢复。"],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: false,
      startupPassed: true,
      latestTrigger: "runtime-recovery",
      latestPassed: false,
      latestStatus: "failed",
      expectedTriggers: [
        "watch-change",
        "runtime-recovery",
        "session-restart-recovery",
      ],
      observedTriggers: [
        "watch-change",
        "runtime-recovery",
      ],
      summaryNote: "恢复链未完成闭环",
      entries: [{
        trigger: "watch-change",
        passed: false,
        at: new Date().toISOString(),
        summaryNote: "热重载失败",
      }],
      issues: ["未观测到完整恢复触发序列：session-restart-recovery"],
    });

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "gate should fail when watch recovery regression is failed");

    const gateJSON = readArtifactJSON("agent-gate.json");
    const gateMD = readArtifactText("agent-gate.md");
    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.zoteroValidation?.watchRecovery?.status, "failed");
    assert.equal(gateJSON.frontpageSummary?.status, "blocked");
    assert.equal(gateJSON.frontpageSummary?.watchRecovery?.status, "failed");
    assert.ok(String(gateJSON.frontpageSummary?.nextAction || "").includes("agent:zotero:watch-recovery"));
    assert.ok(gateJSON.issues.some((item) => String(item).includes("最近 watch 恢复回归未通过")));
    assert.ok(gateMD.includes("恢复回归问题"));
    assert.ok(gateMD.includes("session-restart-recovery"));
  });

  it("should include local release matrix in monitor markdown and dashboard html", () => {
    writeReleaseMatrix({
      generatedAt: "2026-03-23T10:00:00.000Z",
      addonId: "cleanroom-template@example.com",
      addonVersion: "0.1.0",
      status: "attention",
      statusLabel: "待补验证",
      summary: "本地元数据与 XPI 完整性已通过，但仍缺少安装态 smoke。",
      passedProfileCount: 0,
      failedProfileCount: 0,
      attentionProfileCount: 2,
      artifacts: {
        xpiName: "cleanroomtemplate-0.1.0.xpi",
        xpiSHA256Actual: "abc123",
        xpiSizeBytesActual: 12345,
      },
      blockingRuntimeErrorCount: 0,
      hostNoiseErrorCount: 0,
      blockingRuntimeErrorPortrait: "-",
      hostNoiseRuntimeErrorPortrait: "-",
      blockingIssues: [],
      attentionIssues: [
        "稳定版: 本地元数据与 XPI 完整性已通过，但安装态 smoke 尚未执行。",
      ],
      hostNoiseIssues: [],
      profiles: [
        {
          id: "stable",
          label: "稳定版",
          status: "attention",
          statusLabel: "待补验证",
          summary: "本地元数据与 XPI 完整性已通过，但安装态 smoke 尚未执行。",
          metadataConsistent: true,
          packageConsistent: true,
          installSmokePresent: false,
          installSmokePassed: null,
          blockingRuntimeErrorPortrait: "-",
          hostNoiseRuntimeErrorPortrait: "-",
          installSmoke: {
            readinessMode: null,
          },
        },
        {
          id: "beta",
          label: "Beta 版",
          status: "attention",
          statusLabel: "待补验证",
          summary: "本地元数据与 XPI 完整性已通过，但安装态 smoke 尚未执行。",
          metadataConsistent: true,
          packageConsistent: true,
          installSmokePresent: false,
          installSmokePassed: null,
          blockingRuntimeErrorPortrait: "-",
          hostNoiseRuntimeErrorPortrait: "-",
          installSmoke: {
            readinessMode: null,
          },
        },
      ],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    execNode(["scripts/agent-dashboard.mjs"]);

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const monitorMD = readArtifactText("agent-monitor.md");
    const dashboardHTML = readArtifactText("agent-dashboard.html");

    assert.equal(monitorJSON.releaseMatrix?.status, "attention");
    assert.equal(monitorJSON.releaseMatrix?.profiles?.length, 2);
    assert.ok(monitorMD.includes("## 本地发布矩阵"));
    assert.ok(monitorMD.includes("阻断型错误"));
    assert.ok(monitorMD.includes("待补验证"));
    assert.ok(dashboardHTML.includes("本地发布矩阵"));
    assert.ok(dashboardHTML.includes("阻断错误画像"));
    assert.ok(dashboardHTML.includes("渠道矩阵"));
  });

  it("should keep host-noise visible without blocking release gate", () => {
    execNode(["scripts/agent-runner.mjs", "check", "--", "node", "-e", "process.exit(0)"]);
    execNode(["scripts/agent-runner.mjs", "release-plan", "--", "node", "-e", "process.exit(0)"]);

    writeReleaseMatrix({
      generatedAt: "2026-03-23T10:10:00.000Z",
      addonId: "cleanroom-template@example.com",
      addonVersion: "0.1.0",
      status: "passed",
      statusLabel: "通过",
      summary: "本地 stable/beta 发布矩阵已通过；共发现 2 条宿主噪声，已归类为不阻断发布。",
      passedProfileCount: 2,
      failedProfileCount: 0,
      attentionProfileCount: 0,
      blockingRuntimeErrorCount: 0,
      hostNoiseErrorCount: 2,
      blockingRuntimeErrorPortrait: "-",
      hostNoiseRuntimeErrorPortrait: "宿主噪声：remote-settings 资源缺失 x1；宿主噪声：loading.svg 资源缺失 x1",
      artifacts: {
        xpiName: "cleanroomtemplate-0.1.0.xpi",
        xpiSHA256Actual: "abc123",
        xpiSizeBytesActual: 12345,
      },
      blockingIssues: [],
      attentionIssues: [],
      hostNoiseIssues: [
        "稳定版: 宿主噪声：remote-settings 资源缺失 x1；宿主噪声：loading.svg 资源缺失 x1",
      ],
      profiles: [
        {
          id: "stable",
          label: "稳定版",
          status: "passed",
          statusLabel: "通过",
          summary: "稳定版 安装态 smoke 通过；宿主噪声已归类，不阻断发布：宿主噪声：remote-settings 资源缺失 x1；宿主噪声：loading.svg 资源缺失 x1",
          metadataConsistent: true,
          packageConsistent: true,
          installSmokePresent: true,
          installSmokePassed: true,
          blockingRuntimeErrorPortrait: "-",
          hostNoiseRuntimeErrorPortrait: "宿主噪声：remote-settings 资源缺失 x1；宿主噪声：loading.svg 资源缺失 x1",
          installSmoke: {
            readinessMode: "native",
            durationMs: 1010,
          },
        },
        {
          id: "beta",
          label: "Beta 版",
          status: "passed",
          statusLabel: "通过",
          summary: "Beta 版安装态 smoke 通过。",
          metadataConsistent: true,
          packageConsistent: true,
          installSmokePresent: true,
          installSmokePassed: true,
          blockingRuntimeErrorPortrait: "-",
          hostNoiseRuntimeErrorPortrait: "-",
          installSmoke: {
            readinessMode: "native",
            durationMs: 980,
          },
        },
      ],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    execNode(["scripts/agent-dashboard.mjs"]);
    execNode([
      "scripts/agent-gate.mjs",
      "--profile",
      "release",
      "--min-pass-rate",
      "0",
      "--max-recent-failed",
      "999",
    ]);

    const gateJSON = readArtifactJSON("agent-gate.json");
    const gateMD = readArtifactText("agent-gate.md");
    const monitorMD = readArtifactText("agent-monitor.md");
    const dashboardHTML = readArtifactText("agent-dashboard.html");

    assert.equal(gateJSON.gatePassed, true);
    assert.equal(gateJSON.releaseMatrix?.status, "passed");
    assert.equal(gateJSON.releaseMatrix?.hostNoiseErrorCount, 2);
    assert.equal(gateJSON.releaseMatrix?.blockingRuntimeErrorCount, 0);
    assert.equal(gateJSON.issues.length, 0);
    assert.ok(monitorMD.includes("宿主噪声画像"));
    assert.ok(monitorMD.includes("工程化硬化信号"));
    assert.ok(dashboardHTML.includes("宿主噪声渠道"));
    assert.ok(dashboardHTML.includes("工程化硬化信号"));
    assert.ok(gateMD.includes("宿主噪声画像"));
    assert.ok(gateMD.includes("工程化硬化信号"));
    assert.ok(gateMD.includes("remote-settings 资源缺失"));
  });

  it("should fail release gate when local release matrix is not passed", () => {
    execNode(["scripts/agent-runner.mjs", "check", "--", "node", "-e", "process.exit(0)"]);
    execNode(["scripts/agent-runner.mjs", "release-plan", "--", "node", "-e", "process.exit(0)"]);

    writeReleaseMatrix({
      generatedAt: "2026-03-23T10:00:00.000Z",
      addonId: "cleanroom-template@example.com",
      addonVersion: "0.1.0",
      status: "attention",
      statusLabel: "待补验证",
      summary: "本地元数据与 XPI 完整性已通过，但仍缺少安装态 smoke。",
      passedProfileCount: 0,
      failedProfileCount: 0,
      attentionProfileCount: 2,
      artifacts: {
        xpiName: "cleanroomtemplate-0.1.0.xpi",
        xpiSHA256Actual: "abc123",
        xpiSizeBytesActual: 12345,
      },
      blockingIssues: [],
      attentionIssues: [
        "稳定版: 本地元数据与 XPI 完整性已通过，但安装态 smoke 尚未执行。",
        "Beta 版: 本地元数据与 XPI 完整性已通过，但安装态 smoke 尚未执行。",
      ],
      profiles: [
        {
          id: "stable",
          label: "稳定版",
          status: "attention",
          statusLabel: "待补验证",
          summary: "本地元数据与 XPI 完整性已通过，但安装态 smoke 尚未执行。",
          metadataConsistent: true,
          packageConsistent: true,
          installSmokePresent: false,
          installSmokePassed: null,
          installSmoke: {
            readinessMode: null,
          },
        },
        {
          id: "beta",
          label: "Beta 版",
          status: "attention",
          statusLabel: "待补验证",
          summary: "本地元数据与 XPI 完整性已通过，但安装态 smoke 尚未执行。",
          metadataConsistent: true,
          packageConsistent: true,
          installSmokePresent: false,
          installSmokePassed: null,
          installSmoke: {
            readinessMode: null,
          },
        },
      ],
    });

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "release",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    }, "release gate should fail when release matrix is not passed");

    const gateJSON = readArtifactJSON("agent-gate.json");
    const gateMD = readArtifactText("agent-gate.md");
    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.releaseMatrix?.status, "attention");
    assert.ok(gateJSON.issues.some((item) => String(item).includes("本地发布矩阵未通过")));
    assert.ok(gateJSON.issues.some((item) => String(item).includes("发布矩阵待补验证")));
    assert.ok(gateMD.includes("## 本地发布矩阵"));
    assert.ok(gateMD.includes("待补验证"));
  });

  it("should display unsupported diagnosis blocker category in monitor and dashboard", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
        summaryNote: "热重载后健康检查通过",
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      issues: ["插件实例未挂载到 Zotero[instanceKey]。"],
      primaryDiagnosis: {
        fingerprint: "bootstrap:plugin-not-mounted",
        featureLabel: "启动与挂载",
        candidateFiles: ["src/app/plugin.js"],
      },
      cycles: [{
        index: 1,
        passed: false,
        tests: { failed: 0 },
        scenarios: { failed: 0, results: [] },
        logs: { errorCount: 0, warnCount: 0 },
        visuals: { analysis: { summary: { baseline: { driftCount: 0, missingCount: 0 } } } },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      patchPlan: {
        status: "no-whitelist-match",
        statusLabel: "未命中白名单",
        mode: "none",
        fingerprint: "bootstrap:plugin-not-mounted",
        featureLabel: "启动与挂载",
        unsupportedDiagnosisCategory: "generic-runtime-failure",
        unsupportedDiagnosisCategoryLabel: "泛化运行时失败",
        unsupportedDiagnosisReason: "当前故障仍停留在插件挂载失败层，尚未收敛到可安全回放的单点白名单补丁。",
      },
    });
    writeAutofixHistoryEntry({
      runId: "20260323T120000000Z",
      generatedAt: "2026-03-23T12:00:00.000Z",
      recovered: false,
      outcomeLabel: "未恢复",
      sourceDiagnosis: {
        fingerprint: "bootstrap:plugin-not-mounted",
        featureLabel: "启动与挂载",
        candidateFiles: ["src/app/plugin.js"],
      },
      patch: {
        whitelistRuleId: null,
        featureLabel: "启动与挂载",
        unsupportedDiagnosisCategory: "generic-runtime-failure",
        unsupportedDiagnosisCategoryLabel: "泛化运行时失败",
        unsupportedDiagnosisReason: "当前故障仍停留在插件挂载失败层，尚未收敛到可安全回放的单点白名单补丁。",
        resultReasonSummary: [],
      },
      verificationContract: {
        status: "verification-failed",
        checks: [],
      },
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复链已闭环",
      issues: [],
      entries: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    execNode(["scripts/agent-dashboard.mjs"]);

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const monitorMD = readArtifactText("agent-monitor.md");
    const dashboardHTML = readArtifactText("agent-dashboard.html");

    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchUnsupportedDiagnosisCategory, "generic-runtime-failure");
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchUnsupportedDiagnosisCategoryLabel, "泛化运行时失败");
    assert.ok(monitorJSON.zoteroValidation?.autofix?.patchUnsupportedDiagnosisReason?.includes("插件挂载失败层"));
    assert.ok(monitorMD.includes("未进入白名单原因"));
    assert.ok(monitorMD.includes("泛化运行时失败"));
    assert.ok(monitorMD.includes("插件挂载失败层"));
    assert.ok(dashboardHTML.includes("未进入白名单: 泛化运行时失败"));
    assert.ok(dashboardHTML.includes("阻塞说明"));
  });

  it("should display icon resource drift in monitor and dashboard with Chinese labels", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
        summaryNote: "热重载后健康检查通过",
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      issues: ["静态运行时基线漂移：addon-static/content/icons/icon-96.png"],
      primaryDiagnosis: {
        fingerprint: "assets:icon-resource-drift",
        feature: "assets",
        featureLabel: "静态资源与图标",
        severity: "medium",
        confidence: 0.95,
        summary: "icon 资源文件发生漂移。",
        candidateFiles: ["addon-static/content/icons/icon-96.png"],
      },
      cycles: [{
        index: 1,
        passed: false,
        checks: {
          staticRuntimeMissingCount: 0,
          staticRuntimeDriftCount: 1,
          staticRuntimeDriftEntries: [{
            path: "addon-static/content/icons/icon-96.png",
            type: "icon",
            fingerprint: "assets:icon-resource-drift",
          }],
        },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      patchPlan: {
        status: "review-ready",
        statusLabel: "可进入受限补丁审阅",
        mode: "review-only",
        fingerprint: "assets:icon-resource-drift",
        featureLabel: "静态资源与图标",
        allowedTargets: ["addon-static/content/icons/icon-96.png"],
        patchDrafts: [
          {
            file: "addon-static/content/icons/icon-96.png",
            operation: "copy",
            sourceFile: "scripts/baselines/icons/icon-96.png",
          },
        ],
        verificationContract: {
          summary: "补丁后必须确认 icon 资源基线恢复。",
          checks: [
            {
              id: "static-runtime-drift-count",
              label: "静态运行时漂移数量",
              kind: "all-cycle-check",
              required: true,
              satisfied: false,
            },
          ],
        },
      },
      recommendations: ["执行受控基线恢复。"],
    });
    writeAutofixHistoryEntry({
      runId: "20260324T120000000Z",
      generatedAt: "2026-03-24T12:00:00.000Z",
      recovered: false,
      outcomeLabel: "未恢复",
      sourceDiagnosis: {
        fingerprint: "assets:icon-resource-drift",
        featureLabel: "静态资源与图标",
        candidateFiles: ["addon-static/content/icons/icon-96.png"],
      },
      patch: {
        whitelistRuleId: "assets-icon-resource-file",
        featureLabel: "静态资源与图标",
        draftOperations: [{ operation: "copy", count: 1 }],
        resultReasonSummary: [{ reason: "ready", count: 1 }],
      },
      verificationContract: {
        status: "verification-failed",
        checks: [
          {
            id: "static-runtime-drift-count",
            label: "静态运行时漂移数量",
            kind: "all-cycle-check",
            required: true,
            satisfied: false,
          },
        ],
      },
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复链已闭环",
      issues: [],
      entries: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    execNode(["scripts/agent-dashboard.mjs"]);

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const monitorMD = readArtifactText("agent-monitor.md");
    const dashboardHTML = readArtifactText("agent-dashboard.html");

    assert.equal(monitorJSON.zoteroValidation?.e2e?.staticRuntimeDriftCount, 1);
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchPlanFeature, "静态资源与图标");
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchDraftOperations?.[0]?.operation, "copy");
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchDraftOperations?.[0]?.label, "刷新基线");
    assert.ok(monitorMD.includes("静态资源与图标"));
    assert.ok(monitorMD.includes("刷新基线"));
    assert.ok(dashboardHTML.includes("静态资源与图标"));
    assert.ok(monitorJSON.agentMemory?.signalTrends?.signals?.some((item) => item.signalId === "e2e"));
  });

  it("should display icon resource missing in monitor with Chinese summary", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
        summaryNote: "热重载后健康检查通过",
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: false,
      issues: ["静态运行时基线缺失：addon-static/content/icons/icon-48.png"],
      primaryDiagnosis: {
        fingerprint: "assets:icon-resource-missing",
        feature: "assets",
        featureLabel: "静态资源与图标",
        severity: "medium",
        confidence: 0.95,
        summary: "icon 资源文件缺失。",
        candidateFiles: ["addon-static/content/icons/icon-48.png"],
      },
      cycles: [{
        index: 1,
        passed: false,
        checks: {
          staticRuntimeMissingCount: 1,
          staticRuntimeMissingEntries: [{
            path: "addon-static/content/icons/icon-48.png",
            type: "icon",
            fingerprint: "assets:icon-resource-missing",
          }],
          staticRuntimeDriftCount: 0,
        },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      patchPlan: {
        status: "review-ready",
        statusLabel: "可进入受限补丁审阅",
        mode: "review-only",
        fingerprint: "assets:icon-resource-missing",
        featureLabel: "静态资源与图标",
        allowedTargets: ["addon-static/content/icons/icon-48.png"],
        patchDrafts: [
          {
            file: "addon-static/content/icons/icon-48.png",
            operation: "copy",
            sourceFile: "scripts/baselines/icons/icon-48.png",
          },
        ],
        verificationContract: {
          summary: "补丁后必须确认 icon 资源基线恢复。",
          checks: [
            {
              id: "static-runtime-missing-count",
              label: "静态运行时缺失数量",
              kind: "all-cycle-check",
              required: true,
              satisfied: false,
            },
          ],
        },
      },
      recommendations: ["执行受控基线恢复。"],
    });
    writeAutofixHistoryEntry({
      runId: "20260324T130000000Z",
      generatedAt: "2026-03-24T13:00:00.000Z",
      recovered: true,
      outcomeLabel: "已恢复",
      sourceDiagnosis: {
        fingerprint: "assets:icon-resource-missing",
        featureLabel: "静态资源与图标",
        candidateFiles: ["addon-static/content/icons/icon-48.png"],
      },
      patch: {
        whitelistRuleId: "assets-icon-resource-file",
        featureLabel: "静态资源与图标",
        draftOperations: [{ operation: "copy", count: 1 }],
        resultReasonSummary: [{ reason: "applied", count: 1 }],
      },
      verificationContract: {
        status: "verification-passed",
        checks: [
          {
            id: "static-runtime-missing-count",
            label: "静态运行时缺失数量",
            kind: "all-cycle-check",
            required: true,
            satisfied: true,
          },
        ],
      },
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复链已闭环",
      issues: [],
      entries: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const monitorMD = readArtifactText("agent-monitor.md");

    assert.equal(monitorJSON.zoteroValidation?.e2e?.staticRuntimeMissingCount, 1);
    assert.equal(monitorJSON.zoteroValidation?.autofix?.patchPlanFeature, "静态资源与图标");
    assert.ok(monitorMD.includes("静态资源与图标"));
  });

  it("should display reader deeper event point fields with Chinese summary in monitor and dashboard", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
        summaryNote: "热重载后健康检查通过",
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: true,
      issues: [],
      hints: [],
      cycles: [{
        index: 1,
        passed: true,
        summaryNote: "真机闭环通过",
        checks: {
          serviceTotal: 2,
          serviceHealthyCount: 2,
          serviceUnhealthyCount: 0,
          serviceHealthOK: true,
          serviceStatus: "healthy",
          readerEventAPIAvailable: true,
          readerEventListenerCount: 8,
          readerEventKnownTypeCount: 8,
          readerEventProbeTypeCount: 8,
          readerEventSyntheticFallbackAvailable: true,
        },
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "baseline registration diagnostics", status: "passed" },
            {
              name: "reader event hook diagnostics",
              status: "passed",
              details: {
                firstInvocation: {
                  type: "renderToolbar",
                },
                snapshot: {
                  eventListenerCount: 1,
                  eventListeners: [
                    { type: "renderToolbar", pluginID: "cleanroom-template@example.com" },
                  ],
                },
              },
            },
            {
              name: "reader fine-grained hook diagnostics",
              status: "passed",
              details: {
                selectionProbe: {
                  type: "renderTextSelectionPopup",
                  dispatchMode: "synthetic-fallback",
                  appendedItemCount: 1,
                },
                toolbarProbe: {
                  type: "renderToolbar",
                  dispatchMode: "customEvent",
                  appendedItemCount: 1,
                },
                sidebarHeaderProbe: {
                  type: "renderSidebarAnnotationHeader",
                  dispatchMode: "customEvent",
                  appendedItemCount: 2,
                },
                menuProbes: [
                  { type: "createViewContextMenu", dispatchMode: "synthetic-fallback" },
                  { type: "createAnnotationContextMenu", dispatchMode: "synthetic-fallback" },
                  { type: "createColorContextMenu", dispatchMode: "synthetic-fallback" },
                ],
                snapshot: {
                  eventTypes: [
                    "renderToolbar",
                    "renderTextSelectionPopup",
                    "renderSidebarAnnotationHeader",
                    "createViewContextMenu",
                    "createAnnotationContextMenu",
                    "createColorContextMenu",
                  ],
                },
              },
            },
            {
              name: "reader interaction diagnostics",
              status: "passed",
              details: {
                interaction: {
                  sidebarView: "annotations",
                  contextPaneOpen: true,
                },
                selectionPopupDispatchMode: "synthetic-fallback",
                selectionPopupAppendedItemCount: 1,
                sidebarHeaderDispatchMode: "customEvent",
                sidebarHeaderAppendedItemCount: 2,
                contextMenuProbeCount: 3,
                contextMenuObservedTypes: [
                  "createViewContextMenu",
                  "createAnnotationContextMenu",
                  "createColorContextMenu",
                ],
                contextMenuSyntheticFallbackTypes: [
                  "createViewContextMenu",
                  "createAnnotationContextMenu",
                  "createColorContextMenu",
                ],
              },
            },
          ],
        },
        visuals: {
          captureStability: {
            stages: [
              { kind: "library", stable: true, attemptCount: 2, selectionReason: "stable-hash-pair" },
              { kind: "reader", stable: true, attemptCount: 2, selectionReason: "stable-hash-pair" },
            ],
          },
          analysis: {
            baselines: [
              {
                kind: "library",
                status: "compared",
                ok: true,
              },
              {
                kind: "reader",
                status: "compared",
                ok: true,
              },
            ],
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: true,
      outcomeLabel: "无需恢复",
      attempts: [{
        index: 1,
        ok: true,
        durationMs: 700,
        note: "初始验证通过",
      }],
      recommendations: ["初始验证已通过，无需触发恢复步骤。"],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: [
        "watch-change",
        "session-restart-recovery",
      ],
      observedTriggers: [
        "watch-change",
        "session-restart-recovery",
      ],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);
    execNode(["scripts/agent-dashboard.mjs"]);

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const monitorMD = readArtifactText("agent-monitor.md");
    const dashboardHTML = readArtifactText("agent-dashboard.html");

    assert.equal(monitorJSON.zoteroValidation?.e2e?.status, "passed");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.readerHostStateObserved, true);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.readerSidebarView, "annotations");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.selectionPopupDispatchMode, "synthetic-fallback");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.selectionPopupAppendedItemCount, 1);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.sidebarHeaderDispatchMode, "customEvent");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.sidebarHeaderAppendedItemCount, 2);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.contextMenuProbeCount, 3);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.contextMenuObservedTypes?.length, 3);
    assert.ok(monitorJSON.zoteroValidation?.e2e?.contextMenuObservedTypes?.includes("createViewContextMenu"));
    assert.equal(monitorJSON.zoteroValidation?.e2e?.contextMenuSyntheticFallbackTypes?.length, 3);
    assert.ok(monitorJSON.zoteroValidation?.e2e?.readerDispatchSummary?.includes("文本浮层"));
    assert.ok(monitorJSON.zoteroValidation?.e2e?.readerDispatchSummary?.includes("synthetic-fallback"));
    assert.ok(monitorJSON.zoteroValidation?.e2e?.readerDispatchSummary?.includes("侧栏批注头"));
    assert.ok(monitorJSON.zoteroValidation?.e2e?.readerDispatchSummary?.includes("customEvent"));
    assert.ok(monitorJSON.zoteroValidation?.e2e?.contextMenuSummary?.includes("已观测 3 类"));
    assert.ok(monitorJSON.zoteroValidation?.e2e?.contextMenuSummary?.includes("synthetic-fallback 3 类"));
    assert.ok(monitorJSON.zoteroValidation?.e2e?.visualCaptureStabilitySummary?.includes("library 稳定"));
    assert.ok(monitorMD.includes("Toolbar 证据"));
    assert.ok(monitorMD.includes("视觉证据"));
    assert.ok(monitorMD.includes("视觉采集稳定性"));
    assert.ok(monitorMD.includes("Toolbar 宿主点已观测"));
    assert.ok(monitorMD.includes("library 已对齐"));
    assert.ok(monitorMD.includes("library 稳定"));
    assert.ok(monitorMD.includes("文本浮层"));
    assert.ok(monitorMD.includes("侧栏批注头"));
    assert.ok(monitorMD.includes("已观测 3 类"));
    assert.ok(dashboardHTML.includes("Toolbar 证据"));
    assert.ok(dashboardHTML.includes("视觉证据"));
    assert.ok(dashboardHTML.includes("视觉采集稳定性"));
    assert.ok(dashboardHTML.includes("Toolbar 宿主点已观测"));
    assert.ok(dashboardHTML.includes("library 已对齐"));
    assert.ok(dashboardHTML.includes("library 稳定"));
    assert.ok(dashboardHTML.includes("文本浮层"));
    assert.ok(dashboardHTML.includes("侧栏批注头"));
  });

  it("should handle reader deeper event point fields with null fallbacks in telemetry", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
        summaryNote: "热重载后健康检查通过",
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: true,
      issues: [],
      hints: [],
      cycles: [{
        index: 1,
        passed: true,
        summaryNote: "真机闭环通过",
        checks: {},
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            {
              name: "reader interaction diagnostics",
              status: "passed",
              details: {
                interaction: {
                  sidebarView: null,
                  contextPaneOpen: null,
                },
                selectionPopupDispatchMode: null,
                selectionPopupAppendedItemCount: null,
                sidebarHeaderDispatchMode: null,
                sidebarHeaderAppendedItemCount: null,
                contextMenuProbeCount: null,
                contextMenuObservedTypes: [],
                contextMenuSyntheticFallbackTypes: [],
              },
            },
          ],
        },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: true,
      outcomeLabel: "无需恢复",
      attempts: [{
        index: 1,
        ok: true,
        durationMs: 100,
        note: "初始验证通过",
      }],
      recommendations: ["无需恢复。"],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);

    const monitorJSON = readArtifactJSON("agent-monitor.json");

    assert.equal(monitorJSON.zoteroValidation?.e2e?.status, "passed");
    assert.equal(monitorJSON.zoteroValidation?.e2e?.selectionPopupDispatchMode, null);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.selectionPopupAppendedItemCount, null);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.sidebarHeaderDispatchMode, null);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.sidebarHeaderAppendedItemCount, null);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.contextMenuProbeCount, null);
    assert.deepEqual(monitorJSON.zoteroValidation?.e2e?.contextMenuObservedTypes, []);
    assert.deepEqual(monitorJSON.zoteroValidation?.e2e?.contextMenuSyntheticFallbackTypes, []);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.toolbarEvidenceSummary, null);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualEvidenceSummary, null);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.visualCaptureStabilitySummary, null);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.readerDispatchSummary, null);
    assert.equal(monitorJSON.zoteroValidation?.e2e?.contextMenuSummary, null);
  });

  it("should set error fields to null on successful monitor generation", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: true,
      issues: [],
      cycles: [{
        index: 1,
        passed: true,
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: { failed: 0 },
        visuals: { analysis: { summary: { baseline: { driftCount: 0, missingCount: 0 } } } },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: true,
      outcomeLabel: "无需恢复",
      attempts: [{ index: 1, ok: true, durationMs: 100 }],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-monitor.mjs"]);

    const monitorJSON = readArtifactJSON("agent-monitor.json");
    const monitorMD = readArtifactText("agent-monitor.md");

    assert.equal(monitorJSON.errorCategory, null);
    assert.equal(monitorJSON.errorCategoryLabel, null);
    assert.equal(monitorJSON.errorMessage, null);
    assert.equal(monitorJSON.failedStage, null);
    assert.ok(typeof monitorJSON.durationMs === "number");
    assert.ok(monitorJSON.durationMs >= 0);
    assert.ok(!monitorMD.includes("脚本失败画像"));
    assert.ok(!monitorMD.includes("E2E 失败分类:"));
  });

  it("should populate error fields on gate failure", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });

    try {
      execNode(["scripts/agent-runner.mjs", "gate-error-case", "--", "node", "-e", "process.exit(2)"]);
    } catch {
      // expected
    }

    execNode(["scripts/agent-monitor.mjs"]);

    assert.throws(() => {
      execNode([
        "scripts/agent-gate.mjs",
        "--profile",
        "dev",
        "--require",
        "gate-error-case",
        "--min-pass-rate",
        "0",
        "--max-recent-failed",
        "999",
      ]);
    });

    const gateJSON = readArtifactJSON("agent-gate.json");
    const gateMD = readArtifactText("agent-gate.md");

    assert.equal(gateJSON.gatePassed, false);
    assert.equal(gateJSON.errorCategory, "validation");
    assert.equal(gateJSON.errorCategoryLabel, "验证错误");
    assert.ok(typeof gateJSON.errorMessage === "string");
    assert.ok(gateJSON.errorMessage.length > 0);
    assert.equal(gateJSON.failedStage, "gate-evaluation");
    assert.ok(typeof gateJSON.durationMs === "number");
    assert.ok(gateJSON.durationMs >= 0);
    assert.ok(gateMD.includes("## 脚本失败画像"));
    assert.ok(gateMD.includes("分类: `验证错误`"));
    assert.ok(gateMD.includes("阶段: `gate-evaluation`"));
  });

  it("should set error fields to null on successful gate evaluation", () => {
    writeWatchStatus({
      generatedAt: new Date().toISOString(),
      latestStatus: "healthy",
      latest: {
        trigger: "watch-change",
        passed: true,
        issues: [],
      },
    });
    writeE2EReport({
      generatedAt: new Date().toISOString(),
      strategy: "hot",
      passed: true,
      issues: [],
      cycles: [{
        index: 1,
        passed: true,
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: { failed: 0 },
        visuals: { analysis: { summary: { baseline: { driftCount: 0, missingCount: 0 } } } },
      }],
    });
    writeAutofixReport({
      generatedAt: new Date().toISOString(),
      initialStrategy: "hot",
      recovered: true,
      outcomeLabel: "无需恢复",
      attempts: [{ index: 1, ok: true, durationMs: 100 }],
    });
    writeWatchRecoveryReport({
      generatedAt: new Date().toISOString(),
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      expectedTriggers: ["watch-change", "session-restart-recovery"],
      observedTriggers: ["watch-change", "session-restart-recovery"],
      summaryNote: "恢复回归通过",
      entries: [],
      issues: [],
    });

    execNode(["scripts/agent-runner.mjs", "gate-ok-case", "--", "node", "-e", "process.exit(0)"]);
    execNode(["scripts/agent-monitor.mjs"]);
    execNode([
      "scripts/agent-gate.mjs",
      "--profile",
      "dev",
      "--require",
      "gate-ok-case",
      "--min-pass-rate",
      "0",
      "--max-recent-failed",
      "999",
    ]);

    const gateJSON = readArtifactJSON("agent-gate.json");
    const gateMD = readArtifactText("agent-gate.md");

    assert.equal(gateJSON.gatePassed, true);
    assert.equal(gateJSON.errorCategory, null);
    assert.equal(gateJSON.errorCategoryLabel, null);
    assert.equal(gateJSON.errorMessage, null);
    assert.equal(gateJSON.failedStage, null);
    assert.ok(typeof gateJSON.durationMs === "number");
    assert.ok(gateJSON.durationMs >= 0);
    assert.ok(!gateMD.includes("## 脚本失败画像"));
  });
});
