# REFERENCE_AIASSISTANT_PATTERNS.md

> 参考来源：`reference/plugin/zotero-ai-assistant-main/`（zotero-ai-assistant）
> 用途：Item Pane Chat 面板 / Reader 文本选择弹出 / LLM 流式调用 / 会话持久化的架构模式沉淀
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：zotero-ai-assistant 源码](../reference/plugin/zotero-ai-assistant-main/)

## 1. 核心架构概览

zotero-ai-assistant 是一个轻量 AI 对话插件，核心能力是在 Zotero 文献条目的 Item Pane 中嵌入 Chat 面板，支持选中 Reader 内文本后直接发送提问。

```
Zotero 插件层：
├── hooks.ts                      生命周期（startup / shutdown / mainWindow）
├── addon.ts                      Addon 类（ztoolkit 初始化）
├── modules/
│   ├── chat.ts                   ChatManager：Item Pane 注册、会话管理、LLM 调用
│   └── reader.ts                 ReaderManager：文本选择弹出菜单注册
└── utils/
    ├── locale.ts                 国际化
    ├── prefs.ts                  Preference 读取
    ├── window.ts                 窗口工具
    └── ztoolkit.ts               zotero-plugin-toolkit 工厂
```

核心模块：

| 模块 | 职责 | 文件 |
|---|---|---|
| **ChatManager** | Item Pane Section 注册、会话持久化、LLM 流式调用、外部动作路由 | `src/modules/chat.ts` |
| **ReaderManager** | Reader 文本选择弹出菜单（Translate / Explain） | `src/modules/reader.ts` |
| **StorageManager** | 基于附件的会话存储（JSON 文件 → Zotero.Attachments） | `src/modules/chat.ts` 内部类 |

## 2. Item Pane Chat 面板

### 2.1 registerSection 模式

```typescript
Zotero.ItemPaneManager.registerSection({
  paneID: "zotero-llm-chat",
  pluginID: addon.data.config.addonID,
  header: { l10nID, icon },
  sidenav: { l10nID, icon },
  bodyXHTML: "",  // 空字符串，完全由 onRender 动态构建
  onRender: async ({ body, item }) => { ... },
});
```

**设计特点：** `bodyXHTML: ""` 意味着不依赖预定义 XUL/XHTML 模板，整个 UI 通过 DOM API（`createElementNS`）在 `onRender` 中动态构建。这提供了最大灵活性，但也增加了样式管理的复杂度。

### 2.2 UI 结构

```
onRender({ body, item })
  ├── toolbar
  │   ├── sessionSelect (<select>)  历史会话下拉
  │   └── newBtn ("New Chat")       新建会话
  ├── messagesContainer             消息列表（flex: 1, overflowY: auto）
  └── inputArea
      ├── input (<textarea>)        用户输入
      └── rightControls
          ├── fullTextCheckbox      是否包含全文
          └── sendBtn               发送按钮
```

**布局策略：** 使用 `calc(100vh - 160px)` 固定高度 + flex 布局确保面板在 Zotero 窗口内自适应，而不是依赖父容器的隐式高度。

### 2.3 onRender 生命周期

```typescript
onRender: async ({ body, item }) => {
  // 1. 首次渲染：创建所有 DOM 元素（通过 id 检查避免重复创建）
  if (!body.querySelector("#zotero-llm-chat-main")) {
    // 创建 toolbar / messages / input / buttons
  }

  // 2. 每次渲染（包括切换条目时）：绑定事件、加载会话
  // 注意：事件绑定在每次 onRender 都重新执行
  // 但由于元素是复用而非重建，不会产生重复监听器
  sendBtn.onclick = async () => { ... };
  newBtn.onclick = async () => { ... };
  sessionSelect.onchange = (e) => { ... };
  input.onkeydown = (e) => { ... };

  // 3. 加载当前条目的历史会话
  await loadSessions();
}
```

**注意点：** 事件处理函数在每次 `onRender` 调用时重新赋值（`.onclick = ...`），而不是 `addEventListener`。这意味着不会产生事件累积，但也不支持多监听器。

## 3. 会话管理系统

### 3.1 数据结构

```typescript
interface ChatSession {
  id: string;               // Zotero.Utilities.randomString(10)
  attachmentID?: number;    // 关联的附件 Item ID
  createdAt: number;
  title: string;
  messages: ChatMessage[];
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  tokenCount?: number;
  promptTokenCount?: number;
}
```

### 3.2 基于附件的持久化（StorageManager）

**读取会话：**

```typescript
static async getSessions(parentItem: Zotero.Item): Promise<ChatSession[]> {
  const attachmentIDs = parentItem.getAttachments();
  for (const id of attachmentIDs) {
    const attachment = Zotero.Items.get(id);
    if (attachment.getField("title").startsWith("AI-Assistant-")) {
      const path = attachment.getFilePath();
      const content = await Zotero.File.getContentsAsync(path);
      sessions.push(JSON.parse(content));
    }
  }
  return sessions;
}
```

**保存会话：**

```typescript
static async saveSession(parentItem, session) {
  if (session.attachmentID) {
    // 更新已有附件：直接写临时文件路径
    const attachment = Zotero.Items.get(session.attachmentID);
    await Zotero.File.putContentsAsync(attachment.getFilePath(), json);
    return;
  }
  // 新附件：创建临时文件 → importFromFile → 记录 attachmentID
  const tempPath = `${tempDir}/${title}.json`;
  await Zotero.File.putContentsAsync(tempPath, json);
  const attachment = await Zotero.Attachments.importFromFile({
    file: tempPath,
    parentItemID: parentItem.id,
    title: title,  // "AI-Assistant-YYYYmmDDHHMMSS"
    contentType: "application/json",
  });
  session.attachmentID = attachment.id;
}
```

**设计决策：** 会话数据以 JSON 附件形式存储在文献条目下，而不是使用外部数据库或单独的存储文件。优点是数据与文献绑定、可随库同步；缺点是频繁写入可能导致附件膨胀。

**问题：** 每次消息都完整重写整个 JSON 文件，随着对话增长，I/O 成本线性增加。更好的做法是增量更新或使用外部存储 + 关联引用。

### 3.3 会话选择持久化

```typescript
static selectedSessionIDs = new Map<number, string>();
// key: item.id, value: session.id
```

使用 Map 在内存中记录每个条目最后使用的会话 ID。切换条目后恢复上次选择的会话。

**局限性：** 重启 Zotero 后 Map 丢失，会话选择回到最新创建的会话。

## 4. LLM 调用

### 4.1 OpenAI 兼容流式调用

```typescript
async function callLLM(history, context, onUpdate) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, messages: [{ role: "system", content: systemPrompt }, ...history],
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) {
        const data = JSON.parse(dataStr);
        if (data.choices?.[0]?.delta?.content) {
          fullContent += delta.content;
          onUpdate(fullContent);  // 流式更新 UI
        }
        if (data.usage) usage = data.usage;  // 最后一个 chunk 包含 token 统计
      }
    }
  }
  return { content: fullContent, usage };
}
```

**特点：** 只支持 OpenAI 兼容协议（单一 provider），不支持多 Provider 切换、Fallback、或本地模型。

### 4.2 上下文构建

```typescript
let context = `Title: ${itemTitle}\nAbstract: ${abstract}`;

// 可选：Reader 中选中文本
if (selectedText) {
  context += `\n\n[User Selected Text]:\n"${selectedText}"`;
}

// 可选：全文内容（需勾选 Full Text checkbox）
if (fullTextCheckbox.checked) {
  const fullText = await getFullText(item);
  context += `\n\n[Full Text Content]:\n${fullText.substring(0, limit)}`;
}
```

**System Prompt 拼接方式：** 将文献标题 + 摘要 + 可选全文直接拼入 system prompt，而不是作为独立的 context 参数或 tools 调用。

## 5. Reader 集成

### 5.1 文本选择弹出菜单

```typescript
Zotero.Reader.registerEventListener("renderTextSelectionPopup", (event) => {
  const { doc, append, reader, params } = event;
  const text = params.annotation.text;  // 从事件参数获取选中文本

  const btnGroup = doc.createElement("div");
  btnGroup.appendChild(createBtn("AI Translate", "translate"));
  btnGroup.appendChild(createBtn("AI Explain", "explain"));
  append(btnGroup);
});
```

### 5.2 外部动作路由

```typescript
// ChatManager 上暴露的回调
ChatManager.onAction = async (text, action) => {
  const template = getPref(`prompt${action}`) || defaultTemplate;
  input.value = `${template}\n\n"${text}"`;
  sendBtn.click();  // 自动填入并发送
};

// Reader 按钮触发
await ChatManager.handleExternalAction(text, action);
```

**设计模式：** Reader 弹出按钮不直接调用 LLM，而是通过 `ChatManager.onAction` 路由到侧边栏面板，在 Chat 上下文中执行。这意味着用户必须先打开侧边栏，否则按钮会提示 "Please open the AI Assistant sidebar first."

## 6. 全文获取

```typescript
static async getFullText(item): Promise<string> {
  // 1. 收集所有非 AI-Assistant 附件
  const attachmentsToTry = item.getAttachments()
    .filter(att => !att.getField("title").startsWith("AI-Assistant-"));

  // 2. 检查索引状态，未索引则触发索引
  for (const attachment of attachmentsToTry) {
    const indexedState = await Zotero.Fulltext.getIndexedState(attachment);
    if (indexedState !== 3) {  // INDEX_STATE_INDEXED
      await Zotero.Fulltext.indexItems([attachment.id]);
    }
    const cacheFile = Zotero.Fulltext.getItemCacheFile(attachment);
    if (cacheFile.exists()) {
      fullTexts.push(await Zotero.File.getContentsAsync(cacheFile.path));
    }
  }
  return fullTexts.join("\n");
}
```

**设计决策：** 使用 Zotero 内置全文索引缓存（`Zotero.Fulltext.getItemCacheFile`），而不是重新解析 PDF。前提是用户已启用 Zotero 全文索引功能。

## 7. 可借鉴点

### 7.1 可借鉴的架构模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **Item Pane Section 动态 UI** | 在文献条目侧边栏嵌入自定义面板 | 低——Zotero.ItemPaneManager 标准用法 |
| **基于附件的会话持久化** | 对话数据需要与文献条目绑定 | 低——适合轻量场景，大规模对话需优化 |
| **Reader renderTextSelectionPopup** | 在 PDF Reader 选中文本时弹出自定义按钮 | 低——Zotero.Reader 标准事件 |
| **外部动作路由（onAction）** | Reader 按钮 → 面板操作的解耦模式 | 低——通用回调模式 |
| **OpenAI 流式 SSE 解析** | 标准 SSE 格式的流式响应处理 | 低——通用模式 |
| **上下文构建（摘要+选中文本+全文）** | LLM 上下文注入策略 | 低——可复用于任何 AI 集成 |
| **全文索引缓存复用** | 利用 Zotero 已有索引而不是重新解析 | 低——依赖 Zotero.Fulltext API |
| **selectedSessionIDs Map** | 跨条目记住用户最后选择的会话 | 低——简单有效 |

### 7.2 与当前模板的结合点

- 如果模板需要**在 Item Pane 嵌入自定义面板**，可复用 `registerSection` + `onRender` 动态构建模式
- 如果需要**Reader 文本选择集成**，可复用 `renderTextSelectionPopup` 事件 + 外部路由模式
- 如果需要**轻量会话持久化**，可参考 StorageManager 附件模式（但需注意性能边界）
- 如果需要**OpenAI 兼容流式调用**，可直接复用 `callLLM` 的 SSE 解析逻辑

### 7.3 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 硬编码的 system prompt 拼接 | 应使用模板化配置，而不是硬编码字符串 |
| 单一 OpenAI Provider | 实际项目通常需要多 Provider 支持 |
| 每次消息都完整重写 JSON | 对话多时应增量更新或使用外部存储 |
| 内联样式 | 应使用 CSS 变量和样式表，而不是大量 `style.xxx` 赋值 |
| `bodyXHTML: ""` 全动态构建 | 简单面板可行，复杂 UI 应使用预定义模板或 React |
| `onAction` 单例模式 | 只支持一个全局回调，多面板场景需要改进 |
| `selectedSessionIDs` 内存 Map | 重启后丢失，应持久化到 preference 或存储 |
| 没有并发控制 | `isProcessing` 标志防止重复发送，但没有取消机制 |

## 8. 相关参考

- [REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md](./REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md) — 另一个使用 React 的 AI Assistant 面板
- [REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md](./REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md) — 完整 LLM Agent 架构
- [REFERENCE_PAPER_CHAT_PATTERNS.md](./REFERENCE_PAPER_CHAT_PATTERNS.md) — 轻量 AI 对话 + 多 Provider
