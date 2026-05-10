registerZoteroScenario("profiler diagnostics", async ({ assert, addonConfig, helpers, plugin }) => {
  const PREFERENCE_HOST_WINDOW = Object.freeze({
    windowWidth: 800,
    windowHeight: 600,
  });

  function nowMs() {
    if (typeof globalThis?.performance?.now === "function") {
      return globalThis.performance.now();
    }
    return Date.now();
  }

  function getProfilerDurationMs() {
    const value = Number(addonConfig?.cleanroomScenarioOptions?.profilerDurationMs || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  async function delay(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function getActiveExtensionRoots() {
    try {
      const imported = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
      const addons = await imported.AddonManager.getAllAddons();
      return addons
        .filter((addon) => addon?.type === "extension" && addon?.isActive)
        .map((addon) => {
          try {
            return addon.getResourceURI().spec;
          }
          catch {
            return null;
          }
        })
        .filter(Boolean);
    }
    catch {
      return [];
    }
  }

  function buildCurrentPluginKeys() {
    return Array.from(new Set([
      addonConfig.addonId,
      addonConfig.addonRef,
      addonConfig.instanceKey,
      addonConfig.addonRef ? `chrome://${addonConfig.addonRef}/` : null,
      addonConfig.addonRef ? `resource://${addonConfig.addonRef}/` : null,
      plugin?.data?.rootURI,
      plugin?.data?.config?.addonRef ? `chrome://${plugin.data.config.addonRef}/` : null,
    ].filter(Boolean)));
  }

  async function startProfiler() {
    if (!Services?.profiler?.StartProfiler) {
      throw new Error("Services.profiler.StartProfiler is unavailable");
    }
    const activeTabID = Zotero.getMainWindow()?.browsingContext?.browserId || 0;
    const requestedFeatures = ["js", "stackwalk", "cpu", "responsiveness", "processcpu"];
    const availableFeatures = typeof Services.profiler.GetFeatures === "function"
      ? Array.from(Services.profiler.GetFeatures())
      : [];
    const features = availableFeatures.length > 0
      ? requestedFeatures.filter((feature) => availableFeatures.includes(feature))
      : requestedFeatures;
    await Services.profiler.StartProfiler(
      50000,
      1,
      features,
      ["GeckoMain"],
      activeTabID,
      0,
    );
  }

  async function stopProfiler() {
    try {
      if (!Services?.profiler?.getProfileDataAsync) {
        throw new Error("Services.profiler.getProfileDataAsync is unavailable");
      }
      const profileData = await Services.profiler.getProfileDataAsync();
      return {
        ok: true,
        profileData,
      };
    }
    catch (error) {
      return {
        ok: false,
        error: {
          message: String(error?.message || error),
          stack: String(error?.stack || ""),
        },
      };
    }
    finally {
      try {
        if (Services?.profiler?.StopProfiler) {
          await Services.profiler.StopProfiler();
        }
      }
      catch {
        // Advisory profiler diagnostics should not fail scenario cleanup.
      }
    }
  }

  async function measureProfiledHostAction(actionId, payload, verify) {
    const activity = {
      actionId,
      label: actionId,
      durationMs: 0,
      ready: false,
      surfaceId: null,
      captureKind: null,
      profile: {
        ok: false,
        error: null,
        profileData: null,
      },
    };
    let profilerStarted = false;
    const startedAt = nowMs();

    try {
      await startProfiler();
      profilerStarted = true;
    }
    catch (error) {
      activity.profile = {
        ok: false,
        error: {
          message: String(error?.message || error),
          stack: String(error?.stack || ""),
        },
        profileData: null,
      };
    }

    try {
      const result = helpers.toSurfaceSmokeResult(
        await helpers.runHostAction(actionId, payload),
      );
      activity.durationMs = Math.max(0, Math.round(nowMs() - startedAt));
      assert.equal(result.ok, true, `${actionId} failed: ${JSON.stringify(result)}`);
      assert.equal(result.readiness.ok, true, `${actionId} readiness failed: ${JSON.stringify(result.readiness)}`);
      if (typeof verify === "function") {
        verify(result);
      }

      const surfaceTarget = Array.isArray(result.surfaceEvidenceTargets) && result.surfaceEvidenceTargets.length > 0
        ? result.surfaceEvidenceTargets[0]
        : null;
      activity.ready = result.readiness.ok;
      activity.surfaceId = surfaceTarget?.surfaceId || null;
      activity.captureKind = surfaceTarget?.captureKind || null;
    }
    finally {
      const minimumDurationMs = getProfilerDurationMs();
      const elapsedMs = Math.max(0, Math.round(nowMs() - startedAt));
      if (profilerStarted && minimumDurationMs > elapsedMs) {
        await delay(minimumDurationMs - elapsedMs);
      }
      if (profilerStarted && !activity.profile.error) {
        activity.profile = await stopProfiler();
      }
      else if (profilerStarted) {
        await stopProfiler();
      }
      activity.durationMs = activity.durationMs || Math.max(0, Math.round(nowMs() - startedAt));
    }

    return activity;
  }

  const item = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Profiler Diagnostics Item Pane Smoke",
    },
  });
  await helpers.selectItem(item.id);

  const itemPaneActivity = await measureProfiledHostAction(
    "itemPane.selectPane",
    {
      paneID: `${addonConfig.addonRef}-workflow`,
      behavior: "instant",
      activationPolicy: "ui-required",
    },
    (result) => {
      assert.equal(result.observedState.visible, true);
    },
  );

  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Profiler Diagnostics Reader Smoke",
    },
  });
  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Profiler Diagnostics PDF",
    text: "Profiler diagnostics smoke validation",
  });

  const readerOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.open", {
      itemID: attachment.id,
    }),
  );
  assert.equal(readerOpen.ok, true, `reader.open failed: ${JSON.stringify(readerOpen)}`);

  const contextOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("contextPane.setOpen", {
      open: true,
    }),
  );
  assert.equal(contextOpen.ok, true, `contextPane.setOpen failed: ${JSON.stringify(contextOpen)}`);

  const contextPaneActivity = await measureProfiledHostAction(
    "contextPane.selectPane",
    {
      paneID: "info",
      behavior: "instant",
      activationPolicy: "ui-required",
    },
    (result) => {
      assert.equal(result.observedState.paneID, "info");
      assert.equal(result.observedState.visible, true);
    },
  );

  const toolbarTrigger = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.toolbar.triggerButton", {
      itemID: attachment.id,
      selector: "#sidebarToggleButton",
    }),
  );
  assert.equal(toolbarTrigger.ok, true, `reader.toolbar.triggerButton failed: ${JSON.stringify(toolbarTrigger)}`);
  await helpers.waitFor(
    () => {
      const frameWindow = plugin.api.reader.getReaderFrameWindow(attachment.id);
      const outerContainer = frameWindow?.document?.querySelector?.("#outerContainer") || null;
      const toggleButton = frameWindow?.document?.querySelector?.("#sidebarToggleButton") || null;
      const containerClassName = typeof outerContainer?.className === "string"
        ? outerContainer.className
        : "";
      const toggleClassName = typeof toggleButton?.className === "string"
        ? toggleButton.className
        : "";
      return containerClassName.split(/\s+/u).includes("sidebarOpen")
        || toggleClassName.split(/\s+/u).includes("toggled");
    },
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for reader sidebar open signal for item #${attachment.id}`,
    },
  );

  const readerSidebarActivity = await measureProfiledHostAction(
    "reader.sidebar.selectView",
    {
      itemID: attachment.id,
      view: "thumbnails",
      activationPolicy: "ui-required",
    },
    (result) => {
      assert.equal(result.observedState.sidebarView, "thumbnails");
    },
  );

  const preferenceActivity = await measureProfiledHostAction(
    "preferences.openPane",
    {
      paneID: `${addonConfig.addonRef}-preferences`,
      ...PREFERENCE_HOST_WINDOW,
    },
    (result) => {
      assert.equal(result.observedState.selectedPaneID, `${addonConfig.addonRef}-preferences`);
      assert.equal(result.observedState.hasHorizontalOverflow, false);
    },
  );

  return {
    profileContext: {
      addonId: addonConfig.addonId,
      addonRef: addonConfig.addonRef,
      instanceKey: addonConfig.instanceKey,
      currentPluginKeys: buildCurrentPluginKeys(),
      activeExtensionRoots: await getActiveExtensionRoots(),
    },
    activities: [
      itemPaneActivity,
      contextPaneActivity,
      readerSidebarActivity,
      preferenceActivity,
    ],
  };
});

registerZoteroScenario("profiler extended diagnostics", async ({ assert, addonConfig, helpers, plugin }) => {
  function nowMs() {
    if (typeof globalThis?.performance?.now === "function") {
      return globalThis.performance.now();
    }
    return Date.now();
  }

  function getProfilerDurationMs() {
    const value = Number(addonConfig?.cleanroomScenarioOptions?.profilerDurationMs || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  async function delay(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function getActiveExtensionRoots() {
    try {
      const imported = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
      const addons = await imported.AddonManager.getAllAddons();
      return addons
        .filter((addon) => addon?.type === "extension" && addon?.isActive)
        .map((addon) => {
          try {
            return addon.getResourceURI().spec;
          }
          catch {
            return null;
          }
        })
        .filter(Boolean);
    }
    catch {
      return [];
    }
  }

  function buildCurrentPluginKeys() {
    return Array.from(new Set([
      addonConfig.addonId,
      addonConfig.addonRef,
      addonConfig.instanceKey,
      addonConfig.addonRef ? `chrome://${addonConfig.addonRef}/` : null,
      addonConfig.addonRef ? `resource://${addonConfig.addonRef}/` : null,
      plugin?.data?.rootURI,
      plugin?.data?.config?.addonRef ? `chrome://${plugin.data.config.addonRef}/` : null,
    ].filter(Boolean)));
  }

  async function startProfiler() {
    if (!Services?.profiler?.StartProfiler) {
      throw new Error("Services.profiler.StartProfiler is unavailable");
    }
    const activeTabID = Zotero.getMainWindow()?.browsingContext?.browserId || 0;
    const requestedFeatures = ["js", "stackwalk", "cpu", "responsiveness", "processcpu"];
    const availableFeatures = typeof Services.profiler.GetFeatures === "function"
      ? Array.from(Services.profiler.GetFeatures())
      : [];
    const features = availableFeatures.length > 0
      ? requestedFeatures.filter((feature) => availableFeatures.includes(feature))
      : requestedFeatures;
    await Services.profiler.StartProfiler(50000, 1, features, ["GeckoMain"], activeTabID, 0);
  }

  async function stopProfiler() {
    try {
      if (!Services?.profiler?.getProfileDataAsync) {
        throw new Error("Services.profiler.getProfileDataAsync is unavailable");
      }
      return {
        ok: true,
        profileData: await Services.profiler.getProfileDataAsync(),
      };
    }
    catch (error) {
      return {
        ok: false,
        error: {
          message: String(error?.message || error),
          stack: String(error?.stack || ""),
        },
      };
    }
    finally {
      try {
        if (Services?.profiler?.StopProfiler) {
          await Services.profiler.StopProfiler();
        }
      }
      catch {
        // Advisory profiler diagnostics should not fail scenario cleanup.
      }
    }
  }

  async function measureProfiledActivity(actionId, label, runActivity) {
    const startedAt = nowMs();
    const activity = {
      actionId,
      label,
      durationMs: 0,
      ready: false,
      surfaceId: null,
      captureKind: null,
      profile: {
        ok: false,
        error: null,
        profileData: null,
      },
    };
    let profilerStarted = false;

    try {
      await startProfiler();
      profilerStarted = true;
    }
    catch (error) {
      activity.profile = {
        ok: false,
        error: {
          message: String(error?.message || error),
          stack: String(error?.stack || ""),
        },
        profileData: null,
      };
    }

    try {
      const surfaceResult = await runActivity();
      if (surfaceResult) {
        const result = helpers.toSurfaceSmokeResult(surfaceResult);
        assert.equal(result.ok, true, `${actionId} failed: ${JSON.stringify(result)}`);
        assert.equal(result.readiness.ok, true, `${actionId} readiness failed: ${JSON.stringify(result.readiness)}`);
        const surfaceTarget = Array.isArray(result.surfaceEvidenceTargets) && result.surfaceEvidenceTargets.length > 0
          ? result.surfaceEvidenceTargets[0]
          : null;
        activity.ready = result.readiness.ok;
        activity.surfaceId = surfaceTarget?.surfaceId || null;
        activity.captureKind = surfaceTarget?.captureKind || null;
      }
      else {
        activity.ready = true;
      }
    }
    finally {
      const minimumDurationMs = getProfilerDurationMs();
      const elapsedMs = Math.max(0, Math.round(nowMs() - startedAt));
      if (profilerStarted && minimumDurationMs > elapsedMs) {
        await delay(minimumDurationMs - elapsedMs);
      }
      if (profilerStarted && !activity.profile.error) {
        activity.profile = await stopProfiler();
      }
      else if (profilerStarted) {
        await stopProfiler();
      }
      activity.durationMs = Math.max(0, Math.round(nowMs() - startedAt));
    }

    return activity;
  }

  const batchItems = [];
  for (let index = 0; index < 8; index += 1) {
    batchItems.push(await helpers.createItem({
      itemType: "report",
      fields: {
        title: `Profiler Extended Batch Item ${index + 1}`,
      },
    }));
  }

  const batchSelectionActivity = await measureProfiledActivity(
    "batch.itemSelection.cycle",
    "Batch Item Selection Cycle",
    async () => {
      for (const item of batchItems) {
        await helpers.selectItem(item.id);
      }
      return await helpers.runHostAction("itemPane.selectPane", {
        paneID: `${addonConfig.addonRef}-workflow`,
        behavior: "instant",
        activationPolicy: "ui-required",
      });
    },
  );

  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Profiler Extended Reader Smoke",
    },
  });
  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Profiler Extended PDF",
    text: Array.from({ length: 20 }, (_, index) => `Profiler extended diagnostics paragraph ${index + 1}.`).join("\n\n"),
  });

  const readerOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.open", {
      itemID: attachment.id,
    }),
  );
  assert.equal(readerOpen.ok, true, `reader.open failed: ${JSON.stringify(readerOpen)}`);

  const toolbarTrigger = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.toolbar.triggerButton", {
      itemID: attachment.id,
      selector: "#sidebarToggleButton",
    }),
  );
  assert.equal(toolbarTrigger.ok, true, `reader.toolbar.triggerButton failed: ${JSON.stringify(toolbarTrigger)}`);

  const readerSidebarCycleActivity = await measureProfiledActivity(
    "reader.sidebar.viewCycle",
    "Reader Sidebar View Cycle",
    async () => {
      await helpers.runHostAction("reader.sidebar.selectView", {
        itemID: attachment.id,
        view: "annotations",
        activationPolicy: "ui-required",
      });
      return await helpers.runHostAction("reader.sidebar.selectView", {
        itemID: attachment.id,
        view: "thumbnails",
        activationPolicy: "ui-required",
      });
    },
  );

  return {
    profileContext: {
      addonId: addonConfig.addonId,
      addonRef: addonConfig.addonRef,
      instanceKey: addonConfig.instanceKey,
      currentPluginKeys: buildCurrentPluginKeys(),
      activeExtensionRoots: await getActiveExtensionRoots(),
    },
    workload: {
      kind: "extended",
      batchItemCount: batchItems.length,
      readerTextParagraphCount: 20,
      readerSidebarViews: ["annotations", "thumbnails"],
    },
    activities: [
      batchSelectionActivity,
      readerSidebarCycleActivity,
    ],
  };
});
