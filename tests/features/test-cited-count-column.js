/**
 * Tests for Cited Count Column feature
 * Task 1 of P0 features plan
 */

import { describe, it, assert, runTests } from "../test-framework.js";
import { createCitedCountColumn } from "../../src/features/cited-count-column.js";
import { createSemanticScholarClient } from "../../src/services/semantic-scholar-client.js";

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

describe("CitedCountColumn", () => {
  it("should register column with ItemTreeManager", () => {
    const mockZotero = {
      ItemTreeManager: {
        registerColumn: function(options) {
          this.lastRegistration = options;
        }
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
    globalThis.Zotero = {
      ItemTreeManager: {
        registerColumn: function(options) {
          this.lastRegistration = options;
        }
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
    
    // Cleanup
    delete globalThis.Zotero;
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
    
    // Test with empty DOI
    const countEmpty = await client.getCitedCount('');
    assert.equal(countEmpty, 0, "Should return 0 for empty DOI");
    
    // Test with null DOI
    const countNull = await client.getCitedCount(null);
    assert.equal(countNull, 0, "Should return 0 for null DOI");
  });
});

// Run all tests
runTests();