# Zotero Client Tag System Reference

> 用途：沉淀本地 Zotero 客户端标签体系在 dev-only 浏览器风洞中的 clean-room 映射边界。本文不是 current truth；当前 scope 仍以 `docs/CURRENT_BACKLOG.md` 为准。

## 参考入口

- `reference/zotero-main/chrome/content/zotero/components/tagSelector.jsx`
- `reference/zotero-main/chrome/content/zotero/components/tagSelector/tagSelectorList.jsx`
- `reference/zotero-main/chrome/content/zotero/containers/tagSelectorContainer.jsx`
- `reference/zotero-main/chrome/content/zotero/elements/tagsBox.js`
- `reference/zotero-main/chrome/content/zotero/xpcom/data/item.js`
- `reference/zotero-main/chrome/content/zotero/xpcom/data/tags.js`
- `reference/zotero-main/scss/components/_tagSelector.scss`
- `reference/zotero-main/scss/elements/_tagsBox.scss`
- `reference/zotero-main/scss/abstracts/_variables.scss`

## 可迁移语义

- `TagSelectorList` 的 tag row 使用 `tag-selector-item keyboard-clickable`、`role="checkbox"`、`aria-checked`、`aria-disabled`，并按 `selected / colored / disabled / dragged-over` class 暴露状态。
- `TagSelectorContainer` 会把 colored tags 从普通 tag 中抽出，按 `tagColors.position` 放到列表前部；即使 colored tag 当前不在 scope 中，也可以作为 disabled row 暴露。
- `showAutomatic=false` 时自动标签（`type == 1`）会从 Tag Selector 视图中过滤；手动标签使用 `type == 0`。
- Tag Selector 搜索通过 `searchString` 过滤 tag 名；选择 tag 后通过 `onSelection(selectedTags)` 影响 Item Tree 过滤。
- Tag Selector 支持 item drag/drop 到 tag：普通 drop 调 `item.addTag(value)`，Mac meta 或非 Mac shift drop 调 `item.removeTag(value)`，随后保存 item。
- `tags-box` 位于 Item Pane，使用 item 的 `getTags()`，并按 colored tags 优先、emoji、字母序排序；row 使用 `tagName`、`tagType`、`has-color` 与 `--tag-color` 表示状态。
- `tags-box` 的 remove / edit / add 路径落到 `item.removeTag(...)`、`item.replaceTag(...)`、`item.addTag(...)` 与 debounced save。
- `Zotero.Item.prototype.addTag(name, type=0)` 会按 tag 名去重，同名不同 type 以新 type 替换；`removeTag(tagName)` 删除同名标签。
- `Zotero.Tags.getColors(libraryID)` 返回 tag name 到 `{ color, position }` 的 map，palette 来自客户端 SCSS 变量。

## 风洞映射

- 浏览器风洞只模拟事件、状态与 DOM grammar：`Tag Selector search/toggle/drag-drop`、`Tags Box add/remove`、`item.addTag`、`item.removeTag`、`item.saveTx`。
- 风洞用 synthetic / redacted fixture item tag assignments 代替真实 Zotero DB，不写用户数据，不触发真实同步，不替代真机 Zotero 验证。
- colored tags 使用 Zotero palette，并保留 `--tag-color`、`data-color`、`has-color`、`tagType` 等插件可探测信号。
- disabled scope 用“colored tag 不在当前 item scope”模拟，方便插件测试 tag scope、empty filter 和 mixed selection。
- 批量写回只更新风洞 runtime state，用事件日志表现 `addTag/removeTag/saveTx`，不声称完成真实宿主事务。

## 不迁移边界

- 不 vendoring Zotero React / XUL implementation。
- 不复刻虚拟列表测量、emoji 宽度 canvas 测量、完整 context menu color picker、split long tag dialog 或 SQLite 事务。
- 不把风洞的 tag count / timing / memory 指标升级为 release gate；它只作为开发态场景化压力和交互 smoke。
