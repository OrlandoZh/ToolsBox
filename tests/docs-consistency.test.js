import fs from "node:fs";
import path from "node:path";
import { describe, it, assert } from "./test-framework.js";

function readDoc(file) {
  return fs.readFileSync(path.resolve(file), "utf-8");
}

function assertIncludesBatch(doc, highTaskId, lowTaskRange, lowTaskIds = []) {
  assert.ok(
    doc.includes(`\`${highTaskId}\``)
      || doc.includes(`\`${highTaskId} / ${lowTaskRange}\``)
      || doc.includes(`${highTaskId} / ${lowTaskRange}`),
  );
  assert.ok(
    doc.includes(`\`${lowTaskRange}\``)
      || doc.includes(`\`${highTaskId} / ${lowTaskRange}\``)
      || doc.includes(`${highTaskId} / ${lowTaskRange}`)
      || lowTaskIds.every((taskId) => doc.includes(`\`${taskId}\``)),
  );
}

describe("Documentation Consistency", () => {
  it("should keep P2 marked as completed in backlog and roadmap", () => {
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(backlog.includes("`P2` 上下文感知记忆与趋势层深化已在本轮代码与测试中落地"));
    assert.ok(backlog.includes("`本轮已完成`"));
    assert.ok(roadmap.includes("`P2` 上下文感知记忆与趋势层深化已按代码与测试落地"));
  });

  it("should describe the current product stage as manual reader verdict standby", () => {
    const readme = readDoc("README.md");
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const checklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(readme.includes("`READER-HIGH-123`"));
    assert.ok(backlog.includes("`READER-HIGH-123`"));
    assert.ok(checklist.includes("`READER-HIGH-123`"));
    assert.ok(assessment.includes("`READER-HIGH-123`"));
    assert.ok(roadmap.includes("`READER-HIGH-123`"));
    assert.ok(readme.includes("等待人工 Reader verdict"));
    assert.ok(backlog.includes("等待人工 Reader verdict"));
    assert.ok(checklist.includes("等待人工 Reader verdict"));
    assert.ok(assessment.includes("等待人工 Reader verdict"));
    assert.ok(roadmap.includes("等待人工 Reader verdict"));
    assert.ok(readme.includes("不再挂新的 active Reader low-task"));
    assert.ok(backlog.includes("不再挂新的 active Reader low-task"));
    assert.ok(checklist.includes("不再挂新的 active Reader low-task"));
    assert.ok(assessment.includes("不再保留新的 active Reader low-task"));
    assert.ok(roadmap.includes("不再挂新的 active Reader low-task"));
    assert.ok(readme.includes("`ENG-HIGH-102 / ENG-LOW-204~206`"));
    assert.ok(backlog.includes("`ENG-HIGH-102 / ENG-LOW-204~206`"));
    assert.ok(checklist.includes("`ENG-LOW-204~206`"));
    assert.ok(assessment.includes("`ENG-HIGH-102 / ENG-LOW-204~206`"));
    assert.ok(roadmap.includes("`ENG-HIGH-102 / ENG-LOW-204~206`"));
    assert.ok(readme.includes("`AGENT_OBSIDIAN_VISUALS=1`"));
    assert.ok(backlog.includes("`AGENT_OBSIDIAN_VISUALS=1`"));
    assert.ok(checklist.includes("`AGENT_OBSIDIAN_VISUALS=1`"));
    assert.ok(assessment.includes("`AGENT_OBSIDIAN_VISUALS=1`"));
    assert.ok(roadmap.includes("`AGENT_OBSIDIAN_VISUALS=1`"));
  });

  it("should keep fresh reader evidence wording aligned with ui-regression-candidate and complete canonical coverage", () => {
    const readme = readDoc("README.md");
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(readme.includes("`reader-ui:reader-visual-drift`"));
    assert.ok(backlog.includes("`reader-ui:reader-visual-drift`"));
    assert.ok(assessment.includes("`reader-ui:reader-visual-drift`"));
    assert.ok(readme.includes("ui-regression-candidate"));
    assert.ok(backlog.includes("ui-regression-candidate"));
    assert.ok(assessment.includes("ui-regression-candidate"));
    assert.ok(roadmap.includes("ui-regression-candidate"));
    assert.ok(readme.includes("complete"));
    assert.ok(backlog.includes("complete"));
    assert.ok(assessment.includes("complete"));
    assert.ok(roadmap.includes("complete"));
    assert.ok(readme.includes("npm run agent:obsidian"));
    assert.ok(backlog.includes("npm run agent:obsidian"));
    assert.ok(assessment.includes("npm run agent:obsidian"));
    assert.ok(roadmap.includes("npm run agent:obsidian"));
    assert.ok(readme.includes("`watch` 为 healthy"));
    assert.ok(readme.includes("`reader event hook diagnostics` 已通过"));
    assert.ok(readme.includes("`reader fine-grained hook diagnostics` 已通过"));
    assert.equal(readme.includes("`library` / `reader` 两个 stage 都仍为 `max-attempt-reached`"), false);
    assert.equal(backlog.includes("`library` / `reader` 两个 stage 都仍为 `max-attempt-reached`"), false);
  });

  it("should record recent reader batches as historical while keeping manual verdict standby as the current default path", () => {
    const readme = readDoc("README.md");
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const checklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(readme.includes("`READER-HIGH-113 / READER-LOW-237~239`"));
    assert.ok(backlog.includes("`READER-HIGH-113 / READER-LOW-237~239`") || backlog.includes("`READER-HIGH-113` 与 `READER-LOW-237~239`"));
    assert.ok(checklist.includes("`READER-LOW-237~239`"));
    assert.ok(assessment.includes("`READER-HIGH-113 / READER-LOW-237~239`"));
    assert.ok(roadmap.includes("`READER-HIGH-113 / READER-LOW-237~239`"));
    assert.ok(readme.includes("`READER-HIGH-119 / READER-LOW-252~254`"));
    assert.ok(backlog.includes("`READER-HIGH-119 / READER-LOW-252~254`"));
    assert.ok(checklist.includes("`READER-LOW-252~254`"));
    assert.ok(assessment.includes("`READER-HIGH-119 / READER-LOW-252~254`"));
    assert.ok(roadmap.includes("`READER-HIGH-119 / READER-LOW-252~254`"));
    assert.ok(readme.includes("`READER-HIGH-120 / READER-LOW-255~257`"));
    assert.ok(backlog.includes("`READER-HIGH-120 / READER-LOW-255~257`"));
    assert.ok(checklist.includes("`READER-LOW-255~257`"));
    assert.ok(assessment.includes("`READER-HIGH-120 / READER-LOW-255~257`"));
    assert.ok(roadmap.includes("`READER-HIGH-120 / READER-LOW-255~257`"));
    assert.ok(readme.includes("`READER-HIGH-122`"));
    assert.ok(backlog.includes("`READER-HIGH-122`"));
    assert.ok(assessment.includes("`READER-HIGH-122`"));
    assert.ok(roadmap.includes("`READER-HIGH-122`"));
    assert.ok(readme.includes("`READER-HIGH-121 / READER-LOW-258~260`"));
    assert.ok(backlog.includes("`READER-HIGH-121 / READER-LOW-258~260`"));
    assert.ok(checklist.includes("`READER-LOW-258~260`"));
    assert.ok(assessment.includes("`READER-HIGH-121 / READER-LOW-258~260`"));
    assert.ok(roadmap.includes("`READER-HIGH-121 / READER-LOW-258~260`"));
    assert.ok(readme.includes("不默认推荐 `npm run agent:zotero:e2e`、`npm run agent:zotero:e2e:update-baseline` 或 `npm run agent:zotero:autofix`"));
    assert.ok(backlog.includes("不再人为制造新的 Reader 自动修复批次"));
    assert.ok(assessment.includes("不回退到 rerun E2E、baseline refresh 或 autofix"));
    assert.ok(roadmap.includes("不默认推荐 `npm run agent:zotero:e2e`、`npm run agent:zotero:e2e:update-baseline` 或 `npm run agent:zotero:autofix`"));
    assert.ok(readme.includes("`95%`"));
    assert.ok(backlog.includes("`95%`"));
    assert.ok(assessment.includes("`95%`"));
    assert.ok(roadmap.includes("`95%`"));
  });

  it("should not keep capture-stability diagnosis wording as the current phase after rebaseline", () => {
    const readme = readDoc("README.md");
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const checklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.equal(readme.includes("当前 active batch 切到 `READER-HIGH-101`"), false);
    assert.equal(backlog.includes("当前 active batch 切到 `READER-HIGH-101`"), false);
    assert.equal(assessment.includes("当前 active batch 切到 `READER-HIGH-101`"), false);
    assert.equal(roadmap.includes("当前 active batch 切到 `READER-HIGH-101`"), false);
    assert.equal(readme.includes("当前 active batch 切到 `READER-HIGH-102`"), false);
    assert.equal(backlog.includes("当前 active batch 切到 `READER-HIGH-102`"), false);
    assert.equal(assessment.includes("当前 manifest 只保留高逻辑源与 `READER-HIGH-102`"), false);
    assert.equal(roadmap.includes("当前 active Reader batch `READER-HIGH-102`"), false);
    assert.equal(readme.includes("当前 active batch 切到 `READER-HIGH-103`"), false);
    assert.equal(backlog.includes("当前 active batch 切到 `READER-HIGH-103`"), false);
    assert.equal(assessment.includes("当前 manifest 只保留高逻辑源与 `READER-HIGH-103`"), false);
    assert.equal(roadmap.includes("按 `READER-HIGH-103 -> READER-LOW-207~209` 的串行顺序收口"), false);
    assert.equal(readme.includes("当前 active batch 切到 `READER-HIGH-104`"), false);
    assert.equal(backlog.includes("当前 active batch 切到 `READER-HIGH-104`"), false);
    assert.equal(assessment.includes("当前 manifest 只保留高逻辑源与 `READER-HIGH-104`"), false);
    assert.equal(roadmap.includes("按 `READER-HIGH-104 -> READER-LOW-210~212` 的串行顺序收口"), false);
    assert.equal(readme.includes("当前 active batch 切到 `READER-HIGH-105`"), false);
    assert.equal(backlog.includes("当前 active batch 切到 `READER-HIGH-105`"), false);
    assert.equal(assessment.includes("当前 manifest 只保留高逻辑源与 `READER-HIGH-105`"), false);
    assert.equal(roadmap.includes("按 `READER-HIGH-105 -> READER-LOW-213~215` 的串行顺序收口"), false);
    assert.equal(readme.includes("当前只保留 `READER-HIGH-114` 作为 active Reader 任务源"), false);
    assert.equal(backlog.includes("当前只保留 `READER-HIGH-114` 作为 active 高逻辑源"), false);
    assert.equal(checklist.includes("当前 active Reader 任务源已切到 `READER-HIGH-114`"), false);
    assert.equal(assessment.includes("当前只保留 `READER-HIGH-114` 作为 active 高逻辑源"), false);
    assert.equal(roadmap.includes("当前只保留 `READER-HIGH-114` 作为 active 高逻辑源"), false);
    assert.equal(readme.includes("当前 active batch 已切到 `READER-HIGH-118 / READER-LOW-249~251`"), false);
    assert.equal(backlog.includes("当前 active batch 已切到 `READER-HIGH-118 / READER-LOW-249~251`"), false);
    assert.equal(assessment.includes("当前 active batch 已切到 `READER-HIGH-118 / READER-LOW-249~251`"), false);
    assert.equal(roadmap.includes("当前 active Reader batch 为 `READER-HIGH-118 / READER-LOW-249~251`"), false);
    assert.equal(readme.includes("当前 active batch 已切到 `READER-HIGH-119 / READER-LOW-252~254`"), false);
    assert.equal(backlog.includes("当前开发批次则进入 `READER-HIGH-119 / READER-LOW-252~254`"), false);
    assert.equal(checklist.includes("当前 active Reader 任务源已切到 `READER-HIGH-119 / READER-LOW-252~254`"), false);
    assert.equal(assessment.includes("当前 active batch 已切到 `READER-HIGH-119 / READER-LOW-252~254`"), false);
    assert.equal(roadmap.includes("当前 active Reader batch 为 `READER-HIGH-119 / READER-LOW-252~254`"), false);
    assert.equal(readme.includes("当前默认主路径应先保持 `npm run agent:zotero:e2e`"), false);
    assert.equal(assessment.includes("当前默认主路径应先保持 `npm run agent:zotero:e2e`"), false);
  });
});
