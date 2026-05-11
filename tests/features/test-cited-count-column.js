/**
 * Tests for Cited Count Column feature
 * Task 1 of P0 features plan - renderCell fix
 */

import { describe, it, assert, runTests } from "../test-framework.js";
import { createCitedCountColumn } from "../../src/features/cited-count-column.js";
import { createSemanticScholarClient } from "../../src/services/semantic-scholar-client.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(message, data) {
      logs.push({ level: 'debug', message, data });
    },
    error(message, data) {
      logs.push({ level: 'error', message, data });
    },
    info(message, data) {
      logs.push({ level: 'info', message, data });
    },
    getLogs() {
      return logs;
    }
  };
}

function createMockI18n() {
  return {
    t(key, fallback) {
      return fallback || key;
    }
  };
}

function createMockDocument() {
  const elements = [];
  return {
    createElement(tag) {
      const element = {
        tagName: tag,
        className: '',
        style: {},
        textContent: '',
        appendChild(child) {
          element._children = element._children || [];
          element._children.push(child);
        }
      };
      elements.push(element);
      return element;
    },
    getElements() {
      return elements;
    }
  };
}

describe("CitedCountColumn", () => {
  it("should register column with ItemTreeManager", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      ItemTreeManager: {
        registerColumn: function(options) {
          this.lastRegistration = options;
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const column = createCitedCountColumn({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    column.register();

    assert.ok(mockZotero.ItemTreeManager.lastRegistration, "Column should be registered");
    assert.equal(mockZotero.ItemTreeManager.lastRegistration.dataKey, 'citedCount', "dataKey should be citedCount");
    assert.equal(column.dataKey, 'citedCount', "column.dataKey should be citedCount");
    assert.equal(column.columnID, 'toolsbox-cited-count', "columnID should be toolsbox-cited-count");
    assert.typeOf(mockZotero.ItemTreeManager.lastRegistration.dataProvider, 'function', "dataProvider should be a function");
    assert.typeOf(mockZotero.ItemTreeManager.lastRegistration.renderCell, 'function', "renderCell should be a function");
    assert.equal(mockZotero.ItemTreeManager.lastRegistration.sortReverse, false, "sortReverse should be false");
  });

  it("should return false when ItemTreeManager is not available", () => {
    const mockZotero = {};
    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const column = createCitedCountColumn({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    const result = column.register();

    assert.equal(result, false, "register() should return false when ItemTreeManager unavailable");

    const logs = mockLogger.getLogs();
    const errorLog = logs.find(l => l.level === 'error');
    assert.ok(errorLog, "Should log error when registration fails");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    const mockDoc = createMockDocument();
    globalThis.Zotero = {
      ItemTreeManager: {
        registerColumn: function(options) {
          this.lastRegistration = options;
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const column = createCitedCountColumn({
      logger: mockLogger,
      i18n: mockI18n
    });

    column.register();

    assert.ok(globalThis.Zotero.ItemTreeManager.lastRegistration, "Should use global Zotero");
    delete globalThis.Zotero;
  });

  it("should render cited count number in cell", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createCitedCountColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const cell = column.renderCell(0, '15', { className: 'cited-count' });

    assert.ok(cell, "Cell should be created");
    assert.ok(cell._children, "Cell should have children");
    assert.equal(cell._children[0].textContent, '15', "Cell should display '15'");
  });

  it("should highlight high cited papers (>10 citations)", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createCitedCountColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const cell = column.renderCell(0, '25', { className: 'cited-count' });

    assert.equal(cell.style.fontWeight, 'bold', "High cited papers should be bold");
    assert.equal(cell.style.color, '#4682B4', "High cited papers should have blue color");
  });

  it("should not highlight papers with <=10 citations", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createCitedCountColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const cell = column.renderCell(0, '5', { className: 'cited-count' });

    assert.ok(cell.style.fontWeight !== 'bold', "Low cited papers should not be bold");
  });

  it("should handle zero citations", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createCitedCountColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const cell = column.renderCell(0, '0', { className: 'cited-count' });

    assert.equal(cell._children[0].textContent, '0', "Cell should display '0'");
    assert.ok(cell.style.fontWeight !== 'bold', "Zero citations should not be bold");
  });

  it("should handle null/undefined data gracefully", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createCitedCountColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const cellNull = column.renderCell(0, null, { className: 'cited-count' });
    const cellUndefined = column.renderCell(0, undefined, { className: 'cited-count' });

    assert.equal(cellNull._children[0].textContent, '0', "Null data should display '0'");
    assert.equal(cellUndefined._children[0].textContent, '0', "Undefined data should display '0'");
  });

  it("should extract cached citation count from item.extra", () => {
    const mockItem = {
      id: 1,
      getField(field) {
        if (field === 'extra') return 'Cited Count: 42';
        return '';
      }
    };

    const column = createCitedCountColumn({
      logger: createMockLogger()
    });

    const count = column.dataProvider(mockItem, 'citedCount');

    assert.equal(count, '42', "Should extract '42' from extra field");
  });

  it("should return '0' when item has no cited count in extra", () => {
    const mockItem = {
      id: 1,
      getField(field) {
        return '';
      }
    };

    const column = createCitedCountColumn({
      logger: createMockLogger()
    });

    const count = column.dataProvider(mockItem, 'citedCount');

    assert.equal(count, '0', "Should return '0' when no cached data");
  });

  it("should return '0' for null/undefined items", () => {
    const column = createCitedCountColumn({
      logger: createMockLogger()
    });

    assert.equal(column.dataProvider(null, 'citedCount'), '0', "Null item should return '0'");
    assert.equal(column.dataProvider(undefined, 'citedCount'), '0', "Undefined item should return '0'");
    assert.equal(column.dataProvider({}, 'citedCount'), '0', "Item without id should return '0'");
  });
});

describe("SemanticScholarClient", () => {
  it("should create client with default options", () => {
    const client = createSemanticScholarClient();
    assert.ok(client, "Client should be created");
    assert.typeOf(client.getCitedCount, 'function', "Should have getCitedCount method");
  });

  it("should create client with custom options", () => {
    const client = createSemanticScholarClient({
      apiKey: 'test-key',
      timeout: 10000
    });
    assert.ok(client, "Client should be created with options");
  });

  it("should return 0 for empty or invalid DOI", async () => {
    const client = createSemanticScholarClient({ timeout: 1000 });
    const countEmpty = await client.getCitedCount('');
    assert.equal(countEmpty, 0, "Should return 0 for empty DOI");
    const countNull = await client.getCitedCount(null);
    assert.equal(countNull, 0, "Should return 0 for null DOI");
  });
});

runTests();
