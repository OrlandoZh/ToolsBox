# Package Protection Experience

> 历史经验页。这里只沉淀“手动受保护导出分支”在当前模板里已经验证过的经验，不定义 current truth。
> 更新时间：2026-04-19

当前若需要看“整体保护导出路线接下来该怎么推进、优先 trim 哪一层”，请配合阅读 [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md)。
如果需要统一“攻击者 + AI 组合能力”的评测标准，配合阅读 [PACKAGE_PROTECTION_ATTACK_GRADING.md](./PACKAGE_PROTECTION_ATTACK_GRADING.md)。
如果需要把当前所有候选统一收成一个实验台账，配合阅读 [PACKAGE_PROTECTION_EXPERIMENT_MATRIX.md](./PACKAGE_PROTECTION_EXPERIMENT_MATRIX.md)。

## 适用范围

本页只覆盖两条手动触发的受保护导出分支：

- `npm run package:encrypted`
- `npm run package:shielded`
- `npm run package:shielded:pref-bridge`
- `npm run package:shielded:surface-scrub`
- `npm run package:shielded:surface-scrub:wasm:digest`
- `npm run package:protection:jsconfuser:bootstrap`
- `npm run package:protection:jsconfuser:preflight`
- `npm run package:protection:lightweight:preflight`
- `npm run package:protection:smoke -- --variant <plain|encrypted|shielded|shielded-descriptor-bind|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest> --repeats 3 --channel <stable|beta>`
- `npm run package:protection:webcrack -- --variant <shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest> --channel <stable|beta>`
- `npm run package:protection:webcrack:score -- --variant <shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest> --channel <stable|beta>`
- `npm run package:protection:inner:audit -- --variant <shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest|all> --channel <stable|beta>`
- `npm run package:protection:score:llm -- --variant <shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest> --channel <stable|beta> --llm "<rating>"`
- `npm run package:protection:score:guided -- --variant <shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest> --channel <stable|beta> --rating "<rating>" --result-tier <R0|R1|R2|R3|R4> --attacker-tier <A0|A1|A2|A3|A4> --ai-tier <M0|M1|M2|M3|M4> --attack-method <static-only|static+webcrack|static+reference|dynamic-hooked|runtime-rehosted> --time-bucket <<10m|10-30m|30-120m|>120m> --round-mode <single-pass|multi-round> --summary "<summary>"`
- `npm run package:protection:attack`
- `npm run package:protection:attack:plan`
- `npm run package:protection:review`
- `npm run package:protection:wasm:admission`
- `npm run package:protection:compare -- --variant <shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest> --channel <stable|beta>`
- `npm run package:protection:perf -- --channel <stable|beta> [--variant <plain|encrypted|shielded|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest>]`
- `npm run package:protection:matrix`
- `npm run package:protection:score -- --variant shielded --channel stable --webcrack "<rating>" --llm "<rating>"`
- `npm run package:protection:verdict`

它们都属于本地手动导出能力，不参与默认 `release` 主线，也不改变当前 `release-only blocker` 治理语义。

当前正式手动收口链路固定为：

- `package:protection:smoke -> package:protection:score -> package:protection:verdict`
- 实验变体若已先录入 `webcrack`，可走 `package:protection:webcrack:score -> package:protection:score:llm -> package:protection:compare`
- `plain` 固定只作为 control group 展示，不作为 protection failure 判据
- `shielded stable` 的手工评分若落到 `readable-module-recovery`，只会把 verdict 降到 `attention` 并建议未来 hardening wave；当前不直接重开 `sidecar`

当前实验报告固定写到：

- `dist/package-protection-smoke/<variant>-<channel>.json`
- `dist/package-protection-smoke/<variant>-<channel>.md`
- `dist/package-protection-smoke/runs/*.json`
- `dist/package-protection-smoke.json`
- `dist/package-protection-smoke.md`
- `dist/package-protection-webcrack/<variant>-<channel>.json`
- `dist/package-protection-inner-audit/<variant>-<channel>.json`
- `dist/package-protection-inner-audit/<variant>-<channel>.md`
- `dist/package-protection-inner-audit.json`
- `dist/package-protection-inner-audit.md`
- `dist/package-protection-webcrack/<variant>-<channel>.md`
- `dist/package-protection-compare/<variant>-vs-<baseVariant>-<channel>.json`
- `dist/package-protection-compare/<variant>-vs-<baseVariant>-<channel>.md`
- `dist/package-protection-guided-attack/<variant>-<channel>-<profileKey>.json`
- `dist/package-protection-guided-attack/<variant>-<channel>-<profileKey>.md`
- `dist/package-protection-guided-attack/<variant>-<channel>.json` (`legacy alias`，仅在同一画像重放或首次写入时刷新，避免不同攻击画像互相覆盖)
- `dist/package-protection-guided-attack/<variant>-<channel>.md` (`legacy alias`)
- `dist/package-protection-guided-attack.json`
- `dist/package-protection-guided-attack.md`
- `dist/package-protection-attack-report.json`
- `dist/package-protection-attack-report.md`
- `dist/package-protection-guided-attack-plan.json`
- `dist/package-protection-guided-attack-plan.md`
- `dist/package-protection-retained-review.json`
- `dist/package-protection-retained-review.md`
- `dist/package-protection-matrix.json`
- `dist/package-protection-matrix.md`
- `dist/package-protection-wasm-admission.json`
- `dist/package-protection-wasm-admission.md`
- `dist/package-protection-verdict.json`
- `dist/package-protection-verdict.md`

当前新增一个低风险半自动桥接点：

- `package:protection:webcrack` 负责生成本地 `webcrack` 自动化工件
- `package:protection:webcrack:score` 只把 `suggestedWebcrackRating` 回填到 smoke report 的 `manualScorecard.webcrackInitialResult`
- `package:protection:inner:audit` 只补一份离线 `proxy LLM` 证据，不会写回 `manualScorecard`
- `package:protection:attack` 只汇总 `webcrack / single-pass LLM / guided-attack / compare` 证据，用来回答“当前自动化阻力到哪一档、最强已记录攻击画像能恢复到什么层级”
- `package:protection:attack` 还会固定标出两条画像覆盖线：
  - `singlePassAutomation`
  - `guidedA2M3`
- `package:protection:attack` 对 `current` 候选会优先提示“先补固定覆盖线证据”，再谈 `probe-candidate-hardening`；避免把“证据不足”误读成“已经适合继续 hardening A/B”
- `package:protection:attack:plan` 只把这些 fixed-profile gap 翻译成下一步命令模板，不重跑实验、不回写评分；controller 可以直接按它给出的顺序补 `current` 缺口，再决定是否继续 review retained experiment
- `package:protection:attack:plan` 现在还会对 retained experiment review queue 做固定排序：先按 `compare status / decision`，再按 `unpacked support surface` 收缩幅度，最后看 `xpi / prepare / decode` 成本；当前固定画像缺口补齐后，会稳定把 `shielded-surface-scrub` 排在 `shielded-pref-bridge` 之前
- 实验候选如果已经是 `hardening-win`，但 `compare.evidence.llmSymmetryComplete` 仍未补齐，矩阵和 retained review 不再直接给 `promote-experimental-candidate`；当前统一收口为 `collect-llm-symmetry-evidence`
- 对应地，`package:protection:attack:plan` 现在会先生成 `collect-experimental-llm-symmetry-evidence` 任务，再进入 retained experiment review；避免把“仍缺对称 single-pass LLM 证据”的候选误当成已可 promotion
- `package:protection:review` 会把 retained review queue、top candidate 的 `compare / matrix` 结论和排序依据收成单独 advisory 工件，固定回答“当前应继续保留哪个 retained candidate、为什么”
- `package:protection:wasm:admission` 只读取 `package-protection-matrix / retained-review / wasm-kernel-matrix / candidates registry`，回答是否允许把 Wasm 从 `preplan` 提升为显式 protection experiment；它不重跑 smoke，不改 release/gate
- `shielded-surface-scrub-wasm-digest` 是第一条 Wasm protection candidate，固定只和 `shielded-surface-scrub` 比较；新增静态暴露只允许落在 `content/lib/w/*`，不把 Wasm 放进 startup critical path
- `package:protection:compare` 在手工 `LLM single-pass` 尚未完成时，会把 `inner audit` 的 proxy 结果一起展示，帮助保持 A/B 结论可读；一旦手工 LLM 补齐，compare 才能正式落到 `runtime-only`、`hardening-win` 或 `leaning-same`
- `package:protection:score` 仍负责补齐 `llmSinglePassResult`，不会被替代
- `package:protection:score:guided` 只记录更强攻击画像，不写回 `manualScorecard`；同一 `variant/channel` 现在允许并存多条不同画像记录，不再互相覆盖
- `package:protection:score` / `package:protection:score:llm` / `package:protection:webcrack:score` 当前都复用同一条 package-protection workflow lock；这样即使在同一进程里并发回填评分，也不会再把 `dist/package-protection-smoke.json` 写坏
- 但凡刚执行过会回写 smoke 的命令，例如 `package:protection:webcrack:score` 或 `package:protection:score:llm`，后续 `package:protection:attack -> package:protection:attack:plan -> package:protection:matrix` 必须串行重跑；不要把“写 smoke”和“读汇总工件”并发在同一轮里，否则容易读到旧状态
- `package:protection:jsconfuser:bootstrap` 负责把 `js-confuser` 安装到当前仓库默认可发现位置，解决实验链的本地工具可复跑性，不改默认 `shielded`

## 评分分层

当前评分口径固定分两层：

- 对外 / 收口层继续只保留三档结果：
  - `parse-fail / only-loader`
  - `high-level-architecture`
  - `readable-module-recovery`
- 内部实验层继续走 `package:protection:score:guided`，额外记录攻击画像，不拿来替代 verdict

字段、等级定义与“什么结果才足以支撑二次开发”的统一标准，固定以 [PACKAGE_PROTECTION_ATTACK_GRADING.md](./PACKAGE_PROTECTION_ATTACK_GRADING.md) 为准。

## 当前已验证结论

### 1. `encrypted` 是当前最稳的低开销受保护导出分支

- `encrypted` 的执行模型是：
  `base64 decode -> AES-GCM decrypt -> TextDecoder -> new Function(...) -> bootstrapPlugin`
- 真机对比里，`encrypted` 的首次可用时间与 plain 包几乎等价，没有表现出明显体感卡顿。
- 截至 `2026-04-18` 的最新 `stable` 冷启动测量里，`encrypted stable` 已补到 `12` 次 fresh run，全部 `readinessMode=native`、`blockingRuntimeErrorCount=0`。
- 这一轮的关键数字是：
  - `plain durationMs median = 1032`
  - `encrypted durationMs median = 1047.5`
  - 相对 `plain` 只增加 `15.5ms`，约 `+1.5%`
  - `encrypted loadSubScriptDurationMs median = 9.5`
  - `encrypted decodeDurationMs median = 3`
  - `encrypted prepareDurationMs median = 19`
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

- `shielded.xpi` 当前约 `3.3MB`
- `shielded` 主脚本当前约 `5.4MB ~ 5.7MB`
- 真机安装 smoke 从旧版约 `9061ms` 回落到约 `7138ms`
- 用户实际体感已确认“不像之前那版本加载卡顿”
- 截至 `2026-04-18` 的最新 `stable` 冷启动测量里，`shielded stable` 已补到 `12` 次 fresh run，全部 `readinessMode=native`、`blockingRuntimeErrorCount=0`
- 这一轮更可信的性能画像是：
  - `shielded durationMs median = 1728.5`
  - 相对 `plain` 增加 `696.5ms`，约 `+67.5%`
  - `shielded loadSubScriptDurationMs median = 422.5`
  - `shielded decodeDurationMs median = 24.5`
  - `shielded evalDurationMs median = 44`
  - `shielded prepareDurationMs median = 84`
- 这进一步确认了当前 `shielded` 的主要热点仍然是 loader 进入 `loadSubScript()` 之后的解析/编译段，而不是 AES decrypt 本身。
- `shielded beta` 确认性 smoke 也保持三次 run 全部通过，`medianDecodeDurationMs=23`、`medianPrepareDurationMs=76`

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

### 4.1 `shielded-pref-bridge` 当前更适合作为低风险静态面 hardening 候选

- 截至 `2026-04-18` 的最新 `stable` smoke，`shielded-pref-bridge` 已完成 `3` 次 fresh run，全部 `readinessMode=native`、`blockingRuntimeErrorCount=0`、`decodeMethod=fromBase64`
- 当前关键数字是：
  - `shielded-pref-bridge durationMs median = 1796`
  - `shielded-pref-bridge protection pipeline median = 501`
  - 相对 `shielded` 的 `protection pipeline` 轻约 `1.1%`
  - XPI 体积相对 `shielded` 小约 `0.4%`
- `webcrack` 与 `inner audit` 当前都仍落在 `parse-fail / only-loader`，没有观测到自动化阻力退化
- 当前更值得关注的增量不是 raw loader，而是最终 `XPI` 的静态 support surface：
  - `preferences.xhtml` 里的 pref name 已从 `extensions.zotero.<prefsPrefix>.*` 压成 `extensions.zotero.<opaquePaneId>.p0..p3`
  - 截至本轮 latest audit，`prefs.js` 也已同步压成同一组 placeholder pref key；当前 `shielded` 解包后会暴露 `bootstrap.js + prefs.js + preferences.xhtml + content/lib/r/demo.xhtml`，而 `pref-bridge` 已收缩到 `bootstrap.js + content/lib/r/demo.xhtml`
  - `pref-bridge` 当前更像“解压后静态面 hardening”，不是新的 runtime 语义恢复路线
- 截至当前最新 `compare / attack / matrix` 收口，`pref-bridge` 已经从“保留观察候选”提升到“优先保留的低风险 hardening 候选”：
  - `compare = passed / hardening-win`
  - 对称 guided-attack 仍是 `high-level-architecture / R1`
  - `matrix` 当前已把它收为 `complete`，不再把无关 `preflight` 缺失误报成 `partial`
- retained rule：
  - 作为当前优先保留的手动 hardening 候选继续存在，但不替代默认 `shielded`
  - compare 重点看 `shielded` vs `shielded-pref-bridge` 的 `unpacked support surface` 是否继续收缩
  - 若未来继续加强，优先改 pref pane 自身的静态命名，不优先动 loader
  - 当前 retained review 队列里，它固定排在 `shielded-surface-scrub` 之后；原因不是阻力退化，而是同样保持 `hardening-win` 时，它的 `unpacked surface` 收缩更小，且 `xpi / prepare / decode` 都高于 `shielded`

### 4.2 `shielded-surface-scrub` 当前是已验证的 retained static-surface scrub 候选

- 这条变体是在 `pref-bridge` 的静态 support-surface 路线之上，再把 `bootstrap.js` 中剩余的 `addonRef / instanceKey` 文字面值改写为运行时表达式，并继续清理 `content/lib/r/demo.xhtml` 这类 package-boundary 壳文件
- 当前已验证的低风险动作有两类：
  - `bootstrap.js` 里的 `addonRef / instanceKey` 改成运行时表达式
  - `react-ui` demo shell 改成相对资源路径，并在 `surface-scrub` 变体下把静态 `data-addon-*` / `<title>` 收成中性文案；运行时仍通过 `documentElement` 注入真实上下文
- 当前已验证的 manifest 边界条件：
  - `manifest.applications.zotero.update_url` 不能删除；在 Zotero 9 temporary install 下，删掉后 `AddonManager.getInstallForFile()` 会直接落到 `error = -3 / state = 4`，连 `name / type / version` 都无法解析
  - 因此当前 `surface-scrub` 只能继续 scrub `name / description / author / homepage_url`，但必须保留真实 `update_url`
- 它的目标不是改 runtime 结构，而是继续压缩“解压后直接搜索就能命中的 support surface”
- 截至当前最新 `smoke / webcrack / inner audit / compare / guided attack / attack report` 收口，这条线已经满足“保留候选”标准：
  - `compare = passed / hardening-win`
  - 单轮 `webcrack + LLM` 仍停在 `parse-fail / only-loader`
  - 固定强档 `A2/M3 + static+reference + multi-round + 30-120m` 仍只到 `high-level-architecture / R1`
  - 当前 latest anchor audit 下，`surface-scrub` 的剩余 unpacked 暴露已经收敛到 `manifest.json` 单文件；残余锚点只剩 `addonVersion literal + update_url literal`
  - 同一轮 audit 中，`shielded` 基线的剩余静态暴露已被更准确地收敛成：`manifest.json / bootstrap.js / prefs.js / content/preferences.js / content/preference-pane-load-bridge.js / content/theme.js / content/preferences.xhtml / content/lib/r/demo.xhtml / content/lib/w/wasm-probe-worker.js / locale/*/main.ftl`
  - 相对 `shielded`，`surface-scrub` 当前的 `unpackedAnchorDeltaCount = -14`、`unpackedMatchDeltaCount = -27`
  - 最新 `smoke / matrix` 下，`surface-scrub` 相对 `shielded` 的 `decode / prepare` 中位数都继续小约 `1ms`，XPI 体积也继续更小；当前没有观测到新的体感级回退
- retained rule：
  - 继续保持 advisory-only，不替代默认 `shielded`
  - 当前可作为优先保留的低风险静态 surface hardening 候选
  - 当前 retained review 队列里固定排在第一位；原因是它在保持 `hardening-win` 的同时，`unpackedAnchorDeltaCount / unpackedMatchDeltaCount` 明显优于 `pref-bridge`，且 `xpi / prepare / decode` 仍低于 `shielded`
  - 下一步如果要继续增强，优先找“既能保安装、又能减少 manifest/package-boundary 暴露”的方案，不回到删 `update_url` 这类会直接破坏 installability 的路线

### 4.3 protected-only host-action semantic scrub 已验证可行

- 截至 `2026-04-19`，protected build 已把 `host action` 的连续字符串 ID 抽成独立语义模块，并在 protected 分支下改成 tokenized alias：
  - `src/app/host-action-ids.js`
  - `src/app/host-action-ids-protected.js`
- 同一轮还新增了 `host-action-catalog-protected.js`，只保留运行时需要的最小字段：
  - `id`
  - `status`
  - `executable`
  - `requiredBundle`
- 这条线的目的不是改变 `runHostAction()` 的运行语义，而是继续压缩解密后 inner bundle 里最适合被 grep / 一轮 AI 直接拼高层架构的目录型文本：
  - `preferences.openPane`
  - `reader.open`
  - `runtime.probeWasmKernel`
  - `window.openReactDemo`
  - `authoritativeSource`
  - `readinessAssertions`
- 当前已验证的结论是：
  - `shielded stable` smoke 继续保持 `3/3 native`、`blockingRuntimeErrorCount=0`
  - `shielded-surface-scrub stable` smoke 同样继续通过
  - 最新 `anchor audit` 下，`shielded` 的 raw protected export 仍保持 `totalAnchorCount = 0`
  - 最新 `inner audit` 下，`shielded` 与 `shielded-surface-scrub` 仍都落在 `parse-fail / only-loader`
- retained rule：
  - 这类“语义 ID 常量化 + protected catalog 最小化”属于值得继续复用的低风险 semantic scrub 模式
  - 只优先用于 agent / diagnostics / catalog 这类目录型语义，不优先去改真实宿主行为或核心 UI 文案
  - 下一步若继续推进，应优先找同类型的“高描述性目录对象”，而不是回到重 loader 或 hostile runtime

### 4.4 protected capability manifest label scrub 与 protected-only comment stripping 已接通

- 截至 `2026-04-19`，`capability-manifest-protected` 的 limited baseline 已不再直接保留：
  - `基线注册`
  - `条目展示摘要`
  - `宿主动作编排`
  - `运行时桥接报告`
  - 以及同类高层 capability label
- 当前 protected baseline 会把这些 label/category 改成中性值：
  - label 走 `C-01 ... C-12`
  - category 统一走 `protected`
- 同一轮里，descriptor overlay 也已扩到可恢复 `label/category`；因此只有在 host-binding 满足、overlay 真正 applied 时，runtime 才会重新看到 richer capability label，而不是在默认 protected baseline 里明文暴露
- 这条线的目的不是改变 capability manifest 的数量或 `id`，而是继续压缩解密后最容易被一轮 AI 当作“高层功能目录”的文本片段
- 同时，protected build 现在还会在 bundling 阶段去掉“整行注释”：
  - `/** ... */`
  - `// ...`
  - 只作用于 protected build，不改默认源码
- 这一步的直接原因是：即使 capability label 已经做了 protected baseline，中性 label 之外，像 `Reader 摘要` 这种字样仍可能通过 JSDoc 注释重新漏回 bundle
- 当前已验证的结论是：
  - `tests/build.test.js`
  - `tests/capability-manifest-protected.test.js`
  - `tests/package-protection-lib.test.js`
  - `tests/plugin-agent.test.js`
  - `tests/protected-semantic-ids.test.js`
  都已通过
- retained rule：
  - 这类“protected baseline label 中性化 + overlay 条件恢复 + protected-only 注释去除”属于下一批可继续复用的低风险 semantic scrub
  - 它优先服务于 capability manifest / diagnostics 这类目录型文本，不应外溢到真实用户可见 UI 文案

### 4.5 `shielded-surface-scrub-wasm-digest` 已完成第一轮完整收口，但当前只应保留为 bounded retained experiment

- 这条路线的前置准入当前已经验证通过：
  - `package:protection:wasm:admission = ready-for-candidate`
  - 前提固定是 `package-protection-matrix = passed`
  - `retained-review.topCandidate = shielded-surface-scrub`
  - `surface-scrub` 的 residual floor 已收敛到 `manifest.json` 兼容性下限
  - `wasm-kernel-matrix = passed`
  - digest micro-kernel 目标固定锁在 `content/lib/w/*`
- 第一条显式 Wasm protection candidate 当前已补齐完整证据链：
  - `smoke`: `3/3 passed`
  - `readinessMode = native`
  - `blockingRuntimeErrorCount = 0`
  - `decodeMethod = fromBase64`
  - `medianDecodeDurationMs = 23`
  - `medianPrepareDurationMs = 76`
  - `webcrack = parse-fail / only-loader`
  - `inner audit = parse-fail / only-loader`
  - `single-pass LLM = parse-fail / only-loader`
  - 固定强档 `A2/M3 + static+reference + multi-round + 30-120m = high-level-architecture / R1`
- `2026-04-20` 窄微内核方向复测结果继续支持这条结论：
  - `shielded-surface-scrub` 与 `shielded-surface-scrub-wasm-digest` 同轮 stable smoke 均为 `3/3 passed`
  - 二者均为 `readinessMode=native`、`blockingRuntimeErrorCount=0`、`decodeMethod=fromBase64`
  - 二者 median `decodeDurationMs = 24`
  - 二者 median `prepareDurationMs = 74`
  - 性能报告中 `protectionPipelineDurationMs` 从 `490ms` 到 `489ms`，可视为无实质差异
  - `durationMs` 从 `1721ms` 到 `1457ms`，这更可能是 Zotero 冷启动噪声，不应解释成 Wasm 带来启动加速
  - smoke/perf 口径下 `xpiBytes` 增加 `12,777`，`bundleBytes` 增加 `18,424`
  - webcrack 仍为 `parse-fail / only-loader`
  - inner audit 仍为 `parse-fail / only-loader`
  - compare 仍为 `hardening-win`，但 retained review 仍把 `shielded-surface-scrub` 作为 top candidate
- 当前 `compare` 的结论也已经收口为：
  - `status = passed`
  - `decision = hardening-win`
  - `guidedAttackSymmetryComplete = yes`
  - `packageBoundaryWithinWasmAssets = yes`
  - 当前没有观测到超出 `content/lib/w/*` 的新增 package-boundary 暴露
- 但这条线目前还**不是**更优 retained candidate，原因也已经很明确：
  - 它相对 `shielded-surface-scrub` 没有继续减少 unpacked support surface
  - 当前 `unpackedAnchorDeltaCount = 0`
  - 同轮 smoke/perf 口径下，当前 `xpiDelta = +12777`
  - 同轮 smoke/perf 口径下，当前 `bundleDelta = +18424`
  - 当前 `prepareDelta = 0`
  - 当前 `decodeDelta = 0`
  - retained review 当前固定把它排在 `reviewRank = 3`
- 这意味着它当前证明的是：
  - `route5-wasm` 可以在不破坏启动链、不扩大 package boundary、不降低自动化阻力的前提下成立
  - 但这还不足以让它超过 `shielded-surface-scrub`
  - 它当前提供的是“bounded Wasm lane feasibility”，不是“更强 static hardening”
- 当前独立 read-only 复核也与这条结论一致：
  - 在 `A2/M3 static+reference multi-round` 画像下，攻击者仍只能稳定恢复高层架构
  - 能识别它是一个 `shielded-surface-scrub` 衍生候选，并额外带有 default-disabled / lazy 的 Wasm digest micro-kernel
  - 但还达不到 `readable-module-recovery`
- retained rule：
  - 当前固定保留为 `retained-experiment-candidate`
  - 不替代默认 `shielded`
  - 不替代 retained top candidate `shielded-surface-scrub`
  - 如果未来继续走 Wasm protection，不应重复在同一条 digest 小内核上反复补同类证据
  - 下一轮只有在出现新的、可量化的保护收益目标时才值得继续，例如：
    - 新的 package-boundary 收缩
    - 新的 attack ceiling 下压
    - 或新的非启动关键路径 Wasm 小内核能承接更高价值的敏感语义

### 4.6 Wasm stage2 不能再以“恢复完整 overlay”为目标

`shielded-surface-scrub-wasm-stage2-derive` 的实验已经给出一个明确反例：

- 工程层面可行：
  - bootstrap 桥接 `WebAssembly / Worker / ChromeWorker` 后，runtime smoke 可以通过
  - `readinessMode = native`
  - `blockingRuntimeErrorCount = 0`
  - package boundary 没有观察到超出 `content/lib/w/*` 的新增静态暴露
- 保护层面不值得继续：
  - stage2 解锁后恢复了 `12` 条 capability overlay 条目
  - inner audit 从 `parse-fail / only-loader` 退到 `high-level-architecture`
  - 这正好把 AI 最容易归纳的高层架构信息重新带回 JS 层

因此当前固定经验是：

- `shielded-surface-scrub-wasm-stage2-derive` 只保留为 stopped candidate / regression reference
- admission 不应再选择“完整 overlay 恢复”类 Wasm 候选
- 后续 Wasm 只能承接 `digest / unlockToken / compactGate / diagnosticDigest` 这类微内核输出
- Wasm 输出不得包含完整 capability overlay、entrypoints、ownedBy、successSignals、用户可读能力标签或模块目录
- 成功标准不是“Wasm 能不能解锁更多信息”，而是“Wasm 是否能在不增加 JS 可读高层信息的前提下，让静态直读更难”

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
- `shielded stable` 的 `medianDecodeDurationMs` 已降到 `24`
- `shielded beta` 的 `medianDecodeDurationMs` 已降到 `23`

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

- `webcrackInitialResult = parse-fail / only-loader`
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

截至 `2026-04-17` 的最新审计结果已经验证：

- `plain.totalAnchorCount = 32`
- `plain.totalMatchCount = 114`
- `protected.totalAnchorCount = 2`
- `protected.totalMatchCount = 11`
- `reducedAnchorCount = 30`
- `reducedMatchCount = 103`

这一轮被明确打掉的锚点包括：

- `plugin.api.agent.*`
- `runAgentAction`
- `capabilityManifest.entrypoints`
- `capabilityManifest.ownedBy`
- `capabilityManifest.successSignals`
- `agent-runtime`
- `ai-service`
- `baseline-registration`
- `reader-summary`
- `host-actions`
- `settings-governance`
- `runtime-bridge-report`
- `reader-current`
- `settings-snapshot`
- `window-snapshot`
- `command-no-ui`
- `capability-manifest`
- `Open Cleanroom Action`
- `Show Reader Demo Summary`
- `Show Reader Selection Snapshot`
- `Baseline demos ready`
- `Runtime Core`
- `Host Signal Collector`
- `Host Nonce Store`
- `Runtime Bridge`

这一轮仍保留的主要锚点只剩：

- `addonRef`
- `addonVersion`

这说明第二轮 `protected-only inner semantic scrub` 的后续补刀已经把 capability id、agent scenario、`ownerModules` 和 host action readiness tag 这几类高层语义一起收掉了。到这一阶段，继续压剩余的 `addonRef / addonVersion` 收益已经明显下降，当前更合理的策略是先按既有威胁模型完成手动收口，再决定是否开启更重的 Stage 3 实验。

### 9. 当前正式手动收口链已经 fresh 通过，当前 verdict 是 `passed`

截至 `2026-04-16` 当前最新一轮正式手动收口链已经重新 fresh 执行：

- `package:protection:smoke:encrypted -- --repeats 3 --channel stable`
- `package:protection:smoke:shielded -- --repeats 3 --channel stable`
- `package:protection:smoke:shielded -- --repeats 3 --channel beta`
- `package:protection:score -- --variant shielded --channel stable --webcrack "parse-fail / only-loader" --llm "high-level-architecture"`
- `package:protection:verdict`

当前最新结论是：

- `dist/package-protection-verdict.json` 的 `status = passed`
- `nextAction = keep-current-shielded`
- `shielded stable` 的手工评分已经正式回填为：
  - `webcrackInitialResult = parse-fail / only-loader`
  - `llmSinglePassResult = high-level-architecture`

这代表：

- 当前 `encrypted / shielded` 两条手动受保护导出分支都已经满足“阻碍普通开发者、自动化工具和一轮 AI 快速直读”的既定目标
- 当前还没有证据要求立刻重开 loader、`sidecar` 或服务端依赖增强
- 如果后续目标升级为“连高层架构都尽量不让 AI 单轮看懂”，才需要进入下一波更重的 hardening

### 10. `shielded-descriptor-bind` 的真实收益不在 raw export，而在 host-binding-aware runtime descriptor recovery

截至 `2026-04-16`，`shielded-descriptor-bind` 这一条手动实验分支已经补齐一个真实实现缺口：

- 之前 `package.mjs` 已经把 `descriptorOverlay` 传给 `protectBuildBundle`
- 但 `protectBuildBundle` 没继续把它传给 `protectBundleSource`
- 这会导致早期导出的 `shielded-descriptor-bind` 成品里虽然存在 overlay 路径代码，但 overlay 三段密文实际为空
- 当前该转发缺口已经修复，并补了落盘 build bundle 级回归测试，避免后续再生成“名义上是 descriptor-bind、实际上 overlay 为空”的样本

修复后对 `shielded` 与 `shielded-descriptor-bind` 的 fresh 成品对比结果是：

- `shielded.xpi` 约 `3,692,626` bytes
- `shielded-descriptor-bind.xpi` 约 `3,691,816` bytes
- fresh raw export 审计报告现已直接附带 `Descriptor-Bind Comparison` 小节：
  - `sameRawSurface = true`
  - `rawAnchorDeltaCount = 0`
  - `rawMatchDeltaCount = 0`
  - `xpiSizeDeltaBytes = -810`
  - `bundleSizeDeltaBytes = -385`
- 两者的 raw export 锚点审计结果都仍是：
  - `rawAnchorCount = 0`
  - `rawMatchCount = 0`

这说明：

- `descriptor-bind` 并不会进一步降低 raw loader / raw export 的静态锚点暴露
- 它增加的体积主要换来的不是“更干净的外层壳”，而是“在宿主弱绑定满足后，按需恢复 richer capability descriptor”

截至 `2026-04-16` 新补的本地 `webcrack` 自动化工件也给出了同向证据：

- `package:protection:webcrack:shielded:descriptor-bind -- --channel stable` 已可直接生成本地工件
- 当前真实结果仍是：
  - `status = passed`
  - `suggestedWebcrackRating = parse-fail / only-loader`
  - `effectiveOutputSource = fallback-loader`
  - `semanticAnchorCount = 0`
  - `loaderAnchorCount = 2`
- 这说明即使 overlay 已真实存在，`webcrack` 首轮自动化输出也没有直接把 richer descriptor 语义翻成可复核的 inner semantic anchors
- 因此 `descriptor-bind` 当前更像 runtime-aware 恢复路径，而不是一条能额外改善或恶化 raw/webcrack 静态表面的 hardening 变体

截至 `2026-04-17`，当前这条线也已经补上真实的 Zotero runtime smoke，而不再只停留在打包与静态分析：

- `package:protection:smoke:shielded:descriptor-bind -- --repeats 3 --channel stable` 已可直接生成本地工件
- 当前真实结果是：
  - `status = passed`
  - `readinessModes = {"native":3}`
  - `decodeMethod = fromBase64`
  - `medianDecodeDurationMs = 22`
  - `medianPrepareDurationMs = 86`
  - `hostBindingAvailableCount = 3/3`
  - `hostBindingDBAvailableCount = 3/3`
  - `hostBindingNoncePresentCount = 3/3`
  - `hostBindingNonceSources = {"created":3}`
  - `capabilityManifestDetailLevels = {"full":3}`
  - `capabilityManifestOverlayAvailableCount = 3/3`
  - `capabilityManifestOverlayAppliedCount = 3/3`
  - `capabilityManifestActivationSatisfiedCount = 3/3`
- 这说明 `descriptor-bind` 当前已经不只是“overlay 密文存在”或“host binding 逻辑在单元测试中通过”，而是：
  - 在真实 Zotero runtime 中已能回读 `profileHash / dbAvailable / noncePresent`
  - 能把 capability manifest 从 protected limited 视图推进到 `detailLevel = full`
  - 能在不引入启动阻断的前提下，让 overlay 真正进入运行态

因此这条线当前更精确的 retained decision 可以再补一条：

- `shielded-descriptor-bind` 已经证明 runtime semantic recovery 链路可用
- 但它的价值仍主要落在“运行时按需恢复 richer descriptor”，而不是“进一步压低 raw/webcrack 首轮静态可读性”

修复后的外部 `webcrack + GPT-5.4` 复核也进一步确认了这一点：

- AI 现在已经能稳定识别：
  - 外层仍是 `AES-GCM + new Function(...)` 的两段式保护壳
  - 第二段 overlay payload 已真实存在，不再是 `null`
  - overlay 可被还原成 capability / diagnostics 描述数组
- 一轮分析里已经能直接归纳出一组 capability id，例如：
  - `baseline-registration`
  - `item-presentation`
  - `reader-summary`
  - `host-actions`
  - `settings-governance`
  - `runtime-bridge-report`
- 同时也能从 inner bundle 中继续归纳出：
  - `bootstrapPlugin`
  - `listHostActions`
  - `runHostAction`
  - `collectDiagnostics`
  - `inspectReader`
  - `createAnnotation / updateAnnotation / deleteAnnotation`

这条外部验证说明：

- `descriptor-bind` 的修复已经让 overlay 这条 runtime 路径真正生效
- 但它并没有把“一轮 AI 可做高层架构归纳”的结论往下再压一档
- 相反，它更像是把“richer descriptor 只在满足 host binding 时恢复”这件事实现完整了，而不是显著提高离机静态分析的阻力

当前代码与测试已经固定了这条语义边界：

- protected baseline 默认只暴露 `limited` 视图，不附带 `entrypoints / ownedBy / successSignals`
- 即使 overlay 已存在，只要 `profileHash / dbAvailable / noncePresent` 任一缺失，仍保持 `limited`
- 只有 host binding 满足后，才会把 richer descriptor overlay 合并回 runtime manifest

因此当前 retained decision 应明确写成：

- `shielded-descriptor-bind` 是 runtime semantic recovery 实验入口，不是 raw export hardening 增强版
- 若目标是继续压 AI 对 raw 包的一轮高层归纳能力，下一步优先级仍然是 inner semantic scrub / Stage 3 候选，而不是继续在 descriptor-bind 这条线上挤 loader 表面

如果需要重新验证 `lightweight-js-obfuscator` 的当前适配状态，现已可使用仓库内的显式 preflight 入口：

```bash
npm run package:protection:lightweight:preflight
```

当前脚本会优先自动发现本地 `lightweight-js-obfuscator` checkout，默认搜索：

- 仓库邻近目录
- `$HOME/.openclaw/workspace-coding*`
- `~/Downloads`
- `dist/package-protection-tools/lightweight-js-obfuscator`

只有自动发现失败时，才需要显式补：

```bash
npm run package:protection:lightweight:preflight -- --tool-path /absolute/path/to/lightweight-js-obfuscator
```

它只会生成 advisory 预检报告，不会改写当前默认 `package:shielded` 实现。

### 11. `lightweight-js-obfuscator` 的真实 preflight 结论是“不能直接接入当前模板”

截至 `2026-04-16`，当前已经针对 `lightweight-js-obfuscator` 做过一次真实 preflight，而不是停留在概念讨论：

- npm registry 上不存在 `lightweight-js-obfuscator` 包；`npm view lightweight-js-obfuscator ...` 直接返回 `404`
- 当前只能按 GitHub 仓库形态使用它，而不能像 `javascript-obfuscator` 一样直接作为稳定 npm devDependency 接入
- 直接对当前 `protected-only` inner bundle 运行上游 `obfuscator.js` 时，会因为它把 `ObjectProperty` 的字符串 key 直接替换成 `CallExpression` 而失败
  - 典型错误是：`Property key of ObjectProperty ... got "CallExpression"`
- 在 `/tmp` 中对上游实验副本做最小兼容补丁，只跳过“非 computed 的对象字面量 key”后，它才首次成功产出完整输出

但这次 preflight 同时也说明，当前不应该把上游脚本原样接进模板：

- 输入 bundle 约 `652,155` bytes
- 当前多次真实样本里，输出大致落在 `4MB ~ 5MB`
- 体积膨胀大致落在 `6x ~ 8x`
- 上游默认 final pass 还会打开：
  - `selfDefending`
  - `debugProtection`
  - `debugProtectionInterval`
  - `disableConsoleOutput`
- 这些选项与当前模板已经验证过的 `loader-lite / hostile-runtime-disabled / 首次加载不卡顿` 路线是冲突的

这次 preflight 也给出一个有用但还不足以直接采纳的正信号：

- patched upstream 输出里，抽样检查下 `addonRef / addonVersion / generatedAt / optionalBundles` 这几个锚点都没有直接出现

因此当前关于 `lightweight-js-obfuscator` 的 retained decision 应固定为：

- 它可以继续作为 `Stage 3` 的候选思路
- 但不能把上游 CLI 直接并入 `package:shielded`
- 如果后续真的要继续这条路线，正确方向应是：
  - 基于当前模板做本地适配 wrapper 或受控 fork
  - 先关掉 hostile runtime 选项
  - 先解决对象字面量 key 这类 AST 兼容性问题
  - 然后再做真正的安装态 / 首次加载体感 / XPI 级 smoke A/B

### 12. `JS-Confuser` 当前只适合按“非 hostile 子集 + 独立 PoC”进入候选队列

截至 `2026-04-16`，当前关于 `JS-Confuser` 的经验沉淀需要明确分成两层：

- 可直接采信的部分，只限官方文档已经明说的选项语义
- 更细粒度的兼容性和破坏面，只能算 GitHub Issue / 社区线索，不能直接升格成模板 contract

当前能直接按官方文档确认的只有：

- `astScrambler`
  - 官方语义是“语义级改变 AST，以绕过自动化工具”
- `stringConcealing`
  - 官方语义是“编码字符串以隐藏明文值”
- `tamperProtection`
  - 官方语义是“保护运行时行为不被篡改”
- `antiDebug`
  - 官方语义是“在代码中插入 debugger 语句”
- `pack`
  - 官方语义是“把输出打包进单个 Function() 调用”
- `RGF`
  - 官方语义是“从字符串生成可执行代码”

当前同样已经明确：

- 官方文档没有给出 Zotero / Firefox 兼容性判定
- 官方文档没有给出 `dispatcher` / `opaquePredicates` 的可信性能量化
- `stringConcealing` 会不会破坏 `class constructor`，当前只能引用 GitHub Issue，不应被写成模板已验证事实

因此当前 retained decision 固定为：

- 值得做最小 PoC 的只有：
  - `astScrambler`
- 允许做小范围、有谓词约束的次级实验：
  - `stringConcealing`
- 当前不应带入模板主实验链的选项包括：
  - `antiDebug`
  - `tamperProtection`
  - `pack`
  - `RGF`

这里的核心判断不是“这些选项永远不能用”，而是：

- 它们要么直接引入 `debugger` 注入
- 要么显式依赖 `Function()` / runtime-generated code
- 与当前模板已经验证通过的 `loader-lite / hostile-runtime-disabled / 首次加载不卡顿` 路线不一致

所以当前更稳的路线是：

- 把 `JS-Confuser` 只当作 `Stage 3` 的次级候选
- 第一轮只试 `astScrambler`
- 若需要第二轮，再做带谓词的小范围 `stringConcealing`
- `dispatcher` / `opaquePredicates` 继续只保留为候选词条，不在没有 Zotero PoC 的前提下写成默认建议

当前仓库内已经补了一条对应的显式预检入口：

```bash
npm run package:protection:jsconfuser:preflight -- --tool-path /absolute/path/to/js-confuser
```

它当前固定只做一件事：

- 对外部 `js-confuser` checkout 运行 `astScrambler` 非 hostile 子集预检
- 默认使用 `plain` source proxy 评估“语义压缩潜力”
- 回读体积膨胀、语义锚点变化与基本语法可解析性
- 只生成 advisory 报告，不改写默认 `package:shielded`

截至 `2026-04-16`，这条预检已经有过一次真实运行结果，当前应把结论冻结为：

- 真实工具版本：`js-confuser@2.0.1`
- 真实入口形态：`dist/index.js`，API 形态为 `named-obfuscate`
- 当前 `astScrambler` 非 hostile 子集可以成功产出输出，并通过语法检查
- 当前样本里输出体积没有失控：
  - 输入约 `645KB`
  - 输出约 `523KB`
  - growth ratio 约 `0.81`
- 但对当前模板最关键的“高层语义锚点”压缩结果是 `0`：
  - `inputAnchorCount = 7`
  - `outputAnchorCount = 7`
  - `reducedAnchorCount = 0`
  - `reducedMatchCount = 0`

因此这条路线当前的 empirical decision 不能写成“已证明有效”，而应写成：

- `astScrambler` 预检已跑通
- 但当前样本上**没有证明它能降低 AI 的高层架构归纳能力**
- 当前 advisory 结论应固定为 `attention`
- `nextAction` 固定为 `not-promising-for-semantics`
- 现阶段不值得直接升级到更重的 XPI / Zotero A/B 集成实验

### 13. `JS-Confuser` 的小范围 `stringConcealing` 预检在当前样本上是第一条真正有收益的次级路线

在 `astScrambler` 预检确认“兼容没问题，但语义压缩没收益”之后，当前又补了一条更接近目标的显式入口：

```bash
npm run package:protection:jsconfuser:string:preflight -- --tool-path /absolute/path/to/js-confuser
```

这条命令固定保持非 hostile 边界：

- 只使用 `stringConcealing`
- 不开启 `antiDebug`
- 不开启 `tamperProtection`
- 不开启 `pack`
- 不开启 `RGF`
- 不默认全量 conceal，而是只对显式目标字符串做 substring-match 谓词过滤

截至 `2026-04-16`，这条预检已经有过一次真实运行结果，当前应把结论记录为：

- 真实工具版本：`js-confuser@2.0.1`
- 真实入口形态：`dist/index.js`
- API 形态：`named-obfuscate`
- 当前默认目标字符串集覆盖：
  - `plugin.api.agent.`
  - `runAgentAction`
  - `listAgentCapabilities`
  - `getPackageProtectionSummary`
  - `getLifecycleTelemetrySummary`
  - `entrypoints`
  - `ownedBy`
  - `successSignals`
  - `serviceRegistry`
  - `optionalBundles`
  - `agent-runtime`
  - `ai-service`
- 当前样本里产物可正常输出并通过语法检查
- 当前样本里体积没有失控：
  - 输入约 `645KB`
  - 输出约 `528KB`
  - growth ratio 约 `0.82`
- 对当前高层语义锚点的压缩结果是实质性的：
  - `inputAnchorCount = 7`
  - `outputAnchorCount = 0`
  - `reducedAnchorCount = 7`
  - `reducedMatchCount = 52`

因此当前关于这条路线的 empirical decision 应固定为：

- 它是当前 `JS-Confuser` 候选里第一条**已证明有收益**的路线
- 它比 `astScrambler` 更贴近“阻断一轮 AI 做高层架构归纳”的目标
- 当前 advisory 结论可以记为 `passed`
- `nextAction` 可以推进到 `run-zotero-smoke-ab`
- 但它仍然只是手动实验 lane，不代表已经进入默认 `package:shielded`

当前仓库内现已补齐对应的显式手动实验入口：

```bash
npm run package:shielded:jsconfuser:string
npm run package:protection:smoke:shielded:jsconfuser:string -- --repeats 3 --channel stable
npm run package:protection:audit:jsconfuser:string
npm run package:protection:compare:jsconfuser:string -- --channel stable
```

如果本地自动发现 `js-confuser` 失败，再对前三条命令补 `--jsconfuser-tool-path`，或对 preflight 补 `--tool-path`。

这两条命令的语义固定为：

- 第一条只生成新的 `shielded-jsconfuser-string` 本地实验 XPI
- 第二条只对这个实验变体做 Zotero 安装态 / 启动态 smoke A/B
- 第三条只把它作为额外实验变体并入同一份 raw export 审计报告
- 第四条只把 `shielded` 基线和 `jsconfuser-string` 当前证据收口成一份 A/B compare 报告
- 四者都不替代当前正式收口链里的 `shielded stable`

当前更稳的下一步不是直接并入主线，而是：

- 保留 `shielded` 作为当前默认手动受保护导出基线
- 把 `shielded-jsconfuser-string` 保留为已完成一轮复验的实验记录，不再当作当前推荐候选
- 后续只有在新的真实样本或新一轮跨环境复验里重新出现稳定收益，才重开它的推广讨论

### 11. `shielded-jsconfuser-string` 已完成 stable / beta 复验，当前保守结论是 `leaning-same`

截至 `2026-04-18`，这条实验线的证据已经补齐到可收口状态：

- 早期 `stable compare` 曾因为单轮 `LLM single-pass` 优势而短暂给出 `status=passed`、`decision=hardening-win`
- 当前 compare 规则已经收紧为：单轮 `LLM single-pass` 优势不足以升级为 `hardening-win`，必须同时看到与 `shielded` 对称的 guided-attack 证据也更优
- 按这条更新后的规则重新回看后，`stable compare` 与 `beta compare` 的 retained decision 都应按 `leaning-same / stop-current-candidate` 处理
- `beta` 侧 fresh `smoke`、`webcrack`、`inner audit` 与手工 `LLM single-pass` 都已补齐
- `beta` 侧可读性结果与基线 `shielded` 相同：两边都停留在 `parse-fail / only-loader`
- `beta` 侧性能与体积没有换来额外收益：
  - `xpiBytes +1403664`
  - `bundleBytes +2320674`
  - `medianDecodeDurationMs +5`
  - `medianPrepareDurationMs +18`
- 截至 `2026-04-18` 的最新 `stable` 冷启动测量里，`shielded-jsconfuser-string` 也补到了 `12` 次 fresh run，结果显示：
  - `durationMs median = 1599`
  - `loadSubScriptDurationMs median = 529`
  - `decodeDurationMs median = 29`
  - `evalDurationMs median = 46`
  - `prepareDurationMs median = 93`
  - 相对 `shielded` 的保护链边际成本是：
    - `loadSubScript +106.5ms`
    - `prepare +9ms`
    - `decode +4.5ms`
    - `eval +2ms`
    - `xpiBytes +1197704`
    - `bundleBytes +1973241`
- 需要单独强调的是：这一轮 `stable` 的端到端 `durationMs median` 虽然比 `shielded` 低 `129.5ms`，但这不能解释成 `jsconfuser-string` “本质更快”。因为它自己的 `loadSubScript / decode / prepare` 全部更高，说明保护链本身更重；端到端冷启动差异更多是 Zotero 宿主冷启动噪声盖过了这一级别的边际开销。

当前更可信的 retained decision 应固定为：

- `shielded-jsconfuser-string` 在当前威胁模型下没有形成可稳定复现的 A/B 优势
- 它的 preflight 与单次 stable 结果说明 `targeted stringConcealing` 仍值得研究，但这不足以支撑当前就升级为推荐候选
- 这条路线继续保留为实验记录即可，不替代当前正式收口链中的默认 `shielded stable`
- 当前若继续推进“抗一轮 AI 高层架构归纳”，优先做 inner semantic scrub / protected-only 语义减噪，而不是继续给 `jsconfuser-string` 扩面
- 这条实验线的工件顺序仍固定为：
  `smoke -> webcrack:score / manual-score -> compare`
  若中途重新跑了 `smoke`，对应 smoke report 的 `manualScorecard` 会被刷新回 `pending`，必须重新回填后再看 compare

### 12. 做受保护包性能判断时，优先看 `loadSubScript + prepare`，不要只看总冷启动时间

- 当前模板里，`durationMs` 适合回答“用户是否会感觉明显卡顿 / 白屏 / 假死”。
- 但真正代表保护链自身额外成本的，仍然是：
  - `loadSubScriptDurationMs`
  - `decodeDurationMs`
  - `decryptDurationMs`
  - `evalDurationMs`
  - `prepareDurationMs`
- 原因很直接：Zotero 自身冷启动、profile 状态和宿主噪声会影响端到端 `durationMs`，尤其在 `shielded` 与 `shielded-jsconfuser-string` 这种差值只有 `100ms` 量级的候选对比里，容易把“更重的保护链”误读成“更快的总启动”。
- 因此当前 retained rule 固定为：
  - 看“是否适合继续保留某条保护路线”时，先看 `loadSubScript + prepare`
  - 看“是否已经出现明显体感风险”时，再看 `durationMs`
- 当前对应的固定报告入口是：

```bash
npm run package:protection:perf -- --channel stable
```

- 读取这份报告时，当前固定口径是：
  - `durationMs median / p95 / max` 用来判断 UX 风险与尾延迟
  - `loadSubScriptDurationMs + prepareDurationMs` 用来判断保护链自身额外成本
  - 当某个候选表现出“总时长更快，但 `loadSubScript + prepare` 更高”时，应按宿主冷启动噪声处理，不能直接升级为更优保护路线

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
- `路线4`（轻服务能力）继续作为未来 hardening 备选；`路线5`（Wasm 小内核）只有在 `package:protection:wasm:admission` 输出 `ready-for-candidate` 后，才允许以 `shielded-surface-scrub-wasm-digest` 进入 advisory experiment，不替代 `encrypted / shielded` 主线。

### 宿主弱绑定候选边界

- 当前还有一个值得保留、但尚未实现的本地 hardening 候选：
  - `shielded host weak binding`
- 这条路线的 retained decision 已经明确：
  - 主锚点优先 `hash(realpath(Zotero.Profile.dir))`
  - `plugin-owned sqlite nonce` 的价值高于继续挤压 `dataDir/profile id` 这类路径文本
  - `Zotero.DataDirectory.dir` 只适合做辅助盐或 fallback
  - 正确位置是二阶段 unlock，不是把 `bootstrapPlugin` 绑成“宿主不对就起不来”
- 这条路线要解决的问题不是 secrets protection，而是：
  - 让二阶段 descriptor / policy / 高层语义材料不再只靠包文件就能恢复
  - 提高离机静态分析与跨环境复制复用的门槛
- 具体设计边界见 [PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md](./PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md)。

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
- [PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md](./PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md)
