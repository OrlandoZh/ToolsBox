# REFERENCE_BETTER_BIBTEX_PATTERNS.md

> 参考来源：`reference/plugin/zotero-better-bibtex-master/`（zotero-better-bibtex）
> 用途：BibTeX/BibLaTeX 导出管线、引用键管理、Extra 字段解析、宿主 Monkey Patch 的架构模式沉淀
> 最后更新：2026-04-12

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：zotero-better-bibtex 源码](../reference/plugin/zotero-better-bibtex-master/)

## 1. 核心架构概览

Better BibTeX (BBT) 是 Zotero 生态中最成熟的文献导出插件之一，核心能力：

| 模块 | 职责 | 关键文件 |
|---|---|---|
| **BetterBibTeX** | 主类：启动编排、菜单注册、UI 注入、进度条 | `content/better-bibtex.ts` |
| **KeyManager** | 引用键（citekey）生成、缓存、冲突检测、批量填充 | `content/key-manager.ts` |
| **Formatter** | citekey 模板编译、多语言转写（CJK/西里尔/阿拉伯） | `content/key-manager/formatter.ts` |
| **Extra 解析** | Extra 字段中 BibTeX/LaTeX/CSL 键值对的解析与序列化 | `content/extra.ts` |
| **Scheduler** | 防抖调度器（debounce），用于 items-changed 后的延迟 citekey 更新 | `content/scheduler.ts` |
| **Translators** | BibTeX/BibLaTeX/CSL-JSON 导出翻译器 | `content/translators/` |
| **Worker** | ChromeWorker 异步导出管线 | `content/worker/` |
| **AutoExport** | 自动导出注册与触发 | `content/auto-export.ts` |
| **JSON-RPC** | 外部编辑器通信（LaTeX 编辑器 citekey 查询） | `content/json-rpc.ts` |
| **CAYW** | "Cite As You Write" — Word/LO 插件集成 | `content/cayw/` |

数据流：

```
Zotero Item 变化
  -> Events.on('items-changed')
  -> Scheduler.schedule(itemID)  // 防抖 1000ms
  -> KeyManager.update(item)     // 生成/更新 citekey
  -> item.setField('citationKey', proposed)
  -> item.saveTx()

导出时：
  Zotero.Translate.Export.translate()
  -> monkey patch 拦截
  -> Translators.queueJob() (Worker 路径) 或 original (主线程路径)
  -> Worker: collect items -> generate BibTeX/BibLaTeX -> write file
```

## 2. 引用键（Citekey）管理系统

### 2.1 双源缓存

```
Keys (内存 Map<number, CitekeyRecord>)
  ├── 持久化：read-only.json（只读库的 citekey 快照）
  └── 权威源：Zotero SQLite（itemData + fields + itemDataValues）

加载顺序：
  1. IOUtils.readJSON('read-only.json')  // 快速启动
  2. Zotero.DB.queryAsync(SQL)           // 权威数据覆盖
  3. resetDirty()                        // 标记干净
  4. setInterval(save, 10000)            // 每 10 秒自动保存
```

**为什么用双源：** 启动时先读 JSON 快速可用，再用 SQLite 权威数据覆盖。只读库（如群组库）的 citekey 缓存在 JSON 中，避免每次启动都查数据库。

### 2.2 Citekey 生成流程

```
KeyManager.propose(item)
  -> Formatter.format(item)                    // 按模板生成初始 citekey
  -> 冲突检测循环：
      for n = 0, 1, 2, ...:
        candidate = citationKey.replace(postfix.marker, postfix(n))
        if KeyManager.any(conflict): continue   // 与已有 citekey 冲突
        if mem.has(candidate): continue         // 本轮已生成过
        return candidate                        // 找到唯一键
```

**冲突检测条件：**

```typescript
function conflict(key: CitekeyRecord): boolean {
  return (keyscopeGlobal || key.libraryID === libraryID)  // 同作用域
    && key.itemID !== itemID                               // 不是自己
    && !different(key.citationKey, candidate)              // 大小写敏感/不敏感比较
}
```

**Postfix 去冲突：** 使用 Excel 列名风格（a, b, c, ..., aa, ab, ...）作为后缀，而不是数字后缀，避免与年份等数字字段混淆。

### 2.3 多语言转写

| 语言 | 转写策略 | 实现 |
|---|---|---|
| 日文 | 罗马音转写 | `key-manager/japanese.ts`（使用 kakasi 或类似工具） |
| 中文 | 拼音转写 | `key-manager/chinese.ts`（可选模式 `chinese-optional.ts`） |
| 西里尔 | 音译 | `key-manager/cyrillic.ts` |
| 阿拉伯 | 音译 | `key-manager/arabic.ts` |
| 其他 | `fold-to-ascii` + `transliteration` | 通用拉丁化 |

**CJK 字符识别：**

```typescript
const CJK = /([\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])/ug
```

### 2.4 批量操作保护

```typescript
if (replace && warn && Preference.warnBulkModify && items.length > Preference.warnBulkModify) {
  const index = Services.prompt.confirmOver(...)  // OK / Cancel / Don't ask again
  switch (index) {
    case 0: break      // OK — 继续
    case 2: Preference.warnBulkModify = 0; break  // 不再询问
    default: return    // Cancel
  }
}
```

### 2.5 事件驱动自动填充

```typescript
Events.on('items-changed', ({ data: { items, action, reason } }) => {
  for (const item of items) {
    this.autofill.schedule(item.id, () => { update(item) })
  }
})
```

`autofill` 是一个 `Scheduler<number>`，默认延迟 1000ms。用户快速编辑多个字段时，只在最后一次变化后生成 citekey，避免中间状态的无效计算。

## 3. Extra 字段解析

### 3.1 设计目标

Zotero 的 Extra 字段是自由文本，BBT 在其中编码了 BibTeX/LaTeX/CSL 的结构化数据：

```
Citation key: Smith2020
tex.year: 2020
tex.journal: Nature
shorttitle: Short Title
booktitle: Proceedings of the Conference
```

### 3.2 解析规则

| 模式 | 正则 | 含义 |
|---|---|---|
| **Citation Key** | `/^(citation[ -]?key|bibtex):(.*)/i` | 第一行的引用键 |
| **TeX 字段** | `/^(bib(?:la)?)?tex\.)"([^"]+)"\s*([:=])\s*(.*)/i` | `tex.field: value` |
| **KV 字段** | `/^([^:=]+)\s*([:=])\s*(.*)/i` | `field: value` 或 `field = value` |
| **别名列表** | 多条 citation key 行 | 旧 citekey 作为 alias 保留 |

**`:=` vs `=` 的区别：**

- `field: value` — 普通键值对（CSL 风格）
- `field = value` — LaTeX 风格

### 3.3 Fields 类型

```typescript
type Fields = {
  raw: Record<string, string>        // 原始键值对
  kv: Record<string, string>         // 普通 KV
  creator: Record<string, string[]>  // 创建者（按类型分组）
  creators: Creator[]                // 创建者列表
  tex: Record<string, TeXString>     // LaTeX 专用字段
  aliases: string[]                  // 别名（旧 citekey）
}
```

### 3.4 合并时的 Extra 保护

当 Zotero 合并重复项时，BBT 拦截 `Zotero.Items.merge`，保留 master 的 citekey 并收集 otherItems 的别名：

```typescript
monkey.patch(Zotero.Items, 'merge', original => async function Zotero_Items_merge(item, otherItems) {
  const extra = Extra.get(item.getField('extra'), 'zotero', { aliases: true, tex: true, kv: true })

  // 收集 otherItems 的 citekey 作为别名
  if (merge.citationKey) {
    extra.extraFields.aliases = [
      ...extra.extraFields.aliases,
      ...Zotero.BetterBibTeX.KeyManager.all(_ => otherIDs.includes(_.itemID))
        .map((key: CitekeyRecord) => key.citationKey),
    ]
  }

  // 合并 tex/kv 字段（不覆盖 master 已有值）
  for (const i of otherItems) {
    const otherExtra = Extra.get(i.getField('extra'), 'zotero', {...})
    for (const [name, value] of Object.entries(otherExtra.extraFields.tex)) {
      if (!extra.extraFields.tex[name]) extra.extraFields.tex[name] = value
    }
  }

  item.setField('extra', Extra.set(extra.extra, {
    aliases: merge.citationKey ? extra.extraFields.aliases : undefined,
    tex: merge.tex ? extra.extraFields.tex : undefined,
    kv: merge.kv ? extra.extraFields.kv : undefined,
  }))

  return await original.apply(this, arguments)
})
```

## 4. Monkey Patch 体系

### 4.1 通用 patch 机制

```typescript
class MonkeyPatcher {
  patches: Map<object, Map<string, { original: Function; replacement: Function }>>

  patch(target: object, methodName: string, factory: (original: Function) => Function) {
    const original = target[methodName]
    const replacement = factory(original)
    target[methodName] = replacement
    this.patches.set(target, new Map([[methodName, { original, replacement }]]))
  }

  enableAll() / disableAll()  // 可切换
}
```

### 4.2 关键 Patch 列表

| 目标 | 方法 | 目的 |
|---|---|---|
| `Zotero.Item.prototype` | `clone` | clone 时清空 citationKey，避免重复 |
| `Zotero.Items` | `merge` | 合并时保留 citekey 和 Extra 字段 |
| `Zotero.API` | `getResultsFromParams` | 支持 `@citekey` 格式的 API 查询 |
| `Zotero.DataObjects.prototype` | `parseLibraryKey` / `parseLibraryKeyHash` | 支持 citekey 解析 |
| `Zotero.Integration` | `getApplication` | 接入 CAYW（Word 插件集成） |
| `Zotero.Utilities.Internal` | `itemToExportFormat` | 修复导出格式 |
| `Zotero.Utilities.Internal` | `extractExtraFields` | BBT-JSON 导入时跳过 Extra 处理 |
| `Zotero.Translate.Export.prototype` | `translate` | 拦截导出，支持 Worker 路径和 AutoExport |

### 4.3 安全性设计

- **可禁用：** `monkey.enableAll()` / `monkey.disableAll()` 可随时开关
- **原始引用保留：** 每个 patch 都保留 `original`，可调用 `original.apply(this, arguments)` 回到原生行为
- **错误隔离：** patch 内部 try/catch，失败时直接调用 original
- **shutdown 清理：** 卸载时清除所有 Server Endpoints 和 monkey patches

## 5. 导出管线

### 5.1 主线程 vs Worker

```
Zotero.Translate.Export.translate() (monkey patched)
  ├── noWait 或无 worker → original.apply(this, arguments)  // 主线程
  └── 有 worker → Translators.queueJob({...})               // ChromeWorker
        -> Worker 初始化（chromeworker）
        -> 收集 items
        -> 生成 BibTeX/BibLaTeX
        -> 写文件
        -> 触发 cache-touch 事件
```

**Worker 失败降级：**

```typescript
if (useWorker && !Exporter.ready) {
  flash('failed to start a chromeworker')
  useWorker = false
}
// fallback to main thread
```

### 5.2 Sandbox 注入

BBT 向 Zotero 翻译器的 Sandbox 注入自定义方法：

```typescript
Zotero.Translate.Export.prototype.Sandbox.BetterBibTeX = {
  clientName: Zotero.clientName,
  clientVersion: Zotero.version,
  strToISO: (str) => DateParser.strToISO(str),
  getContents: (path) => Zotero.BetterBibTeX.getContents(path),
  generateBibLaTeX: (collected) => generateBibLaTeX(collected),
  generateBibTeX: (collected) => generateBibTeX(collected),
  generateCSLYAML: (collected) => generateCSLYAML(collected),
  generateCSLJSON: (collected) => generateCSLJSON(collected),
  generateBBTJSON: (collected) => generateBBTJSON(collected),
  parseDate: (date) => DateParser.parse(date),
}
```

这样 Zotero 内置翻译器可以调用 `BetterBibTeX.generateBibTeX(collected)` 而不需要 BBT 修改翻译器源码。

### 5.3 AutoExport

```typescript
if (this._export && displayOptions.keepUpdated) {
  void AutoExport.register({
    translatorID,
    displayOptions,
    scope: { type: 'collection' | 'library', ... },
    path: this.location.path,
  })
}
```

AutoExport 注册后，当注册范围内的 item 变化时，自动重新导出到指定路径。

## 6. 调度器（Scheduler）

### 6.1 核心设计

```typescript
class Scheduler<T> {
  private job: Map<T, Job & { id: T }> = new Map
  private held: Map<T, Handler> = null  // pause 缓冲区

  schedule(id: T, handler: Handler): void {
    this.cancel(id)  // 先取消已有定时器
    this.job.set(id, {
      id, start: Date.now(), handler,
      timer: setTimeout(this.run.bind(this), this.delay, id),
    })
  }

  set paused(paused: boolean) {
    if (paused) {
      this.held = new Map  // 新请求存入 held
    } else {
      for (const [id, handler] of this.held) this.schedule(id, handler)
      this.held = null
    }
  }
}
```

### 6.2 使用场景

| 场景 | 延迟 | 用途 |
|---|---|---|
| citekey 自动填充 | 1000ms | items-changed 后延迟生成 citekey |
| cache purge | Preference.autoExportIdleWait | 空闲时清理导出缓存 |
| column refresh | 500ms | 刷新 ItemTree 列显示 |

## 7. CAYW（Cite As You Write）集成

BBT 通过 monkey patch `Zotero.Integration.getApplication` 拦截 Word/LO 插件的集成请求：

```typescript
monkey.patch(Zotero.Integration, 'getApplication', original =>
  function(agent, _command, _docId) {
    if (agent === 'BetterBibTeX') return CAYW.Application
    return original.apply(this, arguments)
  })
```

这使得 BBT 可以提供自己的 citekey 查询接口，而不是依赖 Zotero 内置的集成方式。

## 8. JSON-RPC 服务

BBT 在 Zotero HTTP Server 上暴露 JSON-RPC 端点，供外部 LaTeX 编辑器查询 citekey：

```
POST /better-bibtex/json-rpc
{
  "jsonrpc": "2.0",
  "method": "item.search",
  "params": { "query": "Smith 2020" },
  "id": 1
}
```

这使得 TeXstudio、VS Code LaTeX 插件等可以在不操作 Zotero UI 的情况下查询文献信息。

## 9. 可借鉴点

### 9.1 可借鉴的架构模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **双源缓存（JSON + SQLite）** | 启动时需要快速加载大量元数据 | 中——需要处理数据一致性 |
| **Scheduler 防抖** | 高频事件后的延迟执行 | 低——通用工具类 |
| **Monkey Patch 可切换** | 需要拦截宿主行为但保持可逆 | 中——需要维护 original 引用 |
| **Extra 字段结构化解析** | 在自由文本中编码结构化数据 | 低——正则解析即可 |
| **Sandbox 注入** | 向第三方翻译器注入自定义方法 | 低——Zotero 原生支持 |
| **Postfix 去冲突** | 键名冲突时用字母后缀而非数字 | 低——Excel 列名算法 |
| **多语言转写管线** | citekey 需要支持非拉丁字符 | 中——需要各语言的转写库 |
| **合并时 Extra 保护** | 合并重复项时保留结构化字段 | 中——需拦截宿主 merge |

### 9.2 citekey 模板编译

BBT 使用类似 Mustache 的模板语法，支持字段引用、过滤器、条件：

```
[auth][year] -> Smith2020
[auth:lower][year] -> smith2020
[auth][year][suffix] -> Smith2020a
```

如果模板需要可配置的标识符生成，这是一个成熟的参考实现。

### 9.3 与当前模板的结合点

- 如果未来模板需要**引用键/标识符生成**，可直接复用 KeyManager 的双源缓存 + Scheduler 模式
- 如果需要**拦截宿主行为**，可复用 monkey-patch 的可切换机制
- 如果需要**导出多种格式**，可复用 Sandbox 注入模式，不修改翻译器源码
- 如果需要**外部编辑器集成**，可复用 JSON-RPC 服务模式

## 10. 不可直接搬运的部分

| 内容 | 原因 | 处理方式 |
|---|---|---|
| 具体 citekey 模板编译逻辑 | 依赖 BBT 特有模板语法和大量边缘 case | 只借鉴模板编译思路，不复制 parser |
| 多语言转写库（kakasi 等） | 日文/中文转写依赖外部工具和大量词库 | 按需引入对应转写库 |
| `compromise/one` NLP 库 | 用于标题句法分析，体积较大 | 如不需要 sentence case 可省略 |
| CAYW Word 集成 | 依赖 Zotero Integration API | 只在需要 Word 插件集成时参考 |
| `node-eta` 进度估算 | 依赖外部 npm 包 | 用简单进度条替代 |
| TeXstudio 集成 | 特定编辑器的专有协议 | 不搬运 |
| `fold-to-ascii` / `punycode2` | 特定转写依赖 | 按需引入 |

## 11. 相关参考

- [Zotero 翻译器架构](https://www.zotero.org/support/dev/translators)
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) — 宿主接口
- [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) — 通用技术链
- [REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md](./REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md) — BBT 也拦截了 merge 事件
