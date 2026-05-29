/**
 * 快速标签添加
 * 在条目右键菜单中添加"Add Tags"选项，支持键盘快捷键 Ctrl+T
 */

const SECTION_ID = "toolsbox-add-tags";
const OWNER = "toolsbox-add-tags";
const PLUGIN_ID = "toolsbox@orlandozh.github";
const PREF_ENABLED = "addTags.enabled";

export function createAddTags(options) {
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

  function addTagsToItem(item, tags) {
    if (!item || !Array.isArray(tags)) {
      return 0;
    }
    let added = 0;
    for (const tag of tags) {
      const trimmed = typeof tag === "string" ? tag.trim() : "";
      if (!trimmed) {
        continue;
      }
      try {
        if (typeof item.addTag === "function") {
          item.addTag(trimmed);
          added += 1;
        }
      } catch (err) {
        debug("addTags.addTag.failed", { tag: trimmed, error: String(err?.message || err) });
      }
    }
    if (added > 0 && typeof item.saveTx === "function") {
      try {
        item.saveTx();
      } catch {}
    }
    return added;
  }

  function promptForTags() {
    const mainWindow = Zotero?.getMainWindow?.();
    if (!mainWindow) {
      return null;
    }
    try {
      const input = mainWindow.prompt("Enter tags (comma-separated):", "");
      if (input === null || input === undefined) {
        return null;
      }
      return input.split(",").map((t) => t.trim()).filter(Boolean);
    } catch {
      return null;
    }
  }

  function handleAddTags() {
    const items = getSelectedItems();
    if (items.length === 0) {
      const mainWindow = Zotero?.getMainWindow?.();
      if (mainWindow) {
        try {
          mainWindow.alert("Please select at least one item.");
        } catch {}
      }
      return;
    }

    const tags = promptForTags();
    if (!tags || tags.length === 0) {
      return;
    }

    let totalAdded = 0;
    for (const item of items) {
      totalAdded += addTagsToItem(item, tags);
    }

    debug("addTags.applied", { itemCount: items.length, tagCount: tags.length, totalAdded });
  }

  function register() {
    if (registered) {
      return true;
    }

    if (!isEnabled()) {
      warn("addTags.register.skipped", { reason: "pref disabled" });
      return false;
    }

    if (!menuManager || typeof menuManager.registerItemMenuItem !== "function") {
      warn("addTags.register.skipped", { reason: "menuManager unavailable" });
      return false;
    }

    menuId = menuManager.registerItemMenuItem({
      id: SECTION_ID,
      label: "Add Tags",
      onCommand: () => {
        handleAddTags();
      },
    });

    if (!menuId) {
      warn("addTags.register.skipped", { reason: "menu registration rejected" });
      return false;
    }

    // Register keyboard shortcut: Ctrl+T
    const mainWindow = Zotero?.getMainWindow?.();
    if (mainWindow) {
      const keyset = mainWindow.document.getElementById("toolsbox-keyset") || mainWindow.document.createElement("keyset");
      if (!keyset.id) {
        keyset.id = "toolsbox-keyset";
        mainWindow.document.documentElement.appendChild(keyset);
      }
      const key = mainWindow.document.createElement("key");
      key.id = "toolsbox-add-tags-key";
      key.setAttribute("key", "T");
      key.setAttribute("modifiers", "control");
      key.setAttribute("oncommand", "void 0;");
      key.addEventListener("command", handleAddTags);
      keyset.appendChild(key);
    }

    registered = true;
    debug("addTags.registered", { menuId });
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
      const key = mainWindow.document.getElementById("toolsbox-add-tags-key");
      if (key && key.parentNode) {
        key.parentNode.removeChild(key);
      }
    }

    registered = false;
    menuId = null;
    debug("addTags.cleanedUp");
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
