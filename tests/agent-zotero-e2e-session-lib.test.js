import { describe, it, assert } from "./test-framework.js";
import {
  buildDefaultScenarioExclusionList,
  isRecoverableHotReloadTransportError,
  mergeRecoveredScenarioBatch,
  planScenarioBatchRecovery,
  prepareCycleSession,
} from "../scripts/agent-zotero-e2e-session-lib.mjs";

describe("Agent Zotero E2E Session Lib", () => {
  it("should classify RDP disconnects as recoverable hot reload transport errors", () => {
    assert.equal(isRecoverableHotReloadTransportError(new Error("RDP socket is not connected")), true);
    assert.equal(isRecoverableHotReloadTransportError(new Error("RDP socket closed")), true);
    assert.equal(isRecoverableHotReloadTransportError(new Error("Timed out waiting for add-on")), false);
  });

  it("should exclude curated pdf scenarios from the default E2E batch", () => {
    const exclusions = buildDefaultScenarioExclusionList({
      performanceBudgetScenarioName: "performance budget diagnostics",
      extraScenarioNames: [
        "curated pdf scan ocr smoke",
        "custom dev-only scenario",
      ],
    });

    assert.deepEqual(exclusions, [
      "curated pdf corpus import smoke",
      "curated pdf scan ocr smoke",
      "curated pdf permission edge smoke",
      "performance budget diagnostics",
      "custom dev-only scenario",
    ]);
  });

  it("should start the first cycle with a restarted session", async () => {
    const calls = [];
    const nextSession = { id: "restart-session", processLogs: [] };
    const result = await prepareCycleSession({
      cycle: 1,
      strategy: "hot",
      session: { id: "old-session", processLogs: [{ at: "1" }] },
      createSession: async () => {
        calls.push("create");
        return nextSession;
      },
      destroySession: async () => {
        calls.push("destroy");
      },
      runnerConfig: { binaryPath: "/Applications/Zotero.app/Contents/MacOS/zotero" },
      rdpPort: 23124,
      runtimeSanitization: null,
      config: {
        addonId: "test@example.com",
        addonRef: "cleanroomtemplate",
        instanceKey: "CleanroomTemplate",
      },
    });

    assert.deepEqual(calls, ["destroy", "create"]);
    assert.equal(result.session, nextSession);
    assert.equal(result.bootMode, "restart");
    assert.equal(result.processLogStart, 0);
    assert.equal(result.recoveredFromTransportDisconnect, false);
  });

  it("should keep hot reload when the existing session stays healthy", async () => {
    const calls = [];
    const session = {
      processLogs: [{ at: "1" }, { at: "2" }],
      rdp: {
        async reloadAddonById(addonId) {
          calls.push(["reload", addonId]);
        },
        async restartAddonRuntime(options) {
          calls.push(["restart-runtime", options.addonId, options.instanceKey]);
        },
      },
    };

    const result = await prepareCycleSession({
      cycle: 2,
      strategy: "hot",
      session,
      createSession: async () => {
        calls.push(["create"]);
        return { id: "unexpected" };
      },
      destroySession: async () => {
        calls.push(["destroy"]);
      },
      runnerConfig: { binaryPath: "/Applications/Zotero.app/Contents/MacOS/zotero" },
      rdpPort: 23124,
      runtimeSanitization: null,
      config: {
        addonId: "test@example.com",
        addonRef: "cleanroomtemplate",
        instanceKey: "CleanroomTemplate",
      },
    });

    assert.deepEqual(calls, [
      ["reload", "test@example.com"],
      ["restart-runtime", "test@example.com", "CleanroomTemplate"],
    ]);
    assert.equal(result.session, session);
    assert.equal(result.bootMode, "hot-reload");
    assert.equal(result.processLogStart, 2);
    assert.equal(result.recoveredFromTransportDisconnect, false);
  });

  it("should fall back to a restarted session when hot reload loses the RDP transport", async () => {
    const calls = [];
    const recoveredSession = { id: "recovered", processLogs: [] };
    const result = await prepareCycleSession({
      cycle: 2,
      strategy: "hot",
      session: {
        processLogs: [{ at: "1" }, { at: "2" }, { at: "3" }],
        rdp: {
          async reloadAddonById() {
            calls.push("reload");
            throw new Error("RDP socket closed");
          },
          async restartAddonRuntime() {
            calls.push("restart-runtime");
          },
        },
      },
      createSession: async () => {
        calls.push("create");
        return recoveredSession;
      },
      destroySession: async () => {
        calls.push("destroy");
      },
      runnerConfig: { binaryPath: "/Applications/Zotero.app/Contents/MacOS/zotero" },
      rdpPort: 23124,
      runtimeSanitization: null,
      config: {
        addonId: "test@example.com",
        addonRef: "cleanroomtemplate",
        instanceKey: "CleanroomTemplate",
      },
    });

    assert.deepEqual(calls, ["reload", "destroy", "create"]);
    assert.equal(result.session, recoveredSession);
    assert.equal(result.bootMode, "restart");
    assert.equal(result.processLogStart, 0);
    assert.equal(result.recoveredFromTransportDisconnect, true);
    assert.equal(result.recoveryReason, "RDP socket closed");
  });

  it("should plan recovery for incomplete chrome evaluation scenario batches", () => {
    const plan = planScenarioBatchRecovery({
      scenarios: {
        execution: {
          incomplete: true,
          timeoutKind: "chrome-evaluation-timeout",
          lastStartedScenario: "multi-window mount diagnostics",
          completed: [
            "baseline registration diagnostics",
            "live menu surface smoke",
          ],
        },
      },
      excludeScenarioNames: ["performance budget diagnostics"],
    });

    assert.equal(plan.eligible, true);
    assert.equal(plan.rerunStartScenario, "multi-window mount diagnostics");
    assert.deepEqual(plan.completedScenarioNames, [
      "baseline registration diagnostics",
      "live menu surface smoke",
    ]);
    assert.deepEqual(plan.recoveryExcludeScenarioNames, [
      "performance budget diagnostics",
      "baseline registration diagnostics",
      "live menu surface smoke",
    ]);
  });

  it("should merge a recovered scenario tail back into the original batch", () => {
    const merged = mergeRecoveredScenarioBatch({
      scenarios: {
        total: 4,
        passed: 2,
        failed: 1,
        skipped: 1,
        results: [
          { name: "baseline registration diagnostics", status: "passed" },
          { name: "live menu surface smoke", status: "passed" },
          { name: "multi-window mount diagnostics", status: "failed", synthetic: true },
        ],
        failedResults: [
          { name: "multi-window mount diagnostics", status: "failed", synthetic: true },
        ],
        execution: {
          completed: [
            "baseline registration diagnostics",
            "live menu surface smoke",
          ],
          incomplete: true,
          lastStartedScenario: "multi-window mount diagnostics",
          lastCompletedScenario: "live menu surface smoke",
          timeoutKind: "chrome-evaluation-timeout",
          filtersApplied: {
            excludeScenarioNames: ["performance budget diagnostics"],
          },
        },
      },
      recoveredBatch: {
        results: [
          { name: "multi-window mount diagnostics", status: "passed" },
          { name: "reader surface smoke", status: "passed" },
        ],
        failedResults: [],
        failure: null,
        execution: {
          completed: [
            "multi-window mount diagnostics",
            "reader surface smoke",
          ],
          incomplete: false,
          lastStartedScenario: "reader surface smoke",
          lastCompletedScenario: "reader surface smoke",
          timeoutKind: null,
        },
      },
      recovery: {
        bootMode: "restart",
        reasonKind: "chrome-evaluation-timeout",
        rerunStartScenario: "multi-window mount diagnostics",
        excludeScenarioNames: [
          "performance budget diagnostics",
          "baseline registration diagnostics",
          "live menu surface smoke",
        ],
      },
    });

    assert.equal(merged.failed, 0);
    assert.equal(merged.passed, 4);
    assert.equal(merged.skipped, 0);
    assert.deepEqual(merged.results.map((item) => item.name), [
      "baseline registration diagnostics",
      "live menu surface smoke",
      "multi-window mount diagnostics",
      "reader surface smoke",
    ]);
    assert.equal(merged.execution.incomplete, false);
    assert.equal(merged.execution.filtersApplied.recoveryAttempted, true);
    assert.equal(merged.execution.filtersApplied.recoverySucceeded, true);
    assert.equal(merged.recovery.succeeded, true);
  });
});
