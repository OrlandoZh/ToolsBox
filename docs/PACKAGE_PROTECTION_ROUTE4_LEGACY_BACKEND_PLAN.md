# Package Protection Route4 Legacy Backend Plan

> 用途：把“现阶段先不改后端、快速把用户验证接到受保护打包分支里，同时为后续更优服务端策略保留升级蓝图”收成一份可执行方案。
> 范围：这是 package protection / route4 支线方案，不是 current truth；它不改变默认 `release` / `agent:gate` / `agent:gate:release` 主线。
> 最后更新：2026-04-20

## 结论先看

当前如果希望：

- 先复用现有服务器后端
- 不改后端协议
- 先把用户验证以最低工程成本接进受保护打包支线
- 同时不给后续更优方案挖坑

那么最合理的落地方式不是：

- 把 `RelationGraph` 的 gate 直接搬到 `onMainWindowLoad()`
- 把整插件启动绑到远端验证
- 继续把授权状态主存到 `prefs`
- 把“后端不改”的临时方案写成长期主线

而是：

1. 先做一个 **v0 legacy-backend quick apply** 路线
2. 只作为 **显式可选 variant**
3. 固定保持：
   - `default-disabled`
   - `manual-only`
   - `second-stage only`
   - `downgrade-on-mismatch`
4. 客户端优先把：
   - 旧协议组包
   - 返回值校验
   - 本地 gate 判定
   收进 Wasm 微内核
5. 同时把未来目标固定成：
   - **v1 signed ticket / public-key verify**
   - 服务端保留真正授权根
   - 客户端 Wasm 只做验签和紧凑 gate 判定

一句话说，当前正确路线应写成：

> 先用 Wasm 把“旧后端协议的客户端侧语义”藏进一个窄微内核里，作为可选 protection lane 快速应用；但长期目标必须仍是 ticket/签名化，而不是把共享 secret 永久藏在客户端。

## 当前 v0 实现状态

当前 v0 已落成一个 advisory-only 手动 experiment variant：

- `shielded-surface-scrub-wasm-entitlement-legacy`

它只做：

- legacy backend 验证 spine
- sqlite cache
- runtime diagnostics
- host action 显式触发
- package protection 工具链收录

它不做：

- 用户可见入口
- 真实产品功能 gate
- 主启动链阻断
- full capability overlay 恢复
- 默认 `release / agent:gate / agent:gate:release` 接入

构建该变体必须显式提供构建时环境变量：

```bash
CLEANROOM_ROUTE4_LEGACY_ENDPOINT=https://example.invalid/legacy \
CLEANROOM_ROUTE4_LEGACY_SECRET=legacy-secret \
npm run package:shielded:surface-scrub:wasm:entitlement:legacy
```

缺少 `CLEANROOM_ROUTE4_LEGACY_ENDPOINT` 或 `CLEANROOM_ROUTE4_LEGACY_SECRET` 时，该变体会 fail fast。默认包和其他受保护变体不会读取这些变量。

对应 smoke 入口：

```bash
CLEANROOM_ROUTE4_LEGACY_ENDPOINT=https://example.invalid/legacy \
CLEANROOM_ROUTE4_LEGACY_SECRET=legacy-secret \
npm run package:protection:smoke -- --variant shielded-surface-scrub-wasm-entitlement-legacy --channel stable
```

当前 runtime summary 固定只暴露 `packageProtection.controlPlane` 的紧凑诊断，不回显 endpoint、secret、raw response 或明文授权文案。

## 当前问题到底是什么

当前参考里的现有后端模式，本质上是：

- 客户端拿 `userID`
- 客户端生成 `serial` / `activation` 一类校验值
- 发到固定验证端点
- 服务端回一个结果值
- 客户端在本地判断“是否通过”

这条线的优点是：

- 现成可用
- 接入快
- 不需要先改服务端

但它的缺点也很明确：

- 客户端里仍然存在可恢复的验证规则
- endpoint / 请求时机 / 网络行为仍然可见
- 如果仍然使用共享 secret，它只是“更难读”，不是“真正保密”

因此当前阶段的正确目标只能是：

- **提高静态分析门槛**
- **避免一轮 AI 直接读懂验证语义**
- **不给未来升级 ticket/签名方案制造结构性阻力**

而不是：

- 真正把授权根安全地放在客户端
- 对抗专业逆向
- 把远端验证本身“藏到不存在”

## 当前推荐的 v0 形态

### variant 形态

当前建议把这条线定义成一个新的显式 protection variant，例如：

- `shielded-surface-scrub-wasm-entitlement-legacy`

它的固定边界应为：

- 基于 `shielded-surface-scrub`
- 不替代默认 `shielded`
- 不进入默认 `release / gate`
- 默认关闭
- 只在 package protection 手动实验链里评估

### runtime 边界

当前 v0 只允许 gate：

- 二阶段小能力
- 小体量 descriptor / policy / entitlement enable
- 非启动关键路径的受保护附加能力

当前 v0 不允许 gate：

- `bootstrapPlugin` 主启动链
- 主窗口基础挂载
- Reader / Item Pane / Preference Pane 的基础可用性
- update / installability / bootstrap 基线

### local state 边界

当前本地状态优先级固定为：

1. `plugin-owned sqlite nonce`
2. `zotero.sqlite` 内的小体量 ticket / cache
3. `prefs` 只保留普通用户开关，不作为主授权缓存

具体本地载体判断继续遵循：

- [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md)

## v0 可以直接复用现有后端的哪些部分

当前允许直接复用：

- 用户标识来源，例如 `Zotero.Users.getCurrentUserID()`
- 现有后端的“用户是否有权”判断逻辑
- 现有验证端点
- 现有请求/响应 schema

当前不应继续原样复用：

- 入口顶层 gate 位置
- JS 明文里的 `AUTH_SECRET`
- JS 明文里的 `activation / authorized / license` 命名
- `prefs` 主缓存
- “验证失败就整块功能不初始化”的行为

## v0 推荐数据流

### Step 1：JS 只做薄桥接

JS 侧只承担三件事：

1. 收集最小输入
   - `userID`
   - `profileHash`
   - `pluginNonce`
   - `schemaBucket`
   - `zoteroVersionBucket`
2. 调用 Wasm 微内核
3. 负责真正的 HTTP 发包

JS 不应承担：

- 旧协议的核心签名/派生细节
- 可读的授权状态比对逻辑
- 明显的 `isAuthorized()` 风格命名

### Step 2：Wasm lane 负责 legacy 协议语义

目标形态是让 Wasm 微内核只负责：

- 归一化 host binding 输入
- 生成 legacy request digest / serial
- 校验 legacy response value
- 产出紧凑 gate 结果

但当前 v0 quick-apply 有一个必须保留的实现边界：仓库现有的 checked-in `probe.wasm` 只有 `seed / mix / finalize` 这类 digest export，暂时没有独立的 Rust/AssemblyScript 源码链来重编完整 legacy 协议内核。因此本轮实现是“Wasm lane facade”：

- legacy request / response 的协议 glue 与 HMAC-MD5 兼容逻辑仍在 JS facade / worker wrapper 中
- compact digest、cache fingerprint 与跨 main-thread / worker 的一致性校验复用现有 Wasm digest export
- protected package 仍会把这层 JS facade 放进 shielded loader 内，但不能声称 legacy secret 或完整协议已经真正藏进 Wasm binary

如果后续目标升级为“减少客户端协议逻辑可见度”，下一轮应补真正的 `probe.wasm` 源码链，并把 HMAC / ticket verify / compact gate 迁入 Wasm export，而不是继续扩大 JS facade。

Wasm lane 输出固定应保持紧凑，例如：

- `requestPayloadDigest`
- `requestBodyFields`
- `compactGate`
- `cacheFingerprint`

Wasm lane 不应把以下高语义结果直接吐回 JS：

- `authorized`
- `licenseStatus`
- `proFeatures`
- 功能清单
- overlay 明文

### Step 3：HTTP 仍由 JS 统一发起

当前不建议把网络栈也塞进 Wasm。

原因很直接：

- Zotero 当前已有统一 HTTP 抽象
- 真正会暴露的是 endpoint 与请求时机，而不是“请求代码写在 JS 还是 Wasm”
- 把 HTTP 放进 Wasm 只会增加接线复杂度，不会带来同等收益

因此 v0 的正确边界是：

- JS 用现有 HTTP client 发请求
- Wasm 只负责请求摘要和响应判定

## 当前最小可执行结构

### 客户端新增层

当前 v0 只需要新增四层很窄的能力：

1. `route4 legacy backend client`
   - 负责 orchestration
2. `wasm entitlement legacy kernel`
   - 负责 request/response 判定
3. `sqlite nonce store`
   - 提供实例级 nonce
4. `sqlite ticket cache`
   - 缓存过期时间、摘要和最近一次 gate 结果

### 本地缓存建议字段

当前建议缓存的只是低频控制面结果，例如：

- `ticketFingerprint`
- `expiresAt`
- `lastValidatedAt`
- `hostBindingDigest`
- `gateVersion`
- `cacheSource`

当前不建议缓存：

- 共享 secret
- 最终授权根
- 长期有效、可离线无限复用的明文激活状态

## 当前命名和暴露面约束

如果当前直接照抄参考里的命名，静态分析还是会很快看懂。

因此 v0 必须固定以下约束：

- JS 层不出现：
  - `AUTH_SECRET`
  - `activationCode`
  - `license`
  - `authorized`
  - `pro`
- 运行时 summary 不直接写：
  - `licensePassed`
  - `subscriptionOk`
- 本地表名、字段名避免直接出现强业务语义

更准确地说，当前应优先使用：

- `controlState`
- `compactGate`
- `policyDigest`
- `gateEpoch`
- `runtimePolicy`

而不是：

- `licenseState`
- `activation`
- `subscription`
- `premiumFeatureList`

## 当前仍然会暴露什么

即使把客户端 legacy 协议逐步挪进 Wasm lane，当前仍会暴露：

- 插件会访问远端
- 访问大致发生在什么时候
- 访问哪个域名或端点
- 本地有一个 Wasm 微内核参与了 gate 判定
- gate 失败时某些二阶段能力不会开启

所以必须明确：

- v0 的收益是 **反静态分析**
- v0 的非收益是 **真正隐藏远端验证存在**

## 为什么当前 v0 仍然值得做

即便如此，v0 仍然有明确价值：

- 能把最容易被一轮 AI 复述的“本地验证规则”从 JS 明文移走
- 能避免 `prefs + readable key + activationCode` 这类首轮高命中暴露
- 能提前把：
  - Wasm 微内核边界
  - sqlite nonce
  - sqlite ticket cache
  - second-stage only
 这些结构搭起来

这意味着未来升级到 v1 时：

- 不需要重做整条 runtime 接线
- 只需要替换服务端协议和 Wasm 验签内核

## v1 更优蓝图

当前 v0 不是终点，v1 才是长期正确方向。

### v1 目标

未来更优方案固定应为：

- 服务端保留真正授权根
- 服务端签发短时 ticket
- 客户端 Wasm 只保留公钥
- Wasm 只做验签 + host binding + compact gate

### v1 推荐形态

推荐响应形态应类似：

```json
{
  "v": 1,
  "kid": "k1",
  "exp": 1770000000,
  "t": "<signed-ticket>"
}
```

而不是：

```json
{
  "authorized": true,
  "license": "active",
  "features": ["reader", "graph", "pro"]
}
```

### v1 的关键收益

v1 相对 v0 真正新增的收益是：

- 不再需要把共享 secret 放客户端
- 服务端可以独立撤销、更新和轮换签名密钥
- 客户端只做验签，不再持有最终授权根

## 当前推荐推进顺序

### Wave A：legacy-backend quick apply

目标：

- 不改后端
- 先证明可接线
- 先把 JS 明文验证逻辑压进 Wasm 微内核

通过条件：

- 不阻断启动
- 网络失败只降级
- 不把主授权状态落回 `prefs`
- 默认关闭

### Wave B：sqlite cache / nonce 固化

目标：

- 把本地实例锚点和 ticket cache 从显眼载体移走
- 形成稳定的 host binding 输入

通过条件：

- profile 内稳定
- 更新后保留
- 表损坏时只重建 / 降级，不阻断启动

### Wave C：signed-ticket blueprint migration

目标：

- 不改客户端宏观结构
- 只把后端返回与 Wasm 判定从 legacy 迁到 signed ticket

通过条件：

- 客户端不再持有共享 secret
- Wasm 只保留公钥与验签逻辑

## 当前禁止事项

当前无论是 v0 还是未来 v1，都不允许：

- 在 `onMainWindowLoad()` 顶部做总开关
- 未通过远端验证就让插件整体不可启动
- 把路由写成 remote-first bootstrap
- 把本地 sqlite/cache 说成真正安全边界
- 把 Wasm 描述成“藏了密钥所以安全”

## 建议的 controller 判断

当前 controller 层应固定这样判断：

- 若目标是“先快速应用，不改后端”，走 v0
- 若目标升级为“真正减少客户端授权根暴露”，必须开 v1
- v0 可以上线到手动 protection lane
- v0 不应升格为默认主线
- v1 才是未来可长期保留的 route4 方向

## 相关文档

- [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md)
- [PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md](./PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md)
- [PACKAGE_PROTECTION_HOST_SIGNAL_IMPLEMENTATION_PLAN.md](./PACKAGE_PROTECTION_HOST_SIGNAL_IMPLEMENTATION_PLAN.md)
- [PACKAGE_PROTECTION_WASM_STAGE2_DERIVATION_PLAN.md](./PACKAGE_PROTECTION_WASM_STAGE2_DERIVATION_PLAN.md)
- [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md)
- [REFERENCE_YANZHENG_VALIDATION_SECURITY_NOTES.md](./REFERENCE_YANZHENG_VALIDATION_SECURITY_NOTES.md)
