import { isOptionalBundleEnabled } from "./optional-bundles.js";

export function createFeatureComposer({
  config,
  logger,
  host,
  prefs,
  i18n,
  preferencePanes,
  commandPalette,
  readerSelectionActions,
  menuManager,
  reader,
  itemTree,
  itemPane,
  notifier,
  getPrimaryWindow,
  runPrimaryAction,
  runReaderDemo,
  runReaderSelectionActionDemo,
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
  bundleRuntime,
  openReactDemoWindow,
  presentReactSurface,
  renderReactItemPaneSurface,
  unmountReactItemPaneSurface,
}) {
  let baselineReady = false;
  const reactUIBundleEnabled = isOptionalBundleEnabled(bundleRuntime, "react-ui");
  const reactSurfacePresenter = typeof presentReactSurface === "function"
    ? presentReactSurface
    : renderReactItemPaneSurface;

  function createItemPaneContractRoot(doc, paneID, children = []) {
    if (!doc || typeof doc.createElement !== "function") {
      return null;
    }

    const root = doc.createElement("vbox");
    const rootID = `${paneID}-root`;
    root.id = rootID;
    root.className = "cleanroom-item-pane-root";
    if (!root.dataset || typeof root.dataset !== "object") {
      root.dataset = {};
    }
    root.dataset.cleanroomItemPaneRoot = "true";
    root.dataset.cleanroomPaneID = paneID;

    if (typeof root.setAttribute === "function") {
      root.setAttribute("data-cleanroom-item-pane-root", "true");
      root.setAttribute("data-cleanroom-pane-id", paneID);
      root.setAttribute("class", "cleanroom-item-pane-root");
      root.setAttribute("id", rootID);
    }

    children.forEach((child) => {
      if (typeof root.appendChild === "function") {
        root.appendChild(child);
      }
    });

    return root;
  }

  function getScriptLoader(targetWindow = null) {
    const windowServices = targetWindow?.Services;
    if (windowServices?.scriptloader && typeof windowServices.scriptloader.loadSubScript === "function") {
      return windowServices.scriptloader;
    }
    if (
      typeof Services !== "undefined"
      && Services?.scriptloader
      && typeof Services.scriptloader.loadSubScript === "function"
    ) {
      return Services.scriptloader;
    }
    return null;
  }

  async function registerBaselineFeatures() {
    if (baselineReady) {
      return;
    }
    baselineReady = true;
    const readerSelectionCommandID = `${config.addonRef}-reader-selection-snapshot`;

    await preferencePanes.registerPane({
      id: `${config.addonRef}-preferences`,
      src: "content/preferences.xhtml",
      label: config.addonName,
      image: config.icons?.["48"] || config.icons?.["96"],
      stylesheets: ["content/preferences.css"],
      onPreferenceLoad({ window, paneID, pluginID, resolveURI }) {
        const scriptLoader = getScriptLoader(window);
        if (!scriptLoader) {
          throw new Error("Preference pane scriptloader is unavailable");
        }

        const bridge = {
          addonRef: config.addonRef,
          locale: i18n.locale,
          pluginID,
          instanceKey: config.instanceKey,
          strings: typeof i18n.getBundle === "function" ? i18n.getBundle() : null,
        };
        window.__CLEANROOM_PREFERENCE_BRIDGE__ = bridge;

        if (typeof window?.MozXULElement?.insertFTLIfNeeded === "function") {
          window.MozXULElement.insertFTLIfNeeded("main.ftl");
        }

        scriptLoader.loadSubScript(resolveURI("content/theme.js"), window);
        scriptLoader.loadSubScript(resolveURI("content/preferences.js"), window);

        if (typeof window.initCleanroomPreferences !== "function") {
          throw new Error(`window.initCleanroomPreferences() is unavailable for pane '${paneID}'`);
        }
        return window.initCleanroomPreferences({
          bridge,
        });
      },
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

    readerSelectionActions.registerAction({
      id: readerSelectionCommandID,
      label: i18n.t(
        "cleanroom-reader-selection-command-label",
        "Show Reader Selection Snapshot",
      ),
      description: i18n.t(
        "cleanroom-reader-selection-command-description",
        "Inspect the current reader selection.",
      ),
      aliases: ["selection snapshot"],
      keywords: ["reader", "selection", "snapshot"],
      condition(context = {}) {
        return Boolean(prefs.get("enabled")) && Boolean(context.selection?.hasSelection);
      },
      handler(context = {}) {
        const selection = context.selection || null;
        const text = String(selection?.text || "");
        return {
          itemID: selection?.itemID || null,
          readerType: selection?.readerType || null,
          textLength: selection?.textLength || text.length,
          textPreview: text.slice(0, 80),
        };
      },
    });

    commandPalette.registerCommand({
      id: readerSelectionCommandID,
      label: i18n.t(
        "cleanroom-reader-selection-command-label",
        "Show Reader Selection Snapshot",
      ),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-reader-selection-command-description",
        "Inspect the current reader selection.",
      ),
      aliases: ["selection snapshot"],
      keywords: ["reader", "selection", "snapshot"],
      condition: () => Boolean(
        readerSelectionActions.getActionSnapshot(readerSelectionCommandID)?.enabled,
      ),
      handler: () => {
        Promise.resolve(runReaderSelectionActionDemo(readerSelectionCommandID)).catch((error) => {
          logger.warn("plugin.readerSelectionActionDemo.failed", {
            actionId: readerSelectionCommandID,
            message: String(error?.message || error),
          });
        });
      },
    });

    if (reactUIBundleEnabled && typeof openReactDemoWindow === "function") {
      commandPalette.registerCommand({
        id: `${config.addonRef}-open-react-ui-demo`,
        label: i18n.t(
          "cleanroom-react-ui-demo-command-label",
          "Open Optional React UI Demo",
        ),
        category: config.addonName,
        description: i18n.t(
          "cleanroom-react-ui-demo-command-description",
          "Open the default-disabled React UI demo window.",
        ),
        condition: () => Boolean(prefs.get("enabled")),
        handler: () => {
          Promise.resolve(openReactDemoWindow({
            preferredWindowMode: "standalone",
          })).catch((error) => {
            logger.warn("plugin.reactUIDemo.open.failed", {
              message: String(error?.message || error),
            });
          });
        },
      });
    }

    if (menuManager.isOfficialAPIAvailable()) {
      menuManager.registerItemMenuItem({
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

      menuManager.registerReaderMenubarViewMenuItem({
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
      });
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
        { color: "var(--cleanroom-status-zero-color, #1d4ed8)", fontWeight: "600" },
        { color: "var(--cleanroom-status-ready-color, #0f766e)", fontWeight: "600" },
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
      onDestroy: ({ refresh, body }) => {
        if (typeof refresh === "function") {
          demoSectionRefreshers.delete(refresh);
        }
        if (reactUIBundleEnabled && typeof unmountReactItemPaneSurface === "function") {
          try {
            unmountReactItemPaneSurface({ body });
          } catch (error) {
            logger.warn?.("plugin.reactUIDemo.itemPane.unmount.failed", {
              message: String(error?.message || error),
            });
          }
        }
      },
      onItemChange: ({ item, setEnabled, setSectionSummary }) => {
        setEnabled(Boolean(item));
        if (item) {
          setSectionSummary(getItemSummary(item));
        }
      },
      onRender: ({ doc, body, item, setSectionSummary }) => {
        const contractRoot = createItemPaneContractRoot(doc, demoSectionID, [
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
        ]);

        if (contractRoot) {
          body.replaceChildren(contractRoot);
        } else {
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
        }

        if (item) {
          setSectionSummary(getItemSummary(item));
        }

        if (reactUIBundleEnabled && typeof reactSurfacePresenter === "function") {
          Promise.resolve(reactSurfacePresenter({
            doc,
            body,
            preferredWindowMode: "default",
            props: {
              title: i18n.t(
                "cleanroom-react-ui-surface-title",
                "Optional React Host Surface",
              ),
              message: i18n.t(
                "cleanroom-react-ui-surface-message",
                "This item pane section proves the optional React lane can mount inside a real Zotero host surface while the JS core keeps ownership of lifecycle and evidence.",
              ),
              statusText: i18n.t(
                "cleanroom-react-ui-surface-status",
                "Mounted through the item pane section",
              ),
              surfaceVariant: "host-pane",
              items: [
                `${i18n.t("cleanroom-demo-field-item", "Item")}: ${getItemSummary(item)}`,
                `${i18n.t("cleanroom-demo-field-shortcut", "Shortcut")}: ${demoState.shortcutLabel} · ${demoState.shortcutTriggerCount}`,
                `${i18n.t("cleanroom-demo-field-notifier", "Notifier")}: ${demoState.lastNotifierEvent}`,
                `${i18n.t("cleanroom-demo-field-status", "Status")}: ${i18n.t("cleanroom-demo-status-ready", "Baseline demos ready")}`,
              ],
            },
          })).catch((error) => {
            logger.warn?.("plugin.reactUIDemo.itemPane.render.failed", {
              message: String(error?.message || error),
            });
          });
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
