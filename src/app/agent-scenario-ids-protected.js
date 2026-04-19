function buildToken(parts) {
  return parts.join("");
}

export const AGENT_SCENARIO_IDS = Object.freeze({
  baselineRegistration: buildToken(["baseline", "-", "registration"]),
  capabilityManifest: buildToken(["capability", "-", "manifest"]),
  sampleItemPane: buildToken(["sample", "-", "item", "-", "pane"]),
  settingsSnapshot: buildToken(["settings", "-", "snapshot"]),
  notifierPreview: buildToken(["notifier", "-", "preview"]),
  readerCurrent: buildToken(["reader", "-", "current"]),
  windowSnapshot: buildToken(["window", "-", "snapshot"]),
  commandNoUI: buildToken(["command", "-", "no", "-", "ui"]),
  hostActions: buildToken(["host", "-", "actions"]),
});

export function listAgentScenarioIds() {
  return Object.freeze(Object.values(AGENT_SCENARIO_IDS));
}
