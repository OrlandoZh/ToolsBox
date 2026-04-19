export const CAPABILITY_IDS = Object.freeze({
  baselineRegistration: "baseline-registration",
  itemPresentation: "item-presentation",
  notifierSync: "notifier-sync",
  readerSummary: "reader-summary",
  readerAnnotationRoundtrip: "reader-annotation-roundtrip",
  readerUIState: "reader-ui-state",
  readerEventHooks: "reader-event-hooks",
  commandNonblocking: "command-nonblocking",
  hostActions: "host-actions",
  settingsGovernance: "settings-governance",
  multiWindowMount: "multi-window-mount",
  runtimeBridgeReport: "runtime-bridge-report",
});

export function listCapabilityIds() {
  return Object.freeze(Object.values(CAPABILITY_IDS));
}
