registerZoteroScenario("real notifier follows item updates", async ({ assert, helpers, plugin }) => {
  const item = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Notifier Sync Probe",
    },
  });

  let observed = null;
  const subscriptionID = plugin.api.notifier.subscribe(
    "item",
    (event, type, ids) => {
      const normalizedIDs = Array.isArray(ids) ? ids.map((id) => Number(id)) : [];
      if (type === "item" && normalizedIDs.includes(item.id)) {
        observed = {
          event,
          type,
          ids: normalizedIDs,
        };
        plugin.api.agent.runScenario("notifier-preview", {
          event,
          type,
          ids: normalizedIDs,
        });
      }
    },
    {
      id: "toolsbox-agent-notifier-sync-probe",
    },
  );

  assert.ok(subscriptionID, "notifier subscription was not created");
  assert.ok(plugin.api.notifier.getActiveCount() > 0, "notifier subscription was not active");

  try {
    item.setField("title", "Notifier Sync Probe Updated");
    await item.saveTx();

    await helpers.waitFor(
      () => observed,
      {
        timeoutMs: 5000,
        intervalMs: 100,
        message: `Timed out waiting for notifier event for item #${item.id}`,
      },
    );

    const diagnostics = plugin.api.agent.collectDiagnostics();
    assert.equal(observed.type, "item");
    assert.ok(["modify", "refresh"].includes(observed.event), `unexpected notifier event: ${observed.event}`);
    assert.ok(observed.ids.includes(item.id), "notifier event did not include the updated item");
    assert.includes(diagnostics.lastNotifierEvent, `#${item.id}`);

    return {
      itemID: item.id,
      subscriptionID,
      observed,
      lastNotifierEvent: diagnostics.lastNotifierEvent,
    };
  } finally {
    plugin.api.notifier.unsubscribe(subscriptionID);
  }
});
