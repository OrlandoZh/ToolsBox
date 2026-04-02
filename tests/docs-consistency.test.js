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
    assert.ok(summary.includes("`release-matrix` 最新工件为 `failed`"));
    assert.ok(summary.includes("`readinessMode=native`"));
    assert.ok(summary.includes("`apiReady=true`"));
    assert.ok(summary.includes("`https://gitee.com/zouser/user/releases/download/1.1/update.json`"));
    assert.ok(summary.includes("`updateURLHTTPStatus=200`"));
    assert.ok(summary.includes("未包含 `cleanroom-template@example.com` 首条更新记录"));
    assert.ok(summary.includes("未提供有效 `update_link`"));
    assert.ok(summary.includes("仅用于这个模板仓库自身的远端发布验收与测试"));
    assert.ok(summary.includes("下游项目仍需在各自 `config/addon.config.json` 中替换自己的 `addonId` / `homepage` / `updateURL`"));
    assert.ok(summary.includes("`2026-03-30T16:19:38.678Z`"));
    assert.ok(summary.includes("`2026-03-30T16:19:52.762Z`"));
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
