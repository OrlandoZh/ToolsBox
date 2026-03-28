import { describe, it, assert } from "./test-framework.js";
import { createPluginKernel } from "../src/app/kernel.js";

function createMocks() {
  const calls = {
    insertFTLIfNeeded: 0,
    loadAll: 0,
    onLoad: 0,
    onUnload: 0,
    resetWindows: 0,
    ensureDefaults: 0,
    applySettings: 0,
    onSettingsChange: 0,
    addCleanup: 0,
    lifecycleReset: 0,
    registerBaselineFeatures: 0,
    info: 0,
    error: 0,
    startServices: 0,
    stopServices: 0,
  };

  const cleanups = [];
  const mainWindow = { id: "main-window" };

  const host = {
    listMainWindows() {
      return [mainWindow];
    },
    insertFTLIfNeeded() {
      calls.insertFTLIfNeeded += 1;
    },
  };

  const windows = {
    loadAll(list) {
      if (Array.isArray(list) && list[0] === mainWindow) {
        calls.loadAll += 1;
      }
    },
    onLoad() {
      calls.onLoad += 1;
    },
    onUnload() {
      calls.onUnload += 1;
    },
    reset() {
      calls.resetWindows += 1;
    },
  };

  const settings = {
    ensureDefaults() {
      calls.ensureDefaults += 1;
    },
    onChange(handler) {
      calls.onSettingsChange += 1;
      return () => handler("enabled");
    },
  };

  const lifecycle = {
    trackCleanup(cleanup) {
      calls.addCleanup += 1;
      cleanups.push(cleanup);
    },
    reset() {
      calls.lifecycleReset += 1;
      while (cleanups.length > 0) {
        const cleanup = cleanups.pop();
        if (typeof cleanup === "function") {
          cleanup();
        }
      }
    },
  };

  const logger = {
    debug() {},
    info() {
      calls.info += 1;
    },
    error() {
      calls.error += 1;
    },
  };

  return {
    calls,
    host,
    windows,
    settings,
    lifecycle,
    logger,
  };
}

describe("Plugin Kernel", () => {
  it("should start once and wire lifecycle side effects", async () => {
    const mocks = createMocks();
    const kernel = createPluginKernel({
      host: mocks.host,
      zotero: null,
      logger: mocks.logger,
      lifecycle: mocks.lifecycle,
      windows: mocks.windows,
      settings: mocks.settings,
      registerBaselineFeatures: async () => {
        mocks.calls.registerBaselineFeatures += 1;
      },
      applySettings: () => {
        mocks.calls.applySettings += 1;
      },
      onSettingsChange: () => {},
      addonName: "Cleanroom Template",
    });

    await kernel.start();
    await kernel.start();

    assert.equal(mocks.calls.ensureDefaults, 1);
    assert.equal(mocks.calls.applySettings, 1);
    assert.equal(mocks.calls.registerBaselineFeatures, 1);
    assert.equal(mocks.calls.insertFTLIfNeeded, 1);
    assert.equal(mocks.calls.loadAll, 1);
    assert.equal(kernel.getPhase(), "running");
  });

  it("should guard window load by running phase and cleanup on shutdown", async () => {
    const mocks = createMocks();
    const kernel = createPluginKernel({
      host: mocks.host,
      zotero: null,
      logger: mocks.logger,
      lifecycle: mocks.lifecycle,
      windows: mocks.windows,
      settings: mocks.settings,
      registerBaselineFeatures: async () => {
        mocks.calls.registerBaselineFeatures += 1;
      },
      applySettings: () => {
        mocks.calls.applySettings += 1;
      },
      onSettingsChange: () => {},
      addonName: "Cleanroom Template",
    });

    await kernel.onWindowLoad({});
    assert.equal(mocks.calls.onLoad, 0);

    await kernel.start();
    await kernel.onWindowLoad({});
    await kernel.onWindowUnload({});
    assert.equal(mocks.calls.onLoad, 1);
    assert.equal(mocks.calls.onUnload, 1);

    await kernel.shutdown();
    assert.equal(mocks.calls.resetWindows, 1);
    assert.equal(mocks.calls.lifecycleReset, 1);
    assert.equal(kernel.getPhase(), "idle");
  });

  it("should reset to idle after startup failure and allow retry", async () => {
    const mocks = createMocks();
    let failOnce = true;
    const kernel = createPluginKernel({
      host: mocks.host,
      zotero: null,
      logger: mocks.logger,
      lifecycle: mocks.lifecycle,
      windows: mocks.windows,
      settings: mocks.settings,
      startServices: async () => {
        mocks.calls.startServices += 1;
      },
      stopServices: async () => {
        mocks.calls.stopServices += 1;
      },
      registerBaselineFeatures: async () => {
        mocks.calls.registerBaselineFeatures += 1;
        if (failOnce) {
          failOnce = false;
          throw new Error("baseline registration failed");
        }
      },
      applySettings: () => {
        mocks.calls.applySettings += 1;
      },
      onSettingsChange: () => {},
      addonName: "Cleanroom Template",
    });

    let caught = null;
    try {
      await kernel.start();
    } catch (error) {
      caught = error;
    }

    assert.ok(caught instanceof Error);
    assert.equal(caught.message, "baseline registration failed");
    assert.equal(kernel.getPhase(), "idle");
    assert.equal(mocks.calls.resetWindows, 1);
    assert.equal(mocks.calls.lifecycleReset, 1);
    assert.equal(mocks.calls.stopServices, 1);
    assert.equal(mocks.calls.error, 1);
    assert.equal(kernel.getLifecycleTelemetry().lifecycleBoundaryEvents[0]?.event, "plugin.start.failed");

    await kernel.start();

    assert.equal(kernel.getPhase(), "running");
    assert.equal(mocks.calls.registerBaselineFeatures, 2);
    assert.equal(mocks.calls.startServices, 2);
  });

  it("should record startup cleanup boundary events when failed start cleanup also fails", async () => {
    const mocks = createMocks();
    const kernel = createPluginKernel({
      host: mocks.host,
      zotero: null,
      logger: mocks.logger,
      lifecycle: mocks.lifecycle,
      windows: mocks.windows,
      settings: mocks.settings,
      startServices: async () => {
        mocks.calls.startServices += 1;
      },
      stopServices: async () => {
        mocks.calls.stopServices += 1;
        throw new Error("cleanup stop failed");
      },
      registerBaselineFeatures: async () => {
        mocks.calls.registerBaselineFeatures += 1;
        throw new Error("baseline registration failed");
      },
      applySettings: () => {
        mocks.calls.applySettings += 1;
      },
      onSettingsChange: () => {},
      addonName: "Cleanroom Template",
    });

    let caught = null;
    try {
      await kernel.start();
    } catch (error) {
      caught = error;
    }

    assert.ok(caught instanceof Error);
    assert.equal(caught.message, "baseline registration failed");
    const telemetry = kernel.getLifecycleTelemetry();
    assert.equal(kernel.getPhase(), "idle");
    assert.equal(telemetry.lifecycleBoundaryEvents.length, 2);
    assert.equal(telemetry.lifecycleBoundaryEvents[0]?.event, "plugin.start.cleanup.failed");
    assert.equal(telemetry.lifecycleBoundaryEvents[1]?.event, "plugin.start.failed");
  });

  it("should cleanup shutdown state even when stopServices fails", async () => {
    const mocks = createMocks();
    const kernel = createPluginKernel({
      host: mocks.host,
      zotero: null,
      logger: mocks.logger,
      lifecycle: mocks.lifecycle,
      windows: mocks.windows,
      settings: mocks.settings,
      stopServices: async () => {
        mocks.calls.stopServices += 1;
        throw new Error("stop failed");
      },
      registerBaselineFeatures: async () => {
        mocks.calls.registerBaselineFeatures += 1;
      },
      applySettings: () => {
        mocks.calls.applySettings += 1;
      },
      onSettingsChange: () => {},
      addonName: "Cleanroom Template",
    });

    await kernel.start();

    let caught = null;
    try {
      await kernel.shutdown();
    } catch (error) {
      caught = error;
    }

    assert.ok(caught instanceof Error);
    assert.equal(caught.message, "stop failed");
    assert.equal(kernel.getPhase(), "idle");
    assert.equal(mocks.calls.resetWindows, 1);
    assert.equal(mocks.calls.lifecycleReset, 1);
    assert.equal(mocks.calls.error, 1);
    assert.equal(kernel.getLifecycleTelemetry().lifecycleBoundaryEvents[0]?.event, "plugin.shutdown.failed");
  });

  it("should capture lifecycle timings and slow-stage telemetry", async () => {
    const mocks = createMocks();
    const telemetryUpdates = [];
    const originalNow = Date.now;
    const timestamps = [100, 150, 2450, 3600, 4000, 6505];
    let index = 0;
    Date.now = () => {
      const value = timestamps[Math.min(index, timestamps.length - 1)];
      index += 1;
      return value;
    };

    try {
      const kernel = createPluginKernel({
        host: mocks.host,
        zotero: null,
        logger: mocks.logger,
        lifecycle: mocks.lifecycle,
        windows: mocks.windows,
        settings: mocks.settings,
        registerBaselineFeatures: async () => {
          mocks.calls.registerBaselineFeatures += 1;
        },
        applySettings: () => {
          mocks.calls.applySettings += 1;
        },
        onSettingsChange: () => {},
        addonName: "Cleanroom Template",
        onLifecycleTelemetryChange(summary) {
          telemetryUpdates.push(summary);
        },
      });

      await kernel.start();

      const startedTelemetry = kernel.getLifecycleTelemetry();
      assert.equal(startedTelemetry.hostReadyDurationMs, 2300);
      assert.equal(startedTelemetry.startupDurationMs, 3500);
      assert.equal(startedTelemetry.lifecycleSlowOperationCount, 2);
      assert.equal(startedTelemetry.lifecycleSlowThresholdMs, 2000);
      assert.equal(startedTelemetry.lifecycleLastSlowStage, "startup");

      await kernel.shutdown();

      const stoppedTelemetry = kernel.getLifecycleTelemetry();
      assert.equal(stoppedTelemetry.shutdownDurationMs, 2505);
      assert.equal(stoppedTelemetry.lifecycleSlowOperationCount, 3);
      assert.equal(stoppedTelemetry.lifecycleLastSlowStage, "shutdown");
      assert.ok(telemetryUpdates.length >= 3);
    } finally {
      Date.now = originalNow;
    }
  });
});
