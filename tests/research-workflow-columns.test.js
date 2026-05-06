import { describe, it, assert } from "./test-framework.js";
import {
  createResearchWorkflowItemTreeColumns,
  extractItemTags,
  registerResearchWorkflowItemTreeColumns,
  RESEARCH_WORKFLOW_PREF_KEYS,
} from "../src/features/research-workflow-columns.js";

function createPrefs(values = {}) {
  return {
    get(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
  };
}

function findColumn(columns, dataKey) {
  return columns.find((column) => column.dataKey === dataKey);
}

function createSampleItem() {
  return {
    tags: [
      { tag: "topic" },
      { tag: "#methods/design" },
      { tag: "/reading" },
      { tag: "\u2b50\u2b50\u2b50" },
    ],
    getTags() {
      return this.tags;
    },
    getCreators() {
      return [
        { firstName: "Ada", lastName: "Lovelace" },
        { name: "Grace Hopper" },
      ];
    },
    getField(field) {
      const fields = {
        extra: "Remark: strong baseline\nOther: ignored",
        abstractNote: "Long fallback abstract",
        conferenceName: "Systems Conf",
        dateAdded: "2026-05-01T12:30:00Z",
        dateModified: "not-a-date",
        numPages: "12",
        price: "$0",
      };
      return fields[field] || "";
    },
  };
}

describe("Research Workflow Columns", () => {
  it("should derive local read-only column values from item fields and tags", () => {
    const columns = createResearchWorkflowItemTreeColumns({
      prefs: createPrefs({
        [RESEARCH_WORKFLOW_PREF_KEYS.ratingSelectedMark]: "*",
      }),
    });
    const item = createSampleItem();

    assert.equal(columns.length, 11);
    assert.equal(findColumn(columns, "cleanroom-research-tags").dataProvider(item), "topic");
    assert.equal(findColumn(columns, "cleanroom-research-text-tags").dataProvider(item), "methods/design");
    assert.equal(findColumn(columns, "cleanroom-research-status").dataProvider(item), "reading");
    assert.equal(findColumn(columns, "cleanroom-research-rating").dataProvider(item), "***");
    assert.equal(findColumn(columns, "cleanroom-research-remark").dataProvider(item), "strong baseline");
    assert.equal(findColumn(columns, "cleanroom-research-publication").dataProvider(item), "Systems Conf");
    assert.equal(findColumn(columns, "cleanroom-research-date-added").dataProvider(item), "2026-05-01");
    assert.equal(findColumn(columns, "cleanroom-research-date-modified").dataProvider(item), "not-a-date");
    assert.equal(findColumn(columns, "cleanroom-research-custom-numpages").dataProvider(item), "12");
    assert.equal(findColumn(columns, "cleanroom-research-custom-price").dataProvider(item), "$0");
  });

  it("should honor disabled columns and custom field configuration", () => {
    const columns = createResearchWorkflowItemTreeColumns({
      prefs: createPrefs({
        [RESEARCH_WORKFLOW_PREF_KEYS.tagsEnabled]: false,
        [RESEARCH_WORKFLOW_PREF_KEYS.creatorEnabled]: true,
        [RESEARCH_WORKFLOW_PREF_KEYS.customFieldKeys]: " DOI , DOI , archiveLocation ",
      }),
    });

    assert.equal(Boolean(findColumn(columns, "cleanroom-research-tags")), false);
    assert.equal(Boolean(findColumn(columns, "cleanroom-research-creator")), true);
    assert.equal(Boolean(findColumn(columns, "cleanroom-research-custom-doi")), true);
    assert.equal(Boolean(findColumn(columns, "cleanroom-research-custom-archivelocation")), true);
  });

  it("should register columns idempotently through the item tree wrapper", () => {
    const registered = [];
    const existing = new Set(["cleanroom-research-tags"]);
    const itemTree = {
      hasColumn(dataKey) {
        return existing.has(dataKey);
      },
      registerColumn(column) {
        registered.push(column);
        existing.add(column.dataKey);
        return column.dataKey;
      },
    };

    const first = registerResearchWorkflowItemTreeColumns({
      itemTree,
      prefs: createPrefs(),
    });
    const second = registerResearchWorkflowItemTreeColumns({
      itemTree,
      prefs: createPrefs(),
    });

    assert.equal(first.length, 10);
    assert.equal(second.length, 0);
    assert.equal(registered.every((column) => column.hidden === true && column.sortable === true), true);
  });

  it("should normalize mixed tag entries", () => {
    assert.deepEqual(extractItemTags({
      getTags() {
        return ["alpha", { tag: "beta" }, { name: "gamma" }, null];
      },
    }), ["alpha", "beta", "gamma"]);
  });
});
