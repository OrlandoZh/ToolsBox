export function createWindowManager({ logger, mountWindowFeature }) {
  const active = new Map();

  function isUsableWindow(window) {
    return Boolean(window && !window.closed);
  }

  function safeCleanup(window, cleanup) {
    if (typeof cleanup !== "function") {
      return;
    }

    try {
      cleanup();
    } catch (error) {
      logger.error("window.cleanup.failed", {
        href: window?.location?.href || "unknown",
        message: String(error?.message || error),
      });
    }
  }

  function safeMount(window) {
    try {
      const cleanup = mountWindowFeature(window);
      return typeof cleanup === "function" ? cleanup : () => {};
    } catch (error) {
      logger.error("window.mount.failed", {
        href: window?.location?.href || "unknown",
        message: String(error?.message || error),
      });
      return () => {};
    }
  }

  function onLoad(window) {
    if (!isUsableWindow(window)) {
      return;
    }

    if (active.has(window)) {
      return;
    }

    const cleanup = safeMount(window);
    active.set(window, cleanup);

    logger.debug("window.load", {
      href: window?.location?.href || "unknown",
    });
  }

  function onUnload(window) {
    if (!window) {
      return;
    }

    const cleanup = active.get(window);
    if (cleanup) {
      safeCleanup(window, cleanup);
      active.delete(window);
    }

    logger.debug("window.unload", {
      href: window?.location?.href || "unknown",
    });
  }

  function remount(window) {
    if (!window) {
      return;
    }
    onUnload(window);
    onLoad(window);
  }

  function remountAll() {
    Array.from(active.keys()).forEach((window) => remount(window));
  }

  function loadAll(windows = []) {
    windows.forEach((window) => onLoad(window));
  }

  function reset() {
    Array.from(active.keys()).forEach((window) => onUnload(window));
  }

  return {
    onLoad,
    onUnload,
    remount,
    remountAll,
    loadAll,
    reset,
  };
}
