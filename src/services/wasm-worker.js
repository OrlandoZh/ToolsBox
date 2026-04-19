import { createResourceLoader } from "./resource-loader.js";
import { resolveWasmAssetURL } from "./wasm-loader.js";

function toNonEmptyString(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function toTransferList(value) {
  return Array.isArray(value) ? value : [];
}

function toErrorMessage(error) {
  if (!error) {
    return "unknown worker error";
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error.message || error);
}

export function createWasmWorkerController({
  id,
  label,
  rootURI = "",
  workerRelativePath = "",
  wasmRelativePath = "",
  WorkerCtor = globalThis.ChromeWorker || globalThis.Worker,
  initType = "INIT",
  readyType = "READY",
  errorType = "ERROR",
  buildInitMessage,
  logger,
} = {}) {
  const defaultWorkerRelativePath = toNonEmptyString(workerRelativePath, "worker relativePath");
  const defaultWasmRelativePath = toNonEmptyString(wasmRelativePath, "wasm relativePath");

  return createResourceLoader({
    id,
    label,
    logger,
    async load(context = {}) {
      const effectiveRootURI = Object.prototype.hasOwnProperty.call(context, "rootURI")
        ? context.rootURI
        : rootURI;
      const effectiveWorkerRelativePath = Object.prototype.hasOwnProperty.call(context, "workerRelativePath")
        ? context.workerRelativePath
        : defaultWorkerRelativePath;
      const effectiveWasmRelativePath = Object.prototype.hasOwnProperty.call(context, "wasmRelativePath")
        ? context.wasmRelativePath
        : defaultWasmRelativePath;
      const effectiveWorkerCtor = Object.prototype.hasOwnProperty.call(context, "WorkerCtor")
        ? context.WorkerCtor
        : WorkerCtor;

      if (typeof effectiveWorkerCtor !== "function") {
        throw new Error("worker constructor is required");
      }

      const workerURL = resolveWasmAssetURL(effectiveRootURI, effectiveWorkerRelativePath);
      const worker = new effectiveWorkerCtor(workerURL);

      const readyDeferred = createDeferred();
      const pendingRequests = new Map();
      let ready = false;
      let nextRequestID = 1;

      function rejectAllPending(error) {
        for (const pending of pendingRequests.values()) {
          if (pending.timeoutID) {
            clearTimeout(pending.timeoutID);
          }
          pending.reject(error);
        }
        pendingRequests.clear();
      }

      function terminate() {
        rejectAllPending(new Error("worker terminated"));
        if (typeof worker.terminate === "function") {
          worker.terminate();
        }
      }

      function attachTimeout(requestID, timeoutMs, reject) {
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
          return null;
        }
        return setTimeout(() => {
          pendingRequests.delete(requestID);
          reject(new Error(`worker request timed out: ${requestID}`));
        }, timeoutMs);
      }

      function handleMessage(event) {
        const data = event?.data ?? event;
        if (!data || typeof data !== "object") {
          return;
        }

        if (!ready) {
          if (data.type === readyType) {
            ready = true;
            readyDeferred.resolve(data);
            return;
          }
          if (data.type === errorType) {
            readyDeferred.reject(new Error(String(data.message || "worker init failed")));
            return;
          }
        }

        if (!Object.prototype.hasOwnProperty.call(data, "requestID")) {
          return;
        }

        const requestID = data.requestID;
        const pending = pendingRequests.get(requestID);
        if (!pending) {
          return;
        }
        pendingRequests.delete(requestID);
        if (pending.timeoutID) {
          clearTimeout(pending.timeoutID);
        }

        if (data.type === errorType || data.ok === false) {
          pending.reject(new Error(String(data.message || `worker request failed: ${requestID}`)));
          return;
        }

        pending.resolve(data);
      }

      function handleError(error) {
        const normalizedError = new Error(toErrorMessage(error));
        if (!ready) {
          readyDeferred.reject(normalizedError);
        }
        rejectAllPending(normalizedError);
      }

      worker.onmessage = handleMessage;
      worker.onerror = handleError;

      function postMessage(message, transferList = []) {
        if (typeof worker.postMessage !== "function") {
          throw new Error("worker does not support postMessage");
        }
        const normalizedTransferList = toTransferList(transferList);
        if (normalizedTransferList.length > 0) {
          worker.postMessage(message, normalizedTransferList);
          return;
        }
        worker.postMessage(message);
      }

      function request(type, payload = {}, options = {}) {
        const normalizedType = toNonEmptyString(type, "worker request type");
        const requestID = nextRequestID;
        nextRequestID += 1;

        return new Promise((resolve, reject) => {
          const timeoutID = attachTimeout(requestID, options.timeoutMs, reject);
          pendingRequests.set(requestID, { resolve, reject, timeoutID });
          postMessage({
            type: normalizedType,
            requestID,
            payload,
          }, options.transferList);
        });
      }

      const initMessage = typeof buildInitMessage === "function"
        ? buildInitMessage({
          ...context,
          rootURI: effectiveRootURI,
          workerRelativePath: effectiveWorkerRelativePath,
          wasmRelativePath: effectiveWasmRelativePath,
          workerURL,
        })
        : {
          type: initType,
          rootURI: effectiveRootURI,
          wasmRelativePath: effectiveWasmRelativePath,
        };

      postMessage(initMessage, context.initTransferList);
      await readyDeferred.promise;

      return {
        worker,
        workerURL,
        rootURI: effectiveRootURI,
        workerRelativePath: effectiveWorkerRelativePath,
        wasmRelativePath: effectiveWasmRelativePath,
        request,
        postMessage,
        terminate,
        isReady() {
          return ready;
        },
      };
    },
    async dispose(resource) {
      if (resource && typeof resource.terminate === "function") {
        resource.terminate();
      }
    },
  });
}
