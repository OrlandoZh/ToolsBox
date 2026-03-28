import { describe, it, assert } from "./test-framework.js";
import {
  attachDelegationGitClosureTestResults,
  buildDelegationGitClosurePlan,
} from "../scripts/agent-git-closure-lib.mjs";

describe("Agent Git Closure", () => {
  it("should build a scoped close plan and ignore unrelated worktree changes", () => {
    const task = {
      taskId: "ENG-LOW-207",
      title: "补齐 runtime 生命周期边界与时序遥测",
      scopePaths: [
        "src/app/kernel.js",
        "src/app/plugin.js",
        "tests/kernel.test.js",
      ],
      gitClosure: {
        enabled: true,
        milestone: "module-feature",
        summary: "runtime 生命周期边界与时序遥测",
        commitMessage: "feat: 基本实现 runtime 生命周期边界与时序遥测",
      },
    };

    const plan = buildDelegationGitClosurePlan(task, [
      "README.md",
      "src/app/kernel.js",
      "tests/kernel.test.js",
    ]);

    assert.equal(plan.taskId, "ENG-LOW-207");
    assert.equal(plan.commitMessage, "feat: 基本实现 runtime 生命周期边界与时序遥测");
    assert.deepEqual(plan.selectedFiles, [
      "src/app/kernel.js",
      "tests/kernel.test.js",
    ]);
    assert.deepEqual(plan.outsideScopeChangedFiles, ["README.md"]);
    assert.ok(plan.notes.some((item) => item.includes("scope 外改动")));
  });

  it("should derive a Chinese framework commit message when manifest does not hardcode one", () => {
    const task = {
      taskId: "ENG-LOW-208",
      title: "把剩余核心脚本入口统一到共享失败模型",
      scopePaths: ["scripts/zotero.mjs"],
      gitClosure: {
        enabled: true,
        milestone: "module-framework",
        summary: "共享失败模型脚本入口",
        commitMessage: null,
      },
    };

    const plan = buildDelegationGitClosurePlan(task, ["scripts/zotero.mjs"]);
    assert.equal(plan.commitMessage, "feat: 完成共享失败模型脚本入口模块框架搭建");
  });

  it("should reject close plans without any in-scope changes", () => {
    const task = {
      taskId: "ENG-LOW-209",
      title: "把 lifecycle/perf 信号并入最小工程化摘要",
      scopePaths: ["scripts/agent-monitor.mjs"],
      gitClosure: {
        enabled: true,
        milestone: "module-feature",
        summary: "工程化 lifecycle/perf 摘要",
        commitMessage: "feat: 基本实现工程化 lifecycle/perf 摘要",
      },
    };

    assert.throws(() => {
      buildDelegationGitClosurePlan(task, ["README.md"]);
    }, "expected close plan without in-scope changes to throw");
  });

  it("should block git closure when focused tests fail", () => {
    const plan = {
      taskId: "ENG-LOW-210",
      selectedFiles: ["README.md"],
      notes: [],
    };

    const result = attachDelegationGitClosureTestResults(plan, [
      { command: "node tests/run-all.js", ok: false, exitCode: 1 },
    ]);

    assert.equal(result.eligible, false);
    assert.equal(result.failedTests.length, 1);
    assert.ok(result.notes.some((item) => item.includes("不允许自动提交")));
  });
});
