registerZoteroScenario("live menu surface smoke", async ({ assert, addonConfig, helpers }) => {
  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Host Action Menu Smoke",
    },
  });
  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Menu Surface Smoke PDF",
    text: "Menu surface smoke validation",
  });
  const menuID = `${addonConfig.addonRef}-reader-summary`;
  const target = "reader/menubar/view";

  const readerOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.open", {
      itemID: attachment.id,
    }),
  );
  const menuShow = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("menu.show", {
      menuID,
      target,
    }),
  );
  const menuTrigger = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("menu.trigger", {
      menuID,
      target,
    }),
  );

  assert.equal(readerOpen.ok, true);
  assert.equal(menuShow.ok, true);
  assert.equal(menuTrigger.ok, true);
  assert.equal(menuShow.readiness.ok, true);
  assert.equal(menuTrigger.readiness.ok, true);
  assert.equal(menuTrigger.observedState.commandDispatched, true);

  return {
    attachmentID: attachment.id,
    menuID,
    target,
    popupObserved: menuShow.observedState.popupOpen,
    surfaceEvidenceTargets: [
      ...menuShow.surfaceEvidenceTargets,
      ...menuTrigger.surfaceEvidenceTargets,
    ],
  };
});
