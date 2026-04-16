# Package Protection Experience

> 历史经验页。这里只沉淀“手动受保护导出分支”在当前模板里已经验证过的经验，不定义 current truth。
> 更新时间：2026-04-16

当前若需要看“整体保护导出路线接下来该怎么推进、优先 trim 哪一层”，请配合阅读 [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md)。

## 适用范围

本页只覆盖两条手动触发的受保护导出分支：

- `npm run package:encrypted`
- `npm run package:shielded`
- `npm run package:protection:smoke -- --variant <plain|encrypted|shielded> --repeats 3 --channel <stable|beta>`
- `npm run package:protection:score -- --variant shielded --channel stable --webcrack "<rating>" --llm "<rating>"`
- `npm run package:protection:verdict`

它们都属于本地手动导出能力，不参与默认 `release` 主线，也不改变当前 `release-only blocker` 治理语义。

当前正式手动收口链路固定为：

- `package:protection:smoke -> package:protection:score -> package:protection:verdict`
- `plain` 固定只作为 control group 展示，不作为 protection failure 判据
- `shielded stable` 的手工评分若落到 `readable-module-recovery`，只会把 verdict 降到 `attention` 并建议未来 hardening wave；当前不直接重开 `sidecar`

当前实验报告固定写到：

- `dist/package-protection-smoke/<variant>-<channel>.json`
- `dist/package-protection-smoke/<variant>-<channel>.md`
- `dist/package-protection-smoke/runs/*.json`
- `dist/package-protection-smoke.json`
- `dist/package-protection-smoke.md`
- `dist/package-protection-verdict.json`
- `dist/package-protection-verdict.md`

## 当前已验证结论

### 1. `encrypted` 是当前最稳的低开销受保护导出分支

- `encrypted` 的执行模型是：
  `base64 decode -> AES-GCM decrypt -> TextDecoder -> new Function(...) -> bootstrapPlugin`
- 真机对比里，`encrypted` 的首次可用时间与 plain 包几乎等价，没有表现出明显体感卡顿。
- 当前 formal smoke 中，`encrypted stable` 三次 run 全部 `readinessMode=native`、`blockingRuntimeErrorCount=0`，`medianDecodeDurationMs=4`、`medianPrepareDurationMs=27`。
- 当前更适合作为“默认手动受保护包”基线，而不是一上来就使用更重的 `shielded`。

### 2. 旧版 `shielded` 的主要问题不是 AES，而是超大 loader

旧版 `shielded` 的直接经验结论是：

- 不是“加密本身导致卡顿”。
- 真正的主要瓶颈是：
  `protected loader` 被过重混淆后，脚本体积膨胀，`loadSubScript()` 前段同步解析/编译成本过高。
- 在那一版中，`content/scripts/<addonRef>.js` 一度膨胀到约 `60MB`，XPI 约 `16MB`，首次加载会有明显卡顿体感。
- 这说明对 Zotero 这类 `loadSubScript(scope)` 宿主，不应把浏览器端大体量 JS 混淆策略直接照搬到 loader 层。

### 3. 当前 `shielded` 的有效方向是“保留双层结构，但把 loader 降到 lite 档”

这一轮已经验证，较好的折中不是取消 `shielded`，而是：

- 保留 `主 bundle 混淆 + AES 包装 + loader 轻量硬化`
- 去掉会显著放大体积和解析成本的 loader 级重策略
- 不在 loader 上打开 hostile runtime 选项，例如：
  - `selfDefending`
  - `debugProtection`
  - 高强度 `controlFlowFlattening`
  - 多层 `stringArrayWrappers`

当前落地后的可观测结果：

- `shielded.xpi` 约 `3.4MB`
- `shielded` 主脚本约 `5.85MB`
- 真机安装 smoke 从旧版约 `9061ms` 回落到约 `7138ms`
- 用户实际体感已确认“不像之前那版本加载卡顿”
- 当前 formal smoke 中，`shielded stable` 三次 run 全部 `readinessMode=native`、`blockingRuntimeErrorCount=0`，`medianDecodeDurationMs=23`、`medianPrepareDurationMs=86`
- `shielded beta` 确认性 smoke 也保持三次 run 全部通过，`medianDecodeDurationMs=25`、`medianPrepareDurationMs=84`

### 4. 当前 `shielded` 仍能提高自动化解读成本，但不能声称“真正保密”

已经验证：

- `webcrack` 这类一键工具不再稳定直出
- AI 仍能识别外层 loader 的执行语义
- 如果 loader 暴露过多描述性 metadata，AI 可以很快推断出：
  - 这是本地插件加载器
  - 使用 `AES-GCM`
  - 最终经 `new Function(...)` 执行

因此当前威胁模型必须保持清晰：

- 目标：提高普通开发者、自动化工具、AI 的快速自动化解读成本
- 非目标：对抗专业逆向人员
- 不应把客户端包内密钥包装描述成真正的 secrets protection

### 5. 元数据泄露面会显著降低 AI 的一轮解读门槛

这一轮已验证的经验是：

- `addonRef`
- `addonVersion`
- `generatedAt`
- `sourceSHA256`
- 过于直白的 bundle metadata object

这些信息即使不直接暴露业务源码，也会帮助 AI 很快完成“这是个什么包、怎么执行、该往哪一层看”的高层解读。

因此当前 `shielded` 的 retained rule 是：

- loader 只保留最小必要 marker / variant 信号
- 不在 loader 里继续暴露描述性 bundle metadata

### 6. decode 热点已经被 fast path 实际打掉，当前不需要进入 sidecar 原型

当前模板已经把 `packageProtection` 时序和 `decodeMethod` 接入：

- bootstrap `loadSubScript` 阶段
- `decodeMethod`
- protected loader 的 `decode`
- `decrypt`
- `eval`
- `prepare total`
- `bootstrap resolve`

历史上，一次真实 `shielded` 回读样本曾是：

- `loadSubScriptDurationMs: 407`
- `decodeDurationMs: 1676`
- `decryptDurationMs: 26`
- `evalDurationMs: 41`
- `prepareDurationMs: 1744`

而本轮 `package:protection:smoke` 的真实结果是：

- 当前 stable / beta Zotero 运行时都能探测到：
  - `Uint8Array.fromBase64`
  - `Uint8Array.prototype.setFromBase64`
- `encrypted` 与 `shielded` 实际命中的 `decodeMethod` 都是 `fromBase64`
- `shielded stable` 的 `medianDecodeDurationMs` 已降到 `23`
- `shielded beta` 的 `medianDecodeDurationMs` 已降到 `25`

这说明：

- 低风险 fast path 已经满足这一轮实验门槛
- 当前不需要进入 `shielded-sidecar` 原型
- 这轮继续保留 `loader-lite + fast decode path`，不要为了“再加一层保护”过早重开中风险分支

### 7. 当前人工验证结果落在“能做高层架构归纳，但不能直接恢复可维护源码”

截至 `2026-04-16`，当前 `shielded stable` 的人工验证结论已经明确：

- 启动测试中没有出现明显卡死、假死或长时间白屏
- `webcrack` 处理后再交给 AI，一轮内仍能较快归纳出：
  - 这是 Zotero 插件壳
  - 外层 loader 的 `AES-GCM + new Function(...)` 执行链
  - 部分生命周期、菜单、Host/Agent 能力面的高层职责
- 但当前结果还不能稳定恢复成“可直接维护的模块主体源码”

因此这轮更准确的人工评级应视为：

- `webcrackInitialResult = high-level-architecture`
- `llmSinglePassResult = high-level-architecture`

这说明当前方案已经达到“阻碍普通开发者、自动化工具和一轮 AI 快速直读源码”的目标，但还达不到“连高层架构都不易理解”的更高目标。若未来目标升级到后一档，应新开 hardening wave，优先处理内层 bundle 的语义暴露，而不是先回到更重的 loader 或直接重开 `sidecar`。

### 8. `package:protection:audit` 现在同时能给出 raw export 与 protected source proxy 两层结论

这一轮新增并验证了一个更实用的经验：

- 只看 `encrypted / shielded` 的 raw export，已经不足以判断 inner semantic scrub 是否真的生效
- 因为 raw protected export 在当前模板里已经主要是 loader 视图，内层 bundle 的高层语义是否下降，需要额外看一个“protected source proxy”视图

因此当前 `package:protection:audit` 的读法固定分成两层：

- `comparison`
  - 继续只回答 raw export 是否还泄露 loader / metadata 级锚点
  - 当前结果仍是：
    - `plainCandidateAnchorCount = 8`
    - `encryptedRawAnchorCount = 0`
    - `shieldedRawAnchorCount = 0`
    - `nextAction = open-inner-semantic-scrub`
- `sourceProxy`
  - 用 plain build 对比 `anonymized + semantic scrub` 的 protected source proxy
  - 直接量化 inner bundle 里的高层语义锚点有没有下降

截至 `2026-04-16` 的首轮 prototype 结果已经验证：

- `plain.totalAnchorCount = 11`
- `plain.totalMatchCount = 98`
- `protected.totalAnchorCount = 4`
- `protected.totalMatchCount = 44`
- `reducedAnchorCount = 7`
- `reducedMatchCount = 54`

这一轮被明确打掉的锚点包括：

- `plugin.api.agent.*`
- `runAgentAction`
- `capabilityManifest.entrypoints`
- `capabilityManifest.ownedBy`
- `capabilityManifest.successSignals`
- `agent-runtime`
- `ai-service`

这一轮仍保留的主要锚点是：

- `addonRef`
- `addonVersion`
- `optionalBundles`
- `generatedAt`

这说明首轮 `protected-only inner semantic scrub` 已经有效，但还没有完全收口；下一步不该回头折腾 loader，而是继续集中处理剩余的少数高频高层锚点，尤其是 `optionalBundles` 一类仍能帮助 AI 快速理解模板分层的内部术语。

## Retained Recommendations

### 当前分支选择建议

- 日常手动受保护导出，优先 `package:encrypted`
- 需要进一步提高自动化工具 / AI 直读门槛时，再使用 `package:shielded`
- 当前收口顺序固定为先跑 `package:protection:smoke`，再录入 `package:protection:score`，最后生成 `package:protection:verdict`

### 当前 `shielded` 的实现建议

- 保持 `loader-lite`，不要再回到 60MB 级 loader
- 不把 loader 当成主要反逆向战场，主要扰动应放在内层 bundle
- 继续避免 hostile runtime 选项，优先兼容和可加载性

### 当前后续策略基线

- 下一轮若继续提高“抗一轮 AI 高层架构归纳”能力，优先开 `protected-only` 的内层 bundle 语义减噪波次，不先回到重 loader、`sidecar` 或更激进的运行时对抗。
- 第一批优先处理模板自有的高层语义锚点：
  - `plugin.api.agent.*` 能力面
  - `capabilityManifest` 中的 `id / label / description / entrypoints / ownedBy / successSignals`
  - `plugin-agent` 的结构化自检 / 遥测字段
  - service label、optional bundle summary 这类不会影响 Zotero 宿主契约、但会帮助 AI 快速归纳框架分层的文本
- 宿主 authoritative contract 继续视为禁改区：
  - `bootstrapPlugin`
  - Zotero / Services / ChromeUtils / TextDecoder / crypto
  - Reader 官方事件类型，如 `renderToolbar`、`createViewContextMenu`
  - PreferencePanes / ItemPane / MenuManager 对齐宿主的字段与 target/type 枚举
- 若语义减噪后人工评级仍保持 `high-level-architecture`，才进入一次有止损线的 `lightweight-js-obfuscator` 内层 bundle 实验；它不是当前主推荐路线。
- `路线4`（轻服务能力）与 `路线5`（Wasm 小内核）当前都只作为未来 hardening 备选，不替代本地受保护导出的主线。

### 路线 4 的当前边界判断

- 若未来要引入服务器能力，优先承接：
  - 短时 token / ticket
  - provider catalog / feature policy
  - 许可 / 订阅判定
  - 小体量签名配置或策略包
- 不建议把启动主链绑定到远端；默认应保持：
  - 插件先本地启动
  - 远端策略后置拉取
  - 拉取失败只降级，不阻断 `bootstrapPlugin`
- 即使把远端响应写入 `zotero.sqlite`，它的保护语义也只能算“认知层延迟暴露”，不能算真正保密；若本地仍持有可推导密钥、解密函数和查询路径，分析者仍可在运行时或静态代码层恢复。
- 当前项目侧已固定一条更细的 retained decision：
  - 若未来路线 4 确实需要本地缓存小体量控制面数据，`zotero.sqlite` 可优先于 `prefs` 与普通明文文件
  - 这只是“更隐蔽的本地缓存载体”判断，不是新的安全边界
  - 具体适用范围见 [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md)

### 当前验证建议

- 先看体感是否有明显首次加载卡顿
- 再看真机安装 smoke 是否仍保持 `readinessMode=native`
- 若需要定位慢点，优先读取 `packageProtection` 时序与 `decodeMethod`，而不是只看插件内核 `startupDurationMs`
- 当前推荐直接使用 `package:protection:smoke` 跑 `plain / encrypted / shielded` 控制组，而不是再手写临时脚本做安装态对比

## 相关实现入口

- [scripts/package-obfuscation-lib.mjs](./../scripts/package-obfuscation-lib.mjs)
- [scripts/package-protection-lib.mjs](./../scripts/package-protection-lib.mjs)
- [scripts/package.mjs](./../scripts/package.mjs)
- [scripts/release-install-smoke.mjs](./../scripts/release-install-smoke.mjs)
- [src/app/plugin-api.js](./../src/app/plugin-api.js)
- [src/app/plugin-agent.js](./../src/app/plugin-agent.js)
