# 场景覆盖矩阵

本文档列出当前 Zotero 真机验收场景的覆盖情况，按 surface 和功能域分类。

## 命名约定

- **验证类型**：
  - `functional-only` — 功能闭环即可，不需要视觉证据
  - `visual-recommended` — 先功能闭环，后补视觉证据
  - `visual-required` — 真实 host-visible surface 变动，必须视觉证据
- **状态**：
  - `covered` — 已有场景脚本 + 对应验证路径
  - `partial` — 有脚本但覆盖不完整
  - `missing` — 尚未编写场景

## 已覆盖场景

### 启动 / 注册

| 场景 | 脚本 | 验证类型 | 状态 |
|---|---|---|---|
| 插件基础注册（menu / pane / notifier） | `baseline.scenario.js` | functional-only | covered |
| 真实条目选择 | `baseline.scenario.js` | functional-only | covered |

### Surface Smoke（可见面冒烟）

| 场景 | 脚本 | 验证类型 | 状态 |
|---|---|---|---|
| Item Pane 可见面 | `item-pane-surface-smoke.scenario.js` | visual-required | covered |
| Context Pane 可见面 | `context-pane-surface-smoke.scenario.js` | visual-required | covered |
| Preference Pane 可见面 | `preferences-surface-smoke.scenario.js` | visual-required | covered |
| Reader 可见面 | `reader-surface-smoke.scenario.js` | visual-required | covered |
| 主菜单注入 | `menu-surface-smoke.scenario.js` | visual-required | covered |
| 集合右键菜单 | `collection-menu-surface-smoke.scenario.js` | visual-required | covered |
| 子菜单展开 | `menu-submenu-surface-smoke.scenario.js` | visual-required | covered |

### 偏好设置

| 场景 | 脚本 | 验证类型 | 状态 |
|---|---|---|---|
| 偏好设置面板基础 | `preferences.scenario.js` | functional-only | covered |
| 偏好控件交互 | `preferences-control-interaction.scenario.js` | functional-only | covered |

### Reader 交互

| 场景 | 脚本 | 验证类型 | 状态 |
|---|---|---|---|
| Reader 事件钩子 | `reader-event-hooks.scenario.js` | functional-only | covered |
| Reader 细粒度钩子 | `reader-fine-grained-hooks.scenario.js` | functional-only | covered |
| Reader 交互 | `reader-interaction.scenario.js` | partial | partial |
| Reader 标注往返 | `reader-annotation-roundtrip.scenario.js` | partial | partial |

### DOM Contract（当前 wave）

| 场景 | 脚本 | 验证类型 | 状态 |
|---|---|---|---|
| Item Pane DOM Contract | `item-pane-dom-contract.scenario.js` | visual-recommended | covered |

### 性能

| 场景 | 脚本 | 验证类型 | 状态 |
|---|---|---|---|
| 性能预算 | `performance-budget.scenario.js` | functional-only | covered |

### Runtime / Wasm

| 场景 | 脚本 | 验证类型 | 状态 |
|---|---|---|---|
| Wasm 小内核探针 | `wasm-kernel-probe.scenario.js` | functional-only | covered |

### 多窗口

| 场景 | 脚本 | 验证类型 | 状态 |
|---|---|---|---|
| 多窗口同步 | `multi-window.scenario.js` | partial | partial |

## 缺失场景

### 启动 / 挂载

| 场景 | 验证类型 | 优先级 | 备注 |
|---|---|---|---|
| 冷启动失败恢复路径 | functional-only | high | 模拟插件启动失败后的自动恢复 |
| 热重载回归 | functional-only | high | 源码变更后 watch-recovery 是否生效 |
| 多窗口同时启动 | functional-only | medium | 多个 Zotero 窗口同时加载插件 |

### 真实条目操作

| 场景 | 验证类型 | 优先级 | 备注 |
|---|---|---|---|
| 条目创建 → 编辑 → 删除完整链路 | functional-only | high | 涉及 notifier 全量事件 |
| 批量条目操作 | functional-only | medium | 多选、批量标签、批量移动 |
| 附件添加与预览 | functional-only | medium | PDF 附件拖入、预览渲染 |
| 标签与分类操作 | functional-only | medium | 标签创建、筛选、收藏 |

### 深度 Reader 交互

| 场景 | 验证类型 | 优先级 | 备注 |
|---|---|---|---|
| 标注创建 → 编辑 → 同步回 Item Pane | functional-only | high | 标注数据双向同步 |
| 高亮 / 笔记 / 图片标注多类型覆盖 | functional-only | medium | 当前 reader-interaction 覆盖不完整 |
| Reader 内搜索 | functional-only | low | 全文搜索与高亮匹配 |

### 偏好变更传播

| 场景 | 验证类型 | 优先级 | 备注 |
|---|---|---|---|
| 偏好变更后 UI 实时更新 | functional-only | medium | 修改偏好后不重启 Zotero 是否生效 |
| 偏好重置恢复 | functional-only | low | reset 后恢复默认行为 |

### 错误恢复回归

| 场景 | 验证类型 | 优先级 | 备注 |
|---|---|---|---|
| autofix 成功路径回归 | functional-only | high | 验证 agent:zotero:autofix 能修复典型 E2E 失败 |
| autofix 失败路径 graceful degradation | functional-only | medium | autofix 也无法修复时是否正确上报 |
| watch 断线重连 | functional-only | medium | 文件监听进程重启后是否重新生效 |

### 发版 / 版本矩阵

| 场景 | 验证类型 | 优先级 | 备注 |
|---|---|---|---|
| stable 通道安装回归 | functional-only | high | `release:install-smoke:stable` |
| beta 通道安装回归 | functional-only | medium | `release:install-smoke:beta` |
| 远程更新路径 | functional-only | high | 旧版本 → 新版本 via updateURL（当前 blocker） |

## 场景脚本骨架约定

每个 `.scenario.js` 文件遵循以下结构：

```js
registerZoteroScenario("场景名称", async ({ assert, helpers, plugin }) => {
  // 1. Setup：通过 helpers 准备数据或状态
  // 2. Act：触发用户行为或系统事件
  // 3. Assert：通过 assert 验证结果
  // 4. Return：返回诊断数据供 E2E 报告采集
  return { /* diagnostic data */ };
});
```

新增场景时：
1. 在 `zotero-scenarios/` 下创建 `.scenario.js` 文件
2. 在本矩阵的"已覆盖场景"表格中追加一行
3. 根据验证类型确认 `config/project-validation-overrides.json` 是否需要新增 override
