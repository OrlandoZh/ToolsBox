export async function pollPluginReady({
  rdp,
  instanceKey,
  timeoutMs = 15000,
  pollIntervalMs = 250,
}) {
  const expression = `Boolean(Zotero[${JSON.stringify(instanceKey)}] && Zotero[${JSON.stringify(instanceKey)}].api)`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ready = await rdp.evaluateInChrome(expression);
    if (ready === true) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}

export async function ensurePluginReady({ rdp, config }) {
  const ready = await pollPluginReady({
    rdp,
    instanceKey: config.instanceKey,
  });
  if (ready) {
    return { mode: "native" };
  }

  const pluginsInit = await rdp.initializeZoteroPlugins();
  if (pluginsInit.available) {
    const readyAfterPluginsInit = await pollPluginReady({
      rdp,
      instanceKey: config.instanceKey,
      timeoutMs: 5000,
    });
    if (readyAfterPluginsInit) {
      return { mode: "plugins-init" };
    }
  }

  const fallback = await rdp.bootstrapAddonRuntime({
    addonId: config.addonId,
    addonRef: config.addonRef,
    instanceKey: config.instanceKey,
  });
  if (!fallback.found || !fallback.started) {
    throw new Error(`Timed out waiting for plugin readiness: ${config.instanceKey}`);
  }

  const readyAfterFallback = await pollPluginReady({
    rdp,
    instanceKey: config.instanceKey,
    timeoutMs: 5000,
  });
  if (!readyAfterFallback) {
    throw new Error(`Timed out waiting for plugin readiness: ${config.instanceKey}`);
  }

  return { mode: "manual" };
}

export async function installRuntimeLogBridge(rdp) {
  await rdp.evaluateInChrome(`(() => {
    if (globalThis.__CLEANROOM_AGENT_LOG_BRIDGE__) {
      return true;
    }

    const state = {
      max: 800,
      list: [],
      push(source, level, args) {
        const message = args.map((arg) => {
          if (typeof arg === "string") {
            return arg;
          }
          if (arg && typeof arg === "object" && "message" in arg) {
            return String(arg.message);
          }
          try {
            return JSON.stringify(arg);
          }
          catch {
            return String(arg);
          }
        }).join(" ");

        this.list.push({
          at: new Date().toISOString(),
          source,
          level,
          message,
        });
        if (this.list.length > this.max) {
          this.list.splice(0, this.list.length - this.max);
        }
      },
      clear() {
        this.list.length = 0;
      },
      read() {
        return this.list.slice();
      },
    };

    if (globalThis.console) {
      for (const key of ["log", "info", "warn", "error"]) {
        const original = globalThis.console[key];
        if (typeof original !== "function") {
          continue;
        }
        globalThis.console[key] = function patchedConsole(...args) {
          try {
            state.push("console", key, args);
          }
          catch {}
          return original.apply(this, args);
        };
      }
    }

    if (globalThis.Zotero && typeof globalThis.Zotero.debug === "function") {
      const originalDebug = globalThis.Zotero.debug;
      globalThis.Zotero.debug = function patchedZoteroDebug(...args) {
        try {
          state.push("zotero.debug", "debug", args);
        }
        catch {}
        return originalDebug.apply(this, args);
      };
    }

    globalThis.__CLEANROOM_AGENT_LOG_BRIDGE__ = state;
    return true;
  })()`);
}

export async function clearCapturedLogs(rdp) {
  await rdp.evaluateInChrome(`(() => {
    globalThis.__CLEANROOM_AGENT_LOG_BRIDGE__?.clear?.();
    return true;
  })()`);
}

export async function readCapturedLogs(rdp) {
  const raw = await rdp.evaluateInChrome(`(() => {
    const errorBoundaryEventPatterns = [
      "plugin.start.failed",
      "plugin.shutdown.failed",
      "cleanroom.bootstrap.startup.failed",
      "cleanroom.bootstrap.shutdown.failed",
      "cleanroom.bootstrap.startup.cleanup.failed",
    ];
    const classifyLog = (entry) => {
      const level = String(entry?.level || "").toLowerCase();
      const source = String(entry?.source || "").toLowerCase();
      const message = String(entry?.message || "").toLowerCase();

      if (level === "error" || message.includes("[cleanroom:error]")) {
        return "error";
      }
      if (source.startsWith("zotero.")) {
        const looksPluginRelated = (
          message.includes("cleanroom")
          || message.includes("bootstrapplugin")
          || message.includes("instancekey")
          || message.includes("addon")
        );
        if (looksPluginRelated && (message.includes("error") || message.includes("failed"))) {
          return "error";
        }
        if (
          message.includes("[warn")
          || message.includes("warning")
          || message.includes("javascript error:")
          || message.includes("missing chrome or resource url")
          || message.includes("failed to load resource://")
        ) {
          return "warn";
        }
        return "info";
      }
      if (level === "warn" || message.includes("[cleanroom:warn]")) {
        return "warn";
      }
      return "info";
    };
    const detectErrorBoundaryEvent = (message) => {
      const normalizedMessage = String(message || "").toLowerCase();
      return errorBoundaryEventPatterns.find((pattern) => normalizedMessage.includes(pattern)) || null;
    };

    const list = globalThis.__CLEANROOM_AGENT_LOG_BRIDGE__?.read?.() || [];
    const summary = {
      total: list.length,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      errorBoundaryHitCount: 0,
      errorBoundaryEvents: [],
      recentErrors: [],
      recentWarnings: [],
    };
    const boundaryMap = new Map();

    for (const entry of list) {
      const type = classifyLog(entry);
      const row = {
        at: entry?.at || null,
        source: entry?.source || "unknown",
        level: entry?.level || "unknown",
        message: String(entry?.message || ""),
      };

      if (type === "error") {
        summary.errorCount += 1;
        const boundaryEvent = detectErrorBoundaryEvent(row.message);
        if (boundaryEvent) {
          summary.errorBoundaryHitCount += 1;
          boundaryMap.set(boundaryEvent, (boundaryMap.get(boundaryEvent) || 0) + 1);
        }
        if (summary.recentErrors.length < 6) {
          summary.recentErrors.push(row);
        }
        continue;
      }

      if (type === "warn") {
        summary.warnCount += 1;
        if (summary.recentWarnings.length < 6) {
          summary.recentWarnings.push(row);
        }
        continue;
      }

      summary.infoCount += 1;
    }

    summary.errorBoundaryEvents = Array.from(boundaryMap.entries())
      .map(([event, count]) => ({ event, count }))
      .sort((left, right) => right.count - left.count || left.event.localeCompare(right.event));

    return JSON.stringify(summary);
  })()`);
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export function mergeLogSummaries(...summaries) {
  const toEntries = (value) => {
    const items = Array.isArray(value)
      ? value
      : value && typeof value === "object"
        ? Object.values(value)
        : [];
    return items.filter((entry) => (
      entry
      && typeof entry === "object"
      && (
        Object.prototype.hasOwnProperty.call(entry, "message")
        || Object.prototype.hasOwnProperty.call(entry, "source")
        || Object.prototype.hasOwnProperty.call(entry, "level")
      )
    ));
  };

  const merged = {
    total: 0,
    errorCount: 0,
    warnCount: 0,
    infoCount: 0,
    errorBoundaryHitCount: 0,
    errorBoundaryEvents: [],
    recentErrors: [],
    recentWarnings: [],
  };
  const boundaryMap = new Map();

  for (const summary of summaries) {
    if (!summary) {
      continue;
    }

    merged.total += Number(summary.total || 0);
    merged.errorCount += Number(summary.errorCount || 0);
    merged.warnCount += Number(summary.warnCount || 0);
    merged.infoCount += Number(summary.infoCount || 0);
    merged.errorBoundaryHitCount += Number(summary.errorBoundaryHitCount || 0);
    const boundaryEvents = Array.isArray(summary.errorBoundaryEvents) ? summary.errorBoundaryEvents : [];
    boundaryEvents.forEach((entry) => {
      const event = String(entry?.event || "").trim();
      if (!event) {
        return;
      }
      boundaryMap.set(event, (boundaryMap.get(event) || 0) + Number(entry?.count || 0));
    });

    for (const entry of toEntries(summary.recentErrors)) {
      if (merged.recentErrors.length < 6) {
        merged.recentErrors.push(entry);
      }
    }

    for (const entry of toEntries(summary.recentWarnings)) {
      if (merged.recentWarnings.length < 6) {
        merged.recentWarnings.push(entry);
      }
    }
  }

  merged.errorBoundaryEvents = Array.from(boundaryMap.entries())
    .map(([event, count]) => ({ event, count }))
    .sort((left, right) => right.count - left.count || left.event.localeCompare(right.event));

  return merged;
}

export async function runFunctionalActions({ rdp, config }) {
  const raw = await rdp.evaluateInChrome(`(() => {
    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    const checks = {
      pluginMounted: Boolean(plugin),
      apiMounted: Boolean(plugin && plugin.api),
      primaryActionResult: false,
      agentActionResult: false,
      itemPaneSections: 0,
      itemPaneInfoRows: 0,
      itemPaneL10nOK: true,
      itemPaneL10nDriftCount: 0,
      itemPaneL10nDrifts: [],
      itemTreeColumns: 0,
      notifierActiveCount: 0,
      readerActive: false,
      readerEventAPIAvailable: false,
      readerEventListenerCount: 0,
      readerEventKnownTypeCount: 0,
      readerEventProbeTypeCount: 0,
      readerEventSyntheticFallbackAvailable: false,
      readerEventRegisteredTypes: [],
      readerEventProbeTypes: [],
      readerEventDispatchModes: [],
      officialMenuAPIAvailable: false,
      primaryActionCommandRegistered: false,
      contextActionMenuRegistered: false,
      readerSummaryCommandRegistered: false,
      readerSummaryMenuRegistered: false,
      preferencePaneRegistered: false,
      preferencePaneCount: 0,
      hasMainWindow: false,
      enabled: false,
      serviceTotal: 0,
      serviceHealthyCount: 0,
      serviceUnhealthyCount: 0,
      serviceHealthOK: true,
      serviceStatus: "idle",
      httpObserved: false,
      httpRequestCount: 0,
      httpSuccessCount: 0,
      httpFailureCount: 0,
      httpTimeoutCount: 0,
      httpRetryCount: 0,
      httpSlowOperationCount: 0,
      httpSlowThresholdMs: 0,
      httpLastRequest: null,
      httpLastError: null,
      hostReadyDurationMs: 0,
      startupDurationMs: 0,
      shutdownDurationMs: 0,
      lifecycleSlowOperationCount: 0,
      lifecycleSlowThresholdMs: 2000,
      lifecycleLastSlowStage: null,
      lifecycleBoundaryEvents: [],
    };

    if (plugin && plugin.api) {
      const selfCheck = typeof plugin.api.runAgentSelfCheck === "function"
        ? plugin.api.runAgentSelfCheck()
        : null;
      const diagnostics = typeof plugin.api?.agent?.collectDiagnostics === "function"
        ? plugin.api.agent.collectDiagnostics()
        : null;
      const readerEventReport = diagnostics?.readerEventReport && typeof diagnostics.readerEventReport === "object"
        ? diagnostics.readerEventReport
        : null;
      const readerEventListenerCount = selfCheck?.readerEventListenerCount
        ?? readerEventReport?.registeredCount
        ?? 0;
      const readerEventKnownTypeCount = selfCheck?.readerEventKnownTypeCount
        ?? readerEventReport?.knownTypes?.length
        ?? 0;
      const readerEventProbeTypeCount = selfCheck?.readerEventProbeTypeCount
        ?? readerEventReport?.probeCompatibleTypes?.length
        ?? 0;
      checks.agentActionResult = typeof plugin.api.runAgentAction === "function"
        ? plugin.api.runAgentAction()
        : false;
      checks.enabled = Boolean(selfCheck?.enabled);
      checks.hasMainWindow = Boolean(selfCheck?.hasMainWindow);
      checks.primaryActionResult = Boolean(selfCheck?.enabled && selfCheck?.hasMainWindow);
      checks.itemPaneSections = Number(selfCheck?.itemPaneSections || 0);
      checks.itemPaneInfoRows = Number(selfCheck?.itemPaneInfoRows || 0);
      checks.itemPaneL10nOK = Boolean(selfCheck?.itemPaneL10nOK !== false);
      checks.itemPaneL10nDriftCount = Number(selfCheck?.itemPaneL10nDriftCount || 0);
      checks.itemPaneL10nDrifts = Array.isArray(selfCheck?.itemPaneL10nDrifts)
        ? selfCheck.itemPaneL10nDrifts
        : [];
      checks.itemTreeColumns = Number(selfCheck?.itemTreeColumns || 0);
      checks.notifierActiveCount = Number(selfCheck?.notifierActiveCount || 0);
      checks.readerActive = Boolean(selfCheck?.readerActive);
      checks.readerEventAPIAvailable = Boolean(
        selfCheck?.readerEventAPIAvailable
        ?? readerEventReport?.available,
      );
      checks.readerEventListenerCount = Number(readerEventListenerCount);
      checks.readerEventKnownTypeCount = Number(readerEventKnownTypeCount);
      checks.readerEventProbeTypeCount = Number(readerEventProbeTypeCount);
      checks.readerEventSyntheticFallbackAvailable = Boolean(
        selfCheck?.readerEventSyntheticFallbackAvailable
        ?? readerEventReport?.syntheticFallbackAvailable,
      );
      checks.readerEventRegisteredTypes = Array.isArray(readerEventReport?.registeredTypes)
        ? readerEventReport.registeredTypes
        : [];
      checks.readerEventProbeTypes = Array.isArray(readerEventReport?.probeCompatibleTypes)
        ? readerEventReport.probeCompatibleTypes
        : [];
      checks.readerEventDispatchModes = Array.isArray(readerEventReport?.probeDispatchModes)
        ? readerEventReport.probeDispatchModes
        : [];
      checks.officialMenuAPIAvailable = Boolean(selfCheck?.officialMenuAPIAvailable);
      checks.primaryActionCommandRegistered = Boolean(selfCheck?.primaryActionCommandRegistered);
      checks.contextActionMenuRegistered = Boolean(selfCheck?.contextActionMenuRegistered);
      checks.readerSummaryCommandRegistered = Boolean(selfCheck?.readerSummaryCommandRegistered);
      checks.readerSummaryMenuRegistered = Boolean(selfCheck?.readerSummaryMenuRegistered);
      checks.preferencePaneRegistered = Boolean(selfCheck?.preferencePaneRegistered);
      checks.preferencePaneCount = Number(selfCheck?.preferencePaneCount || 0);
      checks.serviceTotal = Number(selfCheck?.serviceTotal || 0);
      checks.serviceHealthyCount = Number(selfCheck?.serviceHealthyCount || 0);
      checks.serviceUnhealthyCount = Number(selfCheck?.serviceUnhealthyCount || 0);
      checks.serviceHealthOK = Boolean(selfCheck?.serviceHealthOK !== false);
      checks.serviceStatus = String(selfCheck?.serviceStatus || "idle");
      checks.httpObserved = Boolean(selfCheck?.httpObserved);
      checks.httpRequestCount = Number(selfCheck?.httpRequestCount || 0);
      checks.httpSuccessCount = Number(selfCheck?.httpSuccessCount || 0);
      checks.httpFailureCount = Number(selfCheck?.httpFailureCount || 0);
      checks.httpTimeoutCount = Number(selfCheck?.httpTimeoutCount || 0);
      checks.httpRetryCount = Number(selfCheck?.httpRetryCount || 0);
      checks.httpSlowOperationCount = Number(selfCheck?.httpSlowOperationCount || 0);
      checks.httpSlowThresholdMs = Number(selfCheck?.httpSlowThresholdMs || 0);
      checks.httpLastRequest = selfCheck?.httpLastRequest || null;
      checks.httpLastError = selfCheck?.httpLastError || null;
      checks.hostReadyDurationMs = Number(selfCheck?.hostReadyDurationMs || 0);
      checks.startupDurationMs = Number(selfCheck?.startupDurationMs || 0);
      checks.shutdownDurationMs = Number(selfCheck?.shutdownDurationMs || 0);
      checks.lifecycleSlowOperationCount = Number(selfCheck?.lifecycleSlowOperationCount || 0);
      checks.lifecycleSlowThresholdMs = Number(selfCheck?.lifecycleSlowThresholdMs || 2000);
      checks.lifecycleLastSlowStage = typeof selfCheck?.lifecycleLastSlowStage === "string"
        && selfCheck.lifecycleLastSlowStage.trim()
        ? selfCheck.lifecycleLastSlowStage
        : null;
      checks.lifecycleBoundaryEvents = Array.isArray(selfCheck?.lifecycleBoundaryEvents)
        ? selfCheck.lifecycleBoundaryEvents
          .map((entry) => ({
            event: String(entry?.event || "").trim() || "unknown",
            count: Number(entry?.count || 0),
          }))
          .filter((entry) => entry.count > 0)
        : [];
    }

    return JSON.stringify(checks);
  })()`);
  return JSON.parse(raw);
}
