/**
 * 受保护导出专用国际化模块
 * 保留相同键集，但把高层架构/演示导向词汇收敛为更中性的 copy。
 */

const STRINGS = {
  "en-US": {
    "cleanroom-menu-label": "Open Tool",
    "cleanroom-dialog-title": "Tool",
    "cleanroom-dialog-body": "Action completed.",
    "cleanroom-command-label": "Open Tool",
    "cleanroom-command-description": "Run the default action.",
    "cleanroom-command-disabled": "This tool is disabled. Re-enable it in preferences first.",
    "cleanroom-shortcut-description": "Show the shortcut status toast.",
    "cleanroom-shortcut-toast-title": "Shortcut",
    "cleanroom-shortcut-toast-body": "Triggered {shortcut} {count} times.",
    "cleanroom-demo-section-title": "Overview",
    "cleanroom-demo-field-item": "Entry",
    "cleanroom-demo-field-shortcut": "Shortcut",
    "cleanroom-demo-field-notifier": "Activity",
    "cleanroom-demo-field-status": "Status",
    "cleanroom-demo-no-selection": "No selection.",
    "cleanroom-demo-untitled": "Untitled",
    "cleanroom-demo-notifier-idle": "No recent event.",
    "cleanroom-demo-status-ready": "Ready",
    "cleanroom-item-tree-label": "Status",
    "cleanroom-reader-menu-label": "Open Current View",
    "cleanroom-reader-command-description": "Open the current view summary.",
    "cleanroom-reader-selection-command-label": "Open Current Snapshot",
    "cleanroom-reader-selection-command-description": "Inspect the current selection.",
    "cleanroom-reader-toast-title": "Current View",
    "cleanroom-reader-no-active": "No active view.",
    "cleanroom-reader-toast-body": "{type} view for item #{itemID} with {annotations} annotations.",
    "cleanroom-react-ui-demo-command-label": "Open Optional Panel",
    "cleanroom-react-ui-demo-command-description": "Open the optional panel window.",
    "cleanroom-react-ui-surface-title": "Optional Host Panel",
    "cleanroom-react-ui-surface-message": "This panel confirms the optional lane can mount inside the host surface.",
    "cleanroom-react-ui-surface-status": "Mounted in host section",
    "cleanroom-pref-caption": "Tool Preferences",
    "cleanroom-pref-enabled": "Enable tool",
    "cleanroom-pref-menu-section": "Menu",
    "cleanroom-pref-menu-label": "Menu label",
    "cleanroom-pref-menu-hint": "Leave empty to use the localized default.",
    "cleanroom-pref-logging-section": "Logging",
    "cleanroom-pref-log-level": "Log level",
    "cleanroom-pref-theme-section": "Theme",
    "cleanroom-pref-theme-mode": "Theme mode",
    "cleanroom-pref-theme-follow-host": "Follow Zotero",
    "cleanroom-pref-theme-light": "Light",
    "cleanroom-pref-theme-dark": "Dark",
    "cleanroom-pref-theme-hint": "Apply only to tool-owned UI surfaces, including this preference pane, without changing Zotero's global Appearance.",
    "item-count": "You have {count} items.",
    "greeting": "Hello, {name}!",
    "progress-status": "Processing {current} of {total}...",
    "items-selected": "{count} items selected.",
  },
  "zh-CN": {
    "cleanroom-menu-label": "打开工具",
    "cleanroom-dialog-title": "工具",
    "cleanroom-dialog-body": "操作已完成。",
    "cleanroom-command-label": "打开工具",
    "cleanroom-command-description": "执行默认动作。",
    "cleanroom-command-disabled": "该工具当前已禁用，请先在首选项中重新启用。",
    "cleanroom-shortcut-description": "显示快捷键状态提示。",
    "cleanroom-shortcut-toast-title": "快捷键",
    "cleanroom-shortcut-toast-body": "已触发 {shortcut} {count} 次。",
    "cleanroom-demo-section-title": "概览",
    "cleanroom-demo-field-item": "条目",
    "cleanroom-demo-field-shortcut": "快捷键",
    "cleanroom-demo-field-notifier": "活动",
    "cleanroom-demo-field-status": "状态",
    "cleanroom-demo-no-selection": "当前没有选中内容。",
    "cleanroom-demo-untitled": "未命名",
    "cleanroom-demo-notifier-idle": "暂无最近事件。",
    "cleanroom-demo-status-ready": "已就绪",
    "cleanroom-item-tree-label": "状态",
    "cleanroom-reader-menu-label": "打开当前视图",
    "cleanroom-reader-command-description": "打开当前视图摘要。",
    "cleanroom-reader-selection-command-label": "打开当前快照",
    "cleanroom-reader-selection-command-description": "检查当前选区。",
    "cleanroom-reader-toast-title": "当前视图",
    "cleanroom-reader-no-active": "当前没有激活视图。",
    "cleanroom-reader-toast-body": "{type} 视图，条目 #{itemID}，包含 {annotations} 条批注。",
    "cleanroom-react-ui-demo-command-label": "打开可选面板",
    "cleanroom-react-ui-demo-command-description": "打开可选面板窗口。",
    "cleanroom-react-ui-surface-title": "可选宿主面板",
    "cleanroom-react-ui-surface-message": "该面板用于验证可选界面可挂载到宿主 surface。",
    "cleanroom-react-ui-surface-status": "已挂载到宿主 section",
    "cleanroom-pref-caption": "工具首选项",
    "cleanroom-pref-enabled": "启用工具",
    "cleanroom-pref-menu-section": "菜单",
    "cleanroom-pref-menu-label": "菜单标签",
    "cleanroom-pref-menu-hint": "留空使用默认本地化文案。",
    "cleanroom-pref-logging-section": "日志",
    "cleanroom-pref-log-level": "日志等级",
    "cleanroom-pref-theme-section": "主题",
    "cleanroom-pref-theme-mode": "主题模式",
    "cleanroom-pref-theme-follow-host": "跟随 Zotero",
    "cleanroom-pref-theme-light": "浅色",
    "cleanroom-pref-theme-dark": "深色",
    "cleanroom-pref-theme-hint": "仅作用于工具拥有的界面，包括当前偏好设置面板，不会改变 Zotero 的全局外观。",
    "item-count": "你有 {count} 个条目。",
    "greeting": "你好，{name}！",
    "progress-status": "正在处理 {current}/{total}...",
    "items-selected": "已选择 {count} 个条目。",
  },
  "zh-TW": {
    "cleanroom-menu-label": "開啟工具",
    "cleanroom-dialog-title": "工具",
    "cleanroom-dialog-body": "操作已完成。",
    "cleanroom-command-label": "開啟工具",
    "cleanroom-command-description": "執行預設動作。",
    "cleanroom-command-disabled": "該工具目前已停用，請先在偏好設定中重新啟用。",
    "cleanroom-shortcut-description": "顯示快捷鍵狀態提示。",
    "cleanroom-shortcut-toast-title": "快捷鍵",
    "cleanroom-shortcut-toast-body": "已觸發 {shortcut} {count} 次。",
    "cleanroom-demo-section-title": "概覽",
    "cleanroom-demo-field-item": "條目",
    "cleanroom-demo-field-shortcut": "快捷鍵",
    "cleanroom-demo-field-notifier": "活動",
    "cleanroom-demo-field-status": "狀態",
    "cleanroom-demo-no-selection": "目前沒有選取內容。",
    "cleanroom-demo-untitled": "未命名",
    "cleanroom-demo-notifier-idle": "暫無最近事件。",
    "cleanroom-demo-status-ready": "已就緒",
    "cleanroom-item-tree-label": "狀態",
    "cleanroom-reader-menu-label": "開啟目前視圖",
    "cleanroom-reader-command-description": "開啟目前視圖摘要。",
    "cleanroom-reader-selection-command-label": "開啟目前快照",
    "cleanroom-reader-selection-command-description": "檢查目前選區。",
    "cleanroom-reader-toast-title": "目前視圖",
    "cleanroom-reader-no-active": "目前沒有啟用視圖。",
    "cleanroom-reader-toast-body": "{type} 視圖，條目 #{itemID}，包含 {annotations} 則批註。",
    "cleanroom-react-ui-demo-command-label": "開啟可選面板",
    "cleanroom-react-ui-demo-command-description": "開啟可選面板視窗。",
    "cleanroom-react-ui-surface-title": "可選宿主面板",
    "cleanroom-react-ui-surface-message": "該面板用於驗證可選介面可掛載到宿主 surface。",
    "cleanroom-react-ui-surface-status": "已掛載到宿主 section",
    "cleanroom-pref-caption": "工具偏好設定",
    "cleanroom-pref-enabled": "啟用工具",
    "cleanroom-pref-menu-section": "選單",
    "cleanroom-pref-menu-label": "選單標籤",
    "cleanroom-pref-menu-hint": "留空時使用預設本地化文案。",
    "cleanroom-pref-logging-section": "日誌",
    "cleanroom-pref-log-level": "日誌等級",
    "cleanroom-pref-theme-section": "主題",
    "cleanroom-pref-theme-mode": "主題模式",
    "cleanroom-pref-theme-follow-host": "跟隨 Zotero",
    "cleanroom-pref-theme-light": "淺色",
    "cleanroom-pref-theme-dark": "深色",
    "cleanroom-pref-theme-hint": "僅作用於工具擁有的介面，包括目前偏好設定面板，不會改變 Zotero 的全域外觀。",
    "item-count": "你有 {count} 個條目。",
    "greeting": "你好，{name}！",
    "progress-status": "正在處理 {current}/{total}...",
    "items-selected": "已選取 {count} 個條目。",
  },
};

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

function normalizeLocale(locale) {
  if (!locale) {
    return "en-US";
  }

  const normalized = locale.replace("_", "-");
  const lowered = normalized.toLowerCase();

  if (lowered.startsWith("zh")) {
    if (
      lowered.includes("-tw")
      || lowered.includes("-hk")
      || lowered.includes("-mo")
      || lowered.includes("-hant")
    ) {
      return "zh-TW";
    }
    return "zh-CN";
  }

  if (STRINGS[normalized]) {
    return normalized;
  }

  const mainLang = normalized.split("-")[0];
  for (const key of Object.keys(STRINGS)) {
    if (key.startsWith(mainLang)) {
      return key;
    }
  }

  return "en-US";
}

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
    return `{${key}}`;
  });
}

function hasKey(key, bundle) {
  return Boolean(bundle && Object.prototype.hasOwnProperty.call(bundle, key));
}

export function createI18n(options = {}) {
  const { locale: forcedLocale, strings: customStrings } = options;

  const locale = forcedLocale
    ? normalizeLocale(forcedLocale)
    : normalizeLocale(readLocale());

  const baseBundle = STRINGS[locale] || STRINGS["en-US"];
  const fallbackBundle = STRINGS["en-US"];
  const bundle = customStrings
    ? { ...fallbackBundle, ...baseBundle, ...customStrings }
    : baseBundle;

  return {
    locale,
    t(key, argsOrFallback, fallback) {
      let args = null;
      let fallbackValue = key;

      if (typeof argsOrFallback === "string") {
        fallbackValue = argsOrFallback;
      } else if (typeof argsOrFallback === "object") {
        args = argsOrFallback;
        if (typeof fallback === "string") {
          fallbackValue = fallback;
        }
      }

      let template = bundle[key] || fallbackBundle[key] || fallbackValue;
      if (args) {
        template = interpolate(template, args);
      }

      return template;
    },
    has(key) {
      return hasKey(key, bundle) || hasKey(key, fallbackBundle);
    },
    raw(key, fallback = "") {
      return bundle[key] || fallbackBundle[key] || fallback || key;
    },
    tn(key, count, args) {
      const pluralKey = `${key}_${count === 1 ? "one" : "other"}`;
      let template = bundle[pluralKey] || fallbackBundle[pluralKey];
      if (!template) {
        template = bundle[key] || fallbackBundle[key] || key;
      }
      return interpolate(template, { ...args, count });
    },
    keys() {
      const allKeys = new Set([
        ...Object.keys(bundle),
        ...Object.keys(fallbackBundle),
      ]);
      return Array.from(allKeys);
    },
    getBundle() {
      return JSON.parse(JSON.stringify(bundle));
    },
  };
}
