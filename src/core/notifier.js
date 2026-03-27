/**
 * 事件通知管理器模块
 * 封装 Zotero.Notifier API，提供事件订阅和清理管理
 */

/**
 * 事件类型常量
 */
export const EVENT_TYPES = {
  ITEM: "item",
  COLLECTION: "collection",
  COLLECTION_ITEM: "collection-item",
  SEARCH: "search",
  TAG: "tag",
  ITEM_TAG: "item-tag",
  GROUP: "group",
  SETTING: "setting",
  TAB: "tab",
  FILE: "file",
};

/**
 * 事件动作常量
 */
export const EVENTS = {
  ADD: "add",
  MODIFY: "modify",
  DELETE: "delete",
  TRASH: "trash",
  REMOVE: "remove",
  MOVE: "move",
  REFRESH: "refresh",
  REDRAW: "redraw",
};

/**
 * 创建事件通知管理器
 * @param {Object} options - 配置选项
 * @param {Object} [options.logger] - 日志记录器
 * @param {Object} [options.lifecycle] - 生命周期管理器
 * @param {Object} [options.zotero] - Zotero 全局对象（用于测试注入）
 * @returns {Object} 通知管理器实例
 */
export function createNotifier({ logger, lifecycle, zotero } = {}) {
  // 获取 Zotero 全局对象
  const Zotero = zotero || (typeof globalThis !== "undefined" && globalThis.Zotero);

  // 订阅追踪
  const subscriptions = new Map();
  let subscriptionCounter = 0;

  /**
   * 记录调试信息
   * @param {string} message - 消息
   * @param {Object} [details] - 详情
   */
  function debug(message, details) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
    }
  }

  /**
   * 记录错误
   * @param {string} message - 消息
   * @param {Object} [details] - 详情
   */
  function error(message, details) {
    if (logger && typeof logger.error === "function") {
      logger.error(message, details);
    }
  }

  /**
   * 订阅 Zotero 事件
   * @param {Array<string>|string} types - 事件类型数组或单个类型
   * @param {Function} handler - 事件处理函数 (event, type, ids, extraData) => void
   * @param {Object} [options] - 配置选项
   * @param {string} [options.id] - 自定义订阅 ID
   * @param {number} [options.priority] - 回调优先级
   * @returns {string|null} 订阅 ID，失败返回 null
   */
  function subscribe(types, handler, options = {}) {
    if (!Zotero || !Zotero.Notifier) {
      error("notifier.subscribe.noZotero", {});
      return null;
    }

    if (typeof handler !== "function") {
      error("notifier.subscribe.invalidHandler", {});
      return null;
    }

    // 标准化 types 为数组
    const typeArray = Array.isArray(types) ? types : [types];
    if (typeArray.length === 0) {
      error("notifier.subscribe.noTypes", {});
      return null;
    }

    const { id: customId, priority } = options;
    const subscriptionId = customId || `notifier-${++subscriptionCounter}`;

    // 创建观察者对象
    const observer = {
      notify: async (event, type, ids, extraData) => {
        try {
          await handler(event, type, ids, extraData);
        } catch (err) {
          error("notifier.handler.error", {
            subscriptionId,
            event,
            type,
            message: String(err?.message || err),
          });
        }
      },
    };

    try {
      // 注册观察者
      const notifierId = Zotero.Notifier.registerObserver(
        observer,
        typeArray,
        subscriptionId,
        priority
      );

      // 追踪订阅
      subscriptions.set(subscriptionId, {
        notifierId,
        types: typeArray,
        handler,
      });

      debug("notifier.subscribe.created", {
        subscriptionId,
        types: typeArray.join(","),
      });

      return subscriptionId;
    } catch (err) {
      error("notifier.subscribe.failed", {
        message: String(err?.message || err),
      });
      return null;
    }
  }

  /**
   * 取消订阅
   * @param {string} subscriptionId - 订阅 ID
   * @returns {boolean} 是否成功
   */
  function unsubscribe(subscriptionId) {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription) {
      debug("notifier.unsubscribe.notFound", { subscriptionId });
      return false;
    }

    try {
      if (Zotero && Zotero.Notifier) {
        Zotero.Notifier.unregisterObserver(subscription.notifierId);
      }
      subscriptions.delete(subscriptionId);

      debug("notifier.unsubscribe.removed", { subscriptionId });
      return true;
    } catch (err) {
      error("notifier.unsubscribe.failed", {
        subscriptionId,
        message: String(err?.message || err),
      });
      return false;
    }
  }

  /**
   * 取消所有订阅
   */
  function unsubscribeAll() {
    const count = subscriptions.size;
    subscriptions.forEach((_, id) => {
      unsubscribe(id);
    });

    debug("notifier.unsubscribeAll", { count });
  }

  /**
   * 获取当前活跃的订阅数量
   * @returns {number} 订阅数量
   */
  function getActiveCount() {
    return subscriptions.size;
  }

  /**
   * 检查订阅是否存在
   * @param {string} subscriptionId - 订阅 ID
   * @returns {boolean} 是否存在
   */
  function has(subscriptionId) {
    return subscriptions.has(subscriptionId);
  }

  /**
   * 创建一次性订阅（触发一次后自动取消）
   * @param {Array<string>|string} types - 事件类型
   * @param {Function} handler - 事件处理函数
   * @param {Object} [options] - 配置选项
   * @returns {string|null} 订阅 ID
   */
  function once(types, handler, options = {}) {
    const wrappedHandler = async (event, type, ids, extraData) => {
      // 先取消订阅
      unsubscribe(subscriptionId);
      // 然后调用原始处理函数
      await handler(event, type, ids, extraData);
    };

    const subscriptionId = subscribe(types, wrappedHandler, options);
    return subscriptionId;
  }

  /**
   * 等待特定事件
   * @param {string} eventType - 事件类型 (如 'add', 'modify')
   * @param {string} objectType - 对象类型 (如 'item', 'collection')
   * @param {number} [timeout] - 超时时间（毫秒）
   * @returns {Promise<{ids: Array, extraData: Object}>} 事件数据
   */
  function waitFor(eventType, objectType, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribe(subscriptionId);
        reject(new Error(`notifier.waitFor.timeout: ${eventType}/${objectType}`));
      }, timeout);

      const subscriptionId = subscribe(objectType, (event, type, ids, extraData) => {
        if (event === eventType) {
          clearTimeout(timeoutId);
          unsubscribe(subscriptionId);
          resolve({ ids, extraData, type, event });
        }
      });

      if (!subscriptionId) {
        clearTimeout(timeoutId);
        reject(new Error("notifier.waitFor.subscribeFailed"));
      }
    });
  }

  // 如果提供了 lifecycle，注册自动清理
  if (lifecycle && typeof lifecycle.trackCleanup === "function") {
    lifecycle.trackCleanup(unsubscribeAll);
  }

  return {
    subscribe,
    unsubscribe,
    unsubscribeAll,
    once,
    waitFor,
    getActiveCount,
    has,
    EVENT_TYPES,
    EVENTS,
  };
}
