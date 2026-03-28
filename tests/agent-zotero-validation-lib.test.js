import { describe, it, assert } from "./test-framework.js";
import {
  buildVisualExhaustedStageSummary,
  buildPureVisualReaderFailureSummary,
  buildVisualCanonicalCoverageSummary,
  buildVisualPrimaryBlockerSummary,
  isPureVisualReaderFailure,
  pickPureVisualReaderNextAction,
  summarizeAutofixReport,
  summarizeE2EReport,
  summarizeWatchRecoveryReport,
} from "../scripts/agent-zotero-validation-lib.mjs";
import { normalizeDiagnosisFingerprint } from "../scripts/agent-zotero-diagnosis-lib.mjs";

describe("Agent Zotero Validation Lib", () => {
  it("should summarize structured diagnoses from E2E report", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-19T00:00:00.000Z",
      passed: false,
      strategy: "hot",
      zoteroVersion: "8.0.2-beta.5+c35d7f21e",
      issues: ["插件实例未挂载到 Zotero[instanceKey]。"],
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
          "检查 bootstrap 生命周期。",
        ],
        cycleIndex: 1,
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
            "检查 bootstrap 生命周期。",
          ],
          cycleIndex: 1,
        },
      ],
      cycles: [{
        index: 1,
        bootMode: "restart",
        passed: false,
        checks: {
          serviceTotal: 2,
          serviceHealthyCount: 1,
          serviceUnhealthyCount: 1,
          serviceHealthOK: false,
          serviceStatus: "degraded",
          httpObserved: true,
          httpRequestCount: 3,
          httpSuccessCount: 2,
          httpFailureCount: 1,
          httpTimeoutCount: 1,
          httpRetryCount: 1,
          httpSlowOperationCount: 1,
          httpSlowThresholdMs: 1200,
          httpLastError: {
            kind: "timeout",
            message: "HTTP request timed out after 1200ms",
          },
          hostReadyDurationMs: 2150,
          startupDurationMs: 3220,
          shutdownDurationMs: 980,
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
        tests: { failed: 1 },
        scenarios: {
          failed: 0,
          results: [
            { name: "baseline registration diagnostics", status: "passed" },
            { name: "settings schema and preference pane diagnostics", status: "passed" },
            { name: "multi-window mount diagnostics", status: "failed" },
            {
              name: "reader event hook diagnostics",
              status: "passed",
              details: {
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
                sidebarHeaderProbe: {
                  type: "renderSidebarAnnotationHeader",
                  dispatchMode: "synthetic-fallback",
                },
                toolbarProbe: {
                  type: "renderToolbar",
                  dispatchMode: "customEvent",
                },
                menuProbes: [
                  {
                    type: "createViewContextMenu",
                    dispatchMode: "synthetic-fallback",
                  },
                  {
                    type: "createAnnotationContextMenu",
                    dispatchMode: "synthetic-fallback",
                  },
                  {
                    type: "createColorContextMenu",
                    dispatchMode: "synthetic-fallback",
                  },
                  {
                    type: "createThumbnailContextMenu",
                    dispatchMode: "synthetic-fallback",
                  },
                  {
                    type: "createSelectorContextMenu",
                    dispatchMode: "synthetic-fallback",
                  },
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
            {
              name: "reader interaction diagnostics",
              status: "passed",
              details: {
                interaction: {
                  contextPaneOpen: true,
                  splitType: "vertical",
                },
              },
            },
          ],
        },
        logs: {
          errorCount: 2,
          warnCount: 1,
          errorBoundaryHitCount: 1,
          errorBoundaryEvents: [
            {
              event: "plugin.start.failed",
              count: 1,
            },
          ],
        },
        visuals: {
          captures: [
            {
              kind: "library",
              analysis: { width: 2000, height: 1200 },
            },
            {
              kind: "reader",
              analysis: { width: 2000, height: 1200 },
            },
          ],
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
                driftCount: 0,
                missingCount: 0,
              },
            },
          },
        },
      }],
    }, {
      now: "2026-03-19T00:30:00.000Z",
    });

    assert.equal(summary.status, "failed");
    assert.equal(summary.zoteroVersion, "8.0.2-beta.5+c35d7f21e");
    assert.equal(summary.zoteroVersionBucket, "8.0-beta");
    assert.equal(summary.latestBootMode, "restart");
    assert.deepEqual(summary.bootModes, ["restart"]);
    assert.equal(summary.primaryDiagnosis?.fingerprint, "bootstrap:plugin-not-mounted");
    assert.equal(summary.primaryDiagnosis?.featureLabel, "启动与挂载");
    assert.ok(Array.isArray(summary.primaryDiagnosis?.candidateFiles));
    assert.equal(summary.diagnoses.length, 1);
    assert.equal(summary.diagnoses[0].severity, "critical");
    assert.equal(summary.diagnosisBlocking, true);
    assert.ok(Array.isArray(summary.candidateFiles));
    assert.ok(summary.candidateFiles.includes("src/app/plugin.js"));
    assert.ok(Array.isArray(summary.recommendedActions));
    assert.ok(summary.recommendedActions.includes("检查 bootstrap 生命周期。"));
    assert.equal(summary.serviceObserved, true);
    assert.equal(summary.serviceTotal, 2);
    assert.equal(summary.serviceHealthyCount, 1);
    assert.equal(summary.serviceUnhealthyCount, 1);
    assert.equal(summary.serviceHealthOK, false);
    assert.equal(summary.serviceStatus, "degraded");
    assert.equal(summary.httpObserved, true);
    assert.equal(summary.httpTimeoutCount, 1);
    assert.equal(summary.httpRetryCount, 1);
    assert.equal(summary.httpSlowOperationCount, 1);
    assert.equal(summary.hostReadyDurationMs, 2150);
    assert.equal(summary.startupDurationMs, 3220);
    assert.equal(summary.shutdownDurationMs, 980);
    assert.equal(summary.lifecycleSlowOperationCount, 2);
    assert.equal(summary.lifecycleSlowThresholdMs, 2000);
    assert.equal(summary.lifecycleLastSlowStage, "startup");
    assert.equal(summary.lifecycleBoundaryEvents[0]?.event, "plugin.start.failed");
    assert.equal(summary.lifecycleBoundaryEvents[1]?.event, "plugin.start.cleanup.failed");
    assert.equal(summary.errorBoundaryHitCount, 1);
    assert.equal(summary.errorBoundaryEvents[0]?.event, "plugin.start.failed");
    assert.equal(summary.capabilityObserved, true);
    assert.ok(summary.capabilityScenarioBoundTotal >= 7);
    assert.ok(summary.capabilityCoveredCount >= 3);
    assert.ok(summary.capabilityFailedCount >= 1);
    assert.ok(summary.failedCapabilityIds.includes("multi-window-mount"));
    assert.ok(summary.uncoveredCapabilityIds.includes("reader-summary"));
    assert.equal(summary.readerEventReport.present, true);
    assert.equal(summary.readerEventReport.status, "passed");
    assert.equal(summary.readerEventReport.available, true);
    assert.equal(summary.readerEventReport.registeredCount, 8);
    assert.equal(summary.readerEventReport.knownTypeCount, 8);
    assert.equal(summary.readerEventReport.probeCompatibleTypeCount, 8);
    assert.equal(summary.readerEventReport.probeObservedTypeCount, 8);
    assert.equal(summary.readerEventReport.hostObservedTypeCount, 8);
    assert.equal(summary.readerEventReport.syntheticFallbackAvailable, true);
    assert.ok(summary.readerEventReport.registeredTypes.includes("renderToolbar"));
    assert.ok(summary.readerEventReport.hostObservedTypes.includes("renderToolbar"));
    assert.ok(summary.readerEventReport.probeObservedTypes.includes("renderToolbar"));
    assert.ok(summary.readerEventReport.probeObservedTypes.includes("renderTextSelectionPopup"));
    assert.equal(summary.readerEventReport.toolbarHookObserved, true);
    assert.equal(summary.readerEventReport.toolbarDispatchMode, "customEvent");
    assert.deepEqual(summary.readerEventReport.missingKnownTypes, []);
    assert.deepEqual(summary.readerEventReport.missingProbeCompatibleTypes, []);
    assert.ok(summary.readerEventReport.dispatchModes.includes("synthetic-fallback"));
    assert.ok(summary.readerEventReport.observedScenarioNames.includes("reader fine-grained hook diagnostics"));
    assert.ok(summary.toolbarEvidenceSummary?.includes("Toolbar 宿主点已观测"));
    assert.ok(summary.toolbarEvidenceSummary?.includes("分发 customEvent"));
    assert.equal(summary.visualCaptureStabilityObserved, true);
    assert.equal(summary.visualCaptureStageCount, 2);
    assert.equal(summary.visualCaptureStableStageCount, 1);
    assert.equal(summary.visualCaptureUnstableStageCount, 1);
    assert.equal(summary.visualCaptureAttemptCount, 5);
    assert.equal(summary.visualCaptureAllStagesStable, false);
    assert.ok(summary.visualCaptureStabilitySummary?.includes("library 稳定"));
    assert.ok(summary.visualCaptureStabilitySummary?.includes("reader 待稳"));
    assert.equal(summary.visualPrimaryBlockerKind, "capture-unstable");
    assert.equal(summary.visualPrimaryBlockerKindLabel, "采集未稳定");
    assert.equal(summary.visualGeometryMismatchCount, 2);
    assert.equal(summary.visualAllStagesGeometryMatched, false);
    assert.ok(summary.visualGeometrySummary?.includes("library 几何不一致 2000x1200 / 3388x2172"));
    assert.equal(buildVisualExhaustedStageSummary(summary), "reader（3 次）");
    assert.ok(buildVisualPrimaryBlockerSummary(summary)?.includes("用尽预算 stage：reader（3 次）"));
    assert.equal(summary.visualCaptureStabilityStages[0]?.captureSize, "2000x1200");
    assert.equal(summary.visualCaptureStabilityStages[0]?.baselineSize, "3388x2172");
    assert.equal(summary.visualCaptureStabilityStages[0]?.geometryMatched, false);
    assert.equal(summary.readerHostStateObserved, true);
    assert.equal(summary.readerSidebarView, null);
    assert.equal(summary.readerHostStateSummary.includes("侧边栏视图"), true);
  });

  it("should classify stable geometry mismatch as baseline-geometry-mismatch", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: false,
      issues: ["library 截图与基线尺寸不一致：当前 2000x1200，基线 3388x2172"],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        summary: "Reader 相关视觉基线发生漂移或缺失。",
      },
      cycles: [{
        index: 1,
        passed: false,
        checks: {},
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: { failed: 0 },
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
            ],
            summary: {
              baseline: {
                driftCount: 1,
                missingCount: 0,
              },
            },
          },
        },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
        },
      }],
    });

    assert.equal(summary.visualPrimaryBlockerKind, "baseline-geometry-mismatch");
    assert.equal(summary.visualPrimaryBlockerKindLabel, "基线几何不匹配");
    assert.ok(buildVisualPrimaryBlockerSummary(summary)?.includes("可刷新基线"));
  });

  it("should summarize partial canonical coverage and redirect pure visual next action to obsidian", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-25T00:00:00.000Z",
      passed: false,
      issues: ["reader 截图与基线尺寸不一致：当前 2000x1200，基线 3388x2172"],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        summary: "Reader 相关视觉基线发生漂移或缺失。",
      },
      cycles: [{
        index: 1,
        bootMode: "restart",
        passed: false,
        checks: {},
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
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
        checks: {},
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
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

    assert.equal(summary.visualPrimaryBlockerKind, "baseline-geometry-mismatch");
    assert.equal(summary.visualCanonicalCoverageKind, "partial");
    assert.deepEqual(summary.visualCanonicalExpectedTargets, [
      "restart-library.png",
      "restart-reader.png",
      "hot-reload-library.png",
      "hot-reload-reader.png",
    ]);
    assert.deepEqual(summary.visualCanonicalMismatchedTargets, [
      "hot-reload-library.png",
      "hot-reload-reader.png",
    ]);
    assert.ok(buildVisualCanonicalCoverageSummary(summary)?.includes("hot-reload-library.png"));
    assert.ok(buildPureVisualReaderFailureSummary(summary)?.includes("canonical 基线覆盖部分"));
    assert.equal(pickPureVisualReaderNextAction(summary), "npm run agent:obsidian");
  });

  it("should classify stable matched geometry drift as ui-regression-candidate", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: false,
      issues: ["reader 截图与基线像素漂移过大：12.00% > 5.00%"],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        summary: "Reader 相关视觉基线发生漂移或缺失。",
      },
      cycles: [{
        index: 1,
        passed: false,
        checks: {
          readerEventHookScenarioObserved: true,
          readerEventHookScenarioPassed: true,
          readerEventFineGrainedScenarioObserved: true,
          readerEventFineGrainedScenarioPassed: true,
          readerEventSyntheticFallbackAvailable: true,
        },
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
        },
        visuals: {
          captures: [
            { kind: "reader", analysis: { width: 2000, height: 1200 } },
          ],
          captureStability: {
            stages: [
              { kind: "reader", stable: true, attemptCount: 2, selectionReason: "stable-hash-pair" },
            ],
          },
          analysis: {
            baselines: [
              {
                kind: "reader",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: true,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 2000,
                  baselineHeight: 1200,
                  changedRatio: 0.12,
                  meanChannelDiff: 8,
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

    assert.equal(summary.visualPrimaryBlockerKind, "ui-regression-candidate");
    assert.equal(summary.visualAllStagesGeometryMatched, true);
    assert.ok(buildVisualPrimaryBlockerSummary(summary)?.includes("暂不刷新基线"));
  });

  it("should preserve low-drift fallback stability metrics while classifying ui regression candidates", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-26T00:00:00.000Z",
      passed: false,
      issues: ["reader 截图与基线像素漂移过大：12.00% > 5.00%"],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        summary: "Reader 相关视觉基线发生漂移或缺失。",
      },
      cycles: [{
        index: 1,
        passed: false,
        checks: {},
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
        },
        visuals: {
          captures: [
            { kind: "library", analysis: { width: 2000, height: 1200 } },
            { kind: "reader", analysis: { width: 2000, height: 1200 } },
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
                status: "compared",
                ok: true,
                metrics: {
                  sameDimensions: true,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 2000,
                  baselineHeight: 1200,
                  changedRatio: 0,
                  meanChannelDiff: 0,
                },
              },
              {
                kind: "reader",
                bootMode: "hot-reload",
                canonicalTarget: "hot-reload-reader.png",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: true,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 2000,
                  baselineHeight: 1200,
                  changedRatio: 0.12,
                  meanChannelDiff: 8,
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

    assert.equal(summary.visualPrimaryBlockerKind, "ui-regression-candidate");
    assert.ok(summary.visualCaptureStabilitySummary?.includes("reader 稳定（3 次，低漂移收敛）"));
    assert.equal(summary.visualCaptureStabilityStages[1]?.selectionReason, "stable-low-drift-pair");
    assert.equal(summary.visualCaptureStabilityStages[1]?.stabilityMetrics?.sameDimensions, true);
    assert.equal(summary.visualCaptureStabilityStages[1]?.stabilityMetrics?.changedRatio, 0.008);
    assert.equal(summary.visualCaptureStabilityStages[1]?.stabilityMetrics?.thresholdChangedRatio, 0.0125);
    assert.equal(pickPureVisualReaderNextAction(summary), "npm run agent:obsidian");
  });

  it("should explain exhausted stages and rerun guardrails for capture-unstable summaries", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-25T00:00:00.000Z",
      passed: false,
      issues: ["reader 截图与基线像素漂移过大：8.32% > 5.00%"],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        summary: "Reader 相关视觉基线发生漂移或缺失。",
      },
      cycles: [{
        index: 1,
        passed: false,
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
        },
        visuals: {
          captures: [
            { kind: "library", analysis: { width: 2000, height: 1200 } },
            { kind: "reader", analysis: { width: 2000, height: 1200 } },
          ],
          captureStability: {
            stages: [
              { kind: "library", stable: false, attemptCount: 3, selectionReason: "max-attempt-reached" },
              { kind: "reader", stable: false, attemptCount: 3, selectionReason: "max-attempt-reached" },
            ],
          },
          analysis: {
            baselines: [
              {
                kind: "library",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: true,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 2000,
                  baselineHeight: 1200,
                  changedRatio: 0.0832,
                  meanChannelDiff: 6.27,
                },
              },
              {
                kind: "reader",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: true,
                  actualWidth: 2000,
                  actualHeight: 1200,
                  baselineWidth: 2000,
                  baselineHeight: 1200,
                  changedRatio: 0.091,
                  meanChannelDiff: 7.11,
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

    const blockerSummary = buildPureVisualReaderFailureSummary(summary) || "";
    assert.equal(summary.visualPrimaryBlockerKind, "capture-unstable");
    assert.ok(blockerSummary.includes("用尽预算 stage：library（3 次）；reader（3 次）"));
    assert.ok(blockerSummary.includes("先重跑 E2E"));
    assert.ok(blockerSummary.includes("obsidian-first"));
    assert.equal(pickPureVisualReaderNextAction(summary), "npm run agent:zotero:e2e");
  });

  it("should keep capture-unstable when only library stays max-attempt-reached and reader already low-drift converged", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-26T00:00:00.000Z",
      passed: false,
      issues: ["library 截图与基线像素漂移过大：11.00% > 5.00%"],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        summary: "Reader 相关视觉基线发生漂移或缺失。",
      },
      cycles: [{
        index: 1,
        bootMode: "hot-reload",
        passed: false,
        checks: {},
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
        },
        visuals: {
          captures: [
            { kind: "library", path: "/tmp/cycle-1-library.png", analysis: { width: 2000, height: 1200 } },
            { kind: "reader", path: "/tmp/cycle-1-reader.png", analysis: { width: 2000, height: 1200 } },
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

    assert.equal(summary.visualPrimaryBlockerKind, "capture-unstable");
    assert.equal(summary.visualCanonicalCoverageKind, "complete");
    assert.equal(summary.visualCaptureStableStageCount, 1);
    assert.equal(summary.visualCaptureUnstableStageCount, 1);
    assert.equal(summary.visualCaptureStabilityStages[0]?.selectionReason, "max-attempt-reached");
    assert.equal(summary.visualCaptureStabilityStages[1]?.selectionReason, "stable-low-drift-pair");
    assert.equal(buildVisualExhaustedStageSummary(summary), "library（3 次）");
    assert.ok(buildVisualPrimaryBlockerSummary(summary)?.includes("用尽预算 stage：library（3 次）"));
    assert.equal(buildVisualPrimaryBlockerSummary(summary)?.includes("reader（3 次）"), false);
  });

  it("should detect pure visual reader failure from summarized e2e report", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: false,
      issues: ["library 截图与基线尺寸不一致：当前 2000x1200，基线 3388x2172"],
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        summary: "Reader 相关视觉基线发生漂移或缺失。",
      },
      cycles: [{
        index: 1,
        passed: false,
        checks: {
          readerEventHookScenarioObserved: true,
          readerEventHookScenarioPassed: true,
          readerEventFineGrainedScenarioObserved: true,
          readerEventFineGrainedScenarioPassed: true,
          readerEventSyntheticFallbackAvailable: true,
        },
        logs: { errorCount: 0, warnCount: 0 },
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "reader event hook diagnostics", status: "passed" },
            { name: "reader fine-grained hook diagnostics", status: "passed" },
          ],
        },
        visuals: {
          captureStability: {
            stages: [
              { kind: "library", stable: false, attemptCount: 3, selectionReason: "max-attempt-reached" },
            ],
          },
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

    assert.equal(isPureVisualReaderFailure(summary), true);
  });

  it("should fallback runtime context to unknown when report misses version and boot mode", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-19T00:00:00.000Z",
      passed: true,
      cycles: [],
    });

    assert.equal(summary.zoteroVersion, "unknown");
    assert.equal(summary.zoteroVersionBucket, "unknown");
    assert.equal(summary.latestBootMode, "unknown");
    assert.deepEqual(summary.bootModes, ["unknown"]);
  });

  it("should summarize autofix patch plan metadata", () => {
    const summary = summarizeAutofixReport({
      generatedAt: "2026-03-19T00:00:00.000Z",
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      runtimeContext: {
        zoteroVersion: "8.0.1",
        latestBootMode: "hot-reload",
        bootModes: ["restart", "hot-reload"],
      },
      attempts: [],
      patchPlan: {
        status: "review-ready",
        statusLabel: "可进入受限补丁审阅",
        mode: "review-only",
        featureLabel: "ItemPane 注册",
        allowedTargets: [
          "src/features/item-pane.js",
          "src/app/feature-composer.js",
        ],
        verificationContract: {
          summary: "补丁后必须确认 ItemPane Section 注册计数恢复。",
          checks: [
            {
              id: "item-pane-section-count",
              label: "ItemPane Section 注册计数",
            },
          ],
        },
        patchDrafts: [
          { file: "src/app/feature-composer.js", operation: "replace" },
        ],
      },
      patchApplication: {
        attempted: true,
        status: "applied",
        appliedFiles: [
          "src/app/feature-composer.js",
        ],
      },
      patchArchive: {
        present: true,
        runId: "20260321T010203000Z",
        entryJSON: "dist/agent-zotero-autofix-history/20260321T010203000Z.json",
        patch: {
          featureLabel: "ItemPane 注册",
          draftOperations: [
            {
              operation: "create",
              count: 1,
              files: ["src/app/feature-composer.js"],
              fileCount: 1,
            },
          ],
          resultReasonSummary: [
            {
              reason: "applied",
              count: 1,
              files: ["src/app/feature-composer.js"],
              fileCount: 1,
            },
          ],
        },
        verificationContract: {
          status: "verification-passed",
          statusLabel: "补丁复验通过",
          summary: "补丁后必须确认 ItemPane Section 注册计数恢复。",
          requiredTotal: 2,
          requiredPassed: 2,
          requiredFailed: 0,
          optionalTotal: 1,
          optionalPassed: 0,
          optionalFailed: 1,
          failedCheckIds: [],
          optionalFailedCheckIds: ["visual-drift-count"],
          failedCheckKinds: [],
          optionalFailedCheckKinds: [
            {
              kind: "report-field",
              count: 1,
            },
          ],
          checks: [
            {
              id: "restart-e2e",
              label: "重启策略 E2E 复验",
              kind: "all-cycle-check",
              satisfied: true,
              required: true,
            },
            {
              id: "item-pane-section-count",
              label: "ItemPane Section 注册计数",
              kind: "latest-cycle-check",
              satisfied: true,
              required: true,
            },
            {
              id: "visual-drift-count",
              label: "视觉漂移数量",
              kind: "report-field",
              satisfied: false,
              required: false,
            },
          ],
        },
      },
    }, {
      now: "2026-03-19T00:30:00.000Z",
    });

    assert.equal(summary.patchPlanStatus, "review-ready");
    assert.equal(summary.zoteroVersion, "8.0.1");
    assert.equal(summary.zoteroVersionBucket, "8.0-stable");
    assert.equal(summary.latestBootMode, "hot-reload");
    assert.deepEqual(summary.bootModes, ["restart", "hot-reload"]);
    assert.equal(summary.patchPlanStatusLabel, "可进入受限补丁审阅");
    assert.equal(summary.patchPlanMode, "review-only");
    assert.equal(summary.patchPlanFeature, "ItemPane 注册");
    assert.equal(summary.patchDraftCount, 1);
    assert.equal(summary.patchDraftOperations.length, 1);
    assert.equal(summary.patchDraftOperations[0].operation, "replace");
    assert.equal(summary.patchDraftOperations[0].label, "替换内容");
    assert.ok(summary.patchPlanTargets.includes("src/app/feature-composer.js"));
    assert.equal(summary.patchApplicationStatus, "applied");
    assert.equal(summary.patchApplicationStatusLabel, "已应用");
    assert.ok(summary.patchApplicationAppliedFiles.includes("src/app/feature-composer.js"));
    assert.equal(summary.patchApplicationIssues.length, 0);
    assert.equal(summary.patchArchivePresent, true);
    assert.equal(summary.patchArchiveRunId, "20260321T010203000Z");
    assert.equal(summary.patchArchiveEntryPath, "dist/agent-zotero-autofix-history/20260321T010203000Z.json");
    assert.equal(summary.patchArchiveFeature, "ItemPane 注册");
    assert.equal(summary.patchArchiveDraftOperations[0].label, "创建文件");
    assert.equal(summary.patchArchiveReasonSummary[0].label, "已应用");
    assert.equal(summary.patchVerificationStatus, "verification-passed");
    assert.equal(summary.patchVerificationStatusLabel, "补丁复验通过");
    assert.equal(summary.patchVerificationSummary, "补丁后必须确认 ItemPane Section 注册计数恢复。");
    assert.equal(summary.patchVerificationChecksTotal, 3);
    assert.equal(summary.patchVerificationChecksFailed, 0);
    assert.equal(summary.patchVerificationChecksOptionalFailed, 1);
    assert.equal(summary.patchVerificationRequiredTotal, 2);
    assert.equal(summary.patchVerificationRequiredPassed, 2);
    assert.equal(summary.patchVerificationRequiredFailed, 0);
    assert.equal(summary.patchVerificationOptionalTotal, 1);
    assert.equal(summary.patchVerificationOptionalPassed, 0);
    assert.equal(summary.patchVerificationOptionalFailed, 1);
    assert.deepEqual(summary.patchVerificationFailedCheckIds, []);
    assert.deepEqual(summary.patchVerificationOptionalFailedCheckIds, ["visual-drift-count"]);
    assert.equal(summary.patchVerificationOptionalFailedCheckKinds[0]?.kind, "report-field");
    assert.equal(summary.patchVerificationOptionalFailedCheckKinds[0]?.label, "聚合报告字段");
    assert.equal(summary.patchVerificationOptionalFailedChecks[0]?.id, "visual-drift-count");
  });

  it("should surface unsupported diagnosis blocker metadata from patch plan", () => {
    const summary = summarizeAutofixReport({
      generatedAt: "2026-03-19T00:00:00.000Z",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      patchPlan: {
        status: "no-whitelist-match",
        statusLabel: "未命中白名单",
        mode: "none",
        fingerprint: "menu-action:primary-action-failed",
        featureLabel: "主动作执行",
        unsupportedDiagnosisCategory: "behavioral-regression",
        unsupportedDiagnosisCategoryLabel: "行为回归",
        unsupportedDiagnosisReason: "当前故障表现为动作执行结果异常，仍需要先继续下钻成声明式入口或更小范围的结构化诊断。",
      },
    });

    assert.equal(summary.patchUnsupportedDiagnosisCategory, "behavioral-regression");
    assert.equal(summary.patchUnsupportedDiagnosisCategoryLabel, "行为回归");
    assert.ok(String(summary.patchUnsupportedDiagnosisReason).includes("动作执行结果异常"));
  });

  it("should surface all fixed unsupported blocker categories with correct labels", () => {
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
      const summary = summarizeAutofixReport({
        generatedAt: "2026-03-19T00:00:00.000Z",
        recovered: false,
        outcomeLabel: "未恢复",
        attempts: [],
        patchPlan: {
          status: "no-whitelist-match",
          statusLabel: "未命中白名单",
          mode: "none",
          fingerprint: testCase.fingerprint,
          featureLabel: "测试功能",
          unsupportedDiagnosisCategory: testCase.category,
          unsupportedDiagnosisCategoryLabel: testCase.label,
          unsupportedDiagnosisReason: `诊断 ${testCase.fingerprint} 不在白名单内`,
        },
      });

      assert.equal(
        summary.patchUnsupportedDiagnosisCategory,
        testCase.category,
        `Expected category ${testCase.category} for fingerprint ${testCase.fingerprint}`,
      );
      assert.equal(
        summary.patchUnsupportedDiagnosisCategoryLabel,
        testCase.label,
        `Expected label ${testCase.label} for fingerprint ${testCase.fingerprint}`,
      );
      assert.ok(
        String(summary.patchUnsupportedDiagnosisReason).includes(testCase.fingerprint),
        `Expected reason to include fingerprint ${testCase.fingerprint}`,
      );
    }
  });

  it("should fallback to v2 verification checks and keep stable ordering", () => {
    const summary = summarizeAutofixReport({
      generatedAt: "2026-03-19T00:00:00.000Z",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      patchArchive: {
        present: true,
        verificationContract: {
          status: "verification-failed",
          statusLabel: "补丁复验失败",
          summary: "补丁后还有多个检查未通过。",
          checks: [
            {
              id: "visual-drift-count",
              label: "视觉漂移数量",
              kind: "report-field",
              required: false,
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
              id: "restart-e2e",
              label: "重启策略 E2E 复验",
              kind: "all-cycle-check",
              required: true,
              satisfied: false,
            },
            {
              id: "cycle-failed-count",
              label: "失败轮次数",
              kind: "report-field",
              required: true,
              satisfied: false,
            },
          ],
        },
      },
    }, {
      now: "2026-03-19T00:30:00.000Z",
    });

    assert.equal(summary.patchVerificationRequiredTotal, 3);
    assert.equal(summary.patchVerificationRequiredFailed, 3);
    assert.equal(summary.patchVerificationOptionalTotal, 1);
    assert.equal(summary.patchVerificationOptionalFailed, 1);
    assert.deepEqual(summary.patchVerificationFailedCheckIds, [
      "restart-e2e",
      "item-pane-section-count",
      "cycle-failed-count",
    ]);
    assert.deepEqual(summary.patchVerificationOptionalFailedCheckIds, [
      "visual-drift-count",
    ]);
    assert.deepEqual(
      summary.patchVerificationFailedChecks.map((item) => item.id),
      ["restart-e2e", "item-pane-section-count", "cycle-failed-count"],
    );
    assert.deepEqual(
      summary.patchVerificationFailedCheckKinds.map((item) => item.kind),
      ["all-cycle-check", "latest-cycle-check", "report-field"],
    );
    assert.equal(summary.patchVerificationFailedCheckKinds[0]?.label, "跨轮次检查");
    assert.equal(summary.patchVerificationFailedCheckKinds[1]?.label, "最新轮次检查");
    assert.equal(summary.patchVerificationFailedCheckKinds[2]?.label, "聚合报告字段");
    assert.deepEqual(
      summary.patchVerificationOptionalFailedCheckKinds.map((item) => item.kind),
      ["report-field"],
    );
  });

  it("should summarize autofix patch precheck issues", () => {
    const summary = summarizeAutofixReport({
      generatedAt: "2026-03-19T00:00:00.000Z",
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      patchApplication: {
        attempted: true,
        ok: false,
        status: "precheck-failed",
        appliedFiles: [],
        results: [
          {
            file: "src/app/plugin.js",
            reason: "anchor-not-found",
          },
          {
            file: "src/features/item-pane.js",
            reason: "anchor-not-unique",
          },
          {
            file: "src/features/item-pane.js",
            reason: "before-context-mismatch",
          },
        ],
      },
    }, {
      now: "2026-03-19T00:30:00.000Z",
    });

    assert.equal(summary.patchApplicationStatus, "precheck-failed");
    assert.equal(summary.patchApplicationStatusLabel, "预检失败");
    assert.equal(summary.patchApplicationIssues.length, 3);
    assert.equal(summary.patchApplicationIssues[0].reason, "anchor-not-found");
    assert.equal(summary.patchApplicationIssues[0].label, "锚点不存在");
    assert.equal(summary.patchApplicationIssues[1].reason, "anchor-not-unique");
    assert.equal(summary.patchApplicationIssues[1].label, "锚点不唯一");
    assert.equal(summary.patchApplicationIssues[2].reason, "before-context-mismatch");
    assert.equal(summary.patchApplicationIssues[2].label, "锚点前文不匹配");
  });

  it("should summarize new patch blocker reasons with affected files", () => {
    const summary = summarizeAutofixReport({
      generatedAt: "2026-03-19T00:00:00.000Z",
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      patchApplication: {
        attempted: true,
        ok: false,
        status: "precheck-failed",
        appliedFiles: [],
        results: [
          {
            file: "addon-static/locale/zh-CN/main.ftl",
            reason: "target-file-missing",
          },
          {
            file: "addon-static/locale/en-US/main.ftl",
            reason: "target-file-exists",
          },
        ],
      },
    }, {
      now: "2026-03-19T00:30:00.000Z",
    });

    assert.equal(summary.patchApplicationIssues.length, 2);
    assert.equal(summary.patchApplicationIssues[0].reason, "target-file-exists");
    assert.equal(summary.patchApplicationIssues[0].label, "目标文件已存在");
    assert.ok(summary.patchApplicationIssues[0].files.includes("addon-static/locale/en-US/main.ftl"));
    assert.equal(summary.patchApplicationIssues[1].reason, "target-file-missing");
    assert.equal(summary.patchApplicationIssues[1].label, "目标文件缺失");
    assert.ok(summary.patchApplicationIssues[1].files.includes("addon-static/locale/zh-CN/main.ftl"));
  });

  it("should summarize patch sandbox blocker reasons", () => {
    const summary = summarizeAutofixReport({
      generatedAt: "2026-03-19T00:00:00.000Z",
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      patchApplication: {
        attempted: true,
        ok: false,
        status: "precheck-failed",
        appliedFiles: [],
        results: [
          {
            file: "README.md",
            reason: "target-outside-whitelist",
          },
          {
            file: "addon-static/locale/zh-CN/main.ftl",
            reason: "draft-mismatch",
          },
        ],
      },
    }, {
      now: "2026-03-19T00:30:00.000Z",
    });

    assert.equal(summary.patchApplicationIssues.length, 2);
    assert.equal(summary.patchApplicationIssues[0].reason, "draft-mismatch");
    assert.equal(summary.patchApplicationIssues[0].label, "补丁草案内容与白名单不一致");
    assert.equal(summary.patchApplicationIssues[1].reason, "target-outside-whitelist");
    assert.equal(summary.patchApplicationIssues[1].label, "目标文件超出白名单范围");
  });

  it("should summarize visual target mismatch as a patch sandbox blocker reason", () => {
    const summary = summarizeAutofixReport({
      generatedAt: "2026-03-19T00:00:00.000Z",
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      patchApplication: {
        attempted: true,
        ok: false,
        status: "precheck-failed",
        appliedFiles: [],
        results: [
          {
            file: "tests/visual-baselines/agent-zotero-e2e/hot-reload-library.png",
            reason: "visual-target-mismatch",
          },
        ],
      },
    }, {
      now: "2026-03-19T00:30:00.000Z",
    });

    assert.equal(summary.patchApplicationIssues.length, 1);
    assert.equal(summary.patchApplicationIssues[0].reason, "visual-target-mismatch");
    assert.equal(summary.patchApplicationIssues[0].label, "视觉补丁目标与来源类型不匹配");
  });

  it("should summarize visual draft set mismatch as a patch sandbox blocker reason", () => {
    const summary = summarizeAutofixReport({
      generatedAt: "2026-03-19T00:00:00.000Z",
      initialStrategy: "hot",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      patchApplication: {
        attempted: true,
        ok: false,
        status: "precheck-failed",
        appliedFiles: [],
        results: [
          {
            file: null,
            reason: "visual-draft-set-mismatch",
          },
        ],
      },
    }, {
      now: "2026-03-19T00:30:00.000Z",
    });

    assert.equal(summary.patchApplicationIssues.length, 1);
    assert.equal(summary.patchApplicationIssues[0].reason, "visual-draft-set-mismatch");
    assert.equal(summary.patchApplicationIssues[0].label, "视觉补丁草案集合与最新 E2E 漂移证据不一致");
  });

  it("should summarize watch recovery regression report", () => {
    const summary = summarizeWatchRecoveryReport({
      generatedAt: "2026-03-20T08:28:09.186Z",
      passed: true,
      startupPassed: true,
      latestTrigger: "session-restart-recovery",
      latestPassed: true,
      latestStatus: "healthy",
      latestAt: "2026-03-20T08:28:08.565Z",
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
      summaryNote: "恢复链已闭环",
      issues: [],
      entries: [
        {
          trigger: "watch-change",
          passed: false,
          at: "2026-03-20T08:28:07.323Z",
          summaryNote: "构建失败",
        },
        {
          trigger: "session-restart-recovery",
          passed: true,
          at: "2026-03-20T08:28:08.565Z",
          summaryNote: "重启恢复成功",
        },
      ],
    }, {
      now: "2026-03-20T09:00:00.000Z",
    });

    assert.equal(summary.present, true);
    assert.equal(summary.status, "passed");
    assert.equal(summary.statusLabel, "通过");
    assert.equal(summary.latestTrigger, "session-restart-recovery");
    assert.equal(summary.latestPassed, true);
    assert.equal(summary.startupPassed, true);
    assert.equal(summary.entries.length, 2);
    assert.equal(summary.observedTriggers[0], "watch-change");
  });

  it("should summarize E2E report with static runtime icon resource drift", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: false,
      strategy: "hot",
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
    }, {
      now: "2026-03-24T00:30:00.000Z",
    });

    assert.equal(summary.status, "failed");
    assert.equal(summary.staticRuntimeMissingCount, 0);
    assert.equal(summary.staticRuntimeDriftCount, 1);
  });

  it("should summarize E2E report with static runtime icon resource missing", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: false,
      strategy: "hot",
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
    }, {
      now: "2026-03-24T00:30:00.000Z",
    });

    assert.equal(summary.status, "failed");
    assert.equal(summary.staticRuntimeMissingCount, 1);
    assert.equal(summary.staticRuntimeDriftCount, 0);
  });

  it("should summarize autofix patch plan for icon resource drift", () => {
    const summary = summarizeAutofixReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      patchPlan: {
        status: "review-ready",
        statusLabel: "可进入受限补丁审阅",
        mode: "review-only",
        fingerprint: "assets:icon-resource-drift",
        featureLabel: "静态资源与图标",
        allowedTargets: [
          "addon-static/content/icons/icon-96.png",
        ],
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
            },
          ],
        },
      },
      patchArchive: {
        present: true,
        runId: "20260324T000000000Z",
        verificationContract: {
          status: "verification-failed",
          statusLabel: "补丁复验失败",
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
    }, {
      now: "2026-03-24T00:30:00.000Z",
    });

    assert.equal(summary.patchPlanStatus, "review-ready");
    assert.equal(summary.patchPlanStatusLabel, "可进入受限补丁审阅");
    assert.equal(summary.patchPlanFeature, "静态资源与图标");
    assert.equal(summary.patchDraftCount, 1);
    assert.equal(summary.patchDraftOperations[0].operation, "copy");
    assert.equal(summary.patchDraftOperations[0].label, "刷新基线");
    assert.ok(summary.patchPlanTargets.includes("addon-static/content/icons/icon-96.png"));
    assert.equal(summary.patchVerificationStatus, "verification-failed");
    assert.equal(summary.patchVerificationSummary, "补丁后必须确认 icon 资源基线恢复。");
    assert.equal(summary.patchVerificationChecksTotal, 1);
    assert.equal(summary.patchVerificationRequiredTotal, 1);
    assert.equal(summary.patchVerificationRequiredFailed, 1);
  });

  it("should expose reader interaction diagnostics deeper event point fields", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: true,
      strategy: "hot",
      cycles: [{
        index: 1,
        passed: true,
        checks: {},
        scenarios: {
          results: [
            {
              name: "reader fine-grained hook diagnostics",
              status: "passed",
              details: {
                selectionProbe: {
                  type: "renderTextSelectionPopup",
                  dispatchMode: "synthetic-fallback",
                  appendedItemCount: 1,
                },
                sidebarHeaderProbe: {
                  type: "renderSidebarAnnotationHeader",
                  dispatchMode: "synthetic-fallback",
                  appendedItemCount: 1,
                },
                menuProbes: [
                  { type: "createViewContextMenu", dispatchMode: "synthetic-fallback" },
                  { type: "createAnnotationContextMenu", dispatchMode: "synthetic-fallback" },
                  { type: "createColorContextMenu", dispatchMode: "synthetic-fallback" },
                  { type: "createThumbnailContextMenu", dispatchMode: "synthetic-fallback" },
                  { type: "createSelectorContextMenu", dispatchMode: "synthetic-fallback" },
                ],
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
                sidebarHeaderDispatchMode: "synthetic-fallback",
                sidebarHeaderAppendedItemCount: 1,
                contextMenuProbeCount: 5,
                contextMenuObservedTypes: [
                  "createViewContextMenu",
                  "createAnnotationContextMenu",
                  "createColorContextMenu",
                  "createThumbnailContextMenu",
                  "createSelectorContextMenu",
                ],
                contextMenuSyntheticFallbackTypes: [
                  "createViewContextMenu",
                  "createAnnotationContextMenu",
                  "createColorContextMenu",
                  "createThumbnailContextMenu",
                  "createSelectorContextMenu",
                ],
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
    }, {
      now: "2026-03-24T00:30:00.000Z",
    });

    assert.equal(summary.status, "passed");
    assert.equal(summary.readerHostStateObserved, true);
    assert.equal(summary.readerSidebarView, "annotations");
    assert.equal(summary.selectionPopupDispatchMode, "synthetic-fallback");
    assert.equal(summary.selectionPopupAppendedItemCount, 1);
    assert.equal(summary.sidebarHeaderDispatchMode, "synthetic-fallback");
    assert.equal(summary.sidebarHeaderAppendedItemCount, 1);
    assert.equal(summary.contextMenuProbeCount, 5);
    assert.equal(summary.contextMenuObservedTypes.length, 5);
    assert.ok(summary.contextMenuObservedTypes.includes("createViewContextMenu"));
    assert.equal(summary.contextMenuSyntheticFallbackTypes.length, 5);
    assert.ok(summary.contextMenuSyntheticFallbackTypes.includes("createViewContextMenu"));
    assert.ok(summary.readerDispatchSummary.includes("文本浮层"));
    assert.ok(summary.readerDispatchSummary.includes("侧栏批注头"));
    assert.ok(summary.contextMenuSummary.includes("已观测 5 类"));
    assert.ok(summary.contextMenuSummary.includes("synthetic-fallback 5 类"));
  });

  it("should handle reader interaction diagnostics deeper event point fields with null fallbacks", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: true,
      strategy: "hot",
      cycles: [{
        index: 1,
        passed: true,
        checks: {},
        scenarios: {
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
                contextMenuProbeCount: 5,
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
    }, {
      now: "2026-03-24T00:30:00.000Z",
    });

    assert.equal(summary.status, "passed");
    assert.equal(summary.selectionPopupDispatchMode, null);
    assert.equal(summary.selectionPopupAppendedItemCount, null);
    assert.equal(summary.sidebarHeaderDispatchMode, null);
    assert.equal(summary.sidebarHeaderAppendedItemCount, null);
    assert.equal(summary.contextMenuProbeCount, 5);
    assert.deepEqual(summary.contextMenuObservedTypes, []);
    assert.deepEqual(summary.contextMenuSyntheticFallbackTypes, []);
    assert.equal(summary.readerDispatchSummary, null);
    assert.equal(summary.contextMenuSummary, null);
  });

  it("should handle deeper event point fields with partial data and mixed nulls", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: true,
      strategy: "hot",
      cycles: [{
        index: 1,
        passed: true,
        checks: {},
        scenarios: {
          results: [
            {
              name: "reader interaction diagnostics",
              status: "passed",
              details: {
                interaction: {
                  sidebarView: "annotations",
                  contextPaneOpen: true,
                },
                selectionPopupDispatchMode: "customEvent",
                selectionPopupAppendedItemCount: null,
                sidebarHeaderDispatchMode: null,
                sidebarHeaderAppendedItemCount: 2,
                contextMenuProbeCount: null,
                contextMenuObservedTypes: ["createViewContextMenu"],
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
    }, {
      now: "2026-03-24T00:30:00.000Z",
    });

    assert.equal(summary.status, "passed");
    assert.equal(summary.selectionPopupDispatchMode, "customEvent");
    assert.equal(summary.selectionPopupAppendedItemCount, null);
    assert.equal(summary.sidebarHeaderDispatchMode, null);
    assert.equal(summary.sidebarHeaderAppendedItemCount, 2);
    assert.equal(summary.contextMenuProbeCount, null);
    assert.deepEqual(summary.contextMenuObservedTypes, ["createViewContextMenu"]);
    assert.deepEqual(summary.contextMenuSyntheticFallbackTypes, []);
    assert.ok(summary.readerDispatchSummary.includes("文本浮层 customEvent"));
    assert.ok(summary.readerDispatchSummary.includes("侧栏批注头 -"));
    assert.ok(summary.contextMenuSummary.includes("已观测 1 类"));
    assert.ok(summary.contextMenuSummary.includes("synthetic-fallback 0 类"));
  });

  it("should handle missing reader interaction scenario gracefully", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: true,
      strategy: "hot",
      cycles: [{
        index: 1,
        passed: true,
        checks: {},
        scenarios: {
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
    }, {
      now: "2026-03-24T00:30:00.000Z",
    });

    assert.equal(summary.status, "passed");
    assert.equal(summary.readerHostStateObserved, false);
    assert.equal(summary.selectionPopupDispatchMode, null);
    assert.equal(summary.selectionPopupAppendedItemCount, null);
    assert.equal(summary.sidebarHeaderDispatchMode, null);
    assert.equal(summary.sidebarHeaderAppendedItemCount, null);
    assert.equal(summary.contextMenuProbeCount, null);
    assert.deepEqual(summary.contextMenuObservedTypes, []);
    assert.deepEqual(summary.contextMenuSyntheticFallbackTypes, []);
    assert.equal(summary.readerDispatchSummary, null);
    assert.equal(summary.contextMenuSummary, null);
  });

  it("should align toolbar and visual evidence when host hook passed but fine-grained probe is still missing", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: false,
      strategy: "hot",
      cycles: [{
        index: 1,
        passed: false,
        checks: {
          readerEventAPIAvailable: true,
          readerEventKnownTypeCount: 8,
          readerEventProbeTypeCount: 8,
          readerEventSyntheticFallbackAvailable: true,
          readerEventToolbarHookObserved: false,
        },
        scenarios: {
          failed: 1,
          results: [
            {
              name: "reader event hook diagnostics",
              status: "passed",
              details: {
                firstInvocation: {
                  type: "renderToolbar",
                  itemID: 24,
                  hasDoc: true,
                  hasAppend: true,
                  appended: true,
                  appendError: null,
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
              status: "failed",
            },
          ],
        },
        visuals: {
          analysis: {
            summary: {
              baseline: {
                driftCount: 2,
                missingCount: 0,
              },
            },
            baselines: [
              {
                kind: "library",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: false,
                  actualWidth: 3388,
                  actualHeight: 2172,
                  baselineWidth: 2000,
                  baselineHeight: 1200,
                },
              },
              {
                kind: "reader",
                status: "compared",
                ok: false,
                metrics: {
                  sameDimensions: false,
                  actualWidth: 3388,
                  actualHeight: 2172,
                  baselineWidth: 2000,
                  baselineHeight: 1200,
                },
              },
            ],
          },
        },
      }],
    }, {
      now: "2026-03-24T00:30:00.000Z",
    });

    assert.equal(summary.readerEventReport.status, "failed");
    assert.equal(summary.readerEventReport.toolbarHookObserved, true);
    assert.equal(summary.readerEventReport.toolbarDispatchMode, null);
    assert.ok(summary.toolbarEvidenceSummary?.includes("Toolbar 宿主点已观测"));
    assert.ok(summary.toolbarEvidenceSummary?.includes("Hook 通过"));
    assert.ok(summary.toolbarEvidenceSummary?.includes("细粒度 异常"));
    assert.ok(summary.toolbarEvidenceSummary?.includes("分发待补证"));
    assert.ok(summary.visualEvidenceSummary?.includes("library 尺寸漂移 3388x2172 / 2000x1200"));
    assert.ok(summary.visualEvidenceSummary?.includes("reader 尺寸漂移 3388x2172 / 2000x1200"));
  });

  it("should build structured visual evidence items only for failing targets across cycles", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-25T00:00:00.000Z",
      passed: false,
      strategy: "hot",
      primaryDiagnosis: {
        fingerprint: "reader-ui:reader-visual-drift",
        feature: "reader-ui",
        featureLabel: "Reader 与视觉回归",
        severity: "medium",
        confidence: 0.88,
        summary: "Reader 相关视觉基线发生漂移或缺失。",
      },
      cycles: [
        {
          index: 1,
          bootMode: "restart",
          passed: false,
          tests: { failed: 0 },
          scenarios: { failed: 0, results: [] },
          logs: { errorCount: 0, warnCount: 0 },
          visuals: {
            captures: [
              { kind: "library", path: "/tmp/cycle-1-library.png", analysis: { width: 2000, height: 1200 } },
              { kind: "reader", path: "/tmp/cycle-1-reader.png", analysis: { width: 2000, height: 1200 } },
            ],
            captureStability: {
              stages: [
                { kind: "library", stable: true, attemptCount: 2, selectedAttempt: 2, selectionReason: "stable-hash-pair" },
                { kind: "reader", stable: false, attemptCount: 3, selectedAttempt: 3, selectionReason: "max-attempt-reached" },
              ],
            },
            analysis: {
              baselines: [
                {
                  kind: "library",
                  bootMode: "restart",
                  canonicalTarget: "restart-library.png",
                  path: "/tmp/restart-library.png",
                  status: "compared",
                  ok: true,
                  metrics: {
                    sameDimensions: true,
                    changedRatio: 0,
                    meanChannelDiff: 0,
                  },
                  issues: [],
                },
                {
                  kind: "reader",
                  bootMode: "restart",
                  canonicalTarget: "restart-reader.png",
                  path: "/tmp/restart-reader.png",
                  status: "compared",
                  ok: false,
                  metrics: {
                    sameDimensions: true,
                    changedRatio: 0.9522,
                    meanChannelDiff: 20.95,
                  },
                  issues: ["reader 截图与基线像素漂移过大：95.22% > 5.00%"],
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
        },
        {
          index: 2,
          bootMode: "hot-reload",
          passed: true,
          tests: { failed: 0 },
          scenarios: { failed: 0, results: [] },
          logs: { errorCount: 0, warnCount: 0 },
          visuals: {
            captures: [
              { kind: "library", path: "/tmp/cycle-2-library.png", analysis: { width: 2000, height: 1200 } },
              { kind: "reader", path: "/tmp/cycle-2-reader.png", analysis: { width: 2000, height: 1200 } },
            ],
            captureStability: {
              stages: [
                { kind: "library", stable: true, attemptCount: 2, selectedAttempt: 2, selectionReason: "stable-hash-pair" },
                { kind: "reader", stable: true, attemptCount: 2, selectedAttempt: 2, selectionReason: "stable-hash-pair" },
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
                  ok: true,
                  metrics: {
                    sameDimensions: true,
                    changedRatio: 0,
                    meanChannelDiff: 0,
                  },
                  issues: [],
                },
                {
                  kind: "reader",
                  bootMode: "hot-reload",
                  canonicalTarget: "hot-reload-reader.png",
                  path: "/tmp/hot-reload-reader.png",
                  status: "compared",
                  ok: true,
                  metrics: {
                    sameDimensions: true,
                    changedRatio: 0,
                    meanChannelDiff: 0,
                  },
                  issues: [],
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
        },
      ],
    });

    assert.equal(summary.visualEvidenceObserved, true);
    assert.equal(summary.visualEvidenceItemCount, 4);
    assert.equal(summary.visualEvidenceFailingItemCount, 1);
    assert.equal(summary.visualEvidenceItems.length, 1);
    assert.equal(summary.visualEvidenceItems[0].cycleIndex, 1);
    assert.equal(summary.visualEvidenceItems[0].bootMode, "restart");
    assert.equal(summary.visualEvidenceItems[0].kind, "reader");
    assert.equal(summary.visualEvidenceItems[0].canonicalTarget, "restart-reader.png");
    assert.equal(summary.visualEvidenceItems[0].capturePath, "/tmp/cycle-1-reader.png");
    assert.equal(summary.visualEvidenceItems[0].baselinePath, "/tmp/restart-reader.png");
    assert.equal(summary.visualEvidenceItems[0].captureStable, false);
    assert.equal(summary.visualEvidenceItems[0].selectedAttempt, 3);
    assert.equal(summary.visualEvidenceItems[0].selectionReason, "max-attempt-reached");
    assert.equal(summary.visualEvidenceItems[0].geometryMatched, true);
    assert.equal(summary.visualEvidenceItems[0].changedRatio, 0.9522);
    assert.equal(summary.visualEvidenceItems[0].meanChannelDiff, 20.95);
  });

  it("should safely degrade visual evidence fields without changing the primary diagnosis", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-25T00:00:00.000Z",
      passed: false,
      strategy: "hot",
      primaryDiagnosis: {
        fingerprint: "bootstrap:plugin-not-mounted",
        feature: "bootstrap",
        featureLabel: "启动与挂载",
        severity: "critical",
        confidence: 0.98,
        summary: "插件实例未稳定挂载到 Zotero 运行时。",
      },
      cycles: [{
        index: 1,
        bootMode: "restart",
        passed: false,
        tests: { failed: 0 },
        scenarios: { failed: 0, results: [] },
        logs: { errorCount: 0, warnCount: 0 },
        visuals: {
          captures: [
            { kind: "library", path: "/tmp/cycle-1-library.png" },
          ],
          analysis: {
            baselines: [
              {
                kind: "library",
                status: "error",
                ok: false,
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

    assert.equal(summary.primaryDiagnosis?.fingerprint, "bootstrap:plugin-not-mounted");
    assert.equal(summary.visualEvidenceObserved, true);
    assert.equal(summary.visualEvidenceItemCount, 1);
    assert.equal(summary.visualEvidenceFailingItemCount, 1);
    assert.equal(summary.visualEvidenceItems[0].capturePath, "/tmp/cycle-1-library.png");
    assert.equal(summary.visualEvidenceItems[0].baselinePath, null);
    assert.equal(summary.visualEvidenceItems[0].captureStable, null);
    assert.equal(summary.visualEvidenceItems[0].selectedAttempt, null);
    assert.equal(summary.visualEvidenceItems[0].selectionReason, null);
    assert.equal(summary.visualEvidenceItems[0].geometryMatched, null);
    assert.equal(summary.visualEvidenceItems[0].changedRatio, null);
    assert.equal(summary.visualEvidenceItems[0].meanChannelDiff, null);
  });

  it("should derive capture attempt diagnosis from existing stage attempts without changing blocker semantics", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-26T00:00:00.000Z",
      passed: false,
      strategy: "hot",
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
        tests: { failed: 0 },
        scenarios: { failed: 0, results: [] },
        logs: { errorCount: 0, warnCount: 0 },
        visuals: {
          captures: [
            { kind: "library", path: "/tmp/cycle-1-library.png", analysis: { width: 2000, height: 1200 } },
            { kind: "reader", path: "/tmp/cycle-1-reader.png", analysis: { width: 2000, height: 1200 } },
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
                stable: true,
                attemptCount: 3,
                selectedAttempt: 3,
                selectionReason: "stable-low-drift-pair",
                attempts: [
                  { index: 1, sha256: "reader-1", width: 2000, height: 1200, bounds: { x: 100, y: 80, width: 1000, height: 600 } },
                  { index: 2, sha256: "reader-2", width: 2000, height: 1200, bounds: { x: 100, y: 80, width: 1000, height: 600 } },
                  { index: 3, sha256: "reader-3", width: 2000, height: 1200, bounds: { x: 100, y: 80, width: 1000, height: 600 } },
                ],
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
                driftCount: 2,
                missingCount: 0,
              },
            },
          },
        },
      }],
    });

    assert.equal(summary.visualPrimaryBlockerKind, "capture-unstable");
    assert.equal(summary.visualCaptureAttemptDiagnosisObserved, true);
    assert.equal(summary.visualCaptureAttemptDiagnosisItemCount, 2);
    assert.ok(summary.visualCaptureAttemptDiagnosisSummary?.includes("用尽预算 1 个"));
    assert.ok(summary.visualCaptureAttemptDiagnosisSummary?.includes("低漂移收敛 1 个"));
    assert.equal(summary.visualCaptureAttemptDiagnosisItems[0]?.kind, "library");
    assert.equal(summary.visualCaptureAttemptDiagnosisItems[0]?.allHashesUnique, true);
    assert.equal(summary.visualCaptureAttemptDiagnosisItems[0]?.boundsStable, true);
    assert.equal(summary.visualCaptureAttemptDiagnosisItems[0]?.rasterSizeStable, true);
    assert.deepEqual(summary.visualCaptureAttemptDiagnosisItems[0]?.attemptHashes, ["lib-1", "lib-2", "lib-3"]);
    assert.deepEqual(summary.visualCaptureAttemptDiagnosisItems[0]?.attemptBounds, ["100,80 1000x600", "100,80 1000x600", "100,80 1000x600"]);
    assert.deepEqual(summary.visualCaptureAttemptDiagnosisItems[0]?.attemptRasterSizes, ["2000x1200", "2000x1200", "2000x1200"]);
    assert.equal(summary.visualCaptureAttemptDiagnosisItems[1]?.selectionReason, "stable-low-drift-pair");
    assert.equal(summary.visualCaptureAttemptDiagnosisItems[1]?.stabilityMetrics?.thresholdChangedRatio, 0.0125);
    assert.ok(buildVisualPrimaryBlockerSummary(summary)?.includes("hash 全变"));
  });

  it("should normalize legacy reader-entry alias to canonical fingerprint in validation summary", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: false,
      strategy: "hot",
      primaryDiagnosis: {
        fingerprint: "reader-entry:reader-summary-command-missing",
        feature: "reader-entry",
        featureLabel: "Reader 命令与菜单入口",
        severity: "medium",
        confidence: 0.91,
        summary: "Reader 声明式命令/菜单映射存在缺口。",
        candidateFiles: ["src/app/feature-composer.js"],
      },
      diagnostics: [
        {
          fingerprint: "reader-entry:reader-summary-command-missing",
          feature: "reader-entry",
          featureLabel: "Reader 命令与菜单入口",
          severity: "medium",
          confidence: 0.91,
          summary: "Reader 声明式命令/菜单映射存在缺口。",
          candidateFiles: ["src/app/feature-composer.js"],
        },
      ],
      cycles: [{
        index: 1,
        passed: true,
        checks: {},
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
    }, {
      now: "2026-03-24T00:30:00.000Z",
    });

    assert.equal(summary.status, "failed");
    assert.equal(summary.primaryDiagnosis?.fingerprint, "reader-entry:declarative-reader-mapping-drift");
    assert.equal(summary.diagnoses[0]?.fingerprint, "reader-entry:declarative-reader-mapping-drift");
  });

  it("should normalize legacy reader-event aliases to canonical fingerprint in validation summary", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: false,
      strategy: "hot",
      primaryDiagnosis: {
        fingerprint: "reader-event:listener-registration-mismatch",
        feature: "reader-event",
        featureLabel: "Reader 事件桥",
        severity: "high",
        confidence: 0.93,
        summary: "Reader Toolbar / 官方 listener 桥接存在漂移。",
        candidateFiles: ["src/features/reader.js"],
      },
      diagnostics: [
        {
          fingerprint: "reader-event:synthetic-fallback-mapping-missing",
          feature: "reader-event",
          featureLabel: "Reader 事件桥",
          severity: "medium",
          confidence: 0.95,
          summary: "Reader 细粒度 Hook 声明式类型清单存在漂移。",
          candidateFiles: ["src/features/reader.js"],
        },
        {
          fingerprint: "reader-event:probe-compatible-type-missing",
          feature: "reader-event",
          featureLabel: "Reader 事件桥",
          severity: "medium",
          confidence: 0.95,
          summary: "Reader 细粒度 Hook 声明式类型清单存在漂移。",
          candidateFiles: ["src/features/reader.js"],
        },
      ],
      cycles: [{
        index: 1,
        passed: true,
        checks: {},
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
    }, {
      now: "2026-03-24T00:30:00.000Z",
    });

    assert.equal(summary.status, "failed");
    assert.equal(summary.primaryDiagnosis?.fingerprint, "reader-event:toolbar-bridge-registration-drift");
    assert.equal(summary.diagnoses[0]?.fingerprint, "reader-event:fine-grained-hook-declaration-drift");
    assert.equal(summary.diagnoses[1]?.fingerprint, "reader-event:fine-grained-hook-declaration-drift");
  });

  it("should normalize legacy reader-entry menu alias to canonical fingerprint in validation summary", () => {
    const summary = summarizeE2EReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      passed: false,
      strategy: "hot",
      primaryDiagnosis: {
        fingerprint: "reader-entry:reader-summary-menu-missing",
        feature: "reader-entry",
        featureLabel: "Reader 命令与菜单入口",
        severity: "medium",
        confidence: 0.91,
        summary: "Reader 声明式命令/菜单映射存在缺口。",
        candidateFiles: ["src/app/feature-composer.js"],
      },
      cycles: [{
        index: 1,
        passed: true,
        checks: {},
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
    }, {
      now: "2026-03-24T00:30:00.000Z",
    });

    assert.equal(summary.status, "failed");
    assert.equal(summary.primaryDiagnosis?.fingerprint, "reader-entry:declarative-reader-mapping-drift");
  });

  it("should verify normalizeDiagnosisFingerprint maps all legacy aliases correctly", () => {
    assert.equal(
      normalizeDiagnosisFingerprint("reader-entry:reader-summary-command-missing"),
      "reader-entry:declarative-reader-mapping-drift",
    );
    assert.equal(
      normalizeDiagnosisFingerprint("reader-entry:reader-summary-menu-missing"),
      "reader-entry:declarative-reader-mapping-drift",
    );
    assert.equal(
      normalizeDiagnosisFingerprint("reader-event:listener-registration-mismatch"),
      "reader-event:toolbar-bridge-registration-drift",
    );
    assert.equal(
      normalizeDiagnosisFingerprint("reader-event:synthetic-fallback-mapping-missing"),
      "reader-event:fine-grained-hook-declaration-drift",
    );
    assert.equal(
      normalizeDiagnosisFingerprint("reader-event:probe-compatible-type-missing"),
      "reader-event:fine-grained-hook-declaration-drift",
    );
    assert.equal(
      normalizeDiagnosisFingerprint("reader-entry:declarative-reader-mapping-drift"),
      "reader-entry:declarative-reader-mapping-drift",
    );
    assert.equal(
      normalizeDiagnosisFingerprint("reader-event:toolbar-bridge-registration-drift"),
      "reader-event:toolbar-bridge-registration-drift",
    );
    assert.equal(
      normalizeDiagnosisFingerprint("reader-event:fine-grained-hook-declaration-drift"),
      "reader-event:fine-grained-hook-declaration-drift",
    );
  });

  it("should normalize legacy fingerprint in autofix patch archive source diagnosis", () => {
    const summary = summarizeAutofixReport({
      generatedAt: "2026-03-24T00:00:00.000Z",
      recovered: false,
      outcomeLabel: "未恢复",
      attempts: [],
      patchPlan: {
        status: "review-ready",
        statusLabel: "可进入受限补丁审阅",
        mode: "review-only",
        fingerprint: "reader-event:listener-registration-mismatch",
        featureLabel: "Reader 事件桥",
        allowedTargets: ["src/features/reader.js"],
        patchDrafts: [],
      },
      patchArchive: {
        present: true,
        runId: "20260324T000000000Z",
        sourceDiagnosis: {
          fingerprint: "reader-event:listener-registration-mismatch",
          feature: "reader-event",
          featureLabel: "Reader 事件桥",
        },
        patch: {},
        verificationContract: {},
      },
    }, {
      now: "2026-03-24T00:30:00.000Z",
    });

    assert.equal(summary.patchArchivePresent, true);
    assert.equal(summary.patchPlanStatus, "review-ready");
  });
});
