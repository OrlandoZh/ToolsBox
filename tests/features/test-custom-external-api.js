import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  createAIProviderRegistry,
  createCustomExternalAPIProvider,
} from "../../src/services/ai-provider-contract.js";
import {
  buildCustomExternalAPIRequest,
  collectCustomExternalAPIInputForItem,
  createCustomExternalAPI,
  invokeCustomExternalAPI,
  renderCustomExternalAPISection,
} from "../../src/features/custom-external-api.js";

function createPrefs(values = {}) {
  return {
    values: new Map(Object.entries(values)),
    get(key) {
      return this.values.has(key) ? this.values.get(key) : null;
    },
    set(key, value) {
      this.values.set(key, value);
    },
  };
}

function createItem({
  id,
  key = "",
  title = "",
  itemType = "journalArticle",
  tags = [],
  fields = {},
} = {}) {
  return {
    id,
    key,
    title,
    itemType,
    tags,
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
    getTags() {
      return tags.map((tag) => ({ tag }));
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
  const listeners = new Map();
  const node = {
    tagName,
    children: [],
    dataset: {},
    attributes: {},
    className: "",
    textContent: "",
    parentNode: null,
    disabled: false,
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
    },
    getAttribute(name) {
      return this.attributes[name] || "";
    },
    addEventListener(event, listener) {
      listeners.set(event, listener);
    },
    async click() {
      const listener = listeners.get("click") || this.__toolsboxRun;
      if (listener) {
        await listener();
      }
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

function allOwned(node, owner = "toolsbox-custom-external-api") {
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

describe("Custom External API", () => {
  it("should collect only local item metadata and build an allowlisted request", () => {
    assert.equal(collectCustomExternalAPIInputForItem(null, {}).reason, "no-item");

    const item = createItem({
      id: 7,
      key: "API123",
      title: "Custom API Paper",
      tags: ["local", "api", "local"],
      fields: {
        abstractNote: "Only metadata should be included.",
        DOI: "10.1234/toolsbox",
        extra: "do not send",
        note: "do not send",
      },
    });
    const input = collectCustomExternalAPIInputForItem(item, {}, {
      endpoint: "http://127.0.0.1:49205/toolsbox",
    });
    const request = buildCustomExternalAPIRequest({
      ...input,
      annotations: ["do not send"],
      attachmentBytes: "do not send",
      notes: ["do not send"],
      fulltext: "do not send",
    }, {
      endpoint: "http://127.0.0.1:49205/toolsbox",
    });

    assert.equal(input.itemID, 7);
    assert.equal(input.key, "API123");
    assert.equal(input.doi, "10.1234/toolsbox");
    assert.deepEqual(input.tags, ["local", "api"]);
    assert.equal(request.schemaVersion, 1);
    assert.equal(request.capability, "invokeExternal");
    assert.equal(request.consumer, "customExternalAPI");
    assert.deepEqual(Object.keys(request.payload).sort(), [
      "abstract",
      "doi",
      "itemID",
      "itemType",
      "key",
      "requestPreview",
      "tags",
      "title",
    ]);
    assert.equal(request.payload.extra, undefined);
    assert.equal(request.payload.annotations, undefined);
    assert.equal(request.payload.attachmentBytes, undefined);
    assert.equal(request.payload.requestPreview.endpointHost, "127.0.0.1:49205");
  });

  it("should invoke the configured endpoint only through the custom provider", async () => {
    const calls = [];
    const provider = createCustomExternalAPIProvider({
      fetchImpl: async (url, options) => {
        calls.push({
          url,
          method: options.method,
          body: JSON.parse(options.body),
        });
        return {
          ok: true,
          status: 200,
          text: async () => "loopback response",
        };
      },
    });
    const registry = createAIProviderRegistry();
    registry.registerProvider(provider);

    const invocation = await invokeCustomExternalAPI({
      itemID: 9,
      key: "XYZ",
      title: "Endpoint Test",
      itemType: "journalArticle",
      abstract: "Metadata only",
      doi: "10.5555/test",
      tags: ["one"],
    }, {
      prefs: createPrefs({
        "customExternalAPI.enabled": true,
        "customExternalAPI.endpoint": "http://127.0.0.1:49206/toolsbox",
      }),
      providerRegistry: registry,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:49206/toolsbox");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].body.schemaVersion, 1);
    assert.equal(calls[0].body.payload.title, "Endpoint Test");
    assert.equal(invocation.result.ok, true);
    assert.equal(invocation.result.networkUsed, true);
    assert.equal(invocation.result.responsePreview, "loopback response");
  });

  it("should render owner-tagged shell, run button, response preview, and clean old roots", async () => {
    const doc = createDoc();
    const body = createNode("body");
    const item = createItem({
      id: 1,
      title: "Renderable Custom API",
      tags: ["render"],
      fields: {
        abstractNote: "Renderable abstract.",
      },
    });

    const loading = renderCustomExternalAPISection({
      doc,
      body,
      item,
      loading: true,
    });
    assert.ok(collectText(loading).join(" ").includes("Preparing local request preview"));

    const root = renderCustomExternalAPISection({
      doc,
      body,
      item,
      endpoint: "http://127.0.0.1:49207/toolsbox",
      onRun: async () => ({
        result: {
          ok: true,
          status: "success",
          httpStatus: 200,
          networkUsed: true,
          responsePreview: "{\"received\":true,\"requestCount\":1}",
        },
      }),
    });
    const text = collectText(root).join("\n");
    assert.equal(body.children.length, 1);
    assert.equal(allOwned(root), true);
    assert.ok(text.includes("Renderable Custom API"));
    assert.ok(text.includes("Endpoint: 127.0.0.1:49207"));
    assert.equal(root.getAttribute("data-toolsbox-custom-external-api-result-status"), "idle");

    const button = root.querySelector(".toolsbox-custom-external-api-run-button");
    assert.ok(button);
    await button.click();

    const updated = body.querySelector(".toolsbox-custom-external-api");
    const updatedText = collectText(updated).join("\n");
    assert.equal(body.children.length, 1);
    assert.equal(updated.getAttribute("data-toolsbox-custom-external-api-network-used"), "true");
    assert.equal(updated.getAttribute("data-toolsbox-custom-external-api-result-status"), "success");
    assert.ok(updatedText.includes("requestCount"));

    const empty = renderCustomExternalAPISection({ doc, body, item: null });
    assert.equal(body.children.length, 1);
    assert.ok(collectText(empty).join(" ").includes("No item selected"));
  });

  it("should register through itemPane and cleanup idempotently", () => {
    const registered = [];
    const unregistered = [];
    const feature = createCustomExternalAPI({
      logger: { warn() {}, debug() {} },
      zotero: createZotero(),
      prefs: createPrefs({
        "customExternalAPI.enabled": true,
        "customExternalAPI.endpoint": "http://127.0.0.1:49208/toolsbox",
      }),
      itemPane: {
        registerSection(section) {
          registered.push(section);
          return section.paneID;
        },
        unregisterSection(paneID) {
          unregistered.push(paneID);
        },
      },
    });

    assert.equal(feature.register(), true);
    assert.equal(feature.register(), true);
    assert.equal(registered.length, 1);
    assert.equal(registered[0].paneID, "toolsbox-custom-external-api");
    assert.equal(typeof registered[0].onRender, "function");
    assert.equal(typeof registered[0].onAsyncRender, "function");

    feature.cleanup();
    feature.destroy();
    assert.deepEqual(unregistered, ["toolsbox-custom-external-api"]);
  });

  it("should skip registration when Item Pane APIs are unavailable", () => {
    const feature = createCustomExternalAPI({
      logger: { warn() {} },
      zotero: {},
      prefs: createPrefs(),
    });

    assert.equal(feature.register(), false);
  });
});

await runTestsIfMain(import.meta.url);
