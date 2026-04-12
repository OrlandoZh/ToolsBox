# 基础示例插件

这是一个展示 Zotero Cleanroom Template 框架使用的完整示例。

## 功能演示

### Core 模块
- **Logger** - 日志记录
- **Prefs** - 偏好设置存储
- **Lifecycle** - 资源清理
- **Notifier** - 事件监听

### Features 模块
- **MenuManager** - 工具菜单、条目菜单项、收藏集菜单
- **ItemPane** - 自定义 Section、InfoRow
- **Reader** - 阅读器工具

### Utils 模块
- **ProgressNotifier** - 进度显示、Toast 通知

## 代码结构

```
basic-plugin/
└── plugin.js          # 主插件文件
```

## 使用方法

### 1. 复制到项目

```bash
cp -r examples/basic-plugin/plugin.js src/app/
```

### 2. 修改 main.js

```javascript
// src/main.js
import { createExamplePlugin } from "./app/plugin.js";
import { readRuntimeConfig } from "./app/runtime-config.js";

let plugin;

export async function bootstrapPlugin() {
  if (plugin) return;

  const config = readRuntimeConfig();
  plugin = createExamplePlugin({
    config,
    Zotero: globalThis.Zotero
  });

  await plugin.start();

  globalThis.Zotero[config.instanceKey] = {
    onWindowLoad: (window) => plugin.onWindowLoad(window),
    onWindowUnload: (window) => plugin.onWindowUnload(window),
    shutdown: () => plugin.shutdown(),
  };
}
```

### 3. 构建测试

```bash
npm run build
```

## 核心代码解析

### 初始化模块

```javascript
const logger = createLogger({
  hostLog: (msg) => Zotero.debug(`[${config.addonName}] ${msg}`),
  level: "debug"
});

const prefs = createPreferenceStore({
  prefBranch: `extensions.${config.addonRef}`,
  defaults: { enabled: true }
});

const lifecycle = createLifecycleManager({ logger });
```

### 注册菜单

```javascript
// 工具菜单
menu.registerToolsMenuItem({
  label: "My Tool",
  onCommand: (event, context) => {
    console.log("Clicked!");
  }
});

// 条目菜单项
menu.registerItemMenuItem({
  label: "Process Selected",
  onShowing: (event, context) => {
    context.setVisible(context.items?.length > 0);
  }
});
```

> 当前模板默认推荐优先使用 scene helper，例如 `registerItemMenuItem()`、`registerCollectionMenuItem()`、`registerItemPaneInfoRowMenuItem()`、`registerReaderMenubarViewMenuItem()`。

### 注册面板

```javascript
itemPane.registerSection({
  paneID: "my-section",
  header: { l10nID: "my-section-label" },
  onRender: ({ doc, body, item }) => {
    body.textContent = item?.getField("title");
  }
});
```

> 注意：`ItemPane` 的 Section / InfoRow 标签应提供 `l10nID` 并配套本地化资源。

### 事件监听

```javascript
notifier.subscribe(["item"], (event, type, ids) => {
  if (event === EVENTS.ADD) {
    console.log("New items:", ids);
  }
});
```

## 扩展建议

基于此示例，你可以：

1. 添加更多菜单项
2. 创建复杂的面板 UI
3. 集成外部 API
4. 添加键盘快捷键
5. 使用 Reader API 处理 PDF
