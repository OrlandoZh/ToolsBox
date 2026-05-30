/**
 * Tests for Reader Selection Actions feature
 * Action registration, execution, and lifecycle management
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createReaderSelectionActions } from "../../src/features/reader-selection-actions.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(msg, details) { logs.push({ level: "debug", msg, details }); },
    error(msg, details) { logs.push({ level: "error", msg, details }); },
    getLogs() { return logs; },
  };
}

function createMockReader(selection = null) {
  return {
    getSelectionSnapshot(source, options) {
      return selection || { hasSelection: false, text: "" };
    },
  };
}

describe("ReaderSelectionActions", () => {
  it("should return object with all expected methods", () => {
    const actions = createReaderSelectionActions({});
    assert.typeOf(actions.registerAction, "function", "should have registerAction");
    assert.typeOf(actions.unregisterAction, "function", "should have unregisterAction");
    assert.typeOf(actions.unregisterAll, "function", "should have unregisterAll");
    assert.typeOf(actions.hasAction, "function", "should have hasAction");
    assert.typeOf(actions.getActionCount, "function", "should have getActionCount");
    assert.typeOf(actions.getActionSnapshot, "function", "should have getActionSnapshot");
    assert.typeOf(actions.executeAction, "function", "should have executeAction");
  });

  it("registerAction should require label and handler", () => {
    const logger = createMockLogger();
    const actions = createReaderSelectionActions({ logger });

    const noLabel = actions.registerAction({ id: "test", handler: () => {} });
    assert.equal(noLabel, null, "should reject without label");

    const noHandler = actions.registerAction({ id: "test", label: "Test" });
    assert.equal(noHandler, null, "should reject without handler");

    const valid = actions.registerAction({ id: "test", label: "Test", handler: () => {} });
    assert.equal(valid, "test", "should accept valid action");
    assert.equal(actions.getActionCount(), 1, "should track registered action");
  });

  it("registerAction should auto-generate id when not provided", () => {
    const actions = createReaderSelectionActions({});
    const id = actions.registerAction({ label: "Auto", handler: () => {} });
    assert.ok(id, "should generate id");
    assert.match(id, /reader-selection-action-\d+/, "should follow auto-id pattern");
  });

  it("hasAction should track registered actions", () => {
    const actions = createReaderSelectionActions({});
    actions.registerAction({ id: "a1", label: "A1", handler: () => {} });
    assert.equal(actions.hasAction("a1"), true, "should have a1");
    assert.equal(actions.hasAction("unknown"), false, "should not have unknown");
  });

  it("unregisterAction should remove action", () => {
    const actions = createReaderSelectionActions({});
    actions.registerAction({ id: "removable", label: "Removable", handler: () => {} });
    assert.equal(actions.hasAction("removable"), true, "should have action");
    assert.equal(actions.unregisterAction("removable"), true, "should return true");
    assert.equal(actions.hasAction("removable"), false, "should not have action after unregister");
    assert.equal(actions.getActionCount(), 0, "count should be 0");
  });

  it("unregisterAll should clear all actions", () => {
    const actions = createReaderSelectionActions({});
    actions.registerAction({ id: "a1", label: "A1", handler: () => {} });
    actions.registerAction({ id: "a2", label: "A2", handler: () => {} });
    assert.equal(actions.getActionCount(), 2, "should have 2 actions");
    actions.unregisterAll();
    assert.equal(actions.getActionCount(), 0, "should have 0 after unregisterAll");
  });

  it("getActionSnapshot should return action metadata", () => {
    const actions = createReaderSelectionActions({});
    actions.registerAction({
      id: "snap",
      label: "Snapshot",
      description: "Desc",
      aliases: ["alias1"],
      keywords: ["key1"],
      handler: () => {},
    });
    const snapshot = actions.getActionSnapshot("snap");
    assert.equal(snapshot.id, "snap", "snapshot should have id");
    assert.equal(snapshot.label, "Snapshot", "snapshot should have label");
    assert.equal(snapshot.description, "Desc", "snapshot should have description");
    assert.deepEqual(snapshot.aliases, ["alias1"], "snapshot should have aliases");
    assert.deepEqual(snapshot.keywords, ["key1"], "snapshot should have keywords");
    assert.equal(snapshot.enabled, true, "snapshot should be enabled");
  });

  it("getActionSnapshot should return sorted array when no id given", () => {
    const actions = createReaderSelectionActions({});
    actions.registerAction({ id: "b", label: "B", handler: () => {} });
    actions.registerAction({ id: "a", label: "A", handler: () => {} });
    const snapshots = actions.getActionSnapshot();
    assert.equal(snapshots.length, 2, "should return all actions");
    assert.equal(snapshots[0].label, "A", "should be sorted by label");
    assert.equal(snapshots[1].label, "B", "should be sorted by label");
  });

  it("executeAction should run handler and return result", async () => {
    const actions = createReaderSelectionActions({});
    actions.registerAction({
      id: "exec",
      label: "Execute",
      handler: (ctx) => ({ text: ctx.selection?.text }),
    });
    const result = await actions.executeAction("exec");
    assert.equal(result.ok, true, "should be ok");
    assert.equal(result.actionId, "exec", "should have actionId");
    assert.equal(result.skipped, false, "should not be skipped");
  });

  it("executeAction should skip non-existent action", async () => {
    const actions = createReaderSelectionActions({});
    const result = await actions.executeAction("missing");
    assert.equal(result.ok, false, "should not be ok");
    assert.equal(result.skipped, true, "should be skipped");
    assert.equal(result.errorMessage, "action is not registered", "should indicate not registered");
  });

  it("executeAction should skip when condition returns false", async () => {
    const actions = createReaderSelectionActions({});
    actions.registerAction({
      id: "conditional",
      label: "Conditional",
      condition: () => false,
      handler: () => "result",
    });
    const result = await actions.executeAction("conditional");
    assert.equal(result.ok, false, "should not be ok");
    assert.equal(result.skipped, true, "should be skipped");
  });

  it("executeAction should catch handler errors", async () => {
    const logger = createMockLogger();
    const actions = createReaderSelectionActions({ logger });
    actions.registerAction({
      id: "failing",
      label: "Failing",
      handler: () => { throw new Error("fail"); },
    });
    const result = await actions.executeAction("failing");
    assert.equal(result.ok, false, "should not be ok");
    assert.equal(result.errorMessage, "fail", "should capture error message");
    assert.equal(result.skipped, false, "should not be skipped");
  });

  it("should use reader.getSelectionSnapshot when available", () => {
    const reader = createMockReader({ hasSelection: true, text: "hello" });
    const actions = createReaderSelectionActions({ reader });
    actions.registerAction({
      id: "reader-action",
      label: "Reader Action",
      handler: () => {},
    });
    const snapshot = actions.getActionSnapshot("reader-action", { source: "test" });
    assert.equal(snapshot.hasSelection, true, "should reflect selection");
  });
});

await runTestsIfMain(import.meta.url);
