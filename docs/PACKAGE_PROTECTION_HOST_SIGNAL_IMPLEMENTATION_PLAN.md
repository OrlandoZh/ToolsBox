# Package Protection Host Signal Implementation Plan

> 用途：把当前 `shielded host weak binding` 支线里已经冻结的“字段判断”收成一版可执行的最小实施蓝图。
> 范围：这是 package protection 手动实验支线的实施蓝图，不是 current truth；它不改默认 `release` / `agent:gate` / `agent:gate:release`，也不代表当前已经实现。
> 更新时间：2026-04-16

## 结论先看

当前这条线最需要改进的，不是继续讨论“还能读到哪些 Zotero 字段”，而是把现有判断落实成三段式实施顺序：

1. 先做 **host signal collector**
2. 再做 **plugin-owned sqlite nonce**
3. 最后只锁一个 **小体量 stage2 descriptor blob**

当前不建议：

- 先做完整 `sqlite-state-store`
- 先锁整个 inner bundle
- 先把 `DataDirectory.dir` 当主锚点
- 先把 `addonRef / instanceKey / prefsPrefix` 这类包内字段塞进派生材料

## 当前仓库的已知状态

### 1. 保护运行时和遥测入口已经存在

当前受保护导出 runtime 已经会把 `packageProtection` 状态挂到：

- `__CLEANROOM_TEMPLATE_RUNTIME__.packageProtection`

这意味着：

- 新增 `hostBinding` 相关实验字段时，有现成 runtime summary 可以复用
- 不需要另起一套平行 runtime report

### 2. bootstrap 能力注入已经够做宿主信号采集

当前 bootstrap 已经向 plugin scope 注入：

- `Zotero`
- `Services`
- `ChromeUtils`
- `crypto`
- `TextEncoder`
- `TextDecoder`

这足够支撑：

- 读取 `Profile.dir`
- 做 `realpath`
- 做 hash / digest
- 读取版本与 schema bucket

因此第一阶段不需要额外扩大 bootstrap 权限面。

### 3. 当前模板还没有 sqlite 适配层

当前平台层已经落地的只有：

- `src/platform/zotero-file-storage.js`
- `src/platform/zotero-json-state-store.js`

它们都建立在：

- `Zotero.DataDirectory.dir`
- 文本文件 / JSON 状态文件

当前仓库里还没有：

- `Zotero.DB` 级 sqlite adapter
- plugin-owned sqlite nonce store
- 通用 sqlite state store

所以第二阶段的正确做法不是“先补一整套 sqlite 框架”，而是只补一个最小 nonce store。

### 4. 当前仓库已经存在“完整描述层 / 受保护描述层”分裂点

当前应用层已经有：

- `dev/agent-runtime/capability-manifest.js`
- `dev/agent-runtime/capability-manifest-protected.js`

这说明仓库已经接受了一个关键前提：

- 受保护导出可以保留一个较瘦的对外 capability surface
- 更丰富的高层语义可以与默认 protected surface 分开

因此第三阶段最合理的 stage2 blob 候选，不是去碰主启动链，而是去补一个“更丰富的 capability descriptor overlay”。

## 策略改进点

### A. 从“字段清单”切到“信号分层”

当前后续实现应把信号固定分成四层：

1. **主锚点**
   - `profileHash = hash(realpath(Zotero.Profile.dir))`
2. **实例锚点**
   - `pluginNonce`
3. **环境盐**
   - `schemaBucket`
   - `zoteroVersionBucket`
   - 可选 `profileBasenameBucket`
   - 可选 `dataDirHash`
4. **诊断字段**
   - `addonRef`
   - `addonVersion`
   - `instanceKey`
   - `prefsPrefix`
   - `rootURI`

前 1-3 层允许进入弱绑定派生；第 4 层只允许用于诊断与日志，不进入 KDF / AAD。

### B. 把 `DataDirectory.dir` 退回缓存层，不再放大为绑定主料

当前模板文件存储建立在 `Zotero.DataDirectory.dir` 上，这对缓存是合理的，但对保护主锚点不是最优选择。

后续应固定：

- `DataDirectory.dir` 保留给文件缓存与 fallback 特征
- `Profile.dir` 才是主锚点
- `pluginNonce` 才是实例区分主料

### C. 不先造“通用 sqlite 层”，先造“窄而稳的 nonce store”

当前第二阶段真正需要的是：

- 一个能在 plugin profile 生命周期内稳定存在的 nonce
- 一个明确的 reset / recreate 语义

当前不需要的是：

- 全功能 sqlite KV store
- 多表 schema 管理框架
- 通用 ORM 式抽象

### D. 先保护描述层，再考虑保护更多逻辑

从当前威胁模型看，最需要继续压掉的是：

- 能帮助 AI 在单轮里归纳高层架构的 descriptor / manifest / policy 字段

因此 stage2 blob 的第一候选应是：

- capability manifest richer fields
- optional bundle policy summary
- 小体量 runtime capability mapping

不应先保护：

- `bootstrapPlugin`
- host authoritative contract
- Reader / Preference / ItemPane 宿主枚举和事件名

## 最小实施蓝图

### Phase 1：Host Signal Collector

目标：

- 只采集，不生效
- 不改变 `package:shielded`
- 不改变任何 capability enable 行为

建议新增：

- `src/platform/zotero-host-signals.js`

建议职责：

- 读取并归一：
  - `Profile.dir`
  - `schema version`
  - `Zotero.version`
  - 可选 `DataDirectory.dir`
  - 可选 profile basename
- 对路径类值做：
  - `realpath`
  - hash
  - 不保留明文绝对路径
- 输出最小摘要：
  - `signalVersion`
  - `profileHash`
  - `schemaBucket`
  - `zoteroVersionBucket`
  - `profileBasenameBucket`
  - `dataDirHash`
  - `available`
  - `collectionError`

建议接线位置：

- runtime bridge:
  - `__CLEANROOM_TEMPLATE_RUNTIME__.hostBinding`
- diagnostics sink:
  - `src/app/plugin.js` 的 `getProtectionSummary()` 汇总链
  - `dev/agent-runtime/plugin-agent.js` 的 `runAgentSelfCheck()` 输出链

当前阶段只允许新增：

- 结构化 diagnostics
- 实验性 runtime summary

当前阶段禁止：

- 根据 host signal 改 capability manifest
- 根据 host signal 改插件启动结果
- 根据 host signal 改 package protection verdict

### Phase 2：Plugin-Owned SQLite Nonce

目标：

- 只验证 profile 级实例锚点是否稳定
- 不引入真正的 stage2 blob
- 不改变 `bootstrapPlugin` 主链

建议新增：

- `src/platform/zotero-plugin-nonce-store.js`

建议职责：

- 用 `Zotero.DB` 创建 plugin-owned 最小表
- 读取或生成 nonce
- 提供：
  - `init()`
  - `getOrCreateNonce()`
  - `resetNonce()`
  - `getSummary()`

当前建议只做一个很窄的用途：

- 存一条 profile 级 nonce

当前不建议同时做：

- 通用 sqlite state store
- 策略缓存
- token 缓存
- 多用途表设计

nonce 生命周期建议固定为：

- 同一 profile 下：
  - 重启保持稳定
  - 升级保持稳定
  - 重新打包保持稳定
- 只有以下情况才重建：
  - 表不存在
  - profile 被重建
  - 显式 reset

diagnostics 至少应回报：

- `dbAvailable`
- `noncePresent`
- `nonceSource`
  - `existing`
  - `created`
  - `reset`
  - `unavailable`
- `storeError`

### Phase 3：Descriptor-Only Stage2 Blob

目标：

- 只锁一个小体量 descriptor / policy blob
- mismatch 时只降级，不阻断插件启动
- 让 AI 单轮更难恢复完整高层架构材料

当前第一候选对象应固定为：

- `capability-manifest.js` 中 richer fields 的 overlay

更具体地说，第一版 stage2 blob 可以只承接这些字段：

- `description`
- `entrypoints`
- `ownedBy`
- `successSignals`

而 protected baseline 继续保留：

- `id`
- `label`
- `category`
- `agentScenario`
- `zoteroScenarios`

这样做的原因是：

- 当前仓库已经有 `capability-manifest-protected.js`，说明这个 split 已经被接受
- 这正好命中当前剩余问题：
  - AI 能快速归纳高层架构
  - 但又不应该因为保护而破坏主启动链

建议新增：

- `dev/agent-runtime/capability-manifest-overlay.js`
  或
- build 时生成一个 stage2 descriptor blob

建议 build 接线：

- 不替换默认 `package:shielded`
- 只新增一个显式手动实验变体，例如：
  - `package:shielded:hostbind:manifest`
  - 或 `package:shielded:descriptor-bind`

建议 runtime 行为：

1. protected build 默认使用 `capability-manifest-protected.js`
2. 若 host binding 成功：
   - 解开 stage2 overlay
   - merge richer fields
3. 若 host binding 失败：
   - 保持 protected manifest
   - 记录 `limited-mode`
   - 不阻断 plugin startup

### Phase 4：验证与止损

这条线的验证顺序建议固定为：

1. Phase 1
   - 只验 diagnostics 是否稳定
   - 不跑重型 package A/B
2. Phase 2
   - 先验 nonce 生命周期
   - 验证同 profile / 新 profile / profile 迁移
3. Phase 3
   - 只对新的手动变体跑 XPI / Zotero A/B
   - 不影响默认 `package:shielded`

阶段性止损线固定为：

- 任何阶段只要影响 `readinessMode=native`，先回退
- 任何阶段只要引入新的阻断型 runtime error，先回退
- 任何阶段只要明显拖慢首次加载体感，先回退
- 任何阶段只要要求人工频繁 reset / rebind 才能继续使用，先回退

## 模块落点建议

### 新增模块

- `src/platform/zotero-host-signals.js`
- `src/platform/zotero-plugin-nonce-store.js`

### 优先复用模块

- `src/app/plugin.js`
  - 继续作为 runtime summary 汇总入口
- `dev/agent-runtime/plugin-agent.js`
  - 继续作为 self-check / diagnostics 输出入口
- `dev/agent-runtime/capability-manifest.js`
- `dev/agent-runtime/capability-manifest-protected.js`
  - 继续作为 descriptor split 的基础
- `scripts/package-protection-lib.mjs`
- `scripts/package.mjs`
  - 只在显式实验变体开启时扩展

### 当前不建议新增的模块

- 通用 `sqlite-state-store`
- 通用 `host-binding-policy-engine`
- 平行 `packageProtectionV2` 报告体系

## 不该再做的事

- 不再围绕 `addonRef / addonVersion / instanceKey / prefsPrefix` 设计保护派生
- 不再把 `DataDirectory.dir` 当主锚点继续优化
- 不把 `sqlite + 本地解密` 描述成 secrets protection
- 不把宿主弱绑定绑到 `bootstrapPlugin` 可用性
- 不先做“全量 host binding”，再回头补 diagnostics

## 当前推荐的下一步

如果继续推进，建议优先级固定为：

1. 先开 `Phase 1`，只做 host signal collector
2. `Phase 1` 稳定后，再开 `Phase 2` 的最小 nonce store
3. 两者都稳定后，再开显式手动实验变体，验证 descriptor-only stage2 blob

最关键的策略判断是：

- **下一步不是找更多 Zotero 字段**
- **下一步是把已经选中的字段变成稳定、可诊断、可回退的最小实现链**

## 相关文档

- [PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md](./PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md)
- [REFERENCE_ZOTERO_HOST_SIGNAL_BINDING_NOTES.md](./REFERENCE_ZOTERO_HOST_SIGNAL_BINDING_NOTES.md)
- [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md)
- [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md)
