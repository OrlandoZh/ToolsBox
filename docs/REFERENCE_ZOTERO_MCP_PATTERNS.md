# Zotero MCP — 内置 MCP Server 的 Zotero 插件

> 参考来源：`reference/plugin/zotero-mcp-main/`（zotero-mcp-plugin）
> 用途：Zotero 插件内嵌完整 MCP Server（Streamable HTTP 传输），无需外部进程
> 版本：1.4.7，要求 Zotero 7+、Node.js 18+、TypeScript 5.4+
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：zotero-mcp-main 源码](../reference/plugin/zotero-mcp-main/)

## 1. 项目概览

Zotero MCP 是一个将完整 MCP（Model Context Protocol）Server 嵌入 Zotero 插件内部的项目。与 mcp-server-zotero-dev（外部 Node.js 进程 + Firefox RDP 协议）不同，它的 MCP Server 直接运行在 Zotero 插件进程中，通过 Streamable HTTP 传输与 AI 客户端通信，可以直接调用 Zotero API，无需 RDP 桥接。

```
AI Client (Claude Desktop, Cherry Studio, Cursor)
  │ Streamable HTTP (port 23120)
  ▼
Zotero Plugin (内置 MCP Server)
  │ 直接调用 Zotero API
  ▼
Zotero 7 宿主
```

```
zotero-mcp-main/
├── README.md / README-zh.md
└── zotero-mcp-plugin/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── hooks.ts                     # 插件生命周期
    │   ├── addon.ts                     # 插件入口
    │   ├── index.ts                     # 主入口
    │   └── modules/
    │       ├── httpServer.ts            # HTTP Server (nsIServerSocket)
    │       ├── streamableMCPServer.ts   # MCP Server 核心 (JSON-RPC 2.0)
    │       ├── apiHandlers.ts           # 25 个工具的具体实现
    │       ├── unifiedContentExtractor.ts  # 统一内容提取
    │       ├── smartAnnotationExtractor.ts # 智能标注提取
    │       ├── pdfService.ts            # PDF 服务
    │       ├── pdfProcessor.ts          # PDF 处理
    │       ├── searchEngine.ts          # 搜索引擎
    │       ├── fulltextService.ts       # 全文数据库服务
    │       ├── textFormatter.ts         # 文本格式化
    │       ├── itemFormatter.ts         # 条目格式化
    │       ├── collectionFormatter.ts   # 集合格式化
    │       ├── intelligentContentProcessor.ts  # AI 内容处理
    │       ├── mcpSettingsService.ts    # 设置管理
    │       ├── clientConfigGenerator.ts # AI 客户端配置生成
    │       ├── serverPreferences.ts     # 服务器偏好设置
    │       ├── preferenceScript.ts      # 偏好 UI 脚本
    │       ├── mcpTest.ts               # MCP 集成测试
    │       ├── examples.ts              # 示例数据
    │       └── semantic/               # 语义搜索管线
    │           ├── index.ts            # 语义模块入口
    │           ├── embeddingService.ts # 向量嵌入生成
    │           ├── vectorStore.ts      # SQLite 向量存储
    │           ├── textChunker.ts      # 文本分块
    │           ├── semanticSearchService.ts  # 语义搜索编排
    │           └── semanticIndexColumn.ts    # 语义索引状态列
    ├── addon/                          # 插件资源（manifest、locale、preferences）
    └── update.json                     # Zotero 自动更新清单
```

## 2. 核心架构

### 2.1 两层架构

| 层 | 模块 | 职责 |
|---|---|---|
| HTTP Server | `httpServer.ts` | Gecko `nsIServerSocket` 实现 HTTP 监听、请求解析、响应写入、会话管理 |
| MCP Server | `streamableMCPServer.ts` | JSON-RPC 2.0 协议实现，处理 initialize、tools/list、tools/call 等 MCP 方法 |

与外部 MCP 架构的对比：

| 方面 | zotero-mcp | mcp-server-zotero-dev |
|------|-----------|----------------------|
| 运行位置 | Zotero 插件进程内 | 外部 Node.js 进程 |
| 传输协议 | Streamable HTTP（`nsIServerSocket`） | stdio + RDP（TCP 端口 6100） |
| 通信协议 | 直接调用 Zotero API | RDP `evaluateJS()` 注入 JavaScript |
| 安装要求 | 单一 XPI 插件 | 桥接插件 + 外部服务器 |
| 工具数量 | 25 个 | 26 个 |
| 语义搜索 | 内置（embedding + SQLite vector） | 不可用 |

### 2.2 HTTP Server（`modules/httpServer.ts`）

使用 Gecko 原生的 `nsIServerSocket` 在 Zotero 进程内启动 HTTP 服务器：

- **绑定**：`serverSocket.init(port, loopbackOnly, -1)`，根据偏好设置绑定到 `127.0.0.1` 或 `0.0.0.0`
- **监听**：`asyncListen(listener)` 异步连接处理
- **会话管理**：`activeSessions` Map，5 分钟超时，定时清理
- **Keepalive**：30 秒超时
- **传输跟踪**：`activeTransports` Set 记录活跃传输，关闭时清理
- **UTF-8 编码**：使用 `nsIConverterOutputStream` 确保正确编码
- **响应格式**：正确的 `Content-Length` 头，支持 HTTP 请求解析与响应写入

**UTF-8 字节长度计算**：优先使用 `TextEncoder`，无则回退到手动 `charCodeAt` 计算（含代理对处理）。

### 2.3 MCP Server（`modules/streamableMCPServer.ts`）

`StreamableMCPServer` 类提供完整的 MCP 实现：

- **协议**：JSON-RPC 2.0，通过 HTTP 传输
- **支持方法**：`initialize`、`tools/list`、`tools/call`、`resources/list`、`prompts/list`、`ping`
- **会话管理**：`clientSessions` Map 跟踪客户端会话
- **批量请求**：不支持（返回错误 `-32600`）
- **标准 MCP 响应**：协议版本 `2024-11-05`
- **能力声明**：tools（`listChanged`）、logging、prompts、resources

**请求路由**：`handleMCPRequest(requestBody)` 解析 JSON → 按 `method` 分发 → 返回 `{ status, statusText, headers, body }`。

## 3. MCP 工具详解

### 3.1 搜索与发现（5 个工具）

| 工具 | 职责 |
|---|---|
| `search_library` | 高级库搜索：标题/作者/年份/标签/全文搜索，布尔运算符，相关性评分，分页，模式控制（minimal/preview/standard/complete） |
| `search_annotations` | 按查询词/颜色/标签/类型搜索标注（note/highlight/annotation/ink/text/image） |
| `search_fulltext` | PDF 附件全文搜索，返回上下文片段 |
| `search_collections` | 按名称搜索集合 |
| `get_collections` | 列出集合（平铺列表或递归树） |

### 3.2 内容获取（7 个工具）

| 工具 | 职责 |
|---|---|
| `get_item_details` | 详细书目元数据（标题、作者、日期、标识符、附件、笔记、标签） |
| `get_annotations` | 获取指定条目的标注，支持按颜色/标签过滤 |
| `get_content` | 从 PDF/附件/笔记/摘要获取全文内容，支持模式控制与内容控制参数 |
| `get_item_abstract` | 获取条目的摘要/概要 |
| `get_collection_details` | 集合详细信息 |
| `get_collection_items` | 获取集合中的条目 |
| `get_subcollections` | 获取子集合（支持 `recursive=true` 获取完整层级） |

### 3.3 语义搜索（3 个工具）

| 工具 | 职责 |
|---|---|
| `semantic_search` | AI 语义搜索，使用向量嵌入进行概念匹配 |
| `find_similar` | 查找与给定条目语义相似的条目 |
| `semantic_status` | 获取语义搜索服务状态和索引统计 |

### 3.4 全文数据库（1 个工具）

| 工具 | 职责 |
|---|---|
| `fulltext_database` | 访问缓存的全文内容数据库（只读），支持 list/search/get/stats 操作 |

### 3.5 写操作（4 个工具，偏好设置门控）

| 工具 | 职责 |
|---|---|
| `write_note` | 创建/更新/追加笔记（Markdown 自动转 HTML），支持子笔记和独立笔记 |
| `write_tag` | 添加/删除/设置条目标签，返回前后对比列表 |
| `write_metadata` | 更新元数据字段（标题、摘要、日期、创建者等），仅限常规条目 |
| `write_item` | 创建新条目或重新关联附件 |

### 3.6 集合管理（5 个工具，写门控）

| 工具 | 职责 |
|---|---|
| `create_collection` | 创建新集合，可选嵌套在父集合下 |
| `update_collection` | 重命名或移动现有集合 |
| `delete_collection` | 删除集合（可选是否同时删除条目） |
| `add_items_to_collection` | 将条目添加到集合 |
| `remove_items_from_collection` | 从集合中移除条目（不删除条目本身） |

## 4. 语义搜索管线

### 4.1 架构概览

```
文本 → TextChunker（分块） → EmbeddingService（向量嵌入） → VectorStore（SQLite 存储）
                                                    ↓
查询 → EmbeddingService（查询向量） → VectorStore（相似度搜索） → SemanticSearchService（结果编排）
```

### 4.2 嵌入服务（`semantic/embeddingService.ts`）

- 使用本地嵌入模型生成文本向量
- 支持批量嵌入
- 与外部嵌入 API 或本地模型集成

### 4.3 向量存储（`semantic/vectorStore.ts`）

- 基于 SQLite 的向量存储
- 支持余弦相似度搜索
- 向量索引的增删改查
- 持久化存储，重启不丢失

### 4.4 文本分块（`semantic/textChunker.ts`）

- 将长文本分割为适合嵌入的块
- 保持语义边界的分块策略
- 控制块大小以优化嵌入质量和搜索精度

### 4.5 语义搜索服务（`semantic/semanticSearchService.ts`）

- 编排语义搜索和 find-similar 操作
- `search(query, limit)`：概念匹配搜索
- `findSimilar(itemKey, limit)`：基于给定条目的相似搜索
- `buildIndex({ itemKeys, rebuild, onProgress })`：构建索引
- `isReady()`：检查服务就绪状态
- `getStatus()`：返回索引统计

### 4.6 自动索引

基于 notifier 的自动索引机制：

- **5 秒防抖**：条目变化后等待 5 秒再处理批量更新
- **notifier 事件**：监听 `add`/`modify` 事件
- **10 分钟定期检查**：`autoIndexCheckInterval` 定时检查未索引条目
- **删除处理**：条目删除时自动清理对应索引
- **防递归**：`isAutoIndexing` 标志防止索引过程中触发新的索引操作

### 4.7 语义索引状态列（`semanticIndexColumn.ts`）

- 使用 `Zotero.ItemTreeManager.registerColumn` 注册自定义列
- 在 Zotero 主条目列表中显示语义索引状态
- 颜色编码：绿色勾表示已索引
- 5 秒缓存 TTL，防止重复数据库查询
- 防并发刷新标志

## 5. 关键模块

### 5.1 统一内容提取（`unifiedContentExtractor.ts`）

从 Zotero 条目统一提取内容，支持多种条目类型：
- 常规条目（书目元数据 + 附件内容）
- 笔记条目（笔记 HTML 内容）
- 附件（PDF 及其他文件）

### 5.2 智能标注提取（`smartAnnotationExtractor.ts`）

- 从 PDF 阅读器提取标注（高亮、下划线、笔记）
- 支持颜色和标签过滤
- 标注内容去重和格式化

### 5.3 PDF 处理（`pdfService.ts` / `pdfProcessor.ts`）

- PDF 全文提取
- PDF 附件信息获取
- 集成 Zotero 内置 PDF 阅读器 API

### 5.4 格式化模块

| 模块 | 职责 |
|---|---|
| `itemFormatter.ts` | 条目元数据格式化输出 |
| `collectionFormatter.ts` | 集合信息格式化 |
| `textFormatter.ts` | 文本格式化工具 |
| `intelligentContentProcessor.ts` | AI 内容处理（摘要生成等） |

### 5.5 设置与配置

| 模块 | 职责 |
|---|---|
| `mcpSettingsService.ts` | MCP 服务器设置管理 |
| `clientConfigGenerator.ts` | 为 AI 客户端（Claude Desktop 等）生成配置片段 |
| `serverPreferences.ts` | 服务器偏好设置处理 |
| `preferenceScript.ts` | 偏好设置面板 UI 逻辑 |

### 5.6 搜索引擎（`searchEngine.ts`）

- 高级搜索逻辑：多字段组合搜索
- 布尔运算符支持
- 相关性评分

### 5.7 全文数据库（`fulltextService.ts`）

- 缓存的全文内容存储
- list/search/get/stats 操作
- 作为 `fulltext_database` 工具的底层实现

### 5.8 测试与示例

| 模块 | 职责 |
|---|---|
| `mcpTest.ts` | MCP 集成测试（验证服务器启动、工具调用等） |
| `examples.ts` | 示例数据和示例工厂 |

## 6. 插件生命周期

### 6.1 启动（`onStartup`）

```
onStartup():
  1. 初始化 ztoolkit
  2. 读取端口配置，启动 HTTP Server
  3. 注册 notifier 监听条目变化（add/modify）
  4. 设置语义索引自动更新（5 秒防抖）
  5. 注册语义索引状态列到 ItemTreeManager
  6. 启动 10 分钟自动索引检查
  7. 初始化偏好设置面板
```

### 6.2 关闭（`onShutdown`）

```
onShutdown():
  1. 设置 isShuttingDown 标志，阻止新的异步操作
  2. 停止 HTTP Server（关闭 serverSocket，清理活跃传输）
  3. 清理所有 tracked setTimeout 定时器
  4. 清理自动索引防抖定时器
  5. 停止自动索引定期检查
  6. 注销 notifier
  7. 注销语义索引状态列
  8. 清理 ztoolkit
```

### 6.3 关闭保护机制

- **`isShuttingDown` 全局标志**：阻止关闭过程中的新异步操作
- **`trackedSetTimeout`**：所有 `setTimeout` 调用通过此包装，确保关闭时能清理
- **`pendingTimeouts` Set**：跟踪所有待处理的定时器，关闭时批量清除

### 6.4 偏好设置

偏好前缀：`extensions.zotero.zotero-mcp-plugin.*`

| 偏好 | 用途 |
|---|---|
| `*.server.port` | HTTP 服务器端口（默认 23120） |
| `*.server.host` | 绑定地址（localhost 或 0.0.0.0） |
| `*.server.writeEnabled` | 启用写操作工具（默认禁用） |
| `*.semantic.enabled` | 启用语义搜索 |
| `*.semantic.autoUpdate` | 启用自动索引更新 |
| `*.semantic.model` | 嵌入模型配置 |

偏好 UI 定义在 `addon/content/preferences.xhtml`，支持国际化（`en-US` / `zh-CN`）。

## 7. 关键技术模式

### 7.1 进程内 MCP Server

无需外部进程、无需 RDP 桥接，直接在 Zotero 插件中实现完整的 MCP 协议栈。AI 客户端通过标准 HTTP 请求即可与 Zotero 交互。

### 7.2 Streamable HTTP 传输

基于 Gecko `nsIServerSocket` 实现 HTTP 服务：
- 原生网络栈，无需 Node.js 依赖
- 正确处理 UTF-8 编码（`nsIConverterOutputStream`）
- 精确的 `Content-Length` 头计算（`TextEncoder` 优先）

### 7.3 偏好门控的写操作

写工具默认禁用，通过偏好设置 `server.writeEnabled` 控制。这确保了：
- 默认安全（只读模式）
- 用户显式授权后才启用写操作
- 写操作工具在调用前检查门控状态

### 7.4 内容模式控制

`get_content` 等工具支持多级内容模式：
- **minimal**：最小元数据
- **preview**：预览内容
- **standard**：标准内容
- **complete**：完整内容

配合 **content control parameters** 实现：
- 保留原文格式
- 重要内容展开
- 最大长度覆盖

### 7.5 会话管理

HTTP 层和 MCP 层均有会话跟踪：
- `activeSessions`（HTTP 层）：连接会话，5 分钟超时
- `clientSessions`（MCP 层）：MCP 初始化会话，记录客户端信息
- 定期清理过期会话，防止内存泄漏

### 7.6 自动索引防抖

```
条目变化 → 加入 pendingAutoUpdateKeys → 5 秒防抖 → 批量索引
```

- 使用 `Set` 去重待索引条目
- 5 秒内多次变化只触发一次索引
- `isAutoIndexing` 标志防止递归

### 7.7 优雅关闭

- 全局 `isShuttingDown` 标志阻止新操作
- `trackedSetTimeout` 包装所有定时器
- `activeTransports` Set 跟踪活跃连接
- 关闭时按序清理：HTTP → 定时器 → notifier → 列 → ztoolkit

### 7.8 单例模式

HTTP Server 使用单例导出（`export const httpServer = new HttpServer()`），确保全局只有一个服务器实例。

## 8. 与 mcp-server-zotero-dev 对比

| 维度 | zotero-mcp | mcp-server-zotero-dev |
|------|-----------|----------------------|
| **运行位置** | Zotero 插件进程内 | 外部 Node.js 进程 |
| **传输协议** | Streamable HTTP（`nsIServerSocket`） | stdio + RDP（TCP 端口 6100） |
| **通信方式** | 直接调用 Zotero API | RDP `evaluateJS()` 注入 |
| **安装复杂度** | 单一 XPI 插件 | 桥接插件 + 外部服务器 |
| **工具数量** | 25 个 | 26 个 |
| **语义搜索** | 内置（embedding + SQLite vector） | 不可用 |
| **写操作** | 偏好门控（笔记/标签/元数据/条目/集合 CRUD） | 非核心焦点 |
| **DOM 检查** | 不支持 | 支持（通过 RDP） |
| **截图** | 不支持 | 支持（通过 RDP） |
| **JS 执行** | 不支持通用 JS 执行 | 支持（`evaluateJS`） |
| **插件管理** | 不支持 | 支持（列表/重载/安装） |
| **构建/脚手架** | 不支持 | 支持（`zotero-plugin-scaffold` 集成） |
| **Node.js 生态** | 不可用（Gecko 运行时） | 完整可用 |
| **延迟** | 直接调用，无网络开销 | TCP 连接增加延迟 |
| **RDP 依赖** | 无 | Firefox 特定（Zotero 7 = Firefox 102+） |
| **MCP 协议** | 标准 MCP（2024-11-05） | 标准 MCP + RDP 桥接 |

## 9. 可借用模式与局限

### 9.1 高价值可复用模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **进程内 MCP Server** | 避免外部进程依赖，简化部署 | 中——需实现 JSON-RPC 2.0 |
| **nsIServerSocket HTTP** | 在 Gecko 运行时中提供 HTTP 服务 | 中——需处理 UTF-8 编码和帧格式 |
| **偏好门控写操作** | 默认只读安全，显式启用写操作 | 低——偏好检查 + 错误提示 |
| **内容模式控制** | Token 预算管理（minimal/preview/standard/complete） | 低——枚举参数 + 分支逻辑 |
| **自动索引防抖** | 避免频繁的重复索引操作 | 低——Set + setTimeout 防抖 |
| **优雅关闭保护** | 确保关闭时无泄漏、无孤儿操作 | 低——标志 + 定时器跟踪 |
| **语义索引状态列** | 在 Zotero 条目列表中显示自定义状态 | 低——`ItemTreeManager.registerColumn` |
| **会话超时管理** | HTTP 连接和 MCP 会话的生命周期管理 | 低——Map + 定时清理 |
| **客户端配置生成** | 为 AI 客户端生成即插即用的配置片段 | 低——模板 + 动态端口 |
| **全文内容缓存** | 避免重复从 PDF 提取全文 | 中——存储 + 缓存失效策略 |

### 9.2 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 完整的 25 个工具实现 | 大部分是 Zotero 特定操作，需适配当前模板的架构 |
| 语义搜索嵌入服务 | 依赖外部嵌入模型 API，实现细节需重新评估 |
| SQLite 向量存储 | 需要额外的 SQLite 扩展支持向量操作 |
| 完整的 MCP 协议实现 | 当前模板暂无内置 MCP Server 需求 |
| 客户端配置生成器 | 高度耦合于特定 AI 客户端配置格式 |

### 9.3 局限性

- **无通用 JS 执行**：不像 mcp-server-zotero-dev 支持 `evaluateJS`，无法执行任意 JavaScript 代码
- **无 DOM 检查/截图**：没有 RDP 协议支持，无法进行 DOM 检查和页面截图
- **无插件管理**：无法通过 MCP 工具管理 Zotero 插件
- **嵌入模型依赖**：语义搜索需要外部嵌入模型 API 或本地模型
- **SQLite 向量扩展**：语义搜索依赖 SQLite 的向量扩展支持
- **Gecko 运行时限制**：无法使用 Node.js 生态的库和工具
- **UTF-8 处理复杂度**：`nsIServerSocket` 需要手动处理 UTF-8 编码和字节长度

## 10. 文件索引

| 文件 | 职责 |
|---|---|
| `src/hooks.ts` | 插件生命周期：启动、关闭、notifier、偏好集成 |
| `src/addon.ts` | 插件入口 |
| `src/index.ts` | 主入口 |
| `src/modules/httpServer.ts` | HTTP Server：`nsIServerSocket`、会话管理、UTF-8 编码 |
| `src/modules/streamableMCPServer.ts` | MCP Server 核心：JSON-RPC 2.0、25 个工具注册与路由 |
| `src/modules/apiHandlers.ts` | 工具具体实现处理器 |
| `src/modules/unifiedContentExtractor.ts` | 统一内容提取 |
| `src/modules/smartAnnotationExtractor.ts` | 智能标注提取 |
| `src/modules/pdfService.ts` | PDF 服务 |
| `src/modules/pdfProcessor.ts` | PDF 处理 |
| `src/modules/searchEngine.ts` | 高级搜索引擎 |
| `src/modules/fulltextService.ts` | 全文数据库服务 |
| `src/modules/textFormatter.ts` | 文本格式化工具 |
| `src/modules/itemFormatter.ts` | 条目格式化 |
| `src/modules/collectionFormatter.ts` | 集合格式化 |
| `src/modules/intelligentContentProcessor.ts` | AI 内容处理 |
| `src/modules/mcpSettingsService.ts` | 设置管理 |
| `src/modules/clientConfigGenerator.ts` | AI 客户端配置生成 |
| `src/modules/serverPreferences.ts` | 服务器偏好设置 |
| `src/modules/preferenceScript.ts` | 偏好 UI 脚本 |
| `src/modules/mcpTest.ts` | MCP 集成测试 |
| `src/modules/examples.ts` | 示例数据 |
| `src/modules/semantic/index.ts` | 语义模块入口 |
| `src/modules/semantic/embeddingService.ts` | 向量嵌入生成 |
| `src/modules/semantic/vectorStore.ts` | SQLite 向量存储 |
| `src/modules/semantic/textChunker.ts` | 文本分块 |
| `src/modules/semantic/semanticSearchService.ts` | 语义搜索编排 |
| `src/modules/semanticIndexColumn.ts` | 语义索引状态列（`ItemTreeManager.registerColumn`） |
| `src/utils/locale.ts` | 国际化工具 |
| `src/utils/prefs.ts` | 偏好设置工具 |
| `src/utils/window.ts` | 窗口工具 |
| `src/utils/ztoolkit.ts` | ztoolkit 创建工具 |

## 11. 相关参考

- [REFERENCE_MCP_SERVER_ZOTERO_DEV_PATTERNS.md](./REFERENCE_MCP_SERVER_ZOTERO_DEV_PATTERNS.md) — 外部 MCP + RDP 协议方案
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) — 宿主接口契约
- [ZOTERO_TERMINOLOGY_GUIDE.md](./ZOTERO_TERMINOLOGY_GUIDE.md) — Zotero 术语规范
