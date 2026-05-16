# ToolsBox Style Feature Matrix

**更新时间**: 2026-05-17
**权威入口**: [../CURRENT_BACKLOG.md](../CURRENT_BACKLOG.md)

本文档是 Style-like 能力的实现矩阵和证据索引，不是第二份 current truth。当前主线、验收 track 与冻结边界仍只认 `docs/CURRENT_BACKLOG.md`。

## Current Wave

| 字段 | 当前值 |
| --- | --- |
| Wave | `STYLE-ATTACHMENT-VERSION-ENABLED-E2E-WAVE-001` |
| Acceptance track | `enabled-attachment-version-local-preview-real-zotero-e2e` |
| Release boundary | 发布继续冻结；不改 remote / updateURL，不运行 remote verify 或 release gate |
| Prototype policy | 未显式启用时不注册；不新增偏好设置面板可操作入口 |

## Feature Matrix

| 能力 | 当前状态 | 默认值 | 可见 surface | 数据写入 | 当前验证 |
| --- | --- | --- | --- | --- | --- |
| Research Workflow / Workbench | implemented baseline | enabled | Item Pane / Item Tree / menu / workbench | local tags / Extra by existing workflow contract | full dev gate baseline |
| Reading Time Column | prototype | default-off | Item Tree column | none | unit / composer gate |
| Annotation Column | prototype | default-off | Item Tree column | none | unit / composer gate |
| Cited Count Column | prototype | default-off | Item Tree column | local cache / metadata only | unit |
| IF Column | prototype | default-off | Item Tree column | none | unit |
| Collection Item Count / Sort / Favorite | hardened prototype | default-off | Collection tree DOM | favorite pref only for favorite list | hardening tests |
| Attachment Preview | hardened prototype | default-off | Item Pane section | none | hardening tests |
| Margin Annotation / PDF Background | hardened prototype | default-off | Reader | none | hardening tests |
| Merge Annotations | local preview + ToolsBox note writeback prototype | default-off | Item Pane section | ToolsBox-owned child note only | unit + enabled Zotero scenario |
| Backlinks | local graph/drilldown prototype | default-off | Item Pane section | none | unit + enabled Zotero scenario |
| Attachment Version | local read-only preview prototype with enabled Zotero workflow evidence | default-off | Item Pane section | none | unit + composer lifecycle tests + enabled scenario |
| Style Editor | planned | default-off | none | none | not implemented |
| TLDR | planned | default-off | none | none | no AI/provider closure |
| Custom External API | planned | default-off | none | none | no network/API closure |
| Paper Matrix Enhanced | planned | default-off | none | none | not implemented |
| Backlinks semantic search / relation writeback / cross-library sync | planned | default-off | none | none | not implemented |

## Attachment Version Boundaries

- Reads only local Zotero item / attachment metadata already available from the selected item or its child attachments.
- For selected attachment items, treats sibling attachments under the same parent as local version candidates.
- For selected regular items, treats child attachments as local version candidates.
- Renders a read-only Item Pane list with owner-tagged DOM nodes and stable empty states.
- Enabled E2E scope is limited to real Item Pane preview evidence: default-off section absence, explicit pref registration, child/sibling attachment list, selected marker, repeated render cleanup, and no attachment/note/annotation mutation.
- Does not switch active attachments, overwrite files, delete files, rename attachments, create notes, mutate annotations, or call network/AI providers.
- `attachmentVersion.enabled` remains `false` by default and is not exposed in the preference pane as a user-ready control.

## Next Planned Order

1. `Paper Matrix Enhanced` local field / filter enhancement.
2. `Style Editor` default-off local CSS prototype.
3. `TLDR` / `Custom External API` only after provider, privacy, and API contracts are explicit.
4. Backlinks advanced semantic search / relation writeback / cross-library sync.

## Release Freeze Boundary

- Release artifacts and remote readiness blockers from the previous wave are retained as background evidence only.
- While frozen, do not run `gh release create`, `gh release upload`, `npm run release:preflight -- --verify-remote`, or `npm run agent:gate:release`.
- Do not change `config/addon.config.json` `updateURL` or git remote in this wave.
