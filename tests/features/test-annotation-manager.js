/**
 * Tests for Annotation Manager feature
 * Task 3 of P0 features plan
 */

import { describe, it, assert, runTests } from "../test-framework.js";
import { createAnnotationManager } from "../../src/features/annotation-manager.js";

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

describe("AnnotationManager", () => {
  it("should create manager window", async () => {
    const mockZotero = {
      getMainWindow: function() {
        return {
          openDialog: function(url, name, features) {
            return { closed: false, focus: function() {} };
          }
        };
      }
    };
    
    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();
    
    const manager = createAnnotationManager({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });
    
    await manager.open();
    
    assert.ok(manager.isOpen(), "Manager should be open after open() call");
  });

  it("should focus existing window if already open", async () => {
    let focusCalled = false;
    const mockWindow = {
      closed: false,
      focus: function() {
        focusCalled = true;
      }
    };
    
    const mockZotero = {
      getMainWindow: function() {
        return {
          openDialog: function(url, name, features) {
            return mockWindow;
          }
        };
      }
    };
    
    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();
    
    const manager = createAnnotationManager({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });
    
    await manager.open();
    await manager.open();
    
    assert.ok(focusCalled, "Focus should be called on existing window");
  });

  it("should close manager window", async () => {
    let closed = false;
    const mockWindow = {
      closed: false,
      close: function() {
        closed = true;
        this.closed = true;
      },
      focus: function() {}
    };
    
    const mockZotero = {
      getMainWindow: function() {
        return {
          openDialog: function(url, name, features) {
            return mockWindow;
          }
        };
      }
    };
    
    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();
    
    const manager = createAnnotationManager({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });
    
    await manager.open();
    manager.close();
    
    assert.ok(closed, "Window should be closed");
    assert.ok(!manager.isOpen(), "Manager should not be open after close()");
  });
});

// Run all tests
runTests();