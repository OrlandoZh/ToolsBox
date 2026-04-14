# REFERENCE_AI_BUTLER_PATTERNS.md

> 参考来源：`reference/plugin/zotero-AI-Butler-main/`（zotero-AI-Butler）
> 用途：多 Provider LLM 集成 + API Key 轮换 + 任务队列 + 多模态 AI 管线 + 统一 Dashboard
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：zotero-AI-Butler 源码](../reference/plugin/zotero-AI-Butler-main/)

## 1. 核心架构概览

zotero-AI-Butler 是一个多模态 AI 文献处理插件，核心能力是：多 Provider LLM 调用 + API Key 自动轮换 + 任务队列批量处理 + 6 种 AI 功能（总结、聊天、一图总结、思维导图、文献综述、表格填充）+ 统一 Dashboard 界面。

```
Zotero 插件层：
├── bootstrap.ts                    生命周期入口
├── index.ts                        re-export + 全局对象注册
├── addon.ts                        Addon 类：ztoolkit / prefs / dialog 实例
├── hooks.ts                        onStartup / onShutdown / 8+ 菜单 / Reader 工具栏 / Item Pane Section / AutoScanManager
├── modules/
│   ├── llmproviders/
│   │   ├── ILlmProvider.ts         Provider 接口：generateSummary / chat / testConnection
│   │   └── ProviderRegistry.ts     Map-based 注册表：register / get / list
│   ├── llmClient.ts                LLMClient facade：buildOptions / resolveProvider / 重试 + Key 轮换
│   ├── apiKeyManager.ts            多 Key 轮换：等权重轮转、失败标记、冷却期、禁用管理
│   ├── taskQueue.ts                TaskQueueManager：优先级调度 / 并发控制 / 失败重试 / 持久化 / 流式事件
│   ├── noteGenerator.ts            NoteGenerator：PDF→文本清理→AI分析→Markdown→Zotero笔记 完整管线
│   ├── pdfExtractor.ts             PDFExtractor：全文索引 / MinerU API / 多 PDF 上传 / 文件大小检测
│   ├── imageSummaryService.ts      ImageSummaryService：PDF→视觉摘要LLM→Gemini图片生成→笔记保存
│   ├── mindmapService.ts           MindmapService：PDF→LLM结构化Markdown→markmap笔记保存
│   ├── literatureReviewService.ts  LiteratureReviewService：报告创建→逐篇填表→汇总生成综述
│   └── views/
│       ├── MainWindow.ts           单例：对话框容器 / 标签页导航 / 6 个子视图
│       ├── ItemPaneSection.ts      条目面板侧边栏：AI 笔记预览 / 一图总结 / 快速对话
│       ├── DashboardView.ts        仪表盘概览
│       ├── SummaryView.ts          AI 总结输出（流式）
│       ├── TaskQueueView.ts        任务队列管理界面
│       ├── SettingsView.ts         快捷设置面板
│       ├── LibraryScannerView.ts   库扫描视图
│       └── LiteratureReviewView.ts 文献综述视图
└── utils/
    ├── prefs.ts                    Preference 读写
    ├── locale.ts                   i18n / getString
    └── prompts.ts                  多轮 Prompt 解析 / 默认模板 / SummaryMode 类型
```

核心模块：

| 模块 | 职责 | 文件 |
|---|---|---|
| **Provider Registry** | Map-based LLM Provider 注册，支持 6 种提供商 | `llmproviders/ProviderRegistry.ts` |
| **ILlmProvider** | Provider 接口：generateSummary / chat / testConnection | `llmproviders/ILlmProvider.ts` |
| **LLMClient Facade** | 统一调用入口、per-provider 配置构建、运行时 Provider 选择、重试+Key轮换 | `llmClient.ts` |
| **ApiKeyManager** | 多 Key 等权重轮换、失败标记+冷却、禁用管理、per-provider 配置映射 | `apiKeyManager.ts` |
| **TaskQueueManager** | 任务队列：优先级调度、并发控制、失败重试、持久化、流式事件回调 | `taskQueue.ts` |
| **NoteGenerator** | 核心管线：PDF提取→文本清理→AI分析→Markdown转换→笔记保存、支持 skip/overwrite/append 策略 | `noteGenerator.ts` |
| **PDFExtractor** | PDF 文本提取：Zotero 全文索引 / MinerU API / 多 PDF 上传 / 文件大小检测 | `pdfExtractor.ts` |
| **ImageSummaryService** | 一图总结：PDF→视觉摘要LLM→Gemini图片生成→笔记保存 4 阶段工作流 | `imageSummaryService.ts` |
| **MindmapService** | 思维导图：PDF→LLM结构化Markdown→markmap笔记保存 3 阶段工作流 | `mindmapService.ts` |
| **LiteratureReviewService** | 文献综述：报告创建→逐篇填表(并行)→汇总生成综述 5 阶段工作流 | `literatureReviewService.ts` |
| **MainWindow** | 单例对话框容器：6 标签页导航、子视图切换、窗口生命周期管理 | `views/MainWindow.ts` |
| **ItemPaneSection** | 条目面板侧边栏：AI笔记预览、一图总结展示、快速对话(含KaTeX公式渲染) | `ItemPaneSection.ts` |
| **Prompts Utils** | 多轮 Prompt 解析、默认模板、SummaryMode 类型定义 | `utils/prompts.ts` |

## 2. Provider Registry + LLM Client 架构

### 2.1 Provider 接口

```typescript
interface ILlmProvider {
  id: string;                              // 提供商唯一ID
  name: string;                            // 显示名称
  generateSummary(content: string | Uint8Array, isBase64: boolean, prompt: string, onProgress?: (chunk: string) => void): Promise<string>;
  chat(messages: ChatMessage[], onProgress?: (chunk: string) => void): Promise<string>;
  testConnection(): Promise<boolean>;
  generateMultiFileSummary?(files: PdfFileInfo[], prompt: string, onProgress?: (chunk: string) => void): Promise<string>;
}
```

### 2.2 Map-based 注册表

```typescript
class ProviderRegistry {
  private static providers: Map<string, ILlmProvider> = new Map();
  static register(id: string, provider: ILlmProvider): void;
  static get(id: string): ILlmProvider | undefined;
  static list(): ILlmProvider[];
}
```

### 2.3 LLMClient Facade

```typescript
class LLMClient {
  private static buildOptions(id: string): LlmOptions { ... }   // 按提供商构建配置
  private static resolveProvider(id: string): ILlmProvider { ... }  // 运行时选择
  static async generateSummaryWithRetry(content, isBase64, prompt, onProgress): Promise<string> {
    const keyManagerId = this.mapToKeyManagerId(id);
    const maxRetries = ApiKeyManager.getMaxSwitchCount();
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.generateSummary(...);
        ApiKeyManager.advanceToNextKey(keyManagerId);  // 成功后轮换
        return result;
      } catch (error) {
        const rotated = ApiKeyManager.rotateToNextKey(keyManagerId);  // 失败后轮换
        if (!rotated) break;
      }
    }
  }
}
```

关键设计：
- **配置构建与调用分离**：`buildOptions` 按提供商 ID 读取不同的 URL、Model、API Key 等配置
- **重试 + Key 轮换一体化**：`generateSummaryWithRetry` / `chatWithRetry` 内嵌 API Key 轮换逻辑，调用方无需感知
- **成功/失败双路径轮换**：成功后 `advanceToNextKey`（等权重轮转），失败后 `rotateToNextKey`（跳过失败 Key）

## 3. API Key 轮换系统

### 3.1 配置映射

```typescript
const PROVIDER_KEY_MAPPINGS: Record<ProviderId, ProviderKeyMapping> = {
  openai:     { primaryPrefKey: "openaiApiKey",     extraKeysPrefKey: "openaiApiKeysFallback" },
  "openai-compat": { primaryPrefKey: "openaiCompatApiKey", extraKeysPrefKey: "openaiCompatApiKeysFallback" },
  google:     { primaryPrefKey: "geminiApiKey",      extraKeysPrefKey: "geminiApiKeysFallback" },
  anthropic:  { primaryPrefKey: "anthropicApiKey",   extraKeysPrefKey: "anthropicApiKeysFallback" },
  openrouter: { primaryPrefKey: "openRouterApiKey",  extraKeysPrefKey: "openRouterApiKeysFallback" },
  volcanoark: { primaryPrefKey: "volcanoArkApiKey",  extraKeysPrefKey: "volcanoArkApiKeysFallback" },
};
```

每个提供商一个主 Key（向后兼容）+ 一个 JSON 数组存储额外 Key。

### 3.2 运行时轮换状态

```typescript
interface RotationState {
  currentIndex: number;            // 当前活动的密钥索引
  failedKeys: Map<string, number>; // 失败的密钥 (key -> failedAt timestamp)
  successCount: number;            // 成功调用计数
}
```

### 3.3 核心轮换逻辑

- **等权重轮换**：`advanceToNextKey` 每次成功后 `currentIndex = (currentIndex + 1) % allKeys.length`
- **失败跳过**：`rotateToNextKey` 标记当前 Key 为失败，查找下一个非冷却 Key
- **冷却机制**：失败 Key 在 `getFailedKeyCooldown()`（默认 300s）内不参与轮换
- **禁用管理**：`toggleKeyDisabled` 持久化到 preference，支持用户手动禁用特定 Key
- **最大重试次数**：`getMaxSwitchCount()` 从 preference 读取，默认 3 次

关键设计：
- 运行时状态不持久化（`rotationStates` 是内存 Map），插件重启后重新从 preference 加载
- 单 Key 用户完全透明（`allKeys.length <= 1` 时直接跳过轮换逻辑）

## 4. 任务队列系统

### 4.1 任务模型

```typescript
enum TaskStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  PRIORITY = "priority",
}

type TaskType = "summary" | "imageSummary" | "mindmap" | "tableFill" | "review" | "targetedQuestion";

interface TaskItem {
  id: string;
  itemId: number;
  title: string;
  status: TaskStatus;
  progress: number;              // 0-100
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
  duration?: number;             // 处理耗时(秒)
  taskType?: TaskType;
  workflowStage?: string;        // 一图总结专用
  collectionId?: number;         // 综述专用
  tableTemplate?: string;        // 填表专用
  targetedPrompt?: string;       // 提问专用
  // ...
}
```

### 4.2 TaskQueueManager 核心能力

```typescript
class TaskQueueManager {
  private tasks: Map<string, TaskItem> = new Map();
  private processingTasks: Set<string> = new Set();
  private maxConcurrency: number = 1;
  private executionInterval: number = 60000;  // 默认60秒
  private isBatchRunning: boolean = false;

  // 任务管理
  addTask(task: TaskItem): void;
  removeTask(taskId: string): void;
  getTask(taskId: string): TaskItem | undefined;

  // 队列执行
  start(): void;                 // 启动定时器
  stop(): void;                  // 停止定时器
  executeBatch(): Promise<void>; // 执行一批任务

  // 回调
  onProgress(callback: TaskProgressCallback): void;
  onComplete(callback: TaskCompleteCallback): void;
  onStream(callback: TaskStreamCallback): void;  // 流式事件: start/chunk/finish/error

  // 持久化
  saveToStorage(): void;
  loadFromStorage(force?: boolean): void;
}
```

关键设计：
- **优先级调度**：`PRIORITY` 状态任务优先于 `PENDING`
- **并发控制**：`maxConcurrency` 从 preference 读取，控制同时处理数量
- **定时批处理**：`setInterval` 定期执行 `executeBatch`，间隔可配置
- **失败重试**：每个任务独立 `retryCount` / `maxRetries`，失败自动重试
- **持久化**：任务状态序列化到 preference，插件重启后恢复
- **流式事件**：`start` / `chunk` / `finish` / `error` 四类事件，支持实时 UI 更新

## 5. 多模态 AI 功能管线

### 5.1 笔记生成（NoteGenerator）

```
generateNoteForItem(item)
  ├── 1. PDFExtractor.extractPdfText(item) → pdfContent
  ├── 2. 文本清理（去除 PDF 伪影、截断）
  ├── 3. 检查笔记策略（skip/overwrite/append）
  ├── 4. LLMClient.generateSummaryWithRetry(content, prompt, onProgress)
  ├── 5. Markdown → Zotero HTML（marked 转换）
  ├── 6. 创建/更新/追加 Zotero 笔记条目
  └── 7. 关联到原条目
```

关键设计：
- **笔记管理策略**：`skip`（已有则跳过）/ `overwrite`（覆盖）/ `append`（追加），从 preference 读取
- **流式输出**：通过 `onProgress` 回调实时传递 AI chunk 给 SummaryView
- **多轮对话支持**：解析多轮 Prompt 模板，支持分阶段 AI 分析

### 5.2 一图总结（ImageSummaryService）

```
generateForItem(item)
  ├── 阶段1: extracting (10%) — PDFExtractor 提取，支持已有笔记复用
  ├── 阶段2: summarizing (40%) — LLM 生成视觉摘要文本
  ├── 阶段3: generating (70%) — Gemini/Imagen 生成学术概念海报图片
  ├── 阶段4: saving (90%) — ImageNoteGenerator 创建含图片的笔记
  └── 阶段5: completed (100%)
```

关键设计：
- **4 阶段工作流**：每阶段有明确的 stage / message / progress 回调
- **PDF 文件大小保护**：`enablePdfSizeLimit` preference 控制是否检查
- **已有笔记复用**：`useExistingNote` preference 避免重复提取

### 5.3 思维导图（MindmapService）

```
generateForItem(item)
  ├── 阶段1: extracting (10%) — PDFExtractor 提取
  ├── 阶段2: generating (40%) — LLM 生成结构化 Markdown 列表
  ├── 阶段3: saving (80%) — 创建笔记，内容用 ```markmap 代码块包裹
  └── 阶段4: completed (100%)
```

关键设计：
- **markmap 集成**：LLM 输出 Markdown 结构化列表，用 ` ```markmap ` 代码块包裹，Zotero 笔记中通过 markmap 渲染
- **3 阶段工作流**：比一图总结简单，不需要外部图片生成

### 5.4 文献综述（LiteratureReviewService）

```
generateReview(collection, pdfAttachments, reviewName, prompt)
  ├── 阶段1: 创建报告条目
  ├── 阶段2: 添加 PDF 附件到报告
  ├── 阶段3: 逐篇填表（并行，concurrency 可配，复用已有表格）
  ├── 阶段4: 汇总所有表格 → LLM 生成综述
  └── 阶段5: 创建综述笔记，关联到报告条目
```

关键设计：
- **两阶段管线**：先填表后综述，填表阶段可复用已有 `AI-Table` 标签的笔记
- **并行填表**：`tableFillConcurrency` preference 控制并发数，默认 3
- **表格标记**：使用 `AI-Table` 标签标识文献填表笔记

## 6. 菜单与 UI 集成

### 6.1 菜单系统（8+ 入口）

hooks.ts 中注册了 8+ 个上下文菜单项：

| 菜单项 | 作用域 | 功能 |
|---|---|---|
| generateSummary | item | 单条目/多条目 AI 总结 |
| multiRoundReanalyze | item | 多轮重分析 |
| dashboard | item/collection | 打开统一 Dashboard |
| chatWithAI | item | 与 AI 聊天 |
| imageSummary | item | 一图总结 |
| mindmap | item | 思维导图 |
| literatureReview | collection | 文献综述 |
| fillTable | item | 表格填充 |

### 6.2 MainWindow 单例

```typescript
class MainWindow {
  private static _instance: MainWindow | null = null;
  private dialog: any;                    // ztoolkit.Dialog 实例
  private activeTab: TabType = "dashboard";
  private views: Map<TabType, BaseView> = new Map();

  static getInstance(): MainWindow;
  async open(tab?: TabType): Promise<void>;  // 打开对话框，导航到指定标签页
  close(): void;
}
```

6 个标签页：`dashboard` / `summary` / `tasks` / `settings` / `scanner` / `literature-review`

### 6.3 Item Pane Section

条目面板侧边栏：
- AI 笔记预览（summary / imageSummary / mindmap / table）
- 一图总结展示
- 快速对话（含 KaTeX 公式渲染、内联/块级公式自动切换）
- 自动刷新（Notifier 监听 + 延迟防抖）

### 6.4 Reader 工具栏

```typescript
// hooks.ts: Reader toolbar button
// 检测 parent item（附件 vs 父条目）
const parentItem = item.isAttachment() ? item.parentItem : item;
```

## 7. 可借鉴点

### 7.1 高价值可复用模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **Provider Registry + Facade** | 需要支持多 Provider/多后端，但调用方只需一个入口 | 低——Map + 接口 |
| **API Key 轮换 + 冷却** | 多 Key 场景下的自动重试和负载均衡 | 中——运行时状态 + preference 持久化 |
| **TaskQueueManager 流式事件** | 批量任务需要实时进度反馈 | 中——优先级调度 + 流式回调 |
| **Note 策略管理（skip/overwrite/append）** | 批量生成内容时的冲突处理 | 低——preference + 条件分支 |
| **多模态管线分阶段回调** | 复杂管线需要每阶段汇报进度 | 低——stage/message/progress 三元组 |
| **文献综述两阶段管线（填表→汇总）** | 需要先结构化再总结的场景 | 中——并行填表 + 已有笔记复用 |
| **markmap 代码块包裹** | 思维导图渲染到 Zotero 笔记 | 低——LLM 输出 Markdown + 代码块标记 |
| **Item Pane Section 快速对话** | 条目级即时交互 | 中——KaTeX + 自动刷新 + Notifier |
| **成功/失败双路径 Key 轮换** | API 调用需要区分成功/失败的负载均衡 | 低——advanceToNextKey vs rotateToNextKey |
| **单 Key 用户透明降级** | 多 Key 特性不破坏单 Key 用户 | 低——length <= 1 检查 |
| **MainWindow 多标签页单例** | 需要统一入口管理多个子视图 | 低——Map 存储视图实例 + 标签页切换 |

### 7.2 与当前模板的结合点

- 如果模板需要**多 Provider LLM 调用**，可复用 Provider Registry + LLMClient Facade 模式
- 如果需要**API Key 多账户管理**，可复用 ApiKeyManager 的等权重轮换 + 冷却机制
- 如果需要**批量异步任务处理**，可复用 TaskQueueManager 的优先级调度 + 流式事件
- 如果需要**多模态 AI 管线**（如总结、翻译、高亮），可复用分阶段回调的工作流模式
- 如果需要**统一 Dashboard 界面**，可复用 MainWindow 单例 + 多标签页架构
- 如果需要**条目级快速交互**，可复用 ItemPaneSection 的侧边栏 + 自动刷新模式
- 如果需要**笔记冲突处理**，可复用 skip/overwrite/append 策略模式

### 7.3 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 硬编码的 6 个 Provider 配置映射 | 应设计为可扩展的注册表，不是硬编码映射 |
| `declare const ztoolkit: any` 风格 | 应使用更好的类型声明 |
| 大量 preference key 内联硬编码 | 应集中管理 preference schema |
| `any` 类型使用较多（dialog、event 等） | 违反 TypeScript 最佳实践 |
| 固定的 60 秒任务执行间隔 | 应由任务类型和复杂度决定 |
| 复杂的 ItemPaneSection 状态管理 | `currentChatState` 是模块级可变状态，并发安全性存疑 |
| Prompt 模板硬编码在 `utils/prompts.ts` | 应由可配置模板系统管理 |
| `import katex from "katex"` 直接导入 | 在 Zotero Background 进程可能有 DOM 环境问题（代码中已有注释说明） |
| 混合的中英文注释和 UI 文本 | 应统一 i18n 系统 |
| `MainWindow.initAttempts = 60` 重试魔法数 | 应改为事件驱动的初始化完成信号 |

## 8. 与同类插件的架构对比

| 维度 | zotero-AI-Butler | zotero-ainote | zotero-format-metadata |
|---|---|---|---|
| **核心模式** | 多 Provider + Key 轮换 + 多模态管线 | 批量 LLM 调用 + 笔记生成 | 规则引擎 + 批量校验 |
| **扩展方式** | Provider Registry + 功能 Service 模块化 | 单一管线，不易扩展 | defineRule 工厂 + 注册表 |
| **并发模型** | TaskQueueManager（可配并发 + 定时批次） | 串行逐条处理 | ConcurrentCaller（用户可调） |
| **错误处理** | 重试 + Key 轮换 + 失败冷却 | 进度回调 + OutputWindow | 逐规则超时 + 隔离 + Reporter |
| **API 管理** | 多 Key 轮换 + 禁用 + 冷却 | 全局 API Key/URL | 无 |
| **用户配置** | 每 Provider 独立 Key + 全局重试/冷却 | 全局 API Key/URL | 每规则独立 preference 开关 |
| **输出方式** | 创建笔记 + Dashboard + Item Pane | 创建笔记附件 | 就地修改 + Reporter |

**关键区别：** AI-Butler 是"多 Provider + 多模态 + 统一 Dashboard"模式，ainote 是"批量处理 + 附件输出"模式，format-metadata 是"规则引擎 + 就地修正"模式。三者的 API 管理差异最大——AI-Butler 是唯一一个提供完整 Key 轮换系统的。

## 9. 相关参考

- [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) — 通用技术链
- [REFERENCE_AINOTE_PATTERNS.md](./REFERENCE_AINOTE_PATTERNS.md) — 批量 AI 笔记处理对比
- [REFERENCE_AIASSISTANT_PATTERNS.md](./REFERENCE_AIASSISTANT_PATTERNS.md) — 轻量 AI 对话对比
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) — Notifier / MenuManager 接口
