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
    const claude = readDoc("CLAUDE.md");
    const spec = readDoc("SPEC.md");
    const legal = readDoc("LEGAL_RISK_CHECKLIST.md");
    const readme = readDoc("README.md");
    const guide = readDoc("docs/GUIDE.md");
    const api = readDoc("docs/API.md");
    const buildChecklist = readDoc("docs/BUILD_DETAILS_CHECKLIST.md");
    const architecture = readDoc("docs/ARCHITECTURE.md");
    const obsidian = readDoc("docs/OBSIDIAN_INTERVENTION.md");
    const zoteroTesting = readDoc("docs/ZOTERO_TESTING.md");
    const legalCN = readDoc("docs/LEGAL_CN_STRATEGY.md");
    const provenance = readDoc("CODE_PROVENANCE.md");
    const notices = readDoc("THIRD_PARTY_NOTICES.md");
    const deliveryRights = readDoc("COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md");
    const frameworkChecklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const delegationManifest = readDoc("config/agent-delegation-tasks.json");
    const terminology = readDoc("docs/ZOTERO_TERMINOLOGY_GUIDE.md");
    const validationSurfaces = readDoc("docs/VALIDATION_SURFACES.md");
    const semanticIndex = readDoc("docs/ZOTERO_HOST_SEMANTIC_INDEX.md");
    const interfaceContracts = readDoc("docs/ZOTERO_HOST_INTERFACE_CONTRACTS.md");
    const menuSurfaceScenario = readDoc("zotero-scenarios/menu-surface-smoke.scenario.js");
    const patchLibTests = readDoc("tests/agent-zotero-patch-lib.test.js");
    const featureTypes = readDoc("types/features.d.ts");
    const menuManagerSource = readDoc("src/features/menu-manager.js");

    assert.ok(spec.includes("ToolsBox"));
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
    assert.ok(claude.includes("这个文件是给 Claude Code 的主引导文件"));
    assert.ok(claude.includes("当前模板仍以 [AGENTS.md](AGENTS.md) 作为主协作 contract"));
    assert.ok(claude.includes("controller overlay"));
    assert.ok(claude.includes("先运行 `npm run check`"));
    assert.ok(claude.includes("运行 `npm run agent:monitor` 与 `npm run agent:gate`"));
    assert.ok(claude.includes("适合当前模板的部分"));
    assert.ok(claude.includes("通用性结论"));
    assert.ok(claude.includes("如当前环境已安装并允许调用 `opencode run`"));
    assert.ok(claude.includes("对当前模板，默认优先复用"));
    assert.ok(legal.includes("## Development Gate"));
    assert.ok(legal.includes("## Release Gate"));
    assert.ok(legal.includes("## China Commercial Delivery Gate"));
    assert.ok(legal.includes("Evidence:"));

    assert.ok(readme.includes("npm run cleanroom:audit"));
    assert.ok(readme.includes("npm run cleanroom:sim"));
    assert.ok(readme.includes("npm run docs:sync-current-truth"));
    assert.ok(readme.includes("node scripts/agent-delegation.mjs close <taskId>"));
    assert.ok(readme.includes("git-closure.json"));
    assert.ok(readme.includes("只用于这个模板项目自身的远端发布验收与测试"));
    assert.ok(readme.includes("已被 `.gitignore` 忽略"));
    assert.ok(readme.includes("使用 `npm run export:project` 生成剔除运行时工件与 agent 附件的最小工程"));
    assert.ok(readme.includes("npm run package:encrypted"));
    assert.ok(readme.includes("npm run package:shielded"));
    assert.ok(readme.includes("npm run package:protection:smoke"));
    assert.ok(readme.includes("npm run package:protection:score"));
    assert.ok(readme.includes("npm run package:protection:verdict"));
    assert.ok(readme.includes("[Claude Code 入口](CLAUDE.md)"));
    assert.ok(readme.includes("release / toolchain 测试不要把现有 `build/` / `dist/` 当成稳定夹具"));
    assert.ok(readme.includes("先准备 fresh 工件，再断言 JSON/Markdown 输出"));
    assert.ok(readme.includes("`validationDecision` 只决定是否需要视觉证据"));
    assert.ok(readme.includes("优先处理这些独立严格阻断"));
    assert.ok(readme.includes("npm run release:upload -- --provider gitee-release --release-tag 1.1 --target-base-url https://example.com/releases/1.1/"));
    assert.ok(readme.includes("仅校验上传契约并生成 dist/release-upload-plan.json / md，不执行真实上传"));
    assert.ok(readme.includes("China Commercial Delivery Gate"));
    assert.ok(readme.includes("CODE_PROVENANCE.md"));
    assert.ok(readme.includes("THIRD_PARTY_NOTICES.md"));
    assert.ok(readme.includes("COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md"));
    assert.equal(readme.includes("Zotero-Agent-"), false);
    assert.ok(readme.includes("项目模块图谱/"));
    assert.ok(readme.includes("06-当前扩展波次-模块焦点.md"));
    assert.ok(readme.includes("07-能力目录-当前插件能力清单.md"));
    assert.ok(readme.includes("14-当前Zotero插件-UI 具象布局图.excalidraw.md"));
    assert.ok(readme.includes("12-当前Zotero插件-交互流转图.md"));
    assert.ok(readme.includes("10-模板协作-人工指令窗口.md"));
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
    assert.ok(readme.includes("## Menu Scene Helpers"));
    assert.ok(readme.includes("`menu-manager` 只覆盖 Zotero `MenuManager` 官方 target"));
    assert.ok(readme.includes("`registerItemMenuItem()`"));
    assert.ok(readme.includes("`registerCollectionMenuItem()`"));
    assert.ok(readme.includes("`registerItemPaneInfoRowMenuItem()`"));
    assert.ok(readme.includes("`registerReaderMenubarViewMenuItem()`"));
    assert.ok(readme.includes("`registerItemSubmenu()`、`registerCollectionSubmenu()`、`registerReaderMenubarViewSubmenu()`"));
    assert.ok(readme.includes("`createMenuStateResolver()` + `registerStateDrivenMenu()`"));
    assert.ok(readme.includes("`collectionTreeRowID`、`collectionTreeRowType`"));
    assert.ok(readme.includes("Reader `createViewContextMenu` / `createAnnotationContextMenu` 不属于 `menu-manager`"));
    assert.ok(readme.includes("`registerContextMenuItem()`、`registerReaderMenuItem()` 与 `registerSubmenu()` 继续保留为兼容 helper"));
    assert.ok(readme.includes("`registerContextMenuItem(...)` 且 target 固定为 `main/library/item` 时，直接迁到 `registerItemMenuItem(...)`"));
    assert.ok(readme.includes("`registerReaderMenuItem({ target: MENU_TARGETS.READER_MENU_VIEW }, ...)` 时，直接迁到 `registerReaderMenubarViewMenuItem(...)`"));
    assert.ok(readme.includes("`registerSubmenu({ target: MENU_TARGETS.LIBRARY_ITEM | LIBRARY_COLLECTION | READER_MENU_VIEW, ... })` 时，优先直接迁到对应的 scene submenu helper"));
    assert.ok(readme.includes("只有确实需要跨 target 做通用子菜单装配时，再继续保留 `registerSubmenu(...)`"));
    assert.ok(guide.includes("仅用于这个模板项目自身的远端发布验收与测试"));
    assert.ok(guide.includes("npm run package:encrypted"));
    assert.ok(guide.includes("npm run package:shielded"));
    assert.ok(guide.includes("npm run package:protection:smoke"));
    assert.ok(guide.includes("npm run package:protection:score"));
    assert.ok(guide.includes("npm run package:protection:verdict"));
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
    assert.ok(guide.includes("`npm run agent:ui:design -- run product-ui-design-update --goal"));
    assert.ok(guide.includes("20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md"));
    assert.ok(guide.includes("China Commercial Delivery Gate"));
    assert.ok(guide.includes("CODE_PROVENANCE.md"));
    assert.ok(guide.includes("`addon-static/locale/<locale>/main.ftl`"));
    assert.ok(guide.includes("`menu-manager` 只覆盖 Zotero `MenuManager` 官方 target"));
    assert.ok(guide.includes("`main/library/item`、`main/library/collection`、`itemPane/info/row`、`reader/menubar/view`"));
    assert.ok(guide.includes("Reader `createViewContextMenu` / `createAnnotationContextMenu` 不属于 `menu-manager`"));
    assert.ok(guide.includes("[Reference Plugin Menu Patterns](./REFERENCE_PLUGIN_MENU_PATTERNS.md)"));
    assert.ok(guide.includes("`registerItemMenuItem()`"));
    assert.ok(guide.includes("`registerItemPaneInfoRowMenuItem()`"));
    assert.ok(guide.includes("`registerReaderMenubarViewMenuItem()`"));
    assert.ok(guide.includes("`registerViewContextMenuItem()`"));
    assert.ok(guide.includes("`registerAnnotationContextMenuItem()`"));
    assert.ok(guide.includes("`registerContextMenuItem()`、`registerReaderMenuItem()` 与 `registerSubmenu()` 继续保留为兼容 helper"));
    assert.ok(guide.includes("`registerContextMenuItem(...)` 且 target 固定为 `main/library/item` 时，直接迁到 `registerItemMenuItem(...)`"));
    assert.ok(guide.includes("`registerReaderMenuItem({ target: MENU_TARGETS.READER_MENU_VIEW }, ...)` 时，直接迁到 `registerReaderMenubarViewMenuItem(...)`"));
    assert.ok(guide.includes("`registerSubmenu({ target: MENU_TARGETS.LIBRARY_ITEM | LIBRARY_COLLECTION | READER_MENU_VIEW, ... })` 时，优先迁到对应的 scene submenu helper"));
    assert.ok(guide.includes("只有确实需要跨 target 做通用子菜单装配时，再保留 `registerSubmenu(...)`"));
    assert.ok(guide.includes("`createViewContextMenu` / `createAnnotationContextMenu` 不要走 `menu-manager` 兼容 helper"));
    assert.ok(guide.includes("不要把 Reader 上下文菜单并进 `menu-manager`"));
    assert.ok(guide.includes("`createMenuStateResolver()` + `registerStateDrivenMenu()`"));
    assert.ok(guide.includes("`collectionTreeRowID`、`collectionTreeRowType`"));
    assert.ok(guide.includes("`popup repair` 继续只作为 hardening fallback 索引"));
    assert.ok(api.includes("`menu-manager` 只覆盖 Zotero `MenuManager` 官方 target"));
    assert.ok(api.includes("`createViewContextMenu` / `createAnnotationContextMenu` 不属于 `menu-manager`"));
    assert.ok(api.includes("`registerItemMenuItem()`"));
    assert.ok(api.includes("`registerItemPaneInfoRowMenuItem()`"));
    assert.ok(api.includes("`registerReaderMenubarViewMenuItem()`"));
    assert.ok(api.includes("`registerViewContextMenuItem()` / `registerAnnotationContextMenuItem()`"));
    assert.ok(api.includes("`registerContextMenuItem()` 仍保留为 `main/library/item` 的兼容别名"));
    assert.ok(api.includes("`registerReaderMenuItem()` 仍保留为 `reader/menubar/*` 的通用 target helper"));
    assert.ok(api.includes("`registerSubmenu()` 仍保留为跨 target 的通用子菜单 helper"));
    assert.ok(api.includes("新代码、模板片段和 agent 自动修复默认使用 scene helper"));
    assert.ok(api.includes("已有 `registerContextMenuItem(...)` 且 target 固定为 `main/library/item` 时，优先直接迁到 `registerItemMenuItem(...)`"));
    assert.ok(api.includes("已有 `registerReaderMenuItem({ target: MENU_TARGETS.READER_MENU_VIEW }, ...)` 时，优先直接迁到 `registerReaderMenubarViewMenuItem(...)`"));
    assert.ok(api.includes("已有 `registerSubmenu({ target: MENU_TARGETS.LIBRARY_ITEM | LIBRARY_COLLECTION | READER_MENU_VIEW, ... })` 时，优先直接迁到对应的 scene submenu helper"));
    assert.ok(api.includes("只有确实需要跨 `reader/menubar/*` 多个 target 复用一套注册入口时，再继续保留 `registerReaderMenuItem(...)`"));
    assert.ok(api.includes("只有确实需要跨 target 做通用子菜单装配时，再继续保留 `registerSubmenu(...)`"));
    assert.ok(api.includes("Reader context menu 与 renderToolbar surface"));
    assert.ok(api.includes("`createMenuStateResolver()` + `registerStateDrivenMenu()`"));
    assert.ok(api.includes("`collectionTreeRowID`、`collectionTreeRowType`"));
    assert.equal(obsidian.includes("Zotero-Agent-"), false);
    assert.ok(obsidian.includes("00-当前Zotero插件-功能与技术脉络.canvas"));
    assert.ok(obsidian.includes("项目模块图谱/00-当前Zotero插件-功能模块总览.md"));
    assert.ok(obsidian.includes("项目模块图谱/06-当前扩展波次-模块焦点.md"));
    assert.ok(obsidian.includes("项目模块图谱/07-能力目录-当前插件能力清单.md"));
    assert.ok(obsidian.includes("14-当前Zotero插件-UI 具象布局图.excalidraw.md"));
    assert.ok(obsidian.includes("10-模板协作-人工指令窗口.md"));
    assert.ok(obsidian.includes("npm run agent:ui:design -- run product-ui-design-update --goal"));
    assert.ok(obsidian.includes("20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md"));
    assert.equal(zoteroTesting.includes("Zotero-Agent-"), false);
    assert.ok(zoteroTesting.includes("11-当前Zotero插件-菜单与子菜单 UI 概念.excalidraw.md"));
    assert.ok(zoteroTesting.includes("13-当前Zotero插件-功能版图.excalidraw.md"));
    assert.ok(zoteroTesting.includes("项目模块图谱/当前Zotero插件-功能模块图谱.canvas"));
    assert.ok(zoteroTesting.includes("项目模块图谱/06-当前扩展波次-模块焦点.md"));
    assert.ok(zoteroTesting.includes("项目模块图谱/07-能力目录-当前插件能力清单.md"));
    assert.ok(zoteroTesting.includes("14-当前Zotero插件-UI 具象布局图.excalidraw.md"));
    assert.equal(frameworkChecklist.includes("Zotero-Agent-"), false);
    assert.ok(frameworkChecklist.includes("当前工作台默认反映的是“当前 Zotero 插件”的功能面、可见面和技术脉络"));
    assert.equal(delegationManifest.includes("Zotero-Agent-"), false);
    assert.ok(delegationManifest.includes("01-当前Zotero插件-状态总览.md"));
    assert.ok(delegationManifest.includes("10-模板协作-人工指令窗口.md"));
    assert.ok(terminology.includes("`view context menu` / `createViewContextMenu`"));
    assert.ok(terminology.includes("先区分 `reader/menubar/view` 与 `createViewContextMenu` / `createAnnotationContextMenu`"));
    assert.ok(terminology.includes("不要用笼统的 `reader menu`"));
    assert.ok(validationSurfaces.includes("### `collection-menu`"));
    assert.ok(validationSurfaces.includes("### `menu-submenu`"));
    assert.ok(validationSurfaces.includes("`menuPath`"));
    assert.ok(validationSurfaces.includes("popup repair or direct DOM fallback as the default submenu verification path"));
    assert.ok(semanticIndex.includes("official MenuManager host-visible menu item 语义"));
    assert.ok(semanticIndex.includes("`collection-menu` / `collection-menu`"));
    assert.ok(semanticIndex.includes("`menu-submenu` / `menu-submenu`"));
    assert.ok(semanticIndex.includes("`collectionTreeRowID: unknown;`"));
    assert.ok(semanticIndex.includes("createMenuStateResolver(options?: MenuStateResolverOptions)"));
    assert.ok(semanticIndex.includes("registerStateDrivenMenu(options: StateDrivenMenuOptions): string | null;"));
    assert.ok(semanticIndex.includes("`registerItemMenuItem(`"));
    assert.ok(semanticIndex.includes("`registerReaderMenubarViewMenuItem(`"));
    assert.ok(semanticIndex.includes("`registerSubmenu(`"));
    assert.ok(semanticIndex.includes("`registerViewContextMenuItem(menuItemOrFactory: ReaderContextMenuItemSource"));
    assert.ok(semanticIndex.includes("`view context menu` / 视图区上下文菜单"));
    assert.ok(semanticIndex.includes("createViewContextMenu 属于 Reader.registerEventListener surface"));
    assert.ok(interfaceContracts.includes("仅覆盖 official MenuManager surfaces"));
    assert.ok(interfaceContracts.includes("state-driven menu helpers"));
    assert.ok(interfaceContracts.includes("`collectionTreeRowID: unknown;`"));
    assert.ok(interfaceContracts.includes("createMenuStateResolver(options?: MenuStateResolverOptions)"));
    assert.ok(interfaceContracts.includes("registerStateDrivenMenu(options: StateDrivenMenuOptions): string | null;"));
    assert.ok(interfaceContracts.includes("`function registerItemMenuItem(menuItem) {`"));
    assert.ok(interfaceContracts.includes("`function registerReaderMenubarViewMenuItem(menuItem) {`"));
    assert.ok(interfaceContracts.includes("compat helper registration"));
    assert.ok(interfaceContracts.includes("`function registerSubmenu(config) {`"));
    assert.ok(interfaceContracts.includes("`function registerViewContextMenuItem(menuItemOrFactory, options = {}) {`"));
    assert.ok(interfaceContracts.includes("Reader context menu 与 renderToolbar surface"));
    assert.ok(interfaceContracts.includes("CREATE_VIEW_CONTEXT_MENU: \"createViewContextMenu\""));
    assert.ok(interfaceContracts.includes("CREATE_ANNOTATION_CONTEXT_MENU: \"createAnnotationContextMenu\""));
    assert.ok(menuSurfaceScenario.includes("registerReaderMenubarViewMenuItem({"));
    assert.equal(menuSurfaceScenario.includes("registerReaderMenuItem("), false);
    assert.ok(patchLibTests.includes("menuManager.registerItemMenuItem({"));
    assert.ok(patchLibTests.includes("menuManager.registerReaderMenubarViewMenuItem({"));
    assert.equal(patchLibTests.includes("menuManager.registerContextMenuItem({"), false);
    assert.equal(patchLibTests.includes("menuManager.registerReaderMenuItem("), false);
    assert.ok(featureTypes.includes("// 推荐 scene helper"));
    assert.ok(featureTypes.includes("// 兼容 alias（默认不作为新代码推荐写法）"));
    assert.ok(menuManagerSource.includes("兼容别名；推荐新代码改用 registerItemMenuItem"));
    assert.ok(menuManagerSource.includes("兼容 helper；推荐 reader/menubar/view 使用 registerReaderMenubarViewMenuItem"));
    assert.ok(menuManagerSource.includes("兼容 helper；推荐优先使用 scene-specific submenu helpers"));
    assert.ok(buildChecklist.includes("npm run cleanroom:audit"));
    assert.ok(buildChecklist.includes("npm run cleanroom:sim"));
    assert.ok(buildChecklist.includes("CODE_PROVENANCE.md"));
    assert.ok(buildChecklist.includes("China Commercial Delivery Gate"));
    assert.ok(architecture.includes("npm run cleanroom:audit"));
    assert.ok(architecture.includes("npm run cleanroom:sim"));
    assert.ok(architecture.includes("商业交付权利瑕疵"));
    assert.ok(architecture.includes("COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md"));
    assert.ok(architecture.includes("### 工具链与发布测试约束"));
    assert.ok(architecture.includes("不能被当作稳定测试前置状态"));
    assert.ok(architecture.includes("`config/zotero-host-semantic-index.json`"));
    assert.ok(architecture.includes("[Zotero Host Semantic Index](ZOTERO_HOST_SEMANTIC_INDEX.md)"));
    assert.ok(architecture.includes("### 5. 条件视觉验证，不覆盖独立硬阻断"));
    assert.ok(architecture.includes("`validationDecision` 只决定“是否需要视觉证据”"));
    assert.ok(architecture.includes("frontpage / gate / monitor 优先给出该恢复动作"));
    assert.ok(obsidian.includes("等待人工 Reader verdict"));
    assert.ok(obsidian.includes("npm run agent:zotero:e2e:update-baseline"));
    assert.ok(legalCN.includes("中国法优先的法务治理策略"));
    assert.ok(legalCN.includes("China Commercial Delivery Gate"));
    assert.ok(provenance.includes("## 模块来源摘要"));
    assert.ok(provenance.includes("## reference 使用边界"));
    assert.ok(notices.includes("## 当前发布包内第三方项"));
    assert.ok(deliveryRights.includes("## 权利边界"));
    assert.ok(deliveryRights.includes("UNLICENSED"));
  });

  it("should keep P2 marked as completed background in backlog and roadmap", () => {
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(backlog.includes("`P2` 上下文感知记忆与趋势层深化已完成并保留为背景"));
    assert.ok(backlog.includes("历史基线收口"));
    assert.ok(roadmap.includes("`P2` 上下文感知记忆与趋势层深化已完成并保留为背景"));
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

  it("should keep current truth aligned with the Attachment Version wave under release freeze", () => {
    const summary = readCurrentTruthSummary(process.cwd());
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const readme = readDoc("README.md");
    const checklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");
    const legal = readDoc("LEGAL_RISK_CHECKLIST.md");

    [
      "`STYLE-FEATURE-MATRIX-AND-ATTACHMENT-VERSION-WAVE-001`",
      "`planned-feature-matrix-and-local-attachment-version-preview`",
      "`docs/evidence/STYLE_FEATURE_MATRIX.md`",
      "`Attachment Version`",
      "`planned/not implemented`",
      "默认关闭、本地只读、Item Pane 预览型 prototype",
      "`attachmentVersion.enabled=false`",
      "`toolsbox-attachment-version`",
      "选中 regular item 时列出 child attachments",
      "选中 attachment 时列出同 parent 下的 sibling attachments",
      "owner-tagged DOM",
      "`cleanup()` / `destroy()`",
      "不切换附件",
      "不覆盖文件",
      "不删除附件",
      "不重命名附件",
      "不创建 note",
      "不改 annotation",
      "不接网络/AI",
      "用户已要求“先冻结发布”",
      "禁止执行 `gh release create`",
      "`gh release upload`",
      "真实远端 asset mutation",
      "`npm run release:preflight -- --verify-remote`",
      "`npm run agent:gate:release`",
      "也不改 git remote 或 `config/addon.config.json` 的 `updateURL`",
      "`RELEASE-FREEZE-WAVE-001`",
      "`RELEASE-REMOTE-DISTRIBUTION-WAVE-001` 已完成安全 readiness 检查但未执行发布",
      "`STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001`",
      "本波不继续三选一远端发布决策",
      "`createFeatureComposer({ ..., zotero })`",
      "`globalThis.Zotero`",
      "`annotationColumn.enabled`",
      "`annotationDistributionColumn.enabled`",
      "Backlinks functional scope 已收口",
      "`zotero:scenario -- --addon-pref backlinks.enabled=true`",
      "live Item Pane local graph/list",
      ".toolsbox-backlinks-drilldown-button",
      "Backlinks section 不注册",
      "不写 Zotero relation",
      "不修改 item/note/annotation 数据",
      "`backlinks.enabled=false`",
      "`collectBacklinksForItemAsync`",
      "`buildBacklinkGraphForItem`",
      "`selectBacklinkSource`",
      "Merge Annotations 继续作为历史 baseline",
      "`mergeAnnotations.enabled=false`",
      "`planned/default-off`",
      "`Style Editor`",
      "`TLDR`",
      "`Custom External API`",
      "`Paper Matrix Enhanced`",
      "Backlinks semantic search / relation writeback / cross-library sync",
      "不在偏好设置面板中表现为已可用功能",
      "不把缺 API key 当作本轮主阻断",
      "Collection DOM patch",
      "Reader `_iframeWindow`",
      "owner-tagged DOM",
      "幂等 cleanup / destroy",
      "本波不重新打开这些 surface",
      "不把任何 prototype 升格为默认开启或 beta 可用入口",
      "当前 release-only 历史线 `ENG-HIGH-104 / ENG-LOW-211~213` 已冻结在远端 readiness 之后",
      "`ENG-HIGH-103`",
      "`READER-HIGH-124 / READER-LOW-261~263`",
      "`READER-HIGH-125`",
      "`READER-HIGH-126`",
      "`HOST-HIGH-201 / HOST-LOW-301~303`",
      "`ZOTERO-HOST-POLISH-WAVE-001`",
      "`OPTIONAL-BUNDLE-WAVE-001`",
      "`P2` 上下文感知记忆与趋势层深化已完成并保留为背景",
      "Backlinks full UI visual evidence 分类",
      "release local preflight 与 release freeze closure",
      "本波不追 `zotero-style` 100% 复刻",
      "default-off local Attachment Version prototype 与 feature matrix",
    ].forEach((snippet) => {
      assert.ok(summary.includes(snippet), `Missing current-truth snippet: ${snippet}`);
    });

    [
      "313 tests 100%",
      "功能代码 100%",
      "`99%`",
      "当前唯一未收口主线已切到 release-only",
      "`agent:gate` 当前已通过",
      "fresh visual evidence fully aligned",
      "缺少库视图截图",
      "缺少 Reader 截图",
      "双层口径",
      "`实际回归`",
      "本波只在绿色 hardening baseline 上推进一个 default-off local Backlinks prototype",
      "本波只在绿色 baseline 上推进一个 default-off local Merge Annotations note writeback workflow",
      "本波已在绿色 baseline 上完成一个 default-off local Merge Annotations note writeback workflow",
      "本波只补 enabled Merge Annotations 真实 Zotero Item Pane writeback/upsert E2E 证据",
      "当前主线固定为 `RELEASE-FREEZE-WAVE-001`",
      "当前 active expansion wave: `RELEASE-FREEZE-WAVE-001`",
      "`release-frozen-no-remote-mutation`",
      "本波只冻结 release，不新增功能",
      "下一条未收口线是远端 `update.json` / `update_link` 真实分发闭环",
      "真实远端 `update.json` / `update_link` 分发闭环留给下一波",
      "本波只推进远端 release distribution readiness / closure",
      "`remote-update-json-update-link-distribution-closure`",
      "本轮“完成”只表示远端 `update.json` / `update_link` 真实分发闭环通过",
      "远端 `update.json` 与其中的 `update_link` 真实公开可达",
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
    assert.ok(assessment.includes("`READER-HIGH-123` 已完成唯一分支收口，并转为历史契约源"));
    assert.ok(assessment.includes("`READER-HIGH-124`"));
    assert.ok(assessment.includes("`READER-HIGH-125`"));
    assert.ok(assessment.includes("`READER-HIGH-126`"));
    assert.ok(assessment.includes("`AGENT_OBSIDIAN_VISUALS=1`"));
    assert.ok(roadmap.includes("`READER-HIGH-125`"));
    assert.ok(roadmap.includes("`READER-HIGH-126`"));
    assert.ok(roadmap.includes("`AGENT_OBSIDIAN_VISUALS=1`"));
    assert.equal(readme.includes("`agent:gate` 当前已通过"), false);
    assert.ok(assessment.includes("`STYLE-FEATURE-MATRIX-AND-ATTACHMENT-VERSION-WAVE-001`"));
    assert.equal(roadmap.includes("`capture-unstable` 不再是 fresh 主阻断"), false);
  });

  it("should keep Attachment Version as the current mainline while preserving release freeze", () => {
    const backlog = readDoc("docs/CURRENT_BACKLOG.md");
    const readme = readDoc("README.md");
    const checklist = readDoc("FRAMEWORK_CHECKLIST.md");
    const assessment = readDoc("FRAMEWORK_ASSESSMENT.md");
    const roadmap = readDoc("docs/AGENT_AUTONOMY_ROADMAP.md");

    assert.ok(backlog.includes("`STYLE-PROTOTYPE-HARDENING-WAVE-001`"));
    assert.ok(readme.includes("`STYLE-PROTOTYPE-HARDENING-WAVE-001`"));
    assert.ok(checklist.includes("`STYLE-PROTOTYPE-HARDENING-WAVE-001`"));
    assert.ok(assessment.includes("`STYLE-PROTOTYPE-HARDENING-WAVE-001`"));
    assert.ok(roadmap.includes("`STYLE-PROTOTYPE-HARDENING-WAVE-001`"));
    assert.ok(backlog.includes("`STYLE-BACKLINKS-LOCAL-WAVE-001`"));
    assert.ok(readme.includes("`STYLE-BACKLINKS-LOCAL-WAVE-001`"));
    assert.ok(backlog.includes("`STYLE-MERGE-ANNOTATIONS-PREVIEW-WAVE-001`"));
    assert.ok(readme.includes("`STYLE-MERGE-ANNOTATIONS-PREVIEW-WAVE-001`"));
    assert.ok(backlog.includes("`STYLE-MERGE-ANNOTATIONS-WRITEBACK-WAVE-001`"));
    assert.ok(readme.includes("`STYLE-MERGE-ANNOTATIONS-WRITEBACK-WAVE-001`"));
    assert.ok(backlog.includes("`STYLE-MERGE-ANNOTATIONS-WRITEBACK-E2E-WAVE-001`"));
    assert.ok(readme.includes("`STYLE-MERGE-ANNOTATIONS-WRITEBACK-E2E-WAVE-001`"));
    assert.ok(backlog.includes("`STYLE-BACKLINKS-VISUAL-EVIDENCE-CLOSURE-WAVE-001`"));
    assert.ok(readme.includes("`STYLE-BACKLINKS-VISUAL-EVIDENCE-CLOSURE-WAVE-001`"));
    assert.ok(backlog.includes("`STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001`"));
    assert.ok(readme.includes("`STYLE-CLOSURE-AND-RELEASE-PREFLIGHT-WAVE-001`"));
    assert.ok(backlog.includes("`STYLE-FEATURE-MATRIX-AND-ATTACHMENT-VERSION-WAVE-001`"));
    assert.ok(readme.includes("`STYLE-FEATURE-MATRIX-AND-ATTACHMENT-VERSION-WAVE-001`"));
    assert.ok(backlog.includes("`planned-feature-matrix-and-local-attachment-version-preview`"));
    assert.ok(readme.includes("`planned-feature-matrix-and-local-attachment-version-preview`"));
    assert.ok(backlog.includes("`docs/evidence/STYLE_FEATURE_MATRIX.md`"));
    assert.ok(readme.includes("`docs/evidence/STYLE_FEATURE_MATRIX.md`"));
    assert.ok(backlog.includes("`attachmentVersion.enabled=false`"));
    assert.ok(readme.includes("`attachmentVersion.enabled=false`"));
    assert.ok(backlog.includes("`toolsbox-attachment-version`"));
    assert.ok(readme.includes("`toolsbox-attachment-version`"));
    assert.ok(backlog.includes("本地只读 Item Pane preview prototype"));
    assert.ok(readme.includes("本地只读 Item Pane preview prototype"));
    assert.ok(backlog.includes("`RELEASE-FREEZE-WAVE-001`"));
    assert.ok(readme.includes("`RELEASE-FREEZE-WAVE-001`"));
    assert.ok(backlog.includes("用户已要求“先冻结发布”"));
    assert.ok(readme.includes("用户已要求“先冻结发布”"));
    assert.ok(backlog.includes("发布冻结继续有效且优先级不变"));
    assert.ok(readme.includes("发布冻结继续有效且优先级不变"));
    assert.ok(backlog.includes("`RELEASE-REMOTE-DISTRIBUTION-WAVE-001`"));
    assert.ok(readme.includes("`RELEASE-REMOTE-DISTRIBUTION-WAVE-001`"));
    assert.ok(backlog.includes("`dist/release-matrix.json` 为 `attention`"));
    assert.equal(readme.includes("`dist/release-matrix.json` 当前为 `attention`"), false);
    assert.ok(backlog.includes("`gh auth status -h github.com` 显示未登录"));
    assert.ok(backlog.includes("当前 `git remote -v` 指向 `https://github.com/OrlandoZh/AddonTemplate4Z.git`"));
    assert.ok(backlog.includes("冻结未解除前禁止执行 `gh release create`"));
    assert.ok(readme.includes("冻结未解除前禁止执行 `gh release create`"));
    assert.equal(backlog.includes("当前 active expansion wave: `RELEASE-FREEZE-WAVE-001`"), false);
    assert.equal(readme.includes("当前 active expansion wave: `RELEASE-FREEZE-WAVE-001`"), false);
    assert.equal(backlog.includes("当前 active expansion wave: `RELEASE-REMOTE-DISTRIBUTION-WAVE-001`"), false);
    assert.equal(readme.includes("当前 active expansion wave: `RELEASE-REMOTE-DISTRIBUTION-WAVE-001`"), false);
    assert.equal(backlog.includes("本波只推进远端 release distribution readiness / closure"), false);
    assert.equal(readme.includes("本波只推进远端 release distribution readiness / closure"), false);
    assert.ok(backlog.includes("`STYLE-BACKLINKS-LOCAL-GRAPH-E2E-WAVE-001`"));
    assert.ok(readme.includes("`STYLE-BACKLINKS-LOCAL-GRAPH-E2E-WAVE-001`"));
    assert.ok(backlog.includes("`zotero:scenario -- --addon-pref backlinks.enabled=true`"));
    assert.ok(readme.includes("`zotero:scenario -- --addon-pref backlinks.enabled=true`"));
    assert.ok(backlog.includes("默认仍为 `backlinks.enabled=false`"));
    assert.ok(readme.includes("默认仍为 `backlinks.enabled=false`"));
    assert.ok(backlog.includes("`.toolsbox-backlinks-drilldown-button`"));
    assert.ok(readme.includes("`.toolsbox-backlinks-drilldown-button`"));
    assert.ok(backlog.includes("不写 Zotero relation"));
    assert.ok(readme.includes("不写 Zotero relation"));
    assert.ok(backlog.includes("不修改 item/note/annotation 数据"));
    assert.ok(readme.includes("不修改 item/note/annotation 数据"));
    assert.ok(backlog.includes("Backlinks local prototype"));
    assert.ok(readme.includes("Backlinks local prototype"));
    assert.ok(backlog.includes("本波不追 `zotero-style` 100% 复刻"));
    assert.ok(readme.includes("本波不追 `zotero-style` 100% 复刻"));
    assert.ok(backlog.includes("planned/default-off"));
    assert.ok(readme.includes("planned/default-off"));
    assert.ok(backlog.includes("Attachment Version | 本地只读 attachment version preview prototype"));
    assert.ok(backlog.includes("Style Editor | planned/not implemented"));
    assert.equal(backlog.includes("Attachment Version | planned/not implemented"), false);
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
    assert.ok(backlog.includes("当前 blocker 是用户已要求先冻结发布，目标远端仓库 / CLI auth / asset upload 尚未确认"));
    assert.ok(readme.includes("当前 release-only 历史线 `ENG-HIGH-104 / ENG-LOW-211~213` 已冻结在远端 readiness 之后"));
    assert.equal(backlog.includes("当前 active 高逻辑已切到 `READER-HIGH-126`"), false);
    assert.equal(readme.includes("当前 active 高逻辑已切到 `READER-HIGH-126`"), false);
    assert.equal(assessment.includes("当前 active 高逻辑已切到 `READER-HIGH-126`"), false);
    assert.equal(roadmap.includes("当前 active 高逻辑已切到 `READER-HIGH-126`"), false);
    assert.equal(backlog.includes("`HOST-HIGH-201` 为当前主批次"), false);
    assert.equal(readme.includes("`HOST-HIGH-201` 为当前主批次"), false);
    assert.equal(assessment.includes("`HOST-HIGH-201` 为当前主批次"), false);
    assert.equal(roadmap.includes("`HOST-HIGH-201` 为当前主批次"), false);
    assert.equal(backlog.includes("当前唯一未收口主线已切到 release-only"), false);
    assert.equal(readme.includes("当前唯一未收口主线已切到 release-only"), false);
  });
});
