import { describe, it, assert } from "./test-framework.js";
import { createRuntimeCapabilityState } from "../src/app/runtime-capabilities.js";

describe("Runtime Capabilities", () => {
  it("should normalize bootstrap capability reports", () => {
    const state = createRuntimeCapabilityState({
      runtime: {
        rootURI: "chrome://cleanroomtemplate/",
        capabilityReport: {
          generatedAt: "2026-03-20T00:00:00.000Z",
          whitelistVersion: 2,
          status: "healthy",
          injected: [
            { key: "Zotero", required: true, source: "bootstrap-global" },
            { key: "fetch", required: false, source: "global" },
          ],
          skipped: [
            { key: "indexedDB", required: false, source: "global", reason: "source-unavailable" },
          ],
          missingRequired: [],
        },
      },
    });

    assert.equal(state.rootURI, "chrome://cleanroomtemplate/");
    assert.equal(state.capabilitySummary.ok, true);
    assert.equal(state.capabilitySummary.injectedCount, 2);
    assert.equal(state.capabilitySummary.optionalSkippedCount, 1);
    assert.equal(state.cloneCapabilityReport().whitelistVersion, 2);
  });

  it("should mark missing required capabilities as degraded", () => {
    const state = createRuntimeCapabilityState({
      runtime: {
        capabilityReport: {
          skipped: [
            { key: "Zotero", required: true, source: "bootstrap-global", reason: "source-unavailable" },
          ],
          missingRequired: ["Zotero"],
        },
      },
    });

    assert.equal(state.capabilitySummary.ok, false);
    assert.equal(state.capabilitySummary.status, "degraded");
    assert.deepEqual(state.capabilitySummary.missingRequired, ["Zotero"]);
  });
});
