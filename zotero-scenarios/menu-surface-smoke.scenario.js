registerZoteroScenario("live menu surface smoke", async ({ assert, addonConfig, helpers, plugin }) => {
  function assertSingleSurfaceEvidenceTarget(result, expectedSurfaceId, captureKindPrefix) {
    assert.equal(result.surfaceEvidenceTargets.length, 1);
    const target = result.surfaceEvidenceTargets[0];
    assert.equal(target.surfaceId, expectedSurfaceId);
    assert.equal(target.scope, "surface-local");
    assert.ok(String(target.captureKind || "").startsWith(captureKindPrefix));
    return target;
  }

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
  const markerID = `cleanroom-menu-followup-${Date.now()}`;
  const menuID = `${addonConfig.addonRef}-scenario-menu-followup-${Date.now()}`;
  const target = "reader/menubar/view";
  const registeredMenuID = plugin.api.menuManager.registerReaderMenubarViewMenuItem({
    id: menuID,
    label: "Scenario Menu Follow-up",
    onShowing: (_event, context) => {
      context?.setVisible?.(true);
    },
    onCommand: () => {
      const mainWindow = plugin.api.host.getMainWindow();
      mainWindow?.document?.documentElement?.setAttribute("data-cleanroom-menu-followup", markerID);
    },
  });
  helpers.addCleanup(() => {
    if (registeredMenuID) {
      plugin.api.menuManager.unregister(registeredMenuID);
    }
    const mainWindow = plugin.api.host.getMainWindow();
    mainWindow?.document?.documentElement?.removeAttribute?.("data-cleanroom-menu-followup");
  });

  const readerOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.open", {
      itemID: attachment.id,
    }),
  );
  const menuShow = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("menu.show", {
      menuID,
      target,
      reader: plugin.api.reader.getByItemID(attachment.id),
    }),
  );
  const menuTrigger = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("menu.trigger", {
      menuID,
      target,
      reader: plugin.api.reader.getByItemID(attachment.id),
    }),
  );
  const followUpMarker = await helpers.waitFor(
    () => {
      const mainWindow = plugin.api.host.getMainWindow();
      const value = mainWindow?.document?.documentElement?.getAttribute?.("data-cleanroom-menu-followup");
      return value === markerID ? value : null;
    },
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for menu follow-up marker '${markerID}'`,
    },
  );

  assert.equal(readerOpen.ok, true);
  assert.equal(menuShow.ok, true);
  assert.equal(menuTrigger.ok, true);
  assert.equal(menuShow.readiness.ok, true);
  assert.equal(menuTrigger.readiness.ok, true);
  assert.equal(menuTrigger.observedState.commandDispatched, true);
  assert.equal(menuTrigger.observedState.actionElementObserved, true);
  assert.equal(menuTrigger.observedState.actionDispatched, true);
  assert.equal(menuTrigger.observedState.activationStrategy, "command");
  assert.equal(menuTrigger.observedState.popupHidden, true);
  assert.equal(followUpMarker, markerID);
  const menuShowTarget = assertSingleSurfaceEvidenceTarget(menuShow, "menu-item", "surface-menu-");
  const menuTriggerTarget = assertSingleSurfaceEvidenceTarget(menuTrigger, "menu-item", "surface-menu-");
  assert.equal(menuShowTarget.details?.menuID, menuID);
  assert.equal(menuShowTarget.details?.target, target);
  assert.ok(["menu-popup", "menu-item"].includes(menuShowTarget.details?.surfaceEvidenceElement));
  assert.equal(menuTriggerTarget.details?.menuID, menuID);
  assert.equal(menuTriggerTarget.details?.target, target);

  return {
    attachmentID: attachment.id,
    menuID,
    target,
    popupObserved: menuShow.observedState.popupOpen,
    followUpMarkerObserved: true,
    surfaceEvidenceTargets: [
      ...menuShow.surfaceEvidenceTargets,
      ...menuTrigger.surfaceEvidenceTargets,
    ],
  };
});
