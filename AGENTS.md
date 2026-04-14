# AGENTS

这个文件是给新接手仓库的开发 agent 的薄入口，不维护第二份 project truth。

## Current Truth

- 当前“完成度 / 当前主线 / 当前剩余项”只认 [docs/CURRENT_BACKLOG.md](docs/CURRENT_BACKLOG.md) 的“当前单一事实源”
- 如只需快速定向当前项目态，可先读 `dist/agent-context.json` 的 `runtimeCompact` 视图；一旦涉及 truth、wave、validation 或 scope 判定，仍必须回到 `docs/CURRENT_BACKLOG.md` 与对应 mirror
- 不要直接根据旧 `dist/` 工件、README 历史段落或单次命令输出判断当前主线
- 如果 truth 变化，先更新 `docs/CURRENT_BACKLOG.md`，再运行 `npm run docs:sync-current-truth`

## Docs Routing

- 首次定向仓库文档时，优先看 [docs/AGENT_INDEX.md](docs/AGENT_INDEX.md)；它只做薄路由，不维护第二份 current truth
- 已收口批次、长尾里程碑、经验沉淀与研究归档，优先收口到 [docs/HISTORY_INDEX.md](docs/HISTORY_INDEX.md)；不要把已完成长表重新写回 `docs/CURRENT_BACKLOG.md`
- 参考项目、已吸收经验与专题研究入口，优先看 [docs/REFERENCE_INDEX.md](docs/REFERENCE_INDEX.md)；需要细节时再进入具体参考分析文档

## Reference Distillation Rule

- 参考阅读路径固定为 `REFERENCE_INDEX -> REFERENCE_* -> raw reference/*`；只有路由层和已有专题都不够时，才进入 raw `reference/*`
- 一旦在同一 controller task/session 中读取了 `3` 个及以上 raw reference 文件，或跨 `2` 个及以上 reference project 做对比，本轮就必须补一条 reference distillation 沉淀
- 参考沉淀只允许写 `docs/REFERENCE_*.md` 与 `docs/REFERENCE_INDEX.md`；它不是 current truth，不回写 `docs/CURRENT_BACKLOG.md`、project mirrors 或业务源码
- 若某条参考结论未来要升级为 contract，仍由 controller 人工提升到 `AGENT_INDEX` / contract 文档；不要让 distiller 自动升格治理语义
- `agent:reference:intake` 是 v1 唯一 raw reference intake 入口；当前不做透明 file-read 检测
- 自动 distillation 只在 fresh `agent:sync` 收口后尝试后台 drain，默认 advisory + non-blocking；不要把 pending reference distillation 直接当成 gate blocker

## Framework Governance

- 下游项目可以对 `AGENTS.md` 规则做产品化表述，但不得改变模板治理语义
- 模板审计只认 bundle registry 中的 matcher label 与治理意图，不要求项目逐字复读模板原句
- 如果项目保留 `framework:governance:check` / `framework:bundle:audit`，就必须同时保留并同步本地 `config/framework-backfill-bundles.json` mirror

## Delegation Protocol

- 中大型任务默认先由 controller 读 truth、拆阶段、划 scope、再决定是否委托；不要一进仓库就直接并发改业务文件
- 已存在 `config/agent-delegation-tasks.json` 或 scope 明确的任务时，优先复用 `npm run agent:delegate:list` / `run` / `review` / `close`，不要平行发明第二套委托流程
- 默认每批次只保留一个 strict write owner；其他 lane 仅在 `read-only`、`review` 或写域完全不重叠时并发
- `scopePaths` 冲突时改串行，不赌幸运合并；如果 scope 尚未说清楚，先补 scope，再派工
- controller 向用户回报时，只提炼阶段、owner、检查结果、风险与 blocker，不转储子 agent 全量日志

## Worker Contract

- worker 只在 `scopePaths` 内执行，不越权扩面，不代替 controller 改策略或重写当前 truth
- 需要联网、GUI、宿主启动、越 sandbox，或 scope 必须扩张时，不自行绕过；只回传 blocker、建议命令和原因
- worker 默认回传结构化简报，至少包含 `status`、`owner_role`、`summary`、`changed_files`、`checks_run`、`risks`、`blockers`、`next_action`
- worker 回传格式须对齐 `config/worker-response.schema.json` 定义的 JSON Schema；controller 可按此 schema 验证回传完整性

## Default Flow

1. 第一次从模板复制、迁移仓库或怀疑本地工件串目录时，先运行 `npm run init:workspace`
2. 初始化完成后先运行 `npm run check`
3. 需要把 Obsidian 工作台刷新成“当前项目态”时，优先运行 `npm run agent:sync`
4. `agent:sync` 会按 `agent:monitor -> agent:gate -> agent:obsidian -> agent:obsidian:guard:strict` 原子刷新当前状态页与白板；若主链已 fresh 收口，再尝试后台 `agent:reference:drain`
5. 涉及运行时、UI、场景或宿主集成的改动，优先运行 `npm run agent:zotero:e2e`
5.1. 若 `zotero:scenario` 或 `agent:zotero:e2e` 在 scenario 阶段失败/超时，先用 `npm run zotero:scenario -- --list-scenarios` 确认可选场景，再用 `--scenario-file <pattern>` / `--scenario <pattern>` 做最小复现
5.2. filtered `zotero:scenario` 只用于调试，不改 current truth；当前主结论仍以 full `agent:zotero:e2e -> agent:monitor -> agent:gate` 为准
6. 需要连续热重载观察时，再运行 `npm run zotero:watch`
7. 每轮改动后运行 `npm run agent:monitor` 与 `npm run agent:gate`
8. 以 `agent:gate` / `agent:gate:release` 结论作为是否继续推进的主判据

## Validation Strategy

- 先判断本轮改动是否真的触达 UI / 交互 / 视觉基线；不要默认把所有问题都送去视觉审查
- 只有偏好设置面板、Reader/Annotation 入口、菜单项/工具栏注入、视觉基线资产这类真实可见面改动，才应升级为 `visual-required`
- 纯运行时、服务层、设置 schema、治理脚本、文档与监控口径改动，默认不应因为项目处于某个 UI 阶段就被强行拉回 strict visual
- 项目是否处于某个 UI 阶段，不等于当前批次就需要视觉阻断；只认 validation contract + runtime signal
- 对 `preference pane`、`context pane`、`annotation context menu`、Reader `renderToolbar` 注入、`menu item` 这类真实 host-visible surface，先确认 surface smoke（触达/可见/内容就绪）成立，再把整窗视觉截图当作补充证据
- 不要让整窗截图或路径猜测单独代表 UI 正常；surface truth 缺失时，优先补真实可见面验证，而不是直接进入 strict visual 争论
- surface verification 只治理真实可见面的验证方式，不替下游规定具体产品布局、文案或 strict visual 节奏
- `validationDecision.level=visual-required` 时，缺少视觉证据才应视为主阻断
- `validationDecision.level=visual-recommended` 时，应先完成功能闭环，再补视觉证据，不要让人工视觉审查长期卡住主线
- `validationDecision.level=visual-not-needed` 时，优先依赖 `check`、运行时验证、E2E、门禁与 provenance 结果推进
- validation contract 只决定是否需要视觉证据，不得覆盖 `watch`、`watch-recovery`、workspace/host/provenance guard 这类独立严格阻断；存在更具体的恢复动作时，优先执行具体恢复动作
- 如果当前批次的验证级别、in-scope 模块或可见面判定发生变化，必须同时更新 `config/project-validation-overrides.json` 与 `docs/CURRENT_BACKLOG.md`；不要只改 mirror、不改 truth
- 若服务仅因远端 AI provider 缺少 API key 而降级，但本轮不验证该 provider 闭环，可记录为建议项而不是主阻断
- `check` 会对缺失 `init:workspace` 记录发出 warning；`npm run agent:gate` 与 `npm run agent:gate:release` 会把它当成严格前置条件
- `init:workspace` 只会生成带 `bootstrap_shell=true` 的初始化占位工作台；它不是当前项目结论
- Obsidian 工作台必须同时满足“路径归属正确 + 内容与 gate/monitor fresh 一致”；不要把 bootstrap shell 或 fallback 壳当成 current truth

## Terminology Rule

- UI、宿主接口与验证 surface 的命名，优先对齐 Zotero 官方源码和模板内已冻结的宿主 contract；涉及具体用词时先看 `docs/ZOTERO_TERMINOLOGY_GUIDE.md`，不要继续发明脱离宿主语义的新词。
- 优先使用 `PreferencePanes / preference pane / 偏好设置面板`、`Item Pane / 条目窗格`、`Item Tree / 条目列表`、`context pane`、`renderToolbar`、`menu item`、`Sidebar / 侧边栏` 这类已在宿主源码或术语表中稳定出现的命名。
- 若要描述 Reader 侧的工具栏注入，优先写 `renderToolbar`，不要改写成宽泛的工具栏入口别名。
- 若要描述菜单注入，优先写 `menu item`，不要改写成含义更松散的旧菜单别名。
- 若只是说明可见位置，可以把 `侧边栏`、`窗格`、`工具栏` 作为补充描述；不要让位置描述反过来替代宿主 API 名称。

## UI Creation Path Rule

- 需要为 Zotero 可见面选择 UI 实现路线时，先看 `docs/UI_CREATION_PATHS.md`；优先按“宿主注册式 surface -> 统一节点工厂 / ztoolkit UI -> HTML micro-app -> standalone dialog / window shell -> XUL custom element -> host patch”递进，不要一开始就直接 patch 宿主。
- 需要回溯“新增参考项目为什么被映射到某条 UI 路线”时，再看 `docs/REFERENCE_PLUGIN_UI_ANALYSIS.md`；它只负责来源追踪，不替代 `docs/UI_CREATION_PATHS.md` 的路线选型。
- 若不是在选 UI 路线，而是在抽 `reference/plugin/*` 中窗口、服务、队列、iframe、重资源等通用技术链，先看 `docs/REFERENCE_PLUGIN_TECHNICAL_CHAINS.md`。
- 若任务聚焦在 `item / collection / field / reader` 的右键菜单、子菜单、`popupshowing` 刷新或 menu repair，先看 `docs/REFERENCE_PLUGIN_MENU_PATTERNS.md`；它按应用场景分类菜单技术链，不替代 `docs/UI_CREATION_PATHS.md` 的 UI 路线选型。
- 引用 `reference/plugin/*` 时，只提炼可复用技术路径与关键技术节点，不照抄产品 UI 结构、命名或非 clean-room 实现细节。
- 需要判断某条 UI 路线当前模板验证是否已充分覆盖、是否应补 route-specific contract 时，先看 `docs/UI_VALIDATION_PATHS.md`；默认保持“surface smoke / surface-local evidence 优先”，不要把所有 UI 路线一律升级成 strict visual。

## Host Interface Rule

- 触达 `src/features/menu-manager.js`、`item-pane.js`、`item-tree.js`、`preference-panes.js`、`reader.js` 或其对应 `types/features.d.ts` 时，先对齐 `docs/ZOTERO_HOST_INTERFACE_CONTRACTS.md` 与本地 `reference/zotero-main` 的对应 authoritative source。
- 不允许仅根据 E2E 症状、历史实现或猜测新增/删改宿主接口字段。
- 若宿主源码已变化而模板 contract 尚未更新，应先更新 contract/test/doc，再改实现。
- 宿主接口包装层变更时，优先运行 `npm run agent:host:guard`，不要只靠运行时回归后倒推接口漂移。

## Host Semantic Rule

- 触达 `src/features/menu-manager.js`、`item-pane.js`、`item-tree.js`、`preference-panes.js`、`reader.js` 及 `types/features.d.ts` 时，先看 `docs/ZOTERO_TERMINOLOGY_GUIDE.md`、`docs/ZOTERO_HOST_INTERFACE_CONTRACTS.md`、`docs/ZOTERO_HOST_SEMANTIC_INDEX.md` 与本地 `reference/zotero-main`。
- 不允许仅根据历史实现、E2E 症状或模糊位置描述发明字段名、按钮名、面板名或事件名。
- Terminology Guide 约束词语，Host Interface Contracts 约束包装器桥接面，Host Semantic Index 约束宿主字段、枚举、事件与 surface 语义；不要把三者混成第二套自由文本经验。
- 宿主语义命名或 field surface 变更时，优先运行 `npm run agent:host:semantic:guard`，确认术语、validation surfaces 与 doc mirror 仍和宿主源码一致。

## Expansion Rule

- 当项目从“当前批次已收口”进入下一批模块扩展前，必须先在 `docs/CURRENT_BACKLOG.md` 与 `config/project-expansion-wave.json` 中声明当前扩展 wave。
- 未声明 wave 时，不应直接把新模块并入已有 strict visual 或已有产品阶段结论；新模块默认先按 archetype 决定验证路径，再决定是否需要视觉验收。
- 如果 wave 的 `inScopeModules`、`outOfScopeModules`、`moduleArchetypes` 或 `acceptanceTrack` 变化，必须同步更新当前 truth；不要让 project mirror 和 `docs/CURRENT_BACKLOG.md` 各写一套阶段口径。
- 模板治理只负责“如何进入下一波扩展”，不负责替下游决定“下一波具体做哪个产品模块”。

## Initialization Guard

- 如果 `config/addon.config.json` 仍保留模板默认值，例如 `addonId=cleanroom-template@example.com`、`author=Your Team`、模板仓库 `homepage` 或模板专用 `updateURL`，先暂停功能开发
- 在这种模板态下，agent 必须先向用户确认并初始化这些基础信息：`addonName`、`addonId`、`addonRef`、`author`、`homepage`、`updateURL`
- 同时确认当前目标是“保留完整 agent 工程链继续开发”，还是“导出纯项目后在新目录继续开发”
- 只有这些基础配置确认完成后，才继续后续实现、真机验证或发布链操作

## Release Boundary

- 当前本地链路已经能自动生成 `.xpi`、`dist/update.json`、`dist/release-manifest.json`
- `npm run release:upload -- --provider <provider> --release-tag <tag> --target-base-url <url>` 现在只会校验本地产物并生成 `dist/release-upload-plan.json` / `md`，不会执行真实上传
- 触达 `release:preflight`、`release:prepare`、`release:matrix`、`release:upload` 相关测试时，不要默认复用仓库里现有 `build/` / `dist/` 状态；测试必须先显式重置或重新生成本地 release 工件，再做断言
- 远端发布仍是外部步骤：先跑 `release:upload` 计划壳，再手动上传远端产物，然后运行 `npm run release:preflight -- --verify-remote`
- 只有当前任务明确属于发布链时，才进入 `npm run release:plan -> npm run release:upload -- --provider <provider> --release-tag <tag> --target-base-url <url> -> 手动上传远端产物 -> npm run release:preflight -- --verify-remote -> npm run release:prepare -> npm run release:matrix -> npm run agent:gate:release`
- 当前唯一未收口主线是远端 `update.json` / `update_link` 的真实分发闭环；不要回头重开已完成的 Reader / startup / freshness 批次

## Artifact Boundary

- `build/`、`dist/`、`.zotero-runtime/`、`obsidian/agent-workbench/` 都是可再生工件，不作为源码事实来源
- 这些目录同样不应被当作稳定测试夹具；需要消费 release/build 工件的测试，应该先自行准备 fresh 工件，或改用临时 fixture
- 这些目录受 `.gitignore` 保护，正常 `git add` / `git push` 不会上传
- `npm run init:workspace` 会清理会携带仓库路径的 agent 工件（例如 `dist/agent-runs`、`dist/agent-delegation`、`dist/agent-memory`、Obsidian handoff），用于避免模板迁移后的串目录误读
- 初始化后若需要给人类查看当前工作台，不要直接停在 bootstrap shell；继续执行 `npm run agent:sync`
- 如果需要交付纯源码或纯模板工程，使用 `npm run export:project`
