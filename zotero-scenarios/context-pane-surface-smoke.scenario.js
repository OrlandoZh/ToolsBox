registerZoteroScenario("context pane surface smoke", async ({ assert, helpers }) => {
  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Host Action Context Pane Smoke",
    },
  });
  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Context Pane Smoke PDF",
    text: "Context pane smoke validation",
  });

  const readerOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.open", {
      itemID: attachment.id,
    }),
  );
  const contextOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("contextPane.setOpen", {
      open: true,
    }),
  );
  const contextSelect = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("contextPane.selectPane", {
      paneID: "info",
      behavior: "instant",
    }),
  );

  assert.equal(readerOpen.ok, true);
  assert.equal(contextOpen.ok, true);
  assert.equal(contextSelect.ok, true);
  assert.equal(contextOpen.readiness.ok, true);
  assert.equal(contextSelect.readiness.ok, true);
  assert.equal(contextOpen.observedState.open, true);
  assert.equal(contextSelect.observedState.paneID, "info");
  assert.equal(contextSelect.observedState.visible, true);

  return {
    attachmentID: attachment.id,
    contextPaneOpen: contextOpen.observedState.open,
    selectedPaneID: contextSelect.observedState.paneID,
    surfaceEvidenceTargets: [
      ...contextOpen.surfaceEvidenceTargets,
      ...contextSelect.surfaceEvidenceTargets,
    ],
  };
});
