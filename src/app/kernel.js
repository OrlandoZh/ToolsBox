import { createWindowRuntime } from "./window-runtime.js";

const LIFECYCLE_SLOW_THRESHOLD_MS = 2000;

async function waitForHostReady(zotero, logger) {
  if (!zotero) {
    return;
  }

  const promises = [
    zotero.initializationPromise,
    zotero.unlockPromise,
    zotero.uiReadyPromise,
  ].filter((value) => value && typeof value.then === "function");

  if (promises.length === 0) {
    return;
  }

  logger.debug("plugin.host.waiting", { promises: promises.length });
  await Promise.all(promises);
  logger.debug("plugin.host.ready", { promises: promises.length });
}

function createLifecycleTelemetryState() {
  const boundaryEventMap = new Map();
  const state = {
    hostReadyDurationMs: 0,
    startupDurationMs: 0,
    shutdownDurationMs: 0,
    lifecycleSlowOperationCount: 0,
    lifecycleSlowThresholdMs: LIFECYCLE_SLOW_THRESHOLD_MS,
    lifecycleLastSlowStage: null,
    lifecycleBoundaryEvents: [],
  };

  function syncBoundaryEvents() {
    state.lifecycleBoundaryEvents = Array.from(boundaryEventMap.entries())
      .map(([event, count]) => ({
        event,
        count,
      }))
      .sort((left, right) => right.count - left.count || left.event.localeCompare(right.event, "en"));
  }

  return {
    recordBoundaryEvent(event) {
      const normalizedEvent = String(event || "").trim() || "unknown";
      boundaryEventMap.set(normalizedEvent, Number(boundaryEventMap.get(normalizedEvent) || 0) + 1);
      syncBoundaryEvents();
    },
    recordDuration(stage, durationMs) {
      const safeDurationMs = Math.max(0, Number(durationMs || 0));
      if (stage === "host-ready") {
        state.hostReadyDurationMs = safeDurationMs;
      }
      if (stage === "startup") {
        state.startupDurationMs = safeDurationMs;
      }
      if (stage === "shutdown") {
        state.shutdownDurationMs = safeDurationMs;
      }
      if (safeDurationMs >= state.lifecycleSlowThresholdMs) {
        state.lifecycleSlowOperationCount += 1;
        state.lifecycleLastSlowStage = stage;
      }
    },
    clone() {
      return {
        hostReadyDurationMs: state.hostReadyDurationMs,
        startupDurationMs: state.startupDurationMs,
        shutdownDurationMs: state.shutdownDurationMs,
        lifecycleSlowOperationCount: state.lifecycleSlowOperationCount,
        lifecycleSlowThresholdMs: state.lifecycleSlowThresholdMs,
        lifecycleLastSlowStage: state.lifecycleLastSlowStage,
        lifecycleBoundaryEvents: state.lifecycleBoundaryEvents.map((entry) => ({ ...entry })),
      };
    },
  };
}

export function createPluginKernel({
  host,
  zotero,
  logger,
  lifecycle,
  windows,
  settings,
  registerBaselineFeatures,
  applySettings,
  onSettingsChange,
  addonName,
  startServices = null,
  stopServices = null,
  onLifecycleTelemetryChange = null,
}) {
  const runtime = createWindowRuntime({ windows });
  const lifecycleTelemetry = createLifecycleTelemetryState();

  function publishLifecycleTelemetry() {
    if (typeof onLifecycleTelemetryChange === "function") {
      onLifecycleTelemetryChange(lifecycleTelemetry.clone());
    }
  }

  function logBoundaryFailure(event, error) {
    const boundaryEvent = `plugin.${event}.failed`;
    lifecycleTelemetry.recordBoundaryEvent(boundaryEvent);
    publishLifecycleTelemetry();
    logger.error(boundaryEvent, {
      phase: runtime.getPhase(),
      message: String(error?.message || error),
    });
  }

  async function start() {
    if (!runtime.canStart()) {
      return;
    }
    runtime.markStarting();
    let servicesStarted = false;
    const startupStartedAt = Date.now();
    const hostReadyStartedAt = Date.now();
    let hostReadyRecorded = false;

    try {
      await waitForHostReady(zotero, logger);
      lifecycleTelemetry.recordDuration("host-ready", Date.now() - hostReadyStartedAt);
      hostReadyRecorded = true;
      publishLifecycleTelemetry();
      settings.ensureDefaults();
      // One-time migration: only set prefs when undefined, preserving user settings
      if (typeof settings.set === "function") {
        const migrationKeys = [
          "attachmentPreview.enabled",
          "nestedTags.enabled",
          "ratingColumn.enabled",
          "tagsColumn.enabled",
          "dateAddedColumn.enabled",
          "dateModifiedColumn.enabled",
          "readStatusColumn.enabled",
          "creatorColumn.enabled",
          "publicationColumn.enabled",
          "remarkColumn.enabled",
          "addTags.enabled",
          "relatedItems.enabled",
          "explorePanel.enabled",
          "darkLightButton.enabled",
          "titleTranslate.enabled",
        ];
        for (const key of migrationKeys) {
          if (settings.get(key) === undefined) {
            settings.set(key, true);
          }
        }
      }
      applySettings();

      const mainWindows = host.listMainWindows();
      mainWindows.forEach((window) => {
        host.insertFTLIfNeeded(window, "main.ftl");
      });

      const stopObservingPrefs = settings.onChange(onSettingsChange);
      lifecycle.trackCleanup(stopObservingPrefs);

      if (typeof startServices === "function") {
        await startServices();
        servicesStarted = true;
      }

      await registerBaselineFeatures();
      windows.loadAll(mainWindows);
      runtime.markRunning();
      lifecycleTelemetry.recordDuration("startup", Date.now() - startupStartedAt);
      publishLifecycleTelemetry();
      logger.info("plugin.start", { addonName });

      lifecycle.trackCleanup(() => {
        logger.info("plugin.cleanup");
      });
    } catch (error) {
      if (!hostReadyRecorded) {
        lifecycleTelemetry.recordDuration("host-ready", Date.now() - hostReadyStartedAt);
      }
      lifecycleTelemetry.recordDuration("startup", Date.now() - startupStartedAt);
      publishLifecycleTelemetry();
      logBoundaryFailure("start", error);
      if (servicesStarted && typeof stopServices === "function") {
        try {
          await stopServices();
        } catch (cleanupError) {
          logBoundaryFailure("start.cleanup", cleanupError);
        }
      }
      runtime.resetWindows();
      lifecycle.reset();
      runtime.markIdle();
      throw error;
    }
  }

  async function shutdown() {
    if (!runtime.canStop()) {
      return;
    }
    runtime.markStopping();
    let shutdownError = null;
    const shutdownStartedAt = Date.now();

    try {
      if (typeof stopServices === "function") {
        await stopServices();
      }
    } catch (error) {
      shutdownError = error;
      logBoundaryFailure("shutdown", error);
    } finally {
      lifecycleTelemetry.recordDuration("shutdown", Date.now() - shutdownStartedAt);
      publishLifecycleTelemetry();
      runtime.resetWindows();
      lifecycle.reset();
      runtime.markIdle();
      logger.info("plugin.stop");
    }

    if (shutdownError) {
      throw shutdownError;
    }
  }

  async function onWindowLoad(window) {
    runtime.onWindowLoad(window);
  }

  async function onWindowUnload(window) {
    runtime.onWindowUnload(window);
  }

  return {
    start,
    shutdown,
    onWindowLoad,
    onWindowUnload,
    getPhase: runtime.getPhase,
    getLifecycleTelemetry: lifecycleTelemetry.clone,
  };
}
