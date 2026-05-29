import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createReader } from "../src/features/reader.js";

describe("Reader", () => {
  let activeReader;
  let readerAPI;
  let windowStates;
  let attachmentMap;
  let annotationMap;
  let trackedCleanups;
  let eventRegistrations;
  let eventUnregistrations;

  beforeEach(() => {
    activeReader = null;
    windowStates = [];
    attachmentMap = new Map();
    annotationMap = new Map();
    trackedCleanups = [];
    eventRegistrations = [];
    eventUnregistrations = [];

    globalThis.Zotero = {
      getMainWindow() {
        return {
          Zotero_Tabs: {
            selectedID: activeReader ? activeReader.tabID : "library",
          },
        };
      },
      Reader: {
        _readers: [],
        getByTabID(tabID) {
          return activeReader && activeReader.tabID === tabID ? activeReader : null;
        },
        registerEventListener(type, handler, pluginID) {
          eventRegistrations.push({
            type,
            handler,
            pluginID: pluginID || null,
          });
        },
        unregisterEventListener(type, handler) {
          eventUnregistrations.push({ type, handler });
        },
        getWindowStates() {
          return windowStates;
        },
      },
      Items: {
        get(itemID) {
          if (attachmentMap.has(itemID)) {
            return attachmentMap.get(itemID);
          }
          if (annotationMap.has(itemID)) {
            return annotationMap.get(itemID);
          }
          return null;
        },
      },
      Prefs: {
        get(key) {
          if (key === "reader.lastSidebarTab") {
            return "annotations";
          }
          if (key === "reader.textSelectionAnnotationMode") {
            return "highlight";
          }
          return null;
        },
      },
    };

    readerAPI = createReader({
      logger: {
        debug() {},
        error() {},
      },
      lifecycle: {
        trackCleanup(fn) {
          trackedCleanups.push(fn);
        },
      },
      pluginID: "cleanroom-template@example.com",
      zotero: globalThis.Zotero,
    });
  });

  afterEach(() => {
    delete globalThis.Zotero;
  });

  it("should return null summary when no active reader exists", () => {
    assert.equal(readerAPI.getActiveSummary(), null);
    assert.equal(readerAPI.getReaderSummary("missing-tab"), null);
  });

  it("should summarize the active reader context", () => {
    const annotationItems = [1001, 1002, 1003].map((id, index) => ({
      id,
      key: `A${index + 1}`,
      parentItemID: 42,
      annotationType: index === 0 ? "highlight" : "note",
      annotationText: index === 0 ? "Selected text" : null,
      annotationComment: index === 1 ? "My note" : null,
      annotationColor: "#ffd400",
      annotationPageLabel: String(index + 1),
      annotationAuthorName: "Tester",
      isAnnotation() {
        return true;
      },
      isEditable() {
        return index !== 2;
      },
    }));
    annotationItems.forEach((item) => {
      annotationMap.set(item.id, item);
    });
    attachmentMap.set(42, {
      attachmentReaderType: "pdf",
      isAttachment() {
        return true;
      },
      getAnnotations() {
        return annotationItems;
      },
    });
    activeReader = {
      itemID: 42,
      tabID: "reader-tab-42",
      annotationItemIDs: [1001, 1002, 1003],
      selectedAnnotationIDs: [1002],
      sidebarOpen: true,
      sidebarWidth: 280,
      toolType: "highlight",
      flowMode: "paginated",
      splitType: "vertical",
      scrollMode: 0,
      spreadMode: 1,
      zoomAutoEnabled: false,
      zoomPageWidthEnabled: true,
      zoomPageHeightEnabled: false,
      contextPaneOpen: true,
      canNavigateBack: false,
      canNavigateForward: true,
      canNavigateToFirstPage: false,
      canNavigateToLastPage: true,
      _state: {
        primaryViewState: {
          pageIndex: 0,
          scale: "page-width",
          scrollMode: 0,
          spreadMode: 1,
        },
        primaryViewStats: {
          canNavigateToPreviousPage: false,
          canNavigateToNextPage: true,
        },
        secondaryViewState: {
          pageIndex: 1,
          scale: "page-height",
        },
      },
      getSecondViewState() {
        return {
          pageIndex: 1,
          scale: "page-height",
        };
      },
    };
    globalThis.Zotero.Reader._readers = [activeReader];
    windowStates = [{
      tabID: "reader-tab-42",
      itemID: 42,
      type: "pdf",
      title: "Reader Window",
      selected: true,
      openInWindow: false,
      location: {
        pageIndex: 0,
        pageLabel: "1",
      },
    }];

    assert.deepEqual(readerAPI.getActiveSummary(), {
      tabID: "reader-tab-42",
      itemID: 42,
      type: "pdf",
      annotationIDs: [1001, 1002, 1003],
      annotationCount: 3,
    });
    assert.deepEqual(readerAPI.getReaderSummary("reader-tab-42"), {
      tabID: "reader-tab-42",
      itemID: 42,
      type: "pdf",
      annotationIDs: [1001, 1002, 1003],
      annotationCount: 3,
    });
    assert.deepEqual(readerAPI.getReaderSummary(42), {
      tabID: "reader-tab-42",
      itemID: 42,
      type: "pdf",
      annotationIDs: [1001, 1002, 1003],
      annotationCount: 3,
    });

    const interaction = readerAPI.getReaderInteractionSnapshot(42);
    assert.equal(interaction.active, true);
    assert.equal(interaction.supportsAnnotationAPI, false);
    assert.equal(interaction.selectedAnnotationCount, 1);
    assert.deepEqual(interaction.selectedAnnotationIDs, [1002]);
    assert.equal(interaction.annotationDetailCount, 3);
    assert.equal(interaction.editableAnnotationCount, 2);
    assert.equal(interaction.matchingWindowStateCount, 1);
    assert.equal(interaction.hasMatchingWindowState, true);
    assert.equal(interaction.annotationDetails[0].id, 1001);
    assert.equal(interaction.annotationDetails[0].type, "highlight");
    assert.equal(interaction.annotationDetails[1].comment, "My note");
    assert.equal(interaction.uiState.sidebarOpen, true);
    assert.equal(interaction.uiState.sidebarWidth, 280);
    assert.equal(interaction.uiState.sidebarView, "annotations");
    assert.equal(interaction.uiState.textSelectionAnnotationMode, "highlight");
    assert.equal(interaction.uiState.toolType, "highlight");
    assert.equal(interaction.uiState.splitType, "vertical");
    assert.equal(interaction.uiState.scrollMode, 0);
    assert.equal(interaction.uiState.spreadMode, 1);
    assert.equal(interaction.uiState.zoomPageWidthEnabled, true);
    assert.equal(interaction.uiState.navigation.canNavigateToNextPage, true);
    assert.equal(interaction.uiState.hasSecondViewState, true);
    assert.equal(interaction.uiState.primaryViewState.scale, "page-width");
    assert.equal(interaction.windowStates[0].location.pageLabel, "1");

    const uiState = readerAPI.getReaderUIStateSnapshot(42);
    assert.equal(uiState.contextPaneOpen, true);
    assert.equal(uiState.navigation.canNavigateBack, false);
    assert.equal(uiState.navigation.canNavigateToLastPage, true);
    assert.equal(uiState.secondViewState.pageIndex, 1);
  });

  it("should build selection snapshots from reader events and live iframe selection", () => {
    attachmentMap.set(42, {
      attachmentReaderType: "pdf",
      isAttachment() {
        return true;
      },
      getAnnotations() {
        return [];
      },
    });
    activeReader = {
      itemID: 42,
      tabID: "reader-tab-42",
      annotationItemIDs: [1001],
      selectedAnnotationIDs: [1001],
      _iframeWindow: {
        getSelection() {
          return {
            toString() {
              return "Iframe selection fallback";
            },
          };
        },
        document: {
          defaultView: null,
        },
      },
    };
    globalThis.Zotero.Reader._readers = [activeReader];

    const eventSnapshot = readerAPI.getSelectionSnapshot({
      reader: activeReader,
      params: {
        annotation: {
          text: "Event annotation text",
        },
        selectedText: "Secondary event text",
      },
    });
    assert.deepEqual(eventSnapshot, {
      hasSelection: true,
      sourceKind: "event-annotation",
      text: "Event annotation text",
      textLength: 21,
      tabID: "reader-tab-42",
      itemID: 42,
      readerType: "pdf",
      selectedAnnotationIDs: [1001],
      annotationCount: 1,
    });

    const fallbackSnapshot = readerAPI.getSelectionSnapshot(activeReader, {
      maxTextLength: 10,
      includeUIState: true,
    });
    assert.equal(fallbackSnapshot.hasSelection, true);
    assert.equal(fallbackSnapshot.sourceKind, "iframe-selection");
    assert.equal(fallbackSnapshot.text, "Iframe sel");
    assert.equal(fallbackSnapshot.textLength, 10);
    assert.equal(fallbackSnapshot.itemID, 42);
    assert.deepEqual(fallbackSnapshot.selectedAnnotationIDs, [1001]);
    assert.equal(typeof fallbackSnapshot.uiState, "object");
  });

  it("should normalize annotation input and support annotation roundtrip helpers", async () => {
    const saveCalls = [];
    let nextAnnotationID = 2001;
    const attachment = {
      id: 77,
      libraryID: 1,
      attachmentReaderType: "pdf",
      _annotations: [],
      isAttachment() {
        return true;
      },
      getAnnotations() {
        return this._annotations.slice();
      },
    };

    attachmentMap.set(77, attachment);
    activeReader = {
      itemID: 77,
      tabID: "reader-tab-77",
      annotationItemIDs: [],
      selectedAnnotationIDs: [],
    };
    globalThis.Zotero.Reader._readers = [activeReader];
    globalThis.Zotero.DataObjectUtilities = {
      generateKey() {
        return "ABC12345";
      },
    };
    globalThis.Zotero.Annotations = {
      async saveFromJSON(currentAttachment, json) {
        saveCalls.push({
          attachmentID: currentAttachment.id,
          json,
        });

        const annotation = {
          id: nextAnnotationID,
          key: json.key,
          parentItemID: currentAttachment.id,
          parentID: currentAttachment.id,
          annotationType: json.type,
          annotationText: json.text ?? null,
          annotationComment: json.comment ?? null,
          annotationColor: json.color ?? null,
          annotationPageLabel: json.pageLabel ?? null,
          annotationAuthorName: json.authorName ?? null,
          isAnnotation() {
            return true;
          },
          isEditable() {
            return true;
          },
          async saveTx() {
            return true;
          },
          async eraseTx() {
            const currentAttachmentItem = attachmentMap.get(currentAttachment.id);
            if (currentAttachmentItem) {
              currentAttachmentItem._annotations = currentAttachmentItem._annotations
                .filter((item) => item.id !== annotation.id);
            }
            annotationMap.delete(annotation.id);
            return true;
          },
        };

        nextAnnotationID += 1;
        annotationMap.set(annotation.id, annotation);
        currentAttachment._annotations = currentAttachment._annotations
          .filter((item) => item.id !== annotation.id)
          .concat(annotation);
        return annotation;
      },
    };

    const created = await readerAPI.createAnnotation(77, {
      type: "note",
      comment: "第一条中文批注",
      pageIndex: 2,
      tags: ["agent", { tag: "reader" }],
    });

    assert.equal(created.id, 2001);
    assert.equal(saveCalls.length, 1);
    assert.deepEqual(saveCalls[0].json, {
      key: "ABC12345",
      type: "note",
      color: "#ffd400",
      pageLabel: "3",
      sortIndex: "00003|000000|00000",
      position: {
        pageIndex: 2,
        rects: [[40, 40, 120, 80]],
      },
      comment: "第一条中文批注",
      tags: [{ name: "agent" }, { name: "reader" }],
    });

    const interaction = readerAPI.getReaderInteractionSnapshot(77);
    assert.equal(interaction.supportsAnnotationAPI, true);
    assert.equal(interaction.annotationCount, 0);
    assert.equal(interaction.annotationDetailCount, 1);
    assert.equal(interaction.annotationDetails[0].comment, "第一条中文批注");

    const updated = await readerAPI.updateAnnotation(created.id, {
      comment: "更新后的批注说明",
      color: "#00aa88",
      pageIndex: 4,
    });
    assert.equal(updated, true);
    assert.equal(annotationMap.get(created.id).annotationComment, "更新后的批注说明");
    assert.equal(annotationMap.get(created.id).annotationColor, "#00aa88");
    assert.equal(annotationMap.get(created.id).annotationPageLabel, "5");

    const deleted = await readerAPI.deleteAnnotation(created.id);
    assert.equal(deleted, true);
    assert.equal(annotationMap.has(created.id), false);
    assert.equal(attachment.getAnnotations().length, 0);
  });

  it("should register, snapshot, and unregister official reader event listeners", () => {
    const invocations = [];
    const handler = (event) => {
      invocations.push(event);
    };

    assert.equal(readerAPI.isEventAPIAvailable(), true);

    const cleanup = readerAPI.registerEventListener(
      readerAPI.READER_EVENT_TYPES.RENDER_TOOLBAR,
      handler,
    );

    assert.typeOf(cleanup, "function");
    assert.equal(trackedCleanups.length, 1);
    assert.equal(eventRegistrations.length, 1);
    assert.equal(eventRegistrations[0].type, "renderToolbar");
    assert.equal(eventRegistrations[0].pluginID, "cleanroom-template@example.com");
    assert.equal(readerAPI.getEventListenerCount(), 1);
    assert.deepEqual(readerAPI.getRegisteredEventListeners(), [{
      type: "renderToolbar",
      pluginID: "cleanroom-template@example.com",
    }]);

    eventRegistrations[0].handler({
      type: "renderToolbar",
      reader: {
        itemID: 77,
      },
    });
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].reader.itemID, 77);

    cleanup();

    assert.equal(eventUnregistrations.length, 1);
    assert.equal(eventUnregistrations[0].type, "renderToolbar");
    assert.equal(readerAPI.getEventListenerCount(), 0);
    assert.deepEqual(readerAPI.getRegisteredEventListeners(), []);
  });

  it("should register scene-oriented reader context menu helpers with the expected event types", () => {
    const appendedViewGroups = [];
    const appendedAnnotationGroups = [];

    const cleanupView = readerAPI.registerViewContextMenuItem((event) => ({
      label: `Inspect ${event.params?.targetID || "view"}`,
      onCommand() {},
    }));
    const cleanupAnnotation = readerAPI.registerAnnotationContextMenuItem({
      label: "Annotate",
      onCommand() {},
    });

    assert.typeOf(cleanupView, "function");
    assert.typeOf(cleanupAnnotation, "function");
    assert.equal(eventRegistrations.length, 2);
    assert.equal(eventRegistrations[0].type, "createViewContextMenu");
    assert.equal(eventRegistrations[1].type, "createAnnotationContextMenu");

    eventRegistrations[0].handler({
      type: "createViewContextMenu",
      params: {
        targetID: "page-1",
      },
      append(...args) {
        appendedViewGroups.push(args);
      },
    });
    eventRegistrations[1].handler({
      type: "createAnnotationContextMenu",
      append(...args) {
        appendedAnnotationGroups.push(args);
      },
    });

    assert.equal(appendedViewGroups.length, 1);
    assert.equal(appendedViewGroups[0][0].label, "Inspect page-1");
    assert.equal(appendedAnnotationGroups.length, 1);
    assert.equal(appendedAnnotationGroups[0][0].label, "Annotate");

    cleanupView();
    cleanupAnnotation();

    assert.equal(eventUnregistrations.length, 2);
    assert.equal(eventUnregistrations[0].type, "createViewContextMenu");
    assert.equal(eventUnregistrations[1].type, "createAnnotationContextMenu");
  });

  it("should unregister all event listeners and allow lifecycle cleanup to be idempotent", () => {
    const firstHandler = () => {};
    const secondHandler = () => {};

    readerAPI.registerEventListener(
      readerAPI.READER_EVENT_TYPES.RENDER_TOOLBAR,
      firstHandler,
    );
    readerAPI.registerEventListener(
      readerAPI.READER_EVENT_TYPES.CREATE_VIEW_CONTEXT_MENU,
      secondHandler,
    );

    assert.equal(readerAPI.getEventListenerCount(), 2);
    assert.equal(trackedCleanups.length, 2);
    assert.equal(readerAPI.unregisterAllEventListeners(), 2);
    assert.equal(eventUnregistrations.length, 2);
    assert.equal(readerAPI.getEventListenerCount(), 0);

    trackedCleanups[0]();
    trackedCleanups[1]();

    assert.equal(readerAPI.getEventListenerCount(), 0);
    assert.equal(eventUnregistrations.length, 2);
  });

  it("should expose structured reader event api report", () => {
    const handler = () => {};
    readerAPI.registerEventListener(
      readerAPI.READER_EVENT_TYPES.RENDER_TOOLBAR,
      handler,
    );

    const report = readerAPI.getEventAPIReport();
    assert.equal(report.available, true);
    assert.equal(report.registeredCount, 1);
    assert.deepEqual(report.registeredTypes, ["renderToolbar"]);
    assert.ok(Array.isArray(report.knownTypes));
    assert.equal(report.knownTypes.length, 8);
    assert.includes(report.knownTypes, "renderTextSelectionPopup");
    assert.includes(report.knownTypes, "renderSidebarAnnotationHeader");
    assert.equal(report.probeCompatibleTypes.length, 8);
    assert.includes(report.probeCompatibleTypes, "createAnnotationContextMenu");
    assert.deepEqual(report.probeDispatchModes, ["customEvent", "synthetic-fallback"]);
    assert.equal(report.syntheticFallbackAvailable, true);
  });

  it("should prefer a live reader toolbar button as the default toolbar element", () => {
    const hostToolbarButton = { id: "reader-find-button" };
    const genericToolbar = { id: "generic-toolbar" };
    activeReader = {
      itemID: 91,
      tabID: "reader-tab-91",
      _iframeWindow: {
        document: {
          querySelector(selector) {
            if (selector === "#toolbarContainer .toolbarButton") {
              return hostToolbarButton;
            }
            if (selector === "[role='toolbar']") {
              return genericToolbar;
            }
            return null;
          },
        },
      },
    };
    globalThis.Zotero.Reader._readers = [activeReader];

    assert.equal(readerAPI.findToolbarElement(91), hostToolbarButton);
  });

  it("should honor an explicit toolbar selector before host defaults", () => {
    const explicitButton = { id: "explicit-cleanroom-button" };
    const hostToolbarButton = { id: "reader-find-button" };
    activeReader = {
      itemID: 92,
      tabID: "reader-tab-92",
      _iframeWindow: {
        document: {
          querySelector(selector) {
            if (selector === "[data-cleanroom-reader-toolbar-action='open-context-pane']") {
              return explicitButton;
            }
            if (selector === "#toolbarContainer .toolbarButton") {
              return hostToolbarButton;
            }
            return null;
          },
        },
      },
    };
    globalThis.Zotero.Reader._readers = [activeReader];

    assert.equal(
      readerAPI.findToolbarElement(92, {
        selector: "[data-cleanroom-reader-toolbar-action='open-context-pane']",
      }),
      explicitButton,
    );
  });

  it("should resolve the legacy PDF.js sidebar toggle selector to the current Reader toolbar button", () => {
    const sidebarToggle = { id: "sidebarToggle" };
    activeReader = {
      itemID: 94,
      tabID: "reader-tab-94",
      _iframeWindow: {
        document: {
          querySelector(selector) {
            if (selector === "#sidebarToggle") {
              return sidebarToggle;
            }
            return null;
          },
        },
      },
    };
    globalThis.Zotero.Reader._readers = [activeReader];

    assert.equal(
      readerAPI.findToolbarElement(94, {
        selector: "#sidebarToggleButton",
      }),
      sidebarToggle,
    );
  });

  it("should resolve reader sidebar panels from PDF.js host containers", () => {
    const sidebarButton = { id: "viewThumbnail" };
    const sidebarPanel = { id: "thumbnailView" };
    activeReader = {
      itemID: 93,
      tabID: "reader-tab-93",
      _iframeWindow: {
        document: {
          querySelector(selector) {
            if (selector === "#viewThumbnail") {
              return sidebarButton;
            }
            if (selector === "#thumbnailView") {
              return sidebarPanel;
            }
            return null;
          },
        },
      },
    };
    globalThis.Zotero.Reader._readers = [activeReader];

    const sidebar = readerAPI.findSidebarViewElements(93, "thumbnails");
    assert.equal(sidebar.button, sidebarButton);
    assert.equal(sidebar.panel, sidebarPanel);
  });

  it("should dispatch synthetic reader events for probe fallback", () => {
    const invocations = [];
    const appendedGroups = [];

    activeReader = {
      itemID: 88,
      tabID: "reader-tab-88",
      _iframeWindow: {
        document: {
          createElement(tagName) {
            return { tagName };
          },
        },
      },
    };
    globalThis.Zotero.Reader._readers = [activeReader];

    readerAPI.registerEventListener(
      readerAPI.READER_EVENT_TYPES.CREATE_ANNOTATION_CONTEXT_MENU,
      (event) => {
        invocations.push({
          type: event.type,
          itemID: event.reader.itemID,
          targetID: event.targetID,
          hasDoc: Boolean(event.doc),
        });
        event.append({
          label: "Synthetic annotation menu",
          onCommand() {},
        });
      },
    );

    const result = readerAPI.dispatchSyntheticEvent(88, {
      type: readerAPI.READER_EVENT_TYPES.CREATE_ANNOTATION_CONTEXT_MENU,
      params: {
        targetID: "annotation-probe",
      },
      append(...args) {
        appendedGroups.push(args);
      },
    });

    assert.equal(result.type, "createAnnotationContextMenu");
    assert.equal(result.itemID, 88);
    assert.equal(result.dispatched, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.usedDoc, true);
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].targetID, "annotation-probe");
    assert.equal(invocations[0].hasDoc, true);
    assert.equal(appendedGroups.length, 1);
    assert.equal(appendedGroups[0][0].label, "Synthetic annotation menu");
    assert.equal(typeof appendedGroups[0][0].onCommand, "function");
  });

  it("should dispatch synthetic toolbar events for probe fallback", () => {
    activeReader = {
      itemID: 99,
      tabID: "reader-tab-99",
      _iframeWindow: {
        document: {
          createElement(tagName) {
            return { tagName };
          },
        },
      },
    };
    globalThis.Zotero.Reader._readers = [activeReader];

    const invocations = [];
    const appendedGroups = [];
    readerAPI.registerEventListener(
      readerAPI.READER_EVENT_TYPES.RENDER_TOOLBAR,
      (event) => {
        invocations.push({
          type: event.type,
          itemID: event.reader.itemID,
          hasDoc: Boolean(event.doc),
        });
        event.append({
          label: "Synthetic toolbar",
          onCommand() {},
        });
      },
    );

    const result = readerAPI.dispatchSyntheticEvent(99, {
      type: readerAPI.READER_EVENT_TYPES.RENDER_TOOLBAR,
      append(...args) {
        appendedGroups.push(args);
      },
    });

    assert.equal(result.type, "renderToolbar");
    assert.equal(result.dispatched, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.usedDoc, true);
    assert.equal(result.supported, true);
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].type, "renderToolbar");
    assert.equal(invocations[0].itemID, 99);
    assert.equal(invocations[0].hasDoc, true);
    assert.equal(appendedGroups.length, 1);
    assert.equal(appendedGroups[0][0].label, "Synthetic toolbar");
  });

  it("should refuse synthetic fallback for unsupported event types", () => {
    activeReader = {
      itemID: 100,
      tabID: "reader-tab-100",
    };
    globalThis.Zotero.Reader._readers = [activeReader];

    const result = readerAPI.dispatchSyntheticEvent(100, {
      type: "unknownReaderEvent",
    });

    assert.equal(result.type, "unknownReaderEvent");
    assert.equal(result.dispatched, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.usedDoc, false);
    assert.equal(result.supported, false);
  });

  it("should not block forever on unresolved reader init promises", async () => {
    attachmentMap.set(42, {
      attachmentReaderType: "pdf",
      isAttachment() {
        return true;
      },
      getAnnotations() {
        return [];
      },
    });
    activeReader = {
      itemID: 42,
      tabID: "reader-tab-42",
      annotationItemIDs: [],
      _initPromise: new Promise(() => {}),
      _iframeWindow: {
        document: {
          readyState: "complete",
        },
      },
    };
    globalThis.Zotero.Reader._readers = [activeReader];

    const startedAt = Date.now();
    const readyReader = await readerAPI.waitForReaderReady(42, {
      timeoutMs: 30,
      intervalMs: 1,
    });

    assert.equal(readyReader, activeReader);
    assert.ok(Date.now() - startedAt < 200, "waitForReaderReady should time out stalled init promises quickly");
  });

  it("should continue polling when primary view initialization promise stalls", async () => {
    attachmentMap.set(42, {
      attachmentReaderType: "pdf",
      isAttachment() {
        return true;
      },
      getAnnotations() {
        return [];
      },
    });
    activeReader = {
      itemID: 42,
      tabID: "reader-tab-42",
      annotationItemIDs: [],
      _internalReader: {
        _primaryView: {
          initializedPromise: new Promise(() => {}),
        },
      },
    };
    globalThis.Zotero.Reader._readers = [activeReader];

    setTimeout(() => {
      activeReader._iframeWindow = {
        document: {
          readyState: "complete",
        },
      };
    }, 5);

    const readyReader = await readerAPI.waitForReaderReady(42, {
      timeoutMs: 40,
      intervalMs: 1,
    });

    assert.equal(readyReader, activeReader);
    assert.ok(activeReader._iframeWindow?.document, "reader iframe should become observable after bounded primary view wait");
  });
});
