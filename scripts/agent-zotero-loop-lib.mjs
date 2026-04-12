import { buildMonitorFrontpageSummary } from "./agent-frontpage-summary-lib.mjs";
import {
  buildVisualCaptureFailureStageSummary,
  buildVisualExhaustedStageSummary,
  isPureVisualReaderFailure,
  pickPureVisualReaderNextAction,
} from "./agent-zotero-validation-lib.mjs";

function normalizeGateReport(gateReport) {
  if (!gateReport || typeof gateReport !== "object") {
    return {
      present: false,
      gatePassed: null,
      status: "missing",
      statusLabel: "缺失",
      headline: null,
      nextAction: null,
    };
  }

  const frontpage = gateReport.frontpageSummary && typeof gateReport.frontpageSummary === "object"
    ? gateReport.frontpageSummary
    : {};

  return {
    present: true,
    gatePassed: gateReport.gatePassed === true,
    status: frontpage.status || (gateReport.gatePassed === true ? "ready" : "blocked"),
    statusLabel: frontpage.statusLabel || (gateReport.gatePassed === true ? "可继续" : "需先处理"),
    headline: frontpage.headline || null,
    nextAction: frontpage.nextAction || null,
  };
}

export function summarizeZoteroLoopState({
  watchStatus,
  e2e,
  autofix,
  watchRecovery,
  gate,
}, options = {}) {
  const requireWatchRecovery = options.requireWatchRecovery !== false;
  const gateSummary = normalizeGateReport(gate);
  const frontpageSummary = buildMonitorFrontpageSummary({
    latest: null,
    watchStatus,
    zoteroValidation: {
      e2e,
      autofix,
      watchRecovery,
    },
  });

  const watchNeedsRefresh = !watchStatus?.present || watchStatus.status !== "healthy";
  const e2eMissing = !e2e?.present;
  const e2eNeedsRefresh = watchNeedsRefresh && e2e?.present === true && e2e?.status !== "passed";
  const e2eNeedsRun = e2eMissing || e2eNeedsRefresh;
  const pureVisualReaderFailure = isPureVisualReaderFailure(e2e);
  const pureVisualNextAction = pickPureVisualReaderNextAction(e2e);
  const pureVisualNeedsBaselineUpdate = pureVisualReaderFailure && pureVisualNextAction === "npm run agent:zotero:e2e:update-baseline";
  const pureVisualNeedsObsidian = pureVisualReaderFailure && pureVisualNextAction === "npm run agent:obsidian";
  const pureVisualNeedsE2ERerun = pureVisualReaderFailure && pureVisualNextAction === "npm run agent:zotero:e2e";
  const autofixRecommended = !e2eNeedsRun
    && !pureVisualReaderFailure
    && (e2e?.status === "failed" || autofix?.status === "unrecovered");
  const watchRecoveryNeeded = requireWatchRecovery
    && (!watchRecovery?.present || watchRecovery.status !== "passed");

  const issues = [];
  if (watchNeedsRefresh) {
    issues.push(`watch 状态需要刷新：${watchStatus?.statusLabel || "缺失"}。`);
  }
  if (e2eMissing) {
    issues.push("缺少 Zotero 真机 E2E 报告。");
  } else if (e2eNeedsRefresh) {
    issues.push("watch 状态未处于健康态，需在刷新后重新执行 Zotero 真机 E2E。");
  } else if (e2e?.status === "failed") {
    issues.push(`Zotero 真机 E2E 当前为 ${e2e.statusLabel || e2e.status || "失败"}。`);
    if (pureVisualReaderFailure) {
      issues.push(`当前失败已收敛为 Reader 视觉阻断：${e2e?.visualPrimaryBlockerKindLabel || e2e?.visualPrimaryBlockerKind || "未知视觉阻断"}。`);
      if (String(e2e?.visualPrimaryBlockerKind || "").trim() === "capture-command-failed") {
        const captureFailureSummary = buildVisualCaptureFailureStageSummary(e2e);
        if (captureFailureSummary) {
          issues.push(`截图失败 stage：${captureFailureSummary}`);
        }
      } else if (String(e2e?.visualPrimaryBlockerKind || "").trim() === "capture-unstable") {
        const exhaustedStageSummary = buildVisualExhaustedStageSummary(e2e);
        if (exhaustedStageSummary) {
          issues.push(`用尽预算 stage：${exhaustedStageSummary}`);
        }
      }
    }
  }
  if (autofix?.status === "unrecovered") {
    issues.push("最近自动修复未恢复成功。");
  }
  if (watchRecoveryNeeded) {
    issues.push(`恢复回归需要补跑：${watchRecovery?.statusLabel || "缺失"}。`);
  }
  if (gateSummary.present && gateSummary.gatePassed === false) {
    issues.push(gateSummary.headline || "当前 gate 未通过。");
  }

  const stable = frontpageSummary.status === "stable" || frontpageSummary.status === "recovered";
  const loopPassed = stable
    && (!requireWatchRecovery || watchRecovery?.status === "passed")
    && (gateSummary.present ? gateSummary.gatePassed === true : true);

  return {
    requireWatchRecovery,
    frontpageSummary,
    gate: gateSummary,
    watchNeedsRefresh,
    e2eNeedsRefresh,
    e2eNeedsRun,
    pureVisualReaderFailure,
    pureVisualNeedsBaselineUpdate,
    pureVisualNeedsObsidian,
    pureVisualNeedsE2ERerun,
    autofixRecommended,
    watchRecoveryNeeded,
    stable,
    loopPassed,
    issues,
  };
}

export function deriveZoteroLoopActions(state) {
  const actions = [];
  if (state.watchNeedsRefresh) {
    actions.push({
      id: "refresh-watch",
      label: "刷新 Zotero watch 健康状态",
      commandLabel: "内部刷新 `zotero:watch` 启动健康状态",
    });
  }

  if (state.e2eNeedsRun) {
    actions.push({
      id: "run-e2e",
      label: "执行 Zotero 真机 E2E",
      commandLabel: "npm run agent:zotero:e2e",
    });
  } else if (state.pureVisualNeedsBaselineUpdate) {
    actions.push({
      id: "update-visual-baseline",
      label: "刷新视觉基线并复验",
      commandLabel: "npm run agent:zotero:e2e:update-baseline",
    });
  } else if (state.pureVisualNeedsObsidian) {
    actions.push({
      id: "run-obsidian",
      label: "刷新 Obsidian 人工介入工作台",
      commandLabel: "npm run agent:obsidian",
    });
  } else if (state.pureVisualNeedsE2ERerun) {
    actions.push({
      id: "run-e2e",
      label: "复核视觉稳定性并重跑 Zotero 真机 E2E",
      commandLabel: "npm run agent:zotero:e2e",
    });
  } else if (state.autofixRecommended) {
    actions.push({
      id: "run-autofix",
      label: "执行 Zotero 自动修复闭环",
      commandLabel: "npm run agent:zotero:autofix",
    });
  }

  if (state.watchRecoveryNeeded) {
    actions.push({
      id: "run-watch-recovery",
      label: "执行 watch 恢复回归",
      commandLabel: "npm run agent:zotero:watch-recovery",
    });
  }

  actions.push(
    {
      id: "run-monitor",
      label: "刷新 agent monitor",
      commandLabel: "npm run agent:monitor",
    },
    {
      id: "run-gate",
      label: "刷新 agent gate",
      commandLabel: "npm run agent:gate",
    },
  );

  return actions;
}

export function buildZoteroLoopMarkdown(report) {
  const lines = [
    "# 当前 Zotero 插件编排回合报告",
    "",
    `- 生成时间: \`${report.generatedAt}\``,
    `- 执行模式: \`${report.dryRun ? "dry-run" : "live"}\``,
    `- 回合结果: \`${report.loopPassed ? "通过" : "需继续处理"}\``,
    `- 当前摘要状态: \`${report.finalState?.frontpageSummary?.statusLabel || "缺失"}\``,
    `- 摘要结论: ${report.finalState?.frontpageSummary?.headline || "-"}`,
    `- 下一步建议: \`${report.finalState?.frontpageSummary?.nextAction || report.nextAction || "-"}\``,
    "",
  ];

  if (report.errorCategoryLabel || report.failedStage) {
    lines.push("## 脚本失败画像", "");
    lines.push(`- 分类: \`${report.errorCategoryLabel || report.errorCategory || "-"}\``);
    lines.push(`- 阶段: \`${report.failedStage || "-"}\``);
    lines.push(`- 信息: ${report.errorMessage || "-"}`, "");
  }

  lines.push(
    "## 初始判断",
    "",
    `- 需要刷新 watch: \`${report.initialState?.watchNeedsRefresh ? "true" : "false"}\``,
    `- 需要补跑 E2E: \`${report.initialState?.e2eNeedsRun ? "true" : "false"}\``,
    `- 建议自动修复: \`${report.initialState?.autofixRecommended ? "true" : "false"}\``,
    `- 需要恢复回归: \`${report.initialState?.watchRecoveryNeeded ? "true" : "false"}\``,
    "",
    "## 执行动作",
    "",
  );

  if (!Array.isArray(report.steps) || report.steps.length === 0) {
    lines.push("- 无");
  } else {
    report.steps.forEach((step, index) => {
      lines.push(`- ${index + 1}. ${step.label} / \`${step.status || "unknown"}\` / ${step.commandLabel || "-"}`);
    });
  }

  lines.push("", "## 问题摘要", "");
  if (!Array.isArray(report.finalState?.issues) || report.finalState.issues.length === 0) {
    lines.push("- 无");
  } else {
    report.finalState.issues.slice(0, 8).forEach((item) => lines.push(`- ${item}`));
  }

  lines.push("", "## Gate 摘要", "");
  lines.push(`- Gate: \`${report.finalState?.gate?.statusLabel || "缺失"}\``);
  lines.push(`- Gate 结论: ${report.finalState?.gate?.headline || "-"}`);
  lines.push("");
  return lines.join("\n");
}
