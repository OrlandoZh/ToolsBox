/**
 * Tests for Add Tags feature
 * Menu item that prompts for tags and adds them to selected items
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createAddTags } from "../../src/features/add-tags.js";

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
  const eventListeners = new Map();

  function createElement(tag) {
    const el = {
      tagName: tag,
      id: null,
      parentNode: null,
      childNodes: [],
      attributes: {},
      style: {},
      textContent: '',
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name]; },
      appendChild(child) { this.childNodes.push(child); child.parentNode = this; },
      removeChild(child) {
        const idx = this.childNodes.indexOf(child);
        if (idx >= 0) this.childNodes.splice(idx, 1);
        child.parentNode = null;
      },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      addEventListener(event, handler) {
        if (!eventListeners.has(this)) eventListeners.set(this, new Map());
        if (!eventListeners.get(this).has(event)) eventListeners.get(this).set(event, []);
        eventListeners.get(this).get(event).push(handler);
      },
      querySelectorAll() { return []; },
      _triggerEvent(event) {
        const handlers = eventListeners.get(this)?.get(event) || [];
        for (const h of handlers) h();
      },
      ...overrides.elementOverrides
    };
    return el;
  }

  const doc = {
    createElement: createElement,
    getElementById(id) { return elements.get(id) || null; },
    documentElement: createElement('root'),
    querySelectorAll() { return []; },
    _setElement(id, el) { elements.set(id, el); }
  };

  return {
    document: doc,
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
    registerToolsMenuItem(config) {
      const id = config.id || `tools-menu-item-${++counter}`;
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

function createMockZoteroPane(selectedItems = []) {
  return {
    getSelectedItems() { return selectedItems; }
  };
}

describe("AddTags", () => {
  it("should create object with register, cleanup, destroy, sectionID", () => {
    const feature = createAddTags({
      logger: createMockLogger(),
      menuManager: createMockMenuManager(),
      prefs: createMockPrefs({ "addTags.enabled": true })
    });

    assert.typeOf(feature.register, 'function', "should have register function");
    assert.typeOf(feature.cleanup, 'function', "should have cleanup function");
    assert.typeOf(feature.destroy, 'function', "should have destroy function");
    assert.equal(feature.sectionID, "toolsbox-add-tags", "sectionID should match");
  });

  it("should register() return true with full mocks", () => {
    const mockWindow = createMockWindow();
    const mockZotero = {
      getMainWindow() { return mockWindow; }
    };

    const feature = createAddTags({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager: createMockMenuManager(),
      prefs: createMockPrefs({ "addTags.enabled": true })
    });

    const result = feature.register();
    assert.equal(result, true, "register() should return true");
  });

  it("should register() return false when pref disabled", () => {
    const feature = createAddTags({
      logger: createMockLogger(),
      menuManager: createMockMenuManager(),
      prefs: createMockPrefs({ "addTags.enabled": false })
    });

    assert.equal(feature.register(), false, "register() should return false when pref disabled");
  });

  it("should register() return false when menuManager unavailable", () => {
    const feature = createAddTags({
      logger: createMockLogger(),
      menuManager: null,
      prefs: createMockPrefs({ "addTags.enabled": true })
    });

    assert.equal(feature.register(), false, "register() should return false when menuManager unavailable");
  });

  it("should cleanup() return stopped resources after register", () => {
    const mockWindow = createMockWindow();
    const mockZotero = {
      getMainWindow() { return mockWindow; }
    };
    const menuManager = createMockMenuManager();

    const feature = createAddTags({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "addTags.enabled": true })
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

    const feature = createAddTags({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "addTags.enabled": true })
    });

    assert.equal(feature.register(), true, "First register should return true");
    assert.equal(feature.register(), true, "Second register should also return true (idempotent)");
    assert.equal(menuManager.getItems().size, 1, "Should only have one menu item");
  });

  it("should return empty resources when cleanup without register", () => {
    const feature = createAddTags({
      logger: createMockLogger(),
      menuManager: createMockMenuManager(),
      prefs: createMockPrefs({ "addTags.enabled": true })
    });

    const cleanupResult = feature.cleanup();
    assert.ok(cleanupResult.stopped, "cleanup should indicate stopped");
    assert.equal(cleanupResult.resources.length, 0, "should have no resources to clean");
  });

  it("should prompt for tags and add to selected items", () => {
    const addedTags = [];
    const mockItem = {
      addTag(tag) { addedTags.push(tag); },
      saveTx() {}
    };
    const mockPane = createMockZoteroPane([mockItem]);
    const mockWindow = createMockWindow({
      prompt(text, defaultValue) { return "tag1, tag2"; }
    });
    const mockZotero = {
      getMainWindow() { return mockWindow; },
      getActiveZoteroPane() { return mockPane; }
    };
    const menuManager = createMockMenuManager();

    const feature = createAddTags({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "addTags.enabled": true })
    });

    feature.register();

    // Trigger the menu item onCommand
    const menuItem = menuManager.getItems().get("toolsbox-add-tags");
    assert.ok(menuItem, "menu item should be registered");
    assert.typeOf(menuItem.onCommand, 'function', "menu item should have onCommand");
    menuItem.onCommand();

    assert.equal(addedTags.length, 2, "should add 2 tags");
    assert.equal(addedTags[0], "tag1", "first tag should be tag1");
    assert.equal(addedTags[1], "tag2", "second tag should be tag2");
  });

  it("should show alert when no items selected", () => {
    let alertCalled = false;
    const mockWindow = createMockWindow({
      prompt(text, defaultValue) { return "tag1"; },
      alert(msg) { alertCalled = true; }
    });
    const mockPane = createMockZoteroPane([]);
    const mockZotero = {
      getMainWindow() { return mockWindow; },
      getActiveZoteroPane() { return mockPane; }
    };
    const menuManager = createMockMenuManager();

    const feature = createAddTags({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "addTags.enabled": true })
    });

    feature.register();
    const menuItem = menuManager.getItems().get("toolsbox-add-tags");
    menuItem.onCommand();

    assert.ok(alertCalled, "should alert when no items selected");
  });
});

await runTestsIfMain(import.meta.url);
