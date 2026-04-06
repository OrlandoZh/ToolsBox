# Reference Plugin UI Analysis

本文件用于记录 `reference/plugin/` 中新增参考项目的 UI 方法分析依据、可复用技术点与路径映射，供 agent 在需要来源追踪时只读查阅。

本文不是 project truth，也不替代 [docs/UI_CREATION_PATHS.md](./UI_CREATION_PATHS.md) 的路线选型功能。默认先看路径文档；只有在需要回答“为什么把某个参考项目映射到这条路径”时，再回到本文。若你要抽的是窗口、服务、队列、iframe、重资源等跨项目技术链，而不是 UI 路线来源，请改看 [docs/REFERENCE_PLUGIN_TECHNICAL_CHAINS.md](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)。

## 项目清单与判定结果

- `zotero-AI-Butler-main`：新增参考，已纳入当前 UI 路线分析
- `zotero-addons-main`：新增参考，已纳入当前 UI 路线分析
- `zotero-format-metadata-main 2`：与已有 `zotero-format-metadata-main` 内容一致，只记为 duplicate，不重复纳入路径统计

## `zotero-AI-Butler-main`

### 主要 UI surface

- Item Pane section / sidenav：
  [src/modules/ItemPaneSection.ts](../reference/plugin/zotero-AI-Butler-main/src/modules/ItemPaneSection.ts)
- Reader `renderToolbar` 手工注入与 library toolbar 增量注入：
  [src/hooks.ts](../reference/plugin/zotero-AI-Butler-main/src/hooks.ts)
- 独立批量扫描窗口：
  [src/modules/libraryScannerDialog.ts](../reference/plugin/zotero-AI-Butler-main/src/modules/libraryScannerDialog.ts)
- iframe/html viewer mindmap 预览：
  [addon/content/mindmapViewer.html](../reference/plugin/zotero-AI-Butler-main/addon/content/mindmapViewer.html)
  [addon/content/mindmap.html](../reference/plugin/zotero-AI-Butler-main/addon/content/mindmap.html)

### 主要 UI 原语 / 创建方式

- 用 `Zotero.ItemPaneManager.registerSection(...)` 注册宿主 section，再在 `body.ownerDocument` 内手工构造复杂 HTML 侧栏
- 用 `registerEventListener` 的 `renderToolbar` 事件和主窗口 toolbar DOM 增量注入按钮
- 用 `openDialog(...)` 打开 `standalone.xhtml` 风格窗口，在子窗口 document 中渲染树形视图与批量操作 UI
- 用 `iframe + html viewer + postMessage` 把 mindmap viewer 与实际渲染页拆成两层

### 生命周期与 cleanup 特征

- Item Pane section 依赖宿主 section 生命周期，内部仍需要自己管理 refresh、timer、task 完成回调和局部状态
- Reader toolbar 手工注入需要重复挂载防重与窗口切换时的显式去重
- `openDialog(...)` 路线先等窗口 `load` / ready，再向子窗口 document 写入内容
- iframe viewer 依赖 `postMessage` ready handshake，并且在窗口关闭时需要同步结束导出、事件监听和 viewer state

### 可复用技术点

- Item Pane section 可以承载复杂 HTML micro-app，不必一开始就跳到 iframe 或 XUL custom element
- Reader 与 library toolbar 的增量注入可抽象成 host patch / augment，而不是误判为官方注册式 surface
- 独立批量处理窗口适合单独建模为 standalone dialog / window shell，再把具体树视图或大面板挂进去
- mindmap viewer 展示了“外层 viewer shell + 内层 iframe app + message bridge”的隔离套路

### 不应照抄的产品实现

- 不照抄该项目的产品布局、文案、AI 管家业务流或具体任务队列命名
- 不照抄其侧栏 DOM 细节、交互顺序、样式结构或 prompt/summary 业务语义
- 不把与该产品耦合的 markdown、导出或自动刷新策略直接带入模板

### 对应映射到 `UI_CREATION_PATHS` 的路径编号

- Path 3 `HTML Micro-App Panel`
- Path 7 `Host Patch / Augment`
- Path 8 `Isolated Iframe / Embedded App`
- Path 9 `Standalone Dialog / Window Shell`

## `zotero-addons-main`

### 主要 UI surface

- `menuTools` 菜单入口与主窗口 toolbar 增量入口：
  [src/modules/addonTable.ts](../reference/plugin/zotero-addons-main/src/modules/addonTable.ts)
- Addons 主窗口：
  [src/modules/addonTable.ts](../reference/plugin/zotero-addons-main/src/modules/addonTable.ts)
- Addon 详情窗口：
  [src/modules/addonDetail.ts](../reference/plugin/zotero-addons-main/src/modules/addonDetail.ts)
  [addon/content/addonDetail.xhtml](../reference/plugin/zotero-addons-main/addon/content/addonDetail.xhtml)
- 历史版本窗口：
  [src/modules/historicalVersions.ts](../reference/plugin/zotero-addons-main/src/modules/historicalVersions.ts)

### 主要 UI 原语 / 创建方式

- 用 `ztoolkit.Menu.register(...)` 注入菜单入口
- 用 clone / insert 现有 toolbar 按钮的方式给主窗口补入口
- 用 `openDialog(...) + _initPromise` 打开多个独立窗口，并通过 `focus()` / reuse 复用已打开窗口
- 用 `VirtualizedTable` 作为窗口内主表格骨架
- 在 `addonDetail.xhtml` 中直接加载外部脚本和样式，承载外部 widget / bundle

### 生命周期与 cleanup 特征

- 多个窗口共享“已打开则 focus，否则重建”的复用策略
- 每个窗口都依赖 `_initPromise` 或等价 ready gate，避免在子窗口 DOM 未就绪前初始化 UI
- 子窗口关闭时还会级联关闭相关窗口，体现了 window ownership 与 cleanup 链
- `VirtualizedTable` 与外部 widget 都不是单独路线，它们依赖各自所属窗口的 close / unload 生命周期

### 可复用技术点

- “入口注入 + 独立管理窗口 + 子级详情窗口 + 历史版本窗口”这类管理台架构，很适合抽象为 Path 9 + Path 5 的组合
- `_initPromise` 展示了窗口 shell 的最小 ready gate 约定，适合作为模板里 route-specific validator 的重点节点
- toolbar clone / insert 是典型 augment，不应与 menu item 的官方注册式 surface 混写
- chrome page 中加载外部脚本的细节提醒我们要单独考虑 embedded widget lifecycle

### 不应照抄的产品实现

- 不照抄插件市场的产品信息架构、详情布局、按钮集合或远端服务耦合逻辑
- 不照抄具体列定义、下载行为、兼容性文案或市场站点绑定方式
- 不把其窗口链式关闭策略、快捷键或品牌语义直接当作模板默认值

### 对应映射到 `UI_CREATION_PATHS` 的路径编号

- Path 2 `ztoolkit 声明式 UI DSL`
- Path 5 `Virtualized List / Table`
- Path 7 `Host Patch / Augment`
- Path 8 `Isolated Iframe / Embedded App`
- Path 9 `Standalone Dialog / Window Shell`

## `zotero-format-metadata-main 2`

### 主要 UI surface

- 不单列新 surface；该目录仅作为重复副本记录

### 主要 UI 原语 / 创建方式

- 与已有 `zotero-format-metadata-main` 一致

### 生命周期与 cleanup 特征

- 不新增分析口径

### 可复用技术点

- 无；避免把同一来源重复计入路径统计

### 不应照抄的产品实现

- 无新增内容

### 对应映射到 `UI_CREATION_PATHS` 的路径编号

- 不重复映射；以已有 `zotero-format-metadata-main` 统计结果为准

## 新增参考带来的 taxonomy 变化

这批新增参考最重要的变化，是把 `Standalone Dialog / Window Shell` 明确抽成了 Path 9。

边界应这样理解：

- Path 9 `Standalone Dialog / Window Shell`：
  关注的是 `openDialog(...)` 打开的独立窗口壳、ready gate、focus / reopen、window cleanup。
- Path 3 `HTML Micro-App Panel`：
  关注的是某个现有 surface body 内的复杂 HTML 面板，不天然等于独立窗口。
- Path 5 `Virtualized List / Table`：
  关注的是大列表 / 表格原语，既可以挂在主窗口，也可以挂在 Path 9 的子窗口里；它不是窗口壳本身。
- Path 8 `Isolated Iframe / Embedded App`：
  关注的是 iframe / viewer / 外部 widget 的隔离运行时，它可以被 Path 9 的窗口承载，但不等于窗口生命周期本身。

因此，这批参考并不是把既有 Path 3 / 5 / 8 推翻重写，而是补足了一个此前没有显式命名的外层窗口壳路线。
