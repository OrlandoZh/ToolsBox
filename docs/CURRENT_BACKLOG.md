# 当前剩余任务清单

**更新时间**: `2026-04-22`

本文档只回答一个问题：

**当前项目已经不缺哪些东西，还剩哪些值得继续做的部分。**

## 结论先看

当前仓库已经完成：

- clean-room 模板骨架
- Zotero 真机开发链
- agent 验证/恢复/汇总/门禁链
- dev-only 性能诊断链
  - 参考 `know-ur-zotero` 的 activity-oriented 采样思路，但不把 `Services.profiler` 常驻监控带入模板基线
  - `performanceBudget` 作为默认 E2E advisory，覆盖 lifecycle/http 与代表性 host actions 耗时，并进入 `agent:zotero:e2e -> agent:monitor / dashboard / gate` 摘要
  - `agent:zotero:profile` 作为 dev-only、手动触发、non-blocking 的 CPU profiler 诊断旁路，输出 `dist/agent-zotero-profile.{json,md}`，按 Current Plugin / Zotero Main / Reader / Note Editor / Other / Unknown 归因
  - 最新 CPU profiler 摘要已接入 `agent:monitor / dashboard` advisory 展示，并复用 `agent-memory/signals` 归档 `cpuProfiler` 趋势
  - `agent:zotero:memory` 作为 dev-only、手动触发、non-blocking 的内存诊断旁路，输出 `dist/agent-zotero-memory.{json,md}`，采集 RSS/resident/explicit before-after delta，并接入 monitor/dashboard advisory 与 `memoryDiagnostics` 趋势
  - `agent:zotero:memory -- --include-about-memory` 现可额外导出完整 Gecko memory reporter 文本到 `dist/agent-zotero-memory-about-memory.txt`
  - `performanceRecommendations` 已把 `performanceBudget`、CPU profiler 与内存诊断 compact summary 汇总成 monitor/dashboard/gate 可见的 advisory 建议
  - 手动诊断现已补 `profiler extended diagnostics` 与 `memory extended diagnostics`，覆盖批量 item selection 与 Reader sidebar view cycle 这类较重采样场景
  - 性能诊断旁路与建议层不进入默认 `check / agent:gate / release` 阻断链，也不替代现有 `performanceBudget`
- Obsidian 人工介入工作台
- 纯项目导出
- 中国法优先的商业交付法务骨架
  - 当前主仓已内置 `CODE_PROVENANCE.md`、`THIRD_PARTY_NOTICES.md`、`COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md`
  - 当前 `release:preflight` 将在发布态严格消费 China Commercial Delivery Gate，而开发态 `cleanroom:audit` 继续保持 advisory
- 本地发布矩阵真机闭环
- 插件可见文案已跟随 Zotero 语言切换
  - 当前 `menu item`、Reader View 菜单项、`preference pane` 与 `item pane` 基线文案统一走 `main.ftl + i18n bridge`
  - 当前内置覆盖 `en-US / zh-CN / zh-TW`，并把 `zh-TW / zh-HK / zh-MO / zh-Hant` 归一到 `zh-TW`
- Codex / Opencode 委托分工脚手架
  - 任务清单 manifest：`config/agent-delegation-tasks.json`
  - 委托执行 CLI：`scripts/agent-delegation.mjs`（提供 `list` / `run` / `review` 命令）
  - 审查工件：`dist/agent-delegation/<taskId>/` 下生成 task、invocation、snapshot、run、review 等工件
  - **首个委托试点已验证**：`DOC-LOW-001` 已于 `2026-03-23` 被 Codex 审查为 `accepted`，全链路（manifest 加载、scope 重叠检测、快照比对、聚焦测试、审查结论）已跑通
  - **历史文档收口任务已验证**：`ENG-LOW-102` 已于 `2026-03-23` 被 Codex 审查为 `accepted`
  - **manifest 已在 `2026-03-30` fresh rerun 后完成 `READER-HIGH-126` 收口并切回稳定口径**：`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`、`READER-HIGH-124 / READER-LOW-261~263` 的 capture failure 结构化 / `capture-command-failed` blocker / freshest-valid artifact 消费、`READER-HIGH-125` 的 library-only 根因边界冻结、以及 `READER-HIGH-126` 的 library host-noise 抑制与 baseline 恢复均已完成独立收口并转为历史契约 / review artifact；`READER-HIGH-123`、`ENG-HIGH-102 / ENG-LOW-204~206`、`READER-HIGH-122`、`READER-HIGH-121 / READER-LOW-258~260`、`READER-HIGH-120 / READER-LOW-255~257`、`READER-HIGH-119 / READER-LOW-252~254`、`READER-HIGH-118 / READER-LOW-249~251`、`READER-HIGH-114`、`READER-HIGH-113 / READER-LOW-237~239`、`READER-HIGH-112 / READER-LOW-234~236`、`READER-HIGH-111 / READER-LOW-231~233`、`READER-HIGH-110 / READER-LOW-228~230`、`READER-HIGH-109 / READER-LOW-225~227`、`READER-HIGH-106` 与 `OBSIDIAN-HIGH-101` 均继续只保留为历史契约 / review artifact
  - **Reader 上一批 low-task 已转历史**：`READER-LOW-201`、`READER-LOW-202`、`READER-LOW-203` 已于 `2026-03-24` 收口并转入 review artifact 历史目录
  - **Reader 视觉稳采集批次已转历史**：`READER-HIGH-102`、`READER-LOW-204`、`READER-LOW-205`、`READER-LOW-206` 已于 `2026-03-24` 收口并转入 review artifact 历史目录
  - **Watch startup health recovery 批次已转历史**：`ENG-HIGH-102`、`ENG-LOW-204`、`ENG-LOW-205`、`ENG-LOW-206` 已于 `2026-03-27` 收口并转入 review artifact 历史目录
  - **Reader 视觉阻断语义收口批次已转历史**：`READER-HIGH-103`、`READER-LOW-207`、`READER-LOW-208`、`READER-LOW-209` 已于 `2026-03-24` 收口并转入 review artifact 历史目录
  - **上一轮 P1 canonical fingerprint 收口已完成**：相关 review artifact 已转入历史工件，当前不再把该批 low-task 视为 active
  - **Engineering freshness / validation-exit 收口已完成**：`ENG-LOW-201`、`ENG-LOW-202`、`ENG-LOW-203` 已于 `2026-03-24` 以 `reworked-by-codex` 方式转入历史 review artifact

- 本地 reference 快照人工更新链
  - 当前通过 `config/reference-projects.json` 声明 git-backed managed refs
  - 手工命令入口：`npm run agent:reference:update -- update --project <id>` 或 `--all`
  - 当前只管理 rolling git 快照；像 `bibgenie-0.5.7` 这类版本号写进目录名的 release/archive 快照继续人工维护
- 产品整体 UI 设计人工委托链
  - 手工命令入口：`npm run agent:ui:design -- run product-ui-design-update --goal "<你的设计目标>"`
  - 当前只允许子 agent 创建 / 更新 `obsidian/agent-workbench/20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md`
  - UI 设计呈现固定为 Obsidian Excalidraw；不覆盖默认 `07~11` 自动概念图，也不替代 `10-模板协作-人工指令窗口.md`
- Codex Computer Use 真机验证可选支线
  - 手工命令入口：`npm run agent:computer-use:validate -- --user-requested --target "<可见验证目标>"`
  - 当前只在用户明确要求后生成 / 记录 `dist/agent-computer-use-validation.{json,md}`，默认不进入 `check`、`agent:zotero:e2e`、`agent:gate`、`agent:gate:release` 或 `agent:pipeline`
  - 该支线只作为 optional evidence，不替代 `watch -> e2e -> monitor -> gate` 主链，也不会自动升级 current truth 或新增 gate blocker

当前主要后续方向集中在：

1. 当前已收口批次：宿主可见 UI 细节打磨与复用共建
   - `HOST-HIGH-201 / HOST-LOW-301~303` 已在 `2026-04-08` 的 fresh `agent:zotero:e2e -> agent:monitor -> agent:gate` compare 模式闭环中通过，并转为稳定基线 / 历史契约
   - 本轮已对齐 `preference pane`、`context pane`、`item pane sidenav`、`reader renderToolbar/sidebar view`、`menu item / collection menu / dynamic submenu` 的交互一致性、贴边式 geometry 与 surface-local evidence
   - 当前不再把 host-visible polish 视为开发态 blocker；后续只在新增宿主 surface、truth 变化或 fresh rerun 再次出现新 blocker kind 时重开
2. 当前唯一未收口主线：远端发布编排与远端 `updateURL` 闭环验证
   - release-only follow-up 固定为 `ENG-HIGH-104 / ENG-LOW-211~213`
3. 当前 active 扩展 wave：`ZOTERO-SURFACE-WIND-TUNNEL-WAVE-001`
   - 范围固定为 dev-only 浏览器风洞：`Zotero surface scene matrix`、模块化场景切换、reference-derived generic gap visualization、Zotero Web Library browser UI adapter、Zotero client tag-system simulation、Zotero PDF.js document-analysis harness、`performance bottleneck simulator`、本地 browser server 与 focused static verification；当前场景 atlas 已扩到库与分类、条目元数据、附件与存储、检索、笔记批注、引用导出、同步协作、偏好账户、Reader、窗口 lifecycle、运行时与发布更新等 Zotero 主要产品面
   - UI 路线固定为普通浏览器 Web app；当前只复刻足够真实的 `PreferencePanes / MenuManager / ItemPaneManager / Reader renderToolbar / context pane / Item Tree / Tag Selector / Tags Box` 以及模板化窗口、文档、运行时、发布更新场景语义；浏览器 UI 真实性优先通过 `--zotero-web-library-root` / `ZOTERO_WEB_LIBRARY_ROOT` 显式接入 Zotero 官方 Web Library 根目录做 collection tree / items table / item details / reader shell 锚点、官方视觉 token / density / class grammar scoped adapter、静态 icon、脱敏 fixture display-field 采样与 library surface 交互事件模拟（collection click / collection keyboard navigate / item click / shift or meta multi-select / item keyboard navigate / column sort / Item Tree column resize / item context menu / menu popupshowing rebuild / menu item click / Item Pane section switch / Tag Selector search or toggle or drag-drop / Tags Box add or remove），其中 Item Tree column resize 按本地 Zotero `VirtualizedTable` 的 `resizer -> columnWidths[dataKey] -> onResize(columnWidths, true)` 语义模拟并保留 `minWidth / fixedWidth` 边界，标签体系按本地 Zotero `TagSelectorContainer / TagSelectorList / tags-box / item.addTag / item.removeTag / tagColors` 语义模拟彩色标签、自动标签、禁用 scope、selected tag filter 与批量写回事件；外层数据面板与 Zotero 模型窗口内左右栏已支持折叠/展开，保留窄 rail 恢复入口，并让 Library/Reader/文档分析三类主窗口共享同一 pane toggle 状态；本地客户端源码继续作为宿主语义权威；文档分析模块优先通过 `--zotero-pdfjs-root` / `ZOTERO_PDFJS_ROOT` 显式接入 Zotero Reader PDF.js build，PDF 页由 Zotero Reader bundled PDF.js 渲染，并可通过 `--sample-pdf` / `ZOTERO_WIND_TUNNEL_SAMPLE_PDF` 挂载 operator 指定的本地真实 PDF 作为样本；PDF.js visual-check 模式会把 Reader stage / iframe 视口拉高到 1100px 级别以便浏览器视觉检查；外层 Reader chrome / menubar / renderToolbar / sidebar / context pane / 非遮挡 selection action dock 用 `reader.xhtml / reader.js / reader.css` 抽象出的 browser adapter 模拟，并通过 `/zotero-reader/manifest.json` 对 `reader.xhtml`、`reader.js` callback/context-menu 与 `reader.css` 源锚点做运行时可见校验；缺配置或缺本地 build 时显式降级为 contract fallback，不替代真机 Zotero 宿主
   - 当前 validation decision 固定为 `visual-recommended`：先收口模块 taxonomy、场景矩阵、覆盖缺口面板、性能压力预设、运行循环、local server 与 Node 静态测试；Codex 内置浏览器 / Chrome 视觉 smoke 作为补证
   - 本轮边界固定为 template dev tool：不接真实 AI provider、不启用 React lane、不执行任意源码 patch、不 vendoring 官方源码、不进入标准 / protected XPI、不把模拟指标升级为 release gate
   - `Agent Review Workbench` 继续保留为既有 dev-only 工作台能力；本轮不重开其 command entry、JSON state store 或 monitor/gate acceptance 口径
4. 已收口 hardening wave：`ZOTERO-DOM-CONTRACT-WAVE-001`
   - 范围固定为 `preference pane / item pane / reader`
   - 验收主线为 `host-first -> action replay -> route-aware dom contract -> advisory summary`
   - 产物固定写入 `domContractReport`，由 `agent:zotero:e2e -> agent:monitor / dashboard / gate` 展示 route 级结构化操作日志；v1 保持 advisory + non-blocking
   - 三条 route 均已完成：preference pane 6 项检查（root marker / ownerDocument / 连接态 / 控件归属 / pref writeback / 无横向溢出）、item pane 7 项检查（action postcondition / root 存在 / 唯一性 / ownerDocument / 连接态 / marker / paneID）、reader 12 项检查（event.doc / append / toolbar anchor / sidebar postcondition / selection popup / menu append / listener cleanup），wave 已收口
4. 非阻断后续：Reader 更深事件点补强与 `P1` 白名单扩面
5. 已完成 wave 基线：`ZOTERO-HOST-POLISH-WAVE-001` 与 `OPTIONAL-BUNDLE-WAVE-001`
   - `ZOTERO-HOST-POLISH-WAVE-001` 已完成 `preference pane / context pane / item pane sidenav / reader renderToolbar & sidebar view / menu item` 的 live geometry、surface smoke 与 surface-local evidence 收口
   - `OPTIONAL-BUNDLE-WAVE-001` 继续保留为已完成基线：`react-ui` 为 implemented + default-disabled，`agent-runtime` / `ai-service` 继续保持 spec-only，`wasm-kernel` 现为 `probe + digest + shadow unlock derivation` 的 `planned + default-disabled` lane，仍不回灌默认主线
6. 维护项：保持 `watch -> e2e -> monitor -> gate` 的 fresh 证据链可重放，并继续以“当前单一事实源”同步文档 / manifest / 守卫
7. 治理项：后续若进入下一波模块扩展，先在 `docs/CURRENT_BACKLOG.md` 与 `config/project-expansion-wave.json` 声明新 wave / scope / archetype / 验收主线，不直接继承上一阶段的 strict visual 或产品阶段结论
8. 治理项：维持“中国法优先、宿主层可实现优先”的法务策略
   - 当前只把 China Commercial Delivery Gate 作为 `release:preflight` 的严格阻断，不把它回写成日常开发 blocker

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
- `verify` / `agent:zotero:e2e` 的 locale 合同已从 ItemPane-only 扩到完整 `main.ftl`
  - 当前覆盖 `menu item`、Reader View 菜单项、`preference pane` 与 `ItemPane` 的 key 缺失、value 漂移与结构漂移
- 偏好设置面板已接通宿主语言桥
  - `onPreferenceLoad` 会传入 `locale + strings` 并插入 `main.ftl`；`preferences.xhtml` 基线已改为 `data-l10n-id`，不再保留硬编码英文
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
- JS i18n 资源已补齐 `zh-TW` bundle 与简繁中文归一规则
  - 当前 `zh-TW / zh-HK / zh-MO / zh-Hant` 统一映射到 `zh-TW`，其他 `zh*` 继续映射到 `zh-CN`
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
- 偏好设置面板 / 主窗口样式资源缺失诊断已不再强依赖日志
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
  - 当前继续支持的白名单边界固定为：bootstrap / preferences / `main.css` / icon 的缺失与 drift、baseline registration / menu item / preference pane / reader-entry 声明式入口、reader-event renderToolbar bridge / fine-grained declarations / probe-compatible declarations、localization 引用 / key / value / 文件恢复，以及 Reader 视觉基线刷新
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
  - 当前整体完成度约 `99%`，仓库已可用于实际开发；启动诊断与 `settle` 补丁、`READER-HIGH-124 / READER-LOW-261~263` 的收口、`READER-HIGH-125` 的边界冻结，以及 `READER-HIGH-126` 的 library host-noise 修复都已完成，当前主阻断已清零，剩余事项转为非阻断延后项

## 当前单一事实源

以下口径以 `2026-05-01` 的项目态为准；当前开发态已重新拉回 fresh `watch -> e2e -> monitor -> gate` 证据链，README、Checklist、Assessment、Roadmap 统一镜像这里的“当前单一事实源”，不再保留双层 competing truth。

以下摘要块会同步到 README、Checklist、Assessment、Roadmap；对外复述“当前 truth”时只改这里。

<!-- CURRENT-TRUTH-SUMMARY:START -->
- 当前真实完成度仍约为 `99%`；`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`、`READER-HIGH-124 / READER-LOW-261~263` 的 capture / freshness 收口、`READER-HIGH-125` 的 library-only 根因边界冻结、以及 `READER-HIGH-126` 的 library host-noise 修复继续保留为历史契约 / review artifact；`2026-04-08` fresh `watch -> e2e -> monitor -> gate` 已把当前开发态重新拉回 `stable / ready`
- `HOST-HIGH-201 / HOST-LOW-301~303` 已在 `2026-04-08T01:26:26.211Z` 的 fresh compare 模式 `agent:zotero:e2e` 与 `2026-04-08T01:29:27.786Z` 的 `agent:gate` 中收口：当前 `preference pane`、`context pane`、`item pane sidenav`、`reader renderToolbar / sidebar view`、`menu item / collection menu / dynamic submenu` 的 live geometry、surface-local evidence 与基线比对均已通过，不再作为开发态 blocker
- 当前唯一未收口主线已切到 release-only 的 `ENG-HIGH-104 / ENG-LOW-211~213`：继续沿 `release:plan -> release:upload 计划壳 -> 手动远端上传 -> release:preflight --verify-remote -> release:prepare -> release:matrix -> agent:gate:release` 推进远端发布编排与远端 `updateURL` 闭环验证，不回写插件 runtime 或 host-visible polish 主线
- 当前 active 扩展 wave 已切换为 `ZOTERO-SURFACE-WIND-TUNNEL-WAVE-001`：新增 dev-only browser wind tunnel，以普通浏览器 Web app 路线承接 Zotero scene matrix、host surface DOM mock、模块化场景切换、reference-derived generic gap visualization、Zotero Web Library browser UI adapter、Zotero PDF.js document-analysis harness、性能瓶颈注入、runtime metrics timeline 与 local browser smoke；当前场景 atlas 已扩到 `58` 个模板场景、`16` 个模块与 `17` 个 route，覆盖库与分类、条目元数据、附件与存储、检索、笔记批注、引用导出、同步协作、偏好账户、Reader、窗口 lifecycle、运行时与发布更新等 Zotero 主要产品面；该风洞只用于开发态快速具像化，不把自己升级成新的 truth source
- `ZOTERO-SURFACE-WIND-TUNNEL-WAVE-001` 的当前边界已冻结：只复刻足够测试的 `PreferencePanes / MenuManager / ItemPaneManager / Reader renderToolbar / context pane / Item Tree / Tag Selector / Tags Box` 以及模板化窗口、文档、运行时、发布更新场景语义；浏览器 UI 真实性优先通过 `--zotero-web-library-root` / `ZOTERO_WEB_LIBRARY_ROOT` 显式接入 Zotero 官方 Web Library 根目录做 collection tree / items table / item details / reader shell 锚点、官方视觉 token / density / class grammar scoped adapter、静态 icon、脱敏 fixture display-field 采样与 library surface 交互事件模拟（collection click / collection keyboard navigate / item click / shift or meta multi-select / item keyboard navigate / column sort / Item Tree column resize / item context menu / menu popupshowing rebuild / menu item click / Item Pane section switch / Tag Selector search or toggle or drag-drop / Tags Box add or remove），其中 Item Tree column resize 按本地 Zotero `VirtualizedTable` 的 `resizer -> columnWidths[dataKey] -> onResize(columnWidths, true)` 语义模拟并保留 `minWidth / fixedWidth` 边界，标签体系按本地 Zotero `TagSelectorContainer / TagSelectorList / tags-box / item.addTag / item.removeTag / tagColors` 语义模拟彩色标签、自动标签、禁用 scope、selected tag filter 与批量写回事件；本地客户端源码继续作为宿主语义权威；文档分析模块优先通过 `--zotero-pdfjs-root` / `ZOTERO_PDFJS_ROOT` 显式接入 Zotero Reader PDF.js build，提供 viewer/text-layer/viewport harness，PDF 页由 Zotero Reader bundled PDF.js 渲染，并以 1100px 级 visual-check Reader stage / iframe 视口支持浏览器视觉检查，外层 Reader chrome / menubar / renderToolbar / sidebar / context pane / 非遮挡 selection action dock 用 `reader.xhtml / reader.js / reader.css` 抽象出的 browser adapter 模拟，缺配置或缺本地 build 时显式降级为 contract fallback，不替代真机 Zotero、不接真实 AI provider、不启用 React optional lane、不提升为产品内用户功能、不自动应用任意源码 patch、不 vendoring 官方源码
- 当前该 wave 的 validation decision 固定为 `visual-recommended`：优先证明 module taxonomy、scenario matrix、coverage gap dashboard、bottleneck presets、bounded long-task / memory / DOM pressure simulation、本地 browser server 与 Node 静态测试已闭环；Codex 内置浏览器 / Chrome 视觉 smoke 只作为补证，不替代 `agent:zotero:e2e`
- 本轮 `ZOTERO-SURFACE-WIND-TUNNEL-WAVE-001` 收口限定在风洞自身工程质量：场景覆盖大库、collection tree、Item Tree column resize、saved search、tag selector、Tags Box add/remove、彩色标签、自动标签、tag drag/drop、Duplicate Items、Trash、Feeds、Item Pane metadata、notes/tags/related、bulk edit、attachments、Find Available PDF、Retrieve Metadata、file sync/WebDAV、quick/advanced search、Locate、note editor、standalone note、annotation-to-note、EPUB/snapshot Reader、Quick Copy、citation dialog、word processor、import/export translator、Connector save、sync conflict、group library、storage quota/offline、preferences account/cite/export/search/proxy、Reader / menu / preference pane / startup / mixed host action、Web Library adapter、PDF.js document-analysis harness、多窗口、watch reconnect、Wasm worker matrix、activity budget、profiler / memory diagnostics 与 release update path 的模板化切换；性能注入覆盖 long task、慢 I/O、DOM 膨胀、listener 泄漏与内存增长，并保持所有压力模拟有上限、可暂停、可 reset
- 当前 package boundary 已收紧：标准 / protected XPI 都不得携带 `build-report.json`、dev-only workbench 静态文件、`agent-runtime` / `ai-service` optional metadata、dev capability overlay 或可恢复 `ownedBy / entrypoints / successSignals`；`descriptor-bind` / `stage2-derive` 继续保留实验命令入口，但不再从 `dev/agent-runtime/capability-manifest.js` 派生可恢复 overlay
- Codex Computer Use 真机验证已作为 default-disabled optional validation lane 建立：`config/codex-computer-use-validation.json` 固定 `enabledByDefault=false`、`gateEffect=non-blocking`、`requiresExplicitUserRequest=true`，手动入口为 `npm run agent:computer-use:validate -- --user-requested --target "<目标>"`；它只生成 / 记录 `dist/agent-computer-use-validation.{json,md}`，不进入 `check`、`agent:zotero:e2e`、`agent:zotero:loop`、`agent:gate`、`agent:gate:release` 或 `agent:pipeline`
- `ZOTERO-DOM-CONTRACT-WAVE-001` 已收口完成：覆盖 `preference pane / item pane / reader` 三条既有宿主面，新增 `domContractReport` route-aware 摘要接入 `agent:zotero:e2e -> agent:monitor / dashboard / gate`，三条 route 均通过；当前保持 advisory + non-blocking，不重开旧的 host-polish blocker
- 当前 `preference pane` 窄宽度 hardening 与右侧 host-visible surface capture 链已全部对齐：以 Zotero 偏好设置宿主窗口最小尺寸 `800x600` 为 host boundary，当前接受“geometry ready + root width observed + no horizontal overflow”的稳定证据，不再把短暂的 geometry settle 超时单独抬成 blocker
- latest live rerun 现已刷新到 `2026-04-08T01:24:38.171Z` 的 `agent:zotero:e2e:update-baseline` 与 `2026-04-08T01:26:26.211Z` 的 fresh compare 模式 `agent:zotero:e2e`：本轮在确认 host-visible polish 行为链稳定后，受控刷新了一次 surface-local baseline；`restart` 与 `hot-reload` 两轮均通过，`tests/scenarios` 保持 `0` 失败，`visualEvidenceFailingItemCount` 已回到 `0`
- 当前 `visual-required` host-polish 判据已回到“blocking `surface-local` evidence 优先”：whole-window `library / reader` 漂移继续保留为 supplemental `capture-unstable` 诊断与归档样本，不再单独阻断 `HOST-HIGH-201 / HOST-LOW-301~303` 这轮 gate
- 当前插件可见文案已统一跟随 Zotero 语言：`menu item`、Reader View 菜单项、`preference pane` 与 `item pane` 基线现统一复用 `main.ftl + i18n bridge`，内置 locale 覆盖 `en-US / zh-CN / zh-TW`
- 最新 bounded foreground `zotero:watch` 已在 `2026-04-06T06:37:05.164Z` 刷新为 `healthy`：startup health 通过、`latestPassed=true`，当前不再把过期 watch 工件视为开发态主阻断
- 最新开发态 `agent:monitor` / `agent:gate` 已在 `2026-04-06T06:37:56.329Z` / `2026-04-06T06:37:56.574Z` 消费 fresh E2E + watch 工件并回到 `stable / ready`；当前 `gatePassed=true`，frontpage headline 已重新固定为“watch、真机验证与恢复回归均已通过，当前闭环状态稳定”
- 当前 dev-only 性能诊断链已分为三层：`performanceBudget` 继续作为默认 E2E advisory，latest direct E2E `2026-04-06T06:35:06.375Z` 已把 lifecycle/http 与代表性 host actions 的预算结果写入 `agent-zotero-e2e / monitor / gate`，当前预算状态为 `passed`，`preferences.openPane` 为 `1113ms / 1600ms`，活动 `4/4` 全部通过；`agent:zotero:profile` 已作为手动 CPU profiler 旁路完成并真机验证，`npm run agent:zotero:profile -- --duration-ms 50 --skip-build` 已采集 `4/4` activity profiles，输出 `dist/agent-zotero-profile.{json,md}` 并按 Current Plugin / Zotero Main / Reader / Note Editor / Other / Unknown 归因，最新 profiler compact 摘要现已接入 `agent:monitor / dashboard` advisory 展示，并通过 `agent-memory/signals/cpuProfiler.json` 归档趋势；`agent:zotero:memory` 现已补 dev-only 手动内存诊断 MVP，输出 `dist/agent-zotero-memory.{json,md}`，采集代表性 host actions 的 RSS/resident/explicit before-after delta，并通过 `agent-memory/signals/memoryDiagnostics.json` 归档趋势，且 `--include-about-memory` 现可额外导出完整 Gecko memory reporter 文本到 `dist/agent-zotero-memory-about-memory.txt`；`performanceRecommendations` 现已把三层 compact summary 汇总成自动诊断建议，在 monitor/dashboard/gate 中作为 advisory evidence 展示；`profiler extended diagnostics` 与 `memory extended diagnostics` 现已补手动扩展采样场景，覆盖批量 item selection 与 Reader sidebar view cycle。三者、建议层与扩展场景均保持 advisory + non-blocking，不进入默认 `check / agent:gate / release` 阻断链，也不向下游项目注入常驻 profiler / memory monitor 开销
- 最新 focused live probe `reader surface smoke` 已在 `2026-04-04T10:03:46.084Z` 通过，说明 Reader surface smoke 不只停留在历史 E2E 工件，而是继续可在真机单场景复现
- `agent:context` 已新增统一只读上下文层：当前会输出 `dist/agent-context.{json,md}`，汇总 stable / dynamic context、decision hints 与 drift signals；本轮已新增 `runtime-compact-v1` 只读派生视图，默认只暴露 truth/action/status/drift/evidence/artifact refs + freshness/budget，并已接入 gate、Obsidian 工作台、dashboard 与 delegation runtime prompt；`agent:context:guard` 当前继续保持 warning-only
- `ZOTERO-HOST-POLISH-WAVE-001` 已在 `2026-04-08` 收口完成：以 `config/project-validation-surfaces.json` 与现有 host action / surface smoke 为主轴的 live interaction consistency、edge-attached geometry 与 surface-local evidence 已完成模板级闭环；`ZOTERO-DOM-CONTRACT-WAVE-001` 也已完成，在这个完成基线之上追加 route-aware DOM contract advisory，不把上一轮已完成结论重新拉回 blocker
- 已完成的 host polish baseline 验收主线仍固定为 `host-first -> live geometry / interaction consistency -> surface smoke -> surface-local evidence -> full gate`，当前只把这条完成链当作 DOM contract wave 的上游稳定基线，不重开 strict visual 争论
- `OPTIONAL-BUNDLE-WAVE-001` 继续视为已完成基线：`react-ui` 仍保持 implemented + default-disabled，`agent-runtime` / `ai-service` 继续保持 spec-only，`wasm-kernel` 已作为 `probe + digest + shadow unlock derivation` 的 `planned + default-disabled` lane 进入 registry，但不把 optional bundle lane 回灌到当前 DOM contract 主线
- 当前已完成 wave 验收主线：`host-first -> action replay -> route-aware dom contract -> advisory summary`
- 当前唯一 optional bundle registry 仍是 `config/optional-bundles.json`；`react-ui` 当前固定为 `ts-isolated + implemented + enabled=false`，`agent-runtime` 固定为 `ts-isolated + planned + enabled=false`，`ai-service` 固定为 `js-core + planned + enabled=false`，`wasm-kernel` 固定为 `js-core + planned + enabled=false`，本轮不把它们重新拉回当前扩波主线
- 最新 `wasm kernel probe diagnostics` 已在 `2026-04-19` 的 live Zotero scenario 中通过：当前主线程 `rootURI + content/lib/w/...` 与 `ChromeWorker + chrome://<addonRef>/content/lib/w/...` 均可用，但仍只作为 bundle-local probe，不进入默认 `build / package / gate` 主线
- `wasm-kernel` 当前已补 probe 级成本量化链与独立 disabled-contract 报告链：默认 probe 总览仍固定写入 `dist/wasm-kernel-smoke.json` / `dist/wasm-kernel-performance.json` / `dist/wasm-kernel-disabled-contract.json`，digest lane 现已改为并存写入 `dist/wasm-kernel-digest-smoke.json` / `dist/wasm-kernel-digest-performance.json` / `dist/wasm-kernel-digest-disabled-contract.json`，不再覆盖 probe 基线；`npm run wasm:kernel:perf` 与 `npm run wasm:kernel:disabled-contract` 都会按场景优先读取对应 smoke/perf 证据，再回退到默认 artifacts。当前已记录 source/build 资产合计 `7.96KB`，并完成 fresh live repeated smoke：probe `3/3` 通过、main-thread 中位 `1ms`、worker 中位 `3ms`；digest `3/3` 通过、main-thread 中位 `1ms`、worker 中位 `5ms`；disabled-contract 也已回到 `passed`。shadow-mode `runtime.deriveWasmKernelUnlockToken` 已落地为 bundle-local 业务 derivation 实验，并新增 `wasm kernel unlock diagnostics` 场景；当前判断继续保持 `planned + default-disabled`
- `wasm-kernel` 当前已补固定聚合入口：`npm run wasm:kernel:matrix` 会把 probe/digest 两条 lane 的 smoke / perf / disabled-contract 收成 `dist/wasm-kernel-matrix.json` / `md`，统一给 controller 使用；当前矩阵结论固定为 `keep-planned-default-disabled`，不会自动把 lane 升成 `implemented`
- 当前模板已把 Lisianthus 抽出的 `file-state-store`、`task-runner`、`task-queue`、`zotero-file-storage`、`zotero-json-state-store` 与 `window-shell + theme-manager + host action gating` 视为已入基线的 JS-core 能力；同时把 default-disabled `react surface bridge + surface-window-mode` 收到 optional bundle 基线里；`build:react-ui` 当前继续只服务默认禁用的 demo lane + host-mounted surface bridge lane，并已由主仓 / pure-project 显式声明 `esbuild + react + react-dom` 作为 optional-lane devDependencies，不把 React/TS 依赖回灌进模板核心；`wasm-kernel` 当前已冻结 checked-in probe 资产、`runtime.probeWasmKernel` / `runtime.deriveWasmKernelDigest` / `runtime.deriveWasmKernelUnlockToken` host action、registry validation contract 与 pure-project export 保留边界，且 default-disabled 态已改为首次 host action 调用时才惰性创建 Wasm runtime，但仍不伪装为已实现 bundle
- 本 wave 当前 in-scope surfaces 继续写入 `config/project-validation-surfaces.json`：覆盖 `preference pane`、`context pane`、`item pane sidenav`、`reader renderToolbar`、`reader sidebar view`、`menu item`、`collection menu` 与 `menu submenu`，当前批次只补这些已声明 surface 的 polish，不新开产品 surface
- 当前宿主可见 UI 主链已基本实现：`preference pane`、`context pane`、`item pane sidenav`、`reader renderToolbar`、`reader sidebar view`、`menu item / collection menu / menu submenu` 与窗口级 + 元素级主题 contract 已具备模板级基线、host action / surface smoke / surface-local evidence；当前批次默认转向交互一致性、贴边布局和复用细节，不把这一轮描述成“UI 已完全封板”
- `details.runtimeSanitization` 已稳定透传到 direct E2E / monitor / gate：本轮 direct E2E 记录了 `exclusiveProjectRuntime=true`，并在启动前终止了 project-managed `watch` `zotero` / `plugin-container`；旧的 startup/RDP bring-up timeout 口径继续只保留为已收口的诊断能力
- 最新 library `pre-capture settle` 继续收敛到 `visibleBannerIDs=[mac-word-plugin-install-container]`；`sync-reminder-container`、`post-upgrade-container`、`file-renaming-banner-container`、`retracted-items-container` 与 `architecture-warning-container` 会在 capture 前被压平，当前 `library / reader` 几何继续保持 `2000x1200`
- `reader` pre-capture settle 本轮已不再被 `hasMatchingWindowState=false` 卡死：当前 direct E2E 会接受 `selectedTabMatched=true` 作为 Reader ready 的等价信号，并在 settle snapshot 中显式记录 `selectedTabID / selectedTabMatched`
- `preference pane`、`context pane` 与 `menu item` 的 surface-local evidence 已在本轮重新对齐到当前语义：`preference pane` 现按 descendant content root + bounded geometry settle 取样，`context pane` baseline 已刷新到 pane fragment，`menu item`/popup 则新增 windowless screen-metrics fallback；`reader sidebar view` 在 live `rect` 缺失时也会按 `windowBounds + sidebarWidth` 合成本地 capture rect，当前 host polish 批次继续把 `item pane sidenav` 与 `reader sidebar view` 的 edge-mode geometry 和显式 degrade contract 收到同一套结果链里
- 当前 `preference pane` 的 host-polish 次批次进一步固定为“窄窗不横向溢出”：`preferences.openPane` 与相关 control actions 会在 `800x600` 宿主边界下回传 root 宽度、layout bucket 与 horizontal overflow 诊断；scenario 主断言改为 `geometry + interaction gate`，不再把 whole-window screenshot 当作 preference pane 正常的首要证据
- `READER-LOW-261` 已把 stage-scoped capture failure 结构化落进既有 E2E / validation 展示链；`READER-LOW-262` 已引入 `capture-command-failed` / `visualPrimaryBlockerKind=capture-command-failed` 并同步 consumer；`READER-LOW-263` 在本轮进一步把 visual screenshot capture 链收口到“优先按 Zotero on-screen window id 采集、避免抓到桌面或重叠窗”的状态，当前主结论已更新为“surface-local evidence fully aligned，whole-window drift 只作为 supplemental `capture-unstable` 诊断保留”
- 最新 release live acceptance 已在 `2026-04-04` 重新补齐 stable / beta 正式安装态 smoke：`release-install-smoke-beta` / `release-install-smoke-stable` 分别在 `2026-04-04T11:51:00.836Z` / `2026-04-04T11:51:01.248Z` 记录 `readinessMode=native`、`apiReady=true`，且剩余 `loading.svg` / `remote-settings.sys.mjs` 已归类为宿主噪声
- 最新 `release-preflight` / `release-plan` / `release-matrix` 已在 `2026-04-04T11:53:52.789Z` / `2026-04-04T11:54:00.719Z` / `2026-04-04T11:54:09.269Z` 刷新为 `远端验证失败 / failed`；`release-plan` 现已显式写入 `workflowState`、`gateContract` 与 `nextSteps`，并要求通过 `npm run agent:release` 记录 `release-plan` 遥测，单独的 `dist/release-plan.json` 不再视为充分 gate 证据
- 最新 `agent:monitor` / `agent:gate:release` 已在 `2026-04-04T11:54:15.771Z` / `2026-04-04T11:54:15.996Z` 消费最新 release artifacts；当前 `gatePassed=false` 的唯一原因是远端 `https://gitee.com/zouser/user/releases/download/1.1/update.json` 虽然 `updateURLHTTPStatus=200`，但未包含 `cleanroom-template@example.com` 首条更新记录，且未提供有效 `update_link`，而不是安装态 smoke 或插件运行时回归
- 当前 Gitee `updateURL` 仅用于这个模板仓库自身的远端发布验收与测试，不作为基于本模板开发的其他插件默认发布地址；下游项目仍需在各自 `config/addon.config.json` 中替换自己的 `addonId` / `homepage` / `updateURL`
- 当前中国法商业交付治理已接入 release-only 门禁：`LEGAL_RISK_CHECKLIST.md` 现新增 China Commercial Delivery Gate，`CODE_PROVENANCE.md`、`THIRD_PARTY_NOTICES.md` 与 `COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md` 已作为模板与 pure-project 导出的默认骨架；开发态 `cleanroom:audit` 继续 advisory，`release:preflight` 才会严格阻断第三方表达污染与交付权利缺口
- 当前 active 开发阻断已清零；fresh `watch -> e2e -> monitor -> gate` 证据链继续闭环通过，`HOST-HIGH-201 / HOST-LOW-301~303` 已转为已收口批次，而 release-only 工程 gap（`ENG-HIGH-104 / ENG-LOW-211~213`）与 Reader deeper event / `P1` 扩面继续只保留为当前剩余 follow-up
<!-- CURRENT-TRUTH-SUMMARY:END -->

以下 meta 块只供脚本读取，不同步到 README、Checklist、Assessment、Roadmap。

<!-- CURRENT-TRUTH-META:START -->
{
  "schemaVersion": 1,
  "activeBatchId": "ENG-HIGH-104",
  "currentWaveName": "ZOTERO-SURFACE-WIND-TUNNEL-WAVE-001",
  "acceptanceTrack": "functional-first -> module taxonomy -> scenario matrix -> coverage gap dashboard -> bottleneck simulation -> local browser server -> static verification -> optional browser smoke",
  "waveStatus": "active"
}
<!-- CURRENT-TRUTH-META:END -->

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
  - 当前已接入 `toolbarDispatchMode`、`toolbarAppendedItemCount`
  - 当前已接入 `sidebarHeaderDispatchMode`、`sidebarHeaderAppendedItemCount`
  - 当前已接入 `contextMenuProbeCount`、`contextMenuObservedTypes`、`contextMenuSyntheticFallbackTypes`
  - 当前 validation / `agent:zotero:e2e` / monitor / dashboard / gate / Obsidian 已能直接展示 `renderToolbar`、文本选择浮层、侧栏批注头的分发方式与追加项数量，以及 context menu 的探针数、已观测类型与 `synthetic-fallback` 类型
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
- 手动受保护 `.xpi` 导出分支
  - 当前可执行 `npm run package:encrypted`
  - 当前可执行 `npm run package:shielded`
  - 当前会生成 `dist/<addonRef>-<addonVersion>-encrypted.xpi`
  - 当前会生成 `dist/<addonRef>-<addonVersion>-shielded.xpi`
  - 当前默认不写 release metadata，不进入 release-only 主线
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
- 已补 release workflow state / gate contract / next steps 合同
  - 当前 `dist/release-plan.json`、`dist/release-notes.md` 与 `dist/release-upload-plan.json` 会同步显示 `workflowState`、`gateContract` 与 `nextSteps`
  - `agent:gate:release` 现要求存在由 `npm run agent:release` 记录的 `release-plan` 遥测；仅有 `dist/release-plan.json` 不再视为充分证据
- 最新本地 release acceptance 已收敛到单一剩余缺口
  - 当前 `release-matrix` stable / beta profile 均已 `passed`
  - 当前整体 `release-matrix` 仍为 `failed`，唯一原因是远端 `update.json` 缺少 `cleanroom-template@example.com` 更新记录
  - 当前 `agent:gate:release` 只会因远端 `update.json` 缺少有效更新记录 / `update_link` 而继续阻断
- `release-install-smoke` 现已在重新打包后同步刷新 `release-preflight`
  - 当前 `release-matrix` 不会再被过期 SHA / size 误伤，而会直接暴露真实 smoke 失败原因

### 还需要做

- 修正当前远端 `https://gitee.com/zouser/user/releases/download/1.1/update.json` 内容，使其包含 `cleanroom-template@example.com` 的首条更新记录
- 让远端 `update.json` 提供有效 `update_link`，并确保它与 `https://gitee.com/zouser/user/releases/download/1.1/cleanroomtemplate-0.1.0.xpi` 一致且可访问
- 修正远端内容后重新执行 `npm run release:preflight -- --verify-remote`
- 远端产物上传与发布编排

### 当前边界

- `npm run release:upload -- --provider <provider> --release-tag <tag> --target-base-url <url>` 当前只生成 `dist/release-upload-plan.{json,md}` 并校验上传合同，不执行真实上传
- 真实远端上传、`update.json` 内容修正与 CDN / Release asset 分发仍是仓库外人工步骤；完成后再按 `release:preflight -- --verify-remote -> release:prepare -> release:matrix -> agent:gate:release` 串行刷新

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
  - 性能诊断增强：heap diff

### 优先级

- 错误边界 / 参数验证
  - 中优先级
- 性能诊断增强（heap diff）
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
- 当前正式文档与 docs consistency 已同步到“`ENG-HIGH-103`、`READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125` 与 `READER-HIGH-126` 均已完成独立收口、`READER-HIGH-123` 仅保留为历史契约源、当前主阻断已清零”的口径

## 建议执行顺序

当前阶段的固定顺序为：

1. 保持 `watch -> e2e -> monitor -> gate` 的 fresh 证据链可重放；如 truth 变化，优先只改 `docs/CURRENT_BACKLOG.md` 的“当前单一事实源”摘要
2. 如只需快速定向当前项目态，可优先读取 `dist/agent-context.json` 的 `runtimeCompact`；一旦涉及 truth、wave、validation 或 scope 判定，立即回到 `docs/CURRENT_BACKLOG.md` 与 mirror
3. 如需收口正式文档 truth，先改 CURRENT truth，再运行 `node scripts/docs-sync-current-truth.mjs`，不要手改四个镜像 marker block
4. `HOST-HIGH-201 / HOST-LOW-301~303` 已收口完成：host-visible polish 继续保留为 completed baseline，不再作为 active batch
5. 当前 active `AGENT-REVIEW-WORKBENCH-WAVE-001` 只覆盖 dev-only review workbench：先收口 `workbench command registration / trigger semantics`、`standalone window` 生命周期、shell lost-tracking live-window fallback、profile-local JSON state store、structured snapshot、annotation CRUD、deterministic plan builder、allowlisted host action summary 与 monitor/gate `reviewWorkbench` acceptance telemetry，不把它误判成产品功能或 AI provider wave
6. `ZOTERO-DOM-CONTRACT-WAVE-001` 已收口完成：继续保留 `domContractReport` route-aware 摘要作为完成波次基线，不把 route 级 DOM contract 失败单独抬回 blocker
7. 当前唯一未收口主线仍是 `ENG-HIGH-104 / ENG-LOW-211~213`：沿现有 `release:plan` / `agent:release` / `agent:gate:release` 链推进远端发布编排与远端 `updateURL` 闭环验证，不改插件 runtime，不回头混写 Reader / startup / freshness
8. Reader 更深事件点与 `P1` 白名单扩面继续保持为独立非阻断后续；若 future fresh `watch -> e2e -> monitor -> gate` 指向新的 blocker kind 或项目准备进入下一波模块扩展，再由 Codex 新开唯一后续高逻辑批次

当前 `READER-HIGH-123` 已收尾完成并转为历史契约源；`ENG-HIGH-103` 的启动诊断与 `settle` 收口也已完成。
当前 `READER-HIGH-124 / READER-LOW-261~263` 已在 live rerun 上证明 capture failure 结构化、`capture-command-failed` blocker 语义与 freshest-valid artifact 选源均已接通，并已转为历史契约 / review artifact。
当前 `READER-HIGH-125` 已完成 library-only 边界冻结并转为历史契约源；`READER-HIGH-126` 也已在 fresh rerun 上完成 library host-noise 修复并恢复 visual baseline 对齐，不重开 baseline refresh、startup / RDP 或 consumer freshness 主线；后续如 truth 再变化，统一以“当前单一事实源”小节与最新 fresh rerun 结果为准。

## 当前不必重复投入的部分

这些方向当前不应再作为主攻：

- 再次证明模板骨架是否存在
- 再次证明基础真机链路是否可用
- 再次证明 Obsidian 工作台是否能生成

这些都已经过了“从 0 到 1”阶段。

## 总结

当前项目已经完成 `ENG-HIGH-103`、`READER-HIGH-124 / READER-LOW-261~263`、`READER-HIGH-125`、`READER-HIGH-126` 与 `HOST-HIGH-201 / HOST-LOW-301~303` 的本轮独立收口；开发态 gate 已回到 ready，而当前唯一未收口主线仍是远端 `update.json / update_link` 的真实分发闭环。下一步在保持 release-only blocker 不变的前提下，当前 active 扩展 wave 切换为一条 dev-only `Agent Review Workbench` 波次，用于把 current truth / evidence 组织成可交互的人机审查层，而不是重开 host-visible polish 或 DOM contract 已完成结论：

- `release / updateURL follow-up`
  - `ENG-HIGH-104 / ENG-LOW-211~213` 作为当前唯一未收口主线继续推进，不回写插件 runtime 或已完成的 host-visible polish
- `completed host-visible polish`
  - `HOST-HIGH-201 / HOST-LOW-301~303` 已完成；`ZOTERO-HOST-POLISH-WAVE-001` 当前转为 completed wave 基线，后续只在 truth 变化或新 wave 启动时再复开
- `dev-only review workbench`
  - `AGENT-REVIEW-WORKBENCH-WAVE-001` 当前 active：只覆盖 `dev-only review workbench`、`JSON state store`、`workbench command registration / trigger semantics`、`route-aware validation summary` 与 `workbench acceptance telemetry`，固定走 `standalone window + plain JS/HTML`，并以 `functional-first -> trigger semantics -> window lifecycle -> structured annotation -> deterministic plan -> workbench acceptance telemetry -> gate summary` 作为验收主线；当前模板 runtime 下若 `agent.reviewWorkbench.open` 只以 plugin-local fallback command 暴露，则不得把注册通过误判成真实 `command palette` / Prompt host-visible 入口通过
  - package boundary 固定为产品包不携带 dev-only metadata：`build-report.json` 不进入 XPI，`descriptor-bind` / `stage2-derive` 不再恢复 dev capability overlay，`dev/agent-runtime/host-actions.js` 等 host-visible action 文件不被 workbench override 降级
- `completed dom contract baseline`
  - `ZOTERO-DOM-CONTRACT-WAVE-001` 已完成：继续通过 `domContractReport` 保留 route-aware DOM contract advisory，不把已收口批次重新拉回 blocker
- `optional bundle baseline`
  - `OPTIONAL-BUNDLE-WAVE-001` 继续作为已完成基线；`react-ui` 保持 implemented + default-disabled，`agent-runtime` / `ai-service` 继续只保留 spec-only，`wasm-kernel` 现已作为 `probe + digest + shadow unlock derivation` 的 `planned + default-disabled` lane 进入 registry，但仍只保留 bundle-local 语义
- `reader deeper event points / P1 whitelist`
  - 继续深化 Reader 更深事件点观测与 `P1` 白名单扩面，但不回退当前稳定 truth
- `truth / delegation guardrails`
  - 保持“`ENG-HIGH-104` 仍是唯一未收口主线、`AGENT-REVIEW-WORKBENCH-WAVE-001` 是当前 active 扩展 wave”的文档 / manifest / docs consistency 口径同步
