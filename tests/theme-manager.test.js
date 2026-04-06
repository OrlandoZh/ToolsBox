import { describe, it, assert } from "./test-framework.js";
import {
  applyThemeToElement,
  clearThemeFromElement,
  normalizeThemeMode,
  observeThemeOnElement,
} from "../src/features/theme-contract.js";
import { createThemeManager } from "../src/features/theme-manager.js";

function createFakeStyle() {
  const values = {};
  return {
    values,
    setProperty(name, value) {
      values[name] = String(value);
    },
    removeProperty(name) {
      delete values[name];
    },
    getPropertyValue(name) {
      return values[name] || "";
    },
  };
}

function createFakeElement(targetWindow = null) {
  return {
    dataset: {},
    attributes: {},
    style: createFakeStyle(),
    ownerDocument: targetWindow ? { defaultView: targetWindow } : null,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
  };
}

function createFakeWindow(initialMatches = false) {
  const listeners = new Set();
  const mediaQueryList = {
    matches: Boolean(initialMatches),
    addEventListener(type, listener) {
      if (type === "change") {
        listeners.add(listener);
      }
    },
    removeEventListener(type, listener) {
      if (type === "change") {
        listeners.delete(listener);
      }
    },
    emit(nextMatches) {
      this.matches = Boolean(nextMatches);
      listeners.forEach((listener) => {
        listener({
          matches: this.matches,
          media: "(prefers-color-scheme: dark)",
        });
      });
    },
  };

  const targetWindow = {
    closed: false,
    matchMedia() {
      return mediaQueryList;
    },
  };
  const root = createFakeElement(targetWindow);
  targetWindow.document = {
    documentElement: root,
  };

  return {
    window: targetWindow,
    root,
    mediaQueryList,
    getListenerCount() {
      return listeners.size;
    },
  };
}

describe("Theme Manager", () => {
  it("should normalize follow-host theme modes and keep auto as a legacy alias", () => {
    assert.equal(normalizeThemeMode("follow-host"), "follow-host");
    assert.equal(normalizeThemeMode("LIGHT"), "light");
    assert.equal(normalizeThemeMode("auto"), "follow-host");
    assert.equal(normalizeThemeMode("unknown"), "follow-host");
  });

  it("should apply forced dark theme tokens to an element", () => {
    const target = createFakeElement();
    const state = applyThemeToElement(target, {
      mode: "dark",
    });

    assert.equal(state.mode, "dark");
    assert.equal(state.effectiveTheme, "dark");
    assert.equal(target.dataset.cleanroomThemeMode, "dark");
    assert.equal(target.dataset.cleanroomTheme, "dark");
    assert.equal(target.style.getPropertyValue("--cleanroom-theme-background"), "#0f172a");
    assert.equal(target.style.getPropertyValue("color-scheme"), "dark");
  });

  it("should follow host theme changes without keeping forced tokens", () => {
    const harness = createFakeWindow(false);
    const target = createFakeElement(harness.window);
    const observer = observeThemeOnElement(target, {
      window: harness.window,
      getMode() {
        return "follow-host";
      },
    });

    assert.equal(target.dataset.cleanroomThemeMode, "follow-host");
    assert.equal(target.dataset.cleanroomTheme, "light");
    assert.equal(target.style.getPropertyValue("--cleanroom-theme-background"), "");
    assert.equal(target.style.getPropertyValue("color-scheme"), "light dark");

    harness.mediaQueryList.emit(true);

    assert.equal(target.dataset.cleanroomTheme, "dark");
    assert.equal(target.style.getPropertyValue("--cleanroom-theme-background"), "");

    observer.dispose();
    assert.equal(harness.getListenerCount(), 0);
  });

  it("should clear theme attributes and forced tokens from an element", () => {
    const target = createFakeElement();
    applyThemeToElement(target, {
      mode: "light",
    });

    assert.equal(target.dataset.cleanroomTheme, "light");
    assert.equal(target.style.getPropertyValue("--cleanroom-theme-background"), "#f6f8fc");

    clearThemeFromElement(target);

    assert.equal(target.dataset.cleanroomTheme, undefined);
    assert.equal(target.attributes["data-cleanroom-theme"], undefined);
    assert.equal(target.style.getPropertyValue("--cleanroom-theme-background"), "");
    assert.equal(target.style.getPropertyValue("color-scheme"), "");
  });

  it("should mount windows and elements through the same theme contract", () => {
    const harness = createFakeWindow(false);
    const surface = createFakeElement(harness.window);
    let currentMode = "follow-host";
    const manager = createThemeManager({
      prefs: {
        get() {
          return currentMode;
        },
      },
    });

    manager.mountWindow(harness.window);
    manager.mountElement(surface, { window: harness.window });

    assert.equal(manager.getMountedWindowCount(), 1);
    assert.equal(manager.getMountedElementCount(), 1);
    assert.equal(harness.getListenerCount(), 2);
    assert.equal(harness.root.dataset.cleanroomThemeMode, "follow-host");
    assert.equal(surface.dataset.cleanroomThemeMode, "follow-host");
    assert.equal(harness.root.dataset.cleanroomTheme, "light");
    assert.equal(surface.dataset.cleanroomTheme, "light");

    currentMode = "dark";
    manager.syncFromPrefs();

    assert.equal(harness.root.dataset.cleanroomTheme, "dark");
    assert.equal(surface.dataset.cleanroomTheme, "dark");
    assert.equal(surface.style.getPropertyValue("--cleanroom-theme-background"), "#0f172a");

    manager.unmountElement(surface);
    manager.unmountWindow(harness.window);

    assert.equal(manager.getMountedWindowCount(), 0);
    assert.equal(manager.getMountedElementCount(), 0);
    assert.equal(harness.getListenerCount(), 0);
  });
});
