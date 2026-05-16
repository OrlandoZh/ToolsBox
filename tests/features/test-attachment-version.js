import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  buildAttachmentVersionRows,
  collectAttachmentVersionsForItem,
  createAttachmentVersion,
  renderAttachmentVersionSection,
} from "../../src/features/attachment-version.js";

function createItem({
  id,
  key = "",
  title = "",
  itemType = "regular",
  parentID = null,
  attachments = [],
  fields = {},
} = {}) {
  return {
    id,
    key,
    title,
    itemType,
    parentID,
    ...fields,
    isAttachment() {
      return itemType === "attachment";
    },
    getAttachments() {
      return attachments;
    },
    getSource() {
      return parentID;
    },
    getFilePath() {
      return fields.path || "";
    },
    getField(field) {
      if (field === "title") {
        return title;
      }
      if (field === "itemType") {
        return itemType;
      }
      return fields[field] ?? "";
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
      if (name === "data-toolsbox-attachment-id") {
        this.dataset.toolsboxAttachmentId = value;
      }
      if (name === "data-toolsbox-selected") {
        this.dataset.toolsboxSelected = value;
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

function allOwned(node, owner = "toolsbox-attachment-version") {
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

describe("Attachment Version", () => {
  it("should collect local attachment versions for a regular item in stable order", () => {
    const oldPDF = createItem({
      id: 10,
      title: "Paper v1.pdf",
      itemType: "attachment",
      fields: {
        attachmentContentType: "application/pdf",
        dateModified: "2026-01-01T00:00:00.000Z",
      },
    });
    const newPDF = createItem({
      id: 20,
      title: "Paper v2.pdf",
      itemType: "attachment",
      fields: {
        attachmentContentType: "application/pdf",
        dateModified: "2026-02-01T00:00:00.000Z",
      },
    });
    const supplement = createItem({
      id: 30,
      title: "Supplement.txt",
      itemType: "attachment",
      fields: {
        attachmentContentType: "text/plain",
        dateAdded: "2026-01-15T00:00:00.000Z",
      },
    });
    const parent = createItem({
      id: 1,
      title: "Parent item",
      attachments: [10, 20, 30],
    });

    const result = collectAttachmentVersionsForItem(parent, createZotero([parent, oldPDF, newPDF, supplement]));

    assert.equal(result.reason, null);
    assert.equal(result.itemTitle, "Parent item");
    assert.equal(result.versionCount, 3);
    assert.deepEqual(result.attachments.map((entry) => entry.title), [
      "Paper v2.pdf",
      "Supplement.txt",
      "Paper v1.pdf",
    ]);
    assert.equal(result.attachments[0].contentType, "application/pdf");
  });

  it("should use sibling attachments when the selected item is an attachment", () => {
    const selected = createItem({
      id: 10,
      title: "Selected v1.pdf",
      itemType: "attachment",
      parentID: 1,
      fields: {
        dateModified: "2026-01-01T00:00:00.000Z",
      },
    });
    const sibling = createItem({
      id: 11,
      title: "Sibling v2.pdf",
      itemType: "attachment",
      parentID: 1,
      fields: {
        dateModified: "2026-03-01T00:00:00.000Z",
      },
    });
    const parent = createItem({
      id: 1,
      title: "Parent item",
      attachments: [10, 11],
    });

    const result = collectAttachmentVersionsForItem(selected, createZotero([parent, selected, sibling]));

    assert.equal(result.itemID, 1);
    assert.equal(result.selectedAttachmentID, 10);
    assert.equal(result.reason, null);
    assert.deepEqual(result.attachments.map((entry) => entry.id), [11, 10]);
    assert.equal(result.attachments.find((entry) => entry.id === 10).selected, true);
  });

  it("should return stable empty reasons for missing or insufficient local data", () => {
    assert.equal(collectAttachmentVersionsForItem(null, {}).reason, "no-item");
    assert.equal(collectAttachmentVersionsForItem({ id: 1, title: "No API" }, {}).reason, "attachment-api-unavailable");

    const noAttachments = createItem({ id: 1, title: "No attachments", attachments: [] });
    assert.equal(collectAttachmentVersionsForItem(noAttachments, createZotero([noAttachments])).reason, "no-attachments");

    const onlyAttachment = createItem({ id: 10, title: "Only.pdf", itemType: "attachment" });
    const parent = createItem({ id: 1, title: "Parent", attachments: [10] });
    assert.equal(collectAttachmentVersionsForItem(parent, createZotero([parent, onlyAttachment])).reason, "single-attachment");
  });

  it("should cap rows without mutating source attachments", () => {
    const first = createItem({ id: 1, title: "A.pdf", itemType: "attachment" });
    const second = createItem({ id: 2, title: "B.pdf", itemType: "attachment" });
    first.saveTx = () => {
      throw new Error("Attachment Version must stay read-only");
    };
    first.eraseTx = () => {
      throw new Error("Attachment Version must not delete attachments");
    };

    const rows = buildAttachmentVersionRows([first, second], { limit: 1 });

    assert.equal(rows.length, 1);
    assert.deepEqual([first.id, second.id], [1, 2]);
  });

  it("should render a read-only owner-tagged attachment version list", () => {
    const doc = createDoc();
    const body = createNode("body");
    const first = createItem({
      id: 10,
      title: "Paper v1.pdf",
      itemType: "attachment",
      fields: {
        dateModified: "2026-01-01T00:00:00.000Z",
        path: "/tmp/Paper v1.pdf",
      },
    });
    const second = createItem({
      id: 20,
      title: "Paper v2.pdf",
      itemType: "attachment",
      fields: {
        dateModified: "2026-02-01T00:00:00.000Z",
      },
    });
    const parent = createItem({ id: 1, title: "Parent", attachments: [10, 20] });

    const root = renderAttachmentVersionSection({
      doc,
      body,
      item: parent,
      zotero: createZotero([parent, first, second]),
    });
    const text = collectText(root).join("\n");

    assert.ok(root);
    assert.equal(body.children.length, 1);
    assert.ok(text.includes("2 local attachment versions"));
    assert.ok(text.indexOf("Paper v2.pdf") < text.indexOf("Paper v1.pdf"));
    assert.ok(text.includes("/tmp/Paper v1.pdf"));
    assert.equal(allOwned(root), true);

    renderAttachmentVersionSection({
      doc,
      body,
      item: createItem({ id: 2, title: "Empty", attachments: [] }),
      zotero: createZotero([]),
    });

    assert.equal(body.children.length, 1);
  });

  it("should skip registration when Item Pane APIs are unavailable", () => {
    const feature = createAttachmentVersion({
      logger: { warn() {} },
      zotero: {},
    });

    assert.equal(feature.register(), false);
  });

  it("should register through itemPane and cleanup idempotently", () => {
    const registered = [];
    const unregistered = [];
    const feature = createAttachmentVersion({
      logger: { debug() {}, warn() {} },
      itemPane: {
        registerSection(config) {
          registered.push(config);
          return "registered-attachment-version";
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
    assert.equal(registered[0].paneID, "toolsbox-attachment-version");
    assert.equal(typeof registered[0].onRender, "function");
    assert.equal(typeof registered[0].onAsyncRender, "function");

    feature.cleanup();
    feature.destroy();

    assert.deepEqual(unregistered, ["registered-attachment-version"]);
  });

  it("should hydrate child attachments during async Item Pane rendering", async () => {
    const registered = [];
    const unloadedParent = createItem({
      id: 1,
      title: "Parent",
      attachments: [],
    });
    const attachmentA = createItem({ id: 10, title: "A.pdf", itemType: "attachment" });
    const attachmentB = createItem({ id: 11, title: "B.pdf", itemType: "attachment" });
    const hydratedParent = createItem({
      id: 1,
      title: "Parent",
      attachments: [10, 11],
    });
    const zotero = createZotero([hydratedParent, attachmentA, attachmentB]);
    zotero.Items.getAsync = async (id) => {
      assert.equal(id, 1);
      return hydratedParent;
    };
    const feature = createAttachmentVersion({
      logger: { debug() {}, warn() {} },
      itemPane: {
        registerSection(config) {
          registered.push(config);
          return "registered-attachment-version";
        },
        unregisterSection() {},
      },
      zotero,
    });
    const doc = createDoc();
    const body = createNode("body");

    assert.equal(feature.register(), true);
    registered[0].onRender({ doc, body, item: unloadedParent });
    assert.equal(collectText(body).join(" ").includes("A.pdf"), false);

    await registered[0].onAsyncRender({ doc, body, item: unloadedParent });

    assert.ok(collectText(body).join(" ").includes("A.pdf"));
    assert.ok(collectText(body).join(" ").includes("B.pdf"));
  });
});

await runTestsIfMain(import.meta.url);
