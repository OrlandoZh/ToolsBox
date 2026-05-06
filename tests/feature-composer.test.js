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
  };
  const paneRegistrations = [];
  const commandRegistrations = [];

  return {
    calls,
    deps: {
      config: {
        addonRef: "cleanroomtemplate",
        addonName: "Cleanroom",
        instanceKey: "CleanroomTemplate",
        prefsPrefix: "extensions.zotero.cleanroomtemplate",
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
        locale: "en-US",
        t(_key, _paramsOrFallback, fallbackMaybe) {
          if (typeof _paramsOrFallback === "string") {
            return _paramsOrFallback;
          }
          return fallbackMaybe || _key;
        },
        getBundle() {
          return {
            "cleanroom-pref-caption": "Cleanroom Template Preferences",
          };
        },
      },
      preferencePanes: {
        async registerPane(options) {
          calls.panes += 1;
          paneRegistrations.push(options);
        },
        getPaneCount() {
          return calls.panes;
        },
      },
      commandPalette: {
        registerCommand(options) {
          calls.commands += 1;
          commandRegistrations.push(options);
        },
        getCommandCount() {
          return calls.commands;
        },
      },
      readerSelectionActions: {},
      menuManager: {
        MENU_TARGETS: {
          READER_MENU_VIEW: "reader-view",
        },
        isOfficialAPIAvailable() {
          return false;
        },
        registerItemMenuItem() {},
        registerReaderMenubarViewMenuItem() {},
        getMenuCount() {
          return 0;
        },
      },
      reader: {},
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
        subscribe() {
          calls.notifier += 1;
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
      bundleRuntime: {
        isEnabled() {
          return false;
        },
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
      demoInfoRowID: "demo-row",
      demoSectionID: "demo-section",
      demoColumnKey: "demo-column",
      demoNotifierID: "demo-notifier",
      updateDemoNotifierState() {},
    },
    paneRegistrations,
    commandRegistrations,
  };
}

describe("Feature Composer", () => {
  it("should register baseline features only once", async () => {
    const { deps, calls, paneRegistrations, commandRegistrations } = createDeps();
    const composer = createFeatureComposer(deps);

    await composer.registerBaselineFeatures();
    await composer.registerBaselineFeatures();

    assert.equal(calls.panes, 1);
    assert.equal(calls.commands, 9);
    assert.equal(calls.columns, 11);
    assert.equal(calls.rows, 0);
    assert.equal(calls.sections, 1);
    assert.equal(calls.notifier, 0);
    assert.equal(typeof paneRegistrations[0]?.onPreferenceLoad, "function");
    assert.equal(paneRegistrations[0]?.scripts, undefined);
    assert.deepEqual(paneRegistrations[0]?.stylesheets, ["content/preferences.css"]);
    assert.equal(commandRegistrations[0].id, "cleanroomtemplate-primary-action");
  });

  it("should initialize preference panes through onPreferenceLoad", async () => {
    const { deps, paneRegistrations } = createDeps();
    const composer = createFeatureComposer(deps);

    await composer.registerBaselineFeatures();

    const loadedScripts = [];
    const initCalls = [];
    const insertedFTL = [];
    const window = {
      MozXULElement: {
        insertFTLIfNeeded(resourceID) {
          insertedFTL.push(resourceID);
        },
      },
      Services: {
        scriptloader: {
          loadSubScript(uri, scope) {
            loadedScripts.push({ uri, scope });
            if (uri.endsWith("content/preferences.js")) {
              scope.initCleanroomPreferences = (options) => {
                initCalls.push(options);
                return {
                  ok: true,
                };
              };
            }
          },
        },
      },
    };

    await paneRegistrations[0].onPreferenceLoad({
      window,
      paneID: "cleanroomtemplate-preferences",
      pluginID: "cleanroom-template@example.com",
      resolveURI(uri) {
        return `chrome://cleanroomtemplate/${uri}`;
      },
    });

    assert.deepEqual(loadedScripts.map((entry) => entry.uri), [
      "chrome://cleanroomtemplate/content/theme.js",
      "chrome://cleanroomtemplate/content/preferences.js",
    ]);
    assert.deepEqual(insertedFTL, ["main.ftl"]);
    assert.equal(window.__CLEANROOM_PREFERENCE_BRIDGE__.addonRef, "cleanroomtemplate");
    assert.equal(window.__CLEANROOM_PREFERENCE_BRIDGE__.locale, "en-US");
    assert.equal(window.__CLEANROOM_PREFERENCE_BRIDGE__.instanceKey, "CleanroomTemplate");
    assert.equal(window.__CLEANROOM_PREFERENCE_BRIDGE__.preferenceBindingMode, "native");
    assert.equal(window.__CLEANROOM_PREFERENCE_BRIDGE__.preferenceNames, null);
    assert.deepEqual(window.__CLEANROOM_PREFERENCE_BRIDGE__.strings, {
      "cleanroom-pref-caption": "Cleanroom Template Preferences",
    });
    assert.deepEqual(initCalls, [
      {
        bridge: {
          addonRef: "cleanroomtemplate",
          locale: "en-US",
          pluginID: "cleanroom-template@example.com",
          instanceKey: "CleanroomTemplate",
          preferenceBindingMode: "native",
          preferenceNames: null,
          strings: {
            "cleanroom-pref-caption": "Cleanroom Template Preferences",
          },
        },
      },
    ]);
  });

  it("should pass pref bridge metadata only for the pref-bridge descriptor mode", async () => {
    const { deps, paneRegistrations } = createDeps();
    deps.surfaceDescriptors = {
      preferencePaneID: "crabc-p0",
      preferenceRootID: "crabc-p0-root",
      preferenceBindingMode: "bridge",
      readerSelectionCommandID: "crabc-c2",
      primaryActionCommandID: "crabc-c0",
      readerSummaryCommandID: "crabc-c1",
      contextMenuItemID: "crabc-m2",
      readerSummaryMenuItemID: "crabc-c1",
      demoInfoRowID: "crabc-r0",
      demoSectionID: "crabc-r1",
      demoColumnKey: "crabc-r2",
      demoNotifierID: "crabc-r3",
      shortcutIDPrefix: "crabc-k0",
      menuCommand: {
        toolsMenuItemID: "crabc-m0",
        injectedStyleID: "crabc-m1",
      },
      serviceIDs: {
        runtimeCore: "crabc.s0",
        hostSignals: "crabc.s1",
        hostNonce: "crabc.s2",
        runtimeBridge: "crabc.s3",
      },
      serviceLabels: {
        runtimeCore: "Service 0",
        hostSignals: "Service 1",
        hostNonce: "Service 2",
        runtimeBridge: "Service 3",
      },
    };
    const composer = createFeatureComposer(deps);

    await composer.registerBaselineFeatures();

    const window = {
      Services: {
        scriptloader: {
          loadSubScript(_uri, scope) {
            scope.initCleanroomPreferences = (options) => options;
          },
        },
      },
    };

    const result = await paneRegistrations[0].onPreferenceLoad({
      window,
      paneID: "crabc-p0",
      pluginID: "cleanroom-template@example.com",
      resolveURI(uri) {
        return `chrome://cleanroomtemplate/${uri}`;
      },
    });

    assert.equal(result.bridge.preferenceBindingMode, "bridge");
    assert.deepEqual(result.bridge.preferenceNames, {
      enabled: "extensions.zotero.cleanroomtemplate.enabled",
      menuLabel: "extensions.zotero.cleanroomtemplate.menuLabel",
      logLevel: "extensions.zotero.cleanroomtemplate.logLevel",
      themeMode: "extensions.zotero.cleanroomtemplate.themeMode",
    });
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
      registerItemMenuItem(menuItem) {
        contextMenus.push(menuItem);
      },
      registerReaderMenubarViewMenuItem(menuItem) {
        readerMenus.push(menuItem);
      },
      getMenuCount() {
        return contextMenus.length + readerMenus.length;
      },
    };

    const composer = createFeatureComposer(deps);
    await composer.registerBaselineFeatures();

    assert.equal(contextMenus.length, 2);
    assert.equal(readerMenus.length, 0);
    assert.equal(contextMenus[0].l10nID, "cleanroom-menu-label");
    assert.equal(contextMenus[0].label, undefined);
    assert.equal(contextMenus[1].l10nID, "cleanroom-rg-item-menu-label");
    assert.equal(contextMenus[1].label, undefined);
  });
});
