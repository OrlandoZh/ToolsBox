/**
 * Tests for Item Pane feature
 * ItemPane section registration lifecycle and InfoRow management
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createItemPane } from "../../src/features/item-pane.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(msg, details) { logs.push({ level: 'debug', msg, details }); },
    error(msg, details) { logs.push({ level: 'error', msg, details }); },
    getLogs() { return logs; }
  };
}

function createMockElement(tag = 'div') {
  const children = [];
  const attributes = {};
  const el = {
    tagName: tag,
    nodeType: 1,
    textContent: '',
    className: '',
    style: {},
    ownerDocument: null,
    childNodes: children,
    appendChild(child) {
      children.push(child);
      return child;
    },
    setAttribute(name, value) {
      attributes[name] = value;
    },
    getAttribute(name) {
      return attributes[name];
    },
    createElement(tagName) {
      return createMockElement(tagName);
    }
  };
  el.ownerDocument = {
    createElement: (tagName) => createMockElement(tagName)
  };
  return el;
}

function createMockZotero(overrides = {}) {
  const sections = new Map();
  const infoRows = new Map();

  return {
    ItemPaneManager: {
      registerSection(config) {
        sections.set(config.paneID, config);
        return config.paneID;
      },
      unregisterSection(paneID) {
        sections.delete(paneID);
      },
      registerInfoRow(config) {
        infoRows.set(config.rowID, config);
        return config.rowID;
      },
      unregisterInfoRow(rowID) {
        infoRows.delete(rowID);
      },
      refreshInfoRow(rowID) {
        return infoRows.has(rowID);
      },
      getSections() { return sections; },
      getInfoRows() { return infoRows; }
    },
    getActiveZoteroPane() { return null; },
    getMainWindow() { return null; },
    Items: {
      get(id) {
        return { id, getField: () => '', isAttachment: () => false, isNote: () => false };
      }
    },
    ...overrides
  };
}

describe("ItemPane", () => {
  it("should return object with all expected methods", () => {
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin"
    });

    assert.typeOf(itemPane.isAvailable, 'function', "should have isAvailable");
    assert.typeOf(itemPane.registerSection, 'function', "should have registerSection");
    assert.typeOf(itemPane.unregisterSection, 'function', "should have unregisterSection");
    assert.typeOf(itemPane.hasSection, 'function', "should have hasSection");
    assert.typeOf(itemPane.resolveSectionPaneID, 'function', "should have resolveSectionPaneID");
    assert.typeOf(itemPane.getSectionCount, 'function', "should have getSectionCount");
    assert.typeOf(itemPane.registerInfoRow, 'function', "should have registerInfoRow");
    assert.typeOf(itemPane.unregisterInfoRow, 'function', "should have unregisterInfoRow");
    assert.typeOf(itemPane.hasInfoRow, 'function', "should have hasInfoRow");
    assert.typeOf(itemPane.getInfoRowCount, 'function', "should have getInfoRowCount");
    assert.typeOf(itemPane.getRegistrationSnapshot, 'function', "should have getRegistrationSnapshot");
    assert.typeOf(itemPane.refreshInfoRow, 'function', "should have refreshInfoRow");
    assert.typeOf(itemPane.createSimpleSection, 'function', "should have createSimpleSection");
    assert.typeOf(itemPane.createFieldInfoRow, 'function', "should have createFieldInfoRow");
    assert.typeOf(itemPane.createConditionalInfoRow, 'function', "should have createConditionalInfoRow");
    assert.typeOf(itemPane.unregisterAll, 'function', "should have unregisterAll");
  });

  it("isAvailable should be true when ItemPaneManager present", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    assert.equal(itemPane.isAvailable(), true, "isAvailable should be true");
  });

  it("isAvailable should be false when ItemPaneManager absent", () => {
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: {}
    });

    assert.equal(itemPane.isAvailable(), false, "isAvailable should be false");
  });

  it("registerSection should call Zotero.ItemPaneManager.registerSection", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const result = itemPane.registerSection({
      paneID: "test-section",
      header: { l10nID: "test-header" },
      onRender: () => {}
    });

    assert.equal(result, "test-section", "should return registered paneID");
    assert.equal(itemPane.hasSection("test-section"), true, "should track registered section");
    assert.equal(itemPane.getSectionCount(), 1, "section count should be 1");
  });

  it("registerSection should detect bodyCandidate and normalize DOM contract", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const body = createMockElement('div');
    const doc = body.ownerDocument;
    let capturedArgs = null;

    itemPane.registerSection({
      paneID: "dom-section",
      header: { l10nID: "dom-header" },
      onRender: (...args) => {
        capturedArgs = args;
      }
    });

    const section = mockZotero.ItemPaneManager.getSections().get("dom-section");
    assert.ok(section, "section should be registered");
    assert.typeOf(section.onRender, 'function', "onRender should be wrapped");

    // Call wrapped onRender with body-like argument
    section.onRender(body);
    assert.ok(capturedArgs, "wrapped onRender should be called");
  });

  it("unregisterSection should remove section and update hasSection", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    itemPane.registerSection({
      paneID: "removable-section",
      header: { l10nID: "removable-header" },
      onRender: () => {}
    });

    assert.equal(itemPane.hasSection("removable-section"), true, "should have section before unregister");
    assert.equal(itemPane.unregisterSection("removable-section"), true, "unregister should return true");
    assert.equal(itemPane.hasSection("removable-section"), false, "should not have section after unregister");
    assert.equal(itemPane.getSectionCount(), 0, "section count should be 0");
  });

  it("hasSection should return false for unknown paneID", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    assert.equal(itemPane.hasSection("unknown-section"), false, "unknown section should not exist");
  });

  it("getSectionCount should increment and decrement correctly", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    assert.equal(itemPane.getSectionCount(), 0, "initial count should be 0");

    itemPane.registerSection({
      paneID: "section-1",
      header: { l10nID: "header-1" },
      onRender: () => {}
    });
    assert.equal(itemPane.getSectionCount(), 1, "count should be 1 after first register");

    itemPane.registerSection({
      paneID: "section-2",
      header: { l10nID: "header-2" },
      onRender: () => {}
    });
    assert.equal(itemPane.getSectionCount(), 2, "count should be 2 after second register");

    itemPane.unregisterSection("section-1");
    assert.equal(itemPane.getSectionCount(), 1, "count should be 1 after unregister");
  });

  it("registerInfoRow should call Zotero.ItemPaneManager.registerInfoRow", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const result = itemPane.registerInfoRow({
      rowID: "test-row",
      label: { l10nID: "test-label" },
      onGetData: () => "test-data"
    });

    assert.equal(result, "test-row", "should return registered rowID");
    assert.equal(itemPane.hasInfoRow("test-row"), true, "should track registered row");
    assert.equal(itemPane.getInfoRowCount(), 1, "row count should be 1");
  });

  it("unregisterInfoRow should remove row", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    itemPane.registerInfoRow({
      rowID: "removable-row",
      label: { l10nID: "removable-label" },
      onGetData: () => "data"
    });

    assert.equal(itemPane.hasInfoRow("removable-row"), true, "should have row before unregister");
    assert.equal(itemPane.unregisterInfoRow("removable-row"), true, "unregister should return true");
    assert.equal(itemPane.hasInfoRow("removable-row"), false, "should not have row after unregister");
    assert.equal(itemPane.getInfoRowCount(), 0, "row count should be 0");
  });

  it("getInfoRowCount should track row count", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    assert.equal(itemPane.getInfoRowCount(), 0, "initial count should be 0");

    itemPane.registerInfoRow({
      rowID: "row-1",
      label: { l10nID: "label-1" },
      onGetData: () => ""
    });
    assert.equal(itemPane.getInfoRowCount(), 1, "count should be 1");
  });

  it("getRegistrationSnapshot should return structured snapshot", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    itemPane.registerSection({
      paneID: "snap-section",
      header: { l10nID: "snap-header" },
      sidenav: { l10nID: "snap-sidenav" },
      onRender: () => {}
    });

    itemPane.registerInfoRow({
      rowID: "snap-row",
      label: { l10nID: "snap-label" },
      onGetData: () => ""
    });

    const snapshot = itemPane.getRegistrationSnapshot();
    assert.equal(snapshot.sections.length, 1, "snapshot should have 1 section");
    assert.equal(snapshot.infoRows.length, 1, "snapshot should have 1 infoRow");
    assert.equal(snapshot.sections[0].paneID, "snap-section", "section paneID should match");
    assert.equal(snapshot.sections[0].headerL10nID, "snap-header", "header l10nID should match");
    assert.equal(snapshot.infoRows[0].rowID, "snap-row", "rowID should match");
    assert.equal(snapshot.infoRows[0].labelL10nID, "snap-label", "label l10nID should match");
  });

  it("createSimpleSection should produce valid section config", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const result = itemPane.createSimpleSection({
      paneID: "simple-section",
      headerL10nID: "simple-header",
      getContent: (item) => "content"
    });

    assert.equal(result, "simple-section", "should return paneID");
    assert.equal(itemPane.hasSection("simple-section"), true, "should register section");
  });

  it("createFieldInfoRow should produce valid infoRow config", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const result = itemPane.createFieldInfoRow({
      rowID: "field-row",
      labelL10nID: "field-label",
      field: "title"
    });

    assert.equal(result, "field-row", "should return rowID");
    assert.equal(itemPane.hasInfoRow("field-row"), true, "should register infoRow");
  });

  it("unregisterAll should clear all sections and rows", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    itemPane.registerSection({
      paneID: "all-section",
      header: { l10nID: "all-header" },
      onRender: () => {}
    });

    itemPane.registerInfoRow({
      rowID: "all-row",
      label: { l10nID: "all-label" },
      onGetData: () => ""
    });

    assert.equal(itemPane.getSectionCount(), 1, "should have 1 section");
    assert.equal(itemPane.getInfoRowCount(), 1, "should have 1 row");

    itemPane.unregisterAll();

    assert.equal(itemPane.getSectionCount(), 0, "should have 0 sections after unregisterAll");
    assert.equal(itemPane.getInfoRowCount(), 0, "should have 0 rows after unregisterAll");
  });

  it("double unregister should be handled gracefully", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    itemPane.registerSection({
      paneID: "idempotent-section",
      header: { l10nID: "idempotent-header" },
      onRender: () => {}
    });

    assert.equal(itemPane.unregisterSection("idempotent-section"), true, "first unregister should succeed");
    assert.equal(itemPane.unregisterSection("idempotent-section"), false, "second unregister should fail gracefully");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    const saved = globalThis.Zotero;
    globalThis.Zotero = createMockZotero();

    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin"
    });

    assert.equal(itemPane.isAvailable(), true, "should use globalThis.Zotero fallback");

    const result = itemPane.registerSection({
      paneID: "global-section",
      header: { l10nID: "global-header" },
      onRender: () => {}
    });

    assert.equal(result, "global-section", "should register via globalThis.Zotero");

    globalThis.Zotero = saved;
  });

  it("resolveSectionPaneID should resolve various paneID options", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const paneID = "resolve-section";
    itemPane.registerSection({
      paneID,
      header: { l10nID: "resolve-header" },
      onRender: () => {}
    });

    assert.equal(itemPane.resolveSectionPaneID(paneID), paneID, "should resolve by paneID");
    assert.equal(itemPane.resolveSectionPaneID("unknown"), null, "unknown paneID should return null");
    assert.equal(itemPane.resolveSectionPaneID(null), null, "null paneID should return null");
    assert.equal(itemPane.resolveSectionPaneID(""), null, "empty paneID should return null");
  });

  it("refreshInfoRow should return true for registered row", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    itemPane.registerInfoRow({
      rowID: "refresh-row",
      label: { l10nID: "refresh-label" },
      onGetData: () => ""
    });

    assert.equal(itemPane.refreshInfoRow("refresh-row"), true, "should refresh registered row");
    assert.equal(itemPane.refreshInfoRow("unknown"), false, "should return false for unknown row");
  });

  it("registerSection should reject without paneID", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const result = itemPane.registerSection({
      header: { l10nID: "no-id-header" },
      onRender: () => {}
    });

    assert.equal(result, null, "should return null without paneID");
  });

  it("registerSection should reject without onRender", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const result = itemPane.registerSection({
      paneID: "no-render-section",
      header: { l10nID: "no-render-header" }
    });

    assert.equal(result, null, "should return null without onRender");
  });

  it("registerInfoRow should reject without rowID", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const result = itemPane.registerInfoRow({
      label: { l10nID: "no-id-label" },
      onGetData: () => ""
    });

    assert.equal(result, null, "should return null without rowID");
  });

  it("registerInfoRow should reject without onGetData", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const result = itemPane.registerInfoRow({
      rowID: "no-data-row",
      label: { l10nID: "no-data-label" }
    });

    assert.equal(result, null, "should return null without onGetData");
  });

  it("registerInfoRow should reject without label l10nID", () => {
    const mockZotero = createMockZotero();
    const itemPane = createItemPane({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const result = itemPane.registerInfoRow({
      rowID: "no-label-row",
      label: {},
      onGetData: () => ""
    });

    assert.equal(result, null, "should return null without label l10nID");
  });
});

await runTestsIfMain(import.meta.url);
