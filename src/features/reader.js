/**
 * Reader 工具模块
 * 封装 Zotero.Reader 和 Zotero.Annotations API，提供 PDF/EPUB/快照阅读器和注解交互功能
 */

/**
 * 阅读器类型常量
 */
export const READER_TYPES = {
  PDF: "pdf",
  EPUB: "epub",
  SNAPSHOT: "snapshot",
};

/**
 * 注解类型常量
 */
export const ANNOTATION_TYPES = {
  HIGHLIGHT: "highlight",
  NOTE: "note",
  IMAGE: "image",
  INK: "ink",
  TEXT: "text",
};

/**
 * Reader 官方事件类型常量
 */
export const READER_EVENT_TYPES = {
  RENDER_TEXT_SELECTION_POPUP: "renderTextSelectionPopup",
  RENDER_SIDEBAR_ANNOTATION_HEADER: "renderSidebarAnnotationHeader",
  RENDER_TOOLBAR: "renderToolbar",
  CREATE_COLOR_CONTEXT_MENU: "createColorContextMenu",
  CREATE_VIEW_CONTEXT_MENU: "createViewContextMenu",
  CREATE_ANNOTATION_CONTEXT_MENU: "createAnnotationContextMenu",
  CREATE_THUMBNAIL_CONTEXT_MENU: "createThumbnailContextMenu",
  CREATE_SELECTOR_CONTEXT_MENU: "createSelectorContextMenu",
};

export const READER_EVENT_KNOWN_TYPES = Object.freeze([
  READER_EVENT_TYPES.RENDER_TEXT_SELECTION_POPUP,
  READER_EVENT_TYPES.RENDER_SIDEBAR_ANNOTATION_HEADER,
  READER_EVENT_TYPES.RENDER_TOOLBAR,
  READER_EVENT_TYPES.CREATE_COLOR_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_VIEW_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_ANNOTATION_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_THUMBNAIL_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_SELECTOR_CONTEXT_MENU,
]);

export const READER_EVENT_PROBE_COMPATIBLE_TYPES = Object.freeze([
  READER_EVENT_TYPES.RENDER_TEXT_SELECTION_POPUP,
  READER_EVENT_TYPES.RENDER_SIDEBAR_ANNOTATION_HEADER,
  READER_EVENT_TYPES.RENDER_TOOLBAR,
  READER_EVENT_TYPES.CREATE_COLOR_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_VIEW_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_ANNOTATION_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_THUMBNAIL_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_SELECTOR_CONTEXT_MENU,
]);

export const READER_EVENT_SYNTHETIC_FALLBACK_TYPES = Object.freeze([
  READER_EVENT_TYPES.RENDER_TEXT_SELECTION_POPUP,
  READER_EVENT_TYPES.RENDER_SIDEBAR_ANNOTATION_HEADER,
  READER_EVENT_TYPES.RENDER_TOOLBAR,
  READER_EVENT_TYPES.CREATE_COLOR_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_VIEW_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_ANNOTATION_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_THUMBNAIL_CONTEXT_MENU,
  READER_EVENT_TYPES.CREATE_SELECTOR_CONTEXT_MENU,
]);

const READER_EVENT_KNOWN_TYPE_SET = new Set(READER_EVENT_KNOWN_TYPES);
const READER_EVENT_SYNTHETIC_FALLBACK_TYPE_SET = new Set(READER_EVENT_SYNTHETIC_FALLBACK_TYPES);

/**
 * 创建 Reader 工具实例
 * @param {Object} options - 配置选项
 * @param {Object} [options.logger] - 日志记录器
 * @param {Object} [options.zotero] - Zotero 全局对象（用于测试注入）
 * @returns {Object} Reader 工具实例
 */
export function createReader(options = {}) {
  const {
    logger,
    zotero,
    lifecycle,
    pluginID = undefined,
  } = options;

  // 获取 Zotero 全局对象
  const Zotero = zotero || (typeof globalThis !== "undefined" && globalThis.Zotero);
  const registeredEventListeners = [];

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

  function resolveReader(target) {
    if (target === undefined || target === null) {
      return getActiveReader();
    }
    if (typeof target === "string") {
      return getByTabID(target);
    }
    if (typeof target === "number") {
      return getByItemID(target);
    }
    if (typeof target === "object") {
      return target;
    }
    return null;
  }

  function toPlainString(value) {
    return typeof value === "string" && value.trim()
      ? value
      : null;
  }

  function toPlainNumber(value) {
    return Number.isFinite(value) ? value : null;
  }

  function toPlainBoolean(value) {
    return typeof value === "boolean" ? value : null;
  }

  function toSafeInteger(value, fallback = 0) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(0, Math.trunc(value));
  }

  function clonePlainValue(value) {
    if (value === undefined) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(value));
  }

  function clonePlainValueSafe(value) {
    try {
      return clonePlainValue(value);
    }
    catch {
      return null;
    }
  }

  function toAnnotationString(value) {
    if (value === undefined || value === null) {
      return undefined;
    }
    return String(value);
  }

  function normalizeAnnotationRect(rect) {
    if (!Array.isArray(rect) || rect.length < 4) {
      return null;
    }

    const normalized = rect
      .slice(0, 4)
      .map((value) => Number(value));

    return normalized.every((value) => Number.isFinite(value))
      ? normalized
      : null;
  }

  function normalizeAnnotationPosition(annotationData) {
    const source = annotationData && typeof annotationData === "object"
      ? annotationData
      : {};
    const fallbackRect = [40, 40, 120, 80];
    const sourcePosition = source.position && typeof source.position === "object"
      ? clonePlainValue(source.position)
      : {};

    const pageIndex = toSafeInteger(
      sourcePosition.pageIndex ?? source.pageIndex,
      0,
    );
    const rectSource = Array.isArray(sourcePosition.rects)
      ? sourcePosition.rects
      : Array.isArray(source.rects)
        ? source.rects
        : [fallbackRect];
    const rects = rectSource
      .map((rect) => normalizeAnnotationRect(rect))
      .filter(Boolean);

    return {
      ...sourcePosition,
      pageIndex,
      rects: rects.length > 0 ? rects : [fallbackRect],
    };
  }

  function createFallbackAnnotationKey() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let output = "";
    for (let index = 0; index < 8; index += 1) {
      output += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return output;
  }

  function generateAnnotationKey() {
    try {
      const key = Zotero?.DataObjectUtilities?.generateKey?.();
      if (typeof key === "string" && key.trim()) {
        return key.trim();
      }
    }
    catch {}

    return createFallbackAnnotationKey();
  }

  function createDefaultAnnotationSortIndex(pageIndex) {
    const normalizedPageIndex = toSafeInteger(pageIndex, 0);
    const page = String(normalizedPageIndex + 1).padStart(5, "0");
    return `${page}|000000|00000`;
  }

  function normalizeAnnotationTags(tags) {
    if (!Array.isArray(tags)) {
      return undefined;
    }

    const normalized = tags
      .map((tag) => {
        if (typeof tag === "string" && tag.trim()) {
          return { name: tag.trim() };
        }
        if (tag && typeof tag === "object") {
          const name = toPlainString(tag.name) || toPlainString(tag.tag);
          return name ? { name } : null;
        }
        return null;
      })
      .filter(Boolean);

    return normalized.length > 0 ? normalized : undefined;
  }

  function normalizeAnnotationInput(annotationData) {
    const source = annotationData && typeof annotationData === "object"
      ? annotationData
      : {};
    const position = normalizeAnnotationPosition(source);
    const pageIndex = toSafeInteger(position.pageIndex, 0);
    const type = toPlainString(source.type) || ANNOTATION_TYPES.NOTE;
    const normalized = {
      key: toPlainString(source.key) || generateAnnotationKey(),
      type,
      color: toPlainString(source.color) || "#ffd400",
      pageLabel: toPlainString(source.pageLabel) || String(pageIndex + 1),
      sortIndex: toPlainString(source.sortIndex) || createDefaultAnnotationSortIndex(pageIndex),
      position,
    };

    const authorName = toAnnotationString(source.authorName);
    const comment = toAnnotationString(source.comment);
    const text = toAnnotationString(source.text);
    const tags = normalizeAnnotationTags(source.tags);

    if (authorName !== undefined) {
      normalized.authorName = authorName;
    }
    if (comment !== undefined) {
      normalized.comment = comment;
    }
    if (text !== undefined || ["highlight", "underline"].includes(type)) {
      normalized.text = text ?? "";
    }
    if (tags) {
      normalized.tags = tags;
    }
    if (source.relations && typeof source.relations === "object") {
      normalized.relations = clonePlainValue(source.relations);
    }
    if (source.isExternal !== undefined) {
      normalized.isExternal = Boolean(source.isExternal);
    }

    return normalized;
  }

  function isReaderActive(reader) {
    const activeReader = getActiveReader();
    if (!activeReader || !reader) {
      return false;
    }
    if (activeReader.tabID && reader.tabID) {
      return activeReader.tabID === reader.tabID;
    }
    if (Number.isFinite(activeReader.itemID) && Number.isFinite(reader.itemID)) {
      return activeReader.itemID === reader.itemID;
    }
    return false;
  }

  function normalizeWindowState(state) {
    if (!state || typeof state !== "object") {
      return null;
    }

    const location = state.location && typeof state.location === "object"
      ? {
        pageIndex: toPlainNumber(state.location.pageIndex),
        pageLabel: toPlainString(state.location.pageLabel),
      }
      : null;

    return {
      tabID: toPlainString(state.tabID),
      itemID: toPlainNumber(state.itemID),
      type: toPlainString(state.type)
        || (Number.isFinite(state.itemID) ? getReaderType(state.itemID) : null),
      title: toPlainString(state.title),
      selected: Boolean(state.selected === true || state.active === true),
      openInWindow: Boolean(
        state.openInWindow === true
        || state.inWindow === true
        || state.isWindow === true,
      ),
      location,
    };
  }

  function getAnnotationSnapshot(annotationOrID) {
    const annotation = typeof annotationOrID === "object"
      ? annotationOrID
      : getAnnotation(annotationOrID);
    if (!annotation || typeof annotation !== "object") {
      return null;
    }

    let editable = false;
    try {
      editable = typeof annotation.isEditable === "function"
        ? Boolean(annotation.isEditable())
        : false;
    }
    catch {}

    return {
      id: toPlainNumber(annotation.id),
      key: toPlainString(annotation.key),
      parentItemID: toPlainNumber(annotation.parentItemID)
        || toPlainNumber(annotation.parentID),
      type: toPlainString(annotation.annotationType)
        || toPlainString(annotation.itemType),
      text: toPlainString(annotation.annotationText),
      comment: toPlainString(annotation.annotationComment),
      color: toPlainString(annotation.annotationColor),
      pageLabel: toPlainString(annotation.annotationPageLabel),
      authorName: toPlainString(annotation.annotationAuthorName),
      editable,
    };
  }

  function readReaderProperty(readerInstance, property) {
    if (!readerInstance || !property) {
      return undefined;
    }
    try {
      return readerInstance[property];
    }
    catch {
      return undefined;
    }
  }

  function readReaderValue(readerInstance, properties = [], fallback) {
    for (const property of properties) {
      const value = readReaderProperty(readerInstance, property);
      if (value !== undefined) {
        return value;
      }
    }
    return fallback;
  }

  function readReaderString(readerInstance, properties = [], fallback = null) {
    return toPlainString(readReaderValue(readerInstance, properties, fallback));
  }

  function readReaderNumber(readerInstance, properties = [], fallback = null) {
    return toPlainNumber(readReaderValue(readerInstance, properties, fallback));
  }

  function readReaderBoolean(readerInstance, properties = [], fallback = null) {
    return toPlainBoolean(readReaderValue(readerInstance, properties, fallback));
  }

  function getReaderPref(key) {
    try {
      return Zotero?.Prefs?.get?.(key);
    }
    catch {
      return undefined;
    }
  }

  function getReaderInternalState(readerInstance) {
    if (!readerInstance || typeof readerInstance !== "object") {
      return null;
    }

    const state = readReaderValue(readerInstance, ["_state"], undefined)
      ?? readReaderValue(readReaderProperty(readerInstance, "_internalReader"), ["_state"], undefined);

    if (!state || typeof state !== "object") {
      return null;
    }

    return clonePlainValueSafe(state);
  }

  function getReaderUIStateSnapshot(target) {
    const resolvedReader = resolveReader(target);
    const summary = getReaderSummary(resolvedReader);
    if (!resolvedReader || !summary) {
      return null;
    }

    const internalState = getReaderInternalState(resolvedReader);
    const directSecondViewState = typeof resolvedReader.getSecondViewState === "function"
      ? clonePlainValueSafe(resolvedReader.getSecondViewState())
      : null;
    const primaryViewState = internalState?.primaryViewState && typeof internalState.primaryViewState === "object"
      ? clonePlainValueSafe(internalState.primaryViewState)
      : null;
    const secondViewState = directSecondViewState
      || (
        internalState?.secondaryViewState && typeof internalState.secondaryViewState === "object"
          ? clonePlainValueSafe(internalState.secondaryViewState)
          : null
      );
    const primaryViewStats = internalState?.primaryViewStats && typeof internalState.primaryViewStats === "object"
      ? clonePlainValueSafe(internalState.primaryViewStats)
      : null;

    return {
      sidebarOpen: readReaderBoolean(resolvedReader, ["sidebarOpen", "_sidebarOpen"]),
      sidebarWidth: readReaderNumber(resolvedReader, ["sidebarWidth", "_sidebarWidth"]),
      sidebarView: readReaderString(resolvedReader, ["sidebarView"])
        || toPlainString(getReaderPref("reader.lastSidebarTab")),
      textSelectionAnnotationMode: readReaderString(resolvedReader, ["textSelectionAnnotationMode"])
        || toPlainString(getReaderPref("reader.textSelectionAnnotationMode")),
      toolType: readReaderString(resolvedReader, ["toolType"]),
      flowMode: readReaderString(resolvedReader, ["flowMode"]),
      splitType: readReaderString(resolvedReader, ["splitType"]),
      scrollMode: readReaderNumber(
        resolvedReader,
        ["scrollMode"],
        primaryViewState?.scrollMode,
      ),
      spreadMode: readReaderNumber(
        resolvedReader,
        ["spreadMode"],
        primaryViewState?.spreadMode,
      ),
      scale: readReaderValue(resolvedReader, ["scale"], primaryViewState?.scale) ?? null,
      zoomAutoEnabled: readReaderBoolean(resolvedReader, ["zoomAutoEnabled"]),
      zoomPageWidthEnabled: readReaderBoolean(resolvedReader, ["zoomPageWidthEnabled"]),
      zoomPageHeightEnabled: readReaderBoolean(resolvedReader, ["zoomPageHeightEnabled"]),
      contextPaneOpen: readReaderBoolean(resolvedReader, ["contextPaneOpen"]),
      primaryViewState,
      primaryViewStats,
      secondViewState,
      hasSecondViewState: secondViewState !== null,
      navigation: {
        canNavigateBack: readReaderBoolean(resolvedReader, ["canNavigateBack"]),
        canNavigateForward: readReaderBoolean(resolvedReader, ["canNavigateForward"]),
        canNavigateToFirstPage: readReaderBoolean(resolvedReader, ["canNavigateToFirstPage"]),
        canNavigateToLastPage: readReaderBoolean(resolvedReader, ["canNavigateToLastPage"]),
        canNavigateToPreviousPage: readReaderBoolean(
          resolvedReader,
          ["canNavigateToPreviousPage"],
          primaryViewStats?.canNavigateToPreviousPage,
        ),
        canNavigateToNextPage: readReaderBoolean(
          resolvedReader,
          ["canNavigateToNextPage"],
          primaryViewStats?.canNavigateToNextPage,
        ),
      },
    };
  }

  function cloneEventListenerEntry(entry) {
    return {
      type: entry.type,
      pluginID: entry.pluginID || null,
    };
  }

  // ==================== 阅读器 API ====================

  /**
   * 检查 Reader API 是否可用
   * @returns {boolean}
   */
  function isAvailable() {
    return Boolean(Zotero && Zotero.Reader);
  }

  /**
   * 获取所有打开的阅读器实例
   * @returns {Array} Reader 实例数组
   */
  function getAllReaders() {
    if (!isAvailable()) {
      return [];
    }
    return Zotero.Reader._readers || [];
  }

  /**
   * 根据 Tab ID 获取阅读器实例
   * @param {string} tabID - Tab ID
   * @returns {Object|null} Reader 实例或 null
   */
  function getByTabID(tabID) {
    if (!isAvailable()) {
      return null;
    }
    try {
      return Zotero.Reader.getByTabID(tabID) || null;
    } catch (err) {
      error("reader.getByTabID.failed", { tabID, message: String(err?.message || err) });
      return null;
    }
  }

  /**
   * 根据条目 ID 获取阅读器实例
   * @param {number} itemID - 条目 ID
   * @returns {Object|null} Reader 实例或 null
   */
  function getByItemID(itemID) {
    if (!isAvailable()) {
      return null;
    }
    const readers = getAllReaders();
    return readers.find((r) => r.itemID === itemID) || null;
  }

  /**
   * 获取当前活动的阅读器
   * @returns {Object|null} 当前活动的 Reader 实例
   */
  function getActiveReader() {
    if (!isAvailable()) {
      return null;
    }
    try {
      const win = Zotero.getMainWindow();
      if (!win || !win.Zotero_Tabs) {
        return null;
      }
      const selectedTabID = win.Zotero_Tabs.selectedID;
      return getByTabID(selectedTabID);
    } catch (err) {
      error("reader.getActiveReader.failed", { message: String(err?.message || err) });
      return null;
    }
  }

  /**
   * 打开阅读器
   * @param {Object} openOptions - 打开选项
   * @param {number} openOptions.itemID - 条目 ID（必需）
   * @param {Object} [openOptions.location] - 导航位置
   * @param {string} [openOptions.title] - 标题
   * @param {number} [openOptions.tabIndex] - Tab 索引
   * @param {string} [openOptions.tabID] - Tab ID
   * @param {boolean} [openOptions.openInBackground] - 是否在后台打开
   * @param {boolean} [openOptions.openInWindow] - 是否在新窗口打开
   * @param {boolean} [openOptions.allowDuplicate] - 是否允许重复打开
   * @param {Object} [openOptions.secondViewState] - 第二视图状态
   * @returns {Promise<Object|null>} Reader 实例
   */
  async function openReader(openOptions) {
    if (!isAvailable()) {
      error("reader.openReader.notAvailable", {});
      return null;
    }

    const { itemID, location, ...restOptions } = openOptions;

    if (!itemID) {
      error("reader.openReader.noItemID", {});
      return null;
    }

    try {
      const reader = await Zotero.Reader.open(itemID, location, restOptions);
      debug("reader.openReader.success", { itemID });
      return reader;
    } catch (err) {
      error("reader.openReader.failed", {
        itemID,
        message: String(err?.message || err),
      });
      return null;
    }
  }

  /**
   * 通过 URI 打开阅读器
   * @param {string} itemURI - 条目 URI
   * @param {Object} [location] - 导航位置
   * @param {Object} [options] - 打开选项
   * @returns {Promise<Object|null>} Reader 实例
   */
  async function openByURI(itemURI, location, options = {}) {
    if (!isAvailable()) {
      error("reader.openByURI.notAvailable", {});
      return null;
    }

    if (!itemURI) {
      error("reader.openByURI.noURI", {});
      return null;
    }

    try {
      await Zotero.Reader.openURI(itemURI, location, options);
      debug("reader.openByURI.success", { itemURI });
      return true;
    } catch (err) {
      error("reader.openByURI.failed", {
        itemURI,
        message: String(err?.message || err),
      });
      return null;
    }
  }

  /**
   * 获取所有阅读器窗口状态
   * @returns {Array} 窗口状态数组
   */
  function getWindowStates() {
    if (!isAvailable()) {
      return [];
    }
    try {
      return Zotero.Reader.getWindowStates() || [];
    } catch (err) {
      error("reader.getWindowStates.failed", { message: String(err?.message || err) });
      return [];
    }
  }

  /**
   * 检查条目是否支持阅读器
   * @param {number} itemID - 条目 ID
   * @returns {Promise<boolean>}
   */
  async function canOpen(itemID) {
    if (!isAvailable()) {
      return false;
    }
    try {
      const item = Zotero.Items.get(itemID);
      if (!item) return false;
      // 检查是否是支持阅读器的附件类型
      return Boolean(item.attachmentReaderType);
    } catch {
      return false;
    }
  }

  /**
   * 获取阅读器类型
   * @param {number} itemID - 条目 ID
   * @returns {string|null} 'pdf' | 'epub' | 'snapshot' | null
   */
  function getReaderType(itemID) {
    if (!isAvailable()) {
      return null;
    }
    try {
      const item = Zotero.Items.get(itemID);
      if (!item) return null;
      return item.attachmentReaderType || null;
    } catch {
      return null;
    }
  }

  /**
   * 关闭指定条目的阅读器
   * @param {number} itemID - 条目 ID
   * @returns {boolean} 是否成功关闭
   */
  function closeByItemID(itemID) {
    const reader = getByItemID(itemID);
    if (reader && typeof reader.close === "function") {
      try {
        reader.close();
        debug("reader.closeByItemID.success", { itemID });
        return true;
      } catch (err) {
        error("reader.closeByItemID.failed", {
          itemID,
          message: String(err?.message || err),
        });
        return false;
      }
    }
    return false;
  }

  /**
   * 获取阅读器的标注条目 ID 列表
   * @param {string|number} identifier - Tab ID 或 Item ID
   * @returns {number[]} 标注条目 ID 数组
   */
  function getAnnotationIDs(identifier) {
    const reader = typeof identifier === "string" ? getByTabID(identifier) : getByItemID(identifier);
    if (reader && reader.annotationItemIDs) {
      return reader.annotationItemIDs;
    }
    return [];
  }

  /**
   * 获取阅读器摘要
   * @param {Object|string|number} [target] - Reader 实例、Tab ID、Item ID；省略时使用当前活动 reader
   * @returns {Object|null} Reader 摘要
   */
  function getReaderSummary(target) {
    const resolvedReader = resolveReader(target);

    if (!resolvedReader) {
      return null;
    }

    const annotationIDs = Array.isArray(resolvedReader.annotationItemIDs)
      ? [...resolvedReader.annotationItemIDs]
      : [];

    return {
      tabID: resolvedReader.tabID || null,
      itemID: resolvedReader.itemID || null,
      type: resolvedReader.itemID ? getReaderType(resolvedReader.itemID) : null,
      annotationIDs,
      annotationCount: annotationIDs.length,
    };
  }

  /**
   * 获取更适合 agent 消费的 Reader 交互快照
   * @param {Object|string|number} [target] - Reader 实例、Tab ID、Item ID；省略时使用当前活动 reader
   * @returns {Object|null} Reader 交互快照
   */
  function getReaderInteractionSnapshot(target) {
    const resolvedReader = resolveReader(target);
    const summary = getReaderSummary(resolvedReader);
    if (!resolvedReader || !summary) {
      return null;
    }

    const normalizedWindowStates = getWindowStates()
      .map((state) => normalizeWindowState(state))
      .filter(Boolean);
    const matchingWindowStates = normalizedWindowStates.filter((state) => {
      if (summary.tabID && state.tabID) {
        return state.tabID === summary.tabID;
      }
      if (Number.isFinite(summary.itemID) && Number.isFinite(state.itemID)) {
        return state.itemID === summary.itemID;
      }
      return false;
    });

    const annotationDetails = Number.isFinite(summary.itemID)
      ? getAnnotations(summary.itemID)
        .map((annotation) => getAnnotationSnapshot(annotation))
        .filter(Boolean)
      : [];
    const selectedAnnotationIDs = Array.isArray(resolvedReader.selectedAnnotationIDs)
      ? [...resolvedReader.selectedAnnotationIDs]
      : [];
    const uiState = getReaderUIStateSnapshot(resolvedReader);

    return {
      ...summary,
      active: isReaderActive(resolvedReader),
      supportsAnnotationAPI: isAnnotationsAvailable(),
      selectedAnnotationIDs,
      selectedAnnotationCount: selectedAnnotationIDs.length,
      annotationDetails,
      annotationDetailCount: annotationDetails.length,
      editableAnnotationCount: annotationDetails.filter((item) => item.editable).length,
      uiState,
      windowStates: normalizedWindowStates,
      matchingWindowStates,
      matchingWindowStateCount: matchingWindowStates.length,
      hasMatchingWindowState: matchingWindowStates.length > 0,
    };
  }

  /**
   * 获取当前活动阅读器摘要
   * @returns {Object|null} 当前活动 reader 摘要
   */
  function getActiveSummary() {
    return getReaderSummary();
  }

  // ==================== 注解 API ====================

  /**
   * 检查 Annotations API 是否可用
   * @returns {boolean}
   */
  function isAnnotationsAvailable() {
    return Boolean(Zotero && Zotero.Annotations);
  }

  /**
   * 检查 Reader 事件 API 是否可用
   * @returns {boolean}
   */
  function isEventAPIAvailable() {
    return Boolean(
      Zotero
      && Zotero.Reader
      && typeof Zotero.Reader.registerEventListener === "function"
      && typeof Zotero.Reader.unregisterEventListener === "function",
    );
  }

  /**
   * 获取当前已注册的 Reader 事件监听器快照
   * @returns {Array<{type: string, pluginID: string | null}>}
   */
  function getRegisteredEventListeners() {
    return registeredEventListeners.map((entry) => cloneEventListenerEntry(entry));
  }

  /**
   * 获取当前已注册的 Reader 事件监听器数量
   * @returns {number}
   */
  function getEventListenerCount() {
    return registeredEventListeners.length;
  }

  function getKnownEventTypes() {
    return READER_EVENT_KNOWN_TYPES.slice();
  }

  function getProbeCompatibleEventTypes() {
    return READER_EVENT_PROBE_COMPATIBLE_TYPES.slice();
  }

  function supportsSyntheticFallback(type) {
    return READER_EVENT_SYNTHETIC_FALLBACK_TYPE_SET.has(String(type || "").trim());
  }

  function findRegisteredEventListeners(type, handler) {
    return registeredEventListeners.filter((entry) => entry.type === type && entry.handler === handler);
  }

  function getReaderFrameWindow(target, options = {}) {
    const resolvedReader = resolveReader(target);
    if (!resolvedReader) {
      return null;
    }

    const viewKey = options.view === "secondary" ? "_secondaryView" : "_primaryView";
    const internalReader = readReaderProperty(resolvedReader, "_internalReader");
    const internalView = internalReader && typeof internalReader === "object"
      ? readReaderProperty(internalReader, viewKey)
      : null;

    return readReaderProperty(internalView, "_iframeWindow")
      || readReaderProperty(resolvedReader, "_iframeWindow")
      || null;
  }

  function dispatchSyntheticEvent(target, options = {}) {
    const eventType = String(options.type || "").trim();
    if (!eventType) {
      return {
        type: eventType,
        itemID: null,
        dispatched: 0,
        failed: 0,
        usedDoc: false,
      };
    }

    if (!supportsSyntheticFallback(eventType)) {
      return {
        type: eventType,
        itemID: null,
        dispatched: 0,
        failed: 0,
        usedDoc: false,
        supported: false,
      };
    }

    const resolvedReader = resolveReader(target);
    if (!resolvedReader) {
      return {
        type: eventType,
        itemID: null,
        dispatched: 0,
        failed: 0,
        usedDoc: false,
        supported: true,
      };
    }

    const append = typeof options.append === "function" ? options.append : () => {};
    const params = options.params && typeof options.params === "object"
      ? clonePlainValueSafe(options.params) || {}
      : {};
    const syntheticEvent = {
      ...params,
      type: eventType,
      reader: resolvedReader,
      append,
    };

    const frameWindow = options.includeDoc === false
      ? null
      : getReaderFrameWindow(resolvedReader, options);
    if (frameWindow?.document) {
      syntheticEvent.doc = frameWindow.document;
    }

    const matches = registeredEventListeners.filter((entry) => entry.type === eventType);
    let failed = 0;

    matches.forEach((entry) => {
      try {
        entry.handler(syntheticEvent);
      }
      catch (err) {
        failed += 1;
        error("reader.dispatchSyntheticEvent.failed", {
          type: eventType,
          itemID: Number.isFinite(resolvedReader?.itemID) ? resolvedReader.itemID : null,
          message: String(err?.message || err),
        });
      }
    });

    return {
      type: eventType,
      itemID: Number.isFinite(resolvedReader?.itemID) ? resolvedReader.itemID : null,
      dispatched: matches.length,
      failed,
      usedDoc: Boolean(syntheticEvent.doc),
      supported: true,
    };
  }

  function getEventAPIReport() {
    const registeredListeners = getRegisteredEventListeners();
    const registeredTypes = Array.from(new Set(
      registeredListeners
        .map((entry) => String(entry?.type || "").trim())
        .filter(Boolean),
    ));

    return {
      available: isEventAPIAvailable(),
      registeredCount: registeredListeners.length,
      registeredTypes,
      registeredListeners,
      knownTypes: getKnownEventTypes(),
      probeCompatibleTypes: getProbeCompatibleEventTypes(),
      probeDispatchModes: READER_EVENT_SYNTHETIC_FALLBACK_TYPES.length > 0
        ? ["customEvent", "synthetic-fallback"]
        : ["customEvent"],
      syntheticFallbackAvailable: READER_EVENT_SYNTHETIC_FALLBACK_TYPES.length > 0,
    };
  }

  /**
   * 注册 Reader 官方事件监听器
   * @param {string} type - Reader 事件类型
   * @param {Function} handler - 事件处理函数
   * @param {Object} [options] - 选项
   * @param {string} [options.pluginID] - 插件 ID；默认使用实例配置
   * @returns {Function|null} cleanup 函数；失败时返回 null
   */
  function registerEventListener(type, handler, options = {}) {
    const eventType = String(type || "").trim();
    const effectivePluginID = toPlainString(options.pluginID) || toPlainString(pluginID) || undefined;
    if (!eventType || typeof handler !== "function") {
      error("reader.registerEventListener.invalidArgs", { type: eventType });
      return null;
    }
    if (!READER_EVENT_KNOWN_TYPE_SET.has(eventType)) {
      error("reader.registerEventListener.unknownType", { type: eventType });
      return null;
    }
    if (!isEventAPIAvailable()) {
      error("reader.registerEventListener.notAvailable", { type: eventType });
      return null;
    }

    const wrappedHandler = (event) => handler(event);
    Zotero.Reader.registerEventListener(eventType, wrappedHandler, effectivePluginID);
    registeredEventListeners.push({
      type: eventType,
      handler,
      wrappedHandler,
      pluginID: effectivePluginID || null,
    });

    const cleanup = () => {
      unregisterEventListener(eventType, handler);
    };

    if (lifecycle && typeof lifecycle.trackCleanup === "function") {
      lifecycle.trackCleanup(cleanup);
    }

    return cleanup;
  }

  /**
   * 注销指定 Reader 事件监听器
   * @param {string} type - Reader 事件类型
   * @param {Function} handler - 原始处理函数
   * @returns {number} 实际移除的监听器数量
   */
  function unregisterEventListener(type, handler) {
    const eventType = String(type || "").trim();
    if (!eventType || typeof handler !== "function") {
      return 0;
    }

    const matches = findRegisteredEventListeners(eventType, handler);
    matches.forEach((entry) => {
      if (isEventAPIAvailable()) {
        try {
          Zotero.Reader.unregisterEventListener(entry.type, entry.wrappedHandler);
        }
        catch (err) {
          error("reader.unregisterEventListener.failed", {
            type: entry.type,
            message: String(err?.message || err),
          });
        }
      }
      const index = registeredEventListeners.indexOf(entry);
      if (index >= 0) {
        registeredEventListeners.splice(index, 1);
      }
    });

    return matches.length;
  }

  /**
   * 注销全部 Reader 事件监听器
   * @returns {number} 实际移除的监听器数量
   */
  function unregisterAllEventListeners() {
    const snapshot = registeredEventListeners.slice();
    snapshot.forEach((entry) => {
      unregisterEventListener(entry.type, entry.handler);
    });
    return snapshot.length;
  }

  /**
   * 获取附件的所有注解
   * @param {number} attachmentID - 附件条目 ID
   * @returns {Array} 注解条目数组
   */
  function getAnnotations(attachmentID) {
    if (!isAvailable()) {
      return [];
    }
    try {
      const item = Zotero.Items.get(attachmentID);
      if (!item || !item.isAttachment()) {
        return [];
      }
      return item.getAnnotations ? item.getAnnotations() : [];
    } catch (err) {
      error("reader.getAnnotations.failed", {
        attachmentID,
        message: String(err?.message || err),
      });
      return [];
    }
  }

  /**
   * 获取单个注解条目
   * @param {number} annotationID - 注解条目 ID
   * @returns {Object|null} 注解条目或 null
   */
  function getAnnotation(annotationID) {
    if (!isAvailable()) {
      return null;
    }
    try {
      const item = Zotero.Items.get(annotationID);
      if (item && item.isAnnotation && item.isAnnotation()) {
        return item;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 从 JSON 数据创建注解
   * @param {number} attachmentID - 附件条目 ID
   * @param {Object} annotationData - 注解数据
   * @param {string} [annotationData.key] - 注解 key；省略时自动生成
   * @param {string} annotationData.type - 注解类型（highlight/note/image/ink/text）
   * @param {string} [annotationData.text] - 注解文本
   * @param {string} [annotationData.comment] - 注解评论
   * @param {string} [annotationData.authorName] - 作者名称
   * @param {string} [annotationData.color] - 颜色（#RRGGBB）
   * @param {number} [annotationData.pageIndex] - 页码索引
   * @param {string} [annotationData.pageLabel] - 页码标签；省略时按 pageIndex 推导
   * @param {string} [annotationData.sortIndex] - 排序索引；省略时生成稳定默认值
   * @param {Array<number[]>} [annotationData.rects] - 矩形区域
   * @param {Object} [annotationData.position] - 底层 position JSON；未提供时由 pageIndex/rects 生成
   * @param {Array<string|Object>} [annotationData.tags] - 标签列表
   * @param {Object} [options] - 保存选项
   * @returns {Promise<Object|null>} 创建的注解条目
   */
  async function createAnnotation(attachmentID, annotationData, options = {}) {
    if (!isAnnotationsAvailable()) {
      error("reader.createAnnotation.notAvailable", {});
      return null;
    }

    try {
      const attachment = Zotero.Items.get(attachmentID);
      if (!attachment || !attachment.isAttachment()) {
        error("reader.createAnnotation.invalidAttachment", { attachmentID });
        return null;
      }

      const normalizedAnnotation = normalizeAnnotationInput(annotationData);
      const savedAnnotation = await Zotero.Annotations.saveFromJSON(
        attachment,
        normalizedAnnotation,
        options,
      );
      debug("reader.createAnnotation.success", { attachmentID, annotationID: savedAnnotation?.id });
      return savedAnnotation;
    } catch (err) {
      error("reader.createAnnotation.failed", {
        attachmentID,
        message: String(err?.message || err),
      });
      return null;
    }
  }

  /**
   * 更新注解
   * @param {number} annotationID - 注解条目 ID
   * @param {Object} updates - 更新数据
   * @returns {Promise<boolean>} 是否成功
   */
  async function updateAnnotation(annotationID, updates) {
    if (!isAvailable()) {
      return false;
    }

    try {
      const annotation = Zotero.Items.get(annotationID);
      if (!annotation || !annotation.isAnnotation()) {
        error("reader.updateAnnotation.invalidAnnotation", { annotationID });
        return false;
      }

      // 更新注解属性
      if (updates.text !== undefined) {
        annotation.annotationText = updates.text;
      }
      if (updates.comment !== undefined) {
        annotation.annotationComment = updates.comment;
      }
      if (updates.color !== undefined) {
        annotation.annotationColor = updates.color;
      }
      if (updates.pageIndex !== undefined) {
        annotation.annotationPageLabel = String(updates.pageIndex + 1);
      }

      await annotation.saveTx();
      debug("reader.updateAnnotation.success", { annotationID });
      return true;
    } catch (err) {
      error("reader.updateAnnotation.failed", {
        annotationID,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 删除注解
   * @param {number} annotationID - 注解条目 ID
   * @returns {Promise<boolean>} 是否成功
   */
  async function deleteAnnotation(annotationID) {
    if (!isAvailable()) {
      return false;
    }

    try {
      const annotation = Zotero.Items.get(annotationID);
      if (!annotation || !annotation.isAnnotation()) {
        error("reader.deleteAnnotation.invalidAnnotation", { annotationID });
        return false;
      }

      await annotation.eraseTx();
      debug("reader.deleteAnnotation.success", { annotationID });
      return true;
    } catch (err) {
      error("reader.deleteAnnotation.failed", {
        annotationID,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 批量删除注解
   * @param {number[]} annotationIDs - 注解条目 ID 数组
   * @returns {Promise<number>} 成功删除的数量
   */
  async function deleteAnnotations(annotationIDs) {
    if (!Array.isArray(annotationIDs) || annotationIDs.length === 0) {
      return 0;
    }

    let deletedCount = 0;
    for (const id of annotationIDs) {
      const success = await deleteAnnotation(id);
      if (success) deletedCount++;
    }
    return deletedCount;
  }

  /**
   * 获取注解的作者名称
   * @param {number} annotationID - 注解条目 ID
   * @returns {string|null} 作者名称
   */
  function getAnnotationAuthor(annotationID) {
    const annotation = getAnnotation(annotationID);
    if (annotation) {
      return annotation.annotationAuthorName || null;
    }
    return null;
  }

  /**
   * 检查注解是否可编辑
   * @param {number} annotationID - 注解条目 ID
   * @returns {boolean}
   */
  function isAnnotationEditable(annotationID) {
    const annotation = getAnnotation(annotationID);
    if (annotation) {
      return annotation.isEditable();
    }
    return false;
  }

  // 返回公共 API
  return {
    // 常量
    READER_TYPES,
    ANNOTATION_TYPES,
    READER_EVENT_TYPES,

    // 阅读器 API
    isAvailable,
    getAllReaders,
    getByTabID,
    getByItemID,
    getActiveReader,
    openReader,
    openByURI,
    getWindowStates,
    canOpen,
    getReaderType,
    closeByItemID,
    getAnnotationIDs,
    getReaderSummary,
    getReaderUIStateSnapshot,
    getReaderInteractionSnapshot,
    getActiveSummary,
    isEventAPIAvailable,
    registerEventListener,
    unregisterEventListener,
    unregisterAllEventListeners,
    getRegisteredEventListeners,
    getEventListenerCount,
    getKnownEventTypes,
    getProbeCompatibleEventTypes,
    getEventAPIReport,
    dispatchSyntheticEvent,
    getReaderFrameWindow,

    // 注解 API
    isAnnotationsAvailable,
    getAnnotations,
    getAnnotation,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    deleteAnnotations,
    getAnnotationAuthor,
    isAnnotationEditable,
  };
}
