/**
 * Tests for Dark/Light Button feature
 * Menu item that toggles Zotero theme
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createDarkLightButton } from "../../src/features/dark-light-button.js";

function createMockLogger() {
  const logs = [];
  return {
    info(msg) { logs.push({ level: 'info', msg }); },
    warn(msg) { logs.push({ level: 'warn', msg }); },
    error(msg) { logs.push({ level: 'error', msg }); },
    debug(msg) { logs.push({ level: 'debug', msg }); },
    getLogs() { return logs; }
  };
}

function createMockMenuManager() {
  const items = new Map();
  let counter = 0;
  return {
    registerToolsMenuItem(config) {
      const id = config.id || `tools-menu-${++counter}`;
      items.set(id, config);
      return id;
    },
    registerItemMenuItem(config) {
      const id = config.id || `item-menu-${++counter}`;
      items.set(id, config);
      return id;
    },
    unregister(id) {
      items.delete(id);
    },
    getItems() { return items; }
  };
}

function createMockPrefs(overrides = {}) {
  const store = new Map(Object.entries(overrides));
  return {
    get(key) { return store.get(key); },
    set(key, value) { store.set(key, value); }
  };
}

function createMockThemeManager() {
  let mode = 'light';
  return {
    getMode() { return mode; },
    setMode(newMode) { mode = newMode; }
  };
}

describe("DarkLightButton", () => {
  it("should create object with register, cleanup, destroy, toggleTheme, sectionID", () => {
    const feature = createDarkLightButton({
      logger: createMockLogger(),
      menuManager: createMockMenuManager(),
      prefs: createMockPrefs({ "darkLightButton.enabled": true })
    });

    assert.typeOf(feature.register, 'function', "should have register function");
    assert.typeOf(feature.cleanup, 'function', "should have cleanup function");
    assert.typeOf(feature.destroy, 'function', "should have destroy function");
    assert.typeOf(feature.toggleTheme, 'function', "should have toggleTheme function");
    assert.equal(feature.sectionID, "toolsbox-dark-light-button", "sectionID should match");
  });

  it("should register() return true with full mocks via Tools menu", () => {
    const menuManager = createMockMenuManager();
    const feature = createDarkLightButton({
      logger: createMockLogger(),
      menuManager,
      prefs: createMockPrefs({ "darkLightButton.enabled": true })
    });

    const result = feature.register();
    assert.equal(result, true, "register() should return true");
    assert.ok(menuManager.getItems().has("toolsbox-dark-light-button"), "should register in tools menu");
  });

  it("should register() return false when pref disabled", () => {
    const feature = createDarkLightButton({
      logger: createMockLogger(),
      menuManager: createMockMenuManager(),
      prefs: createMockPrefs({ "darkLightButton.enabled": false })
    });

    assert.equal(feature.register(), false, "register() should return false when pref disabled");
  });

  it("should register() return false when no menuManager", () => {
    const feature = createDarkLightButton({
      logger: createMockLogger(),
      menuManager: null,
      prefs: createMockPrefs({ "darkLightButton.enabled": true })
    });

    assert.equal(feature.register(), false, "register() should return false when menuManager unavailable");
  });

  it("should fallback to item menu when tools menu not available", () => {
    const menuManager = {
      items: new Map(),
      registerItemMenuItem(config) {
        const id = config.id;
        this.items.set(id, config);
        return id;
      },
      unregister(id) { this.items.delete(id); },
      getItems() { return this.items; }
    };

    const feature = createDarkLightButton({
      logger: createMockLogger(),
      menuManager,
      prefs: createMockPrefs({ "darkLightButton.enabled": true })
    });

    assert.equal(feature.register(), true, "register() should fallback to item menu");
    assert.ok(menuManager.getItems().has("toolsbox-dark-light-button"), "should register in item menu");
  });

  it("should cleanup() return stopped resources after register", () => {
    const menuManager = createMockMenuManager();
    const feature = createDarkLightButton({
      logger: createMockLogger(),
      menuManager,
      prefs: createMockPrefs({ "darkLightButton.enabled": true })
    });

    feature.register();
    const cleanupResult = feature.cleanup();

    assert.ok(cleanupResult.stopped, "cleanup should indicate stopped");
    assert.ok(Array.isArray(cleanupResult.resources), "cleanup should list freed resources");
    assert.includes(cleanupResult.resources, "menu-item", "should list menu-item as resource");
  });

  it("should be idempotent on register", () => {
    const menuManager = createMockMenuManager();
    const feature = createDarkLightButton({
      logger: createMockLogger(),
      menuManager,
      prefs: createMockPrefs({ "darkLightButton.enabled": true })
    });

    assert.equal(feature.register(), true, "First register should return true");
    assert.equal(feature.register(), true, "Second register should also return true (idempotent)");
    assert.equal(menuManager.getItems().size, 1, "Should only have one menu item");
  });

  it("should toggleTheme switch between light and dark", () => {
    const themeManager = createMockThemeManager();
    const feature = createDarkLightButton({
      logger: createMockLogger(),
      menuManager: createMockMenuManager(),
      themeManager,
      prefs: createMockPrefs({ "darkLightButton.enabled": true })
    });

    assert.equal(themeManager.getMode(), 'light', "initial mode should be light");
    feature.toggleTheme();
    assert.equal(themeManager.getMode(), 'dark', "after toggle should be dark");
    feature.toggleTheme();
    assert.equal(themeManager.getMode(), 'light', "after second toggle should be light");
  });

  it("should trigger toggleTheme via menu onCommand", () => {
    const themeManager = createMockThemeManager();
    const menuManager = createMockMenuManager();

    const feature = createDarkLightButton({
      logger: createMockLogger(),
      menuManager,
      themeManager,
      prefs: createMockPrefs({ "darkLightButton.enabled": true })
    });

    feature.register();
    const menuItem = menuManager.getItems().get("toolsbox-dark-light-button");
    assert.ok(menuItem, "menu item should exist");
    assert.typeOf(menuItem.onCommand, 'function', "menu item should have onCommand");

    menuItem.onCommand();
    assert.equal(themeManager.getMode(), 'dark', "onCommand should toggle theme to dark");
  });
});

await runTestsIfMain(import.meta.url);
