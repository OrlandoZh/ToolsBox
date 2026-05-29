/**
 * 国际化模块
 * 提供本地化字符串管理，支持变量插值
 */

const STRINGS = {
  "en-US": {
    "cleanroom-menu-label": "Open ToolsBox",
    "cleanroom-dialog-title": "ToolsBox",
    "cleanroom-dialog-body": "Plugin command executed successfully.",
    "cleanroom-command-label": "Open ToolsBox",
    "cleanroom-command-description": "Open the local ToolsBox workflow action.",
    "cleanroom-command-disabled": "Plugin is disabled. Re-enable it in preferences first.",
    "cleanroom-shortcut-description": "Show the ToolsBox shortcut status toast.",
    "cleanroom-shortcut-toast-title": "ToolsBox Shortcut",
    "cleanroom-shortcut-toast-body": "Triggered {shortcut} {count} times.",
    "cleanroom-demo-section-title": "Cleanroom Panel",
    "cleanroom-demo-field-item": "Item",
    "cleanroom-demo-field-shortcut": "Shortcut",
    "cleanroom-demo-field-notifier": "Notifier",
    "cleanroom-demo-field-status": "Status",
    "cleanroom-demo-no-selection": "No item selected.",
    "cleanroom-demo-untitled": "Untitled item",
    "cleanroom-demo-notifier-idle": "No notifier event yet.",
    "cleanroom-demo-status-ready": "Ready",
    "cleanroom-item-tree-label": "Cleanroom",
    "cleanroom-reader-menu-label": "Open Current View",
    "cleanroom-reader-command-description": "Show the active reader summary.",
    "cleanroom-reader-selection-command-label": "Show Reader Selection Snapshot",
    "cleanroom-reader-selection-command-description": "Inspect the current reader selection.",
    "cleanroom-reader-toast-title": "ToolsBox Reader",
    "cleanroom-reader-no-active": "No active reader tab.",
    "cleanroom-reader-toast-body": "{type} reader for item #{itemID} with {annotations} annotations.",
    "cleanroom-react-ui-demo-command-label": "Open Optional Panel",
    "cleanroom-react-ui-demo-command-description": "Open the default-disabled optional panel.",
    "cleanroom-react-ui-surface-title": "Optional React Host Surface",
    "cleanroom-react-ui-surface-message": "This item pane section proves the optional React lane can mount inside a real Zotero host surface while the JS core keeps ownership of lifecycle and evidence.",
    "cleanroom-react-ui-surface-status": "Mounted through the item pane section",
    "cleanroom-pref-caption": "ToolsBox Preferences",
    "cleanroom-pref-enabled": "Enable plugin",
    "cleanroom-pref-menu-section": "Menu",
    "cleanroom-pref-menu-label": "Menu label",
    "cleanroom-pref-menu-hint": "Leave empty to use localized default.",
    "cleanroom-pref-logging-section": "Logging",
    "cleanroom-pref-log-level": "Log level",
    "cleanroom-pref-theme-section": "Theme",
    "cleanroom-pref-theme-mode": "Theme mode",
    "cleanroom-pref-theme-follow-host": "Follow Zotero",
    "cleanroom-pref-theme-light": "Light",
    "cleanroom-pref-theme-dark": "Dark",
    "cleanroom-pref-theme-hint": "Apply only to plugin-owned UI surfaces, including this preference pane, without changing Zotero's global Appearance.",
    "cleanroom-pref-workflow-section": "Workflow",
    "cleanroom-pref-workflow-hint": "Stores workflow state locally in tags and Extra fields. Column registration may require reloading Zotero if the host cannot refresh registered columns in place.",
    "cleanroom-pref-rw-enabled": "Enable workflow tools",
    "cleanroom-pref-rw-item-pane-enabled": "Enable Item Pane workflow editor",
    "cleanroom-pref-rw-menu-enabled": "Enable item and collection workflow menus",
    "cleanroom-pref-rw-reader-enabled": "Enable Reader workflow menus",
    "cleanroom-pref-rw-status-available": "Available statuses",
    "cleanroom-pref-rw-read-status-available": "Available read statuses",
    "cleanroom-pref-research-columns-section": "Research Columns",
    "cleanroom-pref-research-columns-hint": "Registers local, read-only item tree columns. Use Zotero's column picker to show or hide them.",
    "cleanroom-pref-rw-tags-column": "Tags column",
    "cleanroom-pref-rw-text-tags-column": "Text tags column",
    "cleanroom-pref-rw-status-column": "Status column",
    "cleanroom-pref-rw-rating-column": "Rating column",
    "cleanroom-pref-rw-remark-column": "Remark column",
    "cleanroom-pref-rw-creator-column": "Creator column",
    "cleanroom-pref-rw-publication-column": "Publication fallback column",
    "cleanroom-pref-rw-date-added-column": "Date added column",
    "cleanroom-pref-rw-date-modified-column": "Date modified column",
    "cleanroom-pref-rw-read-status-column": "Read status column",
    "cleanroom-pref-rw-custom-fields-column": "Custom field columns",
    "cleanroom-pref-rw-custom-fields": "Custom fields",
    "cleanroom-pref-rw-text-tag-prefix": "Text tag prefix",
    "cleanroom-pref-rw-status-tag-prefix": "Status tag prefix",
    "cleanroom-pref-rw-rating-mark": "Rating mark",
    "cleanroom-pref-rw-remark-label": "Remark extra label",
    "cleanroom-pref-rw-read-status-label": "Read status extra label",
    "cleanroom-pref-rw-progress-label": "Progress extra label",
    "cleanroom-column-tags": "Tags",
    "cleanroom-column-text-tags": "Text Tags",
    "cleanroom-column-status": "Status",
    "cleanroom-column-rating": "Rating",
    "cleanroom-column-remark": "Remark",
    "cleanroom-column-creator": "Creator",
    "cleanroom-column-publication": "Publication",
    "cleanroom-column-date-added": "Date Added",
    "cleanroom-column-date-modified": "Date Modified",
    "cleanroom-column-read-status": "Read Status",
    "cleanroom-workflow-section-header": "Workflow",
    "cleanroom-workflow-section-sidenav": "Workflow",
    "cleanroom-workflow-empty": "Select an item to edit workflow fields.",
    "cleanroom-workflow-field-status": "Status",
    "cleanroom-workflow-field-rating": "Rating",
    "cleanroom-workflow-field-read-status": "Read status",
    "cleanroom-workflow-field-progress": "Progress",
    "cleanroom-workflow-field-text-tags": "Text tags",
    "cleanroom-workflow-field-remark": "Remark",
    "cleanroom-workflow-summary-title": "Local summary",
    "cleanroom-workflow-summary-attachments": "Attachments",
    "cleanroom-workflow-summary-related": "Related",
    "cleanroom-workflow-summary-relations": "Relations",
    "cleanroom-workflow-summary-tags": "Tags",
    "cleanroom-workflow-summary-status": "Status",
    "cleanroom-workflow-summary-remark": "Remark",
    "cleanroom-workflow-save": "Save",
    "cleanroom-workflow-clear": "Clear",
    "cleanroom-workflow-item-menu": "Workflow",
    "cleanroom-workflow-collection-menu": "Workflow for Collection",
    "cleanroom-workflow-reader-menu": "Workflow",
    "cleanroom-workflow-reader-sync-progress": "Sync reading progress",
    "cleanroom-workflow-reader-toolbar": "Workflow",
    "cleanroom-workflow-reader-view-progress": "Record page progress",
    "cleanroom-workflow-annotation-reviewed": "Mark annotation reviewed",
    "cleanroom-workflow-annotation-tag": "Add workflow tag",
    "cleanroom-workflow-annotation-color": "Set workflow color",
    "cleanroom-workflow-menu-set-status": "Set status",
    "cleanroom-workflow-menu-set-rating": "Set rating",
    "cleanroom-workflow-menu-add-tag": "Add text tag",
    "cleanroom-workflow-menu-set-remark": "Set remark: Needs follow-up",
    "cleanroom-workflow-menu-clear": "Clear workflow fields",
    "cleanroom-workflow-stat-total": "Total",
    "cleanroom-workflow-stat-todo": "To read",
    "cleanroom-workflow-stat-reading": "Reading",
    "cleanroom-workflow-stat-done": "Done",
    "cleanroom-workflow-stat-missing-attachments": "No attachments",
    "cleanroom-workflow-stat-missing-remark": "No remarks",
    "cleanroom-workflow-stat-ratings": "Ratings",
    "cleanroom-workflow-stat-tags": "Tags",
    "cleanroom-rg-item-menu-label": "Show Relationship Graph",
    "toolsbox-menu-annotation-manager": "Annotation Manager",
    "toolsbox-tab-manager-button": "Tab Manager",
    // 带变量的基础字符串
    "item-count": "You have {count} items.",
    "greeting": "Hello, {name}!",
    "progress-status": "Processing {current} of {total}...",
    "items-selected": "{count} items selected.",
  },
  "zh-CN": {
    "cleanroom-menu-label": "打开 ToolsBox",
    "cleanroom-dialog-title": "ToolsBox",
    "cleanroom-dialog-body": "插件命令执行成功。",
    "cleanroom-command-label": "打开 ToolsBox",
    "cleanroom-command-description": "打开本地 ToolsBox 工作流动作。",
    "cleanroom-command-disabled": "插件当前已禁用，请先在首选项中重新启用。",
    "cleanroom-shortcut-description": "显示 ToolsBox 快捷键状态提示。",
    "cleanroom-shortcut-toast-title": "ToolsBox 快捷键",
    "cleanroom-shortcut-toast-body": "已触发 {shortcut} {count} 次。",
    "cleanroom-demo-section-title": "Cleanroom 面板",
    "cleanroom-demo-field-item": "条目",
    "cleanroom-demo-field-shortcut": "快捷键",
    "cleanroom-demo-field-notifier": "监听器",
    "cleanroom-demo-field-status": "状态",
    "cleanroom-demo-no-selection": "当前没有选中条目。",
    "cleanroom-demo-untitled": "未命名条目",
    "cleanroom-demo-notifier-idle": "还没有监听到事件。",
    "cleanroom-demo-status-ready": "已就绪",
    "cleanroom-item-tree-label": "Cleanroom",
    "cleanroom-reader-menu-label": "打开当前视图",
    "cleanroom-reader-command-description": "显示当前激活 reader 的摘要。",
    "cleanroom-reader-selection-command-label": "显示 Reader 选区快照",
    "cleanroom-reader-selection-command-description": "检查当前 reader 选区。",
    "cleanroom-reader-toast-title": "ToolsBox Reader",
    "cleanroom-reader-no-active": "当前没有激活的 reader 标签页。",
    "cleanroom-reader-toast-body": "{type} 阅读器，条目 #{itemID}，包含 {annotations} 条批注。",
    "cleanroom-react-ui-demo-command-label": "打开可选面板",
    "cleanroom-react-ui-demo-command-description": "打开默认禁用的可选面板。",
    "cleanroom-react-ui-surface-title": "可选 React 宿主面板",
    "cleanroom-react-ui-surface-message": "这个条目窗格面板用于验证：可选 React lane 可以挂载到真实 Zotero 宿主 surface 中，同时继续由 JS core 掌管生命周期与验证证据。",
    "cleanroom-react-ui-surface-status": "已通过条目窗格 section 挂载",
    "cleanroom-pref-caption": "ToolsBox 首选项",
    "cleanroom-pref-enabled": "启用插件",
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
    "cleanroom-pref-theme-hint": "仅作用于插件拥有的界面，包括当前偏好设置面板，不会改变 Zotero 的全局外观。",
    "cleanroom-pref-workflow-section": "工作流",
    "cleanroom-pref-workflow-hint": "工作流状态只保存在本地标签和 Extra 字段中。若宿主无法即时刷新已注册列，列开关需要重载 Zotero 后生效。",
    "cleanroom-pref-rw-enabled": "启用工作流工具",
    "cleanroom-pref-rw-item-pane-enabled": "启用条目窗格工作流编辑器",
    "cleanroom-pref-rw-menu-enabled": "启用条目和合集工作流菜单",
    "cleanroom-pref-rw-reader-enabled": "启用 Reader 工作流菜单",
    "cleanroom-pref-rw-status-available": "可用状态",
    "cleanroom-pref-rw-read-status-available": "可用阅读状态",
    "cleanroom-pref-research-columns-section": "研究列",
    "cleanroom-pref-research-columns-hint": "注册本地只读条目列；可在 Zotero 的列选择器里显示或隐藏。",
    "cleanroom-pref-rw-tags-column": "标签列",
    "cleanroom-pref-rw-text-tags-column": "文本标签列",
    "cleanroom-pref-rw-status-column": "状态列",
    "cleanroom-pref-rw-rating-column": "评分列",
    "cleanroom-pref-rw-remark-column": "备注列",
    "cleanroom-pref-rw-creator-column": "创作者列",
    "cleanroom-pref-rw-publication-column": "出版物兜底列",
    "cleanroom-pref-rw-date-added-column": "添加日期列",
    "cleanroom-pref-rw-date-modified-column": "修改日期列",
    "cleanroom-pref-rw-read-status-column": "阅读状态列",
    "cleanroom-pref-rw-custom-fields-column": "自定义字段列",
    "cleanroom-pref-rw-custom-fields": "自定义字段",
    "cleanroom-pref-rw-text-tag-prefix": "文本标签前缀",
    "cleanroom-pref-rw-status-tag-prefix": "状态标签前缀",
    "cleanroom-pref-rw-rating-mark": "评分标记",
    "cleanroom-pref-rw-remark-label": "备注 Extra 标签",
    "cleanroom-pref-rw-read-status-label": "阅读状态 Extra 标签",
    "cleanroom-pref-rw-progress-label": "阅读进度 Extra 标签",
    "cleanroom-column-tags": "标签",
    "cleanroom-column-text-tags": "文本标签",
    "cleanroom-column-status": "状态",
    "cleanroom-column-rating": "评分",
    "cleanroom-column-remark": "备注",
    "cleanroom-column-creator": "创作者",
    "cleanroom-column-publication": "出版物",
    "cleanroom-column-date-added": "添加日期",
    "cleanroom-column-date-modified": "修改日期",
    "cleanroom-column-read-status": "阅读状态",
    "cleanroom-workflow-section-header": "工作流",
    "cleanroom-workflow-section-sidenav": "工作流",
    "cleanroom-workflow-empty": "选择条目后可编辑工作流字段。",
    "cleanroom-workflow-field-status": "状态",
    "cleanroom-workflow-field-rating": "评分",
    "cleanroom-workflow-field-read-status": "阅读状态",
    "cleanroom-workflow-field-progress": "进度",
    "cleanroom-workflow-field-text-tags": "文本标签",
    "cleanroom-workflow-field-remark": "备注",
    "cleanroom-workflow-summary-title": "本地摘要",
    "cleanroom-workflow-summary-attachments": "附件",
    "cleanroom-workflow-summary-related": "关联条目",
    "cleanroom-workflow-summary-relations": "关系",
    "cleanroom-workflow-summary-tags": "标签",
    "cleanroom-workflow-summary-status": "状态",
    "cleanroom-workflow-summary-remark": "备注",
    "cleanroom-workflow-save": "保存",
    "cleanroom-workflow-clear": "清理",
    "cleanroom-workflow-item-menu": "工作流",
    "cleanroom-workflow-collection-menu": "合集工作流",
    "cleanroom-workflow-reader-menu": "工作流",
    "cleanroom-workflow-reader-sync-progress": "同步阅读进度",
    "cleanroom-workflow-reader-toolbar": "工作流",
    "cleanroom-workflow-reader-view-progress": "记录页面进度",
    "cleanroom-workflow-annotation-reviewed": "标记批注已处理",
    "cleanroom-workflow-annotation-tag": "添加工作流标签",
    "cleanroom-workflow-annotation-color": "设置工作流颜色",
    "cleanroom-workflow-menu-set-status": "设置状态",
    "cleanroom-workflow-menu-set-rating": "设置评分",
    "cleanroom-workflow-menu-add-tag": "添加文本标签",
    "cleanroom-workflow-menu-set-remark": "设置备注：需要跟进",
    "cleanroom-workflow-menu-clear": "清理工作流字段",
    "cleanroom-workflow-stat-total": "总数",
    "cleanroom-workflow-stat-todo": "待读",
    "cleanroom-workflow-stat-reading": "在读",
    "cleanroom-workflow-stat-done": "已读",
    "cleanroom-workflow-stat-missing-attachments": "缺附件",
    "cleanroom-workflow-stat-missing-remark": "缺备注",
    "cleanroom-workflow-stat-ratings": "评分",
    "cleanroom-workflow-stat-tags": "标签",
    "cleanroom-rg-item-menu-label": "显示关系图",
    "toolsbox-menu-annotation-manager": "批注管理器",
    "toolsbox-tab-manager-button": "标签页管理器",
    // 带变量的基础字符串
    "item-count": "你有 {count} 个条目。",
    "greeting": "你好，{name}！",
    "progress-status": "正在处理 {current}/{total}...",
    "items-selected": "已选择 {count} 个条目。",
  },
  "zh-TW": {
    "cleanroom-menu-label": "開啟 ToolsBox",
    "cleanroom-dialog-title": "ToolsBox",
    "cleanroom-dialog-body": "外掛命令已成功執行。",
    "cleanroom-command-label": "開啟 ToolsBox",
    "cleanroom-command-description": "開啟本地 ToolsBox 工作流動作。",
    "cleanroom-command-disabled": "外掛目前已停用，請先在偏好設定中重新啟用。",
    "cleanroom-shortcut-description": "顯示 ToolsBox 快捷鍵狀態提示。",
    "cleanroom-shortcut-toast-title": "ToolsBox 快捷鍵",
    "cleanroom-shortcut-toast-body": "已觸發 {shortcut} {count} 次。",
    "cleanroom-demo-section-title": "Cleanroom 面板",
    "cleanroom-demo-field-item": "條目",
    "cleanroom-demo-field-shortcut": "快捷鍵",
    "cleanroom-demo-field-notifier": "監聽器",
    "cleanroom-demo-field-status": "狀態",
    "cleanroom-demo-no-selection": "目前沒有選取條目。",
    "cleanroom-demo-untitled": "未命名條目",
    "cleanroom-demo-notifier-idle": "還沒有監聽到事件。",
    "cleanroom-demo-status-ready": "已就緒",
    "cleanroom-item-tree-label": "Cleanroom",
    "cleanroom-reader-menu-label": "開啟目前視圖",
    "cleanroom-reader-command-description": "顯示目前啟用 reader 的摘要。",
    "cleanroom-reader-selection-command-label": "顯示 Reader 選區快照",
    "cleanroom-reader-selection-command-description": "檢查目前 reader 選區。",
    "cleanroom-reader-toast-title": "ToolsBox Reader",
    "cleanroom-reader-no-active": "目前沒有啟用的 reader 分頁。",
    "cleanroom-reader-toast-body": "{type} 閱讀器，條目 #{itemID}，包含 {annotations} 則批註。",
    "cleanroom-react-ui-demo-command-label": "開啟可選面板",
    "cleanroom-react-ui-demo-command-description": "開啟預設停用的可選面板。",
    "cleanroom-react-ui-surface-title": "可選 React 宿主面板",
    "cleanroom-react-ui-surface-message": "這個條目窗格面板用於驗證：可選 React lane 可以掛載到真實 Zotero 宿主 surface 中，同時繼續由 JS core 掌管生命週期與驗證證據。",
    "cleanroom-react-ui-surface-status": "已透過條目窗格 section 掛載",
    "cleanroom-pref-caption": "ToolsBox 偏好設定",
    "cleanroom-pref-enabled": "啟用外掛",
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
    "cleanroom-pref-theme-hint": "僅作用於外掛擁有的介面，包括目前偏好設定面板，不會改變 Zotero 的全域外觀。",
    "cleanroom-pref-workflow-section": "工作流",
    "cleanroom-pref-workflow-hint": "工作流狀態只儲存在本地標籤與 Extra 欄位中。若宿主無法即時刷新已註冊欄位，欄位開關需重新載入 Zotero 後生效。",
    "cleanroom-pref-rw-enabled": "啟用工作流工具",
    "cleanroom-pref-rw-item-pane-enabled": "啟用條目窗格工作流編輯器",
    "cleanroom-pref-rw-menu-enabled": "啟用條目與合集工作流選單",
    "cleanroom-pref-rw-reader-enabled": "啟用 Reader 工作流選單",
    "cleanroom-pref-rw-status-available": "可用狀態",
    "cleanroom-pref-rw-read-status-available": "可用閱讀狀態",
    "cleanroom-pref-research-columns-section": "研究欄位",
    "cleanroom-pref-research-columns-hint": "註冊本地唯讀條目欄位；可在 Zotero 的欄位選擇器中顯示或隱藏。",
    "cleanroom-pref-rw-tags-column": "標籤欄位",
    "cleanroom-pref-rw-text-tags-column": "文字標籤欄位",
    "cleanroom-pref-rw-status-column": "狀態欄位",
    "cleanroom-pref-rw-rating-column": "評分欄位",
    "cleanroom-pref-rw-remark-column": "備註欄位",
    "cleanroom-pref-rw-creator-column": "創作者欄位",
    "cleanroom-pref-rw-publication-column": "出版物備援欄位",
    "cleanroom-pref-rw-date-added-column": "加入日期欄位",
    "cleanroom-pref-rw-date-modified-column": "修改日期欄位",
    "cleanroom-pref-rw-read-status-column": "閱讀狀態欄位",
    "cleanroom-pref-rw-custom-fields-column": "自訂欄位",
    "cleanroom-pref-rw-custom-fields": "自訂欄位",
    "cleanroom-pref-rw-text-tag-prefix": "文字標籤前綴",
    "cleanroom-pref-rw-status-tag-prefix": "狀態標籤前綴",
    "cleanroom-pref-rw-rating-mark": "評分標記",
    "cleanroom-pref-rw-remark-label": "備註 Extra 標籤",
    "cleanroom-pref-rw-read-status-label": "閱讀狀態 Extra 標籤",
    "cleanroom-pref-rw-progress-label": "閱讀進度 Extra 標籤",
    "cleanroom-column-tags": "標籤",
    "cleanroom-column-text-tags": "文字標籤",
    "cleanroom-column-status": "狀態",
    "cleanroom-column-rating": "評分",
    "cleanroom-column-remark": "備註",
    "cleanroom-column-creator": "創作者",
    "cleanroom-column-publication": "出版物",
    "cleanroom-column-date-added": "加入日期",
    "cleanroom-column-date-modified": "修改日期",
    "cleanroom-column-read-status": "閱讀狀態",
    "cleanroom-workflow-section-header": "工作流",
    "cleanroom-workflow-section-sidenav": "工作流",
    "cleanroom-workflow-empty": "選取條目後可編輯工作流欄位。",
    "cleanroom-workflow-field-status": "狀態",
    "cleanroom-workflow-field-rating": "評分",
    "cleanroom-workflow-field-read-status": "閱讀狀態",
    "cleanroom-workflow-field-progress": "進度",
    "cleanroom-workflow-field-text-tags": "文字標籤",
    "cleanroom-workflow-field-remark": "備註",
    "cleanroom-workflow-summary-title": "本地摘要",
    "cleanroom-workflow-summary-attachments": "附件",
    "cleanroom-workflow-summary-related": "關聯條目",
    "cleanroom-workflow-summary-relations": "關係",
    "cleanroom-workflow-summary-tags": "標籤",
    "cleanroom-workflow-summary-status": "狀態",
    "cleanroom-workflow-summary-remark": "備註",
    "cleanroom-workflow-save": "儲存",
    "cleanroom-workflow-clear": "清理",
    "cleanroom-workflow-item-menu": "工作流",
    "cleanroom-workflow-collection-menu": "合集工作流",
    "cleanroom-workflow-reader-menu": "工作流",
    "cleanroom-workflow-reader-sync-progress": "同步閱讀進度",
    "cleanroom-workflow-reader-toolbar": "工作流",
    "cleanroom-workflow-reader-view-progress": "記錄頁面進度",
    "cleanroom-workflow-annotation-reviewed": "標記批註已處理",
    "cleanroom-workflow-annotation-tag": "加入工作流標籤",
    "cleanroom-workflow-annotation-color": "設定工作流顏色",
    "cleanroom-workflow-menu-set-status": "設定狀態",
    "cleanroom-workflow-menu-set-rating": "設定評分",
    "cleanroom-workflow-menu-add-tag": "加入文字標籤",
    "cleanroom-workflow-menu-set-remark": "設定備註：需要跟進",
    "cleanroom-workflow-menu-clear": "清理工作流欄位",
    "cleanroom-workflow-stat-total": "總數",
    "cleanroom-workflow-stat-todo": "待讀",
    "cleanroom-workflow-stat-reading": "在讀",
    "cleanroom-workflow-stat-done": "已讀",
    "cleanroom-workflow-stat-missing-attachments": "缺附件",
    "cleanroom-workflow-stat-missing-remark": "缺備註",
    "cleanroom-workflow-stat-ratings": "評分",
    "cleanroom-workflow-stat-tags": "標籤",
    "cleanroom-rg-item-menu-label": "顯示關係圖",
    "toolsbox-menu-annotation-manager": "批註管理器",
    "toolsbox-tab-manager-button": "分頁管理器",
    "item-count": "你有 {count} 個條目。",
    "greeting": "你好，{name}！",
    "progress-status": "正在處理 {current}/{total}...",
    "items-selected": "已選取 {count} 個條目。",
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
  const lowered = normalized.toLowerCase();

  // 中文变体按简繁体优先映射到现有资源包
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
