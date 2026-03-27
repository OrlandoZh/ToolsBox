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
});
