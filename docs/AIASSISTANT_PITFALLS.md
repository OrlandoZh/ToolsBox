# AIAssistant 踩坑经验与模板化改进

这份文档只记录 AIAssistant 项目里已经真实踩过、并且值得固化到 Zotero 插件模板的坑，不记录产品级业务决策。

## 当前 authoritative 入口

- 当前 Preference Pane contract 以 [PREFERENCE_PANE_GUIDE.md](./PREFERENCE_PANE_GUIDE.md) 为准
- 当前 host-visible 验收成熟度标签以 [UI_VALIDATION_PATHS.md](./UI_VALIDATION_PATHS.md) 为准
- 本文只负责解释这些 guardrail 为什么存在，不替代 project truth、validation override 或 gate 结论

## 结论

从 AIAssistant 回看，最容易反复踩坑的不是业务逻辑，而是 Zotero 宿主 contract、XUL/Fluent 细节和 host-visible 验证路径。模板层最该做的不是“帮你写完整产品”，而是尽早把这些坑变成默认护栏。

本轮已固化到模板的改进：

- ItemPane `registerSection()` 现在要求显式提供 `onRender`
- baseline locale 示例改为宿主真实语义：`header.l10nID -> .label`，`sidenav.l10nID -> .tooltiptext`
- locale baseline / patch 生成链已同步新的 Fluent block 格式
- API 文档补充了 `registerSection()` 返回值和 `onRender` / `onAsyncRender` 的职责分离

## 真实坑点

### 1. 把 `registerSection()` 的返回值当成对象

症状：

- 卸载或清理阶段报错
- 代码里误写成 `registeredSection.unregister()`

根因：

- `Zotero.ItemPaneManager.registerSection()` 返回的是注册后的 pane ID 字符串，不是带方法的对象

模板化结论：

- 包装层和文档都要强调“保存返回的 pane ID，并把它传给 `unregisterSection()`”

### 2. 把首屏 UI 放到 `onAsyncRender()`

症状：

- Item Pane 按钮可见，但面板内容空白
- 异步回调被打断时首屏没有任何 UI

根因：

- ItemPane 的同步生命周期和异步生命周期职责混淆

模板化结论：

- `onRender()` 必须负责初始 DOM 构建
- `onAsyncRender()` 只负责补充耗时数据、异步内容或延迟刷新
- 模板直接拒绝没有 `onRender()` 的 section 注册

### 3. Fluent 写成直接 value，忽略 `.label` / `.tooltiptext`

症状：

- header/sidenav 文案渲染异常
- 按钮上直接出现文本，或者 tooltip 行为不对

根因：

- `header.l10nID` 和 `sidenav.l10nID` 对应的不是同一种 Fluent 绑定

模板化结论：

- `header.l10nID` 对应 `.label`
- `sidenav.l10nID` 对应 `.tooltiptext`
- baseline locale 文件和自动修复链都要按这个 contract 输出

### 4. 偏好页资源路径、XUL 形态和脚本加载上下文混淆

症状：

- 偏好页能注册但加载失败
- `onload` 找不到函数
- HTML 控件在 XUL pane 中行为异常

根因：

- 少了 `content/` 前缀
- 把 fragment 当成完整 XML 文档
- 把控制器放进 `scripts` sandbox，再指望 window 作用域直接访问

模板化结论：

- preference pane 资源默认走 `content/*`
- fragment 不带 XML declaration
- 控制器优先通过 `onPreferenceLoad(context)` + `Services.scriptloader.loadSubScript(..., window)` 注入到 window 上下文

### 5. host-visible 验证不能停留在“资源存在”或“pane 已注册”

症状：

- 真机里 pane 打开了，但 tab/控件交互仍然超时
- 验证链误把“存在”当成“可用”

根因：

- wrapper root、interactive root、live control surface 混在一起判断

模板化结论：

- 偏好页、context pane、reader toolbar 这类 surface 必须走 host-visible smoke
- 只看 `registered`、`src exists`、`XHTML exists` 不够
- 先证明 live surface 可见、可切换、可操作，再补视觉证据

## 仍然保留的风险

- locale 自动修复现在已能生成正确的 Fluent block，但对“旧格式 direct value 和新格式 attribute block 混用”的回写路径仍偏保守
- 如果后续模板引入多 tab preference pane，最好再把 interactive root / active tab 的 host smoke 固化成单独 helper

## 使用建议

- 做 ItemPane / Reader 侧栏时，先看宿主 contract，再写 UI
- 做 preference pane 时，先确认 XUL + bridge + host smoke 三件事都成立
- 只有真实可见面改动，才升级到视觉阻断；先把 host-visible surface smoke 做实
