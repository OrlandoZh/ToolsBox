registerZoteroScenario("attachment version enabled preview workflow", async ({
  assert,
  addonConfig,
  helpers,
  plugin,
  Zotero,
  Services,
}) => {
  const sectionID = "toolsbox-attachment-version";
  const prefName = `${addonConfig.prefsPrefix}.attachmentVersion.enabled`;
  const attachmentVersionEnabled = Services.prefs.getBoolPref(prefName, false);

  function compactText(element, limit = 600) {
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

  function getAnnotationIDs(item) {
    if (typeof item?.getAnnotations === "function") {
      try {
        return sortedNumbers(item.getAnnotations());
      } catch {}
    }
    return [];
  }

  function getNoteIDs(item) {
    if (typeof item?.getNotes === "function") {
      return sortedNumbers(item.getNotes());
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

  function getFilePath(item) {
    try {
      return String(item?.getFilePath?.() || "");
    } catch {}
    return "";
  }

  function getItemSnapshot(itemID) {
    const item = Zotero.Items.get(itemID);
    assert.ok(item, `Expected item #${itemID} to exist`);
    return {
      id: item.id,
      key: String(item.key || ""),
      parentID: item.parentID || null,
      title: String(item.getField?.("title") || ""),
      itemTypeID: item.itemTypeID || null,
      attachmentContentType: String(item.attachmentContentType || item.getField?.("attachmentContentType") || ""),
      attachmentLinkMode: String(item.attachmentLinkMode || item.getField?.("attachmentLinkMode") || ""),
      filePath: getFilePath(item),
      attachmentIDs: getAttachmentIDs(item),
      noteIDs: getNoteIDs(item),
      annotationIDs: getAnnotationIDs(item),
    };
  }

  async function reloadItem(itemID) {
    const item = Zotero.Items.get(itemID);
    if (typeof item?.reload === "function") {
      try {
        await item.reload(["primaryData", "childItems"], true);
      } catch {}
    }
    return Zotero.Items.get(itemID) || item;
  }

  async function renderSectionForItem(itemID, expectedTitles = []) {
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
    assert.ok(sectionOptions, "Expected Attachment Version Item Pane section options");
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
        const candidate = queryDeep(livePane, `.toolsbox-attachment-version[data-toolsbox-owner="${sectionID}"]`)
          || queryDeep(liveBody, `.toolsbox-attachment-version[data-toolsbox-owner="${sectionID}"]`)
          || queryAcrossDocuments(mainWindow, `.toolsbox-attachment-version[data-toolsbox-owner="${sectionID}"]`);
        lastRootText = compactText(candidate);
        return candidate && expectedTitles.every((title) => candidate.textContent.includes(title))
          ? candidate
          : null;
      },
      {
        timeoutMs: 8000,
        intervalMs: 100,
        message: `Timed out waiting for Attachment Version Item Pane section; expectedTitles=${JSON.stringify(expectedTitles)} lastRootText=${lastRootText}; renderProbe=${JSON.stringify(renderProbe)}; paneResult=${JSON.stringify(paneResult)}; livePane=${JSON.stringify(describeElement(livePane))}`,
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

  if (!attachmentVersionEnabled) {
    assert.equal(
      plugin.api.itemPane.hasSection(sectionID),
      false,
      "Attachment Version section should stay unregistered by default",
    );
    return {
      mode: "default-off",
      prefName,
      sectionID,
      attachmentVersionEnabled,
      sectionRegistered: false,
    };
  }

  assert.equal(plugin.api.itemPane.hasSection(sectionID), true, "Attachment Version section should register when enabled");

  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Attachment Version E2E Parent",
    },
  });
  const firstAttachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    filename: "toolsbox-attachment-version-e2e-v1.pdf",
    title: "Attachment Version E2E v1.pdf",
    text: "Attachment Version E2E v1",
  });
  const secondAttachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    filename: "toolsbox-attachment-version-e2e-v2.pdf",
    title: "Attachment Version E2E v2.pdf",
    text: "Attachment Version E2E v2",
  });

  await reloadItem(parentItem.id);
  await reloadItem(firstAttachment.id);
  await reloadItem(secondAttachment.id);

  const parentAttachmentIDs = getAttachmentIDs(Zotero.Items.get(parentItem.id));
  assert.deepEqual(
    parentAttachmentIDs,
    sortedNumbers([firstAttachment.id, secondAttachment.id]),
    `Expected parent #${parentItem.id} to own both PDF attachments; parentAttachmentIDs=${JSON.stringify(parentAttachmentIDs)}`,
  );

  const beforeSnapshots = [
    getItemSnapshot(parentItem.id),
    getItemSnapshot(firstAttachment.id),
    getItemSnapshot(secondAttachment.id),
  ];

  const parentRender = await renderSectionForItem(parentItem.id, [
    "Attachment Version E2E v1.pdf",
    "Attachment Version E2E v2.pdf",
  ]);
  const parentRootText = compactText(parentRender.root);
  assert.ok(parentRootText.includes("local attachment versions"), `Expected version count label; rootText=${parentRootText}`);
  assert.equal(
    queryAllDeep(parentRender.liveBody, `.toolsbox-attachment-version[data-toolsbox-owner="${sectionID}"]`).length,
    1,
    "Expected one owner root after parent render",
  );

  const attachmentRender = await renderSectionForItem(firstAttachment.id, [
    "Attachment Version E2E v1.pdf",
    "Attachment Version E2E v2.pdf",
  ]);
  const selectedRow = queryDeep(
    attachmentRender.root,
    `.toolsbox-attachment-version-entry[data-toolsbox-attachment-id="${firstAttachment.id}"][data-toolsbox-selected="true"]`,
  );
  assert.ok(selectedRow, "Expected selected marker on the currently selected attachment row");
  assert.equal(getAttribute(selectedRow, "data-toolsbox-selected"), "true");
  assert.equal(getAttribute(selectedRow, "data-toolsbox-attachment-id"), String(firstAttachment.id));

  const rerenderContext = {
    paneID: attachmentRender.resolvedPaneID,
    doc: attachmentRender.mainWindow.document,
    body: attachmentRender.liveBody,
    item: Zotero.Items.get(firstAttachment.id),
    tabType: "library",
    editable: true,
    setEnabled() {},
    setSectionSummary() {},
    setSectionButtonStatus() {},
  };
  attachmentRender.sectionOptions.onRender(rerenderContext);
  await attachmentRender.sectionOptions.onAsyncRender(rerenderContext);
  attachmentRender.sectionOptions.onRender(rerenderContext);
  await attachmentRender.sectionOptions.onAsyncRender(rerenderContext);

  const ownerRootsAfterRerender = queryAllDeep(
    attachmentRender.liveBody,
    `.toolsbox-attachment-version[data-toolsbox-owner="${sectionID}"]`,
  );
  assert.equal(ownerRootsAfterRerender.length, 1, "Expected repeated render to leave exactly one owner root");

  assert.deepEqual([
    getItemSnapshot(parentItem.id),
    getItemSnapshot(firstAttachment.id),
    getItemSnapshot(secondAttachment.id),
  ], beforeSnapshots, "Expected Attachment Version preview to leave attachment/note/annotation data unchanged");

  return {
    mode: "enabled-local-preview",
    prefName,
    sectionID,
    attachmentVersionEnabled,
    parentItemID: parentItem.id,
    attachmentIDs: [firstAttachment.id, secondAttachment.id],
    parentRootText,
    selectedAttachmentID: firstAttachment.id,
    ownerRootCountAfterRerender: ownerRootsAfterRerender.length,
    itemSnapshotsUnchanged: true,
  };
});
