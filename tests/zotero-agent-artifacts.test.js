import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  resolveZoteroAutofixArtifacts,
  resolveZoteroDebugProbeArtifacts,
  resolveZoteroE2EArtifacts,
  resolveZoteroLoopArtifacts,
  resolveZoteroWasmKernelArtifacts,
  resolveZoteroWasmKernelScenarioArtifacts,
  resolveWasmKernelScenarioArtifactKey,
  resolveZoteroWatchRecoveryArtifacts,
} from "../scripts/zotero-agent-artifacts.mjs";

const projectRoot = "/tmp/addon-template";

describe("Zotero Artifact Paths", () => {
  it("should resolve default artifact paths under dist", () => {
    const previous = process.env.AGENT_ARTIFACTS_DIR;
    delete process.env.AGENT_ARTIFACTS_DIR;
    try {
      const e2ePaths = resolveZoteroE2EArtifacts(projectRoot);
      const debugProbePaths = resolveZoteroDebugProbeArtifacts(projectRoot);
      const autofixPaths = resolveZoteroAutofixArtifacts(projectRoot);
      const loopPaths = resolveZoteroLoopArtifacts(projectRoot);
      const recoveryPaths = resolveZoteroWatchRecoveryArtifacts(projectRoot);
      const wasmPaths = resolveZoteroWasmKernelArtifacts(projectRoot);
      assert.equal(e2ePaths.artifactsDir, path.join(projectRoot, "dist"));
      assert.equal(e2ePaths.reportJSON, path.join(projectRoot, "dist", "agent-zotero-e2e.json"));
      assert.equal(e2ePaths.assetsDir, path.join(projectRoot, "dist", "agent-zotero-e2e-assets"));
      assert.equal(debugProbePaths.reportJSON, path.join(projectRoot, "dist", "agent-zotero-debug-probe.json"));
      assert.equal(debugProbePaths.reportMD, path.join(projectRoot, "dist", "agent-zotero-debug-probe.md"));
      assert.equal(autofixPaths.e2eReportMD, path.join(projectRoot, "dist", "agent-zotero-e2e.md"));
      assert.equal(autofixPaths.reportMD, path.join(projectRoot, "dist", "agent-zotero-autofix.md"));
      assert.equal(autofixPaths.historyDir, path.join(projectRoot, "dist", "agent-zotero-autofix-history"));
      assert.equal(autofixPaths.historyLatestJSON, path.join(projectRoot, "dist", "agent-zotero-autofix-history", "latest.json"));
      assert.equal(loopPaths.reportJSON, path.join(projectRoot, "dist", "agent-zotero-loop.json"));
      assert.equal(recoveryPaths.watchStatusJSON, path.join(projectRoot, "dist", "zotero-watch-status.json"));
      assert.equal(wasmPaths.matrixJSON, path.join(projectRoot, "dist", "wasm-kernel-matrix.json"));
      assert.equal(wasmPaths.matrixMD, path.join(projectRoot, "dist", "wasm-kernel-matrix.md"));
      assert.equal(wasmPaths.smokeJSON, path.join(projectRoot, "dist", "wasm-kernel-smoke.json"));
      assert.equal(wasmPaths.smokeLatestJSON, path.join(projectRoot, "dist", "wasm-kernel-smoke", "latest.json"));
      assert.equal(wasmPaths.performanceJSON, path.join(projectRoot, "dist", "wasm-kernel-performance.json"));
      assert.equal(wasmPaths.disabledContractJSON, path.join(projectRoot, "dist", "wasm-kernel-disabled-contract.json"));
      assert.equal(wasmPaths.disabledContractLatestJSON, path.join(projectRoot, "dist", "wasm-kernel-disabled-contract", "latest.json"));
      assert.equal(wasmPaths.scenarioLastRunJSON, path.join(projectRoot, "dist", "zotero-scenario-last-run.json"));
    }
    finally {
      if (previous !== undefined) {
        process.env.AGENT_ARTIFACTS_DIR = previous;
      }
    }
  });

  it("should resolve scenario-specific wasm artifact paths without changing the default probe aliases", () => {
    const probeScenarioPaths = resolveZoteroWasmKernelScenarioArtifacts(projectRoot, "wasm kernel probe diagnostics");
    const digestScenarioPaths = resolveZoteroWasmKernelScenarioArtifacts(projectRoot, "wasm kernel digest diagnostics");

    assert.equal(resolveWasmKernelScenarioArtifactKey("wasm kernel probe diagnostics"), "probe");
    assert.equal(resolveWasmKernelScenarioArtifactKey("wasm kernel digest diagnostics"), "digest");
    assert.equal(probeScenarioPaths.isDefaultScenario, true);
    assert.equal(probeScenarioPaths.smokeJSON, path.join(projectRoot, "dist", "wasm-kernel-probe-smoke.json"));
    assert.equal(probeScenarioPaths.performanceJSON, path.join(projectRoot, "dist", "wasm-kernel-probe-performance.json"));
    assert.equal(probeScenarioPaths.disabledContractJSON, path.join(projectRoot, "dist", "wasm-kernel-probe-disabled-contract.json"));
    assert.equal(digestScenarioPaths.isDefaultScenario, false);
    assert.equal(digestScenarioPaths.smokeJSON, path.join(projectRoot, "dist", "wasm-kernel-digest-smoke.json"));
    assert.equal(digestScenarioPaths.smokeLatestJSON, path.join(projectRoot, "dist", "wasm-kernel-smoke", "digest", "latest.json"));
    assert.equal(digestScenarioPaths.performanceJSON, path.join(projectRoot, "dist", "wasm-kernel-digest-performance.json"));
    assert.equal(digestScenarioPaths.performanceLatestJSON, path.join(projectRoot, "dist", "wasm-kernel-performance", "digest", "latest.json"));
    assert.equal(digestScenarioPaths.disabledContractJSON, path.join(projectRoot, "dist", "wasm-kernel-digest-disabled-contract.json"));
    assert.equal(digestScenarioPaths.disabledContractLatestJSON, path.join(projectRoot, "dist", "wasm-kernel-disabled-contract", "digest", "latest.json"));
  });

  it("should resolve custom artifact paths when AGENT_ARTIFACTS_DIR is set", () => {
    const previous = process.env.AGENT_ARTIFACTS_DIR;
    process.env.AGENT_ARTIFACTS_DIR = "/tmp/custom-artifacts";
    try {
      const e2ePaths = resolveZoteroE2EArtifacts(projectRoot);
      const debugProbePaths = resolveZoteroDebugProbeArtifacts(projectRoot);
      const autofixPaths = resolveZoteroAutofixArtifacts(projectRoot);
      const loopPaths = resolveZoteroLoopArtifacts(projectRoot);
      const recoveryPaths = resolveZoteroWatchRecoveryArtifacts(projectRoot);
      const wasmPaths = resolveZoteroWasmKernelArtifacts(projectRoot);
      assert.equal(e2ePaths.reportJSON, "/tmp/custom-artifacts/agent-zotero-e2e.json");
      assert.equal(e2ePaths.assetsDir, "/tmp/custom-artifacts/agent-zotero-e2e-assets");
      assert.equal(debugProbePaths.reportJSON, "/tmp/custom-artifacts/agent-zotero-debug-probe.json");
      assert.equal(debugProbePaths.reportMD, "/tmp/custom-artifacts/agent-zotero-debug-probe.md");
      assert.equal(autofixPaths.e2eReportJSON, "/tmp/custom-artifacts/agent-zotero-e2e.json");
      assert.equal(autofixPaths.e2eReportMD, "/tmp/custom-artifacts/agent-zotero-e2e.md");
      assert.equal(autofixPaths.reportJSON, "/tmp/custom-artifacts/agent-zotero-autofix.json");
      assert.equal(autofixPaths.historyDir, "/tmp/custom-artifacts/agent-zotero-autofix-history");
      assert.equal(autofixPaths.historyLatestJSON, "/tmp/custom-artifacts/agent-zotero-autofix-history/latest.json");
      assert.equal(loopPaths.reportMD, "/tmp/custom-artifacts/agent-zotero-loop.md");
      assert.equal(recoveryPaths.watchStatusJSON, "/tmp/custom-artifacts/zotero-watch-status.json");
      assert.equal(recoveryPaths.reportMD, "/tmp/custom-artifacts/zotero-watch-recovery-regression.md");
      assert.equal(wasmPaths.matrixJSON, "/tmp/custom-artifacts/wasm-kernel-matrix.json");
      assert.equal(wasmPaths.matrixMD, "/tmp/custom-artifacts/wasm-kernel-matrix.md");
      assert.equal(wasmPaths.smokeJSON, "/tmp/custom-artifacts/wasm-kernel-smoke.json");
      assert.equal(wasmPaths.performanceMD, "/tmp/custom-artifacts/wasm-kernel-performance.md");
      assert.equal(wasmPaths.disabledContractMD, "/tmp/custom-artifacts/wasm-kernel-disabled-contract.md");
      assert.equal(wasmPaths.scenarioLastRunMD, "/tmp/custom-artifacts/zotero-scenario-last-run.md");
    }
    finally {
      if (previous === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previous;
      }
    }
  });
});
