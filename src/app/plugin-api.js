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
  serviceRegistry,
  getMainWindow,
  runPrimaryAction,
  runAgentAction,
  runAgentSelfCheck,
  runAgentScenario,
  collectAgentDiagnostics,
  listAgentScenarios,
  listAgentCapabilities,
  getAgentCapability,
  inspectItemPresentation,
  listHostActions,
  runHostAction,
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
      listCapabilities: listAgentCapabilities,
      getCapability: getAgentCapability,
      runScenario: runAgentScenario,
      runAction: runAgentAction,
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
    serviceRegistry,
    getMainWindow,
    runPrimaryAction,
    runAgentAction,
    runAgentSelfCheck,
    runAgentScenario,
  });
}
