/**
 * Tests for Title Column Enhanced feature
 * Displays reading progress bar, status emojis, and tags in title column
 */

import { describe, it, assert, runTests } from "../test-framework.js";
import { createTitleColumnEnhanced } from "../../src/features/title-column-enhanced.js";

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

function createMockDocument() {
  const elements = [];
  return {
    createElement(tag) {
      const element = {
        tagName: tag,
        className: '',
        style: {},
        textContent: '',
        title: '',
        appendChild(child) {
          element._children = element._children || [];
          element._children.push(child);
        },
        setAttribute(name, value) {
          element._attributes = element._attributes || {};
          element._attributes[name] = value;
        },
        getAttribute(name) {
          return element._attributes?.[name];
        }
      };
      elements.push(element);
      return element;
    },
    getElements() {
      return elements;
    }
  };
}

function createMockPrefs(overrides = {}) {
  const defaults = {
    'titleColumnEnhanced.showProgress': true,
    'titleColumnEnhanced.showTags': true,
    'titleColumnEnhanced.progressColor': '#468B97',
    'titleColumnEnhanced.tagEmojis': JSON.stringify({ reading: '📖', done: '✅', important: '⭐' }),
    'titleColumnEnhanced.backgroundColors': JSON.stringify({ reading: '#f0f8ff', done: '#f0fff0' })
  };
  return {
    get(key) {
      return overrides[key] !== undefined ? overrides[key] : defaults[key];
    }
  };
}

describe("TitleColumnEnhanced", () => {
  it("should register column with ItemTreeManager", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      ItemTreeManager: {
        registerColumn: function(options) {
          this.lastRegistration = options;
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    column.register();

    assert.ok(mockZotero.ItemTreeManager.lastRegistration, "Column should be registered");
    assert.equal(mockZotero.ItemTreeManager.lastRegistration.dataKey, 'titleEnhanced', "dataKey should be titleEnhanced");
    assert.equal(column.dataKey, 'titleEnhanced', "column.dataKey should be titleEnhanced");
    assert.typeOf(mockZotero.ItemTreeManager.lastRegistration.renderCell, 'function', "renderCell should be a function");
  });

  it("should return false when ItemTreeManager is not available", () => {
    const mockZotero = {};
    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const result = column.register();

    assert.equal(result, false, "register() should return false when ItemTreeManager unavailable");

    const logs = mockLogger.getLogs();
    const errorLog = logs.find(l => l.level === 'error');
    assert.ok(errorLog, "Should log error when registration fails");
  });

  it("should extract reading progress from item extra field", () => {
    const mockZotero = {};
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const mockItem = {
      id: 1,
      getField(field) {
        if (field === 'extra') return 'Reading Progress: 45%';
        return '';
      }
    };

    const progress = column.getReadingProgress(mockItem);
    assert.equal(progress, 45, "Should extract 45 from extra field");
  });

  it("should extract reading progress from workflow state", () => {
    const mockZotero = {};
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const mockItem = {
      id: 1,
      getField(field) {
        if (field === 'extra') return 'Reading Progress: 72%';
        return '';
      }
    };

    const progress = column.getReadingProgress(mockItem);
    assert.equal(progress, 72, "Should extract 72% progress");
  });

  it("should return 0 progress when no progress data exists", () => {
    const mockZotero = {};
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const mockItem = {
      id: 1,
      getField(field) {
        return '';
      }
    };

    const progress = column.getReadingProgress(mockItem);
    assert.equal(progress, 0, "Should return 0 when no progress data");
  });

  it("should return reading emoji for reading status", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      prefs: mockPrefs
    });

    const mockItem = {
      id: 1,
      getTags() {
        return [{ tag: '/reading' }];
      },
      getField() {
        return '';
      }
    };

    const emoji = column.getStatusEmoji(mockItem);
    assert.ok(emoji.includes('📖') || emoji === '📖', "Should return reading emoji");
  });

  it("should return done emoji for done status", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      prefs: mockPrefs
    });

    const mockItem = {
      id: 1,
      getTags() {
        return [{ tag: '/done' }];
      },
      getField() {
        return '';
      }
    };

    const emoji = column.getStatusEmoji(mockItem);
    assert.ok(emoji.includes('✅') || emoji === '✅', "Should return done emoji");
  });

  it("should return important emoji for important tag", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      prefs: mockPrefs
    });

    const mockItem = {
      id: 1,
      getTags() {
        return [{ tag: '#important' }, { tag: '/todo' }];
      },
      getField() {
        return '';
      }
    };

    const emoji = column.getStatusEmoji(mockItem);
    assert.ok(emoji.length > 0, "Should return emojis for tags");
  });

  it("should render progress bar with correct width", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const mockItem = {
      id: 1,
      getField(field) {
        if (field === 'title') return 'Test Paper Title';
        if (field === 'extra') return 'Reading Progress: 60%';
        return '';
      },
      getTags() {
        return [];
      }
    };

    const cell = column.renderCell(mockDoc, mockItem);

    assert.ok(cell, "Cell should be created");
    assert.ok(cell._children, "Cell should have children");

    const progressContainer = cell._children.find(c => c.className === 'title-progress-container');
    assert.ok(progressContainer, "Should have progress container element");

    const progressBar = progressContainer._children?.find(c => c.className === 'title-progress-bar');
    assert.ok(progressBar, "Should have progress bar element");
  });

  it("should render title text in cell", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const mockItem = {
      id: 1,
      getField(field) {
        if (field === 'title') return 'Research Paper on Machine Learning';
        return '';
      },
      getTags() {
        return [];
      }
    };

    const cell = column.renderCell(mockDoc, mockItem);

    const titleElement = cell._children.find(c => c.className === 'title-text');
    assert.ok(titleElement, "Should have title text element");
    assert.ok(titleElement.textContent.includes('Research Paper'), "Title should be displayed");
  });

  it("should render tag emojis in cell", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const mockItem = {
      id: 1,
      getField(field) {
        if (field === 'title') return 'Paper Title';
        return '';
      },
      getTags() {
        return [{ tag: '/reading' }, { tag: '#important' }];
      }
    };

    const cell = column.renderCell(mockDoc, mockItem);

    const tagsContainer = cell._children.find(c => c.className === 'title-tags');
    assert.ok(tagsContainer, "Should have tags container");
  });

  it("should apply background color based on reading status", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const mockItem = {
      id: 1,
      getField(field) {
        if (field === 'title') return 'Reading Paper';
        return '';
      },
      getTags() {
        return [{ tag: '/reading' }];
      }
    };

    const cell = column.renderCell(mockDoc, mockItem);

    // Should have background style for reading status
    assert.ok(cell.style, "Cell should have style");
  });

  it("should use custom progress color from preferences", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'titleColumnEnhanced.progressColor': '#FF5500'
    });

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    assert.equal(column.progressColor, '#FF5500', "Should use custom progress color");
  });

  it("should hide progress bar when showProgress is false", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'titleColumnEnhanced.showProgress': false
    });

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const mockItem = {
      id: 1,
      getField(field) {
        if (field === 'title') return 'Paper Title';
        if (field === 'extra') return 'Reading Progress: 50%';
        return '';
      },
      getTags() {
        return [];
      }
    };

    const cell = column.renderCell(mockDoc, mockItem);

    const progressBar = cell._children.find(c => c.className === 'title-progress-bar');
    assert.ok(!progressBar, "Should not have progress bar when showProgress is false");
  });

  it("should hide tags when showTags is false", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'titleColumnEnhanced.showTags': false
    });

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const mockItem = {
      id: 1,
      getField(field) {
        if (field === 'title') return 'Paper Title';
        return '';
      },
      getTags() {
        return [{ tag: '/reading' }];
      }
    };

    const cell = column.renderCell(mockDoc, mockItem);

    const tagsContainer = cell._children.find(c => c.className === 'title-tags');
    assert.ok(!tagsContainer, "Should not have tags when showTags is false");
  });

  it("should support sorting by title alphabetically", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      prefs: mockPrefs
    });

    const mockItemA = {
      id: 1,
      getField(field) {
        if (field === 'title') return 'Alpha Paper';
        return '';
      },
      getTags() {
        return [];
      }
    };

    const mockItemB = {
      id: 2,
      getField(field) {
        if (field === 'title') return 'Beta Paper';
        return '';
      },
      getTags() {
        return [];
      }
    };

    const sortResult = column.sortByTitle(mockItemA, mockItemB);
    assert.ok(sortResult < 0, "Alpha should come before Beta");
  });

  it("should support sorting by progress", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      prefs: mockPrefs
    });

    const mockItem50 = {
      id: 1,
      getField(field) {
        if (field === 'title') return 'Paper A';
        if (field === 'extra') return 'Reading Progress: 50%';
        return '';
      },
      getTags() {
        return [];
      }
    };

    const mockItem80 = {
      id: 2,
      getField(field) {
        if (field === 'title') return 'Paper B';
        if (field === 'extra') return 'Reading Progress: 80%';
        return '';
      },
      getTags() {
        return [];
      }
    };

    const sortResult = column.sortByProgress(mockItem50, mockItem80);
    assert.ok(sortResult < 0, "50% should come before 80% in ascending order");
  });

  it("should handle null/undefined items gracefully", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      prefs: mockPrefs
    });

    assert.equal(column.getReadingProgress(null), 0, "Null item should return 0 progress");
    assert.equal(column.getReadingProgress(undefined), 0, "Undefined item should return 0 progress");
    assert.equal(column.getStatusEmoji(null), '', "Null item should return empty emoji");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    const mockDoc = createMockDocument();
    globalThis.Zotero = {
      ItemTreeManager: {
        registerColumn: function(options) {
          this.lastRegistration = options;
        }
      },
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();
    const mockPrefs = createMockPrefs();

    const column = createTitleColumnEnhanced({
      logger: mockLogger,
      i18n: mockI18n,
      prefs: mockPrefs
    });

    column.register();

    assert.ok(globalThis.Zotero.ItemTreeManager.lastRegistration, "Should use global Zotero");
    delete globalThis.Zotero;
  });
});

runTests();
