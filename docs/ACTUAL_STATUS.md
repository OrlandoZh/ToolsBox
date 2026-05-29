# ToolsBox Actual Status

**更新时间**: 2026-05-19
**权威入口**: [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)

本文件只做当前状态薄镜像，不维护第二份 project truth。

## 当前结论

当前主线是 `STYLE-CUSTOM-EXTERNAL-API-OPT-IN-WORKFLOW-WAVE-001`：用户已要求先冻结发布，本波推进 Custom External API default-off opt-in endpoint invocation preview prototype。发布冻结期间不执行远端上传、远端 verify、release gate、git remote 变更或 `config/addon.config.json` `updateURL` 变更。

Style prototype、Backlinks local graph/drilldown、Merge Annotations preview/writeback、Attachment Version default-off local preview、Paper Matrix Enhanced local preview、Style Editor local CSS prototype、AI provider no-network contract、TLDR local Item Pane no-network preview、Zotero no-ui E2E、monitor/gate/sync 与本地 release preflight 已作为历史基线收口；当前不做远端发布、真实 TLDR AI summary、Custom External API response-to-note / credential management / automatic enrichment 或远端 AI provider。

## 已收敛边界

- Style-like prototype 继续 default-off。
- `backlinks.enabled=false` 与 `mergeAnnotations.enabled=false` 仍为默认值。
- Backlinks 只做本地只读 graph/drilldown，不写 Zotero relation。
- Merge Annotations 只写 ToolsBox 自有 child note，不修改真实 annotation。
- Attachment Version 只做本地只读 preview，不切换、不覆盖、不删除、不写回 attachment/note/annotation。
- Paper Matrix Enhanced 只读本地 item metadata / tags / attachments / workflow state，不写 item/note/annotation/attachment。
- Style Editor 只写 `styleEditor.css` pref，CSS 只注入 ToolsBox-owned scoped root，不 patch Zotero host document。
- AI Provider Contract 保留 `noop/mock-local` no-network TLDR path，并新增 `custom/external-api` opt-in provider；只有 allow-network + enabled + endpoint 才可手动调用。
- TLDR 当前只做本地 Item Pane preview：读取 title / abstract / itemType，展示 no-network unavailable/mock result，不写 Zotero 数据。
- Custom External API 当前只做 Item Pane opt-in invocation preview：读取本地 itemID/key/title/itemType/abstract/doi/tags，手动 Run 后向 endpoint 发送 allowlisted metadata POST，只展示 response preview，不写 Zotero 数据。
- 本地 release artifacts 和 plan-only upload checklist 已生成，但远端 `update.json` / `update_link` 尚未发布验证。

## 未收口

- 真实远端 `update.json` / `update_link` 分发闭环。
- GitHub CLI auth / token 或其它远端上传路径确认。
- 目标远端仓库与当前 git origin / release config 的归属选择。
- TLDR real AI summary generation、Custom External API response-to-note / credential management / automatic enrichment、Backlinks semantic search/writeback/cross-library sync、真实 annotation mutation。

## 当前验证

以 [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md) 的 fresh evidence 为准；本波 Custom External API targeted tests、default-off/enabled scenario、`agent:check`、no-ui E2E、watch、monitor、gate、sync 已通过并收口。
