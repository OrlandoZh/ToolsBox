/**
 * Tests for Related Items feature
 * Menu item that adds related item connections between Zotero items
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createRelatedItems } from "../../src/features/related-items.js";

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

function createMockWindow(overrides = {}) {
  const elements = new Map();

  function createElement(tag) {
    const el = {
      tagName: tag,
      id: null,
      parentNode: null,
      childNodes: [],
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      appendChild(child) { this.childNodes.push(child); child.parentNode = this; },
      removeChild(child) {
        const idx = this.childNodes.indexOf(child);
        if (idx >= 0) this.childNodes.splice(idx, 1);
        child.parentNode = null;
      },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      addEventListener() {},
      ...overrides.elementOverrides
    };
    return el;
  }

  return {
    document: {
      createElement: createElement,
      getElementById(id) { return elements.get(id) || null; },
      documentElement: createElement('root'),
      querySelectorAll() { return []; },
      _setElement(id, el) { elements.set(id, el); }
    },
    prompt(text, defaultValue) { return defaultValue; },
    alert(msg) {},
    setTimeout(fn, ms) {},
    setInterval(fn, ms) { return 1; },
    clearInterval(id) {},
    ...overrides
  };
}

function createMockMenuManager() {
  const items = new Map();
  let counter = 0;
  return {
    registerItemMenuItem(config) {
      const id = config.id || `menu-item-${++counter}`;
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

describe("RelatedItems", () => {
  it("should create object with register, cleanup, destroy, sectionID", () => {
    const feature = createRelatedItems({
      logger: createMockLogger(),
      menuManager: createMockMenuManager(),
      prefs: createMockPrefs({ "relatedItems.enabled": true })
    });

    assert.typeOf(feature.register, 'function', "should have register function");
    assert.typeOf(feature.cleanup, 'function', "should have cleanup function");
    assert.typeOf(feature.destroy, 'function', "should have destroy function");
    assert.equal(feature.sectionID, "toolsbox-related-items", "sectionID should match");
  });

  it("should register() return true with full mocks", () => {
    const mockWindow = createMockWindow();
    const mockZotero = {
      getMainWindow() { return mockWindow; }
    };

    const feature = createRelatedItems({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager: createMockMenuManager(),
      prefs: createMockPrefs({ "relatedItems.enabled": true })
    });

    assert.equal(feature.register(), true, "register() should return true");
  });

  it("should register() return false when pref disabled", () => {
    const feature = createRelatedItems({
      logger: createMockLogger(),
      menuManager: createMockMenuManager(),
      prefs: createMockPrefs({ "relatedItems.enabled": false })
    });

    assert.equal(feature.register(), false, "register() should return false when pref disabled");
  });

  it("should register() return false when menuManager unavailable", () => {
    const feature = createRelatedItems({
      logger: createMockLogger(),
      menuManager: null,
      prefs: createMockPrefs({ "relatedItems.enabled": true })
    });

    assert.equal(feature.register(), false, "register() should return false when menuManager unavailable");
  });

  it("should cleanup() return stopped resources after register", () => {
    const mockWindow = createMockWindow();
    const mockZotero = {
      getMainWindow() { return mockWindow; }
    };
    const menuManager = createMockMenuManager();

    const feature = createRelatedItems({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "relatedItems.enabled": true })
    });

    feature.register();
    const cleanupResult = feature.cleanup();

    assert.ok(cleanupResult.stopped, "cleanup should indicate stopped");
    assert.ok(Array.isArray(cleanupResult.resources), "cleanup should list freed resources");
    assert.includes(cleanupResult.resources, "menu-item", "should list menu-item as resource");
  });

  it("should be idempotent on register", () => {
    const mockWindow = createMockWindow();
    const mockZotero = {
      getMainWindow() { return mockWindow; }
    };
    const menuManager = createMockMenuManager();

    const feature = createRelatedItems({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "relatedItems.enabled": true })
    });

    assert.equal(feature.register(), true, "First register should return true");
    assert.equal(feature.register(), true, "Second register should also return true (idempotent)");
    assert.equal(menuManager.getItems().size, 1, "Should only have one menu item");
  });

  it("should add related item when menu command triggered with valid target", () => {
    let relatedAdded = false;
    let saved = false;

    const sourceItem = {
      id: 1,
      itemID: 1,
      addRelatedItem(target) { relatedAdded = true; },
      saveTx() { saved = true; }
    };

    const targetItem = {
      id: 2,
      itemID: 2,
      addRelatedItem() {},
      saveTx() {}
    };

    const mockPane = {
      getSelectedItems() { return [sourceItem]; }
    };

    const mockWindow = createMockWindow({
      prompt(text, defaultValue) { return "2"; }
    });

    const mockZotero = {
      getMainWindow() { return mockWindow; },
      getActiveZoteroPane() { return mockPane; },
      Items: {
        get(id) { return id === 2 ? targetItem : null; }
      }
    };

    const menuManager = createMockMenuManager();

    const feature = createRelatedItems({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "relatedItems.enabled": true })
    });

    feature.register();
    const menuItem = menuManager.getItems().get("toolsbox-related-items");
    assert.ok(menuItem, "menu item should be registered");
    menuItem.onCommand();

    assert.ok(relatedAdded, "should call addRelatedItem");
    assert.ok(saved, "should save after adding relation");
  });

  it("should show alert when multiple items selected", () => {
    let alertCalled = false;
    const mockWindow = createMockWindow({
      alert(msg) { alertCalled = true; }
    });
    const mockPane = {
      getSelectedItems() { return [{ id: 1 }, { id: 2 }]; }
    };
    const mockZotero = {
      getMainWindow() { return mockWindow; },
      getActiveZoteroPane() { return mockPane; }
    };
    const menuManager = createMockMenuManager();

    const feature = createRelatedItems({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "relatedItems.enabled": true })
    });

    feature.register();
    const menuItem = menuManager.getItems().get("toolsbox-related-items");
    menuItem.onCommand();

    assert.ok(alertCalled, "should alert when multiple items selected");
  });
});

await runTestsIfMain(import.meta.url);
