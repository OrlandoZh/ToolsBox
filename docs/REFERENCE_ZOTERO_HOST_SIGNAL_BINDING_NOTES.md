# Zotero 宿主信号与弱绑定参考笔记

> 用途：沉淀“Zotero 宿主源码里哪些信号最适合拿来做插件侧弱绑定/二阶段解锁”的参考结论。
> 范围：这是参考专题，不是 current truth；它不改变默认 `release` / `agent:gate` 主线。
> 最后更新：2026-04-16

## 结论先看

如果目标是：

- 阻碍普通开发者
- 阻碍自动化工具
- 阻碍一轮 AI 快速静态直读

那么 Zotero 宿主里最值得利用的不是“所有能读到的字段”，而是少数**稳定、非包内、普通用户不常变更**的宿主信号。

当前最值得采用的排序是：

1. `hash(realpath(Zotero.Profile.dir))`
2. `plugin-owned sqlite nonce`
3. `DB schema version bucket`
4. `Zotero.version bucket`
5. `profile basename` / profile folder id

`Zotero.DataDirectory.dir` 有价值，但更适合作为**辅助盐或 fallback**，不适合作为主绑定锚点。

## 插件加载后自动可得的信息

### 标准插件入口天然会给到的参数

参考项目里，标准 bootstrap `startup()` 入口会收到：

- `id`
- `version`
- `resourceURI`
- `rootURI`

可见：

- [reference/Templetereference/zotero-plugin-template-main/addon/bootstrap.js](../reference/Templetereference/zotero-plugin-template-main/addon/bootstrap.js#L12)
- [reference/plugin/actions-and-tags-for-zotero/content/action-types.d.ts](../reference/plugin/actions-and-tags-for-zotero/content/action-types.d.ts#L73206)

这类信息对插件是“自动可得”，但它们的保护价值不高，因为大多也能从包内或构建产物推断出来。

### 当前模板 bootstrap 额外注入的能力

当前模板 bootstrap 会向 plugin scope 注入：

- `rootURI`
- `Zotero`
- `Services`
- `ChromeUtils`
- `console`
- 一组可选 Web API，如 `crypto`、`TextEncoder`、`TextDecoder`、`URL`

可见：

- [addon-static/bootstrap.js](../addon-static/bootstrap.js#L401)
- [addon-static/bootstrap.js](../addon-static/bootstrap.js#L265)

此外，当前模板还会把运行时配置桥接到全局：

- `__CLEANROOM_TEMPLATE_CONFIG__`

配置内容由：

- [src/app/runtime-config.js](../src/app/runtime-config.js#L22)

读取。这里包含：

- `addonName`
- `addonId`
- `addonRef`
- `instanceKey`
- `prefsPrefix`
- `defaultPrefs`

这类信息同样不适合拿来做保护锚点，因为它们本质上是包内固定元数据。

## 哪些宿主信号最有价值

### A 级：最适合用于弱绑定

#### 1. `Zotero.Profile.dir`

当前活跃 profile 的权威入口是：

- [reference/zotero-main/chrome/content/zotero/xpcom/profile.js](../reference/zotero-main/chrome/content/zotero/xpcom/profile.js#L29)

它的优点是：

- 普通用户日常几乎不会改
- 不在 XPI 包里
- 静态拆包拿不到
- 插件运行时可稳定读取

推荐用法：

- 只取 `realpath` 后做 hash
- 不直接保存明文绝对路径
- 不绑定到主启动链，只用于二阶段解锁

#### 2. plugin-owned sqlite nonce

如果允许插件自行在本地数据库里维护一个最小状态，那么最有价值的本地锚点是：

- 首次安装生成的 plugin-owned nonce

它的优点是：

- 不在包里
- 不在 prefs
- 不在显眼明文文件里
- 比单纯宿主路径更能区分“当前实例”

注意：

- 它应放在 plugin-owned 表或 plugin-owned 数据结构里
- 不应写回显眼的 prefs key

#### 3. DB schema version

Zotero 自己用 `version` 表维护 DB schema 版本：

- [reference/zotero-main/resource/schema/userdata.sql](../reference/zotero-main/resource/schema/userdata.sql#L132)

读取入口是：

- [reference/zotero-main/chrome/content/zotero/xpcom/schema.js](../reference/zotero-main/chrome/content/zotero/xpcom/schema.js#L63)

这类值适合：

- 做 bucket
- 做环境兼容分层
- 参与宿主弱绑定派生

不适合：

- 当作精确 identity

### B 级：适合作为辅助盐

#### 4. `Zotero.version`

Zotero 自己稳定使用：

- [reference/zotero-main/chrome/content/zotero/about.xhtml](../reference/zotero-main/chrome/content/zotero/about.xhtml#L32)

优点：

- 稳定
- 低成本
- 兼容性分层价值高

限制：

- 太容易被猜到
- 只能做 bucket，不应当作主密钥材料

#### 5. profile basename / profile folder id

这类值有一定价值，因为：

- 普通用户通常不改
- 运行时可读
- 静态解包拿不到

但它的价值被高估的风险也很明显：

- 会受 profile 新建/迁移影响
- 测试和开发环境会频繁变化
- Zotero 自己并没有把 profile 文件夹名里的随机前缀当成强语义 identity

例如在 dataDir 命名逻辑里，Zotero 实际取的是点后面的 profile 名部分：

- [reference/zotero-main/chrome/content/zotero/xpcom/dataDirectory.js](../reference/zotero-main/chrome/content/zotero/xpcom/dataDirectory.js#L193)

因此它适合做：

- 辅助盐
- fallback 维度

不适合做：

- 唯一主锚点

## 为什么 `Zotero.DataDirectory.dir` 不适合当主锚点

虽然插件和宿主都能稳定读取：

- [src/platform/zotero-file-storage.js](../src/platform/zotero-file-storage.js#L121)

但它的问题是：

- UI 里就有完整的变更入口
  - [reference/zotero-main/chrome/content/zotero/preferences/preferences_advanced.xhtml](../reference/zotero-main/chrome/content/zotero/preferences/preferences_advanced.xhtml#L107)
- 也支持命令行强制指定
  - [reference/zotero-main/chrome/content/zotero/xpcom/dataDirectory.js](../reference/zotero-main/chrome/content/zotero/xpcom/dataDirectory.js#L59)

因此它更适合：

- 辅助盐
- fallback 环境特征
- 与 profile/hash/nonce 组合使用

不适合：

- 单独作为主绑定 identity

## 当前最推荐的宿主弱绑定组合

如果未来要把宿主信息用于保护路线，当前最推荐的组合是：

```text
hostAnchor =
  hash(
    realpath(Zotero.Profile.dir)
    + "|" + schemaVersionBucket
    + "|" + zoteroVersionBucket
    + "|" + pluginNonce
  )
```

补充建议：

- `Zotero.DataDirectory.dir` 只作为辅助盐或 fallback
- `addonId / addonVersion / addonRef` 不应进入主绑定材料
- `userID / libraryID / sync state` 不适合作为本地保护主锚点

## 不推荐的信号

- `addonId`
- `addonVersion`
- `addonRef`
- 绝对明文路径
- `userID`
- `libraryID`
- sync 状态
- UI 当前选区、当前 pane、当前 tab 等短时运行态

原因是：

- 它们要么已经在包内可见
- 要么太依赖用户状态
- 要么过于脆弱，容易造成误伤

## 对当前保护路线的直接影响

这份参考更支持以下路线：

1. 主插件 bootstrap 继续保持轻量，不做强阻断。
2. 保护逻辑优先放在二阶段 capability enable / payload unwrap。
3. 主宿主锚点优先选 `profile`，不是 `dataDir`。
4. 若允许本地状态，再加入 `sqlite nonce`，收益明显高于继续挤压 `profile id` 本身。

如果问题已经从“参考结论”进入“模板侧 package protection 设计”，下一跳应是：

- [PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md](./PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md)

## 相关文档

- [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md)
- [PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md)
- [PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md](./PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md)
- [ROUTE4_LOCAL_STORAGE_DECISION.md](./ROUTE4_LOCAL_STORAGE_DECISION.md)
- [ZOTERO_HOST_INTERFACE_CONTRACTS.md](./ZOTERO_HOST_INTERFACE_CONTRACTS.md)
