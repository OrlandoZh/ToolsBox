# UI Creation Paths

本指南把本仓库 `reference/plugin/` 中参考项目的 UI 创建方式，抽象成可复用的 clean-room 技术路径，供 agent 在开发或审阅时快速选型。

它回答三个问题：

1. 当前 UI 应该挂到哪个 Zotero surface？
2. 该用哪套节点创建原语？
3. 这条路线的关键技术节点、风险和收尾动作是什么？

本文不是 project truth，也不覆盖宿主字段真相。涉及宿主命名、接口字段与事件语义时，仍应以以下文档为准：

- `docs/ZOTERO_TERMINOLOGY_GUIDE.md`
- `docs/ZOTERO_HOST_INTERFACE_CONTRACTS.md`
- `docs/ZOTERO_HOST_SEMANTIC_INDEX.md`

## Authority And Scope

- 本文只沉淀“UI 技术路径”和“关键实现节点”，不定义产品文案、产品布局或阶段真相。
- 本文允许引用 `reference/plugin/*` 作为只读灵感来源，但不要求复刻其实现。
- 若当前任务不是选 UI 路线，而是抽取窗口、服务、队列、iframe、重资源等跨项目技术链，先看 [docs/REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)。
- 当宿主已有官方 surface 时，优先走官方 surface；不要一上来就 patch 宿主。
- 当参考项目展示了产品型实现时，只提炼技术路径，不照搬其产品结构、品牌语义或非 clean-room 代码细节。

## Decision Order

选型时按下面顺序判断，尽量从上到下递进：

1. 先判断是否已有官方 surface：
   `PreferencePanes`、`MenuManager`、`ItemPaneManager`、`Reader.registerEventListener`
2. 如果只是中小型动态节点：
   优先用统一节点工厂或 `ztoolkit` UI DSL，而不是散落的手写 DOM
3. 如果是中等复杂度侧栏或对话面板：
   可选 HTML micro-app 路线
4. 如果要做独立管理窗口、批量处理窗口或详情窗口：
   优先把窗口 shell 单独建模为 standalone dialog / window shell
5. 如果要做长期存在的复杂工作台、分栏 pane、自定义宿主元素：
   可选 `customElements + parseXULToFragment`
6. 如果是大量列表、树和选择器：
   优先 virtualized table，必要时挂到 standalone window 内
7. 只有在官方 surface 不足时：
   才进入 host patch / augment
8. 如果 UI 复杂到接近独立应用，且需要强隔离：
   再考虑 iframe / isolated app

## Path Catalog

### Path 1. 宿主注册式 Surface

适用场景：

- 偏好设置面板
- 菜单项 / 子菜单
- Item Pane 信息行
- Item Pane section
- Reader 工具栏、批注头部、文本选择弹窗等官方事件入口

主创建方法：

- `Zotero.PreferencePanes.register(...)`
- `Zotero.MenuManager.registerMenu(...)`
- `Zotero.ItemPaneManager.registerInfoRow(...)`
- `Zotero.ItemPaneManager.registerSection(...)`
- `Zotero.Reader.registerEventListener(...)`

关键技术节点：

- 生命周期注册点：通常在 `onStartup` / `onMainWindowLoad`
- surface callback：`onShowing`、`onInit`、`onRender`、`onAsyncRender`、`onItemChange`
- 宿主上下文读取：`item`、`tabType`、`context`、`reader`
- 显隐与可用性：通过宿主回调而不是手工猜测面板状态
- 收尾：窗口卸载时移除样式、清 observer / cache / interval

优点：

- 与宿主契约最一致
- 多窗口、多 tab 下更稳定
- 对未来治理、验证和 E2E 最友好

风险：

- 官方 surface 能力边界有限
- 需要更严格遵守宿主命名和字段语义

代表参考：

- [zotero-pdf-translate-main/src/modules/menu.ts](../reference/plugin/zotero-pdf-translate-main/src/modules/menu.ts)
- [zotero-pdf-translate-main/src/modules/infoBox.ts](../reference/plugin/zotero-pdf-translate-main/src/modules/infoBox.ts)
- [zotero-pdf-translate-main/src/modules/tabpanel.ts](../reference/plugin/zotero-pdf-translate-main/src/modules/tabpanel.ts)
- [llm-for-zotero-main/src/modules/contextPanel/index.ts](../reference/plugin/llm-for-zotero-main/src/modules/contextPanel/index.ts)
- [zotero-format-metadata-main/src/modules/preference.ts](../reference/plugin/zotero-format-metadata-main/src/modules/preference.ts)

### Path 2. `ztoolkit` 声明式 UI DSL

适用场景：

- 小到中型按钮、工具栏入口、Reader popup 附加动作
- 菜单树、submenu、separator
- 偏好页 placeholder 替换
- 需要统一处理 HTML / XUL / SVG namespace 的场景

主创建方法：

- `ztoolkit.UI.createElement(...)`
- `ztoolkit.UI.appendElement(...)`
- `ztoolkit.UI.replaceElement(...)`
- `ztoolkit.Menu.register(...)`

关键技术节点：

- 节点描述对象：`attributes`、`properties`、`styles`、`listeners`、`children`
- namespace 统一：HTML / XUL / SVG 不在业务层反复分支
- 幂等控制：`ignoreIfExists`、`removeIfExists`、`skipIfExists`
- 清理：利用 toolkit 的 element cache 或显式 `unregisterAll()`
- 事件绑定：把 listener 定义收口在节点描述里，避免分散 query + bind

优点：

- 比手写 DOM 更可读、更一致
- 对 bootstrap 插件的清理友好
- 很适合 clean-room 模板做统一 UI 原语层

风险：

- 超大型复杂面板里，DSL 可能变得冗长
- 若团队不统一封装规范，容易混成半声明半命令式

代表参考：

- [gemini-zotero-main/src/modules/ui/collectionToolbar.ts](../reference/plugin/gemini-zotero-main/src/modules/ui/collectionToolbar.ts)
- [zotero-pdf-translate-main/src/modules/preferenceWindow.ts](../reference/plugin/zotero-pdf-translate-main/src/modules/preferenceWindow.ts)
- [zotero-pdf2zh-main/plugin/src/modules/pdf2zh.ts](../reference/plugin/zotero-pdf2zh-main/plugin/src/modules/pdf2zh.ts)
- [zotero-attanger-main/src/modules/menu.ts](../reference/plugin/zotero-attanger-main/src/modules/menu.ts)
- [actions-and-tags-for-zotero/content/scripts/zoterotag.js](../reference/plugin/actions-and-tags-for-zotero/content/scripts/zoterotag.js)

### Path 3. HTML Micro-App Panel

适用场景：

- 中等复杂度聊天侧栏
- 多菜单、多状态、多上下文的 HTML 面板
- 挂在 Item Pane section、context pane 或 preference pane 内的复杂 HTML body
- 需要比 `ztoolkit` DSL 更自由，但又不想上 React / iframe / XUL CE 的场景

主创建方法：

- 官方 surface 提供挂载点
- 自定义 DOM helper 提供 HTML 创建原语
- `buildUI + setupHandlers + refresh` 分段实现

关键技术节点：

- 自定义 helper：统一 `createElementNS(HTML_NS, ...)`
- 宿主 surface 只提供 body/root，micro-app 自己负责该 root 内 HTML 骨架
- 骨架构建：`replaceChildren()` 后重建主结构
- 行为绑定：菜单、下拉、history、picker、preview 在 `setupHandlers` 中增量创建
- 轻量状态桥：`dataset`、`Map` cache、prefs
- 跨文档访问：Reader 文档、主窗口文档、note editor iframe 文档显式区分

优点：

- 比 React 更轻量
- 比零散手写 DOM 更有结构
- 对复杂 HTML 面板足够灵活

风险：

- 需要强纪律地维护 build / handlers / refresh 分层
- DOM 规模变大后要防止重复绑定和重建过度

代表参考：

- [llm-for-zotero-main/src/utils/domHelpers.ts](../reference/plugin/llm-for-zotero-main/src/utils/domHelpers.ts)
- [llm-for-zotero-main/src/modules/contextPanel/buildUI.ts](../reference/plugin/llm-for-zotero-main/src/modules/contextPanel/buildUI.ts)
- [llm-for-zotero-main/src/modules/contextPanel/setupHandlers.ts](../reference/plugin/llm-for-zotero-main/src/modules/contextPanel/setupHandlers.ts)
- [zotero-AI-Butler-main/src/modules/ItemPaneSection.ts](../reference/plugin/zotero-AI-Butler-main/src/modules/ItemPaneSection.ts)

### Path 4. XUL Custom Element Workspace

适用场景：

- 长期存在的复杂工作台
- 多分栏、splitter、toolbar、嵌套 pane
- 需要像宿主原生元素那样工作的复合 UI

主创建方法：

- `customElements.define(...)`
- `MozXULElement.parseXULToFragment(...)`
- `document.createXULElement(...)`
- 宿主元素构造器继承

关键技术节点：

- 自定义元素注册表：避免重复定义
- `content` 骨架：linkset、splitter、toolbarbutton、iframe、custom tag 一次性描述
- 生命周期：`init()`、`render()`、`destroy()`
- 宿主元素继承：如 `item-details`、`related-box`
- 持久化状态：pane 宽度、splitter 状态、当前 pinned pane

优点：

- 与 Zotero/XUL 宿主结合最深
- 适合复杂长期 UI
- 能自然表达工作台和 pane 结构

风险：

- 对宿主结构和语义耦合更高
- 维护成本和回归成本都高于 HTML micro-app

代表参考：

- [zotero-better-notes-master/src/extras/customElements.ts](../reference/plugin/zotero-better-notes-master/src/extras/customElements.ts)
- [zotero-better-notes-master/src/elements/workspace/workspace.ts](../reference/plugin/zotero-better-notes-master/src/elements/workspace/workspace.ts)
- [zotero-better-notes-master/src/elements/workspace/detailsPane.ts](../reference/plugin/zotero-better-notes-master/src/elements/workspace/detailsPane.ts)
- [zotero-pdf-translate-main/src/elements/panel.ts](../reference/plugin/zotero-pdf-translate-main/src/elements/panel.ts)

### Path 5. Virtualized List / Table

适用场景：

- Provider 列表
- Note picker / outline picker
- 偏好页大型配置表
- 大量行数据的 selector 或管理器
- 独立管理窗口中的主表格、历史版本表或批量选择器

主创建方法：

- `new ztoolkit.VirtualizedTable(...)`
- `new VirtualizedTableHelper(...)`

关键技术节点：

- 容器先行：先准备一个稳定容器，再把数据接口绑定进去
- 数据接口：`getRowCount`、`getRowData`、`onSelectionChange`
- 首次 render 锁：`defer/renderLock`
- 辅助交互：搜索、列、单选/多选、staticColumns
- 窗口内场景：table root、selection、context menu 都属于当前子窗口 document
- 生命周期：窗口卸载时 `unregister()` 或清 pref observer

优点：

- 避免长列表带来的重排和卡顿
- 结构稳定，适合 agent 维护

风险：

- 需要把“选择状态”和“渲染数据”明确分离
- 不适合只渲染几行静态控件的场景

代表参考：

- [zotero-pdf2zh-main/plugin/src/modules/preferenceScript.ts](../reference/plugin/zotero-pdf2zh-main/plugin/src/modules/preferenceScript.ts)
- [zotero-better-notes-master/src/elements/linkCreator/notePicker.ts](../reference/plugin/zotero-better-notes-master/src/elements/linkCreator/notePicker.ts)
- [zotero-better-notes-master/src/elements/linkCreator/outlinePicker.ts](../reference/plugin/zotero-better-notes-master/src/elements/linkCreator/outlinePicker.ts)
- [zotero-addons-main/src/modules/addonTable.ts](../reference/plugin/zotero-addons-main/src/modules/addonTable.ts)
- [zotero-addons-main/src/modules/historicalVersions.ts](../reference/plugin/zotero-addons-main/src/modules/historicalVersions.ts)

### Path 6. Reader Quick Action

适用场景：

- 文本选择 popup 的单个按钮
- 批注头部按钮
- Reader toolbar button
- Reader context menu 补充入口

主创建方法：

- `Zotero.Reader.registerEventListener(...)`
- 在 event callback 中直接创建小型 HTML/XUL 节点并 `append(...)`

关键技术节点：

- 选择正确的 Reader event：`renderTextSelectionPopup`、`renderSidebarAnnotationHeader`、`renderToolbar`、`createViewContextMenu`
- Reader 文档隔离：优先使用 `event.doc`，不要默认用主窗口 `document`
- 图标策略：必要时内联 SVG，避免 reader 文档资源限制
- 性能保护：大量 annotation 时用 placeholder + `requestIdleCallback`
- popup 退场清理：可用 sentinel + `MutationObserver`

优点：

- 小、快、直接
- 非常适合“加一个动作入口”

风险：

- 容易在多个 reader 场景里重复插入
- 若把复杂逻辑全塞进 event handler，代码会迅速失控

代表参考：

- [gemini-zotero-main/src/modules/ui/selectionPopup.ts](../reference/plugin/gemini-zotero-main/src/modules/ui/selectionPopup.ts)
- [zotero-pdf-translate-main/src/modules/reader.ts](../reference/plugin/zotero-pdf-translate-main/src/modules/reader.ts)
- [llm-for-zotero-main/src/modules/contextPanel/index.ts](../reference/plugin/llm-for-zotero-main/src/modules/contextPanel/index.ts)
- [zotero-better-notes-master/src/modules/annotationNote.ts](../reference/plugin/zotero-better-notes-master/src/modules/annotationNote.ts)

### Path 7. Host Patch / Augment

适用场景：

- 官方 surface 不足
- 必须进入宿主已有组件或渲染流
- 需要在原生 note editor / collection row / host element 上补结构
- 需要手工给 library / Reader toolbar 增补入口，且官方注册式 route 不覆盖该粒度

主创建方法：

- patch 原型方法
- 扩展宿主原生元素构造器
- 对宿主已生成节点做最小增量修改
- clone / insert 现有 toolbar 节点或在现有 toolbar 尾部补节点

关键技术节点：

- 先确认官方 surface 无法满足
- patch 粒度尽量小，只手术单一方法或节点
- clone / insert 时保留宿主原始布局、focus 与按钮语义，不自己发明第二套 contract
- 必须有 teardown 或可恢复策略
- UI 与语义漂移时，需要额外 host guard / semantic guard

优点：

- 能做到官方 surface 做不到的事

风险：

- 回归风险最高
- 最容易被宿主升级打断
- 不应作为默认方案

代表参考：

- [zotero-better-notes-master/src/modules/patches/noteEditor.ts](../reference/plugin/zotero-better-notes-master/src/modules/patches/noteEditor.ts)
- [zotero-citation-bootstrap/src/modules/views.ts](../reference/plugin/zotero-citation-bootstrap/src/modules/views.ts)
- [zotero-AI-Butler-main/src/hooks.ts](../reference/plugin/zotero-AI-Butler-main/src/hooks.ts)
- [zotero-addons-main/src/modules/addonTable.ts](../reference/plugin/zotero-addons-main/src/modules/addonTable.ts)

### Path 8. Isolated Iframe / Embedded App

适用场景：

- UI 已接近独立产品
- 需要更强的样式和运行时隔离
- 需要在宿主中挂载 React 或较重前端应用
- 需要用 iframe/html viewer 承载 mindmap、image preview 或其他独立 viewer
- 需要在 chrome page 中加载外部 web bundle / widget

主创建方法：

- 创建宿主浮层容器
- 挂载 XUL `iframe` 或 HTML 页面
- 在隔离上下文中初始化应用
- 在 chrome page 中通过 `<script src=...>` / `<link href=...>` 装配外部 bundle 或 widget

关键技术节点：

- 容器与应用解耦：浮层负责显隐，iframe 负责应用运行
- 环境桥接：`window/document/Zotero` 必要时桥接到 iframe
- 消息桥：`postMessage`、ready handshake、fallback resend
- 样式隔离：复杂 CSS 不直接污染主窗口
- 外部 bundle / widget 生命周期：chrome page 中的 script/style ready、rebind 与 unload cleanup 仍受宿主窗口约束
- 清理：窗口关闭、iframe 卸载、全局桥接恢复

优点：

- 隔离性最好
- 适合重型产品 UI

风险：

- 复杂度最高
- 调试、事件桥和上下文同步成本都更高
- 如果做成宿主右侧栏贴边 panel，却仍按固定宽度布局，容易在 stacked context pane、窄栏或 tab 切换后出现遮挡、漂移或无效留白

代表参考：

- [bibgenie-0.5.7/content/scripts/bibgenie.js](../reference/plugin/bibgenie-0.5.7/content/scripts/bibgenie.js)
- [zotero-AI-Butler-main/addon/content/mindmapViewer.html](../reference/plugin/zotero-AI-Butler-main/addon/content/mindmapViewer.html)
- [zotero-AI-Butler-main/addon/content/mindmap.html](../reference/plugin/zotero-AI-Butler-main/addon/content/mindmap.html)
- [zotero-addons-main/addon/content/addonDetail.xhtml](../reference/plugin/zotero-addons-main/addon/content/addonDetail.xhtml)

贴边占位提示：

- 若 UI 实际贴附在宿主右侧栏或 context pane，优先按 live pane bounds 占位，而不是写死固定宽度。
- stacked 布局下优先找 inner pane bounds；拿不到 inner bounds 时再回退到外层 sidebar。
- 给贴边容器设最小宽高阈值，窄到不可用时降级隐藏或延后挂载，比强行挤压更稳。

### Path 9. Standalone Dialog / Window Shell

适用场景：

- 独立管理窗口
- 批量处理 / 扫描窗口
- 详情窗口、历史版本窗口
- 需要窗口级 focus / reopen 语义，但还没必要做成宿主级长期工作台

主创建方法：

- `Zotero.getMainWindow().openDialog(...)`
- `*.xhtml` / `standalone.xhtml` 作为窗口 shell
- `_initPromise` 或等价 ready gate
- 在窗口 document 内挂载 HTML / XUL / VirtualizedTable / embedded widget

关键技术节点：

- 窗口 ready / `_initPromise`
- 主窗口与子窗口 document 显式区分
- window close cleanup
- 多窗口复用与 focus 策略
- 外部 widget / script 的生命周期

优点：

- 把“窗口壳”和“窗口内 UI 骨架”从宿主主窗口逻辑中解耦
- 比 host patch 更低侵入，也比 iframe-only 路线更适合 Zotero 原生弹窗工作流
- 能自然容纳 HTML、XUL、VirtualizedTable 和嵌入式 widget 组合

风险：

- ready gate、focus 重用和 close cleanup 容易被遗漏
- 子窗口 document、事件与状态若回流到主窗口，边界会迅速失控
- 多窗口相互调用时要显式定义 ownership 与 teardown

当前模板落点：

- `src/utils/window-shell.js`：负责 `openDialog -> ready -> focus/reuse -> close cleanup`
- `src/features/window-manager.js`：继续只负责主窗口挂载，不替代 Path 9 的子窗口壳
- `src/utils/dialog.js`：只适合轻量对话框，不等同于完整 window shell manager

代表参考：

- [zotero-AI-Butler-main/src/modules/libraryScannerDialog.ts](../reference/plugin/zotero-AI-Butler-main/src/modules/libraryScannerDialog.ts)
- [zotero-addons-main/src/modules/addonTable.ts](../reference/plugin/zotero-addons-main/src/modules/addonTable.ts)
- [zotero-addons-main/src/modules/addonDetail.ts](../reference/plugin/zotero-addons-main/src/modules/addonDetail.ts)
- [zotero-addons-main/src/modules/historicalVersions.ts](../reference/plugin/zotero-addons-main/src/modules/historicalVersions.ts)

## Cross-Cutting Technical Nodes

无论走哪条路径，都建议显式设计下面这些技术节点：

### 1. Lifecycle

- UI 注册：`onStartup`
- 多窗口挂载：`onMainWindowLoad`
- 窗口 ready gate：dialog `load` / `_initPromise` / 等价 ready signal
- 窗口级清理：`onMainWindowUnload`
- 进程级清理：`onShutdown`

### 2. Node Primitive

- 统一 HTML / XUL / SVG 创建原语
- 不要在业务代码里散落 namespace 猜测逻辑

### 3. Build / Handlers / Refresh / Dispose

- `build`：只负责骨架
- `handlers`：只负责事件
- `refresh`：只负责状态同步
- `dispose`：只负责 observer / timer / patch 清理

### 4. State Bridge

- 小场景：`dataset + Map cache + prefs`
- 中场景：面板 root 上的数据属性 + active panel registry
- 大场景：独立 store，但仍要保留宿主可读的 root dataset

### 5. Cross-Document Access

- 主窗口 `document`
- Reader `event.doc` / iframe document
- note editor iframe document
- dialog / standalone window document

对这些文档要显式区分，不要默认“全局 document 就是当前 UI document”。

### 6. Performance Guard

- 大列表：virtualized
- Reader popup：轻量节点 + debounce / idle callback
- 多次 render：避免重复 append
- 重建前：`replaceChildren()` 或显式去重

### 7. Teardown

- menu unregister
- observer disconnect
- interval / timeout clear
- style/link remove
- patch restore 或安全失效
- child window close / unload cleanup
- element cache 清理

## Recommended Default Ladder

对模板和下游 clean-room 项目，推荐默认优先级如下：

1. 宿主注册式 Surface
2. `ztoolkit` 声明式 UI DSL
3. HTML micro-app panel
4. standalone dialog / window shell
5. XUL custom element workspace
6. virtualized list / table
7. Reader quick action
8. host patch / augment
9. isolated iframe / embedded app

注意：

- `standalone dialog / window shell` 是窗口壳路线；它常与 Path 5 或 Path 8 组合，但不等于表格或 iframe 本身。
- `Reader quick action` 是特定 surface 的轻量分支，不代表优先级比 HTML panel 更低；它只是适用范围更窄。
- `host patch` 与 `iframe app` 都不是默认路线，只在确有必要时使用。

## Anti-Patterns

- 没确认官方 surface 是否存在，就直接 patch 宿主
- 用截图或位置描述代替宿主 API 名称
- 在多个 window / reader / note iframe 间混用同一个 `document`
- 把 build、event、state、cleanup 全塞进一个超长函数里
- 在复杂 UI 中混用多套原语而没有统一节点工厂
- 让重型列表直接手工全量 render，而不做 virtualization
- 把 `openDialog(...)` 的窗口壳、窗口内表格和嵌入 widget 混成单一路线
- 在参考项目里看到产品 UI，就把产品结构和文案也一起迁进模板

## Quick Choice Cheat Sheet

- 要加偏好设置面板：Path 1，必要时配合 Path 2 或 Path 3
- 要加菜单项：Path 1 或 Path 2
- 要加 Item Pane section：Path 1；复杂体量可叠加 Path 3 或 Path 4
- 要加 Reader 选中文本按钮：Path 6
- 要做聊天侧栏：Path 1 + Path 3
- 要做独立管理窗口 / 批量处理窗口：Path 9
- 要做窗口内大表格：Path 9 + Path 5
- 要做工作台 / 多分栏 pane：Path 4，必要时叠加 Path 5
- 要做大列表选择器：Path 5
- 官方 surface 不够：最后才进 Path 7
- 要嵌完整前端应用：Path 8

## Reference Snapshot Note

- `reference/plugin/*` 是本地只读参考，不是主仓事实源。
- 当参考项目与 Zotero 当前 authoritative source 冲突时，以本仓 `reference/zotero-main` 和相关 host contract 文档为准。
- 引用参考项目时，优先提炼“技术路径”和“关键节点”，不要直接复制其产品实现。
- 需要回溯某个参考项目为什么被映射到某条路线时，再看 [docs/REFERENCE_PLUGIN_UI_ANALYSIS.md](./REFERENCE_PLUGIN_UI_ANALYSIS.md)。
