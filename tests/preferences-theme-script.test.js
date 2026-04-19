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
  const listeners = new Map();
  return {
    id,
    dataset: {},
    attributes: {},
    style: createFakeStyle(),
    textContent: "",
    value: "",
    checked: false,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === "label" || name === "value" || name === "name") {
        this[name] = String(value);
      }
      if (name === "checked") {
        this.checked = String(value) === "true";
      }
    },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === "label" || name === "value" || name === "name") {
        delete this[name];
      }
      if (name === "checked") {
        this.checked = false;
      }
    },
    getAttribute(name) {
      return this.attributes[name] || null;
    },
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    removeEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      listeners.set(type, handlers.filter((item) => item !== handler));
    },
    dispatch(type) {
      const handlers = listeners.get(type) || [];
      handlers.slice().forEach((handler) => handler({ type, target: this }));
    },
  };
}

function loadContentScript(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf-8");
}

function createHarness({
  themeMode = "follow-host",
  hostDark = false,
  rootClientWidth = 720,
  rootScrollWidth = rootClientWidth,
} = {}) {
  const prefNames = {
    enabled: "extensions.zotero.cleanroomtemplate.enabled",
    menuLabel: "extensions.zotero.cleanroomtemplate.menuLabel",
    logLevel: "extensions.zotero.cleanroomtemplate.logLevel",
    themeMode: "extensions.zotero.cleanroomtemplate.themeMode",
  };
  const prefValues = new Map([
    [prefNames.enabled, true],
    [prefNames.menuLabel, ""],
    [prefNames.logLevel, "info"],
    [prefNames.themeMode, themeMode],
  ]);
  const observers = new Map();
  const listeners = new Map();
  const resizeObservers = new Set();
  let addObserverCount = 0;
  let removeObserverCount = 0;
  let resizeObserverObserveCount = 0;
  let resizeObserverDisconnectCount = 0;

  const fieldRows = [
    createFakeElement("field-row-1"),
    createFakeElement("field-row-2"),
    createFakeElement("field-row-3"),
  ];

  const root = {
    className: "cleanroom-pref-root",
    dataset: {},
    attributes: {},
    style: createFakeStyle(),
    clientWidth: rootClientWidth,
    scrollWidth: rootScrollWidth,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    querySelectorAll(selector) {
      return selector === ".cleanroom-pref-field-row" ? fieldRows : [];
    },
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        width: this.clientWidth,
        height: 320,
      };
    },
  };
  const prefElements = new Map([
    ["pref-enabled", Object.assign(createFakeElement("pref-enabled"), { name: prefNames.enabled })],
    ["pref-menuLabel", Object.assign(createFakeElement("pref-menuLabel"), { name: prefNames.menuLabel })],
    ["pref-logLevel", Object.assign(createFakeElement("pref-logLevel"), { name: prefNames.logLevel })],
    ["pref-themeMode", Object.assign(createFakeElement("pref-themeMode"), { name: prefNames.themeMode })],
  ]);
  prefElements.forEach((element) => {
    element.setAttribute("name", element.name);
  });
  const controls = new Map([
    ["cleanroom-enabled", Object.assign(createFakeElement("cleanroom-enabled"), { checked: true })],
    ["cleanroom-menu-label", Object.assign(createFakeElement("cleanroom-menu-label"), { value: "" })],
    ["cleanroom-log-level", Object.assign(createFakeElement("cleanroom-log-level"), { value: "info" })],
    ["cleanroom-theme-mode", Object.assign(createFakeElement("cleanroom-theme-mode"), { value: themeMode })],
  ]);
  const localizedElements = new Map([
    ["cleanroom-pref-caption", createFakeElement("cleanroom-pref-caption")],
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
  context.ResizeObserver = class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      resizeObservers.add(this);
    }

    observe(target) {
      resizeObserverObserveCount += 1;
      this.targets.add(target);
    }

    disconnect() {
      resizeObserverDisconnectCount += 1;
      this.targets.clear();
      resizeObservers.delete(this);
    }
  };
  context.requestAnimationFrame = function requestAnimationFrame(callback) {
    callback();
    return 1;
  };
  context.cancelAnimationFrame = function cancelAnimationFrame() {};
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
      if (prefElements.has(id)) {
        return prefElements.get(id);
      }
      if (controls.has(id)) {
        return controls.get(id);
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
      getBoolPref(key, fallback) {
        return prefValues.has(key) ? Boolean(prefValues.get(key)) : Boolean(fallback);
      },
      getStringPref(key, fallback) {
        return prefValues.has(key) ? prefValues.get(key) : fallback;
      },
      setBoolPref(key, value) {
        prefValues.set(key, Boolean(value));
        const observer = observers.get(key);
        if (observer) {
          observer.observe(null, "nsPref:changed", key);
        }
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
    prefNames,
    prefElements,
    controls,
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
    get resizeObserverObserveCount() {
      return resizeObserverObserveCount;
    },
    get resizeObserverDisconnectCount() {
      return resizeObserverDisconnectCount;
    },
    get unloadListenerCount() {
      return (listeners.get("unload") || []).length;
    },
    get resizeListenerCount() {
      return (listeners.get("resize") || []).length;
    },
    get fieldRows() {
      return fieldRows;
    },
    setRootMetrics(clientWidth, scrollWidth = clientWidth) {
      root.clientWidth = clientWidth;
      root.scrollWidth = scrollWidth;
    },
    emitResize() {
      resizeObservers.forEach((observer) => {
        observer.callback([{ target: root }], observer);
      });
      (listeners.get("resize") || []).slice().forEach((listener) => listener());
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
    assert.equal(harness.prefValues.get(harness.prefNames.themeMode), "follow-host");
    assert.equal(harness.root.dataset.cleanroomThemeMode, "follow-host");
    assert.equal(harness.root.dataset.cleanroomTheme, "light");
    assert.equal(harness.root.style.getPropertyValue("color-scheme"), "light dark");
  });

  it("should initialize stacked-first compact layout when the preference root is narrow", () => {
    const harness = createHarness({
      themeMode: "follow-host",
      hostDark: false,
      rootClientWidth: 580,
      rootScrollWidth: 580,
    });

    const result = harness.context.initCleanroomPreferences();

    assert.equal(result.ok, true);
    assert.equal(result.layoutMode, "stacked");
    assert.equal(result.widthBucket, "compact");
    assert.equal(result.rootClientWidth, 580);
    assert.equal(result.hasHorizontalOverflow, false);
    assert.equal(harness.root.dataset.prefLayout, "stacked");
    assert.equal(harness.root.dataset.prefWidthBucket, "compact");
    assert.equal(harness.root.attributes["data-pref-horizontal-overflow"], "false");
    assert.equal(
      harness.fieldRows.every((row) => row.attributes.orient === "vertical" && row.attributes.align === "stretch"),
      true,
    );
    harness.emitUnload();
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
    assert.equal(harness.resizeObserverObserveCount, 2);
    assert.equal(harness.resizeObserverDisconnectCount, 1);
    assert.equal(firstUnloadCount, 1);
    assert.equal(harness.unloadListenerCount, 1);
    assert.equal(harness.resizeListenerCount, 1);
    harness.emitUnload();
    assert.equal(harness.resizeObserverDisconnectCount, 2);
  });

  it("should transition between inline and stacked layout when the root width changes", () => {
    const harness = createHarness({
      themeMode: "follow-host",
      hostDark: false,
      rootClientWidth: 760,
      rootScrollWidth: 760,
    });

    const result = harness.context.initCleanroomPreferences();

    assert.equal(result.layoutMode, "inline");
    assert.equal(harness.root.dataset.prefLayout, "inline");
    assert.equal(
      harness.fieldRows.every((row) => row.attributes.orient === "horizontal" && row.attributes.align === "center"),
      true,
    );

    harness.setRootMetrics(580, 580);
    harness.emitResize();

    assert.equal(harness.root.dataset.prefLayout, "stacked");
    assert.equal(harness.root.dataset.prefWidthBucket, "compact");
    assert.equal(
      harness.fieldRows.every((row) => row.attributes.orient === "vertical" && row.attributes.align === "stretch"),
      true,
    );

    harness.setRootMetrics(760, 760);
    harness.emitResize();

    assert.equal(harness.root.dataset.prefLayout, "inline");
    assert.equal(harness.root.dataset.prefWidthBucket, "regular");
    assert.equal(
      harness.fieldRows.every((row) => row.attributes.orient === "horizontal" && row.attributes.align === "center"),
      true,
    );
    harness.emitUnload();
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

  it("should hydrate pref names and control writeback through the bridge binding mode", () => {
    const harness = createHarness({
      themeMode: "follow-host",
      hostDark: false,
    });

    harness.prefElements.get("pref-enabled").setAttribute("name", "extensions.zotero.placeholder.p0");
    harness.prefElements.get("pref-menuLabel").setAttribute("name", "extensions.zotero.placeholder.p1");
    harness.prefElements.get("pref-logLevel").setAttribute("name", "extensions.zotero.placeholder.p2");
    harness.prefElements.get("pref-themeMode").setAttribute("name", "extensions.zotero.placeholder.p3");

    const result = harness.context.initCleanroomPreferences({
      bridge: {
        preferenceBindingMode: "bridge",
        preferenceNames: {
          enabled: harness.prefNames.enabled,
          menuLabel: harness.prefNames.menuLabel,
          logLevel: harness.prefNames.logLevel,
          themeMode: harness.prefNames.themeMode,
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.preferenceBindingMode, "bridge");
    assert.equal(result.preferenceBridgeApplied, true);
    assert.equal(result.preferenceBridgeAppliedCount, 4);
    assert.equal(result.prefName, harness.prefNames.themeMode);
    assert.equal(harness.prefElements.get("pref-enabled").getAttribute("name"), harness.prefNames.enabled);
    assert.equal(harness.prefElements.get("pref-themeMode").getAttribute("name"), harness.prefNames.themeMode);

    harness.controls.get("cleanroom-enabled").checked = false;
    harness.controls.get("cleanroom-enabled").dispatch("command");
    assert.equal(harness.prefValues.get(harness.prefNames.enabled), false);

    harness.controls.get("cleanroom-log-level").value = "warn";
    harness.controls.get("cleanroom-log-level").dispatch("change");
    assert.equal(harness.prefValues.get(harness.prefNames.logLevel), "warn");

    harness.controls.get("cleanroom-theme-mode").value = "dark";
    harness.controls.get("cleanroom-theme-mode").dispatch("command");
    assert.equal(harness.prefValues.get(harness.prefNames.themeMode), "dark");
    assert.equal(harness.root.dataset.cleanroomThemeMode, "dark");
    assert.equal(harness.root.dataset.cleanroomTheme, "dark");
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
    assert.equal(harness.controls.get("cleanroom-enabled").attributes.label, "启用插件");
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
