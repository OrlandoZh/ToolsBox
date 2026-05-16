/**
 * Tests for Sidebar Toggle feature
 * Task 4 of P0 features plan
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createSidebarToggle } from "../../src/features/sidebar-toggle.js";

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

describe("SidebarToggle", () => {
  it("should toggle left sidebar visibility", () => {
    // Create mock sidebar element
    const mockLeftSidebar = {
      hidden: false,
      id: 'zotero-collections-pane'
    };

    const mockDocument = {
      getElementById: function(id) {
        if (id === 'zotero-collections-pane') return mockLeftSidebar;
        if (id === 'zotero-item-pane') return { hidden: false, id: 'zotero-item-pane' };
        return null;
      },
      addEventListener: function() {}
    };

    const mockMainWindow = {
      document: mockDocument,
      addEventListener: function() {}
    };

    const mockZotero = {
      getMainWindow: function() {
        return mockMainWindow;
      }
    };

    const mockLogger = createMockLogger();

    const toggle = createSidebarToggle({
      logger: mockLogger,
      zotero: mockZotero
    });

    const initialState = toggle.isLeftSidebarVisible();
    assert.equal(initialState, true, "Initial state should be visible");

    toggle.toggleLeftSidebar();
    assert.equal(toggle.isLeftSidebarVisible(), false, "After toggle, should be hidden");

    toggle.toggleLeftSidebar();
    assert.equal(toggle.isLeftSidebarVisible(), true, "After second toggle, should be visible again");
  });

  it("should toggle right sidebar visibility", () => {
    const mockRightSidebar = {
      hidden: false,
      id: 'zotero-item-pane'
    };

    const mockDocument = {
      getElementById: function(id) {
        if (id === 'zotero-collections-pane') return { hidden: false, id: 'zotero-collections-pane' };
        if (id === 'zotero-item-pane') return mockRightSidebar;
        return null;
      },
      addEventListener: function() {}
    };

    const mockMainWindow = {
      document: mockDocument,
      addEventListener: function() {}
    };

    const mockZotero = {
      getMainWindow: function() {
        return mockMainWindow;
      }
    };

    const mockLogger = createMockLogger();

    const toggle = createSidebarToggle({
      logger: mockLogger,
      zotero: mockZotero
    });

    const initialState = toggle.isRightSidebarVisible();
    assert.equal(initialState, true, "Initial state should be visible");

    toggle.toggleRightSidebar();
    assert.equal(toggle.isRightSidebarVisible(), false, "After toggle, should be hidden");

    toggle.toggleRightSidebar();
    assert.equal(toggle.isRightSidebarVisible(), true, "After second toggle, should be visible again");
  });

  it("should register keyboard shortcuts", () => {
    const eventListeners = [];

    const mockDocument = {
      getElementById: function(id) {
        return { hidden: false, id };
      },
      addEventListener: function() {}
    };

    const mockMainWindow = {
      document: mockDocument,
      addEventListener: function(type, handler) {
        eventListeners.push({ type, handler });
      }
    };

    const mockZotero = {
      getMainWindow: function() {
        return mockMainWindow;
      }
    };

    const mockLogger = createMockLogger();

    const toggle = createSidebarToggle({
      logger: mockLogger,
      zotero: mockZotero
    });

    const result = toggle.register();

    assert.equal(result, true, "register() should return true");
    assert.ok(eventListeners.length > 0, "Should register event listeners");
    assert.includes(eventListeners.map(e => e.type), 'keydown', "Should register keydown listener");
  });

  it("should return false for visibility when sidebar is null", () => {
    const mockDocument = {
      getElementById: function(id) {
        return null;
      },
      addEventListener: function() {}
    };

    const mockMainWindow = {
      document: mockDocument,
      addEventListener: function() {}
    };

    const mockZotero = {
      getMainWindow: function() {
        return mockMainWindow;
      }
    };

    const mockLogger = createMockLogger();

    const toggle = createSidebarToggle({
      logger: mockLogger,
      zotero: mockZotero
    });

    assert.equal(toggle.isLeftSidebarVisible(), false, "Should return false when sidebar is null");
    assert.equal(toggle.isRightSidebarVisible(), false, "Should return false when sidebar is null");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    const mockDocument = {
      getElementById: function(id) {
        return { hidden: false, id };
      },
      addEventListener: function() {}
    };

    const mockMainWindow = {
      document: mockDocument,
      addEventListener: function() {}
    };

    globalThis.Zotero = {
      getMainWindow: function() {
        return mockMainWindow;
      }
    };

    const mockLogger = createMockLogger();

    const toggle = createSidebarToggle({
      logger: mockLogger
    });

    assert.equal(toggle.isLeftSidebarVisible(), true, "Should use global Zotero");

    // Cleanup
    delete globalThis.Zotero;
  });
});

// Run all tests when this file is executed directly.
await runTestsIfMain(import.meta.url);
