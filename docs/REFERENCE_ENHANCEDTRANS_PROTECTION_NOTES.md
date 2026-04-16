# EnhancedTrans 保护路径参考笔记

> 用途：记录本地参考项目 `enhancedtrans` 对“路线 4：远端下发字段 / 落到 `zotero.sqlite` / 认知层隐匿”的参考价值。
> 范围：只总结参考项目的技术路径与威胁模型边界，不把其实现升格为当前模板 truth 或既定方案。
> 更新时间：2026-04-16

## 结论先看

- `enhancedtrans` 的这条链更接近“远端响应缓存 + 本地二次解密使用”，不是强意义上的 secrets protection。
- 这条路径对“阻挡普通开发者一眼在源码里看到明文字段/策略文案”有一定作用。
- 这条路径对“阻挡有心分析者发现存在远端策略、发现 SQLite 表、恢复响应内容”作用有限。
- 如果当前模板未来考虑 `路线4`，它可以作为“轻服务能力 + 本地缓存”的参考，但不应被误判成高强度保护方案。

## 参考项目里实际发生了什么

- 启动时会先检查自建表是否存在，再决定是否进入一次远端 POST 验证。
  - 参考：[hooks.ts](/Users/orlandozh/Documents/Gitee/enhancedtrans/src/hooks.ts#L225)
- 远端返回的响应文本会被直接写入自建表。
  - 参考：[hooks.ts](/Users/orlandozh/Documents/Gitee/enhancedtrans/src/hooks.ts#L249)
  - 参考：[hooks.ts](/Users/orlandozh/Documents/Gitee/enhancedtrans/src/hooks.ts#L266)
- 后续功能会再次从表中读取 `html` 字段，再用本地可推导 key 解密。
  - 参考：[fulltrans.ts](/Users/orlandozh/Documents/Gitee/enhancedtrans/src/modules/fulltrans.ts#L1797)
  - 参考：[fulltrans.ts](/Users/orlandozh/Documents/Gitee/enhancedtrans/src/modules/fulltrans.ts#L1813)
- SQL 文本和部分字符串虽然经过 `decryptText(...)` 包装，但解密函数与固定 passphrase 就在本地代码里。
  - 参考：[fulltrans.ts](/Users/orlandozh/Documents/Gitee/enhancedtrans/src/modules/fulltrans.ts#L281)

## 这条路径的实际意义

### 有意义的地方

- 能把部分远端策略、长文本、字段定义从“静态包内直读”变成“运行后才出现”。
- 能把明文从常规 bundle 字符串区移走，降低一轮静态检索的命中率。
- 对普通开发者 + 一轮 AI 直读来说，会增加一道“还要顺着 DB/query/decrypt 路径走下去”的门槛。

### 意义有限的地方

- 远端访问本身很容易被发现：
  - 有明确的 `Zotero.HTTP.request(...)`
  - 有明确的 `Zotero.DB.queryAsync(...)`
  - 有建表、插入、查询三段式逻辑
- “SQL 被加密”不等于“行为被隐藏”。只要存在：
  - 固定 `decryptText(...)`
  - 固定 passphrase
  - 固定表结构读写路径
  分析者仍可快速还原 SQL 语义与数据流。
- 把数据写入 `zotero.sqlite` 只是换了宿主载体，不是换了信任边界。只要插件本地还能读，就意味着分析者也能顺着同一路径读。
- 如果本地 key 可由用户名、常量或固定规则推导，保护强度会进一步下降。

## 对当前模板路线 4 的启发

### 值得借鉴

- 可把远端策略包做成“小体量、低频、可缓存”的后置拉取，而不是把它绑进启动主链。
- 可把拉回的数据做本地缓存，减少远端调用频率与服务器成本。
- 可把服务器职责限定在：
  - feature policy
  - provider catalog
  - 短时 token
  - 许可状态
  这类小而稳定的控制面。

### 不建议直接照搬

- 不建议把“写进 `zotero.sqlite`”本身当成主要保护卖点。
- 不建议把固定 passphrase、本地可推导 key、明文解密函数与数据库读写路径同时保留后，还把它描述成强保护。
- 不建议把远端拉取绑定到插件首次可用路径，否则一旦远端抖动，就会直接把保护路线变成稳定性风险。

## 对当前模板的初步判断

- 如果未来只是想做“认知层延迟暴露”，把远端下发的小体量策略包缓存到本地是有意义的。
- 如果未来目标是“明显提高分析成本”，仅靠 `sqlite + 本地解密` 不够，仍需要配合：
  - 受保护导出分支的内层 bundle 语义减噪
  - 远端只下发低频控制面，而不是完整业务主体
  - 必要时把少量敏感校验内核收缩到 Wasm 或服务端
