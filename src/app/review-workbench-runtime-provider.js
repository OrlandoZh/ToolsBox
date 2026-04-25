const REVIEW_WORKBENCH_WAVE_ID = "AGENT-REVIEW-WORKBENCH-WAVE-001";
const REVIEW_WORKBENCH_DEFAULT_VALIDATION_LEVEL = "visual-recommended";
const REVIEW_WORKBENCH_SCOPE_MODULES = Object.freeze([
  "dev-only-review-workbench",
  "review-workbench-json-state-store",
  "review-workbench-command-entry",
  "route-aware-validation-summary",
]);
const REVIEW_WORKBENCH_OUT_OF_SCOPE_MODULES = Object.freeze([
  "real-ai-provider",
  "product-user-feature",
  "react-lane-promotion",
  "automatic-arbitrary-source-patching",
  "release-remote-distribution",
]);
const REVIEW_WORKBENCH_SCOPE_NOTES = Object.freeze([
  "This workbench is an interactive review layer over current truth and evidence.",
  "V1 only produces deterministic review plans and never applies arbitrary source patches.",
  "Standalone window route stays outside the optional React lane.",
]);
const REVIEW_WORKBENCH_EVIDENCE_DEFAULT_COMMANDS = Object.freeze([
  "npm run agent:zotero:e2e",
  "npm run agent:monitor",
  "npm run agent:gate",
]);
const REVIEW_WORKBENCH_GATE_DEFAULT_COMMAND = "npm run agent:gate";
const REVIEW_WORKBENCH_PATCH_DEFAULT_COMMANDS = Object.freeze([
  "npm run agent:monitor",
  "npm run agent:gate",
]);
const REVIEW_WORKBENCH_VALIDATION_LEVEL_LABELS = Object.freeze({
  "visual-required": "需要视觉验证",
  "visual-recommended": "建议视觉验证",
  "visual-not-needed": "无需视觉验证",
});
const OBSERVED_STATE_SUMMARY_DENY_PATTERNS = [
  /path/iu,
  /screenshot/iu,
  /image/iu,
  /markup/iu,
  /html/iu,
  /outerhtml/iu,
  /innerhtml/iu,
  /content/iu,
  /text/iu,
  /url/iu,
  /uri/iu,
  /user/iu,
  /email/iu,
  /token/iu,
  /secret/iu,
  /auth/iu,
  /cookie/iu,
  /profile/iu,
  /database/iu,
  /data(?:dir|directory)?/iu,
];
const OBSERVED_STATE_STATUS_KEY_PATTERNS = [
  /(?:^|[-_.])status(?:label)?$/iu,
  /(?:^|[-_.])state$/iu,
  /(?:^|[-_.])mode$/iu,
  /(?:^|[-_.])kind$/iu,
  /(?:^|[-_.])category$/iu,
  /(?:^|[-_.])type$/iu,
  /(?:^|[-_.])variant$/iu,
  /(?:^|[-_.])source$/iu,
  /(?:^|[-_.])result$/iu,
  /(?:^|[-_.])failurekind$/iu,
  /^selected[A-Za-z0-9_-]*ID$/u,
  /^active[A-Za-z0-9_-]*ID$/u,
];
const OBSERVED_STATE_NUMBER_METRIC_PATTERNS = [
  /count$/iu,
  /total$/iu,
  /passed$/iu,
  /failed$/iu,
  /attempts?$/iu,
  /durationms$/iu,
  /elapsedms$/iu,
  /timems$/iu,
];

function clone(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function ensureString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function ensureStringArray(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => ensureString(item))
      .filter(Boolean),
  ));
}

function ensureFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function truncateString(value, maxLength = 160) {
  const normalized = ensureString(value);
  if (!normalized || normalized.length <= maxLength) {
    return normalized || null;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function getPathUtils(globalScope) {
  if (globalScope?.PathUtils && typeof globalScope.PathUtils.join === "function") {
    return globalScope.PathUtils;
  }
  return null;
}

function getIOUtils(globalScope) {
  if (globalScope?.IOUtils && typeof globalScope.IOUtils.readUTF8 === "function") {
    return globalScope.IOUtils;
  }
  return null;
}

function isTruthyObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDevelopmentChromeRoot(rootURI) {
  const normalized = ensureString(rootURI);
  return normalized.startsWith("file://") || normalized.startsWith("chrome://");
}

export function isReviewWorkbenchDevRuntime({ rootURI, runtime = null } = {}) {
  const normalized = ensureString(rootURI || runtime?.rootURI);
  if (!normalized) {
    return false;
  }
  if (
    normalized.startsWith("jar:")
    || normalized.includes(".xpi!/")
    || normalized.startsWith("resource://")
  ) {
    return false;
  }
  const executionMode = ensureString(runtime?.executionMode || runtime?.packageMode).toLowerCase();
  if (executionMode === "release" || executionMode === "xpi" || executionMode === "export") {
    return false;
  }
  return isDevelopmentChromeRoot(normalized);
}

function fileURIToPath(rootURI = "") {
  const normalized = ensureString(rootURI).replace(/[?#].*$/u, "");
  if (!normalized.startsWith("file://")) {
    return null;
  }
  let decoded = "";
  try {
    decoded = decodeURIComponent(normalized.slice("file://".length));
  } catch {
    decoded = normalized.slice("file://".length);
  }
  if (/^\/[A-Za-z]:\//u.test(decoded)) {
    return decoded.slice(1);
  }
  return decoded || null;
}

export function detectReviewWorkbenchProjectRoot({ rootURI, addonRef } = {}) {
  const filePath = fileURIToPath(rootURI);
  if (!filePath) {
    return null;
  }
  const normalizedAddonRef = ensureString(addonRef);
  if (!normalizedAddonRef) {
    return null;
  }
  const normalizedPath = filePath.replace(/\\/gu, "/");
  const exactMarker = `/build/${normalizedAddonRef}`;
  if (normalizedPath.endsWith(exactMarker)) {
    return normalizedPath.slice(0, normalizedPath.length - exactMarker.length) || null;
  }
  const nestedMarker = `${exactMarker}/`;
  const markerIndex = normalizedPath.lastIndexOf(nestedMarker);
  if (markerIndex >= 0) {
    return normalizedPath.slice(0, markerIndex) || null;
  }
  return null;
}

function summarizeCatalog(actions = []) {
  const list = Array.isArray(actions) ? actions : [];
  const categories = new Map();
  let executableCount = 0;
  list.forEach((entry) => {
    const category = ensureString(entry?.category, "uncategorized");
    categories.set(category, (categories.get(category) || 0) + 1);
    if (entry?.executable === true) {
      executableCount += 1;
    }
  });
  return {
    total: list.length,
    executableCount,
    categories: Array.from(categories.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => left.category.localeCompare(right.category, "en")),
    actions: list.map((entry) => ({
      id: ensureString(entry?.id),
      label: ensureString(entry?.label),
      category: ensureString(entry?.category, "uncategorized"),
      status: ensureString(entry?.status, "unknown"),
      executable: entry?.executable === true,
      summary: ensureString(entry?.summary),
    })),
  };
}

function shouldDenyObservedStateKey(key) {
  return OBSERVED_STATE_SUMMARY_DENY_PATTERNS.some((pattern) => pattern.test(String(key || "")));
}

function matchesAnyKeyPattern(key, patterns = []) {
  const normalized = String(key || "").trim();
  return Boolean(normalized) && patterns.some((pattern) => pattern.test(normalized));
}

function isStatusLikeValue(value) {
  const normalized = ensureString(value);
  return Boolean(normalized)
    && normalized.length <= 96
    && /^[\p{Letter}\p{Number}._:/ -]+$/u.test(normalized);
}

function summarizeObservedState(source = {}) {
  const observedState = isTruthyObject(source) ? source : {};
  const statusFields = {};
  const booleanMetrics = {};
  const numberMetrics = {};
  const arrayMetrics = [];
  const objectMetrics = [];

  Object.entries(observedState).forEach(([key, value]) => {
    if (shouldDenyObservedStateKey(key)) {
      return;
    }
    if (typeof value === "string") {
      if (matchesAnyKeyPattern(key, OBSERVED_STATE_STATUS_KEY_PATTERNS) && isStatusLikeValue(value)) {
        statusFields[key] = truncateString(value, 96);
      }
      return;
    }
    if (typeof value === "boolean") {
      booleanMetrics[key] = value;
      return;
    }
    if (typeof value === "number") {
      if (matchesAnyKeyPattern(key, OBSERVED_STATE_NUMBER_METRIC_PATTERNS)) {
        numberMetrics[key] = ensureFiniteNumber(value, 0);
      }
      return;
    }
    if (Array.isArray(value)) {
      arrayMetrics.push({
        key,
        count: value.length,
      });
      return;
    }
    if (isTruthyObject(value)) {
      objectMetrics.push({
        key,
        keyCount: Object.keys(value)
          .filter((candidate) => !shouldDenyObservedStateKey(candidate))
          .length,
      });
    }
  });

  return {
    statusFields,
    booleanMetrics,
    numberMetrics,
    arrayMetrics,
    objectMetrics,
  };
}

function normalizeObservedStateSummary(source = {}) {
  if (!isTruthyObject(source)) {
    return summarizeObservedState({});
  }
  const summary = summarizeObservedState({});
  const statusFields = isTruthyObject(source.statusFields) ? source.statusFields : {};
  Object.entries(statusFields).forEach(([key, value]) => {
    if (
      !shouldDenyObservedStateKey(key)
      && matchesAnyKeyPattern(key, OBSERVED_STATE_STATUS_KEY_PATTERNS)
      && isStatusLikeValue(value)
    ) {
      summary.statusFields[key] = truncateString(value, 96);
    }
  });

  const booleanMetrics = isTruthyObject(source.booleanMetrics) ? source.booleanMetrics : {};
  Object.entries(booleanMetrics).forEach(([key, value]) => {
    if (!shouldDenyObservedStateKey(key) && typeof value === "boolean") {
      summary.booleanMetrics[key] = value;
    }
  });

  const numberMetrics = isTruthyObject(source.numberMetrics) ? source.numberMetrics : {};
  Object.entries(numberMetrics).forEach(([key, value]) => {
    if (
      !shouldDenyObservedStateKey(key)
      && typeof value === "number"
      && matchesAnyKeyPattern(key, OBSERVED_STATE_NUMBER_METRIC_PATTERNS)
    ) {
      summary.numberMetrics[key] = ensureFiniteNumber(value, 0);
    }
  });

  if (Array.isArray(source.arrayMetrics)) {
    source.arrayMetrics.forEach((entry) => {
      const key = ensureString(entry?.key, null);
      if (key && !shouldDenyObservedStateKey(key)) {
        summary.arrayMetrics.push({
          key,
          count: ensureFiniteNumber(entry?.count, 0),
        });
      }
    });
  }

  if (Array.isArray(source.objectMetrics)) {
    source.objectMetrics.forEach((entry) => {
      const key = ensureString(entry?.key, null);
      if (key && !shouldDenyObservedStateKey(key)) {
        summary.objectMetrics.push({
          key,
          keyCount: ensureFiniteNumber(entry?.keyCount, 0),
        });
      }
    });
  }

  return summary;
}

export function summarizeHostActionExecutionEntry(entry = {}) {
  const observedStateSource = isTruthyObject(entry?.observedState)
    ? entry.observedState
    : null;
  return {
    actionId: ensureString(entry?.actionId),
    ok: entry?.ok === true,
    failureKind: ensureString(entry?.failureKind, null),
    executedAt: ensureString(entry?.executedAt, null),
    surfaceTarget: ensureString(entry?.surfaceTarget, null),
    readiness: {
      ok: entry?.readiness?.ok === true,
      total: ensureFiniteNumber(entry?.readiness?.total, 0),
      passed: ensureFiniteNumber(entry?.readiness?.passed, 0),
      failed: ensureFiniteNumber(entry?.readiness?.failed, 0),
    },
    observedStateSummary: observedStateSource
      ? summarizeObservedState(observedStateSource)
      : normalizeObservedStateSummary(entry?.observedStateSummary),
  };
}

function normalizeValidationLevelValue(value, fallback = REVIEW_WORKBENCH_DEFAULT_VALIDATION_LEVEL) {
  const normalized = ensureString(value);
  if (/^visual-(?:required|recommended|not-needed)$/u.test(normalized)) {
    return normalized;
  }
  return ensureString(fallback, REVIEW_WORKBENCH_DEFAULT_VALIDATION_LEVEL);
}

function normalizeValidationLevel(runtimeCompact = null, fallback = REVIEW_WORKBENCH_DEFAULT_VALIDATION_LEVEL) {
  return normalizeValidationLevelValue(
    runtimeCompact?.truthRef?.validationLevel || runtimeCompact?.validationLevel,
    fallback,
  );
}

function normalizeValidationLevelLabel(runtimeCompact = null, level = REVIEW_WORKBENCH_DEFAULT_VALIDATION_LEVEL) {
  const raw = ensureString(runtimeCompact?.truthRef?.validationLevel || runtimeCompact?.validationLevel, null);
  if (raw && !raw.startsWith("visual-")) {
    return raw;
  }
  return REVIEW_WORKBENCH_VALIDATION_LEVEL_LABELS[level] || level;
}

export function normalizeReviewWorkbenchScopeSnapshot({
  runtimeCompact = null,
  validationLevel = REVIEW_WORKBENCH_DEFAULT_VALIDATION_LEVEL,
} = {}) {
  const compact = isTruthyObject(runtimeCompact) ? runtimeCompact : null;
  const available = Boolean(compact);
  return {
    available,
    truthSource: "docs/CURRENT_BACKLOG.md",
    truthKind: available ? "agent-context.runtimeCompact" : "current-truth-compact-unavailable",
    workbenchWave: REVIEW_WORKBENCH_WAVE_ID,
    devOnly: true,
    productFeature: false,
    aiProviderConnected: false,
    currentMainline: ensureString(compact?.truthRef?.activeBatchId, "release-remote-updateurl-distribution"),
    acceptanceTrack: "functional-first -> window lifecycle -> structured annotation -> deterministic plan -> gate summary",
    validationDecision: normalizeValidationLevel(compact, validationLevel),
    validationLevel: normalizeValidationLevel(compact, validationLevel),
    validationLevelLabel: normalizeValidationLevelLabel(compact, normalizeValidationLevel(compact, validationLevel)),
    inScopeModules: REVIEW_WORKBENCH_SCOPE_MODULES.slice(),
    outOfScopeModules: REVIEW_WORKBENCH_OUT_OF_SCOPE_MODULES.slice(),
    truthRef: clone(compact?.truthRef || null),
    alignmentRef: clone(compact?.alignmentRef || null),
    artifactRefs: clone(compact?.artifactRefs || null),
    evidenceRefs: ensureStringArray(compact?.evidenceRefs),
    freshness: clone(compact?.freshness || null),
    notes: REVIEW_WORKBENCH_SCOPE_NOTES.slice(),
    summary: available
      ? truncateString(
        `${ensureString(compact?.truthRef?.activeBatchId, "-")} / ${ensureString(compact?.alignmentRef?.status, "missing")} / ${ensureString(compact?.actionRef?.nextAction, "-")}`,
        180,
      )
      : "agent-context runtimeCompact is unavailable in the current dev runtime.",
  };
}

export function normalizeReviewWorkbenchRouteSnapshot({
  validationLevel = REVIEW_WORKBENCH_DEFAULT_VALIDATION_LEVEL,
  prefsEnabled = true,
  providerAvailable = true,
} = {}) {
  const workbenchReady = Boolean(prefsEnabled) && Boolean(providerAvailable);
  return {
    available: true,
    routeId: "agent-review-workbench-window",
    surfaceKind: "standalone-window",
    implementation: "plain-js-html",
    optionalBundleLane: "not-required",
    reactLanePromoted: false,
    aiProviderConnected: false,
    validationLevel: normalizeValidationLevelValue(validationLevel),
    validationLevelLabel: REVIEW_WORKBENCH_VALIDATION_LEVEL_LABELS[normalizeValidationLevelValue(validationLevel)]
      || normalizeValidationLevelValue(validationLevel),
    commandAvailability: {
      prefsEnabled: Boolean(prefsEnabled),
      providerAvailable: Boolean(providerAvailable),
      workbenchReady,
    },
    readiness: {
      commandPaletteEntry: workbenchReady,
      standaloneWindow: Boolean(providerAvailable),
      windowShellReuse: Boolean(providerAvailable),
      closeCleanup: Boolean(providerAvailable),
      arbitraryPatchApply: false,
    },
    summary: workbenchReady
      ? "Standalone dev-only workbench route is ready."
      : "Standalone route exists but the workbench is currently disabled.",
  };
}

export function normalizeReviewWorkbenchEvidenceSummary({
  monitor = null,
  e2e = null,
} = {}) {
  const frontpage = isTruthyObject(monitor?.frontpageSummary) ? monitor.frontpageSummary : null;
  const compactE2E = isTruthyObject(monitor?.zoteroValidation?.e2e)
    ? monitor.zoteroValidation.e2e
    : (isTruthyObject(e2e?.summary) ? e2e.summary : e2e);

  if (!frontpage && !compactE2E) {
    return {
      available: false,
      status: "not-loaded",
      summary: "No monitor or Zotero E2E compact summary is currently available.",
      latestRuns: {
        e2e: null,
        monitor: null,
        gate: null,
      },
      nextCommands: REVIEW_WORKBENCH_EVIDENCE_DEFAULT_COMMANDS.slice(),
      primaryDiagnosis: null,
    };
  }

  const nextCommands = ensureStringArray([
    frontpage?.nextAction,
    compactE2E?.nextAction,
    ...REVIEW_WORKBENCH_EVIDENCE_DEFAULT_COMMANDS,
  ]);

  return {
    available: true,
    status: ensureString(frontpage?.status || compactE2E?.status, "unknown"),
    source: frontpage ? "agent-monitor.frontpageSummary" : "agent-zotero-e2e",
    summary: ensureString(
      frontpage?.headline
      || compactE2E?.summaryNote
      || compactE2E?.note
      || compactE2E?.summary
      || "Runtime evidence summary is available.",
      "Runtime evidence summary is available.",
    ),
    latestRuns: {
      e2e: ensureString(compactE2E?.generatedAt || e2e?.generatedAt, null),
      monitor: ensureString(monitor?.generatedAt, null),
      gate: null,
    },
    nextCommands,
    primaryDiagnosis: clone(compactE2E?.primaryDiagnosis || null),
    monitor: frontpage
      ? {
        status: ensureString(frontpage?.status, "unknown"),
        headline: ensureString(frontpage?.headline),
        nextAction: ensureString(frontpage?.nextAction, null),
      }
      : null,
    e2e: compactE2E
      ? {
        status: ensureString(compactE2E?.status, "unknown"),
        summary: ensureString(compactE2E?.summaryNote || compactE2E?.note || compactE2E?.summary),
        visualDriftCount: ensureFiniteNumber(compactE2E?.visualDriftCount, 0),
      }
      : null,
  };
}

export function normalizeReviewWorkbenchPatchPlanSummary({
  monitor = null,
  gate = null,
} = {}) {
  const autofix = isTruthyObject(monitor?.zoteroValidation?.autofix)
    ? monitor.zoteroValidation.autofix
    : (isTruthyObject(gate?.zoteroValidation?.autofix) ? gate.zoteroValidation.autofix : null);

  if (!autofix) {
    return {
      available: false,
      status: "not-loaded",
      summary: "No controlled patch plan summary is currently available.",
      patchPlanStatus: "missing",
      patchDraftCount: 0,
      verificationSummary: null,
      nextCommands: REVIEW_WORKBENCH_PATCH_DEFAULT_COMMANDS.slice(),
      latestPlanId: null,
    };
  }

  return {
    available: true,
    status: ensureString(autofix?.status || autofix?.patchPlanStatus, "unknown"),
    source: isTruthyObject(monitor?.zoteroValidation?.autofix)
      ? "agent-monitor.zoteroValidation.autofix"
      : "agent-gate.zoteroValidation.autofix",
    summary: ensureString(
      autofix?.patchVerificationSummary
      || autofix?.note
      || autofix?.patchPlanStatusLabel
      || autofix?.patchApplicationStatusLabel
      || "Controlled patch summary is available.",
      "Controlled patch summary is available.",
    ),
    patchPlanStatus: ensureString(autofix?.patchPlanStatus, "missing"),
    patchDraftCount: ensureFiniteNumber(autofix?.patchDraftCount, 0),
    verificationSummary: ensureString(autofix?.patchVerificationSummary, null),
    nextCommands: ensureStringArray([
      monitor?.frontpageSummary?.nextAction,
      gate?.frontpageSummary?.nextAction,
      ...REVIEW_WORKBENCH_PATCH_DEFAULT_COMMANDS,
    ]),
    latestPlanId: ensureString(
      autofix?.patchArchiveRunId
      || autofix?.patchArchiveEntryPath,
      null,
    ),
  };
}

export function normalizeReviewWorkbenchGateSummary({ gate = null } = {}) {
  const frontpage = isTruthyObject(gate?.frontpageSummary) ? gate.frontpageSummary : null;
  if (!frontpage) {
    return {
      available: false,
      status: "not-loaded",
      headline: null,
      summary: "No gate frontpage summary is currently available in the runtime bridge.",
      nextAction: REVIEW_WORKBENCH_GATE_DEFAULT_COMMAND,
      blockerCount: 0,
      validationDecision: null,
      latestRunId: null,
    };
  }

  return {
    available: true,
    status: ensureString(frontpage?.status, "unknown"),
    headline: ensureString(frontpage?.headline, null),
    summary: ensureString(frontpage?.headline, "Gate frontpage summary is available."),
    nextAction: ensureString(frontpage?.nextAction, REVIEW_WORKBENCH_GATE_DEFAULT_COMMAND),
    blockerCount: Array.isArray(frontpage?.primaryBlockers) ? frontpage.primaryBlockers.length : 0,
    validationDecision: clone(gate?.validationDecision || null),
    latestRunId: ensureString(gate?.generatedAt || gate?.runId, null),
  };
}

export function normalizeReviewWorkbenchHostActionStageSummary({
  actions = [],
  recentExecutions = [],
} = {}) {
  const catalog = summarizeCatalog(actions);
  const normalizedExecutions = (Array.isArray(recentExecutions) ? recentExecutions : [])
    .map((entry) => summarizeHostActionExecutionEntry(entry))
    .filter((entry) => entry.actionId);
  return {
    available: true,
    summary: `${catalog.total} host actions / ${catalog.executableCount} executable / ${normalizedExecutions.length} recent execution${normalizedExecutions.length === 1 ? "" : "s"}`,
    catalog,
    recentExecutions: normalizedExecutions,
    latestExecutionAt: normalizedExecutions[0]?.executedAt || null,
  };
}

function resolveArtifactsDir(projectRoot, pathUtils = null) {
  if (!projectRoot) {
    return null;
  }
  if (pathUtils?.join) {
    return pathUtils.join(projectRoot, "dist");
  }
  return `${projectRoot.replace(/[\\/]+$/u, "")}/dist`;
}

async function loadJSONIfExists(filePath, ioUtils) {
  if (!filePath || !ioUtils || typeof ioUtils.exists !== "function" || typeof ioUtils.readUTF8 !== "function") {
    return null;
  }
  if (!(await ioUtils.exists(filePath))) {
    return null;
  }
  try {
    return JSON.parse(await ioUtils.readUTF8(filePath));
  } catch {
    return null;
  }
}

export function createReviewWorkbenchRuntimeProvider(options = {}) {
  const {
    config,
    globalScope = null,
    runtime = null,
    runtimeInfo = null,
    getPrefsEnabled = () => true,
    listHostActions = () => [],
    getHostActionExecutions = () => [],
  } = options;

  const rootURI = ensureString(runtimeInfo?.rootURI || runtime?.rootURI, null);
  const devRuntime = isReviewWorkbenchDevRuntime({
    rootURI,
    runtime,
  });
  const projectRoot = ensureString(
    runtime?.projectRootPath
    || detectReviewWorkbenchProjectRoot({
      rootURI,
      addonRef: config?.addonRef,
    }),
    null,
  );
  const pathUtils = getPathUtils(globalScope);
  const ioUtils = getIOUtils(globalScope);
  const artifactsDir = resolveArtifactsDir(projectRoot, pathUtils);
  const contextPath = artifactsDir ? (pathUtils?.join ? pathUtils.join(artifactsDir, "agent-context.json") : `${artifactsDir}/agent-context.json`) : null;
  const monitorPath = artifactsDir ? (pathUtils?.join ? pathUtils.join(artifactsDir, "agent-monitor.json") : `${artifactsDir}/agent-monitor.json`) : null;
  const gatePath = artifactsDir ? (pathUtils?.join ? pathUtils.join(artifactsDir, "agent-gate.json") : `${artifactsDir}/agent-gate.json`) : null;
  const e2ePath = artifactsDir ? (pathUtils?.join ? pathUtils.join(artifactsDir, "agent-zotero-e2e.json") : `${artifactsDir}/agent-zotero-e2e.json`) : null;

  async function loadContextArtifact() {
    return await loadJSONIfExists(contextPath, ioUtils);
  }

  async function loadMonitorArtifact() {
    return await loadJSONIfExists(monitorPath, ioUtils);
  }

  async function loadGateArtifact() {
    return await loadJSONIfExists(gatePath, ioUtils);
  }

  async function loadE2EArtifact() {
    return await loadJSONIfExists(e2ePath, ioUtils);
  }

  function getAvailability() {
    if (!devRuntime) {
      return {
        available: false,
        reason: "non-dev-runtime",
        summary: "Agent Review Workbench is only available in unpacked template dev runtimes.",
      };
    }
    return {
      available: true,
      reason: null,
      summary: "Runtime compact review workbench provider is available.",
      projectRootResolved: Boolean(projectRoot),
      artifactReaderAvailable: Boolean(ioUtils),
    };
  }

  const providerAPI = {
    isAvailable() {
      return getAvailability().available === true;
    },
    getAvailability,
    async getScopeSnapshot() {
      const context = await loadContextArtifact();
      return normalizeReviewWorkbenchScopeSnapshot({
        runtimeCompact: context?.runtimeCompact || null,
        validationLevel: normalizeValidationLevel(context?.runtimeCompact || null),
      });
    },
    async getRouteSnapshot() {
      const context = await loadContextArtifact();
      return normalizeReviewWorkbenchRouteSnapshot({
        validationLevel: normalizeValidationLevel(context?.runtimeCompact || null),
        prefsEnabled: getPrefsEnabled(),
        providerAvailable: providerAPI.isAvailable(),
      });
    },
    async getEvidenceSummary() {
      const [monitor, e2e] = await Promise.all([
        loadMonitorArtifact(),
        loadE2EArtifact(),
      ]);
      return normalizeReviewWorkbenchEvidenceSummary({
        monitor,
        e2e,
      });
    },
    async getPatchPlanSummary() {
      const [monitor, gate] = await Promise.all([
        loadMonitorArtifact(),
        loadGateArtifact(),
      ]);
      return normalizeReviewWorkbenchPatchPlanSummary({
        monitor,
        gate,
      });
    },
    async getGateSummary() {
      const gate = await loadGateArtifact();
      return normalizeReviewWorkbenchGateSummary({
        gate,
      });
    },
    async getHostActionStageSummary() {
      return normalizeReviewWorkbenchHostActionStageSummary({
        actions: typeof listHostActions === "function" ? listHostActions() : [],
        recentExecutions: typeof getHostActionExecutions === "function" ? getHostActionExecutions() : [],
      });
    },
  };

  return Object.freeze(providerAPI);
}
