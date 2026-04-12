import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import { synchronizeGateAfterObsidian } from "../scripts/agent-sync.mjs";

function writeJSON(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

describe("Agent Sync", () => {
  it("should refresh gate obsidianGuard snapshot from the latest handoff", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-agent-sync-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-agent-sync-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    const artifactPath = (...parts) => path.join(artifactsDir, ...parts);

    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      const workspaceDir = path.join(root, "obsidian", "agent-workbench");
      fs.mkdirSync(workspaceDir, { recursive: true });

      writeJSON(artifactPath("agent-gate.json"), {
        generatedAt: "2026-04-07T06:47:28.130Z",
        profile: "dev",
        gatePassed: true,
        durationMs: 12,
        policy: {
          recentWindow: 10,
          zoteroE2EStaleAfterMinutes: 480,
        },
        metrics: {
          total: 1,
          passed: 1,
          failed: 0,
          passRate: 100,
          effectiveTotal: 1,
          effectivePassRate: 100,
          averageDurationMs: 12,
          recentFailed: 0,
        },
        requiredChecks: [],
        watchStatus: {
          enabled: false,
          present: false,
        },
        validationDecision: null,
        agentContext: null,
        provenance: null,
        zoteroValidation: {
          enabled: false,
        },
        releaseMatrix: {
          enabled: false,
        },
        issues: [],
        recommendations: ["当前已满足 agent 质量闸门，可继续推进后续开发或发布流程。"],
        obsidianGuard: {
          status: "within-project",
          summaryHeadline: "旧 handoff 摘要",
          summaryNextAction: "npm run zotero:watch",
          sourceAgentContextDigest: "old-context-digest",
          sourceAgentContextGeneratedAt: "2026-04-07T06:45:03.713Z",
        },
      });
      fs.writeFileSync(artifactPath("agent-gate.md"), "stale gate markdown\n", "utf-8");
      writeJSON(artifactPath("agent-obsidian-handoff.json"), {
        generatedAt: "2026-04-07T06:47:28.382Z",
        generationId: "obsidian-1775544448379",
        success: true,
        workspaceDir,
        summarySource: "gate",
        summaryStatusLabel: "可继续",
        summaryHeadline: "watch、真机验证与恢复回归均已通过，当前闭环状态稳定。",
        summaryNextAction: "当前已满足 agent 质量闸门，可继续推进后续开发或发布流程。",
        runnableNextCommand: "npm run agent:gate",
        sourceGateGeneratedAt: "2026-04-07T06:47:28.130Z",
        sourceMonitorGeneratedAt: "2026-04-07T06:47:27.977Z",
        sourceAgentContextGeneratedAt: "2026-04-07T06:47:28.145Z",
        sourceAgentContextDigest: "045c1345d80c0764",
        sourceAgentContextAlignmentStatus: "aligned",
      });

      const report = await synchronizeGateAfterObsidian(root);
      const persisted = readJSON(artifactPath("agent-gate.json"));
      const gateMarkdown = fs.readFileSync(artifactPath("agent-gate.md"), "utf-8");

      assert.equal(report.obsidianGuard.summaryHeadline, "watch、真机验证与恢复回归均已通过，当前闭环状态稳定。");
      assert.equal(report.obsidianGuard.summaryNextAction, "当前已满足 agent 质量闸门，可继续推进后续开发或发布流程。");
      assert.equal(report.obsidianGuard.sourceAgentContextDigest, "045c1345d80c0764");
      assert.equal(report.obsidianGuard.sourceAgentContextGeneratedAt, "2026-04-07T06:47:28.145Z");
      assert.equal(report.obsidianGuard.status, "within-project");
      assert.equal(persisted.obsidianGuard.summaryHeadline, report.obsidianGuard.summaryHeadline);
      assert.equal(persisted.obsidianGuard.sourceAgentContextDigest, report.obsidianGuard.sourceAgentContextDigest);
      assert.ok(gateMarkdown.includes("## Obsidian Workspace Guard"));
      assert.ok(gateMarkdown.includes(workspaceDir));
      assert.equal(gateMarkdown.includes("stale gate markdown"), false);
    } finally {
      if (previousArtifactsDir === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previousArtifactsDir;
      }
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });
});
