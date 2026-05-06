import {
  createWorkbenchShellManager,
  resolveThemeMode,
  collectCreatorString,
  resolveYear,
  resolvePublicationName,
} from "./research-workbench-common.js";

const SHELL_FILE = "research-workbench-matrix.xhtml";
const WINDOW_NAME = "toolsbox-paper-matrix";

export function registerPaperMatrixFeatures(options) {
  const {
    config,
    logger,
    prefs,
    i18n,
    host,
    commandPalette,
    surfaceDescriptors,
  } = options;

  const addonRef = config.addonRef || "toolsbox";
  const addonName = config.addonName || "ToolsBox";
  const rootURI = config.rootURI || `chrome://${addonRef}/`;

  let shellManager = null;

  function isEnabled() {
    try {
      return prefs?.get?.("researchWorkbench.matrix.enabled") ?? true;
    } catch (_) {
      return true;
    }
  }

  function buildPayload(context = {}) {
    const rows = buildMatrixRows(context.collectionID);
    return {
      theme: resolveThemeMode(prefs),
      rows,
      collectionID: context.collectionID || null,
      collectionName: context.collectionName || "",
    };
  }

  function buildMatrixRows(collectionID) {
    const rows = [];
    try {
      if (typeof Zotero === "undefined" || !Zotero.Items) return rows;
      let items;
      if (collectionID) {
        const col = Zotero.Collections?.get?.(collectionID);
        items = col?.getChildItems?.() || [];
      } else {
        items = Zotero.Items.getAll?.() || [];
      }
      for (const item of items) {
        if (!item || item.isNote?.() || item.isAttachment?.()) continue;
        rows.push({
          itemID: item.id,
          title: (item.getField?.("title") || "").slice(0, 120),
          creators: collectCreatorString(item),
          year: resolveYear(item),
          publication: resolvePublicationName(item).slice(0, 60),
          dateAdded: String(item.dateAdded || "").slice(0, 10),
          dateModified: String(item.dateModified || "").slice(0, 10),
        });
      }
    } catch (err) {
      logger?.debug?.("[paper-matrix] buildRows failed", { message: String(err?.message || err) });
    }
    return rows;
  }

  function ensureShell() {
    if (!shellManager) {
      shellManager = createWorkbenchShellManager({
        logger,
        host,
        rootURI,
        addonRef,
        addonName,
        prefs,
        shellFileName: SHELL_FILE,
        windowName: WINDOW_NAME,
        windowWidth: 1200,
        windowHeight: 800,
        buildPayload,
      });
    }
    return shellManager;
  }

  function openPaperMatrix(context) {
    if (!isEnabled()) return;
    const shell = ensureShell();
    shell.open(context || {}).catch((err) => {
      logger?.warn?.("[paper-matrix] open failed", { message: String(err?.message || err) });
    });
  }

  commandPalette.registerCommand({
    id: surfaceDescriptors?.paperMatrixCommandID || `${addonRef}-paper-matrix`,
    label: i18n?.t?.("cleanroom-pm-command-label", "Open Paper Matrix") || "Open Paper Matrix",
    category: addonName,
    description: "",
    condition: isEnabled,
    handler: openPaperMatrix,
  });

  return {
    openPaperMatrix,
    getSnapshot: () => shellManager?.getSnapshot?.() || { open: false },
  };
}
