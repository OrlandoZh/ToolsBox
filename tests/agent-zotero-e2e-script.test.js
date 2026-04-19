import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./test-framework.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

describe("Agent Zotero E2E Script", () => {
  it("should write a failure report when argument parsing fails before runtime startup", () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-agent-e2e-artifacts-"));

    try {
      const result = spawnSync("node", ["scripts/agent-zotero-e2e.mjs", "--strategy", "invalid"], {
        cwd: projectRoot,
        stdio: "pipe",
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
        },
      });

      assert.equal(result.status, 1);
      const reportPath = path.join(artifactsDir, "agent-zotero-e2e.json");
      assert.ok(fs.existsSync(reportPath), "expected failure report to be written");
      const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
      assert.equal(report.failedStage, "parse-args");
      assert.equal(report.errorCategory, "args");
      assert.ok(String(report.errorMessage || "").includes("strategy must be one of"));
      assert.deepEqual(report.cycles, []);
      assert.equal(report.strategy, null);
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  it("should reject unknown probe modes before runtime startup", () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanroom-agent-e2e-artifacts-"));

    try {
      const result = spawnSync("node", ["scripts/agent-zotero-e2e.mjs", "--probe-mode", "invalid"], {
        cwd: projectRoot,
        stdio: "pipe",
        encoding: "utf-8",
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactsDir,
        },
      });

      assert.equal(result.status, 1);
      const reportPath = path.join(artifactsDir, "agent-zotero-e2e.json");
      assert.ok(fs.existsSync(reportPath), "expected failure report to be written");
      const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
      assert.equal(report.failedStage, "parse-args");
      assert.equal(report.errorCategory, "args");
      assert.ok(String(report.errorMessage || "").includes("probe-mode must be one of"));
      assert.equal(report.probeMode, null);
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });
});
