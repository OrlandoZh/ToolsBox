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
| 自主开发成熟度 | 中上偏强 | 已到 `agent-assisted` 强阶段，`P2` 与本地发布矩阵收口已完成；当前整体完成度约 `97%`，已可用于实际开发，本轮 Reader 主线已完成唯一 verdict 与单分支收口 |

一句话结论：

**当前仓库已经是"可投入实际开发的 clean-room Zotero 开发底座"，本轮 Reader 主线已收尾完成，后续主要剩下 `ENG-HIGH-103` 的工程化长期增强第一批与长期增强项。**

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
  - 当前 manifest 已按 `2026-03-28` 最新工件切到 `ENG-HIGH-103`：`ENG-HIGH-103 / ENG-LOW-207~210` 是当前 active 的工程化长期增强第一批；`READER-HIGH-123` 已完成唯一 Reader verdict 与单分支收口，现只保留为历史契约源；`ENG-HIGH-102 / ENG-LOW-204~206`、`READER-HIGH-122`、`READER-HIGH-121 / READER-LOW-258~260`、`READER-HIGH-120 / READER-LOW-255~257`、`READER-HIGH-119 / READER-LOW-252~254`、`READER-HIGH-118 / READER-LOW-249~251`、`READER-HIGH-114`、`READER-HIGH-113 / READER-LOW-237~239`、`READER-HIGH-112 / READER-LOW-234~236`、`READER-HIGH-111 / READER-LOW-231~233`、`READER-HIGH-110 / READER-LOW-228~230`、`READER-HIGH-109 / READER-LOW-225~227`、`READER-HIGH-106` 与 `OBSIDIAN-HIGH-101` 均继续只保留为历史契约 / review artifact
  - `READER-LOW-201`、`READER-LOW-202`、`READER-LOW-203` 已于 `2026-03-24` 收口并转入历史 review artifact
  - `READER-HIGH-102`、`READER-LOW-204`、`READER-LOW-205`、`READER-LOW-206` 已于 `2026-03-24` 收口并转入历史 review artifact
  - `READER-HIGH-103`、`READER-LOW-207`、`READER-LOW-208`、`READER-LOW-209` 已于 `2026-03-24` 收口并转入历史 review artifact
  - `READER-HIGH-104`、`READER-LOW-210`、`READER-LOW-211`、`READER-LOW-212` 已于 `2026-03-25` 收口并转入历史 review artifact
  - `READER-HIGH-105`、`READER-LOW-213`、`READER-LOW-214`、`READER-LOW-215` 已于 `2026-03-25` 收口并转入历史 review artifact
  - 上一轮 `P1` canonical fingerprint 收口已以 `reworked-by-codex` 方式完成，并转入历史 review artifact
  - 全链路已验证可用

这说明项目已经进入"可持续推进"阶段，而不是"初步尝试"阶段。

## 2. 当前最重要的后续方向

### 2.1 `ENG-HIGH-103` 已成为当前工程化长期增强批次

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
- 当前真实完成度约为 `97%`；仓库已可继续开发，但 `ENG-HIGH-103` 仍未正式收口
- 当前唯一主线批次已固定为 `ENG-HIGH-103`（工程化长期增强第一批）；`READER-HIGH-123`、`ENG-HIGH-102 / ENG-LOW-204~206` 继续只保留为历史契约 / review artifact 来源
- 当前 `ENG-LOW-207`、`ENG-LOW-208`、`ENG-LOW-209` 已完成本地 milestone commit；`ENG-LOW-210` 暂未提交，需等待 fresh evidence 与文档 truth 一致后再收口
- `2026-03-28` 最新 fresh 证据显示：`watch` 为 `healthy`（`2026-03-28T11:47:43.237Z`），`agent:zotero:e2e` 为 `failed`（`2026-03-28T11:50:18.315Z`），`agent:gate` 当前未通过（`2026-03-28T11:51:26.793Z`，`gatePassed=false`）
- 当前更准确的主阻断归因为 `capture-unstable`：`library` / `reader` 几何仍对齐 `2000x1200`，但视觉采集未稳定；当前应先重跑 `npm run agent:zotero:e2e`，暂不进入 baseline refresh、autofix 或 obsidian-first
- 当前主线只做：runtime 生命周期错误边界与轻量时序遥测、剩余核心脚本入口的共享失败模型、`engineeringHardening` 的 lifecycle/perf 最小摘要、manifest / 文档 / docs consistency 的单一事实源收口
- 当前明确继续延后：远端发布编排、远端 `updateURL` 闭环验证、下一轮 Reader 更深事件点、`P1` 白名单扩面；除非 fresh `watch -> e2e -> gate` 重新出现真实回归
- `LEGAL_RISK_CHECKLIST.md` 中的 Release Gate 继续保持 `release-only` 人工流程，不纳入本批自动化完成定义
- 当前批次收口后，默认下一优先级固定为 `工程化维护文档与自动同步机制`
<!-- CURRENT-TRUTH-SUMMARY:END -->

历史收口层面，以下结论仍然成立：

- `READER-HIGH-123` 已完成唯一分支收口，并转为历史契约源
- `READER-HIGH-102` 与 `READER-LOW-204~206`、`READER-HIGH-103` 与 `READER-LOW-207~209`、`READER-HIGH-109 / READER-LOW-225~227`、`READER-HIGH-110 / READER-LOW-228~230`、`READER-HIGH-111 / READER-LOW-231~233`、`READER-HIGH-112 / READER-LOW-234~236`、`READER-HIGH-113 / READER-LOW-237~239`、`READER-HIGH-118 / READER-LOW-249~251`、`READER-HIGH-119 / READER-LOW-252~254`、`READER-HIGH-120 / READER-LOW-255~257`、`READER-HIGH-121 / READER-LOW-258~260` 均已转入历史契约 / review artifact
- `ENG-HIGH-102 / ENG-LOW-204~206` 已完成并转入历史 review artifact：watch startup health 的 bounded settle 与 truth alignment 已落地，并已把 fresh watch truth 拉回 `healthy`
- `READER-HIGH-106` 仅继续保留 `ui-regression-candidate + complete` 的人工复核分流语义，`OBSIDIAN-HIGH-101` 与 `AGENT_OBSIDIAN_VISUALS=1` 继续只作为历史能力与可选增强层存在

结论：

当前最真实的工作不再是追加新的 Reader 主线，而是诚实处理 fresh evidence 变化，并继续把 `ENG-HIGH-103` 的工程化收口与文档 truth 漂移守住。

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

### 2.3 发布矩阵已完成 stable/beta 实跑并已在本地放行

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
  - 当前 `release-matrix` 与 `agent:gate:release` 已本地通过
- `release-install-smoke` 已在重新打包后同步刷新 `release-preflight`
  - 当前矩阵会直接暴露真实 smoke 失败原因，而不是先被旧 hash 阻断

但还缺：

- 远端发布编排
- updateURL 远端闭环验证

结论：

开发态很强，本地发布态也已经完成 stable/beta 真机闭环；当前串行 low-task 已收尾，且下一轮高逻辑主线已经固定为 `ENG-HIGH-103`（工程化长期增强第一批），不再保留“待重新定义 `P1 / Reader / 工程化` 批次”的开放口径。

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

- 先按 `docs/CURRENT_BACKLOG.md` 的单一事实源推进当前 `ENG-HIGH-103`（工程化长期增强第一批），而不是重新冻结第二套高逻辑主线
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

下一步最应该关注的，不是再证明"模板是否可用"，而是把已经选定的 `ENG-HIGH-103` 批次做实：统一 runtime 生命周期错误边界、共享脚本失败模型、lifecycle/perf 最小摘要与文档一致性守卫；远端 `updateURL` / 发布编排、Reader 更深事件点和 `P1` 扩面继续延后，直到 fresh evidence 重新打开新的批次。
