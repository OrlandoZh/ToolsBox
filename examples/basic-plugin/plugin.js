/**
 * 基础示例插件
 * 演示框架的核心功能使用方法
 */
import { createLogger } from "../../src/core/logger.js";
import { createPreferenceStore } from "../../src/core/prefs.js";
import { createLifecycleManager } from "../../src/core/lifecycle.js";
import { createI18n } from "../../src/core/i18n.js";
import { createNotifier, EVENTS } from "../../src/core/notifier.js";
import { createMenuManager } from "../../src/features/menu-manager.js";
import { createItemPane } from "../../src/features/item-pane.js";
import { createReader } from "../../src/features/reader.js";
import { createProgressNotifier, NOTIFICATION_TYPES } from "../../src/utils/progress-window.js";

/**
 * 创建示例插件
 */
export function createExamplePlugin(options = {}) {
  const { config, Zotero } = options;

  // ============ 核心模块初始化 ============

  const logger = createLogger({
    hostLog: (msg) => Zotero.debug(`[${config.addonName}] ${msg}`),
    level: "debug"
  });

  const prefs = createPreferenceStore({
    prefBranch: `extensions.${config.addonRef}`,
    defaults: {
      enabled: true,
      showNotifications: true,
      autoProcess: false
    }
  });

  const lifecycle = createLifecycleManager({ logger });

  const i18n = createI18n();

  const notifier = createNotifier({ logger, lifecycle });

  // ============ 功能模块初始化 ============

  const menu = createMenuManager({
    logger,
    lifecycle,
    pluginID: config.addonId
  });

  const itemPane = createItemPane({
    logger,
    lifecycle,
    pluginID: config.addonId
  });

  const reader = createReader({ logger });

  const progress = createProgressNotifier({ logger, i18n });

  // ============ 插件状态 ============

  let mainWindow = null;

  // ============ 启动逻辑 ============

  async function start() {
    logger.info("Example plugin starting...");

    // 注册事件监听
    registerEventListeners();

    // 注册菜单
    registerMenus();

    // 注册面板
    registerPanes();

    logger.info("Example plugin started successfully");
  }

  // ============ 事件监听 ============

  function registerEventListeners() {
    // 监听条目添加事件
    notifier.subscribe(["item"], (event, type, ids) => {
      if (event === EVENTS.ADD) {
        logger.debug("New items added:", ids);
        
        if (prefs.get("showNotifications")) {
          progress.showToast(
            `Added ${ids.length} item(s)`,
            NOTIFICATION_TYPES.SUCCESS,
            2000
          );
        }
      }
    });

    // 监听偏好变化
    prefs.onChange((key) => {
      logger.debug(`Preference changed: ${key}`);
    });
  }

  // ============ 菜单注册 ============

  function registerMenus() {
    // 工具菜单
    menu.registerToolsMenuItem({
      label: `${config.addonName} - Process All`,
      icon: "chrome://myplugin/content/icon.svg",
      onCommand: async (event, context) => {
        await processAllItems();
      }
    });

    // 条目菜单项
    menu.registerItemMenuItem({
      label: "Process Selected Items",
      onCommand: async (event, context) => {
        const items = context.items || [];
        await processItems(items);
      },
      onShowing: (event, context) => {
        // 只在有选中条目时显示
        context.setVisible((context.items?.length || 0) > 0);
      }
    });

    // 收藏集菜单
    menu.registerCollectionMenuItem({
      label: "Process Collection",
      onCommand: (event, context) => {
        logger.debug("Process collection clicked");
      }
    });
  }

  // ============ 面板注册 ============

  function registerPanes() {
    // 注册自定义 Section
    itemPane.registerSection({
      paneID: `${config.addonRef}-section`,
      header: {
        l10nID: "general-print",
        icon: "chrome://myplugin/content/icon.svg"
      },
      sidenav: {
        l10nID: "general-print",
        icon: "chrome://myplugin/content/icon20.svg"
      },
      onItemChange: ({ item, setEnabled }) => {
        // 只对常规条目启用
        setEnabled(item?.isRegularItem?.() || false);
      },
      onRender: ({ doc, body, item }) => {
        // 清空现有内容
        body.innerHTML = "";

        if (!item) return;

        // 创建内容
        const title = doc.createElement("h3");
        title.textContent = item.getField("title");

        const info = doc.createElement("p");
        info.textContent = `Type: ${item.itemType}, ID: ${item.id}`;

        const button = doc.createElement("button");
        button.textContent = "Process Item";
        button.addEventListener("click", () => {
          processItem(item);
        });

        body.appendChild(title);
        body.appendChild(info);
        body.appendChild(button);
      }
    });

    // 注册 InfoRow
    itemPane.registerInfoRow({
      rowID: `${config.addonRef}-pages`,
      label: { l10nID: "general-print" },
      position: "afterCreators",
      editable: false,
      onGetData: ({ item }) => item?.getField("numPages") || ""
    });
  }

  // ============ 业务逻辑 ============

  async function processAllItems() {
    const items = Zotero.Items.getAll().filter(item => item.isRegularItem());
    await processItems(items);
  }

  async function processItems(items) {
    if (!items || items.length === 0) {
      progress.showWarning("No items to process");
      return;
    }

    const progressId = progress.showProgress({
      title: "Processing Items",
      message: `Processing 0 of ${items.length}`,
      progress: 0
    });

    for (let i = 0; i < items.length; i++) {
      await processItem(items[i]);

      progress.updateProgress(
        progressId,
        Math.round(((i + 1) / items.length) * 100),
        `Processing ${i + 1} of ${items.length}`
      );
    }

    progress.closeProgress(progressId);
    progress.showSuccess(`Processed ${items.length} item(s)`);
  }

  async function processItem(item) {
    logger.debug("Processing item:", item.id);
    // 在这里添加你的处理逻辑
  }

  // ============ 窗口管理 ============

  function onWindowLoad(window) {
    mainWindow = window;
    logger.debug("Window loaded");
  }

  function onWindowUnload(window) {
    if (window === mainWindow) {
      mainWindow = null;
    }
    logger.debug("Window unloaded");
  }

  // ============ 关闭清理 ============

  function shutdown() {
    logger.info("Example plugin shutting down...");
    lifecycle.reset();
    logger.info("Example plugin shutdown complete");
  }

  // ============ 公开 API ============

  return {
    start,
    onWindowLoad,
    onWindowUnload,
    shutdown,

    // 暴露模块供外部使用
    modules: {
      logger,
      prefs,
      notifier,
      menu,
      itemPane,
      reader,
      progress
    }
  };
}
