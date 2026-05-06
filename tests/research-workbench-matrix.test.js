import { describe, it, assert } from "./test-framework.js";
import { registerPaperMatrixFeatures } from "../src/features/research-workbench-matrix.js";

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

describe("Paper Matrix", () => {
  it("should register an open command", () => {
    const cp = createCommandPalette();
    registerPaperMatrixFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.matrix.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return { closed: false, openDialog() {} }; } },
      commandPalette: cp,
      surfaceDescriptors: { paperMatrixCommandID: "toolsbox-paper-matrix" },
    });
    assert.equal(cp.registrations.length, 1);
    assert.equal(cp.registrations[0].id, "toolsbox-paper-matrix");
    assert.ok(cp.registrations[0].label.includes("Matrix"));
  });

  it("should have condition that respects enabled pref", () => {
    const cp = createCommandPalette();
    registerPaperMatrixFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.matrix.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      commandPalette: cp,
      surfaceDescriptors: null,
    });
    assert.equal(cp.registrations[0].condition(), true);
  });

  it("should disable when matrix feature is off", () => {
    const cp = createCommandPalette();
    registerPaperMatrixFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.matrix.enabled": false }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      commandPalette: cp,
      surfaceDescriptors: null,
    });
    assert.equal(cp.registrations[0].condition(), false);
  });

  it("should return openPaperMatrix and getSnapshot from registration", () => {
    const cp = createCommandPalette();
    const result = registerPaperMatrixFeatures({
      config: { addonRef: "toolsbox", addonName: "ToolsBox" },
      logger: { debug() {}, warn() {} },
      prefs: createPrefs({ "researchWorkbench.matrix.enabled": true }),
      i18n: createI18n(),
      host: { getPrimaryWindow() { return null; } },
      commandPalette: cp,
      surfaceDescriptors: null,
    });
    assert.typeOf(result.openPaperMatrix, "function");
    assert.typeOf(result.getSnapshot, "function");
    const snap = result.getSnapshot();
    assert.equal(snap.open, false);
  });
});
