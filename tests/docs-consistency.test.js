import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  buildCurrentTruthSyncPlan,
  readCurrentTruthSummary,
} from "../scripts/docs-current-truth-lib.mjs";
import { describe, it, assert } from "./test-framework.js";

function readDoc(file) {
  return fs.readFileSync(path.resolve(file), "utf-8");
}

describe("Documentation Consistency", () => {
  it("should keep clean-room baseline documents non-placeholder and command wording aligned", () => {
    const spec = readDoc("SPEC.md");
    const legal = readDoc("LEGAL_RISK_CHECKLIST.md");
    const readme = readDoc("README.md");
    const buildChecklist = readDoc("docs/BUILD_DETAILS_CHECKLIST.md");
    const architecture = readDoc("docs/ARCHITECTURE.md");
    const obsidian = readDoc("docs/OBSIDIAN_INTERVENTION.md");

    assert.ok(spec.includes("Zotero Cleanroom Template"));
    assert.ok(spec.includes("Zotero 7/8"));
    assert.ok(spec.includes("8.0.2-beta.5+c35d7f21e"));
    assert.ok(spec.includes("macOS 已验证"));
    assert.equal(spec.includes("Plugin name:"), false);
    assert.equal(spec.includes("Use this file to define *what* the plugin should do"), false);

    assert.ok(legal.includes("## Development Gate"));
    assert.ok(legal.includes("## Release Gate"));
    assert.ok(legal.includes("Evidence:"));

    assert.ok(readme.includes("npm run cleanroom:audit"));
    assert.ok(readme.includes("npm run cleanroom:sim"));
    assert.ok(readme.includes("npm run docs:sync-current-truth"));
    assert.ok(readme.includes("node scripts/agent-delegation.mjs close <taskId>"));
    assert.ok(readme.includes("git-closure.json"));
    assert.ok(buildChecklist.includes("npm run cleanroom:audit"));
    assert.ok(buildChecklist.includes("npm run cleanroom:sim"));
    assert.ok(architecture.includes("npm run cleanroom:audit"));
    assert.ok(architecture.includes("npm run cleanroom:sim"));
    assert.ok(obsidian.includes("等待人工 Reader verdict"));
    assert.ok(obsidian.includes("npm run agent:zotero:e2e:update-baseline"));
  });

  it("should keep P2 marked as completed in backlog and roadmap", () => {
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(backlog.includes("`P2` 上下文感知记忆与趋势层深化已在本轮代码与测试中落地"));
    assert.ok(backlog.includes("`本轮已完成`"));
    assert.ok(roadmap.includes("`P2` 上下文感知记忆与趋势层深化已按代码与测试落地"));
  });

  it("should keep the current truth marker blocks synchronized", () => {
    const plan = buildCurrentTruthSyncPlan({ rootDir: process.cwd() });

    assert.deepEqual(
      plan.changedFiles.map((entry) => entry.relativePath),
      [],
      "Current truth summary blocks drifted from docs/CURRENT_BACKLOG.md",
    );

    execFileSync("node", ["scripts/docs-sync-current-truth.mjs", "--check"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
  });

  it("should keep current truth aligned with the fresh blocker state and next priority", () => {
    const summary = readCurrentTruthSummary(process.cwd());
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const readme = readDoc("README.md");
    const checklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");
    const legal = readDoc("LEGAL_RISK_CHECKLIST.md");

    assert.ok(summary.includes("`ENG-HIGH-103`"));
    assert.ok(summary.includes("工程化长期增强第一批"));
    assert.ok(summary.includes("`READER-HIGH-123`"));
    assert.ok(summary.includes("`ENG-HIGH-102 / ENG-LOW-204~206`"));
    assert.ok(summary.includes("`ENG-LOW-210`"));
    assert.ok(summary.includes("`2026-03-28T11:47:43.237Z`"));
    assert.ok(summary.includes("`2026-03-28T11:50:18.315Z`"));
    assert.ok(summary.includes("`2026-03-28T11:51:26.793Z`"));
    assert.ok(summary.includes("`gatePassed=false`"));
    assert.ok(summary.includes("`capture-unstable`"));
    assert.ok(summary.includes("`npm run agent:zotero:e2e`"));
    assert.ok(summary.includes("共享失败模型"));
    assert.ok(summary.includes("远端 `updateURL` 闭环验证"));
    assert.ok(summary.includes("`release-only` 人工流程"));
    assert.ok(summary.includes("工程化维护文档与自动同步机制"));
    assert.equal(summary.includes("`agent:zotero:e2e` 为 `passed`"), false);
    assert.equal(summary.includes("`agent:gate` 为 `passed`"), false);

    assert.ok(backlog.includes("<!-- CURRENT-TRUTH-SUMMARY:START -->"));
    assert.ok(readme.includes("<!-- CURRENT-TRUTH-SUMMARY:START -->"));
    assert.ok(checklist.includes("<!-- CURRENT-TRUTH-SUMMARY:START -->"));
    assert.ok(assessment.includes("<!-- CURRENT-TRUTH-SUMMARY:START -->"));
    assert.ok(roadmap.includes("<!-- CURRENT-TRUTH-SUMMARY:START -->"));
    assert.ok(legal.includes("## Release Gate (release-only)"));
  });

  it("should keep historical closure facts while avoiding stale fresh-passed wording", () => {
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const readme = readDoc("README.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(backlog.includes("`READER-HIGH-123` 已完成唯一 Reader verdict，并转为历史契约源"));
    assert.ok(backlog.includes("`npm run agent:zotero:e2e:update-baseline`"));
    assert.ok(backlog.includes("`2000x1200`"));
    assert.ok(readme.includes("`READER-HIGH-119 / READER-LOW-252~254`"));
    assert.ok(readme.includes("`READER-HIGH-120 / READER-LOW-255~257`"));
    assert.ok(readme.includes("`READER-HIGH-121 / READER-LOW-258~260`"));
    assert.ok(assessment.includes("`READER-HIGH-123` 已完成唯一分支收口，并转为历史契约源"));
    assert.ok(assessment.includes("`AGENT_OBSIDIAN_VISUALS=1`"));
    assert.ok(roadmap.includes("`AGENT_OBSIDIAN_VISUALS=1`"));
    assert.equal(readme.includes("`agent:zotero:e2e` 为 passed"), false);
    assert.equal(assessment.includes("`agent:zotero:e2e` 与 `agent:gate` 均为 passed"), false);
    assert.equal(roadmap.includes("`watch / e2e / gate` 当前均为 passed"), false);
  });
});
