/**
 * 进度窗口和 Toast 通知模块
 * 提供进度显示和 Toast 风格通知功能
 */

/**
 * 通知类型
 */
export const NOTIFICATION_TYPES = {
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
  INFO: "info",
  DEFAULT: "default",
};

/**
 * 创建进度通知器
 * @param {Object} options - 配置选项
 * @param {Object} options.logger - 日志记录器
 * @param {Object} options.i18n - 国际化实例
 * @param {Object} [options.zotero] - Zotero 全局对象
 * @returns {Object} 进度通知器实例
 */
export function createProgressNotifier(options) {
  const { logger, i18n, zotero } = options;

  // 获取 Zotero 全局对象
  const Zotero = zotero || (typeof globalThis !== "undefined" && globalThis.Zotero);

  // 进度窗口追踪
  const activeProgressWindows = new Map();
  let progressCounter = 0;

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
   * 检查 Zotero.ProgressWindow 是否可用
   * @returns {boolean}
   */
  function isProgressWindowAvailable() {
    return Boolean(Zotero && Zotero.ProgressWindow);
  }

  /**
   * 显示进度窗口
   * @param {Object} progressOptions - 进度配置
   * @param {string} progressOptions.title - 标题
   * @param {string} [progressOptions.message] - 消息
   * @param {number} [progressOptions.progress] - 初始进度（0-100）
   * @param {boolean} [progressOptions.determinate] - 是否确定进度
   * @param {boolean} [progressOptions.closeOnClick] - 点击是否关闭
   * @param {number} [progressOptions.closeTime] - 自动关闭时间（毫秒，-1 表示不自动关闭）
   * @param {string} [progressOptions.icon] - 图标路径
   * @param {Function} [progressOptions.onCancel] - 取消回调
   * @returns {string} 进度窗口 ID
   */
  function showProgress(progressOptions) {
    const {
      title,
      message = "",
      progress = 0,
      determinate = true,
      closeOnClick = true,
      closeTime = -1,
      icon,
      onCancel,
    } = progressOptions;

    const progressId = `progress-${++progressCounter}`;

    if (!isProgressWindowAvailable()) {
      debug("progressNotifier.showProgress.notAvailable", { progressId });
      return progressId;
    }

    try {
      // 创建进度窗口
      const progressWindow = new Zotero.ProgressWindow({ closeOnClick });

      // 设置标题
      progressWindow.changeHeadline(title || "");

      // 添加描述行
      if (message) {
        progressWindow.addDescription(message);
      }

      // 设置图标
      if (icon && typeof progressWindow.setIconURI === "function") {
        progressWindow.setIconURI("default", icon);
      }

      // 显示
      progressWindow.show();

      // 初始进度
      if (determinate && progress > 0) {
        progressWindow.changeHeadline(`${title} (${progress}%)`);
      }

      // 自动关闭
      if (closeTime > 0) {
        progressWindow.startCloseTimer(closeTime);
      }

      // 追踪
      activeProgressWindows.set(progressId, {
        window: progressWindow,
        title,
        determinate,
      });

      debug("progressNotifier.showProgress.created", { progressId });

      return progressId;
    } catch (err) {
      error("progressNotifier.showProgress.failed", {
        message: String(err?.message || err),
      });
      return progressId;
    }
  }

  /**
   * 更新进度
   * @param {string} progressId - 进度窗口 ID
   * @param {number} progress - 进度值（0-100）
   * @param {string} [message] - 更新的消息
   * @returns {boolean} 是否成功
   */
  function updateProgress(progressId, progress, message) {
    const tracked = activeProgressWindows.get(progressId);
    if (!tracked || !tracked.window) {
      return false;
    }

    try {
      const { window: progressWindow, title, determinate } = tracked;

      if (determinate) {
        const clampedProgress = Math.max(0, Math.min(100, progress));
        progressWindow.changeHeadline(`${title} (${clampedProgress}%)`);
      }

      if (message) {
        progressWindow.addDescription(message);
      }

      return true;
    } catch (err) {
      error("progressNotifier.updateProgress.failed", {
        progressId,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 关闭进度窗口
   * @param {string} progressId - 进度窗口 ID
   * @returns {boolean} 是否成功
   */
  function closeProgress(progressId) {
    const tracked = activeProgressWindows.get(progressId);
    if (!tracked) {
      return false;
    }

    try {
      if (tracked.window && typeof tracked.window.close === "function") {
        tracked.window.close();
      }
      activeProgressWindows.delete(progressId);

      debug("progressNotifier.closeProgress.closed", { progressId });
      return true;
    } catch (err) {
      error("progressNotifier.closeProgress.failed", {
        progressId,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 显示 Toast 通知
   * @param {string} message - 消息内容
   * @param {string} [type] - 类型：'success' | 'warning' | 'error' | 'info'
   * @param {number} [duration] - 显示时长（毫秒）
   * @param {Object} [options] - 额外选项
   * @param {string} [options.title] - 标题
   * @param {string} [options.icon] - 图标
   * @returns {string} 通知 ID
   */
  function showToast(message, type = NOTIFICATION_TYPES.INFO, duration = 3000, options = {}) {
    const { title, icon } = options;
    const notificationId = `toast-${++progressCounter}`;

    if (!isProgressWindowAvailable()) {
      debug("progressNotifier.showToast.notAvailable", { notificationId });
      return notificationId;
    }

    try {
      const progressWindow = new Zotero.ProgressWindow({ closeOnClick: true });

      // 标题
      if (title) {
        progressWindow.changeHeadline(title);
      }

      // 消息行
      progressWindow.addDescription(message);

      // 图标
      if (icon && typeof progressWindow.setIconURI === "function") {
        progressWindow.setIconURI("default", icon);
      }

      // 显示
      progressWindow.show();

      // 自动关闭
      if (duration > 0) {
        progressWindow.startCloseTimer(duration);
      }

      debug("progressNotifier.showToast.shown", { notificationId, type });

      return notificationId;
    } catch (err) {
      error("progressNotifier.showToast.failed", {
        message: String(err?.message || err),
      });
      return notificationId;
    }
  }

  /**
   * 显示成功通知
   * @param {string} message - 消息
   * @param {number} [duration] - 时长
   */
  function showSuccess(message, duration = 3000) {
    showToast(message, NOTIFICATION_TYPES.SUCCESS, duration);
  }

  /**
   * 显示警告通知
   * @param {string} message - 消息
   * @param {number} [duration] - 时长
   */
  function showWarning(message, duration = 4000) {
    showToast(message, NOTIFICATION_TYPES.WARNING, duration);
  }

  /**
   * 显示错误通知
   * @param {string} message - 消息
   * @param {number} [duration] - 时长
   */
  function showError(message, duration = 5000) {
    showToast(message, NOTIFICATION_TYPES.ERROR, duration);
  }

  /**
   * 显示信息通知
   * @param {string} message - 消息
   * @param {number} [duration] - 时长
   */
  function showInfo(message, duration = 3000) {
    showToast(message, NOTIFICATION_TYPES.INFO, duration);
  }

  /**
   * 关闭所有进度窗口
   */
  function closeAll() {
    activeProgressWindows.forEach((_, id) => {
      closeProgress(id);
    });
  }

  /**
   * 创建进度行对象（用于 Zotero.ProgressWindow）
   * @param {Object} lineOptions - 行配置
   * @param {string} lineOptions.text - 文本
   * @param {string} [lineOptions.type] - 类型
   * @param {number} [lineOptions.progress] - 进度
   * @param {string} [lineOptions.icon] - 图标
   * @returns {Object} 行对象
   */
  function createProgressLine(lineOptions) {
    const { text, type = "default", progress = 0, icon } = lineOptions;

    return {
      text: text || "",
      type,
      progress: Math.max(0, Math.min(100, progress)),
      icon,
    };
  }

  return {
    // 进度窗口
    showProgress,
    updateProgress,
    closeProgress,
    closeAll,

    // Toast 通知
    showToast,
    showSuccess,
    showWarning,
    showError,
    showInfo,

    // 工具方法
    createProgressLine,
    isProgressWindowAvailable,

    // 常量
    NOTIFICATION_TYPES,
  };
}
