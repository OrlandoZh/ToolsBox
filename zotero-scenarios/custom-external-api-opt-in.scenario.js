registerZoteroScenario("custom external api opt-in workflow", async ({
  assert,
  addonConfig,
  helpers,
  plugin,
  Zotero,
  Services,
}) => {
  const sectionID = "toolsbox-custom-external-api";
  const enabledPrefName = `${addonConfig.prefsPrefix}.customExternalAPI.enabled`;
  const endpointPrefName = `${addonConfig.prefsPrefix}.customExternalAPI.endpoint`;
  const enabled = Services.prefs.getBoolPref(enabledPrefName, false);
  const endpoint = Services.prefs.getStringPref(endpointPrefName, "");

  function compactText(element, limit = 900) {
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
      DOI: String(item.getField?.("DOI") || ""),
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
    assert.ok(sectionOptions, "Expected Custom External API Item Pane section options");
    assert.ok(liveBody, "Expected live Custom External API Item Pane body");

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

    let lastRootText = "";
    const root = await helpers.waitFor(
      () => {
        const candidate = queryDeep(livePane, `.toolsbox-custom-external-api[data-toolsbox-owner="${sectionID}"]`)
          || queryDeep(liveBody, `.toolsbox-custom-external-api[data-toolsbox-owner="${sectionID}"]`);
        lastRootText = compactText(candidate);
        return candidate
          && candidate.textContent.includes("Custom API E2E Paper")
          && candidate.textContent.includes("Request preview")
          ? candidate
          : null;
      },
      {
        timeoutMs: 8000,
        intervalMs: 100,
        message: `Timed out waiting for Custom External API section; lastRootText=${lastRootText}`,
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

  if (!enabled || !endpoint) {
    assert.equal(
      plugin.api.itemPane.hasSection(sectionID),
      false,
      "Custom External API section should stay unregistered by default or without endpoint",
    );
    return {
      mode: "default-off-or-missing-endpoint",
      enabledPrefName,
      endpointPrefName,
      enabled,
      endpointConfigured: Boolean(endpoint),
      sectionRegistered: false,
    };
  }

  assert.equal(plugin.api.itemPane.hasSection(sectionID), true, "Custom External API section should register when enabled with endpoint");

  const item = await helpers.createItem({
    itemType: "journalArticle",
    fields: {
      title: "Custom API E2E Paper",
      abstractNote: "This local abstract is sent only after an explicit Custom External API run click.",
      DOI: "10.9999/toolsbox-custom-api",
      extra: "ToolsBox Custom External API scenario initial extra",
    },
    tags: ["custom-api", "local-only"],
  });
  const beforeSnapshot = getItemSnapshot(item.id);
  const render = await renderSectionForItem(item.id);
  const rootText = compactText(render.root);
  assert.ok(rootText.includes("Ready to send one explicit request"), `Expected idle state; rootText=${rootText}`);

  const button = queryDeep(render.root, ".toolsbox-custom-external-api-run-button")
    || queryDeep(render.liveBody, ".toolsbox-custom-external-api-run-button");
  assert.ok(button, "Expected Custom External API Run button");
  button.click();

  let lastResultText = "";
  const resultRoot = await helpers.waitFor(
    () => {
      const candidate = queryDeep(render.livePane, `.toolsbox-custom-external-api[data-toolsbox-owner="${sectionID}"]`)
        || queryDeep(render.liveBody, `.toolsbox-custom-external-api[data-toolsbox-owner="${sectionID}"]`);
      lastResultText = compactText(candidate);
      return candidate
        && candidate.textContent.includes("requestCount")
        && candidate.textContent.includes("Custom API E2E Paper")
        ? candidate
        : null;
    },
    {
      timeoutMs: 10000,
      intervalMs: 100,
      message: `Timed out waiting for Custom External API response preview; lastResultText=${lastResultText}; endpoint=${endpoint}`,
    },
  );

  assert.equal(getAttribute(resultRoot, "data-toolsbox-custom-external-api-network-used"), "true");
  assert.equal(getAttribute(resultRoot, "data-toolsbox-custom-external-api-result-status"), "success");
  const resultText = compactText(resultRoot, 1200);
  assert.ok(resultText.includes("schemaVersion"), `Expected echoed schemaVersion; resultText=${resultText}`);
  assert.ok(resultText.includes("invokeExternal"), `Expected echoed capability; resultText=${resultText}`);
  assert.ok(resultText.includes("customExternalAPI"), `Expected echoed consumer; resultText=${resultText}`);

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
    `.toolsbox-custom-external-api[data-toolsbox-owner="${sectionID}"]`,
  );
  assert.equal(ownerRootsAfterRerender.length, 1, "Expected repeated render to leave exactly one Custom External API owner root");

  assert.deepEqual(
    getItemSnapshot(item.id),
    beforeSnapshot,
    "Expected Custom External API preview to leave item/note/annotation/attachment data unchanged",
  );

  return {
    mode: "enabled-opt-in-endpoint-invocation",
    enabledPrefName,
    endpointPrefName,
    endpoint,
    sectionID,
    itemID: item.id,
    networkUsed: getAttribute(resultRoot, "data-toolsbox-custom-external-api-network-used"),
    resultStatus: getAttribute(resultRoot, "data-toolsbox-custom-external-api-result-status"),
    ownerRootCountAfterRerender: ownerRootsAfterRerender.length,
    itemSnapshotUnchanged: true,
  };
});
