const DEFAULT_LIMIT = 100;
const SECTION_ID = "toolsbox-merge-annotations";
const OWNER = "toolsbox-merge-annotations";
const PLUGIN_ID = "toolsbox@orlandozh.github";
const NOTE_MARKER_PREFIX = "toolsbox-merge-annotations-note";

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

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

function isNote(item) {
  if (!item) {
    return false;
  }
  const explicit = safeCall(item?.isNote, item);
  if (explicit !== undefined) {
    return Boolean(explicit);
  }
  return normalizeText(item.itemType || getField(item, "itemType")) === "note";
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function parsePosition(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function readPosition(annotation) {
  return parsePosition(
    annotation?.annotationPosition
    ?? annotation?.position
    ?? getField(annotation, "annotationPosition"),
  ) || {};
}

function normalizePageLabel(annotation, position, pageIndex) {
  return normalizeText(
    annotation?.annotationPageLabel
    ?? annotation?.pageLabel
    ?? position.pageLabel
    ?? getField(annotation, "annotationPageLabel"),
  ) || (pageIndex !== null ? String(pageIndex + 1) : "Unknown page");
}

function normalizeSortIndex(annotation, position, fallbackIndex) {
  return toFiniteNumber(
    annotation?.annotationSortIndex
    ?? annotation?.sortIndex
    ?? annotation?.order
    ?? position.sortIndex
    ?? position.order,
  ) ?? fallbackIndex;
}

function normalizeAnnotation(annotation, attachment, index) {
  const position = readPosition(annotation);
  const pageIndex = toFiniteNumber(
    annotation?.annotationPageIndex
    ?? annotation?.pageIndex
    ?? position.pageIndex,
  );
  const pageLabel = normalizePageLabel(annotation, position, pageIndex);
  const text = normalizeText(
    annotation?.annotationText
    ?? annotation?.text
    ?? getField(annotation, "annotationText"),
  );
  const comment = normalizeText(
    annotation?.annotationComment
    ?? annotation?.comment
    ?? getField(annotation, "annotationComment"),
  );

  return {
    id: getItemID(annotation) ?? annotation?.annotationID ?? index,
    key: normalizeText(annotation?.key),
    attachmentID: getItemID(attachment),
    attachmentTitle: getItemTitle(attachment),
    type: normalizeText(annotation?.annotationType ?? annotation?.itemType),
    color: normalizeText(annotation?.annotationColor ?? annotation?.color),
    pageIndex,
    pageLabel,
    order: normalizeSortIndex(annotation, position, index),
    text,
    comment,
  };
}

function compareAnnotations(left, right) {
  const leftPage = left.pageIndex === null ? Number.POSITIVE_INFINITY : left.pageIndex;
  const rightPage = right.pageIndex === null ? Number.POSITIVE_INFINITY : right.pageIndex;
  if (leftPage !== rightPage) {
    return leftPage - rightPage;
  }

  const pageLabel = left.pageLabel.localeCompare(right.pageLabel, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (pageLabel !== 0) {
    return pageLabel;
  }

  if (left.order !== right.order) {
    return left.order - right.order;
  }

  return String(left.id).localeCompare(String(right.id), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function collectAttachmentCandidates(item, zotero) {
  if (!item) {
    return [];
  }

  if (isAttachment(item)) {
    return [item];
  }

  const attachmentRefs = asArray(safeCall(item?.getAttachments, item));
  const attachments = [];
  for (const ref of attachmentRefs) {
    const attachment = typeof ref === "object"
      ? ref
      : safeCall(zotero?.Items?.get, zotero.Items, ref);
    if (attachment && (isAttachment(attachment) || typeof attachment.getAnnotations === "function")) {
      attachments.push(attachment);
    }
  }
  return attachments;
}

function getWritebackParentItem(item, zotero) {
  if (!item) {
    return null;
  }
  if (!isAttachment(item)) {
    return item;
  }

  const parentID = item.parentID ?? safeCall(item?.getSource, item);
  if (!parentID) {
    return item;
  }

  return safeCall(zotero?.Items?.get, zotero.Items, parentID) || item;
}

function readAttachmentAnnotations(attachment, zotero, reader) {
  const attachmentID = getItemID(attachment);
  const sources = [
    () => safeCall(reader?.getAnnotations, reader, attachmentID),
    () => safeCall(attachment?.getAnnotations, attachment),
    () => safeCall(zotero?.Annotations?.getByItemID, zotero.Annotations, attachmentID),
  ];

  for (const source of sources) {
    const annotations = source();
    if (annotations && typeof annotations.then === "function") {
      continue;
    }
    if (annotations !== undefined) {
      return {
        available: true,
        annotations: asArray(annotations).filter(Boolean),
      };
    }
  }

  return {
    available: false,
    annotations: [],
  };
}

export function collectAnnotationSnapshotsForItem(item, zotero = {}, reader = null, options = {}) {
  const attachments = collectAttachmentCandidates(item, zotero);
  const snapshots = [];
  let annotationAPIObserved = false;

  for (const attachment of attachments) {
    const result = readAttachmentAnnotations(attachment, zotero, reader);
    annotationAPIObserved = annotationAPIObserved || result.available;
    result.annotations.forEach((annotation, index) => {
      snapshots.push(normalizeAnnotation(annotation, attachment, snapshots.length + index));
    });
  }

  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : DEFAULT_LIMIT;

  return {
    itemID: getItemID(item),
    itemTitle: item ? getItemTitle(item) : "",
    attachments: attachments.map((attachment) => ({
      id: getItemID(attachment),
      title: getItemTitle(attachment),
    })),
    annotations: snapshots.slice(0, limit),
    totalAnnotationCount: snapshots.length,
    omittedAnnotationCount: Math.max(0, snapshots.length - limit),
    reason: !item
      ? "no-item"
      : (attachments.length === 0
        ? "no-attachments"
        : (!annotationAPIObserved ? "annotation-api-unavailable" : null)),
  };
}

export function mergeAnnotationSnapshots(snapshots = [], options = {}) {
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : DEFAULT_LIMIT;
  const mergeable = asArray(snapshots)
    .filter((snapshot) => normalizeText(snapshot?.text) || normalizeText(snapshot?.comment))
    .slice()
    .sort(compareAnnotations)
    .slice(0, limit);

  const groups = [];
  const groupByKey = new Map();
  for (const annotation of mergeable) {
    const key = `${annotation.pageIndex ?? "unknown"}:${annotation.pageLabel}`;
    if (!groupByKey.has(key)) {
      const group = {
        pageIndex: annotation.pageIndex,
        pageLabel: annotation.pageLabel,
        annotations: [],
      };
      groupByKey.set(key, group);
      groups.push(group);
    }
    groupByKey.get(key).annotations.push(annotation);
  }

  const text = groups
    .map((group) => {
      const lines = [`Page ${group.pageLabel}`];
      for (const annotation of group.annotations) {
        if (annotation.text) {
          lines.push(annotation.text);
        }
        if (annotation.comment) {
          lines.push(`Note: ${annotation.comment}`);
        }
      }
      return lines.join("\n");
    })
    .join("\n\n");

  return {
    groups,
    text,
    totalCount: asArray(snapshots).length,
    mergeableCount: mergeable.length,
    omittedCount: Math.max(0, asArray(snapshots).length - mergeable.length),
    pageCount: groups.length,
  };
}

function buildNoteMarker(sourceID) {
  return `${NOTE_MARKER_PREFIX}:source=${sourceID ?? "unknown"}`;
}

function getNoteHTML(note) {
  return normalizeText(
    safeCall(note?.getNote, note)
    ?? note?.note
    ?? getField(note, "note")
    ?? getField(note, "abstractNote"),
  );
}

function readChildNotes(parentItem, zotero) {
  const noteRefs = asArray(safeCall(parentItem?.getNotes, parentItem));
  return noteRefs
    .map((noteRef) => (typeof noteRef === "object"
      ? noteRef
      : safeCall(zotero?.Items?.get, zotero.Items, noteRef)))
    .filter((note) => note && isNote(note));
}

export function findOwnedMergedAnnotationNote(item, zotero = {}) {
  const sourceID = getItemID(item);
  const marker = buildNoteMarker(sourceID);
  const parentItem = getWritebackParentItem(item, zotero);
  const notes = readChildNotes(parentItem, zotero);
  return notes.find((note) => getNoteHTML(note).includes(marker)) || null;
}

export function buildMergedAnnotationNoteHTML({
  item,
  collection,
  merged,
  generatedAt = new Date().toISOString(),
} = {}) {
  const sourceID = collection?.itemID ?? getItemID(item);
  const marker = buildNoteMarker(sourceID);
  const title = collection?.itemTitle || (item ? getItemTitle(item) : "Untitled");
  const attachments = asArray(collection?.attachments);
  const groups = asArray(merged?.groups);
  const generatedLine = generatedAt ? `<p><strong>Generated:</strong> ${escapeHTML(generatedAt)}</p>` : "";
  const attachmentLine = attachments.length > 0
    ? `<p><strong>Attachments:</strong> ${escapeHTML(attachments.map((entry) => entry.title || entry.id).join(", "))}</p>`
    : "";

  const pages = groups.map((group) => {
    const annotations = asArray(group.annotations).map((annotation) => {
      const text = annotation.text
        ? `<blockquote>${escapeHTML(annotation.text)}</blockquote>`
        : "";
      const comment = annotation.comment
        ? `<p><strong>Note:</strong> ${escapeHTML(annotation.comment)}</p>`
        : "";
      const source = annotation.attachmentTitle
        ? `<p><small>Attachment: ${escapeHTML(annotation.attachmentTitle)}</small></p>`
        : "";
      return `<li>${text}${comment}${source}</li>`;
    }).join("");
    return `<h2>Page ${escapeHTML(group.pageLabel)}</h2><ol>${annotations}</ol>`;
  }).join("");

  return [
    `<!-- ${marker} -->`,
    `<h1>Merge Annotations: ${escapeHTML(title)}</h1>`,
    `<p><strong>Source item:</strong> ${escapeHTML(title)}</p>`,
    `<p><strong>Mergeable annotations:</strong> ${escapeHTML(merged?.mergeableCount ?? 0)}</p>`,
    `<p><strong>Pages:</strong> ${escapeHTML(merged?.pageCount ?? 0)}</p>`,
    attachmentLine,
    generatedLine,
    pages,
  ].filter(Boolean).join("\n");
}

function createNoteItem(zotero) {
  if (typeof zotero?.Item === "function") {
    return new zotero.Item("note");
  }
  if (typeof zotero?.Items?.create === "function") {
    return zotero.Items.create("note");
  }
  return null;
}

function setNoteHTML(note, html) {
  if (typeof note?.setNote === "function") {
    note.setNote(html);
    return true;
  }
  if (typeof note?.setField === "function") {
    note.setField("note", html);
    return true;
  }
  if (note && typeof note === "object") {
    note.note = html;
    return true;
  }
  return false;
}

async function saveNoteItem(note) {
  if (typeof note?.saveTx === "function") {
    return note.saveTx();
  }
  if (typeof note?.save === "function") {
    return note.save();
  }
  return undefined;
}

function hasSaveAPI(note) {
  return typeof note?.saveTx === "function" || typeof note?.save === "function";
}

export async function writeMergedAnnotationNoteForItem(item, zotero = {}, reader = null, options = {}) {
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : DEFAULT_LIMIT;

  if (!item) {
    return { ok: false, reason: "no-item" };
  }

  try {
    const collection = collectAnnotationSnapshotsForItem(item, zotero, reader, { limit });
    if (collection.reason) {
      return { ok: false, reason: collection.reason };
    }

    const merged = mergeAnnotationSnapshots(collection.annotations, { limit });
    if (merged.mergeableCount === 0) {
      return { ok: false, reason: "no-text" };
    }

    const parentItem = getWritebackParentItem(item, zotero);
    const parentID = getItemID(parentItem);
    if (!parentItem || !parentID) {
      return { ok: false, reason: "no-writeback-parent" };
    }

    const existingNote = findOwnedMergedAnnotationNote(item, zotero);
    const note = existingNote || createNoteItem(zotero);
    if (!note) {
      return { ok: false, reason: "note-api-unavailable" };
    }
    if (!hasSaveAPI(note)) {
      return { ok: false, reason: "note-save-unavailable" };
    }

    const html = buildMergedAnnotationNoteHTML({
      item,
      collection,
      merged,
      generatedAt: options.generatedAt,
    });

    if (!existingNote) {
      note.parentID = parentID;
    }

    if (!setNoteHTML(note, html)) {
      return { ok: false, reason: "note-content-unavailable" };
    }

    const savedID = await saveNoteItem(note);
    return {
      ok: true,
      action: existingNote ? "updated" : "created",
      noteID: getItemID(note) ?? savedID ?? null,
      parentID,
      mergeableCount: merged.mergeableCount,
      pageCount: merged.pageCount,
    };
  } catch (error) {
    options.logger?.warn?.("mergeAnnotations.writeback.failed", {
      error: error?.message || String(error),
    });
    return {
      ok: false,
      reason: "writeback-failed",
      error: error?.message || String(error),
    };
  }
}

function setAttribute(node, name, value) {
  if (node && typeof node.setAttribute === "function") {
    node.setAttribute(name, value);
  }
  if (node?.dataset && name === "data-toolsbox-owner") {
    node.dataset.toolsboxOwner = value;
  }
}

function createElement(doc, tagName, className, textContent = "") {
  const node = doc.createElement(tagName);
  if (className) {
    node.className = className;
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
    "toolsbox-merge-annotations-empty",
    translate(i18n, key, fallback),
  ));
}

function attachClick(node, handler) {
  if (typeof node?.addEventListener === "function") {
    node.addEventListener("click", handler);
    return;
  }
  if (node) {
    node.onclick = handler;
  }
}

async function hydrateItemForAnnotationRead(item, zotero = {}) {
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

export function renderMergeAnnotationsSection({
  doc,
  body,
  item,
  zotero,
  reader,
  i18n,
  limit = DEFAULT_LIMIT,
  onWriteNote,
} = {}) {
  if (!doc || typeof doc.createElement !== "function" || !body || typeof body.appendChild !== "function") {
    return null;
  }

  removeOwnedChildren(body);

  const root = createElement(doc, "div", "toolsbox-merge-annotations");
  const collection = collectAnnotationSnapshotsForItem(item, zotero, reader, { limit });
  const merged = mergeAnnotationSnapshots(collection.annotations, { limit });

  root.appendChild(createElement(
    doc,
    "div",
    "toolsbox-merge-annotations-count",
    item
      ? `${merged.mergeableCount} ${translate(i18n, "toolsbox-merge-annotations-count", "mergeable annotations")}`
      : translate(i18n, "toolsbox-merge-annotations-no-item", "No item selected"),
  ));

  if (!item) {
    renderEmpty(doc, root, i18n, "toolsbox-merge-annotations-no-item", "No item selected");
  } else if (collection.reason === "no-attachments") {
    renderEmpty(doc, root, i18n, "toolsbox-merge-annotations-no-attachments", "No attachment annotations");
  } else if (collection.reason === "annotation-api-unavailable") {
    renderEmpty(doc, root, i18n, "toolsbox-merge-annotations-api-unavailable", "Annotation API unavailable");
  } else if (collection.annotations.length === 0) {
    renderEmpty(doc, root, i18n, "toolsbox-merge-annotations-no-annotations", "No annotations found");
  } else if (merged.mergeableCount === 0) {
    renderEmpty(doc, root, i18n, "toolsbox-merge-annotations-no-text", "No text annotations to merge");
  } else {
    const preview = createElement(doc, "div", "toolsbox-merge-annotations-preview");
    for (const group of merged.groups) {
      const groupNode = createElement(doc, "section", "toolsbox-merge-annotations-page");
      groupNode.appendChild(createElement(doc, "h4", "toolsbox-merge-annotations-page-label", `Page ${group.pageLabel}`));
      const list = createElement(doc, "ol", "toolsbox-merge-annotations-list");
      for (const annotation of group.annotations) {
        const entry = createElement(doc, "li", "toolsbox-merge-annotations-entry");
        if (annotation.text) {
          entry.appendChild(createElement(doc, "div", "toolsbox-merge-annotations-text", annotation.text));
        }
        if (annotation.comment) {
          entry.appendChild(createElement(doc, "div", "toolsbox-merge-annotations-comment", `Note: ${annotation.comment}`));
        }
        list.appendChild(entry);
      }
      groupNode.appendChild(list);
      preview.appendChild(groupNode);
    }
    root.appendChild(preview);

    if (typeof onWriteNote === "function") {
      const actions = createElement(doc, "div", "toolsbox-merge-annotations-actions");
      const status = createElement(doc, "div", "toolsbox-merge-annotations-writeback-status");
      const button = createElement(
        doc,
        "button",
        "toolsbox-merge-annotations-writeback-button",
        translate(i18n, "toolsbox-merge-annotations-write-note", "Write merged note"),
      );
      button.type = "button";
      setAttribute(button, "data-toolsbox-action", "write-merged-note");
      attachClick(button, () => {
        button.disabled = true;
        status.textContent = translate(i18n, "toolsbox-merge-annotations-write-running", "Writing merged note...");
        Promise.resolve(onWriteNote(item))
          .then((result) => {
            status.textContent = result?.ok
              ? translate(i18n, "toolsbox-merge-annotations-write-success", "Merged note written")
              : translate(i18n, "toolsbox-merge-annotations-write-failed", "Unable to write merged note");
          })
          .catch(() => {
            status.textContent = translate(i18n, "toolsbox-merge-annotations-write-failed", "Unable to write merged note");
          })
          .finally(() => {
            button.disabled = false;
          });
      });
      actions.appendChild(button);
      actions.appendChild(status);
      root.appendChild(actions);
    }
  }

  body.appendChild(root);
  return root;
}

export function createMergeAnnotations(options = {}) {
  const {
    logger,
    i18n,
    zotero,
    reader,
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
        l10nID: "toolsbox-section-merge-annotations",
        icon: "content/icons/icon-48.png",
      },
      sidenav: {
        l10nID: "toolsbox-section-merge-annotations",
        icon: "content/icons/icon-48.png",
        orderable: true,
      },
      label: translate(i18n, "toolsbox-section-merge-annotations", "Merge Annotations"),
      bodyXHTML: "",
      onItemChange({ item, setEnabled } = {}) {
        if (typeof setEnabled === "function") {
          setEnabled(Boolean(item));
        }
      },
      onRender({ doc, body, item: currentItem } = {}) {
        renderGeneration += 1;
        return renderMergeAnnotationsSection({
          doc,
          body,
          item: currentItem,
          zotero: Zotero,
          reader,
          i18n,
          limit,
          onWriteNote: (item) => writeMergedAnnotationNoteForItem(item, Zotero, reader, {
            limit,
            logger,
          }),
        });
      },
      async onAsyncRender({ doc, body, item: currentItem } = {}) {
        const generation = renderGeneration;
        const hydratedItem = await hydrateItemForAnnotationRead(currentItem, Zotero);
        if (generation !== renderGeneration || getItemID(hydratedItem) !== getItemID(currentItem)) {
          return null;
        }
        return renderMergeAnnotationsSection({
          doc,
          body,
          item: hydratedItem,
          zotero: Zotero,
          reader,
          i18n,
          limit,
          onWriteNote: (item) => writeMergedAnnotationNoteForItem(item, Zotero, reader, {
            limit,
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

    const registrar = getSectionRegistrar();
    if (!registrar) {
      logger?.warn?.("mergeAnnotations.register.skipped", { reason: "ItemPane API not available" });
      return false;
    }

    const result = registrar.register(createSectionConfig());
    if (result === null || result === false) {
      logger?.warn?.("mergeAnnotations.register.skipped", { reason: "ItemPane registration rejected" });
      return false;
    }

    registered = true;
    registeredPaneID = result || SECTION_ID;
    logger?.debug?.("mergeAnnotations.registered", {
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
        logger?.warn?.("mergeAnnotations.cleanup.unregister.failed", {
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
    collectAnnotationSnapshotsForItem: (item, collectOptions = {}) => (
      collectAnnotationSnapshotsForItem(item, Zotero, reader, collectOptions)
    ),
    mergeAnnotationSnapshots,
    findOwnedMergedAnnotationNote: (item) => findOwnedMergedAnnotationNote(item, Zotero),
    buildMergedAnnotationNoteHTML,
    writeMergedAnnotationNoteForItem: (item, writeOptions = {}) => (
      writeMergedAnnotationNoteForItem(item, Zotero, reader, { limit, logger, ...writeOptions })
    ),
    render: (renderOptions = {}) => renderMergeAnnotationsSection({
      ...renderOptions,
      zotero: Zotero,
      reader,
      i18n,
      limit,
      onWriteNote: renderOptions.onWriteNote,
    }),
    sectionID: SECTION_ID,
  };
}
