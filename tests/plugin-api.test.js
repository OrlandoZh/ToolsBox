import { describe, it, assert } from "./test-framework.js";
import { createPluginAPI } from "../src/app/plugin-api.js";
import { buildDisabledSnapshot as buildDevUnavailableReviewWorkbenchSnapshot } from "../dev/agent-review-workbench/agent-review-workbench.js";

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
    assert.equal(typeof snapshot.session, "object");
    assert.equal(typeof snapshot.capabilities, "object");
    assert.equal(snapshot.capabilities.canCreateAnnotation, false);
    assert.equal(snapshot.capabilities.canGeneratePlan, false);
    assert.equal(Object.keys(snapshot.stepResults).length, 6);
    assert.deepEqual(Object.keys(snapshot.stale.byStage), Object.keys(snapshot.stepResults));

    const devUnavailableSnapshot = buildDevUnavailableReviewWorkbenchSnapshot(
      () => new Date(snapshot.generatedAt),
      {
        available: false,
        reason: "review-workbench-unavailable",
        summary: "Dev-only review runtime is unavailable in the current runtime.",
      },
    );
    assert.deepEqual(snapshot.session, devUnavailableSnapshot.session);
    assert.deepEqual(snapshot.capabilities, devUnavailableSnapshot.capabilities);
    assert.deepEqual(Object.keys(snapshot.stepResults), Object.keys(devUnavailableSnapshot.stepResults));
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, "review-workbench-unavailable");
    assert.equal(plan.snapshot.disabled, true);
  });
});
