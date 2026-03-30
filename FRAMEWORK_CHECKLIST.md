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
- 当前真实完成度约为 `99%`；`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`、`READER-HIGH-124 / READER-LOW-261~263` 的 capture / freshness 收口、`READER-HIGH-125` 的 library-only 根因边界冻结、以及 `READER-HIGH-126` 的 library host-noise 修复均已完成并转为历史契约 / review artifact
- latest live rerun 已把 current truth 固定回单一事实源：最新 `watch` 工件为 `healthy`（`2026-03-30T11:34:05.136Z`），最新 direct `agent:zotero:e2e` 为 `passed`（`2026-03-30T11:31:37.694Z`，`failedStage=null`，`errorCategory=null`）
- 最新开发态 `agent:monitor` / `agent:gate` 已在 `2026-03-30T11:35:48.300Z` / `2026-03-30T11:35:48.379Z` 回到 `stable / ready`，并继续直接消费同一份 `2026-03-30T11:31:37.694Z` E2E 摘要；freshest-valid artifact 消费与 consumer 收口继续保持生效
- `details.runtimeSanitization` 已稳定透传到 direct E2E / monitor / gate：本轮 direct E2E 记录了 `exclusiveProjectRuntime=true`，并在启动前终止了 project-managed `watch` `zotero` / `plugin-container`；旧的 startup/RDP bring-up timeout 口径继续只保留为已收口的诊断能力
- 最新 library `pre-capture settle` 已稳定收敛到 `visibleBannerIDs=[mac-word-plugin-install-container]`；`sync-reminder-container`、`post-upgrade-container`、`file-renaming-banner-container`、`retracted-items-container` 与 `architecture-warning-container` 会在 capture 前被压平，library drift 已消失，`reader 视图继续对齐`，且 `library / reader` 几何一致 `2000x1200`
- `READER-LOW-261` 已把 stage-scoped capture failure 结构化落进既有 E2E / validation 展示链；`READER-LOW-262` 已引入 `capture-command-failed` / `visualPrimaryBlockerKind=capture-command-failed` 并同步 consumer；`READER-LOW-263` 已在 live rerun 上证明 freshest-valid direct artifact 消费与 truth 对齐，`visual screenshot capture` 链已恢复到稳定基线
- 最新 release live acceptance 已补齐 stable / beta 正式安装态 smoke：`release-matrix` 最新工件为 `attention`（`2026-03-30T13:58:47.934Z`），但 stable / beta profile 均已 `passed`；`release-install-smoke-stable` / `release-install-smoke-beta` 分别在 `2026-03-30T13:38:04.172Z` / `2026-03-30T13:58:21.077Z` 记录 `readinessMode=native`、`apiReady=true`，且剩余 `loading.svg` / `remote-settings.sys.mjs` 已归类为宿主噪声
- 最新 `agent:monitor` / `agent:gate:release` 已在 `2026-03-30T13:59:05.792Z` / `2026-03-30T13:59:05.867Z` 消费最新 release artifacts；当前 `gatePassed=false` 的唯一原因是 `updateURL` 仍指向 `https://example.com/downloads/cleanroomtemplate/update.json` placeholder、远端自定义发布端未配置，而不是安装态 smoke 或插件运行时回归
- 当前主阻断已清零；当前唯一 active 非阻断工程 gap 继续保持 `ENG-HIGH-104 / ENG-LOW-211~213`：只处理远端发布编排与远端 `updateURL` 闭环验证，不回头重开 Reader / startup / freshness 主线；`LEGAL_RISK_CHECKLIST.md` 的 Release Gate 继续保持 `release-only` 人工流程
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
| 委托分工脚手架 | ✅ | manifest / CLI / 审查工件已落地，`DOC-LOW-001`、`ENG-LOW-102` 已完成试点验证；`ENG-LOW-201~203`、`ENG-LOW-204~206`、`READER-LOW-201~203`、`READER-LOW-204~206`、`READER-LOW-207~209`、`READER-LOW-210~212`、`READER-LOW-213~215`、`READER-LOW-216~218`、`READER-LOW-225~227`、`READER-LOW-228~230`、`READER-LOW-231~233`、`READER-LOW-234~236`、`READER-LOW-237~239`、`READER-LOW-249~251`、`READER-LOW-252~254`、`READER-LOW-255~257`、`READER-LOW-258~260` 与 `OBSIDIAN-LOW-301~303` 已转入历史 review artifact；`READER-HIGH-126` 也已完成并转为历史契约 / review artifact；默认下一轮高逻辑任务源切到 `ENG-HIGH-104 / ENG-LOW-211~213` |
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

- `00-Zotero-Agent-项目架构与闭环.canvas`
- `01-Zotero-Agent-当前状态总览.md`
- `02-Zotero-Agent-证据索引.md`
- `03-Zotero-Agent-人工快速上手.md`
- `04-Zotero-Agent-高级介入规范.md`
- `10-Zotero-Agent-人工指令窗口.md`

可选增强层（启用 `AGENT_OBSIDIAN_VISUALS=1` 时额外生成）：

- `05-Zotero-Agent-闭环流程图.md`
- `06-Zotero-Agent-人工复核决策.excalidraw.md`

结论：

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
  - 最新 release gate 仍只因远端 `updateURL` / 自定义发布端未配置而阻断
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
