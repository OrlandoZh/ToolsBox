/**
 * Tests for Command Palette (Prompt) feature
 * createCommandPalette factory and lifecycle
 */

import { describe, it, assert, runTestsIfMain } from "../test-framework.js";
import { createCommandPalette } from "../../src/features/prompt.js";

function createMockLogger() {
  const logs = [];
  return {
    debug(msg, details) { logs.push({ level: 'debug', msg, details }); },
    error(msg, details) { logs.push({ level: 'error', msg, details }); },
    getLogs() { return logs; }
  };
}

function createMockZotero(overrides = {}) {
  const registered = [];
  return {
    Prompt: {
      register(configs) {
        registered.push(...configs);
      },
      getRegistered() { return registered; }
    },
    ...overrides
  };
}

describe("CommandPalette", () => {
  it("should return object with all expected methods", () => {
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin"
    });

    assert.typeOf(palette.isAvailable, 'function', "should have isAvailable");
    assert.typeOf(palette.registerCommand, 'function', "should have registerCommand");
    assert.typeOf(palette.registerAnonymousCommand, 'function', "should have registerAnonymousCommand");
    assert.typeOf(palette.unregisterCommand, 'function', "should have unregisterCommand");
    assert.typeOf(palette.unregisterAll, 'function', "should have unregisterAll");
    assert.typeOf(palette.getCommandCount, 'function', "should have getCommandCount");
    assert.typeOf(palette.hasCommand, 'function', "should have hasCommand");
    assert.typeOf(palette.getAllCommands, 'function', "should have getAllCommands");
    assert.typeOf(palette.getCommandSnapshot, 'function', "should have getCommandSnapshot");
    assert.typeOf(palette.searchCommands, 'function', "should have searchCommands");
    assert.typeOf(palette.executeCommand, 'function', "should have executeCommand");
  });

  it("isAvailable should be true when Zotero.Prompt present", () => {
    const mockZotero = createMockZotero();
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    assert.equal(palette.isAvailable(), true, "isAvailable should be true");
  });

  it("isAvailable should be false when Zotero absent", () => {
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: null
    });

    assert.equal(palette.isAvailable(), false, "isAvailable should be false");
  });

  it("registerCommand should return command ID and track in getAllCommands", () => {
    const mockZotero = createMockZotero();
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const id = palette.registerCommand({
      id: "test-cmd",
      label: "Test Command",
      handler: () => {}
    });

    assert.equal(id, "test-cmd", "should return command id");
    assert.equal(palette.hasCommand("test-cmd"), true, "should track command");
    assert.equal(palette.getCommandCount(), 1, "count should be 1");

    const all = palette.getAllCommands();
    assert.equal(all.length, 1, "getAllCommands should have 1 entry");
    assert.equal(all[0].id, "test-cmd", "command id should match");
    assert.equal(all[0].label, "Test Command", "command label should match");
  });

  it("registerCommand should auto-generate id when not provided", () => {
    const mockZotero = createMockZotero();
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const id = palette.registerCommand({
      label: "Auto Command",
      handler: () => {}
    });

    assert.ok(id && id.startsWith("command-"), "should auto-generate command id");
    assert.equal(palette.hasCommand(id), true, "should track auto-generated command");
  });

  it("registerCommand should reject without label", () => {
    const mockZotero = createMockZotero();
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const id = palette.registerCommand({
      id: "no-label",
      handler: () => {}
    });

    assert.equal(id, null, "should return null without label");
    assert.equal(palette.getCommandCount(), 0, "count should be 0");
  });

  it("registerCommand should reject without handler", () => {
    const mockZotero = createMockZotero();
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    const id = palette.registerCommand({
      id: "no-handler",
      label: "No Handler"
    });

    assert.equal(id, null, "should return null without handler");
    assert.equal(palette.getCommandCount(), 0, "count should be 0");
  });

  it("unregisterCommand should remove command", () => {
    const mockZotero = createMockZotero();
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    palette.registerCommand({
      id: "removable",
      label: "Removable",
      handler: () => {}
    });

    assert.equal(palette.hasCommand("removable"), true, "should have command before unregister");
    assert.equal(palette.unregisterCommand("removable"), true, "unregister should return true");
    assert.equal(palette.hasCommand("removable"), false, "should not have command after unregister");
    assert.equal(palette.getCommandCount(), 0, "count should be 0");
  });

  it("unregisterCommand should return false for unknown command", () => {
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin"
    });

    assert.equal(palette.unregisterCommand("unknown"), false, "unregister unknown should return false");
  });

  it("getCommandCount should increment and decrement", () => {
    const mockZotero = createMockZotero();
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    assert.equal(palette.getCommandCount(), 0, "initial count should be 0");

    palette.registerCommand({ id: "cmd-1", label: "Cmd 1", handler: () => {} });
    assert.equal(palette.getCommandCount(), 1, "count should be 1");

    palette.registerCommand({ id: "cmd-2", label: "Cmd 2", handler: () => {} });
    assert.equal(palette.getCommandCount(), 2, "count should be 2");

    palette.unregisterCommand("cmd-1");
    assert.equal(palette.getCommandCount(), 1, "count should be 1 after unregister");
  });

  it("hasCommand should return true for registered, false for unknown", () => {
    const mockZotero = createMockZotero();
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    palette.registerCommand({ id: "known", label: "Known", handler: () => {} });

    assert.equal(palette.hasCommand("known"), true, "should return true for registered");
    assert.equal(palette.hasCommand("unknown"), false, "should return false for unknown");
  });

  it("searchCommands should filter by query string", () => {
    const mockZotero = createMockZotero();
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    palette.registerCommand({ id: "alpha", label: "Alpha Command", handler: () => {} });
    palette.registerCommand({ id: "beta", label: "Beta Command", handler: () => {} });
    palette.registerCommand({ id: "gamma", label: "Gamma Action", handler: () => {} });

    const results = palette.searchCommands("Beta");
    assert.equal(results.length, 1, "should find 1 result for 'Beta'");
    assert.equal(results[0].id, "beta", "should find beta command");

    const allResults = palette.searchCommands("Command");
    assert.equal(allResults.length, 2, "should find 2 results for 'Command'");
  });

  it("executeCommand should call onExecute callback", () => {
    const mockZotero = createMockZotero();
    let called = false;
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    palette.registerCommand({
      id: "exec-cmd",
      label: "Exec",
      handler: (ctx) => { called = true; }
    });

    const result = palette.executeCommand("exec-cmd");
    assert.equal(result, true, "executeCommand should return true");
    assert.equal(called, true, "handler should be called");
  });

  it("executeCommand should return false for unknown command", () => {
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin"
    });

    assert.equal(palette.executeCommand("unknown"), false, "should return false for unknown");
  });

  it("unregisterAll should clear all commands", () => {
    const mockZotero = createMockZotero();
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    palette.registerCommand({ id: "cmd-a", label: "A", handler: () => {} });
    palette.registerCommand({ id: "cmd-b", label: "B", handler: () => {} });

    assert.equal(palette.getCommandCount(), 2, "should have 2 commands");
    palette.unregisterAll();
    assert.equal(palette.getCommandCount(), 0, "should have 0 commands after unregisterAll");
    assert.equal(palette.hasCommand("cmd-a"), false, "cmd-a should be gone");
    assert.equal(palette.hasCommand("cmd-b"), false, "cmd-b should be gone");
  });

  it("should use globalThis.Zotero when zotero option not provided", () => {
    const saved = globalThis.Zotero;
    globalThis.Zotero = createMockZotero();

    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin"
    });

    assert.equal(palette.isAvailable(), true, "should use globalThis.Zotero fallback");

    const id = palette.registerCommand({
      id: "global-cmd",
      label: "Global",
      handler: () => {}
    });

    assert.equal(id, "global-cmd", "should register via globalThis.Zotero");

    globalThis.Zotero = saved;
  });

  it("getCommandSnapshot should return snapshot for single or all commands", () => {
    const mockZotero = createMockZotero();
    const palette = createCommandPalette({
      logger: createMockLogger(),
      pluginID: "test-plugin",
      zotero: mockZotero
    });

    palette.registerCommand({ id: "snap", label: "Snap", handler: () => {} });

    const single = palette.getCommandSnapshot("snap");
    assert.ok(single, "single snapshot should exist");
    assert.equal(single.id, "snap", "snapshot id should match");

    const all = palette.getCommandSnapshot();
    assert.equal(all.length, 1, "all snapshot should have 1 entry");
    assert.equal(all[0].label, "Snap", "snapshot label should match");
  });
});

await runTestsIfMain(import.meta.url);
