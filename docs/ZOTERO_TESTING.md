# Zotero 测试与调试

当前项目已经提供一套 clean-room 的 Zotero runner，用于在隔离 profile/data 环境中启动 Zotero、通过 proxy file 预装当前构建产物，并按需拉起内置 Firefox 开发工具。

## 当前验证结论

- 验证日期：`2026-03-19`
- Zotero 版本：`8.0.2-beta.5+c35d7f21e`
- 已确认可用：
  - `npm run zotero:smoke`
  - `npm run zotero:test`
  - `npm run zotero:scenario`
  - `npm run zotero:console`
  - `npm run zotero:watch`
  - `npm run agent:zotero:e2e`
  - `npm run agent:zotero:loop`
  - `npm run agent:zotero:loop:human`
  - `npm run agent:zotero:watch-recovery`
  - `npm run agent:zotero:autofix`
  - `npm run agent:computer-use:plan`
  - `npm run agent:obsidian`
  - `npm run export:project`
- runner 会先尝试走 Zotero 的原生 add-on 生命周期，再显式触发一次 `Zotero.Plugins.init()`；如果插件实例仍然没有自动挂到 `Zotero[instanceKey]`，则通过 chrome debugger 重放一次 clean-room bootstrap
- runner 通过 `consoleActor.evaluateJSAsync + Promise.resolve(...) + Services.tm.spinEventLoopUntil(...)` 在 Zotero chrome 侧同步等待异步表达式完成，避免 RDP 返回 `Promise<pending>` 干扰 agent 判定
- 已额外在干净 profile 中验证：打包产物 `dist/cleanroomtemplate-0.1.0.xpi` 通过 Zotero “Install Add-on From File” 安装后，会自动进入原生 bootstrap 生命周期，并挂出 `Zotero.CleanroomTemplate.api`
- `npm run zotero:test` 当前会验证 3 条真机断言：插件实例挂载、baseline API 暴露、默认 `ItemPane / ItemTree / Reader 菜单` demo 已进入 Zotero 原生管理器或注册表
- `npm run zotero:scenario` 当前会验证 12 条真机场景：baseline 注册、真实条目选择、真实条目修改触发 Notifier、真实 PDF Reader 打开、Reader 交互摘要、Reader 批注回环、Reader renderToolbar 事件桥、Reader 细粒度浮层/上下文菜单探针、settings schema 与偏好设置面板诊断、preference pane live control interaction、多窗口挂载、无阻塞 agent 动作
- `npm run zotero:watch` 当前已验证：启动健康检查通过；一次真实热重载后会刷新 `dist/zotero-watch-status.json` 与 `dist/zotero-watch-status.md`；一次受控构建失败后会先进入 `runtime-recovery`，并已在强制注入 runtime 恢复失败的情况下实测通过 `session-restart-recovery`
- `npm run agent:zotero:watch-recovery` 当前已验证：可在真机中自动完成“启动 watch -> 注入一次性 build 失败 -> 注入一次性 runtime 恢复失败 -> 观测 session-restart-recovery 成功”的受控回归，并输出独立恢复报告
- `agent:monitor` / `agent:dashboard` / `agent:gate` 已接入 `dist/zotero-watch-status.json`：agent 主报告会展示热重载状态、状态时间与简单问题摘要；开发档位门禁会额外识别“健康但已过期”或“时间超前”的旧状态，避免误把陈旧/异常结果当成当前可用结论
- `agent:monitor.json` 现在额外提供 `frontpageSummary` / `readinessSummary` 轻量摘要，包含当前状态、摘要结论、下一步建议，以及 `watch / e2e / autofix / watchRecovery` 的压缩视图；`e2e.readerEventReport` 会继续暴露 Reader 事件桥状态、已知事件类型数、探针类型数与 synthetic-fallback 摘要，方便 agent 先快速判定，再决定是否继续读取 `agent-gate.json`
- `agent:monitor` 当前已接入 `debugProbe` 压缩视图：会显示最近 probe 状态、是否对齐最新 E2E、已执行 bundle 数与 advisory 摘要，用来区分“当前失败还没补追问”与“probe 已给出额外解释力”
- `agent:gate` 现已识别 Reader 事件桥退化：如果真机报告显示 Reader 事件 API 不可用、细粒度 Hook 摘要异常，或 `synthetic-fallback` 缺失，开发档位会阻断继续推进，并明确指向 Reader 事件桥实现与对应真机场景
- `agent:memory` / `agent:monitor` 现在会把 Reader 事件桥作为独立信号归档到 `agent-memory/signals/readerEvent.json`，用于识别“主闭环仍通过，但 Reader 事件桥在回归退化”的历史趋势
- `agent:zotero:e2e` / `agent:monitor` / `agent:gate` 现已接入 capability manifest 覆盖摘要：会按能力维度汇总“已覆盖 / 失败 / 未覆盖”，并在开发档位下拦截“能力地图有新增但未接入真机场景”的状态
- agent 遥测、真机回归与汇总工件现在支持通过 `AGENT_ARTIFACTS_DIR` 重定向输出目录，`agent:zotero:e2e` / `agent:zotero:autofix` / `agent:zotero:watch-recovery` / `agent:monitor` / `agent:dashboard` / `agent:gate` 都会遵循这套目录规则，便于单元测试、脚本调试或故障复盘时隔离临时工件，不污染 `dist/` 下的真实 Zotero 结论
- `session-restart-recovery` 现在同时具备自动化回归覆盖和真机级受控故障注入回归，两层都能验证“runtime 恢复失败后会切到会话重启恢复”
- 这让项目已经可以进入受控的 Zotero 真机测试阶段，也具备发布态安装路径的基础验收结论

## 准备

1. 复制根目录的 `.env.example` 为 `.env.local`
2. 至少确认 `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` 指向本机 Zotero 可执行文件

示例：

```ini
ZOTERO_PLUGIN_ZOTERO_BIN_PATH=/Applications/Zotero.app/Contents/MacOS/zotero
```

如果不填写 `ZOTERO_PLUGIN_PROFILE_PATH` 和 `ZOTERO_PLUGIN_DATA_DIR`，runner 会自动使用仓库内的隔离目录：

```text
.zotero-runtime/dev/
.zotero-runtime/console/
.zotero-runtime/smoke/
```

## 命令

```bash
npm run zotero:dev
npm run zotero:watch
npm run zotero:console
npm run zotero:smoke
npm run zotero:test
npm run zotero:scenario
npm run agent:zotero:e2e
npm run agent:zotero:debug-probe
npm run agent:zotero:e2e:restart
npm run agent:zotero:loop
npm run agent:zotero:loop:human
npm run agent:zotero:watch-recovery
npm run agent:zotero:autofix
npm run agent:computer-use:plan
npm run agent:obsidian
npm run export:project
```

## Debug Probe Design

当前仓库已新增独立命令 `npm run agent:zotero:debug-probe`，用于按 `smart` / `force` 模式执行受控 `debug probe` bundles。

这份设计的核心语义是：

- 主线仍以 `watch -> e2e -> monitor -> gate` 为准
- `debug probe` 只在失败后按条件触发，不进入每轮主线
- probe 优先复用已有 `Host Action`、`Agent Scenario`、`evaluateInChrome(...)` 与 runtime log bridge
- probe 默认只提升解释力和 host-visible 成熟度标签，不直接改写 `agent:gate` 语义

当前第一期实现形态：

- `npm run agent:zotero:debug-probe`
  - 默认 `smart` 模式
  - 会尝试从最新 `agent-zotero-e2e.json` 中挑选匹配的 probe bundles
- `npm run agent:zotero:debug-probe -- --mode force`
  - 强制执行当前已登记 bundles
- `npm run agent:zotero:debug-probe -- --probe reader-sidebar-view-closure`
  - 显式执行单个 bundle
- `npm run agent:zotero:debug-probe -- --list-probes`
  - 只列出可用 bundles
- `npm run agent:zotero:e2e -- --probe-mode smart`
  - 默认仍是 `off`
  - 仅在 E2E 失败尾声触发一轮 advisory sidecar
  - 先写出本轮 `agent-zotero-e2e.json`，再让 debug probe 读取最新失败信号做 `smart` 选择
  - debug probe 结果会回填到 `agent-zotero-e2e.json/.md`，同时独立写到 `agent-zotero-debug-probe.json/.md`

当前尚未做的事情：

- 还没有扩展到模板之外的下游自定义 surface

因此当前应把它理解为：

- 一个独立可跑、也可作为 E2E 失败尾声 sidecar，并已被 monitor / gate 以 advisory 方式消费的调试支线
- 不是默认主线
- 即使现在已支持 `agent:zotero:e2e -- --probe-mode smart|force`，仍应继续以 [ZOTERO_DEBUG_PROBE_CONTRACT.md](./ZOTERO_DEBUG_PROBE_CONTRACT.md) 为准，而不是把 `zotero:console` 直接产品化成任意 Console UI 自动化。

说明：

- `npm run zotero:dev`
  - 重新构建当前插件
  - 启动隔离 Zotero
  - 通过 `profile/extensions/<addonId>` proxy file 预装 `build/<addonRef>`
  - 必要时通过 chrome debugger 补 bootstrap fallback
  - 默认复用项目 `.zotero-runtime/dev/` 下的 profile/dataDir；它与个人日常 profile 隔离，但不是一次性 fresh/disposable profile
  - 保持 Zotero 打开，适合人工调试
- `npm run zotero:console`
  - 与 `zotero:dev` 相同
  - 额外追加 `--jsdebugger`
  - 请求 Zotero 拉起内置 Browser Toolbox
- `npm run zotero:watch`
  - 与 `zotero:dev` 相同
  - 轮询监听 `src/`、`addon-static/`、`config/`
  - 变更后重新构建，并通过 RDP 对 add-on 执行 `reload`
  - 随后重启 clean-room runtime，保证最新脚本生效
  - 每次热重载后自动执行宿主健康检查、收集 `console`/`Zotero.debug` 摘要，并写出 `dist/zotero-watch-status.json` 与 `dist/zotero-watch-status.md`
  - 若热重载或构建失败，会先尝试 `runtime-recovery`；若仍不健康，再自动进入一次 Zotero 会话重启恢复
  - 维护侧可使用 `ZOTERO_PLUGIN_WATCH_RECOVERY_INJECT=runtime-recovery-once` 强制让一次 `runtime-recovery` 失败，用于回归 `session-restart-recovery`
- `npm run zotero:smoke`
  - 重新构建当前插件
  - 启动隔离 Zotero
  - 预装插件并验证 add-on 已加载
  - 验证 `Zotero[instanceKey].api` 已可访问；必要时自动补 bootstrap fallback
  - 验证完成后自动退出
- `npm run zotero:test`
  - 启动隔离 Zotero
  - 预装当前插件
  - 在 Zotero 主进程内执行 `zotero-tests/*.test.js`
  - 根据测试失败数返回退出码
- `npm run agent:zotero:e2e`
  - 自动执行两轮闭环（默认热重载）
  - 每轮都执行：插件动作校验 + `zotero-tests` + `zotero-scenarios` + 控制台/`Zotero.debug` 日志采集
  - 在 macOS 上默认额外采集每轮 `库视图` 与 `Reader` 截图，输出到 `dist/agent-zotero-e2e-assets/`
  - 输出 `dist/agent-zotero-e2e.json` 和 `dist/agent-zotero-e2e.md`
  - 支持 `--probe-mode off|smart|force`；默认 `off`，仅在失败尾声补跑 advisory debug probe
  - 失败时返回非零退出码，可直接作为 agent gate
- `npm run agent:zotero:loop`
  - 先读取当前 `watch / e2e / autofix / watch-recovery / gate` 工件
  - 自动推导本轮最小动作集合，例如“只刷新 watch”或“直接进入 autofix”
  - 若最新失败 E2E 命中 smart debug probe 候选、且当前还没有 fresh probe 结果，loop 会优先把下一次 E2E 升级成 `npm run agent:zotero:e2e -- --probe-mode smart`
  - 默认会在需要时刷新 `zotero:watch` 启动健康状态，并在末尾重建 `agent:monitor` 与 `agent:gate`
  - 输出 `dist/agent-zotero-loop.json` 与 `dist/agent-zotero-loop.md`
  - 支持 `--dry-run` 仅生成计划，不实际打开 Zotero
- `npm run agent:zotero:loop:human`
  - 与 `agent:zotero:loop` 相同，但会先刷新 Obsidian 工作台，并等待一个人工介入窗口
  - 默认等待 60 秒；如果人工没有修改指令窗口，agent 自动继续
  - 如果人工填写了“下一步指令”，agent 会按人工指令改写本回合动作顺序
- `npm run agent:obsidian`
  - 读取当前 `agent-zotero-loop / agent-gate / agent-monitor / agent-zotero-e2e` 工件
  - 输出到独立目录 `obsidian/agent-workbench/`
  - 默认以“当前 Zotero 插件”为中心生成工作台，而不是生成模板框架总览
  - 包含当前插件功能与技术脉络白板、状态总览、证据索引、功能与可见面地图、功能模块图谱、技术脉络与宿主接入、分 surface 的 UI 概念图、UI 具象 Excalidraw，以及模板协作指南和人工指令窗口
  - 可通过 `AGENT_OBSIDIAN_DIR=/path/to/vault-folder` 重定向到单独的 Obsidian 管理目录
- `npm run export:project`
  - 导出剔除 agent / runner / tests / docs / reference 的纯项目工程
  - 输出目录：`dist/<addonRef>-<version>-pure-project/`
  - 同时生成 zip 归档，便于单独交付或迁移
- `npm run agent:zotero:e2e:restart`
  - 与上面相同，但轮次间采用“重启 Zotero 再加载插件”的策略
  - 用于验证“热重载通过但冷启动失败”的隐性问题
- `npm run agent:zotero:watch-recovery`
  - 自动启动 `zotero:watch`
  - 通过 `config/.watch-recovery-trigger.tmp` 触发一次真实 watch 变更
  - 通过 clean-room 测试钩子注入一次性 build 失败与一次性 runtime 恢复失败
  - 验证 `session-restart-recovery` 能否把会话拉回健康状态
  - 输出 `dist/zotero-watch-recovery-regression.json` 与 `dist/zotero-watch-recovery-regression.md`
- `npm run agent:zotero:autofix`
  - 先执行 `agent:zotero:e2e`
  - 若失败，则根据报告中的运行时挂载/测试失败模式，尝试受控恢复步骤
  - 当前恢复动作包括：`npm run check`、`fresh + restart` 复验、`npm run zotero:test`、`npm run zotero:scenario`
  - 若当前仅剩库视图/Reader 视觉漂移，会先自动执行 `npm run agent:zotero:e2e:update-baseline`，再回到 compare 模式复验
  - 当前 E2E 已能观测 `readerSummaryCommandRegistered` 与 `readerSummaryMenuRegistered`，可区分 Reader 摘要命令缺口与 Reader View 菜单缺口
  - 若显式带上 `--apply-whitelisted-patch` 且命中 `reader-entry:*`，还可受控在 `src/app/feature-composer.js` 中补回 Reader 摘要命令或 Reader View 菜单注册块
  - 若显式带上 `--apply-whitelisted-patch` 且命中 `reader-ui:reader-visual-drift`，视觉 `copy` 补丁只允许按 `restart/hot-reload + library/reader` 的 canonical 映射回写对应基线文件
  - 若显式带上 `--apply-whitelisted-patch` 且命中 `reader-ui:reader-visual-drift`，还可受控把最新 E2E 截图复制回 `tests/visual-baselines/agent-zotero-e2e/`，作为第一类 Reader 低风险白名单修正
  - 最终输出 `dist/agent-zotero-autofix.json` 与 `dist/agent-zotero-autofix.md`
- `npm run agent:computer-use:plan`
  - 查看 default-disabled 的 Codex Computer Use 真机桌面验证支线
- `npm run agent:computer-use:list`
  - 列出当前必补项与已触发的条件项
  - 当前默认必补项固定为 `review workbench standalone window visible smoke`
  - 当前会直接显示每个 workflow 的默认 `proof kind`、`proof scope` 与 `default non-claims`
  - 现在还会显示 `runtime-preflight`；若出现 `other same-bundle Zotero process(es)` 或多个匹配 runtime，workflow 会直接标成 `blocked`，避免在当前 Computer Use 无法可靠选实例时继续正式会话
  - 若触发了很多 `surface-local` 候选，plain-text 输出默认只展示前 `3` 个，并给出 `--show-all-surfaces` 与 `--surface <surface-id>` 的聚焦提示
- `npm run agent:computer-use:prepare`
  - 为默认必补项建立独立的 Computer Use 会话目录与工件
  - 可通过 `--all-triggered` 一次性准备“必补项 + 已触发条件项”
  - 条件项一是本地安装态复核，条件项二是被重新打开的 host-visible surface
  - 若显式带 `--surface <surface-id>`，surface-local catalog 和 prepare 结果都会只聚焦该 surface
  - 该支线只在用户明确要求后通过 `npm run agent:computer-use:validate -- --user-requested --target "<目标>"` 启动
  - 对 `review workbench standalone window visible smoke`，默认只把桌面观察收口到独立窗口 open / reuse / close 语义；若当前 runtime 没有真实 host-visible Prompt / menu / shortcut 入口，不得把 plugin-local fallback command 记成“命令面板入口已通过”
  - `prepare` 生成的会话工件会带 `proofContract`，`record` 会再写入 `result.proof.kind`、`result.proof.summary`、`result.proof.nonClaims`、`hostVisibleEntryObserved` 与 `entryRouteObserved`，避免只看 `pass` 就误读成 host-visible 入口或 release 闭环已通过
  - 若 workflow 带 `launchRuntime.desktopInstanceMatchRequired=true`，`record` 还要求显式记录 `--runtime-instance-match matched|mismatched|unknown` 与对应 `--runtime-instance-evidence`；没有确认“当前桌面窗口就是目标 runtime”时，不允许把结果记成 `pass`
  - 若 `prepare` 阶段就已发现同 bundle 多实例或多个匹配 runtime，这条 workflow 会先以 `blocked` 返回；需要先关闭冲突 Zotero 实例，再重新准备正式会话
  - `prepare` 还会给出预填默认 `--proof-kind` 的 `recordGuidance`，并显示默认/可升级 proof 的 `non-claims`；若要记 `host-visible-entry-window-lifecycle`，必须同时记录真实入口路径
  - 它只生成 / 记录 `dist/agent-computer-use-validation.json` 与 `dist/agent-computer-use-validation.md`
  - 不进入 `check`、`agent:zotero:e2e`、`agent:zotero:loop`、`agent:gate`、`agent:gate:release` 或 `agent:pipeline`
  - 详细 contract 见 [CODEX_COMPUTER_USE_VALIDATION.md](./CODEX_COMPUTER_USE_VALIDATION.md)
- `npm run release:install-smoke:stable -- --keep-open`
  - 当前会在正式安装态 smoke 通过后保持 Zotero 打开，便于 Computer Use 接管桌面做本地安装态复核
  - 若系统里同时开着其他同 bundle Zotero 实例，当前 Computer Use 会话应先视为 `blocked`，因为它可能绑定到错误窗口；只有清掉冲突实例并重新准备后，才允许进入正式本地安装态复核
  - 这只用于本地安装态确认，不代表远端 `updateURL / update_link` 已通过
- `npm run zotero:scenario`
  - 单独执行 `zotero-scenarios/*.scenario.js`
  - 当前采用“注册一次 -> 逐场景执行”的 runner 模型，不再把整包场景当成单次黑盒求值
  - 当前默认场景已经覆盖真实 Zotero 数据路径，而不只是 demo 假数据
  - 支持 `--list-scenarios`、`--scenario <pattern>`、`--scenario-file <pattern>` 做最小复现
  - 每次执行会写出 `dist/zotero-scenario-last-run.json` 与 `dist/zotero-scenario-last-run.md`
  - 适合对“插件动作链路”做更细粒度的真机回归，而不必每次都跑完整 E2E

## 工件隔离

默认情况下，agent 相关工件会写到 `dist/`，包括：

- `agent-runs/*.json`
- `agent-monitor.{json,md}`
- `agent-gate.{json,md}`
- `agent-dashboard.html`
- `zotero-watch-status.{json,md}`
- `agent-zotero-e2e.{json,md}`
- `agent-zotero-loop.{json,md}`
- `agent-computer-use-validation.{json,md}`（仅用户明确要求启动 Codex Computer Use 支线后生成）
- `/tmp/codex-cu/<YYYYMMDD-HHMMSS>-<target-slug>/agent-computer-use-validation.{json,md}`（通过 `agent:computer-use:prepare` 为每个目标生成独立会话目录时）
- `zotero-watch-recovery-regression.{json,md}`
- `agent-zotero-autofix.{json,md}`
- `zotero-scenario-last-run.{json,md}`

另有一组 Obsidian 人工介入工件默认写到独立目录 `obsidian/agent-workbench/`，不放进 `dist/`：

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
- `项目模块图谱/00-当前Zotero插件-功能模块总览.md`
- `项目模块图谱/01-主线-偏好设置与宿主窗格.md`
- `项目模块图谱/02-主线-Reader 工具栏与侧栏.md`
- `项目模块图谱/03-主线-菜单与子菜单.md`
- `项目模块图谱/04-支撑-统一装配与 Host Action.md`
- `项目模块图谱/05-支撑-验证与证据闭环.md`
- `项目模块图谱/06-当前扩展波次-模块焦点.md`
- `项目模块图谱/07-能力目录-当前插件能力清单.md`
- `项目模块图谱/当前Zotero插件-功能模块图谱.canvas`
- `14-当前Zotero插件-UI 具象布局图.excalidraw.md`

启用 `AGENT_OBSIDIAN_VISUALS=1` 时，还会额外生成：

- `12-当前Zotero插件-交互流转图.md`
- `13-当前Zotero插件-功能版图.excalidraw.md`

其中：

- `agent-monitor.json` 适合作为“运行态总览”，现在可优先读取 `frontpageSummary` / `readinessSummary`
- `agent-dashboard.html` 会把 Reader 事件桥单独渲染成摘要卡片，便于人工快速确认事件 API 是否可用、细粒度 Hook 是否已被真机观测
- `agent-gate.json` 适合作为“是否可继续推进/发布”的准入判定
- `obsidian/agent-workbench/01-当前Zotero插件-状态总览.md` 适合作为“当前插件主线入口”
- `obsidian/agent-workbench/05-当前Zotero插件-功能与可见面地图.md` 适合作为“当前插件各可见面分组入口”
- `obsidian/agent-workbench/项目模块图谱/00-当前Zotero插件-功能模块总览.md` 适合作为“当前插件功能模块入口”
- `obsidian/agent-workbench/项目模块图谱/06-当前扩展波次-模块焦点.md` 适合作为“当前 active wave scope / acceptance 入口”
- `obsidian/agent-workbench/项目模块图谱/07-能力目录-当前插件能力清单.md` 适合作为“当前真实能力入口 / 场景 / 责任文件入口”
- `obsidian/agent-workbench/06-当前Zotero插件-技术脉络与宿主接入.md` 适合作为“当前 surface 为什么走这条技术链”的定位入口
- `obsidian/agent-workbench/14-当前Zotero插件-UI 具象布局图.excalidraw.md` 适合作为“当前 surface 在真实宿主布局中的定位入口”
- `obsidian/agent-workbench/10-模板协作-人工指令窗口.md` 仍是唯一人工输入面

如果你只是想做脚本联调、单元测试，或希望把一次实验性的 agent 判断与当前真机结论分开，可以临时指定：

```bash
AGENT_ARTIFACTS_DIR=/tmp/addon-template-agent-artifacts npm run agent:zotero:e2e
AGENT_ARTIFACTS_DIR=/tmp/addon-template-agent-artifacts npm run agent:zotero:autofix
AGENT_ARTIFACTS_DIR=/tmp/addon-template-agent-artifacts npm run agent:zotero:watch-recovery
AGENT_ARTIFACTS_DIR=/tmp/addon-template-agent-artifacts npm run agent:monitor
AGENT_ARTIFACTS_DIR=/tmp/addon-template-agent-artifacts npm run agent:gate
```

如果希望人工介入资料进入单独 Obsidian 目录，也可以额外指定：

```bash
AGENT_OBSIDIAN_DIR=/tmp/addon-template-obsidian npm run agent:obsidian
AGENT_OBSIDIAN_DIR=/tmp/addon-template-obsidian npm run agent:zotero:loop:human
```

建议：

- 真实 Zotero 验证完成后，保留默认 `dist/` 输出，作为当前项目状态的主结论
- 测试或故障注入场景下，优先使用临时目录，避免旧的失败样本把 `agent:gate` 或 `agent:dashboard` 误导成当前状态

## 已启用的能力

- 隔离 profile / dataDir
- 自动生成 `user.js` 调试 pref
- 自动写入 proxy install 文件
- 自动启动 Zotero RDP server
- 自动校验插件是否出现在 add-on 列表
- 自动将插件 `locale/*.ftl` 注入主窗口，供 `ItemPane` 等官方 API 使用
- 默认接通 `Notifier`、窗口快捷键、`ItemPane Section/InfoRow`、`ItemTree` 自定义列、`Reader` 菜单与活动上下文摘要示例
- 自动在 native lifecycle 与 `Zotero.Plugins.init()` 都未完成挂载时补一次 chrome bootstrap fallback
- 自动监听源码并执行 RDP reload + runtime restart
- 自动在 `zotero:watch` 中沉淀最近一次热重载的健康状态、问题清单与日志摘要
- 自动把 `zotero:watch` 的状态接入 agent monitor / dashboard / gate，形成“执行 -> 汇总 -> 可视化 -> 门禁”的统一判断面
- 自动在 `zotero:watch` 中对失败热重载执行受控恢复，并把 `watch-change` / `runtime-recovery` / `session-restart-recovery` 事件写入状态报告
- 自动通过 `consoleActor.evaluateJSAsync` 执行 Zotero 内集成测试
- 自动在 Zotero chrome 侧同步等待异步求值完成，避免 console actor 返回未结算 Promise
- 自动在 macOS 上抓取 Zotero 主窗口截图，作为真机验收证据
- 可选拉起 Zotero 内置 Firefox Browser Toolbox

## 当前边界

- 还没有在 Zotero 内跑 Mocha/Chai 的完整真机测试框架
- `zotero:test` 当前使用内置轻量 harness，不是 reference 模版那种 Mocha/Chai 流水线
- runner 仍然保留 chrome bootstrap fallback，作为跨版本和开发态 reload 的防御性兜底，而不是当前版本进入真机测试的硬阻塞
- 正式安装路径目前仅确认到 `Zotero 8.0.2-beta.5+c35d7f21e`，发布前仍应对目标稳定版/目标 beta 版本各回归一次
- 目前只验证了默认 demo 已注册到原生管理器或菜单注册表，还没有对 `ItemPane`/`ItemTree`/`Reader` 的最终视觉呈现做像素级 UI 回归
- `Reader` 当前已经覆盖“生成 PDF -> 导入附件 -> 打开真实 reader -> 读取摘要/交互快照/UI 状态 -> 创建/更新/删除批注并回读”的路径，但还没有进入 reader iframe 内部事件或 UI 注入层

## Host Action Replay

当前模板已为 current active host-visible surface 补上一层 source-aligned action replay，用来证明“真实动作被回放”以及“动作后的结果可观察”，但它不是 strict visual 的替代品。

本轮对齐的 Zotero 依据固定来自：

- `reference/zotero-main/test/tests/pluginAPITest.js`
  - `simulateMenuOpen()`
  - `simulateMenuClosed()`
  - `simulateMenuItemClick()`
- `reference/zotero-main/test/tests/itemPaneTest.js`
  - `waitForDOMEvent(popup, "popupshown")`
  - `menu.click()`
- `reference/zotero-main/test/content/support.js`
  - `dialog.getButton(button).click()`

当前动作优先级固定为：

- 宿主公开方法 / 已有 host action
- live `button.click()`
- synthetic `dispatchEvent(new MouseEvent("click"))`
- 菜单场景下的 `command` + `popupshown` / `popuphidden` 同构回放

当前覆盖的 active surfaces：

- `preference-pane`（通过 live control interaction 验证 textbox / menulist / checkbox 写回，不再只认 `preferences.openPane`）
- `menu-item`
- `render-toolbar`
- `reader-sidebar-view`
- `item-pane-sidenav`
- `context-pane`

当前非目标：

- 不做通用 UI 宏录制
- 不做全仓任意按钮点击器
- 不把 `preference-pane` 强行改成按钮动作 surface
- 不让 action replay 代替 surface smoke、surface-local evidence 或 strict visual

## 场景过滤执行

当前 `zotero:scenario` 已支持按文件和按场景名切分执行：

```bash
npm run zotero:scenario -- --list-scenarios
npm run zotero:scenario -- --scenario "menu surface smoke"
npm run zotero:scenario -- --scenario-file "reader-*"
npm run zotero:scenario -- --scenario-file "reader-*" --scenario "reader surface smoke"
```

固定语义：

- `--scenario-file` 先按 `zotero-scenarios/*.scenario.js` 的相对路径或文件名做 substring / glob 过滤
- `--scenario` 再按 `registerZoteroScenario(name, run)` 的 `name` 做 substring / glob 过滤
- `--list-scenarios` 只加载并打印 `scenario name -> source file` 映射，不执行场景
- filtered `zotero:scenario` 只用于调试和最小复现，不替代 full `zotero:scenario` 或 `agent:zotero:e2e` 的 current truth

推荐调试顺序：

1. `npm run zotero:scenario -- --list-scenarios`
2. `npm run zotero:scenario -- --scenario-file <pattern>` 或 `--scenario <pattern>`
3. `npm run zotero:scenario`
4. `npm run agent:zotero:e2e`

## Timeout Taxonomy

当前 runner / scenario 闭环会把“启动前超时”、“Chrome 求值超时”和“scenario helper 自身超时”分开记录：

- `child-exit-before-rdp`
  - Zotero 子进程在 RDP 建联前退出
- `rdp-connect-timeout`
  - Zotero 存活但 RDP 端口未在重试窗口内就绪
- `chrome-evaluation-timeout`
  - RDP 已连接，但 `evaluateInChrome(...)` 没在预算内收到 `evaluationResult`
- `scenario-helper-timeout`
  - 场景内部 `helpers.waitFor(...)` 或同类 helper 等待超时
- `scenario-cleanup-failed`
  - 场景主体已返回或已失败，但 cleanup 阶段仍抛错

当出现 `chrome-evaluation-timeout` 或同等级 runner 级故障时：

- `zotero:scenario` 会保留此前已完成的 partial results
- `lastStartedScenario` / `lastCompletedScenario` 会写入 `zotero-scenario-last-run.{json,md}`
- `agent:zotero:e2e` 会把当前 cycle 标成失败，并在场景摘要中保留 `execution.incomplete` 元数据

## 编写 Zotero 内测试

在 `zotero-tests/` 下新增 `*.test.js` 文件，使用全局 `registerZoteroTest(name, run)`：

```js
registerZoteroTest("plugin instance exists", async ({ assert, Zotero, addonConfig }) => {
  assert.ok(Zotero[addonConfig.instanceKey]);
});
```

测试回调会收到：

- `assert`
- `Zotero`
- `Services`
- `ChromeUtils`
- `addonConfig`
- `plugin`

## 编写 Zotero 场景脚本

在 `zotero-scenarios/` 下新增 `*.scenario.js` 文件，使用全局 `registerZoteroScenario(name, run)`：

```js
registerZoteroScenario("real item selection diagnostics", async ({ assert, helpers, plugin }) => {
  const item = await helpers.createItem({
    itemType: "thesis",
    fields: {
      title: "Agent Scenario Thesis",
    },
  });

  const selection = await helpers.selectItem(item.id);
  const details = plugin.api.agent.inspectItem(item.id);

  assert.includes(selection.selectedIDs, item.id);
  assert.equal(details.isRealItem, true);
  return { ...selection, ...details };
});
```

场景回调会收到：

- `assert`
- `Zotero`
- `Services`
- `ChromeUtils`
- `addonConfig`
- `plugin`
- `helpers`

`helpers` 当前提供：

- `createItem()`：创建临时 Zotero 条目，并在场景结束后自动清理
- `selectItem()`：在主窗口中选择条目，并等待选择态稳定
- `createPDF()`：生成 clean-room 临时 PDF，导入为 Zotero 附件
- `openReader()`：打开指定附件的真实 Reader，并等待初始化完成
- `openMainWindow()`：打开第二个 Zotero 主窗口，并等待插件窗口级挂载可观测
- `wait()` / `waitFor()`：等待宿主异步状态

## 设计原则

- 只使用当前仓库的 clean-room 脚本
- 不引入 reference 模版中的 AGPL 实现
- 仅复用公开行为：命令行参数、RDP 协议行为、Zotero 真实运行结果
