import { describe, it, assert } from "./test-framework.js";
import {
  deriveRecoverySteps,
  buildAutofixMarkdown,
} from "../scripts/agent-zotero-autofix-lib.mjs";

describe("Agent Zotero AutoFix Lib", () => {
  it("should derive recovery steps for runtime and test failures", () => {
    const steps = deriveRecoverySteps({
      passed: false,
      issues: [
        "插件实例未挂载到 Zotero[instanceKey]。",
        "Zotero 集成测试失败 1 项。",
        "Zotero 场景脚本失败 1 项。",
      ],
      cycles: [{
        tests: {
          failed: 1,
        },
        scenarios: {
          failed: 1,
        },
      }],
    }, {
      cycles: 2,
    });

    assert.ok(Array.isArray(steps));
    assert.ok(steps.some((step) => step.id === "check"));
    assert.ok(steps.some((step) => step.id === "fresh-restart"));
    assert.ok(steps.some((step) => step.id === "zotero-test"));
    assert.ok(steps.some((step) => step.id === "zotero-scenario"));
  });

  it("should refresh visual baseline before final verification when only visual drift remains", () => {
    const steps = deriveRecoverySteps({
      passed: false,
      issues: [
        "reader 截图与基线像素漂移过大：20.00% > 5.00%",
        "reader 截图与基线平均通道差异过大：12.00 > 5.00",
      ],
      cycles: [{
        tests: {
          failed: 0,
        },
        scenarios: {
          failed: 0,
        },
      }],
    }, {
      cycles: 2,
    });

    assert.ok(steps.some((step) => step.id === "update-visual-baseline"));
    assert.equal(steps.some((step) => step.id === "check"), false);
    assert.equal(steps.some((step) => step.id === "zotero-test"), false);
    assert.equal(steps.some((step) => step.id === "zotero-scenario"), false);
    assert.equal(steps[steps.length - 1].id, "fallback-restart");
  });

  it("should avoid refreshing visual baseline when runtime issues still exist", () => {
    const steps = deriveRecoverySteps({
      passed: false,
      issues: [
        "插件实例未挂载到 Zotero[instanceKey]。",
        "reader 截图与基线像素漂移过大：20.00% > 5.00%",
      ],
      cycles: [{
        tests: {
          failed: 0,
        },
        scenarios: {
          failed: 0,
        },
      }],
    }, {
      cycles: 2,
    });

    assert.equal(steps.some((step) => step.id === "update-visual-baseline"), false);
    assert.ok(steps.some((step) => step.id === "check"));
    assert.ok(steps.some((step) => step.id === "fresh-restart"));
  });

  it("should render autofix markdown summary", () => {
    const markdown = buildAutofixMarkdown({
      generatedAt: "2026-03-19T00:00:00.000Z",
      initialStrategy: "hot",
      maxAttempts: 4,
      recovered: true,
      attempts: [{
        index: 1,
        kind: "e2e",
        label: "初始 Zotero E2E 验证",
        exitCode: 0,
        ok: true,
        note: "初始验证通过",
      }],
      patchPlan: {
        status: "review-ready",
        statusLabel: "可进入受限补丁审阅",
        mode: "review-only",
        whitelisted: true,
        featureLabel: "ItemPane 注册",
        fingerprint: "item-pane:item-pane-section-missing",
        whitelistRuleId: "registration-item-pane-section",
        rationale: "允许补齐 ItemPane Section 注册遗漏。",
        allowedTargets: ["src/features/item-pane.js"],
        proposedEdits: ["补齐注册调用。"],
        guardrails: ["不得修改持久化结构。"],
        postApplyVerification: {
          strategy: "restart",
          fresh: true,
        },
        verificationContract: {
          summary: "补丁后必须确认 ItemPane Section 注册计数恢复。",
          checks: [
            {
              id: "item-pane-section-count",
              label: "ItemPane Section 注册计数",
              detail: "最近一轮 E2E checks.itemPaneSections 应至少为 1。",
            },
            {
              id: "cycle-failed-count",
              label: "失败轮次数",
              required: false,
              detail: "观察项：失败轮次数最好为 0。",
            },
          ],
        },
        patchDrafts: [{
          file: "src/app/plugin.js",
          operation: "create",
          anchor: "registerBaselineFeatures() / itemPane.registerSection",
          summary: "补齐注册调用。",
          patch: "@@ registerBaselineFeatures()\n++    itemPane.registerSection({ ... });",
        }],
        nextAction: "生成可审阅 patch。",
      },
      patchApplication: {
        attempted: true,
        ok: true,
        status: "applied",
        appliedFiles: ["src/app/plugin.js"],
        results: [{ file: "src/app/plugin.js", reason: "applied" }],
      },
      patchArchive: {
        present: true,
        runId: "20260321T010203000Z",
        historyDir: "dist/agent-zotero-autofix-history",
        entryJSON: "dist/agent-zotero-autofix-history/20260321T010203000Z.json",
        latestJSON: "dist/agent-zotero-autofix-history/latest.json",
        patch: {
          featureLabel: "ItemPane 注册",
          draftOperations: [
            {
              operation: "create",
              count: 1,
              files: ["src/app/plugin.js"],
              fileCount: 1,
            },
          ],
          resultReasonSummary: [
            {
              reason: "applied",
              count: 1,
              files: ["src/app/plugin.js"],
              fileCount: 1,
            },
          ],
        },
        verificationContract: {
          status: "verification-passed",
          statusLabel: "补丁复验通过",
          summary: "补丁后必须确认 ItemPane Section 注册计数恢复。",
          checks: [
            {
              id: "restart-e2e",
              label: "重启策略 E2E 复验",
              satisfied: true,
              detail: "补丁应用后已自动执行 restart 策略复验。",
            },
          ],
          failedChecks: [],
        },
      },
      recommendations: ["闭环已恢复，可继续进入真实功能开发与回归。"],
    });

    assert.ok(markdown.includes("# Agent Zotero Auto-Fix 报告"));
    assert.ok(markdown.includes("| 序号 | 类型 | 步骤 |"));
    assert.ok(markdown.includes("闭环已恢复"));
    assert.ok(markdown.includes("## 受限补丁计划"));
    assert.ok(markdown.includes("可进入受限补丁审阅"));
    assert.ok(markdown.includes("### 补丁草案"));
    assert.ok(markdown.includes("操作: 创建文件（create）"));
    assert.ok(markdown.includes("itemPane.registerSection"));
    assert.ok(markdown.includes("补丁后复验策略"));
    assert.ok(markdown.includes("复验合同模板"));
    assert.ok(markdown.includes("观察项"));
    assert.ok(markdown.includes("## 补丁应用结果"));
    assert.ok(markdown.includes("## 补丁归档"));
    assert.ok(markdown.includes("归档补丁功能: ItemPane 注册"));
    assert.ok(markdown.includes("归档补丁动作: 创建文件 x1"));
    assert.ok(markdown.includes("归档结果摘要: 已应用 x1"));
    assert.ok(markdown.includes("补丁复验通过"));
    assert.ok(markdown.includes("src/app/plugin.js"));
  });

  it("should render patch precheck issue summary in autofix markdown", () => {
    const markdown = buildAutofixMarkdown({
      generatedAt: "2026-03-19T00:00:00.000Z",
      initialStrategy: "hot",
      maxAttempts: 4,
      recovered: false,
      attempts: [],
      patchApplication: {
        attempted: true,
        ok: false,
        status: "precheck-failed",
        appliedFiles: [],
        results: [
          { file: "src/app/plugin.js", reason: "anchor-not-found" },
          { file: "src/app/plugin.js", reason: "anchor-not-found" },
          { file: "src/features/item-pane.js", reason: "target-file-missing" },
        ],
      },
      recommendations: ["请先处理预检阻塞，再进入下一轮复验。"],
    });

    assert.ok(markdown.includes("预检失败"));
    assert.ok(markdown.includes("阻塞原因汇总"));
    assert.ok(markdown.includes("锚点不存在 x2"));
    assert.ok(markdown.includes("目标文件缺失 x1"));
  });

  it("should render verification overview and failure portrait in autofix markdown", () => {
    const markdown = buildAutofixMarkdown({
      generatedAt: "2026-03-19T00:00:00.000Z",
      initialStrategy: "restart",
      maxAttempts: 3,
      recovered: false,
      attempts: [],
      patchArchive: {
        present: true,
        runId: "20260321T010203000Z",
        historyDir: "dist/agent-zotero-autofix-history",
        entryJSON: "dist/agent-zotero-autofix-history/20260321T010203000Z.json",
        latestJSON: "dist/agent-zotero-autofix-history/latest.json",
        verificationContract: {
          status: "verification-failed",
          statusLabel: "补丁复验失败",
          summary: "补丁后仍有必需项和观察项未通过。",
          checks: [
            {
              id: "restart-e2e",
              label: "重启策略 E2E 复验",
              kind: "all-cycle-check",
              required: true,
              satisfied: false,
            },
            {
              id: "item-pane-section-count",
              label: "ItemPane Section 注册计数",
              kind: "latest-cycle-check",
              required: true,
              satisfied: false,
            },
            {
              id: "visual-drift-count",
              label: "视觉漂移数量",
              kind: "report-field",
              required: false,
              satisfied: false,
            },
          ],
        },
      },
    });

    assert.ok(markdown.includes("复验总览: 必需 通过 0 / 失败 2；观察 通过 0 / 失败 1"));
    assert.ok(markdown.includes("必需失败项: 重启策略 E2E 复验（restart-e2e）"));
    assert.ok(markdown.includes("观察失败项: 视觉漂移数量（visual-drift-count）"));
    assert.ok(markdown.includes("失败类型画像: 跨轮次检查 x1；最新轮次检查 x1；聚合报告字段 x1"));
  });
});
