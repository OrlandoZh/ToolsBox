import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";
import {
  assertDelegationBatchSafe,
  buildDelegationPrompt,
  buildDelegationReview,
  buildMcoRunInvocation,
  captureProjectSnapshot,
  loadDelegationManifest,
  normalizeDelegationLane,
  reviewEphemeralDelegationTask,
  renderDelegationReviewMarkdown,
  resolveDelegationManifestPath,
  resolveDelegationTaskArtifacts,
  runEphemeralDelegationTask,
  summarizeDelegationRuntimePreflight,
} from "../scripts/agent-delegation-lib.mjs";

const projectRoot = path.resolve(".");

describe("Agent Delegation", () => {
  it("should load the rebaselined manifest with HOST-HIGH-201 as the current host-polish batch and ENG-HIGH-104 preserved as release follow-up", async () => {
    const manifest = await loadDelegationManifest(projectRoot);

    assert.equal(manifest.schemaVersion, 1);
    assert.ok(Boolean(manifest.taskMap["P1-HIGH-001"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-001"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-102"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-103"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-105"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-110"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-111"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-112"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-121"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-122"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-124"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-125"]));
    assert.ok(Boolean(manifest.taskMap["READER-HIGH-126"]));
    assert.ok(Boolean(manifest.taskMap["ENG-HIGH-102"]));
    assert.ok(Boolean(manifest.taskMap["ENG-HIGH-103"]));
    assert.ok(Boolean(manifest.taskMap["HOST-HIGH-201"]));
    assert.ok(Boolean(manifest.taskMap["ENG-HIGH-104"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-207"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-208"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-209"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-210"]));
    assert.ok(Boolean(manifest.taskMap["HOST-LOW-301"]));
    assert.ok(Boolean(manifest.taskMap["HOST-LOW-302"]));
    assert.ok(Boolean(manifest.taskMap["HOST-LOW-303"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-211"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-212"]));
    assert.ok(Boolean(manifest.taskMap["ENG-LOW-213"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-252"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-253"]));
    assert.ok(Boolean(manifest.taskMap["READER-LOW-254"]));
    assert.ok(Boolean(manifest.taskMap["ENG-HIGH-001"]));
    assert.ok(Boolean(manifest.taskMap["ENG-HIGH-101"]));
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
    assert.equal(Boolean(manifest.taskMap["ENG-LOW-204"]), false);
    assert.equal(Boolean(manifest.taskMap["ENG-LOW-205"]), false);
    assert.equal(Boolean(manifest.taskMap["ENG-LOW-206"]), false);
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
    assert.equal(Boolean(manifest.taskMap["READER-HIGH-113"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-HIGH-114"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-HIGH-118"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-HIGH-119"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-HIGH-101"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-HIGH-104"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-HIGH-109"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-HIGH-120"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-HIGH-123"]), false);
    assert.equal(Boolean(manifest.taskMap["ENG-LOW-102"]), false);
    assert.equal(Boolean(manifest.taskMap["DOC-LOW-001"]), false);
    assert.equal(Boolean(manifest.taskMap["DOC-LOW-201"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-HIGH-106"]), false);
    assert.equal(Boolean(manifest.taskMap["P1-HIGH-101"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-255"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-256"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-257"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-258"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-259"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-260"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-261"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-262"]), false);
    assert.equal(Boolean(manifest.taskMap["READER-LOW-263"]), false);
    assert.equal(Boolean(manifest.taskMap["OBSIDIAN-HIGH-101"]), false);
    assert.equal(manifest.taskMap["P1-HIGH-001"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["READER-HIGH-110"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["READER-HIGH-111"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["READER-HIGH-112"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["READER-HIGH-121"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["READER-HIGH-122"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["READER-HIGH-124"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["READER-HIGH-125"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["READER-HIGH-126"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["ENG-HIGH-102"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["ENG-HIGH-103"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["HOST-HIGH-201"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["ENG-HIGH-104"].lane, "codex-architecture-planning");
    assert.equal(manifest.taskMap["ENG-LOW-207"].lane, "opencode-implementation-delivery");
    assert.equal(manifest.taskMap["ENG-LOW-208"].lane, "opencode-implementation-delivery");
    assert.equal(manifest.taskMap["ENG-LOW-209"].lane, "opencode-implementation-delivery");
    assert.equal(manifest.taskMap["ENG-LOW-210"].lane, "opencode-implementation-delivery");
    assert.equal(manifest.taskMap["HOST-LOW-301"].lane, "opencode-implementation-delivery");
    assert.equal(manifest.taskMap["HOST-LOW-302"].lane, "opencode-implementation-delivery");
    assert.equal(manifest.taskMap["HOST-LOW-303"].lane, "opencode-implementation-delivery");
    assert.equal(manifest.taskMap["ENG-LOW-211"].lane, "opencode-implementation-delivery");
    assert.equal(manifest.taskMap["ENG-LOW-212"].lane, "opencode-implementation-delivery");
    assert.equal(manifest.taskMap["ENG-LOW-213"].lane, "opencode-implementation-delivery");
    assert.equal(manifest.taskMap["READER-LOW-252"].lane, "opencode-implementation-delivery");
    assert.equal(manifest.taskMap["READER-LOW-253"].lane, "opencode-implementation-delivery");
    assert.equal(manifest.taskMap["READER-LOW-254"].lane, "opencode-implementation-delivery");
    assert.ok(manifest.taskMap["READER-HIGH-121"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["READER-HIGH-122"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["READER-HIGH-124"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["READER-HIGH-125"].title.includes("冻结 library-only 视觉漂移根因排查边界"));
    assert.ok(manifest.taskMap["READER-HIGH-126"].title.includes("修复 library-only 真实界面回归并恢复 visual baseline 对齐"));
    assert.ok(manifest.taskMap["READER-HIGH-126"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["ENG-HIGH-103"].title.includes("历史契约源"));
    assert.ok(manifest.taskMap["HOST-HIGH-201"].title.includes("宿主可见 UI polish"));
    assert.ok(manifest.taskMap["HOST-LOW-301"].title.includes("geometry"));
    assert.ok(manifest.taskMap["HOST-LOW-302"].title.includes("validation surface"));
    assert.ok(manifest.taskMap["HOST-LOW-303"].title.includes("truth、manifest"));
    assert.ok(manifest.taskMap["ENG-HIGH-104"].title.includes("远端发布编排"));
    assert.ok(manifest.taskMap["ENG-HIGH-104"].title.includes("updateURL"));
    assert.deepEqual(manifest.taskMap["READER-HIGH-102"].dependsOn, ["READER-HIGH-001", "ENG-HIGH-101"]);
    assert.deepEqual(manifest.taskMap["READER-HIGH-105"].dependsOn, ["READER-HIGH-103"]);
    assert.deepEqual(manifest.taskMap["READER-HIGH-110"].dependsOn, ["READER-HIGH-105"]);
    assert.deepEqual(manifest.taskMap["READER-HIGH-121"].dependsOn, ["READER-HIGH-112"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-252"].dependsOn, ["READER-HIGH-112"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-253"].dependsOn, ["READER-HIGH-112", "READER-LOW-252"]);
    assert.deepEqual(manifest.taskMap["READER-LOW-254"].dependsOn, ["READER-HIGH-112", "READER-LOW-253"]);
    assert.deepEqual(manifest.taskMap["READER-HIGH-122"].dependsOn, ["READER-HIGH-121"]);
    assert.deepEqual(manifest.taskMap["ENG-HIGH-102"].dependsOn, ["READER-HIGH-122"]);
    assert.deepEqual(manifest.taskMap["ENG-HIGH-103"].dependsOn, ["ENG-HIGH-102"]);
    assert.deepEqual(manifest.taskMap["READER-HIGH-124"].dependsOn, ["ENG-HIGH-103"]);
    assert.deepEqual(manifest.taskMap["READER-HIGH-125"].dependsOn, ["READER-HIGH-124"]);
    assert.deepEqual(manifest.taskMap["READER-HIGH-126"].dependsOn, ["READER-HIGH-125"]);
    assert.deepEqual(manifest.taskMap["HOST-HIGH-201"].dependsOn, ["READER-HIGH-126"]);
    assert.deepEqual(manifest.taskMap["HOST-LOW-301"].dependsOn, ["HOST-HIGH-201"]);
    assert.deepEqual(manifest.taskMap["HOST-LOW-302"].dependsOn, ["HOST-HIGH-201", "HOST-LOW-301"]);
    assert.deepEqual(manifest.taskMap["HOST-LOW-303"].dependsOn, ["HOST-HIGH-201", "HOST-LOW-301", "HOST-LOW-302"]);
    assert.deepEqual(manifest.taskMap["ENG-HIGH-104"].dependsOn, ["HOST-HIGH-201"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-207"].dependsOn, ["ENG-HIGH-103"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-208"].dependsOn, ["ENG-HIGH-103"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-209"].dependsOn, ["ENG-HIGH-103", "ENG-LOW-207", "ENG-LOW-208"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-210"].dependsOn, ["ENG-HIGH-103", "ENG-LOW-209"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-211"].dependsOn, ["ENG-HIGH-104"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-212"].dependsOn, ["ENG-HIGH-104", "ENG-LOW-211"]);
    assert.deepEqual(manifest.taskMap["ENG-LOW-213"].dependsOn, ["ENG-HIGH-104", "ENG-LOW-211", "ENG-LOW-212"]);
    assert.equal(manifest.taskMap["ENG-LOW-207"].gitClosure.milestone, "module-feature");
    assert.equal(manifest.taskMap["ENG-LOW-207"].gitClosure.commitMessage, "feat: 基本实现 runtime 生命周期边界与时序遥测");
    assert.equal(manifest.taskMap["ENG-LOW-208"].gitClosure.milestone, "module-framework");
    assert.equal(manifest.taskMap["ENG-LOW-208"].gitClosure.commitMessage, "feat: 完成共享失败模型脚本入口模块框架搭建");
    assert.equal(manifest.taskMap["ENG-LOW-209"].gitClosure.milestone, "module-feature");
    assert.equal(manifest.taskMap["ENG-LOW-210"].gitClosure.milestone, "batch-closure");
    assert.equal(manifest.taskMap["HOST-LOW-301"].gitClosure.milestone, "module-feature");
    assert.equal(manifest.taskMap["HOST-LOW-301"].gitClosure.commitMessage, "feat: 收紧 host-visible surface geometry contract");
    assert.equal(manifest.taskMap["HOST-LOW-302"].gitClosure.milestone, "module-feature");
    assert.equal(manifest.taskMap["HOST-LOW-303"].gitClosure.milestone, "batch-closure");
    assert.equal(manifest.taskMap["HOST-LOW-303"].gitClosure.commitMessage, "chore: 收口 HOST-HIGH-201 truth、manifest 与守卫测试");
    assert.equal(manifest.taskMap["ENG-LOW-211"].gitClosure.milestone, "module-feature");
    assert.equal(manifest.taskMap["ENG-LOW-212"].gitClosure.milestone, "module-feature");
    assert.equal(manifest.taskMap["ENG-LOW-213"].gitClosure.milestone, "batch-closure");
    assert.equal(manifest.taskMap["ENG-LOW-213"].gitClosure.commitMessage, "chore: 收口 ENG-HIGH-104 manifest、文档与守卫测试");
    assert.equal(manifest.tasks.some((task) => task.lane === "opencode-implementation-delivery"), true);
  });

  it("should resolve delegation manifest and artifact paths under dist", () => {
    const manifestPath = resolveDelegationManifestPath(projectRoot);
    const artifacts = resolveDelegationTaskArtifacts(projectRoot, "READER-LOW-216");

    assert.equal(manifestPath, path.join(projectRoot, "config", "agent-delegation-tasks.json"));
    assert.equal(artifacts.baseDir, path.join(projectRoot, "dist", "agent-delegation", "READER-LOW-216"));
    assert.equal(artifacts.reviewJSON, path.join(projectRoot, "dist", "agent-delegation", "READER-LOW-216", "review.json"));
    assert.equal(artifacts.gitClosureJSON, path.join(projectRoot, "dist", "agent-delegation", "READER-LOW-216", "git-closure.json"));
  });

  it("should normalize legacy lane aliases to the scenario-based lane ids", () => {
    assert.equal(normalizeDelegationLane("codex-high-logic"), "codex-architecture-planning");
    assert.equal(normalizeDelegationLane("opencode-low-logic"), "opencode-implementation-delivery");
    assert.equal(normalizeDelegationLane("codex-architecture-planning"), "codex-architecture-planning");
    assert.equal(normalizeDelegationLane("opencode-implementation-delivery"), "opencode-implementation-delivery");
  });

  it("should build strict mco invocation for opencode tasks", async () => {
    const previous = process.env.MCO_BINARY;
    delete process.env.MCO_BINARY;
    try {
      const task = {
        taskId: "DOC-LOW-SAMPLE",
        lane: "opencode-implementation-delivery",
        scopePaths: ["README.md", "docs/CURRENT_BACKLOG.md"],
        dependsOn: ["READER-HIGH-105"],
        promptTemplate: "该任务仅供 Codex 跟踪。本轮只负责同步 README 与 current truth 摘要，不得扩 scope，不得新建平行文档。",
        reviewChecklist: [],
        testCommands: [],
        handoffArtifacts: [],
      };
      const runtimeContext = {
        present: true,
        truthRef: {
          activeBatchId: "HOST-HIGH-201",
          currentWaveName: "ZOTERO-HOST-POLISH-WAVE-001",
          validationLevel: "需要视觉验证",
        },
        alignmentRef: {
          status: "repair-required",
          generationStage: "standalone",
          preferredRepairCommand: "npm run agent:gate",
          warningKinds: ["freshness-mismatch"],
        },
        actionRef: {
          nextAction: "npm run agent:gate",
          mainBlocker: "缺少最新 gate 工件。",
        },
        statusRef: {
          stableContextKey: "stable-test",
          dynamicFingerprint: "dynamic-test",
          monitorStatus: "稳定",
          gateStatus: "需先处理",
          memoryFingerprint: "reader-ui:visual-drift",
          releaseStatus: "待验证",
        },
        driftRef: {
          status: "warning",
          warningCount: 1,
          warnings: ["gate 早于 monitor"],
        },
        evidenceRefs: ["补齐最近的 gate 工件。"],
        artifactRefs: {
          currentTruth: "docs/CURRENT_BACKLOG.md",
          monitor: "dist/agent-monitor.json",
          gate: "dist/agent-gate.json",
          memory: "dist/agent-memory.json",
          contextJSON: "dist/agent-context.json",
        },
        freshness: {},
        budgetMeta: {
          profile: "runtime-compact-v1",
          digest: "compact-digest-test",
        },
      };
      const invocation = buildMcoRunInvocation(task, projectRoot, {
        runtimeContext,
      });

      assert.equal(invocation.command, "mco");
      assert.equal(invocation.promptMode, "manifest-reference");
      assert.equal(invocation.contractReference, "config/agent-delegation-tasks.json -> DOC-LOW-SAMPLE");
      assert.equal(invocation.runtimeContextProfile, "runtime-compact-v1");
      assert.equal(invocation.runtimeContextDigest, "compact-digest-test");
      assert.equal(invocation.promptAssembly.promptMode, "manifest-reference");
      assert.equal(invocation.promptAssembly.contractReference, "config/agent-delegation-tasks.json -> DOC-LOW-SAMPLE");
      assert.equal(invocation.promptAssembly.runtimeContextProfile, "runtime-compact-v1");
      assert.equal(invocation.promptAssembly.runtimeContextDigest, "compact-digest-test");
      assert.equal(invocation.promptAssembly.budgetProfile, "runtime-compact-v1");
      assert.ok(typeof invocation.promptAssembly.stablePrefixDigest === "string" && invocation.promptAssembly.stablePrefixDigest.length > 0);
      assert.ok(typeof invocation.promptAssembly.dynamicTailDigest === "string" && invocation.promptAssembly.dynamicTailDigest.length > 0);
      assert.ok(invocation.promptAssembly.stablePrefixLineCount > 0);
      assert.ok(invocation.promptAssembly.dynamicTailLineCount > 0);
      assert.ok(invocation.prompt.includes("完整契约来源: config/agent-delegation-tasks.json -> DOC-LOW-SAMPLE"));
      assert.ok(invocation.prompt.includes("当前项目态（runtime-compact-v1）"));
      assert.ok(invocation.prompt.includes("Truth Ref: batch=HOST-HIGH-201 / wave=ZOTERO-HOST-POLISH-WAVE-001 / validation=需要视觉验证"));
      assert.ok(invocation.prompt.includes("Alignment Ref: status=repair-required / stage=standalone / repair=npm run agent:gate / freshness-mismatch"));
      assert.ok(invocation.prompt.includes("最小任务摘要:"));
      assert.equal(invocation.prompt.includes(task.promptTemplate), false);
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

  it("should allow snapshot callers to override ignored directories for reference-sensitive checks", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-delegation-snapshot-root-"));
    try {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      fs.mkdirSync(path.join(root, "reference", "plugin", "demo-scope"), { recursive: true });
      fs.writeFileSync(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n", "utf-8");
      fs.writeFileSync(path.join(root, "reference", "plugin", "demo-scope", "menu.js"), "popupshowing\n", "utf-8");

      const defaultSnapshot = await captureProjectSnapshot(root);
      const referenceAwareSnapshot = await captureProjectSnapshot(root, {
        ignoreDirs: [".git", "build", "dist", "node_modules"],
      });

      assert.equal(defaultSnapshot.files.some((entry) => entry.path === "reference/plugin/demo-scope/menu.js"), false);
      assert.equal(referenceAwareSnapshot.files.some((entry) => entry.path === "reference/plugin/demo-scope/menu.js"), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("should run and review a manifest-free ephemeral delegation task with strict artifacts", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-ephemeral-delegation-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-ephemeral-delegation-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      fs.writeFileSync(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n", "utf-8");
      const task = {
        taskId: "REFERENCE-DISTILL-EPHEMERAL-TEST",
        title: "Reference distillation / Ephemeral",
        lane: "opencode-implementation-delivery",
        scopePaths: [
          "docs/REFERENCE_INDEX.md",
          "docs/REFERENCE_EPHEMERAL_TEST.md",
        ],
        dependsOn: [],
        promptTemplate: "只允许更新 docs/REFERENCE_*.md 与 docs/REFERENCE_INDEX.md，最终输出单个 JSON brief。",
        reviewChecklist: [],
        testCommands: [],
        handoffArtifacts: [],
      };

      const runRecord = await runEphemeralDelegationTask(root, task, {
        manifestPath: "ephemeral://reference-distillation",
        inlineContract: true,
        executeCommand: async () => {
          fs.writeFileSync(path.join(root, "docs", "REFERENCE_EPHEMERAL_TEST.md"), "# Ephemeral\n", "utf-8");
          return {
            exitCode: 0,
            signal: null,
            stdout: JSON.stringify({
              status: "completed",
              owner_role: "reference-distill-worker",
              summary: "updated reference topic",
              changed_files: ["docs/REFERENCE_EPHEMERAL_TEST.md"],
              checks_run: [],
              risks: [],
              blockers: [],
              next_action: "none",
            }),
            stderr: "",
          };
        },
      });
      const review = await reviewEphemeralDelegationTask(root, task, {
        reviewer: "reference-distill-controller",
      });
      const artifacts = resolveDelegationTaskArtifacts(root, task.taskId);

      assert.equal(runRecord.exitCode, 0);
      assert.equal(runRecord.providerResultPresent, true);
      assert.deepEqual(runRecord.changedFiles.map((entry) => entry.path), ["docs/REFERENCE_EPHEMERAL_TEST.md"]);
      assert.equal(review.reviewStatus, "accepted");
      assert.equal(fs.existsSync(artifacts.taskJSON), true);
      assert.equal(fs.existsSync(artifacts.invocationJSON), true);
      assert.equal(fs.existsSync(artifacts.runJSON), true);
      assert.equal(fs.existsSync(artifacts.reviewJSON), true);
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

  it("should reject an ephemeral delegation task that writes outside scope", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-ephemeral-delegation-reject-root-"));
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), "addon-template-ephemeral-delegation-reject-artifacts-"));
    const previousArtifactsDir = process.env.AGENT_ARTIFACTS_DIR;
    try {
      process.env.AGENT_ARTIFACTS_DIR = artifactsDir;
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      fs.writeFileSync(path.join(root, "docs", "REFERENCE_INDEX.md"), "# Reference 路由\n", "utf-8");
      fs.writeFileSync(path.join(root, "docs", "CURRENT_BACKLOG.md"), "# Truth\n", "utf-8");
      const task = {
        taskId: "REFERENCE-DISTILL-EPHEMERAL-REJECT",
        title: "Reference distillation / Reject",
        lane: "opencode-implementation-delivery",
        scopePaths: [
          "docs/REFERENCE_INDEX.md",
          "docs/REFERENCE_EPHEMERAL_REJECT.md",
        ],
        dependsOn: [],
        promptTemplate: "只允许更新 docs/REFERENCE_*.md 与 docs/REFERENCE_INDEX.md。",
        reviewChecklist: [],
        testCommands: [],
        handoffArtifacts: [],
      };

      await runEphemeralDelegationTask(root, task, {
        manifestPath: "ephemeral://reference-distillation",
        inlineContract: true,
        executeCommand: async () => {
          fs.writeFileSync(path.join(root, "docs", "REFERENCE_EPHEMERAL_REJECT.md"), "# Reject\n", "utf-8");
          fs.writeFileSync(path.join(root, "docs", "CURRENT_BACKLOG.md"), "# drifted truth\n", "utf-8");
          return {
            exitCode: 0,
            signal: null,
            stdout: "{}",
            stderr: "",
          };
        },
      });
      const review = await reviewEphemeralDelegationTask(root, task, {
        reviewer: "reference-distill-controller",
      });

      assert.equal(review.reviewStatus, "rejected");
      assert.deepEqual(review.rejectedFiles, ["docs/CURRENT_BACKLOG.md"]);
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

  it("should build compact delegation prompts by default and keep full contract in manifest", () => {
    const promptTemplate = "该任务仅供 Codex 跟踪。本轮只负责把最小上下文摘要接到既有消费链，不新增平行 artifact 家族；保持 current truth 为单一事实源；不得把 dashboard / obsidian / gate 的摘要再各写一套长文本。";
    const prompt = buildDelegationPrompt({
      taskId: "ENG-LOW-CONTEXT",
      title: "压缩 delegation 上下文占用",
      lane: "opencode-implementation-delivery",
      scopePaths: ["scripts/agent-context-lib.mjs"],
      dependsOn: [],
      promptTemplate,
      reviewChecklist: [],
      testCommands: [],
      handoffArtifacts: [],
    }, {
      manifestPath: "config/custom-manifest.json",
    });

    assert.ok(prompt.includes("完整契约来源: config/custom-manifest.json -> ENG-LOW-CONTEXT"));
    assert.ok(prompt.includes("最小任务摘要:"));
    assert.equal(prompt.includes("任务契约（内联）:"), false);
    assert.equal(prompt.includes(promptTemplate), false);
    assert.ok(prompt.includes("本轮只负责把最小上下文摘要接到既有消费链"));
  });

  it("should prefer compact runtime context over long truth or monitor summaries in delegation prompts", () => {
    const prompt = buildDelegationPrompt({
      taskId: "ENG-LOW-RUNTIME",
      title: "收口运行时上下文",
      lane: "opencode-implementation-delivery",
      scopePaths: ["scripts/agent-delegation-lib.mjs"],
      dependsOn: [],
      promptTemplate: "该任务仅供 Codex 跟踪。本轮只负责消费 compact context，不得内联长 truth。",
      reviewChecklist: [],
      testCommands: [],
      handoffArtifacts: [],
    }, {
      runtimeContext: {
        present: true,
        truthRef: {
          activeBatchId: "HOST-HIGH-201",
          currentWaveName: "ZOTERO-HOST-POLISH-WAVE-001",
          validationLevel: "需要视觉验证",
        },
        alignmentRef: {
          status: "repair-required",
          generationStage: "standalone",
          preferredRepairCommand: "npm run agent:gate",
          warningKinds: ["freshness-mismatch", "scope-mismatch"],
        },
        actionRef: {
          nextAction: "npm run agent:gate",
          mainBlocker: "需要补齐最新 gate 工件。",
        },
        statusRef: {
          monitorStatus: "稳定",
          gateStatus: "需先处理",
          memoryFingerprint: "reader-ui:visual-drift",
          releaseStatus: "待验证",
        },
        driftRef: {
          status: "warning",
          warningCount: 3,
          warnings: ["gate 早于 monitor", "monitor 早于 memory", "不应进入 prompt 的第三条 warning"],
        },
        evidenceRefs: ["补齐 gate 工件。", "补齐 monitor 工件。", "补齐 context 工件。", "不应进入 prompt 的第四条 evidence"],
        artifactRefs: {
          currentTruth: "docs/CURRENT_BACKLOG.md",
          monitor: "dist/agent-monitor.json",
          gate: "dist/agent-gate.json",
          memory: "dist/agent-memory.json",
          contextJSON: "dist/agent-context.json",
        },
        freshness: {},
        budgetMeta: {
          profile: "runtime-compact-v1",
          digest: "digest-test",
        },
      },
    });

    assert.ok(prompt.includes("当前项目态（runtime-compact-v1）"));
    assert.ok(prompt.includes("动态运行时上下文（可变部分）:"));
    assert.ok(prompt.includes("Alignment Ref: status=repair-required / stage=standalone / repair=npm run agent:gate / freshness-mismatch；scope-mismatch"));
    assert.ok(prompt.includes("Artifact Refs: truth=docs/CURRENT_BACKLOG.md / monitor=dist/agent-monitor.json / gate=dist/agent-gate.json / memory=dist/agent-memory.json / context=dist/agent-context.json"));
    assert.ok(prompt.includes("gate 早于 monitor；monitor 早于 memory"));
    assert.equal(prompt.includes("不应进入 prompt 的第三条 warning"), false);
    assert.ok(prompt.includes("补齐 gate 工件。 / 补齐 monitor 工件。 / 补齐 context 工件。"));
    assert.equal(prompt.includes("不应进入 prompt 的第四条 evidence"), false);
    assert.equal(prompt.includes("当前真实完成度约为"), false);
    assert.equal(prompt.includes("当前 monitor 结论稳定"), false);
  });

  it("should block delegation only on freshness/scope/missing context warnings", () => {
    const blocking = summarizeDelegationRuntimePreflight({
      present: true,
      alignmentRef: {
        status: "repair-required",
        generationStage: "standalone",
        preferredRepairCommand: "npm run agent:gate",
        warningKinds: ["freshness-mismatch", "budget-exceeded"],
      },
      driftRef: {
        status: "warning",
        warningCount: 1,
        warnings: ["gate 早于 monitor"],
      },
    }, {
      warnings: [
        { kind: "freshness-mismatch" },
        { kind: "budget-exceeded" },
      ],
      recommendation: "执行 `npm run agent:gate`。",
    });
    const nonBlocking = summarizeDelegationRuntimePreflight({
      present: true,
      alignmentRef: {
        status: "repair-required",
        generationStage: "standalone",
        preferredRepairCommand: "npm run agent:gate",
        warningKinds: ["budget-exceeded"],
      },
      driftRef: {
        status: "warning",
        warningCount: 1,
        warnings: ["compact 超预算"],
      },
    }, {
      warnings: [
        { kind: "budget-exceeded" },
      ],
      recommendation: "收紧 compact budget。",
    });

    assert.equal(blocking.blocking, true);
    assert.deepEqual(blocking.blockingKinds, ["freshness-mismatch"]);
    assert.equal(nonBlocking.blocking, false);
  });

  it("should allow explicitly inlining the full contract for debugging", () => {
    const promptTemplate = "该任务仅供 Codex 跟踪。只允许改既有脚本，不得扩 scope。";
    const prompt = buildDelegationPrompt({
      taskId: "ENG-LOW-INLINE",
      title: "内联 contract 调试",
      lane: "opencode-implementation-delivery",
      scopePaths: ["scripts/agent-delegation-lib.mjs"],
      dependsOn: [],
      promptTemplate,
      reviewChecklist: [],
      testCommands: [],
      handoffArtifacts: [],
    }, {
      inlineContract: true,
    });

    assert.ok(prompt.includes("任务契约（内联）:"));
    assert.ok(prompt.includes(promptTemplate));
  });

  it("should surface inline-contract prompt assembly metadata when requested", () => {
    const invocation = buildMcoRunInvocation({
      taskId: "ENG-LOW-INLINE",
      title: "内联 contract 调试",
      lane: "opencode-implementation-delivery",
      scopePaths: ["scripts/agent-delegation-lib.mjs"],
      dependsOn: [],
      promptTemplate: "该任务仅供 Codex 跟踪。只允许改既有脚本，不得扩 scope。",
      reviewChecklist: [],
      testCommands: [],
      handoffArtifacts: [],
    }, projectRoot, {
      inlineContract: true,
    });

    assert.equal(invocation.promptMode, "inline-contract");
    assert.equal(invocation.promptAssembly.promptMode, "inline-contract");
    assert.equal(invocation.promptAssembly.budgetProfile, "task-contract-compact-v1");
    assert.ok(invocation.prompt.includes("任务契约（内联）:"));
  });

  it("should reject overlapping opencode batch scopes", () => {
    assert.throws(() => {
      assertDelegationBatchSafe([
        {
          taskId: "A",
          lane: "opencode-implementation-delivery",
          scopePaths: ["scripts"],
        },
        {
          taskId: "B",
          lane: "opencode-implementation-delivery",
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
