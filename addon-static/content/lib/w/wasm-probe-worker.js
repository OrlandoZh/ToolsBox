(function bootstrapWasmProbeWorker(scope) {
  const READY_TYPE = "READY";
  const ERROR_TYPE = "ERROR";
  const DEFAULT_UNLOCK_BUNDLE_SEED = "cleanroom-stage2-shadow-seed-v1";
  const DEFAULT_UNLOCK_OVERLAY_VERSION = "descriptor-overlay-v1";
  const DEFAULT_UNLOCK_DERIVATION_VERSION = "host-unlock-v1-shadow";
  const DEFAULT_LEGACY_ENTITLEMENT_PROTOCOL = "relationgraph-hmac-md5-link";
  const DEFAULT_LEGACY_ENTITLEMENT_VERSION = "legacy-entitlement-v0";
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

  function base64EncodeBytes(bytes) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let output = "";
    for (let index = 0; index < bytes.length; index += 3) {
      const first = bytes[index];
      const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
      const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
      const triple = (first << 16) | (second << 8) | third;
      output += alphabet[(triple >> 18) & 0x3f];
      output += alphabet[(triple >> 12) & 0x3f];
      output += index + 1 < bytes.length ? alphabet[(triple >> 6) & 0x3f] : "=";
      output += index + 2 < bytes.length ? alphabet[triple & 0x3f] : "=";
    }
    return output;
  }

  function base64EncodeUTF8(text) {
    return base64EncodeBytes(encodeUTF8(text));
  }

  function leftRotate32(value, shift) {
    const uint32 = toUint32(value);
    return toUint32((uint32 << shift) | (uint32 >>> (32 - shift)));
  }

  const MD5_SHIFT_AMOUNTS = Object.freeze([
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]);
  const MD5_TABLE = Object.freeze(Array.from({ length: 64 }, function buildMD5Table(_entry, index) {
    return toUint32(Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000));
  }));

  function md5Bytes(bytes) {
    const input = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
    const paddedLength = ((((input.length + 8) >> 6) + 1) << 6);
    const buffer = new Uint8Array(paddedLength);
    buffer.set(input);
    buffer[input.length] = 0x80;
    const bitLength = BigInt(input.length) * 8n;
    for (let index = 0; index < 8; index += 1) {
      buffer[paddedLength - 8 + index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
    }

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    for (let offset = 0; offset < paddedLength; offset += 64) {
      const words = [];
      for (let index = 0; index < 16; index += 1) {
        const position = offset + index * 4;
        words[index] = toUint32(
          buffer[position]
          | (buffer[position + 1] << 8)
          | (buffer[position + 2] << 16)
          | (buffer[position + 3] << 24)
        );
      }
      let a = a0;
      let b = b0;
      let c = c0;
      let d = d0;
      for (let index = 0; index < 64; index += 1) {
        let f = 0;
        let g = 0;
        if (index < 16) {
          f = (b & c) | ((~b) & d);
          g = index;
        } else if (index < 32) {
          f = (d & b) | ((~d) & c);
          g = (5 * index + 1) % 16;
        } else if (index < 48) {
          f = b ^ c ^ d;
          g = (3 * index + 5) % 16;
        } else {
          f = c ^ (b | (~d));
          g = (7 * index) % 16;
        }
        const nextD = d;
        d = c;
        c = b;
        b = toUint32(b + leftRotate32(toUint32(a + f + MD5_TABLE[index] + words[g]), MD5_SHIFT_AMOUNTS[index]));
        a = nextD;
      }
      a0 = toUint32(a0 + a);
      b0 = toUint32(b0 + b);
      c0 = toUint32(c0 + c);
      d0 = toUint32(d0 + d);
    }

    const output = new Uint8Array(16);
    [a0, b0, c0, d0].forEach(function writeWord(word, index) {
      const position = index * 4;
      output[position] = word & 0xff;
      output[position + 1] = (word >>> 8) & 0xff;
      output[position + 2] = (word >>> 16) & 0xff;
      output[position + 3] = (word >>> 24) & 0xff;
    });
    return output;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes || [], function toHex(byte) {
      return Number(byte).toString(16).padStart(2, "0");
    }).join("");
  }

  function hmacMD5Hex(message, key) {
    let keyBytes = encodeUTF8(key);
    if (keyBytes.byteLength > 64) {
      keyBytes = md5Bytes(keyBytes);
    }
    const normalizedKey = new Uint8Array(64);
    normalizedKey.set(keyBytes);
    const outer = new Uint8Array(64);
    const inner = new Uint8Array(64);
    for (let index = 0; index < 64; index += 1) {
      outer[index] = normalizedKey[index] ^ 0x5c;
      inner[index] = normalizedKey[index] ^ 0x36;
    }
    const messageBytes = encodeUTF8(message);
    const innerPayload = new Uint8Array(inner.length + messageBytes.length);
    innerPayload.set(inner);
    innerPayload.set(messageBytes, inner.length);
    const innerDigest = md5Bytes(innerPayload);
    const outerPayload = new Uint8Array(outer.length + innerDigest.length);
    outerPayload.set(outer);
    outerPayload.set(innerDigest, outer.length);
    return bytesToHex(md5Bytes(outerPayload));
  }

  function normalizeLegacyProtocol(value) {
    return normalizeOptionalString(value) || DEFAULT_LEGACY_ENTITLEMENT_PROTOCOL;
  }

  function buildLegacyHostBindingInput(hostBinding) {
    const normalizedHostBinding = normalizeUnlockHostBinding(hostBinding);
    return [
      `signalVersion=${Number(normalizedHostBinding.signalVersion || 1)}`,
      `profileHash=${normalizedHostBinding.profileHash || "-"}`,
      `schemaBucket=${normalizedHostBinding.schemaBucket || "-"}`,
      `zoteroVersionBucket=${normalizedHostBinding.zoteroVersionBucket || "-"}`,
      `profileBasenameBucket=${normalizedHostBinding.profileBasenameBucket || "-"}`,
      `dataDirHash=${normalizedHostBinding.dataDirHash || "-"}`,
      `dbAvailable=${normalizedHostBinding.dbAvailable ? "1" : "0"}`,
      `noncePresent=${normalizedHostBinding.noncePresent ? "1" : "0"}`,
      `nonceMaterial=${buildUnlockNonceMaterial(normalizedHostBinding)}`,
    ].join("\n");
  }

  function readLegacyResponseToken(responsePayload) {
    let payload = responsePayload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        return normalizeOptionalString(payload);
      }
    }
    if (!payload || typeof payload !== "object") {
      return normalizeOptionalString(payload);
    }
    return normalizeOptionalString(payload.link)
      || normalizeOptionalString(payload.value)
      || normalizeOptionalString(payload.result)
      || normalizeOptionalString(payload.data);
  }

  function computeLegacyRequest(digestExports, payload) {
    const identityValue = normalizeOptionalString(payload.identityValue);
    const legacySecret = normalizeOptionalString(payload.legacySecret);
    if (!identityValue) {
      throw new Error("legacy entitlement identity is unavailable");
    }
    if (!legacySecret) {
      throw new Error("legacy entitlement secret is unavailable");
    }
    const protocol = normalizeLegacyProtocol(payload.protocol);
    const hostBinding = normalizeUnlockHostBinding(payload.hostBinding);
    const encodedSecret = base64EncodeUTF8(legacySecret);
    const serial = hmacMD5Hex(identityValue, encodedSecret);
    const expectedResponseToken = hmacMD5Hex(base64EncodeUTF8(identityValue), encodedSecret);
    const hostBindingDigest = computeDigestFromExports(digestExports, {
      text: `legacy-host\n${buildLegacyHostBindingInput(hostBinding)}`,
      seed: Object.prototype.hasOwnProperty.call(payload, "seed") ? payload.seed : null,
    });
    const canonicalInput = [
      `derivationVersion=${DEFAULT_LEGACY_ENTITLEMENT_VERSION}`,
      `protocol=${protocol}`,
      `identityKind=${normalizeOptionalString(payload.identityKind) || "zotero-user-id"}`,
      `identityValue=${identityValue}`,
      `serial=${serial}`,
      `hostBindingDigest=${hostBindingDigest.digestHex}`,
    ].join("\n");
    const requestDigest = computeDigestFromExports(digestExports, {
      text: `legacy-request\n${canonicalInput}`,
      seed: hostBindingDigest.digestUint32,
    });
    const compactGate = computeDigestFromExports(digestExports, {
      text: `legacy-compact\n${requestDigest.digestHex}\n${expectedResponseToken}`,
      seed: requestDigest.digestUint32,
    });
    return {
      mode: "legacy-backend-v0",
      protocol,
      derivationVersion: DEFAULT_LEGACY_ENTITLEMENT_VERSION,
      requestFields: {
        username: identityValue,
        serial,
      },
      cacheFingerprint: `lg0-${requestDigest.digestHex}-${hostBindingDigest.digestHex}`,
      hostBindingDigest: hostBindingDigest.digestHex,
      requestDigestHex: requestDigest.digestHex,
      compactGateHex: compactGate.digestHex,
      expectedResponseToken,
    };
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

  function runLegacyEntitlementRequest(data) {
    if (!probeState.instance) {
      throw new Error("worker probe is not initialized");
    }
    const digestExports = requireDigestExports();
    const payload = data && typeof data.payload === "object" ? data.payload : {};
    const derived = computeLegacyRequest(digestExports, payload);

    scope.postMessage({
      type: "LEGACY_ENTITLEMENT_REQUEST_RESULT",
      requestID: data.requestID,
      ok: true,
      payload: {
        mode: derived.mode,
        protocol: derived.protocol,
        derivationVersion: derived.derivationVersion,
        requestFields: derived.requestFields,
        cacheFingerprint: derived.cacheFingerprint,
        hostBindingDigest: derived.hostBindingDigest,
        requestDigestHex: derived.requestDigestHex,
        compactGateHex: derived.compactGateHex,
        wasmURL: probeState.wasmURL,
        workerURL: resolveWorkerURL(),
        bytesLength: probeState.bytesLength,
        exportNames: probeState.exportNames,
      },
    });
  }

  function runLegacyEntitlementResponse(data) {
    if (!probeState.instance) {
      throw new Error("worker probe is not initialized");
    }
    const digestExports = requireDigestExports();
    const payload = data && typeof data.payload === "object" ? data.payload : {};
    const prepared = computeLegacyRequest(digestExports, payload);
    const responseToken = readLegacyResponseToken(payload.responsePayload);
    const gateSatisfied = Boolean(responseToken && responseToken === prepared.expectedResponseToken);
    const validationDigest = computeDigestFromExports(digestExports, {
      text: [
        "legacy-response",
        `cacheFingerprint=${prepared.cacheFingerprint}`,
        `gate=${gateSatisfied ? "1" : "0"}`,
        `responseTokenPresent=${responseToken ? "1" : "0"}`,
      ].join("\n"),
      seed: Number.parseInt(prepared.compactGateHex, 16) >>> 0,
    });

    scope.postMessage({
      type: "LEGACY_ENTITLEMENT_RESPONSE_RESULT",
      requestID: data.requestID,
      ok: true,
      payload: {
        mode: prepared.mode,
        protocol: prepared.protocol,
        derivationVersion: prepared.derivationVersion,
        gateSatisfied,
        compactGateHex: prepared.compactGateHex,
        validationDigestHex: validationDigest.digestHex,
        cacheFingerprint: prepared.cacheFingerprint,
        hostBindingDigest: prepared.hostBindingDigest,
        failureKind: gateSatisfied ? null : "gate-mismatch",
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

      if (data.type === "LEGACY_ENTITLEMENT_REQUEST") {
        runLegacyEntitlementRequest(data);
        return;
      }

      if (data.type === "LEGACY_ENTITLEMENT_RESPONSE") {
        runLegacyEntitlementResponse(data);
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
