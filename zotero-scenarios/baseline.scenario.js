registerZoteroScenario("baseline registration diagnostics", async ({ assert, plugin }) => {
  const details = plugin.api.agent.collectDiagnostics();
  assert.equal(details.primaryActionCommandRegistered, true);
  assert.equal(details.contextActionMenuRegistered, true);
  assert.equal(details.preferencePaneRegistered, true);
  assert.equal(details.itemPaneSections, 1);
  assert.equal(details.itemPaneInfoRows, 1);
  assert.equal(details.itemTreeColumns, 1);
  assert.equal(details.notifierActiveCount, 1);
  assert.ok(details.menuIDs.some((id) => String(id).includes("reader-summary")));
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

  assert.includes(selection.selectedIDs, item.id);
  assert.equal(details.isRealItem, true);
  assert.includes(details.summary, "#");
  assert.includes(details.summary, "Agent Scenario Thesis");
  assert.includes(details.columnValue, "thesis");

  return {
    ...selection,
    ...details,
  };
});

registerZoteroScenario("real notifier follows item updates", async ({ assert, helpers, plugin }) => {
  const item = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Agent Notifier Draft",
    },
  });

  item.setField("title", "Agent Notifier Final");
  await item.saveTx();

  const diagnostics = await helpers.waitFor(
    () => {
      const snapshot = plugin.api.agent.collectDiagnostics();
      return String(snapshot.lastNotifierEvent || "").includes(`item:modify #${item.id}`)
        ? snapshot
        : null;
    },
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for notifier update for item #${item.id}`,
    },
  );

  assert.includes(diagnostics.lastNotifierEvent, `item:modify #${item.id}`);
  return diagnostics;
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
