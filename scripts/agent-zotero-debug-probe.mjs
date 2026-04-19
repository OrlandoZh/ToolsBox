import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  acquireBuildLock,
  buildAddon,
  buildStartupArgs,
  connectRdpWithLaunchDiagnostics,
  findFreePort,
  installProxyAddon,
  prepareRuntime,
  readAddonRuntimeInfo,
  readRunnerConfig,
  stopChildProcess,
} from "./zotero-runner-lib.mjs";
import {
  clearCapturedLogs,
  ensurePluginReady,
  installRuntimeLogBridge,
  readCapturedLogs,
} from "./zotero-agent-runtime-lib.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  wrapScriptError,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";
import { resolveZoteroDebugProbeArtifacts } from "./zotero-agent-artifacts.mjs";
import {
  buildDebugProbeMarkdown,
  getDebugProbeBundle,
  listDebugProbeBundles,
  parseDebugProbeArgs,
  selectDebugProbeBundleIDs,
} from "./agent-zotero-debug-probe-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function usage() {
  console.log(`Usage: node scripts/agent-zotero-debug-probe.mjs [options]

Options:
  --mode <smart|force>   Probe selection mode (default: smart)
  --probe <id>           Explicit probe id (repeatable)
  --fresh                Reset isolated runtime before launch
  --skip-build           Reuse current build output
  --list-probes          Print available probes and exit
`);
}

async function readJSONIfExists(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseChromeEvalResult(rawResult) {
  if (typeof rawResult === "string") {
    return JSON.parse(rawResult);
  }
  return rawResult;
}

async function evaluateJSONInChrome(rdp, expression, options = {}) {
  const raw = await rdp.evaluateInChrome(`(async () => {
    const value = await (${expression});
    return JSON.stringify(value);
  })()`, options);
  return parseChromeEvalResult(raw);
}

async function runHostActionInChrome({ rdp, config, actionId, payload = {} }) {
  return await evaluateJSONInChrome(rdp, `(async () => {
    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    if (!plugin?.api?.agent?.runHostAction) {
      return {
        actionId: ${JSON.stringify(actionId)},
        ok: false,
        failureKind: "plugin-api-missing",
        preconditions: [],
        observedState: {},
        readiness: {
          ok: false,
          total: 0,
          passed: 0,
          failed: 0,
          checks: [],
        },
        surfaceTarget: null,
      };
    }
    return await plugin.api.agent.runHostAction(
      ${JSON.stringify(actionId)},
      ${JSON.stringify(payload)},
    );
  })()`, {
    label: `debug-probe:host-action:${actionId}`,
    timeoutMs: 15000,
  });
}

async function runAgentScenarioInChrome({ rdp, config, name, payload = {} }) {
  return await evaluateJSONInChrome(rdp, `(async () => {
    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    if (!plugin?.api?.agent?.runAgentScenario) {
      return {
        ok: false,
        failureKind: "plugin-api-missing",
        scenario: ${JSON.stringify(name)},
      };
    }
    return plugin.api.agent.runAgentScenario(
      ${JSON.stringify(name)},
      ${JSON.stringify(payload)},
    );
  })()`, {
    label: `debug-probe:scenario:${name}`,
    timeoutMs: 15000,
  });
}

async function createReaderProbeFixture({ rdp }) {
  return await evaluateJSONInChrome(rdp, `(async () => {
    function escapePDFText(text) {
      return String(text || "")
        .replaceAll("\\\\", "\\\\\\\\")
        .replaceAll("(", "\\\\(")
        .replaceAll(")", "\\\\)");
    }

    function buildMinimalPDF(text) {
      const normalized = escapePDFText(text || "Cleanroom Debug Probe");
      const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        null,
      ];
      const stream = ["BT", "/F1 18 Tf", "72 720 Td", "(" + normalized + ") Tj", "ET"].join("\\n");
      objects[4] = "<< /Length " + stream.length + " >>\\nstream\\n" + stream + "\\nendstream";

      let pdf = "%PDF-1.4\\n";
      const offsets = [0];
      for (let index = 0; index < objects.length; index += 1) {
        offsets.push(pdf.length);
        pdf += String(index + 1) + " 0 obj\\n" + objects[index] + "\\nendobj\\n";
      }
      const xrefOffset = pdf.length;
      pdf += "xref\\n0 " + String(objects.length + 1) + "\\n";
      pdf += "0000000000 65535 f \\n";
      for (let index = 1; index < offsets.length; index += 1) {
        pdf += String(offsets[index]).padStart(10, "0") + " 00000 n \\n";
      }
      pdf += "trailer\\n<< /Size " + String(objects.length + 1) + " /Root 1 0 R >>\\nstartxref\\n" + String(xrefOffset) + "\\n%%EOF";

      return new TextEncoder().encode(pdf);
    }

    const title = "Debug Probe Reader Attachment";
    const parentItem = new Zotero.Item("report");
    parentItem.setField("title", title + " " + String(Date.now()));
    await parentItem.saveTx();

    const tmpDir = Services.dirsvc.get("TmpD", Components.interfaces.nsIFile).path;
    const filename = "cleanroom-debug-probe-" + String(Date.now()) + ".pdf";
    const filePath = typeof PathUtils !== "undefined"
      ? PathUtils.join(tmpDir, filename)
      : tmpDir + "/" + filename;
    const pdfBytes = buildMinimalPDF("Debug Probe Reader Validation");
    await Zotero.File.putContentsAsync(filePath, new Blob([pdfBytes], { type: "application/pdf" }));

    try {
      const attachment = await Zotero.Attachments.importFromFile({
        file: filePath,
        parentItemID: parentItem.id,
        title,
        contentType: "application/pdf",
      });
      return {
        parentItemID: parentItem.id,
        attachmentID: attachment.id,
      };
    } finally {
      if (typeof IOUtils !== "undefined" && IOUtils?.remove) {
        await IOUtils.remove(filePath, { ignoreAbsent: true });
      }
    }
  })()`, {
    label: "debug-probe:create-reader-fixture",
    timeoutMs: 15000,
  });
}

async function cleanupReaderProbeFixture({ rdp, fixture }) {
  if (!fixture?.parentItemID) {
    return false;
  }
  return await evaluateJSONInChrome(rdp, `(async () => {
    const item = Zotero.Items.get(${Number(fixture.parentItemID)});
    if (!item) {
      return false;
    }
    await item.eraseTx();
    return true;
  })()`, {
    label: "debug-probe:cleanup-reader-fixture",
    timeoutMs: 15000,
  });
}

async function snapshotPreferenceState({ rdp, config }) {
  return await evaluateJSONInChrome(rdp, `(() => {
    const branch = ${JSON.stringify(config.prefsPrefix)};
    const prefs = Services.prefs;
    const keys = ["menuLabel", "logLevel", "themeMode"];
    const snapshot = {};
    for (const key of keys) {
      const prefName = branch + "." + key;
      snapshot[key] = {
        prefName,
        hasUserValue: prefs.prefHasUserValue(prefName),
        value: prefs.getStringPref(prefName, ""),
      };
    }
    return snapshot;
  })()`, {
    label: "debug-probe:preference-snapshot",
    timeoutMs: 10000,
  });
}

async function restorePreferenceState({ rdp, snapshot }) {
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }
  return await evaluateJSONInChrome(rdp, `(async () => {
    const prefs = Services.prefs;
    const snapshot = ${JSON.stringify(snapshot)};
    for (const key of Object.keys(snapshot)) {
      const entry = snapshot[key];
      if (!entry || !entry.prefName) {
        continue;
      }
      if (!entry.hasUserValue) {
        try {
          prefs.clearUserPref(entry.prefName);
          continue;
        } catch {}
      }
      prefs.setStringPref(entry.prefName, String(entry.value || ""));
    }
    return true;
  })()`, {
    label: "debug-probe:preference-restore",
    timeoutMs: 10000,
  });
}

async function probePreferenceControlWriteback(context) {
  const { rdp, config } = context;
  const originalPrefs = await snapshotPreferenceState({ rdp, config });
  const paneID = `${config.addonRef}-preferences`;
  const sentinelMenuLabel = `Debug Probe ${Date.now()}`;
  const targetLogLevel = originalPrefs.logLevel?.value === "warn" ? "error" : "warn";
  const targetThemeMode = originalPrefs.themeMode?.value === "dark" ? "light" : "dark";

  try {
    const openResult = await runHostActionInChrome({
      rdp,
      config,
      actionId: "preferences.openPane",
      payload: {
        paneID,
        windowWidth: 800,
        windowHeight: 600,
      },
    });
    const textboxResult = await runHostActionInChrome({
      rdp,
      config,
      actionId: "preferences.setTextbox",
      payload: {
        paneID,
        controlID: "cleanroom-menu-label",
        value: sentinelMenuLabel,
        windowWidth: 800,
        windowHeight: 600,
      },
    });
    const logLevelResult = await runHostActionInChrome({
      rdp,
      config,
      actionId: "preferences.selectMenulist",
      payload: {
        paneID,
        controlID: "cleanroom-log-level",
        value: targetLogLevel,
        windowWidth: 800,
        windowHeight: 600,
      },
    });
    const themeModeResult = await runHostActionInChrome({
      rdp,
      config,
      actionId: "preferences.selectMenulist",
      payload: {
        paneID,
        controlID: "cleanroom-theme-mode",
        value: targetThemeMode,
        windowWidth: 800,
        windowHeight: 600,
      },
    });
    const settingsSnapshot = await runAgentScenarioInChrome({
      rdp,
      config,
      name: "settings-snapshot",
    });
    const domSnapshot = await evaluateJSONInChrome(rdp, `(() => {
      const win = Services.wm.getMostRecentWindow("zotero:pref");
      const doc = win?.document || null;
      const root = doc?.querySelector?.("[data-pref-root]") || doc?.getElementById?.("cleanroomtemplate-preferences-root") || null;
      const ids = [
        "cleanroom-menu-label",
        "cleanroom-log-level",
        "cleanroom-theme-mode",
      ];
      return {
        rootObserved: Boolean(root),
        rootID: root?.id || null,
        rootOwnerHref: root?.ownerDocument?.location?.href || null,
        controlCount: ids.filter((id) => Boolean(doc?.getElementById?.(id))).length,
        themeMode: root?.dataset?.themeMode || null,
        themeApplied: root?.dataset?.theme || null,
      };
    })()`, {
      label: "debug-probe:preference-dom-snapshot",
      timeoutMs: 10000,
    });

    const ok = openResult.ok === true
      && textboxResult.ok === true
      && logLevelResult.ok === true
      && themeModeResult.ok === true;

    return {
      probeId: "preference-control-writeback",
      surfaceId: "preference-pane",
      status: ok ? "completed" : "failed",
      promotion: ok ? "interaction-proved" : null,
      stopReason: ok ? "decisive-signal-observed" : "host-action-failed",
      summary: ok
        ? "Preference pane live control writeback and root ownership were observed."
        : "Preference pane probe failed before writeback closure was proven.",
      hostActions: [
        openResult,
        textboxResult,
        logLevelResult,
        themeModeResult,
      ],
      scenarioSnapshots: [
        {
          name: "settings-snapshot",
          value: settingsSnapshot,
        },
      ],
      evals: [
        {
          id: "preference-dom-snapshot",
          value: domSnapshot,
        },
      ],
    };
  } finally {
    await restorePreferenceState({ rdp, snapshot: originalPrefs }).catch(() => {});
  }
}

async function probeReaderSidebarViewClosure(context) {
  const { rdp, config } = context;
  const fixture = await createReaderProbeFixture({ rdp });

  try {
    const openResult = await runHostActionInChrome({
      rdp,
      config,
      actionId: "reader.open",
      payload: {
        itemID: fixture.attachmentID,
      },
    });
    const toggleResult = await runHostActionInChrome({
      rdp,
      config,
      actionId: "reader.toolbar.triggerButton",
      payload: {
        itemID: fixture.attachmentID,
        selector: "#sidebarToggleButton",
      },
    });
    const sidebarResult = await runHostActionInChrome({
      rdp,
      config,
      actionId: "reader.sidebar.selectView",
      payload: {
        itemID: fixture.attachmentID,
        view: "thumbnails",
        activationPolicy: "ui-required",
      },
    });
    const readerSnapshot = await runAgentScenarioInChrome({
      rdp,
      config,
      name: "reader-current",
      payload: {
        itemID: fixture.attachmentID,
      },
    });
    const domSnapshot = await evaluateJSONInChrome(rdp, `(() => {
      const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
      const frameWindow = plugin?.api?.reader?.getReaderFrameWindow?.(${Number(fixture.attachmentID)}) || null;
      const doc = frameWindow?.document || null;
      const trim = (value) => {
        const text = typeof value === "string" ? value.trim() : "";
        return text ? text.slice(0, 400) : null;
      };
      return {
        frameReady: doc?.readyState || null,
        outerContainerClassName: doc?.querySelector?.("#outerContainer")?.className || null,
        sidebarContainerClassName: doc?.querySelector?.("#sidebarContainer")?.className || null,
        sidebarToggleButtonOuterHTML: trim(doc?.querySelector?.("#sidebarToggleButton")?.outerHTML),
        thumbnailViewClassName: doc?.querySelector?.("#thumbnailView")?.className || null,
        outlineViewClassName: doc?.querySelector?.("#outlineView")?.className || null,
      };
    })()`, {
      label: "debug-probe:reader-dom-snapshot",
      timeoutMs: 10000,
    });

    const ok = openResult.ok === true
      && toggleResult.ok === true
      && sidebarResult.ok === true;

    return {
      probeId: "reader-sidebar-view-closure",
      surfaceId: "reader-sidebar-view",
      status: ok ? "completed" : "failed",
      promotion: ok ? "interaction-proved" : null,
      stopReason: ok ? "decisive-signal-observed" : "host-action-failed",
      summary: ok
        ? "Reader sidebar toggle and thumbnails postcondition were observed."
        : "Reader sidebar probe failed before closure was proven.",
      hostActions: [
        openResult,
        toggleResult,
        sidebarResult,
      ],
      scenarioSnapshots: [
        {
          name: "reader-current",
          value: readerSnapshot,
        },
      ],
      evals: [
        {
          id: "reader-dom-snapshot",
          value: domSnapshot,
        },
      ],
      fixture,
    };
  } finally {
    await cleanupReaderProbeFixture({ rdp, fixture }).catch(() => {});
  }
}

const PROBE_RUNNERS = Object.freeze({
  "preference-control-writeback": probePreferenceControlWriteback,
  "reader-sidebar-view-closure": probeReaderSidebarViewClosure,
});

async function createZoteroSession({ runnerConfig, rdpPort, runtimeSanitization = null }) {
  const processLogs = [];
  function appendProcessLogs(source, chunk) {
    const lines = String(chunk)
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      processLogs.push({
        at: new Date().toISOString(),
        source,
        level: source === "zotero.stderr" ? "stderr" : "stdout",
        message: line,
      });
    }
    if (processLogs.length > 1200) {
      processLogs.splice(0, processLogs.length - 1200);
    }
  }

  const args = buildStartupArgs({
    profilePath: runnerConfig.profilePath,
    dataDir: runnerConfig.dataDir,
    rdpPort,
    devtools: false,
  });

  const child = spawn(runnerConfig.binaryPath, args, {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (child.stdout) {
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      appendProcessLogs("zotero.stdout", chunk);
    });
  }
  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      appendProcessLogs("zotero.stderr", chunk);
    });
  }

  let rdp = null;
  try {
    const connection = await connectRdpWithLaunchDiagnostics({
      child,
      rdpPort,
      processLogs,
    });
    rdp = connection.rdp;
    return { child, rdp, processLogs };
  } catch (error) {
    if (rdp) {
      rdp.disconnect();
    }
    await stopChildProcess(child).catch(() => {});
    throw wrapScriptError(error, {
      failedStage: "launch-session",
      details: {
        runtimeSanitization,
        launchFailure: error?.launchFailure || null,
      },
    });
  }
}

async function teardownSession(session) {
  if (!session) {
    return;
  }
  session.rdp.disconnect();
  await stopChildProcess(session.child);
}

async function main() {
  const options = parseDebugProbeArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (options.listProbes) {
    for (const bundle of listDebugProbeBundles()) {
      console.log(`${bundle.id}\t${bundle.surfaceId}\t${bundle.summary}`);
    }
    return;
  }

  const artifacts = resolveZoteroDebugProbeArtifacts(projectRoot);
  const runnerConfig = await readRunnerConfig({ projectRoot, mode: "agent" });
  const buildLock = await acquireBuildLock({ owner: "agent-zotero-debug-probe.mjs" });

  try {
    const { config, buildPath } = await readAddonRuntimeInfo(projectRoot, {
      requireBuild: false,
    });
    if (!options.skipBuild) {
      buildAddon(projectRoot, {
        env: {
          CLEANROOM_BUILD_LOCK_HELD: "1",
        },
      });
    }

    const latestE2E = await readJSONIfExists(path.join(artifacts.artifactsDir, "agent-zotero-e2e.json"));
    const selection = selectDebugProbeBundleIDs({
      mode: options.mode,
      probeIDs: options.probeIDs,
      e2eReport: latestE2E,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      mode: selection.mode,
      selectionSource: selection.selectionSource,
      selectedProbeIDs: selection.selectedProbeIDs,
      smartSelection: selection.smartSelection,
      status: selection.selectedProbeIDs.length > 0 ? "pending" : "no-candidates",
      executed: [],
      logs: null,
      runtimeSanitization: null,
    };

    if (selection.selectedProbeIDs.length === 0) {
      await fs.mkdir(artifacts.artifactsDir, { recursive: true });
      await writeJSONArtifact(artifacts.reportJSON, report);
      await fs.writeFile(artifacts.reportMD, buildDebugProbeMarkdown(report), "utf-8");
      console.log(`[agent:zotero:debug-probe] No probe candidates selected in ${selection.mode} mode.`);
      return;
    }

    const rdpPort = runnerConfig.rdpPort || await findFreePort();
    const runtimeSanitization = await prepareRuntime({
      projectRoot,
      profilePath: runnerConfig.profilePath,
      dataDir: runnerConfig.dataDir,
      fresh: options.fresh,
      exclusiveProjectRuntime: true,
    });
    report.runtimeSanitization = runtimeSanitization;

    await installProxyAddon({
      profilePath: runnerConfig.profilePath,
      addonId: config.addonId,
      addonPath: buildPath,
    });

    let session = null;
    try {
      session = await createZoteroSession({
        runnerConfig,
        rdpPort,
        runtimeSanitization,
      });
      await session.rdp.waitForAddonById(config.addonId);
      await session.rdp.enableAddonById(config.addonId);
      await ensurePluginReady({
        rdp: session.rdp,
        config,
      });
      await installRuntimeLogBridge(session.rdp);
      await clearCapturedLogs(session.rdp);

      for (const probeID of selection.selectedProbeIDs) {
        const runner = PROBE_RUNNERS[probeID];
        const bundle = getDebugProbeBundle(probeID);
        if (!runner || !bundle) {
          report.executed.push({
            probeId: probeID,
            status: "unsupported",
            promotion: null,
            stopReason: "runner-missing",
            summary: "Probe runner is unavailable.",
          });
          continue;
        }
        try {
          const result = await runner({
            rdp: session.rdp,
            config,
            options,
          });
          report.executed.push(result);
        } catch (error) {
          report.executed.push({
            probeId: probeID,
            surfaceId: bundle.surfaceId,
            status: "failed",
            promotion: null,
            stopReason: "probe-exception",
            summary: String(error?.message || error),
          });
        }
      }

      report.logs = await readCapturedLogs(session.rdp);
      report.status = report.executed.every((entry) => entry.status === "completed")
        ? "completed"
        : "failed";
    } finally {
      await teardownSession(session);
    }

    await fs.mkdir(artifacts.artifactsDir, { recursive: true });
    await writeJSONArtifact(artifacts.reportJSON, report);
    await fs.writeFile(artifacts.reportMD, buildDebugProbeMarkdown(report), "utf-8");
    console.log(`[agent:zotero:debug-probe] Report: ${artifacts.reportJSON}`);

    if (report.status !== "completed") {
      throw createScriptError("validation", "One or more debug probes failed", {
        failedStage: "run-probes",
      });
    }
  } finally {
    await buildLock.release();
  }
}

if (isExecutedAsScript(import.meta.url)) {
  const artifacts = resolveZoteroDebugProbeArtifacts(projectRoot);
  main().catch(async (error) => {
    const failure = buildScriptFailureInfo(error, {
      durationMs: Date.now() - scriptStartedAt,
    });
    const report = {
      generatedAt: new Date().toISOString(),
      mode: null,
      selectionSource: null,
      selectedProbeIDs: [],
      smartSelection: null,
      status: "failed",
      executed: [],
      logs: null,
      runtimeSanitization: null,
      ...failure,
    };
    await fs.mkdir(artifacts.artifactsDir, { recursive: true });
    await writeJSONArtifact(artifacts.reportJSON, report);
    await fs.writeFile(artifacts.reportMD, buildDebugProbeMarkdown(report), "utf-8");
    console.error(`[agent:zotero:debug-probe] ${failure.errorMessage}`);
    process.exit(1);
  });
}
