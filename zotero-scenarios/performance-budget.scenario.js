registerZoteroScenario("performance budget diagnostics", async ({ assert, addonConfig, helpers, plugin }) => {
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

  async function measureHostAction(actionId, payload, verify) {
    const startedAt = nowMs();
    const result = helpers.toSurfaceSmokeResult(
      await helpers.runHostAction(actionId, payload),
    );
    const durationMs = Math.max(0, Math.round(nowMs() - startedAt));

    assert.equal(result.ok, true, `${actionId} failed: ${JSON.stringify(result)}`);
    assert.equal(result.readiness.ok, true, `${actionId} readiness failed: ${JSON.stringify(result.readiness)}`);
    if (typeof verify === "function") {
      verify(result);
    }

    const surfaceTarget = Array.isArray(result.surfaceEvidenceTargets) && result.surfaceEvidenceTargets.length > 0
      ? result.surfaceEvidenceTargets[0]
      : null;
    return {
      actionId,
      label: actionId,
      durationMs,
      ready: result.readiness.ok,
      surfaceId: surfaceTarget?.surfaceId || null,
      captureKind: surfaceTarget?.captureKind || null,
    };
  }

  const item = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Performance Budget Item Pane Smoke",
    },
  });
  await helpers.selectItem(item.id);

  const itemPaneActivity = await measureHostAction(
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
      title: "Performance Budget Reader Smoke",
    },
  });
  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Performance Budget PDF",
    text: "Performance budget smoke validation",
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

  const contextPaneActivity = await measureHostAction(
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

  const readerSidebarActivity = await measureHostAction(
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

  const preferenceActivity = await measureHostAction(
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
    activities: [
      itemPaneActivity,
      contextPaneActivity,
      readerSidebarActivity,
      preferenceActivity,
    ],
  };
});
