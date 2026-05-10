registerZoteroScenario("library item pane surface smoke", async ({ assert, addonConfig, helpers }) => {
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

  const item = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Host Action Item Pane Smoke",
    },
  });
  const paneID = `${addonConfig.addonRef}-workflow`;

  await helpers.selectItem(item.id);

  const result = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("itemPane.selectPane", {
      paneID,
      behavior: "instant",
      activationPolicy: "ui-required",
    }),
  );

  assert.equal(result.actionId, "itemPane.selectPane");
  assert.equal(
    result.ok,
    true,
    `itemPane.selectPane failed: ${JSON.stringify(result)}`,
  );
  assert.equal(
    result.readiness.ok,
    true,
    `itemPane.selectPane readiness failed: ${JSON.stringify(result.readiness)}`,
  );
  assert.equal(result.observedState.paneID, paneID);
  assert.equal(result.observedState.visible, true);
  assert.equal(result.observedState.activationPolicy, "ui-required");
  assert.equal(result.observedState.actionElementObserved, true);
  assert.equal(result.observedState.actionDispatched, true);
  assert.ok(["click", "dispatch-click"].includes(result.observedState.activationStrategy));
  const surfaceTarget = assertSingleSurfaceEvidenceTarget(result, "item-pane-sidenav", "surface-item-pane-");
  assert.equal(surfaceTarget.details?.paneID, paneID);
  assertEdgeContract(result, "pane-edge-geometry-ready", "pane-attached");

  return {
    itemID: item.id,
    paneID,
    ...result,
  };
});
