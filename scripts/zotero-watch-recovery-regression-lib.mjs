function toISODate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function summarizeWatchRecoveryRegression(watchStatus, options = {}) {
  const expectedTriggers = Array.isArray(options.expectedTriggers) && options.expectedTriggers.length > 0
    ? options.expectedTriggers
    : ["watch-change", "runtime-recovery", "session-restart-recovery"];
  const reloads = Array.isArray(watchStatus?.reloads) ? watchStatus.reloads : [];
  const entries = reloads.map((entry) => ({
    trigger: String(entry?.trigger || ""),
    passed: entry?.passed === true,
    at: toISODate(entry?.at),
    issues: Array.isArray(entry?.issues) ? entry.issues : [],
    summaryNote: entry?.summaryNote || "",
  }));
  const triggerMap = new Map();
  for (const entry of entries) {
    triggerMap.set(entry.trigger, entry);
  }

  const missingTriggers = expectedTriggers.filter((trigger) => !triggerMap.has(trigger));
  const expectedSequence = expectedTriggers.map((trigger) => triggerMap.get(trigger)).filter(Boolean);
  const sessionRestartEntry = triggerMap.get("session-restart-recovery") || null;
  const latest = watchStatus?.latest && typeof watchStatus.latest === "object" ? watchStatus.latest : null;
  const latestTrigger = String(latest?.trigger || "");
  const latestPassed = latest?.passed === true;
  const startupPassed = watchStatus?.startup?.passed === true;
  const passed = startupPassed
    && missingTriggers.length === 0
    && latestTrigger === "session-restart-recovery"
    && latestPassed
    && expectedSequence[0]?.passed === false
    && expectedSequence[1]?.passed === false
    && expectedSequence[2]?.passed === true;

  const issues = [];
  if (!startupPassed) {
    issues.push("watch 启动健康检查未通过，无法证明恢复链路是在健康基线上触发。");
  }
  if (missingTriggers.length > 0) {
    issues.push(`未观测到完整恢复触发序列：${missingTriggers.join("、")}`);
  }
  if (expectedSequence[0] && expectedSequence[0].passed !== false) {
    issues.push("未观测到预期的 watch-change 失败入口。");
  }
  if (expectedSequence[1] && expectedSequence[1].passed !== false) {
    issues.push("未观测到预期的 runtime-recovery 失败。");
  }
  if (expectedSequence[2] && expectedSequence[2].passed !== true) {
    issues.push("session-restart-recovery 未恢复为健康状态。");
  }
  if (latestTrigger && latestTrigger !== "session-restart-recovery") {
    issues.push(`最新触发不是 session-restart-recovery，而是 ${latestTrigger}。`);
  }
  if (latestTrigger === "session-restart-recovery" && !latestPassed) {
    issues.push("最新 session-restart-recovery 结果未通过。");
  }

  return {
    generatedAt: new Date().toISOString(),
    passed,
    expectedTriggers,
    startupPassed,
    latestTrigger: latestTrigger || null,
    latestPassed,
    latestStatus: watchStatus?.latestStatus || null,
    latestAt: toISODate(latest?.at),
    sessionStartedAt: toISODate(watchStatus?.sessionStartedAt),
    observedTriggers: entries.map((entry) => entry.trigger),
    entries,
    issues,
    summaryNote: passed
      ? "已观测到 watch-change 失败 -> runtime-recovery 失败 -> session-restart-recovery 成功 的真机恢复链。"
      : "未完整观测到预期的真机恢复链，请查看问题清单。",
    recoveryEntry: sessionRestartEntry,
  };
}

export function buildWatchRecoveryRegressionMarkdown(report) {
  const lines = [
    "# Zotero Watch 恢复回归报告",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- 回归结果: \`${report.passed ? "通过" : "未通过"}\``,
    `- 会话启动时间: \`${report.sessionStartedAt || "-"}\``,
    `- 最新触发: \`${report.latestTrigger || "-"}\``,
    `- 最新通过: \`${report.latestPassed ? "true" : "false"}\``,
    `- 最新状态: \`${report.latestStatus || "-"}\``,
    "",
  ];

  if (report.errorCategoryLabel || report.failedStage) {
    lines.push("## 脚本失败画像", "");
    lines.push(`- 分类: \`${report.errorCategoryLabel || report.errorCategory || "-"}\``);
    lines.push(`- 阶段: \`${report.failedStage || "-"}\``);
    lines.push(`- 信息: ${report.errorMessage || "-"}`);
    lines.push(`- 耗时: \`${report.durationMs ?? 0}ms\``);
    lines.push("");
  }

  lines.push(
    "## 期望触发序列",
    "",
    `- ${Array.isArray(report.expectedTriggers) ? report.expectedTriggers.join(" -> ") : "-"}`,
    "",
    "## 实际触发序列",
    "",
    `- ${Array.isArray(report.observedTriggers) && report.observedTriggers.length > 0 ? report.observedTriggers.join(" -> ") : "-"}`,
    "",
    "## 触发明细",
    "",
    "| 触发 | 结果 | 时间 | 说明 |",
    "|---|---|---|---|",
  );

  for (const entry of report.entries || []) {
    lines.push(`| ${entry.trigger || "-"} | ${entry.passed ? "通过" : "失败"} | ${entry.at || "-"} | ${entry.summaryNote || "-"} |`);
  }

  lines.push("", "## 问题清单", "");
  if (Array.isArray(report.issues) && report.issues.length > 0) {
    report.issues.forEach((issue) => lines.push(`- ${issue}`));
  }
  else {
    lines.push("- 无");
  }

  lines.push("", "## 结论", "", `- ${report.summaryNote || "-"}`);
  return lines.join("\n");
}
