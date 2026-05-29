import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createAIProviderRegistry } from "../../src/services/ai-provider-contract.js";
import {
  buildTLDRPreviewPayload,
  collectTLDRInputForItem,
  createTLDRPanel,
  renderTLDRPanelSection,
} from "../../src/features/tldr-panel.js";

function createPrefs(values = {}) {
  return {
    values: new Map(Object.entries(values)),
    get(key) {
      return this.values.has(key) ? this.values.get(key) : null;
    },
  };
}

function createItem({
  id,
  key = "",
  title = "",
  itemType = "journalArticle",
  fields = {},
} = {}) {
  return {
    id,
    key,
    title,
    itemType,
    ...fields,
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
    className: "",
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
      this.attributes[name] = String(value);
      if (name === "class") {
        this.className = String(value);
      }
      if (name === "data-toolsbox-owner") {
        this.dataset.toolsboxOwner = String(value);
      }
      if (name === "data-toolsbox-tldr-network-used") {
        this.dataset.toolsboxTldrNetworkUsed = String(value);
      }
      if (name === "data-toolsbox-tldr-result-status") {
        this.dataset.toolsboxTldrResultStatus = String(value);
      }
    },
    getAttribute(name) {
      return this.attributes[name] || "";
    },
    querySelectorAll(selector) {
      const matches = [];
      function hasClass(current, className) {
        return String(current.className || current.attributes?.class || "")
          .split(/\s+/u)
          .includes(className);
      }
      function matchesSelector(current) {
        if (selector === "*") {
          return true;
        }
        const owner = selector.match(/\[data-toolsbox-owner="([^"]+)"\]/u)?.[1] || "";
        const className = selector.match(/\.([a-z0-9-]+)/iu)?.[1] || "";
        if (owner && current.dataset?.toolsboxOwner !== owner) {
          return false;
        }
        if (className && !hasClass(current, className)) {
          return false;
        }
        return Boolean(owner || className);
      }
      function visit(current) {
        if (matchesSelector(current)) {
          matches.push(current);
        }
        for (const child of current.children || []) {
          visit(child);
        }
      }
      visit(this);
      return matches;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
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

function allOwned(node, owner = "toolsbox-tldr-panel") {
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

describe("TLDR Panel", () => {
  it("should normalize local item metadata for TLDR previews", () => {
    assert.equal(collectTLDRInputForItem(null, {}).reason, "no-item");

    const item = createItem({
      id: 1,
      key: "ABC",
      title: "Local TLDR Paper",
      fields: {
        abstractNote: "This abstract is read locally for a no-network preview.",
      },
    });
    const input = collectTLDRInputForItem(item, {}, { limit: 20 });

    assert.equal(input.reason, null);
    assert.equal(input.itemID, 1);
    assert.equal(input.title, "Local TLDR Paper");
    assert.equal(input.itemType, "journalArticle");
    assert.equal(input.hasAbstract, true);
    assert.equal(input.abstractPreview, "This abstract is rea");

    const emptyAbstract = collectTLDRInputForItem(createItem({ id: 2, title: "Title only" }), {});
    assert.equal(emptyAbstract.reason, null);
    assert.equal(emptyAbstract.hasAbstract, false);
    assert.equal(emptyAbstract.abstractLength, 0);
  });

  it("should build no-network provider payloads without calling fetch", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = () => {
      fetchCalled = true;
      throw new Error("TLDR no-network preview must not call fetch");
    };

    try {
      const input = collectTLDRInputForItem(createItem({
        id: 1,
        title: "No Network TLDR",
        fields: {
          abstractNote: "Local only",
        },
      }));
      const payload = await buildTLDRPreviewPayload(input, {
        prefs: createPrefs({
          "openai.apiKey": "real-looking-key",
        }),
        providerRegistry: createAIProviderRegistry(),
      });

      assert.equal(fetchCalled, false);
      assert.equal(payload.contract.status, "network-disabled");
      assert.equal(payload.result.status, "unavailable");
      assert.equal(payload.result.reason, "network-disabled");
      assert.equal(payload.result.networkUsed, false);
      assert.equal(payload.result.summary, "No-network summary preview: No Network TLDR");
      assert.equal(payload.requestPreview.consumer, "tldrPanel");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should render owner-tagged TLDR states and clean old roots", () => {
    const doc = createDoc();
    const body = createNode("body");
    const item = createItem({
      id: 1,
      title: "Rendered TLDR",
      fields: {
        abstractNote: "Rendered abstract preview text.",
      },
    });

    const loading = renderTLDRPanelSection({
      doc,
      body,
      item,
      loading: true,
    });
    assert.ok(collectText(loading).join(" ").includes("Preparing local TLDR preview"));

    const root = renderTLDRPanelSection({
      doc,
      body,
      item,
      prefs: createPrefs(),
      providerRegistry: createAIProviderRegistry(),
    });
    const text = collectText(root).join("\n");

    assert.equal(body.children.length, 1);
    assert.equal(allOwned(root), true);
    assert.equal(root.getAttribute("data-toolsbox-tldr-network-used"), "false");
    assert.equal(root.getAttribute("data-toolsbox-tldr-result-status"), "unavailable");
    assert.ok(text.includes("Rendered TLDR"));
    assert.ok(text.includes("Rendered abstract preview text."));
    assert.ok(text.includes("Provider unavailable"));
    assert.ok(text.includes("No-network summary preview: Rendered TLDR"));

    const empty = renderTLDRPanelSection({ doc, body, item: null });
    assert.equal(body.children.length, 1);
    assert.ok(collectText(empty).join(" ").includes("No item selected"));
  });

  it("should skip registration when Item Pane APIs are unavailable", () => {
    const feature = createTLDRPanel({
      logger: { warn() {} },
      zotero: {},
      prefs: createPrefs(),
    });

    assert.equal(feature.register(), false);
  });

  it("should register through itemPane and cleanup idempotently", () => {
    const registered = [];
    const unregistered = [];
    const feature = createTLDRPanel({
      logger: { debug() {}, warn() {} },
      itemPane: {
        registerSection(config) {
          registered.push(config);
          return "registered-tldr-panel";
        },
        unregisterSection(paneID) {
          unregistered.push(paneID);
        },
      },
      zotero: {},
      prefs: createPrefs(),
    });

    assert.equal(feature.register(), true);
    assert.equal(feature.register(), true);
    assert.equal(registered.length, 1);
    assert.equal(registered[0].paneID, "toolsbox-tldr-panel");
    assert.equal(typeof registered[0].onRender, "function");
    assert.equal(typeof registered[0].onAsyncRender, "function");

    feature.cleanup();
    feature.destroy();

    assert.deepEqual(unregistered, ["registered-tldr-panel"]);
  });

  it("should hydrate item metadata during async Item Pane rendering", async () => {
    const registered = [];
    const unloaded = createItem({ id: 1, title: "" });
    const hydrated = createItem({
      id: 1,
      title: "Hydrated TLDR",
      fields: {
        abstractNote: "Hydrated abstract",
      },
    });
    const zotero = createZotero([hydrated]);
    zotero.Items.getAsync = async (id) => {
      assert.equal(id, 1);
      return hydrated;
    };
    const feature = createTLDRPanel({
      logger: { debug() {}, warn() {} },
      itemPane: {
        registerSection(config) {
          registered.push(config);
          return "registered-tldr-panel";
        },
        unregisterSection() {},
      },
      zotero,
      prefs: createPrefs(),
    });
    const doc = createDoc();
    const body = createNode("body");

    assert.equal(feature.register(), true);
    registered[0].onRender({ doc, body, item: unloaded });
    assert.equal(collectText(body).join(" ").includes("Hydrated TLDR"), false);

    await registered[0].onAsyncRender({ doc, body, item: unloaded });

    assert.ok(collectText(body).join(" ").includes("Hydrated TLDR"));
    assert.ok(collectText(body).join(" ").includes("Hydrated abstract"));
  });

  it("should keep async rendering stable when Zotero item hydration rejects", async () => {
    const registered = [];
    const fallback = createItem({
      id: 1,
      title: "Fallback TLDR",
      fields: {
        abstractNote: "Fallback abstract",
      },
    });
    const zotero = createZotero([]);
    zotero.Items.getAsync = async () => {
      throw new Error("transient hydration failure");
    };
    const feature = createTLDRPanel({
      logger: { debug() {}, warn() {} },
      itemPane: {
        registerSection(config) {
          registered.push(config);
          return "registered-tldr-panel";
        },
        unregisterSection() {},
      },
      zotero,
      prefs: createPrefs(),
    });
    const doc = createDoc();
    const body = createNode("body");

    assert.equal(feature.register(), true);
    registered[0].onRender({ doc, body, item: fallback });
    await registered[0].onAsyncRender({ doc, body, item: fallback });

    assert.ok(collectText(body).join(" ").includes("Fallback TLDR"));
    assert.ok(collectText(body).join(" ").includes("Fallback abstract"));
  });
});

await runTestsIfMain(import.meta.url);
