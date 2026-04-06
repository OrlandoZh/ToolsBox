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

function createBindingTracker() {
  let settled = false;
  let resolveBinding;
  const promise = new Promise((resolve) => {
    resolveBinding = resolve;
  });
  return {
    promise,
    settle(value) {
      if (settled) {
        return;
      }
      settled = true;
      resolveBinding(value);
    },
  };
}

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

    modifiers.forEach((modifier) => {
      const lower = String(modifier).toLowerCase();
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

    const parts = shortcut.split("+").map((part) => part.trim());
    const key = parts.pop()?.toUpperCase();
    if (!key) {
      return null;
    }

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
    if (eventKey !== parsedKey) {
      return false;
    }

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
    parts.push(String(key || "").toLowerCase());
    return `shortcut-${parts.join("-")}`;
  }

  function createShortcutDefinition(shortcutOptions, errorPrefix) {
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
      ready,
      resolveWindow,
    } = shortcutOptions || {};

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
      error(`${errorPrefix}.invalidKey`, {});
      return null;
    }

    if (typeof handler !== "function") {
      error(`${errorPrefix}.noHandler`, {});
      return null;
    }

    return {
      parsed,
      handler,
      shortcutId: customId || generateShortcutId(parsed.key, parsed.modifiers),
      description: typeof description === "string" ? description : "",
      targetWindow,
      preventDefault,
      stopPropagation,
      ready,
      resolveWindow,
    };
  }

  function createShortcutSnapshot(shortcutId, registration) {
    if (!registration) {
      return null;
    }
    return {
      id: shortcutId,
      description: registration.description || "",
      key: registration.parsed?.key,
      modifiers: registration.parsed?.modifiers,
      state: registration.state || "inactive",
      bindingMode: registration.bindingMode || "immediate",
      windowBound: Boolean(registration.window),
      errorMessage: registration.errorMessage || null,
    };
  }

  function getShortcutState(shortcutId) {
    return createShortcutSnapshot(shortcutId, registeredShortcuts.get(shortcutId));
  }

  function replaceShortcutRegistration(shortcutId, nextRegistration) {
    registeredShortcuts.set(shortcutId, nextRegistration);
    return nextRegistration;
  }

  function updateShortcutRegistration(shortcutId, patch) {
    const registration = registeredShortcuts.get(shortcutId);
    if (!registration) {
      return null;
    }
    return replaceShortcutRegistration(shortcutId, {
      ...registration,
      ...patch,
    });
  }

  function ensureNoShortcutConflict(shortcutId) {
    if (!registeredShortcuts.has(shortcutId)) {
      return;
    }
    warn("keyboardManager.registerShortcut.conflict", { shortcutId });
    unregister(shortcutId);
  }

  function createEventHandler(shortcutId, parsed, handler, { preventDefault, stopPropagation }) {
    return (event) => {
      if (!matchesShortcut(event, parsed)) {
        return;
      }

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
    };
  }

  function bindShortcutTarget(shortcutId, definition, target) {
    const eventHandler = createEventHandler(shortcutId, definition.parsed, definition.handler, {
      preventDefault: definition.preventDefault,
      stopPropagation: definition.stopPropagation,
    });

    if (target && typeof target.addEventListener === "function") {
      target.addEventListener("keydown", eventHandler);
    }

    return {
      target: target || null,
      cleanup() {
        if (target && typeof target.removeEventListener === "function") {
          target.removeEventListener("keydown", eventHandler);
        }
      },
    };
  }

  async function waitForReadySignal(ready) {
    if (ready === undefined) {
      return;
    }
    const value = typeof ready === "function" ? ready() : ready;
    if (value && typeof value.then === "function") {
      await value;
    }
  }

  async function resolveDeferredWindow(source, fallbackTarget) {
    const candidate = source === undefined ? fallbackTarget : source;
    const value = typeof candidate === "function" ? candidate() : candidate;
    if (value && typeof value.then === "function") {
      return await value;
    }
    return value || null;
  }

  function settleShortcutBinding(registration, snapshot = null) {
    registration?.bindingTracker?.settle(snapshot);
    return snapshot;
  }

  /**
   * 注册快捷键
   * @param {Object} shortcutOptions - 快捷键配置
   * @returns {string|null} 快捷键 ID
   */
  function registerShortcut(shortcutOptions) {
    const definition = createShortcutDefinition(shortcutOptions, "keyboardManager.registerShortcut");
    if (!definition) {
      return null;
    }

    ensureNoShortcutConflict(definition.shortcutId);
    const bindingTracker = createBindingTracker();

    try {
      const target = definition.targetWindow || (typeof window !== "undefined" ? window : null);
      const binding = bindShortcutTarget(definition.shortcutId, definition, target);
      const registration = replaceShortcutRegistration(definition.shortcutId, {
        parsed: definition.parsed,
        description: definition.description,
        handler: definition.handler,
        cleanup: binding.cleanup,
        window: binding.target,
        state: binding.target ? "active" : "inactive",
        bindingMode: "immediate",
        errorMessage: null,
        bindingTracker,
      });

      const snapshot = createShortcutSnapshot(definition.shortcutId, registration);
      settleShortcutBinding(registration, snapshot);

      debug("keyboardManager.registerShortcut.created", {
        shortcutId: definition.shortcutId,
        key: definition.parsed.key,
        modifiers: definition.parsed.modifiers,
      });
      return definition.shortcutId;
    } catch (err) {
      error("keyboardManager.registerShortcut.failed", {
        message: String(err?.message || err),
      });
      bindingTracker.settle(null);
      return null;
    }
  }

  function registerDeferredShortcut(shortcutOptions) {
    const definition = createShortcutDefinition(shortcutOptions, "keyboardManager.registerDeferredShortcut");
    if (!definition) {
      return null;
    }

    ensureNoShortcutConflict(definition.shortcutId);
    const bindingTracker = createBindingTracker();
    replaceShortcutRegistration(definition.shortcutId, {
      parsed: definition.parsed,
      description: definition.description,
      handler: definition.handler,
      cleanup: () => {},
      window: null,
      state: "pending",
      bindingMode: "deferred",
      errorMessage: null,
      bindingTracker,
    });

    Promise.resolve().then(async () => {
      try {
        await waitForReadySignal(definition.ready);

        if (!registeredShortcuts.has(definition.shortcutId)) {
          bindingTracker.settle(null);
          return;
        }

        const fallbackWindow = definition.targetWindow || (typeof window !== "undefined" ? window : null);
        const target = await resolveDeferredWindow(definition.resolveWindow, fallbackWindow);

        if (!registeredShortcuts.has(definition.shortcutId)) {
          bindingTracker.settle(null);
          return;
        }

        const binding = bindShortcutTarget(definition.shortcutId, definition, target);
        const registration = updateShortcutRegistration(definition.shortcutId, {
          cleanup: binding.cleanup,
          window: binding.target,
          state: binding.target ? "active" : "inactive",
          errorMessage: null,
        });
        const snapshot = createShortcutSnapshot(definition.shortcutId, registration);
        settleShortcutBinding(registration, snapshot);

        debug("keyboardManager.registerDeferredShortcut.ready", {
          shortcutId: definition.shortcutId,
          state: registration?.state || "missing",
        });
      } catch (err) {
        const registration = updateShortcutRegistration(definition.shortcutId, {
          cleanup: () => {},
          window: null,
          state: "failed",
          errorMessage: String(err?.message || err),
        });
        error("keyboardManager.registerDeferredShortcut.failed", {
          shortcutId: definition.shortcutId,
          message: String(err?.message || err),
        });
        settleShortcutBinding(registration, createShortcutSnapshot(definition.shortcutId, registration));
      }
    });

    return definition.shortcutId;
  }

  function waitForShortcutBinding(shortcutId) {
    const registration = registeredShortcuts.get(shortcutId);
    if (!registration) {
      return Promise.resolve(null);
    }
    return registration.bindingTracker?.promise || Promise.resolve(createShortcutSnapshot(shortcutId, registration));
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
      settleShortcutBinding(registration, null);

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
    return Array.from(registeredShortcuts.entries())
      .map(([shortcutId, registration]) => createShortcutSnapshot(shortcutId, registration))
      .filter(Boolean)
      .sort((left, right) => String(left?.id || "").localeCompare(String(right?.id || ""), "en"));
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

    parts.push(String(key || "").toUpperCase());
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
    registerDeferredShortcut,
    waitForShortcutBinding,
    unregister,
    unregisterAll,

    // 查询方法
    getShortcutCount,
    hasShortcut,
    getShortcutState,
    getAllShortcuts,

    // 工具方法
    parseShortcut,
    formatShortcut,
    normalizeModifiers,

    // 常量
    MODIFIERS,
  };
}
