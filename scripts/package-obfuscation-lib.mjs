import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import JavaScriptObfuscator from "javascript-obfuscator";
import {
  createScriptError,
  wrapScriptError,
} from "./script-runtime-lib.mjs";

export const SHIELDED_PACKAGE_VARIANT = "shielded";
export const SHIELDED_BUNDLE_OBFUSCATION_STAGE = "bundle";
export const SHIELDED_LOADER_OBFUSCATION_STAGE = "protected-loader";

function computeSHA256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function resolveShieldedObfuscationStage(stage) {
  const normalizedStage = String(stage || "").trim().toLowerCase();
  return normalizedStage === SHIELDED_LOADER_OBFUSCATION_STAGE
    ? SHIELDED_LOADER_OBFUSCATION_STAGE
    : SHIELDED_BUNDLE_OBFUSCATION_STAGE;
}

export function buildShieldedObfuscationOptions(options = {}) {
  const stage = resolveShieldedObfuscationStage(options.stage);
  const reservedNames = new Set([
    "^bootstrapPlugin$",
    "^Zotero$",
    "^Services$",
    "^ChromeUtils$",
    "^TextDecoder$",
    "^crypto$",
    ...(Array.isArray(options.reservedNames) ? options.reservedNames : []),
  ]);
  const reservedStrings = new Set([
    "bootstrapPlugin",
    "__CLEANROOM_PACKAGE_VARIANT__",
    "__CLEANROOM_ENCRYPTED_BUNDLE__",
    "__CLEANROOM_SHIELDED_BUNDLE__",
    ...(Array.isArray(options.reservedStrings) ? options.reservedStrings : []),
  ]);
  const seed = Number.isInteger(options.seed) ? options.seed : undefined;

  const commonOptions = {
    compact: true,
    deadCodeInjection: false,
    debugProtection: false,
    debugProtectionInterval: 0,
    disableConsoleOutput: false,
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    renameProperties: false,
    reservedNames: Array.from(reservedNames),
    reservedStrings: Array.from(reservedStrings),
    selfDefending: false,
    simplify: true,
    target: "browser",
    ...(seed === undefined ? {} : { seed }),
  };

  if (stage === SHIELDED_LOADER_OBFUSCATION_STAGE) {
    return {
      ...commonOptions,
      controlFlowFlattening: false,
      splitStrings: false,
      stringArray: true,
      stringArrayCallsTransform: false,
      stringArrayEncoding: ["base64"],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayThreshold: 1,
      stringArrayWrappersChainedCalls: false,
      stringArrayWrappersCount: 1,
      stringArrayWrappersType: "function",
      transformObjectKeys: false,
    };
  }

  return {
    ...commonOptions,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.35,
    splitStrings: true,
    splitStringsChunkLength: 8,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ["base64"],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 1,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersCount: 3,
    stringArrayWrappersType: "function",
    transformObjectKeys: false,
  };
}

export function obfuscateBundleSource(sourceCode, options = {}) {
  const normalizedSource = String(sourceCode || "");
  if (!normalizedSource.trim()) {
    throw createScriptError("validation", "bundle source must be a non-empty string", {
      failedStage: "obfuscate-bundle",
    });
  }

  const obfuscationOptions = buildShieldedObfuscationOptions(options);
  const stage = resolveShieldedObfuscationStage(options.stage);

  try {
    const sourceBuffer = Buffer.from(normalizedSource, "utf-8");
    const obfuscationResult = JavaScriptObfuscator.obfuscate(normalizedSource, obfuscationOptions);
    const obfuscatedSource = String(obfuscationResult.getObfuscatedCode() || "");
    if (!obfuscatedSource.trim()) {
      throw createScriptError("execution", "bundle obfuscation returned empty output", {
        failedStage: "obfuscate-bundle",
      });
    }

    const obfuscatedBuffer = Buffer.from(obfuscatedSource, "utf-8");
    return {
      obfuscatedSource,
      metadata: {
        variant: SHIELDED_PACKAGE_VARIANT,
        stage,
        sourceSHA256: computeSHA256(sourceBuffer),
        obfuscatedSHA256: computeSHA256(obfuscatedBuffer),
        sourceBytes: sourceBuffer.byteLength,
        obfuscatedBytes: obfuscatedBuffer.byteLength,
      },
    };
  } catch (error) {
    throw wrapScriptError(error, {
      failedStage: "obfuscate-bundle",
    });
  }
}

export async function obfuscateBuildBundle(options = {}) {
  const rawBundlePath = String(options.bundlePath || "").trim();
  const bundlePath = rawBundlePath ? path.resolve(rawBundlePath) : "";
  if (!bundlePath) {
    throw createScriptError("validation", "obfuscateBuildBundle requires bundlePath", {
      failedStage: "obfuscate-bundle",
      details: {
        bundlePath: bundlePath || null,
      },
    });
  }

  try {
    const sourceCode = await fs.readFile(bundlePath, "utf-8");
    const obfuscatedBundle = obfuscateBundleSource(sourceCode, {
      seed: options.seed,
      stage: options.stage,
    });
    await fs.writeFile(bundlePath, obfuscatedBundle.obfuscatedSource, "utf-8");
    return {
      ...obfuscatedBundle.metadata,
      bundlePath,
    };
  } catch (error) {
    throw wrapScriptError(error, {
      failedStage: "obfuscate-bundle",
      details: {
        bundlePath,
      },
    });
  }
}
