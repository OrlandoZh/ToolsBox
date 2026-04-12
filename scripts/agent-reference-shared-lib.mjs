import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const REFERENCE_INDEX_RELATIVE_PATH = path.join("docs", "REFERENCE_INDEX.md");
export const REFERENCE_DOC_PREFIX = "REFERENCE_";
export const REFERENCE_DOC_GLOB_PREFIX = `${REFERENCE_DOC_PREFIX}`;
export const REFERENCE_DISTILL_MARKER_START = "<!-- REFERENCE-DISTILLATION:START -->";
export const REFERENCE_DISTILL_MARKER_END = "<!-- REFERENCE-DISTILLATION:END -->";
export const REFERENCE_INDEX_DISTILLED_TOPICS_START = "<!-- REFERENCE-DISTILLED-TOPICS:START -->";
export const REFERENCE_INDEX_DISTILLED_TOPICS_END = "<!-- REFERENCE-DISTILLED-TOPICS:END -->";

function normalizeString(value) {
  return String(value || "").trim();
}

export function hashShort(payload, length = 12) {
  return crypto
    .createHash("sha256")
    .update(typeof payload === "string" ? payload : JSON.stringify(payload))
    .digest("hex")
    .slice(0, length);
}

export function normalizeRepoRelativePath(value) {
  const normalized = normalizeString(value)
    .replaceAll("\\", "/")
    .replace(/^\.\/+/u, "")
    .replace(/\/+/gu, "/");
  if (!normalized || normalized.startsWith("/") || normalized.startsWith("../") || normalized.includes("/../")) {
    return null;
  }
  return normalized;
}

export function isReferenceDocPath(value) {
  const normalized = normalizeRepoRelativePath(value);
  if (!normalized) {
    return false;
  }
  return normalized === "docs/REFERENCE_INDEX.md"
    || /^docs\/REFERENCE_[A-Z0-9_]+\.md$/u.test(normalized);
}

export function isRawReferencePath(value) {
  const normalized = normalizeRepoRelativePath(value);
  if (!normalized) {
    return false;
  }
  return normalized.startsWith("reference/");
}

export function filterRawReferenceFiles(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeRepoRelativePath(item))
      .filter((item) => item && isRawReferencePath(item)),
  )).sort((a, b) => a.localeCompare(b, "en"));
}

export function deriveReferenceProjectId(referencePath) {
  const normalized = normalizeRepoRelativePath(referencePath);
  if (!normalized || !normalized.startsWith("reference/")) {
    return null;
  }
  const segments = normalized.split("/");
  if (segments.length < 2) {
    return null;
  }
  if (segments[1] === "zotero-main") {
    return "reference/zotero-main";
  }
  if (segments.length >= 3) {
    return `reference/${segments[1]}/${segments[2]}`;
  }
  return `reference/${segments[1]}`;
}

export function collectDistinctReferenceProjects(values) {
  return Array.from(new Set(
    filterRawReferenceFiles(values)
      .map((item) => deriveReferenceProjectId(item))
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, "en"));
}

export function normalizeTopicHint(value) {
  return normalizeString(value) || "Reference Topic";
}

export function normalizeTopicKey(value) {
  const text = normalizeTopicHint(value)
    .replace(/^REFERENCE[_\s-]*/iu, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, " ");
  const ascii = text
    .replace(/[^A-Za-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, "_")
    .toUpperCase();
  return ascii || `TOPIC_${hashShort(text, 10).toUpperCase()}`;
}

export function humanizeTopicKey(topicKey) {
  const normalized = normalizeTopicKey(topicKey);
  return normalized
    .split("_")
    .filter(Boolean)
    .map((item) => item.slice(0, 1) + item.slice(1).toLowerCase())
    .join(" ");
}

export async function listReferenceTopicDocs(projectRoot) {
  const docsDir = path.join(projectRoot, "docs");
  const entries = await fs.readdir(docsDir, { withFileTypes: true }).catch((error) => {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  return entries
    .filter((entry) => entry.isFile() && /^REFERENCE_[A-Z0-9_]+\.md$/u.test(entry.name))
    .map((entry) => path.join("docs", entry.name))
    .sort((a, b) => a.localeCompare(b, "en"));
}

export async function resolveReferenceTopicTarget(projectRoot, topicHint) {
  const topicKey = normalizeTopicKey(topicHint);
  const docs = await listReferenceTopicDocs(projectRoot);
  const matchedDoc = docs.find((docPath) => {
    const basename = path.basename(docPath, ".md").replace(/^REFERENCE_/u, "");
    return normalizeTopicKey(basename) === topicKey;
  }) || null;
  return {
    topicHint: normalizeTopicHint(topicHint),
    topicKey,
    targetDoc: matchedDoc || path.join("docs", `${REFERENCE_DOC_PREFIX}${topicKey}.md`),
    targetExists: Boolean(matchedDoc),
    referenceIndexPath: REFERENCE_INDEX_RELATIVE_PATH,
  };
}

export function buildReferenceTopicTitle(topicHint, topicKey) {
  const hint = normalizeTopicHint(topicHint);
  if (/[A-Za-z0-9]/u.test(hint)) {
    return hint;
  }
  return humanizeTopicKey(topicKey);
}
