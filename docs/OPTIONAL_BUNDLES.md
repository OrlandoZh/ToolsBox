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
- Purpose: product-neutral standalone example window plus a host-mounted surface bridge that show how a downstream project can add React/TS without dragging React into the template core path.
- Contract:
  - source entries and shared bridge helpers live under `src/react-ui/`
  - `demo-window` keeps its host shell under `addon-static/content/react-ui/`
  - `surface-bridge` exposes a global renderer bridge for `loadSubScript + mount/update/unmount`
  - build dependencies (`esbuild`, `react`, `react-dom`) are declared in `package.json` / pure-project export as optional-lane devDependencies
  - build output is produced only by `npm run build:react-ui`
  - JS core can keep host lifecycle and geometry in plain JS while the optional TS lane owns only the mounted React tree
  - downstream projects can replace the example component tree but should keep the bridge contract and current-truth / validation governance intact

Current implemented artifacts:

- `demo-window`
  - kind: `window-shell`
  - purpose: checked-in XHTML standalone window example
- `surface-bridge`
  - kind: `surface-bridge`
  - purpose: host-mounted renderer bridge example backed by `__CleanroomTemplateReactSurface__`
  - live demo: when the bundle is enabled, the existing `item pane section` appends a product-neutral React surface to prove real host mount/update/unmount

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

## Rules

- Do not enable an optional bundle by default just because the template can build it.
- Do not mix TS-only lanes back into the JS core without an explicit wave and registry update.
- If a bundle changes current validation expectations or active wave scope, update `docs/CURRENT_BACKLOG.md`, `config/project-expansion-wave.json`, and `config/project-validation-overrides.json` in the same round.
