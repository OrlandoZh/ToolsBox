registerZoteroScenario("preference pane surface smoke", async ({ assert, addonConfig, helpers }) => {
  const paneID = `${addonConfig.addonRef}-preferences`;
  const actions = helpers.listHostActions();

  assert.ok(actions.some((entry) => entry?.id === "preferences.openPane"));

  const result = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.openPane", {
      paneID,
    }),
  );

  assert.equal(result.actionId, "preferences.openPane");
  assert.equal(result.ok, true);
  assert.equal(result.readiness.ok, true);
  assert.equal(result.observedState.selectedPaneID, paneID);
  assert.ok(Number(result.observedState.coreControlCount || 0) > 0);
  assert.equal(result.surfaceEvidenceTargets.length, 1);

  return {
    paneID,
    ...result,
  };
});
