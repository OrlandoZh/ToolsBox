registerZoteroScenario("reader event hook diagnostics", async ({ assert, helpers, plugin }) => {
  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Reader Event Hook Parent",
    },
  });

  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Reader Event Hook PDF",
    text: "Reader event hook validation",
  });

  const invocations = [];
  const markerID = `cleanroom-reader-toolbar-marker-${Date.now()}`;

  plugin.api.reader.unregisterAllEventListeners();

  plugin.api.reader.registerEventListener(
    plugin.api.reader.READER_EVENT_TYPES.RENDER_TOOLBAR,
    (event) => {
      const record = {
        type: String(event?.type || ""),
        itemID: Number.isFinite(event?.reader?.itemID) ? event.reader.itemID : null,
        tabID: typeof event?.reader?.tabID === "string" ? event.reader.tabID : null,
        hasDoc: Boolean(event?.doc && typeof event.doc.createElement === "function"),
        hasAppend: typeof event?.append === "function",
        appended: false,
        appendError: null,
      };

      if (record.hasDoc && record.hasAppend) {
        try {
          const marker = event.doc.createElement("div");
          marker.setAttribute("id", markerID);
          marker.textContent = "Agent toolbar hook";
          event.append(marker);
          record.appended = true;
        }
        catch (error) {
          record.appendError = String(error?.message || error);
        }
      }

      invocations.push(record);
    },
  );

  assert.equal(plugin.api.reader.isEventAPIAvailable(), true);
  assert.equal(plugin.api.reader.getEventListenerCount(), 1);

  try {
    await helpers.openReader(attachment.id);

    const firstInvocation = await helpers.waitFor(
      () => invocations.find((entry) => entry.itemID === attachment.id),
      {
        timeoutMs: 8000,
        intervalMs: 100,
        message: `Timed out waiting for reader toolbar hook for item #${attachment.id}`,
      },
    );

    assert.equal(firstInvocation.type, "renderToolbar");
    assert.equal(firstInvocation.itemID, attachment.id);
    assert.equal(firstInvocation.hasDoc, true);
    assert.equal(firstInvocation.hasAppend, true);
    assert.equal(firstInvocation.appended, true);
    assert.equal(firstInvocation.appendError, null);

    const snapshot = plugin.api.agent.runScenario("reader-current", {
      itemID: attachment.id,
    });

    assert.equal(snapshot.summary.itemID, attachment.id);
    assert.equal(snapshot.eventListenerCount, 1);
    assert.ok(Array.isArray(snapshot.eventListeners));
    assert.equal(snapshot.eventListeners[0].type, "renderToolbar");
    assert.ok(
      typeof snapshot.eventListeners[0].pluginID === "string"
      && snapshot.eventListeners[0].pluginID.length > 0,
    );

    const removed = plugin.api.reader.unregisterAllEventListeners();
    assert.equal(removed, 1);
    assert.equal(plugin.api.reader.getEventListenerCount(), 0);

    return {
      attachmentID: attachment.id,
      invocationCount: invocations.length,
      firstInvocation,
      snapshot: {
        eventListenerCount: snapshot.eventListenerCount,
        eventListeners: snapshot.eventListeners,
      },
      removed,
      markerID,
    };
  }
  finally {
    plugin.api.reader.unregisterAllEventListeners();
  }
});
