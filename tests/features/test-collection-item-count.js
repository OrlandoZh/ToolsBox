/**
 * Tests for Collection Item Count feature
 * Task 1 of P1 collection features plan
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createCollectionItemCount } from "../../src/features/collection-item-count.js";

// Mock dependencies
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
    warn(message, data) {
      logs.push({ level: 'warn', message, data });
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

describe("CollectionItemCount", () => {
  it("should inject count label into collection tree", () => {
    const mockZotero = {
      Collections: {
        get: function(id) {
          return { id: id, getItems: () => [1, 2, 3] };
        }
      },
      getMainWindow: function() {
        return {
          document: {
            querySelector: function(selector) {
              return {
                querySelectorAll: function(sel) {
                  return [
                    { dataset: { id: '1' }, appendChild: function() {}, ownerDocument: { createElement: () => ({ className: '', style: {}, textContent: '' }) } }
                  ];
                }
              };
            },
            getElementById: function(id) {
              return {
                querySelectorAll: function(sel) {
                  return [
                    { dataset: { id: '1' }, appendChild: function() {}, ownerDocument: { createElement: () => ({ className: '', style: {}, textContent: '' }) } }
                  ];
                }
              };
            }
          }
        };
      },
      Notifier: {
        registerObserver: function() {}
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const counter = createCollectionItemCount({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    const result = counter.register();

    assert.ok(result, "register() should return true");
  });

  it("should return correct count for collection", () => {
    const mockCollection = {
      id: 1,
      getItems: () => [1, 2, 3, 4, 5]
    };

    const mockLogger = createMockLogger();
    const mockZotero = {};

    const counter = createCollectionItemCount({
      logger: mockLogger,
      zotero: mockZotero
    });

    const count = counter.getCollectionCount(mockCollection);
    assert.equal(count, 5, "Should return 5 items");
  });

  it("should return 0 for empty collection", () => {
    const mockCollection = {
      id: 1,
      getItems: () => []
    };

    const mockLogger = createMockLogger();
    const mockZotero = {};

    const counter = createCollectionItemCount({
      logger: mockLogger,
      zotero: mockZotero
    });

    const count = counter.getCollectionCount(mockCollection);
    assert.equal(count, 0, "Should return 0 items");
  });

  it("should return 0 for invalid collection", () => {
    const mockLogger = createMockLogger();
    const mockZotero = {};

    const counter = createCollectionItemCount({
      logger: mockLogger,
      zotero: mockZotero
    });

    const countNull = counter.getCollectionCount(null);
    assert.equal(countNull, 0, "Should return 0 for null collection");

    const countUndefined = counter.getCollectionCount(undefined);
    assert.equal(countUndefined, 0, "Should return 0 for undefined collection");

    const countNoMethod = counter.getCollectionCount({ id: 1 });
    assert.equal(countNoMethod, 0, "Should return 0 for collection without getItems");
  });

  it("should return false when Collections API not available", () => {
    const mockZotero = {};
    const mockLogger = createMockLogger();

    const counter = createCollectionItemCount({
      logger: mockLogger,
      zotero: mockZotero
    });

    const result = counter.register();

    assert.equal(result, false, "register() should return false when Collections API unavailable");

    const logs = mockLogger.getLogs();
    const warnLog = logs.find(l => l.level === 'warn');
    assert.ok(warnLog, "Should warn when register skips");
  });

  it("should avoid duplicate labels and clean up owned labels and observer", () => {
    const created = [];
    const row = {
      id: 'row-1',
      dataset: { id: '1' },
      children: [],
      ownerDocument: {
        createElement(tagName) {
          const element = {
            tagName,
            className: '',
            dataset: {},
            style: {},
            textContent: '',
            parentNode: null,
            setAttribute(name, value) {
              this.attributes = this.attributes || {};
              this.attributes[name] = value;
            },
            getAttribute(name) {
              return this.attributes?.[name];
            },
            remove() {
              this.removed = true;
              if (this.parentNode) {
                this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
                this.parentNode = null;
              }
            }
          };
          created.push(element);
          return element;
        }
      },
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
      },
      querySelector(selector) {
        return this.children.find((child) => child.className === 'collection-item-count') || null;
      }
    };
    const unregistered = [];
    const mockZotero = {
      Collections: {
        get: function(id) {
          return { id: id, getItems: () => [1, 2, 3] };
        }
      },
      getMainWindow: function() {
        return {
          document: {
            getElementById: function() {
              return {
                querySelectorAll: function() {
                  return [row];
                }
              };
            }
          }
        };
      },
      Notifier: {
        registerObserver: function(observer, types, id) {
          return id;
        },
        unregisterObserver(id) {
          unregistered.push(id);
        }
      }
    };

    const counter = createCollectionItemCount({
      logger: createMockLogger(),
      i18n: createMockI18n(),
      zotero: mockZotero
    });

    assert.equal(counter.register(), true);
    assert.equal(counter.register(), true);
    assert.equal(created.length, 1, "should inject one owned label");
    assert.equal(row.children.length, 1, "row should contain one count label");
    assert.equal(row.children[0].dataset.toolsboxOwner, 'toolsbox-collection-item-count');

    counter.destroy();
    counter.destroy();

    assert.equal(row.children.length, 0, "destroy should remove owned label");
    assert.deepEqual(unregistered, ['toolsbox-collection-count']);
  });
});

// Run all tests when this file is executed directly.
await runTestsIfMain(import.meta.url);
