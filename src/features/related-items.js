/**
 * 相关条目管理
 * 在条目右键菜单中添加"Related Items"选项，支持键盘快捷键 Alt+L
 */

const SECTION_ID = "toolsbox-related-items";
const OWNER = "toolsbox-related-items";
const PLUGIN_ID = "toolsbox@orlandozh.github";
const PREF_ENABLED = "relatedItems.enabled";

export function createRelatedItems(options) {
  const {
    logger,
    zotero,
    menuManager,
    prefs,
  } = options;
  const Zotero = zotero || globalThis.Zotero;

  let registered = false;
  let menuId = null;

  function debug(message, details) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
    }
  }

  function warn(message, details) {
    if (logger && typeof logger.warn === "function") {
      logger.warn(message, details);
    }
  }

  function isEnabled() {
    if (!prefs || typeof prefs.get !== "function") {
      return false;
    }
    try {
      return prefs.get(PREF_ENABLED) === true;
    } catch {
      return false;
    }
  }

  function getSelectedItems() {
    try {
      const pane = Zotero?.getActiveZoteroPane?.() || Zotero?.getMainWindow?.()?.ZoteroPane;
      if (pane && typeof pane.getSelectedItems === "function") {
        return pane.getSelectedItems() || [];
      }
    } catch {}
    return [];
  }

  function getItemID(item) {
    return item?.id ?? item?.itemID ?? null;
  }

  function addRelatedItem(sourceItem, targetItem) {
    if (!sourceItem || !targetItem) {
      return false;
    }
    try {
      if (typeof sourceItem.addRelatedItem === "function") {
        sourceItem.addRelatedItem(targetItem);
        if (typeof sourceItem.saveTx === "function") {
          sourceItem.saveTx();
        }
        return true;
      }
    } catch (err) {
      debug("relatedItems.addRelatedItem.failed", { error: String(err?.message || err) });
    }
    return false;
  }

  function removeRelatedItem(sourceItem, targetItem) {
    if (!sourceItem || !targetItem) {
      return false;
    }
    try {
      if (typeof sourceItem.removeRelatedItem === "function") {
        sourceItem.removeRelatedItem(targetItem);
        if (typeof sourceItem.saveTx === "function") {
          sourceItem.saveTx();
        }
        return true;
      }
    } catch (err) {
      debug("relatedItems.removeRelatedItem.failed", { error: String(err?.message || err) });
    }
    return false;
  }

  function promptForTargetItem() {
    const mainWindow = Zotero?.getMainWindow?.();
    if (!mainWindow) {
      return null;
    }
    try {
      const input = mainWindow.prompt(
        "Enter the item ID or key of the item to relate:",
        "",
      );
      if (!input) {
        return null;
      }
      return input.trim();
    } catch {
      return null;
    }
  }

  function resolveTargetItem(identifier) {
    if (!identifier) {
      return null;
    }
    try {
      // Try as numeric ID first
      const numericId = Number(identifier);
      if (Number.isFinite(numericId) && Zotero?.Items?.get) {
        const item = Zotero.Items.get(numericId);
        if (item) {
          return item;
        }
      }
      // Try as key
      if (Zotero?.Items?.getByLibraryAndKey) {
        const pane = Zotero?.getActiveZoteroPane?.();
        const libraryID = pane?.getSelectedLibraryID?.();
        if (libraryID) {
          const item = Zotero.Items.getByLibraryAndKey(libraryID, identifier);
          if (item) {
            return item;
          }
        }
      }
    } catch {}
    return null;
  }

  function handleRelatedItems() {
    const items = getSelectedItems();
    if (items.length !== 1) {
      const mainWindow = Zotero?.getMainWindow?.();
      if (mainWindow) {
        try {
          mainWindow.alert("Please select exactly one item.");
        } catch {}
      }
      return;
    }

    const sourceItem = items[0];
    const targetIdentifier = promptForTargetItem();
    if (!targetIdentifier) {
      return;
    }

    const targetItem = resolveTargetItem(targetIdentifier);
    if (!targetItem) {
      const mainWindow = Zotero?.getMainWindow?.();
      if (mainWindow) {
        try {
          mainWindow.alert(`Could not find item: ${targetIdentifier}`);
        } catch {}
      }
      return;
    }

    const success = addRelatedItem(sourceItem, targetItem);
    if (success) {
      debug("relatedItems.added", {
        sourceID: getItemID(sourceItem),
        targetID: getItemID(targetItem),
      });
      const mainWindow = Zotero?.getMainWindow?.();
      if (mainWindow) {
        try {
          mainWindow.alert("Related item added successfully.");
        } catch {}
      }
    }
  }

  function register() {
    if (registered) {
      return true;
    }

    if (!isEnabled()) {
      warn("relatedItems.register.skipped", { reason: "pref disabled" });
      return false;
    }

    if (!menuManager || typeof menuManager.registerItemMenuItem !== "function") {
      warn("relatedItems.register.skipped", { reason: "menuManager unavailable" });
      return false;
    }

    menuId = menuManager.registerItemMenuItem({
      id: SECTION_ID,
      label: "Related Items",
      onCommand: () => {
        handleRelatedItems();
      },
    });

    if (!menuId) {
      warn("relatedItems.register.skipped", { reason: "menu registration rejected" });
      return false;
    }

    // Register keyboard shortcut: Alt+L
    const mainWindow = Zotero?.getMainWindow?.();
    if (mainWindow) {
      const keyset = mainWindow.document.getElementById("toolsbox-keyset") || mainWindow.document.createElement("keyset");
      if (!keyset.id) {
        keyset.id = "toolsbox-keyset";
        mainWindow.document.documentElement.appendChild(keyset);
      }
      const key = mainWindow.document.createElement("key");
      key.id = "toolsbox-related-items-key";
      key.setAttribute("key", "L");
      key.setAttribute("modifiers", "alt");
      key.setAttribute("oncommand", "void 0;");
      key.addEventListener("command", handleRelatedItems);
      keyset.appendChild(key);
    }

    registered = true;
    debug("relatedItems.registered", { menuId });
    return true;
  }

  function cleanup() {
    if (!registered) {
      return {
        stopped: true,
        resources: [],
      };
    }

    if (menuId && menuManager && typeof menuManager.unregister === "function") {
      try {
        menuManager.unregister(menuId);
      } catch {}
    }

    // Remove keyboard shortcut
    const mainWindow = Zotero?.getMainWindow?.();
    if (mainWindow) {
      const key = mainWindow.document.getElementById("toolsbox-related-items-key");
      if (key && key.parentNode) {
        key.parentNode.removeChild(key);
      }
    }

    registered = false;
    menuId = null;
    debug("relatedItems.cleanedUp");
    return {
      stopped: true,
      resources: ["menu-item"],
    };
  }

  return {
    register,
    cleanup,
    destroy: cleanup,
    sectionID: SECTION_ID,
  };
}
