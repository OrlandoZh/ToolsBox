/**
 * Tests for Research Workbench Matrix feature
 * Paper matrix row building, filtering, sorting and feature registration
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  buildPaperMatrixRows,
  filterPaperMatrixRows,
  sortPaperMatrixRows,
  buildPaperMatrixPayload,
  registerPaperMatrixFeatures,
} from "../../src/features/research-workbench-matrix.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(msg, details) { logs.push({ level: "debug", msg, details }); },
    warn(msg, details) { logs.push({ level: "warn", msg, details }); },
    getLogs() { return logs; },
  };
}

function createMockZotero(overrides = {}) {
  return {
    ItemTypes: {
      getName(id) { return `type-${id}`; },
      getLocalizedString(id) { return `Localized ${id}`; },
    },
    Collections: {
      get(id) {
        return {
          getChildItems() { return []; },
        };
      },
    },
    Items: {
      getAll() { return []; },
      get(id) { return { id, getField: () => "", isAttachment: () => false, isNote: () => false }; },
    },
    ...overrides,
  };
}

function createMockItem(overrides = {}) {
  return {
    id: 1,
    itemID: 1,
    itemType: "journalArticle",
    title: "Test Title",
    dateAdded: "2024-01-15T10:00:00Z",
    dateModified: "2024-01-16T10:00:00Z",
    DOI: "10.1234/example",
    getField(field) { return this[field] || ""; },
    getTags() { return [{ tag: "test" }]; },
    getAttachments() { return [101]; },
    isNote() { return false; },
    isAttachment() { return false; },
    ...overrides,
  };
}

function createMockCommandPalette() {
  const commands = [];
  return {
    commands,
    registerCommand(cmd) { commands.push(cmd); },
  };
}

function createMockPrefs(overrides = {}) {
  const store = new Map(Object.entries(overrides));
  return {
    get(key) { return store.get(key); },
    set(key, value) { store.set(key, value); },
  };
}

describe("ResearchWorkbenchMatrix", () => {
  it("buildPaperMatrixRows returns empty array for empty input", () => {
    const rows = buildPaperMatrixRows([], {});
    assert.ok(Array.isArray(rows), "should return array");
    assert.equal(rows.length, 0, "should be empty");
  });

  it("buildPaperMatrixRows processes regular items", () => {
    const item = createMockItem();
    const rows = buildPaperMatrixRows([item], { zotero: createMockZotero() });
    assert.equal(rows.length, 1, "should have 1 row");
    assert.equal(rows[0].itemID, 1, "itemID should match");
    assert.equal(rows[0].title, "Test Title", "title should match");
    assert.equal(rows[0].hasAttachment, true, "should have attachment");
  });

  it("buildPaperMatrixRows skips notes and attachments", () => {
    const note = createMockItem({ id: 2, isNote: () => true });
    const attachment = createMockItem({ id: 3, isAttachment: () => true });
    const regular = createMockItem({ id: 4 });
    const rows = buildPaperMatrixRows([note, attachment, regular]);
    assert.equal(rows.length, 1, "should only have regular item");
    assert.equal(rows[0].itemID, 4, "should be the regular item");
  });

  it("buildPaperMatrixRows respects limit", () => {
    const items = [createMockItem({ id: 1 }), createMockItem({ id: 2 }), createMockItem({ id: 3 })];
    const rows = buildPaperMatrixRows(items, { limit: 2 });
    assert.equal(rows.length, 2, "should respect limit");
  });

  it("filterPaperMatrixRows filters by itemType", () => {
    const rows = [
      { itemType: "journalArticle", tags: [], yearNumber: 2024 },
      { itemType: "book", tags: [], yearNumber: 2023 },
    ];
    const filtered = filterPaperMatrixRows(rows, { itemType: "book" });
    assert.equal(filtered.length, 1, "should filter to 1 row");
    assert.equal(filtered[0].itemType, "book", "should be book");
  });

  it("sortPaperMatrixRows sorts by key", () => {
    const rows = [
      { itemID: 1, title: "B" },
      { itemID: 2, title: "A" },
    ];
    const sorted = sortPaperMatrixRows(rows, { key: "title" });
    assert.equal(sorted[0].title, "A", "should sort A first");
    assert.equal(sorted[1].title, "B", "should sort B second");
  });

  it("buildPaperMatrixPayload returns structured payload", () => {
    const payload = buildPaperMatrixPayload({}, { prefs: createMockPrefs() });
    assert.ok(typeof payload === "object", "should return object");
    assert.ok(Array.isArray(payload.rows), "should have rows array");
    assert.equal(payload.enhanced, false, "enhanced should default to false");
  });

  it("registerPaperMatrixFeatures returns expected API", () => {
    const commandPalette = createMockCommandPalette();
    const result = registerPaperMatrixFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    });

    assert.typeOf(result.openPaperMatrix, "function", "should have openPaperMatrix");
    assert.typeOf(result.getSnapshot, "function", "should have getSnapshot");
  });

  it("registerPaperMatrixFeatures registers command palette entry", () => {
    const commandPalette = createMockCommandPalette();
    registerPaperMatrixFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    });

    assert.equal(commandPalette.commands.length, 1, "should register 1 command");
    assert.ok(commandPalette.commands[0].id.includes("paper-matrix"), "command id should reference paper-matrix");
  });

  it("getSnapshot returns default when shell not open", () => {
    const commandPalette = createMockCommandPalette();
    const result = registerPaperMatrixFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    });

    const snapshot = result.getSnapshot();
    assert.equal(snapshot.open, false, "snapshot should show not open");
  });

  it("buildPaperMatrixPayload uses globalThis.Zotero fallback", () => {
    const saved = globalThis.Zotero;
    globalThis.Zotero = createMockZotero();
    const payload = buildPaperMatrixPayload({}, {});
    assert.ok(typeof payload === "object", "should return object with globalThis fallback");
    globalThis.Zotero = saved;
  });

  it("filterPaperMatrixRows filters by year range", () => {
    const rows = [
      { itemType: "", tags: [], yearNumber: 2020 },
      { itemType: "", tags: [], yearNumber: 2024 },
      { itemType: "", tags: [], yearNumber: 2018 },
    ];
    const filtered = filterPaperMatrixRows(rows, { yearFrom: 2019, yearTo: 2023 });
    assert.equal(filtered.length, 1, "should filter by year range");
    assert.equal(filtered[0].yearNumber, 2020, "should keep 2020");
  });

  it("sortPaperMatrixRows handles desc direction", () => {
    const rows = [
      { itemID: 1, yearNumber: 2020 },
      { itemID: 2, yearNumber: 2024 },
    ];
    const sorted = sortPaperMatrixRows(rows, { key: "yearNumber", dir: "desc" });
    assert.equal(sorted[0].yearNumber, 2024, "should sort desc");
    assert.equal(sorted[1].yearNumber, 2020, "should sort desc");
  });
});

await runTestsIfMain(import.meta.url);
