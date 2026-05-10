registerZoteroScenario("baseline registration diagnostics", async ({ assert, plugin }) => {
  const details = plugin.api.agent.collectDiagnostics();
  assert.equal(details.primaryActionCommandRegistered, true, "primary action command not registered");
  assert.equal(details.contextActionMenuRegistered, true, "context action menu not registered");
  assert.equal(details.preferencePaneRegistered, true, "preference pane not registered");
  assert.equal(details.workflowContractVersion, 1, "workflow contract version mismatch");
  assert.equal(details.itemPaneSections, 1, `unexpected item pane section count: ${details.itemPaneSections}`);
  assert.equal(details.itemPaneInfoRows, 0, `unexpected item pane info row count: ${details.itemPaneInfoRows}`);
  assert.ok(details.itemTreeColumns >= 1, `unexpected item tree column count: ${details.itemTreeColumns}`);
  assert.equal(details.notifierActiveCount, 0, `unexpected notifier count: ${details.notifierActiveCount}`);
  assert.equal(details.workflowItemPaneSectionRegistered, true, "workflow item pane section not registered");
  assert.equal(details.workflowItemMenuRegistered, true, "workflow item menu not registered");
  assert.equal(details.workflowCollectionMenuRegistered, true, "workflow collection menu not registered");
  assert.equal(details.workflowReaderMenuRegistered, true, "workflow reader menu not registered");
  return details;
});

registerZoteroScenario("real item selection diagnostics", async ({ assert, helpers, plugin }) => {
  const item = await helpers.createItem({
    itemType: "thesis",
    fields: {
      title: "Agent Scenario Thesis",
      abstractNote: "Cleanroom real item selection validation",
    },
  });

  const selection = await helpers.selectItem(item.id);
  const details = plugin.api.agent.inspectItem(item.id);

  assert.equal(selection.libraryID, item.libraryID);
  assert.equal(selection.libraryRootSelected, true);
  assert.equal(selection.itemsViewLoaded, true);
  assert.equal(selection.selectionSingleItem, true);
  assert.deepEqual(selection.selectedIDs, [item.id]);
  assert.equal(details.isRealItem, true);
  assert.includes(details.summary, "#");
  assert.includes(details.summary, "Agent Scenario Thesis");
  assert.includes(details.columnValue, "thesis");

  return {
    ...selection,
    ...details,
  };
});

registerZoteroScenario("real workflow state persists on item tags and Extra", async ({ assert, helpers }) => {
  const item = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Agent Workflow Draft",
    },
  });

  item.addTag("/done");
  item.addTag("#focus");
  item.addTag("*****");
  item.setField("extra", "Remark: Ready for review");
  await item.saveTx();

  const reloaded = globalThis.Zotero.Items.get(item.id);
  const tags = reloaded.getTags().map((entry) => entry.tag);

  assert.ok(tags.includes("/done"));
  assert.ok(tags.includes("#focus"));
  assert.ok(tags.includes("*****"));
  assert.includes(reloaded.getField("extra"), "Remark: Ready for review");
  return {
    itemID: item.id,
    tags,
    extra: reloaded.getField("extra"),
  };
});

registerZoteroScenario("real reader summary on generated pdf", async ({ assert, helpers, plugin }) => {
  const parentItem = await helpers.createItem({
    itemType: "book",
    fields: {
      title: "Reader Parent Item",
    },
  });

  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Agent Reader PDF",
    text: "Cleanroom Reader Validation",
  });

  await helpers.openReader(attachment.id);

  const summary = await helpers.waitFor(
    () => plugin.api.reader.getReaderSummary(attachment.id),
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: `Timed out waiting for reader summary for item #${attachment.id}`,
    },
  );

  assert.equal(await plugin.api.reader.canOpen(attachment.id), true);
  assert.equal(summary.itemID, attachment.id);
  assert.equal(summary.type, "pdf");

  return {
    attachmentID: attachment.id,
    summary,
  };
});

registerZoteroScenario("agent action runs without blocking UI", async ({ assert, plugin }) => {
  const details = plugin.api.agent.runScenario("command-no-ui");
  assert.equal(details.ok, true);
  return details;
});
