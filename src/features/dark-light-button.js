/**
 * 暗黑/亮色模式切换按钮
 * 提供一个菜单项或工具栏按钮来切换 Zotero 主题
 */

const SECTION_ID = "toolsbox-dark-light-button";
const OWNER = "toolsbox-dark-light-button";
const PLUGIN_ID = "toolsbox@orlandozh.github";
const PREF_ENABLED = "darkLightButton.enabled";

export function createDarkLightButton(options) {
  const {
    logger,
    zotero,
    menuManager,
    themeManager,
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

  function getCurrentThemeMode() {
    // Prefer themeManager if available
    if (themeManager && typeof themeManager.getMode === "function") {
      return themeManager.getMode();
    }
    // Fall back to Zotero prefs
    try {
      return Zotero?.Prefs?.get?.("ui.prefersReducedMotion") || "light";
    } catch {}
    return "light";
  }

  function setThemeMode(mode) {
    // Prefer themeManager if available
    if (themeManager && typeof themeManager.setMode === "function") {
      themeManager.setMode(mode);
      return;
    }
    // Fall back to Zotero prefs
    try {
      if (Zotero?.Prefs?.set) {
        Zotero.Prefs.set("ui.prefersReducedMotion", mode);
      }
    } catch {}
  }

  function toggleTheme() {
    const current = getCurrentThemeMode();
    const next = current === "dark" ? "light" : "dark";
    setThemeMode(next);
    debug("darkLightButton.toggled", { from: current, to: next });
  }

  function register() {
    if (registered) {
      return true;
    }

    if (!isEnabled()) {
      warn("darkLightButton.register.skipped", { reason: "pref disabled" });
      return false;
    }

    // Register as Tools menu item
    if (menuManager && typeof menuManager.registerToolsMenuItem === "function") {
      menuId = menuManager.registerToolsMenuItem({
        id: SECTION_ID,
        label: "Toggle Dark/Light Theme",
        onCommand: () => {
          toggleTheme();
        },
      });
    }

    if (!menuId && menuManager && typeof menuManager.registerItemMenuItem === "function") {
      // Fallback to item menu
      menuId = menuManager.registerItemMenuItem({
        id: SECTION_ID,
        label: "Toggle Theme",
        onCommand: () => {
          toggleTheme();
        },
      });
    }

    if (!menuId) {
      warn("darkLightButton.register.skipped", { reason: "menu registration rejected" });
      return false;
    }

    registered = true;
    debug("darkLightButton.registered", { menuId });
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

    registered = false;
    menuId = null;
    debug("darkLightButton.cleanedUp");
    return {
      stopped: true,
      resources: ["menu-item"],
    };
  }

  return {
    register,
    cleanup,
    destroy: cleanup,
    toggleTheme,
    sectionID: SECTION_ID,
  };
}
