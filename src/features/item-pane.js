/**
 * ItemPane 管理模块
 * 封装 Zotero.ItemPaneManager API，支持自定义右侧面板 Section 和 InfoRow
 */

/**
 * 创建 ItemPane 管理器
 * @param {Object} options - 配置选项
 * @param {Object} options.logger - 日志记录器
 * @param {Object} options.lifecycle - 生命周期管理器
 * @param {Object} options.uiFactory - UI 工厂实例
 * @param {Object} options.i18n - 国际化实例
 * @param {string} options.pluginID - 插件 ID
 * @param {Object} [options.zotero] - Zotero 全局对象（用于测试注入）
 * @returns {Object} ItemPane 管理器实例
 */
export function createItemPane(options) {
  const { logger, lifecycle, uiFactory, i18n, pluginID, zotero } = options;

  // 获取 Zotero 全局对象
  const Zotero = zotero || (typeof globalThis !== "undefined" && globalThis.Zotero);

  // 注册追踪
  const registeredSections = new Map();
  const registeredInfoRows = new Map();

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
   * 检查 ItemPaneManager API 是否可用
   * @returns {boolean}
   */
  function isAvailable() {
    return Boolean(Zotero && Zotero.ItemPaneManager);
  }

  /**
   * 注册自定义面板 Section
   * @param {Object} sectionOptions - Section 配置
   * @param {string} sectionOptions.paneID - 面板唯一 ID
   * @param {string} [sectionOptions.pluginID] - 插件 ID（默认使用实例配置）
   * @param {Object} sectionOptions.header - 头部配置
   * @param {string} sectionOptions.header.l10nID - 本地化 ID
   * @param {string} [sectionOptions.header.icon] - 图标路径
   * @param {Object} [sectionOptions.sidenav] - 侧边栏配置
   * @param {string} [sectionOptions.sidenav.l10nID] - 本地化 ID
   * @param {string} [sectionOptions.sidenav.icon] - 图标路径
   * @param {string} [sectionOptions.bodyXHTML] - Body XHTML 内容
   * @param {Function} [sectionOptions.onInit] - 初始化回调
   * @param {Function} [sectionOptions.onDestroy] - 销毁回调
   * @param {Function} [sectionOptions.onItemChange] - 条目变化回调
   * @param {Function} sectionOptions.onRender - 同步渲染回调；必须在这里完成初始 DOM 构建
   * @param {Function} [sectionOptions.onAsyncRender] - 异步渲染回调；只用于加载耗时数据或补充异步内容
   * @param {Function} [sectionOptions.onToggle] - 展开/折叠回调
   * @param {Array} [sectionOptions.sectionButtons] - 头部按钮配置
   * @returns {string|null} Zotero 返回的 registered paneID；应保存该值并在注销时传给 unregisterSection()
   */
  function registerSection(sectionOptions) {
    if (!isAvailable()) {
      error("itemPane.registerSection.notAvailable", {});
      return null;
    }

    const {
      paneID,
      pluginID: customPluginID,
      header = {},
      sidenav = {},
      bodyXHTML,
      onInit,
      onDestroy,
      onItemChange,
      onRender,
      onAsyncRender,
      onToggle,
      sectionButtons = [],
    } = sectionOptions;

    if (!paneID) {
      error("itemPane.registerSection.noPaneID", {});
      return null;
    }

    if (typeof onRender !== "function") {
      error("itemPane.registerSection.noOnRender", { paneID });
      return null;
    }

    const effectivePluginID = customPluginID || pluginID;

    try {
      // 构建注册配置
      const config = {
        paneID,
        pluginID: effectivePluginID,
      };

      // 头部配置
      if (header.l10nID) {
        config.header = {};
        config.header.l10nID = header.l10nID;
        if (header.icon) {
          config.header.icon = header.icon;
        }
      }

      // 侧边栏配置
      if (sidenav.l10nID || sidenav.icon) {
        config.sidenav = {};
        if (sidenav.l10nID) {
          config.sidenav.l10nID = sidenav.l10nID;
        }
        if (sidenav.icon) {
          config.sidenav.icon = sidenav.icon;
        }
      }

      // Body XHTML
      if (bodyXHTML) {
        config.bodyXHTML = bodyXHTML;
      }

      // 生命周期回调
      if (typeof onInit === "function") {
        config.onInit = onInit;
      }

      if (typeof onDestroy === "function") {
        config.onDestroy = onDestroy;
      }

      if (typeof onItemChange === "function") {
        config.onItemChange = onItemChange;
      }

      config.onRender = onRender;

      if (typeof onAsyncRender === "function") {
        config.onAsyncRender = onAsyncRender;
      }

      if (typeof onToggle === "function") {
        config.onToggle = onToggle;
      }

      // 头部按钮
      if (sectionButtons.length > 0) {
        config.sectionButtons = sectionButtons;
      }

      // 注册
      const registeredPaneID = Zotero.ItemPaneManager.registerSection(config);
      if (!registeredPaneID) {
        error("itemPane.registerSection.rejected", { paneID });
        return null;
      }

      // 追踪注册
      registeredSections.set(paneID, {
        config,
        registeredPaneID,
      });

      debug("itemPane.registerSection.created", { paneID, registeredPaneID });

      return registeredPaneID;
    } catch (err) {
      error("itemPane.registerSection.failed", {
        paneID,
        message: String(err?.message || err),
      });
      return null;
    }
  }

  /**
   * 注册自定义 Info 行
   * @param {Object} rowOptions - InfoRow 配置
   * @param {string} rowOptions.rowID - 行唯一 ID
   * @param {string} [rowOptions.pluginID] - 插件 ID
   * @param {Object} rowOptions.label - 标签配置
   * @param {string} rowOptions.label.l10nID - 本地化 ID
   * @param {string} [rowOptions.position] - 位置：'start' | 'afterCreators' | 'end'
   * @param {boolean} [rowOptions.multiline] - 是否多行显示
   * @param {boolean} [rowOptions.nowrap] - 是否不换行
   * @param {boolean} [rowOptions.editable] - 是否可编辑
   * @param {Function} rowOptions.onGetData - 获取数据回调
   * @param {Function} [rowOptions.onSetData] - 设置数据回调
   * @param {Function} [rowOptions.onItemChange] - 条目变化回调
   * @returns {string|null} rowID，失败返回 null
   */
  function registerInfoRow(rowOptions) {
    if (!isAvailable()) {
      error("itemPane.registerInfoRow.notAvailable", {});
      return null;
    }

    const {
      rowID,
      pluginID: customPluginID,
      label = {},
      position,
      multiline,
      nowrap,
      editable = false,
      onGetData,
      onSetData,
      onItemChange,
    } = rowOptions;

    if (!rowID) {
      error("itemPane.registerInfoRow.noRowID", {});
      return null;
    }

    if (typeof onGetData !== "function") {
      error("itemPane.registerInfoRow.noOnGetData", {});
      return null;
    }

    const effectivePluginID = customPluginID || pluginID;

    try {
      // 构建注册配置
      const config = {
        rowID,
        pluginID: effectivePluginID,
        editable,
      };

      // 标签配置
      if (!label.l10nID) {
        error("itemPane.registerInfoRow.noLabelL10nID", { rowID });
        return null;
      }
      config.label = {
        l10nID: label.l10nID,
      };

      // 位置
      if (position) {
        config.position = position;
      }

      // 多行设置
      if (typeof multiline === "boolean") {
        config.multiline = multiline;
      }

      // 不换行设置
      if (typeof nowrap === "boolean") {
        config.nowrap = nowrap;
      }

      // 数据回调
      config.onGetData = onGetData;

      if (typeof onSetData === "function") {
        config.onSetData = onSetData;
      }

      if (typeof onItemChange === "function") {
        config.onItemChange = onItemChange;
      }

      // 注册
      const registeredRowID = Zotero.ItemPaneManager.registerInfoRow(config);
      if (!registeredRowID) {
        error("itemPane.registerInfoRow.rejected", { rowID });
        return null;
      }

      // 追踪注册
      registeredInfoRows.set(rowID, {
        config,
        registeredRowID,
      });

      debug("itemPane.registerInfoRow.created", { rowID, registeredRowID });

      return registeredRowID;
    } catch (err) {
      error("itemPane.registerInfoRow.failed", {
        rowID,
        message: String(err?.message || err),
      });
      return null;
    }
  }

  /**
   * 注销 Section
   * @param {string} paneID - 面板 ID
   * @returns {boolean} 是否成功
   */
  function unregisterSection(paneID) {
    if (!isAvailable()) {
      return false;
    }

    const sourcePaneID = registeredSections.has(paneID)
      ? paneID
      : Array.from(registeredSections.entries()).find(([, value]) => value.registeredPaneID === paneID)?.[0];

    if (!sourcePaneID) {
      return false;
    }

    try {
      const registration = registeredSections.get(sourcePaneID);
      Zotero.ItemPaneManager.unregisterSection(registration.registeredPaneID);
      registeredSections.delete(sourcePaneID);

      debug("itemPane.unregisterSection.removed", {
        paneID,
        registeredPaneID: registration.registeredPaneID,
      });
      return true;
    } catch (err) {
      error("itemPane.unregisterSection.failed", {
        paneID,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 注销 InfoRow
   * @param {string} rowID - 行 ID
   * @returns {boolean} 是否成功
   */
  function unregisterInfoRow(rowID) {
    if (!isAvailable()) {
      return false;
    }

    const sourceRowID = registeredInfoRows.has(rowID)
      ? rowID
      : Array.from(registeredInfoRows.entries()).find(([, value]) => value.registeredRowID === rowID)?.[0];

    if (!sourceRowID) {
      return false;
    }

    try {
      const registration = registeredInfoRows.get(sourceRowID);
      Zotero.ItemPaneManager.unregisterInfoRow(registration.registeredRowID);
      registeredInfoRows.delete(sourceRowID);

      debug("itemPane.unregisterInfoRow.removed", {
        rowID,
        registeredRowID: registration.registeredRowID,
      });
      return true;
    } catch (err) {
      error("itemPane.unregisterInfoRow.failed", {
        rowID,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 刷新 InfoRow（重新渲染）
   * @param {string} rowID - 行 ID
   * @returns {boolean} 是否成功
   */
  function refreshInfoRow(rowID) {
    if (!isAvailable()) {
      return false;
    }

    if (!registeredInfoRows.has(rowID)) {
      return false;
    }

    try {
      if (typeof Zotero.ItemPaneManager.refreshInfoRow === "function") {
        Zotero.ItemPaneManager.refreshInfoRow(rowID);
        debug("itemPane.refreshInfoRow.refreshed", { rowID });
        return true;
      }
      return false;
    } catch (err) {
      error("itemPane.refreshInfoRow.failed", {
        rowID,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 注销所有注册
   */
  function unregisterAll() {
    const sectionCount = registeredSections.size;
    const rowCount = registeredInfoRows.size;

    registeredSections.forEach((_, paneID) => {
      unregisterSection(paneID);
    });

    registeredInfoRows.forEach((_, rowID) => {
      unregisterInfoRow(rowID);
    });

    debug("itemPane.unregisterAll", { sectionCount, rowCount });
  }

  /**
   * 获取注册的 Section 数量
   * @returns {number}
   */
  function getSectionCount() {
    return registeredSections.size;
  }

  /**
   * 检查 Section 是否已注册
   * @param {string} paneID - 面板 ID
   * @returns {boolean}
   */
  function hasSection(paneID) {
    return registeredSections.has(paneID)
      || Array.from(registeredSections.values()).some((value) => value.registeredPaneID === paneID);
  }

  /**
   * 将声明态 paneID 解析为宿主返回的已注册 paneID
   * @param {string} paneID - 声明态或已注册的 paneID
   * @returns {string|null}
   */
  function resolveSectionPaneID(paneID) {
    if (!paneID) {
      return null;
    }

    if (registeredSections.has(paneID)) {
      return registeredSections.get(paneID)?.registeredPaneID || paneID;
    }

    const registration = Array.from(registeredSections.values())
      .find((value) => value?.registeredPaneID === paneID);
    return registration?.registeredPaneID || null;
  }

  /**
   * 获取注册的 InfoRow 数量
   * @returns {number}
   */
  function getInfoRowCount() {
    return registeredInfoRows.size;
  }

  /**
   * 获取当前注册快照
   * @returns {{sections: Array<Object>, infoRows: Array<Object>}}
   */
  function getRegistrationSnapshot() {
    return {
      sections: Array.from(registeredSections.entries()).map(([paneID, registration]) => ({
        paneID,
        registeredPaneID: registration?.registeredPaneID || null,
        headerL10nID: registration?.config?.header?.l10nID || null,
        sidenavL10nID: registration?.config?.sidenav?.l10nID || null,
      })),
      infoRows: Array.from(registeredInfoRows.entries()).map(([rowID, registration]) => ({
        rowID,
        registeredRowID: registration?.registeredRowID || null,
        labelL10nID: registration?.config?.label?.l10nID || null,
      })),
    };
  }

  /**
   * 检查 InfoRow 是否已注册
   * @param {string} rowID - 行 ID
   * @returns {boolean}
   */
  function hasInfoRow(rowID) {
    return registeredInfoRows.has(rowID)
      || Array.from(registeredInfoRows.values()).some((value) => value.registeredRowID === rowID);
  }

  // ==================== 便捷工厂方法 ====================

  /**
   * 创建简单文本 Section
   * @param {Object} options - 配置选项
   * @param {string} options.paneID - 面板 ID
   * @param {string} options.headerL10nID - 面板头部本地化 ID
   * @param {string} [options.sidenavL10nID] - 侧边栏本地化 ID
   * @param {string} [options.icon] - 图标路径
   * @param {Function} options.getContent - 获取内容的回调 (item) => string
   * @param {Function} [options.isEnabled] - 是否启用的回调 (item) => boolean
   * @returns {string|null} paneID
   */
  function createSimpleSection(options) {
    const {
      paneID,
      headerL10nID,
      sidenavL10nID = headerL10nID,
      icon,
      getContent,
      isEnabled,
    } = options;

    if (!headerL10nID || !sidenavL10nID) {
      error("itemPane.createSimpleSection.noL10nID", { paneID });
      return null;
    }

    return registerSection({
      paneID,
      header: { l10nID: headerL10nID, icon },
      sidenav: { l10nID: sidenavL10nID, icon },
      onItemChange: ({ item, setEnabled }) => {
        if (typeof isEnabled === "function") {
          setEnabled(isEnabled(item));
        }
      },
      onRender: ({ doc, body, item }) => {
        const content = typeof getContent === "function" ? getContent(item) : "";
        const div = doc.createElement("div");
        div.textContent = content;
        body.appendChild(div);
      },
    });
  }

  /**
   * 创建字段 InfoRow
   * @param {Object} options - 配置选项
   * @param {string} options.rowID - 行 ID
   * @param {string} options.labelL10nID - 行标签本地化 ID
   * @param {string} options.field - 字段名
   * @param {boolean} [options.editable=true] - 是否可编辑
   * @param {Function} [options.formatValue] - 格式化值的回调 (value) => string
   * @param {Function} [options.isEnabled] - 是否启用的回调 (item) => boolean
   * @returns {string|null} rowID
   */
  function createFieldInfoRow(options) {
    const {
      rowID,
      labelL10nID,
      field,
      editable = true,
      formatValue,
      isEnabled,
    } = options;

    if (!labelL10nID) {
      error("itemPane.createFieldInfoRow.noLabelL10nID", { rowID });
      return null;
    }

    return registerInfoRow({
      rowID,
      label: { l10nID: labelL10nID },
      editable,
      onGetData: ({ item }) => {
        if (!item) return "";
        const value = item.getField(field);
        return typeof formatValue === "function" ? formatValue(value) : String(value || "");
      },
      onSetData: editable
        ? ({ item, value }) => {
            if (item) {
              item.setField(field, value);
              item.saveTx();
            }
          }
        : undefined,
      onItemChange: ({ item, setEnabled }) => {
        if (typeof isEnabled === "function") {
          setEnabled(isEnabled(item));
        }
      },
    });
  }

  /**
   * 创建条件性 InfoRow
   * @param {Object} options - 配置选项
   * @param {string} options.rowID - 行 ID
   * @param {string} options.labelL10nID - 行标签本地化 ID
   * @param {Function} options.getData - 获取数据的回调 (item) => string
   * @param {Function} [options.setData] - 设置数据的回调 (item, value) => void
   * @param {Function} options.condition - 显示条件的回调 (item) => boolean
   * @param {boolean} [options.editable=false] - 是否可编辑
   * @returns {string|null} rowID
   */
  function createConditionalInfoRow(options) {
    const {
      rowID,
      labelL10nID,
      getData,
      setData,
      condition,
      editable = false,
    } = options;

    if (!labelL10nID) {
      error("itemPane.createConditionalInfoRow.noLabelL10nID", { rowID });
      return null;
    }

    return registerInfoRow({
      rowID,
      label: { l10nID: labelL10nID },
      editable,
      onGetData: ({ item }) => {
        if (!item) return "";
        return typeof getData === "function" ? getData(item) : "";
      },
      onSetData: typeof setData === "function" ? ({ item, value }) => setData(item, value) : undefined,
      onItemChange: ({ item, setEnabled }) => {
        const visible = typeof condition === "function" ? condition(item) : true;
        setEnabled(visible);
      },
    });
  }

  // 如果提供了 lifecycle，注册自动清理
  if (lifecycle && typeof lifecycle.trackCleanup === "function") {
    lifecycle.trackCleanup(unregisterAll);
  }

  return {
    // 状态检查
    isAvailable,

    // Section 操作
    registerSection,
    unregisterSection,
    hasSection,
    resolveSectionPaneID,
    getSectionCount,

    // InfoRow 操作
    registerInfoRow,
    unregisterInfoRow,
    hasInfoRow,
    getInfoRowCount,
    getRegistrationSnapshot,
    refreshInfoRow,

    // 便捷工厂方法
    createSimpleSection,
    createFieldInfoRow,
    createConditionalInfoRow,

    // 批量操作
    unregisterAll,
  };
}
