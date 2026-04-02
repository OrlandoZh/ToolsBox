import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { isPathWithinRoot } from "./agent-obsidian-guard-lib.mjs";

async function resolveCanonicalPath(inputPath) {
  const resolved = path.resolve(String(inputPath || ""));
  try {
    return await fs.realpath(resolved);
  } catch {
    return resolved;
  }
}

async function readInitWorkspaceArtifact(projectRoot, env = process.env) {
  const customDir = String(env?.AGENT_ARTIFACTS_DIR || "").trim();
  const artifactPath = customDir
    ? path.join(path.resolve(customDir), "init-workspace.json")
    : path.join(path.resolve(projectRoot), "dist", "init-workspace.json");
  try {
    const source = await fs.readFile(artifactPath, "utf-8");
    return {
      artifactPath,
      present: true,
      invalid: false,
      payload: JSON.parse(source),
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        artifactPath,
        present: false,
        invalid: false,
        payload: null,
      };
    }
    if (error instanceof SyntaxError) {
      return {
        artifactPath,
        present: true,
        invalid: true,
        payload: null,
      };
    }
    throw error;
  }
}

export function buildWorkspaceInitGuardIssue(result) {
  if (!result || !result.violation) {
    return null;
  }
  switch (result.status) {
    case "missing-init-report":
      return "当前仓库还没有 `init:workspace` 初始化记录。";
    case "invalid-init-report":
      return `工作区初始化工件无效：\`${result.artifactPath}\` 不是合法 JSON。`;
    case "failed-init-report":
      return "最近一次 `init:workspace` 没有成功完成。";
    case "path-mismatch":
      return `工作区初始化工件仍指向其他仓库或旧路径：\`${result.reportProjectRootCanonical || result.cleanedWorkspaceDirCanonical || "-"}\`。`;
    default:
      return "当前仓库尚未完成工作区初始化。";
  }
}

export function buildWorkspaceInitGuardRecommendation(result) {
  if (!result || !result.violation) {
    return null;
  }
  return "先执行 `npm run init:workspace`，清理路径敏感工件并为当前仓库重建 fresh 工作区记录。";
}

export async function evaluateWorkspaceInitGuard(projectRoot, options = {}) {
  const env = options.env || process.env;
  const strict = options.strict === true;
  const initReport = await readInitWorkspaceArtifact(projectRoot, env);
  const projectRootCanonical = await resolveCanonicalPath(projectRoot);

  const base = {
    checkedAt: new Date().toISOString(),
    strict,
    projectRoot: path.resolve(projectRoot),
    projectRootCanonical,
    artifactPath: initReport.artifactPath,
    initReportPresent: initReport.present,
    initReportInvalid: initReport.invalid,
    generatedAt: initReport.payload?.generatedAt || null,
    reportSuccess: initReport.payload?.success === true,
    reportProjectRoot: initReport.payload?.projectRoot || null,
    reportProjectRootCanonical: null,
    cleanedWorkspaceDir: initReport.payload?.cleanedWorkspaceDir || null,
    cleanedWorkspaceDirCanonical: null,
    matchedCurrentProject: null,
    violation: false,
    ok: true,
    status: "missing-init-report",
    message: "尚未发现 `init:workspace` 记录；首次从模板复制、迁移仓库或怀疑工件串目录时，应先初始化工作区。",
    issue: null,
    recommendation: null,
  };

  if (!initReport.present) {
    const result = {
      ...base,
      ok: !strict,
      violation: true,
    };
    result.issue = buildWorkspaceInitGuardIssue(result);
    result.recommendation = buildWorkspaceInitGuardRecommendation(result);
    return result;
  }

  if (initReport.invalid) {
    const result = {
      ...base,
      status: "invalid-init-report",
      ok: !strict,
      violation: true,
      message: `工作区初始化工件不是合法 JSON：${initReport.artifactPath}`,
    };
    result.issue = buildWorkspaceInitGuardIssue(result);
    result.recommendation = buildWorkspaceInitGuardRecommendation(result);
    return result;
  }

  const reportProjectRootCanonical = initReport.payload?.projectRootCanonical
    ? await resolveCanonicalPath(initReport.payload.projectRootCanonical)
    : (initReport.payload?.projectRoot
      ? await resolveCanonicalPath(initReport.payload.projectRoot)
      : null);
  const cleanedWorkspaceDirCanonical = initReport.payload?.cleanedWorkspaceDir
    ? await resolveCanonicalPath(initReport.payload.cleanedWorkspaceDir)
    : null;
  const matchedCurrentProject = (
    (reportProjectRootCanonical && reportProjectRootCanonical === projectRootCanonical)
    || (cleanedWorkspaceDirCanonical && isPathWithinRoot(cleanedWorkspaceDirCanonical, projectRootCanonical))
  );

  const withPaths = {
    ...base,
    reportProjectRootCanonical,
    cleanedWorkspaceDirCanonical,
    matchedCurrentProject,
  };

  if (initReport.payload?.success !== true) {
    const result = {
      ...withPaths,
      status: "failed-init-report",
      ok: !strict,
      violation: true,
      message: "最近一次 `init:workspace` 未成功完成，请先重新初始化当前工作区。",
    };
    result.issue = buildWorkspaceInitGuardIssue(result);
    result.recommendation = buildWorkspaceInitGuardRecommendation(result);
    return result;
  }

  if (!matchedCurrentProject) {
    const result = {
      ...withPaths,
      status: "path-mismatch",
      ok: !strict,
      violation: true,
      message: `工作区初始化工件仍指向其他仓库或旧路径：${reportProjectRootCanonical || cleanedWorkspaceDirCanonical || initReport.artifactPath}`,
    };
    result.issue = buildWorkspaceInitGuardIssue(result);
    result.recommendation = buildWorkspaceInitGuardRecommendation(result);
    return result;
  }

  return {
    ...withPaths,
    status: "initialized",
    ok: true,
    violation: false,
    message: `当前仓库已完成工作区初始化：${initReport.artifactPath}`,
  };
}
