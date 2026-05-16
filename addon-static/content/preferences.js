const WINDOW_BRIDGE_KEY = "__CLEANROOM_PREFERENCE_BRIDGE__";
const INIT_API_KEY = "initCleanroomPreferences";
const THEME_CONTRACT_KEY = "__CLEANROOM_THEME_CONTRACT__";
const COMPACT_WIDTH = 640;
const bridge = window[WINDOW_BRIDGE_KEY];

const PREF_BINDINGS = Object.freeze({
  enabled: { prefID: "pref-enabled", controlID: "cleanroom-enabled", type: "bool", event: "command" },
  menuLabel: { prefID: "pref-menuLabel", controlID: "cleanroom-menu-label", type: "string", event: "change" },
  logLevel: { prefID: "pref-logLevel", controlID: "cleanroom-log-level", type: "string", event: "change" },
  themeMode: { prefID: "pref-themeMode", controlID: "cleanroom-theme-mode", type: "string", event: "command" },
});

const LOCALIZED_ELEMENTS = Object.freeze([
  ["cleanroom-pref-caption", "cleanroom-pref-caption", "label"],
  ["cleanroom-pref-enabled", "cleanroom-enabled", "label"],
  ["cleanroom-pref-menu-section", "cleanroom-pref-menu-section", "label"],
  ["cleanroom-pref-menu-label", "cleanroom-pref-menu-label-text", "value"],
  ["cleanroom-pref-menu-hint", "cleanroom-pref-menu-hint", "text"],
  ["cleanroom-pref-logging-section", "cleanroom-pref-logging-section", "label"],
  ["cleanroom-pref-log-level", "cleanroom-pref-log-level-text", "value"],
  ["cleanroom-pref-theme-section", "cleanroom-pref-theme-section", "label"],
  ["cleanroom-pref-theme-mode", "cleanroom-pref-theme-mode-text", "value"],
  ["cleanroom-pref-theme-follow-host", "cleanroom-pref-theme-follow-host", "label"],
  ["cleanroom-pref-theme-light", "cleanroom-pref-theme-light", "label"],
  ["cleanroom-pref-theme-dark", "cleanroom-pref-theme-dark", "label"],
  ["cleanroom-pref-theme-hint", "cleanroom-pref-theme-hint", "text"],
]);

let activeCleanup = null;

function getDocument() {
  return globalThis.document || null;
}

function getRoot(explicitRoot) {
  if (explicitRoot) {
    return explicitRoot;
  }
  const doc = getDocument();
  return doc?.querySelector?.(".cleanroom-pref-root") || doc?.documentElement || null;
}

function getElement(id) {
  return getDocument()?.getElementById?.(id) || null;
}

function getPrefName(binding) {
  const element = getElement(binding.prefID);
  return element?.getAttribute?.("name") || element?.name || "";
}

function getPrefValue(name, type, fallback) {
  const prefs = globalThis.Services?.prefs;
  if (!prefs || !name) {
    return fallback;
  }
  if (type === "bool") {
    return prefs.getBoolPref(name, fallback);
  }
  return prefs.getStringPref(name, fallback);
}

function setPrefValue(name, type, value) {
  const prefs = globalThis.Services?.prefs;
  if (!prefs || !name) {
    return;
  }
  if (type === "bool") {
    prefs.setBoolPref(name, Boolean(value));
    return;
  }
  prefs.setStringPref(name, String(value));
}

function normalizeThemeMode(value) {
  const contract = globalThis[THEME_CONTRACT_KEY];
  if (contract?.normalizeThemeMode) {
    return contract.normalizeThemeMode(value);
  }
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "auto") {
    return "follow-host";
  }
  return ["follow-host", "light", "dark"].includes(normalized) ? normalized : "follow-host";
}

function applyPreferenceBridge(bridge) {
  if (bridge?.preferenceBindingMode !== "bridge" || !bridge.preferenceNames) {
    return {
      applied: false,
      count: 0,
    };
  }

  let count = 0;
  Object.entries(PREF_BINDINGS).forEach(([key, binding]) => {
    const prefName = bridge.preferenceNames[key];
    const prefElement = getElement(binding.prefID);
    if (prefName && prefElement?.setAttribute) {
      prefElement.setAttribute("name", prefName);
      count += 1;
    }
  });

  return {
    applied: count > 0,
    count,
  };
}

function readThemeMode() {
  const binding = PREF_BINDINGS.themeMode;
  const prefName = getPrefName(binding);
  const rawMode = getPrefValue(prefName, "string", "follow-host");
  const normalized = normalizeThemeMode(rawMode);
  if (rawMode !== normalized) {
    setPrefValue(prefName, "string", normalized);
  }
  const control = getElement(binding.controlID);
  if (control) {
    control.value = normalized;
  }
  return normalized;
}

function syncControlFromPref(binding) {
  const prefName = getPrefName(binding);
  const control = getElement(binding.controlID);
  if (!control) {
    return;
  }
  const fallback = binding.type === "bool" ? Boolean(control.checked) : String(control.value || "");
  const value = getPrefValue(prefName, binding.type, fallback);
  if (binding.type === "bool") {
    control.checked = Boolean(value);
  } else {
    control.value = String(value);
  }
}

function bindPreferenceControls(refreshTheme) {
  const cleanups = [];
  Object.values(PREF_BINDINGS).forEach((binding) => {
    const control = getElement(binding.controlID);
    if (!control?.addEventListener) {
      return;
    }
    syncControlFromPref(binding);
    const handler = () => {
      const prefName = getPrefName(binding);
      const value = binding.type === "bool" ? control.checked : control.value;
      setPrefValue(prefName, binding.type, binding === PREF_BINDINGS.themeMode ? normalizeThemeMode(value) : value);
      if (binding === PREF_BINDINGS.themeMode) {
        control.value = normalizeThemeMode(value);
        refreshTheme();
      }
    };
    control.addEventListener(binding.event, handler);
    if (binding.event !== "change") {
      control.addEventListener("change", handler);
    }
    cleanups.push(() => {
      control.removeEventListener?.(binding.event, handler);
      if (binding.event !== "change") {
        control.removeEventListener?.("change", handler);
      }
    });
  });
  return cleanups;
}

function applyLayout(root) {
  const rootClientWidth = Number(root?.clientWidth || 0);
  const rootScrollWidth = Number(root?.scrollWidth || rootClientWidth);
  const hasHorizontalOverflow = rootScrollWidth > rootClientWidth;
  const widthBucket = rootClientWidth > 0 && rootClientWidth < COMPACT_WIDTH ? "compact" : "regular";
  const layoutMode = widthBucket === "compact" || hasHorizontalOverflow ? "stacked" : "inline";

  if (root?.dataset) {
    root.dataset.prefLayout = layoutMode;
    root.dataset.prefWidthBucket = widthBucket;
  }
  root?.setAttribute?.("data-pref-horizontal-overflow", String(hasHorizontalOverflow));

  const rows = root?.querySelectorAll?.(".cleanroom-pref-field-row") || [];
  rows.forEach((row) => {
    if (layoutMode === "stacked") {
      row.setAttribute?.("orient", "vertical");
      row.setAttribute?.("align", "stretch");
    } else {
      row.setAttribute?.("orient", "horizontal");
      row.setAttribute?.("align", "center");
    }
  });

  return {
    layoutMode,
    widthBucket,
    rootClientWidth,
    hasHorizontalOverflow,
  };
}

function getBridgeMessage(strings, id) {
  if (!strings || !id) {
    return null;
  }
  if (typeof strings.getMessage === "function") {
    return strings.getMessage(id)?.value || null;
  }
  return typeof strings[id] === "string" ? strings[id] : null;
}

function applyText(element, attr, value) {
  if (!element || value === null || value === undefined) {
    return false;
  }
  if (attr === "text") {
    element.textContent = String(value);
  } else {
    element.setAttribute?.(attr, String(value));
  }
  return true;
}

function applyBridgeLocalization({ bridge: localizationBridge, root }) {
  let localizedCount = 0;
  LOCALIZED_ELEMENTS.forEach(([messageID, elementID, attr]) => {
    const message = getBridgeMessage(localizationBridge?.strings, messageID);
    const element = getElement(elementID);
    if (applyText(element, attr, message)) {
      localizedCount += 1;
    }
  });

  return {
    applied: localizedCount > 0,
    localizedCount,
  };
}

function requestFluentTranslation(root) {
  if (root && getDocument()?.l10n?.translateFragment) {
    getDocument().l10n.translateFragment(root);
    return true;
  }
  return false;
}

function disposeActiveCleanup() {
  if (typeof activeCleanup === "function") {
    activeCleanup();
    activeCleanup = null;
  }
}

function initPreferences(options = {}) {
  disposeActiveCleanup();

  const currentBridge = options.bridge || bridge || globalThis[WINDOW_BRIDGE_KEY] || null;
  const root = getRoot(options.root);
  const preferenceBridge = applyPreferenceBridge(currentBridge);
  const themePrefName = getPrefName(PREF_BINDINGS.themeMode);
  const themeContract = globalThis[THEME_CONTRACT_KEY];

  let layoutState = applyLayout(root);
  const themeObserver = themeContract?.observeThemeOnElement?.(root, {
    mode: readThemeMode(),
    getMode: readThemeMode,
    clearOnDispose: false,
  });

  const refreshTheme = () => {
    readThemeMode();
    themeObserver?.refresh?.();
  };

  const controlCleanups = bindPreferenceControls(refreshTheme);
  const prefObserver = {
    observe(_subject, _topic, changedName) {
      if (changedName === themePrefName) {
        refreshTheme();
      }
    },
  };
  globalThis.Services?.prefs?.addObserver?.(themePrefName, prefObserver);

  let resizeObserver = null;
  const resizeHandler = () => {
    layoutState = applyLayout(root);
  };
  if (typeof globalThis.ResizeObserver === "function" && root) {
    resizeObserver = new globalThis.ResizeObserver(resizeHandler);
    resizeObserver.observe(root);
  }
  globalThis.addEventListener?.("resize", resizeHandler);

  const unloadHandler = () => disposeActiveCleanup();
  globalThis.addEventListener?.("unload", unloadHandler);

  activeCleanup = () => {
    controlCleanups.forEach((cleanup) => cleanup());
    globalThis.Services?.prefs?.removeObserver?.(themePrefName, prefObserver);
    resizeObserver?.disconnect?.();
    globalThis.removeEventListener?.("resize", resizeHandler);
    globalThis.removeEventListener?.("unload", unloadHandler);
    themeObserver?.dispose?.();
  };

  const bridgeLocalization = applyBridgeLocalization({
    bridge: currentBridge,
    root,
  });
  const fluentTranslationRequested = requestFluentTranslation(root);
  const themeState = themeObserver?.getState?.() || {};

  return {
    ok: true,
    bridge: currentBridge,
    mode: themeState.mode || readThemeMode(),
    effectiveTheme: themeState.effectiveTheme,
    preferenceBindingMode: currentBridge?.preferenceBindingMode || "native",
    preferenceBridgeApplied: preferenceBridge.applied,
    preferenceBridgeAppliedCount: preferenceBridge.count,
    prefName: themePrefName,
    bridgeLocalizationApplied: bridgeLocalization.applied,
    localizedCount: bridgeLocalization.localizedCount,
    fluentTranslationRequested,
    ...layoutState,
  };
}

// Contract marker for preference-pane-governance-lib: window[INIT_API_KEY] = initCleanroomPreferences;
window[INIT_API_KEY] = initPreferences;
