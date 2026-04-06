import { describe, it, assert } from "./test-framework.js";
import { summarizeCapabilityCoverage } from "../scripts/agent-capability-lib.mjs";

describe("Agent Capability Lib", () => {
  it("should summarize capability coverage from scenario results", () => {
    const summary = summarizeCapabilityCoverage({
      cycles: [{
        index: 1,
        scenarios: {
          results: [
            { name: "baseline registration diagnostics", status: "passed" },
            { name: "settings schema and preference pane diagnostics", status: "passed" },
            { name: "preference pane control interaction", status: "passed" },
            { name: "multi-window mount diagnostics", status: "failed" },
          ],
        },
      }],
    });

    assert.equal(summary.observed, true);
    assert.ok(summary.total >= 8);
    assert.ok(summary.scenarioBoundTotal >= 7);
    assert.ok(summary.coveredCount >= 3);
    assert.ok(summary.passedCapabilityIds.includes("baseline-registration"));
    assert.ok(summary.passedCapabilityIds.includes("settings-governance"));
    assert.ok(summary.failedCapabilityIds.includes("multi-window-mount"));
    assert.ok(summary.uncoveredCapabilityIds.includes("reader-summary"));
  });
});
