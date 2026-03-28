# 当前剩余任务清单

**更新时间**: `2026-03-29`

本文档只回答一个问题：

**当前项目已经不缺哪些东西，还剩哪些值得继续做的部分。**

## 结论先看

当前仓库已经完成：

- clean-room 模板骨架
- Zotero 真机开发链
- agent 验证/恢复/汇总/门禁链
- Obsidian 人工介入工作台
- 纯项目导出
- 本地发布矩阵真机闭环
- Codex / Opencode 委托分工脚手架
  - 任务清单 manifest：`config/agent-delegation-tasks.json`
  - 委托执行 CLI：`scripts/agent-delegation.mjs`（提供 `list` / `run` / `review` 命令）
  - 审查工件：`dist/agent-delegation/<taskId>/` 下生成 task、invocation、snapshot、run、review 等工件
  - **首个委托试点已验证**：`DOC-LOW-001` 已于 `2026-03-23` 被 Codex 审查为 `accepted`，全链路（manifest 加载、scope 重叠检测、快照比对、聚焦测试、审查结论）已跑通
  - **历史文档收口任务已验证**：`ENG-LOW-102` 已于 `2026-03-23` 被 Codex 审查为 `accepted`
  - **manifest 已在 `2026-03-28` 切到 `ENG-HIGH-103` 当前批次**：`ENG-HIGH-103 / ENG-LOW-207~210` 是当前 active 的“工程化长期增强第一批”；`READER-HIGH-123` 已完成唯一 Reader verdict 与单分支收口，现只保留为历史契约源；`ENG-HIGH-102 / ENG-LOW-204~206`、`READER-HIGH-122`、`READER-HIGH-121 / READER-LOW-258~260`、`READER-HIGH-120 / READER-LOW-255~257`、`READER-HIGH-119 / READER-LOW-252~254`、`READER-HIGH-118 / READER-LOW-249~251`、`READER-HIGH-114`、`READER-HIGH-113 / READER-LOW-237~239`、`READER-HIGH-112 / READER-LOW-234~236`、`READER-HIGH-111 / READER-LOW-231~233`、`READER-HIGH-110 / READER-LOW-228~230`、`READER-HIGH-109 / READER-LOW-225~227`、`READER-HIGH-106` 与 `OBSIDIAN-HIGH-101` 均继续只保留为历史契约 / review artifact
  - **Reader 上一批 low-task 已转历史**：`READER-LOW-201`、`READER-LOW-202`、`READER-LOW-203` 已于 `2026-03-24` 收口并转入 review artifact 历史目录
  - **Reader 视觉稳采集批次已转历史**：`READER-HIGH-102`、`READER-LOW-204`、`READER-LOW-205`、`READER-LOW-206` 已于 `2026-03-24` 收口并转入 review artifact 历史目录
  - **Watch startup health recovery 批次已转历史**：`ENG-HIGH-102`、`ENG-LOW-204`、`ENG-LOW-205`、`ENG-LOW-206` 已于 `2026-03-27` 收口并转入 review artifact 历史目录
  - **Reader 视觉阻断语义收口批次已转历史**：`READER-HIGH-103`、`READER-LOW-207`、`READER-LOW-208`、`READER-LOW-209` 已于 `2026-03-24` 收口并转入 review artifact 历史目录
  - **上一轮 P1 canonical fingerprint 收口已完成**：相关 review artifact 已转入历史工件，当前不再把该批 low-task 视为 active
  - **Engineering freshness / validation-exit 收口已完成**：`ENG-LOW-201`、`ENG-LOW-202`、`ENG-LOW-203` 已于 `2026-03-24` 以 `reworked-by-codex` 方式转入历史 review artifact

当前主要后续方向集中在：

1. `truth / backlog 收口`
2. `capture-unstable` 稳定性批次
3. `post-capture truth refresh`

说明：

- `P2` 上下文感知记忆与趋势层深化已在本轮代码与测试中落地
- `releaseMatrix` 已进入 memory signal
- `preferredStrategy` 已按 `latestBootMode + zoteroVersionBucket` 做上下文优先推荐
- `agent:monitor` / `agent:dashboard` 已显示上下文命中级别与成功率
- `P2` 后续只保留为长期可选增强，不再列为当前未完成主线

## P1：受控补丁层

状态：

`本轮收口已完成`

### 已完成

- 白名单补丁计划
- patch draft
- patch precheck
- 显式开关下的自动写入
- 写入后重启复验
- monitor / dashboard / gate 中文摘要展示
- 补丁结果归档基础版
  - `agent-zotero-autofix-history/*.json`
  - `latest.json`
  - 主报告中的补丁归档与复验合同摘要
- 结构化诊断与补丁草案已对齐当前真实注册入口
  - `src/app/feature-composer.js`
- 白名单规则已自带 `verification contract` 模板
  - 可按规则声明“补完后必须观察哪些 E2E checks”
- `validation / monitor / dashboard` 已抬升补丁复验合同状态、摘要与失败检查数
- 白名单补丁类别已从“注册遗漏”扩到第一类生命周期缺口
  - `kernel.start()` 中的 `registerBaselineFeatures()` 启动链缺口
- 白名单补丁已支持单点替换式修正
  - 可用于 `config/addon.config.json` 这类配置值恢复
- 白名单补丁已支持规则级 post-apply fresh 复验
  - 适合默认配置修正这类需要 fresh profile 验证的场景
- 白名单补丁类别已扩到第一类配置修正
  - `config/addon.config.json` 中 `defaultPrefs.enabled` 的默认值恢复
- 白名单补丁类别已扩到第一类本地化引用修正
  - 可识别并修复 `src/app/feature-composer.js` 中 ItemPane 基线 `l10nID` 漂移
- 运行时自检 / E2E / 结构化诊断已能观测 ItemPane 本地化引用漂移
  - 当前覆盖 `InfoRow label`、`Section header`、`Section sidenav`
- E2E / 结构化诊断 / 白名单补丁已扩到第一类 locale 资源修正
  - 可识别并补回 `addon-static/locale/*/main.ftl` 中缺失的 ItemPane 基线 key
- 白名单补丁引擎已支持受限 append
  - 适合 `main.ftl` 这类“缺单行 key”场景
- E2E / 结构化诊断 / 白名单补丁已扩到第一类 locale value 修正
  - 可识别并修正 `addon-static/locale/*/main.ftl` 中 ItemPane 基线 key 的 value 漂移
- 白名单补丁预检已支持 `target-file-missing`
  - 资源文件缺失时会安全阻断，而不是在补丁阶段直接抛异常
- E2E / 结构化诊断 / 白名单补丁已扩到第一类 locale 文件缺失恢复
  - 当 `addon-static/locale/*/main.ftl` 整体缺失时，可恢复模板最小基线文件
- 白名单补丁引擎已支持受限 create
  - 当前仅对白名单 locale `main.ftl` 生效，且内容严格来自模板自身基线
- locale 缺失明细已保留 `file-missing` / `key-missing` 区分
  - agent 可据此在“补单条 key”和“恢复最小基线文件”之间自动选择安全路径
- validation / monitor / dashboard / autofix 中文摘要已抬升补丁动作类型
  - 当前可区分 `create / append / replace`
- 补丁阻塞摘要已显示新原因与受影响文件
  - 当前覆盖 `target-file-missing`、`target-file-exists` 等原因
- 补丁复验与归档可解释性已升级
  - `agent-zotero-autofix-history/*.json` 已升级到 `schemaVersion: 3`
  - 归档 / validation / monitor / dashboard / Obsidian / memory 已统一显示复验总览、失败项与失败类型画像
  - 记忆层已开始按 `ruleId / strategyId` 统计复验通过率与常见失败检查
- patch sandbox 已新增白名单草案重放校验
  - `applyPatchPlan` 会按规则重建 canonical drafts，比对目标文件、操作与内容，拒绝篡改后的 patch plan
- `create` 类补丁预检已收紧“已存在即跳过”的判定
  - 只有目标文件整文件等于 clean-room 基线时才视为 `target-already-contains-snippet`
  - 若只是包含基线片段但整体已被人工改写，会明确阻断为 `target-file-exists`
- Reader 视觉基线补丁已补“整组草案集合”校验
  - 应用前会确认 `patchDrafts` 与最新 E2E 漂移证据中的目标集合完全一致，避免 stale plan 或半套视觉补丁误入执行
- patch sandbox 已补规则 ID 与诊断指纹一致性校验
  - 若 `whitelistRuleId` 与 `fingerprint` 指向不同白名单规则，会在 sandbox 阶段直接阻断
  - Reader 视觉 `copy` 补丁现已强制按 `bootMode + kind` 回写到对应 canonical 基线文件，避免 `reader` 截图被误写到 `library` 基线
- Obsidian 人工介入工作台已抬升补丁摘要
  - 当前状态总览、白板与人工窗口会显示补丁计划状态、动作摘要、应用状态与阻塞原因
- 补丁结果归档已补充结构化补丁摘要
  - 当前会沉淀补丁功能、动作类型、涉及文件、阻塞原因与复验失败项，便于后续记忆层直接复用
- 自动修复链已支持纯视觉漂移恢复
  - 当真机功能链已通过、仅剩库视图/Reader 像素漂移时，会自动刷新视觉基线并回到 compare 模式复验
- 白名单补丁类别已扩到第一类 Reader 低风险修正
  - 当前可在 `src/app/feature-composer.js` 中受控补回 Reader 摘要命令注册缺口
  - 当前可在 `src/app/feature-composer.js` 中受控补回 Reader View 菜单项注册缺口
- Reader 事件桥已补声明式基线与三类低风险修正入口
  - `src/features/reader.js` 现已固化 `known types / probe-compatible types / synthetic fallback types`
  - `agent:zotero:e2e` / 结构化诊断 / 白名单补丁现已覆盖 `reader-entry:declarative-reader-mapping-drift`、`reader-event:toolbar-bridge-registration-drift`、`reader-event:fine-grained-hook-declaration-drift`
  - 当前对应白名单规则为 `reader-event-bridge-registration`、`reader-event-synthetic-fallback-mapping`、`reader-event-probe-compatible-declarations`
- patch sandbox 已补块级回放与更细护栏
  - 当前已支持 `replace-block`
  - 当前已支持 `touched-files-limit-exceeded`
  - 当前已支持 `block-anchor-mismatch`
  - 当前已支持 `module-structure-drift`
- 白名单补丁类别已扩到第一类基础注册入口修正
  - 当前可在 `src/app/feature-composer.js` 中受控补回主命令 command palette 注册缺口
  - 当前可在 `src/app/feature-composer.js` 中受控补回主窗口上下文菜单项注册缺口
  - 当前可在 `src/app/feature-composer.js` 中受控补回偏好设置面板注册缺口
- 白名单补丁类别已扩到第一类偏好设置静态资源修正
  - 当前可在 `addon-static/content/preferences.xhtml` 缺失时，受控恢复模板最小偏好设置面板资源文件
- 白名单补丁类别已扩到第一类运行时样式静态资源修正
  - 当前可在 `addon-static/content/style/main.css` 缺失时，受控恢复模板最小主窗口样式文件
- 白名单补丁类别已扩到第一类 bootstrap 静态基线修正
  - 当前可在 `addon-static/bootstrap.js` 缺失时，受控恢复模板 clean-room bootstrap 启动脚本
- 白名单补丁类别已扩到第一类 icon 静态资源修正
  - 当前可在 `config.icons` 指向的模板基线 icon 缺失时，受控把 `scripts/baselines/icons/*.png` 复制回 `addon-static/content/icons/*.png`
- `verify` 前置检查已覆盖静态运行时基线
  - 当前已覆盖 `addon-static/bootstrap.js`
  - 当前已覆盖 `addon-static/content/preferences.xhtml`
  - 当前已覆盖 `addon-static/content/style/main.css`
  - 当前已覆盖三套 locale `addon-static/locale/*/main.ftl`
  - 当前已覆盖 `config.icons` 声明的 icon 文件存在性
- `agent:zotero:e2e` 已接入 Node 侧静态运行时基线体检
  - 当前会在每轮真机验证前额外检查 `bootstrap.js`、`preferences.xhtml`、`main.css` 与 `config.icons` 声明的 icon 文件
  - 当前静态基线缺失会直接写入 `checks.staticRuntimeMissingEntries`，避免被笼统地吞进运行时错误日志
- 结构化诊断已可区分“偏好设置面板注册遗漏”和“`preferences.xhtml` 资源缺失/加载失败”
  - agent 可避免把静态资源故障误判成单纯 `registerPane(...)` 缺口
- 结构化诊断已可识别 `content/style/main.css` 资源缺失
  - agent 可把“仅剩 error 日志”中的主窗口样式缺口，收敛成受限 create 补丁
- 结构化诊断已可单独识别 `bootstrap.js` 基线缺失
  - 当前会优先落到 `bootstrap:bootstrap-file-missing`，不再一律退化成泛化的 `plugin-not-mounted`
- bootstrap 基线恢复已接入独立 canonical source 守卫
  - 当前 `scripts/baselines/bootstrap.js.txt` 会作为受控 create 补丁来源
  - 当前测试会强制 `addon-static/bootstrap.js` 与 canonical baseline 保持同步，避免恢复源与实际模板漂移
- icon 基线恢复已接入独立 canonical source 守卫
  - 当前 `scripts/baselines/icons/*.png` 会作为受控 copy 补丁来源
  - 当前测试会强制 `scripts/baselines/icons/*.png` 与 `addon-static/content/icons/*.png` 保持同步，避免恢复源漂移
- 偏好面板 / 主窗口样式资源缺失诊断已不再强依赖日志
  - 即使日志不足，只要 Node 侧静态体检发现 `preferences.xhtml` / `main.css` 缺失，仍可落到对应资源缺失诊断并接入现有白名单补丁链
- 结构化诊断已可识别 `config.icons` 指向的 icon 资源缺失
  - 当前会把这类问题收敛到 `assets:icon-resource-missing`
- E2E / 结构化诊断 / 白名单补丁已接通三类新增注册入口观测
  - 当前覆盖 `primaryActionCommandRegistered`、`contextActionMenuRegistered`、`preferencePaneRegistered`
- 当前可在显式开关下，把最新 E2E 截图受控复制回 `tests/visual-baselines/agent-zotero-e2e/` 的受影响基线文件
- 纯项目导出回归已锁定静态运行时基线不丢失
  - 当前测试会确认导出物保留 `bootstrap.js`、`preferences.xhtml`、`main.css`、两张 icon 与三套 locale `main.ftl`

### 后续如继续推进

- `P1-HIGH-001` 边界已冻结，当前继续支持与继续 unsupported 的集合不再扩面
  - 当前继续支持的白名单边界固定为：bootstrap / preferences / `main.css` / icon 的缺失与 drift、baseline registration / menu entry / preference pane / reader-entry 声明式入口、reader-event toolbar bridge / fine-grained declarations / probe-compatible declarations、localization 引用 / key / value / 文件恢复，以及 Reader 视觉基线刷新
  - 当前继续保持 unsupported blocker 的集合固定为：`bootstrap:plugin-not-mounted`、`menu-action:primary-action-failed`、`agent-action:agent-action-failed`、`tests:tests-failed`、`scenarios:scenarios-failed`、`runtime-logs:error-logs-present`
  - 下一批新增 whitelist 只允许来自新的稳定 diagnosis fingerprint，且 patch surface 必须是单文件或少文件、能从 clean-room baseline 完整重放，继续只允许 `copy / replace / replace-block / create / append`
- `P1-HIGH-101` 已冻结 Reader canonical fingerprint 策略
  - 当前 canonical 指纹固定为 `reader-entry:declarative-reader-mapping-drift`、`reader-event:toolbar-bridge-registration-drift`、`reader-event:fine-grained-hook-declaration-drift`
  - legacy alias 只保留输入兼容，不再作为默认输出或展示主键
- `ENG-HIGH-101` 已冻结工程化 freshness / validation-exit 语义
  - `ENG-LOW-201`、`ENG-LOW-202`、`ENG-LOW-203` 已于 `2026-03-24` 以 `reworked-by-codex` 方式收口，并转入历史 review artifact
- `READER-HIGH-123` 已完成唯一 Reader verdict，并转为历史契约源
  - 在该历史收口分支中，`reader event hook diagnostics` 与 `reader fine-grained hook diagnostics` 均已通过
  - 历史唯一 verdict 为 `预期 UI 变化`，且只执行了一次受控 `npm run agent:zotero:e2e:update-baseline`
  - 历史收口后四张 canonical baseline 已重新对齐到 `2000x1200`
  - 当前不重复第二次 baseline refresh；后续 fresh `watch / e2e / gate` 若再次变化，统一以“当前单一事实源”小节为准
  - `READER-HIGH-102` 与 `READER-LOW-204~206` 已完成并转入历史 review artifact
  - `READER-HIGH-103` 与 `READER-LOW-207~209` 已完成并转入历史 review artifact
  - `READER-HIGH-104` 与 `READER-LOW-210~212` 已完成并转入历史 review artifact
  - `READER-HIGH-105` 与 `READER-LOW-213~215` 已完成并转入历史 review artifact
  - `READER-HIGH-106` 已冻结 `ui-regression-candidate + complete` 的人工复核分流语义，并转入历史契约源
  - `READER-HIGH-109` 与 `READER-LOW-225~227` 已完成并转入历史 review artifact
  - `READER-HIGH-110` 与 `READER-LOW-228~230` 已完成并转入历史契约 / review artifact
  - `READER-HIGH-111` 与 `READER-LOW-231~233` 已完成并转入历史 review artifact
  - `READER-HIGH-112` 与 `READER-LOW-234~236` 已完成并转入历史 review artifact
  - `READER-HIGH-113` 与 `READER-LOW-237~239` 已完成并转入历史 review artifact
  - `READER-HIGH-118 / READER-LOW-249~251`、`READER-HIGH-119 / READER-LOW-252~254`、`READER-HIGH-120 / READER-LOW-255~257` 与 `READER-HIGH-121 / READER-LOW-258~260` 均已完成并转入历史契约 / review artifact
  - `ENG-HIGH-102 / ENG-LOW-204~206` 已完成并转入历史 review artifact：watch startup health bounded settle 与 truth alignment 已落地，并已把 fresh watch truth 拉回 `healthy`
  - 本阶段目标已完成：唯一 verdict 已落盘，且只推进了 verdict 选中的唯一后续分支
  - Obsidian 工作台当前继续保留人工 verdict 机制，但已不再是当前 Reader 主线的默认主路径
  - `OBSIDIAN-HIGH-101` 仅保留为历史高逻辑契约源；默认输出继续保持 Markdown + Canvas + 人工指令窗口，`AGENT_OBSIDIAN_VISUALS=1` 仅作为已落地的可选 Mermaid / Excalidraw companion 视图
  - 当前整体完成度约 `98%`，仓库已可用于实际开发；4 个 post-`ENG-HIGH-103` 工程化维护 batch 已完成，当前剩余阻断为 fresh `capture-unstable`

## 当前单一事实源

以下口径以 `2026-03-29` 的当前工作树事实为准；README、Checklist、Assessment、Roadmap 如需描述“当前完成度 / 当前主线 / 当前剩余项”，统一引用本节，不再各自冻结第二套 competing truth。

以下摘要块会同步到 README、Checklist、Assessment、Roadmap，对外复述“当前 truth”时只改这里。

<!-- CURRENT-TRUTH-SUMMARY:START -->
- 当前真实完成度约为 `98%`；4 个 post-`ENG-HIGH-103` 工程化维护 batch 已完成并已提交，但 fresh gate 仍未转绿
- 当前最近一轮工程化事实源仍承接 `ENG-HIGH-103`；其后的 4 个维护 batch 已分别落在 `49da303`、`27418fb`、`0aa9b4a`、`be15a92`
- 当前最新 fresh 证据链显示：`watch` 为 `healthy`（`2026-03-28T16:04:08.616Z` 对应 gate 读取状态），`agent:zotero:e2e` 为 `failed`（`2026-03-28T15:57:56.441Z`），`agent:monitor` 前页状态为 `attention`（`2026-03-28T16:04:08.529Z`），`agent:gate` 当前阻断（`2026-03-28T16:04:08.616Z`，`gatePassed=false`）
- 当前 fresh 主阻断已重新回到 `capture-unstable`；下一步是继续稳定 visual capture settle，不重开 baseline refresh、autofix 或 obsidian-first 分支
- 当前主线只做两件事：先收正 single-source truth / backlog 口径，再推进独立 `capture-unstable` 稳定性批次
- 当前明确继续延后：远端发布编排、远端 `updateURL` 闭环验证、下一轮 Reader 更深事件点、`P1` 白名单扩面；除非 future fresh `watch -> e2e -> gate` 出现新的真实回归类型
- `LEGAL_RISK_CHECKLIST.md` 中的 Release Gate 继续保持 `release-only` 人工流程，不纳入本批自动化完成定义
- 当前默认下一优先级固定为 `capture 稳定性批次`；等 fresh capture 结论变化后，再做 post-capture truth refresh
<!-- CURRENT-TRUTH-SUMMARY:END -->

### 补充说明

- 可继续加强 patch sandbox
  - 在现有允许文件范围、canonical draft 重放校验基础上，继续补更细的上下文护栏
- 可继续强化 verification contract
  - 当前已支持 `latest-cycle-check`、`all-cycle-check`、`report-field`
  - 当前已支持 `required: false` 的观察项，可把 `testFailedCount`、`scenarioFailedCount`、`serviceDegradedCycleCount` 这类辅助指标挂进合同而不阻断主结论
  - `report-field` 当前已接入 `visualDriftCount`、`visualMissingCount`、`visualErrorCount`、`cycleFailedCount`、`staticRuntimeMissingCount`、`serviceDegradedCycleCount`、`errorLogCount` 等聚合指标基础
  - 本地化相关白名单补丁现已统一升级到跨轮次必需检查，避免“最后一轮恢复但前一轮仍漂移”的半恢复误判
  - 注册遗漏相关白名单补丁现已统一升级到“跨轮次必需项 + 测试/场景/服务/日志观察项”模板
  - 后续继续扩到更多 Reader 低风险修正与更细的聚合指标补丁类型
- 可继续深化结果归档与策略归纳
  - 当前已具备复验 totals / failed ids / failed kinds / verificationPassedRate 等聚合
  - 后续可继续补更长时间序列、跨版本对比与更细的策略分层统计

### 完成标志

- `agent:zotero:autofix` 不只会给计划，还能稳定完成多类低风险补丁
- 每次补丁都能清楚回答“改了什么、为什么改、结果如何”

## P2：上下文感知记忆与趋势层

状态：

`本轮已完成`

### 已完成

- 新增最小 `failure memory`
  - 会按故障指纹汇总历史次数、成功率、最近出现时间
- 新增最小 `fix outcome memory`
  - 会汇总历史最优恢复路径、最近成功时间与候选文件
- 新增当前故障历史画像
  - 当前未恢复问题会展示“是否见过 / 历史最优路径 / 常见阻塞 / 常见动作”
- 新增独立记忆工件
  - `dist/agent-memory.json`
  - `dist/agent-memory.md`
- `agent:monitor` / `agent:dashboard` 已接入最小记忆层
  - monitor 主报告与 dashboard 仪表板会展示故障记忆和修复结果记忆
- 新增最小趋势层
  - 当前会按最近多日汇总样本数、成功/失败、成功率与指纹波动
- 新增记忆归档目录
  - `dist/agent-memory/latest.{json,md}`
  - `dist/agent-memory/snapshots/*`
  - `dist/agent-memory/history-index.json`
  - `dist/agent-memory/fingerprints/index.json`
  - `dist/agent-memory/signals/index.json`
  - `dist/agent-memory/signals/*.json`
- `agent:monitor` / `agent:dashboard` 已展示趋势与最近样本
  - 当前可直接看到趋势判断、最近窗口对比与最近归档样本
- 已开始归档运行信号趋势
  - 当前覆盖 `watch / e2e / readerEvent / autofix / watchRecovery / gate`
  - 当前可直接看到各信号最近状态、健康率、趋势方向与关键异常指标
- 已补运行上下文摘要
  - `validation / e2e / autofix` 摘要现已统一抬升 `zoteroVersion`、`zoteroVersionBucket`、`latestBootMode`、`bootModes`
  - 缺失上下文时会回退到 `unknown`，旧归档不需要迁移
- 已把 `releaseMatrix` 纳入记忆信号域
  - 当前 `dist/agent-memory/signals/*.json` 已覆盖 `releaseMatrix`
  - `monitor / dashboard / memory markdown` 已展示发布矩阵信号趋势
- 已完成上下文感知推荐
  - `preferredStrategy` 现已优先匹配 `latestBootMode + zoteroVersionBucket`
  - 当前会区分 `exact-context`、`strategy-global`、`fingerprint-global`
  - `currentIncident` 已展示 `context`、`contextMatchLevel`、`contextSuccessRate`、`globalSuccessRate`
- 已补上下文切片归档
  - `failureMemory.hotFingerprints[*]` 与 `dist/agent-memory/fingerprints/*.json` 现已附带 Top context 摘要
- 已强化历史推荐逻辑
  - 当前会结合当前故障、历史最优路径、回归信号与关键异常指标，给出更稳的下一步建议
- 已强化指纹归档深度
  - 当前除了 `fingerprints/index.json`，还会为重点指纹写入独立归档与时间序列摘要，并在 monitor / dashboard 展示“重点指纹时间序列”
- 已补最小阻塞原因趋势层
  - 当前会把 autofix 历史中的 blocker reason，以及 `watch / e2e / readerEvent / gate / watchRecovery` 的历史原因条目归档到 `reasons/index.json` 与 `reasons/*.json`，并在 monitor / dashboard 展示“阻塞原因趋势”
  - 当前已为常见信号文案补稳定分类键，避免 `插件实例未挂载 / 服务健康异常 / 恢复序列不完整 / 缺少自动修复记录` 等同类问题因原始句式不同而被拆散统计

### 后续可选扩展

- 扩大记忆来源
  - 把更多细粒度的 `watch / gate / e2e` 子指标并入，而不只停留在当前状态级摘要
- 扩大趋势层覆盖域
  - 从当前“信号状态 + 关键指标趋势”继续扩到更细的失败原因、阻塞类型、能力覆盖与服务健康趋势
- 继续扩大指纹归档跨度
  - 当前已支持重点指纹时间序列摘要，后续可继续补更长历史窗口、跨版本回归点与更细的原因趋势

### 本轮完成标志

- 同类问题再次出现时，agent 能稳定优先给出“历史最有效路径”
- dashboard / monitor 不只展示记忆快照，还能展示趋势与回归模式

## Reader 宿主细粒度注入点

状态：

`本轮收口已完成`

### 当前已覆盖

- Reader 打开
- 活动上下文摘要
- 基础 Reader 交互摘要
- Reader 交互快照
  - 当前已可读取批注明细、可编辑批注数量、选中批注 ID、匹配窗口状态
- Reader 事件桥
  - 当前已可通过 Zotero Reader 官方事件 API 注册 / 注销监听器
  - 当前已可在真机场景中验证 `renderToolbar` 事件桥与监听器快照
  - 当前已可主动触发并验证 `renderTextSelectionPopup`
  - 当前已可主动触发并验证 `renderSidebarAnnotationHeader`
  - 当前已可主动触发并验证 `createAnnotationContextMenu`、`createColorContextMenu`、`createViewContextMenu`、`createThumbnailContextMenu`、`createSelectorContextMenu`
  - 当前 `agent:monitor` / `agent:dashboard` 已可汇总 Reader 事件桥状态、已知事件类型数、探针类型数与 `synthetic-fallback` 能力
- Reader 更深事件点摘要
  - 当前已接入 `selectionPopupDispatchMode`、`selectionPopupAppendedItemCount`
  - 当前已接入 `sidebarHeaderDispatchMode`、`sidebarHeaderAppendedItemCount`
  - 当前已接入 `contextMenuProbeCount`、`contextMenuObservedTypes`、`contextMenuSyntheticFallbackTypes`
  - 当前 validation / monitor / dashboard / Obsidian 已能用简短中文摘要展示文本选择浮层分发方式、侧栏批注头部分发方式，以及五类 context menu 的已观测类型数与 `synthetic-fallback` 类型数
- Reader UI 状态快照
  - 当前已可读取侧栏开关/宽度、工具模式、导航能力、文本选择注解模式、主副视图状态
- Reader 批注回环
  - 当前已可通过公开 API 创建、更新、删除批注
  - 当前已可通过 `inspectReader()` / `reader interaction snapshot` 回读批注变化

### 后续如继续推进

- `READER-HIGH-001` 契约对应的这一批字段已落地并通过审查
  - 对应的 Reader 低逻辑实现与展示收口已转入历史 review artifact
  - 当前不应再把这 7 个字段重复写成待做项
- 后续若继续推进下一轮 Reader 观测
  - 只应基于最新 fine-grained hook 证据重新冻结新的 iframe / host 边界事件点
  - 继续沿用既有 validation / monitor / dashboard / Obsidian 区块，不新建平行报告
- 继续保持 observation-first
  - 不新增 DOM-heavy 自动补丁
  - 不新增新的视觉 gate
  - 不重复宿主状态字段链与本轮已完成的更深事件点摘要

### 完成标志

- Reader 剩余增强点不再停留在“只知道 API 存在”
- 文本选择浮层与多类上下文菜单已进入真机验证，这一批 7 个更深事件点已完成接入与摘要收口

## 本地发布矩阵

状态：

`已完成（本地）`

### 当前已完成

- 本地 `.xpi` 打包
- 本地 release preflight
- 本地 update / release manifest
- 本地 stable/beta 发布矩阵工件
  - 当前已生成 `dist/release-matrix.json`
  - 当前已生成 `dist/release-matrix.md`
- 本地发布矩阵已接入 `agent:monitor` / `agent:dashboard` / `agent:gate:release`
  - release gate 现会在矩阵缺失、矩阵失败或仅停留在“待补验证”时直接阻断
- 已补正式安装态 smoke 脚本入口
  - 当前可执行 `npm run release:install-smoke:stable`
  - 当前可执行 `npm run release:install-smoke:beta`
  - 当前会聚合到 `dist/release-install-smoke.json`
- 已在真实 stable / beta Zotero 二进制上跑出正式安装态 smoke 记录
  - 当前 `dist/release-install-smoke-stable.json` 与 `dist/release-install-smoke-beta.json` 均已落盘
  - 两个渠道当前都已确认 `installResult.ok === true`、`readinessMode === native`、`apiReady === true`
- 已完成安装态 runtime error 分类与收口
  - 已识别并修复官方菜单注册中的真实插件阻断：`menus[0]["l10nID"] must be string`
  - 当前 stable / beta 都已转为通过
  - 当前剩余 `remote-settings.sys.mjs` 与 `loading.svg` 已归类为宿主噪声，不再阻断 gate
- `release-install-smoke` 现已在重新打包后同步刷新 `release-preflight`
  - 当前 `release-matrix` 不会再被过期 SHA / size 误伤，而会直接暴露真实 smoke 失败原因

### 还需要做

- 远端 `updateURL` 闭环验证
- 远端产物上传与发布编排

### 当前明确延后

- `updateURL` 远端闭环验证
- 远端产物上传与发布编排

### 完成标志

- 发布前可直接看到 stable / beta 两条本地矩阵都为通过
- 发布门禁不再依赖人工口头确认安装态是否跑过

## 工程化欠账

### 当前状态

- `ENG-HIGH-001` 测试语义与边界已冻结
  - 现有错误字段语义固定围绕 `args / config / environment / execution / validation / timeout`
  - 本轮只锁定测试语义、timeout / retry 边界和文档事实口径，不改错误枚举
- 当前工程化低逻辑收口已转入历史 review artifact
  - `monitor / gate / release-matrix / release-install-smoke / loop` 的错误字段回归测试与展示一致性已完成本轮收口
- 后续可继续增强
  - 全局错误边界
  - 参数验证增强
  - HTTP 超时策略增强
  - 性能监控点

### 优先级

- 错误边界 / 参数验证
  - 中优先级
- 性能监控点
  - 低到中优先级

## 文档同步机制

当前已确认需要持续维护的文档：

- [docs/CURRENT_BACKLOG.md](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/docs/CURRENT_BACKLOG.md)
- [FRAMEWORK_CHECKLIST.md](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/FRAMEWORK_CHECKLIST.md)
- [FRAMEWORK_ASSESSMENT.md](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/FRAMEWORK_ASSESSMENT.md)
- [README.md](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/README.md)
- [docs/AGENT_AUTONOMY_ROADMAP.md](/Users/orlandozh/Documents/GitHub/AddonTemplate4Z/docs/AGENT_AUTONOMY_ROADMAP.md)

当前状态：

- 避免“代码已前进，但文档还在旧阶段”
- 避免把下一阶段增强项误判为“基础框架未完成”
- 当前正式文档与 docs consistency 已同步到“`ENG-HIGH-103` 已完成 fresh 收口验证、`READER-HIGH-123` 仅保留为历史契约源”口径

## 建议执行顺序

当前阶段的固定顺序为：

1. 保持 `watch -> e2e -> monitor -> gate` 的 fresh 证据链可重放；如 truth 变化，优先只改 `docs/CURRENT_BACKLOG.md` 的单一事实源摘要
2. 按 `clean-room 治理与文档守卫`、`bootstrap 与采集稳定性`、`HTTP / release / agent 摘要 hardening` 三组拆分当前工程化维护改动
3. 各组分别跑聚焦验证，合并前统一补跑 `npm run check`、`npm run release:preflight`、`npm run agent:dashboard`、`npm run agent:monitor`、`npm run agent:gate`
4. 若 future fresh `watch -> e2e -> gate` 指向真实回归或证据不足，再由 Codex 新开唯一后续高逻辑批次

当前 `READER-HIGH-123` 已收尾完成并转为历史契约源；`ENG-HIGH-103` 的本轮收口验证也已完成。
下一步默认进入工程化维护分组，而不是重开 Reader / `P1` / 远端发布批次；当前批次正式收口后的默认下一优先级，已并入“当前单一事实源”小节。

## 当前不必重复投入的部分

这些方向当前不应再作为主攻：

- 再次证明模板骨架是否存在
- 再次证明基础真机链路是否可用
- 再次证明 Obsidian 工作台是否能生成

这些都已经过了“从 0 到 1”阶段。

## 总结

当前项目已经完成 `ENG-HIGH-103` 的本轮收口；下一步固定转入三组工程化维护，而不是重新开 `P1` 或 Reader 扩面批次：

- `clean-room 治理与文档守卫`
  - 用 docs consistency、`cleanroom:audit` / `cleanroom:sim`、`run-all completeness` 与 `release-only` legal gate 守住单一事实源和开发态门禁
- `bootstrap 与采集稳定性`
  - 继续稳住 bootstrap bridge、static runtime baseline、capture window 解析与视觉采集相关守卫，不改产品功能面
- `HTTP / release / agent 摘要 hardening`
  - 继续补 HTTP timeout / retry / cancel / 慢操作摘要，以及 release metadata / preflight / prepare 与 monitor / dashboard / gate / obsidian / watch recovery / e2e 的联动可解释性
- 远端发布编排、远端 `updateURL`、Reader 更深事件点与 `P1` 扩面继续延后，除非 fresh evidence 重新打开新的高逻辑批次
