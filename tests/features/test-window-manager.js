/**
 * Tests for Window Manager feature
 * Manages Zotero window lifecycle with mount/unmount tracking
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createWindowManager } from "../../src/features/window-manager.js";

function createMockLogger() {
  const logs = [];
  return {
    info(msg) { logs.push({ level: 'info', msg }); },
    warn(msg) { logs.push({ level: 'warn', msg }); },
    error(msg, meta) { logs.push({ level: 'error', msg, meta }); },
    debug(msg, meta) { logs.push({ level: 'debug', msg, meta }); },
    getLogs() { return logs; }
  };
}

function createMockWindow(overrides = {}) {
  return {
    closed: false,
    location: { href: 'chrome://zotero/content/zoteroPane.xhtml' },
    document: {},
    ...overrides
  };
}

function createMockMountFeature(shouldThrow = false) {
  return function mountWindowFeature(window) {
    if (shouldThrow) {
      throw new Error("Mount failed");
    }
    return () => {};
  };
}

describe("WindowManager", () => {
  it("should create object with expected methods", () => {
    const wm = createWindowManager({
      logger: createMockLogger(),
      mountWindowFeature: createMockMountFeature()
    });

    assert.typeOf(wm.onLoad, 'function', "should have onLoad function");
    assert.typeOf(wm.onUnload, 'function', "should have onUnload function");
    assert.typeOf(wm.remount, 'function', "should have remount function");
    assert.typeOf(wm.remountAll, 'function', "should have remountAll function");
    assert.typeOf(wm.loadAll, 'function', "should have loadAll function");
    assert.typeOf(wm.reset, 'function', "should have reset function");
  });

  it("should onLoad and track window", () => {
    const wm = createWindowManager({
      logger: createMockLogger(),
      mountWindowFeature: createMockMountFeature()
    });

    const window = createMockWindow();
    wm.onLoad(window);

    assert.ok(wm, "window manager should exist");
  });

  it("should be idempotent for same window onLoad", () => {
    let mountCount = 0;
    const wm = createWindowManager({
      logger: createMockLogger(),
      mountWindowFeature: (window) => {
        mountCount++;
        return () => {};
      }
    });

    const window = createMockWindow();
    wm.onLoad(window);
    wm.onLoad(window);

    assert.equal(mountCount, 1, "should only mount once for same window");
  });

  it("should onUnload cleanup window", () => {
    let cleanupCalled = false;
    const wm = createWindowManager({
      logger: createMockLogger(),
      mountWindowFeature: (window) => {
        return () => { cleanupCalled = true; };
      }
    });

    const window = createMockWindow();
    wm.onLoad(window);
    wm.onUnload(window);

    assert.ok(cleanupCalled, "cleanup should be called on unload");
  });

  it("should remount window", () => {
    let mountCount = 0;
    let cleanupCount = 0;
    const wm = createWindowManager({
      logger: createMockLogger(),
      mountWindowFeature: (window) => {
        mountCount++;
        return () => { cleanupCount++; };
      }
    });

    const window = createMockWindow();
    wm.onLoad(window);
    assert.equal(mountCount, 1, "should mount once initially");

    wm.remount(window);
    assert.equal(cleanupCount, 1, "should cleanup on remount");
    assert.equal(mountCount, 2, "should remount after cleanup");
  });

  it("should loadAll windows", () => {
    let mountCount = 0;
    const wm = createWindowManager({
      logger: createMockLogger(),
      mountWindowFeature: (window) => {
        mountCount++;
        return () => {};
      }
    });

    const windows = [createMockWindow(), createMockWindow(), createMockWindow()];
    wm.loadAll(windows);

    assert.equal(mountCount, 3, "should mount all 3 windows");
  });

  it("should reset all windows", () => {
    let cleanupCount = 0;
    const wm = createWindowManager({
      logger: createMockLogger(),
      mountWindowFeature: (window) => {
        return () => { cleanupCount++; };
      }
    });

    const windows = [createMockWindow(), createMockWindow()];
    wm.loadAll(windows);
    wm.reset();

    assert.equal(cleanupCount, 2, "should cleanup all windows on reset");
  });

  it("should handle mount failure gracefully", () => {
    const logger = createMockLogger();
    const wm = createWindowManager({
      logger,
      mountWindowFeature: createMockMountFeature(true)
    });

    const window = createMockWindow();
    assert.doesNotThrow(() => {
      wm.onLoad(window);
    }, "should not throw when mount fails");

    const errorLogs = logger.getLogs().filter(l => l.level === 'error');
    assert.ok(errorLogs.length > 0, "should log error when mount fails");
  });

  it("should handle cleanup failure gracefully", () => {
    const logger = createMockLogger();
    const wm = createWindowManager({
      logger,
      mountWindowFeature: (window) => {
        return () => { throw new Error("Cleanup failed"); };
      }
    });

    const window = createMockWindow();
    wm.onLoad(window);

    assert.doesNotThrow(() => {
      wm.onUnload(window);
    }, "should not throw when cleanup fails");

    const errorLogs = logger.getLogs().filter(l => l.level === 'error');
    assert.ok(errorLogs.length > 0, "should log error when cleanup fails");
  });

  it("should ignore closed windows", () => {
    let mountCount = 0;
    const wm = createWindowManager({
      logger: createMockLogger(),
      mountWindowFeature: (window) => {
        mountCount++;
        return () => {};
      }
    });

    const closedWindow = createMockWindow({ closed: true });
    wm.onLoad(closedWindow);

    assert.equal(mountCount, 0, "should not mount closed windows");
  });

  it("should ignore null window", () => {
    let mountCount = 0;
    const wm = createWindowManager({
      logger: createMockLogger(),
      mountWindowFeature: (window) => {
        mountCount++;
        return () => {};
      }
    });

    wm.onLoad(null);
    wm.onUnload(null);
    wm.remount(null);

    assert.equal(mountCount, 0, "should not mount null window");
  });

  it("should remountAll all active windows", () => {
    let mountCount = 0;
    let cleanupCount = 0;
    const wm = createWindowManager({
      logger: createMockLogger(),
      mountWindowFeature: (window) => {
        mountCount++;
        return () => { cleanupCount++; };
      }
    });

    const windows = [createMockWindow(), createMockWindow()];
    wm.loadAll(windows);
    assert.equal(mountCount, 2, "should mount 2 windows");

    wm.remountAll();
    assert.equal(cleanupCount, 2, "should cleanup all on remountAll");
    assert.equal(mountCount, 4, "should remount all windows");
  });
});

await runTestsIfMain(import.meta.url);
