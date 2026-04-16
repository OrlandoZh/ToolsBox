# Package Protection Experience

> 历史经验页。这里只沉淀“手动受保护导出分支”在当前模板里已经验证过的经验，不定义 current truth。
> 更新时间：2026-04-16

## 适用范围

本页只覆盖两条手动触发的受保护导出分支：

- `npm run package:encrypted`
- `npm run package:shielded`

它们都属于本地手动导出能力，不参与默认 `release` 主线，也不改变当前 `release-only blocker` 治理语义。

## 当前已验证结论

### 1. `encrypted` 是当前最稳的低开销受保护导出分支

- `encrypted` 的执行模型是：
  `base64 decode -> AES-GCM decrypt -> TextDecoder -> new Function(...) -> bootstrapPlugin`
- 真机对比里，`encrypted` 的首次可用时间与 plain 包几乎等价，没有表现出明显体感卡顿。
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

### 6. 现在的主要性能热点已经转移到 payload decode，而不是 decrypt / eval

当前模板已经把 `packageProtection` 时序接入：

- bootstrap `loadSubScript` 阶段
- protected loader 的 `decode`
- `decrypt`
- `eval`
- `prepare total`
- `bootstrap resolve`

一次真实 `shielded` 回读样本为：

- `loadSubScriptDurationMs: 407`
- `decodeDurationMs: 1676`
- `decryptDurationMs: 26`
- `evalDurationMs: 41`
- `prepareDurationMs: 1744`

这说明当前主要性能热点已经变成：

- `base64 decode`

而不是：

- `AES decrypt`
- `new Function` 本身

后续如果继续做性能优化，优先应该盯 decode 链，而不是继续去堆更重混淆，或误判成“加密算法太慢”。

## Retained Recommendations

### 当前分支选择建议

- 日常手动受保护导出，优先 `package:encrypted`
- 需要进一步提高自动化工具 / AI 直读门槛时，再使用 `package:shielded`

### 当前 `shielded` 的实现建议

- 保持 `loader-lite`，不要再回到 60MB 级 loader
- 不把 loader 当成主要反逆向战场，主要扰动应放在内层 bundle
- 继续避免 hostile runtime 选项，优先兼容和可加载性

### 当前验证建议

- 先看体感是否有明显首次加载卡顿
- 再看真机安装 smoke 是否仍保持 `readinessMode=native`
- 若需要定位慢点，优先读取 `packageProtection` 时序，而不是只看插件内核 `startupDurationMs`

## 相关实现入口

- [scripts/package-obfuscation-lib.mjs](./../scripts/package-obfuscation-lib.mjs)
- [scripts/package-protection-lib.mjs](./../scripts/package-protection-lib.mjs)
- [scripts/package.mjs](./../scripts/package.mjs)
- [scripts/release-install-smoke.mjs](./../scripts/release-install-smoke.mjs)
- [src/app/plugin-api.js](./../src/app/plugin-api.js)
- [src/app/plugin-agent.js](./../src/app/plugin-agent.js)
