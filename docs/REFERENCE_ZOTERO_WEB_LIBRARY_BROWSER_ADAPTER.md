# Zotero Web Library 浏览器适配参考沉淀

> 用途：沉淀 Zotero 官方 Web Library 对浏览器风洞的可复用 UI 锚点；不维护 current truth，不替代 [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)。
> 最后更新：2026-05-01

## 参考输入

- `/Users/orlandozh/Downloads/web-library-master/src/js/component/libraries.jsx`
- `/Users/orlandozh/Downloads/web-library-master/src/js/component/common/table.jsx`
- `/Users/orlandozh/Downloads/web-library-master/src/js/component/common/table-header-row.jsx`
- `/Users/orlandozh/Downloads/web-library-master/src/js/component/item/details.jsx`
- `/Users/orlandozh/Downloads/web-library-master/src/js/component/reader.jsx`
- `/Users/orlandozh/Downloads/web-library-master/src/scss/abstracts/_variables.scss`
- `/Users/orlandozh/Downloads/web-library-master/src/scss/themes/_light.scss`
- `/Users/orlandozh/Downloads/web-library-master/src/scss/themes/_common.scss`
- `/Users/orlandozh/Downloads/web-library-master/src/scss/components/item/_table.scss`
- `/Users/orlandozh/Downloads/web-library-master/src/scss/components/_collection-tree.scss`
- `/Users/orlandozh/Downloads/web-library-master/src/scss/components/metadata/_list.scss`
- `/Users/orlandozh/Downloads/web-library-master/src/scss/components/tag/_selector.scss`
- `/Users/orlandozh/Downloads/web-library-master/src/scss/components/tag/_list.scss`
- `/Users/orlandozh/Downloads/web-library-master/test/fixtures/state/desktop-test-user-library-view.json`
- `/Users/orlandozh/Downloads/web-library-master/test/fixtures/state/desktop-test-user-reader-view.json`

## 可复用锚点

| Web Library 锚点 | 风洞用途 | 仍以本地客户端源码为准的部分 |
|---|---|---|
| `libraries.jsx` 的 `collection tree` / `role=tree` / `library-node` | 浏览器三栏左侧 collection tree 与 focus / selected 状态 | Zotero 客户端 `Item Tree` 的宿主事件、collection menu、真实选择语义 |
| `common/table.jsx` + `table-header-row.jsx` 的 `items-table-wrap` / `items-table-head` / `column-header` / `aria-sort` | 大库 items table、列宽、排序、虚拟滚动和键盘焦点压力 | 本地客户端 Item Tree 的字段枚举、宿主 action、列宽 resize、菜单刷新 contract |
| `item/details.jsx` + metadata SCSS | 右侧 item details / metadata-list 的浏览器密度与编辑态布局 | Zotero 客户端 `ItemPaneManager` 注册、section lifecycle、surface evidence |
| `reader.jsx` | Web 端 reader shell、iframe、`pdfReaderURL`、reader sidebar width、annotation import 状态 | 本地 Zotero Reader `renderToolbar`、annotation context menu、PDF.js viewer contract |
| `test/fixtures/state/*` | dev-only 固定状态、large list / reader route 的回放样本；风洞只暴露脱敏后的 collection / item / attachment / annotation display fields | 真机数据、真实用户库、发布 gate 结论、API key / request options / links / file URL |
| `src/static/icons` | item type icon 的浏览器视觉锚点 | 发布包资源、Zotero 客户端 chrome/resource 路径 |

## 适配原则

- 风洞可以通过 `--zotero-web-library-root` / `ZOTERO_WEB_LIBRARY_ROOT` 显式接入外部 Web Library 根目录，读取组件锚点、静态图标与脱敏 fixture display-field 采样；不要把官方源码 vendoring 到模板仓库。
- Web Library 只提供“浏览器 UI grammar”：collection tree、items table、metadata pane、reader shell、fixture 状态与图标资源。
- 可见面风格优先复用 Zotero 官方 Web Library 的 token / density / class grammar：白色主表格、浅灰 sidepane、蓝色 focused selection、约 26px 行高、紧凑 toolbar、metadata-list 与 tag selector/list 的布局语义；模板仓库用 scoped visual adapter 映射这些规则，不直接提交上游 compiled CSS。
- 本地 Zotero 客户端源码继续提供“宿主语义 truth”：`PreferencePanes`、`MenuManager`、`ItemPaneManager`、`Item Tree`、Reader `renderToolbar`、context menu、PDF.js 路由和 surface evidence。
- 如果 Web Library root 未配置或锚点缺失，风洞必须显式显示 `browser-contract` fallback；不能把 fallback 当作官方 Web Library 已启用。
- Web Library fixture 里可能包含远端 API URL 或测试 token 样例；风洞只读取结构/字段形状，并通过 `/zotero-web-library/fixture.json` 暴露脱敏采样，不提交请求、不透传 API key / links / request options / file URL、不作为真实库状态。

## 风洞映射

- `official-web-library-shell`：专门检查 Web Library root、组件锚点、脱敏 fixture 与 icon 可用性。
- `library-large-selection`：用 Web Library 的 `collection-tree` / `items-table` / `library-node` / `item-details` / `metadata-list` 类名、ARIA 形状与 scoped official visual adapter 增强浏览器模拟；collection click / keyboard navigate、item click / shift or meta multi-select / keyboard navigate、column sort、Item Tree column resize、item context menu、MenuManager `popupshowing` rebuild、menu item click、Item Pane section switch、Tag Selector search / toggle / drag-drop 与 Tags Box add / remove 只作为 dev-only 事件链模拟，其中列宽 resize 按本地 Zotero `VirtualizedTable` 的 `resizer -> columnWidths[dataKey] -> onResize(columnWidths, true)` 语义计算压力。
- `zotero-pdfjs-text-layer-analysis`：文档分析仍优先接 Zotero Reader PDF.js；Web Library reader shell 只作为浏览器 iframe/sidebar/UI 密度参考。
