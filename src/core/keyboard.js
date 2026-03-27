/**
 * 键盘快捷键管理模块
 * 提供键盘快捷键注册和管理功能，支持平台特定修饰键
 */

/**
 * 修饰键常量
 */
export const MODIFIERS = {
  CTRL: "ctrl",
  ALT: "alt",
  SHIFT: "shift",
  META: "meta", // macOS Command
};

/**
 * 创建键盘管理器
 * @param {Object} options - 配置选项
 * @param {Object} options.logger - 日志记录器
 * @param {Object} options.lifecycle - 生命周期管理器
 * @param {Object} [options.services] - Services 对象（用于测试注入）
 * @returns {Object} 键盘管理器实例
 */
export function createKeyboardManager(options) {
  const { logger, lifecycle, services } = options;

  // 获取 Services 对象
  const Services = services || (typeof globalThis !== "undefined" && globalThis.Services);

  // 注册追踪
  const registeredShortcuts = new Map();
  let shortcutCounter = 0;

  // 平台检测
  let isMac = false;
  try {
    if (Services && Services.appinfo) {
      isMac = Services.appinfo.OS === "Darwin";
    } else if (typeof navigator !== "undefined") {
      isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    }
  } catch {
    isMac = false;
  }

  /**
   * 记录调试信息
   */
  function debug(message, details) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
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
   * 记录错误
   */
  function error(message, details) {
    if (logger && typeof logger.error === "function") {
      logger.error(message, details);
    }
  }

  /**
   * 检测是否为 macOS
   * @returns {boolean}
   */
  function isMacOS() {
    return isMac;
  }

  /**
   * 标准化修饰键（处理平台差异）
   * @param {Array<string>} modifiers - 修饰键数组
   * @returns {Object} 标准化后的修饰键状态
   */
  function normalizeModifiers(modifiers) {
    const result = {
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };

    if (!Array.isArray(modifiers)) {
      return result;
    }

    modifiers.forEach((m) => {
      const lower = String(m).toLowerCase();
      if (lower === "ctrl" || lower === "control") {
        // macOS: Ctrl -> Meta (Command)
        result[isMac ? "meta" : "ctrl"] = true;
      } else if (lower === "alt" || lower === "option") {
        result.alt = true;
      } else if (lower === "shift") {
        result.shift = true;
      } else if (lower === "meta" || lower === "cmd" || lower === "command") {
        result.meta = true;
      }
    });

    return result;
  }

  /**
   * 解析快捷键字符串
   * @param {string} shortcut - 快捷键字符串，如 "Ctrl+Shift+S"
   * @returns {Object} { key, modifiers }
   */
  function parseShortcut(shortcut) {
    if (!shortcut || typeof shortcut !== "string") {
      return null;
    }

    const parts = shortcut.split("+").map((p) => p.trim());
    const key = parts.pop().toUpperCase();

    const modifiers = normalizeModifiers(parts);

    return { key, modifiers };
  }

  /**
   * 检查事件是否匹配快捷键
   * @param {KeyboardEvent} event - 键盘事件
   * @param {Object} parsed - 解析后的快捷键对象
   * @returns {boolean}
   */
  function matchesShortcut(event, parsed) {
    if (!parsed) {
      return false;
    }

    const eventKey = String(event.key || "").toUpperCase();
    const parsedKey = String(parsed.key || "").toUpperCase();

    // 键匹配
    if (eventKey !== parsedKey) {
      return false;
    }

    // 修饰键匹配
    const mods = parsed.modifiers;
    return (
      event.ctrlKey === mods.ctrl &&
      event.altKey === mods.alt &&
      event.shiftKey === mods.shift &&
      event.metaKey === mods.meta
    );
  }

  /**
   * 生成快捷键 ID
   * @param {string} key - 键
   * @param {Object} modifiers - 修饰键
   * @returns {string}
   */
  function generateShortcutId(key, modifiers) {
    const parts = [];
    if (modifiers.ctrl) parts.push("ctrl");
    if (modifiers.alt) parts.push("alt");
    if (modifiers.shift) parts.push("shift");
    if (modifiers.meta) parts.push("meta");
    parts.push(key.toLowerCase());
    return `shortcut-${parts.join("-")}`;
  }

  /**
   * 注册快捷键
   * @param {Object} shortcutOptions - 快捷键配置
   * @param {string} [shortcutOptions.key] - 键名
   * @param {Array<string>} [shortcutOptions.modifiers] - 修饰键数组
   * @param {string} [shortcutOptions.shortcut] - 快捷键字符串（与 key/modifiers 二选一）
   * @param {Function} shortcutOptions.handler - 处理函数
   * @param {string} [shortcutOptions.id] - 自定义 ID
   * @param {string} [shortcutOptions.description] - 描述
   * @param {Window} [shortcutOptions.window] - 作用窗口（默认全局）
   * @param {boolean} [shortcutOptions.preventDefault] - 是否阻止默认行为
   * @param {boolean} [shortcutOptions.stopPropagation] - 是否阻止冒泡
   * @returns {string|null} 快捷键 ID
   */
  function registerShortcut(shortcutOptions) {
    const {
      key,
      modifiers,
      shortcut,
      handler,
      id: customId,
      description,
      window: targetWindow,
      preventDefault = true,
      stopPropagation = false,
    } = shortcutOptions;

    // 解析快捷键
    let parsed;
    if (shortcut) {
      parsed = parseShortcut(shortcut);
    } else if (key) {
      parsed = {
        key: String(key).toUpperCase(),
        modifiers: normalizeModifiers(modifiers || []),
      };
    }

    if (!parsed || !parsed.key) {
      error("keyboardManager.registerShortcut.invalidKey", {});
      return null;
    }

    if (typeof handler !== "function") {
      error("keyboardManager.registerShortcut.noHandler", {});
      return null;
    }

    const shortcutId = customId || generateShortcutId(parsed.key, parsed.modifiers);

    // 检查冲突
    if (registeredShortcuts.has(shortcutId)) {
      warn("keyboardManager.registerShortcut.conflict", { shortcutId });
    }

    try {
      // 创建事件处理器
      const eventHandler = (event) => {
        if (matchesShortcut(event, parsed)) {
          if (preventDefault) {
            event.preventDefault();
          }
          if (stopPropagation) {
            event.stopPropagation();
          }

          try {
            handler(event);
          } catch (err) {
            error("keyboardManager.handler.error", {
              shortcutId,
              message: String(err?.message || err),
            });
          }
        }
      };

      // 注册事件监听
      const target = targetWindow || (typeof window !== "undefined" ? window : null);
      if (target) {
        target.addEventListener("keydown", eventHandler);
      }

      // 追踪注册
      const cleanup = () => {
        if (target) {
          target.removeEventListener("keydown", eventHandler);
        }
      };

      registeredShortcuts.set(shortcutId, {
        parsed,
        description,
        handler,
        cleanup,
        window: target,
      });

      debug("keyboardManager.registerShortcut.created", {
        shortcutId,
        key: parsed.key,
        modifiers: parsed.modifiers,
      });

      return shortcutId;
    } catch (err) {
      error("keyboardManager.registerShortcut.failed", {
        message: String(err?.message || err),
      });
      return null;
    }
  }

  /**
   * 注销快捷键
   * @param {string} shortcutId - 快捷键 ID
   * @returns {boolean} 是否成功
   */
  function unregister(shortcutId) {
    const registration = registeredShortcuts.get(shortcutId);
    if (!registration) {
      return false;
    }

    try {
      if (typeof registration.cleanup === "function") {
        registration.cleanup();
      }
      registeredShortcuts.delete(shortcutId);

      debug("keyboardManager.unregister.removed", { shortcutId });
      return true;
    } catch (err) {
      error("keyboardManager.unregister.failed", {
        shortcutId,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 注销所有快捷键
   */
  function unregisterAll() {
    const count = registeredShortcuts.size;
    registeredShortcuts.forEach((_, id) => {
      unregister(id);
    });
    debug("keyboardManager.unregisterAll", { count });
  }

  /**
   * 获取注册的快捷键数量
   * @returns {number}
   */
  function getShortcutCount() {
    return registeredShortcuts.size;
  }

  /**
   * 检查快捷键是否已注册
   * @param {string} shortcutId - 快捷键 ID
   * @returns {boolean}
   */
  function hasShortcut(shortcutId) {
    return registeredShortcuts.has(shortcutId);
  }

  /**
   * 获取所有已注册的快捷键
   * @returns {Array<{id: string, description: string}>}
   */
  function getAllShortcuts() {
    const result = [];
    registeredShortcuts.forEach((reg, id) => {
      result.push({
        id,
        description: reg.description || "",
        key: reg.parsed?.key,
        modifiers: reg.parsed?.modifiers,
      });
    });
    return result;
  }

  /**
   * 格式化快捷键为可读字符串
   * @param {string} key - 键
   * @param {Object} modifiers - 修饰键
   * @returns {string}
   */
  function formatShortcut(key, modifiers) {
    const parts = [];
    const modNames = isMac
      ? { ctrl: "⌘", alt: "⌥", shift: "⇧", meta: "⌘" }
      : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Meta" };

    if (modifiers.ctrl) parts.push(modNames.ctrl);
    if (modifiers.alt) parts.push(modNames.alt);
    if (modifiers.shift) parts.push(modNames.shift);
    if (modifiers.meta && !modifiers.ctrl) parts.push(modNames.meta);

    parts.push(key.toUpperCase());
    return parts.join(isMac ? "" : "+");
  }

  // 如果提供了 lifecycle，注册自动清理
  if (lifecycle && typeof lifecycle.trackCleanup === "function") {
    lifecycle.trackCleanup(unregisterAll);
  }

  return {
    // 平台检测
    isMacOS,

    // 注册方法
    registerShortcut,
    unregister,
    unregisterAll,

    // 查询方法
    getShortcutCount,
    hasShortcut,
    getAllShortcuts,

    // 工具方法
    parseShortcut,
    formatShortcut,
    normalizeModifiers,

    // 常量
    MODIFIERS,
  };
}
