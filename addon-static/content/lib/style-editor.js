(function () {
  "use strict";

  var bridgeKey = (document.documentElement.getAttribute("data-addon-ref") || "toolsbox")
    .replace(/-/g, "_");
  bridgeKey = "__" + bridgeKey + "_WorkbenchBridge__";

  var state = {
    css: "",
    savedCSS: "",
    status: "Local CSS prototype",
    previewApplied: false,
    onSave: null,
    onReset: null,
  };
  var previewCleanup = null;

  function $(sel) { return document.querySelector(sel); }

  function setStatus(text) {
    state.status = String(text || "");
    var status = $("#se-status");
    if (status) status.textContent = state.status;
  }

  function getAttr(node, name) {
    try { return String(node && node.getAttribute && node.getAttribute(name) || ""); } catch (_) { return ""; }
  }

  function setAttr(node, name, value) {
    try { node && node.setAttribute && node.setAttribute(name, value); } catch (_) {}
  }

  function removeNode(node) {
    try {
      if (node && typeof node.remove === "function") {
        node.remove();
      } else if (node && node.parentNode && typeof node.parentNode.removeChild === "function") {
        node.parentNode.removeChild(node);
      }
    } catch (_) {}
  }

  function sanitizeCSS(css) {
    var text = String(css || "").replace(/\r\n?/g, "\n").slice(0, 20000);
    text = text.replace(/\/\*[\s\S]*?\*\//g, "");
    text = text.replace(/@import\b[^;{}]*(?:;|$)/gi, "");
    text = text.replace(/@namespace\b[^;{}]*(?:;|$)/gi, "");
    var previous = "";
    while (previous !== text) {
      previous = text;
      text = text.replace(/@[a-z-]+\b[^{};]*\{[^{}]*\}/gi, "");
    }
    text = text.replace(/@[a-z-]+\b[^;{}]*(?:;|$)/gi, "");
    text = text.replace(/-moz-binding\s*:[^;{}]+;?/gi, "");
    text = text.replace(/url\([^)]*\)/gi, "none");
    return text.trim();
  }

  function prefixSelector(selector, scopeSelector) {
    var trimmed = String(selector || "").trim();
    if (!trimmed) return "";
    if (trimmed.indexOf(scopeSelector) === 0) return trimmed;
    if (trimmed === ":root" || trimmed === "html" || trimmed === "body" || trimmed === ":host") {
      return scopeSelector;
    }
    if (trimmed.indexOf(":host") === 0) {
      return scopeSelector + trimmed.slice(":host".length);
    }
    return scopeSelector + " " + trimmed;
  }

  function scopeCSS(css, scopeSelector) {
    return String(css || "").replace(/(^|\})(\s*)([^@{}][^{}]*)\{/g, function (match, brace, whitespace, selectorText) {
      var scoped = selectorText
        .split(",")
        .map(function (selector) { return prefixSelector(selector, scopeSelector); })
        .filter(Boolean)
        .join(", ");
      return scoped ? brace + whitespace + scoped + " {" : match;
    });
  }

  function applyPreview(css) {
    var root = $("#se-preview-root");
    if (!root || getAttr(root, "data-toolsbox-style-editor-root") !== "true") {
      state.previewApplied = false;
      return;
    }
    if (previewCleanup) previewCleanup();
    var scopeID = getAttr(root, "data-toolsbox-style-editor-scope");
    if (!scopeID) {
      scopeID = "toolsbox-style-editor-preview";
      setAttr(root, "data-toolsbox-style-editor-scope", scopeID);
    }
    var existing = root.querySelector('[data-toolsbox-style-editor-style="true"]');
    var style = existing || document.createElement("style");
    setAttr(style, "data-toolsbox-style-editor-style", "true");
    setAttr(style, "data-toolsbox-owner", "toolsbox-style-editor");
    style.textContent = scopeCSS(sanitizeCSS(css), '[data-toolsbox-style-editor-scope="' + scopeID + '"]');
    if (!existing) root.appendChild(style);
    state.previewApplied = true;
    previewCleanup = function () {
      removeNode(style);
      state.previewApplied = false;
    };
  }

  function readTextarea() {
    var textarea = $("#se-css");
    return textarea ? textarea.value : "";
  }

  function writeTextarea(value) {
    var textarea = $("#se-css");
    if (textarea) textarea.value = value;
  }

  function preview() {
    state.css = readTextarea();
    applyPreview(state.css);
    setStatus("Preview applied");
  }

  function save() {
    state.css = readTextarea();
    var css = sanitizeCSS(state.css);
    var result = { ok: false, css: css };
    if (typeof state.onSave === "function") {
      result = state.onSave(css) || result;
    }
    state.savedCSS = String(result.css || "");
    state.css = state.savedCSS;
    writeTextarea(state.css);
    applyPreview(state.css);
    setStatus(result.ok === false ? "Save unavailable" : "Saved locally");
  }

  function reset() {
    var result = { ok: false, css: "" };
    if (typeof state.onReset === "function") {
      result = state.onReset() || result;
    }
    state.css = "";
    state.savedCSS = "";
    writeTextarea("");
    if (previewCleanup) previewCleanup();
    setStatus(result.ok === false ? "Reset unavailable" : "Reset locally");
  }

  function mount(payload) {
    state.css = sanitizeCSS(payload && payload.css || "");
    state.savedCSS = state.css;
    state.onSave = payload && typeof payload.onSave === "function" ? payload.onSave : null;
    state.onReset = payload && typeof payload.onReset === "function" ? payload.onReset : null;
    document.documentElement.setAttribute("data-style-editor-mounted", "true");
    writeTextarea(state.css);
    applyPreview(state.css);
    setStatus("Local CSS prototype");
  }

  function unmount() {
    state.css = "";
    state.savedCSS = "";
    state.onSave = null;
    state.onReset = null;
    writeTextarea("");
    if (previewCleanup) previewCleanup();
    previewCleanup = null;
    document.documentElement.setAttribute("data-style-editor-mounted", "false");
    setStatus("Local CSS prototype");
  }

  $("#se-preview") && $("#se-preview").addEventListener("click", preview);
  $("#se-save") && $("#se-save").addEventListener("click", save);
  $("#se-reset") && $("#se-reset").addEventListener("click", reset);
  $("#se-css") && $("#se-css").addEventListener("input", function () {
    state.css = readTextarea();
    setStatus("Unsaved local CSS");
  });

  window[bridgeKey] = {
    mount: mount,
    unmount: unmount,
    getSnapshot: function () {
      var root = $("#se-preview-root");
      var style = root && root.querySelector('[data-toolsbox-style-editor-style="true"]');
      return {
        css: state.css,
        savedCSS: state.savedCSS,
        status: state.status,
        previewApplied: state.previewApplied,
        previewStyleText: style ? String(style.textContent || "") : "",
        textareaValue: readTextarea(),
      };
    },
  };
})();
