function noop() {}

function isPromiseLike(value) {
  return Boolean(value) && typeof value.then === "function";
}

function toErrorMessage(error) {
  if (!error) {
    return "unknown";
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error.message || error);
}

function isWindowClosedBeforeReadyError(error) {
  const message = toErrorMessage(error).toLowerCase();
  return message === "window closed before ready"
    || message === "window shell closed before ready";
}

function addDisposableListener(target, type, listener) {
  if (!target || typeof target.addEventListener !== "function") {
    return noop;
  }
  target.addEventListener(type, listener);
  return () => {
    if (typeof target.removeEventListener === "function") {
      target.removeEventListener(type, listener);
    }
  };
}

export function isWindowShellUsable(window) {
  return Boolean(window && !window.closed);
}

export function waitForWindowShellReady(window, options = {}) {
  const readyStates = Array.isArray(options.readyStates) && options.readyStates.length > 0
    ? options.readyStates
    : ["interactive", "complete"];

  return new Promise((resolve, reject) => {
    if (!isWindowShellUsable(window)) {
      reject(new Error("window is unavailable"));
      return;
    }

    const doc = window.document || null;
    if (!doc || readyStates.includes(doc.readyState)) {
      resolve(window);
      return;
    }

    let settled = false;
    const cleanups = [];

    const cleanup = () => {
      while (cleanups.length > 0) {
        const dispose = cleanups.pop();
        try {
          dispose();
        }
        catch {}
      }
    };

    const settle = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback(value);
    };

    const onReadyStateChange = () => {
      if (readyStates.includes(doc.readyState)) {
        settle(resolve, window);
      }
    };

    cleanups.push(addDisposableListener(doc, "readystatechange", onReadyStateChange));
    cleanups.push(addDisposableListener(window, "load", () => settle(resolve, window)));
    cleanups.push(addDisposableListener(window, "unload", () => {
      settle(reject, new Error("window closed before ready"));
    }));

    onReadyStateChange();
  });
}

export function createWindowShellManager(options = {}) {
  const {
    logger,
    openWindow,
    mountWindow,
    waitUntilReady = waitForWindowShellReady,
    isWindowAlive = isWindowShellUsable,
    onWindowClosed,
  } = options;

  if (typeof openWindow !== "function") {
    throw new Error("window shell openWindow() is required");
  }

  let activeWindow = null;
  let activeCleanup = noop;
  let detachWindowListeners = noop;
  let openingPromise = null;

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

  function error(message, details = {}) {
    if (logger && typeof logger.error === "function") {
      logger.error(message, details);
    }
  }

  function runCleanup(reason, window = activeWindow) {
    const cleanup = activeCleanup;
    activeCleanup = noop;
    try {
      cleanup();
    }
    catch (cleanupError) {
      warn("windowShell.cleanup.failed", {
        reason,
        href: window?.location?.href || "unknown",
        message: toErrorMessage(cleanupError),
      });
    }
  }

  function clearWindowState(reason, window = activeWindow) {
    if (window && activeWindow && window !== activeWindow) {
      return;
    }

    const closedWindow = activeWindow;
    detachWindowListeners();
    detachWindowListeners = noop;
    runCleanup(reason, closedWindow);
    activeWindow = null;

    if (closedWindow && typeof onWindowClosed === "function") {
      try {
        onWindowClosed({
          window: closedWindow,
          reason,
        });
      }
      catch (closeError) {
        warn("windowShell.onWindowClosed.failed", {
          reason,
          href: closedWindow?.location?.href || "unknown",
          message: toErrorMessage(closeError),
        });
      }
    }
  }

  function attachWindowLifecycle(window) {
    detachWindowListeners();

    const handleClose = () => {
      clearWindowState("window-closed", window);
    };

    const cleanups = [
      addDisposableListener(window, "close", handleClose),
      addDisposableListener(window, "unload", handleClose),
    ];

    detachWindowListeners = () => {
      while (cleanups.length > 0) {
        const dispose = cleanups.pop();
        try {
          dispose();
        }
        catch {}
      }
    };
  }

  async function mount(window, context, reused) {
    runCleanup(reused ? "refresh" : "reopen", window);
    if (typeof mountWindow !== "function") {
      return;
    }

    const cleanup = await mountWindow({
      window,
      context,
      reused,
    });
    activeCleanup = typeof cleanup === "function" ? cleanup : noop;
  }

  function focus() {
    if (!isWindowAlive(activeWindow)) {
      return false;
    }
    try {
      if (typeof activeWindow.focus === "function") {
        activeWindow.focus();
      }
      return true;
    }
    catch (focusError) {
      warn("windowShell.focus.failed", {
        href: activeWindow?.location?.href || "unknown",
        message: toErrorMessage(focusError),
      });
      return false;
    }
  }

  async function open(context = {}) {
    if (isWindowAlive(activeWindow)) {
      focus();
      return {
        window: activeWindow,
        reused: true,
        ready: true,
      };
    }

    if (openingPromise) {
      return openingPromise;
    }

    openingPromise = (async () => {
      const opened = await openWindow(context);
      const window = opened && typeof opened === "object" && "window" in opened
        ? opened.window
        : opened;
      const readyPromise = opened && typeof opened === "object" && "readyPromise" in opened
        ? opened.readyPromise
        : null;

      if (!isWindowAlive(window)) {
        throw new Error("window shell did not open");
      }

      if (isPromiseLike(readyPromise)) {
        await readyPromise;
      } else {
        await waitUntilReady(window, context);
      }

      if (!isWindowAlive(window)) {
        throw new Error("window shell closed before ready");
      }

      activeWindow = window;
      attachWindowLifecycle(window);

      try {
        await mount(window, context, false);
      }
      catch (mountError) {
        clearWindowState("mount-failed", window);
        try {
          if (typeof window.close === "function") {
            window.close();
          }
        }
        catch {}
        throw mountError;
      }

      focus();
      debug("windowShell.opened", {
        href: window?.location?.href || "unknown",
      });

      return {
        window,
        reused: false,
        ready: true,
      };
    })()
      .catch((openError) => {
        const details = {
          href: activeWindow?.location?.href || "unknown",
          message: toErrorMessage(openError),
        };
        if (isWindowClosedBeforeReadyError(openError)) {
          debug("windowShell.open.aborted", details);
        } else {
          error("windowShell.open.failed", details);
        }
        clearWindowState("open-failed");
        throw openError;
      })
      .finally(() => {
        openingPromise = null;
      });

    return openingPromise;
  }

  async function refresh(context = {}) {
    if (!isWindowAlive(activeWindow)) {
      return open(context);
    }

    await mount(activeWindow, context, true);
    focus();

    return {
      window: activeWindow,
      reused: true,
      ready: true,
    };
  }

  function close() {
    if (!isWindowAlive(activeWindow)) {
      clearWindowState("close-noop");
      return false;
    }

    const window = activeWindow;
    try {
      if (typeof window.close === "function") {
        window.close();
      }
    }
    catch (closeError) {
      warn("windowShell.close.failed", {
        href: window?.location?.href || "unknown",
        message: toErrorMessage(closeError),
      });
    }

    clearWindowState("close", window);
    return true;
  }

  function getSnapshot() {
    return {
      open: isWindowAlive(activeWindow),
      hasPendingOpen: Boolean(openingPromise),
      href: activeWindow?.location?.href || null,
    };
  }

  return {
    open,
    refresh,
    focus,
    close,
    isOpen() {
      return isWindowAlive(activeWindow);
    },
    getWindow() {
      return isWindowAlive(activeWindow) ? activeWindow : null;
    },
    getSnapshot,
  };
}
