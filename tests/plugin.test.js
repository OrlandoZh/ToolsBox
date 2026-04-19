/**
 * Plugin 启动集成测试
 */
import { describe, it, beforeEach, afterEach, assert } from "./test-framework.js";
import { createPlugin } from "../src/app/plugin.js";

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createConfig() {
  return {
    addonName: "Cleanroom Template",
    addonId: "cleanroom-template@example.com",
    addonRef: "cleanroomtemplate",
    addonVersion: "0.1.0",
    description: "test",
    author: "test",
    homepage: "https://example.com",
    updateURL: "https://example.com/downloads/cleanroomtemplate/update.json",
    strictMinVersion: "6.999",
    strictMaxVersion: "8.*",
    prefsPrefix: "extensions.zotero.cleanroomtemplate",
    instanceKey: "CleanroomTemplate",
    icons: {
      "48": "content/icons/icon-48.png",
      "96": "content/icons/icon-96.png",
    },
    defaultPrefs: {
      enabled: true,
      menuLabel: "",
      logLevel: "info",
      themeMode: "follow-host",
    },
  };
}

function installServices() {
  const prefValues = new Map();
  const observers = new Map();
  const alerts = [];

  function notify(branch, key) {
    const branchObservers = observers.get(branch) || [];
    for (const observer of branchObservers) {
      observer.observe(null, "nsPref:changed", key);
    }
  }

  globalThis.Services = {
    locale: {
      appLocaleAsBCP47: "en-US",
    },
    appinfo: {
      OS: "Linux",
    },
    prompt: {
      alert(window, title, body) {
        alerts.push({ window, title, body });
      },
    },
    prefs: {
      prefHasUserValue(key) {
        return prefValues.has(key);
      },
      getBoolPref(key, fallback) {
        return prefValues.has(key) ? prefValues.get(key) : fallback;
      },
      getIntPref(key, fallback) {
        return prefValues.has(key) ? prefValues.get(key) : fallback;
      },
      getStringPref(key, fallback) {
        return prefValues.has(key) ? prefValues.get(key) : fallback;
      },
      setBoolPref(key, value) {
        prefValues.set(key, value);
        notify("extensions.zotero.cleanroomtemplate.", key);
      },
      setIntPref(key, value) {
        prefValues.set(key, value);
        notify("extensions.zotero.cleanroomtemplate.", key);
      },
      setStringPref(key, value) {
        prefValues.set(key, value);
        notify("extensions.zotero.cleanroomtemplate.", key);
      },
      clearUserPref(key) {
        prefValues.delete(key);
      },
      addObserver(branch, observer) {
        const items = observers.get(branch) || [];
        items.push(observer);
        observers.set(branch, items);
      },
      removeObserver(branch, observer) {
        const items = observers.get(branch) || [];
        observers.set(
          branch,
          items.filter((item) => item !== observer),
        );
      },
    },
  };

  return { prefValues, alerts };
}

describe("Plugin", () => {
  let promptRegistrations;
  let preferenceRegistrations;
  let preferenceUnregistrations;
  let menuRegistrations;
  let menuUnregistrations;
  let itemPaneSections;
  let itemPaneRows;
  let itemPaneSectionUnregistrations;
  let itemPaneRowUnregistrations;
  let itemTreeColumns;
  let itemTreeUnregistrations;
  let notifierRegistrations;
  let notifierUnregistrations;
  let activeReader;
  let readerEventRegistrations;
  let readerEventUnregistrations;
  let debugLogs;
  let startupReady;
  let serviceState;
  let mainWindow;
  let nonceTableCreated;
  let nonceTableRows;

  beforeEach(() => {
    promptRegistrations = [];
    preferenceRegistrations = [];
    preferenceUnregistrations = [];
    menuRegistrations = [];
    menuUnregistrations = [];
    itemPaneSections = [];
    itemPaneRows = [];
    itemPaneSectionUnregistrations = [];
    itemPaneRowUnregistrations = [];
    itemTreeColumns = [];
    itemTreeUnregistrations = [];
    notifierRegistrations = [];
    notifierUnregistrations = [];
    activeReader = null;
    readerEventRegistrations = [];
    readerEventUnregistrations = [];
    debugLogs = [];
    nonceTableCreated = false;
    nonceTableRows = new Map();
    startupReady = {
      initialization: createDeferred(),
      unlock: createDeferred(),
      uiReady: createDeferred(),
    };

    serviceState = installServices();
    globalThis.__CLEANROOM_TEMPLATE_RUNTIME__ = {
      rootURI: "chrome://cleanroomtemplate/",
      capabilityReport: {
        generatedAt: "2026-03-20T00:00:00.000Z",
        whitelistVersion: 1,
        status: "healthy",
        injected: [
          { key: "Zotero", required: true, source: "bootstrap-global" },
          { key: "Services", required: true, source: "bootstrap-global" },
          { key: "ChromeUtils", required: true, source: "bootstrap-global" },
          { key: "console", required: true, source: "console-bridge" },
        ],
        skipped: [],
        missingRequired: [],
      },
    };
    mainWindow = {
      closed: false,
      document: {
        documentElement: {
          getAttribute(name) {
            return name === "windowtype" ? "zotero:main" : "";
          },
        },
        getElementById(id) {
          if (id === "menu_ToolsPopup") {
            return {};
          }
          return null;
        },
      },
      Zotero_Tabs: {
        selectedID: activeReader ? activeReader.tabID : "library",
      },
    };

    globalThis.Zotero = {
      version: "9.0.0",
      initializationPromise: startupReady.initialization.promise,
      unlockPromise: startupReady.unlock.promise,
      uiReadyPromise: startupReady.uiReady.promise,
      debug(message) {
        debugLogs.push(message);
      },
      getMainWindows() {
        return [];
      },
      getMainWindow() {
        mainWindow.Zotero_Tabs.selectedID = activeReader ? activeReader.tabID : "library";
        return mainWindow;
      },
      Reader: {
        _readers: [],
        getByTabID(tabID) {
          return activeReader && activeReader.tabID === tabID ? activeReader : null;
        },
        registerEventListener(type, handler, pluginID) {
          readerEventRegistrations.push({
            type,
            handler,
            pluginID: pluginID || null,
          });
        },
        unregisterEventListener(type, handler) {
          readerEventUnregistrations.push({ type, handler });
        },
      },
      Profile: {
        dir: "/Users/test/Library/Application Support/Zotero/Profiles/abcd1234.default-release",
      },
      DataDirectory: {
        dir: "/Users/test/Zotero",
      },
      Schema: {
        async getDBVersion(schema) {
          return schema === "userdata" ? 126 : null;
        },
      },
      DB: {
        async tableExists() {
          return nonceTableCreated;
        },
        async executeTransaction(fn) {
          return fn();
        },
        async queryAsync(sql, params = []) {
          const normalizedSQL = String(sql || "").trim();
          if (normalizedSQL.startsWith("CREATE TABLE IF NOT EXISTS")) {
            nonceTableCreated = true;
            return [];
          }
          if (normalizedSQL.startsWith("INSERT INTO")) {
            nonceTableCreated = true;
            nonceTableRows.set(String(params[0]), {
              nonce: String(params[1]),
              createdAt: String(params[2]),
              updatedAt: String(params[3]),
            });
            return [];
          }
          if (normalizedSQL.startsWith("UPDATE")) {
            const current = nonceTableRows.get(String(params[2])) || {};
            nonceTableRows.set(String(params[2]), {
              ...current,
              nonce: String(params[0]),
              updatedAt: String(params[1]),
            });
            return [];
          }
          throw new Error(`Unexpected DB query: ${normalizedSQL}`);
        },
        async valueQueryAsync(sql, params = []) {
          const normalizedSQL = String(sql || "").trim();
          if (normalizedSQL.startsWith("SELECT nonce FROM")) {
            return nonceTableRows.get(String(params[0]))?.nonce || null;
          }
          return null;
        },
      },
      Items: {
        get(itemID) {
          if (!activeReader || activeReader.itemID !== itemID) {
            return null;
          }
          return {
            attachmentReaderType: "pdf",
          };
        },
      },
      ItemPaneManager: {
        registerSection(options) {
          itemPaneSections.push(options);
          return options.paneID;
        },
        unregisterSection(id) {
          itemPaneSectionUnregistrations.push(id);
        },
        registerInfoRow(options) {
          itemPaneRows.push(options);
          return options.rowID;
        },
        unregisterInfoRow(id) {
          itemPaneRowUnregistrations.push(id);
        },
        refreshInfoRow() {},
      },
      ItemTreeManager: {
        registerColumns(options) {
          itemTreeColumns.push(options);
          return [options.dataKey];
        },
        unregisterColumn(id) {
          itemTreeUnregistrations.push(id);
        },
      },
      Notifier: {
        registerObserver(observer, types, id) {
          notifierRegistrations.push({ observer, types, id });
          return id;
        },
        unregisterObserver(id) {
          notifierUnregistrations.push(id);
        },
      },
      PreferencePanes: {
        async register(options) {
          preferenceRegistrations.push(options);
          return options.id || `pane-${preferenceRegistrations.length}`;
        },
        unregister(id) {
          preferenceUnregistrations.push(id);
        },
      },
      Prompt: {
        register(items) {
          promptRegistrations.push(items);
        },
      },
      MenuManager: {
        registerMenu(options) {
          menuRegistrations.push(options);
          return true;
        },
        unregisterMenu(id) {
          menuUnregistrations.push(id);
        },
      },
    };
  });

  afterEach(() => {
    delete globalThis.Services;
    delete globalThis.Zotero;
    delete globalThis.__CLEANROOM_TEMPLATE_RUNTIME__;
  });

  it("should wait for host readiness before registering baseline features", async () => {
    const plugin = createPlugin({
      globalScope: globalThis,
      config: createConfig(),
    });

    const startPromise = plugin.start();
    await Promise.resolve();

    assert.equal(preferenceRegistrations.length, 0);
    assert.equal(promptRegistrations.length, 0);
    assert.equal(menuRegistrations.length, 0);

    startupReady.initialization.resolve();
    startupReady.unlock.resolve();
    startupReady.uiReady.resolve();

    await startPromise;

    assert.equal(preferenceRegistrations.length, 1);
    assert.equal(promptRegistrations.length, 3);
    assert.equal(menuRegistrations.length, 2);
    assert.equal(itemPaneSections.length, 1);
    assert.equal(itemPaneRows.length, 1);
    assert.equal(itemTreeColumns.length, 1);
    assert.equal(notifierRegistrations.length, 1);
  });

  it("should register baseline integrations and expose runtime api", async () => {
    startupReady.initialization.resolve();
    startupReady.unlock.resolve();
    startupReady.uiReady.resolve();

    const plugin = createPlugin({
      globalScope: globalThis,
      config: createConfig(),
    });

    await plugin.start();

    assert.equal(preferenceRegistrations[0].pluginID, "cleanroom-template@example.com");
    assert.equal(
      preferenceRegistrations[0].src,
      "chrome://cleanroomtemplate/content/preferences.xhtml",
    );
    assert.equal(
      preferenceRegistrations[0].image,
      "chrome://cleanroomtemplate/content/icons/icon-48.png",
    );
    assert.deepEqual(
      preferenceRegistrations[0].scripts,
      [
        "chrome://cleanroomtemplate/content/preference-pane-load-bridge.js",
      ],
    );
    assert.deepEqual(
      preferenceRegistrations[0].stylesheets,
      ["chrome://cleanroomtemplate/content/preferences.css"],
    );

    assert.equal(promptRegistrations[0][0].id, "cleanroomtemplate-primary-action");
    assert.equal(promptRegistrations[0][0].label, "Open Cleanroom Action");
    assert.typeOf(promptRegistrations[0][0].when, "function");
    assert.equal(promptRegistrations[0][0].when(), true);
    assert.equal(promptRegistrations[1][0].id, "cleanroomtemplate-reader-summary");
    assert.equal(promptRegistrations[1][0].when(), false);
    assert.equal(promptRegistrations[2][0].id, "cleanroomtemplate-reader-selection-snapshot");
    assert.equal(promptRegistrations[2][0].when(), false);

    assert.equal(menuRegistrations[0].pluginID, "cleanroom-template@example.com");
    assert.equal(menuRegistrations[0].target, "main/library/item");
    assert.equal(menuRegistrations[1].menuID, "cleanroomtemplate-reader-summary");
    assert.equal(menuRegistrations[1].target, "reader/menubar/view");
    assert.typeOf(menuRegistrations[1].menus[0].onShowing, "function");
    let readerMenuVisible = null;
    menuRegistrations[1].menus[0].onShowing(null, {
      setVisible(value) {
        readerMenuVisible = value;
      },
    });
    assert.equal(readerMenuVisible, false);
    assert.equal(itemPaneSections[0].paneID, "cleanroomtemplate-details");
    assert.equal(itemPaneSections[0].header.l10nID, "cleanroom-item-pane-section-header");
    assert.equal(itemPaneRows[0].rowID, "cleanroomtemplate-selection-summary");
    assert.equal(itemPaneRows[0].label.l10nID, "cleanroom-item-pane-info-row-label");
    assert.equal(itemTreeColumns[0].dataKey, "cleanroomtemplate-status");
    assert.equal(itemTreeColumns[0].label, "Cleanroom");
    assert.deepEqual(notifierRegistrations[0].types, ["item", "file", "tab"]);

    assert.ok(plugin.api);
    assert.ok(plugin.api.runtime);
    assert.ok(plugin.api.serviceRegistry);
    assert.equal(plugin.api.preferencePanes.getPaneCount(), 1);
    assert.equal(plugin.api.commandPalette.getCommandCount(), 3);
    assert.equal(plugin.api.menuManager.getMenuCount(), 2);
    assert.typeOf(plugin.api.menuManager.registerItemMenuItem, "function");
    assert.typeOf(plugin.api.menuManager.registerItemPaneInfoRowMenuItem, "function");
    assert.typeOf(plugin.api.menuManager.registerReaderMenubarViewMenuItem, "function");
    assert.equal(plugin.api.itemPane.getSectionCount(), 1);
    assert.equal(plugin.api.itemPane.getInfoRowCount(), 1);
    assert.equal(plugin.api.itemTree.getColumnCount(), 1);
    assert.equal(plugin.api.notifier.getActiveCount(), 1);
    assert.typeOf(plugin.api.agent, "object");
    assert.typeOf(plugin.api.agent.inspectItem, "function");
    assert.typeOf(plugin.api.agent.describeReader, "function");
    assert.typeOf(plugin.api.agent.inspectReader, "function");
    assert.typeOf(plugin.api.reader.getReaderUIStateSnapshot, "function");
    assert.typeOf(plugin.api.reader.registerViewContextMenuItem, "function");
    assert.typeOf(plugin.api.reader.registerAnnotationContextMenuItem, "function");
    assert.typeOf(plugin.api.reader.registerEventListener, "function");
    assert.typeOf(plugin.api.reader.unregisterAllEventListeners, "function");
    assert.typeOf(plugin.api.reader.getEventAPIReport, "function");
    assert.typeOf(plugin.api.agent.runScenario, "function");
    assert.typeOf(plugin.api.agent.listCapabilities, "function");
    assert.typeOf(plugin.api.agent.getCapability, "function");
    assert.typeOf(plugin.api.agent.listHostActions, "function");
    assert.typeOf(plugin.api.agent.runHostAction, "function");
    assert.typeOf(plugin.api.readerSelectionActions.getActionSnapshot, "function");
    assert.equal(plugin.api.readerSelectionActions.getActionCount(), 1);
    assert.deepEqual(plugin.api.agent.listScenarios(), [
      "baseline-registration",
      "capability-manifest",
      "sample-item-pane",
      "settings-snapshot",
      "notifier-preview",
      "reader-current",
      "window-snapshot",
      "command-no-ui",
      "host-actions",
    ]);
    assert.ok(plugin.api.agent.listCapabilities().length >= 12);
    assert.ok(plugin.api.agent.listHostActions().length >= 9);
    assert.equal(plugin.api.agent.getCapability("multi-window-mount").agentScenario, "window-snapshot");
    assert.equal(plugin.api.agent.getCapability("host-actions").agentScenario, "host-actions");
    assert.includes(
      plugin.api.agent.getCapability("reader-annotation-roundtrip").zoteroScenarios,
      "reader annotation roundtrip",
    );
    assert.includes(
      plugin.api.agent.getCapability("reader-ui-state").zoteroScenarios,
      "reader interaction diagnostics",
    );
    assert.includes(
      plugin.api.agent.getCapability("reader-event-hooks").zoteroScenarios,
      "reader event hook diagnostics",
    );
    assert.includes(
      plugin.api.agent.getCapability("reader-event-hooks").zoteroScenarios,
      "reader fine-grained hook diagnostics",
    );
    assert.includes(
      plugin.api.agent.getCapability("host-actions").zoteroScenarios,
      "live menu surface smoke",
    );

    const eventHandler = () => {};
    const unregisterToolbar = plugin.api.reader.registerEventListener(
      plugin.api.reader.READER_EVENT_TYPES.RENDER_TOOLBAR,
      eventHandler,
    );
    assert.equal(plugin.api.reader.isEventAPIAvailable(), true);
    assert.equal(readerEventRegistrations.length, 1);
    assert.equal(readerEventRegistrations[0].pluginID, "cleanroom-template@example.com");
    assert.equal(plugin.api.reader.getEventListenerCount(), 1);
    unregisterToolbar();
    assert.equal(readerEventUnregistrations.length, 1);
    assert.equal(plugin.api.reader.getEventListenerCount(), 0);

    assert.typeOf(plugin.api.runPrimaryAction, "function");
    assert.typeOf(plugin.api.runAgentAction, "function");
    assert.equal(plugin.api.runtime.rootURI, "chrome://cleanroomtemplate/");
    assert.equal(plugin.api.runtime.getCapabilitySummary().status, "healthy");
    assert.equal(plugin.api.runtime.getCapabilityReport().injected.length, 4);
    assert.equal(plugin.api.runAgentAction(), true);
    assert.equal(serviceState.alerts.length, 0);
    const sampleScenario = plugin.api.agent.runScenario("sample-item-pane", {
      item: {
        id: 77,
        itemType: "book",
        title: "Scenario Book",
      },
    });
    assert.includes(sampleScenario.summary, "#77");
    assert.includes(sampleScenario.summary, "Scenario Book");
    const inspectedItem = plugin.api.agent.inspectItem({
      id: 91,
      itemType: "report",
      title: "Inspect Item",
    });
    assert.equal(inspectedItem.isRealItem, false);
    assert.includes(inspectedItem.summary, "Inspect Item");
    const notifierScenario = plugin.api.agent.runScenario("notifier-preview", {
      event: "refresh",
      type: "item",
      ids: [88],
    });
    assert.includes(notifierScenario.lastNotifierEvent, "item:refresh #88");
    const diagnostics = plugin.api.agent.collectDiagnostics();
    assert.includes(diagnostics.lastNotifierEvent, "#88");
    assert.equal(diagnostics.serviceTotal, 5);
    assert.equal(diagnostics.serviceHealthyCount, 4);
    assert.equal(diagnostics.serviceUnhealthyCount, 0);
    assert.equal(diagnostics.serviceHealthOK, true);
    assert.equal(diagnostics.hostBindingAvailable, true);
    assert.equal(diagnostics.hostBindingProfileHashPresent, true);
    assert.equal(diagnostics.hostBindingSchemaBucket, "120-129");
    assert.equal(diagnostics.hostBindingZoteroVersionBucket, "9.x");
    assert.equal(diagnostics.hostBindingDataDirHashPresent, true);
    assert.equal(diagnostics.hostBindingDBAvailable, true);
    assert.equal(diagnostics.hostBindingNoncePresent, true);
    assert.equal(diagnostics.hostBindingNonceSource, "created");
    assert.equal(diagnostics.hostBindingNonceHashPresent, true);
    assert.equal(diagnostics.hostBindingStoreError, null);
    assert.equal(diagnostics.capabilityManifestVariant, "source");
    assert.equal(diagnostics.capabilityManifestProtectedView, false);
    assert.equal(diagnostics.capabilityManifestDetailLevel, "full");
    assert.equal(diagnostics.capabilityManifestLimitedMode, false);
    assert.equal(diagnostics.capabilityManifestOverlayAvailable, false);
    assert.equal(diagnostics.capabilityManifestOverlayApplied, false);
    assert.equal(diagnostics.capabilityManifestActivationSatisfied, true);
    assert.deepEqual(diagnostics.capabilityManifestActivationMissing, []);
    assert.ok(
      diagnostics.services.some((entry) => {
        return entry.id === "cleanroomtemplate.react-ui-demo"
          && entry.enabled === false
          && entry.status === "disabled"
          && entry.health?.status === "disabled";
      }),
    );
    assert.ok(
      diagnostics.services.some((entry) => {
        return entry.id === "cleanroomtemplate.host-signals"
          && entry.enabled === true
          && entry.health?.status === "ready";
      }),
    );
    assert.ok(
      diagnostics.services.some((entry) => {
        return entry.id === "cleanroomtemplate.host-nonce"
          && entry.enabled === true
          && entry.health?.status === "ready";
      }),
    );
    assert.equal(diagnostics.runtimeBridgeStatus, "healthy");
    assert.equal(diagnostics.runtimeInjectedCapabilityCount, 4);
    assert.ok(diagnostics.capabilityCount >= 11);
    assert.equal(diagnostics.readerEventAPIAvailable, true);
    assert.equal(diagnostics.readerEventListenerCount, 0);
    assert.ok(diagnostics.readerEventKnownTypeCount >= 8);
    assert.ok(diagnostics.readerEventProbeTypeCount >= 7);
    assert.equal(diagnostics.readerEventSyntheticFallbackAvailable, true);
    assert.equal(diagnostics.readerEventReport.syntheticFallbackAvailable, true);
    assert.ok(diagnostics.commandIDs.includes("cleanroomtemplate-reader-selection-snapshot"));
    assert.typeOf(plugin.api.getMainWindow, "function");

    const settingsSnapshot = plugin.api.agent.runScenario("settings-snapshot");
    assert.equal(settingsSnapshot.preferencePaneCount, 1);
    assert.ok(settingsSnapshot.definitionCount >= 3);

    const windowSnapshot = plugin.api.agent.runScenario("window-snapshot");
    assert.ok(windowSnapshot.mainWindowCount >= 1);

    const hostActionSnapshot = plugin.api.agent.runScenario("host-actions");
    assert.ok(hostActionSnapshot.total >= 9);
    assert.ok(hostActionSnapshot.actions.some((entry) => entry.id === "preferences.openPane"));
    const protectionSummary = plugin.api.runtime.getPackageProtectionSummary();
    assert.equal(protectionSummary.hostBinding.available, true);
    assert.equal(protectionSummary.hostBinding.schemaBucket, "120-129");
    assert.equal(protectionSummary.hostBinding.zoteroVersionBucket, "9.x");
    assert.typeOf(protectionSummary.hostBinding.profileHash, "string");
    assert.equal(protectionSummary.hostBinding.dbAvailable, true);
    assert.equal(protectionSummary.hostBinding.noncePresent, true);
    assert.equal(protectionSummary.hostBinding.nonceSource, "created");
    assert.typeOf(protectionSummary.hostBinding.nonceHash, "string");

    await plugin.shutdown();

    assert.equal(plugin.api.preferencePanes.getPaneCount(), 0);
    assert.equal(plugin.api.commandPalette.getCommandCount(), 0);
    assert.equal(plugin.api.menuManager.getMenuCount(), 0);
    assert.equal(plugin.api.itemPane.getSectionCount(), 0);
    assert.equal(plugin.api.itemPane.getInfoRowCount(), 0);
    assert.equal(plugin.api.itemTree.getColumnCount(), 0);
    assert.equal(plugin.api.notifier.getActiveCount(), 0);
    assert.equal(preferenceUnregistrations[0], "cleanroomtemplate-preferences");
    assert.equal(menuUnregistrations[0], "cleanroomtemplate-context-action");
    assert.equal(menuUnregistrations[1], "cleanroomtemplate-reader-summary");
    assert.equal(itemPaneSectionUnregistrations[0], "cleanroomtemplate-details");
    assert.equal(itemPaneRowUnregistrations[0], "cleanroomtemplate-selection-summary");
    assert.equal(itemTreeUnregistrations[0], "cleanroomtemplate-status");
    assert.equal(notifierUnregistrations[0], "cleanroomtemplate-activity");
  });

  it("should keep the wasm probe inert until the host action is invoked", async () => {
    startupReady.initialization.resolve();
    startupReady.unlock.resolve();
    startupReady.uiReady.resolve();

    let createWasmKernelProbeCalls = 0;
    let closeCalls = 0;
    const probePayloads = [];
    const plugin = createPlugin({
      globalScope: globalThis,
      config: createConfig(),
      createWasmKernelProbeImpl() {
        createWasmKernelProbeCalls += 1;
        return {
          async runProbe(payload = {}) {
            probePayloads.push(payload);
            return {
              ok: true,
              mode: "main-thread",
              mainThread: {
                ok: true,
                matchesExpected: true,
                sum: 42,
                expectedSum: 42,
              },
              worker: null,
              consistentAcrossTransports: null,
              errors: [],
            };
          },
          async close() {
            closeCalls += 1;
          },
        };
      },
    });

    await plugin.start();
    assert.equal(createWasmKernelProbeCalls, 0);

    const result = await plugin.api.agent.runHostAction("runtime.probeWasmKernel", {
      mode: "main-thread",
      left: 19,
      right: 23,
    });

    assert.equal(createWasmKernelProbeCalls, 1);
    assert.equal(result.ok, true);
    assert.deepEqual(probePayloads, [{
      mode: "main-thread",
      left: 19,
      right: 23,
    }]);

    await plugin.shutdown();
    assert.equal(closeCalls, 1);
  });

  it("should reuse the lazy wasm probe runtime for digest host actions", async () => {
    startupReady.initialization.resolve();
    startupReady.unlock.resolve();
    startupReady.uiReady.resolve();

    let createWasmKernelProbeCalls = 0;
    let closeCalls = 0;
    const digestPayloads = [];
    const plugin = createPlugin({
      globalScope: globalThis,
      config: createConfig(),
      createWasmKernelProbeImpl() {
        createWasmKernelProbeCalls += 1;
        return {
          async deriveDigest(payload = {}) {
            digestPayloads.push(payload);
            return {
              ok: true,
              mode: "main-thread",
              mainThread: {
                ok: true,
                digestUint32: 305419896,
                digestHex: "12345678",
              },
              worker: null,
              consistentAcrossTransports: null,
              errors: [],
            };
          },
          async close() {
            closeCalls += 1;
          },
        };
      },
    });

    await plugin.start();
    assert.equal(createWasmKernelProbeCalls, 0);

    const result = await plugin.api.agent.runHostAction("runtime.deriveWasmKernelDigest", {
      mode: "main-thread",
      text: "probe-to-digest",
    });

    assert.equal(createWasmKernelProbeCalls, 1);
    assert.equal(result.ok, true);
    assert.deepEqual(digestPayloads, [{
      mode: "main-thread",
      text: "probe-to-digest",
    }]);

    await plugin.shutdown();
    assert.equal(closeCalls, 1);
  });

  it("should reuse the lazy wasm probe runtime for unlock host actions", async () => {
    startupReady.initialization.resolve();
    startupReady.unlock.resolve();
    startupReady.uiReady.resolve();

    let createWasmKernelProbeCalls = 0;
    let closeCalls = 0;
    const unlockPayloads = [];
    const plugin = createPlugin({
      globalScope: globalThis,
      config: createConfig(),
      createWasmKernelProbeImpl() {
        createWasmKernelProbeCalls += 1;
        return {
          async deriveUnlockToken(payload = {}) {
            unlockPayloads.push(payload);
            return {
              ok: true,
              mode: "main-thread",
              activationRequirements: ["profileHash", "dbAvailable", "noncePresent"],
              activationMissing: [],
              activationSatisfied: true,
              shadowWouldApply: true,
              mainThread: {
                ok: true,
                stage2DigestUint32: 305419896,
                stage2DigestHex: "12345678",
                unlockTokenUint32: 2271560481,
                unlockTokenHex: "87654321",
              },
              worker: null,
              consistentAcrossTransports: null,
              errors: [],
            };
          },
          async close() {
            closeCalls += 1;
          },
        };
      },
    });

    await plugin.start();
    assert.equal(createWasmKernelProbeCalls, 0);

    const result = await plugin.api.agent.runHostAction("runtime.deriveWasmKernelUnlockToken", {
      mode: "main-thread",
      bundleSeed: "cleanroom-stage2-shadow-seed-v1",
    });

    assert.equal(createWasmKernelProbeCalls, 1);
    assert.equal(result.ok, true);
    assert.equal(unlockPayloads.length, 1);
    assert.equal(unlockPayloads[0].mode, "main-thread");
    assert.equal(unlockPayloads[0].bundleSeed, "cleanroom-stage2-shadow-seed-v1");
    assert.equal(typeof unlockPayloads[0].hostBinding?.profileHash, "string");
    assert.equal(unlockPayloads[0].hostBinding?.dbAvailable, true);
    assert.equal(unlockPayloads[0].hostBinding?.noncePresent, true);

    await plugin.shutdown();
    assert.equal(closeCalls, 1);
  });

  it("should enable the reader demo command when a reader tab is active", async () => {
    startupReady.initialization.resolve();
    startupReady.unlock.resolve();
    startupReady.uiReady.resolve();

    activeReader = {
      itemID: 42,
      tabID: "reader-tab-42",
      annotationItemIDs: [1, 2, 3],
      _iframeWindow: {
        getSelection() {
          return {
            toString() {
              return "Selected plugin reader text";
            },
          };
        },
        document: {
          defaultView: null,
        },
      },
    };
    globalThis.Zotero.Reader._readers = [activeReader];

    const plugin = createPlugin({
      globalScope: globalThis,
      config: createConfig(),
    });

    await plugin.start();

    assert.equal(promptRegistrations[1][0].when(), true);
    assert.equal(promptRegistrations[2][0].when(), true);
    assert.deepEqual(plugin.api.reader.getActiveSummary(), {
      tabID: "reader-tab-42",
      itemID: 42,
      type: "pdf",
      annotationIDs: [1, 2, 3],
      annotationCount: 3,
    });
    assert.deepEqual(plugin.api.reader.getSelectionSnapshot(), {
      hasSelection: true,
      sourceKind: "iframe-selection",
      text: "Selected plugin reader text",
      textLength: 27,
      tabID: "reader-tab-42",
      itemID: 42,
      readerType: "pdf",
      selectedAnnotationIDs: [],
      annotationCount: 3,
    });
    const selectionActionExecution = await plugin.api.readerSelectionActions.executeAction(
      "cleanroomtemplate-reader-selection-snapshot",
    );
    assert.equal(selectionActionExecution.ok, true);
    assert.equal(selectionActionExecution.result.textLength, 27);

    let visible = null;
    menuRegistrations[1].menus[0].onShowing(null, {
      setVisible(value) {
        visible = value;
      },
    });
    assert.equal(visible, true);

    await plugin.shutdown();
  });
});
