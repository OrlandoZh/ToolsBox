registerZoteroScenario("collection menu surface smoke", async ({ assert, addonConfig, helpers, plugin }) => {
  function assertSingleSurfaceEvidenceTarget(result, expectedSurfaceId, captureKindPrefix) {
    assert.equal(result.surfaceEvidenceTargets.length, 1);
    const target = result.surfaceEvidenceTargets[0];
    assert.equal(target.surfaceId, expectedSurfaceId);
    assert.equal(target.scope, "surface-local");
    assert.ok(String(target.captureKind || "").startsWith(captureKindPrefix));
    return target;
  }

  const collection = await helpers.createCollection({
    name: `Collection Menu Smoke ${Date.now()}`,
  });
  const selection = await helpers.selectCollection(collection.id);
  const markerID = `cleanroom-collection-menu-followup-${Date.now()}`;
  const menuID = `${addonConfig.addonRef}-collection-menu-followup-${Date.now()}`;
  const target = "main/library/collection";
  const registeredMenuID = plugin.api.menuManager.registerCollectionMenuItem({
    id: menuID,
    label: "Collection Menu Follow-up",
    onShowing: (_event, context) => {
      context?.setVisible?.(Boolean(context?.collectionTreeRow));
    },
    onCommand: () => {
      const mainWindow = plugin.api.host.getMainWindow();
      mainWindow?.document?.documentElement?.setAttribute("data-cleanroom-collection-menu-followup", markerID);
    },
  });

  helpers.addCleanup(() => {
    if (registeredMenuID) {
      plugin.api.menuManager.unregister(registeredMenuID);
    }
    const mainWindow = plugin.api.host.getMainWindow();
    mainWindow?.document?.documentElement?.removeAttribute?.("data-cleanroom-collection-menu-followup");
  });

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
  const followUpMarker = await helpers.waitFor(
    () => {
      const mainWindow = plugin.api.host.getMainWindow();
      const value = mainWindow?.document?.documentElement?.getAttribute?.("data-cleanroom-collection-menu-followup");
      return value === markerID ? value : null;
    },
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for collection menu follow-up marker '${markerID}'`,
    },
  );

  assert.equal(selection.collectionID, collection.id);
  assert.equal(selection.collectionTreeRowType, "collection");
  assert.equal(menuShow.ok, true);
  assert.equal(menuTrigger.ok, true);
  assert.equal(menuShow.readiness.ok, true);
  assert.equal(menuTrigger.readiness.ok, true);
  assert.equal(menuShow.observedState.targetScene, "collection");
  assert.equal(menuShow.observedState.menuKind, "menuitem");
  assert.equal(menuShow.observedState.collectionTreeRowID, selection.collectionTreeRowID);
  assert.equal(menuShow.observedState.collectionTreeRowType, "collection");
  assert.equal(menuTrigger.observedState.commandDispatched, true);
  assert.equal(followUpMarker, markerID);
  const menuShowTarget = assertSingleSurfaceEvidenceTarget(menuShow, "collection-menu", "surface-menu-");
  const menuTriggerTarget = assertSingleSurfaceEvidenceTarget(menuTrigger, "collection-menu", "surface-menu-");
  assert.equal(menuShowTarget.details?.target, target);
  assert.equal(menuShowTarget.details?.targetScene, "collection");
  assert.ok(["menu-popup", "menu-item"].includes(menuShowTarget.details?.surfaceEvidenceElement));
  assert.equal(menuTriggerTarget.details?.collectionTreeRowID, selection.collectionTreeRowID);
  assert.equal(menuTriggerTarget.details?.collectionTreeRowType, "collection");

  return {
    collectionID: collection.id,
    menuID,
    target,
    followUpMarkerObserved: true,
    surfaceEvidenceTargets: [
      ...menuShow.surfaceEvidenceTargets,
      ...menuTrigger.surfaceEvidenceTargets,
    ],
  };
});
