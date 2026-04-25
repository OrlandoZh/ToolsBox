import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import {
  assertScript,
  readJSONFile,
} from "./script-runtime-lib.mjs";

export const DEFAULT_COMPUTER_USE_VALIDATION_CONFIG_RELATIVE_PATH = path.join(
  "config",
  "codex-computer-use-validation.json",
);

const ALLOWED_VERDICTS = new Set(["pass", "fail", "partial"]);
const ALLOWED_PROOF_KINDS = new Set([
  "manual-visible-check",
  "surface-local-visible-smoke",
  "local-install-visible-surface",
  "internal-trigger-window-lifecycle",
  "host-visible-entry-window-lifecycle",
]);
const ALLOWED_RUNTIME_INSTANCE_MATCHES = new Set([
  "matched",
  "mismatched",
  "unknown",
]);
const DEFAULT_TARGET = "current-visible-validation-follow-up";
const DEFAULT_PROOF_KIND = "manual-visible-check";
const PROOF_KIND_SUMMARIES = Object.freeze({
  "manual-visible-check": "Confirms only the manually scoped visible desktop check recorded in this session.",
  "surface-local-visible-smoke": "Confirms only that the target host-visible surface was visibly mounted on the local desktop/runtime used for this session.",
  "local-install-visible-surface": "Confirms only local install state plus at least one visible surface in the disposable install runtime. It does not prove remote updateURL or update_link verification.",
  "internal-trigger-window-lifecycle": "Confirms only standalone window lifecycle after a plugin-local or other internal trigger. It does not prove a human-visible host entry.",
  "host-visible-entry-window-lifecycle": "Confirms standalone window lifecycle after directly observing and using a real human-visible host entry.",
});
const PROOF_KIND_NON_CLAIMS = Object.freeze({
  "manual-visible-check": [
    "Does not prove anything beyond the manually scoped visible target recorded in this session.",
  ],
  "surface-local-visible-smoke": [
    "Does not prove unrelated host-visible surfaces or full-window layout correctness.",
    "Does not prove fresh-profile, first-run, or disposable-runtime state.",
  ],
  "local-install-visible-surface": [
    "Does not prove remote updateURL or update_link verification.",
    "Does not prove install behavior outside the observed local channel/runtime.",
  ],
  "internal-trigger-window-lifecycle": [
    "Does not prove a real human-visible Prompt, menu, or shortcut entry.",
    "Does not prove command palette or Prompt reachability from fallback registration alone.",
  ],
  "host-visible-entry-window-lifecycle": [
    "Does not prove unrelated host-visible surfaces, release/install state, or whole-window visual correctness.",
  ],
});

function fail(message) {
  throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return String(value || "").trim();
}

function ensureNonEmptyString(value, label) {
  const normalized = normalizeString(value);
  if (!normalized) {
    fail(`${label} must be a non-empty string.`);
  }
  return normalized;
}

function ensurePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function ensureArrayOfStrings(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array.`);
  }
  const normalized = value.map((entry) => normalizeString(entry)).filter(Boolean);
  if (!allowEmpty && normalized.length === 0) {
    fail(`${label} must contain at least one non-empty string.`);
  }
  if (normalized.length !== value.length) {
    fail(`${label} must contain only non-empty strings.`);
  }
  return normalized;
}

function normalizeWorkflowStep(step, index) {
  const prefix = `computer use validation workflow[${index}]`;
  const value = ensurePlainObject(step, prefix);
  return {
    id: ensureNonEmptyString(value.id, `${prefix}.id`),
    kind: ensureNonEmptyString(value.kind, `${prefix}.kind`),
    summary: ensureNonEmptyString(value.summary, `${prefix}.summary`),
  };
}

export function normalizeComputerUseValidationConfig(config) {
  const value = ensurePlainObject(config, "computer use validation config");
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion <= 0) {
    fail("computer use validation config.schemaVersion must be a positive integer.");
  }

  const activationPolicy = ensurePlainObject(
    value.activationPolicy,
    "computer use validation config.activationPolicy",
  );
  const entrypoint = ensurePlainObject(value.entrypoint, "computer use validation config.entrypoint");
  const artifacts = ensurePlainObject(value.artifacts, "computer use validation config.artifacts");
  const recording = ensurePlainObject(value.recording, "computer use validation config.recording");
  const allowedVerdicts = ensureArrayOfStrings(
    recording.allowedVerdicts,
    "computer use validation config.recording.allowedVerdicts",
  );

  allowedVerdicts.forEach((verdict) => {
    if (!ALLOWED_VERDICTS.has(verdict)) {
      fail(`computer use validation allowed verdict is unsupported: ${verdict}`);
    }
  });

  const normalized = {
    schemaVersion: value.schemaVersion,
    laneId: ensureNonEmptyString(value.laneId, "computer use validation config.laneId"),
    summary: ensureNonEmptyString(value.summary, "computer use validation config.summary"),
    enabledByDefault: value.enabledByDefault === true,
    gateEffect: ensureNonEmptyString(value.gateEffect, "computer use validation config.gateEffect"),
    activationPolicy: {
      requiresExplicitUserRequest: activationPolicy.requiresExplicitUserRequest === true,
      acceptedActivationSignals: ensureArrayOfStrings(
        activationPolicy.acceptedActivationSignals,
        "computer use validation config.activationPolicy.acceptedActivationSignals",
      ),
      forbiddenDefaultEntrypoints: ensureArrayOfStrings(
        activationPolicy.forbiddenDefaultEntrypoints,
        "computer use validation config.activationPolicy.forbiddenDefaultEntrypoints",
      ),
    },
    entrypoint: {
      scriptName: ensureNonEmptyString(entrypoint.scriptName, "computer use validation config.entrypoint.scriptName"),
      command: ensureNonEmptyString(entrypoint.command, "computer use validation config.entrypoint.command"),
      planCommand: ensureNonEmptyString(entrypoint.planCommand, "computer use validation config.entrypoint.planCommand"),
      recordCommand: ensureNonEmptyString(entrypoint.recordCommand, "computer use validation config.entrypoint.recordCommand"),
    },
    artifacts: {
      json: ensureNonEmptyString(artifacts.json, "computer use validation config.artifacts.json"),
      markdown: ensureNonEmptyString(artifacts.markdown, "computer use validation config.artifacts.markdown"),
    },
    workflow: ensurePlainObject({ workflow: value.workflow }, "computer use validation workflow holder")
      .workflow,
    recording: {
      allowedVerdicts,
      requiredFields: ensureArrayOfStrings(
        recording.requiredFields,
        "computer use validation config.recording.requiredFields",
      ),
    },
    nonGoals: ensureArrayOfStrings(value.nonGoals, "computer use validation config.nonGoals"),
    docs: ensureArrayOfStrings(value.docs || [], "computer use validation config.docs", {
      allowEmpty: true,
    }),
  };

  if (normalized.gateEffect !== "non-blocking") {
    fail("computer use validation config.gateEffect must stay non-blocking.");
  }
  if (normalized.enabledByDefault) {
    fail("computer use validation lane must not be enabled by default.");
  }
  if (!normalized.activationPolicy.requiresExplicitUserRequest) {
    fail("computer use validation lane must require an explicit user request.");
  }
  if (!Array.isArray(value.workflow) || value.workflow.length === 0) {
    fail("computer use validation config.workflow must contain at least one step.");
  }
  normalized.workflow = value.workflow.map((step, index) => normalizeWorkflowStep(step, index));

  return normalized;
}

export function resolveComputerUseValidationConfigPath(projectRoot, options = {}) {
  const customPath = normalizeString(options.configPath);
  return customPath
    ? path.resolve(customPath)
    : path.join(path.resolve(projectRoot), DEFAULT_COMPUTER_USE_VALIDATION_CONFIG_RELATIVE_PATH);
}

export function loadComputerUseValidationConfig(projectRoot, options = {}) {
  const configPath = resolveComputerUseValidationConfigPath(projectRoot, options);
  const config = normalizeComputerUseValidationConfig(JSON.parse(fs.readFileSync(configPath, "utf-8")));
  return {
    configPath,
    config,
  };
}

function toRelative(projectRoot, targetPath) {
  const relative = path.relative(path.resolve(projectRoot), targetPath).replaceAll("\\", "/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    return targetPath;
  }
  return relative;
}

function resolveArtifacts(projectRoot) {
  return {
    jsonPath: resolveAgentArtifactPath(projectRoot, "agent-computer-use-validation.json"),
    markdownPath: resolveAgentArtifactPath(projectRoot, "agent-computer-use-validation.md"),
  };
}

function resolveDefaultProjectArtifactPath(projectRoot, fileName) {
  return path.join(path.resolve(projectRoot), "dist", fileName);
}

function readJSONIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    return {
      readError: String(error?.message || error),
    };
  }
}

function summarizeUpstreamArtifacts(projectRoot) {
  const artifactNames = [
    {
      id: "agent-gate",
      file: "agent-gate.json",
      statusFields: ["gatePassed", "status"],
    },
    {
      id: "agent-monitor",
      file: "agent-monitor.json",
      statusFields: ["status", "frontpageSummary.status"],
    },
    {
      id: "agent-zotero-e2e",
      file: "agent-zotero-e2e.json",
      statusFields: ["status", "ok"],
    },
  ];

  return artifactNames.map((artifact) => {
    const customPath = resolveAgentArtifactPath(projectRoot, artifact.file);
    const defaultPath = resolveDefaultProjectArtifactPath(projectRoot, artifact.file);
    const candidatePaths = Array.from(new Set([customPath, defaultPath]));
    let parsed = null;
    let resolvedPath = candidatePaths[0];

    for (const candidatePath of candidatePaths) {
      const current = readJSONIfExists(candidatePath);
      if (!current) {
        continue;
      }
      parsed = current;
      resolvedPath = candidatePath;
      break;
    }

    if (!parsed) {
      return {
        id: artifact.id,
        path: toRelative(projectRoot, resolvedPath),
        present: false,
        status: "missing",
      };
    }
    if (parsed.readError) {
      return {
        id: artifact.id,
        path: toRelative(projectRoot, resolvedPath),
        present: true,
        status: "unreadable",
        error: parsed.readError,
      };
    }

    const status = artifact.statusFields
      .map((fieldPath) => {
        return fieldPath.split(".").reduce((selected, key) => {
          if (!selected || typeof selected !== "object") {
            return undefined;
          }
          return selected[key];
        }, parsed);
      })
      .find((value) => value != null);

    return {
      id: artifact.id,
      path: toRelative(projectRoot, resolvedPath),
      present: true,
      status: status == null ? "observed" : String(status),
      generatedAt: normalizeString(parsed.generatedAt || parsed.timestamp || parsed.createdAt) || null,
    };
  });
}

function sanitizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((entry) => normalizeString(entry)).filter(Boolean)
    : [];
}

function sanitizeProofNonClaimsByKind(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value).flatMap(([kind, current]) => {
    const normalizedKind = normalizeString(kind);
    if (!normalizedKind) {
      return [];
    }
    if (!ALLOWED_PROOF_KINDS.has(normalizedKind)) {
      fail(`computer use validation proofContract.nonClaimsByKind contains unsupported kind: ${normalizedKind}`);
    }
    return [[normalizedKind, sanitizeStringArray(current)]];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function sanitizeOptionalBoolean(value) {
  return value === true || value === false ? value : null;
}

function sanitizeTriggerRoute(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const policy = normalizeString(value.policy);
  const summary = normalizeString(value.summary);
  if (!policy && !summary) {
    return null;
  }
  return {
    policy: policy || null,
    summary: summary || null,
  };
}

function sanitizeLaunchRuntime(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const normalized = {
    mode: normalizeString(value.mode) || null,
    binaryPath: normalizeString(value.binaryPath) || null,
    profilePath: normalizeString(value.profilePath) || null,
    dataDir: normalizeString(value.dataDir) || null,
    isolation: normalizeString(value.isolation) || null,
    freshness: normalizeString(value.freshness) || null,
    summary: normalizeString(value.summary) || null,
    desktopInstanceMatchRequired: sanitizeOptionalBoolean(value.desktopInstanceMatchRequired),
    desktopInstanceMatchSummary: normalizeString(value.desktopInstanceMatchSummary) || null,
    desktopInstancePreflightStatus: normalizeString(value.desktopInstancePreflightStatus) || null,
    desktopInstancePreflightSummary: normalizeString(value.desktopInstancePreflightSummary) || null,
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function sanitizeProofContract(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const defaultKind = normalizeString(value.defaultKind) || null;
  const allowedKinds = sanitizeStringArray(value.allowedKinds);
  const summary = normalizeString(value.summary) || null;
  const nonClaims = sanitizeStringArray(value.nonClaims);
  const nonClaimsByKind = sanitizeProofNonClaimsByKind(value.nonClaimsByKind);

  if (defaultKind && !ALLOWED_PROOF_KINDS.has(defaultKind)) {
    fail(`computer use validation proofContract.defaultKind is unsupported: ${defaultKind}`);
  }
  allowedKinds.forEach((kind) => {
    if (!ALLOWED_PROOF_KINDS.has(kind)) {
      fail(`computer use validation proofContract.allowedKinds contains unsupported kind: ${kind}`);
    }
  });
  if (defaultKind && allowedKinds.length > 0 && !allowedKinds.includes(defaultKind)) {
    fail("computer use validation proofContract.defaultKind must be listed in proofContract.allowedKinds.");
  }
  Object.keys(nonClaimsByKind || {}).forEach((kind) => {
    if (allowedKinds.length > 0 && !allowedKinds.includes(kind)) {
      fail(`computer use validation proofContract.nonClaimsByKind kind must be listed in proofContract.allowedKinds: ${kind}`);
    }
  });

  if (!defaultKind && allowedKinds.length === 0 && !summary && nonClaims.length === 0 && !nonClaimsByKind) {
    return null;
  }
  return {
    defaultKind,
    allowedKinds,
    summary,
    nonClaims,
    nonClaimsByKind,
  };
}

function sanitizeTargetContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const normalized = {
    workflowId: normalizeString(value.workflowId) || null,
    workflowKind: normalizeString(value.workflowKind) || null,
    surfaceId: normalizeString(value.surfaceId) || null,
    channel: normalizeString(value.channel) || null,
    triggerReasons: sanitizeStringArray(value.triggerReasons),
    triggerRoute: sanitizeTriggerRoute(value.triggerRoute),
    launchCommand: normalizeString(value.launchCommand) || null,
    launchRuntime: sanitizeLaunchRuntime(value.launchRuntime),
    preflightCommands: sanitizeStringArray(value.preflightCommands),
    observationSteps: sanitizeStringArray(value.observationSteps),
    acceptanceCriteria: sanitizeStringArray(value.acceptanceCriteria),
    proofContract: sanitizeProofContract(value.proofContract),
  };
  return Object.entries(normalized).some(([, current]) => {
    return Array.isArray(current) ? current.length > 0 : Boolean(current);
  })
    ? normalized
    : null;
}

function resolveProofKindSummary(kind, contract = null) {
  return PROOF_KIND_SUMMARIES[kind] || contract?.summary || PROOF_KIND_SUMMARIES[DEFAULT_PROOF_KIND];
}

function resolveProofNonClaims(kind, contract = null) {
  return Array.from(new Set([
    ...(PROOF_KIND_NON_CLAIMS[kind] || []),
    ...((Array.isArray(contract?.nonClaims) ? contract.nonClaims : [])),
    ...((contract?.nonClaimsByKind && Array.isArray(contract.nonClaimsByKind[kind]))
      ? contract.nonClaimsByKind[kind]
      : []),
  ].map((entry) => normalizeString(entry)).filter(Boolean)));
}

function buildRecordedProof(report, options = {}) {
  const contract = sanitizeProofContract(report?.targetContext?.proofContract);
  const explicitKind = normalizeString(options.proofKind) || null;
  const kind = explicitKind || contract?.defaultKind || DEFAULT_PROOF_KIND;
  assertScript(ALLOWED_PROOF_KINDS.has(kind), `proof kind must be one of ${Array.from(ALLOWED_PROOF_KINDS).join(", ")}`, {
    category: "args",
    failedStage: "computer-use-validation:record",
    details: {
      proofKind: kind,
    },
  });
  if (Array.isArray(contract?.allowedKinds) && contract.allowedKinds.length > 0) {
    assertScript(
      contract.allowedKinds.includes(kind),
      `proof kind ${kind} is not allowed for this workflow target`,
      {
        category: "args",
        failedStage: "computer-use-validation:record",
        details: {
          proofKind: kind,
          allowedProofKinds: contract.allowedKinds,
          workflowId: report?.targetContext?.workflowId || null,
        },
      },
    );
  }

  const explicitHostVisibleEntryObserved = sanitizeOptionalBoolean(options.hostVisibleEntryObserved);
  const entryRouteObserved = normalizeString(options.entryRouteObserved) || null;
  const runtimeInstanceMatch = (() => {
    const normalized = normalizeString(options.runtimeInstanceMatch).toLowerCase();
    if (!normalized) {
      return report?.targetContext?.launchRuntime?.desktopInstanceMatchRequired === true
        ? "unknown"
        : null;
    }
    assertScript(
      ALLOWED_RUNTIME_INSTANCE_MATCHES.has(normalized),
      `runtime instance match must be one of ${Array.from(ALLOWED_RUNTIME_INSTANCE_MATCHES).join(", ")}`,
      {
        category: "args",
        failedStage: "computer-use-validation:record",
        details: {
          runtimeInstanceMatch: normalized,
        },
      },
    );
    return normalized;
  })();
  const runtimeInstanceEvidence = normalizeString(options.runtimeInstanceEvidence) || null;
  const hostVisibleEntryObserved = explicitHostVisibleEntryObserved != null
    ? explicitHostVisibleEntryObserved
    : kind === "host-visible-entry-window-lifecycle"
      ? true
      : kind === "internal-trigger-window-lifecycle"
        ? false
        : null;

  assertScript(
    !(kind === "internal-trigger-window-lifecycle" && hostVisibleEntryObserved === true),
    "internal-trigger-window-lifecycle cannot claim a host-visible entry was observed",
    {
      category: "args",
      failedStage: "computer-use-validation:record",
      details: {
        proofKind: kind,
        hostVisibleEntryObserved,
      },
    },
  );
  assertScript(
    !(kind === "host-visible-entry-window-lifecycle" && hostVisibleEntryObserved === false),
    "host-visible-entry-window-lifecycle requires a real host-visible entry observation",
    {
      category: "args",
      failedStage: "computer-use-validation:record",
      details: {
        proofKind: kind,
        hostVisibleEntryObserved,
      },
    },
  );
  assertScript(
    !(kind === "host-visible-entry-window-lifecycle" && !entryRouteObserved),
    "host-visible-entry-window-lifecycle requires --entry-route-observed so the human-visible route is explicitly recorded",
    {
      category: "args",
      failedStage: "computer-use-validation:record",
      details: {
        proofKind: kind,
      },
    },
  );
  assertScript(
    !(hostVisibleEntryObserved === true && !entryRouteObserved),
    "host-visible-entry observations must record --entry-route-observed",
    {
      category: "args",
      failedStage: "computer-use-validation:record",
      details: {
        proofKind: kind,
        hostVisibleEntryObserved,
      },
    },
  );
  assertScript(
    !(runtimeInstanceMatch === "matched" && !runtimeInstanceEvidence),
    "runtime instance matches must record --runtime-instance-evidence",
    {
      category: "args",
      failedStage: "computer-use-validation:record",
      details: {
        runtimeInstanceMatch,
      },
    },
  );
  assertScript(
    !(runtimeInstanceMatch === "mismatched" && !runtimeInstanceEvidence),
    "runtime instance mismatches must record --runtime-instance-evidence",
    {
      category: "args",
      failedStage: "computer-use-validation:record",
      details: {
        runtimeInstanceMatch,
      },
    },
  );

  return {
    kind,
    summary: resolveProofKindSummary(kind, contract),
    nonClaims: resolveProofNonClaims(kind, contract),
    hostVisibleEntryObserved,
    entryRouteObserved,
    runtimeInstanceMatch,
    runtimeInstanceEvidence,
  };
}

export function buildComputerUseControllerPrompt(plan) {
  const target = plan.activation.target;
  const lines = [
    "Codex Computer Use optional real-machine validation is active for this session only because the user explicitly requested it.",
    `Target: ${target}`,
    "Use Computer Use to inspect the real desktop/host UI. Prefer the smallest visible route that can confirm or falsify the target.",
    "Do not use this lane as a generic macro recorder, do not mutate source files, and do not replace agent:zotero:e2e or agent:gate.",
    "Record the observed evidence, verdict, risks, blockers, and next action into the lane artifact when the desktop check is finished.",
  ];
  if (plan.targetContext?.workflowId) {
    lines.push(`Workflow: ${plan.targetContext.workflowId}${plan.targetContext.workflowKind ? ` (${plan.targetContext.workflowKind})` : ""}`);
  }
  if (plan.targetContext?.triggerRoute?.summary) {
    lines.push(`Trigger route: ${plan.targetContext.triggerRoute.summary}`);
  }
  if (plan.targetContext?.launchRuntime?.summary) {
    lines.push(`Runtime: ${plan.targetContext.launchRuntime.summary}`);
  }
  if (plan.targetContext?.launchRuntime?.desktopInstanceMatchSummary) {
    lines.push(`Runtime binding: ${plan.targetContext.launchRuntime.desktopInstanceMatchSummary}`);
  }
  if (plan.targetContext?.launchRuntime?.desktopInstancePreflightSummary) {
    lines.push(`Runtime preflight: ${plan.targetContext.launchRuntime.desktopInstancePreflightSummary}`);
  }
  if (plan.targetContext?.proofContract?.summary) {
    lines.push(`Proof scope: ${plan.targetContext.proofContract.summary}`);
  }
  if (Array.isArray(plan.targetContext?.proofContract?.allowedKinds) && plan.targetContext.proofContract.allowedKinds.length > 0) {
    lines.push(`Allowed proof kinds: ${plan.targetContext.proofContract.allowedKinds.join(", ")}`);
  }
  if (plan.targetContext?.proofContract?.defaultKind) {
    const defaultNonClaims = resolveProofNonClaims(
      plan.targetContext.proofContract.defaultKind,
      plan.targetContext.proofContract,
    );
    if (defaultNonClaims.length > 0) {
      lines.push(`Default non-claims: ${defaultNonClaims.join(" | ")}`);
    }
  }
  if (Array.isArray(plan.targetContext?.observationSteps) && plan.targetContext.observationSteps.length > 0) {
    lines.push("Observation steps:");
    plan.targetContext.observationSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }
  return lines.join("\n");
}

export function buildComputerUseValidationPlan(projectRoot, options = {}) {
  const { configPath, config } = loadComputerUseValidationConfig(projectRoot, options);
  const target = normalizeString(options.target) || DEFAULT_TARGET;
  const artifacts = resolveArtifacts(projectRoot);
  const upstreamArtifacts = summarizeUpstreamArtifacts(projectRoot);
  const userRequested = options.userRequested === true;

  const plan = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    laneId: config.laneId,
    summary: config.summary,
    status: userRequested ? "ready-for-computer-use" : "activation-required",
    defaultEnabled: config.enabledByDefault,
    gateEffect: config.gateEffect,
    configPath: toRelative(projectRoot, configPath),
    activation: {
      userRequested,
      target,
      policy: clone(config.activationPolicy),
      command: config.entrypoint.command,
    },
    entrypoint: clone(config.entrypoint),
    workflow: clone(config.workflow),
    targetContext: sanitizeTargetContext(options.workflowContext),
    upstreamArtifacts,
    artifactPaths: {
      json: toRelative(projectRoot, artifacts.jsonPath),
      markdown: toRelative(projectRoot, artifacts.markdownPath),
    },
    controllerActions: [
      "Confirm the user requested this optional lane in the current conversation.",
      "Use Computer Use only for the declared target and smallest visible route.",
      "Keep source files read-only during desktop validation.",
      "Record pass/fail/partial with evidence and next action.",
    ],
    nonGoals: clone(config.nonGoals),
    result: null,
  };
  plan.controllerPrompt = buildComputerUseControllerPrompt(plan);
  return plan;
}

function assertActivationAllowed(plan) {
  assertScript(
    plan.activation.userRequested === true,
    "Codex Computer Use validation is default-disabled; rerun with --user-requested only after the user explicitly asks for this lane.",
    {
      category: "args",
      failedStage: "computer-use-validation:activation",
      details: {
        activationCommand: plan.activation.command,
      },
    },
  );
}

function renderMarkdown(report) {
  const verdict = report.result?.verdict || "-";
  const summary = report.result?.summary || report.summary;
  const upstreamLines = (report.upstreamArtifacts || []).map((artifact) => {
    const marker = artifact.present ? artifact.status : "missing";
    return `- ${artifact.id}: \`${marker}\` (${artifact.path})`;
  });
  const workflowLines = (report.workflow || []).map((step) => {
    return `- ${step.id} / ${step.kind}: ${step.summary}`;
  });
  const targetContext = report.targetContext || null;
  const targetContextLines = targetContext
    ? [
      targetContext.workflowId ? `- Workflow: \`${targetContext.workflowId}\`${targetContext.workflowKind ? ` / \`${targetContext.workflowKind}\`` : ""}` : null,
      targetContext.surfaceId ? `- Surface ID: \`${targetContext.surfaceId}\`` : null,
      targetContext.channel ? `- Channel: \`${targetContext.channel}\`` : null,
      targetContext.triggerReasons?.length ? `- Trigger reasons: ${(targetContext.triggerReasons || []).join("; ")}` : null,
      targetContext.triggerRoute?.policy ? `- Trigger route policy: \`${targetContext.triggerRoute.policy}\`` : null,
      targetContext.triggerRoute?.summary ? `- Trigger route summary: ${targetContext.triggerRoute.summary}` : null,
      targetContext.launchCommand ? `- Launch command: \`${targetContext.launchCommand}\`` : null,
      targetContext.launchRuntime?.summary ? `- Runtime: ${targetContext.launchRuntime.summary}` : null,
      targetContext.launchRuntime?.desktopInstanceMatchSummary ? `- Runtime binding: ${targetContext.launchRuntime.desktopInstanceMatchSummary}` : null,
      targetContext.launchRuntime?.desktopInstancePreflightSummary ? `- Runtime preflight: ${targetContext.launchRuntime.desktopInstancePreflightSummary}` : null,
      targetContext.observationSteps?.length ? `- Observation steps: ${(targetContext.observationSteps || []).join(" | ")}` : null,
      targetContext.acceptanceCriteria?.length ? `- Acceptance criteria: ${(targetContext.acceptanceCriteria || []).join(" | ")}` : null,
      targetContext.proofContract?.defaultKind ? `- Default proof kind: \`${targetContext.proofContract.defaultKind}\`` : null,
      targetContext.proofContract?.allowedKinds?.length ? `- Allowed proof kinds: ${(targetContext.proofContract.allowedKinds || []).map((kind) => `\`${kind}\``).join(", ")}` : null,
      targetContext.proofContract?.summary ? `- Proof scope: ${targetContext.proofContract.summary}` : null,
      targetContext.proofContract?.defaultKind && resolveProofNonClaims(targetContext.proofContract.defaultKind, targetContext.proofContract).length > 0
        ? `- Default non-claims: ${resolveProofNonClaims(targetContext.proofContract.defaultKind, targetContext.proofContract).join(" | ")}`
        : null,
    ].filter(Boolean)
    : [];

  return [
    "# Codex Computer Use Validation",
    "",
    `- Lane: \`${report.laneId}\``,
    `- Status: \`${report.status}\``,
    `- Default enabled: \`${report.defaultEnabled ? "true" : "false"}\``,
    `- Gate effect: \`${report.gateEffect}\``,
    `- Target: \`${report.activation?.target || "-"}\``,
    `- Verdict: \`${verdict}\``,
    `- Summary: ${summary}`,
    "",
    "## Activation",
    "",
    `- User requested: \`${report.activation?.userRequested ? "true" : "false"}\``,
    `- Manual command: \`${report.activation?.command || "-"}\``,
    "",
    "## Upstream Artifacts",
    "",
    upstreamLines.length > 0 ? upstreamLines.join("\n") : "- none",
    "",
    "## Workflow",
    "",
    workflowLines.length > 0 ? workflowLines.join("\n") : "- none",
    "",
    "## Target Context",
    "",
    targetContextLines.length > 0 ? targetContextLines.join("\n") : "- none",
    "",
    "## Controller Prompt",
    "",
    "```text",
    report.controllerPrompt || "",
    "```",
    "",
    "## Result",
    "",
    report.result
      ? [
        `- Verdict: \`${report.result.verdict}\``,
        `- Summary: ${report.result.summary}`,
        `- Proof kind: \`${report.result.proof?.kind || DEFAULT_PROOF_KIND}\``,
        `- Proof summary: ${report.result.proof?.summary || resolveProofKindSummary(report.result.proof?.kind || DEFAULT_PROOF_KIND)}`,
        `- Non-claims: ${(report.result.proof?.nonClaims || []).join(" | ") || "-"}`,
        `- Host-visible entry observed: \`${report.result.proof?.hostVisibleEntryObserved == null ? "-" : report.result.proof.hostVisibleEntryObserved ? "true" : "false"}\``,
        `- Observed entry route: ${report.result.proof?.entryRouteObserved || "-"}`,
        `- Runtime instance match: \`${report.result.proof?.runtimeInstanceMatch || "-"}\``,
        `- Runtime instance evidence: ${report.result.proof?.runtimeInstanceEvidence || "-"}`,
        `- Evidence: ${report.result.evidence || "-"}`,
        `- Risks: ${(report.result.risks || []).join("; ") || "-"}`,
        `- Blockers: ${(report.result.blockers || []).join("; ") || "-"}`,
        `- Next action: ${report.result.nextAction || "-"}`,
      ].join("\n")
      : "- Pending. After the Computer Use pass, record a result with `npm run agent:computer-use:record -- --verdict <pass|fail|partial> --summary \"...\"`.",
    "",
  ].join("\n");
}

async function writeReport(projectRoot, report) {
  const artifacts = resolveArtifacts(projectRoot);
  await fsp.mkdir(path.dirname(artifacts.jsonPath), { recursive: true });
  await fsp.writeFile(artifacts.jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  await fsp.writeFile(artifacts.markdownPath, `${renderMarkdown(report)}\n`, "utf-8");
  return {
    ...report,
    artifactPaths: {
      json: toRelative(projectRoot, artifacts.jsonPath),
      markdown: toRelative(projectRoot, artifacts.markdownPath),
    },
  };
}

export async function startComputerUseValidation(projectRoot, options = {}) {
  const plan = buildComputerUseValidationPlan(projectRoot, {
    ...options,
    userRequested: options.userRequested === true,
  });
  assertActivationAllowed(plan);
  const report = {
    ...plan,
    status: "pending-computer-use",
    startedAt: new Date().toISOString(),
  };
  return writeReport(projectRoot, report);
}

export async function recordComputerUseValidationResult(projectRoot, options = {}) {
  const verdict = normalizeString(options.verdict).toLowerCase();
  assertScript(ALLOWED_VERDICTS.has(verdict), "verdict must be one of pass, fail, partial", {
    category: "args",
    failedStage: "computer-use-validation:record",
    details: {
      verdict,
    },
  });
  const summary = normalizeString(options.summary);
  assertScript(Boolean(summary), "summary must be provided when recording a Computer Use validation result", {
    category: "args",
    failedStage: "computer-use-validation:record",
  });

  const artifacts = resolveArtifacts(projectRoot);
  let report = await readJSONFile(artifacts.jsonPath, {
    missingCategory: "environment",
    missingStage: "computer-use-validation:record",
    label: "agent-computer-use-validation.json",
  });
  report = report && typeof report === "object" && !Array.isArray(report)
    ? report
    : buildComputerUseValidationPlan(projectRoot, {
      target: options.target,
      userRequested: true,
    });

  const risks = Array.isArray(options.risks)
    ? options.risks.map((entry) => normalizeString(entry)).filter(Boolean)
    : [];
  const blockers = Array.isArray(options.blockers)
    ? options.blockers.map((entry) => normalizeString(entry)).filter(Boolean)
    : [];

  report.status = verdict === "pass" ? "completed-pass" : verdict === "fail" ? "completed-fail" : "completed-partial";
  report.completedAt = new Date().toISOString();
  const proof = buildRecordedProof(report, options);
  if (verdict === "pass" && report?.targetContext?.launchRuntime?.desktopInstanceMatchRequired === true) {
    assertScript(
      proof.runtimeInstanceMatch === "matched",
      "pass requires a matched desktop runtime instance for this workflow; otherwise record partial or fail",
      {
        category: "args",
        failedStage: "computer-use-validation:record",
        details: {
          workflowId: report?.targetContext?.workflowId || null,
          runtimeInstanceMatch: proof.runtimeInstanceMatch,
        },
      },
    );
  }
  report.result = {
    verdict,
    target: normalizeString(options.target) || report.activation?.target || DEFAULT_TARGET,
    summary,
    proof,
    evidence: normalizeString(options.evidence),
    risks,
    blockers,
    nextAction: normalizeString(options.nextAction),
  };
  return writeReport(projectRoot, report);
}

export function inspectComputerUseValidationContracts(projectRoot, options = {}) {
  const issues = [];
  const { config } = loadComputerUseValidationConfig(projectRoot, options);
  const packagePath = path.join(path.resolve(projectRoot), "package.json");
  const packageJSON = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
  const scripts = packageJSON.scripts && typeof packageJSON.scripts === "object"
    ? packageJSON.scripts
    : {};

  if (config.enabledByDefault !== false) {
    issues.push("computer use validation lane must remain disabled by default");
  }
  if (config.gateEffect !== "non-blocking") {
    issues.push("computer use validation lane must remain non-blocking");
  }
  if (!config.activationPolicy.requiresExplicitUserRequest) {
    issues.push("computer use validation lane must require explicit user request");
  }
  if (!String(scripts[config.entrypoint.scriptName] || "").includes("agent-computer-use-validation.mjs run")) {
    issues.push(`package script ${config.entrypoint.scriptName} must point to the Computer Use validation runner`);
  }

  config.activationPolicy.forbiddenDefaultEntrypoints.forEach((scriptName) => {
    const command = String(scripts[scriptName] || "");
    if (command.includes("agent-computer-use-validation") || command.includes("agent:computer-use")) {
      issues.push(`default entrypoint ${scriptName} must not invoke Computer Use validation`);
    }
  });

  const requiredFiles = [
    DEFAULT_COMPUTER_USE_VALIDATION_CONFIG_RELATIVE_PATH,
    "scripts/agent-computer-use-validation.mjs",
    "scripts/agent-computer-use-validation-lib.mjs",
    ...config.docs,
  ];
  requiredFiles.forEach((relativePath) => {
    if (!fs.existsSync(path.join(projectRoot, relativePath))) {
      issues.push(`missing Computer Use validation file: ${relativePath}`);
    }
  });

  return {
    ok: issues.length === 0,
    laneId: config.laneId,
    enabledByDefault: config.enabledByDefault,
    gateEffect: config.gateEffect,
    requiresExplicitUserRequest: config.activationPolicy.requiresExplicitUserRequest,
    issues,
  };
}
