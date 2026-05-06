import {
  createWorkbenchShellManager,
  resolveThemeMode,
  collectItemRelationships,
} from "./research-workbench-common.js";

const SHELL_FILE = "research-workbench-graph.xhtml";
const WINDOW_NAME = "toolsbox-relationship-graph";

export function registerRelationshipGraphFeatures(options) {
  const {
    config,
    logger,
    prefs,
    i18n,
    host,
    menuManager,
    commandPalette,
    surfaceDescriptors,
  } = options;

  const addonRef = config.addonRef || "toolsbox";
  const addonName = config.addonName || "ToolsBox";
  const rootURI = config.rootURI || `chrome://${addonRef}/`;

  let shellManager = null;

  function isEnabled() {
    try {
      return prefs?.get?.("researchWorkbench.graph.enabled") ?? true;
    } catch (_) {
      return true;
    }
  }

  function buildGraphData(itemID) {
    if (!itemID) return { nodes: [], edges: [] };
    try {
      if (typeof Zotero === "undefined" || !Zotero.Items) return { nodes: [], edges: [] };
      const item = Zotero.Items.get?.(itemID);
      if (!item) return { nodes: [], edges: [] };
      const data = collectItemRelationships(item, Zotero);
      if (data.edges.length > 100) {
        data.edges = data.edges.slice(0, 100);
      }
      return data;
    } catch (_) {
      return { nodes: [], edges: [] };
    }
  }

  function buildPayload(context = {}) {
    const graphData = buildGraphData(context.itemID);
    return {
      theme: resolveThemeMode(prefs),
      graph: graphData,
      rootItemID: context.itemID || null,
      rootItemTitle: context.itemTitle || "",
    };
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
        windowWidth: 1100,
        windowHeight: 750,
        buildPayload,
      });
    }
    return shellManager;
  }

  function openRelationshipGraph(context) {
    if (!isEnabled()) return;
    const shell = ensureShell();
    shell.open(context || {}).catch((err) => {
      logger?.warn?.("[relationship-graph] open failed", { message: String(err?.message || err) });
    });
  }

  commandPalette.registerCommand({
    id: surfaceDescriptors?.relationshipGraphCommandID || `${addonRef}-relationship-graph`,
    label: i18n?.t?.("cleanroom-rg-command-label", "Open Relationship Graph") || "Open Relationship Graph",
    category: addonName,
    description: "",
    condition: isEnabled,
    handler: openRelationshipGraph,
  });

  if (menuManager && typeof menuManager.registerItemMenuItem === "function") {
    menuManager.registerItemMenuItem({
      id: surfaceDescriptors?.relationshipGraphContextMenuID || `${addonRef}-research-graph-context`,
      l10nID: "cleanroom-rg-item-menu-label",
      onCommand: (_event, menuContext) => {
        const items = Array.isArray(menuContext?.items) ? menuContext.items.filter(Boolean) : [];
        const firstItem = items[0];
        if (firstItem) {
          openRelationshipGraph({
            itemID: firstItem.id,
            itemTitle: firstItem.getField?.("title") || "",
          });
        }
      },
      onShowing: (_event, menuContext) => {
        const items = Array.isArray(menuContext?.items) ? menuContext.items.filter(Boolean) : [];
        menuContext.setVisible(isEnabled() && items.length > 0);
      },
    });
  }

  return {
    openRelationshipGraph,
    getSnapshot: () => shellManager?.getSnapshot?.() || { open: false },
  };
}
