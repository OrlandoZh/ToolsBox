registerZoteroScenario("reader surface smoke", async ({ assert, helpers, plugin }) => {
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

  const unregister = plugin.api.reader.registerEventListener(
    plugin.api.reader.READER_EVENT_TYPES.RENDER_TOOLBAR,
    (event) => {
      const doc = event?.doc;
      if (!doc || typeof doc.createElement !== "function" || typeof event?.append !== "function") {
        return;
      }
      if (doc.querySelector("[data-cleanroom-reader-toolbar-marker]")) {
        return;
      }
      const marker = doc.createElement("div");
      marker.dataset.cleanroomReaderToolbarMarker = "true";
      marker.dataset.cleanroomSurface = "reader-toolbar";
      marker.className = "cleanroom-reader-toolbar-marker";
      marker.textContent = "Cleanroom Reader Toolbar Smoke";
      event.append(marker);
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
  const contextOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.contextPane.setOpen", {
      itemID: attachment.id,
      open: true,
    }),
  );
  const sidebarSelect = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.sidebar.selectView", {
      itemID: attachment.id,
      view: "annotations",
    }),
  );

  const toolbarElement = await helpers.waitFor(
    () => plugin.api.reader.findToolbarElement(attachment.id),
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for toolbar surface for reader item #${attachment.id}`,
    },
  );
  const toolbarTarget = plugin.api.host.buildSurfaceTarget({
    surfaceId: "render-toolbar",
    captureKind: `surface-reader-toolbar-${attachment.id}`,
    label: "Reader Toolbar",
    element: toolbarElement,
    window: toolbarElement?.ownerGlobal || toolbarElement?.ownerDocument?.defaultView || null,
    details: {
      itemID: attachment.id,
    },
  });

  assert.equal(readerOpen.ok, true);
  assert.equal(contextOpen.ok, true);
  assert.equal(sidebarSelect.ok, true);
  assert.equal(sidebarSelect.observedState.sidebarView, "annotations");
  assert.ok(Boolean(toolbarTarget?.rect || toolbarTarget?.windowBounds));

  return {
    attachmentID: attachment.id,
    sidebarView: sidebarSelect.observedState.sidebarView,
    contextPaneOpen: contextOpen.observedState.contextPaneOpen,
    toolbarObserved: true,
    surfaceEvidenceTargets: [
      toolbarTarget,
      ...contextOpen.surfaceEvidenceTargets,
      ...sidebarSelect.surfaceEvidenceTargets,
    ],
  };
});
