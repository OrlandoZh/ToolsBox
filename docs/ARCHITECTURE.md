# 架构说明

本文档描述 Zotero Cleanroom Template 的系统架构和设计决策。

## 设计原则

### 1. 清洁室架构

**目标**：避免 AGPL3.0 许可证污染

**方法**：
- 从功能需求（而非代码）推导实现
- 使用 `SPEC.md` 定义行为规格
- 使用 `npm run cleanroom:audit` 固定开发态 clean-room 门禁
- 发布前使用 `LEGAL_RISK_CHECKLIST.md` 与 `npm run release:preflight` 检查
- 在本地挂载 reference 快照时运行 `npm run cleanroom:sim`

### 2. 零外部依赖

**目标**：完全自包含，无运行时依赖

**方法**：
- 自定义打包器（`scripts/build.mjs`）
- 独立实现所有工具模块
- 不依赖 `zotero-plugin-toolkit` 等外部库

### 3. 分层架构

**目标**：关注点分离，易于维护

**方法**：
- Core 层：通用工具
- Features 层：业务功能
- Platform 层：平台适配
- App 层：组合与编排

### 4. 宿主接口契约优先

**目标**：避免 `src/features/*` 的 Zotero 插件 API 包装层脱离宿主源码自行漂移

**方法**：
- 以 `config/zotero-host-semantic-index.json` 作为字段级宿主语义事实源
- 以 `config/zotero-host-interface-contracts.json` 作为包装层 contract registry
- 以 [Zotero Host Semantic Index](ZOTERO_HOST_SEMANTIC_INDEX.md) 作为字段、枚举、事件和 surface 语义镜像
- 以 [Zotero Host Interface Contracts](ZOTERO_HOST_INTERFACE_CONTRACTS.md) 作为人类可读镜像
- 触达 `menu-manager`、`item-pane`、`item-tree`、`preference-panes`、`reader` 包装层时，先对齐本地 `reference/zotero-main`
- 先更新 semantic index / contract / doc / tests，再修改实现；不要只靠运行时症状反推宿主接口
- 日常开发运行 `npm run agent:host:guard` 与 `npm run agent:host:semantic:guard`，推进 gate / release 前由 strict guard 严格兜底

### 5. 条件视觉验证，不覆盖独立硬阻断

**目标**：避免通用 validation pipeline 建议压过更具体的恢复动作，导致开发流程被错误地重新拉回视觉审查或泛化闭环。

**方法**：
- `validationDecision` 只决定“是否需要视觉证据”，不覆盖 `watch`、`watch-recovery`、workspace/host/provenance guard 的独立阻断语义
- 一旦存在更具体的恢复动作，frontpage / gate / monitor 优先给出该恢复动作
- 只有真实可见面或视觉运行时信号触发时，才把当前批次升级为视觉主路径

### 6. Reference-derived 技术链沉淀

**目标**：把 `reference/plugin/*` 中可泛化的实现模式沉淀成模板原语，而不是让每轮开发重新按项目记忆 reference。

**方法**：
- UI 路线选型继续看 [UI Creation Paths](UI_CREATION_PATHS.md)
- 跨项目技术链抽象看 [Reference Plugin Technical Chains](REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)
- 当前模板已经把其中几条常见链路沉淀成默认原语：
  - `src/features/preference-panes.js`
  - `src/utils/window-shell.js`
  - `src/app/host-action-catalog.js`
  - `src/app/host-actions.js`
  - `src/services/registry.js`
  - `src/services/file-state-store.js`
  - `src/platform/zotero-file-storage.js`
  - `src/platform/zotero-json-state-store.js`
  - `src/services/resource-loader.js`
  - `src/services/task-runner.js`
  - `src/services/task-queue.js`
- 继续坚持“借模式，不借产品实现；借生命周期，不借 reference 的高风险边界”

---

## 模块分层

```
┌─────────────────────────────────────────────────────────┐
│                       App Layer                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                 plugin.js                        │   │
│  │  - 组合所有模块                                   │   │
│  │  - 管理生命周期                                   │   │
│  │  - 处理配置                                      │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Features Layer                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  menu-   │ │  item-   │ │  item-   │ │  prompt  │  │
│  │ manager  │ │  pane    │ │  tree    │ │          │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐                             │
│  │  window- │ │  menu-   │                             │
│  │ manager  │ │ command  │                             │
│  └──────────┘ └──────────┘                             │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                      Core Layer                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  logger  │ │  prefs   │ │  i18n    │ │ lifecycle│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ ui-      │ │ notifier │ │ keyboard │               │
│  │ factory  │ │          │ │          │               │
│  └──────────┘ └──────────┘ └──────────┘               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Platform Layer                       │
│  ┌─────────────────────────────────────────────────┐   │
│  │                zotero-host.js                    │   │
│  │  - Zotero API 适配                                │   │
│  │  - Services 封装                                  │   │
│  │  - 平台差异处理                                   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 核心设计模式

### 1. 工厂模式

所有模块通过工厂函数创建：

```javascript
// 优点：依赖注入、易于测试
const logger = createLogger({ hostLog, level });
const prefs = createPreferenceStore({ prefBranch, defaults });
const notifier = createNotifier({ logger, lifecycle });
```

### 2. 观察者模式

偏好设置和事件通知使用观察者模式：

```javascript
// 偏好设置观察
prefs.onChange((key) => { /* 处理变化 */ });

// 事件通知
notifier.subscribe(["item"], (event, type, ids, extraData) => { /* 处理事件 */ });
```

### 3. 清理追踪模式

所有资源注册时自动追踪，关闭时自动清理：

```javascript
// 注册清理函数
lifecycle.trackCleanup(() => {
  // 清理资源
});

// 统一清理
lifecycle.reset();
```

### 4. 阶段守卫模式

防止重复初始化：

```javascript
let phase = "idle";

async function start() {
  if (phase === "running" || phase === "starting") return;
  phase = "starting";
  // ... 初始化
  phase = "running";
}

async function shutdown() {
  if (phase === "idle" || phase === "stopping") return;
  phase = "stopping";
  // ... 清理
  phase = "idle";
}
```

---

## 数据流

### 启动流程

```
bootstrap.js
    │
    ▼
main.js:bootstrapPlugin()
    │
    ▼
plugin.js:createPlugin()
    │
    ├─► createLogger()
    ├─► createPreferenceStore()
    ├─► createI18n()
    ├─► createLifecycleManager()
    ├─► createMenuCommand()
    └─► createWindowManager()
    │
    ▼
plugin.start()
    │
    ├─► prefs.ensureDefaults()
    ├─► prefs.onChange()
    └─► windows.loadAll()
    │
    ▼
phase = "running"
```

### 窗口加载流程

```
onMainWindowLoad(window)
    │
    ▼
windowManager.onLoad(window)
    │
    ├─► 检查窗口状态
    ├─► mountWindowFeature(window)
    │       │
    │       ├─► 注入样式表
    │       └─► 挂载菜单命令
    │
    └─► 追踪清理函数
```

### 偏好设置变化流程

```
用户修改偏好
    │
    ▼
prefs.onChange 触发
    │
    ├─► logLevel 变化 → logger.setLevel()
    │
    └─► enabled/menuLabel 变化 → windows.remountAll()
```

---

## 构建流程

### 打包器设计

`scripts/build.mjs` 实现自定义打包：

1. **配置验证**：检查 `addon.config.json` 必需字段
2. **静态资源复制**：复制 `addon-static/` 到 `build/`
3. **Manifest 生成**：从配置生成 `manifest.json`
4. **Prefs 生成**：从默认值生成 `prefs.js`
5. **Bootstrap 打补丁**：替换占位符
6. **模块打包**：将 ES 模块打包为 IIFE
7. **报告生成**：生成 `build-report.json`

### 模块打包

```javascript
// 输入：ES 模块
import { createLogger } from "./core/logger.js";

// 输出：IIFE 包
(function(__global) {
  const __moduleDefs = {
    "core/logger.js": function(__require) {
      // ... 转换后的代码
      return { createLogger };
    }
  };
  // ...
})(this);
```

---

## 扩展点

### 添加新功能模块

1. 在 `src/features/` 创建新模块
2. 使用工厂模式导出
3. 在 `plugin.js` 中组合
4. 更新 `types/` 类型定义

### 添加新工具模块

1. 在 `src/utils/` 创建新模块
2. 使用工厂模式导出
3. 更新 `types/utils.d.ts`

### 添加新服务模块

1. 在 `src/services/` 创建新模块
2. 让它只负责服务/资源/任务编排骨架，不直接携带产品 UI 语义
3. 更新 `src/services/index.js` 与 `types/services.d.ts`

### 自定义偏好设置

1. 在 `config/addon.config.json` 添加默认值
2. 在 `addon-static/content/preferences.xhtml` 添加 UI
3. 在 `src/app/plugin.js` 处理变化

---

## 文件结构

```
/
├── config/
│   └── addon.config.json      # 插件配置
├── addon-static/
│   ├── bootstrap.js           # Zotero 引导脚本
│   └── content/               # 静态资源
│       ├── preferences.xhtml  # 偏好设置 UI
│       ├── icons/             # 图标
│       ├── locale/            # 本地化文件
│       └── style/             # 样式表
├── src/
│   ├── core/                  # 核心工具
│   ├── features/              # 功能模块
│   ├── services/              # 服务模块
│   ├── utils/                 # 工具模块
│   ├── platform/              # 平台适配
│   ├── app/                   # 应用层
│   └── main.js                # 入口
├── scripts/
│   ├── build.mjs              # 构建脚本
│   ├── package.mjs            # 打包脚本
│   └── verify.mjs             # 验证脚本
├── types/
│   ├── index.d.ts             # 类型主导出
│   ├── core.d.ts              # Core 类型
│   ├── features.d.ts          # Features 类型
│   ├── services.d.ts          # Services 类型
│   ├── utils.d.ts             # Utils 类型
│   └── platform.d.ts          # Platform 类型
├── build/                     # 构建输出
├── dist/                      # 发布包
└── docs/
    ├── API.md                 # API 参考
    └── ARCHITECTURE.md        # 架构说明
```

---

## 依赖关系

### 模块依赖图

```
plugin.js
    │
    ├── logger.js (无依赖)
    ├── prefs.js (无依赖)
    ├── lifecycle.js (依赖 logger)
    ├── i18n.js (无依赖)
    ├── zotero-host.js (无依赖)
    │
    ├── menu-command.js
    │       ├── zotero-host
    │       ├── logger
    │       ├── prefs
    │       └── i18n
    │
    └── window-manager.js
            └── logger
```

### 外部依赖

**运行时**：无

**构建时**：Node.js 内置模块（`fs`, `path`, `url`）

---

## 性能考虑

### 延迟初始化

模块在首次使用时初始化，而非启动时全部加载。

### 清理函数追踪

使用数组而非 Map 追踪清理函数，减少内存占用。

### 窗口管理

只追踪活跃窗口，已关闭窗口自动移除。

---

## 测试策略

### 单元测试

各模块独立可测试：

```javascript
// 注入依赖
const logger = createLogger({
  hostLog: mockHostLog,
  level: "debug"
});

// 验证行为
logger.info("test");
expect(mockHostLog).toHaveBeenCalledWith("[info] test", {});
```

### 集成测试

使用 `test/` 目录：

```javascript
// test/startup.test.ts
import { bootstrapPlugin } from "../src/main.js";

describe("Plugin Startup", () => {
  it("should initialize without errors", async () => {
    await bootstrapPlugin();
    expect(Zotero.CleanroomTemplate).toBeDefined();
  });
});
```

### 工具链与发布测试约束

- `build/`、`dist/` 与 release JSON/Markdown 都属于可再生工件，不能被当作稳定测试前置状态
- 任何断言 `release:preflight`、`release:prepare`、`release:matrix`、`release:upload` 输出的测试，都应在测试内部先清理旧工件并准备 fresh 本地输入
- 如果某类断言不需要真实本地产物，优先使用临时 fixture，而不是读取仓库当前残留的发布文件

---

## 版本兼容

### Zotero 版本

- 最低版本：Zotero 7.0
- 最高版本：Zotero 8.*

### API 检查

所有 Zotero API 调用前检查可用性：

```javascript
if (Zotero && Zotero.ItemPaneManager) {
  // 使用 API
}
```
