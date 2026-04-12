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

export function resolveAgentContextArtifacts(projectRoot) {
  const artifactsDir = resolveAgentArtifactsDir(projectRoot);
  const archiveDir = path.join(artifactsDir, "agent-context");

  return {
    artifactsDir,
    reportJSON: resolveAgentArtifactPath(projectRoot, "agent-context.json"),
    reportMD: resolveAgentArtifactPath(projectRoot, "agent-context.md"),
    archiveDir,
    latestJSON: path.join(archiveDir, "latest.json"),
    latestMD: path.join(archiveDir, "latest.md"),
  };
}

export function resolveAgentReferenceIntakeArtifacts(projectRoot) {
  const artifactsDir = resolveAgentArtifactsDir(projectRoot);
  const archiveDir = path.join(artifactsDir, "agent-reference-intake");

  return {
    artifactsDir,
    archiveDir,
    indexJSON: path.join(archiveDir, "index.json"),
    latestJSON: path.join(archiveDir, "latest.json"),
  };
}

export function resolveAgentReferenceDistillArtifacts(projectRoot) {
  const artifactsDir = resolveAgentArtifactsDir(projectRoot);
  const archiveDir = path.join(artifactsDir, "agent-reference-distill");

  return {
    artifactsDir,
    archiveDir,
    indexJSON: path.join(archiveDir, "index.json"),
    latestJSON: path.join(archiveDir, "latest.json"),
    latestMD: path.join(archiveDir, "latest.md"),
  };
}

export function resolveAgentReferenceUpdateArtifacts(projectRoot) {
  const artifactsDir = resolveAgentArtifactsDir(projectRoot);
  const archiveDir = path.join(artifactsDir, "agent-reference-update");

  return {
    artifactsDir,
    archiveDir,
    latestJSON: path.join(archiveDir, "latest.json"),
  };
}
