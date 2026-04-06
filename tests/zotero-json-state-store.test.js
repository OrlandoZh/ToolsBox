import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createZoteroJSONStateStore } from "../src/platform/zotero-json-state-store.js";

function createIOUtils() {
  return {
    async exists(targetPath) {
      return fs.existsSync(targetPath);
    },
    async makeDirectory(targetPath) {
      fs.mkdirSync(targetPath, { recursive: true });
    },
    async readUTF8(targetPath) {
      return fs.readFileSync(targetPath, "utf-8");
    },
    async writeUTF8(targetPath, source) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, source, "utf-8");
    },
  };
}

describe("Zotero JSON State Store", () => {
  let tempRoot = "";

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-zotero-json-state-store-"));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function createGlobalScope() {
    return {
      Zotero: {
        DataDirectory: {
          dir: tempRoot,
        },
      },
      PathUtils: {
        join: (...parts) => path.join(...parts),
      },
      IOUtils: createIOUtils(),
    };
  }

  it("should wire Zotero text storage into a JSON file state store", async () => {
    const store = createZoteroJSONStateStore({
      globalScope: createGlobalScope(),
      id: "history.demo",
      directorySegments: ["cleanroomtemplate", "state"],
      fileName: "history.json",
      initialState: () => ({ entries: [] }),
    });

    assert.equal(
      store.resolveFilePath(),
      path.join(tempRoot, "cleanroomtemplate", "state", "history.json"),
    );
    assert.equal(await store.exists(), false);

    const initialState = await store.init();
    const nextState = await store.update((current) => ({
      entries: [...current.entries, "first-entry"],
    }), {
      flush: true,
    });
    const persisted = JSON.parse(fs.readFileSync(store.resolveFilePath(), "utf-8"));

    assert.deepEqual(initialState, { entries: [] });
    assert.deepEqual(nextState, { entries: ["first-entry"] });
    assert.equal(await store.exists(), true);
    assert.deepEqual(store.getState(), { entries: ["first-entry"] });
    assert.deepEqual(persisted.state, { entries: ["first-entry"] });
    assert.equal(store.storage.resolveFilePath(), store.resolveFilePath());
  });

  it("should forward migration options to the underlying file state store", async () => {
    const filePath = path.join(tempRoot, "cleanroomtemplate", "state", "history.json");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        savedAt: "2026-04-05T00:00:00.000Z",
        state: {
          entries: ["legacy-entry"],
        },
      }),
      "utf-8",
    );

    const store = createZoteroJSONStateStore({
      globalScope: createGlobalScope(),
      id: "history.demo",
      directorySegments: ["cleanroomtemplate", "state"],
      fileName: "history.json",
      schemaVersion: 2,
      initialState: () => ({ entries: [] }),
      async migrate({ state, loadedVersion }) {
        return {
          entries: [...(state.entries || []), `migrated-from-${loadedVersion}`],
        };
      },
    });

    const loaded = await store.init();
    await store.flush();
    const persisted = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    assert.deepEqual(loaded, {
      entries: ["legacy-entry", "migrated-from-1"],
    });
    assert.equal(store.getStatus().lastLoadedVersion, 1);
    assert.equal(persisted.schemaVersion, 2);
    assert.deepEqual(persisted.state, loaded);
  });
});
