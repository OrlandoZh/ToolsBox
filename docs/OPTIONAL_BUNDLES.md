# Optional Bundles

`config/optional-bundles.json` is the single checked-in registry for template-level optional lanes.

## Goals

- Keep the JS core stable and dependency-light.
- Put heavier UI or orchestration stacks behind explicit opt-in lanes.
- Make bundle state machine visible to build, verify, export, and host-action wiring.

## Current lanes

### `react-ui`

- Lane: `ts-isolated`
- Status: `implemented`
- Default: disabled
- Purpose: host-mounted surface bridge that shows how a downstream project can add React/TS without dragging React into the template core path.
- Contract:
  - source entries and shared bridge helpers live under `src/react-ui/`
  - `surface-bridge` exposes a global renderer bridge for `loadSubScript + mount/update/unmount`
  - build dependencies (`esbuild`, `react`, `react-dom`) are declared in `package.json` / pure-project export as optional-lane devDependencies
  - build output is produced only by `npm run build:react-ui`
  - built JS/CSS assets are grouped under `content/lib/r/`
  - JS core can keep host lifecycle and geometry in plain JS while the optional TS lane owns only the mounted React tree
  - downstream projects can replace the mounted component tree but should keep the bridge contract and current-truth / validation governance intact

Current implemented artifacts:

- `surface-bridge`
  - kind: `surface-bridge`
  - purpose: host-mounted renderer bridge backed by `__CleanroomTemplateReactSurface__`

Indexed reference:

- AIAssistant-specific docked/floating/standalone product lessons live in `docs/REFERENCE_AIASSISTANT_REACT_PANEL_PATTERNS.md`

### `agent-runtime`

- Lane: `ts-isolated`
- Status: `planned`
- Default: disabled
- Current scope: spec only
- Context governance requirements:
  - keep controller stable prefix and dynamic task tail separate
  - worker prompts must stay scope-bounded and compact
  - runtime context should prefer compact truth/action/status/evidence refs over raw artifact dumps
  - provider-specific behavior must stay behind adapters instead of leaking into orchestration contracts

### `ai-service`

- Lane: `js-core`
- Status: `planned`
- Default: disabled
- Current scope: spec only
- Service governance requirements:
  - provider catalog, prompt routing, and credential handling stay reusable without React
  - missing provider keys degrade to advisory status unless the active batch explicitly validates that provider loop
  - prompt preparation and provider transport stay separate so downstream projects can swap one without rewriting both

### `wasm-kernel`

- Lane: `js-core`
- Status: `planned`
- Default: disabled
- Current scope: probe-backed registry lane with bundle-local digest plus shadow host-unlock derivation
- Current contract:
  - checked-in probe assets stay under `addon-static/content/lib/w/`
  - main-thread probe uses `rootURI + content/lib/w/...`
  - worker probe uses `chrome://<addonRef>/content/lib/w/...` and passes `chrome://<addonRef>/content/lib/w/...` into the worker
  - the checked-in `probe.wasm` now exports `add / seed / mix / finalize`, so the lane has a real deterministic digest primitive and a shadow host-unlock derivation path in addition to the original add() probe
  - current host entries are `runtime.probeWasmKernel`、`runtime.deriveWasmKernelDigest` 与 `runtime.deriveWasmKernelUnlockToken`；三者都保持 bundle-local，不进入 default startup，并只在首次调用时惰性创建 Wasm runtime
  - registry validation contract currently checks the checked-in `.wasm` / worker assets plus the JS wrapper files through `npm run verify`
  - bundle-local smoke now runs through `npm run wasm:kernel:smoke`, repeating the single Zotero scenario, archiving per-run timing/results, and only trusting fresh `zotero-scenario-last-run` artifacts when the child process exits `0`
  - probe-level cost quantification is now collected through `npm run wasm:kernel:perf`; probe keeps the compatibility aliases `dist/wasm-kernel-smoke.json` / `dist/wasm-kernel-performance.json`, digest writes alongside them as `dist/wasm-kernel-digest-smoke.json` / `dist/wasm-kernel-digest-performance.json`, and the script will prefer the scenario-matched smoke artifact before falling back to `dist/agent-zotero-e2e.json` / `dist/zotero-scenario-last-run.json`; `wasm kernel unlock diagnostics` currently follows the generic scenario artifact path and remains outside the fixed matrix
  - default-disabled inertness now has a dedicated report entrypoint: `npm run wasm:kernel:disabled-contract` will read registry/package/build/export/lazy-startup/smoke evidence and emit a standalone advisory report; probe keeps the compatibility alias `dist/wasm-kernel-disabled-contract.json`, while digest writes alongside it as `dist/wasm-kernel-digest-disabled-contract.json`
  - matrix aggregation now has a dedicated entrypoint: `npm run wasm:kernel:matrix` reads probe/digest smoke/perf/disabled-contract artifacts and emits `dist/wasm-kernel-matrix.json` / `md` as the fixed controller-facing evidence summary
- Current blockers before `implemented`:
  - matrix entrypoint已补齐，但它只负责把 `planned + default-disabled` 的 bundle-local 证据收成固定入口，不自动把 lane 升成 `implemented`
  - 当前 lane 现为 `probe + digest + shadow unlock derivation`，但还不是更宽的已实现 Wasm bundle
  - 若要改成 `implemented`，仍需 controller 单独开启 promotion wave，而不是直接沿当前 advisory matrix 自动升级

## Rules

- Do not enable an optional bundle by default just because the template can build it.
- Do not mix TS-only lanes back into the JS core without an explicit wave and registry update.
- If a bundle changes current validation expectations or active wave scope, update `docs/CURRENT_BACKLOG.md`, `config/project-expansion-wave.json`, and `config/project-validation-overrides.json` in the same round.
