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
    const agents = readDoc("AGENTS.md");
    const spec = readDoc("SPEC.md");
    const legal = readDoc("LEGAL_RISK_CHECKLIST.md");
    const readme = readDoc("README.md");
    const guide = readDoc("docs/GUIDE.md");
    const buildChecklist = readDoc("docs/BUILD_DETAILS_CHECKLIST.md");
    const architecture = readDoc("docs/ARCHITECTURE.md");
    const obsidian = readDoc("docs/OBSIDIAN_INTERVENTION.md");

    assert.ok(spec.includes("Zotero Cleanroom Template"));
    assert.ok(spec.includes("Zotero 7/8"));
    assert.ok(spec.includes("8.0.2-beta.5+c35d7f21e"));
    assert.ok(spec.includes("macOS 已验证"));
    assert.equal(spec.includes("Plugin name:"), false);
    assert.equal(spec.includes("Use this file to define *what* the plugin should do"), false);

    assert.ok(agents.includes("这个文件是给新接手仓库的开发 agent 的薄入口"));
    assert.ok(agents.includes("当前“完成度 / 当前主线 / 当前剩余项”只认 [docs/CURRENT_BACKLOG.md](docs/CURRENT_BACKLOG.md) 的“当前单一事实源”"));
    assert.ok(agents.includes("中大型任务默认先由 controller 读 truth、拆阶段、划 scope、再决定是否委托"));
    assert.ok(agents.includes("已存在 `config/agent-delegation-tasks.json` 或 scope 明确的任务时，优先复用 `npm run agent:delegate:list` / `run` / `review` / `close`"));
    assert.ok(agents.includes("默认每批次只保留一个 strict write owner"));
    assert.ok(agents.includes("worker 默认回传结构化简报"));
    assert.ok(agents.includes("先运行 `npm run check`"));
    assert.ok(agents.includes("运行 `npm run agent:monitor` 与 `npm run agent:gate`"));
    assert.ok(agents.includes("validation contract 只决定是否需要视觉证据，不得覆盖 `watch`、`watch-recovery`、workspace/host/provenance guard 这类独立严格阻断；存在更具体的恢复动作时，优先执行具体恢复动作"));
    assert.ok(agents.includes("必须同时更新 `config/project-validation-overrides.json` 与 `docs/CURRENT_BACKLOG.md`"));
    assert.ok(agents.includes("不要让 project mirror 和 `docs/CURRENT_BACKLOG.md` 各写一套阶段口径"));
    assert.ok(agents.includes("`docs/ZOTERO_HOST_SEMANTIC_INDEX.md`"));
    assert.ok(agents.includes("不允许仅根据历史实现、E2E 症状或模糊位置描述发明字段名、按钮名、面板名或事件名。"));
    assert.ok(agents.includes("Host Semantic Index 约束宿主字段、枚举、事件与 surface 语义"));
    assert.ok(agents.includes("远端发布仍是外部步骤"));
    assert.ok(agents.includes("`npm run release:upload -- --provider <provider> --release-tag <tag> --target-base-url <url>`"));
    assert.ok(agents.includes("只会校验本地产物并生成 `dist/release-upload-plan.json` / `md`"));
    assert.ok(agents.includes("如果 `config/addon.config.json` 仍保留模板默认值"));
    assert.ok(agents.includes("agent 必须先向用户确认并初始化这些基础信息"));
    assert.ok(agents.includes("`addonName`、`addonId`、`addonRef`、`author`、`homepage`、`updateURL`"));
    assert.ok(agents.includes("使用 `npm run export:project`"));
    assert.ok(agents.includes("测试必须先显式重置或重新生成本地 release 工件"));
    assert.ok(agents.includes("这些目录同样不应被当作稳定测试夹具"));
    assert.ok(legal.includes("## Development Gate"));
    assert.ok(legal.includes("## Release Gate"));
    assert.ok(legal.includes("Evidence:"));

    assert.ok(readme.includes("npm run cleanroom:audit"));
    assert.ok(readme.includes("npm run cleanroom:sim"));
    assert.ok(readme.includes("npm run docs:sync-current-truth"));
    assert.ok(readme.includes("node scripts/agent-delegation.mjs close <taskId>"));
    assert.ok(readme.includes("git-closure.json"));
    assert.ok(readme.includes("只用于这个模板项目自身的远端发布验收与测试"));
    assert.ok(readme.includes("已被 `.gitignore` 忽略"));
    assert.ok(readme.includes("使用 `npm run export:project` 生成剔除运行时工件与 agent 附件的最小工程"));
    assert.ok(readme.includes("release / toolchain 测试不要把现有 `build/` / `dist/` 当成稳定夹具"));
    assert.ok(readme.includes("先准备 fresh 工件，再断言 JSON/Markdown 输出"));
    assert.ok(readme.includes("`validationDecision` 只决定是否需要视觉证据"));
    assert.ok(readme.includes("优先处理这些独立严格阻断"));
    assert.ok(readme.includes("npm run release:upload -- --provider gitee-release --release-tag 1.1 --target-base-url https://example.com/releases/1.1/"));
    assert.ok(readme.includes("仅校验上传契约并生成 dist/release-upload-plan.json / md，不执行真实上传"));
    assert.ok(readme.includes("## 新 Agent 接手顺序"));
    assert.ok(readme.includes("先读 [当前剩余任务清单](docs/CURRENT_BACKLOG.md)"));
    assert.ok(readme.includes("`npm run agent:monitor` 与 `npm run agent:gate`"));
    assert.ok(readme.includes("如果 `config/addon.config.json` 仍是模板默认值"));
    assert.ok(readme.includes("先暂停开发并询问用户初始化信息"));
    assert.ok(readme.includes("如果本轮改动改变了当前批次的验证分级、可见面判定或 in-scope 模块"));
    assert.ok(readme.includes("project mirror 负责机器可读判定，`docs/CURRENT_BACKLOG.md` 负责当前阶段 truth"));
    assert.ok(readme.includes("默认协作口径"));
    assert.ok(readme.includes("中大型任务先由 controller 读 truth、拆 scope、定 owner"));
    assert.ok(readme.includes("默认每批次只有一个 strict write owner"));
    assert.ok(readme.includes("worker 遇到提权、GUI、联网、宿主启动或 scope 扩张需求时，应回 blocker 和精确命令"));
    assert.ok(guide.includes("仅用于这个模板项目自身的远端发布验收与测试"));
    assert.ok(guide.includes("正常 `git push` 不会上传这些产物"));
    assert.ok(guide.includes("不要把仓库里已有的 `build/` / `dist/` 当稳定输入"));
    assert.ok(guide.includes("`dist/update.json`"));
    assert.ok(guide.includes("不要再手写第二份更新清单"));
    assert.ok(guide.includes("`dist/release-upload-plan.json`"));
    assert.ok(guide.includes("它不会执行真实上传"));
    assert.ok(guide.includes("## Agent 接手流程"));
    assert.ok(guide.includes("先读取 `docs/CURRENT_BACKLOG.md` 的“当前单一事实源”"));
    assert.ok(guide.includes("执行 `npm run agent:monitor` 和 `npm run agent:gate`"));
    assert.ok(guide.includes("如果 `config/addon.config.json` 仍是模板默认值"));
    assert.ok(guide.includes("先暂停功能开发，并先向用户确认"));
    assert.ok(guide.includes("如果你调整了 `config/project-validation-overrides.json` 或 `config/project-expansion-wave.json`"));
    assert.ok(guide.includes("让机器可读 mirror 和人类可读 truth 保持同轮一致"));
    assert.ok(guide.includes("`addon-static/locale/<locale>/main.ftl`"));
    assert.ok(buildChecklist.includes("npm run cleanroom:audit"));
    assert.ok(buildChecklist.includes("npm run cleanroom:sim"));
    assert.ok(architecture.includes("npm run cleanroom:audit"));
    assert.ok(architecture.includes("npm run cleanroom:sim"));
    assert.ok(architecture.includes("### 工具链与发布测试约束"));
    assert.ok(architecture.includes("不能被当作稳定测试前置状态"));
    assert.ok(architecture.includes("`config/zotero-host-semantic-index.json`"));
    assert.ok(architecture.includes("[Zotero Host Semantic Index](ZOTERO_HOST_SEMANTIC_INDEX.md)"));
    assert.ok(architecture.includes("### 5. 条件视觉验证，不覆盖独立硬阻断"));
    assert.ok(architecture.includes("`validationDecision` 只决定“是否需要视觉证据”"));
    assert.ok(architecture.includes("frontpage / gate / monitor 优先给出该恢复动作"));
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

    [
      "`ENG-HIGH-103`",
      "`READER-HIGH-124 / READER-LOW-261~263`",
      "`READER-HIGH-125`",
      "`READER-HIGH-126`",
      "`99%`",
      "`2026-04-06T02:55:03.754Z`",
      "`2026-04-06T02:56:31.821Z`",
      "`2026-04-06T02:57:08.129Z`",
      "`2026-04-06T02:57:08.402Z`",
      "`2026-04-04T10:03:46.084Z`",
      "最新开发态 `agent:monitor` / `agent:gate`",
      "`stable / ready`",
      "`restart` 与 `hot-reload` 两轮均通过",
      "`agent:zotero:e2e:update-baseline`",
      "`visualEvidenceSummary`",
      "属于预期 UI 变化",
      "`library / reader / surface-preference-cleanroomtemplate-preferences / surface-item-pane-cleanroomtemplate-details` 全部对齐",
      "supplemental `capture-unstable`",
      "blocking `surface-local` evidence 优先",
      "`latestPassed=true`",
      "`gatePassed=true`",
      "`zotero:watch`",
      "`agent:context`",
      "`runtime-compact-v1`",
      "`HOST-HIGH-201`",
      "`HOST-HIGH-201 / HOST-LOW-301~303`",
      "`ZOTERO-HOST-POLISH-WAVE-001`",
      "`OPTIONAL-BUNDLE-WAVE-001`",
      "`config/optional-bundles.json`",
      "`host-first -> live geometry / interaction consistency -> surface smoke -> surface-local evidence -> full gate`",
      "`react-ui` 当前固定为 `ts-isolated + implemented + enabled=false`",
      "`agent-runtime` 固定为 `ts-isolated + planned + enabled=false`",
      "`ai-service` 固定为 `js-core + planned + enabled=false`",
      "`build:react-ui`",
      "`window-shell + theme-manager + host action gating`",
      "`config/project-validation-surfaces.json`",
      "`details.runtimeSanitization`",
      "`exclusiveProjectRuntime=true`",
      "project-managed `watch` `zotero` / `plugin-container`",
      "`visibleBannerIDs=[mac-word-plugin-install-container]`",
      "`main.ftl + i18n bridge`",
      "`sync-reminder-container`",
      "`post-upgrade-container`",
      "`file-renaming-banner-container`",
      "`retracted-items-container`",
      "`architecture-warning-container`",
      "`selectedTabMatched=true`",
      "`capture-command-failed`",
      "`windowBounds + sidebarWidth`",
      "`ENG-HIGH-103` 的启动诊断 + runtime 清理 + `pre-capture settle`",
      "`agent:gate:release`",
      "`gatePassed=false`",
      "`release-preflight` / `release-plan` / `release-matrix`",
      "刷新为 `远端验证失败 / failed`",
      "`readinessMode=native`",
      "`apiReady=true`",
      "`https://gitee.com/zouser/user/releases/download/1.1/update.json`",
      "`updateURLHTTPStatus=200`",
      "未包含 `cleanroom-template@example.com` 首条更新记录",
      "未提供有效 `update_link`",
      "仅用于这个模板仓库自身的远端发布验收与测试",
      "下游项目仍需在各自 `config/addon.config.json` 中替换自己的 `addonId` / `homepage` / `updateURL`",
      "`2026-04-04T11:51:00.836Z`",
      "`2026-04-04T11:51:01.248Z`",
      "`2026-04-04T11:53:52.789Z`",
      "`2026-04-04T11:54:00.719Z`",
      "`2026-04-04T11:54:09.269Z`",
      "`2026-04-04T11:54:15.996Z`",
      "`workflowState`",
      "`gateContract`",
      "`nextSteps`",
      "`npm run agent:release`",
      "`release-plan` 遥测",
      "当前 active 开发阻断已清零",
      "release-only 的 `ENG-HIGH-104 / ENG-LOW-211~213` 继续保留为次级 follow-up",
      "`ENG-HIGH-104 / ENG-LOW-211~213`",
    ].forEach((snippet) => {
      assert.ok(summary.includes(snippet), `Missing current-truth snippet: ${snippet}`);
    });

    [
      "`2026-04-05T16:57:19.319Z`",
      "`2026-04-05T16:50:34.863Z`",
      "`2026-04-05T16:55:50.350Z`",
      "`2026-04-05T16:47:07.196Z`",
      "`2026-04-05T16:58:58.507Z`",
      "`2026-04-05T16:58:58.729Z`",
      "`visualDriftCount=0`",
      "`blockerCount=0`",
      "fresh visual evidence fully aligned",
      "`startup / RDP bring-up timeout`",
      "`failedStage=launch-session`",
      "`agent:obsidian`",
      "`watch stale`",
      "`nextAction=npm run agent:gate`",
      "`agent:gate` 为 `ready`",
      "`2026-03-29T14:51:46.240Z`",
      "`2026-03-30T02:18:25.631Z`",
      "`2026-03-30T03:23:12.011Z`",
      "`2026-03-30T03:24:42.589Z`",
      "`2026-03-30T03:24:42.678Z`",
      "`2026-03-29T17:31:23.539Z`",
      "缺少库视图截图",
      "缺少 Reader 截图",
      "双层口径",
      "`实际回归`",
    ].forEach((snippet) => {
      assert.equal(summary.includes(snippet), false, `Unexpected stale current-truth snippet: ${snippet}`);
    });

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
    assert.ok(assessment.includes("`gatePassed=true`"));
    assert.ok(assessment.includes("`gatePassed=false`"));
    assert.equal(roadmap.includes("`capture-unstable` 不再是 fresh 主阻断"), false);
  });

  it("should keep HOST-HIGH-201 as the current main batch while preserving release/updateURL as follow-up", () => {
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const readme = readDoc("README.md");
    const checklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(backlog.includes("`HOST-HIGH-201 / HOST-LOW-301~303`"));
    assert.ok(readme.includes("`HOST-HIGH-201 / HOST-LOW-301~303`"));
    assert.ok(checklist.includes("`HOST-HIGH-201 / HOST-LOW-301~303`"));
    assert.ok(assessment.includes("`HOST-HIGH-201 / HOST-LOW-301~303`"));
    assert.ok(roadmap.includes("`HOST-HIGH-201 / HOST-LOW-301~303`"));
    assert.ok(backlog.includes("`ZOTERO-HOST-POLISH-WAVE-001`"));
    assert.ok(readme.includes("`ZOTERO-HOST-POLISH-WAVE-001`"));
    assert.ok(backlog.includes("`ENG-HIGH-104 / ENG-LOW-211~213`"));
    assert.ok(readme.includes("`ENG-HIGH-104 / ENG-LOW-211~213`"));
    assert.ok(checklist.includes("`ENG-HIGH-104 / ENG-LOW-211~213`"));
    assert.ok(assessment.includes("`ENG-HIGH-104 / ENG-LOW-211~213`"));
    assert.ok(roadmap.includes("`ENG-HIGH-104 / ENG-LOW-211~213`"));
    assert.ok(backlog.includes("宿主可见 UI"));
    assert.ok(backlog.includes("贴边 geometry"));
    assert.ok(backlog.includes("远端发布编排"));
    assert.ok(backlog.includes("远端 `updateURL` 闭环验证"));
    assert.equal(backlog.includes("当前 active 高逻辑已切到 `READER-HIGH-126`"), false);
    assert.equal(readme.includes("当前 active 高逻辑已切到 `READER-HIGH-126`"), false);
    assert.equal(assessment.includes("当前 active 高逻辑已切到 `READER-HIGH-126`"), false);
    assert.equal(roadmap.includes("当前 active 高逻辑已切到 `READER-HIGH-126`"), false);
    assert.equal(backlog.includes("当前 active 高逻辑已切到 `ENG-HIGH-104`"), false);
    assert.equal(readme.includes("当前 active 高逻辑已切到 `ENG-HIGH-104`"), false);
    assert.equal(assessment.includes("当前 active 高逻辑已切到 `ENG-HIGH-104`"), false);
    assert.equal(roadmap.includes("当前 active 高逻辑已切到 `ENG-HIGH-104`"), false);
  });
});
