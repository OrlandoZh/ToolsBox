import {
  RESEARCH_WORKFLOW_DEFAULTS,
  RESEARCH_WORKFLOW_PREF_KEYS,
  buildWorkflowContext,
  extractItemTags,
  getWorkflowState,
  readBooleanWorkflowPref,
  readStringWorkflowPref,
} from "./workflow-state.js";

export { extractItemTags, RESEARCH_WORKFLOW_PREF_KEYS };

const BUILT_IN_COLUMN_SPECS = Object.freeze([
  Object.freeze({
    dataKey: "cleanroom-research-tags",
    prefKey: RESEARCH_WORKFLOW_PREF_KEYS.tagsEnabled,
    l10nID: "cleanroom-column-tags",
    width: 140,
    dataProvider: (item, _dataKey, context) => formatRegularTags(item, context),
  }),
  Object.freeze({
    dataKey: "cleanroom-research-text-tags",
    prefKey: RESEARCH_WORKFLOW_PREF_KEYS.textTagsEnabled,
    l10nID: "cleanroom-column-text-tags",
    width: 160,
    dataProvider: (item, _dataKey, context) => formatPrefixedTags(item, context),
  }),
  Object.freeze({
    dataKey: "cleanroom-research-status",
    prefKey: RESEARCH_WORKFLOW_PREF_KEYS.statusEnabled,
    l10nID: "cleanroom-column-status",
    width: 120,
    dataProvider: (item, _dataKey, context) => formatStatus(item, context),
  }),
  Object.freeze({
    dataKey: "cleanroom-research-rating",
    prefKey: RESEARCH_WORKFLOW_PREF_KEYS.ratingEnabled,
    l10nID: "cleanroom-column-rating",
    width: 90,
    dataProvider: (item, _dataKey, context) => formatRating(item, context),
  }),
  Object.freeze({
    dataKey: "cleanroom-research-remark",
    prefKey: RESEARCH_WORKFLOW_PREF_KEYS.remarkEnabled,
    l10nID: "cleanroom-column-remark",
    width: 220,
    dataProvider: (item, _dataKey, context) => formatRemark(item, context),
  }),
  Object.freeze({
    dataKey: "cleanroom-research-creator",
    prefKey: RESEARCH_WORKFLOW_PREF_KEYS.creatorEnabled,
    defaultEnabled: false,
    l10nID: "cleanroom-column-creator",
    width: 180,
    dataProvider: (item) => formatCreators(item),
  }),
  Object.freeze({
    dataKey: "cleanroom-research-publication",
    prefKey: RESEARCH_WORKFLOW_PREF_KEYS.publicationEnabled,
    l10nID: "cleanroom-column-publication",
    width: 180,
    dataProvider: (item) => readFirstField(item, ["publicationTitle", "conferenceName", "university", "publisher"]),
  }),
  Object.freeze({
    dataKey: "cleanroom-research-date-added",
    prefKey: RESEARCH_WORKFLOW_PREF_KEYS.dateAddedEnabled,
    l10nID: "cleanroom-column-date-added",
    width: 140,
    dataProvider: (item) => formatDateLike(readFirstField(item, ["dateAdded"])),
  }),
  Object.freeze({
    dataKey: "cleanroom-research-date-modified",
    prefKey: RESEARCH_WORKFLOW_PREF_KEYS.dateModifiedEnabled,
    l10nID: "cleanroom-column-date-modified",
    width: 140,
    dataProvider: (item) => formatDateLike(readFirstField(item, ["dateModified"])),
  }),
  Object.freeze({
    dataKey: "cleanroom-research-read-status",
    prefKey: RESEARCH_WORKFLOW_PREF_KEYS.readStatusEnabled,
    l10nID: "cleanroom-column-read-status",
    width: 120,
    dataProvider: (item, _dataKey, context) => formatReadStatus(item, context),
  }),
]);

function cleanString(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function callMaybe(target, method, args = []) {
  try {
    const fn = target && typeof target[method] === "function" ? target[method] : null;
    return fn ? fn.apply(target, args) : null;
  } catch {
    return null;
  }
}

function readFirstField(item, fields) {
  if (!item) {
    return "";
  }
  for (const field of fields) {
    const direct = item[field];
    if (direct !== undefined && direct !== null && cleanString(direct)) {
      return cleanString(direct);
    }
    const value = callMaybe(item, "getField", [field]);
    if (cleanString(value)) {
      return cleanString(value);
    }
  }
  return "";
}

function formatRegularTags(item, context) {
  return getWorkflowState(item, { context }).regularTags.join(", ");
}

function formatPrefixedTags(item, context) {
  return getWorkflowState(item, { context }).textTags.join(", ");
}

function formatStatus(item, context) {
  return getWorkflowState(item, { context }).status;
}

function formatRating(item, context) {
  const rating = getWorkflowState(item, { context }).rating;
  if (!rating) {
    return "";
  }
  const selectedMark = context.ratingSelectedMark || "*";
  return selectedMark.repeat(Math.max(1, Math.min(5, rating)));
}

function formatRemark(item, context) {
  const remark = getWorkflowState(item, { context }).remark;
  if (remark) {
    return remark;
  }
  return readFirstField(item, ["shortTitle", "abstractNote"]).slice(0, 180);
}

function formatCreators(item) {
  const creators = callMaybe(item, "getCreators") || item?.creators || [];
  if (Array.isArray(creators) && creators.length > 0) {
    return creators
      .map((creator) => {
        if (typeof creator === "string") {
          return cleanString(creator);
        }
        const name = cleanString(creator?.name);
        if (name) {
          return name;
        }
        return cleanString([creator?.firstName, creator?.lastName].filter(Boolean).join(" "));
      })
      .filter(Boolean)
      .join(", ");
  }
  return readFirstField(item, ["firstCreator", "creator"]);
}

function formatReadStatus(item, context) {
  const state = getWorkflowState(item, { context });
  if (state.readStatus) {
    return state.readStatus;
  }
  if (state.status) {
    return state.status;
  }
  const tags = extractItemTags(item).map((tag) => tag.toLowerCase());
  if (tags.includes("read")) {
    return "read";
  }
  if (tags.includes("unread")) {
    return "unread";
  }
  return "";
}

function formatDateLike(value) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }
  return parsed.toISOString().slice(0, 10);
}

function parseCustomFields(value) {
  return String(value || RESEARCH_WORKFLOW_DEFAULTS.customFields)
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean)
    .filter((field, index, all) => all.indexOf(field) === index);
}

function createCustomColumnSpecs(prefs) {
  if (!readBooleanWorkflowPref(prefs, RESEARCH_WORKFLOW_PREF_KEYS.customFieldsEnabled, true)) {
    return [];
  }
  return parseCustomFields(readStringWorkflowPref(
    prefs,
    RESEARCH_WORKFLOW_PREF_KEYS.customFieldKeys,
    RESEARCH_WORKFLOW_DEFAULTS.customFields,
  ))
    .map((field) => Object.freeze({
      dataKey: `cleanroom-research-custom-${field.replace(/[^\w-]+/g, "-").toLowerCase()}`,
      label: field,
      width: 120,
      dataProvider: (item) => readFirstField(item, [field]),
    }));
}

export function createResearchWorkflowItemTreeColumns({ prefs } = {}) {
  const context = buildWorkflowContext(prefs);
  const builtInColumns = BUILT_IN_COLUMN_SPECS
    .filter((spec) => readBooleanWorkflowPref(prefs, spec.prefKey, spec.defaultEnabled !== false))
    .map((spec) => ({
      dataKey: spec.dataKey,
      l10nID: spec.l10nID,
      width: spec.width,
      hidden: true,
      sortable: true,
      dataProvider(item, dataKey) {
        return spec.dataProvider(item, dataKey, context);
      },
    }));

  return builtInColumns.concat(
    createCustomColumnSpecs(prefs).map((spec) => ({
      ...spec,
      hidden: true,
      sortable: true,
    })),
  );
}

export function registerResearchWorkflowItemTreeColumns({ itemTree, prefs, logger } = {}) {
  if (!itemTree || typeof itemTree.registerColumn !== "function") {
    return [];
  }

  const registered = [];
  for (const column of createResearchWorkflowItemTreeColumns({ prefs })) {
    if (typeof itemTree.hasColumn === "function" && itemTree.hasColumn(column.dataKey)) {
      continue;
    }
    const registeredKey = itemTree.registerColumn(column);
    if (registeredKey) {
      registered.push(registeredKey);
    }
  }

  if (registered.length > 0 && logger && typeof logger.info === "function") {
    logger.info("researchWorkflow.itemTree.ready", {
      columns: registered.length,
    });
  }

  return registered;
}
