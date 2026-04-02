import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";

const CROSS_PROJECT_ALLOW_ENV = "AGENT_ALLOW_CROSS_PROJECT_ARTIFACTS";
const PROVENANCE_SENSITIVE_ARTIFACTS = Object.freeze([
  ["agent-runs"],
  ["agent-delegation"],
  ["agent-memory"],
  ["agent-memory.json"],
  ["agent-memory.md"],
  ["agent-monitor.json"],
  ["agent-monitor.md"],
  ["agent-gate.json"],
  ["agent-gate.md"],
  ["agent-dashboard.html"],
  ["agent-obsidian-handoff.json"],
  ["agent-obsidian-handoff.md"],
  ["init-workspace.json"],
]);

function normalizePath(value) {
  return String(value || "").trim();
}

async function resolveCanonicalPath(targetPath) {
  const normalized = normalizePath(targetPath);
  if (!normalized) {
    return null;
  }
  const absolute = path.resolve(normalized);
  try {
    return await fs.realpath(absolute);
  } catch {
    return absolute;
  }
}

function isWithinRoot(candidatePath, rootPath) {
  const candidate = normalizePath(candidatePath);
  const root = normalizePath(rootPath);
  if (!candidate || !root) {
    return false;
  }
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseAllowCrossProject(env = process.env) {
  return String(env?.[CROSS_PROJECT_ALLOW_ENV] || "").trim() === "1";
}

export function resolveProvenanceSensitiveArtifactPaths(projectRoot) {
  return PROVENANCE_SENSITIVE_ARTIFACTS.map((parts) => resolveAgentArtifactPath(projectRoot, ...parts));
}

export async function cleanProvenanceSensitiveArtifacts(projectRoot) {
  const targets = resolveProvenanceSensitiveArtifactPaths(projectRoot);
  await Promise.all(targets.map((targetPath) => fs.rm(targetPath, { recursive: true, force: true })));
  return targets;
}

async function evaluateRunRecordsProvenance(runs, projectRootCanonical) {
  const sourceRuns = Array.isArray(runs) ? runs : [];
  let inProjectCount = 0;
  let outOfProjectCount = 0;
  let unknownCount = 0;
  const outOfProjectSamples = [];

  for (const run of sourceRuns) {
    const declaredCanonical = normalizePath(run?.executionCwdCanonical || run?.cwdCanonical || run?.cwd);
    const executionCanonical = await resolveCanonicalPath(declaredCanonical);
    if (!executionCanonical) {
      unknownCount += 1;
      continue;
    }
    if (isWithinRoot(executionCanonical, projectRootCanonical)) {
      inProjectCount += 1;
    } else {
      outOfProjectCount += 1;
      if (outOfProjectSamples.length < 5) {
        outOfProjectSamples.push({
          runName: run?.runName || "unknown",
          cwd: executionCanonical,
          startedAtISO: run?.startedAtISO || null,
        });
      }
    }
  }

  return {
    total: sourceRuns.length,
    inProjectCount,
    outOfProjectCount,
    unknownCount,
    outOfProjectSamples,
  };
}

async function evaluateDelegationProvenance(projectRootCanonical) {
  const delegationRoot = resolveAgentArtifactPath(projectRootCanonical, "agent-delegation");
  let entries = [];
  try {
    entries = await fs.readdir(delegationRoot, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        totalInvocations: 0,
        outOfProjectCwdCount: 0,
        outOfProjectArtifactBaseCount: 0,
        samples: [],
      };
    }
    throw error;
  }

  let totalInvocations = 0;
  let outOfProjectCwdCount = 0;
  let outOfProjectArtifactBaseCount = 0;
  const samples = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const invocationPath = path.join(delegationRoot, entry.name, "invocation.json");
    let invocation = null;
    try {
      invocation = JSON.parse(await fs.readFile(invocationPath, "utf-8"));
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    totalInvocations += 1;

    const invocationCwd = await resolveCanonicalPath(invocation?.cwd);
    if (invocationCwd && !isWithinRoot(invocationCwd, projectRootCanonical)) {
      outOfProjectCwdCount += 1;
      if (samples.length < 5) {
        samples.push({
          taskId: entry.name,
          type: "cwd",
          value: invocationCwd,
        });
      }
    }

    const args = Array.isArray(invocation?.args) ? invocation.args : [];
    const artifactBaseIndex = args.indexOf("--artifact-base");
    if (artifactBaseIndex >= 0 && args[artifactBaseIndex + 1]) {
      const artifactBase = await resolveCanonicalPath(args[artifactBaseIndex + 1]);
      if (artifactBase && !isWithinRoot(artifactBase, projectRootCanonical)) {
        outOfProjectArtifactBaseCount += 1;
        if (samples.length < 5) {
          samples.push({
            taskId: entry.name,
            type: "artifact-base",
            value: artifactBase,
          });
        }
      }
    }
  }

  return {
    totalInvocations,
    outOfProjectCwdCount,
    outOfProjectArtifactBaseCount,
    samples,
  };
}

export async function evaluateArtifactProvenance(projectRoot, runs, options = {}) {
  const env = options.env || process.env;
  const allowCrossProject = parseAllowCrossProject(env);
  const projectRootCanonical = await resolveCanonicalPath(projectRoot) || path.resolve(projectRoot);

  const [runRecords, delegation] = await Promise.all([
    evaluateRunRecordsProvenance(runs, projectRootCanonical),
    evaluateDelegationProvenance(projectRootCanonical),
  ]);

  const crossProjectDetected = (
    runRecords.outOfProjectCount > 0
    || delegation.outOfProjectCwdCount > 0
    || delegation.outOfProjectArtifactBaseCount > 0
  );
  const violation = crossProjectDetected && !allowCrossProject;

  let status = "within-project";
  let message = `工件来源已归属当前仓库：${projectRootCanonical}`;
  if (crossProjectDetected && allowCrossProject) {
    status = "cross-project-bypassed";
    message = `检测到跨仓库工件来源，但已通过 ${CROSS_PROJECT_ALLOW_ENV}=1 放行。`;
  } else if (crossProjectDetected) {
    status = "cross-project-detected";
    message = "检测到跨仓库工件来源，当前门禁按严格模式阻断。";
  }

  const issues = [];
  const recommendations = [];
  if (violation) {
    issues.push("运行或委托工件来源存在跨仓库记录。");
    recommendations.push("先执行 `npm run init:workspace` 清理可再生 agent 工件，再在当前仓库重新执行关键任务。");
    recommendations.push("建议随后运行 `npm run agent:check` 与 `npm run agent:gate`，用当前仓库 fresh 记录重建门禁状态。");
    recommendations.push(`若确需临时放行，请显式设置 ${CROSS_PROJECT_ALLOW_ENV}=1。`);
  }

  return {
    checkedAt: new Date().toISOString(),
    allowCrossProject,
    projectRoot: path.resolve(projectRoot),
    projectRootCanonical,
    status,
    violation,
    message,
    issue: issues[0] || null,
    recommendation: recommendations[0] || null,
    runRecords,
    delegation,
    issues,
    recommendations,
  };
}

export { CROSS_PROJECT_ALLOW_ENV };
