import { describe, it, assert } from "./test-framework.js";
import {
  buildObsidianVisualFlowMermaidMarkdown,
  buildObsidianVisualVerdictExcalidrawMarkdown,
  buildObsidianVisualViewModel,
  buildObsidianInterventionCanvas,
  buildObsidianEvidenceMarkdown,
  buildHumanAdvancedGuideMarkdown,
  buildHumanQuickstartMarkdown,
  buildObsidianInterventionMarkdown,
  buildHumanInterventionWindowMarkdown,
  parseHumanInterventionWindow,
  summarizeObsidianInterventionContext,
} from "../scripts/agent-obsidian-handoff-lib.mjs";

describe("Agent Obsidian Handoff Lib", () => {
  it("should summarize intervention context from loop and gate reports", () => {
    const summary = summarizeObsidianInterventionContext({
      loop: {
        nextAction: "npm run agent:zotero:autofix",
        finalState: {
          frontpageSummary: {
            statusLabel: "需关注",
            headline: "最近自动修复未恢复成功。",
            primarySignals: ["最近自动修复未恢复成功。"],
          },
          issues: ["最近自动修复未恢复成功。"],
        },
      },
      gate: {
        frontpageSummary: {
          primaryBlockers: ["当前 gate 未通过。"],
        },
      },
      e2e: {
        primaryDiagnosis: {
          featureLabel: "启动与挂载",
          summary: "插件实例未稳定挂载到 Zotero 运行时。",
          candidateFiles: ["src/app/plugin.js"],
        },
      },
      monitor: {
        zoteroValidation: {
          e2e: {
            readerHostStateSummary: "侧边栏视图 annotations；流模式 paginated；分栏 none；滚动 0；跨页 0；缩放 page-width；上下文面板 关闭；第二视图 无",
            readerHostStateNote: "已从 Reader interaction diagnostics 场景读回 7 项深层宿主状态。",
            visualPrimaryBlockerKind: "capture-unstable",
            visualPrimaryBlockerKindLabel: "采集未稳定",
            visualGeometrySummary: "library 几何不一致 2000x1200 / 3388x2172；reader 几何不一致 2000x1200 / 3388x2172",
            visualCanonicalCoverageSummary: "canonical 基线覆盖待补证：缺少可靠几何证据",
            visualCanonicalMismatchedTargets: ["hot-reload-library.png"],
            },
          autofix: {
            patchPlanStatusLabel: "可进入受限补丁审阅",
            patchPlanFeature: "本地化引用修正",
            patchDraftOperations: [
              { label: "创建文件", count: 1 },
            ],
            patchApplicationStatusLabel: "预检失败",
            patchApplicationIssues: [
              {
                label: "目标文件缺失",
                count: 1,
                files: ["addon-static/locale/zh-CN/main.ftl"],
              },
            ],
            patchPlanTargets: ["addon-static/locale/zh-CN/main.ftl"],
            patchUnsupportedDiagnosisCategoryLabel: "行为回归",
            patchUnsupportedDiagnosisReason: "当前故障表现为动作执行结果异常，仍需要先继续下钻成声明式入口或更小范围的结构化诊断。",
            patchVerificationSummary: "补丁后必须确认 locale FTL 缺失计数归零。",
            patchVerificationRequiredPassed: 1,
            patchVerificationRequiredFailed: 1,
            patchVerificationOptionalPassed: 0,
            patchVerificationOptionalFailed: 1,
            patchVerificationFailedChecks: [
              {
                id: "locale-ftl-missing",
                label: "Locale FTL 缺失计数",
              },
            ],
            patchVerificationOptionalFailedChecks: [
              {
                id: "visual-drift-count",
                label: "视觉漂移数量",
              },
            ],
            patchVerificationFailedCheckKinds: [
              {
                kind: "all-cycle-check",
                label: "跨轮次检查",
                count: 1,
              },
            ],
            patchVerificationOptionalFailedCheckKinds: [
              {
                kind: "report-field",
                label: "聚合报告字段",
                count: 1,
              },
            ],
          },
        },
      },
    });

    assert.equal(summary.statusLabel, "需关注");
    assert.equal(summary.nextAction, "npm run agent:zotero:autofix");
    assert.ok(summary.blockers.includes("最近自动修复未恢复成功。"));
    assert.ok(summary.candidateFiles.includes("src/app/plugin.js"));
    assert.ok(summary.candidateFiles.includes("addon-static/locale/zh-CN/main.ftl"));
    assert.ok(String(summary.readerHostStateSummary).includes("侧边栏视图"));
    assert.equal(summary.patchSummary.planStatusLabel, "可进入受限补丁审阅");
    assert.ok(summary.patchSummary.draftOperations.includes("创建文件 x1"));
    assert.ok(summary.patchSummary.blockers.some((item) => item.includes("目标文件缺失")));
    assert.equal(summary.patchSummary.unsupportedCategoryLabel, "行为回归");
    assert.ok(String(summary.patchSummary.unsupportedReason).includes("动作执行结果异常"));
    assert.equal(summary.patchSummary.verificationOverview, "必需 通过 1 / 失败 1；观察 通过 0 / 失败 1");
    assert.equal(summary.patchSummary.failedRequiredChecks, "Locale FTL 缺失计数（locale-ftl-missing）");
    assert.equal(summary.patchSummary.failedOptionalChecks, "视觉漂移数量（visual-drift-count）");
    assert.equal(summary.patchSummary.failedCheckKinds, "跨轮次检查 x1；聚合报告字段 x1");
    assert.ok(String(summary.visualPrimaryBlockerSummary || "").includes("采集未稳定"));
    assert.ok(String(summary.visualGeometrySummary || "").includes("2000x1200 / 3388x2172"));
    assert.ok(String(summary.visualCanonicalCoverageSummary || "").includes("canonical 基线覆盖待补证"));
    assert.ok(summary.visualCanonicalMismatchedTargets.includes("hot-reload-library.png"));
  });

  it("should prefer fresher monitor and gate frontpage signals over stale loop context", () => {
    const summary = summarizeObsidianInterventionContext({
      loop: {
        generatedAt: "2026-03-24T09:47:47.071Z",
        nextAction: "npm run agent:zotero:e2e",
        finalState: {
          frontpageSummary: {
            statusLabel: "需关注",
            headline: "发现 4 项问题",
            primarySignals: [
              "发现 4 项问题",
              "最近自动修复未恢复成功，建议回看补丁计划与诊断。",
            ],
            nextAction: "npm run agent:zotero:e2e",
          },
          issues: ["最近自动修复未恢复成功。"],
        },
      },
      gate: {
        generatedAt: "2026-03-24T17:05:51.741Z",
        frontpageSummary: {
          statusLabel: "需先处理",
          headline: "最近 Zotero E2E 未通过：失败。",
          primaryBlockers: [
            "最近 Zotero E2E 未通过：失败。",
            "主诊断：Reader 与视觉回归 / reader-ui:reader-visual-drift（medium，置信度 88%）。",
          ],
          nextAction: "当前主阻断已排除采集稳定性、几何漂移与 canonical coverage 缺口；先执行 `npm run agent:obsidian` 固化 Reader UI / scenario 的人工复核结论。",
        },
      },
      monitor: {
        generatedAt: "2026-03-24T17:06:05.018Z",
        frontpageSummary: {
          statusLabel: "需关注",
          headline: "视觉主阻断：疑似真实界面回归；library 几何一致 2000x1200；reader 几何一致 2000x1200；暂不刷新基线；canonical 基线覆盖完整：4/4 已对齐",
          primarySignals: [
            "视觉主阻断：疑似真实界面回归；library 几何一致 2000x1200；reader 几何一致 2000x1200；暂不刷新基线；canonical 基线覆盖完整：4/4 已对齐",
            "最近自动修复未恢复成功，建议回看补丁计划与诊断。",
          ],
          nextAction: "npm run agent:obsidian",
        },
      },
    });

    assert.equal(summary.nextAction, "npm run agent:obsidian");
    assert.equal(summary.headline, "视觉主阻断：疑似真实界面回归；library 几何一致 2000x1200；reader 几何一致 2000x1200；暂不刷新基线；canonical 基线覆盖完整：4/4 已对齐");
    assert.ok(summary.blockers.includes("最近 Zotero E2E 未通过：失败。"));
    assert.ok(!summary.blockers.includes("最近自动修复未恢复成功。"));
    assert.ok(!summary.blockers.includes("最近自动修复未恢复成功，建议回看补丁计划与诊断。"));
  });

  it("should normalize explanatory gate nextAction text into a runnable command", () => {
    const summary = summarizeObsidianInterventionContext({
      gate: {
        generatedAt: "2026-03-24T17:05:51.741Z",
        frontpageSummary: {
          statusLabel: "需先处理",
          headline: "最近 Zotero E2E 未通过：失败。",
          primaryBlockers: ["最近 Zotero E2E 未通过：失败。"],
          nextAction: "当前主阻断已排除采集稳定性、几何漂移与 canonical coverage 缺口；先执行 `npm run agent:obsidian` 固化 Reader UI / scenario 的人工复核结论。",
        },
      },
    });

    assert.equal(summary.nextAction, "npm run agent:obsidian");
    assert.ok(summary.commands.includes("npm run agent:obsidian"));
  });

  it("should render obsidian markdown handoff", () => {
    const markdown = buildObsidianInterventionMarkdown({
      generatedAt: "2026-03-20T12:00:00.000Z",
      statusLabel: "需关注",
      headline: "Zotero watch 当前为 已过期。",
      nextAction: "npm run zotero:watch",
      blockers: ["watch 状态需要刷新：已过期。"],
      candidateFiles: ["src/app/plugin.js"],
      commands: ["npm run zotero:watch"],
      evidenceLinks: ["dist/agent-gate.md"],
      diagnosisLabel: "启动与挂载",
      diagnosis: "插件实例未稳定挂载到 Zotero 运行时。",
      readerHostStateSummary: "侧边栏视图 annotations；流模式 paginated",
      readerHostStateNote: "已从 Reader interaction diagnostics 场景读回 2 项深层宿主状态。",
      visualPrimaryBlockerSummary: "视觉主阻断：采集未稳定；library 几何不一致 2000x1200 / 3388x2172；暂不刷新基线",
      visualGeometrySummary: "library 几何不一致 2000x1200 / 3388x2172",
      visualCanonicalCoverageSummary: "canonical 基线覆盖部分：仍不匹配 hot-reload-library.png、hot-reload-reader.png",
      visualCanonicalMismatchedTargets: ["hot-reload-library.png", "hot-reload-reader.png"],
      patchSummary: {
        planStatusLabel: "可进入受限补丁审阅",
        featureLabel: "本地化引用修正",
        draftOperations: ["创建文件 x1"],
        applicationStatusLabel: "预检失败",
        blockers: ["目标文件缺失 x1 / addon-static/locale/zh-CN/main.ftl"],
        unsupportedCategoryLabel: "行为回归",
        unsupportedReason: "动作执行结果异常，暂不进入自动补丁。",
        verificationSummary: "补丁后必须确认 locale FTL 缺失计数归零。",
        verificationOverview: "必需 通过 1 / 失败 1；观察 通过 0 / 失败 1",
        failedRequiredChecks: "Locale FTL 缺失计数（locale-ftl-missing）",
        failedOptionalChecks: "视觉漂移数量（visual-drift-count）",
        failedCheckKinds: "跨轮次检查 x1；聚合报告字段 x1",
      },
    });

    assert.ok(markdown.includes("# Zotero Agent 当前状态总览"));
    assert.ok(markdown.includes("自动阻塞项"));
    assert.ok(markdown.includes("npm run zotero:watch"));
    assert.ok(markdown.includes("## Reader 深层宿主状态"));
    assert.ok(markdown.includes("流模式 paginated"));
    assert.ok(markdown.includes("视觉主阻断：采集未稳定"));
    assert.ok(markdown.includes("视觉几何摘要：library 几何不一致 2000x1200 / 3388x2172"));
    assert.ok(markdown.includes("Canonical 覆盖摘要：canonical 基线覆盖部分"));
    assert.ok(markdown.includes("Canonical 未对齐目标：hot-reload-library.png、hot-reload-reader.png"));
    assert.ok(markdown.includes("## 受限补丁摘要"));
    assert.ok(markdown.includes("创建文件 x1"));
    assert.ok(markdown.includes("未进入白名单：行为回归"));
    assert.ok(markdown.includes("目标文件缺失 x1 / addon-static/locale/zh-CN/main.ftl"));
    assert.ok(markdown.includes("复验总览：必需 通过 1 / 失败 1；观察 通过 0 / 失败 1"));
    assert.ok(markdown.includes("必需失败项：Locale FTL 缺失计数（locale-ftl-missing）"));
    assert.ok(markdown.includes("失败类型画像：跨轮次检查 x1；聚合报告字段 x1"));
  });

  it("should render obsidian canvas handoff", () => {
    const canvas = buildObsidianInterventionCanvas({
      statusLabel: "需关注",
      headline: "当前 gate 未通过。",
      nextAction: "npm run agent:zotero:autofix",
      blockers: ["最近自动修复未恢复成功。"],
      candidateFiles: ["src/app/plugin.js"],
      commands: ["npm run agent:zotero:autofix"],
      evidenceLinks: ["dist/agent-gate.md"],
      patchSummary: {
        planStatusLabel: "可进入受限补丁审阅",
        featureLabel: "本地化引用修正",
        draftOperations: ["创建文件 x1"],
        applicationStatusLabel: "预检失败",
        blockers: ["目标文件缺失 x1 / addon-static/locale/zh-CN/main.ftl"],
        unsupportedCategoryLabel: "行为回归",
        unsupportedReason: "动作执行结果异常，暂不进入自动补丁。",
        verificationOverview: "必需 通过 1 / 失败 1；观察 通过 0 / 失败 1",
        failedRequiredChecks: "Locale FTL 缺失计数（locale-ftl-missing）",
        failedOptionalChecks: "视觉漂移数量（visual-drift-count）",
        failedCheckKinds: "跨轮次检查 x1；聚合报告字段 x1",
      },
    });

    assert.ok(Array.isArray(canvas.nodes));
    assert.ok(Array.isArray(canvas.edges));
    assert.equal(canvas.nodes[0].type, "text");
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("人工指令窗口")));
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("人工指南双笔记")));
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("补丁摘要")));
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("创建文件 x1")));
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("白名单阻塞：行为回归")));
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("复验：必需 通过 1 / 失败 1；观察 通过 0 / 失败 1")));
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("类型画像：跨轮次检查 x1；聚合报告字段 x1")));
  });

  it("should build shared visual view-model without changing core summary semantics", () => {
    const model = buildObsidianVisualViewModel({
      generatedAt: "2026-03-25T08:00:00.000Z",
      statusLabel: "需关注",
      headline: "当前主阻断为 Reader 视觉回归候选。",
      nextAction: "npm run agent:obsidian",
      blockers: ["最近 Zotero E2E 未通过：失败。"],
      candidateFiles: ["src/features/reader.js"],
      commands: ["npm run agent:obsidian", "npm run agent:gate"],
      visualPrimaryBlockerSummary: "视觉主阻断：疑似真实界面回归",
      visualGeometrySummary: "library 几何一致 2000x1200；reader 几何一致 2000x1200",
      visualCanonicalCoverageSummary: "canonical 基线覆盖完整：4/4 已对齐",
      visualCanonicalMismatchedTargets: [],
      patchSummary: {
        planStatusLabel: "可进入受限补丁审阅",
      },
    });

    assert.equal(model.nextAction, "npm run agent:obsidian");
    assert.ok(model.blockers.includes("最近 Zotero E2E 未通过：失败。"));
    assert.ok(model.candidateFiles.includes("src/features/reader.js"));
    assert.equal(model.verdictBranches.length, 3);
    assert.equal(model.verdictBranches[0].status, "ready");
    assert.equal(model.verdictBranches[0].mode, "force-next");
  });

  it("should render optional mermaid visual companion markdown", () => {
    const markdown = buildObsidianVisualFlowMermaidMarkdown({
      generatedAt: "2026-03-25T08:00:00.000Z",
      statusLabel: "需关注",
      headline: "当前主阻断为 Reader 视觉回归候选。",
      nextAction: "npm run agent:obsidian",
      blockers: ["最近 Zotero E2E 未通过：失败。"],
      candidateFiles: ["src/features/reader.js"],
      visualPrimaryBlockerSummary: "视觉主阻断：疑似真实界面回归",
      visualGeometrySummary: "library 几何一致 2000x1200；reader 几何一致 2000x1200",
      visualCanonicalCoverageSummary: "canonical 基线覆盖完整：4/4 已对齐",
      visualCanonicalMismatchedTargets: [],
    });

    assert.ok(markdown.includes("# Zotero Agent 闭环流程图（Visual Companion）"));
    assert.ok(markdown.includes("```mermaid"));
    assert.ok(markdown.includes("watch"));
    assert.ok(markdown.includes("agent:zotero:e2e"));
    assert.ok(markdown.includes("agent:obsidian"));
    assert.ok(markdown.includes("human verdict"));
  });

  it("should render optional excalidraw visual companion markdown", () => {
    const markdown = buildObsidianVisualVerdictExcalidrawMarkdown({
      generatedAt: "2026-03-25T08:00:00.000Z",
      headline: "当前主阻断为 Reader 视觉回归候选。",
      nextAction: "npm run agent:obsidian",
      verdictBranches: [
        {
          verdict: "预期 UI 变化",
          status: "ready",
          mode: "force-next",
          nextAction: "npm run agent:zotero:e2e:update-baseline",
        },
        {
          verdict: "真实回归",
          status: "hold",
          mode: "hold",
          nextAction: "先人工锁定 Reader / scenario 关注文件",
        },
        {
          verdict: "证据不足",
          status: "hold",
          mode: "hold",
          nextAction: "先补证据，不直接刷新 baseline",
        },
      ],
    });

    assert.ok(markdown.includes("excalidraw-plugin: parsed"));
    assert.ok(markdown.includes("# Excalidraw Data"));
    assert.ok(markdown.includes("```json"));
    assert.ok(markdown.includes("预期 UI 变化"));
    assert.ok(markdown.includes("真实回归"));
    assert.ok(markdown.includes("证据不足"));
  });

  it("should render split human guides for manual usage only", () => {
    const quickstart = buildHumanQuickstartMarkdown();
    const advanced = buildHumanAdvancedGuideMarkdown();

    assert.ok(quickstart.includes("# Zotero Agent 人工快速上手"));
    assert.ok(quickstart.includes("## 快速入口"));
    assert.ok(quickstart.includes("[[04-Zotero-Agent-高级介入规范]]"));
    assert.ok(advanced.includes("# Zotero Agent 高级介入规范"));
    assert.ok(advanced.includes("## 字段语义说明"));
    assert.ok(advanced.includes("## 哪些内容不要改"));
  });

  it("should preserve and parse human intervention window", () => {
    const content = buildHumanInterventionWindowMarkdown({
      generatedAt: "2026-03-20T12:00:00.000Z",
      statusLabel: "需关注",
      headline: "当前 gate 未通过。",
      nextAction: "npm run agent:zotero:autofix",
      candidateFiles: ["src/app/plugin.js"],
      patchSummary: {
        planStatusLabel: "可进入受限补丁审阅",
        draftOperations: ["创建文件 x1"],
        applicationStatusLabel: "预检失败",
      },
    }, [
      "# ignored",
      "## 人工编辑区（保留）",
      "",
      "状态: ready",
      "模式: force-next",
      "下一步指令: npm run agent:zotero:watch-recovery",
      "关注文件: src/app/plugin.js, src/features/item-pane.js",
      "备注: 请先看恢复链",
    ].join("\n"));

    const parsed = parseHumanInterventionWindow(content);
    assert.ok(content.includes("补丁动作：创建文件 x1"));
    assert.equal(parsed.status, "ready");
    assert.equal(parsed.mode, "force-next");
    assert.equal(parsed.nextActionOverride, "npm run agent:zotero:watch-recovery");
    assert.ok(parsed.focusFiles.includes("src/app/plugin.js"));
    assert.equal(parsed.intervened, true);
  });

  it("should display all fixed unsupported blocker categories in obsidian handoff", () => {
    const unsupportedTestCases = [
      {
        category: "generic-runtime-failure",
        label: "泛化运行时失败",
        reason: "当前故障仍停留在插件挂载失败层",
      },
      {
        category: "behavioral-regression",
        label: "行为回归",
        reason: "当前故障表现为动作执行结果异常",
      },
      {
        category: "environment-or-host",
        label: "环境或宿主噪声",
        reason: "当前只观测到泛化运行时 error 日志",
      },
      {
        category: "unsafe-cross-file",
        label: "跨文件高风险回归",
        reason: "当前故障来自测试或场景级失败",
      },
    ];

    for (const testCase of unsupportedTestCases) {
      const summary = summarizeObsidianInterventionContext({
        monitor: {
          zoteroValidation: {
            autofix: {
              patchUnsupportedDiagnosisCategoryLabel: testCase.label,
              patchUnsupportedDiagnosisReason: testCase.reason,
            },
          },
        },
      });

      assert.equal(summary.patchSummary?.unsupportedCategoryLabel, testCase.label);
      assert.equal(summary.patchSummary?.unsupportedReason, testCase.reason);

      const markdown = buildObsidianInterventionMarkdown(summary);
      assert.ok(markdown.includes("未进入白名单"));
      assert.ok(markdown.includes(testCase.label));

      const canvas = buildObsidianInterventionCanvas(summary);
      assert.ok(canvas.nodes.some((item) => String(item.text).includes("白名单阻塞")));
    }
  });

  it("should surface reader deeper event point Chinese summaries in intervention context", () => {
    const summary = summarizeObsidianInterventionContext({
      monitor: {
        zoteroValidation: {
          e2e: {
            status: "passed",
            readerHostStateObserved: true,
            readerSidebarView: "annotations",
            readerHostStateSummary: "侧边栏视图 annotations；上下文面板 打开",
            readerHostStateNote: "已从 Reader interaction diagnostics 场景读回 2 项深层宿主状态。",
            readerDispatchSummary: "文本浮层 synthetic-fallback；侧栏批注头 customEvent",
            contextMenuSummary: "已观测 5 类；synthetic-fallback 5 类",
            toolbarEvidenceSummary: "Toolbar 宿主点已观测；Hook 通过；细粒度 通过；分发 customEvent",
            visualEvidenceSummary: "library 已对齐；reader 已对齐",
            visualCaptureStabilitySummary: "视觉采集稳定性：library 稳定（2 次，哈希收敛）；reader 待稳（3 次，重试上限）",
          },
          autofix: {
            patchPlanStatusLabel: "无需恢复",
          },
        },
      },
    });

    assert.equal(summary.readerHostStateSummary, "侧边栏视图 annotations；上下文面板 打开");
    assert.equal(summary.readerHostStateNote, "已从 Reader interaction diagnostics 场景读回 2 项深层宿主状态。");
    assert.ok(summary.readerDispatchSummary?.includes("文本浮层"));
    assert.ok(summary.readerDispatchSummary?.includes("synthetic-fallback"));
    assert.ok(summary.readerDispatchSummary?.includes("侧栏批注头"));
    assert.ok(summary.readerDispatchSummary?.includes("customEvent"));
    assert.ok(summary.contextMenuSummary?.includes("已观测 5 类"));
    assert.ok(summary.contextMenuSummary?.includes("synthetic-fallback 5 类"));
    assert.ok(summary.toolbarEvidenceSummary?.includes("Toolbar 宿主点已观测"));
    assert.ok(summary.visualEvidenceSummary?.includes("已对齐"));
    assert.ok(summary.visualCaptureStabilitySummary?.includes("library 稳定"));
  });

  it("should handle null fallbacks for reader deeper event point summaries in intervention context", () => {
    const summary = summarizeObsidianInterventionContext({
      monitor: {
        zoteroValidation: {
          e2e: {
            status: "passed",
            readerHostStateObserved: false,
            readerHostStateSummary: null,
            readerHostStateNote: null,
            readerDispatchSummary: null,
            contextMenuSummary: null,
            toolbarEvidenceSummary: null,
            visualEvidenceSummary: null,
            visualCaptureStabilitySummary: null,
          },
          autofix: {},
        },
      },
    });

    assert.equal(summary.readerHostStateSummary, null);
    assert.equal(summary.readerHostStateNote, null);
    assert.equal(summary.readerDispatchSummary, null);
    assert.equal(summary.contextMenuSummary, null);
    assert.equal(summary.toolbarEvidenceSummary, null);
    assert.equal(summary.visualEvidenceSummary, null);
    assert.equal(summary.visualCaptureStabilitySummary, null);
  });

  it("should lift visual evidence navigation into obsidian notes without re-promoting baseline refresh", () => {
    const summary = summarizeObsidianInterventionContext({
      gate: {
        frontpageSummary: {
          nextAction: "npm run agent:obsidian",
        },
      },
      monitor: {
        zoteroValidation: {
          e2e: {
            status: "failed",
            visualPrimaryBlockerKind: "ui-regression-candidate",
            visualCanonicalCoverageKind: "complete",
            visualEvidenceObserved: true,
            visualEvidenceItemCount: 4,
            visualEvidenceFailingItemCount: 1,
            visualEvidenceSummary: "restart reader 漂移 95.22% / 20.95",
            visualEvidenceItems: [
              {
                cycleIndex: 1,
                bootMode: "restart",
                kind: "reader",
                canonicalTarget: "restart-reader.png",
                capturePath: "/tmp/cycle-1-reader.png",
                baselinePath: "/tmp/restart-reader.png",
                captureStable: false,
                selectedAttempt: 3,
                selectionReason: "max-attempt-reached",
                geometryMatched: true,
                changedRatio: 0.9522,
                meanChannelDiff: 20.95,
                issues: ["reader 截图与基线像素漂移过大：95.22% > 5.00%"],
              },
            ],
            visualCaptureAttemptDiagnosisObserved: true,
            visualCaptureAttemptDiagnosisItemCount: 1,
            visualCaptureAttemptDiagnosisSummary: "已观测 1 个 stage capture attempt 诊断；用尽预算 1 个：Cycle 1 / restart / reader（bounds 固定，光栅固定，hash 全变）",
            visualCaptureAttemptDiagnosisItems: [
              {
                cycleIndex: 1,
                bootMode: "restart",
                kind: "reader",
                selectionReason: "max-attempt-reached",
                selectedAttempt: 3,
                attemptCount: 3,
                allHashesUnique: true,
                boundsStable: true,
                rasterSizeStable: true,
                attemptHashes: ["reader-1", "reader-2", "reader-3"],
                attemptBounds: ["100,80 1000x600", "100,80 1000x600", "100,80 1000x600"],
                attemptRasterSizes: ["2000x1200", "2000x1200", "2000x1200"],
                stabilityMetrics: null,
              },
            ],
          },
          autofix: {
            patchPlanStatusLabel: "可进入受限补丁审阅",
            patchDraftOperations: [
              { label: "刷新基线", count: 2 },
            ],
            patchApplicationStatusLabel: "未尝试",
          },
        },
      },
    });

    assert.equal(summary.nextAction, "npm run agent:obsidian");
    assert.equal(summary.visualEvidenceItems.length, 1);
    assert.ok(summary.visualEvidenceFocusSummary?.includes("Cycle 1 / restart / reader / restart-reader.png"));
    assert.equal(summary.visualCaptureAttemptDiagnosisItemCount, 1);
    assert.ok(summary.visualCaptureAttemptDiagnosisSummary?.includes("hash 全变"));

    const evidenceMarkdown = buildObsidianEvidenceMarkdown(summary);
    assert.ok(evidenceMarkdown.includes("[cycle-1-reader.png](/tmp/cycle-1-reader.png)"));
    assert.ok(evidenceMarkdown.includes("[restart-reader.png](/tmp/restart-reader.png)"));
    assert.ok(evidenceMarkdown.includes("## 当前 Capture Attempt 诊断"));
    assert.ok(evidenceMarkdown.includes("Hash 全变: 是"));
    assert.ok(evidenceMarkdown.includes("Attempt Hashes: reader-1；reader-2；reader-3"));

    const markdown = buildObsidianInterventionMarkdown(summary);
    assert.ok(markdown.includes("## 视觉证据导航"));
    assert.ok(markdown.includes("## Capture Attempt 诊断"));
    assert.ok(markdown.includes("Attempt 诊断"));
    assert.ok(markdown.includes("详见：[[02-Zotero-Agent-证据索引]]"));
    assert.ok(markdown.includes("当前阶段：等待人工 Reader verdict"));

    const humanWindow = buildHumanInterventionWindowMarkdown(summary, "");
    assert.ok(humanWindow.includes("当前阶段：等待人工 Reader verdict"));
    assert.ok(humanWindow.includes("视觉导航"));
    assert.ok(humanWindow.includes("Attempt 诊断"));
    assert.ok(humanWindow.includes("已降级，先人工复核视觉证据"));
    assert.ok(humanWindow.includes("当前主路径等待人工 Reader verdict，不默认执行 baseline refresh、autofix 或 rerun E2E。"));
    assert.equal(humanWindow.includes("刷新基线 x2"), false);
  });

  it("should keep patch actions downgraded for capture-unstable visual failures", () => {
    const summary = summarizeObsidianInterventionContext({
      monitor: {
        frontpageSummary: {
          nextAction: "npm run agent:zotero:e2e",
        },
        zoteroValidation: {
          e2e: {
            status: "failed",
            visualPrimaryBlockerKind: "capture-unstable",
            visualCanonicalCoverageKind: "complete",
            visualCaptureStabilityStages: [
              { kind: "reader", stable: false, attemptCount: 3, selectionReason: "max-attempt-reached" },
            ],
            visualCaptureAttemptDiagnosisSummary: "已观测 1 个 stage capture attempt 诊断；用尽预算 1 个：Cycle 1 / restart / reader（bounds 固定，光栅固定，hash 全变）",
            visualEvidenceObserved: true,
            visualEvidenceItemCount: 2,
            visualEvidenceFailingItemCount: 1,
            visualEvidenceSummary: "restart reader 漂移 8.32% / 6.27",
            visualEvidenceItems: [
              {
                cycleIndex: 1,
                bootMode: "restart",
                kind: "reader",
                canonicalTarget: "restart-reader.png",
                capturePath: "/tmp/cycle-1-reader.png",
                baselinePath: "/tmp/restart-reader.png",
                captureStable: false,
                selectedAttempt: 3,
                selectionReason: "max-attempt-reached",
                geometryMatched: true,
                changedRatio: 0.0832,
                meanChannelDiff: 6.27,
                issues: ["reader 截图与基线像素漂移过大：8.32% > 5.00%"],
              },
            ],
          },
          autofix: {
            patchPlanStatusLabel: "可进入受限补丁审阅",
            patchDraftOperations: [
              { label: "刷新基线", count: 2 },
            ],
            patchApplicationStatusLabel: "未尝试",
          },
        },
      },
    });

    assert.equal(summary.nextAction, "npm run agent:zotero:e2e");
    const humanWindow = buildHumanInterventionWindowMarkdown(summary, "");
    assert.ok(humanWindow.includes("视觉采集稳定性"));
    assert.ok(humanWindow.includes("视觉主阻断"));
    assert.ok(humanWindow.includes("已降级，先复核稳定性并重跑 E2E"));
    assert.ok(humanWindow.includes("当前主路径先复核采集稳定性并重跑 E2E"));
    assert.ok(humanWindow.includes("用尽预算 stage：reader（3 次）"));
    assert.ok(humanWindow.includes("Attempt 诊断"));
    assert.equal(humanWindow.includes("刷新基线 x2"), false);
  });

  it("should render reader deeper event point fields in obsidian markdown handoff", () => {
    const markdown = buildObsidianInterventionMarkdown({
      generatedAt: "2026-03-24T12:00:00.000Z",
      statusLabel: "稳定",
      headline: "所有检查已通过。",
      nextAction: null,
      blockers: [],
      candidateFiles: [],
      commands: [],
      evidenceLinks: ["dist/agent-monitor.md"],
      diagnosisLabel: null,
      diagnosis: null,
      readerHostStateSummary: "侧边栏视图 annotations；上下文面板 打开",
      readerHostStateNote: "已从 Reader interaction diagnostics 场景读回 2 项深层宿主状态。",
      toolbarEvidenceSummary: "Toolbar 宿主点已观测；Hook 通过；细粒度 通过",
      visualEvidenceSummary: "library 已对齐；reader 已对齐",
      visualCaptureStabilitySummary: "视觉采集稳定性：library 稳定（2 次，哈希收敛）；reader 待稳（3 次，重试上限）",
      visualCaptureStabilityStages: [
        { kind: "reader", stable: false, attemptCount: 3, selectionReason: "max-attempt-reached" },
      ],
      readerDispatchSummary: "文本浮层 synthetic-fallback；侧栏批注头 customEvent",
      contextMenuSummary: "已观测 5 类；synthetic-fallback 5 类",
      patchSummary: null,
    });

    assert.ok(markdown.includes("# Zotero Agent 当前状态总览"));
    assert.ok(markdown.includes("## Reader 深层宿主状态"));
    assert.ok(markdown.includes("侧边栏视图 annotations"));
    assert.ok(markdown.includes("Toolbar 证据"));
    assert.ok(markdown.includes("视觉证据"));
    assert.ok(markdown.includes("视觉采集稳定性"));
    assert.ok(markdown.includes("用尽预算 stage：reader（3 次）"));
    assert.ok(markdown.includes("文本浮层 synthetic-fallback"));
    assert.ok(markdown.includes("侧栏批注头 customEvent"));
    assert.ok(markdown.includes("已观测 5 类"));
  });
});
