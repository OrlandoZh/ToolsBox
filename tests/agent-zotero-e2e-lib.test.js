import { describe, it, assert } from "./test-framework.js";
import {
  summarizeLogs,
  evaluateCycle,
  buildE2EMarkdown,
  ensureLibraryVisualStageReady,
} from "../scripts/agent-zotero-e2e-lib.mjs";
import { normalizeDiagnosisFingerprint } from "../scripts/agent-zotero-diagnosis-lib.mjs";

describe("Agent Zotero E2E Lib", () => {
  it("should enforce the library visual precondition order before inspecting the item", async () => {
    const steps = [];

    const result = await ensureLibraryVisualStageReady({
      itemID: 101,
      libraryID: 1,
      waitForViews: async () => {
        steps.push("waitForViews");
        return true;
      },
      stabilizeHostSurface: async () => {
        steps.push("stabilizeHostSurface");
        return {
          suppressedBannerIDs: ["sync-reminder-container", "post-upgrade-container"],
          retainedBannerIDs: ["mac-word-plugin-install-container"],
          visibleBannerIDs: ["mac-word-plugin-install-container"],
        };
      },
      selectLibrary: async (libraryID) => {
        steps.push(`selectLibrary:${libraryID}`);
        return true;
      },
      waitForItemsLoad: async () => {
        steps.push("waitForItemsLoad");
        return true;
      },
      selectItem: async (itemID) => {
        steps.push(`selectItem:${itemID}`);
      },
      waitForSelection: async (itemID) => {
        steps.push(`waitForSelection:${itemID}`);
        return {
          selectedIDs: [itemID],
          selectedCount: 1,
        };
      },
      waitForPaint: async () => {
        steps.push("waitForPaint");
        return true;
      },
      inspectItem: async (itemID) => {
        steps.push(`inspectItem:${itemID}`);
        return {
          itemID,
          title: "Agent Visual Validation",
          summary: "Agent Visual Validation #101",
          columnValue: "book · 23",
        };
      },
      readSelectedTabID: () => "library",
      readWindowTitle: () => "My Library",
    });

    assert.deepEqual(steps, [
      "waitForViews",
      "stabilizeHostSurface",
      "selectLibrary:1",
      "waitForItemsLoad",
      "selectItem:101",
      "waitForSelection:101",
      "waitForPaint",
      "inspectItem:101",
    ]);
    assert.deepEqual(result.selection.selectedIDs, [101]);
    assert.equal(result.selection.selectedCount, 1);
    assert.equal(result.preparation.viewsReady, true);
    assert.equal(result.preparation.libraryRootSelected, true);
    assert.equal(result.preparation.itemsViewLoaded, true);
    assert.equal(result.preparation.selectionMatched, true);
    assert.equal(result.preparation.selectionSingleItem, true);
    assert.equal(result.preparation.selectedTabID, "library");
    assert.equal(result.preparation.windowTitle, "My Library");
    assert.deepEqual(result.preparation.suppressedBannerIDs, [
      "post-upgrade-container",
      "sync-reminder-container",
    ]);
    assert.deepEqual(result.preparation.retainedBannerIDs, [
      "mac-word-plugin-install-container",
    ]);
    assert.deepEqual(result.preparation.visibleBannerIDs, [
      "mac-word-plugin-install-container",
    ]);
    assert.equal(result.settleSnapshot.columnValue, "book · 23");
    assert.deepEqual(result.settleSnapshot.visibleBannerIDs, [
      "mac-word-plugin-install-container",
    ]);
  });

  it("should preserve library preparation metadata while degrading optional hooks safely", async () => {
    const result = await ensureLibraryVisualStageReady({
      itemID: 202,
      waitForViews: async () => true,
      selectItem: async () => {},
      waitForSelection: async (itemID) => ({
        selectedIDs: [itemID],
      }),
      inspectItem: async (itemID) => ({
        itemID,
        title: "Library Item",
        summary: "Library Item #202",
        columnValue: "report · 7",
      }),
    });

    assert.equal(result.libraryID, null);
    assert.equal(result.preparation.libraryRootSelected, null);
    assert.equal(result.preparation.itemsViewLoaded, null);
    assert.equal(result.preparation.selectionMatched, true);
    assert.equal(result.preparation.selectionSingleItem, true);
    assert.equal(result.preparation.selectedTabID, null);
    assert.equal(result.preparation.windowTitle, null);
    assert.deepEqual(result.preparation.suppressedBannerIDs, []);
    assert.deepEqual(result.preparation.retainedBannerIDs, []);
    assert.deepEqual(result.preparation.visibleBannerIDs, []);
    assert.deepEqual(result.settleSnapshot.selectedIDs, [202]);
    assert.equal(result.settleSnapshot.selectedCount, 1);
    assert.deepEqual(result.settleSnapshot.visibleBannerIDs, []);
  });

  it("should continue library preparation when itemsView.waitForLoad times out", async () => {
    const steps = [];

    const result = await ensureLibraryVisualStageReady({
      itemID: 303,
      waitForViews: async () => {
        steps.push("waitForViews");
        return true;
      },
      waitForItemsLoad: async () => {
        steps.push("waitForItemsLoad");
        await new Promise(() => {});
      },
      waitForItemsLoadTimeoutMs: 10,
      selectItem: async (itemID) => {
        steps.push(`selectItem:${itemID}`);
      },
      waitForSelection: async (itemID) => {
        steps.push(`waitForSelection:${itemID}`);
        return {
          selectedIDs: [itemID],
          selectedCount: 1,
        };
      },
      inspectItem: async (itemID) => {
        steps.push(`inspectItem:${itemID}`);
        return {
          itemID,
          title: "Timed Library Item",
          summary: "Timed Library Item #303",
          columnValue: "note · 1",
        };
      },
    });

    assert.deepEqual(steps, [
      "waitForViews",
      "waitForItemsLoad",
      "selectItem:303",
      "waitForSelection:303",
      "inspectItem:303",
    ]);
    assert.equal(result.preparation.itemsViewLoaded, false);
    assert.equal(result.preparation.itemsViewLoadTimedOut, true);
    assert.ok(
      /waitForItemsLoad timed out after 10ms/i.test(result.preparation.itemsViewLoadError),
    );
    assert.equal(result.preparation.selectionMatched, true);
    assert.equal(result.preparation.selectionSingleItem, true);
    assert.equal(result.settleSnapshot.itemID, 303);
  });

  it("should fail fast when the library item selection step hangs", async () => {
    let error = null;
    try {
      await ensureLibraryVisualStageReady({
        itemID: 404,
        waitForViews: async () => true,
        selectItem: async () => {
          await new Promise(() => {});
        },
        selectItemTimeoutMs: 10,
        waitForSelection: async () => ({
          selectedIDs: [404],
          selectedCount: 1,
        }),
      });
    }
    catch (caught) {
      error = caught;
    }

    assert.ok(error);
    assert.ok(/selectItem timed out after 10ms/i.test(String(error.message || error)));
  });

  it("should summarize logs and classify errors", () => {
    const summary = summarizeLogs([
      { level: "info", message: "hello" },
      { level: "warn", message: "careful" },
      { level: "debug", message: "[cleanroom:error] plugin.start.failed" },
    ]);

    assert.equal(summary.total, 3);
    assert.equal(summary.warnCount, 1);
    assert.equal(summary.errorCount, 1);
    assert.equal(summary.infoCount, 1);
    assert.equal(summary.errorBoundaryHitCount, 1);
    assert.equal(summary.errorBoundaryEvents[0]?.event, "plugin.start.failed");
  });

  it("should evaluate cycle result and detect missing capabilities", () => {
    const result = evaluateCycle({
      checks: {
        pluginMounted: false,
        apiMounted: false,
        primaryActionResult: false,
        agentActionResult: false,
        itemPaneSections: 0,
        itemPaneInfoRows: 0,
        itemTreeColumns: 0,
        notifierActiveCount: 0,
      },
      tests: {
        total: 2,
        passed: 1,
        failed: 1,
      },
      scenarios: {
        total: 2,
        passed: 1,
        failed: 1,
      },
      logs: {
        errorCount: 2,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: false,
          issues: ["缺少 Reader 截图。"],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.length >= 6);
    assert.ok(result.issues.includes("缺少 Reader 截图。"));
    assert.ok(Array.isArray(result.hints));
    assert.ok(result.hints.length > 0);
    assert.ok(Array.isArray(result.diagnoses));
    assert.ok(result.diagnoses.length > 0);
    assert.equal(result.primaryDiagnosis?.feature, "bootstrap");
    assert.ok(Array.isArray(result.primaryDiagnosis?.candidateFiles));
  });

  it("should flag incomplete scenario execution as a separate cycle issue", () => {
    const result = evaluateCycle({
      checks: {
        pluginMounted: true,
        apiMounted: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 3,
        passed: 1,
        failed: 1,
        results: [
          {
            name: "menu surface smoke",
            status: "failed",
            error: {
              kind: "chrome-evaluation-timeout",
              message: "Timed out waiting for RDP event (scenario:menu surface smoke)",
            },
          },
        ],
        execution: {
          incomplete: true,
          lastStartedScenario: "menu surface smoke",
          timeoutKind: "chrome-evaluation-timeout",
        },
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: false,
      },
    });

    assert.ok(result.issues.some((item) => item.includes("Zotero 场景执行未完成")));
    assert.ok(result.issues.some((item) => item.includes("chrome-evaluation-timeout")));
  });

  it("should surface hang probe hints for transport-style stalls", () => {
    const result = evaluateCycle({
      checks: {
        pluginMounted: true,
        apiMounted: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 3,
        passed: 1,
        failed: 1,
        results: [{
          name: "multi-window mount diagnostics",
          status: "failed",
          error: {
            kind: "chrome-evaluation-timeout",
            message: "Timed out waiting for RDP event (scenario:multi-window mount diagnostics)",
          },
        }],
        execution: {
          incomplete: true,
          lastStartedScenario: "multi-window mount diagnostics",
          timeoutKind: "chrome-evaluation-timeout",
        },
      },
      hangProbe: {
        present: true,
        likelyCause: "event-loop-stall",
        likelyCauseLabel: "更像 chrome evaluation / 事件循环阻塞",
        summary: "触发场景 multi-window mount diagnostics；原因 chrome-evaluation-timeout；进程仍存活（PID 123 / RSS 842.1 MB / stat S）；未见 OOM/内存压力信号；已采集 sample；判断：更像 chrome evaluation / 事件循环阻塞",
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: false,
      },
    });

    assert.ok(result.hints.some((item) => item.includes("Hang probe：")));
    assert.ok(result.hints.some((item) => item.includes("不先把问题归因为内存泄漏")));
  });

  it("should render markdown report with cycle summary", () => {
    const markdown = buildE2EMarkdown({
      generatedAt: "2026-03-19T00:00:00.000Z",
      strategy: "hot",
      visualBaselineDir: "/tmp/visual-baseline",
      visualBaselineMode: "compare",
      passed: true,
      issues: [],
      hints: ["ok"],
      diagnostics: [
        {
          fingerprint: "item-pane:item-pane-section-missing",
          feature: "item-pane",
          featureLabel: "ItemPane 注册",
          severity: "high",
          confidence: 0.95,
          summary: "ItemPane Section 未注册到宿主。",
          candidateFiles: ["src/features/item-pane.js"],
        },
      ],
      cycles: [{
        index: 1,
        bootMode: "hot-reload",
        passed: true,
        summaryNote: "动作与校验通过",
        tests: { failed: 0 },
        scenarios: {
          failed: 0,
          results: [
            { name: "baseline registration diagnostics", status: "passed" },
            { name: "settings schema and preference pane diagnostics", status: "passed" },
            {
              name: "reader interaction diagnostics",
              status: "passed",
              details: {
                toolbarDispatchMode: "customEvent",
                toolbarAppendedItemCount: 2,
                selectionPopupAppendedItemCount: 1,
                sidebarHeaderAppendedItemCount: 3,
                contextMenuProbeCount: 2,
                contextMenuObservedTypes: [
                  "createViewContextMenu",
                  "createAnnotationContextMenu",
                ],
                contextMenuSyntheticFallbackTypes: [
                  "createViewContextMenu",
                ],
              },
            },
          ],
        },
        hangProbe: {
          present: true,
          advisory: true,
          cycleIndex: 1,
          scenarioName: "multi-window mount diagnostics",
          reasonKind: "chrome-evaluation-timeout",
          processAlive: true,
          rssMb: 842.1,
          oomSignalCount: 0,
          sampleAttempted: true,
          sampleCaptured: true,
          samplePath: "/tmp/cycle-1-hang-sample.txt",
          likelyCause: "event-loop-stall",
          likelyCauseLabel: "更像 chrome evaluation / 事件循环阻塞",
          summary: "触发场景 multi-window mount diagnostics；原因 chrome-evaluation-timeout；进程仍存活（PID 123 / RSS 842.1 MB / stat S）；未见 OOM/内存压力信号；已采集 sample；判断：更像 chrome evaluation / 事件循环阻塞",
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
              {
                kind: "library",
                stable: true,
                attemptCount: 2,
                selectionReason: "stable-hash-pair",
                preCaptureSettle: {
                  stage: "library",
                  settled: true,
                  timedOut: false,
                  pollCount: 2,
                  resetCount: 0,
                  stableSampleTarget: 2,
                  consecutiveStableSamples: 2,
                  verificationMatched: true,
                  snapshotSummary: "item#101 / selected 1 / Library Item",
                  summary: "library 达成，2/2，轮询 2 次，最终复核一致",
                },
              },
              {
                kind: "reader",
                stable: false,
                attemptCount: 3,
                selectionReason: "max-attempt-reached",
                preCaptureSettle: {
                  stage: "reader",
                  settled: false,
                  timedOut: true,
                  pollCount: 7,
                  resetCount: 2,
                  stableSampleTarget: 3,
                  consecutiveStableSamples: 1,
                  verificationMatched: false,
                  snapshotSummary: "item#202 / tab tab-2 / ann 1 / active true / window false / sidebar outline",
                  summary: "reader 超时，1/3，轮询 7 次，重置 2 次，最终复核变更，快照 item#202 / tab tab-2 / ann 1 / active true / window false / sidebar outline",
                },
              },
            ],
          },
          analysis: {
            ok: true,
            baselines: [
              {
                kind: "library",
                canonicalTarget: "hot-reload-library.png",
                path: "/tmp/hot-reload-library.png",
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
                canonicalTarget: "hot-reload-reader.png",
                path: "/tmp/hot-reload-reader.png",
                status: "compared",
                ok: true,
                metrics: {
                  changedRatio: 0,
                  meanChannelDiff: 0,
                },
              },
            ],
            summary: {
              baseline: {
                comparedCount: 2,
                missingCount: 0,
                driftCount: 0,
                errorCount: 0,
                updateRequested: false,
              },
            },
          },
          warnings: [],
        },
      }],
      visuals: [],
    });

    assert.ok(markdown.includes("# Agent Zotero E2E 闭环报告"));
    assert.ok(markdown.includes("| 轮次 | 启动策略 | 状态 |"));
    assert.ok(markdown.includes("动作与校验通过"));
    assert.ok(markdown.includes("## 可视化验收"));
    assert.ok(markdown.includes("## 视觉证据索引"));
    assert.ok(markdown.includes("Cycle 1 / hot-reload / library"));
    assert.ok(markdown.includes("[library.png](/tmp/library.png)"));
    assert.ok(markdown.includes("[hot-reload-library.png](/tmp/hot-reload-library.png)"));
    assert.ok(markdown.includes("## Reader 视觉主阻断"));
    assert.ok(markdown.includes("## Reader 深层事件点"));
    assert.ok(markdown.includes("工具栏分发"));
    assert.ok(markdown.includes("工具栏追加项"));
    assert.ok(markdown.includes("文本浮层追加项"));
    assert.ok(markdown.includes("侧栏批注头追加项"));
    assert.ok(markdown.includes("上下文菜单探针数"));
    assert.ok(markdown.includes("createViewContextMenu"));
    assert.ok(markdown.includes("采集未稳定"));
    assert.ok(markdown.includes("Canonical 覆盖"));
    assert.ok(markdown.includes("| 轮次 | 库视图截图 | Reader 截图 | 校验 | 备注 |"));
    assert.ok(markdown.includes("视觉基线目录"));
    assert.ok(markdown.includes("基线比对 2"));
    assert.ok(markdown.includes("采集稳定性 library 稳定 2 次（哈希收敛）；reader 待稳 3 次（重试上限）"));
    assert.ok(markdown.includes("## Pre-capture Settle 诊断"));
    assert.ok(markdown.includes("reader 超时"));
    assert.ok(markdown.includes("## Hang Probe"));
    assert.ok(markdown.includes("更像 chrome evaluation / 事件循环阻塞"));
    assert.ok(markdown.includes("cycle-1-hang-sample.txt"));
    assert.ok(markdown.includes("## 能力覆盖"));
    assert.ok(markdown.includes("基线注册"));
    assert.ok(markdown.includes("## 结构化诊断"));
    assert.ok(markdown.includes("item-pane:item-pane-section-missing"));
  });

  it("should render incomplete scenario execution markers in markdown cycle summaries", () => {
    const markdown = buildE2EMarkdown({
      generatedAt: "2026-04-03T00:00:00.000Z",
      strategy: "hot",
      visualBaselineDir: "/tmp/visual-baseline",
      visualBaselineMode: "compare",
      passed: false,
      issues: ["Zotero 场景执行未完成"],
      hints: [],
      diagnostics: [],
      cycles: [{
        index: 1,
        bootMode: "hot-reload",
        passed: false,
        summaryNote: "发现 1 项问题",
        tests: { failed: 0 },
        scenarios: {
          failed: 1,
          execution: {
            incomplete: true,
            lastStartedScenario: "menu surface smoke",
          },
        },
        logs: {
          errorCount: 0,
          warnCount: 0,
          recentErrors: [],
        },
        visuals: {
          captures: [],
          warnings: [],
          analysis: {
            ok: true,
            summary: {
              baseline: {
                comparedCount: 0,
                missingCount: 0,
                driftCount: 0,
                errorCount: 0,
                updateRequested: false,
              },
            },
          },
        },
      }],
      visuals: [],
    });

    assert.ok(markdown.includes("incomplete@menu surface smoke"));
  });

  it("should render stable-low-drift-pair reason in markdown summaries", () => {
    const markdown = buildE2EMarkdown({
      generatedAt: "2026-03-26T00:00:00.000Z",
      strategy: "hot",
      visualBaselineDir: "/tmp/visual-baseline",
      visualBaselineMode: "compare",
      passed: false,
      issues: ["reader 截图与基线像素漂移过大：12.00% > 5.00%"],
      hints: [],
      diagnostics: [],
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
        summaryNote: "视觉漂移待人工确认",
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
            ok: false,
            baselines: [
              {
                kind: "library",
                canonicalTarget: "hot-reload-library.png",
                path: "/tmp/hot-reload-library.png",
                status: "compared",
                ok: true,
                metrics: {
                  changedRatio: 0,
                  meanChannelDiff: 0,
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
                  changedRatio: 0.12,
                  meanChannelDiff: 8,
                },
                issues: ["reader 截图与基线像素漂移过大：12.00% > 5.00%"],
              },
            ],
            summary: {
              baseline: {
                comparedCount: 2,
                missingCount: 0,
                driftCount: 1,
                errorCount: 0,
                updateRequested: false,
              },
            },
          },
          warnings: [],
        },
      }],
      visuals: [],
    });

    assert.ok(markdown.includes("reader 稳定 3 次（低漂移收敛）"));
  });

  it("should render structured capture-command-failed diagnosis in markdown", () => {
    const markdown = buildE2EMarkdown({
      generatedAt: "2026-03-29T17:31:23.539Z",
      strategy: "restart",
      visualBaselineDir: "/tmp/visual-baseline",
      visualBaselineMode: "compare",
      passed: false,
      issues: ["could not create image from rect"],
      hints: [],
      diagnostics: [],
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
        bootMode: "restart",
        passed: false,
        summaryNote: "library 截图命令失败",
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
          warnCount: 1,
          recentErrors: [],
        },
        visuals: {
          captures: [
            { kind: "reader", path: "/tmp/reader.png", analysis: { width: 2000, height: 1200 } },
          ],
          captureStability: {
            stages: [
              {
                kind: "library",
                stable: false,
                attemptCount: 2,
                selectedAttempt: 2,
                selectionReason: "max-attempt-reached",
                failureKind: "capture-command-failed",
                failureCategory: "capture-command-failed",
                failureStage: "capture-command",
                failureMessage: "could not create image from rect",
                boundsSource: "chrome-target",
                windowTitle: "My Library",
                command: "screencapture",
                commandExitCode: 1,
                stderr: "could not create image from rect",
                rect: "100,80,1000,600",
                attempts: [
                  {
                    index: 1,
                    sha256: "lib-1",
                    width: 2000,
                    height: 1200,
                    bounds: { x: 100, y: 80, width: 1000, height: 600 },
                  },
                  {
                    index: 2,
                    sha256: "lib-2",
                    width: 2000,
                    height: 1200,
                    bounds: { x: 100, y: 80, width: 1000, height: 600 },
                  },
                ],
              },
              {
                kind: "reader",
                stable: true,
                attemptCount: 2,
                selectedAttempt: 2,
                selectionReason: "stable-hash-pair",
                attempts: [
                  {
                    index: 1,
                    sha256: "reader-1",
                    width: 2000,
                    height: 1200,
                    bounds: { x: 100, y: 80, width: 1000, height: 600 },
                  },
                  {
                    index: 2,
                    sha256: "reader-1",
                    width: 2000,
                    height: 1200,
                    bounds: { x: 100, y: 80, width: 1000, height: 600 },
                  },
                ],
              },
            ],
          },
          analysis: {
            ok: false,
            baselines: [
              {
                kind: "library",
                canonicalTarget: "restart-library.png",
                path: "/tmp/restart-library.png",
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
                canonicalTarget: "restart-reader.png",
                path: "/tmp/restart-reader.png",
                status: "compared",
                ok: true,
                metrics: {
                  sameDimensions: true,
                  changedRatio: 0,
                  meanChannelDiff: 0,
                },
              },
            ],
            summary: {
              baseline: {
                comparedCount: 2,
                missingCount: 0,
                driftCount: 1,
                errorCount: 0,
                updateRequested: false,
              },
            },
          },
          warnings: [],
        },
      }],
      visuals: [],
    });

    assert.ok(markdown.includes("## Capture Attempt 诊断"));
    assert.ok(markdown.includes("Stage 失败：截图调用失败 (capture-command-failed)"));
    assert.ok(markdown.includes("失败信息：could not create image from rect"));
    assert.ok(markdown.includes("Bounds 来源：chrome-target"));
    assert.ok(markdown.includes("窗口标题：My Library"));
    assert.ok(markdown.includes("命令退出码：1"));
    assert.ok(markdown.includes("Stderr：could not create image from rect"));
  });

  it("should render mixed library-exhausted and reader-low-drift states without regressing blocker wording", () => {
    const markdown = buildE2EMarkdown({
      generatedAt: "2026-03-26T00:00:00.000Z",
      strategy: "hot",
      visualBaselineDir: "/tmp/visual-baseline",
      visualBaselineMode: "compare",
      passed: false,
      issues: ["library 截图与基线像素漂移过大：11.00% > 5.00%"],
      hints: [],
      diagnostics: [],
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
            ok: false,
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
                updateRequested: false,
              },
            },
          },
          warnings: [],
        },
      }],
      visuals: [],
    });

    assert.ok(markdown.includes("采集稳定性 library 待稳 3 次（重试上限）；reader 稳定 3 次（低漂移收敛）"));
    assert.ok(markdown.includes("用尽预算 stage：library（3 次）"));
    assert.equal(markdown.includes("用尽预算 stage：reader（3 次）"), false);
    assert.ok(markdown.includes("## Capture Attempt 诊断"));
    assert.ok(markdown.includes("Cycle 1 / hot-reload / library"));
    assert.ok(markdown.includes("Hash 全变：是"));
    assert.ok(markdown.includes("Attempt Bounds：100,80 1000x600；100,80 1000x600；100,80 1000x600"));
    assert.ok(markdown.includes("Stability Metrics：sameDimensions=是 / changedRatio=0.80% / meanChannelDiff=0.90 / thresholdChangedRatio=1.25% / thresholdMeanChannelDiff=1.25"));
  });

  it("should not fail cycle when visual baseline is missing but no drift is detected", () => {
    const result = evaluateCycle({
      checks: {
        pluginMounted: true,
        apiMounted: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
          summary: {
            baseline: {
              comparedCount: 0,
              missingCount: 2,
              driftCount: 0,
              errorCount: 0,
              updateRequested: false,
            },
          },
        },
      },
    });

    assert.equal(result.passed, true);
    assert.equal(result.issues.length, 0);
  });

  it("should treat whole-window visual drift as supplemental when all surface-local baselines pass", () => {
    const result = evaluateCycle({
      checks: {
        pluginMounted: true,
        apiMounted: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: false,
          issues: [
            "library 截图与基线像素漂移过大：99.00% > 35.00%",
            "reader 截图与基线像素漂移过大：98.00% > 5.00%",
          ],
          baselines: [
            {
              kind: "library",
              scope: "window-stage",
              status: "compared",
              ok: false,
            },
            {
              kind: "reader",
              scope: "window-stage",
              status: "compared",
              ok: false,
            },
            {
              kind: "surface-reader-toolbar",
              scope: "surface-local",
              status: "compared",
              ok: true,
            },
            {
              kind: "surface-reader-sidebar-thumbnails",
              scope: "surface-local",
              status: "compared",
              ok: true,
            },
          ],
        },
      },
    });

    assert.equal(result.passed, true);
    assert.equal(result.issues.includes("library 截图与基线像素漂移过大：99.00% > 35.00%"), false);
    assert.equal(result.issues.includes("reader 截图与基线像素漂移过大：98.00% > 5.00%"), false);
  });

  it("should keep visual drift blocking when a surface-local baseline still fails", () => {
    const result = evaluateCycle({
      checks: {
        pluginMounted: true,
        apiMounted: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: false,
          issues: [
            "surface-reader-sidebar-thumbnails 截图与基线尺寸不一致：当前 480x1200，基线 2000x1200",
          ],
          baselines: [
            {
              kind: "library",
              scope: "window-stage",
              status: "compared",
              ok: false,
            },
            {
              kind: "surface-reader-sidebar-thumbnails",
              scope: "surface-local",
              status: "compared",
              ok: false,
            },
          ],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("surface-reader-sidebar-thumbnails 截图与基线尺寸不一致：当前 480x1200，基线 2000x1200"));
  });

  it("should report service health degradation as cycle issue", () => {
    const result = evaluateCycle({
      checks: {
        pluginMounted: true,
        apiMounted: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
        serviceTotal: 2,
        serviceHealthyCount: 1,
        serviceUnhealthyCount: 1,
        serviceHealthOK: false,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.some((item) => String(item).includes("服务健康异常")));
    assert.ok(result.hints.some((item) => String(item).includes("service registry")));
  });

  it("should prioritize bootstrap diagnosis when bootstrap.js baseline file is missing", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        staticRuntimeOK: false,
        staticRuntimeMissingCount: 1,
        staticRuntimeMissingEntries: [{
          file: "addon-static/bootstrap.js",
          label: "bootstrap 启动脚本",
          reason: "file-missing",
        }],
        pluginMounted: false,
        apiMounted: false,
        primaryActionResult: false,
        agentActionResult: false,
        itemPaneSections: 0,
        itemPaneInfoRows: 0,
        itemTreeColumns: 0,
        notifierActiveCount: 0,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: false,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("静态运行时基线缺失：addon-static/bootstrap.js（bootstrap 启动脚本）。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "bootstrap:bootstrap-file-missing");
    assert.ok(result.hints.some((item) => String(item).includes("addon-static/bootstrap.js")));
  });

  it("should prioritize bootstrap drift diagnosis when bootstrap.js content drifts from clean-room baseline", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        staticRuntimeOK: true,
        staticRuntimeBaselineOK: false,
        staticRuntimeMissingCount: 0,
        staticRuntimeDriftCount: 1,
        staticRuntimeDriftEntries: [{
          file: "addon-static/bootstrap.js",
          label: "bootstrap 启动脚本",
          reason: "content-drift",
        }],
        pluginMounted: false,
        apiMounted: false,
        primaryActionResult: false,
        agentActionResult: false,
        itemPaneSections: 0,
        itemPaneInfoRows: 0,
        itemTreeColumns: 0,
        notifierActiveCount: 0,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: false,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("静态运行时基线漂移：addon-static/bootstrap.js（bootstrap 启动脚本）。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "bootstrap:bootstrap-file-drift");
    assert.ok(result.hints.some((item) => String(item).includes("canonical baseline")));
  });

  it("should prioritize reader entry diagnosis when reader summary command and menu are missing", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
        officialMenuAPIAvailable: true,
        readerSummaryCommandRegistered: false,
        readerSummaryMenuRegistered: false,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("Reader 摘要命令未注册。"));
    assert.ok(result.issues.includes("Reader View 菜单项未注册。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "reader-entry:declarative-reader-mapping-drift");
    assert.ok(result.hints.some((item) => String(item).includes("feature-composer.js")));
    assert.ok(result.hints.some((item) => String(item).includes("registerReaderMenubarViewMenuItem")));
  });

  it("should diagnose reader event bridge registration drift when hook scenario fails", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
        readerSummaryCommandRegistered: true,
        readerSummaryMenuRegistered: true,
        readerEventAPIAvailable: true,
        readerEventKnownTypeCount: 8,
        readerEventProbeTypeCount: 7,
        readerEventSyntheticFallbackAvailable: true,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 2,
        passed: 1,
        failed: 1,
        results: [
          {
            name: "reader event hook diagnostics",
            status: "failed",
          },
          {
            name: "reader fine-grained hook diagnostics",
            status: "passed",
          },
        ],
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("Reader 官方事件监听注册异常。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "reader-event:toolbar-bridge-registration-drift");
    assert.ok(result.hints.some((item) => String(item).includes("registerEventListener()")));
  });

  it("should not report renderToolbar drift when reader hook scenarios were not observed", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
        readerSummaryCommandRegistered: true,
        readerSummaryMenuRegistered: true,
        readerEventAPIAvailable: true,
        readerEventKnownTypeCount: 0,
        readerEventProbeTypeCount: 0,
        readerEventSyntheticFallbackAvailable: true,
        readerEventHookScenarioObserved: false,
        readerEventFineGrainedScenarioObserved: false,
        readerEventHookScenarioPassed: null,
        readerEventFineGrainedScenarioPassed: null,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
        results: [],
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, true);
    assert.equal(result.issues.includes("Reader renderToolbar 宿主点未观测。"), false);
    assert.equal(result.issues.includes("Reader 官方事件监听注册异常。"), false);
  });

  it("should diagnose reader event synthetic fallback mapping gaps", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
        readerSummaryCommandRegistered: true,
        readerSummaryMenuRegistered: true,
        readerEventAPIAvailable: true,
        readerEventKnownTypeCount: 8,
        readerEventProbeTypeCount: 7,
        readerEventSyntheticFallbackAvailable: false,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 2,
        passed: 1,
        failed: 1,
        results: [
          {
            name: "reader event hook diagnostics",
            status: "passed",
          },
          {
            name: "reader fine-grained hook diagnostics",
            status: "failed",
          },
        ],
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("Reader 事件桥缺少 synthetic-fallback 映射。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "reader-event:fine-grained-hook-declaration-drift");
    assert.ok(result.hints.some((item) => String(item).includes("READER_EVENT_SYNTHETIC_FALLBACK_TYPES")));
  });

  it("should diagnose reader event declaration gaps when known or probe types regress", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
        readerSummaryCommandRegistered: true,
        readerSummaryMenuRegistered: true,
        readerEventAPIAvailable: true,
        readerEventKnownTypeCount: 7,
        readerEventProbeTypeCount: 6,
        readerEventSyntheticFallbackAvailable: true,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 2,
        passed: 2,
        failed: 0,
        results: [
          {
            name: "reader event hook diagnostics",
            status: "passed",
          },
          {
            name: "reader fine-grained hook diagnostics",
            status: "passed",
          },
        ],
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.some((item) => String(item).includes("Reader 事件桥已知类型声明缺口")));
    assert.ok(result.issues.some((item) => String(item).includes("Reader 事件桥 probe 声明缺口")));
    assert.equal(result.primaryDiagnosis?.fingerprint, "reader-event:fine-grained-hook-declaration-drift");
    assert.ok(result.hints.some((item) => String(item).includes("READER_EVENT_KNOWN_TYPES")));
  });

  it("should prioritize menu diagnosis when primary command registration is missing", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionCommandRegistered: false,
        readerSummaryCommandRegistered: true,
        officialMenuAPIAvailable: true,
        contextActionMenuRegistered: true,
        readerSummaryMenuRegistered: true,
        preferencePaneRegistered: true,
        preferencePaneCount: 1,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("主命令未注册到命令面板。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "menu-action:primary-command-missing");
    assert.ok(result.hints.some((item) => String(item).includes("*-primary-action")));
  });

  it("should prioritize menu diagnosis when context menu registration is missing", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionCommandRegistered: true,
        readerSummaryCommandRegistered: true,
        officialMenuAPIAvailable: true,
        contextActionMenuRegistered: false,
        readerSummaryMenuRegistered: true,
        preferencePaneRegistered: true,
        preferencePaneCount: 1,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("主窗口上下文菜单项未注册。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "menu-action:context-menu-missing");
    assert.ok(result.hints.some((item) => String(item).includes("registerItemMenuItem")));
  });

  it("should prioritize preference pane diagnosis when preference pane registration is missing", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionCommandRegistered: true,
        readerSummaryCommandRegistered: true,
        officialMenuAPIAvailable: true,
        contextActionMenuRegistered: true,
        readerSummaryMenuRegistered: true,
        preferencePaneRegistered: false,
        preferencePaneCount: 0,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("偏好设置面板未注册。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "preferences:preference-pane-missing");
    assert.ok(result.hints.some((item) => String(item).includes("preferences.xhtml")));
  });

  it("should prioritize preference pane resource diagnosis when preferences.xhtml is missing", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionCommandRegistered: true,
        readerSummaryCommandRegistered: true,
        officialMenuAPIAvailable: true,
        contextActionMenuRegistered: true,
        readerSummaryMenuRegistered: true,
        preferencePaneRegistered: false,
        preferencePaneCount: 0,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 1,
        warnCount: 0,
        recentErrors: [{
          message: "JavaScript error: missing chrome or resource url for content/preferences.xhtml",
        }],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("偏好设置面板未注册。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "preferences:preference-pane-resource-missing");
    assert.ok(result.hints.some((item) => String(item).includes("addon-static/content/preferences.xhtml")));
  });

  it("should prioritize preference pane resource diagnosis from static runtime baseline check", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        staticRuntimeOK: false,
        staticRuntimeMissingCount: 1,
        staticRuntimeMissingEntries: [{
          file: "addon-static/content/preferences.xhtml",
          label: "偏好设置面板资源",
          reason: "file-missing",
        }],
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionCommandRegistered: true,
        readerSummaryCommandRegistered: true,
        officialMenuAPIAvailable: true,
        contextActionMenuRegistered: true,
        readerSummaryMenuRegistered: true,
        preferencePaneRegistered: false,
        preferencePaneCount: 0,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("静态运行时基线缺失：addon-static/content/preferences.xhtml（偏好设置面板资源）。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "preferences:preference-pane-resource-missing");
  });

  it("should diagnose preference pane resource drift from static runtime baseline check", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        staticRuntimeOK: true,
        staticRuntimeBaselineOK: false,
        staticRuntimeMissingCount: 0,
        staticRuntimeDriftCount: 1,
        staticRuntimeDriftEntries: [{
          file: "addon-static/content/preferences.xhtml",
          label: "偏好设置面板资源",
          reason: "content-drift",
        }],
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionCommandRegistered: true,
        readerSummaryCommandRegistered: true,
        officialMenuAPIAvailable: true,
        contextActionMenuRegistered: true,
        readerSummaryMenuRegistered: true,
        preferencePaneRegistered: false,
        preferencePaneCount: 0,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("静态运行时基线漂移：addon-static/content/preferences.xhtml（偏好设置面板资源）。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "preferences:preference-pane-resource-drift");
  });

  it("should prioritize runtime style resource diagnosis when main.css is missing", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionCommandRegistered: true,
        readerSummaryCommandRegistered: true,
        officialMenuAPIAvailable: true,
        contextActionMenuRegistered: true,
        readerSummaryMenuRegistered: true,
        preferencePaneRegistered: true,
        preferencePaneCount: 1,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 1,
        warnCount: 0,
        recentErrors: [{
          message: "JavaScript error: missing chrome or resource url for content/style/main.css",
        }],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("检测到 1 条 error 级日志。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "runtime-logs:style-sheet-resource-missing");
    assert.ok(result.hints.some((item) => String(item).includes("addon-static/content/style/main.css")));
  });

  it("should prioritize runtime style resource diagnosis from static runtime baseline check", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        staticRuntimeOK: false,
        staticRuntimeMissingCount: 1,
        staticRuntimeMissingEntries: [{
          file: "addon-static/content/style/main.css",
          label: "主窗口样式资源",
          reason: "file-missing",
        }],
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionCommandRegistered: true,
        readerSummaryCommandRegistered: true,
        officialMenuAPIAvailable: true,
        contextActionMenuRegistered: true,
        readerSummaryMenuRegistered: true,
        preferencePaneRegistered: true,
        preferencePaneCount: 1,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("静态运行时基线缺失：addon-static/content/style/main.css（主窗口样式资源）。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "runtime-logs:style-sheet-resource-missing");
  });

  it("should diagnose runtime style resource drift from static runtime baseline check", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        staticRuntimeOK: true,
        staticRuntimeBaselineOK: false,
        staticRuntimeMissingCount: 0,
        staticRuntimeDriftCount: 1,
        staticRuntimeDriftEntries: [{
          file: "addon-static/content/style/main.css",
          label: "主窗口样式资源",
          reason: "content-drift",
        }],
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionCommandRegistered: true,
        readerSummaryCommandRegistered: true,
        officialMenuAPIAvailable: true,
        contextActionMenuRegistered: true,
        readerSummaryMenuRegistered: true,
        preferencePaneRegistered: true,
        preferencePaneCount: 1,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 1,
        warnCount: 0,
        recentErrors: [{
          message: "JavaScript error: failed to load resource://cleanroom/content/style/main.css",
        }],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("静态运行时基线漂移：addon-static/content/style/main.css（主窗口样式资源）。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "runtime-logs:style-sheet-resource-drift");
  });

  it("should diagnose icon resource drift from static runtime baseline check", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        staticRuntimeOK: true,
        staticRuntimeBaselineOK: false,
        staticRuntimeMissingCount: 0,
        staticRuntimeDriftCount: 1,
        staticRuntimeDriftEntries: [{
          file: "addon-static/content/icons/icon-48.png",
          label: "配置声明的 icon 资源",
          reason: "content-drift",
        }],
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionCommandRegistered: true,
        readerSummaryCommandRegistered: true,
        officialMenuAPIAvailable: true,
        contextActionMenuRegistered: true,
        readerSummaryMenuRegistered: true,
        preferencePaneRegistered: true,
        preferencePaneCount: 1,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("静态运行时基线漂移：addon-static/content/icons/icon-48.png（配置声明的 icon 资源）。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "assets:icon-resource-drift");
    assert.ok(result.hints.some((item) => String(item).includes("基线路径")));
  });

  it("should prioritize localization diagnosis when item pane l10n ids drift from baseline", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemPaneL10nOK: false,
        itemPaneL10nDriftCount: 1,
        itemPaneL10nDrifts: [{
          kind: "info-row-label",
          expected: "cleanroom-item-pane-info-row-label",
          actual: "cleanroom-item-pane-info-row-label-typo",
        }],
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("ItemPane InfoRow l10nID 漂移：期望 cleanroom-item-pane-info-row-label，实际 cleanroom-item-pane-info-row-label-typo。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "localization:item-pane-info-row-l10n-id-drift");
    assert.ok(result.hints.some((item) => String(item).includes("feature-composer.js")));
  });

  it("should prioritize localization diagnosis when locale ftl key is missing", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
        localeFTLOK: false,
        localeFTLMissingCount: 1,
        localeFTLMissingEntries: [{
          locale: "zh-CN",
          key: "cleanroom-item-pane-section-header",
        }],
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("Locale zh-CN 缺少 FTL key cleanroom-item-pane-section-header。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "localization:item-pane-section-header-ftl-key-missing");
    assert.ok(result.hints.some((item) => String(item).includes("main.ftl")));
  });

  it("should preserve file-missing detail when locale main ftl is absent", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
        localeFTLOK: false,
        localeFTLMissingCount: 1,
        localeFTLMissingEntries: [{
          locale: "zh-CN",
          key: "cleanroom-item-pane-section-header",
          file: "addon-static/locale/zh-CN/main.ftl",
          reason: "file-missing",
        }],
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("Locale zh-CN 缺少 FTL key cleanroom-item-pane-section-header（文件 addon-static/locale/zh-CN/main.ftl 不存在）。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "localization:item-pane-section-header-ftl-key-missing");
    assert.ok(result.hints.some((item) => String(item).includes("最小基线文件")));
  });

  it("should prioritize localization diagnosis when locale ftl value drifts", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
        localeFTLOK: false,
        localeFTLMissingCount: 0,
        localeFTLMissingEntries: [],
        localeFTLValueDriftCount: 1,
        localeFTLValueDriftEntries: [{
          locale: "zh-CN",
          key: "cleanroom-item-pane-section-header",
          expectedValue: "模板示例",
          actualValue: "模板示例-错误",
          actualLine: "cleanroom-item-pane-section-header =\\n    .label = 模板示例-错误".replace("\\n", "\n"),
        }],
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("Locale zh-CN FTL key cleanroom-item-pane-section-header 值漂移：期望 模板示例，实际 模板示例-错误。 实际定义片段 [cleanroom-item-pane-section-header =\\n    .label = 模板示例-错误]。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "localization:item-pane-section-header-ftl-value-drift");
    assert.ok(result.hints.some((item) => String(item).includes("定义块")));
  });

  it("should prioritize localization diagnosis when locale ftl structure drifts", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: true,
        hasMainWindow: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
        localeFTLOK: false,
        localeFTLMissingCount: 0,
        localeFTLMissingEntries: [],
        localeFTLValueDriftCount: 0,
        localeFTLValueDriftEntries: [],
        localeFTLStructureDriftCount: 1,
        localeFTLStructureDriftEntries: [{
          locale: "zh-CN",
          key: "cleanroom-item-pane-section-header",
          expectedLine: "cleanroom-item-pane-section-header =\n    .label = 模板示例",
          actualLine: "cleanroom-item-pane-section-header = 模板示例",
        }],
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("Locale zh-CN FTL key cleanroom-item-pane-section-header 结构漂移：期望定义片段 [cleanroom-item-pane-section-header =\\n    .label = 模板示例]，实际定义片段 [cleanroom-item-pane-section-header = 模板示例]。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "localization:item-pane-section-header-ftl-structure-drift");
    assert.ok(result.hints.some((item) => String(item).includes("main.ftl")));
  });

  it("should prioritize lifecycle diagnosis when baseline registration chain is collectively missing", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        primaryActionResult: true,
        agentActionResult: true,
        itemPaneSections: 0,
        itemPaneInfoRows: 0,
        itemTreeColumns: 0,
        notifierActiveCount: 0,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.equal(result.primaryDiagnosis?.fingerprint, "lifecycle:baseline-registration-missing");
    assert.equal(result.primaryDiagnosis?.featureLabel, "生命周期与基线注册");
    assert.ok(result.primaryDiagnosis?.candidateFiles.includes("src/app/kernel.js"));
  });

  it("should prioritize config diagnosis when plugin is mounted but disabled", () => {
    const result = evaluateCycle({
      index: 1,
      checks: {
        pluginMounted: true,
        apiMounted: true,
        enabled: false,
        hasMainWindow: true,
        primaryActionResult: false,
        agentActionResult: false,
        itemPaneSections: 1,
        itemPaneInfoRows: 1,
        itemTreeColumns: 1,
        notifierActiveCount: 1,
      },
      tests: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      scenarios: {
        total: 1,
        passed: 1,
        failed: 0,
      },
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
      },
      visuals: {
        attempted: true,
        analysis: {
          ok: true,
          issues: [],
        },
      },
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.includes("插件当前为 disabled 状态。"));
    assert.equal(result.primaryDiagnosis?.fingerprint, "config:default-enabled-disabled");
    assert.ok(result.hints.some((item) => String(item).includes("fresh profile")));
    assert.ok(result.primaryDiagnosis?.candidateFiles.includes("config/addon.config.json"));
  });

  it("should render launch diagnostics for pre-RDP startup failures", () => {
    const markdown = buildE2EMarkdown({
      generatedAt: "2026-03-29T00:00:00.000Z",
      strategy: "hot",
      visualBaselineDir: "/tmp/visual-baseline",
      visualBaselineMode: "compare",
      passed: false,
      issues: ["Timed out waiting for Zotero RDP on port 4555."],
      hints: ["检查崩溃日志或 managed runtime profile。"],
      diagnostics: [],
      cycles: [],
      details: {
        runtimeSanitization: {
          managed: true,
          fresh: true,
          profileReset: true,
          dataReset: true,
          removedMarkers: [
            { marker: ".parentlock", path: "/tmp/.zotero-runtime/watch/profile/.parentlock" },
          ],
        },
        launchFailure: {
          kind: "rdp-connect-timeout",
          attemptCount: 3,
          connectDurationMs: 1500,
          childExit: null,
          lastConnectError: {
            code: "ECONNREFUSED",
            message: "connect ECONNREFUSED 127.0.0.1:4555",
          },
          processLogTail: [
            {
              at: "2026-03-29T00:00:01.000Z",
              source: "zotero.stderr",
              message: "startup begin",
            },
          ],
        },
      },
    });

    assert.ok(markdown.includes("## 启动诊断"));
    assert.ok(markdown.includes("rdp-connect-timeout"));
    assert.ok(markdown.includes("RDP 端口未在重试窗口内就绪"));
    assert.ok(markdown.includes("Runtime 清理"));
    assert.ok(markdown.includes("### 启动前进程日志尾部"));
    assert.ok(markdown.includes("startup begin"));
  });
});
