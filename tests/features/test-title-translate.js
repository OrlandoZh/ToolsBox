/**
 * Tests for Title Translate feature
 * Title transliteration with menu item and Ctrl+Alt+T shortcut
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createTitleTranslate } from "../../src/features/title-translate.js";

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

describe("TitleTranslate", () => {
  it("should create object with register, cleanup, destroy, translateTitle, sectionID", () => {
    const feature = createTitleTranslate({
      logger: createMockLogger(),
      menuManager: createMockMenuManager(),
      prefs: createMockPrefs({ "titleTranslate.enabled": true })
    });

    assert.typeOf(feature.register, 'function', "should have register function");
    assert.typeOf(feature.cleanup, 'function', "should have cleanup function");
    assert.typeOf(feature.destroy, 'function', "should have destroy function");
    assert.typeOf(feature.translateTitle, 'function', "should have translateTitle function");
    assert.equal(feature.sectionID, "toolsbox-title-translate", "sectionID should match");
  });

  it("should register() return true with full mocks", () => {
    const mockWindow = createMockWindow();
    const mockZotero = {
      getMainWindow() { return mockWindow; }
    };
    const menuManager = createMockMenuManager();

    const feature = createTitleTranslate({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "titleTranslate.enabled": true })
    });

    assert.equal(feature.register(), true, "register() should return true");
  });

  it("should register() return false when pref disabled", () => {
    const feature = createTitleTranslate({
      logger: createMockLogger(),
      menuManager: createMockMenuManager(),
      prefs: createMockPrefs({ "titleTranslate.enabled": false })
    });

    assert.equal(feature.register(), false, "register() should return false when pref disabled");
  });

  it("should register() return false when menuManager unavailable", () => {
    const feature = createTitleTranslate({
      logger: createMockLogger(),
      menuManager: null,
      prefs: createMockPrefs({ "titleTranslate.enabled": true })
    });

    assert.equal(feature.register(), false, "register() should return false when menuManager unavailable");
  });

  it("should cleanup() return stopped resources after register", () => {
    const mockWindow = createMockWindow();
    const mockZotero = {
      getMainWindow() { return mockWindow; }
    };
    const menuManager = createMockMenuManager();

    const feature = createTitleTranslate({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "titleTranslate.enabled": true })
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

    const feature = createTitleTranslate({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "titleTranslate.enabled": true })
    });

    assert.equal(feature.register(), true, "First register should return true");
    assert.equal(feature.register(), true, "Second register should also return true (idempotent)");
    assert.equal(menuManager.getItems().size, 1, "Should only have one menu item");
  });

  it("should translateTitle transliterate cyrillic text", () => {
    const feature = createTitleTranslate({
      logger: createMockLogger(),
      prefs: createMockPrefs({ "titleTranslate.enabled": true })
    });

    const result = feature.translateTitle("Привет мир");
    assert.equal(result.language, "cyrillic", "should detect cyrillic");
    assert.ok(result.translated.includes("Privet"), "should transliterate Privet");
    assert.equal(result.original, "Привет мир", "should preserve original");
  });

  it("should translateTitle transliterate greek text", () => {
    const feature = createTitleTranslate({
      logger: createMockLogger(),
      prefs: createMockPrefs({ "titleTranslate.enabled": true })
    });

    const result = feature.translateTitle("Γειά σου Κόσμε");
    assert.equal(result.language, "greek", "should detect greek");
    assert.ok(result.translated.length > 0, "should have transliteration");
    assert.equal(result.original, "Γειά σου Κόσμε", "should preserve original");
  });

  it("should return latin for english text", () => {
    const feature = createTitleTranslate({
      logger: createMockLogger(),
      prefs: createMockPrefs({ "titleTranslate.enabled": true })
    });

    const result = feature.translateTitle("Hello World");
    assert.equal(result.language, "latin", "should detect latin");
    assert.equal(result.translated, "Hello World", "should return same text for latin");
  });

  it("should show alert when no items selected", () => {
    let alertCalled = false;
    const mockWindow = createMockWindow({
      alert(msg) { alertCalled = true; }
    });
    const mockPane = {
      getSelectedItems() { return []; }
    };
    const mockZotero = {
      getMainWindow() { return mockWindow; },
      getActiveZoteroPane() { return mockPane; }
    };
    const menuManager = createMockMenuManager();

    const feature = createTitleTranslate({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "titleTranslate.enabled": true })
    });

    feature.register();
    const menuItem = menuManager.getItems().get("toolsbox-title-translate");
    assert.ok(menuItem, "menu item should exist");
    menuItem.onCommand();

    assert.ok(alertCalled, "should alert when no items selected");
  });

  it("should show alert when selected item has no title", () => {
    let alertCalled = false;
    const mockWindow = createMockWindow({
      alert(msg) { alertCalled = true; }
    });
    const mockItem = {
      id: 1,
      getField(field) { return ''; }
    };
    const mockPane = {
      getSelectedItems() { return [mockItem]; }
    };
    const mockZotero = {
      getMainWindow() { return mockWindow; },
      getActiveZoteroPane() { return mockPane; }
    };
    const menuManager = createMockMenuManager();

    const feature = createTitleTranslate({
      logger: createMockLogger(),
      zotero: mockZotero,
      menuManager,
      prefs: createMockPrefs({ "titleTranslate.enabled": true })
    });

    feature.register();
    const menuItem = menuManager.getItems().get("toolsbox-title-translate");
    menuItem.onCommand();

    assert.ok(alertCalled, "should alert when item has no title");
  });
});

await runTestsIfMain(import.meta.url);
