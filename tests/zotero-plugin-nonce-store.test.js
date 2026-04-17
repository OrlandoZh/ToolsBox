import { describe, it, assert } from "./test-framework.js";
import { createZoteroPluginNonceStore } from "../src/platform/zotero-plugin-nonce-store.js";

function createFakeDB(seedNonce = null) {
  let tableExists = Boolean(seedNonce);
  const rows = new Map();
  if (seedNonce) {
    rows.set("profile", {
      nonce: seedNonce,
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    });
  }

  return {
    async tableExists() {
      return tableExists;
    },
    async executeTransaction(fn) {
      return fn();
    },
    async queryAsync(sql, params = []) {
      const normalizedSQL = String(sql || "").trim();
      if (normalizedSQL.startsWith("CREATE TABLE IF NOT EXISTS")) {
        tableExists = true;
        return [];
      }
      if (normalizedSQL.startsWith("INSERT INTO")) {
        tableExists = true;
        rows.set(String(params[0]), {
          nonce: String(params[1]),
          createdAt: String(params[2]),
          updatedAt: String(params[3]),
        });
        return [];
      }
      if (normalizedSQL.startsWith("UPDATE")) {
        const current = rows.get(String(params[2])) || {};
        rows.set(String(params[2]), {
          ...current,
          nonce: String(params[0]),
          updatedAt: String(params[1]),
        });
        return [];
      }
      throw new Error(`Unexpected queryAsync SQL: ${normalizedSQL}`);
    },
    async valueQueryAsync(sql, params = []) {
      const normalizedSQL = String(sql || "").trim();
      if (normalizedSQL.startsWith("SELECT nonce FROM")) {
        return rows.get(String(params[0]))?.nonce || null;
      }
      throw new Error(`Unexpected valueQueryAsync SQL: ${normalizedSQL}`);
    },
  };
}

describe("Zotero Plugin Nonce Store", () => {
  it("should create a nonce when the plugin-owned table is missing", async () => {
    const store = createZoteroPluginNonceStore({
      globalScope: {
        crypto: globalThis.crypto,
        TextEncoder,
      },
      zotero: {
        DB: createFakeDB(),
      },
      addonRef: "cleanroomtemplate",
    });

    const nonce = await store.getOrCreateNonce();
    const summary = store.getSummary();
    assert.typeOf(nonce, "string");
    assert.equal(summary.dbAvailable, true);
    assert.equal(summary.noncePresent, true);
    assert.equal(summary.nonceSource, "created");
    assert.typeOf(summary.nonceHash, "string");
    assert.equal(summary.storeError, null);
  });

  it("should reuse an existing nonce for the same profile store", async () => {
    const store = createZoteroPluginNonceStore({
      globalScope: {
        crypto: globalThis.crypto,
        TextEncoder,
      },
      zotero: {
        DB: createFakeDB("existing-nonce"),
      },
      addonRef: "cleanroomtemplate",
    });

    const nonce = await store.getOrCreateNonce();
    const summary = store.getSummary();
    assert.equal(nonce, "existing-nonce");
    assert.equal(summary.dbAvailable, true);
    assert.equal(summary.noncePresent, true);
    assert.equal(summary.nonceSource, "existing");
    assert.typeOf(summary.nonceHash, "string");
  });

  it("should reset the stored nonce on demand", async () => {
    const store = createZoteroPluginNonceStore({
      globalScope: {
        crypto: globalThis.crypto,
        TextEncoder,
      },
      zotero: {
        DB: createFakeDB("existing-nonce"),
      },
      addonRef: "cleanroomtemplate",
    });

    const before = await store.getOrCreateNonce();
    const after = await store.resetNonce();
    const summary = store.getSummary();
    assert.equal(before === after, false);
    assert.equal(summary.dbAvailable, true);
    assert.equal(summary.noncePresent, true);
    assert.equal(summary.nonceSource, "reset");
    assert.typeOf(summary.nonceHash, "string");
  });

  it("should degrade to unavailable when Zotero.DB is missing", async () => {
    const store = createZoteroPluginNonceStore({
      globalScope: {
        crypto: globalThis.crypto,
        TextEncoder,
      },
      zotero: {},
      addonRef: "cleanroomtemplate",
    });

    const nonce = await store.getOrCreateNonce();
    const summary = store.getSummary();
    assert.equal(nonce, null);
    assert.equal(summary.dbAvailable, false);
    assert.equal(summary.noncePresent, false);
    assert.equal(summary.nonceSource, "unavailable");
    assert.equal(summary.nonceHash, null);
    assert.match(summary.storeError, /Zotero\.DB is unavailable/u);
  });
});
