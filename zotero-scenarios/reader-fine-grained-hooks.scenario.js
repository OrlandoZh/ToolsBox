registerZoteroScenario("reader fine-grained hook diagnostics", async ({ assert, helpers, plugin }) => {
  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Reader Fine-Grained Hook Parent",
    },
  });

  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Reader Fine-Grained Hook PDF",
    text: "Reader fine-grained hook validation",
  });

  const selectionInvocations = [];
  const toolbarInvocations = [];
  const sidebarHeaderInvocations = [];
  const menuInvocations = new Map();
  const selectionMarkerID = `cleanroom-reader-selection-marker-${Date.now()}`;
  const toolbarMarkerID = `cleanroom-reader-toolbar-marker-${Date.now()}`;
  const sidebarHeaderMarkerID = `cleanroom-reader-sidebar-header-marker-${Date.now()}`;
  const menuDefinitions = [
    {
      type: plugin.api.reader.READER_EVENT_TYPES.CREATE_VIEW_CONTEXT_MENU,
      label: "Agent 视图菜单动作",
      params: {
        x: 28,
        y: 36,
      },
    },
    {
      type: plugin.api.reader.READER_EVENT_TYPES.CREATE_ANNOTATION_CONTEXT_MENU,
      label: "Agent 批注菜单动作",
      params: {
        ids: ["cleanroom-annotation-probe"],
      },
    },
    {
      type: plugin.api.reader.READER_EVENT_TYPES.CREATE_COLOR_CONTEXT_MENU,
      label: "Agent 颜色菜单动作",
      color: "#ff6666",
      params: {
        color: "#ff6666",
      },
    },
    {
      type: plugin.api.reader.READER_EVENT_TYPES.CREATE_THUMBNAIL_CONTEXT_MENU,
      label: "Agent 缩略图菜单动作",
      params: {
        pageIndex: 0,
        pageLabel: "1",
      },
    },
    {
      type: plugin.api.reader.READER_EVENT_TYPES.CREATE_SELECTOR_CONTEXT_MENU,
      label: "Agent 选择器菜单动作",
      params: {
        selector: "highlight",
      },
    },
  ];

  plugin.api.reader.unregisterAllEventListeners();

  plugin.api.reader.registerEventListener(
    plugin.api.reader.READER_EVENT_TYPES.RENDER_TEXT_SELECTION_POPUP,
    (event) => {
      const record = {
        type: String(event?.type || ""),
        itemID: Number.isFinite(event?.reader?.itemID) ? event.reader.itemID : null,
        hasDoc: Boolean(event?.doc && typeof event.doc.createElement === "function"),
        hasAppend: typeof event?.append === "function",
        appended: false,
        appendError: null,
      };

      if (record.hasDoc && record.hasAppend) {
        try {
          const marker = event.doc.createElement("div");
          marker.setAttribute("id", selectionMarkerID);
          marker.textContent = "Agent 文本选择浮层";
          event.append(marker);
          record.appended = true;
        }
        catch (error) {
          record.appendError = String(error?.message || error);
        }
      }

      selectionInvocations.push(record);
    },
  );

  plugin.api.reader.registerEventListener(
    plugin.api.reader.READER_EVENT_TYPES.RENDER_TOOLBAR,
    (event) => {
      const record = {
        type: String(event?.type || ""),
        itemID: Number.isFinite(event?.reader?.itemID) ? event.reader.itemID : null,
        hasDoc: Boolean(event?.doc && typeof event.doc.createElement === "function"),
        hasAppend: typeof event?.append === "function",
        appended: false,
        appendError: null,
      };

      if (record.hasDoc && record.hasAppend) {
        try {
          const marker = event.doc.createElement("div");
          marker.setAttribute("id", toolbarMarkerID);
          marker.textContent = "Agent Reader Toolbar";
          event.append(marker);
          record.appended = true;
        }
        catch (error) {
          record.appendError = String(error?.message || error);
        }
      }

      toolbarInvocations.push(record);
    },
  );

  plugin.api.reader.registerEventListener(
    plugin.api.reader.READER_EVENT_TYPES.RENDER_SIDEBAR_ANNOTATION_HEADER,
    (event) => {
      const record = {
        type: String(event?.type || ""),
        itemID: Number.isFinite(event?.reader?.itemID) ? event.reader.itemID : null,
        hasDoc: Boolean(event?.doc && typeof event.doc.createElement === "function"),
        hasAppend: typeof event?.append === "function",
        appended: false,
        appendError: null,
      };

      if (record.hasDoc && record.hasAppend) {
        try {
          const marker = event.doc.createElement("div");
          marker.setAttribute("id", sidebarHeaderMarkerID);
          marker.textContent = "Agent 侧栏批注头部";
          event.append(marker);
          record.appended = true;
        }
        catch (error) {
          record.appendError = String(error?.message || error);
        }
      }

      sidebarHeaderInvocations.push(record);
    },
  );

  menuDefinitions.forEach((definition) => {
    plugin.api.reader.registerEventListener(
      definition.type,
      (event) => {
        const record = {
          type: String(event?.type || ""),
          itemID: Number.isFinite(event?.reader?.itemID) ? event.reader.itemID : null,
          hasAppend: typeof event?.append === "function",
          appended: false,
          appendError: null,
        };

        if (record.hasAppend) {
          try {
            event.append({
              label: definition.label,
              persistent: true,
              color: definition.color,
              onCommand() {},
            });
            record.appended = true;
          }
          catch (error) {
            record.appendError = String(error?.message || error);
          }
        }

        const entries = menuInvocations.get(definition.type) || [];
        entries.push(record);
        menuInvocations.set(definition.type, entries);
      },
    );
  });

  assert.equal(plugin.api.reader.getEventListenerCount(), 3 + menuDefinitions.length);

  try {
    await helpers.openReader(attachment.id);

    const selectionProbe = await helpers.dispatchReaderCustomEvent(attachment.id, {
      type: plugin.api.reader.READER_EVENT_TYPES.RENDER_TEXT_SELECTION_POPUP,
      params: {
        annotation: {
          text: "Agent selection text",
          color: "#ffd400",
          pageLabel: "1",
        },
        rect: [40, 40, 140, 84],
      },
    });

    const toolbarProbe = await helpers.dispatchReaderCustomEvent(attachment.id, {
      type: plugin.api.reader.READER_EVENT_TYPES.RENDER_TOOLBAR,
      params: {
        view: "primary",
      },
    });

    const menuProbes = [];
    for (const definition of menuDefinitions) {
      const probe = await helpers.dispatchReaderCustomEvent(attachment.id, {
        type: definition.type,
        includeDoc: false,
        params: definition.params,
      });
      menuProbes.push({
        type: definition.type,
        label: definition.label,
        color: definition.color || null,
        probe,
      });
    }

    const sidebarHeaderProbe = await helpers.dispatchReaderCustomEvent(attachment.id, {
      type: plugin.api.reader.READER_EVENT_TYPES.RENDER_SIDEBAR_ANNOTATION_HEADER,
      params: {
        annotation: {
          id: "cleanroom-sidebar-annotation",
          comment: "Sidebar annotation probe",
          color: "#00aa88",
        },
      },
    });

    const firstSelectionInvocation = selectionInvocations[0];
    const toolbarInvocationForAttachment = toolbarInvocations.find((entry) => (
      entry?.type === "renderToolbar"
      && entry?.itemID === attachment.id
    )) || toolbarInvocations[0];
    const sidebarHeaderInvocationForAttachment = sidebarHeaderInvocations.find((entry) => (
      entry?.type === "renderSidebarAnnotationHeader"
      && entry?.itemID === attachment.id
    )) || sidebarHeaderInvocations[0];

    assert.equal(selectionInvocations.length, 1);
    assert.equal(firstSelectionInvocation.type, "renderTextSelectionPopup");
    assert.equal(firstSelectionInvocation.itemID, attachment.id);
    assert.equal(firstSelectionInvocation.hasDoc, true);
    assert.equal(firstSelectionInvocation.hasAppend, true);
    assert.equal(firstSelectionInvocation.appended, true);
    assert.equal(firstSelectionInvocation.appendError, null);

    assert.equal(selectionProbe.type, "renderTextSelectionPopup");
    assert.equal(selectionProbe.itemID, attachment.id);
    assert.equal(selectionProbe.appendedGroupCount, 1);
    assert.equal(selectionProbe.appendedItemCount, 1);
    assert.equal(selectionProbe.appendedGroups[0][0].kind, "element");
    assert.equal(selectionProbe.appendedGroups[0][0].tagName, "div");
    assert.equal(selectionProbe.appendedGroups[0][0].id, selectionMarkerID);
    assert.equal(selectionProbe.appendedGroups[0][0].textContent, "Agent 文本选择浮层");

    assert.ok(toolbarInvocations.length >= 1);
    assert.ok(toolbarInvocationForAttachment);
    assert.equal(toolbarInvocationForAttachment.type, "renderToolbar");
    assert.equal(toolbarInvocationForAttachment.itemID, attachment.id);
    assert.equal(toolbarInvocationForAttachment.hasDoc, true);
    assert.equal(toolbarInvocationForAttachment.hasAppend, true);
    assert.equal(toolbarInvocationForAttachment.appended, true);
    assert.equal(toolbarInvocationForAttachment.appendError, null);

    assert.equal(toolbarProbe.type, "renderToolbar");
    assert.equal(toolbarProbe.itemID, attachment.id);
    assert.equal(toolbarProbe.appendedGroupCount, 1);
    assert.equal(toolbarProbe.appendedItemCount, 1);
    assert.equal(toolbarProbe.appendedGroups[0][0].kind, "element");
    assert.equal(toolbarProbe.appendedGroups[0][0].tagName, "div");
    assert.equal(toolbarProbe.appendedGroups[0][0].id, toolbarMarkerID);
    assert.equal(toolbarProbe.appendedGroups[0][0].textContent, "Agent Reader Toolbar");

    assert.ok(sidebarHeaderInvocations.length >= 1);
    assert.ok(sidebarHeaderInvocationForAttachment);
    assert.equal(sidebarHeaderInvocationForAttachment.type, "renderSidebarAnnotationHeader");
    assert.equal(sidebarHeaderInvocationForAttachment.itemID, attachment.id);
    assert.equal(sidebarHeaderInvocationForAttachment.hasDoc, true);
    assert.equal(sidebarHeaderInvocationForAttachment.hasAppend, true);
    assert.equal(sidebarHeaderInvocationForAttachment.appended, true);
    assert.equal(sidebarHeaderInvocationForAttachment.appendError, null);

    assert.equal(sidebarHeaderProbe.type, "renderSidebarAnnotationHeader");
    assert.equal(sidebarHeaderProbe.itemID, attachment.id);
    assert.equal(sidebarHeaderProbe.appendedGroupCount, 1);
    assert.equal(sidebarHeaderProbe.appendedItemCount, 1);
    assert.equal(sidebarHeaderProbe.appendedGroups[0][0].kind, "element");
    assert.equal(sidebarHeaderProbe.appendedGroups[0][0].tagName, "div");
    assert.equal(sidebarHeaderProbe.appendedGroups[0][0].id, sidebarHeaderMarkerID);
    assert.equal(sidebarHeaderProbe.appendedGroups[0][0].textContent, "Agent 侧栏批注头部");

    menuDefinitions.forEach((definition) => {
      const probeEntry = menuProbes.find((entry) => entry.type === definition.type);
      const invocations = menuInvocations.get(definition.type) || [];
      const firstMenuInvocation = invocations.find((entry) => (
        entry?.type === definition.type
        && entry?.itemID === attachment.id
      )) || invocations[0];

      assert.ok(probeEntry);
      assert.ok(invocations.length >= 1);
      assert.ok(firstMenuInvocation);
      assert.equal(firstMenuInvocation.type, definition.type);
      assert.equal(firstMenuInvocation.itemID, attachment.id);
      assert.equal(firstMenuInvocation.hasAppend, true);
      assert.equal(firstMenuInvocation.appended, true);
      assert.equal(firstMenuInvocation.appendError, null);

      assert.equal(probeEntry.probe.type, definition.type);
      assert.equal(probeEntry.probe.itemID, attachment.id);
      assert.equal(probeEntry.probe.appendedGroupCount, 1);
      assert.equal(probeEntry.probe.appendedItemCount, 1);
      assert.equal(probeEntry.probe.appendedGroups[0][0].kind, "menu-item");
      assert.equal(probeEntry.probe.appendedGroups[0][0].label, definition.label);
      assert.equal(probeEntry.probe.appendedGroups[0][0].hasCommand, true);
      if (definition.color) {
        assert.equal(probeEntry.probe.appendedGroups[0][0].color, definition.color);
      }
    });

    const snapshot = plugin.api.agent.runScenario("reader-current", {
      itemID: attachment.id,
    });
    const eventTypes = snapshot.eventListeners.map((entry) => entry.type);

    assert.equal(snapshot.eventListenerCount, 3 + menuDefinitions.length);
    assert.includes(eventTypes, "renderToolbar");
    assert.includes(eventTypes, "renderTextSelectionPopup");
    assert.includes(eventTypes, "renderSidebarAnnotationHeader");
    menuDefinitions.forEach((definition) => {
      assert.includes(eventTypes, definition.type);
    });

    const removed = plugin.api.reader.unregisterAllEventListeners();
    assert.equal(removed, 3 + menuDefinitions.length);
    assert.equal(plugin.api.reader.getEventListenerCount(), 0);

    return {
      attachmentID: attachment.id,
      selectionProbe: {
        type: selectionProbe.type,
        dispatchMode: selectionProbe.dispatchMode,
        appendedItemCount: selectionProbe.appendedItemCount,
      },
      toolbarProbe: {
        type: toolbarProbe.type,
        dispatchMode: toolbarProbe.dispatchMode,
        appendedItemCount: toolbarProbe.appendedItemCount,
      },
      sidebarHeaderProbe: {
        type: sidebarHeaderProbe.type,
        dispatchMode: sidebarHeaderProbe.dispatchMode,
        appendedItemCount: sidebarHeaderProbe.appendedItemCount,
      },
      menuProbes: menuProbes.map((entry) => ({
        type: entry.type,
        label: entry.label,
        dispatchMode: entry.probe.dispatchMode,
        appendedItemCount: entry.probe.appendedItemCount,
      })),
      snapshot: {
        eventListenerCount: snapshot.eventListenerCount,
        eventTypes,
      },
      toolbarInvocationCount: toolbarInvocations.length,
      removed,
    };
  }
  finally {
    plugin.api.reader.unregisterAllEventListeners();
  }
});
