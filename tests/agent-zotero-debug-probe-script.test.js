import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

describe("Agent Zotero Debug Probe Script", () => {
  it("should write a failure report when argument parsing fails", () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-agent-debug-probe-artifacts-"));

    try {
      const result = spawnSync("node", ["scripts/agent-zotero-debug-probe.mjs", "--mode", "invalid"], {
        cwd: projectRoot,
        stdio: "pipe",
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
        },
      });

      assert.equal(result.status, 1);
      const reportPath = path.join(artifactsDir, "agent-zotero-debug-probe.json");
      assert.ok(fs.existsSync(reportPath), "expected failure report to be written");
      const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
      assert.equal(report.failedStage, "parse-args");
      assert.equal(report.errorCategory, "args");
      assert.ok(String(report.errorMessage || "").includes("mode must be one of"));
      assert.deepEqual(report.executed, []);
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });
});
