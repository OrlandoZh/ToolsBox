export const AGENT_SCENARIO_IDS = Object.freeze({
  baselineRegistration: "baseline-registration",
  capabilityManifest: "capability-manifest",
  sampleItemPane: "sample-item-pane",
  settingsSnapshot: "settings-snapshot",
  notifierPreview: "notifier-preview",
  readerCurrent: "reader-current",
  windowSnapshot: "window-snapshot",
  commandNoUI: "command-no-ui",
  hostActions: "host-actions",
});

export function listAgentScenarioIds() {
  return Object.freeze(Object.values(AGENT_SCENARIO_IDS));
}
