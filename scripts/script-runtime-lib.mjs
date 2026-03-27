import { promises as fs } from "node:fs";

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

  return {
    errorCategory: category,
    errorCategoryLabel: pickScriptErrorCategoryLabel(category),
    errorMessage: message,
    failedStage,
    durationMs,
  };
}

export async function writeJSONArtifact(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}
