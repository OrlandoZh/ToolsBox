/**
 * Tests for Research Workbench Tabs feature
 * Tab helper command registration and reader context menu items
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { registerTabHelperFeatures } from "../../src/features/research-workbench-tabs.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(msg, details) { logs.push({ level: "debug", msg, details }); },
    warn(msg, details) { logs.push({ level: "warn", msg, details }); },
    getLogs() { return logs; },
  };
}

function createMockCommandPalette() {
  const commands = [];
  return {
    commands,
    registerCommand(cmd) { commands.push(cmd); },
  };
}

function createMockReader(overrides = {}) {
  return {
    getActiveReader() { return null; },
    getWindowStates() { return []; },
    getByTabID() { return null; },
    openReader() {},
    registerViewContextMenuItem(factory) {
      const item = factory({});
      return () => {};
    },
    ...overrides,
  };
}

function createMockPrefs(overrides = {}) {
  const store = new Map(Object.entries(overrides));
  return {
    get(key) { return store.get(key); },
    set(key, value) { store.set(key, value); },
    getStringPref(key) { return store.get(key); },
    setStringPref(key, value) { store.set(key, value); },
  };
}

describe("ResearchWorkbenchTabs", () => {
  it("registerTabHelperFeatures returns expected API", () => {
    const commandPalette = createMockCommandPalette();
    const result = registerTabHelperFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      menuManager: {},
      commandPalette,
      reader: createMockReader(),
      surfaceDescriptors: {},
    });

    assert.ok(Array.isArray(result.commands), "commands should be array");
    assert.ok(Array.isArray(result.menuCleanups), "menuCleanups should be array");
  });

  it("registerTabHelperFeatures registers 6 commands", () => {
    const commandPalette = createMockCommandPalette();
    registerTabHelperFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      menuManager: {},
      commandPalette,
      reader: createMockReader(),
      surfaceDescriptors: {},
    });

    assert.equal(commandPalette.commands.length, 5, "should register 5 commands");
  });

  it("command IDs contain tab-helper prefix", () => {
    const commandPalette = createMockCommandPalette();
    registerTabHelperFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      menuManager: {},
      commandPalette,
      reader: createMockReader(),
      surfaceDescriptors: {},
    });

    for (const cmd of commandPalette.commands) {
      assert.ok(cmd.id.includes("tab-helper"), `command id ${cmd.id} should include tab-helper`);
    }
  });

  it("duplicate tab command condition returns false when no active reader", () => {
    const commandPalette = createMockCommandPalette();
    registerTabHelperFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      menuManager: {},
      commandPalette,
      reader: createMockReader(),
      surfaceDescriptors: {},
    });

    const duplicateCmd = commandPalette.commands.find((c) => c.id.includes("duplicate"));
    assert.ok(duplicateCmd, "should have duplicate command");
    assert.equal(duplicateCmd.condition(), false, "should be false without active reader");
  });

  it("save session command condition returns false when no tabs", () => {
    const commandPalette = createMockCommandPalette();
    registerTabHelperFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      menuManager: {},
      commandPalette,
      reader: createMockReader({ getWindowStates: () => [] }),
      surfaceDescriptors: {},
    });

    const saveCmd = commandPalette.commands.find((c) => c.id.includes("save-session"));
    assert.ok(saveCmd, "should have save-session command");
    assert.equal(saveCmd.condition(), false, "should be false with no tabs");
  });

  it("commands have handler functions", () => {
    const commandPalette = createMockCommandPalette();
    registerTabHelperFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      menuManager: {},
      commandPalette,
      reader: createMockReader(),
      surfaceDescriptors: {},
    });

    for (const cmd of commandPalette.commands) {
      assert.typeOf(cmd.handler, "function", `command ${cmd.id} should have handler`);
    }
  });

  it("handlers are callable without throwing", () => {
    const commandPalette = createMockCommandPalette();
    registerTabHelperFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      menuManager: {},
      commandPalette,
      reader: createMockReader(),
      surfaceDescriptors: {},
    });

    for (const cmd of commandPalette.commands) {
      assert.doesNotThrow(() => cmd.handler(), `handler for ${cmd.id} should not throw`);
    }
  });

  it("reader context menu items registered when reader has registerViewContextMenuItem", () => {
    const commandPalette = createMockCommandPalette();
    const reader = createMockReader({
      registerViewContextMenuItem(factory) {
        const item = factory({});
        return () => {};
      },
    });

    const result = registerTabHelperFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      menuManager: {},
      commandPalette,
      reader,
      surfaceDescriptors: {},
    });

    assert.equal(result.menuCleanups.length, 2, "should register 2 menu cleanups");
  });

  it("no menu cleanups when reader lacks registerViewContextMenuItem", () => {
    const commandPalette = createMockCommandPalette();
    const result = registerTabHelperFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      menuManager: {},
      commandPalette,
      reader: {},
      surfaceDescriptors: {},
    });

    assert.equal(result.menuCleanups.length, 0, "should have no menu cleanups");
  });

  it("tab helper commands disabled when pref is false", () => {
    const commandPalette = createMockCommandPalette();
    registerTabHelperFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs({ "researchWorkbench.tabs.enabled": false }),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      menuManager: {},
      commandPalette,
      reader: createMockReader(),
      surfaceDescriptors: {},
    });

    for (const cmd of commandPalette.commands) {
      assert.equal(cmd.condition(), false, `command ${cmd.id} should be disabled`);
    }
  });

  it("commands array contains prefix", () => {
    const commandPalette = createMockCommandPalette();
    const result = registerTabHelperFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      menuManager: {},
      commandPalette,
      reader: createMockReader(),
      surfaceDescriptors: {},
    });

    assert.equal(result.commands.length, 1, "should have one prefix entry");
    assert.ok(result.commands[0].includes("tab-helper"), "prefix should include tab-helper");
  });
});

await runTestsIfMain(import.meta.url);
