# Zotero Cleanroom Template

面向独立实现的 Zotero 插件开发模板，目标是把插件源码、验证链、合规留痕和 agent 协作工具放在同一个仓库里。

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
- 当前真实完成度仍约为 `99%`；`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`、`READER-HIGH-124 / READER-LOW-261~263` 的 capture / freshness 收口、`READER-HIGH-125` 的 library-only 根因边界冻结、以及 `READER-HIGH-126` 的 library host-noise 修复继续保留为历史契约 / review artifact；`2026-04-08` fresh `watch -> e2e -> monitor -> gate` 已把当前开发态重新拉回 `stable / ready`
- `HOST-HIGH-201 / HOST-LOW-301~303` 已在 `2026-04-08T01:26:26.211Z` 的 fresh compare 模式 `agent:zotero:e2e` 与 `2026-04-08T01:29:27.786Z` 的 `agent:gate` 中收口：当前 `preference pane`、`context pane`、`item pane sidenav`、`reader renderToolbar / sidebar view`、`menu item / collection menu / dynamic submenu` 的 live geometry、surface-local evidence 与基线比对均已通过，不再作为开发态 blocker
- 当前唯一未收口主线已切到 release-only 的 `ENG-HIGH-104 / ENG-LOW-211~213`：继续沿 `release:plan -> release:upload 计划壳 -> 手动远端上传 -> release:preflight --verify-remote -> release:prepare -> release:matrix -> agent:gate:release` 推进远端发布编排与远端 `updateURL` 闭环验证，不回写插件 runtime 或 host-visible polish 主线
- 当前 active 扩展 wave 已切换为 `ZOTERO-SURFACE-WIND-TUNNEL-WAVE-001`：新增 dev-only browser wind tunnel，以普通浏览器 Web app 路线承接 Zotero scene matrix、host surface DOM mock、模块化场景切换、reference-derived generic gap visualization、Zotero Web Library browser UI adapter、Zotero PDF.js document-analysis harness、性能瓶颈注入、runtime metrics timeline 与 local browser smoke；当前场景 atlas 已扩到 `58` 个模板场景、`16` 个模块与 `17` 个 route，覆盖库与分类、条目元数据、附件与存储、检索、笔记批注、引用导出、同步协作、偏好账户、Reader、窗口 lifecycle、运行时与发布更新等 Zotero 主要产品面；该风洞只用于开发态快速具像化，不把自己升级成新的 truth source
- `ZOTERO-SURFACE-WIND-TUNNEL-WAVE-001` 的当前边界已冻结：只复刻足够测试的 `PreferencePanes / MenuManager / ItemPaneManager / Reader renderToolbar / context pane / Item Tree / Tag Selector / Tags Box` 以及模板化窗口、文档、运行时、发布更新场景语义；浏览器 UI 真实性优先通过 `--zotero-web-library-root` / `ZOTERO_WEB_LIBRARY_ROOT` 显式接入 Zotero 官方 Web Library 根目录做 collection tree / items table / item details / reader shell 锚点、官方视觉 token / density / class grammar scoped adapter、静态 icon、脱敏 fixture display-field 采样与 library surface 交互事件模拟（collection click / collection keyboard navigate / item click / shift or meta multi-select / item keyboard navigate / column sort / Item Tree column resize / item context menu / menu popupshowing rebuild / menu item click / Item Pane section switch / Tag Selector search or toggle or drag-drop / Tags Box add or remove），其中 Item Tree column resize 按本地 Zotero `VirtualizedTable` 的 `resizer -> columnWidths[dataKey] -> onResize(columnWidths, true)` 语义模拟并保留 `minWidth / fixedWidth` 边界，标签体系按本地 Zotero `TagSelectorContainer / TagSelectorList / tags-box / item.addTag / item.removeTag / tagColors` 语义模拟彩色标签、自动标签、禁用 scope、selected tag filter 与批量写回事件；本地客户端源码继续作为宿主语义权威；文档分析模块优先通过 `--zotero-pdfjs-root` / `ZOTERO_PDFJS_ROOT` 显式接入 Zotero Reader PDF.js build，提供 viewer/text-layer/viewport harness，PDF 页由 Zotero Reader bundled PDF.js 渲染，并以 1100px 级 visual-check Reader stage / iframe 视口支持浏览器视觉检查，外层 Reader chrome / menubar / renderToolbar / sidebar / context pane / 非遮挡 selection action dock 用 `reader.xhtml / reader.js / reader.css` 抽象出的 browser adapter 模拟，缺配置或缺本地 build 时显式降级为 contract fallback，不替代真机 Zotero、不接真实 AI provider、不启用 React optional lane、不提升为产品内用户功能、不自动应用任意源码 patch、不 vendoring 官方源码
- 当前该 wave 的 validation decision 固定为 `visual-recommended`：优先证明 module taxonomy、scenario matrix、coverage gap dashboard、bottleneck presets、bounded long-task / memory / DOM pressure simulation、本地 browser server 与 Node 静态测试已闭环；Codex 内置浏览器 / Chrome 视觉 smoke 只作为补证，不替代 `agent:zotero:e2e`
- 本轮 `ZOTERO-SURFACE-WIND-TUNNEL-WAVE-001` 收口限定在风洞自身工程质量：场景覆盖大库、collection tree、Item Tree column resize、saved search、tag selector、Tags Box add/remove、彩色标签、自动标签、tag drag/drop、Duplicate Items、Trash、Feeds、Item Pane metadata、notes/tags/related、bulk edit、attachments、Find Available PDF、Retrieve Metadata、file sync/WebDAV、quick/advanced search、Locate、note editor、standalone note、annotation-to-note、EPUB/snapshot Reader、Quick Copy、citation dialog、word processor、import/export translator、Connector save、sync conflict、group library、storage quota/offline、preferences account/cite/export/search/proxy、Reader / menu / preference pane / startup / mixed host action、Web Library adapter、PDF.js document-analysis harness、多窗口、watch reconnect、Wasm worker matrix、activity budget、profiler / memory diagnostics 与 release update path 的模板化切换；性能注入覆盖 long task、慢 I/O、DOM 膨胀、listener 泄漏与内存增长，并保持所有压力模拟有上限、可暂停、可 reset
- 当前 package boundary 已收紧：标准 / protected XPI 都不得携带 `build-report.json`、dev-only workbench 静态文件、`agent-runtime` / `ai-service` optional metadata、dev capability overlay 或可恢复 `ownedBy / entrypoints / successSignals`；`descriptor-bind` / `stage2-derive` 继续保留实验命令入口，但不再从 `dev/agent-runtime/capability-manifest.js` 派生可恢复 overlay
- Codex Computer Use 真机验证已作为 default-disabled optional validation lane 建立：`config/codex-computer-use-validation.json` 固定 `enabledByDefault=false`、`gateEffect=non-blocking`、`requiresExplicitUserRequest=true`，手动入口为 `npm run agent:computer-use:validate -- --user-requested --target "<目标>"`；它只生成 / 记录 `dist/agent-computer-use-validation.{json,md}`，不进入 `check`、`agent:zotero:e2e`、`agent:zotero:loop`、`agent:gate`、`agent:gate:release` 或 `agent:pipeline`
- `ZOTERO-DOM-CONTRACT-WAVE-001` 已收口完成：覆盖 `preference pane / item pane / reader` 三条既有宿主面，新增 `domContractReport` route-aware 摘要接入 `agent:zotero:e2e -> agent:monitor / dashboard / gate`，三条 route 均通过；当前保持 advisory + non-blocking，不重开旧的 host-polish blocker
- 当前 `preference pane` 窄宽度 hardening 与右侧 host-visible surface capture 链已全部对齐：以 Zotero 偏好设置宿主窗口最小尺寸 `800x600` 为 host boundary，当前接受“geometry ready + root width observed + no horizontal overflow”的稳定证据，不再把短暂的 geometry settle 超时单独抬成 blocker
- latest live rerun 现已刷新到 `2026-04-08T01:24:38.171Z` 的 `agent:zotero:e2e:update-baseline` 与 `2026-04-08T01:26:26.211Z` 的 fresh compare 模式 `agent:zotero:e2e`：本轮在确认 host-visible polish 行为链稳定后，受控刷新了一次 surface-local baseline；`restart` 与 `hot-reload` 两轮均通过，`tests/scenarios` 保持 `0` 失败，`visualEvidenceFailingItemCount` 已回到 `0`
- 当前 `visual-required` host-polish 判据已回到“blocking `surface-local` evidence 优先”：whole-window `library / reader` 漂移继续保留为 supplemental `capture-unstable` 诊断与归档样本，不再单独阻断 `HOST-HIGH-201 / HOST-LOW-301~303` 这轮 gate
- 当前插件可见文案已统一跟随 Zotero 语言：`menu item`、Reader View 菜单项、`preference pane` 与 `item pane` 基线现统一复用 `main.ftl + i18n bridge`，内置 locale 覆盖 `en-US / zh-CN / zh-TW`
- 最新 bounded foreground `zotero:watch` 已在 `2026-04-06T06:37:05.164Z` 刷新为 `healthy`：startup health 通过、`latestPassed=true`，当前不再把过期 watch 工件视为开发态主阻断
- 最新开发态 `agent:monitor` / `agent:gate` 已在 `2026-04-06T06:37:56.329Z` / `2026-04-06T06:37:56.574Z` 消费 fresh E2E + watch 工件并回到 `stable / ready`；当前 `gatePassed=true`，frontpage headline 已重新固定为“watch、真机验证与恢复回归均已通过，当前闭环状态稳定”
- 当前 dev-only 性能诊断链已分为三层：`performanceBudget` 继续作为默认 E2E advisory，latest direct E2E `2026-04-06T06:35:06.375Z` 已把 lifecycle/http 与代表性 host actions 的预算结果写入 `agent-zotero-e2e / monitor / gate`，当前预算状态为 `passed`，`preferences.openPane` 为 `1113ms / 1600ms`，活动 `4/4` 全部通过；`agent:zotero:profile` 已作为手动 CPU profiler 旁路完成并真机验证，`npm run agent:zotero:profile -- --duration-ms 50 --skip-build` 已采集 `4/4` activity profiles，输出 `dist/agent-zotero-profile.{json,md}` 并按 Current Plugin / Zotero Main / Reader / Note Editor / Other / Unknown 归因，最新 profiler compact 摘要现已接入 `agent:monitor / dashboard` advisory 展示，并通过 `agent-memory/signals/cpuProfiler.json` 归档趋势；`agent:zotero:memory` 现已补 dev-only 手动内存诊断 MVP，输出 `dist/agent-zotero-memory.{json,md}`，采集代表性 host actions 的 RSS/resident/explicit before-after delta，并通过 `agent-memory/signals/memoryDiagnostics.json` 归档趋势，且 `--include-about-memory` 现可额外导出完整 Gecko memory reporter 文本到 `dist/agent-zotero-memory-about-memory.txt`；`performanceRecommendations` 现已把三层 compact summary 汇总成自动诊断建议，在 monitor/dashboard/gate 中作为 advisory evidence 展示；`profiler extended diagnostics` 与 `memory extended diagnostics` 现已补手动扩展采样场景，覆盖批量 item selection 与 Reader sidebar view cycle。三者、建议层与扩展场景均保持 advisory + non-blocking，不进入默认 `check / agent:gate / release` 阻断链，也不向下游项目注入常驻 profiler / memory monitor 开销
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

</details>

## 快速开始

1. 编辑 `config/addon.config.json`，填写真实的 `addonName`、`addonId`、`addonRef`、`author`、`homepage`、`updateURL`。
2. 运行 `npm run verify` 和 `npm run check`，先确认配置、文档 truth 与测试基线一致。
3. 运行 `npm run build` 构建插件。
4. 运行 `npm run package` 生成 `.xpi`。
5. 在 Zotero 中通过 “Install Add-on From File” 安装 `dist/<addonRef>-<addonVersion>.xpi`。

补充说明：

- 当前仓库里的 Gitee `updateURL` 只用于这个模板项目自身的远端发布验收与测试；如果你是基于模板派生自己的插件，必须先替换 `addonId`、`homepage` 和 `updateURL`。
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

## 示例

- [基础示例插件](examples/basic-plugin/README.md)

## 许可证

UNLICENSED - 保留所有权利
