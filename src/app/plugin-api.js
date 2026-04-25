import { buildDisabledSnapshot } from "../features/agent-review-workbench.js";

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
  reviewWorkbench,
  getProtectionSummary,
}) {
  function cloneValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  }

  function createDisabledReviewWorkbenchSnapshot(reason = "review-workbench-unavailable") {
    return buildDisabledSnapshot(() => new Date(), {
      available: false,
      reason,
      summary: "Agent Review Workbench is unavailable in the current runtime.",
    });
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
      reviewWorkbench: Object.freeze({
        async getSnapshot() {
          return cloneValue(
            typeof reviewWorkbench?.getSnapshot === "function"
              ? await reviewWorkbench.getSnapshot()
              : createDisabledReviewWorkbenchSnapshot(),
          );
        },
        async createAnnotation(payload) {
          return cloneValue(
            typeof reviewWorkbench?.createAnnotation === "function"
              ? await reviewWorkbench.createAnnotation(payload)
              : createDisabledReviewWorkbenchSnapshot(),
          );
        },
        async updateAnnotation(id, fields) {
          return cloneValue(
            typeof reviewWorkbench?.updateAnnotation === "function"
              ? await reviewWorkbench.updateAnnotation(id, fields)
              : createDisabledReviewWorkbenchSnapshot(),
          );
        },
        async generatePlan(payload) {
          return cloneValue(
            typeof reviewWorkbench?.generatePlan === "function"
              ? await reviewWorkbench.generatePlan(payload)
              : {
                ok: false,
                reason: "review-workbench-unavailable",
                plan: null,
                snapshot: createDisabledReviewWorkbenchSnapshot(),
              },
          );
        },
        async refreshStep(stage) {
          return cloneValue(
            typeof reviewWorkbench?.refreshStep === "function"
              ? await reviewWorkbench.refreshStep(stage)
              : createDisabledReviewWorkbenchSnapshot(),
          );
        },
      }),
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
