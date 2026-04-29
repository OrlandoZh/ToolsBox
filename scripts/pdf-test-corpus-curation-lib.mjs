import { promises as fs } from "node:fs";
import path from "node:path";
import {
  assertNonEmptyString,
  createScriptError,
  readJSONFile,
} from "./script-runtime-lib.mjs";

const PDF_TEST_CORPUS_CURATION_SCHEMA_VERSION = 1;
const CURATION_PROFILE_BALANCED_V1 = "balanced-v1";

const PLACEHOLDER_TITLES = new Set([
  "title",
  "标题",
  "untitled",
  "未命名图书",
  "zotero reader",
]);

const PLACEHOLDER_AUTHORS = new Set([
  "author",
  "作者",
  "cnki",
  "dc.cqvip.com",
  "unknown",
]);

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeSearchText(value) {
  return normalizeString(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, " ");
}

function normalizeTitle(value) {
  return normalizeSearchText(value).replace(/\u0000/gu, "");
}

function isPlaceholderTitle(value) {
  const normalized = normalizeTitle(value);
  return !normalized || PLACEHOLDER_TITLES.has(normalized);
}

function isPlaceholderAuthor(value) {
  const normalized = normalizeSearchText(value).replace(/\u0000/gu, "");
  if (!normalized) {
    return true;
  }
  if (PLACEHOLDER_AUTHORS.has(normalized)) {
    return true;
  }
  return normalized.includes("cqvip.com");
}

function containsHanCharacters(value) {
  return /\p{Script=Han}/u.test(String(value || ""));
}

function pickPreferredTitle(entry) {
  const candidates = [
    entry?.resolvedMetadata?.title,
    entry?.filenameDerived?.title,
    entry?.metadata?.title,
  ];
  for (const candidate of candidates) {
    if (!isPlaceholderTitle(candidate)) {
      return normalizeString(candidate) || null;
    }
  }
  return null;
}

function pickPreferredAuthor(entry) {
  const candidates = [
    entry?.resolvedMetadata?.author,
    entry?.filenameDerived?.authors,
    entry?.metadata?.author,
  ];
  for (const candidate of candidates) {
    if (!isPlaceholderAuthor(candidate)) {
      return normalizeString(candidate) || null;
    }
  }
  return null;
}

function isNonEmptyText(entry) {
  return entry?.firstPageText?.nonEmpty === true;
}

function hasOnlineMatch(entry) {
  return entry?.onlineEnrichment?.status === "matched";
}

function hasLargeFileTag(entry) {
  return Array.isArray(entry?.tags) && entry.tags.includes("large-file");
}

function hasTag(entry, tag) {
  return Array.isArray(entry?.tags) && entry.tags.includes(tag);
}

function hasSuspiciousMetadata(entry) {
  return isPlaceholderTitle(pickPreferredTitle(entry))
    || isPlaceholderAuthor(pickPreferredAuthor(entry));
}

function createEntryRecord(manifest, entry, options = {}) {
  return {
    id: entry.id,
    fileName: entry.fileName,
    relativePath: entry.relativePath,
    absolutePath: path.join(manifest.sourceRoot, entry.relativePath),
    familyKey: entry.familyKey,
    recommendedLane: entry.recommendedLane,
    variantKind: entry.variantKind,
    pages: entry?.metadata?.pages ?? null,
    encrypted: entry?.metadata?.encrypted ?? null,
    textExtractable: entry?.firstPageText?.nonEmpty ?? null,
    tags: Array.isArray(entry?.tags) ? entry.tags.slice() : [],
    onlineStatus: entry?.onlineEnrichment?.status || null,
    resolvedMetadata: {
      title: pickPreferredTitle(entry),
      author: pickPreferredAuthor(entry),
      doi: entry?.resolvedMetadata?.doi || null,
      journal: entry?.resolvedMetadata?.journal || null,
    },
    selectionReason: normalizeString(options.selectionReason) || null,
  };
}

function entryQualityScore(entry) {
  let score = 0;
  if (isNonEmptyText(entry)) {
    score += 25;
  }
  if (!entry?.metadata?.encrypted) {
    score += 10;
  }
  if (!isPlaceholderTitle(pickPreferredTitle(entry))) {
    score += 10;
  }
  if (!isPlaceholderAuthor(pickPreferredAuthor(entry))) {
    score += 10;
  }
  if (hasOnlineMatch(entry)) {
    score += 15;
  }
  if (!hasLargeFileTag(entry)) {
    score += 5;
  }
  score += Math.min(Number(entry?.metadata?.pages || 0), 40) / 10;
  return score;
}

function laneSpecificScore(entry, lane) {
  let score = entryQualityScore(entry);
  if (lane === "core-text") {
    if (entry.variantKind === "original") {
      score += 20;
    }
    if (!hasSuspiciousMetadata(entry)) {
      score += 15;
    }
    if (hasLargeFileTag(entry)) {
      score += 2;
    }
  } else if (lane === "metadata-poor-online") {
    if (hasOnlineMatch(entry)) {
      score += 30;
    }
    if (entry.variantKind === "original") {
      score += 10;
    }
  } else if (lane === "metadata-poor-local") {
    if (!hasOnlineMatch(entry)) {
      score += 10;
    }
    if (entry?.filenameDerived?.matched) {
      score += 10;
    }
    if (entry.variantKind === "original") {
      score += 10;
    }
    if (!hasLargeFileTag(entry)) {
      score += 5;
    }
  } else if (lane === "scan-ocr") {
    if (hasTag(entry, "scan-ocr-candidate")) {
      score += 20;
    }
    score += Math.min(Number(entry?.metadata?.pages || 0), 250) / 5;
  } else if (lane === "permission-edge") {
    if (entry?.metadata?.encrypted) {
      score += 25;
    }
    if (hasTag(entry, "scan-ocr-candidate")) {
      score += 8;
    }
    if (entry?.filenameDerived?.matched) {
      score += 12;
    }
    if (isNonEmptyText(entry)) {
      score += 10;
    }
  }
  return score;
}

function compareEntries(left, right) {
  const scoreDelta = entryQualityScore(right) - entryQualityScore(left);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  return left.fileName.localeCompare(right.fileName, "zh-Hans-CN");
}

function compareLaneEntries(lane) {
  return (left, right) => {
    const scoreDelta = laneSpecificScore(right, lane) - laneSpecificScore(left, lane);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return compareEntries(left, right);
  };
}

function buildEntryIndex(manifest) {
  return new Map((Array.isArray(manifest?.entries) ? manifest.entries : []).map((entry) => [entry.id, entry]));
}

function buildFamilyIndex(manifest) {
  return new Map((Array.isArray(manifest?.families) ? manifest.families : []).map((family) => [family.familyKeyNormalized, family]));
}

function pickTopEntries(entries, count, comparator) {
  return entries
    .slice()
    .sort(comparator)
    .slice(0, count);
}

function filterOriginalEntries(entries) {
  return entries.filter((entry) => entry.variantKind === "original");
}

function chooseCoreTextEntries(manifestEntries) {
  const candidates = filterOriginalEntries(manifestEntries).filter((entry) => (
    entry.recommendedLane === "core-text"
    && isNonEmptyText(entry)
    && !entry?.metadata?.encrypted
    && !hasSuspiciousMetadata(entry)
  ));
  return pickTopEntries(candidates, 4, compareLaneEntries("core-text"));
}

function chooseMetadataPoorOnlineEntries(manifestEntries, excludedFamilyKeys) {
  const candidates = filterOriginalEntries(manifestEntries).filter((entry) => (
    entry.recommendedLane === "metadata-poor"
    && isNonEmptyText(entry)
    && !entry?.metadata?.encrypted
    && !hasTag(entry, "scan-ocr-candidate")
    && hasOnlineMatch(entry)
    && !excludedFamilyKeys.has(normalizeSearchText(entry.familyKey))
  ));
  return pickTopEntries(candidates, 2, compareLaneEntries("metadata-poor-online"));
}

function chooseMetadataPoorLocalEntries(manifestEntries, excludedFamilyKeys) {
  const candidates = filterOriginalEntries(manifestEntries).filter((entry) => (
    entry.recommendedLane === "metadata-poor"
    && isNonEmptyText(entry)
    && !entry?.metadata?.encrypted
    && !hasTag(entry, "scan-ocr-candidate")
    && !hasOnlineMatch(entry)
    && !excludedFamilyKeys.has(normalizeSearchText(entry.familyKey))
  ));
  const ordered = candidates.slice().sort(compareLaneEntries("metadata-poor-local"));
  const selected = [];
  const hanCandidate = ordered.find((entry) => containsHanCharacters(pickPreferredTitle(entry)));
  if (hanCandidate) {
    selected.push(hanCandidate);
  }
  const fallbackCandidate = ordered.find((entry) => !selected.some((picked) => picked.id === entry.id));
  if (fallbackCandidate) {
    selected.push(fallbackCandidate);
  }
  return selected;
}

function chooseScanEntries(manifestEntries) {
  const candidates = manifestEntries.filter((entry) => (
    entry.recommendedLane === "scan-ocr"
  ));
  return pickTopEntries(candidates, 2, compareLaneEntries("scan-ocr"));
}

function choosePermissionEntries(manifestEntries) {
  const encryptedEntries = manifestEntries.filter((entry) => entry.recommendedLane === "permission-edge");
  const scanLike = pickTopEntries(
    encryptedEntries.filter((entry) => hasTag(entry, "scan-ocr-candidate")),
    1,
    compareLaneEntries("permission-edge"),
  );
  const textLike = pickTopEntries(
    encryptedEntries.filter((entry) => !hasTag(entry, "scan-ocr-candidate")),
    1,
    compareLaneEntries("permission-edge"),
  );
  return [...scanLike, ...textLike];
}

function familyScore(family, entryIndex) {
  const entries = family.entryIds
    .map((entryId) => entryIndex.get(entryId))
    .filter(Boolean);
  let score = 0;
  const variants = new Set(entries.map((entry) => entry.variantKind));
  if (variants.has("original")) {
    score += 20;
  }
  if (variants.has("translated-dual")) {
    score += 10;
  }
  if (variants.has("translated-mono")) {
    score += 8;
  }
  if (entries.some((entry) => hasOnlineMatch(entry))) {
    score += 18;
  }
  if (entries.some((entry) => hasTag(entry, "filename-unstructured"))) {
    score += 6;
  }
  score += entries.length * 3;
  score += entries.reduce((sum, entry) => sum + entryQualityScore(entry), 0) / 10;
  return score;
}

function chooseTranslationFamilies(manifest, entryIndex) {
  const families = Array.isArray(manifest?.families) ? manifest.families.slice() : [];
  const translationFamilies = families.filter((family) => {
    const entries = family.entryIds.map((entryId) => entryIndex.get(entryId)).filter(Boolean);
    return entries.some((entry) => entry.variantKind !== "original");
  });

  const used = new Set();
  const groups = [];

  const richFamilies = translationFamilies
    .filter((family) => {
      const variants = new Set(family.variantKinds || []);
      return family.size >= 3
        && variants.has("original")
        && variants.has("translated-dual")
        && variants.has("translated-mono");
    })
    .sort((left, right) => familyScore(right, entryIndex) - familyScore(left, entryIndex));
  const rich = richFamilies[0] || null;
  if (rich) {
    used.add(rich.familyKeyNormalized);
    groups.push({
      id: "translation-bundle-rich",
      label: "Translation Bundle Rich Family",
      reason: "包含原文 + mono + dual 三种变体，适合做翻译衍生件去重与 lane 回归。",
      entries: rich.entryIds.map((entryId) => entryIndex.get(entryId)).filter(Boolean),
    });
  }

  const pairedFamilies = translationFamilies
    .filter((family) => !used.has(family.familyKeyNormalized))
    .filter((family) => {
      const entries = family.entryIds.map((entryId) => entryIndex.get(entryId)).filter(Boolean);
      return entries.some((entry) => entry.variantKind === "original")
        && entries.some((entry) => entry.variantKind !== "original")
        && entries.some((entry) => hasOnlineMatch(entry));
    })
    .sort((left, right) => familyScore(right, entryIndex) - familyScore(left, entryIndex));
  const paired = pairedFamilies[0] || null;
  if (paired) {
    used.add(paired.familyKeyNormalized);
    groups.push({
      id: "translation-bundle-pair",
      label: "Translation Bundle Pair",
      reason: "包含原文与翻译对照，并且至少一个翻译变体已被联网补全命中。",
      entries: paired.entryIds.map((entryId) => entryIndex.get(entryId)).filter(Boolean),
    });
  }

  const translationOnlyFamilies = translationFamilies
    .filter((family) => !used.has(family.familyKeyNormalized))
    .filter((family) => !family.variantKinds.includes("original"))
    .sort((left, right) => familyScore(right, entryIndex) - familyScore(left, entryIndex));
  const translationOnly = translationOnlyFamilies[0] || null;
  if (translationOnly) {
    groups.push({
      id: "translation-bundle-unstructured",
      label: "Translation Bundle Unstructured",
      reason: "只保留翻译衍生件、缺原文配对，适合验证 unstructured family 与 fallback metadata 路径。",
      entries: translationOnly.entryIds.map((entryId) => entryIndex.get(entryId)).filter(Boolean),
    });
  }

  return groups;
}

function createSelectionGroup(id, label, reason, entries, manifest, options = {}) {
  return {
    id,
    label,
    reason,
    entries: entries.map((entry) => createEntryRecord(manifest, entry, {
      selectionReason: options.selectionReason || reason,
    })),
  };
}

function buildLaneCounts(entries) {
  const counts = {};
  for (const entry of entries) {
    counts[entry.recommendedLane] = (counts[entry.recommendedLane] || 0) + 1;
  }
  return counts;
}

function buildTagCounts(entries) {
  const counts = {};
  for (const entry of entries) {
    for (const tag of entry.tags) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return counts;
}

export function buildBalancedPdfCorpusSelection(manifest, options = {}) {
  if (!manifest || typeof manifest !== "object") {
    throw createScriptError("validation", "PDF corpus manifest must be an object", {
      failedStage: "build-curation",
    });
  }

  const manifestEntries = Array.isArray(manifest.entries) ? manifest.entries.slice() : [];
  const entryIndex = buildEntryIndex(manifest);
  const familyIndex = buildFamilyIndex(manifest);
  const groups = [];
  const selectedIds = new Set();
  const excludedFamilyKeys = new Set();

  const translationGroups = chooseTranslationFamilies(manifest, entryIndex);
  for (const translationGroup of translationGroups) {
    const groupEntries = translationGroup.entries.filter(Boolean);
    groupEntries.forEach((entry) => {
      selectedIds.add(entry.id);
      excludedFamilyKeys.add(normalizeSearchText(entry.familyKey));
    });
    groups.push(createSelectionGroup(
      translationGroup.id,
      translationGroup.label,
      translationGroup.reason,
      groupEntries,
      manifest,
    ));
  }

  const coreEntries = chooseCoreTextEntries(manifestEntries).filter((entry) => !selectedIds.has(entry.id));
  coreEntries.forEach((entry) => selectedIds.add(entry.id));
  groups.push(createSelectionGroup(
    "core-text-smoke",
    "Core Text Smoke",
    "优先保留 metadata 完整、可直接抽文本的原始 PDF，作为 Reader/导入基线样本。",
    coreEntries,
    manifest,
  ));

  const metadataOnlineEntries = chooseMetadataPoorOnlineEntries(manifestEntries, excludedFamilyKeys)
    .filter((entry) => !selectedIds.has(entry.id));
  metadataOnlineEntries.forEach((entry) => selectedIds.add(entry.id));
  groups.push(createSelectionGroup(
    "metadata-repair-online",
    "Metadata Repair Online",
    "保留本地 metadata 不足但联网补全成功的原始论文，用于验证联网修复闭环。",
    metadataOnlineEntries,
    manifest,
  ));

  const metadataLocalEntries = chooseMetadataPoorLocalEntries(manifestEntries, excludedFamilyKeys)
    .filter((entry) => !selectedIds.has(entry.id));
  metadataLocalEntries.forEach((entry) => selectedIds.add(entry.id));
  groups.push(createSelectionGroup(
    "metadata-repair-local",
    "Metadata Repair Local",
    "保留依赖文件名派生 metadata 的结构化原始 PDF，用于验证离线 fallback 与清洗规则。",
    metadataLocalEntries,
    manifest,
  ));

  const scanEntries = chooseScanEntries(manifestEntries).filter((entry) => !selectedIds.has(entry.id));
  scanEntries.forEach((entry) => selectedIds.add(entry.id));
  groups.push(createSelectionGroup(
    "scan-ocr",
    "Scan OCR",
    "保留扫描件 / OCR 候选，用于区分纯文本 PDF 与后续 OCR lane。",
    scanEntries,
    manifest,
  ));

  const permissionEntries = choosePermissionEntries(manifestEntries).filter((entry) => !selectedIds.has(entry.id));
  permissionEntries.forEach((entry) => selectedIds.add(entry.id));
  groups.push(createSelectionGroup(
    "permission-edge",
    "Permission Edge",
    "保留带权限限制的 PDF，用于验证受限文档的读取边界。",
    permissionEntries,
    manifest,
  ));

  const selectedEntries = groups.flatMap((group) => group.entries);
  const selectedFamilyKeys = new Set(selectedEntries.map((entry) => normalizeSearchText(entry.familyKey)));
  const selectedFamilies = Array.from(selectedFamilyKeys)
    .map((key) => familyIndex.get(key))
    .filter(Boolean);

  return {
    schemaVersion: PDF_TEST_CORPUS_CURATION_SCHEMA_VERSION,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    profile: CURATION_PROFILE_BALANCED_V1,
    sourceManifestPath: normalizeString(options.sourceManifestPath) || null,
    sourceRoot: manifest.sourceRoot || null,
    summary: {
      selectedEntryCount: selectedEntries.length,
      selectedFamilyCount: selectedFamilies.length,
      laneCounts: buildLaneCounts(selectedEntries),
      tagCounts: buildTagCounts(selectedEntries),
    },
    groups,
  };
}

export function renderPdfCorpusSelectionMarkdown(selection) {
  const lines = [
    "# PDF Test Corpus Curated Selection",
    "",
    `- Profile: \`${selection.profile}\``,
    `- Generated At: \`${selection.generatedAt}\``,
    `- Source Manifest: \`${selection.sourceManifestPath || "-"}\``,
    `- Selected Entries: \`${selection.summary.selectedEntryCount}\``,
    `- Selected Families: \`${selection.summary.selectedFamilyCount}\``,
    "",
  ];

  for (const group of selection.groups) {
    lines.push(`## ${group.label}`);
    lines.push("");
    lines.push(group.reason);
    lines.push("");
    for (const entry of group.entries) {
      const title = entry.resolvedMetadata.title || "-";
      const author = entry.resolvedMetadata.author || "-";
      const doi = entry.resolvedMetadata.doi || "-";
      lines.push(`- \`${entry.fileName}\``);
      lines.push(`  Lane: \`${entry.recommendedLane}\`; Variant: \`${entry.variantKind}\`; Pages: \`${entry.pages ?? "-"}\`; Online: \`${entry.onlineStatus || "-"}\``);
      lines.push(`  Title: ${title}`);
      lines.push(`  Author: ${author}`);
      lines.push(`  DOI: ${doi}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export async function loadPdfCorpusManifest(manifestPath) {
  const normalizedPath = path.resolve(assertNonEmptyString(manifestPath, "manifestPath", {
    category: "args",
    failedStage: "parse-args",
  }));
  return await readJSONFile(normalizedPath, {
    failedStage: "read-manifest",
    label: normalizedPath,
  });
}

export async function writePdfCorpusSelectionArtifacts(outputBasePath, selection) {
  const normalizedBasePath = path.resolve(assertNonEmptyString(outputBasePath, "outputBasePath", {
    category: "args",
    failedStage: "parse-args",
  }));
  const jsonPath = normalizedBasePath.endsWith(".json")
    ? normalizedBasePath
    : `${normalizedBasePath}.json`;
  const markdownPath = jsonPath.replace(/\.json$/u, ".md");

  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(selection, null, 2)}\n`, "utf-8");
  await fs.writeFile(markdownPath, renderPdfCorpusSelectionMarkdown(selection), "utf-8");

  return {
    jsonPath,
    markdownPath,
  };
}
