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

function buildLaunchFailureSummary(launchFailure) {
  if (!launchFailure || typeof launchFailure !== "object") {
    return null;
  }

  switch (launchFailure.kind) {
    case "child-exit-before-rdp":
      return "Zotero 子进程在 RDP 建联前已退出/崩溃。";
    case "rdp-connect-timeout":
      return "Zotero 子进程仍存活，但 RDP 端口未在重试窗口内就绪。";
    case "rdp-connect-error":
      return "Zotero RDP 建联失败，且错误已超出可重试范围。";
    default:
      return null;
  }
}

function formatLogTailEntry(entry) {
  const message = String(entry?.message || "").trim() || "-";
  const source = String(entry?.source || "unknown").trim() || "unknown";
  return `- [${formatDateTime(entry?.at)}] \`${source}\`: ${message}`;
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
  const latestLaunchFailure = latest?.error?.details?.launchFailure || null;
  const latestRuntimeSanitization = latest?.error?.details?.runtimeSanitization || null;

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

  if (latestLaunchFailure) {
    lines.push("", "## 启动诊断", "");
    lines.push(`- 类型: \`${latestLaunchFailure.kind || "-"}\``);
    lines.push(`- 摘要: ${buildLaunchFailureSummary(latestLaunchFailure) || "-"}`);
    lines.push(`- 尝试次数: \`${latestLaunchFailure.attemptCount ?? 0}\``);
    lines.push(`- 建联耗时: \`${latestLaunchFailure.connectDurationMs ?? 0}ms\``);
    const childExit = latestLaunchFailure.childExit;
    lines.push(
      `- 子进程退出: \`${childExit ? `${childExit.code ?? "null"} / ${childExit.signal || "-"}` : "-"}\``,
    );
    const lastConnectError = latestLaunchFailure.lastConnectError;
    lines.push(
      `- 最近建联错误: ${
        lastConnectError
          ? `\`${lastConnectError.code || lastConnectError.name || "error"}\` ${lastConnectError.message || "-"}`
          : "-"
      }`,
    );
    if (latestRuntimeSanitization) {
      lines.push(
        `- Runtime 清理: managed=\`${latestRuntimeSanitization.managed ? "yes" : "no"}\` / fresh=\`${latestRuntimeSanitization.fresh ? "yes" : "no"}\` / profileReset=\`${latestRuntimeSanitization.profileReset ? "yes" : "no"}\` / dataReset=\`${latestRuntimeSanitization.dataReset ? "yes" : "no"}\` / removedMarkers=\`${Array.isArray(latestRuntimeSanitization.removedMarkers) ? latestRuntimeSanitization.removedMarkers.length : 0}\``,
      );
    }
    lines.push("", "### 启动前进程日志尾部", "");
    const processLogTail = Array.isArray(latestLaunchFailure.processLogTail)
      ? latestLaunchFailure.processLogTail
      : [];
    if (processLogTail.length === 0) {
      lines.push("- 无");
    }
    else {
      for (const item of processLogTail) {
        lines.push(formatLogTailEntry(item));
      }
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
