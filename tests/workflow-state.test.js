import { describe, it, assert } from "./test-framework.js";
import {
  RESEARCH_WORKFLOW_PREF_KEYS,
  applyWorkflowStateBatch,
  applyWorkflowStateToItem,
  buildWorkflowContext,
  clearWorkflowStateFromItem,
  getWorkflowState,
} from "../src/features/workflow-state.js";

function createPrefs(values = {}) {
  return {
    get(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
  };
}

function createItem() {
  return {
    tags: [
      { tag: "topic" },
      { tag: "#old" },
      { tag: "/reading" },
      { tag: "***" },
    ],
    extra: "Remark: old note\nOther: keep\nRead Status: unread",
    saved: 0,
    getTags() {
      return this.tags;
    },
    addTag(tag) {
      this.tags.push({ tag });
    },
    removeTag(tag) {
      this.tags = this.tags.filter((entry) => entry.tag !== tag);
    },
    getField(field) {
      return this[field] || "";
    },
    setField(field, value) {
      this[field] = value;
    },
    async saveTx() {
      this.saved += 1;
    },
  };
}

describe("Workflow State", () => {
  it("should parse workflow state from tags and Extra lines", () => {
    const item = createItem();
    const state = getWorkflowState(item, {
      context: buildWorkflowContext(createPrefs()),
    });

    assert.equal(state.status, "reading");
    assert.deepEqual(state.textTags, ["old"]);
    assert.equal(state.rating, 3);
    assert.equal(state.remark, "old note");
    assert.equal(state.readStatus, "unread");
    assert.deepEqual(state.regularTags, ["topic"]);
  });

  it("should merge workflow updates without losing unrelated tags or Extra lines", async () => {
    const item = createItem();

    const result = await applyWorkflowStateToItem(item, {
      status: "done",
      rating: 5,
      textTags: ["methods", "#ai"],
      remark: "strong baseline",
      readStatus: "read",
      progress: "42",
    }, {
      prefs: createPrefs(),
    });

    const tags = item.tags.map((entry) => entry.tag);
    assert.equal(result.ok, true);
    assert.equal(item.saved, 1);
    assert.deepEqual(tags, ["topic", "/done", "#methods", "#ai", "*****"]);
    assert.equal(item.extra.includes("Other: keep"), true);
    assert.equal(item.extra.includes("Remark: strong baseline"), true);
    assert.equal(item.extra.includes("Read Status: read"), true);
    assert.equal(item.extra.includes("Reading Progress: 42%"), true);
  });

  it("should honor custom prefixes and clear workflow-owned fields", async () => {
    const item = createItem();
    const prefs = createPrefs({
      [RESEARCH_WORKFLOW_PREF_KEYS.statusTagPrefix]: "@",
      [RESEARCH_WORKFLOW_PREF_KEYS.textTagPrefix]: "~",
    });

    await applyWorkflowStateToItem(item, {
      status: "@todo",
      textTags: ["~focus"],
      rating: 1,
    }, { prefs });

    assert.deepEqual(item.tags.map((entry) => entry.tag), [
      "topic",
      "#old",
      "/reading",
      "@todo",
      "~focus",
      "*",
    ]);

    await clearWorkflowStateFromItem(item, { prefs });
    assert.deepEqual(item.tags.map((entry) => entry.tag), [
      "topic",
      "#old",
      "/reading",
    ]);
    assert.equal(item.extra, "Other: keep");
  });

  it("should apply batch changes to all selected items", async () => {
    const items = [createItem(), createItem()];
    const result = await applyWorkflowStateBatch(items, {
      status: "reviewed",
    }, {
      prefs: createPrefs(),
    });

    assert.equal(result.itemCount, 2);
    assert.equal(result.changedCount, 2);
    assert.equal(items.every((item) => item.tags.some((entry) => entry.tag === "/reviewed")), true);
  });
});
