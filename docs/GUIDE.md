# 使用指南

本指南帮助你快速上手 Zotero Cleanroom Template 框架开发插件。

## 目录

- [快速开始](#快速开始)
- [项目配置](#项目配置)
- [核心概念](#核心概念)
- [模块使用](#模块使用)
- [完整示例](#完整示例)
- [Zotero 真机测试](#zotero-真机测试)
- [Agent 接手流程](#agent-接手流程)
- [调试技巧](#调试技巧)
- [发布流程](#发布流程)

---

## 快速开始

### 1. 克隆项目

```bash
git clone <your-fork-url> my-plugin
cd my-plugin
```

### 2. 配置插件信息

编辑 `config/addon.config.json`：

```json
{
  "addonId": "my-plugin@example.com",
  "addonName": "My Plugin",
  "addonRef": "myplugin",
  "addonVersion": "0.1.0",
  "description": "A Zotero plugin",
  "author": "Your Name",
  "homepage": "https://github.com/yourname/my-plugin",
  "updateURL": "https://github.com/yourname/my-plugin/releases/download/release/update.json",
  "strictMinVersion": "6.999",
  "strictMaxVersion": "8.*",
  "prefsPrefix": "extensions.zotero.myplugin",
  "instanceKey": "MyPlugin"
}
```

### 3. 构建与加载

```bash
npm run build
npm run package
npm run package:encrypted
npm run package:shielded
npm run package:shielded:pref-bridge
npm run package:shielded:surface-scrub
npm run package:shielded:surface-scrub:wasm:digest
npm run package:shielded:descriptor-bind
npm run package:shielded:jsconfuser:string
npm run package:protection:smoke -- --variant shielded --repeats 3 --channel stable
npm run package:protection:smoke:shielded:descriptor-bind -- --repeats 3 --channel stable
npm run package:protection:smoke:shielded:jsconfuser:string -- --repeats 3 --channel stable
npm run package:protection:smoke:shielded:pref-bridge -- --repeats 3 --channel stable
npm run package:protection:smoke:shielded:surface-scrub -- --repeats 3 --channel stable
CLEANROOM_ROUTE4_LEGACY_ENDPOINT=https://example.invalid/legacy CLEANROOM_ROUTE4_LEGACY_SECRET=legacy-secret npm run package:protection:smoke -- --variant shielded-surface-scrub-wasm-entitlement-legacy --repeats 3 --channel stable
npm run package:protection:webcrack:shielded -- --channel stable
npm run package:protection:webcrack:shielded:descriptor-bind -- --channel stable
npm run package:protection:webcrack:shielded:jsconfuser:string -- --channel stable
npm run package:protection:webcrack:shielded:pref-bridge -- --channel stable
npm run package:protection:webcrack:shielded:surface-scrub -- --channel stable
npm run package:protection:webcrack:score -- --variant shielded --channel stable
npm run package:protection:opencode -- --variant shielded --channel stable
npm run package:protection:opencode:score -- --variant shielded --channel stable
npm run package:protection:audit
npm run package:protection:audit:descriptor-bind
npm run package:protection:audit:jsconfuser:string
npm run package:protection:audit:pref-bridge
npm run package:protection:audit:surface-scrub
npm run package:protection:compare:descriptor-bind -- --channel stable
npm run package:protection:compare:jsconfuser:string -- --channel stable
npm run package:protection:compare:pref-bridge -- --channel stable
npm run package:protection:compare:surface-scrub -- --channel stable
npm run package:protection:jsconfuser:bootstrap
npm run package:protection:jsconfuser:preflight
npm run package:protection:jsconfuser:string:preflight
npm run package:protection:lightweight:preflight
npm run package:protection:inner:audit:shielded -- --channel stable
npm run package:protection:inner:audit:descriptor-bind -- --channel stable
npm run package:protection:inner:audit:jsconfuser:string -- --channel stable
npm run package:protection:inner:audit:pref-bridge -- --channel stable
npm run package:protection:inner:audit:surface-scrub -- --channel stable
npm run package:protection:score:llm -- --variant shielded-jsconfuser-string --channel stable --llm "parse-fail / only-loader"
npm run package:protection:score -- --variant shielded --channel stable --webcrack "parse-fail / only-loader" --llm "high-level-architecture"
npm run package:protection:score:guided -- --variant shielded --channel stable --rating "high-level-architecture" --result-tier R1 --attacker-tier A2 --ai-tier M3 --attack-method static+reference --time-bucket 30-120m --round-mode multi-round --summary "guided attack recovered lifecycle facade"
npm run package:protection:attack:plan
npm run package:protection:matrix
npm run package:protection:wasm:admission
npm run package:protection:verdict
```

在 Zotero 中：
1. 打开 工具 → 开发者 → 管理附加组件
2. 点击 "Install Add-on From File"
3. 选择 `dist/myplugin-0.1.0.xpi`

如果你需要一个手动触发的受保护导出分支，也可以额外执行：

```bash
npm run package:encrypted
npm run package:shielded
```

它会生成 `dist/myplugin-0.1.0-encrypted.xpi` 或 `dist/myplugin-0.1.0-shielded.xpi`。`package:encrypted` 只对主 bundle 做客户端侧加密包装，提高直接解包直读门槛，也是当前更稳的低开销受保护分支；`package:shielded` 会先对主 bundle 做混淆，再对 protected loader 做一层轻量硬化，最后做 AES 包装，更适合提高自动化工具与 AI 的快速解读成本。两条分支默认都不写 release metadata，不进入 `release:plan` / `agent:gate:release` 主线，也不替代服务端保护。

如果要正式比较 `plain / encrypted / shielded` 三个控制组，执行：

```bash
npm run package:protection:smoke -- --variant plain --repeats 3 --channel stable
npm run package:protection:smoke -- --variant encrypted --repeats 3 --channel stable
npm run package:protection:smoke -- --variant shielded --repeats 3 --channel stable
```

这条实验链会把报告写到 `dist/package-protection-smoke/<variant>-<channel>.json` 和 `dist/package-protection-smoke/<variant>-<channel>.md`，并额外生成 aggregate 报告。当前实验报告会固定回读 `readinessMode`、`blockingRuntimeErrorCount`、`packageProtection.*`、bundle/XPI 大小，以及运行时 `Uint8Array.fromBase64 / setFromBase64` 支持情况。

如果要判断下一步应该继续 trim raw export，还是转向 inner bundle 的高层语义减噪，执行：

```bash
npm run package:protection:audit
```

它会生成 `dist/package-protection-anchor-audit.json` / `md`，对 `plain / encrypted / shielded` 的 raw 导出物做高层语义锚点盘点。当前这个实验入口是路线规划辅助，不替代 `smoke -> score -> verdict`。

如果你要把 `shielded-descriptor-bind` 也作为额外实验变体并入同一份审计报告，执行：

```bash
npm run package:protection:audit:descriptor-bind
```

这条扩展入口不会改变 `plain / encrypted / shielded` 这三条基线对比的 summary / nextAction 判据，只会在同一份报告里附加 `descriptor-bind` 的 raw export 结果，方便判断它带来的到底是 raw hardening 还是 runtime semantic recovery。

如果你要把 `shielded-jsconfuser-string` 也作为额外实验变体并入同一份审计报告，执行：

```bash
npm run package:protection:audit:jsconfuser:string
```

这条扩展入口同样不会改变 `plain / encrypted / shielded` 这三条基线对比的 summary / nextAction 判据，只会附加 `jsconfuser-string` 的 raw export 结果与体积增量，方便判断它的收益究竟还停留在 inner semantic suppression，还是已经反映到了 raw surface。
如果本地自动发现 `js-confuser` 失败，再补 `-- --jsconfuser-tool-path /absolute/path/to/js-confuser`。

如果你要把 `shielded-surface-scrub` 也作为额外实验变体并入同一份审计报告，执行：

```bash
npm run package:protection:audit:surface-scrub
```

这条扩展入口同样不会改变 `plain / encrypted / shielded` 这三条基线对比的 summary / nextAction 判据；它只补 `surface-scrub` 对 `bootstrap.js` 字面值与解压后 support surface 的增量证据。

如果你要判断 Wasm 是否可以从 `preplan` 提升为第一条受保护打包实验候选，执行：

```bash
npm run package:protection:wasm:admission
```

只有当该报告输出 `ready-for-candidate` 时，才打开 `shielded-surface-scrub-wasm-digest`。这个候选固定只复用 default-disabled / lazy 的 digest micro-kernel，新增静态暴露只能落在 `content/lib/w/*`，不进入默认 `release / agent:gate / agent:gate:release`。

如果你想先把 `js-confuser` 工具安装到当前仓库的默认可发现位置，执行：

```bash
npm run package:protection:jsconfuser:bootstrap
```

默认会安装到 `dist/package-protection-tools/js-confuser`。这条命令只解决本地实验链的工具可复跑性，不改默认 `shielded`。

如果你要预检 `JS-Confuser` 的 `astScrambler` 非 hostile 子集是否值得进入下一轮 Stage 3 PoC，执行：

```bash
npm run package:protection:jsconfuser:preflight
```

它会生成 `dist/package-protection-jsconfuser-preflight.json` / `md`，默认基于 `plain` source proxy 回答三件事：

- 这个外部 checkout 能否成功产出可解析输出
- 体积是否仍落在当前 `loader-lite` 路线可接受范围内
- 对模板内高层语义锚点是否有实际压缩

这条命令仍然是 advisory/manual lane，不接默认 release 主线，也不会改写当前 `package:shielded`。
如果本地自动发现 `js-confuser` 失败，优先先跑 `npm run package:protection:jsconfuser:bootstrap`，再考虑补 `-- --tool-path /absolute/path/to/js-confuser`。

如果你要继续验证 `JS-Confuser` 的第二层候选，也就是“只针对高层语义锚点做小范围 `stringConcealing`”，执行：

```bash
npm run package:protection:jsconfuser:string:preflight
```

它会生成 `dist/package-protection-jsconfuser-string-preflight.json` / `md`，默认目标集固定对齐当前模板高层语义锚点：

- `plugin.api.agent.*`
- `runAgentAction`
- `listAgentCapabilities`
- `getPackageProtectionSummary`
- `getLifecycleTelemetrySummary`
- `entrypoints / ownedBy / successSignals`
- `serviceRegistry`
- `optionalBundles`
- `agent-runtime / ai-service`

它仍然只是一条 advisory/manual 预检入口，不会直接改写当前 `package:shielded`，但比 `astScrambler` 更接近“阻断一轮 AI 高层架构归纳”的实际目标。
如果本地自动发现 `js-confuser` 失败，优先先跑 `npm run package:protection:jsconfuser:bootstrap`，再考虑补 `-- --tool-path /absolute/path/to/js-confuser`。

如果你要把这条 `targeted stringConcealing` 候选真正提升成一个可安装的手动 XPI 实验变体，而不是只停留在 preflight，执行：

```bash
npm run package:shielded:jsconfuser:string
```

它会在当前 `shielded` 路线的 protected-only source proxy 上，额外跑一层显式目标字符串的 `JS-Confuser stringConcealing`，然后继续走原有的 bundle obfuscation + AES 包装 + loader-lite 硬化。这个入口仍然是手动实验分支，不会替换默认 `package:shielded`。
如果本地自动发现 `js-confuser` 失败，优先先跑 `npm run package:protection:jsconfuser:bootstrap`，再考虑补 `-- --jsconfuser-tool-path /absolute/path/to/js-confuser`。

如果你要对这个新变体直接做 Zotero 安装态 / 启动态 smoke A/B，执行：

```bash
npm run package:protection:smoke:shielded:jsconfuser:string -- --repeats 3 --channel stable
```

它会复用现有 `packageProtection` 时序回读、runtime log bridge 与安装 smoke 探针，但不会被纳入正式 `smoke -> score -> verdict` 的 required target。
如果本地自动发现 `js-confuser` 失败，优先先跑 `npm run package:protection:jsconfuser:bootstrap`，再考虑补 `--jsconfuser-tool-path /absolute/path/to/js-confuser`。

如果你要重新验证 `lightweight-js-obfuscator` 这条更后置的 Stage 3 候选，执行：

```bash
npm run package:protection:lightweight:preflight
```

这条命令现在会优先自动发现本地 `lightweight-js-obfuscator` checkout；默认会搜索仓库邻近目录、`$HOME/.openclaw/workspace-coding*`、`~/Downloads` 和 `dist/package-protection-tools/lightweight-js-obfuscator`。只有自动发现失败时，才需要补：

```bash
npm run package:protection:lightweight:preflight -- --tool-path /absolute/path/to/lightweight-js-obfuscator
```

它仍然只生成 advisory 预检报告，不会改写默认 `package:shielded` 路线；当前作用只是让这条后续候选更容易复跑，不改变既有 retained decision。

如果你要把 `shielded` 基线和某个实验变体的当前证据收口成一份 A/B compare 报告，执行：

```bash
npm run package:protection:compare:descriptor-bind -- --channel stable
npm run package:protection:compare:jsconfuser:string -- --channel stable
```

它会读取现有的 smoke / webcrack / audit 工件，生成 `dist/package-protection-compare/*.json` / `md`，专门回答两类问题：

- `descriptor-bind` 当前是不是只该作为 `runtime-only` 实验分支保留
- `jsconfuser-string` 当前是否已经形成可稳定复现的 hardening 收益；当前 retained rule 已收紧为“单轮 `LLM single-pass` 优势不够，必须连 guided-attack 对称比较也更优，才能升级为 `hardening-win`”，因此最新保守结论按 `leaning-same / stop-current-candidate` 处理

如果你想用统一模型口径补默认 `single-pass` 证据，优先执行：

```bash
npm run package:protection:opencode -- --variant shielded-jsconfuser-string --channel stable
npm run package:protection:opencode:score -- --variant shielded-jsconfuser-string --channel stable
```

这条链会保留当前 `manualScorecard.webcrackInitialResult`，只更新 `llmSinglePassResult`。如果当前环境没有 `opencode` 或你需要人工覆盖，再退回：

```bash
npm run package:protection:score:llm -- --variant shielded-jsconfuser-string --channel stable --llm "parse-fail / only-loader"
```

当前正式手动收口链路固定为：

```bash
npm run package:protection:smoke -- --variant shielded --repeats 3 --channel stable
npm run package:protection:score -- --variant shielded --channel stable --webcrack "parse-fail / only-loader" --llm "high-level-architecture"
npm run package:protection:verdict
```

其中：

- `package:protection:score` 只回填 `shielded stable` 的手工评分，不重新打包也不重跑 smoke
- `package:protection:score:guided` 只记录更强的“攻击者 + AI 组合能力”证据，不会覆盖 `single-pass` 手工评分；等级定义见 [PACKAGE_PROTECTION_ATTACK_GRADING.md](./PACKAGE_PROTECTION_ATTACK_GRADING.md)
- `package:protection:attack:plan` 会把 attack report 里的 fixed-profile coverage gap 翻成下一步命令模板，固定先补 `current` 候选，再 review retained experiment
- `package:protection:matrix` 会把 `current / experiment / preflight / future / paper / preplan` 候选统一汇总成一份 advisory 矩阵；它只回读现有工件，不会替代 `smoke` 或 `verdict`，说明见 [PACKAGE_PROTECTION_EXPERIMENT_MATRIX.md](./PACKAGE_PROTECTION_EXPERIMENT_MATRIX.md)
- `package:protection:verdict` 只生成 `dist/package-protection-verdict.json` / `md` 的 advisory 结论，不进入默认 release gate
- `package:protection:webcrack` 会在 fresh 打包后提取 XPI 内主脚本，调用本地 `webcrack` CLI，并额外保留一个 `--no-deobfuscate --no-unpack` 的 fallback loader-only 工件，供 controller / subagent / 人工继续判读
- `package:protection:webcrack:score` 只把 `webcrack` 自动建议评级回填到 `manualScorecard.webcrackInitialResult`，不会自动补 `llmSinglePassResult`
- `package:protection:opencode` 是当前默认 scripted `single-pass` 静态分析 lane；只在当前环境已安装并允许调用 `opencode run` 时启用
- `package:protection:opencode:score` 只把 `suggestedLLMRating` 回填到 `manualScorecard.llmSinglePassResult`
- `package:protection:score` / `package:protection:opencode:score` / `package:protection:score:llm` / `package:protection:webcrack:score` 当前共用同一条 package-protection workflow lock；如果在同一进程里并发录入评分，也会按串行顺序回写 smoke aggregate，避免把 `dist/package-protection-smoke.json` 写坏
- `package:protection:score:llm` 继续保留，但只作为手工 fallback
- `package:protection:inner:audit` 会离线提取 protected loader、拦截解密后的 inner bundle，并给出保守的 `proxy LLM` 建议评级；它只补证据，不会自动回填 `manualScorecard`
- `package:protection:compare` 现在会附带读取 `inner audit` 结果；当手工 `LLM single-pass` 还没补齐时，它会把这份 proxy 一并写进 compare 报告，但不会自动替代 manual score
- 当前最新保守 compare 结论是：`shielded-descriptor-bind = runtime-only`；`shielded-jsconfuser-string` 保留实验记录，但因 `beta` 复验未复现 `stable` 优势，当前按 `leaning-same / stop-current-candidate` 处理
- 若你对实验变体重新跑了 `smoke`，对应 smoke report 的 `manualScorecard` 会被重置回 `pending`；此时要先重新执行 `package:protection:webcrack:score` 或 `package:protection:opencode:score` / `package:protection:score` / `package:protection:score:llm`，再跑 compare
- `plain` 继续只是 control group；它的自动评分不是最终 protection verdict 的降级依据

如果需要定位受保护包的首次加载延迟，优先读取 `packageProtection` 时序与 `decodeMethod`，而不是只看插件内核 `startupDurationMs`。当前这组时序会拆出 `loadSubScript / decode / decrypt / eval / prepare total`，便于判断性能热点是在 loader、decode 还是插件本体启动。

如果需要把这类时序读成一份固定性能报告，执行：

```bash
npm run package:protection:perf -- --channel stable
```

当前读法固定为：

- `durationMs median / p95 / max` 看体感风险和尾延迟
- `loadSubScript + prepare` 看保护链自身额外成本
- 如果某个候选只是总时长看起来更快，但 `loadSubScript + prepare` 更重，应先按 Zotero 宿主冷启动噪声处理，不要直接升级为更优路线

说明：`updateURL` 在 Zotero 7/8 的实际安装链路中应视为必填。留空时，构建虽然可能完成，但 Zotero 会把生成的包判为无效。
说明：当前仓库 `config/addon.config.json` 中落地的 Gitee `updateURL` 仅用于这个模板项目自身的远端发布验收与测试；如果你是基于模板开发自己的插件，必须先替换 `addonId`、`homepage` 和 `updateURL`，不能继续沿用模板仓库的发布地址。
说明：`build/` 与 `dist/` 都是本地可再生工件，已被 `.gitignore` 忽略；正常 `git push` 不会上传这些产物。若要交付纯源码，请使用 `npm run export:project`，不要直接压缩整个工作目录。
说明：`npm run export:project` 现在会一并导出 `LEGAL_RISK_CHECKLIST.md`、`CODE_PROVENANCE.md`、`THIRD_PARTY_NOTICES.md` 与 `COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md`，作为中国法商业交付骨架。
说明：如果你在补 release / toolchain 测试，不要把仓库里已有的 `build/` / `dist/` 当稳定输入；需要先在测试里准备 fresh 工件，或改用临时 fixture。

### 4. Zotero 真机测试

复制 `.env.example` 为 `.env.local`，至少填写：

```ini
ZOTERO_PLUGIN_ZOTERO_BIN_PATH=/Applications/Zotero.app/Contents/MacOS/zotero
```

然后使用：

```bash
npm run zotero:smoke
npm run zotero:dev
npm run zotero:watch
npm run zotero:console
npm run zotero:test
```

- `zotero:smoke`：自动启动隔离 Zotero，临时安装当前 `.xpi`，验证成功后退出
- `zotero:dev`：自动启动隔离 Zotero，安装插件后保持窗口打开
- `zotero:watch`：监听 `src/`、`addon-static/`、`config/` 变化，重打包并通过 RDP reload，随后执行健康检查；若失败，会自动尝试恢复，并输出 `dist/zotero-watch-status.{json,md}`
- `zotero:console`：在 `zotero:dev` 基础上追加 `--jsdebugger`，请求 Zotero 拉起内置 Browser Toolbox
- `zotero:test`：在 Zotero 主进程内执行 `zotero-tests/*.test.js`
- `agent:monitor` / `agent:dashboard` / `agent:gate`：会继续消费 `dist/zotero-watch-status.json`，并读取 `dist/agent-zotero-e2e.json`、`dist/agent-zotero-autofix.json`，把热重载状态、真机闭环结果、自动恢复摘要、恢复步骤耗时与失败分布纳入 agent 开发闭环；其中开发档位的 `agent:gate` 会把 `watch` 异常、Zotero E2E 失败、E2E 结果过期，或 `autofix` 仍落后于最新失败 E2E 视为需要先处理的问题

详细说明见 [Zotero 测试与调试](./ZOTERO_TESTING.md)。

---

## Agent 接手流程

如果一个新的开发 agent 接手这个项目，默认按下面顺序推进：

1. 先看 `docs/AGENT_INDEX.md` 的路由说明；它只负责导航，当前 truth 仍只认 `docs/CURRENT_BACKLOG.md`。
2. 先读取 `docs/CURRENT_BACKLOG.md` 的“当前单一事实源”，不要直接根据旧 `dist/` 工件、README 历史记录或单次命令输出判断当前主线。
3. 如只需快速定向当前项目态，可先看 `dist/agent-context.json` 的 `runtimeCompact` 视图；一旦涉及 truth、wave、validation 或 scope 判定，仍回到 `docs/CURRENT_BACKLOG.md` 与 project mirror。
4. 先执行 `npm run check`，确保源码、配置、文档 truth 与 clean-room 门禁处于一致状态。
5. 如果 `config/addon.config.json` 仍是模板默认值，例如 `addonId=cleanroom-template@example.com`、`author=Your Team`、模板仓库 `homepage` 或模板专用 `updateURL`，先暂停功能开发，并先向用户确认：`addonName`、`addonId`、`addonRef`、`author`、`homepage`、`updateURL`，以及是否保留完整 agent 工程链还是导出纯项目。
6. 涉及运行时、UI、场景或宿主集成的改动，优先执行 `npm run agent:zotero:e2e`；只有需要连续热重载观察时再使用 `npm run zotero:watch`。
7. 每轮改动后都执行 `npm run agent:monitor` 和 `npm run agent:gate`，以 gate 是否通过作为“是否继续推进”的主判据。
8. 只有当前任务明确属于发布链时，才进入 `npm run release:plan -> npm run release:upload -- --provider <provider> --release-tag <tag> --target-base-url <url> -> 手动上传远端产物 -> npm run release:preflight -- --verify-remote -> npm run release:prepare -> npm run release:matrix -> npm run agent:gate:release`。
9. 如果只是要导出纯源码或模板交付物，使用 `npm run export:project`，不要直接复制整个工作目录。
10. 如果这轮需要刷新本地 `reference/` 中受管的 git-backed 快照，不要直接手改 `reference/` 目录；先执行 `npm run agent:reference:update -- list` 查看受管项目，再用 `npm run agent:reference:update -- update --project <id>` 或 `--all`。
11. 如果需要人工触发一轮“产品整体 UI 设计 / 更新”草图，不要直接改自动生成的 `07~11` UI 概念图；先执行 `npm run agent:ui:design -- list`，再用 `npm run agent:ui:design -- run product-ui-design-update --goal "<你的设计目标>"`，让子 agent 只更新 `obsidian/agent-workbench/20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md`。

补充说明：

- 如果你调整了 `config/project-validation-overrides.json` 或 `config/project-expansion-wave.json`，同时也要更新 `docs/CURRENT_BACKLOG.md`，让机器可读 mirror 和人类可读 truth 保持同轮一致。
- mirror 负责表达当前批次的验证/扩展判定，truth 负责表达当前阶段结论；不要让两者分别记录不同 scope 或不同 acceptanceTrack。
- `config/reference-projects.json` 里声明的是可人工更新的 rolling git 快照；像 `reference/lajiplugin/bibgenie-0.5.7` 这类版本号直接写在目录名里的 release/archive 快照，继续人工新建版本目录，不走 `agent:reference:update`。
- `agent:reference:update` 默认会阻断脏 worktree、非 git 目录或 origin 不匹配的目标；只有明确接受覆盖时，才用 `--allow-dirty` 或 `--replace-existing`。
- `agent:ui:design` 这条人工链只允许把 UI 设计呈现写到 Obsidian Excalidraw `.md`，不顺手改业务源码、当前 truth 或默认 `07~11` 自动概念图；真正改变执行路径，仍只改 `10-模板协作-人工指令窗口.md`。

---

## 项目配置

### 目录结构

```
my-plugin/
├── config/
│   └── addon.config.json    # 插件配置
├── src/
│   ├── main.js              # 入口文件
│   ├── app/                 # 应用层
│   ├── core/                # 核心模块
│   ├── features/            # 功能模块
│   ├── services/            # 服务模块
│   ├── utils/               # 工具模块
│   └── platform/            # 平台适配
├── types/                   # TypeScript 类型
├── docs/                    # 文档
└── scripts/                 # 构建脚本
```

### 配置说明

| 字段 | 说明 | 示例 |
|------|------|------|
| `addonId` | 插件唯一标识 | `my-plugin@example.com` |
| `addonName` | 显示名称 | `My Plugin` |
| `addonRef` | 构建目录名 | `myplugin` |
| `updateURL` | 发布更新清单地址，Zotero 7/8 安装必填 | `https://github.com/yourname/my-plugin/releases/download/release/update.json` |
| `instanceKey` | 全局实例名 | `MyPlugin` |
| `strictMinVersion` | 最低 Zotero 版本 | `7.0` |
| `strictMaxVersion` | 最高 Zotero 版本 | `8.*` |
| `prefsPrefix` | 偏好设置前缀 | `extensions.zotero.myplugin` |

---

## 核心概念

### 生命周期

```
idle → starting → running → stopping
```

框架自动管理状态转换，防止重复初始化。

### 模块组合

```javascript
// src/app/plugin.js
import { createLogger } from "../core/logger.js";
import { createPreferenceStore } from "../core/prefs.js";
import { createLifecycleManager } from "../core/lifecycle.js";
import { createMenuManager } from "../features/menu-manager.js";

export function createPlugin(options) {
  const logger = createLogger({ ... });
  const prefs = createPreferenceStore({ ... });
  const lifecycle = createLifecycleManager({ logger });
  const menu = createMenuManager({ logger, lifecycle, pluginID });

  return {
    start: async () => { /* ... */ },
    shutdown: () => lifecycle.reset()
  };
}
```

### 主题机制

- `themeMode` 公开值使用 `follow-host`、`light`、`dark`；历史 `auto` 输入仍会被接受并归一到 `follow-host`
- 需要跟随 Zotero 宿主窗口主题时，优先对窗口根节点调用 `themeManager.mountWindow(window)`
- 需要给插件自定义 HTML / XHTML surface 复用同一套主题语义时，优先对该根节点调用 `themeManager.mountElement(root)`
- 纯静态 content 页面先加载 `content/theme.js`，再在页面脚本里调用元素级 helper；模板偏好页就是最小参考实现
- 主题只治理插件自定义 UI，不直接改 Zotero 全局 Appearance

### Preference Pane 约定

- 模板默认推荐 `onPreferenceLoad(context)`，`scripts` 只保留兼容路径
- 推荐顺序固定为：`loadSubScript(content/theme.js) -> loadSubScript(content/preferences.js) -> window.initCleanroomPreferences(options?)`
- `PreferencePaneLoadContext` 固定包含 `window`、`paneID`、`pluginID`、`resolveURI(uri)`
- `addon-static/content/preferences.xhtml` 是 fragment，不保留 XML declaration
- 偏好页静态控制器只依赖 `addon-static/content/*` helper，不直接 import `src/`
- 触达偏好页控件行为、pref 写回或 `themeMode` 时，应补 `preferences.setCheckbox`、`preferences.setTextbox`、`preferences.selectMenulist` 这类 live control evidence
- 细节见 [Preference Pane Guide](./PREFERENCE_PANE_GUIDE.md)

### Standalone Window Shell

- 需要 `openDialog(...)` 管理独立窗口、详情窗口或批处理窗口时，优先使用 `src/utils/window-shell.js`
- 这层只负责 `openDialog -> ready -> focus/reuse -> cleanup`，窗口内具体 HTML / XUL / VirtualizedTable / embedded widget 仍由业务模块挂载
- 主窗口挂载仍归 `src/features/window-manager.js`；不要把主窗口生命周期和子窗口壳复用逻辑混成同一个 manager
- 相关路线与 reference 技术链见：
  - [UI Creation Paths](./UI_CREATION_PATHS.md)
  - [Reference Plugin Technical Chains](./REFERENCE_PLUGIN_TECHNICAL_CHAINS.md)

### File-backed Runtime State

- 当状态明显超出 `Prefs` 适用范围时，优先从 `src/services/file-state-store.js` 起步
- 这层负责内存 cache、文件读写 adapter、debounce save、size limit 与 schema migration envelope，不负责具体目录策略和业务裁剪规则
- 推荐让业务模块自己决定 `Zotero.DataDirectory.dir` 下的目录布局，再优先用 `src/platform/zotero-file-storage.js` 生成 `readText/writeText` adapter 注入到 store，而不是把宿主路径判断写死在模板原语里
- 如果目录和文件名已经明确，优先直接用 `src/platform/zotero-json-state-store.js` 完成一步接线；它只负责组合 `zotero-file-storage + file-state-store`，不替你决定业务 schema

```javascript
import { createZoteroJSONStateStore } from "../src/platform/zotero-json-state-store.js";

const historyStore = createZoteroJSONStateStore({
  globalScope,
  id: "history.demo",
  directorySegments: ["myplugin", "state"],
  fileName: "history.json",
  initialState: () => ({ entries: [] }),
});
```

### Task Runner Skeleton

- 需要 provider 调度、后台批处理或多类型异步任务时，优先从 `src/services/task-runner.js` 起步
- 这层负责 `descriptor` 类型分发、handler 注册、结果快照与 `run/submit` 收口，不负责 provider 目录、持久化格式或 UI 展示
- 典型用法是让业务层先产出 plain descriptor，再交给 runner 把任务送入 queue

### Task Queue Skeleton

- `src/services/task-queue.js` 继续只负责并发、优先级、重试、事件与快照
- 当你已经有 `descriptor -> handler` 层时，再把具体执行压到 queue；不要反过来让 UI 或窗口模块直接操作并发状态机
- 推荐按 `descriptor -> runner -> queue` 分层，而不是把任务状态机直接塞进面板或窗口模块

### 贴边式 Surface / Edge Mode

- 只要自定义 surface 实际贴附在 `context pane`、`item pane` 或 Reader sidebar，默认按 edge mode 处理
- 先读取 live pane bounds 或 `reader.getReaderUIStateSnapshot(target)` 提供的 `sidebarWidth` 等几何信号，不直接写死固定宽度
- stacked context pane 优先按 inner pane bounds 占位；拿不到 inner pane bounds 时再回退到外层 pane bounds
- 贴边容器应设最小可显示阈值；过窄时优先降级隐藏、延后挂载或切到非贴边布局，而不是继续硬塞内容
- tab / pane 切换后要重新解析当前宿主根并重绑 observer，不要继续盯旧的 sidebar DOM
- 验证时不要只证明“surface 出现了”；还要证明 edge-attached surface 跟随了当前 pane 几何或走了明确降级路径

### 资源清理

所有模块支持自动清理：

```javascript
// 注册清理函数
lifecycle.trackCleanup(() => {
  // 清理逻辑
});

// 插件卸载时自动调用
```

---

## 模块使用

### Logger - 日志系统

```javascript
import { createLogger } from "./core/logger.js";

const logger = createLogger({
  hostLog: (msg) => Zotero.debug(msg),
  level: "debug"  // debug | info | warn | error
});

logger.debug("调试信息", { key: "value" });
logger.info("普通信息");
logger.warn("警告");
logger.error("错误", { error: err });
```

### Prefs - 偏好设置

```javascript
import { createPreferenceStore } from "./core/prefs.js";

const prefs = createPreferenceStore({
  prefBranch: "extensions.myplugin",
  defaults: {
    enabled: true,
    count: 0,
    name: "default"
  }
});

prefs.get("enabled");           // true
prefs.set("count", 10);         // 保存
prefs.onChange((key) => {       // 监听变化
  console.log(`${key} changed`);
});
```

### Notifier - 事件通知

```javascript
import { createNotifier, EVENTS } from "./core/notifier.js";

const notifier = createNotifier({ logger, lifecycle });

// 订阅条目添加事件
notifier.subscribe(["item"], (event, type, ids) => {
  if (event === EVENTS.ADD) {
    console.log("New items:", ids);
  }
});

// 一次性订阅
notifier.once(["collection"], (event, type, ids) => {
  console.log("Collection event:", event);
});
```

### Keyboard - 快捷键

```javascript
import { createKeyboardManager } from "./core/keyboard.js";

const keyboard = createKeyboardManager({ logger, lifecycle });

keyboard.registerShortcut({
  key: "S",
  modifiers: ["ctrl", "shift"],
  handler: (event) => {
    console.log("Shortcut triggered!");
  },
  description: "Save all"
});

// 或使用字符串格式
keyboard.registerShortcut({
  shortcut: "Ctrl+Shift+S",
  handler: (event) => {}
});
```

### Menu Surfaces - 菜单场景

先按宿主 surface 选 API，不要把所有入口都混成一个“右键菜单”：

- `menu-manager` 只覆盖 Zotero `MenuManager` 官方 target，例如 `main/library/item`、`main/library/collection`、`itemPane/info/row`、`reader/menubar/view`
- Reader `createViewContextMenu` / `createAnnotationContextMenu` 不属于 `menu-manager`，而属于 `reader.registerEventListener(...)`
- 需要按应用场景回看参考项目时，先看 [Reference Plugin Menu Patterns](./REFERENCE_PLUGIN_MENU_PATTERNS.md)

```javascript
import {
  createMenuManager,
} from "./features/menu-manager.js";
import {
  createReader,
} from "./features/reader.js";

const menu = createMenuManager({ logger, lifecycle, pluginID });
const reader = createReader({ logger, lifecycle, pluginID });

// main/library/item
menu.registerItemMenuItem({
  label: "Process Selected Items",
  onCommand: (event, context) => {
    console.log("Selected items:", context.items);
  },
  onShowing: (event, context) => {
    context.setVisible(context.items?.length > 0);
  }
});

// main/library/collection
menu.registerCollectionMenuItem({
  label: "Rebuild Collection Index",
  onCommand: (event, context) => {
    console.log("Collection row:", context.collectionTreeRow);
  }
});

// itemPane/info/row
menu.registerItemPaneInfoRowMenuItem({
  id: "metadata-row-actions",
  label: "Normalize Field Value",
  onCommand: (event, context) => {
    console.log("Field name:", context.fieldName);
  }
});

// reader/menubar/view
menu.registerReaderMenubarViewMenuItem({
  label: "Toggle Context Pane",
  onCommand: () => {}
});

// Reader createViewContextMenu
reader.registerViewContextMenuItem((event) => ({
  label: `Inspect ${(event.params?.targetID || "reader-view")}`,
  onCommand: () => {}
}));

// Reader createAnnotationContextMenu
reader.registerAnnotationContextMenuItem({
  label: "Process Annotation",
  onCommand: () => {}
});
```

> 注意：当前推荐优先使用 scene helper，例如 `registerItemMenuItem()`、`registerItemPaneInfoRowMenuItem()`、`registerReaderMenubarViewMenuItem()`、`registerViewContextMenuItem()`、`registerAnnotationContextMenuItem()`。`registerContextMenuItem()`、`registerReaderMenuItem()` 与 `registerSubmenu()` 继续保留为兼容 helper。
>
> 迁移建议：
> - `registerContextMenuItem(...)` 且 target 固定为 `main/library/item` 时，直接迁到 `registerItemMenuItem(...)`
> - `registerReaderMenuItem({ target: MENU_TARGETS.READER_MENU_VIEW }, ...)` 时，直接迁到 `registerReaderMenubarViewMenuItem(...)`
> - `registerSubmenu({ target: MENU_TARGETS.LIBRARY_ITEM | LIBRARY_COLLECTION | READER_MENU_VIEW, ... })` 时，优先迁到对应的 scene submenu helper
> - 只有确实需要跨多个 `reader/menubar/*` target 复用时，再保留 `registerReaderMenuItem(...)`
> - 只有确实需要跨 target 做通用子菜单装配时，再保留 `registerSubmenu(...)`
> - `createViewContextMenu` / `createAnnotationContextMenu` 不要走 `menu-manager` 兼容 helper，应迁到 `reader.registerViewContextMenuItem()` / `reader.registerAnnotationContextMenuItem()`
>
> 动态菜单约束：
> - 只有菜单显隐 / 禁用 / submenu children 明确依赖 live host state 时，才升级到 `createMenuStateResolver()` + `registerStateDrivenMenu()`
> - collection scene 优先读 `hasCollectionSelection`、`collectionTreeRowID`、`collectionTreeRowType`，不要把 item selection 逻辑复用到 `main/library/collection`
> - `popup repair` 继续只作为 hardening fallback 索引，不是模板默认菜单主链

动态 submenu 示例：

```javascript
const resolveCollectionMenuState = createMenuStateResolver({
  prefs,
  preferenceKeys: ["feature.enabled"],
});

menu.registerStateDrivenMenu({
  id: "collection-actions",
  target: menu.MENU_TARGETS.LIBRARY_COLLECTION,
  baseMenu: {
    menuType: menu.MENU_TYPES.SUBMENU,
    label: "Collection Actions",
    menus: [{
      menuType: menu.MENU_TYPES.MENUITEM,
      label: "Placeholder",
    }],
  },
  resolveState: resolveCollectionMenuState,
  buildMenu({ state }) {
    return {
      visible: state.hasCollectionSelection,
      menus: [
        {
          menuType: menu.MENU_TYPES.MENUITEM,
          label: "Rebuild Collection Index",
          onCommand: () => {},
        },
        {
          menuType: menu.MENU_TYPES.MENUITEM,
          label: `Inspect ${state.collectionTreeRowType || "selection"}`,
          onCommand: () => {},
        },
      ],
    };
  },
});
```

### Item Pane - 条目窗格

```javascript
import { createItemPane } from "./features/item-pane.js";

const itemPane = createItemPane({ logger, lifecycle, pluginID });

// 注册自定义 Section
itemPane.registerSection({
  paneID: "my-section",
  header: {
    l10nID: "my-plugin-section-header",
    icon: "chrome://myplugin/content/icon.svg"
  },
  sidenav: {
    l10nID: "my-plugin-section-sidenav",
    icon: "chrome://myplugin/content/icon20.svg"
  },
  onRender: ({ doc, body, item }) => {
    const div = doc.createElement("div");
    div.textContent = `Item: ${item?.getField("title")}`;
    body.appendChild(div);
  }
});

// 注册 InfoRow
itemPane.registerInfoRow({
  rowID: "custom-field",
  label: { l10nID: "myplugin.custom-field" },
  position: "afterCreators",
  editable: true,
  onGetData: ({ item }) => item?.getField("callNumber") || "",
  onSetData: ({ item, value }) => {
    item.setField("callNumber", value);
    item.saveTx();
  }
});
```

> 注意：Zotero 官方 ItemPane API 要求 Section / InfoRow 标签通过 `l10nID` 提供。本项目当前建议优先直接使用 `registerSection()` / `registerInfoRow()`，便捷 helper 也要显式传 `headerL10nID` / `labelL10nID`，不要把纯字符串标签当作稳定契约。

### Item Tree - 条目列表

```javascript
import { createItemTree } from "./features/item-tree.js";

const itemTree = createItemTree({ logger, lifecycle, pluginID });

// 注册自定义列
itemTree.registerColumn({
  dataKey: "charCount",
  label: "Characters",
  dataProvider: (item) => item.getField("title").length,
  renderCell: (index, data, column, isFirstColumn, doc) => {
    const span = doc.createElement("span");
    span.textContent = data;
    span.style.color = data > 100 ? "red" : "inherit";
    return span;
  }
});

// 使用渲染器工厂
const renderer = itemTree.createDefaultCellRenderer({ color: "blue" });
```

### Reader - 阅读器

```javascript
import {
  createReader,
  READER_TYPES,
} from "./features/reader.js";

const reader = createReader({ logger });

// 获取所有阅读器
const readers = reader.getAllReaders();
const activeSummary = reader.getActiveSummary();
const uiState = reader.getReaderUIStateSnapshot(12345);
const interaction = reader.getReaderInteractionSnapshot(12345);

// 打开阅读器
await reader.openReader({
  itemID: 12345,
  openInBackground: false
});

// 获取阅读器类型
const type = reader.getReaderType(12345); // 'pdf' | 'epub' | 'snapshot'

// 注解操作
const annotations = reader.getAnnotations(attachmentID);
await reader.createAnnotation(attachmentID, {
  type: "note",
  comment: "中文批注",
  pageIndex: 0
});
await reader.updateAnnotation(annotationID, {
  comment: "更新后的说明",
  color: "#00aa88"
});
await reader.deleteAnnotation(annotationID);

reader.registerViewContextMenuItem({
  label: "Inspect Reader View",
  onCommand: () => {}
});

reader.registerAnnotationContextMenuItem({
  label: "Process Annotation",
  onCommand: () => {}
});
```

`activeSummary` 会给出当前活动 reader 的 `itemID`、`tabID`、`type` 和 `annotationCount`，适合用在命令面板、菜单项显隐和 Toast 摘要这类轻量 demo。

`uiState` 会给出更接近真实交互层的宿主状态，例如侧栏开关与宽度、工具模式、导航能力、文本选择注解模式、主/副视图状态。

`interaction` 会进一步给出批注明细、可编辑批注数量、匹配窗口状态、`uiState` 和当前 reader 是否处于活动态，适合给 agent 做“Reader 交互是否真到位”的宿主侧判断。

`createAnnotation()` 现在支持更友好的输入：即使只给 `type / comment / pageIndex`，模板也会自动补齐 `key / pageLabel / sortIndex / position`，便于 agent 和人工在控制台里快速做批注回环验证。

Reader 官方事件面也归这里管理。若目标是 `renderToolbar`、`createViewContextMenu` 或 `createAnnotationContextMenu`，优先用 `registerViewContextMenuItem()` / `registerAnnotationContextMenuItem()` 或底层 `registerEventListener(...)`，不要把 Reader 上下文菜单并进 `menu-manager`。

### Dialog - 对话框

```javascript
import { createDialogBuilder } from "./utils/dialog.js";

const dialog = createDialogBuilder({ logger, uiFactory, i18n });

// 基础对话框
await dialog.alert(window, "Title", "Message");
const confirmed = await dialog.confirm(window, "Confirm", "Continue?");
const { confirmed, value } = await dialog.prompt(window, "Input", "Enter:", "default");

// 选择对话框
const result = await dialog.select(window, "Choose", "Select:", ["A", "B", "C"], 0);

// 保存确认
const saveResult = await dialog.askSave(window, "Save?", "Save changes?");
// 返回: 'save' | 'dontsave' | 'cancel'
```

### Progress Window - 进度窗口

```javascript
import { createProgressNotifier, NOTIFICATION_TYPES } from "./utils/progress-window.js";

const progress = createProgressNotifier({ logger, i18n });

// 显示进度
const id = progress.showProgress({
  title: "Processing",
  message: "Step 1 of 3",
  progress: 0
});

progress.updateProgress(id, 50, "Step 2 of 3");
progress.closeProgress(id);

// Toast 通知
progress.showToast("Done!", NOTIFICATION_TYPES.SUCCESS, 3000);
progress.showSuccess("Success!");
progress.showError("Error!");
```

---

## 完整示例

创建一个简单的插件：

```javascript
// src/main.js
import { createPlugin } from "./app/plugin.js";
import { readRuntimeConfig } from "./app/runtime-config.js";

let plugin;

export async function bootstrapPlugin() {
  if (plugin) return;

  const config = readRuntimeConfig();
  plugin = createPlugin({ globalScope: globalThis, config });

  await plugin.start();

  globalThis.Zotero[config.instanceKey] = {
    onWindowLoad: (window) => plugin.onWindowLoad(window),
    onWindowUnload: (window) => plugin.onWindowUnload(window),
    shutdown: () => plugin.shutdown(),
    api: plugin.api,
  };
}
```

```javascript
// src/app/plugin.js
import { createLogger } from "../core/logger.js";
import { createPreferenceStore } from "../core/prefs.js";
import { createLifecycleManager } from "../core/lifecycle.js";
import { createMenuManager, MENU_TARGETS } from "../features/menu-manager.js";

export function createPlugin({ globalScope, config }) {
  const Zotero = globalScope.Zotero;

  const logger = createLogger({
    hostLog: (msg) => Zotero.debug(`[${config.addonName}] ${msg}`),
    level: "debug"
  });

  const prefs = createPreferenceStore({
    prefBranch: config.prefsPrefix,
    defaults: { enabled: true }
  });

  const lifecycle = createLifecycleManager({ logger });

  const menu = createMenuManager({
    logger,
    lifecycle,
    pluginID: config.addonId
  });

  async function start() {
    logger.info("Plugin starting...");

    // 注册菜单
    menu.registerToolsMenuItem({
      label: `${config.addonName} Settings`,
      onCommand: () => {
        Zotero.Utilities.Internal.openPreferences(config.addonRef);
      }
    });
  }

  function onWindowLoad(window) {
    logger.debug("Window loaded");
  }

  function onWindowUnload(window) {
    logger.debug("Window unloaded");
  }

  function shutdown() {
    lifecycle.reset();
    logger.info("Plugin shutdown");
  }

  return { start, onWindowLoad, onWindowUnload, shutdown };
}
```

---

## 调试技巧

### 启用调试日志

```javascript
// 在偏好设置中设置
Zotero.Prefs.set("extensions.myplugin.logLevel", "debug");
```

### 使用 Browser Toolbox

1. 打开 Zotero
2. 工具 → 开发者 → Browser Toolbox
3. 在 Console 中调试

### 查看日志

```javascript
// 在代码中
Zotero.debug("My debug message");

// 或使用框架 logger
logger.debug("Debug info", { data });
```

### 热重载开发

```bash
# 构建
npm run build

# 在 Zotero 中重新加载插件
# 工具 → 开发者 → 重新载入附加组件
```

---

## 发布流程

### 1. 更新版本

编辑 `config/addon.config.json` 更新版本号。

### 2. 构建发布包

```bash
npm run package
```

这一步会自动生成：

- `dist/myplugin-1.0.0.xpi`
- `dist/update.json`
- `dist/release-manifest.json`

`update.json` 会基于 `config/addon.config.json` 中的 `addonId`、`addonVersion`、`updateURL` 自动生成；不要再手写第二份更新清单。

如果只想手动导出一个受保护包分支，而不触碰默认 release 主线，可执行：

```bash
npm run package:encrypted
npm run package:shielded
npm run package:protection:smoke -- --variant shielded --repeats 3 --channel stable
npm run package:protection:audit
npm run package:protection:score -- --variant shielded --channel stable --webcrack "parse-fail / only-loader" --llm "high-level-architecture"
npm run package:protection:verdict
```

它会额外生成：

- `dist/myplugin-1.0.0-encrypted.xpi`
- `dist/myplugin-1.0.0-shielded.xpi`

补充说明：

- `package:encrypted` 默认不写 `dist/update.json` 或 `dist/release-manifest.json`
- `package:shielded` 默认不写 `dist/update.json` 或 `dist/release-manifest.json`
- `package:protection:smoke` 只生成 advisory 实验报告，不进入默认 release gate
- `package:protection:audit` 只做 raw export 语义泄露审计，用于判断下一轮 hardening 应优先 trim 哪一层
- `package:protection:score` 只回填 `shielded stable` 的手工评分，不触发重跑
- `package:protection:verdict` 只生成 advisory 结论，不进入默认 release gate
- 这些分支的定位都是“提高随手解包和直读源码门槛”，不是“客户端密钥不落地”的强安全方案

### 3. 先生成上传计划壳，再手动上传

先运行：

```bash
npm run release:upload -- --provider github-release --release-tag v1.0.0 --target-base-url https://github.com/<owner>/<repo>/releases/download/v1.0.0/
```

这一步只会校验本地 `.xpi` / `update.json` / `release-manifest.json` / `release-preflight.json` 是否自洽，并生成：

- `dist/release-upload-plan.json`
- `dist/release-upload-plan.md`

它不会执行真实上传。确认计划无误后，再把 `dist/myplugin-1.0.0.xpi` 与 `dist/update.json` 一起上传到你的 Release 资产或静态分发地址。

### 4. 远端校验

```bash
npm run release:preflight -- --verify-remote
```

这一步会检查远端 `update.json` 是否可访问、是否包含当前 `addonId` 的首条更新记录，以及其中的 `update_link` 是否与本地发布产物一致。当前 `release:preflight` 还会把 China Commercial Delivery Gate 作为 release-only 严格门禁，校验 `CODE_PROVENANCE.md`、`THIRD_PARTY_NOTICES.md` 与 `COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md` 是否就绪。

### 5. 发布到 GitHub / 自定义发布端

以 GitHub Release 为例：

```bash
gh release create v1.0.0 dist/myplugin-1.0.0.xpi dist/update.json
```

远端上传完成后，再执行：

```bash
npm run release:prepare
npm run release:matrix
```

用于刷新 release-facing 摘要与 gate 消费链。

### 6. `update.json` 示例

自动生成出来的 `update.json` 结构如下：

```json
{
  "addons": {
    "my-plugin@example.com": {
      "updates": [
        {
          "version": "1.0.0",
          "update_link": "https://github.com/you/myplugin/releases/download/v1.0.0/myplugin-1.0.0.xpi",
          "applications": {
            "zotero": {
              "strict_min_version": "6.999"
            }
          }
        }
      ]
    }
  }
}
```

---

## 常见问题

### Q: 插件加载失败？

检查 `addon.config.json` 中的 `addonId` 是否正确。

### Q: 菜单不显示？

确保使用正确的 `MENU_TARGETS`，并在 `onShowing` 中设置可见性。

### Q: 类型提示不工作？

确保 IDE 使用 `types/` 目录中的类型定义。

### Q: 如何添加本地化？

1. 在 `addon-static/locale/<locale>/main.ftl` 中新增或修改消息键，至少同步维护 `en-US`、`zh-CN`、`zh-TW`
2. 官方注册面优先使用 `l10nID`，例如 ItemPane / 菜单 / 偏好设置面板等宿主契约点
3. 修改后执行 `npm run verify`；如果改动影响宿主 UI，再补跑 `npm run agent:zotero:e2e`

---

## 更多资源

- [API 参考](API.md)
- [架构说明](ARCHITECTURE.md)
- [Zotero 官方文档](https://www.zotero.org/support/dev/)
