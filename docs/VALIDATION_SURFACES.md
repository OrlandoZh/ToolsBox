# Validation Surfaces

> Generated from `config/validation-surfaces.json`. Edit the registry and run `npm run docs:sync-validation-surfaces`.

- Summary: Template-level host-visible surface contract. Real host-visible surfaces should pass surface smoke before visual baselines or whole-window screenshots are treated as authoritative.
- Documentation-only maturity labels such as `behavior-ready` / `interaction-proved` / `manual-confirmed` are defined in [UI Validation Paths](./UI_VALIDATION_PATHS.md); they do not change blocking verdicts by themselves.

## Contract Surfaces

### `preference-pane`

- Version: `1`
- Kind: `preference-pane`
- Summary: A Zotero preference pane registered through the host preference pane API, reachable from the preferences sidebar, and able to prove live control writeback when the change touches pane behavior.
- Supports Visual Evidence: `true`
- Entry Matchers:
  - `^src/features/preference-panes(?:/|\.|$)`
  - `^dev/agent-runtime/host-action-catalog(?:/|\.|$)`
  - `^dev/agent-runtime/host-actions(?:/|\.|$)`
  - `^src/app/feature-composer(?:/|\.|$)`
  - `^addon-static/content/.*preferences.*\.xhtml$`
- Host Semantic Domains:
  - `preference-panes`
- Required Host Assertions:
  - The preference pane is registered through the host preference pane API.
  - The preference pane can be opened from the preferences sidebar.
  - The pane fragment is mounted and structurally observable after it is opened.
  - The pane exposes interactive controls, preference bindings, or load/localization bridge signals.
  - If the change touches preference control behavior, pref writeback, or theme mode, at least one live control interaction proves control state plus pref writeback.
- Non-Goals:
  - Whole-window screenshots without proving the pane was opened.
  - Treating `preferences.openPane` smoke alone as sufficient proof for control writeback or theme mode behavior changes.
  - Non-visible settings/schema changes that do not alter the preference pane surface.

### `context-pane`

- Version: `1`
- Kind: `context-pane`
- Summary: A Zotero context pane surface that can be toggled from a reader-side integration, using the host's context pane terminology and, when edge-attached, following live pane geometry instead of a fixed width.
- Supports Visual Evidence: `true`
- Entry Matchers:
  - `^src/features/reader(?:/|\.|$)`
  - `^src/features/reader-chat(?:/|\.|$)`
  - `^src/features/reader-ui-surface(?:/|\.|$)`
- Host Semantic Domains:
  - `reader-events`
- Required Host Assertions:
  - A reader-side trigger can toggle the context pane.
  - The context pane becomes visible after the trigger runs.
  - The opened context pane exposes root or sidenav structure, not just a collapsed-state change.
  - The context pane content or navigation signals are ready, not just registered or initialized.
  - If an edge-attached surface is mounted inside the context pane, it follows the live pane bounds or explicitly degrades when the pane is too narrow.
  - The live host button action can be replayed and the post-action result is observable.
- Non-Goals:
  - Treating a trigger registration alone as proof that the context pane works.
  - Using a whole-window screenshot as the only evidence when the context pane content is empty.
  - Treating a hard-coded pane width as sufficient across stacked and non-stacked layouts.

### `item-pane-sidenav`

- Version: `1`
- Kind: `item-pane-sidenav`
- Summary: A Zotero Item Pane sidenav surface that switches a real pane button and confirms the target pane becomes visible.
- Supports Visual Evidence: `true`
- Entry Matchers:
  - `^dev/agent-runtime/host-action-catalog(?:/|\.|$)`
  - `^dev/agent-runtime/host-actions(?:/|\.|$)`
  - `^src/features/item-pane(?:/|\.|$)`
  - `^src/platform/zotero-host(?:/|\.|$)`
- Host Semantic Domains:
  - `item-pane`
- Required Host Assertions:
  - The target Item Pane button or pane ID is aligned with the host Item Pane container.
  - The selected Item Pane pane becomes visible after the sidenav switch.
  - The selected Item Pane pane is mounted with observable structure or content.
  - A surface-local evidence target can be returned for the selected Item Pane pane.
  - The live host button action can be replayed and the post-action result is observable.
- Non-Goals:
  - Treating ItemPane registration alone as proof that the pane is reachable from the live sidenav.
  - Using whole-window screenshots before proving the target pane is actually selected.

### `annotation-context-menu`

- Version: `1`
- Kind: `annotation-context-menu`
- Summary: A reader annotation context menu surface aligned with Zotero's createAnnotationContextMenu terminology.
- Supports Visual Evidence: `true`
- Entry Matchers:
  - `^src/features/annotation-ai(?:/|\.|$)`
  - `^src/features/reader(?:/|\.|$)`
- Host Semantic Domains:
  - `reader-events`
  - `menu-manager`
- Required Host Assertions:
  - The host reaches a real annotation selection scenario.
  - The annotation context menu item becomes visible in the reader.
  - The menu item can be triggered from the live host menu, not just from listener registration.
- Non-Goals:
  - Equating listener registration with a visible annotation context menu.
  - Generic reader screenshots that do not show the menu surface.

### `render-toolbar`

- Version: `1`
- Kind: `render-toolbar`
- Summary: A reader UI surface aligned with Zotero Reader's renderToolbar event type.
- Supports Visual Evidence: `true`
- Entry Matchers:
  - `^src/features/reader(?:/|\.|$)`
  - `^src/features/reader-chat(?:/|\.|$)`
- Host Semantic Domains:
  - `reader-events`
- Required Host Assertions:
  - The renderToolbar integration is registered in the expected reader host location.
  - The injected toolbar UI becomes visible when the reader toolbar is rendered.
  - The injected toolbar UI triggers the intended follow-up surface or action.
  - The live host button action can be replayed and the post-action result is observable.
- Non-Goals:
  - Assuming a renderToolbar callback exists means the injected UI is visible to users.
  - Using visual drift counts before confirming the toolbar UI exists in the host.

### `menu-item`

- Version: `1`
- Kind: `menu-item`
- Summary: A host-visible menu item aligned with Zotero menu targets and MenuData.menuType terminology.
- Supports Visual Evidence: `true`
- Entry Matchers:
  - `^src/features/menu-manager(?:/|\.|$)`
- Host Semantic Domains:
  - `menu-manager`
- Required Host Assertions:
  - The menu item is registered against the expected host menu target.
  - The menu item becomes visible when the live host menu is shown.
  - The menu item is actionable in the live host popup, not hidden or disabled.
  - The menu item triggers the intended command or follow-up surface.
  - The live host menu action can be replayed and the post-action result is observable.
- Non-Goals:
  - Assuming menu registration alone means the menu item is visible to users.
  - Using generic screenshots before confirming the live host menu contains the item.

### `collection-menu`

- Version: `1`
- Kind: `collection-menu`
- Summary: A host-visible collection menu action aligned with Zotero collection selection semantics and main/library/collection target behavior.
- Supports Visual Evidence: `true`
- Entry Matchers:
  - `^dev/agent-runtime/(?:host-action-catalog|host-actions)(?:/|\.|$)`
  - `^src/features/menu-manager(?:/|\.|$)`
  - `^src/platform/zotero-host(?:/|\.|$)`
- Host Semantic Domains:
  - `menu-manager`
- Required Host Assertions:
  - The collection menu registration is attached to main/library/collection rather than item selection semantics.
  - The collection context is established in the live host before the menu is shown.
  - The collection menu item or submenu becomes visible in the live host popup.
  - The collection menu action can be replayed and the post-action result is observable.
  - A surface-local evidence target can be returned for the live collection menu or submenu surface.
- Non-Goals:
  - Assuming item selection state proves the collection menu target is active.
  - Treating registration against main/library/collection as sufficient without live popup evidence.

### `menu-submenu`

- Version: `1`
- Kind: `menu-submenu`
- Summary: A host-visible submenu surface whose visibility, structure, or child actions may depend on live menu state and `menuPath` resolution.
- Supports Visual Evidence: `true`
- Entry Matchers:
  - `^dev/agent-runtime/(?:host-action-catalog|host-actions)(?:/|\.|$)`
  - `^src/features/menu-manager(?:/|\.|$)`
- Host Semantic Domains:
  - `menu-manager`
- Required Host Assertions:
  - The submenu root is registered against an expected host menu target.
  - The submenu root or submenu popup becomes visible in the live host.
  - Dynamic submenu children are rebuilt or observed from live state before child actions are asserted.
  - A submenu child can be addressed through `menuPath` and replayed without relying on generic DOM guesses.
  - A surface-local evidence target can be returned for the submenu root or submenu popup.
- Non-Goals:
  - Assuming a submenu label alone proves its children were rebuilt from live state.
  - Treating popup repair or direct DOM fallback as the default submenu verification path.

### `reader-sidebar-view`

- Version: `1`
- Kind: `reader-sidebar-view`
- Summary: A Reader sidebar view surface aligned with Zotero Reader sidebarView semantics and live sidebar buttons or panels, with edge-attached layouts following live sidebar geometry.
- Supports Visual Evidence: `true`
- Entry Matchers:
  - `^dev/agent-runtime/host-action-catalog(?:/|\.|$)`
  - `^dev/agent-runtime/host-actions(?:/|\.|$)`
  - `^src/features/reader(?:/|\.|$)`
- Host Semantic Domains:
  - `reader-events`
- Required Host Assertions:
  - The requested Reader sidebar view is selected through a host-aligned view id such as annotations.
  - The selected Reader sidebar button or panel is observable after the switch.
  - The observed sidebar surface exposes structure or content signals, not just a matching state field.
  - If a sidebar-attached panel is shown, it follows live sidebar bounds or explicitly degrades below a minimum viable size.
  - A surface-local evidence target can be returned for the selected Reader sidebar view.
  - The live host button action can be replayed and the post-action result is observable.
- Non-Goals:
  - Assuming sidebar preferences alone prove the live Reader sidebar switched.
  - Using whole-window screenshots before the selected sidebar surface is confirmed.
  - Treating a fixed sidebar width as sufficient proof that an edge-attached surface is laid out correctly.
