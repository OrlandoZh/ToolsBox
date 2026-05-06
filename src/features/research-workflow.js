import {
  RESEARCH_WORKFLOW_PREF_KEYS,
  applyWorkflowStateBatch,
  applyWorkflowStateToItem,
  buildWorkflowContext,
  clearWorkflowStateBatch,
  clearWorkflowStateFromItem,
  getWorkflowState,
  readBooleanWorkflowPref,
} from "./workflow-state.js";

function t(i18n, key, fallback) {
  if (i18n && typeof i18n.t === "function") {
    return i18n.t(key, fallback);
  }
  return fallback;
}

function isWorkflowEnabled(prefs, key = null) {
  if (!readBooleanWorkflowPref(prefs, RESEARCH_WORKFLOW_PREF_KEYS.enabled, true)) {
    return false;
  }
  return key ? readBooleanWorkflowPref(prefs, key, true) : true;
}

function normalizeItems(context = {}) {
  if (Array.isArray(context?.items)) {
    return context.items.filter(Boolean);
  }
  if (context?.item) {
    return [context.item];
  }
  return [];
}

function runAsync(logger, task, details = {}) {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      if (logger && typeof logger.error === "function") {
        logger.error("researchWorkflow.action.failed", {
          ...details,
          message: String(error?.message || error),
        });
      }
    });
}

function createElement(doc, tagName) {
  if (doc && typeof doc.createElement === "function") {
    return doc.createElement(tagName);
  }
  return {
    tagName,
    childNodes: [],
    attributes: {},
    value: "",
    textContent: "",
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    appendChild(child) {
      this.childNodes.push(child);
      return child;
    },
    addEventListener(type, listener) {
      this[`on${type}`] = listener;
    },
  };
}

function setAttribute(element, name, value) {
  if (element && typeof element.setAttribute === "function") {
    element.setAttribute(name, String(value));
  }
  else if (element) {
    element[name] = String(value);
  }
}

function append(parent, child) {
  if (parent && typeof parent.appendChild === "function") {
    parent.appendChild(child);
  }
}

function clearChildren(element) {
  if (!element) {
    return;
  }
  if (typeof element.replaceChildren === "function") {
    element.replaceChildren();
    return;
  }
  if (Array.isArray(element.childNodes)) {
    element.childNodes.length = 0;
  }
  else {
    element.textContent = "";
  }
}

function createField(doc, { id, label, value = "", multiline = false, type = "text" }) {
  const row = createElement(doc, "div");
  setAttribute(row, "data-toolsbox-workflow-row", id);
  const labelElement = createElement(doc, "label");
  labelElement.textContent = label;
  setAttribute(labelElement, "for", id);
  const input = createElement(doc, multiline ? "textarea" : "input");
  setAttribute(input, "id", id);
  setAttribute(input, "data-toolsbox-workflow-field", id);
  if (!multiline) {
    setAttribute(input, "type", type);
  }
  input.value = value;
  append(row, labelElement);
  append(row, input);
  return { row, input };
}

function createButton(doc, { id, label, onCommand }) {
  const button = createElement(doc, "button");
  setAttribute(button, "type", "button");
  setAttribute(button, "data-toolsbox-workflow-action", id);
  button.textContent = label;
  if (typeof button.addEventListener === "function") {
    button.addEventListener("click", onCommand);
    button.addEventListener("command", onCommand);
  }
  else {
    button.onclick = onCommand;
    button.oncommand = onCommand;
  }
  return button;
}

function callMaybe(target, method, args = []) {
  try {
    const fn = target && typeof target[method] === "function" ? target[method] : null;
    return fn ? fn.apply(target, args) : null;
  }
  catch {
    return null;
  }
}

function countArrayLike(value) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object" && Number.isFinite(value.length)) {
    return Number(value.length);
  }
  return 0;
}

function buildLocalItemSummary(item, state) {
  const attachments = callMaybe(item, "getAttachments") || item?.attachments || [];
  const relations = callMaybe(item, "getRelations") || item?.relations || {};
  const relatedItems = callMaybe(item, "getRelatedItems") || item?.relatedItems || [];
  const relationCount = relations && typeof relations === "object" && !Array.isArray(relations)
    ? Object.values(relations).reduce((count, value) => count + countArrayLike(value), 0)
    : countArrayLike(relations);
  return {
    attachments: countArrayLike(attachments),
    relatedItems: countArrayLike(relatedItems),
    relations: relationCount,
    tags: countArrayLike(state.tags),
    status: state.status || "-",
    remark: state.remark || "-",
  };
}

function summarizeWorkflowItems(items, context) {
  const sourceItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const summary = {
    total: sourceItems.length,
    todo: 0,
    reading: 0,
    done: 0,
    missingAttachments: 0,
    missingRemark: 0,
    ratings: new Map(),
    tags: new Map(),
  };

  for (const item of sourceItems) {
    const state = getWorkflowState(item, { context });
    const status = String(state.readStatus || state.status || "").toLowerCase();
    if (status === "todo" || status === "unread") {
      summary.todo += 1;
    }
    if (status === "reading") {
      summary.reading += 1;
    }
    if (status === "done" || status === "read" || status === "reviewed") {
      summary.done += 1;
    }
    if (state.rating) {
      summary.ratings.set(state.rating, (summary.ratings.get(state.rating) || 0) + 1);
    }
    for (const tag of state.textTags) {
      summary.tags.set(tag, (summary.tags.get(tag) || 0) + 1);
    }
    const attachments = callMaybe(item, "getAttachments") || item?.attachments || [];
    if (countArrayLike(attachments) === 0) {
      summary.missingAttachments += 1;
    }
    if (!state.remark) {
      summary.missingRemark += 1;
    }
  }

  return summary;
}

function formatTopMapEntries(map, limit = 3) {
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0]), "en"))
    .slice(0, limit)
    .map(([key, count]) => `${key}:${count}`)
    .join(", ");
}

function formatCollectionSummary(items, context, i18n) {
  const summary = summarizeWorkflowItems(items, context);
  const ratingSummary = formatTopMapEntries(summary.ratings);
  const tagSummary = formatTopMapEntries(summary.tags);
  const parts = [
    `${t(i18n, "cleanroom-workflow-stat-total", "Total")}:${summary.total}`,
    `${t(i18n, "cleanroom-workflow-stat-todo", "To read")}:${summary.todo}`,
    `${t(i18n, "cleanroom-workflow-stat-reading", "Reading")}:${summary.reading}`,
    `${t(i18n, "cleanroom-workflow-stat-done", "Done")}:${summary.done}`,
    `${t(i18n, "cleanroom-workflow-stat-missing-attachments", "No attachments")}:${summary.missingAttachments}`,
    `${t(i18n, "cleanroom-workflow-stat-missing-remark", "No remarks")}:${summary.missingRemark}`,
  ];
  if (ratingSummary) {
    parts.push(`${t(i18n, "cleanroom-workflow-stat-ratings", "Ratings")}:${ratingSummary}`);
  }
  if (tagSummary) {
    parts.push(`${t(i18n, "cleanroom-workflow-stat-tags", "Tags")}:${tagSummary}`);
  }
  return parts.join(" | ");
}

function appendSummaryLine(doc, parent, label, value) {
  const line = createElement(doc, "div");
  setAttribute(line, "data-toolsbox-workflow-summary-line", label);
  line.textContent = `${label}: ${value}`;
  append(parent, line);
}

function renderLocalSummary(doc, state, item, i18n) {
  const summary = buildLocalItemSummary(item, state);
  const root = createElement(doc, "div");
  setAttribute(root, "data-toolsbox-workflow-summary", "true");
  const title = createElement(doc, "strong");
  title.textContent = t(i18n, "cleanroom-workflow-summary-title", "Local summary");
  append(root, title);
  appendSummaryLine(doc, root, t(i18n, "cleanroom-workflow-summary-attachments", "Attachments"), summary.attachments);
  appendSummaryLine(doc, root, t(i18n, "cleanroom-workflow-summary-related", "Related"), summary.relatedItems);
  appendSummaryLine(doc, root, t(i18n, "cleanroom-workflow-summary-relations", "Relations"), summary.relations);
  appendSummaryLine(doc, root, t(i18n, "cleanroom-workflow-summary-tags", "Tags"), summary.tags);
  appendSummaryLine(doc, root, t(i18n, "cleanroom-workflow-summary-status", "Status"), summary.status);
  appendSummaryLine(doc, root, t(i18n, "cleanroom-workflow-summary-remark", "Remark"), summary.remark);
  return root;
}

function renderWorkflowEditor({ doc, body, item, prefs, i18n, logger }) {
  clearChildren(body);
  const context = buildWorkflowContext(prefs);
  const state = getWorkflowState(item, { context });
  const root = createElement(doc, "div");
  setAttribute(root, "data-toolsbox-workflow-editor", "true");

  if (!item) {
    const empty = createElement(doc, "div");
    empty.textContent = t(i18n, "cleanroom-workflow-empty", "Select an item to edit workflow fields.");
    append(root, empty);
    append(body, root);
    return;
  }

  const status = createField(doc, {
    id: "toolsbox-workflow-status",
    label: t(i18n, "cleanroom-workflow-field-status", "Status"),
    value: state.status,
  });
  const rating = createField(doc, {
    id: "toolsbox-workflow-rating",
    label: t(i18n, "cleanroom-workflow-field-rating", "Rating"),
    value: state.rating ? String(state.rating) : "",
    type: "number",
  });
  const readStatus = createField(doc, {
    id: "toolsbox-workflow-read-status",
    label: t(i18n, "cleanroom-workflow-field-read-status", "Read status"),
    value: state.readStatus,
  });
  const progress = createField(doc, {
    id: "toolsbox-workflow-progress",
    label: t(i18n, "cleanroom-workflow-field-progress", "Progress"),
    value: state.progress,
  });
  const textTags = createField(doc, {
    id: "toolsbox-workflow-text-tags",
    label: t(i18n, "cleanroom-workflow-field-text-tags", "Text tags"),
    value: state.textTags.join(", "),
  });
  const remark = createField(doc, {
    id: "toolsbox-workflow-remark",
    label: t(i18n, "cleanroom-workflow-field-remark", "Remark"),
    value: state.remark,
    multiline: true,
  });

  [
    status.row,
    rating.row,
    readStatus.row,
    progress.row,
    textTags.row,
    remark.row,
  ].forEach((row) => append(root, row));
  append(root, renderLocalSummary(doc, state, item, i18n));

  const actions = createElement(doc, "div");
  setAttribute(actions, "data-toolsbox-workflow-actions", "true");
  append(actions, createButton(doc, {
    id: "save",
    label: t(i18n, "cleanroom-workflow-save", "Save"),
    onCommand() {
      runAsync(logger, () => applyWorkflowStateToItem(item, {
        status: status.input.value,
        rating: rating.input.value,
        readStatus: readStatus.input.value,
        progress: progress.input.value,
        textTags: textTags.input.value,
        remark: remark.input.value,
      }, { context }), {
        surface: "item-pane",
      });
    },
  }));
  append(actions, createButton(doc, {
    id: "clear",
    label: t(i18n, "cleanroom-workflow-clear", "Clear"),
    onCommand() {
      runAsync(logger, () => clearWorkflowStateFromItem(item, { context }), {
        surface: "item-pane",
      });
    },
  }));
  append(root, actions);
  append(body, root);
}

export function registerWorkflowItemPane({ itemPane, prefs, i18n, logger, addonRef }) {
  if (!itemPane || typeof itemPane.registerSection !== "function") {
    return null;
  }
  if (!isWorkflowEnabled(prefs, RESEARCH_WORKFLOW_PREF_KEYS.itemPaneEnabled)) {
    return null;
  }
  return itemPane.registerSection({
    paneID: `${addonRef || "toolsbox"}-workflow`,
    header: {
      l10nID: "cleanroom-workflow-section-header",
    },
    sidenav: {
      l10nID: "cleanroom-workflow-section-sidenav",
      orderable: true,
    },
    onItemChange({ item, setEnabled }) {
      if (typeof setEnabled === "function") {
        setEnabled(Boolean(item) && isWorkflowEnabled(prefs, RESEARCH_WORKFLOW_PREF_KEYS.itemPaneEnabled));
      }
    },
    onRender({ doc, body, item }) {
      renderWorkflowEditor({
        doc,
        body,
        item,
        prefs,
        i18n,
        logger,
      });
    },
  });
}

function createStatusMenuItems({ context, i18n, logger }) {
  return context.availableStatuses.slice(0, 6).map((status) => ({
    label: `${t(i18n, "cleanroom-workflow-menu-set-status", "Set status")}: ${status}`,
    onCommand(_event, menuContext) {
      const items = normalizeItems(menuContext);
      runAsync(logger, () => applyWorkflowStateBatch(items, { status }, { context }), {
        surface: "item-menu",
        action: "status",
        status,
      });
    },
  }));
}

function createRatingMenuItems({ context, i18n, logger }) {
  return [1, 3, 5].map((rating) => ({
    label: `${t(i18n, "cleanroom-workflow-menu-set-rating", "Set rating")}: ${context.ratingSelectedMark.repeat(rating)}`,
    onCommand(_event, menuContext) {
      const items = normalizeItems(menuContext);
      runAsync(logger, () => applyWorkflowStateBatch(items, { rating }, { context }), {
        surface: "item-menu",
        action: "rating",
        rating,
      });
    },
  }));
}

function createCommonMenuItems({ context, i18n, logger }) {
  return [
    {
      label: `${t(i18n, "cleanroom-workflow-menu-add-tag", "Add text tag")}: focus`,
      onCommand(_event, menuContext) {
        const items = normalizeItems(menuContext);
        runAsync(logger, () => applyWorkflowStateBatch(items, { textTags: ["focus"] }, { context }), {
          surface: "workflow-menu",
          action: "text-tag",
        });
      },
    },
    {
      label: t(i18n, "cleanroom-workflow-menu-set-remark", "Set remark: Needs follow-up"),
      onCommand(_event, menuContext) {
        const items = normalizeItems(menuContext);
        runAsync(logger, () => applyWorkflowStateBatch(items, { remark: "Needs follow-up" }, { context }), {
          surface: "workflow-menu",
          action: "remark",
        });
      },
    },
    {
      label: t(i18n, "cleanroom-workflow-menu-clear", "Clear workflow fields"),
      onCommand(_event, menuContext) {
        const items = normalizeItems(menuContext);
        runAsync(logger, () => clearWorkflowStateBatch(items, { context }), {
          surface: "workflow-menu",
          action: "clear",
        });
      },
    },
  ];
}

function buildWorkflowMenu({ menuManager, prefs, i18n, logger, target, id, l10nID, collectionMode = false }) {
  if (!menuManager || typeof menuManager.registerStateDrivenMenu !== "function") {
    return null;
  }
  const menuTypes = menuManager.MENU_TYPES || {};
  return menuManager.registerStateDrivenMenu({
    id,
    target,
    baseMenu: {
      menuType: menuTypes.SUBMENU || "submenu",
      l10nID,
      menus: [],
    },
    resolveState(menuContext) {
      const items = normalizeItems(menuContext);
      return {
        items,
        itemCount: items.length,
        enabled: isWorkflowEnabled(prefs, RESEARCH_WORKFLOW_PREF_KEYS.menuEnabled),
      };
    },
    buildMenu({ state }) {
      const context = buildWorkflowContext(prefs);
      const collectionSummaryItem = collectionMode
        ? [{
          label: formatCollectionSummary(state.items, context, i18n),
          disabled: true,
        }]
        : [];
      const menus = collectionMode
        ? [
          ...collectionSummaryItem,
          ...createStatusMenuItems({ context, i18n, logger }).slice(0, 3),
          ...createCommonMenuItems({ context, i18n, logger }),
        ]
        : [
          ...createStatusMenuItems({ context, i18n, logger }),
          ...createRatingMenuItems({ context, i18n, logger }),
          ...createCommonMenuItems({ context, i18n, logger }),
        ];
      return {
        menuType: menuTypes.SUBMENU || "submenu",
        l10nID,
        visible: Boolean(state.enabled && state.itemCount > 0),
        enabled: Boolean(state.enabled && state.itemCount > 0),
        menus,
      };
    },
  });
}

export function registerWorkflowMenus({ menuManager, prefs, i18n, logger, addonRef }) {
  if (!menuManager || !isWorkflowEnabled(prefs, RESEARCH_WORKFLOW_PREF_KEYS.menuEnabled)) {
    return [];
  }
  const targets = menuManager.MENU_TARGETS || {};
  return [
    buildWorkflowMenu({
      menuManager,
      prefs,
      i18n,
      logger,
      target: targets.LIBRARY_ITEM || "main/library/item",
      id: `${addonRef || "toolsbox"}-workflow-item-menu`,
      l10nID: "cleanroom-workflow-item-menu",
    }),
    buildWorkflowMenu({
      menuManager,
      prefs,
      i18n,
      logger,
      target: targets.LIBRARY_COLLECTION || "main/library/collection",
      id: `${addonRef || "toolsbox"}-workflow-collection-menu`,
      l10nID: "cleanroom-workflow-collection-menu",
      collectionMode: true,
    }),
  ].filter(Boolean);
}

function resolveAnnotation(event, reader) {
  const params = event?.params && typeof event.params === "object" ? event.params : {};
  const annotation = params.annotation || event?.annotation || null;
  const annotationID = Number(params.annotationID ?? params.id ?? annotation?.id ?? event?.annotationID);
  if (annotation && typeof annotation === "object") {
    return {
      id: Number.isFinite(annotationID) ? annotationID : annotation.id,
      item: annotation,
    };
  }
  if (Number.isFinite(annotationID) && reader && typeof reader.getAnnotation === "function") {
    return {
      id: annotationID,
      item: reader.getAnnotation(annotationID),
    };
  }
  return {
    id: Number.isFinite(annotationID) ? annotationID : null,
    item: null,
  };
}

async function appendAnnotationTag(reader, event, tag) {
  const annotation = resolveAnnotation(event, reader);
  const item = annotation.item;
  if (item && typeof item.addTag === "function") {
    item.addTag(tag);
    if (typeof item.saveTx === "function") {
      await item.saveTx();
    }
    return true;
  }
  return false;
}

function readReaderProgress(reader, event) {
  const params = event?.params && typeof event.params === "object" ? event.params : {};
  const readerObject = event?.reader || (typeof reader?.getActiveReader === "function" ? reader.getActiveReader() : null);
  const summary = typeof reader?.getReaderSummary === "function" ? reader.getReaderSummary(readerObject) : null;
  const states = typeof reader?.getWindowStates === "function" ? reader.getWindowStates() : [];
  const matchingState = Array.isArray(states)
    ? states.find((state) => {
      if (summary?.tabID && state?.tabID) {
        return summary.tabID === state.tabID;
      }
      return summary?.itemID && state?.itemID ? summary.itemID === state.itemID : false;
    })
    : null;
  const pageLabel = params.pageLabel
    || params.page
    || matchingState?.location?.pageLabel
    || (Number.isFinite(matchingState?.location?.pageIndex) ? String(matchingState.location.pageIndex + 1) : "");
  return pageLabel ? `page ${pageLabel}` : "";
}

function resolveReaderProgressItem(reader, event) {
  const params = event?.params && typeof event.params === "object" ? event.params : {};
  if (params.item && typeof params.item === "object") {
    return params.item;
  }
  if (event?.item && typeof event.item === "object") {
    return event.item;
  }

  const readerObject = event?.reader || (typeof reader?.getActiveReader === "function" ? reader.getActiveReader() : null);
  if (readerObject?.item && typeof readerObject.item === "object") {
    return readerObject.item;
  }

  const summary = typeof reader?.getReaderSummary === "function" ? reader.getReaderSummary(readerObject) : null;
  const itemID = Number(params.itemID ?? summary?.itemID ?? readerObject?.itemID);
  if (Number.isFinite(itemID) && typeof reader?.getItemByID === "function") {
    return reader.getItemByID(itemID);
  }
  return null;
}

async function recordReaderProgress({ reader, event, prefs, logger }) {
  const progress = readReaderProgress(reader, event);
  if (!progress) {
    if (logger && typeof logger.info === "function") {
      logger.info("researchWorkflow.reader.progress.manualRequired", {});
    }
    return {
      ok: false,
      reason: "manual-progress-required",
    };
  }

  const item = resolveReaderProgressItem(reader, event);
  if (!item) {
    if (logger && typeof logger.info === "function") {
      logger.info("researchWorkflow.reader.progress.itemUnavailable", {
        progress,
      });
    }
    return {
      ok: false,
      reason: "item-unavailable",
      progress,
    };
  }

  return applyWorkflowStateToItem(item, {
    progress,
  }, {
    context: buildWorkflowContext(prefs),
  });
}

export function registerWorkflowReaderFeatures({ menuManager, reader, prefs, i18n, logger, addonRef }) {
  if (!reader || !isWorkflowEnabled(prefs, RESEARCH_WORKFLOW_PREF_KEYS.readerEnabled)) {
    return [];
  }

  const registered = [];
  if (menuManager && typeof menuManager.registerReaderMenubarViewSubmenu === "function") {
    const menuTypes = menuManager.MENU_TYPES || {};
    const menuID = menuManager.registerReaderMenubarViewSubmenu({
      id: `${addonRef || "toolsbox"}-workflow-reader-menu`,
      l10nID: "cleanroom-workflow-reader-menu",
      menus: [
        {
          menuType: menuTypes.MENUITEM || "menuitem",
          l10nID: "cleanroom-workflow-reader-sync-progress",
          onCommand(event) {
            runAsync(logger, () => recordReaderProgress({ reader, event, prefs, logger }), {
              surface: "reader-menubar",
              action: "sync-progress",
            });
          },
        },
      ],
    });
    if (menuID) {
      registered.push(menuID);
    }
  }

  if (typeof reader.registerEventListener === "function" && reader.READER_EVENT_TYPES) {
    const cleanup = reader.registerEventListener(
      reader.READER_EVENT_TYPES.RENDER_TOOLBAR,
      (event) => {
        if (event && typeof event.append === "function") {
          event.append({
            label: t(i18n, "cleanroom-workflow-reader-toolbar", "Workflow"),
            onCommand() {
              runAsync(logger, () => recordReaderProgress({ reader, event, prefs, logger }), {
                surface: "reader-toolbar",
                action: "sync-progress",
              });
            },
          });
        }
      },
    );
    if (cleanup) {
      registered.push("reader:renderToolbar");
    }
  }

  if (typeof reader.registerViewContextMenuItem === "function") {
    const cleanup = reader.registerViewContextMenuItem((event) => ({
      label: t(i18n, "cleanroom-workflow-reader-view-progress", "Record page progress"),
      onCommand() {
        runAsync(logger, () => recordReaderProgress({ reader, event, prefs, logger }), {
          surface: "reader-view-context",
          action: "sync-progress",
        });
      },
    }));
    if (cleanup) {
      registered.push("reader:viewContext");
    }
  }

  if (typeof reader.registerAnnotationContextMenuItem === "function") {
    const cleanup = reader.registerAnnotationContextMenuItem((event) => ([
      {
        label: t(i18n, "cleanroom-workflow-annotation-reviewed", "Mark annotation reviewed"),
        onCommand() {
          const annotation = resolveAnnotation(event, reader);
          if (annotation.id && typeof reader.updateAnnotation === "function") {
            runAsync(logger, () => reader.updateAnnotation(annotation.id, {
              comment: "Workflow: reviewed",
            }), {
              surface: "reader-annotation",
              action: "comment",
            });
          }
        },
      },
      {
        label: t(i18n, "cleanroom-workflow-annotation-tag", "Add workflow tag"),
        onCommand() {
          runAsync(logger, () => appendAnnotationTag(reader, event, "workflow"), {
            surface: "reader-annotation",
            action: "tag",
          });
        },
      },
      {
        label: t(i18n, "cleanroom-workflow-annotation-color", "Set workflow color"),
        onCommand() {
          const annotation = resolveAnnotation(event, reader);
          if (annotation.id && typeof reader.updateAnnotation === "function") {
            runAsync(logger, () => reader.updateAnnotation(annotation.id, {
              color: "#6aa84f",
            }), {
              surface: "reader-annotation",
              action: "color",
            });
          }
        },
      },
    ]));
    if (cleanup) {
      registered.push("reader:annotationContext");
    }
  }

  return registered;
}

export function registerResearchWorkflowFeatures(options = {}) {
  const {
    config = {},
    logger,
    prefs,
    i18n,
    itemPane,
    menuManager,
    reader,
  } = options;
  const addonRef = config.addonRef || "toolsbox";
  const itemPaneSection = registerWorkflowItemPane({
    itemPane,
    prefs,
    i18n,
    logger,
    addonRef,
  });
  const menus = registerWorkflowMenus({
    menuManager,
    prefs,
    i18n,
    logger,
    addonRef,
  });
  const readerFeatures = registerWorkflowReaderFeatures({
    menuManager,
    reader,
    prefs,
    i18n,
    logger,
    addonRef,
  });

  if (logger && typeof logger.info === "function") {
    logger.info("researchWorkflow.features.ready", {
      itemPaneSection: Boolean(itemPaneSection),
      menus: menus.length,
      readerFeatures: readerFeatures.length,
    });
  }

  return {
    itemPaneSection,
    menus,
    readerFeatures,
  };
}
