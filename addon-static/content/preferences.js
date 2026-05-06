(function () {
  const COMPACT_LAYOUT_MAX_WIDTH = 620;
  const THEME_HELPER_KEY = "__CLEANROOM_THEME_CONTRACT__";
  const WINDOW_BRIDGE_KEY = "__CLEANROOM_PREFERENCE_BRIDGE__";
  const INIT_API_KEY = "initCleanroomPreferences";
  const STORAGE_KEY = "__cleanroomPreferenceThemeState__";
  const PREF_ELEMENT_ID = "pref-themeMode";
  const PREFERENCE_BINDING_MODE_BRIDGE = "bridge";
  const ROOT_SELECTOR = ".cleanroom-pref-root";
  const FIELD_ROW_SELECTOR = ".cleanroom-pref-field-row";
  const DEFAULT_MODE = "follow-host";
  const INLINE_LAYOUT_MODE = "inline";
  const STACKED_LAYOUT_MODE = "stacked";
  const PREFERENCE_BINDINGS = Object.freeze([
    Object.freeze({
      prefId: "pref-enabled",
      controlId: "cleanroom-enabled",
      bridgeKey: "enabled",
      type: "bool",
      fallback: false,
    }),
    Object.freeze({
      prefId: "pref-menuLabel",
      controlId: "cleanroom-menu-label",
      bridgeKey: "menuLabel",
      type: "string",
      fallback: "",
    }),
    Object.freeze({
      prefId: "pref-logLevel",
      controlId: "cleanroom-log-level",
      bridgeKey: "logLevel",
      type: "string",
      fallback: "info",
    }),
    Object.freeze({
      prefId: "pref-themeMode",
      controlId: "cleanroom-theme-mode",
      bridgeKey: "themeMode",
      type: "string",
      fallback: DEFAULT_MODE,
      normalize(value) {
        return normalizeMode(value);
      },
    }),
    Object.freeze({
      prefId: "pref-rw-enabled",
      controlId: "cleanroom-rw-enabled",
      bridgeKey: "researchWorkflow.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-item-pane-enabled",
      controlId: "cleanroom-rw-item-pane-enabled",
      bridgeKey: "researchWorkflow.itemPane.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-menu-enabled",
      controlId: "cleanroom-rw-menu-enabled",
      bridgeKey: "researchWorkflow.menu.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-reader-enabled",
      controlId: "cleanroom-rw-reader-enabled",
      bridgeKey: "researchWorkflow.reader.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-status-available",
      controlId: "cleanroom-rw-status-available",
      bridgeKey: "researchWorkflow.status.available",
      type: "string",
      fallback: "todo, reading, reviewed, done",
    }),
    Object.freeze({
      prefId: "pref-rw-read-status-available",
      controlId: "cleanroom-rw-read-status-available",
      bridgeKey: "researchWorkflow.readStatus.available",
      type: "string",
      fallback: "unread, reading, read",
    }),
    Object.freeze({
      prefId: "pref-rw-item-tree-tags-enabled",
      controlId: "cleanroom-rw-item-tree-tags",
      bridgeKey: "researchWorkflow.itemTree.tags.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-item-tree-text-tags-enabled",
      controlId: "cleanroom-rw-item-tree-text-tags",
      bridgeKey: "researchWorkflow.itemTree.textTags.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-item-tree-status-enabled",
      controlId: "cleanroom-rw-item-tree-status",
      bridgeKey: "researchWorkflow.itemTree.status.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-item-tree-rating-enabled",
      controlId: "cleanroom-rw-item-tree-rating",
      bridgeKey: "researchWorkflow.itemTree.rating.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-item-tree-remark-enabled",
      controlId: "cleanroom-rw-item-tree-remark",
      bridgeKey: "researchWorkflow.itemTree.remark.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-item-tree-creator-enabled",
      controlId: "cleanroom-rw-item-tree-creator",
      bridgeKey: "researchWorkflow.itemTree.creator.enabled",
      type: "bool",
      fallback: false,
    }),
    Object.freeze({
      prefId: "pref-rw-item-tree-publication-enabled",
      controlId: "cleanroom-rw-item-tree-publication",
      bridgeKey: "researchWorkflow.itemTree.publication.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-item-tree-date-added-enabled",
      controlId: "cleanroom-rw-item-tree-date-added",
      bridgeKey: "researchWorkflow.itemTree.dateAdded.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-item-tree-date-modified-enabled",
      controlId: "cleanroom-rw-item-tree-date-modified",
      bridgeKey: "researchWorkflow.itemTree.dateModified.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-item-tree-read-status-enabled",
      controlId: "cleanroom-rw-item-tree-read-status",
      bridgeKey: "researchWorkflow.itemTree.readStatus.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-item-tree-custom-fields-enabled",
      controlId: "cleanroom-rw-item-tree-custom-fields",
      bridgeKey: "researchWorkflow.itemTree.customFields.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-rw-item-tree-custom-fields-keys",
      controlId: "cleanroom-rw-custom-fields",
      bridgeKey: "researchWorkflow.itemTree.customFields.keys",
      type: "string",
      fallback: "numPages, price",
    }),
    Object.freeze({
      prefId: "pref-rw-text-tags-prefix",
      controlId: "cleanroom-rw-text-tag-prefix",
      bridgeKey: "researchWorkflow.textTags.prefix",
      type: "string",
      fallback: "#",
    }),
    Object.freeze({
      prefId: "pref-rw-status-tags-prefix",
      controlId: "cleanroom-rw-status-tag-prefix",
      bridgeKey: "researchWorkflow.statusTags.prefix",
      type: "string",
      fallback: "/",
    }),
    Object.freeze({
      prefId: "pref-rw-rating-selected-mark",
      controlId: "cleanroom-rw-rating-mark",
      bridgeKey: "researchWorkflow.rating.selectedMark",
      type: "string",
      fallback: "*",
    }),
    Object.freeze({
      prefId: "pref-rw-remark-extra-label",
      controlId: "cleanroom-rw-remark-label",
      bridgeKey: "researchWorkflow.remark.extraLabel",
      type: "string",
      fallback: "Remark",
    }),
    Object.freeze({
      prefId: "pref-rw-read-status-extra-label",
      controlId: "cleanroom-rw-read-status-label",
      bridgeKey: "researchWorkflow.readStatus.extraLabel",
      type: "string",
      fallback: "Read Status",
    }),
    Object.freeze({
      prefId: "pref-rw-progress-extra-label",
      controlId: "cleanroom-rw-progress-label",
      bridgeKey: "researchWorkflow.progress.extraLabel",
      type: "string",
      fallback: "Reading Progress",
    }),
    Object.freeze({
      prefId: "pref-workbench-graph-enabled",
      controlId: "cleanroom-workbench-graph",
      bridgeKey: "researchWorkbench.graph.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-workbench-matrix-enabled",
      controlId: "cleanroom-workbench-matrix",
      bridgeKey: "researchWorkbench.matrix.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-workbench-notes-enabled",
      controlId: "cleanroom-workbench-notes",
      bridgeKey: "researchWorkbench.notes.enabled",
      type: "bool",
      fallback: true,
    }),
    Object.freeze({
      prefId: "pref-workbench-tabs-enabled",
      controlId: "cleanroom-workbench-tabs",
      bridgeKey: "researchWorkbench.tabs.enabled",
      type: "bool",
      fallback: true,
    }),
  ]);
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
    Object.freeze({
      id: "cleanroom-pref-workflow-section",
      key: "cleanroom-pref-workflow-section",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-pref-workflow-hint",
      key: "cleanroom-pref-workflow-hint",
      attribute: null,
    }),
    Object.freeze({
      id: "cleanroom-rw-enabled",
      key: "cleanroom-pref-rw-enabled",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-item-pane-enabled",
      key: "cleanroom-pref-rw-item-pane-enabled",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-menu-enabled",
      key: "cleanroom-pref-rw-menu-enabled",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-reader-enabled",
      key: "cleanroom-pref-rw-reader-enabled",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-pref-rw-status-available-text",
      key: "cleanroom-pref-rw-status-available",
      attribute: "value",
    }),
    Object.freeze({
      id: "cleanroom-pref-rw-read-status-available-text",
      key: "cleanroom-pref-rw-read-status-available",
      attribute: "value",
    }),
    Object.freeze({
      id: "cleanroom-pref-research-columns-section",
      key: "cleanroom-pref-research-columns-section",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-pref-research-columns-hint",
      key: "cleanroom-pref-research-columns-hint",
      attribute: null,
    }),
    Object.freeze({
      id: "cleanroom-rw-item-tree-tags",
      key: "cleanroom-pref-rw-tags-column",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-item-tree-text-tags",
      key: "cleanroom-pref-rw-text-tags-column",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-item-tree-status",
      key: "cleanroom-pref-rw-status-column",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-item-tree-rating",
      key: "cleanroom-pref-rw-rating-column",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-item-tree-remark",
      key: "cleanroom-pref-rw-remark-column",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-item-tree-creator",
      key: "cleanroom-pref-rw-creator-column",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-item-tree-publication",
      key: "cleanroom-pref-rw-publication-column",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-item-tree-date-added",
      key: "cleanroom-pref-rw-date-added-column",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-item-tree-date-modified",
      key: "cleanroom-pref-rw-date-modified-column",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-item-tree-read-status",
      key: "cleanroom-pref-rw-read-status-column",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-rw-item-tree-custom-fields",
      key: "cleanroom-pref-rw-custom-fields-column",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-pref-rw-custom-fields-text",
      key: "cleanroom-pref-rw-custom-fields",
      attribute: "value",
    }),
    Object.freeze({
      id: "cleanroom-pref-rw-text-tag-prefix-text",
      key: "cleanroom-pref-rw-text-tag-prefix",
      attribute: "value",
    }),
    Object.freeze({
      id: "cleanroom-pref-rw-status-tag-prefix-text",
      key: "cleanroom-pref-rw-status-tag-prefix",
      attribute: "value",
    }),
    Object.freeze({
      id: "cleanroom-pref-rw-rating-mark-text",
      key: "cleanroom-pref-rw-rating-mark",
      attribute: "value",
    }),
    Object.freeze({
      id: "cleanroom-pref-rw-remark-label-text",
      key: "cleanroom-pref-rw-remark-label",
      attribute: "value",
    }),
    Object.freeze({
      id: "cleanroom-pref-rw-read-status-label-text",
      key: "cleanroom-pref-rw-read-status-label",
      attribute: "value",
    }),
    Object.freeze({
      id: "cleanroom-pref-rw-progress-label-text",
      key: "cleanroom-pref-rw-progress-label",
      attribute: "value",
    }),
    Object.freeze({
      id: "cleanroom-pref-workbench-section",
      key: "cleanroom-pref-workbench-section",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-pref-workbench-hint",
      key: "cleanroom-pref-workbench-hint",
      attribute: null,
    }),
    Object.freeze({
      id: "cleanroom-workbench-graph",
      key: "cleanroom-pref-workbench-graph",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-workbench-matrix",
      key: "cleanroom-pref-workbench-matrix",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-workbench-notes",
      key: "cleanroom-pref-workbench-notes",
      attribute: "label",
    }),
    Object.freeze({
      id: "cleanroom-workbench-tabs",
      key: "cleanroom-pref-workbench-tabs",
      attribute: "label",
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

  function getBridgePreferenceNames(options = {}) {
    const bridge = getBridge(options);
    const preferenceNames = bridge && typeof bridge.preferenceNames === "object"
      ? bridge.preferenceNames
      : null;
    return preferenceNames && !Array.isArray(preferenceNames)
      ? preferenceNames
      : null;
  }

  function getPreferenceBindingMode(options = {}) {
    const bridge = getBridge(options);
    const mode = String(bridge?.preferenceBindingMode || "").trim().toLowerCase();
    return mode === PREFERENCE_BINDING_MODE_BRIDGE
      ? PREFERENCE_BINDING_MODE_BRIDGE
      : "native";
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

  function getPreferenceElement(prefId) {
    return typeof document?.getElementById === "function"
      ? document.getElementById(prefId)
      : null;
  }

  function getPreferenceControl(controlId) {
    return typeof document?.getElementById === "function"
      ? document.getElementById(controlId)
      : null;
  }

  function applyBridgePreferenceNames(options = {}) {
    const preferenceNames = getBridgePreferenceNames(options);
    if (!preferenceNames) {
      return {
        applied: false,
        appliedCount: 0,
        prefNames: {},
      };
    }

    let appliedCount = 0;
    const resolvedPrefNames = {};
    PREFERENCE_BINDINGS.forEach((binding) => {
      const prefName = typeof preferenceNames[binding.bridgeKey] === "string"
        ? preferenceNames[binding.bridgeKey].trim()
        : "";
      if (!prefName) {
        return;
      }
      resolvedPrefNames[binding.prefId] = prefName;
      const prefElement = getPreferenceElement(binding.prefId);
      if (!prefElement) {
        return;
      }
      if (typeof prefElement.setAttribute === "function") {
        prefElement.setAttribute("name", prefName);
      }
      try {
        prefElement.name = prefName;
      } catch {}
      appliedCount += 1;
    });

    return {
      applied: appliedCount > 0,
      appliedCount,
      prefNames: resolvedPrefNames,
    };
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

  function readBooleanPref(prefName, fallbackValue = false) {
    const services = getServices();
    if (
      !prefName
      || !services?.prefs
      || typeof services.prefs.getBoolPref !== "function"
    ) {
      return Boolean(fallbackValue);
    }
    try {
      return Boolean(services.prefs.getBoolPref(prefName, Boolean(fallbackValue)));
    } catch {
      return Boolean(fallbackValue);
    }
  }

  function readStringPref(prefName, fallbackValue = "") {
    const services = getServices();
    if (
      !prefName
      || !services?.prefs
      || typeof services.prefs.getStringPref !== "function"
    ) {
      return String(fallbackValue || "");
    }
    try {
      return String(services.prefs.getStringPref(prefName, String(fallbackValue || "")) || fallbackValue || "");
    } catch {
      return String(fallbackValue || "");
    }
  }

  function writeBooleanPref(prefName, value) {
    const services = getServices();
    if (
      !prefName
      || !services?.prefs
      || typeof services.prefs.setBoolPref !== "function"
    ) {
      return;
    }
    try {
      services.prefs.setBoolPref(prefName, Boolean(value));
    } catch {}
  }

  function writeStringPref(prefName, value) {
    const services = getServices();
    if (
      !prefName
      || !services?.prefs
      || typeof services.prefs.setStringPref !== "function"
    ) {
      return;
    }
    try {
      services.prefs.setStringPref(prefName, String(value || ""));
    } catch {}
  }

  function setControlValue(control, binding, value) {
    if (!control) {
      return;
    }
    if (binding.type === "bool") {
      const nextValue = Boolean(value);
      try {
        control.checked = nextValue;
      } catch {}
      if (typeof control.setAttribute === "function") {
        control.setAttribute("checked", nextValue ? "true" : "false");
      }
      return;
    }

    const nextValue = binding.normalize ? binding.normalize(value) : String(value || "");
    try {
      control.value = nextValue;
    } catch {}
    if (typeof control.setAttribute === "function") {
      control.setAttribute("value", nextValue);
    }
  }

  function readControlValue(control, binding) {
    if (!control) {
      return binding.fallback;
    }
    if (binding.type === "bool") {
      return Boolean(control.checked);
    }
    const rawValue = typeof control.value === "string"
      ? control.value
      : (typeof control.getAttribute === "function" ? control.getAttribute("value") : "");
    return binding.normalize ? binding.normalize(rawValue) : String(rawValue || "");
  }

  function createBridgePreferenceBindings(options = {}) {
    if (getPreferenceBindingMode(options) !== PREFERENCE_BINDING_MODE_BRIDGE) {
      return {
        active: false,
        appliedCount: 0,
        prefNames: {},
        syncAll() {},
        dispose() {},
      };
    }

    const resolvedNames = applyBridgePreferenceNames(options);
    if (!resolvedNames.applied) {
      return {
        active: false,
        appliedCount: 0,
        prefNames: resolvedNames.prefNames || {},
        syncAll() {},
        dispose() {},
      };
    }

    const listeners = [];
    const syncControllers = [];

    PREFERENCE_BINDINGS.forEach((binding) => {
      const prefName = resolvedNames.prefNames[binding.prefId] || null;
      const control = getPreferenceControl(binding.controlId);
      if (!prefName || !control) {
        return;
      }

      const syncFromPrefs = () => {
        const value = binding.type === "bool"
          ? readBooleanPref(prefName, binding.fallback)
          : readStringPref(prefName, binding.fallback);
        setControlValue(control, binding, value);
        return value;
      };

      const writeFromControl = () => {
        const value = readControlValue(control, binding);
        if (binding.type === "bool") {
          writeBooleanPref(prefName, value);
        } else {
          writeStringPref(prefName, value);
        }
      };

      ["command", "change", "input"].forEach((eventName) => {
        if (typeof control.addEventListener !== "function") {
          return;
        }
        const handler = () => {
          writeFromControl();
        };
        try {
          control.addEventListener(eventName, handler);
          listeners.push({
            control,
            eventName,
            handler,
          });
        } catch {}
      });

      syncControllers.push({
        prefId: binding.prefId,
        prefName,
        controlId: binding.controlId,
        syncFromPrefs,
      });
      syncFromPrefs();
    });

    return {
      active: syncControllers.length > 0,
      appliedCount: syncControllers.length,
      prefNames: resolvedNames.prefNames || {},
      syncAll() {
        syncControllers.forEach((controller) => {
          controller.syncFromPrefs();
        });
      },
      dispose() {
        listeners.forEach(({ control, eventName, handler }) => {
          if (typeof control?.removeEventListener !== "function") {
            return;
          }
          try {
            control.removeEventListener(eventName, handler);
          } catch {}
        });
      },
    };
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

    const preferenceBridge = createBridgePreferenceBindings({
      bridge,
    });
    const bridgeLocalization = applyBridgeLocalization({
      bridge,
    });
    const fluentTranslationRequested = requestFluentTranslation(root);
    const layoutController = observeCompactLayout(root);

    const prefName = getThemeModePrefName();
    let rawMode = readRawThemeMode(prefName);
    let mode = normalizeMode(rawMode);
    persistNormalizedMode(prefName, rawMode, mode);
    preferenceBridge.syncAll();

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
        preferenceBridge.syncAll();
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
      preferenceBridge.dispose();

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
      preferenceBindingMode: getPreferenceBindingMode({
        bridge,
      }),
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
      preferenceBindingMode: getPreferenceBindingMode({
        bridge,
      }),
      preferenceBridgeApplied: preferenceBridge.active,
      preferenceBridgeAppliedCount: preferenceBridge.appliedCount,
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
