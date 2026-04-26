export const REVIEW_WORKBENCH_DISABLED_REASON = "review-workbench-unavailable";
export const REVIEW_WORKBENCH_DISABLED_SUMMARY = "Dev-only review runtime is unavailable in the current runtime.";

export const REVIEW_WORKBENCH_DISABLED_STAGES = Object.freeze([
  Object.freeze({ key: "scope", label: "Scope" }),
  Object.freeze({ key: "route", label: "Route" }),
  Object.freeze({ key: "hostAction", label: "Host Action" }),
  Object.freeze({ key: "evidence", label: "Evidence" }),
  Object.freeze({ key: "patchPlan", label: "Patch Plan" }),
  Object.freeze({ key: "gate", label: "Gate" }),
]);

function resolveNowISO(now = () => new Date()) {
  const value = typeof now === "function" ? now() : now;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export function normalizeDisabledReviewWorkbenchAvailability(availability = null, defaults = {}) {
  const candidate = availability && typeof availability === "object"
    ? availability
    : {};
  const reason = String(defaults.reason || REVIEW_WORKBENCH_DISABLED_REASON).trim()
    || REVIEW_WORKBENCH_DISABLED_REASON;
  const summary = String(defaults.summary || REVIEW_WORKBENCH_DISABLED_SUMMARY).trim()
    || REVIEW_WORKBENCH_DISABLED_SUMMARY;
  return {
    available: false,
    reason: String(candidate.reason || "").trim() || reason,
    summary: String(candidate.summary || "").trim() || summary,
  };
}

function buildDisabledStageState(stage, summary) {
  return {
    stage: stage.key,
    label: stage.label,
    refreshedAt: null,
    sourceHash: null,
    data: {
      available: false,
      status: "disabled",
      summary,
    },
  };
}

export function buildDisabledReviewWorkbenchDiagnostics(availability = null, defaults = {}) {
  const normalizedAvailability = normalizeDisabledReviewWorkbenchAvailability(availability, defaults);
  return {
    enabled: false,
    sessionReady: false,
    annotationCount: 0,
    planCount: 0,
    lastError: normalizedAvailability.reason,
    staleStageCount: 0,
    activeStage: null,
    windowOpen: false,
    acceptanceStatus: "unavailable",
    externalBlockers: [normalizedAvailability.reason],
    lastLifecycleScenario: null,
  };
}

export function buildDisabledReviewWorkbenchSnapshot(now = () => new Date(), availability = null, defaults = {}) {
  const generatedAt = resolveNowISO(now);
  const normalizedAvailability = normalizeDisabledReviewWorkbenchAvailability(availability, defaults);
  const byStage = {};
  const stepResults = {};
  REVIEW_WORKBENCH_DISABLED_STAGES.forEach((stage) => {
    byStage[stage.key] = false;
    stepResults[stage.key] = buildDisabledStageState(stage, normalizedAvailability.summary);
  });

  return {
    disabled: true,
    generatedAt,
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
    steps: REVIEW_WORKBENCH_DISABLED_STAGES.map((stage) => ({
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
      checkedAt: generatedAt,
    },
    capabilities: {
      canCreateAnnotation: false,
      canGeneratePlan: false,
    },
    diagnostics: buildDisabledReviewWorkbenchDiagnostics(normalizedAvailability, defaults),
  };
}
