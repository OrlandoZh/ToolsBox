/**
 * Tests for Collection Item Count feature
 * Task 1 of P1 collection features plan
 */

import { describe, it, assert, runTests } from "../test-framework.js";
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
    
    const result = counter.enable();
    
    assert.ok(result, "enable() should return true");
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
    
    const result = counter.enable();
    
    assert.equal(result, false, "enable() should return false when Collections API unavailable");
    
    const logs = mockLogger.getLogs();
    const errorLog = logs.find(l => l.level === 'error');
    assert.ok(errorLog, "Should log error when enable fails");
  });
});

// Run all tests
runTests();
