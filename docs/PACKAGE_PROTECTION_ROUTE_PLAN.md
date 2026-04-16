# Package Protection Route Plan

> 用途：把“整体保护导出路线”收成一个可执行的阶段方案，避免后续讨论在 `encrypted / shielded / 语义减噪 / route 4 / Wasm` 之间来回跳。
> 范围：这是策略与实验路线文档，不是 current truth；它不改变默认 `release` / `agent:gate` 主线。
> 更新时间：2026-04-16

## 结论先看

当前保护导出路线应固定分成五层来看：

1. `plain`：控制组与默认 release 发布包
2. `encrypted`：当前最稳的低开销手动受保护导出分支
3. `shielded`：当前更强的本地手动受保护分支，但必须坚持 `loader-lite`
4. `protected-only inner semantic scrub`：下一步真正值得优先推进的 hardening 方向
5. `路线 4 / Wasm`：只作为后续增强分支，不替代当前本地受保护导出主路线

当前整体判断是：

- 当前最稳的人工导出基线仍是 `package:encrypted`
- 当前更高阻力分支仍是 `package:shielded`
- 下一步不该回到重 loader、`sidecar` 或 hostile runtime
- 下一步也不该直接跳到服务端主导或 Wasm
- **下一步最值得优先验证的是：inner bundle 在解密后暴露给 AI 的高层语义锚点，能否在 protected-only 路线下继续减噪**

## 威胁模型分层

### 当前目标

当前保护导出路线只服务于一个边界清晰的目标：

- 阻碍普通开发者
- 阻碍一键自动化工具
- 阻碍一轮 AI 快速自动化直读

### 当前非目标

当前不把以下目标作为 v1 要求：

- 对抗专业逆向人员
- 把客户端包装描述成真正的 secrets protection
- 用本地加密承担真正授权根
- 把默认 release 主线升级为受保护导出主线

## 当前固定路线

### A. 默认主线

- `npm run package`
- 继续用于默认发布包与远端发布闭环
- 继续受 `release-only blocker` 约束

### B. 当前最稳保护分支

- `npm run package:encrypted`
- 这是当前最稳的低开销保护导出分支
- 适合“提高随手解包和直读源码门槛”

### C. 当前更强保护分支

- `npm run package:shielded`
- 当前有效形态固定为：
  - 主 bundle 混淆
  - AES 包装
  - loader-lite 硬化
- 继续明确禁止：
  - 重 loader
  - hostile runtime 选项
  - 为了增加阻力而把首次加载重新拖回卡顿

### D. 当前正式手动实验收口链

- `package:protection:smoke`
- `package:protection:score`
- `package:protection:verdict`

这条链回答的问题是：

- 功能兼容有没有回归
- 安装态和启动态是否稳定
- 当前手工评分有没有达到既定威胁模型

它**不**回答的问题是：

- 当前 raw export 还暴露了哪些高层语义锚点
- 下一轮 hardening 应该优先 trim loader 还是 trim inner bundle semantics

## 下一步优先级

### 当前最高优先级：inner semantic scrub

这轮路线规划固定认定：

- 当前 raw protected export 的表面治理已不是第一优先级
- 下一步应优先做 `protected-only inner semantic scrub`
- 目标是减少 AI 在解密后对插件高层架构的快速归纳能力

第一批优先关注的语义锚点固定为：

- `plugin.api.agent.*`
- `runAgentAction`
- `listAgentCapabilities`
- `getPackageProtectionSummary`
- `getLifecycleTelemetrySummary`
- `capabilityManifest.entrypoints`
- `capabilityManifest.ownedBy`
- `capabilityManifest.successSignals`
- `serviceRegistry`
- `optionalBundles`
- `agent-runtime`
- `ai-service`

这些文本之所以优先，不是因为它们会破坏宿主契约，而是因为它们能显著帮助 AI 一轮内完成“这是一个怎样的框架、有哪些能力面、下一步该往哪层看”的高层归纳。

### 当前明确不优先的路线

这一轮明确不优先推进：

- 重 loader
- `shielded-sidecar`
- hostile runtime options
- 把启动主链绑定到远端
- 把 `sqlite + 本地解密` 当成主要防盗版能力
- 在没有语义减噪证据前直接引入更重的 obfuscator 组合

## 分阶段推进方案

### Stage 0：当前稳定基线

当前已完成：

- `encrypted stable` / `shielded stable` / `shielded beta` smoke 闭环
- `decodeMethod=fromBase64` 的 fast path 收口
- `loader-lite` 兼容性基线
- `smoke -> score -> verdict` 手动收口链

### Stage 1：raw export 语义泄露盘点

目标：

- 不改实现
- 只审计当前导出物暴露了什么
- 确认“下一步该 trim 哪一层”

当前新增实验入口：

- `npm run package:protection:audit`

它会对 `plain / encrypted / shielded` 做原始导出物锚点审计，并回答：

- plain source proxy 暴露了多少高层语义锚点
- encrypted/shielded raw export 还剩多少 raw leakage
- 下一步应是 `trim-loader-surface` 还是 `open-inner-semantic-scrub`

### Stage 2：protected-only inner semantic scrub

只有在 Stage 1 证明 raw protected export 已足够干净时，才进入这一层。

边界固定为：

- 只作用于受保护导出分支
- 不污染默认源码开发体验
- 不改宿主 authoritative contract
- 不把产品功能删空，只做高层语义减噪

### Stage 3：inner bundle obfuscator A/B

只有在 Stage 2 完成后，人工评分仍然稳定停留在 `high-level-architecture`，才考虑一次有止损线的 A/B。

当前允许进入实验、但不默认推荐的方向：

- `lightweight-js-obfuscator`

限制条件固定为：

- 只作用于 inner bundle
- 不重开 loader 级重混淆
- 必须先过安装态与首次加载体感门槛
- 一旦带来明显卡顿或调试/兼容性回退，直接废弃

### Stage 4：路线 4 轻服务能力

这一层只在本地受保护导出已经收口，但仍需要更强 entitlement / 策略控制时再开。

当前保留边界：

- 服务端签发短时 token / ticket / feature policy
- 客户端只缓存低频控制面
- 本地载体优先级遵循 [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md)

### Stage 5：Wasm 小内核

这一层只适合承接少量真正敏感、且交互边界清晰的小内核逻辑。

当前不把它作为 v1 主路线。

## 实验矩阵

### 已固定实验

- `package:protection:smoke`
  - 验证安装态、启动态、时序和 decode fast path
- `package:protection:score`
  - 回填 `shielded stable` 的手工评分
- `package:protection:verdict`
  - 给出现阶段 advisory 收口结论

### 本轮新增实验

- `package:protection:audit`
  - 审计 raw export 的高层语义锚点
  - 明确下一步应优先修 loader 还是 inner bundle semantics

### 下一轮候选实验

- `protected-only semantic scrub prototype`
  - 只针对受保护分支的内层 bundle 语义减噪
- `lightweight-js-obfuscator` inner bundle A/B
  - 只在语义减噪后仍不足时再做

## 决策门槛

### 什么时候修 loader

只有当 `package:protection:audit` 明确显示：

- `encrypted` raw export 仍暴露描述性 metadata
- 或 `shielded` raw export 仍暴露高层语义锚点

才优先做 loader 收口。

### 什么时候开 inner semantic scrub

当 `package:protection:audit` 显示：

- `encrypted/shielded` raw export 已基本干净
- 但 plain source proxy 仍存在一批高层语义锚点

就直接进入 `protected-only inner semantic scrub`。

### 什么时候才做 obfuscator A/B

只有当：

1. loader 已够轻
2. raw export 已够干净
3. semantic scrub 后人工评分仍停在 `high-level-architecture`

才进入一次有限度的 inner bundle obfuscator A/B。

## 当前 retained decision

当前整体保护导出路线固定保留以下决策：

1. `encrypted` 继续是最稳的低开销保护导出分支。
2. `shielded` 继续是更高阻力的手动导出分支，但必须坚持 `loader-lite`。
3. raw export 之外的下一轮 hardening，应优先指向 inner bundle semantics，而不是重 loader。
4. `路线 4` 与 `Wasm` 继续保留为后续增强层，不抢当前主路线。
5. 整条保护导出线继续保持 `advisory + manual lane`，不回写默认 `release` / `agent:gate`。

## 相关文档

- [PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md)
- [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md)
- [OPTIONAL_BUNDLES.md](./OPTIONAL_BUNDLES.md)
