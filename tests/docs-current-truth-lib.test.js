import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyCurrentTruthSyncPlan,
  buildCurrentTruthSyncPlan,
  extractCurrentTruthActiveBatchId,
} from "../scripts/docs-current-truth-lib.mjs";
import { describe, it, assert } from "./test-framework.js";

function writeFile(rootDir, relativePath, content) {
  const absolutePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf-8");
}

function createFixtureProject() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "addontemplate-current-truth-"));
  writeFile(
    rootDir,
    "docs/CURRENT_BACKLOG.md",
    [
      "# Backlog",
      "",
      "## 当前单一事实源",
      "",
      "说明文字",
      "",
      "<!-- CURRENT-TRUTH-SUMMARY:START -->",
      "- 当前唯一主线批次已固定为 `ENG-HIGH-103`",
      "- 当前批次收口后，默认下一优先级固定为 `工程化维护文档与自动同步机制`",
      "<!-- CURRENT-TRUTH-SUMMARY:END -->",
      "",
      "## 其他",
      "",
      "- extra",
      "",
    ].join("\n"),
  );

  for (const relativePath of [
    "README.md",
    "FRAMEWORK_CHECKLIST.md",
    "FRAMEWORK_ASSESSMENT.md",
    "docs/AGENT_AUTONOMY_ROADMAP.md",
  ]) {
    writeFile(
      rootDir,
      relativePath,
      [
        "# Doc",
        "",
        "前文",
        "",
        "<!-- CURRENT-TRUTH-SUMMARY:START -->",
        "- stale",
        "<!-- CURRENT-TRUTH-SUMMARY:END -->",
        "",
        "尾部",
        "",
      ].join("\n"),
    );
  }

  return rootDir;
}

describe("Current Truth Sync", () => {
  it("should build a sync plan from the backlog summary block", () => {
    const rootDir = createFixtureProject();
    const plan = buildCurrentTruthSyncPlan({ rootDir });

    assert.equal(plan.summaryContent.includes("`ENG-HIGH-103`"), true);
    assert.equal(plan.changedFiles.length, 4);
    assert.equal(plan.changedFiles[0].relativePath, "README.md");
  });

  it("should rewrite only marker blocks and become a no-op after syncing", () => {
    const rootDir = createFixtureProject();
    const beforeReadme = fs.readFileSync(path.join(rootDir, "README.md"), "utf-8");
    const plan = buildCurrentTruthSyncPlan({ rootDir });

    applyCurrentTruthSyncPlan(plan);

    const afterReadme = fs.readFileSync(path.join(rootDir, "README.md"), "utf-8");
    assert.ok(afterReadme.includes("`ENG-HIGH-103`"));
    assert.ok(afterReadme.includes("前文"));
    assert.ok(afterReadme.includes("尾部"));
    assert.equal(beforeReadme.includes("前文"), true);

    const noOpPlan = buildCurrentTruthSyncPlan({ rootDir });
    assert.equal(noOpPlan.changedFiles.length, 0);
  });

  it("should support check mode for synchronized and drifted documents", () => {
    const rootDir = createFixtureProject();
    const scriptPath = path.resolve("scripts/docs-sync-current-truth.mjs");

    execFileSync("node", [scriptPath, "--project-root", rootDir], {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    execFileSync("node", [scriptPath, "--check", "--project-root", rootDir], {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    fs.writeFileSync(
      path.join(rootDir, "README.md"),
      [
        "# Doc",
        "",
        "<!-- CURRENT-TRUTH-SUMMARY:START -->",
        "- drifted",
        "<!-- CURRENT-TRUTH-SUMMARY:END -->",
        "",
      ].join("\n"),
      "utf-8",
    );

    assert.throws(() => {
      execFileSync("node", [scriptPath, "--check", "--project-root", rootDir], {
        cwd: process.cwd(),
        stdio: "pipe",
      });
    });
  });

  it("should extract active batch id from multiple current truth phrasings", () => {
    assert.equal(
      extractCurrentTruthActiveBatchId("- 当前 active 高逻辑已切到 `ENG-HIGH-104`"),
      "ENG-HIGH-104",
    );
    assert.equal(
      extractCurrentTruthActiveBatchId("- 当前唯一主线批次已固定为 `ENG-HIGH-103`"),
      "ENG-HIGH-103",
    );
    assert.equal(
      extractCurrentTruthActiveBatchId("- 当前主线固定为 `AIAssistant 本地闭环收口`：后续再分批推进扩展 wave"),
      "AIAssistant 本地闭环收口",
    );
  });

  it("should not treat next-step plan as current active batch", () => {
    assert.equal(
      extractCurrentTruthActiveBatchId("- 下一步切到 `embeddings`"),
      null,
    );
  });
});
