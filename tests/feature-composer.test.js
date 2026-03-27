import { describe, it, assert } from "./test-framework.js";
import { createFeatureComposer } from "../src/app/feature-composer.js";

function createDeps() {
  const calls = {
    panes: 0,
    commands: 0,
    columns: 0,
    rows: 0,
    sections: 0,
    notifier: 0,
    primary: 0,
    readerDemo: 0,
    updateNotifier: 0,
  };
  const notifierHandlers = [];
  const demoState = {
    shortcutLabel: "Ctrl+Shift+Y",
    shortcutTriggerCount: 0,
    lastNotifierEvent: "idle",
  };
  const demoSectionRefreshers = new Set();

  return {
    calls,
    notifierHandlers,
    deps: {
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom",
        icons: {
          "48": "content/icons/icon-48.png",
        },
      },
      logger: {
        info() {},
      },
      host: {
        resolveContentUrl(path) {
          return `chrome://cleanroomtemplate/${path}`;
        },
      },
      prefs: {
        get(key) {
          if (key === "enabled") {
            return true;
          }
          return null;
        },
      },
      i18n: {
        t(_key, _paramsOrFallback, fallbackMaybe) {
          if (typeof _paramsOrFallback === "string") {
            return _paramsOrFallback;
          }
          return fallbackMaybe || _key;
        },
      },
      preferencePanes: {
        async registerPane() {
          calls.panes += 1;
        },
        getPaneCount() {
          return calls.panes;
        },
      },
      commandPalette: {
        registerCommand() {
          calls.commands += 1;
        },
        getCommandCount() {
          return calls.commands;
        },
      },
      menuManager: {
        MENU_TARGETS: {
          READER_MENU_VIEW: "reader-view",
        },
        isOfficialAPIAvailable() {
          return false;
        },
        registerContextMenuItem() {},
        registerReaderMenuItem() {},
        getMenuCount() {
          return 0;
        },
      },
      reader: {
        getActiveSummary() {
          return null;
        },
      },
      itemTree: {
        createConditionalCellRenderer() {
          return () => {};
        },
        registerColumn() {
          calls.columns += 1;
        },
        getColumnCount() {
          return calls.columns;
        },
      },
      itemPane: {
        registerInfoRow() {
          calls.rows += 1;
        },
        registerSection() {
          calls.sections += 1;
        },
        getInfoRowCount() {
          return calls.rows;
        },
        getSectionCount() {
          return calls.sections;
        },
      },
      notifier: {
        subscribe(types, handler) {
          calls.notifier += 1;
          notifierHandlers.push({ types, handler });
        },
        getActiveCount() {
          return calls.notifier;
        },
      },
      getPrimaryWindow() {
        return null;
      },
      runPrimaryAction() {
        calls.primary += 1;
      },
      runReaderDemo() {
        calls.readerDemo += 1;
      },
      getColumnValue() {
        return "item · 0";
      },
      getItemSummary() {
        return "summary";
      },
      createSectionLine(_doc, _label, value) {
        return { value };
      },
      demoState,
      demoSectionRefreshers,
      demoInfoRowID: "demo-row",
      demoSectionID: "demo-section",
      demoColumnKey: "demo-column",
      demoNotifierID: "demo-notifier",
      updateDemoNotifierState() {
        calls.updateNotifier += 1;
      },
    },
  };
}

describe("Feature Composer", () => {
  it("should register baseline features only once", async () => {
    const { deps, calls } = createDeps();
    const composer = createFeatureComposer(deps);

    await composer.registerBaselineFeatures();
    await composer.registerBaselineFeatures();

    assert.equal(calls.panes, 1);
    assert.equal(calls.commands, 2);
    assert.equal(calls.columns, 1);
    assert.equal(calls.rows, 1);
    assert.equal(calls.sections, 1);
    assert.equal(calls.notifier, 1);
  });

  it("should pass notifier events to updater callback", async () => {
    const { deps, calls, notifierHandlers } = createDeps();
    const composer = createFeatureComposer(deps);
    await composer.registerBaselineFeatures();

    assert.equal(notifierHandlers.length, 1);
    notifierHandlers[0].handler("modify", "item", [101]);
    assert.equal(calls.updateNotifier, 1);
  });

  it("should use l10n ids for official menu registrations", async () => {
    const { deps } = createDeps();
    const contextMenus = [];
    const readerMenus = [];

    deps.menuManager = {
      MENU_TARGETS: {
        READER_MENU_VIEW: "reader-view",
      },
      isOfficialAPIAvailable() {
        return true;
      },
      registerContextMenuItem(menuItem) {
        contextMenus.push(menuItem);
      },
      registerReaderMenuItem(config, menuItem) {
        readerMenus.push({ config, menuItem });
      },
      getMenuCount() {
        return contextMenus.length + readerMenus.length;
      },
    };

    const composer = createFeatureComposer(deps);
    await composer.registerBaselineFeatures();

    assert.equal(contextMenus.length, 1);
    assert.equal(readerMenus.length, 1);
    assert.equal(contextMenus[0].l10nID, "cleanroom-menu-label");
    assert.equal(contextMenus[0].label, undefined);
    assert.equal(readerMenus[0].menuItem.l10nID, "cleanroom-reader-menu-label");
    assert.equal(readerMenus[0].menuItem.label, undefined);
  });
});
