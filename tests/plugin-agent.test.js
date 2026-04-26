import { describe, it, assert } from "./test-framework.js";
import { createPluginAgent } from "../dev/agent-runtime/plugin-agent.js";
import {
  createCapabilityManifest as createProtectedCapabilityManifest,
  findCapabilityById as findProtectedCapabilityById,
  getCapabilityManifestView as getProtectedCapabilityManifestView,
} from "../dev/agent-runtime/capability-manifest-protected.js";

function createMinimalPluginAgent(overrides = {}) {
  return createPluginAgent({
    host: {
      getMainWindow() {
        return null;
      },
      listMainWindows() {
        return [];
      },
      ...(overrides.host || {}),
    },
    config: {
      addonRef: "cleanroomtemplate",
      ...(overrides.config || {}),
    },
    settings: {
      listDefinitions() {
        return [];
      },
      getMigrationSummary() {
        return null;
      },
      ...(overrides.settings || {}),
    },
    prefs: {
      get() {
        return true;
      },
      ...(overrides.prefs || {}),
    },
    itemPane: {
      getSectionCount() {
        return 0;
      },
      getInfoRowCount() {
        return 0;
      },
      getRegistrationSnapshot() {
        return {
          sections: [],
          infoRows: [],
        };
      },
      ...(overrides.itemPane || {}),
    },
    itemTree: {
      getColumnCount() {
        return 0;
      },
      ...(overrides.itemTree || {}),
    },
    notifier: {
      getActiveCount() {
        return 0;
      },
      ...(overrides.notifier || {}),
    },
    reader: {
      getActiveReader() {
        return null;
      },
      getReaderSummary() {
        return null;
      },
      getReaderInteractionSnapshot() {
        return null;
      },
      getWindowStates() {
        return [];
      },
      ...(overrides.reader || {}),
    },
    commandPalette: {
      getCommandCount() {
        return 0;
      },
      getAllCommands() {
        return [];
      },
      ...(overrides.commandPalette || {}),
    },
    menuManager: {
      getMenuCount() {
        return 0;
      },
      getRegisteredMenuIds() {
        return [];
      },
      ...(overrides.menuManager || {}),
    },
    preferencePanes: {
      getPaneCount() {
        return 0;
      },
      getAllPanes() {
        return [];
      },
      ...(overrides.preferencePanes || {}),
    },
    demoState: {
      lastNotifierEvent: "idle",
      ...(overrides.demoState || {}),
    },
    demoInfoRowID: "cleanroomtemplate-selection-summary",
    demoSectionID: "cleanroomtemplate-details",
    getItemTypeLabel(item) {
      return item?.itemType || "journalArticle";
    },
    getItemSummary(item) {
      return item?.title || item?.getField?.("title") || "Unknown";
    },
    getColumnValue(item) {
      return item?.id || 0;
    },
    getItemTitle(item) {
      return item?.title || item?.getField?.("title") || "Untitled";
    },
    listHostActions() {
      return [];
    },
    async runHostAction(actionId) {
      return { ok: true, actionId };
    },
    executeAgentAction() {
      return true;
    },
    updateDemoNotifierState() {},
    zotero: {
      Items: {
        get() {
          return null;
        },
      },
      ...(overrides.zotero || {}),
    },
    servicesHub: {
      getSummary() {
        return {
          total: 0,
          healthy: 0,
          unhealthy: 0,
          healthOK: true,
          status: "idle",
          services: [],
        };
      },
      ...(overrides.servicesHub || {}),
    },
    runtimeInfo: {
      capabilitySummary: {
        ok: true,
        status: "healthy",
        injectedCount: 0,
        skippedCount: 0,
        missingRequired: [],
      },
      ...(overrides.runtimeInfo || {}),
    },
    getLifecycleSummary() {
      return {
        hostReadyDurationMs: 0,
        startupDurationMs: 0,
        shutdownDurationMs: 0,
        lifecycleSlowOperationCount: 0,
        lifecycleSlowThresholdMs: 2000,
        lifecycleLastSlowStage: null,
        lifecycleBoundaryEvents: [],
      };
    },
    getProtectionSummary() {
      return {
        active: false,
        variant: null,
        hostBinding: {
          available: false,
          profileHash: null,
          dbAvailable: false,
          noncePresent: false,
        },
      };
    },
    ...(overrides || {}),
  });
}

describe("Plugin Agent", () => {
  it("should inspect sample item and expose diagnostics", () => {
    const demoState = {
      lastNotifierEvent: "idle",
    };

    const agent = createPluginAgent({
      host: {
        getMainWindow() {
          return { id: "main" };
        },
        listMainWindows() {
          return [
            {
              location: { href: "chrome://zotero/content/zotero.xhtml" },
              document: {
                getElementById(id) {
                  return id === "cleanroom-template-menuitem" || id === "cleanroom-template-style"
                    ? { id }
                    : null;
                },
              },
            },
          ];
        },
      },
      config: {
        addonRef: "cleanroomtemplate",
      },
      demoInfoRowID: "cleanroomtemplate-selection-summary",
      demoSectionID: "cleanroomtemplate-details",
      settings: {
        listDefinitions() {
          return [
            { key: "enabled", group: "core" },
            { key: "menuLabel", group: "ui" },
            { key: "logLevel", group: "core" },
            { key: "themeMode", group: "ui" },
          ];
        },
        getMigrationSummary() {
          return {
            currentVersion: 1,
            appliedMigrations: [],
            notes: [],
          };
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
      itemPane: {
        getSectionCount() {
          return 1;
        },
        getInfoRowCount() {
          return 1;
        },
        getRegistrationSnapshot() {
          return {
            sections: [{
              paneID: "cleanroomtemplate-details",
              headerL10nID: "cleanroom-item-pane-section-header",
              sidenavL10nID: "cleanroom-item-pane-section-sidenav",
            }],
            infoRows: [{
              rowID: "cleanroomtemplate-selection-summary",
              labelL10nID: "cleanroom-item-pane-info-row-label",
            }],
          };
        },
      },
      itemTree: {
        getColumnCount() {
          return 1;
        },
      },
      notifier: {
        getActiveCount() {
          return 1;
        },
      },
      reader: {
        getActiveReader() {
          return null;
        },
        isEventAPIAvailable() {
          return true;
        },
        getEventAPIReport() {
          return {
            available: true,
            registeredCount: 1,
            registeredTypes: ["renderToolbar"],
            registeredListeners: [{
              type: "renderToolbar",
              pluginID: "cleanroom-template@example.com",
            }],
            knownTypes: ["renderToolbar", "renderTextSelectionPopup", "renderSidebarAnnotationHeader"],
            probeCompatibleTypes: ["renderTextSelectionPopup", "renderSidebarAnnotationHeader"],
            probeDispatchModes: ["customEvent", "synthetic-fallback"],
            syntheticFallbackAvailable: true,
          };
        },
        getEventListenerCount() {
          return 1;
        },
        getRegisteredEventListeners() {
          return [{
            type: "renderToolbar",
            pluginID: "cleanroom-template@example.com",
          }];
        },
        getReaderSummary() {
          return { itemID: 1 };
        },
        getReaderInteractionSnapshot() {
          return {
            itemID: 1,
            tabID: "reader-tab-1",
            annotationCount: 1,
            annotationDetailCount: 1,
            matchingWindowStateCount: 1,
            hasMatchingWindowState: true,
            annotationDetails: [{ id: 5001, editable: true }],
            windowStates: [{ tabID: "reader-tab-1", itemID: 1 }],
          };
        },
        getWindowStates() {
          return [{ tabID: "reader-tab-1", itemID: 1 }];
        },
      },
      commandPalette: {
        getCommandCount() {
          return 3;
        },
        getAllCommands() {
          return [
            { id: "cleanroomtemplate-primary-action" },
            { id: "cleanroomtemplate-reader-summary" },
            { id: "cleanroomtemplate-reader-selection-snapshot" },
          ];
        },
      },
      menuManager: {
        isOfficialAPIAvailable() {
          return true;
        },
        getMenuCount() {
          return 2;
        },
        getRegisteredMenuIds() {
          return [
            "cleanroomtemplate-context-action",
            "cleanroomtemplate-reader-summary",
          ];
        },
      },
      preferencePanes: {
        getPaneCount() {
          return 1;
        },
        getAllPanes() {
          return ["cleanroomtemplate-preferences"];
        },
      },
      demoState,
      getItemTypeLabel(item) {
        return item?.itemType || "item";
      },
      getItemSummary(item) {
        return item?.getField?.("title") || "Unknown";
      },
      getColumnValue(item) {
        return item?.id || 0;
      },
      getItemTitle(item) {
        return item?.getField?.("title") || "Untitled";
      },
      listHostActions() {
        return [
          { id: "preferences.openPane", executable: true },
          { id: "menu.show", executable: true },
        ];
      },
      async runHostAction(actionId) {
        return {
          actionId,
          ok: true,
          preconditions: [],
          observedState: {},
          readiness: {
            ok: true,
            total: 0,
            passed: 0,
            failed: 0,
            checks: [],
          },
          surfaceTarget: null,
          failureKind: null,
        };
      },
      executeAgentAction() {
        return true;
      },
      updateDemoNotifierState() {
        demoState.lastNotifierEvent = "item:modify #42 @ 00:00:00";
      },
      zotero: {
        Items: {
          get() {
            return null;
          },
        },
      },
      runtimeInfo: {
        capabilitySummary: {
          ok: true,
          status: "healthy",
          injectedCount: 4,
          skippedCount: 1,
          missingRequired: [],
        },
      },
      getLifecycleSummary() {
        return {
          hostReadyDurationMs: 2150,
          startupDurationMs: 3180,
          shutdownDurationMs: 920,
          lifecycleSlowOperationCount: 2,
          lifecycleSlowThresholdMs: 2000,
          lifecycleLastSlowStage: "startup",
          lifecycleBoundaryEvents: [
            { event: "plugin.start.failed", count: 1 },
            { event: "plugin.start.cleanup.failed", count: 1 },
          ],
        };
      },
      getProtectionSummary() {
        return {
          active: true,
          variant: "shielded",
          decodeMethod: "fromBase64",
          loadSubScriptDurationMs: 420,
          decodeDurationMs: 85,
          decryptDurationMs: 17,
          evalDurationMs: 193,
          prepareDurationMs: 302,
          bootstrapResolveDurationMs: 305,
          bootstrapCallCount: 1,
          hostBinding: {
            signalVersion: 1,
            available: true,
            profileHash: "sha256:profilehash012345678901",
            schemaBucket: "120-129",
            zoteroVersionBucket: "9.x",
            profileBasenameBucket: "sha256:basename012345678901",
            dataDirHash: "sha256:datadir0123456789012",
            collectionError: null,
            dbAvailable: true,
            noncePresent: true,
            nonceSource: "existing",
            nonceHash: "sha256:noncehash01234567890",
            storeError: null,
          },
        };
      },
    });

    const inspected = agent.inspectItemPresentation({
      id: 9,
      title: "Sample Item",
    });
    assert.equal(inspected.isRealItem, false);
    assert.equal(inspected.itemType, "journalArticle");
    assert.equal(inspected.title, "Sample Item");

    const diagnostics = agent.collectAgentDiagnostics();
    assert.equal(diagnostics.enabled, true);
    assert.equal(diagnostics.commandCount, 3);
    assert.equal(diagnostics.menuCount, 2);
    assert.equal(diagnostics.officialMenuAPIAvailable, true);
    assert.equal(diagnostics.primaryActionCommandRegistered, true);
    assert.equal(diagnostics.readerSummaryCommandRegistered, true);
    assert.equal(diagnostics.contextActionMenuRegistered, true);
    assert.equal(diagnostics.readerSummaryMenuRegistered, true);
    assert.equal(diagnostics.preferencePaneRegistered, true);
    assert.equal(diagnostics.runtimeBridgeStatus, "healthy");
    assert.equal(diagnostics.runtimeInjectedCapabilityCount, 4);
    assert.equal(diagnostics.itemPaneL10nDriftCount, 0);
    assert.equal(diagnostics.itemPaneL10n.ok, true);
    assert.equal(diagnostics.readerEventAPIAvailable, true);
    assert.equal(diagnostics.readerEventListenerCount, 1);
    assert.equal(diagnostics.readerEventKnownTypeCount, 3);
    assert.equal(diagnostics.readerEventProbeTypeCount, 2);
    assert.equal(diagnostics.readerEventSyntheticFallbackAvailable, true);
    assert.equal(diagnostics.hostActionCount, 2);
    assert.deepEqual(diagnostics.readerEventListeners, [{
      type: "renderToolbar",
      pluginID: "cleanroom-template@example.com",
    }]);
    assert.equal(diagnostics.readerEventReport.syntheticFallbackAvailable, true);
    assert.ok(diagnostics.capabilityCount >= 11);
    assert.deepEqual(diagnostics.commandIDs, [
      "cleanroomtemplate-primary-action",
      "cleanroomtemplate-reader-summary",
      "cleanroomtemplate-reader-selection-snapshot",
    ]);
    assert.equal(diagnostics.hostReadyDurationMs, 2150);
    assert.equal(diagnostics.startupDurationMs, 3180);
    assert.equal(diagnostics.shutdownDurationMs, 920);
    assert.equal(diagnostics.lifecycleSlowOperationCount, 2);
    assert.equal(diagnostics.lifecycleSlowThresholdMs, 2000);
    assert.equal(diagnostics.lifecycleLastSlowStage, "startup");
    assert.equal(diagnostics.lifecycleBoundaryEvents[0]?.event, "plugin.start.failed");
    assert.equal(diagnostics.packageProtectionActive, true);
    assert.equal(diagnostics.packageProtectionVariant, "shielded");
    assert.equal(diagnostics.packageProtectionDecodeMethod, "fromBase64");
    assert.equal(diagnostics.packageProtectionLoadSubScriptDurationMs, 420);
    assert.equal(diagnostics.packageProtectionDecodeDurationMs, 85);
    assert.equal(diagnostics.packageProtectionDecryptDurationMs, 17);
    assert.equal(diagnostics.packageProtectionEvalDurationMs, 193);
    assert.equal(diagnostics.packageProtectionPrepareDurationMs, 302);
    assert.equal(diagnostics.packageProtectionBootstrapResolveDurationMs, 305);
    assert.equal(diagnostics.packageProtectionBootstrapCallCount, 1);
    assert.equal(diagnostics.hostBindingAvailable, true);
    assert.equal(diagnostics.hostBindingProfileHashPresent, true);
    assert.equal(diagnostics.hostBindingSchemaBucket, "120-129");
    assert.equal(diagnostics.hostBindingZoteroVersionBucket, "9.x");
    assert.equal(
      diagnostics.hostBindingProfileBasenameBucket,
      "sha256:basename012345678901",
    );
    assert.equal(diagnostics.hostBindingDataDirHashPresent, true);
    assert.equal(diagnostics.hostBindingDBAvailable, true);
    assert.equal(diagnostics.hostBindingNoncePresent, true);
    assert.equal(diagnostics.hostBindingNonceSource, "existing");
    assert.equal(diagnostics.hostBindingNonceHashPresent, true);
    assert.equal(diagnostics.hostBindingCollectionError, null);
    assert.equal(diagnostics.hostBindingStoreError, null);
    assert.equal(diagnostics.capabilityManifestVariant, "source");
    assert.equal(diagnostics.capabilityManifestProtectedView, false);
    assert.equal(diagnostics.capabilityManifestDetailLevel, "full");
    assert.equal(diagnostics.capabilityManifestLimitedMode, false);
    assert.equal(diagnostics.capabilityManifestOverlayAvailable, false);
    assert.equal(diagnostics.capabilityManifestOverlayApplied, false);
    assert.equal(diagnostics.capabilityManifestActivationSatisfied, true);
    assert.deepEqual(diagnostics.capabilityManifestActivationMissing, []);
    assert.equal(diagnostics.packageProtection.variant, "shielded");
    assert.equal(diagnostics.packageProtection.decodeMethod, "fromBase64");
    assert.equal(diagnostics.packageProtection.hostBinding.available, true);
    assert.equal(diagnostics.packageProtection.hostBinding.schemaBucket, "120-129");
    assert.equal(diagnostics.packageProtection.hostBinding.noncePresent, true);
    assert.equal(diagnostics.packageProtection.hostBinding.nonceSource, "existing");

    const capabilities = agent.listCapabilities();
    assert.ok(capabilities.length >= 12);
    assert.equal(agent.getCapability("settings-governance").agentScenario, "settings-snapshot");
    assert.equal(agent.getCapability("host-actions").agentScenario, "host-actions");
    assert.includes(
      agent.getCapability("reader-annotation-roundtrip").zoteroScenarios,
      "reader annotation roundtrip",
    );
    assert.includes(
      agent.getCapability("reader-ui-state").zoteroScenarios,
      "reader interaction diagnostics",
    );
    assert.includes(
      agent.getCapability("reader-event-hooks").zoteroScenarios,
      "reader event hook diagnostics",
    );
    assert.includes(
      agent.getCapability("reader-event-hooks").zoteroScenarios,
      "reader fine-grained hook diagnostics",
    );

    const settingsSnapshot = agent.runAgentScenario("settings-snapshot");
    assert.equal(settingsSnapshot.definitionCount, 4);
    assert.equal(settingsSnapshot.preferencePaneCount, 1);

    const readerSnapshot = agent.runAgentScenario("reader-current", { itemID: 1 });
    assert.equal(readerSnapshot.summary.itemID, 1);
    assert.equal(readerSnapshot.interaction.annotationDetailCount, 1);
    assert.equal(readerSnapshot.interaction.hasMatchingWindowState, true);
    assert.equal(readerSnapshot.eventListenerCount, 1);
    assert.deepEqual(readerSnapshot.eventListeners, [{
      type: "renderToolbar",
      pluginID: "cleanroom-template@example.com",
    }]);
    assert.equal(readerSnapshot.eventAPIReport.syntheticFallbackAvailable, true);
    assert.equal(readerSnapshot.windowStates[0].tabID, "reader-tab-1");

    const windowSnapshot = agent.runAgentScenario("window-snapshot");
    assert.equal(windowSnapshot.mainWindowCount, 1);
    assert.equal(windowSnapshot.windows[0].hasMenuItem, true);

    const hostActions = agent.listHostActions();
    assert.equal(hostActions.length, 2);
    assert.equal(hostActions[0].id, "preferences.openPane");

    const hostActionScenario = agent.runAgentScenario("host-actions");
    assert.equal(hostActionScenario.total, 2);
  });

  it("should resolve capability manifest dynamically from current overlay context", () => {
    let overlayEnabled = false;
    const descriptorOverlay = [{
      id: "host-actions",
      label: "宿主动作编排",
      category: "feature",
      description: "验证 host action overlay 已按宿主弱绑定解锁。",
      entrypoints: ["plugin.api.agent.runHostAction(actionId, payload)"],
      ownedBy: ["dev/agent-runtime/host-actions.js"],
      successSignals: ["Host actions return readiness details"],
    }];

    const agent = createMinimalPluginAgent({
      createCapabilityManifest: createProtectedCapabilityManifest,
      findCapabilityById: findProtectedCapabilityById,
      getCapabilityManifestView: getProtectedCapabilityManifestView,
      getProtectionSummary() {
        return {
          active: true,
          variant: "shielded",
          hostBinding: {
            available: overlayEnabled,
            profileHash: overlayEnabled ? "sha256:profile" : null,
            dbAvailable: overlayEnabled,
            noncePresent: overlayEnabled,
          },
        };
      },
      getCapabilityManifestOverlay() {
        return overlayEnabled ? descriptorOverlay : null;
      },
    });

    const limitedDiagnostics = agent.collectAgentDiagnostics();
    const limitedCapability = agent.getCapability("host-actions");
    assert.equal(limitedDiagnostics.capabilityManifestVariant, "protected");
    assert.equal(limitedDiagnostics.capabilityManifestProtectedView, true);
    assert.equal(limitedDiagnostics.capabilityManifestDetailLevel, "limited");
    assert.equal(limitedDiagnostics.capabilityManifestOverlayAvailable, false);
    assert.equal(limitedDiagnostics.capabilityManifestOverlayApplied, false);
    assert.equal(limitedDiagnostics.capabilityManifestActivationSatisfied, false);
    assert.includes(limitedDiagnostics.capabilityManifestActivationMissing, "profileHash");
    assert.equal(
      limitedCapability.description,
      "受保护导出不附带该能力的详细说明。",
    );
    assert.equal(limitedCapability.label, "C-09");
    assert.equal(limitedCapability.category, "protected");
    assert.equal(Object.prototype.hasOwnProperty.call(limitedCapability, "entrypoints"), false);

    overlayEnabled = true;

    const fullDiagnostics = agent.collectAgentDiagnostics();
    const fullCapability = agent.getCapability("host-actions");
    const manifestScenario = agent.runAgentScenario("capability-manifest");

    assert.equal(fullDiagnostics.capabilityManifestVariant, "protected");
    assert.equal(fullDiagnostics.capabilityManifestDetailLevel, "full");
    assert.equal(fullDiagnostics.capabilityManifestLimitedMode, false);
    assert.equal(fullDiagnostics.capabilityManifestOverlayAvailable, true);
    assert.equal(fullDiagnostics.capabilityManifestOverlayApplied, true);
    assert.equal(fullDiagnostics.capabilityManifestActivationSatisfied, true);
    assert.deepEqual(fullDiagnostics.capabilityManifestActivationMissing, []);
    assert.equal(
      fullCapability.description,
      "验证 host action overlay 已按宿主弱绑定解锁。",
    );
    assert.equal(fullCapability.label, "宿主动作编排");
    assert.equal(fullCapability.category, "feature");
    assert.deepEqual(
      fullCapability.entrypoints,
      ["plugin.api.agent.runHostAction(actionId, payload)"],
    );
    assert.equal(manifestScenario.view.detailLevel, "full");
    assert.equal(manifestScenario.total >= 1, true);
  });

  it("should execute built-in notifier scenario", () => {
    const demoState = {
      lastNotifierEvent: "idle",
    };

    const agent = createPluginAgent({
      host: {
        getMainWindow() {
          return null;
        },
        listMainWindows() {
          return [];
        },
      },
      config: {
        addonRef: "cleanroomtemplate",
      },
      demoInfoRowID: "cleanroomtemplate-selection-summary",
      demoSectionID: "cleanroomtemplate-details",
      settings: {
        listDefinitions() {
          return [];
        },
        getMigrationSummary() {
          return null;
        },
      },
      prefs: {
        get() {
          return false;
        },
      },
      itemPane: {
        getSectionCount() {
          return 0;
        },
        getInfoRowCount() {
          return 0;
        },
        getRegistrationSnapshot() {
          return {
            sections: [],
            infoRows: [],
          };
        },
      },
      itemTree: {
        getColumnCount() {
          return 0;
        },
      },
      notifier: {
        getActiveCount() {
          return 0;
        },
      },
      reader: {
        getActiveReader() {
          return null;
        },
        isEventAPIAvailable() {
          return false;
        },
        getEventListenerCount() {
          return 0;
        },
        getRegisteredEventListeners() {
          return [];
        },
        getReaderSummary() {
          return null;
        },
        getReaderInteractionSnapshot() {
          return null;
        },
        getWindowStates() {
          return [];
        },
      },
      commandPalette: {
        getCommandCount() {
          return 0;
        },
        getAllCommands() {
          return [];
        },
      },
      menuManager: {
        getMenuCount() {
          return 0;
        },
        getRegisteredMenuIds() {
          return [];
        },
      },
      preferencePanes: {
        getPaneCount() {
          return 0;
        },
        getAllPanes() {
          return [];
        },
      },
      demoState,
      getItemTypeLabel() {
        return "item";
      },
      getItemSummary() {
        return "summary";
      },
      getColumnValue() {
        return "0";
      },
      getItemTitle() {
        return "title";
      },
      executeAgentAction() {
        return false;
      },
      updateDemoNotifierState(event, type, ids) {
        demoState.lastNotifierEvent = `${type}:${event} #${ids[0]} @ 00:00:00`;
      },
      zotero: null,
    });

    const result = agent.runAgentScenario("notifier-preview", {
      event: "modify",
      type: "item",
      ids: [55],
    });
    assert.equal(result.lastNotifierEvent, "item:modify #55 @ 00:00:00");
  });

  it("should report item pane l10n drift from registration snapshot", () => {
    const agent = createPluginAgent({
      host: {
        getMainWindow() {
          return null;
        },
      },
      config: {
        addonRef: "cleanroomtemplate",
      },
      demoInfoRowID: "cleanroomtemplate-selection-summary",
      demoSectionID: "cleanroomtemplate-details",
      settings: {
        listDefinitions() {
          return [];
        },
        getMigrationSummary() {
          return null;
        },
      },
      prefs: {
        get() {
          return true;
        },
      },
      itemPane: {
        getSectionCount() {
          return 1;
        },
        getInfoRowCount() {
          return 1;
        },
        getRegistrationSnapshot() {
          return {
            sections: [{
              paneID: "cleanroomtemplate-details",
              headerL10nID: "cleanroom-item-pane-section-header-typo",
              sidenavL10nID: "cleanroom-item-pane-section-sidenav",
            }],
            infoRows: [{
              rowID: "cleanroomtemplate-selection-summary",
              labelL10nID: "cleanroom-item-pane-info-row-label-typo",
            }],
          };
        },
      },
      itemTree: {
        getColumnCount() {
          return 1;
        },
      },
      notifier: {
        getActiveCount() {
          return 1;
        },
      },
      reader: {
        getActiveReader() {
          return null;
        },
        isEventAPIAvailable() {
          return false;
        },
        getEventListenerCount() {
          return 0;
        },
        getRegisteredEventListeners() {
          return [];
        },
        getReaderSummary() {
          return null;
        },
        getReaderInteractionSnapshot() {
          return null;
        },
        getWindowStates() {
          return [];
        },
      },
      commandPalette: {
        getCommandCount() {
          return 0;
        },
        getAllCommands() {
          return [];
        },
      },
      menuManager: {
        getMenuCount() {
          return 0;
        },
        getRegisteredMenuIds() {
          return [];
        },
      },
      preferencePanes: {
        getPaneCount() {
          return 0;
        },
        getAllPanes() {
          return [];
        },
      },
      demoState: {
        lastNotifierEvent: "idle",
      },
      getItemTypeLabel() {
        return "item";
      },
      getItemSummary() {
        return "summary";
      },
      getColumnValue() {
        return "0";
      },
      getItemTitle() {
        return "title";
      },
      executeAgentAction() {
        return true;
      },
      updateDemoNotifierState() {},
      zotero: null,
      runtimeInfo: {
        capabilitySummary: {
          ok: true,
          status: "healthy",
          injectedCount: 0,
          skippedCount: 0,
          missingRequired: [],
        },
      },
    });

    const diagnostics = agent.collectAgentDiagnostics();
    assert.equal(diagnostics.itemPaneL10nDriftCount, 2);
    assert.equal(diagnostics.itemPaneL10n.ok, false);
    assert.equal(diagnostics.itemPaneL10n.drifts[0].kind, "info-row-label");
    assert.equal(diagnostics.itemPaneL10n.drifts[1].kind, "section-header");
  });

  it("should expose reader event report with deeper event probe details", () => {
    const demoState = {
      lastNotifierEvent: "idle",
    };

    const agent = createPluginAgent({
      host: {
        getMainWindow() {
          return null;
        },
      },
      config: {
        addonRef: "cleanroomtemplate",
      },
      demoInfoRowID: "cleanroomtemplate-selection-summary",
      demoSectionID: "cleanroomtemplate-details",
      settings: {
        listDefinitions() {
          return [];
        },
        getMigrationSummary() {
          return null;
        },
      },
      prefs: {
        get() {
          return true;
        },
      },
      itemPane: {
        getSectionCount() {
          return 1;
        },
        getInfoRowCount() {
          return 1;
        },
        getRegistrationSnapshot() {
          return {
            sections: [{
              paneID: "cleanroomtemplate-details",
              headerL10nID: "cleanroom-item-pane-section-header",
              sidenavL10nID: "cleanroom-item-pane-section-sidenav",
            }],
            infoRows: [{
              rowID: "cleanroomtemplate-selection-summary",
              labelL10nID: "cleanroom-item-pane-info-row-label",
            }],
          };
        },
      },
      itemTree: {
        getColumnCount() {
          return 1;
        },
      },
      notifier: {
        getActiveCount() {
          return 1;
        },
      },
      reader: {
        getActiveReader() {
          return null;
        },
        isEventAPIAvailable() {
          return true;
        },
        getEventAPIReport() {
          return {
            available: true,
            registeredCount: 3,
            registeredTypes: ["renderToolbar", "renderTextSelectionPopup", "renderSidebarAnnotationHeader"],
            registeredListeners: [
              { type: "renderToolbar", pluginID: "cleanroom-template@example.com" },
              { type: "renderTextSelectionPopup", pluginID: "cleanroom-template@example.com" },
              { type: "renderSidebarAnnotationHeader", pluginID: "cleanroom-template@example.com" },
            ],
            knownTypes: [
              "renderToolbar",
              "renderTextSelectionPopup",
              "renderSidebarAnnotationHeader",
              "createViewContextMenu",
              "createAnnotationContextMenu",
            ],
            probeCompatibleTypes: [
              "renderTextSelectionPopup",
              "renderSidebarAnnotationHeader",
            ],
            probeDispatchModes: ["customEvent", "synthetic-fallback"],
            syntheticFallbackAvailable: true,
          };
        },
        getEventListenerCount() {
          return 3;
        },
        getRegisteredEventListeners() {
          return [
            { type: "renderToolbar", pluginID: "cleanroom-template@example.com" },
            { type: "renderTextSelectionPopup", pluginID: "cleanroom-template@example.com" },
            { type: "renderSidebarAnnotationHeader", pluginID: "cleanroom-template@example.com" },
          ];
        },
        getReaderSummary() {
          return null;
        },
        getReaderInteractionSnapshot() {
          return null;
        },
        getWindowStates() {
          return [];
        },
      },
      commandPalette: {
        getCommandCount() {
          return 0;
        },
        getAllCommands() {
          return [];
        },
      },
      menuManager: {
        getMenuCount() {
          return 0;
        },
        getRegisteredMenuIds() {
          return [];
        },
      },
      preferencePanes: {
        getPaneCount() {
          return 0;
        },
        getAllPanes() {
          return [];
        },
      },
      demoState,
      getItemTypeLabel() {
        return "item";
      },
      getItemSummary() {
        return "summary";
      },
      getColumnValue() {
        return "0";
      },
      getItemTitle() {
        return "title";
      },
      executeAgentAction() {
        return true;
      },
      updateDemoNotifierState() {},
      zotero: null,
      runtimeInfo: {
        capabilitySummary: {
          ok: true,
          status: "healthy",
          injectedCount: 0,
          skippedCount: 0,
          missingRequired: [],
        },
      },
    });

    const diagnostics = agent.collectAgentDiagnostics();
    assert.equal(diagnostics.readerEventAPIAvailable, true);
    assert.equal(diagnostics.readerEventListenerCount, 3);
    assert.equal(diagnostics.readerEventKnownTypeCount, 5);
    assert.equal(diagnostics.readerEventProbeTypeCount, 2);
    assert.equal(diagnostics.readerEventSyntheticFallbackAvailable, true);
    assert.equal(diagnostics.readerEventReport.available, true);
    assert.equal(diagnostics.readerEventReport.registeredCount, 3);
    assert.equal(diagnostics.readerEventReport.knownTypes.length, 5);
    assert.ok(diagnostics.readerEventReport.knownTypes.includes("renderTextSelectionPopup"));
    assert.ok(diagnostics.readerEventReport.knownTypes.includes("createViewContextMenu"));
    assert.equal(diagnostics.readerEventReport.probeCompatibleTypes.length, 2);
    assert.ok(diagnostics.readerEventReport.probeCompatibleTypes.includes("renderTextSelectionPopup"));
    assert.ok(diagnostics.readerEventReport.probeCompatibleTypes.includes("renderSidebarAnnotationHeader"));
    assert.ok(diagnostics.readerEventReport.probeDispatchModes.includes("customEvent"));
    assert.ok(diagnostics.readerEventReport.probeDispatchModes.includes("synthetic-fallback"));
    assert.equal(diagnostics.readerEventReport.syntheticFallbackAvailable, true);
    assert.equal(diagnostics.readerEventListeners.length, 3);
    assert.ok(diagnostics.readerEventListeners.some((item) => item.type === "renderTextSelectionPopup"));
    assert.ok(diagnostics.readerEventListeners.some((item) => item.type === "renderSidebarAnnotationHeader"));
  });
});
