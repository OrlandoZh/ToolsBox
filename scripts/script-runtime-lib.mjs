import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const SCRIPT_ERROR_CATEGORY_LABELS = Object.freeze({
  args: "参数错误",
  config: "配置错误",
  environment: "环境错误",
  execution: "执行错误",
  validation: "验证错误",
  timeout: "超时错误",
  unknown: "未知错误",
});

export function createScriptError(category, message, options = {}) {
  const error = new Error(String(message || "Script failed"));
  error.scriptErrorCategory = normalizeScriptErrorCategory(category);
  error.failedStage = normalizeStage(options.failedStage);
  error.details = normalizeScriptErrorDetails(options.details);
  if (options.cause) {
    error.cause = options.cause;
  }
  return error;
}

export function assertScript(condition, message, options = {}) {
  if (!condition) {
    throw createScriptError(options.category || "validation", message, options);
  }
}

export function normalizeScriptErrorCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  return Object.hasOwn(SCRIPT_ERROR_CATEGORY_LABELS, normalized)
    ? normalized
    : "unknown";
}

function normalizeScriptErrorDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return undefined;
  }
  return { ...details };
}

function mergeScriptErrorDetails(...sources) {
  const merged = {};
  let observed = false;
  for (const source of sources) {
    const normalized = normalizeScriptErrorDetails(source);
    if (!normalized) {
      continue;
    }
    Object.assign(merged, normalized);
    observed = true;
  }
  return observed ? merged : undefined;
}

export function pickScriptErrorCategoryLabel(category) {
  return SCRIPT_ERROR_CATEGORY_LABELS[normalizeScriptErrorCategory(category)] || SCRIPT_ERROR_CATEGORY_LABELS.unknown;
}

function normalizeStage(stage) {
  const normalized = String(stage || "").trim();
  return normalized || "unknown";
}

function inferScriptErrorCategory(error) {
  const explicit = normalizeScriptErrorCategory(error?.scriptErrorCategory);
  if (explicit !== "unknown" || error?.scriptErrorCategory === "unknown") {
    return explicit;
  }

  const message = String(error?.message || error || "").trim().toLowerCase();
  if (!message) {
    return "unknown";
  }
  if (message.includes("timed out") || message.includes("timeout")) {
    return "timeout";
  }
  if (
    message.includes("unknown option")
    || message.includes("must be ")
    || message.includes("usage:")
  ) {
    return "args";
  }
  if (
    error?.code === "ENOENT"
    || error?.code === "EACCES"
    || message.includes("missing packaged xpi")
    || message.includes("binary")
    || message.includes("profile")
    || message.includes("runtime")
  ) {
    return "environment";
  }
  if (
    message.includes("mismatch")
    || message.includes("invalid ")
    || message.includes("missing first update entry")
  ) {
    return "validation";
  }
  return "execution";
}

export function buildScriptFailureInfo(error, options = {}) {
  const durationMs = Math.max(0, Number(options.durationMs || 0));
  const category = inferScriptErrorCategory(error);
  const failedStage = normalizeStage(error?.failedStage || options.failedStage);
  const message = String(error?.message || error || "Script failed").trim() || "Script failed";
  const details = normalizeScriptErrorDetails(error?.details || options.details);

  return {
    errorCategory: category,
    errorCategoryLabel: pickScriptErrorCategoryLabel(category),
    errorMessage: message,
    failedStage,
    durationMs,
    details: details || null,
  };
}

export function wrapScriptError(error, options = {}) {
  const failedStage = normalizeStage(options.failedStage || error?.failedStage);
  const category = options.category
    ? normalizeScriptErrorCategory(options.category)
    : inferScriptErrorCategory(error);
  const message = String(options.message || error?.message || error || "Script failed").trim() || "Script failed";
  const details = mergeScriptErrorDetails(error?.details, options.details);

  if (
    error instanceof Error
    && error?.scriptErrorCategory
    && !options.category
    && !options.message
    && !options.details
    && normalizeStage(error?.failedStage) === failedStage
  ) {
    return error;
  }

  return createScriptError(category, message, {
    failedStage,
    details,
    cause: error instanceof Error ? error : undefined,
  });
}

export async function readJSONFile(filePath, options = {}) {
  const {
    missingCategory = "environment",
    invalidCategory = "validation",
    missingStage = options.failedStage || "read-json",
    invalidStage = options.failedStage || "read-json",
    label = filePath,
  } = options;

  try {
    const content = await fs.readFile(filePath, "utf-8");
    try {
      return JSON.parse(content);
    } catch (error) {
      throw createScriptError(invalidCategory, `Invalid JSON file: ${label}`, {
        failedStage: invalidStage,
        details: {
          filePath,
          causeMessage: String(error?.message || error || "Invalid JSON"),
        },
        cause: error,
      });
    }
  } catch (error) {
    if (error?.scriptErrorCategory) {
      throw error;
    }
    if (error?.code === "ENOENT") {
      throw createScriptError(missingCategory, `Missing JSON file: ${label}`, {
        failedStage: missingStage,
        details: {
          filePath,
        },
        cause: error,
      });
    }
    throw wrapScriptError(error, {
      failedStage: missingStage,
      details: {
        filePath,
      },
    });
  }
}

export function assertNonEmptyString(value, label, options = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw createScriptError(options.category || "validation", `${label} must be a non-empty string`, {
      failedStage: options.failedStage || "validation",
      details: mergeScriptErrorDetails(options.details, {
        field: label,
      }),
    });
  }
  return normalized;
}

export function assertPlainObject(value, label, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createScriptError(options.category || "validation", `${label} must be an object`, {
      failedStage: options.failedStage || "validation",
      details: mergeScriptErrorDetails(options.details, {
        field: label,
      }),
    });
  }
  return value;
}

function stringifyValue(value) {
  return String(value || "").trim();
}

export function parseIntegerOption(rawValue, options = {}) {
  const {
    name = "value",
    min = null,
    max = null,
    category = "args",
    failedStage = "parse-args",
  } = options;
  const rawText = stringifyValue(rawValue);
  const value = Number.parseInt(rawText, 10);

  if (!rawText || !Number.isInteger(value)) {
    throw createScriptError(category, `${name} must be an integer`, {
      failedStage,
      details: {
        option: name,
        received: rawValue ?? null,
      },
    });
  }

  if (Number.isFinite(min) && value < min) {
    throw createScriptError(category, `${name} must be >= ${min}`, {
      failedStage,
      details: {
        option: name,
        received: value,
        min,
      },
    });
  }

  if (Number.isFinite(max) && value > max) {
    throw createScriptError(category, `${name} must be <= ${max}`, {
      failedStage,
      details: {
        option: name,
        received: value,
        max,
      },
    });
  }

  return value;
}

export function parseEnumOption(rawValue, options = {}) {
  const {
    name = "value",
    allowed = [],
    fallback = null,
    category = "args",
    failedStage = "parse-args",
  } = options;
  const value = stringifyValue(rawValue);
  const normalizedAllowed = Array.isArray(allowed)
    ? allowed.map((item) => String(item).trim()).filter(Boolean)
    : [];

  if (!value && fallback !== null && fallback !== undefined) {
    return String(fallback).trim();
  }

  if (!normalizedAllowed.includes(value)) {
    throw createScriptError(category, `${name} must be one of: ${normalizedAllowed.join(", ")}`, {
      failedStage,
      details: {
        option: name,
        received: rawValue ?? null,
        allowed: normalizedAllowed,
      },
    });
  }

  return value;
}

export function resolvePathOption(rawValue, options = {}) {
  const {
    name = "path",
    baseDir = null,
    category = "args",
    failedStage = "parse-args",
  } = options;
  const value = stringifyValue(rawValue);

  if (!value) {
    throw createScriptError(category, `${name} must be a non-empty path`, {
      failedStage,
      details: {
        option: name,
        received: rawValue ?? null,
      },
    });
  }

  return baseDir
    ? path.resolve(baseDir, value)
    : path.resolve(value);
}

export function parseBooleanEnvFlag(env, name, options = {}) {
  const {
    defaultValue = false,
    category = "environment",
    failedStage = "read-environment",
  } = options;
  const rawValue = env?.[name];
  const value = stringifyValue(rawValue).toLowerCase();

  if (!value) {
    return Boolean(defaultValue);
  }

  if (value === "1" || value === "true" || value === "yes" || value === "on") {
    return true;
  }
  if (value === "0" || value === "false" || value === "no" || value === "off") {
    return false;
  }

  throw createScriptError(category, `${name} must be one of: 1, true, yes, on, 0, false, no, off`, {
    failedStage,
    details: {
      envVar: name,
      received: rawValue ?? null,
    },
  });
}

export function resolveEnvPath(env, name, options = {}) {
  const {
    category = "environment",
    failedStage = "read-environment",
  } = options;
  const rawValue = env?.[name];
  const value = stringifyValue(rawValue);
  if (!value) {
    return null;
  }
  return resolvePathOption(value, {
    name,
    category,
    failedStage,
  });
}

export function isExecutedAsScript(importMetaUrl, argv = process.argv) {
  const entryPath = Array.isArray(argv) ? argv[1] : null;
  if (!entryPath) {
    return false;
  }
  return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

export async function writeJSONArtifact(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}
