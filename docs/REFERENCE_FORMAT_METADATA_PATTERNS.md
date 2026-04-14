# REFERENCE_FORMAT_METADATA_PATTERNS.md

> 参考来源：`reference/plugin/zotero-format-metadata-main/`（zotero-format-metadata）
> 用途：基于规则的元数据格式化系统 — 类型化规则接口、Prepare→Apply 两阶段执行、ConcurrentCaller 批量并发、Notifier 自动触发、节流冷却、Reporter 结果展示
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：zotero-format-metadata 源码](../reference/plugin/zotero-format-metadata-main/)

## 1. 核心架构概览

zotero-format-metadata 是一个元数据格式化插件，核心能力是：选中一个/多个条目 → 按 30+ 条规则逐项校验和修正 → 并发批量执行 → 展示成功/错误报告。

```
Zotero 插件层：
├── bootstrap.ts                  生命周期入口
├── index.ts                      re-export + hooks 绑定
├── addon.ts                      Addon 类：ztoolkit / runner 实例
├── hooks.ts                      onStartup / onNotify / onLintInBatch / onShortcuts
├── modules/
│   ├── rules/
│   │   ├── index.ts              Rules 注册表：30+ 规则分类注册
│   │   ├── rule-base.ts          defineRule / Rule 接口 / 节流包装
│   │   ├── correct-title-sentence-case.ts  标题大小写转换（最复杂规则之一）
│   │   ├── require-language.ts   语言检测规则
│   │   ├── no-item-duplication.ts 条目去重规则
│   │   └── _template.ts          新规则模板
│   ├── runner.ts                 LintRunner：两阶段执行 + ConcurrentCaller
│   ├── reporter.ts               ProgressUI + createReporter 对话框
│   ├── menu.ts                   右键菜单 / 字段菜单 / 子菜单注册
│   └── compat.ts                 版本迁移 + 偏好键重命名
└── utils/
    ├── prefs.ts                  Preference 读写
    ├── locale.ts                 i18n / getString
    ├── data-loader.ts            CSV/JSON 数据加载
    └── str.ts                    文本处理 / 语言检测
```

核心模块：

| 模块 | 职责 | 文件 |
|---|---|---|
| **Rule Interface** | 类型化规则定义：id、scope、target、apply、prepare、cooldown | `src/modules/rules/rule-base.ts` |
| **Rules Registry** | 30+ 规则集中注册、按类别/ID/类型查询、启用/禁用控制 | `src/modules/rules/index.ts` |
| **LintRunner** | 两阶段执行管线 + ConcurrentCaller 并发 + 逐规则超时 | `src/modules/runner.ts` |
| **ProgressUI** | 进度窗口 + 取消按钮 + 完成统计 | `src/modules/reporter.ts` |
| **createReporter** | 错误详情对话框：按 item 分组、规则级高亮、可操作按钮 | `src/modules/reporter.ts` |
| **Menu System** | 条目右键菜单 + 字段上下文菜单 + 子菜单分组 | `src/modules/menu.ts` |
| **Compat** | 版本化偏好迁移 + 键名重命名 + 类型修复 | `src/modules/compat.ts` |

## 2. 规则接口设计

### 2.1 Rule 类型定义

```typescript
interface Rule<Options = unknown> {
  id: string;                        // 唯一标识，如 "correct-title-sentence-case"
  nameKey: string;                   // i18n key
  descriptionKey: string;            // i18n key
  scope: "field" | "item" | "tag" | "attachment";
  category: "rule" | "tool";
  cooldown?: number;                 // 节流冷却时间（ms），用于外部 API 调用规则
  targetItemTypes?: string[];        // 适用的条目类型
  ignoreItemTypes?: string[];        // 排除的条目类型
  targetItemField?: string;          // scope="field" 时指定字段
  apply(ctx: ApplyContext): Promise<void>;
  prepare?(ctx: PrepareContext): Promise<Options>;
  getItemMenu?(): ItemMenuDef;
  fieldMenu?: FieldMenuDef;
  documentation?: string;
}
```

两种执行上下文：

```typescript
interface PrepareContext {
  items: Zotero.Item[];              // 批量条目数组
}

interface ApplyContext<Options = unknown> {
  item: Zotero.Item;                 // 单个条目
  options: Options;                  // prepare 阶段返回的共享数据
  debug: (msg: string, ...args: any[]) => void;
  report: (info: ReportInfo) => void; // 上报警告/错误
}
```

### 2.2 defineRule 工厂 + 自动节流

```typescript
export function defineRule<Options = unknown>(rule: WithStringID<Rule<Options>>): Rule<Options> {
  rule.apply = withThrottle(rule.apply, rule.cooldown ?? 0);
  return rule as Rule<Options>;
}
```

`defineRule` 在规则定义时自动包装 `apply` 方法，注入节流逻辑。带 `cooldown` 的规则（如外部 API 调用）在冷却期内不会重复执行。

### 2.3 规则分类注册

```typescript
// Rules.register() 按类别分组注册
Rules.register({
  item: [NoItemDuplication, NoArticleWebpage, NoJournalPreprint, ...],
  title: [CorrectTitleSentenceCase, CorrectTitleChemicalFormula, NoTitleTrailingDot, ...],
  creators: [CorrectCreatorsCase, CorrectCreatorsPinyin, RequireCreators],
  identifiers: [RequireDOI, NoDOIPrefix, CorrectDOILong],
  // ... 共 10+ 个分类，30+ 条规则
});
```

规则查询：

```typescript
Rules.getEnabledStandard()   // 获取启用的标准规则（按 preference 过滤）
Rules.getByType("field")     // 按 scope 查询
Rules.getByID("correct-title-sentence-case")  // 按 ID 精确查询
```

### 2.4 Tool 规则 vs Rule 规则

```typescript
private static isRuleEnabled(id: ID) {
  if (id.startsWith("tool-")) return false;  // tool 规则默认禁用
  return getPref(`rule.${id as StandardRuleID}`);
}
```

- **Rule 规则**：标准批量格式化规则，默认参与"标准流程"，可通过 preference 启用/禁用
- **Tool 规则**：工具类规则（`tool-` 前缀），不参与标准批量，只能手动单独调用

## 3. 两阶段执行管线

### 3.1 Prepare → Apply 流程

```
onLintInBatch(ruleIDs, items)
  ├── 解析规则：按 ID 或 "standard" 展开
  ├── LintRunner.add({ items, rules })
  │   ├── runner.prepareRules(rules, items)     → 阶段 1：批量准备
  │   │   └── rule.prepare?({ items }) → options  // 每个规则一次，返回共享数据
  │   ├── for each item:
  │   │   └── runner.enqueueItem(item, rules)    → 阶段 2：逐项执行
  │   │       └── for each rule:
  │   │           ├── shouldApplyRule(rule, item)  → 前置检查
  │   │           ├── withTimeout(applyRule, 60s)  → 超时保护
  │   │           ├── rule.apply({ item, options, debug, report })
  │   │           └── item.saveTx()                → 保存
  │   └── ConcurrentCaller 并发控制
  └── Reporter 展示结果
```

**关键设计：** `prepare` 每个规则只调用一次（批量），返回的 `options` 传递给该规则对所有 item 的 `apply` 调用。这适合加载共享数据（如自定义术语表、外部词典），避免逐条重复 IO。

### 3.2 shouldApplyRule 前置检查

```typescript
function shouldApplyRule(rule: Rule, item: Zotero.Item): boolean {
  if (rule.scope !== "item" && rule.scope !== "field") return false;
  if (!item.isRegularItem()) return false;
  if (rule.targetItemTypes && !rule.targetItemTypes.includes(item.itemType)) return false;
  if (rule.ignoreItemTypes?.includes(item.itemType)) return false;
  if (rule.scope === "field" && !isFieldValidForItemType(rule.targetItemField, item.itemType)) return false;
  return true;
}
```

规则在执行前再次验证适用性，确保 scope、itemType、field 都匹配。

### 3.3 逐规则超时 + 错误隔离

```typescript
await withTimeout(() => this.applyRule(item, rule, options), 60_000)
  .catch((error) => {
    this.stats.records.push({ message, level: "error", itemID: item.id, ... });
    errors.push(error);
  });
// 即使单个规则失败，继续执行下一条规则
// 所有规则执行完后才 throw
await item.saveTx();
if (errors.length) throw new Error(`Item ${item.id} failed ${errors.length} rules`);
```

每个规则独立 60 秒超时。一个规则失败不影响同 item 的其他规则。所有规则执行完才统一报错。

## 4. 并发批量处理

### 4.1 ConcurrentCaller

```typescript
const concurrency = getPref("lint.numConcurrent") || 1;
const caller = new Zotero.Utilities.ConcurrentCaller(concurrency);

for (const item of itemsToProcess) {
  caller.add(() => this.lintItem(item, rules, options));
}

await caller.callQueue({
  onProgress: (current, total) => progressUI.updateProgress(current, total),
  stopOnError: false,
});
```

使用 Zotero 内置的 `ConcurrentCaller` 实现并发控制，用户可通过 preference 调整并发数。

### 4.2 Notifier 自动触发

```typescript
async function onNotify(event, type, ids, extraData) {
  if (!getPref("lint.onAdded")) return;
  if (event !== "add" || type !== "item") return;
  if (extraData.skipAutoSync) return;
  await Zotero.Promise.delay(500);  // 等待其他插件处理完成
  const items = Zotero.Items.get(ids).filter(
    item => item.isRegularItem() && !item.isFeedItem && item.getField("title")
  );
  if (items.length !== 0) addon.hooks.onLintInBatch("standard", items);
}
```

500ms 延迟策略：让其他插件（如抓取元数据的插件）先完成操作，再执行格式化。这是多插件协作的关键设计。

## 5. Reporter 系统

### 5.1 ProgressUI 进度窗口

```typescript
class ProgressUI {
  init(silent?: boolean)      // 创建进度窗口，含"中断"按钮
  updateProgress(current, total)  // 更新 [N/M] 进度条
  showError()                 // 标记有错误
  showFinished(success, error, duration)  // 完成统计 + 自动关闭
}
```

进度窗口特性：
- 不自动关闭（`closeTime: -1`），等待用户操作
- "中断"按钮绑定 `handleStopRequest`，设置取消标志
- 完成时显示 `✔️{success} ❌{error}` 统计，5 秒后自动关闭

### 5.2 createReporter 错误详情对话框

```typescript
function createReporter(infos: ReportInfo[]) {
  const grouped = groupBy(infos, info => info.itemID);
  // 按 item 分组，每个 item 一个卡片
  // 每个规则一行，error 红色背景，warning 橙色背景
  // 可选 action 按钮（如"跳转到重复条目"）
}
```

关键设计：
- 按 itemID 分组，一个 item 一个卡片
- 规则级颜色区分：`error` → 红色，`warning` → 橙色
- 每个规则可定义 `action` 回调按钮
- 点击 item 标题跳转到对应条目

## 6. 菜单系统

### 6.1 条目右键菜单

```typescript
Zotero.MenuManager.registerMenu({
  pluginID: addon.data.config.addonID,
  menuID: "item-menu",
  target: "main/library/item",
  menus: [
    { menuType: "submenu", l10nID: "...", menus: [
      { menuType: "menuitem", l10nID: "menuitem-stdFormatFlow", onCommand: ... },  // 标准流程
      { menuType: "separator" },
      makeItemMenu("correct-title-sentence-case"),  // 单个规则
      makeItemMenu("require-language"),
      { menuType: "submenu", l10nID: "menuTools-label", menus: [...] },  // 工具子菜单
    ]},
  ],
});
```

菜单结构：
- 顶级子菜单 → 标准流程 + 常用规则 + 工具子菜单
- `makeItemMenu(ruleID)` 自动创建规则菜单项，onCommand 调用 `onLintInBatch`
- 支持 `mutiltipleItems: false` 限制多选场景

### 6.2 字段上下文菜单

```typescript
Zotero.MenuManager.registerMenu({
  pluginID: addon.data.config.addonID,
  menuID: "field-menu",
  target: "itemPane/info/row",
  menus: Rules.getByType("field").filter(r => r.fieldMenu).map(rule => ({
    onShowing: (event, context) => {
      const visible = rule.targetItemField === context.fieldName;
      context.setVisible(visible);
      context.setEnabled(!rule.fieldMenu?.setDisabled?.(context));
    },
    onCommand: (event, context) => {
      rule.fieldMenu?.onCommand?.(context) ?? addon.hooks.onLintInBatch(rule.id, context.items);
    },
  })),
});
```

字段菜单动态显示：只有当当前字段匹配规则的 `targetItemField` 时才可见。

## 7. 偏好迁移系统

### 7.1 版本化迁移

```typescript
export async function checkCompat() {
  const version = getPref("version") ?? "0.0.0";
  if (compareVersion(version, "1.11.0") === -1) {
    mvPref("add.update", "lint.onAdded", true);
    mvPref("isEnableTitleCase", "titleSentenceCase", true);
    // ... 大量键名重命名
  }
  if (compareVersion(version, "2.0.0") === -1) {
    mvPref("noDuplicationItems", "rule.no-item-duplication");
    // ... v2 规则 ID 重命名
  }
  if (compareVersion(version, "2.0.0-beta.16") === -1) {
    // 一个规则拆成两个：复制旧值到两个新键
    const old = getPref("rule.correct-publication-title");
    setPref("rule.correct-publication-title-case", old);
    setPref("rule.correct-publication-title-alias", old);
  }
  setPref("version", currentVersion);
}
```

迁移特点：
- 基于版本号的条件迁移，每个版本独立处理
- `mvPref` 辅助函数：旧键值迁移到新键，自动处理默认值
- 支持"一拆多"场景（一个旧键拆分到两个新键）
- 特殊类型修复（`lint.numConcurrent` 类型错误修复后触发插件重载）

### 7.2 插件热重载

```typescript
async function reloadPlugin() {
  const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
  const addon = (await AddonManager.getAllAddons()).find(e => e.id === addon.data.config.addonID);
  await addon?.reload();
}
```

偏好迁移完成后，如果需要（如类型修复），自动触发插件热重载。

## 8. 代表性规则分析

### 8.1 correct-title-sentence-case（标题大小写转换）

最复杂的规则之一，展示了多种模式：

```typescript
function createCorrectTitleSentenceCaseRule(targetItemField: "title" | "shortTitle" | "bookTitle" | "proceedingsTitle") {
  return defineRule<Options>({
    id: `correct-${targetItemField}-sentence-case`,
    scope: "field",
    targetItemField,
    async apply({ item, options, debug }) {
      const lang = item.getField("language") || "en-US";
      let title = item.getField(targetItemField, false, true);
      title = lang.match("zh") ? title : toSentenceCase(title, lang);

      // 应用自定义术语替换
      const data = options.data;
      if (data) {
        data.forEach((term) => {
          const search = convertToRegex(term.search);
          if (search.test(title)) {
            title = title.replace(search, term.replace);
            debug(`[title] Hit custom term: `, search);
          }
        });
      }
      item.setField(targetItemField, title);
    },
    async prepare() {
      const customTermFilePath = getPref("rule.correct-title-sentence-case.custom-term-path");
      if (customTermFilePath) {
        return { data: await DataLoader.load("csv", customTermFilePath, { headers: ["search", "replace"] }) };
      }
      return {};
    },
  });
}

// 一个工厂函数生成 4 个规则
export const CorrectTitleSentenceCase = createCorrectTitleSentenceCaseRule("title");
export const CorrectShortTitleSentenceCase = createCorrectTitleSentenceCaseRule("shortTitle");
export const CorrectBookTitleSentenceCase = createCorrectTitleSentenceCaseRule("bookTitle");
export const CorrectProceedingsTitleSentenceCase = createCorrectTitleSentenceCaseRule("proceedingsTitle");
```

关键模式：
- **工厂函数**：一个定义生成多个相似规则
- **prepare 加载外部数据**：自定义术语表 CSV 文件，只加载一次
- **语言感知**：中文标题不转换大小写
- **toSentenceCase**：基于 Zotero.Utilities.sentenceCase 修改，支持化学元素、专有名词、HTML 标签保护

### 8.2 no-item-duplication（条目去重）

```typescript
export const NoItemDuplication = defineRule({
  id: "no-item-duplication",
  scope: "item",
  async apply({ item, report, debug }) {
    const duplicates = new Zotero.Duplicates(item.libraryID);
    const search = await duplicates.getSearchObject();
    const searchResult = await search.search();

    if (searchResult.includes(item.id)) {
      report({
        level: "error",
        message: getString("rule-no-item-duplication-report-message"),
        action: {
          label: getString("rule-no-item-duplication-report-action"),
          callback: () => {
            // 聚焦主窗口 → 切换到条目树 → 打开重复条目集合
            mainWindow.ZoteroPane.setVirtual(item.libraryID, "duplicates", true, true);
          },
        },
      });
    }
  },
});
```

关键模式：
- **只检测不修改**：规则不修改数据，只 report 错误
- **可操作 report**：带 action 回调，用户点击直接跳转到重复条目视图

### 8.3 require-language（语言检测）

```typescript
export const RequireLanguage = defineRule({
  id: "require-language",
  scope: "field",
  ignoreItemTypes: ["computerProgram"],
  targetItemField: "language",
  fieldMenu: { l10nID: "rule-require-language-menu-field" },
  async apply({ item }) {
    const title = item.getField("title") as string;
    const language = getTextLanguage(title);
    item.setField("language", language);
  },
});
```

关键模式：
- **极简规则**：无 prepare、无 options、无 report，只做单一字段设置
- **ignoreItemTypes**：排除特定条目类型
- **fieldMenu**：注册字段级上下文菜单

## 9. 可借鉴点

### 9.1 高价值可复用模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **类型化 Rule 接口** | 需要可扩展的校验/格式化/转换管线 | 中——需要理解 ApplyContext/PrepareContext |
| **Prepare→Apply 两阶段执行** | 批量处理前有共享数据加载（词典、术语表） | 中——options 泛型传递 |
| **defineRule 工厂 + 自动节流** | 规则定义时自动注入横切关注点（节流、日志、超时） | 低——高阶函数包装 |
| **Rules Registry 集中注册** | 30+ 规则按类别管理、启用/禁用控制 | 低——Map + 分类数组 |
| **ConcurrentCaller 并发控制** | 批量 IO/网络请求需要限制并发数 | 低——Zotero 内置 API |
| **Notifier 500ms 延迟触发** | 多插件环境下等待其他插件完成 | 低——`Zotero.Promise.delay(500)` |
| **逐规则 60s 超时 + 错误隔离** | 批量处理中单点失败不阻塞整体 | 低——`withTimeout` + catch |
| **ProgressUI + Reporter 分离** | 进度窗口 vs 错误详情对话框 | 低——两个独立组件 |
| **可操作 Report Action** | 错误行附带跳转/修复按钮 | 低——回调函数 |
| **Tool vs Rule 双类别** | 标准流程 vs 手动工具调用的区分 | 低——前缀命名 + 查询过滤 |
| **版本化偏好迁移** | 多版本演进中的键名重命名/拆分/类型修复 | 低——`compareVersion` + `mvPref` |
| **字段上下文菜单动态可见** | 根据当前字段匹配规则自动显隐 | 低——`onShowing` 回调 |
| **规则工厂函数** | 相似规则复用同一实现 | 低——参数化 defineRule |
| **只检测不修改规则** | 审计/校验类规则 | 低——只 report，不调 setField |

### 9.2 与当前模板的结合点

- 如果模板需要**可扩展的校验/格式化管线**，可复用 Rule 接口 + defineRule 模式
- 如果需要**批量处理**，可复用 ConcurrentCaller + 逐规则超时 + 错误隔离
- 如果需要**外部数据预加载**（词典、术语表），可复用 prepare→options 传递模式
- 如果需要**事件驱动自动触发**，可复用 Notifier + 500ms 延迟策略
- 如果需要**进度展示 + 错误报告**，可复用 ProgressUI + createReporter 分离设计
- 如果需要**多版本配置迁移**，可复用 compareVersion + mvPref 模式
- 如果需要**标准流程 + 手动工具区分**，可复用 Rule/Tool 双类别设计

### 9.3 不推荐直接搬运的部分

| 内容 | 原因 |
|---|---|
| 硬编码的化学元素列表 | 产品特定数据，应由外部数据源管理 |
| 大量 ISO 639-3 → 639-1 映射表内联 | 应使用外部数据文件 |
| 硬编码的世界城市列表 | 产品特定数据，不应内联在规则代码中 |
| `toSentenceCase` 复杂正则逻辑 | 基于 Zotero 内部实现，有版权考虑（AGPL v3） |
| 固定 60 秒规则超时 | 应由规则类型决定（API 调用 vs 本地处理） |
| 固定 500ms Notifier 延迟 | 应根据具体场景调优 |
| `declare const Zotero: any` 风格 | 应使用更好的类型声明 |
| 开发环境专用测试菜单 | `__env__ === "development"` 分支不应进入生产 |
| 硬编码的 ProgressWindow 文本 | 应通过 i18n 系统管理 |
| Fluent l10n 延迟加载 workaround | `checkL10nString` 的 500ms setTimeout 是临时方案 |

## 10. 与同类插件的架构对比

| 维度 | zotero-format-metadata | zotero-ainote | zotero-smart-highlighter |
|---|---|---|---|
| **核心模式** | 规则引擎 + 批量校验 | 批量 LLM 调用 + 笔记生成 | 双后端评分 + PDF 内标注 |
| **扩展方式** | defineRule 工厂 + 注册表 | 单一管线，不易扩展 | 后端策略配置 |
| **并发模型** | ConcurrentCaller（用户可调） | 串行逐条处理 | 不适用（实时交互） |
| **错误处理** | 逐规则超时 + 隔离 + Reporter | 进度回调 + OutputWindow | 指数退避 + HTTP 分类 |
| **数据预加载** | prepare 阶段一次性加载 | 无 | Neural Reranker 模型 |
| **自动触发** | Notifier + 500ms 延迟 | 无 | Reader 事件 |
| **用户配置** | 每规则独立 preference 开关 | 全局 API Key/URL | 密度/聚焦/后端模式 |
| **输出方式** | 就地修改 + Reporter | 创建笔记附件 | PDF 内高亮着色 |

**关键区别：** format-metadata 是"规则引擎 + 就地修正"模式，ainote 是"批量处理 + 附件输出"模式，smart-highlighter 是"实时交互 + 内联标注"模式。三者的扩展性也不同——format-metadata 通过注册表最容易扩展新规则。

## 11. 相关参考

- [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) — 通用技术链
- [REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md) — 菜单与子菜单模式
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) — Notifier / MenuManager 接口
- [REFERENCE_AINOTE_PATTERNS.md](./REFERENCE_AINOTE_PATTERNS.md) — 批量处理对比
- [REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md](./REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md) — 去重工作流对比
