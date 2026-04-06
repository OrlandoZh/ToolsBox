import {
  observeThemeOnElement,
  THEME_MODES,
  normalizeThemeMode,
} from "./theme-contract.js";

function isUsableWindow(window) {
  return Boolean(
    window
      && !window.closed
      && window.document
      && window.document.documentElement,
  );
}

function isUsableElement(element) {
  return Boolean(
    element
      && typeof element === "object"
      && (element.ownerDocument || element.style || typeof element.setAttribute === "function"),
  );
}

export function createThemeManager({ prefs = null, logger = null } = {}) {
  const mountedWindows = new Map();
  const mountedElements = new Map();
  let mode = normalizeThemeMode(prefs?.get?.("themeMode"));

  function debug(message, details = {}) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
    }
  }

  function mountTarget(collection, key, element, options = {}, debugEvent = "theme.mountTarget") {
    if (!isUsableElement(element)) {
      return () => {};
    }

    if (collection.has(key)) {
      collection.get(key).observer.refresh();
      return () => {
        unmountTarget(collection, key);
      };
    }

    const previousColorScheme = element?.style && typeof element.style.colorScheme === "string"
      ? element.style.colorScheme
      : "";
    const observer = observeThemeOnElement(element, {
      getMode: () => mode,
      window: options.window || null,
      previousColorScheme,
    });
    collection.set(key, {
      element,
      observer,
    });

    debug(debugEvent, {
      mode,
      mountedWindowCount: mountedWindows.size,
      mountedElementCount: mountedElements.size,
    });

    return () => {
      unmountTarget(collection, key);
    };
  }

  function unmountTarget(collection, key, debugEvent = "theme.unmountTarget") {
    const entry = collection.get(key);
    if (!entry) {
      return false;
    }

    try {
      entry.observer.dispose();
    }
    catch {}

    collection.delete(key);
    debug(debugEvent, {
      mode,
      mountedWindowCount: mountedWindows.size,
      mountedElementCount: mountedElements.size,
    });
    return true;
  }

  function applyAll() {
    mountedWindows.forEach((entry) => {
      entry.observer.refresh();
    });
    mountedElements.forEach((entry) => {
      entry.observer.refresh();
    });

    debug("theme.applyAll", {
      mode,
      mountedWindowCount: mountedWindows.size,
      mountedElementCount: mountedElements.size,
    });
  }

  function setMode(nextMode) {
    mode = normalizeThemeMode(nextMode);
    applyAll();
    return mode;
  }

  function syncFromPrefs() {
    return setMode(prefs?.get?.("themeMode"));
  }

  function mountWindow(window) {
    if (!isUsableWindow(window)) {
      return () => {};
    }

    return mountTarget(
      mountedWindows,
      window,
      window.document.documentElement,
      { window },
      "theme.mountWindow",
    );
  }

  function mountElement(element, options = {}) {
    if (!isUsableElement(element)) {
      return () => {};
    }

    return mountTarget(
      mountedElements,
      element,
      element,
      {
        window: options.window || element?.ownerDocument?.defaultView || null,
      },
      "theme.mountElement",
    );
  }

  function unmountWindow(window) {
    return unmountTarget(mountedWindows, window, "theme.unmountWindow");
  }

  function unmountElement(element) {
    return unmountTarget(mountedElements, element, "theme.unmountElement");
  }

  function getMode() {
    return mode;
  }

  function getMountedWindowCount() {
    return mountedWindows.size;
  }

  function getMountedElementCount() {
    return mountedElements.size;
  }

  return {
    THEME_MODES,
    getMode,
    getMountedWindowCount,
    getMountedElementCount,
    setMode,
    syncFromPrefs,
    mountWindow,
    unmountWindow,
    mountElement,
    unmountElement,
  };
}

export { THEME_MODES, normalizeThemeMode };
