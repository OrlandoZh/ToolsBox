# REFERENCE_CITATION_BOOTSTRAP_PATTERNS.md

> 参考来源：`reference/plugin/zotero-citation-bootstrap/`（Zotero Citation Bootstrap，作者 MuiseDestiny）
> 用途：Zotero 与 Word 集成引文（拖拽引文、键盘快捷引文、引文分组）的架构模式沉淀
> 最后更新：2026-04-13

## 导航

- [回到 REFERENCE_INDEX](./REFERENCE_INDEX.md)
- [本地 raw reference：citation-bootstrap 源码](../reference/plugin/zotero-citation-bootstrap/)

## 1. 核心架构概览

Citation Bootstrap 是一个轻量引文管理插件，核心职责是：**监控 Word 文档会话、拖拽条目到 Word 自动插入引文、键盘快捷键插入引文、引文位置编号列显示、按文档自动生成虚拟搜索文件夹**。

与完整的引文管理器不同，它不管理 CSL 样式或引文格式，而是**在 Zotero 与 Word 之间架起快捷操作桥梁**。

### 1.1 源码文件索引

| 文件 | 职责 | 说明 |
|---|---|---|
| `src/index.ts` | 入口引导 | 全局 `Zotero.ZoteroCitation` 注册 |
| `src/addon.ts` | 插件实例类 | `data`/`hooks`/`api` 持有者 |
| `src/hooks.ts` | 生命周期钩子 | onStartup/onShutdown |
| `src/modules/citation.ts` | 核心引文服务 | Word 会话轮询监控、搜索文件夹生成、引文位置计算 |
| `src/modules/cite.ts` | 引文插入 | `citeItems()` 函数，快捷引文插入 |
| `src/modules/views.ts` | UI 层 | 引文列注册、拖拽行为补丁、文件夹图标补丁 |
| `src/modules/locale.ts` | 国际化 | Fluent i18n 初始化 + `getString()` |

源码文件总计 **7 个 TS 文件**（约 400 行实际插件代码）。

### 1.2 数据流概览

```
Word 会话监控层：
  setInterval(1000ms) -> 轮询 Zotero.Integration.sessions
                      -> 过滤 Word agent 会话
                      -> 初始化虚拟搜索文件夹
                      -> 计算引文位置编号
                      -> 更新 UI

拖拽引文层：
  用户在 Zotero 条目树拖拽条目
    -> dragend 事件检查坐标是否在 Zotero 窗口外
    -> 如果在窗口外 -> citeItems()
    -> 临时替换 Zotero.Integration.Session.prototype.cite
    -> 触发 Word agent 执行 addEditCitation
    -> 恢复原始 cite 方法

键盘快捷引文层：
  用户按下 ' 键
    -> citeItems()
    -> 获取当前选中条目
    -> 插入到 Word 当前光标位置
```

## 2. Word 会话轮询监控

### 2.1 轮询而非事件监听

文件：`src/modules/citation.ts`

```typescript
public async listener(t: number) {
  this.intervalID = window.setInterval(async () => {
    if (!Zotero.ZoteroCitation) { return this.clear(); }
    if (!Zotero.Integration.currentSession || isExecCommand) { return; }

    const sessions = Zotero.Integration.sessions;
    for (const sessionID in sessions) {
      const session = sessions[sessionID];
      if (!(session.agent as string).includes('Word')) { continue; }

      // 初始化搜索文件夹
      await this.initSearch(sessionID);

      // 比较数据是否变化
      const targetData = session.citationsByItemID || {};
      if (JSON.stringify(targetData) === JSON.stringify(this.sessions[sessionID].idData)) {
        return; // 无变化，跳过昂贵的刷新
      }

      // 更新引文
      await this.updateCitations(sessionID);
    }
  }, t);
}
```

**为什么轮询**：Word 进程不向 Zotero 发送 UI 事件，轮询是可靠的方式。默认 1000ms 间隔，用户可通过偏好配置。

**JSON 比较优化**：用 `JSON.stringify` 做浅层 diff，无变化时直接跳过，避免每次轮询都刷新 UI。

### 2.2 execCommand 补丁

```typescript
// 拦截 Word 文档打开事件
Zotero.Integration.execCommand = async function (agent, command, docId) {
  await execCommand(...arguments);  // 原始逻辑

  // 等待会话就绪
  await waitUntil(() => Zotero.Integration.sessions[sessionID]);
  const _session = Zotero.Integration.sessions[sessionID];

  // 将搜索文件夹重命名为 Word 文档文件名
  if ([sessionID, _session.lastName].indexOf(_session.search.name) != -1) {
    let targetName = PathUtils.split(docId).slice(-1)[0];
    _session.search.name = _session.lastName = targetName;
    await _session.search.saveTx({ skipSelect: true });
  }
};
```

**效果**：每次打开 Word 文档时，自动将 Zotero 中的虚拟搜索文件夹重命名为 Word 文档的文件名。

## 3. 拖拽引文机制

### 3.1 坐标检测法

文件：`src/modules/views.ts`

```typescript
// 在每个条目树行上绑定 dragend
div.addEventListener('dragend', (event) => {
  const items = ZoteroPane.getSelectedItems();
  if (items.find(i => !i.isTopLevelItem())) { return; } // 仅限顶层条目

  // 计算 Zotero 窗口边界
  const docRect = document.documentElement.getBoundingClientRect();
  const winRect = {
    left: window.screenX,
    top: window.screenY,
    width: docRect.width,
    height: docRect.height,
  };

  // 检查拖拽终点是否在 Zotero 窗口外
  const left = event.screenX;
  const top = event.screenY;
  if (left > winRect.left && left < (winRect.left + winRect.width) &&
      top > winRect.top && top < (winRect.top + winRect.height)) {
    return; // 仍在 Zotero 窗口内，不触发引文
  }

  // 拖到了窗口外 -> 插入引文到 Word
  addon.api.citeItems();
}, { passive: true });
```

**设计要点**：不需要知道 Word 的具体坐标，只要检测到拖出了 Zotero 窗口边界就触发引文插入。Word 的当前光标位置自然就是插入点。

### 3.2 拖拽数据清空

```typescript
// 补丁 onDragStart，防止 Zotero 默认的富文本拖拽干扰
ztoolkit.patch(
  ZoteroPane.itemsView,
  'onDragStart',
  config.addonRef,
  (original) => async (event, row) => {
    await original(event, row);
    event.dataTransfer.setData('text/plain', ' ');
    event.dataTransfer.setData('text/html', ' ');
  }
);
```

**设计要点**：将拖拽数据设置为单个空格，阻止 Zotero 默认的富文本拖拽行为，让插件完全控制拖拽后的引文插入。

## 4. 引文插入（citeItems）

### 4.1 临时方法替换

文件：`src/modules/cite.ts`

```typescript
async function citeItems() {
  const items = ZoteroPane.getSelectedItems();
  if (items.length === 0) return;

  // 保存原始 cite 方法
  const cite = Zotero.Integration.Session.prototype.cite;

  // 替换为自定义逻辑
  Zotero.Integration.Session.prototype.cite = async function (field, addNote) {
    // 自动将当前选中的 Zotero 条目添加为引文
    const citationItems = items.map(item => ({
      id: item.id,
      itemData: item.toJSON(),
      uris: item.getAttachments(),
    }));

    this.citationItems = citationItems;
    // 调用原始逻辑完成 Word 端的引文插入
    return await cite.call(this, field, addNote);
  };

  try {
    // 触发 Word agent 执行 addEditCitation
    if (Zotero.isMac) {
      await Zotero.Integration.execCommand(
        Zotero.Integration?.currentSession?.agent || 'MacWord16',
        'addEditCitation',
        '/Applications/Microsoft Word.app/',
        1,
      );
    } else {
      await Zotero.Integration.execCommand(
        Zotero.Integration?.currentSession?.agent || 'WinWord',
        'addEditCitation',
        '__doc__',
        1,
      );
    }
  } finally {
    // 恢复原始 cite 方法
    Zotero.Integration.Session.prototype.cite = cite;
  }
}
```

**设计要点**：`try/finally` 确保即使 Word 端抛出异常，原始 `cite` 方法也会被恢复。

## 5. 虚拟搜索文件夹

### 5.1 每个 Word 文档对应一个搜索文件夹

```typescript
public async initSearch(sessionID: string) {
  let search = new Zotero.Search();
  search.addCondition('title', 'contains', '');  // 初始空标题
  await search.search();
  search.name = sessionID;
  const session: SessionData = this.sessions[sessionID];
  session.search = search = search.clone(1);
  await search.saveTx({ skipSelect: true });
}
```

**效果**：在 Zotero 左侧分类树中创建一个"虚拟文件夹"，显示当前 Word 文档中已引用的所有条目。

### 5.2 清理

```typescript
public async clear() {
  this.intervalID && window.clearInterval(this.intervalID);
  for (const sessionID in this.sessions) {
    const session = this.sessions[sessionID];
    if (session.search) {
      session.search.deleted = true;
      await session.search.saveTx();
    }
  }
  this.sessions = {};
}
```

插件关闭或 Zotero 退出时，删除所有自动创建的搜索文件夹。

## 6. 引文位置编号（分组逻辑）

### 6.1 计算首次出现顺序

```typescript
public getSortedItemIDs(citationsByIndex: any) {
  const SortedItemIDs: number[] = [];
  for (const i in citationsByIndex) {
    citationsByIndex[i].citationItems.forEach((item: { id: number }) => {
      if (SortedItemIDs.indexOf(item.id) === -1) {
        SortedItemIDs.push(item.id);
      }
    });
  }
  return SortedItemIDs;
}
```

### 6.2 生成编号引文

```typescript
const getPlainCitation = (id: string) =>
  sortedItemIDs.indexOf(Number(id)) + 1 + ': ' +
  citationsByItemID[id].map(i =>
    styleClass === 'note'
      ? String(sortedItemIDs.indexOf(Number(id)) + 1)  // 脚注风格：仅数字
      : i.properties.plainCitation                     // 正文风格：[Author, Year]
  ).join(', ');
```

**效果**：条目在引文中首次出现时编号为 1，第二次出现的同一条目也显示为 1。相邻引用合并显示为 `[1, 2]` 而非 `[1][2]`。

## 7. 过滤器链模式

```typescript
// 补丁 CollectionTreeRow.prototype.getItems
ztoolkit.patch(
  Zotero.CollectionTreeRow.prototype,
  'getItems',
  config.addonRef,
  (original) => async function () {
    let items = await original.call(this);
    for (let i = 0; i < filterFunctions.length; i++) {
      items = filterFunctions[i](items);
    }
    return items;
  }
);

// 注册特定搜索文件夹的过滤
this.filterFunctions.push((items: Zotero.Item[]) => {
  const selectedSearch = ZoteroPane.collectionsView.getSelectedSearch();
  if (selectedSearch.key === search.key) {
    const ids = Object.keys(session.idData).map((id) => Number(id));
    return items.filter((item) => ids.indexOf(item.id) !== -1);
  }
  return items;
});
```

**设计要点**：过滤器数组允许多个插件各自添加过滤逻辑而不冲突。只有选中当前插件创建的搜索文件夹时才生效。

## 8. 图标补丁

```typescript
// 补丁 Zotero.CollectionTreeRow.prototype.getImageSrc
ztoolkit.patch(
  Zotero.CollectionTreeRow.prototype,
  'getImageSrc',
  config.addonRef,
  (original) => function () {
    const icon = original.call(this);
    // 如果是引文搜索文件夹，返回 Word 图标
    if (this.ref instanceof Zotero.Search && isCitationSearch(this.ref)) {
      return 'chrome://zoterocitation/content/icons/word.png';
    }
    return icon;
  }
);
```

**效果**：引文搜索文件夹显示 Word 图标而非默认搜索图标，视觉上区分普通搜索和引文搜索。

## 9. 国际化

```typescript
// Fluent 初始化
const bundle = new FluentBundle('en-US');
bundle.addResource(
  new FluentResource(await IOUtils.readUTF8(ftlPath))
);

// 使用
export function getString(key: string, args = {}) {
  const msg = bundle.getMessage(key);
  if (msg?.value) {
    return new IntlMessageFormat(msg.value).format(args);
  }
  return key;
}
```

支持 `branch` 参数，用于同一 key 下不同上下文的字符串选择。

## 10. 可借鉴的架构模式

### 10.1 可借鉴的模式

| 模式 | 适用场景 | 借鉴复杂度 |
|---|---|---|
| **轮询 + JSON diff** | 外部进程状态监控 | 低 —— `setInterval` + `JSON.stringify` 比较 |
| **execCommand 补丁** | 拦截外部应用打开事件 | 低 —— 包装原始函数 + 后置处理 |
| **坐标检测拖拽** | 跨窗口拖拽操作 | 低 —— `screenX/screenY` 边界检查 |
| **拖拽数据清空** | 阻止宿主默认拖拽行为 | 低 —— `setData('text/plain', ' ')` |
| **临时方法替换 + try/finally 恢复** | 拦截-修改-恢复模式 | 低 —— 保存原始引用 + finally 恢复 |
| **虚拟搜索文件夹** | 动态条目集合展示 | 低 —— `Zotero.Search` + 过滤器链 |
| **过滤器链** | 多个插件共享过滤逻辑 | 低 —— 数组 + forEach 遍历 |
| **引文位置编号** | 按首次出现排序 | 低 —— 维护有序 ID 数组 |
| **图标补丁** | 根据上下文显示不同图标 | 低 —— 补丁 getImageSrc |
| **搜索文件夹自动命名** | 按文档名动态命名 | 低 —— 解析 `docId` 路径 |

### 10.2 与当前模板的结合点

- 如果模板需要**与 Word/LibreOffice 集成**，可复用轮询监控 + execCommand 补丁模式
- 如果模板需要**拖拽操作触发外部动作**，可复用坐标检测 + 拖拽数据清空模式
- 如果模板需要**动态条目集合展示**，可复用虚拟搜索文件夹 + 过滤器链模式
- 如果模板需要**临时拦截宿主方法**，可复用 try/finally 恢复模式

## 11. 不可直接搬运的部分

| 内容 | 原因 | 处理方式 |
|---|---|---|
| `Zotero.Integration.sessions` | Zotero 宿主 Word 集成 API | 需确认目标版本支持 |
| `Zotero.Integration.execCommand` 补丁 | 依赖宿主内部实现 | 谨慎使用，可能随版本变化 |
| `Zotero.Integration.Session.prototype.cite` | 宿主内部原型方法 | 需确认方法签名稳定性 |
| `Zotero.Search` 虚拟文件夹 | Zotero 宿主搜索 API | 标准 API，相对稳定 |
| `ztoolkit.patch()` | 依赖 zotero-plugin-toolkit | 替换为模板自己的补丁方案 |
| `ZoteroPane.itemsView.onDragStart` 补丁 | 依赖 Zotero UI 内部结构 | 需确认 UI API 稳定性 |
| `collectionsView.renderItem` | 依赖 Zotero 视图实现 | 需确认视图 API 稳定性 |
| `registerStyleSheets` | 依赖 Zotero 样式系统 | 替换为模板自己的样式注册 |

## 12. 源文件统计

| 类别 | 数量 |
|---|---|
| TypeScript 源文件 | 7 |
| 核心模块文件 | 3（citation.ts、cite.ts、views.ts） |
| 国际化文件 | 1（locale.ts） |
| 生命周期文件 | 2（hooks.ts、addon.ts） |
| 入口文件 | 1（index.ts） |
| 类型声明 | 1（typings/global.d.ts） |
| 实际插件代码量 | ~400 行 |
