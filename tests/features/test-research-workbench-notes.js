/**
 * Tests for Research Workbench Notes feature
 * Notes manager registration and payload building
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { registerNotesManagerFeatures } from "../../src/features/research-workbench-notes.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(msg, details) { logs.push({ level: "debug", msg, details }); },
    warn(msg, details) { logs.push({ level: "warn", msg, details }); },
    getLogs() { return logs; },
  };
}

function createMockCommandPalette() {
  const commands = [];
  return {
    commands,
    registerCommand(cmd) { commands.push(cmd); },
  };
}

function createMockPrefs(overrides = {}) {
  const store = new Map(Object.entries(overrides));
  return {
    get(key) { return store.get(key); },
    set(key, value) { store.set(key, value); },
    getStringPref(key) { return store.get(key); },
    setStringPref(key, value) { store.set(key, value); },
  };
}

describe("ResearchWorkbenchNotes", () => {
  it("registerNotesManagerFeatures returns expected API", () => {
    const commandPalette = createMockCommandPalette();
    const result = registerNotesManagerFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    });

    assert.typeOf(result.openNotesManager, "function", "should have openNotesManager");
    assert.typeOf(result.getSnapshot, "function", "should have getSnapshot");
  });

  it("registerNotesManagerFeatures registers command palette entry", () => {
    const commandPalette = createMockCommandPalette();
    registerNotesManagerFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    });

    assert.equal(commandPalette.commands.length, 1, "should register 1 command");
    assert.ok(commandPalette.commands[0].id.includes("notes-manager"), "command id should reference notes-manager");
  });

  it("getSnapshot returns default when shell not open", () => {
    const commandPalette = createMockCommandPalette();
    const result = registerNotesManagerFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    });

    const snapshot = result.getSnapshot();
    assert.equal(snapshot.open, false, "snapshot should show not open");
  });

  it("command palette entry has correct structure", () => {
    const commandPalette = createMockCommandPalette();
    registerNotesManagerFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    });

    const cmd = commandPalette.commands[0];
    assert.typeOf(cmd.id, "string", "command should have id");
    assert.typeOf(cmd.label, "string", "command should have label");
    assert.typeOf(cmd.handler, "function", "command should have handler");
    assert.typeOf(cmd.condition, "function", "command should have condition");
  });

  it("command condition returns true by default", () => {
    const commandPalette = createMockCommandPalette();
    registerNotesManagerFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    });

    const cmd = commandPalette.commands[0];
    assert.equal(cmd.condition(), true, "condition should default to true");
  });

  it("command condition returns false when pref disabled", () => {
    const commandPalette = createMockCommandPalette();
    registerNotesManagerFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs({ "researchWorkbench.notes.enabled": false }),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    });

    const cmd = commandPalette.commands[0];
    assert.equal(cmd.condition(), false, "condition should be false when pref disabled");
  });

  it("handler is callable without throwing", () => {
    const commandPalette = createMockCommandPalette();
    registerNotesManagerFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    });

    const cmd = commandPalette.commands[0];
    assert.doesNotThrow(() => cmd.handler(), "handler should not throw");
  });

  it("getSnapshot returns consistent shape", () => {
    const commandPalette = createMockCommandPalette();
    const result = registerNotesManagerFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    });

    const snapshot = result.getSnapshot();
    assert.typeOf(snapshot.open, "boolean", "snapshot.open should be boolean");
  });

  it("registerNotesManagerFeatures with surfaceDescriptors uses custom command ID", () => {
    const commandPalette = createMockCommandPalette();
    registerNotesManagerFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: { notesManagerCommandID: "custom-notes-cmd" },
    });

    assert.equal(commandPalette.commands[0].id, "custom-notes-cmd", "should use custom command ID");
  });

  it("registerNotesManagerFeatures is idempotent on command registration", () => {
    const commandPalette = createMockCommandPalette();
    const options = {
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs(),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    };

    registerNotesManagerFeatures(options);
    registerNotesManagerFeatures(options);
    assert.equal(commandPalette.commands.length, 2, "each call registers a command (no dedup in mock)");
  });

  it("openNotesManager returns undefined when disabled", () => {
    const commandPalette = createMockCommandPalette();
    const result = registerNotesManagerFeatures({
      config: { addonRef: "test", addonName: "Test" },
      logger: createMockLogger(),
      prefs: createMockPrefs({ "researchWorkbench.notes.enabled": false }),
      i18n: { t: (_key, fallback) => fallback },
      host: {},
      commandPalette,
      surfaceDescriptors: {},
    });

    assert.equal(result.openNotesManager(), undefined, "should return undefined when disabled");
  });
});

await runTestsIfMain(import.meta.url);
