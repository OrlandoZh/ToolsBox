# REFERENCE_ZOPLICATE_PATTERNS.md

> 参考来源：`reference/plugin/zoplicate/`（Zoplicate，作者 MuiseDestiny）
> 用途：Zotero 重复条目检测、合并、非重复标记的架构模式沉淀
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：zoplicate 源码](../reference/plugin/zoplicate/)

## 1. 核心架构概览

Zoplicate 是一个重复条目管理插件，核心职责是：**导入时重复检测、全库批量去重合并、用户标记非重复对排除、重复计数在分类树中展示**。

与 attanger 关注**附件文件操作**不同，zoplicate 关注的是**条目元数据层面的重复识别与合并**。两者都操作 Zotero 条目，但层面不同：attanger 处理附件文件，zoplicate 处理文献条目本身。

### 1.1 源码文件索引

| 文件 | 职责 | 说明 |
|---|---|---|
| `src/index.ts` | 入口引导 | 全局 `addon`/`ztoolkit` 对象注入 |
| `src/addon.ts` | 插件实例类 | 全局状态容器（dialogs, duplicateSets, duplicateCounts 等） |
| `src/hooks.ts` | 生命周期钩子 | 调度钩子，将事件分发到各模块 |
| `src/db/db.ts` | SQLite 抽象基类 | 封装 `Zotero.DBConnection` |
| `src/db/duplicateFinder.ts` | 多策略重复检测 | 渐进式候选过滤（dc:replaces → DOI → ISBN → 标题 → 作者 → 年份） |
| `src/db/nonDuplicates.ts` | 非重复对存储 | SQLite 持久化用户标记的非重复条目对 |
| `src/modules/duplicateItems.ts` | 重复分组与主条目选择 | 4 种 Master Item 选择策略 |
| `src/modules/duplicates.ts` | 导入时检测对话框 | 导入时弹出 HTML 表格让用户选择保留/丢弃 |
| `src/modules/bulkDuplicates.ts` | 批量合并 + 暂停/恢复 | 全库遍历合并，支持暂停、恢复、回退已合并项 |
| `src/modules/merger.ts` | 核心合并逻辑 | 字段数据智能合并后委托 `Zotero.Items.merge` |
| `src/modules/nonDuplicates.ts` | 非重复 UI | 条目面板中的非重复列表、右键菜单标记/取消 |
| `src/modules/patcher.ts` | 核心方法补丁 | 补丁 `_findDuplicates`、`getSearchObject`、`_saveData` |
| `src/modules/duplicateStats.ts` | 重复计数显示 | 补丁 `collectionsView.renderItem` 显示 `unique/total` |
| `src/modules/menus.ts` | 上下文菜单 | 标记/取消非重复、刷新重复统计 |
| `src/modules/notifier.ts` | 事件观察者 | 注册 item/trash/collection/sync 事件 |
| `src/modules/preferenceScript.ts` | 偏好面板 | 操作和主条目策略配置 |
| `src/utils/duplicates.ts` | 重复工具函数 | `fetchDuplicates`、`areDuplicates`、`fetchAllDuplicates` |
| `src/utils/locale.ts` | 国际化 | Fluent FTL |
| `src/utils/prefs.ts` | 偏好读写 | `getPref`/`setPref` 包装 + `Action`/`MasterItem` 枚举 |
| `src/utils/utils.ts` | 通用工具 | 字符串规范化、创建者清理、DOI/ISBN 清理 |
| `src/utils/view.ts` | UI 工具 | 按钮显隐控制、兄弟节点移除 |
| `src/utils/wait.ts` | 轮询等待 | `waitUntil`/`waitUntilAsync` |
| `src/utils/window.ts` | 窗口工具 | 样式注册、窗口存活检测 |
| `src/utils/zotero.ts` | Zotero 工具 | 跳转到重复面板、刷新条目树 |
| `src/utils/ztoolkit.ts` | ztoolkit 初始化 | `MyToolkit` 扩展 `BasicTool` |

源码文件总计 **25 个 TS 文件**。

### 1.2 数据流概览

```
导入时检测层：
  新条目导入 -> DuplicateFinder.findByDcReplacesRelation()
             -> findByDOI()
             -> findBookByISBN()
             -> findByTitle()
             -> findByCreators()
             -> findByYear()
             -> 发现重复 -> 弹出 Duplicates 对话框 -> 用户选择动作 -> 合并/丢弃

全库扫描层：
  用户点击 Bulk Merge -> fetchAllDuplicates() -> 遍历重复组
                      -> 选择主条目 (MasterItem 策略)
                      -> 合并字段数据 -> Zotero.Items.merge()
                      -> 暂停/恢复/回退状态机

非重复排除层：
  用户标记非重复 -> NonDuplicatesDB 存储对称对 (min, max)
                 -> patcher 拦截 DisjointSetForest.union() 跳过排除对
```

## 2. 渐进式候选过滤（Progressive Narrowing）

### 2.1 DuplicateFinder 类

文件：`src/db/duplicateFinder.ts`

核心设计：**每个过滤步骤直接查询 Zotero 内部 SQLite 表，逐步缩小候选集，候选数降为 1 时提前终止**。

```typescript
class DuplicateFinder {
  candidateItemIDs: number[];

  // 每步返回 this，支持链式调用
  findByDOI(): this {
    if (this.candidateItemIDs.length === 1) return this;
    // 直接查 itemDataValues 表
    const rows = this.db.selectAllRows(`
      SELECT itemID FROM itemDataValues
      JOIN itemData USING (itemID)
      WHERE TRIM(UPPER(value)) LIKE ?
    `, [`%${normalizedDOI}%`]);
    this.candidateItemIDs = intersect(this.candidateItemIDs, rows.map(r => r.itemID));
    return this;
  }
  // findByTitle(), findByCreators(), findByYear() 同理...
}

// 链式调用
const finder = new DuplicateFinder(item);
finder.findByDcReplacesRelation()
      .findByDOI()
      .findBookByISBN()
      .findByTitle()
      .findByCreators()
      .findByYear();
```

### 2.2 过滤阶段优先级

| 阶段 | 信号类型 | 精确度 | 性能 | 说明 |
|---|---|---|---|---|
| 1. `dc:replaces` | 版本替换关系 | 最高 | 最快 | BFS 遍历版本历史，最精确信号 |
| 2. DOI | 数字对象标识符 | 高 | 快 | 查 `itemDataValues`，支持 DOI/URL/extra |
| 3. ISBN | 图书标识符 | 高 | 快 | 仅图书类型，去除连字符后匹配 |
| 4. 标题 | 文本匹配 | 中 | 中 | 规范化字符串比较，去除非字母字符 |
| 5. 作者 | 创建者匹配 | 中 | 中 | 只需**一个**作者匹配（非全部） |
| 6. 年份 | 时间窗口 | 低 | 慢 | 前后 ±1 年容差，`SUBSTR(value, 1, 4)` |

**为什么高效**：最精确的信号先跑，如果已经唯一定位，跳过后续昂贵的字符串比较。

### 2.3 直接 SQL 查询模式

```typescript
// 查 DOI/URL/extra 中的匹配值
this.db.selectAllRows(`
  SELECT itemID FROM itemDataValues
  JOIN itemData USING (itemID)
  JOIN fields USING (fieldID)
  WHERE TRIM(UPPER(value)) LIKE ?
    AND fields.fieldName IN ('DOI', 'url', 'extra')
`, [`%${normalizedDOI}%`]);

// 查作者名匹配
this.db.selectAllRows(`
  SELECT DISTINCT itemID FROM itemCreators
  JOIN creators USING (creatorID)
  WHERE TRIM(UPPER(firstName)) LIKE ?
    AND TRIM(UPPER(lastName)) LIKE ?
    AND primaryCreatorTypeID = ?
`, [`${firstName}%`, `${lastName}%`, primaryCreatorTypeID]);

// 查年份范围
this.db.selectAllRows(`
  SELECT itemID FROM itemDataValues
  JOIN itemData USING (itemID)
  JOIN fields USING (fieldID)
  WHERE ABS(CAST(SUBSTR(value, 1, 4) AS INTEGER) - ?) <= 1
    AND fields.fieldName = 'date'
`, [year]);
```

## 3. DisjointSetForest 拦截模式

### 3.1 原理

Zotero 原生使用 `Zotero.DisjointSetForest`（并查集）来分组重复条目。zoplicate 不替换 Zotero 的检测逻辑，而是**拦截 `union` 操作**，跳过用户标记为非重复的对。

```typescript
// patcher.ts: 补丁 _findDuplicates
const originalUnion = Zotero.DisjointSetForest.prototype.union;
Zotero.DisjointSetForest.prototype.union = function (i, j) {
  const nonDupPairs = addon.data.nonDuplicatesDB.getAllPairs();
  if (nonDupPairs.has(`${Math.min(i, j)}-${Math.max(i, j)}`)) {
    return; // 跳过这个 union 操作
  }
  return originalUnion.call(this, i, j);
};
```

### 3.2 对称对存储

```typescript
// nonDuplicates.ts: 始终按 min-max 顺序存储
async function addPair(itemID: number, itemID2: number) {
  const a = Math.min(itemID, itemID2);
  const b = Math.max(itemID, itemID2);
  await db.runAsync('INSERT OR IGNORE INTO nonDuplicates VALUES (?, ?)', [a, b]);
}
```

### 3.3 批量操作

```typescript
// 批量插入/删除，避免 SQLite 参数限制
async function batchInsert(pairs: [number, number][], batchSize = 100) {
  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);
    const placeholders = batch.map(() => '(?, ?)').join(', ');
    const params = batch.flat();
    await db.runAsync(`INSERT OR IGNORE INTO nonDuplicates VALUES ${placeholders}`, params);
  }
}
```

## 4. 搜索对象缓存模式

### 4.1 缓存 + 显式失效

```typescript
// patcher.ts: 补丁 getSearchObject
function getSearchObject() {
  const libraryID = this.libraryID;
  if (
    addon.data.needResetDuplicateSearch[libraryID] ||
    !addon.data.duplicateSearchObj[libraryID]
  ) {
    // 重新构建搜索对象
    addon.data.duplicateSearchObj[libraryID] = createNewSearchObject();
    addon.data.needResetDuplicateSearch[libraryID] = false;
  }
  return addon.data.duplicateSearchObj[libraryID];
}
```

### 4.2 失效触发点

- 合并操作完成后
- 条目修改（创建者或 itemData 变化）
- 用户手动刷新

```typescript
// patcher.ts: 补丁 _saveData
// 当条目被保存且其父条目被删除（被合并）时：
if (parentItem?.deleted) {
  // 重新查找子项的新父项
  const newParent = await DuplicateFinder.findNewParent(childItem);
  if (newParent) {
    childItem.parentID = newParent.id;
    await childItem.saveTx();
  }
}
```

## 5. 导入时检测对话框

### 5.1 HTML 表格对话框

文件：`src/modules/duplicates.ts`

导入时如果发现重复，弹出 HTML 表格：

| 标题 | 保留新 | 保留旧 | 全部保留 |
|---|---|---|---|
| Paper A (2024) | ○ | ● | ○ |
| Paper B (2024) | ● | ○ | ○ |

- 列头有单选按钮可**全选该列动作**
- 每行独立选择保留/丢弃/取消
- "默认使用此动作"复选框：当所有行选择相同时出现
- 最大高度 500px，超出可滚动

### 5.2 对话框复用

```typescript
// 如果对话框已打开，新重复到达时更新表格而非新建
if (addon.data.dialogs.dialog) {
  addon.data.dialogs.dialog.updateTable(newDuplicates);
} else {
  addon.data.dialogs.dialog = new DuplicatesDialog(duplicates);
}
```

### 5.3 动作映射

```typescript
enum Action {
  KEEP = 'keep',      // 保留新导入的
  DISCARD = 'discard', // 保留已有的
  CANCEL = 'cancel'    // 两个都保留
}

// 处理动作
async function processAction(itemID: number, action: Action) {
  switch (action) {
    case Action.KEEP:
      // 合并旧条目到新条目
      await mergeItems(newItem, [oldItem]);
      break;
    case Action.DISCARD:
      // 保持原样，新条目被丢弃
      break;
    case Action.CANCEL:
      // 两个都保留，标记为非重复
      await markAsNonDuplicates(newItem, oldItem);
      break;
  }
}
```

## 6. 批量合并：暂停/恢复模式

### 6.1 状态控制

文件：`src/modules/bulkDuplicates.ts`

```typescript
class BulkDuplicates {
  private _isRunning = false;

  async bulkMerge() {
    this._isRunning = true;
    const processedItems = new Set<number>();
    const deletedItems: Zotero.Item[] = [];

    const duplicateItems = await fetchAllDuplicates();
    for (const item of duplicateItems) {
      if (!this._isRunning) {
        // 用户点击了暂停
        const result = await showSuspendDialog(deletedItems);
        if (result === 'resume') {
          this._isRunning = true;
          continue;
        } else if (result === 'cancel') {
          if (result.restoreDeleted) {
            // LIFO 顺序恢复已删除条目
            for (let i = deletedItems.length - 1; i >= 0; i--) {
              deletedItems[i].deleted = false;
              await deletedItems[i].saveTx();
            }
          }
          break;
        }
      }

      if (processedItems.has(item.id)) continue;
      processedItems.add(item.id);

      const master = await selectMasterItem(duplicateGroup);
      const others = duplicateGroup.filter(i => i.id !== master.id);
      await mergeFields(master, others);
      await Zotero.Items.merge(master, others);

      deletedItems.push(...others);
      others.forEach(o => processedItems.add(o.id));
    }

    this._isRunning = false;
    addon.data.needResetDuplicateSearch[libraryID] = true;
    refreshItemTree();
  }
}
```

### 6.2 UI 保护

合并运行时阻止用户交互干扰：

```typescript
// 运行中：清空选择
if (this._isRunning) {
  collectionsView.onSelect = () => {
    collectionsView.clearSelection();
  };
  itemsView.onRefresh = () => {
    itemsView.clearSelection();
  };
}
```

### 6.3 按钮切换

同一个按钮在运行/暂停间切换：
- 未运行：图标 `merge`，标签 `Bulk Merge`
- 运行中：图标 `pause`，标签 `Suspend`

## 7. 核心合并逻辑

### 7.1 智能字段合并

文件：`src/modules/merger.ts`

在调用 `Zotero.Items.merge()` 之前，先从候选条目向主条目填充缺失字段：

```typescript
async function mergeFields(masterItem: Zotero.Item, otherItems: Zotero.Item[]) {
  for (const other of otherItems) {
    // Zotero.Items.merge 原生处理：
    // - relations
    // - collections
    // - tags
    // 这里只补充缺失的字段数据
    for (const field of other.getFields()) {
      if (!masterItem.getField(field)) {
        masterItem.setField(field, other.getField(field));
      }
    }
    // 补充创建者
    for (const creator of other.getCreators()) {
      if (!masterItem.getCreators().includes(creator)) {
        masterItem.addCreator(creator);
      }
    }
  }
  await masterItem.saveTx();
}
```

### 7.2 主条目选择策略

```typescript
enum MasterItem {
  OLDEST = 'oldest',      // dateAdded 最早的
  NEWEST = 'newest',      // dateAdded 最新的
  MODIFIED = 'modified',  // 最后修改的
  DETAILED = 'detailed'   // 字段最多的（getUsedFields().length，dateAdded 作为平局决胜）
}
```

## 8. 重复计数在分类树中显示

### 8.1 补丁 collectionsView.renderItem

文件：`src/modules/duplicateStats.ts`

```typescript
ztoolkit.patch(
  collectionsView,
  'renderItem',
  config.addonRef,
  (original) => async function (index, selection, oldDiv, oldData) {
    const result = await original.call(this, index, selection, oldDiv, oldData);
    const row = this.getRow(index);
    if (row.ref instanceof Zotero.Search && row.ref.name === 'Duplicate Items') {
      const stats = getDuplicateStats(libraryID);
      const countSpan = document.createElement('span');
      countSpan.textContent = ` (${stats.unique}/${stats.total})`;
      countSpan.title = getDetailedTooltip(stats);
      result.div.appendChild(countSpan);
    }
    return result;
  }
);
```

## 9. 非重复侧边面板

### 9.1 ItemPaneManager 注册

文件：`src/modules/nonDuplicates.ts`

```typescript
Zotero.ItemPaneManager.registerSection({
  paneID: 'nonDuplicates',
  pluginID: config.addonID,
  header: { l10nID: 'non-duplicates-title' },
  sidenav: { icon: 'url(...)', l10nID: 'non-duplicates-sidenav' },
  onRender: async (props) => {
    const item = props.item;
    const nonDupItems = getNonDuplicateItemsFor(item);
    // 渲染列表，每行有 "-" 按钮可移除
    // "+" 按钮通过 selectItemsDialog 添加更多非重复对
  },
});
```

## 10. Notifier 事件分发

### 10.1 事件队列

```typescript
// notifier.ts: 主窗口加载前的事件排队
const eventQueue: Array<{ event: string; type: string; ids: number[] }> = [];

Zotero.Notifier.registerObserver({
  notify: async (event, type, ids) => {
    if (!Zotero.MainWindow) {
      eventQueue.push({ event, type, ids });
      return;
    }
    processEvent(event, type, ids);
  }
}, ['item', 'trash', 'collection', 'sync']);

// 主窗口加载后处理队列
window.setTimeout(() => {
  while (eventQueue.length > 0) {
    const { event, type, ids } = eventQueue.shift()!;
    processEvent(event, type, ids);
  }
}, 500);
```

## 11. 可借鉴的架构模式

### 11.1 可借鉴的模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **渐进式候选过滤** | 需要多级精度匹配的场景（搜索、推荐、去重） | 中 —— 需要设计过滤阶段优先级 |
| **直接 SQL 查询 Zotero 内部表** | 需要高性能查询的场景 | 中 —— 需要了解 `itemDataValues`、`itemCreators` 等表结构 |
| **DisjointSetForest 拦截** | 需要在宿主原生分组逻辑上做排除/过滤 | 中 —— 需要理解并查集算法 |
| **对称对存储（min-max）** | 无向关系对的持久化 | 低 —— 始终按 `min(a,b)-max(a,b)` 存储 |
| **批量 SQLite 操作** | 大量插入/删除避免参数限制 | 低 —— 分批 100 条 + `INSERT OR IGNORE` |
| **搜索对象缓存 + 显式失效** | 昂贵查询结果的缓存策略 | 低 —— `needReset` 标志 + 条件重建 |
| **导入时检测对话框** | 导入时实时发现并处理冲突 | 中 —— HTML 表格 + 对话框复用 |
| **批量合并暂停/恢复** | 长时间运行的批量操作 | 中 —— `_isRunning` 状态机 + LIFO 回退 |
| **UI 保护（清空选择）** | 运行中防止用户交互干扰 | 低 —— 覆盖 `onSelect`/`onRefresh` |
| **智能字段合并** | 合并前补充缺失字段 | 低 —— 遍历字段填充空值 |
| **4 种主条目选择策略** | 合并时选择保留哪个版本 | 低 —— 比较 `dateAdded`/`getUsedFields().length` |
| **事件队列（主窗口加载前）** | 早期事件不丢失 | 低 —— 数组队列 + setTimeout 延迟处理 |

### 11.2 与当前模板的结合点

- 如果模板需要**重复文献检测**，可直接复用 `DuplicateFinder` 的渐进式过滤管线
- 如果模板需要**批量合并操作**，可复用暂停/恢复状态机模式
- 如果模板需要**用户排除某些"看起来重复但实际不是"的对**，可复用 DisjointSetForest 拦截 + 对称对存储模式
- 如果模板需要**导入时冲突处理**，可复用 HTML 表格对话框模式

## 12. 不可直接搬运的部分

| 内容 | 原因 | 处理方式 |
|---|---|---|
| `Zotero.DisjointSetForest.prototype.union` 补丁 | 依赖 Zotero 内部实现 | 需确认目标版本是否存在此 API |
| 直接 SQL 查询 `itemDataValues` 等 | 依赖 Zotero 内部 SQLite schema | 需确认表结构稳定性 |
| `Zotero.Items.merge()` | Zotero 宿主内置合并 | 确认宿主 API 存在即可使用 |
| `collectionsView.renderItem` 补丁 | 依赖 Zotero 内部视图实现 | 需确认视图 API 稳定性 |
| `Zotero.ItemPaneManager.registerSection` | Zotero 7 面板 API | 确认目标版本支持 |
| `ztoolkit.patch()` | 依赖 zotero-plugin-toolkit | 替换为模板自己的补丁方案 |
| `ztoolkit.Dialog` | 依赖 zotero-plugin-toolkit | 替换为模板自己的对话框方案 |
| `LargePrefHelper` | 依赖 zotero-plugin-toolkit | 替换为模板自己的大偏好存储方案 |

## 13. 与 REFERENCE_ATTANGER_PATTERNS.md 对比

| 维度 | zoplicate | attanger |
|---|---|---|
| **核心关注** | 条目元数据合并（去重/合并） | 附件文件操作（移动/重命名/识别） |
| **匹配策略** | 6 阶段级联消除（dc:replaces → DOI → ISBN → 标题 → 作者 → 年份） | 文件名模糊匹配（metricLcs）+ 精确匹配 |
| **冲突处理** | Master 选择策略（4 种） | MD5 比较 + 数字后缀 |
| **批量操作** | 暂停/恢复/回退状态机 | 遍历选中条目逐个处理 |
| **数据迁移** | Zotero.Items.merge（宿主内置） | transferItem（标注/关系/索引/标签/笔记） |
| **自动化程度** | 手动触发 | notifier 自动触发 + 偏好驱动 |
| **文件操作** | 无（不操作文件系统） | IOUtils.move/rename、路径映射 |

## 14. 源文件统计

| 类别 | 数量 |
|---|---|
| TypeScript 源文件 | 25 |
| 核心数据库文件 | 3（db.ts、duplicateFinder.ts、nonDuplicates.ts） |
| 核心模块文件 | 8（duplicateItems、duplicates、bulkDuplicates、merger、nonDuplicates、patcher、duplicateStats、menus） |
| 工具文件 | 8（duplicates、locale、prefs、utils、view、wait、window、zotero） |
| 生命周期文件 | 2（hooks.ts、addon.ts） |
| 入口文件 | 1（index.ts） |
| ztoolkit 初始化 | 1（ztoolkit.ts） |
| 类型声明 | ~5（typings/*.d.ts） |
