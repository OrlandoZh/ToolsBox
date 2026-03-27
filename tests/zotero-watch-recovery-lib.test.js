import { describe, it, assert } from "./test-framework.js";
import { runWatchRecoveryFlow } from "../scripts/zotero-watch-recovery-lib.mjs";

function createLogger() {
  return {
    logs: [],
    errors: [],
    log(message) {
      this.logs.push(message);
    },
    error(message) {
      this.errors.push(message);
    },
  };
}

function createBaseHarness() {
  const watchReport = { reloads: [] };
  const processLogs = [];
  let index = 0;
  let session = {
    rdp: {
      async restartAddonRuntime() {
        return { started: true };
      },
    },
  };
  const calls = {
    stopManagedSession: [],
    launchManagedSession: [],
    attachExitWatcher: [],
    logSessionActivation: [],
    persistReport: 0,
  };

  return {
    mode: "watch",
    changedFiles: ["config/addon.config.json"],
    config: {
      addonId: "cleanroom-template@example.com",
      addonRef: "cleanroomtemplate",
      instanceKey: "CleanroomTemplate",
    },
    processLogs,
    watchReport,
    getNextIndex() {
      index += 1;
      return index;
    },
    async persistReport() {
      calls.persistReport += 1;
      return { markdownPath: "/tmp/zotero-watch-status.md" };
    },
    getSession() {
      return session;
    },
    setSession(nextSession) {
      session = nextSession;
    },
    binaryPath: "/Applications/Zotero.app/Contents/MacOS/zotero",
    args: ["--purgecaches"],
    rdpPort: 61514,
    attachExitWatcher(child) {
      calls.attachExitWatcher.push(child);
    },
    async stopManagedSession(activeSession) {
      calls.stopManagedSession.push(activeSession);
    },
    async launchManagedSession(options) {
      calls.launchManagedSession.push(options);
      return {
        child: { pid: 1234 },
        rdp: { tag: "restarted-rdp" },
        addon: { name: "Zotero Cleanroom Template", id: "cleanroom-template@example.com" },
        addonState: { found: true, userDisabled: false },
        readiness: { mode: "native" },
      };
    },
    logSessionActivation(payload) {
      calls.logSessionActivation.push(payload);
    },
    async installRuntimeLogBridge() {},
    async clearCapturedLogs() {},
    async ensurePluginReady() {
      return { mode: "native" };
    },
    async createWatchHealthEntry({
      index: entryIndex,
      trigger,
      summaryNote,
    }) {
      return {
        index: entryIndex,
        trigger,
        passed: true,
        issues: [],
        hints: [],
        logs: {
          errorCount: 0,
          warnCount: 0,
          recentErrors: [],
          recentWarnings: [],
        },
        summaryNote,
      };
    },
    async createWatchFailureEntry({
      index: entryIndex,
      trigger,
      error,
    }) {
      return {
        index: entryIndex,
        trigger,
        passed: false,
        issues: [error.message],
        hints: [],
        logs: {
          errorCount: 0,
          warnCount: 0,
          recentErrors: [],
          recentWarnings: [],
        },
        error: {
          message: error.message,
        },
      };
    },
    pushWatchReloadEntry(report, entry) {
      report.reloads.push(entry);
    },
    calls,
    getSessionValue() {
      return session;
    },
  };
}

describe("Zotero Watch Recovery Lib", () => {
  it("should stop after successful runtime recovery", async () => {
    const logger = createLogger();
    const harness = createBaseHarness();

    const result = await runWatchRecoveryFlow({
      ...harness,
      logger,
    });

    assert.equal(result.recovered, true);
    assert.equal(result.phase, "runtime-recovery");
    assert.equal(harness.watchReport.reloads.length, 1);
    assert.equal(harness.watchReport.reloads[0].trigger, "runtime-recovery");
    assert.equal(harness.calls.stopManagedSession.length, 0);
    assert.equal(harness.calls.launchManagedSession.length, 0);
    assert.equal(logger.errors.length, 0);
  });

  it("should fall back to session restart recovery when runtime recovery stays unhealthy", async () => {
    const logger = createLogger();
    const harness = createBaseHarness();
    harness.createWatchHealthEntry = async ({ index, trigger }) => ({
      index,
      trigger,
      passed: trigger === "session-restart-recovery",
      issues: trigger === "runtime-recovery" ? ["still unhealthy"] : [],
      hints: [],
      logs: {
        errorCount: 0,
        warnCount: 0,
        recentErrors: [],
        recentWarnings: [],
      },
      summaryNote: trigger,
    });

    const result = await runWatchRecoveryFlow({
      ...harness,
      logger,
    });

    assert.equal(result.recovered, true);
    assert.equal(result.phase, "session-restart-recovery");
    assert.deepEqual(
      harness.watchReport.reloads.map((entry) => entry.trigger),
      ["runtime-recovery", "session-restart-recovery"],
    );
    assert.equal(harness.calls.stopManagedSession.length, 1);
    assert.equal(harness.calls.launchManagedSession.length, 1);
    assert.equal(harness.calls.attachExitWatcher.length, 1);
    assert.equal(harness.calls.logSessionActivation.length, 1);
    assert.equal(harness.getSessionValue().rdp.tag, "restarted-rdp");
  });

  it("should return unrecovered when both recovery phases fail", async () => {
    const logger = createLogger();
    const harness = createBaseHarness();
    harness.createWatchHealthEntry = async ({ index, trigger }) => ({
      index,
      trigger,
      passed: false,
      issues: ["unhealthy"],
      hints: [],
      logs: {
        errorCount: 1,
        warnCount: 0,
        recentErrors: [],
        recentWarnings: [],
      },
      summaryNote: trigger,
    });
    harness.launchManagedSession = async () => {
      throw new Error("restart failed");
    };

    const result = await runWatchRecoveryFlow({
      ...harness,
      logger,
    });

    assert.equal(result.recovered, false);
    assert.equal(result.phase, "session-restart-recovery");
    assert.deepEqual(
      harness.watchReport.reloads.map((entry) => entry.trigger),
      ["runtime-recovery", "session-restart-recovery"],
    );
    assert.ok(logger.errors.length >= 2);
    assert.equal(harness.watchReport.reloads[1].error.message, "restart failed");
  });
});
