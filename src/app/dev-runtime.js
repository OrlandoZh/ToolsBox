import {
  buildDisabledSnapshot,
  createAgentReviewWorkbench,
  registerAgentReviewWorkbenchCommand,
} from "../../dev/agent-review-workbench/agent-review-workbench.js";

import {
  createReviewWorkbenchRuntimeProvider,
  detectReviewWorkbenchProjectRoot,
  isReviewWorkbenchDevRuntime,
  normalizeReviewWorkbenchEvidenceSummary,
  normalizeReviewWorkbenchGateSummary,
  normalizeReviewWorkbenchHostActionStageSummary,
  normalizeReviewWorkbenchPatchPlanSummary,
  normalizeReviewWorkbenchRouteSnapshot,
  normalizeReviewWorkbenchScopeSnapshot,
  summarizeHostActionExecutionEntry,
} from "../../dev/agent-review-workbench/review-workbench-runtime-provider.js";

import { createPluginAgent } from "../../dev/agent-runtime/plugin-agent.js";
import { createHostActionRunner } from "../../dev/agent-runtime/host-actions.js";
import {
  createCapabilityManifest,
  findCapabilityById,
  getCapabilityManifestView,
  listCapabilityIds,
} from "../../dev/agent-runtime/capability-manifest.js";
import {
  createCapabilityManifest as createProtectedCapabilityManifest,
  findCapabilityById as findProtectedCapabilityById,
  getCapabilityManifestView as getProtectedCapabilityManifestView,
} from "../../dev/agent-runtime/capability-manifest-protected.js";
import { AGENT_SCENARIO_IDS, listAgentScenarioIds } from "../../dev/agent-runtime/agent-scenario-ids.js";
import { CAPABILITY_IDS } from "../../dev/agent-runtime/capability-ids.js";
import {
  getHostActionDescriptor,
  HOST_ACTION_STATUSES,
  isExecutableHostAction,
  listHostActionDescriptors,
} from "../../dev/agent-runtime/host-action-catalog.js";
import { HOST_ACTION_IDS, listHostActionIds } from "../../dev/agent-runtime/host-action-ids.js";
import { HOST_ACTION_OWNER_MODULES } from "../../dev/agent-runtime/host-action-owner-modules.js";
import { HOST_ACTION_READINESS_IDS } from "../../dev/agent-runtime/host-action-readiness-ids.js";

export {
  AGENT_SCENARIO_IDS,
  buildDisabledSnapshot,
  CAPABILITY_IDS,
  createAgentReviewWorkbench,
  createCapabilityManifest,
  createHostActionRunner,
  createPluginAgent,
  createProtectedCapabilityManifest,
  createReviewWorkbenchRuntimeProvider,
  detectReviewWorkbenchProjectRoot,
  findCapabilityById,
  findProtectedCapabilityById,
  getCapabilityManifestView,
  getHostActionDescriptor,
  getProtectedCapabilityManifestView,
  HOST_ACTION_IDS,
  HOST_ACTION_OWNER_MODULES,
  HOST_ACTION_READINESS_IDS,
  HOST_ACTION_STATUSES,
  isReviewWorkbenchDevRuntime,
  isExecutableHostAction,
  listAgentScenarioIds,
  listCapabilityIds,
  listHostActionDescriptors,
  listHostActionIds,
  normalizeReviewWorkbenchEvidenceSummary,
  normalizeReviewWorkbenchGateSummary,
  normalizeReviewWorkbenchHostActionStageSummary,
  normalizeReviewWorkbenchPatchPlanSummary,
  normalizeReviewWorkbenchRouteSnapshot,
  normalizeReviewWorkbenchScopeSnapshot,
  registerAgentReviewWorkbenchCommand,
  summarizeHostActionExecutionEntry,
};

export function registerDevRuntimeFeatures(options = {}) {
  return registerAgentReviewWorkbenchCommand(options);
}
