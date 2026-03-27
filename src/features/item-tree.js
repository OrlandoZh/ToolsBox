/**
 * ItemTree 管理模块
 * 封装 Zotero.ItemTreeManager API，支持自定义列显示
 */

/**
 * 创建 ItemTree 管理器
 * @param {Object} options - 配置选项
 * @param {Object} options.logger - 日志记录器
 * @param {Object} options.lifecycle - 生命周期管理器
 * @param {Object} options.i18n - 国际化实例
 * @param {string} options.pluginID - 插件 ID
 * @param {Object} [options.zotero] - Zotero 全局对象（用于测试注入）
 * @returns {Object} ItemTree 管理器实例
 */
export function createItemTree(options) {
  const { logger, lifecycle, i18n, pluginID, zotero } = options;

  // 获取 Zotero 全局对象
  const Zotero = zotero || (typeof globalThis !== "undefined" && globalThis.Zotero);

  // 注册追踪
  const registeredColumns = new Map();

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
   * 检查 ItemTreeManager API 是否可用
   * @returns {boolean}
   */
  function isAvailable() {
    return Boolean(Zotero && Zotero.ItemTreeManager);
  }

  /**
   * 注册自定义列
   * @param {Object} columnOptions - 列配置
   * @param {string} columnOptions.dataKey - 数据键（唯一标识）
   * @param {string} [columnOptions.pluginID] - 插件 ID（默认使用实例配置）
   * @param {string} columnOptions.label - 列标题
   * @param {string} [columnOptions.l10nID] - 本地化 ID（与 label 二选一）
   * @param {Function} columnOptions.dataProvider - 数据提供函数 (item, dataKey) => value
   * @param {Function} [columnOptions.renderCell] - 自定义单元格渲染
   * @param {string} [columnOptions.iconPath] - 列图标路径
   * @param {number} [columnOptions.width] - 默认列宽
   * @param {boolean} [columnOptions.fixedWidth] - 是否固定宽度
   * @param {boolean} [columnOptions.sortable] - 是否可排序
   * @param {boolean} [columnOptions.hidden] - 默认是否隐藏
   * @param {Array<string>} [columnOptions.enabledTreeIDs] - 启用的树 ID 列表
   * @param {string} [columnOptions.position] - 插入位置
   * @returns {string|null} dataKey，失败返回 null
   */
  function registerColumn(columnOptions) {
    if (!isAvailable()) {
      error("itemTree.registerColumn.notAvailable", {});
      return null;
    }

    const {
      dataKey,
      pluginID: customPluginID,
      label,
      l10nID,
      dataProvider,
      renderCell,
      iconPath,
      width,
      fixedWidth,
      sortable,
      hidden,
      enabledTreeIDs,
      position,
    } = columnOptions;

    if (!dataKey) {
      error("itemTree.registerColumn.noDataKey", {});
      return null;
    }

    if (typeof dataProvider !== "function") {
      error("itemTree.registerColumn.noDataProvider", {});
      return null;
    }

    const effectivePluginID = customPluginID || pluginID;

    try {
      // 构建注册配置
      const config = {
        dataKey,
        pluginID: effectivePluginID,
      };

      // 标签配置
      if (l10nID) {
        config.l10nID = l10nID;
      } else if (label) {
        config.label = label;
      } else {
        config.label = dataKey;
      }

      // 数据提供函数
      config.dataProvider = dataProvider;

      // 自定义渲染
      if (typeof renderCell === "function") {
        config.renderCell = renderCell;
      }

      // 图标
      if (iconPath) {
        config.iconPath = iconPath;
      }

      // 宽度
      if (typeof width === "number") {
        config.width = String(width);
      }
      else if (typeof width === "string") {
        config.width = width;
      }

      // 固定宽度
      if (typeof fixedWidth === "boolean") {
        config.fixedWidth = fixedWidth;
      }

      // 可排序
      if (typeof sortable === "boolean") {
        config.sortable = sortable;
      }

      // 默认隐藏
      if (typeof hidden === "boolean") {
        config.hidden = hidden;
      }

      // 启用的树
      if (Array.isArray(enabledTreeIDs)) {
        config.enabledTreeIDs = enabledTreeIDs;
      }

      // 位置
      if (position) {
        config.position = position;
      }

      // 注册
      const registeredDataKey = typeof Zotero.ItemTreeManager.registerColumn === "function"
        ? Zotero.ItemTreeManager.registerColumn(config)
        : Zotero.ItemTreeManager.registerColumns(config)?.[0];

      if (!registeredDataKey) {
        error("itemTree.registerColumn.rejected", { dataKey });
        return null;
      }

      // 追踪注册
      registeredColumns.set(dataKey, {
        config,
        registeredDataKey,
      });

      debug("itemTree.registerColumn.created", { dataKey, registeredDataKey });

      return registeredDataKey;
    } catch (err) {
      error("itemTree.registerColumn.failed", {
        dataKey,
        message: String(err?.message || err),
      });
      return null;
    }
  }

  /**
   * 注销列
   * @param {string} dataKey - 数据键
   * @returns {boolean} 是否成功
   */
  function unregisterColumn(dataKey) {
    if (!isAvailable()) {
      return false;
    }

    const sourceKey = registeredColumns.has(dataKey)
      ? dataKey
      : Array.from(registeredColumns.entries()).find(([, value]) => value.registeredDataKey === dataKey)?.[0];

    if (!sourceKey) {
      return false;
    }

    try {
      const registration = registeredColumns.get(sourceKey);
      Zotero.ItemTreeManager.unregisterColumn(registration.registeredDataKey);
      registeredColumns.delete(sourceKey);

      debug("itemTree.unregisterColumn.removed", {
        dataKey,
        registeredDataKey: registration.registeredDataKey,
      });
      return true;
    } catch (err) {
      error("itemTree.unregisterColumn.failed", {
        dataKey,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 注销所有注册
   */
  function unregisterAll() {
    const count = registeredColumns.size;

    registeredColumns.forEach((_, dataKey) => {
      unregisterColumn(dataKey);
    });

    debug("itemTree.unregisterAll", { count });
  }

  /**
   * 获取注册的列数量
   * @returns {number}
   */
  function getColumnCount() {
    return registeredColumns.size;
  }

  /**
   * 检查列是否已注册
   * @param {string} dataKey - 数据键
   * @returns {boolean}
   */
  function hasColumn(dataKey) {
    return registeredColumns.has(dataKey)
      || Array.from(registeredColumns.values()).some((value) => value.registeredDataKey === dataKey);
  }

  /**
   * 创建简单的数据提供函数
   * @param {string} field - Zotero 字段名
   * @returns {Function} 数据提供函数
   */
  function createFieldDataProvider(field) {
    return (item) => {
      if (!item) {
        return "";
      }
      const value = item.getField(field);
      return value || "";
    };
  }

  /**
   * 创建带格式化的数据提供函数
   * @param {Function} extractor - 提取函数
   * @param {Function} formatter - 格式化函数
   * @returns {Function} 数据提供函数
   */
  function createFormattedDataProvider(extractor, formatter) {
    return (item) => {
      if (!item) {
        return "";
      }
      const value = extractor(item);
      return formatter(value);
    };
  }

  /**
   * 创建默认的单元格渲染函数
   * @param {Object} [styleOptions] - 样式选项
   * @param {string} [styleOptions.color] - 文字颜色
   * @param {string} [styleOptions.fontWeight] - 字重
   * @param {string} [styleOptions.textAlign] - 对齐方式
   * @returns {Function} 渲染函数
   */
  function createDefaultCellRenderer(styleOptions = {}) {
    const { color, fontWeight, textAlign } = styleOptions;

    return (index, data, column, isFirstColumn, doc) => {
      const span = doc.createElement("span");
      span.className = `cell ${column.className || ""}`;
      span.textContent = String(data || "");

      if (color) {
        span.style.color = color;
      }
      if (fontWeight) {
        span.style.fontWeight = fontWeight;
      }
      if (textAlign) {
        span.style.textAlign = textAlign;
      }

      return span;
    };
  }

  /**
   * 创建条件样式的单元格渲染函数
   * @param {Function} conditionFn - 条件函数 (data) => boolean
   * @param {Object} trueStyle - 条件为真时的样式
   * @param {Object} falseStyle - 条件为假时的样式
   * @returns {Function} 渲染函数
   */
  function createConditionalCellRenderer(conditionFn, trueStyle, falseStyle) {
    return (index, data, column, isFirstColumn, doc) => {
      const span = doc.createElement("span");
      span.className = `cell ${column.className || ""}`;
      span.textContent = String(data || "");

      const style = conditionFn(data) ? trueStyle : falseStyle;
      Object.entries(style).forEach(([key, value]) => {
        span.style[key] = value;
      });

      return span;
    };
  }

  // 如果提供了 lifecycle，注册自动清理
  if (lifecycle && typeof lifecycle.trackCleanup === "function") {
    lifecycle.trackCleanup(unregisterAll);
  }

  return {
    // 状态检查
    isAvailable,

    // 列操作
    registerColumn,
    unregisterColumn,
    hasColumn,
    getColumnCount,

    // 批量操作
    unregisterAll,

    // 工厂函数
    createFieldDataProvider,
    createFormattedDataProvider,
    createDefaultCellRenderer,
    createConditionalCellRenderer,
  };
}
