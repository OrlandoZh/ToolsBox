import { createZoteroJSONStateStore } from "../platform/zotero-json-state-store.js";
import { createWindowShellManager } from "../utils/window-shell.js";

export const AGENT_REVIEW_WORKBENCH_COMMAND_ID = "agent.reviewWorkbench.open";
export const AGENT_REVIEW_WORKBENCH_SHELL_PATH = "content/lib/agent-review-workbench.xhtml";
export const AGENT_REVIEW_WORKBENCH_STORE_SCHEMA_VERSION = 1;
const AGENT_REVIEW_WORKBENCH_WINDOW_CLEANUP_KEY = "__CleanroomAgentReviewWorkbenchCleanup__";
export const AGENT_REVIEW_WORKBENCH_STAGES = Object.freeze([
  Object.freeze({ key: "scope", label: "Scope" }),
  Object.freeze({ key: "route", label: "Route" }),
  Object.freeze({ key: "hostAction", label: "Host Action" }),
  Object.freeze({ key: "evidence", label: "Evidence" }),
  Object.freeze({ key: "patchPlan", label: "Patch Plan" }),
  Object.freeze({ key: "gate", label: "Gate" }),
]);

const STAGE_LABELS = Object.freeze(
  AGENT_REVIEW_WORKBENCH_STAGES.reduce((map, stage) => {
    map[stage.key] = stage.label;
    return map;
  }, {}),
);

const REVIEW_WORKBENCH_SCOPE_SNAPSHOT = Object.freeze({
  truthSource: "docs/CURRENT_BACKLOG.md",
  truthKind: "current-truth-compact",
  workbenchWave: "AGENT-REVIEW-WORKBENCH-WAVE-001",
  devOnly: true,
  productFeature: false,
  aiProviderConnected: false,
  currentMainline: "release-remote-updateurl-distribution",
  acceptanceTrack: "functional-first -> window lifecycle -> structured annotation -> deterministic plan -> gate summary",
  inScopeModules: Object.freeze([
    "dev-only-review-workbench",
    "review-workbench-json-state-store",
    "review-workbench-command-entry",
    "route-aware-validation-summary",
  ]),
  outOfScopeModules: Object.freeze([
    "real-ai-provider",
    "product-user-feature",
    "react-lane-promotion",
    "automatic-arbitrary-source-patching",
    "release-remote-distribution",
  ]),
  validationDecision: "visual-recommended",
  notes: Object.freeze([
    "This workbench is an interactive review layer over current truth and evidence.",
    "V1 only produces deterministic review plans and never applies arbitrary source patches.",
    "Standalone window route stays outside the optional React lane.",
  ]),
});

const REVIEW_WORKBENCH_ROUTE_SNAPSHOT = Object.freeze({
  routeId: "agent-review-workbench-window",
  surfaceKind: "standalone-window",
  implementation: "plain-js-html",
  optionalBundleLane: "not-required",
  reactLanePromoted: false,
  aiProviderConnected: false,
  validationLevel: "visual-recommended",
  readiness: Object.freeze({
    commandPaletteEntry: true,
    standaloneWindow: true,
    windowShellReuse: true,
    closeCleanup: true,
    arbitraryPatchApply: false,
  }),
});

const REVIEW_WORKBENCH_DEFAULT_COMMANDS = Object.freeze([
  "npm run check",
  "npm run agent:monitor",
  "npm run agent:gate",
]);

const PLAN_COMMANDS_BY_ACTION = Object.freeze({
  "draft-doc-update": Object.freeze([
    "npm run docs:sync-current-truth -- --check",
  ]),
  "refresh-evidence": Object.freeze([
    "npm run agent:zotero:e2e",
    "npm run agent:monitor",
    "npm run agent:gate",
  ]),
  "rerun-host-action": Object.freeze([
    "npm run agent:host:guard",
    "npm run agent:host:semantic:guard",
    "npm run agent:zotero:e2e",
  ]),
  "review-existing-patch-plan": Object.freeze([
    "npm run agent:monitor",
    "npm run agent:gate",
  ]),
  "manual-investigation": Object.freeze([
    "npm run agent:host:guard",
    "npm run agent:zotero:e2e",
  ]),
});

function clone(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function toErrorMessage(error) {
  if (!error) {
    return "unknown";
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error.message || error);
}

function isWindowClosedBeforeReadyError(error) {
  const message = toErrorMessage(error).toLowerCase();
  return message === "window closed before ready"
    || message === "window shell closed before ready";
}

function isValidStage(stage) {
  return AGENT_REVIEW_WORKBENCH_STAGES.some((entry) => entry.key === stage);
}

function normalizeStage(stage, fallback = "scope") {
  const candidate = String(stage || "").trim();
  return isValidStage(candidate) ? candidate : fallback;
}

function ensureString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function ensureISODate(value, fallback) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return fallback;
  }
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function normalizeStringArray(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

function createNowISO(now = () => new Date()) {
  const value = now();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function makeStableString(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => makeStableString(entry)).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((key) => {
    return `${JSON.stringify(key)}:${makeStableString(value[key])}`;
  }).join(",")}}`;
}

function hashStableValue(value) {
  const source = makeStableString(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16)}`;
}

function createSessionID(now = () => new Date()) {
  const stamp = createNowISO(now).replace(/[-:.TZ]/g, "").slice(0, 14);
  const randomSuffix = Math.random().toString(16).slice(2, 8);
  return `review-session-${stamp}-${randomSuffix}`;
}

function createEntityID(kind = "entry") {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function createEmptyWorkbenchState(now = () => new Date()) {
  const timestamp = createNowISO(now);
  return {
    session: {
      id: createSessionID(now),
      createdAt: timestamp,
      updatedAt: timestamp,
      sourceRunIds: {
        e2e: null,
        monitor: null,
        gate: null,
      },
      activeStage: "scope",
    },
    steps: AGENT_REVIEW_WORKBENCH_STAGES.map((entry) => ({
      key: entry.key,
      label: entry.label,
    })),
    stepResults: {},
    annotations: [],
    plans: [],
    stale: {
      stages: [],
      byStage: {},
      sourceHash: null,
      checkedAt: timestamp,
    },
    meta: {
      lastError: null,
      lastCorruptStoreAt: null,
    },
  };
}

function normalizeSourceRunIds(value = {}) {
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  return {
    e2e: ensureString(candidate.e2e, null),
    monitor: ensureString(candidate.monitor, null),
    gate: ensureString(candidate.gate, null),
  };
}

function normalizeStepResult(stage, value = {}, now = () => new Date()) {
  const timestamp = createNowISO(now);
  return {
    stage,
    label: STAGE_LABELS[stage] || stage,
    refreshedAt: ensureISODate(value?.refreshedAt, timestamp),
    sourceHash: ensureString(value?.sourceHash, null),
    data: clone(value?.data && typeof value.data === "object" ? value.data : {}),
  };
}

function normalizeAnnotation(entry, now = () => new Date()) {
  const timestamp = createNowISO(now);
  const status = ensureString(entry?.status, "open");
  return {
    id: ensureString(entry?.id, createEntityID("annotation")),
    stage: normalizeStage(entry?.stage),
    targetPath: ensureString(entry?.targetPath),
    content: ensureString(entry?.content),
    status: status === "archived" ? "archived" : "open",
    createdAt: ensureISODate(entry?.createdAt, timestamp),
    updatedAt: ensureISODate(entry?.updatedAt, timestamp),
  };
}

function normalizePlan(entry, now = () => new Date()) {
  const timestamp = createNowISO(now);
  const actions = Array.isArray(entry?.actions)
    ? entry.actions.map((item) => ({
      action: ensureString(item?.action),
      stage: normalizeStage(item?.stage),
      targetPath: ensureString(item?.targetPath),
      reason: ensureString(item?.reason),
    })).filter((item) => item.action)
    : [];
  return {
    id: ensureString(entry?.id, createEntityID("plan")),
    annotationIds: normalizeStringArray(entry?.annotationIds),
    kind: ensureString(entry?.kind, "deterministic-review-plan"),
    summary: ensureString(entry?.summary, "No plan summary available."),
    patchPlanRef: ensureString(entry?.patchPlanRef, null),
    validationCommands: normalizeStringArray(entry?.validationCommands),
    status: ensureString(entry?.status, "draft"),
    createdAt: ensureISODate(entry?.createdAt, timestamp),
    actions,
  };
}

function normalizeWorkbenchState(value, options = {}) {
  const now = options.now || (() => new Date());
  const fallback = createEmptyWorkbenchState(now);
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const session = candidate.session && typeof candidate.session === "object"
    ? candidate.session
    : {};
  const normalized = {
    session: {
      id: ensureString(session.id, fallback.session.id),
      createdAt: ensureISODate(session.createdAt, fallback.session.createdAt),
      updatedAt: ensureISODate(session.updatedAt, fallback.session.updatedAt),
      sourceRunIds: normalizeSourceRunIds(session.sourceRunIds),
      activeStage: normalizeStage(session.activeStage, fallback.session.activeStage),
    },
    steps: AGENT_REVIEW_WORKBENCH_STAGES.map((entry) => ({
      key: entry.key,
      label: entry.label,
    })),
    stepResults: {},
    annotations: Array.isArray(candidate.annotations)
      ? candidate.annotations.map((entry) => normalizeAnnotation(entry, now))
      : [],
    plans: Array.isArray(candidate.plans)
      ? candidate.plans.map((entry) => normalizePlan(entry, now))
      : [],
    stale: {
      stages: normalizeStringArray(candidate?.stale?.stages).filter((stage) => isValidStage(stage)),
      byStage: {},
      sourceHash: ensureString(candidate?.stale?.sourceHash, null),
      checkedAt: ensureISODate(candidate?.stale?.checkedAt, fallback.stale.checkedAt),
    },
    meta: {
      lastError: ensureString(candidate?.meta?.lastError, null),
      lastCorruptStoreAt: ensureISODate(candidate?.meta?.lastCorruptStoreAt, null),
    },
  };

  AGENT_REVIEW_WORKBENCH_STAGES.forEach((stage) => {
    if (candidate?.stepResults && typeof candidate.stepResults === "object") {
      const stepValue = candidate.stepResults[stage.key];
      if (stepValue) {
        normalized.stepResults[stage.key] = normalizeStepResult(stage.key, stepValue, now);
      }
    }
  });

  normalized.annotations.sort((left, right) => {
    return String(right.updatedAt).localeCompare(String(left.updatedAt), "en");
  });
  normalized.plans.sort((left, right) => {
    return String(right.createdAt).localeCompare(String(left.createdAt), "en");
  });

  return normalized;
}

function isValidWorkbenchEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const state = value.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return false;
  }
  return Boolean(
    state.session
    && state.steps
    && state.stepResults
    && Array.isArray(state.annotations)
    && Array.isArray(state.plans),
  );
}

function createReviewWorkbenchStateStore({
  globalScope,
  config,
  logger,
  now = () => new Date(),
} = {}) {
  return createZoteroJSONStateStore({
    globalScope,
    id: "agent.reviewWorkbench",
    label: "Agent Review Workbench",
    directorySegments: [String(config?.addonRef || "cleanroomtemplate"), "agent-review-workbench"],
    fileName: "state.json",
    schemaVersion: AGENT_REVIEW_WORKBENCH_STORE_SCHEMA_VERSION,
    initialState: () => createEmptyWorkbenchState(now),
    logger,
    maxSerializedBytes: 262144,
    async deserialize(source) {
      try {
        const parsed = JSON.parse(source);
        const hasEnvelopeShape = Boolean(
          parsed
          && typeof parsed === "object"
          && !Array.isArray(parsed)
          && Object.prototype.hasOwnProperty.call(parsed, "schemaVersion")
          && Object.prototype.hasOwnProperty.call(parsed, "savedAt")
          && Object.prototype.hasOwnProperty.call(parsed, "state"),
        );
        if (isValidWorkbenchEnvelope(parsed)) {
          return parsed;
        }
        if (hasEnvelopeShape) {
          return {
            __reviewWorkbenchMigration: true,
            state: parsed.state,
            loadedVersion: parsed.schemaVersion,
            reason: "invalid-state-shape",
          };
        }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }
        return {
          __reviewWorkbenchMigration: true,
          state: parsed,
          reason: "invalid-state-shape",
        };
      } catch (error) {
        return {
          __reviewWorkbenchMigration: true,
          reason: "corrupt-json",
          error: toErrorMessage(error),
        };
      }
    },
    async migrate({ state, initialState }) {
      const fallback = normalizeWorkbenchState(initialState, { now });
      if (state?.__reviewWorkbenchMigration !== true) {
        return normalizeWorkbenchState(state, { now });
      }

      const migrated = normalizeWorkbenchState(state?.state || fallback, { now });
      migrated.meta.lastError = ensureString(state?.error, ensureString(state?.reason, "invalid-state"));
      migrated.meta.lastCorruptStoreAt = createNowISO(now);
      return migrated;
    },
    async prune({ state }) {
      const normalized = normalizeWorkbenchState(state, { now });
      normalized.annotations = normalized.annotations
        .filter((entry) => entry.status === "open")
        .concat(normalized.annotations.filter((entry) => entry.status === "archived").slice(0, 40))
        .slice(0, 120);
      normalized.plans = normalized.plans.slice(0, 40);
      return normalized;
    },
  });
}

function summarizeHostActions(actions = []) {
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
    categories: Array.from(categories.entries()).map(([category, count]) => ({
      category,
      count,
    })),
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

function buildScopeSnapshot() {
  return clone(REVIEW_WORKBENCH_SCOPE_SNAPSHOT);
}

function buildRouteSnapshot() {
  return clone(REVIEW_WORKBENCH_ROUTE_SNAPSHOT);
}

function buildHostActionFallback(actions = []) {
  const catalog = summarizeHostActions(actions);
  return {
    available: true,
    summary: `${catalog.total} host actions / ${catalog.executableCount} executable / 0 recent executions`,
    catalog,
    recentExecutions: [],
    latestExecutionAt: null,
  };
}

function buildEvidenceFallback() {
  return {
    available: false,
    status: "not-loaded",
    summary: "No monitor/gate/e2e summary has been injected into the runtime bridge.",
    nextCommands: [
      "npm run agent:zotero:e2e",
      "npm run agent:monitor",
      "npm run agent:gate",
    ],
    latestRuns: {
      e2e: null,
      monitor: null,
      gate: null,
    },
  };
}

function buildPatchPlanFallback() {
  return {
    available: false,
    status: "not-loaded",
    summary: "No controlled patch plan summary is currently available.",
    latestPlanId: null,
    nextCommands: [
      "npm run agent:monitor",
      "npm run agent:gate",
    ],
  };
}

function buildGateFallback() {
  return {
    available: false,
    status: "not-loaded",
    summary: "No gate frontpage summary is currently available in the runtime bridge.",
    nextCommand: "npm run agent:gate",
    latestRunId: null,
  };
}

async function maybeInvoke(getter, fallbackFactory) {
  if (typeof getter !== "function") {
    return fallbackFactory();
  }
  const value = await getter();
  if (value === null || value === undefined) {
    return fallbackFactory();
  }
  return clone(value);
}

async function collectStageSnapshot(stage, options = {}) {
  try {
    switch (stage) {
      case "scope":
        return await maybeInvoke(options.getScopeSnapshot, buildScopeSnapshot);
      case "route":
        return await maybeInvoke(options.getRouteSnapshot, buildRouteSnapshot);
      case "hostAction":
        return await maybeInvoke(options.getHostActionStageSummary, async () => {
          return buildHostActionFallback(await maybeInvoke(options.listHostActions, () => []));
        });
      case "evidence":
        return await maybeInvoke(options.getEvidenceSummary, () => {
          const diagnostics = typeof options.collectAgentDiagnostics === "function"
            ? options.collectAgentDiagnostics()
            : {};
          const summary = buildEvidenceFallback();
          summary.agentDiagnostics = {
            commandCount: Number(diagnostics?.commandCount || 0),
            menuCount: Number(diagnostics?.menuCount || 0),
            hostActionCount: Number(diagnostics?.hostActionCount || 0),
            runtimeBridgeStatus: ensureString(diagnostics?.runtimeBridgeStatus, "unknown"),
          };
          return summary;
        });
      case "patchPlan":
        return await maybeInvoke(options.getPatchPlanSummary, buildPatchPlanFallback);
      case "gate":
        return await maybeInvoke(options.getGateSummary, buildGateFallback);
      default:
        throw new Error(`Unknown review workbench stage: ${stage}`);
    }
  } catch (error) {
    return {
      available: false,
      status: "error",
      error: toErrorMessage(error),
    };
  }
}

async function collectAllStageSnapshots(options = {}) {
  const entries = {};
  for (const stage of AGENT_REVIEW_WORKBENCH_STAGES) {
    const data = await collectStageSnapshot(stage.key, options);
    entries[stage.key] = {
      stage: stage.key,
      label: stage.label,
      data,
      sourceHash: hashStableValue(data),
    };
  }
  return entries;
}

function buildStaleState(state, collectedSteps = {}, now = () => new Date()) {
  const byStage = {};
  const stages = [];
  AGENT_REVIEW_WORKBENCH_STAGES.forEach((stage) => {
    const persistedHash = ensureString(state?.stepResults?.[stage.key]?.sourceHash, null);
    const liveHash = ensureString(collectedSteps?.[stage.key]?.sourceHash, null);
    const stale = Boolean(persistedHash && liveHash && persistedHash !== liveHash);
    byStage[stage.key] = stale;
    if (stale) {
      stages.push(stage.key);
    }
  });
  return {
    stages,
    byStage,
    sourceHash: hashStableValue(
      AGENT_REVIEW_WORKBENCH_STAGES.map((stage) => ({
        stage: stage.key,
        liveHash: collectedSteps?.[stage.key]?.sourceHash || null,
        persistedHash: state?.stepResults?.[stage.key]?.sourceHash || null,
      })),
    ),
    checkedAt: createNowISO(now),
  };
}

function buildSourceRunIds(collectedSteps = {}) {
  const evidence = collectedSteps?.evidence?.data || {};
  const gate = collectedSteps?.gate?.data || {};
  const latestRuns = evidence.latestRuns && typeof evidence.latestRuns === "object"
    ? evidence.latestRuns
    : {};
  return normalizeSourceRunIds({
    e2e: latestRuns.e2e || null,
    monitor: latestRuns.monitor || null,
    gate: gate.latestRunId || latestRuns.gate || null,
  });
}

function buildPlanAction(annotation, stageSnapshot) {
  const stage = normalizeStage(annotation?.stage);
  const targetPath = ensureString(annotation?.targetPath).toLowerCase();
  const content = ensureString(annotation?.content).toLowerCase();
  const combined = `${stage}.${targetPath}.${content}`;

  if (
    combined.includes("hostaction")
    || combined.includes("host-action")
    || combined.includes("catalog")
    || (stage === "hostAction" && (
      targetPath.includes("action")
      || targetPath.includes("catalog")
      || targetPath.includes("execution")
      || targetPath.includes("summary")
      || !targetPath
    ))
  ) {
    return {
      action: "rerun-host-action",
      reason: "The annotation points at host action routing or catalog state.",
      stage,
      targetPath: annotation.targetPath,
    };
  }

  if (
    combined.includes("e2e")
    || combined.includes("monitor")
    || combined.includes("gate")
    || combined.includes("evidence")
    || stage === "evidence"
    || stage === "gate"
  ) {
    return {
      action: "refresh-evidence",
      reason: "The annotation targets runtime evidence or gate summaries.",
      stage,
      targetPath: annotation.targetPath,
    };
  }

  if (
    combined.includes("patch")
    || combined.includes("autofix")
    || (stage === "patchPlan" && (
      targetPath.includes("plan")
      || targetPath.includes("patch")
      || targetPath.includes("autofix")
      || targetPath.includes("validationcommands")
      || !targetPath
    ))
  ) {
    return {
      action: "review-existing-patch-plan",
      reason: "The annotation points at an existing controlled patch plan or autofix summary.",
      stage,
      targetPath: annotation.targetPath,
      patchPlanRef: ensureString(stageSnapshot?.latestPlanId, null),
    };
  }

  if (
    combined.includes("current_backlog")
    || combined.includes("currentbacklog")
    || combined.includes("project-expansion-wave")
    || combined.includes("project-validation-overrides")
    || combined.includes("validation")
    || combined.includes("wave")
    || combined.includes("docs")
    || (stage === "scope" && (
      targetPath.includes("truth")
      || targetPath.includes("validation")
      || targetPath.includes("wave")
      || targetPath.includes("scope")
      || !targetPath
    ))
    || (stage === "route" && (
      targetPath.includes("route")
      || targetPath.includes("validation")
      || targetPath.includes("standalone")
      || targetPath.includes("window")
      || targetPath.includes("surface")
      || !targetPath
    ))
  ) {
    return {
      action: "draft-doc-update",
      reason: "The annotation targets current truth, wave scope, or validation governance state.",
      stage,
      targetPath: annotation.targetPath,
    };
  }

  return {
    action: "manual-investigation",
    reason: "No safe deterministic mapping exists for this annotation target.",
    stage,
    targetPath: annotation.targetPath,
  };
}

function buildPlanSummary(actions = [], annotations = []) {
  const uniqueActions = Array.from(new Set(actions.map((entry) => entry.action)));
  if (uniqueActions.length === 0) {
    return "No deterministic plan could be generated.";
  }
  return `Map ${annotations.length} annotation(s) to ${uniqueActions.join(", ")}.`;
}

function buildValidationCommands(actions = []) {
  const commands = new Set(REVIEW_WORKBENCH_DEFAULT_COMMANDS);
  actions.forEach((entry) => {
    (PLAN_COMMANDS_BY_ACTION[entry.action] || []).forEach((command) => {
      commands.add(command);
    });
  });
  return Array.from(commands);
}

function buildPublicSnapshot(state, collectedSteps = {}, diagnostics = {}) {
  const stale = buildStaleState(state, collectedSteps);
  const activeStage = normalizeStage(state?.session?.activeStage);
  const activeAnnotations = (Array.isArray(state?.annotations) ? state.annotations : [])
    .filter((entry) => entry.stage === activeStage && entry.status === "open");
  return clone({
    session: {
      ...state.session,
      activeStage,
    },
    steps: AGENT_REVIEW_WORKBENCH_STAGES.map((stage) => ({
      key: stage.key,
      label: stage.label,
      stale: stale.byStage[stage.key] === true,
      refreshedAt: state?.stepResults?.[stage.key]?.refreshedAt || null,
    })),
    stepResults: state.stepResults,
    annotations: state.annotations,
    plans: state.plans,
    stale,
    capabilities: {
      canCreateAnnotation: true,
      canGeneratePlan: activeAnnotations.length > 0,
    },
    diagnostics: {
      enabled: true,
      sessionReady: Boolean(state?.session?.id),
      annotationCount: Array.isArray(state?.annotations) ? state.annotations.length : 0,
      planCount: Array.isArray(state?.plans) ? state.plans.length : 0,
      staleStageCount: stale.stages.length,
      lastError: ensureString(state?.meta?.lastError, diagnostics?.lastError || null),
      windowOpen: diagnostics?.windowOpen === true,
    },
  });
}

function normalizeAvailability(value = {}) {
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const available = candidate.available !== false;
  return {
    available,
    reason: ensureString(candidate.reason, available ? null : "review-workbench-disabled"),
    summary: ensureString(
      candidate.summary,
      available
        ? "Agent Review Workbench is available."
        : "Agent Review Workbench is unavailable in the current runtime.",
    ),
  };
}

function buildDisabledStageState(stage, summary) {
  return {
    stage,
    label: STAGE_LABELS[stage] || stage,
    refreshedAt: null,
    sourceHash: null,
    data: {
      available: false,
      status: "disabled",
      summary,
    },
  };
}

function buildDisabledSnapshot(now = () => new Date(), availability = {}) {
  const normalizedAvailability = normalizeAvailability(availability);
  const timestamp = createNowISO(now);
  const byStage = {};
  AGENT_REVIEW_WORKBENCH_STAGES.forEach((stage) => {
    byStage[stage.key] = false;
  });
  const stepResults = {};
  AGENT_REVIEW_WORKBENCH_STAGES.forEach((stage) => {
    stepResults[stage.key] = buildDisabledStageState(stage.key, normalizedAvailability.summary);
  });
  return clone({
    disabled: true,
    availability: normalizedAvailability,
    session: {
      id: null,
      createdAt: null,
      updatedAt: null,
      sourceRunIds: {
        e2e: null,
        monitor: null,
        gate: null,
      },
      activeStage: "scope",
    },
    steps: AGENT_REVIEW_WORKBENCH_STAGES.map((stage) => ({
      key: stage.key,
      label: stage.label,
      stale: false,
      refreshedAt: null,
    })),
    stepResults,
    annotations: [],
    plans: [],
    stale: {
      stages: [],
      byStage,
      sourceHash: null,
      checkedAt: timestamp,
    },
    capabilities: {
      canCreateAnnotation: false,
      canGeneratePlan: false,
    },
    diagnostics: {
      enabled: false,
      sessionReady: false,
      annotationCount: 0,
      planCount: 0,
      staleStageCount: 0,
      lastError: normalizedAvailability.reason,
      windowOpen: false,
    },
  });
}

export function createAgentReviewWorkbench(options = {}) {
  const {
    config,
    logger,
    host,
    themeManager = null,
    globalScope = null,
    isAvailable = null,
    getAvailability = null,
    listHostActions = () => [],
    collectAgentDiagnostics = () => ({}),
    getScopeSnapshot = null,
    getRouteSnapshot = null,
    getHostActionStageSummary = null,
    getEvidenceSummary = null,
    getPatchPlanSummary = null,
    getGateSummary = null,
    createStateStore = createReviewWorkbenchStateStore,
    createWindowShellManagerImpl = createWindowShellManager,
    now = () => new Date(),
    createId = createEntityID,
  } = options;

  let store = null;

  function debug(message, details = {}) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(message, details);
    }
  }

  function warn(message, details = {}) {
    if (logger && typeof logger.warn === "function") {
      logger.warn(message, details);
    }
  }

  const windowBridge = Object.freeze({
    async getSnapshot() {
      return await getSnapshot();
    },
    async createAnnotation(payload) {
      return await createAnnotation(payload);
    },
    async updateAnnotation(id, fields) {
      return await updateAnnotation(id, fields);
    },
    async generatePlan(payload) {
      return await generatePlan(payload);
    },
    async refreshStep(stage) {
      return await refreshStep(stage);
    },
  });

  function getStore() {
    if (!store) {
      store = createStateStore({
        globalScope,
        config,
        logger,
        now,
      });
    }
    return store;
  }

  async function ensureStoreReady() {
    const activeStore = getStore();
    if (typeof activeStore.init !== "function") {
      return normalizeWorkbenchState(activeStore.getState?.() || createEmptyWorkbenchState(now), { now });
    }
    const state = await activeStore.init();
    return normalizeWorkbenchState(state, { now });
  }

  async function collectSnapshots() {
    return await collectAllStageSnapshots({
      getScopeSnapshot,
      getRouteSnapshot,
      listHostActions,
      getHostActionStageSummary,
      collectAgentDiagnostics,
      getEvidenceSummary,
      getPatchPlanSummary,
      getGateSummary,
    });
  }

  function resolveAvailability() {
    if (typeof getAvailability === "function") {
      return normalizeAvailability(getAvailability());
    }
    if (typeof isAvailable === "function") {
      return normalizeAvailability({
        available: isAvailable(),
      });
    }
    return normalizeAvailability({
      available: true,
    });
  }

  async function maybeHydrateMissingStepResults(state, collectedSteps) {
    const missingStages = AGENT_REVIEW_WORKBENCH_STAGES
      .map((stage) => stage.key)
      .filter((stage) => !state.stepResults[stage]);
    if (missingStages.length === 0) {
      return state;
    }

    const nextState = normalizeWorkbenchState(state, { now });
    missingStages.forEach((stage) => {
      nextState.stepResults[stage] = normalizeStepResult(stage, {
        refreshedAt: createNowISO(now),
        sourceHash: collectedSteps[stage]?.sourceHash || null,
        data: collectedSteps[stage]?.data || {},
      }, now);
    });
    nextState.session.updatedAt = createNowISO(now);
    nextState.session.sourceRunIds = buildSourceRunIds(collectedSteps);
    nextState.stale = buildStaleState(nextState, collectedSteps, now);
    const activeStore = getStore();
    if (typeof activeStore.setState === "function") {
      await activeStore.setState(nextState, {
        flush: true,
      });
    }
    return normalizeWorkbenchState(nextState, { now });
  }

  async function readStateWithSnapshots() {
    const baseState = await ensureStoreReady();
    const collectedSteps = await collectSnapshots();
    const hydratedState = await maybeHydrateMissingStepResults(baseState, collectedSteps);
    return {
      state: hydratedState,
      collectedSteps,
    };
  }

  async function getSnapshot() {
    const availability = resolveAvailability();
    if (!availability.available) {
      const snapshot = buildDisabledSnapshot(now, availability);
      snapshot.diagnostics.windowOpen = isWorkbenchWindowOpen();
      return snapshot;
    }
    const { state, collectedSteps } = await readStateWithSnapshots();
    return buildPublicSnapshot(state, collectedSteps, {
      windowOpen: isWorkbenchWindowOpen(),
    });
  }

  async function persistState(updater) {
    const current = normalizeWorkbenchState(await ensureStoreReady(), { now });
    const next = normalizeWorkbenchState(await updater(clone(current)), { now });
    const activeStore = getStore();
    if (typeof activeStore.setState === "function") {
      await activeStore.setState(next, {
        flush: true,
      });
    }
    return next;
  }

  async function createAnnotation(payload = {}) {
    const availability = resolveAvailability();
    if (!availability.available) {
      const snapshot = buildDisabledSnapshot(now, availability);
      snapshot.diagnostics.windowOpen = isWorkbenchWindowOpen();
      return snapshot;
    }
    const stage = normalizeStage(payload.stage);
    const targetPath = ensureString(payload.targetPath);
    const content = ensureString(payload.content);
    const timestamp = createNowISO(now);

    await persistState((current) => {
      current.annotations.unshift({
        id: createId("annotation"),
        stage,
        targetPath,
        content,
        status: "open",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      current.session.activeStage = stage;
      current.session.updatedAt = timestamp;
      return current;
    });

    return await getSnapshot();
  }

  async function updateAnnotation(id, fields = {}) {
    const availability = resolveAvailability();
    if (!availability.available) {
      const snapshot = buildDisabledSnapshot(now, availability);
      snapshot.diagnostics.windowOpen = isWorkbenchWindowOpen();
      return snapshot;
    }
    const annotationId = ensureString(id);
    const timestamp = createNowISO(now);
    await persistState((current) => {
      const index = current.annotations.findIndex((entry) => entry.id === annotationId);
      if (index === -1) {
        return current;
      }
      if (fields.deleted === true) {
        current.annotations.splice(index, 1);
      } else {
        const currentAnnotation = current.annotations[index];
        current.annotations[index] = normalizeAnnotation({
          ...currentAnnotation,
          ...fields,
          id: currentAnnotation.id,
          updatedAt: timestamp,
        }, now);
      }
      current.session.updatedAt = timestamp;
      return current;
    });
    return await getSnapshot();
  }

  async function refreshStep(stage) {
    const availability = resolveAvailability();
    if (!availability.available) {
      const snapshot = buildDisabledSnapshot(now, availability);
      snapshot.diagnostics.windowOpen = isWorkbenchWindowOpen();
      return snapshot;
    }
    const targetStage = normalizeStage(stage);
    const collectedSteps = await collectSnapshots();
    await persistState((current) => {
      current.stepResults[targetStage] = normalizeStepResult(targetStage, {
        refreshedAt: createNowISO(now),
        sourceHash: collectedSteps[targetStage]?.sourceHash || null,
        data: collectedSteps[targetStage]?.data || {},
      }, now);
      current.session.activeStage = targetStage;
      current.session.updatedAt = createNowISO(now);
      current.session.sourceRunIds = buildSourceRunIds(collectedSteps);
      current.stale = buildStaleState(current, collectedSteps, now);
      current.meta.lastError = AGENT_REVIEW_WORKBENCH_STAGES
        .map((entry) => collectedSteps[entry.key]?.data?.error || null)
        .find(Boolean) || current.meta.lastError || null;
      return current;
    });
    const latestState = normalizeWorkbenchState(await ensureStoreReady(), { now });
    return buildPublicSnapshot(latestState, collectedSteps, {
      windowOpen: isWorkbenchWindowOpen(),
    });
  }

  async function generatePlan(payload = {}) {
    const availability = resolveAvailability();
    if (!availability.available) {
      return {
        ok: false,
        reason: availability.reason,
        plan: null,
        snapshot: buildDisabledSnapshot(now, availability),
      };
    }
    const { state } = await readStateWithSnapshots();
    const stage = normalizeStage(payload.stage, state.session.activeStage);
    const explicitAnnotationIds = normalizeStringArray(payload.annotationIds);
    const annotations = state.annotations.filter((entry) => {
      if (entry.status !== "open") {
        return false;
      }
      if (explicitAnnotationIds.length > 0) {
        return explicitAnnotationIds.includes(entry.id);
      }
      return entry.stage === stage;
    });

    if (annotations.length === 0) {
      return {
        ok: false,
        reason: "no-active-annotations",
        plan: null,
        snapshot: await getSnapshot(),
      };
    }

    const stageSnapshot = state.stepResults[stage]?.data || {};
    const actions = annotations.map((annotation) => buildPlanAction(annotation, stageSnapshot));
    const validationCommands = buildValidationCommands(actions);
    const patchPlanRef = actions.map((entry) => ensureString(entry.patchPlanRef, null)).find(Boolean) || null;
    const timestamp = createNowISO(now);
    const plan = normalizePlan({
      id: createId("plan"),
      annotationIds: annotations.map((entry) => entry.id),
      kind: "deterministic-review-plan",
      summary: buildPlanSummary(actions, annotations),
      patchPlanRef,
      validationCommands,
      status: "draft",
      createdAt: timestamp,
      actions,
    }, now);

    await persistState((current) => {
      current.plans.unshift(plan);
      current.session.activeStage = stage;
      current.session.updatedAt = timestamp;
      return current;
    });

    return {
      ok: true,
      reason: null,
      plan,
      snapshot: await getSnapshot(),
    };
  }

  function getWorkbenchShellHref() {
    const chromeHref = `chrome://${String(config?.addonRef || "cleanroomtemplate")}/${AGENT_REVIEW_WORKBENCH_SHELL_PATH}`;
    const resolvedHref = typeof host?.resolveContentUrl === "function"
      ? host.resolveContentUrl(AGENT_REVIEW_WORKBENCH_SHELL_PATH)
      : null;
    return String(resolvedHref || "").startsWith("file://")
      ? chromeHref
      : (resolvedHref || chromeHref);
  }

  function findLiveWorkbenchWindow() {
    if (typeof host?.listWindowsByType !== "function") {
      return null;
    }
    const targetHref = getWorkbenchShellHref();
    const candidates = host.listWindowsByType(null).filter((candidate) => {
      const href = String(candidate?.location?.href || candidate?.document?.documentURI || "");
      return Boolean(candidate)
        && !candidate.closed
        && (href === targetHref || href.includes(AGENT_REVIEW_WORKBENCH_SHELL_PATH));
    });
    return candidates.find(Boolean) || null;
  }

  function isWorkbenchWindowOpen() {
    return shell.isOpen() || Boolean(findLiveWorkbenchWindow());
  }

  function flushStoreBestEffort(reason) {
    if (store && typeof store.flush === "function") {
      void store.flush().catch((error) => {
        warn("reviewWorkbench.store.flush.failed", {
          reason,
          message: toErrorMessage(error),
        });
      });
    }
  }

  async function runLiveWindowCleanup(window, reason) {
    const cleanup = typeof window?.[AGENT_REVIEW_WORKBENCH_WINDOW_CLEANUP_KEY] === "function"
      ? window[AGENT_REVIEW_WORKBENCH_WINDOW_CLEANUP_KEY]
      : null;
    if (!cleanup) {
      flushStoreBestEffort(reason);
      return false;
    }
    try {
      await cleanup();
      return true;
    } catch (error) {
      warn("reviewWorkbench.liveWindow.cleanup.failed", {
        reason,
        href: window?.location?.href || "unknown",
        message: toErrorMessage(error),
      });
      flushStoreBestEffort(reason);
      return false;
    }
  }

  function closeWindowObject(window, reason) {
    if (!window || window.closed) {
      return false;
    }
    try {
      if (typeof window.close === "function") {
        window.close();
      }
      return true;
    } catch (error) {
      warn("reviewWorkbench.liveWindow.close.failed", {
        reason,
        href: window?.location?.href || "unknown",
        message: toErrorMessage(error),
      });
      return false;
    }
  }

  function closeLiveWorkbenchWindow(reason = "live-window-close") {
    const liveWindow = findLiveWorkbenchWindow();
    if (!liveWindow) {
      return false;
    }
    void runLiveWindowCleanup(liveWindow, reason);
    return closeWindowObject(liveWindow, reason);
  }

  async function closeLiveWorkbenchWindowAsync(reason = "live-window-close") {
    const liveWindow = findLiveWorkbenchWindow();
    if (!liveWindow) {
      return false;
    }
    await runLiveWindowCleanup(liveWindow, reason);
    return closeWindowObject(liveWindow, reason);
  }

  function getDiagnostics() {
    const availability = resolveAvailability();
    if (!availability.available) {
      return {
        enabled: false,
        sessionReady: false,
        annotationCount: 0,
        planCount: 0,
        lastError: availability.reason,
        staleStageCount: 0,
        activeStage: null,
        windowOpen: isWorkbenchWindowOpen(),
        acceptanceStatus: "unavailable",
        externalBlockers: [],
        lastLifecycleScenario: null,
      };
    }
    if (!store) {
      return {
        enabled: true,
        sessionReady: false,
        annotationCount: 0,
        planCount: 0,
        lastError: null,
        staleStageCount: 0,
        activeStage: null,
        windowOpen: isWorkbenchWindowOpen(),
        acceptanceStatus: "passed",
        externalBlockers: [],
        lastLifecycleScenario: null,
      };
    }
    const rawState = store.getState?.() || null;
    const state = rawState ? normalizeWorkbenchState(rawState, { now }) : null;
    const stale = state?.stale?.stages || [];
    return {
      enabled: true,
      sessionReady: Boolean(state?.session?.id),
      annotationCount: Array.isArray(state?.annotations) ? state.annotations.length : 0,
      planCount: Array.isArray(state?.plans) ? state.plans.length : 0,
      lastError: ensureString(state?.meta?.lastError, store.getStatus?.()?.lastError || null),
      staleStageCount: stale.length,
      activeStage: state ? normalizeStage(state?.session?.activeStage) : null,
      windowOpen: isWorkbenchWindowOpen(),
      acceptanceStatus: state?.meta?.lastError ? "failed" : "passed",
      externalBlockers: [],
      lastLifecycleScenario: null,
    };
  }

  const shell = createWindowShellManagerImpl({
    logger,
    openWindow() {
      const existingWindow = findLiveWorkbenchWindow();
      if (existingWindow) {
        return existingWindow;
      }
      const mainWindow = host?.getMainWindow?.() || null;
      if (!mainWindow) {
        throw new Error("Main Zotero window is unavailable");
      }
      const href = getWorkbenchShellHref();
      const windowName = `${String(config?.addonRef || "cleanroomtemplate")}-agent-review-workbench`;
      if (typeof mainWindow.openDialog === "function") {
        return mainWindow.openDialog(
          href,
          windowName,
          "chrome,dialog=no,centerscreen,resizable,status,width=1440,height=920",
        );
      }
      if (typeof mainWindow.open === "function") {
        return mainWindow.open(
          href,
          windowName,
          "resizable,width=1440,height=920",
        );
      }
      throw new Error("Main Zotero window cannot open standalone dialogs");
    },
    async mountWindow({ window, context }) {
      const cleanups = [];
      const snapshot = context?.snapshot || await getSnapshot();
      if (typeof themeManager?.mountWindow === "function") {
        cleanups.push(themeManager.mountWindow(window));
      }
      const root = window?.document?.documentElement || null;
      try {
        root?.setAttribute?.("data-addon-ref", String(config?.addonRef || "cleanroomtemplate"));
        root?.setAttribute?.("data-addon-name", String(config?.addonName || "Cleanroom Template"));
      } catch {}

      const bridge = window?.__CleanroomAgentReviewWorkbench__;
      if (!bridge || typeof bridge.mount !== "function") {
        throw new Error("Agent Review Workbench bridge is unavailable");
      }

      await Promise.resolve(bridge.mount({
        addonRef: String(config?.addonRef || "cleanroomtemplate"),
        addonName: String(config?.addonName || "Cleanroom Template"),
        api: windowBridge,
        snapshot,
      }));

      const rootNode = window?.document?.getElementById?.("review-workbench-root");
      const stepperNode = window?.document?.getElementById?.("review-workbench-stepper");
      const annotationNode = window?.document?.getElementById?.("review-workbench-annotations");
      if (!rootNode || !stepperNode || !annotationNode) {
        throw new Error("Agent Review Workbench shell did not mount required roots");
      }

      debug("reviewWorkbench.window.ready", {
        href: window?.location?.href || null,
      });

      let cleanupStarted = false;
      const cleanupWindow = async () => {
        if (cleanupStarted) {
          return;
        }
        cleanupStarted = true;
        try {
          if (typeof bridge.unmount === "function") {
            bridge.unmount();
          }
        } catch (error) {
          warn("reviewWorkbench.window.unmount.failed", {
            message: toErrorMessage(error),
          });
        }
        while (cleanups.length > 0) {
          const cleanup = cleanups.pop();
          try {
            cleanup();
          } catch {}
        }
        try {
          const activeStore = getStore();
          if (typeof activeStore.flush === "function") {
            await activeStore.flush();
          }
        } catch (error) {
          warn("reviewWorkbench.store.flush.failed", {
            message: toErrorMessage(error),
          });
        }
        try {
          if (window?.[AGENT_REVIEW_WORKBENCH_WINDOW_CLEANUP_KEY] === cleanupWindow) {
            delete window[AGENT_REVIEW_WORKBENCH_WINDOW_CLEANUP_KEY];
          }
        } catch {}
      };
      try {
        window[AGENT_REVIEW_WORKBENCH_WINDOW_CLEANUP_KEY] = cleanupWindow;
      } catch {}
      return cleanupWindow;
    },
    onWindowClosed() {
      if (store && typeof store.flush === "function") {
        void store.flush().catch((error) => {
          warn("reviewWorkbench.windowClose.flush.failed", {
            message: toErrorMessage(error),
          });
        });
      }
    },
  });

  async function open() {
    const availability = resolveAvailability();
    if (!availability.available) {
      return {
        ok: false,
        reason: availability.reason,
        reused: false,
        ready: false,
        disabled: true,
        snapshot: buildDisabledSnapshot(now, availability),
      };
    }
    const snapshot = await getSnapshot();
    try {
      if (shell.isOpen()) {
        return await shell.refresh({
          snapshot,
        });
      }
      const liveWindow = findLiveWorkbenchWindow();
      if (liveWindow) {
        const result = await shell.open({
          snapshot,
        });
        return {
          ...result,
          reused: true,
        };
      }
      return await shell.open({
        snapshot,
      });
    } catch (error) {
      if (!isWindowClosedBeforeReadyError(error)) {
        throw error;
      }
      return {
        ok: false,
        reason: "window-closed-before-ready",
        reused: false,
        ready: false,
        snapshot,
      };
    }
  }

  async function shutdown() {
    if (!shell.close()) {
      await closeLiveWorkbenchWindowAsync("shutdown-live-window");
    }
    if (store && typeof store.dispose === "function") {
      await store.dispose({}, {
        flush: true,
      });
    }
  }

  return {
    getSnapshot,
    createAnnotation,
    updateAnnotation,
    generatePlan,
    refreshStep,
    getDiagnostics,
    open,
    close() {
      return shell.close() || closeLiveWorkbenchWindow("api-close-live-window");
    },
    isAvailable() {
      return resolveAvailability().available;
    },
    async shutdown() {
      await shutdown();
    },
    isOpen() {
      return isWorkbenchWindowOpen();
    },
  };
}

export {
  createReviewWorkbenchStateStore,
  createEmptyWorkbenchState,
  normalizeWorkbenchState,
  buildPlanAction,
  buildValidationCommands,
  buildStaleState,
  buildDisabledSnapshot,
};
