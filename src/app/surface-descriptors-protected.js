function normalizeSeed(config = {}) {
  const addonId = String(config?.addonId || "").trim();
  if (addonId) {
    return addonId;
  }

  const addonRef = String(config?.addonRef || "").trim();
  return addonRef || "cleanroomtemplate";
}

function hashToken(input = "") {
  let hash = 2166136261;
  for (const char of String(input || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildScope(config = {}) {
  return `cr${hashToken(normalizeSeed(config)).slice(0, 7)}`;
}

export function createSurfaceDescriptors(config = {}) {
  const scope = buildScope(config);
  const preferencePaneID = `${scope}-p0`;

  return Object.freeze({
    serviceIDs: Object.freeze({
      runtimeCore: `${scope}.s0`,
      hostSignals: `${scope}.s1`,
      hostNonce: `${scope}.s2`,
      controlPlane: `${scope}.s3`,
      runtimeBridge: `${scope}.s4`,
    }),
    serviceLabels: Object.freeze({
      runtimeCore: "Service 0",
      hostSignals: "Service 1",
      hostNonce: "Service 2",
      controlPlane: "Service 3",
      runtimeBridge: "Service 4",
    }),
    menuCommand: Object.freeze({
      toolsMenuItemID: `${scope}-m0`,
      injectedStyleID: `${scope}-m1`,
    }),
    preferenceBindingMode: "native",
    preferencePaneID,
    preferenceRootID: `${preferencePaneID}-root`,
    primaryActionCommandID: `${scope}-c0`,
    readerSummaryCommandID: `${scope}-c1`,
    readerSelectionCommandID: `${scope}-c2`,
    contextMenuItemID: `${scope}-m2`,
    readerSummaryMenuItemID: `${scope}-c1`,
    demoInfoRowID: `${scope}-r0`,
    demoSectionID: `${scope}-r1`,
    demoColumnKey: `${scope}-r2`,
    demoNotifierID: `${scope}-r3`,
    shortcutIDPrefix: `${scope}-k0`,
    relationshipGraphCommandID: `${scope}-c3`,
    relationshipGraphContextMenuID: `${scope}-m3`,
    paperMatrixCommandID: `${scope}-c4`,
    paperMatrixContextMenuID: `${scope}-m4`,
    styleEditorCommandID: `${scope}-c5`,
    notesManagerCommandID: `${scope}-c6`,
    notesManagerContextMenuID: `${scope}-m5`,
    tabHelperCommandIDPrefix: `${scope}-t0`,
  });
}
