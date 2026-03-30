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

  it("should keep current truth aligned with the latest single-source stable state and next priority", () => {
    const summary = readCurrentTruthSummary(process.cwd());
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const readme = readDoc("README.md");
    const checklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");
    const legal = readDoc("LEGAL_RISK_CHECKLIST.md");

    assert.ok(summary.includes("`ENG-HIGH-103`"));
    assert.ok(summary.includes("`READER-HIGH-124 / READER-LOW-261~263`"));
    assert.ok(summary.includes("`READER-HIGH-125`"));
    assert.ok(summary.includes("`READER-HIGH-126`"));
    assert.ok(summary.includes("`99%`"));
    assert.ok(summary.includes("`2026-03-30T11:34:05.136Z`"));
    assert.ok(summary.includes("`2026-03-30T11:31:37.694Z`"));
    assert.ok(summary.includes("`2026-03-30T11:35:48.300Z`"));
    assert.ok(summary.includes("`2026-03-30T11:35:48.379Z`"));
    assert.ok(summary.includes("最新开发态 `agent:monitor` / `agent:gate`"));
    assert.ok(summary.includes("`agent:zotero:e2e` 为 `passed`"));
    assert.ok(summary.includes("`stable / ready`"));
    assert.ok(summary.includes("最新 `watch` 工件为 `healthy`"));
    assert.ok(summary.includes("`failedStage=null`"));
    assert.ok(summary.includes("`errorCategory=null`"));
    assert.ok(summary.includes("`details.runtimeSanitization`"));
    assert.ok(summary.includes("`exclusiveProjectRuntime=true`"));
    assert.ok(summary.includes("project-managed `watch` `zotero` / `plugin-container`"));
    assert.ok(summary.includes("`visibleBannerIDs=[mac-word-plugin-install-container]`"));
    assert.ok(summary.includes("`sync-reminder-container`"));
    assert.ok(summary.includes("`post-upgrade-container`"));
    assert.ok(summary.includes("`file-renaming-banner-container`"));
    assert.ok(summary.includes("`retracted-items-container`"));
    assert.ok(summary.includes("`architecture-warning-container`"));
    assert.ok(summary.includes("library drift 已消失"));
    assert.ok(summary.includes("当前主阻断已清零"));
    assert.ok(summary.includes("`visual screenshot capture`"));
    assert.ok(summary.includes("reader 视图"));
    assert.ok(summary.includes("`2000x1200`"));
    assert.ok(summary.includes("freshest-valid artifact"));
    assert.ok(summary.includes("单一事实源"));
    assert.ok(summary.includes("远端 `updateURL` 闭环验证"));
    assert.ok(summary.includes("`release-only` 人工流程"));
    assert.ok(summary.includes("`capture-command-failed`"));
    assert.ok(summary.includes("`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`"));
    assert.ok(summary.includes("`agent:gate:release`"));
    assert.ok(summary.includes("`gatePassed=false`"));
    assert.ok(summary.includes("`release-matrix` 最新工件为 `attention`"));
    assert.ok(summary.includes("`readinessMode=native`"));
    assert.ok(summary.includes("`apiReady=true`"));
    assert.ok(summary.includes("`https://example.com/downloads/cleanroomtemplate/update.json`"));
    assert.ok(summary.includes("`2026-03-30T13:58:47.934Z`"));
    assert.ok(summary.includes("`2026-03-30T13:59:05.867Z`"));
    assert.equal(summary.includes("`startup / RDP bring-up timeout`"), false);
    assert.equal(summary.includes("`failedStage=launch-session`"), false);
    assert.equal(summary.includes("`agent:obsidian`"), false);
    assert.equal(summary.includes("`watch stale`"), false);
    assert.equal(summary.includes("`nextAction=npm run agent:gate`"), false);
    assert.equal(summary.includes("`agent:gate` 为 `ready`"), false);
    assert.equal(summary.includes("`2026-03-29T14:51:46.240Z`"), false);
    assert.equal(summary.includes("`2026-03-30T02:18:25.631Z`"), false);
    assert.equal(summary.includes("`2026-03-30T03:23:12.011Z`"), false);
    assert.equal(summary.includes("`2026-03-30T03:24:42.589Z`"), false);
    assert.equal(summary.includes("`2026-03-30T03:24:42.678Z`"), false);
    assert.equal(summary.includes("`2026-03-29T17:31:23.539Z`"), false);
    assert.equal(summary.includes("缺少库视图截图"), false);
    assert.equal(summary.includes("缺少 Reader 截图"), false);
    assert.equal(summary.includes("双层口径"), false);
    assert.equal(summary.includes("`预期 UI 变化`"), false);
    assert.equal(summary.includes("`实际回归`"), false);

    assert.ok(backlog.includes("<!-- CURRENT-TRUTH-SUMMARY:START -->"));
    assert.ok(readme.includes("<!-- CURRENT-TRUTH-SUMMARY:START -->"));
    assert.ok(checklist.includes("<!-- CURRENT-TRUTH-SUMMARY:START -->"));
    assert.ok(assessment.includes("<!-- CURRENT-TRUTH-SUMMARY:START -->"));
    assert.ok(roadmap.includes("<!-- CURRENT-TRUTH-SUMMARY:START -->"));
    assert.ok(backlog.includes("## 当前单一事实源"));
    assert.ok(readme.includes("“当前单一事实源”"));
    assert.ok(checklist.includes("“当前单一事实源”"));
    assert.ok(assessment.includes("“当前单一事实源”"));
    assert.ok(roadmap.includes("“当前单一事实源”"));
    assert.ok(legal.includes("## Release Gate (release-only)"));
  });

  it("should keep historical closure facts while avoiding stale failed wording", () => {
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const readme = readDoc("README.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(backlog.includes("`READER-HIGH-123` 已完成唯一 Reader verdict，并转为历史契约源"));
    assert.ok(backlog.includes("`READER-HIGH-124 / READER-LOW-261~263`"));
    assert.ok(backlog.includes("`READER-HIGH-125`"));
    assert.ok(backlog.includes("`READER-HIGH-126`"));
    assert.ok(backlog.includes("`npm run agent:zotero:e2e:update-baseline`"));
    assert.ok(backlog.includes("`2000x1200`"));
    assert.ok(readme.includes("`READER-HIGH-124 / READER-LOW-261~263`"));
    assert.ok(readme.includes("`READER-HIGH-125`"));
    assert.ok(readme.includes("`READER-HIGH-126`"));
    assert.ok(readme.includes("`READER-HIGH-119 / READER-LOW-252~254`"));
    assert.ok(readme.includes("`READER-HIGH-120 / READER-LOW-255~257`"));
    assert.ok(readme.includes("`READER-HIGH-121 / READER-LOW-258~260`"));
    assert.ok(assessment.includes("`READER-HIGH-123` 已完成唯一分支收口，并转为历史契约源"));
    assert.ok(assessment.includes("`READER-HIGH-124`"));
    assert.ok(assessment.includes("`READER-HIGH-125`"));
    assert.ok(assessment.includes("`READER-HIGH-126`"));
    assert.ok(assessment.includes("`AGENT_OBSIDIAN_VISUALS=1`"));
    assert.ok(roadmap.includes("`READER-HIGH-125`"));
    assert.ok(roadmap.includes("`READER-HIGH-126`"));
    assert.ok(roadmap.includes("`AGENT_OBSIDIAN_VISUALS=1`"));
    assert.equal(readme.includes("`agent:gate` 当前已通过"), false);
    assert.equal(assessment.includes("`gatePassed=true`"), false);
    assert.equal(roadmap.includes("`capture-unstable` 不再是 fresh 主阻断"), false);
  });

  it("should keep the next follow-up focused on release/updateURL without reopening completed reader batches", () => {
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const readme = readDoc("README.md");
    const checklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(backlog.includes("`ENG-HIGH-104 / ENG-LOW-211~213`"));
    assert.ok(readme.includes("`ENG-HIGH-104 / ENG-LOW-211~213`"));
    assert.ok(checklist.includes("`ENG-HIGH-104 / ENG-LOW-211~213`"));
    assert.ok(assessment.includes("`ENG-HIGH-104 / ENG-LOW-211~213`"));
    assert.ok(roadmap.includes("`ENG-HIGH-104 / ENG-LOW-211~213`"));
    assert.ok(backlog.includes("远端发布编排"));
    assert.ok(backlog.includes("远端 `updateURL` 闭环验证"));
    assert.equal(backlog.includes("当前 active 高逻辑已切到 `READER-HIGH-126`"), false);
    assert.equal(readme.includes("当前 active 高逻辑已切到 `READER-HIGH-126`"), false);
    assert.equal(assessment.includes("当前 active 高逻辑已切到 `READER-HIGH-126`"), false);
    assert.equal(roadmap.includes("当前 active 高逻辑已切到 `READER-HIGH-126`"), false);
  });
});
