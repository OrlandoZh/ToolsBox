/**
 * Tests for Reading Time Column feature
 * Task 1 of P1 ItemTree columns plan
 */

import { describe, it, assert, runTests } from "../test-framework.js";
import { createReadingTimeColumn } from "../../src/features/reading-time-column.js";

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
        appendChild(child) {
          element._children = element._children || [];
          element._children.push(child);
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

describe("ReadingTimeColumn", () => {
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

    const column = createReadingTimeColumn({
      logger: mockLogger,
      i18n: mockI18n,
      zotero: mockZotero
    });

    column.register();

    assert.ok(mockZotero.ItemTreeManager.lastRegistration, "Column should be registered");
    assert.equal(mockZotero.ItemTreeManager.lastRegistration.dataKey, 'readingTime', "dataKey should be readingTime");
    assert.equal(column.dataKey, 'readingTime', "column.dataKey should be readingTime");
    assert.typeOf(mockZotero.ItemTreeManager.lastRegistration.renderCell, 'function', "renderCell should be a function");
    assert.typeOf(mockZotero.ItemTreeManager.lastRegistration.getSortValue, 'function', "getSortValue should be a function");
  });

  it("should return false when ItemTreeManager is not available", () => {
    const mockZotero = {};
    const mockLogger = createMockLogger();
    const mockI18n = createMockI18n();

    const column = createReadingTimeColumn({
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

  it("should format time correctly for minutes less than 60", () => {
    const column = createReadingTimeColumn({
      logger: createMockLogger()
    });

    assert.equal(column.formatTime(0), '0m', "0 minutes should be '0m'");
    assert.equal(column.formatTime(30), '30m', "30 minutes should be '30m'");
    assert.equal(column.formatTime(59), '59m', "59 minutes should be '59m'");
  });

  it("should format time correctly for exact hours", () => {
    const column = createReadingTimeColumn({
      logger: createMockLogger()
    });

    assert.equal(column.formatTime(60), '1h', "60 minutes should be '1h'");
    assert.equal(column.formatTime(120), '2h', "120 minutes should be '2h'");
    assert.equal(column.formatTime(600), '10h', "600 minutes should be '10h'");
  });

  it("should format time correctly for hours and minutes", () => {
    const column = createReadingTimeColumn({
      logger: createMockLogger()
    });

    assert.equal(column.formatTime(125), '2h 5m', "125 minutes should be '2h 5m'");
    assert.equal(column.formatTime(185), '3h 5m', "185 minutes should be '3h 5m'");
    assert.equal(column.formatTime(95), '1h 35m', "95 minutes should be '1h 35m'");
  });

  it("should render progress bar with correct width", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createReadingTimeColumn({
      logger: createMockLogger(),
      zotero: mockZotero,
      maxTime: 600
    });

    const cell = column.renderCell(mockDoc, 300, {});

    assert.ok(cell, "Cell should be created");
    assert.ok(cell._children, "Cell should have children");

    // Should have progress bar and text label
    assert.ok(cell._children.length >= 2, "Cell should have progress bar and text");

    // Find progress bar element
    const progressBar = cell._children.find(c => c.className === 'reading-time-progress');
    assert.ok(progressBar, "Should have progress bar element");

    // Progress bar width should be 50% (300/600)
    assert.ok(progressBar.style.width.includes('50'), "Progress bar width should be 50%");
  });

  it("should cap progress bar at 100% when time exceeds max", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createReadingTimeColumn({
      logger: createMockLogger(),
      zotero: mockZotero,
      maxTime: 600
    });

    const cell = column.renderCell(mockDoc, 800, {});

    const progressBar = cell._children.find(c => c.className === 'reading-time-progress');
    assert.ok(progressBar, "Should have progress bar element");

    // Should cap at 100%
    assert.ok(progressBar.style.width.includes('100'), "Progress bar width should be capped at 100%");
  });

  it("should extract reading time from item.extra field", () => {
    const mockZotero = {
      Reader: {
        getActiveReaders() {
          return [];
        }
      }
    };

    const mockItem = {
      id: 1,
      getField(field) {
        if (field === 'extra') return 'Reading Time: 125';
        return '';
      }
    };

    const column = createReadingTimeColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const time = column.getReadingTime(mockItem);

    assert.equal(time, 125, "Should extract 125 from extra field");
  });

  it("should return 0 when item has no reading time in extra", () => {
    const mockZotero = {
      Reader: {
        getActiveReaders() {
          return [];
        }
      }
    };

    const mockItem = {
      id: 1,
      getField(field) {
        return '';
      }
    };

    const column = createReadingTimeColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    const time = column.getReadingTime(mockItem);

    assert.equal(time, 0, "Should return 0 when no cached data");
  });

  it("should return 0 for null/undefined items", () => {
    const mockZotero = {
      Reader: {
        getActiveReaders() {
          return [];
        }
      }
    };

    const column = createReadingTimeColumn({
      logger: createMockLogger(),
      zotero: mockZotero
    });

    assert.equal(column.getReadingTime(null), 0, "Null item should return 0");
    assert.equal(column.getReadingTime(undefined), 0, "Undefined item should return 0");
    assert.equal(column.getReadingTime({}), 0, "Item without id should return 0");
  });

  it("should use custom color and opacity from preferences", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createReadingTimeColumn({
      logger: createMockLogger(),
      zotero: mockZotero,
      maxTime: 600,
      color: '#FF5733',
      opacity: 0.5
    });

    const cell = column.renderCell(mockDoc, 300, {});

    const progressBar = cell._children.find(c => c.className === 'reading-time-progress');
    assert.ok(progressBar, "Should have progress bar");

    assert.ok(progressBar.style.backgroundColor.includes('#FF5733'), "Should use custom color");
    assert.ok(progressBar.style.opacity.includes('0.5'), "Should use custom opacity");
  });

  it("should hide progress bar when showProgress is false", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createReadingTimeColumn({
      logger: createMockLogger(),
      zotero: mockZotero,
      maxTime: 600,
      showProgress: false
    });

    const cell = column.renderCell(mockDoc, 300, {});

    const progressBar = cell._children.find(c => c.className === 'reading-time-progress');
    assert.ok(!progressBar, "Should not have progress bar when showProgress is false");
  });

  it("should hide text when showText is false", () => {
    const mockDoc = createMockDocument();
    const mockZotero = {
      getMainWindow() {
        return { document: mockDoc };
      }
    };

    const column = createReadingTimeColumn({
      logger: createMockLogger(),
      zotero: mockZotero,
      maxTime: 600,
      showText: false
    });

    const cell = column.renderCell(mockDoc, 300, {});

    const textLabel = cell._children.find(c => c.className === 'reading-time-text');
    assert.ok(!textLabel, "Should not have text when showText is false");
  });

  it("should use default preferences when not provided", () => {
    const column = createReadingTimeColumn({
      logger: createMockLogger()
    });

    // Should have default values
    assert.equal(column.maxTime, 600, "Default maxTime should be 600");
    assert.equal(column.color, '#468B97', "Default color should be #468B97");
    assert.equal(column.opacity, 0.7, "Default opacity should be 0.7");
    assert.equal(column.showProgress, true, "Default showProgress should be true");
    assert.equal(column.showText, true, "Default showText should be true");
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

    const column = createReadingTimeColumn({
      logger: mockLogger,
      i18n: mockI18n
    });

    column.register();

    assert.ok(globalThis.Zotero.ItemTreeManager.lastRegistration, "Should use global Zotero");
    delete globalThis.Zotero;
  });
});

runTests();
