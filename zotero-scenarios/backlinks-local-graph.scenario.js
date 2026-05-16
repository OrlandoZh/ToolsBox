registerZoteroScenario("backlinks local graph drilldown workflow", async ({
  assert,
  addonConfig,
  helpers,
  plugin,
  Zotero,
  Services,
}) => {
  const sectionID = "toolsbox-backlinks";
  const prefName = `${addonConfig.prefsPrefix}.backlinks.enabled`;
  const backlinksEnabled = Services.prefs.getBoolPref(prefName, false);

  function normalizeRelations(value) {
    if (!value) {
      return "";
    }
    try {
      return JSON.stringify(value, Object.keys(value).sort());
    } catch {
      return String(value);
    }
  }

  function getItemSnapshot(itemID) {
    const item = Zotero.Items.get(itemID);
    assert.ok(item, `Expected item #${itemID} to exist`);
    const relations = typeof item.getRelations === "function"
      ? item.getRelations()
      : Zotero.Relations?.getByItem?.(item);
    return {
      id: item.id,
      key: item.key,
      title: String(item.getField?.("title") || ""),
      extra: String(item.getField?.("extra") || ""),
      abstractNote: String(item.getField?.("abstractNote") || ""),
      relations: normalizeRelations(relations),
    };
  }

  function clickElement(element) {
    if (typeof element?.click === "function") {
      element.click();
      return "click";
    }
    const EventCtor = element?.ownerDocument?.defaultView?.MouseEvent;
    if (typeof element?.dispatchEvent === "function" && EventCtor) {
      element.dispatchEvent(new EventCtor("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }));
      return "dispatch-click";
    }
    throw new Error("Unable to click Backlinks drilldown button");
  }

  function queryDeep(root, selector, seen = new Set()) {
    if (!root || typeof selector !== "string") {
      return null;
    }
    if (seen.has(root)) {
      return null;
    }
    seen.add(root);

    try {
      const direct = typeof root.querySelector === "function"
        ? root.querySelector(selector)
        : null;
      if (direct) {
        return direct;
      }
    } catch {}

    const descendants = typeof root.querySelectorAll === "function"
      ? Array.from(root.querySelectorAll("*"))
      : [];
    for (const element of descendants) {
      const shadowRoot = element?.shadowRoot || null;
      if (shadowRoot) {
        const found = queryDeep(shadowRoot, selector, seen);
        if (found) {
          return found;
        }
      }
    }

    const internalRoots = [root._body, root._section, root.body, root.contentElement]
      .filter(Boolean);
    for (const internalRoot of internalRoots) {
      const found = queryDeep(internalRoot, selector, seen);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function queryAcrossDocuments(window, selector) {
    const seen = new Set();
    const pending = [window?.document].filter(Boolean);
    while (pending.length > 0) {
      const doc = pending.shift();
      if (!doc || seen.has(doc)) {
        continue;
      }
      seen.add(doc);
      const found = queryDeep(doc, selector);
      if (found) {
        return found;
      }
      const frameElements = typeof doc.querySelectorAll === "function"
        ? Array.from(doc.querySelectorAll("iframe,browser"))
        : [];
      for (const frame of frameElements) {
        try {
          const frameDoc = frame.contentDocument || frame.contentWindow?.document || null;
          if (frameDoc && !seen.has(frameDoc)) {
            pending.push(frameDoc);
          }
        } catch {}
      }
    }
    return null;
  }

  function compactText(element, limit = 500) {
    return String(element?.textContent || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function describeElement(element) {
    if (!element) {
      return null;
    }
    const attrs = {};
    try {
      for (const attr of Array.from(element.attributes || [])) {
        attrs[attr.name] = attr.value;
      }
    } catch {}
    return {
      tagName: element.localName || element.tagName || null,
      attrs,
      text: compactText(element, 200),
      hasInternalBody: Boolean(element._body),
      internalBodyText: compactText(element._body, 200),
      internalBodyChildElementCount: Number(element._body?.childElementCount || 0),
      childElementCount: Number(element.childElementCount || 0),
      children: Array.from(element.children || []).slice(0, 8).map((child) => ({
        tagName: child.localName || child.tagName || null,
        attrs: Array.from(child.attributes || []).reduce((acc, attr) => {
          acc[attr.name] = attr.value;
          return acc;
        }, {}),
        text: compactText(child, 120),
        childElementCount: Number(child.childElementCount || 0),
      })),
    };
  }

  if (!backlinksEnabled) {
    assert.equal(
      plugin.api.itemPane.hasSection(sectionID),
      false,
      "Backlinks section should stay unregistered by default",
    );
    return {
      mode: "default-off",
      prefName,
      sectionID,
      backlinksEnabled,
      sectionRegistered: false,
    };
  }

  assert.equal(plugin.api.itemPane.hasSection(sectionID), true, "Backlinks section should register when enabled");

  const currentItem = await helpers.createItem({
    itemType: "journalArticle",
    fields: {
      title: "Backlinks Local Graph E2E Target",
    },
  });
  const currentURI = Zotero.URI.getItemURI(currentItem);
  const byKey = await helpers.createItem({
    itemType: "journalArticle",
    fields: {
      title: "Backlinks Source By Key",
      extra: `Local backlink source mentions ${currentItem.key}`,
    },
  });
  const byURI = await helpers.createItem({
    itemType: "journalArticle",
    fields: {
      title: "Backlinks Source By URI",
      abstractNote: `Local backlink source mentions ${currentURI}`,
    },
  });

  const beforeSnapshots = [
    getItemSnapshot(currentItem.id),
    getItemSnapshot(byKey.id),
    getItemSnapshot(byURI.id),
  ];

  await helpers.selectItem(currentItem.id);
  const paneResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("itemPane.selectPane", {
      paneID: sectionID,
      behavior: "instant",
      activationPolicy: "ui-required",
    }),
  );
  assert.equal(paneResult.ok, true, `itemPane.selectPane failed: ${JSON.stringify(paneResult)}`);

  await helpers.selectItem(currentItem.id);

  const mainWindow = helpers.getMainWindow();
  const resolvedPaneID = plugin.api.itemPane.resolveSectionPaneID(sectionID) || sectionID;
  const livePaneResult = typeof plugin.api.host?.selectItemPane === "function"
    ? await plugin.api.host.selectItemPane(resolvedPaneID, {
      behavior: "instant",
      activationPolicy: "ui-required",
    })
    : null;
  const livePane = livePaneResult?.pane || null;
  if (typeof livePane?.render === "function") {
    livePane.render();
  }
  if (typeof livePane?.asyncRender === "function") {
    await livePane.asyncRender();
  }
  const sectionOptions = Zotero.ItemPaneManager.customSectionData.options
    .find((entry) => entry.paneID === resolvedPaneID || entry.paneID === sectionID);
  const liveBody = livePane?._body || queryDeep(livePane, '[data-type="body"]');
  const renderProbe = {
    hasSectionOptions: Boolean(sectionOptions),
    hasOnRender: typeof sectionOptions?.onRender === "function",
    hasOnAsyncRender: typeof sectionOptions?.onAsyncRender === "function",
    hasLiveBody: Boolean(liveBody),
    liveBodyTextBefore: compactText(liveBody, 200),
  };
  if (liveBody && sectionOptions?.onRender) {
    sectionOptions.onRender({
      paneID: resolvedPaneID,
      doc: mainWindow.document,
      body: liveBody,
      item: Zotero.Items.get(currentItem.id),
      tabType: "library",
      editable: true,
      setEnabled() {},
      setSectionSummary() {},
      setSectionButtonStatus() {},
    });
  }
  if (liveBody && sectionOptions?.onAsyncRender) {
    await sectionOptions.onAsyncRender({
      paneID: resolvedPaneID,
      doc: mainWindow.document,
      body: liveBody,
      item: Zotero.Items.get(currentItem.id),
      tabType: "library",
      editable: true,
      setEnabled() {},
      setSectionSummary() {},
      setSectionButtonStatus() {},
    });
  }
  renderProbe.liveBodyTextAfter = compactText(liveBody, 200);
  renderProbe.liveBodyChildElementCountAfter = Number(liveBody?.childElementCount || 0);
  let lastRootText = "";
  const root = await helpers.waitFor(
    () => {
      const candidate = queryDeep(livePane, `.toolsbox-backlinks[data-toolsbox-owner="${sectionID}"]`)
        || queryDeep(livePane, `[data-toolsbox-owner="${sectionID}"]`)
        || queryDeep(liveBody, `.toolsbox-backlinks[data-toolsbox-owner="${sectionID}"]`)
        || queryDeep(liveBody, `[data-toolsbox-owner="${sectionID}"]`)
        || queryAcrossDocuments(mainWindow, `.toolsbox-backlinks[data-toolsbox-owner="${sectionID}"]`);
      lastRootText = compactText(candidate);
      return candidate
        && candidate.textContent.includes("Backlinks Source By Key")
        && candidate.textContent.includes("Backlinks Source By URI")
        && candidate.textContent.includes("nodes")
        ? candidate
        : null;
    },
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: `Timed out waiting for Backlinks local graph section; lastRootText=${lastRootText}; renderProbe=${JSON.stringify(renderProbe)}; paneResult=${JSON.stringify(paneResult)}; livePane=${JSON.stringify(describeElement(livePane))}`,
    },
  );

  const drilldownButton = queryDeep(root, `.toolsbox-backlinks-drilldown-button[data-toolsbox-backlink-item-id="${byKey.id}"]`)
    || queryDeep(root, `[data-toolsbox-action="open-backlink-source"][data-toolsbox-backlink-item-id="${byKey.id}"]`);
  assert.ok(drilldownButton, "Expected Backlinks drilldown button for source item");
  const activation = clickElement(drilldownButton);

  await helpers.waitFor(
    () => {
      const selectedIDs = helpers.getSelectedItemIDs();
      return selectedIDs.length === 1 && selectedIDs[0] === byKey.id;
    },
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: `Timed out waiting for Backlinks drilldown to select source item #${byKey.id}`,
    },
  );

  assert.deepEqual([
    getItemSnapshot(currentItem.id),
    getItemSnapshot(byKey.id),
    getItemSnapshot(byURI.id),
  ], beforeSnapshots, "Expected Backlinks drilldown to leave local item fields and relations unchanged");

  return {
    mode: "enabled-local-graph-drilldown",
    prefName,
    sectionID,
    backlinksEnabled,
    targetItemID: currentItem.id,
    sourceItemIDs: [byKey.id, byURI.id],
    activation,
    selectedIDs: helpers.getSelectedItemIDs(),
    rootText: compactText(root),
    itemSnapshotsUnchanged: true,
  };
});
