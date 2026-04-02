import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import { evaluateWorkspaceInitGuard } from "../scripts/agent-workspace-guard-lib.mjs";

describe("Agent Workspace Guard", () => {
  it("should warn when init-workspace report is missing", async () => {
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workspace-guard-missing-"));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workspace-project-"));

    try {
      const result = await evaluateWorkspaceInitGuard(projectRoot, {
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactRoot,
        },
      });

      assert.equal(result.status, "missing-init-report");
      assert.equal(result.ok, true);
      assert.equal(result.violation, true);
      assert.ok(String(result.recommendation || "").includes("init:workspace"));
    } finally {
      fs.rmSync(artifactRoot, { recursive: true, force: true });
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("should fail strict guard when init-workspace report belongs to another project", async () => {
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workspace-guard-mismatch-"));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workspace-project-"));
    const otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workspace-other-"));
    const reportPath = path.join(artifactRoot, "init-workspace.json");

    try {
      fs.writeFileSync(reportPath, `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        success: true,
        projectRoot: otherRoot,
        projectRootCanonical: otherRoot,
        cleanedWorkspaceDir: path.join(otherRoot, "obsidian", "agent-workbench"),
      }, null, 2)}\n`, "utf-8");

      const result = await evaluateWorkspaceInitGuard(projectRoot, {
        strict: true,
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactRoot,
        },
      });

      assert.equal(result.status, "path-mismatch");
      assert.equal(result.ok, false);
      assert.equal(result.violation, true);
    } finally {
      fs.rmSync(artifactRoot, { recursive: true, force: true });
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(otherRoot, { recursive: true, force: true });
    }
  });

  it("should accept a successful init-workspace report for the current project", async () => {
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workspace-guard-ok-"));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workspace-project-"));
    const reportPath = path.join(artifactRoot, "init-workspace.json");

    try {
      fs.writeFileSync(reportPath, `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        success: true,
        projectRoot,
        projectRootCanonical: projectRoot,
        cleanedWorkspaceDir: path.join(projectRoot, "obsidian", "agent-workbench"),
      }, null, 2)}\n`, "utf-8");

      const result = await evaluateWorkspaceInitGuard(projectRoot, {
        strict: true,
        env: {
          ...process.env,
          AGENT_ARTIFACTS_DIR: artifactRoot,
        },
      });

      assert.equal(result.status, "initialized");
      assert.equal(result.ok, true);
      assert.equal(result.violation, false);
    } finally {
      fs.rmSync(artifactRoot, { recursive: true, force: true });
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
