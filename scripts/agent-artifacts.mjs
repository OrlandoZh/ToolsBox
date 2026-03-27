import path from "node:path";
import process from "node:process";

export function resolveAgentArtifactsDir(projectRoot) {
  const customDir = String(process.env.AGENT_ARTIFACTS_DIR || "").trim();
  if (customDir) {
    return path.resolve(customDir);
  }
  return path.join(projectRoot, "dist");
}

export function resolveAgentArtifactPath(projectRoot, ...parts) {
  return path.join(resolveAgentArtifactsDir(projectRoot), ...parts);
}

export function resolveAgentMemoryArtifacts(projectRoot) {
  const artifactsDir = resolveAgentArtifactsDir(projectRoot);
  const archiveDir = path.join(artifactsDir, "agent-memory");
  const snapshotsDir = path.join(archiveDir, "snapshots");
  const fingerprintsDir = path.join(archiveDir, "fingerprints");
  const reasonsDir = path.join(archiveDir, "reasons");
  const signalsDir = path.join(archiveDir, "signals");

  return {
    artifactsDir,
    reportJSON: resolveAgentArtifactPath(projectRoot, "agent-memory.json"),
    reportMD: resolveAgentArtifactPath(projectRoot, "agent-memory.md"),
    archiveDir,
    latestJSON: path.join(archiveDir, "latest.json"),
    latestMD: path.join(archiveDir, "latest.md"),
    snapshotsDir,
    historyIndexJSON: path.join(archiveDir, "history-index.json"),
    fingerprintsDir,
    fingerprintIndexJSON: path.join(fingerprintsDir, "index.json"),
    reasonsDir,
    reasonIndexJSON: path.join(reasonsDir, "index.json"),
    signalsDir,
    signalIndexJSON: path.join(signalsDir, "index.json"),
  };
}
