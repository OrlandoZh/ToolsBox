function normalizeAddonRef(config = {}) {
  const addonRef = String(config?.addonRef || "").trim();
  return addonRef || "cleanroomtemplate";
}

export function createSurfaceDescriptors(config = {}) {
  const addonRef = normalizeAddonRef(config);
  const preferencePaneID = `${addonRef}-preferences`;

  return Object.freeze({
    serviceIDs: Object.freeze({
      runtimeCore: `${addonRef}.runtime-core`,
      hostSignals: `${addonRef}.host-signals`,
      hostNonce: `${addonRef}.host-nonce`,
      controlPlane: `${addonRef}.control-plane`,
      runtimeBridge: `${addonRef}.runtime-bridge`,
      reactUIDemo: `${addonRef}.react-ui-demo`,
    }),
    serviceLabels: Object.freeze({
      runtimeCore: "Runtime Core",
      hostSignals: "Host Signal Collector",
      hostNonce: "Host Nonce Store",
      controlPlane: "Package Control Plane",
      runtimeBridge: "Runtime Bridge",
      reactUIDemo: "Optional React UI Demo",
    }),
    menuCommand: Object.freeze({
      toolsMenuItemID: "cleanroom-template-menuitem",
      injectedStyleID: "cleanroom-template-style",
    }),
    preferenceBindingMode: "native",
    preferencePaneID,
    preferenceRootID: `${preferencePaneID}-root`,
    primaryActionCommandID: `${addonRef}-primary-action`,
    readerSummaryCommandID: `${addonRef}-reader-summary`,
    readerSelectionCommandID: `${addonRef}-reader-selection-snapshot`,
    reactUIDemoCommandID: `${addonRef}-open-react-ui-demo`,
    contextMenuItemID: `${addonRef}-context-action`,
    readerSummaryMenuItemID: `${addonRef}-reader-summary`,
    demoInfoRowID: `${addonRef}-selection-summary`,
    demoSectionID: `${addonRef}-details`,
    demoColumnKey: `${addonRef}-status`,
    demoNotifierID: `${addonRef}-activity`,
    shortcutIDPrefix: `${addonRef}-shortcut`,
  });
}
