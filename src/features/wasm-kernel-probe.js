import {
  createWasmModuleLoader,
  createWasmWorkerController,
} from "../services/index.js";
import {
  WASM_KERNEL_PROBE_PATH,
  WASM_KERNEL_PROBE_WORKER_PATH,
} from "../utils/optional-bundle-paths.js";

export const DEFAULT_WASM_PROBE_RELATIVE_PATH = WASM_KERNEL_PROBE_PATH;
export const DEFAULT_WASM_PROBE_WORKER_RELATIVE_PATH = WASM_KERNEL_PROBE_WORKER_PATH;

const DEFAULT_TRANSPORT_MODE = "both";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_LEFT_OPERAND = 19;
const DEFAULT_RIGHT_OPERAND = 23;
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

function nowMs() {
  if (typeof globalThis?.performance?.now === "function") {
    return globalThis.performance.now();
  }
  return Date.now();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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

function normalizeTransportMode(value) {
  const candidate = String(value || "").trim().toLowerCase();
  switch (candidate) {
    case "main":
    case "main-thread":
    case "mainthread":
      return "main-thread";
    case "worker":
      return "worker";
    case "both":
    case "":
      return DEFAULT_TRANSPORT_MODE;
    default:
      throw new Error(`unsupported wasm probe mode: ${value}`);
  }
}

function extractProbeInputs(payload = {}) {
  const left = toInteger(payload.left, DEFAULT_LEFT_OPERAND);
  const right = toInteger(payload.right, DEFAULT_RIGHT_OPERAND);
  return {
    left,
    right,
    expectedSum: left + right,
    timeoutMs: toInteger(payload.timeoutMs, DEFAULT_TIMEOUT_MS),
  };
}

function normalizeDigestSeed(value) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized)) {
    throw new Error("wasm digest seed must be an integer");
  }
  return toUint32(normalized);
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

function extractDigestInputs(payload = {}) {
  const text = normalizeText(payload.text);
  return {
    text,
    seed: Object.prototype.hasOwnProperty.call(payload, "seed")
      ? normalizeDigestSeed(payload.seed)
      : null,
    timeoutMs: toInteger(payload.timeoutMs, DEFAULT_TIMEOUT_MS),
  };
}

function normalizeUnlockHostBinding(summary = null) {
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
    || normalized.noncePresent,
  );

  return normalized;
}

function resolveUnlockActivation(hostBinding = null) {
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

function buildUnlockNonceMaterial(hostBinding = null) {
  const normalizedHostBinding = normalizeUnlockHostBinding(hostBinding);
  if (normalizedHostBinding.nonceHash) {
    return normalizedHostBinding.nonceHash;
  }
  if (normalizedHostBinding.noncePresent) {
    return `nonce-present:${normalizedHostBinding.nonceSource}`;
  }
  return "nonce-missing";
}

function normalizeUnlockBundleSeed(value) {
  return normalizeOptionalString(value) || DEFAULT_UNLOCK_BUNDLE_SEED;
}

function normalizeUnlockOverlayVersion(value) {
  return normalizeOptionalString(value) || DEFAULT_UNLOCK_OVERLAY_VERSION;
}

function extractUnlockInputs(payload = {}) {
  return {
    derivationVersion: DEFAULT_UNLOCK_DERIVATION_VERSION,
    bundleSeed: normalizeUnlockBundleSeed(payload.bundleSeed),
    overlayVersion: normalizeUnlockOverlayVersion(payload.overlayVersion),
    hostBinding: normalizeUnlockHostBinding(payload.hostBinding),
    seed: Object.prototype.hasOwnProperty.call(payload, "seed")
      ? normalizeDigestSeed(payload.seed)
      : null,
    timeoutMs: toInteger(payload.timeoutMs, DEFAULT_TIMEOUT_MS),
  };
}

function readExportNames(exportsObject = {}) {
  return Object.keys(exportsObject).sort();
}

function normalizeRelativePath(relativePath = "") {
  return String(relativePath || "").replace(/^\/+/u, "");
}

function normalizeChromeContentRelativePath(relativePath = "") {
  return normalizeRelativePath(relativePath).replace(/^content\/+/u, "");
}

function toDurationMs(startedAt, finishedAt = nowMs()) {
  return Math.max(0, Math.round(Number(finishedAt) - Number(startedAt)));
}

function buildChromeContentURL(addonRef, relativePath = "") {
  const normalizedAddonRef = String(addonRef || "").trim() || "cleanroomtemplate";
  const normalizedRelativePath = normalizeChromeContentRelativePath(relativePath);
  return `chrome://${normalizedAddonRef}/content/${normalizedRelativePath}`;
}

function buildTimingSnapshot({
  initDurationMs = 0,
  invokeDurationMs = 0,
  totalDurationMs = null,
} = {}) {
  const normalizedInitDurationMs = Math.max(0, Number(initDurationMs || 0));
  const normalizedInvokeDurationMs = Math.max(0, Number(invokeDurationMs || 0));
  const hasExplicitTotalDuration = totalDurationMs !== null && totalDurationMs !== undefined && totalDurationMs !== "";
  const normalizedTotalDurationMs = hasExplicitTotalDuration && Number.isFinite(Number(totalDurationMs))
    ? Math.max(0, Number(totalDurationMs || 0))
    : normalizedInitDurationMs + normalizedInvokeDurationMs;
  return {
    initDurationMs: normalizedInitDurationMs,
    invokeDurationMs: normalizedInvokeDurationMs,
    totalDurationMs: normalizedTotalDurationMs,
  };
}

function encodeUTF8(text = "") {
  const normalizedText = normalizeText(text);
  if (typeof globalThis?.TextEncoder === "function") {
    return new globalThis.TextEncoder().encode(normalizedText);
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

function requireProbeExport(resource) {
  const add = resource?.exports?.add;
  if (typeof add !== "function") {
    throw new Error("wasm probe export `add` is unavailable");
  }
  return add;
}

function requireDigestExports(resource) {
  const exportsObject = resource?.exports || {};
  const seed = exportsObject.seed;
  const mix = exportsObject.mix;
  const finalize = exportsObject.finalize;
  if (typeof seed !== "function" || typeof mix !== "function" || typeof finalize !== "function") {
    throw new Error("wasm digest exports `seed`, `mix`, or `finalize` are unavailable");
  }
  return { seed, mix, finalize };
}

function computeDigestFromExports(digestExports, inputs = {}) {
  const { seed, mix, finalize } = digestExports || {};
  const text = normalizeText(inputs.text);
  const bytes = encodeUTF8(text);
  const seedUint32 = inputs.seed === null || inputs.seed === undefined
    ? toUint32(seed())
    : toUint32(inputs.seed);
  let state = seedUint32;
  for (const byte of bytes) {
    state = toUint32(mix(state, byte));
  }
  const digestUint32 = toUint32(finalize(state, bytes.byteLength));
  return {
    textLength: text.length,
    byteLength: bytes.byteLength,
    seedUint32,
    digestUint32,
    digestHex: formatUint32Hex(digestUint32),
  };
}

function computeDigestFromResource(resource, inputs = {}) {
  return computeDigestFromExports(requireDigestExports(resource), inputs);
}

function buildUnlockCanonicalInput(inputs = {}) {
  const hostBinding = normalizeUnlockHostBinding(inputs.hostBinding);
  return [
    `derivationVersion=${normalizeOptionalString(inputs.derivationVersion) || DEFAULT_UNLOCK_DERIVATION_VERSION}`,
    `bundleSeed=${normalizeUnlockBundleSeed(inputs.bundleSeed)}`,
    `overlayVersion=${normalizeUnlockOverlayVersion(inputs.overlayVersion)}`,
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

function base64EncodeUTF8(text = "") {
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

const MD5_TABLE = Object.freeze(Array.from({ length: 64 }, (_entry, index) => {
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
        | (buffer[position + 3] << 24),
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
  [a0, b0, c0, d0].forEach((word, index) => {
    const position = index * 4;
    output[position] = word & 0xff;
    output[position + 1] = (word >>> 8) & 0xff;
    output[position + 2] = (word >>> 16) & 0xff;
    output[position + 3] = (word >>> 24) & 0xff;
  });
  return output;
}

function bytesToHex(bytes) {
  return Array.from(bytes || [], (byte) => Number(byte).toString(16).padStart(2, "0")).join("");
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

function extractLegacyEntitlementInputs(payload = {}) {
  return {
    derivationVersion: DEFAULT_LEGACY_ENTITLEMENT_VERSION,
    protocol: normalizeLegacyProtocol(payload.protocol),
    identityKind: normalizeOptionalString(payload.identityKind) || "zotero-user-id",
    identityValue: normalizeOptionalString(payload.identityValue),
    hostBinding: normalizeUnlockHostBinding(payload.hostBinding),
    legacySecret: normalizeOptionalString(payload.legacySecret),
    responsePayload: payload.responsePayload,
    seed: Object.prototype.hasOwnProperty.call(payload, "seed")
      ? normalizeDigestSeed(payload.seed)
      : null,
    timeoutMs: toInteger(payload.timeoutMs, DEFAULT_TIMEOUT_MS),
  };
}

function buildLegacyHostBindingInput(hostBinding = null) {
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

function computeLegacyRequestFromResource(resource, inputs = {}) {
  const digestExports = requireDigestExports(resource);
  const identityValue = normalizeOptionalString(inputs.identityValue);
  const legacySecret = normalizeOptionalString(inputs.legacySecret);
  if (!identityValue) {
    throw new Error("legacy entitlement identity is unavailable");
  }
  if (!legacySecret) {
    throw new Error("legacy entitlement secret is unavailable");
  }

  const protocol = normalizeLegacyProtocol(inputs.protocol);
  const hostBinding = normalizeUnlockHostBinding(inputs.hostBinding);
  const encodedSecret = base64EncodeUTF8(legacySecret);
  const serial = hmacMD5Hex(identityValue, encodedSecret);
  const expectedResponseToken = hmacMD5Hex(base64EncodeUTF8(identityValue), encodedSecret);
  const hostBindingInput = buildLegacyHostBindingInput(hostBinding);
  const hostBindingDigest = computeDigestFromExports(digestExports, {
    text: `legacy-host\n${hostBindingInput}`,
    seed: inputs.seed,
  });
  const canonicalInput = [
    `derivationVersion=${normalizeOptionalString(inputs.derivationVersion) || DEFAULT_LEGACY_ENTITLEMENT_VERSION}`,
    `protocol=${protocol}`,
    `identityKind=${normalizeOptionalString(inputs.identityKind) || "zotero-user-id"}`,
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
    derivationVersion: normalizeOptionalString(inputs.derivationVersion) || DEFAULT_LEGACY_ENTITLEMENT_VERSION,
    requestFields: {
      username: identityValue,
      serial,
    },
    cacheFingerprint: `lg0-${requestDigest.digestHex}-${hostBindingDigest.digestHex}`,
    hostBindingDigest: hostBindingDigest.digestHex,
    requestDigestHex: requestDigest.digestHex,
    compactGateHex: compactGate.digestHex,
    expectedResponseToken,
    hostBinding,
  };
}

function computeLegacyEvaluationFromResource(resource, inputs = {}) {
  const prepared = computeLegacyRequestFromResource(resource, inputs);
  const digestExports = requireDigestExports(resource);
  const responseToken = readLegacyResponseToken(inputs.responsePayload);
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

  return {
    mode: prepared.mode,
    protocol: prepared.protocol,
    derivationVersion: prepared.derivationVersion,
    gateSatisfied,
    compactGateHex: prepared.compactGateHex,
    validationDigestHex: validationDigest.digestHex,
    cacheFingerprint: prepared.cacheFingerprint,
    hostBindingDigest: prepared.hostBindingDigest,
    failureKind: gateSatisfied ? null : "gate-mismatch",
  };
}

function computeUnlockDerivationFromResource(resource, inputs = {}) {
  const digestExports = requireDigestExports(resource);
  const hostBinding = normalizeUnlockHostBinding(inputs.hostBinding);
  const activation = resolveUnlockActivation(hostBinding);
  const canonicalInput = buildUnlockCanonicalInput({
    derivationVersion: inputs.derivationVersion,
    bundleSeed: inputs.bundleSeed,
    overlayVersion: inputs.overlayVersion,
    hostBinding,
  });
  const inputDigest = computeDigestFromExports(digestExports, {
    text: canonicalInput,
    seed: inputs.seed,
  });
  const stage2Digest = computeDigestFromExports(digestExports, {
    text: `stage2\n${canonicalInput}`,
    seed: inputDigest.digestUint32,
  });
  const unlockToken = computeDigestFromExports(digestExports, {
    text: `unlock\n${canonicalInput}\nstage2=${stage2Digest.digestHex}`,
    seed: stage2Digest.digestUint32,
  });

  return {
    derivationVersion: normalizeOptionalString(inputs.derivationVersion) || DEFAULT_UNLOCK_DERIVATION_VERSION,
    bundleSeed: normalizeUnlockBundleSeed(inputs.bundleSeed),
    overlayVersion: normalizeUnlockOverlayVersion(inputs.overlayVersion),
    hostBinding,
    activationRequirements: activation.requirements,
    activationMissing: activation.missing,
    activationSatisfied: activation.satisfied,
    shadowWouldApply: activation.satisfied,
    canonicalInputLength: canonicalInput.length,
    inputDigest,
    stage2Digest,
    unlockToken,
  };
}

function buildMainThreadProbeSnapshot({
  resource,
  inputs,
  sum,
  cacheHit = false,
  initDurationMs = 0,
  invokeDurationMs = 0,
} = {}) {
  return {
    ok: true,
    transport: "main-thread",
    url: resource?.url || null,
    bytesLength: Number(resource?.bytesLength || 0),
    exportNames: readExportNames(resource?.exports || {}),
    left: inputs.left,
    right: inputs.right,
    expectedSum: inputs.expectedSum,
    sum,
    matchesExpected: sum === inputs.expectedSum,
    cacheHit: Boolean(cacheHit),
    timing: buildTimingSnapshot({
      initDurationMs,
      invokeDurationMs,
    }),
  };
}

function buildWorkerProbeSnapshot(message, inputs, timing = {}) {
  const payload = message?.payload && typeof message.payload === "object"
    ? message.payload
    : {};
  const sum = Number(payload.sum);
  return {
    ok: true,
    transport: "worker",
    workerURL: typeof payload.workerURL === "string" ? payload.workerURL : null,
    wasmURL: typeof payload.wasmURL === "string" ? payload.wasmURL : null,
    bytesLength: Number(payload.bytesLength || 0),
    exportNames: Array.isArray(payload.exportNames) ? payload.exportNames.slice() : [],
    left: toInteger(payload.left, inputs.left),
    right: toInteger(payload.right, inputs.right),
    expectedSum: inputs.expectedSum,
    sum,
    matchesExpected: sum === inputs.expectedSum,
    timing: buildTimingSnapshot(timing),
  };
}

function buildMainThreadDigestSnapshot({
  resource,
  derived,
  cacheHit = false,
  initDurationMs = 0,
  invokeDurationMs = 0,
} = {}) {
  return {
    ok: true,
    transport: "main-thread",
    url: resource?.url || null,
    bytesLength: Number(resource?.bytesLength || 0),
    exportNames: readExportNames(resource?.exports || {}),
    textLength: Number(derived?.textLength || 0),
    byteLength: Number(derived?.byteLength || 0),
    seedUint32: toUint32(derived?.seedUint32 || 0),
    digestUint32: toUint32(derived?.digestUint32 || 0),
    digestHex: String(derived?.digestHex || "").trim() || "00000000",
    cacheHit: Boolean(cacheHit),
    timing: buildTimingSnapshot({
      initDurationMs,
      invokeDurationMs,
    }),
  };
}

function buildWorkerDigestSnapshot(message, timing = {}) {
  const payload = message?.payload && typeof message.payload === "object"
    ? message.payload
    : {};
  return {
    ok: true,
    transport: "worker",
    workerURL: typeof payload.workerURL === "string" ? payload.workerURL : null,
    wasmURL: typeof payload.wasmURL === "string" ? payload.wasmURL : null,
    bytesLength: Number(payload.bytesLength || 0),
    exportNames: Array.isArray(payload.exportNames) ? payload.exportNames.slice() : [],
    textLength: Number(payload.textLength || 0),
    byteLength: Number(payload.byteLength || 0),
    seedUint32: toUint32(payload.seedUint32 || 0),
    digestUint32: toUint32(payload.digestUint32 || 0),
    digestHex: String(payload.digestHex || "").trim() || "00000000",
    timing: buildTimingSnapshot(timing),
  };
}

function buildMainThreadUnlockSnapshot({
  resource,
  derived,
  cacheHit = false,
  initDurationMs = 0,
  invokeDurationMs = 0,
} = {}) {
  return {
    ok: true,
    transport: "main-thread",
    url: resource?.url || null,
    bytesLength: Number(resource?.bytesLength || 0),
    exportNames: readExportNames(resource?.exports || {}),
    derivationVersion: normalizeOptionalString(derived?.derivationVersion) || DEFAULT_UNLOCK_DERIVATION_VERSION,
    bundleSeed: normalizeUnlockBundleSeed(derived?.bundleSeed),
    overlayVersion: normalizeUnlockOverlayVersion(derived?.overlayVersion),
    hostBinding: clone(derived?.hostBinding || normalizeUnlockHostBinding()),
    activationRequirements: Array.isArray(derived?.activationRequirements)
      ? derived.activationRequirements.slice()
      : HOST_UNLOCK_REQUIREMENTS.slice(),
    activationMissing: Array.isArray(derived?.activationMissing)
      ? derived.activationMissing.slice()
      : [],
    activationSatisfied: Boolean(derived?.activationSatisfied),
    shadowWouldApply: Boolean(derived?.shadowWouldApply),
    canonicalInputLength: Number(derived?.canonicalInputLength || 0),
    inputDigestUint32: toUint32(derived?.inputDigest?.digestUint32 || 0),
    inputDigestHex: String(derived?.inputDigest?.digestHex || "").trim() || "00000000",
    stage2DigestUint32: toUint32(derived?.stage2Digest?.digestUint32 || 0),
    stage2DigestHex: String(derived?.stage2Digest?.digestHex || "").trim() || "00000000",
    unlockTokenUint32: toUint32(derived?.unlockToken?.digestUint32 || 0),
    unlockTokenHex: String(derived?.unlockToken?.digestHex || "").trim() || "00000000",
    cacheHit: Boolean(cacheHit),
    timing: buildTimingSnapshot({
      initDurationMs,
      invokeDurationMs,
    }),
  };
}

function buildWorkerUnlockSnapshot(message, timing = {}) {
  const payload = message?.payload && typeof message.payload === "object"
    ? message.payload
    : {};
  return {
    ok: true,
    transport: "worker",
    workerURL: typeof payload.workerURL === "string" ? payload.workerURL : null,
    wasmURL: typeof payload.wasmURL === "string" ? payload.wasmURL : null,
    bytesLength: Number(payload.bytesLength || 0),
    exportNames: Array.isArray(payload.exportNames) ? payload.exportNames.slice() : [],
    derivationVersion: normalizeOptionalString(payload.derivationVersion) || DEFAULT_UNLOCK_DERIVATION_VERSION,
    bundleSeed: normalizeUnlockBundleSeed(payload.bundleSeed),
    overlayVersion: normalizeUnlockOverlayVersion(payload.overlayVersion),
    hostBinding: normalizeUnlockHostBinding(payload.hostBinding),
    activationRequirements: Array.isArray(payload.activationRequirements)
      ? payload.activationRequirements.slice()
      : HOST_UNLOCK_REQUIREMENTS.slice(),
    activationMissing: Array.isArray(payload.activationMissing)
      ? payload.activationMissing.slice()
      : [],
    activationSatisfied: Boolean(payload.activationSatisfied),
    shadowWouldApply: Boolean(payload.shadowWouldApply),
    canonicalInputLength: Number(payload.canonicalInputLength || 0),
    inputDigestUint32: toUint32(payload.inputDigestUint32 || 0),
    inputDigestHex: String(payload.inputDigestHex || "").trim() || "00000000",
    stage2DigestUint32: toUint32(payload.stage2DigestUint32 || 0),
    stage2DigestHex: String(payload.stage2DigestHex || "").trim() || "00000000",
    unlockTokenUint32: toUint32(payload.unlockTokenUint32 || 0),
    unlockTokenHex: String(payload.unlockTokenHex || "").trim() || "00000000",
    timing: buildTimingSnapshot(timing),
  };
}

function buildMainThreadLegacyRequestSnapshot({
  resource,
  derived,
  cacheHit = false,
  initDurationMs = 0,
  invokeDurationMs = 0,
} = {}) {
  return {
    ok: true,
    transport: "main-thread",
    url: resource?.url || null,
    bytesLength: Number(resource?.bytesLength || 0),
    exportNames: readExportNames(resource?.exports || {}),
    mode: String(derived?.mode || "legacy-backend-v0"),
    protocol: normalizeLegacyProtocol(derived?.protocol),
    derivationVersion: normalizeOptionalString(derived?.derivationVersion) || DEFAULT_LEGACY_ENTITLEMENT_VERSION,
    requestFields: {
      username: normalizeOptionalString(derived?.requestFields?.username),
      serial: normalizeOptionalString(derived?.requestFields?.serial),
    },
    cacheFingerprint: normalizeOptionalString(derived?.cacheFingerprint),
    hostBindingDigest: normalizeOptionalString(derived?.hostBindingDigest),
    requestDigestHex: normalizeOptionalString(derived?.requestDigestHex),
    compactGateHex: normalizeOptionalString(derived?.compactGateHex),
    cacheHit: Boolean(cacheHit),
    timing: buildTimingSnapshot({
      initDurationMs,
      invokeDurationMs,
    }),
  };
}

function buildWorkerLegacyRequestSnapshot(message, timing = {}) {
  const payload = message?.payload && typeof message.payload === "object"
    ? message.payload
    : {};
  return {
    ok: true,
    transport: "worker",
    workerURL: typeof payload.workerURL === "string" ? payload.workerURL : null,
    wasmURL: typeof payload.wasmURL === "string" ? payload.wasmURL : null,
    bytesLength: Number(payload.bytesLength || 0),
    exportNames: Array.isArray(payload.exportNames) ? payload.exportNames.slice() : [],
    mode: String(payload.mode || "legacy-backend-v0"),
    protocol: normalizeLegacyProtocol(payload.protocol),
    derivationVersion: normalizeOptionalString(payload.derivationVersion) || DEFAULT_LEGACY_ENTITLEMENT_VERSION,
    requestFields: {
      username: normalizeOptionalString(payload.requestFields?.username),
      serial: normalizeOptionalString(payload.requestFields?.serial),
    },
    cacheFingerprint: normalizeOptionalString(payload.cacheFingerprint),
    hostBindingDigest: normalizeOptionalString(payload.hostBindingDigest),
    requestDigestHex: normalizeOptionalString(payload.requestDigestHex),
    compactGateHex: normalizeOptionalString(payload.compactGateHex),
    timing: buildTimingSnapshot(timing),
  };
}

function buildMainThreadLegacyEvaluationSnapshot({
  resource,
  derived,
  cacheHit = false,
  initDurationMs = 0,
  invokeDurationMs = 0,
} = {}) {
  return {
    ok: true,
    transport: "main-thread",
    url: resource?.url || null,
    bytesLength: Number(resource?.bytesLength || 0),
    exportNames: readExportNames(resource?.exports || {}),
    mode: String(derived?.mode || "legacy-backend-v0"),
    protocol: normalizeLegacyProtocol(derived?.protocol),
    derivationVersion: normalizeOptionalString(derived?.derivationVersion) || DEFAULT_LEGACY_ENTITLEMENT_VERSION,
    gateSatisfied: Boolean(derived?.gateSatisfied),
    compactGateHex: normalizeOptionalString(derived?.compactGateHex),
    validationDigestHex: normalizeOptionalString(derived?.validationDigestHex),
    cacheFingerprint: normalizeOptionalString(derived?.cacheFingerprint),
    hostBindingDigest: normalizeOptionalString(derived?.hostBindingDigest),
    failureKind: normalizeOptionalString(derived?.failureKind),
    cacheHit: Boolean(cacheHit),
    timing: buildTimingSnapshot({
      initDurationMs,
      invokeDurationMs,
    }),
  };
}

function buildWorkerLegacyEvaluationSnapshot(message, timing = {}) {
  const payload = message?.payload && typeof message.payload === "object"
    ? message.payload
    : {};
  return {
    ok: true,
    transport: "worker",
    workerURL: typeof payload.workerURL === "string" ? payload.workerURL : null,
    wasmURL: typeof payload.wasmURL === "string" ? payload.wasmURL : null,
    bytesLength: Number(payload.bytesLength || 0),
    exportNames: Array.isArray(payload.exportNames) ? payload.exportNames.slice() : [],
    mode: String(payload.mode || "legacy-backend-v0"),
    protocol: normalizeLegacyProtocol(payload.protocol),
    derivationVersion: normalizeOptionalString(payload.derivationVersion) || DEFAULT_LEGACY_ENTITLEMENT_VERSION,
    gateSatisfied: Boolean(payload.gateSatisfied),
    compactGateHex: normalizeOptionalString(payload.compactGateHex),
    validationDigestHex: normalizeOptionalString(payload.validationDigestHex),
    cacheFingerprint: normalizeOptionalString(payload.cacheFingerprint),
    hostBindingDigest: normalizeOptionalString(payload.hostBindingDigest),
    failureKind: normalizeOptionalString(payload.failureKind),
    timing: buildTimingSnapshot(timing),
  };
}

function buildTransportTimingSummary({
  mode,
  startedAt,
  finishedAt,
  mainThread,
  worker,
} = {}) {
  const transports = [mainThread, worker]
    .filter((entry) => entry?.ok === true && entry?.timing)
    .map((entry) => ({
      transport: String(entry.transport || "unknown"),
      ...buildTimingSnapshot(entry.timing),
    }));

  const totalInitDurationMs = transports
    .reduce((sum, entry) => sum + Number(entry.initDurationMs || 0), 0);
  const totalInvokeDurationMs = transports
    .reduce((sum, entry) => sum + Number(entry.invokeDurationMs || 0), 0);
  const measuredTransportDurationMs = transports
    .reduce((sum, entry) => sum + Number(entry.totalDurationMs || 0), 0);
  const slowestTransport = transports
    .slice()
    .sort((left, right) => Number(right.totalDurationMs || 0) - Number(left.totalDurationMs || 0))[0]?.transport || null;

  return {
    mode: String(mode || DEFAULT_TRANSPORT_MODE),
    transportCount: transports.length,
    totalDurationMs: toDurationMs(startedAt, finishedAt),
    initDurationMs: totalInitDurationMs,
    invokeDurationMs: totalInvokeDurationMs,
    totalInitDurationMs,
    totalInvokeDurationMs,
    measuredTransportDurationMs,
    slowestTransport,
    transports,
  };
}

export function createWasmKernelProbe({
  config,
  logger,
  rootURI = "",
  fetchImpl = globalThis.fetch,
  WebAssemblyImpl = globalThis.WebAssembly,
  WorkerCtor = globalThis.ChromeWorker || globalThis.Worker,
  wasmRelativePath = DEFAULT_WASM_PROBE_RELATIVE_PATH,
  workerRelativePath = DEFAULT_WASM_PROBE_WORKER_RELATIVE_PATH,
} = {}) {
  const addonRef = String(config?.addonRef || "").trim() || "cleanroomtemplate";

  const moduleLoader = createWasmModuleLoader({
    id: `${addonRef}.wasm-probe.module`,
    label: "Wasm Probe Module",
    rootURI,
    relativePath: wasmRelativePath,
    fetchImpl,
    WebAssemblyImpl,
    logger,
  });

  const workerController = createWasmWorkerController({
    id: `${addonRef}.wasm-probe.worker`,
    label: "Wasm Probe Worker",
    rootURI: "",
    workerRelativePath: buildChromeContentURL(addonRef, workerRelativePath),
    wasmRelativePath,
    WorkerCtor,
    buildInitMessage({
      rootURI: effectiveRootURI = "",
      wasmRelativePath: effectiveWasmRelativePath = wasmRelativePath,
    } = {}) {
      return {
        type: "INIT",
        rootURI: effectiveRootURI,
        wasmRelativePath: effectiveWasmRelativePath,
        wasmURL: buildChromeContentURL(addonRef, effectiveWasmRelativePath),
      };
    },
    logger,
  });

  async function initModule(payload = {}) {
    return await moduleLoader.init({
      rootURI: Object.prototype.hasOwnProperty.call(payload, "rootURI")
        ? payload.rootURI
        : rootURI,
      relativePath: Object.prototype.hasOwnProperty.call(payload, "wasmRelativePath")
        ? payload.wasmRelativePath
        : wasmRelativePath,
      fetchImpl: Object.prototype.hasOwnProperty.call(payload, "fetchImpl")
        ? payload.fetchImpl
        : fetchImpl,
      WebAssemblyImpl: Object.prototype.hasOwnProperty.call(payload, "WebAssemblyImpl")
        ? payload.WebAssemblyImpl
        : WebAssemblyImpl,
    });
  }

  async function initWorker(payload = {}) {
    return await workerController.init({
      rootURI: "",
      workerRelativePath: Object.prototype.hasOwnProperty.call(payload, "workerRelativePath")
        ? payload.workerRelativePath
        : buildChromeContentURL(addonRef, workerRelativePath),
      wasmRelativePath: Object.prototype.hasOwnProperty.call(payload, "wasmRelativePath")
        ? payload.wasmRelativePath
        : wasmRelativePath,
      WorkerCtor: Object.prototype.hasOwnProperty.call(payload, "WorkerCtor")
        ? payload.WorkerCtor
        : WorkerCtor,
    });
  }

  async function runMainThreadProbe(payload = {}) {
    const inputs = extractProbeInputs(payload);
    const cacheHit = moduleLoader.isReady();
    const initStartedAt = nowMs();
    const resource = await initModule(payload);
    const initDurationMs = toDurationMs(initStartedAt);
    const add = requireProbeExport(resource);
    const invokeStartedAt = nowMs();
    const sum = add(inputs.left, inputs.right);
    const invokeDurationMs = toDurationMs(invokeStartedAt);
    return buildMainThreadProbeSnapshot({
      resource,
      inputs,
      sum,
      cacheHit,
      initDurationMs,
      invokeDurationMs,
    });
  }

  async function runWorkerProbe(payload = {}) {
    const inputs = extractProbeInputs(payload);
    const initStartedAt = nowMs();
    const controller = await initWorker(payload);
    const initDurationMs = toDurationMs(initStartedAt);

    try {
      const invokeStartedAt = nowMs();
      const message = await controller.request("PROBE", {
        left: inputs.left,
        right: inputs.right,
      }, {
        timeoutMs: inputs.timeoutMs,
      });
      const invokeDurationMs = toDurationMs(invokeStartedAt);
      return buildWorkerProbeSnapshot(message, inputs, {
        initDurationMs,
        invokeDurationMs,
      });
    } finally {
      await workerController.dispose();
    }
  }

  async function runMainThreadDigest(payload = {}) {
    const inputs = extractDigestInputs(payload);
    const cacheHit = moduleLoader.isReady();
    const initStartedAt = nowMs();
    const resource = await initModule(payload);
    const initDurationMs = toDurationMs(initStartedAt);
    const invokeStartedAt = nowMs();
    const derived = computeDigestFromResource(resource, inputs);
    const invokeDurationMs = toDurationMs(invokeStartedAt);
    return buildMainThreadDigestSnapshot({
      resource,
      derived,
      cacheHit,
      initDurationMs,
      invokeDurationMs,
    });
  }

  async function runWorkerDigest(payload = {}) {
    const inputs = extractDigestInputs(payload);
    const initStartedAt = nowMs();
    const controller = await initWorker(payload);
    const initDurationMs = toDurationMs(initStartedAt);

    try {
      const invokeStartedAt = nowMs();
      const message = await controller.request("DIGEST", {
        text: inputs.text,
        seed: inputs.seed,
      }, {
        timeoutMs: inputs.timeoutMs,
      });
      const invokeDurationMs = toDurationMs(invokeStartedAt);
      return buildWorkerDigestSnapshot(message, {
        initDurationMs,
        invokeDurationMs,
      });
    } finally {
      await workerController.dispose();
    }
  }

  async function runMainThreadUnlockDerivation(payload = {}) {
    const inputs = extractUnlockInputs(payload);
    const cacheHit = moduleLoader.isReady();
    const initStartedAt = nowMs();
    const resource = await initModule(payload);
    const initDurationMs = toDurationMs(initStartedAt);
    const invokeStartedAt = nowMs();
    const derived = computeUnlockDerivationFromResource(resource, inputs);
    const invokeDurationMs = toDurationMs(invokeStartedAt);
    return buildMainThreadUnlockSnapshot({
      resource,
      derived,
      cacheHit,
      initDurationMs,
      invokeDurationMs,
    });
  }

  async function runWorkerUnlockDerivation(payload = {}) {
    const inputs = extractUnlockInputs(payload);
    const initStartedAt = nowMs();
    const controller = await initWorker(payload);
    const initDurationMs = toDurationMs(initStartedAt);

    try {
      const invokeStartedAt = nowMs();
      const message = await controller.request("UNLOCK", {
        bundleSeed: inputs.bundleSeed,
        overlayVersion: inputs.overlayVersion,
        hostBinding: inputs.hostBinding,
        seed: inputs.seed,
      }, {
        timeoutMs: inputs.timeoutMs,
      });
      const invokeDurationMs = toDurationMs(invokeStartedAt);
      return buildWorkerUnlockSnapshot(message, {
        initDurationMs,
        invokeDurationMs,
      });
    } finally {
      await workerController.dispose();
    }
  }

  async function runMainThreadLegacyEntitlementRequest(payload = {}) {
    const inputs = extractLegacyEntitlementInputs(payload);
    const cacheHit = moduleLoader.isReady();
    const initStartedAt = nowMs();
    const resource = await initModule(payload);
    const initDurationMs = toDurationMs(initStartedAt);
    const invokeStartedAt = nowMs();
    const derived = computeLegacyRequestFromResource(resource, inputs);
    const invokeDurationMs = toDurationMs(invokeStartedAt);
    return buildMainThreadLegacyRequestSnapshot({
      resource,
      derived,
      cacheHit,
      initDurationMs,
      invokeDurationMs,
    });
  }

  async function runWorkerLegacyEntitlementRequest(payload = {}) {
    const inputs = extractLegacyEntitlementInputs(payload);
    const initStartedAt = nowMs();
    const controller = await initWorker(payload);
    const initDurationMs = toDurationMs(initStartedAt);

    try {
      const invokeStartedAt = nowMs();
      const message = await controller.request("LEGACY_ENTITLEMENT_REQUEST", {
        protocol: inputs.protocol,
        identityKind: inputs.identityKind,
        identityValue: inputs.identityValue,
        hostBinding: inputs.hostBinding,
        legacySecret: inputs.legacySecret,
        seed: inputs.seed,
      }, {
        timeoutMs: inputs.timeoutMs,
      });
      const invokeDurationMs = toDurationMs(invokeStartedAt);
      return buildWorkerLegacyRequestSnapshot(message, {
        initDurationMs,
        invokeDurationMs,
      });
    } finally {
      await workerController.dispose();
    }
  }

  async function runMainThreadLegacyEntitlementEvaluation(payload = {}) {
    const inputs = extractLegacyEntitlementInputs(payload);
    const cacheHit = moduleLoader.isReady();
    const initStartedAt = nowMs();
    const resource = await initModule(payload);
    const initDurationMs = toDurationMs(initStartedAt);
    const invokeStartedAt = nowMs();
    const derived = computeLegacyEvaluationFromResource(resource, inputs);
    const invokeDurationMs = toDurationMs(invokeStartedAt);
    return buildMainThreadLegacyEvaluationSnapshot({
      resource,
      derived,
      cacheHit,
      initDurationMs,
      invokeDurationMs,
    });
  }

  async function runWorkerLegacyEntitlementEvaluation(payload = {}) {
    const inputs = extractLegacyEntitlementInputs(payload);
    const initStartedAt = nowMs();
    const controller = await initWorker(payload);
    const initDurationMs = toDurationMs(initStartedAt);

    try {
      const invokeStartedAt = nowMs();
      const message = await controller.request("LEGACY_ENTITLEMENT_RESPONSE", {
        protocol: inputs.protocol,
        identityKind: inputs.identityKind,
        identityValue: inputs.identityValue,
        hostBinding: inputs.hostBinding,
        legacySecret: inputs.legacySecret,
        responsePayload: inputs.responsePayload,
        seed: inputs.seed,
      }, {
        timeoutMs: inputs.timeoutMs,
      });
      const invokeDurationMs = toDurationMs(invokeStartedAt);
      return buildWorkerLegacyEvaluationSnapshot(message, {
        initDurationMs,
        invokeDurationMs,
      });
    } finally {
      await workerController.dispose();
    }
  }

  async function runProbe(payload = {}) {
    const startedAt = nowMs();
    const mode = normalizeTransportMode(payload.mode);
    const result = {
      ok: true,
      mode,
      rootURI: Object.prototype.hasOwnProperty.call(payload, "rootURI")
        ? String(payload.rootURI || "")
        : String(rootURI || ""),
      wasmRelativePath: Object.prototype.hasOwnProperty.call(payload, "wasmRelativePath")
        ? String(payload.wasmRelativePath || "")
        : String(wasmRelativePath || ""),
      workerRelativePath: Object.prototype.hasOwnProperty.call(payload, "workerRelativePath")
        ? String(payload.workerRelativePath || "")
        : String(workerRelativePath || ""),
      mainThread: null,
      worker: null,
      errors: [],
      consistentAcrossTransports: null,
    };

    if (mode === "main-thread" || mode === "both") {
      try {
        result.mainThread = await runMainThreadProbe(payload);
        result.ok = result.ok && result.mainThread.matchesExpected;
      } catch (error) {
        result.mainThread = {
          ok: false,
          errorMessage: toErrorMessage(error),
        };
        result.errors.push({
          transport: "main-thread",
          message: result.mainThread.errorMessage,
        });
        result.ok = false;
      }
    }

    if (mode === "worker" || mode === "both") {
      try {
        result.worker = await runWorkerProbe(payload);
        result.ok = result.ok && result.worker.matchesExpected;
      } catch (error) {
        result.worker = {
          ok: false,
          errorMessage: toErrorMessage(error),
        };
        result.errors.push({
          transport: "worker",
          message: result.worker.errorMessage,
        });
        result.ok = false;
      }
    }

    if (result.mainThread?.ok && result.worker?.ok) {
      result.consistentAcrossTransports = result.mainThread.sum === result.worker.sum;
      result.ok = result.ok && result.consistentAcrossTransports;
      if (!result.consistentAcrossTransports) {
        result.errors.push({
          transport: "cross-check",
          message: "main-thread and worker sums diverged",
        });
      }
    }

    result.timingSummary = buildTransportTimingSummary({
      mode,
      startedAt,
      finishedAt: nowMs(),
      mainThread: result.mainThread,
      worker: result.worker,
    });

    return clone(result);
  }

  async function deriveDigest(payload = {}) {
    const startedAt = nowMs();
    const mode = normalizeTransportMode(payload.mode);
    const digestInputs = extractDigestInputs(payload);
    const result = {
      ok: true,
      mode,
      rootURI: Object.prototype.hasOwnProperty.call(payload, "rootURI")
        ? String(payload.rootURI || "")
        : String(rootURI || ""),
      wasmRelativePath: Object.prototype.hasOwnProperty.call(payload, "wasmRelativePath")
        ? String(payload.wasmRelativePath || "")
        : String(wasmRelativePath || ""),
      workerRelativePath: Object.prototype.hasOwnProperty.call(payload, "workerRelativePath")
        ? String(payload.workerRelativePath || "")
        : String(workerRelativePath || ""),
      textLength: digestInputs.text.length,
      seed: digestInputs.seed,
      mainThread: null,
      worker: null,
      errors: [],
      consistentAcrossTransports: null,
    };

    if (mode === "main-thread" || mode === "both") {
      try {
        result.mainThread = await runMainThreadDigest(payload);
      } catch (error) {
        result.mainThread = {
          ok: false,
          errorMessage: toErrorMessage(error),
        };
        result.errors.push({
          transport: "main-thread",
          message: result.mainThread.errorMessage,
        });
        result.ok = false;
      }
    }

    if (mode === "worker" || mode === "both") {
      try {
        result.worker = await runWorkerDigest(payload);
      } catch (error) {
        result.worker = {
          ok: false,
          errorMessage: toErrorMessage(error),
        };
        result.errors.push({
          transport: "worker",
          message: result.worker.errorMessage,
        });
        result.ok = false;
      }
    }

    if (result.mainThread?.ok && result.worker?.ok) {
      result.consistentAcrossTransports = result.mainThread.digestUint32 === result.worker.digestUint32;
      result.ok = result.ok && result.consistentAcrossTransports;
      if (!result.consistentAcrossTransports) {
        result.errors.push({
          transport: "cross-check",
          message: "main-thread and worker digests diverged",
        });
      }
    }

    result.timingSummary = buildTransportTimingSummary({
      mode,
      startedAt,
      finishedAt: nowMs(),
      mainThread: result.mainThread,
      worker: result.worker,
    });

    return clone(result);
  }

  async function deriveUnlockToken(payload = {}) {
    const startedAt = nowMs();
    const mode = normalizeTransportMode(payload.mode);
    const unlockInputs = extractUnlockInputs(payload);
    const activation = resolveUnlockActivation(unlockInputs.hostBinding);
    const result = {
      ok: true,
      mode,
      rootURI: Object.prototype.hasOwnProperty.call(payload, "rootURI")
        ? String(payload.rootURI || "")
        : String(rootURI || ""),
      wasmRelativePath: Object.prototype.hasOwnProperty.call(payload, "wasmRelativePath")
        ? String(payload.wasmRelativePath || "")
        : String(wasmRelativePath || ""),
      workerRelativePath: Object.prototype.hasOwnProperty.call(payload, "workerRelativePath")
        ? String(payload.workerRelativePath || "")
        : String(workerRelativePath || ""),
      derivationVersion: unlockInputs.derivationVersion,
      bundleSeed: unlockInputs.bundleSeed,
      overlayVersion: unlockInputs.overlayVersion,
      hostBinding: clone(unlockInputs.hostBinding),
      activationRequirements: activation.requirements.slice(),
      activationMissing: activation.missing.slice(),
      activationSatisfied: activation.satisfied,
      shadowWouldApply: activation.satisfied,
      mainThread: null,
      worker: null,
      errors: [],
      consistentAcrossTransports: null,
    };

    if (mode === "main-thread" || mode === "both") {
      try {
        result.mainThread = await runMainThreadUnlockDerivation(payload);
      } catch (error) {
        result.mainThread = {
          ok: false,
          errorMessage: toErrorMessage(error),
        };
        result.errors.push({
          transport: "main-thread",
          message: result.mainThread.errorMessage,
        });
        result.ok = false;
      }
    }

    if (mode === "worker" || mode === "both") {
      try {
        result.worker = await runWorkerUnlockDerivation(payload);
      } catch (error) {
        result.worker = {
          ok: false,
          errorMessage: toErrorMessage(error),
        };
        result.errors.push({
          transport: "worker",
          message: result.worker.errorMessage,
        });
        result.ok = false;
      }
    }

    if (result.mainThread?.ok && result.worker?.ok) {
      result.consistentAcrossTransports = result.mainThread.stage2DigestUint32 === result.worker.stage2DigestUint32
        && result.mainThread.unlockTokenUint32 === result.worker.unlockTokenUint32;
      result.ok = result.ok && result.consistentAcrossTransports;
      if (!result.consistentAcrossTransports) {
        result.errors.push({
          transport: "cross-check",
          message: "main-thread and worker unlock derivations diverged",
        });
      }
    }

    result.timingSummary = buildTransportTimingSummary({
      mode,
      startedAt,
      finishedAt: nowMs(),
      mainThread: result.mainThread,
      worker: result.worker,
    });

    return clone(result);
  }

  async function prepareLegacyEntitlementRequest(payload = {}) {
    const startedAt = nowMs();
    const mode = normalizeTransportMode(payload.mode || "main-thread");
    const inputs = extractLegacyEntitlementInputs(payload);
    const result = {
      ok: true,
      mode,
      rootURI: Object.prototype.hasOwnProperty.call(payload, "rootURI")
        ? String(payload.rootURI || "")
        : String(rootURI || ""),
      wasmRelativePath: Object.prototype.hasOwnProperty.call(payload, "wasmRelativePath")
        ? String(payload.wasmRelativePath || "")
        : String(wasmRelativePath || ""),
      workerRelativePath: Object.prototype.hasOwnProperty.call(payload, "workerRelativePath")
        ? String(payload.workerRelativePath || "")
        : String(workerRelativePath || ""),
      protocol: inputs.protocol,
      identityKind: inputs.identityKind,
      mainThread: null,
      worker: null,
      errors: [],
      consistentAcrossTransports: null,
    };

    if (mode === "main-thread" || mode === "both") {
      try {
        result.mainThread = await runMainThreadLegacyEntitlementRequest(payload);
      } catch (error) {
        result.mainThread = {
          ok: false,
          errorMessage: toErrorMessage(error),
        };
        result.errors.push({
          transport: "main-thread",
          message: result.mainThread.errorMessage,
        });
        result.ok = false;
      }
    }

    if (mode === "worker" || mode === "both") {
      try {
        result.worker = await runWorkerLegacyEntitlementRequest(payload);
      } catch (error) {
        result.worker = {
          ok: false,
          errorMessage: toErrorMessage(error),
        };
        result.errors.push({
          transport: "worker",
          message: result.worker.errorMessage,
        });
        result.ok = false;
      }
    }

    if (result.mainThread?.ok && result.worker?.ok) {
      result.consistentAcrossTransports = result.mainThread.cacheFingerprint === result.worker.cacheFingerprint
        && result.mainThread.compactGateHex === result.worker.compactGateHex;
      result.ok = result.ok && result.consistentAcrossTransports;
      if (!result.consistentAcrossTransports) {
        result.errors.push({
          transport: "cross-check",
          message: "main-thread and worker entitlement request derivations diverged",
        });
      }
    }

    result.timingSummary = buildTransportTimingSummary({
      mode,
      startedAt,
      finishedAt: nowMs(),
      mainThread: result.mainThread,
      worker: result.worker,
    });

    if (mode === "main-thread" && result.mainThread?.ok) {
      return clone({
        ...result.mainThread,
        ok: result.ok,
        mode: result.mainThread.mode,
        timingSummary: result.timingSummary,
      });
    }

    return clone(result);
  }

  async function evaluateLegacyEntitlementResponse(payload = {}) {
    const startedAt = nowMs();
    const mode = normalizeTransportMode(payload.mode || "main-thread");
    const inputs = extractLegacyEntitlementInputs(payload);
    const result = {
      ok: true,
      mode,
      rootURI: Object.prototype.hasOwnProperty.call(payload, "rootURI")
        ? String(payload.rootURI || "")
        : String(rootURI || ""),
      wasmRelativePath: Object.prototype.hasOwnProperty.call(payload, "wasmRelativePath")
        ? String(payload.wasmRelativePath || "")
        : String(wasmRelativePath || ""),
      workerRelativePath: Object.prototype.hasOwnProperty.call(payload, "workerRelativePath")
        ? String(payload.workerRelativePath || "")
        : String(workerRelativePath || ""),
      protocol: inputs.protocol,
      identityKind: inputs.identityKind,
      mainThread: null,
      worker: null,
      errors: [],
      consistentAcrossTransports: null,
    };

    if (mode === "main-thread" || mode === "both") {
      try {
        result.mainThread = await runMainThreadLegacyEntitlementEvaluation(payload);
      } catch (error) {
        result.mainThread = {
          ok: false,
          errorMessage: toErrorMessage(error),
        };
        result.errors.push({
          transport: "main-thread",
          message: result.mainThread.errorMessage,
        });
        result.ok = false;
      }
    }

    if (mode === "worker" || mode === "both") {
      try {
        result.worker = await runWorkerLegacyEntitlementEvaluation(payload);
      } catch (error) {
        result.worker = {
          ok: false,
          errorMessage: toErrorMessage(error),
        };
        result.errors.push({
          transport: "worker",
          message: result.worker.errorMessage,
        });
        result.ok = false;
      }
    }

    if (result.mainThread?.ok && result.worker?.ok) {
      result.consistentAcrossTransports = result.mainThread.gateSatisfied === result.worker.gateSatisfied
        && result.mainThread.validationDigestHex === result.worker.validationDigestHex;
      result.ok = result.ok && result.consistentAcrossTransports;
      if (!result.consistentAcrossTransports) {
        result.errors.push({
          transport: "cross-check",
          message: "main-thread and worker entitlement response evaluations diverged",
        });
      }
    }

    result.timingSummary = buildTransportTimingSummary({
      mode,
      startedAt,
      finishedAt: nowMs(),
      mainThread: result.mainThread,
      worker: result.worker,
    });

    if (mode === "main-thread" && result.mainThread?.ok) {
      return clone({
        ...result.mainThread,
        ok: result.ok,
        mode: result.mainThread.mode,
        timingSummary: result.timingSummary,
      });
    }

    return clone(result);
  }

  async function close() {
    await Promise.allSettled([
      moduleLoader.dispose(),
      workerController.dispose(),
    ]);
  }

  return {
    runProbe,
    runMainThreadProbe,
    runWorkerProbe,
    deriveDigest,
    runMainThreadDigest,
    runWorkerDigest,
    deriveUnlockToken,
    runMainThreadUnlockDerivation,
    runWorkerUnlockDerivation,
    prepareLegacyEntitlementRequest,
    evaluateLegacyEntitlementResponse,
    runMainThreadLegacyEntitlementRequest,
    runWorkerLegacyEntitlementRequest,
    runMainThreadLegacyEntitlementEvaluation,
    runWorkerLegacyEntitlementEvaluation,
    close,
    getStatus() {
      return {
        module: moduleLoader.getStatus(),
        worker: workerController.getStatus(),
      };
    },
  };
}
