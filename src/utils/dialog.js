/**
 * 对话框工具模块
 * 提供模态对话框创建和管理功能
 */

/**
 * 对话框按钮类型
 */
export const BUTTON_TYPES = {
  ACCEPT: "accept",       // 确认
  CANCEL: "cancel",       // 取消
  EXTRA1: "extra1",       // 额外按钮 1
  EXTRA2: "extra2",       // 额外按钮 2
  HELP: "help",           // 帮助
  DISCARD: "discard",     // 放弃
};

/**
 * 创建对话框构建器
 * @param {Object} options - 配置选项
 * @param {Object} options.logger - 日志记录器
 * @param {Object} options.uiFactory - UI 工厂实例
 * @param {Object} options.i18n - 国际化实例
 * @param {Object} [options.services] - Services 对象
 * @returns {Object} 对话框构建器实例
 */
export function createDialogBuilder(options) {
  const { logger, uiFactory, i18n, services } = options;

  // 获取 Services 对象
  const Services = services || (typeof globalThis !== "undefined" && globalThis.Services);

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
   * 显示提示对话框
   * @param {Window} window - 父窗口
   * @param {string} title - 标题
   * @param {string} message - 消息内容
   */
  function alert(window, title, message) {
    if (!Services || !Services.prompt) {
      if (typeof window !== "undefined" && window.alert) {
        window.alert(message);
      }
      return;
    }

    try {
      Services.prompt.alert(window, title || "", message || "");
    } catch (err) {
      error("dialog.alert.failed", {
        message: String(err?.message || err),
      });
    }
  }

  /**
   * 显示确认对话框
   * @param {Window} window - 父窗口
   * @param {string} title - 标题
   * @param {string} message - 消息内容
   * @returns {boolean} 用户是否确认
   */
  function confirm(window, title, message) {
    if (!Services || !Services.prompt) {
      if (typeof window !== "undefined" && window.confirm) {
        return window.confirm(message);
      }
      return false;
    }

    try {
      const result = Services.prompt.confirm(
        window,
        title || "",
        message || ""
      );
      return result === 1; // 1 = OK, 0 = Cancel
    } catch (err) {
      error("dialog.confirm.failed", {
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 显示输入对话框
   * @param {Window} window - 父窗口
   * @param {string} title - 标题
   * @param {string} message - 消息内容
   * @param {string} [defaultValue] - 默认值
   * @returns {{confirmed: boolean, value: string}} 结果对象
   */
  function prompt(window, title, message, defaultValue = "") {
    if (!Services || !Services.prompt) {
      if (typeof window !== "undefined" && window.prompt) {
        const value = window.prompt(message, defaultValue);
        return {
          confirmed: value !== null,
          value: value || "",
        };
      }
      return { confirmed: false, value: "" };
    }

    try {
      const input = { value: defaultValue };
      const confirmed = Services.prompt.prompt(
        window,
        title || "",
        message || "",
        input,
        null,
        {}
      );

      return {
        confirmed: confirmed === 1,
        value: input.value || "",
      };
    } catch (err) {
      error("dialog.prompt.failed", {
        message: String(err?.message || err),
      });
      return { confirmed: false, value: "" };
    }
  }

  /**
   * 显示选择对话框（是/否/取消）
   * @param {Window} window - 父窗口
   * @param {string} title - 标题
   * @param {string} message - 消息内容
   * @param {string} [button0Label] - 按钮 0 标签
   * @param {string} [button1Label] - 按钮 1 标签
   * @param {string} [button2Label] - 按钮 2 标签
   * @returns {number} 按钮索引（0/1/2）或 -1（关闭）
   */
  function confirmEx(
    window,
    title,
    message,
    button0Label = "Yes",
    button1Label = "No",
    button2Label = "Cancel"
  ) {
    if (!Services || !Services.prompt) {
      const result = confirm(window, title, message);
      return result ? 0 : 2;
    }

    try {
      const flags =
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_1 +
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_2;

      return Services.prompt.confirmEx(
        window,
        title || "",
        message || "",
        flags,
        button0Label,
        button1Label,
        button2Label,
        null,
        {}
      );
    } catch (err) {
      error("dialog.confirmEx.failed", {
        message: String(err?.message || err),
      });
      return -1;
    }
  }

  /**
   * 显示保存确认对话框
   * @param {Window} window - 父窗口
   * @param {string} title - 标题
   * @param {string} message - 消息内容
   * @returns {string} 'save' | 'dontsave' | 'cancel'
   */
  function askSave(window, title, message) {
    if (!Services || !Services.prompt) {
      const result = confirm(window, title, message);
      return result ? "save" : "cancel";
    }

    try {
      const flags =
        Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_SAVE +
        Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_DONT_SAVE +
        Services.prompt.BUTTON_POS_2 * Services.prompt.BUTTON_TITLE_CANCEL;

      const result = Services.prompt.confirmEx(
        window,
        title || "",
        message || "",
        flags,
        null,
        null,
        null,
        null,
        {}
      );

      return ["save", "dontsave", "cancel"][result] || "cancel";
    } catch (err) {
      error("dialog.askSave.failed", {
        message: String(err?.message || err),
      });
      return "cancel";
    }
  }

  /**
   * 显示选择对话框
   * @param {Window} window - 父窗口
   * @param {string} title - 标题
   * @param {string} message - 消息内容
   * @param {Array<string>} options - 选项数组
   * @param {number} [defaultIndex] - 默认选中索引
   * @returns {{selected: number, confirmed: boolean}}
   */
  function select(window, title, message, options, defaultIndex = 0) {
    if (!Services || !Services.prompt) {
      return { selected: -1, confirmed: false };
    }

    try {
      const selected = { value: defaultIndex };
      const confirmed = Services.prompt.select(
        window,
        title || "",
        message || "",
        options.length,
        options,
        selected
      );

      return {
        selected: selected.value,
        confirmed: confirmed === 1,
      };
    } catch (err) {
      error("dialog.select.failed", {
        message: String(err?.message || err),
      });
      return { selected: -1, confirmed: false };
    }
  }

  /**
   * 创建自定义对话框
   * @param {Window} window - 父窗口
   * @param {Object} dialogOptions - 对话框配置
   * @param {string} dialogOptions.title - 标题
   * @param {string} [dialogOptions.content] - XHTML 内容
   * @param {Array<Object>} [dialogOptions.buttons] - 按钮配置
   * @param {number} [dialogOptions.width] - 宽度
   * @param {number} [dialogOptions.height] - 高度
   * @param {Function} [dialogOptions.onLoad] - 加载回调
   * @param {Function} [dialogOptions.onClose] - 关闭回调
   * @returns {Object} 对话框控制对象
   */
  function custom(window, dialogOptions) {
    const {
      title = "",
      content = "",
      buttons = [],
      width = 400,
      height = 300,
      onLoad,
      onClose,
    } = dialogOptions;

    // 简单实现：使用 window.openDialog
    try {
      const dialogUrl = "data:application/vnd.mozilla.xul+xml," + encodeURIComponent(`
        <?xml version="1.0"?>
        <?xml-stylesheet href="chrome://global/skin/" type="text/css"?>
        <dialog xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
                title="${title.replace(/"/g, '&quot;')}"
                buttons="accept,cancel"
                style="width: ${width}px; height: ${height}px;">
          ${content}
        </dialog>
      `);

      const features = [
        "chrome",
        "centerscreen",
        "modal",
        "resizable",
      ].join(",");

      const dialogWindow = window.openDialog(
        dialogUrl,
        "custom-dialog",
        features
      );

      // 加载回调
      if (typeof onLoad === "function" && dialogWindow) {
        dialogWindow.addEventListener("load", () => {
          onLoad(dialogWindow);
        });
      }

      // 关闭回调
      if (typeof onClose === "function" && dialogWindow) {
        dialogWindow.addEventListener("close", () => {
          onClose(dialogWindow);
        });
      }

      return {
        window: dialogWindow,
        close: () => {
          if (dialogWindow && !dialogWindow.closed) {
            dialogWindow.close();
          }
        },
      };
    } catch (err) {
      error("dialog.custom.failed", {
        message: String(err?.message || err),
      });

      // 降级：使用 alert
      alert(window, title, content.replace(/<[^>]*>/g, ""));

      return {
        window: null,
        close: () => {},
      };
    }
  }

  /**
   * 显示消息对话框（带图标）
   * @param {Window} window - 父窗口
   * @param {string} title - 标题
   * @param {string} message - 消息内容
   * @param {string} [type] - 类型：'info' | 'warning' | 'error' | 'question'
   */
  function showMessage(window, title, message, type = "info") {
    if (!Services || !Services.prompt) {
      alert(window, title, message);
      return;
    }

    try {
      Services.prompt.alert(window, title || "", message || "");
    } catch (err) {
      error("dialog.showMessage.failed", {
        message: String(err?.message || err),
      });
    }
  }

  return {
    // 基础对话框
    alert,
    confirm,
    prompt,
    confirmEx,
    askSave,
    select,
    showMessage,

    // 自定义对话框
    custom,

    // 常量
    BUTTON_TYPES,
  };
}
