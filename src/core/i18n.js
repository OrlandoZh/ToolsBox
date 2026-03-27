/**
 * 国际化模块
 * 提供本地化字符串管理，支持变量插值
 */

const STRINGS = {
  "en-US": {
    "cleanroom-menu-label": "Open Cleanroom Action",
    "cleanroom-dialog-title": "Cleanroom Template",
    "cleanroom-dialog-body": "Plugin command executed successfully.",
    "cleanroom-command-label": "Open Cleanroom Action",
    "cleanroom-command-description": "Run the default clean-room template action.",
    "cleanroom-command-disabled": "Plugin is disabled. Re-enable it in preferences first.",
    "cleanroom-shortcut-description": "Show the clean-room shortcut demo toast.",
    "cleanroom-shortcut-toast-title": "Cleanroom Shortcut",
    "cleanroom-shortcut-toast-body": "Triggered {shortcut} {count} times.",
    "cleanroom-demo-section-title": "Cleanroom Demo",
    "cleanroom-demo-field-item": "Item",
    "cleanroom-demo-field-shortcut": "Shortcut",
    "cleanroom-demo-field-notifier": "Notifier",
    "cleanroom-demo-field-status": "Status",
    "cleanroom-demo-no-selection": "No item selected.",
    "cleanroom-demo-untitled": "Untitled item",
    "cleanroom-demo-notifier-idle": "No notifier event yet.",
    "cleanroom-demo-status-ready": "Baseline demos ready",
    "cleanroom-item-tree-label": "Cleanroom",
    "cleanroom-reader-menu-label": "Show Reader Demo Summary",
    "cleanroom-reader-command-description": "Show the active reader summary.",
    "cleanroom-reader-toast-title": "Cleanroom Reader",
    "cleanroom-reader-no-active": "No active reader tab.",
    "cleanroom-reader-toast-body": "{type} reader for item #{itemID} with {annotations} annotations.",
    "cleanroom-pref-caption": "Cleanroom Template Preferences",
    "cleanroom-pref-enabled": "Enable plugin",
    "cleanroom-pref-menu-label": "Menu label",
    "cleanroom-pref-menu-hint": "Leave empty to use localized default.",
    "cleanroom-pref-log-level": "Log level",
    // 带变量的示例字符串
    "item-count": "You have {count} items.",
    "greeting": "Hello, {name}!",
    "progress-status": "Processing {current} of {total}...",
    "items-selected": "{count} items selected.",
  },
  "zh-CN": {
    "cleanroom-menu-label": "打开 Cleanroom 动作",
    "cleanroom-dialog-title": "Cleanroom 模板",
    "cleanroom-dialog-body": "插件命令执行成功。",
    "cleanroom-command-label": "打开 Cleanroom 动作",
    "cleanroom-command-description": "执行默认的 clean-room 模板动作。",
    "cleanroom-command-disabled": "插件当前已禁用，请先在首选项中重新启用。",
    "cleanroom-shortcut-description": "显示 clean-room 快捷键示例提示。",
    "cleanroom-shortcut-toast-title": "Cleanroom 快捷键",
    "cleanroom-shortcut-toast-body": "已触发 {shortcut} {count} 次。",
    "cleanroom-demo-section-title": "Cleanroom 示例",
    "cleanroom-demo-field-item": "条目",
    "cleanroom-demo-field-shortcut": "快捷键",
    "cleanroom-demo-field-notifier": "监听器",
    "cleanroom-demo-field-status": "状态",
    "cleanroom-demo-no-selection": "当前没有选中条目。",
    "cleanroom-demo-untitled": "未命名条目",
    "cleanroom-demo-notifier-idle": "还没有监听到事件。",
    "cleanroom-demo-status-ready": "基线示例已就绪",
    "cleanroom-item-tree-label": "Cleanroom",
    "cleanroom-reader-menu-label": "显示 Reader 示例摘要",
    "cleanroom-reader-command-description": "显示当前激活 reader 的摘要。",
    "cleanroom-reader-toast-title": "Cleanroom Reader",
    "cleanroom-reader-no-active": "当前没有激活的 reader 标签页。",
    "cleanroom-reader-toast-body": "{type} 阅读器，条目 #{itemID}，包含 {annotations} 条批注。",
    "cleanroom-pref-caption": "Cleanroom 模板首选项",
    "cleanroom-pref-enabled": "启用插件",
    "cleanroom-pref-menu-label": "菜单标签",
    "cleanroom-pref-menu-hint": "留空使用默认本地化文案。",
    "cleanroom-pref-log-level": "日志等级",
    // 带变量的示例字符串
    "item-count": "你有 {count} 个条目。",
    "greeting": "你好，{name}！",
    "progress-status": "正在处理 {current}/{total}...",
    "items-selected": "已选择 {count} 个条目。",
  },
};

/**
 * 读取系统语言设置
 * @returns {string} 语言代码
 */
function readLocale() {
  try {
    const locale = Services.locale?.appLocaleAsBCP47;
    if (locale) {
      return locale;
    }
  } catch {}

  try {
    const list = Services.locale?.requestedLocales;
    if (Array.isArray(list) && list.length > 0) {
      return list[0];
    }
  } catch {}

  try {
    const pref = Services.prefs.getCharPref("intl.locale.requested");
    if (pref) {
      return pref;
    }
  } catch {}

  return "en-US";
}

/**
 * 标准化语言代码
 * @param {string} locale - 原始语言代码
 * @returns {string} 标准化后的语言代码
 */
function normalizeLocale(locale) {
  if (!locale) {
    return "en-US";
  }

  const normalized = locale.replace("_", "-");

  // 中文变体统一映射到 zh-CN
  if (normalized.toLowerCase().startsWith("zh")) {
    return "zh-CN";
  }

  // 检查是否有对应的字符串包
  if (STRINGS[normalized]) {
    return normalized;
  }

  // 尝试匹配主语言代码（如 en-US -> en）
  const mainLang = normalized.split("-")[0];
  for (const key of Object.keys(STRINGS)) {
    if (key.startsWith(mainLang)) {
      return key;
    }
  }

  return "en-US";
}

/**
 * 变量插值：替换模板中的 {variable} 占位符
 * @param {string} template - 模板字符串
 * @param {Object} [args] - 变量对象
 * @returns {string} 插值后的字符串
 */
function interpolate(template, args) {
  if (!template || typeof template !== "string") {
    return template || "";
  }

  if (!args || typeof args !== "object") {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key) => {
    if (args[key] !== undefined && args[key] !== null) {
      return String(args[key]);
    }
    // 变量缺失时保留占位符
    return `{${key}}`;
  });
}

/**
 * 复数形式选择（简化版，支持 'one' | 'other'）
 * @param {number} count - 数量
 * @param {Object} forms - 复数形式 { one, other }
 * @returns {string} 对应形式
 */
function plural(count, forms) {
  if (!forms || typeof forms !== "object") {
    return "";
  }
  // 简化逻辑：1 用 'one'，其他用 'other'
  const form = count === 1 ? forms.one : forms.other;
  return form || forms.other || "";
}

/**
 * 检查键是否存在
 * @param {string} key - 字符串键
 * @param {Object} bundle - 字符串包
 * @returns {boolean} 是否存在
 */
function hasKey(key, bundle) {
  return Boolean(bundle && Object.prototype.hasOwnProperty.call(bundle, key));
}

/**
 * 创建国际化实例
 * @param {Object} [options] - 配置选项
 * @param {string} [options.locale] - 强制指定语言
 * @param {Object} [options.strings] - 自定义字符串包
 * @returns {Object} 国际化实例
 */
export function createI18n(options = {}) {
  const { locale: forcedLocale, strings: customStrings } = options;

  // 确定使用的语言
  const locale = forcedLocale
    ? normalizeLocale(forcedLocale)
    : normalizeLocale(readLocale());

  // 合并字符串包：自定义 > 本地化 > 默认
  const baseBundle = STRINGS[locale] || STRINGS["en-US"];
  const fallbackBundle = STRINGS["en-US"];
  const bundle = customStrings
    ? { ...fallbackBundle, ...baseBundle, ...customStrings }
    : baseBundle;

  return {
    /** 当前语言 */
    locale,

    /**
     * 获取本地化字符串（支持变量插值）
     * @param {string} key - 字符串键
     * @param {Object|string} [argsOrFallback] - 变量对象 或 回退字符串
     * @param {string} [fallback] - 回退字符串（当第二个参数是对象时使用）
     * @returns {string} 本地化字符串
     *
     * @example
     * // 基础用法
     * i18n.t('greeting')  // "Hello, {name}!"
     *
     * @example
     * // 带变量
     * i18n.t('greeting', { name: 'World' })  // "Hello, World!"
     *
     * @example
     * // 带回退值
     * i18n.t('missing-key', 'Default Value')  // "Default Value"
     *
     * @example
     * // 带变量和回退值
     * i18n.t('greeting', { name: 'World' }, 'Hello!')  // "Hello, World!"
     */
    t(key, argsOrFallback, fallback) {
      // 参数处理：支持 t(key), t(key, fallback), t(key, args), t(key, args, fallback)
      let args = null;
      let fallbackValue = key;

      if (typeof argsOrFallback === "string") {
        // t(key, fallback) 形式
        fallbackValue = argsOrFallback;
      } else if (typeof argsOrFallback === "object") {
        // t(key, args) 或 t(key, args, fallback) 形式
        args = argsOrFallback;
        if (typeof fallback === "string") {
          fallbackValue = fallback;
        }
      }

      // 获取原始字符串
      let template = bundle[key] || fallbackBundle[key] || fallbackValue;

      // 变量插值
      if (args) {
        template = interpolate(template, args);
      }

      return template;
    },

    /**
     * 检查键是否存在
     * @param {string} key - 字符串键
     * @returns {boolean} 是否存在
     */
    has(key) {
      return hasKey(key, bundle) || hasKey(key, fallbackBundle);
    },

    /**
     * 获取原始模板（不进行插值）
     * @param {string} key - 字符串键
     * @param {string} [fallback] - 回退字符串
     * @returns {string} 原始模板
     */
    raw(key, fallback = "") {
      return bundle[key] || fallbackBundle[key] || fallback || key;
    },

    /**
     * 获取复数形式的字符串
     * @param {string} key - 字符串键
     * @param {number} count - 数量
     * @param {Object} [args] - 额外变量
     * @returns {string} 本地化字符串
     *
     * @example
     * // 字符串包中定义：
     * // "items_one": "{count} item selected."
     * // "items_other": "{count} items selected."
     * i18n.tn('items', 1)  // "1 item selected."
     * i18n.tn('items', 5)  // "5 items selected."
     */
    tn(key, count, args) {
      // 尝试获取复数形式键
      const pluralKey = `${key}_${count === 1 ? "one" : "other"}`;
      let template = bundle[pluralKey] || fallbackBundle[pluralKey];

      // 如果没有复数形式，使用基础键
      if (!template) {
        template = bundle[key] || fallbackBundle[key] || key;
      }

      // 合并 count 到 args
      const mergedArgs = { ...args, count };
      return interpolate(template, mergedArgs);
    },

    /**
     * 获取所有可用的键
     * @returns {string[]} 键数组
     */
    keys() {
      const allKeys = new Set([
        ...Object.keys(bundle),
        ...Object.keys(fallbackBundle),
      ]);
      return Array.from(allKeys);
    },

    /**
     * 获取原始字符串包（只读副本）
     * @returns {Object} 字符串包
     */
    getBundle() {
      return { ...bundle };
    },

    /** 插值工具函数 */
    interpolate,

    /** 复数工具函数 */
    plural,
  };
}

// 导出工具函数供外部使用
export { interpolate, plural };
