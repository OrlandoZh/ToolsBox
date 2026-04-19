# REFERENCE_ZOTSEEK_PATTERNS.md

> 参考来源：`reference/plugin/ZotSeek-main/`（ZotSeek | AI-Powered Semantic Search）
> 用途：本地语义搜索 + Transformers.js ChromeWorker + nomic-embed embedding 管线 + SQLite vector store + RRF 混合搜索 + Plugin API 模式沉淀
> 最后更新：2026-04-19

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：ZotSeek 源码](../reference/plugin/ZotSeek-main/)
- [ZotSeek README](../reference/plugin/ZotSeek-main/README.md)
- [ZotSeek API 文档](../reference/plugin/ZotSeek-main/docs/API.md)

## 1. 核心架构概览

ZotSeek 是一个 **100% 本地运行的语义搜索插件**，核心能力是：无 API Key、无云端依赖，使用 Transformers.js 在 ChromeWorker 中运行 nomic-embed-text-v1.5 模型生成 768 维度 embedding，存储到独立 SQLite 文件，支持语义 + 关键词混合搜索 (RRF fusion)，并提供 Plugin API 供其他插件调用。

```
ZotSeek 架构层：
├── bootstrap.js                   生命周期、ChromeWorker 资源路径
├── src/index.ts                   ZotSeekPlugin 主类：Notifier 注册、菜单、Preference Pane、Plugin API
├── src/core/
│   ├── vector-store-sqlite.ts     SQLite Vector Store：ATTACH DATABASE、Float32Array 缓存、checkpoint save
│   ├── embedding-pipeline.ts      Embedding Pipeline：ChromeWorker 创建、job queue、postMessage 协议
│   ├── search-engine.ts           SearchEngine：cosine similarity、MaxSim aggregation
│   ├── hybrid-search.ts           HybridSearchEngine：RRF fusion、query analysis、auto weight adjust
│   ├── text-extractor.ts          TextExtractor：abstract/full 双模式、PDF 分页提取
│   └── auto-index-manager.ts      AutoIndexManager：Notifier 监听、batch delay、PDF retry
├── src/worker/
│   └── embedding-worker.ts        ChromeWorker：Transformers.js v3、nomic-embed、WebGPU/WASM fallback
├── src/utils/
│   ├── chunker.ts                 Chunker：semantic section-based chunking、References 过滤、passage location
│   ├── stable-progress.ts         StableProgressWindow：zotero-plugin-toolkit、pause/cancel/ETA
│   └── zotero-api.ts              ZoteroAPI：Fulltext 索引复用、PDF page extraction
├── src/ui/
│   ├── search-dialog-vtable.ts    Search Dialog：multi-query (AND/OR)、virtualized table、result context menu
│   ├── toolbar-button.ts          Toolbar Button：XUL overlay
│   └── preferences.ts             Preference Pane：stats refresh、compact database
├── content/
│   ├── models/                    Bundled ONNX model files (nomic-embed-text-v1.5, ~131MB)
│   ├── wasm/                      ONNX Runtime WASM files
│   ├── searchDialog.xhtml         Search dialog XUL
│   └── preferences.xhtml          Preference pane XUL
```

核心模块：

| 模块 | 职责 | 文件 |
|---|---|---|
| **VectorStoreSQLite** | SQLite-based embedding storage (ATTACH DATABASE)、Float32Array 内存缓存、checkpoint save | `src/core/vector-store-sqlite.ts` |
| **EmbeddingPipeline** | ChromeWorker 创建、job queue、postMessage 协议、超时处理 | `src/core/embedding-pipeline.ts` |
| **SearchEngine** | Cosine similarity、MaxSim aggregation、passage-level location | `src/core/search-engine.ts` |
| **HybridSearchEngine** | RRF fusion、semantic + keyword 搜索、query analysis | `src/core/hybrid-search.ts` |
| **EmbeddingWorker** | Transformers.js v3、nomic-embed-text-v1.5、WebGPU/WASM fallback | `src/worker/embedding-worker.ts` |
| **Chunker** | Semantic section-based chunking、References 过滤、passage location metadata | `src/utils/chunker.ts` |
| **AutoIndexManager** | Zotero Notifier 监听、batch delay、PDF attachment retry | `src/core/auto-index-manager.ts` |
| **Plugin API** | `Zotero.ZotSeek.api.search/findSimilar/indexItems` 公开接口 | `src/index.ts` |

## 2. 本地 AI 管线：ChromeWorker + Transformers.js

### 2.1 为什么需要 ChromeWorker

Transformers.js 无法直接在 Zotero 主线程运行：
- 缺少浏览器全局对象 (`self`, `navigator`, `indexedDB`)
- Cache API 在 Zotero 中会 crash
- 模型推理会阻塞 UI

**解决方案**：运行在独立 ChromeWorker 线程，使用 `chrome://` URI 访问 bundled 资源。

### 2.2 Worker 初始化协议

```typescript
// src/worker/embedding-worker.ts

// 1. 设置 Transformers.js 需要的全局对象
(globalThis as any).self = globalThis;
(globalThis as any).window = globalThis;
(globalThis as any).navigator = {
  userAgent: 'Zotero ChromeWorker',
  hardwareConcurrency: 4,
};

// 2. 关键：配置 wasmPaths BEFORE pipeline 初始化
env.backends.onnx.wasm.wasmPaths = 'chrome://zotseek/content/wasm/';

// 3. 禁用远程模型，只使用 bundled
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = 'chrome://zotseek/content/models/';
env.useBrowserCache = false;

// 4. 多线程加速 (SharedArrayBuffer 在 privileged context 可用)
env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;
```

### 2.3 WebGPU / WASM 自动切换

```typescript
// 检测 WebGPU 可用性
const hasWebGPU = 'gpu' in navigator;

async function checkWebGPUAvailability(): Promise<boolean> {
  const adapter = await navigator.gpu.requestAdapter();
  return adapter !== null;
}

// 初始化时先尝试 WebGPU，失败则回退 WASM
useWebGPU = await checkWebGPUAvailability();
const deviceType = useWebGPU ? 'webgpu' : 'wasm';

// WebGPU 可用时 10-20x 加速
```

**当前状态 (Firefox 140/Zotero 8)**：
- Windows: WebGPU 已启用
- macOS/Linux: WebGPU 仍在开发中
- 自动回退 WASM (CPU)，无需用户干预

### 2.4 nomic-embed-text-v1.5 配置

```typescript
// src/core/embedding-pipeline.ts
export const EMBEDDING_CONFIG = {
  dimensions: 768,                    // nomic-embed 输出维度
  transformersModelId: 'Xenova/nomic-embed-text-v1.5',
  maxTokens: 8192,                    // 8K context window
};

// src/worker/embedding-worker.ts
const MODEL_ID = 'Xenova/nomic-embed-text-v1.5';
const MODEL_OPTIONS = {
  quantized: true,                    // ~130MB (quantized ONNX)
  local_files_only: true,             // 只用 bundled 文件
};

// Instruction prefixes (提升检索质量)
const PREFIX_DOCUMENT = 'search_document: ';
const PREFIX_QUERY = 'search_query: ';
```

**为什么选 nomic-embed-text-v1.5**：
- MTEB benchmark 超越 OpenAI text-embedding-3-small
- 8K context window (vs 512 token 模型的 10-20 chunks)
- Matryoshka embedding (可 truncate 到 256/128 维度)
- Instruction-aware prefixes
- 完全开源 (weights + training data)

### 2.5 Embedding Pipeline 主线程接口

```typescript
// src/core/embedding-pipeline.ts
export class EmbeddingPipeline {
  private worker: any = null;
  private pendingJobs = new Map<string, { resolve: Function; reject: Function }>();

  async init(): Promise<void> {
    const workerPath = 'chrome://zotseek/content/scripts/embedding-worker.js';
    this.worker = new ChromeWorker(workerPath);

    this.worker.onmessage = (event) => {
      const { type, jobId, embedding, error } = event.data;
      if (type === 'embedding' && jobId) {
        const job = this.pendingJobs.get(jobId);
        job.resolve({ embedding, modelId, processingTimeMs });
      }
    };
  }

  async embed(text: string, isQuery: boolean = false): Promise<EmbeddingResult> {
    const jobId = generateUUID();
    return new Promise((resolve, reject) => {
      this.pendingJobs.set(jobId, { resolve, reject });
      this.worker.postMessage({
        type: 'embed',
        jobId,
        text: isQuery ? PREFIX_QUERY + text : PREFIX_DOCUMENT + text,
      });
    });
  }
}
```

## 3. SQLite Vector Store

### 3.1 ATTACH DATABASE 模式

```typescript
// src/core/vector-store-sqlite.ts

const DB_NAME = 'zotseek';           // Schema name when attached
const DB_FILE = 'zotseek.sqlite';    // 数据库文件名
const SCHEMA_VERSION = 6;            // Normalized: items + chunks tables

// 数据库位置：<Zotero Data Directory>/zotseek.sqlite
private getDbPath(): string {
  return PathUtils.join(Zotero.DataDirectory.dir, DB_FILE);
}

// ATTACH 到 Zotero 主连接
async attachDatabase(): Promise<void> {
  const dbPath = this.getDbPath();
  await Zotero.DB.queryAsync(`ATTACH '${dbPath}' AS ${DB_NAME}`);
}
```

**优势** (借鉴 Better BibTeX)：
- O(1) indexed lookups
- Float32Array 内存缓存 (首次搜索后加载)
- Atomic updates
- Clean uninstall (删除文件即可)

### 3.2 Schema 设计

```sql
-- items 表：每篇文献一条记录
CREATE TABLE zotseek.items (
  item_id INTEGER PRIMARY KEY,
  item_key TEXT NOT NULL,
  library_id INTEGER NOT NULL,
  title TEXT,
  indexed_at TEXT,
  content_hash TEXT
);

-- chunks 表：每个 chunk 一条记录
CREATE TABLE zotseek.chunks (
  chunk_id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  text_source TEXT NOT NULL,           -- 'summary' | 'methods' | 'findings' | 'content'
  embedding BLOB NOT NULL,             -- Float32Array serialized
  page_number INTEGER,                 -- 1-based page
  paragraph_index INTEGER,             -- 0-based paragraph
  FOREIGN KEY (item_id) REFERENCES items(item_id)
);

CREATE INDEX idx_chunks_item ON chunks(item_id);
CREATE INDEX idx_chunks_source ON chunks(text_source);
```

### 3.3 内存缓存策略

```typescript
// 首次搜索后缓存所有 embedding (pre-normalized Float32Array)
private cache: {
  data: Array<{
    itemId: number;
    chunkIndex: number;
    embedding: Float32Array;    // 已 normalize，直接 dot product
    pageNumber?: number;
    paragraphIndex?: number;
  }>;
  validAt: number;
} | null = null;

// 缓存加载
async loadCache(): Promise<void> {
  const rows = await Zotero.DB.columnQueryAsync(
    `SELECT embedding FROM ${DB_NAME}.chunks`
  );
  this.cache.data = rows.map(r => ({
    embedding: new Float32Array(r),  // 直接反序列化
    // ... 其他字段
  }));
}
```

**性能数据**：
- 首次搜索：~130ms (加载缓存)
- 后续搜索：~70ms (使用缓存)
- 内存占用：+75MB / 1000 papers

### 3.4 Crash-Resilient Indexing

```typescript
// 每 25 条 checkpoint save
const CHECKPOINT_INTERVAL = 25;

async indexItems(items: ZoteroItem[], progress: ProgressCallback) {
  for (let i = 0; i < items.length; i++) {
    // ... process item

    if ((i + 1) % CHECKPOINT_INTERVAL === 0) {
      await this.saveCheckpoint(i + 1);
      progress.update({ current: i + 1, saved: true });
    }
  }
}

// 恢复时跳过已索引
async resumeIndexing(): Promise<void> {
  const indexedIds = await this.getIndexedIds();
  const remaining = allItems.filter(id => !indexedIds.has(id));
  // ... continue from remaining
}
```

## 4. Semantic Chunking 策略

### 4.1 按 Semantic Purpose 分块

```typescript
// src/utils/chunker.ts

// 两种索引模式
export type IndexingMode = 'abstract' | 'full';

// Section patterns (语义边界)
const SECTION_PATTERNS = {
  methods: /\n(?=(?:Introduction|Background|Methods|Methodology|Experimental Setup)\b)/i,
  findings: /\n(?=(?:Results|Findings|Discussion|Conclusions|Summary)\b)/i,
};

export interface Chunk {
  index: number;
  text: string;
  type: 'summary' | 'methods' | 'findings' | 'content';

  // Passage-level location
  pageNumber?: number;        // 1-based
  paragraphIndex?: number;    // 0-based
  startChar?: number;
  endChar?: number;
}
```

**哲学**：8K context window 下，按语义分块比按 token limit 分块质量更高。

### 4.2 References 过滤

```typescript
// 自动检测并排除 bibliography sections
const REFERENCE_PATTERNS = [
  'References', 'Bibliography', 'Works Cited', 'Literature Cited'
];

// 检测引用格式
const CITATION_PATTERNS = [
  /\[\d+\]/,                              // [1]
  /\w+,\s*\w+\.\s*\(\d{4}\)/,             // Smith, J. (2021)
  /DOI:\s*10\./,                          // DOI links
];

// 检测到 references 后停止索引
function detectReferencesSection(text: string): boolean {
  return REFERENCE_PATTERNS.some(p => text.includes(p));
}
```

### 4.3 Chunk Size Trade-offs

| Chunk Size | 速度 | 搜索行为 |
|------------|------|----------|
| 500-800 tokens | ~0.5s/chunk | 高精度，定位具体段落 |
| 2000 tokens (default) | ~3s/chunk | 平衡，context window 更好利用 |
| 4000+ tokens | 慢 | 高召回，发现 broad topics |

## 5. Hybrid Search (RRF Fusion)

### 5.1 为什么需要混合搜索

纯语义搜索的局限：
- 作者名：`"Smith 2023"` → keyword 搜索更准确
- 缩写：`"RLHF"` → keyword 匹配精确术语
- 技术符号：`"p < 0.05"` → keyword 捕获精确 notation

### 5.2 Reciprocal Rank Fusion (RRF)

```typescript
// src/core/hybrid-search.ts

export interface HybridSearchResult {
  semanticScore: number | null;    // Cosine similarity (0-1)
  keywordScore: number | null;     // Normalized keyword relevance
  rrfScore: number;                // RRF combined score

  source: 'both' | 'semantic' | 'keyword';
  semanticRank: number | null;
  keywordRank: number | null;
}

// RRF 公式
function rrf(semanticRank: number, keywordRank: number, k: number = 60): number {
  return 1/(k + semanticRank) + 1/(k + keywordRank);
}
```

### 5.3 Query Analysis (自动权重调整)

```typescript
// 分析查询类型，自动调整权重
export interface QueryAnalysis {
  semanticWeight: number;
  reasoning: string;
  detectedPatterns: string[];
}

function analyzeQuery(query: string): QueryAnalysis {
  // 检测作者/年份格式 → 增加 keyword 权重
  if (/^\w+\s*\d{4}$/.test(query)) {
    return { semanticWeight: 0.2, reasoning: 'Author-year format' };
  }

  // 检测自然语言 → 增加 semantic 权重
  if (query.split(' ').length > 3) {
    return { semanticWeight: 0.7, reasoning: 'Natural language query' };
  }

  return { semanticWeight: 0.5, reasoning: 'Default balanced' };
}
```

### 5.4 Search Modes

| Mode | 最适合 | 工作方式 |
|------|--------|----------|
| **Hybrid** (default) | 大多数搜索 | semantic + keyword RRF fusion |
| **Semantic Only** | 概念查询 | 按语义相似度排序 |
| **Keyword Only** | 作者/年份 | Zotero built-in search |

## 6. Multi-Query Search (AND/OR)

### 6.1 多查询组合

```typescript
// 支持 AND/OR 组合最多 4 个查询
export interface MultiQueryOptions {
  queries: string[];
  operator: 'AND' | 'OR';
  andFormula: 'minimum' | 'product' | 'average';
}

// AND 公式
function combineAnd(scores: number[], formula: string): number {
  switch (formula) {
    case 'minimum': return Math.min(...scores);      // 严格交集
    case 'product': return geometricMean(scores);    // 平衡相关性
    case 'average': return arithmeticMean(scores);   // 更宽松
  }
}
```

### 6.2 用例示例

```
查询 1: "machine learning"
查询 2: "healthcare"
查询 3: "ethics"
Operator: AND
Formula: product
→ 找到医疗 AI 伦理相关论文
```

## 7. Auto-Index Manager

### 7.1 Notifier 监听

```typescript
// src/core/auto-index-manager.ts

export class AutoIndexManager {
  private notifierID: string | null = null;
  private pendingItems: Set<number> = new Set();
  private batchTimer: any = null;

  public start(): void {
    this.notifierID = Zotero.Notifier.registerObserver({
      notify: async (event, type, ids, extraData) => {
        if (event === 'add' && type === 'item') {
          this.queueItems(ids);
        }
      },
    }, ['item']);
  }
}
```

### 7.2 Batch Delay (防止 bulk import 过载)

```typescript
// 批量导入时延迟处理
private batchDelay: number = 10000;  // 10 seconds (可配置)

private queueItems(ids: number[]): void {
  ids.forEach(id => this.pendingItems.add(id));

  // 每次新增重置 timer，防止导入期频繁触发
  clearTimeout(this.batchTimer);
  this.batchTimer = setTimeout(() => {
    this.processBatch();
  }, this.batchDelay);
}
```

### 7.3 PDF Attachment Retry

```typescript
// PDF 可能未就绪，指数退避重试
private waitingForPDF: Map<number, { attempts: number; timer: any }> = new Map();

private async waitForPDF(itemId: number, attempts: number = 0): Promise<void> {
  const item = await Zotero.Items.getAsync(itemId);
  const attachment = await item.getBestAttachment();

  if (!attachment && attempts < 5) {
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
    this.waitingForPDF.set(itemId, {
      attempts: attempts + 1,
      timer: setTimeout(() => this.waitForPDF(itemId, attempts + 1), delay)
    });
  }
}
```

## 8. Plugin API

### 8.1 公开接口

```typescript
// Zotero.ZotSeek.api 公开接口
declare namespace Zotero.ZotSeek.api {
  // 检查就绪状态
  function isReady(): boolean;

  // 语义搜索
  function search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  // 查找相似文献
  function findSimilar(itemId: number, options?: SearchOptions): Promise<SearchResult[]>;

  // 索引文献
  function indexItems(items: ZoteroItem[]): Promise<void>;

  // 获取统计
  function getStats(): Promise<VectorStoreStats>;
}
```

### 8.2 SearchResult 结构

```typescript
interface SearchResult {
  itemId: number;          // Zotero internal ID
  itemKey: string;         // Portable key (syncs across libraries)
  title: string;
  similarity: number;      // 0-1 cosine similarity

  textSource: string;      // 'summary' | 'methods' | 'findings' | 'content'

  // Passage-level location
  pageNumber?: number;     // 1-based page
  paragraphIndex?: number; // 0-based paragraph

  matchedChunkIndex?: number;
  authors?: string[];
  year?: number;
}
```

### 8.3 其他插件调用示例

```javascript
// 检查 ZotSeek 是否安装
if (!Zotero.ZotSeek?.api) {
  throw new Error("ZotSeek plugin is not installed");
}

// 执行语义搜索
const results = await Zotero.ZotSeek.api.search("transformer attention mechanisms", {
  topK: 20,
  minSimilarity: 0.3,
});

// 找相似文献
const similar = await Zotero.ZotSeek.api.findSimilar(item.id, { topK: 10 });

// 查找结果可定位到具体 page/paragraph
for (const r of results) {
  console.log(`${r.title} (similarity: ${r.similarity}, page: ${r.pageNumber})`);
}
```

## 9. Preference Pane 实现

### 9.1 PreferencePanes.register

```typescript
// src/index.ts

private registerPreferencePane(): void {
  Zotero.PreferencePanes.register({
    pluginID: this.info?.id || 'zotseek@zotero.org',
    src: `${this.info?.rootURI}content/preferences.xhtml`,
    label: getString('pref-title'),
    image: `${this.info?.rootURI}content/icons/favicon.png`,
  });
}
```

### 9.2 Preference Defaults

```typescript
const defaults = {
  'zotseek.minSimilarityPercent': 30,   // 30% = 0.3
  'zotseek.topK': 20,
  'zotseek.autoIndex': false,
  'zotseek.autoIndexDelay': 10,         // seconds
  'zotseek.indexingMode': 'full',       // 'abstract' or 'full'
  'zotseek.maxTokens': 2000,
  'zotseek.maxChunksPerPaper': 100,
  'zotseek.excludeBooks': true,
  'zotseek.excludeTag': 'zotseek-exclude',
  'zotseek.hybridSearch.enabled': true,
  'zotseek.hybridSearch.mode': 'hybrid',
  'zotseek.hybridSearch.semanticWeightPercent': 50,
  'zotseek.hybridSearch.rrfK': 60,
};
```

### 9.3 Stats Refresh

```typescript
// Preference pane 内实时刷新统计
public async refreshStats(): Promise<void> {
  const stats = await this.getStats();

  // 更新 UI 元素
  setText('zotseek-stat-papers', stats.indexedPapers.toLocaleString());
  setText('zotseek-stat-chunks', stats.totalChunks.toLocaleString());
  setText('zotseek-stat-storage', stats.storageSize);
  setText('zotseek-stat-model', stats.modelId);
  setText('zotseek-stat-lastindexed', stats.lastIndexed);
}
```

## 10. Stable Progress Window

### 10.1 使用 zotero-plugin-toolkit

```typescript
// src/utils/stable-progress.ts

import { ProgressWindowHelper } from 'zotero-plugin-toolkit';

export class StableProgressWindow {
  private helper: ProgressWindowHelper;

  constructor(options: { title: string }) {
    this.helper = new ProgressWindowHelper(options.title);
  }

  updateProgress(text: string, progress: number | null): void {
    this.helper.changeLine({
      text,
      progress: progress ?? -1,  // -1 = indefinite
    });
  }

  // 支持 pause/resume/cancel
  addPauseResumeButton(onPause: Function, onResume: Function): void {
    this.helper.addPauseResumeButton(onPause, onResume);
  }
}
```

### 10.2 功能

| 功能 | 说明 |
|------|------|
| Progress bar | 百分比 + ETA countdown |
| Pause/Resume | 在 batch boundary 暂停，所有进度保存 |
| Cancel | 静默通知，无 error alert |
| Checkpoint | 每 25 条自动保存 |

## 11. 与其他方案对比

| 方案 | Provider | 本地/云端 | Embedding 模型 | 优势 | 适用场景 |
|------|----------|----------|----------------|------|----------|
| **ZotSeek** | 无 (bundled) | 100% 本地 | nomic-embed-text-v1.5 (768 dims) | 无 API Key、离线可用、隐私保护 | 个人库、隐私敏感场景 |
| **Paper Chat RAG** | 多云端 Provider | 云端 | Provider API | 管线完整、Fallback 机制 | 需要云端 AI 能力 |
| **Smart Highlighter** | LLM + Non-LLM 双后端 | 混合 | Sidecar Neural Reranker | 双后端 fallback、密度控制 | PDF 高亮标注 |
| **Zotero MCP Plugin** | 外部 MCP Server | 本地服务 | semantic search server | MCP 协议、外部工具集成 | MCP workflow 集成 |

## 12. Clean-Room 可借鉴点

| 技术点 | 可借鉴程度 | 说明 |
|--------|------------|------|
| ChromeWorker + Transformers.js | ✅ 高 | 本地 AI 管线标准模式，无需 API Key |
| ATTACH DATABASE SQLite | ✅ 高 | 独立数据库、clean uninstall 模式 |
| RRF Hybrid Search | ✅ 高 | Semantic + Keyword fusion 通用算法 |
| Semantic Chunking | ✅ 高 | 按 section 分块，References 过滤 |
| Plugin API 设计 | ✅ 高 | 公开 search/findSimilar 接口模式 |
| Auto-Index Notifier | ✅ 高 | Zotero Notifier + batch delay 模式 |
| Stable Progress Window | ✅ 高 | Pause/resume/cancel + checkpoint |
| Multi-Query AND/OR | ⚠️ 中 | 有用但非必需，按需求引入 |
| WebGPU Detection | ⚠️ 中 | 平台限制，当前仅 Windows 可用 |
| Passage-level Location | ⚠️ 中 | 需要 Full Document 模式支持 |

---

## 相关参考

- [REFERENCE_SMART_HIGHLIGHTER_PATTERNS.md](./REFERENCE_SMART_HIGHLIGHTER_PATTERNS.md) — Neural Reranker Sidecar 对比
- [REFERENCE_PAPER_CHAT_PATTERNS.md](./REFERENCE_PAPER_CHAT_PATTERNS.md) — 云端 RAG 管线对比
- [REFERENCE_ZOTERO_MCP_PATTERNS.md](./REFERENCE_ZOTERO_MCP_PATTERNS.md) — MCP semantic search 对比
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) — Zotero Notifier API
