registerZoteroScenario("preference pane control interaction", async ({ assert, addonConfig, helpers }) => {
  function assertSingleSurfaceEvidenceTarget(result, expectedSurfaceId, captureKindPrefix) {
    assert.equal(result.surfaceEvidenceTargets.length, 1);
    const target = result.surfaceEvidenceTargets[0];
    assert.equal(target.surfaceId, expectedSurfaceId);
    assert.equal(target.scope, "surface-local");
    assert.ok(String(target.captureKind || "").startsWith(captureKindPrefix));
    return target;
  }

  const paneID = `${addonConfig.addonRef}-preferences`;
  const prefBranch = addonConfig.prefsPrefix;
  const services = Services;
  const menuLabelPref = `${prefBranch}.menuLabel`;
  const logLevelPref = `${prefBranch}.logLevel`;
  const themeModePref = `${prefBranch}.themeMode`;

  function snapshotStringPref(prefName, fallback = "") {
    return {
      prefName,
      hasUserValue: typeof services?.prefs?.prefHasUserValue === "function"
        ? services.prefs.prefHasUserValue(prefName)
        : true,
      value: String(services?.prefs?.getStringPref?.(prefName, fallback) ?? fallback),
    };
  }

  function restoreStringPref(snapshot) {
    if (!snapshot || !snapshot.prefName) {
      return;
    }
    if (!snapshot.hasUserValue && typeof services?.prefs?.clearUserPref === "function") {
      try {
        services.prefs.clearUserPref(snapshot.prefName);
        return;
      }
      catch {}
    }
    if (typeof services?.prefs?.setStringPref === "function") {
      services.prefs.setStringPref(snapshot.prefName, snapshot.value);
    }
  }

  const originalMenuLabel = snapshotStringPref(menuLabelPref, "");
  const originalLogLevel = snapshotStringPref(logLevelPref, "info");
  const originalThemeMode = snapshotStringPref(themeModePref, "follow-host");
  helpers.addCleanup(() => {
    restoreStringPref(originalMenuLabel);
    restoreStringPref(originalLogLevel);
    restoreStringPref(originalThemeMode);
  });

  const openResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.openPane", {
      paneID,
    }),
  );
  const sentinelMenuLabel = `Scenario Menu ${Date.now()}`;
  const targetLogLevel = originalLogLevel.value === "warn" ? "error" : "warn";
  const targetThemeMode = originalThemeMode.value === "dark" ? "light" : "dark";

  const menuLabelResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.setTextbox", {
      paneID,
      controlID: "cleanroom-menu-label",
      value: sentinelMenuLabel,
    }),
  );
  const logLevelResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.selectMenulist", {
      paneID,
      controlID: "cleanroom-log-level",
      value: targetLogLevel,
    }),
  );
  const themeModeResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.selectMenulist", {
      paneID,
      controlID: "cleanroom-theme-mode",
      value: targetThemeMode,
    }),
  );

  assert.equal(
    openResult.ok,
    true,
    `preferences.openPane failed: ${JSON.stringify(openResult)}`,
  );
  assert.equal(
    menuLabelResult.ok,
    true,
    `preferences.setTextbox failed: ${JSON.stringify(menuLabelResult)}`,
  );
  assert.equal(
    logLevelResult.ok,
    true,
    `preferences.selectMenulist(logLevel) failed: ${JSON.stringify(logLevelResult)}`,
  );
  assert.equal(
    themeModeResult.ok,
    true,
    `preferences.selectMenulist(themeMode) failed: ${JSON.stringify(themeModeResult)}`,
  );
  assert.equal(
    menuLabelResult.readiness.ok,
    true,
    `preferences.setTextbox readiness failed: ${JSON.stringify(menuLabelResult.readiness)}`,
  );
  assert.equal(
    logLevelResult.readiness.ok,
    true,
    `preferences.selectMenulist(logLevel) readiness failed: ${JSON.stringify(logLevelResult.readiness)}`,
  );
  assert.equal(
    themeModeResult.readiness.ok,
    true,
    `preferences.selectMenulist(themeMode) readiness failed: ${JSON.stringify(themeModeResult.readiness)}`,
  );
  assert.equal(menuLabelResult.observedState.prefValueAfter, sentinelMenuLabel);
  assert.equal(logLevelResult.observedState.prefValueAfter, targetLogLevel);
  assert.equal(themeModeResult.observedState.prefValueAfter, targetThemeMode);
  assert.equal(themeModeResult.observedState.paneThemeMode, targetThemeMode);
  assert.equal(themeModeResult.observedState.paneTheme, targetThemeMode);
  assert.equal(services.prefs.getStringPref(menuLabelPref, ""), sentinelMenuLabel);
  assert.equal(services.prefs.getStringPref(logLevelPref, ""), targetLogLevel);
  assert.equal(services.prefs.getStringPref(themeModePref, ""), targetThemeMode);
  const paneTarget = assertSingleSurfaceEvidenceTarget(openResult, "preference-pane", "surface-preference-");
  assert.equal(paneTarget.details?.paneID, paneID);
  assert.equal(paneTarget.details?.geometrySettled, true);
  assert.ok(Number(paneTarget.details?.surfaceGeometry?.width || 0) > 0);
  assert.ok(Number(paneTarget.details?.surfaceGeometry?.height || 0) > 0);
  const menuLabelTarget = assertSingleSurfaceEvidenceTarget(menuLabelResult, "preference-control", "preference-control-");
  const logLevelTarget = assertSingleSurfaceEvidenceTarget(logLevelResult, "preference-control", "preference-control-");
  const themeModeTarget = assertSingleSurfaceEvidenceTarget(themeModeResult, "preference-control", "preference-control-");
  assert.equal(menuLabelTarget.details?.paneID, paneID);
  assert.equal(menuLabelTarget.details?.controlID, "cleanroom-menu-label");
  assert.equal(logLevelTarget.details?.paneID, paneID);
  assert.equal(logLevelTarget.details?.controlID, "cleanroom-log-level");
  assert.equal(themeModeTarget.details?.paneID, paneID);
  assert.equal(themeModeTarget.details?.controlID, "cleanroom-theme-mode");

  const resetMenuLabelResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.setTextbox", {
      paneID,
      controlID: "cleanroom-menu-label",
      value: originalMenuLabel.value,
    }),
  );
  const resetLogLevelResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.selectMenulist", {
      paneID,
      controlID: "cleanroom-log-level",
      value: originalLogLevel.value,
    }),
  );
  const resetThemeModeResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.selectMenulist", {
      paneID,
      controlID: "cleanroom-theme-mode",
      value: originalThemeMode.value,
    }),
  );

  assert.equal(resetMenuLabelResult.ok, true, `preferences.setTextbox(reset) failed: ${JSON.stringify(resetMenuLabelResult)}`);
  assert.equal(resetLogLevelResult.ok, true, `preferences.selectMenulist(logLevel reset) failed: ${JSON.stringify(resetLogLevelResult)}`);
  assert.equal(resetThemeModeResult.ok, true, `preferences.selectMenulist(themeMode reset) failed: ${JSON.stringify(resetThemeModeResult)}`);
  assert.equal(services.prefs.getStringPref(menuLabelPref, ""), originalMenuLabel.value);
  assert.equal(services.prefs.getStringPref(logLevelPref, "info"), originalLogLevel.value);
  assert.equal(services.prefs.getStringPref(themeModePref, "follow-host"), originalThemeMode.value);

  return {
    paneID,
    menuLabelPref,
    logLevelPref,
    themeModePref,
    sentinelMenuLabel,
    targetLogLevel,
    targetThemeMode,
    surfaceEvidenceTargets: [
      ...menuLabelResult.surfaceEvidenceTargets,
      ...logLevelResult.surfaceEvidenceTargets,
      ...themeModeResult.surfaceEvidenceTargets,
    ],
  };
});
