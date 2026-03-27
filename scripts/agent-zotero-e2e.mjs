import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import {
  RdpClient,
  acquireBuildLock,
  buildAddon,
  buildStartupArgs,
  findFilesRecursive,
  findFreePort,
  installProxyAddon,
  prepareRuntime,
  readAddonRuntimeInfo,
  readRunnerConfig,
  stopChildProcess,
  toFileHref,
} from "./zotero-runner-lib.mjs";
import {
  buildE2EMarkdown,
  evaluateCycle,
  summarizeLogs,
} from "./agent-zotero-e2e-lib.mjs";
import { summarizeCapabilityCoverage } from "./agent-capability-lib.mjs";
import {
  mergeDiagnoses,
  pickPrimaryDiagnosis,
} from "./agent-zotero-diagnosis-lib.mjs";
import {
  clearCapturedLogs,
  ensurePluginReady,
  installRuntimeLogBridge,
  mergeLogSummaries,
  readCapturedLogs,
  runFunctionalActions,
} from "./zotero-agent-runtime-lib.mjs";
import {
  comparePNGImagesWithSips,
  evaluateVisualBaselineComparison,
  getVisualBaselineFilename,
  getVisualBaselineThreshold,
  readPNGAnalysis,
  summarizeVisualBaselineEntries,
} from "./agent-zotero-visual-lib.mjs";
import {
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";
import { resolveZoteroE2EArtifacts } from "./zotero-agent-artifacts.mjs";
import { inspectBaselineItemPaneLocaleFiles } from "./agent-zotero-locale-lib.mjs";
import { inspectStaticRuntimeBaselineFiles } from "./static-runtime-baseline-lib.mjs";
import { summarizeE2EReport } from "./agent-zotero-validation-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();
const VISUAL_CAPTURE_WINDOW_GEOMETRY = Object.freeze({
  width: 1000,
  height: 600,
});
const VISUAL_CAPTURE_POLICY = Object.freeze({
  stageOrder: Object.freeze(["library", "reader"]),
  maxAttemptsPerStage: 3,
  activationDelayMs: 320,
  betweenAttemptsMs: 220,
  stageWarmupMs: Object.freeze({
    library: 550,
    reader: 780,
  }),
});
const ADDITIVE_E2E_SUMMARY_FIELDS = Object.freeze([
  "status",
  "statusLabel",
  "ageMinutes",
  "ageText",
  "testFailed",
  "scenarioFailed",
  "logErrorCount",
  "logWarnCount",
  "visualDriftCount",
  "visualMissingCount",
  "visualCaptureStabilityObserved",
  "visualCaptureStageCount",
  "visualCaptureStableStageCount",
  "visualCaptureUnstableStageCount",
  "visualCaptureAttemptCount",
  "visualCaptureAllStagesStable",
  "visualCaptureStabilitySummary",
  "visualCaptureStabilityStages",
  "visualPrimaryBlockerKind",
  "visualPrimaryBlockerKindLabel",
  "visualGeometryMismatchCount",
  "visualAllStagesGeometryMatched",
  "visualGeometrySummary",
  "visualCanonicalCoverageKind",
  "visualCanonicalCoverageKindLabel",
  "visualCanonicalExpectedTargets",
  "visualCanonicalMismatchedTargets",
  "visualCanonicalCoverageSummary",
  "visualEvidenceObserved",
  "visualEvidenceItemCount",
  "visualEvidenceFailingItemCount",
  "visualEvidenceSummary",
  "visualEvidenceItems",
  "visualCaptureAttemptDiagnosisObserved",
  "visualCaptureAttemptDiagnosisItemCount",
  "visualCaptureAttemptDiagnosisSummary",
  "visualCaptureAttemptDiagnosisItems",
  "readerEventReport",
]);

function usage() {
  console.log(`Usage: node scripts/agent-zotero-e2e.mjs [options]

Options:
  --cycles <n>          Number of validation cycles (default: 2)
  --strategy <mode>     Reload mode: hot | restart (default: hot)
  --fresh               Start with a fresh runtime profile/data
  --skip-tests          Skip zotero-tests execution
  --no-build            Do not rebuild addon before cycle actions
  --no-ui-capture       Skip visual screenshot capture
  --update-visual-baseline  Refresh visual baseline screenshots from current run
  --visual-baseline-dir <path>  Override visual baseline directory
`);
}

function assert(condition, message, options = {}) {
  assertScript(condition, message, {
    category: options.category || "args",
    failedStage: options.failedStage || "parse-args",
  });
}

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

function parseChromeEvalResult(rawResult) {
  if (typeof rawResult === "string") {
    return JSON.parse(rawResult);
  }
  return rawResult;
}

function pickAdditiveE2ESummaryFields(report) {
  const summary = summarizeE2EReport(report);
  const picked = {};
  for (const field of ADDITIVE_E2E_SUMMARY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(summary, field)) {
      picked[field] = summary[field];
    }
  }
  return picked;
}

async function readZoteroRuntimeContext(rdp) {
  const rawResult = await rdp.evaluateInChrome(`(() => {
    try {
      const version = String(Services?.appinfo?.version || "").trim() || "unknown";
      return {
        zoteroVersion: version,
      };
    } catch (error) {
      return {
        zoteroVersion: "unknown",
        error: error?.message || String(error),
      };
    }
  })()`);
  const parsedResult = parseChromeEvalResult(rawResult);
  return {
    zoteroVersion: String(parsedResult?.zoteroVersion || "").trim() || "unknown",
  };
}

async function step(name, fn) {
  try {
    return await fn();
  }
  catch (error) {
    const message = error?.message || String(error);
    throw new Error(`[${name}] ${message}`);
  }
}

async function execFileText(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd || projectRoot,
        env: options.env || process.env,
        encoding: "utf8",
        maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const details = stderr?.trim() || stdout?.trim() || error.message;
          reject(new Error(details));
          return;
        }
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
        });
      },
    );
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getVisualStageWarmupMs(stage) {
  const configured = VISUAL_CAPTURE_POLICY.stageWarmupMs?.[stage];
  return Number.isFinite(configured) && configured > 0
    ? configured
    : 550;
}

function summarizeVisualCapturePolicy() {
  return {
    stageOrder: Array.from(VISUAL_CAPTURE_POLICY.stageOrder || []),
    maxAttemptsPerStage: Number(VISUAL_CAPTURE_POLICY.maxAttemptsPerStage || 1),
    activationDelayMs: Number(VISUAL_CAPTURE_POLICY.activationDelayMs || 0),
    betweenAttemptsMs: Number(VISUAL_CAPTURE_POLICY.betweenAttemptsMs || 0),
    stageWarmupMs: {
      library: getVisualStageWarmupMs("library"),
      reader: getVisualStageWarmupMs("reader"),
    },
    targetWindowGeometry: {
      width: Number(VISUAL_CAPTURE_WINDOW_GEOMETRY.width || 0),
      height: Number(VISUAL_CAPTURE_WINDOW_GEOMETRY.height || 0),
    },
  };
}

function parseArgs(argv) {
  const options = {
    cycles: 2,
    strategy: "hot",
    fresh: false,
    skipTests: false,
    skipBuild: false,
    captureUI: true,
    updateVisualBaseline: false,
    visualBaselineDir: path.join(projectRoot, "tests", "visual-baselines", "agent-zotero-e2e"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--cycles") {
      options.cycles = Number.parseInt(String(argv[i + 1] || "2"), 10);
      i += 1;
      continue;
    }
    if (arg === "--strategy") {
      options.strategy = String(argv[i + 1] || "hot").trim();
      i += 1;
      continue;
    }
    if (arg === "--fresh") {
      options.fresh = true;
      continue;
    }
    if (arg === "--skip-tests") {
      options.skipTests = true;
      continue;
    }
    if (arg === "--no-build") {
      options.skipBuild = true;
      continue;
    }
    if (arg === "--no-ui-capture") {
      options.captureUI = false;
      continue;
    }
    if (arg === "--update-visual-baseline") {
      options.updateVisualBaseline = true;
      continue;
    }
    if (arg === "--visual-baseline-dir") {
      options.visualBaselineDir = path.resolve(String(argv[i + 1] || ""));
      i += 1;
      continue;
    }
    throw createScriptError("args", `Unknown option: ${arg}`, {
      failedStage: "parse-args",
    });
  }

  assert(Number.isInteger(options.cycles) && options.cycles >= 1 && options.cycles <= 10, "cycles must be 1-10");
  assert(options.strategy === "hot" || options.strategy === "restart", "strategy must be hot or restart");
  return options;
}

async function discoverZoteroTests() {
  const testRoot = path.join(projectRoot, "zotero-tests");
  return await findFilesRecursive(
    testRoot,
    (filePath) => filePath.endsWith(".test.js"),
  );
}

async function discoverZoteroScenarios() {
  const scenarioRoot = path.join(projectRoot, "zotero-scenarios");
  return await findFilesRecursive(
    scenarioRoot,
    (filePath) => filePath.endsWith(".scenario.js"),
  );
}

async function runIntegratedTests({ rdp, config }) {
  const testFiles = await discoverZoteroTests();
  if (testFiles.length === 0) {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      results: [],
      skipped: true,
    };
  }

  const harnessHref = toFileHref(path.join(projectRoot, "scripts", "zotero-test-runtime.js"));
  const fileHrefs = testFiles.map((filePath) => toFileHref(filePath));
  const minimalConfig = {
    addonId: config.addonId,
    addonName: config.addonName,
    addonRef: config.addonRef,
    instanceKey: config.instanceKey,
  };

  const expression = `(async () => {
    const scope = {};
    Services.scriptloader.loadSubScript(${JSON.stringify(harnessHref)}, scope);
    return await scope.runCleanroomZoteroTests(${JSON.stringify({
      fileHrefs,
      addonConfig: minimalConfig,
    })});
  })()`;

  const rawResult = await rdp.evaluateInChrome(expression);
  const parsedResult = parseChromeEvalResult(rawResult);
  return {
    ...parsedResult.summary,
    results: parsedResult.results,
    skipped: false,
  };
}

async function runIntegratedScenarios({ rdp, config }) {
  const scenarioFiles = await discoverZoteroScenarios();
  if (scenarioFiles.length === 0) {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      results: [],
      skipped: true,
    };
  }

  const harnessHref = toFileHref(path.join(projectRoot, "scripts", "zotero-scenario-runtime.js"));
  const fileHrefs = scenarioFiles.map((filePath) => toFileHref(filePath));
  const minimalConfig = {
    addonId: config.addonId,
    addonName: config.addonName,
    addonRef: config.addonRef,
    instanceKey: config.instanceKey,
  };

  const expression = `(async () => {
    const scope = {};
    Services.scriptloader.loadSubScript(${JSON.stringify(harnessHref)}, scope);
    return await scope.runCleanroomZoteroScenarios(${JSON.stringify({
      fileHrefs,
      addonConfig: minimalConfig,
    })});
  })()`;

  const rawResult = await rdp.evaluateInChrome(expression);
  const parsedResult = parseChromeEvalResult(rawResult);
  return {
    ...parsedResult.summary,
    results: parsedResult.results,
    skipped: false,
  };
}

async function analyzeVisualCaptures(visuals) {
  const captures = Array.isArray(visuals?.captures) ? visuals.captures : [];
  const analysis = {
    ok: true,
    issues: [],
    summary: {
      totalCaptures: captures.length,
      verifiedCaptures: 0,
      distinctPairs: [],
      baseline: null,
      captureStability: null,
    },
  };

  for (const capture of captures) {
    try {
      const png = await readPNGAnalysis(capture.path);
      capture.analysis = png;
      analysis.summary.verifiedCaptures += 1;

      if (png.width < 400 || png.height < 300) {
        analysis.issues.push(`${capture.kind} 截图尺寸过小：${png.width}x${png.height}`);
      }
      if (png.sizeBytes < 50_000) {
        analysis.issues.push(`${capture.kind} 截图文件过小：${png.sizeBytes} bytes`);
      }
    }
    catch (error) {
      analysis.issues.push(`${capture.kind} 截图校验失败：${String(error?.message || error)}`);
    }
  }

  const libraryCapture = captures.find((item) => item.kind === "library");
  const readerCapture = captures.find((item) => item.kind === "reader");

  if (!libraryCapture) {
    analysis.issues.push("缺少库视图截图。");
  }
  if (!readerCapture) {
    analysis.issues.push("缺少 Reader 截图。");
  }

  if (libraryCapture?.analysis && readerCapture?.analysis) {
    const distinct = libraryCapture.analysis.sha256 !== readerCapture.analysis.sha256;
    analysis.summary.distinctPairs.push({
      left: "library",
      right: "reader",
      distinct,
    });
    if (!distinct) {
      analysis.issues.push("库视图截图与 Reader 截图完全相同，视觉验收未区分出不同界面。");
    }
  }

  if (Array.isArray(visuals?.warnings) && visuals.warnings.length > 0) {
    analysis.issues.push(...visuals.warnings.map((warning) => `可视化采集警告：${warning}`));
  }

  const stageStabilityEntries = Array.isArray(visuals?.captureStability?.stages)
    ? visuals.captureStability.stages
    : [];
  if (stageStabilityEntries.length > 0) {
    const stableStageCount = stageStabilityEntries.filter((entry) => entry?.stable === true).length;
    const unstableStageCount = stageStabilityEntries.filter((entry) => entry?.stable === false).length;
    analysis.summary.captureStability = {
      observed: true,
      stageCount: stageStabilityEntries.length,
      stableStageCount,
      unstableStageCount,
      allStagesStable: unstableStageCount === 0,
    };
  }

  analysis.ok = analysis.issues.length === 0;
  visuals.analysis = analysis;
  return visuals;
}

async function applyVisualBaselineAnalysis({
  visuals,
  bootMode,
  baselineDir,
  updateBaseline,
}) {
  if (!visuals?.analysis) {
    visuals.analysis = {
      ok: true,
      issues: [],
      summary: {
        totalCaptures: 0,
        verifiedCaptures: 0,
        distinctPairs: [],
        baseline: null,
        captureStability: null,
      },
    };
  }

  const captures = Array.isArray(visuals?.captures) ? visuals.captures : [];
  const entries = [];
  const shouldWriteBaseline = Boolean(updateBaseline);

  if (shouldWriteBaseline) {
    await fs.mkdir(baselineDir, { recursive: true });
  }

  for (const capture of captures) {
    const canonicalTarget = getVisualBaselineFilename({
      bootMode,
      kind: capture.kind,
    });
    const baselinePath = path.join(
      baselineDir,
      canonicalTarget,
    );
    const thresholds = getVisualBaselineThreshold(capture.kind);
    const entry = {
      kind: capture.kind,
      bootMode,
      canonicalTarget,
      path: baselinePath,
      thresholds,
      status: "missing",
      ok: true,
    };

    const baselineExists = await fs.access(baselinePath)
      .then(() => true)
      .catch(() => false);

    if (shouldWriteBaseline) {
      await fs.copyFile(capture.path, baselinePath);
      entry.status = baselineExists ? "updated" : "created";
      entry.updatedFrom = capture.path;
      entries.push(entry);
      continue;
    }

    if (!baselineExists) {
      entries.push(entry);
      continue;
    }

    try {
      const metrics = await comparePNGImagesWithSips({
        actualPath: capture.path,
        baselinePath,
        pixelDiffTolerance: thresholds.pixelDiffTolerance,
      });
      const evaluation = evaluateVisualBaselineComparison({
        kind: capture.kind,
        metrics,
        thresholds,
      });

      entry.status = "compared";
      entry.metrics = metrics;
      entry.ok = evaluation.ok;
      entry.issues = evaluation.issues;
      if (!evaluation.ok) {
        visuals.analysis.issues.push(...evaluation.issues);
      }
    }
    catch (error) {
      entry.status = "error";
      entry.ok = false;
      entry.error = String(error?.message || error);
      visuals.analysis.issues.push(`${capture.kind} 基线比对失败：${entry.error}`);
    }

    entries.push(entry);
  }

  visuals.analysis.baselines = entries;
  visuals.analysis.summary.baseline = {
    dir: baselineDir,
    updateRequested: shouldWriteBaseline,
    ...summarizeVisualBaselineEntries(entries),
  };
  visuals.analysis.ok = visuals.analysis.issues.length === 0;
  return visuals;
}

function buildMinimalPDFText(text) {
  const safeText = String(text || "Cleanroom Agent Validation")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
  const stream = `BT\n/F1 18 Tf\n36 96 Td\n(${safeText}) Tj\nET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 160] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const objectText of objects) {
    offsets.push(pdf.length);
    pdf += objectText;
  }

  const xrefOffset = pdf.length;
  pdf += `xref
0 ${objects.length + 1}
0000000000 65535 f
`;

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n
`;
  }

  pdf += `trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF
`;

  return pdf;
}

async function prepareVisualState({ rdp, config, stage }) {
  const payload = await rdp.evaluateInChrome(`(async () => {
    const STATE_KEY = "__CLEANROOM_AGENT_VISUAL_STATE__";
    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    if (!plugin?.api) {
      return { ok: false, reason: "plugin-api-missing" };
    }

    const PathUtilsAPI = typeof PathUtils !== "undefined"
      ? PathUtils
      : ChromeUtils.importESModule("resource://gre/modules/PathUtils.sys.mjs").PathUtils;
    const tmpDir = Services.dirsvc.get("TmpD", Components.interfaces.nsIFile).path;
    const state = globalThis[STATE_KEY] || (globalThis[STATE_KEY] = { tempFiles: [] });
    const ZoteroPane = Zotero.getMainWindow()?.ZoteroPane;
    if (!ZoteroPane) {
      return { ok: false, reason: "main-window-missing" };
    }

    const selectItem = async (itemID) => {
      if (typeof ZoteroPane.selectItem === "function") {
        await ZoteroPane.selectItem(itemID);
      }
      else if (ZoteroPane.itemsView && typeof ZoteroPane.itemsView.selectItem === "function") {
        await ZoteroPane.itemsView.selectItem(itemID);
      }
      else {
        throw new Error("No item selection API available");
      }
    };

    const waitFor = async (predicate, options = {}) => {
      const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 3000;
      const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : 100;
      const startedAt = Date.now();
      let lastValue = null;
      while ((Date.now() - startedAt) <= timeoutMs) {
        lastValue = await predicate();
        if (lastValue) {
          return lastValue;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      return lastValue;
    };

    const settleReader = async (reader) => {
      if (reader?._initPromise && typeof reader._initPromise.then === "function") {
        await reader._initPromise;
      }
      const primaryViewPromise = reader?._internalReader?._primaryView?.initializedPromise;
      if (primaryViewPromise && typeof primaryViewPromise.then === "function") {
        await primaryViewPromise;
      }
      const readerFrameWindow = await waitFor(() => {
        return reader?._internalReader?._primaryView?._iframeWindow || reader?._iframeWindow || null;
      }, {
        timeoutMs: 3000,
        intervalMs: 50,
      });
      if (readerFrameWindow?.document) {
        await waitFor(() => {
          return readerFrameWindow.document?.readyState === "complete"
            ? true
            : null;
        }, {
          timeoutMs: 3000,
          intervalMs: 50,
        });
        await new Promise((resolve) => {
          const raf = typeof readerFrameWindow.requestAnimationFrame === "function"
            ? readerFrameWindow.requestAnimationFrame.bind(readerFrameWindow)
            : (callback) => setTimeout(callback, 0);
          raf(() => raf(resolve));
        });
      }
    };

    const resolveReadyReaderSummary = () => {
      const summary = typeof plugin.api.agent.describeReader === "function"
        ? plugin.api.agent.describeReader(state.attachmentID)
        : null;
      if (!summary || Number(summary?.itemID || 0) !== Number(state.attachmentID)) {
        return null;
      }
      if (typeof plugin.api.agent.inspectReader === "function") {
        const snapshot = plugin.api.agent.inspectReader(state.attachmentID);
        if (!snapshot) {
          return null;
        }
        if (snapshot.active !== true) {
          return null;
        }
        if (snapshot.hasMatchingWindowState === false) {
          return null;
        }
      }
      return summary;
    };

    if (!state.itemID) {
      const item = new Zotero.Item("book");
      item.setField("title", "Agent Visual Validation");
      item.setField("abstractNote", "Cleanroom visual verification state");
      await item.saveTx();
      state.itemID = item.id;
    }

    if (${JSON.stringify(stage)} === "library") {
      await selectItem(state.itemID);
      const summary = plugin.api.agent.inspectItem(state.itemID);
      return {
        ok: true,
        stage: "library",
        itemID: state.itemID,
        summaryJSON: JSON.stringify(summary),
      };
    }

    if (!state.attachmentID) {
      const filePath = PathUtilsAPI.join(tmpDir, "cleanroom-agent-visual.pdf");
      await Zotero.File.putContentsAsync(
        filePath,
        new Blob([${JSON.stringify(buildMinimalPDFText("Cleanroom Reader Visual Validation"))}], {
          type: "application/pdf",
        }),
      );
      state.tempFiles.push(filePath);

      const attachment = await Zotero.Attachments.importFromFile({
        file: filePath,
        parentItemID: state.itemID,
        title: "Agent Visual PDF",
        contentType: "application/pdf",
      });
      state.attachmentID = attachment.id;
    }

    const activeReaderSummary = typeof plugin.api.reader.getActiveSummary === "function"
      ? plugin.api.reader.getActiveSummary()
      : null;
    const existingReader = typeof plugin.api.reader.getByItemID === "function"
      ? plugin.api.reader.getByItemID(state.attachmentID)
      : null;
    const shouldOpenReader = !existingReader || Number(activeReaderSummary?.itemID || 0) !== Number(state.attachmentID);
    const reader = shouldOpenReader
      ? await plugin.api.reader.openReader({
        itemID: state.attachmentID,
        openInBackground: false,
      })
      : existingReader;
    await settleReader(reader);
    const readyReaderSummary = await waitFor(resolveReadyReaderSummary, {
      timeoutMs: 3000,
      intervalMs: 100,
    });

    const readerSummary = readyReaderSummary || plugin.api.agent.describeReader(state.attachmentID);
    return {
      ok: true,
      stage: "reader",
      itemID: state.itemID,
      attachmentID: state.attachmentID,
      readerJSON: JSON.stringify(readerSummary),
    };
  })()`);

  if (!payload?.ok) {
    throw new Error(payload?.reason || `Unable to prepare visual state for ${stage}`);
  }
  if (typeof payload.summaryJSON === "string") {
    payload.summary = JSON.parse(payload.summaryJSON);
    delete payload.summaryJSON;
  }
  if (typeof payload.readerJSON === "string") {
    payload.reader = JSON.parse(payload.readerJSON);
    delete payload.readerJSON;
  }
  return payload;
}

async function cleanupVisualState({ rdp, config }) {
  await rdp.evaluateInChrome(`(async () => {
    const STATE_KEY = "__CLEANROOM_AGENT_VISUAL_STATE__";
    const state = globalThis[STATE_KEY];
    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    if (!state) {
      return true;
    }

    if (state.attachmentID && plugin?.api?.reader?.closeByItemID) {
      try {
        plugin.api.reader.closeByItemID(state.attachmentID);
      }
      catch {}
    }

    if (state.itemID) {
      const item = Zotero.Items.get(state.itemID);
      if (item) {
        await item.eraseTx();
      }
    }

    if (Array.isArray(state.tempFiles) && state.tempFiles.length > 0) {
      const IOUtilsAPI = typeof IOUtils !== "undefined"
        ? IOUtils
        : ChromeUtils.importESModule("resource://gre/modules/IOUtils.sys.mjs").IOUtils;
      for (const filePath of state.tempFiles) {
        try {
          await IOUtilsAPI.remove(filePath, { ignoreAbsent: true });
        }
        catch {}
      }
    }

    delete globalThis[STATE_KEY];
    return true;
  })()`);
}

async function getZoteroWindowBounds() {
  const lines = [
    'tell application "Zotero" to activate',
    'tell application "System Events" to tell process "Zotero"',
    'set frontmost to true',
    'set {xPos, yPos} to position of first window',
    'set {winWidth, winHeight} to size of first window',
    'return (xPos as string) & "," & (yPos as string) & "," & (winWidth as string) & "," & (winHeight as string)',
    'end tell',
  ];

  const { stdout } = await execFileText("osascript", lines.flatMap((line) => ["-e", line]));
  const parts = stdout.trim().split(",").map((value) => Number.parseInt(value, 10));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid Zotero window bounds: ${stdout.trim()}`);
  }

  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

async function activateZoteroWindowForCapture(activationDelayMs = VISUAL_CAPTURE_POLICY.activationDelayMs) {
  await execFileText("osascript", ["-e", 'tell application "Zotero" to activate']);
  await sleep(Math.max(0, Number(activationDelayMs || 0)));
}

async function setZoteroWindowGeometry(geometry = VISUAL_CAPTURE_WINDOW_GEOMETRY) {
  const width = Number.parseInt(String(geometry?.width || VISUAL_CAPTURE_WINDOW_GEOMETRY.width), 10);
  const height = Number.parseInt(String(geometry?.height || VISUAL_CAPTURE_WINDOW_GEOMETRY.height), 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return await getZoteroWindowBounds();
  }

  const lines = [
    "tell application \"System Events\" to tell process \"Zotero\"",
    "set frontmost to true",
    `set size of first window to {${width}, ${height}}`,
    "set {xPos, yPos} to position of first window",
    "set {winWidth, winHeight} to size of first window",
    "return (xPos as string) & \",\" & (yPos as string) & \",\" & (winWidth as string) & \",\" & (winHeight as string)",
    "end tell",
  ];
  const { stdout } = await execFileText("osascript", lines.flatMap((line) => ["-e", line]));
  const parts = stdout.trim().split(",").map((value) => Number.parseInt(value, 10));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid Zotero window bounds after geometry set: ${stdout.trim()}`);
  }
  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

async function ensureZoteroWindowReadyForCapture(options = {}) {
  const activationDelayMs = Number.isFinite(options.activationDelayMs) && options.activationDelayMs >= 0
    ? options.activationDelayMs
    : VISUAL_CAPTURE_POLICY.activationDelayMs;
  const settleDelayMs = Number.isFinite(options.settleDelayMs) && options.settleDelayMs >= 0
    ? options.settleDelayMs
    : 0;

  await activateZoteroWindowForCapture(activationDelayMs);
  const bounds = await setZoteroWindowGeometry(options.geometry || VISUAL_CAPTURE_WINDOW_GEOMETRY);
  await sleep(settleDelayMs);
  return bounds;
}

async function captureZoteroWindow(filePath, options = {}) {
  if (process.platform !== "darwin") {
    throw new Error("UI capture is currently implemented for macOS only");
  }

  let lastError = null;
  const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0
    ? options.maxAttempts
    : 3;
  const bounds = options.bounds && typeof options.bounds === "object"
    ? options.bounds
    : null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const captureBounds = bounds || await setZoteroWindowGeometry(options.geometry || VISUAL_CAPTURE_WINDOW_GEOMETRY);
      const rect = `${captureBounds.x},${captureBounds.y},${captureBounds.width},${captureBounds.height}`;
      await execFileText("screencapture", ["-x", "-R", rect, filePath]);
      return captureBounds;
    }
    catch (error) {
      lastError = error;
      await sleep(200);
    }
  }

  throw lastError || new Error("Unable to capture Zotero window");
}

function isStableVisualAttemptPair(previousAttempt, currentAttempt) {
  const prevHash = previousAttempt?.analysis?.sha256 || null;
  const currentHash = currentAttempt?.analysis?.sha256 || null;
  if (!prevHash || !currentHash || prevHash !== currentHash) {
    return false;
  }

  const prevWidth = Number(previousAttempt?.analysis?.width || 0);
  const currentWidth = Number(currentAttempt?.analysis?.width || 0);
  const prevHeight = Number(previousAttempt?.analysis?.height || 0);
  const currentHeight = Number(currentAttempt?.analysis?.height || 0);
  return prevWidth === currentWidth && prevHeight === currentHeight;
}

async function evaluateStableLowDriftAttemptPair({
  kind,
  previousAttempt,
  currentAttempt,
}) {
  if (!previousAttempt?.path || !currentAttempt?.path) {
    return {
      stable: false,
      stabilityMetrics: null,
    };
  }

  const thresholds = getVisualBaselineThreshold(kind);
  const thresholdChangedRatio = Number(thresholds?.changedRatio || 0) * 0.25;
  const thresholdMeanChannelDiff = Number(thresholds?.meanChannelDiff || 0) * 0.25;

  try {
    const metrics = await comparePNGImagesWithSips({
      actualPath: currentAttempt.path,
      baselinePath: previousAttempt.path,
      pixelDiffTolerance: Number(thresholds?.pixelDiffTolerance || 0),
    });
    const stabilityMetrics = {
      sameDimensions: typeof metrics?.sameDimensions === "boolean"
        ? metrics.sameDimensions
        : null,
      changedRatio: Number.isFinite(Number(metrics?.changedRatio))
        ? Number(metrics.changedRatio)
        : null,
      meanChannelDiff: Number.isFinite(Number(metrics?.meanChannelDiff))
        ? Number(metrics.meanChannelDiff)
        : null,
      thresholdChangedRatio,
      thresholdMeanChannelDiff,
    };
    const stable = (
      stabilityMetrics.sameDimensions === true
      && Number.isFinite(stabilityMetrics.changedRatio)
      && Number.isFinite(stabilityMetrics.meanChannelDiff)
      && stabilityMetrics.changedRatio <= thresholdChangedRatio
      && stabilityMetrics.meanChannelDiff <= thresholdMeanChannelDiff
    );
    return {
      stable,
      stabilityMetrics,
    };
  }
  catch {
    return {
      stable: false,
      stabilityMetrics: {
        sameDimensions: null,
        changedRatio: null,
        meanChannelDiff: null,
        thresholdChangedRatio,
        thresholdMeanChannelDiff,
      },
    };
  }
}

async function captureStableVisualStage({
  rdp,
  config,
  stage,
  cycle,
  captureDir,
}) {
  const policy = summarizeVisualCapturePolicy();
  const warmupMs = getVisualStageWarmupMs(stage);
  const maxAttempts = Math.max(1, Number(policy.maxAttemptsPerStage || 1));
  const attempts = [];
  let state = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Re-assert the same visual stage before every attempt so retries do not
    // drift away from the intended library/reader surface while the UI settles.
    state = await prepareVisualState({ rdp, config, stage });
    const bounds = await ensureZoteroWindowReadyForCapture({
      geometry: policy.targetWindowGeometry,
      activationDelayMs: policy.activationDelayMs,
      settleDelayMs: attempt === 1 ? warmupMs : Number(policy.betweenAttemptsMs || 0),
    });
    const attemptPath = path.join(captureDir, `cycle-${cycle}-${stage}-attempt-${attempt}.png`);
    await captureZoteroWindow(attemptPath, { bounds });
    const analysis = await readPNGAnalysis(attemptPath);
    attempts.push({
      index: attempt,
      path: attemptPath,
      bounds,
      analysis,
    });

    if (attempts.length >= 2 && isStableVisualAttemptPair(attempts[attempts.length - 2], attempts[attempts.length - 1])) {
      break;
    }
  }

  if (attempts.length === 0) {
    throw new Error(`No visual capture attempts recorded for stage '${stage}'.`);
  }

  const previousAttempt = attempts.length >= 2 ? attempts[attempts.length - 2] : null;
  const currentAttempt = attempts[attempts.length - 1] || null;
  const stableHashPair = previousAttempt && currentAttempt
    ? isStableVisualAttemptPair(previousAttempt, currentAttempt)
    : false;
  let stable = stableHashPair;
  let selectionReason = stableHashPair ? "stable-hash-pair" : "max-attempt-reached";
  let stabilityMetrics = null;
  if (!stableHashPair && previousAttempt && currentAttempt) {
    const lowDriftPair = await evaluateStableLowDriftAttemptPair({
      kind: stage,
      previousAttempt,
      currentAttempt,
    });
    stabilityMetrics = lowDriftPair.stabilityMetrics;
    if (lowDriftPair.stable) {
      stable = true;
      selectionReason = "stable-low-drift-pair";
    }
  }
  const selected = attempts[attempts.length - 1];
  const finalPath = path.join(captureDir, `cycle-${cycle}-${stage}.png`);
  if (selected.path !== finalPath) {
    await fs.copyFile(selected.path, finalPath);
  }

  return {
    capture: {
      kind: stage,
      path: finalPath,
      bounds: selected.bounds,
      metadata: state,
      analysis: selected.analysis,
    },
    stability: {
      kind: stage,
      stable,
      warmupMs,
      maxAttempts,
      attemptCount: attempts.length,
      selectedAttempt: selected.index,
      selectedPath: finalPath,
      selectedHash: selected.analysis?.sha256 || null,
      selectionReason,
      stabilityMetrics,
      attempts: attempts.map((entry) => ({
        index: entry.index,
        path: entry.path,
        bounds: entry.bounds,
        width: Number(entry.analysis?.width || 0) || null,
        height: Number(entry.analysis?.height || 0) || null,
        sizeBytes: Number(entry.analysis?.sizeBytes || 0) || null,
        sha256: entry.analysis?.sha256 || null,
      })),
    },
  };
}

async function captureCycleVisuals({
  rdp,
  config,
  cycle,
  bootMode,
  distDir,
  visualBaselineDir,
  updateVisualBaseline,
}) {
  const visuals = {
    attempted: true,
    captures: [],
    warnings: [],
    captureStability: {
      policy: summarizeVisualCapturePolicy(),
      stages: [],
      stableStageCount: 0,
      unstableStageCount: 0,
      allStagesStable: null,
    },
  };
  const captureDir = path.join(distDir, "agent-zotero-e2e-assets");
  await fs.mkdir(captureDir, { recursive: true });

  try {
    const libraryCapture = await captureStableVisualStage({
      rdp,
      config,
      stage: "library",
      cycle,
      captureDir,
    });
    visuals.captures.push(libraryCapture.capture);
    visuals.captureStability.stages.push(libraryCapture.stability);

    const readerCapture = await captureStableVisualStage({
      rdp,
      config,
      stage: "reader",
      cycle,
      captureDir,
    });
    visuals.captures.push(readerCapture.capture);
    visuals.captureStability.stages.push(readerCapture.stability);
  }
  catch (error) {
    visuals.warnings.push(String(error?.message || error));
  }
  finally {
    try {
      await cleanupVisualState({ rdp, config });
    }
    catch (error) {
      visuals.warnings.push(`cleanup failed: ${String(error?.message || error)}`);
    }
  }

  const stageEntries = Array.isArray(visuals.captureStability?.stages)
    ? visuals.captureStability.stages
    : [];
  visuals.captureStability.stableStageCount = stageEntries.filter((entry) => entry?.stable === true).length;
  visuals.captureStability.unstableStageCount = stageEntries.filter((entry) => entry?.stable === false).length;
  visuals.captureStability.allStagesStable = stageEntries.length > 0
    ? visuals.captureStability.unstableStageCount === 0
    : null;

  await analyzeVisualCaptures(visuals);
  await applyVisualBaselineAnalysis({
    visuals,
    bootMode,
    baselineDir: visualBaselineDir,
    updateBaseline: updateVisualBaseline,
  });
  return visuals;
}

async function createZoteroSession({
  runnerConfig,
  rdpPort,
}) {
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

  const rdp = new RdpClient();
  await rdp.connect({ port: rdpPort });
  return { child, rdp, processLogs };
}

async function teardownSession(session) {
  if (!session) {
    return;
  }
  session.rdp.disconnect();
  await stopChildProcess(session.child);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runnerConfig = await readRunnerConfig({ projectRoot, mode: "agent" });
  const { config, buildPath } = await readAddonRuntimeInfo(projectRoot);
  const rdpPort = runnerConfig.rdpPort || await findFreePort();
  const buildLock = await acquireBuildLock({ owner: "agent-zotero-e2e.mjs" });
  const zoteroArtifacts = resolveZoteroE2EArtifacts(projectRoot);

  try {
    await prepareRuntime({
      projectRoot,
      profilePath: runnerConfig.profilePath,
      dataDir: runnerConfig.dataDir,
      fresh: options.fresh,
    });
    await installProxyAddon({
      profilePath: runnerConfig.profilePath,
      addonId: config.addonId,
      addonPath: buildPath,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      strategy: options.strategy,
      zoteroVersion: "unknown",
      visualBaselineDir: options.visualBaselineDir,
      visualBaselineMode: options.updateVisualBaseline ? "update" : "compare",
      cycles: [],
      passed: true,
      issues: [],
      hints: [],
      diagnostics: [],
      primaryDiagnosis: null,
    };

    let session = null;
    try {
      for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
        if (!options.skipBuild) {
          buildAddon(projectRoot, {
            env: {
              CLEANROOM_BUILD_LOCK_HELD: "1",
            },
          });
        }

        const needRestart = cycle === 1 || options.strategy === "restart";
        if (needRestart) {
          await teardownSession(session);
          session = await createZoteroSession({
            runnerConfig,
            rdpPort,
          });
        } else {
          await session.rdp.reloadAddonById(config.addonId);
          await session.rdp.restartAddonRuntime({
            addonId: config.addonId,
            addonRef: config.addonRef,
            instanceKey: config.instanceKey,
          });
        }
        const processLogStart = needRestart ? 0 : session.processLogs.length;

        await step("wait-addon", async () => session.rdp.waitForAddonById(config.addonId));
        await step("enable-addon", async () => session.rdp.enableAddonById(config.addonId));

        const readiness = await step("ensure-plugin-ready", async () => ensurePluginReady({
          rdp: session.rdp,
          config,
        }));
        const runtimeContext = await step("read-runtime-context", async () => readZoteroRuntimeContext(session.rdp));
        if (report.zoteroVersion === "unknown" && runtimeContext.zoteroVersion !== "unknown") {
          report.zoteroVersion = runtimeContext.zoteroVersion;
        }

        await step("install-log-bridge", async () => installRuntimeLogBridge(session.rdp));
        await step("clear-logs", async () => clearCapturedLogs(session.rdp));

        const checks = await step("run-actions", async () => runFunctionalActions({
          rdp: session.rdp,
          config,
        }));
        const staticRuntimeHealth = await step("check-static-runtime-files", async () => inspectStaticRuntimeBaselineFiles(projectRoot, config));
        checks.staticRuntimeOK = staticRuntimeHealth.ok;
        checks.staticRuntimeBaselineOK = staticRuntimeHealth.baselineOK === true;
        checks.staticRuntimeMissingCount = Number(staticRuntimeHealth.missingCount || 0);
        checks.staticRuntimeMissingEntries = Array.isArray(staticRuntimeHealth.missingEntries)
          ? staticRuntimeHealth.missingEntries
          : [];
        checks.staticRuntimeDriftCount = Number(staticRuntimeHealth.driftCount || 0);
        checks.staticRuntimeDriftEntries = Array.isArray(staticRuntimeHealth.driftEntries)
          ? staticRuntimeHealth.driftEntries
          : [];
        const localeHealth = await step("check-locale-files", async () => inspectBaselineItemPaneLocaleFiles(projectRoot));
        checks.localeFTLOK = localeHealth.ok;
        checks.localeFTLMissingCount = Number(localeHealth.missingCount || 0);
        checks.localeFTLMissingEntries = Array.isArray(localeHealth.missingEntries)
          ? localeHealth.missingEntries
          : [];
        checks.localeFTLValueDriftCount = Number(localeHealth.driftCount || 0);
        checks.localeFTLValueDriftEntries = Array.isArray(localeHealth.driftEntries)
          ? localeHealth.driftEntries
          : [];
        const tests = options.skipTests
          ? null
          : await step("run-tests", async () => runIntegratedTests({
            rdp: session.rdp,
            config,
          }));
        const scenarios = await step("run-scenarios", async () => runIntegratedScenarios({
          rdp: session.rdp,
          config,
        }));
        const scenarioResults = Array.isArray(scenarios?.results) ? scenarios.results : [];
        const readerHookScenario = scenarioResults.find((item) => item?.name === "reader event hook diagnostics") || null;
        const readerFineGrainedScenario = scenarioResults.find((item) => item?.name === "reader fine-grained hook diagnostics") || null;
        checks.readerEventHookScenarioObserved = Boolean(readerHookScenario);
        checks.readerEventHookScenarioPassed = readerHookScenario
          ? readerHookScenario.status === "passed"
          : null;
        checks.readerEventFineGrainedScenarioObserved = Boolean(readerFineGrainedScenario);
        checks.readerEventFineGrainedScenarioPassed = readerFineGrainedScenario
          ? readerFineGrainedScenario.status === "passed"
          : null;
        const readerEventHostObservedTypes = uniqueStrings([
          readerFineGrainedScenario?.details?.selectionProbe?.type,
          readerFineGrainedScenario?.details?.toolbarProbe?.type,
          readerFineGrainedScenario?.details?.sidebarHeaderProbe?.type,
          ...(Array.isArray(readerFineGrainedScenario?.details?.menuProbes)
            ? readerFineGrainedScenario.details.menuProbes.map((item) => item?.type)
            : []),
        ]);
        checks.readerEventHostObservedTypes = readerEventHostObservedTypes;
        checks.readerEventHostObservedTypeCount = readerEventHostObservedTypes.length;
        checks.readerEventToolbarHookObserved = readerEventHostObservedTypes.includes("renderToolbar");
        const runtimeLogSummary = await step("read-logs", async () => readCapturedLogs(session.rdp));
        const visuals = options.captureUI
          ? await step("capture-ui", async () => captureCycleVisuals({
            rdp: session.rdp,
            config,
            cycle,
            bootMode: needRestart ? "restart" : "hot-reload",
            distDir: zoteroArtifacts.artifactsDir,
            visualBaselineDir: options.visualBaselineDir,
            updateVisualBaseline: options.updateVisualBaseline,
          }))
          : {
            attempted: false,
            captures: [],
            warnings: ["UI capture skipped by --no-ui-capture"],
          };
        const nativeLogs = session.processLogs.slice(processLogStart);
        const nativeLogSummary = summarizeLogs(nativeLogs);
        const logSummary = mergeLogSummaries(nativeLogSummary, runtimeLogSummary);

        const cycleResult = {
          index: cycle,
          bootMode: needRestart ? "restart" : "hot-reload",
          zoteroVersion: runtimeContext.zoteroVersion,
          readinessMode: readiness.mode,
          checks,
          tests,
          scenarios,
          visuals,
          logs: logSummary,
          rawLogs: {
            native: nativeLogs,
            runtime: runtimeLogSummary,
          },
        };
        const evaluated = evaluateCycle(cycleResult);
        cycleResult.passed = evaluated.passed;
        cycleResult.issues = evaluated.issues;
        cycleResult.hints = evaluated.hints;
        cycleResult.diagnostics = evaluated.diagnoses;
        cycleResult.primaryDiagnosis = evaluated.primaryDiagnosis;
        cycleResult.summaryNote = evaluated.passed
          ? "动作与校验通过"
          : `发现 ${evaluated.issues.length} 项问题`;
        report.cycles.push(cycleResult);
      }
    } finally {
      await teardownSession(session);
    }

    const allIssues = report.cycles.flatMap((cycle) => cycle.issues || []);
    const allHints = report.cycles.flatMap((cycle) => cycle.hints || []);
    const allDiagnoses = report.cycles.flatMap((cycle) => cycle.diagnostics || []);
    report.issues = Array.from(new Set(allIssues));
    report.hints = Array.from(new Set(allHints));
    report.diagnostics = mergeDiagnoses(allDiagnoses);
    report.primaryDiagnosis = pickPrimaryDiagnosis(report.diagnostics);
    report.capabilitySummary = summarizeCapabilityCoverage(report, { config });
    report.passed = report.issues.length === 0;
    report.durationMs = Math.max(0, Date.now() - scriptStartedAt);
    if (!report.passed) {
      Object.assign(
        report,
        buildScriptFailureInfo(
          createScriptError(
            "validation",
            report.primaryDiagnosis?.summary || report.issues[0] || "Zotero E2E validation failed",
            { failedStage: "validation-summary" },
          ),
          { durationMs: report.durationMs },
        ),
      );
    } else {
      report.errorCategory = null;
      report.errorCategoryLabel = null;
      report.errorMessage = null;
      report.failedStage = null;
    }
    Object.assign(report, pickAdditiveE2ESummaryFields(report));

    await fs.mkdir(zoteroArtifacts.artifactsDir, { recursive: true });
    await writeJSONArtifact(zoteroArtifacts.reportJSON, report);
    await fs.writeFile(zoteroArtifacts.reportMD, `${buildE2EMarkdown(report)}\n`, "utf-8");

    console.log(`Agent Zotero E2E report generated: ${zoteroArtifacts.reportJSON}`);
    if (!report.passed) {
      process.exit(2);
    }
  } finally {
    await buildLock.release();
  }
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  const failureReport = {
    generatedAt: new Date().toISOString(),
    strategy: null,
    passed: false,
    issues: [failureInfo.errorMessage],
    hints: [],
    diagnostics: [],
    primaryDiagnosis: null,
    cycles: [],
    durationMs: failureInfo.durationMs,
    ...failureInfo,
  };
  Object.assign(failureReport, pickAdditiveE2ESummaryFields(failureReport));
  try {
    await fs.mkdir(zoteroArtifacts.artifactsDir, { recursive: true });
    await writeJSONArtifact(zoteroArtifacts.reportJSON, failureReport);
    await fs.writeFile(zoteroArtifacts.reportMD, `${buildE2EMarkdown(failureReport)}\n`, "utf-8");
  } catch {
    // ignore secondary failure
  }
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
