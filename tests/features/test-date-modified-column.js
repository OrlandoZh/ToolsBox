/**
 * Tests for Date Modified Column feature
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createDateModifiedColumn } from "../../src/features/date-modified-column.js";

function createMockLogger() {
  const logs = [];
  return {
    info(msg) { logs.push({ level: 'info', msg }); },
    warn(msg) { logs.push({ level: 'warn', msg }); },
    error(msg) { logs.push({ level: 'error', msg }); },
    getLogs() { return logs; }
  };
}

function createMockWindow(overrides = {}) {
  return {
    document: {
      querySelector: function () { return null; },
      createElement: function (tag) {
        return {
          tagName: tag.toUpperCase(),
          className: '',
          style: {},
          textContent: '',
          appendChild: function () {}
        };
      }
    },
    setTimeout: function () {},
    setInterval: function () { return 1; },
    clearInterval: function () {},
    MozXULElement: { parseXULToFragment: function () { return document.createDocumentFragment(); } },
    ...overrides
  };
}

describe("DateModifiedColumn", () => {
  it("should register via ItemTreeManager and return true", () => {
    let registerCalled = false;
    let registerArgs = null;

    const mockZotero = {
      ItemTreeManager: {
        registerColumn: function (args) {
          registerCalled = true;
          registerArgs = args;
        }
      },
      getMainWindow: function () { return createMockWindow(); }
    };

    const mockLogger = createMockLogger();
    const column = createDateModifiedColumn({
      logger: mockLogger,
      zotero: mockZotero
    });

    const result = column.register();

    assert.equal(result, true, "register() should return true");
    assert.ok(registerCalled, "registerColumn should have been called");
    assert.equal(registerArgs.dataKey, 'dateModified', "dataKey should be 'dateModified'");
    assert.equal(registerArgs.pluginID, 'toolsbox@orlandozh.github', "pluginID should match");
    assert.equal(registerArgs.label, 'Date Modified', "label should be 'Date Modified'");
  });

  it("should return false when ItemTreeManager not available", () => {
    const mockZotero = {
      getMainWindow: function () { return createMockWindow(); }
    };

    const mockLogger = createMockLogger();
    const column = createDateModifiedColumn({
      logger: mockLogger,
      zotero: mockZotero
    });

    const result = column.register();

    assert.equal(result, false, "register() should return false when ItemTreeManager missing");
  });

  it("should use globalThis.Zotero fallback", () => {
    const saved = globalThis.Zotero;
    globalThis.Zotero = {
      ItemTreeManager: {
        registerColumn: function () {}
      },
      getMainWindow: function () { return createMockWindow(); }
    };

    const column = createDateModifiedColumn({ logger: createMockLogger() });
    const result = column.register();

    assert.equal(result, true, "Should use globalThis.Zotero fallback and register");

    globalThis.Zotero = saved;
  });

  it("should cleanup and unregister column", () => {
    let unregisterCalled = false;
    let unregisterID = null;

    const mockZotero = {
      ItemTreeManager: {
        registerColumn: function () {},
        unregisterColumn: function (id) {
          unregisterCalled = true;
          unregisterID = id;
        }
      },
      getMainWindow: function () { return createMockWindow(); }
    };

    const column = createDateModifiedColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    column.register();
    const cleanupResult = column.cleanup();

    assert.ok(cleanupResult.stopped, "cleanup should indicate stopped");
    assert.ok(Array.isArray(cleanupResult.resources), "cleanup should list freed resources");
    assert.ok(cleanupResult.resources.includes('column:toolsbox-date-modified'), "resources should contain column ID");
    assert.ok(unregisterCalled, "unregisterColumn should have been called");
    assert.equal(unregisterID, 'dateModified', "unregisterColumn should be called with correct ID");
  });

  it("should handle null/undefined item in dataProvider gracefully", () => {
    const mockZotero = {
      ItemTreeManager: {
        registerColumn: function () {}
      },
      getMainWindow: function () { return createMockWindow(); }
    };

    const column = createDateModifiedColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const resultNull = column.dataProvider(null, 'dateModified');
    assert.equal(resultNull, '', "dataProvider(null) should return ''");

    const resultUndefined = column.dataProvider(undefined, 'dateModified');
    assert.equal(resultUndefined, '', "dataProvider(undefined) should return ''");
  });

  it("should render cell element with proper className", () => {
    const mockZotero = {
      getMainWindow: function () {
        return createMockWindow({
          document: {
            createElement: function (tag) {
              const el = {
                tagName: tag.toUpperCase(),
                className: '',
                style: {},
                textContent: '',
                children: [],
                appendChild: function (child) { this.children.push(child); }
              };
              return el;
            }
          }
        });
      }
    };

    const column = createDateModifiedColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const cell = column.renderCell(0, '2024-01-15T00:00:00.000Z', { className: 'date-modified-test-css' });

    assert.ok(cell, "renderCell should return an element");
    assert.ok(cell.className.includes('date-modified-test-css'), "cell className should include provided className");
  });
});

await runTestsIfMain(import.meta.url);
