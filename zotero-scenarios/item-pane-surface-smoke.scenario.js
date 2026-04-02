registerZoteroScenario("library item pane surface smoke", async ({ assert, addonConfig, helpers }) => {
  const item = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Host Action Item Pane Smoke",
    },
  });
  const paneID = `${addonConfig.addonRef}-details`;

  await helpers.selectItem(item.id);

  const result = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("itemPane.selectPane", {
      paneID,
      behavior: "instant",
    }),
  );

  assert.equal(result.actionId, "itemPane.selectPane");
  assert.equal(result.ok, true);
  assert.equal(result.readiness.ok, true);
  assert.equal(result.observedState.paneID, paneID);
  assert.equal(result.observedState.visible, true);
  assert.equal(result.surfaceEvidenceTargets.length, 1);

  return {
    itemID: item.id,
    paneID,
    ...result,
  };
});
