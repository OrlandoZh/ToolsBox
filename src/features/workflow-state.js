const DEFAULT_CUSTOM_FIELDS = "numPages, price";
const DEFAULT_STATUS_TAG_PREFIX = "/";
const DEFAULT_TEXT_TAG_PREFIX = "#";
const DEFAULT_RATING_MARK = "*";
const DEFAULT_REMARK_EXTRA_LABEL = "Remark";
const DEFAULT_READ_STATUS_EXTRA_LABEL = "Read Status";
const DEFAULT_PROGRESS_EXTRA_LABEL = "Reading Progress";
const DEFAULT_AVAILABLE_STATUSES = "todo, reading, reviewed, done";
const DEFAULT_AVAILABLE_READ_STATUSES = "unread, reading, read";

export const RESEARCH_WORKFLOW_PREF_KEYS = Object.freeze({
  enabled: "researchWorkflow.enabled",
  itemPaneEnabled: "researchWorkflow.itemPane.enabled",
  menuEnabled: "researchWorkflow.menu.enabled",
  readerEnabled: "researchWorkflow.reader.enabled",
  availableStatuses: "researchWorkflow.status.available",
  availableReadStatuses: "researchWorkflow.readStatus.available",
  tagsEnabled: "researchWorkflow.itemTree.tags.enabled",
  textTagsEnabled: "researchWorkflow.itemTree.textTags.enabled",
  statusEnabled: "researchWorkflow.itemTree.status.enabled",
  ratingEnabled: "researchWorkflow.itemTree.rating.enabled",
  remarkEnabled: "researchWorkflow.itemTree.remark.enabled",
  creatorEnabled: "researchWorkflow.itemTree.creator.enabled",
  publicationEnabled: "researchWorkflow.itemTree.publication.enabled",
  dateAddedEnabled: "researchWorkflow.itemTree.dateAdded.enabled",
  dateModifiedEnabled: "researchWorkflow.itemTree.dateModified.enabled",
  readStatusEnabled: "researchWorkflow.itemTree.readStatus.enabled",
  customFieldsEnabled: "researchWorkflow.itemTree.customFields.enabled",
  customFieldKeys: "researchWorkflow.itemTree.customFields.keys",
  textTagPrefix: "researchWorkflow.textTags.prefix",
  statusTagPrefix: "researchWorkflow.statusTags.prefix",
  ratingSelectedMark: "researchWorkflow.rating.selectedMark",
  remarkExtraLabel: "researchWorkflow.remark.extraLabel",
  readStatusExtraLabel: "researchWorkflow.readStatus.extraLabel",
  progressExtraLabel: "researchWorkflow.progress.extraLabel",
});

function cleanString(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function readPref(prefs, key, fallback) {
  try {
    const value = prefs && typeof prefs.get === "function" ? prefs.get(key) : undefined;
    return value === null || value === undefined || value === "" || value === "undefined"
      ? fallback
      : value;
  }
  catch {
    return fallback;
  }
}

export function readBooleanWorkflowPref(prefs, key, fallback = true) {
  const value = readPref(prefs, key, fallback);
  return typeof value === "boolean" ? value : fallback;
}

export function readStringWorkflowPref(prefs, key, fallback = "") {
  return String(readPref(prefs, key, fallback) || fallback);
}

function parseCSV(value, fallback = "") {
  return String(value || fallback)
    .split(",")
    .map((entry) => cleanString(entry))
    .filter(Boolean)
    .filter((entry, index, all) => all.indexOf(entry) === index);
}

export function buildWorkflowContext(prefs) {
  return Object.freeze({
    textTagPrefix: readStringWorkflowPref(
      prefs,
      RESEARCH_WORKFLOW_PREF_KEYS.textTagPrefix,
      DEFAULT_TEXT_TAG_PREFIX,
    ),
    statusTagPrefix: readStringWorkflowPref(
      prefs,
      RESEARCH_WORKFLOW_PREF_KEYS.statusTagPrefix,
      DEFAULT_STATUS_TAG_PREFIX,
    ),
    ratingSelectedMark: readStringWorkflowPref(
      prefs,
      RESEARCH_WORKFLOW_PREF_KEYS.ratingSelectedMark,
      DEFAULT_RATING_MARK,
    ),
    remarkExtraLabel: readStringWorkflowPref(
      prefs,
      RESEARCH_WORKFLOW_PREF_KEYS.remarkExtraLabel,
      DEFAULT_REMARK_EXTRA_LABEL,
    ),
    readStatusExtraLabel: readStringWorkflowPref(
      prefs,
      RESEARCH_WORKFLOW_PREF_KEYS.readStatusExtraLabel,
      DEFAULT_READ_STATUS_EXTRA_LABEL,
    ),
    progressExtraLabel: readStringWorkflowPref(
      prefs,
      RESEARCH_WORKFLOW_PREF_KEYS.progressExtraLabel,
      DEFAULT_PROGRESS_EXTRA_LABEL,
    ),
    availableStatuses: parseCSV(
      readStringWorkflowPref(
        prefs,
        RESEARCH_WORKFLOW_PREF_KEYS.availableStatuses,
        DEFAULT_AVAILABLE_STATUSES,
      ),
      DEFAULT_AVAILABLE_STATUSES,
    ),
    availableReadStatuses: parseCSV(
      readStringWorkflowPref(
        prefs,
        RESEARCH_WORKFLOW_PREF_KEYS.availableReadStatuses,
        DEFAULT_AVAILABLE_READ_STATUSES,
      ),
      DEFAULT_AVAILABLE_READ_STATUSES,
    ),
  });
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

function readRawField(item, field) {
  if (!item) {
    return "";
  }
  if (item[field] !== undefined && item[field] !== null) {
    return String(item[field]);
  }
  const value = callMaybe(item, "getField", [field]);
  return value === null || value === undefined ? "" : String(value);
}

function extractTagName(entry) {
  if (typeof entry === "string") {
    return cleanString(entry);
  }
  if (entry && typeof entry === "object") {
    return cleanString(entry.tag ?? entry.name ?? entry.label ?? "");
  }
  return "";
}

export function extractItemTags(item) {
  const raw = callMaybe(item, "getTags") || item?.tags || [];
  return (Array.isArray(raw) ? raw : [])
    .map(extractTagName)
    .filter(Boolean);
}

function startsWithPrefix(value, prefix) {
  return Boolean(prefix) && value.startsWith(prefix);
}

function stripPrefix(value, prefix) {
  const text = cleanString(value);
  return startsWithPrefix(text, prefix) ? cleanString(text.slice(prefix.length)) : text;
}

export function isWorkflowRatingTag(tag, context = {}) {
  const value = cleanString(tag);
  if (!value) {
    return false;
  }
  const selectedMark = cleanString(context.ratingSelectedMark || DEFAULT_RATING_MARK);
  if (selectedMark && value.length <= selectedMark.length * 5) {
    for (let count = 1; count <= 5; count += 1) {
      if (value === selectedMark.repeat(count)) {
        return true;
      }
    }
  }
  return /^(?:\u2b50|\u2605|\*){1,5}$/u.test(value);
}

function parseWorkflowRatingTag(tag, context = {}) {
  const value = cleanString(tag);
  const selectedMark = cleanString(context.ratingSelectedMark || DEFAULT_RATING_MARK);
  if (selectedMark) {
    for (let count = 1; count <= 5; count += 1) {
      if (value === selectedMark.repeat(count)) {
        return count;
      }
    }
  }
  return isWorkflowRatingTag(value, context)
    ? Math.max(1, Math.min(5, Array.from(value).length))
    : 0;
}

function normalizeRating(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  if (typeof value === "number") {
    return Math.max(0, Math.min(5, Math.trunc(value)));
  }
  const text = cleanString(value);
  if (/^\d+$/u.test(text)) {
    return Math.max(0, Math.min(5, Number(text)));
  }
  if (isWorkflowRatingTag(text)) {
    return Math.max(1, Math.min(5, Array.from(text).length));
  }
  return 0;
}

function normalizeProgress(value) {
  const text = cleanString(value);
  if (!text) {
    return "";
  }
  const percent = text.match(/^(\d{1,3})(?:\s*%)?$/u);
  if (!percent) {
    return text;
  }
  const bounded = Math.max(0, Math.min(100, Number(percent[1])));
  return `${bounded}%`;
}

function findExtraLineValue(extra, label) {
  const normalizedLabel = `${cleanString(label)}:`;
  if (!normalizedLabel || normalizedLabel === ":") {
    return "";
  }
  const match = String(extra || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith(normalizedLabel.toLowerCase()));
  return match ? cleanString(match.slice(normalizedLabel.length)) : "";
}

function updateExtraLine(extra, label, value) {
  const normalizedLabel = cleanString(label);
  if (!normalizedLabel) {
    return String(extra || "");
  }

  const normalizedValue = cleanString(value);
  const labelPrefix = `${normalizedLabel}:`;
  const lines = String(extra || "").split(/\r?\n/u);
  const nextLines = [];
  let replaced = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith(labelPrefix.toLowerCase())) {
      if (!replaced && normalizedValue) {
        nextLines.push(`${labelPrefix} ${normalizedValue}`);
        replaced = true;
      }
      continue;
    }
    if (line !== "" || nextLines.length > 0) {
      nextLines.push(line);
    }
  }

  if (!replaced && normalizedValue) {
    nextLines.push(`${labelPrefix} ${normalizedValue}`);
  }

  while (nextLines.length > 0 && nextLines[0] === "") {
    nextLines.shift();
  }
  while (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") {
    nextLines.pop();
  }
  return nextLines.join("\n");
}

function updateExtraFields(extra, fields) {
  return fields.reduce((current, field) => {
    if (!field || !Object.hasOwn(field, "value")) {
      return current;
    }
    return updateExtraLine(current, field.label, field.value);
  }, String(extra || ""));
}

export function getWorkflowState(item, options = {}) {
  const context = options.context || buildWorkflowContext(options.prefs);
  const tags = extractItemTags(item);
  const statusTags = tags
    .filter((tag) => startsWithPrefix(tag, context.statusTagPrefix))
    .map((tag) => stripPrefix(tag, context.statusTagPrefix))
    .filter(Boolean);
  const textTags = tags
    .filter((tag) => startsWithPrefix(tag, context.textTagPrefix))
    .map((tag) => stripPrefix(tag, context.textTagPrefix))
    .filter(Boolean);
  const ratingTag = tags.find((tag) => isWorkflowRatingTag(tag, context)) || "";
  const rating = ratingTag ? parseWorkflowRatingTag(ratingTag, context) : normalizeRating(readFirstField(item, ["rating"]));
  const extra = readRawField(item, "extra");
  const remark = findExtraLineValue(extra, context.remarkExtraLabel)
    || readFirstField(item, ["remark"]);
  const readStatus = findExtraLineValue(extra, context.readStatusExtraLabel)
    || readFirstField(item, ["readStatus"]);
  const progress = findExtraLineValue(extra, context.progressExtraLabel)
    || normalizeProgress(readFirstField(item, ["readingProgress", "progress"]));

  return Object.freeze({
    status: statusTags[0] || readFirstField(item, ["status"]),
    statuses: Object.freeze(statusTags),
    textTags: Object.freeze(textTags),
    rating,
    ratingTag,
    remark,
    readStatus,
    progress,
    tags: Object.freeze(tags),
    regularTags: Object.freeze(tags
      .filter((tag) => !startsWithPrefix(tag, context.textTagPrefix))
      .filter((tag) => !startsWithPrefix(tag, context.statusTagPrefix))
      .filter((tag) => !isWorkflowRatingTag(tag, context))),
  });
}

function normalizeWorkflowTagValue(value, prefix) {
  const normalized = stripPrefix(value, prefix);
  return normalized ? `${prefix}${normalized}` : "";
}

function normalizeTextTagValues(values, prefix) {
  const source = Array.isArray(values)
    ? values
    : String(values || "").split(",");
  return source
    .map((value) => normalizeWorkflowTagValue(value, prefix))
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function createDesiredTagSet(currentTags, patch, context, clear = false) {
  const shouldPatchStatus = clear || Object.hasOwn(patch, "status");
  const shouldPatchTextTags = clear || Object.hasOwn(patch, "textTags");
  const shouldPatchRating = clear || Object.hasOwn(patch, "rating");
  const desired = currentTags
    .filter((tag) => !(shouldPatchStatus && startsWithPrefix(tag, context.statusTagPrefix)))
    .filter((tag) => !(shouldPatchTextTags && startsWithPrefix(tag, context.textTagPrefix)))
    .filter((tag) => !(shouldPatchRating && isWorkflowRatingTag(tag, context)));

  if (!clear && shouldPatchStatus) {
    const statusTag = normalizeWorkflowTagValue(patch.status, context.statusTagPrefix);
    if (statusTag) {
      desired.push(statusTag);
    }
  }

  if (!clear && shouldPatchTextTags) {
    desired.push(...normalizeTextTagValues(patch.textTags, context.textTagPrefix));
  }

  if (!clear && shouldPatchRating) {
    const rating = normalizeRating(patch.rating);
    if (rating > 0) {
      desired.push(context.ratingSelectedMark.repeat(rating));
    }
  }

  return desired.filter((tag, index, all) => all.indexOf(tag) === index);
}

function setItemTags(item, desiredTags) {
  const currentTags = extractItemTags(item);
  const removeTags = currentTags.filter((tag) => !desiredTags.includes(tag));
  const addTags = desiredTags.filter((tag) => !currentTags.includes(tag));
  const warnings = [];

  if (removeTags.length > 0) {
    if (typeof item?.removeTag === "function") {
      removeTags.forEach((tag) => item.removeTag(tag));
    }
    else if (typeof item?.setTags === "function") {
      item.setTags(desiredTags.map((tag) => ({ tag })));
    }
    else if (Array.isArray(item?.tags)) {
      item.tags = desiredTags.map((tag) => ({ tag }));
    }
    else {
      warnings.push("removeTag-unavailable");
    }
  }

  if (addTags.length > 0) {
    if (typeof item?.addTag === "function") {
      addTags.forEach((tag) => item.addTag(tag));
    }
    else if (typeof item?.setTags === "function") {
      item.setTags(desiredTags.map((tag) => ({ tag })));
    }
    else if (Array.isArray(item?.tags)) {
      item.tags = desiredTags.map((tag) => ({ tag }));
    }
    else {
      warnings.push("addTag-unavailable");
    }
  }

  return {
    addedTags: addTags,
    removedTags: removeTags,
    warnings,
  };
}

function setItemExtra(item, value) {
  if (typeof item?.setField === "function") {
    item.setField("extra", value);
    return true;
  }
  if (item && typeof item === "object") {
    item.extra = value;
    return true;
  }
  return false;
}

async function saveItem(item) {
  if (typeof item?.saveTx === "function") {
    await item.saveTx();
    return "saveTx";
  }
  if (typeof item?.save === "function") {
    await item.save();
    return "save";
  }
  return null;
}

export async function applyWorkflowStateToItem(item, patch = {}, options = {}) {
  if (!item || typeof item !== "object") {
    return {
      ok: false,
      reason: "invalid-item",
      changed: false,
    };
  }

  const context = options.context || buildWorkflowContext(options.prefs);
  const normalizedPatch = patch && typeof patch === "object" ? patch : {};
  const currentTags = extractItemTags(item);
  const desiredTags = createDesiredTagSet(currentTags, normalizedPatch, context, false);
  const tagResult = setItemTags(item, desiredTags);

  const extraFields = [];
  if (Object.hasOwn(normalizedPatch, "remark")) {
    extraFields.push({ label: context.remarkExtraLabel, value: normalizedPatch.remark });
  }
  if (Object.hasOwn(normalizedPatch, "readStatus")) {
    extraFields.push({ label: context.readStatusExtraLabel, value: normalizedPatch.readStatus });
  }
  if (Object.hasOwn(normalizedPatch, "progress")) {
    extraFields.push({ label: context.progressExtraLabel, value: normalizeProgress(normalizedPatch.progress) });
  }

  const currentExtra = readRawField(item, "extra");
  const nextExtra = updateExtraFields(currentExtra, extraFields);
  const extraChanged = nextExtra !== currentExtra;
  const extraWritten = extraChanged ? setItemExtra(item, nextExtra) : false;
  const changed = tagResult.addedTags.length > 0 || tagResult.removedTags.length > 0 || extraChanged;
  const savedBy = changed ? await saveItem(item) : null;

  return {
    ok: true,
    changed,
    savedBy,
    extraChanged,
    extraWritten,
    addedTags: tagResult.addedTags,
    removedTags: tagResult.removedTags,
    warnings: tagResult.warnings,
    state: getWorkflowState(item, { context }),
  };
}

export async function clearWorkflowStateFromItem(item, options = {}) {
  if (!item || typeof item !== "object") {
    return {
      ok: false,
      reason: "invalid-item",
      changed: false,
    };
  }

  const context = options.context || buildWorkflowContext(options.prefs);
  const currentTags = extractItemTags(item);
  const desiredTags = createDesiredTagSet(currentTags, {}, context, true);
  const tagResult = setItemTags(item, desiredTags);
  const currentExtra = readRawField(item, "extra");
  const nextExtra = updateExtraFields(currentExtra, [
    { label: context.remarkExtraLabel, value: "" },
    { label: context.readStatusExtraLabel, value: "" },
    { label: context.progressExtraLabel, value: "" },
  ]);
  const extraChanged = nextExtra !== currentExtra;
  const extraWritten = extraChanged ? setItemExtra(item, nextExtra) : false;
  const changed = tagResult.addedTags.length > 0 || tagResult.removedTags.length > 0 || extraChanged;
  const savedBy = changed ? await saveItem(item) : null;

  return {
    ok: true,
    changed,
    savedBy,
    extraChanged,
    extraWritten,
    addedTags: tagResult.addedTags,
    removedTags: tagResult.removedTags,
    warnings: tagResult.warnings,
    state: getWorkflowState(item, { context }),
  };
}

export async function applyWorkflowStateBatch(items, patch = {}, options = {}) {
  const sourceItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const context = options.context || buildWorkflowContext(options.prefs);
  const results = [];
  for (const item of sourceItems) {
    results.push(await applyWorkflowStateToItem(item, patch, { context }));
  }
  return {
    ok: true,
    itemCount: sourceItems.length,
    changedCount: results.filter((result) => result.changed).length,
    results,
  };
}

export async function clearWorkflowStateBatch(items, options = {}) {
  const sourceItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const context = options.context || buildWorkflowContext(options.prefs);
  const results = [];
  for (const item of sourceItems) {
    results.push(await clearWorkflowStateFromItem(item, { context }));
  }
  return {
    ok: true,
    itemCount: sourceItems.length,
    changedCount: results.filter((result) => result.changed).length,
    results,
  };
}

export const RESEARCH_WORKFLOW_DEFAULTS = Object.freeze({
  customFields: DEFAULT_CUSTOM_FIELDS,
  statusTagPrefix: DEFAULT_STATUS_TAG_PREFIX,
  textTagPrefix: DEFAULT_TEXT_TAG_PREFIX,
  ratingSelectedMark: DEFAULT_RATING_MARK,
  remarkExtraLabel: DEFAULT_REMARK_EXTRA_LABEL,
  readStatusExtraLabel: DEFAULT_READ_STATUS_EXTRA_LABEL,
  progressExtraLabel: DEFAULT_PROGRESS_EXTRA_LABEL,
  availableStatuses: DEFAULT_AVAILABLE_STATUSES,
  availableReadStatuses: DEFAULT_AVAILABLE_READ_STATUSES,
});
