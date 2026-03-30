import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  assertDelegationBatchSafe,
  buildDelegationReview,
  buildMcoRunInvocation,
  loadDelegationManifest,
  renderDelegationReviewMarkdown,
  resolveDelegationManifestPath,
  resolveDelegationTaskArtifacts,
} from "../scripts/agent-delegation-lib.mjs";

const projectRoot = path.resolve(".");

describe("Agent Delegation", () => {
  it("should load the rebaselined manifest with ENG-HIGH-104 opened as the next release follow-up and READER-HIGH-126 preserved as history", async () => {
    const manifest = await loadDelegationManifest(projectRoot);

    assert.equal(manifest.schemaVersion, 1);
    assert.ok(Boolean(manifest.taskMap["P1-HIGH-001"]));
    assert.ok(Boolean(manifest.taskMap["P1-HIGH-101"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-001"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-101"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-102"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-103"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-104"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-105"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-106"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-109"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-110"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-111"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-112"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-113"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-114"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-118"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-119"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-120"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-121"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-122"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-123"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-124"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-125"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-126"]));
    assert.ok(Boolean(manifest.taskMap["ENG-HIGH-102"]));
    assert.ok(Boolean(manifest.taskMap["ENG-HIGH-103"]));
    assert.ok(Boolean(manifest.taskMap["ENG-HIGH-104"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-204"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-205"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-206"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-207"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-208"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-209"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-210"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-211"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-212"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-213"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-252"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-253"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-254"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-255"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-256"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-257"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-258"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-259"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-260"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-261"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-262"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-263"]));
    assert.ok(Boolean(manifest.taskMap["ENG-HIGH-001"]));
    assert.ok(Boolean(manifest.taskMap["ENG-HIGH-101"]));
    assert.ok(Boolean(manifest.taskMap["OBSIDIAN-HIGH-101"]));
    assert.equal(Boolean(manifest.taskMap["READER-LOW-249"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-250"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-251"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-228"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-229"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-230"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-231"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-232"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-233"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-234"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-235"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-236"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-237"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-238"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-239"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-240"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-241"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-242"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-243"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-244"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-245"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-246"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-247"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-248"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-225"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-226"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-227"]), false);
    assert.equal(Boolean(manifest.taskMap["OBSIDIAN-LOW-301"]), false);
    assert.equal(Boolean(manifest.taskMap["OBSIDIAN-LOW-302"]), false);
    assert.equal(Boolean(manifest.taskMap["OBSIDIAN-LOW-303"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-216"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-217"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-218"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-213"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-214"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-215"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-210"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-211"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-212"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-204"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-205"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-206"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-207"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-208"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-209"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-201"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-202"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-203"]), false);
    assert.equal(Boolean(manifest.taskMap["ENG-LOW-201"]), false);
    assert.equal(Boolean(manifest.taskMap["ENG-LOW-202"]), false);
    assert.equal(Boolean(manifest.taskMap["ENG-LOW-203"]), false);
    assert.equal(Boolean(manifest.taskMap["P1-LOW-001"]), false);
    assert.equal(Boolean(manifest.taskMap["P1-LOW-101"]), false);
    assert.equal(Boolean(manifest.taskMap["P1-LOW-102"]), false);
    assert.equal(Boolean(manifest.taskMap["P1-LOW-103"]), false);
    assert.equal(Boolean(manifest.taskMap["P1-LOW-201"]), false);
    assert.equal(Boolean(manifest.taskMap["P1-LOW-202"]), false);
    assert.equal(Boolean(manifest.taskMap["P1-LOW-203"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-001"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-101"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-102"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-103"]), false);
    assert.equal(Boolean(manifest.taskMap["ENG-LOW-001"]), false);
    assert.equal(Boolean(manifest.taskMap["ENG-LOW-101"]), false);
    assert.equal(Boolean(manifest.taskMap["ENG-LOW-102"]), false);
    assert.equal(Boolean(manifest.taskMap["DOC-LOW-001"]), false);
    assert.equal(Boolean(manifest.taskMap["DOC-LOW-201"]), false);
    assert.equal(manifest.taskMap["P1-HIGH-001"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-106"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-109"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-110"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-111"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-112"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-113"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-114"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-118"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-119"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-120"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-121"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-122"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-123"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-124"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-125"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["READER-HIGH-126"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["ENG-HIGH-102"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["ENG-HIGH-103"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["ENG-HIGH-104"].lane, "codex-high-logic");
    assert.equal(manifest.taskMap["ENG-LOW-204"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["ENG-LOW-205"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["ENG-LOW-206"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["ENG-LOW-207"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["ENG-LOW-208"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["ENG-LOW-209"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["ENG-LOW-210"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["ENG-LOW-211"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["ENG-LOW-212"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["ENG-LOW-213"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["READER-LOW-252"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["READER-LOW-253"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["READER-LOW-254"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["READER-LOW-255"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["READER-LOW-256"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["READER-LOW-257"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["READER-LOW-258"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["READER-LOW-259"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["READER-LOW-260"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["READER-LOW-261"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["READER-LOW-262"].lane, "opencode-low-logic");
    assert.equal(manifest.taskMap["READER-LOW-263"].lane, "opencode-low-logic");
    assert.ok(manifest.taskMap["READER-HIGH-114"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["READER-HIGH-118"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["READER-HIGH-119"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["READER-HIGH-120"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["READER-HIGH-121"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["READER-HIGH-122"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["READER-HIGH-123"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["READER-HIGH-124"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["READER-HIGH-125"].title.includes("冻结 library-only 视觉漂移根因排查边界"));
    assert.ok(manifest.taskMap["READER-HIGH-126"].title.includes("修复 library-only 真实界面回归并恢复 visual baseline 对齐"));
    assert.ok(manifest.taskMap["READER-HIGH-126"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["ENG-HIGH-103"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["ENG-HIGH-104"].title.includes("远端发布编排"));
    assert.ok(manifest.taskMap["ENG-HIGH-104"].title.includes("updateURL"));
    assert.deepEqual(manifest.taskMap["READER-LOW-252"].dependsOn, ["READER-HIGH-119"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-253"].dependsOn, ["READER-HIGH-119", "READER-LOW-252"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-254"].dependsOn, ["READER-HIGH-119", "READER-LOW-253"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-255"].dependsOn, ["READER-HIGH-120"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-256"].dependsOn, ["READER-HIGH-120", "READER-LOW-255"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-257"].dependsOn, ["READER-HIGH-120", "READER-LOW-256"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-258"].dependsOn, ["READER-HIGH-121"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-259"].dependsOn, ["READER-HIGH-121", "READER-LOW-258"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-260"].dependsOn, ["READER-HIGH-121", "READER-LOW-259"]);
    assert.deepEqual(manifest.taskMap["READER-HIGH-122"].dependsOn, ["READER-HIGH-121"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-204"].dependsOn, ["ENG-HIGH-102"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-205"].dependsOn, ["ENG-HIGH-102", "ENG-LOW-204"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-206"].dependsOn, ["ENG-HIGH-102", "ENG-LOW-205"]);
    assert.deepEqual(manifest.taskMap["ENG-HIGH-102"].dependsOn, ["READER-HIGH-122"]);
    assert.deepEqual(manifest.taskMap["READER-HIGH-123"].dependsOn, ["ENG-HIGH-102"]);
    assert.deepEqual(manifest.taskMap["ENG-HIGH-103"].dependsOn, ["READER-HIGH-123"]);
    assert.deepEqual(manifest.taskMap["READER-HIGH-124"].dependsOn, ["ENG-HIGH-103"]);
    assert.deepEqual(manifest.taskMap["READER-HIGH-125"].dependsOn, ["READER-HIGH-124"]);
    assert.deepEqual(manifest.taskMap["READER-HIGH-126"].dependsOn, ["READER-HIGH-125"]);
    assert.deepEqual(manifest.taskMap["ENG-HIGH-104"].dependsOn, ["READER-HIGH-126"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-207"].dependsOn, ["ENG-HIGH-103"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-208"].dependsOn, ["ENG-HIGH-103"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-209"].dependsOn, ["ENG-HIGH-103", "ENG-LOW-207", "ENG-LOW-208"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-210"].dependsOn, ["ENG-HIGH-103", "ENG-LOW-209"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-211"].dependsOn, ["ENG-HIGH-104"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-212"].dependsOn, ["ENG-HIGH-104", "ENG-LOW-211"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-213"].dependsOn, ["ENG-HIGH-104", "ENG-LOW-211", "ENG-LOW-212"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-261"].dependsOn, ["READER-HIGH-124"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-262"].dependsOn, ["READER-HIGH-124", "READER-LOW-261"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-263"].dependsOn, ["READER-HIGH-124", "READER-LOW-261", "READER-LOW-262"]);
    assert.equal(manifest.taskMap["ENG-LOW-207"].gitClosure.milestone, "module-feature");
    assert.equal(manifest.taskMap["ENG-LOW-207"].gitClosure.commitMessage, "feat: 基本实现 runtime 生命周期边界与时序遥测");
    assert.equal(manifest.taskMap["ENG-LOW-208"].gitClosure.milestone, "module-framework");
    assert.equal(manifest.taskMap["ENG-LOW-208"].gitClosure.commitMessage, "feat: 完成共享失败模型脚本入口模块框架搭建");
    assert.equal(manifest.taskMap["ENG-LOW-209"].gitClosure.milestone, "module-feature");
    assert.equal(manifest.taskMap["ENG-LOW-210"].gitClosure.milestone, "batch-closure");
    assert.equal(manifest.taskMap["ENG-LOW-211"].gitClosure.milestone, "module-feature");
    assert.equal(manifest.taskMap["ENG-LOW-212"].gitClosure.milestone, "module-feature");
    assert.equal(manifest.taskMap["ENG-LOW-213"].gitClosure.milestone, "batch-closure");
    assert.equal(manifest.taskMap["ENG-LOW-213"].gitClosure.commitMessage, "chore: 收口 ENG-HIGH-104 manifest、文档与守卫测试");
    assert.equal(manifest.taskMap["OBSIDIAN-HIGH-101"].lane, "codex-high-logic");
    assert.equal(manifest.tasks.some((task) => task.lane === "opencode-low-logic"), true);
  });

  it("should resolve delegation manifest and artifact paths under dist", () => {
    const manifestPath = resolveDelegationManifestPath(projectRoot);
    const artifacts = resolveDelegationTaskArtifacts(projectRoot, "READER-LOW-216");

    assert.equal(manifestPath, path.join(projectRoot, "config", "agent-delegation-tasks.json"));
    assert.equal(artifacts.baseDir, path.join(projectRoot, "dist", "agent-delegation", "READER-LOW-216"));
    assert.equal(artifacts.reviewJSON, path.join(projectRoot, "dist", "agent-delegation", "READER-LOW-216", "review.json"));
    assert.equal(artifacts.gitClosureJSON, path.join(projectRoot, "dist", "agent-delegation", "READER-LOW-216", "git-closure.json"));
  });

  it("should build strict mco invocation for opencode tasks", async () => {
    const previous = process.env.MCO_BINARY;
    delete process.env.MCO_BINARY;
    try {
      const task = {
        taskId: "DOC-LOW-SAMPLE",
        lane: "opencode-low-logic",
        scopePaths: ["README.md", "docs/CURRENT_BACKLOG.md"],
        dependsOn: ["READER-HIGH-106"],
        promptTemplate: "sample prompt",
        reviewChecklist: [],
        testCommands: [],
        handoffArtifacts: [],
      };
      const invocation = buildMcoRunInvocation(task, projectRoot);

      assert.equal(invocation.command, "mco");
      assert.includes(invocation.args, "run");
      assert.includes(invocation.args, "--providers");
      assert.includes(invocation.args, "opencode");
      assert.includes(invocation.args, "--repo");
      assert.includes(invocation.args, ".");
      assert.includes(invocation.args, "--target-paths");
      assert.includes(invocation.args, "--allow-paths");
      assert.includes(invocation.args, "--enforcement-mode");
      assert.includes(invocation.args, "strict");
      assert.includes(invocation.args, "--result-mode");
      assert.includes(invocation.args, "both");
      assert.includes(invocation.args, "--json");
      assert.includes(invocation.args, "--save-artifacts");
    }
    finally {
      if (previous !== undefined) {
        process.env.MCO_BINARY = previous;
      }
    }
  });

  it("should reject overlapping opencode batch scopes", () => {
    assert.throws(() => {
      assertDelegationBatchSafe([
        {
          taskId: "A",
          lane: "opencode-low-logic",
          scopePaths: ["scripts"],
        },
        {
          taskId: "B",
          lane: "opencode-low-logic",
          scopePaths: ["scripts/agent-monitor.mjs"],
        },
      ]);
    }, "expected overlapping scope batch to throw");
  });

  it("should mark in-scope passing changes as accepted", () => {
    const task = {
      taskId: "ENG-LOW-102",
      scopePaths: ["README.md", "docs/AGENT_AUTONOMY_ROADMAP.md"],
    };
    const review = buildDelegationReview(task, {
      exitCode: 0,
      changedFiles: [
        {
          path: "README.md",
          changeType: "modified",
        },
      ],
    }, {
      reviewer: "codex",
      testResults: [
        { command: "node tests/run-all.js", ok: true, exitCode: 0 },
      ],
    });

    assert.equal(review.reviewStatus, "accepted");
    assert.deepEqual(review.acceptedFiles, ["README.md"]);
    assert.deepEqual(review.rejectedFiles, []);
    assert.ok(renderDelegationReviewMarkdown(review).includes("已接受"));
  });

  it("should mark failing tests as needs-fix", () => {
    const task = {
      taskId: "ENG-LOW-101",
      scopePaths: ["scripts/agent-monitor.mjs"],
    };
    const review = buildDelegationReview(task, {
      exitCode: 0,
      changedFiles: [
        {
          path: "scripts/agent-monitor.mjs",
          changeType: "modified",
        },
      ],
    }, {
      reviewer: "codex",
      testResults: [
        { command: "node tests/run-all.js", ok: false, exitCode: 1 },
      ],
    });

    assert.equal(review.reviewStatus, "needs-fix");
    assert.ok(review.reviewNotes.some((item) => item.includes("聚焦测试失败")));
  });

  it("should reject out-of-scope changes", () => {
    const task = {
      taskId: "P1-LOW-101",
      scopePaths: ["scripts/agent-monitor.mjs"],
    };
    const review = buildDelegationReview(task, {
      exitCode: 0,
      changedFiles: [
        {
          path: "scripts/agent-monitor.mjs",
          changeType: "modified",
        },
        {
          path: "scripts/agent-zotero-patch-lib.mjs",
          changeType: "modified",
        },
      ],
    }, {
      reviewer: "codex",
      testResults: [],
    });

    assert.equal(review.reviewStatus, "rejected");
    assert.deepEqual(review.acceptedFiles, ["scripts/agent-monitor.mjs"]);
    assert.deepEqual(review.rejectedFiles, ["scripts/agent-zotero-patch-lib.mjs"]);
  });
});
