/**
 * Tests for Remark Column feature
 * ItemTree column displaying first line of abstract/note
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createRemarkColumn } from "../../src/features/remark-column.js";

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

describe("RemarkColumn", () => {
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
    const column = createRemarkColumn({
      logger: mockLogger,
      zotero: mockZotero
    });

    const result = column.register();

    assert.equal(result, true, "register() should return true");
    assert.equal(registeredColumns.length, 1, "registerColumn should be called once");

    const col = registeredColumns[0];
    assert.equal(col.dataKey, 'remark', "dataKey should be remark");
    assert.equal(col.label, 'Remark', "label should be Remark");
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
    const column = createRemarkColumn({
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

    const column = createRemarkColumn({ logger: createMockLogger() });
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

    const column = createRemarkColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    column.register();
    const cleanupResult = column.cleanup();

    assert.ok(cleanupResult.stopped, "cleanup should indicate stopped");
    assert.ok(Array.isArray(cleanupResult.resources), "cleanup should list freed resources");
    assert.equal(cleanupResult.resources.length, 1, "should have one resource");
    assert.ok(cleanupResult.resources[0].includes('remark'), "resource should include column ID");
    assert.equal(unregistered.length, 1, "unregisterColumn should be called");
    assert.equal(unregistered[0], 'remark', "should unregister correct column ID");
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

    const column = createRemarkColumn({
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

    const column = createRemarkColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const result = column.dataProvider(null, 'remark');
    assert.equal(result, '', "dataProvider should return empty string for null item");
  });

  it("renderCell should produce HTMLElement with correct className", () => {
    const mockZotero = {
      getMainWindow: function() { return createMockWindow(); }
    };

    const column = createRemarkColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const cell = column.renderCell(0, 'Test remark text', { className: 'remark-cell' });

    assert.ok(cell, "renderCell should return an element");
    assert.ok(cell.className.includes('cell'), "cell should have 'cell' class");
    assert.ok(cell.className.includes('remark-cell'), "cell should have column className");
  });

  it("should render placeholder em dash for empty remark", () => {
    const mockZotero = {
      getMainWindow: function() { return createMockWindow(); }
    };

    const column = createRemarkColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const cell = column.renderCell(0, '', { className: 'remark-cell' });

    assert.ok(cell, "renderCell should return an element for empty data");
    assert.ok(cell.className.includes('cell'), "cell should have 'cell' class");
    assert.ok(cell.className.includes('remark-cell'), "cell should have column className");

    // The cell should contain a child span with em dash placeholder
    assert.equal(cell.children.length, 1, "cell should have one child span");
    assert.equal(cell.children[0].textContent, '\u2014', "empty remark should render em dash placeholder");
  });
});

await runTestsIfMain(import.meta.url);
