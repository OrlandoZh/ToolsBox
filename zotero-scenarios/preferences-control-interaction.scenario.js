registerZoteroScenario("preference pane control interaction", async ({ assert, addonConfig, helpers }) => {
  const PREFERENCE_HOST_WINDOW = Object.freeze({
    windowWidth: 800,
    windowHeight: 600,
  });
  const rootID = "cleanroomtemplate-preferences-root";
  const controlIDs = [
    "cleanroom-menu-label",
    "cleanroom-log-level",
    "cleanroom-theme-mode",
  ];

  function getPreferenceWindow() {
    if (typeof Services?.wm?.getMostRecentWindow === "function") {
      return Services.wm.getMostRecentWindow("zotero:pref") || null;
    }
    return null;
  }

  function assertSingleSurfaceEvidenceTarget(result, expectedSurfaceId, captureKindPrefix) {
    assert.equal(result.surfaceEvidenceTargets.length, 1);
    const target = result.surfaceEvidenceTargets[0];
    assert.equal(target.surfaceId, expectedSurfaceId);
    assert.equal(target.scope, "surface-local");
    assert.ok(String(target.captureKind || "").startsWith(captureKindPrefix));
    return target;
  }

  function assertPreferencePaneGeometryHealthy(result, surfaceTarget) {
    const rootClientWidth = Number(result.observedState.rootClientWidth || surfaceTarget.details?.rootClientWidth || 0);
    const layoutMode = String(
      result.observedState.layoutMode
      || surfaceTarget.details?.layoutMode
      || "",
    );
    const hasHorizontalOverflow = result.observedState.hasHorizontalOverflow === true
      || surfaceTarget.details?.hasHorizontalOverflow === true;

    assert.ok(rootClientWidth > 0, `expected rootClientWidth > 0, got ${rootClientWidth}`);
    assert.equal(hasHorizontalOverflow, false, `expected no horizontal overflow, got ${JSON.stringify(result.observedState)}`);
    assert.ok(layoutMode === "inline" || layoutMode === "stacked", `unexpected layoutMode '${layoutMode}'`);

    if (rootClientWidth <= 620) {
      assert.equal(layoutMode, "stacked", `expected stacked layout at width ${rootClientWidth}`);
    }
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
      ...PREFERENCE_HOST_WINDOW,
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
      ...PREFERENCE_HOST_WINDOW,
    }),
  );
  const logLevelResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.selectMenulist", {
      paneID,
      controlID: "cleanroom-log-level",
      value: targetLogLevel,
      ...PREFERENCE_HOST_WINDOW,
    }),
  );
  const themeModeResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.selectMenulist", {
      paneID,
      controlID: "cleanroom-theme-mode",
      value: targetThemeMode,
      ...PREFERENCE_HOST_WINDOW,
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
  const paneGeometryReady = Array.isArray(openResult.readiness?.checks)
    ? openResult.readiness.checks.find((entry) => entry?.name === "pane-geometry-ready")
    : null;
  assert.equal(paneTarget.details?.paneID, paneID);
  assert.equal(
    paneGeometryReady?.ok,
    true,
    `expected pane-geometry-ready readiness check to pass, got ${JSON.stringify(openResult.readiness)}`,
  );
  assert.ok(Number(paneTarget.details?.surfaceGeometry?.width || 0) > 0);
  assert.ok(Number(paneTarget.details?.surfaceGeometry?.height || 0) > 0);
  assert.equal(paneTarget.details?.windowResize?.requestedWidth, 800);
  assert.equal(paneTarget.details?.windowResize?.requestedHeight, 600);
  assertPreferencePaneGeometryHealthy(openResult, paneTarget);
  const menuLabelTarget = assertSingleSurfaceEvidenceTarget(menuLabelResult, "preference-control", "preference-control-");
  const logLevelTarget = assertSingleSurfaceEvidenceTarget(logLevelResult, "preference-control", "preference-control-");
  const themeModeTarget = assertSingleSurfaceEvidenceTarget(themeModeResult, "preference-control", "preference-control-");
  assert.equal(menuLabelTarget.details?.paneID, paneID);
  assert.equal(menuLabelTarget.details?.controlID, "cleanroom-menu-label");
  assert.equal(logLevelTarget.details?.paneID, paneID);
  assert.equal(logLevelTarget.details?.controlID, "cleanroom-log-level");
  assert.equal(themeModeTarget.details?.paneID, paneID);
  assert.equal(themeModeTarget.details?.controlID, "cleanroom-theme-mode");
  assertPreferencePaneGeometryHealthy(menuLabelResult, menuLabelTarget);
  assertPreferencePaneGeometryHealthy(logLevelResult, logLevelTarget);
  assertPreferencePaneGeometryHealthy(themeModeResult, themeModeTarget);

  const resetMenuLabelResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.setTextbox", {
      paneID,
      controlID: "cleanroom-menu-label",
      value: originalMenuLabel.value,
      ...PREFERENCE_HOST_WINDOW,
    }),
  );
  const resetLogLevelResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.selectMenulist", {
      paneID,
      controlID: "cleanroom-log-level",
      value: originalLogLevel.value,
      ...PREFERENCE_HOST_WINDOW,
    }),
  );
  const resetThemeModeResult = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("preferences.selectMenulist", {
      paneID,
      controlID: "cleanroom-theme-mode",
      value: originalThemeMode.value,
      ...PREFERENCE_HOST_WINDOW,
    }),
  );

  assert.equal(resetMenuLabelResult.ok, true, `preferences.setTextbox(reset) failed: ${JSON.stringify(resetMenuLabelResult)}`);
  assert.equal(resetLogLevelResult.ok, true, `preferences.selectMenulist(logLevel reset) failed: ${JSON.stringify(resetLogLevelResult)}`);
  assert.equal(resetThemeModeResult.ok, true, `preferences.selectMenulist(themeMode reset) failed: ${JSON.stringify(resetThemeModeResult)}`);
  assert.equal(services.prefs.getStringPref(menuLabelPref, ""), originalMenuLabel.value);
  assert.equal(services.prefs.getStringPref(logLevelPref, "info"), originalLogLevel.value);
  assert.equal(services.prefs.getStringPref(themeModePref, "follow-host"), originalThemeMode.value);

  const preferenceWindow = getPreferenceWindow();
  const preferenceDocument = preferenceWindow?.document || null;
  const root = preferenceDocument?.getElementById?.(rootID) || null;
  const resolvedControls = controlIDs.map((controlID) => preferenceDocument?.getElementById?.(controlID) || null);
  const controlsWithinRoot = root && typeof root.contains === "function"
    ? resolvedControls.every((control) => Boolean(control) && root.contains(control))
    : false;
  const domContract = helpers.toDomContractResult({
    routeId: "preference-pane",
    adapter: "preference-pane",
    checks: [
      helpers.createDomContractCheck("root-marker-present", Boolean(root), {
        label: "preference pane root marker is present",
        actual: root ? root.id : null,
        expected: rootID,
      }),
      helpers.createDomContractCheck("root-owner-document", root?.ownerDocument === preferenceDocument && Boolean(preferenceDocument), {
        label: "preference pane root uses the preference window document",
      }),
      helpers.createDomContractCheck("root-connected", root?.isConnected === true, {
        label: "preference pane root stays connected after interaction replay",
      }),
      helpers.createDomContractCheck("controls-under-root", controlsWithinRoot, {
        label: "preference controls stay attached under the plugin-owned root",
        actual: resolvedControls.map((control, index) => ({
          controlID: controlIDs[index],
          present: Boolean(control),
        })),
      }),
      helpers.createDomContractCheck("pref-writeback", (
        menuLabelResult.observedState.prefValueAfter === sentinelMenuLabel
        && logLevelResult.observedState.prefValueAfter === targetLogLevel
        && themeModeResult.observedState.prefValueAfter === targetThemeMode
      ), {
        label: "preference control replay writes back to prefs",
      }),
      helpers.createDomContractCheck("no-horizontal-overflow", openResult.observedState.hasHorizontalOverflow !== true, {
        label: "preference pane stays free of horizontal overflow",
        actual: openResult.observedState.hasHorizontalOverflow === true,
        expected: false,
      }),
    ],
    summary: "Preference pane DOM contract tracks root marker, ownerDocument, connection state, control ownership, pref writeback, and overflow health after live control replay.",
  });

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
    domContract,
  };
});
