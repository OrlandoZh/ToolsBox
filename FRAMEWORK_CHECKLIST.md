# Zotero Cleanroom Template - 框架完整性检查清单

> 注意
> 本文档回答的是“当前仓库资产是否齐备、哪些链路已经接通”，不是 reference 模版的功能对齐报告。reference 对比请看 [docs/REFERENCE_COMPARISON.md](docs/REFERENCE_COMPARISON.md)。

## 最后检查日期

`2026-03-28`

## 当前结论

- 当前仓库已经是一个可投入实际开发的 clean-room Zotero 插件模板。
- 基础插件骨架、构建、打包、真机验证、受控恢复、质量闸门、Obsidian 人工介入、纯项目导出、本地发布矩阵都已接通。
- 当前“完成度 / 当前主线 / 当前剩余项”只认 `docs/CURRENT_BACKLOG.md` 的“当前单一事实源”；Checklist 只确认资产与链路是否齐备，不再自己冻结另一套 current truth。

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

## 核心资产检查

| 类别 | 当前状态 | 说明 |
|------|------|------|
| 分层架构 | ✅ | `app / core / features / platform / services / settings / utils` 已成型 |
| 零运行时依赖 | ✅ | 保持 clean-room、无 npm 运行时依赖 |
| 类型定义 | ✅ | `types/` 已覆盖核心公开接口 |
| 生命周期管理 | ✅ | 已有 kernel、阶段守卫、bootstrap 桥接 |
| 配置治理 | ✅ | `settings/` 已有 schema / validator / migrations / store |
| 服务层 | ✅ | `services/registry.js` 与 `resource-loader.js` 已接入 |
| Agent 基础链路 | ✅ | `monitor / dashboard / gate / zotero:e2e / autofix / loop` 已接通 |
| 本地发布矩阵 | ✅ | `release:matrix` / `release:install-smoke:*` / `agent:gate:release` 已接通本地发布画像 |
| Obsidian 人工介入 | ✅ | 已有工作台、白板、人工窗口、快速上手、介入规范；可选 Mermaid / Excalidraw companion 视图也已落地，可由 `AGENT_OBSIDIAN_VISUALS=1` 启用 |
| 纯项目导出 | ✅ | `export:project` 已可剔除 agent/runner/reference |
| 委托分工脚手架 | ✅ | manifest / CLI / 审查工件已落地，`DOC-LOW-001`、`ENG-LOW-102` 已完成试点验证；`ENG-LOW-201~203`、`ENG-LOW-204~206`、`READER-LOW-201~203`、`READER-LOW-204~206`、`READER-LOW-207~209`、`READER-LOW-210~212`、`READER-LOW-213~215`、`READER-LOW-216~218`、`READER-LOW-225~227`、`READER-LOW-228~230`、`READER-LOW-231~233`、`READER-LOW-234~236`、`READER-LOW-237~239`、`READER-LOW-249~251`、`READER-LOW-252~254`、`READER-LOW-255~257`、`READER-LOW-258~260` 与 `OBSIDIAN-LOW-301~303` 已转入历史 review artifact；`READER-HIGH-126` 也已完成并转为历史契约 / review artifact；默认下一轮架构与规划任务源切到 `ENG-HIGH-104 / ENG-LOW-211~213` |
| 串行 low-task 收口 | ✅ | 启动诊断 + `pre-capture settle` 补丁、`READER-HIGH-124 / READER-LOW-261~263` 的 Reader 视觉采集 / freshness 收口、`READER-HIGH-125` 的 library-only 根因边界冻结，以及 `READER-HIGH-126` 的 library host-noise 修复都已转为历史契约 / review artifact；当前主阻断已清零 |

## 源码结构检查

### `src/`

当前共包含以下主要模块层：

- `src/app/`
  - `kernel.js`
  - `plugin.js`
  - `plugin-api.js`
  - `plugin-agent.js`
  - `capability-manifest.js`
  - `feature-composer.js`
  - `runtime-capabilities.js`
  - `window-runtime.js`
- `src/core/`
  - `logger.js`
  - `prefs.js`
  - `lifecycle.js`
  - `i18n.js`
  - `ui-factory.js`
  - `notifier.js`
  - `keyboard.js`
  - `http.js`
- `src/features/`
  - `menu-manager.js`
  - `item-pane.js`
  - `item-tree.js`
  - `prompt.js`
  - `reader.js`
  - `preference-panes.js`
  - `window-manager.js`
  - `menu-command.js`
- `src/platform/`
  - `zotero-host.js`
- `src/services/`
  - `registry.js`
  - `resource-loader.js`
- `src/settings/`
  - `schema.js`
  - `validator.js`
  - `migrations.js`
  - `store.js`
- `src/utils/`
  - `dialog.js`
  - `progress-window.js`

结论：

- 分层比早期版本更完整，已经不是只有 `core/features/platform` 的轻量骨架。
- `kernel`、`capability-manifest`、`settings`、`services` 这些层已经补上，可支撑后续 agent 继续增强。

## 工具链与脚本检查

### 基础构建链

| 脚本 | 状态 | 说明 |
|------|------|------|
| `npm run build` | ✅ | 构建插件 |
| `npm run package` | ✅ | 生成 `.xpi` |
| `npm run verify` | ✅ | 校验配置与产物要求 |
| `npm run lint` | ✅ | clean-room 轻量检查 |
| `npm run format:check` | ✅ | 空白与格式基线检查 |
| `npm run typecheck` | ✅ | 运行时 API / d.ts 一致性检查 |
| `npm run release:plan` | ✅ | 本地发布计划生成 |
| `npm run release:matrix` | ✅ | 生成 stable/beta 本地发布矩阵 |
| `npm run release:install-smoke:stable` | ✅ | 运行稳定版正式安装态 smoke |
| `npm run release:install-smoke:beta` | ✅ | 运行 beta 正式安装态 smoke |
| `npm run export:project` | ✅ | 纯项目导出 |

### 模板维护检查项

- release / toolchain 测试不得依赖仓库当前 `build/`、`dist/` 或已有 release JSON/Markdown 的残留状态。
- 触达 `release:preflight`、`release:prepare`、`release:matrix`、`release:upload` 的测试时，必须在测试内部先重置旧工件并准备 fresh 本地输入，或显式改用临时 fixture。
- 如果回灌只补了脚本和文档、没有同步补齐测试隔离，这类改动应视为“半回灌”，不能算模板治理真正收口。

### Zotero 真机链

| 脚本 | 状态 | 说明 |
|------|------|------|
| `npm run zotero:dev` | ✅ | 启动隔离 Zotero |
| `npm run zotero:watch` | ✅ | 热重载 + 健康检查 + 两级恢复 |
| `npm run zotero:test` | ✅ | 运行 Zotero 内测试 |
| `npm run zotero:scenario` | ✅ | 运行真机场景 |
| `npm run zotero:console` | ✅ | 拉起 Browser Toolbox |
| `npm run zotero:smoke` | ✅ | smoke 验证 |

### Agent 闭环链

| 脚本 | 状态 | 说明 |
|------|------|------|
| `npm run agent:monitor` | ✅ | 汇总运行态与真机态状态 |
| `npm run agent:memory` | ✅ | 生成故障记忆与修复结果记忆 |
| `npm run agent:dashboard` | ✅ | 生成可视化仪表板 |
| `npm run agent:gate` | ✅ | 开发态质量闸门 |
| `npm run agent:zotero:e2e` | ✅ | 真机闭环验收 |
| `npm run agent:zotero:autofix` | ✅ | 受控恢复 + 白名单补丁计划 |
| `npm run agent:zotero:loop` | ✅ | 单回合编排 |
| `npm run agent:zotero:loop:human` | ✅ | 人工窗口回合 |
| `npm run agent:obsidian` | ✅ | 生成 Obsidian 工作台 |

## Obsidian 工作台检查

默认工作台目录：

- `obsidian/agent-workbench/`

当前生成文件：

- `00-当前Zotero插件-功能与技术脉络.canvas`
- `01-当前Zotero插件-状态总览.md`
- `02-当前Zotero插件-证据索引.md`
- `03-模板协作-人工快速上手.md`
- `04-模板协作-高级介入规范.md`
- `05-当前Zotero插件-功能与可见面地图.md`
- `06-当前Zotero插件-技术脉络与宿主接入.md`
- `07-当前Zotero插件-偏好设置面板 UI 概念.excalidraw.md`
- `08-当前Zotero插件-条目与上下文窗格 UI 概念.excalidraw.md`
- `09-当前Zotero插件-Reader UI 概念.excalidraw.md`
- `10-模板协作-人工指令窗口.md`
- `11-当前Zotero插件-菜单与子菜单 UI 概念.excalidraw.md`

可选增强层（启用 `AGENT_OBSIDIAN_VISUALS=1` 时额外生成）：

- `12-当前Zotero插件-交互流转图.md`
- `13-当前Zotero插件-功能版图.excalidraw.md`

结论：

- 当前工作台默认反映的是“当前 Zotero 插件”的功能面、可见面和技术脉络，而不是模板框架总览。
- “自动继续 + 人工按需介入”的链路已经具备可操作的人类界面。
- Mermaid / Excalidraw 仅作为可选 companion 视图，不替换默认 Markdown + Canvas + 人工指令窗口。
- 人工说明和 agent 输入已分离，避免误把说明文档当作执行指令。

## 测试资产检查

当前 `tests/` 已不再是早期的少量基础模块测试，而是覆盖：

- core 基础模块
- kernel / plugin / capability manifest
- service registry / resource loader
- build / release / toolchain
- zotero runner / watch recovery
- agent telemetry / loop / gate / e2e / autofix / patch / obsidian

当前测试目录下已有约 40 个测试文件与辅助资产，`npm test` 为当前统一入口。

## 已完成能力清单

### 插件模板基线

- 菜单入口
- 命令面板入口
- 偏好设置面板
- ItemPane Section / InfoRow
- ItemTree 自定义列
- Reader 基础菜单与上下文摘要
- Notifier / Shortcut / ProgressWindow demo

### 真机验证与恢复

- 真实条目创建与选择
- 真实条目修改触发 Notifier
- 真实 PDF 附件导入与 Reader 打开
- Reader 交互摘要
- Reader 批注回环
- Reader UI 状态快照
- Reader 事件桥
- 多窗口挂载验证
- `watch-change -> runtime-recovery -> session-restart-recovery` 恢复链

### Agent 辅助开发

- 结构化诊断
- 候选文件推断
- frontpage/readiness 摘要
- dashboard / gate 中文摘要
- 白名单补丁计划与预检
- Reader 事件桥三类结构化诊断与三条白名单修正规则
- `replace-block` 与更细粒度 patch sandbox 护栏
- 最小故障记忆 / 修复结果记忆
- 上下文感知记忆与趋势层
  - `preferredStrategy` 已按 `latestBootMode + zoteroVersionBucket` 做上下文优先推荐
  - `releaseMatrix` 已进入 memory signal
  - `agent:monitor` / `agent:dashboard` 已显示 `contextMatchLevel`
- 本地发布矩阵与发布档位 gate 消费链
  - stable / beta 正式安装态 smoke 已真机通过
  - `remote-settings.sys.mjs` 与 `loading.svg` 已归类为宿主噪声，不再阻断本地安装态 smoke
  - 最新 release gate 仍只因远端 `update.json` 缺少当前模板的有效更新记录 / `update_link` 而阻断
- Obsidian 人工介入窗口
- 纯项目导出

## 仍未完成但不属于“模板骨架缺失”的部分

这些是下一阶段增强项，不应再归类为“框架不完整”：

- `P1` 白名单受控补丁范围扩大
- Reader 更深的宿主事件点与视觉回归
- 当前 truth / verdict 收口与 `library-only drift root-cause` 收口
- 全局错误边界、性能监控点、部分参数验证增强

详见 [docs/CURRENT_BACKLOG.md](docs/CURRENT_BACKLOG.md)。

## 结论

### 完整性判断

当前项目的判断应为：

- ✅ 模板骨架完整
- ✅ 真机开发链路完整
- ✅ agent-assisted 开发闭环已可用
- ✅ 人工介入工作台已可用
- 🟡 完整 autonomous development 仍在下一阶段

### 当前状态

**状态：可继续投入开发与真机验证，不属于“框架还没搭完”的阶段。**
