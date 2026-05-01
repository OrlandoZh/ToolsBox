import {
  BOTTLENECK_PRESETS,
  SCENARIO_MODULES,
  SCENARIOS,
  WIND_TUNNEL_ROUTES,
  buildWindTunnelModel,
  createSyntheticItems,
  createTimelineSample,
  DOCUMENT_ANALYSIS_HARNESS,
  listScenariosForModule,
  READER_SOURCE_HARNESS,
  summarizeScenarioCoverage,
  WEB_LIBRARY_UI_HARNESS,
} from "../wind-tunnel-core.js";

const CONTROL_DEFS = Object.freeze([
  { key: "itemCount", label: "items", min: 0, max: 100000, step: 500 },
  { key: "selectionSize", label: "selection", min: 0, max: 10000, step: 50 },
  { key: "eventRate", label: "events/s", min: 0, max: 240, step: 1 },
  { key: "domInflation", label: "DOM nodes", min: 0, max: 8000, step: 100 },
  { key: "ioLatencyMS", label: "I/O ms", min: 0, max: 800, step: 5 },
  { key: "longTaskMS", label: "long task ms", min: 0, max: 180, step: 1 },
  { key: "memoryMB", label: "memory MB", min: 0, max: 512, step: 4 },
  { key: "listenerLeakRate", label: "listener leak", min: 0, max: 200, step: 1 },
  { key: "renderMultiplier", label: "render x", min: 0, max: 25, step: 1 },
]);

const ITEM_TREE_COLUMN_RESIZE_MODEL = Object.freeze({
  resizerWidth: 5,
  columnMinWidth: 20,
  columnPadding: 16,
  commitHandler: "onResize(columnWidths, true)",
});

const LIBRARY_COLUMNS = Object.freeze([
  { key: "title", dataKey: "title", label: "Title", width: 286, minWidth: 118, flex: 1.5, primary: true, zoteroPersist: ["width"] },
  { key: "creator", dataKey: "creator", label: "Creator", width: 164, minWidth: 88, flex: 0.85, zoteroPersist: ["width"] },
  { key: "year", dataKey: "year", label: "Year", width: 64, minWidth: 52, flex: 0.34, zoteroPersist: ["width"] },
  { key: "type", dataKey: "type", label: "Type", width: 126, minWidth: 76, flex: 0.7, zoteroPersist: ["width"] },
]);

const ITEM_PANE_SECTIONS = Object.freeze([
  { key: "info", label: "Info" },
  { key: "notes", label: "Notes" },
  { key: "tags", label: "Tags" },
  { key: "related", label: "Related" },
]);

const TAG_COLOR_PRESETS = Object.freeze([
  "#ff6666",
  "#ff8c19",
  "#999999",
  "#5fb236",
  "#009980",
  "#2ea8e5",
  "#576dd9",
  "#a28ae5",
  "#a6507b",
]);

const TEMPLATE_TAG_CATALOG = Object.freeze([
  { tag: "template-core", type: 0, color: TAG_COLOR_PRESETS[0], position: 0 },
  { tag: "needs-review", type: 0, color: TAG_COLOR_PRESETS[1], position: 1 },
  { tag: "reading-list", type: 0, color: TAG_COLOR_PRESETS[3], position: 2 },
  { tag: "plugin-surface", type: 0, color: TAG_COLOR_PRESETS[5], position: 3 },
  { tag: "performance-bottleneck", type: 0, color: TAG_COLOR_PRESETS[6], position: 4 },
  { tag: "automatic-keyword", type: 1 },
  { tag: "methods", type: 1 },
  { tag: "case-study", type: 0 },
  { tag: "large-library", type: 0 },
  { tag: "long-template-tag-for-width-truncation", type: 0 },
  { tag: "tag-scope-disabled-sample", type: 0, color: TAG_COLOR_PRESETS[8], position: 5 },
]);

const TAG_COLOR_BY_NAME = new Map(
  TEMPLATE_TAG_CATALOG
    .filter((entry) => entry.color)
    .map((entry) => [entry.tag, { color: entry.color, position: entry.position }]),
);

const TAG_LIBRARY_SCENARIO_IDS = new Set([
  "tag-selector-filter",
  "item-pane-notes-tags-related",
  "bulk-metadata-edit",
]);

const state = {
  running: false,
  moduleId: "all",
  scenarioId: "library-large-selection",
  presetId: "baseline",
  controls: {},
  metrics: {
    fps: 60,
    longTasks: 0,
    eventCount: 0,
    renderCount: 0,
    nodeCount: 0,
    heapMB: 0,
  },
  pdfJsHarness: {
    available: false,
    adapterMode: "pending",
    requiredAssets: [],
    viewerURL: DOCUMENT_ANALYSIS_HARNESS.preferredViewerURL,
    samplePDFURL: DOCUMENT_ANALYSIS_HARNESS.samplePDFEndpoint,
    samplePDFMode: "pending",
    samplePDFLabel: "checking sample PDF",
    samplePDFBytes: 0,
    details: "checking Zotero PDF.js build",
  },
  readerSourceHarness: {
    available: false,
    adapterMode: "pending",
    requiredAnchors: [],
    adaptationPolicy: READER_SOURCE_HARNESS.adaptationPolicy,
    details: "checking Zotero Reader source anchors",
  },
  webLibraryHarness: {
    available: false,
    adapterMode: "pending",
    requiredAnchors: [],
    iconBaseURL: WEB_LIBRARY_UI_HARNESS.iconBaseURL,
    adaptationPolicy: WEB_LIBRARY_UI_HARNESS.adaptationPolicy,
    details: "checking Zotero Web Library adapter",
  },
  webLibraryFixture: {
    available: false,
    fixtureMode: "pending",
    collections: [],
    items: [],
    reader: null,
    details: "checking Zotero Web Library fixtures",
  },
  selectedCollectionKey: null,
  selectedItemKey: null,
  librarySelectionKeys: [],
  libraryLastSelectedIndex: 0,
  librarySort: {
    column: "title",
    direction: "ascending",
  },
  libraryColumnWidths: Object.fromEntries(LIBRARY_COLUMNS.map((column) => [column.dataKey, column.width])),
  libraryColumnResize: null,
  lastItemTreeColumnResize: {
    target: "none",
    label: "not resized",
  },
  itemPaneSection: "info",
  lastScenarioId: null,
  tagSearchString: "",
  showAutomaticTags: true,
  displayAllTags: true,
  tagSelectorSettingsOpen: false,
  selectedTagNames: [],
  tagAssignments: {},
  draggedItemKeys: [],
  metricsPanelCollapsed: false,
  modelLeftPaneCollapsed: false,
  modelRightPaneCollapsed: false,
  lastTagMutation: {
    kind: "none",
    label: "not mutated",
  },
  lastInteraction: {
    kind: "boot",
    target: "wind-tunnel",
    label: "ready",
  },
  contextMenu: {
    open: false,
    targetType: null,
    targetKey: null,
    targetLabel: "",
    x: 0,
    y: 0,
    items: [],
  },
  timeline: [],
  logs: [],
  leakedListenerCount: 0,
  memoryBlocks: [],
  lastFrameAt: 0,
  lastSampleAt: 0,
  lastLongTaskAt: 0,
  lastSurfaceRenderAt: 0,
  rafId: null,
};

const elements = {};

function byId(id) {
  return document.getElementById(id);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function labelForSourceReference(referenceId) {
  return {
    "reader-panel-reference": "Reader panel ref",
    "template-agent-validation": "Template agent",
    "template-host-baseline": "Template host",
    "template-menu-baseline": "Template menu",
    "template-performance-baseline": "Template perf",
    "template-preference-baseline": "Template prefs",
    "template-reader-baseline": "Template reader",
    "template-release-boundary": "Template release",
    "template-runtime-baseline": "Template runtime",
    "template-wasm-baseline": "Template wasm",
    "template-window-baseline": "Template window",
    "translation-context-reference": "Translation context ref",
    "translation-diagnostics-reference": "Diagnostics ref",
    "translation-export-reference": "Export ref",
    "translation-overlay-reference": "Overlay ref",
    "translation-performance-budget": "Budget ref",
    "translation-runtime-reference": "Runtime ref",
    "translation-scenario-matrix": "Scenario matrix ref",
    "zotero-client-source-contract": "Zotero client source",
    "zotero-web-library-ui": "Zotero Web Library",
    "zotero-main-pdfjs": "Zotero PDF.js",
  }[referenceId] || referenceId;
}

function labelForGapKind(gapKind) {
  return {
    covered: "covered",
    "reference-derived": "reference",
    "known-gap": "gap",
  }[gapKind] || "custom";
}

function addLog(message) {
  const now = new Date();
  state.logs.unshift({
    at: now.toLocaleTimeString("zh-CN", { hour12: false }),
    message,
  });
  state.logs = state.logs.slice(0, 28);
  renderLogs();
}

function closeContextMenu() {
  state.contextMenu = {
    open: false,
    targetType: null,
    targetKey: null,
    targetLabel: "",
    x: 0,
    y: 0,
    items: [],
  };
}

function recordHostInteraction(kind, target, label) {
  state.lastInteraction = {
    kind,
    target,
    label,
  };
  state.metrics.eventCount += 1;
  state.metrics.renderCount += 1;
  addLog(`${kind}:${target}:${label}`);
}

function setLibrarySelection({ collectionKey = state.selectedCollectionKey, itemKey = state.selectedItemKey } = {}) {
  state.selectedCollectionKey = collectionKey || null;
  state.selectedItemKey = itemKey || null;
  state.librarySelectionKeys = itemKey ? [itemKey] : [];
  state.libraryLastSelectedIndex = 0;
}

function itemKeyForSelection(item) {
  return item?.key || item?.fixtureKey || "unknown";
}

function getItemTags(item) {
  const itemKey = itemKeyForSelection(item);
  const assignedTags = state.tagAssignments[itemKey];
  return sortTagsZoteroStyle(normalizeTagArray(
    assignedTags || item?.tags,
    item?.tagSeed ?? (Number(String(itemKey).replace(/\D+/gu, "")) || 0),
  ));
}

function setItemTags(itemKey, tags) {
  state.tagAssignments[itemKey] = sortTagsZoteroStyle(dedupeTags(tags));
}

function itemHasSelectedTags(item) {
  if (state.selectedTagNames.length === 0) {
    return true;
  }
  const itemTags = new Set(getItemTags(item).map((tagData) => tagData.tag));
  return state.selectedTagNames.every((tagName) => itemTags.has(tagName));
}

function filterItemsBySelectedTags(items) {
  return state.selectedTagNames.length === 0 ? items : items.filter(itemHasSelectedTags);
}

function applyTagMutationToItems(items, tagName, action, type = 0) {
  const normalizedTag = canonicalTagName(tagName);
  if (!normalizedTag || items.length === 0) {
    return 0;
  }
  let changed = 0;
  items.forEach((item) => {
    const itemKey = itemKeyForSelection(item);
    const currentTags = getItemTags(item);
    const nextTags = action === "remove"
      ? currentTags.filter((tagData) => tagData.tag !== normalizedTag)
      : [...currentTags.filter((tagData) => tagData.tag !== normalizedTag), { tag: normalizedTag, type }];
    const sortedNextTags = sortTagsZoteroStyle(nextTags);
    if (JSON.stringify(currentTags) !== JSON.stringify(sortedNextTags)) {
      setItemTags(itemKey, sortedNextTags);
      changed += 1;
    }
  });
  return changed;
}

function toSafeDisplayText(value, fallback) {
  const fallbackText = String(fallback || "Template Item");
  const raw = String(value || "").trim();
  if (!raw) {
    return fallbackText;
  }
  const parsed = raw.includes("<") && raw.includes(">")
    ? new DOMParser().parseFromString(raw, "text/html").body.textContent || ""
    : raw;
  const text = parsed.replace(/\s+/gu, " ").trim();
  if (!text || /^https?:\/\//iu.test(text) || /\bon\w+=|javascript:/iu.test(text)) {
    return fallbackText;
  }
  return text.slice(0, 160);
}

function canonicalTagName(value) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, 96);
}

function tagColorForName(name) {
  return TAG_COLOR_BY_NAME.get(name) || null;
}

function defaultTemplateTags(seed = 0) {
  const offset = Math.abs(Number(seed) || 0);
  const manual = TEMPLATE_TAG_CATALOG[offset % 5];
  const second = TEMPLATE_TAG_CATALOG[(offset + 2) % 5];
  const automatic = TEMPLATE_TAG_CATALOG[5 + (offset % 2)];
  const extra = TEMPLATE_TAG_CATALOG[7 + (offset % 3)];
  return [manual, second, automatic, extra].map(({ tag, type }) => ({ tag, type }));
}

function dedupeTags(tags) {
  const byName = new Map();
  tags.forEach((tagData) => {
    const tag = canonicalTagName(tagData?.tag ?? tagData?.name ?? tagData);
    if (!tag) {
      return;
    }
    byName.set(tag, {
      tag,
      type: Number(tagData?.type) === 1 ? 1 : 0,
    });
  });
  return [...byName.values()];
}

function normalizeTagArray(tags, seed = 0) {
  const source = Array.isArray(tags) && tags.length > 0 ? tags : defaultTemplateTags(seed);
  return dedupeTags(source);
}

function sortTagsZoteroStyle(tags) {
  return [...tags].sort((left, right) => {
    const leftColor = tagColorForName(left.tag);
    const rightColor = tagColorForName(right.tag);
    if (leftColor || rightColor) {
      if (!leftColor) {
        return 1;
      }
      if (!rightColor) {
        return -1;
      }
      return leftColor.position - rightColor.position;
    }
    if (left.type !== right.type) {
      return left.type - right.type;
    }
    return left.tag.localeCompare(right.tag, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function normalizeFixtureItem(fixture, fallback, index) {
  return {
    ...fallback,
    key: fixture.key || `fixture-row-${index}`,
    fixtureKey: fixture.key || null,
    title: toSafeDisplayText(fixture.title, fallback.title),
    creator: toSafeDisplayText(fixture.creator, fallback.creator),
    year: fixture.year || fallback.year,
    type: fixture.itemType || fallback.type,
    iconName: fixture.iconName || fixture.itemType || fallback.type,
    collectionKeys: Array.isArray(fixture.collectionKeys) ? fixture.collectionKeys : [],
    tags: normalizeTagArray(fixture.tags || fallback.tags, index),
    tagSeed: index,
    source: "fixture",
  };
}

function getSelectedItemCount() {
  return Math.max(1, state.librarySelectionKeys.length);
}

function sortWebLibraryItems(items) {
  const { column, direction } = state.librarySort;
  const multiplier = direction === "descending" ? -1 : 1;
  return [...items].sort((left, right) => {
    const leftValue = String(left[column] ?? "");
    const rightValue = String(right[column] ?? "");
    const compared = leftValue.localeCompare(rightValue, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (compared !== 0) {
      return compared * multiplier;
    }
    return String(itemKeyForSelection(left)).localeCompare(String(itemKeyForSelection(right))) * multiplier;
  });
}

function itemTreeColumnKey(column) {
  return column.dataKey || column.key;
}

function itemTreeColumnMinWidth(column) {
  return Math.max(ITEM_TREE_COLUMN_RESIZE_MODEL.columnMinWidth, Number(column.minWidth || 0));
}

function itemTreeColumnWidth(column) {
  const key = itemTreeColumnKey(column);
  return Math.max(itemTreeColumnMinWidth(column), Math.round(Number(state.libraryColumnWidths[key] || column.width || column.minWidth || 100)));
}

function itemTreeColumnWidthSummary() {
  return LIBRARY_COLUMNS.map((column) => `${itemTreeColumnKey(column)}=${itemTreeColumnWidth(column)}px`).join(" ");
}

function itemTreeGridTemplateColumns() {
  return LIBRARY_COLUMNS.map((column) => `${itemTreeColumnWidth(column)}px`).join(" ");
}

function updateLiveItemTreeColumnStyles() {
  const template = itemTreeGridTemplateColumns();
  elements.stage?.querySelectorAll(".items-table-wrap").forEach((node) => {
    node.style.setProperty("--item-tree-columns", template);
  });
}

function setItemTreeColumnWidths(columnWidths) {
  const nextWidths = { ...state.libraryColumnWidths };
  Object.entries(columnWidths).forEach(([dataKey, width]) => {
    const column = LIBRARY_COLUMNS.find((entry) => itemTreeColumnKey(entry) === dataKey);
    if (column) {
      nextWidths[dataKey] = itemTreeColumnMinWidth(column) > width
        ? itemTreeColumnMinWidth(column)
        : Math.round(width);
    }
  });
  state.libraryColumnWidths = nextWidths;
  updateLiveItemTreeColumnStyles();
}

function getItemTreeResizeColumns(index) {
  let leftIndex = index - 1;
  let rightIndex = index;
  while (leftIndex >= 0 && LIBRARY_COLUMNS[leftIndex]?.fixedWidth) {
    leftIndex -= 1;
  }
  while (rightIndex < LIBRARY_COLUMNS.length && LIBRARY_COLUMNS[rightIndex]?.fixedWidth) {
    rightIndex += 1;
  }
  const leftColumn = LIBRARY_COLUMNS[leftIndex];
  const rightColumn = LIBRARY_COLUMNS[rightIndex];
  if (!leftColumn || !rightColumn || leftColumn.fixedWidth || rightColumn.fixedWidth) {
    return null;
  }
  return [leftColumn, rightColumn, LIBRARY_COLUMNS[index]];
}

function applyItemTreeResizeDelta(resizeState, clientX) {
  const delta = clientX - resizeState.startX;
  const leftWidth = Math.min(
    resizeState.widthSum - resizeState.rightMinWidth,
    Math.max(resizeState.leftMinWidth, resizeState.leftStartWidth + delta),
  );
  const rightWidth = resizeState.widthSum - leftWidth;
  setItemTreeColumnWidths({
    [resizeState.leftKey]: leftWidth,
    [resizeState.rightKey]: rightWidth,
  });
}

function commitItemTreeColumnResize(resizeState, source) {
  const changedWidths = {
    [resizeState.leftKey]: itemTreeColumnWidth(resizeState.leftColumn),
    [resizeState.rightKey]: itemTreeColumnWidth(resizeState.rightColumn),
  };
  const label = `${Object.entries(changedWidths).map(([key, width]) => `${key}=${width}px`).join("; ")}; storePrefs=true; ${ITEM_TREE_COLUMN_RESIZE_MODEL.commitHandler}; source=${source}`;
  state.lastItemTreeColumnResize = {
    target: `${resizeState.leftKey}|${resizeState.rightKey}`,
    label,
  };
  recordHostInteraction("itemTree.column.resize", state.lastItemTreeColumnResize.target, label);
}

function resizeItemTreeColumnPairByKeyboard(index, delta) {
  const columns = getItemTreeResizeColumns(index);
  if (!columns) {
    return;
  }
  const [leftColumn, rightColumn, resizingColumn] = columns;
  const resizeState = {
    index,
    resizingKey: itemTreeColumnKey(resizingColumn),
    leftColumn,
    rightColumn,
    leftKey: itemTreeColumnKey(leftColumn),
    rightKey: itemTreeColumnKey(rightColumn),
    startX: 0,
    leftStartWidth: itemTreeColumnWidth(leftColumn),
    rightStartWidth: itemTreeColumnWidth(rightColumn),
    leftMinWidth: itemTreeColumnMinWidth(leftColumn),
    rightMinWidth: itemTreeColumnMinWidth(rightColumn),
  };
  resizeState.widthSum = resizeState.leftStartWidth + resizeState.rightStartWidth;
  applyItemTreeResizeDelta(resizeState, delta);
  commitItemTreeColumnResize(resizeState, "keyboard");
  renderStage();
  renderMetrics();
}

function beginItemTreeColumnResize(event, index) {
  if (event.button !== 0) {
    return;
  }
  const columns = getItemTreeResizeColumns(index);
  if (!columns) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const [leftColumn, rightColumn, resizingColumn] = columns;
  const resizeState = {
    index,
    resizingKey: itemTreeColumnKey(resizingColumn),
    leftColumn,
    rightColumn,
    leftKey: itemTreeColumnKey(leftColumn),
    rightKey: itemTreeColumnKey(rightColumn),
    startX: event.clientX,
    leftStartWidth: itemTreeColumnWidth(leftColumn),
    rightStartWidth: itemTreeColumnWidth(rightColumn),
    leftMinWidth: itemTreeColumnMinWidth(leftColumn),
    rightMinWidth: itemTreeColumnMinWidth(rightColumn),
  };
  resizeState.widthSum = resizeState.leftStartWidth + resizeState.rightStartWidth;
  state.libraryColumnResize = resizeState;
  document.body.dataset.itemTreeColumnResizing = "true";

  const handlePointerMove = (moveEvent) => {
    moveEvent.preventDefault();
    applyItemTreeResizeDelta(resizeState, moveEvent.clientX);
  };
  const finishResize = (upEvent, source) => {
    upEvent?.preventDefault();
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
    document.removeEventListener("pointercancel", handlePointerCancel);
    delete document.body.dataset.itemTreeColumnResizing;
    state.libraryColumnResize = null;
    commitItemTreeColumnResize(resizeState, source);
    renderStage();
    renderMetrics();
  };
  const handlePointerUp = (upEvent) => finishResize(upEvent, "pointer");
  const handlePointerCancel = (cancelEvent) => finishResize(cancelEvent, "pointercancel");

  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerup", handlePointerUp);
  document.addEventListener("pointercancel", handlePointerCancel);
}

function focusLibraryItem(itemKey) {
  requestAnimationFrame(() => {
    const escaped = String(itemKey).replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
    const row = elements.stage?.querySelector(`.zotero-table-row[data-key="${escaped}"]`);
    row?.focus();
  });
}

function focusLibraryCollection(collectionKey) {
  requestAnimationFrame(() => {
    const escaped = String(collectionKey).replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
    const row = elements.stage?.querySelector(`.zotero-tree-row[data-key="${escaped}"]`);
    row?.focus();
  });
}

function getModel() {
  return buildWindTunnelModel({
    scenarioId: state.scenarioId,
    presetId: state.presetId,
    overrides: state.controls,
  });
}

function setControlsFromModel() {
  state.controls = { ...getModel().controls };
}

async function loadPdfJsHarnessStatus() {
  try {
    const response = await fetch(DOCUMENT_ANALYSIS_HARNESS.statusEndpoint, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const payload = await response.json();
    state.pdfJsHarness = {
      available: Boolean(payload.available),
      adapterMode: String(payload.adapterMode || DOCUMENT_ANALYSIS_HARNESS.fallbackMode),
      requiredAssets: Array.isArray(payload.requiredAssets) ? payload.requiredAssets : [],
      viewerURL: String(payload.viewerURL || DOCUMENT_ANALYSIS_HARNESS.preferredViewerURL),
      samplePDFURL: String(payload.samplePDFURL || DOCUMENT_ANALYSIS_HARNESS.samplePDFEndpoint),
      samplePDFMode: String(payload.samplePDFMode || "synthetic-fixture"),
      samplePDFLabel: String(payload.samplePDFLabel || "synthetic-zotero-pdfjs-wind-tunnel.pdf"),
      samplePDFBytes: Number(payload.samplePDFBytes || 0),
      details: String(payload.details || ""),
      root: payload.root || null,
    };
  } catch (error) {
    state.pdfJsHarness = {
      available: false,
      adapterMode: "status-unavailable",
      requiredAssets: DOCUMENT_ANALYSIS_HARNESS.requiredAssets.map((asset) => ({ asset, exists: false })),
      viewerURL: DOCUMENT_ANALYSIS_HARNESS.preferredViewerURL,
      samplePDFURL: DOCUMENT_ANALYSIS_HARNESS.samplePDFEndpoint,
      samplePDFMode: "status-unavailable",
      samplePDFLabel: "sample PDF unavailable",
      samplePDFBytes: 0,
      details: error instanceof Error ? error.message : String(error),
    };
  }
  renderStage();
  renderMetrics();
  addLog(`pdfjs.harness=${state.pdfJsHarness.adapterMode}`);
}

async function loadReaderSourceHarnessStatus() {
  try {
    const response = await fetch(READER_SOURCE_HARNESS.statusEndpoint, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const payload = await response.json();
    state.readerSourceHarness = {
      available: Boolean(payload.available),
      adapterMode: String(payload.adapterMode || READER_SOURCE_HARNESS.fallbackMode),
      requiredAnchors: Array.isArray(payload.requiredAnchors) ? payload.requiredAnchors : [],
      adaptationPolicy: String(payload.adaptationPolicy || READER_SOURCE_HARNESS.adaptationPolicy),
      details: String(payload.details || ""),
      root: payload.root || null,
    };
  } catch (error) {
    state.readerSourceHarness = {
      available: false,
      adapterMode: "status-unavailable",
      requiredAnchors: READER_SOURCE_HARNESS.requiredAnchors.map((anchor) => ({
        id: anchor.id,
        file: anchor.file,
        exists: false,
        signals: anchor.signals.map((signal) => ({ signal, exists: false })),
      })),
      adaptationPolicy: READER_SOURCE_HARNESS.adaptationPolicy,
      details: error instanceof Error ? error.message : String(error),
    };
  }
  renderStage();
  renderMetrics();
  addLog(`reader-source.harness=${state.readerSourceHarness.adapterMode}`);
}

async function loadWebLibraryHarnessStatus() {
  try {
    const response = await fetch(WEB_LIBRARY_UI_HARNESS.statusEndpoint, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const payload = await response.json();
    state.webLibraryHarness = {
      available: Boolean(payload.available),
      adapterMode: String(payload.adapterMode || WEB_LIBRARY_UI_HARNESS.fallbackMode),
      requiredAnchors: Array.isArray(payload.requiredAnchors) ? payload.requiredAnchors : [],
      iconBaseURL: String(payload.iconBaseURL || WEB_LIBRARY_UI_HARNESS.iconBaseURL),
      adaptationPolicy: String(payload.adaptationPolicy || WEB_LIBRARY_UI_HARNESS.adaptationPolicy),
      details: String(payload.details || ""),
      root: payload.root || null,
    };
  } catch (error) {
    state.webLibraryHarness = {
      available: false,
      adapterMode: "status-unavailable",
      requiredAnchors: WEB_LIBRARY_UI_HARNESS.requiredAnchors.map((anchor) => ({
        id: anchor.id,
        file: anchor.file,
        exists: false,
        signals: anchor.signals.map((signal) => ({ signal, exists: false })),
      })),
      iconBaseURL: WEB_LIBRARY_UI_HARNESS.iconBaseURL,
      adaptationPolicy: WEB_LIBRARY_UI_HARNESS.adaptationPolicy,
      details: error instanceof Error ? error.message : String(error),
    };
  }
  renderStage();
  renderMetrics();
  addLog(`web-library.harness=${state.webLibraryHarness.adapterMode}`);
}

async function loadWebLibraryFixtureStatus() {
  try {
    const response = await fetch("/zotero-web-library/fixture.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const payload = await response.json();
    state.webLibraryFixture = {
      available: Boolean(payload.available),
      fixtureMode: String(payload.fixtureMode || "contract-fallback"),
      collections: Array.isArray(payload.collections) ? payload.collections : [],
      items: Array.isArray(payload.items) ? payload.items : [],
      reader: payload.reader || null,
      details: String(payload.details || ""),
      root: payload.root || null,
    };
  } catch (error) {
    state.webLibraryFixture = {
      available: false,
      fixtureMode: "status-unavailable",
      collections: [],
      items: [],
      reader: null,
      details: error instanceof Error ? error.message : String(error),
    };
  }
  renderStage();
  renderMetrics();
  addLog(`web-library.fixture=${state.webLibraryFixture.fixtureMode}`);
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function getVisibleScenarios() {
  return listScenariosForModule(state.moduleId);
}

function ensureScenarioInCurrentModule() {
  const scenarios = getVisibleScenarios();
  if (scenarios.some((scenario) => scenario.id === state.scenarioId)) {
    return;
  }
  state.scenarioId = scenarios[0]?.id || SCENARIOS[0].id;
}

function populateModuleButtons() {
  elements.moduleList.textContent = "";
  const modules = [
    {
      id: "all",
      label: "全部",
      summary: "显示所有模板风洞场景。",
      scenarioCount: SCENARIOS.length,
    },
    ...SCENARIO_MODULES.map((module) => ({
      ...module,
      scenarioCount: listScenariosForModule(module.id).length,
    })),
  ];
  modules.forEach((module) => {
    const button = document.createElement("button");
    button.className = "wind-module-button";
    button.type = "button";
    button.dataset.active = String(module.id === state.moduleId);
    button.dataset.moduleId = module.id;
    button.title = module.summary;
    const label = document.createElement("span");
    label.textContent = module.label;
    const count = document.createElement("strong");
    count.textContent = String(module.scenarioCount);
    button.appendChild(label);
    button.appendChild(count);
    button.addEventListener("click", () => {
      state.moduleId = module.id;
      ensureScenarioInCurrentModule();
      setControlsFromModel();
      populateSelectors();
      renderSliders();
      resetSimulation();
      queueFullRender(`module=${state.moduleId}`);
    });
    elements.moduleList.appendChild(button);
  });
}

function populateSelectors() {
  ensureScenarioInCurrentModule();
  populateModuleButtons();
  elements.scenario.textContent = "";
  getVisibleScenarios().forEach((scenario) => {
    elements.scenario.appendChild(createOption(scenario.id, scenario.label));
  });
  elements.preset.textContent = "";
  BOTTLENECK_PRESETS.forEach((preset) => {
    elements.preset.appendChild(createOption(preset.id, preset.label));
  });
  elements.scenario.value = state.scenarioId;
  elements.preset.value = state.presetId;
}

function renderScenarioCards(model) {
  elements.scenarioCards.textContent = "";
  getVisibleScenarios().forEach((scenario) => {
    const card = document.createElement("button");
    card.className = "wind-scenario-card";
    card.type = "button";
    card.dataset.selected = String(scenario.id === model.scenario.id);
    const top = document.createElement("span");
    top.className = "wind-scenario-card-top";
    const title = document.createElement("strong");
    title.textContent = scenario.label;
    const gap = document.createElement("span");
    gap.textContent = labelForGapKind(scenario.gapKind);
    gap.dataset.gapKind = scenario.gapKind || "custom";
    top.appendChild(title);
    top.appendChild(gap);
    const summary = document.createElement("span");
    summary.className = "wind-scenario-card-summary";
    summary.textContent = scenario.summary;
    card.appendChild(top);
    card.appendChild(summary);
    card.addEventListener("click", () => {
      state.scenarioId = scenario.id;
      elements.scenario.value = scenario.id;
      setControlsFromModel();
      renderSliders();
      resetSimulation();
      queueFullRender(`scenario=${state.scenarioId}`);
    });
    elements.scenarioCards.appendChild(card);
  });
}

function renderSurfaceList(model) {
  elements.surfaceList.textContent = "";
  model.hostSurfaces.forEach((surface) => {
    const node = document.createElement("span");
    node.className = "wind-surface-chip";
    node.textContent = surface;
    elements.surfaceList.appendChild(node);
  });
}

function renderScenarioMetadata(model) {
  elements.moduleSummary.textContent = model.scenarioModule?.summary || "全部模板场景按模块分组，可快速切换覆盖域。";
  elements.coverageTags.textContent = "";
  (model.scenario.coverageTags || []).forEach((tag) => {
    const node = document.createElement("span");
    node.className = "wind-tag-chip";
    node.textContent = tag;
    elements.coverageTags.appendChild(node);
  });
  elements.referenceList.textContent = "";
  (model.scenario.sourceReferences || []).forEach((referenceId) => {
    const node = document.createElement("span");
    node.className = "wind-reference-chip";
    node.textContent = labelForSourceReference(referenceId);
    elements.referenceList.appendChild(node);
  });
}

function renderCoverageMap() {
  const coverage = summarizeScenarioCoverage();
  elements.coverageCount.textContent = `${coverage.moduleCount}/${coverage.scenarioCount}`;
  elements.coverageMap.textContent = "";
  coverage.modules.forEach((module) => {
    const row = document.createElement("button");
    row.className = "wind-coverage-row";
    row.type = "button";
    row.dataset.active = String(module.id === state.moduleId);
    const left = document.createElement("span");
    left.textContent = module.label;
    const right = document.createElement("strong");
    right.textContent = `${module.scenarioCount} scenes`;
    const tags = document.createElement("em");
    tags.textContent = module.gapKinds.join(" / ");
    row.appendChild(left);
    row.appendChild(right);
    row.appendChild(tags);
    row.addEventListener("click", () => {
      state.moduleId = module.id;
      state.scenarioId = module.defaultScenarioId;
      setControlsFromModel();
      populateSelectors();
      renderSliders();
      resetSimulation();
      queueFullRender(`coverage.module=${state.moduleId}`);
    });
    elements.coverageMap.appendChild(row);
  });
}

function renderSliders() {
  elements.sliders.textContent = "";
  CONTROL_DEFS.forEach((definition) => {
    const wrapper = document.createElement("label");
    wrapper.className = "wind-slider";

    const label = document.createElement("span");
    label.className = "wind-slider-label";
    const name = document.createElement("span");
    name.textContent = definition.label;
    const value = document.createElement("strong");
    value.textContent = formatNumber(state.controls[definition.key]);
    label.appendChild(name);
    label.appendChild(value);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(definition.min);
    input.max = String(definition.max);
    input.step = String(definition.step);
    input.value = String(state.controls[definition.key] ?? 0);
    input.addEventListener("input", () => {
      state.controls[definition.key] = Number(input.value);
      value.textContent = formatNumber(input.value);
      queueFullRender(`pressure.${definition.key}=${input.value}`);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    elements.sliders.appendChild(wrapper);
  });
}

function severityForPressure(value) {
  if (value >= 82) {
    return "critical";
  }
  if (value >= 58) {
    return "high";
  }
  if (value >= 34) {
    return "medium";
  }
  return "low";
}

function renderMetrics() {
  const model = getModel();
  elements.routeBadge.textContent = model.scenario.route;
  elements.scoreLabel.textContent = String(model.estimate.score);
  elements.severityLabel.textContent = model.estimate.severity;
  elements.sampleCount.textContent = String(state.timeline.length);

  const metricRows = [
    ["FPS", state.metrics.fps],
    ["Long Tasks", state.metrics.longTasks],
    ["Events", state.metrics.eventCount],
    ["Renders", state.metrics.renderCount],
    ["DOM Nodes", state.metrics.nodeCount],
    ["Heap MB", state.metrics.heapMB],
  ];
  elements.metricGrid.textContent = "";
  metricRows.forEach(([label, value]) => {
    const node = document.createElement("div");
    node.className = "wind-metric";
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const valueNode = document.createElement("strong");
    valueNode.textContent = formatNumber(value);
    node.appendChild(labelNode);
    node.appendChild(valueNode);
    elements.metricGrid.appendChild(node);
  });

  elements.hotZones.textContent = "";
  model.hotZones.forEach((zone) => {
    const node = document.createElement("div");
    node.className = "wind-hot-zone";
    node.dataset.severity = zone.severity;
    const top = document.createElement("div");
    top.className = "wind-hot-zone-top";
    const label = document.createElement("span");
    label.textContent = zone.label;
    const value = document.createElement("strong");
    value.textContent = String(zone.value);
    top.appendChild(label);
    top.appendChild(value);
    const meter = document.createElement("div");
    meter.className = "wind-hot-zone-meter";
    const fill = document.createElement("span");
    fill.style.setProperty("--zone-width", `${Math.min(100, zone.value)}%`);
    meter.appendChild(fill);
    node.appendChild(top);
    node.appendChild(meter);
    elements.hotZones.appendChild(node);
  });
  elements.hotZoneCount.textContent = String(model.hotZones.length);

  renderCoverageMap();
  renderTimeline();
}

function renderTimeline() {
  elements.timeline.textContent = "";
  const samples = state.timeline.slice(-48);
  samples.forEach((sample) => {
    const bar = document.createElement("span");
    bar.className = "wind-timeline-bar";
    bar.dataset.severity = severityForPressure(sample.pressure);
    bar.title = `${sample.at} pressure=${sample.pressure} fps=${sample.fps}`;
    bar.style.height = `${Math.max(6, sample.pressure)}%`;
    elements.timeline.appendChild(bar);
  });
}

function renderLogs() {
  elements.log.textContent = "";
  state.logs.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "wind-log-row";
    const time = document.createElement("time");
    time.textContent = entry.at;
    const message = document.createElement("span");
    message.textContent = entry.message;
    row.appendChild(time);
    row.appendChild(message);
    elements.log.appendChild(row);
  });
}

function renderShellChrome() {
  if (elements.grid) {
    elements.grid.dataset.metricsCollapsed = String(state.metricsPanelCollapsed);
  }
  if (elements.metricsPanel) {
    elements.metricsPanel.dataset.collapsed = String(state.metricsPanelCollapsed);
  }
  if (elements.toggleMetrics) {
    elements.toggleMetrics.textContent = state.metricsPanelCollapsed ? "<" : ">";
    elements.toggleMetrics.setAttribute("aria-pressed", String(state.metricsPanelCollapsed));
    elements.toggleMetrics.title = state.metricsPanelCollapsed ? "Expand data panel" : "Collapse data panel";
  }
}

function paneToggleState(side) {
  return side === "left" ? state.modelLeftPaneCollapsed : state.modelRightPaneCollapsed;
}

function setPaneToggleState(side, collapsed) {
  if (side === "left") {
    state.modelLeftPaneCollapsed = collapsed;
  } else {
    state.modelRightPaneCollapsed = collapsed;
  }
}

function createModelPaneToggleButton(side) {
  const collapsed = paneToggleState(side);
  const button = document.createElement("button");
  button.className = "zotero-tool-button pane-toggle-button";
  button.type = "button";
  button.dataset.side = side;
  button.dataset.collapsed = String(collapsed);
  button.textContent = side === "left"
    ? (collapsed ? ">" : "<")
    : (collapsed ? "<" : ">");
  button.title = `${collapsed ? "Expand" : "Collapse"} ${side} pane`;
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-pressed", String(collapsed));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setPaneToggleState(side, !paneToggleState(side));
    recordHostInteraction("zoteroPane.toggle", side, paneToggleState(side) ? "collapsed" : "expanded");
    renderStage();
    renderMetrics();
  });
  return button;
}

function createPaneCollapseRail(side, label) {
  const rail = document.createElement("div");
  rail.className = "pane-collapse-rail";
  rail.dataset.side = side;
  const button = createModelPaneToggleButton(side);
  button.classList.add("pane-rail-toggle");
  const caption = document.createElement("span");
  caption.textContent = label;
  rail.appendChild(button);
  rail.appendChild(caption);
  return rail;
}

function createToolbar(model) {
  const toolbar = document.createElement("div");
  toolbar.className = "zotero-toolbar";
  const left = document.createElement("div");
  left.className = "zotero-toolbar-group";
  left.appendChild(createModelPaneToggleButton("left"));
  ["New Item", "Add Note", "Sync"].forEach((label) => {
    const button = document.createElement("button");
    button.className = "zotero-tool-button";
    button.type = "button";
    button.textContent = label;
    left.appendChild(button);
  });
  const right = document.createElement("div");
  right.className = "zotero-toolbar-group";
  right.appendChild(createModelPaneToggleButton("right"));
  const badge = document.createElement("span");
  badge.className = "wind-badge";
  badge.textContent = `${model.scenario.route}:${model.preset.id}`;
  right.appendChild(badge);
  toolbar.appendChild(left);
  toolbar.appendChild(right);
  return toolbar;
}

function webLibraryAnchorPassed(anchor) {
  return Boolean(anchor.exists && Array.isArray(anchor.signals) && anchor.signals.every((signal) => signal.exists));
}

function readerSourceAnchorPassed(anchor) {
  return Boolean(anchor.exists && Array.isArray(anchor.signals) && anchor.signals.every((signal) => signal.exists));
}

function countWebLibraryAnchors() {
  const anchors = state.webLibraryHarness.requiredAnchors || [];
  return {
    passed: anchors.filter(webLibraryAnchorPassed).length,
    total: anchors.length || WEB_LIBRARY_UI_HARNESS.requiredAnchors.length,
  };
}

function countReaderSourceAnchors() {
  const anchors = state.readerSourceHarness.requiredAnchors || [];
  return {
    passed: anchors.filter(readerSourceAnchorPassed).length,
    total: anchors.length || READER_SOURCE_HARNESS.requiredAnchors.length,
  };
}

function createWebLibraryIcon(iconName = "journal-article") {
  if (!state.webLibraryHarness.available) {
    return null;
  }
  const image = document.createElement("img");
  image.className = "web-library-item-icon";
  image.alt = "";
  image.src = `${state.webLibraryHarness.iconBaseURL}/16/item-type/${iconName}@1x.svg`;
  image.decoding = "async";
  return image;
}

function getWebLibraryCollectionRows(model) {
  const fixtureCollections = state.webLibraryFixture.available ? state.webLibraryFixture.collections : [];
  if (fixtureCollections.length > 0) {
    return fixtureCollections.slice(0, 7).map((collection, index) => ({
      key: collection.key || `fixture-collection-${index}`,
      label: collection.title || `Collection ${index + 1}`,
      count: Number.isFinite(collection.itemCount)
        ? collection.itemCount
        : Math.max(8, Math.round(model.controls.itemCount / (index + 2))),
    }));
  }
  return ["My Library", "Large Corpus", "Performance Samples", "Reader Fixtures", "Unfiled Items"].map((label, index) => ({
    key: `template-${index + 1}`,
    label,
    count: Math.max(8, Math.round(model.controls.itemCount / (index + 2))),
  }));
}

function getWebLibraryDisplayItems(model) {
  const renderLimit = Math.max(80, Math.round(model.controls.domInflation / 10));
  const syntheticItems = createSyntheticItems(model.controls.itemCount, {
    renderLimit,
    selectionSize: model.controls.selectionSize,
    route: model.scenario.route,
  });
  const fixtureItems = state.webLibraryFixture.available ? state.webLibraryFixture.items : [];
  if (fixtureItems.length === 0) {
    return syntheticItems.map((item, index) => ({
      ...item,
      iconName: item.type,
      collectionKeys: [],
      tags: normalizeTagArray(item.tags, index),
      tagSeed: index,
    }));
  }
  const filteredFixtureItems = state.selectedCollectionKey
    ? fixtureItems.filter((item) => Array.isArray(item.collectionKeys) && item.collectionKeys.includes(state.selectedCollectionKey))
    : fixtureItems;
  const directFixtureRows = filteredFixtureItems.slice(0, renderLimit).map((fixture, index) => (
    normalizeFixtureItem(fixture, syntheticItems[index % syntheticItems.length], index)
  ));
  const pressureRowsNeeded = Math.max(0, renderLimit - directFixtureRows.length);
  const fixturePool = fixtureItems.length > 0 ? fixtureItems : filteredFixtureItems;
  const pressureRows = syntheticItems.slice(0, pressureRowsNeeded).map((item, index) => {
    const fixture = fixturePool[(index + directFixtureRows.length) % fixturePool.length];
    const hasFixtureVariety = fixturePool.length > 1;
    const fixtureTitle = hasFixtureVariety ? toSafeDisplayText(fixture?.title, "") : "";
    const titleSuffix = fixtureTitle ? ` · ${fixtureTitle}` : "";
    return {
      ...item,
      key: `pressure-${item.key}`,
      fixtureKey: fixture.key,
      title: `${item.title}${titleSuffix}`,
      creator: toSafeDisplayText(fixture.creator, item.creator),
      year: fixture.year || item.year,
      type: fixture.itemType || item.type,
      iconName: fixture.iconName || fixture.itemType || item.type,
      collectionKeys: Array.isArray(fixture.collectionKeys) ? fixture.collectionKeys : [],
      tags: normalizeTagArray(fixture.tags || item.tags, index + directFixtureRows.length),
      tagSeed: index + directFixtureRows.length,
      source: "pressure",
    };
  });
  return [...directFixtureRows, ...pressureRows].slice(0, renderLimit);
}

function ensureLibraryInteractionSelection(model) {
  const collections = getWebLibraryCollectionRows(model);
  if (!state.selectedCollectionKey && collections[0]) {
    state.selectedCollectionKey = collections[0].key;
  }
  const baseItems = sortWebLibraryItems(getWebLibraryDisplayItems(model));
  const items = filterItemsBySelectedTags(baseItems);
  const visibleKeys = new Set(items.map(itemKeyForSelection));
  state.librarySelectionKeys = state.librarySelectionKeys.filter((key) => visibleKeys.has(key));
  const selectedStillVisible = visibleKeys.has(state.selectedItemKey);
  if (!selectedStillVisible && items[0]) {
    state.selectedItemKey = itemKeyForSelection(items[0]);
  } else if (!items[0]) {
    state.selectedItemKey = null;
  }
  if (state.librarySelectionKeys.length === 0 && state.selectedItemKey) {
    state.librarySelectionKeys = [state.selectedItemKey];
  }
  const selectedItem = items.find((item) => itemKeyForSelection(item) === state.selectedItemKey) || items[0] || null;
  return {
    collections,
    baseItems,
    items,
    selectedItem,
    selectedItems: items.filter((item) => state.librarySelectionKeys.includes(itemKeyForSelection(item))),
  };
}

function getWindContextMenuItems(targetType) {
  if (targetType === "collection") {
    return ["Open Collection", "New Subcollection", "Rename Collection", "Export Collection"];
  }
  const selectedCount = getSelectedItemCount();
  return selectedCount > 1
    ? ["Open in Reader", "Create Bibliography", "Add Note", "Merge Items", "Export Items"]
    : ["Open in Reader", "Show in Collection", "Add Note", "Create Bibliography"];
}

function openWindContextMenu(event, targetType, targetKey, targetLabel) {
  event.preventDefault();
  event.stopPropagation();
  const items = getWindContextMenuItems(targetType);
  state.contextMenu = {
    open: true,
    targetType,
    targetKey,
    targetLabel,
    x: Math.min(window.innerWidth - 220, Math.max(12, event.clientX)),
    y: Math.min(window.innerHeight - 170, Math.max(12, event.clientY)),
    items,
  };
  const eventKind = targetType === "item" ? "item.contextmenu" : "collection.contextmenu";
  recordHostInteraction(eventKind, targetKey, targetLabel);
  recordHostInteraction("menu.popupshowing", `${targetType}:${targetKey}`, `${items.length} menu items`);
  recordHostInteraction("menu.dynamic.rebuild", `${targetType}:${targetKey}`, `selection=${getSelectedItemCount()}`);
  renderStage();
  renderMetrics();
}

function appendWindContextMenu(parent) {
  if (!state.contextMenu.open) {
    return;
  }
  const menu = document.createElement("div");
  menu.className = "wind-context-menu";
  menu.setAttribute("role", "menu");
  menu.dataset.targetType = state.contextMenu.targetType || "";
  menu.style.left = `${state.contextMenu.x}px`;
  menu.style.top = `${state.contextMenu.y}px`;

  const title = document.createElement("div");
  title.className = "wind-context-menu-title";
  title.textContent = state.contextMenu.targetLabel || "Zotero MenuManager target";
  menu.appendChild(title);

  state.contextMenu.items.forEach((label, index) => {
    const item = document.createElement("button");
    item.className = "wind-context-menu-item";
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.dataset.menuIndex = String(index);
    item.textContent = label;
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      recordHostInteraction("menu.item.click", state.contextMenu.targetKey || "unknown", label);
      closeContextMenu();
      renderStage();
      renderMetrics();
    });
    menu.appendChild(item);
  });
  parent.appendChild(menu);
}

function selectLibraryItemFromEvent(items, itemKey, index, label, event) {
  let eventKind = "item.click";
  if (event.shiftKey && Number.isFinite(state.libraryLastSelectedIndex)) {
    const start = Math.max(0, Math.min(state.libraryLastSelectedIndex, index));
    const end = Math.min(items.length - 1, Math.max(state.libraryLastSelectedIndex, index));
    state.librarySelectionKeys = items.slice(start, end + 1).map(itemKeyForSelection);
    eventKind = "item.shift.click";
  } else if (event.metaKey || event.ctrlKey) {
    const current = new Set(state.librarySelectionKeys);
    if (current.has(itemKey) && current.size > 1) {
      current.delete(itemKey);
    } else {
      current.add(itemKey);
    }
    state.librarySelectionKeys = [...current];
    eventKind = "item.meta.click";
  } else {
    state.librarySelectionKeys = [itemKey];
  }
  state.selectedItemKey = itemKey;
  state.libraryLastSelectedIndex = index;
  recordHostInteraction(eventKind, itemKey, `${label}; selected=${state.librarySelectionKeys.length}`);
}

function navigateLibraryItem(items, index, delta, eventLabel) {
  const nextIndex = Math.min(items.length - 1, Math.max(0, index + delta));
  const nextItem = items[nextIndex];
  if (!nextItem) {
    return;
  }
  const nextKey = itemKeyForSelection(nextItem);
  state.selectedItemKey = nextKey;
  state.librarySelectionKeys = [nextKey];
  state.libraryLastSelectedIndex = nextIndex;
  recordHostInteraction("item.keyboard.navigate", nextKey, eventLabel);
  renderStage();
  renderMetrics();
  focusLibraryItem(nextKey);
}

function selectLibraryCollection(collections, index, eventKind) {
  const collection = collections[index];
  if (!collection) {
    return;
  }
  state.selectedCollectionKey = collection.key;
  state.selectedItemKey = null;
  state.librarySelectionKeys = [];
  state.libraryLastSelectedIndex = 0;
  closeContextMenu();
  recordHostInteraction(eventKind, collection.key, collection.label);
  renderStage();
  renderMetrics();
  focusLibraryCollection(collection.key);
}

function focusTagSelectorTag(tagName) {
  requestAnimationFrame(() => {
    const escaped = String(tagName).replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
    const row = elements.stage?.querySelector(`.tag-selector-item[data-tag="${escaped}"]`);
    row?.focus();
  });
}

function focusTagSelectorSearch() {
  requestAnimationFrame(() => {
    const input = elements.stage?.querySelector(".tag-selector-filter");
    input?.focus();
    input?.setSelectionRange?.(input.value.length, input.value.length);
  });
}

function getTagSelectorRows(baseItems) {
  const scopeCounts = new Map();
  const tagTypes = new Map();
  baseItems.forEach((item) => {
    getItemTags(item).forEach((tagData) => {
      if (!state.showAutomaticTags && tagData.type === 1) {
        return;
      }
      scopeCounts.set(tagData.tag, (scopeCounts.get(tagData.tag) || 0) + 1);
      tagTypes.set(tagData.tag, tagData.type);
    });
  });

  const rowsByName = new Map();
  scopeCounts.forEach((count, tag) => {
    const color = tagColorForName(tag);
    rowsByName.set(tag, {
      name: tag,
      count,
      type: tagTypes.get(tag) || 0,
      color: color?.color || null,
      position: color?.position ?? Number.POSITIVE_INFINITY,
      disabled: false,
      selected: state.selectedTagNames.includes(tag),
    });
  });

  if (state.displayAllTags) {
    TAG_COLOR_BY_NAME.forEach((colorData, tag) => {
      if (!rowsByName.has(tag) && (state.showAutomaticTags || (tagTypes.get(tag) || 0) !== 1)) {
        rowsByName.set(tag, {
          name: tag,
          count: 0,
          type: tagTypes.get(tag) || 0,
          color: colorData.color,
          position: colorData.position,
          disabled: true,
          selected: state.selectedTagNames.includes(tag),
        });
      }
    });
  }

  const searchString = state.tagSearchString.trim().toLowerCase();
  return [...rowsByName.values()]
    .filter((row) => !searchString || row.name.toLowerCase().includes(searchString))
    .sort((left, right) => {
      if (left.color || right.color) {
        if (!left.color) {
          return 1;
        }
        if (!right.color) {
          return -1;
        }
        return left.position - right.position;
      }
      if (left.type !== right.type) {
        return left.type - right.type;
      }
      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
}

function toggleTagSelection(tagName, baseItems) {
  const selectedTags = new Set(state.selectedTagNames);
  if (selectedTags.has(tagName)) {
    selectedTags.delete(tagName);
  } else {
    selectedTags.add(tagName);
  }
  state.selectedTagNames = [...selectedTags];
  closeContextMenu();
  const visibleCount = filterItemsBySelectedTags(baseItems).length;
  const label = state.selectedTagNames.length > 0 ? state.selectedTagNames.join(", ") : "clear";
  recordHostInteraction("tagSelector.tag.click", tagName, `selected=${state.selectedTagNames.includes(tagName)}`);
  recordHostInteraction("collectionTreeRow.setTags", "Tag Selector", label);
  recordHostInteraction("itemTree.tag.filter", "Item Tree", `${formatNumber(visibleCount)} rows`);
  renderStage();
  renderMetrics();
  focusTagSelectorTag(tagName);
}

function applyTagDrop(tagName, baseItems, remove) {
  const draggedKeys = state.draggedItemKeys.length > 0 ? state.draggedItemKeys : state.librarySelectionKeys;
  const itemMap = new Map(baseItems.map((item) => [itemKeyForSelection(item), item]));
  const targetItems = draggedKeys.map((key) => itemMap.get(key)).filter(Boolean);
  const changed = applyTagMutationToItems(targetItems, tagName, remove ? "remove" : "add", 0);
  state.lastTagMutation = {
    kind: remove ? "drop.remove" : "drop.add",
    label: `${tagName}; items=${changed}`,
  };
  recordHostInteraction(remove ? "tagSelector.drop.removeTag" : "tagSelector.drop.addTag", tagName, `${formatNumber(changed)} items`);
  recordHostInteraction(remove ? "item.removeTag" : "item.addTag", tagName, `${formatNumber(changed)} items`);
  recordHostInteraction("item.saveTx", tagName, "tag drag-drop transaction");
  state.draggedItemKeys = [];
  renderStage();
  renderMetrics();
  focusTagSelectorTag(tagName);
}

function renderTagSelector(sidebar, baseItems) {
  const container = document.createElement("section");
  container.id = "zotero-tag-selector-container";
  container.className = "zotero-tag-selector-container";
  container.dataset.showAutomaticTags = String(state.showAutomaticTags);
  container.dataset.displayAllTags = String(state.displayAllTags);
  const label = document.createElement("p");
  label.className = "zotero-pane-title";
  label.textContent = "Tag Selector";
  container.appendChild(label);

  const selector = document.createElement("div");
  selector.id = "zotero-tag-selector";
  selector.className = "tag-selector";
  selector.setAttribute("label", "Tag Selector");

  const listContainer = document.createElement("div");
  listContainer.className = "tag-selector-list-container";
  const list = document.createElement("div");
  list.className = "tag-selector-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Tag Selector");
  const rows = getTagSelectorRows(baseItems);
  if (rows.length === 0) {
    const message = document.createElement("div");
    message.className = "tag-selector-message";
    message.textContent = "No tags match";
    list.appendChild(message);
  }
  rows.forEach((tagRow, index) => {
    const row = document.createElement("div");
    row.className = "tag-selector-item keyboard-clickable";
    if (tagRow.selected) {
      row.classList.add("selected");
    }
    if (tagRow.color) {
      row.classList.add("colored");
      row.dataset.color = tagRow.color;
      row.style.setProperty("--tag-color", tagRow.color);
    }
    if (tagRow.disabled) {
      row.classList.add("disabled");
    }
    row.dataset.tag = tagRow.name;
    row.dataset.count = String(tagRow.count);
    row.dataset.type = String(tagRow.type);
    row.setAttribute("role", "checkbox");
    row.setAttribute("aria-checked", String(tagRow.selected));
    row.setAttribute("aria-disabled", String(tagRow.disabled));
    row.setAttribute("tabindex", "0");
    row.draggable = !tagRow.disabled;
    const name = document.createElement("span");
    name.className = "tag-selector-name";
    name.textContent = tagRow.name;
    const count = document.createElement("strong");
    count.textContent = formatNumber(tagRow.count);
    row.appendChild(name);
    row.appendChild(count);
    row.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!tagRow.disabled) {
        toggleTagSelection(tagRow.name, baseItems);
      }
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!tagRow.disabled) {
          toggleTagSelection(tagRow.name, baseItems);
        }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        list.querySelectorAll(".tag-selector-item")[Math.min(rows.length - 1, index + 1)]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        list.querySelectorAll(".tag-selector-item")[Math.max(0, index - 1)]?.focus();
      }
    });
    row.addEventListener("dragover", (event) => {
      const dragTypes = Array.from(event.dataTransfer?.types || []);
      if (state.draggedItemKeys.length > 0 || dragTypes.includes("zotero/item")) {
        event.preventDefault();
        row.classList.add("dragged-over");
        event.dataTransfer.dropEffect = event.metaKey || event.shiftKey ? "move" : "copy";
      }
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("dragged-over");
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      row.classList.remove("dragged-over");
      const remove = event.metaKey || event.shiftKey;
      applyTagDrop(tagRow.name, baseItems, remove);
    });
    list.appendChild(row);
  });
  const applyTagSelectorFilterToDOM = () => {
    const searchString = state.tagSearchString.trim().toLowerCase();
    list.querySelectorAll(".tag-selector-item").forEach((row) => {
      row.hidden = Boolean(searchString && !String(row.dataset.tag || "").toLowerCase().includes(searchString));
    });
  };
  applyTagSelectorFilterToDOM();
  listContainer.appendChild(list);
  selector.appendChild(listContainer);

  const filterPane = document.createElement("div");
  filterPane.className = "tag-selector-filter-pane";
  const filterContainer = document.createElement("div");
  filterContainer.className = "tag-selector-filter-container";
  const input = document.createElement("input");
  input.className = "tag-selector-filter";
  input.type = "search";
  input.placeholder = "Tags";
  input.value = state.tagSearchString;
  input.addEventListener("input", (event) => {
    state.tagSearchString = event.target.value;
    recordHostInteraction("tagSelector.search", "Tag Selector", state.tagSearchString || "clear");
    renderMetrics();
    applyTagSelectorFilterToDOM();
  });
  const actions = document.createElement("button");
  actions.className = "tag-selector-actions";
  actions.type = "button";
  actions.setAttribute("aria-haspopup", "menu");
  actions.setAttribute("aria-expanded", String(state.tagSelectorSettingsOpen));
  actions.textContent = "View";
  actions.addEventListener("click", (event) => {
    event.stopPropagation();
    state.tagSelectorSettingsOpen = !state.tagSelectorSettingsOpen;
    recordHostInteraction("tagSelector.settings.click", "Tag Selector", state.tagSelectorSettingsOpen ? "open" : "close");
    renderStage();
    renderMetrics();
  });
  filterContainer.appendChild(input);
  filterContainer.appendChild(actions);
  filterPane.appendChild(filterContainer);
  if (state.tagSelectorSettingsOpen) {
    const menu = document.createElement("div");
    menu.className = "tag-selector-settings-menu";
    menu.setAttribute("role", "menu");
    [
      ["showAutomaticTags", "Show Automatic Tags"],
      ["displayAllTags", "Display All Tags"],
    ].forEach(([key, text]) => {
      const option = document.createElement("label");
      option.className = "tag-selector-settings-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(state[key]);
      checkbox.addEventListener("change", (event) => {
        event.stopPropagation();
        state[key] = checkbox.checked;
        if (key === "showAutomaticTags" && !state.showAutomaticTags) {
          const automaticTags = new Set(TEMPLATE_TAG_CATALOG.filter((entry) => entry.type === 1).map((entry) => entry.tag));
          state.selectedTagNames = state.selectedTagNames.filter((tagName) => !automaticTags.has(tagName));
        }
        recordHostInteraction(`tagSelector.settings.${key}`, "Tag Selector", String(state[key]));
        renderStage();
        renderMetrics();
      });
      const span = document.createElement("span");
      span.textContent = text;
      option.appendChild(checkbox);
      option.appendChild(span);
      menu.appendChild(option);
    });
    filterPane.appendChild(menu);
  }
  selector.appendChild(filterPane);
  container.appendChild(selector);
  sidebar.appendChild(container);
}

function addTagsBoxTag(input, selectedItems) {
  const tagName = canonicalTagName(input.value);
  if (!tagName) {
    input.focus();
    return;
  }
  const changed = applyTagMutationToItems(selectedItems, tagName, "add", 0);
  state.lastTagMutation = {
    kind: "tagsBox.add",
    label: `${tagName}; items=${changed}`,
  };
  recordHostInteraction("tagsBox.tag.add", tagName, `${formatNumber(changed)} items`);
  recordHostInteraction("item.addTag", tagName, `${formatNumber(changed)} items`);
  recordHostInteraction("item.saveTx", tagName, "tags-box add");
  renderStage();
  renderMetrics();
}

function removeTagsBoxTag(tagName, selectedItems) {
  const changed = applyTagMutationToItems(selectedItems, tagName, "remove", 0);
  state.lastTagMutation = {
    kind: "tagsBox.remove",
    label: `${tagName}; items=${changed}`,
  };
  recordHostInteraction("tagsBox.tag.remove", tagName, `${formatNumber(changed)} items`);
  recordHostInteraction("item.removeTag", tagName, `${formatNumber(changed)} items`);
  recordHostInteraction("item.saveTx", tagName, "tags-box remove");
  renderStage();
  renderMetrics();
}

function appendTagsBox(parent, libraryState, model) {
  const selectedItems = libraryState.selectedItems.length > 0
    ? libraryState.selectedItems
    : libraryState.selectedItem
      ? [libraryState.selectedItem]
      : [];
  const box = document.createElement("section");
  box.className = "tags-box";
  box.dataset.selectedCount = String(selectedItems.length);
  const title = document.createElement("p");
  title.className = "zotero-pane-title";
  title.textContent = "Tags Box";
  box.appendChild(title);

  const toolbar = document.createElement("div");
  toolbar.className = "tags-box-toolbar";
  const status = document.createElement("span");
  status.textContent = selectedItems.length > 1
    ? `${formatNumber(selectedItems.length)} selected; mixed tags shown`
    : selectedItems.length === 1
      ? "single item tags"
      : "no selected item";
  toolbar.appendChild(status);
  box.appendChild(toolbar);

  const addRow = document.createElement("div");
  addRow.className = "tags-box-add-row";
  const input = document.createElement("input");
  input.className = "tags-box-add-input";
  input.type = "text";
  input.placeholder = "Add tag";
  input.disabled = selectedItems.length === 0;
  const addButton = document.createElement("button");
  addButton.className = "tags-box-add-button";
  addButton.type = "button";
  addButton.textContent = "Add";
  addButton.disabled = selectedItems.length === 0;
  addButton.addEventListener("click", (event) => {
    event.stopPropagation();
    addTagsBoxTag(input, selectedItems);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addTagsBoxTag(input, selectedItems);
    }
  });
  addRow.appendChild(input);
  addRow.appendChild(addButton);
  box.appendChild(addRow);

  const tagCounts = new Map();
  selectedItems.forEach((item) => {
    getItemTags(item).forEach((tagData) => {
      const current = tagCounts.get(tagData.tag) || { ...tagData, count: 0 };
      current.count += 1;
      tagCounts.set(tagData.tag, current);
    });
  });
  const rows = sortTagsZoteroStyle([...tagCounts.values()]);
  const list = document.createElement("div");
  list.className = "tags-box-list";
  list.dataset.eventRate = String(model.controls.eventRate);
  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tags-box-empty";
    empty.textContent = "No tags";
    list.appendChild(empty);
  }
  rows.forEach((tagData) => {
    const row = document.createElement("div");
    row.className = "row";
    row.setAttribute("tagName", tagData.tag);
    row.setAttribute("tagType", String(tagData.type || 0));
    const color = tagColorForName(tagData.tag);
    if (color) {
      row.classList.add("has-color");
      row.style.setProperty("--tag-color", color.color);
    }
    const icon = document.createElement("div");
    icon.className = "zotero-box-icon";
    icon.title = tagData.type === 1 ? "automatic tag" : "manual tag";
    const label = document.createElement("span");
    label.className = "zotero-box-label";
    label.textContent = tagData.count < selectedItems.length ? `${tagData.tag} (mixed)` : tagData.tag;
    label.title = tagData.tag;
    const remove = document.createElement("button");
    remove.className = "zotero-clicky zotero-clicky-minus";
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove tag ${tagData.tag}`);
    remove.textContent = "−";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      removeTagsBoxTag(tagData.tag, selectedItems);
    });
    row.appendChild(icon);
    row.appendChild(label);
    row.appendChild(remove);
    list.appendChild(row);
  });
  box.appendChild(list);

  appendKeyValueRows(box, [
    ["Tag Surface", "template-tags"],
    ["Selected Rows", `${formatNumber(state.librarySelectionKeys.length)}`],
    ["Selected Tag Filter", state.selectedTagNames.length > 0 ? state.selectedTagNames.join(", ") : "none"],
    ["Show Automatic Tags", String(state.showAutomaticTags)],
    ["Last Tag Mutation", state.lastTagMutation.label],
  ]);
  parent.appendChild(box);
}

function appendWebLibraryAdapterPanel(parent) {
  const anchors = countWebLibraryAnchors();
  const fixtureCollections = state.webLibraryFixture.collections || [];
  const fixtureItems = state.webLibraryFixture.items || [];
  const panel = document.createElement("section");
  panel.className = "web-library-adapter-panel";
  panel.dataset.available = String(state.webLibraryHarness.available);
  const title = document.createElement("p");
  title.className = "zotero-pane-title";
  title.textContent = "Official UI Adapter";
  panel.appendChild(title);
  appendKeyValueRows(panel, [
    ["web-library", state.webLibraryHarness.adapterMode],
    ["anchors", `${anchors.passed}/${anchors.total}`],
    ["icons", state.webLibraryHarness.available ? "served from root" : "contract fallback"],
    ["fixture", state.webLibraryFixture.available ? `${fixtureCollections.length}/${fixtureItems.length} sampled` : state.webLibraryFixture.fixtureMode],
    ["client source", "authoritative"],
  ]);
  const note = document.createElement("p");
  note.className = "web-library-adapter-note";
  note.textContent = state.webLibraryHarness.available
    ? "Browser shell is anchored to configured Zotero Web Library components; host semantics still follow the local client source contract."
    : "No configured Zotero Web Library root is available; the browser shell keeps a source-shaped contract and reports fallback explicitly.";
  panel.appendChild(note);
  parent.appendChild(panel);
}

function appendPressureNodes(parent, count) {
  const cloud = document.createElement("div");
  cloud.className = "pressure-node-cloud";
  const visibleCount = Math.min(1800, Math.max(0, Math.round(count / 3)));
  for (let index = 0; index < visibleCount; index += 1) {
    const dot = document.createElement("span");
    dot.className = "pressure-node";
    cloud.appendChild(dot);
  }
  parent.appendChild(cloud);
}

function renderLibrarySurface(model) {
  const libraryState = ensureLibraryInteractionSelection(model);
  const app = document.createElement("div");
  app.className = "zotero-app";
  app.dataset.officialStyle = "zotero-web-library";
  app.dataset.webLibraryAdapter = state.webLibraryHarness.adapterMode;
  app.dataset.leftPaneCollapsed = String(state.modelLeftPaneCollapsed);
  app.dataset.rightPaneCollapsed = String(state.modelRightPaneCollapsed);
  app.addEventListener("click", () => {
    if (state.contextMenu.open) {
      closeContextMenu();
      renderStage();
      renderMetrics();
    }
  });
  app.appendChild(createToolbar(model));

  const layout = document.createElement("div");
  layout.className = "zotero-layout";

  const sidebar = document.createElement("aside");
  sidebar.className = "zotero-sidebar web-library-collection-tree collection-tree";
  sidebar.appendChild(createPaneCollapseRail("left", "Collections"));
  sidebar.setAttribute("role", "tree");
  sidebar.setAttribute("aria-label", "collection tree");
  const sidebarTitle = document.createElement("p");
  sidebarTitle.className = "zotero-pane-title";
  sidebarTitle.textContent = "Collections";
  sidebar.appendChild(sidebarTitle);
  libraryState.collections.forEach((collection, index) => {
    const row = document.createElement("div");
    row.className = "zotero-tree-row library-node";
    row.dataset.active = String(collection.key === state.selectedCollectionKey);
    row.dataset.key = collection.key;
    row.setAttribute("role", "treeitem");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-selected", String(collection.key === state.selectedCollectionKey));
    row.setAttribute("aria-level", "1");
    const name = document.createElement("span");
    name.textContent = collection.label;
    const count = document.createElement("strong");
    count.textContent = formatNumber(collection.count);
    row.appendChild(name);
    row.appendChild(count);
    row.addEventListener("click", (event) => {
      event.stopPropagation();
      selectLibraryCollection(libraryState.collections, index, "collection.click");
    });
    row.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      selectLibraryCollection(libraryState.collections, index, "collection.dblclick");
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        row.click();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        selectLibraryCollection(libraryState.collections, Math.min(libraryState.collections.length - 1, index + 1), "collection.keyboard.navigate");
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectLibraryCollection(libraryState.collections, Math.max(0, index - 1), "collection.keyboard.navigate");
      }
    });
    row.addEventListener("contextmenu", (event) => {
      setLibrarySelection({ collectionKey: collection.key, itemKey: state.selectedItemKey });
      openWindContextMenu(event, "collection", collection.key, collection.label);
    });
    sidebar.appendChild(row);
  });
  renderTagSelector(sidebar, libraryState.baseItems);

  const table = document.createElement("section");
  table.className = "zotero-table items-table items-table-wrap";
  table.setAttribute("role", "grid");
  table.setAttribute("aria-label", "items");
  table.style.setProperty("--item-tree-columns", itemTreeGridTemplateColumns());
  table.dataset.columnWidths = itemTreeColumnWidthSummary();
  const header = document.createElement("div");
  header.className = "zotero-table-header items-table-head";
  header.setAttribute("role", "row");
  LIBRARY_COLUMNS.forEach((column, index) => {
    const columnKey = itemTreeColumnKey(column);
    const cell = document.createElement("div");
    cell.className = "column-header";
    cell.setAttribute("role", "columnheader");
    cell.setAttribute("aria-sort", state.librarySort.column === columnKey ? state.librarySort.direction : "none");
    cell.dataset.colindex = String(index + 1);
    cell.dataset.columnKey = columnKey;
    cell.dataset.width = `${itemTreeColumnWidth(column)}px`;
    cell.dataset.minWidth = `${itemTreeColumnMinWidth(column)}px`;
    cell.dataset.active = String(state.librarySort.column === columnKey);
    const sortButton = document.createElement("button");
    sortButton.className = "column-sort-button";
    sortButton.type = "button";
    sortButton.textContent = state.librarySort.column === columnKey
      ? `${column.label} ${state.librarySort.direction === "ascending" ? "↑" : "↓"}`
      : column.label;
    sortButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const nextDirection = state.librarySort.column === columnKey && state.librarySort.direction === "ascending"
        ? "descending"
        : "ascending";
      state.librarySort = {
        column: columnKey,
        direction: nextDirection,
      };
      recordHostInteraction("items.header.click", columnKey, nextDirection);
      renderStage();
      renderMetrics();
    });
    cell.appendChild(sortButton);
    if (index > 0) {
      const [leftColumn, rightColumn] = getItemTreeResizeColumns(index) || [];
      const resizer = document.createElement("span");
      resizer.className = `column-resizer resizer ${columnKey}`;
      resizer.dataset.columnKey = columnKey;
      resizer.dataset.resizesLeft = leftColumn ? itemTreeColumnKey(leftColumn) : "";
      resizer.dataset.resizesRight = rightColumn ? itemTreeColumnKey(rightColumn) : "";
      resizer.setAttribute("role", "separator");
      resizer.setAttribute("aria-orientation", "vertical");
      resizer.setAttribute("aria-label", `Resize ${leftColumn?.label || "left"} and ${rightColumn?.label || "right"} columns`);
      resizer.setAttribute("aria-valuemin", String(itemTreeColumnMinWidth(column)));
      resizer.setAttribute("aria-valuenow", String(itemTreeColumnWidth(column)));
      resizer.setAttribute("tabindex", "0");
      resizer.title = `${ITEM_TREE_COLUMN_RESIZE_MODEL.commitHandler}; RESIZER_WIDTH=${ITEM_TREE_COLUMN_RESIZE_MODEL.resizerWidth}px`;
      resizer.addEventListener("pointerdown", (event) => beginItemTreeColumnResize(event, index));
      resizer.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      resizer.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          resizeItemTreeColumnPairByKeyboard(index, event.key === "ArrowLeft" ? -12 : 12);
        }
      });
      cell.appendChild(resizer);
    }
    header.appendChild(cell);
  });
  table.appendChild(header);
  libraryState.items.forEach((item, index) => {
    const itemKey = itemKeyForSelection(item);
    const isSelected = state.librarySelectionKeys.includes(itemKey);
    const row = document.createElement("div");
    row.className = "zotero-table-row item";
    row.dataset.selected = String(isSelected);
    row.dataset.index = String(index);
    row.dataset.key = itemKey;
    row.dataset.source = item.source || "synthetic";
    if (item.fixtureKey) {
      row.dataset.fixtureKey = item.fixtureKey;
    }
    row.draggable = true;
    row.setAttribute("role", "row");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-selected", String(isSelected));
    LIBRARY_COLUMNS.map((column) => item[itemTreeColumnKey(column)]).forEach((value, cellIndex) => {
      const cell = document.createElement("span");
      cell.setAttribute("role", "gridcell");
      if (cellIndex === 0) {
        const iconName = item.iconName || (item.type === "attachment" ? "attachment-pdf" : item.type === "bookSection" ? "book-section" : "journal-article");
        const icon = createWebLibraryIcon(iconName);
        if (icon) {
          cell.appendChild(icon);
        }
        const text = document.createElement("span");
        text.textContent = String(value);
        cell.appendChild(text);
      } else {
        cell.textContent = String(value);
      }
      row.appendChild(cell);
    });
    row.addEventListener("click", (event) => {
      event.stopPropagation();
      closeContextMenu();
      selectLibraryItemFromEvent(libraryState.items, itemKey, index, item.title, event);
      renderStage();
      renderMetrics();
    });
    row.addEventListener("dragstart", (event) => {
      const dragKeys = state.librarySelectionKeys.includes(itemKey) ? state.librarySelectionKeys : [itemKey];
      state.draggedItemKeys = dragKeys;
      event.dataTransfer.setData("zotero/item", dragKeys.join(","));
      event.dataTransfer.effectAllowed = "copyMove";
      recordHostInteraction("item.dragstart", itemKey, `${formatNumber(dragKeys.length)} items`);
    });
    row.addEventListener("dragend", () => {
      state.draggedItemKeys = [];
    });
    row.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      state.selectedItemKey = itemKey;
      state.librarySelectionKeys = state.librarySelectionKeys.includes(itemKey) ? state.librarySelectionKeys : [itemKey];
      state.libraryLastSelectedIndex = index;
      recordHostInteraction("item.dblclick", itemKey, "open-reader");
      renderStage();
      renderMetrics();
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectLibraryItemFromEvent(libraryState.items, itemKey, index, item.title, event);
        renderStage();
        renderMetrics();
        focusLibraryItem(itemKey);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        navigateLibraryItem(libraryState.items, index, 1, "ArrowDown");
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        navigateLibraryItem(libraryState.items, index, -1, "ArrowUp");
      } else if (event.key === "Home") {
        event.preventDefault();
        navigateLibraryItem(libraryState.items, index, -index, "Home");
      } else if (event.key === "End") {
        event.preventDefault();
        navigateLibraryItem(libraryState.items, index, libraryState.items.length - 1 - index, "End");
      }
    });
    row.addEventListener("contextmenu", (event) => {
      if (!state.librarySelectionKeys.includes(itemKey)) {
        state.selectedItemKey = itemKey;
        state.librarySelectionKeys = [itemKey];
        state.libraryLastSelectedIndex = index;
      }
      openWindContextMenu(event, "item", itemKey, item.title);
    });
    table.appendChild(row);
  });
  if (libraryState.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "zotero-table-empty";
    empty.textContent = state.selectedTagNames.length > 0
      ? `No items match tags: ${state.selectedTagNames.join(", ")}`
      : "No items";
    table.appendChild(empty);
  }
  appendPressureNodes(table, model.controls.domInflation);

  const itemPane = document.createElement("aside");
  itemPane.className = "zotero-item-pane item-details panel metadata-list";
  itemPane.appendChild(createPaneCollapseRail("right", "Item Pane"));
  const itemPaneTitle = document.createElement("p");
  itemPaneTitle.className = "zotero-pane-title";
  itemPaneTitle.textContent = "Item Pane";
  itemPane.appendChild(itemPaneTitle);
  const tabs = document.createElement("div");
  tabs.className = "item-pane-tabs";
  tabs.setAttribute("role", "tablist");
  ITEM_PANE_SECTIONS.forEach((section) => {
    const button = document.createElement("button");
    button.className = "item-pane-tab";
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(state.itemPaneSection === section.key));
    button.dataset.active = String(state.itemPaneSection === section.key);
    button.textContent = section.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      state.itemPaneSection = section.key;
      recordHostInteraction("itemPane.section.click", section.key, section.label);
      renderStage();
      renderMetrics();
    });
    tabs.appendChild(button);
  });
  itemPane.appendChild(tabs);
  const selectedItemRows = {
    info: [
      ["Section", "cleanroomtemplate-details"],
      ["Active Item", libraryState.selectedItem?.title || "none"],
      ["Item Key", state.selectedItemKey || "none"],
      ["Source Key", libraryState.selectedItem?.fixtureKey || "synthetic"],
      ["Collection", state.selectedCollectionKey || "all"],
      ["Item Type", libraryState.selectedItem?.type || "unknown"],
      ["Selection Count", `${formatNumber(state.librarySelectionKeys.length)} rows`],
      ["Selection Pressure", `${formatNumber(model.controls.selectionSize)} items`],
      ["Last Event", `${state.lastInteraction.kind}:${state.lastInteraction.target}`],
      ["Item Tree Columns", itemTreeColumnWidthSummary()],
      ["Column Resize", state.lastItemTreeColumnResize.label],
      ["Info Field Grid", "max-content 1fr"],
      ["Fixture", state.webLibraryFixture.available ? `${formatNumber(state.webLibraryFixture.items.length)} Web Library rows` : "synthetic rows"],
    ],
    notes: [
      ["Active Note", libraryState.selectedItem?.type === "note" ? libraryState.selectedItem.title : "template note shell"],
      ["Refresh", `${formatNumber(model.controls.renderMultiplier)}x`],
      ["I/O", `${formatNumber(model.controls.ioLatencyMS)}ms`],
      ["Last Menu Rebuild", `${state.contextMenu.targetType || "none"}`],
    ],
    related: [
      ["Related Surface", "template-related"],
      ["Listeners", `${formatNumber(state.leakedListenerCount)}`],
      ["Last Event", `${state.lastInteraction.kind}:${state.lastInteraction.target}`],
      ["Event Label", state.lastInteraction.label],
    ],
  };
  if (state.itemPaneSection === "tags") {
    appendTagsBox(itemPane, libraryState, model);
  } else {
    (selectedItemRows[state.itemPaneSection] || selectedItemRows.info).forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "zotero-detail-row";
      const left = document.createElement("span");
      left.textContent = label;
      const right = document.createElement("strong");
      right.textContent = value;
      row.appendChild(left);
      row.appendChild(right);
      itemPane.appendChild(row);
    });
  }
  appendWebLibraryAdapterPanel(itemPane);

  layout.appendChild(sidebar);
  layout.appendChild(table);
  layout.appendChild(itemPane);
  app.appendChild(layout);
  appendWindContextMenu(app);
  return app;
}

function renderReaderSurface(model) {
  const app = document.createElement("div");
  app.className = "zotero-app";
  app.dataset.webLibraryReader = state.webLibraryHarness.adapterMode;
  app.dataset.leftPaneCollapsed = String(state.modelLeftPaneCollapsed);
  app.dataset.rightPaneCollapsed = String(state.modelRightPaneCollapsed);
  const toolbar = createToolbar(model);
  const injected = document.createElement("button");
  injected.className = "zotero-tool-button reader-toolbar-injection";
  injected.type = "button";
  injected.textContent = "Template Action";
  toolbar.querySelector(".zotero-toolbar-group:last-child").prepend(injected);
  app.appendChild(toolbar);

  const layout = document.createElement("div");
  layout.className = "reader-layout";

  const sidebar = document.createElement("aside");
  sidebar.className = "reader-sidebar";
  sidebar.appendChild(createPaneCollapseRail("left", "Sidebar"));
  const title = document.createElement("p");
  title.className = "zotero-pane-title";
  title.textContent = "Sidebar";
  sidebar.appendChild(title);
  ["Thumbnails", "Annotations", "Outline", "Search"].forEach((label, index) => {
    const row = document.createElement("div");
    row.className = "reader-thumb";
    row.dataset.active = String(index === 1);
    const span = document.createElement("span");
    span.textContent = label;
    const count = document.createElement("strong");
    count.textContent = String(Math.max(1, Math.round(model.controls.selectionSize / (index + 1))));
    row.appendChild(span);
    row.appendChild(count);
    sidebar.appendChild(row);
  });

  const canvas = document.createElement("section");
  canvas.className = "reader-canvas";
  const page = document.createElement("article");
  page.className = "reader-page";
  const lineCount = Math.min(42, 18 + Math.round(model.controls.domInflation / 180));
  for (let index = 0; index < lineCount; index += 1) {
    const line = document.createElement("div");
    line.className = index % 9 === 4 ? "reader-annotation" : "reader-line";
    line.style.width = `${52 + (index * 13) % 44}%`;
    page.appendChild(line);
  }
  appendPressureNodes(page, model.controls.domInflation);
  canvas.appendChild(page);

  const contextPane = document.createElement("aside");
  contextPane.className = "reader-context-pane";
  contextPane.appendChild(createPaneCollapseRail("right", "Context"));
  const contextTitle = document.createElement("p");
  contextTitle.className = "zotero-pane-title";
  contextTitle.textContent = "Context Pane";
  contextPane.appendChild(contextTitle);
  [
    ["renderToolbar", `${formatNumber(model.controls.eventRate)}/s`],
    ["annotation menu", `${formatNumber(model.controls.selectionSize)}`],
    ["sidebar view", "annotations"],
    ["long task", `${formatNumber(model.controls.longTaskMS)}ms`],
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "zotero-detail-row";
    const left = document.createElement("span");
    left.textContent = label;
    const right = document.createElement("strong");
    right.textContent = value;
    row.appendChild(left);
    row.appendChild(right);
    contextPane.appendChild(row);
  });

  layout.appendChild(sidebar);
  layout.appendChild(canvas);
  layout.appendChild(contextPane);
  app.appendChild(layout);
  return app;
}

function renderPreferenceSurface(model) {
  const shell = document.createElement("div");
  shell.className = "preference-shell";
  const windowNode = document.createElement("section");
  windowNode.className = "preference-window";
  const tabs = document.createElement("div");
  tabs.className = "preference-tabs";
  ["General", "Sync", "Template", "Advanced"].forEach((label, index) => {
    const tab = document.createElement("div");
    tab.className = "preference-tab";
    tab.dataset.active = String(index === 2);
    tab.textContent = label;
    tabs.appendChild(tab);
  });
  const body = document.createElement("div");
  body.className = "preference-body";
  [
    ["locale", model.controls.ioLatencyMS > 120 ? "zh-CN slow" : "zh-CN"],
    ["prefs writes", `${formatNumber(model.controls.eventRate)}/s`],
    ["stylesheet latency", `${formatNumber(model.controls.ioLatencyMS)}ms`],
    ["form controls", `${formatNumber(Math.max(8, model.controls.domInflation / 30))}`],
    ["overflow boundary", "800x600"],
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "pref-row";
    const left = document.createElement("span");
    left.textContent = label;
    const right = document.createElement("span");
    right.textContent = value;
    row.appendChild(left);
    row.appendChild(right);
    body.appendChild(row);
  });
  appendPressureNodes(body, model.controls.domInflation);
  windowNode.appendChild(tabs);
  windowNode.appendChild(body);
  shell.appendChild(windowNode);
  return shell;
}

function renderMenuSurface(model) {
  const stage = document.createElement("div");
  stage.className = "menu-stage";
  const menubar = document.createElement("div");
  menubar.className = "menu-menubar";
  ["File", "Edit", "View", "Tools", "Window"].forEach((label) => {
    const button = document.createElement("button");
    button.className = "zotero-tool-button";
    button.type = "button";
    button.textContent = label;
    menubar.appendChild(button);
  });
  const popup = document.createElement("div");
  popup.className = "menu-popup";
  const rows = Math.min(44, 8 + Math.round(model.controls.eventRate / 6));
  for (let index = 0; index < rows; index += 1) {
    const row = document.createElement("div");
    row.className = "menu-row";
    row.dataset.active = String(index === 2);
    const label = document.createElement("span");
    label.textContent = index % 5 === 0 ? "Dynamic Submenu" : `Template Menu Item ${index + 1}`;
    const stateText = document.createElement("span");
    stateText.textContent = index % 3 === 0 ? "rebuild" : "ready";
    row.appendChild(label);
    row.appendChild(stateText);
    popup.appendChild(row);
  }
  appendPressureNodes(popup, model.controls.domInflation);
  stage.appendChild(menubar);
  stage.appendChild(popup);
  return stage;
}

function atlasBlueprintForRoute(route) {
  const blueprints = {
    [WIND_TUNNEL_ROUTES.ATTACHMENTS]: {
      title: "Attachment File Surface",
      lanes: ["stored file", "linked file", "snapshot", "missing file", "remote pending"],
      actions: ["Add Attachment", "Show File", "Rename", "Find PDF", "Sync File"],
      panelTitle: "Attachment Metadata",
    },
    [WIND_TUNNEL_ROUTES.NOTES]: {
      title: "Note Editor Surface",
      lanes: ["child note", "standalone note", "annotation note", "tags", "backlinks"],
      actions: ["New Note", "Add Annotation", "Autosave", "Tag Note", "Open Window"],
      panelTitle: "Note State",
    },
    [WIND_TUNNEL_ROUTES.SEARCH]: {
      title: "Search & Discovery Surface",
      lanes: ["quick search", "advanced search", "saved search", "tag filter", "locate"],
      actions: ["Type Query", "Add Criteria", "Save Search", "Toggle Tag", "Locate"],
      panelTitle: "Query State",
    },
    [WIND_TUNNEL_ROUTES.CITE]: {
      title: "Citation & Bibliography Surface",
      lanes: ["quick copy", "CSL style", "citation dialog", "bibliography", "word processor"],
      actions: ["Quick Copy", "Create Bibliography", "Pick Style", "Insert Citation", "Refresh"],
      panelTitle: "Citation State",
    },
    [WIND_TUNNEL_ROUTES.SYNC]: {
      title: "Sync / WebDAV / Groups Surface",
      lanes: ["data sync", "file sync", "WebDAV verify", "conflict", "group library"],
      actions: ["Start Sync", "Verify WebDAV", "Resolve Conflict", "Retry", "Open Group"],
      panelTitle: "Sync State",
    },
    [WIND_TUNNEL_ROUTES.IMPORT_EXPORT]: {
      title: "Import / Export Translator Surface",
      lanes: ["RIS import", "BibTeX import", "connector save", "CSL JSON", "export batch"],
      actions: ["Detect Translator", "Import", "Connector Save", "Export", "Cancel"],
      panelTitle: "Translator State",
    },
  };
  return blueprints[route] || {
    title: "Zotero Scenario Surface",
    lanes: ["host surface", "event bridge", "state store", "queue", "diagnostics"],
    actions: ["Replay", "Refresh", "Open", "Commit", "Reset"],
    panelTitle: "Scenario State",
  };
}

function renderAtlasSurface(model) {
  const blueprint = atlasBlueprintForRoute(model.scenario.route);
  const stage = document.createElement("div");
  stage.className = "atlas-stage";
  stage.dataset.route = model.scenario.route;

  const rail = document.createElement("aside");
  rail.className = "atlas-rail";
  const railTitle = document.createElement("p");
  railTitle.className = "zotero-pane-title";
  railTitle.textContent = blueprint.title;
  rail.appendChild(railTitle);
  blueprint.lanes.forEach((lane, index) => {
    const row = document.createElement("button");
    row.className = "atlas-lane";
    row.type = "button";
    row.dataset.active = String(index === Math.round(model.controls.renderMultiplier) % blueprint.lanes.length);
    const label = document.createElement("span");
    label.textContent = lane;
    const count = document.createElement("strong");
    count.textContent = formatNumber(Math.max(1, Math.round(model.controls.selectionSize / (index + 1))));
    row.appendChild(label);
    row.appendChild(count);
    row.addEventListener("click", () => {
      recordHostInteraction("scenario.lane.click", `${model.scenario.route}:${lane}`, model.scenario.label);
      renderMetrics();
    });
    rail.appendChild(row);
  });

  const main = document.createElement("section");
  main.className = "atlas-main";
  const heading = document.createElement("div");
  heading.className = "atlas-heading";
  const title = document.createElement("h2");
  title.textContent = model.scenario.label;
  const route = document.createElement("span");
  route.textContent = model.scenario.route;
  heading.appendChild(title);
  heading.appendChild(route);
  main.appendChild(heading);

  const summary = document.createElement("p");
  summary.className = "atlas-summary";
  summary.textContent = model.scenario.summary;
  main.appendChild(summary);

  const actions = document.createElement("div");
  actions.className = "atlas-action-strip";
  blueprint.actions.forEach((action, index) => {
    const button = document.createElement("button");
    button.className = "atlas-action";
    button.type = "button";
    button.textContent = action;
    button.addEventListener("click", () => {
      recordHostInteraction("scenario.action.click", `${model.scenario.id}:${index}`, action);
      renderMetrics();
    });
    actions.appendChild(button);
  });
  main.appendChild(actions);

  const grid = document.createElement("div");
  grid.className = "atlas-grid";
  model.scenario.coverageTags.forEach((tag, index) => {
    const card = document.createElement("section");
    card.className = "atlas-card";
    card.dataset.hot = String(index < Math.ceil(model.estimate.score / 28));
    const name = document.createElement("strong");
    name.textContent = tag;
    const detail = document.createElement("span");
    detail.textContent = index % 2 === 0
      ? `${formatNumber(model.controls.eventRate)} events/s`
      : `${formatNumber(model.controls.ioLatencyMS)}ms I/O`;
    card.appendChild(name);
    card.appendChild(detail);
    grid.appendChild(card);
  });
  model.scenario.hostSurfaces.slice(0, 8).forEach((surface) => {
    const card = document.createElement("section");
    card.className = "atlas-card atlas-card-surface";
    const name = document.createElement("strong");
    name.textContent = surface;
    const detail = document.createElement("span");
    detail.textContent = "host semantic contract";
    card.appendChild(name);
    card.appendChild(detail);
    grid.appendChild(card);
  });
  main.appendChild(grid);
  appendPressureNodes(main, model.controls.domInflation);

  const panel = document.createElement("aside");
  panel.className = "atlas-state-panel";
  const panelTitle = document.createElement("p");
  panelTitle.className = "zotero-pane-title";
  panelTitle.textContent = blueprint.panelTitle;
  panel.appendChild(panelTitle);
  appendKeyValueRows(panel, [
    ["scenario", model.scenario.id],
    ["route", model.scenario.route],
    ["surfaces", `${formatNumber(model.scenario.hostSurfaces.length)}`],
    ["coverage tags", `${formatNumber(model.scenario.coverageTags.length)}`],
    ["preset", model.preset.label],
    ["pressure", `${model.estimate.score} / ${model.estimate.severity}`],
    ["long task", `${formatNumber(model.controls.longTaskMS)}ms`],
    ["memory", `${formatNumber(model.controls.memoryMB)}MB`],
    ["last event", `${state.lastInteraction.kind}:${state.lastInteraction.target}`],
  ]);

  stage.appendChild(rail);
  stage.appendChild(main);
  stage.appendChild(panel);
  return stage;
}

function appendKeyValueRows(parent, rows) {
  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "zotero-detail-row";
    const left = document.createElement("span");
    left.textContent = label;
    const right = document.createElement("strong");
    right.textContent = value;
    row.appendChild(left);
    row.appendChild(right);
    parent.appendChild(row);
  });
}

function createReaderMenuBar() {
  const menuBar = document.createElement("div");
  menuBar.className = "zotero-reader-menu-bar";
  menuBar.setAttribute("role", "menubar");
  [
    ["file", "File", "transfer/export/print/showInLibrary"],
    ["edit", "Edit", "find/rotate/copy"],
    ["view", "View", "handTool/scrollMode/spreadMode"],
    ["go", "Go", "back/forward/page"],
    ["tools", "Tools", "annotation/readAloud"],
  ].forEach(([id, label, summary]) => {
    const button = document.createElement("button");
    button.className = "zotero-reader-menu";
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.dataset.menu = id;
    button.title = `reader.xhtml ${summary}`;
    button.textContent = label;
    button.addEventListener("click", () => {
      recordHostInteraction("reader.menu.popupshowing", id, summary);
      renderMetrics();
    });
    menuBar.appendChild(button);
  });
  return menuBar;
}

function createReaderToolbarAdapter(model) {
  const toolbar = document.createElement("div");
  toolbar.className = "zotero-reader-toolbar";
  toolbar.dataset.source = "reader.xhtml renderToolbar";

  const left = document.createElement("div");
  left.className = "zotero-reader-toolbar-group";
  [
    ["toggle-sidebar", "Sidebar", "sidebarOpen"],
    ["navigate-back", "Back", "key_back"],
    ["navigate-forward", "Forward", "key_forward"],
  ].forEach(([id, label, source]) => {
    const button = document.createElement("button");
    button.className = "reader-toolbar-button";
    button.type = "button";
    button.dataset.command = id;
    button.title = source;
    button.textContent = label;
    button.addEventListener("click", () => {
      if (id === "toggle-sidebar") {
        state.modelLeftPaneCollapsed = !state.modelLeftPaneCollapsed;
      }
      recordHostInteraction("reader.renderToolbar.click", id, source);
      renderMetrics();
      renderStage();
    });
    left.appendChild(button);
  });

  const center = document.createElement("div");
  center.className = "zotero-reader-toolbar-group reader-toolbar-center";
  const pageInput = document.createElement("input");
  pageInput.className = "reader-toolbar-page";
  pageInput.type = "text";
  pageInput.value = "1";
  pageInput.setAttribute("aria-label", "PDF page number");
  pageInput.addEventListener("change", () => {
    recordHostInteraction("reader.page.change", "page", pageInput.value || "1");
    renderMetrics();
  });
  const pageCount = document.createElement("span");
  pageCount.className = "reader-toolbar-count";
  pageCount.textContent = "/ 1";
  const search = document.createElement("input");
  search.id = "zotero-tb-search";
  search.className = "reader-toolbar-search";
  search.type = "search";
  search.placeholder = "Find";
  search.addEventListener("input", () => {
    recordHostInteraction("reader.find.input", "zotero-tb-search", search.value || "clear");
    renderMetrics();
  });
  center.appendChild(pageInput);
  center.appendChild(pageCount);
  center.appendChild(search);

  const right = document.createElement("div");
  right.className = "zotero-reader-toolbar-group";
  [
    ["toggle-context-pane", "Context", "contextPaneOpen"],
    ["zoom-out", "−", "onSetZoom"],
    ["zoom-in", "+", "onSetZoom"],
    ["highlight", "Highlight", "onSaveAnnotations"],
    ["note", "Note", "onAddToNote"],
    ["area", "Area", "annotation image"],
    ["read-aloud", "Read", "readAloudRemoteInterface"],
  ].forEach(([id, label, source]) => {
    const button = document.createElement("button");
    button.className = "reader-toolbar-button";
    button.type = "button";
    button.dataset.command = id;
    button.title = source;
    button.textContent = label;
    button.addEventListener("click", () => {
      if (id === "toggle-context-pane") {
        state.modelRightPaneCollapsed = !state.modelRightPaneCollapsed;
      }
      recordHostInteraction("reader.renderToolbar.click", id, source);
      renderMetrics();
      renderStage();
    });
    right.appendChild(button);
  });

  const badge = document.createElement("span");
  badge.className = "wind-badge";
  badge.textContent = `${model.scenario.route}:${state.pdfJsHarness.adapterMode}`;
  right.appendChild(badge);

  toolbar.appendChild(left);
  toolbar.appendChild(center);
  toolbar.appendChild(right);
  return toolbar;
}

function createReaderSidebarAdapter(model, readerFixture) {
  const sidebar = document.createElement("aside");
  sidebar.className = "zotero-reader-sidebar";
  sidebar.appendChild(createPaneCollapseRail("left", "Sidebar"));
  const tabs = document.createElement("div");
  tabs.className = "reader-sidebar-tabs";
  [
    ["thumbnails", "Thumbnails"],
    ["annotations", "Annotations"],
    ["outline", "Outline"],
    ["search", "Search"],
  ].forEach(([id, label]) => {
    const button = document.createElement("button");
    button.className = "reader-sidebar-tab";
    button.type = "button";
    button.dataset.active = String(id === "annotations");
    button.textContent = label;
    button.addEventListener("click", () => {
      recordHostInteraction("reader.sidebarView.change", id, label);
      renderMetrics();
    });
    tabs.appendChild(button);
  });
  sidebar.appendChild(tabs);

  const panel = document.createElement("div");
  panel.className = "reader-sidebar-panel";
  const annotationCount = Math.max(3, Number(readerFixture.annotationCount || 0));
  for (let index = 0; index < annotationCount; index += 1) {
    const row = document.createElement("button");
    row.className = "reader-annotation-row";
    row.type = "button";
    row.dataset.color = ["yellow", "blue", "red", "green"][index % 4];
    row.textContent = index === 0
      ? readerFixture.attachmentTitle || "JSTOR Full Text PDF"
      : `Annotation ${index + 1}`;
    row.addEventListener("click", () => {
      recordHostInteraction("reader.annotation.select", `annotation-${index + 1}`, row.textContent);
      renderMetrics();
    });
    panel.appendChild(row);
  }
  appendPressureNodes(panel, Math.min(model.controls.domInflation, 260));
  sidebar.appendChild(panel);
  return sidebar;
}

function createPdfJsDocumentAdapter(model) {
  const documentShell = document.createElement("section");
  documentShell.className = "zotero-reader-document-shell";
  if (model.scenario.requiresPdfJsHarness && state.pdfJsHarness.available) {
    const frame = document.createElement("iframe");
    frame.className = "zotero-pdfjs-frame";
    frame.title = "Zotero PDF.js viewer harness";
    frame.src = `${state.pdfJsHarness.viewerURL}?file=${encodeURIComponent(state.pdfJsHarness.samplePDFURL)}`;
    frame.addEventListener("load", () => {
      recordHostInteraction("pdfjs.viewer.load", "iframe", state.pdfJsHarness.samplePDFURL);
      renderMetrics();
    });
    documentShell.appendChild(frame);
  } else {
    const page = document.createElement("article");
    page.className = "translation-page";
    for (let index = 0; index < 18; index += 1) {
      const line = document.createElement("div");
      line.className = index % 5 === 2 ? "translation-source-line highlighted" : "translation-source-line";
      line.style.width = `${48 + (index * 17) % 46}%`;
      page.appendChild(line);
      if (index % 6 === 2) {
        const overlay = document.createElement("div");
        overlay.className = "translation-overlay-box";
        overlay.dataset.fit = model.controls.ioLatencyMS > 180 ? "clipped" : "fit";
        overlay.textContent = model.scenario.id === "quick-translate-replace"
          ? "replace selected text"
          : "PDF.js contract overlay";
        page.appendChild(overlay);
      }
    }
    appendPressureNodes(page, model.controls.domInflation);
    documentShell.appendChild(page);
  }

  const selectionDock = document.createElement("div");
  selectionDock.className = "reader-selection-dock";
  selectionDock.dataset.source = "reader.js onOpenContextMenu / text selection";
  const selectionLabel = document.createElement("span");
  selectionLabel.textContent = "Selection actions";
  selectionDock.appendChild(selectionLabel);
  ["Highlight", "Add Note", "Translate"].forEach((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      recordHostInteraction("reader.selectionPopup.click", label, "iframe selection bridge");
      renderMetrics();
    });
    selectionDock.appendChild(button);
  });
  documentShell.appendChild(selectionDock);
  return documentShell;
}

function readerSourceAnchorStatus(anchorId) {
  const anchor = (state.readerSourceHarness.requiredAnchors || []).find((entry) => entry.id === anchorId);
  if (!anchor) {
    return "not checked";
  }
  if (readerSourceAnchorPassed(anchor)) {
    return "anchored";
  }
  if (!anchor.exists) {
    return "missing file";
  }
  const passedSignals = anchor.signals.filter((signal) => signal.exists).length;
  return `${passedSignals}/${anchor.signals.length} signals`;
}

function createReaderSourceAnchorPanel() {
  const anchors = state.readerSourceHarness.requiredAnchors || [];
  const panel = document.createElement("section");
  panel.className = "reader-source-anchor-panel";
  panel.dataset.available = String(state.readerSourceHarness.available);

  const title = document.createElement("p");
  title.className = "zotero-pane-title";
  title.textContent = "Reader Source Anchors";
  panel.appendChild(title);

  anchors.slice(0, 5).forEach((anchor) => {
    const row = document.createElement("div");
    row.className = "reader-source-anchor-row";
    row.dataset.passed = String(readerSourceAnchorPassed(anchor));
    const label = document.createElement("span");
    label.textContent = anchor.id;
    const status = document.createElement("strong");
    const passedSignals = anchor.signals.filter((signal) => signal.exists).length;
    status.textContent = anchor.exists ? `${passedSignals}/${anchor.signals.length}` : "missing";
    status.title = anchor.file;
    row.appendChild(label);
    row.appendChild(status);
    panel.appendChild(row);
  });

  if (anchors.length === 0) {
    const fallback = document.createElement("p");
    fallback.className = "pdfjs-harness-note";
    fallback.textContent = "Reader source anchors have not been loaded yet.";
    panel.appendChild(fallback);
  }

  return panel;
}

function createReaderContextPaneAdapter(model, readerFixture) {
  const pane = document.createElement("aside");
  pane.className = "zotero-reader-context-pane";
  pane.appendChild(createPaneCollapseRail("right", "Context"));
  const title = document.createElement("p");
  title.className = "zotero-pane-title";
  title.textContent = "Reader Context Pane";
  pane.appendChild(title);
  const readerAnchors = countReaderSourceAnchors();
  appendKeyValueRows(pane, [
    ["adapter", state.pdfJsHarness.adapterMode],
    ["viewer", state.pdfJsHarness.available ? "viewer.html" : "contract fallback"],
    ["pdf.mjs", state.pdfJsHarness.available ? "available" : "missing build"],
    ["reader source", state.readerSourceHarness.adapterMode],
    ["source anchors", `${readerAnchors.passed}/${readerAnchors.total}`],
    ["reader.xhtml", readerSourceAnchorStatus("reader-xhtml-chrome")],
    ["reader.js callbacks", readerSourceAnchorStatus("reader-js-callbacks")],
    ["reader.css", readerSourceAnchorStatus("reader-css-chrome")],
    ["sample", state.pdfJsHarness.samplePDFLabel || state.pdfJsHarness.samplePDFURL],
    ["sample mode", state.pdfJsHarness.samplePDFMode || "unknown"],
    ["sample size", state.pdfJsHarness.samplePDFBytes ? `${formatNumber(Math.round(state.pdfJsHarness.samplePDFBytes / 1024))} KB` : "unknown"],
    ["reader fixture", readerFixture.attachmentTitle || "not loaded"],
    ["annotations", state.webLibraryFixture.available ? `${formatNumber(readerFixture.annotationCount || 0)} sampled` : "not loaded"],
    ["renderToolbar", `${formatNumber(model.controls.eventRate)}/s`],
    ["text layer", state.pdfJsHarness.available ? "PDFViewerApplication.pdfViewer" : "mocked contract"],
    ["sourceRect", state.pdfJsHarness.available ? "from viewport" : "locked mock"],
    ["visibleRect", model.controls.domInflation > 1000 ? "clipped" : "fit"],
    ["translate queue", `${Math.max(1, Math.round(model.controls.itemCount / 240))} pages`],
    ["provider", "mock only"],
  ]);
  pane.appendChild(createReaderSourceAnchorPanel());
  const hint = document.createElement("p");
  hint.className = "pdfjs-harness-note";
  hint.textContent = state.pdfJsHarness.available && state.readerSourceHarness.available
    ? "PDF pages are rendered by Zotero Reader's bundled PDF.js; Reader chrome and host callbacks are checked against Zotero reader.xhtml / reader.js / reader.css source anchors."
    : "Missing Zotero PDF.js build or Reader source anchors; this surface keeps the same contract and reports fallback explicitly.";
  pane.appendChild(hint);
  return pane;
}

function renderLifecycleSurface(model) {
  const stage = document.createElement("div");
  stage.className = "lifecycle-stage";

  const rail = document.createElement("section");
  rail.className = "lifecycle-rail";
  const steps = ["startup gate", "resource load", "feature register", "host smoke", "cleanup"];
  steps.forEach((label, index) => {
    const step = document.createElement("div");
    step.className = "lifecycle-step";
    step.dataset.active = String(index <= Math.min(4, Math.round(model.controls.renderMultiplier)));
    const name = document.createElement("strong");
    name.textContent = label;
    const value = document.createElement("span");
    value.textContent = `${formatNumber(model.controls.ioLatencyMS + index * model.controls.longTaskMS)}ms`;
    step.appendChild(name);
    step.appendChild(value);
    rail.appendChild(step);
  });

  const diagnostics = document.createElement("aside");
  diagnostics.className = "runtime-diagnostics-panel";
  const title = document.createElement("p");
  title.className = "zotero-pane-title";
  title.textContent = "Lifecycle Diagnostics";
  diagnostics.appendChild(title);
  appendKeyValueRows(diagnostics, [
    ["listener cleanup", `${formatNumber(state.leakedListenerCount)} retained`],
    ["fresh signal", model.controls.ioLatencyMS > 160 ? "recovering" : "fresh"],
    ["retry queue", `${Math.max(1, Math.round(model.controls.eventRate / 12))} jobs`],
    ["startup long task", `${formatNumber(model.controls.longTaskMS)}ms`],
  ]);

  appendPressureNodes(rail, model.controls.domInflation);
  stage.appendChild(rail);
  stage.appendChild(diagnostics);
  return stage;
}

function renderWindowLifecycleSurface(model) {
  const stage = document.createElement("div");
  stage.className = "window-lifecycle-stage";
  const windowCount = Math.min(5, Math.max(2, Math.round(model.controls.selectionSize / 30)));
  for (let index = 0; index < windowCount; index += 1) {
    const card = document.createElement("section");
    card.className = "template-window-card";
    card.dataset.active = String(index === 0);
    const chrome = document.createElement("div");
    chrome.className = "template-window-card-chrome";
    chrome.textContent = index === 0 ? "Main Window" : `Template Window ${index + 1}`;
    const body = document.createElement("div");
    body.className = "template-window-card-body";
    appendKeyValueRows(body, [
      ["mount", index === 0 ? "ready" : "pending"],
      ["style", "injected"],
      ["target", index % 2 === 0 ? "library" : "reader"],
      ["listeners", `${formatNumber(Math.max(0, state.leakedListenerCount - index))}`],
    ]);
    card.appendChild(chrome);
    card.appendChild(body);
    stage.appendChild(card);
  }
  appendPressureNodes(stage, model.controls.domInflation);
  return stage;
}

function renderWorkflowSurface(model) {
  const stage = document.createElement("div");
  stage.className = "workflow-stage";

  const targets = document.createElement("section");
  targets.className = "workflow-targets";
  ["Library", "Reader A", "Reader B", "Standalone"].forEach((label, index) => {
    const node = document.createElement("div");
    node.className = "workflow-target";
    node.dataset.active = String(index === Math.round(model.controls.renderMultiplier) % 4);
    const name = document.createElement("strong");
    name.textContent = label;
    const value = document.createElement("span");
    value.textContent = index === 0 ? `${formatNumber(model.controls.selectionSize)} items` : "target ready";
    node.appendChild(name);
    node.appendChild(value);
    targets.appendChild(node);
  });

  const panel = document.createElement("aside");
  panel.className = "template-docked-panel";
  const title = document.createElement("p");
  title.className = "zotero-pane-title";
  title.textContent = "Template Docked Panel";
  panel.appendChild(title);
  appendKeyValueRows(panel, [
    ["show sequence", model.controls.ioLatencyMS > 80 ? "serialized" : "coalesced"],
    ["same target", model.controls.renderMultiplier > 4 ? "late reuse" : "fast path"],
    ["pending context", `${formatNumber(model.controls.selectionSize)} records`],
    ["refresh", `${formatNumber(model.controls.renderMultiplier)}x full`],
  ]);

  const queue = document.createElement("section");
  queue.className = "workflow-queue";
  const queueTitle = document.createElement("p");
  queueTitle.className = "zotero-pane-title";
  queueTitle.textContent = "Context Queue";
  queue.appendChild(queueTitle);
  createSyntheticItems(model.controls.itemCount, {
    renderLimit: 8,
    selectionSize: Math.min(8, model.controls.selectionSize),
    route: model.scenario.route,
  }).forEach((item) => {
    const row = document.createElement("div");
    row.className = "workflow-context-row";
    row.dataset.selected = String(item.selected);
    row.textContent = item.title;
    queue.appendChild(row);
  });

  stage.appendChild(targets);
  stage.appendChild(panel);
  stage.appendChild(queue);
  appendPressureNodes(stage, model.controls.domInflation);
  return stage;
}

function renderTranslationSurface(model) {
  const stage = document.createElement("div");
  stage.className = "translation-stage zotero-reader-adapter-stage";
  const readerFixture = state.webLibraryFixture.reader || {};

  const shell = document.createElement("div");
  shell.className = "zotero-reader-browser-adapter";
  shell.dataset.pdfjs = state.pdfJsHarness.adapterMode;
  shell.dataset.source = "Zotero reader.xhtml + reader.js browser adapter";
  shell.dataset.leftPaneCollapsed = String(state.modelLeftPaneCollapsed);
  shell.dataset.rightPaneCollapsed = String(state.modelRightPaneCollapsed);
  shell.appendChild(createReaderMenuBar());
  shell.appendChild(createReaderToolbarAdapter(model));

  const workspace = document.createElement("div");
  workspace.className = "zotero-reader-workspace";
  workspace.dataset.leftPaneCollapsed = String(state.modelLeftPaneCollapsed);
  workspace.dataset.rightPaneCollapsed = String(state.modelRightPaneCollapsed);
  workspace.appendChild(createReaderSidebarAdapter(model, readerFixture));
  workspace.appendChild(createPdfJsDocumentAdapter(model));
  workspace.appendChild(createReaderContextPaneAdapter(model, readerFixture));
  shell.appendChild(workspace);
  stage.appendChild(shell);
  return stage;
}

function renderRuntimeSurface(model) {
  const stage = document.createElement("div");
  stage.className = "runtime-stage";
  const lanes = [
    ["preferences.openPane", 1600],
    ["itemPane.selectPane", 1000],
    ["contextPane.selectPane", 1200],
    ["reader.sidebar.selectView", 1500],
    ["wasm.worker.probe", 600],
    ["memory.delta", 96],
  ];

  const matrix = document.createElement("section");
  matrix.className = "runtime-matrix";
  lanes.forEach(([label, budget], index) => {
    const row = document.createElement("div");
    row.className = "runtime-lane";
    const cost = Math.round(model.controls.ioLatencyMS + model.controls.longTaskMS * (index + 1) + model.controls.eventRate);
    row.dataset.status = cost > budget ? "warn" : "pass";
    const name = document.createElement("span");
    name.textContent = label;
    const value = document.createElement("strong");
    value.textContent = `${formatNumber(cost)} / ${budget}`;
    row.appendChild(name);
    row.appendChild(value);
    matrix.appendChild(row);
  });

  const services = document.createElement("aside");
  services.className = "runtime-diagnostics-panel";
  const title = document.createElement("p");
  title.className = "zotero-pane-title";
  title.textContent = "Runtime Services";
  services.appendChild(title);
  appendKeyValueRows(services, [
    ["lazy hydrate", model.controls.ioLatencyMS > 120 ? "delayed" : "ready"],
    ["worker lane", model.scenario.id === "worker-wasm-matrix" ? "enabled by action" : "default disabled"],
    ["profiler", model.scenario.id === "profiler-memory-diagnostics" ? "sampling" : "advisory"],
    ["heap", `${formatNumber(state.metrics.heapMB || model.estimate.expectedHeapMB)}MB`],
  ]);

  stage.appendChild(matrix);
  stage.appendChild(services);
  appendPressureNodes(stage, model.controls.domInflation);
  return stage;
}

function renderReleaseSurface(model) {
  const stage = document.createElement("div");
  stage.className = "release-stage";
  const manifest = document.createElement("section");
  manifest.className = "release-manifest";
  const title = document.createElement("p");
  title.className = "zotero-pane-title";
  title.textContent = "Template Release Update Path";
  manifest.appendChild(title);
  appendKeyValueRows(manifest, [
    ["stable smoke", model.controls.ioLatencyMS > 220 ? "slow" : "passed"],
    ["beta smoke", "passed"],
    ["update.json", model.controls.ioLatencyMS > 240 ? "missing update_link" : "valid"],
    ["HTTP", "200"],
    ["gate", model.controls.ioLatencyMS > 240 ? "blocked" : "ready"],
  ]);

  const versions = document.createElement("section");
  versions.className = "release-version-grid";
  ["1.0.0", "1.1.0", "1.1.1-beta", "remote"].forEach((label, index) => {
    const version = document.createElement("div");
    version.className = "release-version";
    version.dataset.active = String(index >= 2);
    const name = document.createElement("strong");
    name.textContent = label;
    const stateText = document.createElement("span");
    stateText.textContent = index === 3 ? "updateURL" : "install smoke";
    version.appendChild(name);
    version.appendChild(stateText);
    versions.appendChild(version);
  });

  stage.appendChild(manifest);
  stage.appendChild(versions);
  appendPressureNodes(stage, model.controls.domInflation);
  return stage;
}

function applyScenarioSurfaceDefaults(model) {
  if (state.lastScenarioId === model.scenario.id) {
    return;
  }
  state.lastScenarioId = model.scenario.id;
  if (TAG_LIBRARY_SCENARIO_IDS.has(model.scenario.id)) {
    state.itemPaneSection = "tags";
  }
}

function renderStage() {
  const model = getModel();
  applyScenarioSurfaceDefaults(model);
  elements.stage.textContent = "";
  const isPdfVisualCheck = model.scenario.route === WIND_TUNNEL_ROUTES.TRANSLATION;
  elements.stage.dataset.visualMode = isPdfVisualCheck ? "pdf-check" : "standard";
  elements.stage.dataset.surfaceRoute = model.scenario.route;
  const stagePanel = elements.stage.closest(".wind-stage-panel");
  if (stagePanel) {
    stagePanel.dataset.visualMode = isPdfVisualCheck ? "pdf-check" : "standard";
  }
  let surface = null;
  if (TAG_LIBRARY_SCENARIO_IDS.has(model.scenario.id)) {
    surface = renderLibrarySurface(model);
  } else if (model.scenario.route === WIND_TUNNEL_ROUTES.READER) {
    surface = renderReaderSurface(model);
  } else if (model.scenario.route === WIND_TUNNEL_ROUTES.PREFERENCES) {
    surface = renderPreferenceSurface(model);
  } else if (model.scenario.route === WIND_TUNNEL_ROUTES.MENU) {
    surface = renderMenuSurface(model);
  } else if (model.scenario.route === WIND_TUNNEL_ROUTES.LIFECYCLE) {
    surface = renderLifecycleSurface(model);
  } else if (model.scenario.route === WIND_TUNNEL_ROUTES.WINDOWS) {
    surface = renderWindowLifecycleSurface(model);
  } else if (model.scenario.route === WIND_TUNNEL_ROUTES.WORKFLOW) {
    surface = renderWorkflowSurface(model);
  } else if (model.scenario.route === WIND_TUNNEL_ROUTES.TRANSLATION) {
    surface = renderTranslationSurface(model);
  } else if (model.scenario.route === WIND_TUNNEL_ROUTES.RUNTIME) {
    surface = renderRuntimeSurface(model);
  } else if (model.scenario.route === WIND_TUNNEL_ROUTES.RELEASE) {
    surface = renderReleaseSurface(model);
  } else if (
    [
      WIND_TUNNEL_ROUTES.ATTACHMENTS,
      WIND_TUNNEL_ROUTES.NOTES,
      WIND_TUNNEL_ROUTES.SEARCH,
      WIND_TUNNEL_ROUTES.CITE,
      WIND_TUNNEL_ROUTES.SYNC,
      WIND_TUNNEL_ROUTES.IMPORT_EXPORT,
    ].includes(model.scenario.route)
  ) {
    surface = renderAtlasSurface(model);
  } else {
    surface = renderLibrarySurface(model);
  }
  elements.stage.appendChild(surface);
  state.metrics.nodeCount = document.querySelectorAll("*").length;
  state.metrics.renderCount += 1;
}

function queueFullRender(reason) {
  const model = getModel();
  renderScenarioCards(model);
  renderScenarioMetadata(model);
  renderSurfaceList(model);
  renderStage();
  renderMetrics();
  addLog(reason);
}

function busyLoop(durationMS) {
  const capped = Math.min(90, Math.max(0, durationMS));
  const startedAt = performance.now();
  while (performance.now() - startedAt < capped) {
    Math.sqrt(startedAt * Math.random());
  }
}

function growMemory(model) {
  const targetBlocks = Math.min(60, Math.ceil(model.controls.memoryMB / 8));
  if (state.memoryBlocks.length >= targetBlocks) {
    return;
  }
  const blockSize = 2048 + Math.round(model.controls.memoryMB * 64);
  state.memoryBlocks.push(new Array(blockSize).fill(`wind-${state.memoryBlocks.length}`));
}

function simulateFrame(now) {
  const model = getModel();
  const delta = state.lastFrameAt ? now - state.lastFrameAt : 16;
  state.lastFrameAt = now;
  const instantaneousFPS = delta > 0 ? 1000 / delta : 60;
  state.metrics.fps = Math.round(state.metrics.fps * 0.82 + instantaneousFPS * 0.18);

  const events = Math.max(1, Math.round((model.controls.eventRate * Math.max(delta, 16)) / 1000));
  state.metrics.eventCount += events;
  state.metrics.renderCount += Math.max(0, Math.round(events * model.controls.renderMultiplier * 0.08));

  if (model.controls.listenerLeakRate > 0 && state.metrics.eventCount % 17 < events) {
    state.leakedListenerCount += Math.ceil(model.controls.listenerLeakRate / 5);
  }

  if (model.controls.longTaskMS > 0 && now - state.lastLongTaskAt > Math.max(420, 1800 - model.controls.eventRate * 5)) {
    state.lastLongTaskAt = now;
    state.metrics.longTasks += 1;
    busyLoop(model.controls.longTaskMS);
  }

  if (now - state.lastSurfaceRenderAt > Math.max(260, 1200 - model.controls.eventRate * 5)) {
    state.lastSurfaceRenderAt = now;
    renderStage();
  }

  growMemory(model);
  const browserHeap = performance.memory?.usedJSHeapSize
    ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
    : 0;
  state.metrics.heapMB = Math.max(
    browserHeap,
    model.estimate.expectedHeapMB + state.memoryBlocks.length * 2 + Math.round(state.leakedListenerCount / 10),
  );
  state.metrics.nodeCount = document.querySelectorAll("*").length;

  if (now - state.lastSampleAt > 1000) {
    state.lastSampleAt = now;
    state.timeline.push(createTimelineSample(state.metrics));
    state.timeline = state.timeline.slice(-96);
    renderMetrics();
  }

  if (state.running) {
    state.rafId = requestAnimationFrame(simulateFrame);
  }
}

function startOrPause() {
  state.running = !state.running;
  elements.start.textContent = state.running ? "Pause" : "Start";
  elements.status.textContent = state.running ? "running" : "paused";
  elements.status.dataset.running = String(state.running);
  addLog(state.running ? "simulation.start" : "simulation.pause");
  if (state.running) {
    state.lastFrameAt = performance.now();
    state.lastSampleAt = performance.now();
    state.rafId = requestAnimationFrame(simulateFrame);
  } else if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

function stepOnce() {
  simulateFrame(performance.now() + 16);
  renderMetrics();
  addLog("simulation.step");
}

function resetSimulation() {
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
  }
  state.running = false;
  state.metrics = {
    fps: getModel().estimate.expectedFPS,
    longTasks: 0,
    eventCount: 0,
    renderCount: 0,
    nodeCount: getModel().estimate.expectedNodeCount,
    heapMB: getModel().estimate.expectedHeapMB,
  };
  state.timeline = [createTimelineSample(state.metrics)];
  state.logs = [];
  state.leakedListenerCount = 0;
  state.memoryBlocks = [];
  state.lastFrameAt = 0;
  state.lastSampleAt = 0;
  state.lastLongTaskAt = 0;
  state.lastSurfaceRenderAt = 0;
  elements.start.textContent = "Start";
  elements.status.textContent = "idle";
  elements.status.dataset.running = "false";
  renderStage();
  renderMetrics();
  renderLogs();
  addLog("simulation.reset");
}

function installEventHandlers() {
  elements.scenario.addEventListener("change", () => {
    state.scenarioId = elements.scenario.value;
    setControlsFromModel();
    renderSliders();
    resetSimulation();
    queueFullRender(`scenario=${state.scenarioId}`);
  });
  elements.preset.addEventListener("change", () => {
    state.presetId = elements.preset.value;
    setControlsFromModel();
    renderSliders();
    resetSimulation();
    queueFullRender(`preset=${state.presetId}`);
  });
  elements.start.addEventListener("click", startOrPause);
  elements.step.addEventListener("click", stepOnce);
  elements.reset.addEventListener("click", resetSimulation);
  elements.toggleMetrics.addEventListener("click", () => {
    state.metricsPanelCollapsed = !state.metricsPanelCollapsed;
    recordHostInteraction("wind.metricsPanel.toggle", "data-panel", state.metricsPanelCollapsed ? "collapsed" : "expanded");
    renderShellChrome();
  });
}

function init() {
  Object.assign(elements, {
    start: byId("wind-start"),
    step: byId("wind-step"),
    reset: byId("wind-reset"),
    grid: document.querySelector(".wind-grid"),
    metricsPanel: document.querySelector(".wind-metrics-panel"),
    toggleMetrics: byId("wind-toggle-metrics"),
    moduleList: byId("wind-module-list"),
    moduleSummary: byId("wind-module-summary"),
    scenario: byId("wind-scenario"),
    scenarioCards: byId("wind-scenario-cards"),
    preset: byId("wind-preset"),
    routeBadge: byId("wind-route-badge"),
    scoreLabel: byId("wind-score-label"),
    severityLabel: byId("wind-severity-label"),
    surfaceList: byId("wind-surface-list"),
    coverageTags: byId("wind-coverage-tags"),
    referenceList: byId("wind-reference-list"),
    sliders: byId("wind-control-sliders"),
    stage: byId("wind-stage"),
    status: byId("wind-status-pill"),
    log: byId("wind-event-log"),
    metricGrid: byId("wind-metric-grid"),
    coverageMap: byId("wind-coverage-map"),
    coverageCount: byId("wind-coverage-count"),
    timeline: byId("wind-timeline"),
    sampleCount: byId("wind-sample-count"),
    hotZones: byId("wind-hot-zones"),
    hotZoneCount: byId("wind-hot-zone-count"),
  });
  setControlsFromModel();
  populateSelectors();
  renderSliders();
  renderShellChrome();
  installEventHandlers();
  resetSimulation();
  queueFullRender("wind-tunnel.ready");
  void loadPdfJsHarnessStatus();
  void loadReaderSourceHarnessStatus();
  void loadWebLibraryHarnessStatus();
  void loadWebLibraryFixtureStatus();
}

init();
