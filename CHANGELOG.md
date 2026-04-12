# Changelog

本项目当前仍处于高频迭代阶段，以下记录以“开发里程碑”为主，而不是严格的发布日志。

## Unreleased

### Added

- 新增 clean-room Zotero 真机链路：
  - `zotero:dev`
  - `zotero:watch`
  - `zotero:test`
  - `zotero:scenario`
  - `zotero:console`
  - `zotero:smoke`
- 新增 agent 闭环：
  - `agent:zotero:e2e`
  - `agent:zotero:autofix`
  - `agent:monitor`
  - `agent:dashboard`
  - `agent:gate`
  - `agent:zotero:loop`
  - `agent:zotero:loop:human`
- 新增 Obsidian 人工介入工作台：
  - 项目架构白板
  - 当前状态总览
  - 证据索引
  - 人工快速上手
  - 高级介入规范
  - 人工指令窗口
- 新增纯项目导出：
  - `npm run export:project`
- 新增 Agent 能力地图：
  - `plugin.api.agent.listCapabilities()`
  - `plugin.api.agent.getCapability(id)`
- 新增白名单补丁计划、补丁草案、预检护栏
- 新增补丁结果归档：
  - `dist/agent-zotero-autofix-history/*.json`
  - `dist/agent-zotero-autofix-history/latest.json`
- 新增最小 agent 记忆层：
  - `dist/agent-memory.json`
  - `dist/agent-memory.md`
  - `agent:memory`
- 新增 agent 记忆归档：
  - `dist/agent-memory/latest.{json,md}`
  - `dist/agent-memory/snapshots/*`
  - `dist/agent-memory/history-index.json`
  - `dist/agent-memory/fingerprints/index.json`
  - `dist/agent-memory/fingerprints/*.json`
  - `dist/agent-memory/reasons/index.json`
  - `dist/agent-memory/reasons/*.json`
  - `dist/agent-memory/signals/index.json`
  - `dist/agent-memory/signals/*.json`
- 新增 ItemPane 基线本地化漂移自检：
  - `itemPaneL10nOK`
  - `itemPaneL10nDriftCount`
  - `itemPaneL10nDrifts`
- 新增本地化引用漂移诊断：
  - `localization:item-pane-info-row-l10n-id-drift`
  - `localization:item-pane-section-header-l10n-id-drift`
  - `localization:item-pane-section-sidenav-l10n-id-drift`
- 新增 locale 资源缺失诊断：
  - `localization:item-pane-info-row-ftl-key-missing`
  - `localization:item-pane-section-header-ftl-key-missing`
  - `localization:item-pane-section-sidenav-ftl-key-missing`

### Changed

- 将模板从早期轻量骨架推进为包含 `kernel / services / settings / capability manifest` 的完整分层结构
- 将真机验证从基础 smoke/test 扩展到真实条目、真实 Reader、视觉基线、恢复回归
- 将受限补丁白名单从旧的 `src/app/plugin.js` 入口对齐到当前真实注册入口 `src/app/feature-composer.js`
- 将受限补丁从“只有草案与写入状态”推进为“规则级复验合同模板 + 中文汇总状态”
- 将受限补丁类别从“注册遗漏”扩展到首个启动链生命周期缺口：`kernel.start()` 中的 `registerBaselineFeatures()` 恢复
- 将受限补丁能力继续扩展到“单点替换 + fresh 复验”的默认配置修正：`config/addon.config.json` 中 `defaultPrefs.enabled` 恢复
- 将受限补丁能力继续扩展到“单点替换 + 规则级复验”的本地化引用修正：`src/app/feature-composer.js` 中 ItemPane 基线 `l10nID` 恢复
- 将受限补丁能力继续扩展到“受限 append + 规则级复验”的 locale 资源修正：`addon-static/locale/*/main.ftl` 中 ItemPane 基线 key 补回
- 将受限补丁能力继续扩展到“受限 create + 规则级复验”的 locale 文件恢复：当白名单 `addon-static/locale/*/main.ftl` 缺失时恢复模板最小基线文件
- 将 locale 资源体检从“只看缺 key / value 漂移”扩展到保留 `file-missing` 细分，便于补丁层选择 append 或 create
- 将 autofix / validation / monitor / dashboard 的中文摘要继续细化，能够展示补丁动作类型以及 `target-file-missing`、`target-file-exists` 等阻塞原因与受影响文件
- 将 patch sandbox 从“只校验白名单目标范围”继续收紧为“按规则重放 canonical drafts 再比对内容”，篡改后的 patch plan 会在预检阶段被拒绝
- 将 Obsidian 人工介入工作台继续细化，当前状态总览、白板和人工窗口已能直接展示补丁计划状态、动作摘要、应用状态与阻塞原因
- 将 autofix 补丁归档继续细化，当前会记录补丁功能、动作类型、涉及文件、阻塞原因与复验失败项，便于后续记忆层和趋势层直接消费
- 将 agent 闭环从“只看当前轮”推进到“开始利用历史经验”：当前 `monitor / dashboard` 已展示故障记忆、修复结果记忆与当前故障历史画像
- 将 agent 记忆层继续推进到“趋势 + 归档”阶段：当前 `monitor / dashboard` 已展示近期趋势、最近样本，并可按归档目录回看历史快照
- 将 agent 趋势层继续推进到“多信号趋势”阶段：当前 `watch / e2e / autofix / watchRecovery / gate` 已会归档到 `agent-memory/signals/`，并在 dashboard 上展示最近状态与趋势方向
- 将多信号趋势继续细化到“关键异常指标”层：当前可直接看到如 `失败步骤`、`恢复尝试`、`阻断项` 等指标的最新值
- 将 agent 记忆层继续推进到“阻塞原因趋势”阶段：当前会沉淀 autofix 历史里的 blocker reason，并开始吸收 `watch / e2e / gate / watchRecovery` 历史原因，在 monitor / dashboard 展示“阻塞原因趋势”
- 将阻塞原因趋势继续细化到“稳定分类键”层：当前会把常见 `watch / e2e / gate / watchRecovery` 文案归一化为稳定原因键，避免同类问题因句式差异被切碎统计
- 将 agent 记忆层继续推进到“历史推荐 + 指纹时间序列”阶段：当前会为重点指纹写入独立归档，输出趋势摘要、最近结果与最近路径，并在 monitor / dashboard 展示“重点指纹时间序列”
- 将人工介入文档从单文件说明拆分为：
  - `03-模板协作-人工快速上手.md`
  - `04-模板协作-高级介入规范.md`
- 刷新框架检查与综合评估文档，使其对齐当前真实状态

### Notes

- 当前项目已具备“自动验证 + 自动恢复 + 人工介入”的 agent-assisted 开发闭环
- 当前下一阶段重点是：
  - 扩大 `P1` 白名单受控补丁能力
  - 把 `P2` 从当前多信号状态趋势继续扩到更细粒度的全域趋势与历史推荐
  - 扩 Reader 深交互场景
  - 补发布版本矩阵
