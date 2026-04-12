import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import {
  connectRdpWithLaunchDiagnostics,
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
  ensureLibraryVisualStageReady,
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
  inspectCaptureBoundsAlignment,
  normalizeCaptureWindowBounds,
  rebaseCaptureWindowBounds,
  resolveStageRelativeSurfaceBounds,
  resolveCaptureWindowBounds,
  shouldCaptureSurfaceFromReferenceStage,
} from "./agent-zotero-capture-window-lib.mjs";
import {
  waitForVisualStageSettled,
} from "./agent-zotero-visual-settle-lib.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
  parseEnumOption,
  parseIntegerOption,
  readJSONFile,
  resolvePathOption,
  wrapScriptError,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";
import { resolveZoteroE2EArtifacts } from "./zotero-agent-artifacts.mjs";
import { inspectBaselineMainLocaleFiles } from "./agent-zotero-locale-lib.mjs";
import { inspectStaticRuntimeBaselineFiles } from "./static-runtime-baseline-lib.mjs";
import { summarizeE2EReport } from "./agent-zotero-validation-lib.mjs";
import { runIntegratedScenarios as runIntegratedScenarioBatch } from "./zotero-scenario-runner-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();
const zoteroArtifacts = resolveZoteroE2EArtifacts(projectRoot);
const VISUAL_CAPTURE_WINDOW_GEOMETRY = Object.freeze({
  width: 1000,
  height: 600,
});
const VISUAL_CAPTURE_POLICY = Object.freeze({
  stageOrder: Object.freeze(["library", "reader"]),
  maxAttemptsPerStage: 3,
  activationDelayMs: 320,
  captureActivationDelayMs: 1000,
  betweenAttemptsMs: 220,
  stageWarmupMs: Object.freeze({
    library: 550,
    reader: 780,
  }),
  preCaptureSettle: Object.freeze({
    stableSamples: Object.freeze({
      library: 2,
      reader: 3,
    }),
    maxPolls: Object.freeze({
      library: 6,
      reader: 8,
    }),
    intervalMs: Object.freeze({
      library: 120,
      reader: 140,
    }),
    postReadyDelayMs: Object.freeze({
      library: 120,
      reader: 260,
    }),
  }),
});
const VISUAL_CAPTURE_EVAL_TIMEOUT_MS = Object.freeze({
  prepareState: 45000,
  settleStage: 20000,
  cleanupState: 20000,
  focusWindow: 20000,
  hostAction: 30000,
  toolbarMarker: 20000,
  surfaceTarget: 20000,
});
const VISUAL_LIBRARY_STAGE_TIMEOUTS_MS = Object.freeze({
  stabilizeHostSurface: 3000,
  selectLibrary: 5000,
  waitForItemsLoad: 5000,
  selectItem: 5000,
  waitForSelection: 5000,
  waitForPaint: 2000,
  inspectItem: 3000,
});
const VISUAL_SURFACE_CAPTURE_DELAY_MS = 520;
const VISUAL_READER_PREPARE_TIMEOUT_MS = 8000;
const ADDITIVE_E2E_SUMMARY_FIELDS = Object.freeze([
  "status",
  "statusLabel",
  "ageMinutes",
  "ageText",
  "testFailed",
  "scenarioFailed",
  "scenarioExecutionObserved",
  "scenarioIncompleteCycleCount",
  "scenarioTimeoutKinds",
  "scenarioLastStartedScenario",
  "scenarioLastCompletedScenario",
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
  "visualPreCaptureSettleObserved",
  "visualPreCaptureSettleStageCount",
  "visualPreCaptureSettleSettledStageCount",
  "visualPreCaptureSettleTimedOutStageCount",
  "visualPreCaptureSettleSummary",
  "visualPreCaptureSettleStages",
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
  "httpObserved",
  "httpRequestCount",
  "httpSuccessCount",
  "httpFailureCount",
  "httpTimeoutCount",
  "httpRetryCount",
  "httpSlowOperationCount",
  "httpSlowThresholdMs",
  "httpLastRequest",
  "httpLastErrorKind",
  "httpLastErrorMessage",
  "hostReadyDurationMs",
  "startupDurationMs",
  "shutdownDurationMs",
  "lifecycleSlowOperationCount",
  "lifecycleSlowThresholdMs",
  "lifecycleLastSlowStage",
  "lifecycleBoundaryEvents",
  "performanceBudget",
  "domContractReport",
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

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  }
  catch {
    return false;
  }
}

async function evaluateCaptureInChrome(rdp, expression, options = {}) {
  return await rdp.evaluateInChrome(expression, {
    label: options.label,
    timeoutMs: options.timeoutMs,
  });
}

function pickAdditiveE2ESummaryFields(report, options = {}) {
  const summary = summarizeE2EReport(report, options);
  const picked = {};
  for (const field of ADDITIVE_E2E_SUMMARY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(summary, field)) {
      picked[field] = summary[field];
    }
  }
  return picked;
}

async function readPerformanceBudgetConfig() {
  const configPath = path.join(projectRoot, "config", "performance-budget.json");
  if (!await pathExists(configPath)) {
    return null;
  }
  return await readJSONFile(configPath, {
    failedStage: "read-performance-budget-config",
    label: "config/performance-budget.json",
  });
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
    throw wrapScriptError(error, {
      failedStage: name,
      message: `[${name}] ${message}`,
    });
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
          const wrapped = new Error(details);
          wrapped.command = command;
          wrapped.args = Array.isArray(args) ? [...args] : [];
          wrapped.stdout = stdout || "";
          wrapped.stderr = stderr || "";
          wrapped.exitCode = typeof error.code === "number" ? error.code : null;
          wrapped.signal = error.signal || null;
          reject(wrapped);
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

function normalizeMaybeString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeCommandExitCode(value) {
  return Number.isFinite(Number(value))
    ? Number(value)
    : null;
}

function normalizeVisualCaptureBounds(bounds) {
  if (!bounds || typeof bounds !== "object") {
    return null;
  }
  const x = Number(bounds.x);
  const y = Number(bounds.y);
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  const hasDimensions = [x, y, width, height].every((item) => Number.isFinite(item));
  return {
    x: hasDimensions ? x : null,
    y: hasDimensions ? y : null,
    width: hasDimensions ? width : null,
    height: hasDimensions ? height : null,
    title: normalizeMaybeString(bounds.title),
    source: normalizeMaybeString(bounds.source),
  };
}

function normalizeVisualAttemptEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const bounds = normalizeVisualCaptureBounds(entry.bounds);
  return {
    index: Number.isInteger(entry.index) ? entry.index : null,
    path: normalizeMaybeString(entry.path),
    bounds,
    width: Number(entry.analysis?.width || 0) || null,
    height: Number(entry.analysis?.height || 0) || null,
    sizeBytes: Number(entry.analysis?.sizeBytes || 0) || null,
    sha256: normalizeMaybeString(entry.analysis?.sha256),
  };
}

function attachVisualCaptureFailure(error, metadata = {}) {
  const target = error instanceof Error
    ? error
    : new Error(normalizeMaybeString(error) || "Unknown visual capture failure");
  target.visualCaptureFailure = {
    failureKind: normalizeMaybeString(metadata.failureKind) || "capture-stage-failed",
    failureCategory: normalizeMaybeString(metadata.failureCategory),
    failureStage: normalizeMaybeString(metadata.failureStage),
    failureMessage: normalizeMaybeString(metadata.failureMessage)
      || normalizeMaybeString(target.message)
      || "Unknown visual capture failure",
    bounds: normalizeVisualCaptureBounds(metadata.bounds),
    boundsSource: normalizeMaybeString(metadata.boundsSource)
      || normalizeMaybeString(metadata.bounds?.source),
    windowTitle: normalizeMaybeString(metadata.windowTitle)
      || normalizeMaybeString(metadata.bounds?.title),
    command: normalizeMaybeString(metadata.command),
    commandExitCode: normalizeCommandExitCode(metadata.commandExitCode ?? target.exitCode),
    stderr: normalizeMaybeString(metadata.stderr ?? target.stderr),
    stdout: normalizeMaybeString(metadata.stdout ?? target.stdout),
    rect: normalizeMaybeString(metadata.rect),
  };
  return target;
}

function inferVisualStageFailure(error, fallback = {}) {
  const existing = error?.visualCaptureFailure && typeof error.visualCaptureFailure === "object"
    ? error.visualCaptureFailure
    : {};
  const failureKind = normalizeMaybeString(existing.failureKind)
    || normalizeMaybeString(fallback.failureKind)
    || "capture-stage-failed";
  const failureCategory = normalizeMaybeString(existing.failureCategory)
    || normalizeMaybeString(fallback.failureCategory)
    || null;
  const failureStage = normalizeMaybeString(existing.failureStage)
    || normalizeMaybeString(fallback.failureStage)
    || null;
  const bounds = normalizeVisualCaptureBounds(existing.bounds || fallback.bounds);
  return {
    failureKind,
    failureCategory,
    failureStage,
    failureMessage: normalizeMaybeString(existing.failureMessage)
      || normalizeMaybeString(fallback.failureMessage)
      || normalizeMaybeString(error?.message)
      || "Unknown visual capture failure",
    bounds,
    boundsSource: normalizeMaybeString(existing.boundsSource)
      || normalizeMaybeString(fallback.boundsSource)
      || normalizeMaybeString(bounds?.source),
    windowTitle: normalizeMaybeString(existing.windowTitle)
      || normalizeMaybeString(fallback.windowTitle)
      || normalizeMaybeString(bounds?.title),
    command: normalizeMaybeString(existing.command)
      || normalizeMaybeString(fallback.command),
    commandExitCode: normalizeCommandExitCode(existing.commandExitCode ?? fallback.commandExitCode ?? error?.exitCode),
    stderr: normalizeMaybeString(existing.stderr ?? fallback.stderr ?? error?.stderr),
    stdout: normalizeMaybeString(existing.stdout ?? fallback.stdout ?? error?.stdout),
    rect: normalizeMaybeString(existing.rect ?? fallback.rect),
  };
}

function buildFailedVisualStageResult({
  stage,
  warmupMs,
  maxAttempts,
  preCaptureSettle,
  state,
  attempts,
  attemptCount,
  error,
  fallback = {},
}) {
  const failure = inferVisualStageFailure(error, fallback);
  return {
    capture: null,
    stability: {
      kind: stage,
      stable: false,
      warmupMs,
      maxAttempts,
      preCaptureSettle,
      attemptCount: Math.max(
        0,
        Number(attemptCount || 0),
        Array.isArray(attempts) ? attempts.length : 0,
      ),
      selectedAttempt: null,
      selectedPath: null,
      selectedHash: null,
      selectionReason: null,
      stabilityMetrics: null,
      attempts: Array.isArray(attempts)
        ? attempts.map((entry) => normalizeVisualAttemptEntry(entry)).filter(Boolean)
        : [],
      failureKind: failure.failureKind,
      failureCategory: failure.failureCategory,
      failureStage: failure.failureStage,
      failureMessage: failure.failureMessage,
      bounds: failure.bounds,
      boundsSource: failure.boundsSource,
      windowTitle: failure.windowTitle,
      command: failure.command,
      commandExitCode: failure.commandExitCode,
      stderr: failure.stderr,
      stdout: failure.stdout,
      rect: failure.rect,
      metadata: state || null,
    },
    warning: `${stage}: ${failure.failureMessage}`,
  };
}

function getVisualStageWarmupMs(stage) {
  const configured = VISUAL_CAPTURE_POLICY.stageWarmupMs?.[stage];
  return Number.isFinite(configured) && configured > 0
    ? configured
    : 550;
}

function getVisualStageSettlePolicy(stage) {
  const settings = VISUAL_CAPTURE_POLICY.preCaptureSettle || {};
  const stableSampleTarget = Number(settings.stableSamples?.[stage]);
  const maxPolls = Number(settings.maxPolls?.[stage]);
  const intervalMs = Number(settings.intervalMs?.[stage]);
  const postReadyDelayMs = Number(settings.postReadyDelayMs?.[stage]);
  return {
    stableSampleTarget: Number.isFinite(stableSampleTarget) && stableSampleTarget > 0
      ? stableSampleTarget
      : 2,
    maxPolls: Number.isFinite(maxPolls) && maxPolls > 0
      ? maxPolls
      : 6,
    intervalMs: Number.isFinite(intervalMs) && intervalMs >= 0
      ? intervalMs
      : 120,
    postReadyDelayMs: Number.isFinite(postReadyDelayMs) && postReadyDelayMs >= 0
      ? postReadyDelayMs
      : 0,
  };
}

function summarizeVisualCapturePolicy() {
  return {
    stageOrder: Array.from(VISUAL_CAPTURE_POLICY.stageOrder || []),
    maxAttemptsPerStage: Number(VISUAL_CAPTURE_POLICY.maxAttemptsPerStage || 1),
    activationDelayMs: Number(VISUAL_CAPTURE_POLICY.activationDelayMs || 0),
    captureActivationDelayMs: Number(
      VISUAL_CAPTURE_POLICY.captureActivationDelayMs
      || VISUAL_CAPTURE_POLICY.activationDelayMs
      || 0,
    ),
    betweenAttemptsMs: Number(VISUAL_CAPTURE_POLICY.betweenAttemptsMs || 0),
    stageWarmupMs: {
      library: getVisualStageWarmupMs("library"),
      reader: getVisualStageWarmupMs("reader"),
    },
    preCaptureSettle: {
      library: getVisualStageSettlePolicy("library"),
      reader: getVisualStageSettlePolicy("reader"),
    },
    targetWindowGeometry: {
      width: Number(VISUAL_CAPTURE_WINDOW_GEOMETRY.width || 0),
      height: Number(VISUAL_CAPTURE_WINDOW_GEOMETRY.height || 0),
    },
  };
}

function resolveVisualStageTargetTitle(stage, state) {
  return normalizeMaybeString(
    state?.windowTitle
    || state?.preparation?.windowTitle
    || state?.readerSnapshot?.windowTitle,
  );
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
      options.cycles = parseIntegerOption(argv[i + 1], {
        name: "cycles",
        min: 1,
        max: 10,
      });
      i += 1;
      continue;
    }
    if (arg === "--strategy") {
      options.strategy = parseEnumOption(argv[i + 1], {
        name: "strategy",
        allowed: ["hot", "restart"],
      });
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
      options.visualBaselineDir = resolvePathOption(argv[i + 1], {
        name: "visual-baseline-dir",
        baseDir: projectRoot,
      });
      i += 1;
      continue;
    }
    throw createScriptError("args", `Unknown option: ${arg}`, {
      failedStage: "parse-args",
    });
  }

  return options;
}

async function discoverZoteroTests() {
  const testRoot = path.join(projectRoot, "zotero-tests");
  return await findFilesRecursive(
    testRoot,
    (filePath) => filePath.endsWith(".test.js"),
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

      const surfaceLocal = capture?.scope === "surface-local";
      if (!surfaceLocal && (png.width < 400 || png.height < 300)) {
        analysis.issues.push(`${capture.kind} 截图尺寸过小：${png.width}x${png.height}`);
      }
      if (!surfaceLocal && png.sizeBytes < 50_000) {
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
      scope: capture.scope || "window-stage",
      surfaceId: capture.surfaceId || null,
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
  const payload = await evaluateCaptureInChrome(rdp, `(async () => {
    const ensureLibraryVisualStageReady = ${ensureLibraryVisualStageReady.toString()};
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

    const readSelectedItemIDs = () => {
      if (typeof ZoteroPane?.getSelectedItems === "function") {
        const directIDs = ZoteroPane.getSelectedItems(true);
        if (Array.isArray(directIDs)) {
          return directIDs.filter((id) => Number.isFinite(id));
        }
        const items = ZoteroPane.getSelectedItems();
        if (Array.isArray(items)) {
          return items
            .map((item) => item?.id)
            .filter((id) => Number.isFinite(id));
        }
      }
      if (ZoteroPane?.itemsView && typeof ZoteroPane.itemsView.getSelectedItems === "function") {
        const directIDs = ZoteroPane.itemsView.getSelectedItems(true);
        if (Array.isArray(directIDs)) {
          return directIDs.filter((id) => Number.isFinite(id));
        }
        const items = ZoteroPane.itemsView.getSelectedItems();
        if (Array.isArray(items)) {
          return items
            .map((item) => item?.id)
            .filter((id) => Number.isFinite(id));
        }
      }
      return [];
    };

    const readSelectionSnapshot = () => {
      const ids = readSelectedItemIDs();
      return {
        selectedIDs: ids,
        selectedCount: ids.length,
      };
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

    const runTimedStep = async (label, handler, options = {}) => {
      const timeoutMs = Number.isFinite(options.timeoutMs)
        ? Number(options.timeoutMs)
        : 2000;
      let timeoutHandle = null;
      try {
        return await Promise.race([
          Promise.resolve()
            .then(() => handler())
            .then((value) => ({
              label,
              ok: true,
              timedOut: false,
              message: null,
              value,
            }))
            .catch((error) => ({
              label,
              ok: false,
              timedOut: false,
              message: String(error?.message || error),
              value: null,
            })),
          new Promise((resolve) => {
            timeoutHandle = setTimeout(() => {
              resolve({
                label,
                ok: false,
                timedOut: true,
                message: String(label || "step") + " timed out after " + String(timeoutMs) + "ms",
                value: null,
              });
            }, timeoutMs);
          }),
        ]);
      }
      finally {
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
        }
      }
    };

    const waitForLibraryViews = async () => {
      await waitFor(
        () => Boolean(ZoteroPane.collectionsView && ZoteroPane.itemsView) ? true : null,
        {
          timeoutMs: 3000,
          intervalMs: 100,
        },
      );
      return true;
    };

    const selectLibraryRoot = async (libraryID) => {
      if (!Number.isFinite(Number(libraryID))) {
        return false;
      }
      if (!ZoteroPane.collectionsView || typeof ZoteroPane.collectionsView.selectLibrary !== "function") {
        return false;
      }
      await ZoteroPane.collectionsView.selectLibrary(Number(libraryID));
      return true;
    };

    const waitForItemsViewLoad = async () => {
      if (ZoteroPane.itemsView && typeof ZoteroPane.itemsView.waitForLoad === "function") {
        await ZoteroPane.itemsView.waitForLoad();
        return true;
      }
      return false;
    };

    const waitForSingleSelection = async (itemID) => {
      return await waitFor(() => {
        const selection = readSelectionSnapshot();
        return selection.selectedIDs.length === 1 && selection.selectedIDs[0] === itemID
          ? selection
          : null;
      }, {
        timeoutMs: 3000,
        intervalMs: 100,
      });
    };

    const waitForMainWindowPaint = async () => {
      const targetWindow = Zotero.getMainWindow();
      if (!targetWindow) {
        return false;
      }
      const raf = typeof targetWindow.requestAnimationFrame === "function"
        ? targetWindow.requestAnimationFrame.bind(targetWindow)
        : (callback) => setTimeout(callback, 0);
      await new Promise((resolve) => raf(() => raf(resolve)));
      return true;
    };

    const allowVisibleBannerContainerIDs = new Set([
      "mac-word-plugin-install-container",
    ]);

    const isBannerContainerVisible = (element) => {
      if (!element || typeof element !== "object") {
        return false;
      }
      if (element.hidden === true) {
        return false;
      }
      const collapsed = String(element.getAttribute?.("collapsed") || "").trim().toLowerCase();
      if (collapsed === "true") {
        return false;
      }
      const targetWindow = element.ownerDocument?.defaultView || Zotero.getMainWindow();
      const style = targetWindow && typeof targetWindow.getComputedStyle === "function"
        ? targetWindow.getComputedStyle(element)
        : null;
      if (style) {
        if (
          style.display === "none"
          || style.visibility === "collapse"
          || style.visibility === "hidden"
          || Number(style.opacity) === 0
        ) {
          return false;
        }
      }
      const rect = typeof element.getBoundingClientRect === "function"
        ? element.getBoundingClientRect()
        : null;
      return Number(rect?.height || 0) > 0;
    };

    const collapseBannerContainer = (element) => {
      if (!element || typeof element !== "object") {
        return;
      }
      try {
        element.hidden = true;
      } catch {}
      try {
        element.setAttribute("hidden", "true");
      } catch {}
      try {
        element.collapsed = true;
      } catch {}
      try {
        element.setAttribute("collapsed", "true");
      } catch {}
      if (element.style && typeof element.style.setProperty === "function") {
        try {
          element.style.setProperty("display", "none", "important");
          element.style.setProperty("visibility", "collapse", "important");
          element.style.setProperty("max-height", "0px", "important");
          element.style.setProperty("overflow", "hidden", "important");
        } catch {}
      }
      const innerBanner = typeof element.querySelector === "function"
        ? element.querySelector(".banner, [id$='-banner']")
        : null;
      if (innerBanner?.style && typeof innerBanner.style.setProperty === "function") {
        try {
          innerBanner.style.setProperty("display", "none", "important");
          innerBanner.style.setProperty("visibility", "collapse", "important");
          innerBanner.style.setProperty("max-height", "0px", "important");
          innerBanner.style.setProperty("overflow", "hidden", "important");
        } catch {}
      }
    };

    const stabilizeLibraryHostSurface = async () => {
      const targetWindow = Zotero.getMainWindow();
      const doc = targetWindow?.document;
      if (!doc) {
        return {
          suppressedBannerIDs: [],
          retainedBannerIDs: [],
          visibleBannerIDs: [],
        };
      }

      const bannerContainers = Array.from(doc.querySelectorAll(".banner-container"))
        .filter((element) => typeof element?.id === "string" && element.id);
      const suppressedBannerIDs = [];
      const retainedBannerIDs = [];

      for (const container of bannerContainers) {
        if (allowVisibleBannerContainerIDs.has(container.id)) {
          retainedBannerIDs.push(String(container.id));
          continue;
        }
        collapseBannerContainer(container);
        suppressedBannerIDs.push(String(container.id));
      }

      if (bannerContainers.length > 0) {
        await waitForMainWindowPaint();
      }

      return {
        suppressedBannerIDs: Array.from(new Set(suppressedBannerIDs)).sort((left, right) => left.localeCompare(right)),
        retainedBannerIDs: Array.from(new Set(retainedBannerIDs)).sort((left, right) => left.localeCompare(right)),
        visibleBannerIDs: bannerContainers
          .filter((container) => isBannerContainerVisible(container))
          .map((container) => String(container.id))
          .sort((left, right) => left.localeCompare(right)),
      };
    };

    const readSelectedTabID = () => {
      const selectedID = Zotero.getMainWindow()?.Zotero_Tabs?.selectedID;
      return typeof selectedID === "string" && selectedID
        ? selectedID
        : null;
    };

    const readMainWindowTitle = () => {
      const title = Zotero.getMainWindow()?.document?.title;
      return typeof title === "string" && title
        ? title
        : null;
    };

    const activateReaderTab = async (reader) => {
      const tabID = typeof reader?.tabID === "string" ? reader.tabID : null;
      const tabs = Zotero.getMainWindow()?.Zotero_Tabs;
      if (!tabID || !tabs) {
        return false;
      }

      try {
        if (typeof tabs.select === "function") {
          const result = tabs.select(tabID);
          if (result && typeof result.then === "function") {
            await result;
          }
        } else if ("selectedID" in tabs) {
          tabs.selectedID = tabID;
        } else {
          return false;
        }
      } catch {
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
      return true;
    };

    const settleReader = async (reader) => {
      const readyReader = typeof plugin?.api?.reader?.waitForReaderReady === "function"
        ? await plugin.api.reader.waitForReaderReady(reader, {
          timeoutMs: ${VISUAL_READER_PREPARE_TIMEOUT_MS},
          intervalMs: 50,
        })
        : reader;
      const targetReader = readyReader || reader;
      const readerFrameWindow = await waitFor(() => {
        if (typeof plugin?.api?.reader?.getReaderFrameWindow === "function") {
          const frameWindow = plugin.api.reader.getReaderFrameWindow(targetReader, { view: "primary" });
          if (frameWindow) {
            return frameWindow;
          }
        }
        return targetReader?._internalReader?._primaryView?._iframeWindow || targetReader?._iframeWindow || null;
      }, {
        timeoutMs: ${VISUAL_READER_PREPARE_TIMEOUT_MS},
        intervalMs: 50,
      });
      if (readerFrameWindow?.document) {
        await waitFor(() => {
          return readerFrameWindow.document?.readyState === "complete"
            ? true
            : null;
        }, {
          timeoutMs: ${VISUAL_READER_PREPARE_TIMEOUT_MS},
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

    const normalizeReaderVisualShell = async () => {
      if (state.readerVisualShellNormalized === true) {
        return state.readerVisualShellNormalization || null;
      }

      const targetWindow = Zotero.getMainWindow();
      const tabs = targetWindow?.Zotero_Tabs;
      const normalization = {
        selectedLibraryTab: false,
        closedTrackedReader: false,
        contextPaneClosed: null,
        stepResults: [],
      };
      const recordStep = (outcome) => {
        if (!outcome || typeof outcome !== "object") {
          return;
        }
        normalization.stepResults.push({
          label: String(outcome.label || "").trim() || null,
          ok: outcome.ok === true,
          timedOut: outcome.timedOut === true,
          message: typeof outcome.message === "string" && outcome.message
            ? outcome.message
            : null,
        });
      };

      if (tabs) {
        const selectLibraryOutcome = await runTimedStep("select-library-tab", async () => {
          if (typeof tabs.select === "function") {
            const result = tabs.select("zotero-pane", false, {
              keepTabFocused: false,
            });
            if (result && typeof result.then === "function") {
              await result;
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
            return true;
          }
          if ("selectedID" in tabs) {
            tabs.selectedID = "zotero-pane";
            await new Promise((resolve) => setTimeout(resolve, 0));
            return true;
          }
          return false;
        }, {
          timeoutMs: 2000,
        });
        recordStep(selectLibraryOutcome);
        normalization.selectedLibraryTab = selectLibraryOutcome.ok === true
          && selectLibraryOutcome.timedOut !== true
          && selectLibraryOutcome.value === true;
      }

      if (state.attachmentID && typeof plugin?.api?.reader?.closeByItemID === "function") {
        const closeTrackedReaderOutcome = await runTimedStep("close-tracked-reader", async () => {
          plugin.api.reader.closeByItemID(state.attachmentID);
          await waitFor(() => {
            return plugin.api.reader.getByItemID?.(state.attachmentID)
              ? null
              : true;
          }, {
            timeoutMs: 2000,
            intervalMs: 50,
          });
          return true;
        }, {
          timeoutMs: 2200,
        });
        recordStep(closeTrackedReaderOutcome);
        normalization.closedTrackedReader = closeTrackedReaderOutcome.ok === true
          && closeTrackedReaderOutcome.timedOut !== true
          && closeTrackedReaderOutcome.value === true;
      }

      if (typeof plugin?.api?.host?.setContextPaneOpen === "function") {
        const contextPaneOutcome = await runTimedStep("close-context-pane", async () => {
          return await plugin.api.host.setContextPaneOpen(false, {
            window: targetWindow,
            timeoutMs: 2000,
          });
        }, {
          timeoutMs: 2200,
        });
        recordStep(contextPaneOutcome);
        if (contextPaneOutcome.ok === true && contextPaneOutcome.timedOut !== true) {
          normalization.contextPaneClosed = contextPaneOutcome.value?.open === false;
        }
      }
      else if (targetWindow?.ZoteroContextPane) {
        try {
          targetWindow.ZoteroContextPane.collapsed = true;
          normalization.contextPaneClosed = targetWindow.ZoteroContextPane.collapsed === true;
        }
        catch {}
      }

      state.readerVisualShellNormalized = true;
      state.readerVisualShellNormalization = normalization;
      return normalization;
    };

    const resolveReadyReaderSummary = () => {
      const summary = typeof plugin.api.agent.describeReader === "function"
        ? plugin.api.agent.describeReader(state.attachmentID)
        : null;
      if (!summary || Number(summary?.itemID || 0) !== Number(state.attachmentID)) {
        return null;
      }
      const selectedTabID = readSelectedTabID();
      const selectedTabMatched = summary?.tabID && selectedTabID
        ? selectedTabID === summary.tabID
        : null;
      if (typeof plugin.api.agent.inspectReader === "function") {
        const snapshot = plugin.api.agent.inspectReader(state.attachmentID);
        if (!snapshot) {
          return null;
        }
        if (snapshot.active !== true) {
          return null;
        }
        if (snapshot.hasMatchingWindowState === false && selectedTabMatched !== true) {
          return null;
        }
        return {
          summary,
          snapshot,
          selectedTabID,
          selectedTabMatched,
        };
      }
      return {
        summary,
        snapshot: null,
        selectedTabID,
        selectedTabMatched,
      };
    };

    if (!state.itemID) {
      const item = new Zotero.Item("book");
      item.setField("title", "Agent Visual Validation");
      item.setField("abstractNote", "Cleanroom visual verification state");
      await item.saveTx();
      state.itemID = item.id;
    }

    if (${JSON.stringify(stage)} === "library") {
      const item = Zotero.Items.get(state.itemID);
      const libraryID = Number.isFinite(Number(item?.libraryID))
        ? Number(item.libraryID)
        : Number.isFinite(Number(Zotero?.Libraries?.userLibraryID))
          ? Number(Zotero.Libraries.userLibraryID)
          : null;
      const prepared = await ensureLibraryVisualStageReady({
        itemID: state.itemID,
        libraryID,
        waitForViews: waitForLibraryViews,
        selectLibrary: selectLibraryRoot,
        waitForItemsLoad: waitForItemsViewLoad,
        stabilizeHostSurfaceTimeoutMs: ${VISUAL_LIBRARY_STAGE_TIMEOUTS_MS.stabilizeHostSurface},
        selectLibraryTimeoutMs: ${VISUAL_LIBRARY_STAGE_TIMEOUTS_MS.selectLibrary},
        waitForItemsLoadTimeoutMs: ${VISUAL_LIBRARY_STAGE_TIMEOUTS_MS.waitForItemsLoad},
        selectItemTimeoutMs: ${VISUAL_LIBRARY_STAGE_TIMEOUTS_MS.selectItem},
        waitForSelectionTimeoutMs: ${VISUAL_LIBRARY_STAGE_TIMEOUTS_MS.waitForSelection},
        waitForPaintTimeoutMs: ${VISUAL_LIBRARY_STAGE_TIMEOUTS_MS.waitForPaint},
        inspectItemTimeoutMs: ${VISUAL_LIBRARY_STAGE_TIMEOUTS_MS.inspectItem},
        selectItem,
        waitForSelection: waitForSingleSelection,
        waitForPaint: waitForMainWindowPaint,
        stabilizeHostSurface: stabilizeLibraryHostSurface,
        inspectItem: (itemID) => plugin.api.agent.inspectItem(itemID),
        readSelectedTabID,
        readWindowTitle: readMainWindowTitle,
      });
      return {
        ok: true,
        stage: "library",
        itemID: state.itemID,
        libraryID,
        windowTitle: readMainWindowTitle(),
        summaryJSON: JSON.stringify(prepared.summary),
        selectionJSON: JSON.stringify(prepared.selection),
        preparationJSON: JSON.stringify(prepared.preparation),
        settleSnapshotJSON: JSON.stringify(prepared.settleSnapshot),
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

    const readerPreparation = {
      shellNormalization: await normalizeReaderVisualShell(),
      openReader: null,
      activateReaderTab: null,
      closeContextPane: null,
      settleReader: null,
    };

    const activeReaderSummary = typeof plugin.api.reader.getActiveSummary === "function"
      ? plugin.api.reader.getActiveSummary()
      : null;
    const existingReader = typeof plugin.api.reader.getByItemID === "function"
      ? plugin.api.reader.getByItemID(state.attachmentID)
      : null;
    const shouldOpenReader = !existingReader || Number(activeReaderSummary?.itemID || 0) !== Number(state.attachmentID);
    const openReaderOutcome = shouldOpenReader
      ? await runTimedStep("open-reader", async () => {
        return await plugin.api.reader.openReader({
          itemID: state.attachmentID,
          openInBackground: false,
        });
      }, {
        timeoutMs: ${VISUAL_READER_PREPARE_TIMEOUT_MS},
      })
      : {
        label: "reuse-reader",
        ok: true,
        timedOut: false,
        message: null,
        value: existingReader,
      };
    readerPreparation.openReader = {
      label: openReaderOutcome.label,
      ok: openReaderOutcome.ok === true,
      timedOut: openReaderOutcome.timedOut === true,
      message: openReaderOutcome.message || null,
      reused: shouldOpenReader !== true,
    };
    const reader = openReaderOutcome.value || null;
    if (!reader) {
      return {
        ok: false,
        stage: "reader",
        reason: openReaderOutcome.timedOut === true
          ? "reader-open-timeout"
          : "reader-open-failed",
        failureKind: openReaderOutcome.timedOut === true
          ? "reader-open-timeout"
          : "reader-open-failed",
        failureStage: "open-reader",
        failureMessage: openReaderOutcome.message || "Unable to open reader for visual capture",
        itemID: state.itemID,
        attachmentID: state.attachmentID,
        preparationJSON: JSON.stringify(readerPreparation),
      };
    }

    const activateReaderOutcome = await runTimedStep("activate-reader-tab", async () => {
      const activated = await activateReaderTab(reader);
      await waitForMainWindowPaint();
      return {
        activated,
        selectedTabID: readSelectedTabID(),
      };
    }, {
      timeoutMs: 2500,
    });
    const readerTabID = typeof reader?.tabID === "string" && reader.tabID
      ? reader.tabID
      : null;
    const readerTabMatched = readerTabID
      ? activateReaderOutcome.value?.selectedTabID === readerTabID
      : false;
    readerPreparation.activateReaderTab = {
      ok: activateReaderOutcome.ok === true,
      timedOut: activateReaderOutcome.timedOut === true,
      message: activateReaderOutcome.message || null,
      activated: activateReaderOutcome.value?.activated === true || readerTabMatched,
      selectedTabID: activateReaderOutcome.value?.selectedTabID || null,
    };
    if (
      activateReaderOutcome.timedOut === true
      || activateReaderOutcome.ok !== true
      || (activateReaderOutcome.value?.activated !== true && readerTabMatched !== true)
    ) {
      return {
        ok: false,
        stage: "reader",
        reason: activateReaderOutcome.timedOut === true
          ? "reader-activate-timeout"
          : "reader-activate-failed",
        failureKind: activateReaderOutcome.timedOut === true
          ? "reader-activate-timeout"
          : "reader-activate-failed",
        failureStage: "activate-reader-tab",
        failureMessage: activateReaderOutcome.message || "Unable to activate reader tab for visual capture",
        itemID: state.itemID,
        attachmentID: state.attachmentID,
        preparationJSON: JSON.stringify(readerPreparation),
      };
    }

    if (typeof plugin?.api?.host?.setContextPaneOpen === "function") {
      const closeContextPaneOutcome = await runTimedStep("close-context-pane-after-open", async () => {
        return await plugin.api.host.setContextPaneOpen(false, {
          window: Zotero.getMainWindow(),
          timeoutMs: ${VISUAL_READER_PREPARE_TIMEOUT_MS},
        });
      }, {
        timeoutMs: ${VISUAL_READER_PREPARE_TIMEOUT_MS},
      });
      readerPreparation.closeContextPane = {
        ok: closeContextPaneOutcome.ok === true,
        timedOut: closeContextPaneOutcome.timedOut === true,
        message: closeContextPaneOutcome.message || null,
        open: closeContextPaneOutcome.value?.open ?? null,
      };
      if (closeContextPaneOutcome.ok === true && closeContextPaneOutcome.timedOut !== true) {
        state.readerVisualContextPaneClosed = closeContextPaneOutcome.value?.open === false;
      }
    }
    await waitForMainWindowPaint();
    const settleReaderOutcome = await runTimedStep("settle-reader", async () => {
      await settleReader(reader);
      return true;
    }, {
      timeoutMs: ${VISUAL_READER_PREPARE_TIMEOUT_MS + 500},
    });
    readerPreparation.settleReader = {
      ok: settleReaderOutcome.ok === true,
      timedOut: settleReaderOutcome.timedOut === true,
      message: settleReaderOutcome.message || null,
    };
    if (settleReaderOutcome.timedOut === true || settleReaderOutcome.ok !== true) {
      return {
        ok: false,
        stage: "reader",
        reason: settleReaderOutcome.timedOut === true
          ? "reader-settle-timeout"
          : "reader-settle-failed",
        failureKind: settleReaderOutcome.timedOut === true
          ? "reader-settle-timeout"
          : "reader-settle-failed",
        failureStage: "settle-reader",
        failureMessage: settleReaderOutcome.message || "Unable to settle reader for visual capture",
        itemID: state.itemID,
        attachmentID: state.attachmentID,
        preparationJSON: JSON.stringify(readerPreparation),
      };
    }
    const readyReaderState = await waitFor(resolveReadyReaderSummary, {
      timeoutMs: ${VISUAL_READER_PREPARE_TIMEOUT_MS},
      intervalMs: 100,
    });

    const readyReaderSummary = readyReaderState?.summary || null;
    const readerSummary = readyReaderSummary || plugin.api.agent.describeReader(state.attachmentID);
    const readerSnapshot = typeof plugin.api.agent.inspectReader === "function"
      ? plugin.api.agent.inspectReader(state.attachmentID)
      : null;
    const readyReaderSnapshot = readyReaderState?.snapshot || null;
    const readyReaderSelectedTabID = readyReaderState?.selectedTabID ?? readSelectedTabID() ?? null;
    const readyReaderSelectedTabMatched = typeof readyReaderState?.selectedTabMatched === "boolean"
      ? readyReaderState.selectedTabMatched
      : (readyReaderSummary?.tabID && readyReaderSelectedTabID
        ? readyReaderSelectedTabID === readyReaderSummary.tabID
        : null);
    const uiState = readerSnapshot?.uiState && typeof readerSnapshot.uiState === "object"
      ? readerSnapshot.uiState
      : null;
    const readyUIState = readyReaderSnapshot?.uiState && typeof readyReaderSnapshot.uiState === "object"
      ? readyReaderSnapshot.uiState
      : null;
    return {
      ok: true,
      stage: "reader",
      itemID: state.itemID,
      attachmentID: state.attachmentID,
      windowTitle: readMainWindowTitle(),
      preparationJSON: JSON.stringify(readerPreparation),
      readerJSON: JSON.stringify(readerSummary),
      readerSnapshotJSON: JSON.stringify(readerSnapshot),
      ...(readyReaderSummary
        ? {
          settleSnapshotJSON: JSON.stringify({
            stage: "reader",
            itemID: readyReaderSummary?.itemID ?? state.attachmentID,
            tabID: readyReaderSummary?.tabID ?? null,
            type: readyReaderSummary?.type ?? null,
            annotationCount: Number(readyReaderSummary?.annotationCount || 0),
            active: readyReaderSnapshot?.active ?? null,
            selectedTabID: readyReaderSelectedTabID,
            selectedTabMatched: readyReaderSelectedTabMatched,
            hasMatchingWindowState: readyReaderSnapshot?.hasMatchingWindowState ?? null,
            matchingWindowStateCount: Number(readyReaderSnapshot?.matchingWindowStateCount || 0),
            selectedAnnotationCount: Number(readyReaderSnapshot?.selectedAnnotationCount || 0),
            annotationDetailCount: Number(readyReaderSnapshot?.annotationDetailCount || 0),
            sidebarView: readyUIState?.sidebarView ?? null,
            flowMode: readyUIState?.flowMode ?? null,
            splitType: readyUIState?.splitType ?? null,
            scrollMode: readyUIState?.scrollMode ?? null,
            spreadMode: readyUIState?.spreadMode ?? null,
            scale: readyUIState?.scale ?? null,
            contextPaneOpen: readyUIState?.contextPaneOpen ?? null,
            hasSecondViewState: readyUIState?.hasSecondViewState ?? null,
          }),
        }
        : {}),
    };
  })()`, {
    label: `visual:prepare-state:${stage}`,
    timeoutMs: VISUAL_CAPTURE_EVAL_TIMEOUT_MS.prepareState,
  });

  if (typeof payload.summaryJSON === "string") {
    payload.summary = JSON.parse(payload.summaryJSON);
    delete payload.summaryJSON;
  }
  if (typeof payload.readerJSON === "string") {
    payload.reader = JSON.parse(payload.readerJSON);
    delete payload.readerJSON;
  }
  if (typeof payload.readerSnapshotJSON === "string") {
    payload.readerSnapshot = JSON.parse(payload.readerSnapshotJSON);
    delete payload.readerSnapshotJSON;
  }
  if (typeof payload.selectionJSON === "string") {
    payload.selection = JSON.parse(payload.selectionJSON);
    delete payload.selectionJSON;
  }
  if (typeof payload.preparationJSON === "string") {
    payload.preparation = JSON.parse(payload.preparationJSON);
    delete payload.preparationJSON;
  }
  if (typeof payload.settleSnapshotJSON === "string") {
    payload.settleSnapshot = JSON.parse(payload.settleSnapshotJSON);
    delete payload.settleSnapshotJSON;
  }
  if (!payload?.ok) {
    const failureMessage = normalizeMaybeString(payload?.failureMessage)
      || normalizeMaybeString(payload?.reason)
      || `Unable to prepare visual state for ${stage}`;
    const error = attachVisualCaptureFailure(new Error(failureMessage), {
      failureKind: normalizeMaybeString(payload?.failureKind) || "capture-stage-failed",
      failureStage: normalizeMaybeString(payload?.failureStage) || `prepare-${stage}`,
      failureMessage,
    });
    error.visualStageState = {
      stage: normalizeMaybeString(payload?.stage) || stage,
      itemID: Number(payload?.itemID || 0) || null,
      attachmentID: Number(payload?.attachmentID || 0) || null,
      preparation: payload.preparation || null,
      reader: payload.reader || null,
      readerSnapshot: payload.readerSnapshot || null,
      settleSnapshot: payload.settleSnapshot || null,
    };
    throw error;
  }
  return payload;
}

async function settleVisualStageAfterReady({
  rdp,
  config,
  stage,
  delayMs,
}) {
  const rawResult = await evaluateCaptureInChrome(rdp, `(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitDoubleFrame = async (targetWindow) => {
      const boundRAF = typeof targetWindow?.requestAnimationFrame === "function"
        ? targetWindow.requestAnimationFrame.bind(targetWindow)
        : ((callback) => setTimeout(callback, 0));
      await new Promise((resolve) => boundRAF(() => boundRAF(resolve)));
    };

    if (${Number(delayMs || 0)} > 0) {
      await wait(${Number(delayMs || 0)});
    }

    if (${JSON.stringify(stage)} === "reader") {
      const STATE_KEY = "__CLEANROOM_AGENT_VISUAL_STATE__";
      const state = globalThis[STATE_KEY];
      const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
      const reader = typeof plugin?.api?.reader?.getByItemID === "function"
        ? plugin.api.reader.getByItemID(state?.attachmentID)
        : null;
      const frameWindow = reader?._internalReader?._primaryView?._iframeWindow || reader?._iframeWindow || null;
      await waitDoubleFrame(frameWindow || Zotero.getMainWindow());
      return {
        ok: true,
        target: frameWindow ? "reader-frame" : "main-window",
      };
    }

    await waitDoubleFrame(Zotero.getMainWindow());
    return {
      ok: true,
      target: "main-window",
    };
  })()`, {
    label: `visual:settle-stage:${stage}`,
    timeoutMs: VISUAL_CAPTURE_EVAL_TIMEOUT_MS.settleStage,
  });

  return parseChromeEvalResult(rawResult);
}

async function cleanupVisualState({ rdp, config }) {
  await evaluateCaptureInChrome(rdp, `(async () => {
    const STATE_KEY = "__CLEANROOM_AGENT_VISUAL_STATE__";
    const state = globalThis[STATE_KEY];
    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    const waitFor = async (predicate, options = {}) => {
      const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 2000;
      const intervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : 50;
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
    const toolbarCapture = globalThis.__CLEANROOM_AGENT_READER_TOOLBAR_CAPTURE__;
    if (toolbarCapture?.unregister) {
      try {
        toolbarCapture.unregister();
      }
      catch {}
    }
    delete globalThis.__CLEANROOM_AGENT_READER_TOOLBAR_CAPTURE__;
    if (!state) {
      return true;
    }

    if (state.attachmentID && plugin?.api?.reader?.closeByItemID) {
      try {
        plugin.api.reader.closeByItemID(state.attachmentID);
        await waitFor(() => {
          return plugin.api.reader.getByItemID?.(state.attachmentID)
            ? null
            : true;
        }, {
          timeoutMs: 2000,
          intervalMs: 50,
        });
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
  })()`, {
    label: "visual:cleanup-state",
    timeoutMs: VISUAL_CAPTURE_EVAL_TIMEOUT_MS.cleanupState,
  });
}

async function cleanupVisualShell({ rdp, config }) {
  const rawResult = await evaluateCaptureInChrome(rdp, `(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitDoubleFrame = async (targetWindow) => {
      const boundRAF = typeof targetWindow?.requestAnimationFrame === "function"
        ? targetWindow.requestAnimationFrame.bind(targetWindow)
        : ((callback) => setTimeout(callback, 0));
      await new Promise((resolve) => boundRAF(() => boundRAF(resolve)));
    };
    const getAllWindows = () => {
      const windows = [];
      const enumerator = Services?.wm?.getEnumerator?.(null);
      while (enumerator && enumerator.hasMoreElements()) {
        const candidate = enumerator.getNext();
        if (candidate && candidate.closed !== true) {
          windows.push(candidate);
        }
      }
      return windows;
    };
    const listPreferenceWindows = () => {
      const windows = [];
      const enumerator = Services?.wm?.getEnumerator?.("zotero:pref");
      while (enumerator && enumerator.hasMoreElements()) {
        const candidate = enumerator.getNext();
        if (candidate && candidate.closed !== true) {
          windows.push(candidate);
        }
      }
      return windows;
    };
    const dismissPopup = (popup) => {
      if (!popup || typeof popup !== "object") {
        return false;
      }
      let touched = false;
      try {
        if (typeof popup.hidePopup === "function") {
          popup.hidePopup();
          touched = true;
        }
      } catch {}
      try {
        if ("open" in popup) {
          popup.open = false;
          touched = true;
        }
      } catch {}
      try {
        if (typeof popup.hide === "function") {
          popup.hide();
          touched = true;
        }
      } catch {}
      return touched;
    };
    const isPopupOpen = (popup) => {
      if (!popup || typeof popup !== "object") {
        return false;
      }
      const state = String(popup.state || popup.getAttribute?.("state") || "").trim().toLowerCase();
      if (popup.open === true || state === "open" || state === "showing") {
        return true;
      }
      try {
        return popup.hasAttribute?.("open") === true;
      } catch {
        return false;
      }
    };

    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    const mainWindow = typeof Zotero?.getMainWindow === "function"
      ? Zotero.getMainWindow()
      : null;
    let dismissedPopupCount = 0;
    const seenPopups = new Set();

    for (const window of getAllWindows()) {
      const doc = window?.document;
      if (!doc || typeof doc.querySelectorAll !== "function") {
        continue;
      }
      const popups = Array.from(doc.querySelectorAll("menupopup, panel"));
      for (const popup of popups) {
        if (!popup || seenPopups.has(popup) || !isPopupOpen(popup)) {
          continue;
        }
        seenPopups.add(popup);
        if (dismissPopup(popup)) {
          dismissedPopupCount += 1;
        }
      }
    }

    let closedPreferenceWindowCount = 0;
    for (const prefWindow of listPreferenceWindows()) {
      try {
        prefWindow.close();
        closedPreferenceWindowCount += 1;
      }
      catch {}
    }

    let contextPaneClosed = null;
    if (plugin?.api?.host?.setContextPaneOpen && mainWindow) {
      try {
        const contextPaneState = await plugin.api.host.setContextPaneOpen(false, {
          window: mainWindow,
          timeoutMs: 1500,
        });
        contextPaneClosed = contextPaneState?.open === false;
      }
      catch {}
    }
    else if (mainWindow?.ZoteroContextPane) {
      try {
        mainWindow.ZoteroContextPane.collapsed = true;
        contextPaneClosed = mainWindow.ZoteroContextPane.collapsed === true;
      }
      catch {}
    }

    if (mainWindow && typeof mainWindow.focus === "function") {
      try {
        mainWindow.focus();
      }
      catch {}
    }
    await wait(80);
    await waitDoubleFrame(mainWindow);

    return {
      ok: true,
      dismissedPopupCount,
      closedPreferenceWindowCount,
      contextPaneClosed,
    };
  })()`, {
    label: "visual:cleanup-shell",
    timeoutMs: VISUAL_CAPTURE_EVAL_TIMEOUT_MS.cleanupState,
  });

  return parseChromeEvalResult(rawResult);
}

async function getZoteroWindowBounds() {
  return await getZoteroWindowBoundsForTitle();
}

function escapeAppleScriptString(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"");
}

function buildZoteroWindowAppleScriptLines({ targetTitle = "", width = null, height = null } = {}) {
  const serializedTargetTitle = escapeAppleScriptString(normalizeMaybeString(targetTitle) || "");
  const normalizedWidth = Number.parseInt(String(width ?? ""), 10);
  const normalizedHeight = Number.parseInt(String(height ?? ""), 10);
  const canResize = Number.isFinite(normalizedWidth) && normalizedWidth > 0
    && Number.isFinite(normalizedHeight) && normalizedHeight > 0;
  const lines = [
    'tell application "Zotero"',
    "activate",
    `set requestedWindowTitle to "${serializedTargetTitle}"`,
    "if (count of windows) is 0 then error \"No Zotero windows available\"",
    "try",
    "set fallbackWindow to front window",
    "on error",
    "set fallbackWindow to window 1",
    "end try",
    "if requestedWindowTitle is not \"\" then",
    "try",
    "set targetWindow to first window whose name is requestedWindowTitle",
    "on error",
    "set targetWindow to fallbackWindow",
    "end try",
    "else",
    "set targetWindow to fallbackWindow",
    "end if",
    "try",
    "set index of targetWindow to 1",
    "end try",
  ];
  if (canResize) {
    lines.push(
      "set currentBounds to bounds of targetWindow",
      "set leftPos to item 1 of currentBounds",
      "set topPos to item 2 of currentBounds",
      `set bounds of targetWindow to {leftPos, topPos, leftPos + ${normalizedWidth}, topPos + ${normalizedHeight}}`,
    );
  }
  lines.push(
    "set windowName to \"\"",
    "try",
    "set windowName to name of targetWindow",
    "end try",
    "set {leftPos, topPos, rightPos, bottomPos} to bounds of targetWindow",
    "set winWidth to rightPos - leftPos",
    "set winHeight to bottomPos - topPos",
    "return windowName & linefeed & (leftPos as string) & \",\" & (topPos as string) & \",\" & (winWidth as string) & \",\" & (winHeight as string)",
    "end tell",
  );
  return lines;
}

function parseZoteroWindowAppleScriptResult(stdout, contextLabel = "Zotero window bounds") {
  const normalizedOutput = String(stdout || "").replace(/\s+$/, "");
  const lines = normalizedOutput.split(/\r?\n/);
  if (lines.length === 1) {
    lines.unshift("");
  }
  if (lines.length < 2) {
    throw new Error(`Invalid ${contextLabel}: ${normalizedOutput.trim()}`);
  }
  const parts = String(lines[1] || "")
    .trim()
    .split(",")
    .map((value) => Number.parseInt(value, 10));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid ${contextLabel}: ${normalizedOutput.trim()}`);
  }
  return normalizeCaptureWindowBounds({
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
    title: normalizeMaybeString(lines[0]) || null,
    source: "app-window",
  });
}

async function getZoteroWindowBoundsForTitle(targetTitle = null) {
  const lines = buildZoteroWindowAppleScriptLines({ targetTitle });
  const { stdout } = await execFileText("osascript", lines.flatMap((line) => ["-e", line]));
  return parseZoteroWindowAppleScriptResult(stdout, "Zotero window bounds");
}

async function activateZoteroWindowForCapture(activationDelayMs = VISUAL_CAPTURE_POLICY.activationDelayMs) {
  await execFileText("osascript", ["-e", 'tell application "Zotero" to activate']);
  await sleep(Math.max(0, Number(activationDelayMs || 0)));
}

async function getZoteroQuartzWindowBounds(title = null) {
  const rawTitle = normalizeMaybeString(title) || "";
  const script = `
ObjC.import('CoreGraphics');
const targetTitle = ${JSON.stringify(rawTitle)};
const normalizeText = (value) => String(value || "").trim().toLowerCase();
const normalizedTargetTitle = normalizeText(targetTitle);
const windows = ObjC.deepUnwrap($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, $.kCGNullWindowID)) || [];
const matches = windows
  .filter((entry) => {
    const ownerName = normalizeText(entry.kCGWindowOwnerName);
    const layer = Number(entry.kCGWindowLayer || 0);
    const windowTitle = normalizeText(entry.kCGWindowName);
    const titleMatches = !normalizedTargetTitle
      || windowTitle === normalizedTargetTitle
      || (windowTitle && windowTitle.includes(normalizedTargetTitle))
      || (normalizedTargetTitle && normalizedTargetTitle.includes(windowTitle));
    return ownerName.includes("zotero") && layer === 0 && titleMatches;
  })
  .sort((left, right) => {
    const leftArea = Number(left.kCGWindowBounds?.Width || 0) * Number(left.kCGWindowBounds?.Height || 0);
    const rightArea = Number(right.kCGWindowBounds?.Width || 0) * Number(right.kCGWindowBounds?.Height || 0);
    return rightArea - leftArea;
  });
const chosen = matches[0] || null;
JSON.stringify(chosen ? {
  x: Number(chosen.kCGWindowBounds?.X || 0),
  y: Number(chosen.kCGWindowBounds?.Y || 0),
  width: Number(chosen.kCGWindowBounds?.Width || 0),
  height: Number(chosen.kCGWindowBounds?.Height || 0),
  title: String(chosen.kCGWindowName || targetTitle || ""),
  source: "cg-window",
  windowNumber: Number(chosen.kCGWindowNumber || 0),
} : null);
`.trim();

  const { stdout } = await execFileText("osascript", ["-l", "JavaScript", "-e", script]);
  const payload = JSON.parse(stdout.trim() || "null");
  return normalizeCaptureWindowBounds(payload);
}

async function focusChromeCaptureWindow({ rdp, geometry = VISUAL_CAPTURE_WINDOW_GEOMETRY }) {
  if (!rdp) {
    return null;
  }

  const width = Number.parseInt(String(geometry?.width || VISUAL_CAPTURE_WINDOW_GEOMETRY.width), 10);
  const height = Number.parseInt(String(geometry?.height || VISUAL_CAPTURE_WINDOW_GEOMETRY.height), 10);
  const rawResult = await evaluateCaptureInChrome(rdp, `(() => {
    const targetWindow = typeof Zotero?.getMainWindow === "function"
      ? Zotero.getMainWindow()
      : null;
    if (!targetWindow) {
      return null;
    }

    try {
      targetWindow.focus();
    } catch {}

    try {
      if (typeof targetWindow.resizeTo === "function" && ${Number.isFinite(width) ? width : 0} > 0 && ${Number.isFinite(height) ? height : 0} > 0) {
        targetWindow.resizeTo(${Number.isFinite(width) ? width : 0}, ${Number.isFinite(height) ? height : 0});
      }
    } catch {}

    const chromeWindow = targetWindow.top || targetWindow;
    return {
      x: Number(chromeWindow.screenX),
      y: Number(chromeWindow.screenY),
      width: Number(chromeWindow.outerWidth),
      height: Number(chromeWindow.outerHeight),
      title: String(chromeWindow.document?.title || targetWindow.document?.title || ""),
      source: "chrome-target",
    };
  })()`, {
    label: "visual:focus-window",
    timeoutMs: VISUAL_CAPTURE_EVAL_TIMEOUT_MS.focusWindow,
  });

  return normalizeCaptureWindowBounds(parseChromeEvalResult(rawResult));
}

async function captureZoteroWindowViaRdp(filePath, options = {}) {
  if (!options.rdp) {
    return null;
  }

  const requestedWidth = Number.parseInt(String(
    options.bounds?.width
    || options.geometry?.width
    || VISUAL_CAPTURE_WINDOW_GEOMETRY.width,
  ), 10);
  const requestedHeight = Number.parseInt(String(
    options.bounds?.height
    || options.geometry?.height
    || VISUAL_CAPTURE_WINDOW_GEOMETRY.height,
  ), 10);
  const rawResult = await evaluateCaptureInChrome(options.rdp, `(async () => {
    try {
      const win = typeof Zotero?.getMainWindow === "function"
        ? Zotero.getMainWindow()
        : null;
      if (!win?.document?.createElement) {
        return JSON.stringify({ ok: false, error: "main-window-missing" });
      }

      try {
        win.focus();
      } catch {}

      const width = ${Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : 0} > 0
        ? ${Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : 0}
        : Number(win.innerWidth || win.outerWidth || 0);
      const height = ${Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : 0} > 0
        ? ${Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : 0}
        : Number(win.innerHeight || win.outerHeight || 0);
      const scale = Number(win.devicePixelRatio || 1) > 0
        ? Number(win.devicePixelRatio || 1)
        : 1;
      const canvas = win.document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(width * scale));
      canvas.height = Math.max(1, Math.ceil(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return JSON.stringify({ ok: false, error: "canvas-context-missing" });
      }
      if (typeof ctx.drawWindow !== "function") {
        return JSON.stringify({ ok: false, error: "drawWindow-unavailable" });
      }

      ctx.scale(scale, scale);
      ctx.drawWindow(win, 0, 0, width, height, "rgb(255,255,255)");

      const dataUrl = canvas.toDataURL("image/png");
      const base64 = String(dataUrl || "").split(",")[1] || "";
      if (!base64) {
        return JSON.stringify({ ok: false, error: "png-encode-failed" });
      }

      const decodeBase64 = typeof atob === "function"
        ? atob
        : globalThis.atob;
      const binary = decodeBase64(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const IOUtilsAPI = typeof IOUtils !== "undefined"
        ? IOUtils
        : ChromeUtils.importESModule("resource://gre/modules/IOUtils.sys.mjs").IOUtils;
      await IOUtilsAPI.write(${JSON.stringify(filePath)}, bytes);

      return JSON.stringify({
        ok: true,
        x: Number(win.screenX || 0),
        y: Number(win.screenY || 0),
        width: Number(width || 0),
        height: Number(height || 0),
        title: String(win.document?.title || ""),
        source: "rdp-draw-window",
      });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: error?.message || String(error),
      });
    }
  })()`, {
    label: "visual:capture-window-rdp",
    timeoutMs: VISUAL_CAPTURE_EVAL_TIMEOUT_MS.hostAction,
  });

  const payload = parseChromeEvalResult(rawResult);
  if (!payload || payload.ok !== true) {
    throw attachVisualCaptureFailure(
      new Error(normalizeMaybeString(payload?.error) || "Unable to capture Zotero window via RDP"),
      {
        failureKind: "capture-command-failed",
        failureCategory: "capture-command-failed",
        failureStage: "capture-window-rdp",
        failureMessage: normalizeMaybeString(payload?.error) || "Unable to capture Zotero window via RDP",
        bounds: options.bounds || null,
        boundsSource: normalizeMaybeString(options.bounds?.source) || "rdp-draw-window",
        windowTitle: normalizeMaybeString(payload?.title) || normalizeMaybeString(options.bounds?.title),
        command: "rdp-draw-window",
      },
    );
  }

  return normalizeCaptureWindowBounds(payload);
}

async function setZoteroWindowGeometry(geometry = VISUAL_CAPTURE_WINDOW_GEOMETRY, options = {}) {
  const width = Number.parseInt(String(geometry?.width || VISUAL_CAPTURE_WINDOW_GEOMETRY.width), 10);
  const height = Number.parseInt(String(geometry?.height || VISUAL_CAPTURE_WINDOW_GEOMETRY.height), 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return await getZoteroWindowBoundsForTitle(options.targetTitle);
  }
  const lines = buildZoteroWindowAppleScriptLines({
    targetTitle: options.targetTitle,
    width,
    height,
  });
  const { stdout } = await execFileText("osascript", lines.flatMap((line) => ["-e", line]));
  return parseZoteroWindowAppleScriptResult(stdout, "Zotero window bounds after geometry set");
}

async function ensureZoteroWindowReadyForCapture(options = {}) {
  const activationDelayMs = Number.isFinite(options.activationDelayMs) && options.activationDelayMs >= 0
    ? options.activationDelayMs
    : VISUAL_CAPTURE_POLICY.activationDelayMs;
  const settleDelayMs = Number.isFinite(options.settleDelayMs) && options.settleDelayMs >= 0
    ? options.settleDelayMs
    : 0;
  const geometry = options.geometry || VISUAL_CAPTURE_WINDOW_GEOMETRY;
  const explicitTargetTitle = normalizeMaybeString(options.targetTitle);
  const shouldUseChromeFocus = !explicitTargetTitle;

  try {
    await activateZoteroWindowForCapture(activationDelayMs);
  }
  catch (error) {
    throw attachVisualCaptureFailure(error, {
      failureKind: "window-activation-failed",
      failureCategory: "capture-command-failed",
      failureStage: "activate-window",
    });
  }
  const initialChromeBounds = shouldUseChromeFocus
    ? await focusChromeCaptureWindow({
      rdp: options.rdp,
      geometry,
    }).catch(() => null)
    : null;
  const fallbackBounds = await setZoteroWindowGeometry(geometry, {
    targetTitle: explicitTargetTitle,
  }).catch(() => null);
  const refreshedChromeBounds = shouldUseChromeFocus
    ? await focusChromeCaptureWindow({
      rdp: options.rdp,
      geometry,
    }).catch(() => null)
    : null;
  const preferredTitle = explicitTargetTitle
    || normalizeMaybeString(refreshedChromeBounds?.title)
    || normalizeMaybeString(initialChromeBounds?.title)
    || null;
  const quartzBounds = await getZoteroQuartzWindowBounds(preferredTitle).catch(() => null);
  const genericQuartzBounds = (quartzBounds || explicitTargetTitle)
    ? null
    : await getZoteroQuartzWindowBounds().catch(() => null);
  let bounds = null;
  try {
    bounds = await resolveCaptureWindowBounds({
      preferred: async () => quartzBounds || genericQuartzBounds || refreshedChromeBounds || initialChromeBounds,
      fallback: async () => fallbackBounds,
    });
  }
  catch (error) {
    throw attachVisualCaptureFailure(error, {
      failureKind: "window-bounds-unavailable",
      failureCategory: "capture-command-failed",
      failureStage: "resolve-window",
      bounds: quartzBounds || genericQuartzBounds || refreshedChromeBounds || initialChromeBounds || fallbackBounds || null,
    });
  }
  await sleep(settleDelayMs);
  return bounds;
}

async function captureZoteroWindow(filePath, options = {}) {
  if (!options.rdp && process.platform !== "darwin") {
    throw new Error("UI capture is currently implemented for macOS only");
  }

  let lastError = null;
  const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0
    ? options.maxAttempts
    : 3;
  const captureActivationDelayMs = Number.isFinite(options.activationDelayMs) && options.activationDelayMs >= 0
    ? options.activationDelayMs
    : Number(
      VISUAL_CAPTURE_POLICY.captureActivationDelayMs
      || VISUAL_CAPTURE_POLICY.activationDelayMs
      || 0,
    );
  const bounds = options.bounds && typeof options.bounds === "object"
    ? options.bounds
    : null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (options.rdp) {
        if (captureActivationDelayMs > 0) {
          await activateZoteroWindowForCapture(captureActivationDelayMs);
        }
        const rdpBounds = await captureZoteroWindowViaRdp(filePath, {
          rdp: options.rdp,
          bounds,
          geometry: options.geometry,
        });
        return rdpBounds || bounds;
      }

      let captureBounds = bounds;
      const captureGeometry = {
        width: captureBounds?.width || options.geometry?.width || VISUAL_CAPTURE_WINDOW_GEOMETRY.width,
        height: captureBounds?.height || options.geometry?.height || VISUAL_CAPTURE_WINDOW_GEOMETRY.height,
      };
      const targetTitle = normalizeMaybeString(options.targetTitle)
        || normalizeMaybeString(captureBounds?.title)
        || null;
      if (!captureBounds) {
        try {
          captureBounds = await setZoteroWindowGeometry(captureGeometry, { targetTitle });
        }
        catch (error) {
          throw attachVisualCaptureFailure(error, {
            failureKind: "window-bounds-unavailable",
            failureCategory: "capture-command-failed",
            failureStage: "set-window-geometry",
          });
        }
      }
      else {
        const refreshedBounds = await setZoteroWindowGeometry(captureGeometry, { targetTitle }).catch(() => null);
        if (refreshedBounds) {
          captureBounds = {
            ...captureBounds,
            ...refreshedBounds,
            title: captureBounds.title || refreshedBounds.title || null,
            source: captureBounds.source || refreshedBounds.source || null,
          };
        }
      }
      await activateZoteroWindowForCapture(captureActivationDelayMs);
      const quartzBounds = await getZoteroQuartzWindowBounds(targetTitle).catch(() => null);
      const genericQuartzBounds = (quartzBounds || targetTitle)
        ? null
        : await getZoteroQuartzWindowBounds().catch(() => null);
      const resolvedQuartzBounds = quartzBounds || genericQuartzBounds || null;
      if (resolvedQuartzBounds) {
        captureBounds = {
          ...captureBounds,
          ...resolvedQuartzBounds,
          title: resolvedQuartzBounds.title || captureBounds?.title || null,
          source: resolvedQuartzBounds.source || captureBounds?.source || null,
        };
      }
      const rect = `${captureBounds.x},${captureBounds.y},${captureBounds.width},${captureBounds.height}`;
      try {
        if (Number.isFinite(captureBounds?.windowNumber) && captureBounds.windowNumber > 0) {
          await execFileText("screencapture", ["-x", "-o", "-l", String(captureBounds.windowNumber), filePath]);
        }
        else {
          await execFileText("screencapture", ["-x", "-R", rect, filePath]);
        }
      }
      catch (error) {
        throw attachVisualCaptureFailure(error, {
          failureKind: "capture-command-failed",
          failureCategory: "capture-command-failed",
          failureStage: "capture-command",
          bounds: captureBounds,
          rect,
          command: "screencapture",
        });
      }
      return captureBounds;
    }
    catch (error) {
      lastError = error;
      await sleep(200);
    }
  }

  throw lastError || new Error("Unable to capture Zotero window");
}

function resolveSurfaceCaptureGeometry(surfaceTarget) {
  const windowBounds = normalizeCaptureWindowBounds(surfaceTarget?.windowBounds || null);
  if (!windowBounds) {
    return VISUAL_CAPTURE_WINDOW_GEOMETRY;
  }
  return {
    width: windowBounds.width,
    height: windowBounds.height,
  };
}

function resolveSurfaceCaptureBounds(surfaceTarget, currentWindowBounds = null) {
  const rect = normalizeCaptureWindowBounds(surfaceTarget?.rect || null);
  const previousWindowBounds = normalizeCaptureWindowBounds(surfaceTarget?.windowBounds || null);
  const normalizedCurrentWindowBounds = normalizeCaptureWindowBounds(currentWindowBounds);
  const rectTitle = normalizeMaybeString(rect?.title);
  const previousWindowTitle = normalizeMaybeString(previousWindowBounds?.title);
  const currentWindowTitle = normalizeMaybeString(normalizedCurrentWindowBounds?.title);
  const allowWindowRebase = !(
    rectTitle
    && previousWindowTitle
    && currentWindowTitle
    && previousWindowTitle === rectTitle
    && currentWindowTitle !== rectTitle
  );

  if (rect) {
    const candidates = [];
    if (allowWindowRebase && previousWindowBounds && normalizedCurrentWindowBounds) {
      candidates.push(rebaseCaptureWindowBounds(rect, previousWindowBounds, normalizedCurrentWindowBounds));
    }
    candidates.push(rect);

    if (normalizedCurrentWindowBounds) {
      for (const candidate of candidates) {
        const alignment = inspectCaptureBoundsAlignment(candidate, normalizedCurrentWindowBounds);
        if (alignment.ok) {
          return candidate;
        }
      }
      return null;
    }

    return candidates[0] || null;
  }

  return normalizedCurrentWindowBounds || previousWindowBounds;
}

function clipCaptureBoundsToWindow(bounds, windowBounds) {
  const normalizedBounds = normalizeCaptureWindowBounds(bounds);
  const normalizedWindowBounds = normalizeCaptureWindowBounds(windowBounds);
  if (!normalizedBounds || !normalizedWindowBounds) {
    return normalizedBounds;
  }

  const left = Math.max(normalizedBounds.x, normalizedWindowBounds.x);
  const top = Math.max(normalizedBounds.y, normalizedWindowBounds.y);
  const right = Math.min(
    normalizedBounds.x + normalizedBounds.width,
    normalizedWindowBounds.x + normalizedWindowBounds.width,
  );
  const bottom = Math.min(
    normalizedBounds.y + normalizedBounds.height,
    normalizedWindowBounds.y + normalizedWindowBounds.height,
  );
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    x: left,
    y: top,
    width,
    height,
    title: normalizedBounds.title || normalizedWindowBounds.title || null,
    source: normalizedBounds.source || normalizedWindowBounds.source || null,
  };
}

function resolveSurfaceReferenceStage(surfaceTarget, actionId = null) {
  const kind = String(surfaceTarget?.captureKind || actionId || "").trim();
  if (!kind) {
    return null;
  }

  if (kind.startsWith("surface-preference-")) {
    return null;
  }

  if (kind.startsWith("surface-item-pane-") || kind.startsWith("surface-context-pane-")) {
    return "library";
  }

  if (kind.startsWith("surface-reader-")) {
    return "reader";
  }

  if (kind.startsWith("surface-menu-")) {
    const targetScene = String(surfaceTarget?.details?.targetScene || "").trim();
    if (targetScene.startsWith("reader")) {
      return "reader";
    }
    if (targetScene) {
      return "library";
    }
  }

  return null;
}

function resolveStageCropPixelBounds(stageCapture, cropBounds) {
  const stageBounds = normalizeCaptureWindowBounds(stageCapture?.bounds || null);
  const normalizedCropBounds = clipCaptureBoundsToWindow(cropBounds, stageBounds);
  const pixelWidth = Number(stageCapture?.analysis?.width || 0);
  const pixelHeight = Number(stageCapture?.analysis?.height || 0);
  if (!stageBounds || !normalizedCropBounds || pixelWidth <= 0 || pixelHeight <= 0) {
    return null;
  }

  const scaleX = pixelWidth / stageBounds.width;
  const scaleY = pixelHeight / stageBounds.height;
  const offsetX = Math.max(0, normalizedCropBounds.x - stageBounds.x);
  const offsetY = Math.max(0, normalizedCropBounds.y - stageBounds.y);
  const cropX = Math.max(0, Math.round(offsetX * scaleX));
  const cropY = Math.max(0, Math.round(offsetY * scaleY));
  const cropWidth = Math.max(1, Math.round(normalizedCropBounds.width * scaleX));
  const cropHeight = Math.max(1, Math.round(normalizedCropBounds.height * scaleY));

  return {
    cropX: Math.min(cropX, Math.max(0, pixelWidth - 1)),
    cropY: Math.min(cropY, Math.max(0, pixelHeight - 1)),
    cropWidth: Math.min(cropWidth, pixelWidth - cropX),
    cropHeight: Math.min(cropHeight, pixelHeight - cropY),
    bounds: normalizedCropBounds,
  };
}

async function captureSurfaceFromStageImage({
  filePath,
  stageCapture,
  cropBounds,
}) {
  const stageBounds = normalizeCaptureWindowBounds(stageCapture?.bounds || null);
  const resolvedPixelBounds = resolveStageCropPixelBounds(stageCapture, cropBounds);
  if (!stageBounds || !resolvedPixelBounds) {
    return null;
  }

  const {
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    bounds,
  } = resolvedPixelBounds;
  const stagePixelWidth = Number(stageCapture?.analysis?.width || 0);
  const stagePixelHeight = Number(stageCapture?.analysis?.height || 0);

  if (
    cropX === 0
    && cropY === 0
    && cropWidth === stagePixelWidth
    && cropHeight === stagePixelHeight
  ) {
    await fs.copyFile(stageCapture.path, filePath);
  }
  else {
    await execFileText("sips", [
      "-c",
      String(cropHeight),
      String(cropWidth),
      "--cropOffset",
      String(cropY),
      String(cropX),
      stageCapture.path,
      "--out",
      filePath,
    ]);
  }

  return {
    ...bounds,
    source: normalizeMaybeString(bounds.source)
      || normalizeMaybeString(stageBounds.source)
      || "stage-crop",
  };
}

async function captureScreenRect(filePath, bounds) {
  if (process.platform !== "darwin") {
    throw new Error("Surface-local UI capture is currently implemented for macOS only");
  }
  const captureBounds = normalizeCaptureWindowBounds(bounds);
  if (!captureBounds) {
    throw new Error("Surface capture bounds are unavailable");
  }
  const rect = `${captureBounds.x},${captureBounds.y},${captureBounds.width},${captureBounds.height}`;
  await execFileText("screencapture", ["-x", "-R", rect, filePath]);
  return captureBounds;
}

async function runHostActionInChrome({
  rdp,
  config,
  actionId,
  payload = {},
}) {
  const rawResult = await evaluateCaptureInChrome(rdp, `(async () => {
    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    if (!plugin?.api?.agent?.runHostAction) {
      return JSON.stringify({
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
      });
    }
    const result = await plugin.api.agent.runHostAction(
      ${JSON.stringify(actionId)},
      ${JSON.stringify(payload)},
    );
    return JSON.stringify(result);
  })()`, {
    label: `visual:host-action:${actionId}`,
    timeoutMs: VISUAL_CAPTURE_EVAL_TIMEOUT_MS.hostAction,
  });
  return parseChromeEvalResult(rawResult);
}

async function registerReaderToolbarCaptureMarker({ rdp, config }) {
  const rawResult = await evaluateCaptureInChrome(rdp, `(() => {
    const key = "__CLEANROOM_AGENT_READER_TOOLBAR_CAPTURE__";
    if (globalThis[key]) {
      return true;
    }
    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    if (!plugin?.api?.reader?.registerEventListener) {
      return false;
    }
    const unregister = plugin.api.reader.registerEventListener(
      plugin.api.reader.READER_EVENT_TYPES.RENDER_TOOLBAR,
      (event) => {
        const doc = event?.doc;
        if (!doc || typeof doc.createElement !== "function" || typeof event?.append !== "function") {
          return;
        }
        if (doc.querySelector("[data-cleanroom-reader-toolbar-marker]")) {
          return;
        }
        const marker = doc.createElement("div");
        marker.dataset.cleanroomReaderToolbarMarker = "true";
        marker.dataset.cleanroomSurface = "reader-toolbar";
        marker.className = "cleanroom-reader-toolbar-marker";
        marker.textContent = "Cleanroom Reader Toolbar Capture";
        event.append(marker);
      },
    );
    globalThis[key] = { unregister };
    return true;
  })()`, {
    label: "visual:register-toolbar-marker",
    timeoutMs: VISUAL_CAPTURE_EVAL_TIMEOUT_MS.toolbarMarker,
  });
  return parseChromeEvalResult(rawResult) === true;
}

async function resolveReaderToolbarSurfaceTarget({ rdp, config }) {
  const rawResult = await evaluateCaptureInChrome(rdp, `(() => {
    const state = globalThis.__CLEANROOM_AGENT_VISUAL_STATE__ || {};
    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    const attachmentID = Number(state?.attachmentID || 0);
    if (!attachmentID || !plugin?.api?.reader || !plugin?.api?.host) {
      return JSON.stringify(null);
    }
    const element = plugin.api.reader.findToolbarElement(attachmentID, {
      selector: "[data-cleanroom-reader-toolbar-marker]",
    })
      || plugin.api.reader.findToolbarElement(attachmentID, {
        selector: "#sidebarToggleButton",
      })
      || plugin.api.reader.findToolbarElement(attachmentID, {
        selector: "#viewFindButton",
      })
      || plugin.api.reader.findToolbarElement(attachmentID, {
        selector: "#toolbarContainer .toolbarButton",
      })
      || plugin.api.reader.findToolbarElement(attachmentID);
    if (!element) {
      return JSON.stringify(null);
    }
    const target = plugin.api.host.buildSurfaceTarget({
      surfaceId: "render-toolbar",
      captureKind: "surface-reader-toolbar",
      label: "Reader Toolbar",
      element,
      window: element.ownerGlobal || element.ownerDocument?.defaultView || null,
      details: {
        itemID: attachmentID,
        surfaceEvidenceElement: element.dataset?.cleanroomReaderToolbarMarker === "true"
          ? "toolbar-marker"
          : typeof element.id === "string" && element.id.trim()
            ? element.id.trim()
            : typeof element.localName === "string" && element.localName.trim()
              ? element.localName.trim()
              : null,
      },
    });
    return JSON.stringify(target);
  })()`, {
    label: "visual:resolve-toolbar-target",
    timeoutMs: VISUAL_CAPTURE_EVAL_TIMEOUT_MS.surfaceTarget,
  });
  return parseChromeEvalResult(rawResult);
}

async function captureSurfaceEvidenceTarget({
  rdp,
  cycle,
  captureDir,
  surfaceTarget,
  actionId = null,
  stageCapture = null,
}) {
  const useReferenceStage = Boolean(
    stageCapture?.path
    && shouldCaptureSurfaceFromReferenceStage(surfaceTarget),
  );
  const normalizedStageBounds = useReferenceStage
    ? normalizeCaptureWindowBounds(stageCapture?.bounds || null)
    : null;
  const stageRelativeBounds = normalizedStageBounds
    ? resolveStageRelativeSurfaceBounds(surfaceTarget, normalizedStageBounds)
    : null;
  const currentWindowBounds = stageRelativeBounds
    ? null
    : await ensureZoteroWindowReadyForCapture({
      geometry: resolveSurfaceCaptureGeometry(surfaceTarget),
      activationDelayMs: 120,
      settleDelayMs: VISUAL_SURFACE_CAPTURE_DELAY_MS,
      targetTitle: surfaceTarget?.windowBounds?.title || null,
    }).catch(() => null);
  const liveRelativeBounds = currentWindowBounds
    ? resolveStageRelativeSurfaceBounds(surfaceTarget, currentWindowBounds)
    : null;
  const bounds = stageRelativeBounds
    ? clipCaptureBoundsToWindow(stageRelativeBounds, normalizedStageBounds) || stageRelativeBounds
    : liveRelativeBounds
      ? clipCaptureBoundsToWindow(liveRelativeBounds, currentWindowBounds) || liveRelativeBounds
      : resolveSurfaceCaptureBounds(surfaceTarget, currentWindowBounds);
  if (!bounds) {
    return {
      capture: null,
      warning: `${surfaceTarget?.captureKind || actionId || "surface"} 缺少可信 rect/windowBounds`,
    };
  }

  const kind = String(surfaceTarget?.captureKind || actionId || "surface").trim() || "surface";
  const filePath = path.join(captureDir, `cycle-${cycle}-${kind}.png`);
  if (useReferenceStage && normalizedStageBounds && stageCapture?.path && stageRelativeBounds) {
    await captureSurfaceFromStageImage({
      filePath,
      stageCapture,
      cropBounds: bounds,
    });
  }
  else {
    await captureScreenRect(filePath, bounds);
  }
  const analysis = await readPNGAnalysis(filePath);
  return {
    capture: {
      kind,
      path: filePath,
      bounds,
      analysis,
      scope: surfaceTarget?.scope || "surface-local",
      surfaceId: surfaceTarget?.surfaceId || null,
      label: surfaceTarget?.label || null,
      details: surfaceTarget?.details || {},
      metadata: {
        actionId,
        surfaceTarget,
        currentWindowBounds,
        referenceStage: useReferenceStage && normalizedStageBounds
          ? {
            kind: stageCapture?.kind || null,
            path: stageCapture?.path || null,
            bounds: normalizedStageBounds,
          }
          : null,
      },
    },
    warning: null,
  };
}

async function captureSurfaceLocalVisuals({
  rdp,
  config,
  cycle,
  captureDir,
  stageCaptures = null,
}) {
  const result = {
    captures: [],
    warnings: [],
  };

  const pushCaptureFromResult = async (actionResult, actionId) => {
    if (!actionResult?.surfaceTarget) {
      result.warnings.push(`${actionId} 未返回 surface target`);
      return;
    }
    const referenceStage = resolveSurfaceReferenceStage(actionResult.surfaceTarget, actionId);
    try {
      const captured = await captureSurfaceEvidenceTarget({
        rdp,
        cycle,
        captureDir,
        surfaceTarget: actionResult.surfaceTarget,
        actionId,
        stageCapture: referenceStage ? stageCaptures?.[referenceStage] || null : null,
      });
      if (captured.capture) {
        result.captures.push(captured.capture);
      }
      if (captured.warning) {
        result.warnings.push(captured.warning);
      }
    }
    catch (error) {
      result.warnings.push(`${actionId} 局部截图失败：${String(error?.message || error)}`);
    }
  };

  await prepareVisualState({ rdp, config, stage: "library" });
  await pushCaptureFromResult(
    await runHostActionInChrome({
      rdp,
      config,
      actionId: "preferences.openPane",
      payload: {
        paneID: `${config.addonRef}-preferences`,
      },
    }),
    "preferences.openPane",
  );
  await pushCaptureFromResult(
    await runHostActionInChrome({
      rdp,
      config,
      actionId: "itemPane.selectPane",
      payload: {
        paneID: `${config.addonRef}-details`,
        behavior: "instant",
      },
    }),
    "itemPane.selectPane",
  );

  try {
    await registerReaderToolbarCaptureMarker({ rdp, config });
  }
  catch (error) {
    result.warnings.push(`render-toolbar 标记注册失败：${String(error?.message || error)}`);
  }

  let readerState = null;
  try {
    readerState = await prepareVisualState({ rdp, config, stage: "reader" });
  }
  catch (error) {
    result.warnings.push(`reader 局部截图准备失败：${String(error?.message || error)}`);
    return result;
  }

  await pushCaptureFromResult(
    await runHostActionInChrome({
      rdp,
      config,
      actionId: "contextPane.selectPane",
      payload: {
        paneID: "info",
        behavior: "instant",
      },
    }),
    "contextPane.selectPane",
  );
  await pushCaptureFromResult(
    await runHostActionInChrome({
      rdp,
      config,
      actionId: "reader.sidebar.selectView",
      payload: {
        itemID: readerState.attachmentID,
        view: "thumbnails",
        activationPolicy: "ui-required",
      },
    }),
    "reader.sidebar.selectView",
  );

  const toolbarTarget = await resolveReaderToolbarSurfaceTarget({ rdp, config });
  if (toolbarTarget) {
    try {
      const captured = await captureSurfaceEvidenceTarget({
        cycle,
        captureDir,
        surfaceTarget: toolbarTarget,
        actionId: "render-toolbar",
      });
      if (captured.capture) {
        result.captures.push(captured.capture);
      }
      if (captured.warning) {
        result.warnings.push(captured.warning);
      }
    }
    catch (error) {
      result.warnings.push(`render-toolbar 局部截图失败：${String(error?.message || error)}`);
    }
  } else {
    result.warnings.push("render-toolbar 未返回局部截图目标");
  }

  await pushCaptureFromResult(
    await runHostActionInChrome({
      rdp,
      config,
      actionId: "menu.show",
      payload: {
        menuID: `${config.addonRef}-reader-summary`,
        target: "reader/menubar/view",
      },
    }),
    "menu.show",
  );

  return result;
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

async function pickBestAttemptAgainstVisualBaseline({
  attempts,
  kind,
  bootMode,
  baselineDir,
}) {
  const normalizedKind = normalizeMaybeString(kind);
  const normalizedBootMode = normalizeMaybeString(bootMode);
  const normalizedBaselineDir = normalizeMaybeString(baselineDir);
  if (!normalizedKind || !normalizedBootMode || !normalizedBaselineDir || !Array.isArray(attempts) || attempts.length === 0) {
    return null;
  }

  const baselinePath = path.join(
    normalizedBaselineDir,
    getVisualBaselineFilename({
      bootMode: normalizedBootMode,
      kind: normalizedKind,
    }),
  );
  if (!await pathExists(baselinePath)) {
    return null;
  }

  const thresholds = getVisualBaselineThreshold(normalizedKind);
  const scoredAttempts = [];

  for (const attempt of attempts) {
    const attemptPath = normalizeMaybeString(attempt?.path);
    if (!attemptPath) {
      continue;
    }
    try {
      const metrics = await comparePNGImagesWithSips({
        actualPath: attemptPath,
        baselinePath,
        pixelDiffTolerance: Number(thresholds?.pixelDiffTolerance || 0),
      });
      const comparison = evaluateVisualBaselineComparison({
        kind: normalizedKind,
        metrics,
        thresholds,
      });
      scoredAttempts.push({
        attempt,
        baselinePath,
        metrics,
        comparison,
        stabilityMetrics: {
          sameDimensions: typeof metrics?.sameDimensions === "boolean"
            ? metrics.sameDimensions
            : null,
          changedRatio: Number.isFinite(Number(metrics?.changedRatio))
            ? Number(metrics.changedRatio)
            : null,
          meanChannelDiff: Number.isFinite(Number(metrics?.meanChannelDiff))
            ? Number(metrics.meanChannelDiff)
            : null,
          thresholdChangedRatio: Number.isFinite(Number(thresholds?.changedRatio))
            ? Number(thresholds.changedRatio)
            : null,
          thresholdMeanChannelDiff: Number.isFinite(Number(thresholds?.meanChannelDiff))
            ? Number(thresholds.meanChannelDiff)
            : null,
        },
      });
    }
    catch {}
  }

  if (scoredAttempts.length === 0) {
    return null;
  }

  scoredAttempts.sort((left, right) => {
    if (left.comparison.ok !== right.comparison.ok) {
      return left.comparison.ok ? -1 : 1;
    }
    const leftIssueCount = Array.isArray(left.comparison.issues) ? left.comparison.issues.length : 0;
    const rightIssueCount = Array.isArray(right.comparison.issues) ? right.comparison.issues.length : 0;
    if (leftIssueCount !== rightIssueCount) {
      return leftIssueCount - rightIssueCount;
    }
    const leftChangedRatio = Number.isFinite(Number(left.metrics?.changedRatio))
      ? Number(left.metrics.changedRatio)
      : Number.POSITIVE_INFINITY;
    const rightChangedRatio = Number.isFinite(Number(right.metrics?.changedRatio))
      ? Number(right.metrics.changedRatio)
      : Number.POSITIVE_INFINITY;
    if (leftChangedRatio !== rightChangedRatio) {
      return leftChangedRatio - rightChangedRatio;
    }
    const leftMeanChannelDiff = Number.isFinite(Number(left.metrics?.meanChannelDiff))
      ? Number(left.metrics.meanChannelDiff)
      : Number.POSITIVE_INFINITY;
    const rightMeanChannelDiff = Number.isFinite(Number(right.metrics?.meanChannelDiff))
      ? Number(right.metrics.meanChannelDiff)
      : Number.POSITIVE_INFINITY;
    if (leftMeanChannelDiff !== rightMeanChannelDiff) {
      return leftMeanChannelDiff - rightMeanChannelDiff;
    }
    return Number(left.attempt?.index || 0) - Number(right.attempt?.index || 0);
  });

  return scoredAttempts[0] || null;
}

async function captureStableVisualStage({
  rdp,
  config,
  stage,
  cycle,
  bootMode,
  captureDir,
  visualBaselineDir,
}) {
  const policy = summarizeVisualCapturePolicy();
  const warmupMs = getVisualStageWarmupMs(stage);
  const settlePolicy = getVisualStageSettlePolicy(stage);
  const maxAttempts = Math.max(1, Number(policy.maxAttemptsPerStage || 1));
  const attempts = [];
  let state = null;
  let preCaptureSettle = null;
  let lastFailure = null;
  let stageAttemptCount = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    stageAttemptCount = attempt;
    // Re-assert the same visual stage before every attempt so retries do not
    // drift away from the intended library/reader surface while the UI settles.
    try {
      preCaptureSettle = await waitForVisualStageSettled({
        stage,
        stableSampleTarget: settlePolicy.stableSampleTarget,
        maxPolls: settlePolicy.maxPolls,
        intervalMs: settlePolicy.intervalMs,
        sleep,
        sample: async () => await prepareVisualState({ rdp, config, stage }),
        verify: async () => {
          await settleVisualStageAfterReady({
            rdp,
            config,
            stage,
            delayMs: settlePolicy.postReadyDelayMs,
          });
          return await prepareVisualState({ rdp, config, stage });
        },
      });
      state = preCaptureSettle?.state || await prepareVisualState({ rdp, config, stage });
      const bounds = await ensureZoteroWindowReadyForCapture({
        rdp,
        geometry: policy.targetWindowGeometry,
        activationDelayMs: policy.activationDelayMs,
        settleDelayMs: attempt === 1 ? warmupMs : Number(policy.betweenAttemptsMs || 0),
        targetTitle: resolveVisualStageTargetTitle(stage, state),
      });
      const attemptPath = path.join(captureDir, `cycle-${cycle}-${stage}-attempt-${attempt}.png`);
      const capturedBounds = await captureZoteroWindow(attemptPath, {
        rdp,
        bounds,
        targetTitle: resolveVisualStageTargetTitle(stage, state),
        activationDelayMs: policy.captureActivationDelayMs || policy.activationDelayMs,
      });
      const analysis = await readPNGAnalysis(attemptPath);
      attempts.push({
        index: attempt,
        path: attemptPath,
        bounds: capturedBounds || bounds,
        analysis,
      });
      lastFailure = null;

      if (attempts.length >= 2 && isStableVisualAttemptPair(attempts[attempts.length - 2], attempts[attempts.length - 1])) {
        break;
      }
    }
    catch (error) {
      if (!state && error?.visualStageState) {
        state = error.visualStageState;
      }
      lastFailure = error;
      if (attempt < maxAttempts) {
        await sleep(Math.max(0, Number(policy.betweenAttemptsMs || 0)));
      }
    }
  }

  const latestSuccessfulAttempt = attempts[attempts.length - 1] || null;
  const finalAttemptFailed = Boolean(
    lastFailure
    && Number(stageAttemptCount || 0) > 0
    && Number(latestSuccessfulAttempt?.index || 0) !== Number(stageAttemptCount || 0),
  );
  if (attempts.length === 0) {
    return buildFailedVisualStageResult({
      stage,
      warmupMs,
      maxAttempts,
      preCaptureSettle,
      state,
      attempts,
      attemptCount: stageAttemptCount,
      error: lastFailure,
      fallback: {
        failureKind: "capture-stage-failed",
        failureStage: "capture-stage",
      },
    });
  }

  const previousAttempt = attempts.length >= 2 ? attempts[attempts.length - 2] : null;
  const currentAttempt = attempts[attempts.length - 1] || null;
  const stableHashPair = previousAttempt && currentAttempt
    ? isStableVisualAttemptPair(previousAttempt, currentAttempt)
    : false;
  const fallbackFailure = finalAttemptFailed
    ? inferVisualStageFailure(lastFailure, {
      failureKind: "capture-stage-failed",
      failureStage: "capture-stage",
    })
    : null;
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
  let selected = attempts[attempts.length - 1];
  if (!stableHashPair && stable !== true) {
    const baselineBestAttempt = await pickBestAttemptAgainstVisualBaseline({
      attempts,
      kind: stage,
      bootMode,
      baselineDir: visualBaselineDir,
    });
    if (baselineBestAttempt?.attempt) {
      selected = baselineBestAttempt.attempt;
      if (baselineBestAttempt.comparison?.ok === true) {
        stable = true;
        selectionReason = "baseline-best-match";
        stabilityMetrics = baselineBestAttempt.stabilityMetrics;
      }
    }
  }
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
      preCaptureSettle,
      attemptCount: Math.max(
        attempts.length,
        Number(stageAttemptCount || 0),
      ),
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
      failureKind: fallbackFailure?.failureKind || null,
      failureCategory: fallbackFailure?.failureCategory || null,
      failureStage: fallbackFailure?.failureStage || null,
      failureMessage: fallbackFailure?.failureMessage || null,
      bounds: fallbackFailure?.bounds || null,
      boundsSource: fallbackFailure?.boundsSource || null,
      windowTitle: fallbackFailure?.windowTitle || null,
      command: fallbackFailure?.command || null,
      commandExitCode: fallbackFailure?.commandExitCode ?? null,
      stderr: fallbackFailure?.stderr || null,
      stdout: fallbackFailure?.stdout || null,
      rect: fallbackFailure?.rect || null,
    },
    warning: null,
  };
}

function resolveVisualCaptureWindowTitle(capture) {
  return normalizeMaybeString(
    capture?.bounds?.title
    || capture?.metadata?.windowTitle
    || capture?.metadata?.preparation?.windowTitle,
  );
}

function findCrossStageCaptureHashCollision(captures, currentCapture) {
  const currentHash = normalizeMaybeString(currentCapture?.analysis?.sha256);
  const currentKind = normalizeMaybeString(currentCapture?.kind);
  const currentTitle = resolveVisualCaptureWindowTitle(currentCapture);
  if (!currentHash || !currentKind || !currentTitle) {
    return null;
  }
  return (Array.isArray(captures) ? captures : []).find((capture) => {
    const candidateHash = normalizeMaybeString(capture?.analysis?.sha256);
    const candidateKind = normalizeMaybeString(capture?.kind);
    const candidateTitle = resolveVisualCaptureWindowTitle(capture);
    return Boolean(
      candidateHash
      && candidateHash === currentHash
      && candidateKind
      && candidateKind !== currentKind
      && candidateTitle
      && candidateTitle !== currentTitle,
    );
  }) || null;
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
    try {
      await cleanupVisualShell({ rdp, config });
    }
    catch (error) {
      visuals.warnings.push(`pre-capture shell cleanup failed: ${String(error?.message || error)}`);
    }

    let skipSurfaceLocal = false;
    for (const stage of VISUAL_CAPTURE_POLICY.stageOrder || []) {
      const stageCapture = await captureStableVisualStage({
        rdp,
        config,
        stage,
        cycle,
        bootMode,
        captureDir,
        visualBaselineDir,
      });
      const conflictingCapture = stageCapture.capture
        ? findCrossStageCaptureHashCollision(visuals.captures, stageCapture.capture)
        : null;
      if (conflictingCapture && stageCapture.stability) {
        const currentTitle = resolveVisualCaptureWindowTitle(stageCapture.capture);
        const conflictingTitle = resolveVisualCaptureWindowTitle(conflictingCapture);
        stageCapture.stability = {
          ...stageCapture.stability,
          stable: false,
          failureKind: "capture-target-collision",
          failureCategory: "capture-command-failed",
          failureStage: "capture-stage",
          failureMessage: `${stageCapture.capture.kind} capture duplicated ${conflictingCapture.kind} hash while window titles differed (${currentTitle} vs ${conflictingTitle})`,
          boundsSource: stageCapture.stability.boundsSource
            || stageCapture.capture?.bounds?.source
            || null,
          windowTitle: stageCapture.stability.windowTitle
            || currentTitle
            || null,
        };
        visuals.warnings.push(
          `${stageCapture.capture.kind} capture matched ${conflictingCapture.kind} hash with a different window title; treating this stage as wrong-target capture`,
        );
      }
      if (stageCapture.capture) {
        visuals.captures.push(stageCapture.capture);
      }
      if (stageCapture.stability) {
        visuals.captureStability.stages.push(stageCapture.stability);
      }
      if (stageCapture.warning) {
        visuals.warnings.push(stageCapture.warning);
      }
      if (stage === "reader" && (!stageCapture.capture || stageCapture.stability?.stable === false)) {
        skipSurfaceLocal = true;
      }
    }

    if (skipSurfaceLocal) {
      visuals.warnings.push("surface-local capture skipped because reader stage did not yield a stable base capture");
    }
    else {
      const surfaceLocal = await captureSurfaceLocalVisuals({
        rdp,
        config,
        cycle,
        captureDir,
        stageCaptures: {
          library: visuals.captures.find((entry) => entry.kind === "library") || null,
          reader: visuals.captures.find((entry) => entry.kind === "reader") || null,
        },
      });
      if (Array.isArray(surfaceLocal?.captures) && surfaceLocal.captures.length > 0) {
        visuals.captures.push(...surfaceLocal.captures);
      }
      if (Array.isArray(surfaceLocal?.warnings) && surfaceLocal.warnings.length > 0) {
        visuals.warnings.push(...surfaceLocal.warnings);
      }
    }
  } finally {
    try {
      await cleanupVisualState({ rdp, config });
    }
    catch (error) {
      visuals.warnings.push(`cleanup failed: ${String(error?.message || error)}`);
    }
    try {
      await cleanupVisualShell({ rdp, config });
    }
    catch (error) {
      visuals.warnings.push(`post-capture shell cleanup failed: ${String(error?.message || error)}`);
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
  runtimeSanitization = null,
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

  let rdp = null;
  try {
    const connection = await connectRdpWithLaunchDiagnostics({
      child,
      rdpPort,
      processLogs,
    });
    rdp = connection.rdp;
    return { child, rdp, processLogs };
  }
  catch (error) {
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
  const options = parseArgs(process.argv.slice(2));
  const runnerConfig = await readRunnerConfig({ projectRoot, mode: "agent" });
  const buildLock = await acquireBuildLock({ owner: "agent-zotero-e2e.mjs" });

  try {
    const { config, buildPath } = await readAddonRuntimeInfo(projectRoot, {
      requireBuild: false,
    });
    const performanceBudgetConfig = await readPerformanceBudgetConfig();
    if (!options.skipBuild && !await pathExists(buildPath)) {
      buildAddon(projectRoot, {
        env: {
          CLEANROOM_BUILD_LOCK_HELD: "1",
        },
      });
    }
    if (!await pathExists(buildPath)) {
      throw new Error(`Build output not found: ${buildPath}`);
    }

    const rdpPort = runnerConfig.rdpPort || await findFreePort().catch((error) => {
      throw wrapScriptError(error, {
        failedStage: "resolve-rdp-port",
      });
    });
    const runtimeSanitization = await prepareRuntime({
      projectRoot,
      profilePath: runnerConfig.profilePath,
      dataDir: runnerConfig.dataDir,
      fresh: options.fresh,
      exclusiveProjectRuntime: true,
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
      details: {
        runtimeSanitization,
      },
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
            runtimeSanitization,
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
        const localeHealth = await step("check-locale-files", async () => inspectBaselineMainLocaleFiles(projectRoot));
        checks.localeFTLOK = localeHealth.ok;
        checks.localeFTLMissingCount = Number(localeHealth.missingCount || 0);
        checks.localeFTLMissingEntries = Array.isArray(localeHealth.missingEntries)
          ? localeHealth.missingEntries
          : [];
        checks.localeFTLValueDriftCount = Number(localeHealth.valueDriftCount || 0);
        checks.localeFTLValueDriftEntries = Array.isArray(localeHealth.valueDriftEntries)
          ? localeHealth.valueDriftEntries
          : [];
        checks.localeFTLStructureDriftCount = Number(localeHealth.structureDriftCount || 0);
        checks.localeFTLStructureDriftEntries = Array.isArray(localeHealth.structureDriftEntries)
          ? localeHealth.structureDriftEntries
          : [];
        const tests = options.skipTests
          ? null
          : await step("run-tests", async () => runIntegratedTests({
            rdp: session.rdp,
            config,
          }));
        const scenarios = await step("run-scenarios", async () => runIntegratedScenarioBatch({
          projectRoot,
          rdp: session.rdp,
          config,
          modeLabel: "agent:zotero:e2e",
          processLogs: session.processLogs.slice(processLogStart),
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
        const scenarioBatchIncomplete = scenarios?.execution?.incomplete === true;
        const runtimeLogSummary = scenarioBatchIncomplete
          ? {
            total: 0,
            errorCount: 0,
            warnCount: 0,
            infoCount: 0,
            errorBoundaryHitCount: 0,
            errorBoundaryEvents: [],
            recentErrors: [],
            recentWarnings: [],
          }
          : await step("read-logs", async () => readCapturedLogs(session.rdp));
        const visuals = options.captureUI && !scenarioBatchIncomplete
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
            warnings: [
              scenarioBatchIncomplete
                ? "UI capture skipped because scenario execution ended in an incomplete runner state"
                : "UI capture skipped by --no-ui-capture",
            ],
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
          {
            durationMs: report.durationMs,
            details: report.details,
          },
        ),
      );
    } else {
      report.errorCategory = null;
      report.errorCategoryLabel = null;
      report.errorMessage = null;
      report.failedStage = null;
    }
    Object.assign(report, pickAdditiveE2ESummaryFields(report, {
      performanceBudgetConfig,
    }));

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
