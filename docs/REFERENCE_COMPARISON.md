# Reference 模版对比与修复路线

本文档以 Zotero 官方模板的公开行为与一次本地 reference 快照观察为对照，评估当前 clean-room 项目的真实完成度。

说明：

- 主仓默认不跟踪 `reference/` 目录。
- 如果你需要在本地复核本文中的对照材料，可按 [本地 Reference 快照说明](docs/REFERENCE_SNAPSHOTS.md) 单独放置只读快照。
- 本文的结论面向“功能行为与开发体验对照”，不要求主仓必须携带 reference 源码副本。

## 结论

- 以“仓库里有没有对应模块”来衡量，当前项目完成度较高，核心 API 和大多数功能包装器已经存在。
- 以“开发者拿到模板后，`build -> load` 能直接体验到多少功能”来衡量，当前项目与 reference 仍有明显差距。
- 本轮修复后，已经补齐 4 个高优先级基线能力：
  - 启动阶段等待 Zotero 宿主就绪
  - 默认注册偏好设置面板
  - 默认注册命令面板入口
  - 默认暴露 `Zotero[instanceKey].api`
- 后续又补上了一套 clean-room 的 Zotero runner：
  - `npm run zotero:smoke`
  - `npm run zotero:dev`
  - `npm run zotero:console`
  - `npm run zotero:watch`
  - `npm run zotero:test`
- 并在 `2026-03-18` 额外验证了发布态 `.xpi` 的正式安装路径：通过 Zotero “Install Add-on From File” 安装后，可自动进入原生 bootstrap 生命周期。
- 本轮继续以 clean-room 方式补齐了默认 demo 接通：
  - `Notifier` 状态跟踪
  - `Keyboard` 快捷键示例
  - `ItemPane Section / InfoRow`
  - `ItemTree` 自定义列
  - `ProgressWindow` Toast
  - `Reader` 菜单与活动上下文摘要示例
- 并在 `2026-03-22` 追加真机确认：
  - `Reader 批注回环`
  - `Reader UI 状态`
  - `Reader 事件桥`
  - `Reader 细粒度浮层 / 上下文菜单探针`
  - `10` 个需场景覆盖能力全部通过
- 当前项目仍不能视为与 reference 模版“默认体验等价”，尤其在默认 demo 接通度、lint/release 流水线方面仍有差距。
- 但以“能否进入 Zotero 真机测试阶段”衡量，当前答案已经从“不能”变成了“可以，且开发态与发布态安装路径都已具备基本验证”。

## 对比口径

- 不比较代码拷贝率，只比较功能行为和开发体验。
- 明确区分“模块已实现”和“默认模板已接通”。
- 所有修复均以 clean-room 方式实现，不直接引入 reference 中的 AGPL 代码。

## 完成度判断

粗略估算如下：

- `模块/API 覆盖度`：约 `85% - 90%`
  - 含义：需要的功能包装器大多已经写出来。
- `默认模板体验完成度`：本轮修复后约 `80% - 85%`
  - 含义：克隆项目、修改配置、构建加载后，开发者已经可以在 Zotero 真机内完成 smoke/test/console/scenario/e2e 验证，默认 `ItemPane / ItemTree / Notifier / Shortcut / Reader` demo 已接通，且 Reader 不再停留在轻量摘要层，但工程化与发布矩阵仍少于 reference。

这个差值当前更准确的问题是：`默认运行时能力已经相当完整，但发布矩阵、细粒度宿主注入点与工程化收尾仍弱于 reference`。

## 功能矩阵

| 能力项 | reference 模版 | 当前项目 | 结论 |
|---|---|---|---|
| 启动前等待 `initialization/unlock/uiReady` | ✅ | ✅ | 本轮已对齐 |
| 主窗口加载与 Tools 菜单入口 | ✅ | ✅ | 已对齐 |
| 官方上下文菜单入口 | ✅ | 🟡 | 本轮补了基线入口，但还没有完整 demo 集 |
| 命令面板入口 | ✅ | ✅ | 本轮已对齐 |
| 偏好设置面板注册 | ✅ | ✅ | 本轮已对齐 |
| 运行时实例 API 暴露 | ✅ | ✅ | 本轮已对齐，路径为 `Zotero[instanceKey].api` |
| 启动进度窗 / Toast demo | ✅ | ✅ | 已通过窗口快捷键示例接通 |
| Notifier demo | ✅ | ✅ | 已通过默认状态跟踪示例接通 |
| Shortcut demo | ✅ | ✅ | 已补齐默认窗口快捷键示例 |
| ItemTree 自定义列 demo | ✅ | ✅ | 已补齐默认列，并在 Zotero 原生管理器内验证 |
| ItemPane Section/InfoRow demo | ✅ | ✅ | 已补齐默认 Section/InfoRow，并接通插件本地化资源 |
| Reader 交互 demo | ✅ | 🟡 | 已覆盖 reader 菜单、活动上下文摘要、交互快照、批注回环、UI 状态、事件桥，以及文本选择浮层和 annotation/color/view/thumbnail/selector 上下文菜单探针；剩余差距主要在更深的宿主 UI 注入与视觉回归 |
| 隔离 Zotero smoke test | ✅ | ✅ | 已补齐 clean-room runner，并已在 Zotero 8 beta 真机验证 |
| 调起内置 Browser Toolbox | ✅ | ✅ | 已补齐 `zotero:console`，并已确认可拉起内置 Firefox 开发控制台 |
| Zotero 内集成测试入口 | ✅ | ✅ | 已补齐基础版 `zotero:test`，当前为轻量 harness，真机结果通过 |
| Zotero 内场景验证入口 | ✅ | ✅ | 已补齐 `zotero:scenario`，并升级为真实数据场景 |
| 开发期 watch / hot reload | ✅ | 🟡 | 已补齐 `zotero:watch`，加入 runtime restart、热重载后健康检查、状态报告与两级自动恢复，但仍缺少更细粒度的恢复策略 |
| lint / format / TS 校验流水线 | ✅ | 🟡 | 已补齐 clean-room 轻量链路（`lint`/`format:check`/`typecheck`/`check`），但尚非 ESLint+Prettier+tsc 的完整生态 |
| `update.json` / release 自动化 | ✅ | 🟡 | 已补齐 `release:metadata` 与 `package` 自动生成 `dist/update.json` / `dist/release-manifest.json`，但仍缺少远端发布编排 |

## 这次已落地的修复

### 1. 启动时序修复

- 在 `plugin.start()` 中等待 Zotero 宿主 ready promise，降低“插件先于 UI/API 就绪”带来的竞态风险。

### 2. 默认基线能力接通

- 默认注册 `PreferencePanes`
- 默认注册 `Prompt/Command Palette`
- 在官方 Menu API 可用时注册一个基础右键菜单入口

### 3. 运行时 API 暴露

- 将核心模块和功能模块统一暴露到 `Zotero[config.instanceKey].api`
- 这样既方便开发者调试，也让“模块已实现但无入口”的情况大幅缓解

### 4. 文档与示例修正

- 修正 `addonId` / `instanceKey` / `strictMinVersion` 等真实配置字段
- 清理仍在使用旧命名的文档示例
- 收紧安装文档：`updateURL` 在 Zotero 7/8 的可安装包里应视为必填，默认安装路径应为 `.xpi` 而不是 `build/<addonRef>` 目录

### 4.1 真机场景升级

- 将原本偏 demo 的 scenario 升级为真实 Zotero 数据驱动：
  - 真实 item 创建与选择
  - 真实 item modify 触发 Notifier
  - 真实 PDF 附件导入与 Reader 打开
- 为 scenario harness 补齐自动清理 helper，避免测试数据残留在运行库
- 为 agent API 补齐 `inspectItem()` 等 helper，降低 scenario 对内部实现细节的耦合

### 5. 真机测试入口补齐

- 新增 clean-room Zotero runner，不依赖 reference 的 AGPL 工具链
- 允许在隔离 profile/dataDir 中做 proxy 安装 smoke test
- 允许通过 `--jsdebugger` 请求 Zotero 内置 Browser Toolbox
- 允许在源码变更后重新构建并通过 RDP 执行基础 reload

### 6. Zotero 8 真机启动链修复

- 在 `2026-03-18` 的实测里，确认 Zotero 能识别 add-on，但不会自动把插件实例挂到 `Zotero[instanceKey]`
- 进一步通过 chrome debugger 手工重放 `registerChrome -> loadSubScript -> bootstrapPlugin()`，确认插件代码本身可正常启动
- 因此在 clean-room runner 中新增了分层兜底：
  - 原生实例出现则直接使用
  - 若原生实例缺席，则先显式触发 `Zotero.Plugins.init()`
  - 若仍然缺席，则由 runner 补跑一次 clean-room bootstrap
- 随后又定位到原生 bootstrap 失败的根因是 Zotero 原生插件沙箱里 `console` 未定义，并以 clean-room 方式补上 console bridge
- 修复后已同时验证：
  - proxy install 开发链路可正常进入原生生命周期
  - 发布态 `.xpi` 通过 Zotero 正式安装入口后，也会自动挂出 `Zotero.CleanroomTemplate.api`
- 因而当前的 chrome bootstrap fallback 主要承担跨版本/开发态兜底角色，不再是此版本进入真机测试的唯一前提

### 7. 默认 demo 接通与宿主契约修复

- 新增主窗口级 `insertFTLIfNeeded("main.ftl")`，让 `ItemPane` 的本地化 label 走 Zotero 官方契约
- 将插件本地化资源放到插件根目录 `locale/<locale>/main.ftl`，对齐 Zotero 插件自动注册 locale source 的方式
- 默认注册：
  - `ItemPane` InfoRow
  - `ItemPane` Section
  - `ItemTree` 自定义列
  - `Notifier` 状态跟踪
  - 窗口快捷键 + Toast 提示
  - `Reader` 菜单与活动上下文摘要示例
- 修正 `ItemTree` wrapper 对 Zotero namespaced `dataKey` 的处理，避免“包装器显示已注册，但宿主未真正接纳”的偏差
- 为 `ItemPane` helper 的 `headerL10nID` / `labelL10nID` 必填约束补上回归单测，降低文档与真实契约再次偏离的风险
- 在 `zotero:test` 中新增宿主级校验，确认默认 demo 已进入 Zotero 原生 manager

### 8. Phase 3 工程化基线补齐（clean-room）

- 新增 `npm run lint`：对 `src/`、`scripts/`、`tests/`、`addon-static/` 做 Node 语法检查，并校验核心 JSON
- 新增 `npm run format:check`：统一检查 tab、尾随空格、文件末尾换行
- 新增 `npm run typecheck`：做运行时 API 与 `types/*.d.ts` 的声明漂移检查
- 新增 `npm run check`：串联 `lint + format:check + typecheck + verify + test`
- 新增 `npm run release:metadata`：生成 `dist/update.json` 和 `dist/release-manifest.json`
- 将 `package` 流程接入 release metadata 生成，打包后自动产出发布描述文件
- 新增 `npm run release:preflight` / `npm run release:local`：在本地对 `config/build/dist` 做一致性门禁，并产出 `dist/release-preflight.json`（含 XPI SHA256）
- 新增 `npm run release:prepare` / `npm run release:plan`：自动生成 `dist/release-plan.json` 与 `dist/release-notes.md`，降低上传发布时的手工整理成本
- 新增 `agent` 运行遥测基线：`agent:check` / `agent:release` 会把执行结果写入 `dist/agent-runs/*.json`，`agent:monitor` 输出汇总视图
- 新增 `agent` 质量闸门：`agent:gate` / `agent:gate:release` 会基于 monitor 数据输出 `dist/agent-gate.json` 与 `dist/agent-gate.md`，将“采集-汇总-可视化”升级为“可判定的闭环”
- 新增 `agent:zotero:e2e` / `agent:zotero:e2e:restart`：自动执行“打开 Zotero -> 重载插件（热重载或重启）-> 运行动作与集成测试 -> 采集控制台日志 -> 生成修复建议”，补齐真机级 agent 闭环
- 新增 `agent:zotero:autofix`：当真机 E2E 失败时，按故障模式触发受控恢复动作并自动复验，开始具备“失败 -> 恢复 -> 再验证”的 agent 闭环能力
- 新增 `zotero-scenarios/*.scenario.js` 与 `npm run zotero:scenario`：把“插件动作链路”的验证从单纯测试断言扩展为可复用的场景脚本，并已接入 E2E 报告
- 新增 Zotero chrome 侧的同步求值包装，避免 Firefox console actor 返回 `Promise<pending>` 破坏 agent 判定链路
- 新增真实数据场景覆盖：`真实条目`、`真实 Notifier 更新`、`真实 PDF Reader`

## 仍未完成的高优先级问题

### 1. 部分包装器文档能力仍需继续与真实稳定能力对齐

- `ItemPane` 的 label/l10n 约束已经收紧，并补了 helper 层回归测试
- 但其他包装器仍需要持续核对“文档宣称能力”和“Zotero 当前版本稳定行为”之间的边界

### 2. Reader 宿主细粒度注入点仍未全部覆盖

- 当前已经接通默认的 Reader 菜单与活动上下文摘要示例
- 当前也已接通 Reader 批注回环、UI 状态快照与官方事件桥
- 当前也已把文本选择浮层、批注/颜色/视图/缩略图/selector 上下文菜单纳入主动探针与真机回归
- 剩余差距主要在更深的 Reader 宿主事件点，以及对应的视觉回归收口

### 3. 发布工作流仍缺少远端发布编排

- 本地 `.xpi` 正式安装路径已经验证通过
- `update.json` 与发布清单已可在本地自动生成
- 但还没有把“上传产物 + 发布说明 + 远端 updateURL 落地”串成端到端自动化

### 4. 开发工作流仍落后于 reference

- 已有 clean-room 轻量 lint/format/typecheck 流程，但还没有引入更完整生态（如 ESLint/Prettier/tsc 项目级配置）
- `zotero:watch` 已补齐失败可视化、状态报告和两级自动恢复，但仍缺少更细粒度的恢复策略

## 系统性修复计划

### Phase 1

状态：已完成

- 等待宿主就绪再启动
- 接通偏好设置面板
- 接通命令面板入口
- 暴露运行时 API
- 修正文档中的旧字段名和旧示例

### Phase 2

状态：已完成

- 以 clean-room 方式补齐默认 demo：
  - ItemPane Section
  - ItemPane InfoRow
  - ItemTree 自定义列
  - Notifier / Shortcut 示例入口
- 为这些 demo 补齐本项目自己的本地化资源，不依赖 reference 的 FTL 结构

### Phase 3

状态：中优先级

- 将当前的 proxy + bootstrap fallback 工作流继续收敛为更稳定的 dev/test 体验
- 将“发布态安装后自动启动”验证沉淀为可重复执行的验收脚本
- 增加 lint / format / TS 校验命令
- 增加 release 产物与更新描述文件生成

### Phase 4

状态：质量提升

- 为 MenuManager / Prompt / PreferencePanes / Host 适配层增加自动化测试
- 让类型定义与文档完全对齐
- 将“模块存在”与“默认接通”分开记录，避免再次高估完成度

## 合规边界

- 不直接复制 reference 中的实现代码
- 不复用其 AGPL 工具链代码片段
- 只参考功能需求、公开 API 行为和运行结果来重建能力
- 如需新增 demo，优先从本项目已有模块组合，而不是向 reference 逆向抄结构
