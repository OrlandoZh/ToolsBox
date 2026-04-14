# REFERENCE_AI_COLLECTION_PATTERNS.md

> 参考来源：`reference/plugin/zotero-ai-collection-bootstrap/`（zotero-ai-collection-bootstrap，justinfjx/zotero-ai-collection，bootstrap 分支）
> 用途：AI 驱动的智能分类 + 层级 Collection 树管理 + 交互式确认对话框 + 批量处理管线
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：zotero-ai-collection-bootstrap 源码](../reference/plugin/zotero-ai-collection-bootstrap/)

## 1. 核心架构概览

zotero-ai-collection-bootstrap 是一个面向 Zotero 的 AI 智能分类插件，核心能力是：通过 LLM 分析文献元数据（标题、摘要、作者等），自动将文献归类到用户定义的 Collection 层级树中 + 提供交互式确认对话框（接受/拒绝/归档）+ 支持单条/批量两种处理模式 + 可配置多 API 配置档案 + 中文标题翻译。

```
Zotero 插件层：
├── bootstrap.ts                    生命周期入口
├── index.ts                        全局 addon / ztoolkit 注册
├── addon.ts                        Addon 类：ztoolkit 实例
├── hooks.ts                        onStartup / onShutdown / onPrefsEvent
├── modules/
│   ├── classifier.ts               核心分类引擎：Collection 树构建 / 路径匹配 / 交互式对话框 / 批量处理
│   ├── api.ts                      LLM API 调用：双格式 Prompt / JSON 解析 / 连接测试
│   ├── preferenceScript.ts         设置面板：API 配置档案 / Collection 树复选框 / Easter eggs
│   └── menu.ts                     右键菜单注册
├── utils/
│   ├── prompts.ts                  默认分类 Prompt（DEFAULT_PROMPT）
│   ├── prefs.ts                    getPref/setPref/clearPref 包装
│   └── locale.ts                   i18n / stringBundle
└── addon/
    ├── prefs.js                    默认偏好设置
    └── manifest.json               插件清单 v2
```

核心模块：

| 模块 | 职责 | 文件 |
|---|---|---|
| **Classifier** | 核心分类引擎：Collection 树构建、层级路径匹配、单条/批量分类、交互式确认对话框、归档管理 | `classifier.ts` |
| **API Client** | LLM HTTP 调用：隐藏格式/翻译指令、JSON 响应解析（对象/数组双格式）、连接测试 | `api.ts` |
| **PreferenceScript** | 设置面板：API 配置档案 CRUD、Collection 树复选框级联、Easter eggs | `preferenceScript.ts` |
| **Menu** | 右键菜单：触发分类 | `menu.ts` |
| **DEFAULT_PROMPT** | 分类系统 Prompt 模板：学术论文分类指令 | `utils/prompts.ts` |
| **Typed Prefs** | 类型化 preference 读写 | `utils/prefs.ts` |

## 2. 层级 Collection 树架构

### 2.1 Collection 树构建

```typescript
// classifier.ts — 构建层级 Collection 树
function buildCollectionTree(allCollections: Zotero.Collection[]): CollectionNode {
  const root: CollectionNode = { name: 'Root', children: {}, path: '' };
  for (const collection of allCollections) {
    const parentPath = collection.parentID ? getPathFromID(collection.parentID) : '';
    const path = parentPath ? `${parentPath}/${collection.name}` : collection.name;
    root.children[path] = { name: collection.name, path, children: {} };
  }
  return root;
}
```

关键设计：
- 使用扁平 Map 存储路径 → 节点映射，而不是嵌套树
- 路径格式为 `父Collection/子Collection/孙Collection`
- 支持任意深度的层级嵌套

### 2.2 智能路径匹配（含 "/" 的 Collection 名）

```typescript
export function getCollectionByPath(pathStr: string, allCollections: Zotero.Collection[]): Zotero.Collection | null {
  function findInChildren(remainingPath: string, collections: Zotero.Collection[]): Zotero.Collection | null {
    // 贪心匹配 — 从最长可能子串开始尝试
    for (let i = remainingPath.length; i > 0; i--) {
      const possibleName = remainingPath.substring(0, i);
      const rest = remainingPath.substring(i);
      if (rest && !rest.startsWith("/")) continue;
      const match = collections.find((c) => c.name.toLowerCase() === possibleName.toLowerCase());
      if (match) {
        if (rest) {
          // 还有剩余路径，递归在子 Collection 中查找
          const childCollections = allCollections.filter((c) => c.parentID === match.id);
          return findInChildren(rest.substring(1), childCollections);
        }
        return match;
      }
    }
    return null;
  }
}
```

关键设计：
- Collection 名本身可能包含 "/"（如 "Aerial Manipulation/Contact"）
- 贪心策略：从最长匹配开始，避免把 "A/B" 错误拆成 "A" + "B"
- 递归下降：匹配到当前层级后，在子 Collection 中继续匹配剩余路径

### 2.3 Collection 启用/禁用过滤

```typescript
// preferenceScript.ts — 用户通过复选框启用/禁用 Collection
const enabledPaths = getPref("enabledCollections") as string[] || [];
// 只有 enabled 的 Collection 才会传给 LLM 作为候选分类
```

关键设计：
- 用户可以在设置面板中勾选/取消 Collection
- 只有被启用的 Collection 路径会出现在 LLM 候选列表中
- 避免 LLM 选择不应该使用的分类

## 3. 双处理模式：逐条 vs 批量

### 3.1 逐条模式（classifyItemsOneByOne）

```typescript
async function classifyItemsOneByOne(items: Zotero.Item[], allCollections: Zotero.Collection[], enabledPaths: string[]) {
  for (const item of items) {
    // 1. 提取元数据
    const metaData = extractMetaData(item);
    // 2. 调用 LLM
    const response = await callAI(metaData, enabledPaths);
    // 3. 显示确认对话框
    const result = await showClassificationDialog(title, chineseTitle, validPaths, allCollections);
    // 4. 执行操作
    if (result.action === "confirm") { safeAddToCollection(item, selectedPaths); }
    else if (result.action === "archive") { moveToArchive(item); }
  }
}
```

适用场景：
- 需要逐条审查分类结果
- 文献数量较少
- 分类精度要求高

### 3.2 批量模式（classifyItemsBatch）

```typescript
async function classifyItemsBatch(items: Zotero.Item[], allCollections: Zotero.Collection[], enabledPaths: string[]) {
  // 1. 并行调用 LLM（或串行，取决于实现）
  const results: BatchItemResult[] = [];
  for (const item of items) {
    const response = await callAI(metaData, enabledPaths, includeTranslation);
    results.push(parseBatchResult(item, response));
  }
  // 2. 统一显示批量确认对话框
  const finalResults = await showBatchClassificationDialog(results);
  // 3. 批量执行
  for (const result of finalResults) {
    executeAction(result);
  }
}
```

适用场景：
- 大批量文献处理
- 用户对 AI 分类精度有信心
- 追求处理效率

### 3.3 模式选择

```typescript
// prefs.js
pref("extensions.zotero.aicollectionbootstrap.batchMode", true);
// 用户可在设置中切换
```

## 4. 交互式确认对话框

### 4.1 单条分类确认

```typescript
async function showClassificationDialog(title: string, chineseTitle: string, validPaths: string[], allCollections: Zotero.Collection[]) {
  // ztoolkit.Dialog 构建
  // 左侧：文献标题 + 元数据
  // 右侧：Collection 路径复选框
  // 底部：Accept / Reject / Archive 三个按钮
  // + window unload 时自动 cancel
}
```

### 4.2 批量确认对话框

```typescript
interface BatchItemResult {
  item: Zotero.Item;
  title: string;
  chineseTitle?: string;
  validPaths: string[];
  selectedPaths: string[];
  action: "pending" | "confirm" | "reject" | "archive";
  error?: string;
}

async function showBatchClassificationDialog(results: BatchItemResult[]) {
  // 每行一个文献，显示标题 + AI 推荐的 Collection
  // 每行有 Accept / Reject / Archive 按钮
  // 底部有"全部接受" / "全部拒绝并归档" / "全部拒绝" / "确认以上所有状态"
  // 使用 Map<number, { action, selectedPaths }> 跟踪每行状态
}
```

关键设计：
- 用户可以在批量对话框中逐条修改 AI 推荐
- 支持一键全部接受/拒绝
- 窗口卸载时自动取消，避免误操作

## 5. LLM API 调用

### 5.1 双格式 Prompt 构建

```typescript
// api.ts
const FORMAT_INSTRUCTION = `规则：只能选择列表中已存在的完整路径，返回 JSON 数组。`;
const TRANSLATION_INSTRUCTION = `另外，请将文献标题翻译成中文，增加"chineseTitle"字段。`;

// 不带翻译：返回 JSON 数组 ["路径1", "路径2"]
// 带翻译：返回 JSON 对象 { collections: ["路径1"], chineseTitle: "中文标题" }
const systemPrompt = `${customPrompt}\n\n${includeTranslation ? TRANSLATION_INSTRUCTION : FORMAT_INSTRUCTION}`;
```

关键设计：
- 格式/翻译指令隐藏在系统 Prompt 中，用户看不到
- 通过 `includeTranslation` preference 控制是否启用翻译
- 用户自定义 Prompt + 隐藏指令组合

### 5.2 JSON 响应解析（双格式回退）

```typescript
// 带翻译模式 — 期望对象
const jsonMatch = content.match(/\{[\s\S]*\}/);
if (jsonMatch) {
  const parsed = JSON.parse(jsonMatch[0]);
  return { collections: parsed.collections || [], chineseTitle: parsed.chineseTitle };
}
// 回退 — 尝试数组格式
const arrayMatch = content.match(/\[[\s\S]*\]/);
if (arrayMatch) {
  return { collections: JSON.parse(arrayMatch[0]), chineseTitle: undefined };
}

// 不带翻译模式 — 期望数组
const match = content.match(/\[[\s\S]*\]/);
return { collections: match ? JSON.parse(match[0]) : [] };
```

关键设计：
- LLM 可能不严格遵循格式要求，用正则提取 JSON 块
- 对象格式失败时回退到数组格式
- 最大程度容错

### 5.3 API 配置档案

```typescript
interface ApiConfig {
  name: string;
  apiUrl: string;
  model: string;
  apiKey: string;
}

// preferenceScript.ts — 多配置管理
// 保存：JSON 序列化到 "apiConfigs" preference
// 重命名：更新 name 字段
// 删除：从数组中移除
// 切换：设置 "activeApiConfig" 为选中的 name
```

关键设计：
- 支持多套 API 配置（不同 Provider/不同 Key）
- 用户可随时切换活跃配置
- 配置以 JSON 数组形式存储在 preference 中

## 6. 归档 Collection 管理

```typescript
async function getOrCreateArchiveCollection(libraryID: number): Promise<Zotero.Collection | null> {
  const archiveName = (getPref("archiveCollectionName") as string) || "未分类";
  // 1. 查找已存在的归档 Collection
  const existing = Zotero.Collections.getByLibrary(libraryID).find(c => c.name === archiveName);
  if (existing) return existing;
  // 2. 创建新的归档 Collection
  const collection = new Zotero.Collection();
  collection.name = archiveName;
  collection.libraryID = libraryID;
  await collection.saveTx();
  return collection;
}
```

关键设计：
- 归档 Collection 名称可配置（默认"未分类"）
- 幂等操作：已存在则复用，不存在则创建
- 用户拒绝 AI 分类时，文献移入归档 Collection

## 7. Collection 复选框级联

```typescript
// preferenceScript.ts
function handleCheckboxChange(path: string, checked: boolean) {
  if (checked) {
    enabledPaths.add(path);
    // 级联：选中父级时，同时选中所有子级
    addDescendantPaths(path, enabledPaths);
    // 向上：确保祖先路径也被启用
    addAncestorPaths(path, enabledPaths);
  } else {
    enabledPaths.delete(path);
    // 级联：取消选中时，同时取消选中所有子级
    removeDescendantPaths(path, enabledPaths);
  }
  setEnabledCollections(Array.from(enabledPaths));
  updateCheckboxStates(doc, enabledPaths);
}
```

关键设计：
- 选中父 Collection → 自动选中所有子 Collection
- 取消父 Collection → 自动取消所有子 Collection
- 保证 Collection 树的层级一致性

## 8. Easter Eggs

| 触发方式 | 效果 |
|---|---|
| 标题点击 5 次 | 显示隐藏消息 |
| "眼睛"按钮长按 3 秒 | 触发彩蛋 |
| 测试按钮连点 10 次 | 触发彩蛋 |
| 分类完成后 | 随机显示完成消息 |

关键设计：
- 增加趣味性，不影响核心功能
- 不干扰正常使用流程

## 9. 默认分类 Prompt

```typescript
// utils/prompts.ts — DEFAULT_PROMPT
// 学术论文分类指令：
// - 分析标题、摘要、作者、期刊、年份
// - 根据文献内容选择最匹配的 Collection 路径
// - 支持多选（一篇文献可属于多个分类）
// - 只选择候选列表中存在的路径
```

## 10. 可借鉴点

### 10.1 高价值可复用模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **层级 Collection 树 + 路径映射** | 需要基于 Zotero Collection 做智能分类 | 低——扁平 Map 存储路径 |
| **智能路径匹配（贪心）** | Collection 名本身包含 "/" 时避免错误拆分 | 中——从最长匹配开始 |
| **双处理模式（逐条/批量）** | 需要兼顾精度和效率 | 中——两套对话框逻辑 |
| **交互式确认对话框（Accept/Reject/Archive）** | AI 推荐需要人工审核 | 中——ztoolkit.Dialog 构建 |
| **批量对话框中的逐条修改** | 批量处理但允许逐条调整 | 高——Map 跟踪每行状态 |
| **Collection 复选框级联** | 层级结构的启用/禁用控制 | 中——父子路径级联 |
| **API 配置档案** | 多 Provider/多 Key 切换 | 低——JSON 序列化数组 |
| **JSON 响应双格式回退** | LLM 不严格遵循格式时的容错 | 低——正则提取 + fallback |
| **隐藏格式/翻译指令** | 不暴露给用户的系统级 Prompt | 低——Prompt 拼接 |
| **归档 Collection 幂等管理** | 拒绝分类时的统一归档 | 低——getOrCreate 模式 |
| **Collection 启用/禁用过滤** | 控制 LLM 候选分类范围 | 低——preference 存储 |
| **Typed Preferences** | 类型化 preference 读写 | 低——泛型包装 |

### 10.2 与当前模板的结合点

- 如果模板需要**AI 智能分类**，可复用层级 Collection 树 + 路径匹配架构
- 如果需要**批量文献处理**，可复用逐条/批量双模式设计
- 如果需要**AI 推荐 + 人工审核**，可复用交互式确认对话框模式
- 如果需要**多 API 配置**，可复用 API 配置档案管理
- 如果需要**LLM JSON 解析容错**，可复用双格式回退策略
- 如果需要**层级结构启用/禁用**，可复用 Collection 复选框级联
- 如果需要**归档管理**，可复用 getOrCreate 幂等模式

### 10.3 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 具体分类 Prompt 文案 | 应由可配置模板系统管理，不硬编码 |
| 中文特定的 l10n key | 模板应保持国际化中立 |
| Easter Eggs 具体实现 | 产品级趣味功能，模板不需要 |
| `ztoolkit.Dialog` 具体 HTML 结构 | 模板应使用自己的 UI 组件 |
| 硬编码的 "未分类" 归档名 | 应由 preference 配置控制 |
| `declare const ztoolkit: any` 风格 | 应使用更好的类型声明 |
| `callAI` 函数中的具体 HTTP 实现 | 应抽象为可替换的 LLM Provider 接口 |
| 固定的 JSON 解析正则 | 应更健壮的 JSON 提取策略 |
| 批量模式串行逐条调用 LLM | 应考虑并行/并发调用提升效率 |

## 11. 与同类插件的架构对比

| 维度 | zotero-ai-collection-bootstrap | zotero-ai-bar | zotero-AI-Butler |
|---|---|---|---|
| **核心模式** | AI 智能分类 + Collection 树管理 | 轻量对话 + PDF 上下文 + 快捷命令 | 多 Provider + Key 轮换 + 多模态管线 |
| **交互方式** | 分类确认对话框（Accept/Reject/Archive） | 双模式 Chat（sidebar/window） | 统一 Dashboard + 6 功能标签 |
| **处理模式** | 逐条/批量两种 | 按 section 隔离会话 | TaskQueueManager 优先级调度 |
| **LLM 调用** | 单 Provider + 多配置档案 | 多 Provider + 用户可配置 | Provider Registry + Key 轮换 |
| **输出** | 修改 Collection 归属 | 生成对话回复 | 创建笔记 + Dashboard 展示 |
| **人工审核** | 每条/批量确认对话框 | 无（直接输出） | 无（自动批量） |
| **容错** | JSON 双格式回退 | SSE 流解析 + AbortController | 重试 + Key 轮换 + 冷却 |

**关键区别：** AI-Collection-Bootstrap 走的是"AI 智能分类 + 人工审核"路线——通过 LLM 分析文献元数据，推荐 Collection 分类，但每一步都让用户确认。AI-Bar 走的是"轻量快捷对话"路线——嵌入 Reader 侧边栏直接对话。AI-Butler 走的是"多模态批量处理"路线——全自动批量处理，不需要人工审核每一步。

## 12. 相关参考

- [REFERENCE_AI_BAR_PATTERNS.md](./REFERENCE_AI_BAR_PATTERNS.md) — 轻量 AI 对话对比
- [REFERENCE_AI_BUTLER_PATTERNS.md](./REFERENCE_AI_BUTLER_PATTERNS.md) — 多 Provider + 多模态对比
- [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) — 通用技术链
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) — Collection / Notifier 接口
