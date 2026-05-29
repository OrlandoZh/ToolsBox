# ToolsBox Feature Real Status

**更新时间**: 2026-05-19
**权威入口**: [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)

本文件不再维护百分比完成度；功能真实状态只以当前 backlog truth 和 fresh verification 为准。

## 当前功能口径

- Research Workflow / Workbench 保持当前主线能力。
- Style-like prototype 已通过 pref gate 收口，默认关闭。
- Backlinks 已完成 default-off local graph/drilldown prototype 与 enabled Zotero scenario 证据。
- Merge Annotations 已完成 default-off preview、ToolsBox child note writeback、enabled Zotero workflow 证据。
- Attachment Version 已完成 default-off local read-only Item Pane preview prototype 与 enabled Zotero workflow 证据。
- Paper Matrix Enhanced 已完成 default-off local read-only field/filter/sort preview；复用现有 Paper Matrix standalone window shell，不写 item/note/annotation/attachment。
- Style Editor 已完成 default-off local CSS standalone window prototype 证据；只写 `styleEditor.css` pref，scoped CSS 只注入 ToolsBox-owned root，不 patch Zotero host document。
- AI Provider Contract 保留 no-network TLDR path，并新增 Custom External API opt-in provider；`invokeExternal` 只有 allow-network + enabled + endpoint 时可调用。
- TLDR 已完成 default-off local Item Pane no-network preview；显式启用后只展示本地 metadata / request preview 与 unavailable/mock result。
- Custom External API 当前推进 default-off opt-in Item Pane endpoint invocation preview；显式启用且 endpoint 非空后手动 Run 发送 allowlisted metadata POST，只展示 response preview，不写 Zotero 数据。
- Collection / Reader / attachment preview 等高风险 prototype 保持 default-off，并具备 availability guard 与 cleanup 口径。

## Planned / Default-off

- TLDR real AI summary / remote provider integration
- Custom External API response-to-note / credential management / automatic enrichment
- Backlinks semantic search / relation writeback / cross-library sync
- Merge Annotations real annotation mutation / full annotation editor workflow

## Release 状态

发布已冻结。真实远端 `update.json` / `update_link` 分发闭环未完成，等待用户解冻并确认远端仓库与认证方式。
