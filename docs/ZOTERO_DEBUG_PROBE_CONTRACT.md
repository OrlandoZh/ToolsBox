# Zotero Debug Probe Contract

本文档定义一条**推荐新增**的调试支线：`debug probe`。

它回答的问题不是“当前主线如何验证”，而是：

1. 主线失败后，什么时候值得继续自动追问
2. 追问时应优先调用哪些已有能力
3. 如何限制预算、变更面和输出形态，避免把主线开发拖成一条无限调试链

它不是 current truth，也不直接改变 `agent:gate` 语义。

当前主线、当前 blocker、当前 active wave 仍以以下文件为准：

- `docs/CURRENT_BACKLOG.md`
- `config/project-expansion-wave.json`
- `config/project-validation-overrides.json`
- `config/project-validation-surfaces.json`

## 结论先看

最适合当前模板的形态不是“agent 打开 Browser Toolbox，自由操作 Console UI”，而是：

- 继续把 `watch -> e2e -> monitor -> gate` 保持为主线
- 在主线失败后，按条件触发一条**预算受控、默认只读、结果结构化**的 `debug probe` sidecar
- probe 只在已有失败信号明确指向某个 host-visible surface 或某个已知交互链时启动
- probe 优先复用已有 `Host Action`、`Agent Scenario`、`evaluateInChrome()` 和 runtime log bridge
- probe 默认只提升解释力和成熟度标签，不直接改写 `gate` 的阻断语义

换句话说：

- 主线负责“判定是否失败”
- probe 负责“把失败从模糊现象压缩成可执行根因信号”
- 人工只在 probe 仍无法闭环时介入

## Non-Goals

当前不建议把 `debug probe` 做成以下形态：

- 通用 UI 宏录制器
- 任意按钮点击器
- 任意 JS shell
- 每轮 `watch` 热重载后都自动跑的重型调试器
- 替代 `surface smoke`、`surface-local evidence`、`strict visual` 或 `agent:gate` 的第二条主线

## Position In The Flow

推荐的编排层级如下：

1. 主线验证层
   - `check`
   - filtered `zotero:scenario`
   - `agent:zotero:e2e`
   - `agent:monitor`
   - `agent:gate`
2. 调试探针层
   - 仅在失败后按条件触发
   - 只对匹配的 surface / fingerprint 执行有限追问
3. 人工兜底层
   - probe 无法把结论收敛时再介入

推荐的执行顺序固定为：

1. `Host Action replay`
2. `Agent Scenario snapshot`
3. read-only `evaluateInChrome(...)`
4. runtime log query
5. 现有 `surface-local evidence` / route-aware `domContract` 补充读取

只有在更高层拿不到答案时，才进入更底层的自由度更高的能力。

## Terms

- `probe`
  - 一次受控的自动追问执行
- `probe bundle`
  - 与某个 surface / feature 绑定的一组动作、快照和选择器探针定义
- `probe candidate`
  - 主线失败后，基于失败信号判定“值得继续追问”的候选项
- `promotion`
  - probe 执行后，对成熟度标签做出的提升，例如从 `behavior-ready` 提升到 `interaction-proved`
- `advisory`
  - probe 默认产物类型；它增加解释力，但不自动新增 gate blocker

## Trigger Policy

### 允许自动触发的情况

- 某个真实 host-visible surface 的动作链失败
  - 例如 `reader sidebar view`
  - 例如 `renderToolbar` 注入按钮
  - 例如 `preference pane` 控件交互
  - 例如 `menu item` / `collection menu` / submenu
- 某个已有 `Host Action replay` 失败，但 surface 属于 active validation surface
- 某个 host-visible surface 的 smoke 已通过，但用户可见行为仍未闭环
  - 典型例子：按钮存在，但点击后 panel 未正确 show/hide
- 已知 plugin 侧错误日志与某个 bundle 的 `logPatterns` 命中
  - 例如 `ReferenceError`
  - 例如 `pdfDocument is null`
  - 例如某条 feature-specific sentinel 错误
- 同一 `fingerprint + surfaceId` 在同一代码态下连续失败两次

### 禁止自动触发的情况

- `child-exit-before-rdp`
- `rdp-connect-timeout`
- `chrome-evaluation-timeout`
- workspace / provenance / host contract / host semantic guard 失败
- 纯 release-only 问题
  - 例如远端 `updateURL` / `update.json` / 远端上传编排
- 纯 whole-window visual drift，且当前没有 surface-level 行为异常
- 没有任何可定位 surface / capability 的泛化错误

## Budget Model

`debug probe` 的核心不是“能跑更多”，而是“必须知道何时停”。

推荐默认预算：

| 维度 | 推荐上限 | 说明 |
|------|----------|------|
| 每次 `agent:zotero:e2e` | `2` 个 probe bundles | 防止一次失败后进入无限追问 |
| 每个 `surfaceId` | `1` 个 bundle | 同一 surface 本轮不重复问两次 |
| 每个 bundle 的 `Host Action` 步骤 | `<= 3` | 只允许最小动作闭环 |
| 每个 bundle 的 read-only eval | `<= 3` 次 | 不让 probe 演化成任意脚本会话 |
| 每个 bundle 的日志查询 | `1` 次 | 统一走 log bridge / pattern filter |
| 每个 bundle 总耗时 | `20s - 30s` | 超时直接收口为 `probe-incomplete` |

推荐冷却规则：

- 同一 `fingerprint + surfaceId + codeStateKey` 命中后，本轮不再重复
- 只有代码变化、场景变化，或上一轮 probe 结果为 `incomplete` 时才允许再次执行

## Mutability Policy

这是最重要的约束。

### 允许改变状态的能力

只允许通过**已登记的** `Host Action` 改变宿主状态，例如：

- `reader.open`
- `reader.toolbar.triggerButton`
- `reader.sidebar.selectView`
- `preferences.openPane`
- `preferences.setTextbox`
- `preferences.selectMenulist`
- `menu.show`
- `menu.trigger`

原因：

- 这些动作已有 catalog、preconditions、readiness 和结构化结果
- 这条路径与当前 `surface smoke` / action replay 主线一致

### 默认只读的能力

`evaluateInChrome(...)` 在 probe 中默认只允许：

- DOM snapshot
- selector existence
- class / attribute / dataset / visibility state 读取
- runtime state snapshot
- 插件内只读 getter / snapshot API

不建议在 probe 中用 `evaluateInChrome(...)` 做：

- 任意事件派发
- 任意 DOM 改写
- 任意宿主方法直接调用
- 代替 `Host Action` 的写操作

### 推荐的 mutability ladder

1. `Agent Scenario snapshot`
2. `read-only evaluateInChrome`
3. `runtime log query`
4. `Host Action replay`

虽然执行顺序通常是先 replay 再 snapshot，但从治理角度看，写操作权限应始终只来自 cataloged host action。

## Probe Modes

推荐把 probe 模式做成显式枚举，而不是隐式“失败了就多跑一点”。

- `off`
  - 完全禁用
  - 适用于 `check`、`watch`、无关改动、发布态验证
- `smart`
  - 默认推荐模式
  - 只在 failure signal 命中 bundle selector 时自动运行
- `force`
  - 人工调试或最小复现专用
  - 允许按 `probeId` 显式执行

推荐的命令行为：

- `agent:zotero:e2e`
  - 默认 `probeMode=off` 或 `probeMode=smart` 但只在失败尾声执行 advisory probe
- `agent:zotero:loop`
  - 默认 `probeMode=smart`
  - 在 deciding next action 时读取上一轮 `probeCandidates`
- `zotero:scenario`
  - 默认不自动 probe
  - 仅支持人工 `--probe` 或单独运行调试 probe

## Trigger Matrix

| 信号源 | 示例 | 是否自动 probe | 推荐 bundle 类型 | 备注 |
|------|------|------|------|------|
| `Host Action` 失败 | `reader.sidebar.selectView` readiness failed | 是 | `surface-action-postcondition` | 优先级最高 |
| scenario helper timeout | toolbar anchor / popup / panel 等待超时 | 是 | `surface-dom-ownership` | 只针对 active surface |
| plugin 错误日志 | `ReferenceError`, `pdfDocument is null` | 是 | `runtime-error-correlated` | 需命中 bundle `logPatterns` |
| smoke 通过但交互未闭环 | 按钮存在但 show/hide 不成立 | 是 | `interaction-closure` | 最典型 probe 场景 |
| full-window drift | 只有整窗截图漂移 | 否 | 无 | 先回看 surface-local evidence |
| bring-up 失败 | RDP 建联失败 | 否 | 无 | 先修启动链 |
| release-only blocker | `updateURL` 闭环失败 | 否 | 无 | 与 UI probe 无关 |

## Promotion Policy

probe 默认不改 `gate` verdict，但可以提升 host-visible 成熟度标签：

- 若 smoke / domContract 已通过，且 probe 证明动作闭环成立
  - 从 `behavior-ready` 提升到 `interaction-proved`
- 若 probe 只拿到部分信号
  - 保持 `behavior-ready`
  - 并产出 `probe-incomplete` 或 `ownership-ambiguous`
- 若 probe 明确复现同一失败
  - 保持原 blocker
  - 并附带更具体的 `observedState` / selector / log evidence
- 若 probe 仍无法排除“纯人眼可见问题”
  - 标记 `needs-human-confirmation`

## Integration Points

推荐新增四个集成点：

### 1. `agent:zotero:e2e`

负责：

- 识别 `probeCandidates`
- 记录 `surfaceId / fingerprint / log matches / lastFailedAction`
- 在失败尾声以 advisory 方式执行有限 probe

不负责：

- 多轮追问
- 人工等待
- patch / autofix 决策

### 2. `agent:zotero:loop`

负责：

- 在 `smart` 模式下决定是否消耗 probe 预算
- 在 probe 后选择继续 `autofix`、继续 `scenario`、还是进入人工窗口

### 3. `agent:monitor`

负责：

- 展示 `latestProbeSummary`
- 展示 `probeBudgetUsed`
- 展示 `promotion`、`stopReason`、`nextRecommendedAction`

### 4. `agent:gate`

负责：

- 消费 probe 摘要用于解释
- 不默认因为 probe 本身新增阻断
- 仅在 probe 复现并结构化确认已有失败时，把证据写进主摘要

## Recommended Artifact Shape

推荐新增独立工件，例如：

- `dist/agent-zotero-debug-probe.json`
- `dist/agent-zotero-debug-probe.md`

建议 JSON 结构：

```json
{
  "generatedAt": "2026-04-17T00:00:00.000Z",
  "mode": "smart",
  "budget": {
    "bundlesAllowed": 2,
    "bundlesUsed": 1,
    "readOnlyEvalsUsed": 3
  },
  "candidates": [
    {
      "surfaceId": "reader-sidebar-view",
      "fingerprint": "interaction-closure-failed",
      "matchedBundleIds": ["reader-managed-panel-ownership"]
    }
  ],
  "executed": [
    {
      "probeId": "reader-managed-panel-ownership",
      "status": "completed",
      "promotion": "interaction-proved",
      "stopReason": "decisive-signal-observed",
      "observedState": {},
      "logMatches": [],
      "nextRecommendedAction": "rerun-agent-zotero-e2e"
    }
  ]
}
```

## Probe Bundle Contract

推荐每个 bundle 至少包含以下字段：

```json
{
  "probeId": "reader-managed-panel-ownership",
  "surfaceId": "reader-sidebar-view",
  "capabilityId": "host-actions",
  "triggerKinds": [
    "interaction-closure-failed",
    "host-action-postcondition-failed",
    "runtime-error-correlated"
  ],
  "logPatterns": [
    "queueNativeEnhancerSync is not defined",
    "pdfDocument is null"
  ],
  "hostActionSteps": [
    { "actionId": "reader.open", "payloadTemplate": { "itemID": "$attachmentID" } }
  ],
  "scenarioSnapshots": [
    { "name": "reader-current" }
  ],
  "readOnlyEvals": [
    {
      "id": "managed-panel-dom",
      "expression": "JSON.stringify({...})"
    }
  ],
  "expectedSignals": [
    "button-present",
    "managed-panel-present",
    "show-hide-ownership-resolved"
  ],
  "promotionRule": "interaction-proved",
  "stopRule": "first-decisive-signal"
}
```

关键约束：

- `hostActionSteps` 只允许引用 catalog 中已有 action
- `readOnlyEvals` 必须是 bundle 内显式声明的白名单表达式
- `promotionRule` 只能提升成熟度标签，不直接改 `gatePassed`

## First-Wave Probe Bundles

推荐先只做四类，避免一开始扩成第二套平台：

1. `reader-managed-panel-ownership`
   - 处理按钮存在、managed panel show/hide 或 native/managed ownership 冲突
2. `preference-control-writeback`
   - 处理控件看似可用，但 pref writeback / pane theme / geometry 不稳定
3. `menu-live-trigger-postcondition`
   - 处理 menu item / submenu 已出现，但 trigger 后无 postcondition
4. `context-pane-route-ownership`
   - 处理 context pane / item pane surface 出现但根节点归属、连接态或重复挂载异常

## Worked Example

以“AI Outline 按钮点了没反应，且开发者要求人工去 Browser Toolbox 里执行 3 个 `querySelector(...)`”为例，推荐的 bundle 结构如下：

1. `reader.open`
2. 触发 `AI Outline` 的 host action
3. read-only 读取：
   - `#aiassistant-ai-outline-sidebar-button`
   - `#aiassistant-ai-outline-sidebar-panel`
   - `[data-outline-surface="managed-panel"]`
4. 切到 Zotero 原生 `Outline` / `Thumbnail`
5. 再读取 managed panel 是否隐藏
6. 扫 runtime logs：
   - `queueNativeEnhancerSync is not defined`
   - `pdfDocument is null`
7. 输出以下三类结论之一：
   - `interaction-proved`
   - `behavior-ready-but-ownership-ambiguous`
   - `needs-human-confirmation`

这类问题最适合 `debug probe`，因为：

- 主线 smoke / test / scenario 可能已经都通过
- 但最终交互闭环仍未被坐实
- 继续让人类手工粘贴 DOM 查询，性价比最低

## Implementation Recommendation

如果进入实现，建议按下面顺序推进：

1. 新增独立命令
   - `agent:zotero:debug-probe`
2. 只接入 `smart` 和 `force` 两档
3. 先消费现有：
   - `runHostAction()`
   - `runAgentScenario()`
   - `evaluateInChrome()`
   - runtime log bridge
4. 第一期只支持首批 `4` 个 bundles
5. `agent:zotero:e2e` 只在失败尾声调一次，不在成功轮次调用
6. `agent:monitor` / `agent:gate` 先以 advisory 方式消费产物

## Decision Summary

最适合当前模板的方案是：

- 把 `debug probe` 设计成**失败触发的受控 sidecar**
- 不把它并入每轮主线
- 不把它开放成任意 JS shell
- 不让它覆盖现有 `gate` 语义
- 用它把“人工 console 复测指令”收编成“结构化 probe bundle”

这样既能避免过度调用，也能在真正需要的时候及时自动追问。
