import {
  buildDisabledReviewWorkbenchDiagnostics,
  buildDisabledReviewWorkbenchSnapshot,
  normalizeDisabledReviewWorkbenchAvailability,
} from "./review-workbench-disabled-contract.js";

const DISABLED_REASON = "dev-only-runtime-excluded-from-package";
const DISABLED_SUMMARY = "Dev-only runtime is excluded from packaged runtime.";

export const AGENT_SCENARIO_IDS = Object.freeze({});
export const CAPABILITY_IDS = Object.freeze({});
export const HOST_ACTION_IDS = Object.freeze({});
export const HOST_ACTION_OWNER_MODULES = Object.freeze({});
export const HOST_ACTION_READINESS_IDS = Object.freeze({});
export const HOST_ACTION_STATUSES = Object.freeze({
  READY: "ready",
  PROBE_ONLY: "probe-only",
  MANUAL_ONLY: "manual-only",
  UNSAFE: "unsafe",
});

function normalizeAvailability(availability = null) {
  return normalizeDisabledReviewWorkbenchAvailability(availability, {
    reason: DISABLED_REASON,
    summary: DISABLED_SUMMARY,
  });
}

function disabledDiagnostics(availability = null) {
  return buildDisabledReviewWorkbenchDiagnostics(availability, {
    reason: DISABLED_REASON,
    summary: DISABLED_SUMMARY,
  });
}

export function buildDisabledSnapshot(now = () => new Date(), availability = null) {
  return buildDisabledReviewWorkbenchSnapshot(now, availability, {
    reason: DISABLED_REASON,
    summary: DISABLED_SUMMARY,
  });
}

export function createAgentReviewWorkbench(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => new Date();

  function getAvailability() {
    return normalizeAvailability(
      typeof options.getAvailability === "function"
        ? options.getAvailability()
        : null,
    );
  }

  async function getSnapshot() {
    return buildDisabledSnapshot(now, getAvailability());
  }

  return {
    isAvailable() {
      return false;
    },
    getAvailability,
    getDiagnostics() {
      return disabledDiagnostics(getAvailability());
    },
    async open() {
      return await getSnapshot();
    },
    getSnapshot,
    async createAnnotation() {
      return await getSnapshot();
    },
    async updateAnnotation() {
      return await getSnapshot();
    },
    async refreshStep() {
      return await getSnapshot();
    },
    async generatePlan() {
      const availability = getAvailability();
      return {
        ok: false,
        reason: availability.reason,
        plan: null,
        snapshot: await getSnapshot(),
      };
    },
    async shutdown() {
      return {
        ok: true,
        reason: DISABLED_REASON,
      };
    },
  };
}

function disabledStageSnapshot(stage) {
  return {
    stage,
    status: "unavailable",
    availability: normalizeAvailability(),
    entries: [],
  };
}

export function createReviewWorkbenchRuntimeProvider() {
  return {
    isAvailable() {
      return false;
    },
    getAvailability() {
      return normalizeAvailability();
    },
    async getScopeSnapshot() {
      return disabledStageSnapshot("scope");
    },
    async getRouteSnapshot() {
      return disabledStageSnapshot("route");
    },
    async getHostActionStageSummary() {
      return disabledStageSnapshot("hostAction");
    },
    async getEvidenceSummary() {
      return disabledStageSnapshot("evidence");
    },
    async getPatchPlanSummary() {
      return disabledStageSnapshot("patchPlan");
    },
    async getGateSummary() {
      return disabledStageSnapshot("gate");
    },
  };
}

export function registerDevRuntimeFeatures() {
  return null;
}

export function createPluginAgent() {
  function disabledSelfCheck() {
    return {
      disabled: true,
      reason: DISABLED_REASON,
      enabled: false,
      hasMainWindow: false,
      commandCount: 0,
      menuCount: 0,
      hostActionCount: 0,
      capabilityCount: 0,
      services: [],
      commandIDs: [],
      menuIDs: [],
      paneIDs: [],
      hostActions: [],
      reviewWorkbench: disabledDiagnostics(),
    };
  }

  return {
    runAgentSelfCheck: disabledSelfCheck,
    inspectItemPresentation() {
      return null;
    },
    collectAgentDiagnostics: disabledSelfCheck,
    listAgentScenarios() {
      return [];
    },
    listCapabilities() {
      return [];
    },
    getCapability() {
      return null;
    },
    runAgentScenario() {
      return {
        ok: false,
        reason: DISABLED_REASON,
      };
    },
    listHostActions() {
      return [];
    },
    async runHostAction(actionId = "unknown") {
      return {
        ok: false,
        actionId: String(actionId || "unknown"),
        status: "unavailable",
        reason: DISABLED_REASON,
      };
    },
  };
}

export function createHostActionRunner() {
  return {
    listHostActions() {
      return [];
    },
    async runHostAction(actionId = "unknown") {
      return {
        ok: false,
        actionId: String(actionId || "unknown"),
        status: "unavailable",
        reason: DISABLED_REASON,
      };
    },
    getRecentExecutionSummaries() {
      return [];
    },
  };
}

export function createCapabilityManifest() {
  return [];
}

export function createProtectedCapabilityManifest() {
  return [];
}

export function getCapabilityManifestView() {
  return {
    manifestVariant: "disabled",
    protectedView: false,
    detailLevel: "disabled",
    limitedMode: true,
    overlayAvailable: false,
    overlayApplied: false,
    activationSatisfied: false,
    activationMissing: [DISABLED_REASON],
  };
}

export function getProtectedCapabilityManifestView() {
  return getCapabilityManifestView();
}

export function findCapabilityById() {
  return null;
}

export function findProtectedCapabilityById() {
  return null;
}

export function listCapabilityIds() {
  return [];
}

export function listAgentScenarioIds() {
  return [];
}

export function listHostActionIds() {
  return [];
}

export function listHostActionDescriptors() {
  return [];
}

export function getHostActionDescriptor() {
  return null;
}

export function isExecutableHostAction() {
  return false;
}

export function isReviewWorkbenchDevRuntime() {
  return false;
}

export function detectReviewWorkbenchProjectRoot() {
  return null;
}

export function summarizeHostActionExecutionEntry(entry = {}) {
  return {
    actionId: String(entry?.actionId || "").trim() || "unknown",
    status: String(entry?.status || "").trim() || "unavailable",
    ok: Boolean(entry?.ok),
  };
}

export function normalizeReviewWorkbenchScopeSnapshot() {
  return disabledStageSnapshot("scope");
}

export function normalizeReviewWorkbenchRouteSnapshot() {
  return disabledStageSnapshot("route");
}

export function normalizeReviewWorkbenchEvidenceSummary() {
  return disabledStageSnapshot("evidence");
}

export function normalizeReviewWorkbenchPatchPlanSummary() {
  return disabledStageSnapshot("patchPlan");
}

export function normalizeReviewWorkbenchGateSummary() {
  return disabledStageSnapshot("gate");
}

export function normalizeReviewWorkbenchHostActionStageSummary() {
  return disabledStageSnapshot("hostAction");
}
