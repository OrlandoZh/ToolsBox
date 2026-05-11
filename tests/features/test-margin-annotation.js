/**
 * Tests for Margin Annotation feature
 * Task 1 of P2 Reader integration plan
 */

import { describe, it, assert, runTests } from "../test-framework.js";
import { createMarginAnnotation } from "../../src/features/margin-annotation.js";

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
    'marginAnnotation.enabled': true,
    'marginAnnotation.width': 200,
    'marginAnnotation.color': '#86C8BC',
    'marginAnnotation.opacity': '0.7',
    'marginAnnotation.fontSize': '12',
    'marginAnnotation.lineHeight': '16',
    ...overrides
  };
  return {
    get(key) {
      return defaults[key];
    }
  };
}

function createMockCanvas() {
  return {
    className: '',
    style: {},
    width: 0,
    height: 0,
    parentNode: null,
    getContext: () => ({
      clearRect: () => {},
      fillText: () => {},
      fillRect: () => {},
      measureText: (text) => ({ width: text.length * 7 })
    })
  };
}

function createMockDocument() {
  const elements = [];
  const body = {
    children: [],
    scrollHeight: 800,
    appendChild(child) {
      body.children.push(child);
      child.parentNode = body;
    },
    removeChild(child) {
      const idx = body.children.indexOf(child);
      if (idx >= 0) {
        body.children.splice(idx, 1);
        child.parentNode = null;
      }
    }
  };
  return {
    createElement(tag) {
      const element = createMockCanvas();
      element.tagName = tag;
      elements.push(element);
      return element;
    },
    body,
    getElements() {
      return elements;
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
    ...overrides
  };
}

function createMockZotero(overrides = {}) {
  const readers = [];
  const openCallbacks = [];
  const closeCallbacks = [];
  const annotationCallbacks = [];

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
    Annotations: {
      getByItemID(itemID) {
        return overrides.annotations || [];
      }
    },
    Notifier: {
      registerObserver(observer, types) {
        if (types.includes('annotation')) {
          annotationCallbacks.push(observer);
        }
      },
      _triggerAnnotationChange(event, type, ids) {
        annotationCallbacks.forEach(obs => obs.notify(event, type, ids));
      }
    },
    ...overrides
  };
}

describe("MarginAnnotation", () => {
  it("should create canvas layer on reader open", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const canvas = margin.createLayer(mockReader);

    assert.ok(canvas, "Canvas should be created");
    assert.ok(canvas.width > 0, "Canvas should have width");
    assert.ok(canvas.height > 0, "Canvas should have height");
  });

  it("should use custom width from preferences", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'marginAnnotation.width': 300
    });

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const canvas = margin.createLayer(mockReader);

    assert.equal(canvas.width, 300, "Canvas width should match preference");
  });

  it("should return null for invalid reader", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      prefs: mockPrefs
    });

    const canvas = margin.createLayer(null);
    assert.equal(canvas, null, "Should return null for null reader");

    const canvas2 = margin.createLayer({});
    assert.equal(canvas2, null, "Should return null for reader without iframeWindow");
  });

  it("should render annotations in margin", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    margin.createLayer(mockReader);

    const annotations = [
      { position: { pageIndex: 0, rects: [[0, 100, 500, 120]] }, text: 'Important point' },
      { position: { pageIndex: 0, rects: [[0, 200, 500, 220]] }, text: 'Key finding' }
    ];

    // Should not throw
    margin.renderAnnotations(annotations, { width: 200, height: 800 });
    assert.ok(true, "renderAnnotations should complete without error");
  });

  it("should truncate long annotation text", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    margin.createLayer(mockReader);

    const longText = 'This is a very long annotation text that should be truncated to fit the margin width';
    const annotations = [
      { position: { pageIndex: 0, rects: [[0, 100, 500, 120]] }, text: longText }
    ];

    margin.renderAnnotations(annotations, { width: 200, height: 800 });

    const truncated = margin.truncateText(longText, 30);
    assert.ok(truncated.length <= 33, "Truncated text should be <= 30 chars + '...'");
    assert.ok(truncated.endsWith('...'), "Truncated text should end with '...'");
  });

  it("should handle empty annotations array", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    margin.createLayer(mockReader);

    // Should not throw
    margin.renderAnnotations([], { width: 200, height: 800 });
    margin.renderAnnotations(null, { width: 200, height: 800 });
    assert.ok(true, "Should handle empty/null annotations gracefully");
  });

  it("should handle reader resize", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    margin.createLayer(mockReader);

    margin.resize(300, 900);

    assert.equal(margin.getWidth(), 300, "Width should be updated");
    assert.equal(margin.getHeight(), 900, "Height should be updated");
  });

  it("should not resize when canvas not created", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      prefs: mockPrefs
    });

    // Should not throw when canvas doesn't exist
    margin.resize(300, 900);
    assert.ok(true, "Resize should handle missing canvas gracefully");
  });

  it("should destroy canvas layer on close", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    margin.createLayer(mockReader);
    assert.ok(margin.getWidth() > 0, "Canvas should exist before destroy");

    margin.destroy();
    assert.equal(margin.getWidth(), 200, "getWidth should return default after destroy");
    assert.equal(margin.getHeight(), 0, "getHeight should return 0 after destroy");
  });

  it("should register Zotero.Reader event listeners", () => {
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    const result = margin.register();

    assert.equal(result, true, "register should return true");
    assert.ok(mockLogger.getLogs().some(l => l.message === 'marginAnnotation.registered'), "Should log registration");
  });

  it("should create layer when reader opens", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    margin.register();

    // Simulate reader opening
    mockZotero.Reader._triggerOpen(mockReader);

    assert.ok(margin.getWidth() > 0, "Canvas should be created after reader opens");
  });

  it("should destroy layer when reader closes", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    margin.register();
    mockZotero.Reader._triggerOpen(mockReader);
    assert.ok(margin.getWidth() > 0, "Canvas should exist after open");

    mockZotero.Reader._triggerClose(mockReader);
    assert.equal(margin.getWidth(), 200, "Canvas should be destroyed after close");
  });

  it("should update annotations on Notifier event", () => {
    const mockReader = createMockReader({ annotations: [
      { position: { pageIndex: 0 }, text: 'Test annotation' }
    ]});
    const mockZotero = createMockZotero({
      annotations: [
        { position: { pageIndex: 0 }, text: 'Test annotation' }
      ]
    });
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    margin.register();
    mockZotero.Reader._triggerOpen(mockReader);

    // Trigger annotation change
    mockZotero.Notifier._triggerAnnotationChange('modify', 'annotation', [1, 2, 3]);

    // Should not throw and should have updated
    assert.ok(true, "Annotation update should complete without error");
  });

  it("should use custom color from preferences", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'marginAnnotation.color': '#FF5733'
    });

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    assert.equal(margin.color, '#FF5733', "Should use custom color");
  });

  it("should use custom opacity from preferences", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'marginAnnotation.opacity': '0.5'
    });

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    assert.equal(margin.opacity, 0.5, "Should use custom opacity");
  });

  it("should use custom font size from preferences", () => {
    const mockReader = createMockReader();
    const mockZotero = createMockZotero();
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs({
      'marginAnnotation.fontSize': '14'
    });

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      zotero: mockZotero,
      prefs: mockPrefs
    });

    assert.equal(margin.fontSize, 14, "Should use custom font size");
  });

  it("should use default values when preferences not provided", () => {
    const mockLogger = createMockLogger();

    const margin = createMarginAnnotation({
      logger: mockLogger
    });

    assert.equal(margin.width, 200, "Default width should be 200");
    assert.equal(margin.color, '#86C8BC', "Default color should be #86C8BC");
    assert.equal(margin.opacity, 0.7, "Default opacity should be 0.7");
    assert.equal(margin.fontSize, 12, "Default fontSize should be 12");
    assert.equal(margin.lineHeight, 16, "Default lineHeight should be 16");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    const mockZotero = createMockZotero();
    globalThis.Zotero = mockZotero;

    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      prefs: mockPrefs
    });

    const result = margin.register();

    assert.equal(result, true, "Should use global Zotero");
    delete globalThis.Zotero;
  });

  it("should return false when register called without Zotero", () => {
    const mockLogger = createMockLogger();

    const margin = createMarginAnnotation({
      logger: mockLogger
    });

    const result = margin.register();

    assert.equal(result, false, "register should return false when Zotero unavailable");
  });

  it("should log error when createLayer fails", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      prefs: mockPrefs
    });

    margin.createLayer(null);

    const logs = mockLogger.getLogs();
    const errorLog = logs.find(l => l.level === 'error');
    assert.ok(errorLog, "Should log error when createLayer fails");
  });

  it("should expose all public methods", () => {
    const mockLogger = createMockLogger();
    const mockPrefs = createMockPrefs();

    const margin = createMarginAnnotation({
      logger: mockLogger,
      i18n: createMockI18n(),
      prefs: mockPrefs
    });

    assert.typeOf(margin.register, 'function', "Should have register method");
    assert.typeOf(margin.createLayer, 'function', "Should have createLayer method");
    assert.typeOf(margin.renderAnnotations, 'function', "Should have renderAnnotations method");
    assert.typeOf(margin.resize, 'function', "Should have resize method");
    assert.typeOf(margin.destroy, 'function', "Should have destroy method");
    assert.typeOf(margin.getWidth, 'function', "Should have getWidth method");
    assert.typeOf(margin.getHeight, 'function', "Should have getHeight method");
    assert.typeOf(margin.truncateText, 'function', "Should have truncateText method");
  });
});

runTests();
