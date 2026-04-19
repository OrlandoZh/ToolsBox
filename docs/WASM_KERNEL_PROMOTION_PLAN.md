# Wasm Kernel Promotion Plan

> 用途：把 `wasm-kernel` 是否进入主线仓库、是否进入 optional bundle registry、以及何时能从 PoC 升级为 `implemented + default-disabled` 收成一版可执行的收口计划。
> 范围：这是 Wasm 支线的实施/收口蓝图，不是 current truth；它不改默认 `release` / `agent:gate` / `agent:gate:release`，也不代表当前已经完成 promotion。
> 最后更新：2026-04-19

## 结论先看

当前最合理的判断固定为：

1. `wasm-kernel` **可以进入主线仓库**
2. 进入方式必须是 **default-disabled optional bundle**
3. 当前 **不应**进入 JS core 默认运行路径
4. 当前 **不应**作为 package protection 主线替代
5. 当前 **不应**直接宣告为 `implemented`
6. 正确顺序应是：
   - 先完成真实 probe
   - 再完成 bundle-local validation / export / host wiring
   - 最后才 promotion 到 optional bundle registry

当前还应固定补一句：

- `route5-wasm` 的 package protection 候选已经可以打开
- 但这不等于 `wasm-kernel` 已经升级成 optional bundle 的 `implemented`
- 当前最稳的 route5 结论是：
  - `package:protection:wasm:admission = ready-for-candidate`
  - `shielded-surface-scrub-wasm-digest` 已完成完整证据链
  - 但 retained review 里它仍排在 `shielded-surface-scrub` 之后
  - 因此它当前证明的是“bounded Wasm candidate 可行”，不是“Wasm 已成为更优 protection 主候选”

## 当前判断依据

### 1. 它符合 optional bundle 的治理语义

当前模板已经固定：

- JS core 继续保持稳定、轻依赖、默认可用
- 更重或更特化的能力通过 optional bundle 隔离
- optional bundle 默认禁用，不回灌主链

相关入口：

- [OPTIONAL_BUNDLES.md](./OPTIONAL_BUNDLES.md)
- [config/optional-bundles.json](../config/optional-bundles.json)
- [config/project-validation-overrides.json](../config/project-validation-overrides.json)

### 2. 它不符合当前 JS core 默认基线

Wasm 会引入：

- 二进制资产
- 宿主加载差异
- Worker/CSP 等附加验证项
- 体积与初始化时延成本
- 额外导出与打包约束

这些都不适合自动落到所有下游项目的默认路径中。

### 3. 它当前还缺最后一层“主仓可交付证据”

当前仓库已经有：

- [src/services/wasm-loader.js](../src/services/wasm-loader.js)
- [src/services/wasm-worker.js](../src/services/wasm-worker.js)
- [WASM_DEVELOPMENT_INDEX.md](./WASM_DEVELOPMENT_INDEX.md)

当前已经补齐：

- optional bundle registry 级别的 build/export/validation contract
- disabled contract 下的独立 bundle promotion 证据
- probe / digest 两条 bundle-local smoke 与成本量化证据
- matrix 聚合入口 `npm run wasm:kernel:matrix`

但当前还没有：

- 足以把 `planned` 提升为 `implemented` 的更宽 release/gate 契约
- 一条已经接入真实 overlay gate 的 Wasm 小内核；当前仍只到 shadow-mode unlock derivation
- controller 明确开启的 implemented promotion wave

这意味着它现在已从“纯 PoC 支线”推进到“主仓内 default-disabled optional lane”，但仍不适合作为“已实现 optional bundle”。

当前已补齐：

- 真实 `.wasm` 资产：`addon-static/content/lib/w/probe.wasm`
- 真实 worker probe：`addon-static/content/lib/w/wasm-probe-worker.js`
- 首个真实 micro-kernel：`probe.wasm` 现已导出 `seed / mix / finalize`，可派生稳定 32-bit digest，并承载 shadow-mode host unlock derivation
- Zotero 真机 probe scenario：`rootURI + content/lib/w/...` 与 `chrome://<addonRef>/content/lib/w/...` 已在 live scenario 中通过
- 非默认入口：`runtime.probeWasmKernel`、`runtime.deriveWasmKernelDigest` 与 `runtime.deriveWasmKernelUnlockToken` host action
- 证据聚合入口：`npm run wasm:kernel:matrix` 会汇总 probe/digest 的 smoke、performance 与 disabled-contract 结果，并固定输出 `dist/wasm-kernel-matrix.json` / `md`

### 4. package protection 的 route5 候选已经证明“可保留”，但还没有证明“值得升格”

当前 route5 checkpoint 需要和 optional bundle promotion 严格区分：

- `shielded-surface-scrub-wasm-digest` 当前已经完成：
  - `smoke`
  - `webcrack`
  - `inner audit`
  - `single-pass scorecard`
  - `guided A2/M3`
  - `compare`
  - `attack / matrix / review`
- 当前 package protection 结论固定为：
  - `compare = passed / hardening-win`
  - `evidenceStatus = complete`
  - `registryStatus = retained-experiment-candidate`
  - `promotionGate = bounded-wasm-candidate-only`
- 但 retained review 同时也固定说明：
  - top candidate 仍然是 `shielded-surface-scrub`
  - Wasm candidate 当前 `reviewRank = 3`
  - 它没有继续减少 unpacked support surface
  - 相对 `surface-scrub` 还有额外 `xpi / bundle / prepare / decode` 成本

这条经验的落点应固定为：

- `route5-wasm` 已经证明“不会自动破坏 protection 主线”
- 但它当前还没有证明“值得替代当前 top retained candidate”
- 因此 optional bundle 侧不应把这次 route5 实验误读成：
  - `wasm-kernel` 已经是 `implemented`
  - 或 `Wasm` 已经变成默认更优的 protection 路线

## 目标形态

### 最终定位

目标是新增一个 `wasm-kernel` optional bundle，满足：

- `enabled = false`
- 默认不影响 `npm run build`
- 默认不影响 `npm run package`
- 默认不影响 `npm run check`
- 只有显式启用或显式构建时，才引入 Wasm 资产和 bundle-local smoke

### 不变项

promotion 后也不应改变：

- 默认 `release` 主线仍以 plain package 为准
- package protection 主线仍以 `encrypted / shielded` 为准
- JS core 不因 Wasm bundle 而新增强依赖
- 未启用 bundle 时，宿主启动链不多一步初始化

## 推荐 bundle 形态

### bundle id

建议固定为：

- `wasm-kernel`

### lane

短期建议：

- 暂时沿用现有 registry 可接受的简单表达，不强行新开 lane 语义

推荐落法：

- `lane = "js-core"`

原因：

- 当前 registry 只认很轻的 lane 语义
- 真实 Wasm 资产仍会被 JS wrapper 隔离在 optional bundle 后面
- 现在新增一个全新的 lane 类型，会扩大治理面但收益有限

注意：

- 文档里必须明确这不是“纯 JS service”
- 它是 “JS wrapper + binary asset + optional host wiring”

如果未来出现第二个以上 Wasm lane，再考虑把它们统一抽成新 lane，例如：

- `asset-isolated`

### implementation status

当前建议：

- 现在可以写进 registry
- 但只允许写成 `planned + default-disabled`

完成 disabled contract、build/export contract 与成本量化后，才允许写成：

- `implementationStatus = "implemented"`

当前可接受的 registry 落法固定为：

- `implementationStatus = "planned"`

## 推荐目录布局

### Phase 1：probe 形态

建议目录：

- `addon-static/content/lib/w/`
- 可选 `src/features/wasm-kernel-demo.js`

最小资产：

- `addon-static/content/lib/w/probe.wasm`
- `addon-static/content/lib/w/wasm-probe-worker.js`

说明：

- `.wasm` 资产放在插件包内
- worker 脚本同样放在插件包内
- 主线程优先走 `rootURI + content/...`
- `ChromeWorker` 优先走 `chrome://<addonRef>/content/...`

### Phase 2：bundle 形态

若 promotion 成功，建议固定为：

- `addon-static/content/lib/w/<bundle assets>`
- `addon-static/content/lib/w/<bundle workers>`
- `src/features/wasm-kernel-*.js`
- 可选 `src/app/optional-bundles` 接线

不建议：

- 把 `.wasm` 塞进 `src/`
- 把所有 Wasm 调用点散落到核心 feature 中
- 让主启动链无条件初始化 Wasm

## Promotion Gate

只有满足以下条件，`wasm-kernel` 才允许从 PoC 升到 optional bundle registry。

### Gate 1：真实资产存在

必须有：

- 至少一个真实 `.wasm` 资产
- 至少一个真实 worker 或明确证明 worker 不是必需

不能只靠：

- mock bytes
- 测试内联最小模块
- 纯文档说明

### Gate 2：真机 `rootURI` smoke 通过

必须证明：

- Zotero 真机中能通过 `rootURI + relative path` 找到 `.wasm`
- 能成功完成 `fetch/arrayBuffer/instantiate`

至少要有一轮：

- 安装态
- 启动态
- 首次加载态

### Gate 3：disabled contract 成立

必须证明：

- bundle 默认禁用时，不影响默认 build/package/check
- 禁用时，宿主不多出初始化成本
- 禁用时，不需要额外依赖下载

当前建议的最小证据入口固定为：

- `npm run wasm:kernel:disabled-contract`
- `npm run wasm:kernel:matrix`

该报告至少应汇总：

- registry 仍是 `planned + enabled=false`
- 默认 `build / package / check` 脚本不主动调用 Wasm lane
- `runtime.probeWasmKernel` / `runtime.deriveWasmKernelDigest` 仍通过惰性 getter 首次创建 Wasm runtime
- source/build/export 继续保留 `.wasm` / worker / wrapper / report 脚本
- 最近一轮 bundle-local smoke 仍通过

### Gate 4：bundle-local validation contract 成立

必须明确：

- 哪些文件变动属于 `wasm-kernel` lane
- 哪些改动只要求 bundle-local smoke
- 哪些改动才需要更高层宿主验证

必须避免：

- 把 Wasm bundle 验证强塞到默认 `agent:gate`
- 把 worker/CSP 问题升级成与当前 active wave 无关的 blocker

### Gate 5：export contract 成立

必须证明：

- `export:project` 保留所需 `.wasm` / worker / scripts
- 导出后 bundle 依然具备明确的说明与入口
- 未启用 bundle 的纯项目导出不被强迫安装额外依赖

### Gate 6：成本已量化

至少记录：

- 包体积增加
- 初始化时延
- 首次调用时延
- 主线程/worker 两种形态差异

没有这层数据，不允许直接写成 “implemented”。

## 验证矩阵

### A. 默认禁用矩阵

验证目标：

- `npm run build`
- `npm run package`
- `npm run check`

期望：

- 全部不依赖 Wasm 资产启用
- 不新增主链失败

### B. bundle-local smoke

验证目标：

- 手动启用 `wasm-kernel`
- 构建并打包
- 加载 probe

最低要求：

- `rootURI + wasm`
- 可选 `rootURI + worker`
- 最小 host action 或 debug probe

### C. Zotero 真机 smoke

验证目标：

- XPI 安装
- 启动后首次加载 probe
- 若启用 Worker，再验证 worker init + request/response

### D. protection relevance

这一步不是 optional bundle promotion 的阻断项，但建议同时记录：

- 是否能承接 `deriveUnlockToken()` 之类的小内核
- `webcrack + AI` 对小内核的恢复层级是否明显下降

## 推荐实施顺序

### Step 1：真实 probe

先完成：

- `addon-static/content/lib/w/probe.wasm`
- `addon-static/content/lib/w/wasm-probe-worker.js`
- 一条手动 probe 入口

### Step 2：bundle-local wiring

再补：

- feature wrapper
- host action 或 debug probe
- bundle-local docs

### Step 3：validation / export contract

再补：

- validation override
- export 保留
- toolchain scripts
- bundle-local smoke 采样脚本（当前为 `npm run wasm:kernel:smoke`）
- probe 级成本报告脚本（当前为 `npm run wasm:kernel:perf`）
- matrix 聚合脚本（当前为 `npm run wasm:kernel:matrix`）

### Step 4：registry promotion

最后才改：

- [config/optional-bundles.json](../config/optional-bundles.json)
- [docs/OPTIONAL_BUNDLES.md](./OPTIONAL_BUNDLES.md)
- 必要时再同步 validation / expansion / current truth

## 当前明确不做

本轮 promotion plan 明确不包含：

- 把 Wasm 提升为默认 JS core 基线
- 把 Wasm 并入当前 package protection 主线
- 把 `CURRENT_BACKLOG` 改写成 Wasm active wave
- 在没有 disabled contract / build-export 证据前直接写成 `implemented`
- 在没有成本量化前直接写 `implemented`

## 当前推荐结论

当前推荐状态固定为：

- `仓库内基础层`: 已可保留
- `promotion to optional bundle`: 可以规划
- `立即进入 registry`: 可以，但仅限 `planned + default-disabled`
- `promotion target`: `default-disabled optional bundle`
- `next concrete step`: disabled contract + build/export contract，而不是继续泛化讨论

## 关联入口

- [WASM_DEVELOPMENT_INDEX.md](./WASM_DEVELOPMENT_INDEX.md)
- [OPTIONAL_BUNDLES.md](./OPTIONAL_BUNDLES.md)
- [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md)
