# BibGenie 0.5.7 架构借鉴分析（Clean-room 口径）

本文针对 BibGenie 0.5.7 的一次本地只读快照做系统性架构分析，目标是判断其对当前项目是否有借鉴意义，以及哪些点可以安全落地到本仓库。

## 1. 分析范围与证据

本次主要基于一份本地 BibGenie 只读快照中的以下文件观察：

- `manifest.json`
- `bootstrap.js`
- `prefs.js`
- `content/modules/mupdf-loader.mjs`
- `content/scripts/bibgenie.js`（打包产物，427052 行）

注意：

- 该目录是“发布产物形态”而非完整源码仓库。
- 这份快照是可选本地研究输入，不属于主仓必须携带的源码资产；如需复核摆放方式，见 [本地 Reference 快照说明](docs/REFERENCE_SNAPSHOTS.md)。
- 对 React/状态管理/AI SDK 等内部分层的判断，部分来自 bundle 末尾可读片段与注释映射，属于“中等置信度推断”。
- 本文仅讨论“架构模式借鉴”，不复用其实现代码，保持 clean-room 边界。

## 2. BibGenie 架构特征（观测结论）

### 2.1 生命周期与启动模型

- 采用经典 `bootstrap.js` 生命周期（`install/startup/shutdown`）。
- `startup` 时注册 chrome 资源并加载 `content/scripts/bibgenie.js`。
- 启动前等待 `Zotero.initializationPromise/unlockPromise/uiReadyPromise`，再执行主窗口挂载。
- 通过 `hooks` 对外暴露 `onStartup/onMainWindowLoad/onMainWindowUnload/onShutdown`。

### 2.2 运行时沙箱桥接

- 在 bootstrap 阶段向插件上下文注入 `fetch/Streams/indexedDB/AbortController` 等 Web API。
- 该做法解决了 Zotero sandbox 默认缺失部分 Web API 的问题，提升了前端框架和现代库的可运行性。

### 2.3 UI 与业务组织（产物层可见）

- 主脚本为超大单 bundle（`bibgenie.js` 427052 行）。
- bundle 中可见 React 运行时、工具层（`ztoolkit`）、插件 `Addon` 对象、hooks 分发与服务初始化逻辑。
- 插件更接近“产品型应用”而不是“开发模板型框架”。

### 2.4 能力服务化倾向

- 启动阶段按配置决定是否启动 MCP 服务（偏好可关闭）。
- 体现了“可选服务”的生命周期管理模式：启动时注册、退出时清理。

### 2.5 重资源能力（MuPDF WASM）

- `mupdf-loader.mjs` 采用多路径加载策略（XHR/NetUtil/fetch）并做 wasm magic number 校验。
- 具备初始化幂等（`_initPromise`）、显式 `dispose()`、内存释放说明，属于较成熟的“重资源组件管理模式”。

### 2.6 右侧栏贴边占位策略

- bundle 可见一套基于 live sidebar 几何的容器占位逻辑。
- 其做法不是写死固定侧栏宽度，而是先读取当前 `#zotero-item-pane` / `#zotero-context-pane` 的实际 `getBoundingClientRect()`。
- 在 context pane 且 stacked 布局下，会继续下探到 `#zotero-context-pane-inner`，优先按真正可用的 inner bounds 占位；找不到 inner 时再回退到外层 sidebar bounds。
- 当侧栏宽高过窄时，会直接跳过显示或先把宿主侧栏扩到最小阈值，再重新计算容器位置与尺寸。
- 同时会在 tab 切换后重绑 sidebar observer，持续跟踪 `item pane` / `context pane` 之间 DOM 宿主变化。

## 3. 与当前模板的对照

当前项目（`addon-static/bootstrap.js -> src/main.js -> src/app/plugin.js`）已经具备：

- 分层模块化（app/core/features/platform）
- 生命周期阶段守卫与清理追踪
- 真机闭环（`zotero:watch`, `agent:zotero:e2e`, `agent:zotero:autofix`）
- 结构化诊断 + 受限补丁 + gate 看板链路

核心差异：

1. BibGenie 偏“产品插件架构”，当前项目偏“可演进模板架构”。
2. BibGenie 以“大 bundle + 外部依赖栈”为主，当前项目坚持“零运行时外部依赖 + 可审阅模块边界”。
3. 当前项目在 agent 自动化闭环方面明显更强（监控、门禁、自动恢复、补丁预检可解释）。

## 4. 借鉴价值分级

### 4.1 高借鉴价值（建议吸收）

1. 启动就绪门控
- 模式：统一等待宿主 ready promise 后再挂载功能。
- 现状：当前项目已采用，可继续强化到“服务级 gating”。

2. 可选服务生命周期
- 模式：服务按偏好/配置启停，且 shutdown 明确回收。
- 价值：适合后续 agent 相关服务（如本地推理/索引/桥接）做“按需启用”。

3. 重资源加载器设计
- 模式：幂等初始化、多路加载、完整校验、可释放。
- 价值：可直接迁移到未来 PDF/向量索引/模型运行时等高成本模块。

4. 贴边式 surface 的 live geometry 占位
- 模式：先读宿主右侧栏或 context pane 的真实几何，再决定容器宽高、位置与最小可显示阈值。
- 价值：很适合模板后续补“贴边模式”或宿主内嵌 panel 的细节打磨，避免固定宽度在 stacked layout、窄栏或 tab 切换下漂移。

### 4.2 中借鉴价值（需改造后吸收）

1. 沙箱 Web API 注入策略
- 可以借鉴“能力探测 + 选择性注入”思想。
- 不建议直接全量注入，建议做白名单和最小暴露。

2. 统一工具入口（toolkit facade）
- 可以借鉴“统一入口降低调用复杂度”。
- 当前模板更适合保持清晰分层，通过组合 API 提供轻量 facade，而非引入大而全单体工具对象。

### 4.3 低借鉴价值（不建议引入）

1. 超大单 bundle 形态
- 对 agent 自动修复和可观测性不友好，定位与补丁粒度太粗。

2. 强耦合产品依赖栈
- 当前模板目标是 clean-room、零运行时外部依赖和可审阅性，不宜引入同类复杂依赖面。

## 5. 对当前项目的结论

结论：**有明确借鉴意义，但主要在“模式层”，不在“实现层”。**

可借鉴的是：

- 生命周期门控方法
- 可选服务启停模型
- 重资源加载器（幂等、回收、校验）模式

不应借鉴的是：

- 单体巨型 bundle 组织方式
- 高耦合外部依赖主导的产品型打包形态

因此对本项目最合理的路线是：

- 继续保持当前模块化 + agent 可观测闭环主线；
- 在不破坏 clean-room 和可测试性的前提下，吸收 BibGenie 的“服务治理 + 贴边占位几何治理”经验。

## 6. 推荐落地项（面向当前仓库）

当前进展（2026-03-20）：

- 已落地 `bootstrap` 能力白名单报告，并通过 `plugin.api.runtime`、`Runtime Bridge` 服务健康和 agent 自检向上暴露
- 已落地轻量 `service registry`
- 已落地 `resource-loader` 骨架，提供 `init/dispose/status` 幂等约定
- 上述能力均保持 clean-room 实现，不引入 BibGenie 代码

### P0（可立即推进）

1. 新增“能力注入白名单报告”
- 在启动日志中显式记录本次注入了哪些 API、跳过了哪些 API、原因是什么。

2. 新增“服务注册表（轻量）”
- 对可选服务统一声明：`id`、`enabledBy`、`start()`、`stop()`、`healthCheck()`。

3. 扩展重资源模板
- 抽象 `resource-loader` 约定：`init/dispose/status`，复用于后续高成本模块。

4. 为贴边式 surface 补几何占位 contract
- 固定先读取 live `sidebarWidth/sidebarHeight` 与当前 pane bounds，再决定容器宽高。
- stacked context pane 优先按 inner pane bounds 占位，避免把外层侧栏空白也算进内容宽度。
- 设定最小可显示阈值；过窄时优先降级或延后显示，而不是硬塞固定宽度。
- tab / pane 切换后重绑 observer，避免继续盯旧 DOM。

### P1（与 agent 闭环联动）

1. 把“服务健康”并入 `agent:zotero:e2e` 诊断
- 例如输出 `service:<id>:unavailable` 结构化指纹，进入候选文件与建议动作链路。

2. 把“服务状态”并入 `agent:monitor/dashboard/gate`
- 让 gate 可以区分“功能坏了”与“服务没启动/状态异常”。

3. 为服务层补场景测试
- 每个可选服务至少一条“启动成功 + 关闭回收 + 异常恢复”场景。

---

如果后续需要，可以基于本文直接拆成执行任务清单（按文件和测试用例分解），并接入现有 `agent:zotero:autofix` 的受限补丁计划。
