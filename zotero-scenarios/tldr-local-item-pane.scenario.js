registerZoteroScenario("tldr local item pane preview workflow", async ({
  assert,
  addonConfig,
  helpers,
  plugin,
  Zotero,
  Services,
}) => {
  const sectionID = "toolsbox-tldr-panel";
  const prefName = `${addonConfig.prefsPrefix}.tldrPanel.enabled`;
  const tldrEnabled = Services.prefs.getBoolPref(prefName, false);

  function compactText(element, limit = 700) {
    return String(element?.textContent || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function getAttribute(element, name) {
    if (!element) {
      return "";
    }
    try {
      return String(element.getAttribute?.(name) || "");
    } catch {}
    return "";
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

  function queryAllDeep(root, selector, seen = new Set(), results = new Set()) {
    if (!root || typeof selector !== "string") {
      return [];
    }
    if (seen.has(root)) {
      return Array.from(results);
    }
    seen.add(root);

    try {
      if (typeof root.matches === "function" && root.matches(selector)) {
        results.add(root);
      }
    } catch {}

    try {
      const directMatches = typeof root.querySelectorAll === "function"
        ? Array.from(root.querySelectorAll(selector))
        : [];
      for (const element of directMatches) {
        results.add(element);
      }
    } catch {}

    const descendants = typeof root.querySelectorAll === "function"
      ? Array.from(root.querySelectorAll("*"))
      : [];
    for (const element of descendants) {
      const shadowRoot = element?.shadowRoot || null;
      if (shadowRoot) {
        queryAllDeep(shadowRoot, selector, seen, results);
      }
    }

    const internalRoots = [root._body, root._section, root.body, root.contentElement]
      .filter(Boolean);
    for (const internalRoot of internalRoots) {
      queryAllDeep(internalRoot, selector, seen, results);
    }
    return Array.from(results);
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
      text: compactText(element, 240),
      hasInternalBody: Boolean(element._body),
      internalBodyText: compactText(element._body, 240),
      internalBodyChildElementCount: Number(element._body?.childElementCount || 0),
      childElementCount: Number(element.childElementCount || 0),
    };
  }

  function sortedNumbers(values) {
    return (Array.isArray(values) ? values : [])
      .filter((value) => typeof value === "number")
      .slice()
      .sort((left, right) => left - right);
  }

  function getNoteIDs(item) {
    if (typeof item?.getNotes === "function") {
      return sortedNumbers(item.getNotes());
    }
    return [];
  }

  function getAnnotationIDs(item) {
    if (typeof item?.getAnnotations === "function") {
      try {
        return sortedNumbers(item.getAnnotations());
      } catch {}
    }
    return [];
  }

  function getAttachmentIDs(item) {
    if (typeof item?.getAttachments === "function") {
      try {
        return sortedNumbers(item.getAttachments());
      } catch {}
    }
    return [];
  }

  function normalizeTags(item) {
    try {
      return (typeof item?.getTags === "function" ? item.getTags() : [])
        .map((tag) => String(tag?.tag || tag?.name || tag || ""))
        .filter(Boolean)
        .sort();
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
      abstractNote: String(item.getField?.("abstractNote") || ""),
      extra: String(item.getField?.("extra") || ""),
      tags: normalizeTags(item),
      attachmentIDs: getAttachmentIDs(item),
      noteIDs: getNoteIDs(item),
      annotationIDs: getAnnotationIDs(item),
    };
  }

  async function renderSectionForItem(itemID) {
    await helpers.selectItem(itemID);
    const paneResult = helpers.toSurfaceSmokeResult(
      await helpers.runHostAction("itemPane.selectPane", {
        paneID: sectionID,
        behavior: "instant",
        activationPolicy: "ui-required",
      }),
    );
    assert.equal(paneResult.ok, true, `itemPane.selectPane failed: ${JSON.stringify(paneResult)}`);

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
      liveBodyTextBefore: compactText(liveBody, 240),
    };
    assert.ok(sectionOptions, "Expected TLDR Item Pane section options");
    assert.ok(liveBody, `Expected live Item Pane body; livePane=${JSON.stringify(describeElement(livePane))}`);

    const context = {
      paneID: resolvedPaneID,
      doc: mainWindow.document,
      body: liveBody,
      item: Zotero.Items.get(itemID),
      tabType: "library",
      editable: true,
      setEnabled() {},
      setSectionSummary() {},
      setSectionButtonStatus() {},
    };
    if (typeof sectionOptions.onRender === "function") {
      sectionOptions.onRender(context);
    }
    if (typeof sectionOptions.onAsyncRender === "function") {
      await sectionOptions.onAsyncRender(context);
    }
    renderProbe.liveBodyTextAfter = compactText(liveBody, 240);
    renderProbe.liveBodyChildElementCountAfter = Number(liveBody?.childElementCount || 0);

    let lastRootText = "";
    const root = await helpers.waitFor(
      () => {
        const candidate = queryDeep(livePane, `.toolsbox-tldr-panel[data-toolsbox-owner="${sectionID}"]`)
          || queryDeep(liveBody, `.toolsbox-tldr-panel[data-toolsbox-owner="${sectionID}"]`)
          || queryAcrossDocuments(mainWindow, `.toolsbox-tldr-panel[data-toolsbox-owner="${sectionID}"]`);
        lastRootText = compactText(candidate);
        return candidate
          && candidate.textContent.includes("TLDR E2E Local Paper")
          && candidate.textContent.includes("No-network summary preview")
          && candidate.textContent.includes("network-disabled")
          ? candidate
          : null;
      },
      {
        timeoutMs: 8000,
        intervalMs: 100,
        message: `Timed out waiting for TLDR local preview section; lastRootText=${lastRootText}; renderProbe=${JSON.stringify(renderProbe)}; paneResult=${JSON.stringify(paneResult)}; livePane=${JSON.stringify(describeElement(livePane))}`,
      },
    );

    return {
      root,
      livePane,
      liveBody,
      mainWindow,
      sectionOptions,
      resolvedPaneID,
    };
  }

  if (!tldrEnabled) {
    assert.equal(
      plugin.api.itemPane.hasSection(sectionID),
      false,
      "TLDR section should stay unregistered by default",
    );
    return {
      mode: "default-off",
      prefName,
      sectionID,
      tldrEnabled,
      sectionRegistered: false,
    };
  }

  assert.equal(plugin.api.itemPane.hasSection(sectionID), true, "TLDR section should register when enabled");

  const item = await helpers.createItem({
    itemType: "journalArticle",
    fields: {
      title: "TLDR E2E Local Paper",
      abstractNote: "This local abstract is only used to render a no-network TLDR request preview.",
      extra: "ToolsBox TLDR scenario initial extra",
    },
  });

  const beforeSnapshot = getItemSnapshot(item.id);
  const render = await renderSectionForItem(item.id);
  const rootText = compactText(render.root);
  assert.ok(rootText.includes("Provider unavailable"), `Expected provider unavailable status; rootText=${rootText}`);
  assert.equal(getAttribute(render.root, "data-toolsbox-tldr-network-used"), "false");
  assert.equal(getAttribute(render.root, "data-toolsbox-tldr-result-status"), "unavailable");

  const rerenderContext = {
    paneID: render.resolvedPaneID,
    doc: render.mainWindow.document,
    body: render.liveBody,
    item: Zotero.Items.get(item.id),
    tabType: "library",
    editable: true,
    setEnabled() {},
    setSectionSummary() {},
    setSectionButtonStatus() {},
  };
  render.sectionOptions.onRender(rerenderContext);
  await render.sectionOptions.onAsyncRender(rerenderContext);
  render.sectionOptions.onRender(rerenderContext);
  await render.sectionOptions.onAsyncRender(rerenderContext);

  const ownerRootsAfterRerender = queryAllDeep(
    render.liveBody,
    `.toolsbox-tldr-panel[data-toolsbox-owner="${sectionID}"]`,
  );
  assert.equal(ownerRootsAfterRerender.length, 1, "Expected repeated render to leave exactly one TLDR owner root");

  assert.deepEqual(
    getItemSnapshot(item.id),
    beforeSnapshot,
    "Expected TLDR preview to leave item/note/annotation/attachment data unchanged",
  );

  return {
    mode: "enabled-local-tldr-preview-no-network",
    prefName,
    sectionID,
    tldrEnabled,
    itemID: item.id,
    rootText,
    networkUsed: getAttribute(render.root, "data-toolsbox-tldr-network-used"),
    resultStatus: getAttribute(render.root, "data-toolsbox-tldr-result-status"),
    ownerRootCountAfterRerender: ownerRootsAfterRerender.length,
    itemSnapshotUnchanged: true,
  };
});
