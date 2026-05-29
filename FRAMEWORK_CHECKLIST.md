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
当前主线为 `STYLE-CUSTOM-EXTERNAL-API-OPT-IN-WORKFLOW-WAVE-001`：在用户已要求“先冻结发布”的边界内，推进 `Custom External API` default-off opt-in endpoint invocation preview prototype。本波只在 `customExternalAPI.enabled=true` 且 `customExternalAPI.endpoint` 非空的 isolated scenario / 手动验收中注册 `toolsbox-custom-external-api` Item Pane section；section 只展示本地 item metadata/request preview、endpoint host 与手动 `Run` button。只有用户点击按钮后才向配置 endpoint 发送一次 `invokeExternal` POST JSON 请求，并只渲染响应预览。当前 active expansion wave: `STYLE-CUSTOM-EXTERNAL-API-OPT-IN-WORKFLOW-WAVE-001`；验收主线: `default-off-custom-external-api-opt-in-endpoint-workflow`。

发布冻结继续有效且优先级不变：冻结未解除前禁止执行 `gh release create`、`gh release upload`、真实远端 asset mutation、`npm run release:preflight -- --verify-remote`、`npm run agent:gate:release`，也不改 git remote 或 `config/addon.config.json` 的 `updateURL`。`RELEASE-REMOTE-DISTRIBUTION-WAVE-001` 已完成安全 readiness 检查但未执行发布；上一波 `RELEASE-FREEZE-WAVE-001` 与 `STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001` 的本地 release artifacts、plan-only upload checklist、HTTP `404` readiness blocker、GitHub CLI 未登录状态和 origin / release config mismatch 只作为 retained release background；本波不继续三选一远端发布决策。

已收敛并继续保留的实现口径：`createFeatureComposer({ ..., zotero })` 支持可注入 Zotero 依赖；生产默认继续读 `globalThis.Zotero`。Style-like 直接注册项全部通过显式 pref gate 控制，`annotationColumn.enabled` 是 canonical key，`annotationDistributionColumn.enabled` 仅保留 legacy fallback。缺省未显式开启时，直接 Style prototype 不应注册，也不在偏好设置面板中表现为已可用功能。

Custom External API 当前实现口径：`customExternalAPI.enabled=false` 与 `customExternalAPI.endpoint=""` 继续是默认值，不新增 preference pane 控件。显式启用且 endpoint 非空后才注册 `toolsbox-custom-external-api` Item Pane section；`onRender` 渲染 owner-tagged loading shell，`onAsyncRender` 读取当前 item 的本地 `itemID/key/title/itemType/abstract/doi/tags` metadata 并展示 request preview。手动点击 `.toolsbox-custom-external-api-run-button` 后才调用 `custom/external-api` provider 的 `invokeExternal` capability，POST JSON 固定为 `schemaVersion: 1`、`capability: "invokeExternal"`、`consumer: "customExternalAPI"` 与 allowlisted payload；响应只渲染 status、HTTP status、response preview 与 `networkUsed=true/false`。本波不读取 PDF 全文，不发送 notes/annotations/attachment bytes，不保存 response，不写 Zotero item / note / annotation / attachment，不接 TLDR real summary，不新增 provider key 管理或偏好设置面板入口。

AI provider contract 现在扩展为当前 wave 的 runtime 基座：`noop/mock-local` 继续服务 `TLDR` no-network local preview，`summarizeItem` 仍不联网；新增 `custom/external-api` provider 只支持 `invokeExternal`，只有 `networkPolicy="allow-network"`、`customExternalAPI.enabled=true`、endpoint 非空且合法时才可调用。缺 provider、缺 endpoint、invalid endpoint、pref disabled、timeout、fetch error 都返回稳定 disabled/unavailable/error result，不 throw。

TLDR 现在降为历史 baseline：`tldrPanel.enabled=false` 继续是默认值，不新增 preference pane 控件。显式启用后才注册 `toolsbox-tldr-panel` Item Pane section；`onRender` 渲染 owner-tagged loading shell，`onAsyncRender` 读取本地 metadata 并通过 `noop/mock-local` provider 返回 unavailable/mock result。该 section 展示 request preview、metadata preview、provider status、`networkUsed=false` 与 mock summary preview；不生成真实摘要、不读取 PDF 全文、不请求 OpenAI / custom endpoint、不保存 provider key、不写 Zotero item / note / annotation / attachment。

Style Editor 现在降为历史 baseline：复用现有 `styleEditor.enabled` 与 `styleEditor.css` pref；`styleEditor.enabled=false` 时完全不注册 command / window。显式启用后注册 `toolsbox-style-editor` command，打开 ToolsBox-owned standalone window shell，编辑、Preview、Save、Reset 均围绕本地 `styleEditor.css` pref 工作。Save / Reset 只写 pref，不写文件，不写 Zotero item / note / annotation / attachment；CSS 只注入 ToolsBox-owned scoped root，不 patch Zotero host document。

Paper Matrix Enhanced 现在降为历史 baseline：`paperMatrix.enabled=false` 继续是默认值；`paper matrix enhanced local workflow` 已证明显式启用时复用既有 `toolsbox-paper-matrix` standalone window shell，展示本地只读 enhanced payload、enhanced filters、enhanced columns，并证明不修改 Zotero item / note / annotation / attachment。本波不重新打开 Paper Matrix runtime，不把增强模式升格为默认开启或偏好设置面板入口。

Attachment Version 现在降为历史 baseline：`attachmentVersion.enabled=false` 继续是默认值，不新增偏好面板可操作入口；显式启用时才注册 `toolsbox-attachment-version` Item Pane section。该 prototype 只读取本地 Zotero item / attachment metadata：选中 regular item 时列出 child attachments；选中 attachment 时列出同 parent 下的 sibling attachments 并标记当前选中项。渲染只使用 owner-tagged DOM，重复 render 清理旧节点，`cleanup()` / `destroy()` 幂等 unregister section。它不切换附件、不覆盖文件、不删除附件、不重命名附件、不创建 note、不改 annotation、不接网络/AI。`attachment version enabled preview workflow` scenario 已作为 retained evidence 证明 enabled workflow 可走。

Backlinks functional scope 已收口并保持历史 baseline：开发验收用 `zotero:scenario -- --addon-pref backlinks.enabled=true` pref 注入已证明默认 pref 未开启时 Backlinks section 不注册；显式开启时 live Item Pane local graph/list 与 `.toolsbox-backlinks-drilldown-button` 可选择来源条目，并保持 item fields 与 relations 不变。默认仍为 `backlinks.enabled=false`，不写 Zotero relation，不修改 item/note/annotation 数据，不调用网络，不接 AI。核心 helpers 保持为 `collectBacklinksForItemAsync`、`buildBacklinkGraphForItem` 与 `selectBacklinkSource`。

Merge Annotations 继续作为历史 baseline：已完成本地 annotation 合并预览、ToolsBox 自有 child note writeback/upsert workflow，以及 enabled real Zotero Item Pane button E2E 证据；默认仍为 `mergeAnnotations.enabled=false`，不修改真实 annotation。

Default-off / planned truth 更新为：`Custom External API` 已推进到 opt-in endpoint invocation preview prototype，但默认仍为 `customExternalAPI.enabled=false` 且 endpoint 默认为空，不在 preference pane 暴露为用户可操作项。`TLDR` 已推进到 local no-network Item Pane preview prototype，但真实 TLDR AI summary、provider key management、OpenAI/custom endpoint summary generation 仍是后续独立 wave。`docs/evidence/STYLE_FEATURE_MATRIX.md` 继续作为 feature matrix / evidence 索引，不替代 current truth。Backlinks semantic search / relation writeback / cross-library sync 继续排后。AI enrichment 与其它未完成能力保持 `planned/default-off`，不把缺 API key 当作本轮主阻断。

已收敛的高风险 surface truth：Collection DOM patch、Reader `_iframeWindow`、margin annotation、PDF background 等能力保持 prototype / default-off；已补 availability guard、owner-tagged DOM、幂等 cleanup / destroy 与 lifecycle cleanup。Attachment Preview（`attachmentPreview.enabled=true`）已吸收自 Toolbox/zoterostyle 的 sidePanelArgs + render hijack 侧栏 PDF 预览实现，默认启用。本波不重新打开 Collection DOM patch / Reader / margin annotation / PDF background 这些 surface，不做 host surface 大重写，不把其它 prototype 升格为默认开启或 beta 可用入口。

当前 release-only 历史线 `ENG-HIGH-104 / ENG-LOW-211~213` 已冻结在远端 readiness 之后；真实闭环仍取决于用户解冻、远端仓库 / 认证 / asset 上传确认。`ENG-HIGH-103`、`READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125`、`READER-HIGH-126`、`HOST-HIGH-201 / HOST-LOW-301~303`、`ZOTERO-HOST-POLISH-WAVE-001`、`OPTIONAL-BUNDLE-WAVE-001` 均只作为历史 contract / mirror 背景保留，不覆盖当前 no-network AI provider contract + release freeze 口径。

`P2` 上下文感知记忆与趋势层深化已完成并保留为背景；Style acceptance truth、默认关闭策略、测试链、Backlinks local prototype、Merge Annotations local preview、default-off note writeback workflow、enabled Merge Annotations writeback E2E、enabled Backlinks local graph/drilldown E2E、Backlinks full UI visual evidence 分类、Zotero 真机验收闭环、release local preflight、release freeze closure、feature matrix、default-off local Attachment Version prototype、Paper Matrix Enhanced local field/filter/sort preview、Style Editor local CSS prototype、AI provider no-network contract 与 TLDR local Item Pane no-network preview 已作为历史基线收口。历史 Style waves retained: `STYLE-PROTOTYPE-HARDENING-WAVE-001`、`STYLE-BACKLINKS-LOCAL-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-PREVIEW-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-WRITEBACK-WAVE-001`、`STYLE-MERGE-ANNOTATIONS-WRITEBACK-E2E-WAVE-001`、`STYLE-BACKLINKS-LOCAL-GRAPH-E2E-WAVE-001`、`STYLE-BACKLINKS-VISUAL-EVIDENCE-CLOSURE-WAVE-001`、`STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001`、`RELEASE-FREEZE-WAVE-001`、`STYLE-FEATURE-MATRIX-AND-ATTACHMENT-VERSION-WAVE-001`、`STYLE-ATTACHMENT-VERSION-ENABLED-E2E-WAVE-001`、`STYLE-PAPER-MATRIX-ENHANCED-LOCAL-WAVE-001`、`STYLE-EDITOR-LOCAL-CSS-PROTOTYPE-WAVE-001`、`STYLE-AI-PROVIDER-CONTRACT-NO-NETWORK-WAVE-001`、`STYLE-TLDR-LOCAL-ITEM-PANE-PROTOTYPE-WAVE-001`。本波不追 `zotero-style` 100% 复刻，只补 Custom External API default-off opt-in endpoint invocation preview prototype。
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
