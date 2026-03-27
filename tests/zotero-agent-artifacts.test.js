import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  resolveZoteroAutofixArtifacts,
  resolveZoteroE2EArtifacts,
  resolveZoteroLoopArtifacts,
  resolveZoteroWatchRecoveryArtifacts,
} from "../scripts/zotero-agent-artifacts.mjs";

const projectRoot = "/tmp/addon-template";

describe("Zotero Agent Artifacts", () => {
  it("should resolve default artifact paths under dist", () => {
    const previous = process.env.AGENT_ARTIFACTS_DIR;
    delete process.env.AGENT_ARTIFACTS_DIR;
    try {
      const e2ePaths = resolveZoteroE2EArtifacts(projectRoot);
      const autofixPaths = resolveZoteroAutofixArtifacts(projectRoot);
      const loopPaths = resolveZoteroLoopArtifacts(projectRoot);
      const recoveryPaths = resolveZoteroWatchRecoveryArtifacts(projectRoot);
      assert.equal(e2ePaths.artifactsDir, path.join(projectRoot, "dist"));
      assert.equal(e2ePaths.reportJSON, path.join(projectRoot, "dist", "agent-zotero-e2e.json"));
      assert.equal(e2ePaths.assetsDir, path.join(projectRoot, "dist", "agent-zotero-e2e-assets"));
      assert.equal(autofixPaths.e2eReportMD, path.join(projectRoot, "dist", "agent-zotero-e2e.md"));
      assert.equal(autofixPaths.reportMD, path.join(projectRoot, "dist", "agent-zotero-autofix.md"));
      assert.equal(autofixPaths.historyDir, path.join(projectRoot, "dist", "agent-zotero-autofix-history"));
      assert.equal(autofixPaths.historyLatestJSON, path.join(projectRoot, "dist", "agent-zotero-autofix-history", "latest.json"));
      assert.equal(loopPaths.reportJSON, path.join(projectRoot, "dist", "agent-zotero-loop.json"));
      assert.equal(recoveryPaths.watchStatusJSON, path.join(projectRoot, "dist", "zotero-watch-status.json"));
    }
    finally {
      if (previous !== undefined) {
        process.env.AGENT_ARTIFACTS_DIR = previous;
      }
    }
  });

  it("should resolve custom artifact paths when AGENT_ARTIFACTS_DIR is set", () => {
    const previous = process.env.AGENT_ARTIFACTS_DIR;
    process.env.AGENT_ARTIFACTS_DIR = "/tmp/custom-artifacts";
    try {
      const e2ePaths = resolveZoteroE2EArtifacts(projectRoot);
      const autofixPaths = resolveZoteroAutofixArtifacts(projectRoot);
      const loopPaths = resolveZoteroLoopArtifacts(projectRoot);
      const recoveryPaths = resolveZoteroWatchRecoveryArtifacts(projectRoot);
      assert.equal(e2ePaths.reportJSON, "/tmp/custom-artifacts/agent-zotero-e2e.json");
      assert.equal(e2ePaths.assetsDir, "/tmp/custom-artifacts/agent-zotero-e2e-assets");
      assert.equal(autofixPaths.e2eReportJSON, "/tmp/custom-artifacts/agent-zotero-e2e.json");
      assert.equal(autofixPaths.e2eReportMD, "/tmp/custom-artifacts/agent-zotero-e2e.md");
      assert.equal(autofixPaths.reportJSON, "/tmp/custom-artifacts/agent-zotero-autofix.json");
      assert.equal(autofixPaths.historyDir, "/tmp/custom-artifacts/agent-zotero-autofix-history");
      assert.equal(autofixPaths.historyLatestJSON, "/tmp/custom-artifacts/agent-zotero-autofix-history/latest.json");
      assert.equal(loopPaths.reportMD, "/tmp/custom-artifacts/agent-zotero-loop.md");
      assert.equal(recoveryPaths.watchStatusJSON, "/tmp/custom-artifacts/zotero-watch-status.json");
      assert.equal(recoveryPaths.reportMD, "/tmp/custom-artifacts/zotero-watch-recovery-regression.md");
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
