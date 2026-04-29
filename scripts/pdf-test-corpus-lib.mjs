import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  assertNonEmptyString,
  createScriptError,
  wrapScriptError,
} from "./script-runtime-lib.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_COMMAND_MAX_BUFFER = 16 * 1024 * 1024;
const DEFAULT_CROSSREF_ENDPOINT = "https://api.crossref.org/works";
const PDF_CORPUS_SCHEMA_VERSION = 1;
const LARGE_FILE_BYTES = 10 * 1024 * 1024;
const LARGE_FILE_PAGES = 150;
const CROSSREF_SELECT_FIELDS = [
  "DOI",
  "URL",
  "author",
  "container-title",
  "issued",
  "published",
  "published-online",
  "published-print",
  "publisher",
  "score",
  "title",
  "type",
].join(",");

const VARIANT_RULES = Object.freeze([
  {
    kind: "translated-dual",
    pattern: /\.no_watermark\.zh\.dual$/iu,
  },
  {
    kind: "translated-mono",
    pattern: /\.no_watermark\.zh\.mono$/iu,
  },
  {
    kind: "supplemental-translation-dual",
    pattern: /_Suppr AI 翻译_zh-cn_dual$/iu,
  },
]);

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeWhitespace(value) {
  return normalizeString(value).replace(/\s+/gu, " ");
}

function normalizeSearchText(value) {
  return normalizeWhitespace(value)
    .normalize("NFKC")
    .toLowerCase();
}

function normalizeTitleForComparison(value) {
  return normalizeSearchText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function tokenizeTitle(value) {
  const normalized = normalizeTitleForComparison(value);
  if (!normalized) {
    return [];
  }
  return normalized.split(" ").filter(Boolean);
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
}

async function defaultCommandRunner(command, args) {
  try {
    const result = await execFileAsync(command, args, {
      encoding: "utf-8",
      maxBuffer: DEFAULT_COMMAND_MAX_BUFFER,
    });
    return {
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || ""),
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createScriptError("environment", `Missing required PDF tool: ${command}`, {
        failedStage: "tool-preflight",
        details: {
          command,
        },
        cause: error,
      });
    }
    throw wrapScriptError(error, {
      failedStage: "run-pdf-tool",
      details: {
        command,
        args,
      },
    });
  }
}

async function defaultHashFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function collectFilesRecursive(rootDir) {
  const pending = [rootDir];
  const files = [];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
}

function stripPdfExtension(fileName) {
  return String(fileName || "").replace(/\.pdf$/iu, "");
}

function applyVariantRule(stem) {
  for (const rule of VARIANT_RULES) {
    if (rule.pattern.test(stem)) {
      return {
        kind: rule.kind,
        strippedStem: stem.replace(rule.pattern, ""),
      };
    }
  }
  return {
    kind: "original",
    strippedStem: stem,
  };
}

export function detectPdfVariantKind(fileName) {
  const stem = stripPdfExtension(path.basename(String(fileName || "")));
  return applyVariantRule(stem).kind;
}

export function createPdfFamilyKey(fileName) {
  const stem = stripPdfExtension(path.basename(String(fileName || "")));
  return applyVariantRule(stem).strippedStem;
}

export function parseFilenameDerivedMetadata(fileName) {
  const familyKey = createPdfFamilyKey(fileName);
  const match = /^(?<authors>.+?)\s+-\s+(?<year>(?:19|20)\d{2})\s+-\s+(?<title>.+)$/u.exec(familyKey);

  if (!match?.groups) {
    return {
      matched: false,
      authors: null,
      year: null,
      title: null,
    };
  }

  return {
    matched: true,
    authors: normalizeWhitespace(match.groups.authors),
    year: Number.parseInt(match.groups.year, 10),
    title: normalizeWhitespace(match.groups.title),
  };
}

function parseLabeledOutput(output) {
  const fields = {};
  const lines = String(output || "").split(/\r?\n/u);
  for (const line of lines) {
    const match = /^([^:]+):\s*(.*)$/u.exec(line);
    if (!match) {
      continue;
    }
    fields[normalizeWhitespace(match[1])] = normalizeWhitespace(match[2]);
  }
  return fields;
}

function parsePositiveInteger(rawValue) {
  const match = /\d+/u.exec(String(rawValue || ""));
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[0], 10);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function parseFileSizeBytes(rawValue) {
  const match = /(\d+)\s+bytes/iu.exec(String(rawValue || ""));
  if (!match) {
    return parsePositiveInteger(rawValue);
  }
  return Number.parseInt(match[1], 10);
}

export function parsePdfInfoOutput(output) {
  const fields = parseLabeledOutput(output);
  const encryptedDetail = normalizeString(fields.Encrypted) || null;

  return {
    rawFields: fields,
    title: normalizeWhitespace(fields.Title) || null,
    author: normalizeWhitespace(fields.Author) || null,
    creationDate: normalizeWhitespace(fields.CreationDate) || null,
    encrypted: encryptedDetail
      ? !/^no\b/iu.test(encryptedDetail)
      : null,
    encryptedDetail,
    pages: parsePositiveInteger(fields.Pages),
    fileSizeBytes: parseFileSizeBytes(fields["File size"]),
  };
}

function summarizeTextExtraction(output) {
  const text = String(output || "");
  return {
    ok: true,
    nonEmpty: /\S/u.test(text),
    charCount: text.length,
  };
}

function buildQuerySeed(entry) {
  const localTitle = entry.metadata.title || entry.filenameDerived.title || null;
  const localAuthors = entry.metadata.author || entry.filenameDerived.authors || null;
  const localYear = entry.filenameDerived.year || null;

  return {
    title: localTitle,
    authors: localAuthors,
    year: localYear,
  };
}

function normalizeCrossrefAuthorList(authorList) {
  if (!Array.isArray(authorList)) {
    return [];
  }
  return authorList
    .map((author) => {
      const given = normalizeWhitespace(author?.given);
      const family = normalizeWhitespace(author?.family);
      const name = normalizeWhitespace(author?.name);
      if (given || family) {
        return normalizeWhitespace(`${given} ${family}`);
      }
      return name || null;
    })
    .filter(Boolean);
}

function extractCrossrefYear(message) {
  const candidates = [
    message?.issued?.["date-parts"],
    message?.published?.["date-parts"],
    message?.["published-print"]?.["date-parts"],
    message?.["published-online"]?.["date-parts"],
  ];

  for (const candidate of candidates) {
    const year = Number(candidate?.[0]?.[0]);
    if (Number.isInteger(year) && year > 0) {
      return year;
    }
  }

  return null;
}

function normalizeCrossrefItem(item) {
  const title = Array.isArray(item?.title) ? normalizeWhitespace(item.title[0]) : null;
  const authors = normalizeCrossrefAuthorList(item?.author);

  return {
    provider: "crossref",
    doi: normalizeWhitespace(item?.DOI) || null,
    title,
    authors,
    year: extractCrossrefYear(item),
    journal: Array.isArray(item?.["container-title"]) ? normalizeWhitespace(item["container-title"][0]) : null,
    type: normalizeWhitespace(item?.type) || null,
    publisher: normalizeWhitespace(item?.publisher) || null,
    url: normalizeWhitespace(item?.URL) || null,
    providerScore: Number.isFinite(Number(item?.score)) ? Number(item.score) : null,
    raw: item,
  };
}

function calculateTitleOverlap(leftTitle, rightTitle) {
  const leftTokens = tokenizeTitle(leftTitle);
  const rightTokens = tokenizeTitle(rightTitle);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }
  const denominator = Math.max(leftSet.size, rightSet.size);
  return denominator > 0 ? intersection / denominator : 0;
}

function normalizeAuthorKey(authors) {
  return normalizeSearchText(String(authors || "").split(/[;,、和]/u)[0] || "");
}

function buildCrossrefDecision(seed, candidate) {
  const seedTitle = normalizeTitleForComparison(seed.title);
  const candidateTitle = normalizeTitleForComparison(candidate.title);
  const titleExact = Boolean(seedTitle && candidateTitle && seedTitle === candidateTitle);
  const titleOverlap = calculateTitleOverlap(seed.title, candidate.title);
  const seedAuthorKey = normalizeAuthorKey(seed.authors);
  const authorMatch = seedAuthorKey
    ? candidate.authors.some((author) => normalizeSearchText(author).includes(seedAuthorKey))
    : false;
  const yearDelta = Number.isInteger(seed.year) && Number.isInteger(candidate.year)
    ? Math.abs(seed.year - candidate.year)
    : null;

  let confidence = "low";
  let accepted = false;

  if (titleExact && (yearDelta === null || yearDelta <= 1)) {
    confidence = authorMatch ? "high" : "medium";
    accepted = true;
  } else if (titleOverlap >= 0.88 && (yearDelta === null || yearDelta <= 1) && (authorMatch || !seedAuthorKey)) {
    confidence = authorMatch ? "high" : "medium";
    accepted = true;
  } else if (titleOverlap >= 0.72 && authorMatch && (yearDelta === null || yearDelta <= 1)) {
    confidence = "medium";
    accepted = true;
  }

  return {
    accepted,
    confidence,
    signals: {
      titleExact,
      titleOverlap,
      authorMatch,
      yearDelta,
      providerScore: candidate.providerScore,
    },
  };
}

async function fetchJSON(url, options, fetchImpl) {
  const timeoutMs = Number(options?.timeoutMs) > 0 ? Number(options.timeoutMs) : 5000;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`Timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutHandle);
    throw wrapScriptError(error, {
      failedStage: "fetch-online-metadata",
      details: {
        url,
      },
    });
  }
  clearTimeout(timeoutHandle);

  if (!response?.ok) {
    throw createScriptError("execution", `Metadata request failed with HTTP ${response?.status ?? "unknown"}: ${url}`, {
      failedStage: "fetch-online-metadata",
      details: {
        url,
        status: response?.status ?? null,
      },
    });
  }

  try {
    return await response.json();
  } catch (error) {
    throw createScriptError("validation", `Metadata provider returned invalid JSON: ${url}`, {
      failedStage: "parse-online-metadata",
      details: {
        url,
      },
      cause: error,
    });
  }
}

export async function lookupCrossrefMetadata(seed, options = {}) {
  if (!seed?.title) {
    return {
      provider: "crossref",
      status: "skipped",
      reason: "missing-title",
      attemptedURL: null,
      candidates: [],
      bestMatch: null,
    };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw createScriptError("environment", "Online metadata enrichment requires fetch support", {
      failedStage: "prepare-online-metadata",
      details: {
        provider: "crossref",
      },
    });
  }

  const endpoint = normalizeString(options.endpoint) || DEFAULT_CROSSREF_ENDPOINT;
  const params = new URLSearchParams();
  params.set("rows", String(options.rows || 5));
  params.set("select", CROSSREF_SELECT_FIELDS);
  params.set("query.bibliographic", seed.year ? `${seed.title} ${seed.year}` : seed.title);
  if (seed.authors) {
    params.set("query.author", seed.authors);
  }
  if (options.mailto) {
    params.set("mailto", options.mailto);
  }

  const attemptedURL = `${endpoint}?${params.toString()}`;
  const payload = await fetchJSON(attemptedURL, {
    headers: {
      accept: "application/json",
    },
    timeoutMs: options.requestTimeoutMs,
  }, fetchImpl);

  const items = Array.isArray(payload?.message?.items) ? payload.message.items : [];
  const candidates = items.map((item) => {
    const normalized = normalizeCrossrefItem(item);
    const decision = buildCrossrefDecision(seed, normalized);
    return {
      ...normalized,
      match: decision,
    };
  });

  const acceptedCandidates = candidates.filter((candidate) => candidate.match.accepted);
  acceptedCandidates.sort((left, right) => {
    const confidenceWeight = { high: 2, medium: 1, low: 0 };
    const leftWeight = confidenceWeight[left.match.confidence] || 0;
    const rightWeight = confidenceWeight[right.match.confidence] || 0;
    if (leftWeight !== rightWeight) {
      return rightWeight - leftWeight;
    }
    return (right.match.signals.titleOverlap || 0) - (left.match.signals.titleOverlap || 0);
  });

  const bestMatch = acceptedCandidates[0] || null;

  return {
    provider: "crossref",
    status: bestMatch ? "matched" : (candidates.length > 0 ? "no-match" : "empty"),
    reason: bestMatch ? null : (candidates.length > 0 ? "confidence-too-low" : "no-results"),
    attemptedURL,
    candidates,
    bestMatch,
  };
}

function mergeMetadata(entry, enrichment) {
  const bestMatch = enrichment?.bestMatch;
  if (!bestMatch) {
    return {
      ...entry.metadata,
      doi: null,
      journal: null,
      publisher: null,
      source: "local",
    };
  }

  return {
    title: entry.metadata.title || bestMatch.title || null,
    author: entry.metadata.author || (bestMatch.authors.length > 0 ? bestMatch.authors.join(", ") : null),
    creationDate: entry.metadata.creationDate || (bestMatch.year ? `${bestMatch.year}` : null),
    encrypted: entry.metadata.encrypted,
    encryptedDetail: entry.metadata.encryptedDetail,
    pages: entry.metadata.pages,
    fileSizeBytes: entry.metadata.fileSizeBytes,
    doi: bestMatch.doi || null,
    journal: bestMatch.journal || null,
    publisher: bestMatch.publisher || null,
    source: "local+crossref",
  };
}

function shouldAttemptOnlineEnrichment(entry) {
  return !entry.metadata.title || !entry.metadata.author;
}

export function pickPdfCorpusTags(entry) {
  const tags = [];

  if (entry.variantKind !== "original") {
    tags.push("translated-variant");
  }
  if (entry.metadata.encrypted) {
    tags.push("permission-edge");
  }
  if (entry.firstPageText.ok && entry.firstPageText.nonEmpty === false) {
    tags.push("scan-ocr-candidate");
  }
  if (!entry.metadata.title || !entry.metadata.author) {
    tags.push("metadata-poor");
  }
  if (!entry.filenameDerived.matched) {
    tags.push("filename-unstructured");
  }
  if (entry.sizeBytes >= LARGE_FILE_BYTES || (entry.metadata.pages || 0) >= LARGE_FILE_PAGES) {
    tags.push("large-file");
  }
  if (entry.onlineEnrichment?.status === "matched") {
    tags.push("online-metadata-match");
  }

  return uniqueSorted(tags);
}

export function pickPdfCorpusLane(entry) {
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  if (tags.includes("permission-edge")) {
    return "permission-edge";
  }
  if (tags.includes("scan-ocr-candidate")) {
    return "scan-ocr";
  }
  if (tags.includes("translated-variant")) {
    return "translated-variant";
  }
  if (tags.includes("metadata-poor")) {
    return "metadata-poor";
  }
  return "core-text";
}

function scoreRepresentative(entry) {
  let score = 0;
  if (entry.variantKind === "original") {
    score += 40;
  }
  if (entry.firstPageText.nonEmpty) {
    score += 30;
  }
  if (!entry.metadata.encrypted) {
    score += 20;
  }
  if (entry.filenameDerived.matched) {
    score += 10;
  }
  if (entry.onlineEnrichment?.status === "matched") {
    score += 15;
  }
  if ((entry.metadata.title || entry.resolvedMetadata.title) && (entry.metadata.author || entry.resolvedMetadata.author)) {
    score += 10;
  }
  return score;
}

export function groupPdfCorpusFamilies(entries) {
  const families = new Map();

  for (const entry of entries) {
    const key = normalizeSearchText(entry.familyKey);
    if (!families.has(key)) {
      families.set(key, {
        familyKey: entry.familyKey,
        familyKeyNormalized: key,
        entries: [],
      });
    }
    families.get(key).entries.push(entry);
  }

  return Array.from(families.values())
    .map((family) => {
      const entriesInFamily = family.entries.slice().sort((left, right) => {
        const scoreDelta = scoreRepresentative(right) - scoreRepresentative(left);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        return left.fileName.localeCompare(right.fileName, "zh-Hans-CN");
      });
      const preferred = entriesInFamily[0] || null;
      return {
        familyKey: family.familyKey,
        familyKeyNormalized: family.familyKeyNormalized,
        entryIds: entriesInFamily.map((entry) => entry.id),
        fileNames: entriesInFamily.map((entry) => entry.fileName),
        preferredEntryId: preferred?.id || null,
        variantKinds: uniqueSorted(entriesInFamily.map((entry) => entry.variantKind)),
        size: entriesInFamily.length,
      };
    })
    .sort((left, right) => {
      if (left.size !== right.size) {
        return right.size - left.size;
      }
      return left.familyKey.localeCompare(right.familyKey, "zh-Hans-CN");
    });
}

export function buildPdfCorpusSummary(entries, families) {
  const summary = {
    totalEntries: entries.length,
    totalBytes: 0,
    pdfInfoOkCount: 0,
    textExtractableCount: 0,
    encryptedCount: 0,
    titleCount: 0,
    authorCount: 0,
    creationDateCount: 0,
    filenamePatternCount: 0,
    onlineMatchedCount: 0,
    duplicateFamilyCount: 0,
    tagCounts: {},
    laneCounts: {},
    variantCounts: {},
    recommendedRepresentativeEntryIds: [],
  };

  for (const entry of entries) {
    summary.totalBytes += Number(entry.sizeBytes || 0);
    if (entry.pdfInfo.ok) {
      summary.pdfInfoOkCount += 1;
    }
    if (entry.firstPageText.nonEmpty) {
      summary.textExtractableCount += 1;
    }
    if (entry.metadata.encrypted) {
      summary.encryptedCount += 1;
    }
    if (entry.metadata.title || entry.resolvedMetadata.title) {
      summary.titleCount += 1;
    }
    if (entry.metadata.author || entry.resolvedMetadata.author) {
      summary.authorCount += 1;
    }
    if (entry.metadata.creationDate || entry.resolvedMetadata.creationDate) {
      summary.creationDateCount += 1;
    }
    if (entry.filenameDerived.matched) {
      summary.filenamePatternCount += 1;
    }
    if (entry.onlineEnrichment?.status === "matched") {
      summary.onlineMatchedCount += 1;
    }
    summary.variantCounts[entry.variantKind] = (summary.variantCounts[entry.variantKind] || 0) + 1;
    summary.laneCounts[entry.recommendedLane] = (summary.laneCounts[entry.recommendedLane] || 0) + 1;
    for (const tag of entry.tags) {
      summary.tagCounts[tag] = (summary.tagCounts[tag] || 0) + 1;
    }
  }

  for (const family of families) {
    if (family.size > 1) {
      summary.duplicateFamilyCount += 1;
    }
    if (family.preferredEntryId) {
      summary.recommendedRepresentativeEntryIds.push(family.preferredEntryId);
    }
  }

  summary.recommendedRepresentativeEntryIds.sort((left, right) => left.localeCompare(right, "en"));
  return summary;
}

async function scanSinglePdf(filePath, rootDir, options) {
  const relativePath = path.relative(rootDir, filePath).replaceAll(path.sep, "/");
  const fileName = path.basename(filePath);
  const stat = await options.statFile(filePath);
  const variantKind = detectPdfVariantKind(fileName);
  const familyKey = createPdfFamilyKey(fileName);
  const filenameDerived = parseFilenameDerivedMetadata(fileName);

  let sha256 = null;
  if (options.includeSha256) {
    sha256 = await options.hashFile(filePath);
  }

  const pdfInfo = {
    ok: false,
    errorMessage: null,
    failedStage: null,
  };
  let metadata = {
    title: null,
    author: null,
    creationDate: null,
    encrypted: null,
    encryptedDetail: null,
    pages: null,
    fileSizeBytes: null,
  };

  try {
    const result = await options.commandRunner(options.pdfInfoCommand, [filePath]);
    metadata = parsePdfInfoOutput(result.stdout);
    pdfInfo.ok = true;
  } catch (error) {
    pdfInfo.errorMessage = String(error?.message || error || "pdfinfo failed");
    pdfInfo.failedStage = error?.failedStage || "run-pdf-tool";
  }

  const firstPageText = {
    ok: false,
    nonEmpty: null,
    charCount: null,
    errorMessage: null,
    failedStage: null,
  };
  try {
    const result = await options.commandRunner(options.pdfToTextCommand, [
      "-f",
      "1",
      "-l",
      "1",
      "-nopgbrk",
      "-layout",
      filePath,
      "-",
    ]);
    Object.assign(firstPageText, summarizeTextExtraction(result.stdout));
  } catch (error) {
    firstPageText.errorMessage = String(error?.message || error || "pdftotext failed");
    firstPageText.failedStage = error?.failedStage || "run-pdf-tool";
  }

  const entry = {
    id: sha256 ? `pdf-${sha256.slice(0, 12)}` : `pdf-${crypto.createHash("sha1").update(relativePath).digest("hex").slice(0, 12)}`,
    fileName,
    relativePath,
    sizeBytes: stat.size,
    modifiedAt: new Date(stat.mtimeMs).toISOString(),
    sha256,
    variantKind,
    familyKey,
    filenameDerived,
    pdfInfo,
    metadata,
    firstPageText,
    onlineEnrichment: null,
    resolvedMetadata: null,
    tags: [],
    recommendedLane: null,
  };

  if (options.enrichOnline && shouldAttemptOnlineEnrichment(entry)) {
    const seed = buildQuerySeed(entry);
    try {
      entry.onlineEnrichment = await lookupCrossrefMetadata(seed, {
        fetchImpl: options.fetchImpl,
        endpoint: options.crossrefEndpoint,
        mailto: options.crossrefMailto,
        requestTimeoutMs: options.requestTimeoutMs,
      });
    } catch (error) {
      entry.onlineEnrichment = {
        provider: "crossref",
        status: "error",
        reason: String(error?.message || error || "online-enrichment-failed"),
        attemptedURL: null,
        candidates: [],
        bestMatch: null,
      };
    }
  } else {
    entry.onlineEnrichment = {
      provider: "crossref",
      status: options.enrichOnline ? "skipped" : "disabled",
      reason: options.enrichOnline ? "local-metadata-already-sufficient" : "online-enrichment-disabled",
      attemptedURL: null,
      candidates: [],
      bestMatch: null,
    };
  }

  entry.resolvedMetadata = mergeMetadata(entry, entry.onlineEnrichment);
  entry.tags = pickPdfCorpusTags(entry);
  entry.recommendedLane = pickPdfCorpusLane(entry);

  return entry;
}

export async function scanPdfTestCorpus(options = {}) {
  const rootDir = path.resolve(assertNonEmptyString(options.rootDir, "rootDir", {
    category: "args",
    failedStage: "parse-args",
  }));
  const stat = await fs.stat(rootDir).catch((error) => {
    throw wrapScriptError(error, {
      failedStage: "read-root-dir",
      details: {
        rootDir,
      },
    });
  });

  if (!stat.isDirectory()) {
    throw createScriptError("args", `rootDir must be a directory: ${rootDir}`, {
      failedStage: "parse-args",
      details: {
        rootDir,
      },
    });
  }

  const files = await collectFilesRecursive(rootDir);
  const pdfFiles = files.filter((filePath) => /\.pdf$/iu.test(path.basename(filePath)));
  const entries = [];

  const runtimeOptions = {
    commandRunner: options.commandRunner || defaultCommandRunner,
    crossrefEndpoint: options.crossrefEndpoint || DEFAULT_CROSSREF_ENDPOINT,
    crossrefMailto: normalizeString(options.crossrefMailto) || null,
    enrichOnline: Boolean(options.enrichOnline),
    fetchImpl: options.fetchImpl || globalThis.fetch,
    hashFile: options.hashFile || defaultHashFile,
    includeSha256: options.includeSha256 !== false,
    pdfInfoCommand: normalizeString(options.pdfInfoCommand) || "pdfinfo",
    pdfToTextCommand: normalizeString(options.pdfToTextCommand) || "pdftotext",
    requestTimeoutMs: Number(options.requestTimeoutMs) > 0 ? Number(options.requestTimeoutMs) : 5000,
    statFile: options.statFile || ((filePath) => fs.stat(filePath)),
  };

  for (const filePath of pdfFiles) {
    entries.push(await scanSinglePdf(filePath, rootDir, runtimeOptions));
  }

  const families = groupPdfCorpusFamilies(entries);
  const summary = buildPdfCorpusSummary(entries, families);

  return {
    schemaVersion: PDF_CORPUS_SCHEMA_VERSION,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    sourceRoot: rootDir,
    onlineEnrichment: {
      enabled: runtimeOptions.enrichOnline,
      providers: runtimeOptions.enrichOnline ? ["crossref"] : [],
      crossrefMailtoConfigured: Boolean(runtimeOptions.crossrefMailto),
    },
    summary,
    families,
    entries,
  };
}

export async function writePdfTestCorpusManifest(outputPath, payload) {
  const normalizedOutputPath = path.resolve(assertNonEmptyString(outputPath, "outputPath", {
    category: "args",
    failedStage: "parse-args",
  }));
  await fs.mkdir(path.dirname(normalizedOutputPath), { recursive: true });
  await fs.writeFile(normalizedOutputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  return normalizedOutputPath;
}
