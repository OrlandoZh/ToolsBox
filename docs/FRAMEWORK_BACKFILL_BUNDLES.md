# Framework Backfill Bundles

> Generated from `config/framework-backfill-bundles.json`. Edit the registry and run `npm run docs:sync-backfill-bundles`.

## Governance Goal

- 模板只治理可复用的 clean-room 宿主能力、验证链、门禁与升级护栏；产品阶段策略、产品 UI 语义、产品专项验证路径默认留在项目侧。

## AGENTS Rule Policy

- 下游项目可以对 AGENTS 规则做产品化表述，但不得改变治理语义。
- 模板审计以 matcher label 对应的治理意图为准，而不是逐字复读模板原句。

## Bundle Admission Rules

1. 第二个项目也出现同类需求
2. 已抽出不依赖产品命名的通用契约
3. 已能为该能力定义稳定的 tests + package/AGENTS 接线要求

## Bundles

### `workspace-init-guard-v1`

- Version: `1`
- Lifecycle: `active`
- Summary: 防止模板复制、仓库迁移或旧工件残留后继续读取错误仓库路径，并把工作区初始化提升为显式 warn/fail 门禁。
- Required Files:
  - `scripts/agent-workspace-guard-lib.mjs`
  - `scripts/agent-workspace-guard.mjs`
  - `scripts/init-workspace.mjs`
- Required Package Scripts:
  - `agent:workspace:guard` = `node scripts/agent-workspace-guard.mjs`
  - `agent:workspace:guard:strict` = `node scripts/agent-workspace-guard.mjs --strict`
  - `init:workspace` = `node scripts/init-workspace.mjs`
  - `check` includes `npm run agent:workspace:guard`
  - `agent:gate` includes `npm run agent:workspace:guard:strict`
  - `agent:gate:release` includes `npm run agent:workspace:guard:strict`
- Required AGENTS Rules:
  - 首次复制模板、迁移仓库或怀疑串目录时，先执行 init:workspace。
  - check 对缺失 init 记录只告警，gate/release gate 严格阻断。
  - init:workspace 会清理携带仓库路径的 agent 工件。
- Required Tests:
  - `agent-workspace-guard-lib.test.js`
  - `toolchain.test.js`
- Non-Goals:
  - 产品特定的 Obsidian 内容组织
  - 产品特定的视觉策略
  - 某个项目自己扩展的人工处理流程

### `validation-decision-v1`

- Version: `1`
- Lifecycle: `superseded`
- Superseded By: `validation-decision-v2`
- Summary: 把是否需要视觉验证从隐式经验改成结构化判定，避免所有问题默认停在视觉审查。
- Required Files:
  - `scripts/agent-validation-decision-lib.mjs`
  - `scripts/agent-gate.mjs`
- Required Package Scripts:
  - `agent:gate` includes `node scripts/agent-gate.mjs --profile dev`
  - `agent:gate:release` includes `node scripts/agent-gate.mjs --profile release`
- Required AGENTS Rules:
  - 先判断变更是否真的触达 UI / 交互 / 视觉基线，不要默认走视觉审查。
  - 只有真实可见面改动才升级为 visual-required，不要因项目阶段把所有批次都拉回 strict visual。
  - visual-required 缺证据才是主阻断。
  - visual-recommended 先闭功能环，再补视觉证据。
  - visual-not-needed 优先依赖 check、运行时验证、E2E、门禁和 provenance。
  - validation contract 不得覆盖独立严格阻断；存在更具体的恢复动作时，优先执行具体恢复动作。
  - 远端 provider 缺 key 但本轮不验该闭环时，只记建议，不作为主阻断。
- Required Tests:
  - `agent-validation-decision-lib.test.js`
  - `agent-telemetry.test.js`
  - `toolchain.test.js`
- Non-Goals:
  - agent:zotero:e2e:strict
  - Phase D / strict visual 等阶段性视觉收口路径
  - Reader visual drift、baseline refresh、visual autofix 的产品特定规则
  - 直接绑定某个产品 UI 结构、命名或 delegation prompt 的诊断字段

### `validation-decision-v2`

- Version: `2`
- Lifecycle: `active`
- Summary: 把视觉验证决策升级为 validation domain contract + project override mirror + runtime escalation，避免只凭粗路径把所有批次拉回 strict visual。
- Required Files:
  - `config/validation-domains.json`
  - `config/project-validation-overrides.json`
  - `scripts/agent-validation-decision-lib.mjs`
  - `scripts/agent-gate.mjs`
- Required Package Scripts:
  - `agent:gate` includes `node scripts/agent-gate.mjs --profile dev`
  - `agent:gate:release` includes `node scripts/agent-gate.mjs --profile release`
- Required AGENTS Rules:
  - 先判断变更是否真的触达 UI / 交互 / 视觉基线，不要默认走视觉审查。
  - 只有真实可见面改动才升级为 visual-required，不要因项目阶段把所有批次都拉回 strict visual。
  - 项目阶段不等于视觉阻断；只认 validation contract + runtime signal。
  - visual-required 缺证据才是主阻断。
  - visual-recommended 先闭功能环，再补视觉证据。
  - visual-not-needed 优先依赖 check、运行时验证、E2E、门禁和 provenance。
  - 远端 provider 缺 key 但本轮不验该闭环时，只记建议，不作为主阻断。
- Required Tests:
  - `agent-validation-decision-lib.test.js`
  - `agent-telemetry.test.js`
  - `toolchain.test.js`
- Non-Goals:
  - agent:zotero:e2e:strict
  - Phase D / strict visual 等阶段性视觉收口路径
  - Reader visual drift、baseline refresh、visual autofix 的产品特定规则
  - 直接绑定某个产品 UI 结构、命名或 delegation prompt 的诊断字段

### `expansion-wave-scaffold-v1`

- Version: `1`
- Lifecycle: `active`
- Summary: 把二阶段模块扩展收口为 expansion wave contract + project mirror + archetype-driven validation scaffold，避免新波次默认继承旧的 strict visual 或产品阶段结论。
- Required Files:
  - `config/expansion-wave-contracts.json`
  - `config/project-expansion-wave.json`
  - `docs/EXPANSION_WAVE_CONTRACTS.md`
  - `scripts/expansion-wave-contracts-lib.mjs`
  - `scripts/docs-sync-expansion-wave-contracts.mjs`
- Required Package Scripts:
  - `docs:sync-expansion-wave-contracts` = `node scripts/docs-sync-expansion-wave-contracts.mjs`
- Required AGENTS Rules:
  - 进入下一波模块扩展前，先在 truth 和 project mirror 中声明当前 wave，而不是直接沿用旧的产品阶段结论。
  - 未声明 wave 时，不应把新模块直接并入既有 strict visual 或产品阶段路径；先按 archetype 决定验证入口。
  - 模板只治理如何进入下一波扩展，不替下游决定具体产品模块。
- Required Tests:
  - `expansion-wave-contracts-lib.test.js`
  - `expansion-wave-contracts.test.js`
  - `framework-backfill-bundles-lib.test.js`
  - `toolchain.test.js`
- Non-Goals:
  - AIAssistant 的 Phase D strict visual
  - embeddings / connector / outline / obsidian 这类产品级模块命名
  - 任何产品特定 UI 语义、阶段策略或发布节奏

### `host-interface-contract-v1`

- Version: `1`
- Lifecycle: `active`
- Summary: 把 Zotero 插件 API 包装层的修改固化为基于宿主源码的 contract mirror + guard，避免接口包装层凭经验漂移。
- Required Files:
  - `config/zotero-host-interface-contracts.json`
  - `docs/ZOTERO_HOST_INTERFACE_CONTRACTS.md`
  - `scripts/zotero-host-interface-contract-lib.mjs`
  - `scripts/zotero-host-interface-guard.mjs`
  - `scripts/docs-sync-zotero-host-interface-contracts.mjs`
- Required Package Scripts:
  - `docs:sync-zotero-host-interface-contracts` = `node scripts/docs-sync-zotero-host-interface-contracts.mjs`
  - `agent:host:guard` = `node scripts/zotero-host-interface-guard.mjs`
  - `agent:host:guard:strict` = `node scripts/zotero-host-interface-guard.mjs --strict`
  - `check` includes `npm run agent:host:guard`
  - `agent:gate` includes `npm run agent:host:guard:strict`
  - `agent:gate:release` includes `npm run agent:host:guard:strict`
- Required AGENTS Rules:
  - 触达宿主接口包装层或 types/features.d.ts 时，先对齐 host interface contract，并基于宿主源码决定是否修改包装层。
  - 不允许仅根据 E2E 症状、历史实现或猜测新增/删改宿主接口字段。
  - 若宿主源码已变化而 contract mirror 尚未更新，应先更新 contract/doc/tests，再改实现。
  - 宿主接口包装层变更时，优先运行 agent:host:guard，不要只靠运行时回归倒推接口漂移。
- Required Tests:
  - `zotero-host-interface-contract-lib.test.js`
  - `zotero-host-interface-contracts.test.js`
  - `toolchain.test.js`
- Non-Goals:
  - src/platform/zotero-host.js 这类没有稳定官方插件 API 锚点的宿主适配逻辑
  - agent:zotero:* 诊断链、展示链和产品专项恢复策略
  - Reader visual drift、baseline refresh、visual autofix 等产品特定视觉能力
  - 任何绑定 Reader/Zotero/UI 模仿命名的 delegation prompt 与诊断字段

### `host-semantic-index-v1`

- Version: `1`
- Lifecycle: `active`
- Summary: 把 Zotero 宿主字段、枚举、事件与 surface 语义冻结为 semantic index + guard，避免 agent 仅凭位置描述或历史实现发明接口名词。
- Required Files:
  - `config/zotero-host-semantic-index.json`
  - `docs/ZOTERO_HOST_SEMANTIC_INDEX.md`
  - `scripts/zotero-host-semantic-index-lib.mjs`
  - `scripts/zotero-host-semantic-index-guard.mjs`
  - `scripts/docs-sync-zotero-host-semantic-index.mjs`
- Required Package Scripts:
  - `docs:sync-zotero-host-semantic-index` = `node scripts/docs-sync-zotero-host-semantic-index.mjs`
  - `agent:host:semantic:guard` = `node scripts/zotero-host-semantic-index-guard.mjs`
  - `agent:host:semantic:guard:strict` = `node scripts/zotero-host-semantic-index-guard.mjs --strict`
  - `check` includes `npm run agent:host:semantic:guard`
  - `agent:gate` includes `npm run agent:host:semantic:guard:strict`
  - `agent:gate:release` includes `npm run agent:host:semantic:guard:strict`
- Required AGENTS Rules:
  - 触达宿主包装层或 types/features.d.ts 时，先看 terminology guide、host interface contract、host semantic index 与 reference。
  - 不允许仅根据历史实现、E2E 症状或模糊位置描述发明字段名、按钮名、面板名或事件名。
  - 宿主语义命名或 field surface 变更时，优先运行 agent:host:semantic:guard。
- Required Tests:
  - `zotero-host-semantic-index-lib.test.js`
  - `zotero-host-semantic-index.test.js`
  - `toolchain.test.js`
- Non-Goals:
  - 产品自己的 UI copy、布局与业务模块命名
  - strict visual / baseline refresh / visual autofix 的产品节奏
  - 把 Zotero reference 实现代码直接转成模板运行时代码

### `surface-verification-v1`

- Version: `1`
- Lifecycle: `active`
- Summary: 把真实可见面验证收口为 host-visible surface contract + project mirror，要求 surface smoke 先于整窗视觉基线成为 UI 真实性入口。
- Required Files:
  - `config/validation-surfaces.json`
  - `config/project-validation-surfaces.json`
  - `docs/VALIDATION_SURFACES.md`
  - `scripts/validation-surfaces-lib.mjs`
  - `scripts/docs-sync-validation-surfaces.mjs`
- Required Package Scripts:
  - `docs:sync-validation-surfaces` = `node scripts/docs-sync-validation-surfaces.mjs`
- Required AGENTS Rules:
  - 真实 host-visible surface 先过 surface smoke，再谈视觉基线。
  - 整窗截图不能在 surface truth 缺失时单独代表 UI 正常。
  - 模板只治理真实 surface 的验证方式，不替下游规定产品布局或 strict visual 节奏。
- Required Tests:
  - `validation-surfaces-lib.test.js`
  - `validation-surfaces.test.js`
  - `framework-backfill-bundles-lib.test.js`
  - `toolchain.test.js`
- Non-Goals:
  - AIAssistant 的具体 Reader Chat 布局、文案或 Phase D strict visual 节奏
  - 整窗视觉算法、baseline 采集细节或 visual autofix 产品策略
  - 把产品专用 surface 名称、模块名或交互文案直接抽成模板默认
