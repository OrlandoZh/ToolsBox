/**
 * Tests for Menu Command feature
 * Creates a menu command that shows a dialog via host.showAlert
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createMenuCommand } from "../../src/features/menu-command.js";

function createMockLogger() {
  const logs = [];
  return {
    info(msg, meta) { logs.push({ level: 'info', msg, meta }); },
    warn(msg) { logs.push({ level: 'warn', msg }); },
    error(msg) { logs.push({ level: 'error', msg }); },
    debug(msg) { logs.push({ level: 'debug', msg }); },
    getLogs() { return logs; }
  };
}

function createMockHost(overrides = {}) {
  const toolsMenuItems = [];
  return {
    showAlert(window, title, body) { },
    addToolsMenuItem(window, config) {
      toolsMenuItems.push(config);
      return () => {
        const idx = toolsMenuItems.indexOf(config);
        if (idx >= 0) toolsMenuItems.splice(idx, 1);
      };
    },
    getToolsMenuItems() { return toolsMenuItems; },
    ...overrides
  };
}

function createMockPrefs(overrides = {}) {
  const store = new Map(Object.entries(overrides));
  return {
    get(key) { return store.get(key); },
    set(key, value) { store.set(key, value); }
  };
}

function createMockI18n(overrides = {}) {
  const strings = {
    'cleanroom-dialog-title': 'Test Dialog',
    'cleanroom-dialog-body': 'Test Body',
    'cleanroom-menu-label': 'ToolsBox Menu',
    ...overrides
  };
  return {
    t(key, fallback) { return strings[key] || fallback || key; }
  };
}

function createMockWindow() {
  return { document: {}, location: { href: 'chrome://zotero/content/zoteroPane.xhtml' } };
}

describe("MenuCommand", () => {
  it("should create object with mount and execute functions", () => {
    const feature = createMenuCommand({
      host: createMockHost(),
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n()
    });

    assert.typeOf(feature.mount, 'function', "should have mount function");
    assert.typeOf(feature.execute, 'function', "should have execute function");
  });

  it("should mount menu item via host.addToolsMenuItem", () => {
    const host = createMockHost();
    const feature = createMenuCommand({
      host,
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n()
    });

    const window = createMockWindow();
    const remove = feature.mount(window);

    assert.typeOf(remove, 'function', "mount should return a remove function");
    assert.equal(host.getToolsMenuItems().length, 1, "should add one tools menu item");
    assert.equal(host.getToolsMenuItems()[0].label, 'ToolsBox Menu', "should use i18n label");
    assert.typeOf(host.getToolsMenuItems()[0].onCommand, 'function', "menu item should have onCommand");
  });

  it("should execute with default location and showAlert", () => {
    let alertCalled = false;
    const host = createMockHost({
      showAlert(window, title, body) { alertCalled = true; }
    });
    const feature = createMenuCommand({
      host,
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n()
    });

    const result = feature.execute();

    assert.ok(result.executed, "execute should return executed=true");
    assert.equal(result.location, 'tools-menu', "default location should be tools-menu");
    assert.equal(result.showAlert, true, "default showAlert should be true");
    assert.ok(alertCalled, "showAlert should be called by default");
  });

  it("should execute with custom location and no alert", () => {
    let alertCalled = false;
    const host = createMockHost({
      showAlert(window, title, body) { alertCalled = true; }
    });
    const feature = createMenuCommand({
      host,
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n()
    });

    const result = feature.execute(null, { location: 'file-menu', showAlert: false });

    assert.equal(result.location, 'file-menu', "location should be file-menu");
    assert.equal(result.showAlert, false, "showAlert should be false");
    assert.notOk(alertCalled, "showAlert should not be called when showAlert=false");
  });

  it("should use custom menu label from prefs override", () => {
    const host = createMockHost();
    const feature = createMenuCommand({
      host,
      logger: createMockLogger(),
      prefs: createMockPrefs({ menuLabel: 'Custom Label' }),
      i18n: createMockI18n()
    });

    feature.mount(createMockWindow());

    assert.equal(host.getToolsMenuItems()[0].label, 'Custom Label', "should use pref override label");
  });

  it("should trim whitespace from pref label", () => {
    const host = createMockHost();
    const feature = createMenuCommand({
      host,
      logger: createMockLogger(),
      prefs: createMockPrefs({ menuLabel: '  Trimmed  ' }),
      i18n: createMockI18n()
    });

    feature.mount(createMockWindow());

    assert.equal(host.getToolsMenuItems()[0].label, 'Trimmed', "should trim whitespace from pref label");
  });

  it("should fallback to i18n when pref label is empty", () => {
    const host = createMockHost();
    const feature = createMenuCommand({
      host,
      logger: createMockLogger(),
      prefs: createMockPrefs({ menuLabel: '' }),
      i18n: createMockI18n()
    });

    feature.mount(createMockWindow());

    assert.equal(host.getToolsMenuItems()[0].label, 'ToolsBox Menu', "should fallback to i18n label");
  });

  it("should execute via onCommand callback from mount", () => {
    const host = createMockHost();
    const feature = createMenuCommand({
      host,
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n()
    });

    const window = createMockWindow();
    feature.mount(window);

    const menuItem = host.getToolsMenuItems()[0];
    const result = menuItem.onCommand();

    assert.ok(result.executed, "onCommand should execute and return executed=true");
    assert.equal(result.location, 'tools-menu', "onCommand should use default location");
  });

  it("should use provided surfaceDescriptors or create default", () => {
    const host = createMockHost();
    const customDescriptors = { menuCommand: { toolsMenuItemID: 'custom-id' } };
    const feature = createMenuCommand({
      host,
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n(),
      surfaceDescriptors: customDescriptors
    });

    feature.mount(createMockWindow());

    assert.equal(host.getToolsMenuItems()[0].id, 'custom-id', "should use custom surfaceDescriptors");
  });

  it("should handle empty string location fallback", () => {
    const host = createMockHost();
    const feature = createMenuCommand({
      host,
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n()
    });

    const result = feature.execute(null, { location: '' });

    assert.equal(result.location, 'tools-menu', "empty string location should fallback to tools-menu");
  });
});

await runTestsIfMain(import.meta.url);
