/**
 * Tests for Research Workbench Graph feature
 * Opens a relationship graph window for Zotero items
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { registerRelationshipGraphFeatures } from "../../src/features/research-workbench-graph.js";

function createMockLogger() {
  const logs = [];
  return {
    info(msg) { logs.push({ level: 'info', msg }); },
    warn(msg, meta) { logs.push({ level: 'warn', msg, meta }); },
    error(msg) { logs.push({ level: 'error', msg }); },
    debug(msg) { logs.push({ level: 'debug', msg }); },
    getLogs() { return logs; }
  };
}

function createMockPrefs(overrides = {}) {
  const store = new Map(Object.entries(overrides));
  return {
    get(key) { return store.get(key); }
  };
}

function createMockI18n() {
  return {
    t(key, fallback) { return fallback || key; }
  };
}

function createMockConfig() {
  return {
    addonRef: 'toolsbox',
    addonName: 'ToolsBox',
    rootURI: 'chrome://toolsbox/'
  };
}

function createMockCommandPalette() {
  const commands = [];
  return {
    registerCommand(config) { commands.push(config); },
    getCommands() { return commands; }
  };
}

function createMockMenuManager() {
  const items = [];
  return {
    registerItemMenuItem(config) { items.push(config); },
    getItems() { return items; }
  };
}

function createMockHost() {
  return {
    openDialog() { return Promise.resolve(); }
  };
}

describe("ResearchWorkbenchGraph", () => {
  it("should register and return expected API", () => {
    const feature = registerRelationshipGraphFeatures({
      config: createMockConfig(),
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n(),
      host: createMockHost(),
      menuManager: createMockMenuManager(),
      commandPalette: createMockCommandPalette(),
      surfaceDescriptors: {}
    });

    assert.typeOf(feature.openRelationshipGraph, 'function', "should have openRelationshipGraph function");
    assert.typeOf(feature.getSnapshot, 'function', "should have getSnapshot function");
  });

  it("should register commandPalette command", () => {
    const commandPalette = createMockCommandPalette();
    registerRelationshipGraphFeatures({
      config: createMockConfig(),
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n(),
      host: createMockHost(),
      menuManager: createMockMenuManager(),
      commandPalette,
      surfaceDescriptors: {}
    });

    const commands = commandPalette.getCommands();
    assert.equal(commands.length, 1, "should register one command");
    assert.ok(commands[0].id.includes('relationship-graph'), "command id should include relationship-graph");
    assert.equal(commands[0].category, 'ToolsBox', "command category should be ToolsBox");
    assert.typeOf(commands[0].handler, 'function', "command should have handler");
    assert.typeOf(commands[0].condition, 'function', "command should have condition");
  });

  it("should register menuManager item when available", () => {
    const menuManager = createMockMenuManager();
    registerRelationshipGraphFeatures({
      config: createMockConfig(),
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n(),
      host: createMockHost(),
      menuManager,
      commandPalette: createMockCommandPalette(),
      surfaceDescriptors: {}
    });

    const items = menuManager.getItems();
    assert.equal(items.length, 1, "should register one menu item");
    assert.typeOf(items[0].onCommand, 'function', "menu item should have onCommand");
    assert.typeOf(items[0].onShowing, 'function', "menu item should have onShowing");
  });

  it("should not register menu item when menuManager unavailable", () => {
    const commandPalette = createMockCommandPalette();
    registerRelationshipGraphFeatures({
      config: createMockConfig(),
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n(),
      host: createMockHost(),
      menuManager: null,
      commandPalette,
      surfaceDescriptors: {}
    });

    assert.equal(commandPalette.getCommands().length, 1, "should still register command");
  });

  it("should getSnapshot return default when shell not opened", () => {
    const feature = registerRelationshipGraphFeatures({
      config: createMockConfig(),
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n(),
      host: createMockHost(),
      menuManager: createMockMenuManager(),
      commandPalette: createMockCommandPalette(),
      surfaceDescriptors: {}
    });

    const snapshot = feature.getSnapshot();
    assert.deepEqual(snapshot, { open: false }, "should return default snapshot");
  });

  it("should not open graph when disabled via pref", () => {
    const logger = createMockLogger();
    const feature = registerRelationshipGraphFeatures({
      config: createMockConfig(),
      logger,
      prefs: createMockPrefs({ 'researchWorkbench.graph.enabled': false }),
      i18n: createMockI18n(),
      host: createMockHost(),
      menuManager: createMockMenuManager(),
      commandPalette: createMockCommandPalette(),
      surfaceDescriptors: {}
    });

    feature.openRelationshipGraph({ itemID: 1 });

    assert.equal(feature.getSnapshot().open, false, "should not open when disabled");
  });

  it("should open graph when enabled", () => {
    const logger = createMockLogger();
    const feature = registerRelationshipGraphFeatures({
      config: createMockConfig(),
      logger,
      prefs: createMockPrefs({ 'researchWorkbench.graph.enabled': true }),
      i18n: createMockI18n(),
      host: createMockHost(),
      menuManager: createMockMenuManager(),
      commandPalette: createMockCommandPalette(),
      surfaceDescriptors: {}
    });

    assert.doesNotThrow(() => {
      feature.openRelationshipGraph({ itemID: 1 });
    }, "should not throw when opening graph");
  });

  it("should use surfaceDescriptors for IDs when provided", () => {
    const commandPalette = createMockCommandPalette();
    const menuManager = createMockMenuManager();
    registerRelationshipGraphFeatures({
      config: createMockConfig(),
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n(),
      host: createMockHost(),
      menuManager,
      commandPalette,
      surfaceDescriptors: {
        relationshipGraphCommandID: 'custom-cmd-id',
        relationshipGraphContextMenuID: 'custom-menu-id'
      }
    });

    assert.equal(commandPalette.getCommands()[0].id, 'custom-cmd-id', "should use custom command ID");
    assert.equal(menuManager.getItems()[0].id, 'custom-menu-id', "should use custom menu ID");
  });

  it("should use fallback IDs when surfaceDescriptors not provided", () => {
    const commandPalette = createMockCommandPalette();
    const menuManager = createMockMenuManager();
    registerRelationshipGraphFeatures({
      config: createMockConfig(),
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: createMockI18n(),
      host: createMockHost(),
      menuManager,
      commandPalette,
      surfaceDescriptors: null
    });

    assert.ok(commandPalette.getCommands()[0].id.startsWith('toolsbox-'), "should use fallback command ID");
    assert.ok(menuManager.getItems()[0].id.startsWith('toolsbox-'), "should use fallback menu ID");
  });

  it("should handle menu onCommand with selected item", () => {
    const menuManager = createMockMenuManager();
    const feature = registerRelationshipGraphFeatures({
      config: createMockConfig(),
      logger: createMockLogger(),
      prefs: createMockPrefs({ 'researchWorkbench.graph.enabled': true }),
      i18n: createMockI18n(),
      host: createMockHost(),
      menuManager,
      commandPalette: createMockCommandPalette(),
      surfaceDescriptors: {}
    });

    const mockItem = {
      id: 123,
      getField(field) {
        return field === 'title' ? 'Test Title' : '';
      }
    };

    const menuItem = menuManager.getItems()[0];
    assert.doesNotThrow(() => {
      menuItem.onCommand(null, { items: [mockItem] });
    }, "onCommand should handle selected item");
  });

  it("should handle menu onCommand with no items", () => {
    const menuManager = createMockMenuManager();
    registerRelationshipGraphFeatures({
      config: createMockConfig(),
      logger: createMockLogger(),
      prefs: createMockPrefs({ 'researchWorkbench.graph.enabled': true }),
      i18n: createMockI18n(),
      host: createMockHost(),
      menuManager,
      commandPalette: createMockCommandPalette(),
      surfaceDescriptors: {}
    });

    const menuItem = menuManager.getItems()[0];
    assert.doesNotThrow(() => {
      menuItem.onCommand(null, { items: [] });
    }, "onCommand should handle empty items");
  });

  it("should handle menu onShowing with enabled state", () => {
    const menuManager = createMockMenuManager();
    registerRelationshipGraphFeatures({
      config: createMockConfig(),
      logger: createMockLogger(),
      prefs: createMockPrefs({ 'researchWorkbench.graph.enabled': true }),
      i18n: createMockI18n(),
      host: createMockHost(),
      menuManager,
      commandPalette: createMockCommandPalette(),
      surfaceDescriptors: {}
    });

    let visible = null;
    const menuContext = {
      items: [{}],
      setVisible(v) { visible = v; }
    };

    const menuItem = menuManager.getItems()[0];
    menuItem.onShowing(null, menuContext);

    assert.equal(visible, true, "onShowing should set visible when enabled and items exist");
  });
});

await runTestsIfMain(import.meta.url);
