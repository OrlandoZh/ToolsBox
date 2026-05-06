import { promises as fs } from "node:fs";
import path from "node:path";

function createFTLSpec(value, attribute = null) {
  return Object.freeze({
    value,
    attribute,
  });
}

function normalizeFTLSpec(spec) {
  if (typeof spec === "string") {
    return {
      value: spec,
      attribute: null,
    };
  }
  if (!spec || typeof spec !== "object") {
    return null;
  }
  const value = typeof spec.value === "string" ? spec.value : null;
  if (!value) {
    return null;
  }
  const attribute = typeof spec.attribute === "string" && spec.attribute.trim()
    ? spec.attribute.trim()
    : null;
  return {
    value,
    attribute,
  };
}

function getBaselineFTLSpec(locale, key, registry = BASELINE_MAIN_FTL) {
  return normalizeFTLSpec(registry?.[locale]?.[key]);
}

export const BASELINE_ITEM_PANE_FTL = Object.freeze({
  "en-US": Object.freeze({
    "cleanroom-item-pane-info-row-label": createFTLSpec("Cleanroom Summary"),
    "cleanroom-item-pane-section-header": createFTLSpec("Cleanroom Panel", "label"),
    "cleanroom-item-pane-section-sidenav": createFTLSpec("Cleanroom Panel", "tooltiptext"),
  }),
  "zh-CN": Object.freeze({
    "cleanroom-item-pane-info-row-label": createFTLSpec("模板摘要"),
    "cleanroom-item-pane-section-header": createFTLSpec("模板面板", "label"),
    "cleanroom-item-pane-section-sidenav": createFTLSpec("模板面板", "tooltiptext"),
  }),
  "zh-TW": Object.freeze({
    "cleanroom-item-pane-info-row-label": createFTLSpec("範本摘要"),
    "cleanroom-item-pane-section-header": createFTLSpec("範本面板", "label"),
    "cleanroom-item-pane-section-sidenav": createFTLSpec("範本面板", "tooltiptext"),
  }),
});

export const BASELINE_PREFERENCE_PANE_FTL = Object.freeze({
  "en-US": Object.freeze({
    "cleanroom-pref-caption": createFTLSpec("ToolsBox Preferences", "label"),
    "cleanroom-pref-enabled": createFTLSpec("Enable plugin", "label"),
    "cleanroom-pref-menu-section": createFTLSpec("Menu", "label"),
    "cleanroom-pref-menu-label": createFTLSpec("Menu label", "value"),
    "cleanroom-pref-menu-hint": createFTLSpec("Leave empty to use localized default."),
    "cleanroom-pref-logging-section": createFTLSpec("Logging", "label"),
    "cleanroom-pref-log-level": createFTLSpec("Log level", "value"),
    "cleanroom-pref-theme-section": createFTLSpec("Theme", "label"),
    "cleanroom-pref-theme-mode": createFTLSpec("Theme mode", "value"),
    "cleanroom-pref-theme-follow-host": createFTLSpec("Follow Zotero", "label"),
    "cleanroom-pref-theme-light": createFTLSpec("Light", "label"),
    "cleanroom-pref-theme-dark": createFTLSpec("Dark", "label"),
    "cleanroom-pref-theme-hint": createFTLSpec("Apply only to plugin-owned UI surfaces, including this preference pane, without changing Zotero's global Appearance."),
  }),
  "zh-CN": Object.freeze({
    "cleanroom-pref-caption": createFTLSpec("ToolsBox 首选项", "label"),
    "cleanroom-pref-enabled": createFTLSpec("启用插件", "label"),
    "cleanroom-pref-menu-section": createFTLSpec("菜单", "label"),
    "cleanroom-pref-menu-label": createFTLSpec("菜单标签", "value"),
    "cleanroom-pref-menu-hint": createFTLSpec("留空使用默认本地化文案。"),
    "cleanroom-pref-logging-section": createFTLSpec("日志", "label"),
    "cleanroom-pref-log-level": createFTLSpec("日志等级", "value"),
    "cleanroom-pref-theme-section": createFTLSpec("主题", "label"),
    "cleanroom-pref-theme-mode": createFTLSpec("主题模式", "value"),
    "cleanroom-pref-theme-follow-host": createFTLSpec("跟随 Zotero", "label"),
    "cleanroom-pref-theme-light": createFTLSpec("浅色", "label"),
    "cleanroom-pref-theme-dark": createFTLSpec("深色", "label"),
    "cleanroom-pref-theme-hint": createFTLSpec("仅作用于插件拥有的界面，包括当前偏好设置面板，不会改变 Zotero 的全局外观。"),
  }),
  "zh-TW": Object.freeze({
    "cleanroom-pref-caption": createFTLSpec("ToolsBox 偏好設定", "label"),
    "cleanroom-pref-enabled": createFTLSpec("啟用外掛", "label"),
    "cleanroom-pref-menu-section": createFTLSpec("選單", "label"),
    "cleanroom-pref-menu-label": createFTLSpec("選單標籤", "value"),
    "cleanroom-pref-menu-hint": createFTLSpec("留空時使用預設本地化文案。"),
    "cleanroom-pref-logging-section": createFTLSpec("日誌", "label"),
    "cleanroom-pref-log-level": createFTLSpec("日誌等級", "value"),
    "cleanroom-pref-theme-section": createFTLSpec("主題", "label"),
    "cleanroom-pref-theme-mode": createFTLSpec("主題模式", "value"),
    "cleanroom-pref-theme-follow-host": createFTLSpec("跟隨 Zotero", "label"),
    "cleanroom-pref-theme-light": createFTLSpec("淺色", "label"),
    "cleanroom-pref-theme-dark": createFTLSpec("深色", "label"),
    "cleanroom-pref-theme-hint": createFTLSpec("僅作用於外掛擁有的介面，包括目前偏好設定面板，不會改變 Zotero 的全域外觀。"),
  }),
});

export const BASELINE_RESEARCH_WORKFLOW_FTL = Object.freeze({
  "en-US": Object.freeze({
    "cleanroom-pref-workflow-section": createFTLSpec("Workflow", "label"),
    "cleanroom-pref-workflow-hint": createFTLSpec("Stores workflow state locally in tags and Extra fields. Column registration may require reloading Zotero if the host cannot refresh registered columns in place."),
    "cleanroom-pref-rw-enabled": createFTLSpec("Enable workflow tools", "label"),
    "cleanroom-pref-rw-item-pane-enabled": createFTLSpec("Enable Item Pane workflow editor", "label"),
    "cleanroom-pref-rw-menu-enabled": createFTLSpec("Enable item and collection workflow menus", "label"),
    "cleanroom-pref-rw-reader-enabled": createFTLSpec("Enable Reader workflow menus", "label"),
    "cleanroom-pref-rw-status-available": createFTLSpec("Available statuses", "value"),
    "cleanroom-pref-rw-read-status-available": createFTLSpec("Available read statuses", "value"),
    "cleanroom-pref-research-columns-section": createFTLSpec("Research Columns", "label"),
    "cleanroom-pref-research-columns-hint": createFTLSpec("Registers local, read-only item tree columns. Use Zotero's column picker to show or hide them."),
    "cleanroom-pref-rw-tags-column": createFTLSpec("Tags column", "label"),
    "cleanroom-pref-rw-text-tags-column": createFTLSpec("Text tags column", "label"),
    "cleanroom-pref-rw-status-column": createFTLSpec("Status column", "label"),
    "cleanroom-pref-rw-rating-column": createFTLSpec("Rating column", "label"),
    "cleanroom-pref-rw-remark-column": createFTLSpec("Remark column", "label"),
    "cleanroom-pref-rw-creator-column": createFTLSpec("Creator column", "label"),
    "cleanroom-pref-rw-publication-column": createFTLSpec("Publication fallback column", "label"),
    "cleanroom-pref-rw-date-added-column": createFTLSpec("Date added column", "label"),
    "cleanroom-pref-rw-date-modified-column": createFTLSpec("Date modified column", "label"),
    "cleanroom-pref-rw-read-status-column": createFTLSpec("Read status column", "label"),
    "cleanroom-pref-rw-custom-fields-column": createFTLSpec("Custom field columns", "label"),
    "cleanroom-pref-rw-custom-fields": createFTLSpec("Custom fields", "value"),
    "cleanroom-pref-rw-text-tag-prefix": createFTLSpec("Text tag prefix", "value"),
    "cleanroom-pref-rw-status-tag-prefix": createFTLSpec("Status tag prefix", "value"),
    "cleanroom-pref-rw-rating-mark": createFTLSpec("Rating mark", "value"),
    "cleanroom-pref-rw-remark-label": createFTLSpec("Remark extra label", "value"),
    "cleanroom-pref-rw-read-status-label": createFTLSpec("Read status extra label", "value"),
    "cleanroom-pref-rw-progress-label": createFTLSpec("Progress extra label", "value"),
    "cleanroom-pref-workbench-section": createFTLSpec("Workbenches", "label"),
    "cleanroom-pref-workbench-hint": createFTLSpec("Opens local windows backed by Zotero items, relations, notes, annotations, and tags only."),
    "cleanroom-pref-workbench-graph": createFTLSpec("Enable relationship graph", "label"),
    "cleanroom-pref-workbench-matrix": createFTLSpec("Enable paper matrix", "label"),
    "cleanroom-pref-workbench-notes": createFTLSpec("Enable notes manager", "label"),
    "cleanroom-pref-workbench-tabs": createFTLSpec("Enable tab helper", "label"),
    "cleanroom-column-tags": createFTLSpec("Tags"),
    "cleanroom-column-text-tags": createFTLSpec("Text Tags"),
    "cleanroom-column-status": createFTLSpec("Status"),
    "cleanroom-column-rating": createFTLSpec("Rating"),
    "cleanroom-column-remark": createFTLSpec("Remark"),
    "cleanroom-column-creator": createFTLSpec("Creator"),
    "cleanroom-column-publication": createFTLSpec("Publication"),
    "cleanroom-column-date-added": createFTLSpec("Date Added"),
    "cleanroom-column-date-modified": createFTLSpec("Date Modified"),
    "cleanroom-column-read-status": createFTLSpec("Read Status"),
    "cleanroom-workflow-section-header": createFTLSpec("Workflow", "label"),
    "cleanroom-workflow-section-sidenav": createFTLSpec("Workflow", "tooltiptext"),
    "cleanroom-workflow-empty": createFTLSpec("Select an item to edit workflow fields."),
    "cleanroom-workflow-field-status": createFTLSpec("Status"),
    "cleanroom-workflow-field-rating": createFTLSpec("Rating"),
    "cleanroom-workflow-field-read-status": createFTLSpec("Read status"),
    "cleanroom-workflow-field-progress": createFTLSpec("Progress"),
    "cleanroom-workflow-field-text-tags": createFTLSpec("Text tags"),
    "cleanroom-workflow-field-remark": createFTLSpec("Remark"),
    "cleanroom-workflow-summary-title": createFTLSpec("Local summary"),
    "cleanroom-workflow-summary-attachments": createFTLSpec("Attachments"),
    "cleanroom-workflow-summary-related": createFTLSpec("Related"),
    "cleanroom-workflow-summary-relations": createFTLSpec("Relations"),
    "cleanroom-workflow-summary-tags": createFTLSpec("Tags"),
    "cleanroom-workflow-summary-status": createFTLSpec("Status"),
    "cleanroom-workflow-summary-remark": createFTLSpec("Remark"),
    "cleanroom-workflow-save": createFTLSpec("Save"),
    "cleanroom-workflow-clear": createFTLSpec("Clear"),
    "cleanroom-workflow-item-menu": createFTLSpec("Workflow"),
    "cleanroom-workflow-collection-menu": createFTLSpec("Workflow for Collection"),
    "cleanroom-workflow-reader-menu": createFTLSpec("Workflow"),
    "cleanroom-workflow-reader-sync-progress": createFTLSpec("Sync reading progress"),
    "cleanroom-workflow-reader-toolbar": createFTLSpec("Workflow"),
    "cleanroom-workflow-reader-view-progress": createFTLSpec("Record page progress"),
    "cleanroom-workflow-annotation-reviewed": createFTLSpec("Mark annotation reviewed"),
    "cleanroom-workflow-annotation-tag": createFTLSpec("Add workflow tag"),
    "cleanroom-workflow-annotation-color": createFTLSpec("Set workflow color"),
    "cleanroom-workflow-menu-set-status": createFTLSpec("Set status"),
    "cleanroom-workflow-menu-set-rating": createFTLSpec("Set rating"),
    "cleanroom-workflow-menu-add-tag": createFTLSpec("Add text tag"),
    "cleanroom-workflow-menu-set-remark": createFTLSpec("Set remark: Needs follow-up"),
    "cleanroom-workflow-menu-clear": createFTLSpec("Clear workflow fields"),
    "cleanroom-workflow-stat-total": createFTLSpec("Total"),
    "cleanroom-workflow-stat-todo": createFTLSpec("To read"),
    "cleanroom-workflow-stat-reading": createFTLSpec("Reading"),
    "cleanroom-workflow-stat-done": createFTLSpec("Done"),
    "cleanroom-workflow-stat-missing-attachments": createFTLSpec("No attachments"),
    "cleanroom-workflow-stat-missing-remark": createFTLSpec("No remarks"),
    "cleanroom-workflow-stat-ratings": createFTLSpec("Ratings"),
    "cleanroom-workflow-stat-tags": createFTLSpec("Tags"),
    "cleanroom-th-command-duplicate-tab": createFTLSpec("Duplicate Reader Tab"),
    "cleanroom-th-command-close-others": createFTLSpec("Close Other Tabs"),
    "cleanroom-th-command-move-window": createFTLSpec("Move Tab to New Window"),
    "cleanroom-th-command-save-session": createFTLSpec("Save Tab Session"),
    "cleanroom-th-command-restore-session": createFTLSpec("Restore Tab Session"),
    "cleanroom-th-menu-open-related": createFTLSpec("Open All Related in Tabs"),
    "cleanroom-th-menu-open-duplicate": createFTLSpec("Open in New Tab"),
    "cleanroom-th-toast-session-saved": createFTLSpec("Tab session saved ({ $count } tabs)"),
    "cleanroom-th-toast-session-restored": createFTLSpec("Tab session restored ({ $count } tabs)"),
    "cleanroom-th-toast-no-session": createFTLSpec("No saved tab session found."),
    "cleanroom-nm-command-label": createFTLSpec("Open Notes Manager"),
    "cleanroom-nm-window-title": createFTLSpec("Notes & Annotation Manager"),
    "cleanroom-pm-command-label": createFTLSpec("Open Paper Matrix"),
    "cleanroom-pm-window-title": createFTLSpec("Paper Matrix"),
    "cleanroom-rg-command-label": createFTLSpec("Open Relationship Graph"),
    "cleanroom-rg-window-title": createFTLSpec("Relationship Graph"),
    "cleanroom-rg-item-menu-label": createFTLSpec("Show Relationship Graph"),
  }),
  "zh-CN": Object.freeze({
    "cleanroom-pref-workflow-section": createFTLSpec("工作流", "label"),
    "cleanroom-pref-workflow-hint": createFTLSpec("工作流状态只保存在本地标签和 Extra 字段中。若宿主无法即时刷新已注册列，列开关需要重载 Zotero 后生效。"),
    "cleanroom-pref-rw-enabled": createFTLSpec("启用工作流工具", "label"),
    "cleanroom-pref-rw-item-pane-enabled": createFTLSpec("启用条目窗格工作流编辑器", "label"),
    "cleanroom-pref-rw-menu-enabled": createFTLSpec("启用条目和合集工作流菜单", "label"),
    "cleanroom-pref-rw-reader-enabled": createFTLSpec("启用 Reader 工作流菜单", "label"),
    "cleanroom-pref-rw-status-available": createFTLSpec("可用状态", "value"),
    "cleanroom-pref-rw-read-status-available": createFTLSpec("可用阅读状态", "value"),
    "cleanroom-pref-research-columns-section": createFTLSpec("研究列", "label"),
    "cleanroom-pref-research-columns-hint": createFTLSpec("注册本地只读条目列；可在 Zotero 的列选择器里显示或隐藏。"),
    "cleanroom-pref-rw-tags-column": createFTLSpec("标签列", "label"),
    "cleanroom-pref-rw-text-tags-column": createFTLSpec("文本标签列", "label"),
    "cleanroom-pref-rw-status-column": createFTLSpec("状态列", "label"),
    "cleanroom-pref-rw-rating-column": createFTLSpec("评分列", "label"),
    "cleanroom-pref-rw-remark-column": createFTLSpec("备注列", "label"),
    "cleanroom-pref-rw-creator-column": createFTLSpec("创作者列", "label"),
    "cleanroom-pref-rw-publication-column": createFTLSpec("出版物兜底列", "label"),
    "cleanroom-pref-rw-date-added-column": createFTLSpec("添加日期列", "label"),
    "cleanroom-pref-rw-date-modified-column": createFTLSpec("修改日期列", "label"),
    "cleanroom-pref-rw-read-status-column": createFTLSpec("阅读状态列", "label"),
    "cleanroom-pref-rw-custom-fields-column": createFTLSpec("自定义字段列", "label"),
    "cleanroom-pref-rw-custom-fields": createFTLSpec("自定义字段", "value"),
    "cleanroom-pref-rw-text-tag-prefix": createFTLSpec("文本标签前缀", "value"),
    "cleanroom-pref-rw-status-tag-prefix": createFTLSpec("状态标签前缀", "value"),
    "cleanroom-pref-rw-rating-mark": createFTLSpec("评分标记", "value"),
    "cleanroom-pref-rw-remark-label": createFTLSpec("备注 Extra 标签", "value"),
    "cleanroom-pref-rw-read-status-label": createFTLSpec("阅读状态 Extra 标签", "value"),
    "cleanroom-pref-rw-progress-label": createFTLSpec("阅读进度 Extra 标签", "value"),
    "cleanroom-pref-workbench-section": createFTLSpec("工作台", "label"),
    "cleanroom-pref-workbench-hint": createFTLSpec("打开仅使用 Zotero 本地条目、关系、笔记、批注和标签的独立窗口。"),
    "cleanroom-pref-workbench-graph": createFTLSpec("启用关系图", "label"),
    "cleanroom-pref-workbench-matrix": createFTLSpec("启用论文矩阵", "label"),
    "cleanroom-pref-workbench-notes": createFTLSpec("启用笔记管理器", "label"),
    "cleanroom-pref-workbench-tabs": createFTLSpec("启用标签页助手", "label"),
    "cleanroom-column-tags": createFTLSpec("标签"),
    "cleanroom-column-text-tags": createFTLSpec("文本标签"),
    "cleanroom-column-status": createFTLSpec("状态"),
    "cleanroom-column-rating": createFTLSpec("评分"),
    "cleanroom-column-remark": createFTLSpec("备注"),
    "cleanroom-column-creator": createFTLSpec("创作者"),
    "cleanroom-column-publication": createFTLSpec("出版物"),
    "cleanroom-column-date-added": createFTLSpec("添加日期"),
    "cleanroom-column-date-modified": createFTLSpec("修改日期"),
    "cleanroom-column-read-status": createFTLSpec("阅读状态"),
    "cleanroom-workflow-section-header": createFTLSpec("工作流", "label"),
    "cleanroom-workflow-section-sidenav": createFTLSpec("工作流", "tooltiptext"),
    "cleanroom-workflow-empty": createFTLSpec("选择条目后可编辑工作流字段。"),
    "cleanroom-workflow-field-status": createFTLSpec("状态"),
    "cleanroom-workflow-field-rating": createFTLSpec("评分"),
    "cleanroom-workflow-field-read-status": createFTLSpec("阅读状态"),
    "cleanroom-workflow-field-progress": createFTLSpec("进度"),
    "cleanroom-workflow-field-text-tags": createFTLSpec("文本标签"),
    "cleanroom-workflow-field-remark": createFTLSpec("备注"),
    "cleanroom-workflow-summary-title": createFTLSpec("本地摘要"),
    "cleanroom-workflow-summary-attachments": createFTLSpec("附件"),
    "cleanroom-workflow-summary-related": createFTLSpec("关联条目"),
    "cleanroom-workflow-summary-relations": createFTLSpec("关系"),
    "cleanroom-workflow-summary-tags": createFTLSpec("标签"),
    "cleanroom-workflow-summary-status": createFTLSpec("状态"),
    "cleanroom-workflow-summary-remark": createFTLSpec("备注"),
    "cleanroom-workflow-save": createFTLSpec("保存"),
    "cleanroom-workflow-clear": createFTLSpec("清理"),
    "cleanroom-workflow-item-menu": createFTLSpec("工作流"),
    "cleanroom-workflow-collection-menu": createFTLSpec("合集工作流"),
    "cleanroom-workflow-reader-menu": createFTLSpec("工作流"),
    "cleanroom-workflow-reader-sync-progress": createFTLSpec("同步阅读进度"),
    "cleanroom-workflow-reader-toolbar": createFTLSpec("工作流"),
    "cleanroom-workflow-reader-view-progress": createFTLSpec("记录页面进度"),
    "cleanroom-workflow-annotation-reviewed": createFTLSpec("标记批注已处理"),
    "cleanroom-workflow-annotation-tag": createFTLSpec("添加工作流标签"),
    "cleanroom-workflow-annotation-color": createFTLSpec("设置工作流颜色"),
    "cleanroom-workflow-menu-set-status": createFTLSpec("设置状态"),
    "cleanroom-workflow-menu-set-rating": createFTLSpec("设置评分"),
    "cleanroom-workflow-menu-add-tag": createFTLSpec("添加文本标签"),
    "cleanroom-workflow-menu-set-remark": createFTLSpec("设置备注：需要跟进"),
    "cleanroom-workflow-menu-clear": createFTLSpec("清理工作流字段"),
    "cleanroom-workflow-stat-total": createFTLSpec("总数"),
    "cleanroom-workflow-stat-todo": createFTLSpec("待读"),
    "cleanroom-workflow-stat-reading": createFTLSpec("在读"),
    "cleanroom-workflow-stat-done": createFTLSpec("已读"),
    "cleanroom-workflow-stat-missing-attachments": createFTLSpec("缺附件"),
    "cleanroom-workflow-stat-missing-remark": createFTLSpec("缺备注"),
    "cleanroom-workflow-stat-ratings": createFTLSpec("评分"),
    "cleanroom-workflow-stat-tags": createFTLSpec("标签"),
    "cleanroom-th-command-duplicate-tab": createFTLSpec("复制阅读器标签页"),
    "cleanroom-th-command-close-others": createFTLSpec("关闭其他标签页"),
    "cleanroom-th-command-move-window": createFTLSpec("移动标签页到新窗口"),
    "cleanroom-th-command-save-session": createFTLSpec("保存标签页会话"),
    "cleanroom-th-command-restore-session": createFTLSpec("恢复标签页会话"),
    "cleanroom-th-menu-open-related": createFTLSpec("在标签页中打开所有关联条目"),
    "cleanroom-th-menu-open-duplicate": createFTLSpec("在新标签页中打开"),
    "cleanroom-th-toast-session-saved": createFTLSpec("已保存 { $count } 个标签页的会话"),
    "cleanroom-th-toast-session-restored": createFTLSpec("已恢复 { $count } 个标签页的会话"),
    "cleanroom-th-toast-no-session": createFTLSpec("没有找到保存的标签页会话"),
    "cleanroom-nm-command-label": createFTLSpec("打开笔记管理器"),
    "cleanroom-nm-window-title": createFTLSpec("笔记与批注管理器"),
    "cleanroom-pm-command-label": createFTLSpec("打开论文矩阵"),
    "cleanroom-pm-window-title": createFTLSpec("论文矩阵"),
    "cleanroom-rg-command-label": createFTLSpec("打开关系图"),
    "cleanroom-rg-window-title": createFTLSpec("关系图"),
    "cleanroom-rg-item-menu-label": createFTLSpec("显示关系图"),
  }),
  "zh-TW": Object.freeze({
    "cleanroom-pref-workflow-section": createFTLSpec("工作流", "label"),
    "cleanroom-pref-workflow-hint": createFTLSpec("工作流狀態只儲存在本地標籤與 Extra 欄位中。若宿主無法即時刷新已註冊欄位，欄位開關需重新載入 Zotero 後生效。"),
    "cleanroom-pref-rw-enabled": createFTLSpec("啟用工作流工具", "label"),
    "cleanroom-pref-rw-item-pane-enabled": createFTLSpec("啟用條目窗格工作流編輯器", "label"),
    "cleanroom-pref-rw-menu-enabled": createFTLSpec("啟用條目與合集工作流選單", "label"),
    "cleanroom-pref-rw-reader-enabled": createFTLSpec("啟用 Reader 工作流選單", "label"),
    "cleanroom-pref-rw-status-available": createFTLSpec("可用狀態", "value"),
    "cleanroom-pref-rw-read-status-available": createFTLSpec("可用閱讀狀態", "value"),
    "cleanroom-pref-research-columns-section": createFTLSpec("研究欄位", "label"),
    "cleanroom-pref-research-columns-hint": createFTLSpec("註冊本地唯讀條目欄位；可在 Zotero 的欄位選擇器中顯示或隱藏。"),
    "cleanroom-pref-rw-tags-column": createFTLSpec("標籤欄位", "label"),
    "cleanroom-pref-rw-text-tags-column": createFTLSpec("文字標籤欄位", "label"),
    "cleanroom-pref-rw-status-column": createFTLSpec("狀態欄位", "label"),
    "cleanroom-pref-rw-rating-column": createFTLSpec("評分欄位", "label"),
    "cleanroom-pref-rw-remark-column": createFTLSpec("備註欄位", "label"),
    "cleanroom-pref-rw-creator-column": createFTLSpec("創作者欄位", "label"),
    "cleanroom-pref-rw-publication-column": createFTLSpec("出版物備援欄位", "label"),
    "cleanroom-pref-rw-date-added-column": createFTLSpec("加入日期欄位", "label"),
    "cleanroom-pref-rw-date-modified-column": createFTLSpec("修改日期欄位", "label"),
    "cleanroom-pref-rw-read-status-column": createFTLSpec("閱讀狀態欄位", "label"),
    "cleanroom-pref-rw-custom-fields-column": createFTLSpec("自訂欄位", "label"),
    "cleanroom-pref-rw-custom-fields": createFTLSpec("自訂欄位", "value"),
    "cleanroom-pref-rw-text-tag-prefix": createFTLSpec("文字標籤前綴", "value"),
    "cleanroom-pref-rw-status-tag-prefix": createFTLSpec("狀態標籤前綴", "value"),
    "cleanroom-pref-rw-rating-mark": createFTLSpec("評分標記", "value"),
    "cleanroom-pref-rw-remark-label": createFTLSpec("備註 Extra 標籤", "value"),
    "cleanroom-pref-rw-read-status-label": createFTLSpec("閱讀狀態 Extra 標籤", "value"),
    "cleanroom-pref-rw-progress-label": createFTLSpec("閱讀進度 Extra 標籤", "value"),
    "cleanroom-pref-workbench-section": createFTLSpec("工作台", "label"),
    "cleanroom-pref-workbench-hint": createFTLSpec("開啟僅使用 Zotero 本地條目、關係、筆記、批註和標籤的獨立視窗。"),
    "cleanroom-pref-workbench-graph": createFTLSpec("啟用關係圖", "label"),
    "cleanroom-pref-workbench-matrix": createFTLSpec("啟用論文矩陣", "label"),
    "cleanroom-pref-workbench-notes": createFTLSpec("啟用筆記管理器", "label"),
    "cleanroom-pref-workbench-tabs": createFTLSpec("啟用分頁助手", "label"),
    "cleanroom-column-tags": createFTLSpec("標籤"),
    "cleanroom-column-text-tags": createFTLSpec("文字標籤"),
    "cleanroom-column-status": createFTLSpec("狀態"),
    "cleanroom-column-rating": createFTLSpec("評分"),
    "cleanroom-column-remark": createFTLSpec("備註"),
    "cleanroom-column-creator": createFTLSpec("創作者"),
    "cleanroom-column-publication": createFTLSpec("出版物"),
    "cleanroom-column-date-added": createFTLSpec("加入日期"),
    "cleanroom-column-date-modified": createFTLSpec("修改日期"),
    "cleanroom-column-read-status": createFTLSpec("閱讀狀態"),
    "cleanroom-workflow-section-header": createFTLSpec("工作流", "label"),
    "cleanroom-workflow-section-sidenav": createFTLSpec("工作流", "tooltiptext"),
    "cleanroom-workflow-empty": createFTLSpec("選取條目後可編輯工作流欄位。"),
    "cleanroom-workflow-field-status": createFTLSpec("狀態"),
    "cleanroom-workflow-field-rating": createFTLSpec("評分"),
    "cleanroom-workflow-field-read-status": createFTLSpec("閱讀狀態"),
    "cleanroom-workflow-field-progress": createFTLSpec("進度"),
    "cleanroom-workflow-field-text-tags": createFTLSpec("文字標籤"),
    "cleanroom-workflow-field-remark": createFTLSpec("備註"),
    "cleanroom-workflow-summary-title": createFTLSpec("本地摘要"),
    "cleanroom-workflow-summary-attachments": createFTLSpec("附件"),
    "cleanroom-workflow-summary-related": createFTLSpec("關聯條目"),
    "cleanroom-workflow-summary-relations": createFTLSpec("關係"),
    "cleanroom-workflow-summary-tags": createFTLSpec("標籤"),
    "cleanroom-workflow-summary-status": createFTLSpec("狀態"),
    "cleanroom-workflow-summary-remark": createFTLSpec("備註"),
    "cleanroom-workflow-save": createFTLSpec("儲存"),
    "cleanroom-workflow-clear": createFTLSpec("清理"),
    "cleanroom-workflow-item-menu": createFTLSpec("工作流"),
    "cleanroom-workflow-collection-menu": createFTLSpec("合集工作流"),
    "cleanroom-workflow-reader-menu": createFTLSpec("工作流"),
    "cleanroom-workflow-reader-sync-progress": createFTLSpec("同步閱讀進度"),
    "cleanroom-workflow-reader-toolbar": createFTLSpec("工作流"),
    "cleanroom-workflow-reader-view-progress": createFTLSpec("記錄頁面進度"),
    "cleanroom-workflow-annotation-reviewed": createFTLSpec("標記批註已處理"),
    "cleanroom-workflow-annotation-tag": createFTLSpec("加入工作流標籤"),
    "cleanroom-workflow-annotation-color": createFTLSpec("設定工作流顏色"),
    "cleanroom-workflow-menu-set-status": createFTLSpec("設定狀態"),
    "cleanroom-workflow-menu-set-rating": createFTLSpec("設定評分"),
    "cleanroom-workflow-menu-add-tag": createFTLSpec("加入文字標籤"),
    "cleanroom-workflow-menu-set-remark": createFTLSpec("設定備註：需要跟進"),
    "cleanroom-workflow-menu-clear": createFTLSpec("清理工作流欄位"),
    "cleanroom-workflow-stat-total": createFTLSpec("總數"),
    "cleanroom-workflow-stat-todo": createFTLSpec("待讀"),
    "cleanroom-workflow-stat-reading": createFTLSpec("在讀"),
    "cleanroom-workflow-stat-done": createFTLSpec("已讀"),
    "cleanroom-workflow-stat-missing-attachments": createFTLSpec("缺附件"),
    "cleanroom-workflow-stat-missing-remark": createFTLSpec("缺備註"),
    "cleanroom-workflow-stat-ratings": createFTLSpec("評分"),
    "cleanroom-workflow-stat-tags": createFTLSpec("標籤"),
    "cleanroom-th-command-duplicate-tab": createFTLSpec("複製閱讀器分頁"),
    "cleanroom-th-command-close-others": createFTLSpec("關閉其他分頁"),
    "cleanroom-th-command-move-window": createFTLSpec("移動分頁到新視窗"),
    "cleanroom-th-command-save-session": createFTLSpec("儲存分頁工作階段"),
    "cleanroom-th-command-restore-session": createFTLSpec("恢復分頁工作階段"),
    "cleanroom-th-menu-open-related": createFTLSpec("在分頁中開啟所有關聯項目"),
    "cleanroom-th-menu-open-duplicate": createFTLSpec("在新分頁中開啟"),
    "cleanroom-th-toast-session-saved": createFTLSpec("已儲存 { $count } 個分頁的工作階段"),
    "cleanroom-th-toast-session-restored": createFTLSpec("已恢復 { $count } 個分頁的工作階段"),
    "cleanroom-th-toast-no-session": createFTLSpec("沒有找到儲存的分頁工作階段"),
    "cleanroom-nm-command-label": createFTLSpec("開啟筆記管理器"),
    "cleanroom-nm-window-title": createFTLSpec("筆記與標註管理器"),
    "cleanroom-pm-command-label": createFTLSpec("開啟論文矩陣"),
    "cleanroom-pm-window-title": createFTLSpec("論文矩陣"),
    "cleanroom-rg-command-label": createFTLSpec("開啟關係圖"),
    "cleanroom-rg-window-title": createFTLSpec("關係圖"),
    "cleanroom-rg-item-menu-label": createFTLSpec("顯示關係圖"),
  }),
});

export const BASELINE_MENU_FTL = Object.freeze({
  "en-US": Object.freeze({
    "cleanroom-menu-label": createFTLSpec("Open ToolsBox"),
    "cleanroom-reader-menu-label": createFTLSpec("Open Current View"),
    "cleanroom-dialog-title": createFTLSpec("ToolsBox"),
    "cleanroom-dialog-body": createFTLSpec("Plugin command executed successfully."),
  }),
  "zh-CN": Object.freeze({
    "cleanroom-menu-label": createFTLSpec("打开 ToolsBox"),
    "cleanroom-reader-menu-label": createFTLSpec("打开当前视图"),
    "cleanroom-dialog-title": createFTLSpec("ToolsBox"),
    "cleanroom-dialog-body": createFTLSpec("插件命令执行成功。"),
  }),
  "zh-TW": Object.freeze({
    "cleanroom-menu-label": createFTLSpec("開啟 ToolsBox"),
    "cleanroom-reader-menu-label": createFTLSpec("開啟目前視圖"),
    "cleanroom-dialog-title": createFTLSpec("ToolsBox"),
    "cleanroom-dialog-body": createFTLSpec("外掛命令已成功執行。"),
  }),
});

export const BASELINE_MAIN_FTL = Object.freeze({
  "en-US": Object.freeze({
    ...BASELINE_MENU_FTL["en-US"],
    ...BASELINE_PREFERENCE_PANE_FTL["en-US"],
    ...BASELINE_RESEARCH_WORKFLOW_FTL["en-US"],
    ...BASELINE_ITEM_PANE_FTL["en-US"],
  }),
  "zh-CN": Object.freeze({
    ...BASELINE_MENU_FTL["zh-CN"],
    ...BASELINE_PREFERENCE_PANE_FTL["zh-CN"],
    ...BASELINE_RESEARCH_WORKFLOW_FTL["zh-CN"],
    ...BASELINE_ITEM_PANE_FTL["zh-CN"],
  }),
  "zh-TW": Object.freeze({
    ...BASELINE_MENU_FTL["zh-TW"],
    ...BASELINE_PREFERENCE_PANE_FTL["zh-TW"],
    ...BASELINE_RESEARCH_WORKFLOW_FTL["zh-TW"],
    ...BASELINE_ITEM_PANE_FTL["zh-TW"],
  }),
});

export function resolveLocaleMainFTLPath(locale) {
  return `addon-static/locale/${locale}/main.ftl`;
}

export function buildFTLMessageBlock(locale, key, valueOverride = null, registry = BASELINE_MAIN_FTL) {
  const spec = getBaselineFTLSpec(locale, key, registry);
  if (!spec) {
    return null;
  }
  const value = valueOverride === null ? spec.value : String(valueOverride);
  if (spec.attribute) {
    return `${key} =\n    .${spec.attribute} = ${value}`;
  }
  return `${key} = ${value}`;
}

export function buildExpectedFTLLine(locale, key) {
  return buildFTLMessageBlock(locale, key, null, BASELINE_ITEM_PANE_FTL);
}

export function buildExpectedMainFTLLine(locale, key) {
  return buildFTLMessageBlock(locale, key, null, BASELINE_MAIN_FTL);
}

export function buildBaselineLocaleMainFTLSource(locale) {
  const messages = BASELINE_MAIN_FTL?.[locale];
  if (!messages) {
    return null;
  }

  return `${Object.keys(messages)
    .map((key) => buildFTLMessageBlock(locale, key))
    .join("\n")}\n`;
}

export function parseFTLMessages(source) {
  const messages = new Map();
  let currentKey = null;
  String(source || "")
    .split(/\r?\n/u)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const match = line.match(/^([A-Za-z0-9._-]+)\s*=\s*(.*)$/u);
      if (!match) {
        const attributeMatch = currentKey
          ? line.match(/^\s+\.([A-Za-z0-9_-]+)\s*=\s*(.*)$/u)
          : null;
        if (attributeMatch && messages.has(currentKey)) {
          const entry = messages.get(currentKey);
          entry.attributes[attributeMatch[1]] = attributeMatch[2];
        }
        return;
      }
      currentKey = match[1];
      messages.set(match[1], {
        value: match[2] || null,
        attributes: {},
      });
    });
  return messages;
}

function readParsedFTLValue(entry) {
  if (!entry) {
    return null;
  }

  if (typeof entry.value === "string") {
    return entry.value;
  }

  return null;
}

function buildFTLMessageBlockFromParsedEntry(key, entry) {
  if (!key || !entry) {
    return null;
  }

  const lines = [];
  const directValue = typeof entry.value === "string" && entry.value.length > 0
    ? entry.value
    : null;
  const attributes = entry.attributes && typeof entry.attributes === "object"
    ? entry.attributes
    : {};
  const attributeEntries = Object.entries(attributes)
    .filter(([name, value]) => {
      return typeof name === "string"
        && name.trim()
        && typeof value === "string"
        && value.length > 0;
    });

  if (directValue !== null) {
    lines.push(`${key} = ${directValue}`);
  }
  else if (attributeEntries.length > 0) {
    lines.push(`${key} =`);
  }
  else {
    lines.push(`${key} =`);
  }

  attributeEntries.forEach(([name, value]) => {
    lines.push(`    .${name} = ${value}`);
  });

  return lines.join("\n");
}

function inspectFTLStructureDrift(locale, key, entry, expectedSpec, relativeFile, registry = BASELINE_ITEM_PANE_FTL) {
  if (!entry || !expectedSpec) {
    return null;
  }

  const actualAttributes = Object.keys(entry.attributes || {});
  const actualLine = buildFTLMessageBlockFromParsedEntry(key, entry);

  if (expectedSpec.attribute) {
    const actualAttributeValue = entry.attributes?.[expectedSpec.attribute];
    if (typeof actualAttributeValue === "string") {
      return null;
    }

    const directValue = readParsedFTLValue(entry);
    let reason = "attribute-missing";
    if (typeof directValue === "string" && directValue.trim()) {
      reason = "direct-value-used";
    }
    else if (actualAttributes.length > 0) {
      reason = "wrong-attribute";
    }

    return {
      locale,
      key,
      file: relativeFile,
      reason,
      expectedAttribute: expectedSpec.attribute,
      actualAttributes,
      expectedValue: expectedSpec.value,
      expectedLine: buildFTLMessageBlock(locale, key, null, registry),
      actualLine,
    };
  }

  const directValue = readParsedFTLValue(entry);
  if (directValue !== null) {
    return null;
  }

  return {
    locale,
    key,
    file: relativeFile,
    reason: actualAttributes.length > 0 ? "direct-value-missing" : "value-missing",
    expectedAttribute: null,
    actualAttributes,
    expectedValue: expectedSpec.value,
    expectedLine: buildFTLMessageBlock(locale, key, null, registry),
    actualLine,
  };
}

async function inspectBaselineLocaleFiles(projectRoot, registry) {
  const missingEntries = [];
  const valueDriftEntries = [];
  const structureDriftEntries = [];

  for (const [locale, expectedMessages] of Object.entries(registry)) {
    const relativeFile = resolveLocaleMainFTLPath(locale);
    const absoluteFile = path.join(projectRoot, relativeFile);
    let messages = new Map();
    let fileMissing = false;

    try {
      const source = await fs.readFile(absoluteFile, "utf-8");
      messages = parseFTLMessages(source);
    }
    catch {
      fileMissing = true;
    }

    for (const key of Object.keys(expectedMessages)) {
      const expectedSpec = getBaselineFTLSpec(locale, key, registry);
      if (!expectedSpec) {
        continue;
      }

      if (messages.has(key)) {
        const entry = messages.get(key);
        const structureDrift = inspectFTLStructureDrift(locale, key, entry, expectedSpec, relativeFile, registry);
        if (structureDrift) {
          structureDriftEntries.push(structureDrift);
          continue;
        }

        const actualValue = expectedSpec.attribute
          ? entry.attributes[expectedSpec.attribute]
          : readParsedFTLValue(entry);
        const expectedValue = expectedSpec.value;
        if (actualValue !== expectedValue) {
          valueDriftEntries.push({
            locale,
            key,
            file: relativeFile,
            expectedValue,
            actualValue,
            expectedLine: buildFTLMessageBlock(locale, key, null, registry),
            actualLine: buildFTLMessageBlockFromParsedEntry(key, entry),
            reason: "value-drift",
          });
        }
        continue;
      }

      missingEntries.push({
        locale,
        key,
        file: relativeFile,
        expectedValue: expectedSpec.value,
        expectedLine: buildFTLMessageBlock(locale, key, null, registry),
        reason: fileMissing ? "file-missing" : "key-missing",
      });
    }
  }

  return {
    ok: missingEntries.length === 0 && valueDriftEntries.length === 0 && structureDriftEntries.length === 0,
    missingCount: missingEntries.length,
    missingEntries,
    valueDriftCount: valueDriftEntries.length,
    valueDriftEntries,
    structureDriftCount: structureDriftEntries.length,
    structureDriftEntries,
    driftCount: valueDriftEntries.length + structureDriftEntries.length,
    driftEntries: [
      ...valueDriftEntries,
      ...structureDriftEntries,
    ],
    checkedFiles: Object.keys(registry).map((locale) => resolveLocaleMainFTLPath(locale)),
  };
}

export async function inspectBaselineItemPaneLocaleFiles(projectRoot) {
  return inspectBaselineLocaleFiles(projectRoot, BASELINE_ITEM_PANE_FTL);
}

export async function inspectBaselineMainLocaleFiles(projectRoot) {
  return inspectBaselineLocaleFiles(projectRoot, BASELINE_MAIN_FTL);
}
