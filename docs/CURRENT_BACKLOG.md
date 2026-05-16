# ToolsBox 当前单一事实源

**更新时间**: 2026-05-17
**本轮主线**: `STYLE-FEATURE-MATRIX-AND-ATTACHMENT-VERSION-WAVE-001`
**核心目标**: 在发布冻结边界内系统推进 planned Style-like 能力；本波只补 feature matrix 与默认关闭的本地只读 Attachment Version Item Pane prototype

---

## 当前单一事实源

本节是当前项目态的唯一 truth。消费者文档只同步 marker block，不维护第二份完成度结论。

<!-- CURRENT-TRUTH-SUMMARY:START -->
当前主线为 `STYLE-FEATURE-MATRIX-AND-ATTACHMENT-VERSION-WAVE-001`：在用户已要求“先冻结发布”的边界内，继续系统推进未实现 Style-like 能力。本波只做两件事：新增 `docs/evidence/STYLE_FEATURE_MATRIX.md` 作为非权威实现矩阵；把 `Attachment Version` 从 `planned/not implemented` 推进为默认关闭、本地只读、Item Pane 预览型 prototype。当前 active expansion wave: `STYLE-FEATURE-MATRIX-AND-ATTACHMENT-VERSION-WAVE-001`；验收主线: `planned-feature-matrix-and-local-attachment-version-preview`。

发布冻结继续有效且优先级不变：冻结未解除前禁止执行 `gh release create`、`gh release upload`、真实远端 asset mutation、`npm run release:preflight -- --verify-remote`、`npm run agent:gate:release`，也不改 git remote 或 `config/addon.config.json` 的 `updateURL`。`RELEASE-REMOTE-DISTRIBUTION-WAVE-001` 已完成安全 readiness 检查但未执行发布；上一波 `RELEASE-FREEZE-WAVE-001` 与 `STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001` 的本地 release artifacts、plan-only upload checklist、HTTP `404` readiness blocker、GitHub CLI 未登录状态和 origin / release config mismatch 只作为 retained release background；本波不继续三选一远端发布决策。

已收敛并继续保留的实现口径：`createFeatureComposer({ ..., zotero })` 支持可注入 Zotero 依赖；生产默认继续读 `globalThis.Zotero`。Style-like 直接注册项全部通过显式 pref gate 控制，`annotationColumn.enabled` 是 canonical key，`annotationDistributionColumn.enabled` 仅保留 legacy fallback。缺省未显式开启时，直接 Style prototype 不应注册，也不在偏好设置面板中表现为已可用功能。

Attachment Version 本波实现口径：`attachmentVersion.enabled=false` 继续是默认值，不新增偏好面板可操作入口；显式启用时才注册 `toolsbox-attachment-version` Item Pane section。该 prototype 只读取本地 Zotero item / attachment metadata：选中 regular item 时列出 child attachments；选中 attachment 时列出同 parent 下的 sibling attachments 并标记当前选中项。渲染只使用 owner-tagged DOM，重复 render 清理旧节点，`cleanup()` / `destroy()` 幂等 unregister section。它不切换附件、不覆盖文件、不删除附件、不重命名附件、不创建 note、不改 annotation、不接网络/AI。

Backlinks functional scope 已收口并保持历史 baseline：开发验收用 `zotero:scenario -- --addon-pref backlinks.enabled=true` pref 注入已证明默认 pref 未开启时 Backlinks section 不注册；显式开启时 live Item Pane local graph/list 与 `.toolsbox-backlinks-drilldown-button` 可选择来源条目，并保持 item fields 与 relations 不变。默认仍为 `backlinks.enabled=false`，不写 Zotero relation，不修改 item/note/annotation 数据，不调用网络，不接 AI。核心 helpers 保持为 `collectBacklinksForItemAsync`、`buildBacklinkGraphForItem` 与 `selectBacklinkSource`。

Merge Annotations 继续作为历史 baseline：已完成本地 annotation 合并预览、ToolsBox 自有 child note writeback/upsert workflow，以及 enabled real Zotero Item Pane button E2E 证据；默认仍为 `mergeAnnotations.enabled=false`，不修改真实 annotation。

Default-off / planned truth 更新为：`Attachment Version` 现在是本地只读 Item Pane preview prototype；`Style Editor`、`TLDR`、`Custom External API`、`Paper Matrix Enhanced`、Backlinks semantic search / relation writeback / cross-library sync、AI enrichment 与其它未完成能力保持 `planned/default-off`，不把缺 API key 当作本轮主阻断。

已收敛的高风险 surface truth：Collection DOM patch、Reader `_iframeWindow`、attachment preview iframe、margin annotation、PDF background 等能力保持 prototype / default-off；已补 availability guard、owner-tagged DOM、幂等 cleanup / destroy 与 lifecycle cleanup。本波不重新打开这些 surface，不做 host surface 大重写，不把任何 prototype 升格为默认开启或 beta 可用入口。

当前 release-only 历史线 `ENG-HIGH-104 / ENG-LOW-211~213` 已冻结在远端 readiness 之后；真实闭环仍取决于用户解冻、远端仓库 / 认证 / asset 上传确认。`ENG-HIGH-103`、`READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125`、`READER-HIGH-126`、`HOST-HIGH-201 / HOST-LOW-301~303`、`ZOTERO-HOST-POLISH-WAVE-001`、`OPTIONAL-BUNDLE-WAVE-001` 均只作为历史 contract / mirror 背景保留，不覆盖当前 Attachment Version + release freeze 口径。

`P2` 上下文感知记忆与趋势层深化已完成并保留为背景；Style acceptance truth、默认关闭策略、测试链、Backlinks local prototype、Merge Annotations local preview、default-off note writeback workflow、enabled Merge Annotations writeback E2E、enabled Backlinks local graph/drilldown E2E、Backlinks full UI visual evidence 分类、Zotero 真机验收闭环、release local preflight 与 release freeze closure 已作为历史基线收口。历史 Style waves retained: `STYLE-PROTOTYPE-HARDENING-WAVE-001`、`STYLE-BACKLINKS-LOCAL-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-PREVIEW-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-WRITEBACK-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-WRITEBACK-E2E-WAVE-001`、`STYLE-BACKLINKS-LOCAL-GRAPH-E2E-WAVE-001`、`STYLE-BACKLINKS-VISUAL-EVIDENCE-CLOSURE-WAVE-001`、`STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001`、`RELEASE-FREEZE-WAVE-001`。本波不追 `zotero-style` 100% 复刻，只推进一个 default-off local Attachment Version prototype 与 feature matrix。
<!-- CURRENT-TRUTH-SUMMARY:END -->

<!-- CURRENT-TRUTH-META:START -->
{
  "activeBatchId": "STYLE-FEATURE-MATRIX-AND-ATTACHMENT-VERSION-WAVE-001",
  "currentWaveName": "STYLE-FEATURE-MATRIX-AND-ATTACHMENT-VERSION-WAVE-001",
  "acceptanceTrack": "planned-feature-matrix-and-local-attachment-version-preview"
}
<!-- CURRENT-TRUTH-META:END -->

---

## 本轮验收标准

本轮“完成”表示 planned Style-like 能力矩阵已经建立，`Attachment Version` 已形成默认关闭、本地只读、可注册/可清理/可测试的 Item Pane prototype，并且发布冻结边界没有被突破；不表示远端 `update.json` / `update_link` 真实分发闭环已经完成，也不表示 Attachment Version 的切换/覆盖/删除 workflow 已实现。

1. 新增并维护 `docs/evidence/STYLE_FEATURE_MATRIX.md`，但它只做 evidence/matrix，不替代 `docs/CURRENT_BACKLOG.md`。
2. `attachmentVersion.enabled=false` 保持默认值；不新增偏好设置面板可操作入口，不把 Attachment Version 升格为默认开启或 beta opt-in。
3. Attachment Version 显式启用时只注册 `toolsbox-attachment-version` Item Pane section，读取本地 attachment metadata 并渲染 owner-tagged 只读列表。
4. Attachment Version 不切换附件、不覆盖文件、不删除附件、不重命名附件、不创建 note、不改 annotation、不调用网络/AI。
5. Backlinks / Merge Annotations runtime 不在本波重开；`backlinks.enabled=false`、`mergeAnnotations.enabled=false` 与其它 Style-like prototype 默认关闭策略保持不变。
6. 发布冻结继续有效：禁止执行 `gh release create`、`gh release upload`、真实远端 asset mutation、`npm run release:preflight -- --verify-remote`、`npm run agent:gate:release`。
7. 不改 git remote，不改 `config/addon.config.json` 的 `updateURL`，不做 `OrlandoZh/ToolsBox` / `OrlandoZh/AddonTemplate4Z` / 其它远端三选一发布决策。
8. 本轮验证以 targeted Attachment Version / feature-composer / docs-consistency、docs sync、`agent:check`、dev monitor / gate / sync 为主；不刷新视觉 baseline。
9. 只有用户明确解冻并确认目标远端与认证方式后，才恢复 remote distribution closure。

本波 fresh evidence 已刷新：

- Targeted Attachment Version / feature-composer / docs-consistency tests 通过；`21/21`。
- `npm run docs:sync-current-truth -- --check` 通过；current truth marker blocks in sync。
- `npm run agent:check` 通过；full check 链单轮结束，`1590/1590` tests。
- `npm run agent:zotero:e2e -- --no-ui-capture` 通过；2 cycles，scenario failed `0`，issues `[]`。
- `npm run zotero:watch` startup health passed，随后已停止常驻 watch。
- `npm run agent:monitor` 通过；failed `0`。
- `npm run agent:gate` 通过；gate issues `[]`，matched override `style-feature-matrix-and-attachment-version-wave-001`，validation level `visual-recommended` 且非阻断。
- `npm run agent:sync` 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。

发布冻结前的 remote distribution readiness 已刷新，当前结论是 retained blocker / frozen，不再继续推进：

- Local release artifacts 已就绪：`dist/toolsbox-0.1.0.xpi`、`dist/update.json`、`dist/release-manifest.json`、`dist/release-preflight.json`、`dist/release-plan.json`、`dist/release-matrix.json`。
- Release identity 对齐：addonId `toolsbox@orlandozh.github`，version `0.1.0`，updateURL `https://github.com/OrlandoZh/ToolsBox/releases/download/release/update.json`，update_link `https://github.com/OrlandoZh/ToolsBox/releases/download/release/toolsbox-0.1.0.xpi`。
- `curl -sI https://github.com/OrlandoZh/ToolsBox/releases/download/release/update.json` 返回 HTTP `404`。
- `curl -sI https://github.com/OrlandoZh/ToolsBox/releases/download/release/toolsbox-0.1.0.xpi` 返回 HTTP `404`。
- `curl -sI https://github.com/OrlandoZh/ToolsBox` 返回 HTTP `404`；目标仓库在未登录视角下不可见或不存在。
- `gh` CLI 可用；路径为 `/opt/homebrew/bin/gh`。
- `gh auth status -h github.com` 显示未登录，不能执行 authenticated release upload。
- 当前 `git remote -v` 指向 `https://github.com/OrlandoZh/AddonTemplate4Z.git`，与 release config 指向的 `OrlandoZh/ToolsBox` 不一致。
- 未运行 `npm run release:preflight -- --verify-remote`，避免在未上传前用预期 404 覆盖本地 passed preflight。
- 未运行 `npm run agent:gate:release`，因为 release matrix 仍为 `attention`，远端 verification pending。

上一波 closure / release preflight 已刷新并收口到本地 plan-only 边界：

- `npm run docs:sync-current-truth -- --check` 通过。
- Combined targeted Backlinks / feature-composer / docs-consistency tests 通过；`27/27`。
- `npm run agent:check` 通过；full test 链单轮结束，`1582/1582`。
- 首次 `npm run agent:gate` 因 watch stale 失败；`npm run zotero:watch` 已刷新 startup health，watch status `健康`，startup error/warning `0/0`，随后手动停止常驻 watch。
- `npm run agent:monitor` fresh 通过；failed `0`。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level `visual-recommended` 且非阻断。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。
- `npm run release:plan` 通过；生成 `dist/toolsbox-0.1.0.xpi`、`dist/update.json`、`dist/release-manifest.json`、`dist/release-preflight.json`、`dist/release-plan.json`、`dist/release-matrix.json` 与 release notes。
- Release artifact identity 对齐：addonId `toolsbox@orlandozh.github`，version `0.1.0`，updateURL `https://github.com/OrlandoZh/ToolsBox/releases/download/release/update.json`，update_link `https://github.com/OrlandoZh/ToolsBox/releases/download/release/toolsbox-0.1.0.xpi`，XPI SHA256 `6aa361482f60bb62412b5678f359b6951d3b0b2d2a92041c97ad8c8165f7b965`。
- `npm run release:upload -- --provider github-release --release-tag release --target-base-url https://github.com/OrlandoZh/ToolsBox/releases/download/release/` 通过；`dist/release-upload-plan.json` status `passed`，`executionMode="plan-only"`，`networkActionsPerformed=false`。
- `dist/release-matrix.json` 为 `attention`；stable / beta profile 均待补远端验证。这是冻结期间保留的 release readiness debt，不阻断当前 freeze closure。
- `npm run agent:gate:release` 未运行；冻结期间也不运行，避免把 release gate 变成当前主线。

上一波 Backlinks visual evidence closure 已刷新并分类：

- `npm run docs:sync-current-truth -- --check` 通过。
- Combined targeted Backlinks / feature-composer / docs-consistency tests 通过；`27/27`。
- `npm run agent:zotero:e2e` 完整 UI capture 已执行；tests `3/3`、scenario `31/31`、runtime error `0`，视觉层报告 Reader / surface-local drift 与尺寸差异。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；2 cycles，scenario failed `0`，runtime error `0`，Backlinks default-off branch 两轮均为 `sectionRegistered=false`。
- Surface smoke / DOM contract 佐证通过；`item pane DOM contract advisory`、`preference pane surface smoke`、`library item pane surface smoke` 与 `reader surface smoke` 均 passed。
- 本波不运行 `npm run agent:zotero:e2e:update-baseline`；视觉差异记录为 `visual-recommended` 非阻断 debt。
- `npm run zotero:watch` startup health fresh 通过；watch status `healthy`，startup error/warning `0/0`，随后手动停止常驻 watch。
- `npm run agent:monitor` fresh 通过；`12/12`，watch healthy，E2E fresh，failed `0`。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level `visual-recommended` 且非阻断。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。

上一波 Backlinks local graph/drilldown fresh 证据已刷新并收口：

- Scenario listing 通过；`npm run zotero:scenario -- --scenario-file backlinks-local-graph.scenario.js --list-scenarios` 列出 `backlinks local graph drilldown workflow`。
- Enabled graph/drilldown scenario 通过；`npm run zotero:scenario -- --addon-pref backlinks.enabled=true --scenario "backlinks local graph drilldown workflow"` 为 `1/1` passed，mode 为 `enabled-local-graph-drilldown`，点击 `.toolsbox-backlinks-drilldown-button` 后 selectedIDs 命中来源条目且 `itemSnapshotsUnchanged=true`。
- Default-off branch 通过；未注入 pref 时 `backlinks.enabled=false`，`toolsbox-backlinks` section 不注册。
- Combined targeted Backlinks / feature-composer / docs-consistency tests 通过；`27/27`。
- `npm run docs:sync-current-truth -- --check` 通过；current truth marker blocks in sync。
- `npm run agent:check` 通过；full test 链单轮结束，`1582/1582`。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；2 cycles，cycle tests `3/3`，scenario `31/31` each cycle，scenario failed `0`，runtime log error `0`，visual capture skipped by flag。
- `npm run zotero:watch` startup health fresh 通过；watch status `healthy`，startup error/warning `0/0`，随后手动停止常驻 watch。
- `npm run agent:monitor` fresh 通过；`12/12`，watch healthy，E2E fresh，failed `0`。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level `visual-recommended` 且非阻断。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。

上一波基线 fresh 证据：

- Targeted feature-composer / build tests 通过。
- `npm test` 单轮通过。
- `npm run agent:check` 通过，并重建当前仓库 fresh agent-run telemetry。
- `npm run agent:zotero:e2e` 通过；两轮场景失败 `0`、视觉漂移 `0`、capability 覆盖 `11/11`。
- `npm run agent:monitor` 与 `npm run agent:gate` 通过；gate issues 为空。
- `npm run agent:sync` 已刷新 gate chain、agent-context、Obsidian handoff 与 evidence chain。

上一波 Backlinks local prototype 证据已刷新并收口：

- Targeted Backlinks test 通过；`tests/features/test-backlinks.js` 为 `9/9`。
- Targeted feature-composer test 通过；`7/7`，覆盖 default-off / enabled registration / lifecycle cleanup。
- Targeted docs-consistency test 通过；combined targeted Backlinks / feature-composer / docs-consistency 为 `22/22`。
- `npm run docs:sync-current-truth -- --check` 通过。
- `npm test` 单轮通过，`1557/1557`。
- 当前完整 `npm run check` 通过，`1557/1557`。
- E2E harness targeted test 通过；`2/2`。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；两轮场景失败 `0`、runtime error `0`、DOM contract `passed`、capability `11/11`。完整 UI capture 曾出现 Reader focus / activation brightness 类视觉漂移；在当前 `visual-recommended` 级别下作为后续建议项，不阻断本波 default-off Backlinks 功能闭环。
- `npm run zotero:watch` startup health fresh 通过；watch 证据进入 gate。
- `npm run agent:monitor` 与 `npm run agent:gate` fresh 通过；gate blocker `0`。
- `npm run agent:sync` 已刷新 gate chain、agent-context、Obsidian handoff 与 evidence chain。

上一波 Merge Annotations local preview fresh 证据已刷新并收口：

- Targeted Merge Annotations test 通过；`tests/features/test-merge-annotations.js` 为 `10/10`。
- Targeted feature-composer test 通过；`7/7`，覆盖 default-off / enabled registration / lifecycle cleanup。
- Targeted docs-consistency test 通过；`6/6`，combined targeted Merge Annotations / feature-composer / docs-consistency 为 `23/23`。
- `npm run docs:sync-current-truth -- --check` 通过；current truth marker blocks in sync。
- `npm run agent:check` 通过；full test 链单轮结束，`1567/1567`。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；2 cycles，cycle tests `3/3`，scenario `29/29` each cycle，scenario failed `0`，runtime log error `0`，visual drift `0`，DOM contract `passed`，scenario-bound capability `11/11`。
- `npm run zotero:watch` startup health fresh 通过；watch status 为 healthy，随后手动停止常驻 watch。
- `npm run agent:monitor` fresh 通过；failed `0`。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level 仍为 `visual-recommended` 且非阻断。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。

上一波 Merge Annotations note writeback fresh 证据已刷新并收口：

- Targeted Merge Annotations writeback test 通过；`tests/features/test-merge-annotations.js` 为 `15/15`。
- Targeted feature-composer test 通过；`7/7`，覆盖 default-off / enabled registration / lifecycle cleanup。
- Targeted docs-consistency test 通过；`6/6`，combined targeted Merge Annotations / feature-composer / docs-consistency 为 `28/28`。
- `npm run docs:sync-current-truth -- --check` 通过；current truth marker blocks in sync。
- `npm run agent:check` 通过；full test 链单轮结束，`1572/1572`。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；2 cycles，cycle tests `3/3`，scenario `29/29` each cycle，scenario failed `0`，runtime log error `0`，visual drift `0`，DOM contract `passed`，scenario-bound capability `11/11`。
- `npm run zotero:watch` startup health fresh 通过；watch status 为 healthy，随后手动停止常驻 watch。
- `npm run agent:monitor` fresh 通过；failed `0`。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level 仍为 `visual-recommended` 且非阻断。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。

本波 Merge Annotations enabled writeback E2E fresh 证据已刷新并收口：

- Scenario listing 通过；`npm run zotero:scenario -- --scenario-file merge-annotations-writeback.scenario.js --list-scenarios` 列出 `merge annotations enabled writeback workflow`。
- Enabled writeback scenario 通过；`npm run zotero:scenario -- --addon-pref mergeAnnotations.enabled=true --scenario "merge annotations enabled writeback workflow"` 为 `1/1` passed，并走 live Item Pane button create/update 同一个 ToolsBox merge note。
- Default-off 同名 scenario 通过；未注入 pref 时 `mergeAnnotations.enabled=false` 分支保持 section 不注册。
- Combined targeted ItemPane / Merge Annotations / feature-composer / zotero-script / docs-consistency tests 通过；`46/46`。
- `npm run docs:sync-current-truth -- --check` 通过；current truth marker blocks in sync。
- `npm run agent:check` 通过；full test 链单轮结束，`1577/1577`。
- `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过；2 cycles，report status `passed`，issues `[]`。
- `npm run zotero:watch` startup health fresh 通过；watch status 为 healthy，随后手动停止常驻 watch。
- `npm run agent:monitor` fresh 通过；failed `0`。
- `npm run agent:gate` fresh 通过；gate issues `[]`，validation level 仍为 `visual-recommended` 且非阻断。
- `npm run agent:sync` fresh 通过；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned。

---

## Style Prototype Inventory

### 可测试 prototype / 已有基础实现

| 能力 | 当前口径 | 默认状态 |
| --- | --- | --- |
| Reading Time Column | 本地列 prototype，需 host 验收 | default-off |
| Annotation Column | `annotationColumn.enabled` canonical，legacy fallback 兼容 | default-off |
| Cited Count Column | 读取本地缓存/Extra 的 prototype，不声明远端引用 API 闭环 | default-off |
| IF Column | 本地字段解析 prototype | default-off |
| Collection Item Count / Sort / Favorite | Collection DOM patch prototype；本波补 owner-tag / idempotent cleanup | default-off |
| Attachment Preview | iframe preview prototype；本波补幂等 cleanup 与稳定 empty state | default-off |
| Margin Annotation / PDF Background | Reader prototype；本波补 frame resolver / unavailable / destroy 恢复 | default-off |
| Backlinks | 本地只读反向链接 graph/drilldown prototype；显式引用扫描、async Item Pane 渲染、来源条目选择，不做远端/AI/relation 写回 | default-off |
| Merge Annotations | 已有本地 annotation 合并预览 + ToolsBox 自有 child note writeback workflow；已补 enabled 真实 Zotero Item Pane writeback/upsert E2E 证据，不修改真实 annotation | default-off |
| Attachment Version | 本地只读 attachment version preview prototype；显式启用后注册 Item Pane section，读取 child/sibling attachment metadata，不做切换/覆盖/删除/写回 | default-off |
| Sidebar Toggle / Tab Manager / View Groups / Graph View | prototype，可单测，不作为已完整复刻 | default-off |
| Research Workflow / Workbench | 当前已注册主线能力，继续按既有 contract 验收 | enabled |

### Planned / Default-off

| 能力 | 当前口径 |
| --- | --- |
| Style Editor | planned/not implemented |
| TLDR | planned/default-off，不接入远端 AI 闭环 |
| Custom External API | planned/default-off |
| Paper Matrix Enhanced | planned/not implemented |
| AI Generate Tags / Remark | default-off；缺 API key 不是本轮主阻断 |

---

## 验证命令

本轮验证只允许本地非发布检查；不执行远端上传、远端 verify、release gate 或 visual baseline 更新：

```bash
npm run docs:sync-current-truth -- --check
node --input-type=module -e "import './tests/features/test-attachment-version.js'; import './tests/feature-composer.test.js'; import './tests/docs-consistency.test.js'; const { runTests } = await import('./tests/test-framework.js'); await runTests();"
npm run agent:check
npm run agent:monitor
npm run agent:gate
npm run agent:sync
```

冻结期间显式禁止执行：

```bash
gh release create ...
gh release upload ...
npm run release:preflight -- --verify-remote
npm run agent:gate:release
```

如 watch 证据在 closure 检查中变 stale，再补跑：

```bash
npm run zotero:watch
```

本波不跑 `npm run agent:zotero:e2e:update-baseline`。冻结未解除前，不执行真实 release upload，也不运行 verify-remote 覆盖本地 passed preflight。

上一波 release readiness 与本地 preflight 命令只作为 retained baseline 参考，本波主验收以 freeze truth、mirror 同步和 dev gate 一致为准。

---

## 历史状态

- `ENG-HIGH-104 / ENG-LOW-211~213` 已冻结在真实远端 `update.json` / `update_link` 分发闭环之前；当前 blocker 是用户已要求先冻结发布，目标远端仓库 / CLI auth / asset upload 尚未确认。
- `HOST-HIGH-201 / HOST-LOW-301~303` 与 `ZOTERO-HOST-POLISH-WAVE-001` 已完成并保留为 host-visible contract 背景。
- `READER-HIGH-123` 已完成唯一 Reader verdict，并转为历史契约源。
- `READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125`、`READER-HIGH-126` 的历史结论继续保留，但本轮不重新打开。
- 历史 baseline 命令 `npm run agent:zotero:e2e:update-baseline` 与 `2000x1200` 视觉上下文只作为旧验收记录，不作为当前 Style prototype 完成度声明。
