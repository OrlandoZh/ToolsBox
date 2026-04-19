(function bootstrapWasmProbeWorker(scope) {
  const READY_TYPE = "READY";
  const ERROR_TYPE = "ERROR";
  const DEFAULT_UNLOCK_BUNDLE_SEED = "cleanroom-stage2-shadow-seed-v1";
  const DEFAULT_UNLOCK_OVERLAY_VERSION = "descriptor-overlay-v1";
  const DEFAULT_UNLOCK_DERIVATION_VERSION = "host-unlock-v1-shadow";
  const HOST_UNLOCK_REQUIREMENTS = Object.freeze([
    "profileHash",
    "dbAvailable",
    "noncePresent",
  ]);

  let probeState = {
    instance: null,
    wasmURL: null,
    bytesLength: 0,
    exportNames: [],
  };

  function toErrorMessage(error) {
    if (!error) {
      return "unknown";
    }
    if (typeof error === "string") {
      return error;
    }
    return String(error.message || error);
  }

  function toInteger(value, fallback) {
    const normalized = Number(value);
    return Number.isInteger(normalized) ? normalized : fallback;
  }

  function toUint32(value) {
    return Number(value >>> 0);
  }

  function formatUint32Hex(value) {
    return toUint32(value).toString(16).padStart(8, "0");
  }

  function normalizeRelativePath(relativePath) {
    return String(relativePath || "").replace(/^\/+/u, "");
  }

  function normalizeText(value) {
    return value === null || value === undefined
      ? ""
      : String(value);
  }

  function normalizeOptionalString(value) {
    const normalized = String(value || "").trim();
    return normalized || null;
  }

  function encodeUTF8(text) {
    const normalizedText = normalizeText(text);
    if (typeof TextEncoder === "function") {
      return new TextEncoder().encode(normalizedText);
    }

    const bytes = [];
    for (const character of normalizedText) {
      const codePoint = character.codePointAt(0);
      if (codePoint <= 0x7f) {
        bytes.push(codePoint);
        continue;
      }
      if (codePoint <= 0x7ff) {
        bytes.push(
          0xc0 | (codePoint >> 6),
          0x80 | (codePoint & 0x3f),
        );
        continue;
      }
      if (codePoint <= 0xffff) {
        bytes.push(
          0xe0 | (codePoint >> 12),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f),
        );
        continue;
      }
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
    return Uint8Array.from(bytes);
  }

  function resolveWasmURL(rootURI, relativePath) {
    const normalizedRelativePath = normalizeRelativePath(relativePath);
    const normalizedRootURI = String(rootURI || "").replace(/\/+$/u, "");
    return normalizedRootURI
      ? `${normalizedRootURI}/${normalizedRelativePath}`
      : normalizedRelativePath;
  }

  function readExportNames(exportsObject) {
    return Object.keys(exportsObject || {}).sort();
  }

  function resolveWorkerURL() {
    return typeof location === "object" && typeof location.href === "string"
      ? location.href
      : null;
  }

  function requireProbeExport() {
    const add = probeState.instance?.exports?.add;
    if (typeof add !== "function") {
      throw new Error("worker probe export `add` is unavailable");
    }
    return add;
  }

  function requireDigestExports() {
    const exportsObject = probeState.instance?.exports || {};
    const seed = exportsObject.seed;
    const mix = exportsObject.mix;
    const finalize = exportsObject.finalize;
    if (typeof seed !== "function" || typeof mix !== "function" || typeof finalize !== "function") {
      throw new Error("worker digest exports `seed`, `mix`, or `finalize` are unavailable");
    }
    return { seed, mix, finalize };
  }

  function computeDigestFromExports(digestExports, inputs) {
    const seedExport = digestExports.seed;
    const mixExport = digestExports.mix;
    const finalizeExport = digestExports.finalize;
    const text = normalizeText(inputs && inputs.text);
    const bytes = encodeUTF8(text);
    const seedUint32 = inputs && Object.prototype.hasOwnProperty.call(inputs, "seed") && inputs.seed !== null && inputs.seed !== undefined
      ? toUint32(inputs.seed)
      : toUint32(seedExport());
    let state = seedUint32;
    for (const byte of bytes) {
      state = toUint32(mixExport(state, byte));
    }
    const digestUint32 = toUint32(finalizeExport(state, bytes.byteLength));
    return {
      textLength: text.length,
      byteLength: bytes.byteLength,
      seedUint32,
      digestUint32,
      digestHex: formatUint32Hex(digestUint32),
    };
  }

  function normalizeUnlockHostBinding(summary) {
    const normalized = {
      signalVersion: 1,
      available: false,
      profileHash: null,
      schemaBucket: null,
      zoteroVersionBucket: null,
      profileBasenameBucket: null,
      dataDirHash: null,
      dbAvailable: false,
      noncePresent: false,
      nonceSource: "unavailable",
      nonceHash: null,
    };

    if (!summary || typeof summary !== "object") {
      return normalized;
    }

    normalized.signalVersion = Number(summary.signalVersion || 1);
    normalized.profileHash = normalizeOptionalString(summary.profileHash);
    normalized.schemaBucket = normalizeOptionalString(summary.schemaBucket);
    normalized.zoteroVersionBucket = normalizeOptionalString(summary.zoteroVersionBucket);
    normalized.profileBasenameBucket = normalizeOptionalString(summary.profileBasenameBucket);
    normalized.dataDirHash = normalizeOptionalString(summary.dataDirHash);
    normalized.dbAvailable = Boolean(summary.dbAvailable);
    normalized.noncePresent = Boolean(summary.noncePresent);
    normalized.nonceSource = normalizeOptionalString(summary.nonceSource) || "unavailable";
    normalized.nonceHash = normalizeOptionalString(summary.nonceHash);
    normalized.available = Boolean(
      normalized.profileHash
      || normalized.schemaBucket
      || normalized.zoteroVersionBucket
      || normalized.profileBasenameBucket
      || normalized.dataDirHash
      || normalized.dbAvailable
      || normalized.noncePresent
    );

    return normalized;
  }

  function normalizeUnlockBundleSeed(value) {
    return normalizeOptionalString(value) || DEFAULT_UNLOCK_BUNDLE_SEED;
  }

  function normalizeUnlockOverlayVersion(value) {
    return normalizeOptionalString(value) || DEFAULT_UNLOCK_OVERLAY_VERSION;
  }

  function resolveUnlockActivation(hostBinding) {
    const normalizedHostBinding = normalizeUnlockHostBinding(hostBinding);
    const missing = [];
    if (!(typeof normalizedHostBinding.profileHash === "string" && normalizedHostBinding.profileHash.trim())) {
      missing.push("profileHash");
    }
    if (!normalizedHostBinding.dbAvailable) {
      missing.push("dbAvailable");
    }
    if (!normalizedHostBinding.noncePresent) {
      missing.push("noncePresent");
    }
    return {
      requirements: HOST_UNLOCK_REQUIREMENTS.slice(),
      missing,
      satisfied: missing.length === 0,
    };
  }

  function buildUnlockNonceMaterial(hostBinding) {
    const normalizedHostBinding = normalizeUnlockHostBinding(hostBinding);
    if (normalizedHostBinding.nonceHash) {
      return normalizedHostBinding.nonceHash;
    }
    if (normalizedHostBinding.noncePresent) {
      return `nonce-present:${normalizedHostBinding.nonceSource}`;
    }
    return "nonce-missing";
  }

  function buildUnlockCanonicalInput(inputs) {
    const hostBinding = normalizeUnlockHostBinding(inputs && inputs.hostBinding);
    return [
      `derivationVersion=${normalizeOptionalString(inputs && inputs.derivationVersion) || DEFAULT_UNLOCK_DERIVATION_VERSION}`,
      `bundleSeed=${normalizeUnlockBundleSeed(inputs && inputs.bundleSeed)}`,
      `overlayVersion=${normalizeUnlockOverlayVersion(inputs && inputs.overlayVersion)}`,
      `signalVersion=${Number(hostBinding.signalVersion || 1)}`,
      `profileHash=${hostBinding.profileHash || "-"}`,
      `schemaBucket=${hostBinding.schemaBucket || "-"}`,
      `zoteroVersionBucket=${hostBinding.zoteroVersionBucket || "-"}`,
      `profileBasenameBucket=${hostBinding.profileBasenameBucket || "-"}`,
      `dataDirHash=${hostBinding.dataDirHash || "-"}`,
      `dbAvailable=${hostBinding.dbAvailable ? "1" : "0"}`,
      `noncePresent=${hostBinding.noncePresent ? "1" : "0"}`,
      `nonceMaterial=${buildUnlockNonceMaterial(hostBinding)}`,
    ].join("\n");
  }

  async function fetchBytesViaXHR(url) {
    const buffer = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = "arraybuffer";
      xhr.onload = function onload() {
        if (xhr.status && xhr.status >= 400) {
          reject(new Error(`WASM xhr failed: ${xhr.status}`));
          return;
        }
        resolve(xhr.response);
      };
      xhr.onerror = function onerror() {
        reject(new Error("WASM xhr failed"));
      };
      xhr.send();
    });
    return new Uint8Array(buffer);
  }

  async function fetchBytes(url) {
    if (typeof fetch === "function") {
      const response = await fetch(url);
      if (!response || typeof response.arrayBuffer !== "function") {
        throw new Error("worker fetch response must provide arrayBuffer()");
      }
      if ("ok" in response && response.ok === false) {
        throw new Error(`WASM fetch failed: ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    }

    if (typeof XMLHttpRequest === "function") {
      return await fetchBytesViaXHR(url);
    }

    throw new Error("worker cannot fetch wasm bytes");
  }

  async function initProbe(data) {
    const wasmURL = String(data.wasmURL || "").trim()
      || resolveWasmURL(data.rootURI, data.wasmRelativePath);
    const bytes = await fetchBytes(wasmURL);
    const result = await WebAssembly.instantiate(bytes, {});
    const instance = result && result.instance ? result.instance : result;
    if (!instance || typeof instance !== "object") {
      throw new Error("worker probe instantiation returned no instance");
    }

    probeState = {
      instance,
      wasmURL,
      bytesLength: bytes.byteLength,
      exportNames: readExportNames(instance.exports),
    };

    scope.postMessage({
      type: READY_TYPE,
      wasmURL: probeState.wasmURL,
      bytesLength: probeState.bytesLength,
      exportNames: probeState.exportNames,
    });
  }

  function runProbe(data) {
    if (!probeState.instance) {
      throw new Error("worker probe is not initialized");
    }
    const add = requireProbeExport();

    const payload = data && typeof data.payload === "object" ? data.payload : {};
    const left = toInteger(payload.left, 19);
    const right = toInteger(payload.right, 23);
    const sum = add(left, right);

    scope.postMessage({
      type: "PROBE_RESULT",
      requestID: data.requestID,
      ok: true,
      payload: {
        left,
        right,
        sum,
        wasmURL: probeState.wasmURL,
        workerURL: resolveWorkerURL(),
        bytesLength: probeState.bytesLength,
        exportNames: probeState.exportNames,
      },
    });
  }

  function runDigest(data) {
    if (!probeState.instance) {
      throw new Error("worker probe is not initialized");
    }

    const { seed, mix, finalize } = requireDigestExports();
    const payload = data && typeof data.payload === "object" ? data.payload : {};
    const text = normalizeText(payload.text);
    const bytes = encodeUTF8(text);
    const seedUint32 = Object.prototype.hasOwnProperty.call(payload, "seed") && payload.seed !== null
      ? toUint32(payload.seed)
      : toUint32(seed());
    let state = seedUint32;
    for (const byte of bytes) {
      state = toUint32(mix(state, byte));
    }
    const digestUint32 = toUint32(finalize(state, bytes.byteLength));

    scope.postMessage({
      type: "DIGEST_RESULT",
      requestID: data.requestID,
      ok: true,
      payload: {
        textLength: text.length,
        byteLength: bytes.byteLength,
        seedUint32,
        digestUint32,
        digestHex: formatUint32Hex(digestUint32),
        wasmURL: probeState.wasmURL,
        workerURL: resolveWorkerURL(),
        bytesLength: probeState.bytesLength,
        exportNames: probeState.exportNames,
      },
    });
  }

  function runUnlock(data) {
    if (!probeState.instance) {
      throw new Error("worker probe is not initialized");
    }

    const digestExports = requireDigestExports();
    const payload = data && typeof data.payload === "object" ? data.payload : {};
    const hostBinding = normalizeUnlockHostBinding(payload.hostBinding);
    const activation = resolveUnlockActivation(hostBinding);
    const canonicalInput = buildUnlockCanonicalInput({
      derivationVersion: DEFAULT_UNLOCK_DERIVATION_VERSION,
      bundleSeed: payload.bundleSeed,
      overlayVersion: payload.overlayVersion,
      hostBinding,
    });
    const inputDigest = computeDigestFromExports(digestExports, {
      text: canonicalInput,
      seed: Object.prototype.hasOwnProperty.call(payload, "seed") ? payload.seed : null,
    });
    const stage2Digest = computeDigestFromExports(digestExports, {
      text: `stage2\n${canonicalInput}`,
      seed: inputDigest.digestUint32,
    });
    const unlockToken = computeDigestFromExports(digestExports, {
      text: `unlock\n${canonicalInput}\nstage2=${stage2Digest.digestHex}`,
      seed: stage2Digest.digestUint32,
    });

    scope.postMessage({
      type: "UNLOCK_RESULT",
      requestID: data.requestID,
      ok: true,
      payload: {
        derivationVersion: DEFAULT_UNLOCK_DERIVATION_VERSION,
        bundleSeed: normalizeUnlockBundleSeed(payload.bundleSeed),
        overlayVersion: normalizeUnlockOverlayVersion(payload.overlayVersion),
        hostBinding,
        activationRequirements: activation.requirements,
        activationMissing: activation.missing,
        activationSatisfied: activation.satisfied,
        shadowWouldApply: activation.satisfied,
        canonicalInputLength: canonicalInput.length,
        inputDigestUint32: inputDigest.digestUint32,
        inputDigestHex: inputDigest.digestHex,
        stage2DigestUint32: stage2Digest.digestUint32,
        stage2DigestHex: stage2Digest.digestHex,
        unlockTokenUint32: unlockToken.digestUint32,
        unlockTokenHex: unlockToken.digestHex,
        wasmURL: probeState.wasmURL,
        workerURL: resolveWorkerURL(),
        bytesLength: probeState.bytesLength,
        exportNames: probeState.exportNames,
      },
    });
  }

  scope.onmessage = async function onmessage(event) {
    const data = event && typeof event === "object" && "data" in event
      ? event.data
      : event;

    try {
      if (!data || typeof data !== "object") {
        throw new Error("worker message must be an object");
      }

      if (data.type === "INIT") {
        await initProbe(data);
        return;
      }

      if (data.type === "PROBE") {
        runProbe(data);
        return;
      }

      if (data.type === "DIGEST") {
        runDigest(data);
        return;
      }

      if (data.type === "UNLOCK") {
        runUnlock(data);
        return;
      }

      throw new Error(`unsupported wasm worker message type: ${data.type}`);
    } catch (error) {
      scope.postMessage({
        type: ERROR_TYPE,
        requestID: data && Object.prototype.hasOwnProperty.call(data, "requestID")
          ? data.requestID
          : null,
        ok: false,
        message: toErrorMessage(error),
      });
    }
  };
})(typeof self !== "undefined" ? self : globalThis);
