/**
 * Tests for Theme Manager feature
 * Theme manager factory, mount/unmount lifecycle, and mode synchronization
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createThemeManager, THEME_MODES } from "../../src/features/theme-manager.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(msg, details) { logs.push({ level: "debug", msg, details }); },
    getLogs() { return logs; },
  };
}

function createMockWindow(overrides = {}) {
  const docElement = {
    style: {},
    setAttribute() {},
    getAttribute() { return null; },
    dataset: {},
  };
  return {
    closed: false,
    document: {
      documentElement: docElement,
      readyState: "complete",
    },
    addEventListener() {},
    removeEventListener() {},
    ...overrides,
  };
}

function createMockElement(overrides = {}) {
  return {
    style: {},
    dataset: {},
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    ownerDocument: {
      defaultView: createMockWindow(),
      documentElement: { style: {} },
    },
    ...overrides,
  };
}

function createMockPrefs(values = {}) {
  return {
    get(key) {
      return values[key];
    },
  };
}

describe("ThemeManager", () => {
  it("should return object with all expected methods and THEME_MODES", () => {
    const manager = createThemeManager();
    assert.ok(manager.THEME_MODES, "should expose THEME_MODES");
    assert.typeOf(manager.getMode, "function", "should have getMode");
    assert.typeOf(manager.getMountedWindowCount, "function", "should have getMountedWindowCount");
    assert.typeOf(manager.getMountedElementCount, "function", "should have getMountedElementCount");
    assert.typeOf(manager.setMode, "function", "should have setMode");
    assert.typeOf(manager.syncFromPrefs, "function", "should have syncFromPrefs");
    assert.typeOf(manager.mountWindow, "function", "should have mountWindow");
    assert.typeOf(manager.unmountWindow, "function", "should have unmountWindow");
    assert.typeOf(manager.mountElement, "function", "should have mountElement");
    assert.typeOf(manager.unmountElement, "function", "should have unmountElement");
  });

  it("getMode should reflect initial mode from prefs", () => {
    const manager = createThemeManager({
      prefs: createMockPrefs({ themeMode: "dark" }),
    });
    assert.equal(manager.getMode(), "dark", "should read dark from prefs");
  });

  it("getMode should default to follow-host when prefs absent", () => {
    const manager = createThemeManager();
    assert.equal(manager.getMode(), "follow-host", "should default to follow-host");
  });

  it("setMode should update mode and return normalized value", () => {
    const manager = createThemeManager();
    assert.equal(manager.setMode("light"), "light", "should set light");
    assert.equal(manager.getMode(), "light", "getMode should return light");
    assert.equal(manager.setMode("invalid"), "follow-host", "should normalize invalid to follow-host");
  });

  it("syncFromPrefs should read mode from prefs", () => {
    const manager = createThemeManager({
      prefs: createMockPrefs({ themeMode: "dark" }),
    });
    manager.setMode("light");
    assert.equal(manager.syncFromPrefs(), "dark", "should sync to dark from prefs");
    assert.equal(manager.getMode(), "dark", "mode should be dark after sync");
  });

  it("mountWindow should mount documentElement and return cleanup", () => {
    const manager = createThemeManager();
    const win = createMockWindow();
    const cleanup = manager.mountWindow(win);
    assert.typeOf(cleanup, "function", "should return cleanup function");
    assert.equal(manager.getMountedWindowCount(), 1, "should track mounted window");
  });

  it("mountWindow should skip closed window", () => {
    const manager = createThemeManager();
    const win = createMockWindow({ closed: true });
    const cleanup = manager.mountWindow(win);
    assert.typeOf(cleanup, "function", "should return function even for closed window");
    assert.equal(manager.getMountedWindowCount(), 0, "should not mount closed window");
  });

  it("unmountWindow should remove mounted window", () => {
    const manager = createThemeManager();
    const win = createMockWindow();
    manager.mountWindow(win);
    assert.equal(manager.getMountedWindowCount(), 1, "should have 1 window");
    const result = manager.unmountWindow(win);
    assert.equal(result, true, "unmount should return true");
    assert.equal(manager.getMountedWindowCount(), 0, "should have 0 windows after unmount");
  });

  it("unmountWindow should return false for unknown window", () => {
    const manager = createThemeManager();
    const win = createMockWindow();
    assert.equal(manager.unmountWindow(win), false, "should return false for unknown window");
  });

  it("mountElement should mount element and return cleanup", () => {
    const manager = createThemeManager();
    const el = createMockElement();
    const cleanup = manager.mountElement(el);
    assert.typeOf(cleanup, "function", "should return cleanup function");
    assert.equal(manager.getMountedElementCount(), 1, "should track mounted element");
  });

  it("mountElement should skip unusable element", () => {
    const manager = createThemeManager();
    const cleanup = manager.mountElement(null);
    assert.typeOf(cleanup, "function", "should return function for null");
    assert.equal(manager.getMountedElementCount(), 0, "should not mount null");
  });

  it("unmountElement should remove mounted element", () => {
    const manager = createThemeManager();
    const el = createMockElement();
    manager.mountElement(el);
    assert.equal(manager.getMountedElementCount(), 1, "should have 1 element");
    const result = manager.unmountElement(el);
    assert.equal(result, true, "unmount should return true");
    assert.equal(manager.getMountedElementCount(), 0, "should have 0 elements after unmount");
  });

  it("setMode should refresh all mounted targets", () => {
    const manager = createThemeManager({ prefs: createMockPrefs({ themeMode: "light" }) });
    const win = createMockWindow();
    const el = createMockElement();
    manager.mountWindow(win);
    manager.mountElement(el);
    assert.equal(manager.getMode(), "light", "initial mode should be light");
    manager.setMode("dark");
    assert.equal(manager.getMode(), "dark", "mode should be dark after setMode");
  });

  it("double mountWindow should be idempotent", () => {
    const manager = createThemeManager();
    const win = createMockWindow();
    manager.mountWindow(win);
    manager.mountWindow(win);
    assert.equal(manager.getMountedWindowCount(), 1, "should still have only 1 window");
  });
});

await runTestsIfMain(import.meta.url);
