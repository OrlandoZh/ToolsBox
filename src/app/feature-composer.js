import { createCopyFallbacks } from "./copy-fallbacks.js";
import { createSurfaceDescriptors } from "./surface-descriptors.js";
import { registerResearchWorkflowItemTreeColumns } from "../features/research-workflow-columns.js";
import { registerResearchWorkflowFeatures } from "../features/research-workflow.js";
import { registerTabHelperFeatures } from "../features/research-workbench-tabs.js";
import { registerNotesManagerFeatures } from "../features/research-workbench-notes.js";
import { registerPaperMatrixFeatures } from "../features/research-workbench-matrix.js";
import { registerRelationshipGraphFeatures } from "../features/research-workbench-graph.js";

const PREFERENCE_BRIDGE_KEY = "__CLEANROOM_PREFERENCE_BRIDGE__";
const PREFERENCE_INIT_API_KEY = "initCleanroomPreferences";
const PREFERENCE_BINDING_MODE_BRIDGE = "bridge";

function buildPreferenceNameMap(config = {}) {
  const prefsPrefix = String(config?.prefsPrefix || "").trim();
  if (!prefsPrefix) {
    return null;
  }
  const keys = new Set([
    "enabled",
    "menuLabel",
    "logLevel",
    "themeMode",
    ...Object.keys(config?.defaultPrefs || {}),
  ]);
  return Object.freeze(Object.fromEntries(
    Array.from(keys).map((key) => [key, `${prefsPrefix}.${key}`]),
  ));
}

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
  surfaceDescriptors = null,
}) {
  const copy = createCopyFallbacks();
  const descriptors = surfaceDescriptors && typeof surfaceDescriptors === "object"
    ? surfaceDescriptors
    : createSurfaceDescriptors(config);
  let baselineReady = false;

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
          preferenceBindingMode: descriptors.preferenceBindingMode || "native",
          preferenceNames: descriptors.preferenceBindingMode === PREFERENCE_BINDING_MODE_BRIDGE
            ? buildPreferenceNameMap(config)
            : null,
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

    }

    registerResearchWorkflowItemTreeColumns({
      itemTree,
      prefs,
      logger,
    });
    registerResearchWorkflowFeatures({
      config,
      logger,
      prefs,
      i18n,
      itemPane,
      menuManager,
      reader,
    });

    registerTabHelperFeatures({
      config,
      logger,
      prefs,
      i18n,
      host,
      menuManager,
      commandPalette,
      reader,
      surfaceDescriptors: descriptors,
    });
    registerNotesManagerFeatures({
      config,
      logger,
      prefs,
      i18n,
      host,
      menuManager,
      commandPalette,
      reader,
      surfaceDescriptors: descriptors,
      getPrimaryWindow,
    });
    registerPaperMatrixFeatures({
      config,
      logger,
      prefs,
      i18n,
      host,
      commandPalette,
      surfaceDescriptors: descriptors,
    });
    registerRelationshipGraphFeatures({
      config,
      logger,
      prefs,
      i18n,
      host,
      menuManager,
      commandPalette,
      surfaceDescriptors: descriptors,
    });

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
