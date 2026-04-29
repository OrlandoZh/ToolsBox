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

export function resolveZoteroDebugProbeArtifacts(projectRoot) {
  return {
    artifactsDir: resolveAgentArtifactsDir(projectRoot),
    reportJSON: resolveAgentArtifactPath(projectRoot, "agent-zotero-debug-probe.json"),
    reportMD: resolveAgentArtifactPath(projectRoot, "agent-zotero-debug-probe.md"),
  };
}

export function resolveZoteroProfileArtifacts(projectRoot) {
  return {
    artifactsDir: resolveAgentArtifactsDir(projectRoot),
    reportJSON: resolveAgentArtifactPath(projectRoot, "agent-zotero-profile.json"),
    reportMD: resolveAgentArtifactPath(projectRoot, "agent-zotero-profile.md"),
  };
}

export function resolveZoteroMemoryArtifacts(projectRoot) {
  return {
    artifactsDir: resolveAgentArtifactsDir(projectRoot),
    reportJSON: resolveAgentArtifactPath(projectRoot, "agent-zotero-memory.json"),
    reportMD: resolveAgentArtifactPath(projectRoot, "agent-zotero-memory.md"),
    aboutMemoryTXT: resolveAgentArtifactPath(projectRoot, "agent-zotero-memory-about-memory.txt"),
  };
}

function normalizeWasmKernelScenarioName(scenarioName = "") {
  return String(scenarioName || "").trim().toLowerCase();
}

function slugifyWasmKernelScenarioName(scenarioName = "") {
  const normalized = normalizeWasmKernelScenarioName(scenarioName);
  if (!normalized) {
    return "probe";
  }

  const coreLabel = normalized
    .replace(/^wasm kernel\s+/u, "")
    .replace(/\s+diagnostics$/u, "")
    .trim();
  const slugSource = coreLabel || normalized;
  const slug = slugSource
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return slug || "probe";
}

export function resolveWasmKernelScenarioArtifactKey(scenarioName = "") {
  const normalized = normalizeWasmKernelScenarioName(scenarioName);
  if (!normalized || normalized === "wasm kernel probe diagnostics") {
    return "probe";
  }
  if (normalized === "wasm kernel digest diagnostics") {
    return "digest";
  }
  return slugifyWasmKernelScenarioName(normalized);
}

export function resolveZoteroWasmKernelScenarioArtifacts(projectRoot, scenarioName = "") {
  const artifactsDir = resolveAgentArtifactsDir(projectRoot);
  const scenarioKey = resolveWasmKernelScenarioArtifactKey(scenarioName);
  const normalizedScenarioName = String(scenarioName || "").trim() || null;
  const isDefaultScenario = !normalizedScenarioName || normalizeWasmKernelScenarioName(scenarioName) === "wasm kernel probe diagnostics";
  const smokeDir = path.join(artifactsDir, "wasm-kernel-smoke", scenarioKey);
  const performanceDir = path.join(artifactsDir, "wasm-kernel-performance", scenarioKey);
  const disabledContractDir = path.join(artifactsDir, "wasm-kernel-disabled-contract", scenarioKey);

  return {
    artifactsDir,
    scenarioName: normalizedScenarioName,
    scenarioKey,
    isDefaultScenario,
    smokeJSON: resolveAgentArtifactPath(projectRoot, `wasm-kernel-${scenarioKey}-smoke.json`),
    smokeMD: resolveAgentArtifactPath(projectRoot, `wasm-kernel-${scenarioKey}-smoke.md`),
    smokeDir,
    smokeLatestJSON: path.join(smokeDir, "latest.json"),
    smokeLatestMD: path.join(smokeDir, "latest.md"),
    performanceJSON: resolveAgentArtifactPath(projectRoot, `wasm-kernel-${scenarioKey}-performance.json`),
    performanceMD: resolveAgentArtifactPath(projectRoot, `wasm-kernel-${scenarioKey}-performance.md`),
    performanceDir,
    performanceLatestJSON: path.join(performanceDir, "latest.json"),
    performanceLatestMD: path.join(performanceDir, "latest.md"),
    disabledContractJSON: resolveAgentArtifactPath(projectRoot, `wasm-kernel-${scenarioKey}-disabled-contract.json`),
    disabledContractMD: resolveAgentArtifactPath(projectRoot, `wasm-kernel-${scenarioKey}-disabled-contract.md`),
    disabledContractDir,
    disabledContractLatestJSON: path.join(disabledContractDir, "latest.json"),
    disabledContractLatestMD: path.join(disabledContractDir, "latest.md"),
  };
}

export function resolveZoteroWasmKernelArtifacts(projectRoot) {
  const artifactsDir = resolveAgentArtifactsDir(projectRoot);
  const smokeDir = path.join(artifactsDir, "wasm-kernel-smoke");
  const performanceDir = path.join(artifactsDir, "wasm-kernel-performance");
  const disabledContractDir = path.join(artifactsDir, "wasm-kernel-disabled-contract");

  return {
    artifactsDir,
    matrixJSON: resolveAgentArtifactPath(projectRoot, "wasm-kernel-matrix.json"),
    matrixMD: resolveAgentArtifactPath(projectRoot, "wasm-kernel-matrix.md"),
    smokeJSON: resolveAgentArtifactPath(projectRoot, "wasm-kernel-smoke.json"),
    smokeMD: resolveAgentArtifactPath(projectRoot, "wasm-kernel-smoke.md"),
    smokeDir,
    smokeLatestJSON: path.join(smokeDir, "latest.json"),
    smokeLatestMD: path.join(smokeDir, "latest.md"),
    performanceJSON: resolveAgentArtifactPath(projectRoot, "wasm-kernel-performance.json"),
    performanceMD: resolveAgentArtifactPath(projectRoot, "wasm-kernel-performance.md"),
    performanceDir,
    performanceLatestJSON: path.join(performanceDir, "latest.json"),
    performanceLatestMD: path.join(performanceDir, "latest.md"),
    disabledContractJSON: resolveAgentArtifactPath(projectRoot, "wasm-kernel-disabled-contract.json"),
    disabledContractMD: resolveAgentArtifactPath(projectRoot, "wasm-kernel-disabled-contract.md"),
    disabledContractDir,
    disabledContractLatestJSON: path.join(disabledContractDir, "latest.json"),
    disabledContractLatestMD: path.join(disabledContractDir, "latest.md"),
    scenarioLastRunJSON: resolveAgentArtifactPath(projectRoot, "zotero-scenario-last-run.json"),
    scenarioLastRunMD: resolveAgentArtifactPath(projectRoot, "zotero-scenario-last-run.md"),
  };
}
