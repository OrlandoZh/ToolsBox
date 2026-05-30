/**
 * Comprehensive tests for menu-manager.js
 * Tests all host menu infrastructure: constants, factory, registration, state-driven menus, queries.
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  createMenuManager,
  createMenuStateResolver,
  MENU_TARGETS,
  MENU_TYPES,
  TAB_TYPES,
} from "../../src/features/menu-manager.js";

// ─── Mock Helpers ───

function createMockLogger() {
  const logs = [];
  return {
    debug(msg, details) { logs.push({ level: "debug", msg, details }); },
    error(msg, details) { logs.push({ level: "error", msg, details }); },
    getLogs() { return logs; },
  };
}

function createMockWindow(overrides = {}) {
  return {
    document: {
      querySelector() { return null; },
      createElement(tag) {
        return {
          tagName: tag,
          attributes: {},
          childNodes: [],
          parentNode: null,
          style: {},
          setAttribute(name, value) { this.attributes[name] = String(value); },
          removeAttribute(name) { delete this.attributes[name]; },
          appendChild(child) { this.childNodes.push(child); child.parentNode = this; return child; },
          addEventListener() {},
        };
      },
    },
    setTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    ...overrides,
  };
}

function createMockZotero({ hasMenuManager = true } = {}) {
  const registered = [];
  let counter = 0;

  if (!hasMenuManager) {
    return { _registered: registered };
  }

  return {
    MenuManager: {
      registerMenu(options) {
        registered.push(options);
        return options.menuID || `official-menu-${++counter}`;
      },
      unregisterMenu() {
        return true;
      },
      registerMenuItem() {
        return `menu-item-${++counter}`;
      },
      unregisterMenuItem() {
        return true;
      },
    },
    _getRegisteredMenus() {
      return registered;
    },
  };
}

function createMockMenuElement() {
  return {
    tagName: "menuitem",
    attributes: {},
    hidden: false,
    disabled: false,
    label: "",
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
  };
}

// ─── Tests ───

describe("MenuManager Constants", () => {
  it("should export MENU_TARGETS with key constants", () => {
    assert.ok(Object.keys(MENU_TARGETS).length > 0, "MENU_TARGETS should not be empty");
    assert.ok(MENU_TARGETS.LIBRARY_ITEM, "LIBRARY_ITEM should exist");
    assert.equal(MENU_TARGETS.LIBRARY_ITEM, "main/library/item", "LIBRARY_ITEM path should match");
    assert.ok(MENU_TARGETS.READER_MENU_VIEW, "READER_MENU_VIEW should exist");
    assert.equal(MENU_TARGETS.READER_MENU_VIEW, "reader/menubar/view", "READER_MENU_VIEW path should match");
    assert.ok(MENU_TARGETS.ITEM_PANE_INFO_ROW, "ITEM_PANE_INFO_ROW should exist");
    assert.equal(MENU_TARGETS.ITEM_PANE_INFO_ROW, "itemPane/info/row", "ITEM_PANE_INFO_ROW path should match");
    assert.ok(MENU_TARGETS.MAIN_MENU_TOOLS, "MAIN_MENU_TOOLS should exist");
    assert.ok(MENU_TARGETS.LIBRARY_COLLECTION, "LIBRARY_COLLECTION should exist");
  });

  it("should export MENU_TYPES constants", () => {
    assert.equal(MENU_TYPES.MENUITEM, "menuitem", "MENUITEM should be 'menuitem'");
    assert.equal(MENU_TYPES.SEPARATOR, "separator", "SEPARATOR should be 'separator'");
    assert.equal(MENU_TYPES.SUBMENU, "submenu", "SUBMENU should be 'submenu'");
  });

  it("should export TAB_TYPES constants", () => {
    assert.equal(TAB_TYPES.LIBRARY, "library", "LIBRARY tab type should match");
    assert.equal(TAB_TYPES.READER_ALL, "reader/*", "READER_ALL tab type should match");
    assert.equal(TAB_TYPES.READER_PDF, "reader/pdf", "READER_PDF tab type should match");
  });
});

describe("MenuManager Factory", () => {
  it("should return object with all expected methods", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    assert.typeOf(mm.register, "function", "should have register");
    assert.typeOf(mm.unregister, "function", "should have unregister");
    assert.typeOf(mm.unregisterAll, "function", "should have unregisterAll");
    assert.typeOf(mm.registerItemMenuItem, "function", "should have registerItemMenuItem");
    assert.typeOf(mm.registerCollectionMenuItem, "function", "should have registerCollectionMenuItem");
    assert.typeOf(mm.registerItemPaneInfoRowMenuItem, "function", "should have registerItemPaneInfoRowMenuItem");
    assert.typeOf(mm.registerReaderMenubarViewMenuItem, "function", "should have registerReaderMenubarViewMenuItem");
    assert.typeOf(mm.registerContextMenuItem, "function", "should have registerContextMenuItem");
    assert.typeOf(mm.registerToolsMenuItem, "function", "should have registerToolsMenuItem");
    assert.typeOf(mm.registerItemSubmenu, "function", "should have registerItemSubmenu");
    assert.typeOf(mm.registerCollectionSubmenu, "function", "should have registerCollectionSubmenu");
    assert.typeOf(mm.registerReaderMenubarViewSubmenu, "function", "should have registerReaderMenubarViewSubmenu");
    assert.typeOf(mm.registerSubmenu, "function", "should have registerSubmenu");
    assert.typeOf(mm.registerStateDrivenMenu, "function", "should have registerStateDrivenMenu");
    assert.typeOf(mm.registerSeparator, "function", "should have registerSeparator");
    assert.typeOf(mm.getMenuCount, "function", "should have getMenuCount");
    assert.typeOf(mm.hasMenu, "function", "should have hasMenu");
    assert.typeOf(mm.getRegisteredMenuIds, "function", "should have getRegisteredMenuIds");
    assert.typeOf(mm.getMenuRegistrationSnapshot, "function", "should have getMenuRegistrationSnapshot");
    assert.typeOf(mm.getLiveMenuState, "function", "should have getLiveMenuState");
    assert.typeOf(mm.isOfficialAPIAvailable, "function", "should have isOfficialAPIAvailable");
    assert.typeOf(mm.MENU_TARGETS, "object", "should expose MENU_TARGETS");
    assert.typeOf(mm.MENU_TYPES, "object", "should expose MENU_TYPES");
    assert.typeOf(mm.TAB_TYPES, "object", "should expose TAB_TYPES");
  });

  it("should track cleanup via lifecycle", () => {
    let tracked = false;
    const lifecycle = {
      trackCleanup(fn) {
        tracked = true;
        assert.typeOf(fn, "function", "cleanup should be a function");
      },
    };

    createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
      lifecycle,
    });

    assert.ok(tracked, "lifecycle.trackCleanup should be called");
  });
});

describe("MenuManager Registration", () => {
  it("should register item menu item and return string ID", () => {
    const mockZotero = createMockZotero();
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    const id = mm.registerItemMenuItem({
      id: "test-item-menu",
      label: "Test Item Action",
      onCommand: () => {},
    });

    assert.typeOf(id, "string", "should return a string ID");
    assert.ok(id.length > 0, "ID should not be empty");
    assert.equal(mm.hasMenu(id), true, "hasMenu should be true after registration");

    const registered = mockZotero._getRegisteredMenus();
    assert.equal(registered.length, 1, "should have one registered menu");
    assert.equal(registered[0].target, MENU_TARGETS.LIBRARY_ITEM, "target should be LIBRARY_ITEM");
    assert.equal(registered[0].pluginID, "test-plugin", "pluginID should match");
    assert.ok(Array.isArray(registered[0].menus), "menus should be an array");
    assert.equal(registered[0].menus.length, 1, "should have one menu item");
  });

  it("should register collection menu item with different target", () => {
    const mockZotero = createMockZotero();
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    const id = mm.registerCollectionMenuItem({
      id: "test-collection-menu",
      label: "Test Collection Action",
      onCommand: () => {},
    });

    assert.typeOf(id, "string", "should return a string ID");

    const registered = mockZotero._getRegisteredMenus();
    assert.equal(registered.length, 1, "should have one registered menu");
    assert.equal(registered[0].target, MENU_TARGETS.LIBRARY_COLLECTION, "target should be LIBRARY_COLLECTION");
  });

  it("should register submenu correctly", () => {
    const mockZotero = createMockZotero();
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    const id = mm.registerSubmenu({
      id: "test-submenu",
      target: MENU_TARGETS.LIBRARY_ITEM,
      label: "Test Submenu",
      menus: [
        { label: "Child 1", onCommand: () => {} },
        { label: "Child 2", onCommand: () => {} },
      ],
    });

    assert.typeOf(id, "string", "should return a string ID");

    const registered = mockZotero._getRegisteredMenus();
    assert.equal(registered[0].menus[0].menuType, MENU_TYPES.SUBMENU, "menuType should be SUBMENU");
    assert.ok(Array.isArray(registered[0].menus[0].menus), "submenu should have child menus array");
    assert.equal(registered[0].menus[0].menus.length, 2, "submenu should have 2 children");
  });

  it("should register item submenu via convenience helper", () => {
    const mockZotero = createMockZotero();
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    const id = mm.registerItemSubmenu({
      id: "test-item-submenu",
      label: "Item Submenu",
      menus: [{ label: "Action", onCommand: () => {} }],
    });

    assert.typeOf(id, "string", "should return a string ID");
    const registered = mockZotero._getRegisteredMenus();
    assert.equal(registered[0].target, MENU_TARGETS.LIBRARY_ITEM, "target should be LIBRARY_ITEM");
    assert.equal(registered[0].menus[0].menuType, MENU_TYPES.SUBMENU, "menuType should be SUBMENU");
  });

  it("should register tools menu item", () => {
    const mockZotero = createMockZotero();
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    const id = mm.registerToolsMenuItem({
      id: "test-tools-menu",
      label: "Test Tools Action",
      onCommand: () => {},
    });

    assert.typeOf(id, "string", "should return a string ID");
    const registered = mockZotero._getRegisteredMenus();
    assert.equal(registered[0].target, MENU_TARGETS.MAIN_MENU_TOOLS, "target should be MAIN_MENU_TOOLS");
  });

  it("should register reader menubar view menu item", () => {
    const mockZotero = createMockZotero();
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    const id = mm.registerReaderMenubarViewMenuItem({
      id: "test-reader-menu",
      label: "Reader View Action",
      onCommand: () => {},
    });

    assert.typeOf(id, "string", "should return a string ID");
    const registered = mockZotero._getRegisteredMenus();
    assert.equal(registered[0].target, MENU_TARGETS.READER_MENU_VIEW, "target should be READER_MENU_VIEW");
  });

  it("should register item pane info row menu item", () => {
    const mockZotero = createMockZotero();
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    const id = mm.registerItemPaneInfoRowMenuItem({
      id: "test-info-row",
      label: "Info Row Action",
      onCommand: () => {},
    });

    assert.typeOf(id, "string", "should return a string ID");
    const registered = mockZotero._getRegisteredMenus();
    assert.equal(registered[0].target, MENU_TARGETS.ITEM_PANE_INFO_ROW, "target should be ITEM_PANE_INFO_ROW");
  });

  it("should register context menu item as alias for item menu item", () => {
    const mockZotero = createMockZotero();
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    const id = mm.registerContextMenuItem({
      id: "test-context-menu",
      label: "Context Action",
      onCommand: () => {},
    });

    assert.typeOf(id, "string", "should return a string ID");
    const registered = mockZotero._getRegisteredMenus();
    assert.equal(registered[0].target, MENU_TARGETS.LIBRARY_ITEM, "target should be LIBRARY_ITEM");
  });

  it("should register separator", () => {
    const mockZotero = createMockZotero();
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    const id = mm.registerSeparator(MENU_TARGETS.LIBRARY_ITEM, "test-separator");

    assert.typeOf(id, "string", "should return a string ID");
    const registered = mockZotero._getRegisteredMenus();
    assert.equal(registered[0].menus[0].menuType, MENU_TYPES.SEPARATOR, "menuType should be SEPARATOR");
  });

  it("should auto-generate id when not provided", () => {
    const mockZotero = createMockZotero();
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    const id = mm.registerItemMenuItem({
      label: "Auto ID Test",
      onCommand: () => {},
    });

    assert.typeOf(id, "string", "should return a string ID");
    assert.ok(id.startsWith("menu-"), "auto-generated ID should start with 'menu-'");
  });

  it("should return null when registering without target", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    const id = mm.register({ menus: [{ label: "No Target" }] });
    assert.equal(id, null, "should return null without target");
  });

  it("should return null when registering without menus", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    const id = mm.register({ target: MENU_TARGETS.LIBRARY_ITEM });
    assert.equal(id, null, "should return null without menus");
  });

  it("should return null when registering with empty menus array", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    const id = mm.register({ target: MENU_TARGETS.LIBRARY_ITEM, menus: [] });
    assert.equal(id, null, "should return null with empty menus");
  });
});

describe("MenuManager State-Driven Menu", () => {
  it("should register state driven menu and resolve state on showing", () => {
    const mockZotero = createMockZotero();
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    let resolveCalled = false;
    let buildCalled = false;

    const id = mm.registerStateDrivenMenu({
      id: "test-state-menu",
      target: MENU_TARGETS.LIBRARY_ITEM,
      baseMenu: { label: "Base" },
      resolveState(context) {
        resolveCalled = true;
        return { itemCount: context.items?.length || 0, hasSelection: (context.items?.length || 0) > 0 };
      },
      buildMenu({ state }) {
        buildCalled = true;
        return {
          label: state.hasSelection ? "With Selection" : "No Selection",
          visible: true,
          enabled: state.hasSelection,
        };
      },
    });

    assert.typeOf(id, "string", "should return a string ID");
    assert.equal(mm.hasMenu(id), true, "menu should be registered");

    // Trigger onShowing via the registered menu data
    const registered = mockZotero._getRegisteredMenus();
    const menuData = registered[0].menus[0];
    assert.typeOf(menuData.onShowing, "function", "menuData should have onShowing function");

    const mockElem = createMockMenuElement();
    const context = {
      menuElem: mockElem,
      items: [{ id: 1, itemType: "book" }],
      editable: true,
    };

    menuData.onShowing({}, context);

    assert.ok(resolveCalled, "resolveState should be called");
    assert.ok(buildCalled, "buildMenu should be called");
    assert.equal(mockElem.hidden, false, "menu should be visible");
    assert.equal(mockElem.disabled, false, "menu should be enabled when hasSelection is true");
  });

  it("should return null when state driven menu has no target", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    const id = mm.registerStateDrivenMenu({
      id: "no-target-menu",
      baseMenu: { label: "Test" },
    });

    assert.equal(id, null, "should return null without target");
  });

  it("should record live menu state after onShowing", () => {
    const mockZotero = createMockZotero();
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    const id = mm.registerStateDrivenMenu({
      id: "live-state-menu",
      target: MENU_TARGETS.LIBRARY_ITEM,
      baseMenu: { label: "Live" },
      resolveState: () => ({ count: 5 }),
      buildMenu: () => ({ visible: true, enabled: true }),
    });

    const registered = mockZotero._getRegisteredMenus();
    const menuData = registered[0].menus[0];

    const mockElem = createMockMenuElement();
    const context = {
      menuElem: mockElem,
      items: [{ id: 1 }],
    };

    menuData.onShowing({}, context);

    const liveState = mm.getLiveMenuState(id);
    assert.ok(liveState, "live state should be recorded");
    assert.equal(liveState.menuId, id, "live state should reference menuId");
    assert.equal(liveState.phase, "onShowing", "phase should be onShowing");
  });
});

describe("MenuManager Unregister", () => {
  it("should unregister menu by ID", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    const id = mm.registerItemMenuItem({
      id: "unregister-test",
      label: "Unregister Test",
      onCommand: () => {},
    });

    assert.equal(mm.hasMenu(id), true, "menu should exist before unregister");
    const result = mm.unregister(id);
    assert.equal(result, true, "unregister should return true");
    assert.equal(mm.hasMenu(id), false, "menu should not exist after unregister");
  });

  it("should be idempotent on unregister", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    const id = mm.registerItemMenuItem({
      id: "idempotent-test",
      label: "Idempotent Test",
      onCommand: () => {},
    });

    mm.unregister(id);
    const result = mm.unregister(id);
    assert.equal(result, false, "second unregister should return false");
  });

  it("should unregister all menus", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    mm.registerItemMenuItem({ id: "menu-1", label: "Menu 1", onCommand: () => {} });
    mm.registerItemMenuItem({ id: "menu-2", label: "Menu 2", onCommand: () => {} });
    mm.registerCollectionMenuItem({ id: "menu-3", label: "Menu 3", onCommand: () => {} });

    assert.equal(mm.getMenuCount(), 3, "should have 3 menus");
    mm.unregisterAll();
    assert.equal(mm.getMenuCount(), 0, "should have 0 menus after unregisterAll");
    assert.equal(mm.getRegisteredMenuIds().length, 0, "registered IDs should be empty");
  });
});

describe("MenuManager Queries", () => {
  it("should track menu count correctly", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    assert.equal(mm.getMenuCount(), 0, "count should start at 0");

    const id1 = mm.registerItemMenuItem({ id: "count-1", label: "Count 1", onCommand: () => {} });
    assert.equal(mm.getMenuCount(), 1, "count should be 1 after first register");

    const id2 = mm.registerItemMenuItem({ id: "count-2", label: "Count 2", onCommand: () => {} });
    assert.equal(mm.getMenuCount(), 2, "count should be 2 after second register");

    mm.unregister(id1);
    assert.equal(mm.getMenuCount(), 1, "count should be 1 after unregister");

    mm.unregister(id2);
    assert.equal(mm.getMenuCount(), 0, "count should be 0 after all unregistered");
  });

  it("should check menu registration state with hasMenu", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    assert.equal(mm.hasMenu("nonexistent"), false, "hasMenu should be false for unregistered");

    const id = mm.registerItemMenuItem({ id: "has-menu-test", label: "Has Menu", onCommand: () => {} });
    assert.equal(mm.hasMenu(id), true, "hasMenu should be true for registered");

    mm.unregister(id);
    assert.equal(mm.hasMenu(id), false, "hasMenu should be false after unregister");
  });

  it("should return array of registered IDs", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    assert.deepEqual(mm.getRegisteredMenuIds(), [], "should return empty array initially");

    const id1 = mm.registerItemMenuItem({ id: "ids-1", label: "IDs 1", onCommand: () => {} });
    const id2 = mm.registerCollectionMenuItem({ id: "ids-2", label: "IDs 2", onCommand: () => {} });

    const ids = mm.getRegisteredMenuIds();
    assert.equal(ids.length, 2, "should have 2 IDs");
    assert.ok(ids.includes(id1), "should include id1");
    assert.ok(ids.includes(id2), "should include id2");
  });

  it("should return menu registration snapshot", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    const id = mm.registerItemMenuItem({
      id: "snapshot-test",
      label: "Snapshot",
      onCommand: () => {},
    });

    const snapshot = mm.getMenuRegistrationSnapshot(id);
    assert.ok(snapshot, "snapshot should exist");
    assert.equal(snapshot.id, id, "snapshot id should match");
    assert.equal(snapshot.target, MENU_TARGETS.LIBRARY_ITEM, "snapshot target should match");
    assert.equal(snapshot.useOfficialAPI, true, "snapshot should indicate official API");
    assert.ok(Array.isArray(snapshot.menuPaths), "snapshot menuPaths should be array");
    assert.ok(Array.isArray(snapshot.menus), "snapshot menus should be array");

    const allSnapshots = mm.getMenuRegistrationSnapshot();
    assert.ok(Array.isArray(allSnapshots), "all snapshots should be array");
    assert.equal(allSnapshots.length, 1, "should have 1 snapshot");
  });

  it("should return null snapshot for unregistered menu", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero(),
    });

    const snapshot = mm.getMenuRegistrationSnapshot("nonexistent");
    assert.equal(snapshot, null, "should return null for unregistered menu");
  });
});

describe("MenuManager Official API", () => {
  it("should return true when official API is available", () => {
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: createMockZotero({ hasMenuManager: true }),
    });

    assert.equal(mm.isOfficialAPIAvailable(), true, "should return true when MenuManager exists");
  });

  it("should return false when official API is absent", () => {
    const mockZotero = createMockZotero({ hasMenuManager: false });
    const mm = createMenuManager({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero,
    });

    assert.ok(!mm.isOfficialAPIAvailable(), "should return falsy when MenuManager absent");
  });
});

describe("MenuManager globalThis.Zotero fallback", () => {
  it("should use globalThis.Zotero when zotero option not provided", () => {
    const saved = globalThis.Zotero;
    const mockZotero = createMockZotero();
    globalThis.Zotero = mockZotero;

    try {
      const mm = createMenuManager({
        logger: createMockLogger(),
        pluginID: "test-plugin",
        // no zotero option
      });

      assert.equal(mm.isOfficialAPIAvailable(), true, "should use globalThis.Zotero fallback");

      const id = mm.registerItemMenuItem({
        id: "fallback-test",
        label: "Fallback Test",
        onCommand: () => {},
      });

      assert.typeOf(id, "string", "should register using globalThis.Zotero");
      assert.ok(mockZotero._getRegisteredMenus().length > 0, "should register via globalThis.Zotero");
    } finally {
      globalThis.Zotero = saved;
    }
  });
});

describe("MenuManager createMenuStateResolver", () => {
  it("should create resolver that extracts context state", () => {
    const resolver = createMenuStateResolver();
    const state = resolver({
      items: [{ itemType: "book" }, { itemType: "book" }],
      editable: true,
      tabID: "tab-1",
      tabType: "library",
    });

    assert.equal(state.itemCount, 2, "itemCount should be 2");
    assert.equal(state.hasItems, true, "hasItems should be true");
    assert.equal(state.selectedType, "book", "selectedType should be 'book'");
    assert.equal(state.editable, true, "editable should be true");
    assert.equal(state.tabID, "tab-1", "tabID should match");
    assert.equal(state.tabType, "library", "tabType should match");
  });

  it("should create resolver with preference keys", () => {
    const prefs = {
      get(key) {
        if (key === "pref.test") return true;
        return null;
      },
    };

    const resolver = createMenuStateResolver({
      prefs,
      preferenceKeys: ["pref.test", "pref.missing"],
    });

    const state = resolver({ items: [] });
    assert.equal(state.preferenceFlags["pref.test"], true, "existing pref should be true");
    assert.equal(state.preferenceFlags["pref.missing"], null, "missing pref should be null");
  });

  it("should create resolver with extra resolvers", () => {
    const resolver = createMenuStateResolver({
      extraResolvers: [
        (context, state) => ({ customField: 42 }),
      ],
    });

    const state = resolver({ items: [] });
    assert.equal(state.customField, 42, "extra resolver should add customField");
  });

  it("should handle mixed item kinds", () => {
    const resolver = createMenuStateResolver();
    const state = resolver({
      items: [
        { itemType: "book" },
        { isNote: () => true, itemType: "note" },
        { isAttachment: () => true, itemType: "attachment" },
      ],
    });

    assert.equal(state.itemKinds.noteCount, 1, "should have 1 note");
    assert.equal(state.itemKinds.attachmentCount, 1, "should have 1 attachment");
    assert.equal(state.itemKinds.regularCount, 1, "should have 1 regular");
    assert.equal(state.itemKinds.mixed, true, "should be mixed");
  });
});

await runTestsIfMain(import.meta.url);
