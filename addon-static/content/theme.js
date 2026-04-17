(function () {
  const CONTRACT_KEY = "__CLEANROOM_THEME_CONTRACT__";
  if (globalThis[CONTRACT_KEY]) {
    return;
  }

  const THEME_MODES = Object.freeze({
    FOLLOW_HOST: "follow-host",
    LIGHT: "light",
    DARK: "dark",
  });
  const THEME_MODE_VALUES = Object.freeze([
    THEME_MODES.FOLLOW_HOST,
    THEME_MODES.LIGHT,
    THEME_MODES.DARK,
  ]);
  const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

  const FORCED_THEME_TOKENS = Object.freeze({
    light: Object.freeze({
      "--cleanroom-theme-background": "#f6f8fc",
      "--cleanroom-theme-surface": "#ffffff",
      "--cleanroom-theme-field": "#ffffff",
      "--cleanroom-theme-field-text": "#0f172a",
      "--cleanroom-theme-text-primary": "#0f172a",
      "--cleanroom-theme-text-secondary": "#475569",
      "--cleanroom-theme-border": "#d6dce8",
      "--cleanroom-theme-border-soft": "#c9d2e3",
      "--cleanroom-theme-accent": "#2563eb",
      "--cleanroom-theme-accent-text": "#ffffff",
      "--cleanroom-theme-danger": "#dc2626",
      "--cleanroom-theme-success": "#0f766e",
      "--cleanroom-theme-shadow": "0 10px 24px rgba(15, 23, 42, 0.12)",
    }),
    dark: Object.freeze({
      "--cleanroom-theme-background": "#0f172a",
      "--cleanroom-theme-surface": "#1e293b",
      "--cleanroom-theme-field": "#0b1120",
      "--cleanroom-theme-field-text": "#e2e8f0",
      "--cleanroom-theme-text-primary": "#e2e8f0",
      "--cleanroom-theme-text-secondary": "#93a4bc",
      "--cleanroom-theme-border": "#334155",
      "--cleanroom-theme-border-soft": "#3b4b67",
      "--cleanroom-theme-accent": "#7dd3fc",
      "--cleanroom-theme-accent-text": "#0b1120",
      "--cleanroom-theme-danger": "#fb7185",
      "--cleanroom-theme-success": "#5eead4",
      "--cleanroom-theme-shadow": "0 10px 24px rgba(0, 0, 0, 0.28)",
    }),
  });
  const FORCED_THEME_PROPERTY_NAMES = Object.freeze(
    Object.keys(FORCED_THEME_TOKENS.light),
  );

  function resolveStyleTarget(target) {
    if (!target || typeof target !== "object") {
      return null;
    }
    if (!target.style || typeof target.style !== "object") {
      target.style = {};
    }
    return target.style;
  }

  function setStyleProperty(target, name, value) {
    const style = resolveStyleTarget(target);
    if (!style) {
      return;
    }
    if (typeof style.setProperty === "function") {
      style.setProperty(name, value);
      return;
    }
    style[name] = value;
  }

  function removeStyleProperty(target, name) {
    const style = resolveStyleTarget(target);
    if (!style) {
      return;
    }
    if (typeof style.removeProperty === "function") {
      style.removeProperty(name);
      return;
    }
    delete style[name];
  }

  function toDataAttributeName(key) {
    return `data-${String(key || "").replace(/[A-Z]/gu, (match) => `-${match.toLowerCase()}`)}`;
  }

  function ensureDataset(target) {
    if (!target || typeof target !== "object") {
      return null;
    }
    if (!target.dataset || typeof target.dataset !== "object") {
      target.dataset = {};
    }
    return target.dataset;
  }

  function setDataValue(target, key, value) {
    const dataset = ensureDataset(target);
    if (dataset) {
      dataset[key] = String(value);
    }
    if (typeof target?.setAttribute === "function") {
      target.setAttribute(toDataAttributeName(key), String(value));
      return;
    }
    if (target?.attributes && typeof target.attributes === "object") {
      target.attributes[toDataAttributeName(key)] = String(value);
    }
  }

  function removeDataValue(target, key) {
    if (!target || typeof target !== "object") {
      return;
    }
    if (target.dataset && typeof target.dataset === "object") {
      delete target.dataset[key];
    }
    if (typeof target.removeAttribute === "function") {
      target.removeAttribute(toDataAttributeName(key));
      return;
    }
    if (target.attributes && typeof target.attributes === "object") {
      delete target.attributes[toDataAttributeName(key)];
    }
  }

  function getWindowFromTarget(target, explicitWindow) {
    if (explicitWindow && typeof explicitWindow === "object") {
      return explicitWindow;
    }
    if (target?.ownerDocument?.defaultView) {
      return target.ownerDocument.defaultView;
    }
    if (target?.defaultView) {
      return target.defaultView;
    }
    return null;
  }

  function getThemeMediaQueryList(targetWindow) {
    if (!targetWindow || typeof targetWindow.matchMedia !== "function") {
      return null;
    }
    try {
      return targetWindow.matchMedia(DARK_MEDIA_QUERY);
    } catch {
      return null;
    }
  }

  function normalizeThemeMode(value, fallback) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "auto") {
      return THEME_MODES.FOLLOW_HOST;
    }
    if (THEME_MODE_VALUES.includes(normalized)) {
      return normalized;
    }
    return fallback || THEME_MODES.FOLLOW_HOST;
  }

  function detectHostTheme(targetWindow, mediaQueryList) {
    const query = mediaQueryList || getThemeMediaQueryList(targetWindow);
    return query?.matches ? THEME_MODES.DARK : THEME_MODES.LIGHT;
  }

  function resolveEffectiveTheme(mode, targetWindow, mediaQueryList) {
    const normalizedMode = normalizeThemeMode(mode);
    return normalizedMode === THEME_MODES.FOLLOW_HOST
      ? detectHostTheme(targetWindow, mediaQueryList)
      : normalizedMode;
  }

  function applyForcedThemeTokens(target, effectiveTheme) {
    const tokens = FORCED_THEME_TOKENS[effectiveTheme] || FORCED_THEME_TOKENS.light;
    Object.entries(tokens).forEach(([name, value]) => {
      setStyleProperty(target, name, value);
    });
  }

  function clearForcedThemeTokens(target) {
    FORCED_THEME_PROPERTY_NAMES.forEach((name) => {
      removeStyleProperty(target, name);
    });
  }

  function applyThemeToElement(target, options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const targetWindow = getWindowFromTarget(target, normalizedOptions.window);
    const mediaQueryList = normalizedOptions.mediaQueryList || getThemeMediaQueryList(targetWindow);
    const mode = normalizeThemeMode(normalizedOptions.mode);
    const effectiveTheme = resolveEffectiveTheme(mode, targetWindow, mediaQueryList);

    if (!target || typeof target !== "object") {
      return {
        mode,
        effectiveTheme,
        applied: false,
      };
    }

    setDataValue(target, "cleanroomThemeMode", mode);
    setDataValue(target, "cleanroomTheme", effectiveTheme);
    setStyleProperty(
      target,
      "color-scheme",
      mode === THEME_MODES.FOLLOW_HOST ? "light dark" : effectiveTheme,
    );

    if (mode === THEME_MODES.FOLLOW_HOST) {
      clearForcedThemeTokens(target);
    } else {
      applyForcedThemeTokens(target, effectiveTheme);
    }

    return {
      mode,
      effectiveTheme,
      applied: true,
    };
  }

  function clearThemeFromElement(target, options) {
    if (!target || typeof target !== "object") {
      return false;
    }

    removeDataValue(target, "cleanroomThemeMode");
    removeDataValue(target, "cleanroomTheme");
    clearForcedThemeTokens(target);

    const previousColorScheme = typeof options?.previousColorScheme === "string"
      ? options.previousColorScheme
      : "";
    if (previousColorScheme) {
      setStyleProperty(target, "color-scheme", previousColorScheme);
    } else {
      removeStyleProperty(target, "color-scheme");
    }

    return true;
  }

  function attachMediaQueryListener(mediaQueryList, handler) {
    if (!mediaQueryList || typeof handler !== "function") {
      return function noop() {};
    }

    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", handler);
      return function cleanup() {
        mediaQueryList.removeEventListener("change", handler);
      };
    }

    if (typeof mediaQueryList.addListener === "function") {
      mediaQueryList.addListener(handler);
      return function cleanup() {
        mediaQueryList.removeListener(handler);
      };
    }

    return function noop() {};
  }

  function observeThemeOnElement(target, options) {
    const normalizedOptions = options && typeof options === "object" ? options : {};
    const targetWindow = getWindowFromTarget(target, normalizedOptions.window);
    const mediaQueryList = normalizedOptions.mediaQueryList || getThemeMediaQueryList(targetWindow);
    let state = applyThemeToElement(target, {
      ...normalizedOptions,
      window: targetWindow,
      mediaQueryList,
    });

    function getCurrentMode() {
      if (typeof normalizedOptions.getMode === "function") {
        return normalizeThemeMode(normalizedOptions.getMode());
      }
      return normalizeThemeMode(normalizedOptions.mode);
    }

    function refresh() {
      state = applyThemeToElement(target, {
        ...normalizedOptions,
        mode: getCurrentMode(),
        window: targetWindow,
        mediaQueryList,
      });
      return state;
    }

    const mediaQueryCleanup = attachMediaQueryListener(mediaQueryList, function handleThemeChange() {
      if (getCurrentMode() === THEME_MODES.FOLLOW_HOST) {
        refresh();
      }
    });

    return {
      refresh,
      dispose() {
        mediaQueryCleanup();
        if (normalizedOptions.clearOnDispose !== false) {
          clearThemeFromElement(target, {
            previousColorScheme: normalizedOptions.previousColorScheme || "",
          });
        }
      },
      getState() {
        return { ...state };
      },
    };
  }

  globalThis[CONTRACT_KEY] = Object.freeze({
    CONTRACT_KEY,
    THEME_MODES,
    normalizeThemeMode,
    detectHostTheme,
    resolveEffectiveTheme,
    applyThemeToElement,
    observeThemeOnElement,
    clearThemeFromElement,
  });
})();
