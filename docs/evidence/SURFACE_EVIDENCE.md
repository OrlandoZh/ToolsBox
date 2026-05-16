# ToolsBox Style Prototype Evidence

**更新时间**: 2026-05-17
**权威入口**: [../CURRENT_BACKLOG.md](../CURRENT_BACKLOG.md)

本文档记录 Style prototype、当前 Attachment Version enabled E2E wave 与 release freeze 边界的证据口径。它不是完成度百分比表，也不替代 fresh 命令输出。

## Evidence Contract

| 证据类型 | 当前要求 |
| --- | --- |
| Targeted tests | 当前 wave 触达 Attachment Version enabled workflow 证据；必须覆盖 Attachment Version helper/render/register cleanup、feature-composer pref gate、docs-consistency |
| Full tests | 改动 runtime 后需重跑 `npm run agent:check` |
| Zotero E2E | Attachment Version 保持 default-off；本波新增 isolated enabled scenario，并重跑 no-ui E2E；不刷新完整 UI baseline |
| Monitor / Gate | 开发门禁继续使用 `npm run agent:monitor` / `npm run agent:gate`；冻结期间不运行 `npm run agent:gate:release` |
| Release distribution | 发布已按用户要求冻结；保留 plan-only artifacts 与 readiness blockers，不执行 `gh release create/upload`、remote verify 或远端 asset mutation |

## Fresh Evidence Snapshot

截至 `2026-05-17`，`STYLE-ATTACHMENT-VERSION-ENABLED-E2E-WAVE-001` 正在推进 Attachment Version enabled real Zotero Item Pane preview workflow evidence：

| 命令 / 证据 | 结果 |
| --- | --- |
| Attachment Version scope | default-off、本地只读 Item Pane prototype；显式启用后只展示 local child/sibling attachment version preview，不切换、不覆盖、不删除、不写回 attachment/note/annotation |
| Feature matrix | `docs/evidence/STYLE_FEATURE_MATRIX.md` 已记录 Attachment Version enabled scenario 与下一步未完成顺序；仍不替代 current truth |
| Scenario listing | passed；`attachment version enabled preview workflow` 已注册 |
| Default-off scenario | passed；未注入 pref 时 `attachmentVersion.enabled=false` 且 `toolsbox-attachment-version` section 不注册 |
| Enabled scenario | passed；`1/1`，真实 Item Pane preview 渲染 child/sibling attachments、selected marker，重复 render 后 owner root count 为 `1`，`itemSnapshotsUnchanged=true` |
| Targeted Attachment Version / feature-composer / docs-consistency | passed；`21/21` |
| `npm run docs:sync-current-truth -- --check` | passed；current truth marker blocks in sync |
| `npm run agent:check` | passed；full check 链单轮结束，`1590/1590` tests |
| `npm run agent:zotero:e2e -- --no-ui-capture` | passed；2 cycles，scenario `32/32` each cycle，scenario failed `0`，runtime log error `0`，visual capture skipped by flag |
| `npm run zotero:watch` | startup health passed；fresh watch status 写入 gate，随后停止常驻 watch |
| `npm run agent:monitor` | stable；failed `0` |
| `npm run agent:gate` | passed；issues `[]`，matched override `style-attachment-version-enabled-e2e-wave-001`，validation level `visual-recommended` 且非阻断 |
| `npm run agent:sync` | passed；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned |
| Release freeze | 继续有效；不运行 remote upload、remote verify、release gate，不改 updateURL/git remote |

截至 `2026-05-15T20:02:44.723Z`，`STYLE-PROTOTYPE-HARDENING-WAVE-001` 已完成 hardening evidence 刷新并通过 gate：

| 命令 / 证据 | 结果 |
| --- | --- |
| Targeted feature-composer test | passed |
| Targeted hardening tests | passed |
| E2E harness targeted tests | passed；`71/71` |
| `npm test` | passed；单轮结束 |
| `npm run check` | passed；包含 `1548/1548` tests |
| `npm run agent:zotero:e2e:update-baseline` | passed；刷新当前稳定视觉基线 |
| `npm run agent:zotero:e2e` | passed；2 cycles，scenario failed `0`，runtime error `0`，visual drift `0`，DOM contract `passed` |
| Capability coverage | covered / passed；未发现 uncovered blocker |
| `npm run zotero:watch` | startup health passed；fresh watch status 写入 gate |
| `npm run agent:monitor` | stable / generated；E2E fresh，surface evidence failing `0` |
| `npm run agent:gate` | passed；blocker `0` |
| `npm run agent:sync` | passed；gate chain、agent-context、Obsidian handoff 与 evidence chain aligned |

截至 `2026-05-16T04:45Z`，`STYLE-BACKLINKS-LOCAL-WAVE-001` 已完成 Backlinks local prototype 的 fresh evidence 刷新并通过 dev gate：

| 命令 / 证据 | 结果 |
| --- | --- |
| Targeted Backlinks test | passed；`9/9` |
| Targeted feature-composer test | passed；`7/7` |
| Targeted docs-consistency test | passed；`6/6` |
| Combined targeted Backlinks / feature-composer / docs-consistency | passed；`22/22` |
| `npm run docs:sync-current-truth -- --check` | passed；current truth marker blocks in sync |
| `npm test` | passed；单轮结束，`1557/1557` |
| `npm run check` | passed；单轮结束，`1557/1557` |
| E2E harness targeted tests | passed；`2/2` |
| `npm run agent:zotero:e2e -- --no-ui-capture` | passed；2 cycles，scenario failed `0`，runtime error `0`，visual drift `0`，DOM contract `passed`，capability `11/11` |
| `npm run zotero:watch` | startup health passed；fresh watch status 写入 gate，随后手动中断常驻 watch |
| `npm run agent:monitor` | stable；watch healthy，E2E fresh，failed `0` |
| `npm run agent:gate` | passed；gate blocker `0`，issues `[]` |
| `npm run agent:sync` | passed；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned |

截至 `2026-05-16T10:08Z`，`STYLE-MERGE-ANNOTATIONS-WRITEBACK-E2E-WAVE-001` 已完成 enabled real Zotero writeback workflow evidence 刷新并通过 dev gate：

| 命令 / 证据 | 结果 |
| --- | --- |
| Scenario listing | passed；`merge annotations enabled writeback workflow` 已注册 |
| Enabled writeback scenario | passed；`1/1`，live Item Pane button create/update 同一个 ToolsBox-owned child note |
| Default-off scenario | passed；未注入 pref 时 section 不注册 |
| Targeted ItemPane / Merge Annotations / feature-composer / zotero-script / docs-consistency | passed；`46/46` |
| `npm run docs:sync-current-truth -- --check` | passed；current truth marker blocks in sync |
| `npm run agent:check` | passed；full test 链单轮结束，`1577/1577` |
| `npm run agent:zotero:e2e -- --no-ui-capture` | passed；2 cycles，status `passed`，issues `[]` |
| `npm run zotero:watch` | startup health passed；fresh watch status 写入 gate，随后手动停止常驻 watch |
| `npm run agent:monitor` | stable；failed `0` |
| `npm run agent:gate` | passed；gate issues `[]`，validation level `visual-recommended` 且非阻断 |
| `npm run agent:sync` | passed；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned |

截至 `2026-05-16T16:20Z`，`STYLE-BACKLINKS-LOCAL-GRAPH-E2E-WAVE-001` 已完成 enabled local graph/drilldown evidence 刷新并通过 dev gate：

| 命令 / 证据 | 结果 |
| --- | --- |
| Scenario listing | passed；`backlinks local graph drilldown workflow` 已注册 |
| Enabled graph/drilldown scenario | passed；`1/1`，live Item Pane graph/list 渲染本地 backlink sources，drilldown 选择来源条目，`itemSnapshotsUnchanged=true` |
| Default-off branch | passed；未注入 pref 时 `backlinks.enabled=false` 且 section 不注册 |
| Combined targeted Backlinks / feature-composer / docs-consistency | passed；`27/27` |
| `npm run docs:sync-current-truth -- --check` | passed；current truth marker blocks in sync |
| `npm run agent:check` | passed；full test 链单轮结束，`1582/1582` |
| `npm run agent:zotero:e2e -- --no-ui-capture` | passed；2 cycles，cycle tests `3/3`，scenario `31/31` each cycle，scenario failed `0`，runtime log error `0`，UI capture skipped by flag |
| `npm run zotero:watch` | startup health passed；fresh watch status healthy，startup error/warning `0/0`，随后手动停止常驻 watch |
| `npm run agent:monitor` | stable；`12/12`，watch healthy，E2E fresh，failed `0` |
| `npm run agent:gate` | passed；gate issues `[]`，validation level `visual-recommended` 且非阻断 |
| `npm run agent:sync` | passed；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned |

截至 `2026-05-16T17:29Z`，`STYLE-BACKLINKS-VISUAL-EVIDENCE-CLOSURE-WAVE-001` 已完成完整 UI capture evidence 分类并通过 dev gate：

| 命令 / 证据 | 结果 |
| --- | --- |
| Combined targeted Backlinks / feature-composer / docs-consistency | passed；`27/27` |
| `npm run docs:sync-current-truth -- --check` | passed；current truth marker blocks in sync |
| `npm run agent:zotero:e2e` | completed with visual drift；2 cycles，tests `3/3`，scenario `31/31`，scenario failed `0`，runtime log error `0`，visual drift / size mismatch reported |
| Visual classification | non-blocking `visual-recommended` debt；Reader drift `7.92% > 5.00%` and surface-local preference/item/context/reader captures drifted from existing baselines |
| Baseline update | not run；no intentional UI change in this wave |
| `npm run agent:zotero:e2e -- --no-ui-capture` | passed；2 cycles，scenario failed `0`，runtime log error `0`，Backlinks default-off branch reports `backlinks.enabled=false` and `sectionRegistered=false` |
| Surface smoke / DOM contract | passed；item pane DOM contract advisory, preference pane surface smoke, library item pane surface smoke, and reader surface smoke all passed in no-ui E2E |
| `npm run zotero:watch` | startup health passed；fresh watch status healthy，startup error/warning `0/0`，随后手动停止常驻 watch |
| `npm run agent:monitor` | stable；`12/12`，watch healthy，E2E fresh，failed `0` |
| `npm run agent:gate` | passed；gate issues `[]`，validation level `visual-recommended` 且非阻断 |

完整 UI capture 的 `npm run agent:zotero:e2e` 曾出现 Reader focus / activation brightness 类视觉漂移；当前 validation level 是 `visual-recommended`，且 Backlinks 保持 default-off、不触达偏好设置面板可操作入口，因此该视觉证据属于后续建议项，不作为本波功能闭环 blocker。

截至 `2026-05-17T02:50+08:00`，`STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001` 已完成合并前 closure 与 release-only 本地预检证据刷新；不新增 Style runtime 功能，不刷新 visual baseline，不执行真实远端上传：

| 命令 / 证据 | 结果 |
| --- | --- |
| `npm run docs:sync-current-truth -- --check` | passed；current truth marker blocks in sync |
| Combined targeted Backlinks / feature-composer / docs-consistency | passed；`27/27` |
| `npm run agent:check` | passed；full test 链单轮结束，`1582/1582` |
| `npm run zotero:watch` | startup health passed；watch status `健康`，startup error/warning `0/0`，随后手动停止常驻 watch |
| `npm run agent:monitor` | stable；failed `0` |
| `npm run agent:gate` | passed；gate issues `[]`，validation level `visual-recommended` 且非阻断 |
| `npm run agent:sync` | passed；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned |
| `npm run release:plan` | passed；生成 `dist/toolsbox-0.1.0.xpi`、`dist/update.json`、`dist/release-manifest.json`、`dist/release-preflight.json`、`dist/release-plan.json`、`dist/release-matrix.json` 与 release notes |
| Release identity / integrity | addonId `toolsbox@orlandozh.github`，version `0.1.0`，updateURL `https://github.com/OrlandoZh/ToolsBox/releases/download/release/update.json`，update_link `https://github.com/OrlandoZh/ToolsBox/releases/download/release/toolsbox-0.1.0.xpi`，XPI SHA256 `6aa361482f60bb62412b5678f359b6951d3b0b2d2a92041c97ad8c8165f7b965` |
| `npm run release:upload -- --provider github-release --release-tag release --target-base-url https://github.com/OrlandoZh/ToolsBox/releases/download/release/` | passed；`dist/release-upload-plan.json` status `passed`，`executionMode="plan-only"`，`networkActionsPerformed=false` |
| Release matrix | `attention`；stable / beta profile 均等待真实远端 update.json / update_link 验证，作为下一波 remote distribution 边界 |

截至 `2026-05-17T03:05+08:00`，`RELEASE-REMOTE-DISTRIBUTION-WAVE-001` 已完成远端 readiness 安全检查，当前 blocked / awaiting explicit remote publishing choice：

| 命令 / 证据 | 结果 |
| --- | --- |
| `git remote -v` | 当前 origin 为 `https://github.com/OrlandoZh/AddonTemplate4Z.git`，与 release config 的 `OrlandoZh/ToolsBox` 不一致 |
| `command -v gh` | passed；GitHub CLI 位于 `/opt/homebrew/bin/gh` |
| `gh auth status -h github.com` | failed；未登录任何 GitHub host，不能执行 authenticated release upload |
| `gh release view release --repo OrlandoZh/ToolsBox` | failed；因 GitHub CLI 未登录而无法查询 release |
| `curl -sI https://github.com/OrlandoZh/ToolsBox` | HTTP `404`；目标仓库在未登录视角下不可见或不存在 |
| `curl -sI https://github.com/OrlandoZh/ToolsBox/releases/download/release/update.json` | HTTP `404`；远端 update.json 尚不可达 |
| `curl -sI https://github.com/OrlandoZh/ToolsBox/releases/download/release/toolsbox-0.1.0.xpi` | HTTP `404`；远端 XPI 尚不可达 |
| `curl -sI https://github.com/OrlandoZh/AddonTemplate4Z/releases/download/release/update.json` | HTTP `404`；当前 origin 对应 release asset 同样不可达 |
| Release decision | 不运行真实 `gh release create/upload`、不运行 `release:preflight -- --verify-remote` 覆盖本地 passed preflight；等待用户确认目标远端与认证方式 |

截至 `2026-05-17`，`RELEASE-FREEZE-WAVE-001` 已按用户“先冻结发布”的指令进入 no-remote-mutation 状态：

| 命令 / 证据 | 结果 |
| --- | --- |
| Freeze decision | 发布冻结；不继续三选一远端发布决策，不改 git remote，不改 `config/addon.config.json` 的 `updateURL` |
| Retained release artifacts | 保留 `dist/toolsbox-0.1.0.xpi`、`dist/update.json`、`dist/release-manifest.json`、`dist/release-upload-plan.json` 与 plan-only upload evidence |
| Retained readiness blockers | `OrlandoZh/ToolsBox` 与 release asset URL 仍记录为 HTTP `404`；GitHub CLI 未登录；origin 仍为 `OrlandoZh/AddonTemplate4Z` |
| Forbidden while frozen | 不执行 `gh release create`、`gh release upload`、真实远端 asset mutation、`npm run release:preflight -- --verify-remote`、`npm run agent:gate:release` |
| Validation scope | 只跑 docs sync、targeted docs-consistency 与 dev `agent:monitor` / `agent:gate` / `agent:sync` 这类本地非发布检查 |
| `npm run docs:sync-current-truth -- --check` | passed；current truth marker blocks in sync |
| Combined targeted Backlinks / feature-composer / docs-consistency | passed；`27/27` |
| `npm run zotero:watch` | startup health passed；fresh watch status 写入 gate，随后停止常驻 watch |
| `npm run agent:monitor` | stable；failed `0` |
| `npm run agent:gate` | passed；issues `[]`，validation level `visual-not-needed`，matched override `release-freeze-wave-001` |
| `npm run agent:sync` | passed；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned |

截至 `2026-05-16T05:48:43Z`，`STYLE-MERGE-ANNOTATIONS-PREVIEW-WAVE-001` 已完成 Merge Annotations local preview prototype 的 fresh evidence 刷新并通过 dev gate：

| 命令 / 证据 | 结果 |
| --- | --- |
| Targeted Merge Annotations test | passed；`10/10` |
| Targeted feature-composer test | passed；`7/7` |
| Targeted docs-consistency test | passed；`6/6` |
| Combined targeted Merge Annotations / feature-composer / docs-consistency | passed；`23/23` |
| `npm run docs:sync-current-truth -- --check` | passed；current truth marker blocks in sync |
| `npm run agent:check` | passed；full test 链单轮结束，`1567/1567` |
| `npm run agent:zotero:e2e -- --no-ui-capture` | passed；2 cycles，cycle tests `3/3`，scenario `29/29` each cycle，scenario failed `0`，runtime log error `0`，visual drift `0`，DOM contract `passed`，scenario-bound capability `11/11` |
| `npm run zotero:watch` | startup health passed；fresh watch status 写入 gate，随后手动中断常驻 watch |
| `npm run agent:monitor` | stable；failed `0` |
| `npm run agent:gate` | passed；gate issues `[]`，validation level `visual-recommended` 且非阻断 |
| `npm run agent:sync` | passed；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned |

截至 `2026-05-16T06:54:02Z`，`STYLE-MERGE-ANNOTATIONS-WRITEBACK-WAVE-001` 已完成 Merge Annotations note writeback workflow 的 fresh evidence 刷新并通过 dev gate：

| 命令 / 证据 | 结果 |
| --- | --- |
| Targeted Merge Annotations writeback test | passed；`15/15` |
| Targeted feature-composer test | passed；`7/7` |
| Targeted docs-consistency test | passed；`6/6` |
| Combined targeted Merge Annotations / feature-composer / docs-consistency | passed；`28/28` |
| `npm run docs:sync-current-truth -- --check` | passed；current truth marker blocks in sync |
| `npm run agent:check` | passed；full test 链单轮结束，`1572/1572` |
| `npm run agent:zotero:e2e -- --no-ui-capture` | passed；2 cycles，cycle tests `3/3`，scenario `29/29` each cycle，scenario failed `0`，runtime log error `0`，visual drift `0`，DOM contract `passed`，scenario-bound capability `11/11` |
| `npm run zotero:watch` | startup health passed；fresh watch status 写入 gate，随后手动中断常驻 watch |
| `npm run agent:monitor` | stable；failed `0` |
| `npm run agent:gate` | passed；gate issues `[]`，validation level `visual-recommended` 且非阻断 |
| `npm run agent:sync` | passed；gate chain、agent-context、Obsidian handoff、evidence chain 与 strict Obsidian guard aligned |

## Surface Notes

- 未实现能力保持 planned/default-off，不需要截图证明“可用”。
- default-off prototype 若未显式启用，不应以偏好面板截图证明功能完成。
- 如果 E2E 报视觉漂移，先看 surface smoke / DOM contract 是否通过；整窗截图只能作为补充证据。

## High-risk Prototype Notes

| Surface | 当前边界 |
| --- | --- |
| Collection DOM patch | default-off prototype；本波要求 owner-tagged DOM、重复注册不重复注入、destroy 清理 DOM / listener / notifier |
| Reader `_iframeWindow` | default-off prototype；本波要求 bounded frame resolver，缺 frame/document/body/canvas 时 unavailable/no-op |
| Attachment preview iframe | default-off prototype；本波要求幂等 cleanup、render 前 blank/remove 旧 iframe、稳定 empty state |
| Backlinks item pane prototype | default-off prototype；本波要求 enabled isolated Zotero scenario 证明 live Item Pane local graph/list、async scanner、drilldown 选择来源条目、无 relation/item mutation、API 缺失 no-op、注册后幂等 cleanup |
| Merge Annotations item pane prototype | default-off prototype；已补 enabled isolated Zotero scenario 证明 live Item Pane 按钮触发 ToolsBox 自有 child note create/update upsert、无重复 note、无 annotation mutation、API 缺失 no-op、注册后幂等 cleanup |
| Attachment Version item pane prototype | default-off prototype；本波补 enabled isolated Zotero scenario 证明 live Item Pane child/sibling attachment preview、selected marker、重复 render cleanup、无 attachment/note/annotation mutation |

## 禁止口径

- 不用单测数量包装完成度。
- 不用功能文件数量包装完成度。
- 不把配置存在等同于功能完成。
- 不把 `zotero-style` 参考项目能力照搬成 ToolsBox 已实现能力。
