function buildToken(parts) {
  return parts.join("");
}

export const CAPABILITY_IDS = Object.freeze({
  baselineRegistration: buildToken(["baseline", "-", "registration"]),
  itemPresentation: buildToken(["item", "-", "presentation"]),
  notifierSync: buildToken(["notifier", "-", "sync"]),
  readerSummary: buildToken(["reader", "-", "summary"]),
  readerAnnotationRoundtrip: buildToken(["reader", "-", "annotation", "-", "roundtrip"]),
  readerUIState: buildToken(["reader", "-", "ui", "-", "state"]),
  readerEventHooks: buildToken(["reader", "-", "event", "-", "hooks"]),
  commandNonblocking: buildToken(["command", "-", "nonblocking"]),
  hostActions: buildToken(["host", "-", "actions"]),
  settingsGovernance: buildToken(["settings", "-", "governance"]),
  multiWindowMount: buildToken(["multi", "-", "window", "-", "mount"]),
  runtimeBridgeReport: buildToken(["runtime", "-", "bridge", "-", "report"]),
});

export function listCapabilityIds() {
  return Object.freeze(Object.values(CAPABILITY_IDS));
}
