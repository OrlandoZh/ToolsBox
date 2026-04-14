# REFERENCE_DUPLICATE_WORKFLOW_PATTERNS.md

> 参考来源：`reference/plugin/zoplicate/`（zoplicate）
> 用途：Zotero 文献去重与合并工作流的架构模式沉淀
> 最后更新：2026-04-12

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：zoplicate 源码](../reference/plugin/zoplicate/)

## 1. 核心架构概览

zoplicate 围绕三个核心类构建去重管线：

| 类 | 职责 | 行数 |
|---|---|---|
| `DuplicateFinder` | 级联候选消除算法（6 阶段 SQL 查询） | `src/db/duplicateFinder.ts` |
| `DuplicateItems` | 重复组管理 + Master Item 选择策略 | `src/modules/duplicateItems.ts` |
| `BulkDuplicates` | 批量合并单例 + 暂停/恢复/回退 + 进度 UI | `src/modules/bulkDuplicates.ts` |

辅助模块：

| 模块 | 职责 |
|---|---|
| `merger.ts` | 包装 `Zotero.Items.merge`，保护 master 属性不被覆盖 |

数据流：

```
DuplicateFinder.findDuplicates()
  -> 返回 Set<number>（重复项 ID 集合）
  -> DuplicateItems（按组聚类，选择 master）
  -> merge(masterItem, otherItems)（单组合并）
  -> BulkDuplicates.bulkMergeDuplicates()（批量遍历 + 进度 UI + 暂停/恢复）
```

## 2. 级联候选消除算法

### 2.1 算法设计

核心思想：**从全集开始，每阶段用更宽松的条件收窄候选集，候选数降到 1 时提前返回。**

```
Stage 0: 全库所有 item（WHERE itemID > 0）
Stage 1: dc:replaces 关系匹配
Stage 2: DOI 匹配
Stage 3: ISBN 匹配（仅 book 类型）
Stage 4: 标题匹配
Stage 5: 作者匹配（主创建者类型必须相同）
Stage 6: 年份匹配
  -> 返回最终候选集
```

每个阶段：

```typescript
private async stageX(currentCandidates: Set<number>): Promise<Set<number>> {
  if (currentCandidates.size <= 1) return currentCandidates;  // 提前终止

  const candidates = await this.findByX(currentCandidates);
  return this.groupAndFilter(candidates);  // 只保留 >= 2 个一组的项
}
```

### 2.2 各阶段匹配策略

| 阶段 | 匹配条件 | SQL 模式 | 提前终止条件 |
|---|---|---|---|
| **dc:replaces** | `dc:replaces` RDF 谓词关联 | `JOIN items ON subjectItemID = ? JOIN itemData...` | 无匹配或仅 1 个 |
| **DOI** | DOI 字段 / URL 包含 / extra 字段 | `LIKE '%doi.org/xxx%'` / `LIKE 'doi: %'` | 无匹配 |
| **ISBN** | ISBN 字段（去连字符） | 仅 `book` 类型，`LIKE '%xxx%'` | 非 book 类型直接跳过 |
| **标题** | 标题字段模糊匹配 | `title LIKE 'normalized_title%'` | 无匹配 |
| **作者** | 主创建者类型 + 姓名匹配 | `JOIN creators ON itemID = ? WHERE typeID = primaryCreatorType` | 主类型不匹配 |
| **年份** | 年份 ± 阈值 | `itemData.value LIKE '%year%'` | 无匹配 |

### 2.3 关键设计决策

**为什么用级联而不是单条件匹配：**

- 单条件（如仅 DOI）漏检率高——很多文献没有 DOI
- 全条件 OR  union 误报率高——标题近似但实际不同的文献会被误判
- 级联 AND 收紧：每阶段只在前一阶段候选集内继续过滤，最终结果精确度高

**SQL 优化：**

```typescript
// 用 IN 子句限制候选范围，而不是全表扫描
const query = `
  SELECT itemID FROM items
  WHERE itemID IN (${placeholders})  -- 只搜当前候选
    AND title LIKE ?
`;
```

**主创建者类型保护：**

```typescript
// 不同文献类型的主创建者类型不同（author vs editor vs director）
// 只在同类型文献间做作者匹配，避免跨类型误判
const primaryCreatorType = Zotero.CreatorTypes.getPrimaryIDForType(itemTypeID);
```

### 2.4 与 Zotero 内置去重的对比

| 维度 | Zotero 内置 | zoplicate |
|---|---|---|
| 检测时机 | 用户手动点击 "Find Duplicates" | 可自动/手动触发 |
| 匹配条件 | 标题 + 作者 + 年份（固定） | 6 阶段级联，逐层收紧 |
| 关系感知 | 不感知 `dc:replaces` | 第一阶段优先检查 |
| ISBN 匹配 | 无 | 有（仅 book 类型） |
| DOI 模糊匹配 | 精确匹配 | URL/extra 字段也搜索 |
| Master 选择 | 固定逻辑 | 4 种策略可选 |
| 批量操作 | 逐个手动确认 | 批量 + 暂停/恢复/回退 |

## 3. Master Item 选择策略

### 3.1 四种策略

```typescript
enum MasterItem {
  OLDEST,    // dateAdded 最早的（默认，假设最早录入的是原始来源）
  NEWEST,    // dateAdded 最新的
  MODIFIED,  // dateModified 最新的
  DETAILED,  // 字段最丰富的（usedFields 数量最多）
}
```

### 3.2 比较函数实现

| 策略 | 比较逻辑 | 次级排序 |
|---|---|---|
| OLDEST | `b.dateAdded < a.dateAdded ? 1 : -1` | 无 |
| NEWEST | `b.dateAdded > a.dateAdded ? 1 : -1` | 无 |
| MODIFIED | `b.dateModified > a.dateModified ? 1 : -1` | 无 |
| DETAILED | `b.getUsedFields(false).length - a.getUsedFields(false).length` | 相同时按 OLDEST |

### 3.3 DETAILED 策略的 fallback

```typescript
case MasterItem.DETAILED:
  compare = (a, b) => {
    const fieldDiff = b.getUsedFields(false).length - a.getUsedFields(false).length;
    if (fieldDiff !== 0) return fieldDiff;
    return b.dateAdded < a.dateAdded ? 1 : -1;  // fallback 到 OLDEST
  };
```

字段数相同时回退到 OLDEST，确保排序稳定（deterministic），不会出现相同分数项的随机排列。

### 3.4 Group Identifier

```typescript
get key(): number {
  return this._smallestItemID;  // 组内最小 itemID 作为组标识
}
```

这个设计与 Zotero 内置去重组标识一致，便于 UI 层去重列表的稳定排序和缓存。

## 4. 合并逻辑

### 4.1 属性保护

```typescript
const { relations, collections, tags, ...keep } = candidateJSON;
masterItem.fromJSON({ ...keep, ...masterJSON });
```

**排除 `relations`/`collections`/`tags` 的原因：**

- 这些属性在 `candidateJSON`（从 otherItems 聚合而来）中通常是空或默认值
- 如果不排除，`fromJSON` 会用空值覆盖 master 的真实数据
- 这与 Zotero 官方 `duplicatesMerge.js` 的策略一致

### 4.2 类型过滤

```typescript
otherItems = otherItems.filter((item) => item.itemTypeID === masterItemType);
```

合并前过滤掉与 master 不同类型的项目，避免跨类型合并导致数据损坏。

### 4.3 调用 Zotero 原生合并

```typescript
return await Zotero.Items.merge(masterItem, otherItems);
```

`Zotero.Items.merge` 是 Zotero 宿主的权威合并方法，负责：

- 将 otherItems 的附件、笔记、标签迁移到 master
- 删除 otherItems
- 更新相关索引和缓存

zoplicate 不重新实现合并逻辑，而是做预处理（JSON 合并 + 属性保护）后交给宿主。

## 5. 批量合并工作流

### 5.1 状态机

```
          [点击合并按钮]
               |
               v
          [确认对话框]
               |
               v
        +--> [isRunning = true] <--+
        |          |               |
        |    [遍历重复组]           |
        |          |               |
        |   [merge 单组]           |
        |          |               |
        |    [更新进度]            |
        |          |               |
        |   [检查 isRunning] ------+ (用户点击暂停 -> false)
        |          |
        |    [全部完成]
        |          |
        v          v
     [暂停对话框]  [成功提示]
        |
    +---+---+
    |       |
 [继续]   [取消]
            |
      +-----+-----+
      |           |
   [不回退]    [回退所有]
```

### 5.2 暂停/恢复机制

```typescript
// 每次迭代检查是否被暂停
if (!this._isRunning) {
  const result = Zotero.Prompt.confirm({
    title: "批量合并已暂停",
    text: "是否继续？",
    button0: "继续",
    button1: "取消",
    checkbox: restoreCheckbox,  // "恢复已合并的项目"
  });
  if (result == 0) {
    this.isRunning = true;  // 恢复
  } else {
    toCancel = true;
    break;
  }
}
```

### 5.3 回退机制

```typescript
if (toCancel && restoreCheckbox.value) {
  // 逆序恢复（先恢复最后合并的，避免 ID 冲突）
  for (let i = deletedItems.length - 1; i >= 0; i--) {
    const item = deletedItems[i];
    item.deleted = false;
    await item.saveTx();
  }
}
```

**逆序恢复的原因：** `Zotero.Items.merge` 会将被合并项标记为 deleted。逆序恢复确保恢复顺序与删除顺序相反，降低中间状态不一致的风险。

### 5.4 进度 UI

```typescript
const popWin = new ztoolkit.ProgressWindow("去重进度", {
  closeOnClick: false,
  closeTime: -1,  // 不自动关闭
})
  .createLine({ text: "准备中...", type: "default", progress: 0 })
  .show();

// 每处理一组更新进度
popWin.changeLine({
  text: `正在处理: ${truncateString(duItems.itemTitle)}`,
  progress: Math.floor((i / duplicateItems.length) * 100),
});

// 完成后
popWin.changeLine({ text: "完成", type: "success", progress: 100 });
popWin.startCloseTimer(5000);  // 5 秒后自动关闭
```

### 5.5 已处理项跟踪

```typescript
const processedItems: Set<number> = new Set();

// 每组合并后记录所有涉及项
items.forEach((id) => processedItems.add(id));

// 跳过已处理的项
if (processedItems.has(duplicateItem)) continue;
```

`duplicatesObj.getSetItemsByItemID(duplicateItem)` 返回的是整个重复组的 ID 列表，不同组的查询可能返回重叠结果。`processedItems` 确保每组只合并一次。

## 6. UI 事件集成

### 6.1 按钮可见性控制

```typescript
activeItemsView()?.onSelect.addListener(async () => {
  await updateDuplicateButtonsVisibilities(win);
});
```

批量合并按钮只在以下场景显示：

- 当前在重复项视图（`isInDuplicatesPane()`）
- 当前库有重复项

### 6.2 运行中保护

```typescript
activeCollectionsView()?.onSelect.addListener(async () => {
  if (Zotero.getActiveZoteroPane().itemsView && inDuplicatePane && this._isRunning) {
    await activeItemsView()?.waitForLoad();
    activeItemsView()?.selection.clearSelection();  // 禁止选中
  }
});
```

批量合并运行时，清空选择防止用户在合并过程中操作项目树。

## 7. 可借鉴点

### 7.1 可借鉴的架构模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **级联候选消除** | 任何多条件模糊匹配/去重场景 | 中——需要设计阶段顺序和提前终止条件 |
| **多策略 Master 选择** | 需要用户选择"保留哪个"的合并场景 | 低——本质是排序比较函数 |
| **属性保护合并** | 包装宿主合并方法时防止数据丢失 | 低——排除关键字段即可 |
| **暂停/恢复/回退** | 长时间运行的批量操作 | 中——需要状态管理和逆序回退 |
| **已处理项去重** | 遍历可能重叠的集合 | 低——Set 跟踪即可 |
| **ProgressWindow 进度** | 任何需要用户反馈的长操作 | 低——zotero-plugin-toolkit 封装 |

### 7.2 SQL 去重查询模式

```sql
-- 候选集内过滤（避免全表扫描）
SELECT itemID FROM items
WHERE itemID IN (?, ?, ?, ...)
  AND field LIKE '%value%'

-- 主创建者类型保护
SELECT c.itemID FROM creators c
JOIN itemCreators ic ON c.creatorID = ic.creatorID
WHERE ic.itemID IN (?, ?, ...)
  AND ic.creatorTypeID = ?  -- primaryCreatorType
```

### 7.3 与当前模板的结合点

- 如果未来模板需要**文献去重功能**，可以直接复用级联消除算法
- 如果未来模板需要**批量操作 + 进度 UI**，可复用 BulkDuplicates 的状态机模式
- 如果未来模板需要**合并策略可配置**，可复用 MasterItem 枚举 + 比较函数模式

## 8. 不可直接搬运的部分

| 内容 | 原因 | 处理方式 |
|---|---|---|
| 具体 SQL 查询语句 | 依赖 Zotero 内部表结构 | 只借鉴模式，按实际宿主 schema 重写 |
| `ztoolkit.ProgressWindow` | 依赖 zotero-plugin-toolkit | 替换为模板自己的进度 UI 方案 |
| `Zotero.Items.merge` | Zotero 宿主权威方法 | 只在确认宿主 API 存在时使用 |
| `duplicatesObj.getSetItemsByItemID` | Zotero 内置去重对象 | 需要确认当前 Zotero 版本 API |
| `Zotero.Prompt.confirm` | Zotero 7.x 新版 prompt API | 按宿主版本选择正确的 prompt 接口 |

## 9. 相关参考

- [Zotero 官方去重实现](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/elements/duplicatesMergePane.js)
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) — 宿主去重相关接口
- [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) — 通用技术链
