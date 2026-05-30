/**
 * Tests for Reader feature
 * Comprehensive tests for the Reader tool module (src/features/reader.js)
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  createReader,
  READER_TYPES,
  ANNOTATION_TYPES,
  READER_EVENT_TYPES,
} from "../../src/features/reader.js";

function createMockLogger() {
  const logs = [];
  return {
    info(msg) { logs.push({ level: "info", msg }); },
    warn(msg) { logs.push({ level: "warn", msg }); },
    error(msg) { logs.push({ level: "error", msg }); },
    debug(msg) { logs.push({ level: "debug", msg }); },
    getLogs() { return logs; },
  };
}

function createMockWindow(overrides = {}) {
  return {
    document: {
      createElement() {
        return {
          setAttribute() {},
          appendChild() {},
          addEventListener() {},
        };
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    setTimeout(fn, ms) { return setTimeout(fn, ms); },
    setInterval(fn, ms) { return 1; },
    clearInterval() {},
    Zotero_Tabs: {
      selectedID: "test-tab-1",
    },
    ...overrides,
  };
}

function createMockZotero(overrides = {}) {
  const eventListeners = [];
  const contextMenuItems = [];
  const readers = overrides._readers || [];

  return {
    Reader: {
      _readers: readers,
      registerEventListener(type, handler, pluginID) {
        eventListeners.push({ type, handler, pluginID });
      },
      unregisterEventListener(type, handler) {
        const index = eventListeners.findIndex(
          (e) => e.type === type && e.handler === handler
        );
        if (index >= 0) eventListeners.splice(index, 1);
      },
      registerContextMenuItem(type, item) {
        contextMenuItems.push({ type, item });
      },
      unregisterContextMenuItem(type, item) {
        const index = contextMenuItems.findIndex(
          (e) => e.type === type && e.item === item
        );
        if (index >= 0) contextMenuItems.splice(index, 1);
      },
      getByTabID(tabID) {
        return readers.find((r) => r.tabID === tabID) || null;
      },
      getWindowStates() {
        return [];
      },
      open() {
        return Promise.resolve(null);
      },
      openURI() {
        return Promise.resolve();
      },
    },
    Annotations: {
      saveFromJSON() {
        return Promise.resolve(null);
      },
    },
    Items: {
      get(id) {
        return null;
      },
    },
    getMainWindow() {
      return createMockWindow();
    },
    Prefs: {
      get() {
        return undefined;
      },
      set() {},
    },
    DataObjectUtilities: {
      generateKey() {
        return "TESTKEY1";
      },
    },
    ...overrides,
  };
}

describe("Reader Factory", () => {
  it("should create reader instance with expected methods", () => {
    const reader = createReader({ logger: createMockLogger() });

    assert.typeOf(reader.isAvailable, "function", "should have isAvailable");
    assert.typeOf(reader.getActiveReader, "function", "should have getActiveReader");
    assert.typeOf(reader.getReaderSummary, "function", "should have getReaderSummary");
    assert.typeOf(reader.getAllReaders, "function", "should have getAllReaders");
    assert.typeOf(reader.getByTabID, "function", "should have getByTabID");
    assert.typeOf(reader.getByItemID, "function", "should have getByItemID");
    assert.typeOf(reader.registerEventListener, "function", "should have registerEventListener");
    assert.typeOf(reader.unregisterEventListener, "function", "should have unregisterEventListener");
    assert.typeOf(reader.unregisterAllEventListeners, "function", "should have unregisterAllEventListeners");
    assert.typeOf(reader.getRegisteredEventListeners, "function", "should have getRegisteredEventListeners");
    assert.typeOf(reader.getEventListenerCount, "function", "should have getEventListenerCount");
    assert.typeOf(reader.isAnnotationsAvailable, "function", "should have isAnnotationsAvailable");
    assert.typeOf(reader.getAnnotations, "function", "should have getAnnotations");
    assert.typeOf(reader.getAnnotation, "function", "should have getAnnotation");
    assert.typeOf(reader.dispatchSyntheticEvent, "function", "should have dispatchSyntheticEvent");
    assert.typeOf(reader.getKnownEventTypes, "function", "should have getKnownEventTypes");
    assert.typeOf(reader.getProbeCompatibleEventTypes, "function", "should have getProbeCompatibleEventTypes");
    assert.typeOf(reader.registerViewContextMenuItem, "function", "should have registerViewContextMenuItem");
    assert.typeOf(reader.registerAnnotationContextMenuItem, "function", "should have registerAnnotationContextMenuItem");
  });

  it("should export constants as non-empty objects", () => {
    assert.ok(READER_TYPES, "READER_TYPES should be exported");
    assert.ok(ANNOTATION_TYPES, "ANNOTATION_TYPES should be exported");
    assert.ok(READER_EVENT_TYPES, "READER_EVENT_TYPES should be exported");
    assert.ok(Object.keys(READER_TYPES).length > 0, "READER_TYPES should not be empty");
    assert.ok(Object.keys(ANNOTATION_TYPES).length > 0, "ANNOTATION_TYPES should not be empty");
    assert.ok(Object.keys(READER_EVENT_TYPES).length > 0, "READER_EVENT_TYPES should not be empty");
  });
});

describe("Reader State (no readers mounted)", () => {
  it("should return empty state when no Zotero.Reader available", () => {
    const reader = createReader({ logger: createMockLogger(), zotero: null });

    assert.equal(reader.isAvailable(), false, "isAvailable should be false");
    assert.equal(reader.getActiveReader(), null, "getActiveReader should return null");
    assert.deepEqual(reader.getAllReaders(), [], "getAllReaders should return empty array");
    assert.equal(reader.getByTabID("any"), null, "getByTabID should return null");
    assert.equal(reader.getByItemID(123), null, "getByItemID should return null");
    assert.equal(reader.getReaderSummary(), null, "getReaderSummary should return null without active reader");
  });

  it("should return empty arrays for annotation IDs when no reader", () => {
    const mockZotero = createMockZotero();
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });

    assert.deepEqual(reader.getAnnotationIDs("tab-1"), [], "getAnnotationIDs should return empty array");
  });
});

describe("Reader State (with mock reader)", () => {
  it("should find reader by tabID and return summary", () => {
    const mockReader = {
      tabID: "tab-1",
      itemID: 123,
      annotationItemIDs: [1, 2, 3],
    };
    const mockZotero = createMockZotero({
      _readers: [mockReader],
    });
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });

    assert.equal(reader.isAvailable(), true, "isAvailable should be true");
    const found = reader.getByTabID("tab-1");
    assert.ok(found, "getByTabID should find the reader");
    assert.equal(found.tabID, "tab-1", "found reader should have correct tabID");

    const summary = reader.getReaderSummary(mockReader);
    assert.ok(summary, "getReaderSummary should return summary");
    assert.equal(summary.tabID, "tab-1", "summary tabID should match");
    assert.equal(summary.itemID, 123, "summary itemID should match");
    assert.equal(summary.annotationCount, 3, "summary annotationCount should match");
  });

  it("should find reader by itemID", () => {
    const mockReader = {
      tabID: "tab-2",
      itemID: 456,
      annotationItemIDs: [],
    };
    const mockZotero = createMockZotero({
      _readers: [mockReader],
    });
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });

    const found = reader.getByItemID(456);
    assert.ok(found, "getByItemID should find the reader");
    assert.equal(found.itemID, 456, "found reader should have correct itemID");
  });

  it("should get active reader from main window tabs", () => {
    const mockReader = {
      tabID: "test-tab-1",
      itemID: 789,
      annotationItemIDs: [],
    };
    const mockWindow = createMockWindow({
      Zotero_Tabs: { selectedID: "test-tab-1" },
    });
    const mockZotero = createMockZotero({
      _readers: [mockReader],
      getMainWindow() {
        return mockWindow;
      },
    });
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });

    const active = reader.getActiveReader();
    assert.ok(active, "getActiveReader should find active reader");
    assert.equal(active.tabID, "test-tab-1", "active reader should match selected tab");
  });
});

describe("Annotation API", () => {
  it("should report annotations unavailable when Zotero.Annotations missing", () => {
    const mockZotero = createMockZotero();
    delete mockZotero.Annotations;
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });

    assert.equal(reader.isAnnotationsAvailable(), false, "isAnnotationsAvailable should be false");
    assert.deepEqual(reader.getAnnotations(123), [], "getAnnotations should return empty array");
    assert.equal(reader.getAnnotation(123), null, "getAnnotation should return null");
  });

  it("should report annotations available when Zotero.Annotations exists", () => {
    const mockZotero = createMockZotero();
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });

    assert.equal(reader.isAnnotationsAvailable(), true, "isAnnotationsAvailable should be true");
  });
});

describe("Event API", () => {
  it("should report event API availability correctly", () => {
    const mockZoteroMissing = createMockZotero();
    delete mockZoteroMissing.Reader.registerEventListener;
    const readerMissing = createReader({ logger: createMockLogger(), zotero: mockZoteroMissing });
    assert.equal(readerMissing.isEventAPIAvailable(), false, "should be false when registerEventListener missing");

    const mockZoteroFull = createMockZotero();
    const readerFull = createReader({ logger: createMockLogger(), zotero: mockZoteroFull });
    assert.equal(readerFull.isEventAPIAvailable(), true, "should be true when all methods present");
  });

  it("should register and unregister event listeners", () => {
    const mockZotero = createMockZotero();
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });
    const handler = () => {};

    assert.equal(reader.getEventListenerCount(), 0, "initial count should be 0");

    const cleanup = reader.registerEventListener(
      READER_EVENT_TYPES.RENDER_TOOLBAR,
      handler
    );
    assert.ok(typeof cleanup === "function", "registerEventListener should return cleanup function");
    assert.equal(reader.getEventListenerCount(), 1, "count should be 1 after register");

    const listeners = reader.getRegisteredEventListeners();
    assert.equal(listeners.length, 1, "getRegisteredEventListeners should return 1");
    assert.equal(listeners[0].type, READER_EVENT_TYPES.RENDER_TOOLBAR, "listener type should match");

    cleanup();
    assert.equal(reader.getEventListenerCount(), 0, "count should be 0 after cleanup");
  });

  it("should reject unknown event types", () => {
    const mockZotero = createMockZotero();
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });
    const handler = () => {};

    const result = reader.registerEventListener("unknownEvent", handler);
    assert.equal(result, null, "should return null for unknown event type");
  });

  it("should reject invalid handler", () => {
    const mockZotero = createMockZotero();
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });

    const result = reader.registerEventListener(READER_EVENT_TYPES.RENDER_TOOLBAR, null);
    assert.equal(result, null, "should return null for invalid handler");
  });

  it("should unregister all event listeners", () => {
    const mockZotero = createMockZotero();
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });

    reader.registerEventListener(READER_EVENT_TYPES.RENDER_TOOLBAR, () => {});
    reader.registerEventListener(READER_EVENT_TYPES.RENDER_TEXT_SELECTION_POPUP, () => {});
    assert.equal(reader.getEventListenerCount(), 2, "should have 2 listeners");

    const removed = reader.unregisterAllEventListeners();
    assert.equal(removed, 2, "should return 2 removed listeners");
    assert.equal(reader.getEventListenerCount(), 0, "should have 0 listeners after unregisterAll");
  });

  it("should return known and probe-compatible event types as arrays", () => {
    const reader = createReader({ logger: createMockLogger() });

    const knownTypes = reader.getKnownEventTypes();
    assert.ok(Array.isArray(knownTypes), "getKnownEventTypes should return array");
    assert.ok(knownTypes.length > 0, "knownTypes should not be empty");
    assert.ok(knownTypes.includes(READER_EVENT_TYPES.RENDER_TOOLBAR), "should include RENDER_TOOLBAR");

    const probeTypes = reader.getProbeCompatibleEventTypes();
    assert.ok(Array.isArray(probeTypes), "getProbeCompatibleEventTypes should return array");
    assert.ok(probeTypes.length > 0, "probeTypes should not be empty");
  });

  it("should return event API report", () => {
    const mockZotero = createMockZotero();
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });

    const report = reader.getEventAPIReport();
    assert.ok(report, "getEventAPIReport should return report");
    assert.equal(typeof report.available, "boolean", "report should have available boolean");
    assert.equal(typeof report.registeredCount, "number", "report should have registeredCount number");
    assert.ok(Array.isArray(report.knownTypes), "report should have knownTypes array");
    assert.ok(Array.isArray(report.probeCompatibleTypes), "report should have probeCompatibleTypes array");
  });
});

describe("Context Menu Registration", () => {
  it("should register view context menu item via event listener", () => {
    const mockZotero = createMockZotero();
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });

    const cleanup = reader.registerViewContextMenuItem({ label: "Test View Menu" });
    assert.ok(typeof cleanup === "function", "registerViewContextMenuItem should return cleanup function");
    assert.equal(reader.getEventListenerCount(), 1, "should register one event listener");

    cleanup();
    assert.equal(reader.getEventListenerCount(), 0, "should unregister after cleanup");
  });

  it("should register annotation context menu item via event listener", () => {
    const mockZotero = createMockZotero();
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });

    const cleanup = reader.registerAnnotationContextMenuItem({ label: "Test Annotation Menu" });
    assert.ok(typeof cleanup === "function", "registerAnnotationContextMenuItem should return cleanup function");
    assert.equal(reader.getEventListenerCount(), 1, "should register one event listener");

    cleanup();
    assert.equal(reader.getEventListenerCount(), 0, "should unregister after cleanup");
  });

  it("should handle factory function for context menu items", () => {
    const mockZotero = createMockZotero();
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });
    const factory = (event) => [{ label: "Dynamic Item" }];

    const cleanup = reader.registerViewContextMenuItem(factory);
    assert.ok(typeof cleanup === "function", "should accept factory function");
    assert.equal(reader.getEventListenerCount(), 1, "should register listener for factory");

    cleanup();
  });
});

describe("Synthetic Events", () => {
  it("should dispatch synthetic event to registered listeners", () => {
    const mockZotero = createMockZotero();
    const reader = createReader({ logger: createMockLogger(), zotero: mockZotero });
    const mockReader = { tabID: "tab-1", itemID: 100 };

    let receivedEvent = null;
    reader.registerEventListener(READER_EVENT_TYPES.RENDER_TOOLBAR, (event) => {
      receivedEvent = event;
    });

    const result = reader.dispatchSyntheticEvent(mockReader, {
      type: READER_EVENT_TYPES.RENDER_TOOLBAR,
    });

    assert.equal(result.dispatched, 1, "should dispatch to 1 listener");
    assert.equal(result.failed, 0, "should have 0 failures");
    assert.equal(result.supported, true, "should be supported");
    assert.ok(receivedEvent, "handler should receive event");
    assert.equal(receivedEvent.type, READER_EVENT_TYPES.RENDER_TOOLBAR, "event type should match");
  });

  it("should return unsupported for non-synthetic-fallback types", () => {
    const reader = createReader({ logger: createMockLogger() });

    const result = reader.dispatchSyntheticEvent(null, { type: "unsupportedType" });
    assert.equal(result.supported, false, "should report unsupported");
    assert.equal(result.dispatched, 0, "should dispatch to 0 listeners");
  });

  it("should handle empty event type gracefully", () => {
    const reader = createReader({ logger: createMockLogger() });

    const result = reader.dispatchSyntheticEvent(null, { type: "" });
    assert.equal(result.dispatched, 0, "should dispatch to 0 listeners for empty type");
  });
});

describe("globalThis.Zotero fallback", () => {
  it("should use globalThis.Zotero when zotero option not provided", () => {
    const saved = globalThis.Zotero;
    globalThis.Zotero = createMockZotero();

    const reader = createReader({ logger: createMockLogger() });
    assert.equal(reader.isAvailable(), true, "should use globalThis.Zotero fallback");

    globalThis.Zotero = saved;
  });
});

describe("Reader Summary & Snapshot", () => {
  it("should return null summary for null reader", () => {
    const reader = createReader({ logger: createMockLogger() });
    assert.equal(reader.getReaderSummary(null), null, "null reader should give null summary");
  });

  it("should return selection snapshot for event source", () => {
    const mockReader = {
      tabID: "tab-1",
      itemID: 100,
      annotationItemIDs: [],
    };
    const reader = createReader({ logger: createMockLogger() });

    const snapshot = reader.getSelectionSnapshot({
      reader: mockReader,
      params: { text: "selected text" },
    });

    assert.ok(snapshot, "getSelectionSnapshot should return snapshot");
    assert.equal(snapshot.hasSelection, true, "snapshot should have selection");
    assert.equal(snapshot.text, "selected text", "snapshot text should match");
    assert.equal(snapshot.sourceKind, "event-params", "sourceKind should be event-params");
  });
});

describe("Lifecycle integration", () => {
  it("should track cleanup via lifecycle object", () => {
    const trackedCleanups = [];
    const lifecycle = {
      trackCleanup(fn) {
        trackedCleanups.push(fn);
      },
    };
    const mockZotero = createMockZotero();
    const reader = createReader({
      logger: createMockLogger(),
      zotero: mockZotero,
      lifecycle,
    });

    reader.registerEventListener(READER_EVENT_TYPES.RENDER_TOOLBAR, () => {});
    assert.equal(trackedCleanups.length, 1, "lifecycle should track one cleanup");

    reader.registerViewContextMenuItem({ label: "Test" });
    assert.equal(trackedCleanups.length, 2, "lifecycle should track two cleanups");
  });
});

await runTestsIfMain(import.meta.url);
