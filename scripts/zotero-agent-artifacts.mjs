import path from "node:path";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";

export function resolveZoteroE2EArtifacts(projectRoot) {
  const artifactsDir = resolveAgentArtifactsDir(projectRoot);
  return {
    artifactsDir,
    reportJSON: resolveAgentArtifactPath(projectRoot, "agent-zotero-e2e.json"),
    reportMD: resolveAgentArtifactPath(projectRoot, "agent-zotero-e2e.md"),
    assetsDir: path.join(artifactsDir, "agent-zotero-e2e-assets"),
  };
}

export function resolveZoteroAutofixArtifacts(projectRoot) {
  const artifactsDir = resolveAgentArtifactsDir(projectRoot);
  const historyDir = path.join(artifactsDir, "agent-zotero-autofix-history");
  return {
    artifactsDir,
    e2eReportJSON: resolveAgentArtifactPath(projectRoot, "agent-zotero-e2e.json"),
    e2eReportMD: resolveAgentArtifactPath(projectRoot, "agent-zotero-e2e.md"),
    reportJSON: resolveAgentArtifactPath(projectRoot, "agent-zotero-autofix.json"),
    reportMD: resolveAgentArtifactPath(projectRoot, "agent-zotero-autofix.md"),
    historyDir,
    historyLatestJSON: path.join(historyDir, "latest.json"),
  };
}

export function resolveZoteroWatchRecoveryArtifacts(projectRoot) {
  return {
    artifactsDir: resolveAgentArtifactsDir(projectRoot),
    watchStatusJSON: resolveAgentArtifactPath(projectRoot, "zotero-watch-status.json"),
    reportJSON: resolveAgentArtifactPath(projectRoot, "zotero-watch-recovery-regression.json"),
    reportMD: resolveAgentArtifactPath(projectRoot, "zotero-watch-recovery-regression.md"),
  };
}

export function resolveZoteroLoopArtifacts(projectRoot) {
  return {
    artifactsDir: resolveAgentArtifactsDir(projectRoot),
    reportJSON: resolveAgentArtifactPath(projectRoot, "agent-zotero-loop.json"),
    reportMD: resolveAgentArtifactPath(projectRoot, "agent-zotero-loop.md"),
  };
}
