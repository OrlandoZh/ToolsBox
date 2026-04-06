import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

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

function createFakeElement(id) {
  return {
    id,
    dataset: {},
    attributes: {},
    style: createFakeStyle(),
    textContent: "",
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === "label" || name === "value") {
        this[name] = String(value);
      }
    },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === "label" || name === "value") {
        delete this[name];
      }
    },
    getAttribute(name) {
      return this.attributes[name] || null;
    },
  };
}

function loadContentScript(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf-8");
}

function createHarness({ themeMode = "follow-host", hostDark = false } = {}) {
  const prefName = "extensions.zotero.cleanroomtemplate.themeMode";
  const prefValues = new Map([[prefName, themeMode]]);
  const observers = new Map();
  const listeners = new Map();
  let addObserverCount = 0;
  let removeObserverCount = 0;

  const root = {
    className: "cleanroom-pref-root",
    dataset: {},
    attributes: {},
    style: createFakeStyle(),
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
  };
  const prefElement = {
    name: prefName,
    getAttribute(name) {
      return name === "name" ? prefName : null;
    },
  };
  const localizedElements = new Map([
    ["cleanroom-pref-caption", createFakeElement("cleanroom-pref-caption")],
    ["cleanroom-enabled", createFakeElement("cleanroom-enabled")],
    ["cleanroom-pref-menu-section", createFakeElement("cleanroom-pref-menu-section")],
    ["cleanroom-pref-menu-label-text", createFakeElement("cleanroom-pref-menu-label-text")],
    ["cleanroom-pref-menu-hint", createFakeElement("cleanroom-pref-menu-hint")],
    ["cleanroom-pref-logging-section", createFakeElement("cleanroom-pref-logging-section")],
    ["cleanroom-pref-log-level-text", createFakeElement("cleanroom-pref-log-level-text")],
    ["cleanroom-pref-theme-section", createFakeElement("cleanroom-pref-theme-section")],
    ["cleanroom-pref-theme-mode-text", createFakeElement("cleanroom-pref-theme-mode-text")],
    ["cleanroom-pref-theme-follow-host", createFakeElement("cleanroom-pref-theme-follow-host")],
    ["cleanroom-pref-theme-light", createFakeElement("cleanroom-pref-theme-light")],
    ["cleanroom-pref-theme-dark", createFakeElement("cleanroom-pref-theme-dark")],
    ["cleanroom-pref-theme-hint", createFakeElement("cleanroom-pref-theme-hint")],
  ]);
  const translatedRoots = [];
  const mediaListeners = new Set();
  const mediaQueryList = {
    matches: Boolean(hostDark),
    addEventListener(type, listener) {
      if (type === "change") {
        mediaListeners.add(listener);
      }
    },
    removeEventListener(type, listener) {
      if (type === "change") {
        mediaListeners.delete(listener);
      }
    },
    emit(nextMatches) {
      this.matches = Boolean(nextMatches);
      mediaListeners.forEach((listener) => {
        listener({
          matches: this.matches,
          media: "(prefers-color-scheme: dark)",
        });
      });
    },
  };

  const context = {
    console,
    setTimeout,
    clearTimeout,
  };

  context.globalThis = context;
  context.window = context;
  context.document = {
    readyState: "complete",
    documentElement: {
      dataset: {},
      attributes: {},
      style: createFakeStyle(),
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
    },
    querySelector(selector) {
      return selector === ".cleanroom-pref-root" ? root : null;
    },
    getElementById(id) {
      if (id === "pref-themeMode") {
        return prefElement;
      }
      return localizedElements.get(id) || null;
    },
    addEventListener() {},
    l10n: {
      translateFragment(fragment) {
        translatedRoots.push(fragment);
        return Promise.resolve();
      },
    },
  };
  root.ownerDocument = {
    defaultView: context,
  };
  context.matchMedia = function matchMedia() {
    return mediaQueryList;
  };
  context.addEventListener = function addEventListener(type, handler) {
    const items = listeners.get(type) || [];
    items.push(handler);
    listeners.set(type, items);
  };
  context.removeEventListener = function removeEventListener(type, handler) {
    const items = listeners.get(type) || [];
    listeners.set(type, items.filter((item) => item !== handler));
  };
  context.Services = {
    prefs: {
      getStringPref(key, fallback) {
        return prefValues.has(key) ? prefValues.get(key) : fallback;
      },
      setStringPref(key, value) {
        prefValues.set(key, String(value));
        const observer = observers.get(key);
        if (observer) {
          observer.observe(null, "nsPref:changed", key);
        }
      },
      addObserver(key, observer) {
        addObserverCount += 1;
        observers.set(key, observer);
      },
      removeObserver(key, observer) {
        removeObserverCount += 1;
        if (observers.get(key) === observer) {
          observers.delete(key);
        }
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(loadContentScript("addon-static/content/theme.js"), context);
  vm.runInContext(loadContentScript("addon-static/content/preferences.js"), context);

  return {
    context,
    prefValues,
    root,
    localizedElements,
    translatedRoots,
    mediaQueryList,
    get addObserverCount() {
      return addObserverCount;
    },
    get removeObserverCount() {
      return removeObserverCount;
    },
    get unloadListenerCount() {
      return (listeners.get("unload") || []).length;
    },
    emitUnload() {
      (listeners.get("unload") || []).slice().forEach((listener) => listener());
    },
  };
}

describe("Preference Theme Script", () => {
  it("should normalize legacy auto theme mode to follow-host", () => {
    const harness = createHarness({
      themeMode: "auto",
      hostDark: false,
    });

    const result = harness.context.initCleanroomPreferences();

    assert.equal(result.ok, true);
    assert.equal(harness.prefValues.get("extensions.zotero.cleanroomtemplate.themeMode"), "follow-host");
    assert.equal(harness.root.dataset.cleanroomThemeMode, "follow-host");
    assert.equal(harness.root.dataset.cleanroomTheme, "light");
    assert.equal(harness.root.style.getPropertyValue("color-scheme"), "light dark");
  });

  it("should apply forced dark tokens for explicit dark mode", () => {
    const harness = createHarness({
      themeMode: "dark",
      hostDark: false,
    });

    const result = harness.context.initCleanroomPreferences();

    assert.equal(result.mode, "dark");
    assert.equal(harness.root.dataset.cleanroomThemeMode, "dark");
    assert.equal(harness.root.dataset.cleanroomTheme, "dark");
    assert.equal(harness.root.style.getPropertyValue("--cleanroom-theme-background"), "#0f172a");
    assert.equal(harness.root.style.getPropertyValue("color-scheme"), "dark");
  });

  it("should update follow-host mode when Zotero theme changes", () => {
    const harness = createHarness({
      themeMode: "follow-host",
      hostDark: false,
    });

    harness.context.initCleanroomPreferences();
    assert.equal(harness.root.dataset.cleanroomTheme, "light");

    harness.mediaQueryList.emit(true);

    assert.equal(harness.root.dataset.cleanroomTheme, "dark");
    assert.equal(harness.root.style.getPropertyValue("--cleanroom-theme-background"), "");
    harness.emitUnload();
  });

  it("should reinitialize cleanly without accumulating observers", () => {
    const harness = createHarness({
      themeMode: "follow-host",
      hostDark: false,
    });

    harness.context.initCleanroomPreferences();
    const firstUnloadCount = harness.unloadListenerCount;
    harness.context.initCleanroomPreferences({
      bridge: {
        addonRef: "cleanroomtemplate",
        pluginID: "cleanroom-template@example.com",
        instanceKey: "CleanroomTemplate",
      },
    });

    assert.equal(harness.addObserverCount, 2);
    assert.equal(harness.removeObserverCount, 1);
    assert.equal(firstUnloadCount, 1);
    assert.equal(harness.unloadListenerCount, 1);
  });

  it("should prefer explicit bridge input and not scan Zotero globals", () => {
    const harness = createHarness({
      themeMode: "follow-host",
      hostDark: false,
    });

    Object.defineProperty(harness.context, "Zotero", {
      configurable: true,
      get() {
        throw new Error("preferences controller should not scan Zotero globals");
      },
    });
    harness.context.__CLEANROOM_PREFERENCE_BRIDGE__ = {
      addonRef: "window-bridge",
      pluginID: "window-plugin",
      instanceKey: "WindowBridge",
    };

    const result = harness.context.initCleanroomPreferences({
      bridge: {
        addonRef: "explicit-bridge",
        pluginID: "explicit-plugin",
        instanceKey: "ExplicitBridge",
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.bridge, {
      addonRef: "explicit-bridge",
      pluginID: "explicit-plugin",
      instanceKey: "ExplicitBridge",
    });
  });

  it("should localize preference pane copy from bridge strings and request fluent translation", () => {
    const harness = createHarness({
      themeMode: "follow-host",
      hostDark: false,
    });

    const result = harness.context.initCleanroomPreferences({
      bridge: {
        strings: {
          "cleanroom-pref-caption": "Cleanroom 模板首选项",
          "cleanroom-pref-enabled": "启用插件",
          "cleanroom-pref-menu-section": "菜单",
          "cleanroom-pref-menu-label": "菜单标签",
          "cleanroom-pref-menu-hint": "留空使用默认本地化文案。",
          "cleanroom-pref-logging-section": "日志",
          "cleanroom-pref-log-level": "日志等级",
          "cleanroom-pref-theme-section": "主题",
          "cleanroom-pref-theme-mode": "主题模式",
          "cleanroom-pref-theme-follow-host": "跟随 Zotero",
          "cleanroom-pref-theme-light": "浅色",
          "cleanroom-pref-theme-dark": "深色",
          "cleanroom-pref-theme-hint": "仅作用于插件拥有的界面。",
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.bridgeLocalizationApplied, true);
    assert.equal(result.fluentTranslationRequested, true);
    assert.equal(result.localizedCount, 13);
    assert.equal(harness.localizedElements.get("cleanroom-pref-caption").attributes.label, "Cleanroom 模板首选项");
    assert.equal(harness.localizedElements.get("cleanroom-enabled").attributes.label, "启用插件");
    assert.equal(harness.localizedElements.get("cleanroom-pref-menu-label-text").attributes.value, "菜单标签");
    assert.equal(harness.localizedElements.get("cleanroom-pref-menu-hint").textContent, "留空使用默认本地化文案。");
    assert.equal(harness.localizedElements.get("cleanroom-pref-theme-follow-host").attributes.label, "跟随 Zotero");
    assert.equal(harness.translatedRoots.length, 1);
    assert.equal(harness.translatedRoots[0], harness.root);
  });

  it("should keep preferences.xhtml free of XML declaration", () => {
    const source = fs.readFileSync(
      path.join(projectRoot, "addon-static", "content", "preferences.xhtml"),
      "utf-8",
    );

    assert.equal(source.startsWith("<?xml"), false);
  });
});
