export const HOST_ACTION_IDS = Object.freeze({
  preferencesOpenPane: "preferences.openPane",
  preferencesSelectTab: "preferences.selectTab",
  preferencesSetCheckbox: "preferences.setCheckbox",
  preferencesSetTextbox: "preferences.setTextbox",
  preferencesSelectMenulist: "preferences.selectMenulist",
  contextPaneSetOpen: "contextPane.setOpen",
  itemPaneSelectPane: "itemPane.selectPane",
  contextPaneSelectPane: "contextPane.selectPane",
  readerOpen: "reader.open",
  readerContextPaneSetOpen: "reader.contextPane.setOpen",
  readerToolbarTriggerButton: "reader.toolbar.triggerButton",
  readerSidebarSelectView: "reader.sidebar.selectView",
  menuShow: "menu.show",
  menuTrigger: "menu.trigger",
  windowListMain: "window.listMain",
  windowWaitForPreferencesWindow: "window.waitForPreferencesWindow",
  runtimeProbeWasmKernel: "runtime.probeWasmKernel",
  runtimeDeriveWasmKernelDigest: "runtime.deriveWasmKernelDigest",
  runtimeDeriveWasmKernelUnlockToken: "runtime.deriveWasmKernelUnlockToken",
  windowOpenReactDemo: "window.openReactDemo",
  dialogModalConfirmation: "dialog.modal.confirmation",
  preferencesHelpLink: "preferences.helpLink",
  menuTriggerDestructive: "menu.trigger.destructive",
  windowCloseWithUnsavedState: "window.close.withUnsavedState",
});

export function listHostActionIds() {
  return Object.freeze(Object.values(HOST_ACTION_IDS));
}
