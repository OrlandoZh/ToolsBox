import { describe, it, assert } from "./test-framework.js";
import { createFeatureComposer } from "../src/app/feature-composer.js";

const DIRECT_STYLE_FEATURE_PREFS = new Set([
  "aiGenerateRemark.enabled",
  "aiGenerateTags.enabled",
  "annotationColors.enabled",
  "annotationColumn.enabled",
  "annotationDistributionColumn.enabled",
  "annotationManager.enabled",
  "attachmentPreview.enabled",
  "attachmentVersion.enabled",
  "backlinks.enabled",
  "citedCountColumn.enabled",
  "collectionItemCount.enabled",
  "collectionSort.enabled",
  "customExternalAPI.enabled",
  "favoriteCollections.enabled",
  "graphView.enabled",
  "ifColumn.enabled",
  "marginAnnotation.enabled",
  "mergeAnnotations.enabled",
  "pdfBackground.enabled",
  "publicationTagsColumn.enabled",
  "readTimeColumn.enabled",
  "sidebarToggle.enabled",
  "styleEditor.enabled",
  "tabManager.enabled",
  "titleColumnEnhanced.enabled",
  "tldrPanel.enabled",
  "viewGroups.enabled",
]);

function createMockElement(id = "") {
  return {
    id,
    dataset: {},
    style: {},
    classList: {
      add() {},
      remove() {},
    },
    appendChild() {},
    insertBefore() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    remove() {
      this.removed = true;
    },
  };
}

function createMockZotero() {
  const itemTreeColumns = [];
  const itemPaneSections = [];
  const notifierObservers = [];
  const unregisteredObservers = [];
  const readerHandlers = [];
  const document = {
    createElement(tagName) {
      return createMockElement(tagName);
    },
    createElementNS(_namespace, tagName) {
      return createMockElement(tagName);
    },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
  };

  return {
    itemTreeColumns,
    itemPaneSections,
    notifierObservers,
    unregisteredObservers,
    readerHandlers,
    ItemTreeManager: {
      registerColumn(column) {
        itemTreeColumns.push(column);
      },
      unregisterColumn() {},
      getColumns() {
        return itemTreeColumns;
      },
    },
    ItemPaneManager: {
      registerSection(section) {
        itemPaneSections.push(section);
      },
    },
    Collections: {
      get() {
        return null;
      },
      getByLibrary() {
        return [];
      },
    },
    Libraries: {
      userLibraryID: 1,
    },
    Reader: {
      on(eventName, handler) {
        readerHandlers.push({ eventName, handler });
      },
      getActiveReaders() {
        return [];
      },
      getByTabID() {
        return null;
      },
      open() {},
    },
    Notifier: {
      registerObserver(observer, types, id = "mock-observer") {
        notifierObservers.push({ observer, types, id });
        return id;
      },
      unregisterObserver(id) {
        unregisteredObservers.push(id);
      },
    },
    Annotations: {
      getByItemID() {
        return [];
      },
      get() {
        return null;
      },
    },
    Items: {
      get() {
        return null;
      },
    },
    getMainWindow() {
      return {
        document,
        addEventListener() {},
        openDialog() {
          return {
            closed: false,
            focus() {},
            close() {
              this.closed = true;
            },
          };
        },
      };
    },
  };
}

function createDeps() {
  const calls = {
    panes: 0,
    commands: 0,
    columns: 0,
    rows: 0,
    sections: 0,
    sectionUnregisters: 0,
    notifier: 0,
    primary: 0,
  };
  const sectionUnregistrations = [];
  const sectionRegistrations = [];
  const paneRegistrations = [];
  const commandRegistrations = [];
  const logEntries = [];

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
        info(message, details) {
          logEntries.push({ level: "info", message, details });
        },
        debug(message, details) {
          logEntries.push({ level: "debug", message, details });
        },
        warn(message, details) {
          logEntries.push({ level: "warn", message, details });
        },
        error(message, details) {
          logEntries.push({ level: "error", message, details });
        },
      },
      host: {
        resolveContentUrl(path) {
          return `chrome://cleanroomtemplate/${path}`;
        },
      },
      prefs: {
        values: new Map(),
        get(key) {
          if (key === "enabled") {
            return true;
          }
          if (this.values.has(key)) {
            return this.values.get(key);
          }
          if (DIRECT_STYLE_FEATURE_PREFS.has(key)) {
            return false;
          }
          return null;
        },
        set(key, value) {
          this.values.set(key, value);
        },
      },
      zotero: createMockZotero(),
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
        registerSection(options = {}) {
          calls.sections += 1;
          sectionRegistrations.push(options);
          return options.paneID || `section-${calls.sections}`;
        },
        unregisterSection(paneID) {
          calls.sectionUnregisters += 1;
          sectionUnregistrations.push(paneID);
          return true;
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
    sectionRegistrations,
    commandRegistrations,
    sectionUnregistrations,
    logEntries,
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

  it("should allow baseline features to register again after lifecycle cleanup", async () => {
    const cleanups = [];
    const { deps, calls } = createDeps();
    deps.lifecycle = {
      trackCleanup(fn) {
        cleanups.push(fn);
      },
    };
    const composer = createFeatureComposer(deps);

    await composer.registerBaselineFeatures();
    assert.equal(calls.panes, 1);
    assert.equal(calls.columns, 11);
    assert.equal(calls.sections, 1);
    assert.equal(cleanups.length, 1);

    cleanups.pop()();
    await composer.registerBaselineFeatures();

    assert.equal(calls.panes, 2);
    assert.equal(calls.columns, 22);
    assert.equal(calls.sections, 2);
    assert.equal(cleanups.length, 1);
  });

  it("should cleanup explicitly enabled prototype features through lifecycle cleanup", async () => {
    const cleanups = [];
    const { deps, calls, sectionUnregistrations } = createDeps();
    deps.prefs.values.set("backlinks.enabled", true);
    deps.prefs.values.set("mergeAnnotations.enabled", true);
    deps.prefs.values.set("attachmentVersion.enabled", true);
    deps.prefs.values.set("tldrPanel.enabled", true);
    deps.prefs.values.set("customExternalAPI.enabled", true);
    deps.prefs.values.set("customExternalAPI.endpoint", "http://127.0.0.1:49209/toolsbox");
    deps.prefs.values.set("collectionItemCount.enabled", true);
    deps.prefs.values.set("marginAnnotation.enabled", true);
    deps.lifecycle = {
      trackCleanup(fn) {
        cleanups.push(fn);
      },
    };
    const composer = createFeatureComposer(deps);

    await composer.registerBaselineFeatures();
    assert.equal(deps.zotero.notifierObservers.some((entry) => entry.id === "toolsbox-collection-count"), true);
    assert.equal(deps.zotero.notifierObservers.some((entry) => entry.id === "mock-observer"), true);
    assert.equal(calls.sections, 6);

    cleanups[0]();
    cleanups[0]();

    assert.equal(deps.zotero.unregisteredObservers.includes("toolsbox-collection-count"), true);
    assert.equal(deps.zotero.unregisteredObservers.includes("mock-observer"), true);
    assert.deepEqual(sectionUnregistrations, [
      "toolsbox-attachment-version",
      "toolsbox-merge-annotations",
      "toolsbox-backlinks",
      "toolsbox-custom-external-api",
      "toolsbox-tldr-panel",
    ]);
    assert.equal(calls.sectionUnregisters, 5);
  });

  it("should keep Style Editor command unregistered by default and register it only when enabled", async () => {
    const { deps, calls, commandRegistrations } = createDeps();
    const composer = createFeatureComposer(deps);

    await composer.registerBaselineFeatures();

    assert.equal(commandRegistrations.some((entry) => entry.id === "cleanroomtemplate-style-editor"), false);
    assert.equal(calls.commands, 9);

    const enabled = createDeps();
    enabled.deps.prefs.values.set("styleEditor.enabled", true);
    const enabledComposer = createFeatureComposer(enabled.deps);

    await enabledComposer.registerBaselineFeatures();

    const styleEditorCommand = enabled.commandRegistrations
      .find((entry) => entry.id === "cleanroomtemplate-style-editor");
    assert.ok(styleEditorCommand);
    assert.equal(styleEditorCommand.condition(), true);
    assert.equal(enabled.calls.commands, 10);
  });

  it("should register TLDR as no-network preview and Custom External API only with an endpoint", async () => {
    const { deps, calls, commandRegistrations, sectionRegistrations, logEntries } = createDeps();
    deps.prefs.values.set("tldrPanel.enabled", true);
    deps.prefs.values.set("customExternalAPI.enabled", true);
    deps.prefs.values.set("customExternalAPI.endpoint", "http://127.0.0.1:49210/toolsbox");
    deps.prefs.values.set("openai.apiKey", "real-looking-key");
    const composer = createFeatureComposer(deps);

    await composer.registerBaselineFeatures();

    assert.equal(calls.commands, 9);
    assert.equal(calls.sections, 3);
    assert.ok(sectionRegistrations.some((entry) => entry.paneID === "toolsbox-tldr-panel"));
    assert.ok(sectionRegistrations.some((entry) => entry.paneID === "toolsbox-custom-external-api"));
    assert.equal(commandRegistrations.some((entry) => String(entry.id || "").includes("tldr")), false);
    assert.equal(commandRegistrations.some((entry) => String(entry.id || "").includes("external")), false);

    const tldrLog = logEntries.find((entry) => entry.message === "features.tldrPanel.registered");
    const externalLog = logEntries.find((entry) => entry.message === "features.customExternalAPI.registered");
    assert.ok(tldrLog);
    assert.ok(externalLog);
  });

  it("should keep Custom External API unregistered when enabled without an endpoint", async () => {
    const { deps, calls, sectionRegistrations, logEntries } = createDeps();
    deps.prefs.values.set("customExternalAPI.enabled", true);
    deps.prefs.values.set("customExternalAPI.endpoint", "");
    const composer = createFeatureComposer(deps);

    await composer.registerBaselineFeatures();

    assert.equal(calls.sections, 1);
    assert.equal(sectionRegistrations.some((entry) => entry.paneID === "toolsbox-custom-external-api"), false);
    const externalLog = logEntries.find((entry) => entry.message === "features.customExternalAPI.unavailable");
    assert.ok(externalLog);
    assert.equal(externalLog.details.reason, "endpoint-missing");
    assert.equal(externalLog.details.requestedCapability, "invokeExternal");
    assert.equal(externalLog.details.endpointConfigured, false);
  });

  it("should wait for baseline host APIs before registering Zotero manager-backed surfaces", async () => {
    const { deps, calls } = createDeps();
    let managerReady = false;
    deps.preferencePanes.isAvailable = () => managerReady;
    deps.itemPane.isAvailable = () => managerReady;
    deps.itemTree.isAvailable = () => managerReady;
    const composer = createFeatureComposer(deps);
    const registration = composer.registerBaselineFeatures();

    setTimeout(() => {
      managerReady = true;
    }, 0);

    await registration;
    assert.equal(calls.panes, 1);
    assert.equal(calls.columns, 11);
    assert.equal(calls.sections, 1);
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

  it("should hand library item menus to the menu manager before the official API is ready", async () => {
    const { deps } = createDeps();
    const contextMenus = [];

    deps.menuManager = {
      MENU_TARGETS: {
        READER_MENU_VIEW: "reader-view",
      },
      isOfficialAPIAvailable() {
        return false;
      },
      registerItemMenuItem(menuItem) {
        contextMenus.push(menuItem);
        return menuItem.id;
      },
      registerReaderMenubarViewMenuItem() {},
      getMenuCount() {
        return contextMenus.length;
      },
    };

    const composer = createFeatureComposer(deps);
    await composer.registerBaselineFeatures();

    assert.equal(
      contextMenus.some((menuItem) => menuItem.id === "cleanroomtemplate-context-action"),
      true,
    );
    assert.equal(
      contextMenus.some((menuItem) => menuItem.id === "cleanroomtemplate-research-graph-context"),
      true,
    );
  });
});
