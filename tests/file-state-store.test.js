import fs from "fs";
import os from "os";
import path from "path";

import { describe, it, assert, beforeEach, afterEach } from "./test-framework.js";
import { createFileStateStore } from "../src/services/index.js";

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("File State Store", () => {
  let tempRoot = "";

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-file-state-store-"));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function createAdapter(filePath, counters = { writes: 0 }) {
    return {
      counters,
      readText: async () => {
        if (!fs.existsSync(filePath)) {
          return null;
        }
        return fs.readFileSync(filePath, "utf-8");
      },
      writeText: async (source) => {
        counters.writes += 1;
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, source, "utf-8");
      },
    };
  }

  it("should migrate legacy persisted state into the current schema envelope", async () => {
    const filePath = path.join(tempRoot, "history.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        savedAt: "2026-04-05T00:00:00.000Z",
        state: {
          entries: ["legacy"],
        },
      }),
      "utf-8",
    );

    const adapter = createAdapter(filePath);
    const store = createFileStateStore({
      id: "history.demo",
      schemaVersion: 2,
      initialState: () => ({ entries: [] }),
      readText: adapter.readText,
      writeText: adapter.writeText,
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
      entries: ["legacy", "migrated-from-1"],
    });
    assert.equal(store.getStatus().lastLoadedVersion, 1);
    assert.equal(persisted.schemaVersion, 2);
    assert.deepEqual(persisted.state, loaded);
  });

  it("should debounce successive updates and persist the latest cached state once", async () => {
    const filePath = path.join(tempRoot, "timeline.json");
    const adapter = createAdapter(filePath);
    const store = createFileStateStore({
      id: "timeline.demo",
      debounceMs: 20,
      initialState: () => ({ entries: [] }),
      readText: adapter.readText,
      writeText: adapter.writeText,
    });

    await store.init();
    await store.update((current) => ({
      entries: [...current.entries, "a"],
    }));
    await store.update((current) => ({
      entries: [...current.entries, "b"],
    }));

    assert.equal(adapter.counters.writes, 0);
    assert.equal(store.getStatus().dirty, true);
    await delay(50);

    const persisted = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    assert.equal(adapter.counters.writes, 1);
    assert.deepEqual(store.getState(), { entries: ["a", "b"] });
    assert.deepEqual(persisted.state, { entries: ["a", "b"] });
    assert.equal(store.getStatus().dirty, false);
  });

  it("should prune oversized state before persisting when a prune callback is provided", async () => {
    const filePath = path.join(tempRoot, "large.json");
    const adapter = createAdapter(filePath);
    const store = createFileStateStore({
      id: "large.demo",
      initialState: () => ({ entries: [] }),
      readText: adapter.readText,
      writeText: adapter.writeText,
      maxSerializedBytes: 240,
      async prune({ state }) {
        return {
          entries: state.entries.slice(-1),
        };
      },
    });

    await store.init();
    const nextState = await store.setState(
      {
        entries: ["x".repeat(120), "y".repeat(120)],
      },
      {
        flush: true,
      },
    );
    const persisted = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    assert.deepEqual(nextState, {
      entries: ["y".repeat(120)],
    });
    assert.deepEqual(persisted.state, {
      entries: ["y".repeat(120)],
    });
    assert.equal(store.getStatus().saveCount, 1);
  });

  it("should flush pending changes on dispose and clear the in-memory cache", async () => {
    const filePath = path.join(tempRoot, "dispose.json");
    const adapter = createAdapter(filePath);
    const store = createFileStateStore({
      id: "dispose.demo",
      debounceMs: 100,
      initialState: () => ({ entries: [] }),
      readText: adapter.readText,
      writeText: adapter.writeText,
    });

    await store.init();
    await store.setState({ entries: ["final"] });
    const disposed = await store.dispose();
    const persisted = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    assert.equal(disposed, true);
    assert.deepEqual(persisted.state, { entries: ["final"] });
    assert.equal(store.getStatus().status, "disposed");
    assert.equal(store.getState(), null);
  });
});
