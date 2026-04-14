# REFERENCE_EXITEM_PATTERNS.md

> 参考来源：`reference/plugin/Zotero-Exitem-main/`（Zotero-Exitem-main，文献综述/AI 提炼插件）
> 用途：文献综述提取管线 + GPT 插件运行时桥接 + 文件夹合并综述 + 嵌入式 PDF 语义选择 + JSON 持久化存储 + 综述管理界面
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：Zotero-Exitem-main 源码](../reference/plugin/Zotero-Exitem-main/)

## 1. 核心架构概览

Zotero-Exitem-main 是一个面向 Zotero 的 AI 文献综述提炼插件，核心能力是：通过兼容的 GPT 插件（ZoteroGPT/AwesomeGPT/Meet OpenAI）调用 LLM，自动从单篇文献中提炼结构化研究信息（背景/方法/结论/关键发现）+ 支持文件夹级别的多文档合并综述 + PDF 语义嵌入选择 + JSON 文件持久化存储 + 带文件夹管理的综述列表 UI。

```
Zotero 插件层：
├── bootstrap.ts                    生命周期入口
├── index.ts                        全局 addon / ztoolkit 注册
├── addon.ts                        Addon 类：ztoolkit 实例
├── hooks.ts                        onStartup/onShutdown/onMainWindowLoad/onPrefsEvent
├── modules/
│   ├── reviewAI.ts                 AI 提炼核心：GPT 桥接、Prompt 构建、PDF Embedding、提取管线
│   ├── reviewConfig.ts             配置管理：GPT 插件检测、ZoteroGPT 快照、参数归一化
│   ├── reviewStore.ts              JSON 持久化存储：文件夹 CRUD、记录 CRUD、事件追踪
│   ├── reviewManager.ts            综述管理 UI：单例窗口（tab/dialog 双模式）
│   ├── reviewUI.ts                 右键菜单 / 工具栏按钮 / 菜单修复 / 进度报告
│   ├── reviewNote.ts               Markdown 构建 + 自定义 HTML 渲染 + Zotero 笔记创建
│   ├── reviewTypes.ts              全部类型定义
│   ├── preferenceScript.ts         设置面板 UI
│   └── examples.ts                 示例入口
├── utils/
│   ├── prefs.ts                    getPref/setPref 包装
│   ├── locale.ts                   i18n / stringBundle
│   └── window.ts                   窗口工具
└── addon/
    ├── prefs.js                    默认偏好设置
    └── manifest.json               插件清单 v2
```

核心模块：

| 模块 | 职责 | 文件 |
|---|---|---|
| **reviewAI** | AI 提炼核心管线：GPT 桥接调用、Prompt 构建、PDF Embedding 语义选择、进度报告 | `reviewAI.ts` |
| **reviewConfig** | GPT 插件检测（同步+异步+缓存）、ZoteroGPT preference 快照、参数归一化 | `reviewConfig.ts` |
| **reviewStore** | JSON 文件持久化存储：文件夹 CRUD、文献记录 CRUD、事件追踪、顺序操作队列 | `reviewStore.ts` |
| **reviewManager** | 综述管理窗口：单例模式、tab/dialog 双模式、排序/过滤/分页/批量操作 | `reviewManager.ts` |
| **reviewUI** | 右键菜单/工具栏按钮注册、菜单修复机制、提取进度报告 | `reviewUI.ts` |
| **reviewNote** | Markdown 构建、自定义 HTML 渲染（无外部依赖）、Zotero 原生笔记创建 | `reviewNote.ts` |
| **reviewTypes** | 全部类型定义：ReviewSettings、LiteratureReviewDraft、ReviewRecordRow | `reviewTypes.ts` |
| **preferenceScript** | 设置面板：GPT 插件状态显示、PDF 截断配置、Prompt 编辑 | `preferenceScript.ts` |

## 2. GPT 插件运行时桥接

### 2.1 同步检测 + 异步扫描 + 缓存

```typescript
// reviewConfig.ts
const AWESOME_GPT_DETECTION_CACHE_TTL_MS = 15_000;

// 第一步：同步检查已知入口
function detectAwesomeGPT(): AwesomeGPTDetection {
  // 检查 Zotero.AwesomeGPT.extractLiteratureReview
  // 检查 Zotero.GPT.extract
  // 检查 Meet.OpenAI.getGPTResponse
  // 检查 Zotero.Prefs（ZoteroGPT 配置）
}

// 第二步：异步扫描 AddonManager 补充检测
async function detectAwesomeGPTAsync(): Promise<AwesomeGPTDetection> {
  const runtime = detectAwesomeGPT();  // 同步快速路径
  if (runtime.callable) return runtime;
  // 检查缓存
  if (cache && cache.expiresAt > Date.now()) return cache.result;
  // 异步扫描 AddonManager
  const addonManager = await getAddonManagerSafe();
  // 搜索 "awesome gpt", "zotero gpt", "gpt meet zotero"
}
```

关键设计：
- **同步快速路径优先**：大多数情况同步检查即可返回，不阻塞
- **异步扫描兜底**：AddonManager 可能在 Zotero 启动后延迟加载
- **15 秒 TTL 缓存**：避免频繁扫描，平衡实时性与性能
- **obstacle 信息**：检测失败时记录具体原因（如"未初始化界面"）

### 2.2 ZoteroGPT Preference 快照

```typescript
// reviewConfig.ts — 从另一个插件的命名空间读取偏好
function getZoteroGPTPrefsSnapshot(): ZoteroGPTPrefsSnapshot | null {
  const base = "extensions.zotero.zoterogpt";
  const prefs = (Zotero as any)?.Prefs;
  if (!prefs?.get) return null;
  const api = normalizeAPIBase(String(prefs.get(`${base}.api`) || "").trim());
  const secretKey = String(prefs.get(`${base}.secretKey`) || "").trim();
  const model = String(prefs.get(`${base}.model`) || "").trim();
  // ... temperature, embeddingModel, embeddingBatchNum
  return { api, secretKey, model, temperature, embeddingModel, embeddingBatchNum, source: "zoterogpt" };
}
```

关键设计：
- 不依赖另一插件的运行时 API，直接读其 preference
- 即使目标插件未初始化/未加载，也能读取其配置
- 快照模式：只读当前值，不监听变化

### 2.3 多桥接入口优先级

```typescript
// reviewAI.ts — getGPTBridgeCalls 返回有序候选列表
function getGPTBridgeCalls(payload, mainWin): GPTBridgeCall[] {
  return [
    { key: "zotero.awesomegpt.extractLiteratureReview", call: () => Zotero.AwesomeGPT.extractLiteratureReview(payload) },
    { key: "zotero.awesomegpt.extract", call: () => Zotero.AwesomeGPT.extract(payload) },
    { key: "zotero.gpt.extract", call: () => Zotero.GPT.extract(payload) },
    { key: "window.awesomegpt.extract", call: () => globalThis.AwesomeGPT.extract(payload) },
    { key: "meet.openapi.getGPTResponse", call: () => mainWin.Meet.OpenAI.getGPTResponse(prompt) },
  ];
}

// tryCallAwesomeGPT — 优先使用上次成功的桥接
let preferredGPTBridgeKey: string | null = null;
const orderedBridgeCalls = preferredGPTBridgeKey == null
  ? bridgeCalls
  : [...bridgeCalls.filter(c => c.key === preferredGPTBridgeKey), ...bridgeCalls.filter(c => c.key !== preferredGPTBridgeKey)];
```

关键设计：
- **多入口有序尝试**：5 种不同的调用路径，按优先级依次尝试
- **偏好缓存**：上次成功的桥接入口优先尝试，减少失败重试
- **失败自动降级**：当前偏好桥接失败时自动清除偏好，尝试下一个
- **超时保护**：每个桥接调用都有独立的 `withPromiseTimeout`

## 3. 文献提炼提取管线

### 3.1 单文献提取流程

```typescript
// reviewAI.ts — extractLiteratureReview
async function extractLiteratureReview(item: Zotero.Item, options): Promise<LiteratureReviewDraft> {
  const report = createProgressReporter(options.onProgress);
  report(8, "加载文献信息");

  // 1. 构建输入源：元数据 + 笔记 + 标签 + PDF + 批注
  const source = await buildItemSource(item, settings, report);
  report(35, "整理输入");

  // 2. 内容长度检查
  if (source.content.length > MAX_SOURCE_CONTENT_CHARS) {
    throw new ReviewUserError("文献内容过长", "单个文献内容超过 100,000 字符");
  }

  // 3. 调用兼容 GPT 插件
  return await extractByCompatibleGPTPlugin(item, source, timeout, customPrompt, report);
}
```

进度报告阶段分布：
| 进度 | 阶段 | 说明 |
|---|---|---|
| 8% | 加载文献信息 | 标题、作者、期刊等 |
| 10-30% | 读取元数据/笔记/标签 | 同步读取 |
| 35% | 整理输入 | PDF/批注异步读取 |
| 42% | 检查 GPT 插件 | 异步检测 |
| 48-56% | 生成请求 | PDF Embedding（可选） |
| 60-70% | PDF 语义选择 | 分块、向量、排序 |
| 74% | 等待 LLM 响应 | 调用 GPT 桥接 |
| 88% | 解析结果 | JSON 提取 + 字段归一化 |
| 96% | 校验结果 | 字段完整性检查 |
| 100% | 完成 | 保存记录 |

### 3.2 输入源构建

```typescript
// reviewAI.ts — buildItemSource
async function buildItemSource(item, settings, report): Promise<ReviewItemSource> {
  // 元数据
  const title = safeField(item, "title") || item.getDisplayTitle();
  const journal = safeField(item, "publicationTitle");
  const date = safeField(item, "date");
  const abstractText = safeField(item, "abstractNote");
  const authors = joinCreators(item);
  const zoteroTags = getItemTags(item);
  const noteText = getNoteText(item);

  // PDF（可选）
  const attachments = await getCandidateAttachments(item);
  const pdfAnnotationSource = await getPDFAnnotationSource(attachments, settings, report);
  const pdfSource = await getPDFTextSource(attachments, settings, report);

  // 条件拼接
  const content = [
    `标题: ${title}`,
    `作者: ${authors}`,
    `期刊: ${journal}`,
    `时间: ${date}`,
    `标签: ${zoteroTags.join(", ")}`,
    `摘要: ${abstractText}`,
    noteText ? `补充笔记: ${noteText}` : "",
    settings.usePDFAnnotationsAsContext ? `PDF批注: ${pdfAnnotationSource.text}` : "",
    pdfPromptMode === "fulltext" ? `PDF原文: ${pdfSource.text}` : "",
  ].filter(Boolean).join("\n");
}
```

关键设计：
- **条件加载**：只在设置启用时才读取 PDF/批注
- **字符截断**：PDF 文本默认 20,000 字符，批注默认 12,000 字符
- **Prompt 模式选择**：根据 PDF 长度自动选择 `fulltext` 或 `embedding` 模式

### 3.3 输入截断常量

| 常量 | 值 | 用途 |
|---|---|---|
| `MAX_SOURCE_CONTENT_CHARS` | 100,000 | 单文献总输入上限 |
| `MAX_FOLDER_SUMMARY_SOURCE_CHARS` | 140,000 | 文件夹综述总输入上限 |
| `MAX_PDF_TEXT_CHARS` | 20,000 | PDF 全文截断 |
| `MAX_PDF_ANNOTATION_TEXT_CHARS` | 12,000 | PDF 批注截断 |
| `EMBEDDING_CHUNK_CHARS` | 1,200 | Embedding 分块大小 |
| `EMBEDDING_TOP_K` | 4 | 选择最相关片段数 |
| `EMBEDDING_MAX_CHUNKS` | 12 | 最大分块数 |

## 4. PDF Embedding 语义选择

### 4.1 Prompt 模式自动选择

```typescript
// reviewAI.ts
const DIRECT_PDF_PROMPT_MAX_CHARS = 10_000;  // 推断阈值

function pickPDFPromptMode(pdfText: string): "none" | "fulltext" | "embedding" {
  const length = pdfText.trim().length;
  if (!length) return "none";
  return length <= DIRECT_PDF_PROMPT_MAX_CHARS ? "fulltext" : "embedding";
}
```

### 4.2 Embedding 管线

```typescript
// reviewAI.ts — tryBuildPDFEmbeddingContext
async function tryBuildPDFEmbeddingContext(source, timeoutSeconds, report) {
  const openAI = mainWin.Meet.OpenAI;
  const embedDocuments = openAI?.embedDocuments;
  const embedQuery = openAI?.embedQuery;

  // 1. 分块
  const chunks = chunkTextForEmbedding(source.pdfText);
  if (chunks.length < 2) return "";

  // 2. 构建查询
  const query = buildPDFEmbeddingQuery(source);

  // 3. 并行计算文档向量和查询向量
  const docVectors = await embedDocuments(chunks);
  const queryVector = await embedQuery(query);

  // 4. 余弦相似度排序
  const ranked = chunks.map((text, i) => ({
    index: i, text, score: cosineSimilarity(queryVector, docVectors[i])
  })).filter(Boolean);

  // 5. 选 Top-K，按原始顺序返回
  const selected = ranked.sort((a, b) => b.score - a.score)
    .slice(0, EMBEDDING_TOP_K)
    .sort((a, b) => a.index - b.index);

  return selected.map((chunk, i) => `[片段${i + 1}] ${truncateText(chunk.text, 1200)}`).join("\n\n");
}
```

### 4.3 分块策略

```typescript
function chunkTextForEmbedding(text: string): string[] {
  // 1. 按双换行分段落
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  // 2. 合并段落直到接近 CHUNK_SIZE
  // 3. 超长段落（>1.5 * CHUNK_SIZE）直接截断分段
  // 4. 最多 EMBEDDING_MAX_CHUNKS 个块
}
```

关键设计：
- **段落边界优先**：尽量不在段落中间切断
- **超长段落硬切**：超过 1.5 倍 chunk 大小时直接按字符切
- **查询构建**：使用文献标题+作者+摘要构建语义查询，而不是随机采样
- **原始顺序保留**：Top-K 选完后按原文顺序排列，保持上下文连贯

## 5. 文件夹合并综述

### 5.1 管线流程

```typescript
// reviewAI.ts — synthesizeFolderReview
async function synthesizeFolderSummary(folderName, rows, options) {
  const report = createProgressReporter(options.onProgress);
  report(5, "整理文件夹记录");

  // 1. 构建多文档源内容
  const recordsContent = buildFolderSummarySourceContent(folderName, rows, report);

  // 2. 构建文件夹综述 Prompt
  const settings = getReviewSettings();
  const prompt = buildFolderSummaryPrompt(folderName, recordsContent, settings.customFolderSummaryPromptTemplate);

  // 3. 调用 GPT 插件
  const result = await summarizeByCompatibleGPTPlugin(folderName, prompt, recordsContent, timeout, report);
  result.recordCount = rows.length;
  return result;
}
```

### 5.2 Markdown 清理要求

```typescript
// DEFAULT_FOLDER_SUMMARY_PROMPT_TEMPLATE 硬性要求：
// 1. 仅输出纯文本正文，不要任何 Markdown 标记符
// 2. 返回前必须执行一次 Markdown 清理
// 3. 综述应覆盖：研究背景综述、研究方法对比、研究结论综合、主要发现归纳
```

关键设计：
- Zotero 原生笔记不支持 Markdown，LLM 输出必须是纯文本
- Prompt 中明确要求 LLM 自行清理 Markdown，减少后端处理
- 多文档输入按记录逐条列出，保留各自的提炼字段

## 6. 自定义 Markdown-to-HTML 渲染

### 6.1 Markdown 构建器

```typescript
// reviewNote.ts — buildReviewRecordMarkdown
function buildReviewRecordMarkdown(record: ReviewRecordRow, options) {
  const lines = [
    `# Exitem 提炼笔记：${headingTitle}`,
    "## 文献信息",
    `- 标题: ${fullTitle}`,
    `- 作者: ${authors}`,
    // ... 所有字段
    "## 来源追踪",
    `- 来源记录 ID: ${formatIDList(record.sourceRecordIDs)}`,
  ];
  appendSection(lines, "摘要", formatMarkdownParagraph(record.abstractText));
  appendSection(lines, "研究背景", formatMarkdownParagraph(record.researchBackground));
  // ...
  return lines.join("\n").trim() + "\n";
}
```

### 6.2 无外部依赖的 HTML 渲染器

```typescript
// reviewNote.ts — renderMarkdownToHTML
function renderMarkdownToHTML(markdown: string) {
  // 支持的语法：
  // - 标题（h1-h6）
  // - 代码块（``` ... ```）
  // - 无序列表（- ）
  // - 有序列表（1. ）
  // - 粗体（**text**）
  // - 斜体（*text*）
  // - 行内代码（`code`）
  //
  // 使用 flushParagraph / flushList / flushCodeBlock 状态机
  // 返回转义后的 HTML，带 <h1>-<h6>, <p>, <ul>, <ol>, <li>, <code>, <strong>, <em>
}
```

### 6.3 Zotero 原生笔记创建

```typescript
// reviewNote.ts
function getZoteroNotePrefix() {
  return (globalThis as any)?.Zotero?.Notes?.notePrefix || '<div class="zotero-note znv1">';
}
function getZoteroNoteSuffix() {
  return (globalThis as any)?.Zotero?.Notes?.noteSuffix || "</div>";
}

async function createNativeNoteForReviewRecord(record, options) {
  const parentItem = await Zotero.Items.getAsync(Number(record.zoteroItemID));
  const noteItem = new Zotero.Item("note");
  noteItem.libraryID = parentItem.libraryID;
  noteItem.parentItemID = parentItem.id;
  const noteHTML = buildReviewRecordNoteHTML(record, options);  // Markdown → HTML
  noteItem.setNote(noteHTML);
  await noteItem.saveTx();
  return noteItem;
}
```

关键设计：
- 不引入外部 Markdown 库，减少依赖体积
- 只支持提炼管线实际会用到的语法子集
- 使用 Zotero Notes 的 `notePrefix`/`noteSuffix` 保证格式兼容

## 7. JSON 文件持久化存储

### 7.1 存储结构

```typescript
// reviewStore.ts
interface JSONStoreData {
  schemaVersion: number;      // 当前为 2
  createdAt: string;
  updatedAt: string;
  nextIDs: { folder: number; record: number; event: number };  // 自增 ID 分配器
  folders: JSONStoreFolder[];
  records: JSONStoreRecord[];
  recordFolderLinks: JSONStoreRecordFolderLink[];  // 多对多关联
  events: JSONStoreEvent[];  // 事件追踪（成功/失败/点击）
}
```

### 7.2 顺序操作队列

```typescript
// reviewStore.ts
let opChain: Promise<void> = Promise.resolve();

function withStoreOp<T>(fn: () => Promise<T>): Promise<T> {
  opChain = opChain.then(fn, fn);  // 链式执行，不丢失错误
  return opChain.then(() => undefined as T);  // 实际返回由 fn 决定
}
```

关键设计：
- **链式序列化**：所有读写操作按调用顺序执行，不并发
- **错误不中断链**：`.then(fn, fn)` 确保即使前一个操作失败，后续操作仍可执行
- **自增 ID 分配**：`nextIDs` 对象管理三种实体的 ID，避免 UUID 碰撞

### 7.3 数据完整性修复

```typescript
// reviewStore.ts — ensureStoreIntegrity
function ensureStoreIntegrity(store: JSONStoreData): boolean {
  // 1. 检查 schemaVersion
  // 2. 修复孤立的 record-folder 链接
  // 3. 清理不存在的文件夹引用
  // 4. 确保默认文件夹存在
  // 5. 修复 nextIDs 不一致
  // 返回是否做了修改
}
```

### 7.4 文件夹多对多关联

```typescript
// 记录可以属于多个文件夹
interface JSONStoreRecordFolderLink {
  recordID: number;
  folderID: number;
  createdAt: string;
}

// 删除文件夹时，记录自动解除关联（不删除记录）
// 合并文件夹时，记录迁移到新文件夹，旧文件夹删除
```

### 7.5 事件追踪

```typescript
// 追踪的事件类型
// - ai_extraction_click: 用户点击提取
// - ai_extraction_success: 提取成功
// - ai_extraction_fail: 提取失败（含错误原因）
// - plugin_open: 从设置面板打开

// 统计当天 AI 提取次数
async function getTodayAIExtractionCount(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  return store.events.filter(e =>
    (e.eventName === "ai_extraction_success" || e.eventName === "ai_extraction_fail") &&
    String(e.createdAt).slice(0, 10) === today
  ).length;
}
```

## 8. 综述管理 UI

### 8.1 单例窗口管理

```typescript
// reviewManager.ts
let managerContext: ManagerContext | null = null;
let managerOpenPromise: Promise<void> | null = null;

async function openReviewManagerWindow(preferredWin?: Window) {
  if (managerContext) {
    if (managerOpenPromise) { await managerOpenPromise; }
    if (isManagerContextAlive(managerContext)) {
      focusManagerContext(managerContext);
      await refreshManagerData(managerContext);
      renderManager(managerContext);
      return;
    }
  }
  // 创建新上下文
  managerContext = createManagerContext();
  managerOpenPromise = openReviewManagerInTab(ctx, preferredWin)
    .then(opened => opened ? undefined : openReviewManagerInDialog(ctx));
  await managerOpenPromise;
}
```

### 8.2 Tab/Dialog 双模式回退

```typescript
const openedInTab = win ? await openReviewManagerInTab(ctx, win) : false;
if (!openedInTab) { await openReviewManagerInDialog(ctx); }
```

关键设计：
- 优先尝试在 Zotero Tab 中打开
- Tab 不可用时回退到独立 Dialog
- 已打开时聚焦已有窗口并刷新数据

### 8.3 状态管理

```typescript
interface ManagerState {
  viewMode: "literature" | "folderSummary";
  search: string;
  sortKey: "updatedAt" | "title" | "publicationDate" | "journal";
  sortDir: "asc" | "desc";
  totalRows: number;
  folderFilterID: number | null;
  selectedFolderIDs: Set<number>;
  selectedRecordIDs: Set<number>;
  selectionAnchorRecordID: number | null;  // Shift-多选锚点
  folders: ReviewFolderRow[];
  rows: ReviewRecordRow[];
}
```

## 9. UI 注册与修复机制

### 9.1 右键菜单注册

```typescript
// reviewUI.ts
function registerReviewContextMenu(win?: Window) {
  if (win) {
    bindReviewContextMenuRepair(win);
    ensureReviewContextMenuInWindow(win);
    return;
  }
  // 遍历所有主窗口
  const wins = getMainWindowsCompat();
  for (const mainWin of wins) {
    bindReviewContextMenuRepair(mainWin);
    ensureReviewContextMenuInWindow(mainWin);
  }
}
```

### 9.2 菜单/按钮自动修复

```typescript
// reviewUI.ts — 上下文菜单修复
function bindReviewContextMenuRepair(win: Window) {
  // 1. popupshowing 事件捕获：每次右键菜单弹出时检查
  win.document.addEventListener("popupshowing", (event) => {
    const popup = event.target;
    if (isLikelyItemMenuPopup(popup)) {
      void ensureReviewContextMenuInPopup(popup);
    }
  }, true);

  // 2. 延迟重试：[250ms, 1s, 3s, 6s]
  for (const delay of repairRetryDelays) {
    scheduleWindowTask(win, delay, () => ensureReviewContextMenuInWindow(win));
  }
}

// reviewUI.ts — 工具栏按钮修复
function bindReviewToolbarRepair(win: Window) {
  // 1. 延迟重试：[250ms, 1s, 3s, 6s]
  for (const delay of repairRetryDelays) {
    scheduleWindowTask(win, delay, () => registerReviewToolbarButton(win));
  }

  // 2. MutationObserver 监听 DOM 变化
  const observer = new MutationObserver(() => {
    scheduleWindowTask(win, 60, () => {
      if (!doc.getElementById(reviewToolbarButtonID)) {
        registerReviewToolbarButton(win);
      }
    });
  });
  observer.observe(root, { childList: true, subtree: true });
}
```

关键设计：
- **WeakSet 去重**：避免同一窗口重复绑定
- **事件捕获**：在 `popupshowing` 捕获阶段拦截，确保菜单弹出前修复
- **渐进式重试**：4 个延迟时间点覆盖不同加载时序
- **MutationObserver**：工具栏按钮在 Zotero 更新 DOM 后自动重建
- **isLikelyItemMenuPopup**：通过 ID 和 tagName 启发式查找菜单，不依赖固定选择器

### 9.3 工具栏容器查找

```typescript
function findToolbarContainer(doc: Document) {
  const ids = [
    "zotero-toolbar", "zotero-tb-toolbar", "zotero-items-toolbar",
    "zotero-collections-toolbar", "zotero-pane-toolbar", "zotero-tb-sync",
  ];
  // 按优先级查找，最后 fallback 到 header 或任意 toolbar
}
```

### 9.4 XUL/HTML 双模式按钮

```typescript
// XUL 模式
button = doc.createXULElement("toolbarbutton");
button.setAttribute("image", "chrome://.../favicon@0.5x.png");
button.addEventListener("command", () => openReviewManagerWindow(win));

// HTML 模式（Zotero 7+）
const htmlButton = doc.createElement("button");
Object.assign(htmlButton.style, {
  backgroundImage: `url(chrome://.../favicon@0.5x.png)`,
  // ... inline styles
});
htmlButton.addEventListener("click", () => openReviewManagerWindow(win));
```

## 10. 进度报告模式

### 10.1 单文献提取进度

```typescript
// reviewUI.ts
function createSingleExtractionProgressUpdater(progressWindow, item) {
  let lastProgress = -1;
  let lastStage = "";
  return (update: ReviewExtractionProgress) => {
    const nextProgress = Math.max(0, Math.min(96, Math.floor(update.progress)));
    const nextStage = update.stage || "处理中";
    if (nextProgress === lastProgress && nextStage === lastStage) return;  // 去重
    lastProgress = nextProgress;
    lastStage = nextStage;
    progressWindow.changeLine({
      text: `正在提炼（${nextProgress}%）: ${title} · ${nextStage}`,
      progress: nextProgress,
    });
  };
}
```

### 10.2 批量提取进度

```typescript
// reviewUI.ts — 将每个文献的进度映射到全局进度条
function createBatchExtractionProgressUpdater(progressWindow, { item, index, total }) {
  return (update: ReviewExtractionProgress) => {
    const itemProgress = Math.max(0, Math.min(100, Math.floor(update.progress)));
    const ratioStart = (index - 1) / total;
    const ratioCurrent = (index - 1 + itemProgress / 100) / total;
    const globalProgress = Math.floor(ratioStart * 100 + (ratioCurrent - ratioStart) * 100);
    progressWindow.changeLine({
      text: `(${index}/${total}) ${title} · ${nextStage}`,
      progress: globalProgress,
    });
  };
}
```

关键设计：
- **去重**：相同进度和阶段不重复更新，减少 UI 抖动
- **进度上限**：单文献到 96%（预留保存步骤），批量到 99%
- **线性映射**：批量时将每个文献的进度按比例映射到全局进度条
- **异常容错**：progressWindow 已关闭时 catch 忽略

## 11. Prompt 字段解析

### 11.1 三级解析策略

```typescript
// reviewAI.ts — parseReviewPromptFieldKeys
function parseReviewPromptFieldKeys(customPromptTemplate = "") {
  // 1. 显式字段行：寻找包含"字段"或"fields"的行，提取冒号后的 token
  const explicit = parsePromptFieldKeysFromExplicitFieldLine(template);
  if (explicit.length) return explicit;

  // 2. 正则模式匹配：在 Prompt 全文中搜索各字段的别名模式
  const fallback = parsePromptFieldKeysByPattern(template);
  if (fallback.length) return fallback;

  // 3. 回退到默认字段列表
  return [...DEFAULT_REVIEW_PROMPT_FIELD_KEYS];
}
```

### 11.2 别名映射

```typescript
const PROMPT_FIELD_ALIAS_MAP: Record<string, ReviewPromptFieldKey> = {
  title: "title", 标题: "title",
  authors: "authors", author: "authors", 作者: "authors",
  journal: "journal", 期刊: "journal",
  publicationdate: "publicationDate", 发表时间: "publicationDate",
  // ... 完整的中英文别名映射
};
```

关键设计：
- 用户自定义 Prompt 中的字段名可能各不相同
- 通过显式声明 → 正则匹配 → 默认列表三级回退
- 支持中英文字段名、驼峰/下划线/空格变体

## 12. 配置归一化

### 12.1 类型化归一化

```typescript
// reviewConfig.ts
function normalizeInt(value: unknown, defaultValue: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : defaultValue;
}
function normalizeBool(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return defaultValue;
}
function normalizeFloat(value: unknown, defaultValue: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}
```

### 12.2 API URL 归一化

```typescript
function normalizeAPIBase(value: string) {
  return String(value || "").trim().replace(/\/(?:v1)?\/?$/, "");
}
```

关键设计：
- Zotero prefs 存储为字符串，需要归一化为正确类型
- API URL 自动去除末尾的 `/v1/` 或 `/`，避免拼接错误

## 13. 多窗口兼容性

### 13.1 getMainWindowsCompat

```typescript
// hooks.ts / reviewUI.ts 各有一份
function getMainWindowsCompat(): _ZoteroTypes.MainWindow[] {
  // 1. Zotero.getMainWindows()（Zotero 7 新 API）
  // 2. Zotero.getMainWindow()（旧 API）
  // 3. Services.wm.getEnumerator("zotero:main")（XPCOM 兜底）
}
```

### 13.2 主窗口加载兼容

```typescript
// hooks.ts
async function onStartup() {
  await Promise.all(
    [Zotero.initializationPromise, Zotero.unlockPromise, Zotero.uiReadyPromise].filter(Boolean),
  );
  // 所有 wait promise 都允许失败，不阻塞后续注册
  initLocale();
  registerPreferencePane();
  initializeReviewFeature();
  // 遍历所有主窗口注册
  getMainWindowsCompat().forEach(win => onMainWindowLoad(win));
}
```

## 14. 可借鉴点

### 14.1 高价值可复用模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **GPT 插件运行时桥接** | 需要兼容多个第三方 GPT 插件 | 高——同步+异步+缓存+多桥接 |
| **Preference 快照读取** | 读取另一插件的配置而不依赖其 API | 低——直接读 `Zotero.Prefs.get` |
| **多桥接优先级 + 偏好缓存** | 多种调用路径时自动选最优 | 中——有序候选 + 成功缓存 |
| **PDF Embedding 语义选择** | 长 PDF 内容无法全量输入时 | 高——分块+向量+余弦排序 |
| **Prompt 模式自动切换** | 根据输入长度自动选择 fulltext/embedding | 低——长度阈值判断 |
| **进度报告去重** | 频繁进度更新导致 UI 抖动 | 低——lastProgress/lastStage 比较 |
| **批量进度线性映射** | 批量任务的全局进度条展示 | 中——按比例映射 |
| **菜单/按钮自动修复** | Zotero 更新 DOM 后 UI 元素丢失 | 中——popupshowing + MutationObserver |
| **JSON 文件存储 + 链式队列** | 轻量级本地持久化，不需要 SQLite | 中——opChain 序列化 |
| **数据完整性自修复** | JSON 文件可能被手动修改或版本升级 | 中——ensureStoreIntegrity |
| **Markdown-to-HTML 子集渲染** | 只需要有限 Markdown 语法，不想引入外部库 | 低——手写解析器 |
| **Zotero 笔记前缀/后缀适配** | 创建原生 Zotero Note 时格式兼容 | 低——读取 notePrefix/noteSuffix |
| **Prompt 字段三级解析** | 用户自定义 Prompt 字段名不统一 | 中——显式→正则→默认 |
| **API URL 自动归一化** | 用户输入 API URL 格式不一致 | 低——正则替换 |
| **Tab/Dialog 双模式窗口** | 综述管理界面优先 Tab，回退 Dialog | 中——单例 + 回退 |
| **事件追踪 + 统计** | 分析用户使用频率和失败率 | 低——JSON 事件数组 |
| **类型化参数归一化** | Zotero prefs 均为字符串，需归一化 | 低——normalizeInt/Bool/Float |
| **XUL/HTML 双模式 UI** | 兼容 Zotero 6 和 Zotero 7 | 低——条件判断 |

### 14.2 与当前模板的结合点

- 如果模板需要**AI 文献提炼**，可复用 GPT 桥接架构和提取管线
- 如果需要**多 GPT 插件兼容**，可复用运行时检测 + 偏好缓存 + 多桥接优先级
- 如果需要**长 PDF 处理**，可复用 Embedding 语义选择管线
- 如果需要**本地持久化**，可复用 JSON 文件存储 + 链式操作队列
- 如果需要**菜单/按钮注册**，可复用自动修复机制（popupshowing + MutationObserver）
- 如果需要**进度报告**，可复用去重 + 批量线性映射模式
- 如果需要**AI 生成的 Zotero 笔记**，可复用 Markdown-to-HTML 子集渲染

### 14.3 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 具体 Prompt 文案 | 应由可配置模板系统管理，不硬编码 |
| GPT 桥接的具体入口列表 | 应抽象为可注册的 Provider 接口 |
| Embedding 具体参数（1200/4/12） | 应由配置控制，不同模型有不同的 optimal chunk size |
| `ReviewUserError` 具体错误文案 | 应由 i18n 系统管理 |
| JSON 存储的具体文件名 | 应由配置控制 |
| 具体的中文字段别名 | 应由 i18n/本地化系统管理 |
| `zotero.awesomegpt.extractLiteratureReview` 等硬编码入口 | 应抽象为可配置的桥接注册表 |
| 进度条具体百分比分布 | 应与实际管线阶段解耦 |
| 修复重试延迟 `[250, 1000, 3000, 6000]` | 应由配置控制 |
| `singleExtractionDefaultFolderName = "我的记录"` | 应由 preference 配置 |

## 15. 与同类插件的架构对比

| 维度 | Zotero-Exitem-main | zotero-ai-collection-bootstrap | zotero-AI-Butler |
|---|---|---|---|
| **核心模式** | AI 文献提炼 + 综述管理 | AI 智能分类 + Collection 树管理 | 多 Provider + Key 轮换 + 多模态管线 |
| **LLM 调用** | 依赖第三方 GPT 插件运行时桥接 | 直接 HTTP 调用 + 多配置档案 | Provider Registry + Key 轮换 + 冷却 |
| **输出** | 结构化提炼记录 + 文件夹综述 + Zotero 笔记 | 修改 Collection 归属 | 创建笔记 + Dashboard 展示 |
| **持久化** | JSON 文件 + 链式队列 | 无（依赖 Zotero 本身） | 无（依赖 Zotero 本身） |
| **PDF 处理** | Embedding 语义选择 + 批注提取 | 不涉及 | 不涉及 |
| **UI** | 综述管理单例窗口（tab/dialog） | 分类确认对话框 | 统一 Dashboard |
| **菜单** | 右键菜单 + 工具栏按钮 + 自动修复 | 右键菜单 | 右键菜单 |
| **容错** | 多桥接降级 + 超时保护 + 字段归一化 | JSON 双格式回退 | 重试 + Key 轮换 + 冷却 |

**关键区别：** Exitem 走的是"AI 文献提炼 + 结构化输出"路线——从单篇文献中提取背景/方法/结论/关键发现，存储为结构化记录，支持文件夹级别的合并综述。其独特之处在于：1）依赖第三方 GPT 插件的运行时桥接，而不是直接 HTTP 调用；2）PDF Embedding 语义选择，解决长 PDF 输入超限问题；3）JSON 文件持久化，不依赖 Zotero 原生存储。

## 16. 相关参考

- [REFERENCE_AIASSISTANT_PATTERNS.md](./REFERENCE_AIASSISTANT_PATTERNS.md) — 轻量 Chat / Reader 弹出对话
- [REFERENCE_AI_BUTLER_PATTERNS.md](./REFERENCE_AI_BUTLER_PATTERNS.md) — 多 Provider + 多模态对比
- [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) — 通用技术链
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) — Notifier / Item / Note 接口
