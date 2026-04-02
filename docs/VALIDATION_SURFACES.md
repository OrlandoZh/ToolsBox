# Validation Surfaces

> Generated from `config/validation-surfaces.json`. Edit the registry and run `npm run docs:sync-validation-surfaces`.

- Summary: Template-level host-visible surface contract. Real host-visible surfaces should pass surface smoke before visual baselines or whole-window screenshots are treated as authoritative.

## Contract Surfaces

### `preference-pane`

- Version: `1`
- Kind: `preference-pane`
- Summary: A Zotero preference pane registered through the host preference pane API and reachable from the preferences sidebar.
- Supports Visual Evidence: `true`
- Entry Matchers:
  - `^src/features/preference-panes(?:/|\.|$)`
  - `^src/app/feature-composer(?:/|\.|$)`
  - `^addon-static/content/.*preferences.*\.xhtml$`
- Host Semantic Domains:
  - `preference-panes`
- Required Host Assertions:
  - The preference pane is registered through the host preference pane API.
  - The preference pane can be opened from the preferences sidebar.
  - The pane renders its core controls after it is opened.
- Non-Goals:
  - Whole-window screenshots without proving the pane was opened.
  - Non-visible settings/schema changes that do not alter the preference pane surface.

### `context-pane`

- Version: `1`
- Kind: `context-pane`
- Summary: A Zotero context pane surface that can be toggled from a reader-side integration, using the host's context pane terminology.
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
  - The context pane content is ready, not just registered or initialized.
- Non-Goals:
  - Treating a trigger registration alone as proof that the context pane works.
  - Using a whole-window screenshot as the only evidence when the context pane content is empty.

### `item-pane-sidenav`

- Version: `1`
- Kind: `item-pane-sidenav`
- Summary: A Zotero Item Pane sidenav surface that switches a real pane button and confirms the target pane becomes visible.
- Supports Visual Evidence: `true`
- Entry Matchers:
  - `^src/app/host-action-catalog(?:/|\.|$)`
  - `^src/app/host-actions(?:/|\.|$)`
  - `^src/features/item-pane(?:/|\.|$)`
  - `^src/platform/zotero-host(?:/|\.|$)`
- Host Semantic Domains:
  - `item-pane`
- Required Host Assertions:
  - The target Item Pane button or pane ID is aligned with the host Item Pane container.
  - The selected Item Pane pane becomes visible after the sidenav switch.
  - A surface-local evidence target can be returned for the selected Item Pane pane.
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
  - The menu item triggers the intended command or follow-up surface.
- Non-Goals:
  - Assuming menu registration alone means the menu item is visible to users.
  - Using generic screenshots before confirming the live host menu contains the item.

### `reader-sidebar-view`

- Version: `1`
- Kind: `reader-sidebar-view`
- Summary: A Reader sidebar view surface aligned with Zotero Reader sidebarView semantics and live sidebar buttons or panels.
- Supports Visual Evidence: `true`
- Entry Matchers:
  - `^src/app/host-action-catalog(?:/|\.|$)`
  - `^src/app/host-actions(?:/|\.|$)`
  - `^src/features/reader(?:/|\.|$)`
- Host Semantic Domains:
  - `reader-events`
- Required Host Assertions:
  - The requested Reader sidebar view is selected through a host-aligned view id such as annotations.
  - The selected Reader sidebar button or panel is observable after the switch.
  - A surface-local evidence target can be returned for the selected Reader sidebar view.
- Non-Goals:
  - Assuming sidebar preferences alone prove the live Reader sidebar switched.
  - Using whole-window screenshots before the selected sidebar surface is confirmed.
