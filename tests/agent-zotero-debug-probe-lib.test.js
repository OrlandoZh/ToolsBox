import { describe, it, assert } from "./test-framework.js";
import {
  deriveSmartDebugProbeCandidates,
  parseDebugProbeArgs,
  selectDebugProbeBundleIDs,
  summarizeDebugProbeReport,
} from "../scripts/agent-zotero-debug-probe-lib.mjs";

describe("Agent Zotero Debug Probe Lib", () => {
  it("should parse default args into smart mode", () => {
    const options = parseDebugProbeArgs([]);
    assert.equal(options.mode, "smart");
    assert.deepEqual(options.probeIDs, []);
    assert.equal(options.fresh, false);
    assert.equal(options.skipBuild, false);
  });

  it("should parse explicit probes and force mode", () => {
    const options = parseDebugProbeArgs([
      "--mode",
      "force",
      "--probe",
      "reader-sidebar-view-closure",
      "--probe",
      "preference-control-writeback",
      "--fresh",
      "--skip-build",
    ]);

    assert.equal(options.mode, "force");
    assert.deepEqual(options.probeIDs, [
      "reader-sidebar-view-closure",
      "preference-control-writeback",
    ]);
    assert.equal(options.fresh, true);
    assert.equal(options.skipBuild, true);
  });

  it("should derive smart candidates from failed scenarios and recent errors", () => {
    const selection = deriveSmartDebugProbeCandidates({
      cycles: [
        {
          scenarios: {
            results: [
              { name: "reader surface smoke", status: "failed" },
              { name: "preference pane control interaction", status: "failed" },
            ],
          },
          logs: {
            recentErrors: [
              { message: "pdfDocument is null -> getOutline2" },
            ],
          },
        },
      ],
    });

    assert.deepEqual(selection.failedScenarioNames, [
      "reader surface smoke",
      "preference pane control interaction",
    ]);
    assert.equal(selection.candidates.length, 2);
    assert.ok(selection.candidates.some((entry) => entry.probeId === "reader-sidebar-view-closure"));
    assert.ok(selection.candidates.some((entry) => entry.probeId === "preference-control-writeback"));
  });

  it("should select all bundles in force mode without explicit probes", () => {
    const selection = selectDebugProbeBundleIDs({
      mode: "force",
      probeIDs: [],
      e2eReport: null,
    });

    assert.equal(selection.selectionSource, "force-all");
    assert.deepEqual(selection.selectedProbeIDs, [
      "preference-control-writeback",
      "reader-sidebar-view-closure",
    ]);
  });

  it("should summarize raw debug probe reports with latest e2e freshness", () => {
    const summary = summarizeDebugProbeReport({
      generatedAt: "2026-04-17T10:00:00.000Z",
      mode: "smart",
      selectionSource: "smart",
      selectedProbeIDs: ["reader-sidebar-view-closure"],
      smartSelection: {
        candidates: [
          {
            probeId: "reader-sidebar-view-closure",
            reasons: ["failed-scenario", "recent-error-log"],
          },
        ],
      },
      status: "completed",
      executed: [
        {
          probeId: "reader-sidebar-view-closure",
          status: "completed",
          promotion: "interaction-proved",
        },
      ],
    }, {
      now: "2026-04-17T10:10:00.000Z",
      e2eGeneratedAt: "2026-04-17T09:59:00.000Z",
    });

    assert.equal(summary.present, true);
    assert.equal(summary.status, "completed");
    assert.equal(summary.selectedProbeCount, 1);
    assert.equal(summary.executedProbeCount, 1);
    assert.equal(summary.failedProbeCount, 0);
    assert.deepEqual(summary.matchedReasonKinds, ["failed-scenario", "recent-error-log"]);
    assert.deepEqual(summary.promotions, ["interaction-proved"]);
    assert.equal(summary.freshForLatestE2E, true);
  });

  it("should keep normalized debug probe summaries and recompute stale freshness", () => {
    const summary = summarizeDebugProbeReport({
      present: true,
      generatedAt: "2026-04-17T09:00:00.000Z",
      status: "failed",
      executedProbeCount: 1,
      failedProbeCount: 1,
      selectedProbeCount: 1,
      promotions: [],
      summary: "已执行 1 个 bundle；失败 1 个。",
    }, {
      now: "2026-04-17T10:00:00.000Z",
      e2eGeneratedAt: "2026-04-17T09:30:00.000Z",
    });

    assert.equal(summary.present, true);
    assert.equal(summary.statusLabel, "失败");
    assert.equal(summary.freshForLatestE2E, false);
    assert.equal(summary.ageText, "1 小时");
  });
});
