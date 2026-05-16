/**
 * Tests for Favorite Collections feature
 * Task 3 of P1 collection features plan
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createFavoriteCollections } from "../../src/features/favorite-collections.js";

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

function createMockPrefs(initialFavorites = []) {
  let storedFavorites = initialFavorites;
  return {
    get: function(key) {
      if (key === 'favoriteCollections') {
        return storedFavorites;
      }
      return null;
    },
    set: function(key, value) {
      if (key === 'favoriteCollections') {
        storedFavorites = value;
      }
    }
  };
}

describe("FavoriteCollections", () => {
  it("should add collection to favorites", () => {
    const mockPrefs = createMockPrefs([]);
    const mockLogger = createMockLogger();

    const favorite = createFavoriteCollections({
      logger: mockLogger,
      prefs: mockPrefs
    });

    favorite.addToFavorites(1);

    const favorites = favorite.getFavorites();
    assert.ok(favorites.includes(1), "Collection ID 1 should be in favorites");
    assert.equal(favorites.length, 1, "Should have exactly 1 favorite");
  });

  it("should remove collection from favorites", () => {
    const mockPrefs = createMockPrefs([1, 2, 3]);
    const mockLogger = createMockLogger();

    const favorite = createFavoriteCollections({
      logger: mockLogger,
      prefs: mockPrefs
    });

    favorite.removeFromFavorites(2);

    const favorites = favorite.getFavorites();
    assert.ok(!favorites.includes(2), "Collection ID 2 should not be in favorites");
    assert.equal(favorites.length, 2, "Should have exactly 2 favorites");
    assert.ok(favorites.includes(1), "Collection ID 1 should still be in favorites");
    assert.ok(favorites.includes(3), "Collection ID 3 should still be in favorites");
  });

  it("should check if collection is favorite", () => {
    const mockPrefs = createMockPrefs([1, 2, 3]);
    const mockLogger = createMockLogger();

    const favorite = createFavoriteCollections({
      logger: mockLogger,
      prefs: mockPrefs
    });

    assert.ok(favorite.isFavorite(2), "Collection ID 2 should be favorite");
    assert.ok(favorite.isFavorite(1), "Collection ID 1 should be favorite");
    assert.ok(!favorite.isFavorite(4), "Collection ID 4 should not be favorite");
    assert.ok(!favorite.isFavorite(99), "Collection ID 99 should not be favorite");
  });

  it("should toggle favorite status", () => {
    const mockPrefs = createMockPrefs([1, 2]);
    const mockLogger = createMockLogger();

    const favorite = createFavoriteCollections({
      logger: mockLogger,
      prefs: mockPrefs
    });

    // Toggle off existing favorite
    favorite.toggleFavorite(1);
    assert.ok(!favorite.isFavorite(1), "Collection ID 1 should no longer be favorite after toggle");

    // Toggle on new favorite
    favorite.toggleFavorite(3);
    assert.ok(favorite.isFavorite(3), "Collection ID 3 should be favorite after toggle");
  });

  it("should not add duplicate favorites", () => {
    const mockPrefs = createMockPrefs([1]);
    const mockLogger = createMockLogger();

    const favorite = createFavoriteCollections({
      logger: mockLogger,
      prefs: mockPrefs
    });

    favorite.addToFavorites(1);

    const favorites = favorite.getFavorites();
    assert.equal(favorites.length, 1, "Should still have only 1 favorite");
    assert.equal(favorites[0], 1, "Should still have original favorite");
  });

  it("should handle empty favorites gracefully", () => {
    const mockPrefs = createMockPrefs(null);
    const mockLogger = createMockLogger();

    const favorite = createFavoriteCollections({
      logger: mockLogger,
      prefs: mockPrefs
    });

    const favorites = favorite.getFavorites();
    assert.ok(Array.isArray(favorites), "Should return array");
    assert.equal(favorites.length, 0, "Should be empty array");
    assert.ok(!favorite.isFavorite(1), "Should return false for any collection");
  });

  it("should return false when enable called without Collections API", () => {
    const mockZotero = {};
    const mockPrefs = createMockPrefs([]);
    const mockLogger = createMockLogger();

    const favorite = createFavoriteCollections({
      logger: mockLogger,
      prefs: mockPrefs,
      zotero: mockZotero
    });

    const result = favorite.register();

    assert.equal(result, false, "register() should return false when Collections API unavailable");

    const logs = mockLogger.getLogs();
    const warnLog = logs.find(l => l.level === 'warn');
    assert.ok(warnLog, "Should warn when register skips");
  });

  it("should return true when enable succeeds", () => {
    const mockZotero = {
      Collections: {
        getByLibrary: function() { return []; }
      },
      getMainWindow: function() {
        return {
          document: {
            getElementById: function(id) {
              return {
                querySelectorAll: function() { return []; },
                addEventListener: function() {}
              };
            }
          }
        };
      },
      Notifier: {
        registerObserver: function() {}
      }
    };
    const mockPrefs = createMockPrefs([]);
    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const favorite = createFavoriteCollections({
      logger: mockLogger,
      i18n: mockI18n,
      prefs: mockPrefs,
      zotero: mockZotero
    });

    const result = favorite.register();

    assert.ok(result, "register() should return true when successful");
  });

  it("should avoid duplicate listeners and clean up favorite DOM and observer", () => {
    const removedListeners = [];
    const unregistered = [];
    const icon = {
      className: 'favorite-icon',
      dataset: { toolsboxOwner: 'toolsbox-favorite-collections' },
      style: {},
      remove() {
        this.removed = true;
      }
    };
    const row = {
      dataset: { id: '1' },
      style: {},
      firstChild: null,
      classList: {
        added: [],
        removed: [],
        add(value) {
          this.added.push(value);
        },
        remove(value) {
          this.removed.push(value);
        }
      },
      querySelector() {
        return this.icon || null;
      },
      insertBefore(child) {
        this.icon = child;
      }
    };
    const collectionTree = {
      firstChild: row,
      listeners: [],
      querySelectorAll() {
        return [row];
      },
      addEventListener(type, handler) {
        this.listeners.push({ type, handler });
      },
      removeEventListener(type, handler) {
        removedListeners.push({ type, handler });
        this.listeners = this.listeners.filter((entry) => entry.type !== type || entry.handler !== handler);
      },
      insertBefore() {}
    };
    const mockZotero = {
      Collections: {
        getByLibrary: function() { return []; }
      },
      getMainWindow: function() {
        return {
          document: {
            createElement() {
              return icon;
            },
            getElementById: function() {
              return collectionTree;
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
    const favorite = createFavoriteCollections({
      logger: createMockLogger(),
      i18n: createMockI18n(),
      prefs: createMockPrefs([1]),
      zotero: mockZotero
    });

    assert.equal(favorite.register(), true);
    assert.equal(favorite.register(), true);
    assert.equal(collectionTree.listeners.length, 1, "should add one listener");
    assert.equal(row.icon.dataset.toolsboxOwner, 'toolsbox-favorite-collections');

    favorite.destroy();
    favorite.destroy();

    assert.equal(collectionTree.listeners.length, 0, "destroy should remove listener");
    assert.equal(removedListeners.length, 1, "listener removal should be idempotent");
    assert.equal(icon.removed, true, "destroy should remove owned icon");
    assert.deepEqual(unregistered, ['toolsbox-favorite-collections']);
  });
});

// Run all tests when this file is executed directly.
await runTestsIfMain(import.meta.url);
