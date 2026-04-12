import fs from "node:fs";
import path from "node:path";

export const CURRENT_TRUTH_SOURCE_FILE = "docs/CURRENT_BACKLOG.md";
export const CURRENT_TRUTH_CONSUMER_FILES = [
  "README.md",
  "FRAMEWORK_CHECKLIST.md",
  "FRAMEWORK_ASSESSMENT.md",
  "docs/AGENT_AUTONOMY_ROADMAP.md",
];
export const CURRENT_TRUTH_SECTION_HEADING = "## 当前单一事实源";
export const CURRENT_TRUTH_SECTION_HEADINGS = [
  CURRENT_TRUTH_SECTION_HEADING,
  "## 当前 truth（双层口径）",
];
export const CURRENT_TRUTH_MARKER_START = "<!-- CURRENT-TRUTH-SUMMARY:START -->";
export const CURRENT_TRUTH_MARKER_END = "<!-- CURRENT-TRUTH-SUMMARY:END -->";
export const CURRENT_TRUTH_META_MARKER_START = "<!-- CURRENT-TRUTH-META:START -->";
export const CURRENT_TRUTH_META_MARKER_END = "<!-- CURRENT-TRUTH-META:END -->";

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizeNewlines(text) {
  return String(text || "").replace(/\r\n/gu, "\n");
}

function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export function readTextFile(filePath) {
  return normalizeNewlines(fs.readFileSync(filePath, "utf-8"));
}

export function extractHeadingSection(documentText, heading = CURRENT_TRUTH_SECTION_HEADINGS) {
  const normalized = normalizeNewlines(documentText);
  const headings = Array.isArray(heading) ? heading : [heading];
  for (const candidate of headings) {
    const pattern = new RegExp(
      `(^|\\n)${escapeRegExp(candidate)}\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
      "u",
    );
    const match = normalized.match(pattern);
    if (match) {
      return match[2];
    }
  }
  throw new Error(`Missing heading section: ${headings.join(" | ")}`);
}

export function extractMarkedBlock(documentText, {
  startMarker = CURRENT_TRUTH_MARKER_START,
  endMarker = CURRENT_TRUTH_MARKER_END,
} = {}) {
  const normalized = normalizeNewlines(documentText);
  const pattern = new RegExp(
    `${escapeRegExp(startMarker)}\\n([\\s\\S]*?)\\n${escapeRegExp(endMarker)}`,
    "u",
  );
  const match = normalized.match(pattern);
  if (!match) {
    throw new Error(`Missing marker block: ${startMarker} ... ${endMarker}`);
  }
  return String(match[1] || "").trim();
}

export function renderMarkedBlock(content, {
  startMarker = CURRENT_TRUTH_MARKER_START,
  endMarker = CURRENT_TRUTH_MARKER_END,
} = {}) {
  const normalizedContent = String(content || "").trim();
  return ensureTrailingNewline(
    `${startMarker}\n${normalizedContent}\n${endMarker}`,
  );
}

export function replaceMarkedBlock(documentText, content, markers = {}) {
  const normalized = normalizeNewlines(documentText);
  const renderedBlock = renderMarkedBlock(content, markers).trimEnd();
  const pattern = new RegExp(
    `${escapeRegExp(markers.startMarker || CURRENT_TRUTH_MARKER_START)}\\n[\\s\\S]*?\\n${escapeRegExp(markers.endMarker || CURRENT_TRUTH_MARKER_END)}`,
    "u",
  );
  if (!pattern.test(normalized)) {
    throw new Error("Missing target marker block for replacement");
  }
  return ensureTrailingNewline(normalized.replace(pattern, renderedBlock));
}

export function readCurrentTruthSummary(rootDir = process.cwd()) {
  const sourcePath = path.join(rootDir, CURRENT_TRUTH_SOURCE_FILE);
  const sourceText = readTextFile(sourcePath);
  const sectionText = extractHeadingSection(sourceText, CURRENT_TRUTH_SECTION_HEADINGS);
  return extractMarkedBlock(sectionText);
}

export function readCurrentTruthMeta(rootDir = process.cwd()) {
  const sourcePath = path.join(rootDir, CURRENT_TRUTH_SOURCE_FILE);
  const sourceText = readTextFile(sourcePath);
  const sectionText = extractHeadingSection(sourceText, CURRENT_TRUTH_SECTION_HEADINGS);
  const raw = extractMarkedBlock(sectionText, {
    startMarker: CURRENT_TRUTH_META_MARKER_START,
    endMarker: CURRENT_TRUTH_META_MARKER_END,
  });
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" ? parsed : {};
}

export function extractCurrentTruthActiveBatchId(summaryText) {
  const text = String(summaryText || "");
  const patterns = [
    /当前 active 高逻辑已切到 `([^`]+)`/u,
    /当前 active 架构与规划已切到 `([^`]+)`/u,
    /当前唯一主线批次已固定为 `([^`]+)`/u,
    /当前主线固定为 `([^`]+)`/u,
    /当前主线为 `([^`]+)`/u,
    /当前活跃批次(?:已)?(?:固定)?为 `([^`]+)`/u,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return String(match[1]).trim() || null;
    }
  }
  const fallbackMatch = text.match(/active `([^`]+)` 只允许/u);
  if (fallbackMatch?.[1]) {
    return String(fallbackMatch[1]).trim() || null;
  }
  return null;
}

function extractCurrentWaveNameFromSummary(summaryText) {
  const patterns = [
    /当前 active expansion wave[：:]\s*`([^`]+)`/u,
    /当前已显式进入 `([^`]+)`/u,
  ];
  for (const pattern of patterns) {
    const match = String(summaryText || "").match(pattern);
    if (match?.[1]) {
      return String(match[1]).trim() || null;
    }
  }
  return null;
}

function extractAcceptanceTrackFromSummary(summaryText) {
  const match = String(summaryText || "").match(/(?:验收主线|acceptance track)[：:]\s*`([^`]+)`/u);
  return match?.[1] ? String(match[1]).trim() || null : null;
}

export function readCurrentTruthState(rootDir = process.cwd()) {
  const summary = readCurrentTruthSummary(rootDir);
  let meta = {};
  try {
    meta = readCurrentTruthMeta(rootDir);
  } catch {
    meta = {};
  }
  const activeBatchId = String(meta?.activeBatchId || "").trim()
    || extractCurrentTruthActiveBatchId(summary)
    || null;
  const currentWaveName = String(meta?.currentWaveName || "").trim()
    || extractCurrentWaveNameFromSummary(summary)
    || null;
  const acceptanceTrack = String(meta?.acceptanceTrack || "").trim()
    || extractAcceptanceTrackFromSummary(summary)
    || null;
  return {
    summary,
    meta,
    activeBatchId,
    currentWaveName,
    acceptanceTrack,
  };
}

export function buildCurrentTruthSyncPlan({
  rootDir = process.cwd(),
  sourceFile = CURRENT_TRUTH_SOURCE_FILE,
  consumerFiles = CURRENT_TRUTH_CONSUMER_FILES,
} = {}) {
  const absoluteRoot = path.resolve(rootDir);
  const sourcePath = path.join(absoluteRoot, sourceFile);
  const sourceText = readTextFile(sourcePath);
  const sectionText = extractHeadingSection(sourceText, CURRENT_TRUTH_SECTION_HEADINGS);
  const summaryContent = extractMarkedBlock(sectionText);

  const consumers = consumerFiles.map((relativePath) => {
    const absolutePath = path.join(absoluteRoot, relativePath);
    const currentText = readTextFile(absolutePath);
    const currentBlock = extractMarkedBlock(currentText);
    const nextText = replaceMarkedBlock(currentText, summaryContent);
    return {
      relativePath,
      absolutePath,
      currentBlock,
      expectedBlock: summaryContent,
      currentText,
      nextText,
      changed: currentText !== nextText,
    };
  });

  return {
    rootDir: absoluteRoot,
    sourceFile,
    sourcePath,
    summaryContent,
    consumers,
    changedFiles: consumers.filter((item) => item.changed),
  };
}

export function applyCurrentTruthSyncPlan(plan) {
  const changedFiles = Array.isArray(plan?.changedFiles) ? plan.changedFiles : [];
  for (const entry of changedFiles) {
    fs.writeFileSync(entry.absolutePath, entry.nextText, "utf-8");
  }
  return changedFiles.map((entry) => entry.relativePath);
}
