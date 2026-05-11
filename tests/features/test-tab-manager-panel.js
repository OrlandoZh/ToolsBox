/**
 * Tests for Tab Manager Panel feature
 * Task 5 of P0 features plan
 */

import { describe, it, assert, runTests } from "../test-framework.js";
import { createTabManagerPanel } from "../../src/features/tab-manager-panel.js";

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

describe("TabManagerPanel", () => {
  it("should list all open tabs", async () => {
    const mockReaders = [
      { tabID: 'reader-1', title: 'Paper A', itemID: 101 },
      { tabID: 'reader-2', title: 'Paper B', itemID: 102 }
    ];

    const mockZotero = {
      getMainWindow: function() {
        return {
          openDialog: function() {
            return { closed: false, focus: function() {} };
          }
        };
      },
      Reader: {
        getActiveReaders: function() {
          return mockReaders;
        },
        getByTabID: function(tabID) {
          return mockReaders.find(r => r.tabID === tabID);
        },
        open: function(itemID) {}
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const manager = createTabManagerPanel({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    const tabs = await manager.getAllTabs();

    assert.ok(Array.isArray(tabs), "getAllTabs() should return an array");
    assert.equal(tabs.length, 2, "Should have 2 tabs");
    assert.equal(tabs[0].id, 'reader-1', "First tab should have correct id");
    assert.equal(tabs[0].title, 'Paper A', "First tab should have correct title");
    assert.equal(tabs[0].type, 'reader', "First tab should be reader type");
    assert.equal(tabs[0].itemID, 101, "First tab should have correct itemID");
  });

  it("should open manager window", async () => {
    let windowOpened = false;

    const mockZotero = {
      getMainWindow: function() {
        return {
          openDialog: function(url, name, features) {
            windowOpened = true;
            return { closed: false, focus: function() {} };
          }
        };
      },
      Reader: {
        getActiveReaders: function() {
          return [];
        }
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const manager = createTabManagerPanel({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    await manager.open();

    assert.ok(windowOpened, "Window should be opened");
  });

  it("should close manager window", async () => {
    let windowClosed = false;

    const mockWindow = {
      closed: false,
      focus: function() {},
      close: function() {
        this.closed = true;
        windowClosed = true;
      }
    };

    const mockZotero = {
      getMainWindow: function() {
        return {
          openDialog: function() {
            return mockWindow;
          }
        };
      },
      Reader: {
        getActiveReaders: function() {
          return [];
        }
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const manager = createTabManagerPanel({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    await manager.open();
    manager.close();

    assert.ok(windowClosed, "Window should be closed");
  });

  it("should switch to tab", async () => {
    let openedItemID = null;

    const mockReader = { tabID: 'reader-1', title: 'Paper A', itemID: 101 };

    const mockZotero = {
      getMainWindow: function() {
        return {
          openDialog: function() {
            return { closed: false, focus: function() {} };
          }
        };
      },
      Reader: {
        getActiveReaders: function() {
          return [mockReader];
        },
        getByTabID: function(tabID) {
          return tabID === 'reader-1' ? mockReader : null;
        },
        open: function(itemID) {
          openedItemID = itemID;
        }
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const manager = createTabManagerPanel({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    manager.switchToTab('reader-1');

    assert.equal(openedItemID, 101, "Should open correct item");
  });

  it("should close tab", async () => {
    let tabClosed = false;

    const mockReader = {
      tabID: 'reader-1',
      title: 'Paper A',
      itemID: 101,
      close: function() {
        tabClosed = true;
      }
    };

    const mockZotero = {
      getMainWindow: function() {
        return {
          openDialog: function() {
            return { closed: false, focus: function() {} };
          }
        };
      },
      Reader: {
        getActiveReaders: function() {
          return [mockReader];
        },
        getByTabID: function(tabID) {
          return tabID === 'reader-1' ? mockReader : null;
        }
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const manager = createTabManagerPanel({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    manager.closeTab('reader-1');

    assert.ok(tabClosed, "Tab should be closed");
  });

  it("should handle empty title", async () => {
    const mockReaders = [
      { tabID: 'reader-1', itemID: 101 } // No title
    ];

    const mockZotero = {
      getMainWindow: function() {
        return {
          openDialog: function() {
            return { closed: false, focus: function() {} };
          }
        };
      },
      Reader: {
        getActiveReaders: function() {
          return mockReaders;
        }
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const manager = createTabManagerPanel({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    const tabs = await manager.getAllTabs();

    assert.equal(tabs[0].title, 'Untitled', "Should use Untitled for empty title");
  });

  it("should focus existing window instead of opening new one", async () => {
    let openDialogCount = 0;
    let focusCount = 0;

    const mockWindow = {
      closed: false,
      focus: function() {
        focusCount++;
      }
    };

    const mockZotero = {
      getMainWindow: function() {
        return {
          openDialog: function() {
            openDialogCount++;
            return mockWindow;
          }
        };
      },
      Reader: {
        getActiveReaders: function() {
          return [];
        }
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const manager = createTabManagerPanel({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    await manager.open(); // First open
    await manager.open(); // Second open - should focus

    assert.equal(openDialogCount, 1, "Should only open window once");
    assert.equal(focusCount, 1, "Should focus existing window on second call");
  });

  it("should use globalThis.Zotero when zotero option not provided", async () => {
    const mockReaders = [
      { tabID: 'reader-1', title: 'Test', itemID: 1 }
    ];

    globalThis.Zotero = {
      getMainWindow: function() {
        return {
          openDialog: function() {
            return { closed: false, focus: function() {} };
          }
        };
      },
      Reader: {
        getActiveReaders: function() {
          return mockReaders;
        }
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const manager = createTabManagerPanel({
      logger: mockLogger,
      i18n: mockI18n
    });

    const tabs = await manager.getAllTabs();

    assert.ok(Array.isArray(tabs), "Should work with global Zotero");

    // Cleanup
    delete globalThis.Zotero;
  });
});

// Run all tests
runTests();
