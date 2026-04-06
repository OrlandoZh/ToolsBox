import { describe, it, assert } from "./test-framework.js";
import { createCommandPalette } from "../src/features/prompt.js";

function createPaletteHarness({ withPromptAPI = true } = {}) {
  const registrations = [];
  const commandPalette = createCommandPalette({
    logger: {
      debug() {},
      error() {},
    },
    lifecycle: null,
    i18n: null,
    pluginID: "cleanroom-template@example.com",
    zotero: withPromptAPI
      ? {
        Prompt: {
          register(items) {
            registrations.push(items);
          },
        },
      }
      : {},
  });

  return { commandPalette, registrations };
}

describe("Command Palette", () => {
  it("should execute prompt-backed commands through the local command registry", () => {
    const { commandPalette, registrations } = createPaletteHarness();
    const executed = [];

    const commandId = commandPalette.registerCommand({
      id: "reader-summary",
      label: "Reader Summary",
      category: "Demo",
      description: "Open the reader summary overlay.",
      shortcut: "Ctrl+Shift+R",
      aliases: ["summary"],
      keywords: ["reader", "overlay"],
      condition(context = {}) {
        return context.readerReady !== false;
      },
      handler(context) {
        executed.push(context);
      },
    });

    assert.equal(commandId, "reader-summary");
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0][0].id, "reader-summary");
    assert.equal(registrations[0][0].label, "Reader Summary");
    assert.equal(registrations[0][0].when(), true);
    assert.equal(commandPalette.executeCommand("reader-summary", { source: "manual" }), true);
    assert.deepEqual(executed, [{ source: "manual" }]);

    const snapshot = commandPalette.getCommandSnapshot("reader-summary", { readerReady: true });
    assert.deepEqual(snapshot, {
      id: "reader-summary",
      label: "Reader Summary",
      category: "Demo",
      description: "Open the reader summary overlay.",
      shortcut: "Ctrl+Shift+R",
      icon: null,
      aliases: ["summary"],
      keywords: ["reader", "overlay"],
      enabled: true,
      searchable: true,
      type: "prompt",
    });
    assert.deepEqual(commandPalette.getAllCommands(), [{
      id: "reader-summary",
      label: "Reader Summary",
      category: "Demo",
    }]);
  });

  it("should provide overlay-ready command search with aliases keywords and disabled filtering", () => {
    const { commandPalette } = createPaletteHarness();

    commandPalette.registerCommand({
      id: "reader-summary",
      label: "Reader Summary",
      category: "Demo",
      description: "Open the reader summary overlay.",
      aliases: ["summary"],
      keywords: ["reader", "overlay"],
      condition(context = {}) {
        return context.readerReady === true;
      },
      handler() {},
    });
    commandPalette.registerCommand({
      id: "reader-toolbar-rebuild",
      label: "Rebuild Reader Toolbar",
      category: "Demo",
      description: "Rebind toolbar actions after reader ready.",
      keywords: ["reader", "toolbar"],
      condition(context = {}) {
        return context.readerReady === true;
      },
      handler() {},
    });
    commandPalette.registerCommand({
      id: "main-action",
      label: "Open Main Action",
      category: "Demo",
      description: "Open the default action.",
      keywords: ["main"],
      handler() {},
    });
    commandPalette.registerAnonymousCommand({
      id: "search",
      handler() {},
    });

    assert.deepEqual(
      commandPalette.searchCommands("summary", { readerReady: true }).map((item) => item.id),
      ["reader-summary"],
    );
    assert.deepEqual(
      commandPalette.searchCommands("reader", { readerReady: false }).map((item) => item.id),
      [],
    );
    assert.deepEqual(
      commandPalette.searchCommands("reader", { readerReady: false }, { includeDisabled: true }).map((item) => item.id),
      ["reader-summary", "reader-toolbar-rebuild"],
    );
    assert.deepEqual(
      commandPalette.searchCommands("", { readerReady: true }).map((item) => item.id),
      ["main-action", "reader-summary", "reader-toolbar-rebuild"],
    );
  });

  it("should keep fallback commands searchable without requiring Prompt API", () => {
    const { commandPalette } = createPaletteHarness({ withPromptAPI: false });

    const commandId = commandPalette.registerCommand({
      label: "Fallback Action",
      category: "Fallback",
      description: "Searchable even without Prompt API.",
      aliases: ["offline"],
      keywords: ["fallback"],
      handler() {},
    });

    assert.ok(Boolean(commandId));
    assert.equal(commandPalette.isAvailable(), false);
    assert.deepEqual(
      commandPalette.searchCommands("offline").map((item) => item.label),
      ["Fallback Action"],
    );
  });
});
