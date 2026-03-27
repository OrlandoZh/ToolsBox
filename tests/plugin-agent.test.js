import { describe, it, assert } from "./test-framework.js";
import { createPluginAgent } from "../src/app/plugin-agent.js";

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
          return 2;
        },
        getAllCommands() {
          return [
            { id: "cleanroomtemplate-primary-action" },
            { id: "cleanroomtemplate-reader-summary" },
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
      runAgentAction() {
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
    assert.equal(diagnostics.commandCount, 2);
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
    assert.deepEqual(diagnostics.readerEventListeners, [{
      type: "renderToolbar",
      pluginID: "cleanroom-template@example.com",
    }]);
    assert.equal(diagnostics.readerEventReport.syntheticFallbackAvailable, true);
    assert.ok(diagnostics.capabilityCount >= 11);

    const capabilities = agent.listCapabilities();
    assert.ok(capabilities.length >= 11);
    assert.equal(agent.getCapability("settings-governance").agentScenario, "settings-snapshot");
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
    assert.equal(settingsSnapshot.definitionCount, 3);
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
      runAgentAction() {
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
      runAgentAction() {
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
      runAgentAction() {
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
