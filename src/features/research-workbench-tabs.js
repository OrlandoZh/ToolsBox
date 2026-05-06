import { resolveBridgeKey } from "./research-workbench-common.js";

const SESSION_STORE_KEY = "tab-session";

function noop() {}

function getZoteroTabs(window) {
  if (window?.Zotero_Tabs) {
    return window.Zotero_Tabs;
  }
  try {
    const main = typeof Zotero !== "undefined" ? Zotero.getMainWindow?.() : null;
    return main?.Zotero_Tabs || null;
  } catch (_) {
    return null;
  }
}

function getReaderTabStates() {
  try {
    if (typeof Zotero === "undefined" || !Zotero.Reader) return [];
    return Zotero.Reader.getWindowStates?.() || [];
  } catch (_) {
    return [];
  }
}

function getSessionStore(prefs) {
  const raw = prefs?.getStringPref?.(SESSION_STORE_KEY);
  if (!raw) return { sessions: [] };
  try {
    return JSON.parse(raw);
  } catch (_) {
    return { sessions: [] };
  }
}

function saveSessionStore(prefs, store) {
  try {
    prefs?.setStringPref?.(SESSION_STORE_KEY, JSON.stringify(store));
  } catch (_) { /* prefs may be read-only in some contexts */ }
}

function isTabsEnabled(prefs) {
  try {
    return prefs?.get?.("researchWorkbench.tabs.enabled") ?? true;
  } catch (_) {
    return true;
  }
}

export function registerTabHelperFeatures(options) {
  const {
    config,
    logger,
    prefs,
    i18n,
    host,
    menuManager,
    commandPalette,
    reader,
    surfaceDescriptors,
  } = options;

  const addonRef = config.addonRef || "toolsbox";
  const prefix = surfaceDescriptors?.tabHelperCommandIDPrefix || `${addonRef}-tab-helper`;
  const log = (msg, detail) => logger?.debug?.(`[tabs] ${msg}`, detail);

  function activeReaderTab() {
    if (!reader) return null;
    try {
      const ar = reader.getActiveReader?.();
      return ar || null;
    } catch (_) {
      return null;
    }
  }

  // ---- Command: Duplicate Reader Tab ----
  commandPalette.registerCommand({
    id: `${prefix}-duplicate`,
    label: i18n?.t?.("cleanroom-th-command-duplicate-tab", "Duplicate Reader Tab") || "Duplicate Reader Tab",
    category: config.addonName,
    description: "",
    condition: () => {
      if (!isTabsEnabled(prefs)) return false;
      return Boolean(activeReaderTab());
    },
    handler: () => {
      const ar = activeReaderTab();
      if (!ar) return;
      try {
        const itemID = ar.itemID;
        if (itemID) {
          reader.openReader?.({ itemID });
        }
        log("duplicate-tab", { itemID });
      } catch (err) {
        logger?.warn?.("[tabs] duplicate-tab failed", { message: String(err?.message || err) });
      }
    },
  });

  // ---- Command: Close Other Reader Tabs ----
  commandPalette.registerCommand({
    id: `${prefix}-close-others`,
    label: i18n?.t?.("cleanroom-th-command-close-others", "Close Other Tabs") || "Close Other Tabs",
    category: config.addonName,
    description: "",
    condition: () => {
      if (!isTabsEnabled(prefs)) return false;
      return getReaderTabStates().length > 1;
    },
    handler: () => {
      const states = getReaderTabStates();
      const active = activeReaderTab();
      if (!active || states.length <= 1) return;
      const closed = [];
      for (const state of states) {
        if (state.tabID === active.tabID) continue;
        try {
          const r = reader?.getByTabID?.(state.tabID);
          if (r && typeof r.close === "function") {
            r.close();
            closed.push(state.tabID);
          }
        } catch (_) { /* best-effort */ }
      }
      log("close-others", { closed });
    },
  });

  // ---- Command: Move Tab to New Window ----
  commandPalette.registerCommand({
    id: `${prefix}-move-window`,
    label: i18n?.t?.("cleanroom-th-command-move-window", "Move Tab to New Window") || "Move Tab to New Window",
    category: config.addonName,
    description: "",
    condition: () => {
      if (!isTabsEnabled(prefs)) return false;
      return Boolean(activeReaderTab());
    },
    handler: () => {
      const ar = activeReaderTab();
      const mainWindow = host?.getPrimaryWindow?.();
      if (!ar || !mainWindow || mainWindow.closed) return;
      try {
        const itemID = ar.itemID;
        const location = ar.location || {};
        const href = `chrome://${addonRef}/content/lib/reader.xhtml`;
        mainWindow.openDialog(href, `${addonRef}-reader-window`,
          "chrome,centerscreen,resizable,status,dialog=no,width=1100,height=800");
        log("move-to-window", { itemID });
      } catch (err) {
        logger?.warn?.("[tabs] move-window failed", { message: String(err?.message || err) });
      }
    },
  });

  // ---- Command: Save Tab Session ----
  commandPalette.registerCommand({
    id: `${prefix}-save-session`,
    label: i18n?.t?.("cleanroom-th-command-save-session", "Save Tab Session") || "Save Tab Session",
    category: config.addonName,
    description: "",
    condition: () => {
      if (!isTabsEnabled(prefs)) return false;
      return getReaderTabStates().length > 0;
    },
    handler: () => {
      const states = getReaderTabStates();
      if (states.length === 0) return;
      const session = {
        savedAt: new Date().toISOString(),
        tabs: states.map((s) => ({
          itemID: s.itemID,
          title: s.title || "",
          location: s.location || {},
          tabID: s.tabID || "",
        })),
      };
      const store = getSessionStore(prefs);
      store.lastSession = session;
      saveSessionStore(prefs, store);
      log("save-session", { count: session.tabs.length });
      try {
        host?.notifier?.showToast?.({
          message: i18n?.t?.("cleanroom-th-toast-session-saved", `Tab session saved (${session.tabs.length} tabs)`, { count: session.tabs.length }) || `Tab session saved (${session.tabs.length} tabs)`,
          type: "success",
        });
      } catch (_) { /* toast optional */ }
    },
  });

  // ---- Command: Restore Tab Session ----
  commandPalette.registerCommand({
    id: `${prefix}-restore-session`,
    label: i18n?.t?.("cleanroom-th-command-restore-session", "Restore Tab Session") || "Restore Tab Session",
    category: config.addonName,
    description: "",
    condition: () => {
      if (!isTabsEnabled(prefs)) return false;
      const store = getSessionStore(prefs);
      return Boolean(store.lastSession?.tabs?.length);
    },
    handler: async () => {
      const store = getSessionStore(prefs);
      const tabs = store.lastSession?.tabs;
      if (!tabs?.length) {
        try {
          host?.notifier?.showToast?.({
            message: i18n?.t?.("cleanroom-th-toast-no-session", "No saved tab session found.") || "No saved tab session found.",
            type: "info",
          });
        } catch (_) { /* toast optional */ }
        return;
      }
      let restored = 0;
      for (const tab of tabs) {
        try {
          if (reader?.openReader) {
            await reader.openReader({ itemID: tab.itemID, location: tab.location });
            restored++;
          }
        } catch (_) { /* best-effort per tab */ }
      }
      log("restore-session", { restored, total: tabs.length });
      try {
        host?.notifier?.showToast?.({
          message: i18n?.t?.("cleanroom-th-toast-session-restored", `Tab session restored (${restored} tabs)`, { count: restored }) || `Tab session restored (${restored} tabs)`,
          type: "success",
        });
      } catch (_) { /* toast optional */ }
    },
  });

  // ---- Reader context menu items ----
  const menuCleanups = [];
  if (reader && typeof reader.registerViewContextMenuItem === "function") {
    menuCleanups.push(
      reader.registerViewContextMenuItem((_event) => ({
        id: `${addonRef}-tab-helper-open-related`,
        label: i18n?.t?.("cleanroom-th-menu-open-related", "Open All Related in Tabs") || "Open All Related in Tabs",
        onCommand: (evt) => {
          const itemID = evt?.itemID || evt?.detail?.itemID;
          if (!itemID || !reader) return;
          try {
            const rels = typeof Zotero !== "undefined" && Zotero.Relations
              ? Zotero.Relations.getByItem?.({ id: itemID }) || []
              : [];
            for (const [, targetURI] of rels) {
              const targetID = typeof Zotero !== "undefined" && Zotero.URI
                ? Zotero.URI.getItemID?.(targetURI)
                : null;
              if (targetID) {
                reader.openReader?.({ itemID: targetID });
              }
            }
          } catch (err) {
            logger?.warn?.("[tabs] open-related failed", { message: String(err?.message || err) });
          }
        },
      })),
    );

    menuCleanups.push(
      reader.registerViewContextMenuItem((_event) => ({
        id: `${addonRef}-tab-helper-open-dup`,
        label: i18n?.t?.("cleanroom-th-menu-open-duplicate", "Open in New Tab") || "Open in New Tab",
        onCommand: (evt) => {
          const itemID = evt?.itemID || evt?.detail?.itemID;
          if (itemID && reader) {
            reader.openReader?.({ itemID });
          }
        },
      })),
    );
  }

  return {
    commands: [prefix],
    menuCleanups,
  };
}
