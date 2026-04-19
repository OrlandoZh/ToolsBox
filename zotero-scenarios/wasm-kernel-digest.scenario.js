registerZoteroScenario("wasm kernel digest diagnostics", async ({ assert, helpers, plugin }) => {
  const result = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("runtime.deriveWasmKernelDigest", {
      mode: "both",
      text: "Zotero 9 / 条目",
      timeoutMs: 5000,
    }),
  );

  assert.equal(result.ok, true, `runtime.deriveWasmKernelDigest failed: ${JSON.stringify(result)}`);
  assert.equal(result.readiness.ok, true, `runtime.deriveWasmKernelDigest readiness failed: ${JSON.stringify(result.readiness)}`);
  assert.equal(result.observedState.mode, "both");
  assert.equal(result.observedState.mainThread.digestHex, "de880c0b");
  assert.equal(result.observedState.mainThread.digestUint32, 3733457931);
  assert.equal(result.observedState.mainThread.byteLength, 17);
  assert.ok(Number(result.observedState.mainThread.timing?.totalDurationMs || 0) >= 0);
  assert.equal(result.observedState.worker.digestHex, "de880c0b");
  assert.equal(result.observedState.worker.digestUint32, 3733457931);
  assert.equal(result.observedState.worker.byteLength, 17);
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
    textLength: result.observedState.textLength,
    mainThread: result.observedState.mainThread,
    worker: result.observedState.worker,
    consistentAcrossTransports: result.observedState.consistentAcrossTransports,
    timingSummary: result.observedState.timingSummary,
    readiness: result.readiness,
  };
});
