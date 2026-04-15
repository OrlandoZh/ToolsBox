function normalizeErrorMessage(error) {
  return String(error?.message || error || "").trim();
}

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

export function isRecoverableHotReloadTransportError(error) {
  const message = normalizeErrorMessage(error).toLowerCase();
  return (
    message.includes("rdp socket is not connected")
    || message.includes("rdp socket disconnected")
    || message.includes("rdp socket closed")
    || message.includes("rdp socket ended")
  );
}

async function restartCycleSession({
  session,
  createSession,
  destroySession,
  runnerConfig,
  rdpPort,
  runtimeSanitization,
}) {
  await destroySession(session);
  const nextSession = await createSession({
    runnerConfig,
    rdpPort,
    runtimeSanitization,
  });
  return {
    session: nextSession,
    bootMode: "restart",
    processLogStart: 0,
    recoveredFromTransportDisconnect: false,
    recoveryReason: null,
  };
}

export function planScenarioBatchRecovery({
  scenarios,
  excludeScenarioNames = [],
} = {}) {
  const execution = scenarios?.execution && typeof scenarios.execution === "object"
    ? scenarios.execution
    : null;
  const timeoutKind = String(execution?.timeoutKind || "").trim() || null;
  const rerunStartScenario = String(execution?.lastStartedScenario || "").trim() || null;
  const completedScenarioNames = uniqueStrings(execution?.completed);
  const recoveryExcludeScenarioNames = uniqueStrings([
    ...excludeScenarioNames,
    ...completedScenarioNames,
  ]);
  const eligible = (
    execution?.incomplete === true
    && timeoutKind === "chrome-evaluation-timeout"
    && Boolean(rerunStartScenario)
  );

  return {
    eligible,
    timeoutKind,
    rerunStartScenario,
    completedScenarioNames,
    recoveryExcludeScenarioNames,
  };
}

export function mergeRecoveredScenarioBatch({
  scenarios,
  recoveredBatch,
  recovery = {},
} = {}) {
  const baseResults = Array.isArray(scenarios?.results) ? scenarios.results : [];
  const recoveredResults = Array.isArray(recoveredBatch?.results) ? recoveredBatch.results : [];
  const baseExecution = scenarios?.execution && typeof scenarios.execution === "object"
    ? scenarios.execution
    : {};
  const recoveredExecution = recoveredBatch?.execution && typeof recoveredBatch.execution === "object"
    ? recoveredBatch.execution
    : {};
  const completedScenarioNames = uniqueStrings(baseExecution.completed);
  const keptResultCount = completedScenarioNames.length;
  const keptResults = baseResults.slice(0, keptResultCount);
  const results = [
    ...keptResults,
    ...recoveredResults,
  ];
  const failedResults = results.filter((entry) => entry?.status === "failed");
  const recoverySucceeded = recoveredExecution.incomplete !== true;

  return {
    ...scenarios,
    total: Number(scenarios?.total || 0),
    passed: results.filter((entry) => entry?.status === "passed").length,
    failed: failedResults.length,
    skipped: Math.max(0, Number(scenarios?.total || 0) - results.length),
    results,
    failedResults,
    failure: recoveredBatch?.failure || null,
    execution: {
      ...baseExecution,
      completed: uniqueStrings([
        ...completedScenarioNames,
        ...recoveredExecution.completed,
      ]),
      incomplete: recoveredExecution.incomplete === true,
      lastStartedScenario: String(
        recoveredExecution.lastStartedScenario
        || baseExecution.lastStartedScenario
        || recovery.rerunStartScenario
        || "",
      ).trim() || null,
      lastCompletedScenario: String(
        recoveredExecution.lastCompletedScenario
        || baseExecution.lastCompletedScenario
        || "",
      ).trim() || null,
      timeoutKind: String(recoveredExecution.timeoutKind || "").trim() || null,
      filtersApplied: {
        ...(baseExecution.filtersApplied && typeof baseExecution.filtersApplied === "object"
          ? baseExecution.filtersApplied
          : {}),
        recoveryAttempted: true,
        recoverySucceeded,
        recoveryBootMode: String(recovery.bootMode || "restart").trim() || "restart",
        recoveryRerunStartScenario: String(recovery.rerunStartScenario || "").trim() || null,
        recoveryExcludedScenarioNames: uniqueStrings(recovery.excludeScenarioNames),
      },
    },
    recovery: {
      attempted: true,
      succeeded: recoverySucceeded,
      bootMode: String(recovery.bootMode || "restart").trim() || "restart",
      reasonKind: String(recovery.reasonKind || "").trim() || null,
      rerunStartScenario: String(recovery.rerunStartScenario || "").trim() || null,
      completedScenarioNames,
      excludeScenarioNames: uniqueStrings(recovery.excludeScenarioNames),
    },
  };
}

export async function prepareCycleSession({
  cycle,
  strategy,
  session,
  createSession,
  destroySession,
  runnerConfig,
  rdpPort,
  runtimeSanitization = null,
  config,
}) {
  if (cycle === 1 || strategy === "restart") {
    return await restartCycleSession({
      session,
      createSession,
      destroySession,
      runnerConfig,
      rdpPort,
      runtimeSanitization,
    });
  }

  const processLogStart = Array.isArray(session?.processLogs)
    ? session.processLogs.length
    : 0;

  try {
    await session.rdp.reloadAddonById(config.addonId);
    await session.rdp.restartAddonRuntime({
      addonId: config.addonId,
      addonRef: config.addonRef,
      instanceKey: config.instanceKey,
    });
    return {
      session,
      bootMode: "hot-reload",
      processLogStart,
      recoveredFromTransportDisconnect: false,
      recoveryReason: null,
    };
  }
  catch (error) {
    if (!isRecoverableHotReloadTransportError(error)) {
      throw error;
    }

    const restarted = await restartCycleSession({
      session,
      createSession,
      destroySession,
      runnerConfig,
      rdpPort,
      runtimeSanitization,
    });
    return {
      ...restarted,
      recoveredFromTransportDisconnect: true,
      recoveryReason: normalizeErrorMessage(error) || "RDP transport disconnected during hot reload",
    };
  }
}
