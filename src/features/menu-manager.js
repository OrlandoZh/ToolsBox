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

  // 条目面板上下文菜单
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

  /**
   * 构建菜单数据结构
   * @param {Object} menuItem - 菜单项配置
   * @returns {Object} 符合官方 API 的菜单数据
   */
  function buildMenuData(menuItem) {
    const data = {
      menuType: menuItem.menuType || MENU_TYPES.MENUITEM,
    };

    // 标签：支持 l10nID 或直接 label
    if (menuItem.l10nID) {
      data.l10nID = menuItem.l10nID;
      if (menuItem.l10nArgs) {
        data.l10nArgs = menuItem.l10nArgs;
      }
    } else if (menuItem.label) {
      // 如果没有 l10nID，退回纯文本 label，避免向官方 API 传入 null 型 l10nID。
      data.label = menuItem.label;
    }

    // 图标
    if (menuItem.icon) {
      data.icon = menuItem.icon;
      if (menuItem.darkIcon) {
        data.darkIcon = menuItem.darkIcon;
      }
    }

    // 标签页类型过滤（仅用于菜单栏菜单）
    if (menuItem.enableForTabTypes) {
      data.enableForTabTypes = menuItem.enableForTabTypes;
    }

    // 生命周期钩子
    if (typeof menuItem.onShowing === "function") {
      data.onShowing = menuItem.onShowing;
    }
    if (typeof menuItem.onShown === "function") {
      data.onShown = menuItem.onShown;
    }
    if (typeof menuItem.onHiding === "function") {
      data.onHiding = menuItem.onHiding;
    }
    if (typeof menuItem.onHidden === "function") {
      data.onHidden = menuItem.onHidden;
    }
    if (typeof menuItem.onCommand === "function") {
      data.onCommand = menuItem.onCommand;
    }

    // 子菜单
    if (menuItem.menuType === MENU_TYPES.SUBMENU && menuItem.menus) {
      data.menus = menuItem.menus.map(m => buildMenuData(m));
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
        const menuData = menus.map(m => buildMenuData(m));

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

          registeredMenus.set(menuId, { target, cleanup, useOfficialAPI: true });
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
      target,
      config,
      cleanup: () => {},
      useOfficialAPI: false,
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
    isOfficialAPIAvailable,
  };
}
