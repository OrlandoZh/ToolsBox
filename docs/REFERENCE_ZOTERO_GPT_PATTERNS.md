# Zotero GPT — 早期 AI 对话 + 向量检索架构

> 生成时间: 2026-04-12
> 项目: Zotero GPT v0.2.8
> 源码: `reference/plugin/zotero-gpt/`
> GitHub: <https://github.com/MuiseDestiny/zotero-gpt>
> 许可证: AGPL-3.0-or-later

## 一、架构概览

Zotero GPT 是 Zotero 生态中较早的 AI 集成插件，使用 LangChain + OpenAI API + 向量检索的组合。与 LLM for Zotero 的多 Agent 运行时架构形成鲜明对比，它代表了"单轮对话 + 上下文注入 + 向量检索"的早期模式。

| 维度 | Zotero GPT | LLM for Zotero | 当前模板 |
|---|---|---|---|
| 版本 | v0.2.8 | v3.7.26 | 取决于实现 |
| toolkit | zotero-plugin-toolkit v2.0.1 | 自研 zToolkit | 取决于实现 |
| AI 架构 | 单轮对话 + 流式响应 | Agent 多轮运行时 | 取决于实现 |
| 模型适配 | OpenAI API + 第三方 relay | 5 种适配器 + 协议路由 | 取决于实现 |
| 上下文检索 | LangChain + cosine similarity | RetrievalService | 取决于实现 |
| 向量存储 | 本地 JSON + MD5 去重 | 不适用 | 不适用 |
| 嵌入模型 | text-embedding-ada-002 | 不适用 | 不适用 |
| UI | 手写 DOM + markdown-it | 取决于实现 | 取决于实现 |
| 生命周期 | init/shutdown (简单) | 多层子系统初始化 | 取决于实现 |
| 扩展 API | Meet 对象 (有限开放) | 完整 Agent API | 取决于实现 |

### 1.1 源码分层结构

```
zotero-gpt/
├── addon/
│   ├── bootstrap.js                # 标准 bootstrap
│   ├── chrome/content/
│   └── locale/
├── src/
│   ├── index.ts                    # 全局入口
│   ├── addon.ts                    # Addon 类 (简单 init/shutdown)
│   ├── hooks.ts                    # 生命周期 (简单 onStartup/onShutdown)
│   └── modules/
│       ├── views.ts                # 主 UI (手写 DOM, markdown-it, 流式输出)
│       ├── localStorage.ts         # 本地向量存储 (JSON 文件)
│       ├── utils.ts                # 工具类
│       ├── base.ts                 # help, fontFamily, defaultTags, parseTag
│       ├── locale.ts               # 国际化
│       └── Meet/
│           ├── api.ts              # Meet 对象 (Zotero/BetterNotes/OpenAI/Global)
│           ├── Zotero.ts           # 剪贴板/条目字段/PDF 选择/向量检索/标注
│           ├── BetterNotes.ts      # BetterNotes 编辑器集成
│           └── OpenAI.ts           # OpenAI API + 嵌入 + 相似度搜索 + 流式响应
├── scripts/
│   ├── build.js                    # esbuild 构建
│   ├── start.js                    # 开发启动
│   └── stop.js                     # 停止
└── package.json
```

## 二、生命周期钩子

### 2.1 启动链

```
bootstrap.js → addon.init()
  └─ hooks.onStartup()
       ├─ 等待 Zotero 三重 Promise
       ├─ initLocale()
       ├─ set icon
       ├─ new Views()              # UI 创建 + 样式注入 + 键盘快捷键注册
       └─ new Utils()
```

### 2.2 关闭链

```
hooks.onShutdown()
  ├─ ztoolkit.unregisterAll()
  └─ delete Zotero[ZoteroGPT].api.addonInstance
```

**关键设计点**：
- 启动链极简：无 Agent 子系统、无 MCP、无对话记忆、无附件 GC
- `new Views()` 在构造函数中完成所有 UI 创建、样式注入和键盘注册
- 没有 `onMainWindowLoad` / `onNotify` 等复杂生命周期
- 使用完整 `ZoteroToolkit` 导入，不是按需构建

## 三、Meet 对象 — 有限开放 API

### 3.1 Meet.Zotero (开放给自定义标签调用)

| 方法 | 用途 |
|---|---|
| `getClipboardText()` | 读取系统剪贴板内容 |
| `getItemField(fieldName)` | 返回选中条目的某个字段值 |
| `getPDFSelection()` | 返回 PDF 中选中的文字 |
| `getRelatedText(query)` | 返回最相关的 5 个条目/段落 (向量检索) |
| `getPDFAnnotations(select?)` | 获取 PDF 注释内容 |

### 3.2 Meet.BetterNotes (部分开放)

| 方法 | 用途 |
|---|---|
| `getEditorText()` | 获取主笔记内容 |
| `insertEditorText(html)` | 插入内容到主笔记 |
| `replaceEditorText(html)` | 替换主笔记内容 |
| `follow()` | 跟随光标位置 |
| `reFocus(editor?)` | 重新聚焦编辑器 |

### 3.3 Meet.OpenAI

| 方法 | 用途 |
|---|---|
| `getGPTResponse(requestText)` | 获取 GPT 响应 (自动选择 OpenAI 或第三方) |

### 3.4 Meet.Global (内部状态)

```typescript
Meet.Global = {
  lock: undefined,       // 异步锁
  input: undefined,      // 当前输入
  views: undefined,      // Views 实例引用
  popupWin: undefined,   // 弹窗窗口
  storage: undefined,    // 本地存储
}
```

**关键设计点**：
- `Meet` 对象通过 `window.Meet = Meet` 暴露给全局，允许自定义标签调用
- 这是一种"模板函数"式的上下文注入：用户在标签中写 `Meet.Zotero.getClipboardText()` 即可获取剪贴板
- 与 LLM for Zotero 的 `registerTool` 相比，这是更松散的动态作用域模式

## 四、向量检索与嵌入

### 4.1 嵌入流程

```
similaritySearch(queryText, docs, obj)
  ├─ 计算 docs 内容的 MD5 作为缓存 key
  ├─ 查找本地 LocalStorage 是否已有向量
  ├─ 如果没有 → OpenAIEmbeddings.embedDocuments() → 保存到 JSON
  ├─ OpenAIEmbeddings.embedQuery(queryText)
  ├─ cosine similarity 排序
  └─ 返回最相关的 N 个文档 (取 top k*5, 按内容长度排序后取 N)
```

### 4.2 OpenAIEmbeddings

```typescript
class OpenAIEmbeddings {
  // 批量嵌入，按 embeddingBatchNum 分批
  // 使用 text-embedding-ada-002 模型
  // POST {api}/v1/embeddings
  async embedDocuments(texts: string[]): Promise<number[][]>
  async embedQuery(text: string): Promise<number[]>
}
```

### 4.3 LocalStorage

```typescript
class LocalStorage {
  // JSON 文件持久化
  // MD5 去重 (防止重复计算相同内容的向量)
  // lock 机制防止并发写入冲突
  get(obj, key): Promise<any>
  set(obj, key, value): Promise<void>
}
```

**关键设计点**：
- 为节省空间只储存向量，不储存原始文档
- MD5 缓存键基于文档内容，内容变化时自动重新计算
- 使用 `lock` 防止并发写入冲突
- 可以预测 JSON 文件会越来越大，没有 GC 机制

## 五、GPT 流式响应

### 5.1 双路由

```
getGPTResponse(requestText)
  ├─ 无 secretKey → getGPTResponseBy(requestArgs[1])  // 第三方免费 API
  └─ 有 secretKey → getGPTResponseByOpenAI(requestText)  // OpenAI 原生 API
```

### 5.2 OpenAI 流式处理

```typescript
// getGPTResponseByOpenAI
Zotero.HTTP.request("POST", {api}/v1/chat/completions, {
  stream: true,
  requestObserver: (xmlhttp) => {
    xmlhttp.onprogress = (e) => {
      // 解析 SSE: data: {...}
      // 提取 choices[0].delta.content
      textArr = e.target.response.match(/data: (.+)/g)
        .filter(s => s.indexOf("content") >= 0)
        .map(s => JSON.parse(s.replace("data: ")).choices[0].delta.content)
    }
  }
})

// setInterval 按 deltaTime 间隔刷新 UI
setInterval(() => {
  views.setText(_textArr.join(""))
}, deltaTime)
```

### 5.3 上下文窗口管理

```typescript
// 只发送最近 N 条消息
messages.slice(-chatNumber)
// chatNumber 由用户偏好设置控制
```

**关键设计点**：
- 手写 SSE 解析：用正则 `match(/data: (.+)/g)` 解析流式响应
- `setInterval` 控制 UI 刷新频率，而不是每个 event 都刷新
- 上下文窗口通过 `chatNumber` 偏好设置限制，不是自动压缩
- 没有 tool calling、没有 Agent 循环、没有确认流

## 六、UI 架构

### 6.1 Views 类

```typescript
class Views {
  private id = "zotero-GPT-container";
  public messages: { role: "user" | "assistant"; content: string }[] = [];
  private _history: { input: string; output: string }[] = [];
  private _tag: Tag | undefined;
  public _ids: { type: "follow" | "output", id: number }[] = [];
  public isInNote: boolean = true;

  // UI 组件
  public container!: HTMLDivElement;
  private inputContainer!: HTMLDivElement;
  private outputContainer!: HTMLDivElement;
  private dotsContainer!: HTMLDivElement;
  private tagsContainer!: HTMLDivElement;
}
```

### 6.2 标签系统

```
// 用户可自定义标签，每个标签关联一个 prompt 模板
// 标签中可以调用 Meet.Zotero.xxx() 获取上下文
// 方向键上下回退历史输入
// Ctrl + Enter 快速重复执行最后一个标签
```

### 6.3 渲染方式

- 手写 DOM 元素创建 (`ztoolkit.UI.createElement`)
- markdown-it + mathjax3 渲染 Markdown 输出
- `setInterval` 流式更新文本内容
- 三点加载动画 (three-dots)
- 菜单选择框 (gpt-menu-box)

**关键设计点**：
- 没有 React/Vue 等现代框架，纯手写 DOM
- 输出容器使用 `.streaming` class 控制样式状态
- 菜单项支持键盘上下导航和 Enter 选择

## 七、与 LLM for Zotero 的架构对比

### 7.1 代际差异

| 维度 | Zotero GPT (v0.2.8) | LLM for Zotero (v3.7.26) |
|---|---|---|
| 架构模式 | 单轮对话 + 上下文注入 | Agent 多轮工具调用 |
| 工具调用 | Meet 对象动态作用域 | AgentToolRegistry (validate → confirm → execute) |
| 模型适配 | OpenAI + 第三方 relay 硬编码 | 5 种适配器 + 协议路由 |
| HITL 确认 | 无 | 10+ 字段类型 |
| 外部协议 | 无 | MCP Server (JSON-RPC 2.0) |
| 扩展 API | window.Meet (松散) | registerTool / runAction / getZoteroGateway (结构化) |
| 对话记忆 | messages 数组 (内存) | traceStore + conversationMemory (持久化) |
| 向量检索 | LangChain + cosine + 本地 JSON | RetrievalService (内置) |
| 生命周期 | init/shutdown (2 步) | 多层子系统 (10+ 步) |
| UI 框架 | 手写 DOM + markdown-it | 取决于实现 |
| toolkit 使用 | 全量导入 ZoteroToolkit | 按需 createZToolkit |

### 7.2 演进路径

```
Zotero GPT (2023)          →  Paper Chat / LLM for Zotero (2024-2025)
单轮对话                        多轮 Agent 运行时
Meet 动态作用域                registerTool 结构化注册
手写 SSE 解析                 事件流 (12 种类型)
本地 JSON 向量存储             内置 RetrievalService
硬编码 API 路由               协议路由 (5 种适配器)
无确认机制                    HITL 10+ 字段类型
无外部协议                    MCP Server
简单 init/shutdown            多层子系统 + GC
```

## 八、与当前模板的对比

### 8.1 可借鉴点

1. **Meet 对象模式**：通过全局对象暴露上下文函数，允许 prompt 模板中直接调用获取数据
2. **标签系统**：用户可自定义 prompt 模板，配合上下文函数快速构建常用工作流
3. **向量缓存**：MD5 去重 + 本地 JSON 持久化，简单有效的嵌入缓存方案
4. **流式 UI 刷新**：`setInterval` 控制刷新频率，而不是每个 event 都刷新，减少 UI 抖动
5. **手写 SSE 解析**：在不需要大型依赖的情况下，用正则解析 Server-Sent Events
6. **双路由 API**：无 Key 时走第三方免费 API，有 Key 时走 OpenAI 原生 API

### 8.2 不可直接搬运的点

1. **LangChain 依赖**：`langchain ^0.0.66` 是非常旧的版本，API 已经大幅变化
2. **Pinecone/ChromaDB**：外部向量数据库依赖，增加复杂性和打包体积
3. **tiktoken**：OpenAI 专用 token 计数，不适用于多模型场景
4. **硬编码第三方 API**：`aigpt.one` / `chatbot.theb.ai` 等免费 API 不可靠
5. **手写 DOM UI**：当前模板可能使用 React/Vue 等现代框架
6. **BetterNotes 集成**：特定于 Better Notes 插件的编辑器 API
7. **完整的 Markdown + MathJax 渲染链**：需要判断当前模板是否需要数学公式渲染
8. **全局 `window.Meet` 暴露**：污染全局命名空间，不是推荐的模块模式

### 8.3 当前模板应跳过的坑

1. **不要在内存中存 messages 数组**：LLM for Zotero 已经证明 traceStore + conversationMemory 持久化是更好的选择
2. **不要手写 SSE 解析**：如果有现代框架支持，使用框架的流式响应处理
3. **不要用正则解析 JSON**：`JSON.parse(s.replace("data: "))` 在复杂情况下会失败
4. **不要全量导入 ZoteroToolkit**：按需 `createZToolkit` 减少打包体积
5. **不要用全局变量暴露 API**：使用结构化的 `registerTool` 模式
