import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listRunRecords } from "./agent-telemetry-lib.mjs";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import { buildMonitorFrontpageSummary } from "./agent-frontpage-summary-lib.mjs";
import {
  buildValidationDecision,
  collectValidationContext,
} from "./agent-validation-decision-lib.mjs";
import {
  archiveAgentSignalHistory,
  loadAutofixHistoryEntries,
  renderAgentMemoryMarkdown,
  summarizeAgentMemory,
  writeAgentMemoryArtifacts,
} from "./agent-memory-lib.mjs";
import {
  buildVisualExhaustedStageSummary,
  buildPureVisualReaderFailureSummary,
  buildVisualPrimaryBlockerSummary,
  summarizeAutofixReport,
  summarizeE2EReport,
  summarizeWatchRecoveryReport,
} from "./agent-zotero-validation-lib.mjs";
import {
  buildScriptFailureInfo,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";
import { summarizeEngineeringHardening } from "./engineering-hardening-lib.mjs";
import {
  DEFAULT_WATCH_STALE_AFTER_MINUTES,
  summarizeZoteroWatchStatus,
} from "./zotero-watch-status-lib.mjs";
import { resolveZoteroAutofixArtifacts } from "./zotero-agent-artifacts.mjs";
import { evaluateArtifactProvenance } from "./agent-provenance-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();
const DIAGNOSTIC_RUN_NAMES = new Set([
  "telemetry-test",
  "telemetry-fail-test",
]);

function isDiagnosticRunName(runName) {
  const normalized = String(runName || "");
  if (DIAGNOSTIC_RUN_NAMES.has(normalized)) {
    return true;
  }
  return /^gate-.*-case$/u.test(normalized);
}

function pickFailureReason(run) {
  const spawnError = run.metadata?.spawnError;
  if (spawnError) {
    return `启动错误: ${String(spawnError).trim()}`;
  }

  const stderrTail = String(run.metadata?.stderrTail || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (stderrTail.length > 0) {
    return `错误输出: ${stderrTail[stderrTail.length - 1]}`;
  }

  if (typeof run.exitCode === "number") {
    return `退出码: ${run.exitCode}`;
  }

  return "未知失败";
}

function summarizeByRunName(runs) {
  const groups = {};
  for (const run of runs) {
    const key = String(run.runName || "unknown");
    if (!groups[key]) {
      groups[key] = {
        runName: key,
        total: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        averageDurationMs: 0,
        latestStartedAtISO: null,
        latestExitCode: null,
      };
    }

    const group = groups[key];
    group.total += 1;
    if (run.success) {
      group.passed += 1;
    } else {
      group.failed += 1;
    }
    group.averageDurationMs += Number(run.durationMs || 0);
    if (!group.latestStartedAtISO || String(run.startedAtISO) > String(group.latestStartedAtISO)) {
      group.latestStartedAtISO = run.startedAtISO || null;
      group.latestExitCode = run.exitCode ?? null;
    }
  }

  for (const group of Object.values(groups)) {
    group.passRate = group.total === 0
      ? 0
      : Number(((group.passed / group.total) * 100).toFixed(2));
    group.averageDurationMs = group.total === 0
      ? 0
      : Math.round(group.averageDurationMs / group.total);
  }

  return Object.values(groups).sort((a, b) => a.runName.localeCompare(b.runName));
}

function summarizeFailureReasons(runs) {
  const failedRuns = runs.filter((run) => run.success === false);
  const reasonMap = new Map();
  for (const run of failedRuns) {
    const reason = pickFailureReason(run);
    reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
  }

  return Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function summarizeRuns(runs) {
  const total = runs.length;
  const passed = runs.filter((run) => run.success === true).length;
  const failed = runs.filter((run) => run.success === false).length;
  const passRate = total === 0 ? 0 : Number(((passed / total) * 100).toFixed(2));
  const averageDurationMs = total === 0
    ? 0
    : Math.round(
      runs.reduce((sum, run) => sum + Number(run.durationMs || 0), 0) / total,
    );

  const qualityRuns = runs.filter((run) => !isDiagnosticRunName(run.runName));
  const qualityPassed = qualityRuns.filter((run) => run.success === true).length;
  const qualityFailed = qualityRuns.filter((run) => run.success === false).length;
  const qualityPassRate = qualityRuns.length === 0
    ? 0
    : Number(((qualityPassed / qualityRuns.length) * 100).toFixed(2));
  const diagnosticRuns = runs.filter((run) => isDiagnosticRunName(run.runName));
  const diagnosticPassed = diagnosticRuns.filter((run) => run.success === true).length;
  const diagnosticFailed = diagnosticRuns.filter((run) => run.success === false).length;
  const diagnosticPassRate = diagnosticRuns.length === 0
    ? 0
    : Number(((diagnosticPassed / diagnosticRuns.length) * 100).toFixed(2));

  return {
    generatedAt: new Date().toISOString(),
    total,
    passed,
    failed,
    passRate,
    qualityTotal: qualityRuns.length,
    qualityPassed,
    qualityFailed,
    qualityPassRate,
    diagnosticTotal: diagnosticRuns.length,
    diagnosticPassed,
    diagnosticFailed,
    diagnosticPassRate,
    averageDurationMs,
    latest: runs[0] || null,
    byRunName: summarizeByRunName(runs),
    failureReasons: summarizeFailureReasons(runs),
    runs,
  };
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

async function loadWatchStatusSummary() {
  const target = resolveAgentArtifactPath(projectRoot, "zotero-watch-status.json");
  const rawStatus = await fs.readFile(target, "utf-8")
    .then((content) => JSON.parse(content))
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });

  return summarizeZoteroWatchStatus(rawStatus, {
    staleAfterMinutes: DEFAULT_WATCH_STALE_AFTER_MINUTES,
  });
}

async function loadJSONIfExists(filePath) {
  return await fs.readFile(filePath, "utf-8")
    .then((content) => JSON.parse(content))
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
}

async function loadZoteroValidationSummary() {
  const e2ePath = resolveAgentArtifactPath(projectRoot, "agent-zotero-e2e.json");
  const autofixPath = resolveAgentArtifactPath(projectRoot, "agent-zotero-autofix.json");
  const watchRecoveryPath = resolveAgentArtifactPath(projectRoot, "zotero-watch-recovery-regression.json");
  const [e2eReport, autofixReport, watchRecoveryReport] = await Promise.all([
    loadJSONIfExists(e2ePath),
    loadJSONIfExists(autofixPath),
    loadJSONIfExists(watchRecoveryPath),
  ]);

  return {
    e2e: summarizeE2EReport(e2eReport),
    autofix: summarizeAutofixReport(autofixReport),
    watchRecovery: summarizeWatchRecoveryReport(watchRecoveryReport),
  };
}

async function loadReleaseMatrixSummary() {
  const releaseMatrixPath = resolveAgentArtifactPath(projectRoot, "release-matrix.json");
  return await loadJSONIfExists(releaseMatrixPath);
}

async function loadAgentMemorySummary(signalTrends = null) {
  const zoteroAutofixArtifacts = resolveZoteroAutofixArtifacts(projectRoot);
  const [e2eReport, autofixReport, historyEntries] = await Promise.all([
    loadJSONIfExists(zoteroAutofixArtifacts.e2eReportJSON),
    loadJSONIfExists(zoteroAutofixArtifacts.reportJSON),
    loadAutofixHistoryEntries(zoteroAutofixArtifacts.historyDir),
  ]);

  return summarizeAgentMemory({
    e2eReport,
    autofixReport,
    historyEntries,
    signalTrends,
  });
}

function buildMarkdown(summary) {
  const lines = [
    "# Agent 执行监控报告",
    "",
    `- 生成时间: \`${summary.generatedAt}\``,
    `- 总执行次数: \`${summary.total}\``,
    `- 成功: \`${summary.passed}\``,
    `- 失败: \`${summary.failed}\``,
    `- 成功率: \`${summary.passRate}%\``,
    `- 质量任务成功率: \`${summary.qualityPassRate ?? 0}%\` (${summary.qualityPassed ?? 0}/${summary.qualityTotal ?? 0})`,
    `- 诊断任务成功率: \`${summary.diagnosticPassRate ?? 0}%\` (${summary.diagnosticPassed ?? 0}/${summary.diagnosticTotal ?? 0})`,
    `- 平均耗时: \`${summary.averageDurationMs}ms\``,
    "",
    "## 首页摘要",
    "",
    `- 当前状态: \`${summary.frontpageSummary?.statusLabel || "缺失"}\``,
    `- 摘要结论: ${summary.frontpageSummary?.headline || "-"}`,
    `- 下一步建议: \`${summary.frontpageSummary?.nextAction || "-"}\``,
    `- Watch: \`${summary.frontpageSummary?.watch?.statusLabel || "缺失"}\` / ${summary.frontpageSummary?.watch?.ageText || "-"}`,
    `- 真机验证: \`${summary.frontpageSummary?.e2e?.statusLabel || "缺失"}\` / ${summary.frontpageSummary?.e2e?.ageText || "-"}`,
    `- 自动修复: \`${summary.frontpageSummary?.autofix?.statusLabel || "缺失"}\` / ${summary.frontpageSummary?.autofix?.ageText || "-"}`,
    `- 恢复回归: \`${summary.frontpageSummary?.watchRecovery?.statusLabel || "缺失"}\` / ${summary.frontpageSummary?.watchRecovery?.ageText || "-"}`,
    "",
    "## 验证策略判定",
    "",
    `- 判定等级: \`${summary.validationDecision?.level || "unknown"}\` (${summary.validationDecision?.levelLabel || "未知"})`,
    `- 判定来源: \`${summary.validationDecision?.decisionSource || summary.validationDecision?.source || "unknown"}\``,
    `- 命中验证域: ${(summary.validationDecision?.matchedDomain || []).join("、") || "-"}`,
    `- 命中项目覆盖: ${(summary.validationDecision?.matchedProjectOverride || []).join("、") || "-"}`,
    `- 运行时升级: \`${summary.validationDecision?.escalatedByRuntimeSignals ? "是" : "否"}\``,
    `- 是否阻断: \`${summary.validationDecision?.blocking ? "是" : "否"}\``,
    `- 判定依据: ${(summary.validationDecision?.reasons || []).join("；") || "-"}`,
    `- 所需检查: ${(summary.validationDecision?.requiredChecks || []).join("；") || "-"}`,
    `- 所需证据: ${(summary.validationDecision?.requiredEvidence || []).join("；") || "-"}`,
    `- 补证动作: ${summary.validationDecision?.deferredEvidenceAction || "-"}`,
    "",
    "## 工件来源可信度",
    "",
    `- 校验状态: \`${summary.provenance?.status || "unknown"}\``,
    `- 是否越界: \`${summary.provenance?.violation ? "是" : "否"}\``,
    `- 结果说明: ${summary.provenance?.message || "-"}`,
    `- run 归属: in-project ${summary.provenance?.runRecords?.inProjectCount ?? 0} / out-of-project ${summary.provenance?.runRecords?.outOfProjectCount ?? 0} / unknown ${summary.provenance?.runRecords?.unknownCount ?? 0}`,
    `- delegation 归属: cwd 越界 ${summary.provenance?.delegation?.outOfProjectCwdCount ?? 0} / artifact-base 越界 ${summary.provenance?.delegation?.outOfProjectArtifactBaseCount ?? 0}`,
    "",
    "## Zotero 热重载状态",
    "",
    `- 状态: \`${summary.watchStatus?.statusLabel || "缺失"}\``,
    `- 状态码: \`${summary.watchStatus?.status || "missing"}\``,
    `- 状态时间: \`${summary.watchStatus?.generatedAt || "-"}\``,
    `- 新鲜度: \`${summary.watchStatus?.ageText || "-"}\``,
    `- 最近触发: \`${summary.watchStatus?.latestTrigger || "-"}\``,
    `- 最近通过: \`${summary.watchStatus?.latestPassed === null ? "-" : (summary.watchStatus?.latestPassed ? "true" : "false")}\``,
    `- 过期阈值: \`${summary.watchStatus?.staleAfterMinutes || DEFAULT_WATCH_STALE_AFTER_MINUTES} 分钟\``,
    "",
  ];

  if (Array.isArray(summary.frontpageSummary?.primarySignals) && summary.frontpageSummary.primarySignals.length > 0) {
    lines.push("### 关键信号", "");
    summary.frontpageSummary.primarySignals.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  if (Array.isArray(summary.watchStatus?.latestIssues) && summary.watchStatus.latestIssues.length > 0) {
    lines.push("### 最近问题", "");
    summary.watchStatus.latestIssues.slice(0, 5).forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  } else if (summary.watchStatus?.latestSummaryNote) {
    lines.push(`- 最近说明: ${summary.watchStatus.latestSummaryNote}`);
    lines.push("");
  }

  lines.push(
    "## Zotero 真机闭环",
    "",
    `- 最近 E2E: \`${summary.zoteroValidation?.e2e?.statusLabel || "缺失"}\``,
    `- E2E 策略: \`${summary.zoteroValidation?.e2e?.strategy || "-"}\``,
    `- E2E 轮次: \`${summary.zoteroValidation?.e2e?.cycles ?? 0}\``,
    `- E2E 新鲜度: \`${summary.zoteroValidation?.e2e?.ageText || "-"}\``,
    `- 失败测试: \`${summary.zoteroValidation?.e2e?.testFailed ?? 0}\``,
    `- 失败场景: \`${summary.zoteroValidation?.e2e?.scenarioFailed ?? 0}\``,
    `- 视觉漂移: \`${summary.zoteroValidation?.e2e?.visualDriftCount ?? 0}\``,
    `- 视觉采集稳定阶段: \`${summary.zoteroValidation?.e2e?.visualCaptureStableStageCount ?? 0}/${summary.zoteroValidation?.e2e?.visualCaptureStageCount ?? 0}\``,
    `- 服务状态: \`${summary.zoteroValidation?.e2e?.serviceStatus || "unknown"}\``,
    `- 服务总数: \`${summary.zoteroValidation?.e2e?.serviceTotal ?? 0}\``,
    `- 健康服务: \`${summary.zoteroValidation?.e2e?.serviceHealthyCount ?? 0}\``,
    `- 异常服务: \`${summary.zoteroValidation?.e2e?.serviceUnhealthyCount ?? 0}\``,
    `- 服务健康: \`${summary.zoteroValidation?.e2e?.serviceObserved === false ? "未采集" : (summary.zoteroValidation?.e2e?.serviceHealthOK === false ? "异常" : "正常")}\``,
    `- 能力地图观测: \`${summary.zoteroValidation?.e2e?.capabilityObserved ? "已观测" : "未观测"}\``,
    `- 需场景覆盖能力: \`${summary.zoteroValidation?.e2e?.capabilityScenarioBoundTotal ?? 0}\``,
    `- 已覆盖能力: \`${summary.zoteroValidation?.e2e?.capabilityCoveredCount ?? 0}\``,
    `- 通过能力: \`${summary.zoteroValidation?.e2e?.capabilityPassedCount ?? 0}\``,
    `- 失败能力: \`${summary.zoteroValidation?.e2e?.capabilityFailedCount ?? 0}\``,
    `- 未覆盖能力: \`${summary.zoteroValidation?.e2e?.capabilityUncoveredCount ?? 0}\``,
    `- 最近自动修复: \`${summary.zoteroValidation?.autofix?.statusLabel || "缺失"}\``,
    `- 自动修复尝试: \`${summary.zoteroValidation?.autofix?.attempts ?? 0}\``,
    `- 自动修复失败步骤: \`${summary.zoteroValidation?.autofix?.failedAttempts ?? 0}\``,
    `- 自动修复总耗时: \`${summary.zoteroValidation?.autofix?.totalDurationMs ?? 0}ms\``,
    `- 自动修复平均耗时: \`${summary.zoteroValidation?.autofix?.averageDurationMs ?? 0}ms\``,
    `- 自动修复新鲜度: \`${summary.zoteroValidation?.autofix?.ageText || "-"}\``,
    `- 补丁计划状态: \`${summary.zoteroValidation?.autofix?.patchPlanStatusLabel || "缺失"}\``,
    `- 补丁草案数: \`${summary.zoteroValidation?.autofix?.patchDraftCount ?? 0}\``,
    `- 补丁动作摘要: \`${(summary.zoteroValidation?.autofix?.patchDraftOperations || []).map((item) => `${item.label} x${item.count}`).join("；") || "-"}\``,
    `- 补丁应用状态: \`${summary.zoteroValidation?.autofix?.patchApplicationStatusLabel || "未尝试"}\``,
    `- 补丁复验合同: \`${summary.zoteroValidation?.autofix?.patchVerificationStatusLabel || "缺失"}\``,
    `- 恢复回归: \`${summary.zoteroValidation?.watchRecovery?.statusLabel || "缺失"}\``,
    `- 恢复回归新鲜度: \`${summary.zoteroValidation?.watchRecovery?.ageText || "-"}\``,
    "",
  );

  if (summary.zoteroValidation?.e2e?.note) {
    lines.push(`- E2E 说明: ${summary.zoteroValidation.e2e.note}`, "");
  }
  if (Array.isArray(summary.zoteroValidation?.e2e?.serviceIssues)
    && summary.zoteroValidation.e2e.serviceIssues.length > 0) {
    lines.push("### 服务健康问题", "");
    summary.zoteroValidation.e2e.serviceIssues.slice(0, 5).forEach((item) => {
      lines.push(`- ${item}`);
    });
    lines.push("");
  }
  if (summary.zoteroValidation?.e2e?.primaryDiagnosis) {
    const diagnosis = summary.zoteroValidation.e2e.primaryDiagnosis;
    lines.push(`- 主诊断: ${diagnosis.featureLabel || diagnosis.feature || "-"}`);
    lines.push(`- 诊断指纹: \`${diagnosis.fingerprint || "-"}\``);
    lines.push(`- 严重度: \`${diagnosis.severity || "-"}\``);
    lines.push(`- 置信度: \`${Math.round(Number(diagnosis.confidence || 0) * 100)}%\``);
    lines.push(`- 是否阻断级: \`${summary.zoteroValidation.e2e.diagnosisBlocking ? "是" : "否"}\``);
    lines.push(`- 候选文件: ${(diagnosis.candidateFiles || []).join("、") || "-"}`, "");
  }
  if (Array.isArray(summary.zoteroValidation?.e2e?.diagnoses)
    && summary.zoteroValidation.e2e.diagnoses.length > 0) {
    lines.push("### 结构化诊断", "");
    lines.push("| 指纹 | 功能 | 严重度 | 置信度 | 候选文件 |");
    lines.push("|---|---|---|---:|---|");
    summary.zoteroValidation.e2e.diagnoses.slice(0, 5).forEach((entry) => {
      lines.push(
        `| ${entry.fingerprint || "-"} | ${entry.featureLabel || entry.feature || "-"} | ${entry.severity || "-"} | ${Math.round(Number(entry.confidence || 0) * 100)}% | ${(entry.candidateFiles || []).slice(0, 3).join(", ") || "-"} |`,
      );
    });
    lines.push("");
  }
  if (Array.isArray(summary.zoteroValidation?.e2e?.recommendedActions)
    && summary.zoteroValidation.e2e.recommendedActions.length > 0) {
    lines.push("### 诊断建议动作", "");
    summary.zoteroValidation.e2e.recommendedActions.slice(0, 5).forEach((item) => {
      lines.push(`- ${item}`);
    });
    lines.push("");
  }
  if (summary.zoteroValidation?.e2e?.capabilityObserved) {
    lines.push("### 能力覆盖", "");
    lines.push("| 能力 | 状态 | 场景 | 责任文件 |");
    lines.push("|---|---|---|---|");
    const capabilityStatuses = Array.isArray(summary.zoteroValidation?.e2e?.capabilityStatuses)
      ? summary.zoteroValidation.e2e.capabilityStatuses
      : [];
    if (capabilityStatuses.length === 0) {
      lines.push("| - | - | - | - |");
    } else {
      capabilityStatuses.slice(0, 8).forEach((item) => {
        const statusLabel = item.status === "passed"
          ? "通过"
          : item.status === "failed"
            ? "失败"
            : "未覆盖";
        lines.push(
          `| ${item.label || item.id || "-"} | ${statusLabel} | ${(item.scenarioNames || []).join("、") || "-"} | ${(item.ownedBy || []).join("、") || "-"} |`,
        );
      });
    }
    lines.push("");
  }
  const readerEvent = summary.zoteroValidation?.e2e?.readerEventReport || null;
  if (readerEvent) {
    const e2e = summary.zoteroValidation.e2e;
    const visualPrimaryBlockerSummary = buildPureVisualReaderFailureSummary(e2e)
      || buildVisualPrimaryBlockerSummary(e2e);
    const firstVisualEvidenceItem = Array.isArray(e2e.visualEvidenceItems)
      ? e2e.visualEvidenceItems[0] || null
      : null;
    lines.push("### Reader 事件桥", "");
    lines.push(`- 状态: \`${readerEvent.statusLabel || "缺失"}\``);
    lines.push(`- 事件 API: \`${readerEvent.available === null ? "-" : (readerEvent.available ? "可用" : "不可用")}\``);
    lines.push(`- 已注册监听器: \`${readerEvent.registeredCount ?? 0}\``);
    lines.push(`- 已知事件类型: \`${readerEvent.knownTypeCount ?? "-"}\``);
    lines.push(`- 可探针类型: \`${readerEvent.probeCompatibleTypeCount ?? "-"}\``);
    lines.push(`- 场景探针类型: \`${readerEvent.probeObservedTypeCount ?? 0}\``);
    lines.push(`- 宿主观测类型: \`${readerEvent.hostObservedTypeCount ?? 0}\``);
    lines.push(`- synthetic fallback: \`${readerEvent.syntheticFallbackAvailable === null ? "-" : (readerEvent.syntheticFallbackAvailable ? "可用" : "不可用")}\``);
    lines.push(`- Hook 场景: \`${readerEvent.hookScenarioStatusLabel || "缺失"}\``);
    lines.push(`- 细粒度 Hook: \`${readerEvent.fineGrainedScenarioStatusLabel || "缺失"}\``);
    lines.push(`- renderToolbar 宿主点: \`${readerEvent.toolbarHookObserved ? "已观测" : "未观测"}\``);
    lines.push(`- 最近观测场景: ${(readerEvent.observedScenarioNames || []).join("、") || "-"}`);
    lines.push(`- 注册类型: ${(readerEvent.registeredTypes || []).join("、") || "-"}`);
    lines.push(`- 探针类型: ${(readerEvent.probeObservedTypes || []).join("、") || "-"}`);
    lines.push(`- 宿主观测类型: ${(readerEvent.hostObservedTypes || []).join("、") || "-"}`);
    lines.push(`- 缺少已知类型: ${(readerEvent.missingKnownTypes || []).join("、") || "-"}`);
    lines.push(`- 缺少 probe-compatible 类型: ${(readerEvent.missingProbeCompatibleTypes || []).join("、") || "-"}`);
    lines.push(`- 未观测 probe 类型: ${(readerEvent.unobservedProbeTypes || []).join("、") || "-"}`);
    lines.push(`- 分发模式: ${(readerEvent.dispatchModes || []).join("、") || "-"}`);
    lines.push(`- 摘要: ${readerEvent.note || "-"}`);
    lines.push(`- renderToolbar 证据: ${e2e.toolbarEvidenceSummary || "-"}`);
    lines.push(`- 视觉证据: ${e2e.visualEvidenceSummary || "-"}`);
    lines.push(`- 证据导航: ${firstVisualEvidenceItem ? `先看 Cycle ${firstVisualEvidenceItem.cycleIndex ?? "-"} / ${firstVisualEvidenceItem.bootMode || "-"} / ${firstVisualEvidenceItem.kind || "visual"} / ${firstVisualEvidenceItem.canonicalTarget || "-"}` : "-"}`);
    lines.push(`- 失败证据项: \`${e2e.visualEvidenceFailingItemCount ?? 0} / ${e2e.visualEvidenceItemCount ?? 0}\``, "");
    lines.push(`- 视觉采集稳定性: ${e2e.visualCaptureStabilitySummary || "-"}`, "");
    lines.push(`- 预截图 settle: ${e2e.visualPreCaptureSettleSummary || "-"}`);
    lines.push(`- Attempt 诊断: ${e2e.visualCaptureAttemptDiagnosisSummary || "-"}`);
    lines.push(`- 用尽预算 stage：${buildVisualExhaustedStageSummary(e2e) || "-"}`);
    lines.push(`- 视觉主阻断: ${visualPrimaryBlockerSummary || "-"}`);
    lines.push(`- 视觉主阻断类型: \`${e2e.visualPrimaryBlockerKindLabel || e2e.visualPrimaryBlockerKind || "-"}\``);
    lines.push(`- 视觉几何摘要: ${e2e.visualGeometrySummary || "-"}`, "");
    lines.push(`- Canonical 覆盖类型: \`${e2e.visualCanonicalCoverageKindLabel || e2e.visualCanonicalCoverageKind || "-"}\``);
    lines.push(`- Canonical 覆盖摘要: ${e2e.visualCanonicalCoverageSummary || "-"}`);
    lines.push(`- Canonical 未对齐目标: ${(e2e.visualCanonicalMismatchedTargets || []).join("、") || "-"}`, "");
  }
  if (Object.prototype.hasOwnProperty.call(summary.zoteroValidation?.e2e || {}, "readerHostStateObserved")) {
    lines.push("### Reader 深层宿主状态", "");
    lines.push(`- 状态: \`${summary.zoteroValidation.e2e.readerHostStateObserved ? "已观测" : "未观测"}\``);
    lines.push(`- 状态摘要: ${summary.zoteroValidation.e2e.readerHostStateSummary || "-"}`);
    lines.push(`- 侧边栏视图: \`${summary.zoteroValidation.e2e.readerSidebarView ?? "-"}\``);
    lines.push(`- 流模式: \`${summary.zoteroValidation.e2e.readerFlowMode ?? "-"}\``);
    lines.push(`- 分栏类型: \`${summary.zoteroValidation.e2e.readerSplitType ?? "-"}\``);
    lines.push(`- 滚动模式: \`${summary.zoteroValidation.e2e.readerScrollMode ?? "-"}\``);
    lines.push(`- 跨页模式: \`${summary.zoteroValidation.e2e.readerSpreadMode ?? "-"}\``);
    lines.push(`- 缩放倍率: \`${summary.zoteroValidation.e2e.readerScale ?? "-"}\``);
    lines.push(`- 上下文面板: \`${summary.zoteroValidation.e2e.readerContextPaneOpen === null ? "-" : (summary.zoteroValidation.e2e.readerContextPaneOpen ? "打开" : "关闭")}\``);
    lines.push(`- 第二视图状态: \`${summary.zoteroValidation.e2e.readerHasSecondViewState === null ? "-" : (summary.zoteroValidation.e2e.readerHasSecondViewState ? "存在" : "无")}\``);
    lines.push(`- 备注: ${summary.zoteroValidation.e2e.readerHostStateNote || "-"}`, "");
    if (summary.zoteroValidation.e2e.readerDispatchSummary || summary.zoteroValidation.e2e.contextMenuSummary) {
      lines.push("### Reader 深层事件点摘要", "");
      lines.push(`- 分发摘要: ${summary.zoteroValidation.e2e.readerDispatchSummary || "-"}`);
      lines.push(`- 上下文菜单: ${summary.zoteroValidation.e2e.contextMenuSummary || "-"}`, "");
    }
  }
  if (summary.zoteroValidation?.autofix?.note) {
    lines.push(`- 自动修复说明: ${summary.zoteroValidation.autofix.note}`, "");
  }
  if (summary.zoteroValidation?.e2e?.errorCategoryLabel || summary.zoteroValidation?.e2e?.failedStage) {
    lines.push(`- E2E 失败分类: \`${summary.zoteroValidation.e2e.errorCategoryLabel || summary.zoteroValidation.e2e.errorCategory || "-"}\``);
    lines.push(`- E2E 失败阶段: \`${summary.zoteroValidation.e2e.failedStage || "-"}\``);
    lines.push(`- E2E 失败信息: ${summary.zoteroValidation.e2e.errorMessage || "-"}`, "");
  }
  if (summary.zoteroValidation?.autofix?.errorCategoryLabel || summary.zoteroValidation?.autofix?.failedStage) {
    lines.push(`- Autofix 失败分类: \`${summary.zoteroValidation.autofix.errorCategoryLabel || summary.zoteroValidation.autofix.errorCategory || "-"}\``);
    lines.push(`- Autofix 失败阶段: \`${summary.zoteroValidation.autofix.failedStage || "-"}\``);
    lines.push(`- Autofix 失败信息: ${summary.zoteroValidation.autofix.errorMessage || "-"}`, "");
  }
  if (summary.engineeringHardening) {
    lines.push("### 工程化硬化信号", "");
    lines.push(`- 摘要: ${summary.engineeringHardening.summary || "-"}`);
    lines.push(`- 错误边界命中: \`${summary.engineeringHardening.errorBoundaryHitCount ?? 0}\``);
    lines.push(`- 校验失败分类: \`${summary.engineeringHardening.validationFailureCategories.map((item) => `${item.label} x${item.count}`).join("；") || "-"}\``);
    lines.push(`- HTTP timeout: \`${summary.engineeringHardening.httpTimeoutCount ?? 0}\``);
    lines.push(`- HTTP retry: \`${summary.engineeringHardening.httpRetryCount ?? 0}\``);
    lines.push(`- HTTP 慢操作: \`${summary.engineeringHardening.httpSlowOperationCount ?? 0}\``);
    lines.push(`- 慢操作阈值: \`${summary.engineeringHardening.httpSlowThresholdMs ?? 0}ms\``);
    lines.push(`- 生命周期时序: \`${summary.engineeringHardening.hostReadyDurationMs ?? 0}ms / ${summary.engineeringHardening.startupDurationMs ?? 0}ms / ${summary.engineeringHardening.shutdownDurationMs ?? 0}ms\``);
    lines.push(`- 生命周期慢操作: \`${summary.engineeringHardening.lifecycleSlowOperationCount ?? 0}\``);
    lines.push(`- 生命周期慢阈值: \`${summary.engineeringHardening.lifecycleSlowThresholdMs ?? 0}ms\``);
    lines.push(`- 最近生命周期慢阶段: \`${summary.engineeringHardening.lifecycleLastSlowStage || "-"}\``);
    lines.push(`- 边界事件: \`${(summary.engineeringHardening.errorBoundaryEvents || []).map((item) => `${item.event} x${item.count}`).join("；") || "-"}\``);
    lines.push(`- 最近 HTTP 错误: \`${summary.engineeringHardening.httpLastErrorKind || "-"}\` / ${summary.engineeringHardening.httpLastErrorMessage || "-"}`);
    lines.push("");
  }
  if (summary.zoteroValidation?.watchRecovery?.summaryNote) {
    lines.push(`- 恢复回归说明: ${summary.zoteroValidation.watchRecovery.summaryNote}`, "");
  }
  if (summary.zoteroValidation?.watchRecovery?.present) {
    lines.push("### Watch 恢复回归", "");
    lines.push(`- 最新触发: \`${summary.zoteroValidation.watchRecovery.latestTrigger || "-"}\``);
    lines.push(`- 最新状态: \`${summary.zoteroValidation.watchRecovery.latestStatus || "-"}\``);
    lines.push(`- 启动健康检查: \`${summary.zoteroValidation.watchRecovery.startupPassed ? "true" : "false"}\``);
    lines.push(`- 期望序列: ${(summary.zoteroValidation.watchRecovery.expectedTriggers || []).join(" -> ") || "-"}`);
    lines.push(`- 实际序列: ${(summary.zoteroValidation.watchRecovery.observedTriggers || []).join(" -> ") || "-"}`, "");
    if (Array.isArray(summary.zoteroValidation.watchRecovery.entries)
      && summary.zoteroValidation.watchRecovery.entries.length > 0) {
      lines.push("| 触发 | 结果 | 时间 | 说明 |");
      lines.push("|---|---|---|---|");
      summary.zoteroValidation.watchRecovery.entries.forEach((entry) => {
        lines.push(
          `| ${entry.trigger || "-"} | ${entry.passed ? "通过" : "失败"} | ${entry.at || "-"} | ${entry.summaryNote || "-"} |`,
        );
      });
      lines.push("");
    }
    if (Array.isArray(summary.zoteroValidation.watchRecovery.issues)
      && summary.zoteroValidation.watchRecovery.issues.length > 0) {
      lines.push("### 恢复回归问题", "");
      summary.zoteroValidation.watchRecovery.issues.slice(0, 5).forEach((item) => {
        lines.push(`- ${item}`);
      });
      lines.push("");
    }
  }
  if (summary.zoteroValidation?.autofix?.patchPlanStatus && summary.zoteroValidation.autofix.patchPlanStatus !== "missing") {
    lines.push(`- 补丁计划模式: \`${summary.zoteroValidation.autofix.patchPlanMode || "none"}\``);
    lines.push(`- 补丁计划功能: \`${summary.zoteroValidation.autofix.patchPlanFeature || "-"}\``);
    lines.push(`- 补丁动作摘要: \`${(summary.zoteroValidation.autofix.patchDraftOperations || []).map((item) => `${item.label} x${item.count}`).join("；") || "-"}\``);
    lines.push(`- 补丁计划范围: ${(summary.zoteroValidation.autofix.patchPlanTargets || []).join("、") || "-"}`, "");
  }
  if (summary.zoteroValidation?.autofix?.patchUnsupportedDiagnosisCategoryLabel || summary.zoteroValidation?.autofix?.patchUnsupportedDiagnosisReason) {
    lines.push("### 未进入白名单原因", "");
    lines.push(`- 分类: \`${summary.zoteroValidation.autofix.patchUnsupportedDiagnosisCategoryLabel || summary.zoteroValidation.autofix.patchUnsupportedDiagnosisCategory || "-"}\``);
    lines.push(`- 说明: ${summary.zoteroValidation.autofix.patchUnsupportedDiagnosisReason || "-"}`, "");
  }
  if (Array.isArray(summary.zoteroValidation?.autofix?.patchApplicationAppliedFiles)
    && summary.zoteroValidation.autofix.patchApplicationAppliedFiles.length > 0) {
    lines.push(`- 已应用补丁文件: ${(summary.zoteroValidation.autofix.patchApplicationAppliedFiles || []).join("、")}`, "");
  }
  if (summary.zoteroValidation?.autofix?.patchArchivePresent) {
    const verificationKinds = mergeVerificationKindEntries(
      summary.zoteroValidation.autofix.patchVerificationFailedCheckKinds,
      summary.zoteroValidation.autofix.patchVerificationOptionalFailedCheckKinds,
    );
    lines.push(`- 补丁归档运行 ID: \`${summary.zoteroValidation.autofix.patchArchiveRunId || "-"}\``);
    lines.push(`- 补丁复验状态: \`${summary.zoteroValidation.autofix.patchVerificationStatusLabel || summary.zoteroValidation.autofix.patchVerificationStatus || "缺失"}\``);
    lines.push(`- 复验合同检查: \`${summary.zoteroValidation.autofix.patchVerificationChecksTotal || 0}\` 项 / 必需失败 \`${summary.zoteroValidation.autofix.patchVerificationChecksFailed || 0}\` 项 / 观察失败 \`${summary.zoteroValidation.autofix.patchVerificationChecksOptionalFailed || 0}\` 项`);
    lines.push(`- 复验总览: 必需 通过 ${summary.zoteroValidation.autofix.patchVerificationRequiredPassed || 0} / 失败 ${summary.zoteroValidation.autofix.patchVerificationRequiredFailed || 0}；观察 通过 ${summary.zoteroValidation.autofix.patchVerificationOptionalPassed || 0} / 失败 ${summary.zoteroValidation.autofix.patchVerificationOptionalFailed || 0}`);
    lines.push(`- 必需失败项: ${formatVerificationCheckList(summary.zoteroValidation.autofix.patchVerificationFailedChecks)}`);
    lines.push(`- 观察失败项: ${formatVerificationCheckList(summary.zoteroValidation.autofix.patchVerificationOptionalFailedChecks)}`);
    lines.push(`- 失败类型画像: ${formatVerificationKindList(verificationKinds)}`);
    lines.push(`- 补丁归档文件: \`${summary.zoteroValidation.autofix.patchArchiveEntryPath || "-"}\``, "");
  }
  if (summary.zoteroValidation?.autofix?.patchVerificationSummary) {
    lines.push(`- 复验合同摘要: ${summary.zoteroValidation.autofix.patchVerificationSummary}`, "");
  }
  if (Array.isArray(summary.zoteroValidation?.autofix?.patchApplicationIssues)
    && summary.zoteroValidation.autofix.patchApplicationIssues.length > 0) {
    lines.push("### 补丁阻塞原因", "");
    summary.zoteroValidation.autofix.patchApplicationIssues.slice(0, 5).forEach((item) => {
      lines.push(`- ${item.label || item.reason || "未知原因"}: ${item.count ?? 0}${Array.isArray(item.files) && item.files.length > 0 ? ` / ${(item.files || []).join("、")}` : ""}`);
    });
    lines.push("");
  }
  if (Array.isArray(summary.zoteroValidation?.autofix?.recentAttempts)
    && summary.zoteroValidation.autofix.recentAttempts.length > 0) {
    lines.push("### 最近恢复步骤", "");
    lines.push("| 序号 | 类型 | 步骤 | 结果 | 退出码 | 耗时(ms) | 说明 |");
    lines.push("|---:|---|---|---|---:|---:|---|");
    summary.zoteroValidation.autofix.recentAttempts.forEach((attempt) => {
      lines.push(
        `| ${attempt.index ?? "-"} | ${attempt.kind || "-"} | ${attempt.label || "-"} | ${attempt.ok ? "成功" : "失败"} | ${attempt.exitCode ?? "-"} | ${attempt.durationMs ?? 0} | ${attempt.note || "-"} |`,
      );
    });
    lines.push("");
  }
  if (Array.isArray(summary.zoteroValidation?.autofix?.failedStepBreakdown)
    && summary.zoteroValidation.autofix.failedStepBreakdown.length > 0) {
    lines.push("### 自动修复失败步骤分布", "");
    lines.push("| 步骤 | 次数 |");
    lines.push("|---|---:|");
    summary.zoteroValidation.autofix.failedStepBreakdown.slice(0, 8).forEach((entry) => {
      lines.push(`| ${entry.label} | ${entry.count} |`);
    });
    lines.push("");
  }

  if (summary.agentMemory?.present) {
    lines.push(renderAgentMemoryMarkdown(summary.agentMemory, { headingLevel: 2 }), "");
  }

  if (summary.releaseMatrix && typeof summary.releaseMatrix === "object") {
    lines.push(
      "## 本地发布矩阵",
      "",
      `- 矩阵状态: \`${summary.releaseMatrix.statusLabel || "缺失"}\``,
      `- 生成耗时: \`${summary.releaseMatrix.durationMs ?? 0}\` ms`,
      `- 摘要: ${summary.releaseMatrix.summary || "-"}`,
      `- 通过渠道: \`${summary.releaseMatrix.passedProfileCount ?? 0}\``,
      `- 失败渠道: \`${summary.releaseMatrix.failedProfileCount ?? 0}\``,
      `- 待补验证渠道: \`${summary.releaseMatrix.attentionProfileCount ?? 0}\``,
      `- 阻断型错误: \`${summary.releaseMatrix.blockingRuntimeErrorCount ?? 0}\``,
      `- 宿主噪声: \`${summary.releaseMatrix.hostNoiseErrorCount ?? 0}\``,
      `- 阻断错误画像: ${summary.releaseMatrix.blockingRuntimeErrorPortrait || "-"}`,
      `- 宿主噪声画像: ${summary.releaseMatrix.hostNoiseRuntimeErrorPortrait || "-"}`,
      `- XPI: \`${summary.releaseMatrix.artifacts?.xpiName || "-"}\``,
      `- XPI SHA: \`${summary.releaseMatrix.artifacts?.xpiSHA256Actual || "-"}\``,
      "",
      "| 渠道 | 状态 | 元数据 | XPI 完整性 | 安装态 smoke | smoke 耗时(ms) | readiness | 阻断错误 | 宿主噪声 | 摘要 |",
      "|---|---|---|---|---|---:|---|---|---|---|",
    );
    const releaseProfiles = Array.isArray(summary.releaseMatrix.profiles)
      ? summary.releaseMatrix.profiles
      : [];
    if (releaseProfiles.length === 0) {
      lines.push("| - | - | - | - | - | - | - | - | - | - |");
    } else {
      releaseProfiles.forEach((profile) => {
        lines.push(
          `| ${profile.label || profile.id || "-"} | ${profile.statusLabel || "-"} | ${profile.metadataConsistent ? "通过" : "失败"} | ${profile.packageConsistent ? "通过" : "失败"} | ${profile.installSmokePresent ? (profile.installSmokePassed ? "通过" : "失败") : "未验证"} | ${profile.installSmoke?.durationMs ?? 0} | ${profile.installSmoke?.readinessMode || "-"} | ${profile.blockingRuntimeErrorPortrait || "-"} | ${profile.hostNoiseRuntimeErrorPortrait || "-"} | ${profile.summary || "-"} |`,
        );
      });
    }
    lines.push("");

    if (summary.releaseMatrix.remoteVerification && typeof summary.releaseMatrix.remoteVerification === "object") {
      lines.push(
        "### 远端发布验证",
        "",
        `- 状态: \`${summary.releaseMatrix.remoteVerification.statusLabel || summary.releaseMatrix.remoteVerification.status || "未知"}\``,
        `- 摘要: ${summary.releaseMatrix.remoteVerification.summary || "-"}`,
        `- 证据模式: \`${summary.releaseMatrix.remoteVerification.evidenceModeLabel || summary.releaseMatrix.remoteVerification.evidenceMode || "未知"}\``,
        `- 发布就绪: \`${summary.releaseMatrix.remoteVerification.releaseReady === true ? "是" : "否"}\``,
        `- update.json: \`${summary.releaseMatrix.remoteVerification.effectiveUpdateURL || "-"}\``,
        `- 期望 update_link: \`${summary.releaseMatrix.remoteVerification.expectedUpdateLink || "-"}\``,
        `- 观测 update_link: \`${summary.releaseMatrix.remoteVerification.observedUpdateLink || "-"}\``,
        "",
      );
      if (Array.isArray(summary.releaseMatrix.remoteVerification.issues)
        && summary.releaseMatrix.remoteVerification.issues.length > 0) {
        summary.releaseMatrix.remoteVerification.issues.forEach((item) => lines.push(`- 远端验证问题: ${item}`));
        lines.push("");
      }
    }

    if (Array.isArray(summary.releaseMatrix.blockingIssues) && summary.releaseMatrix.blockingIssues.length > 0) {
      lines.push("### 发布阻断项", "");
      summary.releaseMatrix.blockingIssues.forEach((item) => lines.push(`- ${item}`));
      lines.push("");
    }
    if (Array.isArray(summary.releaseMatrix.attentionIssues) && summary.releaseMatrix.attentionIssues.length > 0) {
      lines.push("### 发布待补验证", "");
      summary.releaseMatrix.attentionIssues.forEach((item) => lines.push(`- ${item}`));
      lines.push("");
    }
    if (Array.isArray(summary.releaseMatrix.hostNoiseIssues) && summary.releaseMatrix.hostNoiseIssues.length > 0) {
      lines.push("### 发布宿主噪声", "");
      summary.releaseMatrix.hostNoiseIssues.forEach((item) => lines.push(`- ${item}`));
      lines.push("");
    }
  }

  lines.push(
    "## 按任务分组",
    "",
    "| 任务 | 总数 | 成功 | 失败 | 成功率 | 平均耗时(ms) | 最近退出码 |",
    "|---|---:|---:|---:|---:|---:|---:|",
  );

  if (summary.byRunName.length === 0) {
    lines.push("| - | - | - | - | - | - | - |");
  } else {
    summary.byRunName.forEach((group) => {
      lines.push(
        `| ${group.runName} | ${group.total} | ${group.passed} | ${group.failed} | ${group.passRate}% | ${group.averageDurationMs} | ${group.latestExitCode ?? "-"} |`,
      );
    });
  }

  lines.push(
    "",
    "## 失败原因分布",
    "",
    "| 原因 | 次数 |",
    "|---|---:|",
  );

  if (summary.failureReasons.length === 0) {
    lines.push("| - | 0 |");
  } else {
    summary.failureReasons.forEach((entry) => {
      lines.push(`| ${entry.reason} | ${entry.count} |`);
    });
  }

  lines.push(
    "",
    "## 最近执行记录",
    "",
    "| 开始时间 | 任务 | 状态 | 退出码 | 耗时(ms) | 命令 |",
    "|---|---|---|---:|---:|---|",
  );

  const recent = summary.runs.slice(0, 20);
  if (recent.length === 0) {
    lines.push("| - | - | - | - | - | - |");
  } else {
    recent.forEach((run) => {
      const statusLabel = run.success ? "成功" : "失败";
      const commandLine = run.metadata?.commandLine || `${run.command || ""} ${(run.args || []).join(" ")}`.trim();
      lines.push(
        `| ${run.startedAtISO || "-"} | ${run.runName || "-"} | ${statusLabel} | ${run.exitCode ?? "-"} | ${run.durationMs ?? 0} | \`${commandLine}\` |`,
      );
    });
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const runs = await listRunRecords();
  const summary = summarizeRuns(runs);
  const [watchStatus, zoteroValidation, gateReport, releaseMatrix, validationContext, provenance] = await Promise.all([
    loadWatchStatusSummary(),
    loadZoteroValidationSummary(),
    loadJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-gate.json")),
    loadReleaseMatrixSummary(),
    collectValidationContext(projectRoot),
    evaluateArtifactProvenance(projectRoot, runs, { env: process.env }),
  ]);
  const signalTrends = await archiveAgentSignalHistory(projectRoot, {
    watch: watchStatus,
    e2e: zoteroValidation.e2e,
    autofix: zoteroValidation.autofix,
    watchRecovery: zoteroValidation.watchRecovery,
    gate: gateReport,
    releaseMatrix,
  });
  const agentMemory = await loadAgentMemorySummary(signalTrends);
  summary.watchStatus = watchStatus;
  summary.zoteroValidation = zoteroValidation;
  summary.validationContext = validationContext;
  summary.validationDecision = buildValidationDecision({
    projectRoot,
    validationContext,
    changedPaths: validationContext?.changedPaths || [],
    runNames: runs.map((item) => item?.runName).filter(Boolean),
    e2e: zoteroValidation.e2e,
    env: process.env,
  });
  summary.provenance = provenance;
  summary.engineeringHardening = summarizeEngineeringHardening({
    e2e: zoteroValidation.e2e,
    autofix: zoteroValidation.autofix,
    gate: gateReport,
  });
  summary.releaseMatrix = releaseMatrix;
  summary.agentMemory = await writeAgentMemoryArtifacts(projectRoot, agentMemory);
  summary.frontpageSummary = buildMonitorFrontpageSummary(summary);
  summary.readinessSummary = summary.frontpageSummary;
  summary.durationMs = Math.max(0, Date.now() - scriptStartedAt);
  summary.errorCategory = null;
  summary.errorCategoryLabel = null;
  summary.errorMessage = null;
  summary.failedStage = null;

  const artifactsDir = resolveAgentArtifactsDir(projectRoot);
  const outJSON = resolveAgentArtifactPath(projectRoot, "agent-monitor.json");
  const outMD = resolveAgentArtifactPath(projectRoot, "agent-monitor.md");

  await fs.mkdir(artifactsDir, { recursive: true });
  await writeJSONArtifact(outJSON, summary);
  await fs.writeFile(outMD, `${buildMarkdown(summary)}\n`, "utf-8");

  console.log(`Agent monitor generated: ${outJSON}`);
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  const outJSON = resolveAgentArtifactPath(projectRoot, "agent-monitor.json");
  const outMD = resolveAgentArtifactPath(projectRoot, "agent-monitor.md");
  const failureSummary = {
    generatedAt: new Date().toISOString(),
    total: 0,
    passed: 0,
    failed: 0,
    passRate: 0,
    averageDurationMs: 0,
    latest: null,
    byRunName: [],
    failureReasons: [],
    runs: [],
    durationMs: failureInfo.durationMs,
    ...failureInfo,
  };
  try {
    await fs.mkdir(resolveAgentArtifactsDir(projectRoot), { recursive: true });
    await writeJSONArtifact(outJSON, failureSummary);
    await fs.writeFile(outMD, [
      "# Agent Monitor",
      "",
      `- 状态: 失败`,
      `- 分类: ${failureInfo.errorCategoryLabel}`,
      `- 阶段: ${failureInfo.failedStage}`,
      `- 信息: ${failureInfo.errorMessage}`,
      `- 耗时: ${failureInfo.durationMs}ms`,
      "",
    ].join("\n"), "utf-8");
  } catch {
    // ignore secondary failure
  }
  console.error(error?.message || String(error));
  process.exit(1);
});
