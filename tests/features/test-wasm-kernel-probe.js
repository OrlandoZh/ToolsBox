/**
 * Tests for WASM Kernel Probe feature
 * Module exports, probe factory, and status reporting
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  DEFAULT_WASM_PROBE_RELATIVE_PATH,
  DEFAULT_WASM_PROBE_WORKER_RELATIVE_PATH,
  createWasmKernelProbe,
} from "../../src/features/wasm-kernel-probe.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(msg, details) { logs.push({ level: "debug", msg, details }); },
    warn(msg, details) { logs.push({ level: "warn", msg, details }); },
    getLogs() { return logs; },
  };
}

describe("WasmKernelProbe", () => {
  it("DEFAULT_WASM_PROBE_RELATIVE_PATH is exported", () => {
    assert.typeOf(DEFAULT_WASM_PROBE_RELATIVE_PATH, "string", "should be a string");
    assert.ok(DEFAULT_WASM_PROBE_RELATIVE_PATH.length > 0, "should not be empty");
  });

  it("DEFAULT_WASM_PROBE_WORKER_RELATIVE_PATH is exported", () => {
    assert.typeOf(DEFAULT_WASM_PROBE_WORKER_RELATIVE_PATH, "string", "should be a string");
    assert.ok(DEFAULT_WASM_PROBE_WORKER_RELATIVE_PATH.length > 0, "should not be empty");
  });

  it("createWasmKernelProbe is a function", () => {
    assert.typeOf(createWasmKernelProbe, "function", "should be a function");
  });

  it("createWasmKernelProbe returns object with expected methods", () => {
    const probe = createWasmKernelProbe({
      config: { addonRef: "test" },
      logger: createMockLogger(),
    });

    assert.typeOf(probe.runProbe, "function", "should have runProbe");
    assert.typeOf(probe.runMainThreadProbe, "function", "should have runMainThreadProbe");
    assert.typeOf(probe.runWorkerProbe, "function", "should have runWorkerProbe");
    assert.typeOf(probe.deriveDigest, "function", "should have deriveDigest");
    assert.typeOf(probe.deriveUnlockToken, "function", "should have deriveUnlockToken");
    assert.typeOf(probe.close, "function", "should have close");
    assert.typeOf(probe.getStatus, "function", "should have getStatus");
  });

  it("getStatus returns structured status object", () => {
    const probe = createWasmKernelProbe({
      config: { addonRef: "test" },
      logger: createMockLogger(),
    });

    const status = probe.getStatus();
    assert.ok(typeof status === "object", "status should be object");
    assert.ok(typeof status.module === "object", "status.module should be object");
    assert.ok(typeof status.worker === "object", "status.worker should be object");
  });

  it("createWasmKernelProbe uses default addonRef", () => {
    const probe = createWasmKernelProbe({
      logger: createMockLogger(),
    });

    assert.typeOf(probe.runProbe, "function", "should work with minimal config");
  });

  it("createWasmKernelProbe accepts custom rootURI", () => {
    const probe = createWasmKernelProbe({
      config: { addonRef: "test" },
      logger: createMockLogger(),
      rootURI: "chrome://test/",
    });

    assert.typeOf(probe.runProbe, "function", "should accept rootURI");
  });

  it("createWasmKernelProbe accepts custom wasm paths", () => {
    const probe = createWasmKernelProbe({
      config: { addonRef: "test" },
      logger: createMockLogger(),
      wasmRelativePath: "custom.wasm",
      workerRelativePath: "custom-worker.js",
    });

    assert.typeOf(probe.runProbe, "function", "should accept custom paths");
  });

  it("close method is callable without throwing", () => {
    const probe = createWasmKernelProbe({
      config: { addonRef: "test" },
      logger: createMockLogger(),
    });

    assert.doesNotThrow(() => probe.close(), "close should not throw");
  });

  it("returned object has legacy entitlement methods", () => {
    const probe = createWasmKernelProbe({
      config: { addonRef: "test" },
      logger: createMockLogger(),
    });

    assert.typeOf(probe.prepareLegacyEntitlementRequest, "function", "should have prepareLegacyEntitlementRequest");
    assert.typeOf(probe.evaluateLegacyEntitlementResponse, "function", "should have evaluateLegacyEntitlementResponse");
    assert.typeOf(probe.runMainThreadLegacyEntitlementRequest, "function", "should have runMainThreadLegacyEntitlementRequest");
    assert.typeOf(probe.runWorkerLegacyEntitlementRequest, "function", "should have runWorkerLegacyEntitlementRequest");
  });

  it("returned object has main-thread and worker variants", () => {
    const probe = createWasmKernelProbe({
      config: { addonRef: "test" },
      logger: createMockLogger(),
    });

    assert.typeOf(probe.runMainThreadDigest, "function", "should have runMainThreadDigest");
    assert.typeOf(probe.runWorkerDigest, "function", "should have runWorkerDigest");
    assert.typeOf(probe.runMainThreadUnlockDerivation, "function", "should have runMainThreadUnlockDerivation");
    assert.typeOf(probe.runWorkerUnlockDerivation, "function", "should have runWorkerUnlockDerivation");
  });

  it("probe object is extensible and has correct key count", () => {
    const probe = createWasmKernelProbe({
      config: { addonRef: "test" },
      logger: createMockLogger(),
    });

    const keys = Object.keys(probe);
    assert.ok(keys.length >= 10, "should have at least 10 exported methods");
  });
});

await runTestsIfMain(import.meta.url);
