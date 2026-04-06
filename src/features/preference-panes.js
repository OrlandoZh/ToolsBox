/**
 * PreferencePanes 封装模块
 * 提供偏好设置面板注册和管理功能
 */

const PREFERENCE_PANE_LOAD_BRIDGE_SCRIPT = "content/preference-pane-load-bridge.js";
const PREFERENCE_PANE_LOADERS_KEY = "__CLEANROOM_PREFERENCE_PANE_LOADERS__";
const PREFERENCE_PANE_LOAD_API_KEY = "__CLEANROOM_PREFERENCE_PANE_LOAD_API__";

function toPlainString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * 创建偏好设置面板管理器
 * @param {Object} options - 配置选项
 * @param {Object} options.logger - 日志记录器
 * @param {Object} options.lifecycle - 生命周期管理器
 * @param {string} options.pluginID - 插件 ID
 * @param {string} options.rootURI - 插件根 URI（用于解析相对路径）
 * @param {Object} [options.zotero] - Zotero 全局对象（用于测试注入）
 * @returns {Object} 偏好设置面板管理器实例
 */
export function createPreferencePanes(options) {
  const { logger, lifecycle, pluginID, rootURI = "", zotero } = options;

  // 获取 Zotero 全局对象
  const Zotero = zotero || (typeof globalThis !== "undefined" && globalThis.Zotero);

  // 注册追踪
  const registeredPanes = new Map();

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
   * 记录警告
   */
  function warn(message, details) {
    if (logger && typeof logger.warn === "function") {
      logger.warn(message, details);
    }
  }

  /**
   * 检查 PreferencePanes API 是否可用
   * @returns {boolean}
   */
  function isAvailable() {
    return Boolean(Zotero && Zotero.PreferencePanes);
  }

  /**
   * 解析 URI（支持相对路径）
   * @param {string} uri - URI 或相对路径
   * @returns {string} 完整 URI
   */
  function resolveURI(uri) {
    if (!uri) return uri;
    // 如果已经是完整 URI，直接返回
    if (uri.includes("://") || uri.startsWith("/")) {
      return uri;
    }
    // 相对路径，拼接 rootURI
    return rootURI + uri;
  }

  function getPreferencePaneLoadHost() {
    if (typeof Services === "object" && Services) {
      return Services;
    }
    return Zotero && typeof Zotero === "object" ? Zotero : globalThis;
  }

  function getPreferencePaneLoadRegistry() {
    const host = getPreferencePaneLoadHost();
    if (!host[PREFERENCE_PANE_LOADERS_KEY] || typeof host[PREFERENCE_PANE_LOADERS_KEY] !== "object") {
      host[PREFERENCE_PANE_LOADERS_KEY] = Object.create(null);
    }
    if (!host[PREFERENCE_PANE_LOAD_API_KEY] || typeof host[PREFERENCE_PANE_LOAD_API_KEY] !== "object") {
      host[PREFERENCE_PANE_LOAD_API_KEY] = {
        invoke(context = {}) {
          const paneID = toPlainString(context.paneID);
          const pluginIDFromContext = toPlainString(context.pluginID);
          if (!paneID || !pluginIDFromContext) {
            return null;
          }
          const handler = host[PREFERENCE_PANE_LOADERS_KEY][`${pluginIDFromContext}::${paneID}`];
          if (typeof handler !== "function") {
            return null;
          }
          return handler(context);
        },
        unregister(context = {}) {
          const paneID = toPlainString(context.paneID);
          const pluginIDFromContext = toPlainString(context.pluginID);
          if (!paneID || !pluginIDFromContext) {
            return false;
          }
          const key = `${pluginIDFromContext}::${paneID}`;
          if (!host[PREFERENCE_PANE_LOADERS_KEY][key]) {
            return false;
          }
          delete host[PREFERENCE_PANE_LOADERS_KEY][key];
          return true;
        },
      };
    }
    return host[PREFERENCE_PANE_LOADERS_KEY];
  }

  function registerPreferencePaneLoadHandler(paneID, onPreferenceLoad) {
    if (!paneID || typeof onPreferenceLoad !== "function") {
      return;
    }
    const registry = getPreferencePaneLoadRegistry();
    registry[`${pluginID}::${paneID}`] = async (context = {}) => {
      return await onPreferenceLoad({
        window: context.window && typeof context.window === "object" ? context.window : null,
        paneID: toPlainString(context.paneID) || paneID,
        pluginID: toPlainString(context.pluginID) || pluginID,
        resolveURI,
      });
    };
  }

  function unregisterPreferencePaneLoadHandler(paneID) {
    if (!paneID) {
      return false;
    }
    const host = getPreferencePaneLoadHost();
    return Boolean(host[PREFERENCE_PANE_LOAD_API_KEY]?.unregister?.({
      paneID,
      pluginID,
    }));
  }

  /**
   * 注册偏好设置面板
   * @param {Object} paneOptions - 面板配置
   * @param {string} paneOptions.id - 面板唯一 ID（可选，自动生成）
   * @param {string} paneOptions.src - XHTML 片段 URI（必需）
   * @param {string} [paneOptions.parent] - 父面板 ID（若提供，面板将隐藏于侧边栏）
   * @param {string} [paneOptions.label] - 侧边栏显示标签（若未提供，使用插件名称）
   * @param {string} [paneOptions.image] - 侧边栏图标 URI（若未提供，使用插件图标）
   * @param {string[]} [paneOptions.scripts] - 要加载的脚本 URI 数组（legacy 兼容）
   * @param {string[]} [paneOptions.stylesheets] - 要加载的样式表 URI 数组
   * @param {string} [paneOptions.helpURL] - 帮助链接（若提供，显示帮助按钮）
   * @param {(context: {window: Window|null, paneID: string, pluginID: string, resolveURI: (uri: string) => string}) => void|Promise<void>} [paneOptions.onPreferenceLoad]
   *   面板内容 load 后的模板级回调；优先于 legacy scripts
   * @returns {Promise<string|null>} 面板 ID，失败返回 null
   */
  async function registerPane(paneOptions) {
    if (!isAvailable()) {
      error("preferencePanes.registerPane.notAvailable", {});
      return null;
    }

    const {
      id: customId,
      src,
      parent,
      label,
      image,
      scripts = [],
      stylesheets = [],
      helpURL,
      onPreferenceLoad,
    } = paneOptions;

    if (!src) {
      error("preferencePanes.registerPane.noSrc", {});
      return null;
    }

    try {
      // 解析相对路径
      const resolvedSrc = resolveURI(src);
      const useOnPreferenceLoad = typeof onPreferenceLoad === "function";
      const resolvedScripts = useOnPreferenceLoad
        ? [resolveURI(PREFERENCE_PANE_LOAD_BRIDGE_SCRIPT)]
        : scripts.map(resolveURI);
      const resolvedStylesheets = stylesheets.map(resolveURI);
      const resolvedImage = image ? resolveURI(image) : undefined;

      if (useOnPreferenceLoad && scripts.length > 0) {
        warn("preferencePanes.registerPane.scriptsIgnoredForOnPreferenceLoad", {
          id: customId || null,
          scriptCount: scripts.length,
        });
      }

      // 构建注册选项
      const registerOptions = {
        pluginID,
        src: resolvedSrc,
        id: customId,
        parent,
        label,
        image: resolvedImage,
        scripts: resolvedScripts,
        stylesheets: resolvedStylesheets,
        helpURL,
      };

      // 移除 undefined 值
      Object.keys(registerOptions).forEach(key => {
        if (registerOptions[key] === undefined) {
          delete registerOptions[key];
        }
      });

      debug("preferencePanes.registerPane.registering", {
        id: customId,
        src: resolvedSrc,
      });

      const paneId = await Zotero.PreferencePanes.register(registerOptions);

      if (useOnPreferenceLoad) {
        registerPreferencePaneLoadHandler(paneId, onPreferenceLoad);
      }

      // 追踪注册
      registeredPanes.set(paneId, {
        id: paneId,
        src: resolvedSrc,
        hasOnPreferenceLoad: useOnPreferenceLoad,
      });

      // 注册清理函数
      if (lifecycle && typeof lifecycle.trackCleanup === "function") {
        lifecycle.trackCleanup(() => {
          unregisterPane(paneId);
        });
      }

      debug("preferencePanes.registerPane.registered", { paneId });
      return paneId;
    } catch (e) {
      error("preferencePanes.registerPane.failed", {
        error: e.message,
        src,
      });
      return null;
    }
  }

  /**
   * 取消注册偏好设置面板
   * @param {string} paneId - 面板 ID
   * @returns {boolean} 是否成功
   */
  function unregisterPane(paneId) {
    if (!isAvailable()) {
      return false;
    }

    if (!paneId || !registeredPanes.has(paneId)) {
      debug("preferencePanes.unregisterPane.notFound", { paneId });
      return false;
    }

    try {
      unregisterPreferencePaneLoadHandler(paneId);
      Zotero.PreferencePanes.unregister(paneId);
      registeredPanes.delete(paneId);
      debug("preferencePanes.unregisterPane.unregistered", { paneId });
      return true;
    } catch (e) {
      error("preferencePanes.unregisterPane.failed", {
        error: e.message,
        paneId,
      });
      return false;
    }
  }

  /**
   * 取消所有已注册的面板
   */
  function unregisterAll() {
    for (const paneId of registeredPanes.keys()) {
      unregisterPane(paneId);
    }
  }

  /**
   * 获取已注册面板数量
   * @returns {number}
   */
  function getPaneCount() {
    return registeredPanes.size;
  }

  /**
   * 检查面板是否已注册
   * @param {string} paneId - 面板 ID
   * @returns {boolean}
   */
  function hasPane(paneId) {
    return registeredPanes.has(paneId);
  }

  /**
   * 获取所有已注册面板 ID
   * @returns {string[]}
   */
  function getAllPanes() {
    return Array.from(registeredPanes.keys());
  }

  // 公开 API
  return {
    isAvailable,
    registerPane,
    unregisterPane,
    unregisterAll,
    getPaneCount,
    hasPane,
    getAllPanes,
    resolveURI,
  };
}
