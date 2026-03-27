function toErrorMessage(error) {
  if (!error) {
    return "unknown";
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error.message || error);
}

export function createResourceLoader({
  id,
  label,
  load,
  validate,
  dispose,
  logger,
} = {}) {
  const loaderID = String(id || "").trim();
  if (!loaderID) {
    throw new Error("resource loader id is required");
  }
  if (typeof load !== "function") {
    throw new Error("resource loader load() is required");
  }

  let resource = null;
  let initPromise = null;
  let state = {
    id: loaderID,
    label: String(label || loaderID),
    status: "idle",
    loadCount: 0,
    lastLoadedAt: null,
    lastDisposedAt: null,
    lastError: null,
  };

  function getStatus() {
    return {
      ...state,
      hasResource: resource !== null,
      hasPendingInit: Boolean(initPromise),
      ready: state.status === "ready" && resource !== null,
    };
  }

  async function init(context = {}) {
    if (resource !== null) {
      return resource;
    }
    if (initPromise) {
      return initPromise;
    }

    state = {
      ...state,
      status: "loading",
      lastError: null,
    };

    initPromise = (async () => {
      const loaded = await load(context);
      if (typeof validate === "function") {
        await validate(loaded, context);
      }
      resource = loaded;
      state = {
        ...state,
        status: "ready",
        loadCount: state.loadCount + 1,
        lastLoadedAt: new Date().toISOString(),
        lastError: null,
      };
      return resource;
    })()
      .catch((error) => {
        resource = null;
        state = {
          ...state,
          status: "error",
          lastError: toErrorMessage(error),
        };
        if (logger && typeof logger.error === "function") {
          logger.error("resource-loader.init.failed", {
            resourceID: loaderID,
            message: state.lastError,
          });
        }
        throw error;
      })
      .finally(() => {
        initPromise = null;
      });

    return initPromise;
  }

  async function release(context = {}) {
    if (initPromise) {
      try {
        await initPromise;
      }
      catch {}
    }

    if (resource === null) {
      if (state.status !== "error") {
        state = {
          ...state,
          status: "idle",
        };
      }
      return false;
    }

    const current = resource;
    resource = null;

    try {
      if (typeof dispose === "function") {
        await dispose(current, context);
      }
      state = {
        ...state,
        status: "disposed",
        lastDisposedAt: new Date().toISOString(),
        lastError: null,
      };
      return true;
    }
    catch (error) {
      state = {
        ...state,
        status: "error",
        lastDisposedAt: new Date().toISOString(),
        lastError: toErrorMessage(error),
      };
      if (logger && typeof logger.error === "function") {
        logger.error("resource-loader.dispose.failed", {
          resourceID: loaderID,
          message: state.lastError,
        });
      }
      throw error;
    }
  }

  return {
    init,
    dispose: release,
    getStatus,
    getResource() {
      return resource;
    },
    isReady() {
      return getStatus().ready;
    },
  };
}
