# 使用指南

本指南帮助你快速上手 Zotero Cleanroom Template 框架开发插件。

## 目录

- [快速开始](#快速开始)
- [项目配置](#项目配置)
- [核心概念](#核心概念)
- [模块使用](#模块使用)
- [完整示例](#完整示例)
- [Zotero 真机测试](#zotero-真机测试)
- [Agent 接手流程](#agent-接手流程)
- [调试技巧](#调试技巧)
- [发布流程](#发布流程)

---

## 快速开始

### 1. 克隆项目

```bash
git clone <your-fork-url> my-plugin
cd my-plugin
```

### 2. 配置插件信息

编辑 `config/addon.config.json`：

```json
{
  "addonId": "my-plugin@example.com",
  "addonName": "My Plugin",
  "addonRef": "myplugin",
  "addonVersion": "0.1.0",
  "description": "A Zotero plugin",
  "author": "Your Name",
  "homepage": "https://github.com/yourname/my-plugin",
  "updateURL": "https://github.com/yourname/my-plugin/releases/download/release/update.json",
  "strictMinVersion": "6.999",
  "strictMaxVersion": "8.*",
  "prefsPrefix": "extensions.zotero.myplugin",
  "instanceKey": "MyPlugin"
}
```

### 3. 构建与加载

```bash
npm run build
npm run package
```

在 Zotero 中：
1. 打开 工具 → 开发者 → 管理附加组件
2. 点击 "Install Add-on From File"
3. 选择 `dist/myplugin-0.1.0.xpi`

说明：`updateURL` 在 Zotero 7/8 的实际安装链路中应视为必填。留空时，构建虽然可能完成，但 Zotero 会把生成的包判为无效。
说明：当前仓库 `config/addon.config.json` 中落地的 Gitee `updateURL` 仅用于这个模板项目自身的远端发布验收与测试；如果你是基于模板开发自己的插件，必须先替换 `addonId`、`homepage` 和 `updateURL`，不能继续沿用模板仓库的发布地址。
说明：`build/` 与 `dist/` 都是本地可再生工件，已被 `.gitignore` 忽略；正常 `git push` 不会上传这些产物。若要交付纯源码，请使用 `npm run export:project`，不要直接压缩整个工作目录。
说明：如果你在补 release / toolchain 测试，不要把仓库里已有的 `build/` / `dist/` 当稳定输入；需要先在测试里准备 fresh 工件，或改用临时 fixture。

### 4. Zotero 真机测试

复制 `.env.example` 为 `.env.local`，至少填写：

```ini
ZOTERO_PLUGIN_ZOTERO_BIN_PATH=/Applications/Zotero.app/Contents/MacOS/zotero
```

然后使用：

```bash
npm run zotero:smoke
npm run zotero:dev
npm run zotero:watch
npm run zotero:console
npm run zotero:test
```

- `zotero:smoke`：自动启动隔离 Zotero，临时安装当前 `.xpi`，验证成功后退出
- `zotero:dev`：自动启动隔离 Zotero，安装插件后保持窗口打开
- `zotero:watch`：监听 `src/`、`addon-static/`、`config/` 变化，重打包并通过 RDP reload，随后执行健康检查；若失败，会自动尝试恢复，并输出 `dist/zotero-watch-status.{json,md}`
- `zotero:console`：在 `zotero:dev` 基础上追加 `--jsdebugger`，请求 Zotero 拉起内置 Browser Toolbox
- `zotero:test`：在 Zotero 主进程内执行 `zotero-tests/*.test.js`
- `agent:monitor` / `agent:dashboard` / `agent:gate`：会继续消费 `dist/zotero-watch-status.json`，并读取 `dist/agent-zotero-e2e.json`、`dist/agent-zotero-autofix.json`，把热重载状态、真机闭环结果、自动恢复摘要、恢复步骤耗时与失败分布纳入 agent 开发闭环；其中开发档位的 `agent:gate` 会把 `watch` 异常、Zotero E2E 失败、E2E 结果过期，或 `autofix` 仍落后于最新失败 E2E 视为需要先处理的问题

详细说明见 [Zotero 测试与调试](./ZOTERO_TESTING.md)。

---

## Agent 接手流程

如果一个新的开发 agent 接手这个项目，默认按下面顺序推进：

1. 先读取 `docs/CURRENT_BACKLOG.md` 的“当前单一事实源”，不要直接根据旧 `dist/` 工件、README 历史记录或单次命令输出判断当前主线。
2. 先执行 `npm run check`，确保源码、配置、文档 truth 与 clean-room 门禁处于一致状态。
3. 如果 `config/addon.config.json` 仍是模板默认值，例如 `addonId=cleanroom-template@example.com`、`author=Your Team`、模板仓库 `homepage` 或模板专用 `updateURL`，先暂停功能开发，并先向用户确认：`addonName`、`addonId`、`addonRef`、`author`、`homepage`、`updateURL`，以及是否保留完整 agent 工程链还是导出纯项目。
4. 涉及运行时、UI、场景或宿主集成的改动，优先执行 `npm run agent:zotero:e2e`；只有需要连续热重载观察时再使用 `npm run zotero:watch`。
5. 每轮改动后都执行 `npm run agent:monitor` 和 `npm run agent:gate`，以 gate 是否通过作为“是否继续推进”的主判据。
6. 只有当前任务明确属于发布链时，才进入 `npm run release:plan -> npm run release:upload -- --provider <provider> --release-tag <tag> --target-base-url <url> -> 手动上传远端产物 -> npm run release:preflight -- --verify-remote -> npm run release:prepare -> npm run release:matrix -> npm run agent:gate:release`。
7. 如果只是要导出纯源码或模板交付物，使用 `npm run export:project`，不要直接复制整个工作目录。

补充说明：

- 如果你调整了 `config/project-validation-overrides.json` 或 `config/project-expansion-wave.json`，同时也要更新 `docs/CURRENT_BACKLOG.md`，让机器可读 mirror 和人类可读 truth 保持同轮一致。
- mirror 负责表达当前批次的验证/扩展判定，truth 负责表达当前阶段结论；不要让两者分别记录不同 scope 或不同 acceptanceTrack。

---

## 项目配置

### 目录结构

```
my-plugin/
├── config/
│   └── addon.config.json    # 插件配置
├── src/
│   ├── main.js              # 入口文件
│   ├── app/                 # 应用层
│   ├── core/                # 核心模块
│   ├── features/            # 功能模块
│   ├── utils/               # 工具模块
│   └── platform/            # 平台适配
├── types/                   # TypeScript 类型
├── docs/                    # 文档
└── scripts/                 # 构建脚本
```

### 配置说明

| 字段 | 说明 | 示例 |
|------|------|------|
| `addonId` | 插件唯一标识 | `my-plugin@example.com` |
| `addonName` | 显示名称 | `My Plugin` |
| `addonRef` | 构建目录名 | `myplugin` |
| `updateURL` | 发布更新清单地址，Zotero 7/8 安装必填 | `https://github.com/yourname/my-plugin/releases/download/release/update.json` |
| `instanceKey` | 全局实例名 | `MyPlugin` |
| `strictMinVersion` | 最低 Zotero 版本 | `7.0` |
| `strictMaxVersion` | 最高 Zotero 版本 | `8.*` |
| `prefsPrefix` | 偏好设置前缀 | `extensions.zotero.myplugin` |

---

## 核心概念

### 生命周期

```
idle → starting → running → stopping
```

框架自动管理状态转换，防止重复初始化。

### 模块组合

```javascript
// src/app/plugin.js
import { createLogger } from "../core/logger.js";
import { createPreferenceStore } from "../core/prefs.js";
import { createLifecycleManager } from "../core/lifecycle.js";
import { createMenuManager } from "../features/menu-manager.js";

export function createPlugin(options) {
  const logger = createLogger({ ... });
  const prefs = createPreferenceStore({ ... });
  const lifecycle = createLifecycleManager({ logger });
  const menu = createMenuManager({ logger, lifecycle, pluginID });

  return {
    start: async () => { /* ... */ },
    shutdown: () => lifecycle.reset()
  };
}
```

### 资源清理

所有模块支持自动清理：

```javascript
// 注册清理函数
lifecycle.trackCleanup(() => {
  // 清理逻辑
});

// 插件卸载时自动调用
```

---

## 模块使用

### Logger - 日志系统

```javascript
import { createLogger } from "./core/logger.js";

const logger = createLogger({
  hostLog: (msg) => Zotero.debug(msg),
  level: "debug"  // debug | info | warn | error
});

logger.debug("调试信息", { key: "value" });
logger.info("普通信息");
logger.warn("警告");
logger.error("错误", { error: err });
```

### Prefs - 偏好设置

```javascript
import { createPreferenceStore } from "./core/prefs.js";

const prefs = createPreferenceStore({
  prefBranch: "extensions.myplugin",
  defaults: {
    enabled: true,
    count: 0,
    name: "default"
  }
});

prefs.get("enabled");           // true
prefs.set("count", 10);         // 保存
prefs.onChange((key) => {       // 监听变化
  console.log(`${key} changed`);
});
```

### Notifier - 事件通知

```javascript
import { createNotifier, EVENTS } from "./core/notifier.js";

const notifier = createNotifier({ logger, lifecycle });

// 订阅条目添加事件
notifier.subscribe(["item"], (event, type, ids) => {
  if (event === EVENTS.ADD) {
    console.log("New items:", ids);
  }
});

// 一次性订阅
notifier.once(["collection"], (event, type, ids) => {
  console.log("Collection event:", event);
});
```

### Keyboard - 快捷键

```javascript
import { createKeyboardManager } from "./core/keyboard.js";

const keyboard = createKeyboardManager({ logger, lifecycle });

keyboard.registerShortcut({
  key: "S",
  modifiers: ["ctrl", "shift"],
  handler: (event) => {
    console.log("Shortcut triggered!");
  },
  description: "Save all"
});

// 或使用字符串格式
keyboard.registerShortcut({
  shortcut: "Ctrl+Shift+S",
  handler: (event) => {}
});
```

### Menu Manager - 菜单管理

```javascript
import { createMenuManager, MENU_TARGETS } from "./features/menu-manager.js";

const menu = createMenuManager({ logger, lifecycle, pluginID });

// 注册工具菜单
menu.registerToolsMenuItem({
  label: "My Tool",
  icon: "chrome://myplugin/content/icon.svg",
  onCommand: (event, context) => {
    console.log("Tool clicked");
  }
});

// 注册右键菜单
menu.registerContextMenuItem({
  label: "Process Selected",
  onCommand: (event, context) => {
    const items = context.items;
    console.log("Selected items:", items);
  },
  onShowing: (event, context) => {
    context.setVisible(context.items?.length > 0);
  }
});

// 使用官方 API
menu.register({
  target: MENU_TARGETS.LIBRARY_ITEM,
  menus: [{
    menuType: "menuitem",
    label: "My Action",
    onCommand: (event, context) => {}
  }]
});
```

### Item Pane - 条目面板

```javascript
import { createItemPane } from "./features/item-pane.js";

const itemPane = createItemPane({ logger, lifecycle, pluginID });

// 注册自定义 Section
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
    const div = doc.createElement("div");
    div.textContent = `Item: ${item?.getField("title")}`;
    body.appendChild(div);
  }
});

// 注册 InfoRow
itemPane.registerInfoRow({
  rowID: "custom-field",
  label: { l10nID: "myplugin.custom-field" },
  position: "afterCreators",
  editable: true,
  onGetData: ({ item }) => item?.getField("callNumber") || "",
  onSetData: ({ item, value }) => {
    item.setField("callNumber", value);
    item.saveTx();
  }
});
```

> 注意：Zotero 官方 ItemPane API 要求 Section / InfoRow 标签通过 `l10nID` 提供。本项目当前建议优先直接使用 `registerSection()` / `registerInfoRow()`，便捷 helper 也要显式传 `headerL10nID` / `labelL10nID`，不要把纯字符串标签当作稳定契约。

### Item Tree - 条目列表

```javascript
import { createItemTree } from "./features/item-tree.js";

const itemTree = createItemTree({ logger, lifecycle, pluginID });

// 注册自定义列
itemTree.registerColumn({
  dataKey: "charCount",
  label: "Characters",
  dataProvider: (item) => item.getField("title").length,
  renderCell: (index, data, column, isFirstColumn, doc) => {
    const span = doc.createElement("span");
    span.textContent = data;
    span.style.color = data > 100 ? "red" : "inherit";
    return span;
  }
});

// 使用渲染器工厂
const renderer = itemTree.createDefaultCellRenderer({ color: "blue" });
```

### Reader - 阅读器

```javascript
import { createReader, READER_TYPES } from "./features/reader.js";

const reader = createReader({ logger });

// 获取所有阅读器
const readers = reader.getAllReaders();
const activeSummary = reader.getActiveSummary();
const uiState = reader.getReaderUIStateSnapshot(12345);
const interaction = reader.getReaderInteractionSnapshot(12345);

// 打开阅读器
await reader.openReader({
  itemID: 12345,
  openInBackground: false
});

// 获取阅读器类型
const type = reader.getReaderType(12345); // 'pdf' | 'epub' | 'snapshot'

// 注解操作
const annotations = reader.getAnnotations(attachmentID);
await reader.createAnnotation(attachmentID, {
  type: "note",
  comment: "中文批注",
  pageIndex: 0
});
await reader.updateAnnotation(annotationID, {
  comment: "更新后的说明",
  color: "#00aa88"
});
await reader.deleteAnnotation(annotationID);
```

`activeSummary` 会给出当前活动 reader 的 `itemID`、`tabID`、`type` 和 `annotationCount`，适合用在命令面板、菜单项显隐和 Toast 摘要这类轻量 demo。

`uiState` 会给出更接近真实交互层的宿主状态，例如侧栏开关与宽度、工具模式、导航能力、文本选择注解模式、主/副视图状态。

`interaction` 会进一步给出批注明细、可编辑批注数量、匹配窗口状态、`uiState` 和当前 reader 是否处于活动态，适合给 agent 做“Reader 交互是否真到位”的宿主侧判断。

`createAnnotation()` 现在支持更友好的输入：即使只给 `type / comment / pageIndex`，模板也会自动补齐 `key / pageLabel / sortIndex / position`，便于 agent 和人工在控制台里快速做批注回环验证。

### Dialog - 对话框

```javascript
import { createDialogBuilder } from "./utils/dialog.js";

const dialog = createDialogBuilder({ logger, uiFactory, i18n });

// 基础对话框
await dialog.alert(window, "Title", "Message");
const confirmed = await dialog.confirm(window, "Confirm", "Continue?");
const { confirmed, value } = await dialog.prompt(window, "Input", "Enter:", "default");

// 选择对话框
const result = await dialog.select(window, "Choose", "Select:", ["A", "B", "C"], 0);

// 保存确认
const saveResult = await dialog.askSave(window, "Save?", "Save changes?");
// 返回: 'save' | 'dontsave' | 'cancel'
```

### Progress Window - 进度窗口

```javascript
import { createProgressNotifier, NOTIFICATION_TYPES } from "./utils/progress-window.js";

const progress = createProgressNotifier({ logger, i18n });

// 显示进度
const id = progress.showProgress({
  title: "Processing",
  message: "Step 1 of 3",
  progress: 0
});

progress.updateProgress(id, 50, "Step 2 of 3");
progress.closeProgress(id);

// Toast 通知
progress.showToast("Done!", NOTIFICATION_TYPES.SUCCESS, 3000);
progress.showSuccess("Success!");
progress.showError("Error!");
```

---

## 完整示例

创建一个简单的插件：

```javascript
// src/main.js
import { createPlugin } from "./app/plugin.js";
import { readRuntimeConfig } from "./app/runtime-config.js";

let plugin;

export async function bootstrapPlugin() {
  if (plugin) return;

  const config = readRuntimeConfig();
  plugin = createPlugin({ globalScope: globalThis, config });

  await plugin.start();

  globalThis.Zotero[config.instanceKey] = {
    onWindowLoad: (window) => plugin.onWindowLoad(window),
    onWindowUnload: (window) => plugin.onWindowUnload(window),
    shutdown: () => plugin.shutdown(),
    api: plugin.api,
  };
}
```

```javascript
// src/app/plugin.js
import { createLogger } from "../core/logger.js";
import { createPreferenceStore } from "../core/prefs.js";
import { createLifecycleManager } from "../core/lifecycle.js";
import { createMenuManager, MENU_TARGETS } from "../features/menu-manager.js";

export function createPlugin({ globalScope, config }) {
  const Zotero = globalScope.Zotero;

  const logger = createLogger({
    hostLog: (msg) => Zotero.debug(`[${config.addonName}] ${msg}`),
    level: "debug"
  });

  const prefs = createPreferenceStore({
    prefBranch: config.prefsPrefix,
    defaults: { enabled: true }
  });

  const lifecycle = createLifecycleManager({ logger });

  const menu = createMenuManager({
    logger,
    lifecycle,
    pluginID: config.addonId
  });

  async function start() {
    logger.info("Plugin starting...");

    // 注册菜单
    menu.registerToolsMenuItem({
      label: `${config.addonName} Settings`,
      onCommand: () => {
        Zotero.Utilities.Internal.openPreferences(config.addonRef);
      }
    });
  }

  function onWindowLoad(window) {
    logger.debug("Window loaded");
  }

  function onWindowUnload(window) {
    logger.debug("Window unloaded");
  }

  function shutdown() {
    lifecycle.reset();
    logger.info("Plugin shutdown");
  }

  return { start, onWindowLoad, onWindowUnload, shutdown };
}
```

---

## 调试技巧

### 启用调试日志

```javascript
// 在偏好设置中设置
Zotero.Prefs.set("extensions.myplugin.logLevel", "debug");
```

### 使用 Browser Toolbox

1. 打开 Zotero
2. 工具 → 开发者 → Browser Toolbox
3. 在 Console 中调试

### 查看日志

```javascript
// 在代码中
Zotero.debug("My debug message");

// 或使用框架 logger
logger.debug("Debug info", { data });
```

### 热重载开发

```bash
# 构建
npm run build

# 在 Zotero 中重新加载插件
# 工具 → 开发者 → 重新载入附加组件
```

---

## 发布流程

### 1. 更新版本

编辑 `config/addon.config.json` 更新版本号。

### 2. 构建发布包

```bash
npm run package
```

这一步会自动生成：

- `dist/myplugin-1.0.0.xpi`
- `dist/update.json`
- `dist/release-manifest.json`

`update.json` 会基于 `config/addon.config.json` 中的 `addonId`、`addonVersion`、`updateURL` 自动生成；不要再手写第二份更新清单。

### 3. 先生成上传计划壳，再手动上传

先运行：

```bash
npm run release:upload -- --provider github-release --release-tag v1.0.0 --target-base-url https://github.com/<owner>/<repo>/releases/download/v1.0.0/
```

这一步只会校验本地 `.xpi` / `update.json` / `release-manifest.json` / `release-preflight.json` 是否自洽，并生成：

- `dist/release-upload-plan.json`
- `dist/release-upload-plan.md`

它不会执行真实上传。确认计划无误后，再把 `dist/myplugin-1.0.0.xpi` 与 `dist/update.json` 一起上传到你的 Release 资产或静态分发地址。

### 4. 远端校验

```bash
npm run release:preflight -- --verify-remote
```

这一步会检查远端 `update.json` 是否可访问、是否包含当前 `addonId` 的首条更新记录，以及其中的 `update_link` 是否与本地发布产物一致。

### 5. 发布到 GitHub / 自定义发布端

以 GitHub Release 为例：

```bash
gh release create v1.0.0 dist/myplugin-1.0.0.xpi dist/update.json
```

远端上传完成后，再执行：

```bash
npm run release:prepare
npm run release:matrix
```

用于刷新 release-facing 摘要与 gate 消费链。

### 6. `update.json` 示例

自动生成出来的 `update.json` 结构如下：

```json
{
  "addons": {
    "my-plugin@example.com": {
      "updates": [
        {
          "version": "1.0.0",
          "update_link": "https://github.com/you/myplugin/releases/download/v1.0.0/myplugin-1.0.0.xpi",
          "applications": {
            "zotero": {
              "strict_min_version": "6.999"
            }
          }
        }
      ]
    }
  }
}
```

---

## 常见问题

### Q: 插件加载失败？

检查 `addon.config.json` 中的 `addonId` 是否正确。

### Q: 菜单不显示？

确保使用正确的 `MENU_TARGETS`，并在 `onShowing` 中设置可见性。

### Q: 类型提示不工作？

确保 IDE 使用 `types/` 目录中的类型定义。

### Q: 如何添加本地化？

1. 在 `addon-static/locale/<locale>/main.ftl` 中新增或修改消息键，至少同步维护 `en-US`、`zh-CN`、`zh-TW`
2. 官方注册面优先使用 `l10nID`，例如 ItemPane / 菜单 / 偏好设置面板等宿主契约点
3. 修改后执行 `npm run verify`；如果改动影响宿主 UI，再补跑 `npm run agent:zotero:e2e`

---

## 更多资源

- [API 参考](API.md)
- [架构说明](ARCHITECTURE.md)
- [Zotero 官方文档](https://www.zotero.org/support/dev/)
