# ToolsBox

ToolsBox 是一个按 clean-room 约束实现的 Zotero 工作流工具箱，当前目标是提供本地 workflow 字段、条目列、菜单动作、Reader 入口和可验证的插件工程链。

README 只做入口说明，不维护第二份项目真相。当前主线、扩展 wave、验证口径和最新结论统一以 [docs/CURRENT_BACKLOG.md](docs/CURRENT_BACKLOG.md) 为准。

## 特性

- **clean-room 开发约束**：优先从黑盒行为、宿主 contract 和可审计 evidence 出发组织实现。
- **Zotero 真机开发链**：内置 `watch -> e2e -> monitor -> gate` 闭环，适合持续验证插件运行态。
- **发布与导出分层**：支持常规构建、受保护打包实验分支，以及纯项目导出。
- **Agent 协作友好**：仓库内置 Codex / Opencode 分工脚手架、Obsidian 工作台和结构化工件。
- **参考边界明确**：`reference/` 仅用于兼容性研究、验证设计和风险审查，不作为源码搬运输入。

## 项目状态

- 当前“完成度 / 当前主线 / 当前剩余项”只认 [docs/CURRENT_BACKLOG.md](docs/CURRENT_BACKLOG.md) 的“当前单一事实源”。
- README 里的这段状态摘要由 `npm run docs:sync-current-truth` 自动同步，不再手写第二套 current truth。

<details>
<summary>查看自动同步的当前状态摘要</summary>

<!-- CURRENT-TRUTH-SUMMARY:START -->
当前主线固定为 `RELEASE-FREEZE-WAVE-001`：用户已要求“先冻结发布”。本轮不新增 Style 功能，不继续扩 Backlinks 或 Merge Annotations，不追 `zotero-style` 全量复刻，不刷新视觉 baseline，也不推进真实远端分发。发布冻结期间只允许读取/保留现有 release artifacts、记录 blocker、运行 docs / dev gate 这类本地非发布检查；禁止执行 `gh release create`、`gh release upload`、真实远端 asset mutation、`npm run release:preflight -- --verify-remote`、`npm run agent:gate:release`，也不改 git remote 或 `config/addon.config.json` 的 `updateURL`。只有用户明确解冻并确认远端目标与认证方式后，才重新进入 remote distribution closure。

当前 active expansion wave: `RELEASE-FREEZE-WAVE-001`；验收主线: `release-frozen-no-remote-mutation`。上一波 `RELEASE-REMOTE-DISTRIBUTION-WAVE-001` 已完成安全 readiness 检查但未执行发布，发现目标 `OrlandoZh/ToolsBox` URL 返回 HTTP `404`、GitHub CLI 未登录、当前 git origin 仍指向 `OrlandoZh/AddonTemplate4Z` 而 release config 指向 `OrlandoZh/ToolsBox`。再上一波 `STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001` 已完成合并前 closure 与本地 release preflight：docs sync 通过，combined targeted Backlinks / feature-composer / docs-consistency 为 `27/27`，`npm run agent:check` 为 `1582/1582`，watch 已刷新为 healthy，`npm run agent:monitor`、`npm run agent:gate`、`npm run agent:sync` 已通过；`npm run release:plan` 已生成本地 release artifacts，`npm run release:upload -- --provider github-release --release-tag release --target-base-url https://github.com/OrlandoZh/ToolsBox/releases/download/release/` 已生成 plan-only upload checklist，且 `executionMode="plan-only"`、`networkActionsPerformed=false`。`STYLE-BACKLINKS-VISUAL-EVIDENCE-CLOSURE-WAVE-001`、`STYLE-BACKLINKS-LOCAL-GRAPH-E2E-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-WRITEBACK-E2E-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-WRITEBACK-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-PREVIEW-WAVE-001`、`STYLE-BACKLINKS-LOCAL-WAVE-001` 与 `STYLE-PROTOTYPE-HARDENING-WAVE-001` 继续作为历史 baseline 保留。

已收敛并继续保留的实现口径：`createFeatureComposer({ ..., zotero })` 支持可注入 Zotero 依赖；生产默认继续读 `globalThis.Zotero`。Style-like 直接注册项全部通过显式 pref gate 控制，`annotationColumn.enabled` 是 canonical key，`annotationDistributionColumn.enabled` 仅保留 legacy fallback。缺省未显式开启时，直接 Style prototype 不应注册。

Backlinks functional scope 已收口：开发验收用 `zotero:scenario -- --addon-pref backlinks.enabled=true` pref 注入只允许 known `config.defaultPrefs` key 自动映射到 `${config.prefsPrefix}.<key>`，用于 disposable profile 验证 enabled prototype。真实 Zotero scenario `backlinks local graph drilldown workflow` 已证明默认 pref 未开启时 Backlinks section 不注册；显式开启时 live Item Pane local graph/list 与 `.toolsbox-backlinks-drilldown-button` 可选择来源条目，并保持 target/source item fields 与 relations 不变。默认仍为 `backlinks.enabled=false`，不新增偏好面板可操作入口，不写 Zotero relation，不修改 item/note/annotation 数据，不调用网络，不接 AI。

Backlinks 实现口径保持不变：`collectBacklinksForItem` 保留同步 local scanner；`collectBacklinksForItemAsync` 支持 Zotero item enumeration 返回 Promise；`buildBacklinkGraphForItem` 生成本地 target/source node 与 matchedBy edge metadata；`selectBacklinkSource` 通过 `ZoteroPane.selectItem` / `itemsView.selectItem` 选择来源条目，宿主 API 缺失时返回稳定 no-op status。Backlinks Item Pane section 采用宿主注册式 dynamic body、同步 loading shell 与 `onAsyncRender` 异步刷新，重复 render 只保留 owner-tagged DOM。

Release artifact identity 已对齐：本地 artifacts 包括 `dist/update.json`、`dist/release-manifest.json`、`dist/release-preflight.json` 与 `dist/toolsbox-0.1.0.xpi`；addonId `toolsbox@orlandozh.github`，version `0.1.0`，updateURL `https://github.com/OrlandoZh/ToolsBox/releases/download/release/update.json`，update_link `https://github.com/OrlandoZh/ToolsBox/releases/download/release/toolsbox-0.1.0.xpi`，XPI `dist/toolsbox-0.1.0.xpi` 的 SHA256 为 `6aa361482f60bb62412b5678f359b6951d3b0b2d2a92041c97ad8c8165f7b965`。`dist/release-matrix.json` 当前为 `attention`，stable / beta profile 均等待真实远端验证；冻结期间该状态只作为 retained release readiness debt，不作为当前继续推进项。

远端 readiness 已完成安全检查但未执行发布：`curl -sI https://github.com/OrlandoZh/ToolsBox/releases/download/release/update.json` 与 `curl -sI https://github.com/OrlandoZh/ToolsBox/releases/download/release/toolsbox-0.1.0.xpi` 均返回 HTTP `404`；`curl -sI https://github.com/OrlandoZh/ToolsBox` 也返回 HTTP `404`（未登录视角下目标仓库不可见或不存在）；`gh` CLI 已安装在 `/opt/homebrew/bin/gh`，但 `gh auth status -h github.com` 显示未登录；当前 `git remote -v` 仍指向 `https://github.com/OrlandoZh/AddonTemplate4Z.git`，而 release config 指向 `OrlandoZh/ToolsBox`。这些 readiness blocker 保留为冻结期间的 release 背景，不作为当前需要继续推进的任务。

冻结期间不再执行三选一发布决策。解冻后才恢复选择：1. 确认目标仍是 `OrlandoZh/ToolsBox`，先创建或切换 git remote，再登录 GitHub CLI / 提供 token，创建或复用 tag `release` 上传 `update.json` 与 `toolsbox-0.1.0.xpi`；2. 改用当前 origin `OrlandoZh/AddonTemplate4Z` 作为发布仓库，并先更新 `config/addon.config.json` 的 `updateURL` 后重跑 `release:plan` / upload plan；3. 改用其它 HTTPS/CDN/generic-http 远端，同样先更新 updateURL 与 upload plan。冻结未解除前，不运行真实 `gh release upload`、不改远端仓库、不运行 `npm run release:preflight -- --verify-remote` 覆盖本地 passed preflight。

本波 freeze closure fresh 证据已刷新：`npm run docs:sync-current-truth -- --check` 通过；combined targeted Backlinks / feature-composer / docs-consistency tests 为 `27/27`；`npm run zotero:watch` 已刷新 startup health passed 并停止常驻 watch；`npm run agent:monitor` failed `0`；`npm run agent:gate` issues `[]`，validation level 为 `visual-not-needed`，matched override 为 `release-freeze-wave-001`；`npm run agent:sync` 已刷新 gate chain、agent-context、Obsidian handoff 与 evidence chain。未运行 `gh release create`、`gh release upload`、`npm run release:preflight -- --verify-remote`、`npm run agent:gate:release`，未改 git remote 或 `config/addon.config.json` 的 `updateURL`。

上一波 enabled E2E fresh 证据已刷新并通过 dev gate：scenario listing 已列出 `backlinks local graph drilldown workflow`；`npm run zotero:scenario -- --addon-pref backlinks.enabled=true --scenario "backlinks local graph drilldown workflow"` 为 `1/1` passed，live Item Pane graph/drilldown 选择来源条目且 item snapshot unchanged；未注入 pref 的 default-off 分支保持 Backlinks section 不注册；combined targeted Backlinks / feature-composer / docs-consistency tests 为 `27/27`；`npm run docs:sync-current-truth -- --check` 通过；`npm run agent:check` 通过并写入 fresh telemetry；`npm run agent:zotero:e2e -- --no-ui-capture` 通过 2 cycles、scenario `31/31`、failed `0`、runtime error `0`；`npm run zotero:watch` startup health fresh passed；`npm run agent:monitor` 为 `12/12`；`npm run agent:gate` issues `[]`；`npm run agent:sync` 已刷新 gate chain、agent-context、Obsidian handoff 与 evidence chain。

上一波完整 UI capture 视觉证据已刷新并分类：`npm run agent:zotero:e2e` 完整 UI capture 已执行，功能链两轮均为 tests `3/3`、scenario `31/31`、runtime error `0`，但视觉层报告 Reader / surface-local 截图漂移与尺寸差异，因此不更新 baseline、不改产品代码。随后 `npm run agent:zotero:e2e -- --no-ui-capture` fresh 通过，Backlinks default-off 分支两轮均确认 `backlinks.enabled=false`、`sectionRegistered=false`，`item pane DOM contract advisory`、`preference pane surface smoke`、`library item pane surface smoke` 与 `reader surface smoke` 均 passed。`npm run zotero:watch` 已刷新 startup health，`npm run agent:monitor` 为 `12/12`，`npm run agent:gate` issues `[]`。该视觉差异记录为 `visual-recommended` 非阻断 debt。

Default-off / planned truth：`Style Editor`、`TLDR`、`Attachment Version`、`Custom External API`、`Paper Matrix Enhanced`、Backlinks semantic search / relation writeback / cross-library sync、AI enrichment 与其它未完成能力保持 `planned/default-off`，不在偏好设置面板中表现为已可用功能，也不把缺 API key 当作本轮主阻断。

已收敛的高风险 surface truth：Collection DOM patch、Reader `_iframeWindow`、attachment preview iframe、margin annotation、PDF background 等能力保持 prototype / default-off；已补 availability guard、owner-tagged DOM、幂等 cleanup / destroy 与 lifecycle cleanup。本波不重新打开这些 surface，不做 host surface 大重写，不把任何 prototype 升格为默认开启或 beta 可用入口。

当前 release-only 历史线 `ENG-HIGH-104 / ENG-LOW-211~213` 已冻结在远端 readiness 之后；真实闭环仍取决于用户解冻、远端仓库 / 认证 / asset 上传确认。`ENG-HIGH-103`、`READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125`、`READER-HIGH-126`、`HOST-HIGH-201 / HOST-LOW-301~303`、`ZOTERO-HOST-POLISH-WAVE-001`、`OPTIONAL-BUNDLE-WAVE-001` 均只作为历史 contract / mirror 背景保留，不覆盖 release 冻结口径。

`P2` 上下文感知记忆与趋势层深化已完成并保留为背景；Style acceptance truth、默认关闭策略、测试链、Backlinks local prototype、Merge Annotations local preview、default-off note writeback workflow、enabled Merge Annotations writeback E2E、enabled Backlinks local graph/drilldown E2E、Backlinks full UI visual evidence 分类、Zotero 真机验收闭环和 release local preflight 已作为历史基线收口。本波只冻结 release，不新增功能。
<!-- CURRENT-TRUTH-SUMMARY:END -->

</details>

## 快速开始

1. 当前产品身份已固定为 `ToolsBox` / `toolsbox@orlandozh.github` / `toolsbox`；如需改名，再编辑 `config/addon.config.json`。
2. 运行 `npm run verify` 和 `npm run check`，先确认配置、文档 truth 与测试基线一致。
3. 运行 `npm run build` 构建插件。
4. 运行 `npm run package` 生成 `.xpi`。
5. 在 Zotero 中通过 “Install Add-on From File” 安装 `dist/<addonRef>-<addonVersion>.xpi`。

补充说明：

- 当前仓库的 `updateURL` 指向 GitHub Releases：`https://github.com/OrlandoZh/ToolsBox/releases/download/release/update.json`。
- 该远端发布配置只用于这个模板项目自身的远端发布验收与测试；下游项目必须替换自己的 `addonId`、`homepage` 与 `updateURL`。
- 如果目标是交付纯源码，而不是把本地工件一起带走，使用 `npm run export:project` 生成剔除运行时工件与 agent 附件的最小工程。

<details>
<summary>受保护打包与发布相关命令</summary>

- `npm run package:encrypted`
- `npm run package:shielded`
- `npm run package:protection:smoke`
- `npm run package:protection:score`
- `npm run package:protection:verdict`
- `npm run release:upload -- --provider gitee-release --release-tag 1.1 --target-base-url https://example.com/releases/1.1/`
- 仅校验上传契约并生成 dist/release-upload-plan.json / md，不执行真实上传。

</details>

## 常用命令

| 场景 | 命令 |
|------|------|
| 配置与静态检查 | `npm run verify` / `npm run lint` / `npm run format:check` / `npm run typecheck` |
| clean-room 门禁 | `npm run cleanroom:audit` / `npm run cleanroom:sim` |
| 当前 truth 同步 | `npm run docs:sync-current-truth` |
| 构建与打包 | `npm run build` / `npm run package` |
| 发布准备 | `npm run release:preflight` / `npm run release:prepare` / `npm run release:matrix` |
| 开发态总检查 | `npm run check` |
| Zotero 真机 | `npm run zotero:smoke` / `npm run zotero:watch` / `npm run agent:zotero:e2e` |
| Agent 汇总 | `npm run agent:monitor` / `npm run agent:gate` / `npm run agent:sync` |

## 仓库边界

- `build/`、`dist/`、`.zotero-runtime/`、`obsidian/agent-workbench/` 都是可再生工件，已被 `.gitignore` 忽略。
- release / toolchain 测试不要把现有 `build/` / `dist/` 当成稳定夹具；先准备 fresh 工件，再断言 JSON/Markdown 输出。
- `validationDecision` 只决定是否需要视觉证据；如果 `watch`、`watch-recovery`、workspace/host/provenance guard 已给出更具体的恢复动作，优先处理这些独立严格阻断。
- `reference/` 快照只用于兼容性研究、验证设计和法务留档，不作为表达复用来源。
- 如果要交付纯源码或纯模板工程，不要直接压缩整个工作目录；使用 `npm run export:project`。

## 架构速览

```text
src/
├── core/       核心工具模块
├── features/   Zotero 宿主 surface 与能力封装
├── utils/      对话框、进度窗口、子窗口壳等通用工具
├── platform/   Zotero 运行时适配层
├── services/   状态存储、任务队列、资源加载器
└── app/        插件组合根与运行时配置
```

| 模块 | 说明 |
|------|------|
| `src/core/` | 日志、偏好、生命周期、i18n、UI 工厂、Notifier、快捷键、HTTP |
| `src/features/` | `menu-manager`、`item-pane`、`item-tree`、`reader`、`preference-panes` 等宿主能力 |
| `src/utils/` | `dialog`、`progress-window`、`window-shell` |
| `src/platform/` | `zotero-host`、`zotero-file-storage`、`zotero-json-state-store` |
| `src/services/` | `registry`、`file-state-store`、`resource-loader`、`task-runner`、`task-queue` |

## Menu Scene Helpers

- `menu-manager` 只覆盖 Zotero `MenuManager` 官方 target，例如 `main/library/item`、`main/library/collection`、`itemPane/info/row`、`reader/menubar/view`
- 新代码、模板片段和 agent 自动修复默认优先使用 scene helper：
  - `registerItemMenuItem()`
  - `registerCollectionMenuItem()`
  - `registerItemPaneInfoRowMenuItem()`
  - `registerReaderMenubarViewMenuItem()`
- 如果同一 scene 下需要多个相关动作，优先使用 `registerItemSubmenu()`、`registerCollectionSubmenu()`、`registerReaderMenubarViewSubmenu()`
- 如果菜单是否出现、是否禁用、或 submenu children 取决于 live host state，优先使用 `createMenuStateResolver()` + `registerStateDrivenMenu()`，不要回退成散落的 `popupshowing` imperative toggle
- collection scene 的动态判断应优先消费 `hasCollectionSelection`、`collectionTreeRowID`、`collectionTreeRowType`，不要把 item selection 语义混进 `main/library/collection`
- Reader `createViewContextMenu` / `createAnnotationContextMenu` 不属于 `menu-manager`，应走 `reader.registerViewContextMenuItem()` / `reader.registerAnnotationContextMenuItem()`
- `registerContextMenuItem()`、`registerReaderMenuItem()` 与 `registerSubmenu()` 继续保留为兼容 helper，但默认不再作为模板推荐写法
- 迁移建议：
  - `registerContextMenuItem(...)` 且 target 固定为 `main/library/item` 时，直接迁到 `registerItemMenuItem(...)`
  - `registerReaderMenuItem({ target: MENU_TARGETS.READER_MENU_VIEW }, ...)` 时，直接迁到 `registerReaderMenubarViewMenuItem(...)`
  - `registerSubmenu({ target: MENU_TARGETS.LIBRARY_ITEM | LIBRARY_COLLECTION | READER_MENU_VIEW, ... })` 时，优先直接迁到对应的 scene submenu helper
  - 只有确实需要跨多个 `reader/menubar/*` target 复用时，再继续保留 `registerReaderMenuItem(...)`
  - 只有确实需要跨 target 做通用子菜单装配时，再继续保留 `registerSubmenu(...)`

## Preference Pane

- 模板默认偏好页加载路径是 `onPreferenceLoad(context)`；`scripts` 仅保留 legacy 兼容
- `onPreferenceLoad(context)` 推荐顺序固定为：`loadSubScript(content/theme.js) -> loadSubScript(content/preferences.js) -> window.initCleanroomPreferences(options?)`
- `addon-static/content/preferences.xhtml` 是 XUL fragment，不保留 XML declaration，静态控制器也不要直接 import `src/` ESM
- 偏好页控件行为、pref 写回或 `themeMode` 改动，默认要补 live host evidence：`preferences.setCheckbox`、`preferences.setTextbox`、`preferences.selectMenulist`
- 详细约束见 [Preference Pane Guide](docs/PREFERENCE_PANE_GUIDE.md)

## Standalone Window Shell

- 如果下游需要独立管理窗口、批量处理窗口或详情窗口，优先用 `src/utils/window-shell.js` 收口 `openDialog -> ready -> focus/reuse -> close cleanup`
- `src/features/window-manager.js` 继续只负责 Zotero 主窗口挂载；不要把主窗口挂载器和子窗口壳混成一层
- 相关参考技术链与边界见 [Reference Plugin Technical Chains](docs/REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)

## File-backed Runtime State

- 当状态明显超出 `Prefs` 适用范围时，优先从 `src/services/file-state-store.js` 起步
- 这层只负责内存 cache、文件读写 adapter、debounce save、size limit 与 migration envelope；具体目录选择、历史裁剪规则和业务 schema 仍放在上层
- 下游若要把它接到 Zotero 运行时，优先复用 `src/platform/zotero-file-storage.js` 把 `Zotero.DataDirectory.dir` 绑定成 `readText/writeText` adapter
- 如果目录和文件命名已经确定，优先直接使用 `src/platform/zotero-json-state-store.js` 作为一步接线的最短路径

## Task Runner

- 如果下游需要 provider 调度、后台批处理或多类型异步任务，优先从 `src/services/task-runner.js` 开始，再由 runner 复用 `src/services/task-queue.js`
- `task-runner` 只负责 `descriptor -> handler -> result snapshot`；provider catalog、文件持久化和 UI state 仍放在更上层
- 相关参考技术链与边界见 [Reference Plugin Technical Chains](docs/REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)

## Zotero 真机测试

1. 复制 `.env.example` 为 `.env.local`
2. 配置 `ZOTERO_PLUGIN_ZOTERO_BIN_PATH`
3. 运行 `npm run zotero:smoke`、`npm run zotero:watch` 或 `npm run zotero:console`

更多说明见 [Zotero 测试与调试](docs/ZOTERO_TESTING.md)。

## Agent 工作台

- `agent:obsidian` 会把当前项目态导出到 `obsidian/agent-workbench/`
- 默认工作台会生成 `项目模块图谱/`
- 其中会包含 `06-当前扩展波次-模块焦点.md`
- 其中会包含 `07-能力目录-当前插件能力清单.md`
- 可选视觉 companion 会生成 `12-当前Zotero插件-交互流转图.md`
- 工作台还会生成 `14-当前Zotero插件-UI 具象布局图.excalidraw.md`
- 人工介入窗口固定使用 `10-模板协作-人工指令窗口.md`
- 如需刷新当前工作台，优先执行 `npm run agent:sync`

## 新 Agent 接手顺序

1. 先读 [当前剩余任务清单](docs/CURRENT_BACKLOG.md) 的“当前单一事实源”，不要直接根据旧 `dist/` 工件或 README 历史段落判断当前主线
2. 如只需快速定向当前项目态，可先看 `dist/agent-context.json` 的 `runtimeCompact` 视图；一旦涉及 truth、wave、validation 或 scope 判定，仍回到 `docs/CURRENT_BACKLOG.md` 与 project mirror
3. 先运行 `npm run check`，确认源码、配置、文档 truth 与 clean-room 门禁都处于一致状态
4. 如果刚执行过 `npm run init:workspace`、刚迁移仓库，或需要给人类查看当前 Obsidian 工作台，优先执行 `npm run agent:sync`
5. 如果 `config/addon.config.json` 仍是模板默认值，例如 `cleanroom-template@example.com`、`Your Team`、模板仓库 `homepage` 或模板专用 `updateURL`，先暂停开发并询问用户初始化信息：`addonName`、`addonId`、`addonRef`、`author`、`homepage`、`updateURL`
6. 如果改动会影响宿主运行时、场景或 UI，优先执行 `npm run agent:zotero:e2e`；需要连续迭代热重载时再使用 `npm run zotero:watch`
7. 每轮改动后重建 `npm run agent:monitor` 与 `npm run agent:gate`
8. 只有在当前任务明确属于发布链时，才进入 `npm run release:plan -> npm run release:upload -- --provider <provider> --release-tag <tag> --target-base-url <url> -> 手动上传远端产物 -> npm run release:preflight -- --verify-remote -> npm run release:prepare -> npm run release:matrix -> npm run agent:gate:release`
9. 如果目标是交付纯源码，而不是把本地工件一起带走，使用 `npm run export:project`

补充规则：

- 如果本轮改动改变了当前批次的验证分级、可见面判定或 in-scope 模块，除了更新 `config/project-validation-overrides.json` / `config/project-expansion-wave.json`，还要同步更新 `docs/CURRENT_BACKLOG.md`
- project mirror 负责机器可读判定，`docs/CURRENT_BACKLOG.md` 负责当前阶段 truth；两者必须同轮收口，不要各写一套阶段结论

## Codex / Opencode 分工脚手架

当前仓库已落地一套 Codex / Opencode 委托分工脚手架，用于区分“架构与规划”任务和“实施与交付”任务的执行与审查。

默认协作口径：

- 中大型任务先由 controller 读 truth、拆 scope、定 owner，再决定是否启动委托，不要直接让多个 worker 同时改未切清的写域
- 默认每批次只有一个 strict write owner；并发 lane 只允许出现在 `read-only`、`review` 或写域完全不重叠的场景
- 如果仓库已经保留 `config/agent-delegation-tasks.json`，优先复用现有 `agent:delegate:*` 命令，而不是临时拼第二套委托协议
- worker 遇到提权、GUI、联网、宿主启动或 scope 扩张需求时，应回 blocker 和精确命令，不自行绕过权限边界

### 任务分类

| Lane | 职责 |
|------|------|
| `codex-architecture-planning` | 冻结 contract、调整 patch 语义、裁定边界 |
| `opencode-implementation-delivery` | 补文档、补测试、执行已明确方案下的受限实现 |

### 核心文件

| 文件 | 功能 |
|------|------|
| `config/agent-delegation-tasks.json` | 任务清单 manifest |
| `scripts/agent-delegation.mjs` | 委托执行 CLI，提供 `list` / `run` / `review` / `close` |
| `scripts/agent-delegation-lib.mjs` | prompt 构建、快照比对、审查判定 |
| `scripts/agent-git-closure-lib.mjs` | 本地 Git 收口、提交信息生成 |
| `tests/agent-delegation.test.js` | 委托流程测试 |

### 运行命令

```bash
node scripts/agent-delegation.mjs list
node scripts/agent-delegation.mjs run <taskId>
node scripts/agent-delegation.mjs review <taskId> --reviewer codex
node scripts/agent-delegation.mjs close <taskId> --dry-run
node scripts/agent-delegation.mjs close <taskId>
```

### 审查工件

| 文件 | 内容 |
|------|------|
| `task.json` | 任务定义快照 |
| `invocation.json` | 执行命令与 prompt |
| `before-snapshot.json` / `after-snapshot.json` | 改动前后快照 |
| `run.json` | 执行记录 |
| `review.json` / `review.md` | 审查结论 |
| `git-closure.json` / `git-closure.md` | 本地 Git 收口结果 |

## 合规工作流

1. 先在 `SPEC.md` 冻结当前模板的黑盒行为声明
2. 维护 `LEGAL_RISK_CHECKLIST.md`，确保 Development Gate 可追溯，并把 China Commercial Delivery Gate 作为 release-only 门禁
3. 日常开发运行 `npm run cleanroom:audit`
4. 如需本地相似度排查，再运行 `npm run cleanroom:sim`
5. 同步维护 `CODE_PROVENANCE.md`、`THIRD_PARTY_NOTICES.md` 与 `COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md`
6. 发布前执行 `npm run release:preflight`

## 文档

- [Agent 入口](AGENTS.md)
- [Claude Code 入口](CLAUDE.md)
- [API 参考](docs/API.md)
- [架构说明](docs/ARCHITECTURE.md)
- [使用指南](docs/GUIDE.md)
- [Zotero 测试与调试](docs/ZOTERO_TESTING.md)
- [Obsidian 人工介入](docs/OBSIDIAN_INTERVENTION.md)
- [中国法优先法务策略](docs/LEGAL_CN_STRATEGY.md)
- [参考实现差异分析](docs/REFERENCE_COMPARISON.md)
- [Reference Plugin 技术链抽象](docs/REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)
- [UI 创建路径](docs/UI_CREATION_PATHS.md)
- [Reference Plugin UI 来源追踪](docs/REFERENCE_PLUGIN_UI_ANALYSIS.md)
- [BibGenie 参考分析](docs/REFERENCE_BIBGENIE_ANALYSIS.md)
- [本地 Reference 快照说明](docs/REFERENCE_SNAPSHOTS.md)
- [Agent 自主开发路线图](docs/AGENT_AUTONOMY_ROADMAP.md)
- [Agent 能力地图](docs/AGENT_CAPABILITIES.md)
- [当前剩余任务清单](docs/CURRENT_BACKLOG.md)
- [变更记录](CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)
- [代码来源留档](CODE_PROVENANCE.md)
- [第三方 Notices](THIRD_PARTY_NOTICES.md)
- [商业交付权利说明](COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md)

## 许可证

UNLICENSED - 保留所有权利
