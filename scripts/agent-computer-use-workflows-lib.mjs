import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import { startComputerUseValidation } from "./agent-computer-use-validation-lib.mjs";
import { createScriptError } from "./script-runtime-lib.mjs";
import {
  findManagedRuntimeProcesses,
  getRuntimeRoot,
  parseDotEnv,
  readRunnerConfig,
  resolveRuntimePaths,
} from "./zotero-runner-lib.mjs";

export const DEFAULT_COMPUTER_USE_SESSION_ROOT = path.join(
  path.sep === "\\" ? (process.env.TEMP || process.env.TMP || process.cwd()) : "/tmp",
  "codex-cu",
);
export const REVIEW_WORKBENCH_WORKFLOW_ID = "review-workbench-visible-smoke";
export const RELEASE_INSTALL_LOCAL_WORKFLOW_ID = "release-install-local";
export const SURFACE_LOCAL_WORKFLOW_ID_PREFIX = "surface-local:";
export const REVIEW_WORKBENCH_TARGET = "review workbench standalone window visible smoke";
export const REVIEW_WORKBENCH_SCENARIO = "agent review workbench window lifecycle";
export const DEFAULT_RELEASE_CHANNEL = "stable";

const ENV_FILES = [".env", ".env.local"];
const SURFACE_SCENARIO_FALLBACKS = Object.freeze({
  "cleanroom-preferences-pane": "preference pane surface smoke",
  "cleanroom-library-item-pane-sidenav": "library item pane surface smoke",
  "cleanroom-context-pane-sidenav": "context pane surface smoke",
  "cleanroom-reader-toolbar-surface": "reader surface smoke",
  "cleanroom-reader-sidebar-view": "reader surface smoke",
  "cleanroom-live-menu-item": "live menu surface smoke",
  "cleanroom-live-collection-menu": "collection menu surface smoke",
  "cleanroom-live-menu-submenu": "menu submenu surface smoke",
});

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizePath(value) {
  return String(value || "").trim().replaceAll("\\", "/");
}

function shellQuote(value) {
  return `'${String(value || "").replaceAll("'", `'\"'\"'`)}'`;
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((item) => normalizeString(item)).filter(Boolean)));
}

function parseProcessListLine(line) {
  const text = normalizeString(line);
  if (!text) {
    return null;
  }
  const match = text.match(/^(\d+)\s+(.+)$/u);
  if (!match) {
    return null;
  }
  return {
    pid: Number(match[1]),
    command: match[2],
  };
}

function looksLikeZoteroMainProcess(command) {
  const text = normalizeString(command);
  return text.includes(" -profile ") || text.includes(" --dataDir ");
}

function readPsOutput(psOutput = null) {
  if (psOutput != null) {
    return String(psOutput);
  }
  try {
    return execFileSync("ps", ["-axww", "-o", "pid=,command="], {
      encoding: "utf-8",
    });
  } catch {
    return "";
  }
}

function listSameBinaryZoteroProcesses(binaryPath, { currentPid = process.pid, psOutput = null } = {}) {
  const resolvedBinaryPath = normalizeString(binaryPath);
  if (!resolvedBinaryPath) {
    return [];
  }
  return readPsOutput(psOutput)
    .split(/\r?\n/u)
    .map((line) => parseProcessListLine(line))
    .filter((entry) => entry && Number.isInteger(entry.pid) && entry.pid !== Number(currentPid))
    .filter((entry) => normalizeString(entry.command).startsWith(resolvedBinaryPath))
    .filter((entry) => looksLikeZoteroMainProcess(entry.command))
    .map((entry) => ({
      pid: entry.pid,
      command: entry.command,
    }));
}

function summarizeRuntimeBindingPreflight(snapshot) {
  if (!snapshot) {
    return null;
  }
  if (snapshot.matchingRuntimeCount > 1) {
    return `Preflight sees ${snapshot.matchingRuntimeCount} processes matching the target runtime. Desktop binding is ambiguous until the visible window is tied to the intended profile/dataDir.`;
  }
  if (snapshot.matchingRuntimeCount === 1 && snapshot.otherSameBundleCount > 0) {
    return `Preflight sees the target runtime process plus ${snapshot.otherSameBundleCount} other same-bundle Zotero process(es). Computer Use may attach to the wrong window unless the visible instance is explicitly disambiguated.`;
  }
  if (snapshot.matchingRuntimeCount === 1 && snapshot.otherSameBundleCount === 0) {
    return "Preflight sees exactly one target runtime process and no other same-bundle Zotero process.";
  }
  if (snapshot.matchingRuntimeCount === 0 && snapshot.otherSameBundleCount > 0) {
    return `Preflight sees ${snapshot.otherSameBundleCount} other same-bundle Zotero process(es) already running. After launch, confirm the visible window belongs to the intended runtime before recording pass.`;
  }
  return "Preflight does not currently see a target runtime process. After launch, confirm the visible window belongs to the intended runtime before recording pass.";
}

function collectRuntimeBindingBlockers(launchRuntime) {
  if (launchRuntime?.desktopInstanceMatchRequired !== true) {
    return [];
  }
  const status = normalizeString(launchRuntime.desktopInstancePreflightStatus);
  switch (status) {
    case "multiple-target-runtime-processes":
      return [`desktop-runtime-binding-ambiguous:${status}`];
    case "target-plus-other-same-bundle-processes":
    case "other-same-bundle-processes-running":
      return [`desktop-runtime-binding-conflict:${status}`];
    default:
      return [];
  }
}

function inspectRuntimeBindingPreflight({
  projectRoot,
  binaryPath,
  profilePath,
  dataDir,
  currentPid = process.pid,
  psOutput = null,
}) {
  const matchingRuntimeProcesses = findManagedRuntimeProcesses({
    projectRoot,
    profilePath,
    dataDir,
    currentPid,
    psOutput,
  });
  const sameBinaryProcesses = listSameBinaryZoteroProcesses(binaryPath, {
    currentPid,
    psOutput,
  });
  const matchingPidSet = new Set(matchingRuntimeProcesses.map((entry) => entry.pid));
  const otherSameBundleProcesses = sameBinaryProcesses.filter((entry) => !matchingPidSet.has(entry.pid));
  const status = matchingRuntimeProcesses.length > 1
    ? "multiple-target-runtime-processes"
    : matchingRuntimeProcesses.length === 1 && otherSameBundleProcesses.length > 0
      ? "target-plus-other-same-bundle-processes"
      : matchingRuntimeProcesses.length === 1
        ? "single-target-runtime-process"
        : otherSameBundleProcesses.length > 0
          ? "other-same-bundle-processes-running"
          : "target-runtime-not-running";
  return {
    status,
    matchingRuntimeCount: matchingRuntimeProcesses.length,
    otherSameBundleCount: otherSameBundleProcesses.length,
    matchingRuntimePids: matchingRuntimeProcesses.map((entry) => entry.pid),
    otherSameBundlePids: otherSameBundleProcesses.map((entry) => entry.pid),
    summary: summarizeRuntimeBindingPreflight({
      status,
      matchingRuntimeCount: matchingRuntimeProcesses.length,
      otherSameBundleCount: otherSameBundleProcesses.length,
    }),
  };
}

function slugify(value) {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
  return (normalized || "computer-use-target").slice(0, 72);
}

export function formatComputerUseSessionTimestamp(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const pad = (number) => String(number).padStart(2, "0");
  return [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
  ].join("") + "-" + [
    pad(value.getHours()),
    pad(value.getMinutes()),
    pad(value.getSeconds()),
  ].join("");
}

export function buildComputerUseSessionArtifactsDir(target, options = {}) {
  const root = path.resolve(normalizeString(options.sessionRoot) || DEFAULT_COMPUTER_USE_SESSION_ROOT);
  const timestamp = formatComputerUseSessionTimestamp(options.now || new Date());
  return path.join(root, `${timestamp}-${slugify(target)}`);
}

function readJSONFileIfExists(filePath) {
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

function resolveArtifactCandidates(projectRoot, fileName) {
  const customPath = resolveAgentArtifactPath(projectRoot, fileName);
  const defaultPath = path.join(path.resolve(projectRoot), "dist", fileName);
  return Array.from(new Set([customPath, defaultPath]));
}

function readJSONArtifactWithFallback(projectRoot, fileName) {
  const candidates = resolveArtifactCandidates(projectRoot, fileName);
  for (const candidate of candidates) {
    const current = readJSONFileIfExists(candidate);
    if (!current) {
      continue;
    }
    return {
      path: candidate,
      data: current,
    };
  }
  return null;
}

function parseTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function loadMergedProjectEnv(projectRoot, env = process.env) {
  const merged = {};
  for (const fileName of ENV_FILES) {
    const filePath = path.join(projectRoot, fileName);
    try {
      Object.assign(merged, parseDotEnv(fs.readFileSync(filePath, "utf-8")));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return {
    ...merged,
    ...env,
  };
}

function buildReleaseChannelEnv(projectRoot, channel, env = process.env) {
  const merged = loadMergedProjectEnv(projectRoot, env);
  const nextEnv = {
    ...merged,
  };
  const stableBinary = normalizeString(merged.ZOTERO_PLUGIN_ZOTERO_STABLE_BIN_PATH);
  const betaBinary = normalizeString(merged.ZOTERO_PLUGIN_ZOTERO_BETA_BIN_PATH);
  if (channel === "stable" && stableBinary) {
    nextEnv.ZOTERO_PLUGIN_ZOTERO_BIN_PATH = stableBinary;
  } else if (channel === "beta" && betaBinary) {
    nextEnv.ZOTERO_PLUGIN_ZOTERO_BIN_PATH = betaBinary;
  }
  return nextEnv;
}

function isSubpath(rootPath, candidatePath) {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  if (root === candidate) {
    return true;
  }
  return candidate.startsWith(`${root}${path.sep}`);
}

function buildRecordCommand(artifactsDir) {
  return [
    `AGENT_ARTIFACTS_DIR=${shellQuote(artifactsDir)}`,
    "npm run agent:computer-use:record --",
    "--verdict <pass|fail|partial>",
    '--summary "<summary>"',
    '--evidence "<evidence>"',
    '--next-action "<next action>"',
  ].join(" ");
}

function buildRuntimeInstanceRecordArgs(workflow) {
  if (workflow?.launchRuntime?.desktopInstanceMatchRequired !== true) {
    return [];
  }
  return [
    "--runtime-instance-match matched",
    '--runtime-instance-evidence "<how the observed Zotero window was tied to the target runtime>"',
  ];
}

function buildEntryRoutePlaceholder(proofKind) {
  switch (normalizeString(proofKind)) {
    case "internal-trigger-window-lifecycle":
      return "<internal trigger route>";
    case "host-visible-entry-window-lifecycle":
      return "<Prompt|menu|shortcut>";
    case "surface-local-visible-smoke":
      return "<surface route>";
    case "local-install-visible-surface":
      return "<installed visible surface>";
    default:
      return "<observed route>";
  }
}

function buildProofRecordCommand(artifactsDir, proofKind, workflow = null) {
  const normalizedProofKind = normalizeString(proofKind);
  const parts = [
    `AGENT_ARTIFACTS_DIR=${shellQuote(artifactsDir)}`,
    "npm run agent:computer-use:record --",
    "--verdict <pass|fail|partial>",
    '--summary "<summary>"',
    normalizedProofKind ? `--proof-kind ${normalizedProofKind}` : null,
    `--entry-route-observed "${buildEntryRoutePlaceholder(normalizedProofKind)}"`,
    normalizedProofKind === "host-visible-entry-window-lifecycle" ? "--host-visible-entry-observed" : null,
    ...buildRuntimeInstanceRecordArgs(workflow),
    '--evidence "<evidence>"',
    '--next-action "<next action>"',
  ].filter(Boolean);
  return parts.join(" ");
}

function buildRecordCautions(workflow, defaultProofKind, allowedProofKinds) {
  const cautions = [];
  if (normalizeString(defaultProofKind) === "internal-trigger-window-lifecycle") {
    cautions.push("Do not upgrade to host-visible-entry-window-lifecycle unless a real Prompt, menu, or shortcut entry was directly observed and used.");
    cautions.push("Fallback command discovery or internal executeCommand() success does not count as a human-visible entry.");
  }
  if (normalizeString(defaultProofKind) === "surface-local-visible-smoke") {
    cautions.push("A surface-local pass proves only the named host-visible surface, not unrelated surfaces or full-window layout.");
  }
  if (normalizeString(defaultProofKind) === "local-install-visible-surface") {
    cautions.push("A local-install-visible-surface pass does not prove remote updateURL or update_link verification.");
  }
  if (workflow?.launchRuntime?.desktopInstanceMatchRequired === true) {
    cautions.push(workflow.launchRuntime.desktopInstanceMatchSummary
      || "Record pass only when the observed Zotero window is confirmed to match the workflow runtime. If another Zotero instance is frontmost or indistinguishable, record partial instead of pass.");
  }
  if (workflow?.launchRuntime?.desktopInstancePreflightSummary) {
    cautions.push(workflow.launchRuntime.desktopInstancePreflightSummary);
  }
  if (allowedProofKinds.includes("host-visible-entry-window-lifecycle")) {
    cautions.push("If you record host-visible-entry-window-lifecycle, you must also record the observed Prompt/menu/shortcut route.");
  }
  return uniqueStrings(cautions);
}

function collectWorkflowNonClaims(contract, proofKind) {
  return uniqueStrings([
    ...(Array.isArray(contract?.nonClaims) ? contract.nonClaims : []),
    ...((((contract?.nonClaimsByKind || {})[proofKind]) || [])),
  ]);
}

function buildWorkflowClaimBoundary(workflow) {
  const contract = workflow?.proofContract || null;
  const defaultProofKind = normalizeString(contract?.defaultKind) || "manual-visible-check";
  const allowedProofKinds = uniqueStrings(
    Array.isArray(contract?.allowedKinds) && contract.allowedKinds.length > 0
      ? contract.allowedKinds
      : [defaultProofKind],
  );
  return {
    defaultProofKind,
    allowedProofKinds,
    proofScope: normalizeString(contract?.summary) || null,
    defaultNonClaims: collectWorkflowNonClaims(contract, defaultProofKind),
  };
}

function buildRecordGuidance(workflow, artifactsDir) {
  const contract = workflow?.proofContract || null;
  const claimBoundary = buildWorkflowClaimBoundary(workflow);
  const { defaultProofKind, allowedProofKinds } = claimBoundary;
  return {
    defaultProofKind,
    allowedProofKinds,
    defaultCommand: buildProofRecordCommand(artifactsDir, defaultProofKind, workflow),
    defaultNonClaims: claimBoundary.defaultNonClaims,
    alternateCommands: allowedProofKinds
      .filter((proofKind) => proofKind !== defaultProofKind)
      .map((proofKind) => ({
        proofKind,
        command: buildProofRecordCommand(artifactsDir, proofKind, workflow),
        nonClaims: collectWorkflowNonClaims(contract, proofKind),
      })),
    cautions: buildRecordCautions(workflow, defaultProofKind, allowedProofKinds),
  };
}

function decorateWorkflowCatalogEntry(workflow) {
  return {
    ...workflow,
    claimBoundary: buildWorkflowClaimBoundary(workflow),
  };
}

function buildStartCommand(artifactsDir, target) {
  return [
    `AGENT_ARTIFACTS_DIR=${shellQuote(artifactsDir)}`,
    "npm run agent:computer-use:validate --",
    "--user-requested",
    `--target ${shellQuote(target)}`,
  ].join(" ");
}

function buildReviewWorkbenchWorkflow() {
  return {
    id: REVIEW_WORKBENCH_WORKFLOW_ID,
    kind: "mandatory",
    triggerStatus: "always",
    ready: true,
    target: REVIEW_WORKBENCH_TARGET,
    triggerReasons: ["mandatory-review-workbench-batch"],
    preflightCommands: [
      "npm run check",
      `npm run zotero:scenario -- --scenario ${shellQuote(REVIEW_WORKBENCH_SCENARIO)}`,
    ],
    launchCommand: "npm run zotero:dev",
    triggerRoute: {
      policy: "host-visible-when-available-otherwise-internal",
      summary: "Prefer a real host-visible Prompt/menu/shortcut entry for `agent.reviewWorkbench.open` when the current runtime exposes one. If the runtime only exposes a plugin-local fallback command, use the smallest internal trigger and let Computer Use prove only the visible standalone-window lifecycle.",
    },
    proofContract: {
      defaultKind: "internal-trigger-window-lifecycle",
      allowedKinds: [
        "internal-trigger-window-lifecycle",
        "host-visible-entry-window-lifecycle",
      ],
      summary: "Default to internal-trigger-window-lifecycle. Only upgrade to host-visible-entry-window-lifecycle when a real human-visible Prompt, menu, or shortcut entry was directly observed and used.",
      nonClaims: [
        "Does not prove whole-window visual correctness beyond the observed standalone window lifecycle.",
      ],
      nonClaimsByKind: {
        "internal-trigger-window-lifecycle": [
          "Does not prove a real human-visible Prompt, menu, or shortcut entry.",
          "Does not prove command palette or Prompt reachability from fallback registration alone.",
        ],
        "host-visible-entry-window-lifecycle": [
          "Does not prove unrelated host-visible surfaces or release/install state.",
        ],
      },
    },
    observationSteps: [
      "Open `agent.reviewWorkbench.open` through a real host-visible entry if the current runtime exposes one; otherwise use the smallest internal trigger and confirm the standalone window opens with its root content visible.",
      "Trigger `agent.reviewWorkbench.open` again through the same route and confirm the existing window is reused and focused instead of opening a duplicate.",
      "Close the workbench window and confirm it disappears from the desktop.",
    ],
    acceptanceCriteria: [
      "The standalone window is visible with the mounted workbench root.",
      "A second open reuses the same window and keeps the window count at one.",
      "Closing the window removes it from the desktop.",
      "Fallback command registration alone is not treated as proof of a human-visible host entry.",
    ],
  };
}

async function buildManagedRuntimeDescriptor(projectRoot, mode, env = process.env, options = {}) {
  const mergedEnv = loadMergedProjectEnv(projectRoot, env);
  const runnerConfig = await readRunnerConfig({
    projectRoot,
    mode,
    env: mergedEnv,
  });
  const runtimePaths = resolveRuntimePaths(projectRoot, mode, mergedEnv);
  const runtimeRoot = getRuntimeRoot(projectRoot);
  const managedProfile = isSubpath(runtimeRoot, runtimePaths.profilePath);
  const managedDataDir = isSubpath(runtimeRoot, runtimePaths.dataDir);
  const runtimeBindingPreflight = inspectRuntimeBindingPreflight({
    projectRoot,
    binaryPath: runnerConfig.binaryPath,
    profilePath: runtimePaths.profilePath,
    dataDir: runtimePaths.dataDir,
    currentPid: options.currentPid,
    psOutput: options.psOutput,
  });
  return {
    mode,
    binaryPath: runnerConfig.binaryPath,
    profilePath: runtimePaths.profilePath,
    dataDir: runtimePaths.dataDir,
    isolation: managedProfile && managedDataDir ? "project-isolated" : "externally-overridden",
    freshness: mode === "dev" ? "reused-project-runtime" : "managed-runtime",
    summary: mode === "dev"
      ? "Uses the project-scoped Zotero runtime profile and dataDir under the OS temp directory. This is isolated from a personal Zotero profile, but it is reused state by default rather than a disposable fresh profile."
      : "Uses a project-scoped Zotero runtime path.",
    desktopInstanceMatchRequired: true,
    desktopInstanceMatchSummary: "Record pass only when the observed Zotero window is confirmed to match this project runtime. If another Zotero instance is open and the observed window cannot be tied to this profile/dataDir, record partial instead of pass.",
    desktopInstancePreflightStatus: runtimeBindingPreflight.status,
    desktopInstancePreflightSummary: runtimeBindingPreflight.summary,
  };
}

function buildReleaseInstallRuntimeDescriptor(channel, runnerConfig, disposableProfile, projectRoot, options = {}) {
  if (!runnerConfig) {
    return null;
  }
  const runtimeBindingPreflight = inspectRuntimeBindingPreflight({
    projectRoot,
    binaryPath: runnerConfig.binaryPath,
    profilePath: runnerConfig.profilePath,
    dataDir: runnerConfig.dataDir,
    currentPid: options.currentPid,
    psOutput: options.psOutput,
  });
  return {
    mode: `release-install-${channel}`,
    binaryPath: runnerConfig.binaryPath,
    profilePath: runnerConfig.profilePath,
    dataDir: runnerConfig.dataDir,
    isolation: disposableProfile ? "project-isolated-disposable" : "externally-overridden",
    freshness: disposableProfile ? "disposable-install-runtime" : "managed-runtime",
    summary: disposableProfile
      ? "Uses a disposable project-managed release-install profile and dataDir for local install confirmation."
      : "Uses a local release-install runtime, but the profile/dataDir are not project-managed disposable paths.",
    desktopInstanceMatchRequired: true,
    desktopInstanceMatchSummary: "Record pass only when the observed Zotero window is confirmed to match the launched release-install runtime. If another Zotero instance is frontmost or Codex Computer Use binds to the wrong same-bundle app instance, record partial instead of pass.",
    desktopInstancePreflightStatus: runtimeBindingPreflight.status,
    desktopInstancePreflightSummary: runtimeBindingPreflight.summary,
  };
}

function findScenarioNameBySourceFile(scenarioLastRun, sourceFile, surfaceId) {
  const normalizedSource = normalizePath(sourceFile);
  const registered = Array.isArray(scenarioLastRun?.registeredScenarios)
    ? scenarioLastRun.registeredScenarios
    : [];
  const selected = Array.isArray(scenarioLastRun?.selectedScenarios)
    ? scenarioLastRun.selectedScenarios
    : [];
  const catalog = [...selected, ...registered];
  const matched = catalog.find((entry) => normalizePath(entry?.sourceFile) === normalizedSource);
  return normalizeString(matched?.name) || SURFACE_SCENARIO_FALLBACKS[surfaceId] || null;
}

function buildSurfaceObservation(surface) {
  switch (surface.id) {
    case "cleanroom-preferences-pane":
      return {
        steps: [
          "Open the target preference pane and confirm the selected pane root is visible.",
          "Confirm the pane content root is mounted and not blank.",
        ],
        acceptance: [
          "The preference pane opens on the requested pane.",
          "The pane root is visible and ready on the desktop.",
        ],
      };
    case "cleanroom-live-menu-item":
    case "cleanroom-live-collection-menu":
    case "cleanroom-live-menu-submenu":
      return {
        steps: [
          "Open the live host menu for the target surface.",
          "Confirm the expected menu item or submenu child is visible.",
        ],
        acceptance: [
          "The target menu or submenu is visible in the live host popup.",
          "The expected menu item is present and readable.",
        ],
      };
    case "cleanroom-reader-toolbar-surface":
    case "cleanroom-reader-sidebar-view":
      return {
        steps: [
          "Open the live reader surface for the target route.",
          "Confirm the expected toolbar button or sidebar panel is visible.",
        ],
        acceptance: [
          "The target reader surface is visibly mounted.",
          "The expected reader control or panel is readable on screen.",
        ],
      };
    default:
      return {
        steps: [
          "Open the target host-visible surface with the smallest visible route.",
          "Confirm the expected pane or root element is visible.",
        ],
        acceptance: [
          "The target host-visible surface is mounted and visible.",
        ],
      };
  }
}

function matchOwnerPath(changedPath, ownerPath) {
  const changed = normalizePath(changedPath);
  const owner = normalizePath(ownerPath);
  if (!changed || !owner) {
    return false;
  }
  return changed === owner || changed.startsWith(`${owner}/`);
}

export function parseGitStatusChangedPaths(output) {
  return uniqueStrings(String(output || "").split(/\r?\n/u).map((line) => {
    const rawLine = String(line || "");
    if (!rawLine.trim()) {
      return null;
    }
    const candidate = rawLine.slice(3).trim();
    if (!candidate) {
      return null;
    }
    const renamed = candidate.includes(" -> ")
      ? candidate.slice(candidate.lastIndexOf(" -> ") + 4)
      : candidate;
    return normalizePath(renamed.replace(/^"+|"+$/g, ""));
  }));
}

function readGitChangedPaths(projectRoot) {
  try {
    const output = execFileSync("git", ["status", "--short"], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString("utf-8");
    return parseGitStatusChangedPaths(output);
  } catch {
    return [];
  }
}

async function buildSurfaceWorkflow(projectRoot, surface, scenarioName, triggerReasons, options = {}) {
  const observation = buildSurfaceObservation(surface);
  const launchRuntime = await buildManagedRuntimeDescriptor(projectRoot, "dev", options.env || process.env, options);
  const blockers = collectRuntimeBindingBlockers(launchRuntime);
  return {
    id: `${SURFACE_LOCAL_WORKFLOW_ID_PREFIX}${surface.id}`,
    kind: "conditional-surface",
    triggerStatus: blockers.length > 0 ? "blocked" : "triggered",
    ready: blockers.length === 0,
    surfaceId: surface.id,
    target: `surface-local visible smoke: ${surface.id}`,
    triggerReasons: uniqueStrings(triggerReasons),
    blockers,
    preflightCommands: scenarioName
      ? [`npm run zotero:scenario -- --scenario ${shellQuote(scenarioName)}`]
      : [],
    launchCommand: "npm run zotero:dev",
    launchRuntime,
    proofContract: {
      defaultKind: "surface-local-visible-smoke",
      allowedKinds: ["surface-local-visible-smoke"],
      summary: "Confirms only that the target host-visible surface became visible in the current local desktop/runtime.",
      nonClaims: [
        "Does not prove unrelated host-visible surfaces or full-window layout correctness.",
        "Does not prove fresh-profile, first-run, or disposable-runtime state.",
      ],
    },
    observationSteps: observation.steps,
    acceptanceCriteria: observation.acceptance,
  };
}

async function buildReleaseInstallWorkflow(projectRoot, options = {}) {
  const channel = normalizeString(options.channel || DEFAULT_RELEASE_CHANNEL) || DEFAULT_RELEASE_CHANNEL;
  const triggerReasons = [];
  const blockers = [];
  const explicitReleaseSelection = options.explicitReleaseSelection === true;
  if (!["stable", "beta"].includes(channel)) {
    throw createScriptError("args", `Unsupported release install channel: ${channel}`, {
      failedStage: "computer-use-workflows:release-channel",
      details: {
        channel,
      },
    });
  }

  if (explicitReleaseSelection) {
    triggerReasons.push("manual-release-install-selection");
  }
  if (options.releaseHandoff === true) {
    triggerReasons.push("release-install-handoff");
  }
  if (options.humanConfirmation === true) {
    triggerReasons.push("human-install-confirmation-requested");
  }

  const smokeReport = readJSONArtifactWithFallback(projectRoot, `release-install-smoke-${channel}.json`)
    || (() => {
      const aggregate = readJSONArtifactWithFallback(projectRoot, "release-install-smoke.json");
      if (!aggregate?.data || !Array.isArray(aggregate.data.runs)) {
        return null;
      }
      const matched = aggregate.data.runs.find((entry) => normalizeString(entry?.channel) === channel) || null;
      return matched
        ? {
          path: aggregate.path,
          data: matched,
        }
        : null;
    })();

  if (!smokeReport) {
    triggerReasons.push(`release-install-smoke-${channel}:missing`);
  } else if (smokeReport.data?.passed !== true || normalizeString(smokeReport.data?.status) !== "passed") {
    triggerReasons.push(`release-install-smoke-${channel}:failed`);
  }

  const releaseComparators = [
    readJSONArtifactWithFallback(projectRoot, "release-preflight.json"),
    readJSONArtifactWithFallback(projectRoot, "release-matrix.json"),
  ].filter(Boolean);
  const newestComparator = releaseComparators
    .map((entry) => ({
      id: path.basename(entry.path),
      ts: parseTimestamp(entry.data?.generatedAt),
    }))
    .filter((entry) => entry.ts != null)
    .sort((left, right) => right.ts - left.ts)[0] || null;
  const smokeTimestamp = parseTimestamp(smokeReport?.data?.generatedAt);
  if (
    smokeReport
    && smokeReport.data?.passed === true
    && smokeTimestamp != null
    && newestComparator
    && smokeTimestamp < newestComparator.ts
  ) {
    triggerReasons.push(`release-install-smoke-${channel}:stale-vs-${newestComparator.id}`);
  }

  let runnerConfig = null;
  try {
    const channelEnv = buildReleaseChannelEnv(projectRoot, channel, options.env || process.env);
    runnerConfig = await readRunnerConfig({
      projectRoot,
      mode: `release-install-${channel}`,
      env: channelEnv,
    });
  } catch (error) {
    blockers.push(`runner-config-unavailable:${normalizeString(error?.message || error) || "unknown"}`);
  }

  const runtimeRoot = getRuntimeRoot(projectRoot);
  const disposableProfile = Boolean(
    runnerConfig
    && isSubpath(runtimeRoot, runnerConfig.profilePath)
    && isSubpath(runtimeRoot, runnerConfig.dataDir)
  );
  if (!runnerConfig) {
    blockers.push("runner-config-missing");
  } else if (!disposableProfile) {
    blockers.push("disposable-profile-unavailable");
  }

  const launchRuntime = buildReleaseInstallRuntimeDescriptor(
    channel,
    runnerConfig,
    disposableProfile,
    projectRoot,
    options,
  );
  blockers.push(...collectRuntimeBindingBlockers(launchRuntime));
  const triggered = triggerReasons.length > 0;
  return {
    id: `${RELEASE_INSTALL_LOCAL_WORKFLOW_ID}:${channel}`,
    workflowId: RELEASE_INSTALL_LOCAL_WORKFLOW_ID,
    kind: "conditional-release-install",
    channel,
    triggerStatus: triggered ? (blockers.length > 0 ? "blocked" : "triggered") : "skipped",
    ready: triggered && blockers.length === 0,
    target: `local install visible smoke: ${channel}`,
    triggerReasons,
    blockers,
    runnerConfig: runnerConfig
      ? {
        binaryPath: runnerConfig.binaryPath,
        profilePath: runnerConfig.profilePath,
        dataDir: runnerConfig.dataDir,
      }
      : null,
    preflightCommands: [`npm run release:install-smoke:${channel}`],
    launchCommand: `npm run release:install-smoke:${channel} -- --keep-open`,
    launchRuntime,
    proofContract: {
      defaultKind: "local-install-visible-surface",
      allowedKinds: ["local-install-visible-surface"],
      summary: "Confirms only local install state plus at least one visible surface in the disposable install runtime. It does not prove remote updateURL or update_link verification.",
      nonClaims: [
        "Does not prove remote updateURL or update_link verification.",
        "Does not prove install behavior outside the observed local channel/runtime.",
      ],
    },
    observationSteps: [
      'Use "Install Add-on From File..." to install the fresh packaged XPI into the disposable profile.',
      "Open Add-on Manager and confirm the add-on entry, version, and enabled state.",
      "Confirm one non-destructive visible surface is available after install. Prefer the preference pane, then a live menu item.",
    ],
    acceptanceCriteria: [
      "The add-on entry appears with the expected version.",
      "The add-on is enabled in Add-on Manager.",
      "At least one non-destructive visible surface is confirmed after install.",
      "The result is treated as local install confirmation only and not as remote updateURL verification.",
    ],
  };
}

function collectSurfaceTriggerReasons({
  surface,
  changedPaths,
  scenarioLastRun,
  scenarioName,
  explicitSurfaceIds,
  e2eReport,
}) {
  const reasons = [];
  const ownerHits = changedPaths.filter((changedPath) => {
    return (surface.ownerPaths || []).some((ownerPath) => matchOwnerPath(changedPath, ownerPath));
  });
  ownerHits.forEach((matchedPath) => {
    reasons.push(`owner-path-hit:${matchedPath}`);
  });

  if ((explicitSurfaceIds || []).includes(surface.id)) {
    reasons.push(`manual-surface-selection:${surface.id}`);
  }

  const scenarioFile = normalizePath((surface.ownerPaths || []).find((entry) => entry.startsWith("zotero-scenarios/")));
  const selectedScenarios = Array.isArray(scenarioLastRun?.selectedScenarios)
    ? scenarioLastRun.selectedScenarios
    : [];
  const results = Array.isArray(scenarioLastRun?.results) ? scenarioLastRun.results : [];
  const selectedScenario = selectedScenarios.find((entry) => normalizePath(entry?.sourceFile) === scenarioFile) || null;
  const matchedResult = results.find((entry) => normalizeString(entry?.name) === normalizeString(scenarioName)) || null;
  if (
    selectedScenario
    && matchedResult
    && normalizeString(matchedResult.status) !== "passed"
  ) {
    reasons.push(`fresh-scenario:${normalizeString(matchedResult.status)}`);
  }
  if (scenarioLastRun?.incomplete === true && selectedScenario) {
    reasons.push("fresh-scenario:incomplete");
  }
  if (
    e2eReport
    && normalizeString(e2eReport.status) !== "passed"
    && ownerHits.length > 0
  ) {
    reasons.push(`fresh-e2e:${normalizeString(e2eReport.status) || "attention"}`);
  }
  return uniqueStrings(reasons);
}

function loadValidationSurfaces(projectRoot) {
  const configPath = path.join(projectRoot, "config", "project-validation-surfaces.json");
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

async function buildSurfaceWorkflows(projectRoot, options = {}) {
  const changedPaths = uniqueStrings(
    Array.isArray(options.changedPaths) && options.changedPaths.length > 0
      ? options.changedPaths.map((entry) => normalizePath(entry))
      : readGitChangedPaths(projectRoot),
  );
  const explicitSurfaceIds = uniqueStrings(options.surfaceIds || []);
  const surfacesConfig = loadValidationSurfaces(projectRoot);
  const configuredSurfaces = Array.isArray(surfacesConfig?.surfaces) ? surfacesConfig.surfaces : [];
  const surfaces = explicitSurfaceIds.length > 0
    ? configuredSurfaces.filter((surface) => explicitSurfaceIds.includes(normalizeString(surface?.id)))
    : configuredSurfaces;
  const scenarioLastRun = readJSONArtifactWithFallback(projectRoot, "zotero-scenario-last-run.json")?.data || null;
  const e2eReport = readJSONArtifactWithFallback(projectRoot, "agent-zotero-e2e.json")?.data || null;
  const workflows = [];

  for (const surface of surfaces) {
    const scenarioFile = (surface.ownerPaths || []).find((entry) => entry.startsWith("zotero-scenarios/")) || null;
    const scenarioName = findScenarioNameBySourceFile(scenarioLastRun, scenarioFile, surface.id);
    const triggerReasons = collectSurfaceTriggerReasons({
      surface,
      changedPaths,
      scenarioLastRun,
      scenarioName,
      explicitSurfaceIds,
      e2eReport,
    });
    if (triggerReasons.length === 0) {
      continue;
    }
    workflows.push(await buildSurfaceWorkflow(projectRoot, surface, scenarioName, triggerReasons, options));
  }

  return {
    changedPaths,
    workflows,
  };
}

export async function listComputerUseWorkflowCatalog(projectRoot, options = {}) {
  const mandatoryLaunchRuntime = await buildManagedRuntimeDescriptor(projectRoot, "dev", options.env || process.env, options);
  const mandatoryBlockers = collectRuntimeBindingBlockers(mandatoryLaunchRuntime);
  const mandatory = decorateWorkflowCatalogEntry({
    ...buildReviewWorkbenchWorkflow(),
    triggerStatus: mandatoryBlockers.length > 0 ? "blocked" : "always",
    ready: mandatoryBlockers.length === 0,
    blockers: mandatoryBlockers,
    launchRuntime: mandatoryLaunchRuntime,
  });
  const releaseInstall = decorateWorkflowCatalogEntry(await buildReleaseInstallWorkflow(projectRoot, options));
  const surfaceState = await buildSurfaceWorkflows(projectRoot, options);
  return {
    generatedAt: new Date().toISOString(),
    sessionRoot: path.resolve(normalizeString(options.sessionRoot) || DEFAULT_COMPUTER_USE_SESSION_ROOT),
    mandatory: [mandatory],
    conditional: {
      releaseInstall,
      surfaces: surfaceState.workflows.map((workflow) => decorateWorkflowCatalogEntry(workflow)),
    },
    changedPaths: surfaceState.changedPaths,
  };
}

function selectPreparedWorkflows(catalog, options = {}) {
  const mandatory = Array.isArray(catalog.mandatory) ? catalog.mandatory : [];
  const releaseInstall = catalog.conditional?.releaseInstall || null;
  const surfaces = Array.isArray(catalog.conditional?.surfaces) ? catalog.conditional.surfaces : [];
  const workflowId = normalizeString(options.workflowId);
  const allTriggered = options.allTriggered === true;

  if (allTriggered) {
    return [
      ...mandatory,
      ...(releaseInstall?.ready ? [releaseInstall] : []),
      ...surfaces.filter((entry) => entry.ready),
    ];
  }

  if (!workflowId) {
    return mandatory.slice(0, 1);
  }

  if (workflowId === REVIEW_WORKBENCH_WORKFLOW_ID) {
    return mandatory.slice(0, 1);
  }

  if (
    workflowId === RELEASE_INSTALL_LOCAL_WORKFLOW_ID
    || workflowId === `${RELEASE_INSTALL_LOCAL_WORKFLOW_ID}:${normalizeString(options.channel || DEFAULT_RELEASE_CHANNEL)}`
  ) {
    return releaseInstall ? [releaseInstall] : [];
  }

  if (workflowId === "surface-local") {
    return surfaces.filter((entry) => entry.ready);
  }

  if (workflowId.startsWith(SURFACE_LOCAL_WORKFLOW_ID_PREFIX)) {
    return surfaces.filter((entry) => entry.id === workflowId);
  }

  return [];
}

function buildPreparedWorkflow(workflow, artifactsDir) {
  const startCommand = buildStartCommand(artifactsDir, workflow.target);
  const recordGuidance = buildRecordGuidance(workflow, artifactsDir);
  return {
    ...workflow,
    claimBoundary: workflow.claimBoundary || buildWorkflowClaimBoundary(workflow),
    artifactsDir,
    startCommand,
    recordCommand: recordGuidance.defaultCommand || buildRecordCommand(artifactsDir),
    recordGuidance,
    retryPolicy: {
      maxFormalSessions: 1,
      allowSingleRetryOnUnstableDesktop: true,
    },
  };
}

function buildWorkflowValidationContext(workflow) {
  return {
    workflowId: workflow.id,
    workflowKind: workflow.kind,
    surfaceId: workflow.surfaceId || null,
    channel: workflow.channel || null,
    triggerReasons: workflow.triggerReasons || [],
    triggerRoute: workflow.triggerRoute || null,
    launchCommand: workflow.launchCommand || null,
    launchRuntime: workflow.launchRuntime || null,
    preflightCommands: workflow.preflightCommands || [],
    observationSteps: workflow.observationSteps || [],
    acceptanceCriteria: workflow.acceptanceCriteria || [],
    proofContract: workflow.proofContract || null,
  };
}

export async function prepareComputerUseWorkflowSessions(projectRoot, options = {}) {
  const channel = normalizeString(options.channel || DEFAULT_RELEASE_CHANNEL) || DEFAULT_RELEASE_CHANNEL;
  const catalog = await listComputerUseWorkflowCatalog(projectRoot, {
    ...options,
    channel,
    explicitReleaseSelection: normalizeString(options.workflowId) === RELEASE_INSTALL_LOCAL_WORKFLOW_ID,
  });

  let selected = selectPreparedWorkflows(catalog, {
    ...options,
    channel,
  });
  if (
    normalizeString(options.workflowId) === "surface-local"
    && uniqueStrings(options.surfaceIds || []).length > 0
  ) {
    selected = selected.filter((entry) => uniqueStrings(options.surfaceIds || []).includes(entry.surfaceId));
  }

  if (selected.length === 0) {
    throw createScriptError("args", "No Computer Use workflows matched the current selection.", {
      failedStage: "computer-use-workflows:selection",
      details: {
        workflowId: normalizeString(options.workflowId) || null,
        allTriggered: options.allTriggered === true,
        surfaceIds: uniqueStrings(options.surfaceIds || []),
      },
    });
  }

  const prepared = [];
  const now = options.now || new Date();
  for (const workflow of selected) {
    const artifactsDir = buildComputerUseSessionArtifactsDir(workflow.target, {
      sessionRoot: options.sessionRoot,
      now,
    });
    const preparedWorkflow = buildPreparedWorkflow(workflow, artifactsDir);
    if (workflow.ready !== true) {
      prepared.push({
        ...preparedWorkflow,
        activation: {
          status: "skipped",
          artifactPaths: null,
        },
      });
      continue;
    }

    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      const activation = await startComputerUseValidation(projectRoot, {
        userRequested: true,
        target: workflow.target,
        workflowContext: buildWorkflowValidationContext(workflow),
      });
      prepared.push({
        ...preparedWorkflow,
        activation: {
          status: activation.status,
          artifactPaths: activation.artifactPaths,
        },
      });
    } finally {
      if (previousArtifactsDir === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifactsDir;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sessionRoot: path.resolve(normalizeString(options.sessionRoot) || DEFAULT_COMPUTER_USE_SESSION_ROOT),
    prepared,
    changedPaths: catalog.changedPaths,
  };
}
