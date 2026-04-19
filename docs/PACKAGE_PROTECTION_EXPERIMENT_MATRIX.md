# Package Protection Experiment Matrix

> 用途：把受保护打包这条线里已经存在的 `smoke / perf / audit / webcrack / compare / preflight / verdict` 工件收成一份固定矩阵，避免每次人工横向拼接。
> 范围：这是实验汇总入口，不是 current truth；它不改默认 `release` / `agent:gate` / `agent:gate:release`。
> 更新时间：2026-04-19

## 命令入口

```bash
npm run package:protection:matrix
```

如果只想看攻击证据而不混入 perf / surface / promotion gate，再配合运行：

```bash
npm run package:protection:attack
npm run package:protection:attack:plan
npm run package:protection:review
```

输出工件：

- `dist/package-protection-matrix.json`
- `dist/package-protection-matrix.md`
- `dist/package-protection-attack-report.json`
- `dist/package-protection-attack-report.md`
- `dist/package-protection-guided-attack-plan.json`
- `dist/package-protection-guided-attack-plan.md`
- `dist/package-protection-retained-review.json`
- `dist/package-protection-retained-review.md`

## 依赖来源

矩阵和 attack report 都不重跑实验，只回读当前已有工件：

- `dist/package-protection-smoke.json`
- `dist/package-protection-performance.json`
- `dist/package-protection-anchor-audit.json`
- `dist/package-protection-verdict.json`
- `dist/package-protection-compare/*.json`
- `dist/package-protection-guided-attack/*.json`
- `dist/package-protection-webcrack/*.json`
- `dist/package-protection-jsconfuser-preflight.json`
- `dist/package-protection-lightweight-preflight.json`
- `config/package-protection-candidates.json`

因此矩阵是“收口层”，不是“执行层”。

其中 attack report 当前固定额外回答两件事：

- 是否已经覆盖 `singlePassAutomation`
- 是否已经覆盖固定 `guidedA2M3` 强档画像

`package:protection:attack:plan` 当前则只做一件事：

- 把这些 fixed-profile gap 翻译成 controller 下一步要执行的补证据命令模板，且固定优先 `current` 候选，再谈 retained experiment review
- 当 `current` 缺口已经补齐时，再对 retained experiment review queue 做固定排序；当前排序口径固定为 `compare status / decision -> unpacked support surface 收缩 -> xpi / prepare / decode 成本`

`package:protection:review` 当前则只做一件事：

- 把 retained review queue 的 top candidate、对应 compare 结论和 matrix 建议收成单独 advisory 工件，固定回答“当前应继续保留哪个 retained candidate、为什么”

矩阵对 `shielded-surface-scrub` 当前还会直接暴露 residual surface floor 信号：

- `residualFloorReached=yes`
- `residualExposedFiles=manifest.json`
- `residualAnchorIds=addon-version-literal, update-url-literal`

这表示当前低风险 `surface-scrub` 路线已经把 unpacked 静态暴露压到现阶段的 `manifest` 兼容性下限，而不是仍有一批可继续直接 scrub 的 package-boundary 文件未处理。

矩阵当前会继续消费这两条固定覆盖线：

- `current` 候选如果 attack report 仍显示 fixed-profile gap，矩阵里的 `recommendedAction` 会优先提示补证据，而不是继续沿用 registry 里的长期 `promotionGate`
- 因此像 `encrypted` 这类“路线可保留、但更强画像尚未补齐”的候选，矩阵会显示 `collect-a2-m3-guided-evidence`，而不是直接显示 `keep-low-overhead-baseline`
- `experiment` 候选如果已经到 `passed / hardening-win`，但 `compare` 仍缺对称 `single-pass LLM` 证据，矩阵会明确显示 `collect-llm-symmetry-evidence`，而不是直接显示 `promote-experimental-candidate`
- 此时 `package:protection:attack:plan` 会把它们翻译成 `collect-experimental-llm-symmetry-evidence` 任务，`package:protection:review` 则继续保留 retained 排序，但状态会停在 `attention`

## 当前读法

矩阵固定把候选分成六类：

- `control`
- `current`
- `experiment`
- `preflight`
- `future`
- `paper / preplan`

当前推荐读法固定为：

1. 先看 `current`
   这里只回答当前 `encrypted / shielded` 是否还可用、是否继续保持主推荐。
2. 再看 `experiment`
   这里只回答实验变体是否已经形成真正的 promotion candidate，还是仍停留在 `runtime-only` / `leaning-same`。
3. 再看 `preflight`
   这里只回答外部工具路线是否值得进入下一轮真实 XPI A/B。
4. 最后看 `future / paper / preplan`
   这里只保留路线台账，不把 design-only 候选误写成已验证能力。

## 当前固定含义

- `plain`
  控制组，不把它的自动评分 `attention` 误判成当前保护路线失败。
- `encrypted`
  低开销受保护基线。
- `shielded`
  当前更强的手动 protected 分支，继续保持 `loader-lite`。
- `shielded-descriptor-bind`
  当前只保留为 `runtime-only`。
- `shielded-jsconfuser-string`
  当前仍是 `leaning-same / stop-current-candidate`。
- `shielded-pref-bridge`
  当前已提升为优先保留的低风险静态 support-surface hardening 候选；它继续保持 advisory-only，不直接替代默认 `shielded`，后续只在继续压缩 unpacked support surface 时再考虑升格。
- `shielded-surface-scrub`
  当前已升格为优先保留的低风险静态 surface hardening 候选；已验证其在保持 `shielded` 级别自动化阻力的同时，继续降低 unpacked support surface。
  - 当前 retained review queue 顺位：`shielded-surface-scrub -> shielded-pref-bridge`
- `shielded-surface-scrub-wasm-digest`
  当前已完成完整证据链，并固定保留为 `retained-experiment-candidate`。
  - 当前 `compare = passed / hardening-win`
  - 当前 `guidedA2M3 = covered`
  - 当前新增静态暴露仍受限于 `content/lib/w/*`
  - 当前 retained review queue 顺位：`shielded-surface-scrub -> shielded-pref-bridge -> shielded-surface-scrub-wasm-digest`
  - 当前不应把它误读成新的 top retained candidate；它证明的是 bounded Wasm lane 可行，不是更优 static hardening
- `jsconfuser-astscrambler-preflight`
  当前没有证明语义压缩收益足够大。
- `lightweight-wrapper-preflight`
  当前只能继续按 wrapper / fork 候选处理。
- `obfuscator-pro-selective-vm-paper`
  只保留 paper-eval。
- `route4-control-plane-preplan`
  只保留 preplan。

## 使用边界

- 矩阵只能汇总已存在证据，不能替代 fresh smoke。
- 矩阵可以帮助回答“下一步优先做哪条候选”，但不能直接替代 `verdict`。
- 当 `current` 证据缺失时，先补 `smoke / score / verdict`，不要先扩实验面。
