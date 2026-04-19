import { createResourceLoader } from "./resource-loader.js";

function toNonEmptyString(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

function normalizeRelativePath(relativePath) {
  const normalized = toNonEmptyString(relativePath, "wasm relativePath");
  return normalized.replace(/^\/+/, "");
}

function trimTrailingSlashes(value) {
  return String(value || "").replace(/\/+$/u, "");
}

function resolveImports(imports, context = {}) {
  if (typeof imports === "function") {
    return imports(context) || {};
  }
  return imports && typeof imports === "object" ? imports : {};
}

export function resolveWasmAssetURL(rootURI = "", relativePath = "") {
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  const normalizedRootURI = String(rootURI || "").trim();
  if (!normalizedRootURI) {
    return normalizedRelativePath;
  }
  return `${trimTrailingSlashes(normalizedRootURI)}/${normalizedRelativePath}`;
}

export async function fetchWasmBytes({
  fetchImpl = globalThis.fetch,
  url,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("wasm fetchImpl is required");
  }

  const targetURL = toNonEmptyString(url, "wasm url");
  const response = await fetchImpl(targetURL);
  if (!response || typeof response.arrayBuffer !== "function") {
    throw new Error("wasm fetch response must provide arrayBuffer()");
  }
  if ("ok" in response && response.ok === false) {
    const status = Number.isFinite(response.status) ? response.status : "unknown";
    throw new Error(`failed to fetch wasm bytes: ${status}`);
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function instantiateWasmModule({
  bytes,
  imports = {},
  WebAssemblyImpl = globalThis.WebAssembly,
} = {}) {
  if (!WebAssemblyImpl || typeof WebAssemblyImpl.instantiate !== "function") {
    throw new Error("WebAssembly.instantiate is required");
  }
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("wasm bytes must be a Uint8Array");
  }
  if (bytes.byteLength === 0) {
    throw new Error("wasm bytes must not be empty");
  }

  const result = await WebAssemblyImpl.instantiate(bytes, imports);
  if (result && typeof result === "object" && result.instance) {
    return {
      module: result.module || null,
      instance: result.instance,
      exports: result.instance.exports || {},
    };
  }

  return {
    module: null,
    instance: result || null,
    exports: result?.exports || {},
  };
}

export function createWasmModuleLoader({
  id,
  label,
  rootURI = "",
  relativePath = "",
  imports = {},
  fetchImpl = globalThis.fetch,
  WebAssemblyImpl = globalThis.WebAssembly,
  disposeInstance,
  logger,
} = {}) {
  const defaultRelativePath = normalizeRelativePath(relativePath);

  return createResourceLoader({
    id,
    label,
    logger,
    async load(context = {}) {
      const effectiveRootURI = Object.prototype.hasOwnProperty.call(context, "rootURI")
        ? context.rootURI
        : rootURI;
      const effectiveRelativePath = normalizeRelativePath(
        Object.prototype.hasOwnProperty.call(context, "relativePath")
          ? context.relativePath
          : defaultRelativePath,
      );
      const effectiveFetch = Object.prototype.hasOwnProperty.call(context, "fetchImpl")
        ? context.fetchImpl
        : fetchImpl;
      const effectiveWebAssembly = Object.prototype.hasOwnProperty.call(context, "WebAssemblyImpl")
        ? context.WebAssemblyImpl
        : WebAssemblyImpl;

      const url = resolveWasmAssetURL(effectiveRootURI, effectiveRelativePath);
      const bytes = await fetchWasmBytes({
        fetchImpl: effectiveFetch,
        url,
      });
      const instantiated = await instantiateWasmModule({
        bytes,
        imports: resolveImports(
          Object.prototype.hasOwnProperty.call(context, "imports")
            ? context.imports
            : imports,
          {
            ...context,
            rootURI: effectiveRootURI,
            relativePath: effectiveRelativePath,
            url,
            bytes,
          },
        ),
        WebAssemblyImpl: effectiveWebAssembly,
      });

      return {
        ...instantiated,
        bytes,
        bytesLength: bytes.byteLength,
        rootURI: effectiveRootURI,
        relativePath: effectiveRelativePath,
        url,
      };
    },
    async dispose(resource, context = {}) {
      const effectiveDispose = typeof context.disposeInstance === "function"
        ? context.disposeInstance
        : disposeInstance;
      if (typeof effectiveDispose === "function") {
        await effectiveDispose(resource, context);
      }
    },
  });
}
