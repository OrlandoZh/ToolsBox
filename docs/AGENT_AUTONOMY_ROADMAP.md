# Agent 自主开发路线图

本文档面向当前仓库，回答一个更具体的问题：

当前这套 clean-room Zotero 开发模板，已经具备哪些 `agent-assisted` 能力，还缺哪些环节，才能进一步靠近 `agent-autonomous development`。

这里的“自主开发”不是指 agent 无限制改代码，而是指一条受控闭环：

`发现问题 -> 归因定位 -> 生成受限修复方案 -> 应用补丁 -> 重启/热重载 -> 真机复验 -> 沉淀经验`

## 1. 当前已经具备的基础

当前仓库已经具备较完整的"验证与恢复"闭环：

- `zotero:watch`
  - 负责源码监听、重建、热重载、健康检查、两级恢复
  - 主要入口见 [zotero.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/zotero.mjs)
- `agent:zotero:e2e`
  - 负责真机动作、测试、场景、视觉回归、日志采集与结果判定
  - 主要入口见 [agent-zotero-e2e.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-zotero-e2e.mjs)
- `agent:zotero:autofix`
  - 负责在 E2E 失败后执行受控恢复动作并复验
  - 主要入口见 [agent-zotero-autofix.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-zotero-autofix.mjs)
- `agent:monitor` / `agent:dashboard` / `agent:gate`
  - 负责状态汇总、人类可读看板、开发/发布门禁
  - 主要入口见 [agent-monitor.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-monitor.mjs)、[agent-dashboard.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-dashboard.mjs)、[agent-gate.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-gate.mjs)

### Codex / Opencode 委托分工脚手架

当前仓库已落地一套委托分工脚手架，用于区分架构与规划任务（Codex 负责）和实施与交付任务（Opencode 负责）：

**核心文件：**

- `config/agent-delegation-tasks.json`：任务清单 manifest，定义 taskId、lane、scopePaths、依赖关系和审查清单
- `scripts/agent-delegation.mjs`：委托执行 CLI，提供 `list` / `run` / `review` 命令
- `scripts/agent-delegation-lib.mjs`：委托核心库，负责 manifest 加载、prompt 构建、快照比对和审查判定
- `tests/agent-delegation.test.js`：委托功能测试

**任务分类：**

- `codex-architecture-planning`：架构与规划 lane，负责冻结契约、修改 patch 语义、扩大白名单边界
- `opencode-implementation-delivery`：实施与交付 lane，负责文档同步、测试补齐、展示收口

**执行流程：**

1. `list`：列出 manifest 中的所有任务及其 scope
2. `run`：执行指定任务，调用 `mco` 启动 Opencode worker
3. `review`：执行聚焦测试、比对改动范围，输出审查结论

**审查工件（位于 `dist/agent-delegation/<taskId>/`）：**

- `task.json`：任务定义快照
- `invocation.json`：执行命令与 prompt
- `before-snapshot.json` / `after-snapshot.json`：执行前后文件快照
- `run.json`：执行记录（exitCode、耗时、改动文件）
- `provider-result.json`：Opencode 返回结果
- `review.json` / `review.md`：审查结论与人类可读报告

**审查状态：**

- `accepted`：改动在 scope 内且聚焦测试通过
- `reworked-by-codex`：Opencode 已启动或产出部分结果，但最终由 Codex 接手收口
- `needs-fix`：聚焦测试失败
- `rejected`：存在越界改动

**已完成的委托任务：**

- `DOC-LOW-001`（文档同步任务）已于 `2026-03-23` 被 Codex 审查为 `accepted`
- 审查工件见 `dist/agent-delegation/DOC-LOW-001/review.json`
- `ENG-LOW-102`（真实剩余主线与 delegation 状态文档同步）已于 `2026-03-23` 被 Codex 审查为 `accepted`
- 审查工件见 `dist/agent-delegation/ENG-LOW-102/review.json`
- 当前 manifest 已再次重基线：`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`、`READER-HIGH-124 / READER-LOW-261~263` 的 capture failure 结构化 / `capture-command-failed` blocker / freshest-valid artifact 消费、`READER-HIGH-125` 的 library-only 根因边界冻结，以及 `READER-HIGH-126` 的 library host-noise 修复均已完成独立收口并转为历史契约 / review artifact；当前不再保留 active 的 library-only 架构与规划修复批次；下一轮默认架构与规划任务源切到 `ENG-HIGH-104 / ENG-LOW-211~213`，只处理远端发布编排与远端 `updateURL` 闭环验证；`READER-HIGH-123`、`ENG-HIGH-102 / ENG-LOW-204~206`、`READER-HIGH-122`、`READER-HIGH-121 / READER-LOW-258~260`、`READER-HIGH-120 / READER-LOW-255~257`、`READER-HIGH-119 / READER-LOW-252~254`、`READER-HIGH-118 / READER-LOW-249~251`、`READER-HIGH-114`、`READER-HIGH-113 / READER-LOW-237~239`、`READER-HIGH-112 / READER-LOW-234~236`、`READER-HIGH-111 / READER-LOW-231~233`、`READER-HIGH-110 / READER-LOW-228~230`、`READER-HIGH-109 / READER-LOW-225~227`、`READER-HIGH-106` 与 `OBSIDIAN-HIGH-101` 仅保留为历史契约 / review artifact
- `READER-LOW-201`、`READER-LOW-202`、`READER-LOW-203` 已于 `2026-03-24` 收口并转入历史 review artifact
- `READER-HIGH-102`、`READER-LOW-204`、`READER-LOW-205`、`READER-LOW-206` 已于 `2026-03-24` 收口并转入历史 review artifact
- `READER-HIGH-103`、`READER-LOW-207`、`READER-LOW-208`、`READER-LOW-209` 已于 `2026-03-24` 收口并转入历史 review artifact
- `READER-HIGH-104`、`READER-LOW-210`、`READER-LOW-211`、`READER-LOW-212` 已于 `2026-03-25` 收口并转入历史 review artifact
- 上一轮 `P1` canonical fingerprint 收口已进入历史 review artifact；当前不再把该批 low-task 写成 active 项
- `ENG-LOW-201`、`ENG-LOW-202`、`ENG-LOW-203` 已于 `2026-03-24` 以 `reworked-by-codex` 方式收口，并转入历史 review artifact
- 当前 `READER-HIGH-123` 已完成唯一 Reader verdict，并已按 `预期 UI 变化 -> ready / force-next / npm run agent:zotero:e2e:update-baseline` 执行一次受控 baseline refresh
- 当前这轮 baseline refresh coverage 已完成收口：`restart-library.png`、`restart-reader.png`、`hot-reload-library.png`、`hot-reload-reader.png` 均已对齐到 `2000x1200`
- Obsidian visual enhancement 已完成：默认工作台保持 Markdown + Canvas + 人工指令窗口，`AGENT_OBSIDIAN_VISUALS=1` 仅额外生成已落地的 Mermaid / Excalidraw companion 视图
- 全链路（manifest 加载、scope 重叠检测、快照比对、聚焦测试、审查结论）已跑通，委托分工脚手架已具备生产可用性
- Reader 本轮 7 个更深事件点已完成接入与摘要收口
- `2026-03-28` 当前收口约束已锁定：`READER-HIGH-123` 已按唯一 verdict 完成单分支收口，不重复第二次 baseline refresh；是否重新进入人工 verdict / obsidian 路径，统一由 fresh `watch -> e2e -> monitor -> gate` 决定

当前“完成度 / 当前主线 / 当前剩余项”只认 `docs/CURRENT_BACKLOG.md` 的“当前单一事实源”；Roadmap 通过自动同步摘要块镜像这份 truth，不再单独冻结另一套 current phase。

<!-- CURRENT-TRUTH-SUMMARY:START -->
- 当前真实完成度仍约为 `99%`；`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`、`READER-HIGH-124 / READER-LOW-261~263` 的 capture / freshness 收口、`READER-HIGH-125` 的 library-only 根因边界冻结、以及 `READER-HIGH-126` 的 library host-noise 修复继续保留为历史契约 / review artifact；`2026-04-08` fresh `watch -> e2e -> monitor -> gate` 已把当前开发态重新拉回 `stable / ready`
- `HOST-HIGH-201 / HOST-LOW-301~303` 已在 `2026-04-08T01:26:26.211Z` 的 fresh compare 模式 `agent:zotero:e2e` 与 `2026-04-08T01:29:27.786Z` 的 `agent:gate` 中收口：当前 `preference pane`、`context pane`、`item pane sidenav`、`reader renderToolbar / sidebar view`、`menu item / collection menu / dynamic submenu` 的 live geometry、surface-local evidence 与基线比对均已通过，不再作为开发态 blocker
- 当前唯一未收口主线已切到 release-only 的 `ENG-HIGH-104 / ENG-LOW-211~213`：继续沿 `release:plan -> release:upload 计划壳 -> 手动远端上传 -> release:preflight --verify-remote -> release:prepare -> release:matrix -> agent:gate:release` 推进远端发布编排与远端 `updateURL` 闭环验证，不回写插件 runtime 或 host-visible polish 主线
- 当前 active 扩展 wave 已切换为 `AGENT-REVIEW-WORKBENCH-WAVE-001`：新增 dev-only `Agent Review Workbench`，以 `standalone window + plain JS/HTML` 路线承接 `scope -> route -> hostAction -> evidence -> patchPlan -> gate` 六阶段 structured snapshot、字段级批注、deterministic plan builder、验证导航与 workbench-specific acceptance telemetry；该工作台只消费 compact current-truth / evidence snapshot，不把自己升级成新的 truth source
- `AGENT-REVIEW-WORKBENCH-WAVE-001` 的 v1 边界已冻结：不接真实 AI provider、不启用 React optional lane、不提升为产品内用户功能、不自动应用任意源码 patch；若批注指向源码修复，仍只允许链接到现有白名单 patch/autofix 机制或落回 `manual-investigation`
- 当前该 wave 的 validation decision 固定为 `visual-recommended`：优先证明 command entry、window reuse/focus、close cleanup、profile-local JSON state store、annotation CRUD、deterministic plan mapping 与 diagnostics summary 已闭环；standalone window 截图只作为补证，不替代功能验收
- 本轮 `AGENT-REVIEW-WORKBENCH-WAVE-001` 收口继续限定在 workbench 自身工程质量：已把 shell manager 丢失 active window 时的 live-window reuse/focus/close/shutdown fallback、host action `observedStateSummary` allowlist 摘要、standalone shell 中文审查文案、以及 monitor/gate 中 `reviewWorkbench.windowLifecycle/snapshotProvider/annotationCrud/planBuilder` acceptance 与旧 `watch` / Reader visual blocker externalization 接入当前验收口径
- Codex Computer Use 真机验证已作为 default-disabled optional validation lane 建立：`config/codex-computer-use-validation.json` 固定 `enabledByDefault=false`、`gateEffect=non-blocking`、`requiresExplicitUserRequest=true`，手动入口为 `npm run agent:computer-use:validate -- --user-requested --target "<目标>"`；它只生成 / 记录 `dist/agent-computer-use-validation.{json,md}`，不进入 `check`、`agent:zotero:e2e`、`agent:zotero:loop`、`agent:gate`、`agent:gate:release` 或 `agent:pipeline`
- `ZOTERO-DOM-CONTRACT-WAVE-001` 已收口完成：覆盖 `preference pane / item pane / reader` 三条既有宿主面，新增 `domContractReport` route-aware 摘要接入 `agent:zotero:e2e -> agent:monitor / dashboard / gate`，三条 route 均通过；当前保持 advisory + non-blocking，不重开旧的 host-polish blocker
- 当前 `preference pane` 窄宽度 hardening 与右侧 host-visible surface capture 链已全部对齐：以 Zotero 偏好设置宿主窗口最小尺寸 `800x600` 为 host boundary，当前接受“geometry ready + root width observed + no horizontal overflow”的稳定证据，不再把短暂的 geometry settle 超时单独抬成 blocker
- latest live rerun 现已刷新到 `2026-04-08T01:24:38.171Z` 的 `agent:zotero:e2e:update-baseline` 与 `2026-04-08T01:26:26.211Z` 的 fresh compare 模式 `agent:zotero:e2e`：本轮在确认 host-visible polish 行为链稳定后，受控刷新了一次 surface-local baseline；`restart` 与 `hot-reload` 两轮均通过，`tests/scenarios` 保持 `0` 失败，`visualEvidenceFailingItemCount` 已回到 `0`
- 当前 `visual-required` host-polish 判据已回到“blocking `surface-local` evidence 优先”：whole-window `library / reader` 漂移继续保留为 supplemental `capture-unstable` 诊断与归档样本，不再单独阻断 `HOST-HIGH-201 / HOST-LOW-301~303` 这轮 gate
- 当前插件可见文案已统一跟随 Zotero 语言：`menu item`、Reader View 菜单项、`preference pane` 与 `item pane` 基线现统一复用 `main.ftl + i18n bridge`，内置 locale 覆盖 `en-US / zh-CN / zh-TW`
- 最新 bounded foreground `zotero:watch` 已在 `2026-04-06T06:37:05.164Z` 刷新为 `healthy`：startup health 通过、`latestPassed=true`，当前不再把过期 watch 工件视为开发态主阻断
- 最新开发态 `agent:monitor` / `agent:gate` 已在 `2026-04-06T06:37:56.329Z` / `2026-04-06T06:37:56.574Z` 消费 fresh E2E + watch 工件并回到 `stable / ready`；当前 `gatePassed=true`，frontpage headline 已重新固定为“watch、真机验证与恢复回归均已通过，当前闭环状态稳定”
- 当前已新增 dev-only `performanceBudget` advisory：latest direct E2E `2026-04-06T06:35:06.375Z` 已把 lifecycle/http 与代表性 host actions 的预算结果写入 `agent-zotero-e2e / monitor / gate`；当前预算状态已回到 `passed`，`preferences.openPane` 已降到 `1113ms / 1600ms`，活动 `4/4` 全部通过，同时继续保持非阻断，不向下游项目注入额外 runtime profiler 开销
- 最新 focused live probe `reader surface smoke` 已在 `2026-04-04T10:03:46.084Z` 通过，说明 Reader surface smoke 不只停留在历史 E2E 工件，而是继续可在真机单场景复现
- `agent:context` 已新增统一只读上下文层：当前会输出 `dist/agent-context.{json,md}`，汇总 stable / dynamic context、decision hints 与 drift signals；本轮已新增 `runtime-compact-v1` 只读派生视图，默认只暴露 truth/action/status/drift/evidence/artifact refs + freshness/budget，并已接入 gate、Obsidian 工作台、dashboard 与 delegation runtime prompt；`agent:context:guard` 当前继续保持 warning-only
- `ZOTERO-HOST-POLISH-WAVE-001` 已在 `2026-04-08` 收口完成：以 `config/project-validation-surfaces.json` 与现有 host action / surface smoke 为主轴的 live interaction consistency、edge-attached geometry 与 surface-local evidence 已完成模板级闭环；`ZOTERO-DOM-CONTRACT-WAVE-001` 也已完成，在这个完成基线之上追加 route-aware DOM contract advisory，不把上一轮已完成结论重新拉回 blocker
- 已完成的 host polish baseline 验收主线仍固定为 `host-first -> live geometry / interaction consistency -> surface smoke -> surface-local evidence -> full gate`，当前只把这条完成链当作 DOM contract wave 的上游稳定基线，不重开 strict visual 争论
- `OPTIONAL-BUNDLE-WAVE-001` 继续视为已完成基线：`react-ui` 仍保持 implemented + default-disabled，`agent-runtime` / `ai-service` 继续保持 spec-only，`wasm-kernel` 已作为 `probe + digest + shadow unlock derivation` 的 `planned + default-disabled` lane 进入 registry，但不把 optional bundle lane 回灌到当前 DOM contract 主线
- 当前已完成 wave 验收主线：`host-first -> action replay -> route-aware dom contract -> advisory summary`
- 当前唯一 optional bundle registry 仍是 `config/optional-bundles.json`；`react-ui` 当前固定为 `ts-isolated + implemented + enabled=false`，`agent-runtime` 固定为 `ts-isolated + planned + enabled=false`，`ai-service` 固定为 `js-core + planned + enabled=false`，`wasm-kernel` 固定为 `js-core + planned + enabled=false`，本轮不把它们重新拉回当前扩波主线
- 最新 `wasm kernel probe diagnostics` 已在 `2026-04-19` 的 live Zotero scenario 中通过：当前主线程 `rootURI + content/lib/w/...` 与 `ChromeWorker + chrome://<addonRef>/content/lib/w/...` 均可用，但仍只作为 bundle-local probe，不进入默认 `build / package / gate` 主线
- `wasm-kernel` 当前已补 probe 级成本量化链与独立 disabled-contract 报告链：默认 probe 总览仍固定写入 `dist/wasm-kernel-smoke.json` / `dist/wasm-kernel-performance.json` / `dist/wasm-kernel-disabled-contract.json`，digest lane 现已改为并存写入 `dist/wasm-kernel-digest-smoke.json` / `dist/wasm-kernel-digest-performance.json` / `dist/wasm-kernel-digest-disabled-contract.json`，不再覆盖 probe 基线；`npm run wasm:kernel:perf` 与 `npm run wasm:kernel:disabled-contract` 都会按场景优先读取对应 smoke/perf 证据，再回退到默认 artifacts。当前已记录 source/build 资产合计 `7.96KB`，并完成 fresh live repeated smoke：probe `3/3` 通过、main-thread 中位 `1ms`、worker 中位 `3ms`；digest `3/3` 通过、main-thread 中位 `1ms`、worker 中位 `5ms`；disabled-contract 也已回到 `passed`。shadow-mode `runtime.deriveWasmKernelUnlockToken` 已落地为 bundle-local 业务 derivation 实验，并新增 `wasm kernel unlock diagnostics` 场景；当前判断继续保持 `planned + default-disabled`
- `wasm-kernel` 当前已补固定聚合入口：`npm run wasm:kernel:matrix` 会把 probe/digest 两条 lane 的 smoke / perf / disabled-contract 收成 `dist/wasm-kernel-matrix.json` / `md`，统一给 controller 使用；当前矩阵结论固定为 `keep-planned-default-disabled`，不会自动把 lane 升成 `implemented`
- 当前模板已把 Lisianthus 抽出的 `file-state-store`、`task-runner`、`task-queue`、`zotero-file-storage`、`zotero-json-state-store` 与 `window-shell + theme-manager + host action gating` 视为已入基线的 JS-core 能力；同时把 default-disabled `react surface bridge + surface-window-mode` 收到 optional bundle 基线里；`build:react-ui` 当前继续只服务默认禁用的 demo lane + host-mounted surface bridge lane，并已由主仓 / pure-project 显式声明 `esbuild + react + react-dom` 作为 optional-lane devDependencies，不把 React/TS 依赖回灌进模板核心；`wasm-kernel` 当前已冻结 checked-in probe 资产、`runtime.probeWasmKernel` / `runtime.deriveWasmKernelDigest` / `runtime.deriveWasmKernelUnlockToken` host action、registry validation contract 与 pure-project export 保留边界，且 default-disabled 态已改为首次 host action 调用时才惰性创建 Wasm runtime，但仍不伪装为已实现 bundle
- 本 wave 当前 in-scope surfaces 继续写入 `config/project-validation-surfaces.json`：覆盖 `preference pane`、`context pane`、`item pane sidenav`、`reader renderToolbar`、`reader sidebar view`、`menu item`、`collection menu` 与 `menu submenu`，当前批次只补这些已声明 surface 的 polish，不新开产品 surface
- 当前宿主可见 UI 主链已基本实现：`preference pane`、`context pane`、`item pane sidenav`、`reader renderToolbar`、`reader sidebar view`、`menu item / collection menu / menu submenu` 与窗口级 + 元素级主题 contract 已具备模板级基线、host action / surface smoke / surface-local evidence；当前批次默认转向交互一致性、贴边布局和复用细节，不把这一轮描述成“UI 已完全封板”
- `details.runtimeSanitization` 已稳定透传到 direct E2E / monitor / gate：本轮 direct E2E 记录了 `exclusiveProjectRuntime=true`，并在启动前终止了 project-managed `watch` `zotero` / `plugin-container`；旧的 startup/RDP bring-up timeout 口径继续只保留为已收口的诊断能力
- 最新 library `pre-capture settle` 继续收敛到 `visibleBannerIDs=[mac-word-plugin-install-container]`；`sync-reminder-container`、`post-upgrade-container`、`file-renaming-banner-container`、`retracted-items-container` 与 `architecture-warning-container` 会在 capture 前被压平，当前 `library / reader` 几何继续保持 `2000x1200`
- `reader` pre-capture settle 本轮已不再被 `hasMatchingWindowState=false` 卡死：当前 direct E2E 会接受 `selectedTabMatched=true` 作为 Reader ready 的等价信号，并在 settle snapshot 中显式记录 `selectedTabID / selectedTabMatched`
- `preference pane`、`context pane` 与 `menu item` 的 surface-local evidence 已在本轮重新对齐到当前语义：`preference pane` 现按 descendant content root + bounded geometry settle 取样，`context pane` baseline 已刷新到 pane fragment，`menu item`/popup 则新增 windowless screen-metrics fallback；`reader sidebar view` 在 live `rect` 缺失时也会按 `windowBounds + sidebarWidth` 合成本地 capture rect，当前 host polish 批次继续把 `item pane sidenav` 与 `reader sidebar view` 的 edge-mode geometry 和显式 degrade contract 收到同一套结果链里
- 当前 `preference pane` 的 host-polish 次批次进一步固定为“窄窗不横向溢出”：`preferences.openPane` 与相关 control actions 会在 `800x600` 宿主边界下回传 root 宽度、layout bucket 与 horizontal overflow 诊断；scenario 主断言改为 `geometry + interaction gate`，不再把 whole-window screenshot 当作 preference pane 正常的首要证据
- `READER-LOW-261` 已把 stage-scoped capture failure 结构化落进既有 E2E / validation 展示链；`READER-LOW-262` 已引入 `capture-command-failed` / `visualPrimaryBlockerKind=capture-command-failed` 并同步 consumer；`READER-LOW-263` 在本轮进一步把 visual screenshot capture 链收口到“优先按 Zotero on-screen window id 采集、避免抓到桌面或重叠窗”的状态，当前主结论已更新为“surface-local evidence fully aligned，whole-window drift 只作为 supplemental `capture-unstable` 诊断保留”
- 最新 release live acceptance 已在 `2026-04-04` 重新补齐 stable / beta 正式安装态 smoke：`release-install-smoke-beta` / `release-install-smoke-stable` 分别在 `2026-04-04T11:51:00.836Z` / `2026-04-04T11:51:01.248Z` 记录 `readinessMode=native`、`apiReady=true`，且剩余 `loading.svg` / `remote-settings.sys.mjs` 已归类为宿主噪声
- 最新 `release-preflight` / `release-plan` / `release-matrix` 已在 `2026-04-04T11:53:52.789Z` / `2026-04-04T11:54:00.719Z` / `2026-04-04T11:54:09.269Z` 刷新为 `远端验证失败 / failed`；`release-plan` 现已显式写入 `workflowState`、`gateContract` 与 `nextSteps`，并要求通过 `npm run agent:release` 记录 `release-plan` 遥测，单独的 `dist/release-plan.json` 不再视为充分 gate 证据
- 最新 `agent:monitor` / `agent:gate:release` 已在 `2026-04-04T11:54:15.771Z` / `2026-04-04T11:54:15.996Z` 消费最新 release artifacts；当前 `gatePassed=false` 的唯一原因是远端 `https://gitee.com/zouser/user/releases/download/1.1/update.json` 虽然 `updateURLHTTPStatus=200`，但未包含 `cleanroom-template@example.com` 首条更新记录，且未提供有效 `update_link`，而不是安装态 smoke 或插件运行时回归
- 当前 Gitee `updateURL` 仅用于这个模板仓库自身的远端发布验收与测试，不作为基于本模板开发的其他插件默认发布地址；下游项目仍需在各自 `config/addon.config.json` 中替换自己的 `addonId` / `homepage` / `updateURL`
- 当前中国法商业交付治理已接入 release-only 门禁：`LEGAL_RISK_CHECKLIST.md` 现新增 China Commercial Delivery Gate，`CODE_PROVENANCE.md`、`THIRD_PARTY_NOTICES.md` 与 `COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md` 已作为模板与 pure-project 导出的默认骨架；开发态 `cleanroom:audit` 继续 advisory，`release:preflight` 才会严格阻断第三方表达污染与交付权利缺口
- 当前 active 开发阻断已清零；fresh `watch -> e2e -> monitor -> gate` 证据链继续闭环通过，`HOST-HIGH-201 / HOST-LOW-301~303` 已转为已收口批次，而 release-only 工程 gap（`ENG-HIGH-104 / ENG-LOW-211~213`）与 Reader deeper event / `P1` 扩面继续只保留为当前剩余 follow-up
<!-- CURRENT-TRUTH-SUMMARY:END -->

用中文理解，当前系统已经是：

- `watch`：开发态热重载守护
- `e2e`：真机闭环验收器
- `autofix`：受控恢复执行器
- `monitor`：统一状态汇总器
- `dashboard`：可视化状态面板
- `gate`：机器裁判

所以现在不是“没有 agent 链路”，而是已经完成了“自动验证 + 自动恢复”的阶段。

截至 `2026-03-23` 的当前状态修正：

- `P2` 上下文感知记忆与趋势层深化已按代码与测试落地
- `releaseMatrix` 已进入 memory signal
- `preferredStrategy` 已按 `latestBootMode + zoteroVersionBucket` 做上下文优先推荐
- `agent:monitor` / `agent:dashboard` 已显示 `contextMatchLevel`
- 本地 stable / beta 发布矩阵真机闭环已完成，宿主噪声已完成不阻断归类
- 当前串行 Reader 自动修复型 low-task 已全部完成；`READER-HIGH-118 / READER-LOW-249~251`、`READER-HIGH-113 / READER-LOW-237~239`、`READER-HIGH-112 / READER-LOW-234~236`、`READER-HIGH-111 / READER-LOW-231~233`、`READER-HIGH-110 / READER-LOW-228~230` 与 `READER-HIGH-109 / READER-LOW-225~227` 均已归档到历史 review artifact；`READER-HIGH-114` 也已转为历史契约源
- 历史收口中，`reader event hook diagnostics` 与 `reader fine-grained hook diagnostics` 均已通过；当前 fresh 结论若再次变化，以上面的自动同步摘要块为准
- Obsidian 工作台继续沿用现有 `状态 / 模式 / 下一步指令 / 关注文件 / 备注` 字段，但当前仅作为长期人工兜底与回放界面
- `ENG-HIGH-102 / ENG-LOW-204~206` 已完成并转入历史 review artifact：watch startup health 的 bounded settle 与 truth alignment 已落地，并已把 fresh watch truth 拉回 `healthy`
- `READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125` 与 `READER-HIGH-126` 已全部转为历史契约 / review artifact；若 future fresh evidence 指向新的真实回归，再由 Codex 生成新的架构与规划批次
- 当前单一事实源统一收敛在 `docs/CURRENT_BACKLOG.md` 的“当前单一事实源”小节；Roadmap 只引用该口径，不再单独冻结另一套“下一轮 `P1 / Reader / 工程化` 批次”

## 2. 当前距离真正自主开发还差什么

### 2.1 补丁执行层已经落地，但覆盖还不够宽

当前 `autofix` 已经不只是恢复编排器，而是具备受限补丁能力的恢复编排器。

它现在已经会：

- 跑 `npm run check`
- 跑 `fresh + restart` 复验
- 单独跑 `zotero:test`
- 单独跑 `zotero:scenario`
- 依据结构化诊断命中白名单
- 生成受限 `patch plan`
- 在显式开关下应用补丁
- 写入后自动重启复验
- 归档补丁摘要、尝试记录和 `verification contract`

但它当前仍然缺：

- 更宽的白名单补丁类别
- 对不同补丁类型更细的复验合同
- 随架构演进持续维护真实补丁入口
- 更丰富的补丁失败经验沉淀

对应代码位置：

- [agent-zotero-autofix-lib.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-zotero-autofix-lib.mjs)

### 2.2 故障归因层已经打底，但还不够广

当前日志和测试已经不仅能告诉我们“哪里失败了”，还可以给出一层结构化归因。

目前已有：

- 运行时日志桥
- 原生 stdout/stderr 摘要
- E2E 周期判定
- 测试失败数、场景失败数、视觉漂移数

当前已具备：

- `issue fingerprint`
  - 故障指纹
- `feature ownership`
  - 功能归属
- `candidate files`
  - 候选修复文件
- `confidence`
  - 归因置信度

但还缺：

- 更多 feature 的细粒度归因覆盖
- 更稳定的跨轮次归因一致性
- 归因与补丁成功率之间的历史关联

如果没有这一层，agent 只能“知道坏了”，不能稳定地把问题落到 `src/features/reader.js`、`src/core/notifier.js` 这类具体位置。

### 2.3 能力清单层已经建立，但场景绑定还不够深

当前 `evaluateCycle()` 会检查一组固定能力点：

- 插件实例挂载
- API 挂载
- `runPrimaryAction`
- `runAgentAction`
- `ItemPane`
- `ItemTree`
- `Notifier`
- 测试/场景/视觉状态

这对模板基线足够，但对未来插件功能扩展还不够。

当前已经有一个明确的：

- `capability manifest`
  - 能力清单

也就是每个功能都要声明：

- 功能名
- 调用入口
- 成功信号
- 对应场景
- 关联视觉区域
- 责任文件

但仍需继续把场景、视觉点和责任文件绑定得更深，agent 才能从“模板基线验证”升级到“任意功能的自动验收”。

### 2.4 经验记忆层已从缺口转为已落地基础

当前 `monitor`、`dashboard` 与独立 `agent:memory` 工件已经形成跨多轮执行的“修复经验库”。

当前已完成：

- 某类故障最常出现在哪些文件
- 某类故障哪种恢复动作成功率最高
- 同类故障最近是否已经修过但回归了
- 某类补丁是否经常引入新的视觉漂移

后续长期可选增强：

- 更细粒度的全域信号与更长时间窗口
- 跨更多版本桶和上下文组合的历史经验
- 让后续远端发布经验也进入同一套记忆层

### 2.5 缺少更广的场景覆盖

目前真机测试基线已经可靠，但覆盖面仍偏基础：

- `zotero-tests/startup.test.js`
- `zotero-scenarios/baseline.scenario.js`

这说明当前更擅长保证“模板骨架没坏”，还不擅长保证“复杂插件功能持续可演进”。

`2026-03-22` 的进展是：当前已额外补上 `reader annotation roundtrip`，可以在真机里验证“创建批注 -> inspectReader 回读 -> 更新 -> 删除”的宿主层闭环；`reader interaction diagnostics` 现在还能读取侧栏、工具模式、导航能力和文本选择注解模式等 UI 状态快照；`reader fine-grained hook diagnostics` 也已把文本选择浮层、侧栏批注头部，以及 annotation/color/view/thumbnail/selector 上下文菜单纳入主动探针。当前剩余缺口已收敛到更深的 iframe 事件点与视觉回归。

要支持 agent 自主开发，需要把场景扩成：

- 启动/挂载
- UI 注册
- 真实条目操作
- Reader 深交互
- 偏好设置修改
- 多窗口状态同步
- 错误恢复后回归

### 2.6 缺少发布与版本矩阵闭环

目前开发态和单版本真机验证已经打通，但距离“agent 可自动推进到发布前验收”还差：

- 目标稳定版 / beta 版双矩阵验证
- 发布态正式安装回归
- 远端发布编排
- 发布后 update 路径回归

这部分不一定属于第一阶段自主开发，但属于后续必须补上的上线闭环。

## 3. 路线图总览

### P0：把“自动验证 + 自动恢复”升级为“可稳定归因”

状态：

已完成

目标：

让 agent 从“知道失败了”升级成“知道哪个功能坏了、优先看哪些文件”。

建议新增能力：

1. 故障指纹归一化
2. 功能归属映射
3. 候选文件推断
4. 结构化失败标签
5. 修复建议模板化

建议落点：

- 新增 [scripts/agent-zotero-diagnosis-lib.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-zotero-diagnosis-lib.mjs)
- 扩展 [agent-zotero-e2e-lib.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-zotero-e2e-lib.mjs)
- 扩展 [agent-zotero-validation-lib.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-zotero-validation-lib.mjs)
- 扩展 [agent-monitor.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-monitor.mjs)

建议输出字段：

- `fingerprint`
- `feature`
- `candidateFiles`
- `severity`
- `confidence`
- `recommendedActions`

完成标志：

- 同一类错误在不同轮次中能得到稳定的同类标签
- `dist/agent-zotero-e2e.json` 中出现可直接驱动修复的结构化诊断
- `agent:dashboard` 能展示“问题属于哪个功能”和“优先看哪些文件”

当前已落地：

- E2E 结果已输出 `fingerprint / feature / featureLabel / severity / confidence / candidateFiles / recommendedActions`
- `validation` 层已统一沉淀 `diagnosisBlocking / candidateFiles / recommendedActions / primaryDiagnosis / diagnoses`
- `agent:monitor` 已展示主诊断、Top 诊断和诊断建议动作
- `agent:dashboard` 已展示结构化诊断面板
- `agent:gate` 已能识别阻断级诊断，并把候选文件和诊断建议带入门禁建议

### P1：把“受控恢复”升级为“受控补丁”

状态：

进行中

目标：

让 `autofix` 不只会重试和恢复，还能在明确边界内做小范围代码修复。

建议新增能力：

1. `patch plan`
   - 补丁计划
2. `patch sandbox`
   - 受限修改范围
3. `verification contract`
   - 修复后必须复验哪些检查
4. `rollback guard`
   - 回滚保护
5. `diff summary`
   - 补丁摘要

建议落点：

- 扩展 [agent-zotero-autofix-lib.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-zotero-autofix-lib.mjs)
- 新增 [scripts/agent-zotero-patch-lib.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-zotero-patch-lib.mjs)
- 扩展 [agent-zotero-autofix.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-zotero-autofix.mjs)

第一阶段只建议允许几类低风险补丁：

- 日志与诊断增强
- 配置字段修正
- demo 注册遗漏补齐
- 明显的生命周期挂载遗漏
- 文案/本地化引用修正

暂不建议开放：

- 大范围重构
- 横跨多个 feature 的 API 改写
- 复杂 UI 重绘
- 涉及持久化 schema 迁移的改动

完成标志：

- `agent:zotero:autofix` 可在受控白名单内应用 patch
- 每次补丁都有修改摘要、影响文件、复验结果
- 若补丁无效，系统会自动停在“未恢复”而不是继续盲改

当前已落地：

- 已新增 `patch plan` 白名单层，当前已覆盖多类低风险问题：注册遗漏、启动链生命周期缺口、默认配置修正、ItemPane 本地化引用修正、Reader 命令/菜单入口修正、主命令/上下文菜单/偏好设置面板注册修正、Reader 视觉基线刷新
- `agent:zotero:autofix` 现会输出 `patchPlan`，说明是否命中白名单、允许修改范围、建议补丁动作和补丁护栏
- 命中白名单的问题现已能生成 `patch draft`，包含目标文件、锚点和可审阅 diff 草案
- 在显式开关打开时，白名单补丁草案现已可自动写入目标文件，并立即进入重启复验
- 白名单补丁入口现已对齐当前真实注册入口 `src/app/feature-composer.js`，避免旧锚点导致“计划可生成、真实项目不可写入”
- 已新增 `lifecycle:baseline-registration-missing` 诊断与对应白名单补丁，可在 `src/app/kernel.js` 中恢复 `registerBaselineFeatures()` 启动链缺口
- 已新增 `config:default-enabled-disabled` 诊断与对应白名单补丁，可在 `config/addon.config.json` 中恢复 `defaultPrefs.enabled`
- 已新增 `localization:item-pane-*-l10n-id-drift` 诊断与对应白名单补丁，可在 `src/app/feature-composer.js` 中单点恢复 ItemPane 基线 `l10nID`
- 已新增 `localization:item-pane-*-ftl-key-missing` 诊断与对应白名单补丁，可在 `addon-static/locale/*/main.ftl` 中补回缺失的 ItemPane 基线 key
- 已新增 `reader-entry:declarative-reader-mapping-drift` 诊断与对应白名单补丁，可在 `src/app/feature-composer.js` 中恢复 Reader 摘要命令、Reader View 菜单项等声明式入口注册
- 已新增 `menu-action:primary-command-missing` 诊断与对应白名单补丁，可在 `src/app/feature-composer.js` 中恢复主命令 command palette 注册
- 已新增 `menu-action:context-menu-missing` 诊断与对应白名单补丁，可在 `src/app/feature-composer.js` 中恢复主窗口上下文菜单项注册
- 已新增 `preferences:preference-pane-missing` 诊断与对应白名单补丁，可在 `src/app/feature-composer.js` 中恢复偏好设置面板注册
- 已新增 `reader-ui:reader-visual-drift` 诊断与对应白名单补丁，可在显式开关下把最新 E2E 截图受控复制回模板视觉基线
- Reader 视觉 `copy` 补丁现已不再信任报告内的目标路径，而是强制按 `bootMode + kind` 映射回 canonical 基线文件
- 白名单补丁现已支持单点替换式修正，适合配置值恢复这类低风险代码改动
- 白名单补丁现已支持受限 append，适合 `main.ftl` 这类缺失单行映射的低风险资源修正
- 白名单补丁现已支持受限 create，可在白名单 locale `main.ftl` 整体缺失时恢复模板最小基线文件
- 白名单补丁现已支持规则级 post-apply 复验策略，可针对配置修正触发 `fresh + restart` 验证
- 白名单规则现已可声明 `verification contract` 模板，按规则约束“补丁后必须观察哪些 E2E checks”
- `verification contract` 现已支持 `latest-cycle-check`、`all-cycle-check` 与报告级字段校验，可用于区分“最后一轮通过”与“所有轮次都已恢复”
- `verification contract` 现已支持“必需项 / 观察项”两级检查，便于把测试失败数、服务退化轮次等辅助信号并入合同而不误伤主结论
- `reader-ui:reader-visual-drift` 的合同现已不只检查 `visualDriftCount`，还会同时检查 `visualMissingCount` 与 `visualErrorCount`
- 本地化相关白名单补丁的核心合同现已统一切到 `all-cycle-check`，补丁复验必须覆盖所有轮次而不只看最后一轮
- 注册遗漏相关白名单补丁的核心合同现也已统一到“`all-cycle-check` + 观察项”模板，减少不同规则之间的语义偏差
- `agent:monitor` / `agent:dashboard` 已能读取并展示补丁计划摘要
- 白名单补丁在写入前现已具备 `precheck` 预检，能区分锚点缺失、锚点不唯一、目标已包含补丁片段等阻塞原因
- `precheck` 现已加入上下文窗口护栏与空白归一化片段识别，降低“误命中锚点”与“重复打补丁”风险
- `applyPatchPlan` 现已不会直接信任外部传入的 patch drafts，而会根据白名单规则重放 canonical drafts 并比对目标文件、操作与内容
- 若 patch plan 被篡改到白名单之外，或草案内容偏离规则生成结果，系统会在预检阶段以中文原因拒绝落盘
- `validation` / `monitor` / `dashboard` 现已能把补丁应用状态与预检阻塞原因用中文摘要抬升到上层看板
- `validation / monitor / dashboard` 现已同步展示补丁复验合同状态、合同摘要与失败检查数
- `autofix` 现已为每轮补丁动作写入独立归档，沉淀 `runId / patch summary / verificationContract / attempts / recommendations`，作为后续 P2 记忆层的基础输入
- `plugin.api.runAgentSelfCheck()` 与 E2E checks 现已能回传 ItemPane 本地化漂移细节，支持“观测 -> 归因 -> 单点替换 -> 复验”的闭环
- E2E runner 现已在 Node 侧检查 `addon-static/locale/*/main.ftl` 的基线 key 完整性，并保留 `file-missing / key-missing / value-drift` 细分，支持“资源缺 key -> append 补丁”与“文件缺失 -> create 补丁 -> 重启复验”的闭环
- 当前仍是“白名单 + 显式开关 + 人工可审阅”的受限补丁阶段，尚未开放任意问题的自动落盘补丁

P2 的前置底图在 `2026-03-20` 已补第一批：

- 已新增 [Agent 能力地图](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/docs/AGENT_CAPABILITIES.md)，把当前 demo/运行时能力映射到入口、场景和责任文件
- `plugin.api.agent` 已新增 `listCapabilities()` / `getCapability(id)`，可直接被 scenario、diagnosis 和后续 gate 复用
- `zotero-scenarios/` 已补齐 `preferences`、`reader-interaction`、`multi-window` 三类真实场景

### P2：把“单次修复”升级为“持续学习的开发闭环”

状态：

本轮已完成，后续转长期扩展

目标：

让 agent 对这个仓库越用越熟，而不是每次都从零开始推断。

建议新增能力：

1. `failure memory`
   - 故障记忆
2. `fix outcome memory`
   - 修复结果记忆
3. `scenario expansion`
   - 场景库扩展
4. `capability manifest`
   - 能力清单
5. `release matrix`
   - 版本矩阵验收

建议落点：

- 已新增 `dist/agent-memory/` 或 `artifacts/agent-memory/` 作为归档区
  - 当前包含 `latest.{json,md}`、`snapshots/`、`history-index.json`、`fingerprints/index.json`、`fingerprints/*.json`、`reasons/index.json`、`reasons/*.json` 与 `signals/*.json`
- 新增 `docs/AGENT_CAPABILITIES.md`
- 已扩展 [agent-monitor.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-monitor.mjs)
  - 当前会同步写入记忆归档并展示趋势摘要、历史推荐与重点指纹时间序列
- 已扩展 [agent-dashboard.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-dashboard.mjs)
  - 当前会展示近期趋势、最近样本、阻塞原因趋势、重点指纹时间序列与归档入口
- 扩展 `zotero-tests/` 与 `zotero-scenarios/`

完成标志：

- 同类故障出现时，agent 会优先给出历史最高成功率的修复路径
- 每个功能都能映射到对应测试、场景、视觉验收点、责任文件
- 发布前能看到版本矩阵下的真实通过状态

当前已落地：

- `validation / e2e / autofix` 摘要已统一抬升 `zoteroVersion`、`zoteroVersionBucket`、`latestBootMode`、`bootModes`
- `agent:memory` 已对 `preferredStrategy` 做上下文优先推荐，并区分 `exact-context`、`strategy-global`、`fingerprint-global`
- `currentIncident` 已展示上下文、上下文命中级别、上下文成功率与全局成功率
- `releaseMatrix` 已进入 `dist/agent-memory/signals/*.json`
- `failureMemory.hotFingerprints[*]` 与 `dist/agent-memory/fingerprints/*.json` 已携带 Top context 切片

后续长期可选扩展：

- 扩更细粒度的全域信号与长期时间窗口
- 扩跨更多版本桶和上下文组合的历史经验
- 让发布相关经验在后续远端编排阶段继续复用

## 4. 建议的实施顺序

### Step 1

直接按 `docs/CURRENT_BACKLOG.md` 的“当前单一事实源”维持当前稳定态，并把下一轮默认架构与规划任务源切到 `ENG-HIGH-104 / ENG-LOW-211~213`，不再把已完成的 `READER-HIGH-126` 重新写成 active。

原因：

- 启动诊断、`capture-command-failed` 与 freshest-valid artifact 选源已经独立收口，当前不需要把已完成的 library-only 回归修复重新挂回旧的工程化 / freshness 批次
- 当前主阻断已清零，真实剩余项只保留在远端发布编排、远端 `updateURL` 闭环验证、以及下一轮 Reader 更深事件点 / `P1` 扩面
- 先守住 fresh `watch -> e2e -> monitor -> gate` 证据链与文档 / manifest / tests 的单一事实源，再为未来新批次腾出清晰边界

### Step 2

继续延后远端发布编排、远端 `updateURL` 闭环、Reader 更深事件点和 `P1` 扩面；只有 fresh `watch -> e2e -> monitor -> gate` 重新证明新的真实回归类型时，才新开架构与规划批次。

### Step 3

把 `P2` 继续作为长期扩展，不和任何已完成的历史架构与规划批次混写。

## 5. 和当前脚本体系的关系

当前脚本分工不需要推翻，只需要继续分层增强：

- [zotero.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/zotero.mjs)
  - 继续负责 Zotero 宿主会话、watch、恢复
- [zotero-agent-runtime-lib.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/zotero-agent-runtime-lib.mjs)
  - 继续负责运行时桥、日志桥、动作桥
- [agent-zotero-e2e-lib.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-zotero-e2e-lib.mjs)
  - 继续负责单轮结果判定，后续叠加诊断层
- [agent-zotero-autofix-lib.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-zotero-autofix-lib.mjs)
  - 继续负责恢复与补丁编排
- [agent-monitor.mjs](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/scripts/agent-monitor.mjs)
  - 继续负责状态汇总，后续叠加记忆层与趋势层

也就是说，后续不是重写模板，而是在现有 clean-room 链路上继续加三层：

1. 诊断层
2. 补丁层
3. 记忆层

## 6. 近期建议优先做的 5 项任务

如果按投入产出比排序，我建议近期优先做这 5 项：

1. 维持 `watch -> e2e -> monitor -> gate` 的 fresh rerun 可重放，继续守住单一事实源
2. 按 `ENG-HIGH-104 / ENG-LOW-211~213` 推进远端发布编排，避免当前“本地矩阵已闭环、远端链路仍手工”的割裂
3. 在同一批内完成远端 `updateURL` 闭环验证，把发布态验收从本地延伸到真实分发链
4. 为下一轮 Reader 更深事件点补强准备更清晰的证据面与 guardrail，而不是回挂已完成的 library-only 修复
5. 用 docs consistency 与 delegation 测试守住“`READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125` 与 `READER-HIGH-126` 均已完成、当前主阻断已清零”的单一事实源

## 7. 当前阶段结论

一句话总结：

当前模板已经是“可验证、可恢复、可门禁”的 agent 开发底座，但还不是“可持续自主修复”的完整 agent 框架。

当前默认下一优先级，统一以上方自动同步摘要块为准；Roadmap 这里只保留“先减少 manifest / 正式文档 / docs consistency 口径漂移，再决定是否开启新的架构与规划批次”的方向判断。

下一阶段不该先追求让 agent 大范围改代码，而应该先把：

- 问题归因
- 功能映射
- 候选文件判断
- 受限补丁边界

这四件事做扎实。

只要这四层站稳，后面的自动补丁和长期记忆就会顺很多。
