/**
 * Tab Manager Panel Tests
 * Tests for tab management window
 */
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createTabManagerPanel } from "../src/features/tab-manager-panel.js";

function createMockLogger() {
  const logs = [];
  return {
    logs,
    debug(message, data) {
      logs.push({ level: 'debug', message, data });
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

function createMockReader(tabID, title, itemID) {
  return {
    tabID,
    title: title || 'Untitled',
    itemID,
    close() {}
  };
}

describe("Tab Manager Panel", () => {
  let mockZotero;
  let openedWindows;
  let activeReaders;
  let openedReaderItemIDs;

  beforeEach(() => {
    openedWindows = [];
    activeReaders = [];
    openedReaderItemIDs = [];
    
    mockZotero = {
      getMainWindow() {
        return {
          openDialog(url, name, features) {
            const win = createMockWindow();
            openedWindows.push({ url, name, features, win });
            return win;
          }
        };
      },
      Reader: {
        getActiveReaders() {
          return activeReaders;
        },
        getByTabID(tabID) {
          return activeReaders.find(r => r.tabID === tabID);
        },
        open(itemID) {
          openedReaderItemIDs.push(itemID);
        }
      }
    };
    
    globalThis.Zotero = mockZotero;
  });

  afterEach(() => {
    delete globalThis.Zotero;
  });

  it("should open tab manager window with correct parameters", async () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    
    const manager = createTabManagerPanel({ logger, i18n, zotero: mockZotero });
    await manager.open();
    
    assert.equal(openedWindows.length, 1, "should open one window");
    assert.equal(openedWindows[0].url, 'chrome://toolsbox/content/tab-manager.html');
    assert.equal(openedWindows[0].name, 'toolsbox-tab-manager');
    assert.includes(openedWindows[0].features, 'chrome');
    assert.includes(openedWindows[0].features, 'centerscreen');
    assert.equal(logger.logs.filter(l => l.message === 'tabManager.opened').length, 1);
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
    
    const manager = createTabManagerPanel({ logger, i18n, zotero: mockZotero });
    await manager.open();
    
    await manager.open();
    
    assert.ok(focusCalled, "should call focus on existing window");
  });

  it("should get all active tabs with correct data", async () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    
    activeReaders = [
      createMockReader('tab-1', 'Document A', 100),
      createMockReader('tab-2', 'Document B', 101)
    ];
    
    const manager = createTabManagerPanel({ logger, i18n, zotero: mockZotero });
    const tabs = await manager.getAllTabs();
    
    assert.equal(tabs.length, 2, "should return two tabs");
    assert.equal(tabs[0].id, 'tab-1');
    assert.equal(tabs[0].title, 'Document A');
    assert.equal(tabs[0].type, 'reader');
    assert.equal(tabs[0].itemID, 100);
    assert.equal(tabs[1].id, 'tab-2');
  });

  it("should handle empty tab list", async () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    
    activeReaders = [];
    
    const manager = createTabManagerPanel({ logger, i18n, zotero: mockZotero });
    const tabs = await manager.getAllTabs();
    
    assert.equal(tabs.length, 0, "should return empty array");
  });

  it("should switch to tab by calling Reader.open", () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    
    activeReaders = [createMockReader('tab-1', 'Document A', 100)];
    
    const manager = createTabManagerPanel({ logger, i18n, zotero: mockZotero });
    manager.switchToTab('tab-1');
    
    assert.equal(openedReaderItemIDs.length, 1, "should open reader once");
    assert.equal(openedReaderItemIDs[0], 100, "should open correct item");
    assert.equal(logger.logs.filter(l => l.message === 'tabManager.switched').length, 1);
  });

  it("should close tab by calling reader.close", () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    
    let closeCalled = false;
    const mockReader = createMockReader('tab-1', 'Document A', 100);
    mockReader.close = () => { closeCalled = true; };
    activeReaders = [mockReader];
    
    const manager = createTabManagerPanel({ logger, i18n, zotero: mockZotero });
    manager.closeTab('tab-1');
    
    assert.ok(closeCalled, "should call close on reader");
    assert.equal(logger.logs.filter(l => l.message === 'tabManager.closed').length, 1);
  });

  it("should handle switch to non-existent tab gracefully", () => {
    const logger = createMockLogger();
    const i18n = createMockI18n();
    
    activeReaders = [];
    
    const manager = createTabManagerPanel({ logger, i18n, zotero: mockZotero });
    manager.switchToTab('non-existent');
    
    assert.equal(openedReaderItemIDs.length, 0, "should not open any reader");
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
    
    const manager = createTabManagerPanel({ logger, i18n, zotero: mockZotero });
    await manager.open();
    
    manager.close();
    
    assert.ok(closeCalled, "should call close on window");
  });
});