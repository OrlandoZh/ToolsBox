/**
 * Tests for Item Tree feature
 * createItemTree factory and column lifecycle
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createItemTree } from "../../src/features/item-tree.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(msg, details) { logs.push({ level: 'debug', msg, details }); },
    error(msg, details) { logs.push({ level: 'error', msg, details }); },
    getLogs() { return logs; }
  };
}

function createMockElement(tag = 'span') {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    style: {},
    ownerDocument: null
  };
  el.ownerDocument = {
    createElement: (tagName) => createMockElement(tagName)
  };
  return el;
}

function createMockZotero(overrides = {}) {
  const columns = new Map();
  return {
    ItemTreeManager: {
      registerColumn(config) {
        columns.set(config.dataKey, config);
        return config.dataKey;
      },
      unregisterColumn(dataKey) {
        columns.delete(dataKey);
      },
      refreshColumns() {},
      getColumns() { return columns; }
    },
    ...overrides
  };
}

describe("ItemTree", () => {
  it("should return object with all expected methods", () => {
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin"
    });

    assert.typeOf(itemTree.isAvailable, 'function', "should have isAvailable");
    assert.typeOf(itemTree.registerColumn, 'function', "should have registerColumn");
    assert.typeOf(itemTree.unregisterColumn, 'function', "should have unregisterColumn");
    assert.typeOf(itemTree.hasColumn, 'function', "should have hasColumn");
    assert.typeOf(itemTree.getColumnCount, 'function', "should have getColumnCount");
    assert.typeOf(itemTree.refreshColumns, 'function', "should have refreshColumns");
    assert.typeOf(itemTree.unregisterAll, 'function', "should have unregisterAll");
    assert.typeOf(itemTree.createFieldDataProvider, 'function', "should have createFieldDataProvider");
    assert.typeOf(itemTree.createFormattedDataProvider, 'function', "should have createFormattedDataProvider");
    assert.typeOf(itemTree.createDefaultCellRenderer, 'function', "should have createDefaultCellRenderer");
    assert.typeOf(itemTree.createConditionalCellRenderer, 'function', "should have createConditionalCellRenderer");
  });

  it("isAvailable should be true when ItemTreeManager present", () => {
    const mockZotero = createMockZotero();
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    assert.equal(itemTree.isAvailable(), true, "isAvailable should be true");
  });

  it("isAvailable should be false when ItemTreeManager absent", () => {
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: {}
    });

    assert.equal(itemTree.isAvailable(), false, "isAvailable should be false");
  });

  it("registerColumn should call Zotero.ItemTreeManager.registerColumn", () => {
    const mockZotero = createMockZotero();
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const result = itemTree.registerColumn({
      dataKey: "test-column",
      label: "Test Column",
      dataProvider: () => "value"
    });

    assert.equal(result, "test-column", "should return dataKey");
    assert.equal(itemTree.hasColumn("test-column"), true, "should track registered column");
    assert.equal(itemTree.getColumnCount(), 1, "count should be 1");
  });

  it("registerColumn should reject without dataKey", () => {
    const mockZotero = createMockZotero();
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const result = itemTree.registerColumn({
      label: "No Key",
      dataProvider: () => ""
    });

    assert.equal(result, null, "should return null without dataKey");
    assert.equal(itemTree.getColumnCount(), 0, "count should be 0");
  });

  it("registerColumn should reject without dataProvider", () => {
    const mockZotero = createMockZotero();
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const result = itemTree.registerColumn({
      dataKey: "no-provider",
      label: "No Provider"
    });

    assert.equal(result, null, "should return null without dataProvider");
    assert.equal(itemTree.getColumnCount(), 0, "count should be 0");
  });

  it("unregisterColumn should remove column", () => {
    const mockZotero = createMockZotero();
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    itemTree.registerColumn({
      dataKey: "removable",
      label: "Removable",
      dataProvider: () => ""
    });

    assert.equal(itemTree.hasColumn("removable"), true, "should have column before unregister");
    assert.equal(itemTree.unregisterColumn("removable"), true, "unregister should return true");
    assert.equal(itemTree.hasColumn("removable"), false, "should not have column after unregister");
    assert.equal(itemTree.getColumnCount(), 0, "count should be 0");
  });

  it("hasColumn should return true for registered, false for unknown", () => {
    const mockZotero = createMockZotero();
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    itemTree.registerColumn({
      dataKey: "known",
      label: "Known",
      dataProvider: () => ""
    });

    assert.equal(itemTree.hasColumn("known"), true, "should return true for registered");
    assert.equal(itemTree.hasColumn("unknown"), false, "should return false for unknown");
  });

  it("getColumnCount should track count correctly", () => {
    const mockZotero = createMockZotero();
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    assert.equal(itemTree.getColumnCount(), 0, "initial count should be 0");

    itemTree.registerColumn({ dataKey: "col-1", label: "Col 1", dataProvider: () => "" });
    assert.equal(itemTree.getColumnCount(), 1, "count should be 1");

    itemTree.registerColumn({ dataKey: "col-2", label: "Col 2", dataProvider: () => "" });
    assert.equal(itemTree.getColumnCount(), 2, "count should be 2");

    itemTree.unregisterColumn("col-1");
    assert.equal(itemTree.getColumnCount(), 1, "count should be 1 after unregister");
  });

  it("createFieldDataProvider should return function that reads item field", () => {
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin"
    });

    const provider = itemTree.createFieldDataProvider("title");
    assert.typeOf(provider, 'function', "should return a function");

    const mockItem = {
      getField: (field) => field === "title" ? "Test Title" : ""
    };
    assert.equal(provider(mockItem), "Test Title", "should read item field");
    assert.equal(provider(null), "", "should return empty string for null item");
  });

  it("createDefaultCellRenderer should return render function", () => {
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin"
    });

    const renderer = itemTree.createDefaultCellRenderer({ color: "red", fontWeight: "bold" });
    assert.typeOf(renderer, 'function', "should return a function");

    const span = renderer(0, "data", { className: "test" }, false, {
      createElement: (tag) => createMockElement(tag)
    });

    assert.ok(span, "should return element");
    assert.equal(span.textContent, "data", "should set text content");
    assert.equal(span.style.color, "red", "should apply color style");
    assert.equal(span.style.fontWeight, "bold", "should apply fontWeight style");
  });

  it("createConditionalCellRenderer should apply styles based on condition", () => {
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin"
    });

    const renderer = itemTree.createConditionalCellRenderer(
      (data) => data > 10,
      { color: "green" },
      { color: "red" }
    );
    assert.typeOf(renderer, 'function', "should return a function");

    const doc = { createElement: (tag) => createMockElement(tag) };
    const spanTrue = renderer(0, 20, { className: "" }, false, doc);
    assert.equal(spanTrue.style.color, "green", "should apply trueStyle when condition true");

    const spanFalse = renderer(0, 5, { className: "" }, false, doc);
    assert.equal(spanFalse.style.color, "red", "should apply falseStyle when condition false");
  });

  it("unregisterAll should clear all columns", () => {
    const mockZotero = createMockZotero();
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    itemTree.registerColumn({ dataKey: "col-a", label: "A", dataProvider: () => "" });
    itemTree.registerColumn({ dataKey: "col-b", label: "B", dataProvider: () => "" });

    assert.equal(itemTree.getColumnCount(), 2, "should have 2 columns");
    itemTree.unregisterAll();
    assert.equal(itemTree.getColumnCount(), 0, "should have 0 columns after unregisterAll");
    assert.equal(itemTree.hasColumn("col-a"), false, "col-a should be gone");
    assert.equal(itemTree.hasColumn("col-b"), false, "col-b should be gone");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    const saved = globalThis.Zotero;
    globalThis.Zotero = createMockZotero();

    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin"
    });

    assert.equal(itemTree.isAvailable(), true, "should use globalThis.Zotero fallback");

    const result = itemTree.registerColumn({
      dataKey: "global-col",
      label: "Global",
      dataProvider: () => ""
    });

    assert.equal(result, "global-col", "should register via globalThis.Zotero");

    globalThis.Zotero = saved;
  });

  it("refreshColumns should return true when available", () => {
    const mockZotero = createMockZotero();
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    assert.equal(itemTree.refreshColumns(), true, "should return true when available");
  });

  it("refreshColumns should return false when not available", () => {
    const itemTree = createItemTree({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: {}
    });

    assert.equal(itemTree.refreshColumns(), false, "should return false when not available");
  });
});

await runTestsIfMain(import.meta.url);
