import { isOptionalBundleEnabled } from "./optional-bundles.js";
import { createCopyFallbacks } from "./copy-fallbacks.js";
import { createSurfaceDescriptors } from "./surface-descriptors.js";

const PREFERENCE_BRIDGE_KEY = "__CLEANROOM_PREFERENCE_BRIDGE__";
const PREFERENCE_INIT_API_KEY = "initCleanroomPreferences";

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
  surfaceDescriptors = null,
}) {
  const copy = createCopyFallbacks();
  const descriptors = surfaceDescriptors && typeof surfaceDescriptors === "object"
    ? surfaceDescriptors
    : createSurfaceDescriptors(config);
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
    const readerSelectionCommandID = descriptors.readerSelectionCommandID;

    await preferencePanes.registerPane({
      id: descriptors.preferencePaneID,
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
        window[PREFERENCE_BRIDGE_KEY] = bridge;

        if (typeof window?.MozXULElement?.insertFTLIfNeeded === "function") {
          window.MozXULElement.insertFTLIfNeeded("main.ftl");
        }

        scriptLoader.loadSubScript(resolveURI("content/theme.js"), window);
        scriptLoader.loadSubScript(resolveURI("content/preferences.js"), window);

        if (typeof window[PREFERENCE_INIT_API_KEY] !== "function") {
          throw new Error(`window[${PREFERENCE_INIT_API_KEY}]() is unavailable for pane '${paneID}'`);
        }
        return window[PREFERENCE_INIT_API_KEY]({
          bridge,
        });
      },
    });

    commandPalette.registerCommand({
      id: descriptors.primaryActionCommandID,
      label: i18n.t("cleanroom-command-label", copy.command.label),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-command-description",
        copy.command.description,
      ),
      condition: () => Boolean(prefs.get("enabled")),
      handler: () => {
        runPrimaryAction();
      },
    });

    commandPalette.registerCommand({
      id: descriptors.readerSummaryCommandID,
      label: i18n.t(
        "cleanroom-reader-menu-label",
        copy.reader.menuLabel,
      ),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-reader-command-description",
        copy.reader.commandDescription,
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
        copy.reader.selectionCommandLabel,
      ),
      description: i18n.t(
        "cleanroom-reader-selection-command-description",
        copy.reader.selectionCommandDescription,
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
        copy.reader.selectionCommandLabel,
      ),
      category: config.addonName,
      description: i18n.t(
        "cleanroom-reader-selection-command-description",
        copy.reader.selectionCommandDescription,
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
        id: descriptors.reactUIDemoCommandID,
        label: i18n.t(
          "cleanroom-react-ui-demo-command-label",
          copy.react.demoCommandLabel,
        ),
        category: config.addonName,
        description: i18n.t(
          "cleanroom-react-ui-demo-command-description",
          copy.react.demoCommandDescription,
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
        id: descriptors.contextMenuItemID,
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
        id: descriptors.readerSummaryMenuItemID,
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
            i18n.t("cleanroom-demo-field-item", copy.demo.item),
            getItemSummary(item),
          ),
          createSectionLine(
            doc,
            i18n.t("cleanroom-demo-field-shortcut", copy.demo.shortcut),
            `${demoState.shortcutLabel} · ${demoState.shortcutTriggerCount}`,
          ),
          createSectionLine(
            doc,
            i18n.t("cleanroom-demo-field-notifier", copy.demo.notifier),
            demoState.lastNotifierEvent,
          ),
          createSectionLine(
            doc,
            i18n.t("cleanroom-demo-field-status", copy.demo.status),
            i18n.t("cleanroom-demo-status-ready", copy.demo.statusReady),
          ),
        ]);

        if (contractRoot) {
          body.replaceChildren(contractRoot);
        } else {
          body.replaceChildren(
            createSectionLine(
              doc,
              i18n.t("cleanroom-demo-field-item", copy.demo.item),
              getItemSummary(item),
            ),
            createSectionLine(
              doc,
              i18n.t("cleanroom-demo-field-shortcut", copy.demo.shortcut),
              `${demoState.shortcutLabel} · ${demoState.shortcutTriggerCount}`,
            ),
            createSectionLine(
              doc,
              i18n.t("cleanroom-demo-field-notifier", copy.demo.notifier),
              demoState.lastNotifierEvent,
            ),
            createSectionLine(
              doc,
              i18n.t("cleanroom-demo-field-status", copy.demo.status),
              i18n.t("cleanroom-demo-status-ready", copy.demo.statusReady),
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
                copy.react.surfaceTitle,
              ),
              message: i18n.t(
                "cleanroom-react-ui-surface-message",
                copy.react.surfaceMessage,
              ),
              statusText: i18n.t(
                "cleanroom-react-ui-surface-status",
                copy.react.surfaceStatus,
              ),
              surfaceVariant: "host-pane",
              items: [
                `${i18n.t("cleanroom-demo-field-item", copy.demo.item)}: ${getItemSummary(item)}`,
                `${i18n.t("cleanroom-demo-field-shortcut", copy.demo.shortcut)}: ${demoState.shortcutLabel} · ${demoState.shortcutTriggerCount}`,
                `${i18n.t("cleanroom-demo-field-notifier", copy.demo.notifier)}: ${demoState.lastNotifierEvent}`,
                `${i18n.t("cleanroom-demo-field-status", copy.demo.status)}: ${i18n.t("cleanroom-demo-status-ready", copy.demo.statusReady)}`,
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
