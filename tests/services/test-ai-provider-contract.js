import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  buildAIRequestPreview,
  createAIProviderRegistry,
  createCustomExternalAPIProvider,
  createNoNetworkAIProvider,
  normalizeAIProviderResult,
  normalizeProviderDescriptor,
  resolveAIProviderContract,
} from "../../src/services/ai-provider-contract.js";

function createPrefs(values = {}) {
  return {
    values: new Map(Object.entries(values)),
    get(key) {
      return this.values.has(key) ? this.values.get(key) : null;
    },
  };
}

function createItem(fields = {}) {
  return {
    getField(key) {
      return fields[key] || "";
    },
  };
}

describe("AI Provider Contract", () => {
  it("should normalize provider descriptors and reject unknown capabilities", () => {
    const descriptor = normalizeProviderDescriptor({
      id: "custom-provider",
      label: "Custom Provider",
      capabilities: ["summarizeItem", "unknown", "summarizeItem", "invokeExternal"],
      privacy: {
        networkAllowed: true,
        sendsContent: true,
        storesContent: false,
        policy: "remote-opt-in",
      },
    });

    assert.equal(descriptor.id, "custom-provider");
    assert.deepEqual(descriptor.capabilities, ["summarizeItem", "invokeExternal"]);
    assert.equal(descriptor.privacy.networkAllowed, true);
    assert.equal(descriptor.privacy.sendsContent, true);

    const unknown = normalizeProviderDescriptor({
      capabilities: ["not-real"],
    });
    assert.equal(unknown.id, "noop/mock-local");
    assert.deepEqual(unknown.capabilities, []);
  });

  it("should build local request previews without requiring a request body", () => {
    const preview = buildAIRequestPreview(
      createItem({
        title: "Local AI Contract Paper",
        abstractNote: "This is a deterministic abstract used only for a local preview.",
        itemType: "journalArticle",
      }),
      {
        capability: "summarizeItem",
        consumer: "tldrPanel",
        endpoint: "https://api.example.test/v1/summarize",
      },
    );

    assert.equal(preview.capability, "summarizeItem");
    assert.equal(preview.consumer, "tldrPanel");
    assert.equal(preview.title, "Local AI Contract Paper");
    assert.equal(preview.hasAbstract, true);
    assert.equal(preview.abstractLength > 0, true);
    assert.equal(preview.endpointConfigured, true);
    assert.equal(preview.endpointHost, "api.example.test");
    assert.equal(preview.networkAllowed, false);
    assert.deepEqual(preview.contentFields, ["title", "abstract"]);
  });

  it("should keep the no-network provider deterministic and fetch-free", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = () => {
      fetchCalled = true;
      throw new Error("fetch must not be called by the no-network provider");
    };

    try {
      const provider = createNoNetworkAIProvider();
      const summary = await provider.summarizeItem({
        title: "No Network",
        abstract: "Local only",
      });
      const external = await provider.invokeExternal({
        title: "External",
        endpoint: "https://example.test/api",
      });

      assert.equal(fetchCalled, false);
      assert.equal(summary.ok, false);
      assert.equal(summary.status, "unavailable");
      assert.equal(summary.reason, "network-disabled");
      assert.equal(summary.mock, true);
      assert.equal(summary.summary, "No-network summary preview: No Network");
      assert.equal(external.reason, "network-disabled");
      assert.equal(external.response.endpointHost, "example.test");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should resolve TLDR and Custom External API contracts as unavailable under no-network policy", () => {
    const prefs = createPrefs({
      "openai.apiKey": "real-looking-key",
      "openai.baseUrl": "https://api.openai.example/v1",
      "customExternalAPI.endpoint": "",
    });
    const registry = createAIProviderRegistry();

    const tldr = resolveAIProviderContract({
      prefs,
      registry,
      requestedCapability: "summarizeItem",
      networkPolicy: "no-network",
    });
    const external = resolveAIProviderContract({
      prefs,
      registry,
      requestedCapability: "invokeExternal",
      networkPolicy: "no-network",
    });
    const externalResult = external.invoke({ title: "No endpoint" });

    assert.equal(tldr.available, false);
    assert.equal(tldr.canInvoke, false);
    assert.equal(tldr.status, "network-disabled");
    assert.equal(tldr.providerID, "noop/mock-local");
    assert.equal(tldr.descriptor.privacy.networkAllowed, false);
    assert.equal(external.available, false);
    assert.equal(external.endpointConfigured, false);
    assert.equal(externalResult.reason, "endpoint-missing");
  });

  it("should enable Custom External API only under explicit allow-network prefs", async () => {
    const calls = [];
    const provider = createCustomExternalAPIProvider({
      fetchImpl: async (url, options) => {
        calls.push({
          url,
          method: options.method,
          headers: options.headers,
          body: JSON.parse(options.body),
        });
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            received: true,
            requestCount: calls.length,
          }),
        };
      },
    });
    const registry = createAIProviderRegistry();
    registry.registerProvider(provider);
    const prefs = createPrefs({
      "customExternalAPI.enabled": true,
      "customExternalAPI.endpoint": "http://127.0.0.1:49201/toolsbox",
    });
    const contract = resolveAIProviderContract({
      prefs,
      registry,
      requestedCapability: "invokeExternal",
      networkPolicy: "allow-network",
    });

    assert.equal(contract.available, true);
    assert.equal(contract.canInvoke, true);
    assert.equal(contract.providerID, "custom/external-api");
    assert.equal(contract.networkAllowed, true);

    const result = await contract.invoke({
      itemID: 42,
      key: "ABC123",
      title: "External API Paper",
      abstract: "Metadata only",
      itemType: "journalArticle",
      tags: ["api", "api", "local"],
    }, {
      request: {
        schemaVersion: 1,
        capability: "invokeExternal",
        consumer: "customExternalAPI",
        payload: {
          title: "External API Paper",
        },
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].body.schemaVersion, 1);
    assert.equal(calls[0].body.capability, "invokeExternal");
    assert.equal(result.ok, true);
    assert.equal(result.status, "success");
    assert.equal(result.httpStatus, 200);
    assert.equal(result.networkUsed, true);
    assert.equal(result.mock, false);
    assert.ok(result.responsePreview.includes("requestCount"));
  });

  it("should guard Custom External API missing, invalid, disabled, timeout, and fetch-error states", async () => {
    const disabled = resolveAIProviderContract({
      prefs: createPrefs({
        "customExternalAPI.enabled": false,
        "customExternalAPI.endpoint": "http://127.0.0.1:49202/toolsbox",
      }),
      registry: createAIProviderRegistry(),
      requestedCapability: "invokeExternal",
      networkPolicy: "allow-network",
    });
    const missing = resolveAIProviderContract({
      prefs: createPrefs({
        "customExternalAPI.enabled": true,
        "customExternalAPI.endpoint": "",
      }),
      registry: createAIProviderRegistry(),
      requestedCapability: "invokeExternal",
      networkPolicy: "allow-network",
    });
    const invalid = resolveAIProviderContract({
      prefs: createPrefs({
        "customExternalAPI.enabled": true,
        "customExternalAPI.endpoint": "not-a-url",
      }),
      registry: createAIProviderRegistry(),
      requestedCapability: "invokeExternal",
      networkPolicy: "allow-network",
    });

    assert.equal(disabled.reason, "pref-disabled");
    assert.equal(disabled.canInvoke, false);
    assert.equal(missing.reason, "endpoint-missing");
    assert.equal(invalid.reason, "invalid-endpoint");

    const timeoutProvider = createCustomExternalAPIProvider({
      timeoutMs: 1,
      fetchImpl: async () => new Promise(() => {}),
    });
    const timeout = await timeoutProvider.invokeExternal(
      { title: "Timeout" },
      {
        endpoint: "http://127.0.0.1:49203/toolsbox",
        networkPolicy: "allow-network",
      },
    );
    assert.equal(timeout.reason, "timeout");
    assert.equal(timeout.networkUsed, false);

    const errorProvider = createCustomExternalAPIProvider({
      fetchImpl: async () => {
        throw new Error("loopback unavailable");
      },
    });
    const fetchError = await errorProvider.invokeExternal(
      { title: "Fetch Error" },
      {
        endpoint: "http://127.0.0.1:49204/toolsbox",
        networkPolicy: "allow-network",
      },
    );
    assert.equal(fetchError.reason, "fetch-error");
    assert.ok(fetchError.error.includes("loopback unavailable"));
  });

  it("should normalize disabled results for future consumers", () => {
    const result = normalizeAIProviderResult({
      status: "disabled",
      providerID: "custom",
      capability: "summarizeItem",
      reason: "provider-disabled",
      networkUsed: true,
      mock: true,
      summary: "Ignored",
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "disabled");
    assert.equal(result.reason, "provider-disabled");
    assert.equal(result.networkUsed, false);
    assert.equal(result.mock, true);
    assert.equal(result.summary, "Ignored");
  });
});

await runTestsIfMain(import.meta.url);
