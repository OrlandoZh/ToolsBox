registerZoteroScenario("merge annotations enabled writeback workflow", async ({
  assert,
  addonConfig,
  helpers,
  plugin,
  Zotero,
  Services,
}) => {
  const sectionID = "toolsbox-merge-annotations";
  const markerPrefix = "toolsbox-merge-annotations-note:source=";
  const prefName = `${addonConfig.prefsPrefix}.mergeAnnotations.enabled`;
  const mergeAnnotationsEnabled = Services.prefs.getBoolPref(prefName, false);

  function getNoteHTML(note) {
    try {
      if (typeof note?.getNote === "function") {
        return String(note.getNote() || "");
      }
    }
    catch {}
    return String(note?.note || note?.getField?.("note") || "");
  }

  function getOwnedMergeNotes(parentID) {
    const parent = Zotero.Items.get(parentID);
    const marker = `${markerPrefix}${parentID}`;
    const noteIDs = typeof parent?.getNotes === "function" ? parent.getNotes() : [];
    return noteIDs
      .map((noteID) => Zotero.Items.get(noteID))
      .filter((note) => note && typeof note.isNote === "function" && note.isNote())
      .filter((note) => getNoteHTML(note).includes(marker));
  }

  function getAnnotationSnapshot(annotationID) {
    const annotation = Zotero.Items.get(annotationID);
    assert.ok(annotation, `Expected annotation #${annotationID} to exist`);
    return {
      id: annotation.id,
      parentID: annotation.parentID,
      text: String(annotation.getField?.("annotationText") || annotation.annotationText || ""),
      comment: String(annotation.getField?.("annotationComment") || annotation.annotationComment || ""),
      color: String(annotation.getField?.("annotationColor") || annotation.annotationColor || ""),
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
    throw new Error("Unable to click merge annotations writeback button");
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
    }
    catch {}

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
        }
        catch {}
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
    }
    catch {}
    return {
      tagName: element.localName || element.tagName || null,
      attrs,
      text: String(element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
      childElementCount: Number(element.childElementCount || 0),
      children: Array.from(element.children || []).slice(0, 8).map((child) => ({
        tagName: child.localName || child.tagName || null,
        attrs: Array.from(child.attributes || []).reduce((acc, attr) => {
          acc[attr.name] = attr.value;
          return acc;
        }, {}),
        text: String(child.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
        childElementCount: Number(child.childElementCount || 0),
      })),
    };
  }

  function compactText(element, limit = 500) {
    return String(element?.textContent || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  if (!mergeAnnotationsEnabled) {
    assert.equal(
      plugin.api.itemPane.hasSection(sectionID),
      false,
      "Merge Annotations section should stay unregistered by default",
    );
    return {
      mode: "default-off",
      prefName,
      sectionID,
      mergeAnnotationsEnabled,
      sectionRegistered: false,
    };
  }

  assert.equal(plugin.api.itemPane.hasSection(sectionID), true, "Merge Annotations section should register when enabled");

  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Merge Annotations Writeback E2E Parent",
    },
  });
  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Merge Annotations Writeback E2E PDF",
    text: "Merge annotations writeback validation",
  });
  const parentAttachmentIDs = typeof Zotero.Items.get(parentItem.id)?.getAttachments === "function"
    ? Zotero.Items.get(parentItem.id).getAttachments()
    : [];
  assert.ok(
    Array.isArray(parentAttachmentIDs) && parentAttachmentIDs.includes(attachment.id),
    `Expected PDF attachment #${attachment.id} to be a child of parent #${parentItem.id}; parentAttachmentIDs=${JSON.stringify(parentAttachmentIDs)} attachmentParentID=${attachment.parentID}`,
  );

  helpers.addCleanup(async () => {
    for (const note of getOwnedMergeNotes(parentItem.id)) {
      const current = Zotero.Items.get(note.id);
      if (current && typeof current.eraseTx === "function") {
        await current.eraseTx();
      }
    }
  });

  await helpers.openReader(attachment.id);
  assert.equal(plugin.api.reader.isAnnotationsAvailable(), true);

  const firstAnnotation = await plugin.api.reader.createAnnotation(attachment.id, {
    type: "note",
    comment: "First merge quote",
    color: "#ffd400",
    pageIndex: 0,
  });
  const secondAnnotation = await plugin.api.reader.createAnnotation(attachment.id, {
    type: "note",
    comment: "Second standalone note",
    color: "#00aa88",
    pageIndex: 1,
  });

  assert.ok(firstAnnotation && typeof firstAnnotation.id === "number", "Expected first annotation to be created");
  assert.ok(secondAnnotation && typeof secondAnnotation.id === "number", "Expected second annotation to be created");

  const originalSnapshots = [
    getAnnotationSnapshot(firstAnnotation.id),
    getAnnotationSnapshot(secondAnnotation.id),
  ];

  await helpers.selectItem(parentItem.id);
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
  let lastRootText = "";
  const root = await helpers.waitFor(
    () => {
      const candidate = queryDeep(livePane, `.toolsbox-merge-annotations[data-toolsbox-owner="${sectionID}"]`)
        || queryAcrossDocuments(mainWindow, `.toolsbox-merge-annotations[data-toolsbox-owner="${sectionID}"]`);
      lastRootText = compactText(candidate);
      return candidate
        && candidate.textContent.includes("First merge quote")
        && candidate.textContent.includes("Second standalone note")
        ? candidate
        : null;
    },
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: `Timed out waiting for Merge Annotations Item Pane section preview; lastRootText=${lastRootText}; paneResult=${JSON.stringify(paneResult)}; livePane=${JSON.stringify(describeElement(livePane))}`,
    },
  );
  assert.ok(root.textContent.includes("First merge quote"), `Expected first annotation text in preview; rootText=${compactText(root)}`);
  assert.ok(root.textContent.includes("Second standalone note"), `Expected second annotation comment in preview; rootText=${compactText(root)}`);

  const button = queryDeep(root, ".toolsbox-merge-annotations-writeback-button");
  assert.ok(button, "Expected Merge Annotations writeback button");
  const firstActivation = clickElement(button);

  const firstWrite = await helpers.waitFor(
    () => {
      const notes = getOwnedMergeNotes(parentItem.id);
      if (notes.length !== 1) {
        return null;
      }
      const html = getNoteHTML(notes[0]);
      return html.includes("First merge quote") && html.includes("Second standalone note")
        ? { note: notes[0], html }
        : null;
    },
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: "Timed out waiting for first owned merge note writeback",
    },
  );

  const noteID = firstWrite.note.id;
  assert.ok(noteID, "Expected owned merge note to have an item ID");

  await helpers.waitFor(() => button.disabled === false, {
    timeoutMs: 5000,
    intervalMs: 100,
    message: "Timed out waiting for writeback button to re-enable after first click",
  });

  const thirdAnnotation = await plugin.api.reader.createAnnotation(attachment.id, {
    type: "note",
    comment: "Third merge quote after first writeback",
    color: "#ff6666",
    pageIndex: 2,
  });
  assert.ok(thirdAnnotation && typeof thirdAnnotation.id === "number", "Expected third annotation to be created");
  const thirdSnapshot = getAnnotationSnapshot(thirdAnnotation.id);

  const secondActivation = clickElement(button);
  const secondWrite = await helpers.waitFor(
    () => {
      const notes = getOwnedMergeNotes(parentItem.id);
      if (notes.length !== 1 || notes[0].id !== noteID) {
        return null;
      }
      const html = getNoteHTML(notes[0]);
      return html.includes("Third merge quote after first writeback")
        ? { note: notes[0], html }
        : null;
    },
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: "Timed out waiting for second owned merge note update",
    },
  );

  assert.equal(secondWrite.note.id, noteID, "Expected second writeback to update the existing owned note");
  assert.equal(getOwnedMergeNotes(parentItem.id).length, 1, "Expected no duplicate ToolsBox merge notes");
  assert.deepEqual([
    getAnnotationSnapshot(firstAnnotation.id),
    getAnnotationSnapshot(secondAnnotation.id),
  ], originalSnapshots, "Expected original annotations to remain unchanged by writeback");
  assert.deepEqual(getAnnotationSnapshot(thirdAnnotation.id), thirdSnapshot, "Expected newly added annotation to remain unchanged by writeback");

  return {
    mode: "enabled-writeback",
    prefName,
    sectionID,
    mergeAnnotationsEnabled,
    parentItemID: parentItem.id,
    attachmentID: attachment.id,
    annotationIDs: [firstAnnotation.id, secondAnnotation.id, thirdAnnotation.id],
    noteID,
    firstActivation,
    secondActivation,
    ownedMergeNoteCount: getOwnedMergeNotes(parentItem.id).length,
    firstNoteContainsMarker: firstWrite.html.includes(`${markerPrefix}${parentItem.id}`),
    secondNoteContainsThirdAnnotation: secondWrite.html.includes("Third merge quote after first writeback"),
    annotationsUnchanged: true,
  };
});
