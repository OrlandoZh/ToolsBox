/**
 * Tests for Workflow State feature
 * Tests defaults, context building, tag parsing, state extraction, and state mutations.
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  RESEARCH_WORKFLOW_DEFAULTS,
  RESEARCH_WORKFLOW_PREF_KEYS,
  buildWorkflowContext,
  extractItemTags,
  getWorkflowState,
  isWorkflowRatingTag,
  applyWorkflowStateToItem,
  clearWorkflowStateFromItem,
  applyWorkflowStateBatch,
  clearWorkflowStateBatch,
  readBooleanWorkflowPref,
  readStringWorkflowPref,
} from "../../src/features/workflow-state.js";

function createMockLogger() {
  const logs = [];
  return {
    info(msg, details) { logs.push({ level: "info", msg, details }); },
    warn(msg, details) { logs.push({ level: "warn", msg, details }); },
    error(msg, details) { logs.push({ level: "error", msg, details }); },
    getLogs() { return logs; },
  };
}

function createMockZotero(overrides = {}) {
  return {
    Items: {
      get(id) {
        return { id, getField: () => "", isAttachment: () => false, isNote: () => false };
      },
    },
    Tags: {
      getAll() { return []; },
    },
    Prefs: {
      get(key) { return undefined; },
      set(key, value) {},
    },
    ...overrides,
  };
}

function createMockPrefs(overrides = {}) {
  const store = new Map(Object.entries(overrides));
  return {
    get(key) { return store.get(key); },
    set(key, value) { store.set(key, value); },
  };
}

function createMockItem(overrides = {}) {
  return {
    id: 1,
    tags: [],
    extra: "",
    getTags() { return this.tags; },
    addTag(tag) {
      if (!this.tags.find((t) => (typeof t === "string" ? t : t.tag) === tag)) {
        this.tags.push({ tag });
      }
    },
    removeTag(tag) {
      this.tags = this.tags.filter((t) => (typeof t === "string" ? t : t.tag) !== tag);
    },
    setTags(tags) { this.tags = tags.map((t) => (typeof t === "string" ? { tag: t } : t)); },
    setField(field, value) { this[field] = value; },
    getField(field) { return this[field] || ""; },
    saveTx() { return Promise.resolve(); },
    save() { return Promise.resolve(); },
    ...overrides,
  };
}

describe("WorkflowState", () => {
  it("RESEARCH_WORKFLOW_DEFAULTS has expected keys", () => {
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_DEFAULTS, "customFields"), "should have customFields");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_DEFAULTS, "statusTagPrefix"), "should have statusTagPrefix");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_DEFAULTS, "textTagPrefix"), "should have textTagPrefix");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_DEFAULTS, "ratingSelectedMark"), "should have ratingSelectedMark");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_DEFAULTS, "remarkExtraLabel"), "should have remarkExtraLabel");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_DEFAULTS, "readStatusExtraLabel"), "should have readStatusExtraLabel");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_DEFAULTS, "progressExtraLabel"), "should have progressExtraLabel");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_DEFAULTS, "availableStatuses"), "should have availableStatuses");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_DEFAULTS, "availableReadStatuses"), "should have availableReadStatuses");
  });

  it("RESEARCH_WORKFLOW_DEFAULTS values are correct", () => {
    assert.equal(RESEARCH_WORKFLOW_DEFAULTS.statusTagPrefix, "/", "statusTagPrefix should be '/'");
    assert.equal(RESEARCH_WORKFLOW_DEFAULTS.textTagPrefix, "#", "textTagPrefix should be '#'");
    assert.equal(RESEARCH_WORKFLOW_DEFAULTS.ratingSelectedMark, "*", "ratingSelectedMark should be '*'");
    assert.equal(RESEARCH_WORKFLOW_DEFAULTS.remarkExtraLabel, "Remark", "remarkExtraLabel should be 'Remark'");
  });

  it("RESEARCH_WORKFLOW_PREF_KEYS has expected keys", () => {
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_PREF_KEYS, "enabled"), "should have enabled");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_PREF_KEYS, "itemPaneEnabled"), "should have itemPaneEnabled");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_PREF_KEYS, "menuEnabled"), "should have menuEnabled");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_PREF_KEYS, "readerEnabled"), "should have readerEnabled");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_PREF_KEYS, "statusTagPrefix"), "should have statusTagPrefix");
    assert.ok(Object.hasOwn(RESEARCH_WORKFLOW_PREF_KEYS, "textTagPrefix"), "should have textTagPrefix");
  });

  it("buildWorkflowContext returns frozen object with defaults", () => {
    const context = buildWorkflowContext(createMockPrefs());

    assert.ok(Object.isFrozen(context), "context should be frozen");
    assert.equal(context.statusTagPrefix, "/", "default status prefix");
    assert.equal(context.textTagPrefix, "#", "default text prefix");
    assert.equal(context.ratingSelectedMark, "*", "default rating mark");
    assert.equal(context.remarkExtraLabel, "Remark", "default remark label");
    assert.ok(Array.isArray(context.availableStatuses), "availableStatuses should be array");
    assert.ok(Array.isArray(context.availableReadStatuses), "availableReadStatuses should be array");
  });

  it("buildWorkflowContext respects custom prefs", () => {
    const context = buildWorkflowContext(createMockPrefs({
      [RESEARCH_WORKFLOW_PREF_KEYS.statusTagPrefix]: "@",
      [RESEARCH_WORKFLOW_PREF_KEYS.textTagPrefix]: "!",
      [RESEARCH_WORKFLOW_PREF_KEYS.ratingSelectedMark]: "★",
    }));

    assert.equal(context.statusTagPrefix, "@", "custom status prefix");
    assert.equal(context.textTagPrefix, "!", "custom text prefix");
    assert.equal(context.ratingSelectedMark, "★", "custom rating mark");
  });

  it("extractItemTags extracts tags from getTags method", () => {
    const item = createMockItem({ tags: [{ tag: "foo" }, { tag: "bar" }] });
    const tags = extractItemTags(item);

    assert.ok(Array.isArray(tags), "should return array");
    assert.equal(tags.length, 2, "should have 2 tags");
    assert.ok(tags.includes("foo"), "should include 'foo'");
    assert.ok(tags.includes("bar"), "should include 'bar'");
  });

  it("extractItemTags extracts tags from tags array", () => {
    const item = { tags: ["alpha", "beta"] };
    const tags = extractItemTags(item);

    assert.equal(tags.length, 2, "should have 2 tags");
    assert.ok(tags.includes("alpha"), "should include 'alpha'");
  });

  it("extractItemTags returns empty for null item", () => {
    const tags = extractItemTags(null);
    assert.ok(Array.isArray(tags), "should return array");
    assert.equal(tags.length, 0, "should be empty");
  });

  it("isWorkflowRatingTag recognizes default star ratings", () => {
    assert.ok(isWorkflowRatingTag("*"), "single star is rating");
    assert.ok(isWorkflowRatingTag("***"), "triple star is rating");
    assert.ok(isWorkflowRatingTag("⭐"), "emoji star is rating");
    assert.ok(!isWorkflowRatingTag("foo"), "plain text is not rating");
    assert.ok(!isWorkflowRatingTag(""), "empty is not rating");
  });

  it("isWorkflowRatingTag respects custom context", () => {
    assert.ok(isWorkflowRatingTag("★★", { ratingSelectedMark: "★" }), "custom mark rating");
    assert.ok(!isWorkflowRatingTag("&&", { ratingSelectedMark: "★" }), "wrong mark not rating");
  });

  it("getWorkflowState with empty item returns default state", () => {
    const item = createMockItem();
    const state = getWorkflowState(item);

    assert.ok(Object.isFrozen(state), "state should be frozen");
    assert.equal(state.status, "", "empty status");
    assert.equal(state.rating, 0, "zero rating");
    assert.equal(state.remark, "", "empty remark");
    assert.equal(state.readStatus, "", "empty readStatus");
    assert.equal(state.progress, "", "empty progress");
    assert.ok(Array.isArray(state.tags), "tags should be array");
    assert.ok(Array.isArray(state.textTags), "textTags should be array");
  });

  it("getWorkflowState extracts status tag with prefix", () => {
    const item = createMockItem({ tags: [{ tag: "/todo" }] });
    const state = getWorkflowState(item);

    assert.equal(state.status, "todo", "should extract status from tag");
    assert.ok(state.statuses.includes("todo"), "statuses should include todo");
  });

  it("getWorkflowState extracts text tag with prefix", () => {
    const item = createMockItem({ tags: [{ tag: "#focus" }, { tag: "#important" }] });
    const state = getWorkflowState(item);

    assert.equal(state.textTags.length, 2, "should have 2 text tags");
    assert.ok(state.textTags.includes("focus"), "should include 'focus'");
    assert.ok(state.textTags.includes("important"), "should include 'important'");
  });

  it("getWorkflowState extracts rating from tags", () => {
    const item = createMockItem({ tags: [{ tag: "***" }] });
    const state = getWorkflowState(item);

    assert.equal(state.rating, 3, "should parse rating of 3");
    assert.equal(state.ratingTag, "***", "should capture ratingTag");
  });

  it("getWorkflowState extracts remark from extra field", () => {
    const item = createMockItem({ extra: "Remark: needs review\nRead Status: unread" });
    const state = getWorkflowState(item);

    assert.equal(state.remark, "needs review", "should extract remark");
    assert.equal(state.readStatus, "unread", "should extract readStatus");
  });

  it("getWorkflowState filters regular tags from workflow tags", () => {
    const item = createMockItem({ tags: [{ tag: "normal" }, { tag: "/todo" }, { tag: "#focus" }, { tag: "***" }] });
    const state = getWorkflowState(item);

    assert.equal(state.regularTags.length, 1, "should have 1 regular tag");
    assert.ok(state.regularTags.includes("normal"), "regular tag should be 'normal'");
  });

  it("applyWorkflowStateToItem returns error for invalid item", async () => {
    const result = await applyWorkflowStateToItem(null, { status: "done" });

    assert.equal(result.ok, false, "should not be ok");
    assert.equal(result.reason, "invalid-item", "should report invalid item");
    assert.equal(result.changed, false, "should not have changed");
  });

  it("applyWorkflowStateToItem applies status tag", async () => {
    const item = createMockItem();
    const result = await applyWorkflowStateToItem(item, { status: "done" });

    assert.equal(result.ok, true, "should be ok");
    assert.equal(result.changed, true, "should have changed");
    assert.equal(result.addedTags.length, 1, "should add 1 tag");
    assert.equal(result.addedTags[0], "/done", "should add status tag");
    assert.equal(result.state.status, "done", "state should reflect status");
  });

  it("applyWorkflowStateToItem applies rating tag", async () => {
    const item = createMockItem();
    const result = await applyWorkflowStateToItem(item, { rating: 4 });

    assert.equal(result.ok, true, "should be ok");
    assert.equal(result.changed, true, "should have changed");
    assert.equal(result.addedTags.length, 1, "should add 1 tag");
    assert.equal(result.addedTags[0], "****", "should add rating tag");
    assert.equal(result.state.rating, 4, "state should reflect rating");
  });

  it("applyWorkflowStateToItem applies text tags", async () => {
    const item = createMockItem();
    const result = await applyWorkflowStateToItem(item, { textTags: ["urgent", "review"] });

    assert.equal(result.ok, true, "should be ok");
    assert.equal(result.addedTags.length, 2, "should add 2 tags");
    assert.ok(result.addedTags.includes("#urgent"), "should add urgent tag");
    assert.ok(result.state.textTags.includes("urgent"), "state should include urgent");
  });

  it("applyWorkflowStateToItem updates extra fields", async () => {
    const item = createMockItem();
    const result = await applyWorkflowStateToItem(item, { remark: "test remark", readStatus: "reading" });

    assert.equal(result.ok, true, "should be ok");
    assert.equal(result.extraChanged, true, "extra should have changed");
    assert.equal(result.extraWritten, true, "extra should be written");
    assert.equal(result.state.remark, "test remark", "state should reflect remark");
    assert.equal(result.state.readStatus, "reading", "state should reflect readStatus");
  });

  it("clearWorkflowStateFromItem removes workflow tags and clears extra", async () => {
    const item = createMockItem({
      tags: [{ tag: "/todo" }, { tag: "#focus" }, { tag: "***" }],
      extra: "Remark: old\nRead Status: unread",
    });
    const result = await clearWorkflowStateFromItem(item);

    assert.equal(result.ok, true, "should be ok");
    assert.equal(result.changed, true, "should have changed");
    assert.equal(result.removedTags.length, 3, "should remove 3 tags");
    assert.equal(result.state.status, "", "status should be cleared");
    assert.equal(result.state.rating, 0, "rating should be cleared");
    assert.equal(result.state.textTags.length, 0, "textTags should be cleared");
  });

  it("clearWorkflowStateFromItem handles invalid item", async () => {
    const result = await clearWorkflowStateFromItem(null);
    assert.equal(result.ok, false, "should not be ok");
    assert.equal(result.reason, "invalid-item", "should report invalid item");
  });

  it("applyWorkflowStateBatch processes multiple items", async () => {
    const items = [createMockItem({ id: 1 }), createMockItem({ id: 2 })];
    const result = await applyWorkflowStateBatch(items, { status: "done" });

    assert.equal(result.ok, true, "should be ok");
    assert.equal(result.itemCount, 2, "should process 2 items");
    assert.equal(result.changedCount, 2, "should change 2 items");
    assert.equal(result.results.length, 2, "should have 2 results");
    assert.equal(result.results[0].state.status, "done", "first item should have status");
  });

  it("clearWorkflowStateBatch processes multiple items", async () => {
    const items = [
      createMockItem({ id: 1, tags: [{ tag: "/todo" }] }),
      createMockItem({ id: 2, tags: [{ tag: "#focus" }] }),
    ];
    const result = await clearWorkflowStateBatch(items);

    assert.equal(result.ok, true, "should be ok");
    assert.equal(result.itemCount, 2, "should process 2 items");
    assert.equal(result.results.length, 2, "should have 2 results");
  });

  it("readBooleanWorkflowPref returns boolean value", () => {
    assert.equal(readBooleanWorkflowPref(createMockPrefs({ key: true }), "key", false), true, "should read true");
    assert.equal(readBooleanWorkflowPref(createMockPrefs({ key: false }), "key", true), false, "should read false");
    assert.equal(readBooleanWorkflowPref(createMockPrefs({}), "missing", true), true, "should fallback to true");
  });

  it("readStringWorkflowPref returns string value", () => {
    assert.equal(readStringWorkflowPref(createMockPrefs({ key: "hello" }), "key", ""), "hello", "should read string");
    assert.equal(readStringWorkflowPref(createMockPrefs({}), "missing", "fallback"), "fallback", "should fallback");
  });

  it("getWorkflowState parses progress from extra", () => {
    const item = createMockItem({ extra: "Reading Progress: 75%" });
    const state = getWorkflowState(item);

    assert.equal(state.progress, "75%", "should extract progress");
  });

  it("getWorkflowState handles multiple status tags", () => {
    const item = createMockItem({ tags: [{ tag: "/todo" }, { tag: "/urgent" }] });
    const state = getWorkflowState(item);

    assert.equal(state.statuses.length, 2, "should have 2 status tags");
    assert.ok(state.statuses.includes("todo"), "should include todo");
    assert.ok(state.statuses.includes("urgent"), "should include urgent");
  });

  it("applyWorkflowStateToItem replaces existing status tag", async () => {
    const item = createMockItem({ tags: [{ tag: "/todo" }] });
    const result = await applyWorkflowStateToItem(item, { status: "done" });

    assert.equal(result.removedTags.length, 1, "should remove old status");
    assert.equal(result.addedTags.length, 1, "should add new status");
    assert.equal(result.state.status, "done", "should have new status");
  });
});

await runTestsIfMain(import.meta.url);
