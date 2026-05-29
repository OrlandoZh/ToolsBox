import {
  createWorkbenchShellManager,
  resolveThemeMode,
} from "./research-workbench-common.js";

const SHELL_FILE = "style-editor.xhtml";
const WINDOW_NAME = "toolsbox-style-editor";
const DEFAULT_OWNER_ATTR = "data-toolsbox-style-editor-root";
const DEFAULT_STYLE_ATTR = "data-toolsbox-style-editor-style";
const DEFAULT_SCOPE_ATTR = "data-toolsbox-style-editor-scope";
const MAX_CSS_LENGTH = 20000;

function noop() {}

function safeString(value) {
  return String(value ?? "");
}

function readPref(prefs, key, fallback) {
  try {
    const value = typeof prefs?.get === "function" ? prefs.get(key) : undefined;
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writePref(prefs, key, value) {
  if (typeof prefs?.set === "function") {
    prefs.set(key, value);
    return true;
  }
  if (typeof prefs?.setStringPref === "function") {
    prefs.setStringPref(key, String(value));
    return true;
  }
  return false;
}

function getAttr(node, name) {
  try {
    return String(node?.getAttribute?.(name) || "");
  } catch {
    return "";
  }
}

function setAttr(node, name, value) {
  try {
    node?.setAttribute?.(name, value);
  } catch {}
}

function hasOwnerMarker(root, ownerAttr) {
  if (!root) {
    return false;
  }
  if (getAttr(root, ownerAttr) === "true") {
    return true;
  }
  const owner = getAttr(root, "data-toolsbox-owner");
  return owner === "toolsbox-style-editor" || owner.startsWith("toolsbox-");
}

function removeNode(node) {
  try {
    if (typeof node?.remove === "function") {
      node.remove();
      return;
    }
    if (node?.parentNode && typeof node.parentNode.removeChild === "function") {
      node.parentNode.removeChild(node);
    }
  } catch {}
}

function queryOwnedStyles(root, styleAttr) {
  try {
    return Array.from(root?.querySelectorAll?.(`[${styleAttr}="true"]`) || []);
  } catch {
    return [];
  }
}

function ensureScopeID(root, scopeAttr) {
  const existing = getAttr(root, scopeAttr);
  if (existing) {
    return existing;
  }
  const generated = `toolsbox-style-editor-${Math.random().toString(36).slice(2, 10)}`;
  setAttr(root, scopeAttr, generated);
  return generated;
}

function prefixSelector(selector, scopeSelector) {
  const trimmed = String(selector || "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith(scopeSelector)) {
    return trimmed;
  }
  if (trimmed === ":root" || trimmed === "html" || trimmed === "body" || trimmed === ":host") {
    return scopeSelector;
  }
  if (trimmed.startsWith(":host")) {
    return `${scopeSelector}${trimmed.slice(":host".length)}`;
  }
  return `${scopeSelector} ${trimmed}`;
}

function scopeStyleEditorCSS(css, scopeSelector) {
  return safeString(css).replace(/(^|\})(\s*)([^@{}][^{}]*)\{/gu, (match, brace, whitespace, selectorText) => {
    const scoped = selectorText
      .split(",")
      .map((selector) => prefixSelector(selector, scopeSelector))
      .filter(Boolean)
      .join(", ");
    return scoped ? `${brace}${whitespace}${scoped} {` : match;
  });
}

export function sanitizeStyleEditorCSS(css, options = {}) {
  const maxLength = Number.isFinite(options.maxLength) && options.maxLength > 0
    ? Math.floor(options.maxLength)
    : MAX_CSS_LENGTH;
  let text = safeString(css)
    .replace(/\r\n?/gu, "\n")
    .slice(0, maxLength);

  text = text.replace(/\/\*[\s\S]*?\*\//gu, "");
  text = text.replace(/@import\b[^;{}]*(?:;|$)/giu, "");
  text = text.replace(/@namespace\b[^;{}]*(?:;|$)/giu, "");
  let previous = "";
  while (previous !== text) {
    previous = text;
    text = text.replace(/@[a-z-]+\b[^{};]*\{[^{}]*\}/giu, "");
  }
  text = text.replace(/@[a-z-]+\b[^;{}]*(?:;|$)/giu, "");
  text = text.replace(/-moz-binding\s*:[^;{}]+;?/giu, "");
  text = text.replace(/url\([^)]*\)/giu, "none");
  return text.trim();
}

export function applyScopedStyle(root, css, options = {}) {
  const ownerAttr = options.ownerAttr || DEFAULT_OWNER_ATTR;
  const styleAttr = options.styleAttr || DEFAULT_STYLE_ATTR;
  const scopeAttr = options.scopeAttr || DEFAULT_SCOPE_ATTR;
  const sanitized = sanitizeStyleEditorCSS(css, options);

  if (!hasOwnerMarker(root, ownerAttr)) {
    return {
      applied: false,
      reason: "unowned-root",
      css: sanitized,
      cleanup: noop,
    };
  }

  const doc = root.ownerDocument || root.document || root;
  if (typeof doc?.createElement !== "function" || typeof root?.appendChild !== "function") {
    return {
      applied: false,
      reason: "dom-unavailable",
      css: sanitized,
      cleanup: noop,
    };
  }

  const scopeID = ensureScopeID(root, scopeAttr);
  const scopeSelector = `[${scopeAttr}="${scopeID}"]`;
  const scopedCSS = scopeStyleEditorCSS(sanitized, scopeSelector);
  const styles = queryOwnedStyles(root, styleAttr);
  const style = styles[0] || doc.createElement("style");
  setAttr(style, styleAttr, "true");
  setAttr(style, "data-toolsbox-owner", "toolsbox-style-editor");
  style.textContent = scopedCSS;
  if (!styles[0]) {
    root.appendChild(style);
  }
  for (const extra of styles.slice(1)) {
    removeNode(extra);
  }

  let cleaned = false;
  return {
    applied: true,
    reason: null,
    css: sanitized,
    scopedCSS,
    element: style,
    cleanup() {
      if (cleaned) {
        return;
      }
      cleaned = true;
      removeNode(style);
    },
  };
}

export function buildStyleEditorPayload(context = {}, deps = {}) {
  const prefs = deps.prefs;
  const css = sanitizeStyleEditorCSS(readPref(prefs, "styleEditor.css", ""));

  function saveCSS(rawCSS) {
    const sanitized = sanitizeStyleEditorCSS(rawCSS);
    const ok = writePref(prefs, "styleEditor.css", sanitized);
    return {
      ok,
      css: sanitized,
    };
  }

  function resetCSS() {
    const ok = writePref(prefs, "styleEditor.css", "");
    return {
      ok,
      css: "",
    };
  }

  return {
    theme: resolveThemeMode(prefs),
    css,
    windowTitle: "Style Editor",
    source: context.source || "command",
    onSave: saveCSS,
    onReset: resetCSS,
  };
}

export function registerStyleEditorFeatures(options = {}) {
  const {
    config = {},
    logger,
    prefs,
    i18n,
    host,
    commandPalette,
    surfaceDescriptors,
  } = options;

  const addonRef = config.addonRef || "toolsbox";
  const addonName = config.addonName || "ToolsBox";
  const rootURI = config.rootURI || `chrome://${addonRef}/`;
  let shellManager = null;

  function isEnabled() {
    return readPref(prefs, "styleEditor.enabled", false) === true;
  }

  function buildPayload(context = {}) {
    return buildStyleEditorPayload(context, { prefs });
  }

  function ensureShell() {
    if (!shellManager) {
      shellManager = createWorkbenchShellManager({
        logger,
        host,
        rootURI,
        addonRef,
        addonName,
        prefs,
        shellFileName: SHELL_FILE,
        windowName: WINDOW_NAME,
        windowWidth: 960,
        windowHeight: 720,
        buildPayload,
      });
    }
    return shellManager;
  }

  function openStyleEditor(context = {}) {
    if (!isEnabled()) {
      return false;
    }
    const shell = ensureShell();
    shell.open(context).catch((err) => {
      logger?.warn?.("[style-editor] open failed", { message: String(err?.message || err) });
    });
    return true;
  }

  if (!isEnabled()) {
    return {
      registered: false,
      openStyleEditor,
      cleanup: noop,
      destroy: noop,
      getSnapshot: () => ({ open: false, registered: false }),
    };
  }

  commandPalette?.registerCommand?.({
    id: surfaceDescriptors?.styleEditorCommandID || `${addonRef}-style-editor`,
    label: i18n?.t?.("cleanroom-style-editor-command-label", "Open Style Editor") || "Open Style Editor",
    category: addonName,
    description: "",
    condition: isEnabled,
    handler: openStyleEditor,
  });

  function cleanup() {
    if (shellManager && typeof shellManager.close === "function") {
      shellManager.close();
    }
  }

  return {
    registered: true,
    openStyleEditor,
    cleanup,
    destroy: cleanup,
    getSnapshot: () => ({
      registered: true,
      ...(shellManager?.getSnapshot?.() || { open: false }),
    }),
  };
}
