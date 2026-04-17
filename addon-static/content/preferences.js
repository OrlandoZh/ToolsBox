(function () {
  const COMPACT_LAYOUT_MAX_WIDTH = 620;
  const THEME_HELPER_KEY = "__CLEANROOM_THEME_CONTRACT__";
  const WINDOW_BRIDGE_KEY = "__CLEANROOM_PREFERENCE_BRIDGE__";
  const INIT_API_KEY = "initCleanroomPreferences";
  const STORAGE_KEY = "__cleanroomPreferenceThemeState__";
  const PREF_ELEMENT_ID = "pref-themeMode";
  const ROOT_SELECTOR = ".cleanroom-pref-root";
  const FIELD_ROW_SELECTOR = ".cleanroom-pref-field-row";
  const DEFAULT_MODE = "follow-host";
  const INLINE_LAYOUT_MODE = "inline";
  const STACKED_LAYOUT_MODE = "stacked";
  const LOCALIZED_TEXT_SPECS = Object.freeze([
    Object.freeze({
      id: "cleanroom-pref-caption",
      key: "cleanroom-pref-caption",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-enabled",
      key: "cleanroom-pref-enabled",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-pref-menu-section",
      key: "cleanroom-pref-menu-section",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-pref-menu-label-text",
      key: "cleanroom-pref-menu-label",
      attribute: "value",
    }),
    Object.freeze({
      id: "cleanroom-pref-menu-hint",
      key: "cleanroom-pref-menu-hint",
      attribute: null,
    }),
    Object.freeze({
      id: "cleanroom-pref-logging-section",
      key: "cleanroom-pref-logging-section",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-pref-log-level-text",
      key: "cleanroom-pref-log-level",
      attribute: "value",
    }),
    Object.freeze({
      id: "cleanroom-pref-theme-section",
      key: "cleanroom-pref-theme-section",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-pref-theme-mode-text",
      key: "cleanroom-pref-theme-mode",
      attribute: "value",
    }),
    Object.freeze({
      id: "cleanroom-pref-theme-follow-host",
      key: "cleanroom-pref-theme-follow-host",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-pref-theme-light",
      key: "cleanroom-pref-theme-light",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-pref-theme-dark",
      key: "cleanroom-pref-theme-dark",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-pref-theme-hint",
      key: "cleanroom-pref-theme-hint",
      attribute: null,
    }),
  ]);

  function getThemeHelper() {
    const helper = window[THEME_HELPER_KEY] || globalThis[THEME_HELPER_KEY];
    return helper && typeof helper === "object" ? helper : null;
  }

  function getServices() {
    return window.Services || (typeof Services !== "undefined" ? Services : null);
  }

  function getBridge(options = {}) {
    if (options.bridge && typeof options.bridge === "object") {
      return options.bridge;
    }
    const bridge = window[WINDOW_BRIDGE_KEY];
    return bridge && typeof bridge === "object" ? bridge : null;
  }

  function getBridgeStrings(options = {}) {
    const bridge = getBridge(options);
    const strings = bridge && typeof bridge.strings === "object" ? bridge.strings : null;
    return strings && !Array.isArray(strings) ? strings : null;
  }

  function getRoot(options = {}) {
    if (options.rootElement && typeof options.rootElement === "object") {
      return options.rootElement;
    }
    if (typeof document?.querySelector === "function") {
      const root = document.querySelector(ROOT_SELECTOR);
      if (root) {
        return root;
      }
    }
    return document?.documentElement || null;
  }

  function getThemeModePrefName() {
    const prefElement = document.getElementById(PREF_ELEMENT_ID);
    if (!prefElement) {
      return null;
    }
    const name = prefElement.getAttribute("name") || prefElement.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  }

  function setDatasetAttribute(element, datasetKey, attributeName, value) {
    if (!element || typeof value !== "string") {
      return;
    }
    if (element.dataset && typeof element.dataset === "object") {
      element.dataset[datasetKey] = value;
    }
    if (typeof element.setAttribute === "function") {
      element.setAttribute(attributeName, value);
    }
  }

  function readBoxMetric(root, propertyName) {
    const directValue = Number(root?.[propertyName]);
    if (Number.isFinite(directValue) && directValue > 0) {
      return Math.round(directValue);
    }
    if (typeof root?.getBoundingClientRect === "function") {
      const rect = root.getBoundingClientRect();
      const width = Number(rect?.width);
      if (Number.isFinite(width) && width > 0) {
        return Math.round(width);
      }
    }
    return 0;
  }

  function computeLayoutMetrics(root) {
    const rootClientWidth = readBoxMetric(root, "clientWidth");
    const measuredScrollWidth = readBoxMetric(root, "scrollWidth");
    const rootScrollWidth = Math.max(rootClientWidth, measuredScrollWidth);
    const horizontalOverflowPx = Math.max(0, rootScrollWidth - rootClientWidth);
    const hasHorizontalOverflow = horizontalOverflowPx > 1;
    const layoutMode = rootClientWidth > 0 && rootClientWidth <= COMPACT_LAYOUT_MAX_WIDTH
      ? STACKED_LAYOUT_MODE
      : INLINE_LAYOUT_MODE;
    const widthBucket = layoutMode === STACKED_LAYOUT_MODE ? "compact" : "regular";
    return {
      layoutMode,
      widthBucket,
      rootClientWidth,
      rootScrollWidth,
      horizontalOverflowPx,
      hasHorizontalOverflow,
    };
  }

  function applyFieldRowLayout(root, layoutMode) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return 0;
    }
    const rows = Array.from(root.querySelectorAll(FIELD_ROW_SELECTOR) || []);
    rows.forEach((row) => {
      if (typeof row.setAttribute !== "function") {
        return;
      }
      row.setAttribute("orient", layoutMode === STACKED_LAYOUT_MODE ? "vertical" : "horizontal");
      row.setAttribute("align", layoutMode === STACKED_LAYOUT_MODE ? "stretch" : "center");
      row.setAttribute("data-pref-row-layout", layoutMode);
    });
    return rows.length;
  }

  function applyCompactLayoutState(root) {
    if (!root) {
      return {
        layoutMode: INLINE_LAYOUT_MODE,
        widthBucket: "regular",
        rootClientWidth: 0,
        rootScrollWidth: 0,
        horizontalOverflowPx: 0,
        hasHorizontalOverflow: false,
        rowCount: 0,
      };
    }

    if (typeof root.setAttribute === "function") {
      root.setAttribute("data-pref-root", "true");
    }

    const metrics = computeLayoutMetrics(root);
    setDatasetAttribute(root, "prefLayout", "data-pref-layout", metrics.layoutMode);
    setDatasetAttribute(root, "prefWidthBucket", "data-pref-width-bucket", metrics.widthBucket);
    setDatasetAttribute(
      root,
      "prefHorizontalOverflow",
      "data-pref-horizontal-overflow",
      metrics.hasHorizontalOverflow ? "true" : "false",
    );
    if (typeof root.setAttribute === "function") {
      root.setAttribute(
        "data-pref-horizontal-overflow-px",
        String(metrics.horizontalOverflowPx),
      );
    }

    const rowCount = applyFieldRowLayout(root, metrics.layoutMode);
    return {
      ...metrics,
      rowCount,
    };
  }

  function observeCompactLayout(root) {
    let currentState = applyCompactLayoutState(root);
    const refresh = () => {
      currentState = applyCompactLayoutState(root);
      return currentState;
    };

    let resizeObserver = null;
    const ResizeObserverCtor = window?.ResizeObserver;
    if (typeof ResizeObserverCtor === "function" && root) {
      try {
        resizeObserver = new ResizeObserverCtor(() => {
          refresh();
        });
        resizeObserver.observe(root);
      }
      catch {}
    }

    const onWindowResize = () => {
      refresh();
    };
    try {
      window.addEventListener("resize", onWindowResize);
    }
    catch {}

    if (typeof window?.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        refresh();
      });
    }

    return {
      refresh,
      getState() {
        return currentState;
      },
      dispose() {
        if (resizeObserver && typeof resizeObserver.disconnect === "function") {
          try {
            resizeObserver.disconnect();
          }
          catch {}
        }
        try {
          window.removeEventListener("resize", onWindowResize);
        }
        catch {}
      },
    };
  }

  function setLocalizedElementValue(element, attribute, value) {
    if (!element || typeof value !== "string") {
      return false;
    }
    if (attribute) {
      if (typeof element.setAttribute === "function") {
        element.setAttribute(attribute, value);
      }
      if (attribute in element) {
        try {
          element[attribute] = value;
        }
        catch {}
      }
      return true;
    }

    if ("textContent" in element) {
      element.textContent = value;
      return true;
    }

    if (typeof element.setAttribute === "function") {
      element.setAttribute("value", value);
      return true;
    }

    return false;
  }

  function applyBridgeLocalization(options = {}) {
    const strings = getBridgeStrings(options);
    if (!strings || typeof document?.getElementById !== "function") {
      return {
        applied: false,
        localizedCount: 0,
      };
    }

    let localizedCount = 0;
    LOCALIZED_TEXT_SPECS.forEach((entry) => {
      const element = document.getElementById(entry.id);
      const text = typeof strings[entry.key] === "string" ? strings[entry.key] : "";
      if (!element || !text) {
        return;
      }
      if (setLocalizedElementValue(element, entry.attribute, text)) {
        localizedCount += 1;
      }
    });

    return {
      applied: localizedCount > 0,
      localizedCount,
    };
  }

  function requestFluentTranslation(root) {
    if (!root || !document?.l10n || typeof document.l10n.translateFragment !== "function") {
      return false;
    }
    try {
      const translation = document.l10n.translateFragment(root);
      if (translation && typeof translation.catch === "function") {
        translation.catch(() => {});
      }
      return true;
    }
    catch {
      return false;
    }
  }

  function normalizeMode(value) {
    const helper = getThemeHelper();
    if (helper && typeof helper.normalizeThemeMode === "function") {
      return helper.normalizeThemeMode(value, DEFAULT_MODE);
    }
    const candidate = String(value || "").trim().toLowerCase();
    if (candidate === "auto") {
      return DEFAULT_MODE;
    }
    if (candidate === DEFAULT_MODE || candidate === "light" || candidate === "dark") {
      return candidate;
    }
    return DEFAULT_MODE;
  }

  function readRawThemeMode(prefName) {
    const services = getServices();
    if (
      !prefName
      || !services?.prefs
      || typeof services.prefs.getStringPref !== "function"
    ) {
      return DEFAULT_MODE;
    }
    try {
      return String(services.prefs.getStringPref(prefName, DEFAULT_MODE) || DEFAULT_MODE);
    }
    catch {
      return DEFAULT_MODE;
    }
  }

  function persistNormalizedMode(prefName, rawMode, normalizedMode) {
    const services = getServices();
    if (
      !prefName
      || !services?.prefs
      || typeof services.prefs.setStringPref !== "function"
    ) {
      return;
    }
    if (String(rawMode || "") === String(normalizedMode || "")) {
      return;
    }
    try {
      services.prefs.setStringPref(prefName, normalizedMode);
    }
    catch {}
  }

  function clearExistingState() {
    const previous = window[STORAGE_KEY];
    if (!previous || typeof previous.cleanup !== "function") {
      return;
    }
    try {
      previous.cleanup();
    }
    catch {}
  }

  function initCleanroomPreferences(options = {}) {
    clearExistingState();

    const themeHelper = getThemeHelper();
    const root = getRoot(options);
    const bridge = getBridge(options);
    if (!themeHelper || typeof themeHelper.observeThemeOnElement !== "function") {
      return {
        ok: false,
        bridge,
        rootFound: Boolean(root),
        reason: "theme-helper-unavailable",
      };
    }
    if (!root) {
      return {
        ok: false,
        bridge,
        rootFound: false,
        reason: "preference-root-unavailable",
      };
    }

    const bridgeLocalization = applyBridgeLocalization({
      bridge,
    });
    const fluentTranslationRequested = requestFluentTranslation(root);
    const layoutController = observeCompactLayout(root);

    const prefName = getThemeModePrefName();
    let rawMode = readRawThemeMode(prefName);
    let mode = normalizeMode(rawMode);
    persistNormalizedMode(prefName, rawMode, mode);

    const previousColorScheme = root?.style && typeof root.style.colorScheme === "string"
      ? root.style.colorScheme
      : "";
    const themeControl = themeHelper.observeThemeOnElement(root, {
      getMode() {
        return mode;
      },
      window,
      previousColorScheme,
    });

    const observer = {
      observe(_subject, topic, changedKey) {
        if (topic !== "nsPref:changed" || String(changedKey || "") !== prefName) {
          return;
        }
        rawMode = readRawThemeMode(prefName);
        mode = normalizeMode(rawMode);
        persistNormalizedMode(prefName, rawMode, mode);
        themeControl.refresh();
      },
    };

    const services = getServices();
    if (
      prefName
      && services?.prefs
      && typeof services.prefs.addObserver === "function"
    ) {
      services.prefs.addObserver(prefName, observer);
    }

    const unloadHandler = () => {
      cleanup();
    };

    function cleanup() {
      themeControl.dispose();
      layoutController.dispose();

      if (
        prefName
        && services?.prefs
        && typeof services.prefs.removeObserver === "function"
      ) {
        try {
          services.prefs.removeObserver(prefName, observer);
        }
        catch {}
      }

      try {
        window.removeEventListener("unload", unloadHandler);
      }
      catch {}

      if (window[STORAGE_KEY] && window[STORAGE_KEY].cleanup === cleanup) {
        delete window[STORAGE_KEY];
      }
    }

    window.addEventListener("unload", unloadHandler);
    window[STORAGE_KEY] = {
      bridge,
      cleanup,
      prefName,
      root,
    };

    const state = themeControl.refresh();
    const layoutState = layoutController.refresh();
    return {
      ok: true,
      bridge,
      bridgeLocalizationApplied: bridgeLocalization.applied,
      fluentTranslationRequested,
      localizedCount: bridgeLocalization.localizedCount,
      prefName,
      rootFound: true,
      mode: state.mode,
      effectiveTheme: state.effectiveTheme,
      layoutMode: layoutState.layoutMode,
      widthBucket: layoutState.widthBucket,
      rootClientWidth: layoutState.rootClientWidth,
      rootScrollWidth: layoutState.rootScrollWidth,
      horizontalOverflowPx: layoutState.horizontalOverflowPx,
      hasHorizontalOverflow: layoutState.hasHorizontalOverflow,
      prefRowCount: layoutState.rowCount,
    };
  }

  window[INIT_API_KEY] = initCleanroomPreferences;
})();
