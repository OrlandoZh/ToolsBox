# Reference Zotero Style Clean-Room Contract

> 参考对象：`reference/zotero-style/`
> 用途：为后续重实现同类能力提供 feature contract、边界和验收口径
> 状态：clean-room 摘要，不是 project truth，也不替代 `docs/CURRENT_BACKLOG.md`

## Clean-Room Source Boundary

- 允许使用公开可观察的功能形态、偏好项类别、surface 位置和用户工作流作为需求线索。
- 不复制 reference 的源码、资源、图标、CSS、文案、tooltip、locale 字符串、混淆运行时代码、授权逻辑或私有 DOM patch。
- 不读取或反编译 obfuscated monolithic runtime；若未来需要确认 Zotero 宿主行为，只回到 `reference/zotero-main/` 与本仓库 host contract。
- 所有命名、设置 schema、UI 文案、数据结构和视觉样式都必须重新设计，并优先对齐本仓库既有 wrappers、settings、preference pane、itemTree、itemPane、menu、reader 路线。
- 本文只沉淀工程边界和 feature inventory，不提供法律意见，也不把参考项目的产品表达升级为本项目 contract。

## Minimum-Risk Implementation Path

默认路线是 host-first、wrapper-first、local-first：

- Bootstrap / preferences：复用现有启动生命周期、settings 读写、PreferencePanes 注册和 locale 管线。
- Item Tree：通过已有 itemTree wrapper 增加列、排序、渲染和刷新，不 patch Zotero 私有表格实现。
- Item Pane / context pane：通过 ItemPane section / info row 或已有 context pane bridge 承载信息卡、状态编辑和摘要区域。
- Menu：通过 menu manager 注册 item / collection / reader / annotation 场景命令，保持 popup 刷新和 cleanup 可验证。
- Reader：优先使用 `renderToolbar`、文本选择弹窗、annotation header、Reader context menu 等官方事件入口。
- Standalone surface：只有纸矩阵、批量管理、关系图这类密集工作台需要时，才使用独立 window shell 或 micro-app；默认不引入 iframe 隔离应用。
- Storage：优先使用 Zotero item fields、extra、tags、relations、notes、attachments 或本仓库既有 local storage 约定；避免新增远端依赖。

## Feature Inventory

| Group | Clean-room capability | Preferred surface |
|---|---|---|
| Bootstrap / preferences | 启用模块、列显示、状态词表、主题开关、快捷行为、实验功能 gate | PreferencePanes + settings |
| Item tree columns | 阅读状态、进度、评分、标签组、备注摘要、引用/排名元数据、附件状态等可配置列 | itemTree wrapper |
| Reading progress / time / state | 记录阅读进度、预计/已读时间、待读/在读/已读状态和最近阅读时间 | itemTree + itemPane |
| Tag / status / rating / remark workflows | 快速设置状态、星级/评分、短备注、标签分组和批量更新 | itemPane + menu item |
| View groups | 按状态、标签、评分、进度或自定义条件形成可切换视图 | item tree filter / saved local view |
| Collection enhancements | collection 级统计、筛选入口、批量状态动作和上下文命令 | collection menu + pane summary |
| Reader PDF / annotation tools | Reader toolbar 动作、批注状态、颜色/标签辅助、阅读进度同步 | Reader event hooks |
| Context pane / TLDR / explore / attachment / backlinks | 条目摘要、附件清单、反向链接、探索建议和可选 TLDR 占位 | Item Pane section |
| Context menu commands | item、collection、reader、annotation 场景下的状态、标签、备注、复制和导航命令 | Menu manager |
| Relationship graph | 基于 Zotero relations、引用关系、标签和合集生成本地关系视图 | standalone window or itemPane micro-app |
| External citation / rank metadata | 手动或可审计导入外部引用量、期刊分区、排名字段，支持来源与更新时间 | settings + item metadata adapter |
| AI / translation | 默认关闭；仅保留 provider-agnostic 接口占位和用户显式配置入口 | optional module |
| Tab / vertical tab manager | 标签页列表、最近打开、分组和关闭辅助 | window helper wrapper |
| Note / annotation manager and paper matrix | 批注/笔记列表、状态矩阵、批量筛选和轻量统计 | standalone window shell |
| Custom CSS / theme toggle | 本地自定义样式注入、明暗/密度开关、可恢复默认值 | settings + style manager |
| Sidebar shortcuts / window helpers | 常用面板跳转、窗口聚焦、打开附件/笔记/关系视图 | menu + window helper |

## Rollout Status Tiers

| Tier | Meaning | Eligible groups |
|---|---|---|
| `core-ready` | 可用现有 wrappers 在本地闭环，默认允许进入实现候选 | Bootstrap/preferences, item tree columns, reading state, tag/status/rating/remark, context menu commands, custom CSS/theme toggle |
| `host-surface-prototype` | 需要先证明 Zotero surface 挂载、刷新、cleanup 和多窗口行为 | Reader tools, context pane modules, collection enhancements, sidebar/window helpers |
| `workbench-prototype` | 需要独立窗口、密集列表或图形视图，应先补 route-specific contract | relationship graph, note/annotation manager, paper matrix, tab/vertical tab manager |
| `data-adapter-only` | 只允许做手动导入或本地 adapter，不默认联网抓取 | external citation/rank metadata |
| `default-excluded` | 默认不进入产品实现，除非后续单独声明 provider、隐私和验证 contract | AI/translation, remote resolver, licensing, network enrichment |

## Excluded Default Behaviors

- 不默认实现网络 AI、翻译 provider、远端摘要、远端排名抓取或自动元数据 enrichment。
- 不实现 Sci-Hub / shadow-library resolver、绕过访问控制、远端授权校验、远端 licensing gate 或设备指纹绑定。
- 不复制 reference 的界面文案、图标、CSS、字段命名、产品分类、快捷键设计或隐藏功能。
- 不通过 monkey patch、私有 DOM 选择器或宿主内部未冻结 API 直接控制 Zotero UI。
- 不把远端服务不可用、API key 缺失或模型能力作为本地核心功能的阻断条件。
- 不引入不可审计的 eval、动态远端代码加载或混淆运行时。

## Acceptance Checks

每个后续实现批次至少满足以下检查：

- Feature inventory：变更能映射到上表某一 group，并声明 tier、surface 和 in-scope / out-of-scope 行为。
- Clean-room boundary：PR / handoff 说明确认未复制 reference 源码、资源、文案、CSS、混淆 runtime 或私有实现。
- Host contract：触达 PreferencePanes、item tree、Item Pane、menu 或 Reader 时，对齐 `ZOTERO_HOST_INTERFACE_CONTRACTS`、`ZOTERO_HOST_SEMANTIC_INDEX` 与术语指南。
- Wrapper usage：优先使用本仓库 wrappers/settings/preference pane/itemTree/itemPane/menu/reader；若需要更深路线，必须说明为什么 wrapper 不足。
- Surface evidence：host-visible 功能需要 surface smoke；Reader/menu/context pane 变更需要对应 action 或 scenario 证据。
- State integrity：读写状态、评分、备注、标签、进度或外部元数据时，必须有可迁移、可清理、可回滚的数据约定。
- Default-off risk：AI、network、remote resolver、licensing、custom CSS 注入和独立窗口工作台必须具备默认关闭或显式启用策略。
- Cleanup：窗口、菜单、Reader 注入、样式、timer、observer 和缓存必须有 shutdown / unload 清理路径。

## Notes For Future Controllers

- 本文是 reference distillation，不改变当前主线和 validation level。
- 若后续把某个 group 纳入正式 wave，先更新 `docs/CURRENT_BACKLOG.md` 与相关 config mirror，再进入实现。
- 若实现读取 raw reference 超过本仓库 distillation rule 阈值，需要补充新的 `REFERENCE_*` 沉淀，而不是把 raw 观察直接写进源码。
