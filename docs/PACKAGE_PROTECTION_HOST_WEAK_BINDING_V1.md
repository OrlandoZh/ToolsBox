# 受保护打包宿主弱绑定 V1

> 用途：把“若后续需要继续提高 `shielded` 对离机静态分析/跨设备复制的阻力，应如何利用 Zotero 宿主信号做二阶段弱绑定”的模板侧判断收成一份可复用设计。
> 范围：这是 package protection 支线设计，不是 current truth；它不打开新 wave，不改变默认 `release` / `agent:gate` 主线，也不代表当前已经实现。
> 更新时间：2026-04-16

## 结论先看

如果未来 `package:shielded` 还要继续往前推进，而目标仍然只是：

- 阻碍普通开发者
- 阻碍自动化工具
- 阻碍一轮 AI 快速静态直读

那么当前最值得保留的本地 hardening 候选，不是继续挤压 `loader`，而是：

- 保持当前 `loader-lite`
- 不改 `bootstrapPlugin` 主启动链
- 只对二阶段 payload / capability enable 做**宿主弱绑定**

当前推荐的宿主信号优先级固定为：

1. `hash(realpath(Zotero.Profile.dir))`
2. `plugin-owned sqlite nonce`
3. `DB schema version bucket`
4. `Zotero.version bucket`
5. `profile basename` / profile folder id

`Zotero.DataDirectory.dir` 只保留为辅助盐或 fallback，不作为主锚点。

## 这条路线要解决什么问题

当前 `package:shielded` 已经达到既定威胁模型，但还有一个明确剩余点：

- 一轮 AI 往往已经不能直接恢复可维护源码
- 但仍能从解密后的 inner bundle 里较快归纳高层架构和能力面

宿主弱绑定的价值不在于“真正保密”，而在于把部分恢复条件从“只看包文件”提升到：

- 需要运行时宿主上下文
- 需要本地实例状态
- 需要跨过一次真实 Zotero profile 环境

这对“离机静态读包”“把 XPI 拷到另一台机器上继续自动化分析”“只靠首轮 AI 总结框架面”都有额外摩擦，但对专业运行时逆向不是决定性屏障。

## 哪些信号值得用

### 1. `Zotero.Profile.dir`：主锚点

权威入口见：

- [reference/zotero-main/chrome/content/zotero/xpcom/profile.js](../reference/zotero-main/chrome/content/zotero/xpcom/profile.js)

推荐原因：

- 普通用户通常不会频繁改动 profile 路径
- 插件运行时可稳定读取
- 不在 XPI 包内
- 静态拆包拿不到

推荐做法：

- 先做 `realpath`
- 再做 hash
- 不保存明文绝对路径

### 2. plugin-owned sqlite nonce：本地实例锚点

推荐原因：

- 不在包里
- 不在 `prefs`
- 不在显眼的明文文件里
- 比单纯宿主路径更能区分“当前这次安装/当前这份本地实例”

当前 retained decision 固定为：

- 若未来这条线落地，本地 nonce 优先放 plugin-owned sqlite 载体
- 它的价值是“实例区分 + 派生材料”，不是“秘密根”

### 3. `DB schema version bucket`：兼容性盐

权威来源见：

- [reference/zotero-main/resource/schema/userdata.sql](../reference/zotero-main/resource/schema/userdata.sql)
- [reference/zotero-main/chrome/content/zotero/xpcom/schema.js](../reference/zotero-main/chrome/content/zotero/xpcom/schema.js)

推荐原因：

- 宿主长期稳定
- 易于按 bucket 归一
- 可作为兼容环境的低成本盐值

限制：

- 它不是 identity
- 只能做派生材料的一部分

### 4. `Zotero.version bucket`：低成本环境盐

权威来源见：

- [reference/zotero-main/chrome/content/zotero/about.xhtml](../reference/zotero-main/chrome/content/zotero/about.xhtml)

推荐原因：

- 稳定
- 运行时天然可得
- 适合参与版本桶分层

限制：

- 可预测性强
- 不应单独承担绑定意义

### 5. `profile basename` / folder id：辅助盐

它可以作为额外扰动，但不应被高估：

- 对普通用户来说通常稳定
- 对测试、迁移和多 profile 环境并不稳定
- 更适合作为补充盐，而不是主判定

## 哪些信号不适合当主锚点

### `Zotero.DataDirectory.dir`

它不适合当主锚点，原因已经比较明确：

- UI 里就能改
- 命令行也能指定
- 比 `Profile.dir` 更接近“用户可调路径”

因此它只适合：

- 辅助盐
- fallback 特征

不适合：

- 主 identity
- 主派生材料

### 包内固定元数据

以下信息都不值得用作绑定材料：

- `addonId`
- `addonRef`
- `addonVersion`
- `instanceKey`
- `prefsPrefix`

原因是：

- 它们都在包内或构建产物里稳定可见
- 只能帮助分析者，不能真正增加恢复门槛

### 用户态/短时运行态

以下信息也不值得做主绑定：

- `userID`
- `libraryID`
- sync state
- 当前选区
- 当前 tab / pane / window

原因是：

- 对用户状态依赖过强
- 误伤率高
- 不能稳定复现

## 在加密流程里怎么用

### 当前推荐位置：二阶段 unlock，不进主启动链

这条路线的核心边界固定为：

1. 第一阶段仍沿用当前 `package:shielded`
   - `loader-lite`
   - 本地 decrypt
   - 不重开 hostile runtime
2. `bootstrapPlugin` 仍然先可用
3. 宿主弱绑定只作用在二阶段 payload / capability enable
4. mismatch 时降级，不阻断插件启动

也就是说，正确用法不是：

- “没拿到正确宿主信号就让整个插件起不来”

而是：

- “让一部分更敏感、对高层语义暴露贡献更大的内容，只在正确宿主上下文下再解开”

### 当前建议的派生流程

可行的 V1 设计可以固定成下面的形状：

1. 构建期生成一个每包随机的 `bundleSeed`
2. 运行时收集并归一：
   - `profileHash = hash(realpath(Zotero.Profile.dir))`
   - `pluginNonce`
   - `schemaBucket`
   - `zoteroVersionBucket`
   - 可选 `profileBasename`
3. 拼成稳定的 `hostBindingInput`
4. 用 `bundleSeed + hostBindingInput` 派生 `stage2Key` 与 `stage2AAD`
5. 只解锁二阶段 blob，不重做主 loader

更准确地说，宿主信号适合承担的是：

- KDF 输入
- AAD 输入
- capability unlock 条件

而不是：

- 主 bundle 明文直接替换
- 首次 `bootstrapPlugin` 成功与否
- 真正的 secrets root

## 二阶段最适合保护什么

这条路线最适合承接的是“小而敏感，但不应绑死主启动链”的内容。

### 适合的对象

- 高层语义很重的 capability descriptor
- optional bundle policy / feature policy
- agent/runtime 诊断字段映射
- 会帮助 AI 快速归纳框架分层的字符串表
- 小体量 entitlement/config blob

### 不适合的对象

- `bootstrapPlugin`
- Zotero 宿主 authoritative contract 名称
- Reader 官方事件类型
- `PreferencePanes` / `ItemPane` / `MenuManager` 这类宿主枚举
- 必须在首屏初始化阶段就存在的主逻辑

原因很直接：

- 这些宿主 contract 要保持可维护、可验证、可诊断
- 绑进弱绑定层，只会提升误伤和兼容性成本

## 预期效果

如果按上面的边界落地，理论收益主要是三类：

### 1. 离机静态分析成本上升

只拿到 XPI 的人：

- 仍能看到 loader
- 但无法直接在脱离目标宿主环境时解开二阶段 payload

### 2. 跨设备/跨 profile 复制可复用性下降

把同一份受保护包拷到另一台机器、另一个 profile 或临时环境里时：

- 主插件仍可启动
- 但二阶段 blob 可被设计成无法直接复用

### 3. AI 高层架构归纳速度继续下降

即使 AI 能概括 loader：

- 它也未必能在单轮里拿到完整 capability / manifest / policy 级语义
- 这比单纯再压缩 loader 更符合当前剩余问题

## 代价和副作用

这条路线有收益，也有很明确的成本：

### 开发和测试成本

- 需要稳定的宿主信号归一规则
- 需要新增 rebind / reset 诊断路径
- 需要区分“同 profile 重启”“新 profile”“迁移 profile”“stable/beta”几类场景

### 用户支持成本

- 用户换 profile、迁移目录、重建数据库时，可能触发二阶段 mismatch
- 如果没有良好的降级和重绑路径，会制造支持负担

### 维护成本

- 需要长期保证 signal normalization 不漂移
- 需要把 sqlite nonce 生命周期和清理策略写清楚

因此当前 retained rule 是：

- 宿主弱绑定只适合做有限、可回退的二阶段 hardening
- 不适合承担“整个插件能不能运行”的根判据

## 与路线 4 / Wasm 的关系

### 它不等于路线 4

宿主弱绑定是：

- 本地 hardening
- 不依赖服务器
- 提高离机直读与跨环境复制的摩擦

路线 4 则更适合：

- entitlement
- 策略下发
- 短时 ticket / token
- feature policy

### 它也不等于 Wasm

Wasm 更适合：

- 少量算法核心
- 校验/变换小内核
- 明确输入输出边界的逻辑

宿主弱绑定更适合：

- 让二阶段语义材料不再只靠包文件就能恢复

## V1 最小实验建议

这条路线如果要开实验，当前建议按三个最小阶段推进：

### Experiment A：只采集，不生效

- 先把 `profileHash`、bucket、nonce 采集链跑通
- 只进实验报告或 runtime diagnostics
- 不改变 `package:shielded` 行为

### Experiment B：先加本地 nonce

- 加 plugin-owned sqlite nonce
- 只验证稳定性、重装行为和迁移行为
- 先不承接真正的 stage2 blob

### Experiment C：只锁一个小体量二阶段 blob

- 选一个不会阻断主启动的 descriptor / policy blob
- mismatch 时进入 limited mode
- 验证 native readiness、错误率和首次加载体感

当前不建议一上来就：

- 锁整个 inner bundle
- 锁主菜单/主启动
- 锁宿主 contract 层

## 当前 retained decision

当前 package protection 支线对宿主弱绑定的最终保留判断固定为：

1. 如果未来继续加固，宿主弱绑定值得保留为候选路线。
2. 主锚点优先 `Profile.dir`，不是 `DataDirectory.dir`。
3. 真正提高实例区分价值的是 `plugin-owned sqlite nonce`，不是继续挤压路径字符串本身。
4. 它只应该进入二阶段 unlock，不应该绑死 `bootstrapPlugin`。
5. 它的价值是“提高离机直读和跨环境复制的成本”，不是“真正保密”。

## 相关文档

- [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md)
- [PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md)
- [PACKAGE_PROTECTION_HOST_SIGNAL_IMPLEMENTATION_PLAN.md](./PACKAGE_PROTECTION_HOST_SIGNAL_IMPLEMENTATION_PLAN.md)
- [REFERENCE_ZOTERO_HOST_SIGNAL_BINDING_NOTES.md](./REFERENCE_ZOTERO_HOST_SIGNAL_BINDING_NOTES.md)
- [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md)
