/**
 * PreferencePanes 封装模块
 * 提供偏好设置面板注册和管理功能
 */

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

  /**
   * 注册偏好设置面板
   * @param {Object} paneOptions - 面板配置
   * @param {string} paneOptions.id - 面板唯一 ID（可选，自动生成）
   * @param {string} paneOptions.src - XHTML 片段 URI（必需）
   * @param {string} [paneOptions.parent] - 父面板 ID（若提供，面板将隐藏于侧边栏）
   * @param {string} [paneOptions.label] - 侧边栏显示标签（若未提供，使用插件名称）
   * @param {string} [paneOptions.image] - 侧边栏图标 URI（若未提供，使用插件图标）
   * @param {string[]} [paneOptions.scripts] - 要加载的脚本 URI 数组
   * @param {string[]} [paneOptions.stylesheets] - 要加载的样式表 URI 数组
   * @param {string} [paneOptions.helpURL] - 帮助链接（若提供，显示帮助按钮）
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
    } = paneOptions;

    if (!src) {
      error("preferencePanes.registerPane.noSrc", {});
      return null;
    }

    try {
      // 解析相对路径
      const resolvedSrc = resolveURI(src);
      const resolvedScripts = scripts.map(resolveURI);
      const resolvedStylesheets = stylesheets.map(resolveURI);
      const resolvedImage = image ? resolveURI(image) : undefined;

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

      // 追踪注册
      registeredPanes.set(paneId, {
        id: paneId,
        src: resolvedSrc,
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
