# Zotero Client Item Tree 列宽拖动参考沉淀

> 用途：沉淀浏览器风洞模拟 `Item Tree` 列宽拖动时应依据的 Zotero 本地端源码语义；不维护 current truth，不替代 [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)。
> 最后更新：2026-05-01

## 参考输入

- `reference/zotero-main/chrome/content/zotero/components/virtualized-table.jsx`
- `reference/zotero-main/chrome/content/zotero/itemTree.jsx`
- `reference/zotero-main/chrome/content/zotero/itemTreeColumns.jsx`
- `reference/zotero-main/chrome/content/zotero/xpcom/pluginAPI/itemTreeManager.js`
- `reference/zotero-main/chrome/content/zotero/elements/itemPane.js`
- `reference/zotero-main/chrome/content/zotero/elements/itemBox.js`
- `reference/zotero-main/scss/elements/_infoBox.scss`
- `reference/zotero-main/scss/abstracts/_mixins.scss`
- `reference/zotero-main/chrome/content/zotero/zoteroPane.xhtml`

## 可复用语义

| 源码锚点 | 风洞映射 | 边界 |
|---|---|---|
| `VirtualizedTable._renderHeaderCells()` 为非首列注入 `resizer ${column.dataKey}` | 表头每个非首列左边界提供 `column-resizer` hit area | 只模拟拖拽行为，不复制 React/Draggable 实现 |
| `_handleResizerDragStart()` 读取可见列 DOM 宽度并调用 `this._columns.onResize(onResizeData)` | pointer down 后记录相邻列初始宽度并实时更新 CSS grid columns | 运行时只改风洞内存状态，不写 Zotero prefs |
| `_handleResizerDrag()` 通过相邻两列、`minWidth`、padding 和固定宽度列计算新宽度 | 拖动时保持左右两列总宽度不变，并按 `minWidth` 限制 | 风洞不模拟 RTL 和所有历史偏好迁移 |
| `_handleResizerDragStop()` 提交 `resizeData[column.dataKey]` 并调用 `onResize(resizeData, true)` | pointer up 记录 `itemTree.column.resize`，label 中保留 `storePrefs=true` 和 `onResize(columnWidths, true)` | `storePrefs=true` 是模拟信号，不进行真实持久化 |
| `Columns.onResize(columnWidths, storePrefs=false)` 按 `dataKey` 更新列宽，`fixedWidth` 不持久化 | 风洞列定义保留 `dataKey / width / minWidth / fixedWidth / staticWidth / zoteroPersist` 形状 | 不把风洞列配置升格为插件 API contract |

## Item Pane 区分

- Zotero 右侧 `Item Pane` 本身宽度来自 `zoteroPane.xhtml` 中的 `zotero-items-splitter` 与 `item-pane` 的 `width / height` 持久属性。
- `itemBox` 的 Info 字段区使用 `meta-table`：`grid-template-columns: max-content 1fr`，字段 label 和 value 不是 `VirtualizedTable` 列，也不是源码里的可拖动列宽。
- 因此风洞若要模拟“栏目宽度拖动”，优先落到 `Item Tree` 表头列宽；右侧 `Item Pane` 只显示 `Info Field Grid: max-content 1fr` 作为语义提示，避免伪造本地端没有的字段列拖动。

## 风洞建议

- 表头拖动命名使用 `Item Tree column resize` / `itemTree.column.resize`，不要把它写成 `Item Pane` 列宽。
- 拖动事件链应保留 `dataKey`、`minWidth`、相邻列成对 resize、`storePrefs=true` 和 `onResize(columnWidths, true)` 这些可追踪信号。
- 浏览器风洞只用于 dev-only 交互具像化；真机 Zotero 验证仍以宿主 `VirtualizedTable` 和 `ItemTreeManager` 行为为准。
