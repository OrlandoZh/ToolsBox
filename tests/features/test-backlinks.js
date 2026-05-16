import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  buildBacklinkGraphForItem,
  buildBacklinkTargets,
  collectBacklinksForItem,
  collectBacklinksForItemAsync,
  createBacklinks,
  renderBacklinksSection,
  selectBacklinkSource,
  textMentionsTarget,
} from "../../src/features/backlinks.js";

function createLogger() {
  const logs = [];
  return {
    debug(message, data) {
      logs.push({ level: "debug", message, data });
    },
    warn(message, data) {
      logs.push({ level: "warn", message, data });
    },
    getLogs() {
      return logs;
    },
  };
}

function createItem({ id, key, title, fields = {}, note = "", notes = [], relations = null }) {
  return {
    id,
    key,
    title,
    note,
    relations,
    getField(field) {
      if (field === "title") {
        return title || "";
      }
      return fields[field] ?? fields[field.toLowerCase()] ?? fields[field.toUpperCase()] ?? "";
    },
    getNote() {
      return note;
    },
    getNotes() {
      return notes;
    },
    toJSON() {
      return { id, key, title };
    },
  };
}

function createZotero(items, noteMap = new Map(), options = {}) {
  const mainWindow = options.mainWindow || null;
  return {
    Libraries: {
      userLibraryID: 1,
    },
    Items: {
      getAll() {
        return options.asyncGetAll ? Promise.resolve(items) : items;
      },
      get(id) {
        return noteMap.get(id) || null;
      },
    },
    URI: {
      getItemURI(item) {
        return `zotero://select/library/items/${item.key}`;
      },
      getItemID(uri) {
        const match = String(uri || "").match(/\/items\/([A-Z0-9]+)/u);
        if (!match) {
          return null;
        }
        return items.find((item) => item.key === match[1])?.id ?? null;
      },
    },
    Relations: {
      getByItem(item) {
        return item.relations;
      },
    },
    getMainWindow() {
      return mainWindow;
    },
  };
}

function createMockElement(tagName) {
  const children = [];
  const listeners = new Map();
  let parentNode = null;
  return {
    tagName,
    children,
    className: "",
    dataset: {},
    textContent: "",
    removed: false,
    onclick: null,
    appendChild(child) {
      children.push(child);
      child.parentNode = this;
    },
    querySelectorAll(selector) {
      if (selector !== '[data-toolsbox-owner="toolsbox-backlinks"]') {
        return [];
      }
      return children.filter((child) => child.dataset?.toolsboxOwner === "toolsbox-backlinks");
    },
    setAttribute(name, value) {
      if (name === "data-toolsbox-owner") {
        this.dataset.toolsboxOwner = value;
      }
      if (name === "data-toolsbox-backlink-item-id") {
        this.dataset.toolsboxBacklinkItemId = value;
      }
      if (name === "data-toolsbox-action") {
        this.dataset.toolsboxAction = value;
      }
      this[name] = value;
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    click() {
      const handler = listeners.get("click") || this.onclick;
      if (typeof handler === "function") {
        handler({ target: this });
      }
    },
    remove() {
      this.removed = true;
      if (parentNode) {
        const index = parentNode.children.indexOf(this);
        if (index >= 0) {
          parentNode.children.splice(index, 1);
        }
      }
    },
    get parentNode() {
      return parentNode;
    },
    set parentNode(value) {
      parentNode = value;
    },
  };
}

function createMockDoc() {
  return {
    createElement(tagName) {
      return createMockElement(tagName);
    },
  };
}

describe("Backlinks", () => {
  it("should build explicit local backlink targets", () => {
    const current = createItem({
      id: 1,
      key: "ABCD1234",
      fields: {
        DOI: "10.1000/example",
      },
    });
    const targets = buildBacklinkTargets(current, createZotero([current]));

    assert.ok(targets.some((target) => target.type === "itemKey" && target.value === "ABCD1234"));
    assert.ok(targets.some((target) => target.type === "zoteroURI" && target.value.includes("ABCD1234")));
    assert.ok(targets.some((target) => target.type === "doi" && target.value === "10.1000/example"));
  });

  it("should match item keys as tokens instead of embedded text", () => {
    const targets = [{ type: "itemKey", value: "ABCD1234", match: "token" }];

    assert.equal(textMentionsTarget("See ABCD1234 for context", targets), true);
    assert.equal(textMentionsTarget("prefixABCD1234suffix", targets), false);
  });

  it("should collect explicit backlinks from Extra, abstract, DOI, URI, and child notes", () => {
    const current = createItem({
      id: 1,
      key: "ABCD1234",
      title: "Current",
      fields: {
        DOI: "10.1000/example",
      },
    });
    const childNote = createItem({
      id: 20,
      key: "NOTE0001",
      note: "Child note cites zotero://select/library/items/ABCD1234",
    });
    const byKey = createItem({
      id: 2,
      key: "KEY00002",
      title: "By key",
      fields: {
        extra: "Related to ABCD1234",
      },
    });
    const byDOI = createItem({
      id: 3,
      key: "KEY00003",
      title: "By DOI",
      fields: {
        abstractNote: "Uses https://doi.org/10.1000/example as prior work",
      },
    });
    const byNote = createItem({
      id: 4,
      key: "KEY00004",
      title: "By note",
      notes: [20],
    });
    const zotero = createZotero([current, byKey, byDOI, byNote], new Map([[20, childNote]]));

    const backlinks = collectBacklinksForItem(current, zotero);

    assert.deepEqual(backlinks.map((entry) => entry.title), ["By key", "By DOI", "By note"]);
    assert.ok(backlinks[0].matchedBy.includes("text:itemKey"));
    assert.ok(backlinks[1].matchedBy.includes("text:doi"));
    assert.ok(backlinks[2].matchedBy.includes("text:zoteroURI"));
  });

  it("should collect relation backlinks without writing back relations", () => {
    const current = createItem({ id: 1, key: "ABCD1234", title: "Current" });
    const related = createItem({
      id: 2,
      key: "REL00002",
      title: "Relation source",
      relations: {
        "dc:relation": ["zotero://select/library/items/ABCD1234"],
      },
    });
    const zotero = createZotero([current, related]);

    const backlinks = collectBacklinksForItem(current, zotero);

    assert.equal(backlinks.length, 1);
    assert.equal(backlinks[0].title, "Relation source");
    assert.deepEqual(backlinks[0].matchedBy, ["relation"]);
  });

  it("should exclude the current item and cap results", () => {
    const current = createItem({
      id: 1,
      key: "ABCD1234",
      fields: {
        DOI: "10.1000/example",
      },
    });
    const matches = [2, 3, 4].map((id) => createItem({
      id,
      key: `KEY0000${id}`,
      title: `Match ${id}`,
      fields: {
        extra: "ABCD1234",
      },
    }));
    const zotero = createZotero([current, ...matches]);

    const backlinks = collectBacklinksForItem(current, zotero, { limit: 2 });

    assert.equal(backlinks.length, 2);
    assert.deepEqual(backlinks.map((entry) => entry.title), ["Match 2", "Match 3"]);
  });

  it("should return an empty list when item enumeration is unavailable", () => {
    const current = createItem({ id: 1, key: "ABCD1234" });

    assert.deepEqual(collectBacklinksForItem(current, { Items: {}, URI: {} }), []);
  });

  it("should collect backlinks from asynchronous Zotero item enumeration", async () => {
    const current = createItem({ id: 1, key: "ABCD1234", title: "Current" });
    const source = createItem({
      id: 2,
      key: "KEY00002",
      title: "Async source",
      fields: {
        extra: "ABCD1234",
      },
    });

    const syncResult = collectBacklinksForItem(current, createZotero([current, source], new Map(), {
      asyncGetAll: true,
    }));
    const asyncResult = await collectBacklinksForItemAsync(current, createZotero([current, source], new Map(), {
      asyncGetAll: true,
    }));

    assert.deepEqual(syncResult, []);
    assert.deepEqual(asyncResult.map((entry) => entry.title), ["Async source"]);
  });

  it("should build a stable local backlink graph", () => {
    const current = createItem({ id: 1, key: "ABCD1234", title: "Current" });
    const graph = buildBacklinkGraphForItem(current, [
      { itemID: 3, key: "KEY00003", title: "By DOI", matchedBy: ["text:doi"] },
      { itemID: 2, key: "KEY00002", title: "By key", matchedBy: ["text:itemKey"] },
      { itemID: 4, key: "KEY00004", title: "By URI", matchedBy: ["text:zoteroURI"] },
    ]);

    assert.equal(graph.backlinkCount, 3);
    assert.deepEqual(graph.backlinks.map((entry) => entry.title), ["By key", "By DOI", "By URI"]);
    assert.equal(graph.nodes[0].role, "target");
    assert.deepEqual(graph.edges.map((entry) => entry.matchedBy[0]), ["text:itemKey", "text:doi", "text:zoteroURI"]);
  });

  it("should drill down to a backlink source through ZoteroPane selection APIs", async () => {
    const selected = [];
    const zotero = createZotero([], new Map(), {
      mainWindow: {
        ZoteroPane: {
          async selectItem(itemID) {
            selected.push(itemID);
          },
        },
      },
    });

    const result = await selectBacklinkSource({ itemID: 42 }, { zotero });

    assert.deepEqual(selected, [42]);
    assert.equal(result.ok, true);
    assert.equal(result.strategy, "ZoteroPane.selectItem");
  });

  it("should return stable no-op drilldown status when selection APIs are unavailable", async () => {
    const result = await selectBacklinkSource({ itemID: 42 }, { zotero: createZotero([]) });

    assert.deepEqual(result, {
      ok: false,
      itemID: 42,
      reason: "selection-api-unavailable",
    });
  });

  it("should skip registration when required APIs are unavailable", () => {
    const logger = createLogger();
    const backlinks = createBacklinks({
      logger,
      zotero: {},
    });

    assert.equal(backlinks.register(), false);
    assert.equal(logger.getLogs().some((entry) => entry.level === "warn"), true);
  });

  it("should register through itemPane and cleanup idempotently", () => {
    const logger = createLogger();
    const registered = [];
    const unregistered = [];
    const backlinks = createBacklinks({
      logger,
      zotero: createZotero([]),
      itemPane: {
        registerSection(options) {
          registered.push(options);
          return `${options.paneID}-registered`;
        },
        unregisterSection(paneID) {
          unregistered.push(paneID);
          return true;
        },
      },
    });

    assert.equal(backlinks.register(), true);
    assert.equal(backlinks.register(), true);
    assert.equal(registered.length, 1);
    assert.equal(registered[0].paneID, "toolsbox-backlinks");
    assert.equal(typeof registered[0].onRender, "function");
    assert.equal(typeof registered[0].onAsyncRender, "function");

    backlinks.cleanup();
    backlinks.cleanup();

    assert.deepEqual(unregistered, ["toolsbox-backlinks-registered"]);
  });

  it("should render a read-only local backlinks section", () => {
    const current = createItem({ id: 1, key: "ABCD1234", title: "Current" });
    const backlink = createItem({
      id: 2,
      key: "KEY00002",
      title: "Backlink source",
      fields: {
        extra: "ABCD1234",
      },
    });
    const doc = createMockDoc();
    const body = createMockElement("body");

    const root = renderBacklinksSection({
      doc,
      body,
      item: current,
      zotero: createZotero([current, backlink]),
    });

    assert.ok(root);
    assert.equal(body.children.length, 1);
    assert.equal(root.children[1].className, "toolsbox-backlinks-graph");
    assert.equal(root.children[2].tagName, "ul");
    assert.equal(root.children[2].children[0].children[0].textContent, "Backlink source");
  });

  it("should render drilldown controls and avoid owner-node residue on rerender", async () => {
    const current = createItem({ id: 1, key: "ABCD1234", title: "Current" });
    const graph = buildBacklinkGraphForItem(current, [
      { itemID: 2, key: "KEY00002", title: "Backlink source", matchedBy: ["text:itemKey"] },
    ]);
    const doc = createMockDoc();
    const body = createMockElement("body");
    const selections = [];

    const root = renderBacklinksSection({
      doc,
      body,
      item: current,
      graph,
      onSelectSource(backlink) {
        selections.push(backlink.itemID);
        return { ok: true };
      },
    });
    const entry = root.children[2].children[0];
    const button = entry.children[2];

    button.click();
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(selections, [2]);
    assert.equal(entry.children[3].textContent, "Source selected");

    renderBacklinksSection({
      doc,
      body,
      item: current,
      graph,
    });

    assert.equal(body.children.length, 1);
  });
});

await runTestsIfMain(import.meta.url);
