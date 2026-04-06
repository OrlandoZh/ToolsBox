registerZoteroScenario("context pane surface smoke", async ({ assert, helpers }) => {
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

  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Host Action Context Pane Smoke",
    },
  });
  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Context Pane Smoke PDF",
    text: "Context pane smoke validation",
  });

  const readerOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.open", {
      itemID: attachment.id,
    }),
  );
  const contextOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("contextPane.setOpen", {
      open: true,
    }),
  );
  const contextSelect = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("contextPane.selectPane", {
      paneID: "info",
      behavior: "instant",
      activationPolicy: "ui-required",
    }),
  );

  assert.equal(readerOpen.ok, true);
  assert.equal(contextOpen.ok, true);
  assert.equal(contextSelect.ok, true);
  assert.equal(contextOpen.readiness.ok, true);
  assert.equal(contextSelect.readiness.ok, true);
  assert.equal(contextOpen.observedState.open, true);
  assert.equal(contextSelect.observedState.paneID, "info");
  assert.equal(contextSelect.observedState.visible, true);
  assert.equal(contextSelect.observedState.activationPolicy, "ui-required");
  assert.equal(contextSelect.observedState.actionElementObserved, true);
  assert.equal(contextSelect.observedState.actionDispatched, true);
  assert.ok(["click", "dispatch-click"].includes(contextSelect.observedState.activationStrategy));
  const openTarget = assertSingleSurfaceEvidenceTarget(contextOpen, "context-pane", "surface-context-pane");
  const selectTarget = assertSingleSurfaceEvidenceTarget(contextSelect, "context-pane", "surface-context-pane-info");
  assert.equal(selectTarget.details?.paneID, "info");
  assert.ok(["pane-fragment", "pane-button"].includes(selectTarget.details?.surfaceEvidenceElement));
  assertEdgeContract(contextOpen, "context-pane-edge-geometry-ready", "pane-attached");
  assertEdgeContract(contextSelect, "context-pane-edge-geometry-ready", "pane-attached");
  assert.ok(openTarget.details?.tabID === null || typeof openTarget.details?.tabID === "string");

  return {
    attachmentID: attachment.id,
    contextPaneOpen: contextOpen.observedState.open,
    selectedPaneID: contextSelect.observedState.paneID,
    surfaceEvidenceTargets: [
      ...contextOpen.surfaceEvidenceTargets,
      ...contextSelect.surfaceEvidenceTargets,
    ],
  };
});
