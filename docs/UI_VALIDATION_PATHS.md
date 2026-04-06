# UI Validation Paths

本文件基于 [docs/UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md) 中整理出的 UI 创建路线，评估当前模板验证链是否已经覆盖这些路线，并给出后续扩展时应优先补强的验证方向。

它回答三个问题：

1. 当前模板验证强在哪些 UI 路线？
2. 哪些 UI 路线现在只验证了“surface 可见”，还没验证“路线本身正确”？
3. 后续如果扩展验证，应该补哪类 contract，而不是一股脑把所有 UI 变更都升级成 strict visual？

本文不是 project truth，也不直接改变当前 gate 语义。当前 active wave、当前 validation level 与当前主线，仍以以下文件为准：

- `docs/CURRENT_BACKLOG.md`
- `config/project-expansion-wave.json`
- `config/project-validation-overrides.json`
- `config/project-validation-surfaces.json`

## 结论先看

当前模板验证值得改进，但不应改成“所有 UI 路线一律更重的视觉阻断”。

更准确的结论是：

- 当前模板已经把“宿主可见面是否真实可见”这条验证链做得比较强。
- 当前模板还没有把“某种 UI 实现路线本身是否满足生命周期、幂等、跨文档、清理与性能 contract”做成同等级的验证轴。
- 因此后续应从“单轴 surface 验证”升级为“surface truth + implementation path truth”双轴验证，而不是简单扩大 `visual-required` 范围。

## Analysis Basis

本分析主要依据以下现状：

- 当前 wave 明确是 `host-first -> surface smoke -> surface-local visual evidence`
  - `docs/CURRENT_BACKLOG.md`
  - `config/project-expansion-wave.json`
- 当前项目级 visual 升级，主要围绕 host-visible surface：
  - `config/project-validation-overrides.json`
  - `config/project-validation-surfaces.json`
- 当前 `validationDecision` 只回答“视觉验证级别是什么”，不回答“当前 UI 路线自身 contract 是否成立”：
  - `scripts/agent-validation-decision-lib.mjs`
- 当前模板已对 Reader 细粒度 hook 做了比普通 surface 更深的专项验证：
  - `zotero-scenarios/reader-event-hooks.scenario.js`
  - `zotero-scenarios/reader-fine-grained-hooks.scenario.js`
  - `src/app/capability-manifest.js`
- 当前仓库内并没有已成体系的 route-specific validator 去覆盖 `VirtualizedTable`、`customElements.define(...)`、`parseXULToFragment(...)`、isolated iframe，或 `openDialog(...) + _initPromise` 这类 UI 路线自身 contract。

## Current Validation Model

当前模板的验证模型，本质上更接近：

1. 先按变更路径判断 `visual-required / visual-recommended / visual-not-needed`
2. 再用 `agent:zotero:e2e -> agent:monitor -> agent:gate` 判定最新真机证据是否充分
3. 对真实 host-visible surface，优先看 surface smoke 与 surface-local evidence
4. 对 Reader 事件桥，补充专项 hook 诊断

这条链已经很适合回答：

- 某个可见面有没有真的挂到 Zotero 宿主上
- 最近一轮真机验证有没有看到证据
- 当前是否该被视觉证据阻断

但它还不够适合回答：

- 当前 UI 路线有没有重复挂载、重复绑定、遗漏 teardown
- 当前 HTML / XUL / Reader iframe / child window 文档归属是否正确
- 当前虚拟列表是否只是“面板看起来出现了”，但 provider / selection / render lock 实际有漂移
- 当前 standalone dialog 是否只是“窗口弹出来了”，但 ready gate / focus / cleanup 已经开始失控
- 当前 host patch 是否具备最小 patch 面、可恢复性与 restore contract

## Coverage Matrix

### Path 1. 宿主注册式 Surface

当前状态：强覆盖

依据：

- `config/project-validation-surfaces.json` 已把 `preference pane`、`item pane sidenav`、`context pane`、`reader renderToolbar`、`reader sidebar view`、`menu item` 列为 active surface
- `zotero-scenarios/*surface-smoke*.scenario.js` 已对这些入口做 surface smoke
- `agent:zotero:e2e` / `agent:gate` 会消费 surface-local evidence

判断：

- 这条路线目前是模板验证的强项
- 暂不需要把它改成更重的验证模型
- 后续只需要继续按 active wave 增量补 surface contract 即可

### Path 2. `ztoolkit` 声明式 UI DSL

当前状态：中等覆盖

已覆盖部分：

- 如果 DSL 最终挂到 host-visible surface，当前 surface smoke 与 local evidence 能看见最终结果

当前缺口：

- 没有专门验证节点工厂的幂等性
- 没有专门验证 `ignoreIfExists / removeIfExists / skipIfExists` 这类重复挂载语义
- 没有验证 unregister / element cache 清理是否完整

判断：

- 这条路线不是“没有验证”，而是只验证了“结果出现了”，没有验证“DSL contract 仍成立”
- 适合进入下一批的轻量 structural validation

### Path 3. HTML Micro-App Panel

当前状态：中等覆盖

已覆盖部分：

- 如果 micro-app 挂在 `context pane`、`preference pane`、Item Pane section 或 Reader 等真实 surface 上，当前 smoke/evidence 能验证它“出现了”

当前缺口：

- 没有验证 `build / handlers / refresh / dispose` 是否分层
- 没有验证 repeated mount 是否造成双 listener
- 没有把 `ownerDocument` / `event.doc` / iframe document 的文档归属做成显式 contract

判断：

- 这类路线最容易出现“面板在，但实现已经开始失控”的问题
- 需要补 route-specific runtime contract，但不需要一开始就升成更重的视觉阻断

### Path 4. XUL Custom Element Workspace

当前状态：弱覆盖

已覆盖部分：

- 若最终落到真实可见面，可能被整体验证链间接观察到

当前缺口：

- 没有 `customElements.define(...)` define-once 验证
- 没有 `parseXULToFragment(...)` 骨架存在性与 root marker 验证
- 没有 `connected/disconnected/destroy` 生命周期 contract
- 没有验证宿主元素继承与 teardown / restore 行为

判断：

- 这是当前模板验证的明显空白区
- 如果下一波开始接纳这条 UI 路线，应优先补 contract，而不是只依赖截图

### Path 5. Virtualized List / Table

当前状态：弱覆盖

已覆盖部分：

- 当前模板对“surface 是否可见”的验证，可间接看到列表容器是否出现

当前缺口：

- 没有验证 `getRowCount / getRowData / onSelectionChange`
- 没有验证 render lock / defer 释放
- 没有验证大量数据下的最小性能 contract
- 没有把“容器可见”和“虚拟列表逻辑正确”区分开

判断：

- 这条路线不能只靠 surface smoke
- 一旦进入 scope，建议优先加 route-specific scenario 或 runtime snapshot

### Path 6. Reader Quick Action

当前状态：中高覆盖

已覆盖部分：

- `reader-event-hooks` 与 `reader-fine-grained-hooks` 已覆盖 `renderToolbar`
- 也已覆盖 `renderTextSelectionPopup`、`renderSidebarAnnotationHeader`、`createViewContextMenu` 等细粒度入口
- `agent:monitor` / `agent:gate` 已消费 Reader 事件桥摘要
- 当前模板已经对 current active host-visible surface 补上了一层 source-aligned action replay：live button / menu discovery、`click` / `MouseEvent` / `command` 回放、`popupshown / popuphidden` 等待，以及动作后结果验证

补充说明：

- 这层 action replay 是 `surface truth + implementation truth` 的补强，不是 strict visual 的替代品

当前缺口：

- 还没有把“必须使用 `event.doc`”做成显式失败条件
- 还没有把 duplicate insertion sentinel、popup 退场 cleanup 之类实现约束做成 contract

判断：

- 这是当前模板中除 Path 1 以外最接近“路线专项验证”的区域
- 后续补强应是小步加固，而不是重写整条链

### Path 7. Host Patch / Augment

当前状态：中低覆盖

已覆盖部分：

- `agent:host:guard` / `agent:host:semantic:guard` 能约束 host contract 漂移
- 当前 validation strategy 已明确“不应默认 patch 宿主”

当前缺口：

- 没有 route-specific patch contract 去验证“patch 粒度是否最小”
- 没有统一验证 patch restore / recoverability
- 没有把“host guard 通过”与“patch 实现合理”区分开

判断：

- 当前模板已经知道这条路线高风险，但还没有把高风险点显式结构化
- 后续一旦启用更多 patch/augment 路线，应先补 patch contract，再扩产品功能

### Path 8. Isolated Iframe / Embedded App

当前状态：弱覆盖

已覆盖部分：

- 基本只会被外层 surface 可见性间接观察到

当前缺口：

- 没有 bridge handshake 验证
- 没有 iframe unload / cleanup contract
- 没有 style/runtime isolation 的最小验证
- 没有外部 web bundle / widget ready 与 unload lifecycle 验证

判断：

- 当前模板尚未把这条路线纳入一等验证公民
- 在真正引入该路线前，应该先定义验证 contract

### Path 9. Standalone Dialog / Window Shell

当前状态：弱覆盖

已覆盖部分：

- 如果窗口最终承载了可见表格或按钮，当前验证链可能间接看到窗口内容出现

当前缺口：

- `_initPromise` / ready gate
- 独立窗口 document ownership
- close cleanup
- window reuse / focus
- dialog 内 virtualized table / embedded widget lifecycle

判断：

- 这批新增参考主要扩展了模板当前的弱覆盖区域
- 真正需要补的是窗口生命周期与窗口内组件 contract，不是把这类路线整体上调为 strict visual

## Key Missing Validation Nodes

结合 [docs/UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md)，当前模板最值得补的是这些“跨路线关键节点”：

### 1. Lifecycle

- `onStartup`
- `onMainWindowLoad`
- `onMainWindowUnload`
- `onShutdown`
- `destroy` / `dispose`

当前问题：

- 这些信息多存在于实现或经验中，还没有系统化地变成 route validator

### 2. Node Primitive

- HTML / XUL / SVG 创建原语是否统一
- Reader / iframe / main window 的 document 归属是否明确

当前问题：

- 当前 gate 主要看结果，不检查节点原语是否走错 document

### 3. Build / Handlers / Refresh / Dispose

- 是否分层
- 是否重复绑定
- 是否重复重建

当前问题：

- 现在没有把这些实现约束转成稳定信号

### 4. State Bridge

- root dataset
- prefs
- cache / registry

当前问题：

- 当前更多验证“看见了什么”，较少验证“状态桥是否仍可解释”

### 5. Cross-Document Access

- 主窗口 `document`
- Reader `event.doc`
- note editor iframe
- dialog window

当前问题：

- 这是很多 UI 路线的真实故障源，但还没有成为统一验证维度

### 6. Action Replay

- live button discovery
- `click` / `MouseEvent` / `command` dispatch strategy
- `popupshown` / `popuphidden` wait
- post-action result verification

当前问题：

- 当前 active host-visible surface 已经开始具备 source-aligned replay，但还没有把这套 replay 节点系统化成独立 route validator
- 现有 replay 仍聚焦当前主线 surface，不是通用 UI 宏录制框架

### 7. Window Lifecycle

- `openDialog` ready
- child window teardown
- reopen / focus semantics

当前问题：

- 当前验证更容易证明“窗口出现过”，但还不能证明 ready gate、复用与销毁语义仍成立

### 8. Embedded Widget Lifecycle

- 外部脚本加载
- iframe / widget ready state
- close / unload cleanup

当前问题：

- 外部 bundle / widget 最容易藏住迟到初始化和窗口关闭后的残留状态，但模板还没有统一观察点

### 9. Performance Guard

- virtualized
- debounce / idle callback
- repeated render 去重

当前问题：

- 当前模板对性能更多是隐性容忍，没有 route-aware 最小 contract

### 10. Teardown

- unregister
- observer disconnect
- interval clear
- patch restore
- iframe unload

当前问题：

- 当前 teardown 更多依赖代码自觉和 review，不是统一验证输出

## Recommended Improvement Direction

推荐的改进方向不是“把所有 UI 都升级为 `visual-required`”，而是下面这条路：

### Phase A. 先补 agent 可读的路线判断

目标：

- 让 agent 在开发时先声明自己走的是哪条 UI 路线
- 明确这条路线当前模板验证是“强覆盖 / 中等覆盖 / 弱覆盖”

建议：

- 继续保留 [docs/UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md)
- 在开发与审阅时同时参考本文
- 若本轮只是文档、治理、或非当前 wave 的规划，不要反向把所有路径改成 strict visual

### Phase B. 增加第二条验证轴，而不是挤进 `validationDecision`

目标：

- 保持当前 `validationDecision` 继续只回答“视觉级别”
- 另加一条 `uiRouteValidation` 或同类摘要，专门回答“路线 contract 是否成立”

原因：

- `visual-required / visual-recommended / visual-not-needed` 适合回答 gate 的视觉策略
- 但不适合表达 `custom element define-once failed`、`virtualized selection drift`、`event.doc misuse`、`_initPromise` 卡住等 route-specific 问题
- 当前 active host-visible surface 已补入 source-aligned action replay，但它仍然只是在补强 surface truth，不构成扩大 strict visual 范围的依据

### Phase C. 按路线增量补 contract

建议优先级：

1. Path 4 `XUL custom element workspace`
2. Path 5 `virtualized list / table`
3. Path 9 `standalone dialog / window shell`
4. Path 7 `host patch / augment`
5. Path 3 `HTML micro-app panel`
6. Path 2 `ztoolkit` UI DSL
7. Path 8 `isolated iframe / embedded app`
8. Path 6 `Reader quick action` 小步加固

补强依据：

- 这批新参考主要扩展的是弱覆盖路线，不构成“扩大 strict visual 范围”的依据。

## Suggested Route Contracts

下面这些 contract 更适合成为后续模板验证扩展的最小集合：

### Path 2. `ztoolkit` UI DSL

- 重复 mount 不生成重复节点
- unregister / cache cleanup 可观测
- namespace 与 root marker 正确

### Path 3. HTML Micro-App Panel

- repeated mount 不重复绑定 listener
- root `ownerDocument` 符合当前 surface
- `dispose` 后 observer / timer / popup cleanup 完整

### Path 4. XUL Custom Element Workspace

- `customElements.define(...)` 只注册一次
- `parseXULToFragment(...)` 根骨架存在
- `connected/disconnected/destroy` 生命周期可观测

### Path 5. Virtualized List / Table

- `getRowCount` 与数据源一致
- `getRowData` 返回结构稳定
- selection / active row 更新可观测
- render lock 不悬挂

### Path 6. Reader Quick Action

- `event.doc` 被正确使用
- duplicate insertion 有 sentinel
- popup / observer cleanup 可观测

### Path 7. Host Patch / Augment

- patch 面仅限声明范围
- patch restore / rollback 可观测
- host guard / semantic guard 为强前置

### Path 8. Isolated Iframe / Embedded App

- bridge handshake 成功
- iframe unload cleanup 完整
- 主窗口与 iframe 样式隔离未破坏宿主
- 外部 widget script ready / unload 可观测

### Path 9. Standalone Dialog / Window Shell

- `openDialog(...)` ready gate 可观测
- child window document ownership 明确
- reopen / focus 复用语义稳定
- close / unload cleanup 完整
- 窗口内 virtualized table / embedded widget 生命周期可观测

## What Should Not Change

以下方向不建议现在直接改：

- 不建议因为识别出更多 UI 路线，就把所有相关文件都升级成 `visual-required`
- 不建议让整窗截图重新取代 surface smoke / surface-local evidence
- 不建议让 route validator 覆盖 `watch`、`host guard`、`semantic guard`、`gate` 的既有严格阻断
- 不建议在尚未进入新 wave 时，把 `VirtualizedTable`、`iframe app`、`custom element workspace`、`standalone dialog` 的整套验证直接塞进当前 wave 结论

## Recommended Agent Reading Order

当 agent 触达 UI 相关任务时，建议按这个顺序读：

1. `docs/CURRENT_BACKLOG.md`
2. `config/project-expansion-wave.json`
3. `config/project-validation-overrides.json`
4. `config/project-validation-surfaces.json`
5. [docs/UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md)
6. 本文

如果结论是“当前路径属于弱覆盖或中等覆盖”，优先补 route contract / runtime signal / targeted scenario；不要直接用“再多截几张图”替代验证设计。
