import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it, assert } from "./test-framework.js";

const projectRoot = path.resolve(".");

describe("Agent Zotero Curated PDF Script", () => {
  it("should write a failure report when the curated manifest is missing", () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-agent-curated-pdf-artifacts-"));
    const missingManifestPath = path.join(os.tmpdir(), `missing-curated-${Date.now()}.json`);

    try {
      const result = spawnSync("node", ["scripts/agent-zotero-curated-pdf.mjs", "--manifest", missingManifestPath], {
        cwd: projectRoot,
        stdio: "pipe",
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
        },
      });

      assert.equal(result.status, 1);
      const reportPath = path.join(artifactsDir, "agent-zotero-curated-pdf.json");
      assert.ok(fs.existsSync(reportPath), "expected failure report to be written");
      const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
      assert.equal(report.failedStage, "read-curated-manifest");
      assert.equal(report.errorCategory, "environment");
      assert.equal(report.manifestPath, missingManifestPath);
      assert.ok(String(report.errorMessage || "").includes("Missing JSON file"));
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });
});
