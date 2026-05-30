/**
 * Tests for Preference Panes feature
 * createPreferencePanes factory and pane lifecycle
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createPreferencePanes } from "../../src/features/preference-panes.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(msg, details) { logs.push({ level: 'debug', msg, details }); },
    error(msg, details) { logs.push({ level: 'error', msg, details }); },
    warn(msg, details) { logs.push({ level: 'warn', msg, details }); },
    getLogs() { return logs; }
  };
}

function createMockZotero(overrides = {}) {
  const panes = new Map();
  return {
    PreferencePanes: {
      async register(options) {
        panes.set(options.id || "pane-" + panes.size, options);
        return options.id || "pane-" + (panes.size - 1);
      },
      unregister(paneId) {
        panes.delete(paneId);
      },
      getPanes() { return panes; }
    },
    ...overrides
  };
}

describe("PreferencePanes", () => {
  it("should return object with all expected methods", () => {
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: ""
    });

    assert.typeOf(panes.isAvailable, 'function', "should have isAvailable");
    assert.typeOf(panes.registerPane, 'function', "should have registerPane");
    assert.typeOf(panes.unregisterPane, 'function', "should have unregisterPane");
    assert.typeOf(panes.unregisterAll, 'function', "should have unregisterAll");
    assert.typeOf(panes.getPaneCount, 'function', "should have getPaneCount");
    assert.typeOf(panes.hasPane, 'function', "should have hasPane");
    assert.typeOf(panes.getAllPanes, 'function', "should have getAllPanes");
    assert.typeOf(panes.resolveURI, 'function', "should have resolveURI");
  });

  it("isAvailable should be true when Zotero.PreferencePanes present", () => {
    const mockZotero = createMockZotero();
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: "",
      zotero: mockZotero
    });

    assert.equal(panes.isAvailable(), true, "isAvailable should be true");
  });

  it("isAvailable should be false when Zotero.PreferencePanes absent", () => {
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: "",
      zotero: {}
    });

    assert.equal(panes.isAvailable(), false, "isAvailable should be false");
  });

  it("registerPane should register pane with Zotero.PreferencePanes.register", async () => {
    const mockZotero = createMockZotero();
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: "chrome://test/",
      zotero: mockZotero
    });

    const paneId = await panes.registerPane({
      id: "test-pane",
      src: "content/pane.xhtml",
      label: "Test Pane"
    });

    assert.equal(paneId, "test-pane", "should return pane id");
    assert.equal(panes.hasPane("test-pane"), true, "should track registered pane");
    assert.equal(panes.getPaneCount(), 1, "count should be 1");
  });

  it("registerPane should reject without src", async () => {
    const mockZotero = createMockZotero();
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: "",
      zotero: mockZotero
    });

    const paneId = await panes.registerPane({
      id: "no-src",
      label: "No Src"
    });

    assert.equal(paneId, null, "should return null without src");
    assert.equal(panes.getPaneCount(), 0, "count should be 0");
  });

  it("unregisterPane should remove pane", async () => {
    const mockZotero = createMockZotero();
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: "",
      zotero: mockZotero
    });

    await panes.registerPane({
      id: "removable",
      src: "content/removable.xhtml",
      label: "Removable"
    });

    assert.equal(panes.hasPane("removable"), true, "should have pane before unregister");
    assert.equal(panes.unregisterPane("removable"), true, "unregister should return true");
    assert.equal(panes.hasPane("removable"), false, "should not have pane after unregister");
    assert.equal(panes.getPaneCount(), 0, "count should be 0");
  });

  it("unregisterPane should return false for unknown pane", () => {
    const mockZotero = createMockZotero();
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: "",
      zotero: mockZotero
    });

    assert.equal(panes.unregisterPane("unknown"), false, "unregister unknown should return false");
  });

  it("getPaneCount should track count correctly", async () => {
    const mockZotero = createMockZotero();
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: "",
      zotero: mockZotero
    });

    assert.equal(panes.getPaneCount(), 0, "initial count should be 0");

    await panes.registerPane({ id: "pane-1", src: "a.xhtml", label: "A" });
    assert.equal(panes.getPaneCount(), 1, "count should be 1");

    await panes.registerPane({ id: "pane-2", src: "b.xhtml", label: "B" });
    assert.equal(panes.getPaneCount(), 2, "count should be 2");

    panes.unregisterPane("pane-1");
    assert.equal(panes.getPaneCount(), 1, "count should be 1 after unregister");
  });

  it("hasPane should return true for registered, false for unknown", async () => {
    const mockZotero = createMockZotero();
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: "",
      zotero: mockZotero
    });

    await panes.registerPane({ id: "known", src: "known.xhtml", label: "Known" });

    assert.equal(panes.hasPane("known"), true, "should return true for registered");
    assert.equal(panes.hasPane("unknown"), false, "should return false for unknown");
  });

  it("getAllPanes should return registered pane IDs", async () => {
    const mockZotero = createMockZotero();
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: "",
      zotero: mockZotero
    });

    await panes.registerPane({ id: "pane-a", src: "a.xhtml", label: "A" });
    await panes.registerPane({ id: "pane-b", src: "b.xhtml", label: "B" });

    const all = panes.getAllPanes();
    assert.equal(all.length, 2, "should return 2 pane IDs");
    assert.ok(all.includes("pane-a"), "should include pane-a");
    assert.ok(all.includes("pane-b"), "should include pane-b");
  });

  it("resolveURI should resolve relative URIs", () => {
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: "chrome://test/",
      zotero: createMockZotero()
    });

    assert.equal(panes.resolveURI("content/pane.xhtml"), "chrome://test/content/pane.xhtml", "should resolve relative URI");
    assert.equal(panes.resolveURI("chrome://other/file.xhtml"), "chrome://other/file.xhtml", "should keep absolute URI");
    assert.equal(panes.resolveURI("/absolute/path"), "/absolute/path", "should keep absolute path");
    assert.equal(panes.resolveURI(""), "", "should handle empty string");
  });

  it("unregisterAll should clear all panes", async () => {
    const mockZotero = createMockZotero();
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: "",
      zotero: mockZotero
    });

    await panes.registerPane({ id: "pane-a", src: "a.xhtml", label: "A" });
    await panes.registerPane({ id: "pane-b", src: "b.xhtml", label: "B" });

    assert.equal(panes.getPaneCount(), 2, "should have 2 panes");
    panes.unregisterAll();
    assert.equal(panes.getPaneCount(), 0, "should have 0 panes after unregisterAll");
    assert.equal(panes.hasPane("pane-a"), false, "pane-a should be gone");
    assert.equal(panes.hasPane("pane-b"), false, "pane-b should be gone");
  });

  it("should use globalThis.Zotero when zotero option not provided", async () => {
    const saved = globalThis.Zotero;
    globalThis.Zotero = createMockZotero();

    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      rootURI: ""
    });

    assert.equal(panes.isAvailable(), true, "should use globalThis.Zotero fallback");

    const paneId = await panes.registerPane({
      id: "global-pane",
      src: "content/global.xhtml",
      label: "Global"
    });

    assert.equal(paneId, "global-pane", "should register via globalThis.Zotero");

    globalThis.Zotero = saved;
  });

  it("registerPane should use pluginID from options", async () => {
    const mockZotero = createMockZotero();
    const panes = createPreferencePanes({
      logger: createMockLogger(),
      pluginID: "my-plugin",
      rootURI: "chrome://my/",
      zotero: mockZotero
    });

    await panes.registerPane({
      id: "plugin-pane",
      src: "content/pane.xhtml",
      label: "Plugin Pane"
    });

    const registered = mockZotero.PreferencePanes.getPanes().get("plugin-pane");
    assert.ok(registered, "pane should be registered");
    assert.equal(registered.pluginID, "my-plugin", "should use pluginID from options");
  });
});

await runTestsIfMain(import.meta.url);
