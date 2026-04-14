# Zotero LLM for Zotero — Agent 运行时 + MCP + 多模型适配

> 参考来源：`reference/plugin/llm-for-zotero-main/`（llm-for-zotero-main，MuiseDestiny/zotero-plugin-template）
> 用途：Agent 运行时 + 多轮工具调用 + MCP Server + HITL 确认流 + 5 模型适配器 + 第三方扩展 API
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：llm-for-zotero-main 源码](../reference/plugin/llm-for-zotero-main/)

## 1. 核心架构概览

LLM for Zotero 是参考项目中最复杂的 AI 集成插件，覆盖 Agent 多轮运行时、5 种模型适配器、HITL 13 字段确认类型、MCP Server（JSON-RPC 2.0）、第三方扩展 API、对话记忆 + Trace Store、附件引用 GC、WebChat Relay 和 MinerU 自动监控等完整链路。

```
llm-for-zotero-main/
├── addon/
│   ├── bootstrap.js
│   ├── manifest.json
│   └── locale/
├── src/
│   ├── index.ts                    # 全局入口
│   ├── addon.ts                    # Addon 类 (data.alive / env / ztoolkit / api.agent)
│   ├── hooks.ts                    # 生命周期 + 事件分发
│   ├── agent/
│   │   ├── index.ts                # initAgentSubsystem / getAgentApi / shutdownAgentSubsystem
│   │   ├── runtime.ts              # AgentRuntime 多轮循环核心
│   │   ├── types.ts                # AgentRuntimeRequest / AgentEvent / AgentPendingAction / AgentToolDefinition
│   │   ├── model/
│   │   │   ├── adapter.ts          # AgentModelAdapter 接口
│   │   │   ├── factory.ts          # createAgentModelAdapter 协议路由
│   │   │   ├── openaiResponses.ts  # OpenAI Responses API 适配器
│   │   │   ├── openaiCompatible.ts # OpenAI Chat Completions 兼容适配器
│   │   │   ├── anthropicMessages.ts# Anthropic Messages API 适配器
│   │   │   ├── geminiNative.ts     # Gemini 原生 API 适配器
│   │   │   ├── codexResponses.ts   # Codex Responses 适配器
│   │   │   ├── limits.ts           # resolveAgentLimits
│   │   │   ├── messageBuilder.ts   # buildAgentInitialMessages / selectAgentHistoryWindow
│   │   │   ├── requestClassifier.ts# classifyRequest (bulkOperation 检测)
│   │   │   └── adapterUtils.ts     # 工具函数
│   │   ├── tools/
│   │   │   ├── index.ts            # createBuiltInToolRegistry (19 内置工具)
│   │   │   ├── registry.ts         # AgentToolRegistry (register/unregister/prepareExecution)
│   │   │   ├── shared.ts           # validateObject / ok / fail / normalizePositiveInt
│   │   │   └── *.ts                # 具体工具实现
│   │   ├── actions/
│   │   │   ├── index.ts            # createBuiltInActionRegistry (7 内置 Action)
│   │   │   ├── types.ts            # AgentAction / ActionConfirmationMode / ActionProgressEvent
│   │   │   ├── registry.ts         # ActionRegistry (Map 存储)
│   │   │   ├── executor.ts         # callTool helper + confirmation routing
│   │   │   ├── auditLibrary.ts     # 4 阶段管线: query → analyze → fetch → apply
│   │   │   └── autoTag.ts          # HITL tag_assignment_table
│   │   ├── services/
│   │   │   ├── zoteroGateway.ts    # Zotero 库操作网关
│   │   │   ├── pdfService.ts       # PDF 读取服务
│   │   │   ├── pdfPageService.ts   # PDF 页面提取
│   │   │   └── retrievalService.ts # 检索服务
│   │   ├── mcp/
│   │   │   ├── server.ts           # MCP Server @ :23119/llm-for-zotero/mcp
│   │   │   └── protocol.ts         # JSON-RPC 2.0 类型定义
│   │   ├── store/
│   │   │   ├── traceStore.ts       # SQLite: runs + events
│   │   │   └── conversationMemory.ts # 每会话 6 轮记忆
│   │   └── skills/                 # File-driven skill 匹配
│   ├── modules/
│   │   └── contextPanel/
│   │       └── index.ts            # LLM 面板 (ItemPaneManager.registerSection)
│   ├── providers/
│   │   └── registry.ts             # Provider tier priority
│   ├── webchat/
│   │   └── relayServer.ts          # Chrome extension 中继服务器
│   └── utils/
│       ├── providerProtocol.ts     # 协议规范化
│       ├── providerPresets.ts      # 协议预设
│       ├── apiHelpers.ts           # isGeminiBase 等
│       └── llmClient.ts            # LLM 客户端
└── package.json
```

## 2. Agent 多轮运行时

### 2.1 核心循环

```
runTurn(request, onEvent)
  ├─ createAgentRun (持久化 trace)
  ├─ buildAgentInitialMessages (system prompt + context + tool definitions)
  ├─ classifyRequest (bulkOperation 检测 → 调整 limits)
  └─ for round = 1 to maxRounds:
       ├─ runModelStep() → adapter.runStep()
       │    ├─ emit status ("Running agent" / "Continuing agent (2/5)")
       │    ├─ onTextDelta → message_delta (流式输出)
       │    └─ onReasoning → reasoning event
       ├─ if step.kind === "final" → emitFinalStep → completeRun
       ├─ rollback intermediate text (tool call 前的"思考"文本不计入最终回答)
       ├─ for each tool_call (max maxToolCallsPerRound):
       │    └─ executeToolWorkflow(call):
       │         ├─ prepareExecution → validate → confirm? → execute
       │         ├─ if confirmation required → emit confirmation_required → wait resolution
       │         ├─ if result review required → createResultReviewAction → resolveResultReview
       │         ├─ buildToolDelivery → buildFollowupMessage (artifact → data URL)
       │         └─ push tool_result + followupMessages to messages
       ├─ if consecutiveToolErrors >= 3 → stop with failure message
       └─ if round exhausted → stop with "no final answer" message
```

关键设计：
- `maxRounds` / `maxToolCallsPerRound` 双限控制，防止资源耗尽
- `consecutiveToolErrors >= 3` 触发早停
- `message_rollback` 清除 tool call 前的中间"思考"文本，保持最终回答干净
- 流式输出 8 字符阈值 + 行尾检测决定是否 flush

### 2.2 事件流

```typescript
type AgentEvent =
  | { type: "status"; text: string }
  | { type: "reasoning"; round: number; summary?: string; details?: string }
  | { type: "tool_call"; callId: string; name: string; args: unknown }
  | { type: "tool_result"; callId: string; name: string; ok: boolean; content: unknown; artifacts?: AgentToolArtifact[] }
  | { type: "tool_error"; callId: string; name: string; error: string; round: number }
  | { type: "confirmation_required"; requestId: string; action: AgentPendingAction }
  | { type: "confirmation_resolved"; requestId: string; approved: boolean; actionId?: string; data?: unknown }
  | { type: "message_delta"; text: string }
  | { type: "message_rollback"; length: number; text: string }
  | { type: "fallback"; reason: string }
  | { type: "final"; text: string };
```

每个事件同时写入 traceStore（持久化）和 onEvent 回调（实时 UI）。

## 3. 模型适配器

### 3.1 最小接口

```typescript
interface AgentModelAdapter {
  getCapabilities(request: AgentRuntimeRequest): AgentModelCapabilities;
  supportsTools(request: AgentRuntimeRequest): boolean;
  runStep(params: AgentStepParams): Promise<AgentModelStep>;
}
```

### 3.2 协议路由

```typescript
// agent/model/factory.ts
function createAgentModelAdapter(request: AgentRuntimeRequest): AgentModelAdapter {
  // codex_responses   → CodexResponsesAgentAdapter
  // responses_api     → OpenAIResponsesAgentAdapter (或 ChatCompat fallback)
  // anthropic_messages → AnthropicMessagesAgentAdapter
  // gemini_native     → GeminiNativeAgentAdapter
  // openai_chat_compat + Gemini base → GeminiNativeAgentAdapter (避免 thought signature 丢失)
  // default           → OpenAIChatCompatAgentAdapter
}
```

关键设计：
- Gemini 的 OpenAI 兼容端点会丢失 tool call 的 thought signature，强制走 Native 适配器
- 只有官方 OpenAI API 才用 Responses 适配器（需要 `/v1/files` 端点），第三方 relay 走 ChatCompat
- `supportsTools()` 用于判断模型是否支持工具调用，不支持时自动降级为直接回答

### 3.3 5 种适配器协议

| 适配器 | 目标 API | 工具调用 | 备注 |
|---|---|---|---|
| OpenAI Responses | `/v1/responses` | 原生 | 仅官方 API，需 `/v1/files` |
| OpenAI ChatCompat | `/v1/chat/completions` | function calling | 第三方 relay 默认回退 |
| Anthropic Messages | `/v1/messages` | tool use block | 原生工具调用 |
| Gemini Native | Gemini API | function calling | 避免 OpenAI 兼容层丢失 thought |
| Codex Responses | Codex API | native | Codex 专用 |

## 4. Tool Registry

### 4.1 工具定义

```typescript
interface AgentToolDefinition<TInput, TResult> {
  spec: ToolSpec;                        // name, description, inputSchema, mutability, requiresConfirmation
  isAvailable?: (request: AgentRuntimeRequest) => boolean;
  validate: (args: unknown) => { ok: true, value: TInput } | { ok: false, error: string };
  execute: (input: TInput, context: AgentToolContext) => Promise<TResult>;
  shouldRequireConfirmation?: (input: TInput, context: AgentToolContext) => Promise<boolean>;
  acceptInheritedApproval?: (input: TInput, approval: AgentInheritedApproval, context: AgentToolContext) => Promise<boolean>;
  createPendingAction?: (input: TInput, context: AgentToolContext) => Promise<AgentPendingAction>;
  applyConfirmation?: (input: TInput, resolution: unknown, context: AgentToolContext) => { ok: true, value: TInput } | { ok: false, error: string };
  buildFollowupMessage?: (result: AgentToolResult, context: AgentToolContext) => Promise<AgentModelMessage | null>;
  createResultReviewAction?: (input: TInput, result: AgentToolResult, context: AgentToolContext) => Promise<AgentPendingAction | null>;
  resolveResultReview?: (input: TInput, result: AgentToolResult, resolution: AgentConfirmationResolution, context: AgentToolContext) => Promise<ToolReviewOutcome>;
}
```

### 4.2 执行管线

```
prepareExecution(call, context, options)
  ├─ 1. 工具存在性检查 → 未知工具返回 synthetic error
  ├─ 2. isAvailable 检查 → 不可用返回 synthetic error
  ├─ 3. validate 输入 → 验证失败返回 synthetic error
  ├─ 4. shouldRequireConfirmation 动态判断
  ├─ 5. acceptInheritedApproval (子工具继承父工具审批)
  ├─ 6. 如需确认 → return { kind: "confirmation", requestId, action, execute, deny }
  └─ 7. 否则 → return { kind: "result", execution }
```

### 4.3 19 内置工具

| 工具 | 类型 | 职责 |
|---|---|---|
| `query_library` | read | 查询 Zotero 库条目 |
| `read_library` | read | 读取库结构 |
| `read_paper` | read | 读取论文全文 |
| `search_paper` | read | 搜索论文 |
| `view_pdf_pages` | read | PDF 页面预览（返回 image artifact） |
| `read_attachment` | read | 读取附件内容 |
| `search_literature_online` | read | 在线文献搜索 |
| `edit_current_note` | write | 编辑当前笔记 |
| `undo_last_action` | write | 撤销上一步操作 |
| `apply_tags` | write | 应用标签 |
| `move_to_collection` | write | 移入集合 |
| `update_metadata` | write | 更新元数据 |
| `manage_collections` | write | 管理集合 |
| `import_identifiers` | write | 导入标识符 |
| `trash_items` | write | 移入回收站 |
| `merge_items` | write | 合并条目 |
| `manage_attachments` | write | 管理附件 |
| `run_command` | write | 执行命令 |
| `import_local_files` | write | 导入本地文件 |
| `file_io` | write | 文件读写 |
| `zotero_script` | write | Zotero 脚本执行 |

关键设计：
- 8 read + 11 write（实际 13 write，部分归类取决于实现）
- Result 模式验证：`validate` 返回 `{ ok, value }` 而非 throw
- 共享验证工具：`validateObject`, `ok`, `fail`, `normalizePositiveInt`, `normalizePositiveIntArray`
- `view_pdf_pages` 返回 image artifact → runtime 自动转 data URL → multimodal message

## 5. HITL 确认系统

### 5.1 13 字段类型

| 类型 | 用途 |
|---|---|
| `textarea` | 多行文本输入，支持 plain/json 模式 |
| `text` | 单行文本输入 |
| `select` | 下拉选择 |
| `review_table` | 表格审查（before/after 对比） |
| `diff_preview` | diff 预览（代码对比） |
| `image_gallery` | 图片画廊（PDF 页面预览） |
| `checklist` | 复选框列表（批量操作确认） |
| `assignment_table` | 分配表格（选项 × 行） |
| `tag_assignment_table` | 标签分配表格 |
| `paper_result_list` | 论文结果列表 |

### 5.2 继承审批机制

子工具可通过 `acceptInheritedApproval` 继承父工具的审批，避免冗余确认对话框：

```typescript
acceptInheritedApproval(input, approval, context): Promise<boolean>
// 返回 true 表示接受父级审批结果，跳过确认
// 返回 false 表示仍需独立确认
```

### 5.3 结果审查循环

```
createResultReviewAction(input, result, context)
  → 返回 AgentPendingAction 或 null
  → resolveResultReview(input, result, resolution, context)
    → ToolReviewOutcome: { kind: "deliver" | "stop" | "invoke_tool", ... }
    → "chainedCall" 可触发下一个工具，形成工具链
```

## 6. Action 系统

### 6.1 Action 与 Tool 分层

```typescript
interface AgentAction<TInput, TOutput> {
  name: string;
  modes: ("library" | "paper" | "selection")[];
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: TInput, ctx: ActionExecutionContext): Promise<ActionResult<TOutput>>;
}

interface ActionExecutionContext {
  registry: AgentToolRegistry;            // 可调用 callTool()
  zoteroGateway: ZoteroGateway;
  libraryID: number;
  confirmationMode: "native_ui" | "auto_approve" | "mcp_response";
  onProgress(event: ActionProgressEvent): void;
  requestConfirmation(requestId: string, action: AgentPendingAction): Promise<AgentConfirmationResolution>;
}
```

Action 通过 `callTool(toolName, args, ctx, stepDescription)` 调用底层工具，不直接访问 Zotero API。

### 6.2 7 内置 Action

| Action | 描述 | 核心步骤 |
|---|---|---|
| `audit_library` | 扫描元数据不完整条目，从外部源填充 | query → analyze gaps → fetch (max 20) → apply |
| `organize_unfiled` | 自动分类未归类条目 | query unfiled → analyze → move to collections |
| `auto_tag` | 自动生成并应用标签 | query items → HITL tag_assignment_table → apply |
| `discover_related` | 发现相关文献 | read paper → search related → present |
| `complete_metadata` | 补全当前条目元数据 | read item → fetch metadata → apply |
| `literature_review` | 生成文献综述 | search literature → read papers → synthesize |
| `library_statistics` | 生成库统计报告 | query library → compute stats → present |

### 6.3 确认模式

```typescript
type ActionConfirmationMode = "native_ui" | "auto_approve" | "mcp_response";
```

- `native_ui`：Zotero 内确认对话框
- `auto_approve`：自动批准（MCP 调用默认模式）
- `mcp_response`：通过 MCP 协议返回确认请求

### 6.4 进度事件

```typescript
type ActionProgressEvent =
  | { type: "step_start"; step: string; index: number; total: number }
  | { type: "step_done"; step: string; summary?: string }
  | { type: "confirmation_required"; requestId: string; action: AgentPendingAction }
  | { type: "status"; message: string };
```

### 6.5 audit_library 典型实现

```
execute(input, ctx):
  Step 1: callTool("query_library", { entity:"items", include:["metadata","tags","attachments"] })
  Step 2: 本地分析缺失字段 (abstract, DOI/URL, tags, PDF)
  Step 3: callTool("search_literature_online", { doi/title }) — MAX_METADATA_FETCHES = 20
  Step 4: callTool("update_metadata", { operations }) — 仅填充空字段，不覆盖已有数据
  Step 5 (可选): callTool("edit_current_note", { mode:"create", content:report })
```

## 7. 第三方扩展 API

```typescript
addon.api.agent = {
  // Core
  runTurn(request, onEvent),
  listTools(),
  getToolDefinition(name),
  getCapabilities(request),
  getRunTrace(runId),
  resolveConfirmation(requestId, approved, data),
  registerPendingConfirmation(requestId, resolve),

  // Extension
  registerTool(tool),            // 同名覆盖内置工具
  unregisterTool(name),
  getZoteroGateway(),            // 共享实例，无需重新实例化

  // Action
  listActions(mode),
  runAction(name, input, opts),  // 支持 confirmationMode + requestConfirmation 回调
};
```

关键设计：
- `registerTool` 允许同名覆盖，第三方可替换内置工具
- `getZoteroGateway` 提供共享实例，自定义工具不需要自己构建
- `runAction` 支持编程式调用，外部插件可直接执行高层工作流

## 8. MCP Server

### 8.1 端点注册

```typescript
// 通过 Zotero.Server.Endpoints[ENDPOINT_PATH] = McpEndpoint 注册
// POST http://localhost:23119/llm-for-zotero/mcp
```

### 8.2 JSON-RPC 2.0 方法

| 方法 | 用途 |
|---|---|
| `initialize` | MCP 协议初始化 |
| `tools/list` | 列出可用 Action（非底层 tool） |
| `tools/call` | 调用 Action（auto_approve 模式） |

### 8.3 标准 RPC 错误

| Code | 含义 |
|---|---|
| -32700 | PARSE_ERROR |
| -32600 | INVALID_REQUEST |
| -32601 | METHOD_NOT_FOUND |
| -32602 | INVALID_PARAMS |
| -32603 | INTERNAL_ERROR |

关键设计：
- MCP 暴露的是 Action（高层工作流），不是底层 Tool
- 所有 MCP 调用使用 `auto_approve` 模式，无需人工确认
- 外部 AI 代理（Cursor、Claude Desktop）可直接控制 Zotero

## 9. 对话记忆与 Trace

### 9.1 Trace Store

```typescript
// SQLite: llm_for_zotero_agent_runs + llm_for_zotero_agent_run_events
createAgentRun({ runId, conversationKey, mode, model, status, createdAt })
appendAgentRunEvent(runId, eventSeq, event)  // 每个事件带序列号
finishAgentRun(runId, status, finalText)
getAgentRunTrace(runId)  // 获取完整 trace
```

### 9.2 Conversation Memory

```typescript
MAX_MEMORY_TURNS = 6;
QUESTION_EXCERPT_LEN = 200;
ANSWER_EXCERPT_LEN = 350;

recordAgentTurn(conversationKey, question, toolsUsed, finalAnswer)
  ├─ 内存缓存 (Map<conversationKey, TurnMemory[]>)
  ├─ SQLite 持久化
  └─ 清理超过 MAX_MEMORY_TURNS 的旧记录

buildAgentMemoryBlock(conversationKey) → string
  // 格式化为 system prompt 注入
```

### 9.3 历史消息窗口

```typescript
selectAgentHistoryWindow(history, maxTotal = 10)
  ├─ history.length <= 10 → 返回全部
  ├─ 保留前 2 条消息（首轮锚定）
  └─ 追加最后 maxTotal - 2 条消息（最新上下文）
```

双层记忆：conversation memory（6 轮摘要）+ message history window（10 条消息，首轮锚定）。

### 9.4 附件引用 Store

- 启动时执行 GC：`reconcile attachment refs`
- 引用计数 + 年龄保护（新附件不会被误删）
- 防止孤儿引用占用磁盘空间

## 10. Provider 能力矩阵

### 10.1 Tier Priority

```typescript
// providers/registry.ts
const TIER_PRIORITY = ['copilot', 'codex', 'serverUpload', 'native', 'thirdParty'];
// Auth-mode tiers 必须先于 protocol-based tiers
```

### 10.2 能力检测

每个 Provider 声明其能力：
- 支持的工具调用协议
- 是否支持流式输出
- 是否支持多模态
- 是否支持 reasoning/thinking

## 11. Notifier 防抖

```typescript
// 500ms 防抖合并批量 notify 事件
// 用于论文搜索缓存失效、元数据变更通知
```

关键设计：
- 500ms 延迟合并批量操作，避免频繁触发
- 与 PDF Translate 的 Notifier 防抖模式一致

## 12. MinerU 自动监控

- 监控 PDF 文件变化
- 自动触发 MinerU 解析
- 缓存 manifest.json + full.md
- `read_paper` 优先读取缓存，无缓存才调用 PdfService.extractText

## 13. WebChat Relay

### 13.1 端点

```
Zotero 内置 HTTP 服务器，Chrome extension 通过 polling 通信
```

### 13.2 查询状态机

```
pending → claimed → prompt_applied → submitted → streaming → done/error
```

### 13.3 9 个 HTTP 端点

Chrome extension 通过 9 个端点与 Zotero 插件通信，实现 Web 端聊天的中继转发。

## 14. Context Panel UI

### 14.1 面板注册

```typescript
// 通过 Zotero.ItemPaneManager.registerSection 注册
Zotero.ItemPaneManager.registerSection({
  id: "llm-context-panel",
  // Generation counter for stale render detection
  // Global lock visibility for conversation mode switching
});
```

关键设计：
- Generation counter 防止过时渲染
- 全局锁控制对话模式切换可见性
- 支持独立聊天窗口（Ctrl/Cmd+Shift+L）和 Reader 面板两种模式

## 15. File-Driven Skill 系统

### 15.1 Skill 格式

```markdown
---
id: write-to-obsidian
match: /obsidian/i
match: /导出.*笔记/i
---

Skill instruction body (markdown)...
```

- `id`: 唯一标识
- `match`: 正则数组，OR 语义
- 指令体：注入 system prompt

### 15.2 加载与匹配

- 扫描 `{Zotero data dir}/llm-for-zotero/skills/*.md`
- 用户文件夹是唯一事实来源（内置技能仅首次拷贝）
- 每次 `runTurn` 时匹配用户输入，激活对应 skill

### 15.3 10 内置技能

| 技能 | 触发模式 | 核心工作流 |
|---|---|---|
| `library-analysis` | /分析.*库|统计|概览/i | 库级分析 |
| `compare-papers` | /比较|对比.*论文/i | 多论文对比 |
| `analyze-figures` | /分析.*图|图表/i | 图表分析 |
| `simple-paper-qa` | /.*论文.*问题/i | 论文问答 |
| `evidence-based-qa` | /基于.*证据|有依据/i | 证据导向问答 |
| `note-from-paper` | /从.*论文.*做笔记/i | 论文→笔记 |
| `note-editing` | note-editing source | 笔记编辑指导 |
| `literature-review` | /文献综述/i | 综述生成 |
| `write-to-obsidian` | /obsidian|导出.*笔记/i | Obsidian 写入 |
| `import-cited-reference` | /导入.*引用|citekey/i | 引用导入 |

## 16. 可借鉴模式

### 16.1 高价值可复用模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **AgentModelAdapter 最小接口** | 多模型适配统一抽象 | 低——3 方法接口 |
| **协议路由** | 自动选择最优 API 协议 | 中——5 协议 + 特殊 case |
| **多轮循环 + 三重退出** | Agent 多轮工具调用 | 中——maxRounds/maxToolCalls/consecutiveErrors |
| **Result 模式验证** | 全链路错误处理 | 低——{ ok, value } 替代 throw |
| **工具确认管线** | HITL 人工审核 | 中——4 步确认链 |
| **继承审批机制** | 子工具避免重复确认 | 中——acceptInheritedApproval |
| **结果审查 + 工具链** | 工具结果二次确认后继续 | 高——chainedCall |
| **事件流 12 类型** | 实时 UI 进度/状态 | 中——12 种事件类型 |
| **message_rollback** | 清除中间思考文本 | 低——length-based rollback |
| **流式输出缓冲** | 8 字符阈值 flush | 低——阈值 + 行尾检测 |
| **MCP Server** | 外部 AI 代理控制 Zotero | 中——JSON-RPC 2.0 |
| **Action/Tool 分层** | 高层工作流 vs 原子操作 | 中——callTool 复用 |
| **双层记忆** | 6 轮摘要 + 10 条消息窗口 | 中——内存 + SQLite |
| **附件引用 GC** | 启动时清理孤儿引用 | 低——reconcile + 年龄保护 |
| **File-Driven Skill** | 用户可自定义技能 | 低——.md + frontmatter |
| **Provider Tier Priority** | 多 Provider 优先级 | 低——数组排序 |
| **Notifier 防抖** | 批量操作合并 | 低——500ms delay |
| **PDF image artifact** | PDF 页面转多模态输入 | 中——renderPageToImage → data URL |
| **Generation Counter** | 防止过时 UI 渲染 | 低——counter-based staleness |
| **Obsidian 集成配方** | 笔记导出工作流 | 中——skill + 模板 + Pandoc |

### 16.2 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 5 种模型适配器实现 | 需对接不同 API，当前模板暂无多模型需求 |
| 19 内置工具 | 大部分是 Zotero 特定操作，不可直接复用 |
| MCP Server | 需理解 MCP 协议，当前模板暂无外部代理需求 |
| WebChat Relay | 需额外安全考虑，Zotero 特定 |
| 10 内置 Skill 业务逻辑 | Zotero 领域特定工作流 |
| MinerU 缓存管线 | 需 MinerU 服务配合 |
| 13 种 HITL 字段 UI | 前端组件多，可先实现核心 3 种 |
| 附件引用 GC | 需完整生命周期管理 |

## 17. 与同类插件的架构对比

| 维度 | LLM for Zotero | AI-Collection-Bootstrap | AI-Butler | AI-Bar |
|---|---|---|---|---|
| **核心模式** | Agent 运行时 + 多轮工具调用 | AI 智能分类 + Collection 树 | 多 Provider + Key 轮换 + 多模态 | 轻量对话 + PDF 上下文 |
| **交互方式** | HITL 13 字段确认 | 分类确认对话框 | Dashboard 6 标签 | 双模式 Chat |
| **LLM 调用** | 5 模型适配器 + 协议路由 | 单 Provider + 多配置档案 | Provider Registry + Key 轮换 | 用户可配置多 Provider |
| **工具系统** | 19 内置工具 + 注册表 | 无 | TaskQueueManager | 快捷命令 |
| **工作流** | 7 Action 编排多步业务 | 逐条/批量分类 | 优先级调度 + 流式事件 | 按 section 隔离会话 |
| **外部协议** | MCP Server + 第三方扩展 API | 无 | 无 | 无 |
| **人工审核** | 每步确认 + 结果审查 | 每条/批量确认 | 自动批量 | 无（直接输出） |
| **记忆系统** | 双层记忆 + Trace Store | 无 | 无 | 无 |
| **扩展性** | registerTool + getZoteroGateway | 无 | 无 | Prompt 可配置 |

**关键区别：** LLM for Zotero 走的是"完整 Agent 架构"路线——多轮工具调用 + HITL 确认 + MCP 外部代理 + 第三方扩展 API，是所有参考项目中最复杂的 AI 集成。AI-Collection-Bootstrap 走"分类+审核"路线，AI-Butler 走"多模态批量处理"路线，AI-Bar 走"轻量快捷对话"路线。

## 18. 相关参考

- [REFERENCE_AI_BUTLER_PATTERNS.md](./REFERENCE_AI_BUTLER_PATTERNS.md) — 多 Provider + Key 轮换对比
- [REFERENCE_AIASSISTANT_PATTERNS.md](./REFERENCE_AIASSISTANT_PATTERNS.md) — 轻量 Chat 对比
- [REFERENCE_AI_BAR_PATTERNS.md](./REFERENCE_AI_BAR_PATTERNS.md) — 轻量 AI 对话对比
- [REFERENCE_AINOTE_PATTERNS.md](./REFERENCE_AINOTE_PATTERNS.md) — 批量 AI 笔记对比
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) — ItemPaneManager / Notifier / Server 接口
