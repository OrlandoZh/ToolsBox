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
- 当前真实完成度仍约为 `99%`；`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`、`READER-HIGH-124 / READER-LOW-261~263` 的 capture / freshness 收口、`READER-HIGH-125` 的 library-only 根因边界冻结、以及 `READER-HIGH-126` 的 library host-noise 修复继续保留为历史契约 / review artifact；`2026-04-08` fresh `watch -> e2e -> monitor -> gate` 已把当前开发态重新拉回 `stable / ready`
- `HOST-HIGH-201 / HOST-LOW-301~303` 已在 `2026-04-08T01:26:26.211Z` 的 fresh compare 模式 `agent:zotero:e2e` 与 `2026-04-08T01:29:27.786Z` 的 `agent:gate` 中收口：当前 `preference pane`、`context pane`、`item pane sidenav`、`reader renderToolbar / sidebar view`、`menu item / collection menu / dynamic submenu` 的 live geometry、surface-local evidence 与基线比对均已通过，不再作为开发态 blocker
- 当前唯一未收口主线已切到 release-only 的 `ENG-HIGH-104 / ENG-LOW-211~213`：继续沿 `release:plan -> release:upload 计划壳 -> 手动远端上传 -> release:preflight --verify-remote -> release:prepare -> release:matrix -> agent:gate:release` 推进远端发布编排与远端 `updateURL` 闭环验证，不回写插件 runtime 或 host-visible polish 主线
- 当前 active 扩展 wave 已切换为 `AGENT-REVIEW-WORKBENCH-WAVE-001`：新增 dev-only `Agent Review Workbench`，以 `standalone window + plain JS/HTML` 路线承接 `scope -> route -> hostAction -> evidence -> patchPlan -> gate` 六阶段 structured snapshot、字段级批注、deterministic plan builder、验证导航与 workbench-specific acceptance telemetry；该工作台只消费 compact current-truth / evidence snapshot，不把自己升级成新的 truth source
- `AGENT-REVIEW-WORKBENCH-WAVE-001` 的 v1 边界已冻结：不接真实 AI provider、不启用 React optional lane、不提升为产品内用户功能、不自动应用任意源码 patch；若批注指向源码修复，仍只允许链接到现有白名单 patch/autofix 机制或落回 `manual-investigation`
- 当前该 wave 的 validation decision 固定为 `visual-recommended`：优先证明 command entry、window reuse/focus、close cleanup、profile-local JSON state store、annotation CRUD、deterministic plan mapping 与 diagnostics summary 已闭环；standalone window 截图只作为补证，不替代功能验收
- 本轮 `AGENT-REVIEW-WORKBENCH-WAVE-001` 收口继续限定在 workbench 自身工程质量：已把 shell manager 丢失 active window 时的 live-window reuse/focus/close/shutdown fallback、host action `observedStateSummary` allowlist 摘要、standalone shell 中文审查文案、以及 monitor/gate 中 `reviewWorkbench.windowLifecycle/snapshotProvider/annotationCrud/planBuilder` acceptance 与旧 `watch` / Reader visual blocker externalization 接入当前验收口径
- 当前 package boundary 已收紧：标准 / protected XPI 都不得携带 `build-report.json`、dev-only workbench 静态文件、`agent-runtime` / `ai-service` optional metadata、dev capability overlay 或可恢复 `ownedBy / entrypoints / successSignals`；`descriptor-bind` / `stage2-derive` 继续保留实验命令入口，但不再从 `dev/agent-runtime/capability-manifest.js` 派生可恢复 overlay
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
