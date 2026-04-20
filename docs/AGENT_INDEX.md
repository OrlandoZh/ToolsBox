# Agent 接手索引

> 用途：把接手者先导向当前 truth，再导向 mirror、实现 contract、历史索引和参考路由。
> 最后更新：2026-04-14

## 必读顺序

1. [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)
   当前主线、当前 blocker、当前范围只认这里。
2. [../config/project-expansion-wave.json](../config/project-expansion-wave.json), [../config/project-validation-overrides.json](../config/project-validation-overrides.json)
   具体 in-scope / out-of-scope / acceptance track / validation override 只认这里。
3. [../AGENTS.md](../AGENTS.md), [../CLAUDE.md](../CLAUDE.md)
   `AGENTS.md` 是主协作 contract；`CLAUDE.md` 是 Claude Code 的 controller 入口 overlay，但遇到冲突时仍应回到同一套 truth 与治理语义。

## 按任务跳转

| 任务 | 先读什么 | 什么时候再继续读 |
|------|----------|------------------|
| 当前主线 / 当前 blocker / 当前验收 | [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md) | 需要机器可读范围或 validation 判定时再看 `project-expansion-wave.json` / `project-validation-overrides.json` |
| Wasm 开发 / Zotero 插件内加载 Wasm / Wasm 小内核 PoC | [WASM_DEVELOPMENT_INDEX.md](./WASM_DEVELOPMENT_INDEX.md) | 需要回到整体保护路线时再看 [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md)、[PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md) 与 [PACKAGE_PROTECTION_WASM_STAGE2_DERIVATION_PLAN.md](./PACKAGE_PROTECTION_WASM_STAGE2_DERIVATION_PLAN.md) |
| UI 创建路线 | [UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md) | 需要判断验证路线时再看 [UI_VALIDATION_PATHS.md](./UI_VALIDATION_PATHS.md) |
| Host-visible 验收成熟度 / 手工矩阵标签 | [UI_VALIDATION_PATHS.md](./UI_VALIDATION_PATHS.md) | 需要具体 surface contract 时再看 [VALIDATION_SURFACES.md](./VALIDATION_SURFACES.md) |
| Debug probe 编排 / 失败后自动追问策略 | [ZOTERO_DEBUG_PROBE_CONTRACT.md](./ZOTERO_DEBUG_PROBE_CONTRACT.md) | 需要看当前 runner / scenario 能力边界时再看 [ZOTERO_TESTING.md](./ZOTERO_TESTING.md) |
| 受保护打包路线 / 实验矩阵 | [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md), [PACKAGE_PROTECTION_EXPERIMENT_MATRIX.md](./PACKAGE_PROTECTION_EXPERIMENT_MATRIX.md) | 需要看已验证经验或攻击分级时，再看 [PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md) 与 [PACKAGE_PROTECTION_ATTACK_GRADING.md](./PACKAGE_PROTECTION_ATTACK_GRADING.md)；若任务聚焦“复用现有后端做 route4 快速应用”，再看 [PACKAGE_PROTECTION_ROUTE4_LEGACY_BACKEND_PLAN.md](./PACKAGE_PROTECTION_ROUTE4_LEGACY_BACKEND_PLAN.md) |
| 菜单项 / 子菜单 / 右键菜单 / `popupshowing` | [REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md) | 需要跨项目通用链时再看 [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) |
| React 面板创建 / 切换 / window mode | [REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md](./REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md) | 需要回到模板默认 UI 路线时再看 [UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md) |
| Preference Pane / XUL + bridge / host-visible smoke | [PREFERENCE_PANE_GUIDE.md](./PREFERENCE_PANE_GUIDE.md) | 需要看真实踩坑来源时再看 [AIASSISTANT_PITFALLS.md](./AIASSISTANT_PITFALLS.md)；需要看验收成熟度时再看 [UI_VALIDATION_PATHS.md](./UI_VALIDATION_PATHS.md) |
| Zotero 宿主接口 / 术语 / surface 语义 | [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md), [ZOTERO_TERMINOLOGY_GUIDE.md](./ZOTERO_TERMINOLOGY_GUIDE.md) | 需要字段、事件和枚举语义时再看 [ZOTERO_HOST_SEMANTIC_INDEX.md](./ZOTERO_HOST_SEMANTIC_INDEX.md) |
| 参考项目选择 | [REFERENCE_INDEX.md](./REFERENCE_INDEX.md) | 需要深入正文时再进入对应参考分析文档 |
| 已完成能力 / 历史结论 / 旧阶段材料 | [HISTORY_INDEX.md](./HISTORY_INDEX.md) | 只有明确要复盘时再打开对应正文 |
| 用户使用与上手说明 | [GUIDE.md](./GUIDE.md) | 它是用户指南，不是 project truth，也不是当前实现 contract |

## 当前路由层

- 当前真相：`CURRENT_BACKLOG.md`
- 当前 mirror：`config/project-expansion-wave.json`、`config/project-validation-overrides.json`
- 当前历史路由：`HISTORY_INDEX.md`
- 当前参考路由：`REFERENCE_INDEX.md`
- 当前实现 contract：`UI_CREATION_PATHS.md`、`UI_VALIDATION_PATHS.md`、`PREFERENCE_PANE_GUIDE.md`、`ZOTERO_HOST_INTERFACE_CONTRACTS.md`、`ZOTERO_HOST_SEMANTIC_INDEX.md`
- 调试支线设计：`ZOTERO_DEBUG_PROBE_CONTRACT.md`

## 不要默认阅读

- `dist/`
  只作派生工件与运行态摘要，不是事实源。
- `docs/CLEANROOM_REFACTOR_PLAN.md`
  这是历史方案与演进背景，不是当前阶段 truth。
- 具体参考分析正文
  只有在 `REFERENCE_INDEX.md` 已经帮你缩小范围后再进入。
- `docs/GUIDE.md`
  这是用户指南，不替代当前 truth、mirror 或实现 contract。

## 维护规则

- `CURRENT-TRUTH-SUMMARY` 仍只从 `CURRENT_BACKLOG.md` 同步到 `README.md`、`FRAMEWORK_CHECKLIST.md`、`FRAMEWORK_ASSESSMENT.md` 与 `docs/AGENT_AUTONOMY_ROADMAP.md`
- 不要在本页写 active wave 细节、时间戳、参考项目总数、长篇教程正文或代码大段摘录
- 新增历史文档时，优先补到 [HISTORY_INDEX.md](./HISTORY_INDEX.md)；新增参考专题时，优先补到 [REFERENCE_INDEX.md](./REFERENCE_INDEX.md)
