# MCP Server Zotero Dev — 外部 MCP + Firefox RDP 协议

> 参考来源：`reference/plugin/mcp-server-zotero-dev-main/`（mcp-server-zotero-dev-main）
> 用途：外部 Node.js MCP Server + Firefox RDP 协议（TCP 端口 6100）+ 桥接插件启用 DevToolsServer
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：mcp-server-zotero-dev-main 源码](../reference/plugin/mcp-server-zotero-dev-main/)

## 1. 项目概览

mcp-server-zotero-dev 是一个外部运行的 Node.js MCP Server，通过 Firefox RDP（Remote Debugging Protocol）协议与 Zotero 7（Firefox 102+ 内核）通信。与 LLM for Zotero（作为 Zotero 插件在进程内运行）不同，它以独立进程方式存在，通过 TCP 端口 6100 与一个最小桥接插件建立的 DevToolsServer 连接。

```
AI Assistant (Claude/Cursor/Windsurf)
  │ MCP stdio transport
  ▼
MCP Server (Node.js, 外部进程)
  │ RDP Client (TCP, port 6100)
  ▼
Zotero DevToolsServer (通过 zotero-plugin-mcp-rdp 桥接插件启用)
  │
  ▼
Zotero 7 宿主
```

```
mcp-server-zotero-dev-main/
├── packages/
│   ├── mcp-server/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts              # MCP Server 入口
│   │       ├── rdp/
│   │       │   ├── client.ts         # RDP 客户端 (TCP 帧、健康检查、重试)
│   │       │   ├── actors.ts         # Actor 接口定义
│   │       │   └── protocol.ts       # 消息类型定义
│   │       └── tools/
│   │           ├── execute.ts        # JS 执行、偏好设置、对象检查
│   │           ├── inspect.ts        # DOM 检查
│   │           ├── screenshot.ts     # 截图
│   │           ├── logs.ts           # 日志读取/监听
│   │           ├── plugins.ts        # 插件管理
│   │           └── scaffold.ts       # 构建/服务生命周期
│   └── zotero-plugin-mcp-rdp/
│       ├── package.json
│       └── src/
│           └── index.ts              # 桥接插件 (启用 DevToolsServer)
```

## 2. 核心架构

### 2.1 三层架构

| 层 | 位置 | 职责 |
|---|---|---|
| MCP Server | 外部 Node.js 进程 | 接收 MCP 请求、路由 26 个工具、管理 RDP 连接生命周期 |
| RDP Client | MCP Server 内部模块 | Firefox RDP 协议实现：TCP 帧、消息关联、Actor 发现、健康检查 |
| Bridge Plugin | Zotero 内部插件 | 启用 DevToolsServer、注册 Actor、在 6100 端口打开监听 |

### 2.2 MCP Server 入口 (`packages/mcp-server/src/index.ts`)

- 使用 `@modelcontextprotocol/sdk` 创建支持 `tools` 和 `prompts` 能力的 Server
- 注册 `StdioServerTransport`（基于标准输入的 MCP 协议）
- 延迟 RDP 客户端创建：`getRdpClient()` 仅在首次使用工具时连接
- 26 个工具定义收集在 `allTools[]` 数组中
- 使用 `switch-case` 在 `CallToolRequestSchema` 处理器中路由工具调用
- 处理 SIGINT/SIGTERM 信号实现优雅关闭
- 连接状态管理：`connectionState` 对象跟踪 connected、root、currentTab、consoleActor、inspectorActor

### 2.3 关键区别：外部 vs 内部

| 方面 | mcp-server-zotero-dev | LLM for Zotero |
|------|----------------------|----------------|
| 运行位置 | 外部 Node.js 进程 | Zotero 进程内（插件） |
| 通信协议 | RDP over TCP（端口 6100） | 直接 JS 注入 |
| 安装要求 | 桥接插件 + 独立服务器 | 单一插件 |
| 灵活性 | 完整 Node.js 生态 | 仅 Zotero 运行时 |
| 延迟 | TCP 连接增加延迟 | 直接执行 |
| 安全性 | 仅 localhost TCP | 插件沙箱 |

## 3. RDP 协议层详解

### 3.1 TCP 帧格式 (`packages/mcp-server/src/rdp/client.ts`)

RDP 使用 `<length>:<json>` 字节长度前缀的 JSON 格式：

```
示例: 36:{"to":"root","type":"getRoot"}
```

关键实现要点：
- 必须使用原生 `Buffer` 拼接以确保正确的 UTF-8 字节计数
- `handleData()`：拼接传入的 buffer 到内部缓冲区
- `processBuffer()`：查找首个冒号（`0x3a`），解析字节长度，精确提取指定字节数的 JSON
- 不完整消息处理：保留剩余部分在缓冲区中等待下次数据到达

### 3.2 消息关联

RDP 响应没有请求 ID——响应按 FIFO 顺序到达：

- 使用 `pendingRequests` 数组（FIFO 队列）关联响应
- 每个请求注册一个回调，响应按顺序解析最老的待处理请求
- 这要求严格按请求顺序处理响应

### 3.3 Actor 发现 (`discoverActors()`)

```
getRoot → root actor
listTabs → tab actors（基于标签页的目标）
listProcesses → 进程描述符
getTarget → ProcessTargetInfo（包含 consoleActor、inspectorActor）
```

**Actor 缓存策略：**
- `cachedActors` Map 带时间戳
- 30 秒 TTL 过期
- 缓存失效事件：`tabNavigated`、`frameUpdate`、`detached`

### 3.4 事件过滤

**`EVENT_TYPES`（主动事件）：**
`frameUpdate`、`tabNavigated`、`tabListChanged`、`newProcess`、`consoleAPICall`、`styleApplied`、`reflow`、`propertyChange`、`pseudoClassLock`、`mutations`、`newMutations`、`frameDestroy`、`willNavigate`、`tabDetached`

**`ACTOR_INVALIDATING_EVENTS`（使 Actor 缓存失效的事件）：**
`frameUpdate`、`tabNavigated`、`willNavigate`、`frameDestroy`、`tabDetached`

### 3.5 `evaluateJS()`

- 执行前主动健康检查
- Actor 缓存 TTL 验证（30 秒过期）
- Actor/连接错误时自动重连
- `withRetry()` 指数退避重试
- IIFE 自动检测：启发式检测顶层 `return` 语句
- GripValue 序列化：`gripToValueAsync()` 处理 longString grip，通过子串请求获取完整内容

### 3.6 连接健康检查

- `startKeepalive()`：30 秒间隔定时器
- `checkHealth()`：通过 `getRoot` 请求检查
- `healthCheckThreshold`：10 秒
- 连续失败跟踪
- 保持连接失败时自动重连

### 3.7 协议类型 (`packages/mcp-server/src/rdp/protocol.ts`)

**消息类型：** `RDPMessage`、`RDPResponse`、`RDPErrorResponse`

**请求类型：** `GetRootRequest`、`ListTabsRequest`、`ListProcessesRequest`、`AttachRequest`、`EvaluateJSRequest`、`GetTargetRequest`、`CachedMessagesRequest`

**GripValue 联合类型：** `GripObject`、`GripArray`、`GripSymbol`、`GripLongString`、`GripError`——各带预览结构

**ProcessDescriptor：** `id`、`isParent`、`isWindowlessParent`、`traits`
**ProcessTargetInfo：** 包含 `consoleActor`、`inspectorActor`、`screenshotContentActor`、`threadActor`

### 3.8 Actor 接口 (`packages/mcp-server/src/rdp/actors.ts`)

**接口：** `RootActor`、`TabActor`、`ConsoleActor`、`InspectorActor`、`WalkerActor`、`NodeActor`、`PageStyleActor`、`ScreenshotActor`

**`findMainWindow()`：** 通过 URL 模式 `chrome://zotero/content/zoteroPane.xhtml` 或标题包含 "Zotero" 定位主窗口

## 4. 26 个 MCP 工具详解

### 4.1 JS 执行类 (`packages/mcp-server/src/tools/execute.ts`, 905 行)

#### `zotero_execute`
核心 JavaScript 执行工具：
- `needsIIFEWrapper()`：跟踪大括号深度，剥离字符串/注释，查找顶层 return
- `wrapInIIFE()`：若代码含 `await` 则使用 async IIFE
- 失败回退：若 "return not in function" 错误且未应用 wrapper，则重试时自动加 IIFE

#### 偏好设置工具
- `handleGetPref` / `handleSetPref`：`extensions.zotero.*` 路由到 `Zotero.Prefs`，其余路由到 `Services.prefs`
- `handleSearchPrefs`：通过 `Services.prefs.getChildList()` 获取分支列表，支持模式过滤和类型检测

#### 检查工具
- `handleInspectObject`：路径验证（防止代码注入），原型链遍历（可配置深度），从 `function.toString()` 提取方法签名
- `handleOpenPreferences`：使用 `Zotero.Utilities.Internal.openPreferences()`，列出内置和插件面板

#### 截断检测
- `hasTruncatedValues()`：检测 `[Array]` / `[Object]` grip 占位符

### 4.2 DOM 检查类 (`packages/mcp-server/src/tools/inspect.ts`, 500 行)

| 工具 | 职责 |
|---|---|
| `handleInspectElement` | 检查指定 DOM 元素 |
| `handleGetDomTree` | 获取深度受限的 DOM 树（每节点最多 20 个子节点） |
| `handleGetStyles` | 获取元素样式 |
| `handleListWindows` | 列出所有窗口 |

关键实现：
- 全部使用 `JSON.stringify` 模式在评估代码中序列化，避免 RDP Grip 预览截断
- 窗口定位：`Services.wm.getEnumerator(null)` 配合 `docShell?.outerWindowID` 匹配
- DOM 树提取：深度限制、每节点子节点上限 20、提取 `data-testid`、`data-l10n-id`、`label`、`value`、`type` 属性

### 4.3 截图类 (`packages/mcp-server/src/tools/screenshot.ts`, 274 行)

#### `zotero_screenshot`
三个目标类型：`main-window`、`window`、`element`，支持可选 `highlightSelector`：
- 使用 `ctx.drawWindow(win, x, y, width, height, 'white')` Canvas API
- 返回图片内容（base64）和文本元数据
- 高亮实现：临时添加红色边框，截图后恢复原始边框样式

### 4.4 日志与调试类 (`packages/mcp-server/src/tools/logs.ts`, 550 行)

| 工具 | 职责 |
|---|---|
| `handleReadLogs` | 多方法调试输出提取（`getConsoleViewerOutput`、`get`、`_console` 数组、`_output` 字符串）——处理 Zotero API 版本兼容性 |
| `handleReadErrors` | `nsIConsoleService.getMessageArray()`，提取 `nsIScriptError` 含堆栈跟踪 |
| `handleWatchLogs` | 猴子补丁 `Zotero.debug`，带缓冲区，start/get/stop 生命周期，1000 条目缓冲上限 |
| `handleClearLogs` | `Zotero.Debug.clear()` + `nsIConsoleService.reset()` |

### 4.5 插件管理类 (`packages/mcp-server/src/tools/plugins.ts`, 361 行)

| 工具 | 职责 |
|---|---|
| `handlePluginReload` | `AddonManager.getAddonByID()` + `addon.reload()`，自动检测开发插件（`temporarilyInstalled` 或路径含 'build'/'dist'） |
| `handlePluginList` | `AddonManager.getAllAddons()`，映射 id/name/version/type/enabled/temporarilyInstalled/installPath |
| `handlePluginInstall` | `AddonManager.getInstallForURL()` 支持 `file://` URL |

### 4.6 构建与脚手架类 (`packages/mcp-server/src/tools/scaffold.ts`, 395 行)

- 集成 `zotero-plugin-scaffold` 的 build/serve/lint/typecheck
- `handleScaffoldServe`：进程管理，使用 `runningProcesses` Map，启动 `npm run serve`，收集初始输出 3 秒或直到出现 "watching"/"ready"/"started"
- 退出时进程清理：终止所有运行中的子进程

## 5. 关键技术模式

### 5.1 IIFE 自动检测

RDP 的 `evaluateJS` 不自动支持顶层 `return`。实现通过启发式扫描检测：

```
needsIIFEWrapper(code):
  1. 跟踪大括号深度
  2. 剥离字符串和注释内容
  3. 查找不在嵌套块中的 return 语句
  4. 若存在 await 关键字，使用 async IIFE
```

回退策略：如果返回 "return not in function" 错误且未预先应用 wrapper，则自动重试时加上 IIFE。

### 5.2 Actor 缓存失效策略

- 30 秒 TTL 过期
- 事件驱动失效：`tabNavigated`、`frameUpdate`、`willNavigate`、`frameDestroy`、`tabDetached`
- 减少重复发现开销，同时保证导航后状态正确

### 5.3 多方法 API 兼容性

`handleReadLogs` 按顺序尝试多个 Zotero API 方法：
1. `getConsoleViewerOutput()`
2. `get()`
3. `_console` 数组
4. `_output` 字符串

这确保在不同 Zotero 7 版本间保持兼容性。

### 5.4 JSON 序列化避免 Grip 截断

RDP Grip 预览会截断长值和嵌套对象。通过在评估代码中使用 `JSON.stringify` 直接返回完整 JSON 字符串，绕过 Grip 预览限制。

### 5.5 猴子补丁日志流

拦截 `Zotero.debug` 方法，添加有界缓冲区（1000 条目上限），支持 start/get/stop 生命周期，实现"准实时"日志观察。

### 5.6 进程生命周期管理

`runningProcesses` Map 跟踪所有启动的子进程，退出时自动清理，防止孤儿进程。

### 5.7 TCP 帧 + 原生 Buffer

正确的字节长度前缀 JSON 解析：
- 使用 `Buffer.concat()` 拼接传入数据
- 查找首个 `0x3a`（冒号）确定长度前缀
- 精确提取指定字节数的 JSON 内容
- 保留剩余数据供下次处理

### 5.8 GripValue 处理

`gripToValueAsync()` 异步处理截断值：
- 检测 `longString` grip
- 通过子串请求获取完整内容
- 处理 `GripObject`、`GripArray`、`GripSymbol`、`GripLongString`、`GripError` 各种类型

## 6. 桥接插件

### 6.1 核心实现 (`packages/zotero-plugin-mcp-rdp/src/index.ts`, 123 行)

最小化桥接插件，仅负责启用 DevToolsServer：

```typescript
onStartup():
  1. 等待 Zotero.uiReadyPromise
  2. ChromeUtils.importESModule("resource://devtools/server/devtools-server.mjs")
  3. DevToolsServer.init()
  4. DevToolsServer.registerAllActors()
  5. DevToolsServer.openListener({ portOrPath: 6100, host: "127.0.0.1" })

onShutdown():
  DevToolsServer.closeAllListeners()
```

### 6.2 偏好设置控制

| 偏好 | 用途 |
|---|---|
| `extensions.mcp-rdp.enabled` | 启用/禁用 RDP 监听 |
| `extensions.mcp-rdp.port` | 自定义端口（默认 6100） |

### 6.3 安全性

- 仅绑定 `127.0.0.1`（localhost）
- 不暴露到外部网络
- 端口可通过偏好设置自定义

## 7. 与 LLM for Zotero 对比

| 维度 | mcp-server-zotero-dev | LLM for Zotero |
|------|----------------------|----------------|
| **运行位置** | 外部 Node.js 进程 | Zotero 进程内插件 |
| **通信协议** | RDP over TCP（端口 6100） | 直接 JS 注入 |
| **安装复杂度** | 桥接插件 + MCP 服务器 | 单一插件 |
| **工具数量** | 26 个 MCP 工具 | 19 个内置工具 |
| **模型适配** | 无（依赖外部 AI 代理） | 5 种适配器 + 协议路由 |
| **Agent 运行时** | 无（由外部 AI 代理承担） | 完整多轮 Agent 运行时 |
| **HITL 确认** | 无（外部代理负责） | 13 字段确认系统 |
| **记忆系统** | 无（外部代理负责） | 双层记忆 + Trace Store |
| **灵活性** | 完整 Node.js 生态 | 仅 Zotero 运行时 |
| **延迟** | TCP 连接增加延迟 | 直接执行无网络开销 |
| **可扩展性** | MCP 标准协议，外部代理可替换 | 第三方扩展 API |
| **RDP 依赖** | Firefox 特定（Zotero 7 = Firefox 102+） | 无 |

## 8. 可借用模式与局限

### 8.1 高价值可复用模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **IIFE 自动检测** | 在受限执行环境中支持返回值 | 中——需要词法分析 |
| **Actor 缓存 + 事件失效** | 远程 Actor 发现性能优化 | 中——TTL + 事件驱动 |
| **多方法 API 兼容** | Zotero 版本间 API 差异适配 | 低——顺序回退 |
| **JSON.stringify 绕过 Grip 截断** | RDP Grip 预览不完整 | 低——评估时代码模式 |
| **猴子补丁日志流** | 无原生流式 API 时的日志观察 | 低——有界缓冲 + 生命周期 |
| **进程生命周期管理** | 子进程自动清理 | 低——Map 跟踪 + 退出清理 |
| **TCP 帧 + Buffer 解析** | 字节长度前缀协议解析 | 中——Buffer 拼接 + 状态机 |
| **GripValue 异步处理** | RDP 截断值完整获取 | 中——longString 子串请求 |
| **延迟连接** | 首次使用才建立连接 | 低——懒加载模式 |
| **指数退避重试** | 不稳定连接的容错处理 | 低——withRetry 封装 |
| **主窗口发现** | 多窗口环境定位目标窗口 | 低——URL 模式 + 标题匹配 |
| **DOM 树深度限制提取** | 大 DOM 树的安全提取 | 低——深度 + 子节点上限 |
| **截图高亮叠加** | 视觉调试辅助 | 低——临时样式 + 恢复 |
| **插件热重载检测** | 开发插件自动识别 | 低——temporarilyInstalled + 路径检测 |
| **脚手架 serve 集成** | 开发服务器生命周期管理 | 中——进程管理 + 输出收集 |

### 8.2 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 完整 RDP 客户端 | Firefox 特定协议，除非走 RDP 路线否则不需要 |
| 26 个工具的具体实现 | 大部分是 Zotero 特定操作，需适配当前模板 |
| 桥接插件 | 当前模板是进程内插件，不需要外部 RDP 连接 |
| scaffold 工具 | `zotero-plugin-scaffold` 是外部构建工具链 |
| 完整 MCP Server 框架 | 当前模板暂无外部 MCP 需求 |

### 8.3 局限性

- **外部进程架构**：需要独立的 Node.js 进程运行，无法直接嵌入 Zotero 插件
- **Firefox 特定**：RDP 协议是 Firefox 专有，依赖 Zotero 7 的 Firefox 102+ 内核
- **桥接插件依赖**：需要额外安装桥接插件才能启用 DevToolsServer
- **TCP 延迟**：相比直接 JS 执行，TCP 连接增加通信延迟
- **RDP API 不稳定**：RDP Actor API 可能随 Firefox/Zotero 版本变化

## 9. 文件索引

| 文件 | 职责 |
|---|---|
| `packages/mcp-server/src/index.ts` | MCP Server 入口，工具注册，连接状态管理 |
| `packages/mcp-server/src/rdp/client.ts` | RDP 客户端：TCP 帧、消息关联、Actor 发现、健康检查、重试 |
| `packages/mcp-server/src/rdp/actors.ts` | Actor 接口定义，主窗口发现 |
| `packages/mcp-server/src/rdp/protocol.ts` | 消息类型、请求类型、GripValue 联合类型 |
| `packages/mcp-server/src/tools/execute.ts` | JS 执行（含 IIFE 检测）、偏好设置、对象检查 |
| `packages/mcp-server/src/tools/inspect.ts` | DOM 检查、样式获取、窗口列表 |
| `packages/mcp-server/src/tools/screenshot.ts` | 截图捕获，高亮叠加 |
| `packages/mcp-server/src/tools/logs.ts` | 日志读取、错误读取、日志监听、日志清理 |
| `packages/mcp-server/src/tools/plugins.ts` | 插件列表、重载、安装 |
| `packages/mcp-server/src/tools/scaffold.ts` | 构建/服务/检查/类型检查生命周期 |
| `packages/zotero-plugin-mcp-rdp/src/index.ts` | 桥接插件：DevToolsServer 启用与监听 |

## 10. 相关参考

- [REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md](./REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md) — 进程内 Agent 运行时对比
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) — DevToolsServer / 宿主接口
- [ZOTERO_TERMINOLOGY_GUIDE.md](./ZOTERO_TERMINOLOGY_GUIDE.md) — Zotero 术语规范
