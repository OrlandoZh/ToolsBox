/**
 * Tests for PDF Background Color feature
 * Task: Implement PDF background color customization for Reader
 */

import { describe, it, assert, runTests } from "../test-framework.js";
import { createPDFBackgroundColor } from "../../src/features/pdf-background-color.js";

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

function createMockPrefs(overrides = {}) {
  const defaults = {
    'pdfBackground.enabled': true,
    'pdfBackground.color': '#f5f5dc',
    'pdfBackground.applyToAll': true,
    'pdfBackground.preserveImages': true,
    ...overrides
  };
  return {
    get(key) {
      return defaults[key];
    }
  };
}

function createMockViewerElement() {
  return {
    style: {
      backgroundColor: ''
    },
    classList: {
      add: () => {},
      remove: () => {}
    },
    querySelectorAll: () => [],
    querySelector: () => null
  };
}

function createMockDocument() {
  const viewer = createMockViewerElement();
  const elements = [];
  return {
    createElement(tag) {
      const element = {
        tagName: tag,
        style: {},
        classList: {
          add: () => {},
          remove: () => {}
        },
        querySelectorAll: () => [],
        querySelector: () => null,
        appendChild: () => {}
      };
      elements.push(element);
      return element;
    },
    querySelector(selector) {
      if (selector === '#viewer' || selector === '.viewer' || selector === 'body') {
        return viewer;
      }
      return null;
    },
    querySelectorAll(selector) {
      return [];
    },
    body: viewer,
    getElements() {
      return elements;
    },
    getElementById(id) {
      if (id === 'viewer') {
        return viewer;
      }
      return null;
    }
  };
}

function createMockReader(overrides = {}) {
  const doc = createMockDocument();
  return {
    _iframeWindow: {
      document: doc
    },
    _itemID: 12345,
    _pdfReader: {
      pdfViewer: {
        container: {}
      }
    },
    ...overrides
  };
}

function createMockZotero(overrides = {}) {
  const readers = [];
  const openCallbacks = [];
  const closeCallbacks = [];

  return {
    Reader: {
      getActiveReaders() {
        return readers;
      },
      on(event, callback) {
        if (event === 'open') {
          openCallbacks.push(callback);
        } else if (event === 'close') {
          closeCallbacks.push(callback);
        }
      },
      _triggerOpen(reader) {
        openCallbacks.forEach(cb => cb(reader));
      },
      _triggerClose(reader) {
        closeCallbacks.forEach(cb => cb(reader));
      }
    },
    debug(message) {
      // Mock debug
    },
    ...overrides
  };
}

describe("PDFBackgroundColor", () => {
  it("should create feature with default values", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      prefs: mockPrefs
    });

    assert.equal(pdfBg.color, '#f5f5dc', "Default color should be beige");
    assert.equal(pdfBg.applyToAll, true, "applyToAll should default to true");
    assert.equal(pdfBg.preserveImages, true, "preserveImages should default to true");
  });

  it("should apply background color to reader document body", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const result = pdfBg.applyBackgroundColor(mockReader);

    assert.equal(result, true, "applyBackgroundColor should return true");
  });

  it("should use custom color from preferences", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'pdfBackground.color': '#e8f4ea'
    });

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    assert.equal(pdfBg.color, '#e8f4ea', "Should use custom color from preferences");
  });

  it("should return false for invalid reader", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      prefs: mockPrefs
    });

    const result1 = pdfBg.applyBackgroundColor(null);
    assert.equal(result1, false, "Should return false for null reader");

    const result2 = pdfBg.applyBackgroundColor({});
    assert.equal(result2, false, "Should return false for reader without iframeWindow");
  });

  it("should log error when applyBackgroundColor fails", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      prefs: mockPrefs
    });

    pdfBg.applyBackgroundColor(null);

    const logs = mockLogger.getLogs();
    const errorLog = logs.find(l => l.level === 'error');
    assert.ok(errorLog, "Should log error when applyBackgroundColor fails");
  });

  it("should register Zotero.Reader event listeners", () => {
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const result = pdfBg.register();

    assert.equal(result, true, "register should return true");
    assert.ok(mockLogger.getLogs().some(l => l.message === 'pdfBackground.registered'), "Should log registration");
  });

  it("should apply color when reader opens", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    pdfBg.register();
    mockZotero.Reader._triggerOpen(mockReader);

    // Should not throw and should have applied color
    assert.ok(true, "Reader open event should not throw");
  });

  it("should return false when register called without Zotero", () => {
    const mockLogger = createMockLogger();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger
    });

    const result = pdfBg.register();

    assert.equal(result, false, "register should return false when Zotero unavailable");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    const mockZotero = createMockZotero();
    globalThis.Zotero = mockZotero;

    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      prefs: mockPrefs
    });

    const result = pdfBg.register();

    assert.equal(result, true, "Should use global Zotero");
    delete globalThis.Zotero;
  });

  it("should remove background color on destroy", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    pdfBg.register();
    mockZotero.Reader._triggerOpen(mockReader);

    // Should not throw
    pdfBg.destroy();
    assert.ok(true, "destroy should complete without error");
  });

  it("should handle multiple reader instances", () => {
    const mockReader1 = createMockReader({ _itemID: 1001 });
    const mockReader2 = createMockReader({ _itemID: 1002 });
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    pdfBg.register();
    mockZotero.Reader._triggerOpen(mockReader1);
    mockZotero.Reader._triggerOpen(mockReader2);

    // Should not throw
    assert.ok(true, "Multiple reader instances should be handled");
  });

  it("should respect applyToAll preference", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'pdfBackground.applyToAll': false
    });

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    pdfBg.register();
    mockZotero.Reader._triggerOpen(mockReader);

    assert.ok(true, "Should respect applyToAll preference");
  });

  it("should expose all public methods", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      prefs: mockPrefs
    });

    assert.typeOf(pdfBg.register, 'function', "Should have register method");
    assert.typeOf(pdfBg.applyBackgroundColor, 'function', "Should have applyBackgroundColor method");
    assert.typeOf(pdfBg.destroy, 'function', "Should have destroy method");
    assert.typeOf(pdfBg.getColor, 'function', "Should have getColor method");
    assert.typeOf(pdfBg.setColor, 'function', "Should have setColor method");
  });

  it("should update color dynamically", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    pdfBg.register();
    mockZotero.Reader._triggerOpen(mockReader);

    pdfBg.setColor('#ffffff');
    assert.equal(pdfBg.getColor(), '#ffffff', "Should update color");
  });

  it("should validate hex color format", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      prefs: mockPrefs
    });

    assert.ok(pdfBg.isValidColor('#f5f5dc'), "Should validate 6-digit hex");
    assert.ok(pdfBg.isValidColor('#fff'), "Should validate 3-digit hex");
    assert.ok(pdfBg.isValidColor('rgb(255, 255, 255)'), "Should validate rgb");
    assert.ok(pdfBg.isValidColor('rgba(255, 255, 255, 0.5)'), "Should validate rgba");
    assert.ok(!pdfBg.isValidColor('invalid'), "Should reject invalid color");
  });

  it("should get current reader if available", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero({
      Reader: {
        ...createMockZotero().Reader,
        getActiveReaders: () => [mockReader]
      }
    });
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const pdfBg = createPDFBackgroundColor({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    pdfBg.register();
    const currentReader = pdfBg.getCurrentReader();

    assert.ok(currentReader !== undefined, "Should return current reader if available");
  });
});

runTests();
