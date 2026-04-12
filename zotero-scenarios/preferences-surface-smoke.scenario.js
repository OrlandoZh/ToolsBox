registerZoteroScenario("preference pane surface smoke", async ({ assert, addonConfig, helpers }) => {
  const PREFERENCE_HOST_WINDOW = Object.freeze({
    windowWidth: 800,
    windowHeight: 600,
  });

  function assertSingleSurfaceEvidenceTarget(result, expectedSurfaceId, captureKindPrefix) {
    assert.equal(result.surfaceEvidenceTargets.length, 1);
    const target = result.surfaceEvidenceTargets[0];
    assert.equal(target.surfaceId, expectedSurfaceId);
    assert.equal(target.scope, "surface-local");
    assert.ok(String(target.captureKind || "").startsWith(captureKindPrefix));
    return target;
  }

  function assertPreferencePaneGeometryHealthy(result, surfaceTarget) {
    const rootClientWidth = Number(result.observedState.rootClientWidth || surfaceTarget.details?.rootClientWidth || 0);
    const layoutMode = String(
      result.observedState.layoutMode
      || surfaceTarget.details?.layoutMode
      || "",
    );
    const hasHorizontalOverflow = result.observedState.hasHorizontalOverflow === true
      || surfaceTarget.details?.hasHorizontalOverflow === true;

    assert.ok(rootClientWidth > 0, `expected rootClientWidth > 0, got ${rootClientWidth}`);
    assert.equal(hasHorizontalOverflow, false, `expected no horizontal overflow, got ${JSON.stringify(result.observedState)}`);
    assert.ok(layoutMode === "inline" || layoutMode === "stacked", `unexpected layoutMode '${layoutMode}'`);

    if (rootClientWidth <= 620) {
      assert.equal(layoutMode, "stacked", `expected stacked layout at width ${rootClientWidth}`);
    }
  }

  const paneID = `${addonConfig.addonRef}-preferences`;
  const actions = helpers.listHostActions();

  assert.ok(actions.some((entry) => entry?.id === "preferences.openPane"));

  const result = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.openPane", {
      paneID,
      ...PREFERENCE_HOST_WINDOW,
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
  assert.equal(surfaceTarget.details?.windowResize?.requestedWidth, 800);
  assert.equal(surfaceTarget.details?.windowResize?.requestedHeight, 600);
  assertPreferencePaneGeometryHealthy(result, surfaceTarget);

  return {
    paneID,
    ...result,
  };
});
