import { createCopyFallbacks } from "./copy-fallbacks.js";
import { createSurfaceDescriptors } from "./surface-descriptors.js";
import { registerResearchWorkflowItemTreeColumns } from "../features/research-workflow-columns.js";
import { registerResearchWorkflowFeatures } from "../features/research-workflow.js";
import { registerTabHelperFeatures } from "../features/research-workbench-tabs.js";
import { registerNotesManagerFeatures } from "../features/research-workbench-notes.js";
import { registerPaperMatrixFeatures } from "../features/research-workbench-matrix.js";
import { registerRelationshipGraphFeatures } from "../features/research-workbench-graph.js";
import { registerStyleEditorFeatures } from "../features/style-editor.js";
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
import { createPDFBackgroundColor } from "../features/pdf-background-color.js";
import { createGraphViewEnhanced } from "../features/graph-view-enhanced.js";
import { createViewGroups } from "../features/view-groups.js";
import { createAnnotationColors } from "../features/annotation-colors.js";
import {
  createAIProviderRegistry,
  resolveAIProviderContract,
} from "../services/ai-provider-contract.js";
import { createOpenAIClient } from "../services/openai-client.js";
import { createAIGenerateTags } from "../features/ai-generate-tags.js";
import { createAIGenerateRemark } from "../features/ai-generate-remark.js";
import { createBacklinks } from "../features/backlinks.js";
import { createMergeAnnotations } from "../features/merge-annotations.js";
import { createAttachmentVersion } from "../features/attachment-version.js";
import { createTLDRPanel } from "../features/tldr-panel.js";
import { createCustomExternalAPI } from "../features/custom-external-api.js";

import { createNestedTags, NESTED_TAGS_PREF_KEYS } from "../features/nested-tags.js";
import { createRatingColumn } from "../features/rating-column.js";
import { createTagsColumn } from "../features/tags-column.js";
import { createDateAddedColumn } from "../features/date-added-column.js";
import { createDateModifiedColumn } from "../features/date-modified-column.js";
import { createReadStatusColumn } from "../features/read-status-column.js";
import { createCreatorColumn } from "../features/creator-column.js";
import { createPublicationColumn } from "../features/publication-column.js";
import { createRemarkColumn } from "../features/remark-column.js";
import { createAddTags } from "../features/add-tags.js";
import { createRelatedItems } from "../features/related-items.js";
import { createExplorePanel } from "../features/explore-panel.js";
import { createDarkLightButton } from "../features/dark-light-button.js";
import { createTitleTranslate } from "../features/title-translate.js";

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
  zotero = null,
  getPrimaryWindow,
  runPrimaryAction,
  surfaceDescriptors = null,
}) {
  const ZoteroAPI = zotero || globalThis.Zotero;
  const copy = createCopyFallbacks();
  const descriptors = surfaceDescriptors && typeof surfaceDescriptors === "object"
    ? surfaceDescriptors
    : createSurfaceDescriptors(config);
  const aiProviderRegistry = createAIProviderRegistry({ logger, prefs });
  let baselineReady = false;
  let baselineCleanupTracked = false;
  const prototypeCleanups = [];

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

  function getPreferenceValue(key) {
    const value = prefs?.get?.(key);
    return value === null || value === undefined || value === "undefined" ? undefined : value;
  }

  function isPreferenceEnabled(primaryKey, { legacyKeys = [], defaultValue = true } = {}) {
    const primaryValue = getPreferenceValue(primaryKey);
    if (primaryValue !== undefined) {
      return primaryValue !== false;
    }

    for (const legacyKey of legacyKeys) {
      const legacyValue = getPreferenceValue(legacyKey);
      if (legacyValue !== undefined) {
        return legacyValue !== false;
      }
    }

    return defaultValue;
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
    const workflowItemPanePref = getPreferenceValue("researchWorkflow.itemPane.enabled");
    if (typeof preferencePanes?.hasPane === "function" && !preferencePanes.hasPane(descriptors.preferencePaneID)) {
      missing.push("preference pane");
    }
    if (
      workflowItemPanePref !== undefined
      && workflowItemPanePref !== false
      && typeof itemPane?.hasSection === "function"
      && !itemPane.hasSection(workflowPaneID)
    ) {
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

  function trackPrototypeCleanup(feature, label) {
    const cleanup = typeof feature?.destroy === "function"
      ? () => feature.destroy()
      : (typeof feature?.cleanup === "function" ? () => feature.cleanup() : null);
    if (!cleanup) {
      return;
    }
    prototypeCleanups.push({ label, cleanup });
  }

  function cleanupRegisteredPrototypes() {
    while (prototypeCleanups.length > 0) {
      const entry = prototypeCleanups.pop();
      try {
        entry.cleanup();
      } catch (error) {
        logger?.warn?.("features.prototype.cleanup.failed", {
          feature: entry.label,
          error: error?.message || String(error),
        });
      }
    }
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

      if (menuManager && typeof menuManager.registerItemMenuItem === "function") {
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

      if (isPreferenceEnabled("styleEditor.enabled", { defaultValue: false })) {
        const styleEditor = registerStyleEditorFeatures({
          config,
          logger,
          prefs,
          i18n,
          host,
          commandPalette,
          surfaceDescriptors: descriptors,
        });
        if (styleEditor?.registered) {
          trackPrototypeCleanup(styleEditor, "styleEditor");
          logger.info("features.styleEditor.registered");
        }
      }

      if (isPreferenceEnabled("tldrPanel.enabled", { defaultValue: false })) {
        const tldrPanel = createTLDRPanel({
          logger,
          i18n,
          zotero: ZoteroAPI,
          itemPane,
          prefs,
          providerRegistry: aiProviderRegistry
        });

        if (tldrPanel.register()) {
          trackPrototypeCleanup(tldrPanel, "tldrPanel");
          logger.info("features.tldrPanel.registered");
        }
      }

      if (isPreferenceEnabled("customExternalAPI.enabled", { defaultValue: false })) {
        const endpoint = String(getPreferenceValue("customExternalAPI.endpoint") || "").trim();
        const contract = resolveAIProviderContract({
          prefs,
          requestedCapability: "invokeExternal",
          networkPolicy: "allow-network",
          registry: aiProviderRegistry,
          logger,
        });
        if (!endpoint || !contract.canInvoke) {
          logger?.warn?.("features.customExternalAPI.unavailable", {
            reason: contract.reason || contract.status || (!endpoint ? "endpoint-missing" : "unavailable"),
            status: contract.status,
            providerID: contract.providerID,
            requestedCapability: contract.requestedCapability,
            networkAllowed: contract.networkAllowed,
            endpointConfigured: Boolean(endpoint),
          });
        } else {
          const customExternalAPI = createCustomExternalAPI({
            logger,
            i18n,
            zotero: ZoteroAPI,
            itemPane,
            prefs,
            providerRegistry: aiProviderRegistry
          });

          if (customExternalAPI.register()) {
            trackPrototypeCleanup(customExternalAPI, "customExternalAPI");
            logger.info("features.customExternalAPI.registered");
          }
        }
      }

      if (isPreferenceEnabled("citedCountColumn.enabled", { defaultValue: true })) {
        const citedCountColumn = createCitedCountColumn({
          logger,
          i18n,
          zotero: ZoteroAPI
        });
        if (citedCountColumn.register()) {
          trackPrototypeCleanup(citedCountColumn, "citedCountColumn");
          logger.info("features.citedCountColumn.registered");
        }
      }

      if (isPreferenceEnabled("attachmentPreview.enabled", { defaultValue: false })) {
        const attachmentPreview = createAttachmentPreview({
          logger,
          i18n,
          zotero: ZoteroAPI
        });
        if (attachmentPreview.register()) {
          trackPrototypeCleanup(attachmentPreview, "attachmentPreview");
          logger.info("features.attachmentPreview.registered");
        }
      }

      if (isPreferenceEnabled("backlinks.enabled", { defaultValue: false })) {
        const backlinks = createBacklinks({
          logger,
          i18n,
          zotero: ZoteroAPI,
          itemPane,
          host
        });

        if (backlinks.register()) {
          trackPrototypeCleanup(backlinks, "backlinks");
          logger.info("features.backlinks.registered");
        }
      }

      if (isPreferenceEnabled("mergeAnnotations.enabled", { defaultValue: false })) {
        const mergeAnnotations = createMergeAnnotations({
          logger,
          i18n,
          zotero: ZoteroAPI,
          reader,
          itemPane
        });

        if (mergeAnnotations.register()) {
          trackPrototypeCleanup(mergeAnnotations, "mergeAnnotations");
          logger.info("features.mergeAnnotations.registered");
        }
      }

      if (isPreferenceEnabled("attachmentVersion.enabled", { defaultValue: false })) {
        const attachmentVersion = createAttachmentVersion({
          logger,
          i18n,
          zotero: ZoteroAPI,
          itemPane
        });

        if (attachmentVersion.register()) {
          trackPrototypeCleanup(attachmentVersion, "attachmentVersion");
          logger.info("features.attachmentVersion.registered");
        }
      }

      if (isPreferenceEnabled("annotationManager.enabled", { defaultValue: false })) {
        const annotationManager = createAnnotationManager({
          logger,
          i18n,
          zotero: ZoteroAPI
        });

        if (menuManager && typeof menuManager.registerItemMenuItem === "function") {
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

      if (isPreferenceEnabled("sidebarToggle.enabled", { defaultValue: true })) {
        const sidebarToggle = createSidebarToggle({
          logger,
          zotero: ZoteroAPI
        });

        if (sidebarToggle.register()) {
          logger.info("features.sidebarToggle.registered");
        }
      }

      if (isPreferenceEnabled("tabManager.enabled", { defaultValue: false })) {
        const tabManager = createTabManagerPanel({
          logger,
          i18n,
          zotero: ZoteroAPI
        });

        if (menuManager && typeof menuManager.registerItemMenuItem === "function") {
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

      if (isPreferenceEnabled("collectionItemCount.enabled", { defaultValue: true })) {
        const collectionItemCount = createCollectionItemCount({
          logger,
          i18n,
          zotero: ZoteroAPI
        });

        if (collectionItemCount.register()) {
          trackPrototypeCleanup(collectionItemCount, "collectionItemCount");
          logger.info("features.collectionItemCount.registered");
        }
      }

      if (isPreferenceEnabled("collectionSort.enabled", { defaultValue: true })) {
        const collectionSort = createCollectionSort({
          logger,
          i18n,
          zotero: ZoteroAPI,
          prefs
        });

        if (collectionSort.register()) {
          trackPrototypeCleanup(collectionSort, "collectionSort");
          logger.info("features.collectionSort.registered");
        }
      }

      if (isPreferenceEnabled("favoriteCollections.enabled", { defaultValue: true })) {
        const favoriteCollections = createFavoriteCollections({
          logger,
          i18n,
          zotero: ZoteroAPI,
          prefs
        });

        if (favoriteCollections.register()) {
          trackPrototypeCleanup(favoriteCollections, "favoriteCollections");
          logger.info("features.favoriteCollections.registered");
        }
      }

      if (isPreferenceEnabled("readTimeColumn.enabled", { defaultValue: true })) {
        const readingTimeColumn = createReadingTimeColumn({
          logger,
          i18n,
          zotero: ZoteroAPI,
          prefs
        });

        if (readingTimeColumn.register()) {
          logger.info("features.readingTimeColumn.registered");
        }
      }

      if (isPreferenceEnabled("annotationColumn.enabled", {
        legacyKeys: ["annotationDistributionColumn.enabled"],
        defaultValue: true,
      })) {
        const annotationColumn = createAnnotationColumn({
          logger,
          i18n,
          zotero: ZoteroAPI,
          prefs
        });

        if (annotationColumn.register()) {
          logger.info("features.annotationColumn.registered");
        }
      }

      if (isPreferenceEnabled("publicationTagsColumn.enabled", { defaultValue: true })) {
        const publicationTagsColumn = createPublicationTagsColumn({
          logger,
          i18n,
          zotero: ZoteroAPI,
          prefs
        });

        if (publicationTagsColumn.register()) {
          logger.info("features.publicationTagsColumn.registered");
        }
      }

      if (isPreferenceEnabled(NESTED_TAGS_PREF_KEYS.enabled, { defaultValue: true })) {
        createNestedTags({
          logger,
          prefs
        });
        logger.info("features.nestedTags.registered");
      }

      if (isPreferenceEnabled("titleColumnEnhanced.enabled", { defaultValue: true })) {
        const titleColumnEnhanced = createTitleColumnEnhanced({
          logger,
          i18n,
          zotero: ZoteroAPI,
          prefs
        });

        if (titleColumnEnhanced.register()) {
          logger.info("features.titleColumnEnhanced.registered");
        }
      }

      if (isPreferenceEnabled("ifColumn.enabled", { defaultValue: true })) {
        const easyscholarClient = createEasyScholarClient({
          apiKey: prefs.get("easyscholar.apiKey") || "",
          timeout: 5000,
          cacheTTL: 300000,
          logger
        });

        const ifColumn = createIFColumn({
          logger,
          i18n,
          zotero: ZoteroAPI,
          prefs,
          easyscholarClient
        });

        if (ifColumn.register()) {
          logger.info("features.ifColumn.registered");
        }
      }

      // --- Stage 2/3: New zoterostyle columns ---
      if (isPreferenceEnabled("ratingColumn.enabled", { defaultValue: true })) {
        const ratingColumn = createRatingColumn({ logger, i18n, zotero: ZoteroAPI, prefs });
        if (ratingColumn.register()) { trackPrototypeCleanup(ratingColumn, "ratingColumn"); logger.info("features.ratingColumn.registered"); }
      }

      if (isPreferenceEnabled("tagsColumn.enabled", { defaultValue: true })) {
        const tagsColumn = createTagsColumn({ logger, i18n, zotero: ZoteroAPI, prefs });
        if (tagsColumn.register()) { trackPrototypeCleanup(tagsColumn, "tagsColumn"); logger.info("features.tagsColumn.registered"); }
      }

      if (isPreferenceEnabled("dateAddedColumn.enabled", { defaultValue: true })) {
        const dateAddedColumn = createDateAddedColumn({ logger, i18n, zotero: ZoteroAPI, prefs });
        if (dateAddedColumn.register()) { trackPrototypeCleanup(dateAddedColumn, "dateAddedColumn"); logger.info("features.dateAddedColumn.registered"); }
      }

      if (isPreferenceEnabled("dateModifiedColumn.enabled", { defaultValue: true })) {
        const dateModifiedColumn = createDateModifiedColumn({ logger, i18n, zotero: ZoteroAPI, prefs });
        if (dateModifiedColumn.register()) { trackPrototypeCleanup(dateModifiedColumn, "dateModifiedColumn"); logger.info("features.dateModifiedColumn.registered"); }
      }

      if (isPreferenceEnabled("readStatusColumn.enabled", { defaultValue: true })) {
        const readStatusColumn = createReadStatusColumn({ logger, i18n, zotero: ZoteroAPI, prefs });
        if (readStatusColumn.register()) { trackPrototypeCleanup(readStatusColumn, "readStatusColumn"); logger.info("features.readStatusColumn.registered"); }
      }

      if (isPreferenceEnabled("creatorColumn.enabled", { defaultValue: true })) {
        const creatorColumn = createCreatorColumn({ logger, i18n, zotero: ZoteroAPI, prefs });
        if (creatorColumn.register()) { trackPrototypeCleanup(creatorColumn, "creatorColumn"); logger.info("features.creatorColumn.registered"); }
      }

      if (isPreferenceEnabled("publicationColumn.enabled", { defaultValue: true })) {
        const publicationColumn = createPublicationColumn({ logger, i18n, zotero: ZoteroAPI, prefs });
        if (publicationColumn.register()) { trackPrototypeCleanup(publicationColumn, "publicationColumn"); logger.info("features.publicationColumn.registered"); }
      }

      if (isPreferenceEnabled("remarkColumn.enabled", { defaultValue: true })) {
        const remarkColumn = createRemarkColumn({ logger, i18n, zotero: ZoteroAPI, prefs });
        if (remarkColumn.register()) { trackPrototypeCleanup(remarkColumn, "remarkColumn"); logger.info("features.remarkColumn.registered"); }
      }

      // --- Stage 3: New zoterostyle UI features ---
      if (isPreferenceEnabled("addTags.enabled", { defaultValue: true })) {
        const addTags = createAddTags({ logger, i18n, zotero: ZoteroAPI, menuManager });
        if (addTags.register()) { trackPrototypeCleanup(addTags, "addTags"); logger.info("features.addTags.registered"); }
      }

      if (isPreferenceEnabled("relatedItems.enabled", { defaultValue: true })) {
        const relatedItems = createRelatedItems({ logger, i18n, zotero: ZoteroAPI, menuManager, host });
        if (relatedItems.register()) { trackPrototypeCleanup(relatedItems, "relatedItems"); logger.info("features.relatedItems.registered"); }
      }

      if (isPreferenceEnabled("explorePanel.enabled", { defaultValue: true })) {
        const explorePanel = createExplorePanel({ logger, i18n, zotero: ZoteroAPI, itemPane });
        if (explorePanel.register()) { trackPrototypeCleanup(explorePanel, "explorePanel"); logger.info("features.explorePanel.registered"); }
      }

      if (isPreferenceEnabled("darkLightButton.enabled", { defaultValue: true })) {
        const darkLightButton = createDarkLightButton({ logger, i18n, zotero: ZoteroAPI, host });
        if (darkLightButton.register()) { trackPrototypeCleanup(darkLightButton, "darkLightButton"); logger.info("features.darkLightButton.registered"); }
      }

      if (isPreferenceEnabled("titleTranslate.enabled", { defaultValue: true })) {
        const titleTranslate = createTitleTranslate({ logger, i18n, zotero: ZoteroAPI, reader });
        if (titleTranslate.register()) { trackPrototypeCleanup(titleTranslate, "titleTranslate"); logger.info("features.titleTranslate.registered"); }
      }

      if (isPreferenceEnabled("marginAnnotation.enabled", { defaultValue: false })) {
        const marginAnnotation = createMarginAnnotation({
          logger,
          i18n,
          zotero: ZoteroAPI,
          prefs
        });

        if (marginAnnotation.register()) {
          trackPrototypeCleanup(marginAnnotation, "marginAnnotation");
          logger.info("features.marginAnnotation.registered");
        }
      }

      if (isPreferenceEnabled("pdfBackground.enabled", { defaultValue: false })) {
        const pdfBackgroundColor = createPDFBackgroundColor({
          logger,
          i18n,
          zotero: ZoteroAPI,
          prefs
        });

        if (pdfBackgroundColor.register()) {
          trackPrototypeCleanup(pdfBackgroundColor, "pdfBackgroundColor");
          logger.info("features.pdfBackgroundColor.registered");
        }
      }

      if (isPreferenceEnabled("graphView.enabled", { defaultValue: false })) {
        const graphViewEnhanced = createGraphViewEnhanced({
          logger,
          i18n,
          zotero: ZoteroAPI,
          prefs
        });

        if (graphViewEnhanced.register()) {
          logger.info("features.graphViewEnhanced.registered");
        }
      }

      if (isPreferenceEnabled("viewGroups.enabled", { defaultValue: false })) {
        const viewGroups = createViewGroups({
          logger,
          i18n,
          zotero: ZoteroAPI,
          prefs
        });

        if (viewGroups.register()) {
          logger.info("features.viewGroups.registered");
        }
      }

      if (isPreferenceEnabled("annotationColors.enabled", { defaultValue: false })) {
        const annotationColors = createAnnotationColors({
          logger,
          zotero: ZoteroAPI
        });

        if (annotationColors.register()) {
          logger.info("features.annotationColors.registered");
        }
      }

      if (isPreferenceEnabled("aiGenerateTags.enabled", { defaultValue: false })) {
        const openaiClient = createOpenAIClient({
          apiKey: prefs.get("openai.apiKey") || "",
          baseUrl: prefs.get("openai.baseUrl"),
          model: prefs.get("openai.model") || "gpt-3.5-turbo",
          timeout: prefs.get("openai.timeout") || 5000,
          logger
        });

        const aiGenerateTags = createAIGenerateTags({
          logger,
          zotero: ZoteroAPI,
          prefs,
          client: openaiClient
        });

        if (aiGenerateTags.register()) {
          logger.info("features.aiGenerateTags.registered");
        }
      }

      if (isPreferenceEnabled("aiGenerateRemark.enabled", { defaultValue: false })) {
        const openaiClient = createOpenAIClient({
          apiKey: prefs.get("openai.apiKey") || "",
          baseUrl: prefs.get("openai.baseUrl"),
          model: prefs.get("openai.model") || "gpt-3.5-turbo",
          timeout: prefs.get("openai.timeout") || 5000,
          logger
        });

        const aiGenerateRemark = createAIGenerateRemark({
          logger,
          zotero: ZoteroAPI,
          prefs,
          client: openaiClient
        });

        if (aiGenerateRemark.register()) {
          logger.info("features.aiGenerateRemark.registered");
        }
      }

      if (!baselineCleanupTracked && lifecycle && typeof lifecycle.trackCleanup === "function") {
        baselineCleanupTracked = true;
        lifecycle.trackCleanup(() => {
          cleanupRegisteredPrototypes();
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
      cleanupRegisteredPrototypes();
      baselineReady = false;
      throw error;
    }
  }

  return {
    registerBaselineFeatures,
  };
}
