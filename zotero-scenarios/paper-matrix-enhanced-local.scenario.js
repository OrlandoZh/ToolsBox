registerZoteroScenario("paper matrix enhanced local workflow", async ({
  assert,
  addonConfig,
  helpers,
  plugin,
  Zotero,
  Services,
}) => {
  const commandID = `${addonConfig.addonRef}-paper-matrix`;
  const prefName = `${addonConfig.prefsPrefix}.paperMatrix.enabled`;
  const paperMatrixEnabled = Services.prefs.getBoolPref(prefName, false);
  const windowHrefSuffix = "/content/lib/research-workbench-matrix.xhtml";
  const bridgeKey = `__${String(addonConfig.addonRef || "toolsbox").replace(/-/g, "_")}_WorkbenchBridge__`;

  function sortedNumbers(values) {
    return (Array.isArray(values) ? values : [])
      .filter((value) => typeof value === "number")
      .slice()
      .sort((left, right) => left - right);
  }

  function compactText(element, limit = 500) {
    return String(element?.textContent || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function listMatrixWindows() {
    const windows = typeof plugin?.api?.host?.listWindowsByType === "function"
      ? plugin.api.host.listWindowsByType(null)
      : [];
    return windows.filter((candidate) => {
      try {
        return String(candidate?.location?.href || "").includes(windowHrefSuffix);
      } catch {}
      return false;
    });
  }

  function listWindowHrefs() {
    const windows = typeof plugin?.api?.host?.listWindowsByType === "function"
      ? plugin.api.host.listWindowsByType(null)
      : [];
    return windows.map((candidate) => {
      try {
        return String(candidate?.location?.href || "");
      } catch {}
      return "unreadable";
    });
  }

  function getMountedMatrixWindow() {
    return listMatrixWindows().find((candidate) => {
      const bridge = candidate?.[bridgeKey];
      return candidate
        && !candidate.closed
        && typeof bridge?.getSnapshot === "function"
        && candidate.document?.getElementById?.("pm-tbody");
    }) || null;
  }

  function getField(item, field) {
    try {
      return String(item?.getField?.(field) || "");
    } catch {}
    return "";
  }

  async function openMatrixWindow(items, expectedEnhanced) {
    if (items[0]?.id) {
      await helpers.selectItem(items[0].id);
    }
    const commandSnapshot = typeof plugin.api.commandPalette.getCommandSnapshot === "function"
      ? plugin.api.commandPalette.getCommandSnapshot(commandID)
      : null;
    assert.equal(
      commandSnapshot?.enabled,
      true,
      `Expected Paper Matrix command to be enabled; snapshot=${JSON.stringify(commandSnapshot)}`,
    );
    const opened = plugin.api.commandPalette.executeCommand(commandID, {
      items,
      limit: 20,
    });
    assert.equal(opened, true, `Expected ${commandID} command execution to succeed`);

    const win = await helpers.waitFor(
      () => {
        const candidate = getMountedMatrixWindow();
        const bridge = candidate?.[bridgeKey];
        const snapshot = bridge?.getSnapshot?.();
        return candidate
          && snapshot
          && snapshot.enhanced === expectedEnhanced
          && snapshot.rowCount >= items.length
          ? candidate
          : null;
      },
      {
        timeoutMs: 8000,
        intervalMs: 100,
        message: `Timed out waiting for command-opened Paper Matrix enhanced=${expectedEnhanced} window; openWindows=${listMatrixWindows().length}; windowHrefs=${JSON.stringify(listWindowHrefs())}; commandSnapshot=${JSON.stringify(commandSnapshot)}`,
      },
    );
    helpers.addCleanup(() => {
      if (win && !win.closed && typeof win.close === "function") {
        win.close();
      }
    });
    return win;
  }

  function dispatchValue(element, value, eventType = "change") {
    assert.ok(element, "Expected filter control to exist");
    element.value = value;
    const EventCtor = element.ownerDocument?.defaultView?.Event || Event;
    element.dispatchEvent(new EventCtor(eventType, {
      bubbles: true,
      cancelable: true,
    }));
  }

  function getAttachmentIDs(item) {
    try {
      return sortedNumbers(item?.getAttachments?.() || []);
    } catch {}
    return [];
  }

  function getTags(item) {
    try {
      return (item?.getTags?.() || [])
        .map((entry) => String(entry?.tag || entry || ""))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
    } catch {}
    return [];
  }

  function getItemSnapshot(itemID) {
    const item = Zotero.Items.get(itemID);
    assert.ok(item, `Expected item #${itemID} to exist`);
    return {
      id: item.id,
      key: String(item.key || ""),
      title: String(item.getField?.("title") || ""),
      itemTypeID: item.itemTypeID || null,
      doi: String(item.getField?.("DOI") || ""),
      date: String(item.getField?.("date") || ""),
      publicationTitle: String(item.getField?.("publicationTitle") || ""),
      extra: String(item.getField?.("extra") || ""),
      attachmentIDs: getAttachmentIDs(item),
      tags: getTags(item),
    };
  }

  const registeredCommands = typeof plugin?.api?.commandPalette?.getAllCommands === "function"
    ? plugin.api.commandPalette.getAllCommands()
    : [];
  const paperMatrixCommand = registeredCommands.find((entry) => entry?.id === commandID) || null;
  assert.ok(paperMatrixCommand, "Expected Paper Matrix baseline command to be registered");

  if (!paperMatrixEnabled) {
    const baselineItem = await helpers.createItem({
      itemType: "journalArticle",
      fields: {
        title: "Paper Matrix Default Off Baseline",
        date: "2026",
      },
    });
    const win = await openMatrixWindow([baselineItem], false);
    const snapshot = win[bridgeKey].getSnapshot();
    const filters = win.document.getElementById("pm-filters");
    assert.equal(snapshot.enhanced, false, "Paper Matrix enhanced mode should stay disabled by default");
    assert.equal(filters?.hidden, true, "Enhanced filters should stay hidden by default");
    assert.equal(
      win.document.documentElement.getAttribute("data-paper-matrix-enhanced"),
      "false",
      "Paper Matrix window should carry default-off enhanced marker",
    );
    win.close();
    return {
      mode: "default-off-baseline-window",
      prefName,
      commandID,
      paperMatrixEnabled,
      enhanced: snapshot.enhanced,
      filtersHidden: filters?.hidden === true,
    };
  }

  const alpha = await helpers.createItem({
    itemType: "journalArticle",
    fields: {
      title: "Paper Matrix Enhanced Alpha",
      DOI: "10.5555/toolsbox.alpha",
      date: "2024-05-01",
      publicationTitle: "Local Matrix Journal",
      extra: "Read Status: read",
    },
    tags: ["scenario-matrix-ai", "/reviewed"],
    creators: [{ firstName: "Ada", lastName: "Lovelace", creatorType: "author" }],
  });
  const beta = await helpers.createItem({
    itemType: "book",
    fields: {
      title: "Paper Matrix Enhanced Beta",
      date: "2020",
      publisher: "Local Matrix Press",
      extra: "Read Status: unread",
    },
    tags: ["scenario-matrix-human", "/todo"],
    creators: [{ firstName: "Grace", lastName: "Hopper", creatorType: "author" }],
  });
  const gamma = await helpers.createItem({
    itemType: "journalArticle",
    fields: {
      title: "Paper Matrix Enhanced Gamma",
      date: "2025",
      publicationTitle: "Local Matrix Journal",
      extra: "Read Status: reading",
    },
    tags: ["scenario-matrix-ai", "/done"],
    creators: [{ firstName: "Katherine", lastName: "Johnson", creatorType: "author" }],
  });

  await helpers.createPDF({
    parentItemID: alpha.id,
    title: "Paper Matrix Enhanced Alpha PDF",
    text: "Paper matrix alpha local attachment",
  });
  await helpers.createPDF({
    parentItemID: gamma.id,
    title: "Paper Matrix Enhanced Gamma PDF",
    text: "Paper matrix gamma local attachment",
  });

  const items = [alpha, beta, gamma];
  const beforeSnapshots = items.map((item) => getItemSnapshot(item.id));
  const win = await openMatrixWindow(items, true);
  const bridge = win[bridgeKey];
  const snapshot = bridge.getSnapshot();
  assert.equal(snapshot.enhanced, true, "Paper Matrix enhanced mode should enable with paperMatrix.enabled=true");
  assert.equal(snapshot.rowCount, 3, `Expected exactly three scenario rows; snapshot=${JSON.stringify(snapshot)}`);
  assert.ok(snapshot.visibleColumns.includes("workflowStatus"), "Expected enhanced workflow status column to be visible");
  assert.ok(snapshot.visibleColumns.includes("attachmentCount"), "Expected enhanced attachment count column to be visible");

  const doc = win.document;
  const filters = doc.getElementById("pm-filters");
  assert.equal(filters?.hidden, false, "Enhanced filters should be visible when enabled");
  assert.equal(doc.documentElement.getAttribute("data-paper-matrix-enhanced"), "true");
  assert.ok(compactText(doc.getElementById("pm-tbody")).includes("Paper Matrix Enhanced Alpha"));
  assert.ok(compactText(doc.getElementById("pm-tbody")).includes("Paper Matrix Enhanced Beta"));
  assert.ok(compactText(doc.getElementById("pm-tbody")).includes("Paper Matrix Enhanced Gamma"));

  dispatchValue(doc.getElementById("pm-filter-type"), "journalArticle");
  dispatchValue(doc.getElementById("pm-filter-tag"), "scenario-matrix-ai");
  dispatchValue(doc.getElementById("pm-filter-status"), "reviewed");
  dispatchValue(doc.getElementById("pm-filter-year-from"), "2024", "input");
  dispatchValue(doc.getElementById("pm-filter-year-to"), "2024", "input");
  dispatchValue(doc.getElementById("pm-filter-attachment"), "yes");

  const filteredSnapshot = await helpers.waitFor(
    () => {
      const current = bridge.getSnapshot();
      return current.filteredRowCount === 1 ? current : null;
    },
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for Paper Matrix enhanced filters; snapshot=${JSON.stringify(bridge.getSnapshot())}; tbody=${compactText(doc.getElementById("pm-tbody"))}`,
    },
  );
  const filteredText = compactText(doc.getElementById("pm-tbody"));
  assert.ok(filteredText.includes("Paper Matrix Enhanced Alpha"), `Expected Alpha after filters; tbody=${filteredText}`);
  assert.equal(filteredText.includes("Paper Matrix Enhanced Beta"), false, `Expected Beta to be filtered out; tbody=${filteredText}`);
  assert.equal(filteredText.includes("Paper Matrix Enhanced Gamma"), false, `Expected Gamma to be filtered out; tbody=${filteredText}`);

  dispatchValue(doc.getElementById("pm-filter-attachment"), "no");
  const noAttachmentSnapshot = await helpers.waitFor(
    () => {
      const current = bridge.getSnapshot();
      return current.filteredRowCount === 0 ? current : null;
    },
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for has-attachment filter to exclude Alpha; snapshot=${JSON.stringify(bridge.getSnapshot())}`,
    },
  );
  assert.equal(noAttachmentSnapshot.filters.hasAttachment, "no");

  doc.getElementById("pm-btn-clear-filters").click();
  await helpers.waitFor(
    () => {
      const current = bridge.getSnapshot();
      return current.filteredRowCount === 3 && current.filters.itemType === "" ? current : null;
    },
    {
      timeoutMs: 5000,
      intervalMs: 100,
      message: `Timed out waiting for Paper Matrix enhanced filters to clear; snapshot=${JSON.stringify(bridge.getSnapshot())}`,
    },
  );

  assert.deepEqual(
    items.map((item) => getItemSnapshot(item.id)),
    beforeSnapshots,
    "Expected Paper Matrix Enhanced preview to leave local item metadata, tags, and attachments unchanged",
  );

  win.close();
  return {
    mode: "enabled-local-field-filter-preview",
    prefName,
    commandID,
    paperMatrixEnabled,
    rowCount: snapshot.rowCount,
    filteredRowCount: filteredSnapshot.filteredRowCount,
    noAttachmentFilteredRowCount: noAttachmentSnapshot.filteredRowCount,
    enhancedColumns: snapshot.visibleColumns.filter((key) => [
      "itemType",
      "workflowStatus",
      "attachmentCount",
      "doi",
      "tagList",
      "hasAttachmentLabel",
    ].includes(key)),
  };
});
