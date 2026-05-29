import {
  createWorkbenchShellManager,
  resolveThemeMode,
  collectCreatorString,
  resolveYear,
  resolvePublicationName,
} from "./research-workbench-common.js";
import { getWorkflowState } from "./workflow-state.js";

const SHELL_FILE = "research-workbench-matrix.xhtml";
const WINDOW_NAME = "toolsbox-paper-matrix-window";

function safeCall(fn, thisArg, ...args) {
  if (typeof fn !== "function") {
    return undefined;
  }
  try {
    return fn.apply(thisArg, args);
  } catch {
    return undefined;
  }
}

function asArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (value instanceof Set) {
    return Array.from(value);
  }
  if (value instanceof Map) {
    return Array.from(value.values());
  }
  if (typeof value === "object" && typeof value[Symbol.iterator] === "function") {
    return Array.from(value);
  }
  if (typeof value === "object") {
    return Object.values(value);
  }
  return [];
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function readPref(prefs, key, fallback) {
  try {
    const value = typeof prefs?.get === "function" ? prefs.get(key) : undefined;
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function getField(item, field) {
  if (!item) {
    return "";
  }
  const direct = item[field];
  if (direct !== undefined && direct !== null && normalizeText(direct)) {
    return normalizeText(direct);
  }
  return normalizeText(safeCall(item.getField, item, field));
}

function isRegularItem(item) {
  if (!item) {
    return false;
  }
  if (safeCall(item.isNote, item)) {
    return false;
  }
  if (safeCall(item.isAttachment, item)) {
    return false;
  }
  return true;
}

function normalizeItemType(item, zotero) {
  const direct = normalizeText(item?.itemType || getField(item, "itemType"));
  if (direct) {
    return direct;
  }
  const itemTypeID = item?.itemTypeID;
  if (itemTypeID !== undefined && itemTypeID !== null) {
    return normalizeText(
      safeCall(zotero?.ItemTypes?.getName, zotero.ItemTypes, itemTypeID)
      || safeCall(zotero?.ItemTypes?.getLocalizedString, zotero.ItemTypes, itemTypeID)
      || itemTypeID,
    );
  }
  return "";
}

function normalizeTags(item) {
  return asArray(safeCall(item?.getTags, item) || item?.tags)
    .map((entry) => {
      if (typeof entry === "string") {
        return normalizeText(entry);
      }
      return normalizeText(entry?.tag ?? entry?.name ?? entry?.label);
    })
    .filter(Boolean)
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function collectAttachmentCount(item) {
  const refs = safeCall(item?.getAttachments, item);
  if (refs === undefined) {
    return 0;
  }
  return asArray(refs).length;
}

function normalizeYearValue(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const match = text.match(/\b(\d{4})\b/u);
  return match ? Number(match[1]) : null;
}

function compareValues(left, right) {
  if (typeof left === "number" || typeof right === "number") {
    const leftNumber = Number.isFinite(left) ? left : Number.NEGATIVE_INFINITY;
    const rightNumber = Number.isFinite(right) ? right : Number.NEGATIVE_INFINITY;
    return leftNumber - rightNumber;
  }
  return normalizeText(left).localeCompare(normalizeText(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function stableRowTieBreaker(left, right) {
  return compareValues(left.itemID ?? "", right.itemID ?? "");
}

export function buildPaperMatrixRows(items = [], options = {}) {
  const zotero = options.zotero || globalThis.Zotero || {};
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : Number.POSITIVE_INFINITY;
  const rows = [];

  for (const item of asArray(items)) {
    if (!isRegularItem(item)) {
      continue;
    }
    const workflow = getWorkflowState(item, { prefs: options.prefs });
    const tags = normalizeTags(item);
    const attachmentCount = collectAttachmentCount(item);
    rows.push({
      itemID: item.id ?? item.itemID ?? "",
      title: getField(item, "title").slice(0, 120),
      creators: collectCreatorString(item),
      year: resolveYear(item),
      yearNumber: normalizeYearValue(resolveYear(item)),
      publication: resolvePublicationName(item).slice(0, 60),
      dateAdded: normalizeText(item.dateAdded).slice(0, 10),
      dateModified: normalizeText(item.dateModified).slice(0, 10),
      itemType: normalizeItemType(item, zotero),
      doi: getField(item, "DOI").slice(0, 120),
      tags,
      tagList: tags.join(", "),
      workflowStatus: normalizeText(workflow.status || workflow.readStatus || ""),
      attachmentCount,
      hasAttachment: attachmentCount > 0,
      hasAttachmentLabel: attachmentCount > 0 ? "Yes" : "No",
    });
    if (rows.length >= limit) {
      break;
    }
  }

  return rows;
}

export function filterPaperMatrixRows(rows = [], filters = {}) {
  const normalized = {
    itemType: normalizeText(filters.itemType).toLowerCase(),
    tag: normalizeText(filters.tag).toLowerCase(),
    workflowStatus: normalizeText(filters.workflowStatus).toLowerCase(),
    hasAttachment: filters.hasAttachment,
    yearFrom: Number.isFinite(Number(filters.yearFrom)) ? Number(filters.yearFrom) : null,
    yearTo: Number.isFinite(Number(filters.yearTo)) ? Number(filters.yearTo) : null,
  };

  return asArray(rows).filter((row) => {
    if (normalized.itemType && normalizeText(row.itemType).toLowerCase() !== normalized.itemType) {
      return false;
    }
    if (normalized.tag) {
      const tags = asArray(row.tags).map((tag) => normalizeText(tag).toLowerCase());
      if (!tags.includes(normalized.tag)) {
        return false;
      }
    }
    if (normalized.workflowStatus && normalizeText(row.workflowStatus).toLowerCase() !== normalized.workflowStatus) {
      return false;
    }
    if (normalized.hasAttachment === true && !row.hasAttachment) {
      return false;
    }
    if (normalized.hasAttachment === false && row.hasAttachment) {
      return false;
    }
    const year = Number.isFinite(row.yearNumber) ? row.yearNumber : normalizeYearValue(row.year);
    if (normalized.yearFrom !== null && (!Number.isFinite(year) || year < normalized.yearFrom)) {
      return false;
    }
    if (normalized.yearTo !== null && (!Number.isFinite(year) || year > normalized.yearTo)) {
      return false;
    }
    return true;
  });
}

export function sortPaperMatrixRows(rows = [], sort = {}) {
  const key = normalizeText(sort.key || sort.sortKey);
  if (!key) {
    return asArray(rows).slice();
  }
  const dir = normalizeText(sort.dir || sort.direction).toLowerCase() === "desc" ? -1 : 1;
  return asArray(rows)
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const primary = compareValues(left.row[key], right.row[key]);
      if (primary !== 0) {
        return primary * dir;
      }
      const tie = stableRowTieBreaker(left.row, right.row);
      return tie === 0 ? left.index - right.index : tie;
    })
    .map((entry) => entry.row);
}

export function buildPaperMatrixPayload(context = {}, deps = {}) {
  const prefs = deps.prefs;
  const zotero = deps.zotero || globalThis.Zotero || {};
  const enhanced = readPref(prefs, "paperMatrix.enabled", false) === true;
  const collectionID = context.collectionID || null;
  const collectionName = context.collectionName || "";
  let items = [];

  if (Array.isArray(context.items)) {
    items = context.items;
  } else if (collectionID) {
    const collection = safeCall(zotero?.Collections?.get, zotero.Collections, collectionID);
    items = safeCall(collection?.getChildItems, collection) || [];
  } else {
    items = safeCall(zotero?.Items?.getAll, zotero.Items) || [];
  }

  const rows = buildPaperMatrixRows(items, {
    zotero,
    prefs,
    limit: context.limit,
  });

  return {
    theme: resolveThemeMode(prefs),
    enhanced,
    rows,
    collectionID,
    collectionName,
  };
}

export function registerPaperMatrixFeatures(options) {
  const {
    config,
    logger,
    prefs,
    i18n,
    host,
    commandPalette,
    surfaceDescriptors,
  } = options;

  const addonRef = config.addonRef || "toolsbox";
  const addonName = config.addonName || "ToolsBox";
  const rootURI = config.rootURI || `chrome://${addonRef}/`;

  let shellManager = null;

  function isEnabled() {
    try {
      return prefs?.get?.("researchWorkbench.matrix.enabled") ?? true;
    } catch (_) {
      return true;
    }
  }

  function buildPayload(context = {}) {
    try {
      return buildPaperMatrixPayload(context, {
        prefs,
        zotero: globalThis.Zotero,
      });
    } catch (err) {
      logger?.debug?.("[paper-matrix] buildRows failed", { message: String(err?.message || err) });
      return {
        theme: resolveThemeMode(prefs),
        enhanced: readPref(prefs, "paperMatrix.enabled", false) === true,
        rows: [],
        collectionID: context.collectionID || null,
        collectionName: context.collectionName || "",
      };
    }
  }

  function ensureShell() {
    if (!shellManager) {
      shellManager = createWorkbenchShellManager({
        logger,
        host,
        rootURI,
        addonRef,
        addonName,
        prefs,
        shellFileName: SHELL_FILE,
        windowName: WINDOW_NAME,
        windowWidth: 1200,
        windowHeight: 800,
        buildPayload,
      });
    }
    return shellManager;
  }

  function openPaperMatrix(context) {
    if (!isEnabled()) return;
    const shell = ensureShell();
    shell.open(context || {}).catch((err) => {
      logger?.warn?.("[paper-matrix] open failed", { message: String(err?.message || err) });
    });
  }

  commandPalette.registerCommand({
    id: surfaceDescriptors?.paperMatrixCommandID || `${addonRef}-paper-matrix`,
    label: i18n?.t?.("cleanroom-pm-command-label", "Open Paper Matrix") || "Open Paper Matrix",
    category: addonName,
    description: "",
    condition: isEnabled,
    handler: openPaperMatrix,
  });

  return {
    openPaperMatrix,
    getSnapshot: () => shellManager?.getSnapshot?.() || { open: false },
  };
}
