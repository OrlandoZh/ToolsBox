import { describe, it, assert } from "./test-framework.js";
import { registerTabHelperFeatures } from "../src/features/research-workbench-tabs.js";

function createPrefs(values = {}) {
  return { get(key) { return Object.hasOwn(values, key) ? values[key] : null; } };
}

function createCommandPalette() {
  const registrations = [];
  return {
    registrations,
    registerCommand(opts) { registrations.push(opts); return opts.id; },
    getCommandCount() { return registrations.length; },
  };
}

function createI18n() {
  return { t(key, fallback) { return fallback || key; } };
}

describe("Research Workbench Tabs", () => {
  it("should register 5 tab helper commands", () => {
    const cp = createCommandPalette();
    registerTabHelperFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {} },
      prefs: createPrefs({ "researchWorkbench.tabs.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: null,
      commandPalette: cp,
      reader: null,
      surfaceDescriptors: { tabHelperCommandIDPrefix: "toolsbox-tab-helper" },
    });
    assert.equal(cp.registrations.length, 5);
  });

  it("should use correct command ids with prefix", () => {
    const cp = createCommandPalette();
    registerTabHelperFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {} },
      prefs: createPrefs({ "researchWorkbench.tabs.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: null,
      commandPalette: cp,
      reader: null,
      surfaceDescriptors: { tabHelperCommandIDPrefix: "toolsbox-tab-helper" },
    });
    const ids = cp.registrations.map((r) => r.id);
    assert.includes(ids, "toolsbox-tab-helper-duplicate");
    assert.includes(ids, "toolsbox-tab-helper-close-others");
    assert.includes(ids, "toolsbox-tab-helper-move-window");
    assert.includes(ids, "toolsbox-tab-helper-save-session");
    assert.includes(ids, "toolsbox-tab-helper-restore-session");
  });

  it("should have labels on all commands", () => {
    const cp = createCommandPalette();
    registerTabHelperFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {} },
      prefs: createPrefs({ "researchWorkbench.tabs.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: null,
      commandPalette: cp,
      reader: null,
      surfaceDescriptors: null,
    });
    for (const reg of cp.registrations) {
      assert.ok(typeof reg.label === "string" && reg.label.length > 0, `Command ${reg.id} should have a label`);
      assert.equal(typeof reg.handler, "function");
    }
  });

  it("should disable commands when tabs feature is disabled", () => {
    const cp = createCommandPalette();
    registerTabHelperFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {} },
      prefs: createPrefs({ "researchWorkbench.tabs.enabled": false }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: null,
      commandPalette: cp,
      reader: null,
      surfaceDescriptors: null,
    });
    for (const reg of cp.registrations) {
      assert.equal(typeof reg.condition, "function");
      assert.equal(reg.condition(), false);
    }
  });

  it("should register reader view context menu items when reader is available", () => {
    const menuItems = [];
    const mockReader = {
      registerViewContextMenuItem(factory) {
        const item = typeof factory === "function" ? factory({}) : factory;
        menuItems.push(item);
        return () => {};
      },
    };
    registerTabHelperFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {} },
      prefs: createPrefs({ "researchWorkbench.tabs.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: null,
      commandPalette: createCommandPalette(),
      reader: mockReader,
      surfaceDescriptors: null,
    });
    assert.equal(menuItems.length, 2);
    const ids = menuItems.map((m) => m.id);
    assert.includes(ids, "toolsbox-tab-helper-open-related");
    assert.includes(ids, "toolsbox-tab-helper-open-dup");
  });

  it("should skip reader menu registration when reader has no context menu API", () => {
    const cp = createCommandPalette();
    registerTabHelperFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {} },
      prefs: createPrefs({ "researchWorkbench.tabs.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: null,
      commandPalette: cp,
      reader: {},
      surfaceDescriptors: null,
    });
    assert.equal(cp.registrations.length, 5);
  });
});
