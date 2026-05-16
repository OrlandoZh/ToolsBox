# ToolsBox Actual Status

**更新时间**: 2026-05-17
**权威入口**: [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)

本文件只做当前状态薄镜像，不维护第二份 project truth。

## 当前结论

当前主线是 `RELEASE-FREEZE-WAVE-001`：用户已要求先冻结发布。发布冻结期间不执行远端上传、远端 verify、release gate、git remote 变更或 `config/addon.config.json` `updateURL` 变更。

Style prototype、Backlinks local graph/drilldown、Merge Annotations preview/writeback、Zotero no-ui E2E、monitor/gate/sync 与本地 release preflight 已作为历史基线收口；当前不新增功能。

## 已收敛边界

- Style-like prototype 继续 default-off。
- `backlinks.enabled=false` 与 `mergeAnnotations.enabled=false` 仍为默认值。
- Backlinks 只做本地只读 graph/drilldown，不写 Zotero relation。
- Merge Annotations 只写 ToolsBox 自有 child note，不修改真实 annotation。
- 本地 release artifacts 和 plan-only upload checklist 已生成，但远端 `update.json` / `update_link` 尚未发布验证。

## 未收口

- 真实远端 `update.json` / `update_link` 分发闭环。
- GitHub CLI auth / token 或其它远端上传路径确认。
- 目标远端仓库与当前 git origin / release config 的归属选择。
- Style Editor、TLDR、Attachment Version、Custom External API、Paper Matrix Enhanced、Backlinks semantic search/writeback/cross-library sync、真实 annotation mutation。

## 当前验证

以 [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md) 的 fresh evidence 为准；冻结状态最近已通过 docs sync、targeted tests、`agent:check`、monitor、gate 与 sync。
