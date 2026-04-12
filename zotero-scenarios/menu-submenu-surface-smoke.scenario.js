registerZoteroScenario("menu submenu surface smoke", async ({ assert, addonConfig, helpers, plugin }) => {
  function assertSingleSurfaceEvidenceTarget(result, expectedSurfaceId, captureKindPrefix) {
    assert.equal(result.surfaceEvidenceTargets.length, 1);
    const target = result.surfaceEvidenceTargets[0];
    assert.equal(target.surfaceId, expectedSurfaceId);
    assert.equal(target.scope, "surface-local");
    assert.ok(String(target.captureKind || "").startsWith(captureKindPrefix));
    return target;
  }

  const collection = await helpers.createCollection({
    name: `Menu Submenu Smoke ${Date.now()}`,
  });
  const selection = await helpers.selectCollection(collection.id);

  const markerID = `cleanroom-menu-submenu-followup-${Date.now()}`;
  const menuID = `${addonConfig.addonRef}-menu-submenu-followup-${Date.now()}`;
  const target = plugin.api.menuManager.MENU_TARGETS.LIBRARY_COLLECTION;
  const registeredMenuID = plugin.api.menuManager.registerStateDrivenMenu({
    id: menuID,
    target,
    baseMenu: {
      menuType: plugin.api.menuManager.MENU_TYPES.SUBMENU,
      label: "Collection Actions",
      menus: [{
        menuType: plugin.api.menuManager.MENU_TYPES.MENUITEM,
        label: "Placeholder",
      }],
    },
    resolveState: (context = {}) => ({
      hasCollectionSelection: Boolean(context?.collectionTreeRow),
      collectionTreeRowID: context?.collectionTreeRow?.id ?? context?.collectionTreeRow?.ref ?? null,
      collectionTreeRowType: context?.collectionTreeRow?.type ?? null,
    }),
    buildMenu({ state }) {
      return {
        label: "Collection Actions",
        visible: state.hasCollectionSelection,
        menus: [
          {
            menuType: plugin.api.menuManager.MENU_TYPES.MENUITEM,
            label: "Rebuild Collection Index",
            onCommand: () => {
              const mainWindow = plugin.api.host.getMainWindow();
              mainWindow?.document?.documentElement?.setAttribute("data-cleanroom-menu-submenu-followup", markerID);
            },
          },
          {
            menuType: plugin.api.menuManager.MENU_TYPES.MENUITEM,
            label: `Inspect ${state.collectionTreeRowType || "selection"}`,
          },
        ],
      };
    },
  });

  helpers.addCleanup(() => {
    if (registeredMenuID) {
      plugin.api.menuManager.unregister(registeredMenuID);
    }
    const mainWindow = plugin.api.host.getMainWindow();
    mainWindow?.document?.documentElement?.removeAttribute?.("data-cleanroom-menu-submenu-followup");
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
      menuPath: "0.0",
    }),
  );
  const followUpMarker = await helpers.waitFor(
    () => {
      const mainWindow = plugin.api.host.getMainWindow();
      const value = mainWindow?.document?.documentElement?.getAttribute?.("data-cleanroom-menu-submenu-followup");
      return value === markerID ? value : null;
    },
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for menu submenu follow-up marker '${markerID}'`,
    },
  );

  assert.equal(menuShow.ok, true);
  assert.equal(menuTrigger.ok, true);
  assert.equal(menuShow.readiness.ok, true);
  assert.equal(menuTrigger.readiness.ok, true);
  assert.equal(menuShow.observedState.menuKind, "submenu");
  assert.equal(menuShow.observedState.menuPath, "0");
  assert.equal(menuShow.observedState.menuPathDepth, 1);
  assert.equal(menuTrigger.observedState.menuKind, "submenu");
  assert.equal(menuTrigger.observedState.menuPath, "0.0");
  assert.equal(menuTrigger.observedState.menuPathDepth, 2);
  assert.equal(menuTrigger.observedState.collectionTreeRowID, selection.collectionTreeRowID);
  assert.equal(menuTrigger.observedState.commandDispatched, true);
  assert.equal(followUpMarker, markerID);
  const menuShowTarget = assertSingleSurfaceEvidenceTarget(menuShow, "menu-submenu", "surface-menu-");
  const menuTriggerTarget = assertSingleSurfaceEvidenceTarget(menuTrigger, "menu-submenu", "surface-menu-");
  assert.equal(menuShowTarget.details?.targetScene, "collection");
  assert.equal(menuShowTarget.details?.menuKind, "submenu");
  assert.ok(["menu-submenu", "menu-submenu-popup"].includes(menuShowTarget.details?.surfaceEvidenceElement));
  assert.equal(menuTriggerTarget.details?.menuPath, "0.0");
  assert.equal(menuTriggerTarget.details?.menuPathDepth, 2);
  assert.ok(["menu-submenu", "menu-submenu-popup"].includes(menuTriggerTarget.details?.surfaceEvidenceElement));

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
