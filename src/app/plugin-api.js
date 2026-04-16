const SERVICE_HUB_API_KEY = ["service", "Registry"].join("");
const AGENT_ACTION_API_KEY = ["run", "Agent", "Action"].join("");
const PACKAGE_PROTECTION_SUMMARY_API_KEY = ["get", "Package", "Protection", "Summary"].join("");

export function createPluginAPI({
  host,
  runtimeInfo,
  logger,
  settings,
  prefs,
  i18n,
  lifecycle,
  uiFactory,
  notifier,
  keyboard,
  http,
  dialog,
  progress,
  menuCommand,
  menuManager,
  itemPane,
  itemTree,
  commandPalette,
  preferencePanes,
  reader,
  readerSelectionActions,
  servicesHub,
  getMainWindow,
  runPrimaryAction,
  executeAgentAction,
  runAgentSelfCheck,
  runAgentScenario,
  collectAgentDiagnostics,
  listAgentScenarios,
  listCapabilitiesImpl,
  getCapabilityImpl,
  inspectItemPresentation,
  listHostActions,
  runHostAction,
  getProtectionSummary,
}) {
  function cloneValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  }

  return Object.freeze({
    agent: Object.freeze({
      selfCheck: runAgentSelfCheck,
      collectDiagnostics: collectAgentDiagnostics,
      listScenarios: listAgentScenarios,
      listCapabilities: listCapabilitiesImpl,
      getCapability: getCapabilityImpl,
      runScenario: runAgentScenario,
      runAction: executeAgentAction,
      listHostActions,
      runHostAction,
      inspectItem: inspectItemPresentation,
      describeReader(target) {
        return reader.getReaderSummary(target);
      },
      inspectReader(target) {
        return typeof reader.getReaderInteractionSnapshot === "function"
          ? reader.getReaderInteractionSnapshot(target)
          : reader.getReaderSummary(target);
      },
    }),
    runtime: Object.freeze({
      rootURI: runtimeInfo?.rootURI || null,
      getCapabilitySummary() {
        return cloneValue(
          typeof runtimeInfo?.cloneCapabilitySummary === "function"
            ? runtimeInfo.cloneCapabilitySummary()
            : runtimeInfo?.capabilitySummary || null,
        );
      },
      getCapabilityReport() {
        return cloneValue(
          typeof runtimeInfo?.cloneCapabilityReport === "function"
            ? runtimeInfo.cloneCapabilityReport()
            : runtimeInfo?.capabilityReport || null,
        );
      },
      [PACKAGE_PROTECTION_SUMMARY_API_KEY]() {
        return cloneValue(
          typeof getProtectionSummary === "function"
            ? getProtectionSummary()
            : null,
        );
      },
    }),
    host,
    logger,
    settings,
    prefs,
    i18n,
    lifecycle,
    uiFactory,
    notifier,
    keyboard,
    http,
    dialog,
    progress,
    menuCommand,
    menuManager,
    itemPane,
    itemTree,
    commandPalette,
    preferencePanes,
    reader,
    readerSelectionActions,
    [SERVICE_HUB_API_KEY]: servicesHub,
    getMainWindow,
    runPrimaryAction,
    [AGENT_ACTION_API_KEY]: executeAgentAction,
    runAgentSelfCheck,
    runAgentScenario,
  });
}
