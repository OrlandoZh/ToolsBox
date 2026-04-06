/**
 * 命令面板集成模块
 * 提供 Zotero 命令面板注册和管理功能
 */

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeStringArray(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeString(value))
      .filter(Boolean),
  ));
}

function normalizeSearchTerms(query) {
  return normalizeString(query)
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean);
}

function createCommandDescriptor(commandId, commandOptions = {}, { searchable = true } = {}) {
  return {
    id: commandId,
    label: normalizeString(commandOptions.label),
    category: normalizeString(commandOptions.category) || "Plugin",
    description: normalizeString(commandOptions.description),
    handler: commandOptions.handler,
    condition: typeof commandOptions.condition === "function"
      ? commandOptions.condition
      : null,
    shortcut: normalizeString(commandOptions.shortcut),
    icon: normalizeString(commandOptions.icon),
    aliases: normalizeStringArray(commandOptions.aliases),
    keywords: normalizeStringArray(commandOptions.keywords),
    searchable,
  };
}

function sortSnapshots(left, right) {
  return String(left?.label || "").localeCompare(String(right?.label || ""), "en")
    || String(left?.id || "").localeCompare(String(right?.id || ""), "en");
}

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

  function getCommandDescriptor(commandId) {
    const registration = registeredCommands.get(commandId);
    return registration?.descriptor || null;
  }

  function evaluateCommandCondition(descriptor, context = {}) {
    if (!descriptor || typeof descriptor !== "object") {
      return false;
    }
    if (typeof descriptor.condition !== "function") {
      return true;
    }
    try {
      return descriptor.condition(context) !== false;
    } catch (err) {
      error("commandPalette.condition.error", {
        commandId: descriptor.id,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  function createCommandSnapshot(descriptor, type, context = {}) {
    if (!descriptor || typeof descriptor !== "object") {
      return null;
    }
    return {
      id: descriptor.id,
      label: descriptor.label,
      category: descriptor.category,
      description: descriptor.description,
      shortcut: descriptor.shortcut || null,
      icon: descriptor.icon || null,
      aliases: descriptor.aliases.slice(),
      keywords: descriptor.keywords.slice(),
      enabled: evaluateCommandCondition(descriptor, context),
      searchable: descriptor.searchable !== false,
      type: type || "fallback",
    };
  }

  function buildCommandSearchScore(snapshot, query) {
    const terms = normalizeSearchTerms(query);
    if (terms.length === 0) {
      return snapshot.enabled ? 10 : 1;
    }

    const exactValues = [
      snapshot.id,
      snapshot.label,
      ...snapshot.aliases,
    ]
      .map((value) => normalizeString(value).toLowerCase())
      .filter(Boolean);
    const prefixValues = [
      snapshot.label,
      snapshot.category,
      snapshot.id,
      ...snapshot.aliases,
      ...snapshot.keywords,
    ]
      .map((value) => normalizeString(value).toLowerCase())
      .filter(Boolean);
    const containsValues = [
      snapshot.label,
      snapshot.category,
      snapshot.description,
      snapshot.id,
      ...snapshot.aliases,
      ...snapshot.keywords,
    ]
      .map((value) => normalizeString(value).toLowerCase())
      .filter(Boolean);

    let score = 0;
    for (const term of terms) {
      let termScore = 0;
      if (exactValues.some((value) => value === term)) {
        termScore = 120;
      } else if (prefixValues.some((value) => value.startsWith(term))) {
        termScore = 80;
      } else if (containsValues.some((value) => value.includes(term))) {
        termScore = 40;
      }

      if (termScore === 0) {
        return 0;
      }
      score += termScore;
    }

    if (snapshot.enabled) {
      score += 5;
    }
    if (snapshot.shortcut) {
      score += 1;
    }
    return score;
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
   * @param {string[]} [commandOptions.aliases] - 搜索别名
   * @param {string[]} [commandOptions.keywords] - 搜索关键词
   * @param {string} [commandOptions.shortcut] - 快捷键（可选）
   * @param {string} [commandOptions.icon] - 图标路径（可选）
   * @returns {string|null} 命令 ID
   */
  function registerCommand(commandOptions) {
    const commandId = normalizeString(commandOptions?.id) || `command-${++commandCounter}`;
    const descriptor = createCommandDescriptor(commandId, commandOptions);

    if (!descriptor.label) {
      error("commandPalette.registerCommand.noLabel", {});
      return null;
    }

    if (typeof descriptor.handler !== "function") {
      error("commandPalette.registerCommand.noHandler", {});
      return null;
    }

    try {
      // Zotero 7+ Prompt API
      if (Zotero && Zotero.Prompt && typeof Zotero.Prompt.register === "function") {
        const config = {
          id: commandId,
          label: descriptor.label,
          category: descriptor.category,
        };

        if (typeof descriptor.condition === "function") {
          config.when = () => evaluateCommandCondition(descriptor);
        }

        config.callback = (prompt) => {
          try {
            descriptor.handler(prompt);
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
          descriptor,
          config,
        });

        debug("commandPalette.registerCommand.prompt", { commandId, label: descriptor.label });
        return commandId;
      }

      registeredCommands.set(commandId, {
        type: "fallback",
        descriptor,
        config: {
          label: descriptor.label,
          category: descriptor.category,
          description: descriptor.description,
          shortcut: descriptor.shortcut,
          icon: descriptor.icon,
        },
      });

      debug("commandPalette.registerCommand.fallback", { commandId, label: descriptor.label });
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
    const descriptor = createCommandDescriptor(commandId, {
      id: commandId,
      label: "",
      category: "",
      description: "",
      handler,
    }, {
      searchable: false,
    });

    try {
      if (Zotero && Zotero.Prompt && typeof Zotero.Prompt.register === "function") {
        const config = {
          id,
          callback: (prompt) => {
            try {
              descriptor.handler(prompt);
            } catch (err) {
              error("commandPalette.anonymousHandler.error", {
                commandId,
                message: String(err?.message || err),
              });
            }
          },
        };
        Zotero.Prompt.register([config]);

        registeredCommands.set(commandId, {
          type: "anonymous",
          descriptor,
          config,
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
    registeredCommands.forEach((registration, id) => {
      if (!registration?.descriptor?.label) {
        return;
      }
      result.push({
        id,
        label: registration.descriptor.label,
        category: registration.descriptor.category,
      });
    });
    return result.sort(sortSnapshots);
  }

  function getCommandSnapshot(commandId = null, context = {}) {
    if (typeof commandId === "string" && commandId.trim()) {
      const registration = registeredCommands.get(commandId);
      return registration
        ? createCommandSnapshot(registration.descriptor, registration.type, context)
        : null;
    }

    return Array.from(registeredCommands.values())
      .map((registration) => createCommandSnapshot(registration.descriptor, registration.type, context))
      .filter((snapshot) => snapshot?.label)
      .sort(sortSnapshots);
  }

  function searchCommands(query, context = {}, options = {}) {
    const includeDisabled = options?.includeDisabled === true;
    const limit = Number.isFinite(Number(options?.limit))
      ? Math.max(1, Math.trunc(Number(options.limit)))
      : null;

    const scored = getCommandSnapshot(null, context)
      .filter((snapshot) => snapshot?.searchable !== false)
      .map((snapshot) => ({
        snapshot,
        score: buildCommandSearchScore(snapshot, query),
      }))
      .filter((entry) => entry.score > 0)
      .filter((entry) => includeDisabled || entry.snapshot.enabled)
      .sort((left, right) => (
        right.score - left.score
        || Number(right.snapshot.enabled) - Number(left.snapshot.enabled)
        || sortSnapshots(left.snapshot, right.snapshot)
      ))
      .map((entry) => entry.snapshot);

    return limit ? scored.slice(0, limit) : scored;
  }

  /**
   * 执行命令
   * @param {string} commandId - 命令 ID
   * @param {Object} [context] - 上下文对象
   * @returns {boolean} 是否成功
   */
  function executeCommand(commandId, context = {}) {
    const descriptor = getCommandDescriptor(commandId);
    if (!descriptor || typeof descriptor.handler !== "function") {
      return false;
    }

    try {
      descriptor.handler(context);
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
    getCommandSnapshot,
    searchCommands,

    // 执行方法
    executeCommand,
  };
}
