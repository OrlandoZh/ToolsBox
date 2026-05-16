/**
 * Tests for Collection Sort feature
 * Task 2 of P1 collection features plan
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createCollectionSort } from "../../src/features/collection-sort.js";

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

function createMockPrefs() {
  const store = {};
  return {
    get(key) {
      return store[key];
    },
    set(key, value) {
      store[key] = value;
    }
  };
}

describe("CollectionSort", () => {
  it("should sort collections by name", () => {
    const collections = [
      { name: 'Z Collection', id: 3 },
      { name: 'A Collection', id: 1 },
      { name: 'M Collection', id: 2 }
    ];

    const mockLogger = createMockLogger();
    const sorter = createCollectionSort({ logger: mockLogger });
    const sorted = sorter.sortCollections(collections, 'name');

    assert.equal(sorted[0].name, 'A Collection', "First should be A Collection");
    assert.equal(sorted[1].name, 'M Collection', "Second should be M Collection");
    assert.equal(sorted[2].name, 'Z Collection', "Third should be Z Collection");
  });

  it("should sort collections by name descending", () => {
    const collections = [
      { name: 'A Collection', id: 1 },
      { name: 'Z Collection', id: 3 },
      { name: 'M Collection', id: 2 }
    ];

    const mockLogger = createMockLogger();
    const sorter = createCollectionSort({ logger: mockLogger });
    const sorted = sorter.sortCollections(collections, 'nameDesc');

    assert.equal(sorted[0].name, 'Z Collection', "First should be Z Collection");
    assert.equal(sorted[1].name, 'M Collection', "Second should be M Collection");
    assert.equal(sorted[2].name, 'A Collection', "Third should be A Collection");
  });

  it("should sort collections by item count", () => {
    const collections = [
      { name: 'Small', id: 1, getItems: () => [1] },
      { name: 'Large', id: 2, getItems: () => [1, 2, 3, 4, 5] },
      { name: 'Medium', id: 3, getItems: () => [1, 2, 3] }
    ];

    const mockLogger = createMockLogger();
    const sorter = createCollectionSort({ logger: mockLogger });
    const sorted = sorter.sortCollections(collections, 'itemCount');

    assert.equal(sorted[0].name, 'Small', "First should be Small (1 item)");
    assert.equal(sorted[1].name, 'Medium', "Second should be Medium (3 items)");
    assert.equal(sorted[2].name, 'Large', "Third should be Large (5 items)");
  });

  it("should sort collections by item count descending", () => {
    const collections = [
      { name: 'Small', id: 1, getItems: () => [1] },
      { name: 'Large', id: 2, getItems: () => [1, 2, 3, 4, 5] },
      { name: 'Medium', id: 3, getItems: () => [1, 2, 3] }
    ];

    const mockLogger = createMockLogger();
    const sorter = createCollectionSort({ logger: mockLogger });
    const sorted = sorter.sortCollections(collections, 'itemCountDesc');

    assert.equal(sorted[0].name, 'Large', "First should be Large (5 items)");
    assert.equal(sorted[1].name, 'Medium', "Second should be Medium (3 items)");
    assert.equal(sorted[2].name, 'Small', "Third should be Small (1 item)");
  });

  it("should sort collections by date added", () => {
    const collections = [
      { name: 'Newest', id: 3, dateAdded: 3000 },
      { name: 'Oldest', id: 1, dateAdded: 1000 },
      { name: 'Middle', id: 2, dateAdded: 2000 }
    ];

    const mockLogger = createMockLogger();
    const sorter = createCollectionSort({ logger: mockLogger });
    const sorted = sorter.sortCollections(collections, 'dateAdded');

    assert.equal(sorted[0].name, 'Oldest', "First should be Oldest");
    assert.equal(sorted[1].name, 'Middle', "Second should be Middle");
    assert.equal(sorted[2].name, 'Newest', "Third should be Newest");
  });

  it("should sort collections by date added descending", () => {
    const collections = [
      { name: 'Oldest', id: 1, dateAdded: 1000 },
      { name: 'Newest', id: 3, dateAdded: 3000 },
      { name: 'Middle', id: 2, dateAdded: 2000 }
    ];

    const mockLogger = createMockLogger();
    const sorter = createCollectionSort({ logger: mockLogger });
    const sorted = sorter.sortCollections(collections, 'dateAddedDesc');

    assert.equal(sorted[0].name, 'Newest', "First should be Newest");
    assert.equal(sorted[1].name, 'Middle', "Second should be Middle");
    assert.equal(sorted[2].name, 'Oldest', "Third should be Oldest");
  });

  it("should return original array for unknown sort method", () => {
    const collections = [
      { name: 'A', id: 1 },
      { name: 'B', id: 2 }
    ];

    const mockLogger = createMockLogger();
    const sorter = createCollectionSort({ logger: mockLogger });
    const sorted = sorter.sortCollections(collections, 'unknown');

    assert.equal(sorted.length, 2, "Should return same array length");
    assert.equal(sorted[0].name, 'A', "Should preserve original order");

    const logs = mockLogger.getLogs();
    const warnLog = logs.find(l => l.level === 'warn');
    assert.ok(warnLog, "Should warn about unknown sort method");
  });

  it("should handle collections without getItems method", () => {
    const collections = [
      { name: 'No Method', id: 1 },
      { name: 'Has Method', id: 2, getItems: () => [1, 2, 3] }
    ];

    const mockLogger = createMockLogger();
    const sorter = createCollectionSort({ logger: mockLogger });
    const sorted = sorter.sortCollections(collections, 'itemCount');

    assert.equal(sorted[0].name, 'No Method', "First should have 0 items");
    assert.equal(sorted[1].name, 'Has Method', "Second should have 3 items");
  });

  it("should return false when Collections API not available on enable", () => {
    const mockZotero = {};
    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();
    const mockPrefs = createMockPrefs();

    const sorter = createCollectionSort({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const result = sorter.register();

    assert.equal(result, false, "register() should return false when Collections API unavailable");

    const logs = mockLogger.getLogs();
    const warnLog = logs.find(l => l.level === 'warn');
    assert.ok(warnLog, "Should warn when register skips");
  });

  it("should avoid duplicate sort buttons and destroy owned button", () => {
    const buttons = [];
    const parent = {
      style: {},
      children: [],
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
      },
      removeChild(child) {
        this.children = this.children.filter((item) => item !== child);
        child.parentNode = null;
      }
    };
    const collectionTree = {
      parentElement: parent,
      querySelectorAll() {
        return [];
      }
    };
    const document = {
      getElementById(id) {
        if (id === 'toolsbox-collection-sort-button') {
          return buttons.find((button) => !button.removed) || null;
        }
        return collectionTree;
      },
      createElement(tagName) {
        const listeners = new Map();
        const button = {
          tagName,
          id: '',
          className: '',
          dataset: {},
          style: {},
          textContent: '',
          parentNode: null,
          setAttribute(name, value) {
            this.attributes = this.attributes || {};
            this.attributes[name] = value;
          },
          addEventListener(type, handler) {
            listeners.set(type, handler);
          },
          removeEventListener(type, handler) {
            if (listeners.get(type) === handler) {
              listeners.delete(type);
            }
          },
          remove() {
            this.removed = true;
            if (this.parentNode) {
              this.parentNode.removeChild(this);
            }
          },
          getListenerCount() {
            return listeners.size;
          }
        };
        buttons.push(button);
        return button;
      }
    };
    const sorter = createCollectionSort({
      logger: createMockLogger(),
      i18n: createMockI18n(),
      prefs: createMockPrefs(),
      zotero: {
        Collections: {
          getByLibrary() {
            return [];
          }
        },
        Libraries: {
          userLibraryID: 1
        },
        getMainWindow() {
          return {
            document,
            prompt() {
              return null;
            }
          };
        }
      }
    });

    assert.equal(sorter.register(), true);
    assert.equal(sorter.register(), true);
    assert.equal(buttons.length, 1, "should create one sort button");
    assert.equal(parent.children.length, 1, "parent should contain one sort button");
    assert.equal(buttons[0].dataset.toolsboxOwner, 'toolsbox-collection-sort');

    sorter.destroy();
    sorter.destroy();

    assert.equal(parent.children.length, 0, "destroy should remove sort button");
    assert.equal(buttons[0].getListenerCount(), 0, "destroy should remove click listener");
  });
});

// Run all tests when this file is executed directly.
await runTestsIfMain(import.meta.url);
