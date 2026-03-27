import { describe, it, assert } from "./test-framework.js";
import { createMenuManager } from "../src/features/menu-manager.js";

function createManagerHarness() {
  const calls = [];
  const manager = createMenuManager({
    logger: {
      debug() {},
      error() {},
    },
    lifecycle: null,
    i18n: null,
    pluginID: "cleanroom-template@example.com",
    zotero: {
      MenuManager: {
        registerMenu(options) {
          calls.push(options);
          return true;
        },
        unregisterMenu() {},
      },
    },
  });

  return { manager, calls };
}

describe("Menu Manager", () => {
  it("should pass l10n ids through official menu registration helpers", () => {
    const { manager, calls } = createManagerHarness();

    manager.registerContextMenuItem({
      id: "context-item",
      l10nID: "cleanroom-menu-label",
      onCommand() {},
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].menus[0].l10nID, "cleanroom-menu-label");
    assert.equal("label" in calls[0].menus[0], false);
  });

  it("should fallback to plain label without sending null l10nID", () => {
    const { manager, calls } = createManagerHarness();

    manager.registerReaderMenuItem(
      {
        target: manager.MENU_TARGETS.READER_MENU_VIEW,
      },
      {
        id: "reader-item",
        label: "Reader Action",
        onCommand() {},
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].menus[0].label, "Reader Action");
    assert.equal("l10nID" in calls[0].menus[0], false);
  });
});
