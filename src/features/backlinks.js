const DEFAULT_LIMIT = 50;
const SECTION_ID = "toolsbox-backlinks";
const OWNER = "toolsbox-backlinks";
const PLUGIN_ID = "toolsbox@orlandozh.github";

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
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function readProperty(object, property) {
  try {
    return object?.[property];
  } catch {
    return undefined;
  }
}

function getField(item, field) {
  const direct = readProperty(item, field);
  if (direct !== null && direct !== undefined && direct !== "") {
    return direct;
  }
  return safeCall(item?.getField, item, field);
}

function getItemID(item) {
  return item?.id ?? item?.itemID ?? null;
}

function getItemKey(item) {
  return normalizeText(item?.key || safeCall(item?.getField, item, "key"));
}

function getItemTitle(item) {
  return normalizeText(getField(item, "title"))
    || getItemKey(item)
    || (getItemID(item) ? `Item ${getItemID(item)}` : "Untitled");
}

function normalizeDOI(value) {
  return normalizeText(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")
    .replace(/^doi:\s*/iu, "")
    .replace(/[),.;\s]+$/u, "")
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function includesToken(text, value) {
  if (!text || !value) {
    return false;
  }
  const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(value)}([^A-Za-z0-9]|$)`, "iu");
  return pattern.test(text);
}

function addTarget(targets, seen, type, value, match = "substring") {
  const normalized = normalizeText(value);
  if (!normalized) {
    return;
  }
  const key = `${type}:${normalized.toLowerCase()}:${match}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  targets.push({ type, value: normalized, match });
}

export function buildBacklinkTargets(item, zotero = {}) {
  const targets = [];
  const seen = new Set();

  const itemKey = getItemKey(item);
  if (itemKey) {
    addTarget(targets, seen, "itemKey", itemKey, "token");
  }

  const itemURI = safeCall(zotero?.URI?.getItemURI, zotero.URI, item);
  if (itemURI) {
    addTarget(targets, seen, "zoteroURI", itemURI, "substring");
  }

  const doi = normalizeDOI(getField(item, "DOI") || getField(item, "doi"));
  if (doi) {
    addTarget(targets, seen, "doi", doi, "substring");
    addTarget(targets, seen, "doi", `doi:${doi}`, "substring");
    addTarget(targets, seen, "doi", `https://doi.org/${doi}`, "substring");
    addTarget(targets, seen, "doi", `http://dx.doi.org/${doi}`, "substring");
  }

  return targets;
}

function findTextTargetMatches(text, targets) {
  const source = normalizeText(text);
  if (!source) {
    return [];
  }
  const lowerSource = source.toLowerCase();
  const matches = new Set();

  for (const target of targets || []) {
    const value = normalizeText(target?.value);
    if (!value) {
      continue;
    }

    if (target.match === "token") {
      if (includesToken(source, value)) {
        matches.add(`text:${target.type}`);
      }
      continue;
    }

    const targetValue = target.type === "doi" ? normalizeDOI(value) : value.toLowerCase();
    if (!targetValue) {
      continue;
    }

    if (target.type === "doi") {
      const normalizedSource = lowerSource
        .replace(/https?:\/\/(?:dx\.)?doi\.org\//giu, "")
        .replace(/doi:\s*/giu, "");
      if (normalizedSource.includes(targetValue)) {
        matches.add("text:doi");
      }
      continue;
    }

    if (lowerSource.includes(targetValue.toLowerCase())) {
      matches.add(`text:${target.type}`);
    }
  }

  return Array.from(matches);
}

export function textMentionsTarget(text, targets) {
  return findTextTargetMatches(text, targets).length > 0;
}

function extractNoteText(note) {
  return [
    safeCall(note?.getNote, note),
    readProperty(note, "note"),
    getField(note, "note"),
    getField(note, "abstractNote"),
  ].map(normalizeText).filter(Boolean);
}

function collectCandidateTexts(candidate, zotero) {
  const texts = [
    getField(candidate, "extra"),
    getField(candidate, "abstractNote"),
    ...extractNoteText(candidate),
  ];

  const noteRefs = asArray(safeCall(candidate?.getNotes, candidate));
  for (const noteRef of noteRefs) {
    const note = typeof noteRef === "object"
      ? noteRef
      : safeCall(zotero?.Items?.get, zotero.Items, noteRef);
    texts.push(...extractNoteText(note));
  }

  return texts.map(normalizeText).filter(Boolean);
}

function flattenRelationValues(value, out = []) {
  if (!value) {
    return out;
  }
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value) || value instanceof Set) {
    for (const entry of value) {
      flattenRelationValues(entry, out);
    }
    return out;
  }
  if (value instanceof Map) {
    for (const entry of value.values()) {
      flattenRelationValues(entry, out);
    }
    return out;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value)) {
      flattenRelationValues(entry, out);
    }
  }
  return out;
}

function relationMentionsCurrentItem(relationValue, currentItem, zotero, targets) {
  const value = normalizeText(relationValue);
  if (!value) {
    return false;
  }

  const currentID = getItemID(currentItem);
  const relatedID = safeCall(zotero?.URI?.getItemID, zotero.URI, value);
  if (currentID !== null && relatedID !== undefined && relatedID !== null && String(relatedID) === String(currentID)) {
    return true;
  }

  return (targets || []).some((target) => {
    if (target.type === "zoteroURI") {
      return value === target.value;
    }
    if (target.type === "itemKey") {
      return includesToken(value, target.value);
    }
    return false;
  });
}

function collectRelationMatches(candidate, currentItem, zotero, targets) {
  const relations = safeCall(zotero?.Relations?.getByItem, zotero.Relations, candidate)
    || safeCall(candidate?.getRelations, candidate);
  const relationValues = flattenRelationValues(relations);
  return relationValues.some((value) => relationMentionsCurrentItem(value, currentItem, zotero, targets))
    ? ["relation"]
    : [];
}

function isPromiseLike(value) {
  return value && typeof value.then === "function";
}

function collectCandidateItems(zotero, options = {}) {
  if (Array.isArray(options.items)) {
    return options.items;
  }

  const itemsAPI = zotero?.Items;
  if (!itemsAPI) {
    return [];
  }
  const libraryID = zotero?.Libraries?.userLibraryID;

  const sources = [
    ["getAll", [libraryID, false, false, false]],
    ["getAllItems", []],
    ["getByLibrary", [libraryID]],
  ];

  for (const [method, args] of sources) {
    const result = safeCall(itemsAPI[method], itemsAPI, ...args);
    if (result && typeof result.then === "function") {
      continue;
    }
    const items = asArray(result).filter(Boolean);
    if (items.length > 0) {
      return items;
    }
  }

  return [];
}

async function collectCandidateItemsAsync(zotero, options = {}) {
  if (Array.isArray(options.items)) {
    return options.items;
  }

  const itemsAPI = zotero?.Items;
  if (!itemsAPI) {
    return [];
  }
  const libraryID = zotero?.Libraries?.userLibraryID;

  const sources = [
    ["getAll", [libraryID, false, false, false]],
    ["getAllItems", []],
    ["getByLibrary", [libraryID]],
  ];

  for (const [method, args] of sources) {
    let result = safeCall(itemsAPI[method], itemsAPI, ...args);
    if (isPromiseLike(result)) {
      try {
        result = await result;
      } catch {
        result = null;
      }
    }
    const items = asArray(result).filter(Boolean);
    if (items.length > 0) {
      return items;
    }
  }

  return [];
}

function isSameItem(a, b) {
  const aID = getItemID(a);
  const bID = getItemID(b);
  if (aID !== null && bID !== null && String(aID) === String(bID)) {
    return true;
  }
  const aKey = getItemKey(a);
  const bKey = getItemKey(b);
  return Boolean(aKey && bKey && aKey === bKey);
}

function resolveLimit(options = {}) {
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : DEFAULT_LIMIT;
  return limit;
}

function getMatchPriority(entry) {
  const matches = new Set(entry.matchedBy || []);
  if (matches.has("text:itemKey") && matches.size === 1) {
    return 0;
  }
  if (matches.has("text:doi")) {
    return 1;
  }
  if (matches.has("text:zoteroURI")) {
    return 2;
  }
  if (matches.has("text:itemKey")) {
    return 3;
  }
  if (matches.has("relation")) {
    return 4;
  }
  return 5;
}

function compareBacklinkEntries(left, right) {
  const priorityCompare = getMatchPriority(left) - getMatchPriority(right);
  if (priorityCompare !== 0) {
    return priorityCompare;
  }

  const leftMatch = (left.matchedBy || []).join(",");
  const rightMatch = (right.matchedBy || []).join(",");
  const matchCompare = leftMatch.localeCompare(rightMatch, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (matchCompare !== 0) {
    return matchCompare;
  }

  const leftTitle = normalizeText(left.title) || "Untitled";
  const rightTitle = normalizeText(right.title) || "Untitled";
  const titleCompare = leftTitle.localeCompare(rightTitle, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (titleCompare !== 0) {
    return titleCompare;
  }

  return String(left.itemID ?? left.key ?? "").localeCompare(String(right.itemID ?? right.key ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function collectBacklinksFromCandidates(item, zotero, options, candidates) {
  if (!item) {
    return [];
  }

  const limit = resolveLimit(options);
  const targets = Array.isArray(options.targets)
    ? options.targets
    : buildBacklinkTargets(item, zotero);
  const backlinks = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (!candidate || isSameItem(candidate, item)) {
      continue;
    }

    const matchedBy = new Set(collectRelationMatches(candidate, item, zotero, targets));
    for (const text of collectCandidateTexts(candidate, zotero)) {
      for (const match of findTextTargetMatches(text, targets)) {
        matchedBy.add(match);
      }
    }

    if (matchedBy.size === 0) {
      continue;
    }

    const identity = getItemID(candidate) ?? getItemKey(candidate) ?? getItemTitle(candidate);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    backlinks.push({
      itemID: getItemID(candidate),
      key: getItemKey(candidate),
      title: getItemTitle(candidate),
      matchedBy: Array.from(matchedBy).sort(),
    });
  }

  return backlinks.sort(compareBacklinkEntries).slice(0, limit);
}

export function collectBacklinksForItem(item, zotero = {}, options = {}) {
  return collectBacklinksFromCandidates(item, zotero, options, collectCandidateItems(zotero, options));
}

export async function collectBacklinksForItemAsync(item, zotero = {}, options = {}) {
  const candidates = await collectCandidateItemsAsync(zotero, options);
  return collectBacklinksFromCandidates(item, zotero, options, candidates);
}

function createGraphNodeID(prefix, itemID, key, title) {
  const identity = itemID ?? key ?? title ?? "unknown";
  return `${prefix}:${String(identity)}`;
}

export function buildBacklinkGraphForItem(item, backlinks = [], options = {}) {
  const limit = resolveLimit(options);
  const targetID = createGraphNodeID("target", getItemID(item), getItemKey(item), getItemTitle(item));
  const nodes = [{
    id: targetID,
    role: "target",
    itemID: getItemID(item),
    key: getItemKey(item),
    title: item ? getItemTitle(item) : "No item selected",
  }];
  const edges = [];
  const sortedBacklinks = asArray(backlinks).filter(Boolean).sort(compareBacklinkEntries).slice(0, limit);
  const seenNodes = new Set([targetID]);

  for (const backlink of sortedBacklinks) {
    const sourceID = createGraphNodeID("source", backlink.itemID, backlink.key, backlink.title);
    if (!seenNodes.has(sourceID)) {
      seenNodes.add(sourceID);
      nodes.push({
        id: sourceID,
        role: "source",
        itemID: backlink.itemID ?? null,
        key: backlink.key || "",
        title: backlink.title || "Untitled",
      });
    }
    edges.push({
      id: `${sourceID}->${targetID}`,
      source: sourceID,
      target: targetID,
      matchedBy: Array.isArray(backlink.matchedBy) ? [...backlink.matchedBy].sort() : [],
    });
  }

  return {
    itemID: getItemID(item),
    targetID,
    nodes,
    edges,
    backlinks: sortedBacklinks,
    backlinkCount: sortedBacklinks.length,
  };
}

function setAttribute(node, name, value) {
  if (node && typeof node.setAttribute === "function") {
    try {
      node.setAttribute(name, value);
    } catch {}
  }
  if (node?.dataset && name === "data-toolsbox-owner") {
    node.dataset.toolsboxOwner = value;
  }
}

function createElement(doc, tagName, className, textContent = "") {
  const node = doc.createElement(tagName);
  if (className) {
    try {
      node.className = className;
    } catch {}
    setAttribute(node, "class", className);
  }
  if (textContent) {
    node.textContent = textContent;
  }
  setAttribute(node, "data-toolsbox-owner", OWNER);
  return node;
}

function removeOwnedChildren(body) {
  if (!body) {
    return;
  }
  const ownedChildren = typeof body.querySelectorAll === "function"
    ? Array.from(body.querySelectorAll(`[data-toolsbox-owner="${OWNER}"]`))
    : [];
  for (const child of ownedChildren) {
    if (typeof child.remove === "function") {
      child.remove();
    }
  }
}

function translate(i18n, key, fallback) {
  if (typeof i18n?.t === "function") {
    return i18n.t(key, fallback);
  }
  return fallback;
}

function attachClick(node, handler) {
  if (!node || typeof handler !== "function") {
    return;
  }
  if (typeof node.addEventListener === "function") {
    node.addEventListener("click", handler);
    return;
  }
  node.onclick = handler;
}

export async function selectBacklinkSource(backlink, options = {}) {
  const {
    zotero = globalThis.Zotero,
    host = null,
    logger,
  } = options;
  const rawItemID = backlink?.itemID ?? backlink?.id;
  const itemID = Number(rawItemID);
  if (!Number.isFinite(itemID) || itemID <= 0) {
    return { ok: false, reason: "missing-item-id" };
  }

  const mainWindow = safeCall(host?.getMainWindow, host)
    || safeCall(zotero?.getMainWindow, zotero)
    || null;
  const zoteroPane = safeCall(zotero?.getActiveZoteroPane, zotero)
    || mainWindow?.ZoteroPane
    || host?.ZoteroPane
    || null;

  try {
    if (typeof zoteroPane?.selectItem === "function") {
      await zoteroPane.selectItem(itemID);
      return { ok: true, itemID, strategy: "ZoteroPane.selectItem" };
    }
    if (typeof zoteroPane?.itemsView?.selectItem === "function") {
      await zoteroPane.itemsView.selectItem(itemID);
      return { ok: true, itemID, strategy: "itemsView.selectItem" };
    }
  } catch (error) {
    logger?.warn?.("backlinks.drilldown.failed", {
      itemID,
      error: error?.message || String(error),
    });
    return { ok: false, itemID, reason: "selection-failed" };
  }

  return { ok: false, itemID, reason: "selection-api-unavailable" };
}

function renderEmpty(doc, root, i18n, key, fallback) {
  root.appendChild(createElement(
    doc,
    "div",
    "toolsbox-backlinks-empty",
    translate(i18n, key, fallback),
  ));
}

function renderBacklinkGraph(doc, root, graph) {
  const graphNode = createElement(doc, "div", "toolsbox-backlinks-graph");
  const target = graph.nodes.find((node) => node.role === "target");
  graphNode.appendChild(createElement(
    doc,
    "div",
    "toolsbox-backlinks-graph-target",
    target?.title || "Selected item",
  ));
  graphNode.appendChild(createElement(
    doc,
    "div",
    "toolsbox-backlinks-graph-summary",
    `${graph.nodes.length} nodes, ${graph.edges.length} edges`,
  ));
  root.appendChild(graphNode);
}

export function renderBacklinksSection({
  doc,
  body,
  item,
  zotero,
  i18n,
  limit = DEFAULT_LIMIT,
  graph = null,
  loading = false,
  scannerUnavailable = false,
  onSelectSource,
} = {}) {
  if (!doc || typeof doc.createElement !== "function" || !body || typeof body.appendChild !== "function") {
    return null;
  }

  removeOwnedChildren(body);

  const root = createElement(doc, "div", "toolsbox-backlinks");
  const backlinks = graph?.backlinks
    || (item && !loading && !scannerUnavailable ? collectBacklinksForItem(item, zotero, { limit }) : []);
  const backlinkGraph = graph || buildBacklinkGraphForItem(item, backlinks, { limit });
  const countLabel = translate(i18n, "toolsbox-backlinks-count", "local backlinks");

  const count = createElement(
    doc,
    "div",
    "toolsbox-backlinks-count",
    !item
      ? translate(i18n, "toolsbox-backlinks-no-item", "No item selected")
      : loading
        ? translate(i18n, "toolsbox-backlinks-loading", "Loading local backlinks...")
        : scannerUnavailable
          ? translate(i18n, "toolsbox-backlinks-api-unavailable", "Backlink scanner unavailable")
          : `${backlinkGraph.backlinkCount} ${countLabel}`,
  );
  root.appendChild(count);

  if (!item) {
    renderEmpty(doc, root, i18n, "toolsbox-backlinks-no-item", "No item selected");
  } else if (loading) {
    renderEmpty(doc, root, i18n, "toolsbox-backlinks-loading", "Loading local backlinks...");
  } else if (scannerUnavailable) {
    renderEmpty(doc, root, i18n, "toolsbox-backlinks-api-unavailable", "Backlink scanner unavailable");
  } else if (backlinkGraph.backlinkCount > 0) {
    renderBacklinkGraph(doc, root, backlinkGraph);
    const list = createElement(doc, "ul", "toolsbox-backlinks-list");
    for (const backlink of backlinkGraph.backlinks) {
      const entry = createElement(doc, "li", "toolsbox-backlinks-entry");
      const title = createElement(doc, "span", "toolsbox-backlinks-title", backlink.title);
      const meta = createElement(doc, "span", "toolsbox-backlinks-meta", backlink.matchedBy.join(", "));
      entry.appendChild(title);
      entry.appendChild(meta);
      if (typeof onSelectSource === "function") {
        const button = createElement(
          doc,
          "button",
          "toolsbox-backlinks-drilldown-button",
          translate(i18n, "toolsbox-backlinks-open-source", "Open source"),
        );
        button.type = "button";
        setAttribute(button, "data-toolsbox-action", "open-backlink-source");
        if (backlink.itemID !== null && backlink.itemID !== undefined) {
          setAttribute(button, "data-toolsbox-backlink-item-id", String(backlink.itemID));
        }
        const status = createElement(doc, "span", "toolsbox-backlinks-drilldown-status");
        attachClick(button, () => {
          button.disabled = true;
          status.textContent = translate(i18n, "toolsbox-backlinks-open-running", "Selecting source...");
          Promise.resolve(onSelectSource(backlink))
            .then((result) => {
              status.textContent = result?.ok
                ? translate(i18n, "toolsbox-backlinks-open-success", "Source selected")
                : translate(i18n, "toolsbox-backlinks-open-failed", "Unable to select source");
            })
            .catch(() => {
              status.textContent = translate(i18n, "toolsbox-backlinks-open-failed", "Unable to select source");
            })
            .finally(() => {
              button.disabled = false;
            });
        });
        entry.appendChild(button);
        entry.appendChild(status);
      }
      list.appendChild(entry);
    }
    root.appendChild(list);
  } else {
    renderEmpty(doc, root, i18n, "toolsbox-backlinks-empty", "No local backlinks");
  }

  body.appendChild(root);
  return root;
}

export function createBacklinks(options = {}) {
  const {
    logger,
    i18n,
    zotero,
    itemPane,
    host,
    limit = DEFAULT_LIMIT,
  } = options;
  const Zotero = zotero || globalThis.Zotero;
  let registered = false;
  let registeredPaneID = null;
  let registeredViaItemPane = false;
  let renderGeneration = 0;

  function hasScannerAPI() {
    return Boolean(Zotero?.Items);
  }

  function getSectionRegistrar() {
    if (
      itemPane
      && typeof itemPane.registerSection === "function"
      && (typeof itemPane.isAvailable !== "function" || itemPane.isAvailable())
    ) {
      return {
        register: (config) => itemPane.registerSection(config),
        unregister: (paneID) => itemPane.unregisterSection?.(paneID),
        viaItemPane: true,
      };
    }

    if (Zotero?.ItemPaneManager && typeof Zotero.ItemPaneManager.registerSection === "function") {
      return {
        register: (config) => Zotero.ItemPaneManager.registerSection(config),
        unregister: (paneID) => Zotero.ItemPaneManager.unregisterSection?.(paneID),
        viaItemPane: false,
      };
    }

    return null;
  }

  function createSectionConfig() {
    return {
      paneID: SECTION_ID,
      pluginID: PLUGIN_ID,
      header: {
        l10nID: "toolsbox-section-backlinks",
        icon: "content/icons/icon-48.png",
      },
      sidenav: {
        l10nID: "toolsbox-section-backlinks",
        icon: "content/icons/icon-48.png",
        orderable: true,
      },
      label: translate(i18n, "toolsbox-section-backlinks", "Backlinks"),
      onItemChange({ setEnabled } = {}) {
        if (typeof setEnabled === "function") {
          setEnabled(true);
        }
      },
      onRender({ doc, body, item: currentItem } = {}) {
        renderGeneration += 1;
        return renderBacklinksSection({
          doc,
          body,
          item: currentItem,
          zotero: Zotero,
          i18n,
          limit,
          loading: Boolean(currentItem),
          scannerUnavailable: !hasScannerAPI(),
          onSelectSource: (backlink) => selectBacklinkSource(backlink, {
            zotero: Zotero,
            host,
            logger,
          }),
        });
      },
      async onAsyncRender({ doc, body, item: currentItem } = {}) {
        const generation = renderGeneration;
        if (!currentItem || !hasScannerAPI()) {
          return null;
        }
        const backlinks = await collectBacklinksForItemAsync(currentItem, Zotero, { limit });
        if (generation !== renderGeneration) {
          return null;
        }
        return renderBacklinksSection({
          doc,
          body,
          item: currentItem,
          zotero: Zotero,
          i18n,
          limit,
          graph: buildBacklinkGraphForItem(currentItem, backlinks, { limit }),
          onSelectSource: (backlink) => selectBacklinkSource(backlink, {
            zotero: Zotero,
            host,
            logger,
          }),
        });
      },
    };
  }

  function register() {
    if (registered) {
      return true;
    }

    if (!hasScannerAPI()) {
      logger?.warn?.("backlinks.register.skipped", { reason: "Items API not available" });
      return false;
    }

    const registrar = getSectionRegistrar();
    if (!registrar) {
      logger?.warn?.("backlinks.register.skipped", { reason: "ItemPane API not available" });
      return false;
    }

    const result = registrar.register(createSectionConfig());
    if (result === null || result === false) {
      logger?.warn?.("backlinks.register.skipped", { reason: "ItemPane registration rejected" });
      return false;
    }

    registered = true;
    registeredViaItemPane = registrar.viaItemPane;
    registeredPaneID = result || SECTION_ID;
    logger?.debug?.("backlinks.registered", {
      sectionID: SECTION_ID,
      registeredPaneID,
      viaItemPane: registeredViaItemPane,
    });
    return true;
  }

  function cleanup() {
    if (!registered) {
      return {
        stopped: true,
        resources: [],
      };
    }

    const registrar = getSectionRegistrar();
    if (registrar && typeof registrar.unregister === "function") {
      try {
        registrar.unregister(registeredPaneID || SECTION_ID);
      } catch (error) {
        logger?.warn?.("backlinks.cleanup.unregister.failed", {
          error: error?.message || String(error),
        });
      }
    }

    registered = false;
    registeredPaneID = null;
    registeredViaItemPane = false;
    return {
      stopped: true,
      resources: ["item-pane-section"],
    };
  }

  return {
    register,
    cleanup,
    destroy: cleanup,
    collectBacklinksForItem: (item, collectOptions = {}) => collectBacklinksForItem(item, Zotero, collectOptions),
    collectBacklinksForItemAsync: (item, collectOptions = {}) => collectBacklinksForItemAsync(item, Zotero, collectOptions),
    buildBacklinkGraphForItem: (item, backlinks, graphOptions = {}) => buildBacklinkGraphForItem(item, backlinks, {
      limit,
      ...graphOptions,
    }),
    selectBacklinkSource: (backlink, selectOptions = {}) => selectBacklinkSource(backlink, {
      zotero: Zotero,
      host,
      logger,
      ...selectOptions,
    }),
    render: (renderOptions = {}) => renderBacklinksSection({ ...renderOptions, zotero: Zotero, i18n, limit }),
    sectionID: SECTION_ID,
  };
}
