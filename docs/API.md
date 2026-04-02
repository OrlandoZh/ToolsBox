# API 参考

本文档描述 Zotero Cleanroom Template 的所有公开 API。

## 目录

- [Core 模块](#core-模块)
  - [Logger](#logger)
  - [Prefs](#prefs)
  - [Lifecycle](#lifecycle)
  - [I18n](#i18n)
  - [UI Factory](#ui-factory)
  - [Notifier](#notifier)
  - [Keyboard](#keyboard)
- [Features 模块](#features-模块)
  - [Menu Manager](#menu-manager)
  - [Item Pane](#item-pane)
  - [Item Tree](#item-tree)
  - [Prompt](#prompt)
  - [Reader](#reader)
  - [Preference Panes](#preference-panes)
- [Plugin Runtime API](#plugin-runtime-api)

---

## Core 模块

### Logger

结构化日志记录器，支持级别过滤。

```javascript
import { createLogger } from "./core/logger.js";

const logger = createLogger({
  hostLog: (message, details) => Zotero.debug(message),
  level: "info"
});

// 方法
logger.setLevel("debug");    // 设置日志级别
logger.getLevel();           // 获取当前级别
logger.debug("msg", { key: "value" });
logger.info("msg", { key: "value" });
logger.warn("msg", { key: "value" });
logger.error("msg", { key: "value" });
```

**级别**：`debug` < `info` < `warn` < `error`

---

### Prefs

偏好设置存储，带观察者模式。

```javascript
import { createPreferenceStore } from "./core/prefs.js";

const prefs = createPreferenceStore({
  prefBranch: "extensions.zotero.myplugin",
  defaults: {
    enabled: true,
    count: 0,
    name: "default"
  }
});

// 方法
prefs.ensureDefaults();                      // 确保默认值已设置
prefs.get("enabled");                        // 获取值
prefs.set("enabled", false);                 // 设置值
prefs.clear("enabled");                      // 清除用户设置
const cleanup = prefs.onChange((key) => {}); // 监听变化
cleanup();                                   // 取消监听
```

---

### Lifecycle

资源清理追踪管理。

```javascript
import { createLifecycleManager } from "./core/lifecycle.js";

const lifecycle = createLifecycleManager({ logger });

// 方法
lifecycle.trackCleanup(() => {
  // 清理逻辑
});

lifecycle.reset(); // 执行所有清理函数
```

---

### I18n

国际化，支持变量插值。

```javascript
import { createI18n } from "./core/i18n.js";

const i18n = createI18n();

// 方法
i18n.locale;                              // 当前语言
i18n.t("greeting");                       // 获取字符串
i18n.t("greeting", { name: "World" });    // 带变量插值
i18n.t("missing", "Default");             // 带回退值
i18n.has("greeting");                     // 检查键是否存在
i18n.raw("greeting");                     // 获取原始模板
i18n.tn("items", 5);                      // 复数形式
i18n.keys();                              // 获取所有键
```

**变量插值格式**：`"Hello, {name}!"` → `i18n.t("greeting", { name: "World" })` → `"Hello, World!"`

---

### UI Factory

统一的 UI 元素创建接口。

```javascript
import { createUIFactory } from "./core/ui-factory.js";

const ui = createUIFactory({ logger });

// 创建元素
const { element, cleanup } = ui.createElement(doc, "button", {
  namespace: "xul",           // 'xul' | 'html'
  id: "my-button",
  attributes: { label: "Click" },
  styles: { color: "red" },
  listeners: [{ type: "command", listener: () => {} }],
  children: [
    { tag: "label", text: "Button" },
    "plain text"
  ]
});

// 便捷方法
ui.createXULElement(doc, "menuitem", { ... });
ui.createHTMLElement(doc, "div", { ... });

// 工具方法
ui.setAttributes(element, { id: "new-id" });
ui.setStyles(element, { color: "blue" });
const cleanup = ui.addEventListeners(element, [
  { type: "click", listener: () => {} }
]);
ui.appendChildren(parent, children, doc);
```

---

### Notifier

Zotero 事件通知管理。

```javascript
import { createNotifier, EVENT_TYPES, EVENTS } from "./core/notifier.js";

const notifier = createNotifier({ logger, lifecycle });

// 订阅事件
const id = notifier.subscribe(
  ["item", "collection"],
  (event, type, ids, extraData) => {
    if (event === EVENTS.ADD && type === EVENT_TYPES.ITEM) {
      console.log("Items added:", ids);
    }
  }
);

// 方法
notifier.unsubscribe(id);       // 取消订阅
notifier.unsubscribeAll();      // 取消所有订阅
notifier.once(["item"], () => {}); // 一次性订阅
notifier.waitFor("add", "item", 30000); // 等待特定事件
notifier.getActiveCount();      // 获取活跃订阅数
notifier.has(id);               // 检查订阅是否存在
```

**事件类型**：`item`, `collection`, `search`, `tag`, `group`, `setting`, `tab`, `file`

**事件动作**：`add`, `modify`, `delete`, `trash`, `remove`, `move`, `refresh`

---

### Keyboard

键盘快捷键管理。

```javascript
import { createKeyboardManager, MODIFIERS } from "./core/keyboard.js";

const keyboard = createKeyboardManager({ logger, lifecycle });

// 注册快捷键
const id = keyboard.registerShortcut({
  key: "S",
  modifiers: ["ctrl", "shift"],
  handler: (event) => {},
  description: "Save all",
  preventDefault: true
});

// 或使用字符串格式
keyboard.registerShortcut({
  shortcut: "Ctrl+Shift+S",
  handler: (event) => {}
});

// 方法
keyboard.unregister(id);
keyboard.unregisterAll();
keyboard.isMacOS();              // 检测 macOS
keyboard.formatShortcut("S", { ctrl: true }); // 格式化显示
keyboard.getAllShortcuts();
```

**修饰键**：`ctrl`, `alt`, `shift`, `meta`

**平台适配**：macOS 上 `ctrl` 自动转换为 `meta` (Command)

---

## Features 模块

### Menu Manager

菜单系统，使用 Zotero.MenuManager 官方 API。

```javascript
import {
  createMenuManager,
  MENU_TARGETS,
  MENU_TYPES
} from "./features/menu-manager.js";

const menu = createMenuManager({ logger, lifecycle, pluginID });

// 核心注册方法 - 使用官方 API
menu.register({
  id: "my-menu",
  target: MENU_TARGETS.LIBRARY_ITEM,
  menus: [{
    menuType: MENU_TYPES.MENUITEM,
    label: "My Action",
    icon: "chrome://myplugin/content/icon.svg",
    onCommand: (event, context) => {
      console.log("Items:", context.items);
    },
    onShowing: (event, context) => {
      context.setVisible(context.items?.length > 0);
    }
  }]
});

// 便捷方法：工具菜单
menu.registerToolsMenuItem({
  label: "My Tool",
  onCommand: (event, context) => {}
});

// 便捷方法：右键菜单
menu.registerContextMenuItem({
  label: "My Action",
  onCommand: (event, context) => {}
});

// 方法
menu.unregister(menuId);
menu.unregisterAll();
menu.isOfficialAPIAvailable();
```

**菜单目标（MENU_TARGETS）**：见类型定义文件

---

### Item Pane

ItemPane Section 和 InfoRow 注册。

```javascript
import { createItemPane } from "./features/item-pane.js";

const itemPane = createItemPane({ logger, lifecycle, pluginID });

// 注册自定义面板
itemPane.registerSection({
  paneID: "my-section",
  header: {
    l10nID: "my-plugin-section-header",
    icon: "chrome://myplugin/content/icon.svg"
  },
  sidenav: {
    l10nID: "my-plugin-section-sidenav",
    icon: "chrome://myplugin/content/icon20.svg"
  },
  onRender: ({ doc, body, item }) => {
    body.textContent = `Item: ${item?.getField("title")}`;
  }
});

// 注册自定义信息行
itemPane.registerInfoRow({
  rowID: "my-row",
  label: { l10nID: "my-plugin-info-label" },
  position: "afterCreators",  // 'start' | 'afterCreators' | 'end'
  multiline: true,            // 多行显示
  nowrap: false,              // 不换行
  editable: true,
  onGetData: ({ item }) => item.getField("title"),
  onSetData: ({ item, value }) => {
    item.setField("title", value);
    item.saveTx();
  },
  onItemChange: ({ item, setEnabled }) => {
    setEnabled(item?.isRegularItem());
  }
});
// 方法
itemPane.unregisterSection(paneID);
itemPane.unregisterInfoRow(rowID);
itemPane.refreshInfoRow(rowID);
itemPane.unregisterAll();
itemPane.isAvailable();
```

> 注意：ItemPane 官方 API 对标签的要求是 `l10nID`。当前 `createSimpleSection()` 也要求传入 `headerL10nID`，`createFieldInfoRow()` / `createConditionalInfoRow()` 也要求传入 `labelL10nID`；不要把纯字符串标签当作稳定契约。
---

### Item Tree

ItemTree 自定义列。

```javascript
import { createItemTree } from "./features/item-tree.js";

const itemTree = createItemTree({ logger, lifecycle, pluginID });

// 注册自定义列
itemTree.registerColumn({
  dataKey: "charCount",
  label: "Character Count",
  dataProvider: (item) => item.getField("title").length,
  renderCell: (index, data, column, isFirstColumn, doc) => {
    const span = doc.createElement("span");
    span.textContent = data;
    span.style.color = data > 100 ? "red" : "inherit";
    return span;
  }
});

// 工厂方法
const provider = itemTree.createFieldDataProvider("title");
const renderer = itemTree.createDefaultCellRenderer({ color: "blue" });

// 方法
itemTree.unregisterColumn(dataKey);
itemTree.unregisterAll();
itemTree.isAvailable();
```

---

### Prompt

命令面板集成。

```javascript
import { createCommandPalette } from "./features/prompt.js";

const prompt = createCommandPalette({ logger, lifecycle, pluginID });

// 注册命令
prompt.registerCommand({
  id: "my-command",
  label: "My Command",
  category: "My Plugin",
  handler: (context) => {},
  condition: () => true // 可选显示条件
});

// 方法
prompt.unregisterCommand(commandId);
prompt.unregisterAll();
prompt.executeCommand(commandId, context);
prompt.isAvailable();
```

---

### Reader

PDF/EPUB/Snapshot 阅读器工具和注解操作。

```javascript
import { createReader, READER_TYPES, ANNOTATION_TYPES } from "./features/reader.js";

const reader = createReader({ logger });

// 阅读器操作
const readers = reader.getAllReaders();
const active = reader.getActiveReader();
const summary = reader.getActiveSummary();
const uiState = reader.getReaderUIStateSnapshot(12345);
const interaction = reader.getReaderInteractionSnapshot(12345);
await reader.openReader({ itemID: 12345, openInBackground: false });
const type = reader.getReaderType(12345); // pdf/epub/snapshot
reader.closeByItemID(12345);

// 注解操作
const annotations = reader.getAnnotations(attachmentID);
const annotationIDs = reader.getAnnotationIDs(readerInstance);

await reader.createAnnotation(attachmentID, {
  type: ANNOTATION_TYPES.HIGHLIGHT,
  text: "Selected text",
  color: "#ffd400",
  pageIndex: 0
});

await reader.updateAnnotation(annotationID, { comment: "My note" });
await reader.deleteAnnotation(annotationID);

reader.isAvailable();
reader.isAnnotationsAvailable();
```

`reader.getActiveSummary()` / `reader.getReaderSummary(target)` 会返回 `{ tabID, itemID, type, annotationIDs, annotationCount }`，适合做命令面板或菜单里的轻量 reader 状态展示。

`reader.getReaderUIStateSnapshot(target)` 会额外提供更接近真实交互层、但仍处于宿主可稳定观测范围内的 UI 状态：

- `sidebarOpen` / `sidebarWidth` / `sidebarView`
- `textSelectionAnnotationMode`
- `toolType` / `flowMode` / `splitType`
- `scrollMode` / `spreadMode` / `scale`
- `zoomAutoEnabled` / `zoomPageWidthEnabled` / `zoomPageHeightEnabled`
- `navigation`
- `primaryViewState` / `secondViewState`

`reader.getReaderInteractionSnapshot(target)` 会在此基础上补充：

- `active`
- `selectedAnnotationIDs` / `selectedAnnotationCount`
- `annotationDetails` / `annotationDetailCount`
- `editableAnnotationCount`
- `uiState`
- `windowStates`
- `matchingWindowStates` / `matchingWindowStateCount`

它更适合给 agent 或真机调试链路读取当前 Reader 的“可稳定观测交互状态”。

**阅读器类型（READER_TYPES）**：`PDF`, `EPUB`, `SNAPSHOT`

**注解类型（ANNOTATION_TYPES）**：`HIGHLIGHT`, `NOTE`, `IMAGE`, `INK`, `TEXT`

---

### Preference Panes

偏好设置面板注册。

```javascript
import { createPreferencePanes } from "./features/preference-panes.js";

const prefs = createPreferencePanes({
  logger, lifecycle, pluginID, rootURI
});

prefs.register({
  pluginID,
  src: "chrome://myplugin/content/prefs.xhtml",
  label: "My Plugin Settings",
  image: "chrome://myplugin/content/icon.svg"
});

prefs.open();
prefs.unregister();
```

---

## Plugin Runtime API

插件实例会挂出 `Zotero[instanceKey].api`。其中与 agent 开发最相关的入口如下：

```javascript
const api = Zotero.CleanroomTemplate.api;

api.runtime.getCapabilitySummary();
api.runtime.getCapabilityReport();

api.agent.listScenarios();
api.agent.runScenario("settings-snapshot");
api.agent.listCapabilities();
api.agent.getCapability("multi-window-mount");
api.agent.collectDiagnostics();
api.agent.inspectItem(itemID);
api.agent.describeReader(itemID);
api.agent.inspectReader(itemID);
api.reader.createAnnotation(itemID, {
  type: "note",
  comment: "中文批注",
  pageIndex: 0,
});
```

`api.agent` 当前额外暴露：

- `listCapabilities()`：返回结构化能力地图
- `getCapability(id)`：读取单个能力元数据
- `runScenario("settings-snapshot")`：读取 settings schema 与偏好设置面板快照
- `runScenario("window-snapshot")`：读取主窗口数量与窗口级挂载状态
- `runScenario("capability-manifest")`：返回完整能力地图快照
- `inspectReader(itemID)`：读取更适合 agent 消费的 Reader 交互快照
- `reader.getReaderUIStateSnapshot(itemID)`：读取 Reader 侧栏、工具模式、导航能力和文本选择注解模式等 UI 状态
- `reader.createAnnotation(itemID, data)`：支持传入更友好的批注参数，自动补齐 `key / pageLabel / sortIndex / position`
- `reader.updateAnnotation(annotationID, updates)`：更新批注 comment/color 等基础字段
- `reader.deleteAnnotation(annotationID)`：删除批注并配合 `inspectReader()` 回读结果

建议与 [Agent 能力地图](./AGENT_CAPABILITIES.md) 配合阅读。

---

## Utils 模块

### Dialog

对话框构建器。

```javascript
import { createDialogBuilder, BUTTON_TYPES } from "./utils/dialog.js";

const dialog = createDialogBuilder({ logger, uiFactory, i18n });

// 基础对话框
dialog.alert(window, "Title", "Message");
const confirmed = dialog.confirm(window, "Title", "Continue?");
const { confirmed, value } = dialog.prompt(window, "Title", "Enter value:", "default");
const result = dialog.select(window, "Title", "Choose:", ["A", "B", "C"], 0);

// 保存确认
const saveResult = dialog.askSave(window, "Save?", "Save changes?"); // 'save' | 'dontsave' | 'cancel'

// 自定义对话框
const { window: dialogWin, close } = dialog.custom(window, {
  title: "Custom Dialog",
  content: "<vbox>...</vbox>",
  width: 400,
  height: 300,
  buttons: [
    { label: "OK", type: BUTTON_TYPES.ACCEPT, onClick: () => {} }
  ]
});
```

---

### Progress Window

进度窗口和 Toast 通知。

```javascript
import { createProgressNotifier, NOTIFICATION_TYPES } from "./utils/progress-window.js";

const progress = createProgressNotifier({ logger, i18n });

// 进度窗口
const id = progress.showProgress({
  title: "Processing",
  message: "Step 1 of 3",
  progress: 0,
  closeOnClick: true
});

progress.updateProgress(id, 50, "Step 2 of 3");
progress.closeProgress(id);

// Toast 通知
progress.showToast("Operation completed", NOTIFICATION_TYPES.SUCCESS, 3000);
progress.showSuccess("Success!");
progress.showWarning("Warning!");
progress.showError("Error!");
progress.showInfo("Info!");

// 方法
progress.closeAll();
progress.isProgressWindowAvailable();
```

---

## 类型定义

TypeScript 类型定义位于 `types/` 目录：

```
types/
├── index.d.ts      # 主导出
├── core.d.ts       # Core 模块类型
├── features.d.ts   # Features 模块类型
├── utils.d.ts      # Utils 模块类型
└── platform.d.ts   # Platform 模块类型
```
