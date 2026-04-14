# Preference Pane Guide

本文是模板当前的 Preference Pane authoritative guide。

它回答四件事：

- 推荐接线路径是什么
- 哪些做法属于已知反模式
- 当前真机验证怎么分层
- 什么样的证据才能算 Preference Pane pass

历史踩坑原因见 [AIASSISTANT_PITFALLS.md](./AIASSISTANT_PITFALLS.md)；host-visible 验收成熟度标签见 [UI_VALIDATION_PATHS.md](./UI_VALIDATION_PATHS.md)。

## 当前默认路径

模板默认把 Zotero `PreferencePanes` 收口为：

- 注册入口优先使用 `onPreferenceLoad(context)`
- `scripts` 仅保留 legacy 兼容，不再作为模板默认路径
- 偏好设置 fragment 继续使用 `content/` 前缀资源
- 偏好页控制器继续只依赖 `addon-static/content/*` helper，不直接 import `src/` ESM

## 推荐加载顺序

推荐顺序固定为：

1. `PreferencePanes.register()` 仍由模板包装层调用 Zotero 原生 API
2. 模板内部 bridge 会在 pane 真正 `load` 后触发 `onPreferenceLoad(context)`
3. `onPreferenceLoad(context)` 中通过 `Services.scriptloader.loadSubScript(resolveURI(...), window)` 加载静态 helper
4. 最后显式调用 `window.initCleanroomPreferences(options?)`

`context` 固定包含：

- `window`
- `paneID`
- `pluginID`
- `resolveURI(uri)`

## 静态资源与控制器约束

- `addon-static/content/preferences.xhtml` 是 XUL fragment，不要保留 `<?xml version="1.0"?>`
- 偏好页 fragment 顶层继续保持最小单页表单；多页 `data-pref-tab / data-pref-panel` 仅作为高级扩展模式
- 若需要窗口 bridge，可使用可选的 `window.__CLEANROOM_PREFERENCE_BRIDGE__`
- bridge 最小字段固定为 `addonRef`、`pluginID`、`instanceKey`
- `preferences.js` 应暴露显式入口 `window.initCleanroomPreferences(options?)`
- 入口必须幂等：重复调用时先清理旧 observer / listener 再重挂
- 主题、pref、bridge 等控制逻辑都走 `addon-static/content/*` helper
- 不要扫描 `globalThis.Zotero` 猜测插件实例；只读显式 bridge 或 `window.__CLEANROOM_PREFERENCE_BRIDGE__`

## 已知反模式

- 把 `scripts` array 当成默认接线方式，再期待 XUL `onload` 直接读到 window 作用域函数
- 漏掉 `content/` 前缀，导致 `PreferencePanes.register()` 解析到错误资源路径
- 把 fragment 写成完整 XML 文档，并保留 `<?xml version="1.0"?>`
- 在静态 pane controller 中直接 import `src/` ESM，而不是通过 `loadSubScript(..., window)` 走静态 helper
- 把 `registered`、`src exists`、`preferences.xhtml exists` 误当成“偏好页已经可用”

## 验证层级

### 1. Structure Smoke

- `preferences.openPane` 只证明 live preference pane 已打开、root 已挂载、geometry 已稳定
- 它不是控件行为、pref 写回或 `themeMode` 正常的充分证据

### 2. Live Control Evidence

触达以下内容时，必须补 live control interaction：

- checkbox 行为
- textbox 行为
- menulist 行为
- pref writeback
- `themeMode`

模板当前提供三类可执行 preference control host actions：

- `preferences.setCheckbox`
- `preferences.setTextbox`
- `preferences.selectMenulist`

它们固定要求：

- 先打开 live preference pane，再操作 live control element
- 返回控件前后状态、pref 写回状态和 `preference-control` surface-local evidence
- 涉及偏好页控件行为、pref 写回或 `themeMode` 的改动时，不能只保留 `preferences.openPane` smoke

### 3. Route-aware DOM Contract

- 当批次已经触达 route-specific DOM 语义时，优先附 `domContract` 结果，而不是把整窗截图当唯一证明
- 当前 template v1 已覆盖 `preference pane` 的 root marker、`ownerDocument`、连接态、控件归属、pref writeback、无横向溢出等 contract

## PASS 形状

当前模板里，Preference Pane 通过的最小证据形状应满足：

- live root 可见、可挂载且保持连接
- interactive control 可被真实观测，而不是只看到 pane 外层容器
- 触达行为改动时，pref writeback 成立
- 需要时附 route-aware `domContract`，证明文档归属、连接态和局部布局 contract 没漂移

## Degraded / Readonly

- degraded 或 readonly 模式只允许禁用具体控件与动作
- 不要对偏好页根节点使用 `pointer-events: none`
