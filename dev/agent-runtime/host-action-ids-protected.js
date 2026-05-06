function buildToken(parts) {
  return parts.join("");
}

export const HOST_ACTION_IDS = Object.freeze({
  preferencesOpenPane: buildToken(["preferences", ".", "open", "Pane"]),
  preferencesSelectTab: buildToken(["preferences", ".", "select", "Tab"]),
  preferencesSetCheckbox: buildToken(["preferences", ".", "set", "Checkbox"]),
  preferencesSetTextbox: buildToken(["preferences", ".", "set", "Textbox"]),
  preferencesSelectMenulist: buildToken(["preferences", ".", "select", "Menulist"]),
  contextPaneSetOpen: buildToken(["context", "Pane", ".", "set", "Open"]),
  itemPaneSelectPane: buildToken(["item", "Pane", ".", "select", "Pane"]),
  contextPaneSelectPane: buildToken(["context", "Pane", ".", "select", "Pane"]),
  readerOpen: buildToken(["reader", ".", "open"]),
  readerContextPaneSetOpen: buildToken(["reader", ".", "context", "Pane", ".", "set", "Open"]),
  readerToolbarTriggerButton: buildToken(["reader", ".", "toolbar", ".", "trigger", "Button"]),
  readerSidebarSelectView: buildToken(["reader", ".", "sidebar", ".", "select", "View"]),
  menuShow: buildToken(["menu", ".", "show"]),
  menuTrigger: buildToken(["menu", ".", "trigger"]),
  windowListMain: buildToken(["window", ".", "list", "Main"]),
  windowWaitForPreferencesWindow: buildToken(["window", ".", "wait", "For", "Preferences", "Window"]),
  runtimeProbeWasmKernel: buildToken(["runtime", ".", "probe", "Wasm", "Kernel"]),
  runtimeDeriveWasmKernelDigest: buildToken(["runtime", ".", "derive", "Wasm", "Kernel", "Digest"]),
  runtimeDeriveWasmKernelUnlockToken: buildToken(["runtime", ".", "derive", "Wasm", "Kernel", "Unlock", "Token"]),
  runtimeResolveLegacyEntitlementGate: buildToken(["runtime", ".", "resolve", "Legacy", "Entitlement", "Gate"]),
  dialogModalConfirmation: buildToken(["dialog", ".", "modal", ".", "confirmation"]),
  preferencesHelpLink: buildToken(["preferences", ".", "help", "Link"]),
  menuTriggerDestructive: buildToken(["menu", ".", "trigger", ".", "destructive"]),
  windowCloseWithUnsavedState: buildToken(["window", ".", "close", ".", "with", "Unsaved", "State"]),
});

export function listHostActionIds() {
  return Object.freeze(Object.values(HOST_ACTION_IDS));
}
