/**
 * Title Translation
 * Adds a "Translate Title" menu item with Ctrl+Alt+T shortcut
 * Uses simple local transliteration (no network calls)
 */

const SECTION_ID = "toolsbox-title-translate";
const OWNER = "toolsbox-title-translate";
const PLUGIN_ID = "toolsbox@orlandozh.github";
const PREF_ENABLED = "titleTranslate.enabled";

function getField(item, field) {
  if (!item) {
    return "";
  }
  try {
    if (typeof item.getField === "function") {
      return item.getField(field) || "";
    }
  } catch {}
  return item?.[field] || "";
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

/**
 * Simple transliteration / romanization helper.
 * This is a minimal local implementation - no network calls.
 */
function simpleTransliterate(text) {
  if (!text) {
    return "";
  }

  // Basic Cyrillic to Latin
  const cyrillicMap = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "zh", "з": "z", "и": "i",
    "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
    "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch", "ы": "y", "э": "e",
    "ю": "yu", "я": "ya",
    "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D", "Е": "E", "Ё": "Yo", "Ж": "Zh", "З": "Z", "И": "I",
    "Й": "Y", "К": "K", "Л": "L", "М": "M", "Н": "N", "О": "O", "П": "P", "Р": "R", "С": "S", "Т": "T",
    "У": "U", "Ф": "F", "Х": "Kh", "Ц": "Ts", "Ч": "Ch", "Ш": "Sh", "Щ": "Shch", "Ы": "Y", "Э": "E",
    "Ю": "Yu", "Я": "Ya",
  };

  // Basic Greek to Latin
  const greekMap = {
    "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "i", "θ": "th", "ι": "i", "κ": "k",
    "λ": "l", "μ": "m", "ν": "n", "ξ": "x", "ο": "o", "π": "p", "ρ": "r", "σ": "s", "τ": "t", "υ": "y",
    "φ": "ph", "χ": "ch", "ψ": "ps", "ω": "o",
    "Α": "A", "Β": "B", "Γ": "G", "Δ": "D", "Ε": "E", "Ζ": "Z", "Η": "I", "Θ": "Th", "Ι": "I", "Κ": "K",
    "Λ": "L", "Μ": "M", "Ν": "N", "Ξ": "X", "Ο": "O", "Π": "P", "Ρ": "R", "Σ": "S", "Τ": "T", "Υ": "Y",
    "Φ": "Ph", "Χ": "Ch", "Ψ": "Ps", "Ω": "O",
  };

  let result = "";
  for (const char of text) {
    if (cyrillicMap[char]) {
      result += cyrillicMap[char];
    } else if (greekMap[char]) {
      result += greekMap[char];
    } else {
      result += char;
    }
  }
  return result;
}

function detectLanguageHint(text) {
  if (!text) {
    return "unknown";
  }
  // Use String.fromCharCode to avoid unicode escape issues in source
  const cyrillic = /[\u0400-\u04FF]/;
  const greek = /[\u0370-\u03FF]/;
  const cjk = /[\u4E00-\u9FFF\u3400-\u4DBF]/;

  if (cyrillic.test(text)) {
    return "cyrillic";
  }
  if (greek.test(text)) {
    return "greek";
  }
  if (cjk.test(text)) {
    return "cjk";
  }
  return "latin";
}

export function createTitleTranslate(options) {
  const {
    logger,
    zotero,
    menuManager,
    reader,
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

  function translateTitle(title) {
    if (!title) {
      return { original: "", translated: "", language: "unknown" };
    }
    const language = detectLanguageHint(title);
    const translated = simpleTransliterate(title);
    return {
      original: title,
      translated,
      language,
    };
  }

  function handleTranslateTitle() {
    const items = getSelectedItems();
    if (items.length === 0) {
      const mainWindow = Zotero?.getMainWindow?.();
      if (mainWindow) {
        try {
          mainWindow.alert("Please select an item to translate.");
        } catch {}
      }
      return;
    }

    const item = items[0];
    const title = normalizeText(getField(item, "title"));
    if (!title) {
      const mainWindow = Zotero?.getMainWindow?.();
      if (mainWindow) {
        try {
          mainWindow.alert("Selected item has no title.");
        } catch {}
      }
      return;
    }

    const result = translateTitle(title);
    const mainWindow = Zotero?.getMainWindow?.();
    if (mainWindow) {
      try {
        const message = result.language === "latin"
          ? `Original: ${result.original}\n(No transliteration needed for Latin script)`
          : `Original (${result.language}): ${result.original}\nTransliterated: ${result.translated}`;
        mainWindow.alert(message);
      } catch {}
    }

    debug("titleTranslate.translated", {
      itemID: item?.id ?? item?.itemID,
      language: result.language,
    });
  }

  function register() {
    if (registered) {
      return true;
    }

    if (!isEnabled()) {
      warn("titleTranslate.register.skipped", { reason: "pref disabled" });
      return false;
    }

    // Try reader menu first, then fall back to item menu
    if (reader && typeof reader.registerViewContextMenuItem === "function") {
      const cleanupFn = reader.registerViewContextMenuItem(() => ({
        label: "Translate Title",
        oncommand: () => handleTranslateTitle(),
      }));
      if (cleanupFn) {
        menuId = "reader-view-context-menu";
      }
    }

    if (!menuId && menuManager && typeof menuManager.registerItemMenuItem === "function") {
      menuId = menuManager.registerItemMenuItem({
        id: SECTION_ID,
        label: "Translate Title",
        onCommand: () => {
          handleTranslateTitle();
        },
      });
    }

    if (!menuId) {
      warn("titleTranslate.register.skipped", { reason: "menu registration rejected" });
      return false;
    }

    // Register keyboard shortcut: Ctrl+Alt+T
    const mainWindow = Zotero?.getMainWindow?.();
    if (mainWindow) {
      const keyset = mainWindow.document.getElementById("toolsbox-keyset") || mainWindow.document.createElement("keyset");
      if (!keyset.id) {
        keyset.id = "toolsbox-keyset";
        mainWindow.document.documentElement.appendChild(keyset);
      }
      const key = mainWindow.document.createElement("key");
      key.id = "toolsbox-title-translate-key";
      key.setAttribute("key", "T");
      key.setAttribute("modifiers", "control,alt");
      key.setAttribute("oncommand", "void 0;");
      key.addEventListener("command", handleTranslateTitle);
      keyset.appendChild(key);
    }

    registered = true;
    debug("titleTranslate.registered", { menuId });
    return true;
  }

  function cleanup() {
    if (!registered) {
      return {
        stopped: true,
        resources: [],
      };
    }

    if (menuId && menuManager && typeof menuManager.unregister === "function" && menuId !== "reader-view-context-menu") {
      try {
        menuManager.unregister(menuId);
      } catch {}
    }

    // Remove keyboard shortcut
    const mainWindow = Zotero?.getMainWindow?.();
    if (mainWindow) {
      const key = mainWindow.document.getElementById("toolsbox-title-translate-key");
      if (key && key.parentNode) {
        key.parentNode.removeChild(key);
      }
    }

    registered = false;
    menuId = null;
    debug("titleTranslate.cleanedUp");
    return {
      stopped: true,
      resources: ["menu-item"],
    };
  }

  return {
    register,
    cleanup,
    destroy: cleanup,
    translateTitle,
    sectionID: SECTION_ID,
  };
}
