# REFERENCE_AI_BAR_PATTERNS.md

> 参考来源：`reference/plugin/zotero-ai-bar-main/`（zotero-ai-bar）
> 用途：双模式 AI 对话（sidebar/window）+ 按 section 隔离会话 + PDF 上下文提取 + 用户可配置 Provider + Prompt 编辑器
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：zotero-ai-bar 源码](../reference/plugin/zotero-ai-bar-main/)

## 1. 核心架构概览

zotero-ai-bar 是一个面向 Zotero 的轻量 AI 对话插件，核心能力是：双模式 Chat（Reader 侧边栏 + 独立窗口）+ 按 section 隔离的会话管理 + PDF 全文/选区上下文提取 + 用户可配置多 Provider + 可视化 Prompt 编辑器 + 4 种内置快捷命令（explain/summarize/translate/smartCopy）。

```
Zotero 插件层：
├── bootstrap.ts                    生命周期入口
├── index.ts                        全局 addon / ztoolkit 注册
├── addon.ts                        Addon 类：ztoolkit / ChatManager / userProviderConfigs / userPrompts
├── hooks.ts                        onStartup / onShutdown / registerReaderTab / ItemPaneSection 注册
├── modules/
│   ├── chatManager.ts              ChatManager：双模式 / 按 section 会话 / 流式 / 多轮 / 元数据提取
│   ├── preferenceScript.ts         设置面板：模型选择器 / 温度滑块 / Prompt 预览 VirtualizedTable
│   ├── promptEditor.ts             Prompt 编辑器：CRUD / 拖拽排序 / Tailwind CSS / 保存到 preference
│   ├── modelDialog.ts              Provider 配置对话框：预设 10 家 / 自定义添加 / ProviderCard 组件
│   ├── tabObserver.ts              Tab 切换 Notifier 观察者：更新 currentTabID
│   ├── chatWindowHost.ts           独立窗口模式宿主：打开/关闭/生命周期
│   ├── readerItemPane.ts           Reader ItemPaneSection 注册：bodyXHTML 模板 / onItemChange
│   ├── readerBarPopup.ts           Reader 工具栏弹出按钮
│   ├── llmRequest.ts               LLM HTTP 请求：fetch / SSE 流解析 / AbortController
│   ├── streamLLM.ts                SSE 流处理：可配置刷新率 / 全局 vs 按 section AbortController
│   └── views/
│       ├── ItemPaneSection.ts      条目面板 section：sidebar 模式 UI
│       └── ...
├── components/
│   ├── chatBox.ts                  ChatBox 组件：消息气泡 / 复制 / 复制 Markdown / 重新生成
│   └── common.ts                   共享 UI 组件工具
├── utils/
│   ├── prompts.ts                  系统 Prompt 前缀 / 4 种 AIBarCommand 定义
│   ├── selectionContext.ts         PDF 选区上下文提取：3 种策略（全文搜索/位置匹配/批量识别器）
│   ├── prefs.ts                    类型化 preference 包装：PluginPrefsMap
│   └── providerInfo.ts             10 家预设 Provider：baseURL / models / l10n
└── types/
    └── index.ts                    类型定义：ChatMessage / HostMode / StreamState / TextBox 等
```

核心模块：

| 模块 | 职责 | 文件 |
|---|---|---|
| **ChatManager** | 双模式对话核心：按 section 会话隔离、流式处理、多轮上下文、元数据/全文提取 | `chatManager.ts` |
| **StreamLLM** | SSE 流解析：可配置刷新率、全局 vs 按 section AbortController 路由 | `streamLLM.ts` |
| **llmRequest** | HTTP fetch 封装：SSE chunk 解析、abort 信号传递 | `llmRequest.ts` |
| **selectionContext** | PDF 选区上下文：全文搜索匹配、短文本位置匹配、批量识别器数据 | `selectionContext.ts` |
| **modelDialog** | Provider 配置对话框：10 预设 + 自定义、ProviderCard 组件、JSON 序列化 | `modelDialog.ts` |
| **promptEditor** | Prompt CRUD：拖拽排序、编辑面板、Tailwind CSS 暗色模式 | `promptEditor.ts` |
| **AIBarCommand** | 4 种快捷命令：explain/summarize/translate/smartCopy | `utils/prompts.ts` |
| **ItemPaneSection** | Zotero.ItemPaneManager 集成：sidebar 模式、reader-only 可见性 | `readerItemPane.ts` |
| **chatWindowHost** | 独立窗口模式：openDialog 生命周期、消息传递 | `chatWindowHost.ts` |
| **PreferenceScript** | 设置面板 UI：模型选择器、温度滑块、Prompt 预览表 | `preferenceScript.ts` |
| **tabObserver** | Tab 切换追踪：Notifier observer 更新 currentTabID | `tabObserver.ts` |
| **Typed Prefs** | 类型化 preference 读写：PluginPrefsMap 包装 | `utils/prefs.ts` |
| **Provider Info** | 10 家预设 Provider 定义：OpenAI/Anthropic/Google/阿里/火山/智谱等 | `utils/providerInfo.ts` |
| **ChatBox** | 消息组件：气泡样式、复制、复制 Markdown、重新生成 | `components/chatBox.ts` |

## 2. 双模式 ChatHost 架构

### 2.1 模式定义

```typescript
type ChatHostMode = "sidebar" | "window";
```

- **sidebar 模式**：通过 `Zotero.ItemPaneManager.registerSection` 挂载到 Reader 条目面板
  - 每个 tab/section 独立会话状态
  - 适合边读边对话的场景
  - UI 受限在 Zotero 面板框架内
- **window 模式**：通过 `Zotero.getMainWindow().openDialog()` 打开独立对话框
  - 全局共享会话
  - 适合深度对话、长上下文、脱离 Reader 的场景
  - 完整 UI 自由度

### 2.2 模式切换

```typescript
class ChatManager {
  hostMode: ChatHostMode = "sidebar";  // 默认 sidebar
  setHostMode(mode: ChatHostMode): void { ... }
}
```

模式切换由 preference 控制，用户可在设置中选择。切换时：
- sidebar → window：关闭所有 section，打开独立窗口
- window → sidebar：关闭独立窗口，恢复 section 面板

## 3. 按 Section 隔离的会话管理

### 3.1 SidebarSectionState

```typescript
interface SidebarSectionState {
  conversationHistory: ChatMessage[];  // 多轮对话历史
  isStreaming: boolean;                // 当前是否正在流式输出
  abortController: AbortController | null;  // 独立的取消控制器
  pendingUserContent: string | null;   // 等待发送的用户消息
  activeRequestId: string | null;      // 当前活跃请求 ID
}
```

### 3.2 按 section 路由

```typescript
class ChatManager {
  // sidebar 模式下，按 sectionId 存储独立状态
  private sidebarSections: Map<string, SidebarSectionState> = new Map();

  private getSectionState(sectionId: string): SidebarSectionState {
    if (!this.sidebarSections.has(sectionId)) {
      this.sidebarSections.set(sectionId, {
        conversationHistory: [],
        isStreaming: false,
        abortController: null,
        pendingUserContent: null,
        activeRequestId: null,
      });
    }
    return this.sidebarSections.get(sectionId)!;
  }
}
```

### 3.3 独立 AbortController

每个 section 有独立的 AbortController，支持：
- 单个 section 流式输出可独立取消
- 切换 section 时不影响其他 section 的流式状态
- 新消息到达时，先 abort 当前 section 的旧流

```typescript
// 发送新消息时，先取消当前 section 的旧流
if (sectionState.abortController) {
  sectionState.abortController.abort();
}
sectionState.abortController = new AbortController();
```

### 3.4 多轮上下文

```typescript
const contextRounds = getPref("chat.contextRounds") ?? 8;
const maxHistoryMessages = contextRounds * 2;  // 每轮 = user + assistant
const history = sectionState.conversationHistory.slice(-maxHistoryMessages);
const messages = [systemMsg, ...history, userMsg];
```

关键设计：
- `contextRounds` 从 preference 读取，默认 8 轮
- 只取最近 N 轮，避免 token 超限
- 流式输出完成后，将 user + assistant 消息推入 `conversationHistory`

## 4. StreamLLM SSE 流解析

### 4.1 双 AbortController 模式

```typescript
// streamLLM.ts
class StreamLLM {
  private globalAbortController: AbortController | null = null;  // 全局
  // 或按 section 路由到 sectionState.abortController
}
```

- **全局模式**：所有 section 共享一个 AbortController，取消一个 = 取消所有
- **按 section 模式**：每个 section 独立，推荐用于 sidebar 多 tab 场景

### 4.2 流处理流程

```
fetch SSE endpoint
  ├── 可配置刷新率（pref 控制）
  ├── 解析 chunk → 累积 assistantContent
  ├── onChunk 回调 → 实时更新 UI
  ├── 结束 → onEnd 回调
  ├── 错误 → onError 回调
  └── abort 信号透传
```

### 4.3 动态输入区切换

```typescript
// 根据流式状态切换 send/stop 按钮
updateSectionInputArea(sectionId: string, isStreaming: boolean) {
  // shadow DOM 中动态切换发送按钮和停止按钮
}
```

## 5. PDF 选区上下文提取（3 种策略）

### 5.1 策略 1：全文搜索匹配

```typescript
// 在完整文本中搜索选中文本
const matches = fullText.text.match(new RegExp(escapeRegex(selectedText), "gi"));
if (matches.length === 1) {
  // 唯一匹配：直接取匹配位置前后 contextSize 字符
  selectionContext = getContextAroundIndex(fullText.text, [matches[0].start], contextSize);
}
```

适用场景：选中文本在全文中唯一出现。

### 5.2 策略 2：短文本位置匹配

```typescript
if (selectedText.split(" ").length <= 5) {
  // 短选词（≤5 个词）：使用位置信息匹配
  selectionContext = getContextByPosition(selected, currentPage, contextSize);
}
```

适用场景：选中文本很短（如术语、缩写），全文出现多次，依赖位置信息定位。

### 5.3 策略 3：批量识别器数据

```typescript
async function getPageBatchRecognizerData(itemID: number, startIndex: number) {
  // 删除前 startIndex 页后查询识别器数据
  const result = await Zotero.PDFWorker._query("deletePages", ...);
  const data = await Zotero.PDFWorker._query("getRecognizerData", ...);
  // 解析 TextBox 数据（14 元组，包含 x/y 坐标、字体信息、文本、索引）
}
```

适用场景：页数 > 4 的 PDF，需要精确定位选区周围的上下文。

### 5.4 TextBox 数据结构

```typescript
// 14 元组 tuple
type TextBox = [
  number,  // 0: page index
  number,  // 1: x coordinate
  number,  // 2: y coordinate
  number,  // 3: width
  number,  // 4: height
  string,  // 5: font name
  number,  // 6: font size
  number,  // 7: font weight
  boolean, // 8: is bold
  boolean, // 9: is italic
  number,  // 10: sort index
  string,  // 11: text content
  number,  // 12: text index
  number,  // 13: page rotation
];
```

## 6. 用户可配置 Provider 系统

### 6.1 10 家预设 Provider

```typescript
// utils/providerInfo.ts
const PROVIDERS = {
  OPENAI:        { name: "pref-provider-openai",        baseUrl: "https://api.openai.com/v1",        models: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"] },
  ANTHROPIC:     { name: "pref-provider-anthropic",     baseUrl: "https://api.anthropic.com",        models: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-latest"] },
  GOOGLE_CLOUD:  { name: "pref-provider-google",        baseUrl: "https://generativelanguage.googleapis.com", models: ["gemini-2.5-pro", "gemini-2.0-flash"] },
  ALIBABA_CLOUD: { name: "pref-provider-alibaba",       baseUrl: "https://dashscope.aliyuncs.com",   models: ["qwen-plus", "qwen3-max", "qwen-flash", "qwen-turbo"], l10n: true },
  VOLCENGINE:    { name: "pref-provider-volcengine",    baseUrl: "...", models: [...], l10n: true },
  OPENROUTER:    { name: "pref-provider-openrouter",    baseUrl: "https://openrouter.ai/api/v1",     models: [...] },
  ZHIPU:         { name: "pref-provider-zhipu",         baseUrl: "...", models: [...], l10n: true },
  Z_AI:          { name: "pref-provider-zai",           baseUrl: "...", models: [...], l10n: true },
  DEEPSEEK:      { name: "pref-provider-deepseek",      baseUrl: "https://api.deepseek.com",         models: ["deepseek-chat", "deepseek-reasoner"] },
  MINIMAX:       { name: "pref-provider-minimax",       baseUrl: "...", models: [...] },
};
```

### 6.2 Provider 配置对话框

```typescript
class ModelDialog {
  private renderProviders() {
    for (const providerKey in PROVIDERS) {
      // 跳过已添加的 provider
      if (addon.data.userProviderConfigs?.some((p) => p.key === providerKey)) continue;
      // 创建按钮，点击后添加 ProviderCard
    }
  }
}
```

关键设计：
- 预设 provider 一键添加，不用手动填 URL
- 支持自定义 provider（非预设）
- ProviderCard 支持编辑 API Key、Base URL、Model 列表
- 配置保存为 JSON 数组到 `llm.providerConfigs` preference
- 通过 `crypto.randomUUID()` 生成唯一 ID

### 6.3 模型选择器

```typescript
function updateModelSelector(modelSelector: HTMLSelectElement, doc: Document) {
  const providers = addon.data.userProviderConfigs;
  for (const provider of providers ?? []) {
    for (const model of provider.models ?? []) {
      if (!model.id) continue;
      option.value = model.id;
      option.textContent = `${model.name} (${provider.name})`;
    }
  }
}
```

## 7. Prompt 编辑器

### 7.1 CRUD 操作

```typescript
class PromptEditor {
  add(): void;           // 添加新 prompt
  select(index: number); // 选中编辑
  save(): void;          // 保存到 preference
  delete(index: number); // 删除
  bindDragSort(): void;  // 拖拽排序
}
```

### 7.2 拖拽排序

```typescript
bindDragSort() {
  let draggedIndex: number | null = null;
  this.promptList?.addEventListener("dragstart", (e) => {
    // 捕获拖拽项索引
  });
  this.promptList?.addEventListener("dragover", (e) => {
    e.preventDefault();  // 允许放置
  });
  this.promptList?.addEventListener("drop", (e) => {
    // splice 重新排序
  });
}
```

### 7.3 UI 设计

- Tailwind CSS 暗色模式支持
- Rose 主题色
- `group-hover` 控制删除按钮可见性
- 窗口卸载时自动保存

## 8. AIBarCommand 快捷命令

### 8.1 接口定义

```typescript
interface AIBarCommand {
  id: string;
  icon: string;
  label: FluentMessageId;
  getPrompt: (targetLanguage: string) => string;
}
```

### 8.2 4 种内置命令

| 命令 | 说明 | 策略 |
|---|---|---|
| **explain** | 解释选中文本 | 基于选区长度/类型动态生成 prompt |
| **summarize** | 总结 | 简单总结模板 |
| **translate** | 翻译 | 支持 3 种模式：单词/缩写/段落 |
| **smartCopy** | 智能复制 | PDF 伪影清理 + 公式格式整理 |

### 8.3 explain 策略

```typescript
explain: {
  getPrompt(targetLanguage: string) {
    // 根据选区长度、是否在 PDF、是否包含公式等
    // 动态生成不同的 explain prompt
  }
}
```

## 9. ItemPaneSection 集成

### 9.1 注册

```typescript
// readerItemPane.ts
Zotero.ItemPaneManager.registerSection({
  paneID: "ai-bar",
  pluginID: addon.data.config.addonID,
  header: { icon: "...", l10n: "..." },
  bodyXHTML: `<html-browser id="ai-bar-section" flex="1" ... />`,
  onInit: ({ itemPane }) => { ... },
  onDestroy: ({ itemPane }) => { ... },
  onItemChange: ({ item, setEnabled }) => {
    // 只在 Reader 打开条目时显示
    setEnabled(item && item.isRegularItem());
  },
});
```

### 9.2 Tab 切换追踪

```typescript
// tabObserver.ts
Zotero.Notifier.registerObserver({
  notify: async (event, type, ids, extraData) => {
    if (event === "select" && type === "tab") {
      addon.chatManager.currentTabID = ids[0].toString();
    }
  }
}, ["tab"], "myObserverID");
```

## 10. ChatBox 组件

```typescript
// chatBox.ts — 消息气泡组件
function ChatBox({ messages, onCopy, onCopyMarkdown, onRegenerate }) {
  // 用户消息：右侧，蓝色背景
  // 助手消息：左侧，白色背景
  // 操作按钮：COPY / COPY MD / REGENERATE
}
```

关键设计：
- 使用 `ztoolkit.Clipboard` 复制文本/Markdown
- 从 `dataset.markdown` 读取原始 Markdown
- Tailwind CSS 暗色模式支持

## 11. 智能翻译

### 11.1 临时模型切换

翻译时，如果当前模型不支持翻译，临时切换到专门的翻译模型：

```typescript
// 翻译时使用专门的翻译模型，完成后恢复
const originalModel = getCurrentModel();
setPref("llm.model", translateModelId);
// ... 执行翻译
setPref("llm.model", originalModel);
```

### 11.2 翻译模式

| 模式 | 说明 |
|---|---|
| **word** | 单词翻译：返回释义、词性、例句 |
| **abbreviation** | 缩写翻译：返回全称、中文、说明 |
| **paragraph** | 段落翻译：直接翻译文本 |

## 12. 可借鉴点

### 12.1 高价值可复用模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **双模式 ChatHost** | 需要同时支持面板内对话和独立窗口对话 | 低——模式枚举 + 条件分支 |
| **按 Section 会话隔离** | 多 tab/多面板各自独立会话，互不干扰 | 中——Map 状态管理 + AbortController |
| **独立 AbortController per section** | 流式输出可独立取消，不影响其他 section | 低——每 section 一个 controller |
| **多轮上下文（contextRounds）** | 可配置历史轮数，避免 token 超限 | 低——slice 最近 N 轮 |
| **PDF 选区上下文（3 策略）** | 根据选区长度/唯一性/页数选择最优策略 | 高——全文搜索 + 位置匹配 + 识别器 |
| **用户可配置 Provider** | 10 预设 + 自定义，JSON 序列化存储 | 中——对话框 + 组件 + 序列化 |
| **Prompt 编辑器（拖拽排序）** | 用户自定义 prompt 列表、排序、CRUD | 中——HTML5 drag + Tailwind UI |
| **AIBarCommand 策略化** | 根据选区特征动态生成 prompt | 低——接口 + 策略函数 |
| **Typed Preferences** | 类型化 preference 读写，编译时检查 | 低——PluginPrefsMap 泛型包装 |
| **Tab Notifier Observer** | 追踪 tab 切换，更新当前活跃 tab | 低——简单 observer 注册 |
| **窗口卸载自动保存** | 避免用户忘记保存就关闭 | 低——unload 事件监听 |
| **动态输入区切换** | 流式中显示 stop，空闲显示 send | 低——shadow DOM 条件渲染 |

### 12.2 与当前模板的结合点

- 如果模板需要**AI 对话功能**，可复用双模式架构（sidebar + window）
- 如果需要**多 tab 独立会话**，可复用按 section 隔离的 Map 状态管理
- 如果需要**流式输出可取消**，可复用独立 AbortController 设计
- 如果需要**PDF 选区上下文**，可复用 3 策略匹配思路
- 如果需要**用户自定义 Provider**，可复用预设 + 自定义对话框模式
- 如果需要**Prompt 管理**，可复用 CRUD + 拖拽编辑器
- 如果需要**快捷 AI 命令**，可复用 AIBarCommand 接口 + 策略函数
- 如果需要**类型化配置**，可复用 PluginPrefsMap 泛型包装

### 12.3 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 硬编码的 10 家 Provider 配置 | 应设计为可扩展注册表，不硬编码具体厂商 |
| Tailwind CSS 具体样式类 | 产品级 UI 样式，不应直接搬运到模板 |
| Prompt 文案硬编码在 prompts.ts | 应由可配置模板系统管理 |
| `chatWindowHost` 的具体 chrome:// URL | 模板应使用自己的窗口 URL |
| 中文特定的 l10n key（如 "pref-provider-alibaba"） | 模板应保持国际化中立 |
| 14 元组 TextBox tuple 类型 | 类型可读性差，应改为 interface |
| `addon.data.userProviderConfigs` 直接暴露 | 应通过 getter/setter 封装 |
| VirtualizedTable 直接用于 Prompt 预览 | 大数据量场景适用，但模板初期可能不需要 |
| `Zotero.PDFWorker._query("deletePages")`  hack | 内部 API，稳定性无保证 |
| 固定 50K 字符截断 | 应由 preference 控制 |

## 13. 与同类插件的架构对比

| 维度 | zotero-ai-bar | zotero-ai-assistant | zotero-ai-butler |
|---|---|---|---|
| **核心模式** | 轻量对话 + PDF 上下文 + 快捷命令 | React 面板 + Reader 弹出 | 多 Provider + Key 轮换 + 多模态管线 |
| **UI 模式** | 双模式（sidebar/window） | React root + surface bridge | MainWindow 多标签单例 |
| **会话管理** | 按 section 隔离 + 独立 AbortController | 单会话 + renderTextSelectionPopup | 任务队列 + 持久化 |
| **Provider** | 用户可配置 + 10 预设 | 固定 Provider | Registry + Key 轮换 |
| **上下文** | 多轮 history（可配置轮数） | 附件会话持久化 | Prompt 模板系统 |
| **PDF 处理** | 3 策略选区上下文提取 | PDF 阅读弹出 | PDFExtractor 全文提取 |
| **扩展方式** | AIBarCommand 策略接口 | React 组件扩展 | 功能 Service 模块化 |
| **Prompt** | 可视化编辑器 + 拖拽排序 | 硬编码 | utils/prompts.ts 解析 |

**关键区别：** AI-Bar 走的是"轻量快捷对话"路线——嵌入 Reader 侧边栏，支持 PDF 选区上下文、快捷命令（explain/summarize/translate/smartCopy）、用户可配置 Provider。AI-Assistant 走的是"React 面板 + Reader 文本弹出"路线，侧重 UI 层面的深度集成。AI-Butler 走的是"多模态批量处理 + 统一 Dashboard"路线，侧重批量任务和管线化。

## 14. 相关参考

- [REFERENCE_AIASSISTANT_PATTERNS.md](./REFERENCE_AIASSISTANT_PATTERNS.md) — React 面板 + 轻量对话对比
- [REFERENCE_AI_BUTLER_PATTERNS.md](./REFERENCE_AI_BUTLER_PATTERNS.md) — 多 Provider + 多模态对比
- [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) — 通用技术链
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) — ItemPaneManager / Notifier 接口
