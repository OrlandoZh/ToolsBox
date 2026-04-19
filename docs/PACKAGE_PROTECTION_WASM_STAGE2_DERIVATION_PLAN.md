# Package Protection Wasm Stage2 Derivation Plan

> 用途：把“Wasm 是否适合承担受保护打包里的二阶段派生核，以及应如何在不破坏更新链、主启动链和当前 `shielded` 主线的前提下推进实验”收成一份可执行设计。
> 范围：这是 package protection / Wasm 支线设计，不是 current truth；它不改变默认 `release` / `agent:gate` / `agent:gate:release` 主线，也不代表当前已经完成实现。
> 最后更新：2026-04-20

## 结论先看

当前如果继续推进 Wasm 与受保护打包的交集，最合理的目标不是：

- 把整个二阶段逻辑都搬进 Wasm
- 把 Wasm 当成真正的 secrets protection
- 把 Wasm 直接接进 `bootstrapPlugin` 的主启动链
- 通过 Wasm 解锁后把完整 `capability overlay` 重新带回 JS 层

而是：

- 保持当前 `shielded` / `shielded-surface-scrub` 主路线不变
- 只把“高语义价值、低宿主耦合、纯派生/纯判断”的二阶段小核放进 Wasm
- 让 Wasm 只负责 `digest / unlockToken / compact gate decision` 这类微内核结果
- 避免把可用于归纳高层架构的 overlay 清单、entrypoints、ownedBy、successSignals 作为解锁结果暴露回 JS
- 更新链、安装链和第一阶段启动链继续保持原样可用

当前固定判断应写成：

1. `Wasm stage2 derivation` **只服务反静态分析**
2. 当前 **不**服务“真正密钥保密”
3. 当前 **不**服务“抗专业逆向”
4. 当前 **不**替代 `shielded-surface-scrub`
5. 当前最合适的实验形态是：
   - `default-disabled`
   - `loader-lite`
   - `second-stage only`
   - `downgrade-on-mismatch`

## 2026-04-20 实验后决策

`shielded-surface-scrub-wasm-stage2-derive` 已完成一轮真实验证，结论是：

- 工程上可行：修复 bootstrap 白名单后，Zotero runtime 能加载 `WebAssembly`，smoke 能进入 `readinessMode=native`
- 静态边界可控：相对 `shielded-surface-scrub` 没有扩大 package-boundary 暴露
- 但保护目标上回退：inner audit 因恢复了 `12` 条 capability overlay 条目，从 `parse-fail / only-loader` 退到 `high-level-architecture`

因此当前决策固定为：

- `shielded-surface-scrub-wasm-stage2-derive` 标记为 `stop-current-candidate`
- 不再把“Wasm 解锁完整 capability overlay”作为推荐路线
- 后续若继续 Wasm，只保留更窄的 `digest / unlockToken / compact decision` 微内核路线
- 成功标准从“恢复 full protected overlay”改为“保持 limited static surface，同时在运行时产生不可读的紧凑判定信号”

## 为什么要单独开这条设计

当前 package protection 路线已经冻结的事实是：

- `encrypted` 继续作为低开销基线
- `shielded` 继续作为当前 primary
- `shielded-surface-scrub` 当前仍是 retained top candidate
- `shielded-surface-scrub-wasm-digest` 已证明 bounded Wasm candidate 可行，但还没有超过 `surface-scrub`

相关参考：

- [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md)
- [PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md)
- [WASM_KERNEL_PROMOTION_PLAN.md](./WASM_KERNEL_PROMOTION_PLAN.md)

这意味着：

- 当前继续提高自动化/AI 静态解读阻力，重点已经不是重 loader
- 重点也不是再扩大 unpacked support surface scrub
- 更合理的方向是：把二阶段里最帮助 AI 做高层架构归纳的“派生核”挪到 Wasm

## 目标与非目标

### 当前目标

这条路线当前只解决以下问题：

- 降低“一轮 AI + 静态拆包”快速讲清二阶段结构的能力
- 降低“只拿 XPI 离机读包”时恢复二阶段 unlock 条件的直观性
- 让 `capability / descriptor / overlay` 的 enable 判定不再完整暴露在 JS 明文里
- 不把 richer overlay 内容本身作为 Wasm 解锁后的静态可读结果

### 当前非目标

当前不把以下目标写进成功标准：

- 真正保住 AES key 不被本地恢复
- 抗专业动态调试
- 抗运行时 hook / rehost
- 让插件离开真实 Zotero 宿主就完全无法分析
- 用本地 Wasm 方案承担许可证或 DRM 根能力

## 边界原则

### 1. 更新链与二阶段派生链分离

以下元数据必须继续保持正常、稳定、明文：

- `addonId`
- `addonVersion`
- `manifest.applications.zotero.update_url`

理由：

- 它们属于安装/更新/识别链的必要前提
- 不应被放进二阶段解锁材料
- 当前已验证 `update_url` 不能删除，否则会直接破坏 installability

### 2. 第一阶段启动链不依赖二阶段成功

固定规则：

- `bootstrapPlugin` 仍先可用
- `packageProtection` 主 decrypt/eval 仍保持当前 `loader-lite`
- stage2 mismatch 时只允许降级，不允许阻断启动

禁止做法：

- “拿不到正确派生结果就整个插件起不来”
- “更新后本地状态轻微变化就直接 startup failure”

### 3. Wasm 只承接小核，不承接宿主注册层

以下内容当前适合进入 Wasm：

- `bundleSeed + hostBindingInput -> digest / unlockToken / compactGate`
- `hostBindingInput` 的归一化后混合
- `capability / descriptor / overlay` 是否可启用的紧凑判断
- 小体量 entitlement / config blob 的不可读判定摘要

以下内容当前不适合优先进入 Wasm：

- `bootstrapPlugin` 主控制流
- `PreferencePanes / ItemPane / Reader / MenuManager`
- 生命周期和 host bridge
- 用户可见 UI 文案和宿主 authoritative contract
- 完整 capability overlay 清单、entrypoints、ownedBy、successSignals

## 当前推荐架构

### 高层流程

推荐固定成如下形状：

1. 第一阶段继续沿用当前 `shielded` / `surface-scrub`
2. 运行时收集宿主弱绑定输入
3. JS 调 Wasm stage2 derivation kernel
4. Wasm 返回：
   - `unlockToken`
   - `compactGate`
   - 可选 `diagnosticDigest`
5. JS 用这些结果决定：
   - 是否记录运行时 gate satisfied
   - 是否允许某个小型、非描述性能力开关生效
   - 是否保持 protected manifest 在 `limited` 静态表面
6. 若派生失败或条件不满足：
   - 插件保持运行
   - 只回到 `protected limited view`

### 推荐输入

当前固定优先级：

1. `profileHash = hash(realpath(Zotero.Profile.dir))`
2. `plugin-owned sqlite nonce`
3. `schemaBucket`
4. `zoteroVersionBucket`
5. 可选 `profileBasenameBucket`

`Zotero.DataDirectory.dir` 只允许作为辅助盐或 fallback，不作为主锚点。

### 推荐输出

#### `unlockToken`

- 用于判断某个紧凑运行时 gate 是否满足
- 不用于恢复完整 capability overlay
- 不要求直接承担 payload 解密

#### `compactGate`

- 用于表达一个布尔或小整数结果
- 可进入 telemetry / diagnostics，但不得携带能力目录、模块名、entrypoint、ownedBy 或 successSignals

## 当前最适合保护的对象

### 适合

- `capability manifest` 是否允许进入某种运行时状态的紧凑判定
- `descriptor overlay` 的不可读 gate，不是 overlay 内容本身
- 更高语义价值字段的散列、计数或通过/失败判定，不是原文恢复
- agent/runtime diagnostics 的 richer map
- 小体量二阶段 config / entitlement 的紧凑判定结果

### 不适合

- 主 bundle 本体
- 宿主枚举和真实 API 名称
- UI surface 注册过程
- 用户可见主逻辑
- 完整 overlay 条目、能力清单、entrypoints、ownedBy、successSignals

## 更新与兼容性设计

### 必须满足

- 网络更新链不变
- 更新后插件仍可启动
- 若本地 nonce、profile bucket 或版本 bucket 变化，最多只导致二阶段降级

### 推荐做法

- `schemaBucket` 与 `zoteroVersionBucket` 只做粗粒度 bucket，不做精确值硬卡
- `sqlite nonce` 进入插件自有持久层，更新时默认保留
- 二阶段 gate 只对 richer overlay 生效，不对 startup 生效

### 明确禁止

- 把 `addonVersion` 自身当作解锁必要输入
- 把 `update_url`、`addonId`、`instanceKey` 这类包内固定元数据当作绑定材料
- 让更新后的轻微版本漂移直接导致 stage2 永久失效

## 实验分波

### Wave 0：设计与现状对齐

目标：

- 冻结设计边界
- 确认当前 `runtime.deriveWasmKernelUnlockToken` 已足够作为 shadow-mode 实验入口
- 不新增 package variant

交付物：

- 本文档
- 当前 unlock diagnostics 证据

### Wave 1：shadow-mode derivation evidence

目标：

- 不改 package protection 变体
- 只验证 Wasm derivation kernel 本身是否稳定
- 只看：
  - smoke
  - performance
  - disabled contract
  - downgrade viability

通过条件：

- `readinessMode = native`
- `blockingRuntimeErrorCount = 0`
- derivation 结果 main-thread / worker 一致
- 默认仍是 `default-disabled`
- 不影响更新/安装元数据

### Wave 2：protected-only overlay gate candidate（已停止）

目标：

- 仍以 `shielded-surface-scrub` 为 base
- 让 Wasm derivation 只接入 `descriptor overlay / capability manifest full view`
- 不接主启动链
- mismatch 时回到 `limited protected view`

当前建议变体命名：

- `shielded-surface-scrub-wasm-stage2-derive`

实验结果：

- `smoke` 通过，runtime gate 可工作
- `webcrack` 仍保持 `parse-fail / only-loader`
- `anchor audit` 未发现超出 `content/lib/w/*` 的新增边界暴露
- `inner audit` 因 overlay 恢复退到 `high-level-architecture`

当前状态：

- 停止作为 promotion candidate
- 保留为反例和回归基线
- 不进入 retained top candidate

### Wave 2b：narrow micro-kernel candidate（后续唯一推荐 Wasm 方向）

目标：

- 仍以 `shielded-surface-scrub` 为 base
- Wasm 只返回 `unlockToken / compactGate / diagnosticDigest`
- 不恢复完整 capability overlay
- 不把 `label / description / entrypoints / ownedBy / successSignals` 带回 JS
- mismatch 时只影响该紧凑 gate，不影响启动、不影响更新

当前优先复用：

- `shielded-surface-scrub-wasm-digest`

如果未来新增变体，命名应体现“micro-kernel / gate-only”，不得复用 `stage2-derive` 表达完整 overlay 恢复。

### Wave 3：compare / retained review

只有当 Wave 2 完整通过后，才允许进入 compare。

比较基线固定为：

- `shielded-surface-scrub`

不直接和以下对象做 promotion 判断：

- `plain`
- `encrypted`
- `shielded`

## 验证矩阵

### 必跑

- `smoke`
- `perf`
- `inner audit`
- `webcrack`
- `single-pass LLM`
- `guided A2/M3`
- `update-safety`

### 必查

- 新增静态暴露是否仍受限于 `content/lib/w/*`
- JS glue 是否仍然直接暴露完整二阶段结构
- mismatch 是否只导致 `limited protected view`

## 通过门槛

### 工程门槛

- 不改默认 `release / gate`
- 不影响 `update_url`
- 不新增 startup blocker
- 不让 stage2 成为 install/update 的硬前提

### 安全/反静态门槛

满足以下任意两条才值得继续：

- 高语义锚点进一步下降
- `webcrack` / LLM 档位至少一项改善
- `A2 / M3 + static+reference + multi-round` 的结果比 base 更差一档
- JS 明文中的二阶段派生流程明显减少
- inner audit 不得比 `shielded-surface-scrub` 更容易归纳高层架构

## 停止条件

出现以下任意一条，当前 wave 直接停止：

- 攻击评级不变，只增加体积或复杂度
- inner audit 从 `parse-fail / only-loader` 退到 `high-level-architecture`
- JS glue 仍能直接讲清楚二阶段结构
- 必须把宿主注册层也搬进 Wasm 才能见效
- 更新后 stage2 经常失配
- stage2 mismatch 会影响正常启动或更新
- Wasm 解锁结果恢复完整 capability overlay

## 当前推荐结论

当前最值得推进的是：

- `shadow-mode unlock derivation` -> `narrow digest/unlock micro-kernel`

当前不值得推进的是：

- “最大范围二阶段都搬进 Wasm”
- “让 Wasm 接管整个 bootstrap 主链”
- “把本地 Wasm 派生描述成真正的 key secrecy”
- “用 Wasm gate 恢复完整 capability overlay”

一句话收口：

> Wasm stage2 derivation 当前只应作为 `shielded-surface-scrub` 之上的小核增强层，用来产生紧凑、不可读的 digest/unlock 判定；它不得把完整 capability overlay 重新暴露给 JS，且必须保持 default-disabled、second-stage only、update-safe、startup-non-blocking。
