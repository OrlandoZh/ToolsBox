import fs from "node:fs";
import vm from "node:vm";
import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  buildPaperMatrixPayload,
  buildPaperMatrixRows,
  filterPaperMatrixRows,
  sortPaperMatrixRows,
} from "../../src/features/research-workbench-matrix.js";

function createPrefs(values = {}) {
  return {
    get(key) {
      return Object.hasOwn(values, key) ? values[key] : null;
    },
  };
}

function createItem({
  id,
  title,
  itemType = "journalArticle",
  fields = {},
  tags = [],
  attachments = [],
  creators = [],
  dateAdded = "2026-01-01T00:00:00Z",
  dateModified = "2026-02-01T00:00:00Z",
} = {}) {
  return {
    id,
    itemType,
    dateAdded,
    dateModified,
    getField(field) {
      if (field === "title") {
        return title || "";
      }
      if (field === "itemType") {
        return itemType;
      }
      return fields[field] ?? "";
    },
    getTags() {
      return tags.map((tag) => (typeof tag === "string" ? { tag } : tag));
    },
    getAttachments() {
      return attachments;
    },
    getCreators() {
      return creators;
    },
    isNote() {
      return itemType === "note";
    },
    isAttachment() {
      return itemType === "attachment";
    },
  };
}

function createZotero(items = []) {
  return {
    Items: {
      getAll() {
        return items;
      },
    },
    Collections: {
      get(id) {
        return {
          id,
          getChildItems() {
            return items.filter((item) => item.collectionID === id);
          },
        };
      },
    },
    ItemTypes: {
      getName(id) {
        return id === 1 ? "journalArticle" : `type-${id}`;
      },
    },
  };
}

function createFakeElement(id = "") {
  return {
    id,
    hidden: false,
    value: "",
    innerHTML: "",
    textContent: "",
    attributes: {},
    dataset: {},
    listeners: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name] || "";
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    closest() {
      return null;
    },
  };
}

function loadMatrixBridge() {
  const ids = [
    "pm-thead",
    "pm-tbody",
    "pm-empty",
    "pm-stat-summary",
    "pm-search",
    "pm-btn-columns",
    "pm-btn-export",
    "pm-columns-panel",
    "pm-columns-toggles",
    "pm-filters",
    "pm-filter-type",
    "pm-filter-tag",
    "pm-filter-status",
    "pm-filter-year-from",
    "pm-filter-year-to",
    "pm-filter-attachment",
    "pm-btn-clear-filters",
  ];
  const elements = new Map(ids.map((id) => [id, createFakeElement(id)]));
  const documentElement = createFakeElement("html");
  documentElement.attributes["data-addon-ref"] = "toolsbox";
  const context = {
    document: {
      documentElement,
      createElement(tagName) {
        const element = createFakeElement(String(tagName || ""));
        element.tagName = String(tagName || "").toUpperCase();
        return element;
      },
      createTextNode(text) {
        return {
          nodeType: 3,
          textContent: String(text || ""),
        };
      },
      querySelector(selector) {
        return selector.startsWith("#") ? elements.get(selector.slice(1)) || null : null;
      },
    },
    window: {},
    Blob: function Blob() {},
    URL: {
      createObjectURL() {
        return "blob:matrix";
      },
      revokeObjectURL() {},
    },
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync("addon-static/content/lib/research-workbench-matrix.js", "utf-8"),
    context,
  );
  return {
    bridge: context.window.__toolsbox_WorkbenchBridge__,
    elements,
    documentElement,
  };
}

describe("Paper Matrix Enhanced", () => {
  it("should normalize local rows with enhanced fields without mutating items", () => {
    const item = createItem({
      id: 1,
      title: "Matrix Paper",
      itemType: "journalArticle",
      fields: {
        DOI: "10.1234/matrix",
        publicationTitle: "Journal of Matrices",
        date: "2024-05-01",
        extra: "Read Status: read",
      },
      tags: ["AI", "/reviewed"],
      attachments: [10, 11],
      creators: [{ lastName: "Lovelace", firstName: "Ada" }],
    });
    item.saveTx = () => {
      throw new Error("Paper Matrix Enhanced must stay read-only");
    };

    const rows = buildPaperMatrixRows([item], { zotero: createZotero([item]) });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, "Matrix Paper");
    assert.equal(rows[0].itemType, "journalArticle");
    assert.equal(rows[0].doi, "10.1234/matrix");
    assert.deepEqual(rows[0].tags, ["/reviewed", "AI"]);
    assert.equal(rows[0].workflowStatus, "reviewed");
    assert.equal(rows[0].attachmentCount, 2);
    assert.equal(rows[0].hasAttachment, true);
    assert.equal(rows[0].yearNumber, 2024);
  });

  it("should filter rows by item type, tag, year, attachment presence, and workflow status", () => {
    const rows = [
      { itemID: 1, itemType: "journalArticle", tags: ["AI"], yearNumber: 2024, hasAttachment: true, workflowStatus: "reviewed" },
      { itemID: 2, itemType: "book", tags: ["AI"], yearNumber: 2020, hasAttachment: false, workflowStatus: "todo" },
      { itemID: 3, itemType: "journalArticle", tags: ["ML"], yearNumber: 2025, hasAttachment: true, workflowStatus: "todo" },
    ];

    const filtered = filterPaperMatrixRows(rows, {
      itemType: "journalArticle",
      tag: "AI",
      yearFrom: 2023,
      yearTo: 2024,
      hasAttachment: true,
      workflowStatus: "reviewed",
    });

    assert.deepEqual(filtered.map((row) => row.itemID), [1]);
  });

  it("should sort rows stably by enhanced fields", () => {
    const rows = [
      { itemID: 3, title: "C", attachmentCount: 1, workflowStatus: "todo" },
      { itemID: 1, title: "A", attachmentCount: 3, workflowStatus: "reviewed" },
      { itemID: 2, title: "B", attachmentCount: 3, workflowStatus: "done" },
    ];

    assert.deepEqual(
      sortPaperMatrixRows(rows, { key: "attachmentCount", dir: "desc" }).map((row) => row.itemID),
      [1, 2, 3],
    );
    assert.deepEqual(
      sortPaperMatrixRows(rows, { key: "workflowStatus", dir: "asc" }).map((row) => row.itemID),
      [2, 1, 3],
    );
  });

  it("should gate enhanced payload with paperMatrix.enabled while leaving baseline rows available", () => {
    const item = createItem({ id: 1, title: "Baseline Paper", attachments: [10] });
    const disabled = buildPaperMatrixPayload({}, {
      prefs: createPrefs({ "paperMatrix.enabled": false }),
      zotero: createZotero([item]),
    });
    const enabled = buildPaperMatrixPayload({}, {
      prefs: createPrefs({ "paperMatrix.enabled": true }),
      zotero: createZotero([item]),
    });

    assert.equal(disabled.enhanced, false);
    assert.equal(disabled.rows.length, 1);
    assert.equal(enabled.enhanced, true);
    assert.equal(enabled.rows[0].attachmentCount, 1);
  });

  it("should reset enhanced shell bridge state across mount and unmount", () => {
    const { bridge, elements, documentElement } = loadMatrixBridge();

    bridge.mount({
      enhanced: true,
      rows: [
        { itemID: 1, title: "Enhanced", itemType: "journalArticle", tags: ["AI"], workflowStatus: "reviewed", attachmentCount: 1, hasAttachment: true, hasAttachmentLabel: "Yes" },
      ],
      theme: "light",
    });
    assert.equal(bridge.getSnapshot().enhanced, true);
    assert.equal(elements.get("pm-filters").hidden, false);
    assert.ok(elements.get("pm-thead").innerHTML.includes("Attachments"));
    assert.equal(documentElement.getAttribute("data-paper-matrix-enhanced"), "true");

    elements.get("pm-filter-type").value = "journalArticle";
    elements.get("pm-filter-type").listeners.change({ target: elements.get("pm-filter-type") });
    assert.equal(bridge.getSnapshot().filters.itemType, "journalArticle");

    bridge.unmount();
    assert.equal(bridge.getSnapshot().enhanced, false);
    assert.equal(elements.get("pm-filters").hidden, true);

    bridge.mount({
      enhanced: false,
      rows: [{ itemID: 2, title: "Baseline" }],
      theme: "light",
    });
    assert.equal(bridge.getSnapshot().enhanced, false);
    assert.equal(bridge.getSnapshot().filters.itemType, "");
    assert.equal(elements.get("pm-filters").hidden, true);
    assert.equal(elements.get("pm-thead").innerHTML.includes("Attachments"), false);
    assert.equal(documentElement.getAttribute("data-paper-matrix-enhanced"), "false");
  });
});

await runTestsIfMain(import.meta.url);
