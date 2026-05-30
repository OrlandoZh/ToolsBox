/**
 * Tests for Publication Column feature
 * ItemTree column displaying publication venue with 4-field fallback chain
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createPublicationColumn } from "../../src/features/publication-column.js";

function createMockLogger() {
  const logs = [];
  return {
    info(msg) { logs.push({ level: 'info', msg }); },
    warn(msg) { logs.push({ level: 'warn', msg }); },
    error(msg) { logs.push({ level: 'error', msg }); },
    getLogs() { return logs; }
  };
}

function createMockElement(tag) {
  const children = [];
  return {
    tagName: tag,
    className: '',
    style: {},
    textContent: '',
    children: children,
    appendChild: function(child) { children.push(child); },
    setAttribute: function(name, value) { this[name] = value; }
  };
}

function createMockWindow(overrides = {}) {
  return {
    document: {
      createElement: function(tag) { return createMockElement(tag); },
      querySelector: function() { return null; },
      createDocumentFragment: function() { return { appendChild: function(){} }; }
    },
    setTimeout: function() {},
    setInterval: function() { return 1; },
    clearInterval: function() {},
    MozXULElement: { parseXULToFragment: function() { return document.createDocumentFragment(); } },
    ...overrides
  };
}

describe("PublicationColumn", () => {
  it("should register via ItemTreeManager and return true", () => {
    const registeredColumns = [];
    const mockZotero = {
      ItemTreeManager: {
        registerColumn: function(config) { registeredColumns.push(config); },
        unregisterColumn: function() {}
      },
      getMainWindow: function() { return createMockWindow(); }
    };

    const mockLogger = createMockLogger();
    const column = createPublicationColumn({
      logger: mockLogger,
      zotero: mockZotero
    });

    const result = column.register();

    assert.equal(result, true, "register() should return true");
    assert.equal(registeredColumns.length, 1, "registerColumn should be called once");

    const col = registeredColumns[0];
    assert.equal(col.dataKey, 'publication', "dataKey should be publication");
    assert.equal(col.label, 'Publication', "label should be Publication");
    assert.equal(col.pluginID, 'toolsbox@orlandozh.github', "pluginID should match");
    assert.equal(col.sortReverse, false, "sortReverse should be false");
    assert.ok(typeof col.dataProvider === 'function', "dataProvider should be a function");
    assert.ok(typeof col.renderCell === 'function', "renderCell should be a function");
  });

  it("should return false when ItemTreeManager is missing", () => {
    const mockZotero = {
      getMainWindow: function() { return createMockWindow(); }
    };

    const mockLogger = createMockLogger();
    const column = createPublicationColumn({
      logger: mockLogger,
      zotero: mockZotero
    });

    const result = column.register();
    assert.equal(result, false, "register() should return false without ItemTreeManager");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    const saved = globalThis.Zotero;
    const registeredColumns = [];
    globalThis.Zotero = {
      ItemTreeManager: {
        registerColumn: function(config) { registeredColumns.push(config); },
        unregisterColumn: function() {}
      },
      getMainWindow: function() { return createMockWindow(); }
    };

    const column = createPublicationColumn({ logger: createMockLogger() });
    const result = column.register();

    assert.equal(result, true, "Should use globalThis.Zotero fallback and register");
    assert.equal(registeredColumns.length, 1, "registerColumn should be called via globalThis.Zotero");

    globalThis.Zotero = saved;
  });

  it("should cleanup and return stopped resources", () => {
    const unregistered = [];
    const mockZotero = {
      ItemTreeManager: {
        registerColumn: function() {},
        unregisterColumn: function(id) { unregistered.push(id); }
      },
      getMainWindow: function() { return createMockWindow(); }
    };

    const column = createPublicationColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    column.register();
    const cleanupResult = column.cleanup();

    assert.ok(cleanupResult.stopped, "cleanup should indicate stopped");
    assert.ok(Array.isArray(cleanupResult.resources), "cleanup should list freed resources");
    assert.equal(cleanupResult.resources.length, 1, "should have one resource");
    assert.ok(cleanupResult.resources[0].includes('toolsbox-publication'), "resource should include column ID");
    assert.equal(unregistered.length, 1, "unregisterColumn should be called");
    assert.equal(unregistered[0], 'toolsbox-publication', "should unregister correct column ID");
  });

  it("should be idempotent on register", () => {
    const registeredColumns = [];
    const mockZotero = {
      ItemTreeManager: {
        registerColumn: function(config) { registeredColumns.push(config); },
        unregisterColumn: function() {}
      },
      getMainWindow: function() { return createMockWindow(); }
    };

    const column = createPublicationColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    assert.equal(column.register(), true, "First register should return true");
    assert.equal(column.register(), true, "Second register should also return true (idempotent)");
    assert.equal(registeredColumns.length, 2, "registerColumn should be called twice (idempotent allows re-register)");
  });

  it("dataProvider should return empty string for null item", () => {
    const mockZotero = {
      getMainWindow: function() { return createMockWindow(); }
    };

    const column = createPublicationColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const result = column.dataProvider(null, 'publication');
    assert.equal(result, '', "dataProvider should return empty string for null item");
  });

  it("renderCell should produce HTMLElement with correct className", () => {
    const mockZotero = {
      getMainWindow: function() { return createMockWindow(); }
    };

    const column = createPublicationColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const cell = column.renderCell(0, 'Test Journal', { className: 'publication-cell' });

    assert.ok(cell, "renderCell should return an element");
    assert.ok(cell.className.includes('cell'), "cell should have 'cell' class");
    assert.ok(cell.className.includes('publication-cell'), "cell should have column className");
  });

  it("should follow getField fallback chain: publicationTitle -> journalAbbreviation -> proceedingsTitle -> conferenceName", () => {
    const mockZotero = {
      getMainWindow: function() { return createMockWindow(); }
    };

    const column = createPublicationColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    // Test 1: publicationTitle available
    const item1 = {
      getField: function(field) {
        if (field === 'publicationTitle') return 'Nature';
        return '';
      }
    };
    assert.equal(column.dataProvider(item1, 'publication'), 'Nature', "should use publicationTitle");

    // Test 2: publicationTitle empty, journalAbbreviation available
    const item2 = {
      getField: function(field) {
        if (field === 'publicationTitle') return '';
        if (field === 'journalAbbreviation') return 'Nat. Rev.';
        return '';
      }
    };
    assert.equal(column.dataProvider(item2, 'publication'), 'Nat. Rev.', "should fallback to journalAbbreviation");

    // Test 3: first two empty, proceedingsTitle available
    const item3 = {
      getField: function(field) {
        if (field === 'publicationTitle') return '';
        if (field === 'journalAbbreviation') return '';
        if (field === 'proceedingsTitle') return 'ICML Proceedings';
        return '';
      }
    };
    assert.equal(column.dataProvider(item3, 'publication'), 'ICML Proceedings', "should fallback to proceedingsTitle");

    // Test 4: first three empty, conferenceName available
    const item4 = {
      getField: function(field) {
        if (field === 'publicationTitle') return '';
        if (field === 'journalAbbreviation') return '';
        if (field === 'proceedingsTitle') return '';
        if (field === 'conferenceName') return 'NeurIPS';
        return '';
      }
    };
    assert.equal(column.dataProvider(item4, 'publication'), 'NeurIPS', "should fallback to conferenceName");

    // Test 5: all empty
    const item5 = {
      getField: function(field) {
        return '';
      }
    };
    assert.equal(column.dataProvider(item5, 'publication'), '', "should return empty when all fields empty");
  });
});

await runTestsIfMain(import.meta.url);
