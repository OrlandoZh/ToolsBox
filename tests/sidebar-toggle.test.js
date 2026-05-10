/**
 * Sidebar Toggle Tests
 * Tests for keyboard shortcut sidebar toggle
 */
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createSidebarToggle } from "../src/features/sidebar-toggle.js";

function createMockLogger() {
  const logs = [];
  return {
    logs,
    debug(message, data) {
      logs.push({ level: 'debug', message, data });
    }
  };
}

function createMockMainWindow(leftHidden = false, rightHidden = false) {
  const leftSidebar = { hidden: leftHidden };
  const rightSidebar = { hidden: rightHidden };
  const eventListeners = [];
  return {
    document: {
      getElementById(id) {
        if (id === 'zotero-collections-pane') {
          return leftSidebar;
        }
        if (id === 'zotero-item-pane') {
          return rightSidebar;
        }
        return null;
      }
    },
    eventListeners,
    addEventListener(type, handler) {
      eventListeners.push({ type, handler });
    },
    leftSidebar,
    rightSidebar
  };
}

describe("Sidebar Toggle", () => {
  let mockZotero;
  let mainWindow;

  beforeEach(() => {
    mainWindow = createMockMainWindow(false, false);
    
    mockZotero = {
      getMainWindow() {
        return mainWindow;
      }
    };
    
    globalThis.Zotero = mockZotero;
  });

  afterEach(() => {
    delete globalThis.Zotero;
  });

  it("should register keyboard event listener and return true", () => {
    const logger = createMockLogger();
    
    const toggle = createSidebarToggle({ logger, zotero: mockZotero });
    const result = toggle.register();
    
    assert.ok(result, "register should return true");
    assert.equal(mainWindow.eventListeners.length, 1, "should add one event listener");
    assert.equal(mainWindow.eventListeners[0].type, 'keydown');
    assert.typeOf(mainWindow.eventListeners[0].handler, 'function');
    assert.equal(logger.logs.filter(l => l.message === 'sidebarToggle.registered').length, 1);
  });

  it("should correctly detect left sidebar visibility", () => {
    const logger = createMockLogger();
    
    mainWindow = createMockMainWindow(false, false);
    mockZotero.getMainWindow = () => mainWindow;
    
    const toggle = createSidebarToggle({ logger, zotero: mockZotero });
    
    assert.ok(toggle.isLeftSidebarVisible(), "left sidebar should be visible");
    
    mainWindow = createMockMainWindow(true, false);
    mockZotero.getMainWindow = () => mainWindow;
    
    assert.notOk(toggle.isLeftSidebarVisible(), "left sidebar should be hidden");
  });

  it("should correctly detect right sidebar visibility", () => {
    const logger = createMockLogger();
    
    mainWindow = createMockMainWindow(false, false);
    mockZotero.getMainWindow = () => mainWindow;
    
    const toggle = createSidebarToggle({ logger, zotero: mockZotero });
    
    assert.ok(toggle.isRightSidebarVisible(), "right sidebar should be visible");
    
    mainWindow = createMockMainWindow(false, true);
    mockZotero.getMainWindow = () => mainWindow;
    
    assert.notOk(toggle.isRightSidebarVisible(), "right sidebar should be hidden");
  });

  it("should toggle left sidebar hidden state", () => {
    const logger = createMockLogger();
    
    const toggle = createSidebarToggle({ logger, zotero: mockZotero });
    
    toggle.toggleLeftSidebar();
    
    assert.ok(mainWindow.leftSidebar.hidden, "left sidebar should be hidden after toggle");
    assert.equal(logger.logs.filter(l => l.message === 'sidebarToggle.leftSidebar.toggled').length, 1);
  });

  it("should toggle right sidebar hidden state", () => {
    const logger = createMockLogger();
    
    const toggle = createSidebarToggle({ logger, zotero: mockZotero });
    
    toggle.toggleRightSidebar();
    
    assert.ok(mainWindow.rightSidebar.hidden, "right sidebar should be hidden after toggle");
    assert.equal(logger.logs.filter(l => l.message === 'sidebarToggle.rightSidebar.toggled').length, 1);
  });

  it("should handle missing sidebar elements gracefully", () => {
    const logger = createMockLogger();
    mainWindow.document.getElementById = () => null;
    
    const toggle = createSidebarToggle({ logger, zotero: mockZotero });
    
    assert.notOk(toggle.isLeftSidebarVisible(), "should return false when sidebar missing");
    assert.notOk(toggle.isRightSidebarVisible(), "should return false when sidebar missing");
    
    toggle.toggleLeftSidebar();
    toggle.toggleRightSidebar();
  });
});