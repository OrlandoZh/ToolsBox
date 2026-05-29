registerZoteroScenario("library item menu surface smoke", async ({ assert, addonConfig, helpers, plugin }) => {
  function assertSingleSurfaceEvidenceTarget(result, expectedSurfaceId, captureKindPrefix) {
    assert.equal(result.surfaceEvidenceTargets.length, 1);
    const target = result.surfaceEvidenceTargets[0];
    assert.equal(target.surfaceId, expectedSurfaceId);
    assert.equal(target.scope, "surface-local");
    assert.ok(String(target.captureKind || "").startsWith(captureKindPrefix));
    return target;
  }

  const item = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Library Item Menu Smoke",
    },
  });
  const selection = await helpers.selectItem(item.id);
  const markerID = `cleanroom-item-menu-followup-${Date.now()}`;
  const menuID = `${addonConfig.addonRef}-item-menu-followup-${Date.now()}`;
  const target = "main/library/item";
  const registeredMenuID = plugin.api.menuManager.registerItemMenuItem({
    id: menuID,
    l10nID: "cleanroom-menu-label",
    onShowing: (_event, context) => {
      const items = Array.isArray(context?.items) ? context.items : [];
      context?.setVisible?.(items.some((entry) => Number(entry?.id) === Number(item.id)));
    },
    onCommand: (_event, context) => {
      const mainWindow = plugin.api.host.getMainWindow();
      const items = Array.isArray(context?.items) ? context.items : [];
      mainWindow?.document?.documentElement?.setAttribute("data-cleanroom-item-menu-followup", markerID);
      mainWindow?.document?.documentElement?.setAttribute("data-cleanroom-item-menu-count", String(items.length));
    },
  });

  helpers.addCleanup(() => {
    if (registeredMenuID) {
      plugin.api.menuManager.unregister(registeredMenuID);
    }
    const mainWindow = plugin.api.host.getMainWindow();
    mainWindow?.document?.documentElement?.removeAttribute?.("data-cleanroom-item-menu-followup");
    mainWindow?.document?.documentElement?.removeAttribute?.("data-cleanroom-item-menu-count");
  });

  const menuTrigger = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("menu.trigger", {
      menuID,
      target,
      timeoutMs: 3000,
    }),
  );
  const followUpMarker = await helpers.waitFor(
    () => {
      const mainWindow = plugin.api.host.getMainWindow();
      const value = mainWindow?.document?.documentElement?.getAttribute?.("data-cleanroom-item-menu-followup");
      return value === markerID ? value : null;
    },
    {
      timeoutMs: 3000,
      intervalMs: 100,
      message: `Timed out waiting for item menu follow-up marker '${markerID}'`,
    },
  );

  assert.equal(selection.selectionSingleItem, true);
  assert.deepEqual(selection.selectedIDs, [item.id]);
  assert.equal(menuTrigger.ok, true);
  assert.equal(menuTrigger.readiness.ok, true);
  assert.equal(menuTrigger.observedState.targetScene, "item");
  assert.equal(menuTrigger.observedState.menuKind, "menuitem");
  assert.equal(menuTrigger.observedState.itemCount, 1);
  assert.equal(menuTrigger.observedState.popupOpen, true);
  assert.equal(menuTrigger.observedState.commandDispatched, true);
  const menuLabel = String(menuTrigger.observedState.menuSurface?.label || "").trim();
  assert.ok(menuLabel.length > 0, "Expected item menu label to be rendered");
  assert.ok(menuLabel !== "cleanroom-menu-label", `Expected resolved menu label, got ${menuLabel}`);
  assert.ok(menuLabel.includes("ToolsBox"), `Expected menu label to mention ToolsBox, got ${menuLabel}`);
  assert.equal(followUpMarker, markerID);
  const menuTriggerTarget = assertSingleSurfaceEvidenceTarget(menuTrigger, "menu-item", "surface-menu-");
  assert.equal(menuTriggerTarget.details?.target, target);
  assert.equal(menuTriggerTarget.details?.targetScene, "item");
  assert.ok(["menu-popup", "menu-item"].includes(menuTriggerTarget.details?.surfaceEvidenceElement));

  return {
    itemID: item.id,
    menuID,
    target,
    followUpMarkerObserved: true,
    menuLabel,
    surfaceEvidenceTargets: [
      ...menuTrigger.surfaceEvidenceTargets,
    ],
  };
});
