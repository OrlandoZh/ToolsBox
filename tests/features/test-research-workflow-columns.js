/**
 * Tests for Research Workflow Columns feature
 * Column factory, data providers, and item tree registration
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  createResearchWorkflowItemTreeColumns,
  registerResearchWorkflowItemTreeColumns,
  RESEARCH_WORKFLOW_PREF_KEYS,
  extractItemTags,
} from "../../src/features/research-workflow-columns.js";

function createMockPrefs(values = {}) {
  return {
    get(key) {
      return values[key];
    },
  };
}

function createMockItem(overrides = {}) {
  return {
    id: 1,
    title: "Test Item",
    tags: [],
    getTags() { return this.tags; },
    getField(field) { return this[field] || ""; },
    ...overrides,
  };
}

function createMockItemTree() {
  const columns = new Map();
  return {
    registerColumn(column) {
      columns.set(column.dataKey, column);
      return column.dataKey;
    },
    hasColumn(key) {
      return columns.has(key);
    },
    getColumns() { return columns; },
  };
}

describe("ResearchWorkflowColumns", () => {
  it("should export RESEARCH_WORKFLOW_PREF_KEYS", () => {
    assert.ok(RESEARCH_WORKFLOW_PREF_KEYS, "should export pref keys");
    assert.equal(RESEARCH_WORKFLOW_PREF_KEYS.tagsEnabled, "researchWorkflow.itemTree.tags.enabled");
    assert.equal(RESEARCH_WORKFLOW_PREF_KEYS.statusEnabled, "researchWorkflow.itemTree.status.enabled");
    assert.equal(RESEARCH_WORKFLOW_PREF_KEYS.ratingEnabled, "researchWorkflow.itemTree.rating.enabled");
  });

  it("createResearchWorkflowItemTreeColumns should return array of columns", () => {
    const columns = createResearchWorkflowItemTreeColumns();
    assert.ok(Array.isArray(columns), "should return array");
    assert.ok(columns.length > 0, "should have columns");
  });

  it("createResearchWorkflowItemTreeColumns should filter by prefs", () => {
    const columns = createResearchWorkflowItemTreeColumns({
      prefs: createMockPrefs({
        [RESEARCH_WORKFLOW_PREF_KEYS.tagsEnabled]: true,
        [RESEARCH_WORKFLOW_PREF_KEYS.statusEnabled]: false,
        [RESEARCH_WORKFLOW_PREF_KEYS.ratingEnabled]: true,
      }),
    });
    const keys = columns.map((c) => c.dataKey);
    assert.ok(keys.includes("cleanroom-research-tags"), "should include tags when enabled");
    assert.ok(!keys.includes("cleanroom-research-status"), "should exclude status when disabled");
    assert.ok(keys.includes("cleanroom-research-rating"), "should include rating when enabled");
  });

  it("column dataProvider should return empty string for null item", () => {
    const columns = createResearchWorkflowItemTreeColumns();
    const tagColumn = columns.find((c) => c.dataKey === "cleanroom-research-tags");
    assert.ok(tagColumn, "should have tags column");
    assert.equal(tagColumn.dataProvider(null, "cleanroom-research-tags"), "", "should handle null item");
  });

  it("column dataProvider should return tags for item with tags", () => {
    const columns = createResearchWorkflowItemTreeColumns();
    const tagColumn = columns.find((c) => c.dataKey === "cleanroom-research-tags");
    const item = createMockItem({
      tags: [{ tag: "important" }, { tag: "reading" }],
    });
    const result = tagColumn.dataProvider(item, "cleanroom-research-tags");
    assert.equal(result, "important, reading", "should format tags");
  });

  it("status column should derive from status tag prefix", () => {
    const columns = createResearchWorkflowItemTreeColumns();
    const statusColumn = columns.find((c) => c.dataKey === "cleanroom-research-status");
    assert.ok(statusColumn, "should have status column");
    const item = createMockItem({
      tags: [{ tag: "/reading" }],
    });
    const result = statusColumn.dataProvider(item, "cleanroom-research-status");
    assert.equal(result, "reading", "should extract status from prefixed tag");
  });

  it("rating column should format rating with marks", () => {
    const columns = createResearchWorkflowItemTreeColumns();
    const ratingColumn = columns.find((c) => c.dataKey === "cleanroom-research-rating");
    assert.ok(ratingColumn, "should have rating column");
    const item = createMockItem({
      tags: [{ tag: "***" }],
    });
    const result = ratingColumn.dataProvider(item, "cleanroom-research-rating");
    assert.equal(result, "***", "should format rating");
  });

  it("remark column should fall back to shortTitle", () => {
    const columns = createResearchWorkflowItemTreeColumns();
    const remarkColumn = columns.find((c) => c.dataKey === "cleanroom-research-remark");
    assert.ok(remarkColumn, "should have remark column");
    const item = createMockItem({
      shortTitle: "Short",
    });
    const result = remarkColumn.dataProvider(item, "cleanroom-research-remark");
    assert.equal(result, "Short", "should fall back to shortTitle");
  });

  it("registerResearchWorkflowItemTreeColumns should register with itemTree", () => {
    const itemTree = createMockItemTree();
    const logger = { info() {} };
    const registered = registerResearchWorkflowItemTreeColumns({
      itemTree,
      prefs: createMockPrefs({}),
      logger,
    });
    assert.ok(Array.isArray(registered), "should return array");
    assert.ok(registered.length > 0, "should register columns");
    assert.ok(itemTree.hasColumn(registered[0]), "should be in itemTree");
  });

  it("registerResearchWorkflowItemTreeColumns should skip existing columns", () => {
    const itemTree = createMockItemTree();
    const logger = { info() {} };
    registerResearchWorkflowItemTreeColumns({
      itemTree,
      prefs: createMockPrefs({}),
      logger,
    });
    const registeredCount = itemTree.getColumns().size;
    const second = registerResearchWorkflowItemTreeColumns({
      itemTree,
      prefs: createMockPrefs({}),
      logger,
    });
    assert.equal(second.length, 0, "should not re-register existing columns");
    assert.equal(itemTree.getColumns().size, registeredCount, "count should not change");
  });

  it("registerResearchWorkflowItemTreeColumns should handle missing itemTree", () => {
    const registered = registerResearchWorkflowItemTreeColumns({
      itemTree: null,
      prefs: createMockPrefs({}),
    });
    assert.deepEqual(registered, [], "should return empty array");
  });

  it("read status column should detect read tag", () => {
    const columns = createResearchWorkflowItemTreeColumns();
    const readStatusColumn = columns.find((c) => c.dataKey === "cleanroom-research-read-status");
    assert.ok(readStatusColumn, "should have read status column");
    const item = createMockItem({
      tags: [{ tag: "read" }],
    });
    const result = readStatusColumn.dataProvider(item, "cleanroom-research-read-status");
    assert.equal(result, "read", "should detect read tag");
  });

  it("extractItemTags should be exported", () => {
    assert.typeOf(extractItemTags, "function", "should export extractItemTags");
    const item = createMockItem({
      tags: [{ tag: "tag1" }, { tag: "tag2" }],
    });
    const tags = extractItemTags(item);
    assert.deepEqual(tags, ["tag1", "tag2"], "should extract tags");
  });

  it("creator column should format creators", () => {
    const columns = createResearchWorkflowItemTreeColumns({
      prefs: createMockPrefs({
        [RESEARCH_WORKFLOW_PREF_KEYS.creatorEnabled]: true,
      }),
    });
    const creatorColumn = columns.find((c) => c.dataKey === "cleanroom-research-creator");
    assert.ok(creatorColumn, "should have creator column when enabled");
    const item = createMockItem({
      creators: [{ firstName: "John", lastName: "Doe" }],
    });
    const result = creatorColumn.dataProvider(item, "cleanroom-research-creator");
    assert.equal(result, "John Doe", "should format creator name from firstName and lastName");
  });

  it("custom columns should be created from prefs", () => {
    const columns = createResearchWorkflowItemTreeColumns({
      prefs: createMockPrefs({
        [RESEARCH_WORKFLOW_PREF_KEYS.customFieldsEnabled]: true,
        [RESEARCH_WORKFLOW_PREF_KEYS.customFieldKeys]: "volume, issue",
      }),
    });
    const customKeys = columns
      .map((c) => c.dataKey)
      .filter((k) => k.startsWith("cleanroom-research-custom-"));
    assert.ok(customKeys.length >= 2, "should create custom columns from prefs");
  });
});

await runTestsIfMain(import.meta.url);
