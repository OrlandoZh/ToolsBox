import { describe, it, assert } from "./test-framework.js";
import { registerNotesManagerFeatures } from "../src/features/research-workbench-notes.js";

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

function createI18n() {
  return { t(key, fallback) { return fallback || key; } };
}

describe("Notes Manager", () => {
  it("should register an open command", () => {
    const cp = createCommandPalette();
    registerNotesManagerFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.notes.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return { closed: false, openDialog() {} }; } },
      menuManager: null,
      commandPalette: cp,
      reader: null,
      surfaceDescriptors: { notesManagerCommandID: "toolsbox-notes-manager" },
      getPrimaryWindow() { return null; },
    });
    assert.equal(cp.registrations.length, 1);
    assert.equal(cp.registrations[0].id, "toolsbox-notes-manager");
    assert.ok(cp.registrations[0].label.includes("Notes"));
  });

  it("should have condition that respects enabled pref", () => {
    const cp = createCommandPalette();
    registerNotesManagerFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.notes.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: null,
      commandPalette: cp,
      reader: null,
      surfaceDescriptors: null,
      getPrimaryWindow() { return null; },
    });
    assert.equal(cp.registrations[0].condition(), true);
  });

  it("should disable when notes feature is off", () => {
    const cp = createCommandPalette();
    registerNotesManagerFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.notes.enabled": false }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: null,
      commandPalette: cp,
      reader: null,
      surfaceDescriptors: null,
      getPrimaryWindow() { return null; },
    });
    assert.equal(cp.registrations[0].condition(), false);
  });

  it("should return openNotesManager and getSnapshot from registration", () => {
    const cp = createCommandPalette();
    const result = registerNotesManagerFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.notes.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      menuManager: null,
      commandPalette: cp,
      reader: null,
      surfaceDescriptors: null,
      getPrimaryWindow() { return null; },
    });
    assert.typeOf(result.openNotesManager, "function");
    assert.typeOf(result.getSnapshot, "function");
    const snap = result.getSnapshot();
    assert.equal(snap.open, false);
  });
});
