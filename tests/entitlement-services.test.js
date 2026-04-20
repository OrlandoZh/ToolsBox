import { describe, it, assert } from "./test-framework.js";
import { createZoteroEntitlementCacheStore } from "../src/platform/zotero-entitlement-cache-store.js";
import {
  createEntitlementControlPlane,
  createEntitlementIdentityProvider,
  createEntitlementLegacyAdapter,
} from "../src/services/index.js";

function createFakeEntitlementDB() {
  const records = new Map();
  return {
    async tableExists() {
      return records.size > 0;
    },
    async queryAsync(sql, params = []) {
      if (/CREATE TABLE/u.test(sql)) {
        return;
      }
      if (/INSERT OR REPLACE/u.test(sql)) {
        records.set(params[0], {
          cacheFingerprint: params[0],
          hostBindingDigest: params[1],
          validationSource: params[2],
          gateSatisfied: params[3],
          compactGateHex: params[4],
          lastValidatedAt: params[5],
          expiresAt: params[6],
        });
      }
    },
    async valueQueryAsync(_sql, params = []) {
      const record = records.get(params[0]);
      if (!record) {
        return null;
      }
      return [
        record.hostBindingDigest || "",
        record.validationSource || "",
        record.gateSatisfied ? "1" : "0",
        record.compactGateHex || "",
        record.lastValidatedAt || "",
        record.expiresAt || "",
      ].join(String.fromCharCode(31));
    },
    async executeTransaction(work) {
      return await work();
    },
  };
}

describe("Entitlement Services", () => {
  it("should resolve the default Zotero user identity and support custom providers", async () => {
    const provider = createEntitlementIdentityProvider({
      zotero: {
        Users: {
          getCurrentUserID() {
            return 1234;
          },
        },
      },
    });

    assert.deepEqual(await provider.resolve(), {
      ok: true,
      kind: "zotero-user-id",
      value: "1234",
      failureKind: null,
    });

    const customProvider = createEntitlementIdentityProvider({
      kind: "custom",
      resolver() {
        return {
          ok: true,
          kind: "custom",
          value: "acct-1",
        };
      },
    });
    assert.equal((await customProvider.resolve()).value, "acct-1");

    const unsupported = createEntitlementIdentityProvider({
      kind: "unsupported",
      zotero: {},
    });
    assert.equal((await unsupported.resolve()).failureKind, "unsupported-identity-kind");
  });

  it("should read, write, and expire the route4 sqlite cache record", async () => {
    const now = Date.parse("2026-04-20T00:00:00.000Z");
    const store = createZoteroEntitlementCacheStore({
      addonRef: "cleanroomtemplate",
      zotero: {
        DB: createFakeEntitlementDB(),
      },
    });

    assert.equal(await store.readFresh("fp-1", now), null);
    assert.equal(await store.write({
      cacheFingerprint: "fp-1",
      hostBindingDigest: "hb-1",
      validationSource: "fresh-network",
      gateSatisfied: true,
      compactGateHex: "1234abcd",
      lastValidatedAt: "2026-04-20T00:00:00.000Z",
      expiresAt: "2026-04-21T00:00:00.000Z",
    }), true);

    const fresh = await store.readFresh("fp-1", now);
    assert.equal(fresh.gateSatisfied, true);
    assert.equal(fresh.compactGateHex, "1234abcd");
    assert.equal(store.getSummary().cacheFresh, true);

    assert.equal(await store.readFresh("fp-1", Date.parse("2026-04-22T00:00:00.000Z")), null);
    assert.equal(store.getSummary().cacheFresh, false);
  });

  it("should adapt legacy request and response through the wasm probe facade", async () => {
    const adapter = createEntitlementLegacyAdapter({
      endpoint: "https://example.invalid/legacy",
      secret: "secret",
    });
    const wasmKernelProbe = {
      async prepareLegacyEntitlementRequest() {
        return {
          requestFields: {
            username: "42",
            serial: "abc",
          },
          cacheFingerprint: "fp-1",
          hostBindingDigest: "hb-1",
          requestDigestHex: "11111111",
          compactGateHex: "22222222",
        };
      },
      async evaluateLegacyEntitlementResponse() {
        return {
          gateSatisfied: true,
          compactGateHex: "22222222",
          validationDigestHex: "33333333",
          cacheFingerprint: "fp-1",
          hostBindingDigest: "hb-1",
        };
      },
    };

    const prepared = await adapter.prepareRequest({
      identity: {
        kind: "zotero-user-id",
        value: "42",
      },
      hostBinding: {},
      wasmKernelProbe,
    });
    assert.equal(prepared.endpoint, "https://example.invalid/legacy");
    assert.deepEqual(adapter.buildHTTPPayload(prepared), {
      username: "42",
      serial: "abc",
    });

    const evaluated = await adapter.evaluateResponse({
      identity: {
        kind: "zotero-user-id",
        value: "42",
      },
      hostBinding: {},
      responsePayload: {
        link: "token",
      },
      wasmKernelProbe,
    });
    assert.equal(evaluated.gateSatisfied, true);
    assert.equal(evaluated.validationDigestHex, "33333333");
  });

  it("should resolve cache-hit and network degrade paths without exposing raw backend data", async () => {
    const identityProvider = createEntitlementIdentityProvider({
      resolver() {
        return {
          ok: true,
          kind: "zotero-user-id",
          value: "42",
        };
      },
    });
    const adapter = createEntitlementLegacyAdapter({
      endpoint: "https://example.invalid/legacy",
      secret: "secret",
    });
    const cacheStore = {
      getSummary() {
        return {
          cacheAvailable: true,
          cacheFresh: true,
          validationSource: "cache",
          gateSatisfied: true,
          compactGateHex: "aaaaaaaa",
          lastValidatedAt: "2026-04-20T00:00:00.000Z",
          expiresAt: "2026-04-21T00:00:00.000Z",
        };
      },
      async readFresh() {
        return {
          gateSatisfied: true,
          compactGateHex: "aaaaaaaa",
          lastValidatedAt: "2026-04-20T00:00:00.000Z",
          expiresAt: "2026-04-21T00:00:00.000Z",
        };
      },
      async write() {
        return true;
      },
    };
    const wasmKernelProbe = {
      async prepareLegacyEntitlementRequest() {
        return {
          requestFields: {
            username: "42",
            serial: "abc",
          },
          cacheFingerprint: "fp-1",
          hostBindingDigest: "hb-1",
          compactGateHex: "aaaaaaaa",
        };
      },
      async evaluateLegacyEntitlementResponse() {
        return {
          gateSatisfied: false,
          compactGateHex: "bbbbbbbb",
          cacheFingerprint: "fp-1",
          hostBindingDigest: "hb-1",
          failureKind: "gate-mismatch",
        };
      },
    };
    let httpCalls = 0;
    const controlPlane = createEntitlementControlPlane({
      config: {
        enabled: true,
        identityKind: "zotero-user-id",
        cacheTTLMS: 86400000,
      },
      http: {
        async postJSON() {
          httpCalls += 1;
          return {
            link: "token",
          };
        },
      },
      identityProvider,
      adapter,
      cacheStore,
      getHostBinding() {
        return {};
      },
      getWasmKernelProbe() {
        return wasmKernelProbe;
      },
      now() {
        return Date.parse("2026-04-20T00:00:00.000Z");
      },
    });

    const cached = await controlPlane.resolve();
    assert.equal(cached.status, "cache-hit");
    assert.equal(cached.gateSatisfied, true);
    assert.equal(httpCalls, 0);
    assert.equal(Object.prototype.hasOwnProperty.call(cached, "endpoint"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(cached, "secret"), false);

    const refreshed = await controlPlane.resolve({
      forceRefresh: true,
    });
    assert.equal(refreshed.status, "degraded");
    assert.equal(refreshed.gateSatisfied, false);
    assert.equal(refreshed.failureKind, "gate-mismatch");
    assert.equal(httpCalls, 1);
  });
});
