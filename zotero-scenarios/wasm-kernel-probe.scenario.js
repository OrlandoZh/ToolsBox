registerZoteroScenario("wasm kernel probe diagnostics", async ({ assert, helpers, plugin }) => {
  const result = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("runtime.probeWasmKernel", {
      mode: "both",
      left: 19,
      right: 23,
      timeoutMs: 5000,
    }),
  );

  assert.equal(result.ok, true, `runtime.probeWasmKernel failed: ${JSON.stringify(result)}`);
  assert.equal(result.readiness.ok, true, `runtime.probeWasmKernel readiness failed: ${JSON.stringify(result.readiness)}`);
  assert.equal(result.observedState.mode, "both");
  assert.equal(result.observedState.mainThread.sum, 42);
  assert.equal(result.observedState.mainThread.matchesExpected, true);
  assert.ok(Number(result.observedState.mainThread.timing?.totalDurationMs || 0) >= 0);
  assert.equal(result.observedState.worker.sum, 42);
  assert.equal(result.observedState.worker.matchesExpected, true);
  assert.ok(Number(result.observedState.worker.timing?.totalDurationMs || 0) >= 0);
  assert.equal(result.observedState.consistentAcrossTransports, true);
  assert.ok(Number(result.observedState.timingSummary?.totalDurationMs || 0) >= 0);
  assert.equal(result.observedState.timingSummary?.transportCount, 2);
  assert.ok(typeof plugin.api.runtime.rootURI === "string");

  return {
    rootURI: plugin.api.runtime.rootURI,
    mode: result.observedState.mode,
    wasmRelativePath: result.observedState.wasmRelativePath,
    workerRelativePath: result.observedState.workerRelativePath,
    mainThread: result.observedState.mainThread,
    worker: result.observedState.worker,
    consistentAcrossTransports: result.observedState.consistentAcrossTransports,
    timingSummary: result.observedState.timingSummary,
    readiness: result.readiness,
  };
});
