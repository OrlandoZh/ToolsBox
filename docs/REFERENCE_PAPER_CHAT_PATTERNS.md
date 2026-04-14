# Paper Chat — AI 对话 + Function Calling + 多 Provider 架构

> 生成时间: 2026-04-12
> 项目: Paper Chat v1.3.9 (Chat with AI about your PDF documents)
> 源码: `reference/plugin/paper-chat-for-zotero-master/`
> GitHub: <https://github.com/syt2/paper-chat-for-zotero>
> 许可证: AGPL-3.0-or-later

## 一、架构概览

Paper Chat 是 Zotero 的 AI 对话插件，支持与 PDF 内容对话、Function Calling、多 AI Provider 管理、批量 AI 摘要、RAG 向量检索等能力。其架构模式代表了当前 Zotero 插件生态中 **AI 集成类插件** 的成熟范式：

| 维度 | Paper Chat | 当前模板 |
|---|---|---|
| 构建工具 | zotero-plugin-scaffold ^0.8.5 | 自研 scripts/build.mjs |
| AI 集成 | 多 Provider (OpenAI/Anthropic/Gemini/兼容) | 取决于实现 |
| Function Calling | 30+ 工具定义 (论文查询/笔记/标注/搜索) | 不适用 |
| 聊天存储 | SQLite (v3 迁移自 JSON) | 不适用 |
| RAG | 向量嵌入 + 向量存储 | 不适用 |
| 批量处理 | AISummary (批量摘要管线) | 不适用 |
| 认证 | 双模式 (PaperChat 登录 + API Key) | 不适用 |
| 流式响应 | SSE + reasoning chain + tool calling | 不适用 |

### 1.1 源码分层结构

```
paper-chat-for-zotero-master/
├── addon/
│   ├── bootstrap.js                # 标准 bootstrap
│   ├── manifest.json
│   ├── prefs.js                    # 偏好默认值
│   ├── content/
│   │   ├── preferences.xhtml       # 设置面板
│   │   ├── chatWindow.xhtml        # 聊天窗口
│   │   ├── aisummary-tasks.xhtml   # AI 摘要任务窗口
│   │   └── icons/                  # 图标资源
├── src/
│   ├── index.ts                    # 全局入口 (addon, ztoolkit 定义)
│   ├── addon.ts                    # Addon 类 (data + hooks)
│   ├── hooks.ts                    # 生命周期钩子
│   ├── types/
│   │   ├── chat.ts                 # 聊天消息/会话/API 配置类型
│   │   ├── tool.ts                 # Function Calling 工具定义 (30+ 工具)
│   │   ├── provider.ts             # 多 Provider 接口 + 工厂
│   │   ├── ai-summary.ts           # AI 摘要类型 + 进度追踪
│   │   ├── embedding.ts            # RAG 向量嵌入类型
│   │   └── auth.ts                 # 认证类型
│   ├── modules/
│   │   ├── chat/                   # 聊天核心
│   │   │   ├── db/
│   │   │   │   └── StorageDatabase.ts  # SQLite 存储
│   │   │   └── migration/
│   │   │       └── migrateToSQLite.ts  # JSON → SQLite 迁移
│   │   ├── ai-summary/             # 批量 AI 摘要
│   │   ├── auth/                   # 认证管理
│   │   ├── providers/              # AI Provider 实现
│   │   ├── embedding/              # RAG 向量检索
│   │   │   └── providers/          # 嵌入 Provider
│   │   ├── ui/                     # UI 管理
│   │   │   └── chat-panel/         # 聊天面板
│   │   └── preferences/            # 设置面板
│   └── utils/
│       ├── ztoolkit.ts             # ZoteroToolkit 完整导入 + 配置
│       ├── locale.ts               # 国际化
│       ├── prefs.ts                # 偏好读取
│       ├── logger.ts               # 日志
│       └── window.ts               # 窗口工具
├── test/
│   └── startup.test.ts             # Mocha 启动测试
├── zotero-plugin.config.ts         # zotero-plugin-scaffold 配置
└── package.json
```

## 二、生命周期钩子

### 2.1 启动链

```
bootstrap.js → addon.init()
  └─ hooks.onStartup()
       ├─ 等待 Zotero 三重 Promise (initialization/unlock/uiReady)
       ├─ initLocale()
       ├─ Zotero.PreferencePanes.register()        # 先注册设置面板
       ├─ getStorageDatabase().init()              # SQLite 初始化
       ├─ checkAndMigrateToV3()                    # JSON → SQLite 迁移
       ├─ getAuthManager().initialize()            # 认证初始化
       ├─ initAISummary() + initAISummaryService() # AI 摘要服务
       └─ onMainWindowLoad(win) for each window    # UI 注册
       └─ addon.data.initialized = true
```

**关键设计点**：
- 启动顺序严格：**设置面板 → 存储 → 认证 → AI 摘要 → UI**
- `StorageDatabase` 和 `AISummary` 初始化包裹在 `try/catch` 中，失败不阻断 UI 注册
- `waitForPlugin: "() => Zotero.PaperChat.data.initialized"` 作为测试等待条件

### 2.2 关闭链

```
hooks.onShutdown()
  ├─ ztoolkit.unregisterAll()           # 清理 toolkit 注册
  ├─ unregisterChatPanel()
  ├─ destroyProviderManager()           # 销毁 Provider
  ├─ destroyAuthManager()               # 销毁认证
  ├─ destroyAISummaryService()          # 销毁 AI 摘要
  ├─ destroyRAGService()                # 销毁 RAG
  ├─ destroyEmbeddingProviderFactory()
  ├─ destroyVectorStore()
  ├─ destroyStorageDatabase()           # 销毁数据库
  └─ delete Zotero[addonInstance]       # 清理全局引用
```

## 三、多 Provider 架构

### 3.1 AIProvider 接口

```typescript
// types/provider.ts
interface AIProvider {
  readonly config: ProviderConfig;
  getName(): string;
  isReady(): boolean;
  supportsPdfUpload(): boolean;
  updateConfig(config: Partial<ProviderConfig>): void;
  streamChatCompletion(messages, callbacks, pdfAttachment?): Promise<void>;
  chatCompletion(messages): Promise<string>;
  testConnection(): Promise<boolean>;
  getAvailableModels(): Promise<string[]>;
}

// 带 Tool Calling 能力的 Provider
interface ToolCallingProvider extends AIProvider {
  chatCompletionWithTools(messages, tools?): Promise<{ content, toolCalls? }>;
  streamChatCompletionWithTools?(messages, tools, callbacks): Promise<void>;
}
```

### 3.2 Provider 类型

| Provider | 类型 | 认证方式 |
|---|---|---|
| PaperChat | login-based | 插件自带登录系统 |
| OpenAI | API Key | 用户自带 Key |
| Anthropic (Claude) | API Key | 用户自带 Key |
| Gemini | API Key | 用户自带 Key |
| OpenAI-Compatible | API Key | DeepSeek/Mistral/Groq/OpenRouter |
| Custom | API Key | 用户自定义 |

### 3.3 Fallback 机制

```typescript
interface FallbackConfig {
  fallbackProviderIds: string[];  // 备用 Provider 列表
  maxRetries: number;              // 最大重试次数 (默认 3)
}

type RetryableErrorType =
  | "rate_limit"
  | "timeout"
  | "service_unavailable"
  | "network_error"
  | "quota_exceeded";
```

**关键设计点**：
- Provider 失败自动 fallback 到下一个可用 Provider
- 只对可重试错误（限流/超时/网络）触发 fallback
- 支持用户自定义 fallback 顺序

## 四、Function Calling 系统

### 4.1 工具定义 (30+ 工具)

Paper Chat 定义了一个完整的 **论文研究工具集**：

| 类别 | 工具 | 用途 |
|---|---|---|
| 论文结构 | get_paper_section, list_sections, get_full_text | 论文章节查询 |
| 论文搜索 | search_paper_content, search_with_regex | 内容搜索 |
| 元数据 | get_paper_metadata, get_item_metadata | 元数据查询 |
| 页面操作 | get_pages, get_page_count, get_page_outline | PDF 页面操作 |
| 标注 | get_annotations, get_pdf_selection | 标注和选中文本 |
| 库管理 | search_items, get_collections, get_collection_items | 分类和条目 |
| 标签 | get_tags, search_by_tag, batch_update_tags | 标签操作 |
| 笔记 | get_item_notes, get_note_content, search_notes, create_note | 笔记操作 |
| 最近 | get_recent | 最近条目 |
| 条目操作 | add_item (DOI/ISBN/PMID/arXiv) | 通过标识符添加条目 |
| 多文档 | compare_papers, search_across_papers | 跨论文比较 |
| 全局 | list_all_items (分页) | 列出所有条目 |

### 4.2 Tool Calling 流式管线

```typescript
// types/chat.ts
interface StreamToolCallingCallbacks {
  onTextDelta: (text: string) => void;           // 文本增量
  onReasoningDelta?: (text: string) => void;     // 推理链 (DeepSeek-Reasoner)
  onToolCallStart: (toolCall) => void;            // Tool 调用开始
  onToolCallDelta: (index, argumentsDelta) => void; // Tool 参数增量
  onComplete: (result: StreamToolCallingResult) => void; // 完成
  onError: (error: Error) => void;
}
```

**关键设计点**：
- 支持流式 tool calling，不是等 AI 返回完所有 tool calls 才处理
- `onReasoningDelta` 支持 DeepSeek-Reasoner 等 reasoning 模型
- `StreamToolCallingResult` 返回 `stopReason` 区分 `tool_calls` / `end_turn` / `max_tokens` / `stop`

## 五、聊天存储

### 5.1 SQLite 迁移

```
v1/v2: JSON 文件存储 (按 item 组织)
  └─ migrateToSQLite()
       └─ v3: SQLite 数据库
            ├─ SessionIndex (索引表)
            ├─ ChatSession (会话表)
            └─ ContextSummary (上下文摘要表)
```

**关键设计点**：
- 迁移包裹在 `try/catch` 中，失败不阻断启动
- 旧格式数据 (`LegacyChatSession`) 保留类型定义用于迁移兼容
- Session 从"按 item 组织"升级为"独立 Session + 多 item 关联"

### 5.2 Session 模型

```typescript
interface ChatSession {
  id: string;                     // timestamp-uuid
  createdAt: number;
  updatedAt: number;
  lastActiveItemKey: string | null;  // 向后兼容
  lastActiveItemKeys?: string[];     // 多文档支持
  messages: ChatMessage[];
  contextSummary?: ContextSummary;   // 上下文压缩摘要
  contextState?: ContextState;       // 压缩状态
}
```

**关键设计点**：
- `contextSummary` 支持长对话的上下文压缩
- `contextState` 跟踪 `summaryInProgress` 防止重复压缩
- `lastActiveItemKeys` 支持多文档同时对话

## 六、AISummary 批量处理

### 6.1 进度追踪

```typescript
interface AISummaryProgress {
  status: "idle" | "running" | "paused" | "completed" | "error";
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  currentItemKey?: string;
  errors: AISummaryError[];
}
```

### 6.2 配置

```typescript
interface AISummaryConfig {
  templateId: string;              // 使用的模板 ID
  noteLocation: "child" | "standalone";
  markProcessedTag: string;        // 处理后标签
  pauseBetweenMs: number;          // 请求间隔 (默认 2000ms)
  maxItemsPerRun: number;          // 每批最多条目 (默认 10)
  filterHasPdf: boolean;           // 只处理有 PDF 的条目
  excludeProcessedItems: boolean;  // 排除已处理条目
  includeAnnotations: boolean;     // 包含用户标注
}
```

**关键设计点**：
- 批量处理支持暂停/恢复
- 进度状态持久化，可中断后继续
- 请求间隔防止 API 限流
- 支持自定义模板 (prompt/systemPrompt/noteTitle/tags)

## 七、与当前模板的对比

### 7.1 构建系统

| 维度 | Paper Chat (zotero-plugin-scaffold) | 当前模板 (自研 build.mjs) |
|---|---|---|
| 脚手架 | zotero-plugin-scaffold ^0.8.5 | scripts/build.mjs |
| 测试 | Mocha + zotero-plugin test | 取决于实现 |
| Lint | ESLint + Prettier | 取决于实现 |
| 目标 | firefox115 | 取决于实现 |
| 发布 | zotero-plugin release (bumpp) | 取决于实现 |

### 7.2 架构模式

| 维度 | Paper Chat | 当前模板 |
|---|---|---|
| 工具集 | ZoteroToolkit (完整导入) | 取决于实现 |
| 存储 | SQLite (better-sqlite3) | 取决于实现 |
| AI | 多 Provider + Fallback | 不适用 |
| Function Calling | 30+ 工具定义 | 不适用 |
| RAG | 向量嵌入 + 向量存储 | 不适用 |
| 聊天存储 | Session-based + 上下文压缩 | 不适用 |
| 批量处理 | AISummary 管线 | 不适用 |

### 7.3 可借鉴点

1. **多 Provider 接口 + Fallback**：统一的 `AIProvider` 接口，支持多种 AI 服务自动切换
2. **Function Calling 工具集**：30+ 论文研究工具的完整定义，可直接参考参数设计
3. **流式 Tool Calling**：支持文本/推理/tool 参数增量 + 完成回调的分层流式管线
4. **SQLite 迁移模式**：JSON → SQLite 的平滑迁移，try/catch 不阻断启动
5. **AISummary 批量处理管线**：带进度追踪、暂停/恢复、请求间隔控制的批量 AI 处理
6. **Session 上下文压缩**：长对话的 `contextSummary` + `contextState` 防止上下文溢出
7. **多文档对话**：`lastActiveItemKeys` 支持同时与多篇论文对话
8. **启动容错**：关键路径 (存储/AI 摘要) 失败不阻断 UI 注册

### 7.4 不可直接搬运的点

1. **AI Provider 生态**：依赖 OpenAI/Anthropic/Gemini API，当前模板暂无 AI 需求
2. **Function Calling**：30+ 工具定义是论文研究领域专用，当前模板需要重新设计
3. **RAG 向量检索**：依赖嵌入模型和向量存储，计算成本高
4. **SQLite 依赖**：`better-sqlite3` 是 Node.js 原生模块，Zotero 环境可能需要适配
5. **AISummary**：批量处理管线是学术场景专用
6. **认证系统**：PaperChat 自有登录系统 + 多种 API Key 管理，复杂度较高
