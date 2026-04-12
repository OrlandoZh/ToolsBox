export const DEFAULT_REACT_SURFACE_GLOBAL_KEY = "__CleanroomTemplateReactSurface__";
export const DEFAULT_REACT_SURFACE_SCRIPT_PATH = "content/scripts/react-ui-surface-bridge.js";
export const DEFAULT_REACT_SURFACE_STYLE_PATH = "content/styles/react-ui-surface-bridge.css";
export const DEFAULT_REACT_SURFACE_STYLE_ID = "cleanroomtemplate-react-surface-style";

function toErrorMessage(error, fallbackMessage) {
  const message = String(error?.message || "").trim();
  return message || fallbackMessage;
}

function normalizeAssetPath(value, fallback) {
  const normalized = String(value || fallback || "").trim().replace(/^\/+/u, "");
  return normalized || fallback;
}

function resolveAssetURL(rootURI, relativePath) {
  const normalizedRootURI = String(rootURI || "").trim();
  const normalizedPath = normalizeAssetPath(relativePath, "");
  if (!normalizedRootURI) {
    return normalizedPath;
  }
  return `${normalizedRootURI.replace(/\/?$/u, "/")}${normalizedPath}`;
}

function getView(doc) {
  return doc?.defaultView || null;
}

function getRenderer(view, globalKey) {
  const key = String(globalKey || "").trim();
  if (!key) {
    return null;
  }
  return view?.[key]
    || view?.wrappedJSObject?.[key]
    || null;
}

function createRendererResult(overrides = {}) {
  return {
    success: false,
    error: null,
    scriptURL: null,
    styleURL: null,
    globalKey: DEFAULT_REACT_SURFACE_GLOBAL_KEY,
    rendererFound: false,
    renderer: null,
    attemptedReload: false,
    loadAttempted: false,
    styleLinked: false,
    operation: null,
    ...overrides,
  };
}

function hasUsableContainer(container) {
  return Boolean(container && typeof container === "object");
}

export function createReactSurfaceAssetURLs(rootURI = "", options = {}) {
  return {
    scriptURL: resolveAssetURL(
      rootURI,
      options.scriptPath || DEFAULT_REACT_SURFACE_SCRIPT_PATH,
    ),
    styleURL: resolveAssetURL(
      rootURI,
      options.stylePath || DEFAULT_REACT_SURFACE_STYLE_PATH,
    ),
  };
}

export function ensureReactSurfaceStylesheet(doc, options = {}) {
  const styleElementID = String(options.styleElementID || DEFAULT_REACT_SURFACE_STYLE_ID).trim()
    || DEFAULT_REACT_SURFACE_STYLE_ID;
  const { styleURL } = createReactSurfaceAssetURLs(options.rootURI, options);
  const baseResult = createRendererResult({
    styleURL,
    styleLinked: false,
    globalKey: String(options.globalKey || DEFAULT_REACT_SURFACE_GLOBAL_KEY).trim()
      || DEFAULT_REACT_SURFACE_GLOBAL_KEY,
  });

  if (!doc || typeof doc.createElement !== "function") {
    return {
      ...baseResult,
      error: "React surface stylesheet document is unavailable",
    };
  }

  if (typeof doc.getElementById === "function") {
    const existing = doc.getElementById(styleElementID);
    if (existing) {
      return {
        ...baseResult,
        success: true,
        styleLinked: true,
      };
    }
  }

  try {
    const link = doc.createElement("link");
    link.id = styleElementID;
    link.rel = "stylesheet";
    link.href = styleURL;
    const parent = doc.head || doc.documentElement || doc.body;
    parent?.appendChild?.(link);
    return {
      ...baseResult,
      success: true,
      styleLinked: true,
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error, "React surface stylesheet injection failed");
    options.logger?.warn?.("reactSurfaceBridge.styleLinkFailed", {
      styleURL,
      errorMessage,
    });
    return {
      ...baseResult,
      error: errorMessage,
    };
  }
}

function loadReactSurfaceRenderer(doc, options = {}) {
  const view = getView(doc);
  const globalKey = String(options.globalKey || DEFAULT_REACT_SURFACE_GLOBAL_KEY).trim()
    || DEFAULT_REACT_SURFACE_GLOBAL_KEY;
  const { scriptURL, styleURL } = createReactSurfaceAssetURLs(options.rootURI, options);
  const baseResult = createRendererResult({
    scriptURL,
    styleURL,
    globalKey,
    attemptedReload: options.forceReload === true,
  });

  if (!view) {
    return {
      ...baseResult,
      error: "React surface window is unavailable",
    };
  }

  const existing = options.forceReload === true ? null : getRenderer(view, globalKey);
  if (existing) {
    return {
      ...baseResult,
      success: true,
      rendererFound: true,
      renderer: existing,
    };
  }

  const scriptloader = options.services?.scriptloader;
  if (typeof scriptloader?.loadSubScript !== "function") {
    options.logger?.warn?.("reactSurfaceBridge.noScriptloader", {
      globalKey,
      scriptURL,
    });
    return {
      ...baseResult,
      error: "React surface scriptloader is unavailable",
    };
  }

  try {
    scriptloader.loadSubScript(scriptURL, view);
  } catch (error) {
    const errorMessage = toErrorMessage(error, "React surface script load failed");
    options.logger?.warn?.("reactSurfaceBridge.scriptLoadFailed", {
      globalKey,
      scriptURL,
      attemptedReload: options.forceReload === true,
      errorMessage,
    });
    return {
      ...baseResult,
      loadAttempted: true,
      error: errorMessage,
    };
  }

  const renderer = getRenderer(view, globalKey);
  if (!renderer) {
    options.logger?.warn?.("reactSurfaceBridge.globalMissing", {
      globalKey,
      scriptURL,
      attemptedReload: options.forceReload === true,
    });
    return {
      ...baseResult,
      loadAttempted: true,
      error: "React surface renderer global missing after script load",
    };
  }

  return {
    ...baseResult,
    success: true,
    loadAttempted: true,
    rendererFound: true,
    renderer,
  };
}

export function ensureReactSurfaceRenderer(doc, options = {}) {
  const styleResult = ensureReactSurfaceStylesheet(doc, options);
  let rendererResult = loadReactSurfaceRenderer(doc, options);

  if (!rendererResult.success && rendererResult.rendererFound !== true) {
    const retryResult = loadReactSurfaceRenderer(doc, {
      ...options,
      forceReload: true,
    });
    rendererResult = {
      ...retryResult,
      attemptedReload: true,
    };
  }

  return {
    ...rendererResult,
    styleURL: rendererResult.styleURL || styleResult.styleURL,
    styleLinked: styleResult.styleLinked === true,
    error: rendererResult.error || styleResult.error || null,
  };
}

export function mountReactSurface({
  doc,
  container,
  props,
  rootURI,
  services,
  logger,
  globalKey,
  scriptPath,
  stylePath,
  styleElementID,
} = {}) {
  if (!hasUsableContainer(container)) {
    return createRendererResult({
      operation: "mount",
      error: "React surface container is unavailable",
      globalKey: String(globalKey || DEFAULT_REACT_SURFACE_GLOBAL_KEY).trim()
        || DEFAULT_REACT_SURFACE_GLOBAL_KEY,
    });
  }

  const rendererResult = ensureReactSurfaceRenderer(doc, {
    rootURI,
    services,
    logger,
    globalKey,
    scriptPath,
    stylePath,
    styleElementID,
  });
  if (!rendererResult.success || typeof rendererResult.renderer?.mount !== "function") {
    return {
      ...rendererResult,
      operation: "mount",
      error: rendererResult.error || "React surface mount function is unavailable",
    };
  }

  try {
    rendererResult.renderer.mount(container, props);
    return {
      ...rendererResult,
      success: true,
      operation: "mount",
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error, "React surface mount failed");
    logger?.warn?.("reactSurfaceBridge.mountFailed", {
      globalKey: rendererResult.globalKey,
      scriptURL: rendererResult.scriptURL,
      errorMessage,
    });
    return {
      ...rendererResult,
      success: false,
      operation: "mount",
      error: errorMessage,
    };
  }
}

export function updateReactSurface({
  doc,
  container,
  props,
  rootURI,
  services,
  logger,
  globalKey,
  scriptPath,
  stylePath,
  styleElementID,
} = {}) {
  if (!hasUsableContainer(container)) {
    return createRendererResult({
      operation: "update",
      error: "React surface container is unavailable",
      globalKey: String(globalKey || DEFAULT_REACT_SURFACE_GLOBAL_KEY).trim()
        || DEFAULT_REACT_SURFACE_GLOBAL_KEY,
    });
  }

  const rendererResult = ensureReactSurfaceRenderer(doc, {
    rootURI,
    services,
    logger,
    globalKey,
    scriptPath,
    stylePath,
    styleElementID,
  });
  if (!rendererResult.success || !rendererResult.renderer) {
    return {
      ...rendererResult,
      operation: "update",
      error: rendererResult.error || "React surface update is unavailable",
    };
  }

  try {
    if (typeof rendererResult.renderer.update === "function") {
      rendererResult.renderer.update(container, props);
      return {
        ...rendererResult,
        success: true,
        operation: "update",
      };
    }

    if (typeof rendererResult.renderer.mount === "function") {
      rendererResult.renderer.mount(container, props);
      return {
        ...rendererResult,
        success: true,
        operation: "update",
      };
    }
  } catch (error) {
    const errorMessage = toErrorMessage(error, "React surface update failed");
    logger?.warn?.("reactSurfaceBridge.updateFailed", {
      globalKey: rendererResult.globalKey,
      scriptURL: rendererResult.scriptURL,
      errorMessage,
    });
    return {
      ...rendererResult,
      success: false,
      operation: "update",
      error: errorMessage,
    };
  }

  return {
    ...rendererResult,
    operation: "update",
    error: "React surface update function is unavailable",
  };
}

export function unmountReactSurface({
  doc,
  container,
  rootURI,
  services,
  logger,
  globalKey,
  scriptPath,
  stylePath,
  styleElementID,
} = {}) {
  if (!hasUsableContainer(container)) {
    return createRendererResult({
      operation: "unmount",
      error: "React surface container is unavailable",
      globalKey: String(globalKey || DEFAULT_REACT_SURFACE_GLOBAL_KEY).trim()
        || DEFAULT_REACT_SURFACE_GLOBAL_KEY,
    });
  }

  const rendererResult = ensureReactSurfaceRenderer(doc, {
    rootURI,
    services,
    logger,
    globalKey,
    scriptPath,
    stylePath,
    styleElementID,
  });
  if (!rendererResult.success || typeof rendererResult.renderer?.unmount !== "function") {
    return {
      ...rendererResult,
      operation: "unmount",
      error: rendererResult.error || "React surface unmount function is unavailable",
    };
  }

  try {
    rendererResult.renderer.unmount(container);
    return {
      ...rendererResult,
      success: true,
      operation: "unmount",
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error, "React surface unmount failed");
    logger?.warn?.("reactSurfaceBridge.unmountFailed", {
      globalKey: rendererResult.globalKey,
      scriptURL: rendererResult.scriptURL,
      errorMessage,
    });
    return {
      ...rendererResult,
      success: false,
      operation: "unmount",
      error: errorMessage,
    };
  }
}
