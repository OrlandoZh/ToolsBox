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
  - 当前 manifest 已按 `2026-03-30` 最新工作树完成 rebaseline：`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`、`READER-HIGH-124 / READER-LOW-261~263` 的 capture failure 结构化 / `capture-command-failed` blocker / freshest-valid artifact 消费、`READER-HIGH-125` 的 library-only 根因边界冻结，以及 `READER-HIGH-126` 的 library host-noise 修复均已完成独立收口并转为历史契约 / review artifact；当前不再保留 active 的 library-only 高逻辑修复批次；`READER-HIGH-123`、`ENG-HIGH-102 / ENG-LOW-204~206`、`READER-HIGH-122`、`READER-HIGH-121 / READER-LOW-258~260`、`READER-HIGH-120 / READER-LOW-255~257`、`READER-HIGH-119 / READER-LOW-252~254`、`READER-HIGH-118 / READER-LOW-249~251`、`READER-HIGH-114`、`READER-HIGH-113 / READER-LOW-237~239`、`READER-HIGH-112 / READER-LOW-234~236`、`READER-HIGH-111 / READER-LOW-231~233`、`READER-HIGH-110 / READER-LOW-228~230`、`READER-HIGH-109 / READER-LOW-225~227`、`READER-HIGH-106` 与 `OBSIDIAN-HIGH-101` 均继续只保留为历史契约 / review artifact
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
- 当前真实完成度仍约为 `99%`；`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`、`READER-HIGH-124 / READER-LOW-261~263` 的 capture / freshness 收口、`READER-HIGH-125` 的 library-only 根因边界冻结、以及 `READER-HIGH-126` 的 library host-noise 修复继续保留为历史契约 / review artifact；`2026-04-06` 这轮前台 `npm run check` 继续通过，fresh `watch -> e2e -> monitor -> gate` 已把当前开发态重新拉回 `stable / ready`
- 当前 active 高逻辑已切到 `HOST-HIGH-201`：本轮只收紧 `preference pane`、`context pane`、`item pane sidenav`、`reader renderToolbar / sidebar view` 与 `menu item` 的交互一致性、贴边式 geometry 与 surface-local evidence；release-only 的 `ENG-HIGH-104 / ENG-LOW-211~213` 继续保留为次级 follow-up，不回写为当前主阻断
- latest live rerun 现已刷新到 `2026-04-06T02:55:03.754Z` 的 `agent:zotero:e2e:update-baseline`：本轮在确认 `preference pane` 文案随 Zotero 语言切换属于预期 UI 变化后，受控刷新了一次 preference-pane / Reader canonical baseline；fresh compare 模式 E2E 继续稳定生成完整 `dist/agent-zotero-e2e.{json,md}`，`restart` 与 `hot-reload` 两轮均通过，`tests/scenarios` 继续保持 `0` 失败，`visualEvidenceSummary` 已回到 `library / reader / surface-preference-cleanroomtemplate-preferences / surface-item-pane-cleanroomtemplate-details` 全部对齐
- 当前 `visual-required` host-polish 判据已回到“blocking `surface-local` evidence 优先”：whole-window `library / reader` 漂移继续保留为 supplemental `capture-unstable` 诊断与归档样本，不再单独阻断 `HOST-HIGH-201 / HOST-LOW-301~303` 这轮 gate
- 当前插件可见文案已统一跟随 Zotero 语言：`menu item`、Reader View 菜单项、`preference pane` 与 `item pane` 基线现统一复用 `main.ftl + i18n bridge`，内置 locale 覆盖 `en-US / zh-CN / zh-TW`
- 最新 bounded foreground `zotero:watch` 已在 `2026-04-06T02:56:31.821Z` 刷新为 `healthy`：startup health 通过、`latestPassed=true`，当前不再把过期 watch 工件视为开发态主阻断
- 最新开发态 `agent:monitor` / `agent:gate` 已在 `2026-04-06T02:57:08.129Z` / `2026-04-06T02:57:08.402Z` 消费 fresh E2E + watch 工件并回到 `stable / ready`；当前 `gatePassed=true`，frontpage headline 已重新固定为“watch、真机验证与恢复回归均已通过，当前闭环状态稳定”
- 最新 focused live probe `reader surface smoke` 已在 `2026-04-04T10:03:46.084Z` 通过，说明 Reader surface smoke 不只停留在历史 E2E 工件，而是继续可在真机单场景复现
- `agent:context` 已新增统一只读上下文层：当前会输出 `dist/agent-context.{json,md}`，汇总 stable / dynamic context、decision hints 与 drift signals；本轮已新增 `runtime-compact-v1` 只读派生视图，默认只暴露 truth/action/status/drift/evidence/artifact refs + freshness/budget，并已接入 gate、Obsidian 工作台、dashboard 与 delegation runtime prompt；`agent:context:guard` 当前继续保持 warning-only
- 当前已显式进入 `ZOTERO-HOST-POLISH-WAVE-001`：以 `config/project-validation-surfaces.json` 与现有 host action / surface smoke 为主轴，优先收紧 live interaction consistency、edge-attached geometry 和 surface-local evidence；上一轮 `OPTIONAL-BUNDLE-WAVE-001` 继续视为已完成基线
- 当前 wave 验收主线：`host-first -> live geometry / interaction consistency -> surface smoke -> surface-local evidence -> full gate`
- 当前唯一 optional bundle registry 仍是 `config/optional-bundles.json`；`react-ui` 当前固定为 `ts-isolated + implemented + enabled=false`，`agent-runtime` 固定为 `ts-isolated + planned + enabled=false`，`ai-service` 固定为 `js-core + planned + enabled=false`，本轮不把它们重新拉回当前扩波主线
- 当前模板已把 Lisianthus 抽出的 `file-state-store`、`task-runner`、`task-queue`、`zotero-file-storage`、`zotero-json-state-store` 与 `window-shell + theme-manager + host action gating` 视为已入基线的 JS-core 能力；`build:react-ui` 继续只服务默认禁用的 demo lane，不把 React/TS 依赖回灌进模板核心
- 本 wave 当前 in-scope surfaces 继续写入 `config/project-validation-surfaces.json`：覆盖 `preference pane`、`context pane`、`item pane sidenav`、`reader renderToolbar`、`reader sidebar view` 与 `menu item`，当前批次只补这些已声明 surface 的 polish，不新开产品 surface
- 当前宿主可见 UI 主链已基本实现：`preference pane`、`context pane`、`item pane sidenav`、`reader renderToolbar`、`reader sidebar view`、`menu item` 与窗口级 + 元素级主题 contract 已具备模板级基线、host action / surface smoke / surface-local evidence；当前批次默认转向交互一致性、贴边布局和复用细节，不把这一轮描述成“UI 已完全封板”
- `details.runtimeSanitization` 已稳定透传到 direct E2E / monitor / gate：本轮 direct E2E 记录了 `exclusiveProjectRuntime=true`，并在启动前终止了 project-managed `watch` `zotero` / `plugin-container`；旧的 startup/RDP bring-up timeout 口径继续只保留为已收口的诊断能力
- 最新 library `pre-capture settle` 继续收敛到 `visibleBannerIDs=[mac-word-plugin-install-container]`；`sync-reminder-container`、`post-upgrade-container`、`file-renaming-banner-container`、`retracted-items-container` 与 `architecture-warning-container` 会在 capture 前被压平，当前 `library / reader` 几何继续保持 `2000x1200`
- `reader` pre-capture settle 本轮已不再被 `hasMatchingWindowState=false` 卡死：当前 direct E2E 会接受 `selectedTabMatched=true` 作为 Reader ready 的等价信号，并在 settle snapshot 中显式记录 `selectedTabID / selectedTabMatched`
- `preference pane`、`context pane` 与 `menu item` 的 surface-local evidence 已在本轮重新对齐到当前语义：`preference pane` 现按 descendant content root + bounded geometry settle 取样，`context pane` baseline 已刷新到 pane fragment，`menu item`/popup 则新增 windowless screen-metrics fallback；`reader sidebar view` 在 live `rect` 缺失时也会按 `windowBounds + sidebarWidth` 合成本地 capture rect，当前 host polish 批次继续把 `item pane sidenav` 与 `reader sidebar view` 的 edge-mode geometry 和显式 degrade contract 收到同一套结果链里
- `READER-LOW-261` 已把 stage-scoped capture failure 结构化落进既有 E2E / validation 展示链；`READER-LOW-262` 已引入 `capture-command-failed` / `visualPrimaryBlockerKind=capture-command-failed` 并同步 consumer；`READER-LOW-263` 在本轮进一步把 visual screenshot capture 链收口到“优先按 Zotero on-screen window id 采集、避免抓到桌面或重叠窗”的状态，当前主结论已更新为“surface-local evidence fully aligned，whole-window drift 只作为 supplemental `capture-unstable` 诊断保留”
- 最新 release live acceptance 已在 `2026-04-04` 重新补齐 stable / beta 正式安装态 smoke：`release-install-smoke-beta` / `release-install-smoke-stable` 分别在 `2026-04-04T11:51:00.836Z` / `2026-04-04T11:51:01.248Z` 记录 `readinessMode=native`、`apiReady=true`，且剩余 `loading.svg` / `remote-settings.sys.mjs` 已归类为宿主噪声
- 最新 `release-preflight` / `release-plan` / `release-matrix` 已在 `2026-04-04T11:53:52.789Z` / `2026-04-04T11:54:00.719Z` / `2026-04-04T11:54:09.269Z` 刷新为 `远端验证失败 / failed`；`release-plan` 现已显式写入 `workflowState`、`gateContract` 与 `nextSteps`，并要求通过 `npm run agent:release` 记录 `release-plan` 遥测，单独的 `dist/release-plan.json` 不再视为充分 gate 证据
- 最新 `agent:monitor` / `agent:gate:release` 已在 `2026-04-04T11:54:15.771Z` / `2026-04-04T11:54:15.996Z` 消费最新 release artifacts；当前 `gatePassed=false` 的唯一原因是远端 `https://gitee.com/zouser/user/releases/download/1.1/update.json` 虽然 `updateURLHTTPStatus=200`，但未包含 `cleanroom-template@example.com` 首条更新记录，且未提供有效 `update_link`，而不是安装态 smoke 或插件运行时回归
- 当前 Gitee `updateURL` 仅用于这个模板仓库自身的远端发布验收与测试，不作为基于本模板开发的其他插件默认发布地址；下游项目仍需在各自 `config/addon.config.json` 中替换自己的 `addonId` / `homepage` / `updateURL`
- 当前 active 开发阻断已清零；fresh `watch -> e2e -> monitor -> gate` 证据链现已闭环通过，当前主批次为 `HOST-HIGH-201 / HOST-LOW-301~303` 的 host-visible polish，而 release-only 工程 gap（`ENG-HIGH-104 / ENG-LOW-211~213`）与 Reader deeper event / `P1` 扩面继续只保留为次级 follow-up
<!-- CURRENT-TRUTH-SUMMARY:END -->

历史收口层面，以下结论仍然成立：

- `READER-HIGH-123` 已完成唯一分支收口，并转为历史契约源
- `READER-HIGH-102` 与 `READER-LOW-204~206`、`READER-HIGH-103` 与 `READER-LOW-207~209`、`READER-HIGH-109 / READER-LOW-225~227`、`READER-HIGH-110 / READER-LOW-228~230`、`READER-HIGH-111 / READER-LOW-231~233`、`READER-HIGH-112 / READER-LOW-234~236`、`READER-HIGH-113 / READER-LOW-237~239`、`READER-HIGH-118 / READER-LOW-249~251`、`READER-HIGH-119 / READER-LOW-252~254`、`READER-HIGH-120 / READER-LOW-255~257`、`READER-HIGH-121 / READER-LOW-258~260` 均已转入历史契约 / review artifact
- `ENG-HIGH-102 / ENG-LOW-204~206` 已完成并转入历史 review artifact：watch startup health 的 bounded settle 与 truth alignment 已落地，并已把 fresh watch truth 拉回 `healthy`
- `READER-HIGH-106` 仅继续保留 `ui-regression-candidate + complete` 的人工复核分流语义，`OBSIDIAN-HIGH-101` 与 `AGENT_OBSIDIAN_VISUALS=1` 继续只作为历史能力与可选增强层存在

结论：

当前最真实的工作不再是继续扩任何已完成的 `READER-HIGH-*` 批次，而是守住当前单一事实源，并把下一轮默认高逻辑任务源切到 `ENG-HIGH-104 / ENG-LOW-211~213`：只处理远端发布编排、远端 `updateURL` 闭环验证，以及其现有 release consumer 对齐。

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

这些不属于"阻塞当前开发"；当前工程化低逻辑收口已转入历史 review artifact，后续仍可继续补齐更长期的维护项：

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

**有，但已经不是这批已完成的 low tasks；主要集中在下一轮高逻辑规划与长期工程化增强。**

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
