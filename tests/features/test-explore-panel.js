/**
 * Tests for Explore Panel feature
 * ItemPane section for external search links (DOI, Google Scholar, Semantic Scholar)
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createExplorePanel } from "../../src/features/explore-panel.js";

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

function createMockDocument() {
  const elements = [];
  return {
    createElement(tag) {
      const el = {
        tagName: tag,
        className: '',
        textContent: '',
        href: '',
        target: '',
        rel: '',
        title: '',
        style: {},
        attributes: {},
        childNodes: [],
        parentNode: null,
        setAttribute(name, value) { this.attributes[name] = value; },
        getAttribute(name) { return this.attributes[name]; },
        appendChild(child) { this.childNodes.push(child); child.parentNode = this; }
      };
      elements.push(el);
      return el;
    },
    querySelectorAll() { return []; },
    getElementById() { return null; }
  };
}

function createMockItemPaneManager() {
  const sections = new Map();
  return {
    registerSection(config) {
      sections.set(config.paneID, config);
      return config.paneID;
    },
    unregisterSection(paneID) {
      sections.delete(paneID);
    },
    getSections() { return sections; }
  };
}

function createMockPrefs(overrides = {}) {
  const store = new Map(Object.entries(overrides));
  return {
    get(key) { return store.get(key); },
    set(key, value) { store.set(key, value); }
  };
}

describe("ExplorePanel", () => {
  it("should create object with register, cleanup, destroy, render, sectionID", () => {
    const feature = createExplorePanel({
      logger: createMockLogger(),
      prefs: createMockPrefs({ "explorePanel.enabled": true })
    });

    assert.typeOf(feature.register, 'function', "should have register function");
    assert.typeOf(feature.cleanup, 'function', "should have cleanup function");
    assert.typeOf(feature.destroy, 'function', "should have destroy function");
    assert.typeOf(feature.render, 'function', "should have render function");
    assert.equal(feature.sectionID, "toolsbox-explore-panel", "sectionID should match");
  });

  it("should register() return true with ItemPaneManager available", () => {
    const itemPaneManager = createMockItemPaneManager();
    const mockZotero = {
      ItemPaneManager: itemPaneManager
    };

    const feature = createExplorePanel({
      logger: createMockLogger(),
      zotero: mockZotero,
      prefs: createMockPrefs({ "explorePanel.enabled": true })
    });

    assert.equal(feature.register(), true, "register() should return true");
  });

  it("should register() return false when pref disabled", () => {
    const feature = createExplorePanel({
      logger: createMockLogger(),
      prefs: createMockPrefs({ "explorePanel.enabled": false })
    });

    assert.equal(feature.register(), false, "register() should return false when pref disabled");
  });

  it("should register() return false when ItemPane API not available", () => {
    const feature = createExplorePanel({
      logger: createMockLogger(),
      zotero: {},
      prefs: createMockPrefs({ "explorePanel.enabled": true })
    });

    assert.equal(feature.register(), false, "register() should return false when ItemPane API missing");
  });

  it("should register() via itemPane option", () => {
    const itemPane = createMockItemPaneManager();

    const feature = createExplorePanel({
      logger: createMockLogger(),
      itemPane,
      prefs: createMockPrefs({ "explorePanel.enabled": true })
    });

    assert.equal(feature.register(), true, "register() should return true with itemPane option");
  });

  it("should cleanup() return stopped resources after register", () => {
    const itemPaneManager = createMockItemPaneManager();
    const mockZotero = {
      ItemPaneManager: itemPaneManager
    };

    const feature = createExplorePanel({
      logger: createMockLogger(),
      zotero: mockZotero,
      prefs: createMockPrefs({ "explorePanel.enabled": true })
    });

    feature.register();
    const cleanupResult = feature.cleanup();

    assert.ok(cleanupResult.stopped, "cleanup should indicate stopped");
    assert.ok(Array.isArray(cleanupResult.resources), "cleanup should list freed resources");
    assert.includes(cleanupResult.resources, "item-pane-section", "should list item-pane-section as resource");
  });

  it("should be idempotent on register", () => {
    const itemPaneManager = createMockItemPaneManager();
    const mockZotero = {
      ItemPaneManager: itemPaneManager
    };

    const feature = createExplorePanel({
      logger: createMockLogger(),
      zotero: mockZotero,
      prefs: createMockPrefs({ "explorePanel.enabled": true })
    });

    assert.equal(feature.register(), true, "First register should return true");
    assert.equal(feature.register(), true, "Second register should also return true (idempotent)");
    assert.equal(itemPaneManager.getSections().size, 1, "Should only have one section");
  });

  it("should render explore links for item with DOI", () => {
    const doc = createMockDocument();
    const body = doc.createElement('div');
    const item = {
      getField(field) {
        if (field === 'DOI') return '10.1234/example';
        if (field === 'title') return 'Test Title';
        return '';
      }
    };

    const feature = createExplorePanel({
      logger: createMockLogger(),
      prefs: createMockPrefs({ "explorePanel.enabled": true })
    });

    const result = feature.render({ doc, body, item });

    assert.ok(result, "render should return a node");
    assert.ok(body.childNodes.length > 0, "body should have children");
  });

  it("should render empty message when no links available", () => {
    const doc = createMockDocument();
    const body = doc.createElement('div');
    const item = {
      getField() { return ''; }
    };

    const feature = createExplorePanel({
      logger: createMockLogger(),
      prefs: createMockPrefs({ "explorePanel.enabled": true })
    });

    const result = feature.render({ doc, body, item });

    assert.ok(result, "render should return a node even for empty item");
    assert.ok(body.childNodes.length > 0, "body should have empty message");
  });

  it("should call onItemChange with setEnabled", () => {
    const itemPaneManager = createMockItemPaneManager();
    const mockZotero = {
      ItemPaneManager: itemPaneManager
    };

    const feature = createExplorePanel({
      logger: createMockLogger(),
      zotero: mockZotero,
      prefs: createMockPrefs({ "explorePanel.enabled": true })
    });

    feature.register();
    const section = itemPaneManager.getSections().get("toolsbox-explore-panel");
    assert.ok(section, "section should be registered");
    assert.typeOf(section.onItemChange, 'function', "should have onItemChange");

    let enabledCalled = false;
    section.onItemChange({ item: { id: 1 }, setEnabled(val) { enabledCalled = val; } });
    assert.equal(enabledCalled, true, "setEnabled should be called with true when item exists");
  });
});

await runTestsIfMain(import.meta.url);
