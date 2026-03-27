import { describe, it, assert } from "./test-framework.js";
import { createResourceLoader } from "../src/services/index.js";

describe("Resource Loader", () => {
  it("should reuse the same init promise and support dispose", async () => {
    let loadCount = 0;
    const disposed = [];
    const loader = createResourceLoader({
      id: "wasm.demo",
      async load() {
        loadCount += 1;
        return { version: 1 };
      },
      async dispose(resource) {
        disposed.push(resource.version);
      },
    });

    const [a, b] = await Promise.all([loader.init(), loader.init()]);
    assert.equal(a.version, 1);
    assert.equal(b.version, 1);
    assert.equal(loadCount, 1);
    assert.equal(loader.isReady(), true);

    const didDispose = await loader.dispose();
    assert.equal(didDispose, true);
    assert.deepEqual(disposed, [1]);
    assert.equal(loader.getStatus().status, "disposed");
  });

  it("should recover from failed init and allow retry", async () => {
    let attempts = 0;
    const loader = createResourceLoader({
      id: "wasm.retry",
      async load() {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("boom");
        }
        return { ready: true };
      },
    });

    let errorMessage = "";
    try {
      await loader.init();
    }
    catch (error) {
      errorMessage = String(error.message || error);
    }
    assert.equal(errorMessage, "boom");
    assert.equal(loader.getStatus().status, "error");
    assert.equal(loader.getStatus().lastError, "boom");

    const resource = await loader.init();
    assert.equal(resource.ready, true);
    assert.equal(loader.getStatus().status, "ready");
    assert.equal(attempts, 2);
  });
});
