/**
 * Tests for Research Workflow feature
 * Tests factory, item pane section, menus, and reader features registration.
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  registerResearchWorkflowFeatures,
  registerWorkflowItemPane,
  registerWorkflowMenus,
  registerWorkflowReaderFeatures,
} from "../../src/features/research-workflow.js";

function createMockLogger() {
  const logs = [];
  return {
    info(msg, details) { logs.push({ level: "info", msg, details }); },
    warn(msg, details) { logs.push({ level: "warn", msg, details }); },
    error(msg, details) { logs.push({ level: "error", msg, details }); },
    getLogs() { return logs; },
  };
}

function createMockWindow(overrides = {}) {
  return {
    document: {
      createElement(tagName) {
        return {
          tagName,
          childNodes: [],
          attributes: {},
          value: "",
          textContent: "",
          style: {},
          setAttribute(name, value) { this.attributes[name] = String(value); },
          appendChild(child) { this.childNodes.push(child); return child; },
          addEventListener() {},
        };
      },
      querySelector() { return null; },
    },
    setTimeout(callback, delay) { return setTimeout(callback, delay); },
    clearTimeout(id) { return clearTimeout(id); },
    ...overrides,
  };
}

function createMockZotero(overrides = {}) {
  return {
    ItemPaneManager: {
      registerSection(config) {
        this._sections = this._sections || new Map();
        this._sections.set(config.paneID, config);
        return config.paneID;
      },
      unregisterSection(paneID) {
        if (this._sections) { this._sections.delete(paneID); }
      },
      _sections: new Map(),
    },
    Items: {
      get(id) {
        return { id, getField: () => "", isAttachment: () => false, isNote: () => false };
      },
    },
    Tags: {
      getAll() { return []; },
    },
    Prefs: {
      get(key) { return undefined; },
      set(key, value) {},
    },
    getActiveZoteroPane() { return null; },
    getMainWindow() { return createMockWindow(); },
    ...overrides,
  };
}

function createMockItemPane() {
  return {
    registerSection(config) {
      this._registered = this._registered || [];
      this._registered.push(config);
      return config.paneID;
    },
    unregisterSection(paneID) {
      if (this._registered) {
        this._registered = this._registered.filter((c) => c.paneID !== paneID);
      }
    },
    _registered: [],
  };
}

function createMockMenuManager() {
  return {
    MENU_TYPES: { SUBMENU: "submenu", MENUITEM: "menuitem" },
    MENU_TARGETS: { LIBRARY_ITEM: "main/library/item", LIBRARY_COLLECTION: "main/library/collection" },
    registerStateDrivenMenu(config) {
      this._registered = this._registered || [];
      this._registered.push(config);
      return config.id;
    },
    registerReaderMenubarViewSubmenu(config) {
      this._registered = this._registered || [];
      this._registered.push(config);
      return config.id;
    },
    _registered: [],
  };
}

function createMockReader() {
  return {
    READER_EVENT_TYPES: { RENDER_TOOLBAR: "renderToolbar" },
    registerEventListener(type, handler) {
      this._listeners = this._listeners || [];
      this._listeners.push({ type, handler });
      return () => {};
    },
    registerViewContextMenuItem(factory) {
      this._viewMenus = this._viewMenus || [];
      this._viewMenus.push(factory);
      return () => {};
    },
    registerAnnotationContextMenuItem(factory) {
      this._annotationMenus = this._annotationMenus || [];
      this._annotationMenus.push(factory);
      return () => {};
    },
    getActiveReader() { return null; },
    getReaderSummary() { return null; },
    getWindowStates() { return []; },
    getItemByID() { return null; },
    updateAnnotation() { return Promise.resolve(); },
    _listeners: [],
    _viewMenus: [],
    _annotationMenus: [],
  };
}

function createMockPrefs(overrides = {}) {
  const store = new Map(Object.entries(overrides));
  return {
    get(key) { return store.get(key); },
    set(key, value) { store.set(key, value); },
  };
}

describe("ResearchWorkflow", () => {
  it("registerResearchWorkflowFeatures returns object with expected keys", () => {
    const result = registerResearchWorkflowFeatures({
      logger: createMockLogger(),
      prefs: createMockPrefs(),
    });

    assert.ok(result, "should return a result object");
    assert.ok(Object.hasOwn(result, "itemPaneSection"), "should have itemPaneSection");
    assert.ok(Object.hasOwn(result, "menus"), "should have menus");
    assert.ok(Object.hasOwn(result, "readerFeatures"), "should have readerFeatures");
  });

  it("registerResearchWorkflowFeatures itemPaneSection is non-null when itemPane provided", () => {
    const result = registerResearchWorkflowFeatures({
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      itemPane: createMockItemPane(),
    });

    assert.ok(result.itemPaneSection !== null, "itemPaneSection should be non-null");
    assert.ok(typeof result.itemPaneSection === "string", "itemPaneSection should be a string paneID");
  });

  it("registerResearchWorkflowFeatures menus is array", () => {
    const result = registerResearchWorkflowFeatures({
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      menuManager: createMockMenuManager(),
    });

    assert.ok(Array.isArray(result.menus), "menus should be an array");
  });

  it("registerResearchWorkflowFeatures readerFeatures is array", () => {
    const result = registerResearchWorkflowFeatures({
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      reader: createMockReader(),
    });

    assert.ok(Array.isArray(result.readerFeatures), "readerFeatures should be an array");
  });

  it("registerWorkflowItemPane returns null when itemPane missing", () => {
    const result = registerWorkflowItemPane({
      prefs: createMockPrefs(),
      logger: createMockLogger(),
    });

    assert.equal(result, null, "should return null when itemPane is missing");
  });

  it("registerWorkflowItemPane returns null when disabled", () => {
    const result = registerWorkflowItemPane({
      itemPane: createMockItemPane(),
      prefs: createMockPrefs({ "researchWorkflow.enabled": false }),
      logger: createMockLogger(),
    });

    assert.equal(result, null, "should return null when workflow is disabled");
  });

  it("registerWorkflowItemPane registers section when enabled", () => {
    const itemPane = createMockItemPane();
    const result = registerWorkflowItemPane({
      itemPane,
      prefs: createMockPrefs(),
      logger: createMockLogger(),
      addonRef: "test",
    });

    assert.ok(result !== null, "should return non-null paneID");
    assert.equal(itemPane._registered.length, 1, "should register one section");
    assert.equal(itemPane._registered[0].paneID, "test-workflow", "paneID should match addonRef");
    assert.ok(itemPane._registered[0].header, "should have header config");
    assert.ok(itemPane._registered[0].sidenav, "should have sidenav config");
  });

  it("registerWorkflowMenus returns empty when menuManager missing", () => {
    const result = registerWorkflowMenus({
      prefs: createMockPrefs(),
      logger: createMockLogger(),
    });

    assert.ok(Array.isArray(result), "should return array");
    assert.equal(result.length, 0, "should return empty array");
  });

  it("registerWorkflowMenus returns empty when disabled", () => {
    const result = registerWorkflowMenus({
      menuManager: createMockMenuManager(),
      prefs: createMockPrefs({ "researchWorkflow.enabled": false }),
      logger: createMockLogger(),
    });

    assert.ok(Array.isArray(result), "should return array");
    assert.equal(result.length, 0, "should return empty array when disabled");
  });

  it("registerWorkflowMenus registers menus when enabled", () => {
    const menuManager = createMockMenuManager();
    const result = registerWorkflowMenus({
      menuManager,
      prefs: createMockPrefs(),
      logger: createMockLogger(),
      addonRef: "test",
    });

    assert.ok(Array.isArray(result), "should return array");
    assert.equal(result.length, 2, "should register 2 menus (item + collection)");
    assert.ok(result[0].includes("test-workflow-item-menu"), "first menu ID should contain addonRef");
    assert.ok(result[1].includes("test-workflow-collection-menu"), "second menu ID should contain addonRef");
  });

  it("registerWorkflowReaderFeatures returns empty when reader missing", () => {
    const result = registerWorkflowReaderFeatures({
      prefs: createMockPrefs(),
      logger: createMockLogger(),
    });

    assert.ok(Array.isArray(result), "should return array");
    assert.equal(result.length, 0, "should return empty array");
  });

  it("registerWorkflowReaderFeatures returns empty when reader disabled", () => {
    const result = registerWorkflowReaderFeatures({
      reader: createMockReader(),
      prefs: createMockPrefs({ "researchWorkflow.enabled": false }),
      logger: createMockLogger(),
    });

    assert.ok(Array.isArray(result), "should return array");
    assert.equal(result.length, 0, "should return empty array when disabled");
  });

  it("registerWorkflowReaderFeatures registers toolbar event listener", () => {
    const reader = createMockReader();
    const result = registerWorkflowReaderFeatures({
      reader,
      prefs: createMockPrefs(),
      logger: createMockLogger(),
    });

    assert.ok(result.includes("reader:renderToolbar"), "should register renderToolbar");
    assert.ok(reader._listeners.length > 0, "should have registered listeners");
  });

  it("registerWorkflowReaderFeatures registers view context menu", () => {
    const reader = createMockReader();
    const result = registerWorkflowReaderFeatures({
      reader,
      prefs: createMockPrefs(),
      logger: createMockLogger(),
    });

    assert.ok(result.includes("reader:viewContext"), "should register viewContext");
    assert.ok(reader._viewMenus.length > 0, "should have view context menu factories");
  });

  it("registerWorkflowReaderFeatures registers annotation context menu", () => {
    const reader = createMockReader();
    const result = registerWorkflowReaderFeatures({
      reader,
      prefs: createMockPrefs(),
      logger: createMockLogger(),
    });

    assert.ok(result.includes("reader:annotationContext"), "should register annotationContext");
    assert.ok(reader._annotationMenus.length > 0, "should have annotation context menu factories");
  });

  it("registerWorkflowReaderFeatures with menubar when menuManager provided", () => {
    const reader = createMockReader();
    const menuManager = createMockMenuManager();
    const result = registerWorkflowReaderFeatures({
      reader,
      menuManager,
      prefs: createMockPrefs(),
      logger: createMockLogger(),
      addonRef: "test",
    });

    assert.ok(result.length >= 3, "should register menubar + 3 reader features");
    assert.ok(menuManager._registered.length > 0, "menuManager should have registered menus");
  });

  it("itemPaneSection onItemChange enables when item present", () => {
    const itemPane = createMockItemPane();
    registerWorkflowItemPane({
      itemPane,
      prefs: createMockPrefs(),
      logger: createMockLogger(),
    });

    const section = itemPane._registered[0];
    let enabledValue = null;
    section.onItemChange({ item: { id: 1 }, setEnabled(value) { enabledValue = value; } });
    assert.equal(enabledValue, true, "should enable when item is present");
  });

  it("itemPaneSection onItemChange disables when item absent", () => {
    const itemPane = createMockItemPane();
    registerWorkflowItemPane({
      itemPane,
      prefs: createMockPrefs(),
      logger: createMockLogger(),
    });

    const section = itemPane._registered[0];
    let enabledValue = null;
    section.onItemChange({ item: null, setEnabled(value) { enabledValue = value; } });
    assert.equal(enabledValue, false, "should disable when item is absent");
  });

  it("itemPaneSection onRender calls renderWorkflowEditor", () => {
    const itemPane = createMockItemPane();
    const win = createMockWindow();
    registerWorkflowItemPane({
      itemPane,
      prefs: createMockPrefs(),
      logger: createMockLogger(),
    });

    const section = itemPane._registered[0];
    const body = win.document.createElement("div");
    section.onRender({ doc: win.document, body, item: { id: 1, getTags: () => [], extra: "" } });
    assert.ok(body.childNodes.length > 0, "body should have children after render");
  });

  it("registerResearchWorkflowFeatures logs ready info", () => {
    const logger = createMockLogger();
    registerResearchWorkflowFeatures({
      logger,
      prefs: createMockPrefs(),
      itemPane: createMockItemPane(),
      menuManager: createMockMenuManager(),
      reader: createMockReader(),
    });

    const logs = logger.getLogs();
    const readyLog = logs.find((l) => l.msg === "researchWorkflow.features.ready");
    assert.ok(readyLog, "should log ready info");
    assert.ok(readyLog.details, "ready log should have details");
  });

  it("registerResearchWorkflowFeatures uses config defaults", () => {
    const result = registerResearchWorkflowFeatures({
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      config: { addonRef: "custom" },
      itemPane: createMockItemPane(),
    });

    assert.ok(result.itemPaneSection.includes("custom"), "should use custom addonRef");
  });

  it("registerWorkflowItemPane section has correct header and sidenav", () => {
    const itemPane = createMockItemPane();
    registerWorkflowItemPane({
      itemPane,
      prefs: createMockPrefs(),
      logger: createMockLogger(),
      addonRef: "myaddon",
      icon: "custom/icon.png",
    });

    const section = itemPane._registered[0];
    assert.equal(section.header.icon, "custom/icon.png", "header icon should match");
    assert.equal(section.sidenav.icon, "custom/icon.png", "sidenav icon should match");
    assert.equal(section.sidenav.orderable, true, "sidenav should be orderable");
  });
});

await runTestsIfMain(import.meta.url);
