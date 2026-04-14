# REFERENCE_SMART_HIGHLIGHTER_PATTERNS.md

> 参考来源：`reference/plugin/zotero-smart-highlighter-master/`（zotero-smart-highlighter）
> 用途：LLM + 非 LLM 双后端 PDF 智能高亮 + Neural Reranker Sidecar 进程管理 + 语义分类着色模式沉淀
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：zotero-smart-highlighter 源码](../reference/plugin/zotero-smart-highlighter-master/)

## 1. 核心架构概览

zotero-smart-highlighter 是一个 PDF 语义高亮插件，核心能力是：选中 PDF 文本或全局全文 → LLM/非LLM 双后端提取值得重读的短片段 → 按语义分类（claim/result/method/caveat/background）着色标注。

```
Zotero 插件层：
├── bootstrap.ts                  生命周期、Reader 事件注册、Preference Pane
├── index.ts                      入口 re-export
├── plugin-runtime.ts             全局 plugin version / rootURI 存取
├── preferences.ts                Preference 系统：canonical/legacy 双分支、迁移、默认值
├── llm.ts                        LLM 调用：chatCompletion、robust JSON 提取、重试
├── neural-reranker.ts            NeuralReranker 类：本地 rerank 请求
├── neural-model-installer.ts     模型安装（未详细读取）
├── sidecar-binary.ts             SidecarManager：二进制提取 → SHA-256 → 启动 → 健康轮询 → 空闲关闭
├── reading-highlights.ts         高亮选择管线：heuristic + lexical + neural 三信号评分
└── rect-splitter.ts              字符范围 → PDF 子矩形计算（多行 proportional interpolation）
```

核心模块：

| 模块 | 职责 | 文件 |
|---|---|---|
| **SidecarManager** | 本地 Neural Reranker 二进制进程全生命周期管理 | `src/sidecar-binary.ts` |
| **NeuralReranker** | 向 sidecar 发送 rerank 请求、score normalization | `src/neural-reranker.ts` |
| **LLM (chatCompletion)** | OpenRouter 兼容 API 调用 + robust JSON 提取 + 指数退避重试 | `src/llm.ts` |
| **Reading Highlights** | 三信号评分管线（heuristic + lexical + neural）+ 密度/聚焦配置 | `src/reading-highlights.ts` |
| **Rect Splitter** | 字符范围映射到 PDF 多行子矩形 | `src/rect-splitter.ts` |
| **Preferences** | 双分支 pref 系统（canonical / legacy）、迁移保护、system prompt override | `src/preferences.ts` |

## 2. 双后端架构（LLM / Non-LLM）

### 2.1 Backend Policy 检测

```typescript
function getHighlightBackendPolicy(): HighlightBackendPolicy {
  const mode = getCanonicalPref('backendMode');
  const apiKeyConfigured = getNonEmptyPreferenceValue(getCanonicalPref('apiKey')) !== null;
  if (mode === 'non-llm-only') return { mode, initialBackend: 'non-llm', allowFallbackToNonLlm: false };
  if (!apiKeyConfigured) return { mode, initialBackend: 'non-llm', allowFallbackToNonLlm: false };
  return { mode, initialBackend: 'llm', allowFallbackToNonLlm: true };
}
```

三种策略：

| 策略 | 初始后端 | 允许回退 | 触发条件 |
|---|---|---|---|
| `non-llm-only` | non-LLM | 否 | 用户显式选择 |
| `missing-api-key` | non-LLM | 否 | 未配置 API Key |
| `llm-preferred` / `auto-with-api-key` | LLM | 是 | 已配置 Key |

### 2.2 非 LLM 三信号评分管线

```
extractSelectionHighlightsNonLlm()
  ├── splitSentenceLikeRanges()           → 句子级候选切分
  ├── isReadableHighlight()               → 可读性过滤（长度、字数）
  ├── scoreCandidate()                    → heuristic scoring（正面/负面模式匹配）
  ├── buildSelectionPseudoQuery()         → 伪查询构建（标题 + 上下文）
  ├── scoreLexicalDocuments()             → BM25/TF-IDF 词法评分
  ├── neuralRerankFn()                    → 可选 Neural Reranker 评分
  ├── finalScore 加权融合                   → heuristic * 0.72 + lexical * 0.28（无 neural）
  │                                        → heuristic * 0.40 + lexical * 0.10 + neural * 0.50（有 neural）
  ├── threshold >= 0.22                   → 阈值过滤
  └── validateHighlightSpans()            → 去重、trim、范围修复
```

全局高亮类似，但增加了：
- `buildShortlist()`：按页分散、去重、取 top-N shortlist
- `reasonSectionAlignmentBonus()`：reason 与 section 类型对齐奖励
- `finalizeGlobalHighlightSelection()`：分页 caps、分 section caps、dedup

## 3. Sidecar 二进制进程生命周期

### 3.1 完整流水线

```
ensureExtractedSidecarBinary()
  ├── 读取插件 data dir 中 bin/darwin-arm64/zph-reranker
  ├── computeSha256Hex()                  → SHA-256 校验
  ├── replacePathAtomically()             → 原子替换（先备份再移动）
  └── chmod +x                            → 赋予执行权限

SidecarManager.start()
  ├── ensureExtractedSidecarBinary()      → 提取 + 校验
  ├── generateAuthToken()                 → 32-byte 随机 token
  ├── Subprocess.call({ command, arguments: ['--auth-token', ..., '--port', '23516'] })
  ├── waitForHealthySidecar()             → 健康轮询（500ms 间隔，超时保护）
  └── refreshSidecarInfoFromDisk()        → 读取 sidecar 信息

SidecarManager.stop()
  ├── POST /shutdown                      → 优雅关闭
  ├── 等待进程退出
  └── 清理状态（authToken, proc）

Idle Shutdown
  └── 5 分钟无请求后自动关闭
```

### 3.2 原子替换保护

```typescript
async function replacePathAtomically(sourcePath: string, destinationPath: string): Promise<void> {
  const backupPath = `${destinationPath}.backup-${createUniqueSuffix()}`;
  if (destinationExists) movePathAtomically(destinationPath, backupPath);
  movePathAtomically(sourcePath, destinationPath);
  // 失败时回滚 backup
}
```

### 3.3 健康轮询与确定性失败检测

```typescript
private async waitForHealthySidecar(): Promise<void> {
  const deadline = Date.now() + SIDECAR_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await delay(SIDECAR_HEALTH_POLL_INTERVAL_MS);  // 500ms
    const healthSnapshot = await this.readHealthSnapshot();
    if (healthSnapshot.modelLoaded) return;
    if (isDefinitiveStartupFailure(healthSnapshot)) throw new Error(...);
  }
}
```

关键设计：**不是固定轮询次数后放弃，而是检查确定性失败信号**（如进程退出、stderr 关键错误），在超时前就能快速失败。

### 3.4 Score Normalization

```typescript
export function normalizeNeuralScores(rawLogits: number[]): number[] {
  const sigmoided = rawLogits.map(v => 1 / (1 + Math.exp(-v)));
  const min = Math.min(...sigmoided);
  const max = Math.max(...sigmoided);
  const range = max - min;
  if (range < 1e-8) return sigmoided.map(() => 0.5);
  return sigmoided.map(s => (s - min) / range);
}
```

Sigmoid → min-max 归一化 → [0, 1] 范围。全等分时返回 0.5 默认值。

## 4. LLM 集成

### 4.1 请求配置

```typescript
const baseURL = getPref("baseURL") || "https://openrouter.ai/api/v1";
const model = getPref("model") || "meta-llama/llama-3.3-70b-instruct:free";
// POST {baseURL}/chat/completions
// enable_thinking: false, temperature: 0
```

**设计决策：** 只用 OpenAI 兼容的 chat completions API，不支持多 Provider 自动检测（与 zotero-ainote 不同）。默认 OpenRouter，因为它的 `/v1/chat/completions` 兼容大量模型。

### 4.2 Robust JSON 提取

```typescript
function extractJsonFromResponse(raw: string): string {
  const trimmed = raw.trim();
  const balancedTrimmed = extractBalancedJsonPrefix(trimmed);
  if (balancedTrimmed) return balancedTrimmed;     // 1. 扫描完整 JSON 前缀
  const singletonArrayElement = extractSingletonArrayElement(trimmed);
  if (singletonArrayElement) return singletonArrayElement;  // 2. 单元素数组展开
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;  // 3. 直接返回
  const cleaned = cleanMarkdownCodeBlock(trimmed);
  // 4. Markdown code block 清理
  // 5. Fenced code block 正则
  // 6. 首/尾大括号扫描
}
```

多层降级策略应对 LLM 返回格式不一致问题：markdown code block、前缀噪声、LLM 思维链残留等。

### 4.3 指数退避重试

```typescript
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function calculateBackoff(attempt: number): number {
  return Math.min(BASE_DELAY_MS * (2 ** attempt), 30000) + Math.random() * 1000;
}
```

- 429/5xx 标记为可重试
- 4xx 客户端错误不重试
- 每次重试前等待指数退避 + 随机抖动

## 5. 语义高亮分类

### 5.1 5 种 Reason 类型 → 颜色映射

| Reason | 颜色 | 语义 |
|---|---|---|
| `claim` | `#ffd400` (黄) | 核心贡献、假说、定位声明 |
| `result` | `#ff6666` (红) | 定量发现、比较结果、证据 |
| `method` | `#2ea8e5` (蓝) | 设计决策、技术、数据集 |
| `caveat` | `#f9a942` (橙) | 限制、失败案例、假设、边界 |
| `background` | `#5fb236` (绿) | 问题框架、研究空白、动机 |

### 5.2 Reason 推断（非 LLM 模式）

```typescript
export function inferHighlightReason(text: string, sectionKind: ReadingSectionKind): ReadingHighlightReason {
  if (RESULT_REASON_PATTERNS.test(text)) return 'result';
  if (METHOD_REASON_PATTERNS.test(text)) return 'method';
  if (CAVEAT_REASON_PATTERNS.test(text)) return 'caveat';
  if (CLAIM_REASON_PATTERNS.test(text)) return 'claim';
  if (BACKGROUND_REASON_PATTERNS.test(text)) return 'background';
  // 回退到 section-based 推断
  switch (sectionKind) {
    case 'results': return 'result';
    case 'methods': return 'method';
    case 'discussion': return 'caveat';
    case 'abstract': case 'conclusion': return 'claim';
    default: return 'background';
  }
}
```

先用内容模式匹配，再用 section 类型兜底。这是**内容优先 + 位置兜底**的双层策略。

## 6. 密度与聚焦配置

### 6.1 密度层级

| 配置 | sparse | balanced | dense |
|---|---|---|---|
| 单段最小字符 | 16 | 16 | 14 |
| 单段最大字符 | 140 | 160 | 180 |
| 单段最大高亮数 | 2 | 3 | 5 |
| 全局 shortlist | 60 | 100 | 150 |
| 全局公式 | pages×3 (max 50) | pages×6 (max 100) | pages×10 (max 150) |
| 每页上限 | 5 | 10 | 15 |

### 6.2 聚焦模式 Section 权重

| Section | balanced | results-first | methods-first | caveats-first |
|---|---|---|---|---|
| abstract | 4 | 3 | 4 | 3 |
| introduction | 3 | 2 | 3 | 3 |
| methods | 2 | 1 | 5 | 1 |
| results | 5 | 6 | 3 | 3 |
| discussion | 4 | 5 | 2 | 6 |
| conclusion | 3 | 3 | 2 | 5 |
| references | -8 | -8 | -8 | -8 |

**references 统一负权重（-8），确保不会被选中。**

## 7. Rect Splitter — 字符范围到 PDF 子矩形

```typescript
export function computeSpanRects(fullText, fullRects, spanStart, spanEnd): number[][]
```

**MVP 方案：基于字符位置比例的线性插值**

- 单行：直接按字符比例插值 x 坐标
- 多行：先用字符宽度估算分配字符到各行，再对每行计算交集矩形
- 字符宽度分类：narrow (il1)、medium-narrow (ftjr)、average、wide (mwMW)、extra-wide (CJK)
- 垂直内边距：矩形高度缩放到 80%，上下各留 10%

这不是精确方案，但在不需要访问 PDF 渲染引擎的前提下提供了合理的多行高亮定位。

## 8. Preference 系统

### 8.1 双分支架构

```
Canonical: extensions.zotero-pdf-highlighter.{key}
Legacy:    extensions.zotero.extensions.zotero-pdf-highlighter.{key}  (重复前缀 bug)
```

启动时执行迁移：
```typescript
export const PREF_PREFIX_MIGRATION_VERSION_KEY = 'prefPrefixMigrationVersion';
export const PREF_PREFIX_MIGRATION_VERSION = '1';
```

迁移完成后写入版本号，不重复执行。

### 8.2 System Prompt Override 保护

```typescript
export function getStoredSystemPromptOverride(value: unknown): string | null {
  if (!nonEmptyValue || stringValue === DEFAULT_SYSTEM_PROMPT) return null;
  return stringValue;
}
```

用户未自定义时返回 `null`，而不是默认值。这使得模板可以区分"用户没改过"和"用户主动设为默认文本"。

## 9. Reader 事件集成

```typescript
// bootstrap.ts
Zotero.Reader.registerEventListener('renderTextSelectionPopup', handler);
Zotero.Reader.registerEventListener('renderToolbar', handler);
```

两个关键事件：
- **renderTextSelectionPopup**：用户选中文本时的弹出菜单中注入"智能高亮"选项
- **renderToolbar**：在 Reader 工具栏中添加全局高亮按钮

## 10. 可借鉴点

### 10.1 高价值可复用模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **双后端策略检测** | 需要在 LLM/非LLM 间自动切换的功能 | 低——状态机 + 配置检测 |
| **三信号评分管线** | heuristic + lexical + neural 融合排序 | 中——需要理解各信号权重和归一化 |
| **Sidecar 进程管理** | 需要本地二进制进程（ML 模型、工具链） | 高——SHA-256 校验 + 原子替换 + 健康轮询 + 空闲关闭 |
| **Robust JSON 提取** | LLM 响应格式不稳定的解析 | 中——多层降级策略 |
| **指数退避重试 + HTTP 错误分类** | 外部 API 调用的容错 | 低——标准模式 |
| **语义分类着色** | 多类别视觉区分 | 低——reason → color 映射 |
| **密度 + 聚焦配置** | 用户可配置的信息密度和关注点 | 低——配置表 + 权重表 |
| **双分支 Pref 迁移** | 修复历史 bug 后的配置迁移 | 低——版本号 + 原子迁移 |
| **System Prompt Override 保护** | 默认 prompt 升级不覆盖用户自定义 | 低——差异检测 |
| **Rect Splitter 字符比例插值** | 不需要 PDF 渲染引擎的多行高亮定位 | 中——字符宽度估算 + 多行分配 |
| **Content-first + Section-fallback Reason 推断** | 非 LLM 模式下的语义分类 | 低——正则匹配 + section 兜底 |
| **Shortlist 分页分散** | 全局选择时避免单页集中 | 低——perPage cap + dedup |

### 10.2 与当前模板的结合点

- 如果模板需要**本地 ML 推理**，可复用 SidecarManager 的完整进程管理链路
- 如果需要**多信号排序/评分**，可复用三信号管线架构
- 如果需要**LLM 响应解析**，可复用 robust JSON 提取策略
- 如果需要**用户可配置密度**，可复用 density config 表模式
- 如果需要**分类视觉区分**，可复用 reason → color 映射
- 如果需要**配置迁移**，可复用双分支 + 版本号迁移模式

### 10.3 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 硬编码 OpenRouter 默认 baseURL | 应适配当前模板的 Provider 选择策略 |
| 固定 `meta-llama/llama-3.3-70b-instruct:free` 默认模型 | 应可配置 |
| Sidecar 仅限 darwin-arm64 | 跨平台需要额外架构的二进制 |
| 固定端口 23516 + 5 个端口范围 | 应动态分配避免冲突 |
| 固定 5 种 reason 类型 | 产品决策，不是架构约束 |
| 固定颜色值 | 应由主题/样式系统管理 |
| `declare const Zotero: any` | 应使用更好的类型声明 |
| 硬编码英文 system prompt | 多语言场景需要本地化 |
| 固定 0.22/0.24 阈值 | 应可配置 |
| CJK 字符宽度估算基于 Unicode 区块 | 近似方案，非精确测量 |

## 11. 与 zotero-ainote 的架构对比

| 维度 | zotero-ainote | zotero-smart-highlighter |
|---|---|---|
| **LLM 调用** | 6 Provider 自动检测 + 流式 + 非流式回退 | 单一 OpenAI 兼容 API + 非流式 |
| **流式** | SSE/NDJSON/JSON 数组三种格式 | 不需要（非流式） |
| **输出方式** | 独立 OutputWindow 窗口 | PDF 内直接标注 |
| **后端策略** | 纯 LLM | 双后端（LLM/non-LLM）+ 自动切换 |
| **本地推理** | 无 | Neural Reranker sidecar |
| **评分管线** | 无（LLM 直接输出） | 三信号融合（heuristic + lexical + neural） |
| **配置复杂度** | API Key + URL + Model + 截断 | 密度 + 聚焦 + 后端模式 + 词法方法 + Neural + System Prompt |
| **进程管理** | 无 | Sidecar 完整生命周期 |
| **共同点** | Prompt 版本管理、Preference 系统、Reader 事件集成 | 同上 |

**关键区别：** ainote 是"批量处理 + 笔记输出"模式，smart-highlighter 是"实时交互 + PDF 内标注"模式。两者的 LLM 调用架构也不同——ainote 走多 Provider + 流式，smart-highlighter 走单一 API + 非流式 + 本地 reranker 补充。

## 12. 相关参考

- [REFERENCE_AINOTE_PATTERNS.md](./REFERENCE_AINOTE_PATTERNS.md) — 批量 AI 笔记 + 多 Provider + 流式输出
- [REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md](./REFERENCE_LLM_FOR_ZOTERO_PATTERNS.md) — 完整 Agent 架构
- [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) — 通用技术链
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) — Reader 事件权威接口
