# Package Protection Route Plan

> 用途：把“整体保护导出路线”收成一个可执行的阶段方案，避免后续讨论在 `encrypted / shielded / 语义减噪 / route 4 / Wasm` 之间来回跳。
> 范围：这是策略与实验路线文档，不是 current truth；它不改变默认 `release` / `agent:gate` 主线。
> 更新时间：2026-04-19

当前若需要把这些阶段和候选收成固定矩阵，请配合阅读 [PACKAGE_PROTECTION_EXPERIMENT_MATRIX.md](./PACKAGE_PROTECTION_EXPERIMENT_MATRIX.md)。

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
- 当前 `smoke -> score -> verdict` 手动收口链已经 fresh 通过，最新 advisory verdict 为 `passed`
- 截至 `2026-04-18` 的最新 `12` 次 `stable` 冷启动测量里：
  - `encrypted` 相对 `plain` 只增加约 `15.5ms`，约 `+1.5%`
  - `shielded` 相对 `plain` 增加约 `696.5ms`，约 `+67.5%`
  - `shielded-jsconfuser-string` 的保护链自身时序高于 `shielded`，但端到端冷启动差异仍落在宿主噪声可掩盖的范围
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
- `package:protection:matrix`

这条链回答的问题是：

- 功能兼容有没有回归
- 安装态和启动态是否稳定
- 当前手工评分有没有达到既定威胁模型
- 当前各候选在攻击阻力 / 性能 / 体积 / surface 成本上分别处于什么状态

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

当前同时保留一个**不应被误归类进路线 4**的本地候选：

- `shielded host weak binding`
  - 只作用于二阶段 unlock
  - 不进入 `bootstrapPlugin` 主启动链
  - 主锚点优先 `hash(realpath(Zotero.Profile.dir)) + plugin-owned sqlite nonce`
  - `Zotero.DataDirectory.dir` 只做辅助盐 / fallback

这条路线当前仍属于未来 hardening 候选，不代表已经实现；具体边界见 [PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md](./PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md)。

## 分阶段推进方案

### Stage 0：当前稳定基线

当前已完成：

- `encrypted stable` / `shielded stable` / `shielded beta` smoke 闭环
- `decodeMethod=fromBase64` 的 fast path 收口
- `loader-lite` 兼容性基线
- `smoke -> score -> verdict` 手动收口链
- 最新 fresh verdict 已重新确认：
  - `status = passed`
  - `nextAction = keep-current-shielded`

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

当前最新状态补充：

- 最新 `package:protection:audit` 已确认：
  - `encrypted/shielded` raw export 仍保持 `0` 个 raw leakage
  - protected source proxy 只剩 `addonRef / addonVersion`
- 最新 Stage 2 补刀已把 capability manifest limited baseline 的高层 label 改成中性 `C-xx`，并在 protected build 中去掉整行注释，避免 `Reader 摘要` 这类语义从 JSDoc 再次漏回 bundle
- 这意味着 Stage 2 已经达到“继续压缩收益明显下降”的节点
- 当前更合理的阶段决策不是继续追剩余两个锚点，而是把 Stage 2 先视为当前版本的可接受收口点，再决定是否启动更重的 Stage 3

### Stage 3：inner bundle obfuscator A/B

只有在 Stage 2 完成后，人工评分仍然稳定停留在 `high-level-architecture`，才考虑一次有止损线的 A/B。

当前允许进入实验、但不默认推荐的方向：

- `lightweight-js-obfuscator`

限制条件固定为：

- 只作用于 inner bundle
- 不重开 loader 级重混淆
- 必须先过安装态与首次加载体感门槛
- 一旦带来明显卡顿或调试/兼容性回退，直接废弃

当前真实 preflight 结论补充如下：

- `lightweight-js-obfuscator` 当前不是 npm registry 包，`npm view lightweight-js-obfuscator ...` 会返回 `404`
- 当前只能按 GitHub 仓库形态使用它，而不能直接按稳定 npm devDependency 接线
- 直接对当前 `protected-only` inner bundle 运行上游 `obfuscator.js` 时，会先因为 `ObjectProperty` 字符串 key 被替换为 `CallExpression` 而报 Babel AST 兼容错误
- 在 `/tmp` 中对上游实验副本仅补“跳过非 computed 对象字面量 key”这一刀后，它才首次成功产出输出
- patched upstream 对当前 inner bundle 的一次真实样本结果是：
  - 输入约 `652KB`
  - 输出大致落在 `4MB ~ 5MB`
  - 体积膨胀大致落在 `6x ~ 8x`
- 更关键的是，上游默认 final pass 仍会启用：
  - `selfDefending`
  - `debugProtection`
  - `debugProtectionInterval`
  - `disableConsoleOutput`
- 这些默认值与当前模板已经验证过的 `loader-lite / hostile-runtime-disabled / 首次加载不卡顿` 路线冲突

因此当前 Stage 3 的 retained decision 需要更精确地写成：

- 允许继续做 `lightweight-js-obfuscator` 思路验证
- 但不允许把上游 CLI 原样接入模板主实验链
- 如果后续继续推进，正确方向应是：
  - 在模板内做本地适配 wrapper 或受控 fork
  - 先关掉 hostile runtime 选项
  - 先修复当前 AST 兼容性问题
  - 再做真正的安装态 / 首次加载体感 / XPI 级 smoke A/B

### Stage 3 补充候选：`JS-Confuser` 非 hostile 子集

这条路线当前只允许按“官方可确认能力 + 社区线索分层”进入 PoC，不允许把社区经验直接写成模板既定结论。

当前基于官方文档可直接确认的事实只有：

- `astScrambler`
  - 官方描述是：`Semantically changes the AST to bypass automated tools`
- `stringConcealing`
  - 官方描述是：`encoding strings to conceal plain-text values`
- `tamperProtection`
  - 官方描述是：`safeguards the runtime behavior from being altered`
- `antiDebug`
  - 官方描述是：`Adds debugger statements throughout the code`
- `pack`
  - 官方描述是：`Packs the output code into a single Function() call`
- `RGF`
  - 官方描述是：`creates executable code from strings`

当前同样需要明确：

- 官方文档没有给出 Zotero / Firefox 兼容性结论
- 官方文档没有给出 `dispatcher` / `opaquePredicates` 的可信性能量化
- 关于 `stringConcealing` 对 `class constructor` 的破坏、或 `dispatcher` / `opaquePredicates` 的细粒度风险，目前都只能算 GitHub Issue / 社区线索，不是当前模板 contract

因此当前模板的 retained decision 固定为：

- 值得进入最小 PoC 的只有：
  - `astScrambler`
- 允许做“小范围、带谓词”的次级实验，但不允许默认全开：
  - `stringConcealing`
- 当前不进入模板实验主链的选项包括：
  - `antiDebug`
  - `tamperProtection`
  - `pack`
  - `RGF`

原因固定为：

- 这几项要么直接引入 `debugger` 注入，要么显式走 `Function()` / runtime-generated code 路线
- 它们与当前模板已经收口的 `loader-lite / hostile-runtime-disabled / 首次加载不卡顿` 方向不一致
- 在没有 Zotero 宿主 PoC 之前，不允许把这类选项写成“只是混淆更强”

`dispatcher` 与 `opaquePredicates` 当前也不进入 retained decision：

- 可以保留为后续候选词条
- 但在没有独立 Zotero PoC 前，不写进模板默认建议
- 也不把社区风险描述写成当前仓库的既定兼容性结论

### Stage 4：路线 4 轻服务能力

这一层只在本地受保护导出已经收口，但仍需要更强 entitlement / 策略控制时再开。

当前保留边界：

- 服务端签发短时 token / ticket / feature policy
- 客户端只缓存低频控制面
- 本地载体优先级遵循 [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md)
- 若当前阶段必须先复用现有后端而不改协议，只允许走 `legacy-backend quick apply` 形态：
  - 作为显式 optional variant
  - `default-disabled + manual-only + second-stage only`
  - 客户端只把 legacy 协议语义、host binding 混合和紧凑 gate 判定收进 Wasm 微内核
  - 不把整插件启动绑定到远端 gate
- 长期蓝图仍固定为：
  - 服务端签发短时 signed ticket
  - 客户端 Wasm 只保留公钥、验签和 compact gate
  - 不把共享 secret 长期留在客户端
- 具体边界见 [PACKAGE_PROTECTION_ROUTE4_LEGACY_BACKEND_PLAN.md](./PACKAGE_PROTECTION_ROUTE4_LEGACY_BACKEND_PLAN.md)

### Stage 5：Wasm 小内核

这一层只适合承接少量真正敏感、且交互边界清晰的小内核逻辑。

当前不把它作为 v1 主路线。

当前 route5 的收口结论也已经明确：

- `package:protection:wasm:admission` 已经可以稳定给出 `ready-for-candidate`
- 第一条候选 `shielded-surface-scrub-wasm-digest` 已完成完整证据链：
  - `smoke / webcrack / inner-audit / single-pass / guided / compare / matrix / review`
- 这条候选当前已经证明：
  - 不会扩大 `content/lib/w/*` 之外的 package-boundary 暴露
  - 不会把自动化阻力从 `surface-scrub` 拉低
  - 可以作为 `bounded Wasm lane` 保留下来
- 但它当前同样已经证明：
  - 还没有超过 `shielded-surface-scrub`
  - 没有继续减少 unpacked support surface
  - 还带来了额外 `xpi / bundle / prepare / decode` 成本
- 因此当前 Stage 5 的 retained decision 固定为：
  - `shielded-surface-scrub-wasm-digest` 只保留为 `retained-experiment-candidate`
  - 它不替代 retained top candidate `shielded-surface-scrub`
  - 若未来继续推进 Wasm，不应重复在同一条 digest 小内核上反复补同类证据，而应先定义新的、可量化的保护收益目标

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
- `shielded host weak binding v1`
  - 只做宿主感知的二阶段 unlock
  - 不改 `bootstrapPlugin` 主启动链
  - 只在需要进一步压缩离机静态分析 / 跨环境复制复用时考虑
- `JS-Confuser` non-hostile subset PoC
  - 第一优先只试 `astScrambler`
  - 第二优先才是带谓词的小范围 `stringConcealing`
  - 明确不把 `antiDebug / tamperProtection / pack / RGF` 带进当前模板实验链
  - 当前仓库内已提供显式预检入口：
    `npm run package:protection:jsconfuser:preflight -- --tool-path /absolute/path/to/js-confuser`
  - 以及次级预检入口：
    `npm run package:protection:jsconfuser:string:preflight -- --tool-path /absolute/path/to/js-confuser`
  - 当前也已提供对应的显式手动 XPI / smoke 入口：
    `npm run package:shielded:jsconfuser:string -- --jsconfuser-tool-path /absolute/path/to/js-confuser`
  - 以及：
    `npm run package:protection:smoke:shielded:jsconfuser:string -- --repeats 3 --channel stable --jsconfuser-tool-path /absolute/path/to/js-confuser`
  - 以及 raw export 对比入口：
    `npm run package:protection:audit:jsconfuser:string -- --jsconfuser-tool-path /absolute/path/to/js-confuser`
  - 截至 `2026-04-16` 的真实预检结果是：
    - `js-confuser@2.0.1` 可跑通 `astScrambler`
    - 输出可过语法检查，且体积未失控
    - 但对当前模板的高层语义锚点压缩为 `0`
    - 当前 advisory 结论固定为 `attention`
    - 当前不建议直接升级到 XPI / Zotero A/B
    - `targeted stringConcealing` 也已跑通真实预检
    - 输出可过语法检查，且体积仍保持可控
    - 对当前模板的高层语义锚点压缩达到 `7 -> 0`
    - 当前 advisory 结论可记为 `passed`
    - 当前更值得进入下一步手动 XPI / Zotero A/B 的是这条路线，而不是 `astScrambler`
  - 但截至 `2026-04-18` 的最新 `12` 次 `stable` 冷启动测量也补齐了一个关键约束：
    - `shielded-jsconfuser-string` 相对 `shielded` 的保护链自身成本仍然更高
    - `loadSubScriptDurationMs` 中位数约 `+106.5ms`
    - `prepareDurationMs` 中位数约 `+9ms`
    - `xpiBytes` 与 `bundleBytes` 都约再增加 `32%`
    - 端到端 `durationMs` 虽在这一轮样本里没有更慢，但这不能解释成它“本质更快”，因为分层时序已经明确显示保护链本身更重
  - 当前 compare retained rule 也已经固定：
    - 单轮 `LLM single-pass` 优势不足以把候选升级为 `hardening-win`
    - 只有 guided-attack 的对称比较也优于 `shielded` 时，才允许升级
    - 因此 `shielded-jsconfuser-string` 当前只保留为 `leaning-same / stop-current-candidate`
- `lightweight-js-obfuscator` inner bundle A/B
  - 只在语义减噪后仍不足时再做
  - 当前已经完成 preflight，但 direct upstream 路线已被判定为“不应直接接入”
  - 当前仓库内已提供显式预检入口：
    `npm run package:protection:lightweight:preflight -- --tool-path /absolute/path/to/lightweight-js-obfuscator`

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

### 什么时候看性能报告

当前固定入口：

```bash
npm run package:protection:perf -- --channel stable
```

当前固定读法：

- `durationMs median / p95 / max` 用来判断 UX 风险和尾延迟
- `loadSubScriptDurationMs + prepareDurationMs` 用来判断保护链自身额外成本
- 如果某个候选只是端到端 `durationMs` 更快，但 `loadSubScript + prepare` 更重，应先按 Zotero 宿主冷启动噪声处理，不把它直接视为更优 hardening 路线

## 当前 retained decision

当前整体保护导出路线固定保留以下决策：

1. `encrypted` 继续是最稳的低开销保护导出分支。
2. `shielded` 继续是更高阻力的手动导出分支，但必须坚持 `loader-lite`。
3. `shielded-jsconfuser-string` 当前仍只保留为实验候选，不因为单轮 `stable` compare 或单轮总冷启动样本就升级为推荐路线。
4. raw export 之外的下一轮 hardening，应优先指向 inner bundle semantics，而不是重 loader。
5. 若未来要继续加固本地分支，允许把“宿主弱绑定二阶段 unlock”保留为独立候选，但它不替代 inner semantic scrub，也不等同于路线 4。
6. `路线 4` 与 `Wasm` 继续保留为后续增强层，不抢当前主路线。
7. `shielded-surface-scrub-wasm-digest` 当前只保留为有边界的 retained experiment，不升级为当前主推荐 hardening 候选。
8. 整条保护导出线继续保持 `advisory + manual lane`，不回写默认 `release` / `agent:gate`。

## 相关文档

- [PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md)
- [PACKAGE_PROTECTION_HOST_SIGNAL_IMPLEMENTATION_PLAN.md](./PACKAGE_PROTECTION_HOST_SIGNAL_IMPLEMENTATION_PLAN.md)
- [PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md](./PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md)
- [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md)
- [OPTIONAL_BUNDLES.md](./OPTIONAL_BUNDLES.md)
