# ToolsBox Missing Items

**更新时间**: 2026-05-17
**权威入口**: [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)

## 当前未收口主线

- 真实远端 `update.json` / `update_link` 分发闭环。
- 远端仓库归属、GitHub CLI auth / token 或手动上传路径确认。
- release gate 只在用户解冻并完成远端上传后恢复。

## Planned / Default-off 功能

- Style Editor
- TLDR
- Custom External API
- Paper Matrix Enhanced
- Backlinks semantic search / relation writeback / cross-library sync
- Merge Annotations real annotation mutation / full annotation editor workflow
- AI provider enrichment

## 非阻断 debt

- 完整 UI capture 中记录过 Reader / surface-local visual drift，当前分类为 `visual-recommended` debt。
- release matrix 仍为 `attention`，原因是远端 verification pending；冻结期间不作为当前 dev gate blocker。
