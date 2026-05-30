/**
 * Tests for Research Workbench Common feature
 * Workbench shell manager, bridge API, and data collection helpers
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  createWorkbenchShellManager,
  createWorkbenchBridgeAPI,
  collectItemRelationships,
  collectAnnotations,
  collectNotes,
  collectCreatorString,
  resolveYear,
  resolvePublicationName,
  resolveBridgeKey,
} from "../../src/features/research-workbench-common.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(msg, details) { logs.push({ level: "debug", msg, details }); },
    getLogs() { return logs; },
  };
}

function createMockWindow(href = "") {
  const listeners = {};
  return {
    closed: false,
    location: { href },
    document: {
      readyState: "complete",
      documentElement: {
        setAttribute() {},
        getAttribute() { return null; },
      },
    },
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      if (listeners[type]) {
        const idx = listeners[type].indexOf(handler);
        if (idx !== -1) listeners[type].splice(idx, 1);
      }
    },
    __listeners: listeners,
  };
}

function createMockHost() {
  const windows = [];
  return {
    listWindowsByType() { return windows; },
    getPrimaryWindow() { return windows[0] || null; },
    addWindow(win) { windows.push(win); },
  };
}

function createMockItem(overrides = {}) {
  return {
    id: 1,
    title: "Test Item",
    itemType: "journalArticle",
    date: "2024-01-15",
    publicationTitle: "Journal of Testing",
    creators: [
      { firstName: "John", lastName: "Doe" },
      { firstName: "Jane", lastName: "Smith" },
    ],
    getField(field) { return this[field] || ""; },
    getCreators() { return this.creators; },
    getNotes() { return []; },
    getAttachments() { return []; },
    getTags() { return []; },
    ...overrides,
  };
}

function createMockZotero() {
  return {
    Items: {
      get(id) {
        return id === 1
          ? createMockItem()
          : null;
      },
      searchByTag() { return []; },
    },
    Relations: {
      getByItem() { return []; },
    },
    URI: {
      getItemID() { return null; },
    },
  };
}

describe("ResearchWorkbenchCommon", () => {
  it("resolveBridgeKey should generate expected bridge key", () => {
    assert.equal(resolveBridgeKey("toolsbox"), "__toolsbox_WorkbenchBridge__", "should replace hyphens");
    assert.equal(resolveBridgeKey("my-addon"), "__my_addon_WorkbenchBridge__", "should replace hyphens with underscores");
  });

  it("createWorkbenchBridgeAPI should return frozen API object", () => {
    const api = createWorkbenchBridgeAPI({
      getSnapshot: () => ({ test: true }),
      getThemeMode: () => "dark",
    });
    assert.typeOf(api.getSnapshot, "function", "should have getSnapshot");
    assert.typeOf(api.getThemeMode, "function", "should have getThemeMode");
    assert.equal(api.getThemeMode(), "dark", "should use provided function");
    assert.deepEqual(api.getSnapshot(), { test: true }, "should use provided snapshot");
  });

  it("createWorkbenchBridgeAPI should use defaults when functions missing", () => {
    const api = createWorkbenchBridgeAPI({});
    assert.deepEqual(api.getSnapshot(), {}, "should default to empty object");
    assert.equal(api.getThemeMode(), "light", "should default to light");
  });

  it("collectItemRelationships should return nodes and edges", () => {
    const item = createMockItem();
    const zotero = createMockZotero();
    const result = collectItemRelationships(item, zotero);
    assert.ok(Array.isArray(result.nodes), "should have nodes array");
    assert.ok(Array.isArray(result.edges), "should have edges array");
    assert.ok(result.nodes.length > 0, "should include item node");
    assert.equal(result.nodes[0].id, 1, "first node should be the item");
  });

  it("collectItemRelationships should handle missing item or zotero", () => {
    const empty = collectItemRelationships(null, null);
    assert.deepEqual(empty.nodes, [], "should return empty nodes");
    assert.deepEqual(empty.edges, [], "should return empty edges");
  });

  it("collectAnnotations should return array from reader", () => {
    const reader = {
      getAnnotations() {
        return [{ id: 1, text: "note" }];
      },
    };
    const result = collectAnnotations(1, reader);
    assert.equal(result.length, 1, "should return annotations");
    assert.equal(result[0].text, "note", "should have annotation text");
  });

  it("collectAnnotations should handle missing reader", () => {
    assert.deepEqual(collectAnnotations(1, null), [], "should return empty array");
    assert.deepEqual(collectAnnotations(1, {}), [], "should return empty array without getAnnotations");
  });

  it("collectNotes should return notes from item", () => {
    const zotero = createMockZotero();
    const item = createMockItem({
      getNotes() { return [2]; },
    });
    zotero.Items.get = (id) => {
      if (id === 2) {
        return { id: 2, note: "test note", dateAdded: "2024-01-01", dateModified: "2024-01-02" };
      }
      return null;
    };
    const result = collectNotes(item, zotero);
    assert.equal(result.length, 1, "should collect note");
    assert.equal(result[0].text, "test note", "should have note text");
    assert.equal(result[0].id, 2, "should have note id");
  });

  it("collectNotes should handle missing item or zotero", () => {
    assert.deepEqual(collectNotes(null, null), [], "should return empty array");
    assert.deepEqual(collectNotes({}, {}), [], "should return empty array");
  });

  it("collectCreatorString should format creators semicolon-separated", () => {
    const item = createMockItem();
    const result = collectCreatorString(item);
    assert.equal(result, "Doe, John; Smith, Jane", "should format creators");
  });

  it("collectCreatorString should handle errors gracefully", () => {
    assert.equal(collectCreatorString(null), "", "should return empty for null");
  });

  it("resolveYear should extract 4-digit year from date", () => {
    const item = createMockItem();
    assert.equal(resolveYear(item), "2024", "should extract year");
    assert.equal(resolveYear({ date: "1999-05-20" }), "1999", "should extract 1999");
    assert.equal(resolveYear({}), "", "should return empty for missing date");
  });

  it("resolvePublicationName should find publication title", () => {
    const item = createMockItem();
    assert.equal(resolvePublicationName(item), "Journal of Testing", "should find publicationTitle");

    const confItem = {
      getField(field) {
        if (field === "conferenceName") return "Conf";
        return "";
      },
    };
    assert.equal(resolvePublicationName(confItem), "Conf", "should fallback to conferenceName");
    assert.equal(resolvePublicationName({}), "", "should return empty for missing");
  });

  it("createWorkbenchShellManager should return shell with open method", () => {
    const logger = createMockLogger();
    const host = createMockHost();
    const shell = createWorkbenchShellManager({
      logger,
      host,
      rootURI: "chrome://toolsbox/content/",
      addonRef: "toolsbox",
      addonName: "ToolsBox",
      shellFileName: "workbench.html",
      windowName: "toolsbox-workbench",
    });
    assert.typeOf(shell.open, "function", "should have open method");
    assert.typeOf(shell.refresh, "function", "should have refresh method");
    assert.typeOf(shell.close, "function", "should have close method");
  });
});

await runTestsIfMain(import.meta.url);
