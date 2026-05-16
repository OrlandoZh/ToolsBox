import { describe, it, assert } from "../test-framework.js";
import {
  buildMergedAnnotationNoteHTML,
  collectAnnotationSnapshotsForItem,
  createMergeAnnotations,
  findOwnedMergedAnnotationNote,
  mergeAnnotationSnapshots,
  renderMergeAnnotationsSection,
  writeMergedAnnotationNoteForItem,
} from "../../src/features/merge-annotations.js";

function createItem({
  id,
  key = "",
  title = "",
  itemType = "regular",
  parentID = null,
  attachments = [],
  annotations = [],
  notes = [],
  note = "",
} = {}) {
  return {
    id,
    key,
    itemType,
    title,
    parentID,
    note,
    notes,
    isAttachment() {
      return itemType === "attachment";
    },
    isNote() {
      return itemType === "note";
    },
    getAttachments() {
      return attachments;
    },
    getAnnotations() {
      return annotations;
    },
    getNotes() {
      return notes;
    },
    getNote() {
      return note;
    },
    setNote(value) {
      this.note = value;
    },
    async saveTx() {
      return this.id;
    },
    getField(field) {
      if (field === "title") {
        return title;
      }
      if (field === "itemType") {
        return itemType;
      }
      if (field === "note") {
        return this.note;
      }
      return "";
    },
  };
}

function createZotero(items = []) {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  return {
    Items: {
      get(id) {
        return itemMap.get(id) || null;
      },
    },
    Annotations: {
      getByItemID() {
        return [];
      },
      saveFromJSON() {
        throw new Error("Merge preview must not write annotations");
      },
      delete() {
        throw new Error("Merge preview must not delete annotations");
      },
    },
  };
}

function createWritableZotero(items = []) {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  let nextID = 900;
  const createdNotes = [];

  function MockItem(itemType) {
    this.id = null;
    this.itemType = itemType;
    this.note = "";
    this.parentID = null;
  }

  MockItem.prototype.isNote = function isNote() {
    return this.itemType === "note";
  };
  MockItem.prototype.getNote = function getNote() {
    return this.note;
  };
  MockItem.prototype.setNote = function setNote(value) {
    this.note = value;
  };
  MockItem.prototype.saveTx = async function saveTx() {
    if (!this.id) {
      this.id = nextID;
      nextID += 1;
      createdNotes.push(this);
    }
    itemMap.set(this.id, this);
    const parent = itemMap.get(this.parentID);
    if (parent && Array.isArray(parent.notes) && !parent.notes.includes(this.id)) {
      parent.notes.push(this.id);
    }
    return this.id;
  };
  MockItem.prototype.getField = function getField(field) {
    if (field === "note") {
      return this.note;
    }
    if (field === "itemType") {
      return this.itemType;
    }
    return "";
  };

  return {
    Item: MockItem,
    Items: {
      get(id) {
        return itemMap.get(id) || null;
      },
    },
    Annotations: {
      getByItemID() {
        return [];
      },
      saveFromJSON() {
        throw new Error("Merge writeback must not create annotations");
      },
      delete() {
        throw new Error("Merge writeback must not delete annotations");
      },
    },
    createdNotes,
    itemMap,
  };
}

function createNode(tagName) {
  const node = {
    tagName,
    children: [],
    dataset: {},
    attributes: {},
    textContent: "",
    parentNode: null,
    removed: false,
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    addEventListener(eventName, handler) {
      this[`on${eventName}`] = handler;
    },
    remove() {
      this.removed = true;
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      }
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
      if (name === "data-toolsbox-owner") {
        this.dataset.toolsboxOwner = value;
      }
    },
    querySelectorAll(selector) {
      const match = selector.match(/\[data-toolsbox-owner="([^"]+)"\]/u);
      const owner = match?.[1];
      const matches = [];
      function visit(current) {
        if (owner && current.dataset?.toolsboxOwner === owner) {
          matches.push(current);
        }
        for (const child of current.children || []) {
          visit(child);
        }
      }
      visit(this);
      return matches;
    },
  };
  return node;
}

function createDoc() {
  return {
    createElement(tagName) {
      return createNode(tagName);
    },
  };
}

function collectText(node, out = []) {
  if (node?.textContent) {
    out.push(node.textContent);
  }
  for (const child of node?.children || []) {
    collectText(child, out);
  }
  return out;
}

function allOwned(node, owner = "toolsbox-merge-annotations") {
  const nodes = [];
  function visit(current) {
    nodes.push(current);
    for (const child of current.children || []) {
      visit(child);
    }
  }
  visit(node);
  return nodes.every((entry) => entry.dataset?.toolsboxOwner === owner);
}

describe("Merge Annotations", () => {
  it("should collect annotation snapshots from a selected attachment", () => {
    const attachment = createItem({
      id: 10,
      title: "Attachment A",
      itemType: "attachment",
      annotations: [{
        id: 101,
        key: "ANN1",
        annotationText: "Important passage",
        annotationComment: "Reviewer note",
        annotationType: "highlight",
        annotationColor: "#ffd400",
        annotationPosition: JSON.stringify({ pageIndex: 1, sortIndex: 4 }),
      }],
    });

    const result = collectAnnotationSnapshotsForItem(attachment, createZotero([attachment]));

    assert.equal(result.attachments.length, 1);
    assert.equal(result.annotations.length, 1);
    assert.equal(result.annotations[0].text, "Important passage");
    assert.equal(result.annotations[0].comment, "Reviewer note");
    assert.equal(result.annotations[0].pageIndex, 1);
    assert.equal(result.annotations[0].pageLabel, "2");
    assert.equal(result.annotations[0].attachmentTitle, "Attachment A");
  });

  it("should collect child attachment annotations for a regular item", () => {
    const attachment = createItem({
      id: 20,
      title: "PDF",
      itemType: "attachment",
    });
    const item = createItem({
      id: 1,
      title: "Parent",
      attachments: [20],
    });
    const reader = {
      getAnnotations(attachmentID) {
        assert.equal(attachmentID, 20);
        return [{
          id: 201,
          annotationText: "Child attachment quote",
          annotationPageLabel: "3",
        }];
      },
    };

    const result = collectAnnotationSnapshotsForItem(item, createZotero([item, attachment]), reader);

    assert.equal(result.attachments.length, 1);
    assert.equal(result.annotations.length, 1);
    assert.equal(result.annotations[0].text, "Child attachment quote");
    assert.equal(result.annotations[0].pageLabel, "3");
  });

  it("should return stable empty reasons when local APIs are unavailable", () => {
    const item = createItem({ id: 1, attachments: [99] });
    const missingAttachment = collectAnnotationSnapshotsForItem(item, {}, null);
    assert.equal(missingAttachment.reason, "no-attachments");
    assert.deepEqual(missingAttachment.annotations, []);

    const attachment = createItem({ id: 2, itemType: "attachment" });
    attachment.getAnnotations = undefined;
    const missingAnnotationAPI = collectAnnotationSnapshotsForItem(attachment, {}, null);
    assert.equal(missingAnnotationAPI.reason, "annotation-api-unavailable");
    assert.deepEqual(missingAnnotationAPI.annotations, []);
  });

  it("should merge text and comments by stable page order", () => {
    const merged = mergeAnnotationSnapshots([
      { id: 3, pageIndex: 1, pageLabel: "2", order: 2, text: "Second page later", comment: "" },
      { id: 1, pageIndex: 0, pageLabel: "1", order: 2, text: "First page second", comment: "note" },
      { id: 2, pageIndex: 0, pageLabel: "1", order: 1, text: "First page first", comment: "" },
      { id: 4, pageIndex: 2, pageLabel: "3", order: 1, text: "", comment: "" },
    ]);

    assert.equal(merged.mergeableCount, 3);
    assert.equal(merged.pageCount, 2);
    assert.deepEqual(merged.groups[0].annotations.map((entry) => entry.id), [2, 1]);
    assert.ok(merged.text.includes("Page 1"));
    assert.ok(merged.text.includes("Note: note"));
    assert.equal(merged.text.includes("Page 3"), false);
  });

  it("should cap merged annotation previews without mutating source data", () => {
    const source = [
      { id: 1, pageIndex: 0, pageLabel: "1", order: 1, text: "A", comment: "" },
      { id: 2, pageIndex: 0, pageLabel: "1", order: 2, text: "B", comment: "" },
      { id: 3, pageIndex: 0, pageLabel: "1", order: 3, text: "C", comment: "" },
    ];

    const merged = mergeAnnotationSnapshots(source, { limit: 2 });

    assert.equal(merged.mergeableCount, 2);
    assert.deepEqual(source.map((entry) => entry.id), [1, 2, 3]);
  });

  it("should render stable empty state when no item is selected", () => {
    const doc = createDoc();
    const body = createNode("body");

    const root = renderMergeAnnotationsSection({ doc, body });

    assert.ok(root);
    assert.equal(body.children.includes(root), true);
    assert.ok(collectText(root).includes("No item selected"));
    assert.equal(allOwned(root), true);
  });

  it("should render a read-only grouped annotation preview", () => {
    const doc = createDoc();
    const body = createNode("body");
    const attachment = createItem({
      id: 10,
      title: "PDF",
      itemType: "attachment",
      annotations: [
        { id: 2, annotationText: "Later", annotationPageLabel: "1", annotationPosition: { pageIndex: 0, sortIndex: 2 } },
        { id: 1, annotationText: "Earlier", annotationComment: "Keep this", annotationPageLabel: "1", annotationPosition: { pageIndex: 0, sortIndex: 1 } },
      ],
    });

    const root = renderMergeAnnotationsSection({
      doc,
      body,
      item: attachment,
      zotero: createZotero([attachment]),
    });
    const text = collectText(root).join("\n");

    assert.ok(text.includes("2 mergeable annotations"));
    assert.ok(text.includes("Page 1"));
    assert.ok(text.indexOf("Earlier") < text.indexOf("Later"));
    assert.ok(text.includes("Note: Keep this"));
    assert.equal(allOwned(root), true);
  });

  it("should build an owned merged note with escaped annotation content", () => {
    const html = buildMergedAnnotationNoteHTML({
      item: createItem({ id: 1, title: "Unsafe <Title>" }),
      collection: {
        itemID: 1,
        itemTitle: "Unsafe <Title>",
        attachments: [{ id: 10, title: "PDF & Notes" }],
      },
      merged: {
        mergeableCount: 1,
        pageCount: 1,
        groups: [{
          pageLabel: "1",
          annotations: [{
            text: "Quote <script>",
            comment: "Keep & review",
            attachmentTitle: "PDF & Notes",
          }],
        }],
      },
      generatedAt: "2026-05-16T00:00:00.000Z",
    });

    assert.ok(html.includes("toolsbox-merge-annotations-note:source=1"));
    assert.ok(html.includes("Unsafe &lt;Title&gt;"));
    assert.ok(html.includes("Quote &lt;script&gt;"));
    assert.ok(html.includes("Keep &amp; review"));
    assert.equal(html.includes("<script>"), false);
  });

  it("should create a ToolsBox-owned child note from merged annotations", async () => {
    const parent = createItem({
      id: 1,
      title: "Parent",
      notes: [],
    });
    const attachment = createItem({
      id: 10,
      parentID: 1,
      title: "PDF",
      itemType: "attachment",
      annotations: [{
        id: 101,
        annotationText: "Writable quote",
        annotationComment: "Writable note",
        annotationPageLabel: "5",
      }],
    });
    const zotero = createWritableZotero([parent, attachment]);

    const result = await writeMergedAnnotationNoteForItem(attachment, zotero, null, {
      generatedAt: "2026-05-16T00:00:00.000Z",
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, "created");
    assert.equal(result.parentID, 1);
    assert.equal(zotero.createdNotes.length, 1);
    assert.equal(parent.notes.length, 1);
    assert.ok(zotero.createdNotes[0].note.includes("Writable quote"));
    assert.ok(zotero.createdNotes[0].note.includes("toolsbox-merge-annotations-note:source=10"));
  });

  it("should update an existing owned merge note instead of creating duplicates", async () => {
    const existing = createItem({
      id: 50,
      itemType: "note",
      note: "<!-- toolsbox-merge-annotations-note:source=1 -->\n<p>Old</p>",
    });
    let saveCount = 0;
    existing.saveTx = async function saveTx() {
      saveCount += 1;
      return this.id;
    };
    const parent = createItem({
      id: 1,
      title: "Parent",
      notes: [50],
      attachments: [10],
    });
    const attachment = createItem({
      id: 10,
      parentID: 1,
      title: "PDF",
      itemType: "attachment",
      annotations: [{ id: 101, annotationText: "Updated quote", annotationPageLabel: "1" }],
    });
    const zotero = createWritableZotero([parent, attachment, existing]);

    assert.equal(findOwnedMergedAnnotationNote(parent, zotero), existing);

    const result = await writeMergedAnnotationNoteForItem(parent, zotero, null, {
      generatedAt: "2026-05-16T00:00:00.000Z",
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, "updated");
    assert.equal(result.noteID, 50);
    assert.equal(saveCount, 1);
    assert.equal(zotero.createdNotes.length, 0);
    assert.ok(existing.note.includes("Updated quote"));
  });

  it("should return stable writeback failures without mutating annotations", async () => {
    let annotationWriteCount = 0;
    const attachment = createItem({
      id: 30,
      itemType: "attachment",
      annotations: [{ id: 301, annotationText: "Cannot persist" }],
    });
    const zotero = createZotero([attachment]);
    zotero.Annotations.saveFromJSON = () => {
      annotationWriteCount += 1;
      throw new Error("should not write annotations");
    };

    const result = await writeMergedAnnotationNoteForItem(attachment, zotero);

    assert.equal(result.ok, false);
    assert.equal(result.reason, "note-api-unavailable");
    assert.equal(annotationWriteCount, 0);
  });

  it("should render a writeback button that invokes the supplied workflow", async () => {
    const doc = createDoc();
    const body = createNode("body");
    const attachment = createItem({
      id: 10,
      title: "PDF",
      itemType: "attachment",
      annotations: [{ id: 1, annotationText: "Click writeback", annotationPageLabel: "1" }],
    });
    const writes = [];

    const root = renderMergeAnnotationsSection({
      doc,
      body,
      item: attachment,
      zotero: createZotero([attachment]),
      onWriteNote(item) {
        writes.push(item.id);
        return { ok: true, action: "created" };
      },
    });
    const button = root.children
      .flatMap((child) => child.children || [])
      .find((child) => child.tagName === "button");

    assert.ok(button);
    button.onclick();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(writes, [10]);
    assert.equal(button.disabled, false);
    assert.ok(collectText(root).includes("Merged note written"));
  });

  it("should skip registration when ItemPane API is unavailable", () => {
    const feature = createMergeAnnotations({
      logger: { warn() {} },
      zotero: {},
    });

    assert.equal(feature.register(), false);
  });

  it("should register through itemPane and cleanup idempotently", () => {
    const registered = [];
    const unregistered = [];
    const feature = createMergeAnnotations({
      logger: { debug() {}, warn() {} },
      itemPane: {
        registerSection(config) {
          registered.push(config);
          return "registered-merge-annotations";
        },
        unregisterSection(paneID) {
          unregistered.push(paneID);
        },
      },
      zotero: {},
    });

    assert.equal(feature.register(), true);
    assert.equal(feature.register(), true);
    assert.equal(registered.length, 1);
    assert.equal(registered[0].paneID, "toolsbox-merge-annotations");
    assert.equal(typeof registered[0].onRender, "function");
    assert.equal(typeof registered[0].onAsyncRender, "function");

    feature.cleanup();
    feature.destroy();

    assert.deepEqual(unregistered, ["registered-merge-annotations"]);
  });

  it("should hydrate child attachments during async Item Pane rendering", async () => {
    const registered = [];
    const unloadedParent = createItem({
      id: 1,
      title: "Parent",
      attachments: [],
    });
    const hydratedParent = createItem({
      id: 1,
      title: "Parent",
      attachments: [10],
    });
    const attachment = createItem({
      id: 10,
      parentID: 1,
      title: "PDF",
      itemType: "attachment",
      annotations: [{ id: 101, annotationComment: "Hydrated child note", annotationPageLabel: "1" }],
    });
    const zotero = createZotero([hydratedParent, attachment]);
    zotero.Items.getAsync = async (id) => {
      assert.equal(id, 1);
      return hydratedParent;
    };
    const feature = createMergeAnnotations({
      logger: { debug() {}, warn() {} },
      itemPane: {
        registerSection(config) {
          registered.push(config);
          return "registered-merge-annotations";
        },
        unregisterSection() {},
      },
      zotero,
    });
    const doc = createDoc();
    const body = createNode("body");

    assert.equal(feature.register(), true);
    registered[0].onRender({ doc, body, item: unloadedParent });
    assert.equal(collectText(body).join(" ").includes("Hydrated child note"), false);

    await registered[0].onAsyncRender({ doc, body, item: unloadedParent });

    assert.ok(collectText(body).join(" ").includes("Hydrated child note"));
  });

  it("should not write notes or mutate annotations while collecting previews", () => {
    let writeCount = 0;
    const attachment = createItem({
      id: 30,
      itemType: "attachment",
      annotations: [{ id: 301, annotationText: "Read-only" }],
    });
    const zotero = createZotero([attachment]);
    zotero.Notes = {
      create() {
        writeCount += 1;
      },
    };

    const result = collectAnnotationSnapshotsForItem(attachment, zotero);
    const merged = mergeAnnotationSnapshots(result.annotations);

    assert.equal(merged.mergeableCount, 1);
    assert.equal(writeCount, 0);
  });
});
