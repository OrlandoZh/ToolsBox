# Wasm 开发本地索引

> 用途：把 Zotero 插件中的 Wasm 开发、加载、评估与保护边界收成一个本地索引，作为后续 PoC、路线讨论和实验设计的共同基线。
> 边界：这不是 current truth，不修改默认 `release` / `agent:gate` 主线，也不替代 [CURRENT_BACKLOG.md](./CURRENT_BACKLOG.md)。
> 最后更新：2026-04-19

## 先看结论

- 外部事实：截至 `2026-04-18`，Zotero 官方当前正式稳定发行线已经是 `Zotero 9`。
- 当前仓库事实：本仓库仍是 `bootstrap.js + runtime chrome registration + manifest_version: 2` 的 Zotero 插件形态，不是纯 WebExtension 页面模型。
- 当前路线定位：Wasm 仍是受保护打包的后续增强层，优先定位为“小内核 PoC”，不替代当前 `shielded` 主线。
- 当前最稳起点：先做 `plugin-private wasm`，通过 `rootURI + relative path` 读取 `.wasm`，再做一个小型 `micro-kernel` 实验。
- 当前第二阶段候选：只有当 Wasm 计算量明显影响 UI，或需要长期驻留的大内核时，再进入 `ChromeWorker/Worker + Wasm`。

## 必读顺序

1. [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md)
   先确认 Wasm 在整体保护路线里的定位仍是 `Stage 5：Wasm 小内核`。
2. [PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md)
   看当前受保护打包支线已经验证过什么、哪些结论已冻结。
3. [WASM_KERNEL_PROMOTION_PLAN.md](./WASM_KERNEL_PROMOTION_PLAN.md)
   看 `wasm-kernel` 什么时候才允许进入主线仓库的 optional bundle 基线。
4. [addon-static/bootstrap.js](../addon-static/bootstrap.js)
   看当前仓库真实宿主启动链：`rootURI`、`registerChrome()`、`loadSubScript()`、`bootstrapPlugin()`。
5. [scripts/build.mjs](../scripts/build.mjs)
   看当前 manifest/build 形态，尤其是 `manifest_version` 和 `applications.zotero` 兼容声明。
6. [config/addon.config.json](../config/addon.config.json)
   看当前仓库仍声明到哪个 Zotero 版本。

## 当前冻结判断

### 1. 官方当前稳定版是 Zotero 9

这条是外部事实，不等于本仓库已经切到 Zotero 9 兼容线。

已确认来源：

- Zotero 官方博客在 `2026-04-10` 发布 [Zotero 9](https://www.zotero.org/blog/zotero-9/) 公告，并明确写了 “Download Zotero 9 now.”
- Zotero 官方 [Beta Builds](https://www.zotero.org/support/beta_builds) 页面当前写明：“Download the release version of Zotero 9”，同时 Beta 已进入 Zotero 10 开发线。

当前仓库仍需区分：

- 外部稳定发行线：`Zotero 9`
- 当前仓库兼容声明：`strictMaxVersion: "8.*"`，见 [config/addon.config.json](../config/addon.config.json)

后续如果要正式把工程兼容线提升到 Zotero 9，应作为单独任务处理，不把它和 Wasm 实验混成一个改动。

### 2. 当前仓库是 bootstrap/chrome package 插件，不是纯 WebExtension 页面

当前宿主启动链：

- [addon-static/bootstrap.js](../addon-static/bootstrap.js) 在 `startup({ rootURI })` 中运行时注册 chrome package
- 通过 `Services.scriptloader.loadSubScript(rootURI + "content/scripts/<addonRef>.js", pluginScope)` 启动主包
- 插件最终通过 `bootstrapPlugin()` 完成初始化

相关实现入口：

- [addon-static/bootstrap.js](../addon-static/bootstrap.js)
- [scripts/build.mjs](../scripts/build.mjs)

这意味着：

- 不应把 WebExtension 文档中的结论直接当成当前仓库的唯一运行约束
- Wasm 接入首先要服从当前 `bootstrap.js` / `rootURI` / `chrome://` 的宿主事实

### 3. Wasm 在当前路线中只适合作为“小内核”

当前本地路线已经冻结为：

- `plain / encrypted / shielded` 是当前受保护打包实验主链
- Wasm 只作为后续增强层，不替代当前主线

相关文档：

- [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md)
- [PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md)

当前最合适的 Wasm 承载内容：

- KDF / token derivation
- entitlement / unlock 判定
- 小型校验/变换内核
- 输入输出边界清晰的少量算法逻辑

当前不应优先尝试的内容：

- 整个 `bootstrapPlugin` 主链 Wasm 化
- 大量 Zotero 宿主交互逻辑搬入 Wasm
- 用 Wasm 替换现有 `shielded` 外层 loader

## 本地索引

### A. 仓库内索引

| 主题 | 入口 | 用途 |
|------|------|------|
| 当前保护路线定位 | [PACKAGE_PROTECTION_ROUTE_PLAN.md](./PACKAGE_PROTECTION_ROUTE_PLAN.md) | 确认 Wasm 当前只是后续增强层 |
| 已验证经验 | [PACKAGE_PROTECTION_EXPERIENCE.md](./PACKAGE_PROTECTION_EXPERIENCE.md) | 读取 package protection 当前实验结论 |
| 宿主启动链 | [addon-static/bootstrap.js](../addon-static/bootstrap.js) | 看 `rootURI`、`registerChrome()`、`loadSubScript()` |
| 当前构建形态 | [scripts/build.mjs](../scripts/build.mjs) | 看 `manifest_version`、manifest 生成方式 |
| 当前兼容声明 | [config/addon.config.json](../config/addon.config.json) | 看当前仓库兼容声明仍是 `8.*`；这和“官方正式发行线已是 Zotero 9”是两个概念 |
| Wasm 加载服务层 | [src/services/wasm-loader.js](../src/services/wasm-loader.js) | 当前最小 Wasm loading PoC 的实现入口 |
| Wasm Worker 控制层 | [src/services/wasm-worker.js](../src/services/wasm-worker.js) | 当前 `rootURI + Worker` PoC 的最小控制层 |
| Wasm probe 特性层 | [src/features/wasm-kernel-probe.js](../src/features/wasm-kernel-probe.js) | 当前真实 `rootURI + wasm + worker` probe 入口，同时承载 digest 与 shadow unlock derivation 包装 |
| Wasm probe 二进制 | [addon-static/content/lib/w/probe.wasm](../addon-static/content/lib/w/probe.wasm) | 当前最小真实 Wasm 资产，导出 `add / seed / mix / finalize` |
| Wasm probe worker | [addon-static/content/lib/w/wasm-probe-worker.js](../addon-static/content/lib/w/wasm-probe-worker.js) | 当前 worker 路径验证脚本，支持 `PROBE`、`DIGEST` 与 `UNLOCK` |
| Wasm probe smoke 链 | [scripts/wasm-kernel-smoke.mjs](../scripts/wasm-kernel-smoke.mjs) | 多轮重复单场景并归档每轮 timing / stdout / stderr tail |
| Wasm probe 性能报告 | [scripts/wasm-kernel-performance-report.mjs](../scripts/wasm-kernel-performance-report.mjs) | 优先读取 `wasm-kernel-smoke`，否则回退到 `agent-zotero-e2e` / `zotero-scenario-last-run`，量化 probe 级 load/init/invoke 成本 |
| Wasm disabled-contract 报告 | [scripts/wasm-kernel-disabled-contract-report.mjs](../scripts/wasm-kernel-disabled-contract-report.mjs) | 汇总 registry/package/build/export/lazy-startup/smoke 证据，验证 `planned + default-disabled` lane 仍保持惰性与隔离 |
| Wasm matrix 报告 | [scripts/wasm-kernel-matrix-report.mjs](../scripts/wasm-kernel-matrix-report.mjs) | 汇总 probe/digest 的 smoke/perf/disabled-contract，固定输出 controller-facing promotion evidence summary；shadow unlock 仍走独立场景证据 |
| Wasm promotion 蓝图 | [WASM_KERNEL_PROMOTION_PLAN.md](./WASM_KERNEL_PROMOTION_PLAN.md) | 看是否、何时、以什么条件进入 optional bundle registry |
| 宿主信号/弱绑定边界 | [PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md](./PACKAGE_PROTECTION_HOST_WEAK_BINDING_V1.md) | 避免把 Wasm 和本地弱绑定混成一路 |

### B. 官方外部索引

| 主题 | 来源 | 当前用途 |
|------|------|----------|
| 官方当前稳定版 | [Zotero 9](https://www.zotero.org/blog/zotero-9/), [Beta Builds](https://www.zotero.org/support/beta_builds) | 固定 “官方正式发行线已是 Zotero 9” |
| Zotero 插件宿主变更 | [Zotero 7 for Developers](https://www.zotero.org/support/dev/zotero_7_for_developers) | 核对 `rootURI`、runtime chrome registration、manifest.json 规则 |
| Zotero Wasm 现成用法 | [@citeproc-rs/wasm](https://www.npmjs.com/package/%40citeproc-rs/wasm) | 参考官方/半官方 Wasm 初始化方式 |
| 浏览器 Wasm API | [MDN WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly), [MDN Loading and running WebAssembly code](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Loading_and_running) | 核对 `instantiate()` / `instantiateStreaming()` / `ArrayBuffer` 方案 |
| WebExtension CSP 参考 | [MDN Content Security Policy](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Content_Security_Policy) | 作为候选约束，不直接升格为当前仓库既定 blocker |
| Rust 构建链 | [wasm-bindgen Guide](https://rustwasm.github.io/docs/wasm-bindgen/), [Without a bundler](https://rustwasm.github.io/docs/wasm-bindgen/examples/without-a-bundler.html) | 看 `--target web`、无 bundler 产物说明 |
| Wasm 反编译/优化 | [WABT](https://github.com/WebAssembly/wabt), [Binaryen](https://github.com/WebAssembly/binaryen) | 后续评估逆向上限与体积优化 |
| 加密/KDF Wasm 案例 | [argon2-browser](https://github.com/antelle/argon2-browser), [libsodium.js](https://github.com/jedisct1/libsodium.js) | 参考浏览器侧加密计算小内核 |

### C. 已验证链接清单

以下链接已经过一轮核对，可作为后续 Wasm 讨论的固定起点。它们分三类：

- `authoritative`：可以直接支撑路线判断
- `strong-reference`：可支撑实现方向或案例判断，但不自动升级成当前仓库 contract
- `context-only`：只作背景，不单独形成设计结论

| 层级 | 主题 | 链接 | 分类 | 当前判断 |
|------|------|------|------|----------|
| 宿主可行性 | Zotero 9 官方发布 | [Zotero 9](https://www.zotero.org/blog/zotero-9/) | authoritative | 已确认官方正式稳定版是 Zotero 9 |
| 宿主可行性 | Zotero 当前 Beta/Release 说明 | [Beta Builds](https://www.zotero.org/support/beta_builds) | authoritative | 可作为“稳定版=9、beta 已进入更高版本线”的辅助证据 |
| 宿主可行性 | Zotero 7+ 插件迁移文档 | [Zotero 7 for Developers](https://www.zotero.org/support/dev/zotero_7_for_developers) | authoritative | 已确认 `rootURI`、`chrome.manifest` 废弃、runtime `registerChrome()` 仍存在 |
| 宿主可行性 | citeproc-rs Zotero 用法 | [@citeproc-rs/wasm](https://www.npmjs.com/package/%40citeproc-rs/wasm) | authoritative | 已确认 Zotero 宿主中 Wasm 可行，但其 `resource://zotero/...` 仅作参考，不是当前仓库默认模板 |
| 宿主可行性 | citeproc-rs 仓库 | [zotero/citeproc-rs](https://github.com/zotero/citeproc-rs) | strong-reference | 可用来查真实实现与构建方式 |
| 宿主可行性 | citeproc-rs 性能讨论 | [performance hit with citeproc-rs](https://forums.zotero.org/discussion/93803/performance-hit-with-citeproc-rs) | strong-reference | 说明 Wasm 在 Zotero 里会产生真实性能/行为讨论，适合作为经验参考 |
| 构建与加载 | wasm-bindgen 无 bundler 指南 | [Without a bundler](https://rustwasm.github.io/docs/wasm-bindgen/examples/without-a-bundler.html) | authoritative | 说明 `--target web` 是现代无 bundler 路线的重要候选，但当前仓库仍需本地 PoC 决定是否采用 |
| 构建与加载 | Zotero 插件总览 | [Plugins](https://www.zotero.org/support/plugins) | context-only | 只作插件生态背景，不单独形成 Wasm 技术结论 |
| 性能与调试 | ZotSeek 仓库 | [introfini/ZotSeek](https://github.com/introfini/ZotSeek) | strong-reference | 可作为 `Worker + 大资产 + 本地 AI` 的实现参考，但不自动升级成当前仓库默认方案 |
| 性能与调试 | ZotSeek 论坛帖 | [ZotSeek forum post](https://forums.zotero.org/discussion/128707/new-plugin-zotseek-ai-powered-semantic-search-for-zotero-8) | strong-reference | 说明 `ChromeWorker` 在 Zotero 插件场景里具备现实案例价值 |
| 防护与逆向 | MDN CSP | [Content Security Policy](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_Security_Policy) | authoritative | 已确认 WebExtensions 语境下 Wasm 与 `'wasm-unsafe-eval'` 的关系，但当前仓库仍需本地 PoC 验证它是否构成真实 blocker |
| 防护与逆向 | MDN manifest CSP | [content_security_policy](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_security_policy) | authoritative | 可用来查 manifest 配置语法和 `'wasm-unsafe-eval'` 的允许值 |
| 防护与逆向 | WABT | [WebAssembly/wabt](https://github.com/WebAssembly/wabt) | authoritative | 固定作为 `wasm2wat / wasm-decompile` 评估工具链 |
| 防护与逆向 | Binaryen | [WebAssembly/binaryen](https://github.com/WebAssembly/binaryen) | authoritative | 固定作为 `wasm-opt` 体积与逆向摩擦评估工具链 |
| 现成案例 | libsodium.js | [jedisct1/libsodium.js](https://github.com/jedisct1/libsodium.js) | strong-reference | 可参考浏览器侧对称加密/secretbox Wasm 用法 |
| 现成案例 | argon2-browser | [antelle/argon2-browser](https://github.com/antelle/argon2-browser) | strong-reference | 可参考浏览器侧 KDF/解锁小内核 |
| 通用 API | MDN WebAssembly | [WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly) | authoritative | 固定作为 WebAssembly JS API 总入口 |
| 通用 API | MDN Loading and running | [Loading and running WebAssembly code](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Loading_and_running) | authoritative | 固定作为 `fetch/ArrayBuffer/instantiate` 行为说明 |
| 通用 API | MDN instantiateStreaming | [instantiateStreaming()](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static) | authoritative | 当前只作 API 参考，不直接作为当前仓库首选方案 |
| 通用规范 | WebAssembly Spec | [WebAssembly Spec](https://webassembly.github.io/spec/core/) | context-only | 只在需要查低层规范细节时使用 |

## 关键结论与索引化判断

### 1. `rootURI` 是当前插件私有 `.wasm` 的首选加载入口

来自官方文档的稳定结论：

- Zotero 7+ 在 `startup({ rootURI })` 里提供插件文件根路径
- 对 XPI 来说，这会是 `jar:file:///...!/` 形式
- 可直接拼接相对路径访问插件打包文件

来源：

- [Zotero 7 for Developers](https://www.zotero.org/support/dev/zotero_7_for_developers)

当前本地判断：

- 对当前仓库，`plugin-private wasm` 首先应试 `rootURI + "content/lib/w/<file>.wasm"` 这条路径
- 不应默认把 `resource://zotero/...` 当成第三方插件私有 Wasm 的默认模板

### 2. `chrome.manifest` 已废弃，但 runtime chrome registration 仍然存在

官方文档不是说“彻底不用 chrome 注册”，而是说：

- 静态 `chrome.manifest` 不再支持
- 需要时改为运行时 `registerChrome()`

来源：

- [Zotero 7 for Developers](https://www.zotero.org/support/dev/zotero_7_for_developers)

当前本地判断：

- 当前仓库现有 `chrome://<addonRef>/...` 资源链仍然要保留
- Wasm 二进制加载可以优先走 `rootURI`
- 但这不等于当前仓库要删除 `registerChrome()`

### 3. `resource://zotero/...` 案例是参考，不是当前仓库默认模板

`@citeproc-rs/wasm` 的意义：

- 它证明 Zotero 宿主中 Wasm 可行
- 它提供了真实初始化链参考

但它不自动等于：

- 当前第三方插件都该照搬 `resource://zotero/...`
- 当前仓库应该直接复制 Zotero 核心的文件布局

当前本地判断：

- 优先借用其“初始化思路”
- 不直接借用其“资源路径和宿主命名”

### 4. `wasm-unsafe-eval` 目前只应记为候选验证项

检索结论说明：

- 在 WebExtensions CSP 语境里，Wasm 可能受 `wasm-unsafe-eval` 约束

当前本地判断：

- 这条不能直接升格为当前 Zotero bootstrap 插件的既定 blocker
- 应在本地 Wasm PoC 中验证：
  - 当前宿主是否真的触发同样的 CSP 约束
  - 若需要，再回填 manifest/build 设计

### 5. `--target web` 是候选，不是当前仓库既定最佳解

外部文档说明：

## 当前本地 probe 基线

当前仓库已经补上最小真实 probe，但仍保持非主线、非默认启动：

- 真实二进制资产：`addon-static/content/lib/w/probe.wasm`
- 真实 worker 脚本：`addon-static/content/lib/w/wasm-probe-worker.js`
- 特性层包装：`src/features/wasm-kernel-probe.js`
- 非默认执行入口：`plugin.api.agent.runHostAction("runtime.probeWasmKernel", payload)`、`plugin.api.agent.runHostAction("runtime.deriveWasmKernelDigest", payload)` 与 `plugin.api.agent.runHostAction("runtime.deriveWasmKernelUnlockToken", payload)`

当前 probe 目标只验证三件事：

- `rootURI + content/lib/w/probe.wasm` 是否能被当前插件形态读取
- `WebAssembly.instantiate()` 是否在当前宿主里稳定可用
- worker 路径是否能返回与主线程一致的导出结果
- default-disabled 态下是否能保持 startup 不主动创建 Wasm runtime，而只在 `runtime.probeWasmKernel` / `runtime.deriveWasmKernelDigest` / `runtime.deriveWasmKernelUnlockToken` 首次调用时惰性创建

当前仓库已验证出的一个宿主细节：

- 主线程 Wasm：`rootURI + content/lib/w/probe.wasm` 可用
- `ChromeWorker` 脚本：在当前 `bootstrap.js + runtime chrome registration` 形态下，应优先使用 `chrome://<addonRef>/content/lib/w/...`
- worker 侧 Wasm：当前 probe 同样通过 `chrome://<addonRef>/content/lib/w/...` 传入，避免 `file://.../worker.js` 装载失败
- repo-specific 打包约束：当前 `registerChrome()` 只暴露 `rootURI + "content/"`，因此 worker 与 worker 消费的 `.wasm` 资产都必须落在 `addon-static/content/` 命名空间下

当前 live scenario 入口：

- `npm run zotero:scenario -- --scenario "wasm kernel probe diagnostics"`
- `npm run zotero:scenario -- --scenario "wasm kernel digest diagnostics"`
- `npm run zotero:scenario -- --scenario "wasm kernel unlock diagnostics"`
- 场景文件：[zotero-scenarios/wasm-kernel-probe.scenario.js](../zotero-scenarios/wasm-kernel-probe.scenario.js)
- 场景文件：[zotero-scenarios/wasm-kernel-digest.scenario.js](../zotero-scenarios/wasm-kernel-digest.scenario.js)
- 场景文件：[zotero-scenarios/wasm-kernel-unlock.scenario.js](../zotero-scenarios/wasm-kernel-unlock.scenario.js)
- 报告路径：probe 兼容总览保持 `dist/wasm-kernel-smoke.json` / `dist/wasm-kernel-performance.json`；digest 并存写入 `dist/wasm-kernel-digest-smoke.json` / `dist/wasm-kernel-digest-performance.json`

当前 probe 不代表：

- `wasm-kernel` 已完成 optional bundle promotion
- Wasm 已进入默认 `build / package / gate` 主线
- 当前仓库已经把兼容线升级到 Zotero 9

当前最新判断：

- `wasm-kernel` 现在可以作为 `planned + default-disabled` lane 记入 optional bundle registry
- 它现在已经不再是“只有 add() 的纯 probe”，而是 `probe + digest + shadow unlock derivation` 的 bundle-local lane
- 但它仍然不是 `implemented` bundle
- 当前 registry 已额外冻结一层 verify/export contract：checked-in `.wasm` / worker 资产与 JS wrapper 文件必须持续存在，pure-project export 也必须保留这些 Wasm 资产
- 当前 `npm run wasm:kernel:smoke -- --repeats 3` 已改为严格 smoke：只有 `zotero:scenario` 本轮退出码为 `0` 且读取到 fresh `zotero-scenario-last-run.json` 时才记为通过；`2026-04-19` 的最新真实 multi-run 结果已在宿主提权运行下稳定 `3/3` 通过，main-thread 中位 `1ms`、worker 中位 `3ms`、probe 总时延中位 `5ms`，说明当前 probe 已能稳定产出重复 timing。此前出现的 `listen EPERM: operation not permitted 0.0.0.0` 已确认为沙箱监听限制，不再代表仓库实际 smoke 状态
- 当前 digest 场景已经产出 fresh live repeated smoke artifact：`3/3` 通过，main-thread 中位 `1ms`、worker 中位 `5ms`；对应 digest performance report 已从 `expand-digest-smoke-repeats` 升级为 `digest-smoke-observed`
- 当前 default-disabled 语义已补独立证据入口：`npm run wasm:kernel:disabled-contract` 会单独检查 registry/package 脚本、source/build/export 资产、惰性 startup wiring 与最近 smoke 结果；probe 兼容总览保持 `dist/wasm-kernel-disabled-contract.json`，digest 并存写入 `dist/wasm-kernel-digest-disabled-contract.json`。但这仍只服务 `planned + default-disabled` 收口，不等于 `implemented`
- 当前聚合层已补固定入口：`npm run wasm:kernel:matrix` 会把 probe/digest 两条 lane 的 smoke/perf/disabled-contract 收成 `dist/wasm-kernel-matrix.json` / `md`，作为后续 Wasm 讨论和 promotion 评估的单一证据入口；当前矩阵结论固定为 `keep-planned-default-disabled`
- 当前首个业务侧 shadow-mode 实验已经落地：`runtime.deriveWasmKernelUnlockToken` 会把 `profileHash + schemaBucket + zoteroVersionBucket + nonceHash` 等宿主弱绑定材料送入 Wasm derivation，但只返回 stage2Digest/unlockToken 诊断结果，不直接接管 overlay gate

- `wasm-bindgen` 的无 bundler 浏览器场景主推 `--target web`

当前本地判断：

- 对当前仓库不应先假定 `--target web` 就是最佳方案
- 因为当前主启动链并不是 ESM-first 的网页入口，而是 `loadSubScript()` 驱动
- 最低风险 PoC 仍应先验证：
  - 直接 `ArrayBuffer + WebAssembly.instantiate()`
  - 再决定是否引入 `wasm-bindgen` 包装层

### 6. `ChromeWorker/Worker + Wasm` 适合重计算内核，但不应作为第一步

参考来源说明：

- Zotero/Firefox 生态中，`ChromeWorker` 是存在的宿主能力，Zotero 自身也有 `pdfWorker` 相关实现与 `ChromeWorker` 全局可用声明
- 开源插件参考里也存在把 Worker 作为后台重任务承载的模式

当前本地判断：

- 对大 Wasm、长时计算、模型推理、批量 OCR/解析等场景，Worker 路线值得保留
- 但当前仓库的第一步 PoC 仍应先完成主线程 `rootURI + instantiate()` 验证
- 只有当主线程版本出现明显 UI 抖动、初始化时延或长期驻留成本时，才把 Worker 升级为默认建议

当前本地最小实现入口：

- [src/services/wasm-worker.js](../src/services/wasm-worker.js)

它当前只负责：

- 用 `rootURI + workerRelativePath` 启动 Worker
- 向 Worker 发送初始化消息，传递 `rootURI + wasmRelativePath`
- 在初始化完成后提供最小 request/response 通道

## 后续讨论默认假设

后续如果没有特别声明，Wasm 讨论默认基于以下前提：

- 宿主：当前仓库的 bootstrap Zotero 插件形态
- 外部版本事实：官方正式稳定版已是 `Zotero 9`
- 仓库当前状态：兼容声明仍停在 `8.*`
- 目标：阻碍普通开发者、自动化工具和一轮 AI 快速直读
- 范围：先做小型 Wasm 内核，不动默认 `release` / `agent:gate`

## 下一步 PoC 基线

### PoC 1：Wasm Loading

目标：

- 验证当前仓库里 `.wasm` 的真实可加载路径与初始化方式

优先测试：

- `rootURI + "content/lib/w/<name>.wasm"`
- `fetch(...).arrayBuffer()` 或等价二进制读取
- `WebAssembly.instantiate(bytes, imports)`

明确先不做：

- Worker
- externref
- `wasm-bindgen` 包装层
- package protection 主链替换

### PoC 2：Micro-kernel

目标：

- 验证 Wasm 对当前保护线的真实收益

候选函数：

- `deriveUnlockToken()`
- `verifyEntitlement()`

要求：

- JS 继续负责宿主交互
- Wasm 只接纯输入输出参数

### PoC 3：Protection Evaluation

目标：

- 量化 Wasm 引入后的成本与收益

至少记录：

- 包体积变化
- 初始化时延
- `webcrack + AI` 后可恢复层级
- `wasm2wat` / `wasm-decompile` 后的可读程度

## 检索关键词附录

后续如果还要补点查证，优先用这些关键词：

- `site:zotero.org/support/dev Zotero 7 for Developers rootURI`
- `site:zotero.org/support/dev chrome.manifest runtime chrome registration Zotero`
- `site:npmjs.com @citeproc-rs/wasm Usage in Zotero`
- `site:rustwasm.github.io wasm-bindgen target web no-modules`
- `site:developer.mozilla.org WebAssembly instantiate ArrayBuffer`
- `site:developer.mozilla.org Content Security Policy wasm-unsafe-eval WebExtensions`
- `site:github.com/WebAssembly wabt wasm-decompile`
- `site:github.com/WebAssembly binaryen wasm-opt`
- `site:github.com antelle argon2-browser wasm`
- `site:github.com jedisct1 libsodium.js wasm`

## 维护规则

- 不要把本页当 current truth
- 不要在本页直接宣布“仓库已支持 Zotero 9”或“Wasm 已成为主路线”
- 外部事实变化时，只更新来源和日期，不自动改仓库配置
- 若 Wasm PoC 真正落地并形成稳定实验链，再考虑把结论回填到相关路线文档
