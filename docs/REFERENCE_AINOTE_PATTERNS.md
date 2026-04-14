# REFERENCE_AINOTE_PATTERNS.md

> 参考来源：`reference/plugin/zotero-ainote-main/`（zotero-ainote）
> 用途：PDF 全文提取 → AI 批量总结 → 流式输出窗口 → 笔记附加的管线模式沉淀
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：zotero-ainote 源码](../reference/plugin/zotero-ainote-main/)

## 1. 核心架构概览

zotero-ainote 是一个批量 AI 笔记生成插件，核心能力是：选中多个文献条目 → 提取 PDF 全文 → 调用 LLM 生成总结 → 创建 Zotero 笔记附件。

```
Zotero 插件层：
├── hooks.ts                      生命周期、右键菜单注册、批量处理编排
├── addon.ts                      Addon 类
├── modules/
│   ├── noteGenerator.ts          NoteGenerator：单/批量笔记生成管线
│   ├── pdfExtractor.ts           PDFExtractor：全文提取 + 清洗 + 截断
│   ├── aiService.ts              AIService：多 Provider LLM 调用（流式/非流式）
│   ├── outputWindow.ts           OutputWindow：流式输出独立窗口
│   └── preferenceScript.ts       偏好设置面板逻辑
└── utils/
    ├── prompts.ts                Prompt 模板 + 版本管理
    ├── prefs.ts                  Preference 读写
    └── locale.ts                 国际化
```

核心模块：

| 模块 | 职责 | 文件 |
|---|---|---|
| **NoteGenerator** | 单条目笔记生成 + 批量处理编排 + 停止/关闭回调 | `src/modules/noteGenerator.ts` |
| **AIService** | 多 Provider 自动检测 + 流式 SSE/NDJSON 解析 + 请求适配 | `src/modules/aiService.ts` |
| **PDFExtractor** | 全文索引缓存读取 + 文本清洗 + 可配置截断 | `src/modules/pdfExtractor.ts` |
| **OutputWindow** | 独立窗口流式输出 + 逐条目分隔 + 停止按钮 + 错误展示 | `src/modules/outputWindow.ts` |

## 2. 批量处理管线

### 2.1 主流程

```
handleGenerateSummary()
  ├── 检查 API Key 配置
  ├── 获取选中 items
  ├── 创建 ProgressWindow（不自动关闭）
  └── NoteGenerator.generateNotesForItems(items, progressCallback)
        ├── 创建 OutputWindow（独立窗口）
        ├── 设置 onStop / onClose 回调
        ├── for each item:
        │   ├── PDFExtractor.extractTextFromItem()  → 全文
        │   ├── PDFExtractor.cleanText()            → 清洗
        │   ├── PDFExtractor.truncateText()         → 截断（可配置）
        │   ├── AIService.generateSummary()         → LLM 调用（流式）
        │   ├── formatNoteContent()                 → 格式化 HTML
        │   └── createNote()                        → 创建笔记附件
        └── 显示完成统计
```

### 2.2 停止 / 关闭回调

```typescript
// 用户点击 OutputWindow 的 Stop 按钮
outputWindow.setOnStop(() => { stopped = true; });

// 用户关闭 OutputWindow 窗口
outputWindow.setOnClose(() => {
  windowClosed = true;
  if (!allCompleted) {
    // 弹出通知：后台继续处理
    new ztoolkit.ProgressWindow(...).createLine({
      text: "输出窗口已关闭，AI 生成将在后台继续进行",
    }).show();
  }
});

// 主循环检查
for (let i = 0; i < total; i++) {
  if (stopped) break;  // 用户主动停止
  await this.generateNoteForItem(item, outputWindow, callback);
}
```

**设计决策：** 关闭窗口 ≠ 停止处理。后台任务继续运行，只是不再有实时 UI 反馈。这与 pdf2zh 的 FileProcessor 不同——后者没有中途停止机制。

### 2.3 进度回调

```typescript
progressCallback(current, total, progress, message)
// current: 当前处理到第几个
// total: 总条目数
// progress: 当前条目的进度百分比（10, 30, 40, 80, 100）
// message: 状态文本（含错误信息）
```

进度阶段：
- `10%` — 正在提取 PDF 文本
- `30%` — 内容截断提示（如果触发）
- `40%` — 正在生成 AI 总结
- `80%` — 正在创建笔记
- `100%` — 完成

## 3. 多 Provider LLM 集成

### 3.1 自动 Provider 检测

```typescript
enum ProviderType { OpenAI, DeepSeek, Azure, Gemini, Claude, Custom }

private static detectProvider(apiUrl: string): ProviderType {
  const url = apiUrl.toLowerCase();
  if (url.includes("api.openai.com")) return ProviderType.OpenAI;
  if (url.includes("api.deepseek.com")) return ProviderType.DeepSeek;
  if (url.includes("openai.azure.com")) return ProviderType.Azure;
  if (url.includes("generativelanguage.googleapis.com")) return ProviderType.Gemini;
  if (url.includes("api.anthropic.com")) return ProviderType.Claude;
  return ProviderType.Custom;
}
```

### 3.2 请求适配

| Provider | URL 适配 | 认证方式 | 消息格式 | 流式控制 |
|---|---|---|---|---|
| **OpenAI** | `/v1/chat/completions` | `Bearer {key}` | system + user | `stream: true` |
| **DeepSeek** | `/chat/completions` | `Bearer {key}` | system + user | `stream: true` |
| **Azure** | `/deployments/{name}/chat/completions?api-version=...` | `api-key: {key}` | system + user | `stream: true` |
| **Gemini** | `/models/{model}:streamGenerateContent?key={key}` | URL 参数 `?key=` | `contents: [{parts:[{text}]}]` | URL 区分流式/非流式 |
| **Claude** | `/v1/messages` | `x-api-key` + `anthropic-version` | system 单独参数 + user | `stream: true` |
| **Custom** | 用户自定义 | `Bearer {key}` | system + user | `stream: true` |

**设计特点：** 不是通过下拉菜单选择 Provider，而是根据用户输入的 `apiUrl` 自动识别。这意味着用户只需填一个 URL + Key，不需要选择服务商。

### 3.3 流式解析

支持三种流式响应格式：

```typescript
// 1. SSE（OpenAI/Claude/DeepSeek/Azure/Custom）
data: {"choices":[{"delta":{"content":"Hello"}}]}

// 2. NDJSON（Ollama Native 等）
{"message":{"content":"Hello"}}

// 3. JSON 数组流（Gemini）
[{...},{...},...]  // 手动扫描 '{' '}' 配对方括号内的完整对象
```

**关键实现：** 使用 `Zotero.HTTP.request` + `requestObserver` 监听 `xmlhttp.onprogress`，而不是 `fetch` + `ReadableStream`。这在 Zotero 环境下更稳定，因为 `Zotero.HTTP.request` 支持进度回调和超时重置。

```typescript
xmlhttp.onprogress = (e) => {
  const resp = e.target.response;
  const slice = partialLine + resp.slice(processedLength);
  const parts = slice.split(/\r?\n/);

  for (const raw of parts) {
    if (raw.startsWith("data: ")) {
      // SSE
    } else if (raw.trim().startsWith("{")) {
      // NDJSON
    }
    const delta = parseStreamDelta(json, providerType);
    if (delta) onProgress(delta);
  }

  // 每次收到数据时重置超时
  e.target.timeout = 0;
};
```

**流式超时保护：** 初始超时 300 秒，每次收到数据时重置为 0（禁用超时），避免长流被误判。

### 3.4 非流式回退

如果流式响应没有拿到任何增量数据，自动回退到非流式请求：

```typescript
const streamed = chunks.join("");
if (gotAnyDelta && streamed) return streamed;
return await AIService.nonStreamCompletion(...);  // 回退
```

## 4. PDF 全文提取

### 4.1 利用 Zotero 全文索引

```typescript
// 1. 检查索引状态
const indexedState = await Zotero.Fulltext.getIndexedState(pdfAttachment);

// 2. 未索引则触发索引
if (indexedState !== Zotero.Fulltext.INDEX_STATE_INDEXED) {
  await Zotero.Fulltext.indexItems([pdfAttachment.id]);
  await Zotero.Promise.delay(1000);  // 等待索引完成
}

// 3. 读取缓存文件
const cacheFile = Zotero.Fulltext.getItemCacheFile(pdfAttachment);
const content = await Zotero.File.getContentsAsync(cacheFile.path);
```

**设计决策：** 不自己解析 PDF，而是复用 Zotero 内置的全文索引系统。这减少了依赖，但要求用户的 Zotero 已启用全文索引功能。

### 4.2 文本清洗

```typescript
static cleanText(text: string): string {
  text = text.replace(/\s+/g, " ");                              // 压缩空白
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");  // 移除控制字符
  text = text.replace(/\r\n/g, "\n");                            // 统一换行
  text = text.replace(/\n{3,}/g, "\n\n");                        // 最多两个连续换行
  return text.trim();
}
```

### 4.3 可配置截断

```typescript
const truncateLengthStr = (getPref("truncateLength") as string) || "10";
const truncateLength = (parseInt(truncateLengthStr) || 10) * 10000;  // 单位：万字符

static truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf(".");
  if (lastPeriod > maxLength * 0.8) return truncated.substring(0, lastPeriod + 1);
  return truncated + "...";
}
```

**尝试在句号边界截断**，避免在句子中间切断。如果最后一个句号在 80% 位置之后，就截到句号；否则直接截断加省略号。

## 5. Prompt 版本管理

```typescript
// prompts.ts
export const PROMPT_VERSION = 2;

export function shouldUpdatePrompt(currentVersion?: number, currentPrompt?: string): boolean {
  if (!currentVersion || currentVersion < PROMPT_VERSION) return true;
  // 如果用户自定义过提示词（与默认不同），不自动覆盖
  if (currentPrompt && currentPrompt !== getDefaultSummaryPrompt(currentVersion - 1)) return false;
  return true;
}

export function getDefaultSummaryPrompt(version: number = PROMPT_VERSION): string {
  switch (version) {
    case 1: return "...";  // 旧版 prompt
    case 2: return "...";  // 新版 prompt
    default: return "...";
  }
}
```

**启动时自动检查：**

```typescript
function initializeDefaultPrefsOnStartup() {
  if (shouldUpdatePrompt(currentPromptVersion, currentPrompt)) {
    setPref("summaryPrompt", defaultValue);
    setPref("promptVersion", PROMPT_VERSION);
  }
}
```

**设计决策：** 如果用户自定义过 prompt（与上一版默认值不同），不自动覆盖，保留用户的自定义内容。这是一个尊重用户配置的细节设计。

## 6. 笔记创建

```typescript
static async createNote(item: Zotero.Item, content: string): Promise<Zotero.Item> {
  const note = new Zotero.Item("note");
  note.parentID = item.id;        // 附加到父条目
  note.setNote(content);
  note.addTag("AI-Generated");    // 自动打标签
  await note.saveTx();
  return note;
}
```

**HTML 格式化：**

```typescript
static formatNoteContent(itemTitle: string, summary: string): string {
  const htmlContent = this.convertMarkdownToNoteHTML(summary);
  return `<h2>AI 总结 - ${escapeHtml(itemTitle)}</h2>\n<div>${htmlContent}</div>`;
}

// Markdown → HTML 转换
static convertMarkdownToNoteHTML(markdown: string): string {
  let html = OutputWindow.convertMarkdownToHTMLCore(markdown);
  html = html.replace(/\s+style="[^"]*"/g, '');  // 移除内联样式

  // 块级公式：$$...$$ → <pre class="math">$$...$$</pre>
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, f) => `<pre class="math">$$${f}$$</pre>`);

  // 行内公式：$...$ → <span class="math">$...$</span>
  html = html.replace(/\$([^\$\n]+?)\$/g, (_, f) => `<span class="math">$${f}$</span>`);

  return html;
}
```

**设计决策：** 生成的是 HTML 笔记（Zotero 原生笔记格式），而不是 Markdown 笔记。公式使用 `<pre class="math">` 和 `<span class="math">` 标记，适配 Zotero 笔记的 MathJax 渲染。

## 7. 可借鉴点

### 7.1 可借鉴的架构模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **批量处理 + 独立输出窗口** | 需要实时展示进度的批量 AI 任务 | 中——需要窗口生命周期管理 |
| **多 Provider 自动检测** | 根据 URL 自动识别服务商 | 低——URL 字符串匹配 |
| **流式 SSE + NDJSON + JSON 数组统一解析** | 多种 LLM 流式响应兼容 | 中——需要处理半行截断 |
| **requestObserver 进度回调** | Zotero 环境下稳定的流式 HTTP | 低——Zotero.HTTP.request 原生支持 |
| **流式超时重置** | 长流式响应防超时 | 低——`e.target.timeout = 0` |
| **非流式回退** | 流式失败时自动降级 | 低——检测 `gotAnyDelta` 标志 |
| **全文索引缓存复用** | 不自己解析 PDF，利用 Zotero 已有索引 | 低——Zotero.Fulltext API |
| **Prompt 版本管理** | 默认 prompt 升级但不覆盖用户自定义 | 低——版本号 + 差异检测 |
| **停止 / 关闭回调分离** | 关闭窗口 ≠ 停止处理 | 低——两个独立回调 |
| **可配置文本截断** | 用户自行控制 API 输入量 | 低——preference 配置 |
| **Markdown → HTML + 公式适配** | AI 输出 Markdown，转 Zotero 笔记 | 低——正则替换 |
| **笔记自动标签** | `note.addTag("AI-Generated")` | 低——Zotero API 标准用法 |

### 7.2 与当前模板的结合点

- 如果模板需要**批量 AI 处理**，可复用 generateNotesForItems 的循环 + 进度回调 + 停止机制
- 如果需要**多 LLM Provider 支持**，可复用 AIService 的 Provider 检测 + 请求适配 + 流式解析
- 如果需要**PDF 全文提取**，可复用 PDFExtractor 的索引缓存读取模式
- 如果需要**流式输出展示**，可复用 OutputWindow 的独立窗口模式
- 如果需要**prompt 版本管理**，可复用 PROMPT_VERSION + shouldUpdatePrompt 模式

### 7.3 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 硬编码的 ProgressWindow 启动提示（"AiNote loaded"） | 开发调试代码，不应出现在生产版本 |
| 单一 `apiKey` / `apiUrl` 全局配置 | 不支持同时配置多个 Provider 或按需切换 |
| Provider 自动检测基于 URL 字符串 | 脆弱，如果 API 地址变更（代理、反向代理）会误判 |
| 全文截断策略（从前 N 字符截断） | 只取文章前部，可能错过关键结论部分 |
| `convertMarkdownToHTMLCore` 未在此插件中定义 | 可能在 outputWindow.ts 中实现，需要了解完整实现 |
| `note.addTag("AI-Generated")` 硬编码标签名 | 应可配置 |
| 非流式回退只检查 `gotAnyDelta` | 如果 Provider 返回空但实际成功，会误触发回退 |
| Gemini 的 brace-counting JSON 解析 | 脆弱，应使用流式 JSON 解析器 |

## 8. 相关参考

- [REFERENCE_PDF2ZH_PATTERNS.md](./REFERENCE_PDF2ZH_PATTERNS.md) — PDF 处理 + 服务端通信
- [REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md](./REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md) — 完整 LLM Agent 架构
- [REFERENCE_PAPER_CHAT_PATTERNS.md](./REFERENCE_PAPER_CHAT_PATTERNS.md) — 轻量 AI 对话
- [REFERENCE_AIASSISTANT_PATTERNS.md](./REFERENCE_AIASSISTANT_PATTERNS.md) — Item Pane Chat 面板
