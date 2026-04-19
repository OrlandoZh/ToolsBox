# Package Protection Attack Grading

> 用途：把受保护打包这条线里的“攻击者 + AI 组合能力”评测标准固定下来，避免把 `single-pass LLM`、`webcrack + AI`、`带参考样本的多轮重建` 混成同一种结论。
> 范围：这是 package protection 的实验/评估标准，不是 current truth；它不改默认 `release` / `agent:gate` 主线。
> 更新时间：2026-04-19

## 结论先看

当前评分固定分两层：

- 对外 / 收口层：
  - `parse-fail / only-loader`
  - `high-level-architecture`
  - `readable-module-recovery`
- 内部实验层：
  - `attackerTier`
  - `aiTier`
  - `attackMethod`
  - `timeBucket`
  - `roundMode`
  - `resultTier`

原则固定为：

- verdict 继续只看三档 `rating`
- 更强的“攻击者 + AI 组合能力”证据走 `package:protection:score:guided`
- `guided attack` 不伪装成 `single-pass manual score`

## 命令入口

```bash
npm run package:protection:score:guided -- \
  --variant shielded \
  --channel stable \
  --rating "high-level-architecture" \
  --result-tier R1 \
  --attacker-tier A2 \
  --ai-tier M3 \
  --attack-method static+reference \
  --time-bucket 30-120m \
  --round-mode multi-round \
  --summary "reference-guided reconstruction recovered lifecycle facade" \
  --evidence-file /absolute/path/to/session.md \
  --evidence-file /absolute/path/to/reparsed.js
```

输出工件固定写到：

- `dist/package-protection-guided-attack/<variant>-<channel>-<profileKey>.json`
- `dist/package-protection-guided-attack/<variant>-<channel>-<profileKey>.md`
- `dist/package-protection-guided-attack/<variant>-<channel>.json` (`legacy alias`，仅用于兼容当前 compare / 手工定位入口，不再承载所有画像)
- `dist/package-protection-guided-attack/<variant>-<channel>.md` (`legacy alias`)
- `dist/package-protection-guided-attack.json`
- `dist/package-protection-guided-attack.md`

如果需要把当前所有 `webcrack / single-pass LLM / guided-attack / compare` 证据统一收成一份攻击视角摘要，再运行：

```bash
npm run package:protection:attack
```

如果需要把 attack report 里的 fixed-profile coverage gap 直接翻成下一步命令模板，再运行：

```bash
npm run package:protection:attack:plan
```

输出：

- `dist/package-protection-attack-report.json`
- `dist/package-protection-attack-report.md`
- `dist/package-protection-guided-attack-plan.json`
- `dist/package-protection-guided-attack-plan.md`

它不新增评分标准，只负责按本页的两层口径汇总已有证据；`attack:plan` 则继续把这些固定口径转成下一步补证据任务。

当前 attack report 还会固定标出两条覆盖线：

- `singlePassAutomation`
  来自 `webcrackInitialResult + llmSinglePassResult`
- `guidedA2M3`
  指“至少达到 `A2 / M3 / static+reference / multi-round / 30-120m`”的更强攻击画像

这样后续子 agent / 人工补证据时，可以直接回答“某个候选是否已经覆盖这两条固定画像”，而不是继续手动对照零散工件。

当前 attack report 的 `recommendedAction` 还固定遵循一条收口顺序：

- `current` 候选如果还没覆盖固定画像，先提示补 `singlePassAutomation` / `guidedA2M3`
- 只有固定画像已经覆盖，才继续沿用 guided-attack / compare 里的 `probe-candidate-hardening` 一类候选建议

其中 `profileKey` 固定由 `attackerTier + aiTier + attackMethod + roundMode + timeBucket` 组成，用来区分同一 `variant/channel` 下的不同攻击画像，避免单轮静态分析把多轮 reference-guided 结果覆盖掉。

## 对外三档

### `parse-fail / only-loader`

含义：

- 只能稳定描述 loader / decrypt / eval 外壳
- 不能可靠恢复插件高层架构
- 不能稳定点名真实服务装配或宿主桥接关系

### `high-level-architecture`

含义：

- 能归纳插件大致架构、生命周期、能力面
- 能说出主要模块职责或宿主接线图
- 但还不能恢复成“可维护的模块主体源码”

### `readable-module-recovery`

含义：

- 已能恢复出较稳定、可持续阅读的模块主体
- 足以支撑进一步还原、裁剪、迁移或对照修改

## 内部六维

### 1. `attackerTier`

- `A0`：普通用户。不会主动拆包、不会看脚本。
- `A1`：普通开发者。会解压 XPI、跑现成工具、问一轮 AI。
- `A2`：中级开发者。会多轮提示、对照同类项目、手工整理结构。
- `A3`：高级开发者 / 逆向熟手。会做脚本化还原、runtime hook、patch 试探。
- `A4`：专业逆向。会主动重建流程、补环境、定位绕过点。

### 2. `aiTier`

- `M0`：无 AI。
- `M1`：单轮 AI 直读。
- `M2`：多轮 AI 提示和追问，但没有参考样本。
- `M3`：AI + 参考项目 / 同类源码 / 结构对照。
- `M4`：AI + 动态调试 / hook / 脚本化辅助。

### 3. `attackMethod`

- `static-only`：只做静态阅读/字符串搜索/格式化。
- `static+webcrack`：先过 `webcrack` 或同类自动化，再做后续分析。
- `static+reference`：拿参考项目、模板源码或同类编译产物做结构对照。
- `dynamic-hooked`：进入运行时、拦截解密/挂钩关键 API。
- `runtime-rehosted`：把样本放到自建环境里重放、重组执行链。

说明：

- 旧字段 `attackPath` 仍作为兼容镜像保留。
- 新记录优先使用 `attackMethod`。

### 4. `timeBucket`

- `<10m`
- `10-30m`
- `30-120m`
- `>120m`

说明：

- 这是“拿到包后到形成当前结论”的总时间桶，不追求秒级精度。
- 旧字段 `costBucket` 仍作为兼容镜像保留。

### 5. `roundMode`

- `single-pass`
- `multi-round`

说明：

- `single-pass` 只代表“一轮工具/AI/提示词”。
- `multi-round` 代表存在连续追问、对照样本、逐层深入。

### 6. `resultTier`

- `R0`：`only-loader`
- `R1`：`high-level-architecture`
- `R2`：`critical-flow-recovery`
- `R3`：`readable-module-recovery`
- `R4`：`patch-and-bypass-ready`

推荐解释：

- `R0`：只知道外壳怎么解密和执行。
- `R1`：知道插件大致怎么装配、有什么能力面。
- `R2`：关键启动链、服务注册、生命周期流程已经能结构化重建。
- `R3`：模块主体已经基本可读，可直接继续深挖。
- `R4`：已经足以做补丁、改行为、绕保护或迁移。

## 二次开发判定

### `R0`

- 不能直接用于二次开发。
- 只能说明“这是个什么壳”和“真实代码在哪一层”。

### `R1`

- 不能直接用于“维护同一份代码”式二次开发。
- 可以用于：
  - 模仿总体架构
  - 重做生命周期骨架
  - 重建插件接口面
- 不能可靠用于：
  - 精准修改原插件内部逻辑
  - 延续原模块边界继续开发
  - 稳定做 bugfix 级别的补丁

### `R2`

- 可以开始做“结构重建型”二次开发。
- 仍然不适合作为真实源码替代，但已经足以让熟练开发者继续补流程、补接口、补行为。

### `R3`

- 基本已经能直接支撑二次开发。
- 虽然不一定等于原始源码，但已经足够接近“可维护实现”。

### `R4`

- 已经超过“可二次开发”门槛，进入“可补丁 / 可绕过 / 可移植”区间。

## 当前样例映射

### 样例 1：`webcrack + GPT 多轮`

推荐映射：

- `attackerTier = A1-A2`
- `aiTier = M2`
- `attackMethod = static+webcrack`
- `timeBucket = 10-30m` 或 `30-120m`
- `roundMode = multi-round`
- `resultTier = R1`
- `rating = high-level-architecture`

含义：

- 更像“高层归纳型攻击”。
- 通常能解释 loader 和插件大致能力面，但还不稳定触达关键流程重建。

### 样例 2：中级开发者 + 参考项目 + GPT-5.4 引导重建

推荐映射：

- `attackerTier = A2`
- `aiTier = M3`
- `attackMethod = static+reference`
- `timeBucket = 30-120m`
- `roundMode = multi-round`
- `resultTier = R1`
- `rating = high-level-architecture`

补充判断：

- 这类结果通常是 `R1+`，并可能逼近 `R2 candidate`。
- 如果已稳定恢复：
  - lifecycle facade
  - runtime bridge
  - service registration model
  - plugin assembly graph
  但仍未恢复可读模块主体，那么它仍停留在 `rating = high-level-architecture`，只是强度显著高于单纯 `webcrack + GPT`。

### 样例 3：`shielded-surface-scrub-wasm-digest` 的固定强档画像

推荐映射：

- `attackerTier = A2`
- `aiTier = M3`
- `attackMethod = static+reference`
- `timeBucket = 30-120m`
- `roundMode = multi-round`
- `resultTier = R1`
- `rating = high-level-architecture`

补充判断：

- 这类结果当前的典型含义是：
  - 攻击者已经能识别它是一个 `shielded-surface-scrub` 衍生候选
  - 还能识别它带有 default-disabled / lazy 的 Wasm digest micro-kernel
  - 也能看出这条 Wasm lane 被限制在 `content/lib/w/*`
- 但只要当前证据仍然是：
  - `webcrack = parse-fail / only-loader`
  - `inner audit = parse-fail / only-loader`
  - 没有稳定恢复可读 inner modules
  那它就仍然只能停在 `rating = high-level-architecture`
- 不应因为“能认出 Wasm 候选角色和边界”就把它抬到 `readable-module-recovery`

## 评估时的保守规则

- 不要把 `guided attack` 结果回填成 `manualSinglePass.llmSinglePassResult`
- 不要把 `proxy LLM` 当成真实人工攻击结果
- 不要把“看懂高层架构”误写成“可维护源码恢复”
- 如果已经能支撑稳定补丁或迁移，应直接升到 `R3` 或 `R4`，不要继续停留在 `R1`
