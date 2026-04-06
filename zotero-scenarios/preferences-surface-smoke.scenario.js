registerZoteroScenario("preference pane surface smoke", async ({ assert, addonConfig, helpers }) => {
  function assertSingleSurfaceEvidenceTarget(result, expectedSurfaceId, captureKindPrefix) {
    assert.equal(result.surfaceEvidenceTargets.length, 1);
    const target = result.surfaceEvidenceTargets[0];
    assert.equal(target.surfaceId, expectedSurfaceId);
    assert.equal(target.scope, "surface-local");
    assert.ok(String(target.captureKind || "").startsWith(captureKindPrefix));
    return target;
  }

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
  const surfaceTarget = assertSingleSurfaceEvidenceTarget(result, "preference-pane", "surface-preference-");
  assert.equal(surfaceTarget.details?.paneID, paneID);
  assert.equal(surfaceTarget.details?.geometrySettled, true);
  assert.ok(Number(surfaceTarget.details?.surfaceGeometry?.width || 0) > 0);
  assert.ok(Number(surfaceTarget.details?.surfaceGeometry?.height || 0) > 0);

  return {
    paneID,
    ...result,
  };
});
