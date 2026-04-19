registerZoteroScenario("wasm kernel unlock diagnostics", async ({ assert, helpers, plugin }) => {
  const result = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("runtime.deriveWasmKernelUnlockToken", {
      mode: "both",
      bundleSeed: "cleanroom-stage2-shadow-seed-v1",
      overlayVersion: "descriptor-overlay-v1",
      timeoutMs: 5000,
    }),
  );

  assert.equal(result.ok, true, `runtime.deriveWasmKernelUnlockToken failed: ${JSON.stringify(result)}`);
  assert.equal(result.readiness.ok, true, `runtime.deriveWasmKernelUnlockToken readiness failed: ${JSON.stringify(result.readiness)}`);
  assert.equal(result.observedState.mode, "both");
  assert.equal(result.observedState.derivationVersion, "host-unlock-v1-shadow");
  assert.ok(Array.isArray(result.observedState.activationRequirements));
  assert.deepEqual(result.observedState.activationRequirements, [
    "profileHash",
    "dbAvailable",
    "noncePresent",
  ]);
  assert.equal(result.observedState.activationSatisfied, true);
  assert.deepEqual(result.observedState.activationMissing, []);
  assert.equal(result.observedState.shadowWouldApply, true);
  assert.ok(typeof result.observedState.hostBinding?.profileHash === "string" && result.observedState.hostBinding.profileHash.length > 0);
  assert.equal(result.observedState.hostBinding?.dbAvailable, true);
  assert.equal(result.observedState.hostBinding?.noncePresent, true);
  assert.ok(typeof result.observedState.mainThread?.stage2DigestHex === "string" && result.observedState.mainThread.stage2DigestHex.length === 8);
  assert.ok(typeof result.observedState.mainThread?.unlockTokenHex === "string" && result.observedState.mainThread.unlockTokenHex.length === 8);
  assert.ok(typeof result.observedState.worker?.stage2DigestHex === "string" && result.observedState.worker.stage2DigestHex.length === 8);
  assert.ok(typeof result.observedState.worker?.unlockTokenHex === "string" && result.observedState.worker.unlockTokenHex.length === 8);
  assert.equal(result.observedState.consistentAcrossTransports, true);
  assert.equal(result.observedState.mainThread.stage2DigestHex, result.observedState.worker.stage2DigestHex);
  assert.equal(result.observedState.mainThread.unlockTokenHex, result.observedState.worker.unlockTokenHex);
  assert.ok(Number(result.observedState.timingSummary?.totalDurationMs || 0) >= 0);
  assert.equal(result.observedState.timingSummary?.transportCount, 2);
  assert.ok(typeof plugin.api.runtime.rootURI === "string");

  return {
    rootURI: plugin.api.runtime.rootURI,
    mode: result.observedState.mode,
    derivationVersion: result.observedState.derivationVersion,
    bundleSeed: result.observedState.bundleSeed,
    overlayVersion: result.observedState.overlayVersion,
    activationSatisfied: result.observedState.activationSatisfied,
    activationMissing: result.observedState.activationMissing,
    hostBinding: result.observedState.hostBinding,
    mainThread: result.observedState.mainThread,
    worker: result.observedState.worker,
    consistentAcrossTransports: result.observedState.consistentAcrossTransports,
    timingSummary: result.observedState.timingSummary,
    readiness: result.readiness,
  };
});
