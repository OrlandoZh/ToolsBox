import { createCopyFallbacks } from "./copy-fallbacks.js";
import { createSurfaceDescriptors } from "./surface-descriptors.js";
import { registerResearchWorkflowItemTreeColumns } from "../features/research-workflow-columns.js";
import { registerResearchWorkflowFeatures } from "../features/research-workflow.js";
import { registerTabHelperFeatures } from "../features/research-workbench-tabs.js";
import { registerNotesManagerFeatures } from "../features/research-workbench-notes.js";
import { registerPaperMatrixFeatures } from "../features/research-workbench-matrix.js";
import { registerRelationshipGraphFeatures } from "../features/research-workbench-graph.js";
import { createCitedCountColumn } from "../features/cited-count-column.js";
import { createAttachmentPreview } from "../features/attachment-preview.js";
import { createAnnotationManager } from "../features/annotation-manager.js";
import { createSidebarToggle } from "../features/sidebar-toggle.js";
import { createTabManagerPanel } from "../features/tab-manager-panel.js";
import { createCollectionItemCount } from "../features/collection-item-count.js";
import { createCollectionSort } from "../features/collection-sort.js";
import { createFavoriteCollections } from "../features/favorite-collections.js";
import { createReadingTimeColumn } from "../features/reading-time-column.js";
import { createAnnotationColumn } from "../features/annotation-column.js";
import { createPublicationTagsColumn } from "../features/publication-tags-column.js";
import { createTitleColumnEnhanced } from "../features/title-column-enhanced.js";
import { createIFColumn } from "../features/if-column.js";
import { createEasyScholarClient } from "../services/easyscholar-client.js";
import { createMarginAnnotation } from "../features/margin-annotation.js";
import { createGraphViewEnhanced } from "../features/graph-view-enhanced.js";

const PREFERENCE_BRIDGE_KEY = "__CLEANROOM_PREFERENCE_BRIDGE__";
const PREFERENCE_INIT_API_KEY = "initCleanroomPreferences";
const PREFERENCE_BINDING_MODE_BRIDGE = "bridge";
const BASELINE_HOST_API_TIMEOUT_MS = 5000;
const BASELINE_HOST_API_POLL_MS = 100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  lifecycle,
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
  let baselineCleanupTracked = false;

  function isFeatureAPIAvailable(manager) {
    return !manager
      || typeof manager.isAvailable !== "function"
      || manager.isAvailable();
  }

  function collectMissingBaselineHostAPIs() {
    const checks = [
      ["preferencePanes", preferencePanes],
      ["itemPane", itemPane],
      ["itemTree", itemTree],
    ];
    return checks
      .filter(([, manager]) => !isFeatureAPIAvailable(manager))
      .map(([name]) => name);
  }

  async function waitForBaselineHostAPIs() {
    const deadline = Date.now() + BASELINE_HOST_API_TIMEOUT_MS;
    let missing = collectMissingBaselineHostAPIs();
    while (missing.length > 0 && Date.now() < deadline) {
      await sleep(BASELINE_HOST_API_POLL_MS);
      missing = collectMissingBaselineHostAPIs();
    }
    if (missing.length > 0) {
      throw new Error(`Baseline host APIs unavailable: ${missing.join(", ")}`);
    }
  }

  function assertBaselineRegistrationComplete() {
    const missing = [];
    const workflowPaneID = `${config.addonRef || "toolsbox"}-workflow`;
    if (typeof preferencePanes?.hasPane === "function" && !preferencePanes.hasPane(descriptors.preferencePaneID)) {
      missing.push("preference pane");
    }
    if (typeof itemPane?.hasSection === "function" && !itemPane.hasSection(workflowPaneID)) {
      missing.push("workflow item pane section");
    }
    if (typeof itemTree?.getColumnCount === "function" && itemTree.getColumnCount() <= 0) {
      missing.push("item tree columns");
    }
    if (missing.length > 0) {
      throw new Error(`Baseline registration incomplete: ${missing.join(", ")}`);
    }
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
    try {
      await waitForBaselineHostAPIs();

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
        itemTree,
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

      if (prefs.get("citedCountColumn.enabled") !== false) {
        const citedCountColumn = createCitedCountColumn({
          logger,
          i18n,
          zotero: Zotero
        });
        if (citedCountColumn.register()) {
          logger.info("features.citedCountColumn.registered");
        }
      }

      if (prefs.get("attachmentPreview.enabled") !== false) {
        const attachmentPreview = createAttachmentPreview({
          logger,
          i18n,
          zotero: Zotero
        });
        if (attachmentPreview.register()) {
          logger.info("features.attachmentPreview.registered");
        }
      }

      if (prefs.get("annotationManager.enabled") !== false) {
        const annotationManager = createAnnotationManager({
          logger,
          i18n,
          zotero: Zotero
        });

        if (menuManager.isOfficialAPIAvailable()) {
          menuManager.registerItemMenuItem({
            id: 'toolsbox-open-annotation-manager',
            l10nID: 'toolsbox-menu-annotation-manager',
            onCommand: (event, context) => {
              annotationManager.open();
            }
          });
        }

        logger.info("features.annotationManager.registered");
      }

      if (prefs.get("sidebarToggle.enabled") !== false) {
        const sidebarToggle = createSidebarToggle({
          logger,
          zotero: Zotero
        });

        if (sidebarToggle.register()) {
          logger.info("features.sidebarToggle.registered");
        }
      }

      if (prefs.get("tabManager.enabled") !== false) {
        const tabManager = createTabManagerPanel({
          logger,
          i18n,
          zotero: Zotero
        });

        if (menuManager.isOfficialAPIAvailable()) {
          menuManager.registerItemMenuItem({
            id: 'toolsbox-open-tab-manager',
            l10nID: 'toolsbox-tab-manager-button',
            onCommand: (event, context) => {
              tabManager.open();
            }
          });
        }

        logger.info("features.tabManager.registered");
      }

      if (prefs.get("collectionItemCount.enabled") !== false) {
        const collectionItemCount = createCollectionItemCount({
          logger,
          i18n,
          zotero: Zotero
        });

        if (collectionItemCount.register()) {
          logger.info("features.collectionItemCount.registered");
        }
      }

      if (prefs.get("collectionSort.enabled") !== false) {
        const collectionSort = createCollectionSort({
          logger,
          i18n,
          zotero: Zotero,
          prefs
        });

        if (collectionSort.register()) {
          logger.info("features.collectionSort.registered");
        }
      }

      if (prefs.get("favoriteCollections.enabled") !== false) {
        const favoriteCollections = createFavoriteCollections({
          logger,
          i18n,
          zotero: Zotero,
          prefs
        });

        if (favoriteCollections.register()) {
          logger.info("features.favoriteCollections.registered");
        }
      }

      if (prefs.get("readTimeColumn.enabled") !== false) {
        const readingTimeColumn = createReadingTimeColumn({
          logger,
          i18n,
          zotero: Zotero,
          prefs
        });

        if (readingTimeColumn.register()) {
          logger.info("features.readingTimeColumn.registered");
        }
      }

      if (prefs.get("annotationColumn.enabled") !== false) {
        const annotationColumn = createAnnotationColumn({
          logger,
          i18n,
          zotero: Zotero,
          prefs
        });

        if (annotationColumn.register()) {
          logger.info("features.annotationColumn.registered");
        }
      }

      if (prefs.get("publicationTagsColumn.enabled") !== false) {
        const publicationTagsColumn = createPublicationTagsColumn({
          logger,
          i18n,
          zotero: Zotero,
          prefs
        });

        if (publicationTagsColumn.register()) {
          logger.info("features.publicationTagsColumn.registered");
        }
      }

      if (prefs.get("titleColumnEnhanced.enabled") !== false) {
        const titleColumnEnhanced = createTitleColumnEnhanced({
          logger,
          i18n,
          zotero: Zotero,
          prefs
        });

        if (titleColumnEnhanced.register()) {
          logger.info("features.titleColumnEnhanced.registered");
        }
      }

      if (prefs.get("ifColumn.enabled") !== false) {
        const easyscholarClient = createEasyScholarClient({
          apiKey: prefs.get("easyscholar.apiKey") || "",
          timeout: 5000,
          cacheTTL: 300000,
          logger
        });

        const ifColumn = createIFColumn({
          logger,
          i18n,
          zotero: Zotero,
          prefs,
          easyscholarClient
        });

        if (ifColumn.register()) {
          logger.info("features.ifColumn.registered");
        }
      }

      if (prefs.get("marginAnnotation.enabled") !== false) {
        const marginAnnotation = createMarginAnnotation({
          logger,
          i18n,
          zotero: Zotero,
          prefs
        });

        if (marginAnnotation.register()) {
          logger.info("features.marginAnnotation.registered");
        }
      }

      if (prefs.get("graphView.enabled") !== false) {
        const graphViewEnhanced = createGraphViewEnhanced({
          logger,
          i18n,
          zotero: Zotero,
          prefs
        });

        if (graphViewEnhanced.register()) {
          logger.info("features.graphViewEnhanced.registered");
        }
      }

      if (!baselineCleanupTracked && lifecycle && typeof lifecycle.trackCleanup === "function") {
        baselineCleanupTracked = true;
        lifecycle.trackCleanup(() => {
          baselineReady = false;
          baselineCleanupTracked = false;
        });
      }

      assertBaselineRegistrationComplete();

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
    catch (error) {
      baselineReady = false;
      throw error;
    }
  }

  return {
    registerBaselineFeatures,
  };
}
