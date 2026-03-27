function shouldInjectRecoveryFailure(options, phase) {
  const target = String(options?.injectFailure || "").trim().toLowerCase();
  if (!target) {
    return false;
  }

  if (target === `${phase}-once`) {
    if (!options.__injectedPhases) {
      options.__injectedPhases = new Set();
    }
    if (options.__injectedPhases.has(phase)) {
      return false;
    }
    options.__injectedPhases.add(phase);
    return true;
  }

  return target === phase;
}

export async function runWatchRecoveryFlow({
  mode,
  changedFiles,
  config,
  processLogs,
  watchReport,
  getNextIndex,
  persistReport,
  getSession,
  setSession,
  binaryPath,
  args,
  rdpPort,
  attachExitWatcher,
  stopManagedSession,
  launchManagedSession,
  logSessionActivation,
  installRuntimeLogBridge,
  clearCapturedLogs,
  ensurePluginReady,
  createWatchHealthEntry,
  createWatchFailureEntry,
  pushWatchReloadEntry,
  beginSessionTransition = () => {},
  endSessionTransition = () => {},
  recoveryTestOptions = null,
  logger = console,
}) {
  const runtimeRecoveryLogStart = processLogs.length;
  try {
    const currentSession = getSession();
    await installRuntimeLogBridge(currentSession.rdp);
    await clearCapturedLogs(currentSession.rdp);
    const runtimeState = await currentSession.rdp.restartAddonRuntime({
      addonId: config.addonId,
      addonRef: config.addonRef,
      instanceKey: config.instanceKey,
    });
    const readiness = await ensurePluginReady({
      rdp: currentSession.rdp,
      config,
    });
    if (shouldInjectRecoveryFailure(recoveryTestOptions, "runtime-recovery")) {
      throw new Error("Injected runtime recovery failure");
    }
    await clearCapturedLogs(currentSession.rdp);
    const postReadyLogStart = processLogs.length;
    const entry = await createWatchHealthEntry({
      index: getNextIndex(),
      trigger: "runtime-recovery",
      changedFiles,
      readinessMode: readiness.mode,
      rdp: currentSession.rdp,
      config,
      processLogs,
      processLogStart: postReadyLogStart,
      summaryNote: runtimeState.started
        ? "热重载异常后完成 runtime 恢复并通过健康检查"
        : "热重载异常后执行 runtime 恢复并通过健康检查",
    });
    pushWatchReloadEntry(watchReport, entry);
    const reportPaths = await persistReport();
    logger.log(
      `[zotero:${mode}] Recovery(runtime) ${entry.passed ? "passed" : "failed"}: ${reportPaths.markdownPath}`,
    );
    if (entry.passed) {
      return {
        recovered: true,
        phase: "runtime-recovery",
        entry,
      };
    }
  }
  catch (error) {
    const currentSession = getSession();
    const entry = await createWatchFailureEntry({
      index: getNextIndex(),
      trigger: "runtime-recovery",
      changedFiles,
      error,
      rdp: currentSession?.rdp,
      processLogs,
      processLogStart: runtimeRecoveryLogStart,
    });
    pushWatchReloadEntry(watchReport, entry);
    const reportPaths = await persistReport();
    logger.error(`[zotero:${mode}] Runtime recovery failed: ${error.stack || error.message}`);
    logger.error(`[zotero:${mode}] Status report updated: ${reportPaths.markdownPath}`);
  }

  const sessionRestartLogStart = processLogs.length;
  try {
    beginSessionTransition();
    let restartedSession;
    try {
      await stopManagedSession(getSession());
      restartedSession = await launchManagedSession({
        binaryPath,
        args,
        rdpPort,
        processLogs,
        config,
      });
    }
    finally {
      endSessionTransition();
    }
    setSession(restartedSession);
    attachExitWatcher(restartedSession.child);
    logSessionActivation({
      mode,
      addon: restartedSession.addon,
      addonState: restartedSession.addonState,
      readiness: restartedSession.readiness,
      config,
      devtools: false,
    });
    if (shouldInjectRecoveryFailure(recoveryTestOptions, "session-restart-recovery")) {
      throw new Error("Injected session restart recovery failure");
    }
    await clearCapturedLogs(restartedSession.rdp);
    const postReadyLogStart = processLogs.length;
    const entry = await createWatchHealthEntry({
      index: getNextIndex(),
      trigger: "session-restart-recovery",
      changedFiles,
      readinessMode: restartedSession.readiness.mode,
      rdp: restartedSession.rdp,
      config,
      processLogs,
      processLogStart: postReadyLogStart,
      summaryNote: "热重载异常后完成 Zotero 会话重启并通过健康检查",
    });
    pushWatchReloadEntry(watchReport, entry);
    const reportPaths = await persistReport();
    logger.log(
      `[zotero:${mode}] Recovery(restart) ${entry.passed ? "passed" : "failed"}: ${reportPaths.markdownPath}`,
    );
    return {
      recovered: entry.passed,
      phase: "session-restart-recovery",
      entry,
    };
  }
  catch (error) {
    const activeSession = getSession();
    const entry = await createWatchFailureEntry({
      index: getNextIndex(),
      trigger: "session-restart-recovery",
      changedFiles,
      error,
      rdp: activeSession?.rdp,
      processLogs,
      processLogStart: sessionRestartLogStart,
    });
    pushWatchReloadEntry(watchReport, entry);
    const reportPaths = await persistReport();
    logger.error(`[zotero:${mode}] Session restart recovery failed: ${error.stack || error.message}`);
    logger.error(`[zotero:${mode}] Status report updated: ${reportPaths.markdownPath}`);
    return {
      recovered: false,
      phase: "session-restart-recovery",
      entry,
    };
  }
}
