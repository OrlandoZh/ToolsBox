function toErrorMessage(error) {
  if (!error) {
    return "unknown";
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error.message || error);
}

function clone(value) {
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
    return null;
  }
}

function toPositiveInteger(value, fallback, minimum = 0) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < minimum) {
    return fallback;
  }
  return Math.floor(normalized);
}

function getByteLength(source) {
  return new TextEncoder().encode(String(source)).length;
}

function isPersistedEnvelope(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, "schemaVersion") &&
    Object.prototype.hasOwnProperty.call(value, "savedAt") &&
    Object.prototype.hasOwnProperty.call(value, "state"),
  );
}

export function createFileStateStore(options = {}) {
  const {
    id,
    label,
    readText,
    writeText,
    initialState = {},
    logger,
    debounceMs = 250,
    schemaVersion = 1,
    maxSerializedBytes = null,
    serialize,
    deserialize,
    migrate,
    prune,
  } = options;

  const storeID = String(id || "").trim();
  if (!storeID) {
    throw new Error("file state store id is required");
  }
  if (typeof readText !== "function") {
    throw new Error("file state store readText() is required");
  }
  if (typeof writeText !== "function") {
    throw new Error("file state store writeText() is required");
  }

  const storeLabel = String(label || storeID);
  const storeSchemaVersion = toPositiveInteger(schemaVersion, 1, 1);
  const storeDebounceMs = toPositiveInteger(debounceMs, 250, 0);
  const storeMaxSerializedBytes = maxSerializedBytes === null || maxSerializedBytes === undefined
    ? null
    : toPositiveInteger(maxSerializedBytes, null, 1);

  let state = null;
  let loadPromise = null;
  let savePromise = null;
  let saveTimer = null;
  let pendingSaveContext = null;
  let status = {
    id: storeID,
    label: storeLabel,
    status: "idle",
    schemaVersion: storeSchemaVersion,
    dirty: false,
    loadCount: 0,
    saveCount: 0,
    lastLoadedAt: null,
    lastSavedAt: null,
    lastLoadedVersion: null,
    lastError: null,
    serializedBytes: 0,
  };

  function debug(message, details = {}) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
    }
  }

  function warn(message, details = {}) {
    if (logger && typeof logger.warn === "function") {
      logger.warn(message, details);
    }
  }

  async function resolveInitialState(context = {}) {
    const value = typeof initialState === "function"
      ? await initialState(context)
      : initialState;
    return clone(value);
  }

  function getStatus() {
    return {
      ...status,
      hasPendingLoad: Boolean(loadPromise),
      hasPendingSave: Boolean(saveTimer || savePromise),
      ready: state !== null,
    };
  }

  function clearSaveTimer() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }

  async function ensureReady(context = {}) {
    if (state !== null) {
      return clone(state);
    }
    return init(context);
  }

  async function preparePersistedState(context = {}) {
    const envelope = {
      schemaVersion: storeSchemaVersion,
      savedAt: new Date().toISOString(),
      state: clone(state),
    };

    const serializePersisted = typeof serialize === "function"
      ? serialize
      : (value) => JSON.stringify(value);

    let serialized = await serializePersisted(envelope, context);
    let serializedBytes = getByteLength(serialized);
    let normalizedState = clone(envelope.state);

    if (
      storeMaxSerializedBytes !== null &&
      serializedBytes > storeMaxSerializedBytes &&
      typeof prune === "function"
    ) {
      normalizedState = clone(await prune({
        state: clone(envelope.state),
        serializedBytes,
        maxBytes: storeMaxSerializedBytes,
        schemaVersion: storeSchemaVersion,
        context,
      }));
      envelope.state = normalizedState;
      serialized = await serializePersisted(envelope, context);
      serializedBytes = getByteLength(serialized);
    }

    if (storeMaxSerializedBytes !== null && serializedBytes > storeMaxSerializedBytes) {
      throw new Error(
        `file state store size limit exceeded: ${serializedBytes} > ${storeMaxSerializedBytes}`,
      );
    }

    return {
      serialized,
      serializedBytes,
      normalizedState,
    };
  }

  function scheduleSave(context = {}) {
    pendingSaveContext = context;
    clearSaveTimer();

    if (storeDebounceMs === 0) {
      void flush(context).catch((error) => {
        warn("fileStateStore.flush.failed", {
          storeID,
          message: toErrorMessage(error),
        });
      });
      return;
    }

    saveTimer = setTimeout(() => {
      saveTimer = null;
      void flush(pendingSaveContext || context).catch((error) => {
        warn("fileStateStore.flush.failed", {
          storeID,
          message: toErrorMessage(error),
        });
      });
    }, storeDebounceMs);
  }

  async function init(context = {}) {
    if (state !== null) {
      return clone(state);
    }
    if (loadPromise) {
      return loadPromise.then((value) => clone(value));
    }

    status = {
      ...status,
      status: "loading",
      lastError: null,
    };

    loadPromise = (async () => {
      const fallbackState = await resolveInitialState(context);
      const source = await readText(context);

      if (typeof source !== "string" || source.trim() === "") {
        state = clone(fallbackState);
        status = {
          ...status,
          status: "ready",
          loadCount: status.loadCount + 1,
          lastLoadedAt: new Date().toISOString(),
          lastLoadedVersion: null,
          lastError: null,
        };
        return clone(state);
      }

      const parsed = typeof deserialize === "function"
        ? await deserialize(source, context)
        : JSON.parse(source);
      const envelope = isPersistedEnvelope(parsed)
        ? parsed
        : null;
      const loadedVersion = envelope
        ? toPositiveInteger(envelope.schemaVersion, null, 1)
        : null;
      let nextState = clone(envelope ? envelope.state : parsed);
      const shouldMigrate = typeof migrate === "function" && (
        envelope === null ||
        loadedVersion !== storeSchemaVersion
      );

      if (shouldMigrate) {
        nextState = clone(await migrate({
          state: clone(nextState),
          persisted: clone(parsed),
          loadedVersion,
          schemaVersion: storeSchemaVersion,
          initialState: clone(fallbackState),
          context,
        }));
        if (nextState === undefined) {
          nextState = clone(fallbackState);
        }
      }

      state = clone(nextState);
      status = {
        ...status,
        status: "ready",
        loadCount: status.loadCount + 1,
        lastLoadedAt: new Date().toISOString(),
        lastLoadedVersion: loadedVersion,
        lastError: null,
        dirty: shouldMigrate,
      };

      if (shouldMigrate) {
        debug("fileStateStore.migrated", {
          storeID,
          loadedVersion,
          schemaVersion: storeSchemaVersion,
        });
        scheduleSave(context);
      }

      return clone(state);
    })()
      .catch((error) => {
        state = null;
        status = {
          ...status,
          status: "error",
          lastError: toErrorMessage(error),
        };
        if (logger && typeof logger.error === "function") {
          logger.error("fileStateStore.init.failed", {
            storeID,
            message: status.lastError,
          });
        }
        throw error;
      })
      .finally(() => {
        loadPromise = null;
      });

    return loadPromise.then((value) => clone(value));
  }

  async function setState(nextState, options = {}) {
    const { flush: flushNow = false, context = {} } = options;
    await ensureReady(context);

    if (nextState === undefined) {
      throw new Error("file state store setState() requires a defined value");
    }

    state = clone(nextState);
    status = {
      ...status,
      status: savePromise ? "saving" : "ready",
      dirty: true,
      lastError: null,
    };

    if (flushNow) {
      await flush(context);
    } else {
      scheduleSave(context);
    }

    return clone(state);
  }

  async function update(updater, options = {}) {
    if (typeof updater !== "function") {
      throw new Error("file state store update() requires a function");
    }
    const current = await ensureReady(options.context || {});
    const nextState = await updater(clone(current));
    if (nextState === undefined) {
      return clone(current);
    }
    return setState(nextState, options);
  }

  async function reset(nextState, options = {}) {
    const context = options.context || {};
    const fallbackState = nextState === undefined
      ? await resolveInitialState(context)
      : nextState;
    return setState(fallbackState, options);
  }

  async function flush(context = {}) {
    await ensureReady(context);
    clearSaveTimer();

    if (!status.dirty) {
      if (savePromise) {
        await savePromise;
      }
      return clone(state);
    }

    if (savePromise) {
      await savePromise;
      if (status.dirty) {
        return flush(context);
      }
      return clone(state);
    }

    const saveContext = pendingSaveContext || context;
    status = {
      ...status,
      status: "saving",
      lastError: null,
    };

    savePromise = (async () => {
      const prepared = await preparePersistedState(saveContext);
      await writeText(prepared.serialized, saveContext);
      state = clone(prepared.normalizedState);
      status = {
        ...status,
        status: "ready",
        dirty: false,
        saveCount: status.saveCount + 1,
        lastSavedAt: new Date().toISOString(),
        lastError: null,
        serializedBytes: prepared.serializedBytes,
      };
      debug("fileStateStore.saved", {
        storeID,
        serializedBytes: prepared.serializedBytes,
      });
      return clone(state);
    })()
      .catch((error) => {
        status = {
          ...status,
          status: "error",
          lastError: toErrorMessage(error),
        };
        if (logger && typeof logger.error === "function") {
          logger.error("fileStateStore.flush.failed", {
            storeID,
            message: status.lastError,
          });
        }
        throw error;
      })
      .finally(() => {
        savePromise = null;
        pendingSaveContext = null;
      });

    await savePromise;

    if (status.dirty) {
      return flush(context);
    }
    return clone(state);
  }

  async function dispose(context = {}, options = {}) {
    const { flush: flushBeforeDispose = true } = options;
    const hadState = state !== null || Boolean(loadPromise) || Boolean(savePromise) || status.dirty;

    clearSaveTimer();
    if (loadPromise) {
      try {
        await loadPromise;
      }
      catch {}
    }

    if (flushBeforeDispose !== false && status.dirty) {
      await flush(context);
    } else if (savePromise) {
      try {
        await savePromise;
      }
      catch {}
    }

    state = null;
    status = {
      ...status,
      status: hadState ? "disposed" : "idle",
      dirty: false,
    };

    return hadState;
  }

  return {
    init,
    setState,
    update,
    reset,
    flush,
    dispose,
    getStatus,
    getState() {
      return clone(state);
    },
    isReady() {
      return state !== null;
    },
  };
}
