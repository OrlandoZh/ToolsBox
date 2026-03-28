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

  it("should describe the current product stage as ENG-HIGH-103 after reader-verdict closure", () => {
    const readme = readDoc("README.md");
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const checklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(readme.includes("`ENG-HIGH-103`"));
    assert.ok(backlog.includes("`ENG-HIGH-103`"));
    assert.ok(checklist.includes("`ENG-HIGH-103`"));
    assert.ok(assessment.includes("`ENG-HIGH-103`"));
    assert.ok(roadmap.includes("`ENG-HIGH-103`"));
    assert.ok(readme.includes("`READER-HIGH-123`"));
    assert.ok(backlog.includes("`READER-HIGH-123`"));
    assert.ok(checklist.includes("`READER-HIGH-123`"));
    assert.ok(assessment.includes("`READER-HIGH-123`"));
    assert.ok(roadmap.includes("`READER-HIGH-123`"));
    assert.ok(readme.includes("工程化长期增强第一批"));
    assert.ok(backlog.includes("工程化长期增强第一批"));
    assert.ok(checklist.includes("工程化长期增强第一批"));
    assert.ok(assessment.includes("工程化长期增强第一批"));
    assert.ok(roadmap.includes("工程化长期增强第一批"));
    assert.ok(readme.includes("历史契约源"));
    assert.ok(backlog.includes("历史契约源"));
    assert.ok(checklist.includes("历史契约源"));
    assert.ok(assessment.includes("历史契约源"));
    assert.ok(roadmap.includes("历史契约源"));
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

  it("should keep ENG-HIGH-103 as the single sourced next batch and keep legal gate release-only", () => {
    const readme = readDoc("README.md");
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const checklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");
    const legal = readDoc("LEGAL_RISK_CHECKLIST.md");

    assert.ok(backlog.includes("## 当前单一事实源"));
    assert.ok(backlog.includes("当前唯一主线批次已固定为 `ENG-HIGH-103`"));
    assert.ok(backlog.includes("runtime 生命周期错误边界"));
    assert.ok(backlog.includes("共享失败模型"));
    assert.ok(backlog.includes("远端 `updateURL` 闭环验证"));
    assert.ok(backlog.includes("`release-only` 人工流程"));
    assert.ok(readme.includes("单一事实源"));
    assert.ok(checklist.includes("单一事实源"));
    assert.ok(assessment.includes("单一事实源"));
    assert.ok(roadmap.includes("单一事实源"));
    assert.ok(readme.includes("工程化长期增强第一批"));
    assert.ok(checklist.includes("工程化长期增强第一批"));
    assert.ok(assessment.includes("工程化长期增强第一批"));
    assert.ok(roadmap.includes("工程化长期增强第一批"));
    assert.equal(readme.includes("当前主线只剩 Reader 受控 baseline refresh 收口"), false);
    assert.equal(assessment.includes("重新冻结下一轮高逻辑主线"), false);
    assert.equal(roadmap.includes("重新冻结下一轮高逻辑主线"), false);
    assert.equal(assessment.includes("后续若继续推进，应重新定义下一轮 `P1 / Reader / 工程化` 高逻辑主线"), false);
    assert.ok(legal.includes("## Release Gate (release-only)"));
    assert.ok(legal.includes("发版前人工流程"));
  });

  it("should keep the post-batch default next priority on engineering documentation sync", () => {
    const readme = readDoc("README.md");
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const checklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(readme.includes("工程化维护文档与自动同步机制"));
    assert.ok(backlog.includes("工程化维护文档与自动同步机制"));
    assert.ok(checklist.includes("工程化维护文档与自动同步机制"));
    assert.ok(assessment.includes("工程化维护文档与自动同步机制"));
    assert.ok(roadmap.includes("工程化维护文档与自动同步机制"));
    assert.equal(readme.includes("收口后默认下一优先级是 Reader"), false);
    assert.equal(backlog.includes("收口后默认下一优先级是 Reader"), false);
    assert.equal(assessment.includes("收口后默认下一优先级是 Reader"), false);
    assert.equal(roadmap.includes("收口后默认下一优先级是 Reader"), false);
  });

  it("should keep post-verdict wording aligned with one-time baseline refresh and stable fresh chain", () => {
    const readme = readDoc("README.md");
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(readme.includes("`2026-03-28`"));
    assert.ok(backlog.includes("`2026-03-28`"));
    assert.ok(assessment.includes("`2026-03-28`"));
    assert.ok(roadmap.includes("`2026-03-28`"));
    assert.ok(readme.includes("npm run agent:zotero:e2e:update-baseline"));
    assert.ok(backlog.includes("npm run agent:zotero:e2e:update-baseline"));
    assert.ok(assessment.includes("npm run agent:zotero:e2e:update-baseline"));
    assert.ok(roadmap.includes("npm run agent:zotero:e2e:update-baseline"));
    assert.ok(readme.includes("`2000x1200`"));
    assert.ok(backlog.includes("`2000x1200`"));
    assert.ok(assessment.includes("`2000x1200`"));
    assert.ok(roadmap.includes("`2000x1200`"));
    assert.ok(readme.includes("`watch` 为 healthy"));
    assert.ok(readme.includes("`agent:zotero:e2e` 为 passed"));
    assert.ok(readme.includes("`agent:gate` 为 passed"));
    assert.equal(readme.includes("`library` / `reader` 两个 stage 都仍为 `max-attempt-reached`"), false);
    assert.equal(backlog.includes("`library` / `reader` 两个 stage 都仍为 `max-attempt-reached`"), false);
    assert.equal(readme.includes("当前自动结论已统一为 `ui-regression-candidate + complete -> npm run agent:obsidian`"), false);
    assert.equal(backlog.includes("当前默认 nextAction 必须统一为 `npm run agent:obsidian`"), false);
    assert.equal(assessment.includes("默认 nextAction 必须统一为 `npm run agent:obsidian`"), false);
    assert.equal(roadmap.includes("当前默认 nextAction 必须统一为 `npm run agent:obsidian`"), false);
  });

  it("should record recent reader batches as historical while marking READER-HIGH-123 as closed", () => {
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
    assert.ok(readme.includes("不重复第二次 baseline refresh"));
    assert.ok(backlog.includes("不重复第二次 baseline refresh"));
    assert.ok(assessment.includes("仅执行一次"));
    assert.ok(roadmap.includes("不重复第二次 baseline refresh"));
    assert.ok(readme.includes("`97%`"));
    assert.ok(backlog.includes("`97%`"));
    assert.ok(assessment.includes("`97%`"));
    assert.ok(roadmap.includes("`97%`"));
    assert.ok(readme.includes("当前 active 高逻辑源为 `ENG-HIGH-103`"));
    assert.ok(backlog.includes("当前 active 高逻辑源为 `ENG-HIGH-103`"));
    assert.ok(checklist.includes("当前 active 高逻辑任务源已切到 `ENG-HIGH-103`"));
    assert.ok(assessment.includes("当前 active 高逻辑任务已切到 `ENG-HIGH-103`"));
    assert.ok(roadmap.includes("当前 active 高逻辑 batch 为 `ENG-HIGH-103`"));
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
