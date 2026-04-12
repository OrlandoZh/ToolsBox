registerZoteroScenario("item pane DOM contract advisory", async ({ addonConfig, helpers }) => {
  const paneID = `${addonConfig.addonRef}-details`;
  const rootID = `${paneID}-root`;
  let firstItem = null;
  let secondItem = null;
  let firstResult = null;
  let secondResult = null;
  let scenarioError = null;

  function getRootNodes(doc) {
    if (!doc) {
      return [];
    }
    if (typeof doc.querySelectorAll === "function") {
      return Array.from(doc.querySelectorAll(`[id="${rootID}"]`));
    }
    const root = typeof doc.getElementById === "function"
      ? doc.getElementById(rootID)
      : null;
    return root ? [root] : [];
  }

  try {
    firstItem = await helpers.createItem({
      itemType: "report",
      fields: {
        title: "Item Pane DOM Contract Item A",
      },
    });
    secondItem = await helpers.createItem({
      itemType: "report",
      fields: {
        title: "Item Pane DOM Contract Item B",
      },
    });

    await helpers.selectItem(firstItem.id);
    firstResult = helpers.toSurfaceSmokeResult(
      await helpers.runHostAction("itemPane.selectPane", {
        paneID,
        behavior: "instant",
        activationPolicy: "ui-required",
      }),
    );

    await helpers.selectItem(secondItem.id);
    secondResult = helpers.toSurfaceSmokeResult(
      await helpers.runHostAction("itemPane.selectPane", {
        paneID,
        behavior: "instant",
        activationPolicy: "ui-required",
      }),
    );
  } catch (error) {
    scenarioError = String(error?.message || error);
  }

  let mainWindow = null;
  try {
    mainWindow = helpers.getMainWindow();
  } catch {}
  const doc = mainWindow?.document || null;
  const rootNodes = getRootNodes(doc);
  const root = rootNodes[0] || null;
  const domContract = helpers.toDomContractResult({
    routeId: "item-pane",
    adapter: "item-pane",
    checks: [
      helpers.createDomContractCheck("action-postcondition", (
        firstResult?.ok === true
        && firstResult?.readiness?.ok === true
        && secondResult?.ok === true
        && secondResult?.readiness?.ok === true
      ), {
        label: "item pane action replay remains observable across repeated selection",
        note: scenarioError,
      }),
      helpers.createDomContractCheck("plugin-root-present", Boolean(root), {
        label: "item pane plugin-owned root marker is present",
        actual: root ? root.id : null,
        expected: rootID,
      }),
      helpers.createDomContractCheck("plugin-root-unique", rootNodes.length === 1, {
        label: "item pane rerender keeps a single plugin-owned root",
        actual: rootNodes.length,
        expected: 1,
      }),
      helpers.createDomContractCheck("body-owner-document", root?.ownerDocument === doc && Boolean(doc), {
        label: "item pane root uses body.ownerDocument",
      }),
      helpers.createDomContractCheck("plugin-root-connected", root?.isConnected === true, {
        label: "item pane root stays connected after repeated render/select",
      }),
      helpers.createDomContractCheck("plugin-root-marker", root?.dataset?.cleanroomItemPaneRoot === "true", {
        label: "item pane root exposes the plugin-owned marker",
        actual: root?.dataset?.cleanroomItemPaneRoot || null,
        expected: "true",
      }),
      helpers.createDomContractCheck("pane-id-marker", root?.dataset?.cleanroomPaneID === paneID, {
        label: "item pane root keeps the expected pane identifier marker",
        actual: root?.dataset?.cleanroomPaneID || null,
        expected: paneID,
      }),
    ],
    summary: scenarioError
      ? `Item pane DOM contract advisory encountered a collection error: ${scenarioError}`
      : "Item pane DOM contract advisory tracks the plugin-owned root marker, ownerDocument, connectivity, and rerender idempotency without turning the route into a new blocker.",
  });

  return {
    paneID,
    rootID,
    firstItemID: firstItem?.id || null,
    secondItemID: secondItem?.id || null,
    firstActionOK: firstResult?.ok ?? null,
    secondActionOK: secondResult?.ok ?? null,
    domContract,
  };
});
