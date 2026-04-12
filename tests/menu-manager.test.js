import { describe, it, assert } from "./test-framework.js";
import {
  createMenuManager,
  createMenuStateResolver,
} from "../src/features/menu-manager.js";

function createManagerHarness() {
  const calls = [];
  const unregisterCalls = [];
  const manager = createMenuManager({
    logger: {
      debug() {},
      error() {},
    },
    lifecycle: null,
    i18n: null,
    pluginID: "cleanroom-template@example.com",
    zotero: {
      MenuManager: {
        registerMenu(options) {
          calls.push(options);
          return `${options.pluginID}:${options.menuID}`;
        },
        unregisterMenu(menuID) {
          unregisterCalls.push(menuID);
        },
      },
    },
  });

  return { manager, calls, unregisterCalls };
}

function createFakeElement(tagName, ownerDocument) {
  return {
    tagName,
    ownerDocument,
    parentNode: null,
    childNodes: [],
    attributes: {},
    listeners: {},
    label: null,
    hidden: false,
    disabled: false,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === "label") {
        this.label = String(value);
      }
    },
    getAttribute(name) {
      return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
    },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === "label") {
        this.label = null;
      }
    },
    appendChild(child) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.childNodes = [];
      children.forEach((child) => {
        this.appendChild(child);
      });
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
  };
}

function createFakeDocument() {
  const ownerDocument = {
    createXULElement(tagName) {
      return createFakeElement(tagName, ownerDocument);
    },
    createElement(tagName) {
      return createFakeElement(tagName, ownerDocument);
    },
  };
  return ownerDocument;
}

describe("Menu Manager", () => {
  it("should register scene-oriented item and item-pane helpers to the expected official targets", () => {
    const { manager, calls } = createManagerHarness();

    manager.registerItemMenuItem({
      id: "item-action",
      label: "Item Action",
      onCommand() {},
    });
    manager.registerItemPaneInfoRowMenuItem({
      id: "field-action",
      label: "Field Action",
      onCommand() {},
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].target, manager.MENU_TARGETS.LIBRARY_ITEM);
    assert.equal(calls[0].menus[0].label, "Item Action");
    assert.equal(calls[1].target, manager.MENU_TARGETS.ITEM_PANE_INFO_ROW);
    assert.equal(calls[1].menus[0].label, "Field Action");
  });

  it("should register scene-oriented reader menubar helper to reader/menubar/view", () => {
    const { manager, calls } = createManagerHarness();

    manager.registerReaderMenubarViewMenuItem({
      id: "reader-view-action",
      label: "Reader View Action",
      onCommand() {},
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].target, manager.MENU_TARGETS.READER_MENU_VIEW);
    assert.equal(calls[0].menus[0].label, "Reader View Action");
  });

  it("should register scene-oriented submenu helpers to the expected official targets", () => {
    const { manager, calls } = createManagerHarness();

    manager.registerItemSubmenu({
      id: "item-submenu",
      label: "Item Group",
      menus: [{
        menuType: manager.MENU_TYPES.MENUITEM,
        label: "Child Action",
      }],
    });
    manager.registerCollectionSubmenu({
      id: "collection-submenu",
      label: "Collection Group",
      menus: [{
        menuType: manager.MENU_TYPES.MENUITEM,
        label: "Collection Action",
      }],
    });
    manager.registerReaderMenubarViewSubmenu({
      id: "reader-submenu",
      label: "Reader Group",
      menus: [{
        menuType: manager.MENU_TYPES.MENUITEM,
        label: "Reader Action",
      }],
    });

    assert.equal(calls.length, 3);
    assert.equal(calls[0].target, manager.MENU_TARGETS.LIBRARY_ITEM);
    assert.equal(calls[1].target, manager.MENU_TARGETS.LIBRARY_COLLECTION);
    assert.equal(calls[2].target, manager.MENU_TARGETS.READER_MENU_VIEW);
    assert.equal(calls[0].menus[0].menuType, manager.MENU_TYPES.SUBMENU);
    assert.equal(calls[1].menus[0].menuType, manager.MENU_TYPES.SUBMENU);
    assert.equal(calls[2].menus[0].menuType, manager.MENU_TYPES.SUBMENU);
  });

  it("should keep the legacy context menu alias wired to the item scene helper", () => {
    const { manager, calls } = createManagerHarness();

    manager.registerContextMenuItem({
      id: "context-item",
      l10nID: "cleanroom-menu-label",
      onCommand() {},
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].target, manager.MENU_TARGETS.LIBRARY_ITEM);
    assert.equal(calls[0].menus[0].l10nID, "cleanroom-menu-label");
    assert.equal("label" in calls[0].menus[0], false);
  });

  it("should keep the legacy reader menu alias wired to the requested reader target", () => {
    const { manager, calls } = createManagerHarness();

    manager.registerReaderMenuItem(
      {
        target: manager.MENU_TARGETS.READER_MENU_VIEW,
      },
      {
        id: "reader-item",
        label: "Reader Action",
        onCommand() {},
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].target, manager.MENU_TARGETS.READER_MENU_VIEW);
    assert.equal(calls[0].menus[0].label, "Reader Action");
    assert.equal("l10nID" in calls[0].menus[0], false);
  });

  it("should keep the generic submenu alias available for cross-target compatibility", () => {
    const { manager, calls } = createManagerHarness();

    manager.registerSubmenu({
      id: "legacy-submenu",
      target: manager.MENU_TARGETS.LIBRARY_COLLECTION,
      label: "Legacy Group",
      menus: [{
        menuType: manager.MENU_TYPES.MENUITEM,
        label: "Legacy Action",
      }],
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].target, manager.MENU_TARGETS.LIBRARY_COLLECTION);
    assert.equal(calls[0].menus[0].menuType, manager.MENU_TYPES.SUBMENU);
    assert.equal(calls[0].menus[0].label, "Legacy Group");
  });

  it("should retain the host returned menu id for legacy alias snapshotting and cleanup", () => {
    const { manager, unregisterCalls } = createManagerHarness();

    const menuID = manager.registerReaderMenuItem(
      {
        target: manager.MENU_TARGETS.READER_MENU_VIEW,
      },
      {
        id: "reader-item",
        label: "Reader Action",
        onCommand() {},
      },
    );

    assert.equal(menuID, "reader-item");
    assert.deepEqual(manager.getMenuRegistrationSnapshot(menuID), {
      id: "reader-item",
      registeredMenuID: "cleanroom-template@example.com:reader-item",
      target: manager.MENU_TARGETS.READER_MENU_VIEW,
      useOfficialAPI: true,
      menuPaths: ["0"],
      menus: [{
        menuType: "menuitem",
        label: "Reader Action",
      }],
    });

    assert.equal(manager.unregister(menuID), true);
    assert.deepEqual(unregisterCalls, ["cleanroom-template@example.com:reader-item"]);
  });

  it("should normalize reusable menu state from context and preference flags", () => {
    const resolveState = createMenuStateResolver({
      prefs: {
        get(key) {
          return key === "feature.enabled" ? true : "compact";
        },
      },
      preferenceKeys: ["feature.enabled", "feature.mode"],
      extraResolvers: [
        (context, state) => ({
          selectionSummary: `${state.itemCount}:${context.tabSubType || "-"}`,
        }),
      ],
    });

    const state = resolveState({
      items: [
        {
          itemType: "note",
          isNote() {
            return true;
          },
        },
        {
          itemType: "note",
          isNote() {
            return true;
          },
        },
      ],
      editable: true,
      tabID: "reader-tab",
      tabType: "reader",
      tabSubType: "pdf",
      fieldName: "title",
      library: {
        libraryType: "group",
      },
      collectionTreeRow: {
        id: "C-1",
        type: "collection",
      },
    });

    assert.deepEqual(state, {
      itemCount: 2,
      hasItems: true,
      selectedType: "note",
      selectedTypes: ["note"],
      editable: true,
      tabID: "reader-tab",
      tabType: "reader",
      tabSubType: "pdf",
      fieldName: "title",
      libraryType: "group",
      hasCollectionSelection: true,
      hasSavedSearchSelection: false,
      collectionTreeRowID: "C-1",
      collectionTreeRowType: "collection",
      preferenceFlags: {
        "feature.enabled": true,
        "feature.mode": "compact",
      },
      itemKinds: {
        noteCount: 2,
        attachmentCount: 0,
        regularCount: 0,
        hasNotes: true,
        hasAttachments: false,
        hasRegularItems: false,
        mixed: false,
      },
      selectionSummary: "2:pdf",
    });
  });

  it("should resolve state-driven menus, rebuild submenus, and record the resolved state", () => {
    const { manager, calls } = createManagerHarness();
    const ownerDocument = createFakeDocument();
    const popupElem = createFakeElement("menupopup", ownerDocument);
    const menuElem = createFakeElement("menu", ownerDocument);
    const submenuPopup = createFakeElement("menupopup", ownerDocument);
    menuElem.menupopup = submenuPopup;
    menuElem.popup = submenuPopup;
    menuElem.appendChild(submenuPopup);
    popupElem.appendChild(menuElem);

    const visibilityCalls = [];
    const enabledCalls = [];

    manager.registerStateDrivenMenu({
      id: "dynamic-reader-menu",
      target: manager.MENU_TARGETS.READER_MENU_VIEW,
      baseMenu: {
        menuType: manager.MENU_TYPES.SUBMENU,
        label: "Placeholder",
        menus: [{
          menuType: manager.MENU_TYPES.MENUITEM,
          label: "Placeholder Action",
        }],
      },
      resolveState: createMenuStateResolver({
        prefs: {
          get() {
            return true;
          },
        },
        preferenceKeys: ["reader.summary.enabled"],
      }),
      buildMenu({ state }) {
        return {
          label: "Reader Summary",
          visible: state.itemCount > 0,
          disabled: state.tabSubType !== "pdf",
          menus: [
            {
              menuType: manager.MENU_TYPES.MENUITEM,
              label: `Summarize ${state.itemCount} items`,
              onCommand() {},
            },
            {
              menuType: manager.MENU_TYPES.MENUITEM,
              label: "Export Notes",
            },
          ],
        };
      },
    });

    assert.equal(calls.length, 1);
    calls[0].menus[0].onShowing(null, {
      menuElem,
      items: [{ itemType: "attachment" }, { itemType: "note" }],
      tabType: "reader",
      tabSubType: "pdf",
      editable: true,
      setVisible(visible) {
        visibilityCalls.push(visible);
      },
      setEnabled(enabled) {
        enabledCalls.push(enabled);
      },
    });

    assert.deepEqual(visibilityCalls, [true]);
    assert.deepEqual(enabledCalls, [true]);
    assert.equal(menuElem.label, "Reader Summary");
    assert.equal(submenuPopup.childNodes.length, 2);
    assert.deepEqual(
      submenuPopup.childNodes.map((child) => child.label),
      ["Summarize 2 items", "Export Notes"],
    );

    const liveState = manager.getLiveMenuState("dynamic-reader-menu");
    assert.equal(liveState.menuId, "dynamic-reader-menu");
    assert.equal(liveState.menuPath, "0");
    assert.equal(liveState.menuElem, menuElem);
    assert.equal(liveState.popupElem, popupElem);
    assert.equal(liveState.itemCount, 2);
    assert.equal(liveState.tabType, "reader");
    assert.equal(liveState.tabSubType, "pdf");
    assert.equal(liveState.editable, true);
    assert.equal(liveState.phase, "onShowing");
    assert.ok(typeof liveState.observedAt === "string" && liveState.observedAt.length > 0);
    assert.deepEqual(liveState.resolvedState, {
      itemCount: 2,
      hasItems: true,
      selectedType: "mixed",
      selectedTypes: ["attachment", "note"],
      editable: true,
      tabID: null,
      tabType: "reader",
      tabSubType: "pdf",
      fieldName: null,
      libraryType: null,
      hasCollectionSelection: false,
      hasSavedSearchSelection: false,
      collectionTreeRowID: null,
      collectionTreeRowType: null,
      preferenceFlags: {
        "reader.summary.enabled": true,
      },
      itemKinds: {
        noteCount: 1,
        attachmentCount: 1,
        regularCount: 0,
        hasNotes: true,
        hasAttachments: true,
        hasRegularItems: false,
        mixed: true,
      },
    });
    assert.deepEqual(liveState.resolvedMenu, {
      menuType: "submenu",
      label: "Reader Summary",
      menus: [
        {
          menuType: "menuitem",
          label: "Summarize 2 items",
        },
        {
          menuType: "menuitem",
          label: "Export Notes",
        },
      ],
      visible: true,
      disabled: false,
    });

    const childLiveState = manager.getLiveMenuState("dynamic-reader-menu", "0.0");
    assert.equal(childLiveState.menuId, "dynamic-reader-menu");
    assert.equal(childLiveState.menuPath, "0.0");
    assert.equal(childLiveState.menuElem?.label, "Summarize 2 items");
    assert.equal(childLiveState.popupElem, submenuPopup);
    assert.equal(childLiveState.phase, "dynamic-rebuild");
    assert.deepEqual(childLiveState.resolvedState, liveState.resolvedState);
    assert.deepEqual(childLiveState.resolvedMenu, {
      menuType: "menuitem",
      label: "Summarize 2 items",
    });

    submenuPopup.childNodes[0].listeners.command?.({ type: "command" });
    assert.equal(manager.getLiveMenuState("dynamic-reader-menu", "0.0").phase, "onCommand");
  });
});
