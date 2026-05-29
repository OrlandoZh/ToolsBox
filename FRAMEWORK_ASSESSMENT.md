# Zotero Cleanroom Template - 框架综合评估报告

> 注意
> 这份报告评估的是"当前仓库作为 clean-room Zotero 模板与 agent-assisted 开发底座的成熟度"，不是 reference 模版的逐项对齐报告。reference 差距请看 [docs/REFERENCE_COMPARISON.md](docs/REFERENCE_COMPARISON.md)。

**评估日期**: `2026-03-28`  
**评估范围**: 完整性 | 开发闭环 | 稳定性 | 可维护性 | 后续缺口

## 执行摘要

| 维度 | 结论 | 说明 |
|------|------|------|
| 完整性 | 强 | 模板骨架、构建、打包、Zotero 真机链路、agent 基础链、Obsidian 工作台、本地发布矩阵基线已齐备 |
| 开发闭环 | 强 | 已具备"验证 -> 恢复 -> 汇总 -> 门禁 -> 人工介入"闭环 |
| 稳定性 | 强 | watch 两级恢复、真机 E2E、gate、dry-run 与人工窗口都已接通 |
| 可维护性 | 中上 | 架构层次清晰，但仍有错误边界、参数校验、性能监控与文档同步等工程欠账 |
| 自主开发成熟度 | 中上偏强 | 已到 `agent-assisted` 强阶段，`P2` 与本地发布矩阵收口已完成；当前整体完成度约 `99%`，已可用于实际开发，当前主阻断已清零 |

一句话结论：

**当前仓库已经是"可投入实际开发的 clean-room Zotero 开发底座"，`ENG-HIGH-103`、`READER-HIGH-124` / `READER-LOW-261~263`、`READER-HIGH-125` 与 `READER-HIGH-126` 均已独立收口，当前已回到稳定单一事实源。**

## 1. 当前做得好的部分

### 1.1 模板骨架已经不是短板

当前仓库已同时具备：

- 清晰的 `app / core / features / platform / services / settings / utils` 分层
- kernel、capability manifest、service registry、resource loader
- build / package / release plan / export project
- 类型定义、文档、场景、测试、示例

这意味着"框架是不是还没搭完"已经不是当前主要问题。

### 1.2 Zotero 真机开发链路已经成熟

当前已具备：

- 隔离 profile / dataDir
- proxy install
- native lifecycle probe
- chrome bootstrap fallback
- `watch` 热重载
- `runtime-recovery`
- `session-restart-recovery`
- `zotero:test` / `zotero:scenario` / `zotero:console`
- 真实数据场景与视觉基线

这套链路已经足以支撑持续开发和真机回归。

### 1.3 Agent 辅助开发闭环已经成型

当前不是"只有零散脚本"，而是已经形成闭环：

- `agent:zotero:e2e`
- `agent:zotero:autofix`
- `agent:monitor`
- `agent:dashboard`
- `agent:gate`
- `agent:zotero:loop`
- `agent:zotero:loop:human`

同时还补上了：

- 结构化诊断
- 候选文件推断
- patch plan 白名单层
- Obsidian 人工介入工作台
- 纯项目导出
- Codex / Opencode 委托分工脚手架
  - `DOC-LOW-001`、`ENG-LOW-102` 已于 `2026-03-23` 被 Codex 审查为 `accepted`
  - `ENG-LOW-201`、`ENG-LOW-202`、`ENG-LOW-203` 已于 `2026-03-24` 以 `reworked-by-codex` 方式完成，并转入历史 review artifact
  - 当前 manifest 已按 `2026-03-30` 最新工作树完成 rebaseline：`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`、`READER-HIGH-124 / READER-LOW-261~263` 的 capture failure 结构化 / `capture-command-failed` blocker / freshest-valid artifact 消费、`READER-HIGH-125` 的 library-only 根因边界冻结，以及 `READER-HIGH-126` 的 library host-noise 修复均已完成独立收口并转为历史契约 / review artifact；当前不再保留 active 的 library-only 架构与规划修复批次；`READER-HIGH-123`、`ENG-HIGH-102 / ENG-LOW-204~206`、`READER-HIGH-122`、`READER-HIGH-121 / READER-LOW-258~260`、`READER-HIGH-120 / READER-LOW-255~257`、`READER-HIGH-119 / READER-LOW-252~254`、`READER-HIGH-118 / READER-LOW-249~251`、`READER-HIGH-114`、`READER-HIGH-113 / READER-LOW-237~239`、`READER-HIGH-112 / READER-LOW-234~236`、`READER-HIGH-111 / READER-LOW-231~233`、`READER-HIGH-110 / READER-LOW-228~230`、`READER-HIGH-109 / READER-LOW-225~227`、`READER-HIGH-106` 与 `OBSIDIAN-HIGH-101` 均继续只保留为历史契约 / review artifact
  - `READER-LOW-201`、`READER-LOW-202`、`READER-LOW-203` 已于 `2026-03-24` 收口并转入历史 review artifact
  - `READER-HIGH-102`、`READER-LOW-204`、`READER-LOW-205`、`READER-LOW-206` 已于 `2026-03-24` 收口并转入历史 review artifact
  - `READER-HIGH-103`、`READER-LOW-207`、`READER-LOW-208`、`READER-LOW-209` 已于 `2026-03-24` 收口并转入历史 review artifact
  - `READER-HIGH-104`、`READER-LOW-210`、`READER-LOW-211`、`READER-LOW-212` 已于 `2026-03-25` 收口并转入历史 review artifact
  - `READER-HIGH-105`、`READER-LOW-213`、`READER-LOW-214`、`READER-LOW-215` 已于 `2026-03-25` 收口并转入历史 review artifact
  - 上一轮 `P1` canonical fingerprint 收口已以 `reworked-by-codex` 方式完成，并转入历史 review artifact
  - 全链路已验证可用

这说明项目已经进入"可持续推进"阶段，而不是"初步尝试"阶段。

## 2. 当前最重要的后续方向

### 2.1 当前最重要的是守住单一事实源并推进非阻断后续

当前已经有：

- 白名单补丁计划
- patch draft
- precheck 预检
- 显式开关下的自动写入与复验
- Reader 事件桥三类低风险补丁
  - `reader-entry:declarative-reader-mapping-drift`
  - `reader-event:toolbar-bridge-registration-drift`
  - `reader-event:fine-grained-hook-declaration-drift`
- `replace-block` 与更细粒度 patch sandbox 护栏
- Reader canonical fingerprint 收口已经完成，并已沉淀到历史 review artifact

Assessment 对“当前完成度 / 当前主线 / 当前剩余项”的判断只认 `docs/CURRENT_BACKLOG.md` 的“当前单一事实源”；这里通过自动同步摘要块复述，不再手写第二套 fresh 结论。

<!-- CURRENT-TRUTH-SUMMARY:START -->
当前主线为 `STYLE-CUSTOM-EXTERNAL-API-OPT-IN-WORKFLOW-WAVE-001`：在用户已要求“先冻结发布”的边界内，推进 `Custom External API` default-off opt-in endpoint invocation preview prototype。本波只在 `customExternalAPI.enabled=true` 且 `customExternalAPI.endpoint` 非空的 isolated scenario / 手动验收中注册 `toolsbox-custom-external-api` Item Pane section；section 只展示本地 item metadata/request preview、endpoint host 与手动 `Run` button。只有用户点击按钮后才向配置 endpoint 发送一次 `invokeExternal` POST JSON 请求，并只渲染响应预览。当前 active expansion wave: `STYLE-CUSTOM-EXTERNAL-API-OPT-IN-WORKFLOW-WAVE-001`；验收主线: `default-off-custom-external-api-opt-in-endpoint-workflow`。

发布冻结继续有效且优先级不变：冻结未解除前禁止执行 `gh release create`、`gh release upload`、真实远端 asset mutation、`npm run release:preflight -- --verify-remote`、`npm run agent:gate:release`，也不改 git remote 或 `config/addon.config.json` 的 `updateURL`。`RELEASE-REMOTE-DISTRIBUTION-WAVE-001` 已完成安全 readiness 检查但未执行发布；上一波 `RELEASE-FREEZE-WAVE-001` 与 `STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001` 的本地 release artifacts、plan-only upload checklist、HTTP `404` readiness blocker、GitHub CLI 未登录状态和 origin / release config mismatch 只作为 retained release background；本波不继续三选一远端发布决策。

已收敛并继续保留的实现口径：`createFeatureComposer({ ..., zotero })` 支持可注入 Zotero 依赖；生产默认继续读 `globalThis.Zotero`。Style-like 直接注册项全部通过显式 pref gate 控制，`annotationColumn.enabled` 是 canonical key，`annotationDistributionColumn.enabled` 仅保留 legacy fallback。缺省未显式开启时，直接 Style prototype 不应注册，也不在偏好设置面板中表现为已可用功能。

Custom External API 当前实现口径：`customExternalAPI.enabled=false` 与 `customExternalAPI.endpoint=""` 继续是默认值，不新增 preference pane 控件。显式启用且 endpoint 非空后才注册 `toolsbox-custom-external-api` Item Pane section；`onRender` 渲染 owner-tagged loading shell，`onAsyncRender` 读取当前 item 的本地 `itemID/key/title/itemType/abstract/doi/tags` metadata 并展示 request preview。手动点击 `.toolsbox-custom-external-api-run-button` 后才调用 `custom/external-api` provider 的 `invokeExternal` capability，POST JSON 固定为 `schemaVersion: 1`、`capability: "invokeExternal"`、`consumer: "customExternalAPI"` 与 allowlisted payload；响应只渲染 status、HTTP status、response preview 与 `networkUsed=true/false`。本波不读取 PDF 全文，不发送 notes/annotations/attachment bytes，不保存 response，不写 Zotero item / note / annotation / attachment，不接 TLDR real summary，不新增 provider key 管理或偏好设置面板入口。

AI provider contract 现在扩展为当前 wave 的 runtime 基座：`noop/mock-local` 继续服务 `TLDR` no-network local preview，`summarizeItem` 仍不联网；新增 `custom/external-api` provider 只支持 `invokeExternal`，只有 `networkPolicy="allow-network"`、`customExternalAPI.enabled=true`、endpoint 非空且合法时才可调用。缺 provider、缺 endpoint、invalid endpoint、pref disabled、timeout、fetch error 都返回稳定 disabled/unavailable/error result，不 throw。

TLDR 现在降为历史 baseline：`tldrPanel.enabled=false` 继续是默认值，不新增 preference pane 控件。显式启用后才注册 `toolsbox-tldr-panel` Item Pane section；`onRender` 渲染 owner-tagged loading shell，`onAsyncRender` 读取本地 metadata 并通过 `noop/mock-local` provider 返回 unavailable/mock result。该 section 展示 request preview、metadata preview、provider status、`networkUsed=false` 与 mock summary preview；不生成真实摘要、不读取 PDF 全文、不请求 OpenAI / custom endpoint、不保存 provider key、不写 Zotero item / note / annotation / attachment。

Style Editor 现在降为历史 baseline：复用现有 `styleEditor.enabled` 与 `styleEditor.css` pref；`styleEditor.enabled=false` 时完全不注册 command / window。显式启用后注册 `toolsbox-style-editor` command，打开 ToolsBox-owned standalone window shell，编辑、Preview、Save、Reset 均围绕本地 `styleEditor.css` pref 工作。Save / Reset 只写 pref，不写文件，不写 Zotero item / note / annotation / attachment；CSS 只注入 ToolsBox-owned scoped root，不 patch Zotero host document。

Paper Matrix Enhanced 现在降为历史 baseline：`paperMatrix.enabled=false` 继续是默认值；`paper matrix enhanced local workflow` 已证明显式启用时复用既有 `toolsbox-paper-matrix` standalone window shell，展示本地只读 enhanced payload、enhanced filters、enhanced columns，并证明不修改 Zotero item / note / annotation / attachment。本波不重新打开 Paper Matrix runtime，不把增强模式升格为默认开启或偏好设置面板入口。

Attachment Version 现在降为历史 baseline：`attachmentVersion.enabled=false` 继续是默认值，不新增偏好面板可操作入口；显式启用时才注册 `toolsbox-attachment-version` Item Pane section。该 prototype 只读取本地 Zotero item / attachment metadata：选中 regular item 时列出 child attachments；选中 attachment 时列出同 parent 下的 sibling attachments 并标记当前选中项。渲染只使用 owner-tagged DOM，重复 render 清理旧节点，`cleanup()` / `destroy()` 幂等 unregister section。它不切换附件、不覆盖文件、不删除附件、不重命名附件、不创建 note、不改 annotation、不接网络/AI。`attachment version enabled preview workflow` scenario 已作为 retained evidence 证明 enabled workflow 可走。

Backlinks functional scope 已收口并保持历史 baseline：开发验收用 `zotero:scenario -- --addon-pref backlinks.enabled=true` pref 注入已证明默认 pref 未开启时 Backlinks section 不注册；显式开启时 live Item Pane local graph/list 与 `.toolsbox-backlinks-drilldown-button` 可选择来源条目，并保持 item fields 与 relations 不变。默认仍为 `backlinks.enabled=false`，不写 Zotero relation，不修改 item/note/annotation 数据，不调用网络，不接 AI。核心 helpers 保持为 `collectBacklinksForItemAsync`、`buildBacklinkGraphForItem` 与 `selectBacklinkSource`。

Merge Annotations 继续作为历史 baseline：已完成本地 annotation 合并预览、ToolsBox 自有 child note writeback/upsert workflow，以及 enabled real Zotero Item Pane button E2E 证据；默认仍为 `mergeAnnotations.enabled=false`，不修改真实 annotation。

Default-off / planned truth 更新为：`Custom External API` 已推进到 opt-in endpoint invocation preview prototype，但默认仍为 `customExternalAPI.enabled=false` 且 endpoint 默认为空，不在 preference pane 暴露为用户可操作项。`TLDR` 已推进到 local no-network Item Pane preview prototype，但真实 TLDR AI summary、provider key management、OpenAI/custom endpoint summary generation 仍是后续独立 wave。`docs/evidence/STYLE_FEATURE_MATRIX.md` 继续作为 feature matrix / evidence 索引，不替代 current truth。Backlinks semantic search / relation writeback / cross-library sync 继续排后。AI enrichment 与其它未完成能力保持 `planned/default-off`，不把缺 API key 当作本轮主阻断。

已收敛的高风险 surface truth：Collection DOM patch、Reader `_iframeWindow`、margin annotation、PDF background 等能力保持 prototype / default-off；已补 availability guard、owner-tagged DOM、幂等 cleanup / destroy 与 lifecycle cleanup。Attachment Preview（`attachmentPreview.enabled=true`）已吸收自 Toolbox/zoterostyle 的 sidePanelArgs + render hijack 侧栏 PDF 预览实现，默认启用。本波不重新打开 Collection DOM patch / Reader / margin annotation / PDF background 这些 surface，不做 host surface 大重写，不把其它 prototype 升格为默认开启或 beta 可用入口。

当前 release-only 历史线 `ENG-HIGH-104 / ENG-LOW-211~213` 已冻结在远端 readiness 之后；真实闭环仍取决于用户解冻、远端仓库 / 认证 / asset 上传确认。`ENG-HIGH-103`、`READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125`、`READER-HIGH-126`、`HOST-HIGH-201 / HOST-LOW-301~303`、`ZOTERO-HOST-POLISH-WAVE-001`、`OPTIONAL-BUNDLE-WAVE-001` 均只作为历史 contract / mirror 背景保留，不覆盖当前 no-network AI provider contract + release freeze 口径。

`P2` 上下文感知记忆与趋势层深化已完成并保留为背景；Style acceptance truth、默认关闭策略、测试链、Backlinks local prototype、Merge Annotations local preview、default-off note writeback workflow、enabled Merge Annotations writeback E2E、enabled Backlinks local graph/drilldown E2E、Backlinks full UI visual evidence 分类、Zotero 真机验收闭环、release local preflight、release freeze closure、feature matrix、default-off local Attachment Version prototype、Paper Matrix Enhanced local field/filter/sort preview、Style Editor local CSS prototype、AI provider no-network contract 与 TLDR local Item Pane no-network preview 已作为历史基线收口。历史 Style waves retained: `STYLE-PROTOTYPE-HARDENING-WAVE-001`、`STYLE-BACKLINKS-LOCAL-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-PREVIEW-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-WRITEBACK-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-WRITEBACK-E2E-WAVE-001`、`STYLE-BACKLINKS-LOCAL-GRAPH-E2E-WAVE-001`、`STYLE-BACKLINKS-VISUAL-EVIDENCE-CLOSURE-WAVE-001`、`STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001`、`RELEASE-FREEZE-WAVE-001`、`STYLE-FEATURE-MATRIX-AND-ATTACHMENT-VERSION-WAVE-001`、`STYLE-ATTACHMENT-VERSION-ENABLED-E2E-WAVE-001`、`STYLE-PAPER-MATRIX-ENHANCED-LOCAL-WAVE-001`、`STYLE-EDITOR-LOCAL-CSS-PROTOTYPE-WAVE-001`、`STYLE-AI-PROVIDER-CONTRACT-NO-NETWORK-WAVE-001`、`STYLE-TLDR-LOCAL-ITEM-PANE-PROTOTYPE-WAVE-001`。本波不追 `zotero-style` 100% 复刻，只补 Custom External API default-off opt-in endpoint invocation preview prototype。
<!-- CURRENT-TRUTH-SUMMARY:END -->

历史收口层面，以下结论仍然成立：

- `READER-HIGH-123` 已完成唯一分支收口，并转为历史契约源
- `READER-HIGH-102` 与 `READER-LOW-204~206`、`READER-HIGH-103` 与 `READER-LOW-207~209`、`READER-HIGH-109 / READER-LOW-225~227`、`READER-HIGH-110 / READER-LOW-228~230`、`READER-HIGH-111 / READER-LOW-231~233`、`READER-HIGH-112 / READER-LOW-234~236`、`READER-HIGH-113 / READER-LOW-237~239`、`READER-HIGH-118 / READER-LOW-249~251`、`READER-HIGH-119 / READER-LOW-252~254`、`READER-HIGH-120 / READER-LOW-255~257`、`READER-HIGH-121 / READER-LOW-258~260` 均已转入历史契约 / review artifact
- `ENG-HIGH-102 / ENG-LOW-204~206` 已完成并转入历史 review artifact：watch startup health 的 bounded settle 与 truth alignment 已落地，并已把 fresh watch truth 拉回 `healthy`
- `READER-HIGH-106` 仅继续保留 `ui-regression-candidate + complete` 的人工复核分流语义，`OBSIDIAN-HIGH-101` 与 `AGENT_OBSIDIAN_VISUALS=1` 继续只作为历史能力与可选增强层存在

结论：

当前最真实的工作不再是继续扩任何已完成的 `READER-HIGH-*` 批次，而是守住当前单一事实源，并把下一轮默认架构与规划任务源切到 `ENG-HIGH-104 / ENG-LOW-211~213`：只处理远端发布编排、远端 `updateURL` 闭环验证，以及其现有 release consumer 对齐。

### 2.2 `P2` 上下文感知记忆/趋势深化已完成，本轮不再是主线缺口

当前 monitor / dashboard 与独立 `agent:memory` 工件已经开始沉淀：

- `failure memory`
- `fix outcome memory`
- 当前故障是否见过
- 历史最优恢复路径
- 初级历史推荐
- 最近多日趋势摘要
- 阻塞原因趋势
  - 当前已不只覆盖 autofix blocker，也会吸收 `watch / e2e / gate / watchRecovery` 历史原因
- 重点指纹时间序列
- `dist/agent-memory/` 归档区
- `watch / e2e / autofix / watchRecovery / gate` 运行信号趋势
- `releaseMatrix` 运行信号趋势
- `zoteroVersion` / `zoteroVersionBucket` / `latestBootMode` 运行上下文
- `preferredStrategy` 的上下文优先推荐
  - 当前会区分 `exact-context`、`strategy-global`、`fingerprint-global`
- `currentIncident` 的上下文命中级别、上下文成功率与全局成功率
- 指纹归档里的 Top context 切片

本轮已经完成的关键判断是：

- `P2` 不应再被写成"当前未完成主线"
- 同类故障已经可以按 `latestBootMode + zoteroVersionBucket` 优先命中历史最佳路径
- 发布矩阵也已经进入记忆/趋势工件，而不再是孤立报告

后续仍可继续增强，但属于长期可选扩展，而不是当前主线：

- 更细粒度的全域多轮趋势
- 跨更多功能域稳定复用的强推荐路径
- 更长时间窗口、跨更多版本桶的历史经验

结论：

agent 现在已经能"利用历史经验、结合上下文优先推荐并展示多信号趋势"，后续要做的是继续扩信号域和长期经验颗粒度，而不是补 P2 的从 0 到 1。

### 2.3 发布矩阵已完成 stable/beta 实跑，剩余缺口仅远端 update.json 内容未达标

当前已有：

- 本地发布计划
- 本地 release preflight
- 本地 update / release manifest 生成
- 本地 stable/beta 发布矩阵工件
  - `dist/release-matrix.json`
  - `dist/release-matrix.md`
- 正式安装态 smoke 脚本入口
  - `npm run release:install-smoke:stable`
  - `npm run release:install-smoke:beta`
- 发布矩阵已接入 monitor / dashboard / release gate
- stable / beta 真机安装态 smoke 记录
  - 两个渠道都已确认正式安装成功、`readinessMode === native`、`apiReady === true`
- 安装态 runtime error 已完成分类与收口
  - 真实插件阻断 `menus[0]["l10nID"] must be string` 已定位并修复
  - `remote-settings.sys.mjs` 与 `loading.svg` 已归类为宿主噪声
  - 当前 stable / beta 两条 profile 已通过，安装态 smoke 不再是 release gate 阻断来源
  - 当前整体 `release-matrix` 仍为 `failed`，`agent:gate:release` 仍会阻断，但唯一原因是当前 Gitee `update.json` 未包含 `cleanroom-template@example.com` 首条更新记录，且未提供有效 `update_link`
- `release-install-smoke` 已在重新打包后同步刷新 `release-preflight`
  - 当前矩阵会直接暴露真实 smoke 失败原因，而不是先被旧 hash 阻断

但还缺：

- 远端发布编排
- updateURL 远端闭环验证

结论：

开发态很强，本地发布态也已经完成 stable/beta 真机闭环；当前剩余的不是安装态 smoke，而是远端 Gitee `update.json` / `update_link` 内容修正。当前串行 low-task 已收尾，`READER-HIGH-126` 也已完成历史收口；后续不再保留“当前 active 是 library-only 回归修复”的开放口径，而是以上方自动同步摘要块中的单一事实源为准。

### 2.4 Reader 本轮 7 个更深事件点已落地

当前 Reader 侧已覆盖：

- Reader 打开
- 活动上下文摘要
- 交互摘要与交互快照
- 批注创建 / 更新 / 删除回环
- UI 状态快照
- 官方 Reader 事件 API 注册 / 注销 / 监听器快照
- `renderTextSelectionPopup` 主动探针
- `renderSidebarAnnotationHeader` 主动探针
- `createAnnotationContextMenu` / `createColorContextMenu` / `createViewContextMenu` / `createThumbnailContextMenu` / `createSelectorContextMenu` 主动探针

当前这一轮新增完成：

- `文本选择浮层分发方式`
- `文本选择浮层追加项数量`
- `侧栏批注头部分发方式`
- `侧栏批注头部追加项数量`
- `context menu probe 数量`
- `context menu 已观测类型集合`
- `context menu synthetic-fallback 类型集合`

后续仍可继续：

- 下一轮更深的 Reader 宿主事件点
- 更细粒度的宿主 UI 注入与对应视觉回归点

结论：

Reader 已不再是"只有轻量 demo"的状态；本轮 7 个更深事件点已完成接入与摘要收口，后续如继续推进，应基于新证据重新定义下一轮观测点。

## 3. 工程化后续项

这些不属于"阻塞当前开发"；当前工程化实施与交付收口已转入历史 review artifact，后续仍可继续补齐更长期的维护项：

- 错误字段回归测试
- 展示一致性
- 文档收口
- 缺少全局错误边界
- 部分模块参数验证仍可加强
- HTTP 超时与相关策略可继续增强
- 缺少性能监控点

这些问题不会立刻阻止模板使用，但会影响长期维护和多人协作。

## 4. 文档层问题

这次扫描发现一个很实际的问题：

**评估类文档必须跟随最新真机工件一起更新。**

本轮已重点校正的文档：

- [FRAMEWORK_CHECKLIST.md](FRAMEWORK_CHECKLIST.md)
- [FRAMEWORK_ASSESSMENT.md](FRAMEWORK_ASSESSMENT.md)
- [docs/CURRENT_BACKLOG.md](docs/CURRENT_BACKLOG.md)
- [docs/AGENT_AUTONOMY_ROADMAP.md](docs/AGENT_AUTONOMY_ROADMAP.md)

如果这些文档不跟着 `agent:zotero:e2e`、`agent:monitor` 的最新结果更新，就会把"已完成能力"误判成"仍未完成"。

## 5. 当前优先级建议

### 第一优先级

- 先按 `docs/CURRENT_BACKLOG.md` 的“当前单一事实源”维持稳定口径，不再把已完成的 `READER-HIGH-126` 或更早批次重新写成 active 主线
- 继续让补丁复验合同、sandbox、Reader 证据点与工程化长期增强建立在最新真实缺口上
- 保持正式文档与 accepted review artifact、最新工件同步
- 当前批次收口后的默认下一优先级不再在 Assessment 单独改写，统一以上方自动同步摘要块为准；这里仅保留“先减少 manifest / 正式文档 / docs consistency 漂移”的分析判断

### 第二优先级

- 按需选择下一轮 `P1` 白名单候选边界
- 按需选择下一轮 Reader 更深 iframe / host 证据点
- 补工程化长期维护项与持续文档同步机制

### 第三优先级

- 继续扩 P2 的长期趋势域
- 继续扩跨版本、跨上下文的历史归档跨度
- 为更远阶段的发布自动编排预留接口

## 6. 适合继续推进的判断

如果问题是：

"这个项目现在还缺不缺基础框架？"

结论是：

**不缺。**

如果问题是：

"这个项目离完整的 agent 自主开发还有没有缺口？"

结论是：

**有，但已经不是这批已完成的实施与交付任务；主要集中在下一轮架构与规划和长期工程化增强。**

## 7. 最终判断

### 当前定位

当前仓库更准确的定位应该是：

**可投入开发的 clean-room Zotero 插件模板 + 强化版 agent-assisted 开发底座**

而不是：

- 早期实验性模板
- 仅有少量 demo 的示例仓库
- 已完成完全自主开发能力的终态系统

### 状态结论

| 判断项 | 结论 |
|------|------|
| 可否继续实际开发 | ✅ 可以 |
| 可否进入真机持续回归 | ✅ 可以 |
| 可否支持人工 + agent 协同开发 | ✅ 可以 |
| 可否视为完整 autonomous framework | ❌ 还不能 |

下一步最应该关注的，不是再证明"模板是否可用"，也不是把已完成的 `READER-HIGH-126` 重新写成 active；而是继续维持 fresh `watch -> e2e -> monitor -> gate` 证据链，并按 `ENG-HIGH-104 / ENG-LOW-211~213` 推进远端 `updateURL` / 发布编排这条非阻断后续，再把 Reader 更深事件点和 `P1` 扩面排到其后。
