import { describe, it, assert } from "./test-framework.js";
import { createWasmWorkerController } from "../src/services/index.js";

function createFakeWorkerCtor({ onCreate } = {}) {
  return class FakeWorker {
    constructor(url) {
      this.url = url;
      this.onmessage = null;
      this.onerror = null;
      this.terminated = false;
      this.sent = [];
      if (typeof onCreate === "function") {
        onCreate(this);
      }
    }

    postMessage(message) {
      this.sent.push(message);
      if (message?.type === "INIT") {
        queueMicrotask(() => {
          this.onmessage?.({ data: { type: "READY" } });
        });
        return;
      }
      if (Object.prototype.hasOwnProperty.call(message || {}, "requestID")) {
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              type: "RESULT",
              requestID: message.requestID,
              echoedPayload: message.payload || null,
            },
          });
        });
      }
    }

    terminate() {
      this.terminated = true;
    }
  };
}

describe("Wasm Worker", () => {
  it("should create a worker from rootURI and post init with wasm path", async () => {
    let createdWorker = null;
    const controller = createWasmWorkerController({
      id: "wasm.worker",
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      workerRelativePath: "worker/wasm-probe-worker.js",
      wasmRelativePath: "wasm/probe.wasm",
      WorkerCtor: createFakeWorkerCtor({
        onCreate(worker) {
          createdWorker = worker;
        },
      }),
    });

    const resource = await controller.init();
    assert.equal(resource.workerURL, "jar:file:///tmp/cleanroom.xpi!/worker/wasm-probe-worker.js");
    assert.equal(resource.wasmRelativePath, "wasm/probe.wasm");
    assert.equal(resource.isReady(), true);
    assert.equal(createdWorker.sent[0].type, "INIT");
    assert.equal(createdWorker.sent[0].rootURI, "jar:file:///tmp/cleanroom.xpi!/");
    assert.equal(createdWorker.sent[0].wasmRelativePath, "wasm/probe.wasm");
  });

  it("should support request-response messaging after init", async () => {
    const controller = createWasmWorkerController({
      id: "wasm.worker.request",
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      workerRelativePath: "worker/wasm-probe-worker.js",
      wasmRelativePath: "wasm/probe.wasm",
      WorkerCtor: createFakeWorkerCtor(),
    });

    const resource = await controller.init();
    const response = await resource.request("RUN_KDF", { input: "abc" });
    assert.equal(response.type, "RESULT");
    assert.deepEqual(response.echoedPayload, { input: "abc" });
  });

  it("should reject when worker reports init failure and allow retry", async () => {
    let attempts = 0;
    class RetryWorker {
      constructor(url) {
        this.url = url;
        this.onmessage = null;
        this.onerror = null;
      }

      postMessage(message) {
        if (message?.type !== "INIT") {
          return;
        }
        attempts += 1;
        queueMicrotask(() => {
          if (attempts === 1) {
            this.onmessage?.({ data: { type: "ERROR", message: "worker init failed" } });
            return;
          }
          this.onmessage?.({ data: { type: "READY" } });
        });
      }

      terminate() {}
    }

    const controller = createWasmWorkerController({
      id: "wasm.worker.retry",
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      workerRelativePath: "worker/wasm-probe-worker.js",
      wasmRelativePath: "wasm/probe.wasm",
      WorkerCtor: RetryWorker,
    });

    let firstError = "";
    try {
      await controller.init();
    }
    catch (error) {
      firstError = String(error.message || error);
    }
    assert.equal(firstError, "worker init failed");

    const resource = await controller.init();
    assert.equal(resource.isReady(), true);
    assert.equal(attempts, 2);
  });

  it("should terminate the worker on dispose", async () => {
    let createdWorker = null;
    const controller = createWasmWorkerController({
      id: "wasm.worker.dispose",
      rootURI: "jar:file:///tmp/cleanroom.xpi!/",
      workerRelativePath: "worker/wasm-probe-worker.js",
      wasmRelativePath: "wasm/probe.wasm",
      WorkerCtor: createFakeWorkerCtor({
        onCreate(worker) {
          createdWorker = worker;
        },
      }),
    });

    await controller.init();
    const didDispose = await controller.dispose();
    assert.equal(didDispose, true);
    assert.equal(createdWorker.terminated, true);
  });
});
