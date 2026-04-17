import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createCapabilityManifest as createSourceCapabilityManifest } from "../src/app/capability-manifest.js";
import {
  createScriptError,
  wrapScriptError,
} from "./script-runtime-lib.mjs";

export const ENCRYPTED_PACKAGE_VARIANT = "encrypted";
export const SHIELDED_PACKAGE_VARIANT = "shielded";
export const SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT = "shielded-descriptor-bind";
export const SHIELDED_JSCONFUSER_STRING_PACKAGE_VARIANT = "shielded-jsconfuser-string";
export const ENCRYPTED_BUNDLE_MARKER = "__CLEANROOM_ENCRYPTED_BUNDLE__";
export const SHIELDED_BUNDLE_MARKER = "__CLEANROOM_SHIELDED_BUNDLE__";

function isShieldedProtectedVariant(variant) {
  const normalizedVariant = String(variant || "").trim().toLowerCase();
  return normalizedVariant === SHIELDED_PACKAGE_VARIANT
    || normalizedVariant === SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT
    || normalizedVariant === SHIELDED_JSCONFUSER_STRING_PACKAGE_VARIANT;
}

function resolveProtectedBundleVariant(variant) {
  const normalizedVariant = String(variant || "").trim().toLowerCase();
  if (normalizedVariant === SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT) {
    return SHIELDED_DESCRIPTOR_BIND_PACKAGE_VARIANT;
  }
  if (normalizedVariant === SHIELDED_JSCONFUSER_STRING_PACKAGE_VARIANT) {
    return SHIELDED_JSCONFUSER_STRING_PACKAGE_VARIANT;
  }
  return isShieldedProtectedVariant(normalizedVariant)
    ? SHIELDED_PACKAGE_VARIANT
    : ENCRYPTED_PACKAGE_VARIANT;
}

function resolveProtectedBundleMarker(variant) {
  return isShieldedProtectedVariant(resolveProtectedBundleVariant(variant))
    ? SHIELDED_BUNDLE_MARKER
    : ENCRYPTED_BUNDLE_MARKER;
}

function encodeBase64(buffer) {
  return Buffer.from(buffer).toString("base64");
}

function computeSHA256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function escapeForSingleQuotedTemplate(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}

function buildSegmentedBase64Literal(value, options = {}) {
  const normalizedValue = String(value || "");
  const segmentLength = Math.max(8, Number(options.segmentLength) || 64);
  const segments = [];

  for (let index = 0; index < normalizedValue.length; index += segmentLength) {
    segments.push([
      segments.length,
      normalizedValue.slice(index, index + segmentLength),
    ]);
  }

  return `[${segments
    .slice()
    .reverse()
    .map(([index, chunk]) => `[${index}, '${escapeForSingleQuotedTemplate(chunk)}']`)
    .join(", ")}]`;
}

function encryptBuffer(buffer) {
  const payloadBuffer = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(buffer || "");
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(payloadBuffer),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  return {
    key,
    iv,
    ciphertext,
    sourceSHA256: computeSHA256(payloadBuffer),
    sourceBytes: payloadBuffer.byteLength,
  };
}

function normalizeStringArray(values) {
  return (Array.isArray(values) ? values : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeDescriptorOverlay(descriptorOverlay = null) {
  return (Array.isArray(descriptorOverlay) ? descriptorOverlay : [])
    .map((item) => {
      const id = String(item?.id || "").trim();
      if (!id) {
        return null;
      }

      const normalized = { id };
      if (typeof item?.description === "string" && item.description.trim()) {
        normalized.description = item.description.trim();
      }

      for (const key of ["entrypoints", "ownedBy", "successSignals"]) {
        const normalizedValues = normalizeStringArray(item?.[key]);
        if (normalizedValues.length > 0) {
          normalized[key] = normalizedValues;
        }
      }

      return Object.keys(normalized).length > 1 ? normalized : null;
    })
    .filter(Boolean);
}

export function createCapabilityManifestDescriptorOverlay({ config } = {}) {
  const manifest = createSourceCapabilityManifest({ config });
  return normalizeDescriptorOverlay(manifest);
}

function buildProtectedBundleLoaderSource({
  keyBase64,
  ivBase64,
  encryptedPayloadBase64,
  variant,
  descriptorOverlay = null,
}) {
  const protectedVariant = resolveProtectedBundleVariant(variant);
  const marker = resolveProtectedBundleMarker(protectedVariant);
  const payloadSegments = buildSegmentedBase64Literal(encryptedPayloadBase64, { segmentLength: 96 });
  const keySegments = buildSegmentedBase64Literal(keyBase64, { segmentLength: 24 });
  const ivSegments = buildSegmentedBase64Literal(ivBase64, { segmentLength: 12 });
  const overlayPayloadSegments = descriptorOverlay?.encryptedPayloadBase64
    ? buildSegmentedBase64Literal(descriptorOverlay.encryptedPayloadBase64, { segmentLength: 96 })
    : "null";
  const overlayKeySegments = descriptorOverlay?.keyBase64
    ? buildSegmentedBase64Literal(descriptorOverlay.keyBase64, { segmentLength: 24 })
    : "null";
  const overlayIVSegments = descriptorOverlay?.ivBase64
    ? buildSegmentedBase64Literal(descriptorOverlay.ivBase64, { segmentLength: 12 })
    : "null";
  return `/* ${marker} */
(function (__global) {
  var __bundleMeta = {
    marker: '${marker}',
    variant: '${protectedVariant}'
  };
  var __payloadSegments = ${payloadSegments};
  var __keySegments = ${keySegments};
  var __ivSegments = ${ivSegments};
  var __overlayPayloadSegments = ${overlayPayloadSegments};
  var __overlayKeySegments = ${overlayKeySegments};
  var __overlayIVSegments = ${overlayIVSegments};
  var __protectedBootstrapPromise = null;
  var __protectedBootstrap = null;
  var __overlayValue = null;
  var __decodeMethod = null;

  function __now() {
    return Date.now();
  }

  function __fail(message) {
    throw new Error('[cleanroom.package:${protectedVariant}] ' + message);
  }

  function __getPackageProtectionState() {
    var runtime = __global.__CLEANROOM_TEMPLATE_RUNTIME__;
    var summary = null;

    if (!runtime || typeof runtime !== 'object') {
      runtime = {};
      __global.__CLEANROOM_TEMPLATE_RUNTIME__ = runtime;
    }

    summary = runtime.packageProtection;
    if (!summary || typeof summary !== 'object') {
      summary = {};
      runtime.packageProtection = summary;
    }

    return summary;
  }

  function __recordPackageProtectionState(patch) {
    var summary = __getPackageProtectionState();
    var key = '';

    if (!patch || typeof patch !== 'object') {
      return summary;
    }

    for (key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        summary[key] = patch[key];
      }
    }

    return summary;
  }

  function __cloneJSON(value) {
    return value == null ? null : JSON.parse(JSON.stringify(value));
  }

  function __rememberDecodeMethod(method) {
    if (!__decodeMethod && typeof method === 'string' && method) {
      __decodeMethod = method;
    }
    return __decodeMethod;
  }

  function __getCrypto() {
    var candidate = (typeof crypto !== 'undefined' && crypto) || __global.crypto;
    if (!candidate || !candidate.subtle || typeof candidate.subtle.importKey !== 'function') {
      __fail('crypto.subtle unavailable');
    }
    return candidate;
  }

  function __getTextDecoder() {
    var candidate = (typeof TextDecoder !== 'undefined' && TextDecoder) || __global.TextDecoder;
    if (typeof candidate !== 'function') {
      __fail('TextDecoder unavailable');
    }
    return candidate;
  }

  function __joinSegments(segments) {
    var ordered = new Array(segments.length);
    var index = 0;

    for (index = 0; index < segments.length; index += 1) {
      ordered[segments[index][0]] = segments[index][1];
    }

    return ordered.join('');
  }

  function __getTypedUint8Array() {
    var candidate = (typeof Uint8Array !== 'undefined' && Uint8Array) || __global.Uint8Array;
    if (typeof candidate !== 'function') {
      __fail('Uint8Array unavailable');
    }
    return candidate;
  }

  function __estimateDecodedByteLength(base64) {
    var cleaned = String(base64 || '').replace(/\\s+/g, '');
    var fullGroups = 0;
    var remainder = 0;
    var padding = 0;

    if (!cleaned) {
      return 0;
    }

    fullGroups = Math.floor(cleaned.length / 4);
    remainder = cleaned.length % 4;

    if (remainder === 1) {
      __fail('invalid base64 payload');
    }

    if (remainder === 0) {
      if (cleaned.charAt(cleaned.length - 1) === '=') {
        padding = 1;
        if (cleaned.charAt(cleaned.length - 2) === '=') {
          padding = 2;
        }
      }
      return Math.max(0, (fullGroups * 3) - padding);
    }

    if (remainder === 2) {
      return (fullGroups * 3) + 1;
    }

    return (fullGroups * 3) + 2;
  }

  function __base64ToBytes(base64) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var cleaned = String(base64 || '').replace(/\\s+/g, '');
    var bytes = [];
    var index = 0;
    var TypedUint8Array = __getTypedUint8Array();
    var fromBase64 = typeof TypedUint8Array.fromBase64 === 'function'
      ? TypedUint8Array.fromBase64
      : null;
    var setFromBase64 = TypedUint8Array.prototype && typeof TypedUint8Array.prototype.setFromBase64 === 'function'
      ? TypedUint8Array.prototype.setFromBase64
      : null;

    if (!cleaned) {
      return new TypedUint8Array(0);
    }

    if (fromBase64) {
      try {
        var staticDecoded = fromBase64.call(TypedUint8Array, cleaned);
        __rememberDecodeMethod('fromBase64');
        return staticDecoded;
      } catch {}
    }

    if (setFromBase64) {
      try {
        var target = new TypedUint8Array(__estimateDecodedByteLength(cleaned));
        var setResult = setFromBase64.call(target, cleaned);
        var written = setResult && typeof setResult === 'object' && typeof setResult.written === 'number'
          ? setResult.written
          : target.length;
        __rememberDecodeMethod('setFromBase64');
        return written === target.length ? target : target.slice(0, written);
      } catch {}
    }

    if (typeof atob === 'function') {
      var binary = atob(cleaned);
      var directBytes = new TypedUint8Array(binary.length);
      for (index = 0; index < binary.length; index += 1) {
        directBytes[index] = binary.charCodeAt(index);
      }
      __rememberDecodeMethod('atob');
      return directBytes;
    }

    while (index < cleaned.length) {
      var c1 = cleaned.charAt(index++);
      var c2 = cleaned.charAt(index++);
      var c3 = cleaned.charAt(index++);
      var c4 = cleaned.charAt(index++);
      var e1 = alphabet.indexOf(c1);
      var e2 = alphabet.indexOf(c2);
      var e3 = !c3 || c3 === '=' ? -1 : alphabet.indexOf(c3);
      var e4 = !c4 || c4 === '=' ? -1 : alphabet.indexOf(c4);
      var triplet;

      if (e1 < 0 || e2 < 0 || (e3 < 0 && c3 && c3 !== '=') || (e4 < 0 && c4 && c4 !== '=')) {
        __fail('invalid base64 payload');
      }

      triplet = (e1 << 18) | (e2 << 12) | ((e3 < 0 ? 0 : e3) << 6) | (e4 < 0 ? 0 : e4);
      bytes.push((triplet >> 16) & 0xff);
      if (e3 >= 0) {
        bytes.push((triplet >> 8) & 0xff);
      }
      if (e4 >= 0) {
        bytes.push(triplet & 0xff);
      }
    }

    __rememberDecodeMethod('manual');
    return new TypedUint8Array(bytes);
  }

  function __evaluateBundle(sourceCode) {
    var runtimeFactory = new Function('__cleanroomScope', 'globalThis', 'window', 'self', sourceCode);
    runtimeFactory.call(__global, __global, __global, __global, __global);
  }

  async function __loadDescriptorOverlay(cryptoObject, decoder) {
    if (__overlayValue) {
      return __cloneJSON(__overlayValue);
    }

    if (!__overlayPayloadSegments || !__overlayKeySegments || !__overlayIVSegments) {
      return null;
    }

    try {
      var overlayPayload = __base64ToBytes(__joinSegments(__overlayPayloadSegments));
      var overlayKeyBytes = __base64ToBytes(__joinSegments(__overlayKeySegments));
      var overlayIVBytes = __base64ToBytes(__joinSegments(__overlayIVSegments));
      var overlayKey = await cryptoObject.subtle.importKey('raw', overlayKeyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
      var overlayBuffer = await cryptoObject.subtle.decrypt({ name: 'AES-GCM', iv: overlayIVBytes }, overlayKey, overlayPayload);
      var overlaySource = decoder.decode(new Uint8Array(overlayBuffer));
      var overlay = JSON.parse(overlaySource);

      if (!Array.isArray(overlay)) {
        return null;
      }

      __overlayValue = overlay;
      return __cloneJSON(__overlayValue);
    } catch (error) {
      return null;
    }
  }

  async function __loadProtectedBootstrap() {
    if (__protectedBootstrap) {
      return __protectedBootstrap;
    }

    if (!__protectedBootstrapPromise) {
      __protectedBootstrapPromise = (async function () {
        var prepareStartedAt = __now();
        var decodeStartedAt = __now();
        var cryptoObject = __getCrypto();
        var encryptedPayload = __base64ToBytes(__joinSegments(__payloadSegments));
        var keyBytes = __base64ToBytes(__joinSegments(__keySegments));
        var ivBytes = __base64ToBytes(__joinSegments(__ivSegments));
        var decodeDurationMs = __now() - decodeStartedAt;
        var decryptStartedAt = __now();
        var key = await cryptoObject.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
        var decryptedBuffer = await cryptoObject.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, encryptedPayload);
        var decryptDurationMs = __now() - decryptStartedAt;
        var decoder = new (__getTextDecoder())();
        var decryptedSource = decoder.decode(new Uint8Array(decryptedBuffer));
        var previousBootstrap = __global.bootstrapPlugin;
        var overlayResolver = null;
        var evalStartedAt = __now();

        __global.bootstrapPlugin = undefined;
        try {
          __evaluateBundle(decryptedSource);
        } catch (error) {
          __global.bootstrapPlugin = previousBootstrap;
          throw error;
        }

        var evalDurationMs = __now() - evalStartedAt;
        var overlay = await __loadDescriptorOverlay(cryptoObject, decoder);

        if (overlay) {
          overlayResolver = function () {
            return __cloneJSON(__overlayValue);
          };
        }

        __recordPackageProtectionState({
          active: true,
          variant: __bundleMeta.variant,
          decodeMethod: __decodeMethod || null,
          decodeDurationMs: Math.max(0, decodeDurationMs),
          decryptDurationMs: Math.max(0, decryptDurationMs),
          evalDurationMs: Math.max(0, evalDurationMs),
          prepareDurationMs: Math.max(0, __now() - prepareStartedAt),
        });
        if (overlayResolver) {
          __getPackageProtectionState().overlayResolver = overlayResolver;
        }

        if (typeof __global.bootstrapPlugin !== 'function') {
          __global.bootstrapPlugin = previousBootstrap;
          __fail('decrypted bundle did not expose bootstrapPlugin');
        }

        __protectedBootstrap = __global.bootstrapPlugin;
        __global.__CLEANROOM_PACKAGE_VARIANT__ = __bundleMeta.variant;
        __global[__bundleMeta.marker] = 1;
        __global.bootstrapPlugin = __bootstrapPluginProxy;
        return __protectedBootstrap;
      })();
    }

    return __protectedBootstrapPromise;
  }

  async function __bootstrapPluginProxy() {
    var resolveStartedAt = __now();
    var actualBootstrap = await __loadProtectedBootstrap();
    var summary = __recordPackageProtectionState({
      active: true,
      variant: __bundleMeta.variant,
      bootstrapResolveDurationMs: Math.max(0, __now() - resolveStartedAt),
    });
    summary.bootstrapCallCount = Math.max(0, Number(summary.bootstrapCallCount || 0)) + 1;
    return actualBootstrap.apply(__global, arguments);
  }

  __recordPackageProtectionState({
    active: true,
    variant: __bundleMeta.variant,
    loadSubScriptDurationMs: 0,
    decodeMethod: null,
    decodeDurationMs: 0,
    decryptDurationMs: 0,
    evalDurationMs: 0,
    prepareDurationMs: 0,
    bootstrapResolveDurationMs: 0,
    bootstrapCallCount: 0
  });
  __global.__CLEANROOM_PACKAGE_VARIANT__ = __bundleMeta.variant;
  __global[__bundleMeta.marker] = 1;
  __global.bootstrapPlugin = __bootstrapPluginProxy;
})(this);
`;
}

export function protectBundleSource(sourceCode, options = {}) {
  const normalizedSource = String(sourceCode || "");
  if (!normalizedSource.trim()) {
    throw createScriptError("validation", "bundle source must be a non-empty string", {
      failedStage: "protect-bundle",
    });
  }

  const addonRef = String(options.addonRef || "").trim();
  const addonVersion = String(options.addonVersion || "").trim();
  if (!addonRef || !addonVersion) {
    throw createScriptError("validation", "bundle protection requires addonRef and addonVersion", {
      failedStage: "protect-bundle",
      details: {
        addonRef: addonRef || null,
        addonVersion: addonVersion || null,
      },
    });
  }

  const sourceBuffer = Buffer.from(normalizedSource, "utf-8");
  const generatedAt = String(options.generatedAt || new Date().toISOString());
  const variant = resolveProtectedBundleVariant(options.variant);
  const encryptedBundle = encryptBuffer(sourceBuffer);
  const descriptorOverlay = normalizeDescriptorOverlay(options.descriptorOverlay);
  const encryptedDescriptorOverlay = descriptorOverlay.length > 0
    ? encryptBuffer(Buffer.from(JSON.stringify(descriptorOverlay), "utf-8"))
    : null;
  const loaderSource = buildProtectedBundleLoaderSource({
    keyBase64: encodeBase64(encryptedBundle.key),
    ivBase64: encodeBase64(encryptedBundle.iv),
    encryptedPayloadBase64: encodeBase64(encryptedBundle.ciphertext),
    variant,
    descriptorOverlay: encryptedDescriptorOverlay
      ? {
        keyBase64: encodeBase64(encryptedDescriptorOverlay.key),
        ivBase64: encodeBase64(encryptedDescriptorOverlay.iv),
        encryptedPayloadBase64: encodeBase64(encryptedDescriptorOverlay.ciphertext),
      }
      : null,
  });

  return {
    loaderSource,
    metadata: {
      marker: resolveProtectedBundleMarker(variant),
      variant,
      addonRef,
      addonVersion,
      generatedAt,
      sourceSHA256: encryptedBundle.sourceSHA256,
      sourceBytes: encryptedBundle.sourceBytes,
      protectedBytes: Buffer.byteLength(loaderSource, "utf-8"),
      descriptorOverlayPresent: Boolean(encryptedDescriptorOverlay),
      descriptorOverlayEntryCount: descriptorOverlay.length,
    },
  };
}

export async function protectBuildBundle(options = {}) {
  const rawBundlePath = String(options.bundlePath || "").trim();
  const bundlePath = rawBundlePath ? path.resolve(rawBundlePath) : "";
  const addonRef = String(options.addonRef || "").trim();
  const addonVersion = String(options.addonVersion || "").trim();
  if (!bundlePath || !addonRef || !addonVersion) {
    throw createScriptError("validation", "protectBuildBundle requires bundlePath, addonRef, and addonVersion", {
      failedStage: "protect-bundle",
      details: {
        bundlePath: bundlePath || null,
        addonRef: addonRef || null,
        addonVersion: addonVersion || null,
      },
    });
  }

  try {
    const sourceCode = await fs.readFile(bundlePath, "utf-8");
    const protectedBundle = protectBundleSource(sourceCode, {
      addonRef,
      addonVersion,
      generatedAt: options.generatedAt,
      variant: options.variant,
      descriptorOverlay: options.descriptorOverlay,
    });
    await fs.writeFile(bundlePath, protectedBundle.loaderSource, "utf-8");
    return {
      ...protectedBundle.metadata,
      bundlePath,
    };
  } catch (error) {
    throw wrapScriptError(error, {
      failedStage: "protect-bundle",
      details: {
        bundlePath,
        addonRef,
        addonVersion,
      },
    });
  }
}
