import fs from "node:fs";
import vm from "node:vm";
import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import {
  applyScopedStyle,
  buildStyleEditorPayload,
  registerStyleEditorFeatures,
  sanitizeStyleEditorCSS,
} from "../../src/features/style-editor.js";

function createPrefs(values = {}) {
  const writes = [];
  return {
    writes,
    values: new Map(Object.entries(values)),
    get(key) {
      return this.values.has(key) ? this.values.get(key) : null;
    },
    set(key, value) {
      writes.push({ key, value });
      this.values.set(key, value);
    },
  };
}

function createI18n() {
  return {
    t(_key, fallback) {
      return fallback;
    },
  };
}

function createCommandPalette() {
  const registrations = [];
  return {
    registrations,
    registerCommand(options) {
      registrations.push(options);
      return options.id;
    },
  };
}

function createNode(tagName = "div", ownerDocument = null) {
  const node = {
    tagName: String(tagName).toUpperCase(),
    id: "",
    value: "",
    textContent: "",
    children: [],
    parentNode: null,
    ownerDocument,
    attributes: {},
    listeners: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === "id") {
        this.id = String(value);
      }
    },
    getAttribute(name) {
      return this.attributes[name] || "";
    },
    appendChild(child) {
      child.parentNode = this;
      child.ownerDocument = child.ownerDocument || this.ownerDocument;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((entry) => entry !== child);
      child.parentNode = null;
      return child;
    },
    remove() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
      this.removed = true;
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    dispatchEvent(event) {
      const handler = this.listeners[event.type];
      if (typeof handler === "function") {
        handler({ ...event, target: this });
      }
      return true;
    },
    click() {
      this.dispatchEvent({ type: "click" });
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const matches = [];
      const attrMatch = String(selector).match(/^\[([^=\]]+)="([^"]*)"\]$/u);
      const idMatch = String(selector).match(/^#(.+)$/u);
      function visit(current) {
        if (idMatch && current.id === idMatch[1]) {
          matches.push(current);
        }
        if (attrMatch && current.getAttribute?.(attrMatch[1]) === attrMatch[2]) {
          matches.push(current);
        }
        for (const child of current.children || []) {
          visit(child);
        }
      }
      visit(this);
      return matches;
    },
  };
  return node;
}

function createDocument() {
  const doc = {
    defaultView: {
      Event: class Event {
        constructor(type, options = {}) {
          this.type = type;
          this.bubbles = Boolean(options.bubbles);
          this.cancelable = Boolean(options.cancelable);
        }
      },
    },
    documentElement: null,
    elements: new Map(),
    createElement(tagName) {
      return createNode(tagName, doc);
    },
    querySelector(selector) {
      if (String(selector).startsWith("#")) {
        return this.elements.get(selector.slice(1)) || null;
      }
      return this.documentElement?.querySelector?.(selector) || null;
    },
  };
  doc.documentElement = createNode("html", doc);
  return doc;
}

function registerElement(doc, id, tagName = "div") {
  const element = createNode(tagName, doc);
  element.id = id;
  element.setAttribute("id", id);
  doc.elements.set(id, element);
  return element;
}

function loadStyleEditorBridge() {
  const doc = createDocument();
  doc.documentElement.setAttribute("data-addon-ref", "toolsbox");
  const root = registerElement(doc, "style-editor-root");
  root.setAttribute("data-toolsbox-owner", "toolsbox-style-editor");
  root.setAttribute("data-toolsbox-style-editor-root", "true");
  const previewRoot = registerElement(doc, "se-preview-root");
  previewRoot.setAttribute("data-toolsbox-owner", "toolsbox-style-editor");
  previewRoot.setAttribute("data-toolsbox-style-editor-root", "true");
  const textarea = registerElement(doc, "se-css", "textarea");
  const status = registerElement(doc, "se-status", "p");
  const preview = registerElement(doc, "se-preview", "button");
  const save = registerElement(doc, "se-save", "button");
  const reset = registerElement(doc, "se-reset", "button");

  root.appendChild(textarea);
  root.appendChild(status);
  root.appendChild(preview);
  root.appendChild(save);
  root.appendChild(reset);
  root.appendChild(previewRoot);
  doc.documentElement.appendChild(root);

  const context = {
    document: doc,
    window: {},
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync("addon-static/content/lib/style-editor.js", "utf-8"),
    context,
  );
  return {
    bridge: context.window.__toolsbox_WorkbenchBridge__,
    doc,
    elements: doc.elements,
  };
}

describe("Style Editor", () => {
  it("should sanitize local CSS by removing network and unsafe constructs", () => {
    const css = sanitizeStyleEditorCSS(`
      @import url("https://example.test/theme.css");
      @font-face { font-family: Remote; src: url(remote.woff2); }
      .preview { color: red; background: url(file:///tmp/a.png); }
      body { -moz-binding: url(chrome://bad); }
    `);

    assert.equal(css.includes("@import"), false);
    assert.equal(css.includes("@font-face"), false);
    assert.equal(css.includes("url("), false);
    assert.equal(css.includes("-moz-binding"), false);
    assert.ok(css.includes(".preview"));
  });

  it("should apply scoped CSS only to ToolsBox-owned roots and clean up idempotently", () => {
    const doc = createDocument();
    const unowned = createNode("div", doc);
    const unownedResult = applyScopedStyle(unowned, ".x { color: red; }");
    assert.equal(unownedResult.applied, false);
    assert.equal(unownedResult.reason, "unowned-root");

    const root = createNode("section", doc);
    root.setAttribute("data-toolsbox-style-editor-root", "true");
    const first = applyScopedStyle(root, ".x, body { color: blue; }");
    const second = applyScopedStyle(root, ".x { color: green; }");
    const styles = root.querySelectorAll('[data-toolsbox-style-editor-style="true"]');

    assert.equal(first.applied, true);
    assert.equal(second.applied, true);
    assert.equal(styles.length, 1);
    assert.ok(styles[0].textContent.includes("[data-toolsbox-style-editor-scope="));
    assert.equal(styles[0].textContent.includes("body {"), false);

    second.cleanup();
    second.cleanup();
    assert.equal(root.querySelectorAll('[data-toolsbox-style-editor-style="true"]').length, 0);
  });

  it("should build save/reset payload around styleEditor.css without touching Zotero data APIs", () => {
    const prefs = createPrefs({
      "styleEditor.css": "@import url(remote.css); .se-preview-title { color: red; }",
    });
    const payload = buildStyleEditorPayload({}, { prefs });
    assert.equal(payload.css.includes("@import"), false);
    assert.ok(payload.css.includes(".se-preview-title"));

    const saveResult = payload.onSave(".se-preview-title { color: blue; } url(http://bad)");
    const resetResult = payload.onReset();

    assert.equal(saveResult.ok, true);
    assert.equal(saveResult.css.includes("url("), false);
    assert.deepEqual(prefs.writes.map((entry) => entry.key), [
      "styleEditor.css",
      "styleEditor.css",
    ]);
    assert.equal(prefs.writes[0].value, ".se-preview-title { color: blue; } none");
    assert.equal(resetResult.css, "");
    assert.equal(prefs.writes[1].value, "");
  });

  it("should not register the command while default-off", () => {
    const commandPalette = createCommandPalette();
    const feature = registerStyleEditorFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { warn() {} },
      prefs: createPrefs({ "styleEditor.enabled": false }),
      i18n: createI18n(),
      host: {},
      commandPalette,
      surfaceDescriptors: { styleEditorCommandID: "toolsbox-style-editor" },
    });

    assert.equal(feature.registered, false);
    assert.equal(commandPalette.registrations.length, 0);
    assert.equal(feature.getSnapshot().open, false);
  });

  it("should register a standalone Style Editor command only when enabled", () => {
    const commandPalette = createCommandPalette();
    const prefs = createPrefs({ "styleEditor.enabled": true });
    const feature = registerStyleEditorFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { warn() {} },
      prefs,
      i18n: createI18n(),
      host: {},
      commandPalette,
      surfaceDescriptors: { styleEditorCommandID: "toolsbox-style-editor" },
    });

    assert.equal(feature.registered, true);
    assert.equal(commandPalette.registrations.length, 1);
    assert.equal(commandPalette.registrations[0].id, "toolsbox-style-editor");
    assert.equal(commandPalette.registrations[0].condition(), true);
    prefs.set("styleEditor.enabled", false);
    assert.equal(commandPalette.registrations[0].condition(), false);
  });

  it("should mount, preview, save, reset, and unmount the static editor shell without stale state", () => {
    const { bridge, elements } = loadStyleEditorBridge();
    let savedCSS = null;
    bridge.mount({
      css: ".se-preview-title { color: red; }",
      onSave(css) {
        savedCSS = css;
        return { ok: true, css };
      },
      onReset() {
        savedCSS = "";
        return { ok: true, css: "" };
      },
    });

    let snapshot = bridge.getSnapshot();
    assert.equal(snapshot.textareaValue, ".se-preview-title { color: red; }");
    assert.ok(snapshot.previewStyleText.includes("[data-toolsbox-style-editor-scope="));

    elements.get("se-css").value = "@import url(remote.css); .se-preview-title { color: blue; }";
    elements.get("se-css").dispatchEvent({ type: "input" });
    elements.get("se-preview").click();
    snapshot = bridge.getSnapshot();
    assert.equal(snapshot.status, "Preview applied");
    assert.equal(snapshot.previewStyleText.includes("@import"), false);

    elements.get("se-save").click();
    snapshot = bridge.getSnapshot();
    assert.equal(savedCSS, ".se-preview-title { color: blue; }");
    assert.equal(snapshot.savedCSS, ".se-preview-title { color: blue; }");
    assert.equal(snapshot.status, "Saved locally");

    elements.get("se-reset").click();
    snapshot = bridge.getSnapshot();
    assert.equal(savedCSS, "");
    assert.equal(snapshot.textareaValue, "");
    assert.equal(snapshot.previewApplied, false);

    bridge.mount({ css: ".se-preview-chip { color: green; }" });
    snapshot = bridge.getSnapshot();
    assert.equal(snapshot.textareaValue, ".se-preview-chip { color: green; }");
    bridge.unmount();
    snapshot = bridge.getSnapshot();
    assert.equal(snapshot.textareaValue, "");
    assert.equal(snapshot.previewApplied, false);
  });
});

await runTestsIfMain(import.meta.url);
