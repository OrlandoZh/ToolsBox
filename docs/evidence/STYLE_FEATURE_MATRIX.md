# ToolsBox Style Feature Matrix

**更新时间**: 2026-05-19
**权威入口**: [../CURRENT_BACKLOG.md](../CURRENT_BACKLOG.md)

本文档是 Style-like 能力的实现矩阵和证据索引，不是第二份 current truth。当前主线、验收 track 与冻结边界仍只认 `docs/CURRENT_BACKLOG.md`。

## Current Wave

| 字段 | 当前值 |
| --- | --- |
| Wave | `STYLE-CUSTOM-EXTERNAL-API-OPT-IN-WORKFLOW-WAVE-001` |
| Acceptance track | `default-off-custom-external-api-opt-in-endpoint-workflow` |
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
| Paper Matrix Enhanced | local field/filter/sort preview prototype | default-off | standalone Paper Matrix window | none | unit + enabled Zotero scenario |
| Style Editor | local CSS editor prototype | default-off | standalone Style Editor window | `styleEditor.css` pref only | unit + enabled Zotero scenario |
| AI Provider Contract | no-network + opt-in external provider/privacy/API contract | internal/default-off | none | none | unit + composer guard |
| TLDR | local Item Pane no-network preview prototype | default-off | Item Pane section | none | unit + enabled Zotero scenario |
| Custom External API | opt-in endpoint invocation preview prototype | default-off | Item Pane section | none | unit + enabled Zotero scenario |
| Backlinks semantic search / relation writeback / cross-library sync | planned | default-off | none | none | not implemented |

## AI Provider Contract Boundaries

- `tldrPanel.enabled=false` and `customExternalAPI.enabled=false` remain the defaults.
- The contract normalizes provider descriptors, capabilities, privacy policy, local request previews, disabled/unavailable/error results, and opt-in response previews.
- The default `noop/mock-local` provider is deterministic, returns unavailable/mock results, sets `networkUsed=false`, and never calls `fetch`.
- `summarizeItem` remains no-network for TLDR local preview.
- `invokeExternal` resolves to `custom/external-api` only with `networkPolicy="allow-network"`, `customExternalAPI.enabled=true`, and a non-empty valid endpoint.
- Real TLDR summary generation, provider key management, response-to-note, automatic enrichment, PDF full-text transfer, and preference pane controls remain out of scope.

## Custom External API Boundaries

- `customExternalAPI.enabled=false` and `customExternalAPI.endpoint=""` keep the section unregistered by default.
- `customExternalAPI.enabled=true` plus a non-empty valid endpoint enables the internal `toolsbox-custom-external-api` Item Pane section for isolated scenario / manual prototype validation.
- Reads only local item `itemID`, `key`, `title`, `itemType`, `abstract`, `doi`, and `tags`.
- Renders owner-tagged loading, empty, metadata preview, endpoint host, request preview, Run button, status, HTTP status, networkUsed, and response preview states.
- Sends POST JSON only after a manual Run click; request schema is fixed to `schemaVersion: 1`, `capability: "invokeExternal"`, `consumer: "customExternalAPI"`, and an allowlisted metadata payload.
- Does not read PDF full text, send notes/annotations/attachment bytes, save responses, create notes, write Extra/tags, mutate annotations or attachments, expose a preference pane control, or call TLDR real summary providers.

## TLDR Boundaries

- `tldrPanel.enabled=false` keeps the section unregistered by default.
- `tldrPanel.enabled=true` enables the internal `toolsbox-tldr-panel` Item Pane section for isolated scenario / manual prototype validation.
- Reads only local item title, abstract / abstractNote, and item type metadata.
- Renders owner-tagged loading, empty, metadata preview, request preview, provider unavailable, and deterministic mock summary states.
- Uses the no-network `summarizeItem` provider contract, keeps `networkUsed=false`, and does not call `fetch`.
- Does not read PDF full text, create notes, write Extra/tags, mutate annotations or attachments, expose a preference pane control, call network/AI providers, or sync summaries remotely.

## Style Editor Boundaries

- `styleEditor.enabled=false` keeps the command and window unregistered by default.
- `styleEditor.enabled=true` enables the internal `toolsbox-style-editor` command for isolated scenario / manual prototype validation.
- Reuses a ToolsBox-owned standalone window shell with CSS textarea, Preview, Save, Reset, and local status state.
- Save / Reset only write the `styleEditor.css` pref; no files, items, notes, annotations, or attachments are modified.
- Preview CSS is injected only into owner-tagged ToolsBox roots via `data-toolsbox-style-editor-style="true"` and a generated `data-toolsbox-style-editor-scope` selector prefix.
- The scoped CSS helper refuses unowned roots and removes `@import`, URL references, at-rules, and `-moz-binding` before applying CSS.
- Does not patch the Zotero host document, expose a preference pane control, implement a full theme system, call network/AI providers, or sync CSS remotely.

## Paper Matrix Enhanced Boundaries

- Reuses the existing Paper Matrix standalone window shell controlled by `researchWorkbench.matrix.enabled`.
- `paperMatrix.enabled=false` keeps enhanced payload, enhanced columns, and enhanced filters hidden by default.
- `paperMatrix.enabled=true` enables local read-only enhanced rows with `itemType`, `doi`, `tags`, `workflowStatus`, `attachmentCount`, and `hasAttachment`.
- Reads only local Zotero item metadata, tags, child attachment references, and workflow state.
- Provides local filters for item type, tag, year range, has attachment, and workflow status.
- Provides sorting for title, year, creators, workflowStatus, and attachmentCount.
- Does not save filter state to Zotero, write Extra, write tags, create notes, mutate annotations, mutate attachments, call network, call AI providers, or implement remote enrichment / semantic ranking.
- `paperMatrix.enabled` remains `false` by default and is not exposed in the preference pane as a user-ready control.

## Attachment Version Boundaries

- Reads only local Zotero item / attachment metadata already available from the selected item or its child attachments.
- For selected attachment items, treats sibling attachments under the same parent as local version candidates.
- For selected regular items, treats child attachments as local version candidates.
- Renders a read-only Item Pane list with owner-tagged DOM nodes and stable empty states.
- Enabled E2E scope is limited to real Item Pane preview evidence: default-off section absence, explicit pref registration, child/sibling attachment list, selected marker, repeated render cleanup, and no attachment/note/annotation mutation.
- Does not switch active attachments, overwrite files, delete files, rename attachments, create notes, mutate annotations, or call network/AI providers.
- `attachmentVersion.enabled` remains `false` by default and is not exposed in the preference pane as a user-ready control.

## Next Planned Order

1. Custom External API opt-in endpoint invocation preview closure is the active wave; keep it default-off.
2. TLDR real AI summary generation and provider key management require a separate privacy/network/provider wave.
3. Custom External API response-to-note, credentials, and automatic enrichment require separate waves.
4. Backlinks advanced semantic search / relation writeback / cross-library sync.

## Release Freeze Boundary

- Release artifacts and remote readiness blockers from the previous wave are retained as background evidence only.
- While frozen, do not run `gh release create`, `gh release upload`, `npm run release:preflight -- --verify-remote`, or `npm run agent:gate:release`.
- Do not change `config/addon.config.json` `updateURL` or git remote in this wave.
