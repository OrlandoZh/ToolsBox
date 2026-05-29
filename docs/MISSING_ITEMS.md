# ToolsBox Missing Items

**更新时间**: 2026-05-19
**权威入口**: [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)

## 当前未收口主线

- 真实远端 `update.json` / `update_link` 分发闭环。
- 远端仓库归属、GitHub CLI auth / token 或手动上传路径确认。
- release gate 只在用户解冻并完成远端上传后恢复。

## Planned / Default-off 功能

- TLDR real AI summary generation / remote provider integration
- Custom External API response-to-note / credential management / automatic enrichment
- Backlinks semantic search / relation writeback / cross-library sync
- Merge Annotations real annotation mutation / full annotation editor workflow
- Network-enabled AI provider enrichment

## 本轮已收口

- Style Editor default-off local CSS prototype：targeted tests、default-off / enabled Zotero scenario、`agent:check`、no-ui E2E、watch、monitor、gate、sync 证据已刷新。
- AI Provider Contract no-network 基座：targeted AI provider contract / feature-composer / docs-consistency、`agent:check`、no-ui E2E、watch、monitor、gate、sync 证据已刷新；不实现真实 TLDR UI 或 endpoint 调用。
- TLDR local Item Pane no-network preview：targeted TLDR / provider / feature-composer / docs-consistency tests、scenario listing、default-off scenario、enabled Zotero scenario、`agent:check`、no-ui E2E、watch、monitor、gate、sync 证据已刷新。
- Custom External API opt-in endpoint invocation preview：targeted tests、default-off / enabled loopback Zotero scenario、`agent:check`、no-ui E2E、watch、monitor、gate、sync 证据已刷新。

## 非阻断 debt

- 完整 UI capture 中记录过 Reader / surface-local visual drift，当前分类为 `visual-recommended` debt。
- release matrix 仍为 `attention`，原因是远端 verification pending；冻结期间不作为当前 dev gate blocker。
