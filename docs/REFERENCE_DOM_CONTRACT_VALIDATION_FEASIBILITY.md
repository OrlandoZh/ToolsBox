# Reference: DOM Contract Validation Feasibility

> 用途：回答“模板是否值得扩成对任意自定义前端组件做更通用、更深入的 DOM contract 检查，以及在 Zotero 宿主里应如何建模”。
> 这不是 current truth，也不直接改 gate；active wave / validation level / blocker 仍以 `docs/CURRENT_BACKLOG.md` 与 project mirrors 为准。

## 结论先看

结论不是“不可做”，而是：

- **可做，但不能做成脱离 UI 路线的万能 DOM 断言器**
- 更现实的目标是：**一个通用 DOM contract core + 多条 route-specific adapter**
- Zotero 宿主给插件的稳定锚点，不是“任意 DOM 树”，而是按 surface 暴露的：
  - `PreferencePanes` 的 fragment pane
  - `ItemPaneManager` 的 `doc + body + lifecycle hooks`
  - `Reader` 的 `event.doc + append + iframe customEvent`
  - child window 的 `openDialog(...) + ready gate`

因此，若模板要从当前的 `surface smoke + surface-local evidence` 再升级一层，最合理的方向不是“统一扫描所有 DOM”，而是：

1. 抽出一套通用 primitive checks
2. 再为 `preference pane / item pane micro-app / reader surface / window shell / iframe app` 分别提供 adapter

## 本轮参考输入

### Zotero authoritative source

- `reference/zotero-main/chrome/content/zotero/xpcom/preferencePanes.js`
- `reference/zotero-main/chrome/content/zotero/xpcom/pluginAPI/itemPaneManager.js`
- `reference/zotero-main/chrome/content/zotero/xpcom/reader.js`

### 参考插件样本

- `reference/plugin/llm-for-zotero-main/src/modules/contextPanel/buildUI.ts`
- `reference/plugin/zotero-addons-main/src/modules/addonDetail.ts`

## 宿主源码给出的真实锚点

### 1. Preference Pane 不是完整页面，而是 fragment surface

`preferencePanes.js` 明确写了：

- pane `src` 会以 **fragment** 形式加载，而不是完整 document
- 默认 namespace 是 XUL
- `scripts` / `stylesheets` 是伴随 pane 一起加载的资源

这意味着：

- validator 不应假设“它就是一个普通 HTML 页面”
- 更稳定的 contract 是：
  - pane 已从 preferences sidebar 打开
  - interactive root 已出现
  - 关键控件可操作
  - 控件操作后 pref / UI 状态可回读

所以 preference pane 的 DOM contract 应更像“host-mounted fragment contract”，而不是“独立网页 contract”。

### 2. Item Pane 官方 API 直接把 `doc`、`body` 与 lifecycle 暴露给插件

`itemPaneManager.js` 的 hook args 明确包含：

- `doc`
- `body`
- `onInit`
- `onDestroy`
- `onRender`
- `onAsyncRender`

这说明 Item Pane / context-style host surfaces 天然适合做更深的 contract 检查，因为宿主已经把以下锚点给出来了：

- 当前应该使用哪个 `Document`
- 当前 UI 应挂在哪个 `body`
- 生命周期何时开始、何时销毁

因此可扩展出的 route-specific checks 包括：

- root 是否使用 `body.ownerDocument`
- `onRender` 是否建立首帧骨架
- `onAsyncRender` 是否只补异步内容，而不是偷偷承担首帧结构
- `onDestroy` 后 observer / timer / registry 是否释放

### 3. Reader 的稳定锚点不是主窗口 DOM，而是 `event.doc + append`

`reader.js` 显示 Reader 把 iframe 内的 `customEvent` 转成 host event，再通过：

- `event.detail.wrappedJSObject`
- `data.append(...)`
- `data.reader = this`
- `Zotero.Reader.registerEventListener(type, handler, pluginID)`

向插件暴露 Reader surface。

这意味着：

- 对 Reader 的 DOM contract，**主窗口 `document.querySelector(...)` 不是一等真相**
- 更稳定的真相是：
  - 当前 event type 是否被观测
  - handler 是否收到 `event.doc`
  - `append(...)` 后真实追加了什么 element / menu item
  - 是否在错误 document 上建节点

因此 Reader 侧更合理的 validator 是：

- `event.doc` 所属文档正确
- append 的节点类型 / marker / 文本 / menu item label 正确
- duplicate insertion / popup cleanup / listener unregister 可观测

而不是做一个“Reader DOM 全量扫描器”。

#### 2026-04-11 补充：`renderToolbar` 要区分“live host anchor”和“append observability”

本轮再次回读了：

- `reference/zotero-main/chrome/content/zotero/xpcom/reader.js`
- `reference/zotero-main/test/tests/itemPaneTest.js`
- `reference/zotero-main/test/tests/pluginAPITest.js`

可以进一步收敛出一条更稳的 reader v1 建模方式：

- `xpcom/reader.js` 的 authoritative contract 只明确承诺 `event.doc` 与 `append(...Element)` / menu append 能通过宿主桥接交给插件
- `itemPaneTest.js` 体现的 host-visible truth 更接近“reader iframe 里的稳定工具栏锚点是否存在并可点击”，例如 reader toolbar toggle
- `pluginAPITest.js` 侧重的是插件上下文 / append 语义，而不是要求插件追加出来的 DOM 节点必须能被 `frameDocument.getElementById()` 在 live surface 上稳定重找

因此这里更合理的推断是：

- live route 应优先验证 `renderToolbar` 的 host anchor、action replay 与 postcondition
- append 结果是否被真实观测，应放在 `customEvent + append` 的 fine-grained hook route 里验证
- 不应把“plugin marker 必须在 live frame document 里可被 `getElementById()` 重找”升级成 reader v1 contract

这不是在否认 marker append 的价值，而是在把 reader contract 分成两层：

- `surface smoke`：验证 live host anchor 与 action replay
- `fine-grained hooks`：验证 `event.doc`、append 内容、menu append 与 listener cleanup

### 4. Child window 的锚点是 `openDialog(...) + ready gate`

`zotero-addons-main` 的 `addonDetail.ts` 说明子窗口路线的关键不是“窗口打开了”，而是：

- `openDialog(...)` 打开 shell
- `_initPromise` 作为 ready gate
- ready 之后再绑按钮 / link / refresh
- close 时级联 cleanup

因此 window shell 路线的 validator 应关注：

- ready signal 是否达成
- reopen/focus 是否复用已有窗口
- close / unload 后 registry 与 listener 是否清理

而不是只断言 `window !== null`。

## 参考项目给出的实现提示

### HTML micro-app 能支持更通用的结构检查

`llm-for-zotero` 的 `buildUI.ts` 反复体现出三个稳定模式：

- 从 `body.ownerDocument` 派生节点
- 每次 rebuild 前 `replaceChildren()`
- 用 `isConnected` 清理 stale registry entry

这三件事都非常适合沉淀成模板级 DOM contract：

- **document ownership**
- **idempotent rebuild**
- **stale node cleanup**

这说明“更深入的 DOM contract 检查”在 HTML micro-app 路线上是完全可行的，而且 clean-room 风险低。

## 可行的验证模型

### A. 通用 core 只检查 primitive，不检查产品 DOM 细节

建议通用 core 只关心这些跨路线 primitive：

- 当前 root / control / popup 属于哪个 `ownerDocument`
- root marker / interactive root 是否唯一且可重找
- 目标节点是否 `isConnected`
- geometry / visible / overflow / bounds 是否健康
- dispose 后 observer / timer / registry / popup 是否释放
- action replay 后结果是否可回读

这些 primitive 不绑定具体产品布局，适合复用。

### B. 每条 UI 路线提供 adapter

建议至少拆成以下 adapter：

- `preference-pane`
  - pane open
  - interactive root
  - control replay
  - pref write-back
- `item-pane-micro-app`
  - `body.ownerDocument`
  - root rebuild
  - stale node cleanup
  - section destroy cleanup
- `reader-surface`
  - `event.doc`
  - append result
  - popup/menu cleanup
  - listener unregister
- `window-shell`
  - `openDialog`
  - ready gate
  - focus/reuse
  - close cleanup
- `iframe-app`
  - ready handshake
  - message bridge
  - unload cleanup

这比“一个万能 DOM validator”更符合 Zotero 宿主结构。

## 当前模板为什么还没直接做到这一步

`UI_VALIDATION_PATHS.md` 已经点出当前缺口：

- 还没有把 `ownerDocument / event.doc / iframe document` 做成统一 contract
- 还没有把 `build / handlers / refresh / dispose` 分层约束转成稳定信号
- 还没有把 `openDialog ready / child window teardown / iframe unload cleanup` 变成 route validator

所以当前模板的强项仍然是：

- host-visible surface 是否真实可见
- live action replay 是否成功
- surface-local evidence 是否充分

而不是：

- 任意组件内部 DOM / lifecycle 的通用深验

## 实际可行性判断

### 可行部分

- **Path 3 HTML micro-app panel**
  - 可行性最高
  - 因为已有 `body`、`ownerDocument`、host action replay、surface-local evidence
- **Reader quick action / reader surface**
  - 可行性高
  - 因为已有 `event.doc`、`append`、fine-grained hook probe
- **Path 9 window shell**
  - 可行性中高
  - 需要单独把 ready / reuse / cleanup 做成信号

### 可行但不应先承诺“通用化完成”的部分

- **Path 4 XUL custom element workspace**
  - 需要 define-once / `parseXULToFragment(...)` / connected-disconnected contract
- **Path 8 isolated iframe / embedded app**
  - 需要 handshake / unload / bridge cleanup
- **VirtualizedTable / complex widget**
  - 需要表格自己的 selection / data / render lock contract

## 不建议的方向

- 不建议做“跨所有 surface 的统一 `document.querySelector` 大扫描”
- 不建议把产品具体 DOM 层级、className 结构写成模板 contract
- 不建议在尚未进入新 wave 时，把 XUL CE / iframe / window shell / virtualized list 的全套验证直接塞回当前 host polish 结论

## 建议的下一步

如果后续真要进入这条能力建设，建议顺序是：

1. 先补 `item-pane / preference-pane / reader` 三条 adapter
   - 因为它们已经有最稳定的 host anchor
2. 再补 `window-shell`
   - 聚焦 `openDialog -> ready -> focus/reuse -> cleanup`
3. 最后才考虑 `iframe app / XUL custom element / VirtualizedTable`
   - 这些路线对 route-specific validator 依赖更强

## 对模板架构的直接启发

更合理的目标不是：

- “agent 可以检查任意自定义前端组件的一切 DOM 正确性”

而是：

- “模板提供一套 route-aware DOM contract framework，让每条 UI 路线都能声明自己的 document / root / readiness / cleanup / replay contract，并输出统一证据结构”

这条方向在 Zotero 宿主里是**明确可行**的，而且比继续扩大纯视觉阻断更值得做。
