import { describe, it, assert } from "./test-framework.js";
import { registerRelationshipGraphFeatures } from "../src/features/research-workbench-graph.js";
import { createWorkbenchShellManager } from "../src/features/research-workbench-common.js";

function createPrefs(values = {}) {
  return { get(key) { return Object.hasOwn(values, key) ? values[key] : null; } };
}

function createCommandPalette() {
  const registrations = [];
  return {
    registrations,
    registerCommand(opts) { registrations.push(opts); return opts.id; },
  };
}

function createMenuManager() {
  const registrations = [];
  return {
    registrations,
    registerItemMenuItem(opts) { registrations.push(opts); return opts.id; },
  };
}

function createI18n() {
  return { t(key, fallback) { return fallback || key; } };
}

describe("Relationship Graph", () => {
  it("should register an open command", () => {
    const cp = createCommandPalette();
    registerRelationshipGraphFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.graph.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return { closed: false, openDialog() {} }; } },
      menuManager: null,
      commandPalette: cp,
      surfaceDescriptors: { relationshipGraphCommandID: "toolsbox-research-graph" },
    });
    assert.equal(cp.registrations.length, 1);
    assert.equal(cp.registrations[0].id, "toolsbox-research-graph");
    assert.ok(cp.registrations[0].label.includes("Graph"));
  });

  it("should have condition that respects enabled pref", () => {
    const cp = createCommandPalette();
    registerRelationshipGraphFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.graph.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: null,
      commandPalette: cp,
      surfaceDescriptors: null,
    });
    assert.equal(cp.registrations[0].condition(), true);
  });

  it("should register item context menu when menuManager is available", () => {
    const cp = createCommandPalette();
    const mm = createMenuManager();
    registerRelationshipGraphFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.graph.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: mm,
      commandPalette: cp,
      surfaceDescriptors: { relationshipGraphCommandID: "toolsbox-research-graph", relationshipGraphContextMenuID: "toolsbox-research-graph-context" },
    });
    assert.equal(mm.registrations.length, 1);
    assert.equal(mm.registrations[0].id, "toolsbox-research-graph-context");
    assert.ok(mm.registrations[0].l10nID);
    assert.typeOf(mm.registrations[0].onCommand, "function");
    assert.typeOf(mm.registrations[0].onShowing, "function");
  });

  it("should skip menu registration when menuManager has no item menu API", () => {
    const cp = createCommandPalette();
    registerRelationshipGraphFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.graph.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: {},
      commandPalette: cp,
      surfaceDescriptors: null,
    });
    assert.equal(cp.registrations.length, 1);
  });

  it("should show context menu only when items are selected and enabled", () => {
    const cp = createCommandPalette();
    const mm = createMenuManager();
    registerRelationshipGraphFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.graph.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: mm,
      commandPalette: cp,
      surfaceDescriptors: null,
    });
    const menuCtx = { items: [], setVisible(v) { this._visible = v; }, _visible: null };
    mm.registrations[0].onShowing(null, menuCtx);
    assert.equal(menuCtx._visible, false);

    const menuCtx2 = { items: [{ id: 1, getField() { return "Test"; } }], setVisible(v) { this._visible = v; }, _visible: null };
    mm.registrations[0].onShowing(null, menuCtx2);
    assert.equal(menuCtx2._visible, true);
  });

  it("should read first item from context menu in onCommand", () => {
    const cp = createCommandPalette();
    const mm = createMenuManager();
    registerRelationshipGraphFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.graph.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: mm,
      commandPalette: cp,
      surfaceDescriptors: null,
    });
    assert.typeOf(mm.registrations[0].onCommand, "function");
    assert.typeOf(mm.registrations[0].onShowing, "function");
    assert.ok(mm.registrations[0].l10nID);
  });

  it("should return openRelationshipGraph and getSnapshot from registration", () => {
    const cp = createCommandPalette();
    const result = registerRelationshipGraphFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.graph.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: null,
      commandPalette: cp,
      surfaceDescriptors: null,
    });
    assert.typeOf(result.openRelationshipGraph, "function");
    assert.typeOf(result.getSnapshot, "function");
  });

  it("should remount payload when reusing an existing workbench window", async () => {
    const mounted = [];
    const win = {
      closed: false,
      location: { href: "chrome://toolsbox/content/lib/research-graph.html" },
      document: {
        readyState: "complete",
        documentElement: {
          setAttribute() {},
        },
      },
      addEventListener() {},
      removeEventListener() {},
      focus() {
        this.focused = true;
      },
      __toolsbox_WorkbenchBridge__: {
        mount(payload) {
          mounted.push(payload);
        },
        unmount() {},
      },
    };
    const shell = createWorkbenchShellManager({
      logger: { debug() {}, warn() {}, error() {} },
      host: {
        listWindowsByType() {
          return [win];
        },
        getPrimaryWindow() {
          throw new Error("should reuse existing window");
        },
      },
      rootURI: "chrome://toolsbox",
      addonRef: "toolsbox",
      addonName: "ToolsBox",
      prefs: createPrefs(),
      shellFileName: "research-graph.html",
      windowName: "toolsbox-graph",
      buildPayload(context) {
        return context;
      },
    });

    const result = await shell.open({ itemID: 42 });

    assert.equal(result.reused, true);
    assert.equal(win.focused, true);
    assert.deepEqual(mounted, [{ itemID: 42 }]);
  });
});
