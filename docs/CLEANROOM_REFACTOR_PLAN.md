# Clean-room 架构重构计划（设置治理与可扩展性）

本文给出一份基于当前代码逻辑的系统性重构计划，目标是：

- 保持 clean-room 合规边界
- 借鉴 BibGenie 的“设置治理模式”（不是代码）
- 提升当前插件模板的架构层级、可扩展性与 agent 友好度

## 当前进展（2026-03-20）

Phase 1 已完成第一批落地（MVP）：

1. 新增 `src/settings/` 子系统骨架：
- `schema.js`（schema 组装）
- `validator.js`（类型/枚举校验）
- `migrations.js`（版本迁移管线）
- `store.js`（settings store）
- `index.js`（统一导出）

2. `src/app/plugin.js` 已接入 settings 层：
- 使用 `createSettingsSystem(...)` 初始化设置系统
- 保留 `prefs` 兼容别名，避免破坏现有 API
- 新增 `api.settings` 暴露

3. 新增 `tests/settings.test.js`，并接入 `tests/run-all.js`。

4. 全量回归已通过：`npm test`（100/100）。

Phase 2 已完成第一批拆分（MVP）：

1. 新增 `src/app/window-runtime.js`：
- 抽离窗口生命周期阶段机（`idle/starting/running/stopping`）。

2. 新增 `src/app/kernel.js`：
- 抽离插件启动/关闭编排与设置监听挂载逻辑。

3. 新增 `src/app/plugin-api.js`：
- 抽离统一 API 冻结与导出逻辑。

4. 新增 `src/app/plugin-agent.js`：
- 抽离 agent 场景执行与诊断收集逻辑。

5. `src/app/plugin.js` 已降级为“组合与装配为主”的薄层，行为保持兼容。

6. 新增测试：
- `tests/kernel.test.js`
- `tests/plugin-agent.test.js`

7. 全量回归已通过：`npm test`（104/104）。

Phase 2 持续推进（第二批）：

1. 新增 `src/app/feature-composer.js`：
- 抽离 baseline feature 注册逻辑（命令、菜单、ItemPane、ItemTree、Notifier）。

2. `src/app/plugin.js` 继续瘦身：
- 由 635 行降到 476 行，进一步聚焦“装配与组合”职责。

3. 新增测试：
- `tests/feature-composer.test.js`

4. 全量回归已通过：`npm test`（106/106）。

Phase 3 已完成第一批落地（MVP）：

1. 新增服务层骨架：
- `src/services/registry.js`
- `src/services/index.js`

2. `plugin` 已接入 service registry：
- 启动阶段接入 `startServices`
- 关闭阶段接入 `stopServices`
- API 暴露 `serviceRegistry`

3. agent 自检已并入服务健康摘要字段：
- `serviceTotal`
- `serviceHealthyCount`
- `serviceUnhealthyCount`
- `serviceHealthOK`
- `serviceStatus`

4. E2E 判定已能识别服务健康异常：
- `scripts/zotero-agent-runtime-lib.mjs` 已回传服务检查字段
- `scripts/agent-zotero-e2e-lib.mjs` 已纳入服务异常 issue/hint 生成

5. 新增测试：
- `tests/service-registry.test.js`
- `tests/agent-zotero-e2e-lib.test.js`（服务健康异常用例）

6. agent 闭环已接入服务健康透传：
- `scripts/agent-zotero-validation-lib.mjs` 已统一汇总 `serviceTotal / serviceHealthyCount / serviceUnhealthyCount / serviceHealthOK / serviceStatus`
- `scripts/agent-monitor.mjs` 已在 Markdown 摘要中展示服务健康概览与服务问题
- `scripts/agent-dashboard.mjs` 已在真机闭环卡片展示服务状态、健康服务比例与服务问题
- `scripts/agent-gate.mjs` 已把服务异常纳入开发态质量闸门

7. 新增测试：
- `tests/agent-zotero-validation-lib.test.js`（服务健康摘要用例）
- `tests/agent-telemetry.test.js`（monitor/dashboard/gate 服务健康透传用例）

8. 全量回归已通过：`npm test`（111/111）。

## 1. 目标与约束

### 1.1 重构目标

1. 将 `plugin.js` 的编排职责拆分为可测试的子层。
2. 将“偏好配置”升级为“设置系统”，支持分组、校验、迁移、能力开关。
3. 引入轻量服务生命周期层，支撑可选能力按需启停。
4. 让 agent 闭环能够识别设置/服务层问题并给出结构化诊断。

### 1.2 约束条件

1. 不引入 reference 项目的代码，不复制其实现结构细节。
2. 不破坏现有命令链路（`zotero:*`, `agent:*`）。
3. 每个阶段都必须有可回归测试，避免“大爆炸式”改造。
4. 保持当前零运行时外部依赖策略。

## 2. 目标架构（重构后）

### 2.1 分层建议

1. `Bootstrap Layer`
- 负责宿主桥接、生命周期入口、运行时上下文注入。

2. `Kernel Layer`
- 负责插件实例状态机、模块装配、统一错误边界。

3. `Settings Layer`
- 负责设置 schema、默认值、校验、迁移、监听、文档化导出。

4. `Service Layer`
- 负责可选服务注册、启停、健康检查、资源回收。

5. `Feature Layer`
- 负责 UI 和 Zotero 功能集成（item-pane/item-tree/menu/reader 等）。

6. `Agent Contract Layer`
- 负责把设置/服务状态暴露给 e2e/monitor/gate/autofix。

### 2.2 关键新增能力

1. `settings schema registry`
- 定义键名、类型、默认值、范围、说明、是否重启生效、关联能力。

2. `settings migration pipeline`
- 为未来版本设置变更提供向前兼容迁移。

3. `service registry`
- 可选服务统一声明 `id/start/stop/healthCheck/enabledBy`。

4. `capability manifest`
- 将功能能力与设置、服务、测试场景建立映射。

## 3. 分阶段执行计划

### Phase 0：基线冻结与风险护栏

目标：确保重构前后可对比。

任务：

1. 固化当前基线产物：
- `npm test`
- `npm run agent:monitor`
- `npm run agent:gate`

2. 补一份“重构前快照”文档（关键命令、状态文件、风险点）。

验收：

1. 基线快照存在于 `docs/`。
2. 所有核心测试绿灯后才允许进入 Phase 1。

### Phase 1：设置系统升级（优先）

目标：从 `prefs store` 升级到 `settings system`。

计划新增文件：

1. `src/settings/schema.js`
2. `src/settings/validator.js`
3. `src/settings/migrations.js`
4. `src/settings/store.js`
5. `src/settings/index.js`

计划改造文件：

1. `src/core/prefs.js`（降级为兼容适配层）
2. `src/app/plugin.js`（改为通过 settings API 取值）
3. `config/addon.config.json`（增加设置分组元信息）

关键设计：

1. 设置键命名分组：
- `settings.core.*`
- `settings.ui.*`
- `settings.agent.*`
- `settings.services.*`

2. 每个设置项包含：
- 类型、默认值、约束、描述、变更副作用（热更新/需重启）。

3. 写入流程：
- validate -> normalize -> persist -> emit change event。

验收：

1. 旧设置接口仍可用（兼容窗口）。
2. 新 settings 层有单元测试覆盖验证与迁移。
3. `plugin.start()` 仅依赖 settings 层，不再直接依赖裸 prefs 细节。

### Phase 2：Kernel 与装配拆分

目标：降低 `plugin.js` 复杂度，形成清晰装配边界。

计划新增文件：

1. `src/app/kernel.js`
2. `src/app/feature-composer.js`
3. `src/app/window-runtime.js`
4. `src/app/plugin-api.js`

计划改造文件：

1. `src/app/plugin.js`（缩减为 thin facade）
2. `src/main.js`（仅负责启动入口与实例挂载）

关键设计：

1. `kernel` 管理阶段状态机与错误边界。
2. `feature-composer` 专门负责 feature 注入顺序与依赖组装。
3. `window-runtime` 专门负责窗口级 mount/unmount 逻辑。

验收：

1. `plugin.js` 代码体积明显下降。
2. 原有 API 兼容。
3. 生命周期测试无回归。

### Phase 3：服务层与重资源治理

目标：引入可选服务架构，借鉴 wasm 桥接治理模式。

计划新增文件：

1. `src/services/registry.js`
2. `src/services/contracts.js`
3. `src/services/resource-loader.js`（通用幂等 init/dispose 模板）
4. `src/services/health.js`

关键设计：

1. 服务统一接口：
- `start(ctx)`
- `stop(ctx)`
- `healthCheck(ctx)`
- `getDiagnostics()`

2. 对重资源能力采用：
- 并发初始化保护
- 多路径加载策略
- 二进制/完整性校验
- 显式资源释放

验收：

1. 至少一个示例服务接入并可被开关控制。
2. shutdown 保证服务清理无残留。
3. 相关测试覆盖启动失败、重复启动、资源释放场景。

### Phase 4：Agent 链路接入设置/服务诊断

目标：把设置层和服务层纳入自动闭环。

计划改造文件：

1. `scripts/agent-zotero-e2e-lib.mjs`
2. `scripts/agent-zotero-diagnosis-lib.mjs`
3. `scripts/agent-zotero-validation-lib.mjs`
4. `scripts/agent-monitor.mjs`
5. `scripts/agent-gate.mjs`
6. `scripts/agent-dashboard.mjs`

关键设计：

1. 新增诊断指纹：
- `settings:invalid-value`
- `settings:migration-failed`
- `service:<id>:unavailable`
- `service:<id>:health-degraded`

2. gate 规则增强：
- 可区分“功能逻辑失败”和“服务未就绪/设置异常”。

验收：

1. monitor/dashboard 显示设置与服务健康摘要。
2. gate 能对设置/服务异常给出明确中文建议动作。

### Phase 5：能力清单与开发者体验收口

目标：形成可持续扩展模板。

任务：

1. 新增 `docs/SETTINGS_SCHEMA.md`。
2. 新增 `docs/SERVICE_CONTRACTS.md`。
3. 新增 `docs/CAPABILITY_MANIFEST.md`。
4. 把“新增 feature / 新增 service / 新增 setting”的模板步骤写入 `docs/GUIDE.md`。

验收：

1. 文档可驱动新增能力，不依赖口头知识。
2. 新增模块必须附带对应测试与能力声明。

## 4. clean-room 合规策略

1. 只借鉴模式：
- 设置分组、服务启停、资源治理、生命周期门控。

2. 不借鉴实现：
- 不复制 reference 代码、命名、文件组织细节。

3. 过程留痕：
- 每阶段提交前更新 `LEGAL_RISK_CHECKLIST.md` 对应条目。

## 5. 里程碑与完成定义

### M1（Phase 1 完成）

1. 设置系统可用，兼容旧 prefs 读写。
2. 单测通过。

### M2（Phase 2 完成）

1. `plugin.js` 成为薄编排层。
2. 生命周期回归全绿。

### M3（Phase 3+4 完成）

1. 服务层接入并纳入 agent 诊断。
2. gate/monitor/dashboard 可识别设置与服务类问题。

### M4（Phase 5 完成）

1. 文档闭环完成，可独立扩展。
2. 模板进入“高可扩展 + agent 友好”状态。

---

执行建议：

- 先落地 Phase 1 与 Phase 2，再推进服务层。
- 每阶段末尾必须跑一次全量回归：`npm test`。
