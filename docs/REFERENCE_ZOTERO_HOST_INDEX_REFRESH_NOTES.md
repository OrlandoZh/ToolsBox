# Zotero 宿主索引刷新笔记

> 用途：记录一次针对 `reference/zotero-main` authoritative source 的宿主索引复核，只沉淀“哪些宿主枚举 / 术语 / 包装面需要刷新”，不写当前项目 truth。
> 基准快照：本地 `reference/zotero-main` `bc14ed8`
> 更新时间：`2026-04-18`

## 结论

本轮对照后，当前仓库主要需要刷新宿主索引 registry / docs，并补一个很小的 wrapper 对齐缺口：

- `MenuManager.VALID_TARGETS` 在当前 rolling snapshot 中已经形成完整稳定列表，索引不应继续只保留少量 sample
- `PreferencePanes.builtInPanes` 已从旧的 `zotero-prefpane-sync` 演进到 `zotero-prefpane-account`，并额外存在 `zotero-subpane-reset-sync`
- `PreferencePanes.register()` 的 `image` / `stylesheets` 解析语义，以及 `ItemPane` 的 `sidenav.orderable` / `sectionButtons` / `refreshInfoRow`，都值得在宿主索引层显式冻结
- `src/features/item-pane.js` 需要把已经公开在类型里的 `sidenav.orderable` 真正透传给 Zotero 宿主

## 这次从 authoritative source 提炼出的稳定点

### 1. MenuManager target 已是完整可枚举面

- `reference/zotero-main/chrome/content/zotero/xpcom/pluginAPI/menuManager.js` 当前 `VALID_TARGETS` 已覆盖：
  - 主窗口 menubar：`file/edit/view/go/tools/help`
  - 主窗口 library/context：`main/library/item`、`main/library/collection`
  - 主窗口附加入口：`main/library/addAttachment`、`main/library/addNote`、`main/tab`
  - Reader menubar：`reader/menubar/file`、`edit`、`view`、`go`、`window`
  - 其他 host-visible targets：`itemPane/info/row`、`notesPane/addItemNote`、`notesPane/addStandaloneNote`、`sidenav/locate`
- 本仓 `src/features/menu-manager.js` 与 `types/features.d.ts` 已经导出这一整套 target 常量，因此本轮只需补索引，不需补实现

### 2. PreferencePanes 的 built-in pane 命名已发生滚动更新

- 当前 `builtInPanes` 样本应认：
  - `zotero-prefpane-general`
  - `zotero-prefpane-account`
  - `zotero-prefpane-export`
  - `zotero-prefpane-cite`
  - `zotero-prefpane-advanced`
  - `zotero-subpane-reset-sync`
- 旧的 `zotero-prefpane-sync` 不应再继续作为 rolling snapshot 的 sample ID
- `register()` 当前还明确了：
  - `src` / `image` / `scripts` / `stylesheets` 都按 plugin root 解析
  - `image` 缺失时回退 `Zotero.Plugins.getIconURI(pluginID, 24)`
  - `rawLabel` 缺失时回退插件名

### 3. ItemPane 的 wrapper contract 需要把排序与快照 helper 视为稳定面

- 当前 authoritative source 仍保留并使用：
  - `sidenav.orderable`
  - `sectionButtons`
  - `refreshInfoRow(rowID)`
- 本仓 wrapper / types 还额外暴露了 registration snapshot helper：
  - `resolveSectionPaneID(paneID)`
  - `getRegistrationSnapshot()`
- 这些都属于“宿主对齐后的包装层 contract”，适合写进 host interface / semantic index，不应退化成运行时经验

## 本仓本轮应做的更新

- 刷新 `config/zotero-host-semantic-index.json`
- 刷新 `config/zotero-host-interface-contracts.json`
- 重新生成 `docs/ZOTERO_HOST_SEMANTIC_INDEX.md`
- 重新生成 `docs/ZOTERO_HOST_INTERFACE_CONTRACTS.md`

## Raw Reference Anchors

- `reference/zotero-main/chrome/content/zotero/xpcom/pluginAPI/menuManager.js`
- `reference/zotero-main/chrome/content/zotero/xpcom/preferencePanes.js`
- `reference/zotero-main/chrome/content/zotero/xpcom/pluginAPI/itemPaneManager.js`
- `reference/zotero-main/chrome/content/zotero/xpcom/pluginAPI/itemTreeManager.js`
- `reference/zotero-main/chrome/content/zotero/xpcom/reader.js`
