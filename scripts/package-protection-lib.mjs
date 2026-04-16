import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createScriptError,
  wrapScriptError,
} from "./script-runtime-lib.mjs";

export const ENCRYPTED_PACKAGE_VARIANT = "encrypted";
export const SHIELDED_PACKAGE_VARIANT = "shielded";
export const ENCRYPTED_BUNDLE_MARKER = "__CLEANROOM_ENCRYPTED_BUNDLE__";
export const SHIELDED_BUNDLE_MARKER = "__CLEANROOM_SHIELDED_BUNDLE__";

function resolveProtectedBundleVariant(variant) {
  const normalizedVariant = String(variant || "").trim().toLowerCase();
  return normalizedVariant === SHIELDED_PACKAGE_VARIANT
    ? SHIELDED_PACKAGE_VARIANT
    : ENCRYPTED_PACKAGE_VARIANT;
}

function resolveProtectedBundleMarker(variant) {
  return resolveProtectedBundleVariant(variant) === SHIELDED_PACKAGE_VARIANT
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

function buildProtectedBundleLoaderSource({
  keyBase64,
  ivBase64,
  encryptedPayloadBase64,
  variant,
}) {
  const protectedVariant = resolveProtectedBundleVariant(variant);
  const marker = resolveProtectedBundleMarker(protectedVariant);
  const payloadSegments = buildSegmentedBase64Literal(encryptedPayloadBase64, { segmentLength: 96 });
  const keySegments = buildSegmentedBase64Literal(keyBase64, { segmentLength: 24 });
  const ivSegments = buildSegmentedBase64Literal(ivBase64, { segmentLength: 12 });
  return `/* ${marker} */
(function (__global) {
  var __bundleMeta = {
    marker: '${marker}',
    variant: '${protectedVariant}'
  };
  var __payloadSegments = ${payloadSegments};
  var __keySegments = ${keySegments};
  var __ivSegments = ${ivSegments};
  var __protectedBootstrapPromise = null;
  var __protectedBootstrap = null;

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

  function __base64ToBytes(base64) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var cleaned = String(base64 || '').replace(/\\s+/g, '');
    var bytes = [];
    var index = 0;

    if (!cleaned) {
      return new Uint8Array(0);
    }

    if (typeof atob === 'function') {
      var binary = atob(cleaned);
      var directBytes = new Uint8Array(binary.length);
      for (index = 0; index < binary.length; index += 1) {
        directBytes[index] = binary.charCodeAt(index);
      }
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

    return new Uint8Array(bytes);
  }

  function __evaluateBundle(sourceCode) {
    var runtimeFactory = new Function('__cleanroomScope', 'globalThis', 'window', 'self', sourceCode);
    runtimeFactory.call(__global, __global, __global, __global, __global);
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
        var evalStartedAt = __now();

        __global.bootstrapPlugin = undefined;
        try {
          __evaluateBundle(decryptedSource);
        } catch (error) {
          __global.bootstrapPlugin = previousBootstrap;
          throw error;
        }

        var evalDurationMs = __now() - evalStartedAt;
        __recordPackageProtectionState({
          active: true,
          variant: __bundleMeta.variant,
          decodeDurationMs: Math.max(0, decodeDurationMs),
          decryptDurationMs: Math.max(0, decryptDurationMs),
          evalDurationMs: Math.max(0, evalDurationMs),
          prepareDurationMs: Math.max(0, __now() - prepareStartedAt),
        });

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
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(sourceBuffer),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const sourceSHA256 = computeSHA256(sourceBuffer);
  const loaderSource = buildProtectedBundleLoaderSource({
    keyBase64: encodeBase64(key),
    ivBase64: encodeBase64(iv),
    encryptedPayloadBase64: encodeBase64(ciphertext),
    variant,
  });

  return {
    loaderSource,
    metadata: {
      marker: resolveProtectedBundleMarker(variant),
      variant,
      addonRef,
      addonVersion,
      generatedAt,
      sourceSHA256,
      sourceBytes: sourceBuffer.byteLength,
      protectedBytes: Buffer.byteLength(loaderSource, "utf-8"),
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
