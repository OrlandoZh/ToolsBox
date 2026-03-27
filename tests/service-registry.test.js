import { describe, it, assert } from "./test-framework.js";
import { createServiceRegistry } from "../src/services/index.js";

describe("Service Registry", () => {
  it("should start and stop registered services", async () => {
    const calls = [];
    const registry = createServiceRegistry({});

    registry.register({
      id: "svc.a",
      label: "A",
      async start() {
        calls.push("start-a");
      },
      async stop() {
        calls.push("stop-a");
      },
      healthCheck() {
        return { ok: true, status: "healthy" };
      },
    });

    await registry.startAll({});
    let summary = registry.getSummary();
    assert.equal(summary.total, 1);
    assert.equal(summary.running, 1);
    assert.equal(summary.healthOK, true);
    assert.equal(summary.status, "healthy");

    await registry.stopAll({});
    summary = registry.getSummary();
    assert.equal(summary.running, 0);
    assert.equal(summary.status, "idle");
    assert.deepEqual(calls, ["start-a", "stop-a"]);
  });

  it("should mark service as degraded when health check fails", async () => {
    const registry = createServiceRegistry({});
    registry.register({
      id: "svc.bad",
      label: "Bad",
      async start() {},
      healthCheck() {
        return { ok: false, status: "degraded", details: "probe failed" };
      },
    });

    await registry.startAll({});
    const summary = registry.getSummary();
    assert.equal(summary.total, 1);
    assert.equal(summary.unhealthy, 1);
    assert.equal(summary.healthOK, false);
    assert.equal(summary.status, "degraded");
    assert.equal(summary.services[0].status, "degraded");
    assert.equal(summary.services[0].health.status, "degraded");
  });

  it("should support conditional disabled services", async () => {
    const registry = createServiceRegistry({});
    registry.register({
      id: "svc.disabled",
      enabledWhen() {
        return false;
      },
      async start() {
        throw new Error("should not start");
      },
    });

    await registry.startAll({});
    const summary = registry.getSummary();
    assert.equal(summary.total, 1);
    assert.equal(summary.enabled, 0);
    assert.equal(summary.status, "disabled");
    assert.equal(summary.services[0].status, "disabled");
  });
});
