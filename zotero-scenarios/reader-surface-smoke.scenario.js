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

  function hasClassToken(element, token) {
    const className = typeof element?.className === "string"
      ? element.className
      : "";
    return className.split(/\s+/u).includes(token);
  }

  function resolveToolbarAnchor(doc) {
    return doc?.querySelector?.(
      "#sidebarToggleButton, #viewsManagerToggleButton, #sidebarToggle, .toolbar .sidebar-toggle",
    ) || null;
  }

  function readSidebarOpenSignal(frameWindow) {
    const doc = frameWindow?.document || null;
    const outerContainer = doc?.querySelector?.("#outerContainer") || null;
    const toggleButton = resolveToolbarAnchor(doc);
    const containerClassName = typeof outerContainer?.className === "string"
      ? outerContainer.className
      : "";
    const bodyClassName = typeof doc?.body?.className === "string"
      ? doc.body.className
      : "";
    const toggleClassName = typeof toggleButton?.className === "string"
      ? toggleButton.className
      : "";
    const toggleExpanded = String(toggleButton?.getAttribute?.("aria-expanded") || "").toLowerCase() === "true";
    return hasClassToken(outerContainer, "sidebarOpen")
      || hasClassToken(outerContainer, "viewsManagerOpen")
      || hasClassToken(doc?.body, "sidebar-open")
      || hasClassToken(toggleButton, "toggled")
      || hasClassToken(toggleButton, "active")
      || toggleExpanded
      ? {
        bodyClassName,
        containerClassName,
        toggleClassName,
        toggleExpanded,
      }
      : null;
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
  const toolbarMarkerID = `cleanroom-reader-dom-contract-marker-${Date.now()}`;

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
          marker.id = toolbarMarkerID;
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
  const frameWindow = plugin.api.reader.getReaderFrameWindow(attachment.id);
  const frameDocument = frameWindow?.document || null;
  const toolbarAnchor = await helpers.waitFor(
    () => resolveToolbarAnchor(frameDocument),
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for reader toolbar anchor ${toolbarSidebarToggleSelector} for item #${attachment.id}`,
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
  const toolbarAnchorAfterReplay = resolveToolbarAnchor(frameDocument);
  const sidebarOpenSignal = await helpers.waitFor(
    () => readSidebarOpenSignal(plugin.api.reader.getReaderFrameWindow(attachment.id)),
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
  const domContract = helpers.toDomContractResult({
    routeId: "reader",
    adapter: "reader",
    checks: [
      helpers.createDomContractCheck("event-doc-observed", toolbarHook.hasDoc === true, {
        label: "renderToolbar hook receives event.doc",
      }),
      helpers.createDomContractCheck("append-available", toolbarHook.hasAppend === true, {
        label: "renderToolbar hook receives append()",
      }),
      helpers.createDomContractCheck("append-postcondition", toolbarHook.appended === true && toolbarHook.appendError === null, {
        label: "renderToolbar append() succeeds without error",
      }),
      helpers.createDomContractCheck("toolbar-anchor-present", Boolean(toolbarAnchor), {
        label: "reader toolbar host anchor is observable in the reader frame document",
        actual: toolbarAnchor ? toolbarSidebarToggleSelector : null,
        expected: toolbarSidebarToggleSelector,
      }),
      helpers.createDomContractCheck("toolbar-anchor-owner-document", toolbarAnchor?.ownerDocument === frameDocument && Boolean(frameDocument), {
        label: "reader toolbar host anchor uses the reader frame document",
      }),
      helpers.createDomContractCheck("toolbar-anchor-connected", toolbarAnchorAfterReplay?.isConnected === true, {
        label: "reader toolbar host anchor stays connected after action replay",
      }),
      helpers.createDomContractCheck("sidebar-postcondition", sidebarSelect.observedState.sidebarView === "thumbnails", {
        label: "reader sidebar postcondition is observable after action replay",
        actual: sidebarSelect.observedState.sidebarView,
        expected: "thumbnails",
      }),
    ],
    summary: "Reader DOM contract tracks event.doc, append() success, a stable toolbar host anchor in the frame document, and the sidebar postcondition after live action replay; append visibility is verified in the fine-grained hook route.",
  });

  return {
    attachmentID: attachment.id,
    sidebarView: sidebarSelect.observedState.sidebarView,
    sidebarOpenSignal,
    toolbarObserved: true,
    toolbarHook,
    toolbarAnchorSelector: toolbarSidebarToggleSelector,
    toolbarMarkerID,
    surfaceEvidenceTargets: [
      ...toolbarTrigger.surfaceEvidenceTargets,
      ...sidebarSelect.surfaceEvidenceTargets,
    ],
    domContract,
  };
});
