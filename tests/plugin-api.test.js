import { describe, it, assert } from "./test-framework.js";
import { createPluginAPI } from "../src/app/plugin-api.js";

describe("Plugin API", () => {
  it("should clone review workbench snapshots before returning them", async () => {
    const sourceSnapshot = {
      annotations: [
        {
          id: "annotation-1",
          content: "original",
        },
      ],
    };

    const api = createPluginAPI({
      host: {},
      runtimeInfo: {
        rootURI: "chrome://cleanroomtemplate/",
      },
      logger: {},
      settings: {},
      prefs: {},
      i18n: {},
      lifecycle: {},
      uiFactory: {},
      notifier: {},
      keyboard: {},
      http: {},
      dialog: {},
      progress: {},
      menuCommand: {},
      menuManager: {},
      itemPane: {},
      itemTree: {},
      commandPalette: {},
      preferencePanes: {},
      reader: {
        getReaderSummary() {
          return null;
        },
      },
      readerSelectionActions: {},
      servicesHub: {},
      getMainWindow() {
        return null;
      },
      runPrimaryAction() {
        return false;
      },
      executeAgentAction() {
        return false;
      },
      runAgentSelfCheck() {
        return {};
      },
      runAgentScenario() {
        return {};
      },
      collectAgentDiagnostics() {
        return {};
      },
      listAgentScenarios() {
        return [];
      },
      listCapabilitiesImpl() {
        return [];
      },
      getCapabilityImpl() {
        return null;
      },
      inspectItemPresentation() {
        return null;
      },
      listHostActions() {
        return [];
      },
      async runHostAction() {
        return null;
      },
      reviewWorkbench: {
        async getSnapshot() {
          return sourceSnapshot;
        },
      },
      getProtectionSummary() {
        return null;
      },
    });

    const first = await api.agent.reviewWorkbench.getSnapshot();
    first.annotations[0].content = "mutated";
    const second = await api.agent.reviewWorkbench.getSnapshot();

    assert.equal(second.annotations[0].content, "original");
  });

  it("should return disabled JSON contracts when review workbench methods are unavailable", async () => {
    const api = createPluginAPI({
      host: {},
      runtimeInfo: {
        rootURI: "chrome://cleanroomtemplate/",
      },
      logger: {},
      settings: {},
      prefs: {},
      i18n: {},
      lifecycle: {},
      uiFactory: {},
      notifier: {},
      keyboard: {},
      http: {},
      dialog: {},
      progress: {},
      menuCommand: {},
      menuManager: {},
      itemPane: {},
      itemTree: {},
      commandPalette: {},
      preferencePanes: {},
      reader: {
        getReaderSummary() {
          return null;
        },
      },
      readerSelectionActions: {},
      servicesHub: {},
      getMainWindow() {
        return null;
      },
      runPrimaryAction() {
        return false;
      },
      executeAgentAction() {
        return false;
      },
      runAgentSelfCheck() {
        return {};
      },
      runAgentScenario() {
        return {};
      },
      collectAgentDiagnostics() {
        return {};
      },
      listAgentScenarios() {
        return [];
      },
      listCapabilitiesImpl() {
        return [];
      },
      getCapabilityImpl() {
        return null;
      },
      inspectItemPresentation() {
        return null;
      },
      listHostActions() {
        return [];
      },
      async runHostAction() {
        return null;
      },
      reviewWorkbench: null,
      getProtectionSummary() {
        return null;
      },
    });

    const snapshot = await api.agent.reviewWorkbench.getSnapshot();
    const plan = await api.agent.reviewWorkbench.generatePlan({
      stage: "scope",
      annotationIds: [],
    });

    assert.equal(snapshot.disabled, true);
    assert.equal(snapshot.diagnostics.enabled, false);
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, "review-workbench-unavailable");
    assert.equal(plan.snapshot.disabled, true);
  });
});
