# Preference Pane Guide

模板默认把 Zotero `PreferencePanes` 收口为：

- 注册入口优先使用 `onPreferenceLoad(context)`
- `scripts` 仅保留 legacy 兼容，不再作为模板默认路径
- 偏好设置 fragment 继续使用 `content/` 前缀资源
- 偏好页控制器继续只依赖 `addon-static/content/*` helper，不直接 import `src/` ESM

## 推荐加载顺序

1. `PreferencePanes.register()` 仍由模板包装层调用 Zotero 原生 API
2. 模板内部 bridge 会在 pane 真正 `load` 后触发 `onPreferenceLoad(context)`
3. `onPreferenceLoad(context)` 中通过 `Services.scriptloader.loadSubScript(resolveURI(...), window)` 加载静态 helper
4. 最后显式调用 `window.initCleanroomPreferences(options?)`

`context` 固定包含：

- `window`
- `paneID`
- `pluginID`
- `resolveURI(uri)`

## 静态资源约束

- `addon-static/content/preferences.xhtml` 是 XUL fragment，不要保留 `<?xml version="1.0"?>`
- 偏好页 fragment 顶层继续保持最小单页表单；多页 `data-pref-tab / data-pref-panel` 仅作为高级扩展模式
- 若需要窗口 bridge，可使用可选的 `window.__CLEANROOM_PREFERENCE_BRIDGE__`
- bridge 最小字段固定为 `addonRef`、`pluginID`、`instanceKey`

## 控制器约束

- `preferences.js` 应暴露显式入口 `window.initCleanroomPreferences(options?)`
- 入口必须幂等：重复调用时先清理旧 observer / listener 再重挂
- 主题、pref、bridge 等控制逻辑都走 `addon-static/content/*` helper
- 不要扫描 `globalThis.Zotero` 猜测插件实例；只读显式 bridge 或 `window.__CLEANROOM_PREFERENCE_BRIDGE__`

## 真机验证

模板当前提供三类可执行 preference control host actions：

- `preferences.setCheckbox`
- `preferences.setTextbox`
- `preferences.selectMenulist`

它们固定要求：

- 先打开 live preference pane，再操作 live control element
- 返回控件前后状态、pref 写回状态和 `preference-control` surface-local evidence
- 涉及偏好页控件行为、pref 写回或 `themeMode` 的改动时，不能只保留 `preferences.openPane` smoke

## Degraded / Readonly

- degraded 或 readonly 模式只允许禁用具体控件与动作
- 不要对偏好页根节点使用 `pointer-events: none`
