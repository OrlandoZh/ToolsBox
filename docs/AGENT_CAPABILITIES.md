# Agent 能力地图

本文档记录当前模板已接通的 agent 能力清单，作为“功能入口、验证场景、责任文件”之间的映射表。

说明：

- 文档内容对应代码里的 `src/app/capability-manifest.js`
- 这里是人类可读版本，便于开发、排障和后续扩展

## 当前能力

| 能力 ID | 中文名 | 主要入口 | 对应真机场景 | 主要责任文件 |
|------|------|------|------|------|
| `baseline-registration` | 基线注册 | `plugin.api.agent.collectDiagnostics()` | `baseline registration diagnostics` | `src/app/feature-composer.js` |
| `item-presentation` | 条目展示摘要 | `plugin.api.agent.inspectItem(itemID)` | `real item selection diagnostics` | `src/app/plugin-agent.js` |
| `notifier-sync` | 通知器联动 | `plugin.api.agent.collectDiagnostics()` | `real notifier follows item updates` | `src/core/notifier.js` |
| `reader-summary` | Reader 摘要与交互快照 | `plugin.api.reader.openReader(...)`、`plugin.api.agent.inspectReader(itemID)` | `real reader summary on generated pdf`、`reader interaction diagnostics` | `src/features/reader.js` |
| `reader-annotation-roundtrip` | Reader 批注回环 | `plugin.api.reader.createAnnotation(...)`、`updateAnnotation(...)`、`deleteAnnotation(...)` | `reader annotation roundtrip` | `src/features/reader.js`、`zotero-scenarios/reader-annotation-roundtrip.scenario.js` |
| `reader-ui-state` | Reader UI 状态 | `plugin.api.reader.getReaderUIStateSnapshot(...)`、`plugin.api.agent.inspectReader(itemID)` | `reader interaction diagnostics` | `src/features/reader.js`、`zotero-scenarios/reader-interaction.scenario.js` |
| `reader-event-hooks` | Reader 事件桥 | `plugin.api.reader.registerEventListener(...)`、`unregisterAllEventListeners()`、`plugin.api.agent.runScenario("reader-current")` | `reader event hook diagnostics`、`reader fine-grained hook diagnostics` | `src/features/reader.js`、`src/app/plugin-agent.js`、`zotero-scenarios/reader-event-hooks.scenario.js`、`zotero-scenarios/reader-fine-grained-hooks.scenario.js` |
| `command-nonblocking` | 无阻塞动作执行 | `plugin.api.runAgentAction()` | `agent action runs without blocking UI` | `src/features/menu-command.js` |
| `settings-governance` | 设置治理 | `plugin.api.settings.listDefinitions()` | `settings schema and preference pane diagnostics` | `src/settings/schema.js`、`src/settings/store.js` |
| `multi-window-mount` | 多窗口挂载 | `plugin.api.host.listMainWindows()` | `multi-window mount diagnostics` | `src/platform/zotero-host.js`、`src/features/window-manager.js` |
| `runtime-bridge-report` | 运行时桥接报告 | `plugin.api.runtime.getCapabilitySummary()` | 当前无单独 scenario | `src/app/runtime-capabilities.js`、`addon-static/bootstrap.js` |

## 基线自检补充

`2026-03-21` 起，`baseline-registration` / `collectDiagnostics()` 还会附带一组更细的 ItemPane 基线健康信号：

- `itemPaneL10nOK`
  - ItemPane 基线 `l10nID` 是否仍与模板约定一致
- `itemPaneL10nDriftCount`
  - 当前检测到的漂移数量
- `itemPaneL10nDrifts`
  - 漂移明细，当前覆盖：
  - `InfoRow label`
  - `Section header`
  - `Section sidenav`

这组信号的意义不是“看文案翻译是否更好”，而是让 agent 能识别 `feature-composer.js` 里是否出现了 `l10nID typo`，从而进入受限白名单补丁闭环。

## E2E 侧资源体检补充

`2026-03-21` 起，`agent:zotero:e2e` 还会在 Node 侧补做一层 locale 资源体检，直接检查仓库中的 `addon-static/locale/*/main.ftl`：

- `localeFTLOK`
  - FTL 基线 key 是否完整
- `localeFTLMissingCount`
  - 当前缺失 key 数量
- `localeFTLMissingEntries`
  - 缺失明细，当前聚焦 ItemPane 基线 key，并保留 `key-missing / file-missing`
- `localeFTLValueDriftCount`
  - 当前 value 漂移数量
- `localeFTLValueDriftEntries`
  - value 漂移明细，当前聚焦 ItemPane 基线 key

这层检查不依赖 Zotero 运行时是否正好把缺失 key 渲染出来，适合进入“资源缺 key -> 受限 append 补丁 -> 重启复验”以及“locale 文件缺失 -> 受限 create 补丁 -> 重启复验”的 clean-room 闭环。

## 当前内建 agent 场景

这些场景可直接通过 `plugin.api.agent.runScenario(name, payload)` 调用：

| 场景 ID | 中文理解 | 主要用途 |
|------|------|------|
| `baseline-registration` | 基线注册快照 | 读取默认 demo 挂载状态与 ItemPane 基线本地化漂移 |
| `capability-manifest` | 能力地图快照 | 读取结构化能力清单 |
| `sample-item-pane` | 条目展示快照 | 检查条目标题/摘要/列值 |
| `settings-snapshot` | 设置治理快照 | 读取 settings schema 与偏好面板状态 |
| `notifier-preview` | 通知器预演 | 模拟 notifier 诊断更新 |
| `reader-current` | Reader 当前状态 | 获取 Reader 摘要、交互/UI 状态快照、窗口状态，以及 Reader 事件桥结构化报告 |
| `window-snapshot` | 窗口挂载快照 | 读取主窗口数量与窗口级挂载状态 |
| `command-no-ui` | 无 UI 动作执行 | 触发不弹窗的 agent 动作 |

## 新增的真机场景

`2026-03-22` 起，`zotero-scenarios/` 默认覆盖 11 类场景：

1. `baseline registration diagnostics`
2. `real item selection diagnostics`
3. `real notifier follows item updates`
4. `real reader summary on generated pdf`
5. `reader interaction diagnostics`
6. `reader annotation roundtrip`
7. `reader event hook diagnostics`
8. `reader fine-grained hook diagnostics`
9. `settings schema and preference pane diagnostics`
10. `multi-window mount diagnostics`
11. `agent action runs without blocking UI`

## 扩展建议

新增能力时，建议同步补齐这三层：

1. 在 `src/app/capability-manifest.js` 添加能力元数据
2. 在 `zotero-scenarios/` 或 `zotero-tests/` 添加对应验收
3. 在诊断/门禁链路里把该能力映射到候选文件和责任边界
