# Zotero Cleanroom Template

独立重构的 Zotero 插件开发框架，专为减少衍生代码风险而设计。

## 特性

- **清洁室架构**：独立实现，避免 AGPL3.0 许可证污染
- **无外部依赖**：零运行时依赖，完全自包含
- **模块化设计**：core/features/platform 清晰分层
- **类型支持**：完整的 TypeScript 类型定义
- **生命周期管理**：阶段守卫防止重复初始化

## 当前完成度

- 当前项目已经默认接通的基线能力：`Tools 菜单入口`、`命令面板入口`、`偏好设置面板`、`官方上下文菜单基线入口`、`Zotero[instanceKey].api`
- 当前项目已经默认接通的 demo 能力：`Notifier 状态跟踪`、`窗口快捷键`、`ItemPane Section/InfoRow`、`ItemTree 自定义列`、`ProgressWindow Toast`、`Reader 菜单与活动上下文摘要示例`
- 当前项目已经接通的真机场景能力：`真实条目创建/选择`、`真实条目修改触发 Notifier`、`真实 PDF 附件导入与 Reader 打开`、`Reader 交互摘要/交互快照`、`Reader 批注回环`、`Reader UI 状态快照`、`Reader 事件桥`、`Reader 细粒度浮层/上下文菜单探针`、`设置治理诊断`、`多窗口挂载验证`、`无阻塞 agent 动作执行`
- 当前项目已经具备但默认未演示的能力：`HTTP`
- 当前模板现已补齐 `bootstrap` 能力白名单报告：会记录实际注入/跳过的宿主与 Web API，并通过 `api.runtime.getCapabilitySummary()` / `getCapabilityReport()` 暴露给开发者与 agent
- 当前模板现已内置 `resource-loader` 骨架：提供 `init/dispose/status` 幂等约定，便于后续接入 `WASM`、索引或本地推理等重资源模块
- 当前模板现已提供结构化 agent 能力地图：可通过 `plugin.api.agent.listCapabilities()` / `getCapability(id)` 读取，文档见 [Agent 能力地图](docs/AGENT_CAPABILITIES.md)
- 已在 `2026-03-19` 针对 `Zotero 8.0.2-beta.5+c35d7f21e` 验证 `zotero:smoke`、`zotero:test`、`zotero:scenario`、`zotero:console`、`zotero:watch`、`agent:zotero:e2e`、`agent:zotero:e2e:update-baseline`、`agent:zotero:autofix`
- 已在 `2026-03-20` 额外验证 `agent:zotero:watch-recovery`：可真机触发 `watch-change 失败 -> runtime-recovery 失败 -> session-restart-recovery 成功` 的受控恢复链
- 已在 `2026-03-22` 追加验证 `agent:zotero:e2e`：`11` 个需场景覆盖能力全部通过，其中新增确认 `Reader 批注回环`、`Reader UI 状态`、`Reader 事件桥`
- 已在 `2026-03-23` 补齐 `Reader 事件桥` 的三类低风险受控补丁链：当前已可识别并修复 `reader-entry:declarative-reader-mapping-drift`、`reader-event:toolbar-bridge-registration-drift`、`reader-event:fine-grained-hook-declaration-drift`，legacy alias 仅保留输入兼容
- 已在 `2026-03-30` 重新验证本地发布矩阵链：当前可生成 `release-matrix.json` / `release-matrix.md`，并把 stable/beta 渠道状态接入 `agent:monitor`、`agent:dashboard` 与 `agent:gate:release`
- 已在 `2026-03-30` 跑通 stable / beta 正式安装态 smoke 真机回归：两个渠道都已确认正式安装成功、`readinessMode === native`、`apiReady === true`
- 已在 `2026-03-30` 确认发布态剩余唯一缺口是远端 Gitee `update.json` 内容未达标：stable/beta 本地 smoke 已通过，但 `release-matrix` / `agent:gate:release` 仍会因远端 `update.json` 缺少 `cleanroom-template@example.com` 更新记录而阻断
- 已在 `2026-03-23` 完成本地发布矩阵阻断收口：`remote-settings.sys.mjs` 与 `loading.svg` 已归类为宿主噪声不再阻断；真实插件阻断 `menus[0]["l10nID"] must be string` 已修复
- 已在 `2026-03-23` 完成 `P2` 上下文感知记忆/趋势层深化：`agent:memory` 现已沉淀 `zoteroVersionBucket / latestBootMode / releaseMatrix` 信号，`preferredStrategy` 会按上下文优先推荐，`agent:monitor` / `agent:dashboard` 已显示 `contextMatchLevel` 与上下文成功率
- 当前 `autofix` 白名单已额外覆盖一类偏好设置静态资源故障：当 `addon-static/content/preferences.xhtml` 缺失或日志明确指向其加载失败时，可生成受控恢复草案
- 当前 `autofix` 白名单已额外覆盖一类运行时样式静态资源故障：当 `addon-static/content/style/main.css` 缺失且日志明确指向其加载失败时，可生成受控恢复草案
- 当前 `autofix` 白名单已额外覆盖一类 bootstrap 静态基线故障：当 `addon-static/bootstrap.js` 缺失时，可生成受控恢复草案
- 当前 `autofix` 白名单已额外覆盖一类 icon 静态资源故障：当 `config.icons` 声明的模板基线 icon 缺失时，可生成受控恢复草案
- 当前 `autofix` 白名单也已覆盖第一类静态运行时基线漂移：当 `bootstrap.js`、`preferences.xhtml`、`main.css` 存在但与 clean-room baseline 发生低风险片段漂移时，可在显式开关下受控回写基线
- `verify` 当前也会前置检查模板静态基线文件：`bootstrap.js`、`preferences.xhtml`、`main.css` 与三套 `main.ftl` locale 文件缺失都会在本地检查阶段直接报错
- `agent:zotero:e2e` 当前也会在 Node 侧对 `bootstrap.js`、`preferences.xhtml`、`main.css` 与 `config.icons` 声明的 icon 文件做静态基线体检，缺失时直接写入结构化 checks
- 当前 `bootstrap.js` 缺失已可被单独诊断为 `bootstrap:bootstrap-file-missing`，而不是继续混在笼统的“插件未挂载”里
- 当前 `bootstrap.js`、`preferences.xhtml`、`main.css` 的静态基线漂移已可被单独诊断为 drift 类问题，并在相关症状存在时接到白名单修复链
- 当前 `icon` 缺失现已接入 `assets:icon-resource-missing -> clean-room baseline copy` 恢复链，并受源文件 hash 守卫保护
- 已在 `2026-03-22` 补齐 `reader fine-grained hook diagnostics`：当前已可主动验证 `renderTextSelectionPopup`、`renderSidebarAnnotationHeader`，以及 `annotation/color/view/thumbnail/selector` 五类 Reader 上下文菜单注入点
- 与 Zotero 官方模板的真实差距和修复路线见 [Reference 对比](docs/REFERENCE_COMPARISON.md)；如需在本地复核对照材料，见 [本地 Reference 快照说明](docs/REFERENCE_SNAPSHOTS.md)
- 面向下一阶段 agent 自主开发的增量路线见 [Agent 自主开发路线图](docs/AGENT_AUTONOMY_ROADMAP.md)

当前结论：

- 项目已经可以进入 `clean-room runner` 控制下的 Zotero 真机测试阶段
- runner 现在使用 `proxy install + native lifecycle probe + chrome bootstrap fallback` 提升开发/测试链路稳健性
- runner 现在会在 Zotero chrome 侧同步等待异步求值完成，避免 Firefox RDP 返回 `Promise<pending>` 造成 agent 误判
- `agent:zotero:e2e` 现在已接通窗口级视觉基线回归：支持 `restart/hot-reload` 两套截图基线、像素漂移阈值判定与基线刷新
- 白名单补丁现已扩到第一类 Reader 与注册入口低风险问题：可受控恢复 `Reader 摘要命令`、`Reader View 菜单项`、`主命令 command palette`、`主窗口上下文菜单项`、`偏好设置面板注册`，并在显式开关下把最新 E2E 截图写回模板视觉基线
- Reader 事件桥现在已采用声明式基线：`src/features/reader.js` 固化了 `known types / probe-compatible types / synthetic fallback types`，对应三条白名单补丁规则和 `replace-block` sandbox 护栏
- 已在 `2026-03-18` 通过干净 profile 验证：发布态 `.xpi` 经 Zotero “Install Add-on From File” 安装后，会自动进入原生 bootstrap 生命周期，并挂出 `Zotero.CleanroomTemplate.api`
- 本地发布链现已补齐 stable/beta 矩阵工件和正式安装态 smoke 入口：`npm run release:matrix`、`npm run release:install-smoke:stable`、`npm run release:install-smoke:beta`
- `release-install-smoke` 现会在重新打包后同步刷新 `release-preflight`，避免 `release-matrix` 被过期 SHA / size 误伤
- 默认 demo 现已接通到启动链路，并通过 `zotero:test` 在 Zotero 原生管理器内验证基线挂载
- 默认 scenario 现已升级为真实数据路径，并扩展到 `11` 条真机场景覆盖
- 插件运行时现已把 `bootstrap` 能力注入状态并入 `Runtime Bridge` 服务健康与 agent 自检，便于发现宿主桥接缺口

## 快速开始

1. 编辑 `config/addon.config.json` 配置插件信息，尤其要填写真实的 `updateURL`
2. 运行 `npm run verify` 验证配置
3. 运行 `npm run build` 构建插件
4. 运行 `npm run package` 生成 `.xpi` 发布包
5. 在 Zotero 中通过 “Install Add-on From File” 安装 `dist/<addonRef>-<addonVersion>.xpi`

注意：

- 当前仓库里的 Gitee `updateURL` 只用于这个模板项目自身的远端发布验收与测试；如果你是基于模板派生自己的插件，必须先替换 `addonId`、`homepage` 和 `updateURL`
- 在 Zotero 8 验证中，直接把 `.xpi` 丢到 `profile/extensions/` 不会被视为可靠安装路径
- 当前 clean-room runner 采用 `profile/extensions/<addonId>` proxy file 加载 `build/<addonRef>`，并在 native 生命周期与 `Zotero.Plugins.init()` 都未挂出实例时，通过 chrome debugger 补一次 bootstrap 兜底
- 发布态 `.xpi` 已验证可通过 Zotero 正式安装入口自动启动；正式发布前仍建议对目标 Zotero 版本再跑一遍本地安装回归

## 仓库边界

- 主仓默认跟踪源码、配置、测试、文档与模板静态资源
- `build/`、`dist/`、`.zotero-runtime/`、`obsidian/agent-workbench/` 视为可再生工件，不作为源码事实来源；它们已被 `.gitignore` 忽略，不会在正常 `git add` / `git push` 中污染源码上传
- 如果要交付纯源码或纯模板工程，不要直接压缩整个工作目录；使用 `npm run export:project` 生成剔除运行时工件与 agent 附件的最小工程
- reference 材料仅作为可选本地研究输入，不进入主历史；如需本地复核，见 [本地 Reference 快照说明](docs/REFERENCE_SNAPSHOTS.md)

## 架构

```
src/
├── core/              # 核心工具模块
│   ├── logger.js      # 日志系统（带级别过滤）
│   ├── prefs.js       # 偏好设置存储
│   ├── lifecycle.js   # 生命周期管理
│   ├── i18n.js        # 国际化（支持变量插值）
│   ├── ui-factory.js  # UI 元素工厂
│   ├── notifier.js    # 事件通知管理器
│   ├── keyboard.js    # 键盘快捷键管理
│   └── http.js        # 网络请求工具
├── features/          # 功能模块
│   ├── window-manager.js   # 窗口生命周期
│   ├── menu-command.js     # 菜单命令
│   ├── menu-manager.js     # 完整菜单系统
│   ├── item-pane.js        # ItemPane Section/InfoRow
│   ├── item-tree.js        # ItemTree 自定义列
│   ├── prompt.js           # 命令面板集成
│   ├── reader.js           # 阅读器工具
│   └── preference-panes.js # 偏好设置面板
├── utils/             # 工具模块
│   ├── dialog.js          # 对话框构建器
│   └── progress-window.js # 进度窗口/Toast
├── platform/          # 平台适配层
│   └── zotero-host.js # Zotero API 适配器
├── services/          # 服务层
│   ├── registry.js    # 服务注册表
│   └── resource-loader.js # 重资源加载器骨架
└── app/               # 应用层
    ├── plugin.js      # 插件组合根
    ├── runtime-capabilities.js # bootstrap 能力报告归一化
    └── runtime-config.js # 运行时配置
```

## 模块列表

### Core 模块

| 模块 | 功能 | 文件 |
|------|------|------|
| **Logger** | 结构化日志，支持 debug/info/warn/error 级别 | `src/core/logger.js` |
| **Prefs** | 偏好设置存储，带观察者模式 | `src/core/prefs.js` |
| **Lifecycle** | 资源清理追踪管理 | `src/core/lifecycle.js` |
| **I18n** | 国际化，支持变量插值 | `src/core/i18n.js` |
| **UI Factory** | 统一的 UI 元素创建接口 | `src/core/ui-factory.js` |
| **Notifier** | Zotero 事件通知管理 | `src/core/notifier.js` |
| **Keyboard** | 键盘快捷键管理 | `src/core/keyboard.js` |
| **HTTP** | 网络请求工具 | `src/core/http.js` |

### Features 模块

| 模块 | 功能 | 文件 |
|------|------|------|
| **Window Manager** | 窗口生命周期管理 | `src/features/window-manager.js` |
| **Menu Command** | 基础菜单命令 | `src/features/menu-command.js` |
| **Menu Manager** | 完整菜单系统（使用官方 API） | `src/features/menu-manager.js` |
| **Item Pane** | ItemPane Section/InfoRow 注册 | `src/features/item-pane.js` |
| **Item Tree** | ItemTree 自定义列 | `src/features/item-tree.js` |
| **Prompt** | 命令面板集成 | `src/features/prompt.js` |
| **Reader** | PDF/EPUB/Snapshot 阅读器工具 | `src/features/reader.js` |
| **Preference Panes** | 偏好设置面板注册 | `src/features/preference-panes.js` |

### Utils 模块

| 模块 | 功能 | 文件 |
|------|------|------|
| **Dialog** | 对话框构建器（alert/confirm/prompt） | `src/utils/dialog.js` |
| **Progress Window** | 进度窗口和 Toast 通知 | `src/utils/progress-window.js` |

## 运行时逻辑

- **阶段守卫**：`idle` → `starting` → `running` → `stopping` 防止重复初始化
- **窗口加载**：启动时加载现有主窗口，不仅依赖 `onMainWindowLoad` 事件
- **偏好监听**：
  - `enabled` 和 `menuLabel` 触发窗口重新挂载
  - `logLevel` 动态更新日志级别

## 构建流程

```bash
npm run verify   # 验证必需文件
npm run lint     # 语法与 JSON 校验（clean-room 轻量 lint）
npm run format:check  # 空白格式校验（tab/尾随空格/末尾换行）
npm run typecheck     # 运行时 API 与 d.ts 声明漂移检查
npm run cleanroom:audit # 开发态 clean-room 门禁与审计工件输出
npm run cleanroom:sim   # 可选：对本地 reference 快照运行相似度扫描
npm run docs:sync-current-truth # 同步正式文档中的当前 truth 摘要块
npm run check    # lint + format + typecheck + verify + cleanroom:audit + test
npm run build    # 构建：生成 manifest/prefs/bootstrap，打包源码
npm run package  # 打包：创建 .xpi 发布包
npm run release:metadata # 生成 dist/update.json 与 release-manifest.json
npm run release:preflight # 校验发布产物一致性 + 发布态 clean-room 门禁，并生成 release-preflight.json
npm run release:local # 本地完整发布门禁（package + release:preflight）
npm run release:prepare # 生成 dist/release-plan.json 与 dist/release-notes.md
npm run release:upload -- --provider gitee-release --release-tag 1.1 --target-base-url https://example.com/releases/1.1/ # 仅校验上传契约并生成 dist/release-upload-plan.json / md，不执行真实上传
npm run release:matrix # 生成 dist/release-matrix.json / md
npm run release:install-smoke:stable # 运行稳定版正式安装态 smoke，并写入 release-install-smoke.json
npm run release:install-smoke:beta # 运行 beta 正式安装态 smoke，并写入 release-install-smoke.json
npm run release:plan # 本地发布门禁 + 发布说明/上传计划 + 本地发布矩阵一键生成
npm run export:project # 导出剔除 agent/runner/reference 的纯项目包
npm run agent:check # 以 agent runner 执行 check，并记录 dist/agent-runs 遥测
npm run agent:memory # 生成故障记忆 / 修复结果记忆摘要
npm run agent:release # 以 agent runner 执行 release:plan，并记录遥测
npm run agent:monitor # 生成 agent 汇总（按任务分组、失败原因、最近执行）
npm run agent:dashboard # 基于 monitor 数据生成 dist/agent-dashboard.html
npm run agent:obsidian # 生成 Obsidian 人工介入文档与白板
# AGENT_OBSIDIAN_VISUALS=1 npm run agent:obsidian # 额外生成 Mermaid / Excalidraw companion 视图
npm run agent:gate # 基于 monitor 数据执行开发档位质量闸门，并生成 gate 报告
npm run agent:gate:release # 以发布档位执行更严格的质量闸门
npm run agent:report # 一键执行 agent:check + agent:dashboard
npm run agent:pipeline # 一键执行 check + release + dashboard + release 闸门
npm run agent:zotero:e2e # 自动打开 Zotero，执行热重载闭环校验并输出报告
npm run agent:zotero:e2e:restart # 自动打开 Zotero，按“重启重载”策略执行闭环校验
npm run agent:zotero:e2e:update-baseline # 刷新库视图/Reader 的视觉基线截图
npm run agent:zotero:loop # 按当前工件状态编排 watch/e2e/autofix/gate 单回合闭环
npm run agent:zotero:loop:human # 打开 60 秒人工介入窗口，不介入则自动继续
npm run agent:zotero:watch-recovery # 真机回归 watch 异常恢复链并输出恢复报告
npm run agent:zotero:autofix # E2E 失败时自动执行受控恢复动作并二次复验
npm run test     # 运行单元测试
npm run sim      # 兼容别名，等同于 cleanroom:sim
npm run zotero:smoke   # 在隔离 Zotero 中做真实 smoke test，必要时走 fallback 兜底
npm run zotero:dev     # 启动隔离 Zotero，并用 proxy + native probe + fallback 加载当前插件
npm run zotero:watch   # 热重载、失败自动恢复并输出 dist/zotero-watch-status.{json,md}
npm run zotero:console # 启动隔离 Zotero，并拉起内置 Browser Toolbox
npm run zotero:test    # 在 Zotero 内执行 zotero-tests/*.test.js
npm run zotero:scenario # 在 Zotero 内执行 zotero-scenarios/*.scenario.js
```

## Zotero 真机测试

1. 复制 `.env.example` 为 `.env.local`
2. 配置 `ZOTERO_PLUGIN_ZOTERO_BIN_PATH`
3. 运行 `npm run zotero:smoke`、`npm run zotero:watch` 或 `npm run zotero:console`

更多说明见 [Zotero 测试与调试](docs/ZOTERO_TESTING.md)。

## 新 Agent 接手顺序

1. 先读 [当前剩余任务清单](docs/CURRENT_BACKLOG.md) 的“当前单一事实源”，不要直接根据旧 `dist/` 工件或 README 历史段落判断当前主线
2. 先运行 `npm run check`，确认源码、配置、文档 truth 与 clean-room 门禁都处于一致状态
3. 如果 `config/addon.config.json` 仍是模板默认值，例如 `cleanroom-template@example.com`、`Your Team`、模板仓库 `homepage` 或模板专用 `updateURL`，先暂停开发并询问用户初始化信息：`addonName`、`addonId`、`addonRef`、`author`、`homepage`、`updateURL`，同时确认是保留完整 agent 工程链还是导出纯项目
4. 如果改动会影响宿主运行时、场景或 UI，优先执行 `npm run agent:zotero:e2e`；需要连续迭代热重载时再使用 `npm run zotero:watch`
5. 每轮改动后重建 `npm run agent:monitor` 与 `npm run agent:gate`，以 monitor / gate 结论而不是单条命令输出来判断是否可以继续推进
6. 只有在当前任务明确属于发布链时，才进入 `npm run release:plan -> npm run release:upload -- --provider <provider> --release-tag <tag> --target-base-url <url> -> 手动上传远端产物 -> npm run release:preflight -- --verify-remote -> npm run release:prepare -> npm run release:matrix -> npm run agent:gate:release`
7. 如果目标是交付纯源码，而不是把本地工件一起带走，使用 `npm run export:project`

## Codex / Opencode 分工脚手架

当前仓库已落地一套 Codex / Opencode 委托分工脚手架，用于区分高逻辑任务与低逻辑任务的执行与审查：

### 任务分类

- **Codex 高逻辑 lane** (`codex-high-logic`)：负责冻结契约、修改 patch 语义、扩大白名单边界等高风险改动
- **Opencode 低逻辑 lane** (`opencode-low-logic`)：负责文档同步、测试补齐、展示收口等受限改动

### 核心文件

| 文件 | 功能 |
|------|------|
| `config/agent-delegation-tasks.json` | 任务清单 manifest，定义 taskId、lane、scopePaths、依赖关系和审查清单 |
| `scripts/agent-delegation.mjs` | 委托执行 CLI，提供 `list` / `run` / `review` / `close` 命令 |
| `scripts/agent-delegation-lib.mjs` | 委托核心库，负责 manifest 加载、prompt 构建、快照比对和审查判定 |
| `scripts/agent-git-closure-lib.mjs` | 本地 Git 收口库，负责按 task scope 生成中文 commit message、筛选文件并执行本地 commit |
| `tests/agent-delegation.test.js` | 委托功能测试，覆盖 manifest 加载、scope 重叠检测和审查逻辑 |

### 执行流程

1. **list**：列出 manifest 中的所有任务及其 scope
2. **run**：执行指定任务，调用 `mco` 启动 Opencode worker，并生成工件
3. **review**：执行聚焦测试、比对改动范围，输出审查结论
4. **close**：按 task scope 选取当前本地改动，执行聚焦测试，并以中文 commit message 做本地 Git 收口（默认不 push）

### 运行命令

```bash
# 列出所有委托任务
node scripts/agent-delegation.mjs list

# 执行指定任务
node scripts/agent-delegation.mjs run <taskId>

# 审查任务结果
node scripts/agent-delegation.mjs review <taskId> --reviewer codex

# 对单个模块里程碑做本地 Git 收口（先预演）
node scripts/agent-delegation.mjs close <taskId> --dry-run

# 确认后执行本地 commit，可按需覆盖中文提交信息
node scripts/agent-delegation.mjs close <taskId>
node scripts/agent-delegation.mjs close <taskId> --message "feat: 基本实现 xxx 模块能力"
```

### 审查工件

每次委托执行后，在 `dist/agent-delegation/<taskId>/` 下生成以下工件：

| 文件 | 内容 |
|------|------|
| `task.json` | 任务定义快照 |
| `invocation.json` | 执行命令与 prompt |
| `before-snapshot.json` | 执行前文件快照 |
| `after-snapshot.json` | 执行后文件快照 |
| `run.json` | 执行记录（exitCode、耗时、改动文件） |
| `provider-result.json` | Opencode 返回结果 |
| `provider-stdout.txt` | 标准输出日志 |
| `provider-stderr.txt` | 标准错误日志 |
| `review.json` | 审查结论 |
| `review.md` | 审查报告（人类可读） |
| `git-closure.json` | 本地 Git 收口记录（commit message、纳入文件、聚焦测试、commit SHA） |
| `git-closure.md` | 本地 Git 收口摘要（人类可读） |

### 审查状态

| 状态 | 含义 |
|------|------|
| `accepted` | 改动在 scope 内且聚焦测试通过 |
| `reworked-by-codex` | Opencode 已启动或产出部分结果，但最终由 Codex 接手收口并补齐审查 |
| `needs-fix` | 聚焦测试失败，需要修复 |
| `rejected` | 存在越界改动 |

### 已完成委托任务

- `DOC-LOW-001`（文档同步任务）已于 `2026-03-23` 被 Codex 审查为 `accepted`
- 审查工件见 `dist/agent-delegation/DOC-LOW-001/review.json`
- `ENG-LOW-102`（真实剩余主线与 delegation 状态文档同步）已于 `2026-03-23` 被 Codex 审查为 `accepted`
- 审查工件见 `dist/agent-delegation/ENG-LOW-102/review.json`
- 当前 manifest 已按 `2026-03-30` 的最新工作树完成 rebaseline：`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`、`READER-HIGH-124 / READER-LOW-261~263` 的 capture failure 结构化 / `capture-command-failed` blocker / freshest-valid artifact 消费、`READER-HIGH-125` 的 library-only 根因边界冻结，以及 `READER-HIGH-126` 的 library host-noise 修复均已完成独立收口并转为历史契约 / review artifact；当前不再保留 active 的 library-only 高逻辑回归修复批次
- `ENG-LOW-201`、`ENG-LOW-202`、`ENG-LOW-203` 已于 `2026-03-24` 以 `reworked-by-codex` 方式收口，并转入历史 review artifact
- `READER-LOW-201`、`READER-LOW-202`、`READER-LOW-203` 已于 `2026-03-24` 收口并转入历史 review artifact，不再作为 active low-task
- `READER-HIGH-102` 与 `READER-LOW-204`、`READER-LOW-205`、`READER-LOW-206` 已于 `2026-03-24` 收口并转入历史 review artifact，不再作为当前 active batch
- `READER-HIGH-103` 与 `READER-LOW-207`、`READER-LOW-208`、`READER-LOW-209` 已于 `2026-03-24` 收口并转入历史 review artifact，不再作为当前 active batch
- `READER-HIGH-104` 与 `READER-LOW-210`、`READER-LOW-211`、`READER-LOW-212` 已于 `2026-03-25` 收口并转入历史 review artifact，不再作为当前 active batch
- `2026-03-24` 新鲜 `watch -> e2e -> monitor -> gate` 已确认：`watch` 为 healthy；`reader event hook diagnostics` 已通过，`reader fine-grained hook diagnostics` 已通过，`agent:zotero:e2e` / `agent:gate` 当前主阻断为 `reader-ui:reader-visual-drift`
- `READER-HIGH-105` 与 `READER-LOW-213`、`READER-LOW-214`、`READER-LOW-215` 已于 `2026-03-25` 收口并转入历史 review artifact，不再作为当前 active batch
- `READER-LOW-216`、`READER-LOW-217`、`READER-LOW-218` 已都有 review artifact，并已转入历史 review artifact，不再作为当前 active low-task
- `OBSIDIAN-LOW-301`、`OBSIDIAN-LOW-302`、`OBSIDIAN-LOW-303` 已于 `2026-03-25` 以 `reworked-by-codex` 收口，并转入历史 review artifact，不再作为当前 active low-task
- `READER-HIGH-123` 已按唯一分支收口：人工窗口写入 `预期 UI 变化 -> ready / force-next / npm run agent:zotero:e2e:update-baseline` 后，仅执行了一次受控 baseline refresh；随后 `restart-library.png`、`restart-reader.png`、`hot-reload-library.png`、`hot-reload-reader.png` 均已对齐到 `2000x1200`
- `READER-HIGH-119 / READER-LOW-252~254` 已完成并转入历史契约 / review artifact：capture attempt diagnosis 解释层已接入 validation / e2e / monitor / gate / dashboard / loop / obsidian
- `READER-HIGH-120 / READER-LOW-255~257` 已完成并转入历史契约 / review artifact：refresh-first 与单分支选择语义只保留为历史工件
- `READER-HIGH-121 / READER-LOW-258~260` 已完成并转入历史契约 / review artifact：reader stage 的最小 prepare/open/settle 收紧与 gate headline 对齐已落地，并把 fresh truth 拉回 `ui-regression-candidate + complete`
- `ENG-HIGH-102 / ENG-LOW-204~206` 已完成并转入历史契约 / review artifact：watch startup health 的 bounded settle 与 truth alignment 已落地，并把 fresh watch truth 拉回 `healthy`
- Obsidian visual enhancement 已完成并转入历史契约 / review artifact：当前默认工作台继续保持 Markdown + Canvas + 人工指令窗口，`OBSIDIAN-HIGH-101` 只保留为历史高逻辑契约源，不再挂新的 active low-task
- `AGENT_OBSIDIAN_VISUALS=1` 作为可选增强层启用：在现有 Markdown 状态页、证据页、Quickstart、Advanced Guide、人工指令窗口、`.canvas` 白板之外，额外生成 `05-Zotero-Agent-闭环流程图.md` 与 `06-Zotero-Agent-人工复核决策.excalidraw.md`
- 当前约束固定为：`watch stale` 先于 Reader 症状引导下一步动作；`agent:zotero:e2e` / `agent:gate` 的 `exitCode=2` 继续视为“验证失败但工件有效”
- 当前约束固定为：`READER-HIGH-123` 已按单分支收口完成，不重复第二次 baseline refresh；`READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125` 与 `READER-HIGH-126` 也都已完成独立收口，后续如 future fresh evidence 再次出现新的真实回归，再单开新的高逻辑批次
- 默认下一轮高逻辑任务源切到 `ENG-HIGH-104 / ENG-LOW-211~213`：只沿现有 `release:plan` / `agent:release` / `agent:gate:release` 链推进远端发布编排与远端 `updateURL` 闭环验证，不改插件 runtime，不回头混写 Reader / startup / freshness
- 当前约束固定为：Obsidian 工作台继续保留三模板人工 verdict 机制，但当前默认主路径是否重新进入 `npm run agent:obsidian`，统一以 fresh `watch -> e2e -> monitor -> gate` 为准
- 当前“完成度 / 当前主线 / 当前剩余项”只认 [docs/CURRENT_BACKLOG.md](docs/CURRENT_BACKLOG.md) 的“当前单一事实源”；README 只保留下面这块自动同步摘要，不再手写第二套 current truth。

<!-- CURRENT-TRUTH-SUMMARY:START -->
- 当前真实完成度约为 `99%`；`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`、`READER-HIGH-124 / READER-LOW-261~263` 的 capture / freshness 收口、`READER-HIGH-125` 的 library-only 根因边界冻结、以及 `READER-HIGH-126` 的 library host-noise 修复均已完成并转为历史契约 / review artifact
- latest live rerun 已把 current truth 固定回单一事实源：最新 `watch` 工件为 `healthy`（`2026-03-30T11:34:05.136Z`），最新 direct `agent:zotero:e2e` 为 `passed`（`2026-03-30T11:31:37.694Z`，`failedStage=null`，`errorCategory=null`）
- 最新开发态 `agent:monitor` / `agent:gate` 已在 `2026-03-30T11:35:48.300Z` / `2026-03-30T11:35:48.379Z` 回到 `stable / ready`，并继续直接消费同一份 `2026-03-30T11:31:37.694Z` E2E 摘要；freshest-valid artifact 消费与 consumer 收口继续保持生效
- `details.runtimeSanitization` 已稳定透传到 direct E2E / monitor / gate：本轮 direct E2E 记录了 `exclusiveProjectRuntime=true`，并在启动前终止了 project-managed `watch` `zotero` / `plugin-container`；旧的 startup/RDP bring-up timeout 口径继续只保留为已收口的诊断能力
- 最新 library `pre-capture settle` 已稳定收敛到 `visibleBannerIDs=[mac-word-plugin-install-container]`；`sync-reminder-container`、`post-upgrade-container`、`file-renaming-banner-container`、`retracted-items-container` 与 `architecture-warning-container` 会在 capture 前被压平，library drift 已消失，`reader 视图继续对齐`，且 `library / reader` 几何一致 `2000x1200`
- `READER-LOW-261` 已把 stage-scoped capture failure 结构化落进既有 E2E / validation 展示链；`READER-LOW-262` 已引入 `capture-command-failed` / `visualPrimaryBlockerKind=capture-command-failed` 并同步 consumer；`READER-LOW-263` 已在 live rerun 上证明 freshest-valid direct artifact 消费与 truth 对齐，`visual screenshot capture` 链已恢复到稳定基线
- 最新 release live acceptance 已按当前 Gitee `updateURL` 重新补齐 stable / beta 正式安装态 smoke：`release-matrix` 最新工件为 `failed`（`2026-03-30T16:19:38.678Z`），但 stable / beta profile 均已 `passed`；`release-install-smoke-stable` / `release-install-smoke-beta` 分别在 `2026-03-30T16:19:09.880Z` / `2026-03-30T16:18:42.172Z` 记录 `readinessMode=native`、`apiReady=true`，且剩余 `loading.svg` / `remote-settings.sys.mjs` 已归类为宿主噪声
- 最新 `agent:monitor` / `agent:gate:release` 已在 `2026-03-30T16:19:52.692Z` / `2026-03-30T16:19:52.762Z` 消费最新 release artifacts；当前 `gatePassed=false` 的唯一原因是远端 `https://gitee.com/zouser/user/releases/download/1.1/update.json` 虽然 `updateURLHTTPStatus=200`，但未包含 `cleanroom-template@example.com` 首条更新记录，且未提供有效 `update_link`，而不是安装态 smoke 或插件运行时回归
- 当前 Gitee `updateURL` 仅用于这个模板仓库自身的远端发布验收与测试，不作为基于本模板开发的其他插件默认发布地址；下游项目仍需在各自 `config/addon.config.json` 中替换自己的 `addonId` / `homepage` / `updateURL`
- 当前主阻断已清零；当前唯一 active release-only 工程 gap 继续保持 `ENG-HIGH-104 / ENG-LOW-211~213`：修正远端发布编排与远端 `updateURL` 闭环验证，不回头重开 Reader / startup / freshness 主线；`LEGAL_RISK_CHECKLIST.md` 的 Release Gate 继续保持 `release-only` 人工流程
<!-- CURRENT-TRUTH-SUMMARY:END -->

- `READER-HIGH-109 / READER-LOW-225~227` 的逐目标视觉证据导航已完成，并转入历史 review artifact；当前直接复用这些既有证据，不再把证据导航继续挂成 active 开发批次
- `READER-HIGH-118 / READER-LOW-249~251` 已完成并转入历史契约 / review artifact；其消费者真相一致化与单 stage choreography 收紧结论只保留为历史对照
- Obsidian 工作台继续保留人工 verdict 能力；在 `READER-HIGH-125 / READER-HIGH-126` 的 library-only 收口期间，`agent:monitor` / `agent:gate` 曾把 `npm run agent:obsidian` 暴露为视觉 verdict 入口，且历史人工结论曾固定为 `实际回归`；当前该链路只保留为历史能力，不再代表 current truth
- 正式状态以 `dist/agent-delegation/<taskId>/review.json` 为准；上一批已完成的 low-task 仅保留在历史 review artifact 中，不再写回当前 active 任务列表
- 委托分工脚手架已验证可用：manifest 加载、scope 重叠检测、快照比对、聚焦测试、审查结论全链路已跑通

## Agent 闭环链路

- 数据采集：`agent:run` / `agent:check` / `agent:release` 记录到 `dist/agent-runs/*.json`
- 数据汇总：`agent:monitor` 产出 `dist/agent-monitor.json` 与 `dist/agent-monitor.md`，并把 `zotero:watch` 的热重载状态、`agent:zotero:e2e` 的真机验证结果、服务健康摘要、Reader 事件桥摘要、`agent:zotero:autofix` 的恢复结果、步骤耗时、失败步骤分布、最小 `failure memory / fix outcome memory`，以及“工程化硬化信号”最小摘要一并纳入主报告；其中 `frontpageSummary` / `readinessSummary` 会提供轻量状态、摘要结论与下一步建议，便于 agent 先快速读状态，再按需下钻明细
- 发布矩阵：`release:matrix` 会生成 stable/beta 本地发布矩阵，`agent:monitor` / `agent:dashboard` / `agent:gate:release` 会继续消费这份矩阵；当前已能区分“阻断型运行时错误”与“宿主噪声”，stable/beta 本地安装态 smoke 已实跑通过，最新 release gate 仅因远端 `update.json` 缺少当前模板的有效更新记录而继续阻断
- 记忆层摘要：`agent:memory` 会单独生成 `dist/agent-memory.json` 与 `dist/agent-memory.md`；当前会沉淀故障指纹热度、历史最优恢复路径、当前故障是否见过、历史推荐、最近样本，以及最近多日趋势
- 上下文感知记忆：当前 `agent:memory` / `agent:monitor` / `agent:dashboard` 已额外沉淀 `zoteroVersion`、`zoteroVersionBucket`、`latestBootMode`、`bootModes` 与 `preferredStrategy.contextMatchLevel`，并优先采用精确上下文的历史成功路径
- 记忆层归档：`agent:memory` / `agent:monitor` 现在会同步维护 `dist/agent-memory/`；其中包含 `latest.{json,md}`、`snapshots/`、`history-index.json`、`fingerprints/index.json`、`fingerprints/*.json`、`reasons/index.json`、`reasons/*.json` 与 `signals/index.json`，便于 agent 和人工按时间、指纹、阻塞原因或运行信号回看历史
- 运行信号趋势：当前会把 `watch / e2e / readerEvent / autofix / watchRecovery / gate / releaseMatrix` 摘要归档到 `dist/agent-memory/signals/*.json`，并在 monitor / dashboard 展示各信号的最近状态、健康率、趋势方向与关键异常指标
- 阻塞原因趋势：当前会把 autofix 历史中的补丁阻塞原因，以及 `watch / e2e / readerEvent / gate / watchRecovery` 的历史原因条目，一并沉淀到 `dist/agent-memory/reasons/*.json`，并在 monitor / dashboard 展示“阻塞原因趋势”，帮助区分是哪类问题在回归
  - 当前常见信号文案已会归一化为稳定原因键，例如 `e2e:plugin-not-mounted`、`gate:autofix-missing`、`watchRecovery:sequence-incomplete`，避免同类问题因措辞不同被切碎
- 指纹时间序列：当前 monitor / dashboard 会额外展示“重点指纹时间序列”，帮助区分同类问题是偶发、持平还是回归
- 能力覆盖汇总：`agent:monitor` / `agent:dashboard` 会额外展示 capability manifest 的覆盖情况，区分“已覆盖 / 失败 / 未覆盖”能力
- 工件隔离：默认写入 `dist/`；若设置 `AGENT_ARTIFACTS_DIR=/tmp/addon-template-agent-artifacts`，则 `agent:zotero:e2e` / `agent:zotero:autofix` / `agent:zotero:watch-recovery` / `agent:monitor` / `agent:dashboard` / `agent:gate` / agent 遥测都会改写到自定义目录，便于测试或故障复盘时避免污染当前真机结论
- 可视化：`agent:dashboard` 产出 `dist/agent-dashboard.html`，主页面可直接看到 Zotero 热重载状态、最近真机验证、服务状态、Reader 事件桥摘要、自动修复摘要、关键恢复步骤与耗时，以及工程化硬化信号摘要
- 人工介入：`agent:obsidian` 会把当前 `loop / gate / monitor / e2e` 结论导出到独立的 `obsidian/agent-workbench/` 工作台目录；默认输出仍是 Markdown 状态页、证据页、Quickstart、Advanced Guide、人工指令窗口与 `.canvas` 白板，其中白板以“项目架构 + agent 自动链 + 人工指令窗口 + 证据工件”组织，便于人工接管问题分析与修复决策
- 可选视觉层：当设置 `AGENT_OBSIDIAN_VISUALS=1` 时，`agent:obsidian` 会额外生成 Mermaid 闭环流程图与 Excalidraw 人工复核决策图；这两份仅是 companion 视图，不参与任何 gate / loop 判定，也不替代现有人工窗口
- 人工工作台位置：默认目录为 `obsidian/agent-workbench/`；如需统一放进单独的 Obsidian 管理空间，可设置 `AGENT_OBSIDIAN_DIR=/path/to/vault-folder`
- 人工介入窗口：`agent:zotero:loop:human` 会先刷新 Obsidian 工作台，再打开一个短暂人工窗口；若无人修改 `10-Zotero-Agent-人工指令窗口.md`，当前回合继续按自动路径推进；若人工填写“下一步指令”或改为 `hold`，本回合会按人工意图改写路径或暂停
- 质量闸门：`agent:gate` / `agent:gate:release` 产出 `dist/agent-gate.json` 与 `dist/agent-gate.md`；开发档位下若 `watch` 状态异常、最近 Zotero E2E 未通过、服务健康异常、Reader 事件桥退化、E2E 结果已过期、能力地图存在未覆盖能力，或失败后的 `autofix` 记录仍未跟进到最新失败轮次，会直接阻断通过；发布档位下若 `release-matrix` 缺失、失败或仍停留在“待补验证”，也会直接阻断通过；新增的工程化硬化信号只做非阻断摘要，不改变既有 `nextAction` 语义
- 一键推进：`agent:pipeline` 将“执行 -> 汇总 -> 可视化 -> 闸门”串成闭环
- 开发态热重载闭环：`zotero:watch` 会在每次重建/reload 后自动执行宿主健康检查、汇总日志；若热重载失败，会先尝试 runtime 恢复，再必要时重启 Zotero 会话，并把全过程写到 `dist/zotero-watch-status.json` 与 `dist/zotero-watch-status.md`
- Zotero 真机闭环：`agent:zotero:e2e` / `agent:zotero:e2e:restart` 自动执行“打开 Zotero -> 重新加载插件 -> 运行动作与测试 -> 抓取日志 -> 判定结果”，产出 `dist/agent-zotero-e2e.json` 与 `dist/agent-zotero-e2e.md`
- 单回合编排：`agent:zotero:loop` 会先读取当前 `watch / e2e / autofix / watchRecovery / gate` 工件，推导本轮最小动作集合；若需要，会依次刷新 watch、执行 E2E 或 autofix、补跑恢复回归，最后重建 `monitor` 与 `gate`，并输出 `dist/agent-zotero-loop.json` 与 `dist/agent-zotero-loop.md`
- 人工窗口回合：`agent:zotero:loop:human` 会先刷新 Obsidian 工作台，再等待一个短暂人工窗口；如果人工没有填写指令，agent 自动继续；如果人工填写了“下一步指令”或把 `模式` 改为 `hold`，当前回合会按人工路径调整动作顺序或暂停
- Watch 恢复真机回归：`agent:zotero:watch-recovery` 会通过 clean-room 受控注入触发一次 build 失败和一次 runtime 恢复失败，验证 `session-restart-recovery` 是否能把 Zotero 拉回健康状态，并输出 `dist/zotero-watch-recovery-regression.json` 与 `dist/zotero-watch-recovery-regression.md`
- 纯项目导出：`export:project` 会生成一个剔除 `reference/`、`docs/`、`tests/`、agent 编排脚本和运行时沙箱后的最小插件工程，输出到 `dist/<addonRef>-<version>-pure-project/` 与对应 zip，适合单独交付业务代码
  - 导出物会保留 `bootstrap.js`、`preferences.xhtml`、`main.css`、配置声明的 icons 与三套 locale `main.ftl`，并继续受 `verify` 护栏保护
  - 如果目标是“给别人一份干净源码”而不是“带上本地运行产物”，优先使用这条导出链，而不是手工打包整个仓库目录
- 可视化验收：`agent:zotero:e2e` 现会额外输出每轮 `库视图` 与 `Reader` 窗口截图到 `dist/agent-zotero-e2e-assets/`，并自动对照 `tests/visual-baselines/agent-zotero-e2e/` 做像素级漂移判定
- 基线刷新：`agent:zotero:e2e:update-baseline` 会把当前 `restart/hot-reload` 两种模式下的 `library/reader` 截图写回视觉基线，用于 UI 变更后的受控更新
- 场景化动作验证：`zotero-scenarios/*.scenario.js` 已覆盖“真实条目选择/摘要、真实 Notifier 更新、真实 PDF Reader 打开、Reader 交互与 UI 状态摘要、Reader 批注创建/更新/删除回环、设置治理、主窗口多开挂载、无阻塞命令”验证，`agent:zotero:e2e` 会自动执行这些 scenario 并把结果写入报告
- 自动恢复：`agent:zotero:autofix` 会先跑 E2E；若失败，则按报告中的故障模式尝试 `check`、`fresh+restart`、`zotero:test` 等受控恢复动作；若当前仅剩库视图/Reader 视觉漂移，则会先自动刷新视觉基线，再回到 compare 模式复验；若显式带上 `--apply-whitelisted-patch` 且命中 `reader-ui:reader-visual-drift`，则还可把最新 E2E 截图安全复制回 `tests/visual-baselines/agent-zotero-e2e/` 并复验，最终输出 `dist/agent-zotero-autofix.json` 与 `dist/agent-zotero-autofix.md`
- 注册入口补丁：`agent:zotero:e2e` 现已直接观测 `主命令 command palette`、`主窗口上下文菜单项`、`偏好设置面板` 是否注册；命中对应诊断时，`agent:zotero:autofix -- --apply-whitelisted-patch` 可在 `src/app/feature-composer.js` 中受控补回这些基线注册块，并按各自 `verification contract` 复验
- 运行时桥接诊断：`bootstrap` 现会生成能力白名单报告，`plugin.api.runtime` 可按需读取完整报告，agent 默认只采集压缩后的 `runtimeBridge*` 摘要字段，避免上下文被大块日志淹没
- 当前边界：这套链路已具备“自动验证 + 自动恢复 + 上下文感知历史推荐 + 重点指纹时间序列 + 多信号趋势归档”；`READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125` 与 `READER-HIGH-126` 已全部转入历史契约 / review artifact，当前主阻断已清零。远端发布编排、远端 `updateURL` 验证、下一轮 Reader 更深事件点与 `P1` 扩面继续作为非阻断延后项；如 future fresh `watch -> e2e -> monitor -> gate` 再次出现新的真实回归，再单独冻结新的高逻辑批次，详见 [Agent 自主开发路线图](docs/AGENT_AUTONOMY_ROADMAP.md)
- 当前默认下一轮高逻辑任务源为 `ENG-HIGH-104 / ENG-LOW-211~213`：只负责远端发布编排与远端 `updateURL` 闭环验证，继续复用现有 release 工件与 release gate，不回头重开已完成的 Reader / startup / freshness 批次
- 当前新增一类 clean-room 静态资源恢复：agent 可以把“偏好设置面板未注册”进一步分流为“注册缺口”与“`preferences.xhtml` 资源缺失”，避免错误修复方向
- 当前新增一类运行时资源恢复：agent 可以把“仅剩 error 日志”的一部分问题继续下钻为 `main.css` 样式资源缺失，而不是停在笼统的 runtime log 层

## 合规工作流

1. 先在 `SPEC.md` 冻结当前模板的黑盒行为声明
2. 维护 `LEGAL_RISK_CHECKLIST.md`，确保 Development Gate 全部可勾选且带 Evidence
3. 日常开发运行 `npm run cleanroom:audit` 输出 `dist/cleanroom-audit.{json,md}`
4. 本地挂载可选 `reference/` 快照后运行 `npm run cleanroom:sim` 输出 `dist/cleanroom-similarity.{json,md}`
5. 发布前执行 `npm run release:preflight`，要求发布态 clean-room audit 与 similarity 都通过

## 文档

- [Agent 入口](AGENTS.md)
- [API 参考](docs/API.md)
- [架构说明](docs/ARCHITECTURE.md)
- [使用指南](docs/GUIDE.md)
- [Zotero 测试与调试](docs/ZOTERO_TESTING.md)
- [Obsidian 人工介入](docs/OBSIDIAN_INTERVENTION.md)
- [Reference 对比与修复路线](docs/REFERENCE_COMPARISON.md)
- [BibGenie 架构借鉴分析](docs/REFERENCE_BIBGENIE_ANALYSIS.md)
- [本地 Reference 快照说明](docs/REFERENCE_SNAPSHOTS.md)
- [Clean-room 架构重构计划](docs/CLEANROOM_REFACTOR_PLAN.md)
- [Agent 自主开发路线图](docs/AGENT_AUTONOMY_ROADMAP.md)
- [Agent 能力地图](docs/AGENT_CAPABILITIES.md)
- [当前剩余任务清单](docs/CURRENT_BACKLOG.md)
- [变更记录](CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)
- [框架完整性检查](FRAMEWORK_CHECKLIST.md)
- [类型覆盖率报告](TYPES_COVERAGE_REPORT.md)
- [框架综合评估](FRAMEWORK_ASSESSMENT.md)

## 示例

- [基础示例插件](examples/basic-plugin/README.md) - 完整功能演示

## 许可证

UNLICENSED - 保留所有权利
