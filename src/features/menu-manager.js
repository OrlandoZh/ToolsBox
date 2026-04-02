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
    liveMenuStates.set(key, {
      ...current,
      ...clonedContext,
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

  function wrapMenuData(menuId, menuItem, path = "0", menuPaths = []) {
    const data = {
      menuType: menuItem.menuType || MENU_TYPES.MENUITEM,
    };

    if (menuItem.l10nID) {
      data.l10nID = menuItem.l10nID;
      if (menuItem.l10nArgs) {
        data.l10nArgs = menuItem.l10nArgs;
      }
    }
    else if (menuItem.label) {
      data.label = menuItem.label;
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
      recordLiveMenuState(menuId, path, context, hookName);
      if (typeof original === "function") {
        return original(event, context);
      }
      return undefined;
    };

    data.onShowing = wrapHook("onShowing", menuItem.onShowing);
    if (typeof menuItem.onShown === "function") {
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

    if (menuItem.menuType === MENU_TYPES.SUBMENU && menuItem.menus) {
      data.menus = menuItem.menus.map((child, index) => wrapMenuData(menuId, child, `${path}.${index}`, menuPaths));
    }
    else {
      menuPaths.push(path);
    }

    return data;
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
          const cleanup = () => {
            if (Zotero.MenuManager && typeof Zotero.MenuManager.unregisterMenu === "function") {
              Zotero.MenuManager.unregisterMenu(menuId);
            }
          };

          registeredMenus.set(menuId, {
            id: menuId,
            target,
            cleanup,
            useOfficialAPI: true,
            menuPaths,
            menus: clonePlainValue(menus),
          });
          debug("menuManager.register.created", { menuId, target });
          return menuId;
        }
      } catch (err) {
        error("menuManager.register.failed", {
          message: String(err?.message || err),
          target,
        });
        return null;
      }
    }

    // 降级：存储配置等待窗口加载
    debug("menuManager.register.fallback", { menuId, target });

    registeredMenus.set(menuId, {
      id: menuId,
      target,
      config,
      cleanup: () => {},
      useOfficialAPI: false,
      menuPaths: [],
      menus: clonePlainValue(menus),
    });

    return menuId;
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

  /**
   * 注册条目右键菜单项（便捷方法）
   * @param {Object} menuItem - 菜单项配置
   * @param {string} [menuItem.id] - 菜单项 ID
   * @param {string} menuItem.label - 菜单标签
   * @param {Function} menuItem.onCommand - 点击回调 (event, context) => void
   * @param {Function} [menuItem.onShowing] - 显示前回调，可控制可见性
   * @param {string} [menuItem.icon] - 图标路径
   * @returns {string|null} 菜单 ID
   */
  function registerContextMenuItem(menuItem) {
    return register({
      id: menuItem.id,
      target: MENU_TARGETS.LIBRARY_ITEM,
      menus: [{
        menuType: MENU_TYPES.MENUITEM,
        label: menuItem.label,
        l10nID: menuItem.l10nID,
        l10nArgs: menuItem.l10nArgs,
        icon: menuItem.icon,
        onCommand: menuItem.onCommand,
        onShowing: menuItem.onShowing,
      }],
    });
  }

  /**
   * 注册收藏集右键菜单项（便捷方法）
   * @param {Object} menuItem - 菜单项配置
   * @returns {string|null} 菜单 ID
   */
  function registerCollectionMenuItem(menuItem) {
    return register({
      id: menuItem.id,
      target: MENU_TARGETS.LIBRARY_COLLECTION,
      menus: [{
        menuType: MENU_TYPES.MENUITEM,
        label: menuItem.label,
        l10nID: menuItem.l10nID,
        l10nArgs: menuItem.l10nArgs,
        icon: menuItem.icon,
        onCommand: menuItem.onCommand,
        onShowing: menuItem.onShowing,
      }],
    });
  }

  /**
   * 注册阅读器菜单项（便捷方法）
   * @param {Object} config - 配置
   * @param {string} config.target - 阅读器菜单目标（READER_MENU_*）
   * @param {Object} menuItem - 菜单项配置
   * @returns {string|null} 菜单 ID
   */
  function registerReaderMenuItem(config, menuItem) {
    return register({
      id: menuItem.id,
      target: config.target,
      menus: [{
        menuType: MENU_TYPES.MENUITEM,
        label: menuItem.label,
        l10nID: menuItem.l10nID,
        l10nArgs: menuItem.l10nArgs,
        icon: menuItem.icon,
        onCommand: menuItem.onCommand,
        onShowing: menuItem.onShowing,
      }],
    });
  }

  /**
   * 注册子菜单
   * @param {Object} config - 配置
   * @param {string} config.target - 菜单目标
   * @param {string} config.label - 子菜单标签
   * @param {Array} config.menus - 子菜单项数组
   * @param {string} [config.icon] - 图标路径
   * @returns {string|null} 菜单 ID
   */
  function registerSubmenu(config) {
    return register({
      id: config.id,
      target: config.target,
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
    return registeredMenus.size;
  }

  /**
   * 检查菜单项是否已注册
   * @param {string} menuId - 菜单项 ID
   * @returns {boolean}
   */
  function hasMenu(menuId) {
    return registeredMenus.has(menuId);
  }

  /**
   * 获取所有已注册的菜单 ID
   * @returns {string[]}
   */
  function getRegisteredMenuIds() {
    return Array.from(registeredMenus.keys());
  }

  function getMenuRegistrationSnapshot(menuId = null) {
    if (menuId) {
      const registration = registeredMenus.get(menuId);
      return registration
        ? clonePlainValue({
          id: registration.id,
          target: registration.target,
          useOfficialAPI: registration.useOfficialAPI,
          menuPaths: registration.menuPaths || [],
          menus: registration.menus || [],
        })
        : null;
    }
    return Array.from(registeredMenus.values()).map((registration) => clonePlainValue({
      id: registration.id,
      target: registration.target,
      useOfficialAPI: registration.useOfficialAPI,
      menuPaths: registration.menuPaths || [],
      menus: registration.menus || [],
    }));
  }

  function getLiveMenuState(menuId, menuPath = null) {
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
    return hasOfficialAPI();
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
    registerContextMenuItem,
    registerCollectionMenuItem,
    registerReaderMenuItem,
    registerSubmenu,
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
