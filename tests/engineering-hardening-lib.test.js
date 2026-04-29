import { describe, it, assert } from "./test-framework.js";
import {
  buildPerformanceRecommendations,
  summarizeEngineeringHardening,
} from "../scripts/engineering-hardening-lib.mjs";

function kinds(recommendations) {
  return recommendations.map((item) => item.kind);
}

describe("Engineering Hardening Lib", () => {
  it("should build performance recommendations from the three diagnostic summaries", () => {
    const recommendations = buildPerformanceRecommendations({
      performanceBudget: {
        present: true,
        violationCount: 2,
        measuredActivityCount: 4,
        expectedActivityCount: 4,
        violationSummary: "preferences.openPane over budget",
      },
      cpuProfiler: {
        present: true,
        currentPluginCpuPercent: 35,
        unknownCpuPercent: 45,
        failedActivityCount: 1,
        topBucket: { label: "Current Plugin" },
        topAction: { actionId: "preferences.openPane", label: "Open Preferences" },
        reportJSON: "/tmp/agent-zotero-profile.json",
      },
      memoryDiagnostics: {
        present: true,
        failedActivityCount: 1,
        rssDeltaMb: 24,
        residentDeltaMb: 22,
        explicitDeltaMb: 12,
        topGrowingAction: { actionId: "reader.sidebar.selectView", label: "Reader Sidebar" },
        reportJSON: "/tmp/agent-zotero-memory.json",
      },
    });

    assert.deepEqual(kinds(recommendations), [
      "current-plugin-cpu-hotspot",
      "performance-budget-violations",
      "memory-growth",
      "sampling-incomplete",
      "unknown-cpu-attribution",
    ]);
    assert.equal(recommendations.every((item) => item.advisory === true), true);
    assert.equal(recommendations.every((item) => item.gateEffect === "non-blocking"), true);
    assert.ok(recommendations[0].reportRefs.includes("/tmp/agent-zotero-profile.json"));
  });

  it("should keep missing manual diagnostics as low severity advisory guidance", () => {
    const recommendations = buildPerformanceRecommendations({
      performanceBudget: {
        present: true,
        violationCount: 0,
      },
      cpuProfiler: {
        present: false,
        status: "missing",
      },
      memoryDiagnostics: {
        present: false,
        status: "missing",
      },
    });

    assert.equal(recommendations.length, 1);
    assert.equal(recommendations[0].kind, "diagnostics-missing");
    assert.equal(recommendations[0].severity, "low");
    assert.ok(recommendations[0].recommendedAction.includes("agent:zotero:profile"));
  });

  it("should include recommendations in the engineering hardening summary without changing advisory semantics", () => {
    const summary = summarizeEngineeringHardening({
      e2e: {
        performanceBudget: {
          present: true,
          status: "attention",
          statusLabel: "需关注",
          violationCount: 1,
          measuredActivityCount: 4,
          expectedActivityCount: 4,
          violationSummary: "reader.sidebar.selectView over budget",
        },
      },
      cpuProfiler: {
        present: true,
        advisory: true,
        gateEffect: "non-blocking",
        status: "passed",
        currentPluginCpuPercent: 0,
        unknownCpuPercent: 0,
        failedActivityCount: 0,
      },
      memoryDiagnostics: {
        present: true,
        advisory: true,
        gateEffect: "non-blocking",
        status: "passed",
        failedActivityCount: 0,
        rssDeltaMb: 0,
        residentDeltaMb: 0,
        explicitDeltaMb: 0,
      },
    });

    assert.equal(summary.performanceRecommendations.length, 1);
    assert.equal(summary.performanceRecommendations[0].kind, "performance-budget-violations");
    assert.ok(summary.summary.includes("性能建议 1 条"));
  });
});
