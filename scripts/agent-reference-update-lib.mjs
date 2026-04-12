import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeRepoRelativePath } from "./agent-reference-shared-lib.mjs";
import { resolveAgentReferenceUpdateArtifacts } from "./agent-artifacts.mjs";
import {
  assertPlainObject,
  assertScript,
  createScriptError,
  readJSONFile,
  wrapScriptError,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

export const REFERENCE_PROJECTS_SCHEMA_VERSION = 1;
export const AGENT_REFERENCE_UPDATE_SCHEMA_VERSION = 1;
export const REFERENCE_PROJECTS_CONFIG_RELATIVE_PATH = path.join("config", "reference-projects.json");

const REFERENCE_SOURCE_TYPES = Object.freeze(["git"]);
const REFERENCE_REF_TYPES = Object.freeze(["branch", "tag"]);
const SUCCESS_UPDATE_STATUSES = new Set(["cloned", "updated", "replaced", "skipped"]);

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeBoolean(value, defaultValue = true) {
  if (value === undefined) {
    return Boolean(defaultValue);
  }
  return value !== false;
}

function normalizeProjectId(value, label = "reference project id") {
  const id = normalizeString(value);
  assertScript(/^[a-z0-9][a-z0-9._-]*$/u.test(id), `${label} must match /^[a-z0-9][a-z0-9._-]*$/`, {
    category: "validation",
    failedStage: "load-reference-projects",
    details: {
      value,
    },
  });
  return id;
}

function normalizeEnum(value, allowed, label) {
  const normalized = normalizeString(value);
  assertScript(allowed.includes(normalized), `${label} must be one of: ${allowed.join(", ")}`, {
    category: "validation",
    failedStage: "load-reference-projects",
    details: {
      value,
      allowed,
    },
  });
  return normalized;
}

function normalizeReferenceTargetPath(value) {
  const normalized = normalizeRepoRelativePath(value);
  assertScript(
    normalized && normalized.startsWith("reference/"),
    "reference project targetPath must stay inside reference/",
    {
      category: "validation",
      failedStage: "load-reference-projects",
      details: {
        targetPath: value,
      },
    },
  );
  return normalized;
}

function normalizeGitLocator(value, projectRoot = process.cwd()) {
  const text = normalizeString(value).replace(/\/+$/u, "");
  if (!text) {
    return "";
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(text) || text.startsWith("git@")) {
    return text;
  }
  return path.resolve(projectRoot, text);
}

function toProjectRelativePath(projectRoot, targetPath) {
  return normalizeRepoRelativePath(path.relative(projectRoot, targetPath)) || targetPath;
}

function formatBackupSuffix(now = new Date()) {
  return now.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

function shortCommit(commit) {
  return normalizeString(commit).slice(0, 12) || null;
}

function execFileText(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout = "", stderr = "") => {
      if (error && !options.allowFailure) {
        reject(createScriptError("execution", `Command failed: ${command} ${args.join(" ")}`, {
          failedStage: options.failedStage || "exec",
          details: {
            command,
            args,
            cwd: options.cwd || process.cwd(),
            exitCode: error?.code ?? null,
            stdoutTail: stdout.trim().split("\n").slice(-12).join("\n"),
            stderrTail: stderr.trim().split("\n").slice(-12).join("\n"),
          },
          cause: error,
        }));
        return;
      }
      resolve({
        code: error?.code ?? 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function runGitCommand(args, options = {}) {
  return await execFileText("git", args, {
    ...options,
    failedStage: options.failedStage || "reference-git",
  });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function resolveCanonicalPath(targetPath) {
  try {
    return await fs.realpath(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return path.resolve(targetPath);
    }
    throw error;
  }
}

async function inspectGitTarget(projectRoot, project) {
  const targetAbsolutePath = path.join(projectRoot, project.targetPath);
  const targetExists = await pathExists(targetAbsolutePath);
  if (!targetExists) {
    return {
      exists: false,
      kind: "missing",
      gitWorktree: false,
      dirty: false,
      currentCommit: null,
      currentCommitShort: null,
      currentBranch: null,
      originUrl: null,
      targetAbsolutePath,
    };
  }

  const gitProbe = await runGitCommand(["rev-parse", "--is-inside-work-tree"], {
    cwd: targetAbsolutePath,
    allowFailure: true,
    failedStage: "reference-inspect",
  });

  if (gitProbe.code !== 0 || gitProbe.stdout !== "true") {
    return {
      exists: true,
      kind: "non-git",
      gitWorktree: false,
      dirty: false,
      currentCommit: null,
      currentCommitShort: null,
      currentBranch: null,
      originUrl: null,
      targetAbsolutePath,
    };
  }

  const repoRootResult = await runGitCommand(["rev-parse", "--show-toplevel"], {
    cwd: targetAbsolutePath,
    allowFailure: true,
    failedStage: "reference-inspect",
  });
  const targetCanonicalPath = await resolveCanonicalPath(targetAbsolutePath);
  const repoRootCanonicalPath = repoRootResult.code === 0
    ? await resolveCanonicalPath(repoRootResult.stdout)
    : null;

  if (!repoRootCanonicalPath || repoRootCanonicalPath !== targetCanonicalPath) {
    return {
      exists: true,
      kind: "non-git",
      gitWorktree: false,
      dirty: false,
      currentCommit: null,
      currentCommitShort: null,
      currentBranch: null,
      originUrl: null,
      targetAbsolutePath,
    };
  }

  const [statusResult, commitResult, branchResult, originResult] = await Promise.all([
    runGitCommand(["status", "--porcelain"], {
      cwd: targetAbsolutePath,
      allowFailure: true,
      failedStage: "reference-inspect",
    }),
    runGitCommand(["rev-parse", "HEAD"], {
      cwd: targetAbsolutePath,
      allowFailure: true,
      failedStage: "reference-inspect",
    }),
    runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: targetAbsolutePath,
      allowFailure: true,
      failedStage: "reference-inspect",
    }),
    runGitCommand(["config", "--get", "remote.origin.url"], {
      cwd: targetAbsolutePath,
      allowFailure: true,
      failedStage: "reference-inspect",
    }),
  ]);

  const currentCommit = commitResult.code === 0 ? normalizeString(commitResult.stdout) : null;
  const currentBranch = branchResult.code === 0 ? normalizeString(branchResult.stdout) : null;
  const originUrl = originResult.code === 0 ? normalizeString(originResult.stdout) : null;

  return {
    exists: true,
    kind: "git",
    gitWorktree: true,
    dirty: Boolean(normalizeString(statusResult.stdout)),
    currentCommit,
    currentCommitShort: shortCommit(currentCommit),
    currentBranch,
    originUrl,
    normalizedOriginUrl: normalizeGitLocator(originUrl, projectRoot),
    targetAbsolutePath,
  };
}

function normalizeReferenceProjectEntry(raw, projectRoot, index) {
  const entry = assertPlainObject(raw, `reference project[${index}]`, {
    category: "validation",
    failedStage: "load-reference-projects",
  });
  const id = normalizeProjectId(entry.id, `reference project[${index}] id`);
  const source = assertPlainObject(entry.source, `reference project '${id}' source`, {
    category: "validation",
    failedStage: "load-reference-projects",
  });
  const sourceType = normalizeEnum(source.type || "git", REFERENCE_SOURCE_TYPES, `reference project '${id}' source.type`);
  const refType = normalizeEnum(source.refType || "branch", REFERENCE_REF_TYPES, `reference project '${id}' source.refType`);
  const sourceUrl = normalizeString(source.url);
  const sourceRef = normalizeString(source.ref || "main");

  assertScript(sourceUrl, `reference project '${id}' source.url must be a non-empty string`, {
    category: "validation",
    failedStage: "load-reference-projects",
  });
  assertScript(sourceRef, `reference project '${id}' source.ref must be a non-empty string`, {
    category: "validation",
    failedStage: "load-reference-projects",
  });

  return {
    id,
    label: normalizeString(entry.label) || id,
    enabled: normalizeBoolean(entry.enabled, true),
    notes: normalizeString(entry.notes) || null,
    targetPath: normalizeReferenceTargetPath(entry.targetPath),
    source: {
      type: sourceType,
      url: sourceUrl,
      ref: sourceRef,
      refType,
      normalizedUrl: normalizeGitLocator(sourceUrl, projectRoot),
    },
  };
}

function selectProjects(projects, options = {}) {
  const requestedIds = Array.from(new Set(
    (Array.isArray(options.projectIds) ? options.projectIds : [])
      .map((item) => normalizeString(item))
      .filter(Boolean),
  ));

  if (requestedIds.length === 0) {
    if (options.command === "update" && options.all !== true) {
      throw createScriptError("args", "update requires --project <id> or --all", {
        failedStage: "parse-args",
      });
    }
    return projects.slice();
  }

  const selected = projects.filter((project) => requestedIds.includes(project.id));
  const missing = requestedIds.filter((projectId) => !selected.some((project) => project.id === projectId));
  assertScript(missing.length === 0, `Unknown reference project id(s): ${missing.join(", ")}`, {
    category: "args",
    failedStage: "select-reference-projects",
    details: {
      requestedIds,
      availableIds: projects.map((project) => project.id),
    },
  });
  return selected;
}

async function cloneReferenceProject(projectRoot, project, targetAbsolutePath) {
  await fs.mkdir(path.dirname(targetAbsolutePath), { recursive: true });
  await runGitCommand([
    "clone",
    "--depth",
    "1",
    "--branch",
    project.source.ref,
    project.source.url,
    targetAbsolutePath,
  ], {
    cwd: projectRoot,
    failedStage: "reference-clone",
  });
}

async function refreshReferenceGitCheckout(projectRoot, project, targetAbsolutePath) {
  await runGitCommand(["fetch", "--depth", "1", "origin", project.source.ref], {
    cwd: targetAbsolutePath,
    failedStage: "reference-fetch",
  });
  await runGitCommand(["reset", "--hard", "FETCH_HEAD"], {
    cwd: targetAbsolutePath,
    failedStage: "reference-reset",
  });
  return await inspectGitTarget(projectRoot, project);
}

async function backupAndReplaceReferenceProject(projectRoot, project, beforeState) {
  const backupAbsolutePath = `${beforeState.targetAbsolutePath}.backup-${formatBackupSuffix()}`;
  await fs.rename(beforeState.targetAbsolutePath, backupAbsolutePath);
  await cloneReferenceProject(projectRoot, project, beforeState.targetAbsolutePath);
  return {
    backupAbsolutePath,
    backupRelativePath: toProjectRelativePath(projectRoot, backupAbsolutePath),
  };
}

async function updateReferenceProject(projectRoot, project, options = {}) {
  const beforeState = await inspectGitTarget(projectRoot, project);
  const resultBase = {
    id: project.id,
    label: project.label,
    targetPath: project.targetPath,
    source: {
      type: project.source.type,
      url: project.source.url,
      ref: project.source.ref,
      refType: project.source.refType,
    },
    beforeState,
  };

  if (!project.enabled) {
    return {
      ...resultBase,
      status: "blocked",
      reason: "project-disabled",
      afterState: beforeState,
    };
  }

  if (!beforeState.exists) {
    await cloneReferenceProject(projectRoot, project, beforeState.targetAbsolutePath);
    const afterState = await inspectGitTarget(projectRoot, project);
    return {
      ...resultBase,
      status: "cloned",
      reason: "target-created",
      afterState,
    };
  }

  if (beforeState.kind !== "git") {
    if (!options.replaceExisting) {
      return {
        ...resultBase,
        status: "blocked",
        reason: "non-git-target",
        afterState: beforeState,
      };
    }
    const replacement = await backupAndReplaceReferenceProject(projectRoot, project, beforeState);
    const afterState = await inspectGitTarget(projectRoot, project);
    return {
      ...resultBase,
      status: "replaced",
      reason: "replaced-non-git-target",
      backupPath: replacement.backupRelativePath,
      afterState,
    };
  }

  const originMatches = normalizeGitLocator(beforeState.originUrl, projectRoot) === project.source.normalizedUrl;
  if (!beforeState.originUrl || !originMatches) {
    if (!options.replaceExisting) {
      return {
        ...resultBase,
        status: "blocked",
        reason: beforeState.originUrl ? "origin-mismatch" : "origin-missing",
        afterState: beforeState,
      };
    }
    const replacement = await backupAndReplaceReferenceProject(projectRoot, project, beforeState);
    const afterState = await inspectGitTarget(projectRoot, project);
    return {
      ...resultBase,
      status: "replaced",
      reason: beforeState.originUrl ? "replaced-origin-mismatch" : "replaced-origin-missing",
      backupPath: replacement.backupRelativePath,
      afterState,
    };
  }

  if (beforeState.dirty && !options.allowDirty) {
    if (!options.replaceExisting) {
      return {
        ...resultBase,
        status: "blocked",
        reason: "dirty-worktree",
        afterState: beforeState,
      };
    }
    const replacement = await backupAndReplaceReferenceProject(projectRoot, project, beforeState);
    const afterState = await inspectGitTarget(projectRoot, project);
    return {
      ...resultBase,
      status: "replaced",
      reason: "replaced-dirty-worktree",
      backupPath: replacement.backupRelativePath,
      afterState,
    };
  }

  const afterState = await refreshReferenceGitCheckout(projectRoot, project, beforeState.targetAbsolutePath);
  return {
    ...resultBase,
    status: beforeState.currentCommit === afterState.currentCommit ? "skipped" : "updated",
    reason: beforeState.currentCommit === afterState.currentCommit ? "already-current" : "fetched-latest",
    afterState,
  };
}

async function writeReferenceUpdateArtifact(projectRoot, payload) {
  const artifacts = resolveAgentReferenceUpdateArtifacts(projectRoot);
  await fs.mkdir(artifacts.archiveDir, { recursive: true });
  await writeJSONArtifact(artifacts.latestJSON, payload);
  return artifacts.latestJSON;
}

export async function loadManagedReferenceProjects(projectRoot) {
  const configPath = path.join(projectRoot, REFERENCE_PROJECTS_CONFIG_RELATIVE_PATH);
  const payload = await readJSONFile(configPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    missingStage: "load-reference-projects",
    invalidStage: "load-reference-projects",
    label: REFERENCE_PROJECTS_CONFIG_RELATIVE_PATH,
  });
  assertPlainObject(payload, REFERENCE_PROJECTS_CONFIG_RELATIVE_PATH, {
    category: "validation",
    failedStage: "load-reference-projects",
  });
  const version = Number(payload.version || 0);
  assertScript(version === REFERENCE_PROJECTS_SCHEMA_VERSION, `reference-projects.json version must be ${REFERENCE_PROJECTS_SCHEMA_VERSION}`, {
    category: "validation",
    failedStage: "load-reference-projects",
    details: {
      version,
      expected: REFERENCE_PROJECTS_SCHEMA_VERSION,
    },
  });
  assertScript(Array.isArray(payload.projects), "reference-projects.json projects must be an array", {
    category: "validation",
    failedStage: "load-reference-projects",
  });

  const seenIds = new Set();
  const projects = payload.projects.map((entry, index) => {
    const project = normalizeReferenceProjectEntry(entry, projectRoot, index);
    assertScript(!seenIds.has(project.id), `Duplicate reference project id: ${project.id}`, {
      category: "validation",
      failedStage: "load-reference-projects",
    });
    seenIds.add(project.id);
    return project;
  });

  return {
    schemaVersion: version,
    configPath: REFERENCE_PROJECTS_CONFIG_RELATIVE_PATH,
    projects,
  };
}

export async function listManagedReferenceProjects(projectRoot, options = {}) {
  const manifest = await loadManagedReferenceProjects(projectRoot);
  const selectedProjects = selectProjects(manifest.projects, {
    ...options,
    command: "list",
  });
  const projectStates = await Promise.all(selectedProjects.map(async (project) => ({
    ...project,
    localState: await inspectGitTarget(projectRoot, project),
  })));

  return {
    schemaVersion: AGENT_REFERENCE_UPDATE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    command: "list",
    configPath: manifest.configPath,
    projectCount: projectStates.length,
    projects: projectStates.map((project) => ({
      id: project.id,
      label: project.label,
      enabled: project.enabled,
      notes: project.notes,
      targetPath: project.targetPath,
      source: {
        type: project.source.type,
        url: project.source.url,
        ref: project.source.ref,
        refType: project.source.refType,
      },
      localState: project.localState,
    })),
  };
}

export async function updateManagedReferenceProjects(projectRoot, options = {}) {
  const manifest = await loadManagedReferenceProjects(projectRoot);
  const selectedProjects = selectProjects(manifest.projects, {
    ...options,
    command: "update",
  });
  const generatedAt = new Date().toISOString();
  const results = [];

  for (const project of selectedProjects) {
    try {
      results.push(await updateReferenceProject(projectRoot, project, options));
    } catch (error) {
      const failureInfo = wrapScriptError(error, {
        failedStage: "reference-update",
        details: {
          projectId: project.id,
          targetPath: project.targetPath,
        },
      });
      results.push({
        id: project.id,
        label: project.label,
        targetPath: project.targetPath,
        source: {
          type: project.source.type,
          url: project.source.url,
          ref: project.source.ref,
          refType: project.source.refType,
        },
        beforeState: await inspectGitTarget(projectRoot, project).catch(() => ({
          exists: false,
          kind: "unknown",
          gitWorktree: false,
          dirty: false,
          currentCommit: null,
          currentCommitShort: null,
          currentBranch: null,
          originUrl: null,
          targetAbsolutePath: path.join(projectRoot, project.targetPath),
        })),
        afterState: null,
        status: "failed",
        reason: "command-failed",
        errorCategory: failureInfo.scriptErrorCategory || "execution",
        errorMessage: failureInfo.message,
      });
    }
  }

  const summary = {
    schemaVersion: AGENT_REFERENCE_UPDATE_SCHEMA_VERSION,
    generatedAt,
    command: "update",
    configPath: manifest.configPath,
    selectedProjectIds: selectedProjects.map((project) => project.id),
    updatedCount: results.filter((item) => item.status === "updated").length,
    clonedCount: results.filter((item) => item.status === "cloned").length,
    replacedCount: results.filter((item) => item.status === "replaced").length,
    skippedCount: results.filter((item) => item.status === "skipped").length,
    blockedCount: results.filter((item) => item.status === "blocked").length,
    failedCount: results.filter((item) => item.status === "failed").length,
    ok: results.every((item) => SUCCESS_UPDATE_STATUSES.has(item.status)),
    results,
  };

  const artifactPath = await writeReferenceUpdateArtifact(projectRoot, summary);
  return {
    ...summary,
    artifactPath: toProjectRelativePath(projectRoot, artifactPath),
  };
}
