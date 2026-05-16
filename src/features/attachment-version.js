const DEFAULT_LIMIT = 25;
const SECTION_ID = "toolsbox-attachment-version";
const OWNER = "toolsbox-attachment-version";
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

function getField(item, field) {
  const direct = item?.[field];
  if (direct !== null && direct !== undefined && direct !== "") {
    return direct;
  }
  return safeCall(item?.getField, item, field);
}

function getItemID(item) {
  return item?.id ?? item?.itemID ?? null;
}

function getItemKey(item) {
  return normalizeText(item?.key || getField(item, "key"));
}

function getItemTitle(item) {
  return normalizeText(getField(item, "title"))
    || normalizeText(item?.title)
    || (getItemID(item) ? `Item ${getItemID(item)}` : "Untitled");
}

function isAttachment(item) {
  if (!item) {
    return false;
  }
  const explicit = safeCall(item?.isAttachment, item);
  if (explicit !== undefined) {
    return Boolean(explicit);
  }
  return normalizeText(item.itemType || getField(item, "itemType")) === "attachment";
}

function resolveLimit(options = {}) {
  return Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : DEFAULT_LIMIT;
}

function resolveItem(ref, zotero = {}) {
  if (!ref) {
    return null;
  }
  if (typeof ref === "object") {
    return ref;
  }
  return safeCall(zotero?.Items?.get, zotero.Items, ref) || null;
}

function getAttachmentParentItem(attachment, zotero = {}) {
  if (!attachment) {
    return null;
  }

  const parentID = attachment.parentID ?? safeCall(attachment?.getSource, attachment);
  if (!parentID) {
    return null;
  }
  return resolveItem(parentID, zotero);
}

function sameAttachment(left, right) {
  const leftID = getItemID(left);
  const rightID = getItemID(right);
  if (leftID !== null && rightID !== null) {
    return String(leftID) === String(rightID);
  }
  const leftKey = getItemKey(left);
  const rightKey = getItemKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

function collectAttachmentCandidates(item, zotero = {}) {
  if (!item) {
    return {
      contextItem: null,
      selectedAttachment: null,
      attachments: [],
      reason: "no-item",
    };
  }

  const selectedAttachment = isAttachment(item) ? item : null;
  const contextItem = selectedAttachment
    ? (getAttachmentParentItem(selectedAttachment, zotero) || selectedAttachment)
    : item;

  const attachmentRefs = selectedAttachment && contextItem === selectedAttachment
    ? [selectedAttachment]
    : safeCall(contextItem?.getAttachments, contextItem);

  if (attachmentRefs === undefined && !selectedAttachment) {
    return {
      contextItem,
      selectedAttachment,
      attachments: [],
      reason: "attachment-api-unavailable",
    };
  }

  const attachments = [];
  for (const ref of asArray(attachmentRefs)) {
    const attachment = resolveItem(ref, zotero);
    if (attachment && isAttachment(attachment)) {
      attachments.push(attachment);
    }
  }

  if (selectedAttachment && !attachments.some((attachment) => sameAttachment(attachment, selectedAttachment))) {
    attachments.push(selectedAttachment);
  }

  return {
    contextItem,
    selectedAttachment,
    attachments,
    reason: null,
  };
}

function normalizeDate(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    return normalized;
  }
  return new Date(timestamp).toISOString();
}

function normalizeAttachmentRow(attachment, selectedAttachment = null) {
  const id = getItemID(attachment);
  return {
    id,
    key: getItemKey(attachment),
    title: getItemTitle(attachment),
    contentType: normalizeText(
      attachment?.attachmentContentType
      ?? attachment?.contentType
      ?? getField(attachment, "attachmentContentType")
      ?? getField(attachment, "contentType"),
    ),
    linkMode: normalizeText(
      attachment?.attachmentLinkMode
      ?? attachment?.linkMode
      ?? getField(attachment, "attachmentLinkMode")
      ?? getField(attachment, "linkMode"),
    ),
    path: normalizeText(
      safeCall(attachment?.getFilePath, attachment)
      ?? attachment?.path
      ?? getField(attachment, "path"),
    ),
    dateAdded: normalizeDate(attachment?.dateAdded ?? getField(attachment, "dateAdded")),
    dateModified: normalizeDate(attachment?.dateModified ?? getField(attachment, "dateModified")),
    selected: selectedAttachment ? sameAttachment(attachment, selectedAttachment) : false,
  };
}

function compareAttachmentRows(left, right) {
  const leftModified = Date.parse(left.dateModified || left.dateAdded || "");
  const rightModified = Date.parse(right.dateModified || right.dateAdded || "");
  const leftTime = Number.isFinite(leftModified) ? leftModified : Number.NEGATIVE_INFINITY;
  const rightTime = Number.isFinite(rightModified) ? rightModified : Number.NEGATIVE_INFINITY;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  const titleCompare = left.title.localeCompare(right.title, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (titleCompare !== 0) {
    return titleCompare;
  }

  return String(left.id ?? left.key ?? "").localeCompare(String(right.id ?? right.key ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function buildAttachmentVersionRows(attachments = [], options = {}) {
  const limit = resolveLimit(options);
  const selectedAttachment = options.selectedAttachment || null;
  return asArray(attachments)
    .filter((attachment) => attachment && isAttachment(attachment))
    .map((attachment) => normalizeAttachmentRow(attachment, selectedAttachment))
    .sort(compareAttachmentRows)
    .slice(0, limit);
}

export function collectAttachmentVersionsForItem(item, zotero = {}, options = {}) {
  const limit = resolveLimit(options);
  const {
    contextItem,
    selectedAttachment,
    attachments,
    reason,
  } = collectAttachmentCandidates(item, zotero);
  const rows = buildAttachmentVersionRows(attachments, {
    limit,
    selectedAttachment,
  });
  const resolvedReason = reason
    || (attachments.length === 0
      ? "no-attachments"
      : (attachments.length === 1 ? "single-attachment" : null));

  return {
    itemID: getItemID(contextItem),
    itemTitle: contextItem ? getItemTitle(contextItem) : "",
    selectedAttachmentID: getItemID(selectedAttachment),
    attachments: rows,
    totalAttachmentCount: attachments.length,
    versionCount: rows.length,
    omittedAttachmentCount: Math.max(0, attachments.length - rows.length),
    reason: resolvedReason,
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

function renderEmpty(doc, root, i18n, key, fallback) {
  root.appendChild(createElement(
    doc,
    "div",
    "toolsbox-attachment-version-empty",
    translate(i18n, key, fallback),
  ));
}

function renderAttachmentRow(doc, list, row, i18n) {
  const entry = createElement(doc, "li", "toolsbox-attachment-version-entry");
  if (row.selected) {
    setAttribute(entry, "data-toolsbox-selected", "true");
  }
  if (row.id !== null && row.id !== undefined) {
    setAttribute(entry, "data-toolsbox-attachment-id", String(row.id));
  }

  entry.appendChild(createElement(doc, "div", "toolsbox-attachment-version-title", row.title));

  const metadataParts = [
    row.dateModified ? `${translate(i18n, "toolsbox-attachment-version-modified", "Modified")}: ${row.dateModified}` : "",
    row.contentType,
    row.linkMode,
    row.selected ? translate(i18n, "toolsbox-attachment-version-selected", "Selected") : "",
  ].filter(Boolean);

  entry.appendChild(createElement(
    doc,
    "div",
    "toolsbox-attachment-version-meta",
    metadataParts.join(" · "),
  ));

  if (row.path) {
    entry.appendChild(createElement(doc, "div", "toolsbox-attachment-version-path", row.path));
  }

  list.appendChild(entry);
}

export function renderAttachmentVersionSection({
  doc,
  body,
  item,
  zotero,
  i18n,
  limit = DEFAULT_LIMIT,
  collection = null,
} = {}) {
  if (!doc || typeof doc.createElement !== "function" || !body || typeof body.appendChild !== "function") {
    return null;
  }

  removeOwnedChildren(body);

  const root = createElement(doc, "div", "toolsbox-attachment-version");
  const versions = collection || collectAttachmentVersionsForItem(item, zotero, { limit });
  const countLabel = translate(i18n, "toolsbox-attachment-version-count", "local attachment versions");

  root.appendChild(createElement(
    doc,
    "div",
    "toolsbox-attachment-version-count",
    !item
      ? translate(i18n, "toolsbox-attachment-version-no-item", "No item selected")
      : versions.reason
        ? translateReason(i18n, versions.reason)
        : `${versions.versionCount} ${countLabel}`,
  ));

  if (!item) {
    renderEmpty(doc, root, i18n, "toolsbox-attachment-version-no-item", "No item selected");
  } else if (versions.reason === "attachment-api-unavailable") {
    renderEmpty(doc, root, i18n, "toolsbox-attachment-version-api-unavailable", "Attachment API unavailable");
  } else if (versions.reason === "no-attachments") {
    renderEmpty(doc, root, i18n, "toolsbox-attachment-version-no-attachments", "No local attachments");
  } else if (versions.reason === "single-attachment") {
    renderEmpty(doc, root, i18n, "toolsbox-attachment-version-single", "Only one local attachment");
  } else {
    const list = createElement(doc, "ul", "toolsbox-attachment-version-list");
    for (const row of versions.attachments) {
      renderAttachmentRow(doc, list, row, i18n);
    }
    root.appendChild(list);

    if (versions.omittedAttachmentCount > 0) {
      root.appendChild(createElement(
        doc,
        "div",
        "toolsbox-attachment-version-omitted",
        `${versions.omittedAttachmentCount} ${translate(i18n, "toolsbox-attachment-version-omitted", "attachments omitted")}`,
      ));
    }
  }

  body.appendChild(root);
  return root;
}

function translateReason(i18n, reason) {
  const reasonMap = {
    "no-item": ["toolsbox-attachment-version-no-item", "No item selected"],
    "attachment-api-unavailable": ["toolsbox-attachment-version-api-unavailable", "Attachment API unavailable"],
    "no-attachments": ["toolsbox-attachment-version-no-attachments", "No local attachments"],
    "single-attachment": ["toolsbox-attachment-version-single", "Only one local attachment"],
  };
  const [key, fallback] = reasonMap[reason] || ["toolsbox-attachment-version-empty", "No attachment versions"];
  return translate(i18n, key, fallback);
}

async function hydrateItemForAttachmentRead(item, zotero = {}) {
  if (!item || isAttachment(item)) {
    return item;
  }

  const itemID = getItemID(item);
  const candidates = [item];
  if (itemID && typeof zotero?.Items?.getAsync === "function") {
    try {
      const asyncItem = await zotero.Items.getAsync(itemID);
      if (asyncItem) {
        candidates.push(asyncItem);
      }
    } catch {}
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (typeof candidate.reload === "function") {
      try {
        await candidate.reload(["primaryData", "childItems"], true);
      } catch {}
    }
    const attachmentRefs = safeCall(candidate.getAttachments, candidate);
    if (asArray(attachmentRefs).length > 0) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1] || item;
}

export function createAttachmentVersion(options = {}) {
  const {
    logger,
    i18n,
    zotero,
    itemPane,
    limit = DEFAULT_LIMIT,
  } = options;
  const Zotero = zotero || globalThis.Zotero;
  let registered = false;
  let registeredPaneID = null;
  let renderGeneration = 0;

  function getSectionRegistrar() {
    if (
      itemPane
      && typeof itemPane.registerSection === "function"
      && (typeof itemPane.isAvailable !== "function" || itemPane.isAvailable())
    ) {
      return {
        register: (config) => itemPane.registerSection(config),
        unregister: (paneID) => itemPane.unregisterSection?.(paneID),
      };
    }

    if (Zotero?.ItemPaneManager && typeof Zotero.ItemPaneManager.registerSection === "function") {
      return {
        register: (config) => Zotero.ItemPaneManager.registerSection(config),
        unregister: (paneID) => Zotero.ItemPaneManager.unregisterSection?.(paneID),
      };
    }

    return null;
  }

  function createSectionConfig() {
    return {
      paneID: SECTION_ID,
      pluginID: PLUGIN_ID,
      header: {
        l10nID: "toolsbox-section-attachment-version",
        icon: "content/icons/icon-48.png",
      },
      sidenav: {
        l10nID: "toolsbox-section-attachment-version",
        icon: "content/icons/icon-48.png",
        orderable: true,
      },
      label: translate(i18n, "toolsbox-section-attachment-version", "Attachment Versions"),
      bodyXHTML: "",
      onItemChange({ item, setEnabled } = {}) {
        if (typeof setEnabled === "function") {
          setEnabled(Boolean(item));
        }
      },
      onRender({ doc, body, item: currentItem } = {}) {
        renderGeneration += 1;
        return renderAttachmentVersionSection({
          doc,
          body,
          item: currentItem,
          zotero: Zotero,
          i18n,
          limit,
        });
      },
      async onAsyncRender({ doc, body, item: currentItem } = {}) {
        const generation = renderGeneration;
        const hydratedItem = await hydrateItemForAttachmentRead(currentItem, Zotero);
        if (generation !== renderGeneration || getItemID(hydratedItem) !== getItemID(currentItem)) {
          return null;
        }
        return renderAttachmentVersionSection({
          doc,
          body,
          item: hydratedItem,
          zotero: Zotero,
          i18n,
          limit,
        });
      },
    };
  }

  function register() {
    if (registered) {
      return true;
    }

    const registrar = getSectionRegistrar();
    if (!registrar) {
      logger?.warn?.("attachmentVersion.register.skipped", { reason: "ItemPane API not available" });
      return false;
    }

    const result = registrar.register(createSectionConfig());
    if (result === null || result === false) {
      logger?.warn?.("attachmentVersion.register.skipped", { reason: "ItemPane registration rejected" });
      return false;
    }

    registered = true;
    registeredPaneID = result || SECTION_ID;
    logger?.debug?.("attachmentVersion.registered", {
      sectionID: SECTION_ID,
      registeredPaneID,
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
        logger?.warn?.("attachmentVersion.cleanup.unregister.failed", {
          error: error?.message || String(error),
        });
      }
    }

    registered = false;
    registeredPaneID = null;
    return {
      stopped: true,
      resources: ["item-pane-section"],
    };
  }

  return {
    register,
    cleanup,
    destroy: cleanup,
    collectAttachmentVersionsForItem: (item, collectOptions = {}) => (
      collectAttachmentVersionsForItem(item, Zotero, { limit, ...collectOptions })
    ),
    buildAttachmentVersionRows,
    render: (renderOptions = {}) => renderAttachmentVersionSection({
      ...renderOptions,
      zotero: Zotero,
      i18n,
      limit,
    }),
    sectionID: SECTION_ID,
  };
}
