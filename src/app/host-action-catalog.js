import { isOptionalBundleEnabled } from "./optional-bundles.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export const HOST_ACTION_STATUSES = Object.freeze({
  READY: "ready",
  PROBE_ONLY: "probe-only",
  MANUAL_ONLY: "manual-only",
  UNSAFE: "unsafe",
});

const HOST_ACTION_CATALOG = Object.freeze([
  {
    id: "preferences.openPane",
    label: "Open Preference Pane",
    status: HOST_ACTION_STATUSES.READY,
    category: "preferences",
    summary: "Open Zotero preferences, navigate to the requested preference pane, and verify its live surface geometry is settled without horizontal overflow.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/xpcom/utilities_internal.js",
        anchor: "openPreferences()",
      },
      {
        file: "reference/zotero-main/chrome/content/zotero/preferences/preferences.js",
        anchor: "waitForFirstPaneLoad() / waitForPaneSelect() / navigateToPane()",
      },
    ],
    preconditions: [
      "Zotero.Utilities.Internal.openPreferences() is available, or the main window can fall back to ZoteroPane.openPreferences().",
      "The requested pane is already registered in PreferencePanes.",
    ],
    executionEntry: "host.preparePreferencePane()",
    readinessAssertions: [
      "The preferences window exists and is focused.",
      "The requested pane is selected in the preferences sidebar.",
      "The pane fragment is mounted and structurally observable.",
      "The pane exposes interactive controls, preference bindings, or load/localization bridge signals.",
      "The selected pane root exposes a live width signal and remains free of horizontal overflow after layout settle.",
      "A surface-local evidence target is returned for the selected pane root, and its geometry is settled on the live pane fragment.",
    ],
    evidenceTargets: [
      "preference-pane",
    ],
    ownerModules: [
      "src/platform/zotero-host.js",
      "src/app/host-actions.js",
    ],
    executable: true,
  },
  {
    id: "preferences.selectTab",
    label: "Select Preference Tab",
    status: HOST_ACTION_STATUSES.READY,
    category: "preferences",
    summary: "Open a live Zotero preference pane, select a tab-like subsection, and verify the active panel is ready.",
    authoritativeSource: [
      {
        file: "chrome/content/zotero/preferences/preferences.js",
        anchor: "waitForFirstPaneLoad() / waitForPaneSelect()",
      },
    ],
    preconditions: [
      "The requested preference pane is already registered in PreferencePanes.",
      "The pane exposes a live tab or tab-like control identified by tabID.",
    ],
    executionEntry: "host.preparePreferencePane() + live tab activation replay",
    readinessAssertions: [
      "The requested preference pane is selected in the preferences sidebar.",
      "An interactive root or tab host surface is observed for advanced panes.",
      "The requested tab is observed and activated in the live host.",
      "The active panel is visible and contains live controls or pane content.",
    ],
    evidenceTargets: [
      "preference-pane",
    ],
    ownerModules: [
      "src/app/host-actions.js",
      "src/platform/zotero-host.js",
    ],
    executable: true,
  },
  {
    id: "preferences.setCheckbox",
    label: "Set Preference Checkbox",
    status: HOST_ACTION_STATUSES.READY,
    category: "preferences",
    summary: "Open a live Zotero preference pane, toggle a checkbox control, and verify the pref writeback while the pane stays geometry-stable and overflow-safe.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/preferences/preferences.js",
        anchor: "_syncToPrefOnModify() / _initImportedNodesPostInsert()",
      },
    ],
    preconditions: [
      "The requested preference pane is already registered in PreferencePanes.",
      "A live checkbox control can be located by controlID, preferenceID, or selector.",
      "The requested checked state is provided.",
    ],
    executionEntry: "host.preparePreferencePane() + live checkbox replay",
    readinessAssertions: [
      "The live checkbox control is observed in the requested preference pane.",
      "A live checkbox action is dispatched against the control element.",
      "The checkbox state matches the requested value after the action.",
      "The associated preference writeback matches the requested value.",
      "The pane root remains geometry-settled and free of horizontal overflow after the interaction.",
      "A surface-local evidence target is returned for the control or pane fallback.",
    ],
    evidenceTargets: [
      "preference-control",
    ],
    ownerModules: [
      "src/app/host-actions.js",
      "src/platform/zotero-host.js",
    ],
    executable: true,
  },
  {
    id: "preferences.setTextbox",
    label: "Set Preference Textbox",
    status: HOST_ACTION_STATUSES.READY,
    category: "preferences",
    summary: "Open a live Zotero preference pane, update a textbox control, and verify the pref writeback while the pane stays geometry-stable and overflow-safe.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/preferences/preferences.js",
        anchor: "_syncToPrefOnModify() / _initImportedNodesPostInsert()",
      },
    ],
    preconditions: [
      "The requested preference pane is already registered in PreferencePanes.",
      "A live textbox control can be located by controlID, preferenceID, or selector.",
      "The requested value is provided.",
    ],
    executionEntry: "host.preparePreferencePane() + live textbox input/change replay",
    readinessAssertions: [
      "The live textbox control is observed in the requested preference pane.",
      "Input/change events are dispatched on the live textbox control.",
      "The textbox value matches the requested value after the action.",
      "The associated preference writeback matches the requested value.",
      "The pane root remains geometry-settled and free of horizontal overflow after the interaction.",
      "A surface-local evidence target is returned for the control or pane fallback.",
    ],
    evidenceTargets: [
      "preference-control",
    ],
    ownerModules: [
      "src/app/host-actions.js",
      "src/platform/zotero-host.js",
    ],
    executable: true,
  },
  {
    id: "preferences.selectMenulist",
    label: "Select Preference Menulist",
    status: HOST_ACTION_STATUSES.READY,
    category: "preferences",
    summary: "Open a live Zotero preference pane, select a menulist value, and verify the pref writeback while the pane stays geometry-stable and overflow-safe.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/preferences/preferences.js",
        anchor: "_syncToPrefOnModify() / _initImportedNodesPostInsert()",
      },
    ],
    preconditions: [
      "The requested preference pane is already registered in PreferencePanes.",
      "A live menulist control can be located by controlID, preferenceID, or selector.",
      "The requested value is provided.",
    ],
    executionEntry: "host.preparePreferencePane() + live menulist command/change replay",
    readinessAssertions: [
      "The live menulist control is observed in the requested preference pane.",
      "Command/change events are dispatched on the live menulist control.",
      "The menulist state matches the requested value after the action.",
      "The associated preference writeback matches the requested value.",
      "The pane root remains geometry-settled and free of horizontal overflow after the interaction.",
      "A surface-local evidence target is returned for the control or pane fallback.",
    ],
    evidenceTargets: [
      "preference-control",
    ],
    ownerModules: [
      "src/app/host-actions.js",
      "src/platform/zotero-host.js",
    ],
    executable: true,
  },
  {
    id: "contextPane.setOpen",
    label: "Toggle Context Pane",
    status: HOST_ACTION_STATUSES.READY,
    category: "context-pane",
    summary: "Open or close the right-side Zotero context pane in the main window.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/contextPane.js",
        anchor: "ZoteroContextPane.collapsed",
      },
    ],
    preconditions: [
      "The main Zotero window is available.",
      "ZoteroContextPane exists for the active tab.",
    ],
    executionEntry: "host.setContextPaneOpen()",
    readinessAssertions: [
      "The context pane open state matches the requested value.",
      "When opened, the context pane root or sidenav surface is structurally observable.",
      "When opened, the context pane exposes navigation or content signals, not just a collapsed-state flip.",
    ],
    evidenceTargets: [
      "context-pane",
    ],
    ownerModules: [
      "src/platform/zotero-host.js",
      "src/app/host-actions.js",
    ],
    executable: true,
  },
  {
    id: "itemPane.selectPane",
    label: "Select Item Pane",
    status: HOST_ACTION_STATUSES.READY,
    category: "item-pane",
    summary: "Switch a library Item Pane section by pane ID and verify the selected section is visible.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/elements/itemPaneSidenav.js",
        anchor: "data-pane / container.scrollToPane(...)",
      },
      {
        file: "reference/zotero-main/chrome/content/zotero/elements/itemDetails.js",
        anchor: "getPane() / isPaneVisible() / scrollToPane()",
      },
    ],
    preconditions: [
      "A single item is selected in the library tab.",
      "The requested pane exists in the Item Pane container.",
    ],
    executionEntry: "host.selectItemPane()",
    readinessAssertions: [
      "The requested Item Pane section is visible.",
      "The selected Item Pane fragment is mounted with observable content.",
      "The matching Item Pane sidenav button is discoverable in the live host.",
      "If the selected surface is edge-attached, it follows live pane bounds or returns an explicit narrow-width degrade.",
      "A surface-local evidence target is returned for the selected Item Pane surface.",
    ],
    evidenceTargets: [
      "item-pane-sidenav",
    ],
    ownerModules: [
      "src/platform/zotero-host.js",
      "src/app/host-actions.js",
    ],
    executable: true,
  },
  {
    id: "contextPane.selectPane",
    label: "Select Context Pane",
    status: HOST_ACTION_STATUSES.READY,
    category: "context-pane",
    summary: "Switch the active reader tab's right-side context pane section by pane ID.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/contextPane.js",
        anchor: "ZoteroContextPane.sidenav / togglePane()",
      },
      {
        file: "reference/zotero-main/chrome/content/zotero/elements/contextPane.js",
        anchor: "_getItemContext(tabID)",
      },
      {
        file: "reference/zotero-main/chrome/content/zotero/elements/itemDetails.js",
        anchor: "isPaneVisible() / scrollToPane()",
      },
    ],
    preconditions: [
      "A reader-backed tab is active in the main Zotero window.",
      "The context pane item container exists for the active tab.",
    ],
    executionEntry: "host.selectContextPane()",
    readinessAssertions: [
      "The context pane is open.",
      "The requested context pane section is visible.",
      "The selected context pane fragment is mounted with observable content.",
      "The matching context pane sidenav button is discoverable in the live host.",
      "If the selected surface is edge-attached, it follows live pane bounds or returns an explicit narrow-width degrade.",
      "A surface-local evidence target is returned for the selected context pane surface.",
    ],
    evidenceTargets: [
      "context-pane",
    ],
    ownerModules: [
      "src/platform/zotero-host.js",
      "src/app/host-actions.js",
    ],
    executable: true,
  },
  {
    id: "reader.open",
    label: "Open Reader",
    status: HOST_ACTION_STATUSES.READY,
    category: "reader",
    summary: "Open a supported attachment in a Zotero Reader instance and wait until it is ready.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/xpcom/reader.js",
        anchor: "open(itemID, location, options)",
      },
    ],
    preconditions: [
      "The provided item is a reader-capable attachment.",
    ],
    executionEntry: "reader.openReader() / reader.waitForReaderReady()",
    readinessAssertions: [
      "A reader instance exists for the requested attachment.",
      "The reader primary frame window is available.",
    ],
    evidenceTargets: [
      "reader-window",
    ],
    ownerModules: [
      "src/features/reader.js",
      "src/app/host-actions.js",
    ],
    executable: true,
  },
  {
    id: "reader.contextPane.setOpen",
    label: "Toggle Reader Context Pane",
    status: HOST_ACTION_STATUSES.READY,
    category: "reader",
    summary: "Toggle the reader-side context pane and verify the reader host state reflects the requested value.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/xpcom/reader.js",
        anchor: "setContextPaneOpen(open)",
      },
    ],
    preconditions: [
      "A reader instance is already open for the target attachment.",
    ],
    executionEntry: "reader.setContextPaneOpen()",
    readinessAssertions: [
      "Reader UI state reports the requested contextPaneOpen value.",
      "When opened, the shared context pane root or sidenav is structurally observable.",
      "When opened, the surface exposes navigation or content signals.",
      "When opened, edge-attached occupancy follows live pane bounds or returns an explicit narrow-width degrade.",
      "A surface-local evidence target is returned for the opened reader context pane surface.",
    ],
    evidenceTargets: [
      "context-pane",
    ],
    ownerModules: [
      "src/features/reader.js",
      "src/app/host-actions.js",
    ],
    executable: true,
  },
  {
    id: "reader.toolbar.triggerButton",
    label: "Trigger Reader Toolbar Button",
    status: HOST_ACTION_STATUSES.READY,
    category: "reader",
    summary: "Locate a live renderToolbar button in the active reader surface and replay its host-visible action.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/test/content/support.js",
        anchor: "dialog.getButton(button).click()",
      },
      {
        file: "reference/zotero-main/test/tests/pluginAPITest.js",
        anchor: "simulateMenuItemClick()",
      },
    ],
    preconditions: [
      "A reader instance is already open for the target attachment.",
      "The renderToolbar integration exposes a stable live button selector or marker.",
    ],
    executionEntry: "reader.findToolbarElement() + live button click replay",
    readinessAssertions: [
      "The target toolbar button is discoverable in the live reader document.",
      "The button action is replayed through a live click-compatible path.",
      "A surface-local evidence target can be returned for the toolbar button surface.",
    ],
    evidenceTargets: [
      "render-toolbar",
    ],
    ownerModules: [
      "src/features/reader.js",
      "src/app/host-actions.js",
    ],
    executable: true,
  },
  {
    id: "reader.sidebar.selectView",
    label: "Select Reader Sidebar View",
    status: HOST_ACTION_STATUSES.READY,
    category: "reader",
    summary: "Switch the active reader sidebar view to the requested target such as annotations, outline, or thumbnails.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/xpcom/reader.js",
        anchor: "sidebarView / onChangeSidebarView",
      },
    ],
    preconditions: [
      "A reader instance is already open for the target attachment.",
      "The requested sidebar view exists in the reader host UI.",
    ],
    executionEntry: "reader.selectSidebarView()",
    readinessAssertions: [
      "Reader UI state reports the requested sidebarView value.",
      "The corresponding sidebar button or panel is observable.",
      "The observed sidebar surface has structural or content signals, not just a matching state field.",
      "If the selected surface is sidebar-attached, it follows live sidebar bounds or returns an explicit narrow-width degrade.",
      "A surface-local evidence target is returned for the active reader sidebar surface.",
    ],
    evidenceTargets: [
      "reader-sidebar-view",
    ],
    ownerModules: [
      "src/features/reader.js",
      "src/app/host-actions.js",
    ],
    executable: true,
  },
  {
    id: "menu.show",
    label: "Show Live Menu",
    status: HOST_ACTION_STATUSES.READY,
    category: "menu",
    summary: "Open a live Zotero menu target, including collection menus and submenu paths, and observe the registered surface in the real popup.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/test/tests/pluginAPITest.js",
        anchor: "simulateMenuOpen() / menu target maps",
      },
    ],
    preconditions: [
      "The requested menu registration already exists in Zotero.MenuManager.",
      "The requested host menu target is supported by the runtime probe path.",
    ],
    executionEntry: "host.resolveMenuPopup() + menuManager.getLiveMenuState()",
    readinessAssertions: [
      "The live menu popup is open.",
      "The registered menu item or submenu path is visible in the live menu popup.",
      "The live menu item or submenu path is actionable rather than hidden or disabled.",
      "The popup exposes real menu structure or item content, not just an empty shell.",
      "A surface-local evidence target is returned for the live menu popup, collection menu, or submenu surface.",
    ],
    evidenceTargets: [
      "menu-item",
      "collection-menu",
      "menu-submenu",
    ],
    ownerModules: [
      "src/platform/zotero-host.js",
      "src/features/menu-manager.js",
      "src/app/host-actions.js",
    ],
    executable: true,
  },
  {
    id: "menu.trigger",
    label: "Trigger Live Menu",
    status: HOST_ACTION_STATUSES.READY,
    category: "menu",
    summary: "Trigger a live Zotero menu item or submenu child by dispatching the menu command on the real host menu element.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/test/tests/pluginAPITest.js",
        anchor: "simulateMenuItemClick()",
      },
    ],
    preconditions: [
      "The requested menu registration already exists in Zotero.MenuManager.",
      "A live menu element can be resolved for the requested menu target.",
    ],
    executionEntry: "menu.show + live menu command dispatch",
    readinessAssertions: [
      "The live menu item or submenu child command is dispatched without error.",
      "The live menu item or submenu child remains actionable while being triggered.",
      "A surface-local evidence target remains available for the triggered menu item, collection menu, or submenu surface.",
    ],
    evidenceTargets: [
      "menu-item",
      "collection-menu",
      "menu-submenu",
    ],
    ownerModules: [
      "src/platform/zotero-host.js",
      "src/features/menu-manager.js",
      "src/app/host-actions.js",
    ],
    executable: true,
  },
  {
    id: "window.listMain",
    label: "List Main Windows",
    status: HOST_ACTION_STATUSES.PROBE_ONLY,
    category: "window",
    summary: "Probe the currently open Zotero main windows without changing host state.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/zoteroPane.js",
        anchor: "Zotero.getMainWindow() / Zotero.getMainWindows()",
      },
    ],
    preconditions: [
      "At least one Zotero window is already open.",
    ],
    executionEntry: "host.listMainWindows()",
    readinessAssertions: [
      "A main window snapshot can be observed.",
    ],
    evidenceTargets: [],
    ownerModules: [
      "src/platform/zotero-host.js",
    ],
    executable: false,
  },
  {
    id: "window.waitForPreferencesWindow",
    label: "Wait For Preferences Window",
    status: HOST_ACTION_STATUSES.PROBE_ONLY,
    category: "window",
    summary: "Probe whether a preferences window exists and is ready, without creating one implicitly.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/xpcom/utilities_internal.js",
        anchor: "window-mediator enumerator for zotero:pref",
      },
    ],
    preconditions: [
      "A preferences window is already open or about to be opened by another action.",
    ],
    executionEntry: "host.listPreferenceWindows()",
    readinessAssertions: [
      "A preferences window snapshot is observable.",
    ],
    evidenceTargets: [],
    ownerModules: [
      "src/platform/zotero-host.js",
    ],
    executable: false,
  },
  {
    id: "window.openReactDemo",
    label: "Open React Demo Window",
    status: HOST_ACTION_STATUSES.READY,
    category: "window",
    summary: "Open or reuse the standalone example window backed by the optional React UI bundle.",
    authoritativeSource: [
      {
        file: "src/utils/window-shell.js",
        anchor: "createWindowShellManager()",
      },
      {
        file: "addon-static/content/react-ui/demo.xhtml",
        anchor: "standalone shell",
      },
    ],
    preconditions: [
      "Optional bundle `react-ui` is enabled.",
      "A main Zotero window can open a dialog window.",
    ],
    executionEntry: "reactUIDemo.openDemoWindow()",
    readinessAssertions: [
      "The example window opens or reuses an existing shell.",
      "The window is ready and focused.",
      "A surface-local evidence target is available for the window shell.",
    ],
    evidenceTargets: [
      "window-shell",
    ],
    ownerModules: [
      "src/features/react-ui-demo.js",
      "src/utils/window-shell.js",
      "src/app/host-actions.js",
    ],
    executable: true,
    requiredBundle: "react-ui",
  },
  {
    id: "dialog.modal.confirmation",
    label: "Modal Confirmation Dialog",
    status: HOST_ACTION_STATUSES.MANUAL_ONLY,
    category: "dialog",
    summary: "Inventory confirmation dialogs that require a human to verify semantics before automation may proceed.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/xpcom/reader.js",
        anchor: "promptToTransferAnnotations() / _promptToDeletePages()",
      },
    ],
    preconditions: [
      "The dialog belongs to a non-destructive but user-confirmed host path.",
    ],
    executionEntry: "inventory-only",
    readinessAssertions: [
      "The dialog is known, but not auto-confirmed by default.",
    ],
    evidenceTargets: [],
    ownerModules: [
      "src/app/host-action-catalog.js",
    ],
    executable: false,
  },
  {
    id: "preferences.helpLink",
    label: "Preference Help Link",
    status: HOST_ACTION_STATUSES.MANUAL_ONLY,
    category: "preferences",
    summary: "Open help links from the preferences pane only with human confirmation because they may leave the host app.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/preferences/preferences.js",
        anchor: "openHelpLink()",
      },
    ],
    preconditions: [
      "The current preference pane exposes a helpURL.",
    ],
    executionEntry: "inventory-only",
    readinessAssertions: [
      "The help action is modeled, but intentionally not auto-executed.",
    ],
    evidenceTargets: [],
    ownerModules: [
      "src/app/host-action-catalog.js",
    ],
    executable: false,
  },
  {
    id: "menu.trigger.destructive",
    label: "Trigger Destructive Menu",
    status: HOST_ACTION_STATUSES.UNSAFE,
    category: "menu",
    summary: "Inventory destructive menu items that must never be auto-triggered by the agent without explicit user approval.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/test/tests/pluginAPITest.js",
        anchor: "simulateMenuItemClick()",
      },
    ],
    preconditions: [
      "The target command would mutate or delete host data.",
    ],
    executionEntry: "blocked",
    readinessAssertions: [
      "The command is known but intentionally blocked from automatic execution.",
    ],
    evidenceTargets: [],
    ownerModules: [
      "src/app/host-action-catalog.js",
    ],
    executable: false,
  },
  {
    id: "window.close.withUnsavedState",
    label: "Close Window With Unsaved State",
    status: HOST_ACTION_STATUSES.UNSAFE,
    category: "window",
    summary: "Inventory close paths that may discard in-flight work or trigger destructive prompts.",
    authoritativeSource: [
      {
        file: "reference/zotero-main/chrome/content/zotero/xpcom/reader.js",
        anchor: "ReaderWindow.close() / tab close paths",
      },
    ],
    preconditions: [
      "The target window or tab may contain unsaved editor state.",
    ],
    executionEntry: "blocked",
    readinessAssertions: [
      "The close path is cataloged, but intentionally not automated.",
    ],
    evidenceTargets: [],
    ownerModules: [
      "src/app/host-action-catalog.js",
    ],
    executable: false,
  },
]);

function shouldExposeHostAction(entry, options = {}) {
  const requiredBundle = String(entry?.requiredBundle || "").trim();
  if (!requiredBundle) {
    return true;
  }
  return isOptionalBundleEnabled(options.optionalBundles, requiredBundle);
}

export function listHostActionDescriptors(options = {}) {
  return HOST_ACTION_CATALOG
    .filter((entry) => shouldExposeHostAction(entry, options))
    .map((entry) => clone(entry));
}

export function getHostActionDescriptor(actionId, options = {}) {
  const id = String(actionId || "").trim();
  if (!id) {
    return null;
  }
  const matched = HOST_ACTION_CATALOG.find((entry) => entry.id === id && shouldExposeHostAction(entry, options));
  return matched ? clone(matched) : null;
}

export function isExecutableHostAction(actionId, options = {}) {
  return Boolean(getHostActionDescriptor(actionId, options)?.executable);
}
