function normalizeString(value) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "";
}

function normalizeStringList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeString(item))
      .filter(Boolean),
  ));
}

function cloneValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  }
  catch {
    return value;
  }
}

function createActionDescriptor(actionId, options = {}) {
  return {
    id: actionId,
    label: normalizeString(options.label),
    description: normalizeString(options.description),
    aliases: normalizeStringList(options.aliases),
    keywords: normalizeStringList(options.keywords),
    condition: typeof options.condition === "function"
      ? options.condition
      : null,
    handler: typeof options.handler === "function"
      ? options.handler
      : null,
  };
}

function sortSnapshots(left, right) {
  return (
    String(left?.label || "").localeCompare(String(right?.label || ""), "en")
    || String(left?.id || "").localeCompare(String(right?.id || ""), "en")
  );
}

export function createReaderSelectionActions(options = {}) {
  const {
    logger,
    lifecycle,
    reader,
  } = options;

  const registeredActions = new Map();

  function debug(message, details = {}) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
    }
  }

  function error(message, details = {}) {
    if (logger && typeof logger.error === "function") {
      logger.error(message, details);
    }
  }

  function buildActionContext(input = {}) {
    const payload = input && typeof input === "object" && !Array.isArray(input)
      ? input
      : { input };
    const selectionOptions = payload.selectionOptions && typeof payload.selectionOptions === "object"
      ? payload.selectionOptions
      : {};
    const selection = typeof reader?.getSelectionSnapshot === "function"
      ? reader.getSelectionSnapshot(payload.source, selectionOptions)
      : null;

    return {
      ...payload,
      selection,
      selectionSnapshot: selection,
      reader: reader || null,
    };
  }

  function evaluateActionCondition(descriptor, context) {
    if (typeof descriptor?.condition !== "function") {
      return true;
    }

    try {
      return descriptor.condition(context) !== false;
    }
    catch (err) {
      error("readerSelectionActions.condition.failed", {
        actionId: descriptor?.id || null,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  function createActionSnapshot(descriptor, input = {}) {
    const context = buildActionContext(input);
    return {
      id: descriptor.id,
      label: descriptor.label,
      description: descriptor.description,
      aliases: descriptor.aliases.slice(),
      keywords: descriptor.keywords.slice(),
      enabled: evaluateActionCondition(descriptor, context),
      hasSelection: Boolean(context.selection?.hasSelection),
    };
  }

  function registerAction(actionOptions) {
    const actionId = normalizeString(actionOptions?.id)
      || `reader-selection-action-${registeredActions.size + 1}`;
    const descriptor = createActionDescriptor(actionId, actionOptions);

    if (!descriptor.label) {
      error("readerSelectionActions.registerAction.noLabel", {});
      return null;
    }

    if (typeof descriptor.handler !== "function") {
      error("readerSelectionActions.registerAction.noHandler", {
        actionId,
      });
      return null;
    }

    registeredActions.set(actionId, descriptor);
    debug("readerSelectionActions.registerAction.created", {
      actionId,
      label: descriptor.label,
    });
    return actionId;
  }

  function unregisterAction(actionId) {
    return registeredActions.delete(actionId);
  }

  function unregisterAll() {
    registeredActions.clear();
  }

  function hasAction(actionId) {
    return registeredActions.has(actionId);
  }

  function getActionCount() {
    return registeredActions.size;
  }

  function getActionSnapshot(actionId = null, input = {}) {
    if (typeof actionId === "string" && actionId.trim()) {
      const descriptor = registeredActions.get(actionId);
      return descriptor
        ? createActionSnapshot(descriptor, input)
        : null;
    }

    return Array.from(registeredActions.values())
      .map((descriptor) => createActionSnapshot(descriptor, input))
      .sort(sortSnapshots);
  }

  async function executeAction(actionId, input = {}) {
    const descriptor = registeredActions.get(actionId);
    if (!descriptor) {
      return {
        ok: false,
        actionId: normalizeString(actionId) || null,
        selection: null,
        result: null,
        errorMessage: "action is not registered",
        skipped: true,
      };
    }

    const context = buildActionContext(input);
    if (!evaluateActionCondition(descriptor, context)) {
      return {
        ok: false,
        actionId: descriptor.id,
        selection: cloneValue(context.selection),
        result: null,
        errorMessage: null,
        skipped: true,
      };
    }

    try {
      const result = await descriptor.handler(context);
      return {
        ok: true,
        actionId: descriptor.id,
        selection: cloneValue(context.selection),
        result: cloneValue(result),
        errorMessage: null,
        skipped: false,
      };
    }
    catch (err) {
      error("readerSelectionActions.executeAction.failed", {
        actionId: descriptor.id,
        message: String(err?.message || err),
      });
      return {
        ok: false,
        actionId: descriptor.id,
        selection: cloneValue(context.selection),
        result: null,
        errorMessage: String(err?.message || err),
        skipped: false,
      };
    }
  }

  if (lifecycle && typeof lifecycle.trackCleanup === "function") {
    lifecycle.trackCleanup(unregisterAll);
  }

  return {
    registerAction,
    unregisterAction,
    unregisterAll,
    hasAction,
    getActionCount,
    getActionSnapshot,
    executeAction,
  };
}
