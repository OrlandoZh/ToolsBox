# Codex Computer Use Validation

本文档定义一条可选的 Codex Computer Use 真机验证支线。

它不是默认主线，不替代 `watch -> e2e -> monitor -> gate`，也不改变 `agent:gate` 语义。

## Contract

- Registry: `config/codex-computer-use-validation.json`
- Default: disabled
- Gate effect: non-blocking
- Activation: only after an explicit user request
- Artifact: `dist/agent-computer-use-validation.json` / `dist/agent-computer-use-validation.md`

## When To Use

只在用户明确要求“用 Codex Computer Use / 真机桌面 / 真实 UI 看一下”时启动。

适合场景：

- 已有 `agent:zotero:e2e` 或 `zotero:scenario` 结论，但需要真人视角确认某个真实可见 surface。
- 某个 `visual-recommended` 批次希望补一份桌面级观察证据。
- 需要确认 Zotero 主窗口、偏好设置面板、Reader、菜单项或独立窗口在真实桌面上的可见状态。

不适合场景：

- 代替 `npm run check`、`agent:zotero:e2e`、`agent:monitor` 或 `agent:gate`。
- 默认在每轮开发或 gate 中自动打开桌面。
- 作为通用宏录制器、任意按钮点击器或任意 GUI 自动化入口。
- 直接改源码、刷新 baseline、修改 current truth，或替代已有白名单 patch/autofix。

## Commands

查看默认关闭的计划：

```bash
npm run agent:computer-use:plan
```

查看当前必补项和条件触发项：

```bash
npm run agent:computer-use:list
```

若当前触发了很多 `surface-local` 候选，plain-text `list` 默认只展示前 `3` 个，并附带隐藏数量与重跑提示。需要完整展开时可执行：

```bash
npm run agent:computer-use:list -- --show-all-surfaces
```

若只想聚焦单个 surface 的可选 CU 会话，可执行：

```bash
npm run agent:computer-use:list -- --surface cleanroom-preferences-pane
```

为默认必补批次准备一次独立会话：

```bash
npm run agent:computer-use:prepare
```

为“必补项 + 当前已触发的条件项”一次性准备独立会话：

```bash
npm run agent:computer-use:prepare -- --all-triggered
```

用户明确要求后启动一次手动验证会话：

```bash
npm run agent:computer-use:validate -- --user-requested --target "preference pane visible smoke"
```

完成 Computer Use 桌面观察后记录结果：

```bash
npm run agent:computer-use:record -- --verdict pass --summary "Preference pane opened and target controls were visible." --proof-kind surface-local-visible-smoke --entry-route-observed "Preferences pane" --runtime-instance-match matched --runtime-instance-evidence "Observed window matched the intended project runtime."
```

检查支线 contract：

```bash
node scripts/agent-computer-use-validation.mjs inspect
```

## Flow

1. 先读 `docs/CURRENT_BACKLOG.md` 和最新 `agent-monitor / agent-gate / agent-zotero-e2e` 工件，确定最小可见目标。
2. 只有用户明确要求时，运行 `npm run agent:computer-use:validate -- --user-requested` 建立会话工件。
3. Controller 再使用 Codex 桌面 Computer Use 工具检查真实 UI。
4. 结束后用 `record` 写入 `pass / fail / partial`、证据、风险、blocker 与 next action。
5. 若结果需要升级为 contract 或 current truth，必须由 controller 另行更新 `docs/CURRENT_BACKLOG.md` 与对应 mirror；本支线不会自动提升。

## Result Proof Scope

- `prepare` 生成的单目标工件现在会携带该目标的 `proofContract`，说明本次会话默认在证明什么，以及允许记录哪些 proof kind。
- `prepare` 的会话输出现在还会给出 `recordGuidance`：默认 `record` 命令会预填该 workflow 的默认 `--proof-kind`，若允许更强 proof，还会附带升级版命令模板、caution，以及对应 proof 的 `non-claims`。
- `list` 输出现在也会先展示每个 workflow 的默认 `proof kind`、`proof scope` 与 `default non-claims`，避免必须打开单个 artifact 才知道这条 CU 结果不证明什么。
- `list` / `prepare` 现在还会显示 `runtime-preflight`，并在发现 `other same-bundle Zotero process(es)` 或多个匹配 runtime 进程时直接把该 workflow 标成 `blocked`；这类会话在当前 Computer Use 能力下不能可靠绑定到目标实例，不应正式启动。
- `record` 若没有显式传 `--proof-kind`，会优先落 `proofContract.defaultKind`；如果当前会话没有 workflow context，才回退到 `manual-visible-check`。
- 当前固定 proof kind：
  - `internal-trigger-window-lifecycle`
  - `host-visible-entry-window-lifecycle`
  - `surface-local-visible-smoke`
  - `local-install-visible-surface`
  - `manual-visible-check`
- `review workbench` 默认只记 `internal-trigger-window-lifecycle`；只有真实观察并使用了 Prompt / menu / shortcut 这类人类可达入口时，才允许升级成 `host-visible-entry-window-lifecycle`。
- `surface-local` 固定只记 `surface-local-visible-smoke`；它证明目标 host-visible surface 可见，不证明别的入口、别的 surface 或整窗布局都正确。
- `release-install-local` 固定只记 `local-install-visible-surface`；它证明本地安装态和至少一个可见 surface，不证明远端 `updateURL / update_link`。
- `proofContract` 与 `result.proof` 现在还会显式写 `nonClaims`，用于声明“本次结果不能据此声称什么”。
- `record` 可选附带：
  - `--proof-kind <kind>`
  - `--entry-route-observed "<observed route>"`
  - `--host-visible-entry-observed`
  - `--no-host-visible-entry-observed`
  - `--runtime-instance-match <matched|mismatched|unknown>`
  - `--runtime-instance-evidence "<how the observed window was tied to the target runtime>"`
- 若记录 `host-visible-entry-window-lifecycle`，必须同时提供真实人类入口路径：至少要有 `--host-visible-entry-observed` 与 `--entry-route-observed "<Prompt|menu|shortcut>"`。
- 若当前 workflow 的 `launchRuntime.desktopInstanceMatchRequired=true`，要把 `pass` 记录成真通过，必须同时记录 `--runtime-instance-match matched` 与 `--runtime-instance-evidence "..."`；若发现 Codex Computer Use 看的是另一份 Zotero runtime，或根本无法确认当前窗口属于目标 runtime，只能记 `partial` 或 `fail`。
- artifact 的 `result.proof` 会把 proof kind、proof summary、是否真实观察到 host-visible entry，以及实际观察到的入口路径单独写出，避免只看 `pass` 就误读范围。
- artifact 的 `result.proof` 现在还会写 `runtimeInstanceMatch` / `runtimeInstanceEvidence`，用于防止“同 bundle 多个 Zotero 实例同时存在时，Computer Use 绑定到错误实例”却仍然误记为通过。

## Runtime Semantics

- `npm run zotero:dev` 在这条支线里默认使用项目自己的 `.zotero-runtime/dev/{profile,data}`。
- 这意味着它和个人日常 Zotero profile 隔离，但默认是复用态，不是一次性 fresh/disposable profile。
- 因此 `review workbench` 与 `surface-local` 这两类 Computer Use 结果，默认只用于确认“当前项目 runtime 下的真实可见面是否成立”，不用于证明 first-run、fresh install、空白 profile 或历史状态完全无污染。
- 如果本轮问题本身怀疑被历史窗口、历史数据库、旧偏好或其他项目 runtime 残留污染，就不要继续依赖 `zotero:dev`；应切换到 disposable profile 路径重跑，优先使用本地安装态复核批次，或显式准备新的隔离 runtime。
- Codex Computer Use 目前只能按应用 bundle 观察桌面，不能直接按 `profilePath` 或 PID 选中某个 Zotero 实例。
- 如果系统里同时开着多个同 bundle Zotero 进程，当前 Computer Use 不能可靠按 `profilePath` 或 PID 选中目标实例；`list` / `prepare` 应先把 workflow 标成 `blocked`，待其他同 bundle 实例关闭后再正式启动。
- 对 `review workbench` / `surface-local`，这通常意味着先确认当前只剩目标项目 runtime，或给出清楚的匹配证据；对 `release-install-local`，这意味着必须把可见面明确绑定到 `release-install` 那个 disposable profile，而不是别的项目或日常窗口。

## Workflow Batches

- 默认必补批次固定为 `review workbench standalone window visible smoke`
  - 前置命令固定为 `npm run check`
  - 然后执行 `npm run zotero:scenario -- --scenario "agent review workbench window lifecycle"`
  - 桌面接管入口固定为 `npm run zotero:dev`
  - 该入口默认连接项目隔离但复用的 `.zotero-runtime/dev/`，只验证当前项目 runtime 的 host-visible 语义
  - 触发语义固定为“真实 host-visible 入口优先；若当前 runtime 只暴露 plugin-local fallback command，则允许 controller 用最小内部触发拉起窗口，再让 Computer Use 只验证独立窗口的 open / reuse / close 可见语义”
  - 不得把 `commandPalette` 注册成功、fallback 搜索命中或 `executeCommand()` 可执行，直接表述成 Zotero Prompt / command palette 已对人类可达
- 条件触发批次一固定为本地安装态复核
  - `npm run agent:computer-use:list -- --release-handoff` 或显式 `prepare release-install-local` 会把它标成 triggered
  - 桌面接管入口固定为 `npm run release:install-smoke:stable -- --keep-open`，需要 beta 时改为 `:beta`
  - 只有 profile/dataDir 位于项目 `.zotero-runtime/` 下的 disposable profile 时才允许落地
- 条件触发批次二固定为被重新打开的 host-visible surface
  - 默认通过 `git status` 命中的 `ownerPaths` 与最新失败的 `zotero-scenario-last-run.json` 自动触发
  - 若 current truth 明确重开某个 surface，但当前没有 fresh 路径命中，可显式执行 `npm run agent:computer-use:prepare -- surface-local --surface <surface-id>`
  - plain-text `list` 默认会截断过多的 `surface-local` 候选；若带 `--surface <surface-id>`，列表和 prepare 选择都会聚焦到该 surface，而不是继续把其他 triggered surface 一起列出
  - 桌面接管入口固定为 `npm run zotero:dev`

## Default-Off Guardrails

- `check`、`agent:gate`、`agent:gate:release`、`agent:zotero:e2e`、`agent:zotero:loop` 与 `agent:pipeline` 不得调用这条支线。
- `run` 命令缺少 `--user-requested` 时必须失败。
- 输出只能作为 optional evidence；默认不新增 blocker，不改变 release gate。
- Computer Use 操作应限定在本次 `--target`，完成后必须回写结构化结果。
- `prepare` 会为每个目标创建独立目录，默认格式固定为 `/tmp/codex-cu/<YYYYMMDD-HHMMSS>-<target-slug>`，避免多个目标互相覆盖同一份 `agent-computer-use-validation` 工件。
- 通过 `prepare` 生成的单目标工件会额外记录该目标的 workflow context，例如 `workflowId`、`triggerRoute`、`launchRuntime`、`observationSteps` 与 `acceptanceCriteria`，避免后续只看 `target` 文本就误读本次 verdict 在证明什么。
- `record` 写回结果时会进一步把 `result.proof` 单独结构化，防止把 fallback/internal trigger、surface-local smoke 或 local install smoke 误写成更强的 host-visible / release 闭环结论。
- 若 workflow 声明了 `launchRuntime.desktopInstanceMatchRequired=true`，`record` 还会阻止“未确认 runtime 实例一致性”的 `pass`，避免把错误的 Zotero 窗口记成这次目标 runtime 的真机通过。
- 若 workflow 在 `prepare` 时已经因同 bundle 多实例或多匹配 runtime 被标成 `blocked`，应先清理冲突实例，再重新 `prepare`；不要在阻塞态下继续做正式会话。
- 若设置了 `AGENT_ARTIFACTS_DIR`，这条支线自己的输出会写到自定义目录；但 upstream `monitor / gate / e2e` 预读会优先读自定义目录，缺失时回退到项目 `dist/`，避免隔离输出时把 preflight context 一起切空。
- 若会话入口是 `npm run zotero:dev`，必须把结果解释为“项目隔离 runtime 下的桌面观察”；除非另有 disposable/fresh 证据，不得把它表述成全新安装态、全新 profile 或无历史状态污染。
- 若当前 runtime 缺少 `Zotero.Prompt.register` 这类真实宿主 Prompt 入口，`agent.reviewWorkbench.open` 可能只会以 plugin-local fallback command 暴露；这种情况下，Computer Use 的职责是补桌面可见层证据，而不是替命令注册伪造一条“人类入口已通过”的结论。
