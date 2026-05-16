import { describe, it, assert } from "./test-framework.js";
import { pollPluginReady } from "../scripts/zotero-agent-runtime-lib.mjs";

function createReadinessRdp(states) {
  const queue = states.slice();
  return {
    calls: 0,
    async evaluateInChrome() {
      this.calls += 1;
      if (queue.length === 0) {
        return false;
      }
      return queue.shift();
    },
  };
}

describe("Zotero Agent Runtime Lib", () => {
  it("should require plugin readiness to remain stable when requested", async () => {
    const rdp = createReadinessRdp([true, false]);

    const ready = await pollPluginReady({
      rdp,
      instanceKey: "ToolsBox",
      timeoutMs: 100,
      pollIntervalMs: 1,
      stableDurationMs: 1,
    });

    assert.equal(ready, false);
    assert.equal(rdp.calls, 2);
  });

  it("should pass stable plugin readiness after the confirmation sample", async () => {
    const rdp = createReadinessRdp([true, true]);

    const ready = await pollPluginReady({
      rdp,
      instanceKey: "ToolsBox",
      timeoutMs: 100,
      pollIntervalMs: 1,
      stableDurationMs: 1,
    });

    assert.equal(ready, true);
    assert.equal(rdp.calls, 2);
  });
});
