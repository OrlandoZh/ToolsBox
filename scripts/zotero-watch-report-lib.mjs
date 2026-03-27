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

function formatChangedFiles(changedFiles = []) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return "-";
  }

  const preview = changedFiles.slice(0, 3).join(", ");
  if (changedFiles.length <= 3) {
    return preview;
  }
  return `${preview} (+${changedFiles.length - 3} more)`;
}

export function buildWatchStatusMarkdown(report) {
  const latestReload = Array.isArray(report?.reloads) && report.reloads.length > 0
    ? report.reloads[report.reloads.length - 1]
    : null;
  const latest = report?.latest || latestReload || report?.startup || null;
  const entries = [
    ...(report?.startup ? [report.startup] : []),
    ...((report?.reloads || []).slice(-8)),
  ];
  const latestStatus = latest?.passed === false ? "失败" : "健康";

  const lines = [
    "# Zotero Watch 状态",
    "",
    `- 生成时间: \`${report?.generatedAt || "-"}\` (${formatDateTime(report?.generatedAt)})`,
    `- 会话开始: \`${report?.sessionStartedAt || "-"}\` (${formatDateTime(report?.sessionStartedAt)})`,
    `- 当前状态: \`${latestStatus}\``,
    `- 实例键: \`${report?.instanceKey || "-"}\``,
    latest?.readinessMode ? `- 最近就绪模式: \`${latest.readinessMode}\`` : "- 最近就绪模式: `-`",
    "",
    "## 最近事件",
    "",
    "| 序号 | 触发方式 | 状态 | 错误日志 | 警告日志 | 变更文件 | 备注 |",
    "|---:|---|---|---:|---:|---|---|",
  ];

  for (const entry of entries) {
    const note = entry?.error
      ? `执行失败: ${entry.error.message}`
      : entry?.summaryNote || "-";
    lines.push(
      `| ${entry?.index ?? "-"} | ${escapeMarkdown(entry?.trigger || "-")} | ${entry?.passed === false ? "失败" : "通过"} | ${Number(entry?.logs?.errorCount || 0)} | ${Number(entry?.logs?.warnCount || 0)} | ${escapeMarkdown(formatChangedFiles(entry?.changedFiles))} | ${escapeMarkdown(note)} |`,
    );
  }

  lines.push("", "## 当前问题", "");
  if (!latest || !Array.isArray(latest.issues) || latest.issues.length === 0) {
    lines.push("- 无");
  }
  else {
    for (const issue of latest.issues) {
      lines.push(`- ${issue}`);
    }
  }

  lines.push("", "## 修复建议", "");
  if (!latest || !Array.isArray(latest.hints) || latest.hints.length === 0) {
    lines.push("- 无");
  }
  else {
    for (const hint of latest.hints) {
      lines.push(`- ${hint}`);
    }
  }

  lines.push("", "## 最近错误日志", "");
  const recentErrors = Array.isArray(latest?.logs?.recentErrors) ? latest.logs.recentErrors : [];
  if (recentErrors.length === 0) {
    lines.push("- 无");
  }
  else {
    for (const item of recentErrors.slice(0, 10)) {
      lines.push(
        `- [${formatDateTime(item.at)}] \`${item.source || "unknown"}\`: ${item.message || ""}`,
      );
    }
  }

  lines.push("", "## 最近警告日志", "");
  const recentWarnings = Array.isArray(latest?.logs?.recentWarnings) ? latest.logs.recentWarnings : [];
  if (recentWarnings.length === 0) {
    lines.push("- 无");
  }
  else {
    for (const item of recentWarnings.slice(0, 10)) {
      lines.push(
        `- [${formatDateTime(item.at)}] \`${item.source || "unknown"}\`: ${item.message || ""}`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}
