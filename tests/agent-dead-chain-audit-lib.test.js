import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, afterEach, assert } from "./test-framework.js";
import { runAgentDeadChainAudit } from "../scripts/agent-dead-chain-audit-lib.mjs";

const tempRoots = [];

function createTempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeText(root, relativePath, content) {
  const targetPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf-8");
  return targetPath;
}

function writeJSON(root, relativePath, payload) {
  writeText(root, relativePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function initGitBaseline(root) {
  execFileSync("git", ["init"], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.name", "Codex Test"], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["config", "user.email", "codex@example.com"], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["add", "."], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync("git", ["commit", "-m", "fixture"], {
    cwd: root,
    stdio: "pipe",
  });
}

function currentTruthDocument(options = {}) {
  const summary = [
    "- 当前主线为 `ENG-HIGH-104 / ENG-LOW-211~213`",
    `- 当前 active expansion wave: \`${options.currentWaveName || "ZOTERO-DOM-CONTRACT-WAVE-001"}\``,
    `- acceptance track: \`${options.acceptanceTrack || "host-first -> action replay -> route-aware dom contract -> advisory summary"}\``,
  ].join("\n");
  const meta = {
    activeBatchId: "ENG-HIGH-104 / ENG-LOW-211~213",
    currentWaveName: options.currentWaveName || "ZOTERO-DOM-CONTRACT-WAVE-001",
    acceptanceTrack: options.acceptanceTrack || "host-first -> action replay -> route-aware dom contract -> advisory summary",
  };

  return [
    "# 当前剩余任务清单",
    "",
    "## 当前单一事实源",
    "",
    "<!-- CURRENT-TRUTH-SUMMARY:START -->",
    summary,
    "<!-- CURRENT-TRUTH-SUMMARY:END -->",
    "<!-- CURRENT-TRUTH-META:START -->",
    JSON.stringify(meta, null, 2),
    "<!-- CURRENT-TRUTH-META:END -->",
    "",
  ].join("\n");
}

function createAuditFixture(options = {}) {
  const root = createTempRoot("addontemplate-dead-chain-audit-");
  writeText(root, "docs/CURRENT_BACKLOG.md", currentTruthDocument());
  writeJSON(root, "config/project-expansion-wave.json", {
    currentWaveName: "ZOTERO-DOM-CONTRACT-WAVE-001",
    acceptanceTrack: "host-first -> action replay -> route-aware dom contract -> advisory summary",
    inScopeModules: ["preference-pane-dom-contract", "item-pane-dom-contract", "reader-dom-contract"],
    outOfScopeModules: ["release-remote-distribution"],
  });
  writeJSON(root, "package.json", {
    name: "fixture",
    private: true,
    type: "module",
    scripts: {
      good: "node scripts/good.mjs",
      ...(options.packageScripts || {}),
    },
  });
  writeText(root, "scripts/good.mjs", "export const good = true;\n");
  writeText(root, "README.md", options.readmeContent || "[Current Truth](docs/CURRENT_BACKLOG.md)\n");
  writeText(root, "AGENTS.md", "[Agent Index](docs/CURRENT_BACKLOG.md)\n");
  writeJSON(root, "config/agent-delegation-tasks.json", {
    schemaVersion: 1,
    tasks: options.delegationTasks || [
      {
        taskId: "LIVE-001",
        title: "Live task",
        lane: "codex-architecture-planning",
        scopePaths: ["scripts/good.mjs"],
        testCommands: [],
      },
    ],
  });
  writeJSON(root, "config/framework-backfill-bundles.json", {
    schemaVersion: 1,
    bundles: options.frameworkBundles || [],
  });
  initGitBaseline(root);
  return root;
}

describe("agent-dead-chain-audit-lib", () => {
  afterEach(() => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root && fs.existsSync(root)) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("should summarize the current trunk and stay clean when no findings are present", async () => {
    const root = createAuditFixture();

    const report = await runAgentDeadChainAudit({ projectRoot: root });

    assert.equal(report.status, "clean");
    assert.equal(report.trunk.activeBatchId, "ENG-HIGH-104 / ENG-LOW-211~213");
    assert.equal(report.trunk.currentWaveName, "ZOTERO-DOM-CONTRACT-WAVE-001");
    assert.deepEqual(report.trunk.inScopeModules, [
      "item-pane-dom-contract",
      "preference-pane-dom-contract",
      "reader-dom-contract",
    ]);
    assert.equal(report.findings.totalCount, 0);
    assert.ok(fs.existsSync(path.join(root, "dist", "agent-dead-chain-audit.json")));
    assert.ok(fs.existsSync(path.join(root, "dist", "agent-dead-chain-audit.md")));
  });

  it("should detect missing script targets and broken npm script references", async () => {
    const root = createAuditFixture({
      packageScripts: {
        "broken-target": "node scripts/missing.mjs",
        "broken-ref": "npm run not:defined",
      },
    });

    const report = await runAgentDeadChainAudit({ projectRoot: root });

    assert.equal(report.status, "warning");
    assert.equal(report.findings.hardDeadCount, 2);
    assert.ok(report.items.some((item) => item.kind === "missing-script-target"));
    assert.ok(report.items.some((item) => item.kind === "missing-npm-script-ref"));
  });

  it("should detect broken markdown links as hard dead chains", async () => {
    const root = createAuditFixture({
      readmeContent: "[Missing](docs/DOES_NOT_EXIST.md)\n",
    });

    const report = await runAgentDeadChainAudit({ projectRoot: root });

    assert.equal(report.status, "warning");
    assert.ok(report.items.some((item) => item.kind === "missing-doc-link"));
  });

  it("should ignore fenced code blocks when checking markdown links", async () => {
    const root = createAuditFixture({
      readmeContent: [
        "```ts",
        "items = filterFunctions[i](items);",
        "```",
        "",
        "[Current Truth](docs/CURRENT_BACKLOG.md)",
        "",
      ].join("\n"),
    });

    const report = await runAgentDeadChainAudit({ projectRoot: root });

    assert.equal(report.status, "clean");
    assert.ok(!report.items.some((item) => item.kind === "missing-doc-link"));
  });

  it("should classify stale delegation tasks and superseded bundles as advisory retired chains", async () => {
    const root = createAuditFixture({
      delegationTasks: [
        {
          taskId: "HISTORY-001",
          title: "Historical task",
          lane: "codex-architecture-planning",
          scopePaths: ["scripts/missing-task-target.mjs"],
          testCommands: [],
        },
      ],
      frameworkBundles: [
        {
          id: "validation-decision-v1",
          lifecycle: "superseded",
          supersededBy: "validation-decision-v2",
          summary: "legacy visual decision rule",
        },
      ],
    });

    const report = await runAgentDeadChainAudit({ projectRoot: root });

    assert.equal(report.status, "advisory");
    assert.equal(report.statusLabel, "建议收口");
    assert.equal(report.findings.retiredChainCount, 2);
    assert.equal(report.findings.actionableRetiredChainCount, 1);
    assert.equal(report.findings.historyRetainedCount, 1);
    assert.equal(report.findings.supersededBundleCount, 1);
    assert.equal(report.findings.safeDeleteCandidateCount, 1);
    assert.match(report.summary, /delegation 历史链候选/u);
    assert.match(report.summary, /历史治理保留项/u);
    assert.ok(report.items.some((item) => item.kind === "stale-delegation-task" && item.safeDeleteCandidate === true));
    assert.ok(report.items.some((item) => item.kind === "superseded-framework-bundle"));
  });

  it("should mark superseded bundle only findings as history-retained advisory", async () => {
    const root = createAuditFixture({
      frameworkBundles: [
        {
          id: "validation-decision-v1",
          lifecycle: "superseded",
          supersededBy: "validation-decision-v2",
          summary: "legacy visual decision rule",
        },
      ],
    });

    const report = await runAgentDeadChainAudit({ projectRoot: root });

    assert.equal(report.status, "advisory");
    assert.equal(report.statusLabel, "历史保留");
    assert.equal(report.findings.retiredChainCount, 1);
    assert.equal(report.findings.actionableRetiredChainCount, 0);
    assert.equal(report.findings.historyRetainedCount, 1);
    assert.equal(report.findings.supersededBundleCount, 1);
    assert.equal(report.prunePlan?.nextWave, null);
    assert.equal(report.prunePlan?.nextWaveProposal, null);
    assert.match(report.summary, /没有待收缩的 delegation 历史链/u);
    assert.match(report.summary, /superseded framework bundle/u);
    assert.equal(report.items?.[0]?.kind, "superseded-framework-bundle");
  });

  it("should classify history-only delegation tasks as retired chains even when scope paths still exist", async () => {
    const root = createAuditFixture({
      delegationTasks: [
        {
          taskId: "HISTORY-ONLY-001",
          title: "冻结旧链路（历史契约源）",
          lane: "codex-architecture-planning",
          scopePaths: ["scripts/good.mjs"],
          promptTemplate: "该任务仅供 Codex 跟踪。当前仅作为历史契约源保留，不再作为 active 主线。",
          reviewChecklist: [],
          testCommands: [],
        },
      ],
    });

    const report = await runAgentDeadChainAudit({ projectRoot: root });

    assert.equal(report.status, "advisory");
    assert.equal(report.statusLabel, "建议收口");
    assert.equal(report.findings.retiredChainCount, 1);
    assert.equal(report.findings.actionableRetiredChainCount, 1);
    assert.equal(report.findings.historyRetainedCount, 0);
    assert.equal(report.findings.safeDeleteCandidateCount, 0);
    assert.equal(report.prunePlan?.leafReviewCandidateCount, 1);
    assert.equal(report.prunePlan?.blockedByActiveCount, 0);
    assert.equal(report.prunePlan?.nextWave?.waveId, "retired-leaf-review");
    assert.equal(report.prunePlan?.nextWaveProposal?.action, "review-and-remove-task-ids");
    assert.deepEqual(report.prunePlan?.nextWaveProposal?.removeTaskIds, ["HISTORY-ONLY-001"]);
    assert.equal(report.prunePlan?.reviewWaves?.[0]?.candidateCount, 1);
    assert.ok(report.items.some((item) =>
      item.kind === "retired-delegation-task"
        && item.owner === "HISTORY-ONLY-001"
        && item.dependencyState === "retired-leaf"
        && item.safeDeleteCandidate === false
        && String(item.evidence || "").includes("历史契约源"),
    ));
  });

  it("should expose dependency state for retired delegation tasks", async () => {
    const root = createAuditFixture({
      delegationTasks: [
        {
          taskId: "RETIRED-ROOT",
          title: "退休根任务（历史契约源）",
          lane: "codex-architecture-planning",
          scopePaths: ["scripts/good.mjs"],
          promptTemplate: "该任务当前仅作为历史契约源保留。",
          reviewChecklist: [],
          testCommands: [],
        },
        {
          taskId: "ACTIVE-CHILD",
          title: "Active child",
          lane: "codex-architecture-planning",
          scopePaths: ["scripts/good.mjs"],
          dependsOn: ["RETIRED-ROOT"],
          reviewChecklist: [],
          testCommands: [],
        },
        {
          taskId: "RETIRED-CHILD",
          title: "Retired child（历史契约源）",
          lane: "codex-architecture-planning",
          scopePaths: ["scripts/good.mjs"],
          dependsOn: ["RETIRED-ROOT"],
          promptTemplate: "该任务已完成并仅保留为历史工件。",
          reviewChecklist: [],
          testCommands: [],
        },
      ],
    });

    const report = await runAgentDeadChainAudit({ projectRoot: root });
    const rootFinding = report.items.find((item) => item.owner === "RETIRED-ROOT");
    const childFinding = report.items.find((item) => item.owner === "RETIRED-CHILD");

    assert.equal(report.status, "advisory");
    assert.equal(rootFinding?.kind, "retired-delegation-task");
    assert.equal(rootFinding?.dependencyState, "referenced-by-active");
    assert.deepEqual(rootFinding?.activeDependentIds, ["ACTIVE-CHILD"]);
    assert.deepEqual(rootFinding?.retiredDependentIds, ["RETIRED-CHILD"]);
    assert.match(String(rootFinding?.recommendedAction || ""), /active task/u);
    assert.equal(childFinding?.dependencyState, "retired-leaf");
    assert.equal(report.prunePlan?.leafReviewCandidateCount, 1);
    assert.equal(report.prunePlan?.blockedByActiveCount, 1);
    assert.equal(report.prunePlan?.retiredChainOnlyCount, 0);
    assert.equal(report.prunePlan?.nextWave?.waveId, "retired-leaf-review");
    assert.equal(report.prunePlan?.nextWaveProposal?.action, "review-and-remove-task-ids");
    assert.deepEqual(report.prunePlan?.nextWaveProposal?.removeTaskIds, ["RETIRED-CHILD"]);
    assert.deepEqual(report.prunePlan?.blockedByActiveCandidates?.map((item) => item.taskId), ["RETIRED-ROOT"]);
    assert.deepEqual(report.prunePlan?.leafReviewCandidates?.map((item) => item.taskId), ["RETIRED-CHILD"]);
  });

  it("should propose chain-collapse bridges for retired-only history segments", async () => {
    const root = createAuditFixture({
      delegationTasks: [
        {
          taskId: "UPSTREAM-ROOT",
          title: "Upstream root",
          lane: "codex-architecture-planning",
          scopePaths: ["scripts/good.mjs"],
          reviewChecklist: [],
          testCommands: [],
        },
        {
          taskId: "RETIRED-BRIDGE-1",
          title: "Retired bridge 1（历史契约源）",
          lane: "codex-architecture-planning",
          scopePaths: ["scripts/good.mjs"],
          dependsOn: ["UPSTREAM-ROOT"],
          promptTemplate: "该任务当前仅作为历史契约源保留。",
          reviewChecklist: [],
          testCommands: [],
        },
        {
          taskId: "RETIRED-BRIDGE-2",
          title: "Retired bridge 2（历史契约源）",
          lane: "codex-architecture-planning",
          scopePaths: ["scripts/good.mjs"],
          dependsOn: ["RETIRED-BRIDGE-1"],
          promptTemplate: "该任务已完成并仅保留为历史工件。",
          reviewChecklist: [],
          testCommands: [],
        },
        {
          taskId: "RETIRED-BOUNDARY",
          title: "Retired boundary（历史契约源）",
          lane: "codex-architecture-planning",
          scopePaths: ["scripts/good.mjs"],
          dependsOn: ["RETIRED-BRIDGE-2"],
          promptTemplate: "该任务当前仅作为历史契约源保留。",
          reviewChecklist: [],
          testCommands: [],
        },
        {
          taskId: "ACTIVE-CHILD",
          title: "Active child",
          lane: "codex-architecture-planning",
          scopePaths: ["scripts/good.mjs"],
          dependsOn: ["RETIRED-BOUNDARY"],
          reviewChecklist: [],
          testCommands: [],
        },
      ],
    });

    const report = await runAgentDeadChainAudit({ projectRoot: root });
    const proposal = report.prunePlan?.chainCollapseProposals?.[0];

    assert.equal(report.status, "advisory");
    assert.equal(report.prunePlan?.leafReviewCandidateCount, 0);
    assert.equal(report.prunePlan?.retiredChainOnlyCount, 2);
    assert.equal(report.prunePlan?.blockedByActiveCount, 1);
    assert.equal(report.prunePlan?.nextWave?.waveId, "retired-chain-review");
    assert.equal(report.prunePlan?.nextWaveProposal?.action, "review-chain-collapse");
    assert.equal(report.prunePlan?.chainCollapseProposalCount, 1);
    assert.deepEqual(proposal?.removableTaskIds, ["RETIRED-BRIDGE-1", "RETIRED-BRIDGE-2"]);
    assert.deepEqual(proposal?.upstreamAnchorTaskIds, ["UPSTREAM-ROOT"]);
    assert.deepEqual(proposal?.downstreamBoundaryTaskIds, ["RETIRED-BOUNDARY"]);
    assert.equal(proposal?.suggestedDependencyRewrites?.[0]?.taskId, "RETIRED-BOUNDARY");
    assert.deepEqual(proposal?.suggestedDependencyRewrites?.[0]?.replaceDependencyTaskIds, ["RETIRED-BRIDGE-2"]);
    assert.deepEqual(proposal?.suggestedDependencyRewrites?.[0]?.suggestedDependencyTaskIds, ["UPSTREAM-ROOT"]);
    assert.equal(report.prunePlan?.nextWaveProposal?.chainCollapseProposals?.[0]?.proposalId, proposal?.proposalId);
  });

  it("should respect AGENT_ARTIFACTS_DIR for dead-chain audit artifacts", async () => {
    const root = createAuditFixture();
    const customArtifactsDir = path.join(root, "tmp-artifacts");
    const previous = process.env.AGENT_ARTIFACTS_DIR;
    process.env.AGENT_ARTIFACTS_DIR = customArtifactsDir;
    try {
      await runAgentDeadChainAudit({ projectRoot: root });
      assert.ok(fs.existsSync(path.join(customArtifactsDir, "agent-dead-chain-audit.json")));
      assert.ok(fs.existsSync(path.join(customArtifactsDir, "agent-dead-chain-audit.md")));
      assert.equal(fs.existsSync(path.join(root, "dist", "agent-dead-chain-audit.json")), false);
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_ARTIFACTS_DIR;
      } else {
        process.env.AGENT_ARTIFACTS_DIR = previous;
      }
    }
  });
});
