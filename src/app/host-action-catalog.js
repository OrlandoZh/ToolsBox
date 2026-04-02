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
    summary: "Open Zotero preferences and navigate to the requested preference pane.",
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
      "The pane root and at least one core control are visible.",
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
    summary: "Open a live Zotero menu target and observe the registered menu item in the real popup.",
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
      "The registered menu item is visible in the live menu popup.",
    ],
    evidenceTargets: [
      "menu-item",
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
    summary: "Trigger a live Zotero menu item by dispatching the menu command on the real host menu element.",
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
      "The live menu item command is dispatched without error.",
    ],
    evidenceTargets: [
      "menu-item",
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

export function listHostActionDescriptors() {
  return HOST_ACTION_CATALOG.map((entry) => clone(entry));
}

export function getHostActionDescriptor(actionId) {
  const id = String(actionId || "").trim();
  if (!id) {
    return null;
  }
  const matched = HOST_ACTION_CATALOG.find((entry) => entry.id === id);
  return matched ? clone(matched) : null;
}

export function isExecutableHostAction(actionId) {
  return Boolean(getHostActionDescriptor(actionId)?.executable);
}
