import {
  pickPatchApplicationStatusLabel,
  pickPatchBlockReasonLabel,
  pickPatchOperationLabel,
  summarizeVerificationContractStats,
} from "./agent-zotero-validation-lib.mjs";

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

function formatDateTime(dateLike) {
  if (!dateLike) {
    return "-";
  }
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return String(dateLike);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatVerificationCheckList(checks, limit = 3) {
  const list = (Array.isArray(checks) ? checks : [])
    .filter((item) => item && typeof item === "object")
    .slice(0, limit)
    .map((item) => {
      const label = String(item?.label || item?.id || "未知检查").trim() || "未知检查";
      const id = String(item?.id || "").trim();
      return id ? `${label}（${id}）` : label;
    });
  return list.length > 0 ? list.join("；") : "-";
}

function getVerificationKindRank(kind) {
  switch (String(kind || "").trim()) {
    case "all-cycle-check":
      return 0;
    case "latest-cycle-check":
      return 1;
    case "report-field":
      return 2;
    default:
      return 9;
  }
}

function mergeVerificationKindEntries(...groups) {
  const kindMap = new Map();
  groups.flat().forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const kind = String(item?.kind || "").trim() || "unknown";
    if (!kindMap.has(kind)) {
      kindMap.set(kind, {
        kind,
        label: item?.label || item?.kind || "未知检查",
        count: 0,
      });
    }
    kindMap.get(kind).count += Number(item?.count || 0);
  });
  return Array.from(kindMap.values())
    .sort((a, b) => {
      const rankDiff = getVerificationKindRank(a.kind) - getVerificationKindRank(b.kind);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      const labelDiff = String(a.label || a.kind || "").localeCompare(String(b.label || b.kind || ""), "zh-CN");
      if (labelDiff !== 0) {
        return labelDiff;
      }
      return String(a.kind || "").localeCompare(String(b.kind || ""));
    });
}

function formatVerificationKindList(entries, limit = 3) {
  const list = mergeVerificationKindEntries(Array.isArray(entries) ? entries : [])
    .slice(0, limit)
    .map((item) => `${item.label || item.kind || "未知检查"} x${Number(item.count || 0)}`);
  return list.length > 0 ? list.join("；") : "-";
}

export function deriveRecoverySteps(report, options = {}) {
  if (!report || report.passed) {
    return [];
  }

  const cycles = Number(options.cycles || 2);
  const issues = Array.isArray(report.issues) ? report.issues : [];
  const issueText = issues.join("\n").toLowerCase();
  const testFailures = (report.cycles || []).some((cycle) => Number(cycle?.tests?.failed || 0) > 0);
  const scenarioFailures = (report.cycles || []).some((cycle) => Number(cycle?.scenarios?.failed || 0) > 0);

  const hasRuntimeIssue = (
    issueText.includes("插件实例未挂载")
    || issueText.includes("插件 api 未挂载")
    || issueText.includes("runagentaction")
    || issueText.includes("runprimaryaction")
    || issueText.includes("itempane")
    || issueText.includes("itemtree")
    || issueText.includes("notifier")
  );
  const hasVisualDriftIssue = (
    issueText.includes("像素漂移")
    || issueText.includes("平均通道差异")
  );
  const hasServiceIssue = (
    issueText.includes("服务健康")
    || issueText.includes("service")
  );
  const hasOnlyVisualRegression = hasVisualDriftIssue
    && !hasRuntimeIssue
    && !testFailures
    && !scenarioFailures
    && !hasServiceIssue;

  const steps = [];

  if (hasRuntimeIssue || testFailures || scenarioFailures) {
    steps.push({
      kind: "command",
      id: "check",
      label: "运行本地质量门禁",
      command: ["npm", "run", "check"],
      reason: "先确认源码、构建与单测基线无漂移。",
    });
  }

  if (hasRuntimeIssue) {
    steps.push({
      kind: "e2e",
      id: "fresh-restart",
      label: "使用 fresh + restart 策略重新验证",
      args: ["--cycles", String(cycles), "--strategy", "restart", "--fresh"],
      reason: "运行时挂载/注册问题常见于旧 profile、热重载残留或 bootstrap 状态污染。",
    });
  }

  if (testFailures || scenarioFailures) {
    steps.push({
      kind: "command",
      id: "zotero-test",
      label: "单独重跑 Zotero 集成测试",
      command: ["npm", "run", "zotero:test"],
      reason: "将功能动作闭环失败与测试用例失败拆开定位。",
    });
  }

  if (hasOnlyVisualRegression) {
    steps.push({
      kind: "command",
      id: "update-visual-baseline",
      label: "刷新 Zotero 视觉基线",
      command: ["npm", "run", "agent:zotero:e2e:update-baseline"],
      reason: "当前仅剩视觉基线漂移，先刷新库视图/Reader 基线，再用 compare 模式复验。",
    });
  }

  if (scenarioFailures) {
    steps.push({
      kind: "command",
      id: "zotero-scenario",
      label: "单独重跑 Zotero 场景脚本",
      command: ["npm", "run", "zotero:scenario"],
      reason: "场景脚本能更快暴露动作链路和 demo 行为偏差。",
    });
  }

  steps.push({
    kind: "e2e",
    id: "fallback-restart",
    label: "最终使用 restart 策略复验",
    args: ["--cycles", String(cycles), "--strategy", "restart"],
    reason: "统一输出一份最终复验结果，便于 agent 判断是否恢复。",
  });

  const deduped = [];
  const seen = new Set();
  for (const step of steps) {
    if (seen.has(step.id)) {
      continue;
    }
    seen.add(step.id);
    deduped.push(step);
  }
  return deduped;
}

export function buildAutofixMarkdown(report) {
  const finalLabel = report.outcomeLabel || (report.recovered ? "已恢复" : "未恢复");
  const lines = [
    "# Agent Zotero Auto-Fix 报告",
    "",
    `- 生成时间: \`${report.generatedAt}\` (${formatDateTime(report.generatedAt)})`,
    `- 初始策略: \`${report.initialStrategy}\``,
    `- 最大尝试次数: \`${report.maxAttempts}\``,
    `- 总耗时: \`${report.totalDurationMs ?? 0}ms\``,
    `- 最终结果: \`${finalLabel}\``,
    "",
    "## 执行记录",
    "",
    "| 序号 | 类型 | 步骤 | 结果 | 退出码 | 耗时(ms) | 说明 |",
    "|---:|---|---|---|---:|---:|---|",
  ];

  for (const attempt of report.attempts || []) {
    lines.push(
      `| ${attempt.index} | ${escapeMarkdown(attempt.kind)} | ${escapeMarkdown(attempt.label)} | ${attempt.ok ? "成功" : "失败"} | ${attempt.exitCode ?? "-"} | ${attempt.durationMs ?? 0} | ${escapeMarkdown(attempt.note || "-")} |`,
    );
  }

  lines.push("", "## 恢复建议", "");
  if ((report.recommendations || []).length === 0) {
    lines.push("- 无");
  } else {
    for (const item of report.recommendations) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("", "## 受限补丁计划", "");
  const patchPlan = report.patchPlan && typeof report.patchPlan === "object"
    ? report.patchPlan
    : null;
  if (!patchPlan) {
    lines.push("- 无");
  } else {
    lines.push(`- 状态: \`${patchPlan.statusLabel || patchPlan.status || "未知"}\``);
    lines.push(`- 模式: \`${patchPlan.mode || "none"}\``);
    lines.push(`- 是否命中白名单: \`${patchPlan.whitelisted ? "是" : "否"}\``);
    if (patchPlan.featureLabel || patchPlan.feature) {
      lines.push(`- 功能: \`${patchPlan.featureLabel || patchPlan.feature}\``);
    }
    if (patchPlan.fingerprint) {
      lines.push(`- 诊断指纹: \`${patchPlan.fingerprint}\``);
    }
    if (patchPlan.whitelistRuleId) {
      lines.push(`- 白名单规则: \`${patchPlan.whitelistRuleId}\``);
    }
    if (patchPlan.rationale) {
      lines.push(`- 原因: ${patchPlan.rationale}`);
    }
    if (patchPlan.unsupportedDiagnosisCategoryLabel || patchPlan.unsupportedDiagnosisReason) {
      lines.push(`- 未进入白名单: ${patchPlan.unsupportedDiagnosisCategoryLabel || patchPlan.unsupportedDiagnosisCategory || "-"}`);
      lines.push(`- 阻塞说明: ${patchPlan.unsupportedDiagnosisReason || "-"}`);
    }
    if (Array.isArray(patchPlan.allowedTargets) && patchPlan.allowedTargets.length > 0) {
      lines.push("- 允许修改范围:");
      patchPlan.allowedTargets.forEach((item) => lines.push(`- 目标文件: ${item}`));
    }
    if (Array.isArray(patchPlan.proposedEdits) && patchPlan.proposedEdits.length > 0) {
      lines.push("- 建议补丁动作:");
      patchPlan.proposedEdits.forEach((item) => lines.push(`- 建议补丁: ${item}`));
    }
    if (Array.isArray(patchPlan.guardrails) && patchPlan.guardrails.length > 0) {
      lines.push("- 补丁护栏:");
      patchPlan.guardrails.forEach((item) => lines.push(`- 护栏: ${item}`));
    }
    if (patchPlan.nextAction) {
      lines.push(`- 下一步: ${patchPlan.nextAction}`);
    }
    if (patchPlan.postApplyVerification) {
      lines.push(`- 补丁后复验策略: \`${patchPlan.postApplyVerification.strategy || "restart"}${patchPlan.postApplyVerification.fresh ? " + fresh" : ""}\``);
    }
    if (patchPlan.verificationContract?.summary) {
      lines.push(`- 复验合同摘要: ${patchPlan.verificationContract.summary}`);
    }
    if (Array.isArray(patchPlan.verificationContract?.checks) && patchPlan.verificationContract.checks.length > 0) {
      lines.push("- 复验合同模板:");
      patchPlan.verificationContract.checks.forEach((check) => {
        lines.push(`- 合同检查: ${check?.label || check?.id || "unknown"} / ${check?.required === false ? "观察项" : "必需项"} / ${check?.detail || "-"}`);
      });
    }
    if (Array.isArray(patchPlan.patchDrafts) && patchPlan.patchDrafts.length > 0) {
      lines.push("", "### 补丁草案", "");
      patchPlan.patchDrafts.forEach((draft, index) => {
        lines.push(`#### 草案 ${index + 1}`, "");
        lines.push(`- 目标文件: ${draft.file || "-"}`);
        if (draft.sourceFile) {
          lines.push(`- 来源文件: ${draft.sourceFile}`);
        }
        lines.push(`- 操作: ${pickPatchOperationLabel(draft.operation)}${draft.operation ? `（${draft.operation}）` : ""}`);
        lines.push(`- 锚点: ${draft.anchor || "-"}`);
        lines.push(`- 摘要: ${draft.summary || "-"}`, "");
        if (draft.patch) {
          lines.push("```diff");
          lines.push(String(draft.patch));
          lines.push("```", "");
        }
      });
    }
  }

  lines.push("", "## 补丁应用结果", "");
  const patchApplication = report.patchApplication && typeof report.patchApplication === "object"
    ? report.patchApplication
    : null;
  if (!patchApplication || !patchApplication.attempted) {
    lines.push("- 未尝试应用补丁草案");
  } else {
    const statusCode = String(patchApplication.status || "unknown");
    lines.push(`- 状态: \`${pickPatchApplicationStatusLabel(statusCode)}\` (\`${statusCode}\`)`);
    lines.push(`- 是否成功: \`${patchApplication.ok ? "是" : "否"}\``);
    lines.push(`- 已写入文件: ${(patchApplication.appliedFiles || []).join("、") || "-"}`);
    if (Array.isArray(patchApplication.results) && patchApplication.results.length > 0) {
      patchApplication.results.forEach((item) => {
        const reason = String(item?.reason || "unknown");
        lines.push(`- 结果: ${item.file || "-"} -> ${pickPatchBlockReasonLabel(reason)} (\`${reason}\`)`);
      });
      const issueMap = new Map();
      patchApplication.results.forEach((item) => {
        const reason = String(item?.reason || "").trim();
        if (!reason || reason === "ready" || reason === "applied") {
          return;
        }
        issueMap.set(reason, (issueMap.get(reason) || 0) + 1);
      });
      if (issueMap.size > 0) {
        lines.push("- 阻塞原因汇总:");
        Array.from(issueMap.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .forEach(([reason, count]) => {
            lines.push(`- 原因: ${pickPatchBlockReasonLabel(reason)} x${count} (\`${reason}\`)`);
          });
      }
    }
  }

  lines.push("", "## 补丁归档", "");
  const patchArchive = report.patchArchive && typeof report.patchArchive === "object"
    ? report.patchArchive
    : null;
  if (!patchArchive || patchArchive.present !== true) {
    lines.push("- 未生成补丁归档");
  } else {
    const verificationStats = summarizeVerificationContractStats(patchArchive.verificationContract);
    const verificationKinds = mergeVerificationKindEntries(
      verificationStats.failedCheckKinds,
      verificationStats.optionalFailedCheckKinds,
    );
    lines.push(`- 运行 ID: \`${patchArchive.runId || "-"}\``);
    lines.push(`- 归档目录: \`${patchArchive.historyDir || "-"}\``);
    lines.push(`- 当前归档: \`${patchArchive.entryJSON || "-"}\``);
    lines.push(`- 最新索引: \`${patchArchive.latestJSON || "-"}\``);
    if (patchArchive.patch?.featureLabel) {
      lines.push(`- 归档补丁功能: ${patchArchive.patch.featureLabel}`);
    }
    if (Array.isArray(patchArchive.patch?.draftOperations) && patchArchive.patch.draftOperations.length > 0) {
      lines.push(`- 归档补丁动作: ${patchArchive.patch.draftOperations.map((entry) => `${pickPatchOperationLabel(entry?.operation)} x${entry?.count ?? 0}`).join("；")}`);
    }
    if (Array.isArray(patchArchive.patch?.resultReasonSummary) && patchArchive.patch.resultReasonSummary.length > 0) {
      lines.push(`- 归档结果摘要: ${patchArchive.patch.resultReasonSummary.map((entry) => `${pickPatchBlockReasonLabel(entry?.reason)} x${entry?.count ?? 0}`).join("；")}`);
    }
    lines.push(`- 复验合同状态: \`${patchArchive.verificationContract?.statusLabel || patchArchive.verificationContract?.status || "未知"}\``);
    if (patchArchive.verificationContract?.summary) {
      lines.push(`- 复验合同摘要: ${patchArchive.verificationContract.summary}`);
    }
    lines.push(`- 复验总览: 必需 通过 ${Number(verificationStats.requiredPassed || 0)} / 失败 ${Number(verificationStats.requiredFailed || 0)}；观察 通过 ${Number(verificationStats.optionalPassed || 0)} / 失败 ${Number(verificationStats.optionalFailed || 0)}`);
    lines.push(`- 必需失败项: ${formatVerificationCheckList(verificationStats.failedChecksSorted)}`);
    lines.push(`- 观察失败项: ${formatVerificationCheckList(verificationStats.optionalFailedChecksSorted)}`);
    lines.push(`- 失败类型画像: ${formatVerificationKindList(verificationKinds)}`);
    if (Array.isArray(patchArchive.verificationContract?.failedChecks) && patchArchive.verificationContract.failedChecks.length > 0) {
      lines.push(`- 复验失败项: ${patchArchive.verificationContract.failedChecks.map((check) => check?.label || check?.id || "unknown").join("；")}`);
    }
    if (Array.isArray(patchArchive.verificationContract?.optionalFailedChecks) && patchArchive.verificationContract.optionalFailedChecks.length > 0) {
      lines.push(`- 观察项未通过: ${patchArchive.verificationContract.optionalFailedChecks.map((check) => check?.label || check?.id || "unknown").join("；")}`);
    }
    if (Array.isArray(patchArchive.verificationContract?.checks) && patchArchive.verificationContract.checks.length > 0) {
      lines.push("- 复验合同检查:");
      patchArchive.verificationContract.checks.forEach((check) => {
        const result = check?.satisfied ? "通过" : "未通过";
        lines.push(`- 检查: ${check?.label || check?.id || "unknown"} / ${check?.required === false ? "观察项" : "必需项"} / ${result} / ${check?.detail || "-"}`);
      });
    }
  }

  lines.push("");
  return lines.join("\n");
}
