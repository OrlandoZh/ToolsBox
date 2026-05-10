/**
 * Annotation Manager Tests
 * Tests for annotation management window
 */
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createAnnotationManager } from "../src/features/annotation-manager.js";

function createMockLogger() {
  const logs = [];
  return {
    logs,
    debug(message, data) {
      logs.push({ level: 'debug', message, data });
    },
    error(message, data) {
      logs.push({ level: 'error', message, data });
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

function createMockWindow(closed = false) {
  return {
    closed,
    focus() {},
    close() {}
  };
}

describe("Annotation Manager", () => {
  let mockZotero;
  let openedWindows;

  beforeEach(() => {
    openedWindows = [];
    
    mockZotero = {
      getMainWindow() {
        return {
          openDialog(url, name, features) {
            const win = createMockWindow();
            openedWindows.push({ url, name, features, win });
            return win;
          }
        };
      }
    };
    
    globalThis.Zotero = mockZotero;
  });

  afterEach(() => {
    delete globalThis.Zotero;
  });

  it("should open annotation manager window with correct parameters", async () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    
    const manager = createAnnotationManager({ logger, i18n, zotero: mockZotero });
    await manager.open();
    
    assert.equal(openedWindows.length, 1, "should open one window");
    assert.equal(openedWindows[0].url, 'chrome://toolsbox/content/annotation-manager.html');
    assert.equal(openedWindows[0].name, 'toolsbox-annotation-manager');
    assert.includes(openedWindows[0].features, 'chrome');
    assert.includes(openedWindows[0].features, 'centerscreen');
    assert.equal(logger.logs.filter(l => l.message === 'annotationManager.opened').length, 1);
  });

  it("should focus existing window instead of opening new one", async () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const existingWindow = createMockWindow(false);
    let focusCalled = false;
    existingWindow.focus = () => { focusCalled = true; };
    
    mockZotero.getMainWindow = () => ({
      openDialog(url, name, features) {
        return existingWindow;
      }
    });
    
    const manager = createAnnotationManager({ logger, i18n, zotero: mockZotero });
    await manager.open();
    
    await manager.open();
    
    assert.ok(focusCalled, "should call focus on existing window");
  });

  it("should correctly report window open state", async () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    
    const manager = createAnnotationManager({ logger, i18n, zotero: mockZotero });
    
    assert.notOk(manager.isOpen(), "should not be open initially");
    
    await manager.open();
    
    assert.ok(manager.isOpen(), "should be open after open()");
  });

  it("should close window and clear reference", async () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    const mockWin = createMockWindow(false);
    let closeCalled = false;
    mockWin.close = () => { closeCalled = true; };
    
    mockZotero.getMainWindow = () => ({
      openDialog(url, name, features) {
        return mockWin;
      }
    });
    
    const manager = createAnnotationManager({ logger, i18n, zotero: mockZotero });
    await manager.open();
    
    manager.close();
    
    assert.ok(closeCalled, "should call close on window");
    assert.notOk(manager.isOpen(), "should not be open after close");
  });

  it("should handle close when no window exists", () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    
    const manager = createAnnotationManager({ logger, i18n, zotero: mockZotero });
    
    manager.close();
    
    assert.notOk(manager.isOpen(), "should not be open");
  });
});
