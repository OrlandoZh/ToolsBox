import {
  createCapabilityManifest,
  findCapabilityById,
} from "./capability-manifest.js";

const BASELINE_ITEM_PANE_L10N = Object.freeze({
  infoRowLabel: "cleanroom-item-pane-info-row-label",
  sectionHeader: "cleanroom-item-pane-section-header",
  sectionSidenav: "cleanroom-item-pane-section-sidenav",
});

export function createPluginAgent({
  config,
  host,
  settings,
  prefs,
  http,
  itemPane,
  itemTree,
  notifier,
  reader,
  commandPalette,
  menuManager,
  preferencePanes,
  demoState,
  demoInfoRowID,
  demoSectionID,
  getItemTypeLabel,
  getItemSummary,
  getColumnValue,
  getItemTitle,
  listHostActions,
  runHostAction,
  runAgentAction,
  updateDemoNotifierState,
  zotero,
  serviceRegistry,
  runtimeInfo,
  getLifecycleTelemetrySummary = null,
  getPackageProtectionSummary = null,
}) {
  const capabilityManifest = createCapabilityManifest({ config });

  function buildReaderEventReport() {
    if (reader && typeof reader.getEventAPIReport === "function") {
      return reader.getEventAPIReport();
    }

    const registeredListeners = typeof reader?.getRegisteredEventListeners === "function"
      ? reader.getRegisteredEventListeners()
      : [];

    return {
      available: typeof reader?.isEventAPIAvailable === "function"
        ? Boolean(reader.isEventAPIAvailable())
        : false,
      registeredCount: typeof reader?.getEventListenerCount === "function"
        ? Number(reader.getEventListenerCount() || 0)
        : registeredListeners.length,
      registeredTypes: Array.from(new Set(
        (Array.isArray(registeredListeners) ? registeredListeners : [])
          .map((entry) => String(entry?.type || "").trim())
          .filter(Boolean),
      )),
      registeredListeners,
      knownTypes: [],
      probeCompatibleTypes: [],
      probeDispatchModes: [],
      syntheticFallbackAvailable: false,
    };
  }

  function getPrimaryWindow() {
    return host.getMainWindow();
  }

  function collectBaselineItemPaneL10nHealth() {
    if (!itemPane || typeof itemPane.getRegistrationSnapshot !== "function") {
      return {
        ok: true,
        driftCount: 0,
        drifts: [],
      };
    }

    const snapshot = itemPane.getRegistrationSnapshot();
    const drifts = [];
    const infoRows = Array.isArray(snapshot?.infoRows) ? snapshot.infoRows : [];
    const sections = Array.isArray(snapshot?.sections) ? snapshot.sections : [];

    const baselineInfoRow = infoRows.find((entry) => entry?.rowID === demoInfoRowID);
    if (
      baselineInfoRow
      && typeof baselineInfoRow.labelL10nID === "string"
      && baselineInfoRow.labelL10nID
      && baselineInfoRow.labelL10nID !== BASELINE_ITEM_PANE_L10N.infoRowLabel
    ) {
      drifts.push({
        kind: "info-row-label",
        label: "ItemPane InfoRow",
        expected: BASELINE_ITEM_PANE_L10N.infoRowLabel,
        actual: baselineInfoRow.labelL10nID,
      });
    }

    const baselineSection = sections.find((entry) => entry?.paneID === demoSectionID);
    if (
      baselineSection
      && typeof baselineSection.headerL10nID === "string"
      && baselineSection.headerL10nID
      && baselineSection.headerL10nID !== BASELINE_ITEM_PANE_L10N.sectionHeader
    ) {
      drifts.push({
        kind: "section-header",
        label: "ItemPane Section Header",
        expected: BASELINE_ITEM_PANE_L10N.sectionHeader,
        actual: baselineSection.headerL10nID,
      });
    }
    if (
      baselineSection
      && typeof baselineSection.sidenavL10nID === "string"
      && baselineSection.sidenavL10nID
      && baselineSection.sidenavL10nID !== BASELINE_ITEM_PANE_L10N.sectionSidenav
    ) {
      drifts.push({
        kind: "section-sidenav",
        label: "ItemPane Section Sidenav",
        expected: BASELINE_ITEM_PANE_L10N.sectionSidenav,
        actual: baselineSection.sidenavL10nID,
      });
    }

    return {
      ok: drifts.length === 0,
      driftCount: drifts.length,
      drifts,
    };
  }

  function runAgentSelfCheck() {
    const window = getPrimaryWindow();
    const itemPaneL10n = collectBaselineItemPaneL10nHealth();
    const primaryActionEntryID = `${config.addonRef}-primary-action`;
    const readerSummaryEntryID = `${config.addonRef}-reader-summary`;
    const contextActionEntryID = `${config.addonRef}-context-action`;
    const preferencePaneID = `${config.addonRef}-preferences`;
    const commandIDs = typeof commandPalette?.getAllCommands === "function"
      ? commandPalette.getAllCommands()
        .map((item) => String(item?.id || "").trim())
        .filter(Boolean)
      : [];
    const menuIDs = typeof menuManager?.getRegisteredMenuIds === "function"
      ? menuManager.getRegisteredMenuIds()
        .map((item) => String(item || "").trim())
        .filter(Boolean)
      : [];
    const paneIDs = typeof preferencePanes?.getAllPanes === "function"
      ? preferencePanes.getAllPanes()
        .map((item) => String(item || "").trim())
        .filter(Boolean)
      : [];
    const officialMenuAPIAvailable = typeof menuManager?.isOfficialAPIAvailable === "function"
      ? Boolean(menuManager.isOfficialAPIAvailable())
      : false;
    const readerEventReport = buildReaderEventReport();
    const runtimeSummary = runtimeInfo?.capabilitySummary || {
      ok: true,
      status: "unknown",
      injectedCount: 0,
      skippedCount: 0,
      missingRequired: [],
    };
    const serviceSummary = serviceRegistry && typeof serviceRegistry.getSummary === "function"
      ? serviceRegistry.getSummary()
      : {
        total: 0,
        healthy: 0,
        unhealthy: 0,
        healthOK: true,
        status: "idle",
        services: [],
      };
    const httpDiagnostics = http && typeof http.getDiagnostics === "function"
      ? http.getDiagnostics()
      : {
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        timeoutCount: 0,
        retryCount: 0,
        slowOperationCount: 0,
        slowThresholdMs: 0,
        lastRequest: null,
        lastError: null,
      };
    const lifecycleTelemetry = typeof getLifecycleTelemetrySummary === "function"
      ? getLifecycleTelemetrySummary()
      : {
        hostReadyDurationMs: 0,
        startupDurationMs: 0,
        shutdownDurationMs: 0,
        lifecycleSlowOperationCount: 0,
        lifecycleSlowThresholdMs: 2000,
        lifecycleLastSlowStage: null,
        lifecycleBoundaryEvents: [],
      };
    const packageProtection = typeof getPackageProtectionSummary === "function"
      ? getPackageProtectionSummary()
      : {
        active: false,
        variant: null,
        decodeMethod: null,
        loadSubScriptDurationMs: 0,
        decodeDurationMs: 0,
        decryptDurationMs: 0,
        evalDurationMs: 0,
        prepareDurationMs: 0,
        bootstrapResolveDurationMs: 0,
        bootstrapCallCount: 0,
      };
    return {
      enabled: Boolean(prefs.get("enabled")),
      hasMainWindow: Boolean(window),
      itemPaneSections: itemPane.getSectionCount(),
      itemPaneInfoRows: itemPane.getInfoRowCount(),
      itemPaneL10nOK: itemPaneL10n.ok,
      itemPaneL10nDriftCount: itemPaneL10n.driftCount,
      itemPaneL10nDrifts: itemPaneL10n.drifts,
      itemTreeColumns: itemTree.getColumnCount(),
      notifierActiveCount: notifier.getActiveCount(),
      readerActive: Boolean(reader.getActiveReader()),
      readerEventAPIAvailable: Boolean(readerEventReport.available),
      readerEventListenerCount: Number(readerEventReport.registeredCount || 0),
      readerEventKnownTypeCount: Array.isArray(readerEventReport.knownTypes)
        ? readerEventReport.knownTypes.length
        : 0,
      readerEventProbeTypeCount: Array.isArray(readerEventReport.probeCompatibleTypes)
        ? readerEventReport.probeCompatibleTypes.length
        : 0,
      readerEventSyntheticFallbackAvailable: Boolean(readerEventReport.syntheticFallbackAvailable),
      commandCount: commandPalette.getCommandCount(),
      menuCount: menuManager.getMenuCount(),
      officialMenuAPIAvailable,
      primaryActionCommandRegistered: commandIDs.includes(primaryActionEntryID),
      readerSummaryCommandRegistered: commandIDs.includes(readerSummaryEntryID),
      contextActionMenuRegistered: menuIDs.includes(contextActionEntryID),
      readerSummaryMenuRegistered: menuIDs.includes(readerSummaryEntryID),
      preferencePaneCount: preferencePanes.getPaneCount(),
      preferencePaneRegistered: paneIDs.includes(preferencePaneID),
      serviceTotal: Number(serviceSummary.total || 0),
      serviceHealthyCount: Number(serviceSummary.healthy || 0),
      serviceUnhealthyCount: Number(serviceSummary.unhealthy || 0),
      serviceHealthOK: Boolean(serviceSummary.healthOK !== false),
      serviceStatus: serviceSummary.status || "idle",
      httpObserved: Number(httpDiagnostics.requestCount || 0) > 0,
      httpRequestCount: Number(httpDiagnostics.requestCount || 0),
      httpSuccessCount: Number(httpDiagnostics.successCount || 0),
      httpFailureCount: Number(httpDiagnostics.failureCount || 0),
      httpTimeoutCount: Number(httpDiagnostics.timeoutCount || 0),
      httpRetryCount: Number(httpDiagnostics.retryCount || 0),
      httpSlowOperationCount: Number(httpDiagnostics.slowOperationCount || 0),
      httpSlowThresholdMs: Number(httpDiagnostics.slowThresholdMs || 0),
      httpLastRequest: httpDiagnostics.lastRequest || null,
      httpLastError: httpDiagnostics.lastError || null,
      hostActionCount: typeof listHostActions === "function"
        ? listHostActions().length
        : 0,
      hostReadyDurationMs: Number(lifecycleTelemetry?.hostReadyDurationMs || 0),
      startupDurationMs: Number(lifecycleTelemetry?.startupDurationMs || 0),
      shutdownDurationMs: Number(lifecycleTelemetry?.shutdownDurationMs || 0),
      lifecycleSlowOperationCount: Number(lifecycleTelemetry?.lifecycleSlowOperationCount || 0),
      lifecycleSlowThresholdMs: Number(lifecycleTelemetry?.lifecycleSlowThresholdMs || 2000),
      lifecycleLastSlowStage: typeof lifecycleTelemetry?.lifecycleLastSlowStage === "string"
        && lifecycleTelemetry.lifecycleLastSlowStage.trim()
        ? lifecycleTelemetry.lifecycleLastSlowStage
        : null,
      lifecycleBoundaryEvents: Array.isArray(lifecycleTelemetry?.lifecycleBoundaryEvents)
        ? lifecycleTelemetry.lifecycleBoundaryEvents
          .map((entry) => ({
            event: String(entry?.event || "").trim() || "unknown",
            count: Number(entry?.count || 0),
          }))
          .filter((entry) => entry.count > 0)
        : [],
      packageProtectionActive: Boolean(packageProtection?.active),
      packageProtectionVariant: typeof packageProtection?.variant === "string"
        && packageProtection.variant.trim()
        ? packageProtection.variant
        : null,
      packageProtectionDecodeMethod: typeof packageProtection?.decodeMethod === "string"
        && packageProtection.decodeMethod.trim()
        ? packageProtection.decodeMethod
        : null,
      packageProtectionLoadSubScriptDurationMs: Number(packageProtection?.loadSubScriptDurationMs || 0),
      packageProtectionDecodeDurationMs: Number(packageProtection?.decodeDurationMs || 0),
      packageProtectionDecryptDurationMs: Number(packageProtection?.decryptDurationMs || 0),
      packageProtectionEvalDurationMs: Number(packageProtection?.evalDurationMs || 0),
      packageProtectionPrepareDurationMs: Number(packageProtection?.prepareDurationMs || 0),
      packageProtectionBootstrapResolveDurationMs: Number(packageProtection?.bootstrapResolveDurationMs || 0),
      packageProtectionBootstrapCallCount: Number(packageProtection?.bootstrapCallCount || 0),
      services: Array.isArray(serviceSummary.services) ? serviceSummary.services : [],
      runtimeBridgeOK: Boolean(runtimeSummary.ok !== false),
      runtimeBridgeStatus: runtimeSummary.status || "unknown",
      runtimeInjectedCapabilityCount: Number(runtimeSummary.injectedCount || 0),
      runtimeSkippedCapabilityCount: Number(runtimeSummary.skippedCount || 0),
      runtimeMissingRequiredCapabilities: Array.isArray(runtimeSummary.missingRequired)
        ? runtimeSummary.missingRequired.slice()
        : [],
    };
  }

  function createSampleItem(overrides = {}) {
    const fields = {
      title: overrides.title || "Agent Scenario Item",
      ...((overrides.fields && typeof overrides.fields === "object") ? overrides.fields : {}),
    };

    return {
      id: overrides.id ?? 101,
      itemType: overrides.itemType || "journalArticle",
      getField(field) {
        return fields[field] || "";
      },
    };
  }

  function resolveAgentItem(target) {
    if (target && typeof target.getField === "function") {
      return {
        item: target,
        source: "zotero",
      };
    }

    const requestedID = typeof target === "number"
      ? target
      : typeof target?.itemID === "number"
        ? target.itemID
        : typeof target?.id === "number"
          ? target.id
          : null;

    if (requestedID !== null && zotero?.Items && typeof zotero.Items.get === "function") {
      const item = zotero.Items.get(requestedID);
      if (item) {
        return {
          item,
          source: "zotero",
        };
      }
    }

    return {
      item: createSampleItem(
        target && typeof target === "object"
          ? target.item || target
          : {},
      ),
      source: "sample",
    };
  }

  function inspectItemPresentation(target) {
    const { item, source } = resolveAgentItem(target);
    return {
      itemID: item?.id ?? null,
      itemType: getItemTypeLabel(item),
      summary: getItemSummary(item),
      columnValue: getColumnValue(item),
      title: getItemTitle(item),
      source,
      isRealItem: source === "zotero",
    };
  }

  function collectAgentDiagnostics() {
    return {
      ...runAgentSelfCheck(),
      capabilityCount: capabilityManifest.length,
      lastNotifierEvent: demoState.lastNotifierEvent,
      readerEventListeners: buildReaderEventReport().registeredListeners,
      readerEventReport: buildReaderEventReport(),
      itemPaneL10n: collectBaselineItemPaneL10nHealth(),
      menuIDs: menuManager.getRegisteredMenuIds(),
      commandIDs: commandPalette.getAllCommands().map((item) => item.id),
      paneIDs: preferencePanes.getAllPanes(),
      packageProtection: typeof getPackageProtectionSummary === "function"
        ? getPackageProtectionSummary()
        : null,
      hostActions: typeof listHostActions === "function"
        ? listHostActions()
        : [],
      httpDiagnostics: http && typeof http.getDiagnostics === "function"
        ? http.getDiagnostics()
        : null,
    };
  }

  function listAgentScenarios() {
    return [
      "baseline-registration",
      "capability-manifest",
      "sample-item-pane",
      "settings-snapshot",
      "notifier-preview",
      "reader-current",
      "window-snapshot",
      "command-no-ui",
      "host-actions",
    ];
  }

  function listCapabilities() {
    return capabilityManifest.map((item) => JSON.parse(JSON.stringify(item)));
  }

  function getCapability(capabilityId) {
    return findCapabilityById(capabilityManifest, capabilityId);
  }

  function runAgentScenario(name, payload = {}) {
    switch (name) {
      case "baseline-registration":
        return collectAgentDiagnostics();
      case "capability-manifest":
        return {
          total: capabilityManifest.length,
          ids: capabilityManifest.map((item) => item.id),
          capabilities: listCapabilities(),
        };
      case "sample-item-pane": {
        return inspectItemPresentation(payload.itemID ?? payload.item ?? payload);
      }
      case "settings-snapshot": {
        const definitions = settings && typeof settings.listDefinitions === "function"
          ? settings.listDefinitions()
          : [];
        const migrationSummary = settings && typeof settings.getMigrationSummary === "function"
          ? settings.getMigrationSummary()
          : null;
        return {
          definitionCount: definitions.length,
          definitions,
          migrationSummary,
          preferencePaneCount: preferencePanes.getPaneCount(),
          paneIDs: preferencePanes.getAllPanes(),
        };
      }
      case "notifier-preview": {
        const event = payload.event || "modify";
        const type = payload.type || "item";
        const ids = Array.isArray(payload.ids) ? payload.ids : [payload.id ?? 42];
        updateDemoNotifierState(event, type, ids);
        return {
          lastNotifierEvent: demoState.lastNotifierEvent,
        };
      }
      case "reader-current":
        {
          const interaction = typeof reader.getReaderInteractionSnapshot === "function"
            ? reader.getReaderInteractionSnapshot(payload.itemID ?? payload.tabID ?? payload.target)
            : null;
          const eventAPIReport = buildReaderEventReport();
        return {
            summary: reader.getReaderSummary(payload.itemID ?? payload.tabID ?? payload.target),
            interaction,
            eventListenerCount: eventAPIReport.registeredCount || 0,
            eventListeners: eventAPIReport.registeredListeners || [],
            eventAPIReport,
            windowStates: interaction?.windowStates
              || (typeof reader.getWindowStates === "function" ? reader.getWindowStates() : []),
          };
        }
      case "window-snapshot": {
        const windows = host && typeof host.listMainWindows === "function"
          ? host.listMainWindows()
          : [];
        if (windows.length === 0) {
          const primaryWindow = getPrimaryWindow();
          if (primaryWindow) {
            windows.push(primaryWindow);
          }
        }
        const details = windows.map((window, index) => ({
          index,
          href: window?.location?.href || window?.document?.location?.href || "",
          hasMenuItem: Boolean(window?.document?.getElementById?.("cleanroom-template-menuitem")),
          hasStyle: Boolean(window?.document?.getElementById?.("cleanroom-template-style")),
          closed: Boolean(window?.closed),
        }));
        return {
          mainWindowCount: windows.length,
          windows: details,
        };
      }
      case "command-no-ui":
        return {
          ok: runAgentAction(),
        };
      case "host-actions":
        return {
          total: typeof listHostActions === "function"
            ? listHostActions().length
            : 0,
          actions: typeof listHostActions === "function"
            ? listHostActions()
            : [],
        };
      default:
        throw new Error(`Unknown agent scenario: ${name}`);
    }
  }

  return {
    runAgentSelfCheck,
    inspectItemPresentation,
    collectAgentDiagnostics,
    listAgentScenarios,
    listCapabilities,
    getCapability,
    runAgentScenario,
    listHostActions() {
      return typeof listHostActions === "function"
        ? listHostActions()
        : [];
    },
    async runHostAction(actionId, payload = {}) {
      if (typeof runHostAction !== "function") {
        throw new Error("Host Action runner is unavailable");
      }
      return await runHostAction(actionId, payload);
    },
  };
}
