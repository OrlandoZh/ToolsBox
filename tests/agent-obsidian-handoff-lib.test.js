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

    assert.equal(summary.summarySource, "gate");
    assert.equal(summary.nextAction, "npm run agent:obsidian");
    assert.equal(summary.summaryNextAction, "当前主阻断已排除采集稳定性、几何漂移与 canonical coverage 缺口；先执行 `npm run agent:obsidian` 固化 Reader UI / scenario 的人工复核结论。");
    assert.equal(summary.runnableNextCommand, "npm run agent:obsidian");
    assert.equal(summary.headline, "最近 Zotero E2E 未通过：失败。");
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
    assert.equal(summary.summaryNextAction, "当前主阻断已排除采集稳定性、几何漂移与 canonical coverage 缺口；先执行 `npm run agent:obsidian` 固化 Reader UI / scenario 的人工复核结论。");
    assert.equal(summary.runnableNextCommand, "npm run agent:obsidian");
    assert.ok(summary.commands.includes("npm run agent:obsidian"));
  });

  it("should prefer the latest runnable command when gate has only a non-runnable success message", () => {
    const summary = summarizeObsidianInterventionContext({
      gate: {
        generatedAt: "2026-03-27T18:37:59.705Z",
        frontpageSummary: {
          statusLabel: "可继续",
          headline: "watch、真机验证与恢复回归均已通过，当前闭环状态稳定。",
          primaryBlockers: [],
          nextAction: "当前已满足 agent 质量闸门，可继续推进后续开发或发布流程。",
        },
      },
      monitor: {
        generatedAt: "2026-03-27T18:37:59.635Z",
        frontpageSummary: {
          statusLabel: "稳定",
          headline: "watch、真机验证与恢复回归均正常，当前可作为 agent 持续开发的稳定基线。",
          primarySignals: [],
          nextAction: "npm run agent:gate",
        },
      },
    });

    assert.equal(summary.statusLabel, "可继续");
    assert.equal(summary.nextAction, "npm run agent:gate");
    assert.equal(summary.summaryNextAction, "当前已满足 agent 质量闸门，可继续推进后续开发或发布流程。");
    assert.equal(summary.runnableNextCommand, "npm run agent:gate");
    assert.ok(summary.commands.includes("npm run agent:gate"));
    assert.equal(summary.commands.includes("当前已满足 agent 质量闸门，可继续推进后续开发或发布流程。"), false);
  });

  it("should build bootstrap shell summary without pretending it is a current project conclusion", () => {
    const summary = summarizeObsidianInterventionContext({
      bootstrapShell: true,
      currentTruthSummary: [
        "- 当前真实完成度约为 `99%`",
        "- 当前主阻断已清零",
      ].join("\n"),
      currentTruthActiveBatchId: "ENG-HIGH-104",
      projectExpansionWave: {
        currentWaveName: "Phase E Extension Wave 1",
        acceptanceTrack: "functional-first",
        inScopeModules: ["src/features/reader-chat.js"],
      },
      projectValidationOverrides: {
        overrides: [
          {
            decision: "visual-required",
            matchers: ["src/features/reader-chat.js"],
          },
        ],
      },
    });

    assert.equal(summary.bootstrapShell, true);
    assert.equal(summary.summarySource, "bootstrap-shell");
    assert.equal(summary.statusLabel, "初始化占位");
    assert.equal(summary.summaryHeadline, "当前工作台仍是初始化占位，不代表当前项目结论。");
    assert.equal(summary.runnableNextCommand, "npm run agent:sync");
    assert.equal(summary.projectContext.currentTruth.activeBatchId, "ENG-HIGH-104");
    assert.equal(summary.projectContext.expansionWave.currentWaveName, "Phase E Extension Wave 1");
    assert.equal(summary.projectContext.validationOverrides.overrideCount, 1);
  });

  it("should render obsidian markdown handoff", () => {
    const markdown = buildObsidianInterventionMarkdown({
      generatedAt: "2026-03-20T12:00:00.000Z",
      generationId: "obsidian-generation-1",
      summarySource: "gate",
      summaryNextAction: "先执行 `npm run zotero:watch` 更新 watch 结论。",
      runnableNextCommand: "npm run zotero:watch",
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
      agentContext: {
        present: true,
        generatedAt: "2026-03-20T12:00:00.500Z",
        truthRef: {
          activeBatchId: "ENG-HIGH-104",
          currentWaveName: "Phase E Extension Wave 1",
          validationLevel: "需要视觉验证",
        },
        alignmentRef: {
          status: "aligned",
          generationStage: "post-gate",
          preferredRepairCommand: null,
        },
        actionRef: {
          nextAction: "npm run zotero:watch",
          mainBlocker: "watch 状态需要刷新：已过期。",
        },
        statusRef: {
          monitorStatus: "需关注",
          gateStatus: "需先处理",
        },
        driftRef: {
          status: "warning",
          warningCount: 1,
          warnings: ["watch 过期"],
        },
        referenceDistillationRef: {
          status: "queued",
          pendingCount: 1,
          lastTopic: "Plugin Menu Patterns",
          lastDistilledAt: "2026-03-20T11:58:00.000Z",
          nextSuggestedAction: "等待后台 reference distillation 完成。",
        },
        evidenceRefs: ["dist/agent-gate.md"],
        artifactRefs: {
          currentTruth: "docs/CURRENT_BACKLOG.md",
          monitor: "dist/agent-monitor.json",
          gate: "dist/agent-gate.json",
          memory: "dist/agent-memory.json",
        },
        budgetMeta: {
          profile: "runtime-compact-v1",
          digest: "digest-test",
        },
      },
      projectContext: {
        currentTruth: {
          activeBatchId: "ENG-HIGH-104",
          summary: "当前主阻断已清零；只剩 release-only gap。",
          excerpt: ["当前主阻断已清零", "只剩 release-only gap"],
        },
        expansionWave: {
          currentWaveName: "Phase E Extension Wave 1",
          acceptanceTrack: "functional-first -> gate",
          status: "active",
          inScopeModules: ["src/features/reader-chat.js"],
          outOfScopeModules: ["src/features/obsidian-canvas/index.js"],
          explicitVisualUpgradeModules: ["src/features/reader-chat.js"],
          moduleArchetypes: ["src/features/reader-chat.js -> visible-surface"],
          summary: "Phase E Extension Wave 1 / functional-first -> gate",
        },
        validationOverrides: {
          summary: "项目覆盖 2 条：required=1 / recommended=1 / not-needed=0",
        },
        validationDecision: {
          level: "visual-required",
          levelLabel: "需要视觉验证",
          matchedDomain: ["visible-surface"],
          matchedProjectOverride: ["src/features/reader-chat.js"],
          requiredChecks: ["agent:zotero:e2e"],
          requiredEvidence: ["Reader screenshot"],
          escalatedByRuntimeSignals: false,
          deferredEvidenceAction: null,
        },
      },
      autoChain: {
        gate: {
          statusLabel: "需先处理",
          generatedAt: "2026-03-20T12:00:01.000Z",
          headline: "当前 gate 未通过。",
        },
        monitor: {
          statusLabel: "需关注",
          generatedAt: "2026-03-20T12:00:00.500Z",
          headline: "Zotero watch 当前为 已过期。",
        },
        watch: {
          statusLabel: "已过期",
          ageText: "31m",
        },
        e2e: {
          statusLabel: "缺失",
          ageText: "-",
        },
        watchRecovery: {
          statusLabel: "缺失",
          ageText: "-",
        },
      },
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

    assert.ok(markdown.includes("# 当前 Zotero 插件状态总览"));
    assert.ok(markdown.includes("summary_source: gate"));
    assert.ok(markdown.includes("handoff_generation_id: obsidian-generation-1"));
    assert.ok(markdown.includes("agent_context_digest: digest-test"));
    assert.ok(markdown.includes("## 当前插件主线"));
    assert.ok(markdown.includes("当前 wave：Phase E Extension Wave 1"));
    assert.ok(markdown.includes("Validation mirror：项目覆盖 2 条"));
    assert.ok(markdown.includes("Alignment Ref：status=`aligned` / stage=`post-gate` / repair=`-`"));
    assert.ok(markdown.includes("Reference Distillation：status=`queued` / pending=`1` / topic=`Plugin Menu Patterns`"));
    assert.ok(markdown.includes("## 当前自动结论与验证"));
    assert.ok(markdown.includes("当前风险与阻塞"));
    assert.ok(markdown.includes("npm run zotero:watch"));
    assert.ok(markdown.includes("## Reader 专项证据"));
    assert.ok(markdown.includes("流模式 paginated"));
    assert.ok(markdown.includes("视觉主阻断：采集未稳定"));
    assert.ok(markdown.includes("视觉几何摘要：library 几何不一致 2000x1200 / 3388x2172"));
    assert.ok(markdown.includes("Canonical 覆盖摘要：canonical 基线覆盖部分"));
    assert.ok(markdown.includes("Canonical 未对齐目标：hot-reload-library.png、hot-reload-reader.png"));
    assert.ok(markdown.includes("## 补丁与修复收口"));
    assert.ok(markdown.includes("创建文件 x1"));
    assert.ok(markdown.includes("未进入白名单：行为回归"));
    assert.ok(markdown.includes("目标文件缺失 x1 / addon-static/locale/zh-CN/main.ftl"));
    assert.ok(markdown.includes("复验总览：必需 通过 1 / 失败 1；观察 通过 0 / 失败 1"));
    assert.ok(markdown.includes("必需失败项：Locale FTL 缺失计数（locale-ftl-missing）"));
    assert.ok(markdown.includes("失败类型画像：跨轮次检查 x1；聚合报告字段 x1"));
  });

  it("should render obsidian canvas handoff", () => {
    const canvas = buildObsidianInterventionCanvas({
      generationId: "obsidian-generation-2",
      summarySource: "gate",
      summaryNextAction: "先执行 `npm run agent:sync`。",
      runnableNextCommand: "npm run agent:sync",
      statusLabel: "需关注",
      headline: "当前 gate 未通过。",
      nextAction: "npm run agent:zotero:autofix",
      blockers: ["最近自动修复未恢复成功。"],
      candidateFiles: ["src/app/plugin.js"],
      commands: ["npm run agent:zotero:autofix"],
      evidenceLinks: ["dist/agent-gate.md"],
      projectContext: {
        currentTruth: {
          activeBatchId: "ENG-HIGH-104",
          summary: "当前主阻断已清零；只剩 release-only gap。",
          excerpt: ["当前主阻断已清零"],
        },
        expansionWave: {
          currentWaveName: "Phase E Extension Wave 1",
          acceptanceTrack: "functional-first",
          status: "active",
          inScopeModules: ["src/features/reader-chat.js"],
          outOfScopeModules: ["src/features/obsidian-canvas/index.js"],
          explicitVisualUpgradeModules: ["src/features/reader-chat.js"],
        },
        validationOverrides: {
          summary: "项目覆盖 1 条：required=1 / recommended=0 / not-needed=0",
        },
        validationDecision: {
          level: "visual-required",
          levelLabel: "需要视觉验证",
          matchedDomain: ["visible-surface"],
          matchedProjectOverride: ["src/features/reader-chat.js"],
        },
      },
      autoChain: {
        gate: {
          statusLabel: "需先处理",
          generatedAt: "2026-03-20T12:00:01.000Z",
          headline: "当前 gate 未通过。",
        },
        monitor: {
          statusLabel: "需关注",
          generatedAt: "2026-03-20T12:00:00.500Z",
          headline: "Monitor 已刷新。",
        },
        watch: {
          statusLabel: "healthy",
          ageText: "2m",
        },
        e2e: {
          statusLabel: "passed",
          ageText: "1m",
        },
        watchRecovery: {
          statusLabel: "passed",
          ageText: "1m",
        },
      },
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
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("generation_id=obsidian-generation-2")));
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("当前 Zotero 插件白板")));
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("Phase E Extension Wave 1")));
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("当前主线 / truth")));
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("共享技术骨架")));
    assert.ok(canvas.nodes.some((item) => String(item.text).includes("协作入口")));
  });

  it("should avoid fallback wording when no blockers remain", () => {
    const markdown = buildObsidianInterventionMarkdown({
      generationId: "obsidian-generation-no-blockers",
      summarySource: "gate",
      summaryHeadline: "watch、真机验证与恢复回归均已通过，当前闭环状态稳定。",
      summaryStatusLabel: "可继续",
      summaryNextAction: "当前已满足 agent 质量闸门，可继续推进后续开发或发布流程。",
      currentTruthSummary: "当前主阻断已清零；只剩 release-only gap。",
      blockers: [],
      commands: ["npm run agent:gate"],
      candidateFiles: [],
      evidenceLinks: [],
      projectContext: {
        currentTruth: {
          activeBatchId: "ENG-HIGH-104",
          summary: "当前主阻断已清零；只剩 release-only gap。",
          excerpt: ["当前主阻断已清零"],
        },
        expansionWave: {
          currentWaveName: "ZOTERO-HOST-WAVE-001",
          acceptanceTrack: "host-first -> surface smoke -> surface-local visual evidence",
          status: "declared",
          inScopeModules: ["src/features/reader.js"],
          outOfScopeModules: [],
          explicitVisualUpgradeModules: [],
        },
        validationOverrides: {
          summary: "项目覆盖 1 条：required=1 / recommended=0 / not-needed=0",
        },
        validationDecision: {
          level: "visual-required",
          levelLabel: "需要视觉验证",
          matchedDomain: ["visible-surface"],
          matchedProjectOverride: ["zotero-host-wave-001"],
        },
      },
      autoChain: {
        gate: {
          statusLabel: "可继续",
          generatedAt: "2026-04-04T10:08:38.722Z",
          headline: "watch、真机验证与恢复回归均已通过，当前闭环状态稳定。",
        },
      },
      patchSummary: {},
    });

    assert.ok(markdown.includes("当前已满足主要质量闸门，可继续执行推荐命令或进入后续开发 / 发布流程。"));
    assert.equal(markdown.includes("当前没有明确阻塞项，优先复核 gate 与 loop 是否一致。"), false);
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
    assert.equal(model.verdictBranches[0].nextAction, "npm run agent:zotero:e2e:update-baseline");
    assert.ok(String(model.verdictBranches[1].nextAction).includes("最小修复批次"));
    assert.ok(String(model.verdictBranches[2].note).includes("不新增第二套"));
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

    assert.ok(markdown.includes("# 当前 Zotero 插件交互流转图（Visual Companion）"));
    assert.ok(markdown.includes("```mermaid"));
    assert.ok(markdown.includes("Zotero host"));
    assert.ok(markdown.includes("pane surfaces"));
    assert.ok(markdown.includes("surface-local evidence"));
    assert.ok(markdown.includes("next command"));
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
    assert.ok(markdown.includes("Pane Surfaces"));
    assert.ok(markdown.includes("Reader Surfaces"));
    assert.ok(markdown.includes("Menu Surfaces"));
  });

  it("should render split human guides for manual usage only", () => {
    const quickstart = buildHumanQuickstartMarkdown();
    const advanced = buildHumanAdvancedGuideMarkdown();

    assert.ok(quickstart.includes("# 模板协作人工快速上手"));
    assert.ok(quickstart.includes("## 快速入口"));
    assert.ok(quickstart.includes("## Reader Verdict 三模板"));
    assert.ok(quickstart.includes("npm run agent:zotero:e2e:update-baseline"));
    assert.ok(quickstart.includes("[[04-模板协作-高级介入规范]]"));
    assert.ok(quickstart.includes("npm run agent:ui:design -- run product-ui-design-update"));
    assert.ok(quickstart.includes("20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md"));
    assert.ok(advanced.includes("# 模板协作高级介入规范"));
    assert.ok(advanced.includes("## 字段语义说明"));
    assert.ok(advanced.includes("## 哪些内容不要改"));
    assert.ok(advanced.includes("## 产品整体 UI 设计链"));
    assert.ok(advanced.includes("dist/agent-delegation/OBSIDIAN-UI-DESIGN-001/"));
    assert.ok(advanced.includes("## Reader Verdict 专用模板"));
    assert.ok(advanced.includes("真实回归"));
    assert.ok(advanced.includes("证据不足"));
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

  it("should clear stale baseline refresh carry-over once the actual regression repair batch is active", () => {
    const content = buildHumanInterventionWindowMarkdown({
      generatedAt: "2026-03-30T10:13:41.019Z",
      statusLabel: "需先处理",
      headline: "视觉主阻断：疑似真实界面回归；library 几何一致 2000x1200；reader 几何一致 2000x1200；暂不刷新基线；canonical 基线覆盖完整：4/4 已对齐",
      nextAction: "npm run agent:obsidian",
      visualPrimaryBlockerKind: "ui-regression-candidate",
      visualCanonicalCoverageKind: "complete",
      currentTruthActiveBatchId: "READER-HIGH-126",
      manualVerdictResolved: true,
      patchSummary: {},
    }, [
      "# ignored",
      "## 人工编辑区（保留）",
      "",
      "状态: ready",
      "模式: force-next",
      "下一步指令: npm run agent:zotero:e2e:update-baseline",
      "关注文件: tests/visual-baselines/agent-zotero-e2e/restart-library.png, tests/visual-baselines/agent-zotero-e2e/restart-reader.png",
      "备注: 人工确认属于预期 UI 变化；仅执行一次受控 baseline refresh，并按固定链路复验。",
    ].join("\n"));

    const parsed = parseHumanInterventionWindow(content);
    assert.ok(content.includes("当前阶段：已确认真实回归，按修复路径继续"));
    assert.equal(content.includes("## Reader Verdict 推荐模板"), false);
    assert.equal(content.includes("npm run agent:zotero:e2e:update-baseline"), false);
    assert.equal(parsed.status, "pending");
    assert.equal(parsed.mode, "auto");
    assert.equal(parsed.nextActionOverride, "");
    assert.deepEqual(parsed.focusFiles, []);
    assert.equal(parsed.note, "");
    assert.equal(parsed.intervened, false);
  });

  it("should render Reader verdict templates without changing the input surface", () => {
    const content = buildHumanInterventionWindowMarkdown({
      generatedAt: "2026-03-27T08:00:00.000Z",
      statusLabel: "需关注",
      headline: "当前主阻断为 Reader 视觉回归候选。",
      nextAction: "npm run agent:obsidian",
      visualPrimaryBlockerKind: "ui-regression-candidate",
      visualCanonicalCoverageKind: "complete",
      patchSummary: {},
    });

    assert.ok(content.includes("## Reader Verdict 推荐模板"));
    assert.ok(content.includes("状态: ready"));
    assert.ok(content.includes("npm run agent:zotero:e2e:update-baseline"));
    assert.ok(content.includes("真实回归"));
    assert.ok(content.includes("证据不足"));
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
      assert.ok(canvas.nodes.some((item) => String(item.text).includes("当前 Zotero 插件白板")));
      assert.ok(canvas.nodes.some((item) => String(item.text).includes("共享技术骨架")));
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
            toolbarDispatchMode: "customEvent",
            toolbarAppendedItemCount: 1,
            selectionPopupAppendedItemCount: 1,
            sidebarHeaderAppendedItemCount: 2,
            contextMenuProbeCount: 5,
            contextMenuObservedTypes: [
              "createViewContextMenu",
              "createAnnotationContextMenu",
            ],
            contextMenuSyntheticFallbackTypes: [
              "createViewContextMenu",
            ],
            readerDispatchSummary: "工具栏 customEvent；文本浮层 synthetic-fallback；侧栏批注头 customEvent",
            contextMenuSummary: "已观测 5 类；synthetic-fallback 5 类",
            toolbarEvidenceSummary: "renderToolbar 宿主点已观测；Hook 通过；细粒度 通过；分发 customEvent",
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
    assert.equal(summary.toolbarDispatchMode, "customEvent");
    assert.equal(summary.toolbarAppendedItemCount, 1);
    assert.equal(summary.selectionPopupAppendedItemCount, 1);
    assert.equal(summary.sidebarHeaderAppendedItemCount, 2);
    assert.equal(summary.contextMenuProbeCount, 5);
    assert.deepEqual(summary.contextMenuObservedTypes, [
      "createViewContextMenu",
      "createAnnotationContextMenu",
    ]);
    assert.deepEqual(summary.contextMenuSyntheticFallbackTypes, [
      "createViewContextMenu",
    ]);
    assert.ok(summary.readerDispatchSummary?.includes("工具栏"));
    assert.ok(summary.readerDispatchSummary?.includes("文本浮层"));
    assert.ok(summary.readerDispatchSummary?.includes("synthetic-fallback"));
    assert.ok(summary.readerDispatchSummary?.includes("侧栏批注头"));
    assert.ok(summary.readerDispatchSummary?.includes("customEvent"));
    assert.ok(summary.contextMenuSummary?.includes("已观测 5 类"));
    assert.ok(summary.contextMenuSummary?.includes("synthetic-fallback 5 类"));
    assert.ok(summary.toolbarEvidenceSummary?.includes("renderToolbar 宿主点已观测"));
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
            toolbarDispatchMode: null,
            toolbarAppendedItemCount: null,
            selectionPopupAppendedItemCount: null,
            sidebarHeaderAppendedItemCount: null,
            contextMenuProbeCount: null,
            contextMenuObservedTypes: [],
            contextMenuSyntheticFallbackTypes: [],
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
    assert.equal(summary.toolbarDispatchMode, null);
    assert.equal(summary.toolbarAppendedItemCount, null);
    assert.equal(summary.selectionPopupAppendedItemCount, null);
    assert.equal(summary.sidebarHeaderAppendedItemCount, null);
    assert.equal(summary.contextMenuProbeCount, null);
    assert.deepEqual(summary.contextMenuObservedTypes, []);
    assert.deepEqual(summary.contextMenuSyntheticFallbackTypes, []);
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
    assert.ok(markdown.includes("详见：[[02-当前Zotero插件-证据索引]]"));
    assert.ok(markdown.includes("当前阶段：等待人工 Reader verdict"));

    const humanWindow = buildHumanInterventionWindowMarkdown(summary, "");
    assert.ok(humanWindow.includes("当前阶段：等待人工 Reader verdict"));
    assert.ok(humanWindow.includes("视觉导航"));
    assert.ok(humanWindow.includes("Attempt 诊断"));
    assert.ok(humanWindow.includes("已降级，先人工复核视觉证据"));
    assert.ok(humanWindow.includes("当前主路径等待人工 Reader verdict，不默认执行 baseline refresh、autofix 或 rerun E2E。"));
    assert.equal(humanWindow.includes("刷新基线 x2"), false);
  });

  it("should keep library-only evidence visible in obsidian workbench while leaving canonical coverage complete", () => {
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
            visualCanonicalMismatchedTargets: [],
            visualEvidenceObserved: true,
            visualEvidenceItemCount: 4,
            visualEvidenceFailingItemCount: 2,
            visualEvidenceSummary: "library 漂移 22.09% / 18.19；reader 已对齐",
            visualEvidenceItems: [
              {
                cycleIndex: 1,
                bootMode: "restart",
                kind: "library",
                canonicalTarget: "restart-library.png",
                capturePath: "/tmp/cycle-1-library.png",
                baselinePath: "/tmp/restart-library.png",
                captureStable: true,
                selectedAttempt: 2,
                selectionReason: "stable-hash-pair",
                geometryMatched: true,
                changedRatio: 0.224,
                meanChannelDiff: 18.61,
                issues: ["library 截图与基线平均通道差异过大：18.61 > 18.00"],
              },
              {
                cycleIndex: 2,
                bootMode: "hot-reload",
                kind: "library",
                canonicalTarget: "hot-reload-library.png",
                capturePath: "/tmp/cycle-2-library.png",
                baselinePath: "/tmp/hot-reload-library.png",
                captureStable: true,
                selectedAttempt: 2,
                selectionReason: "stable-hash-pair",
                geometryMatched: true,
                changedRatio: 0.2209,
                meanChannelDiff: 18.19,
                issues: ["library 截图与基线平均通道差异过大：18.19 > 18.00"],
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
    assert.equal(summary.visualCanonicalCoverageKind, "complete");
    assert.deepEqual(summary.visualCanonicalMismatchedTargets, []);
    assert.equal(summary.visualEvidenceItems.length, 2);
    assert.ok(summary.visualEvidenceFocusSummary?.includes("restart-library.png"));

    const evidenceMarkdown = buildObsidianEvidenceMarkdown(summary);
    assert.ok(evidenceMarkdown.includes("[cycle-1-library.png](/tmp/cycle-1-library.png)"));
    assert.ok(evidenceMarkdown.includes("[restart-library.png](/tmp/restart-library.png)"));
    assert.ok(evidenceMarkdown.includes("[cycle-2-library.png](/tmp/cycle-2-library.png)"));
    assert.ok(evidenceMarkdown.includes("[hot-reload-library.png](/tmp/hot-reload-library.png)"));

    const humanWindow = buildHumanInterventionWindowMarkdown(summary, "");
    assert.ok(humanWindow.includes("当前阶段：等待人工 Reader verdict"));
    assert.ok(humanWindow.includes("restart-library.png"));
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
      toolbarDispatchMode: "customEvent",
      toolbarAppendedItemCount: 1,
      selectionPopupAppendedItemCount: 1,
      sidebarHeaderAppendedItemCount: 2,
      contextMenuProbeCount: 5,
      contextMenuObservedTypes: [
        "createViewContextMenu",
        "createAnnotationContextMenu",
      ],
      contextMenuSyntheticFallbackTypes: [
        "createViewContextMenu",
      ],
      toolbarEvidenceSummary: "renderToolbar 宿主点已观测；Hook 通过；细粒度 通过",
      visualEvidenceSummary: "library 已对齐；reader 已对齐",
      visualCaptureStabilitySummary: "视觉采集稳定性：library 稳定（2 次，哈希收敛）；reader 待稳（3 次，重试上限）",
      visualCaptureStabilityStages: [
        { kind: "reader", stable: false, attemptCount: 3, selectionReason: "max-attempt-reached" },
      ],
      readerDispatchSummary: "工具栏 customEvent；文本浮层 synthetic-fallback；侧栏批注头 customEvent",
      contextMenuSummary: "已观测 5 类；synthetic-fallback 5 类",
      patchSummary: null,
    });

    assert.ok(markdown.includes("# 当前 Zotero 插件状态总览"));
    assert.ok(markdown.includes("## Reader 专项证据"));
    assert.ok(markdown.includes("侧边栏视图 annotations"));
    assert.ok(markdown.includes("工具栏分发"));
    assert.ok(markdown.includes("工具栏追加项"));
    assert.ok(markdown.includes("工具栏 customEvent"));
    assert.ok(markdown.includes("文本浮层追加项"));
    assert.ok(markdown.includes("侧栏批注头追加项"));
    assert.ok(markdown.includes("上下文菜单探针数"));
    assert.ok(markdown.includes("已观测类型"));
    assert.ok(markdown.includes("fallback 类型"));
    assert.ok(markdown.includes("renderToolbar 证据"));
    assert.ok(markdown.includes("视觉证据"));
    assert.ok(markdown.includes("视觉采集稳定性"));
    assert.ok(markdown.includes("用尽预算 stage：reader（3 次）"));
    assert.ok(markdown.includes("文本浮层 synthetic-fallback"));
    assert.ok(markdown.includes("侧栏批注头 customEvent"));
    assert.ok(markdown.includes("已观测 5 类"));
    assert.ok(markdown.includes("createViewContextMenu"));
  });
});
