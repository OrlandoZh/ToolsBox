export function createFeatureComposer({
  config,
  logger,
  host,
  prefs,
  i18n,
  preferencePanes,
  commandPalette,
  menuManager,
  reader,
  itemTree,
  itemPane,
  notifier,
  getPrimaryWindow,
  runPrimaryAction,
  runReaderDemo,
  getColumnValue,
  getItemSummary,
  createSectionLine,
  demoState,
  demoSectionRefreshers,
  demoInfoRowID,
  demoSectionID,
  demoColumnKey,
  demoNotifierID,
  updateDemoNotifierState,
}) {
  let baselineReady = false;

  async function registerBaselineFeatures() {
    if (baselineReady) {
      return;
    }
    baselineReady = true;

    await preferencePanes.registerPane({
      id: `${config.addonRef}-preferences`,
      src: "content/preferences.xhtml",
      label: config.addonName,
      image: config.icons?.["48"] || config.icons?.["96"],
    });

    commandPalette.registerCommand({
      id: `${config.addonRef}-primary-action`,
      label: i18n.t("cleanroom-command-label", "Open Cleanroom Action"),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-command-description",
        "Run the default clean-room template action.",
      ),
      condition: () => Boolean(prefs.get("enabled")),
      handler: () => {
        runPrimaryAction();
      },
    });

    commandPalette.registerCommand({
      id: `${config.addonRef}-reader-summary`,
      label: i18n.t(
        "cleanroom-reader-menu-label",
        "Show Reader Demo Summary",
      ),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-reader-command-description",
        "Show the active reader summary.",
      ),
      condition: () => Boolean(reader.getActiveSummary()),
      handler: () => {
        runReaderDemo();
      },
    });

    if (menuManager.isOfficialAPIAvailable()) {
      menuManager.registerContextMenuItem({
        id: `${config.addonRef}-context-action`,
        l10nID: "cleanroom-menu-label",
        onCommand: (event, context) => {
          runPrimaryAction(context?.window || getPrimaryWindow());
        },
        onShowing: (event, context) => {
          const hasItems = Array.isArray(context?.items) && context.items.length > 0;
          context.setVisible(Boolean(prefs.get("enabled")) && hasItems);
        },
      });

      menuManager.registerReaderMenuItem(
        {
          target: menuManager.MENU_TARGETS.READER_MENU_VIEW,
        },
        {
          id: `${config.addonRef}-reader-summary`,
          l10nID: "cleanroom-reader-menu-label",
          onShowing: (event, context) => {
            if (context && typeof context.setVisible === "function") {
              context.setVisible(Boolean(reader.getActiveSummary()));
            }
          },
          onCommand: () => {
            runReaderDemo();
          },
        },
      );
    }

    itemTree.registerColumn({
      dataKey: demoColumnKey,
      label: i18n.t("cleanroom-item-tree-label", "Cleanroom"),
      width: "110",
      fixedWidth: false,
      sortable: false,
      enabledTreeIDs: ["main"],
      dataProvider: (item) => getColumnValue(item),
      renderCell: itemTree.createConditionalCellRenderer(
        (value) => String(value || "").includes("0"),
        { color: "#8b5cf6", fontWeight: "600" },
        { color: "#0f766e", fontWeight: "600" },
      ),
    });

    itemPane.registerInfoRow({
      rowID: demoInfoRowID,
      label: {
        l10nID: "cleanroom-item-pane-info-row-label",
      },
      position: "afterCreators",
      multiline: true,
      editable: false,
      onGetData: ({ item }) => {
        return getItemSummary(item);
      },
      onItemChange: ({ item, setEnabled }) => {
        setEnabled(Boolean(item));
      },
    });

    itemPane.registerSection({
      paneID: demoSectionID,
      header: {
        l10nID: "cleanroom-item-pane-section-header",
        icon: host.resolveContentUrl("content/icons/icon-48.png"),
      },
      sidenav: {
        l10nID: "cleanroom-item-pane-section-sidenav",
        icon: host.resolveContentUrl("content/icons/icon-48.png"),
      },
      onInit: ({ refresh }) => {
        if (typeof refresh === "function") {
          demoSectionRefreshers.add(refresh);
        }
      },
      onDestroy: ({ refresh }) => {
        if (typeof refresh === "function") {
          demoSectionRefreshers.delete(refresh);
        }
      },
      onItemChange: ({ item, setEnabled, setSectionSummary }) => {
        setEnabled(Boolean(item));
        if (item) {
          setSectionSummary(getItemSummary(item));
        }
      },
      onRender: ({ doc, body, item, setSectionSummary }) => {
        body.replaceChildren(
          createSectionLine(
            doc,
            i18n.t("cleanroom-demo-field-item", "Item"),
            getItemSummary(item),
          ),
          createSectionLine(
            doc,
            i18n.t("cleanroom-demo-field-shortcut", "Shortcut"),
            `${demoState.shortcutLabel} · ${demoState.shortcutTriggerCount}`,
          ),
          createSectionLine(
            doc,
            i18n.t("cleanroom-demo-field-notifier", "Notifier"),
            demoState.lastNotifierEvent,
          ),
          createSectionLine(
            doc,
            i18n.t("cleanroom-demo-field-status", "Status"),
            i18n.t("cleanroom-demo-status-ready", "Baseline demos ready"),
          ),
        );

        if (item) {
          setSectionSummary(getItemSummary(item));
        }
      },
    });

    notifier.subscribe(
      ["item", "file", "tab"],
      (event, type, ids) => {
        updateDemoNotifierState(event, type, ids);
      },
      {
        id: demoNotifierID,
      },
    );

    logger.info("plugin.baseline.ready", {
      preferencePanes: preferencePanes.getPaneCount(),
      commands: commandPalette.getCommandCount(),
      officialMenus: menuManager.getMenuCount(),
      infoRows: itemPane.getInfoRowCount(),
      sections: itemPane.getSectionCount(),
      columns: itemTree.getColumnCount(),
      notifiers: notifier.getActiveCount(),
    });
  }

  return {
    registerBaselineFeatures,
  };
}
