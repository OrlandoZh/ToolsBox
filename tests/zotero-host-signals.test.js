import { describe, it, assert } from "./test-framework.js";
import { createZoteroHostSignals } from "../src/platform/zotero-host-signals.js";

describe("Zotero Host Signals", () => {
  it("should collect hashed host signal summary with best-effort realpath support", async () => {
    const collector = createZoteroHostSignals({
      globalScope: {
        crypto: globalThis.crypto,
        TextEncoder,
        PathUtils: {
          async realpath(path) {
            return String(path).replace("/Profiles/", "/ResolvedProfiles/");
          },
        },
      },
      zotero: {
        version: "9.0.0-beta.1",
        Profile: {
          dir: "/Users/test/Profiles/abcd1234.default-release",
        },
        DataDirectory: {
          dir: "/Users/test/Zotero",
        },
        Schema: {
          async getDBVersion(schema) {
            return schema === "userdata" ? 126 : null;
          },
        },
      },
    });

    const summary = await collector.init();
    assert.equal(summary.signalVersion, 1);
    assert.equal(summary.available, true);
    assert.equal(summary.schemaBucket, "120-129");
    assert.equal(summary.zoteroVersionBucket, "9.x");
    assert.typeOf(summary.profileHash, "string");
    assert.typeOf(summary.profileBasenameBucket, "string");
    assert.typeOf(summary.dataDirHash, "string");
    assert.ok(summary.profileHash.startsWith("sha256:"));
    assert.ok(summary.profileBasenameBucket.startsWith("sha256:"));
    assert.ok(summary.dataDirHash.startsWith("sha256:"));
    assert.equal(summary.collectionError, null);
    assert.equal(summary.profileHash.includes("abcd1234.default-release"), false);
  });

  it("should fall back to raw paths when realpath helpers are unavailable", async () => {
    const collector = createZoteroHostSignals({
      globalScope: {
        crypto: globalThis.crypto,
        TextEncoder,
      },
      zotero: {
        version: "9.1.2",
        Profile: {
          dir: "/Users/test/Profiles/dev.profile",
        },
        DataDirectory: {
          dir: "/Users/test/Zotero",
        },
        Schema: {
          schemaVersion: 133,
        },
      },
    });

    const summary = await collector.init();
    assert.equal(summary.available, true);
    assert.equal(summary.schemaBucket, "130-139");
    assert.equal(summary.zoteroVersionBucket, "9.x");
    assert.typeOf(summary.profileHash, "string");
    assert.typeOf(summary.dataDirHash, "string");
    assert.equal(summary.collectionError, null);
  });

  it("should preserve partial diagnostics when some host signals fail", async () => {
    const collector = createZoteroHostSignals({
      globalScope: {
        TextEncoder,
      },
      zotero: {
        version: "9.0.0",
        Profile: {
          get dir() {
            throw new Error("profile unavailable");
          },
        },
        Schema: {
          async getDBVersion() {
            throw new Error("schema unavailable");
          },
        },
      },
    });

    const summary = await collector.init();
    assert.equal(summary.available, true);
    assert.equal(summary.profileHash, null);
    assert.equal(summary.schemaBucket, null);
    assert.equal(summary.zoteroVersionBucket, "9.x");
    assert.ok(String(summary.collectionError).includes("profile:profile unavailable"));
    assert.ok(String(summary.collectionError).includes("schema:schema unavailable"));
    assert.equal(collector.getSummary().zoteroVersionBucket, "9.x");
  });
});
