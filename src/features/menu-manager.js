/**
 * 菜单管理模块
 * 支持多种菜单目标的注册和管理，使用 Zotero.MenuManager 官方 API
 *
 * 清洁室实现：基于 Zotero 源码逻辑理解后独立编写
 */

/**
 * 菜单目标类型常量（与 Zotero 官方 VALID_TARGETS 对齐）
 */
export const MENU_TARGETS = {
  // 主窗口菜单栏
  MAIN_MENU_FILE: "main/menubar/file",
  MAIN_MENU_EDIT: "main/menubar/edit",
  MAIN_MENU_VIEW: "main/menubar/view",
  MAIN_MENU_GO: "main/menubar/go",
  MAIN_MENU_TOOLS: "main/menubar/tools",
  MAIN_MENU_HELP: "main/menubar/help",

  // 主窗口库上下文菜单
  LIBRARY_ITEM: "main/library/item",
  LIBRARY_COLLECTION: "main/library/collection",

  // 主窗口工具栏子菜单
  LIBRARY_ADD_ATTACHMENT: "main/library/addAttachment",
  LIBRARY_ADD_NOTE: "main/library/addNote",

  // 标签页上下文菜单
  MAIN_TAB: "main/tab",

  // 阅读器窗口菜单栏
  READER_MENU_FILE: "reader/menubar/file",
  READER_MENU_EDIT: "reader/menubar/edit",
  READER_MENU_VIEW: "reader/menubar/view",
  READER_MENU_GO: "reader/menubar/go",
  READER_MENU_WINDOW: "reader/menubar/window",

  // 条目窗格上下文菜单
  ITEM_PANE_INFO_ROW: "itemPane/info/row",

  // 笔记面板按钮
  NOTES_PANE_ITEM_NOTE: "notesPane/addItemNote",
  NOTES_PANE_STANDALONE_NOTE: "notesPane/addStandaloneNote",

  // 侧边导航按钮
  SIDENAV_LOCATE: "sidenav/locate",
};

/**
 * 菜单项类型
 */
export const MENU_TYPES = {
  MENUITEM: "menuitem",
  SEPARATOR: "separator",
  SUBMENU: "submenu",
};

/**
 * 标签页类型（用于 enableForTabTypes）
 */
export const TAB_TYPES = {
  LIBRARY: "library",
  READER_ALL: "reader/*",
  READER_PDF: "reader/pdf",
  READER_EPUB: "reader/epub",
  READER_SNAPSHOT: "reader/snapshot",
};

const RESOLVED_MENU_STATE = Symbol("cleanroom.resolvedMenuState");
const RESOLVED_MENU_MODEL = Symbol("cleanroom.resolvedMenuModel");
const LIVE_MENU_ID = Symbol("cleanroom.liveMenuId");
const LIVE_MENU_PATH = Symbol("cleanroom.liveMenuPath");

function readObjectValue(target, key) {
  if (!target || typeof target !== "object") {
    return null;
  }
  try {
    return target[key];
  }
  catch {
    return null;
  }
}

function cloneValue(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function callIfFunction(target, methodName) {
  if (!target || typeof target !== "object") {
    return null;
  }
  const method = target[methodName];
  if (typeof method !== "function") {
    return null;
  }
  try {
    return method.call(target);
  }
  catch {
    return null;
  }
}

function detectMenuItemType(item) {
  const value = (
    readObjectValue(item, "itemType")
    || readObjectValue(item, "type")
    || callIfFunction(item, "getItemType")
    || callIfFunction(item, "getType")
  );
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function detectMenuLibraryType(context, items) {
  const directCandidates = [
    readObjectValue(context, "libraryType"),
    readObjectValue(readObjectValue(context, "library"), "libraryType"),
    readObjectValue(readObjectValue(context, "library"), "type"),
    readObjectValue(readObjectValue(context, "libraryRow"), "libraryType"),
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const item of items) {
    const itemCandidates = [
      readObjectValue(item, "libraryType"),
      readObjectValue(readObjectValue(item, "library"), "libraryType"),
      readObjectValue(readObjectValue(item, "library"), "type"),
      readObjectValue(callIfFunction(item, "getLibrary"), "libraryType"),
    ];
    for (const candidate of itemCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  return null;
}

function hasCollectionRowKind(row, expected) {
  if (!row || typeof row !== "object") {
    return false;
  }
  const directValue = readObjectValue(row, expected);
  if (directValue === true) {
    return true;
  }
  const fnName = `is${expected.slice(0, 1).toUpperCase()}${expected.slice(1)}`;
  if (callIfFunction(row, fnName) === true) {
    return true;
  }
  const rowType = String(readObjectValue(row, "type") || "").trim().toLowerCase();
  if (!rowType) {
    return false;
  }
  if (expected === "collection") {
    return rowType.includes("collection");
  }
  if (expected === "search") {
    return rowType.includes("saved") || rowType.includes("search");
  }
  return false;
}

function summarizeMenuItemKinds(items) {
  const summary = {
    noteCount: 0,
    attachmentCount: 0,
    regularCount: 0,
    hasNotes: false,
    hasAttachments: false,
    hasRegularItems: false,
    mixed: false,
  };

  items.forEach((item) => {
    const detectedType = detectMenuItemType(item);
    const isNote = callIfFunction(item, "isNote") === true || detectedType === "note";
    const isAttachment = callIfFunction(item, "isAttachment") === true || detectedType === "attachment";

    if (isNote) {
      summary.noteCount += 1;
      summary.hasNotes = true;
      return;
    }

    if (isAttachment) {
      summary.attachmentCount += 1;
      summary.hasAttachments = true;
      return;
    }

    summary.regularCount += 1;
    summary.hasRegularItems = true;
  });

  const nonZeroBuckets = [
    summary.noteCount,
    summary.attachmentCount,
    summary.regularCount,
  ].filter((count) => count > 0);
  summary.mixed = nonZeroBuckets.length > 1;
  return summary;
}

export function createMenuStateResolver(options = {}) {
  const prefs = options?.prefs && typeof options.prefs.get === "function"
    ? options.prefs
    : null;
  const preferenceKeys = Array.from(new Set(
    (Array.isArray(options.preferenceKeys) ? options.preferenceKeys : [])
      .map((key) => String(key || "").trim())
      .filter(Boolean),
  ));
  const extraResolvers = (Array.isArray(options.extraResolvers) ? options.extraResolvers : [])
    .filter((resolver) => typeof resolver === "function");

  return (context = {}) => {
    const items = Array.isArray(readObjectValue(context, "items"))
      ? readObjectValue(context, "items").filter(Boolean)
      : [];
    const collectionTreeRow = readObjectValue(context, "collectionTreeRow");
    const itemTypes = Array.from(new Set(items.map((item) => detectMenuItemType(item)).filter(Boolean)));
    const selectedType = itemTypes.length === 1
      ? itemTypes[0]
      : itemTypes.length > 1
        ? "mixed"
        : null;
    const preferenceFlags = Object.fromEntries(preferenceKeys.map((key) => {
      let value = null;
      if (prefs) {
        try {
          value = prefs.get(key);
        }
        catch {
          value = null;
        }
      }
      return [key, value];
    }));

    let state = {
      itemCount: items.length,
      hasItems: items.length > 0,
      selectedType,
      selectedTypes: itemTypes,
      editable: typeof readObjectValue(context, "editable") === "boolean"
        ? readObjectValue(context, "editable")
        : null,
      tabID: typeof readObjectValue(context, "tabID") === "string"
        ? readObjectValue(context, "tabID")
        : null,
      tabType: typeof readObjectValue(context, "tabType") === "string"
        ? readObjectValue(context, "tabType")
        : null,
      tabSubType: typeof readObjectValue(context, "tabSubType") === "string"
        ? readObjectValue(context, "tabSubType")
        : null,
      fieldName: typeof readObjectValue(context, "fieldName") === "string"
        ? readObjectValue(context, "fieldName")
        : null,
      libraryType: detectMenuLibraryType(context, items),
      hasCollectionSelection: hasCollectionRowKind(collectionTreeRow, "collection"),
      hasSavedSearchSelection: hasCollectionRowKind(collectionTreeRow, "search"),
      collectionTreeRowID: collectionTreeRow && typeof collectionTreeRow === "object"
        ? cloneValue(collectionTreeRow.id ?? collectionTreeRow.ref ?? null)
        : null,
      collectionTreeRowType: typeof readObjectValue(collectionTreeRow, "type") === "string"
        ? readObjectValue(collectionTreeRow, "type")
        : null,
      preferenceFlags,
      itemKinds: summarizeMenuItemKinds(items),
    };

    extraResolvers.forEach((resolver) => {
      const extraState = resolver(context, state);
      if (extraState && typeof extraState === "object" && !Array.isArray(extraState)) {
        state = {
          ...state,
          ...extraState,
        };
      }
    });

    return state;
  };
}

/**
 * 创建菜单管理器
 * @param {Object} options - 配置选项
 * @param {Object} options.logger - 日志记录器
 * @param {Object} options.lifecycle - 生命周期管理器
 * @param {Object} options.i18n - 国际化实例
 * @param {string} options.pluginID - 插件 ID（必需，用于官方 API）
 * @param {Object} [options.zotero] - Zotero 全局对象（用于测试注入）
 * @returns {Object} 菜单管理器实例
 */
export function createMenuManager(options) {
  const { logger, lifecycle, i18n, pluginID, zotero } = options;

  // 获取 Zotero 全局对象
  const Zotero = zotero || (typeof globalThis !== "undefined" && globalThis.Zotero);

  // 注册追踪
  const registeredMenus = new Map();
  const liveMenuStates = new Map();
  let menuCounter = 0;

  /**
   * 记录调试信息
   */
  function debug(message, details) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
    }
  }

  /**
   * 记录错误
   */
  function error(message, details) {
    if (logger && typeof logger.error === "function") {
      logger.error(message, details);
    }
  }

  /**
   * 检查官方 API 是否可用
   */
  function hasOfficialAPI() {
    return Zotero && Zotero.MenuManager && typeof Zotero.MenuManager.registerMenu === "function";
  }

  function clonePlainValue(value) {
    if (value === undefined) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(value));
  }

  function readContextProperty(context, key) {
    if (!context || typeof context !== "object") {
      return null;
    }
    try {
      return context[key];
    }
    catch {
      return null;
    }
  }

  function setLiveMenuBinding(context, menuId, menuPath) {
    if (!context || typeof context !== "object") {
      return;
    }
    context[LIVE_MENU_ID] = menuId || null;
    context[LIVE_MENU_PATH] = menuPath || null;
  }

  function cloneLiveMenuContext(context) {
    const menuElem = readContextProperty(context, "menuElem");
    const items = readContextProperty(context, "items");
    const collectionTreeRow = readContextProperty(context, "collectionTreeRow");
    return {
      menuElem: menuElem || null,
      popupElem: menuElem?.parentNode || null,
      itemCount: Array.isArray(items) ? items.length : null,
      tabID: typeof readContextProperty(context, "tabID") === "string"
        ? readContextProperty(context, "tabID")
        : null,
      tabType: typeof readContextProperty(context, "tabType") === "string"
        ? readContextProperty(context, "tabType")
        : null,
      tabSubType: typeof readContextProperty(context, "tabSubType") === "string"
        ? readContextProperty(context, "tabSubType")
        : null,
      editable: typeof readContextProperty(context, "editable") === "boolean"
        ? readContextProperty(context, "editable")
        : null,
      fieldName: typeof readContextProperty(context, "fieldName") === "string"
        ? readContextProperty(context, "fieldName")
        : null,
      collectionTreeRowID: collectionTreeRow && typeof collectionTreeRow === "object"
        ? clonePlainValue(collectionTreeRow.id ?? collectionTreeRow.ref ?? null)
        : null,
      collectionTreeRowType: collectionTreeRow && typeof collectionTreeRow === "object"
        ? clonePlainValue(collectionTreeRow.type ?? null)
        : null,
    };
  }

  function extractLiveMenuMetadata(context) {
    if (!context || typeof context !== "object") {
      return {};
    }
    return {
      resolvedState: clonePlainValue(context[RESOLVED_MENU_STATE] || null),
      resolvedMenu: clonePlainValue(context[RESOLVED_MENU_MODEL] || null),
    };
  }

  function makeLiveMenuStateKey(menuId, menuPath) {
    return `${menuId}::${menuPath}`;
  }

  function recordLiveMenuState(menuId, menuPath, context, phase) {
    const key = makeLiveMenuStateKey(menuId, menuPath);
    const current = liveMenuStates.get(key) || {
      menuId,
      menuPath,
    };
    const clonedContext = cloneLiveMenuContext(context);
    const liveMetadata = extractLiveMenuMetadata(context);
    liveMenuStates.set(key, {
      ...current,
      ...clonedContext,
      ...liveMetadata,
      phase,
      observedAt: new Date().toISOString(),
    });
  }

  function pickMenuPath(menuId, menuPath = null) {
    const registration = registeredMenus.get(menuId);
    if (!registration) {
      return null;
    }
    if (typeof menuPath === "string" && menuPath.trim()) {
      return menuPath.trim();
    }
    return Array.isArray(registration.menuPaths) && registration.menuPaths.length > 0
      ? registration.menuPaths[0]
      : null;
  }

  function normalizeMenuLabel(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function resolveMenuLabel(menuItem) {
    const explicitLabel = normalizeMenuLabel(menuItem?.label);
    if (explicitLabel) {
      return explicitLabel;
    }

    const l10nID = normalizeMenuLabel(menuItem?.l10nID);
    if (!l10nID) {
      return null;
    }

    if (i18n && typeof i18n.t === "function") {
      try {
        const translated = menuItem?.l10nArgs && typeof menuItem.l10nArgs === "object"
          ? i18n.t(l10nID, menuItem.l10nArgs, l10nID)
          : i18n.t(l10nID, l10nID);
        const normalized = normalizeMenuLabel(translated);
        if (normalized && normalized !== l10nID) {
          return normalized;
        }
      }
      catch {}
    }

    return null;
  }

  function applyPlainMenuLabel(menuElem, label) {
    const normalizedLabel = normalizeMenuLabel(label);
    if (!menuElem || !normalizedLabel) {
      return;
    }
    setElementAttribute(menuElem, "label", normalizedLabel);
    menuElem.label = normalizedLabel;
  }

  function wrapMenuData(menuId, menuItem, path = "0", menuPaths = []) {
    const resolvedLabel = resolveMenuLabel(menuItem);
    const data = {
      menuType: menuItem.menuType || MENU_TYPES.MENUITEM,
    };

    if (menuItem.l10nID) {
      data.l10nID = menuItem.l10nID;
      if (menuItem.l10nArgs) {
        data.l10nArgs = menuItem.l10nArgs;
      }
      if (resolvedLabel) {
        data.label = resolvedLabel;
      }
    }
    else if (resolvedLabel) {
      data.label = resolvedLabel;
    }

    if (menuItem.icon) {
      data.icon = menuItem.icon;
      if (menuItem.darkIcon) {
        data.darkIcon = menuItem.darkIcon;
      }
    }

    if (menuItem.enableForTabTypes) {
      data.enableForTabTypes = menuItem.enableForTabTypes;
    }

    const wrapHook = (hookName, original) => (event, context) => {
      try {
        setLiveMenuBinding(context, menuId, path);
        if (resolvedLabel) {
          applyPlainMenuLabel(context?.menuElem, resolvedLabel);
        }
        if (typeof original === "function") {
          return original(event, context);
        }
        return undefined;
      }
      finally {
        recordLiveMenuState(menuId, path, context, hookName);
      }
    };

    data.onShowing = wrapHook("onShowing", menuItem.onShowing);
    if (typeof menuItem.onShown === "function" || resolvedLabel) {
      data.onShown = wrapHook("onShown", menuItem.onShown);
    }
    if (typeof menuItem.onHiding === "function") {
      data.onHiding = wrapHook("onHiding", menuItem.onHiding);
    }
    if (typeof menuItem.onHidden === "function") {
      data.onHidden = wrapHook("onHidden", menuItem.onHidden);
    }
    if (typeof menuItem.onCommand === "function") {
      data.onCommand = wrapHook("onCommand", menuItem.onCommand);
    }

    if (menuItem.menuType === MENU_TYPES.SUBMENU && Array.isArray(menuItem.menus)) {
      menuPaths.push(path);
      data.menus = menuItem.menus.map((child, index) => wrapMenuData(menuId, child, `${path}.${index}`, menuPaths));
    }
    else {
      menuPaths.push(path);
    }

    return data;
  }

  function cloneMenuModel(menuItem) {
    if (!menuItem || typeof menuItem !== "object") {
      return {
        menuType: MENU_TYPES.MENUITEM,
      };
    }
    return {
      ...menuItem,
      menuType: menuItem.menuType || MENU_TYPES.MENUITEM,
      menus: Array.isArray(menuItem.menus)
        ? menuItem.menus.map((child) => cloneMenuModel(child))
        : undefined,
    };
  }

  function mergeMenuModel(baseMenu, overrideMenu) {
    const normalizedBase = cloneMenuModel(baseMenu);
    const normalizedOverride = overrideMenu && typeof overrideMenu === "object" && !Array.isArray(overrideMenu)
      ? {
        ...overrideMenu,
        ...(Object.hasOwn(overrideMenu, "menuType")
          ? { menuType: overrideMenu.menuType || MENU_TYPES.MENUITEM }
          : {}),
        ...(Object.hasOwn(overrideMenu, "menus")
          ? {
            menus: Array.isArray(overrideMenu.menus)
              ? overrideMenu.menus.map((child) => cloneMenuModel(child))
              : [],
          }
          : {}),
      }
      : {};
    return {
      ...normalizedBase,
      ...normalizedOverride,
      menuType: Object.hasOwn(normalizedOverride, "menuType")
        ? normalizedOverride.menuType
        : normalizedBase.menuType || MENU_TYPES.MENUITEM,
      menus: Object.hasOwn(normalizedOverride, "menus")
        ? (Array.isArray(normalizedOverride.menus) ? normalizedOverride.menus : [])
        : normalizedBase.menus,
    };
  }

  function collectMenuPaths(menuItem, path = "0", menuPaths = []) {
    if (menuItem?.menuType === MENU_TYPES.SUBMENU && Array.isArray(menuItem.menus)) {
      menuPaths.push(path);
      menuItem.menus.forEach((child, index) => {
        collectMenuPaths(child, `${path}.${index}`, menuPaths);
      });
    }
    else {
      menuPaths.push(path);
    }
    return menuPaths;
  }

  function setElementAttribute(element, name, value) {
    if (!element || typeof element !== "object") {
      return;
    }
    if (value === null || value === undefined || value === false) {
      if (typeof element.removeAttribute === "function") {
        element.removeAttribute(name);
      } else {
        delete element[name];
      }
      return;
    }
    const normalized = typeof value === "string" ? value : String(value);
    if (typeof element.setAttribute === "function") {
      element.setAttribute(name, normalized);
    } else {
      element[name] = normalized;
    }
  }

  function applyVisibility(context, visible) {
    if (typeof visible !== "boolean") {
      return;
    }
    if (typeof context?.setVisible === "function") {
      context.setVisible(visible);
    }
    if (context?.menuElem && typeof context.menuElem === "object") {
      context.menuElem.hidden = !visible;
    }
  }

  function applyEnabledState(context, menuItem) {
    const enabled = typeof menuItem?.enabled === "boolean"
      ? menuItem.enabled
      : typeof menuItem?.disabled === "boolean"
        ? !menuItem.disabled
        : null;
    if (typeof enabled !== "boolean") {
      return;
    }
    if (typeof context?.setEnabled === "function") {
      context.setEnabled(enabled);
    }
    if (context?.menuElem && typeof context.menuElem === "object") {
      context.menuElem.disabled = !enabled;
    }
  }

  function applyMenuIdentity(context, menuItem) {
    const menuElem = context?.menuElem;
    if (!menuElem || typeof menuElem !== "object") {
      return;
    }

    const resolvedLabel = resolveMenuLabel(menuItem);
    if (resolvedLabel) {
      applyPlainMenuLabel(menuElem, resolvedLabel);
    }

    if (typeof menuItem?.l10nID === "string" && menuItem.l10nID.trim()) {
      setElementAttribute(menuElem, "data-l10n-id", menuItem.l10nID.trim());
    }

    if (menuItem?.l10nArgs && typeof context?.setL10nArgs === "function") {
      context.setL10nArgs(menuItem.l10nArgs);
    }

    if (typeof menuItem?.icon === "string" && menuItem.icon.trim()) {
      if (typeof context?.setIcon === "function") {
        context.setIcon(menuItem.icon, menuItem.darkIcon);
      } else {
        setElementAttribute(menuElem, "image", menuItem.icon.trim());
      }
    }
  }

  function resolveSubmenuPopup(menuElem) {
    if (!menuElem || typeof menuElem !== "object") {
      return null;
    }
    if (menuElem.menupopup) {
      return menuElem.menupopup;
    }
    if (menuElem.popup) {
      return menuElem.popup;
    }
    if (typeof menuElem.querySelector === "function") {
      const popup = menuElem.querySelector("menupopup");
      if (popup) {
        return popup;
      }
    }
    if (Array.isArray(menuElem.childNodes)) {
      return menuElem.childNodes.find((child) => child?.tagName === "menupopup") || null;
    }
    return null;
  }

  function createFallbackMenuElement(tagName) {
    return {
      tagName,
      attributes: {},
      childNodes: [],
      parentNode: null,
      listeners: {},
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      appendChild(child) {
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
      },
      replaceChildren(...children) {
        this.childNodes = [];
        children.forEach((child) => {
          this.appendChild(child);
        });
      },
      addEventListener(type, listener) {
        this.listeners[type] = listener;
      },
    };
  }

  function createMenuElementNode(tagName, ownerDocument) {
    if (ownerDocument && typeof ownerDocument.createXULElement === "function") {
      return ownerDocument.createXULElement(tagName);
    }
    if (ownerDocument && typeof ownerDocument.createElement === "function") {
      return ownerDocument.createElement(tagName);
    }
    return createFallbackMenuElement(tagName);
  }

  function ensureSubmenuPopup(menuElem) {
    const existing = resolveSubmenuPopup(menuElem);
    if (existing) {
      return existing;
    }
    const popup = createMenuElementNode("menupopup", menuElem?.ownerDocument || null);
    if (typeof menuElem?.appendChild === "function") {
      menuElem.appendChild(popup);
    }
    menuElem.menupopup = popup;
    menuElem.popup = popup;
    return popup;
  }

  function buildDynamicMenuCommandContext(baseContext, menuId, menuPath, menuItem, menuElem) {
    const commandContext = baseContext && typeof baseContext === "object"
      ? {
        ...baseContext,
      }
      : {};
    commandContext.menuElem = menuElem || null;
    setLiveMenuBinding(commandContext, menuId, menuPath);
    if (RESOLVED_MENU_STATE in commandContext) {
      commandContext[RESOLVED_MENU_STATE] = baseContext[RESOLVED_MENU_STATE];
    }
    if (menuItem && typeof menuItem === "object") {
      commandContext[RESOLVED_MENU_MODEL] = menuItem;
    }
    return commandContext;
  }

  function attachMenuCommand(element, menuItem, options = {}) {
    if (!element || !menuItem) {
      return;
    }
    const menuId = typeof options.menuId === "string" && options.menuId.trim()
      ? options.menuId.trim()
      : null;
    const menuPath = typeof options.menuPath === "string" && options.menuPath.trim()
      ? options.menuPath.trim()
      : null;
    if (!menuId || !menuPath) {
      if (typeof menuItem.onCommand !== "function") {
        return;
      }
    }
    const baseContext = options.context && typeof options.context === "object"
      ? options.context
      : null;
    const invokeCommand = (event) => {
      const commandContext = buildDynamicMenuCommandContext(baseContext, menuId, menuPath, menuItem, element);
      try {
        if (typeof menuItem.onCommand === "function") {
          menuItem.onCommand(event, commandContext);
        }
      }
      finally {
        if (menuId && menuPath) {
          recordLiveMenuState(menuId, menuPath, commandContext, "onCommand");
        }
      }
    };
    if (typeof element.addEventListener === "function") {
      element.addEventListener("command", invokeCommand);
    } else {
      element.oncommand = invokeCommand;
    }
  }

  function buildDynamicMenuElement(menuItem, ownerDocument, options = {}) {
    if (!menuItem || typeof menuItem !== "object") {
      return null;
    }
    const menuId = typeof options.menuId === "string" && options.menuId.trim()
      ? options.menuId.trim()
      : null;
    const menuPath = typeof options.menuPath === "string" && options.menuPath.trim()
      ? options.menuPath.trim()
      : null;
    const tagName = menuItem.menuType === MENU_TYPES.SUBMENU
      ? "menu"
      : menuItem.menuType === MENU_TYPES.SEPARATOR
        ? "menuseparator"
        : "menuitem";
    const element = createMenuElementNode(tagName, ownerDocument);
    if (!element) {
      return null;
    }

    if (menuItem.menuType !== MENU_TYPES.SEPARATOR) {
      applyMenuIdentity({ menuElem: element }, menuItem);
      if (typeof menuItem.visible === "boolean") {
        element.hidden = !menuItem.visible;
      }
      if (typeof menuItem.disabled === "boolean") {
        element.disabled = menuItem.disabled;
      } else if (typeof menuItem.enabled === "boolean") {
        element.disabled = !menuItem.enabled;
      }
      attachMenuCommand(element, menuItem, {
        context: options.context || null,
        menuId,
        menuPath,
      });
    }

    if (menuItem.menuType === MENU_TYPES.SUBMENU) {
      const popup = ensureSubmenuPopup(element);
      const childElements = (Array.isArray(menuItem.menus) ? menuItem.menus : [])
        .map((child, index) => buildDynamicMenuElement(child, ownerDocument, {
          ...options,
          menuPath: menuPath ? `${menuPath}.${index}` : `${index}`,
        }))
        .filter(Boolean);
      if (typeof popup.replaceChildren === "function") {
        popup.replaceChildren(...childElements);
      } else {
        popup.childNodes = [];
        childElements.forEach((child) => {
          if (typeof popup.appendChild === "function") {
            popup.appendChild(child);
          }
        });
      }
    }

    return element;
  }

  function recordDynamicMenuTreeState(context, menuItem, menuId, menuPath, element) {
    if (!context || typeof context !== "object" || !menuItem || !menuId || !menuPath || !element) {
      return;
    }
    const liveContext = {
      ...context,
      menuElem: element,
    };
    setLiveMenuBinding(liveContext, menuId, menuPath);
    liveContext[RESOLVED_MENU_STATE] = context[RESOLVED_MENU_STATE] || null;
    liveContext[RESOLVED_MENU_MODEL] = menuItem;
    recordLiveMenuState(menuId, menuPath, liveContext, "dynamic-rebuild");

    if (menuItem.menuType !== MENU_TYPES.SUBMENU || !Array.isArray(menuItem.menus)) {
      return;
    }

    const popup = ensureSubmenuPopup(element);
    const childElements = Array.isArray(popup?.childNodes)
      ? popup.childNodes
      : Array.from(popup?.children || []);
    menuItem.menus.forEach((child, index) => {
      recordDynamicMenuTreeState(
        liveContext,
        child,
        menuId,
        `${menuPath}.${index}`,
        childElements[index] || null,
      );
    });
  }

  function rebuildDynamicSubmenu(context, menuItem) {
    if (menuItem?.menuType !== MENU_TYPES.SUBMENU || !context?.menuElem) {
      return;
    }
    const menuId = typeof context?.[LIVE_MENU_ID] === "string" && context[LIVE_MENU_ID].trim()
      ? context[LIVE_MENU_ID].trim()
      : null;
    const basePath = typeof context?.[LIVE_MENU_PATH] === "string" && context[LIVE_MENU_PATH].trim()
      ? context[LIVE_MENU_PATH].trim()
      : null;
    const popup = ensureSubmenuPopup(context.menuElem);
    const builtChildren = (Array.isArray(menuItem.menus) ? menuItem.menus : [])
      .map((child, index) => ({
        child,
        menuPath: basePath ? `${basePath}.${index}` : `${index}`,
        element: buildDynamicMenuElement(
          child,
          context.menuElem.ownerDocument || popup?.ownerDocument || null,
          {
            context,
            menuId,
            menuPath: basePath ? `${basePath}.${index}` : `${index}`,
          },
        ),
      }))
      .filter((entry) => entry.element);
    const childElements = builtChildren.map((entry) => entry.element);
    if (typeof popup.replaceChildren === "function") {
      popup.replaceChildren(...childElements);
    } else {
      popup.childNodes = [];
      childElements.forEach((child) => {
        if (typeof popup.appendChild === "function") {
          popup.appendChild(child);
        }
      });
    }
    builtChildren.forEach(({ child, menuPath, element }) => {
      if (menuId && menuPath) {
        recordDynamicMenuTreeState(context, child, menuId, menuPath, element);
      }
    });
  }

  function applyStateDrivenMenu(context, menuItem) {
    if (!context || typeof context !== "object" || !menuItem || typeof menuItem !== "object") {
      return;
    }
    applyVisibility(context, menuItem.visible);
    applyEnabledState(context, menuItem);
    applyMenuIdentity(context, menuItem);
    if (menuItem.menuType === MENU_TYPES.SUBMENU) {
      rebuildDynamicSubmenu(context, menuItem);
    }
  }

  function updateResolvedMenuContext(context, state, menuItem) {
    if (!context || typeof context !== "object") {
      return;
    }
    context[RESOLVED_MENU_STATE] = clonePlainValue(state || {});
    context[RESOLVED_MENU_MODEL] = clonePlainValue(menuItem || {});
  }

  function storeFallbackRegistration(menuId, target, config, menus, reason = "official-unavailable", menuPaths = null) {
    debug("menuManager.register.fallback", { menuId, target, reason });

    registeredMenus.set(menuId, {
      id: menuId,
      target,
      config,
      cleanup: () => {},
      useOfficialAPI: false,
      menuPaths: Array.isArray(menuPaths) ? [...menuPaths] : [],
      menus: clonePlainValue(menus),
    });

    return menuId;
  }

  function promoteFallbackRegistration(menuId) {
    const registration = registeredMenus.get(menuId);
    if (!registration || registration.useOfficialAPI !== false || !registration.config || !hasOfficialAPI()) {
      return registration || null;
    }

    const promotedId = register(registration.config);
    return registeredMenus.get(promotedId) || registeredMenus.get(menuId) || registration;
  }

  function promoteFallbackRegistrations() {
    if (!hasOfficialAPI()) {
      return;
    }
    Array.from(registeredMenus.keys()).forEach((menuId) => {
      promoteFallbackRegistration(menuId);
    });
  }

  /**
   * 注册菜单（使用官方 API）
   * @param {Object} config - 菜单配置
   * @param {string} [config.id] - 菜单唯一 ID（可选，自动生成）
   * @param {string} config.target - 菜单目标（使用 MENU_TARGETS 常量）
   * @param {Array} config.menus - 菜单项数组
   * @returns {string|null} 菜单 ID，失败返回 null
   *
   * @example
   * register({
   *   target: MENU_TARGETS.LIBRARY_ITEM,
   *   menus: [{
   *     menuType: MENU_TYPES.MENUITEM,
   *     label: "My Action",
   *     icon: "chrome://myaddon/content/icon.svg",
   *     onCommand: (event, context) => {
   *       console.log("Items:", context.items);
   *     },
   *     onShowing: (event, context) => {
   *       context.setVisible(context.items.length > 0);
   *     }
   *   }]
   * })
   */
  function register(config) {
    const { id: customId, target, menus } = config;

    // 验证必需参数
    if (!target) {
      error("menuManager.register.noTarget", {});
      return null;
    }

    if (!menus || !Array.isArray(menus) || menus.length === 0) {
      error("menuManager.register.noMenus", {});
      return null;
    }

    const menuId = customId || `menu-${++menuCounter}`;

    // 使用官方 API
    if (hasOfficialAPI()) {
      try {
        if (registeredMenus.has(menuId)) {
          unregister(menuId);
        }
        else if (Zotero.MenuManager && typeof Zotero.MenuManager.unregisterMenu === "function") {
          try {
            Zotero.MenuManager.unregisterMenu(menuId);
          }
          catch {}
        }

        const menuPaths = [];
        const menuData = menus.map((menuItem, index) => wrapMenuData(menuId, menuItem, `${index}`, menuPaths));

        const options = {
          menuID: menuId,
          pluginID: pluginID,
          target: target,
          menus: menuData,
        };

        const result = Zotero.MenuManager.registerMenu(options);

        if (result) {
          const registeredMenuID = typeof result === "string" && result.trim()
            ? result.trim()
            : menuId;
          const cleanup = () => {
            if (Zotero.MenuManager && typeof Zotero.MenuManager.unregisterMenu === "function") {
              Zotero.MenuManager.unregisterMenu(registeredMenuID);
            }
          };

          registeredMenus.set(menuId, {
            id: menuId,
            registeredMenuID,
            target,
            cleanup,
            useOfficialAPI: true,
            menuPaths,
            menus: clonePlainValue(menus),
          });
          debug("menuManager.register.created", { menuId, registeredMenuID, target });
          return menuId;
        }

        error("menuManager.register.officialReturnedFalsy", {
          menuId,
          target,
        });
        return storeFallbackRegistration(menuId, target, config, menus, "official-returned-falsy", menuPaths);
      } catch (err) {
        error("menuManager.register.failed", {
          message: String(err?.message || err),
          target,
        });
        return null;
      }
    }

    // 降级：存储配置等待窗口加载
    const fallbackMenuPaths = [];
    menus.forEach((menuItem, index) => {
      collectMenuPaths(menuItem, `${index}`, fallbackMenuPaths);
    });
    return storeFallbackRegistration(menuId, target, config, menus, "official-unavailable", fallbackMenuPaths);
  }

  /**
   * 注册工具菜单项（便捷方法）
   * @param {Object} menuItem - 菜单项配置
   * @param {string} [menuItem.id] - 菜单项 ID
   * @param {string} menuItem.label - 菜单标签
   * @param {Function} menuItem.onCommand - 点击回调
   * @param {string} [menuItem.icon] - 图标路径
   * @param {Array} [menuItem.enableForTabTypes] - 启用的标签页类型
   * @returns {string|null} 菜单 ID
   */
  function registerToolsMenuItem(menuItem) {
    return register({
      id: menuItem.id,
      target: MENU_TARGETS.MAIN_MENU_TOOLS,
      menus: [{
        menuType: MENU_TYPES.MENUITEM,
        label: menuItem.label,
        l10nID: menuItem.l10nID,
        l10nArgs: menuItem.l10nArgs,
        icon: menuItem.icon,
        enableForTabTypes: menuItem.enableForTabTypes,
        onCommand: menuItem.onCommand,
        onShowing: menuItem.onShowing,
      }],
    });
  }

  function registerSingleMenuItem(target, menuItem) {
    return register({
      id: menuItem.id,
      target,
      menus: [{
        menuType: MENU_TYPES.MENUITEM,
        label: menuItem.label,
        l10nID: menuItem.l10nID,
        l10nArgs: menuItem.l10nArgs,
        icon: menuItem.icon,
        enableForTabTypes: menuItem.enableForTabTypes,
        onCommand: menuItem.onCommand,
        onShowing: menuItem.onShowing,
      }],
    });
  }

  function registerSingleSubmenu(target, config) {
    return register({
      id: config.id,
      target,
      menus: [{
        menuType: MENU_TYPES.SUBMENU,
        label: config.label,
        l10nID: config.l10nID,
        l10nArgs: config.l10nArgs,
        icon: config.icon,
        menus: config.menus,
      }],
    });
  }

  /**
   * 注册条目菜单项（main/library/item）
   * @param {Object} menuItem - 菜单项配置
   * @returns {string|null} 菜单 ID
   */
  function registerItemMenuItem(menuItem) {
    return registerSingleMenuItem(MENU_TARGETS.LIBRARY_ITEM, menuItem);
  }

  /**
   * 注册条目右键菜单项（兼容别名；推荐新代码改用 registerItemMenuItem）
   * @param {Object} menuItem - 菜单项配置
   * @param {string} [menuItem.id] - 菜单项 ID
   * @param {string} menuItem.label - 菜单标签
   * @param {Function} menuItem.onCommand - 点击回调 (event, context) => void
   * @param {Function} [menuItem.onShowing] - 显示前回调，可控制可见性
   * @param {string} [menuItem.icon] - 图标路径
   * @returns {string|null} 菜单 ID
   */
  function registerContextMenuItem(menuItem) {
    return registerItemMenuItem(menuItem);
  }

  /**
   * 注册收藏集右键菜单项（便捷方法）
   * @param {Object} menuItem - 菜单项配置
   * @returns {string|null} 菜单 ID
   */
  function registerCollectionMenuItem(menuItem) {
    return registerSingleMenuItem(MENU_TARGETS.LIBRARY_COLLECTION, menuItem);
  }

  /**
   * 注册条目窗格信息行菜单项（itemPane/info/row）
   * @param {Object} menuItem - 菜单项配置
   * @returns {string|null} 菜单 ID
   */
  function registerItemPaneInfoRowMenuItem(menuItem) {
    return registerSingleMenuItem(MENU_TARGETS.ITEM_PANE_INFO_ROW, menuItem);
  }

  /**
   * 注册 Reader View 菜单栏菜单项（reader/menubar/view）
   * @param {Object} menuItem - 菜单项配置
   * @returns {string|null} 菜单 ID
   */
  function registerReaderMenubarViewMenuItem(menuItem) {
    return registerSingleMenuItem(MENU_TARGETS.READER_MENU_VIEW, menuItem);
  }

  /**
   * 注册阅读器菜单项（兼容 helper；推荐 reader/menubar/view 使用 registerReaderMenubarViewMenuItem）
   * @param {Object} config - 配置
   * @param {string} config.target - 阅读器菜单目标（READER_MENU_*）
   * @param {Object} menuItem - 菜单项配置
   * @returns {string|null} 菜单 ID
   */
  function registerReaderMenuItem(config, menuItem) {
    return registerSingleMenuItem(config.target, menuItem);
  }

  /**
   * 注册条目子菜单（main/library/item）
   * @param {Object} config - 配置
   * @returns {string|null} 菜单 ID
   */
  function registerItemSubmenu(config) {
    return registerSingleSubmenu(MENU_TARGETS.LIBRARY_ITEM, config);
  }

  /**
   * 注册收藏集子菜单（main/library/collection）
   * @param {Object} config - 配置
   * @returns {string|null} 菜单 ID
   */
  function registerCollectionSubmenu(config) {
    return registerSingleSubmenu(MENU_TARGETS.LIBRARY_COLLECTION, config);
  }

  /**
   * 注册 Reader View 菜单栏子菜单（reader/menubar/view）
   * @param {Object} config - 配置
   * @returns {string|null} 菜单 ID
   */
  function registerReaderMenubarViewSubmenu(config) {
    return registerSingleSubmenu(MENU_TARGETS.READER_MENU_VIEW, config);
  }

  /**
   * 注册子菜单（兼容 helper；推荐优先使用 scene-specific submenu helpers）
   * @param {Object} config - 配置
   * @param {string} config.target - 菜单目标
   * @param {string} config.label - 子菜单标签
   * @param {Array} config.menus - 子菜单项数组
   * @param {string} [config.icon] - 图标路径
   * @returns {string|null} 菜单 ID
   */
  function registerSubmenu(config) {
    return registerSingleSubmenu(config.target, config);
  }

  function registerStateDrivenMenu(config) {
    const target = config?.target;
    const menuId = typeof config?.id === "string" && config.id.trim()
      ? config.id.trim()
      : `menu-${++menuCounter}`;
    const baseMenu = cloneMenuModel(config?.baseMenu || {});
    const resolveState = typeof config?.resolveState === "function"
      ? config.resolveState
      : () => ({});
    const buildMenu = typeof config?.buildMenu === "function"
      ? config.buildMenu
      : ({ baseMenu: defaultMenu }) => defaultMenu;

    if (!target) {
      error("menuManager.registerStateDrivenMenu.noTarget", {
        menuId,
      });
      return null;
    }

    const stateDrivenMenu = {
      ...baseMenu,
      onShowing(event, context) {
        const resolvedState = resolveState(context || {}) || {};
        const builtMenu = mergeMenuModel(baseMenu, buildMenu({
          state: resolvedState,
          context: context || {},
          baseMenu: cloneMenuModel(baseMenu),
          menuId,
        }) || {});

        updateResolvedMenuContext(context, resolvedState, builtMenu);
        applyStateDrivenMenu(context, builtMenu);

        if (typeof builtMenu.onShowing === "function" && builtMenu.onShowing !== stateDrivenMenu.onShowing) {
          return builtMenu.onShowing(event, context);
        }
        return undefined;
      },
    };

    return register({
      id: menuId,
      target,
      menus: [stateDrivenMenu],
    });
  }

  /**
   * 注册分隔符（便捷方法）
   * @param {string} target - 菜单目标
   * @param {string} [id] - 分隔符 ID
   * @returns {string|null} 分隔符 ID
   */
  function registerSeparator(target, id) {
    return register({
      id: id || `separator-${++menuCounter}`,
      target: target,
      menus: [{
        menuType: MENU_TYPES.SEPARATOR,
      }],
    });
  }

  /**
   * 注销菜单项
   * @param {string} menuId - 菜单项 ID
   * @returns {boolean} 是否成功
   */
  function unregister(menuId) {
    const registration = registeredMenus.get(menuId);
    if (!registration) {
      return false;
    }

    try {
      if (typeof registration.cleanup === "function") {
        registration.cleanup();
      }
      for (const key of liveMenuStates.keys()) {
        if (key.startsWith(`${menuId}::`)) {
          liveMenuStates.delete(key);
        }
      }
      registeredMenus.delete(menuId);

      debug("menuManager.unregister.removed", { menuId });
      return true;
    } catch (err) {
      error("menuManager.unregister.failed", {
        menuId,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 注销所有注册
   */
  function unregisterAll() {
    const count = registeredMenus.size;
    registeredMenus.forEach((_, id) => {
      unregister(id);
    });
    debug("menuManager.unregisterAll", { count });
  }

  /**
   * 获取注册的菜单项数量
   * @returns {number}
   */
  function getMenuCount() {
    promoteFallbackRegistrations();
    return registeredMenus.size;
  }

  /**
   * 检查菜单项是否已注册
   * @param {string} menuId - 菜单项 ID
   * @returns {boolean}
   */
  function hasMenu(menuId) {
    promoteFallbackRegistration(menuId);
    return registeredMenus.has(menuId);
  }

  /**
   * 获取所有已注册的菜单 ID
   * @returns {string[]}
   */
  function getRegisteredMenuIds() {
    promoteFallbackRegistrations();
    return Array.from(registeredMenus.keys());
  }

  function getMenuRegistrationSnapshot(menuId = null) {
    if (menuId) {
      const registration = promoteFallbackRegistration(menuId) || registeredMenus.get(menuId);
      return registration
        ? clonePlainValue({
          id: registration.id,
          registeredMenuID: registration.registeredMenuID || registration.id,
          target: registration.target,
          useOfficialAPI: registration.useOfficialAPI,
          menuPaths: registration.menuPaths || [],
          menus: registration.menus || [],
        })
        : null;
    }
    promoteFallbackRegistrations();
    return Array.from(registeredMenus.values()).map((registration) => clonePlainValue({
      id: registration.id,
      registeredMenuID: registration.registeredMenuID || registration.id,
      target: registration.target,
      useOfficialAPI: registration.useOfficialAPI,
      menuPaths: registration.menuPaths || [],
      menus: registration.menus || [],
    }));
  }

  function getLiveMenuState(menuId, menuPath = null) {
    promoteFallbackRegistration(menuId);
    const resolvedPath = pickMenuPath(menuId, menuPath);
    if (!resolvedPath) {
      return null;
    }
    return liveMenuStates.get(makeLiveMenuStateKey(menuId, resolvedPath)) || null;
  }

  /**
   * 检查官方 API 是否可用
   * @returns {boolean}
   */
  function isOfficialAPIAvailable() {
    const available = hasOfficialAPI();
    if (available) {
      promoteFallbackRegistrations();
    }
    return available;
  }

  // 如果提供了 lifecycle，注册自动清理
  if (lifecycle && typeof lifecycle.trackCleanup === "function") {
    lifecycle.trackCleanup(unregisterAll);
  }

  return {
    // 常量
    MENU_TARGETS,
    MENU_TYPES,
    TAB_TYPES,

    // 核心注册方法
    register,

    // 便捷注册方法
    registerToolsMenuItem,
    registerItemMenuItem,
    registerContextMenuItem,
    registerCollectionMenuItem,
    registerItemPaneInfoRowMenuItem,
    registerReaderMenuItem,
    registerReaderMenubarViewMenuItem,
    registerItemSubmenu,
    registerCollectionSubmenu,
    registerReaderMenubarViewSubmenu,
    registerSubmenu,
    registerStateDrivenMenu,
    registerSeparator,

    // 注销方法
    unregister,
    unregisterAll,

    // 查询方法
    getMenuCount,
    hasMenu,
    getRegisteredMenuIds,
    getMenuRegistrationSnapshot,
    getLiveMenuState,
    isOfficialAPIAvailable,
  };
}
