import { describe, it, assert } from "./test-framework.js";
import {
  registerResearchWorkflowFeatures,
  registerWorkflowItemPane,
  registerWorkflowMenus,
  registerWorkflowReaderFeatures,
} from "../src/features/research-workflow.js";

function createPrefs(values = {}) {
  return {
    get(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
  };
}

function createItem() {
  return {
    tags: [],
    extra: "",
    saved: 0,
    getTags() {
      return this.tags;
    },
    addTag(tag) {
      this.tags.push({ tag });
    },
    removeTag(tag) {
      this.tags = this.tags.filter((entry) => entry.tag !== tag);
    },
    getField(field) {
      return this[field] || "";
    },
    setField(field, value) {
      this[field] = value;
    },
    async saveTx() {
      this.saved += 1;
    },
  };
}

function createFakeDoc() {
  return {
    createElement(tagName) {
      return {
        tagName,
        childNodes: [],
        attributes: {},
        value: "",
        textContent: "",
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        appendChild(child) {
          this.childNodes.push(child);
          return child;
        },
        addEventListener(type, listener) {
          this[`on${type}`] = listener;
        },
      };
    },
  };
}

function findElement(node, predicate) {
  if (!node) {
    return null;
  }
  if (predicate(node)) {
    return node;
  }
  const children = Array.isArray(node.childNodes) ? node.childNodes : [];
  for (const child of children) {
    const match = findElement(child, predicate);
    if (match) {
      return match;
    }
  }
  return null;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("Research Workflow Feature", () => {
  it("should register and render an Item Pane workflow editor that writes local state", async () => {
    const sections = [];
    const itemPane = {
      registerSection(options) {
        sections.push(options);
        return options.paneID;
      },
    };
    const item = createItem();

    const paneID = registerWorkflowItemPane({
      itemPane,
      prefs: createPrefs(),
      i18n: { t(_key, fallback) { return fallback; } },
      addonRef: "toolsbox",
    });

    assert.equal(paneID, "toolsbox-workflow");
    assert.equal(sections[0].header.l10nID, "cleanroom-workflow-section-header");

    const doc = createFakeDoc();
    const body = doc.createElement("div");
    sections[0].onRender({ doc, body, item });

    findElement(body, (node) => node.attributes?.id === "toolsbox-workflow-status").value = "done";
    findElement(body, (node) => node.attributes?.id === "toolsbox-workflow-rating").value = "5";
    findElement(body, (node) => node.attributes?.id === "toolsbox-workflow-text-tags").value = "focus, review";
    findElement(body, (node) => node.attributes?.id === "toolsbox-workflow-remark").value = "ready";
    const save = findElement(body, (node) => node.attributes?.["data-toolsbox-workflow-action"] === "save");
    save.onclick();
    await flush();

    assert.deepEqual(item.tags.map((entry) => entry.tag), ["/done", "#focus", "#review", "*****"]);
    assert.equal(item.extra, "Remark: ready");
    assert.equal(item.saved, 1);
  });

  it("should register item and collection workflow menus with batch actions", async () => {
    const registrations = [];
    const menuManager = {
      MENU_TARGETS: {
        LIBRARY_ITEM: "main/library/item",
        LIBRARY_COLLECTION: "main/library/collection",
      },
      MENU_TYPES: {
        SUBMENU: "submenu",
      },
      registerStateDrivenMenu(config) {
        registrations.push(config);
        return config.id;
      },
    };
    const item = createItem();

    const menuIDs = registerWorkflowMenus({
      menuManager,
      prefs: createPrefs(),
      i18n: { t(_key, fallback) { return fallback; } },
      addonRef: "toolsbox",
    });

    assert.deepEqual(menuIDs, ["toolsbox-workflow-item-menu", "toolsbox-workflow-collection-menu"]);
    const state = registrations[0].resolveState({ items: [item] });
    const menu = registrations[0].buildMenu({ state });
    assert.equal(menu.visible, true);
    assert.equal(menu.menus.length > 4, true);

    menu.menus[0].onCommand(null, { items: [item] });
    await flush();
    assert.equal(item.tags.some((entry) => entry.tag === "/todo"), true);

    const collectionState = registrations[1].resolveState({ items: [item] });
    const collectionMenu = registrations[1].buildMenu({ state: collectionState });
    assert.equal(collectionMenu.menus[0].disabled, true);
    assert.includes(collectionMenu.menus[0].label, "Total:1");
  });

  it("should register Reader toolbar, view, menubar, and annotation workflow actions", async () => {
    const readerEvents = [];
    const viewMenus = [];
    const annotationMenus = [];
    const updated = [];
    const readerItem = createItem();
    const reader = {
      READER_EVENT_TYPES: {
        RENDER_TOOLBAR: "renderToolbar",
      },
      registerEventListener(type, handler) {
        readerEvents.push({ type, handler });
        return () => {};
      },
      registerViewContextMenuItem(factory) {
        viewMenus.push(factory);
        return () => {};
      },
      registerAnnotationContextMenuItem(factory) {
        annotationMenus.push(factory);
        return () => {};
      },
      getReaderSummary() {
        return { tabID: "reader-1", itemID: 7 };
      },
      getWindowStates() {
        return [{ tabID: "reader-1", itemID: 7, location: { pageLabel: "12" } }];
      },
      getItemByID(itemID) {
        return itemID === 7 ? readerItem : null;
      },
      async updateAnnotation(id, patch) {
        updated.push({ id, patch });
      },
    };
    const readerMenus = [];
    const menuManager = {
      MENU_TYPES: {
        MENUITEM: "menuitem",
      },
      registerReaderMenubarViewSubmenu(config) {
        readerMenus.push(config);
        return config.id;
      },
    };

    const registered = registerWorkflowReaderFeatures({
      menuManager,
      reader,
      prefs: createPrefs(),
      i18n: { t(_key, fallback) { return fallback; } },
      addonRef: "toolsbox",
    });

    assert.deepEqual(registered, [
      "toolsbox-workflow-reader-menu",
      "reader:renderToolbar",
      "reader:viewContext",
      "reader:annotationContext",
    ]);
    assert.equal(readerEvents[0].type, "renderToolbar");
    assert.equal(readerMenus[0].l10nID, "cleanroom-workflow-reader-menu");

    readerMenus[0].menus[0].onCommand({ params: { itemID: 7 } });
    await flush();
    assert.equal(readerItem.extra, "Reading Progress: page 12");

    const annotationItems = annotationMenus[0]({ params: { annotationID: 44 } });
    annotationItems[0].onCommand();
    await flush();
    assert.deepEqual(updated, [{ id: 44, patch: { comment: "Workflow: reviewed" } }]);
  });

  it("should compose workflow registrations from the baseline feature entry", () => {
    const result = registerResearchWorkflowFeatures({
      config: { addonRef: "toolsbox" },
      prefs: createPrefs(),
      i18n: { t(_key, fallback) { return fallback; } },
      itemPane: {
        registerSection(options) {
          return options.paneID;
        },
      },
      menuManager: {
        MENU_TARGETS: {
          LIBRARY_ITEM: "main/library/item",
          LIBRARY_COLLECTION: "main/library/collection",
        },
        MENU_TYPES: {
          SUBMENU: "submenu",
        },
        registerStateDrivenMenu(config) {
          return config.id;
        },
      },
      reader: {},
    });

    assert.equal(result.itemPaneSection, "toolsbox-workflow");
    assert.deepEqual(result.menus, ["toolsbox-workflow-item-menu", "toolsbox-workflow-collection-menu"]);
    assert.deepEqual(result.readerFeatures, []);
  });
});
