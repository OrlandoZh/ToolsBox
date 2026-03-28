import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  buildVisualExhaustedStageSummary,
  buildPureVisualReaderFailureSummary,
  buildVisualPrimaryBlockerSummary,
} from "./agent-zotero-validation-lib.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function assert(condition, message, options = {}) {
  if (!condition) {
    throw createScriptError(options.category || "validation", message, {
      failedStage: options.failedStage || "read-monitor",
      details: options.details,
    });
  }
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const TASK_DESCRIPTIONS = {
  check: "执行统一质量检查（lint、格式、类型与测试）",
  "telemetry-test": "遥测链路成功样例，用于验证记录与统计",
  "telemetry-fail-test": "遥测链路失败样例，用于验证失败监控",
};

function describeTask(taskName) {
  return TASK_DESCRIPTIONS[String(taskName || "")] || "项目自定义任务";
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

function formatContextSummary(context) {
  const latestBootMode = String(context?.latestBootMode || "").trim() || "unknown";
  const zoteroVersionBucket = String(context?.zoteroVersionBucket || "").trim() || "unknown";
  return `${latestBootMode} / ${zoteroVersionBucket}`;
}

function formatContextSlicesText(entries, limit = 3) {
  const list = (Array.isArray(entries) ? entries : [])
    .filter((item) => item && typeof item === "object")
    .slice(0, limit)
    .map((item) => `${formatContextSummary(item)} x${Number(item?.attempts || item?.count || 0)}`);
  return list.length > 0 ? list.join("；") : "-";
}

function pickContextMatchLevelLabel(level) {
  switch (String(level || "").trim()) {
    case "exact-context":
      return "精确上下文";
    case "strategy-global":
      return "策略全局回退";
    case "fingerprint-global":
      return "指纹全局回退";
    default:
      return "未知";
  }
}

function renderTimeCell(dateLike) {
  const readable = formatDateTime(dateLike);
  const iso = dateLike || "-";
  return `<td><div>${escapeHTML(readable)}</div><div class="subtle">${escapeHTML(iso)}</div></td>`;
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
  const list = (Array.isArray(entries) ? entries : [])
    .slice(0, limit)
    .map((item) => `${item?.label || item?.kind || "未知检查"} x${Number(item?.count || 0)}`);
  return list.length > 0 ? list.join("；") : "-";
}

function createRunRows(runs) {
  const list = Array.isArray(runs) ? runs.slice(0, 30) : [];
  if (list.length === 0) {
    return '<tr><td colspan="7">暂无数据</td></tr>';
  }
  return list.map((run) => {
    const statusText = run?.success ? "成功" : "失败";
    const taskName = run?.runName || "-";
    const taskDesc = describeTask(taskName);
    const commandLine = run?.metadata?.commandLine
      || `${run?.command || ""} ${(run?.args || []).join(" ")}`.trim();
    return `<tr>
  ${renderTimeCell(run.startedAtISO)}
  <td>${escapeHTML(taskName)}</td>
  <td>${escapeHTML(taskDesc)}</td>
  <td>${escapeHTML(statusText)}</td>
  <td>${escapeHTML(run.exitCode ?? "-")}</td>
  <td>${escapeHTML(run.durationMs ?? 0)}</td>
  <td><code>${escapeHTML(commandLine)}</code></td>
</tr>`;
  }).join("\n");
}

function createByRunRows(groups) {
  const list = Array.isArray(groups) ? groups : [];
  if (list.length === 0) {
    return '<tr><td colspan="8">暂无数据</td></tr>';
  }
  return list.map((group) => {
    const taskName = group.runName || "-";
    const taskDesc = describeTask(taskName);
    return `<tr>
  <td>${escapeHTML(taskName)}</td>
  <td>${escapeHTML(taskDesc)}</td>
  <td>${escapeHTML(group.total ?? 0)}</td>
  <td>${escapeHTML(group.passed ?? 0)}</td>
  <td>${escapeHTML(group.failed ?? 0)}</td>
  <td>${escapeHTML(`${group.passRate ?? 0}%`)}</td>
  <td>${escapeHTML(group.averageDurationMs ?? 0)}</td>
  <td>${escapeHTML(group.latestExitCode ?? "-")}</td>
</tr>`;
  }).join("\n");
}

function createFailureRows(reasons) {
  const list = Array.isArray(reasons) ? reasons : [];
  if (list.length === 0) {
    return '<tr><td colspan="2">无失败记录</td></tr>';
  }
  return list.map((reason) => `<tr>
  <td>${escapeHTML(reason.reason || "未知")}</td>
  <td>${escapeHTML(reason.count ?? 0)}</td>
</tr>`).join("\n");
}

function buildFailureHTML(failureInfo) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Agent Dashboard Failed</title>
    <style>
      body {
        margin: 0;
        font-family: "SF Pro Display", "Helvetica Neue", sans-serif;
        background: linear-gradient(160deg, #f7f1e7 0%, #f1e1cf 100%);
        color: #2a1d15;
      }
      main {
        max-width: 720px;
        margin: 48px auto;
        padding: 32px;
        border-radius: 24px;
        background: rgba(255, 252, 248, 0.9);
        box-shadow: 0 24px 64px rgba(75, 42, 22, 0.12);
      }
      h1 {
        margin: 0 0 16px;
        font-size: 32px;
      }
      p {
        line-height: 1.6;
      }
      ul {
        padding-left: 20px;
      }
      code {
        background: rgba(67, 33, 18, 0.08);
        padding: 2px 6px;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Agent Dashboard 生成失败</h1>
      <p>当前监控摘要未能成功渲染为仪表板，请先处理下面的失败画像。</p>
      <ul>
        <li>分类: <code>${escapeHTML(failureInfo.errorCategoryLabel || failureInfo.errorCategory || "-")}</code></li>
        <li>阶段: <code>${escapeHTML(failureInfo.failedStage || "-")}</code></li>
        <li>信息: ${escapeHTML(failureInfo.errorMessage || "-")}</li>
        <li>耗时: <code>${escapeHTML(`${failureInfo.durationMs ?? 0}ms`)}</code></li>
      </ul>
    </main>
  </body>
</html>`;
}

function renderWatchStatus(summary) {
  const watch = summary.watchStatus || {};
  const status = String(watch.status || "missing");
  const label = watch.statusLabel || "缺失";
  const severityClass = status === "healthy"
    ? "status-ok"
    : (status === "stale" || status === "warning" || status === "future" ? "status-warn" : "status-bad");
  const latestIssues = Array.isArray(watch.latestIssues) ? watch.latestIssues : [];
  const detailText = latestIssues.length > 0
    ? latestIssues.slice(0, 3).join("；")
    : (watch.latestSummaryNote || "暂无额外说明");

  return `<section class="panel full">
        <h2>Zotero 热重载状态</h2>
        <div class="watch-grid">
          <div class="watch-item">
            <div class="label">当前状态</div>
            <div class="watch-value"><span class="status-pill ${severityClass}">${escapeHTML(label)}</span></div>
          </div>
          <div class="watch-item">
            <div class="label">状态时间</div>
            <div class="watch-value">${escapeHTML(formatDateTime(watch.generatedAt || "-"))}</div>
            <div class="subtle">${escapeHTML(watch.generatedAt || "-")}</div>
          </div>
          <div class="watch-item">
            <div class="label">状态新鲜度</div>
            <div class="watch-value">${escapeHTML(watch.ageText || "-")}</div>
            <div class="subtle">阈值 ${escapeHTML(`${watch.staleAfterMinutes ?? 30} 分钟`)}</div>
          </div>
          <div class="watch-item">
            <div class="label">最近触发</div>
            <div class="watch-value">${escapeHTML(watch.latestTrigger || "-")}</div>
          </div>
          <div class="watch-item watch-item-wide">
            <div class="label">最近说明</div>
            <div class="watch-value">${escapeHTML(detailText)}</div>
          </div>
        </div>
      </section>`;
}

function renderDiagnosisDetails(e2e) {
  const primaryDiagnosis = e2e.primaryDiagnosis || null;
  const diagnoses = Array.isArray(e2e.diagnoses) ? e2e.diagnoses.slice(0, 3) : [];
  if (!primaryDiagnosis && diagnoses.length === 0) {
    return '<div class="diagnosis-panel"><div class="subtle">暂无结构化诊断</div></div>';
  }

  const primaryActions = Array.isArray(e2e.recommendedActions) && e2e.recommendedActions.length > 0
    ? e2e.recommendedActions.slice(0, 4)
    : primaryDiagnosis && Array.isArray(primaryDiagnosis.recommendedActions)
      ? primaryDiagnosis.recommendedActions.slice(0, 3)
    : [];
  const actionsHTML = primaryActions.length === 0
    ? '<li>暂无建议动作</li>'
    : primaryActions.map((item) => `<li>${escapeHTML(item)}</li>`).join("");
  const diagnosisRows = diagnoses.length === 0
    ? '<tr><td colspan="4">暂无诊断列表</td></tr>'
    : diagnoses.map((item) => `<tr>
        <td><code>${escapeHTML(item.fingerprint || "-")}</code></td>
        <td>${escapeHTML(item.featureLabel || item.feature || "-")}</td>
        <td>${escapeHTML(item.severity || "-")}</td>
        <td>${escapeHTML(`${Math.round(Number(item.confidence || 0) * 100)}%`)}</td>
      </tr>`).join("\n");

  return `<div class="diagnosis-panel">
        <div class="diagnosis-head">结构化诊断</div>
        <div class="diagnosis-primary">
          <div>
            <div class="label">主诊断</div>
            <div class="diagnosis-title">${escapeHTML(primaryDiagnosis?.featureLabel || primaryDiagnosis?.feature || "-")}</div>
            <div class="subtle">${escapeHTML(primaryDiagnosis?.summary || primaryDiagnosis?.issue || "暂无摘要")}</div>
          </div>
          <div class="diagnosis-meta">
            <div><span class="label">指纹</span><span class="metric-value-inline"><code>${escapeHTML(primaryDiagnosis?.fingerprint || "-")}</code></span></div>
            <div><span class="label">严重度</span><span class="metric-value-inline">${escapeHTML(primaryDiagnosis?.severity || "-")}</span></div>
            <div><span class="label">置信度</span><span class="metric-value-inline">${escapeHTML(`${Math.round(Number(primaryDiagnosis?.confidence || 0) * 100)}%`)}</span></div>
            <div><span class="label">阻断级</span><span class="metric-value-inline">${escapeHTML(e2e.diagnosisBlocking ? "是" : "否")}</span></div>
            <div><span class="label">候选文件</span><span class="metric-value-inline">${escapeHTML((Array.isArray(e2e.candidateFiles) ? e2e.candidateFiles : primaryDiagnosis?.candidateFiles || []).slice(0, 3).join("、") || "-")}</span></div>
          </div>
        </div>
        <div class="diagnosis-actions">
          <div class="label">建议动作</div>
          <ul>${actionsHTML}</ul>
        </div>
        <div class="diagnosis-list">
          <div class="label">Top 诊断</div>
          <table class="attempt-table diagnosis-table">
            <thead>
              <tr><th>指纹</th><th>功能</th><th>严重度</th><th>置信度</th></tr>
            </thead>
            <tbody>${diagnosisRows}</tbody>
          </table>
        </div>
      </div>`;
}

function renderCapabilityCoverage(e2e) {
  if (!e2e.capabilityObserved) {
    return '<div class="diagnosis-panel"><div class="subtle">当前报告未采集能力覆盖快照</div></div>';
  }

  const statusPriority = {
    failed: 0,
    uncovered: 1,
    passed: 2,
  };
  const statuses = Array.isArray(e2e.capabilityStatuses)
    ? e2e.capabilityStatuses
      .slice()
      .sort((a, b) => {
        const left = statusPriority[a?.status] ?? 9;
        const right = statusPriority[b?.status] ?? 9;
        if (left !== right) {
          return left - right;
        }
        return String(a?.label || a?.id || "").localeCompare(String(b?.label || b?.id || ""), "zh-CN");
      })
      .slice(0, 10)
    : [];
  const rows = statuses.length === 0
    ? '<tr><td colspan="4">暂无能力状态</td></tr>'
    : statuses.map((item) => {
      const statusLabel = item.status === "passed"
        ? "通过"
        : item.status === "failed"
          ? "失败"
          : "未覆盖";
      return `<tr>
        <td>${escapeHTML(item.label || item.id || "-")}</td>
        <td>${escapeHTML(statusLabel)}</td>
        <td>${escapeHTML((item.scenarioNames || []).join("、") || "-")}</td>
        <td>${escapeHTML((item.ownedBy || []).slice(0, 2).join("、") || "-")}</td>
      </tr>`;
    }).join("\n");

  return `<div class="diagnosis-panel">
        <div class="diagnosis-head">能力覆盖</div>
        <div class="validation-metrics">
          <div><span class="label">需场景覆盖</span><span class="metric-value">${escapeHTML(e2e.capabilityScenarioBoundTotal ?? 0)}</span></div>
          <div><span class="label">已覆盖</span><span class="metric-value">${escapeHTML(e2e.capabilityCoveredCount ?? 0)}</span></div>
          <div><span class="label">通过</span><span class="metric-value">${escapeHTML(e2e.capabilityPassedCount ?? 0)}</span></div>
          <div><span class="label">失败</span><span class="metric-value">${escapeHTML(e2e.capabilityFailedCount ?? 0)}</span></div>
          <div><span class="label">未覆盖</span><span class="metric-value">${escapeHTML(e2e.capabilityUncoveredCount ?? 0)}</span></div>
        </div>
        <table class="attempt-table diagnosis-table">
          <thead>
            <tr><th>能力</th><th>状态</th><th>场景</th><th>责任文件</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
}

function formatBooleanLabel(value, truthyLabel = "可用", falsyLabel = "不可用") {
  if (value === null || value === undefined) {
    return "-";
  }
  return value ? truthyLabel : falsyLabel;
}

function renderReaderEventBridge(e2e) {
  const report = e2e.readerEventReport || {};
  const visualPrimaryBlockerSummary = buildPureVisualReaderFailureSummary(e2e)
    || buildVisualPrimaryBlockerSummary(e2e);
  const firstVisualEvidenceItem = Array.isArray(e2e.visualEvidenceItems)
    ? e2e.visualEvidenceItems[0] || null
    : null;
  const status = String(report.status || "missing");
  const severityClass = status === "passed"
    ? "status-ok"
    : (status === "missing" ? "status-warn" : "status-bad");
  const registeredTypesText = Array.isArray(report.registeredTypes) && report.registeredTypes.length > 0
    ? report.registeredTypes.join("、")
    : "-";
  const probeTypesText = Array.isArray(report.probeObservedTypes) && report.probeObservedTypes.length > 0
    ? report.probeObservedTypes.join("、")
    : "-";
  const hostTypesText = Array.isArray(report.hostObservedTypes) && report.hostObservedTypes.length > 0
    ? report.hostObservedTypes.join("、")
    : "-";
  const missingKnownTypesText = Array.isArray(report.missingKnownTypes) && report.missingKnownTypes.length > 0
    ? report.missingKnownTypes.join("、")
    : "-";
  const missingProbeTypesText = Array.isArray(report.missingProbeCompatibleTypes) && report.missingProbeCompatibleTypes.length > 0
    ? report.missingProbeCompatibleTypes.join("、")
    : "-";
  const unobservedProbeTypesText = Array.isArray(report.unobservedProbeTypes) && report.unobservedProbeTypes.length > 0
    ? report.unobservedProbeTypes.join("、")
    : "-";
  const dispatchModesText = Array.isArray(report.dispatchModes) && report.dispatchModes.length > 0
    ? report.dispatchModes.join("、")
    : "-";
  const scenarioText = Array.isArray(report.observedScenarioNames) && report.observedScenarioNames.length > 0
    ? report.observedScenarioNames.join("、")
    : "-";

  return `<div class="diagnosis-panel">
        <div class="validation-head">
          <div class="label">Reader 事件桥</div>
          <span class="status-pill ${severityClass}">${escapeHTML(report.statusLabel || "缺失")}</span>
        </div>
        <div class="validation-metrics">
          <div><span class="label">事件 API</span><span class="metric-value">${escapeHTML(formatBooleanLabel(report.available))}</span></div>
          <div><span class="label">已注册监听器</span><span class="metric-value">${escapeHTML(report.registeredCount ?? 0)}</span></div>
          <div><span class="label">已知事件类型</span><span class="metric-value">${escapeHTML(report.knownTypeCount ?? "-")}</span></div>
          <div><span class="label">可探针类型</span><span class="metric-value">${escapeHTML(report.probeCompatibleTypeCount ?? "-")}</span></div>
          <div><span class="label">场景探针类型</span><span class="metric-value">${escapeHTML(report.probeObservedTypeCount ?? 0)}</span></div>
          <div><span class="label">宿主观测类型</span><span class="metric-value">${escapeHTML(report.hostObservedTypeCount ?? 0)}</span></div>
          <div><span class="label">synthetic fallback</span><span class="metric-value">${escapeHTML(formatBooleanLabel(report.syntheticFallbackAvailable))}</span></div>
          <div><span class="label">Hook 场景</span><span class="metric-value">${escapeHTML(report.hookScenarioStatusLabel || "缺失")}</span></div>
          <div><span class="label">细粒度 Hook</span><span class="metric-value">${escapeHTML(report.fineGrainedScenarioStatusLabel || "缺失")}</span></div>
          <div><span class="label">Toolbar 宿主点</span><span class="metric-value">${escapeHTML(report.toolbarHookObserved ? "已观测" : "未观测")}</span></div>
        </div>
        <div class="subtle">${escapeHTML(report.note || "当前没有 Reader 事件桥摘要")}</div>
        <div class="subtle">最近观测场景: ${escapeHTML(scenarioText)}</div>
        <div class="subtle">注册类型: ${escapeHTML(registeredTypesText)}</div>
        <div class="subtle">探针类型: ${escapeHTML(probeTypesText)}</div>
        <div class="subtle">宿主观测类型: ${escapeHTML(hostTypesText)}</div>
        <div class="subtle">缺少已知类型: ${escapeHTML(missingKnownTypesText)}</div>
        <div class="subtle">缺少 probe-compatible 类型: ${escapeHTML(missingProbeTypesText)}</div>
        <div class="subtle">未观测 probe 类型: ${escapeHTML(unobservedProbeTypesText)}</div>
        <div class="subtle">分发模式: ${escapeHTML(dispatchModesText)}</div>
        <div class="subtle">Toolbar 证据: ${escapeHTML(e2e.toolbarEvidenceSummary || "-")}</div>
        <div class="subtle">视觉证据: ${escapeHTML(e2e.visualEvidenceSummary || "-")}</div>
        <div class="subtle">证据导航: ${escapeHTML(firstVisualEvidenceItem ? `先看 Cycle ${firstVisualEvidenceItem.cycleIndex ?? "-"} / ${firstVisualEvidenceItem.bootMode || "-"} / ${firstVisualEvidenceItem.kind || "visual"} / ${firstVisualEvidenceItem.canonicalTarget || "-"}` : "-")}</div>
        <div class="subtle">失败证据项: ${escapeHTML(`${e2e.visualEvidenceFailingItemCount ?? 0} / ${e2e.visualEvidenceItemCount ?? 0}`)}</div>
        <div class="subtle">视觉采集稳定性: ${escapeHTML(e2e.visualCaptureStabilitySummary || "-")}</div>
        <div class="subtle">Attempt 诊断: ${escapeHTML(e2e.visualCaptureAttemptDiagnosisSummary || "-")}</div>
        <div class="subtle">用尽预算 stage：${escapeHTML(buildVisualExhaustedStageSummary(e2e) || "-")}</div>
        <div class="subtle">视觉主阻断: ${escapeHTML(visualPrimaryBlockerSummary || "-")}</div>
        <div class="subtle">视觉几何摘要: ${escapeHTML(e2e.visualGeometrySummary || "-")}</div>
        <div class="subtle">Canonical 覆盖摘要: ${escapeHTML(e2e.visualCanonicalCoverageSummary || "-")}</div>
        <div class="subtle">Canonical 未对齐目标: ${escapeHTML((e2e.visualCanonicalMismatchedTargets || []).join("、") || "-")}</div>
        <div class="subtle">深层宿主状态: ${escapeHTML(e2e.readerHostStateObserved ? (e2e.readerHostStateSummary || "-") : "未观测")}</div>
        <div class="subtle">宿主状态备注: ${escapeHTML(e2e.readerHostStateNote || "-")}</div>
        <div class="subtle">分发摘要: ${escapeHTML(e2e.readerDispatchSummary || "-")}</div>
        <div class="subtle">上下文菜单探针: ${escapeHTML(e2e.contextMenuSummary || "-")}</div>
      </div>`;
}

function renderWatchRecovery(summary) {
  const recovery = summary.zoteroValidation?.watchRecovery || {};
  const status = String(recovery.status || "missing");
  const severityClass = status === "passed"
    ? "status-ok"
    : (status === "missing" ? "status-warn" : "status-bad");
  const entries = Array.isArray(recovery.entries) ? recovery.entries : [];
  const expectedText = Array.isArray(recovery.expectedTriggers) && recovery.expectedTriggers.length > 0
    ? recovery.expectedTriggers.join(" -> ")
    : "-";
  const sequenceText = Array.isArray(recovery.observedTriggers) && recovery.observedTriggers.length > 0
    ? recovery.observedTriggers.join(" -> ")
    : "-";
  const issuesText = Array.isArray(recovery.issues) && recovery.issues.length > 0
    ? recovery.issues.slice(0, 3).join("；")
    : "暂无恢复回归问题";
  const entryRows = entries.length === 0
    ? '<tr><td colspan="4">暂无恢复回归记录</td></tr>'
    : entries.map((entry) => `<tr>
        <td>${escapeHTML(entry.trigger || "-")}</td>
        <td>${escapeHTML(entry.passed ? "通过" : "失败")}</td>
        <td>${escapeHTML(formatDateTime(entry.at || "-"))}</td>
        <td>${escapeHTML(entry.summaryNote || "-")}</td>
      </tr>`).join("\n");

  return `<div class="validation-card validation-card-wide">
            <div class="validation-head">
              <div class="label">恢复回归</div>
              <span class="status-pill ${severityClass}">${escapeHTML(recovery.statusLabel || "缺失")}</span>
            </div>
            <div class="validation-metrics validation-metrics-wide">
              <div><span class="label">新鲜度</span><span class="metric-value">${escapeHTML(recovery.ageText || "-")}</span></div>
              <div><span class="label">最新触发</span><span class="metric-value">${escapeHTML(recovery.latestTrigger || "-")}</span></div>
              <div><span class="label">最新状态</span><span class="metric-value">${escapeHTML(recovery.latestStatus || "-")}</span></div>
              <div><span class="label">启动健康</span><span class="metric-value">${escapeHTML(recovery.startupPassed ? "true" : "false")}</span></div>
            </div>
            <div class="subtle">${escapeHTML(recovery.summaryNote || "暂无恢复回归备注")}</div>
            <div class="subtle">期望序列: ${escapeHTML(expectedText)}</div>
            <div class="subtle">实际序列: ${escapeHTML(sequenceText)}</div>
            <div class="subtle">问题摘要: ${escapeHTML(issuesText)}</div>
            <div class="attempt-wrap">
              <table class="attempt-table">
                <thead>
                  <tr><th>触发</th><th>结果</th><th>时间</th><th>说明</th></tr>
                </thead>
                <tbody>${entryRows}</tbody>
              </table>
            </div>
          </div>`;
}

function pickFrontpageSeverityClass(frontpage) {
  const status = String(frontpage?.status || "missing");
  if (status === "stable" || status === "recovered") {
    return "status-ok";
  }
  if (status === "incomplete" || status === "missing") {
    return "status-warn";
  }
  return "status-bad";
}

function renderFrontpageSummary(summary) {
  const frontpage = summary.frontpageSummary || {};
  const severityClass = pickFrontpageSeverityClass(frontpage);
  const signals = Array.isArray(frontpage.primarySignals) ? frontpage.primarySignals.slice(0, 4) : [];
  const signalItems = signals.length === 0
    ? "<li>当前没有高优先级异常信号</li>"
    : signals.map((item) => `<li>${escapeHTML(item)}</li>`).join("");

  return `<section class="panel full frontpage-panel">
        <div class="frontpage-head">
          <div>
            <h2>首页总览</h2>
            <div class="frontpage-headline">${escapeHTML(frontpage.headline || "当前监控已生成，可继续查看详细诊断。")}</div>
          </div>
          <span class="status-pill ${severityClass}">${escapeHTML(frontpage.statusLabel || "缺失")}</span>
        </div>
        <div class="frontpage-grid">
          <div class="frontpage-card">
            <div class="label">下一步建议</div>
            <div class="frontpage-command"><code>${escapeHTML(frontpage.nextAction || "-")}</code></div>
          </div>
          <div class="frontpage-card">
            <div class="label">Watch</div>
            <div class="watch-value">${escapeHTML(frontpage.watch?.statusLabel || "缺失")}</div>
            <div class="subtle">${escapeHTML(frontpage.watch?.ageText || "-")}</div>
          </div>
          <div class="frontpage-card">
            <div class="label">真机验证</div>
            <div class="watch-value">${escapeHTML(frontpage.e2e?.statusLabel || "缺失")}</div>
            <div class="subtle">${escapeHTML(frontpage.e2e?.ageText || "-")}</div>
          </div>
          <div class="frontpage-card">
            <div class="label">自动修复</div>
            <div class="watch-value">${escapeHTML(frontpage.autofix?.statusLabel || "缺失")}</div>
            <div class="subtle">${escapeHTML(frontpage.autofix?.ageText || "-")}</div>
          </div>
          <div class="frontpage-card">
            <div class="label">恢复回归</div>
            <div class="watch-value">${escapeHTML(frontpage.watchRecovery?.statusLabel || "缺失")}</div>
            <div class="subtle">${escapeHTML(frontpage.watchRecovery?.ageText || "-")}</div>
          </div>
          <div class="frontpage-card frontpage-card-wide">
            <div class="label">关键信号</div>
            <ul class="signal-list">${signalItems}</ul>
          </div>
        </div>
      </section>`;
}

function renderZoteroValidation(summary) {
  const e2e = summary.zoteroValidation?.e2e || {};
  const autofix = summary.zoteroValidation?.autofix || {};
  const e2eStatus = String(e2e.status || "missing");
  const autofixStatus = String(autofix.status || "missing");
  const e2eSeverityClass = e2eStatus === "passed"
    ? "status-ok"
    : (e2eStatus === "missing" ? "status-warn" : "status-bad");
  const autofixSeverityClass = autofixStatus === "clean" || autofixStatus === "recovered"
    ? "status-ok"
    : (autofixStatus === "missing" ? "status-warn" : "status-bad");
  const recentAttempts = Array.isArray(autofix.recentAttempts) ? autofix.recentAttempts : [];
  const patchIssues = Array.isArray(autofix.patchApplicationIssues) ? autofix.patchApplicationIssues.slice(0, 3) : [];
  const patchIssuesText = patchIssues.length === 0
    ? "-"
    : patchIssues.map((item) => {
      const fileText = Array.isArray(item.files) && item.files.length > 0
        ? ` / ${item.files.join("、")}`
        : "";
      return `${item.label || item.reason || "未知原因"} x${item.count ?? 0}${fileText}`;
    }).join("；");
  const patchDraftOperationsText = Array.isArray(autofix.patchDraftOperations) && autofix.patchDraftOperations.length > 0
    ? autofix.patchDraftOperations.map((item) => `${item.label || item.operation || "未知操作"} x${item.count ?? 0}`).join("；")
    : "-";
  const verificationKindsText = formatVerificationKindList(mergeVerificationKindEntries(
    autofix.patchVerificationFailedCheckKinds,
    autofix.patchVerificationOptionalFailedCheckKinds,
  ));
  const serviceStatus = String(e2e.serviceStatus || "unknown");
  const serviceSeverityClass = !e2e.serviceObserved
    ? "status-warn"
    : (e2e.serviceHealthOK === false || Number(e2e.serviceUnhealthyCount || 0) > 0
      ? "status-bad"
      : "status-ok");
  const serviceSummaryText = !e2e.serviceObserved
    ? "当前报告未采集服务摘要"
    : `共 ${e2e.serviceTotal ?? 0} 个服务，健康 ${e2e.serviceHealthyCount ?? 0}，异常 ${e2e.serviceUnhealthyCount ?? 0}`;
  const serviceIssues = Array.isArray(e2e.serviceIssues) ? e2e.serviceIssues.slice(0, 3) : [];
  const serviceIssuesText = serviceIssues.length === 0
    ? "暂无服务健康问题"
    : serviceIssues.join("；");
  const attemptRows = recentAttempts.length === 0
    ? '<div class="subtle">暂无恢复步骤记录</div>'
    : `<table class="attempt-table">
            <thead>
              <tr><th>序号</th><th>步骤</th><th>结果</th><th>退出码</th><th>耗时(ms)</th></tr>
            </thead>
            <tbody>
              ${recentAttempts.map((attempt) => `<tr>
                <td>${escapeHTML(attempt.index ?? "-")}</td>
                <td>${escapeHTML(attempt.label || "-")}</td>
                <td>${escapeHTML(attempt.ok ? "成功" : "失败")}</td>
                <td>${escapeHTML(attempt.exitCode ?? "-")}</td>
                <td>${escapeHTML(attempt.durationMs ?? 0)}</td>
              </tr>`).join("\n")}
            </tbody>
          </table>`;

  return `<section class="panel full">
        <h2>Zotero 真机闭环</h2>
        <div class="validation-grid">
          <div class="validation-card">
            <div class="validation-head">
              <div class="label">最近 E2E</div>
              <span class="status-pill ${e2eSeverityClass}">${escapeHTML(e2e.statusLabel || "缺失")}</span>
            </div>
            <div class="validation-metrics">
              <div><span class="label">策略</span><span class="metric-value">${escapeHTML(e2e.strategy || "-")}</span></div>
              <div><span class="label">轮次</span><span class="metric-value">${escapeHTML(e2e.cycles ?? 0)}</span></div>
              <div><span class="label">新鲜度</span><span class="metric-value">${escapeHTML(e2e.ageText || "-")}</span></div>
              <div><span class="label">失败测试</span><span class="metric-value">${escapeHTML(e2e.testFailed ?? 0)}</span></div>
              <div><span class="label">失败场景</span><span class="metric-value">${escapeHTML(e2e.scenarioFailed ?? 0)}</span></div>
              <div><span class="label">视觉漂移</span><span class="metric-value">${escapeHTML(e2e.visualDriftCount ?? 0)}</span></div>
              <div><span class="label">服务状态</span><span class="metric-value"><span class="status-pill ${serviceSeverityClass}">${escapeHTML(serviceStatus)}</span></span></div>
              <div><span class="label">健康服务</span><span class="metric-value">${escapeHTML(`${e2e.serviceHealthyCount ?? 0}/${e2e.serviceTotal ?? 0}`)}</span></div>
            </div>
            <div class="subtle">${escapeHTML(e2e.note || "暂无 E2E 备注")}</div>
            <div class="subtle">失败分类: ${escapeHTML(e2e.errorCategoryLabel || "-")}</div>
            <div class="subtle">失败阶段: ${escapeHTML(e2e.failedStage || "-")}</div>
            <div class="subtle">失败信息: ${escapeHTML(e2e.errorMessage || "-")}</div>
            <div class="subtle">服务摘要: ${escapeHTML(serviceSummaryText)}</div>
            <div class="subtle">服务问题: ${escapeHTML(serviceIssuesText)}</div>
            ${renderDiagnosisDetails(e2e)}
            ${renderReaderEventBridge(e2e)}
            ${renderCapabilityCoverage(e2e)}
          </div>
          <div class="validation-card">
            <div class="validation-head">
              <div class="label">最近自动修复</div>
              <span class="status-pill ${autofixSeverityClass}">${escapeHTML(autofix.statusLabel || "缺失")}</span>
            </div>
            <div class="validation-metrics">
              <div><span class="label">初始策略</span><span class="metric-value">${escapeHTML(autofix.initialStrategy || "-")}</span></div>
              <div><span class="label">尝试次数</span><span class="metric-value">${escapeHTML(autofix.attempts ?? 0)}</span></div>
              <div><span class="label">失败尝试</span><span class="metric-value">${escapeHTML(autofix.failedAttempts ?? 0)}</span></div>
              <div><span class="label">新鲜度</span><span class="metric-value">${escapeHTML(autofix.ageText || "-")}</span></div>
              <div><span class="label">结果</span><span class="metric-value">${escapeHTML(autofix.outcomeLabel || "-")}</span></div>
              <div><span class="label">总耗时</span><span class="metric-value">${escapeHTML(`${autofix.totalDurationMs ?? 0}ms`)}</span></div>
              <div><span class="label">平均耗时</span><span class="metric-value">${escapeHTML(`${autofix.averageDurationMs ?? 0}ms`)}</span></div>
              <div><span class="label">补丁计划</span><span class="metric-value">${escapeHTML(autofix.patchPlanStatusLabel || "缺失")}</span></div>
              <div><span class="label">补丁草案</span><span class="metric-value">${escapeHTML(autofix.patchDraftCount ?? 0)}</span></div>
              <div><span class="label">补丁应用</span><span class="metric-value">${escapeHTML(autofix.patchApplicationStatusLabel || "未尝试")}</span></div>
              <div><span class="label">补丁复验</span><span class="metric-value">${escapeHTML(autofix.patchVerificationStatusLabel || "缺失")}</span></div>
            </div>
            <div class="subtle">${escapeHTML(autofix.note || "暂无自动修复备注")}</div>
            <div class="subtle">失败分类: ${escapeHTML(autofix.errorCategoryLabel || "-")}</div>
            <div class="subtle">失败阶段: ${escapeHTML(autofix.failedStage || "-")}</div>
            <div class="subtle">失败信息: ${escapeHTML(autofix.errorMessage || "-")}</div>
            <div class="subtle">补丁计划功能: ${escapeHTML(autofix.patchPlanFeature || "-")}</div>
            <div class="subtle">补丁动作摘要: ${escapeHTML(patchDraftOperationsText)}</div>
            <div class="subtle">补丁范围: ${escapeHTML((autofix.patchPlanTargets || []).slice(0, 3).join("、") || "-")}</div>
            <div class="subtle">已应用文件: ${escapeHTML((autofix.patchApplicationAppliedFiles || []).slice(0, 3).join("、") || "-")}</div>
            <div class="subtle">复验合同: ${escapeHTML(autofix.patchVerificationSummary || "-")}</div>
            <div class="subtle">合同检查: ${escapeHTML(`${autofix.patchVerificationChecksTotal ?? 0} 项 / 必需失败 ${autofix.patchVerificationChecksFailed ?? 0} 项 / 观察失败 ${autofix.patchVerificationChecksOptionalFailed ?? 0} 项`)}</div>
            <div class="subtle">复验总览: ${escapeHTML(`必需 通过 ${autofix.patchVerificationRequiredPassed ?? 0} / 失败 ${autofix.patchVerificationRequiredFailed ?? 0}；观察 通过 ${autofix.patchVerificationOptionalPassed ?? 0} / 失败 ${autofix.patchVerificationOptionalFailed ?? 0}`)}</div>
            <div class="subtle">必需失败: ${escapeHTML(formatVerificationCheckList(autofix.patchVerificationFailedChecks))}</div>
            <div class="subtle">观察失败: ${escapeHTML(formatVerificationCheckList(autofix.patchVerificationOptionalFailedChecks))}</div>
            <div class="subtle">类型画像: ${escapeHTML(verificationKindsText)}</div>
            <div class="subtle">补丁阻塞原因: ${escapeHTML(patchIssuesText)}</div>
            <div class="subtle">未进入白名单: ${escapeHTML(autofix.patchUnsupportedDiagnosisCategoryLabel || "-")}</div>
            <div class="subtle">阻塞说明: ${escapeHTML(autofix.patchUnsupportedDiagnosisReason || "-")}</div>
            <div class="attempt-wrap">
              ${attemptRows}
            </div>
          </div>
          ${renderWatchRecovery(summary)}
        </div>
      </section>`;
}

function renderEngineeringHardening(summary) {
  const hardening = summary.engineeringHardening || null;
  if (!hardening) {
    return "";
  }

  const boundaryText = Array.isArray(hardening.errorBoundaryEvents) && hardening.errorBoundaryEvents.length > 0
    ? hardening.errorBoundaryEvents.map((item) => `${item.event} x${item.count}`).join("；")
    : "暂无边界事件";
  const validationText = Array.isArray(hardening.validationFailureCategories) && hardening.validationFailureCategories.length > 0
    ? hardening.validationFailureCategories.map((item) => `${item.label} x${item.count}`).join("；")
    : "未记录新的校验失败";
  const statusClass = hardening.errorBoundaryHitCount > 0 || Number(hardening.httpTimeoutCount || 0) > 0
    ? "status-warn"
    : "status-ok";

  return `<section class="panel full">
        <h2>工程化硬化信号</h2>
        <div class="validation-grid">
          <div class="validation-card">
            <div class="validation-head">
              <div class="label">最小摘要</div>
              <span class="status-pill ${statusClass}">${escapeHTML(hardening.errorBoundaryHitCount > 0 || Number(hardening.httpTimeoutCount || 0) > 0 ? "需关注" : "稳定")}</span>
            </div>
            <div class="validation-metrics">
              <div><span class="label">错误边界命中</span><span class="metric-value">${escapeHTML(hardening.errorBoundaryHitCount ?? 0)}</span></div>
              <div><span class="label">校验失败来源</span><span class="metric-value">${escapeHTML(hardening.validationFailureCount ?? 0)}</span></div>
              <div><span class="label">HTTP 请求</span><span class="metric-value">${escapeHTML(hardening.httpRequestCount ?? 0)}</span></div>
              <div><span class="label">HTTP timeout</span><span class="metric-value">${escapeHTML(hardening.httpTimeoutCount ?? 0)}</span></div>
              <div><span class="label">HTTP retry</span><span class="metric-value">${escapeHTML(hardening.httpRetryCount ?? 0)}</span></div>
              <div><span class="label">HTTP 慢操作</span><span class="metric-value">${escapeHTML(hardening.httpSlowOperationCount ?? 0)}</span></div>
              <div><span class="label">生命周期慢操作</span><span class="metric-value">${escapeHTML(hardening.lifecycleSlowOperationCount ?? 0)}</span></div>
              <div><span class="label">Host Ready</span><span class="metric-value">${escapeHTML(`${hardening.hostReadyDurationMs ?? 0}ms`)}</span></div>
              <div><span class="label">Startup</span><span class="metric-value">${escapeHTML(`${hardening.startupDurationMs ?? 0}ms`)}</span></div>
              <div><span class="label">Shutdown</span><span class="metric-value">${escapeHTML(`${hardening.shutdownDurationMs ?? 0}ms`)}</span></div>
            </div>
            <div class="subtle">${escapeHTML(hardening.summary || "暂无工程化硬化摘要")}</div>
            <div class="subtle">边界事件: ${escapeHTML(boundaryText)}</div>
            <div class="subtle">校验失败分类: ${escapeHTML(validationText)}</div>
            <div class="subtle">慢操作阈值: ${escapeHTML(`${hardening.httpSlowThresholdMs ?? 0}ms`)}</div>
            <div class="subtle">生命周期慢阈值: ${escapeHTML(`${hardening.lifecycleSlowThresholdMs ?? 0}ms`)}</div>
            <div class="subtle">最近生命周期慢阶段: ${escapeHTML(hardening.lifecycleLastSlowStage || "-")}</div>
            <div class="subtle">最近 HTTP 错误: ${escapeHTML(`${hardening.httpLastErrorKind || "-"} / ${hardening.httpLastErrorMessage || "-"}`)}</div>
          </div>
        </div>
      </section>`;
}

function renderAgentMemory(summary) {
  const memory = summary.agentMemory || {};
  const current = memory.currentIncident || null;
  const recommendation = memory.recommendation || null;
  const hotFingerprints = Array.isArray(memory.failureMemory?.hotFingerprints)
    ? memory.failureMemory.hotFingerprints.slice(0, 5)
    : [];
  const fixOutcomeMemory = Array.isArray(memory.fixOutcomeMemory)
    ? memory.fixOutcomeMemory.slice(0, 5)
    : [];
  const trendDays = Array.isArray(memory.trend?.days)
    ? memory.trend.days.slice(0, 7)
    : [];
  const recentHistory = Array.isArray(memory.recentHistory)
    ? memory.recentHistory.slice(0, 8)
    : [];
  const signalTrends = Array.isArray(memory.signalTrends?.signals)
    ? memory.signalTrends.signals.slice(0, 7)
    : [];
  const reasonTrends = Array.isArray(memory.reasonTrends?.topReasons)
    ? memory.reasonTrends.topReasons.slice(0, 5)
    : [];
  const fingerprintArchives = Array.isArray(memory.fingerprints) && memory.fingerprints.length > 0
    ? memory.fingerprints.slice(0, 5)
    : hotFingerprints;
  const incidentBlock = current
    ? `<div class="diagnosis-panel">
        <div class="diagnosis-head">当前故障记忆</div>
        <div class="diagnosis-primary">
          <div>
            <div class="label">当前指纹</div>
            <div class="diagnosis-title"><code>${escapeHTML(current.fingerprint || "-")}</code></div>
            <div class="subtle">${escapeHTML(current.featureLabel || "-")}</div>
          </div>
          <div class="diagnosis-meta">
            <div><span class="label">是否见过</span><span class="metric-value-inline">${escapeHTML(current.seenBefore ? "是" : "否")}</span></div>
            <div><span class="label">历史次数</span><span class="metric-value-inline">${escapeHTML(current.historyCount ?? 0)}</span></div>
            <div><span class="label">成功/失败</span><span class="metric-value-inline">${escapeHTML(`${current.successCount ?? 0}/${current.failureCount ?? 0}`)}</span></div>
            <div><span class="label">最近一次</span><span class="metric-value-inline">${escapeHTML(formatDateTime(current.lastSeenAt || "-"))}</span></div>
            <div><span class="label">历史最优路径</span><span class="metric-value-inline">${escapeHTML(current.preferredStrategy?.strategyLabel || "-")}</span></div>
            <div><span class="label">当前上下文</span><span class="metric-value-inline">${escapeHTML(formatContextSummary(current.context))}</span></div>
          </div>
        </div>
        <div class="subtle">候选文件: ${escapeHTML((current.candidateFiles || []).join("、") || "-")}</div>
        <div class="subtle">上下文命中级别: ${escapeHTML(pickContextMatchLevelLabel(current.preferredStrategy?.contextMatchLevel))}</div>
        <div class="subtle">上下文成功率: ${escapeHTML(`${current.preferredStrategy?.contextSuccessRate ?? 0}%`)} / 全局成功率: ${escapeHTML(`${current.preferredStrategy?.globalSuccessRate ?? current.preferredStrategy?.successRate ?? 0}%`)}</div>
        <div class="subtle">历史上下文切片: ${escapeHTML(formatContextSlicesText(current.contexts))}</div>
        <div class="subtle">复验通过率: ${escapeHTML(`${current.verificationPassedRate ?? 0}%`)}</div>
        <div class="subtle">常见必需失败: ${escapeHTML(formatVerificationCheckList(current.requiredFailedChecks))}</div>
        <div class="subtle">常见观察失败: ${escapeHTML(formatVerificationCheckList(current.optionalFailedChecks))}</div>
        <div class="subtle">失败类型画像: ${escapeHTML(formatVerificationKindList(mergeVerificationKindEntries(current.failedCheckKinds, current.optionalFailedCheckKinds)))}</div>
        <div class="subtle">常见阻塞: ${escapeHTML((current.recentReasons || []).map((item) => `${item.label} x${item.count}`).join("；") || "-")}</div>
        <div class="subtle">常见动作: ${escapeHTML((current.draftOperations || []).map((item) => `${item.label} x${item.count}`).join("；") || "-")}</div>
      </div>`
    : '<div class="diagnosis-panel"><div class="subtle">当前没有需要关联历史记忆的未恢复故障。</div></div>';
  const recommendationBlock = recommendation
    ? `<div class="diagnosis-panel">
        <div class="diagnosis-head">历史推荐</div>
        <div class="subtle">${escapeHTML(recommendation.title || "-")}</div>
        <div class="diagnosis-title"><code>${escapeHTML(recommendation.nextAction || "-")}</code></div>
        <div class="subtle">${escapeHTML(recommendation.summary || "-")}</div>
        <div class="subtle">推荐置信度: ${escapeHTML(recommendation.confidence || "-")}</div>
        <div class="subtle">上下文命中: ${escapeHTML(pickContextMatchLevelLabel(current?.preferredStrategy?.contextMatchLevel))}</div>
        <div class="subtle">支撑信号: ${escapeHTML((recommendation.supportingSignals || []).join("、") || "-")}</div>
        <div class="subtle">支撑指标: ${escapeHTML((recommendation.supportingMetrics || []).map((item) => `${item.signalLabel}/${item.metricLabel}=${item.value}`).join("；") || "-")}</div>
        <div class="subtle">候选文件: ${escapeHTML((recommendation.candidateFiles || []).join("、") || "-")}</div>
      </div>`
    : "";
  const trendRows = trendDays.length === 0
    ? '<tr><td colspan="6">暂无趋势样本</td></tr>'
    : trendDays.map((item) => `<tr>
        <td>${escapeHTML(item.day || "-")}</td>
        <td>${escapeHTML(item.total ?? 0)}</td>
        <td>${escapeHTML(item.successCount ?? 0)}</td>
        <td>${escapeHTML(item.failureCount ?? 0)}</td>
        <td>${escapeHTML(`${item.successRate ?? 0}%`)}</td>
        <td>${escapeHTML(item.uniqueFingerprintCount ?? 0)}</td>
      </tr>`).join("\n");
  const recentRows = recentHistory.length === 0
    ? '<tr><td colspan="6">暂无最近样本</td></tr>'
    : recentHistory.map((item) => `<tr>
        <td>${escapeHTML(formatDateTime(item.generatedAt || "-"))}</td>
        <td><code>${escapeHTML(item.fingerprint || "-")}</code></td>
        <td>${escapeHTML(item.featureLabel || "-")}</td>
        <td>${escapeHTML(item.outcomeLabel || (item.success ? "已恢复" : "未恢复"))}</td>
        <td>${escapeHTML(item.strategyLabel || "-")}</td>
        <td>${escapeHTML((item.candidateFiles || []).join("、") || "-")}</td>
      </tr>`).join("\n");
  const signalRows = signalTrends.length === 0
    ? '<tr><td colspan="7">暂无运行信号趋势</td></tr>'
    : signalTrends.map((item) => `<tr>
        <td>${escapeHTML(item.label || item.signalId || "-")}</td>
        <td>${escapeHTML(item.latestStatusLabel || "缺失")}</td>
        <td>${escapeHTML(item.totalEntries ?? 0)}</td>
        <td>${escapeHTML(`${item.okRate ?? 0}%`)}</td>
        <td>${escapeHTML(item.trend?.directionLabel || "基线")}</td>
        <td>${escapeHTML((item.metricHighlights || []).map((metric) => `${metric.label} ${metric.latestValue}`).join("；") || "-")}</td>
        <td>${escapeHTML(formatDateTime(item.latestObservedAt || "-"))}</td>
      </tr>`).join("\n");
  const reasonRows = reasonTrends.length === 0
    ? '<tr><td colspan="6">暂无阻塞原因趋势</td></tr>'
    : reasonTrends.map((item) => `<tr>
        <td>${escapeHTML(item.label || item.reason || "-")}</td>
        <td><code>${escapeHTML(item.reason || "-")}</code></td>
        <td>${escapeHTML(item.trend?.directionLabel || "基线")}</td>
        <td>${escapeHTML(item.count ?? 0)}</td>
        <td>${escapeHTML(`${item.successRate ?? 0}%`)}</td>
        <td>${escapeHTML(item.uniqueFingerprintCount ?? 0)}</td>
      </tr>`).join("\n");
  const hotRows = hotFingerprints.length === 0
    ? '<tr><td colspan="7">暂无历史故障记忆</td></tr>'
    : hotFingerprints.map((item) => `<tr>
        <td><code>${escapeHTML(item.fingerprint || "-")}</code></td>
        <td>${escapeHTML(item.featureLabel || "-")}</td>
        <td>${escapeHTML(item.count ?? 0)}</td>
        <td>${escapeHTML(`${item.successRate ?? 0}%`)}</td>
        <td>${escapeHTML(formatContextSlicesText(item.contexts))}</td>
        <td>${escapeHTML(formatDateTime(item.lastSeenAt || "-"))}</td>
        <td>${escapeHTML(item.preferredStrategy?.strategyLabel || "-")}</td>
      </tr>`).join("\n");
  const fixRows = fixOutcomeMemory.length === 0
    ? '<tr><td colspan="7">暂无历史修复结果记忆</td></tr>'
    : fixOutcomeMemory.map((item) => `<tr>
        <td><code>${escapeHTML(item.fingerprint || "-")}</code></td>
        <td>${escapeHTML(item.preferredStrategy?.strategyLabel || "-")}</td>
        <td>${escapeHTML(formatContextSummary(item.preferredStrategy))}</td>
        <td>${escapeHTML(`${item.preferredStrategy?.successRate ?? 0}%`)}</td>
        <td>${escapeHTML(`${item.preferredStrategy?.verificationPassedRate ?? 0}%`)}</td>
        <td>${escapeHTML(formatDateTime(item.preferredStrategy?.lastSuccessfulAt || "-"))}</td>
        <td>${escapeHTML((item.candidateFiles || []).join("、") || "-")}</td>
      </tr>`).join("\n");
  const fingerprintRows = fingerprintArchives.length === 0
    ? '<tr><td colspan="5">暂无重点指纹时间序列</td></tr>'
    : fingerprintArchives.map((item) => {
      const latest = Array.isArray(item.recentHistory) ? item.recentHistory[0] : null;
      return `<tr>
        <td><code>${escapeHTML(item.fingerprint || "-")}</code></td>
        <td>${escapeHTML(item.trend?.directionLabel || "基线")}</td>
        <td>${escapeHTML(item.latestOutcomeLabel || latest?.outcomeLabel || "-")}</td>
        <td>${escapeHTML(item.latestStrategyLabel || latest?.strategyLabel || item.preferredStrategy?.strategyLabel || "-")}</td>
        <td>${escapeHTML(formatDateTime(latest?.generatedAt || item.lastSeenAt || "-"))}</td>
      </tr>`;
    }).join("\n");

  return `<section class="panel full">
        <h2>Agent 记忆层</h2>
        <div class="validation-grid">
          <div class="validation-card">
            <div class="validation-head">
              <div class="label">故障记忆</div>
              <span class="status-pill ${memory.present ? "status-ok" : "status-warn"}">${escapeHTML(memory.present ? "已启用" : "缺失")}</span>
            </div>
            <div class="validation-metrics">
              <div><span class="label">历史样本</span><span class="metric-value">${escapeHTML(memory.totalEntries ?? 0)}</span></div>
              <div><span class="label">成功样本</span><span class="metric-value">${escapeHTML(memory.successCount ?? 0)}</span></div>
              <div><span class="label">失败样本</span><span class="metric-value">${escapeHTML(memory.failureCount ?? 0)}</span></div>
              <div><span class="label">已记忆指纹</span><span class="metric-value">${escapeHTML(memory.uniqueFingerprintCount ?? 0)}</span></div>
            </div>
            <div class="subtle">趋势判断: ${escapeHTML(memory.trend?.directionLabel || "基线")} / ${escapeHTML(memory.trend?.summary || "暂无趋势说明")}</div>
            <div class="subtle">归档索引: ${escapeHTML(memory.archive?.historyIndexJSON || "-")}</div>
            <div class="subtle">信号索引: ${escapeHTML(memory.signalTrends?.archive?.signalIndexJSON || "-")}</div>
            <div class="attempt-wrap">
              <table class="attempt-table diagnosis-table">
                <thead>
                  <tr><th>指纹</th><th>功能域</th><th>历史次数</th><th>成功率</th><th>上下文切片</th><th>最近一次</th><th>历史最优路径</th></tr>
                </thead>
                <tbody>${hotRows}</tbody>
              </table>
            </div>
          </div>
          <div class="validation-card">
            <div class="validation-head">
              <div class="label">修复结果记忆</div>
              <span class="status-pill ${fixOutcomeMemory.length > 0 ? "status-ok" : "status-warn"}">${escapeHTML(fixOutcomeMemory.length > 0 ? "可用" : "暂无")}</span>
            </div>
            <div class="attempt-wrap">
              <table class="attempt-table diagnosis-table">
                <thead>
                  <tr><th>指纹</th><th>历史最优路径</th><th>上下文摘要</th><th>成功率</th><th>复验通过率</th><th>最近成功</th><th>候选文件</th></tr>
                </thead>
                <tbody>${fixRows}</tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="validation-grid">
          <div class="validation-card">
            <div class="validation-head">
              <div class="label">近期趋势</div>
              <span class="status-pill ${memory.trend?.direction === "regressing" ? "status-bad" : (memory.trend?.direction === "improving" ? "status-ok" : "status-warn")}">${escapeHTML(memory.trend?.directionLabel || "基线")}</span>
            </div>
            <div class="subtle">最近窗口 ${escapeHTML(memory.trend?.recentWindow?.total ?? 0)} 条 / 成功率 ${escapeHTML(`${memory.trend?.recentWindow?.successRate ?? 0}%`)}</div>
            <div class="subtle">前序窗口 ${escapeHTML(memory.trend?.previousWindow?.total ?? 0)} 条 / 成功率 ${escapeHTML(`${memory.trend?.previousWindow?.successRate ?? 0}%`)}</div>
            <div class="attempt-wrap">
              <table class="attempt-table diagnosis-table">
                <thead>
                  <tr><th>日期</th><th>样本</th><th>成功</th><th>失败</th><th>成功率</th><th>指纹数</th></tr>
                </thead>
                <tbody>${trendRows}</tbody>
              </table>
            </div>
          </div>
          <div class="validation-card">
            <div class="validation-head">
              <div class="label">最近样本</div>
              <span class="status-pill ${recentHistory.length > 0 ? "status-ok" : "status-warn"}">${escapeHTML(recentHistory.length > 0 ? "已归档" : "暂无")}</span>
            </div>
            <div class="subtle">最新快照: ${escapeHTML(memory.archive?.snapshotJSON || memory.archive?.latestJSON || "-")}</div>
            <div class="attempt-wrap">
              <table class="attempt-table diagnosis-table">
                <thead>
                  <tr><th>时间</th><th>指纹</th><th>功能域</th><th>结果</th><th>路径</th><th>候选文件</th></tr>
                </thead>
                <tbody>${recentRows}</tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="validation-grid">
          <div class="validation-card">
            <div class="validation-head">
              <div class="label">运行信号趋势</div>
              <span class="status-pill ${signalTrends.some((item) => item.trend?.direction === "regressing") ? "status-bad" : (signalTrends.length > 0 ? "status-ok" : "status-warn")}">${escapeHTML(signalTrends.length > 0 ? "已跟踪" : "缺失")}</span>
            </div>
            <div class="subtle">信号归档: ${escapeHTML(memory.signalTrends?.archive?.signalIndexJSON || "-")}</div>
            <div class="attempt-wrap">
              <table class="attempt-table diagnosis-table">
                <thead>
                  <tr><th>信号</th><th>最近状态</th><th>历史样本</th><th>健康率</th><th>趋势</th><th>关键指标</th><th>最近时间</th></tr>
                </thead>
                <tbody>${signalRows}</tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="validation-grid">
          <div class="validation-card">
            <div class="validation-head">
              <div class="label">阻塞原因趋势</div>
              <span class="status-pill ${reasonTrends.length > 0 ? "status-ok" : "status-warn"}">${escapeHTML(reasonTrends.length > 0 ? "已归档" : "暂无")}</span>
            </div>
            <div class="subtle">原因索引: ${escapeHTML(memory.reasonTrends?.archive?.reasonIndexJSON || "-")}</div>
            <div class="attempt-wrap">
              <table class="attempt-table diagnosis-table">
                <thead>
                  <tr><th>原因</th><th>代码</th><th>趋势</th><th>历史次数</th><th>成功率</th><th>关联指纹</th></tr>
                </thead>
                <tbody>${reasonRows}</tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="validation-grid">
          <div class="validation-card">
            <div class="validation-head">
              <div class="label">重点指纹时间序列</div>
              <span class="status-pill ${fingerprintArchives.length > 0 ? "status-ok" : "status-warn"}">${escapeHTML(fingerprintArchives.length > 0 ? "已归档" : "暂无")}</span>
            </div>
            <div class="subtle">指纹索引: ${escapeHTML(memory.archive?.fingerprintIndexJSON || "-")}</div>
            <div class="attempt-wrap">
              <table class="attempt-table diagnosis-table">
                <thead>
                  <tr><th>指纹</th><th>趋势</th><th>最近结果</th><th>最近路径</th><th>最近时间</th></tr>
                </thead>
                <tbody>${fingerprintRows}</tbody>
              </table>
            </div>
          </div>
        </div>
        ${recommendationBlock}
        ${incidentBlock}
      </section>`;
}

function renderReleaseMatrix(summary) {
  const matrix = summary.releaseMatrix || null;
  if (!matrix || typeof matrix !== "object") {
    return `<section class="panel full">
        <h2>本地发布矩阵</h2>
        <div class="subtle">当前还没有发布矩阵工件，可先执行 \`npm run release:plan\` 或 \`npm run release:matrix\`。</div>
      </section>`;
  }

  const statusClass = matrix.status === "passed"
    ? "status-ok"
    : (matrix.status === "attention" ? "status-warn" : "status-bad");
  const blockingText = Array.isArray(matrix.blockingIssues) && matrix.blockingIssues.length > 0
    ? matrix.blockingIssues.slice(0, 3).join("；")
    : "-";
  const attentionText = Array.isArray(matrix.attentionIssues) && matrix.attentionIssues.length > 0
    ? matrix.attentionIssues.slice(0, 3).join("；")
    : "-";
  const hostNoiseText = Array.isArray(matrix.hostNoiseIssues) && matrix.hostNoiseIssues.length > 0
    ? matrix.hostNoiseIssues.slice(0, 3).join("；")
    : "-";
  const profileRows = Array.isArray(matrix.profiles) && matrix.profiles.length > 0
    ? matrix.profiles.map((profile) => `<tr>
        <td>${escapeHTML(profile.label || profile.id || "-")}</td>
        <td><span class="status-pill ${profile.status === "passed" ? "status-ok" : (profile.status === "attention" ? "status-warn" : "status-bad")}">${escapeHTML(profile.statusLabel || "-")}</span></td>
        <td>${escapeHTML(profile.metadataConsistent ? "通过" : "失败")}</td>
        <td>${escapeHTML(profile.packageConsistent ? "通过" : "失败")}</td>
        <td>${escapeHTML(profile.installSmokePresent ? (profile.installSmokePassed ? "通过" : "失败") : "未验证")}</td>
        <td>${escapeHTML(profile.installSmoke?.durationMs ?? 0)}</td>
        <td>${escapeHTML(profile.installSmoke?.readinessMode || "-")}</td>
        <td>${escapeHTML(profile.blockingRuntimeErrorPortrait || "-")}</td>
        <td>${escapeHTML(profile.hostNoiseRuntimeErrorPortrait || "-")}</td>
        <td>${escapeHTML(profile.summary || "-")}</td>
      </tr>`).join("\n")
    : '<tr><td colspan="10">暂无矩阵条目</td></tr>';

  return `<section class="panel full">
        <h2>本地发布矩阵</h2>
        <div class="validation-grid">
          <div class="validation-card">
            <div class="validation-head">
              <div class="label">矩阵总览</div>
              <span class="status-pill ${statusClass}">${escapeHTML(matrix.statusLabel || "缺失")}</span>
            </div>
            <div class="validation-metrics">
              <div><span class="label">通过渠道</span><span class="metric-value">${escapeHTML(matrix.passedProfileCount ?? 0)}</span></div>
              <div><span class="label">失败渠道</span><span class="metric-value">${escapeHTML(matrix.failedProfileCount ?? 0)}</span></div>
              <div><span class="label">待补验证</span><span class="metric-value">${escapeHTML(matrix.attentionProfileCount ?? 0)}</span></div>
              <div><span class="label">阻断错误</span><span class="metric-value">${escapeHTML(matrix.blockingRuntimeErrorCount ?? 0)}</span></div>
              <div><span class="label">宿主噪声</span><span class="metric-value">${escapeHTML(matrix.hostNoiseErrorCount ?? 0)}</span></div>
              <div><span class="label">生成耗时</span><span class="metric-value">${escapeHTML(`${matrix.durationMs ?? 0} ms`)}</span></div>
              <div><span class="label">XPI</span><span class="metric-value">${escapeHTML(matrix.artifacts?.xpiName || "-")}</span></div>
              <div><span class="label">SHA256</span><span class="metric-value">${escapeHTML(matrix.artifacts?.xpiSHA256Actual || "-")}</span></div>
              <div><span class="label">大小</span><span class="metric-value">${escapeHTML(`${matrix.artifacts?.xpiSizeBytesActual ?? 0} bytes`)}</span></div>
            </div>
            <div class="subtle">${escapeHTML(matrix.summary || "暂无摘要")}</div>
            <div class="subtle">阻断项: ${escapeHTML(blockingText)}</div>
            <div class="subtle">待补验证: ${escapeHTML(attentionText)}</div>
            <div class="subtle">阻断错误画像: ${escapeHTML(matrix.blockingRuntimeErrorPortrait || "-")}</div>
            <div class="subtle">宿主噪声画像: ${escapeHTML(matrix.hostNoiseRuntimeErrorPortrait || "-")}</div>
            <div class="subtle">宿主噪声渠道: ${escapeHTML(hostNoiseText)}</div>
          </div>
          <div class="validation-card">
            <div class="validation-head">
              <div class="label">渠道矩阵</div>
              <span class="status-pill ${statusClass}">${escapeHTML(`${matrix.profileCount ?? 0} 条`)}</span>
            </div>
            <div class="attempt-wrap">
              <table class="attempt-table">
                <thead>
                  <tr><th>渠道</th><th>状态</th><th>元数据</th><th>XPI</th><th>smoke</th><th>耗时(ms)</th><th>readiness</th><th>阻断错误</th><th>宿主噪声</th><th>摘要</th></tr>
                </thead>
                <tbody>${profileRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </section>`;
}

function buildDashboardHTML(summary) {
  const passRate = Number(summary.passRate || 0);
  const passWidth = Math.max(0, Math.min(100, passRate));
  const failWidth = 100 - passWidth;
  const runRows = createRunRows(summary.runs);
  const groupRows = createByRunRows(summary.byRunName);
  const failureRows = createFailureRows(summary.failureReasons);
  const watchCardValue = escapeHTML(summary.watchStatus?.statusLabel || "缺失");
  const watchCardSubtle = escapeHTML(summary.watchStatus?.ageText || "-");
  const watchSection = renderWatchStatus(summary);
  const validationCardValue = escapeHTML(summary.zoteroValidation?.e2e?.statusLabel || "缺失");
  const validationCardSubtle = escapeHTML(summary.zoteroValidation?.e2e?.ageText || "-");
  const recoveryCardValue = escapeHTML(summary.zoteroValidation?.watchRecovery?.statusLabel || "缺失");
  const recoveryCardSubtle = escapeHTML(summary.zoteroValidation?.watchRecovery?.ageText || "-");
  const frontpageSection = renderFrontpageSummary(summary);
  const validationSection = renderZoteroValidation(summary);
  const hardeningSection = renderEngineeringHardening(summary);
  const memorySection = renderAgentMemory(summary);
  const releaseMatrixSection = renderReleaseMatrix(summary);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent 执行仪表板</title>
    <style>
      :root {
        --bg: #f4f5f7;
        --surface: #ffffff;
        --ink: #1f2937;
        --muted: #6b7280;
        --ok: #157f3b;
        --bad: #c0392b;
        --line: #e5e7eb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", Palatino, serif;
        color: var(--ink);
        background: radial-gradient(circle at top, #ffffff 0%, var(--bg) 60%);
      }
      .wrap {
        max-width: 1200px;
        margin: 24px auto 48px;
        padding: 0 16px;
      }
      .hero {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 18px 20px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
      }
      h1 {
        margin: 0 0 6px;
        font-size: 28px;
      }
      .muted {
        color: var(--muted);
        margin: 0;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .card {
        background: #fafafa;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px 12px;
      }
      .label {
        font-size: 12px;
        color: var(--muted);
      }
      .value {
        font-size: 22px;
        line-height: 1.2;
        margin-top: 3px;
      }
      .bar {
        margin-top: 12px;
        height: 14px;
        background: #eceff3;
        border-radius: 999px;
        overflow: hidden;
        display: flex;
      }
      .bar-ok { width: ${passWidth}%; background: var(--ok); }
      .bar-bad { width: ${failWidth}%; background: var(--bad); }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 12px;
      }
      .panel {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px;
      }
      h2 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      th, td {
        border-bottom: 1px solid var(--line);
        padding: 7px 6px;
        text-align: left;
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-weight: 600;
      }
      .subtle {
        color: var(--muted);
        font-size: 12px;
      }
      code {
        font-family: "SFMono-Regular", Menlo, Consolas, monospace;
      }
      .full {
        margin-top: 12px;
      }
      .status-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 14px;
        font-weight: 600;
      }
      .status-ok {
        background: #e8f6ec;
        color: var(--ok);
      }
      .status-warn {
        background: #fff4dd;
        color: #9a6700;
      }
      .status-bad {
        background: #fdecec;
        color: var(--bad);
      }
      .watch-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      .frontpage-panel {
        background: linear-gradient(135deg, #fffdf6 0%, #ffffff 55%, #f8fbff 100%);
      }
      .frontpage-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        margin-bottom: 10px;
      }
      .frontpage-headline {
        font-size: 16px;
        line-height: 1.5;
      }
      .frontpage-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 12px;
      }
      .frontpage-card {
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px 12px;
      }
      .frontpage-card-wide {
        grid-column: span 2;
      }
      .frontpage-command {
        margin-top: 6px;
        font-size: 14px;
        line-height: 1.5;
      }
      .signal-list {
        margin: 8px 0 0;
        padding-left: 18px;
      }
      .signal-list li {
        margin: 4px 0;
      }
      .watch-item {
        background: #fafafa;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px 12px;
      }
      .watch-item-wide {
        grid-column: span 2;
      }
      .watch-value {
        font-size: 18px;
        line-height: 1.4;
        margin-top: 4px;
      }
      .validation-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .validation-card {
        background: #fafafa;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 12px;
      }
      .validation-card-wide {
        grid-column: span 2;
      }
      .diagnosis-panel {
        margin-top: 10px;
        background: #f8fafc;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px;
      }
      .diagnosis-head {
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .diagnosis-primary {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: 10px;
      }
      .diagnosis-title {
        font-size: 16px;
        margin-top: 2px;
      }
      .diagnosis-meta {
        display: grid;
        gap: 6px;
      }
      .metric-value-inline {
        margin-left: 8px;
      }
      .diagnosis-actions {
        margin-top: 10px;
      }
      .diagnosis-actions ul {
        margin: 6px 0 0;
        padding-left: 18px;
      }
      .diagnosis-actions li {
        margin: 4px 0;
      }
      .diagnosis-list {
        margin-top: 10px;
      }
      .validation-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
        margin-bottom: 10px;
      }
      .validation-metrics {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 12px;
        margin-bottom: 10px;
      }
      .validation-metrics-wide {
        grid-template-columns: repeat(4, 1fr);
      }
      .attempt-wrap {
        margin-top: 10px;
      }
      .attempt-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .attempt-table th,
      .attempt-table td {
        border-bottom: 1px solid var(--line);
        padding: 6px 4px;
        text-align: left;
      }
      .attempt-table th {
        color: var(--muted);
        font-weight: 600;
      }
      .metric-value {
        display: block;
        font-size: 16px;
        margin-top: 2px;
      }
      @media (max-width: 900px) {
        .cards {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .grid {
          grid-template-columns: 1fr;
        }
        .watch-grid {
          grid-template-columns: 1fr;
        }
        .frontpage-grid {
          grid-template-columns: 1fr;
        }
        .frontpage-card-wide {
          grid-column: span 1;
        }
        .watch-item-wide {
          grid-column: span 1;
        }
        .validation-grid {
          grid-template-columns: 1fr;
        }
        .validation-card-wide {
          grid-column: span 1;
        }
        .validation-metrics {
          grid-template-columns: 1fr;
        }
        .validation-metrics-wide {
          grid-template-columns: 1fr 1fr;
        }
        .diagnosis-primary {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="hero">
        <h1>Agent 执行仪表板</h1>
        <p class="muted">生成时间：${escapeHTML(formatDateTime(summary.generatedAt || "-"))} <span class="subtle">(${escapeHTML(summary.generatedAt || "-")})</span></p>
        <div class="cards">
          <div class="card"><div class="label">总执行次数</div><div class="value">${escapeHTML(summary.total ?? 0)}</div></div>
          <div class="card"><div class="label">成功</div><div class="value">${escapeHTML(summary.passed ?? 0)}</div></div>
          <div class="card"><div class="label">失败</div><div class="value">${escapeHTML(summary.failed ?? 0)}</div></div>
          <div class="card"><div class="label">成功率</div><div class="value">${escapeHTML(`${summary.passRate ?? 0}%`)}</div></div>
          <div class="card"><div class="label">平均耗时</div><div class="value">${escapeHTML(`${summary.averageDurationMs ?? 0}ms`)}</div></div>
          <div class="card"><div class="label">Zotero 热重载</div><div class="value">${watchCardValue}</div><div class="subtle">${watchCardSubtle}</div></div>
          <div class="card"><div class="label">最近真机验证</div><div class="value">${validationCardValue}</div><div class="subtle">${validationCardSubtle}</div></div>
          <div class="card"><div class="label">恢复回归验证</div><div class="value">${recoveryCardValue}</div><div class="subtle">${recoveryCardSubtle}</div></div>
        </div>
        <div class="bar"><div class="bar-ok"></div><div class="bar-bad"></div></div>
      </section>
      ${frontpageSection}
      ${watchSection}
      ${validationSection}
      ${hardeningSection}
      ${memorySection}
      ${releaseMatrixSection}
      <section class="grid">
        <div class="panel">
          <h2>按任务分组</h2>
          <table>
            <thead><tr><th>任务</th><th>任务说明</th><th>总数</th><th>成功</th><th>失败</th><th>成功率</th><th>平均耗时(ms)</th><th>最近退出码</th></tr></thead>
            <tbody>${groupRows}</tbody>
          </table>
        </div>
        <div class="panel">
          <h2>失败原因分布</h2>
          <table>
            <thead><tr><th>原因</th><th>次数</th></tr></thead>
            <tbody>${failureRows}</tbody>
          </table>
        </div>
      </section>
      <section class="panel full">
        <h2>最近执行记录</h2>
        <table>
          <thead><tr><th>开始时间</th><th>任务</th><th>任务说明</th><th>状态</th><th>退出码</th><th>耗时(ms)</th><th>命令</th></tr></thead>
          <tbody>${runRows}</tbody>
        </table>
      </section>
    </div>
  </body>
</html>`;
}

async function main() {
  const monitorPath = resolveAgentArtifactPath(projectRoot, "agent-monitor.json");
  const htmlPath = resolveAgentArtifactPath(projectRoot, "agent-dashboard.html");

  const source = await fs.readFile(monitorPath, "utf-8");
  const summary = JSON.parse(source);
  assert(summary && typeof summary === "object", "Invalid monitor summary data", {
    failedStage: "read-monitor",
    details: {
      filePath: monitorPath,
    },
  });

  const html = buildDashboardHTML(summary);
  await fs.mkdir(resolveAgentArtifactsDir(projectRoot), { recursive: true });
  await fs.writeFile(htmlPath, `${html}\n`, "utf-8");
  console.log(`Agent dashboard generated: ${htmlPath}`);
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  const htmlPath = resolveAgentArtifactPath(projectRoot, "agent-dashboard.html");
  try {
    await fs.mkdir(resolveAgentArtifactsDir(projectRoot), { recursive: true });
    await fs.writeFile(htmlPath, `${buildFailureHTML(failureInfo)}\n`, "utf-8");
  } catch {
    // ignore secondary failure
  }
  console.error(`${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
