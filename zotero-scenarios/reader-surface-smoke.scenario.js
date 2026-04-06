registerZoteroScenario("reader surface smoke", async ({ assert, helpers, plugin }) => {
  function assertSingleSurfaceEvidenceTarget(result, expectedSurfaceId, captureKindPrefix) {
    assert.equal(result.surfaceEvidenceTargets.length, 1);
    const target = result.surfaceEvidenceTargets[0];
    assert.equal(target.surfaceId, expectedSurfaceId);
    assert.equal(target.scope, "surface-local");
    assert.ok(String(target.captureKind || "").startsWith(captureKindPrefix));
    return target;
  }

  function assertEdgeContract(result, checkName, expectedMode) {
    assert.equal(result.observedState.edgeMode, expectedMode);
    assert.ok(Boolean(result.observedState.boundsSource));
    assert.ok(Number(result.observedState.minimumViableWidth || 0) > 0);
    assert.ok(result.observedState.degradedReason === null || result.observedState.degradedReason === "width-below-minimum");
    assert.ok(Number(result.observedState.bounds?.width || 0) > 0);
    assert.ok(Number(result.observedState.bounds?.height || 0) > 0);
    assert.equal(result.readiness.checks.find((entry) => entry.name === checkName)?.ok, true);
  }

  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Host Action Reader Smoke",
    },
  });
  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Reader Surface Smoke PDF",
    text: "Reader surface smoke validation",
  });
  const toolbarSidebarToggleSelector = "#sidebarToggleButton";
  const toolbarInvocations = [];

  const unregister = plugin.api.reader.registerEventListener(
    plugin.api.reader.READER_EVENT_TYPES.RENDER_TOOLBAR,
    (event) => {
      const doc = event?.doc;
      const record = {
        itemID: Number.isFinite(event?.reader?.itemID) ? event.reader.itemID : null,
        hasDoc: Boolean(doc && typeof doc.createElement === "function"),
        hasAppend: typeof event?.append === "function",
        appended: false,
        appendError: null,
      };
      if (record.hasDoc && record.hasAppend) {
        try {
          const marker = doc.createElement("div");
          marker.dataset.cleanroomSurface = "reader-toolbar";
          marker.hidden = true;
          event.append(marker);
          record.appended = true;
        }
        catch (error) {
          record.appendError = String(error?.message || error);
        }
      }
      toolbarInvocations.push(record);
    },
  );
  helpers.addCleanup(() => {
    if (typeof unregister === "function") {
      unregister();
    }
  });

  const readerOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.open", {
      itemID: attachment.id,
    }),
  );
  const toolbarHook = await helpers.waitFor(
    () => toolbarInvocations.find((entry) => entry.itemID === attachment.id) || null,
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for renderToolbar hook for reader item #${attachment.id}`,
    },
  );
  const toolbarTrigger = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.toolbar.triggerButton", {
      itemID: attachment.id,
      selector: toolbarSidebarToggleSelector,
    }),
  );
  assert.equal(readerOpen.ok, true, "readerOpen.ok");
  assert.ok(Boolean(toolbarHook), "toolbarHook.observed");
  assert.equal(toolbarHook.hasDoc, true, "toolbarHook.hasDoc");
  assert.equal(toolbarHook.hasAppend, true, "toolbarHook.hasAppend");
  assert.equal(toolbarHook.appendError, null, "toolbarHook.appendError");
  assert.equal(toolbarTrigger.ok, true, "toolbarTrigger.ok");
  const sidebarOpenSignal = await helpers.waitFor(
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
        || toggleClassName.split(/\s+/u).includes("toggled")
        ? {
          containerClassName,
          toggleClassName,
        }
        : null;
    },
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for reader sidebar open signal after toolbar action for item #${attachment.id}`,
    },
  );
  const sidebarSelect = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.sidebar.selectView", {
      itemID: attachment.id,
      view: "thumbnails",
      activationPolicy: "ui-required",
    }),
  );

  assert.equal(sidebarSelect.ok, true, "sidebarSelect.ok");
  assert.equal(toolbarTrigger.observedState.actionElementObserved, true);
  assert.equal(toolbarTrigger.observedState.actionDispatched, true);
  assert.ok(["click", "dispatch-click"].includes(toolbarTrigger.observedState.activationStrategy));
  assert.ok(Boolean(sidebarOpenSignal), "readerSidebar.open");
  assert.equal(sidebarSelect.observedState.sidebarView, "thumbnails");
  assert.equal(sidebarSelect.observedState.activationPolicy, "ui-required");
  assert.equal(sidebarSelect.observedState.actionElementObserved, true);
  assert.equal(sidebarSelect.observedState.actionDispatched, true);
  assert.ok(["click", "dispatch-click"].includes(sidebarSelect.observedState.activationStrategy));
  const toolbarTarget = assertSingleSurfaceEvidenceTarget(toolbarTrigger, "render-toolbar", "surface-reader-toolbar-action-");
  const sidebarTarget = assertSingleSurfaceEvidenceTarget(sidebarSelect, "reader-sidebar-view", "surface-reader-sidebar-");
  assert.equal(toolbarTarget.details?.selector, toolbarSidebarToggleSelector);
  assert.equal(sidebarTarget.details?.view, "thumbnails");
  assert.ok(["sidebar-panel", "sidebar-button"].includes(sidebarTarget.details?.surfaceEvidenceElement));
  assertEdgeContract(sidebarSelect, "sidebar-edge-geometry-ready", "sidebar-attached");

  return {
    attachmentID: attachment.id,
    sidebarView: sidebarSelect.observedState.sidebarView,
    sidebarOpenSignal,
    toolbarObserved: true,
    toolbarHook,
    surfaceEvidenceTargets: [
      ...toolbarTrigger.surfaceEvidenceTargets,
      ...sidebarSelect.surfaceEvidenceTargets,
    ],
  };
});
