registerZoteroScenario("memory diagnostics", async ({ assert, addonConfig, helpers }) => {
  const PREFERENCE_HOST_WINDOW = Object.freeze({
    windowWidth: 800,
    windowHeight: 600,
  });

  function nowMs() {
    if (typeof globalThis?.performance?.now === "function") {
      return globalThis.performance.now();
    }
    return Date.now();
  }

  function getMemoryDurationMs() {
    const value = Number(addonConfig?.cleanroomScenarioOptions?.memoryDurationMs || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function shouldIncludeAboutMemory() {
    return addonConfig?.cleanroomScenarioOptions?.memoryIncludeAboutMemory === true;
  }

  async function delay(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  function readGeckoMemorySnapshot() {
    try {
      const manager = Cc["@mozilla.org/memory-reporter-manager;1"]
        ?.getService(Ci.nsIMemoryReporterManager);
      if (!manager) {
        throw new Error("nsIMemoryReporterManager unavailable");
      }
      return {
        ok: true,
        source: "gecko-memory-reporter-manager",
        reporters: {
          resident: typeof manager.resident === "number" ? manager.resident : null,
          explicit: typeof manager.explicit === "number" ? manager.explicit : null,
        },
      };
    }
    catch (error) {
      return {
        ok: false,
        source: "gecko-memory-reporter-manager",
        error: {
          message: String(error?.message || error),
          stack: String(error?.stack || ""),
        },
        reporters: {},
      };
    }
  }

  async function collectAboutMemoryExport() {
    if (!shouldIncludeAboutMemory()) {
      return null;
    }
    try {
      const manager = Cc["@mozilla.org/memory-reporter-manager;1"]
        ?.getService(Ci.nsIMemoryReporterManager);
      if (!manager || typeof manager.getReports !== "function") {
        throw new Error("nsIMemoryReporterManager.getReports unavailable");
      }
      const rows = [];
      await new Promise((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error("Timed out collecting about:memory reports"));
          }
        }, 10000);
        const finish = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve();
          }
        };
        const handleReport = {
          callback(processName, path, kind, units, amount, description) {
            rows.push({
              process: String(processName || ""),
              path: String(path || ""),
              kind: String(kind ?? ""),
              units: String(units ?? ""),
              amount: Number(amount || 0),
              description: String(description || ""),
            });
          },
        };
        const finishReporting = {
          callback: finish,
        };
        try {
          try {
            manager.getReports(handleReport, null, finishReporting, null, false);
          }
          catch (error) {
            manager.getReports(handleReport, null, finishReporting, false);
          }
        }
        catch (error) {
          clearTimeout(timeout);
          settled = true;
          reject(error);
        }
      });
      rows.sort((left, right) => `${left.process}/${left.path}`.localeCompare(`${right.process}/${right.path}`));
      const generatedAt = new Date().toISOString();
      const text = [
        "# about:memory reporter export",
        `generatedAt: ${generatedAt}`,
        `reporterCount: ${rows.length}`,
        "",
        ...rows.map((row) => [
          `process: ${row.process || "-"}`,
          `path: ${row.path || "-"}`,
          `kind: ${row.kind || "-"}`,
          `units: ${row.units || "-"}`,
          `amount: ${row.amount}`,
          `description: ${row.description || "-"}`,
        ].join("\n")),
      ].join("\n\n");
      return {
        ok: true,
        source: "gecko-memory-reporter-manager.getReports",
        generatedAt,
        reporterCount: rows.length,
        text,
      };
    }
    catch (error) {
      return {
        ok: false,
        source: "gecko-memory-reporter-manager.getReports",
        generatedAt: new Date().toISOString(),
        reporterCount: 0,
        text: "",
        error: {
          message: String(error?.message || error),
          stack: String(error?.stack || ""),
        },
      };
    }
  }

  async function measureMemoryHostAction(actionId, payload, verify) {
    const startedAt = nowMs();
    const activity = {
      actionId,
      label: actionId,
      durationMs: 0,
      ready: false,
      surfaceId: null,
      captureKind: null,
      memory: {
        ok: false,
        before: null,
        after: null,
        error: null,
      },
    };

    activity.memory.before = readGeckoMemorySnapshot();
    try {
      const result = helpers.toSurfaceSmokeResult(
        await helpers.runHostAction(actionId, payload),
      );
      activity.durationMs = Math.max(0, Math.round(nowMs() - startedAt));
      assert.equal(result.ok, true, `${actionId} failed: ${JSON.stringify(result)}`);
      assert.equal(result.readiness.ok, true, `${actionId} readiness failed: ${JSON.stringify(result.readiness)}`);
      if (typeof verify === "function") {
        verify(result);
      }

      const surfaceTarget = Array.isArray(result.surfaceEvidenceTargets) && result.surfaceEvidenceTargets.length > 0
        ? result.surfaceEvidenceTargets[0]
        : null;
      activity.ready = result.readiness.ok;
      activity.surfaceId = surfaceTarget?.surfaceId || null;
      activity.captureKind = surfaceTarget?.captureKind || null;
    }
    finally {
      const minimumDurationMs = getMemoryDurationMs();
      const elapsedMs = Math.max(0, Math.round(nowMs() - startedAt));
      if (minimumDurationMs > elapsedMs) {
        await delay(minimumDurationMs - elapsedMs);
      }
      activity.memory.after = readGeckoMemorySnapshot();
      activity.memory.ok = activity.memory.before?.ok === true && activity.memory.after?.ok === true;
      activity.memory.error = activity.memory.ok
        ? null
        : (activity.memory.before?.error || activity.memory.after?.error || null);
      activity.durationMs = activity.durationMs || Math.max(0, Math.round(nowMs() - startedAt));
    }

    return activity;
  }

  const item = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Memory Diagnostics Item Pane Smoke",
    },
  });
  await helpers.selectItem(item.id);

  const itemPaneActivity = await measureMemoryHostAction(
    "itemPane.selectPane",
    {
      paneID: `${addonConfig.addonRef}-workflow`,
      behavior: "instant",
      activationPolicy: "ui-required",
    },
    (result) => {
      assert.equal(result.observedState.visible, true);
    },
  );

  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Memory Diagnostics Reader Smoke",
    },
  });
  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Memory Diagnostics PDF",
    text: "Memory diagnostics smoke validation",
  });

  const readerOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.open", {
      itemID: attachment.id,
    }),
  );
  assert.equal(readerOpen.ok, true, `reader.open failed: ${JSON.stringify(readerOpen)}`);

  const contextOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("contextPane.setOpen", {
      open: true,
    }),
  );
  assert.equal(contextOpen.ok, true, `contextPane.setOpen failed: ${JSON.stringify(contextOpen)}`);

  const contextPaneActivity = await measureMemoryHostAction(
    "contextPane.selectPane",
    {
      paneID: "info",
      behavior: "instant",
      activationPolicy: "ui-required",
    },
    (result) => {
      assert.equal(result.observedState.paneID, "info");
      assert.equal(result.observedState.visible, true);
    },
  );

  const toolbarTrigger = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.toolbar.triggerButton", {
      itemID: attachment.id,
      selector: "#sidebarToggleButton",
    }),
  );
  assert.equal(toolbarTrigger.ok, true, `reader.toolbar.triggerButton failed: ${JSON.stringify(toolbarTrigger)}`);

  const readerSidebarActivity = await measureMemoryHostAction(
    "reader.sidebar.selectView",
    {
      itemID: attachment.id,
      view: "thumbnails",
      activationPolicy: "ui-required",
    },
    (result) => {
      assert.equal(result.observedState.sidebarView, "thumbnails");
    },
  );

  const preferenceActivity = await measureMemoryHostAction(
    "preferences.openPane",
    {
      paneID: `${addonConfig.addonRef}-preferences`,
      ...PREFERENCE_HOST_WINDOW,
    },
    (result) => {
      assert.equal(result.observedState.selectedPaneID, `${addonConfig.addonRef}-preferences`);
      assert.equal(result.observedState.hasHorizontalOverflow, false);
    },
  );

  return {
    aboutMemoryExport: await collectAboutMemoryExport(),
    activities: [
      itemPaneActivity,
      contextPaneActivity,
      readerSidebarActivity,
      preferenceActivity,
    ],
  };
});

registerZoteroScenario("memory extended diagnostics", async ({ assert, addonConfig, helpers }) => {
  function nowMs() {
    if (typeof globalThis?.performance?.now === "function") {
      return globalThis.performance.now();
    }
    return Date.now();
  }

  function getMemoryDurationMs() {
    const value = Number(addonConfig?.cleanroomScenarioOptions?.memoryDurationMs || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function shouldIncludeAboutMemory() {
    return addonConfig?.cleanroomScenarioOptions?.memoryIncludeAboutMemory === true;
  }

  async function delay(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  function readGeckoMemorySnapshot() {
    try {
      const manager = Cc["@mozilla.org/memory-reporter-manager;1"]
        ?.getService(Ci.nsIMemoryReporterManager);
      if (!manager) {
        throw new Error("nsIMemoryReporterManager unavailable");
      }
      return {
        ok: true,
        source: "gecko-memory-reporter-manager",
        reporters: {
          resident: typeof manager.resident === "number" ? manager.resident : null,
          explicit: typeof manager.explicit === "number" ? manager.explicit : null,
        },
      };
    }
    catch (error) {
      return {
        ok: false,
        source: "gecko-memory-reporter-manager",
        error: {
          message: String(error?.message || error),
          stack: String(error?.stack || ""),
        },
        reporters: {},
      };
    }
  }

  async function collectAboutMemoryExport() {
    if (!shouldIncludeAboutMemory()) {
      return null;
    }
    try {
      const manager = Cc["@mozilla.org/memory-reporter-manager;1"]
        ?.getService(Ci.nsIMemoryReporterManager);
      if (!manager || typeof manager.getReports !== "function") {
        throw new Error("nsIMemoryReporterManager.getReports unavailable");
      }
      const rows = [];
      await new Promise((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error("Timed out collecting about:memory reports"));
          }
        }, 10000);
        const finish = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve();
          }
        };
        const handleReport = {
          callback(processName, path, kind, units, amount, description) {
            rows.push({
              process: String(processName || ""),
              path: String(path || ""),
              kind: String(kind ?? ""),
              units: String(units ?? ""),
              amount: Number(amount || 0),
              description: String(description || ""),
            });
          },
        };
        const finishReporting = {
          callback: finish,
        };
        try {
          try {
            manager.getReports(handleReport, null, finishReporting, null, false);
          }
          catch (error) {
            manager.getReports(handleReport, null, finishReporting, false);
          }
        }
        catch (error) {
          clearTimeout(timeout);
          settled = true;
          reject(error);
        }
      });
      rows.sort((left, right) => `${left.process}/${left.path}`.localeCompare(`${right.process}/${right.path}`));
      const generatedAt = new Date().toISOString();
      const text = [
        "# about:memory reporter export",
        `generatedAt: ${generatedAt}`,
        `reporterCount: ${rows.length}`,
        "",
        ...rows.map((row) => [
          `process: ${row.process || "-"}`,
          `path: ${row.path || "-"}`,
          `kind: ${row.kind || "-"}`,
          `units: ${row.units || "-"}`,
          `amount: ${row.amount}`,
          `description: ${row.description || "-"}`,
        ].join("\n")),
      ].join("\n\n");
      return {
        ok: true,
        source: "gecko-memory-reporter-manager.getReports",
        generatedAt,
        reporterCount: rows.length,
        text,
      };
    }
    catch (error) {
      return {
        ok: false,
        source: "gecko-memory-reporter-manager.getReports",
        generatedAt: new Date().toISOString(),
        reporterCount: 0,
        text: "",
        error: {
          message: String(error?.message || error),
          stack: String(error?.stack || ""),
        },
      };
    }
  }

  async function measureMemoryActivity(actionId, label, runActivity) {
    const startedAt = nowMs();
    const activity = {
      actionId,
      label,
      durationMs: 0,
      ready: false,
      surfaceId: null,
      captureKind: null,
      memory: {
        ok: false,
        before: null,
        after: null,
        error: null,
      },
    };

    activity.memory.before = readGeckoMemorySnapshot();
    try {
      const surfaceResult = await runActivity();
      if (surfaceResult) {
        const result = helpers.toSurfaceSmokeResult(surfaceResult);
        assert.equal(result.ok, true, `${actionId} failed: ${JSON.stringify(result)}`);
        assert.equal(result.readiness.ok, true, `${actionId} readiness failed: ${JSON.stringify(result.readiness)}`);
        const surfaceTarget = Array.isArray(result.surfaceEvidenceTargets) && result.surfaceEvidenceTargets.length > 0
          ? result.surfaceEvidenceTargets[0]
          : null;
        activity.ready = result.readiness.ok;
        activity.surfaceId = surfaceTarget?.surfaceId || null;
        activity.captureKind = surfaceTarget?.captureKind || null;
      }
      else {
        activity.ready = true;
      }
    }
    finally {
      const minimumDurationMs = getMemoryDurationMs();
      const elapsedMs = Math.max(0, Math.round(nowMs() - startedAt));
      if (minimumDurationMs > elapsedMs) {
        await delay(minimumDurationMs - elapsedMs);
      }
      activity.memory.after = readGeckoMemorySnapshot();
      activity.memory.ok = activity.memory.before?.ok === true && activity.memory.after?.ok === true;
      activity.memory.error = activity.memory.ok
        ? null
        : (activity.memory.before?.error || activity.memory.after?.error || null);
      activity.durationMs = Math.max(0, Math.round(nowMs() - startedAt));
    }

    return activity;
  }

  const batchItems = [];
  for (let index = 0; index < 8; index += 1) {
    batchItems.push(await helpers.createItem({
      itemType: "report",
      fields: {
        title: `Memory Extended Batch Item ${index + 1}`,
      },
    }));
  }

  const batchSelectionActivity = await measureMemoryActivity(
    "batch.itemSelection.cycle",
    "Batch Item Selection Cycle",
    async () => {
      for (const item of batchItems) {
        await helpers.selectItem(item.id);
      }
      return await helpers.runHostAction("itemPane.selectPane", {
        paneID: `${addonConfig.addonRef}-workflow`,
        behavior: "instant",
        activationPolicy: "ui-required",
      });
    },
  );

  const parentItem = await helpers.createItem({
    itemType: "report",
    fields: {
      title: "Memory Extended Reader Smoke",
    },
  });
  const attachment = await helpers.createPDF({
    parentItemID: parentItem.id,
    title: "Memory Extended PDF",
    text: Array.from({ length: 20 }, (_, index) => `Memory extended diagnostics paragraph ${index + 1}.`).join("\n\n"),
  });

  const readerOpen = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.open", {
      itemID: attachment.id,
    }),
  );
  assert.equal(readerOpen.ok, true, `reader.open failed: ${JSON.stringify(readerOpen)}`);

  const toolbarTrigger = helpers.toSurfaceSmokeResult(
    await helpers.runHostAction("reader.toolbar.triggerButton", {
      itemID: attachment.id,
      selector: "#sidebarToggleButton",
    }),
  );
  assert.equal(toolbarTrigger.ok, true, `reader.toolbar.triggerButton failed: ${JSON.stringify(toolbarTrigger)}`);

  const readerSidebarCycleActivity = await measureMemoryActivity(
    "reader.sidebar.viewCycle",
    "Reader Sidebar View Cycle",
    async () => {
      await helpers.runHostAction("reader.sidebar.selectView", {
        itemID: attachment.id,
        view: "annotations",
        activationPolicy: "ui-required",
      });
      return await helpers.runHostAction("reader.sidebar.selectView", {
        itemID: attachment.id,
        view: "thumbnails",
        activationPolicy: "ui-required",
      });
    },
  );

  return {
    workload: {
      kind: "extended",
      batchItemCount: batchItems.length,
      readerTextParagraphCount: 20,
      readerSidebarViews: ["annotations", "thumbnails"],
    },
    aboutMemoryExport: await collectAboutMemoryExport(),
    activities: [
      batchSelectionActivity,
      readerSidebarCycleActivity,
    ],
  };
});
