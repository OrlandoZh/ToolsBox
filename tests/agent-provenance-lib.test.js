import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  cleanProvenanceSensitiveArtifacts,
  evaluateArtifactProvenance,
  resolveProvenanceSensitiveArtifactPaths,
} from "../scripts/agent-provenance-lib.mjs";

const projectRoot = path.resolve(".");

async function withTempArtifactsDir(run) {
  const previousArtifacts = process.env.AGENT_ARTIFACTS_DIR;
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-provenance-artifacts-"));
  process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
  try {
    return await run(artifactsDir);
  } finally {
    if (previousArtifacts === undefined) {
      delete process.env.AGENT_ARTIFACTS_DIR;
    } else {
      process.env.AGENT_ARTIFACTS_DIR = previousArtifacts;
    }
    fs.rmSync(artifactsDir, { recursive: true, force: true });
  }
}

describe("Agent Provenance", () => {
  it("should pass when run records stay within project root", async () => {
    await withTempArtifactsDir(async () => {
      const report = await evaluateArtifactProvenance(projectRoot, [
        {
          runName: "check",
          cwd: projectRoot,
        },
      ], { env: process.env });

      assert.equal(report.violation, false);
      assert.equal(report.runRecords.outOfProjectCount, 0);
    });
  });

  it("should fail when run records come from external project", async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-provenance-outside-"));
    try {
      await withTempArtifactsDir(async () => {
        const report = await evaluateArtifactProvenance(projectRoot, [
          {
            runName: "check",
            cwd: outsideDir,
          },
        ], { env: process.env });

        assert.equal(report.violation, true);
        assert.equal(report.runRecords.outOfProjectCount, 1);
      });
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("should allow external provenance when AGENT_ALLOW_CROSS_PROJECT_ARTIFACTS=1", async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-provenance-allow-"));
    const previous = process.env.AGENT_ALLOW_CROSS_PROJECT_ARTIFACTS;
    process.env.AGENT_ALLOW_CROSS_PROJECT_ARTIFACTS = "1";
    try {
      await withTempArtifactsDir(async () => {
        const report = await evaluateArtifactProvenance(projectRoot, [
          {
            runName: "check",
            cwd: outsideDir,
          },
        ], { env: process.env });

        assert.equal(report.allowCrossProject, true);
        assert.equal(report.violation, false);
        assert.equal(report.status, "cross-project-bypassed");
      });
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_ALLOW_CROSS_PROJECT_ARTIFACTS;
      } else {
        process.env.AGENT_ALLOW_CROSS_PROJECT_ARTIFACTS = previous;
      }
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("should detect external delegation invocation paths", async () => {
    const tmpArtifacts = fs.mkdtempSync(path.join(os.tmpdir(), "agent-provenance-delegation-"));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-provenance-delegation-outside-"));
    const previousArtifacts = process.env.AGENT_ARTIFACTS_DIR;
    process.env.AGENT_ARTIFACTS_DIR = tmpArtifacts;
    try {
      const taskDir = path.join(tmpArtifacts, "agent-delegation", "TASK-OUTSIDE");
      fs.mkdirSync(taskDir, { recursive: true });
      fs.writeFileSync(path.join(taskDir, "invocation.json"), JSON.stringify({
        cwd: outsideDir,
        args: [
          "run",
          "--artifact-base",
          path.join(outsideDir, "dist", "agent-delegation", "TASK-OUTSIDE"),
        ],
      }, null, 2));

      const report = await evaluateArtifactProvenance(projectRoot, [], { env: process.env });
      assert.equal(report.violation, true);
      assert.equal(report.delegation.outOfProjectCwdCount, 1);
      assert.equal(report.delegation.outOfProjectArtifactBaseCount, 1);
    } finally {
      if (previousArtifacts === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifacts;
      }
      fs.rmSync(tmpArtifacts, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("should expose cleanup targets for provenance-sensitive artifacts", () => {
    const targets = resolveProvenanceSensitiveArtifactPaths(projectRoot);
    assert.ok(Array.isArray(targets));
    assert.ok(targets.some((item) => item.endsWith(path.join("dist", "agent-runs"))));
    assert.ok(targets.some((item) => item.endsWith(path.join("dist", "agent-delegation"))));
    assert.ok(targets.some((item) => item.endsWith(path.join("dist", "agent-obsidian-handoff.json"))));
  });

  it("should clean provenance-sensitive artifacts", async () => {
    const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-provenance-cleanup-"));
    try {
      fs.mkdirSync(path.join(artifactRoot, "dist", "agent-runs"), { recursive: true });
      fs.mkdirSync(path.join(artifactRoot, "dist", "agent-delegation", "TASK-1"), { recursive: true });
      fs.writeFileSync(path.join(artifactRoot, "dist", "agent-memory.json"), "{}\n", "utf-8");
      fs.writeFileSync(path.join(artifactRoot, "dist", "agent-monitor.json"), "{}\n", "utf-8");

      const cleaned = await cleanProvenanceSensitiveArtifacts(artifactRoot);
      assert.ok(cleaned.some((item) => item.endsWith(path.join("dist", "agent-runs"))));
      assert.equal(fs.existsSync(path.join(artifactRoot, "dist", "agent-runs")), false);
      assert.equal(fs.existsSync(path.join(artifactRoot, "dist", "agent-delegation")), false);
      assert.equal(fs.existsSync(path.join(artifactRoot, "dist", "agent-memory.json")), false);
      assert.equal(fs.existsSync(path.join(artifactRoot, "dist", "agent-monitor.json")), false);
    } finally {
      fs.rmSync(artifactRoot, { recursive: true, force: true });
    }
  });
});
