import { describe, it, assert } from "./test-framework.js";
import {
  createWasmModuleLoader,
  fetchWasmBytes,
  instantiateWasmModule,
  resolveWasmAssetURL,
} from "../src/services/index.js";

const MINIMAL_WASM_RUN_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d,
  0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
  0x03, 0x02, 0x01, 0x00,
  0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x00,
  0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x07, 0x0b,
]);

function createArrayBufferResponse(bytes, overrides = {}) {
  return {
    ok: true,
    status: 200,
    async arrayBuffer() {
      return bytes.slice().buffer;
    },
    ...overrides,
  };
}

describe("Wasm Loader", () => {
  it("should resolve plugin-private wasm URLs from rootURI", () => {
    assert.equal(
      resolveWasmAssetURL("jar:file:///tmp/cleanroom.xpi!/", "wasm/probe.wasm"),
      "jar:file:///tmp/cleanroom.xpi!/wasm/probe.wasm",
    );
    assert.equal(
      resolveWasmAssetURL("chrome://cleanroomtemplate/", "/content/lib/w/probe.wasm"),
      "chrome://cleanroomtemplate/content/lib/w/probe.wasm",
    );
    assert.equal(
      resolveWasmAssetURL("", "wasm/probe.wasm"),
      "wasm/probe.wasm",
    );
  });

  it("should fetch wasm bytes and instantiate a minimal module", async () => {
    const bytes = await fetchWasmBytes({
      fetchImpl: async (url) => {
        assert.equal(url, "jar:file:///tmp/cleanroom.xpi!/wasm/probe.wasm");
        return createArrayBufferResponse(MINIMAL_WASM_RUN_BYTES);
      },
      url: "jar:file:///tmp/cleanroom.xpi!/wasm/probe.wasm",
    });

    assert.equal(bytes.byteLength, MINIMAL_WASM_RUN_BYTES.byteLength);

    const moduleResource = await instantiateWasmModule({ bytes });
    assert.equal(typeof moduleResource.exports.run, "function");
    assert.equal(moduleResource.exports.run(), 7);
  });

  it("should reuse init and expose the resolved wasm metadata", async () => {
    let fetchCount = 0;
    const loader = createWasmModuleLoader({
      id: "wasm.demo",
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      relativePath: "wasm/probe.wasm",
      fetchImpl: async () => {
        fetchCount += 1;
        return createArrayBufferResponse(MINIMAL_WASM_RUN_BYTES);
      },
    });

    const [a, b] = await Promise.all([loader.init(), loader.init()]);
    assert.equal(fetchCount, 1);
    assert.equal(a.url, "jar:file:///tmp/cleanroom.xpi!/wasm/probe.wasm");
    assert.equal(a.bytesLength, MINIMAL_WASM_RUN_BYTES.byteLength);
    assert.equal(a.exports.run(), 7);
    assert.equal(b.exports.run(), 7);
    assert.equal(loader.isReady(), true);
  });

  it("should support context overrides and custom dispose", async () => {
    const disposed = [];
    const loader = createWasmModuleLoader({
      id: "wasm.dispose",
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      relativePath: "wasm/probe.wasm",
      fetchImpl: async (url) => {
        assert.equal(url, "jar:file:///override.xpi!/wasm/override.wasm");
        return createArrayBufferResponse(MINIMAL_WASM_RUN_BYTES);
      },
      disposeInstance(resource) {
        disposed.push(resource.url);
      },
    });

    const resource = await loader.init({
      rootURI: "jar:file:///override.xpi!/",
      relativePath: "wasm/override.wasm",
    });

    assert.equal(resource.url, "jar:file:///override.xpi!/wasm/override.wasm");
    const didDispose = await loader.dispose();
    assert.equal(didDispose, true);
    assert.deepEqual(disposed, ["jar:file:///override.xpi!/wasm/override.wasm"]);
  });

  it("should recover after a failed wasm fetch and allow retry", async () => {
    let attempts = 0;
    const loader = createWasmModuleLoader({
      id: "wasm.retry",
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      relativePath: "wasm/probe.wasm",
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) {
          return createArrayBufferResponse(MINIMAL_WASM_RUN_BYTES, {
            ok: false,
            status: 404,
          });
        }
        return createArrayBufferResponse(MINIMAL_WASM_RUN_BYTES);
      },
    });

    let firstError = "";
    try {
      await loader.init();
    }
    catch (error) {
      firstError = String(error.message || error);
    }

    assert.equal(firstError, "failed to fetch wasm bytes: 404");
    assert.equal(loader.getStatus().status, "error");

    const resource = await loader.init();
    assert.equal(resource.exports.run(), 7);
    assert.equal(loader.getStatus().status, "ready");
    assert.equal(attempts, 2);
  });
});
