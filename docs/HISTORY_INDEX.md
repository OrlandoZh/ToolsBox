# HISTORY_INDEX.md

> 历史索引页。这里只记录历史动机、已吸收经验、研究归档与替代关系，不记录当前状态。
> 更新时间：2026-04-14

## Milestones / Decision Records

| date | kind | scope | why_it_mattered | retained_value | superseded_by | path |
|------|------|-------|-----------------|----------------|---------------|------|
| 2026-03-20 | milestone | clean-room 分层重构计划 | 首次把 settings / service / kernel / feature / agent contract 分层明确写成系统方案 | 保留重构动机、阶段边界与早期分层依据 | [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md), [ARCHITECTURE.md](./ARCHITECTURE.md) | [CLEANROOM_REFACTOR_PLAN.md](./CLEANROOM_REFACTOR_PLAN.md) |
| 2026-04-08 | decision-record | 参考快照不入主仓 | 固化本地 `reference/` 快照只作为研究输入，不进入主仓源码历史 | 保留 clean-room 研究输入边界与导出约束 | [REFERENCE_INDEX.md](./REFERENCE_INDEX.md) | [REFERENCE_SNAPSHOTS.md](./REFERENCE_SNAPSHOTS.md) |
| 2026-04-16 | decision-record | 路线 4 本地存储优先级 | 明确未来若进入轻服务能力，本地缓存应把 `zotero.sqlite` 视为优于 `prefs` / 明文文件的隐蔽载体，但不得误判成安全边界 | 保留“何时优先 sqlite、何时继续用 prefs、何时不应本地保存”的决策矩阵 | [PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md), [OPTIONAL_BUNDLES.md](./OPTIONAL_BUNDLES.md) | [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md) |

## Capability / Pitfall History

| date | kind | scope | why_it_mattered | retained_value | superseded_by | path |
|------|------|-------|-----------------|----------------|---------------|------|
| 2026-04-08 | capability | AIAssistant 踩坑经验模板化 | 把宿主 contract、Fluent、ItemPane 和 preference pane 的真实坑点转成模板护栏 | 保留“为什么要有这些 guardrail”的历史原因 | [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md), [PREFERENCE_PANE_GUIDE.md](./PREFERENCE_PANE_GUIDE.md), [API.md](./API.md) | [AIASSISTANT_PITFALLS.md](./AIASSISTANT_PITFALLS.md) |
| 2026-04-08 | capability | React 面板创建与切换经验抽取 | 把 `AIAssistant` 的 host-mounted React surface 与 window mode 经验抽成 clean-room 模式 | 保留通用模式来源与不应直接模板化的产品边界 | [UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md), [OPTIONAL_BUNDLES.md](./OPTIONAL_BUNDLES.md) | [REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md](./REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md) |
| 2026-04-14 | capability | AIAssistant 经验吸收表达层收口 | 把下游项目里仍有价值的偏好页验证语言和 host-visible 成熟度标签，收口到模板 guide/router，而不是再造一套新产品能力 | 保留当前 authoritative guide、router 和文档 vocabulary 的来源说明 | [PREFERENCE_PANE_GUIDE.md](./PREFERENCE_PANE_GUIDE.md), [UI_VALIDATION_PATHS.md](./UI_VALIDATION_PATHS.md), [AGENT_INDEX.md](./AGENT_INDEX.md) | [PREFERENCE_PANE_GUIDE.md](./PREFERENCE_PANE_GUIDE.md) |
| 2026-04-16 | capability | 手动受保护打包分支经验收口 | 把 `encrypted / shielded` 分支的真实性能、可解读性与威胁模型边界收成模板经验，避免后续再次回到重 loader 卡顿方案 | 保留“为什么 `encrypted` 更稳、为什么 `shielded` 必须 loader-lite、下一步性能该盯 decode”的历史依据 | [GUIDE.md](./GUIDE.md), [README.md](../README.md) | [PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md) |
| 2026-04-16 | capability | 整体保护导出路线系统化 | 把 `plain / encrypted / shielded / inner semantic scrub / 路线4 / Wasm` 的优先级和分阶段实验收成一条统一路线，避免在不同 hardening 分支之间反复横跳 | 保留“下一步该先 trim raw export 还是 inner bundle semantics”的稳定判断路径 | [PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md), [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md) | [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md) |

## Research / Archive Routes

| date | kind | scope | why_it_mattered | retained_value | superseded_by | path |
|------|------|-------|-----------------|----------------|---------------|------|
| 2026-04-08 | research | BibGenie 路线与 UI/架构借鉴 | 保留某个重点参考项目的专项分析入口 | 需要回看单一参考来源时的路由入口 | [REFERENCE_INDEX.md](./REFERENCE_INDEX.md), [UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md) | [REFERENCE_BIBGENIE_ANALYSIS.md](./REFERENCE_BIBGENIE_ANALYSIS.md) |
| 2026-04-08 | research | 跨项目参考对比快照 | 保留多参考项目对比的阶段性结论 | 需要复核“为什么选这条路线”时的对照入口 | [REFERENCE_INDEX.md](./REFERENCE_INDEX.md) | [REFERENCE_COMPARISON.md](./REFERENCE_COMPARISON.md) |

## 使用规则

- 当前主线、当前 blocker、当前 wave 只认 [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)
- 本页只负责承接“为什么当时这么做”“哪些历史材料仍值得回看”
- 若新增历史长文、阶段快照或已收口专题，优先先补本页，再决定是否迁入单独历史目录
