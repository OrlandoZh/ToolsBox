# Reference 路由

> 用途：在不展开长篇研究正文的前提下，快速选择“该读哪份参考资料、为什么读、先读哪个入口”。
> 最后更新：2026-04-08

## 使用方式

- 先按任务选参考，不要默认把所有 `REFERENCE_*` 文档从头通读一遍
- 参考阅读路径固定为 `REFERENCE_INDEX -> REFERENCE_* -> raw reference/*`；只有路由层和专题层无法回答当前问题时，才继续进入 raw reference
- 参考文档只回答技术路径与 clean-room 边界，不是当前项目 truth
- 涉及当前主线、当前 blocker、当前范围时，先回到 [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)
- 若同一 controller task/session 已读取 `3` 个及以上 raw reference 文件，或已跨 `2` 个及以上 reference project 做对比，就应该补一条 `REFERENCE_*` 专题沉淀，而不是把参考结论写回 `CURRENT_BACKLOG`

## 当前本地 reference 目录分层

| 目录 | 用途 | 路由提示 |
|------|------|----------|
| `reference/Templetereference/` | 开发框架、模板骨架、agent/runtime 等框架侧参考 | 这是“开发框架参考”篮子；需要回看模板/框架来源时，先按项目名直达对应快照，不把它混入 Zotero 插件路线分析 |
| `reference/zotero-main/` | Zotero 宿主源码 authoritative source | 触达宿主接口、术语、字段、事件和 surface 语义时，以这里为准，不用 `reference/plugin/*` 里的同名快照替代 |
| `reference/plugin/` | Zotero 开源插件参考 | UI 路线、菜单模式、通用技术链、专项对比默认从这里取只读样本 |
| `reference/lajiplugin/` | Zotero 其他插件参考 | 用于补充历史插件、非主流实现或特殊案例；和 `reference/plugin/` 一样只作为只读研究输入 |

## 按任务选参考

| 任务 | 首选 | 次选 | 说明 |
|------|------|------|------|
| 开发框架 / 模板骨架 / agent runtime 参考 | 直接定位 `reference/Templetereference/*` 对应项目快照 | [ARCHITECTURE.md](./ARCHITECTURE.md), [HISTORY_INDEX.md](./HISTORY_INDEX.md) | 这是框架参考篮子，不替代当前项目 truth，也不参与 Zotero 插件路线选型 |
| 通用 DOM contract / route-specific validator 可行性 | [REFERENCE_DOM_CONTRACT_VALIDATION_FEASIBILITY.md](./REFERENCE_DOM_CONTRACT_VALIDATION_FEASIBILITY.md) | [UI_VALIDATION_PATHS.md](./UI_VALIDATION_PATHS.md), [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) | 回答“更深入的 DOM contract 检查是否值得做、应按哪些宿主锚点分 route”，先看宿主 source 提供了哪些稳定 primitive |
| React 面板创建 / 切换 / surface bridge | [REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md](./REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md) | [UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md) | 先看 host-mounted React surface、window mode 与哪些部分已吸收到模板 |
| 右键菜单 / 子菜单 / `popupshowing` / 菜单 repair | [REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md) | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | 先按 `item / collection / field / reader` 场景选型，不混成一类菜单 |
| 跨项目通用技术链 | [REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md) | [REFERENCE_COMPARISON.md](./REFERENCE_COMPARISON.md) | 先看哪些模式已可 clean-room 泛化，再看对比快照 |
| 某条 UI 路线为什么映射到某个参考来源 | [REFERENCE_PLUGIN_UI_ANALYSIS.md](./REFERENCE_PLUGIN_UI_ANALYSIS.md) | [UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md) | 先看来源追踪，再回到模板自己的路线选型 |
| BibGenie 风格的 panel / window / UI 路线 | [REFERENCE_BIBGENIE_ANALYSIS.md](./REFERENCE_BIBGENIE_ANALYSIS.md) | [REFERENCE_COMPARISON.md](./REFERENCE_COMPARISON.md) | 只借宿主集成与架构经验，不照搬产品布局 |
| clean-room 参考快照治理 | [REFERENCE_SNAPSHOTS.md](./REFERENCE_SNAPSHOTS.md) | [HISTORY_INDEX.md](./HISTORY_INDEX.md) | 先看本地快照如何使用，再看历史研究入口 |
| git-backed reference 快照人工更新 | [REFERENCE_SNAPSHOTS.md](./REFERENCE_SNAPSHOTS.md) | [`../config/reference-projects.json`](../config/reference-projects.json) | 只更新 manifest 声明的 rolling git 快照；版本号命名的归档快照继续人工维护 |
| Zotero 宿主权威命名 / 接口锚点 | [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md) | [ZOTERO_HOST_SEMANTIC_INDEX.md](./ZOTERO_HOST_SEMANTIC_INDEX.md), [ZOTERO_TERMINOLOGY_GUIDE.md](./ZOTERO_TERMINOLOGY_GUIDE.md) | 这里是权威 contract，不是普通参考摘要 |

## 当前参考资产

- 本地目录分层：`reference/Templetereference/`、`reference/zotero-main/`、`reference/plugin/`、`reference/lajiplugin/`
- DOM contract / route validator 可行性：[REFERENCE_DOM_CONTRACT_VALIDATION_FEASIBILITY.md](./REFERENCE_DOM_CONTRACT_VALIDATION_FEASIBILITY.md)
- React 面板与切换经验：[REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md](./REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md)
- 菜单与子菜单经验：[REFERENCE_PLUGIN_MENU_PATTERNS.md](./REFERENCE_PLUGIN_MENU_PATTERNS.md)
- 通用技术链：[REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)
- UI 路线来源追踪：[REFERENCE_PLUGIN_UI_ANALYSIS.md](./REFERENCE_PLUGIN_UI_ANALYSIS.md)
- 跨项目比较：[REFERENCE_COMPARISON.md](./REFERENCE_COMPARISON.md)
- BibGenie 专项分析：[REFERENCE_BIBGENIE_ANALYSIS.md](./REFERENCE_BIBGENIE_ANALYSIS.md)
- 本地 reference 快照治理：[REFERENCE_SNAPSHOTS.md](./REFERENCE_SNAPSHOTS.md)
- git-backed managed refs manifest：[`../config/reference-projects.json`](../config/reference-projects.json)

## 维护规则

- 不要在本页记录当前 active wave、当前 blocker、动态统计或教程式长正文
- 新增参考专题时，优先补“按任务选参考”的入口，而不是先写项目数量或覆盖率叙述
- 当 `reference/` 顶层目录职责变化时，先更新本页和 [REFERENCE_SNAPSHOTS.md](./REFERENCE_SNAPSHOTS.md)，再去补具体专题正文
- 涉及 Zotero 宿主 authoritative source 的路由，固定写 `reference/zotero-main/`；不要把开源插件快照误写成宿主权威入口
- 如果某份参考材料已经升格为模板 contract，应优先在 [AGENT_INDEX.md](./AGENT_INDEX.md) 中补其 authoritative 入口，而不是继续只留在参考路由层
- 自动 reference distillation 只允许更新 `docs/REFERENCE_*.md` 与本页；它不改 raw `reference/`、truth、validation/gate 配置或产品文档
