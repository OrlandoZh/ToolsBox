/**
 * 命令面板集成模块
 * 提供 Zotero 命令面板注册和管理功能
 */

/**
 * 创建命令面板管理器
 * @param {Object} options - 配置选项
 * @param {Object} options.logger - 日志记录器
 * @param {Object} options.lifecycle - 生命周期管理器
 * @param {Object} options.i18n - 国际化实例
 * @param {string} options.pluginID - 插件 ID
 * @param {Object} [options.zotero] - Zotero 全局对象
 * @returns {Object} 命令面板管理器实例
 */
export function createCommandPalette(options) {
  const { logger, lifecycle, i18n, pluginID, zotero } = options;

  // 获取 Zotero 全局对象
  const Zotero = zotero || (typeof globalThis !== "undefined" && globalThis.Zotero);

  // 注册追踪
  const registeredCommands = new Map();
  let commandCounter = 0;

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
   * 检查命令面板 API 是否可用
   * 注意：Zotero 的命令面板 API 可能因版本而异
   * @returns {boolean}
   */
  function isAvailable() {
    // Zotero 7+ 使用 Zotero.Prompt
    return Boolean(
      Zotero && (
        (Zotero.Prompt && typeof Zotero.Prompt.register === "function") ||
        (Zotero.QuickCopy && typeof Zotero.QuickCopy.getFormatFromURL === "function")
      )
    );
  }

  /**
   * 注册命令
   * @param {Object} commandOptions - 命令配置
   * @param {string} [commandOptions.id] - 命令 ID
   * @param {string} commandOptions.label - 命令标签（显示名称）
   * @param {string} [commandOptions.category] - 命令分类
   * @param {string} [commandOptions.description] - 命令描述
   * @param {Function} commandOptions.handler - 命令处理函数
   * @param {Function} [commandOptions.condition] - 显示条件 () => boolean
   * @param {string} [commandOptions.shortcut] - 快捷键（可选）
   * @param {string} [commandOptions.icon] - 图标路径（可选）
   * @returns {string|null} 命令 ID
   */
  function registerCommand(commandOptions) {
    const {
      id: customId,
      label,
      category = "Plugin",
      description = "",
      handler,
      condition,
      shortcut,
      icon,
    } = commandOptions;

    if (!label) {
      error("commandPalette.registerCommand.noLabel", {});
      return null;
    }

    if (typeof handler !== "function") {
      error("commandPalette.registerCommand.noHandler", {});
      return null;
    }

    const commandId = customId || `command-${++commandCounter}`;

    try {
      // Zotero 7+ Prompt API
      if (Zotero && Zotero.Prompt && typeof Zotero.Prompt.register === "function") {
        const config = {
          id: commandId,
          label,
          category,
        };

        // 显示条件
        if (typeof condition === "function") {
          config.when = condition;
        }

        // 回调
        config.callback = (prompt) => {
          try {
            handler(prompt);
          } catch (err) {
            error("commandPalette.handler.error", {
              commandId,
              message: String(err?.message || err),
            });
          }
        };

        Zotero.Prompt.register([config]);

        registeredCommands.set(commandId, {
          type: "prompt",
          config,
        });

        debug("commandPalette.registerCommand.prompt", { commandId, label });

        return commandId;
      }

      // 降级：存储配置，等待其他机制触发
      registeredCommands.set(commandId, {
        type: "fallback",
        config: {
          label,
          category,
          description,
          handler,
          condition,
          shortcut,
          icon,
        },
      });

      debug("commandPalette.registerCommand.fallback", { commandId, label });

      return commandId;
    } catch (err) {
      error("commandPalette.registerCommand.failed", {
        message: String(err?.message || err),
      });
      return null;
    }
  }

  /**
   * 注册匿名命令（显示当前上下文相关选项）
   * @param {Object} commandOptions - 命令配置
   * @param {string} commandOptions.id - 命令 ID（通常是 'search' 等）
   * @param {Function} commandOptions.handler - 处理函数 (prompt) => void
   * @returns {string|null} 命令 ID
   */
  function registerAnonymousCommand(commandOptions) {
    const { id = "search", handler } = commandOptions;

    if (typeof handler !== "function") {
      error("commandPalette.registerAnonymousCommand.noHandler", {});
      return null;
    }

    const commandId = `anonymous-${id}`;

    try {
      if (Zotero && Zotero.Prompt && typeof Zotero.Prompt.register === "function") {
        Zotero.Prompt.register([
          {
            id,
            callback: (prompt) => {
              try {
                handler(prompt);
              } catch (err) {
                error("commandPalette.anonymousHandler.error", {
                  commandId,
                  message: String(err?.message || err),
                });
              }
            },
          },
        ]);

        registeredCommands.set(commandId, {
          type: "anonymous",
          id,
        });

        debug("commandPalette.registerAnonymousCommand.created", { commandId });

        return commandId;
      }

      return null;
    } catch (err) {
      error("commandPalette.registerAnonymousCommand.failed", {
        message: String(err?.message || err),
      });
      return null;
    }
  }

  /**
   * 注销命令
   * @param {string} commandId - 命令 ID
   * @returns {boolean} 是否成功
   */
  function unregisterCommand(commandId) {
    const registration = registeredCommands.get(commandId);
    if (!registration) {
      return false;
    }

    try {
      // Prompt API 目前没有 unregister 方法，命令会在插件禁用时自动清理
      registeredCommands.delete(commandId);

      debug("commandPalette.unregisterCommand.removed", { commandId });
      return true;
    } catch (err) {
      error("commandPalette.unregisterCommand.failed", {
        commandId,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 注销所有命令
   */
  function unregisterAll() {
    const count = registeredCommands.size;
    registeredCommands.forEach((_, id) => {
      unregisterCommand(id);
    });
    debug("commandPalette.unregisterAll", { count });
  }

  /**
   * 获取注册的命令数量
   * @returns {number}
   */
  function getCommandCount() {
    return registeredCommands.size;
  }

  /**
   * 检查命令是否已注册
   * @param {string} commandId - 命令 ID
   * @returns {boolean}
   */
  function hasCommand(commandId) {
    return registeredCommands.has(commandId);
  }

  /**
   * 获取所有已注册的命令
   * @returns {Array<{id: string, label: string, category: string}>}
   */
  function getAllCommands() {
    const result = [];
    registeredCommands.forEach((reg, id) => {
      result.push({
        id,
        label: reg.config?.label || "",
        category: reg.config?.category || "",
      });
    });
    return result;
  }

  /**
   * 执行命令
   * @param {string} commandId - 命令 ID
   * @param {Object} [context] - 上下文对象
   * @returns {boolean} 是否成功
   */
  function executeCommand(commandId, context = {}) {
    const registration = registeredCommands.get(commandId);
    if (!registration || !registration.config?.handler) {
      return false;
    }

    try {
      registration.config.handler(context);
      return true;
    } catch (err) {
      error("commandPalette.executeCommand.error", {
        commandId,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  // 如果提供了 lifecycle，注册自动清理
  if (lifecycle && typeof lifecycle.trackCleanup === "function") {
    lifecycle.trackCleanup(unregisterAll);
  }

  return {
    // 状态检查
    isAvailable,

    // 注册方法
    registerCommand,
    registerAnonymousCommand,

    // 注销方法
    unregisterCommand,
    unregisterAll,

    // 查询方法
    getCommandCount,
    hasCommand,
    getAllCommands,

    // 执行方法
    executeCommand,
  };
}
