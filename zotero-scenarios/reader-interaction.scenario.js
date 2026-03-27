registerZoteroScenario("reader interaction diagnostics", async ({ assert, helpers, plugin }) => {
  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Reader Interaction Parent",
    },
  });

  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Reader Interaction PDF",
    text: "Reader interaction validation",
  });

  await helpers.openReader(attachment.id);

  const details = await helpers.waitFor(
    () => {
      const snapshot = plugin.api.agent.runScenario("reader-current", {
        itemID: attachment.id,
      });
      return snapshot?.interaction?.itemID === attachment.id ? snapshot : null;
    },
    {
      timeoutMs: 8000,
      intervalMs: 100,
      message: `Timed out waiting for reader interaction snapshot for item #${attachment.id}`,
    },
  );

  assert.equal(details.summary.itemID, attachment.id);
  assert.equal(details.summary.type, "pdf");
  assert.equal(details.interaction.itemID, attachment.id);
  assert.equal(details.interaction.annotationCount, details.summary.annotationCount);
  assert.ok(Array.isArray(details.interaction.annotationDetails));
  assert.ok(details.interaction.uiState && typeof details.interaction.uiState === "object");
  assert.ok(
    typeof details.interaction.uiState.sidebarOpen === "boolean"
    || details.interaction.uiState.sidebarOpen === null,
  );
  assert.ok(
    Number.isFinite(details.interaction.uiState.sidebarWidth)
    || details.interaction.uiState.sidebarWidth === null,
  );
  assert.ok(
    typeof details.interaction.uiState.textSelectionAnnotationMode === "string"
    || details.interaction.uiState.textSelectionAnnotationMode === null,
  );
  assert.ok(
    typeof details.interaction.uiState.sidebarView === "string"
    || details.interaction.uiState.sidebarView === null,
  );
  assert.ok(
    typeof details.interaction.uiState.flowMode === "string"
    || details.interaction.uiState.flowMode === null,
  );
  assert.ok(
    typeof details.interaction.uiState.splitType === "string"
    || details.interaction.uiState.splitType === null,
  );
  assert.ok(
    Number.isFinite(details.interaction.uiState.scrollMode)
    || details.interaction.uiState.scrollMode === null,
  );
  assert.ok(
    Number.isFinite(details.interaction.uiState.spreadMode)
    || details.interaction.uiState.spreadMode === null,
  );
  assert.ok(
    details.interaction.uiState.scale === null
    || Number.isFinite(Number(details.interaction.uiState.scale))
    || typeof details.interaction.uiState.scale === "string",
  );
  assert.ok(
    typeof details.interaction.uiState.contextPaneOpen === "boolean"
    || details.interaction.uiState.contextPaneOpen === null,
  );
  assert.ok(
    typeof details.interaction.uiState.hasSecondViewState === "boolean"
    || details.interaction.uiState.hasSecondViewState === null,
  );
  assert.ok(details.interaction.uiState.navigation && typeof details.interaction.uiState.navigation === "object");
  assert.ok(Array.isArray(details.windowStates));

  const selectionPopupProbe = await helpers.dispatchReaderCustomEvent(attachment.id, {
    type: plugin.api.reader.READER_EVENT_TYPES.RENDER_TEXT_SELECTION_POPUP,
    params: {
      annotation: {
        text: "Interaction probe text",
        color: "#ffd400",
        pageLabel: "1",
      },
      rect: [40, 40, 140, 84],
    },
  });

  const sidebarHeaderProbe = await helpers.dispatchReaderCustomEvent(attachment.id, {
    type: plugin.api.reader.READER_EVENT_TYPES.RENDER_SIDEBAR_ANNOTATION_HEADER,
    params: {
      annotation: {
        id: "interaction-sidebar-annotation",
        comment: "Sidebar header probe",
        color: "#00aa88",
      },
    },
  });

  const contextMenuDefinitions = [
    plugin.api.reader.READER_EVENT_TYPES.CREATE_VIEW_CONTEXT_MENU,
    plugin.api.reader.READER_EVENT_TYPES.CREATE_ANNOTATION_CONTEXT_MENU,
    plugin.api.reader.READER_EVENT_TYPES.CREATE_COLOR_CONTEXT_MENU,
    plugin.api.reader.READER_EVENT_TYPES.CREATE_THUMBNAIL_CONTEXT_MENU,
    plugin.api.reader.READER_EVENT_TYPES.CREATE_SELECTOR_CONTEXT_MENU,
  ];

  const contextMenuProbes = [];
  for (const menuType of contextMenuDefinitions) {
    const probe = await helpers.dispatchReaderCustomEvent(attachment.id, {
      type: menuType,
      includeDoc: false,
      params: menuType === plugin.api.reader.READER_EVENT_TYPES.CREATE_VIEW_CONTEXT_MENU
        ? { x: 28, y: 36 }
        : menuType === plugin.api.reader.READER_EVENT_TYPES.CREATE_ANNOTATION_CONTEXT_MENU
          ? { ids: ["interaction-annotation-probe"] }
          : menuType === plugin.api.reader.READER_EVENT_TYPES.CREATE_COLOR_CONTEXT_MENU
            ? { color: "#ff6666" }
            : menuType === plugin.api.reader.READER_EVENT_TYPES.CREATE_THUMBNAIL_CONTEXT_MENU
              ? { pageIndex: 0, pageLabel: "1" }
              : { selector: "highlight" },
    });
    contextMenuProbes.push({
      type: menuType,
      dispatchMode: probe?.dispatchMode || null,
    });
  }

  const selectionPopupDispatchMode = selectionPopupProbe?.dispatchMode || null;
  const selectionPopupAppendedItemCount = Number.isFinite(selectionPopupProbe?.appendedItemCount)
    ? selectionPopupProbe.appendedItemCount
    : null;
  const sidebarHeaderDispatchMode = sidebarHeaderProbe?.dispatchMode || null;
  const sidebarHeaderAppendedItemCount = Number.isFinite(sidebarHeaderProbe?.appendedItemCount)
    ? sidebarHeaderProbe.appendedItemCount
    : null;
  const contextMenuProbeCount = contextMenuProbes.length;
  const contextMenuObservedTypes = contextMenuProbes
    .map((probe) => probe.type)
    .filter(Boolean);
  const contextMenuSyntheticFallbackTypes = contextMenuProbes
    .filter((probe) => probe.dispatchMode === "synthetic-fallback")
    .map((probe) => probe.type);

  assert.ok(
    selectionPopupDispatchMode === null
    || typeof selectionPopupDispatchMode === "string",
  );
  assert.ok(
    selectionPopupAppendedItemCount === null
    || Number.isFinite(selectionPopupAppendedItemCount),
  );
  assert.ok(
    sidebarHeaderDispatchMode === null
    || typeof sidebarHeaderDispatchMode === "string",
  );
  assert.ok(
    sidebarHeaderAppendedItemCount === null
    || Number.isFinite(sidebarHeaderAppendedItemCount),
  );
  assert.ok(Number.isFinite(contextMenuProbeCount));
  assert.ok(Array.isArray(contextMenuObservedTypes));
  assert.ok(Array.isArray(contextMenuSyntheticFallbackTypes));

  return {
    attachmentID: attachment.id,
    summary: details.summary,
    interaction: {
      annotationCount: details.interaction.annotationCount,
      annotationDetailCount: details.interaction.annotationDetailCount,
      matchingWindowStateCount: details.interaction.matchingWindowStateCount,
      hasMatchingWindowState: details.interaction.hasMatchingWindowState,
      sidebarOpen: details.interaction.uiState.sidebarOpen,
      sidebarWidth: details.interaction.uiState.sidebarWidth,
      sidebarView: details.interaction.uiState.sidebarView,
      textSelectionAnnotationMode: details.interaction.uiState.textSelectionAnnotationMode,
      toolType: details.interaction.uiState.toolType,
      flowMode: details.interaction.uiState.flowMode,
      splitType: details.interaction.uiState.splitType,
      scrollMode: details.interaction.uiState.scrollMode,
      spreadMode: details.interaction.uiState.spreadMode,
      scale: details.interaction.uiState.scale,
      contextPaneOpen: details.interaction.uiState.contextPaneOpen,
      hasSecondViewState: details.interaction.uiState.hasSecondViewState,
      canNavigateToNextPage: details.interaction.uiState.navigation.canNavigateToNextPage,
    },
    windowStateCount: details.windowStates.length,
    selectionPopupDispatchMode,
    selectionPopupAppendedItemCount,
    sidebarHeaderDispatchMode,
    sidebarHeaderAppendedItemCount,
    contextMenuProbeCount,
    contextMenuObservedTypes,
    contextMenuSyntheticFallbackTypes,
  };
});
