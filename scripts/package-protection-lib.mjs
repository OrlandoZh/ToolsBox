import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createScriptError,
  wrapScriptError,
} from "./script-runtime-lib.mjs";

export const ENCRYPTED_PACKAGE_VARIANT = "encrypted";
export const PROTECTED_BUNDLE_MARKER = "__CLEANROOM_ENCRYPTED_BUNDLE__";

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

function buildProtectedBundleLoaderSource({
  addonRef,
  addonVersion,
  generatedAt,
  keyBase64,
  ivBase64,
  encryptedPayloadBase64,
  sourceSHA256,
}) {
  return `/* ${PROTECTED_BUNDLE_MARKER} variant=${ENCRYPTED_PACKAGE_VARIANT} addon=${escapeForSingleQuotedTemplate(addonRef)} version=${escapeForSingleQuotedTemplate(addonVersion)} sourceSHA256=${sourceSHA256} */
(function (__global) {
  var __bundleMeta = {
    marker: '${PROTECTED_BUNDLE_MARKER}',
    variant: '${ENCRYPTED_PACKAGE_VARIANT}',
    addonRef: '${escapeForSingleQuotedTemplate(addonRef)}',
    addonVersion: '${escapeForSingleQuotedTemplate(addonVersion)}',
    generatedAt: '${escapeForSingleQuotedTemplate(generatedAt)}',
    sourceSHA256: '${sourceSHA256}'
  };
  var __payloadBase64 = '${encryptedPayloadBase64}';
  var __keyBase64 = '${keyBase64}';
  var __ivBase64 = '${ivBase64}';
  var __protectedBootstrapPromise = null;
  var __protectedBootstrap = null;

  function __fail(message) {
    throw new Error('[cleanroom.package:${ENCRYPTED_PACKAGE_VARIANT}] ' + message);
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
    var runtimeEval = (0, eval);
    runtimeEval(sourceCode);
  }

  async function __loadProtectedBootstrap() {
    if (__protectedBootstrap) {
      return __protectedBootstrap;
    }

    if (!__protectedBootstrapPromise) {
      __protectedBootstrapPromise = (async function () {
        var cryptoObject = __getCrypto();
        var encryptedPayload = __base64ToBytes(__payloadBase64);
        var keyBytes = __base64ToBytes(__keyBase64);
        var ivBytes = __base64ToBytes(__ivBase64);
        var key = await cryptoObject.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
        var decryptedBuffer = await cryptoObject.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, encryptedPayload);
        var decoder = new (__getTextDecoder())();
        var decryptedSource = decoder.decode(new Uint8Array(decryptedBuffer));
        var previousBootstrap = __global.bootstrapPlugin;

        __global.bootstrapPlugin = undefined;
        try {
          __evaluateBundle(decryptedSource);
        } catch (error) {
          __global.bootstrapPlugin = previousBootstrap;
          throw error;
        }

        if (typeof __global.bootstrapPlugin !== 'function') {
          __global.bootstrapPlugin = previousBootstrap;
          __fail('decrypted bundle did not expose bootstrapPlugin');
        }

        __protectedBootstrap = __global.bootstrapPlugin;
        __global.__CLEANROOM_PACKAGE_VARIANT__ = __bundleMeta.variant;
        __global.__CLEANROOM_ENCRYPTED_BUNDLE__ = __bundleMeta;
        __global.bootstrapPlugin = __bootstrapPluginProxy;
        return __protectedBootstrap;
      })();
    }

    return __protectedBootstrapPromise;
  }

  async function __bootstrapPluginProxy() {
    var actualBootstrap = await __loadProtectedBootstrap();
    return actualBootstrap.apply(__global, arguments);
  }

  __global.__CLEANROOM_PACKAGE_VARIANT__ = __bundleMeta.variant;
  __global.__CLEANROOM_ENCRYPTED_BUNDLE__ = __bundleMeta;
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
    addonRef,
    addonVersion,
    generatedAt,
    keyBase64: encodeBase64(key),
    ivBase64: encodeBase64(iv),
    encryptedPayloadBase64: encodeBase64(ciphertext),
    sourceSHA256,
  });

  return {
    loaderSource,
    metadata: {
      marker: PROTECTED_BUNDLE_MARKER,
      variant: ENCRYPTED_PACKAGE_VARIANT,
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
