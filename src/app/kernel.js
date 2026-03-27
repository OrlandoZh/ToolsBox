import { createWindowRuntime } from "./window-runtime.js";

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
}) {
  const runtime = createWindowRuntime({ windows });

  async function start() {
    if (!runtime.canStart()) {
      return;
    }
    runtime.markStarting();

    await waitForHostReady(zotero, logger);
    settings.ensureDefaults();
    applySettings();

    const mainWindows = host.listMainWindows();
    mainWindows.forEach((window) => {
      host.insertFTLIfNeeded(window, "main.ftl");
    });

    const stopObservingPrefs = settings.onChange(onSettingsChange);
    lifecycle.trackCleanup(stopObservingPrefs);

    if (typeof startServices === "function") {
      await startServices();
    }

    await registerBaselineFeatures();
    windows.loadAll(mainWindows);
    runtime.markRunning();
    logger.info("plugin.start", { addonName });

    lifecycle.trackCleanup(() => {
      logger.info("plugin.cleanup");
    });
  }

  async function shutdown() {
    if (!runtime.canStop()) {
      return;
    }
    runtime.markStopping();

    if (typeof stopServices === "function") {
      await stopServices();
    }

    runtime.resetWindows();
    lifecycle.reset();
    runtime.markIdle();
    logger.info("plugin.stop");
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
  };
}
