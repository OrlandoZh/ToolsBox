import { describe, it, assert } from "./test-framework.js";
import { createReaderSelectionActions } from "../src/features/reader-selection-actions.js";

describe("Reader Selection Actions", () => {
  it("should register actions, evaluate enabled state, and execute with selection context", async () => {
    const readerSelectionActions = createReaderSelectionActions({
      logger: {
        debug() {},
        error() {},
      },
      reader: {
        getSelectionSnapshot() {
          return {
            hasSelection: true,
            sourceKind: "iframe-selection",
            text: "Selected reader text",
            textLength: 20,
            tabID: "reader-tab-1",
            itemID: 11,
            readerType: "pdf",
            selectedAnnotationIDs: [101],
            annotationCount: 3,
          };
        },
      },
    });

    const actionId = readerSelectionActions.registerAction({
      id: "reader-selection",
      label: "Reader Selection",
      description: "Inspect reader selection",
      aliases: ["selection"],
      keywords: ["reader", "snapshot"],
      condition(context = {}) {
        return context.selection?.hasSelection === true;
      },
      handler(context = {}) {
        return {
          itemID: context.selection?.itemID || null,
          readerType: context.selection?.readerType || null,
          textLength: context.selection?.textLength || 0,
        };
      },
    });

    assert.equal(actionId, "reader-selection");
    assert.equal(readerSelectionActions.getActionCount(), 1);
    assert.equal(readerSelectionActions.hasAction("reader-selection"), true);
    assert.deepEqual(
      readerSelectionActions.getActionSnapshot("reader-selection"),
      {
        id: "reader-selection",
        label: "Reader Selection",
        description: "Inspect reader selection",
        aliases: ["selection"],
        keywords: ["reader", "snapshot"],
        enabled: true,
        hasSelection: true,
      },
    );

    const execution = await readerSelectionActions.executeAction("reader-selection");
    assert.deepEqual(execution, {
      ok: true,
      actionId: "reader-selection",
      selection: {
        hasSelection: true,
        sourceKind: "iframe-selection",
        text: "Selected reader text",
        textLength: 20,
        tabID: "reader-tab-1",
        itemID: 11,
        readerType: "pdf",
        selectedAnnotationIDs: [101],
        annotationCount: 3,
      },
      result: {
        itemID: 11,
        readerType: "pdf",
        textLength: 20,
      },
      errorMessage: null,
      skipped: false,
    });
  });

  it("should skip disabled actions and clean up via lifecycle", async () => {
    const trackedCleanups = [];
    let hasSelection = false;
    const readerSelectionActions = createReaderSelectionActions({
      logger: {
        debug() {},
        error() {},
      },
      lifecycle: {
        trackCleanup(fn) {
          trackedCleanups.push(fn);
        },
      },
      reader: {
        getSelectionSnapshot() {
          return {
            hasSelection,
            sourceKind: hasSelection ? "iframe-selection" : "none",
            text: hasSelection ? "Selected reader text" : "",
            textLength: hasSelection ? 20 : 0,
            tabID: "reader-tab-2",
            itemID: 22,
            readerType: "pdf",
            selectedAnnotationIDs: [],
            annotationCount: 0,
          };
        },
      },
    });

    readerSelectionActions.registerAction({
      id: "conditional-selection",
      label: "Conditional Selection",
      condition(context = {}) {
        return context.selection?.hasSelection === true;
      },
      async handler() {
        return {
          ok: true,
        };
      },
    });

    const skippedExecution = await readerSelectionActions.executeAction("conditional-selection");
    assert.equal(skippedExecution.ok, false);
    assert.equal(skippedExecution.skipped, true);
    assert.equal(skippedExecution.errorMessage, null);
    assert.equal(trackedCleanups.length, 1);

    hasSelection = true;
    const enabledSnapshot = readerSelectionActions.getActionSnapshot("conditional-selection");
    assert.equal(enabledSnapshot.enabled, true);

    trackedCleanups[0]();
    assert.equal(readerSelectionActions.getActionCount(), 0);
  });
});
