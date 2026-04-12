export const SURFACE_WINDOW_MODE_DEFAULT = "default";
export const SURFACE_WINDOW_MODE_DOCKED = "docked";
export const SURFACE_WINDOW_MODE_FLOATING = "floating";
export const SURFACE_WINDOW_MODE_STANDALONE = "standalone";

export function normalizeSurfaceWindowMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === SURFACE_WINDOW_MODE_DEFAULT) {
    return SURFACE_WINDOW_MODE_DEFAULT;
  }
  if (normalized === SURFACE_WINDOW_MODE_DOCKED) {
    return SURFACE_WINDOW_MODE_DOCKED;
  }
  if (normalized === SURFACE_WINDOW_MODE_FLOATING) {
    return SURFACE_WINDOW_MODE_FLOATING;
  }
  if (normalized === SURFACE_WINDOW_MODE_STANDALONE) {
    return SURFACE_WINDOW_MODE_STANDALONE;
  }
  return SURFACE_WINDOW_MODE_DEFAULT;
}

export function normalizeEffectiveSurfaceWindowMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === SURFACE_WINDOW_MODE_FLOATING) {
    return SURFACE_WINDOW_MODE_FLOATING;
  }
  if (normalized === SURFACE_WINDOW_MODE_STANDALONE) {
    return SURFACE_WINDOW_MODE_STANDALONE;
  }
  return SURFACE_WINDOW_MODE_DOCKED;
}

export function normalizeDockableSurfaceWindowMode(value) {
  return normalizeEffectiveSurfaceWindowMode(value) === SURFACE_WINDOW_MODE_FLOATING
    ? SURFACE_WINDOW_MODE_FLOATING
    : SURFACE_WINDOW_MODE_DOCKED;
}

export function resolveSurfaceWindowModeDecision(options = {}) {
  const preferredWindowMode = normalizeSurfaceWindowMode(
    options.preferredWindowMode ?? options.windowMode,
  );

  if (preferredWindowMode === SURFACE_WINDOW_MODE_STANDALONE) {
    return {
      preferredWindowMode,
      requestedWindowMode: SURFACE_WINDOW_MODE_STANDALONE,
      effectiveWindowMode: SURFACE_WINDOW_MODE_STANDALONE,
      surfaceKind: "standalone-window",
      windowModeSource: "preference",
      fallback: false,
      fallbackReason: null,
    };
  }

  if (preferredWindowMode === SURFACE_WINDOW_MODE_FLOATING) {
    return {
      preferredWindowMode,
      requestedWindowMode: SURFACE_WINDOW_MODE_FLOATING,
      effectiveWindowMode: SURFACE_WINDOW_MODE_FLOATING,
      surfaceKind: "floating-panel",
      windowModeSource: "preference",
      fallback: false,
      fallbackReason: null,
    };
  }

  const dockedAvailable = options.dockedAvailable !== false;
  const fallbackReason = dockedAvailable
    ? null
    : (String(options.dockedFallbackReason || "").trim() || "dock-unavailable");
  const effectiveWindowMode = dockedAvailable
    ? SURFACE_WINDOW_MODE_DOCKED
    : SURFACE_WINDOW_MODE_FLOATING;
  const isDefaultMode = preferredWindowMode === SURFACE_WINDOW_MODE_DEFAULT;

  return {
    preferredWindowMode,
    requestedWindowMode: SURFACE_WINDOW_MODE_DOCKED,
    effectiveWindowMode,
    surfaceKind: effectiveWindowMode === SURFACE_WINDOW_MODE_DOCKED
      ? "docked-panel"
      : "floating-panel",
    windowModeSource: isDefaultMode
      ? (
        effectiveWindowMode === SURFACE_WINDOW_MODE_DOCKED
          ? "default-docked"
          : "default-floating"
      )
      : (dockedAvailable ? "preference" : "docked-fallback"),
    fallback: dockedAvailable !== true,
    fallbackReason,
  };
}
