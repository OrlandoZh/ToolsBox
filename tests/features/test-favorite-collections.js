/**
 * Tests for Favorite Collections feature
 * Task 3 of P1 collection features plan
 */

import { describe, it, assert, runTests } from "../test-framework.js";
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
    const errorLog = logs.find(l => l.level === 'error');
    assert.ok(errorLog, "Should log error when register fails");
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
});

// Run all tests
runTests();
