import {
  buildVisualExhaustedStageSummary,
  buildPureVisualReaderFailureSummary,
  buildVisualPrimaryBlockerSummary,
  pickVisualCaptureSelectionReasonLabel,
} from "./agent-zotero-validation-lib.mjs";

function truncateList(list, max = 6) {
  return Array.isArray(list) ? list.filter(Boolean).slice(0, max) : [];
}

function formatVerificationCheckList(checks, limit = 3) {
  const list = truncateList(checks, limit)
    .map((item) => {
      if (item && typeof item === "object") {
        const label = String(item?.label || item?.id || "未知检查").trim() || "未知检查";
        const id = String(item?.id || "").trim();
        return id ? `${label}（${id}）` : label;
      }
      return String(item || "").trim();
    })
    .filter(Boolean);
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
  const list = truncateList(entries, limit)
    .map((item) => `${item?.label || item?.kind || "未知检查"} x${Number(item?.count || 0)}`);
  return list.length > 0 ? list.join("；") : "-";
}

function makeNode(id, x, y, width, height, text, color = "5") {
  return {
    id,
    type: "text",
    x,
    y,
    width,
    height,
    color,
    text,
  };
}

function makeEdge(id, fromNode, toNode, label = "") {
  return {
    id,
    fromNode,
    toNode,
    fromSide: "right",
    toSide: "left",
    label,
  };
}

function sanitizeDiagramText(value) {
  return String(value || "")
    .replaceAll('"', "『")
    .replaceAll("(", "「")
    .replaceAll(")", "」");
}

function extractHumanEditableSection(existingContent) {
  const marker = "## 人工编辑区（保留）";
  if (typeof existingContent !== "string" || !existingContent.includes(marker)) {
    return [
      "## 人工编辑区（保留）",
      "",
      "状态: pending",
      "模式: auto",
      "下一步指令:",
      "关注文件:",
      "备注:",
      "",
      "补充记录:",
      "- 如需人工接管，请修改上面的字段。",
    ].join("\n");
  }
  return existingContent.slice(existingContent.indexOf(marker)).trim();
}

function normalizeHumanWindowValue(value) {
  return String(value || "").trim();
}

function parseGeneratedAtMs(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function dedupeList(list, max = 8) {
  const seen = new Set();
  const unique = [];
  (Array.isArray(list) ? list : []).forEach((item) => {
    const text = String(item || "").trim();
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);
    unique.push(text);
  });
  return unique.slice(0, max);
}

function chooseFrontpageSource(sources) {
  const normalized = (Array.isArray(sources) ? sources : [])
    .filter((item) => item && typeof item === "object" && item.frontpage && typeof item.frontpage === "object");
  if (normalized.length === 0) {
    return null;
  }
  const dated = normalized.filter((item) => item.generatedAtMs !== null);
  if (dated.length === 0) {
    return normalized[0] || null;
  }
  return dated
    .slice()
    .sort((left, right) => Number(right.generatedAtMs || 0) - Number(left.generatedAtMs || 0))[0] || null;
}

function looksLikeCommand(text) {
  return /^(npm|node|bun|pnpm|yarn|npx)\b/u.test(String(text || "").trim());
}

function extractRunnableAction(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (looksLikeCommand(text)) {
    return text;
  }
  const backtickMatches = Array.from(text.matchAll(/`([^`]+)`/gu))
    .map((item) => String(item?.[1] || "").trim())
    .filter(Boolean);
  return backtickMatches.find((item) => looksLikeCommand(item)) || "";
}

function normalizeNextAction(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (looksLikeCommand(text)) {
    return text;
  }
  const backtickMatches = Array.from(text.matchAll(/`([^`]+)`/gu))
    .map((item) => String(item?.[1] || "").trim())
    .filter(Boolean);
  const commandMatch = backtickMatches.find((item) => looksLikeCommand(item));
  if (commandMatch) {
    return commandMatch;
  }
  return backtickMatches[0] || text;
}

function chooseActionSource(sources) {
  const normalized = (Array.isArray(sources) ? sources : [])
    .filter((item) => item && typeof item === "object" && String(item.nextAction || "").trim().length > 0);
  if (normalized.length === 0) {
    return null;
  }
  const runnableSources = normalized.filter((item) => extractRunnableAction(item.nextAction));
  if (runnableSources.length > 0) {
    return chooseFrontpageSource(runnableSources);
  }
  return chooseFrontpageSource(normalized);
}

function toMarkdownLink(filePath) {
  const text = String(filePath || "").trim();
  if (!text) {
    return "-";
  }
  const label = text.split("/").pop() || text;
  return `[${label}](${text})`;
}

function normalizeVisualEvidenceItems(items, max = 8) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === "object")
    .slice(0, max)
    .map((item) => ({
      cycleIndex: Number.isFinite(Number(item?.cycleIndex)) ? Number(item.cycleIndex) : null,
      bootMode: String(item?.bootMode || "").trim() || null,
      kind: String(item?.kind || "").trim() || null,
      canonicalTarget: String(item?.canonicalTarget || "").trim() || null,
      capturePath: String(item?.capturePath || "").trim() || null,
      baselinePath: String(item?.baselinePath || "").trim() || null,
      captureStable: typeof item?.captureStable === "boolean" ? item.captureStable : null,
      selectedAttempt: Number.isInteger(item?.selectedAttempt) ? item.selectedAttempt : null,
      selectionReason: String(item?.selectionReason || "").trim() || null,
      geometryMatched: typeof item?.geometryMatched === "boolean" ? item.geometryMatched : null,
      changedRatio: Number.isFinite(Number(item?.changedRatio)) ? Number(item.changedRatio) : null,
      meanChannelDiff: Number.isFinite(Number(item?.meanChannelDiff)) ? Number(item.meanChannelDiff) : null,
      issues: truncateList(item?.issues, 6),
    }));
}

function formatVisualEvidenceItemLabel(item) {
  return `Cycle ${item?.cycleIndex ?? "-"} / ${item?.bootMode || "-"} / ${item?.kind || "visual"} / ${item?.canonicalTarget || "-"}`;
}

function normalizeVisualCaptureAttemptDiagnosisItems(items, max = 8) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === "object")
    .slice(0, max)
    .map((item) => ({
      cycleIndex: Number.isFinite(Number(item?.cycleIndex)) ? Number(item.cycleIndex) : null,
      bootMode: String(item?.bootMode || "").trim() || null,
      kind: String(item?.kind || "").trim() || null,
      selectionReason: String(item?.selectionReason || "").trim() || null,
      selectedAttempt: Number.isInteger(item?.selectedAttempt) ? item.selectedAttempt : null,
      attemptCount: Number.isFinite(Number(item?.attemptCount)) ? Number(item.attemptCount) : 0,
      allHashesUnique: typeof item?.allHashesUnique === "boolean" ? item.allHashesUnique : null,
      boundsStable: typeof item?.boundsStable === "boolean" ? item.boundsStable : null,
      rasterSizeStable: typeof item?.rasterSizeStable === "boolean" ? item.rasterSizeStable : null,
      attemptHashes: truncateList(item?.attemptHashes, 6),
      attemptBounds: truncateList(item?.attemptBounds, 6),
      attemptRasterSizes: truncateList(item?.attemptRasterSizes, 6),
      stabilityMetrics: item?.stabilityMetrics && typeof item.stabilityMetrics === "object"
        ? {
          sameDimensions: typeof item.stabilityMetrics.sameDimensions === "boolean"
            ? item.stabilityMetrics.sameDimensions
            : null,
          changedRatio: Number.isFinite(Number(item.stabilityMetrics.changedRatio))
            ? Number(item.stabilityMetrics.changedRatio)
            : null,
          meanChannelDiff: Number.isFinite(Number(item.stabilityMetrics.meanChannelDiff))
            ? Number(item.stabilityMetrics.meanChannelDiff)
            : null,
          thresholdChangedRatio: Number.isFinite(Number(item.stabilityMetrics.thresholdChangedRatio))
            ? Number(item.stabilityMetrics.thresholdChangedRatio)
            : null,
          thresholdMeanChannelDiff: Number.isFinite(Number(item.stabilityMetrics.thresholdMeanChannelDiff))
            ? Number(item.stabilityMetrics.thresholdMeanChannelDiff)
            : null,
        }
        : null,
    }));
}

function formatAttemptDiagnosisItemLabel(item) {
  return `Cycle ${item?.cycleIndex ?? "-"} / ${item?.bootMode || "-"} / ${item?.kind || "visual"}`;
}

function formatAttemptDiagnosisBoolean(value) {
  if (value === true) {
    return "是";
  }
  if (value === false) {
    return "否";
  }
  return "待补证";
}

function formatAttemptDiagnosisPercent(value) {
  return Number.isFinite(Number(value))
    ? `${(Number(value) * 100).toFixed(2)}%`
    : "-";
}

function formatAttemptDiagnosisNumber(value, digits = 2) {
  return Number.isFinite(Number(value))
    ? Number(value).toFixed(digits)
    : "-";
}

function formatAttemptDiagnosisMetrics(metrics) {
  const record = metrics && typeof metrics === "object"
    ? metrics
    : null;
  if (!record) {
    return "-";
  }
  return [
    `sameDimensions=${formatAttemptDiagnosisBoolean(record.sameDimensions)}`,
    `changedRatio=${formatAttemptDiagnosisPercent(record.changedRatio)}`,
    `meanChannelDiff=${formatAttemptDiagnosisNumber(record.meanChannelDiff)}`,
    `thresholdChangedRatio=${formatAttemptDiagnosisPercent(record.thresholdChangedRatio)}`,
    `thresholdMeanChannelDiff=${formatAttemptDiagnosisNumber(record.thresholdMeanChannelDiff)}`,
  ].join(" / ");
}

function formatAttemptDiagnosisList(values) {
  const list = truncateList(values, 6);
  return list.length > 0 ? list.join("；") : "-";
}

function buildVisualEvidenceFocusSummary(items) {
  const first = normalizeVisualEvidenceItems(items, 1)[0];
  if (!first) {
    return null;
  }
  return `先看 ${formatVisualEvidenceItemLabel(first)}`;
}

function shouldPrioritizeVisualEvidence(summary) {
  if (normalizeVisualEvidenceItems(summary?.visualEvidenceItems, 1).length === 0) {
    return false;
  }
  const nextAction = normalizeNextAction(summary?.nextAction);
  const blockerKind = String(summary?.visualPrimaryBlockerKind || "").trim();
  const coverageKind = String(summary?.visualCanonicalCoverageKind || "").trim();
  if (nextAction === "npm run agent:obsidian") {
    return true;
  }
  if (blockerKind === "capture-unstable" || blockerKind === "ui-regression-candidate") {
    return true;
  }
  return blockerKind === "baseline-geometry-mismatch" && coverageKind === "partial";
}

function isManualReaderVerdictStage(summary) {
  return normalizeNextAction(summary?.nextAction) === "npm run agent:obsidian"
    && String(summary?.visualPrimaryBlockerKind || "").trim() === "ui-regression-candidate"
    && String(summary?.visualCanonicalCoverageKind || "").trim() === "complete";
}

function buildPatchActionDisplay(summary) {
  const patchSummary = summary?.patchSummary && typeof summary.patchSummary === "object"
    ? summary.patchSummary
    : {};
  if (shouldPrioritizeVisualEvidence(summary)) {
    return normalizeNextAction(summary?.nextAction) === "npm run agent:zotero:e2e"
      ? "已降级，先复核稳定性并重跑 E2E"
      : "已降级，先人工复核视觉证据";
  }
  return truncateList(patchSummary.draftOperations, 4).join("；") || "暂无";
}

function buildPatchPriorityNote(summary) {
  if (shouldPrioritizeVisualEvidence(summary)) {
    return normalizeNextAction(summary?.nextAction) === "npm run agent:zotero:e2e"
      ? "当前主路径先复核采集稳定性并重跑 E2E，不默认执行历史补丁动作。"
      : isManualReaderVerdictStage(summary)
        ? "当前主路径等待人工 Reader verdict，不默认执行 baseline refresh、autofix 或 rerun E2E。"
        : "当前主路径先处理视觉证据，不默认执行历史补丁动作。";
  }
  return null;
}

export function parseHumanInterventionWindow(content) {
  const section = extractHumanEditableSection(content);
  const result = {
    status: "pending",
    mode: "auto",
    nextActionOverride: "",
    focusFiles: [],
    note: "",
    intervened: false,
  };

  section.split(/\r?\n/u).forEach((line) => {
    const text = String(line || "").trim();
    if (text.startsWith("状态:")) {
      result.status = normalizeHumanWindowValue(text.slice(3)) || "pending";
    } else if (text.startsWith("模式:")) {
      result.mode = normalizeHumanWindowValue(text.slice(3)) || "auto";
    } else if (text.startsWith("下一步指令:")) {
      result.nextActionOverride = normalizeHumanWindowValue(text.slice("下一步指令:".length));
    } else if (text.startsWith("关注文件:")) {
      result.focusFiles = normalizeHumanWindowValue(text.slice("关注文件:".length))
        .split(/[，,]/u)
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (text.startsWith("备注:")) {
      result.note = normalizeHumanWindowValue(text.slice(3));
    }
  });

  result.intervened = result.status !== "pending"
    || result.mode !== "auto"
    || result.nextActionOverride.length > 0
    || result.focusFiles.length > 0
    || result.note.length > 0;

  return result;
}

export function summarizeObsidianInterventionContext(reports = {}) {
  const loop = reports.loop && typeof reports.loop === "object" ? reports.loop : {};
  const gate = reports.gate && typeof reports.gate === "object" ? reports.gate : {};
  const monitor = reports.monitor && typeof reports.monitor === "object" ? reports.monitor : {};
  const e2e = reports.e2e && typeof reports.e2e === "object" ? reports.e2e : {};

  const loopState = loop.finalState && typeof loop.finalState === "object"
    ? loop.finalState
    : {};
  const loopFrontpage = loopState.frontpageSummary && typeof loopState.frontpageSummary === "object"
    ? loopState.frontpageSummary
    : {};
  const gateFrontpage = gate.frontpageSummary && typeof gate.frontpageSummary === "object"
    ? gate.frontpageSummary
    : {};
  const monitorFrontpage = monitor.frontpageSummary && typeof monitor.frontpageSummary === "object"
    ? monitor.frontpageSummary
    : {};
  const monitorAutofix = monitor.zoteroValidation?.autofix && typeof monitor.zoteroValidation.autofix === "object"
    ? monitor.zoteroValidation.autofix
    : {};
  const monitorE2E = monitor.zoteroValidation?.e2e && typeof monitor.zoteroValidation.e2e === "object"
    ? monitor.zoteroValidation.e2e
    : {};
  const primaryDiagnosis = e2e.primaryDiagnosis && typeof e2e.primaryDiagnosis === "object"
    ? e2e.primaryDiagnosis
    : {};

  const frontpageSources = [
    {
      label: "loop",
      frontpage: loopFrontpage,
      generatedAtMs: parseGeneratedAtMs(loop.generatedAt),
      nextAction: loop.nextAction || loopFrontpage.nextAction || "",
    },
    {
      label: "gate",
      frontpage: gateFrontpage,
      generatedAtMs: parseGeneratedAtMs(gate.generatedAt),
      nextAction: gateFrontpage.nextAction || "",
    },
    {
      label: "monitor",
      frontpage: monitorFrontpage,
      generatedAtMs: parseGeneratedAtMs(monitor.generatedAt),
      nextAction: monitorFrontpage.nextAction || "",
    },
  ];
  const currentFrontpageSource = chooseFrontpageSource(frontpageSources);
  const currentActionSource = chooseActionSource(frontpageSources);
  const gatePrimaryBlockers = Array.isArray(gateFrontpage.primaryBlockers) ? gateFrontpage.primaryBlockers : [];
  const monitorPrimarySignals = Array.isArray(monitorFrontpage.primarySignals) ? monitorFrontpage.primarySignals : [];

  const statusLabel = currentFrontpageSource?.frontpage?.statusLabel
    || loopFrontpage.statusLabel
    || gateFrontpage.statusLabel
    || monitorFrontpage.statusLabel
    || "待人工介入";
  const headline = currentFrontpageSource?.frontpage?.headline
    || loopFrontpage.headline
    || gateFrontpage.headline
    || monitorFrontpage.headline
    || "当前缺少足够的自动化结论，请人工查看工件。";
  const nextActionCandidates = dedupeList([
    currentActionSource?.nextAction,
    loop.nextAction,
    loopFrontpage.nextAction,
    gateFrontpage.nextAction,
    monitorFrontpage.nextAction,
  ], 8);
  const nextAction = nextActionCandidates
    .map((item) => extractRunnableAction(item))
    .find(Boolean)
    || normalizeNextAction(currentActionSource?.nextAction || nextActionCandidates[0])
    || "先查看 gate / monitor / e2e 报告。";

  const blockers = dedupeList([
    ...((currentFrontpageSource?.label === "loop" || !currentFrontpageSource)
      ? [
        ...(Array.isArray(loopState.issues) ? loopState.issues : []),
        ...(Array.isArray(loopFrontpage.primarySignals) ? loopFrontpage.primarySignals : []),
      ]
      : []),
    ...gatePrimaryBlockers,
    ...((currentFrontpageSource?.label === "monitor" && gatePrimaryBlockers.length === 0)
      ? monitorPrimarySignals
      : []),
  ], 8);

  const candidateFiles = dedupeList([
    ...(Array.isArray(primaryDiagnosis.candidateFiles) ? primaryDiagnosis.candidateFiles : []),
    ...(Array.isArray(e2e.candidateFiles) ? e2e.candidateFiles : []),
    ...(Array.isArray(monitorAutofix.patchPlanTargets) ? monitorAutofix.patchPlanTargets : []),
    ...(Array.isArray(monitorAutofix.patchApplicationAppliedFiles) ? monitorAutofix.patchApplicationAppliedFiles : []),
    ...((Array.isArray(monitorAutofix.patchApplicationIssues) ? monitorAutofix.patchApplicationIssues : [])
      .flatMap((item) => Array.isArray(item?.files) ? item.files : [])),
  ], 8);

  const commands = dedupeList([
    looksLikeCommand(nextAction) ? nextAction : "",
    "npm run agent:zotero:loop --dry-run",
    "npm run agent:zotero:loop:human",
    "npm run agent:gate",
    "npm run agent:dashboard",
  ], 8);

  const patchDraftOperations = truncateList(
    (Array.isArray(monitorAutofix.patchDraftOperations) ? monitorAutofix.patchDraftOperations : [])
      .map((item) => `${item.label || item.operation || "未知操作"} x${item.count ?? 0}`),
    4,
  );
  const patchBlockers = truncateList(
    (Array.isArray(monitorAutofix.patchApplicationIssues) ? monitorAutofix.patchApplicationIssues : [])
      .map((item) => {
        const files = Array.isArray(item?.files) && item.files.length > 0
          ? ` / ${item.files.join("、")}`
          : "";
        return `${item.label || item.reason || "未知原因"} x${item.count ?? 0}${files}`;
      }),
    6,
  );
  const verificationOverview = `必需 通过 ${monitorAutofix.patchVerificationRequiredPassed ?? 0} / 失败 ${monitorAutofix.patchVerificationRequiredFailed ?? 0}；观察 通过 ${monitorAutofix.patchVerificationOptionalPassed ?? 0} / 失败 ${monitorAutofix.patchVerificationOptionalFailed ?? 0}`;
  const failedRequiredChecks = formatVerificationCheckList(monitorAutofix.patchVerificationFailedChecks);
  const failedOptionalChecks = formatVerificationCheckList(monitorAutofix.patchVerificationOptionalFailedChecks);
  const failedCheckKinds = formatVerificationKindList(mergeVerificationKindEntries(
    monitorAutofix.patchVerificationFailedCheckKinds,
    monitorAutofix.patchVerificationOptionalFailedCheckKinds,
  ));

  return {
    generatedAt: new Date().toISOString(),
    statusLabel,
    headline,
    nextAction,
    blockers,
    candidateFiles,
    commands,
    diagnosis: primaryDiagnosis.summary || primaryDiagnosis.issue || null,
    diagnosisLabel: primaryDiagnosis.featureLabel || primaryDiagnosis.feature || null,
    readerHostStateSummary: monitorE2E.readerHostStateSummary || null,
    readerHostStateNote: monitorE2E.readerHostStateNote || null,
    toolbarEvidenceSummary: monitorE2E.toolbarEvidenceSummary || null,
    visualEvidenceObserved: Boolean(monitorE2E.visualEvidenceObserved),
    visualEvidenceItemCount: Number(monitorE2E.visualEvidenceItemCount || 0),
    visualEvidenceFailingItemCount: Number(monitorE2E.visualEvidenceFailingItemCount || 0),
    visualEvidenceSummary: monitorE2E.visualEvidenceSummary || null,
    visualEvidenceItems: normalizeVisualEvidenceItems(monitorE2E.visualEvidenceItems, 8),
    visualEvidenceFocusSummary: buildVisualEvidenceFocusSummary(monitorE2E.visualEvidenceItems),
    visualCaptureAttemptDiagnosisObserved: Boolean(monitorE2E.visualCaptureAttemptDiagnosisObserved),
    visualCaptureAttemptDiagnosisItemCount: Number(monitorE2E.visualCaptureAttemptDiagnosisItemCount || 0),
    visualCaptureAttemptDiagnosisSummary: monitorE2E.visualCaptureAttemptDiagnosisSummary || null,
    visualCaptureAttemptDiagnosisItems: normalizeVisualCaptureAttemptDiagnosisItems(monitorE2E.visualCaptureAttemptDiagnosisItems, 8),
    visualPrimaryBlockerKind: monitorE2E.visualPrimaryBlockerKind || null,
    visualCaptureStabilitySummary: monitorE2E.visualCaptureStabilitySummary || null,
    visualCaptureStabilityStages: Array.isArray(monitorE2E.visualCaptureStabilityStages)
      ? monitorE2E.visualCaptureStabilityStages
      : [],
    visualPrimaryBlockerSummary: buildPureVisualReaderFailureSummary(monitorE2E)
      || buildVisualPrimaryBlockerSummary(monitorE2E),
    visualGeometrySummary: monitorE2E.visualGeometrySummary || null,
    visualCanonicalCoverageKind: monitorE2E.visualCanonicalCoverageKind || null,
    visualCanonicalCoverageSummary: monitorE2E.visualCanonicalCoverageSummary || null,
    visualCanonicalMismatchedTargets: truncateList(monitorE2E.visualCanonicalMismatchedTargets, 8),
    readerDispatchSummary: monitorE2E.readerDispatchSummary || null,
    contextMenuSummary: monitorE2E.contextMenuSummary || null,
    patchSummary: {
      planStatusLabel: monitorAutofix.patchPlanStatusLabel || monitorAutofix.patchPlanStatus || null,
      featureLabel: monitorAutofix.patchPlanFeature || null,
      draftOperations: patchDraftOperations,
      applicationStatusLabel: monitorAutofix.patchApplicationStatusLabel || monitorAutofix.patchApplicationStatus || null,
      blockers: patchBlockers,
      unsupportedCategoryLabel: monitorAutofix.patchUnsupportedDiagnosisCategoryLabel || monitorAutofix.patchUnsupportedDiagnosisCategory || null,
      unsupportedReason: monitorAutofix.patchUnsupportedDiagnosisReason || null,
      verificationSummary: monitorAutofix.patchVerificationSummary || null,
      verificationOverview,
      failedRequiredChecks,
      failedOptionalChecks,
      failedCheckKinds,
    },
    evidenceLinks: [
      "dist/agent-zotero-loop.md",
      "dist/agent-gate.md",
      "dist/agent-monitor.md",
      "dist/agent-zotero-e2e.md",
      "dist/agent-zotero-autofix.md",
      "dist/zotero-watch-recovery-regression.md",
      "dist/zotero-watch-status.md",
    ],
  };
}

export function buildObsidianVisualViewModel(summary = {}) {
  const patchSummary = summary.patchSummary && typeof summary.patchSummary === "object"
    ? summary.patchSummary
    : {};
  const blockers = truncateList(summary.blockers, 8);
  const candidateFiles = truncateList(summary.candidateFiles, 8);
  const commands = truncateList(summary.commands, 8);
  const verdictBranches = [
    {
      verdict: "预期 UI 变化",
      status: "ready",
      mode: "force-next",
      nextAction: "npm run agent:zotero:e2e:update-baseline",
      note: "人工确认属于预期 UI 变化；仅用于一次受控 baseline refresh，随后回到默认闭环。",
    },
    {
      verdict: "真实回归",
      status: "hold",
      mode: "hold",
      nextAction: "保持 hold，补充 Reader / scenario 关注文件与差异说明，再由 Codex 新开最小修复批次",
      note: "人工确认属于真实回归；不要直接刷新 baseline。",
    },
    {
      verdict: "证据不足",
      status: "hold",
      mode: "hold",
      nextAction: "保持 hold，明确缺失证据项并先补证据，不直接刷新 baseline",
      note: "证据不足时只补证据，不新增第二套 verdict 输入机制。",
    },
  ];

  return {
    generatedAt: String(summary.generatedAt || new Date().toISOString()),
    statusLabel: String(summary.statusLabel || "待人工介入"),
    headline: String(summary.headline || "当前缺少足够的自动化结论，请人工查看工件。"),
    nextAction: String(summary.nextAction || "先查看 gate / monitor / e2e 报告。"),
    blockers,
    candidateFiles,
    commands,
    diagnosisLabel: summary.diagnosisLabel || null,
    diagnosis: summary.diagnosis || null,
    readerDispatchSummary: summary.readerDispatchSummary || null,
    contextMenuSummary: summary.contextMenuSummary || null,
    visualEvidenceObserved: Boolean(summary.visualEvidenceObserved),
    visualEvidenceItemCount: Number(summary.visualEvidenceItemCount || 0),
    visualEvidenceFailingItemCount: Number(summary.visualEvidenceFailingItemCount || 0),
    visualEvidenceSummary: summary.visualEvidenceSummary || null,
    visualEvidenceItems: normalizeVisualEvidenceItems(summary.visualEvidenceItems, 8),
    visualEvidenceFocusSummary: summary.visualEvidenceFocusSummary || buildVisualEvidenceFocusSummary(summary.visualEvidenceItems),
    visualCaptureAttemptDiagnosisObserved: Boolean(summary.visualCaptureAttemptDiagnosisObserved),
    visualCaptureAttemptDiagnosisItemCount: Number(summary.visualCaptureAttemptDiagnosisItemCount || 0),
    visualCaptureAttemptDiagnosisSummary: summary.visualCaptureAttemptDiagnosisSummary || null,
    visualCaptureAttemptDiagnosisItems: normalizeVisualCaptureAttemptDiagnosisItems(summary.visualCaptureAttemptDiagnosisItems, 8),
    visualPrimaryBlockerKind: summary.visualPrimaryBlockerKind || null,
    visualPrimaryBlockerSummary: summary.visualPrimaryBlockerSummary || null,
    visualCaptureStabilityStages: Array.isArray(summary.visualCaptureStabilityStages)
      ? summary.visualCaptureStabilityStages
      : [],
    visualGeometrySummary: summary.visualGeometrySummary || null,
    visualCanonicalCoverageKind: summary.visualCanonicalCoverageKind || null,
    visualCanonicalCoverageSummary: summary.visualCanonicalCoverageSummary || null,
    visualCanonicalMismatchedTargets: truncateList(summary.visualCanonicalMismatchedTargets, 8),
    patchSummary: {
      planStatusLabel: patchSummary.planStatusLabel || null,
      featureLabel: patchSummary.featureLabel || null,
      draftOperations: truncateList(patchSummary.draftOperations, 4),
      applicationStatusLabel: patchSummary.applicationStatusLabel || null,
      blockers: truncateList(patchSummary.blockers, 6),
      unsupportedCategoryLabel: patchSummary.unsupportedCategoryLabel || null,
      unsupportedReason: patchSummary.unsupportedReason || null,
      verificationOverview: patchSummary.verificationOverview || null,
      failedRequiredChecks: patchSummary.failedRequiredChecks || null,
      failedOptionalChecks: patchSummary.failedOptionalChecks || null,
      failedCheckKinds: patchSummary.failedCheckKinds || null,
    },
    verdictBranches,
  };
}

export function buildObsidianVisualFlowMermaidMarkdown(viewModel = {}) {
  const blockers = truncateList(viewModel.blockers, 3);
  const files = truncateList(viewModel.candidateFiles, 3);
  const mismatchedTargets = truncateList(viewModel.visualCanonicalMismatchedTargets, 4);
  const lines = [
    "---",
    `generated_at: ${viewModel.generatedAt || new Date().toISOString()}`,
    "type: zotero-agent-visual-flow",
    "---",
    "",
    "# Zotero Agent 闭环流程图（Visual Companion）",
    "",
    `- 当前状态：${viewModel.statusLabel || "待人工介入"}`,
    `- 当前结论：${viewModel.headline || "-"}`,
    `- 默认下一步：\`${viewModel.nextAction || "-"}\``,
    `- 视觉主阻断：${viewModel.visualPrimaryBlockerSummary || "-"}`,
    `- 视觉几何摘要：${viewModel.visualGeometrySummary || "-"}`,
    `- Canonical 覆盖摘要：${viewModel.visualCanonicalCoverageSummary || "-"}`,
    `- Canonical 未对齐目标：${mismatchedTargets.join("、") || "-"}`,
    "",
    "```mermaid",
    "flowchart LR",
    "  W[\"watch\"] --> E[\"agent:zotero:e2e\"]",
    "  E --> M[\"agent:monitor\"]",
    "  M --> G[\"agent:gate\"]",
    "  G --> O[\"agent:obsidian\"]",
    "  O --> H[\"human verdict\"]",
    "  H -->|\"预期 UI 变化\"| B[\"agent:zotero:e2e:update-baseline（一次受控）\"]",
    "  H -->|\"真实回归\"| R[\"hold 并交给 Codex 新开最小修复批次\"]",
    "  H -->|\"证据不足\"| P[\"hold 并补证据项（不直接刷 baseline）\"]",
    "```",
    "",
    "## 当前阻塞摘要",
    "",
    ...((blockers.length > 0 ? blockers : ["当前暂无明确阻塞项"]).map((item) => `- ${item}`)),
    "",
    "## 当前候选文件",
    "",
    ...((files.length > 0 ? files : ["暂无候选文件"]).map((item) => `- \`${item}\``)),
  ];
  return lines.join("\n");
}

function createExcalidrawElementBase({
  id,
  type,
  x,
  y,
  width,
  height,
  seed,
  versionNonce,
  updated,
  extra = {},
}) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#1e40af",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed,
    version: 1,
    versionNonce,
    isDeleted: false,
    boundElements: null,
    updated,
    link: null,
    locked: false,
    ...extra,
  };
}

function createExcalidrawRect(id, x, y, width, height, seed, versionNonce, updated, backgroundColor) {
  return createExcalidrawElementBase({
    id,
    type: "rectangle",
    x,
    y,
    width,
    height,
    seed,
    versionNonce,
    updated,
    extra: {
      backgroundColor,
    },
  });
}

function createExcalidrawText(id, x, y, text, seed, versionNonce, updated) {
  const normalizedText = sanitizeDiagramText(text);
  return createExcalidrawElementBase({
    id,
    type: "text",
    x,
    y,
    width: 260,
    height: 80,
    seed,
    versionNonce,
    updated,
    extra: {
      backgroundColor: "transparent",
      fontSize: 16,
      fontFamily: 5,
      text: normalizedText,
      textAlign: "left",
      verticalAlign: "top",
      baseline: 72,
      containerId: null,
      originalText: normalizedText,
      lineHeight: 1.25,
    },
  });
}

function createExcalidrawArrow(id, x, y, width, height, seed, versionNonce, updated) {
  return createExcalidrawElementBase({
    id,
    type: "arrow",
    x,
    y,
    width,
    height,
    seed,
    versionNonce,
    updated,
    extra: {
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: "arrow",
      points: [
        [0, 0],
        [width, height],
      ],
      lastCommittedPoint: null,
    },
  });
}

export function buildObsidianVisualVerdictExcalidrawMarkdown(viewModel = {}) {
  const updated = Date.parse(String(viewModel.generatedAt || "")) || Date.now();
  const branches = Array.isArray(viewModel.verdictBranches) && viewModel.verdictBranches.length > 0
    ? viewModel.verdictBranches
    : [];
  const first = branches[0] || {};
  const second = branches[1] || {};
  const third = branches[2] || {};
  const elements = [
    createExcalidrawRect("root-rect", 20, 20, 320, 100, 101, 1001, updated, "#a5d8ff"),
    createExcalidrawText("root-text", 36, 34, `当前结论\n${viewModel.headline || "-"}`, 102, 1002, updated),
    createExcalidrawRect("decision-rect", 400, 20, 320, 100, 103, 1003, updated, "#fff3bf"),
    createExcalidrawText("decision-text", 416, 34, `人工判定\n默认下一步: ${viewModel.nextAction || "-"}`, 104, 1004, updated),
    createExcalidrawRect("branch-expected", 780, -120, 320, 110, 105, 1005, updated, "#b2f2bb"),
    createExcalidrawText("branch-expected-text", 796, -106, `${first.verdict || "预期 UI 变化"}\n状态=${first.status || "-"} 模式=${first.mode || "-"}\n${first.nextAction || "-"}`, 106, 1006, updated),
    createExcalidrawRect("branch-regression", 780, 40, 320, 110, 107, 1007, updated, "#ffc9c9"),
    createExcalidrawText("branch-regression-text", 796, 54, `${second.verdict || "真实回归"}\n状态=${second.status || "-"} 模式=${second.mode || "-"}\n${second.nextAction || "-"}`, 108, 1008, updated),
    createExcalidrawRect("branch-evidence", 780, 200, 320, 110, 109, 1009, updated, "#ffd8a8"),
    createExcalidrawText("branch-evidence-text", 796, 214, `${third.verdict || "证据不足"}\n状态=${third.status || "-"} 模式=${third.mode || "-"}\n${third.nextAction || "-"}`, 110, 1010, updated),
    createExcalidrawArrow("arrow-root-decision", 340, 70, 60, 0, 111, 1011, updated),
    createExcalidrawArrow("arrow-decision-expected", 720, 60, 60, -110, 112, 1012, updated),
    createExcalidrawArrow("arrow-decision-regression", 720, 70, 60, 20, 113, 1013, updated),
    createExcalidrawArrow("arrow-decision-evidence", 720, 80, 60, 170, 114, 1014, updated),
  ];
  const jsonData = {
    type: "excalidraw",
    version: 2,
    source: "https://github.com/zsviczian/obsidian-excalidraw-plugin",
    elements,
    appState: {
      gridSize: null,
      viewBackgroundColor: "#ffffff",
    },
    files: {},
  };

  return [
    "---",
    "excalidraw-plugin: parsed",
    "tags: [excalidraw]",
    "---",
    "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'",
    "",
    "# Excalidraw Data",
    "",
    "## Text Elements",
    "%%",
    "## Drawing",
    "```json",
    JSON.stringify(jsonData, null, 2),
    "```",
    "%%",
  ].join("\n");
}

export function buildObsidianInterventionMarkdown(summary) {
  const blockers = truncateList(summary.blockers, 8);
  const candidateFiles = truncateList(summary.candidateFiles, 8);
  const commands = truncateList(summary.commands, 8);
  const visualEvidenceItems = normalizeVisualEvidenceItems(summary.visualEvidenceItems, 3);
  const visualAttemptDiagnosisItems = normalizeVisualCaptureAttemptDiagnosisItems(summary.visualCaptureAttemptDiagnosisItems, 3);
  const patchSummary = summary.patchSummary && typeof summary.patchSummary === "object"
    ? summary.patchSummary
    : {};
  const patchActionDisplay = buildPatchActionDisplay(summary);
  const patchPriorityNote = buildPatchPriorityNote(summary);
  const exhaustedStageSummary = buildVisualExhaustedStageSummary(summary);
  const manualVerdictStage = isManualReaderVerdictStage(summary);

  const lines = [
    "---",
    `generated_at: ${summary.generatedAt}`,
    `status_label: ${summary.statusLabel || "待人工介入"}`,
    `next_action: "${String(summary.nextAction || "-").replaceAll('"', "'")}"`,
    "type: zotero-agent-status",
    "---",
    "",
    "# Zotero Agent 当前状态总览",
    "",
    "> [!summary] 自动化当前判断",
    `> 状态：${summary.statusLabel || "待人工介入"}`,
    `> 结论：${summary.headline || "-"}`,
    `> 下一步：\`${summary.nextAction || "-"}\``,
    "",
  ];

  if (manualVerdictStage) {
    lines.splice(lines.length - 1, 0, "> 当前阶段：等待人工 Reader verdict");
  }

  if (summary.diagnosisLabel || summary.diagnosis) {
    lines.push("> [!note] 主诊断");
    if (summary.diagnosisLabel) {
      lines.push(`> 功能：${summary.diagnosisLabel}`);
    }
    if (summary.diagnosis) {
      lines.push(`> 说明：${summary.diagnosis}`);
    }
    lines.push("");
  }

  if (summary.readerHostStateSummary || summary.readerHostStateNote) {
    lines.push("## Reader 深层宿主状态", "");
    lines.push(`- 状态摘要：${summary.readerHostStateSummary || "-"}`);
    lines.push(`- 备注：${summary.readerHostStateNote || "-"}`);
    lines.push("");
  }

  if (
    summary.toolbarEvidenceSummary
    || summary.visualEvidenceSummary
    || summary.visualCaptureAttemptDiagnosisSummary
    || summary.visualCaptureStabilitySummary
    || summary.visualPrimaryBlockerSummary
    || summary.readerDispatchSummary
    || summary.contextMenuSummary
  ) {
    lines.push("## Reader 事件点分发", "");
    lines.push(`- Toolbar 证据：${summary.toolbarEvidenceSummary || "-"}`);
    lines.push(`- 视觉证据：${summary.visualEvidenceSummary || "-"}`);
    lines.push(`- 证据导航：${summary.visualEvidenceFocusSummary || "-"}`);
    lines.push(`- Attempt 诊断：${summary.visualCaptureAttemptDiagnosisSummary || "-"}`);
    lines.push(`- 视觉采集稳定性：${summary.visualCaptureStabilitySummary || "-"}`);
    lines.push(`- 用尽预算 stage：${exhaustedStageSummary || "-"}`);
    lines.push(`- 视觉主阻断：${summary.visualPrimaryBlockerSummary || "-"}`);
    lines.push(`- 视觉几何摘要：${summary.visualGeometrySummary || "-"}`);
    lines.push(`- Canonical 覆盖摘要：${summary.visualCanonicalCoverageSummary || "-"}`);
    lines.push(`- Canonical 未对齐目标：${truncateList(summary.visualCanonicalMismatchedTargets, 8).join("、") || "-"}`);
    lines.push(`- 分发摘要：${summary.readerDispatchSummary || "-"}`);
    lines.push(`- 上下文菜单：${summary.contextMenuSummary || "-"}`);
    lines.push("");
  }

  if (summary.visualEvidenceFocusSummary || visualEvidenceItems.length > 0) {
    lines.push("## 视觉证据导航", "");
    lines.push(`- 导航摘要：${summary.visualEvidenceFocusSummary || summary.visualEvidenceSummary || "-"}`);
    lines.push(`- 失败证据项：${summary.visualEvidenceFailingItemCount ?? 0} / ${summary.visualEvidenceItemCount ?? 0}`);
    visualEvidenceItems.forEach((item) => {
      lines.push(`- ${formatVisualEvidenceItemLabel(item)} | Capture: ${toMarkdownLink(item.capturePath)} | Baseline: ${toMarkdownLink(item.baselinePath)}`);
    });
    lines.push("- 详见：[[02-Zotero-Agent-证据索引]]", "");
  }

  if (summary.visualCaptureAttemptDiagnosisSummary || visualAttemptDiagnosisItems.length > 0) {
    lines.push("## Capture Attempt 诊断", "");
    lines.push(`- 摘要：${summary.visualCaptureAttemptDiagnosisSummary || "-"}`);
    visualAttemptDiagnosisItems.forEach((item) => {
      const selectionReasonLabel = item.selectionReason
        ? `${pickVisualCaptureSelectionReasonLabel(item.selectionReason)} (${item.selectionReason})`
        : "-";
      lines.push(`- ${formatAttemptDiagnosisItemLabel(item)} | 原因: ${selectionReasonLabel} | 已选: ${item.selectedAttempt ?? "-"} / ${item.attemptCount ?? 0} | Hash 全变: ${formatAttemptDiagnosisBoolean(item.allHashesUnique)} | Bounds 固定: ${formatAttemptDiagnosisBoolean(item.boundsStable)} | 光栅固定: ${formatAttemptDiagnosisBoolean(item.rasterSizeStable)}`);
    });
    lines.push("- 详见：[[02-Zotero-Agent-证据索引]]", "");
  }

  lines.push("## 自动阻塞项", "");
  if (blockers.length === 0) {
    lines.push("- 当前没有明确阻塞项，优先复核 gate 与 loop 是否一致。");
  } else {
    blockers.forEach((item) => lines.push(`- ${item}`));
  }

  lines.push("", "## 推荐命令", "");
  commands.forEach((item) => lines.push(`- \`${item}\``));

  lines.push("", "## 候选文件", "");
  if (candidateFiles.length === 0) {
    lines.push("- 暂无候选文件");
  } else {
    candidateFiles.forEach((item) => lines.push(`- \`${item}\``));
  }

  lines.push("", "## 受限补丁摘要", "");
  if (!patchSummary.planStatusLabel && !patchSummary.applicationStatusLabel && !patchSummary.unsupportedCategoryLabel) {
    lines.push(shouldPrioritizeVisualEvidence(summary)
      ? "- 当前先人工复核视觉证据，不默认执行历史补丁动作。"
      : "- 当前没有可用的补丁摘要。");
  } else {
    lines.push(`- 补丁计划：${patchSummary.planStatusLabel || "-"}`);
    lines.push(`- 补丁功能：${patchSummary.featureLabel || "-"}`);
    lines.push(`- 补丁动作：${patchActionDisplay}`);
    lines.push(`- 补丁应用：${patchSummary.applicationStatusLabel || "-"}`);
    lines.push(`- 未进入白名单：${patchSummary.unsupportedCategoryLabel || "-"}`);
    lines.push(`- 阻塞说明：${patchSummary.unsupportedReason || "-"}`);
    lines.push(`- 路径提示：${patchPriorityNote || "-"}`);
    lines.push(`- 复验合同：${patchSummary.verificationSummary || "-"}`);
    lines.push(`- 复验总览：${patchSummary.verificationOverview || "-"}`);
    lines.push(`- 必需失败项：${patchSummary.failedRequiredChecks || "-"}`);
    lines.push(`- 观察失败项：${patchSummary.failedOptionalChecks || "-"}`);
    lines.push(`- 失败类型画像：${patchSummary.failedCheckKinds || "-"}`);
    if (Array.isArray(patchSummary.blockers) && patchSummary.blockers.length > 0) {
      lines.push("- 补丁阻塞：");
      patchSummary.blockers.forEach((item) => lines.push(`- ${item}`));
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function buildObsidianEvidenceMarkdown(summary) {
  const evidenceLinks = truncateList(summary.evidenceLinks, 12);
  const visualEvidenceItems = normalizeVisualEvidenceItems(summary.visualEvidenceItems, 12);
  const visualAttemptDiagnosisItems = normalizeVisualCaptureAttemptDiagnosisItems(summary.visualCaptureAttemptDiagnosisItems, 12);
  const lines = [
    "---",
    `generated_at: ${summary.generatedAt}`,
    "type: zotero-agent-evidence-index",
    "---",
    "",
    "# Zotero Agent 证据索引",
    "",
    "## 当前证据",
    "",
  ];

  evidenceLinks.forEach((item) => {
    lines.push(`- [[${item}]]`);
  });

  lines.push("", "## 当前视觉证据导航", "");
  if (visualEvidenceItems.length === 0) {
    lines.push(`- ${summary.visualEvidenceFocusSummary || "当前没有需要展开的失败视觉证据条目。"}`);
  } else {
    visualEvidenceItems.forEach((item) => {
      const metrics = [
        Number.isFinite(Number(item.changedRatio)) ? `漂移 ${(Number(item.changedRatio) * 100).toFixed(2)}%` : null,
        Number.isFinite(Number(item.meanChannelDiff)) ? `均差 ${Number(item.meanChannelDiff).toFixed(2)}` : null,
      ].filter(Boolean).join(" / ") || "-";
      lines.push(`- ${formatVisualEvidenceItemLabel(item)} | Capture: ${toMarkdownLink(item.capturePath)} | Baseline: ${toMarkdownLink(item.baselinePath)} | 指标: ${metrics} | 问题: ${truncateList(item.issues, 4).join("；") || "-"}`);
    });
  }

  lines.push("", "## 当前 Capture Attempt 诊断", "");
  lines.push(`- 摘要：${summary.visualCaptureAttemptDiagnosisSummary || "当前没有可展开的 stage attempt 诊断。"}`);
  if (visualAttemptDiagnosisItems.length > 0) {
    visualAttemptDiagnosisItems.forEach((item) => {
      const selectionReasonLabel = item.selectionReason
        ? `${pickVisualCaptureSelectionReasonLabel(item.selectionReason)} (${item.selectionReason})`
        : "-";
      lines.push(`- ${formatAttemptDiagnosisItemLabel(item)} | 原因: ${selectionReasonLabel} | 已选: ${item.selectedAttempt ?? "-"} / ${item.attemptCount ?? 0} | Hash 全变: ${formatAttemptDiagnosisBoolean(item.allHashesUnique)} | Bounds 固定: ${formatAttemptDiagnosisBoolean(item.boundsStable)} | 光栅固定: ${formatAttemptDiagnosisBoolean(item.rasterSizeStable)}`);
      lines.push(`- Attempt Hashes: ${formatAttemptDiagnosisList(item.attemptHashes)}`);
      lines.push(`- Attempt Bounds: ${formatAttemptDiagnosisList(item.attemptBounds)}`);
      lines.push(`- Attempt Raster Sizes: ${formatAttemptDiagnosisList(item.attemptRasterSizes)}`);
      lines.push(`- Stability Metrics: ${formatAttemptDiagnosisMetrics(item.stabilityMetrics)}`);
    });
  }

  lines.push(
    "",
    "## 人工介入入口",
    "",
    "- [[03-Zotero-Agent-人工快速上手]]",
    "- [[04-Zotero-Agent-高级介入规范]]",
    "- [[10-Zotero-Agent-人工指令窗口]]",
    "- [[01-Zotero-Agent-当前状态总览]]",
    "",
  );
  return lines.join("\n");
}

export function buildHumanQuickstartMarkdown() {
  return [
    "---",
    "type: zotero-agent-human-quickstart",
    "audience: human-only",
    "agent_reading: disabled",
    "---",
    "",
    "# Zotero Agent 人工快速上手",
    "",
    "> [!abstract] 这份笔记适合谁",
    "> 这是一份给新进入项目的人看的快速上手说明，帮助你先理解工作台、掌握最短操作路径，再决定是否需要人工介入。",
    ">",
    "> agent 不会把这份说明当作执行输入；真正会被读取的是 `10-Zotero-Agent-人工指令窗口.md` 中的保留编辑区。",
    "",
    "> [!tip] 一句话理解整套链路",
    "> agent 先自动构建与验证，人工只在需要时介入判断和定向，随后 agent 再根据人工修改继续推进。",
    "",
    "## 快速入口",
    "",
    "> [!info] 先从这里开始",
    "> - 当前状态：[[01-Zotero-Agent-当前状态总览]]",
    "> - 项目白板：[[00-Zotero-Agent-项目架构与闭环]]",
    "> - 证据索引：[[02-Zotero-Agent-证据索引]]",
    "> - 高级规范：[[04-Zotero-Agent-高级介入规范]]",
    "> - 人工输入窗口：[[10-Zotero-Agent-人工指令窗口]]",
    "",
    "## 工作台文件怎么用",
    "",
    "| 文件 | 作用 | 建议用法 |",
    "| --- | --- | --- |",
    "| `00-Zotero-Agent-项目架构与闭环.canvas` | 看整体结构、自动链路、人工入口、证据关系 | 先建立全局理解，再决定要不要介入 |",
    "| `01-Zotero-Agent-当前状态总览.md` | 看当前状态、阻塞项、建议动作 | 先读这个，快速判断是不是需要人工接管 |",
    "| `02-Zotero-Agent-证据索引.md` | 跳转到报告和证据工件 | 当你需要核对日志、报告、旧结论时再下钻 |",
    "| `04-Zotero-Agent-高级介入规范.md` | 看字段语义、介入边界、规范建议 | 当你要正式接管一轮路径时再读 |",
    "| `10-Zotero-Agent-人工指令窗口.md` | 唯一的人机协作输入窗口 | 只在这里写状态、下一步指令、关注文件、备注 |",
    "",
    "## 推荐操作顺序",
    "",
    "> [!check] 建议按这个顺序使用",
    "> 1. 先看 `01-Zotero-Agent-当前状态总览.md`，判断现在卡在哪。",
    "> 2. 再看 `00-Zotero-Agent-项目架构与闭环.canvas`，确认问题处于哪一层。",
    "> 3. 需要深挖时，去 `02-Zotero-Agent-证据索引.md` 找对应报告。",
    "> 4. 如果你准备正式介入，再读一遍 `04-Zotero-Agent-高级介入规范.md`。",
    "> 5. 只有当你确定要改变本轮路径时，才去修改 `10-Zotero-Agent-人工指令窗口.md`。",
    "> 6. 修改完成后，再让 agent 进入下一轮执行。",
    "",
    "## 介入前检查清单",
    "",
    "> [!check] 修改人工指令前，建议先确认",
    "> - 你已经读过当前状态总览，而不是只看标题就下判断。",
    "> - 你能明确说出这轮想让 agent 先做什么。",
    "> - 你知道要改的是“执行路径”，而不是随手记一点想法。",
    "> - 你的下一步指令最好能落到现有脚本命令或明确文件路径。",
    "",
    "## Reader Verdict 三模板",
    "",
    "> [!important] 当前阶段如果显示“等待人工 Reader verdict”",
    "> 仍然只改 `10-Zotero-Agent-人工指令窗口.md` 里的 5 个字段：`状态 / 模式 / 下一步指令 / 关注文件 / 备注`。",
    "> 不要新增第二套输入方式，也不要把 Mermaid / Excalidraw 当成新的 verdict 来源。",
    "",
    "### 模板 1：预期 UI 变化",
    "",
    "```text",
    "状态: ready",
    "模式: force-next",
    "下一步指令: npm run agent:zotero:e2e:update-baseline",
    "关注文件:",
    "备注: 人工确认属于预期 UI 变化；仅执行一次受控 baseline refresh。",
    "```",
    "",
    "### 模板 2：真实回归",
    "",
    "```text",
    "状态: hold",
    "模式: hold",
    "下一步指令:",
    "关注文件: src/features/reader.js, zotero-scenarios/baseline.scenario.js",
    "备注: 人工确认属于真实回归；补充差异说明后再由 Codex 新开最小修复批次。",
    "```",
    "",
    "### 模板 3：证据不足",
    "",
    "```text",
    "状态: hold",
    "模式: hold",
    "下一步指令:",
    "关注文件:",
    "备注: 当前证据不足；请先补齐缺失截图、日志或 scenario 证据，不直接刷新 baseline。",
    "```",
    "",
    "## 什么时候建议人工介入",
    "",
    "- 自动报告给出的下一步过于笼统，你已经知道更具体的命令。",
    "- 你想优先检查某几个文件，而不是让 agent 继续大范围试探。",
    "- 你需要暂时暂停当前回合，先人工核对设计、日志或产品方向。",
    "- 你发现自动结论和真实情况不一致，需要人为纠偏。",
    "",
    "## 什么时候不建议人工介入",
    "",
    "> [!warning] 能不打断就先别打断",
    "> 如果当前只是常规的 watch 刷新、E2E 补跑、monitor/gate 重建，通常让 agent 先自动继续更高效。",
    "",
    "- 你还没看完状态总览，就直接改下一步指令。",
    "- 你只是“感觉不对”，但没有明确目标命令或关注文件。",
    "- 你想把临时想法写进输入区，但并不打算改变这一轮执行路径。",
    "",
    "## 常见人工介入场景",
    "",
    "### 场景 1：只想让 agent 自动继续",
    "",
    "- 保持 `状态: pending`",
    "- 保持 `模式: auto`",
    "- 不填写 `下一步指令`",
    "",
    "### 场景 2：你已经知道应该先补跑哪个命令",
    "",
    "- 把 `状态` 改成 `ready`",
    "- 把 `模式` 改成 `force-next`",
    "- 在 `下一步指令` 里写明确命令",
    "",
    "### 场景 3：你要先人工看设计或日志，暂时不要继续",
    "",
    "- 把 `状态` 改成 `hold`",
    "- 把 `模式` 改成 `hold`",
    "- 在 `备注` 里写明暂停原因",
    "",
    "## 常见误区",
    "",
    "- 把分析过程直接写进 `下一步指令`。",
    "- 把“希望 agent 多想想”当作有效输入。",
    "- 明明只想补背景，却直接改了输入窗口。",
    "- 没看高级规范就开始改字段，导致语义冲突。",
    "",
    "> [!note] 最后提醒",
    "> 如果你不想介入，就不要改输入窗口。让 agent 自动继续，本身就是这套框架的默认正确用法。",
    "> 如果你准备正式接管一轮执行路径，请继续阅读 [[04-Zotero-Agent-高级介入规范]]。",
    "",
  ].join("\n");
}

export function buildHumanAdvancedGuideMarkdown() {
  return [
    "---",
    "type: zotero-agent-human-advanced-guide",
    "audience: human-only",
    "agent_reading: disabled",
    "---",
    "",
    "# Zotero Agent 高级介入规范",
    "",
    "> [!important] 这份笔记适合什么时候看",
    "> 当你准备正式改写本轮执行路径、暂停自动链路，或需要给 agent 更高质量的人工判断时，再看这份规范。",
    "",
    "> [!info] 快速跳转",
    "> - 回到快速上手：[[03-Zotero-Agent-人工快速上手]]",
    "> - 当前状态：[[01-Zotero-Agent-当前状态总览]]",
    "> - 人工输入窗口：[[10-Zotero-Agent-人工指令窗口]]",
    "",
    "## 哪些内容不要改",
    "",
    "> [!danger] 这些区域不要手动改",
    "> - `01-Zotero-Agent-当前状态总览.md` 里的自动摘要",
    "> - `02-Zotero-Agent-证据索引.md` 的自动生成列表",
    "> - `10-Zotero-Agent-人工指令窗口.md` 中 `## 人工编辑区（保留）` 之前的自动摘要说明",
    "> - `.canvas` 白板里的自动节点文本，除非你明确只是在做人类笔记副本",
    "",
    "- 如果你想记录人工分析，请优先写在自己的 Obsidian 笔记里，或在白板另建人工节点。",
    "- 如果你只想提醒团队，不想改变本轮执行路径，不要去改 agent 的输入窗口。",
    "",
    "## 字段语义说明",
    "",
    "### `状态`",
    "",
    "- `pending`：默认值，表示暂不介入。",
    "- `ready`：表示你已给出明确人工判断，可以让 agent 按你的判断继续。",
    "- `skip`：表示本轮可以跳过人工动作，但通常仍建议保留 `pending`。",
    "- `hold`：表示先停住，等待你进一步确认。",
    "",
    "### `模式`",
    "",
    "- `auto`：不改自动路径。",
    "- `force-next`：强制把你写的“下一步指令”提到本轮优先级前面。",
    "- `hold`：直接暂停本轮，让 agent 不再继续执行后续动作。",
    "",
    "### `下一步指令`",
    "",
    "> [!tip] 最好写成已有脚本命令",
    "> 推荐写成明确、可执行、仓库内已存在的命令，比如：`npm run agent:zotero:watch-recovery`。",
    "",
    "- 好的写法：`npm run agent:zotero:autofix`",
    "- 好的写法：`npm run agent:gate`",
    "- 不好的写法：`先看看问题`",
    "- 不好的写法：`修一下 item pane`",
    "- 当前如果处于 Reader verdict 收尾阶段，`force-next` 只建议配合 `npm run agent:zotero:e2e:update-baseline` 做一次受控 baseline refresh。",
    "",
    "### `关注文件`",
    "",
    "- 写你希望 agent 优先关注的路径，多个文件用逗号分隔。",
    "- 尽量写到文件级，不要只写一个很大的目录。",
    "- 如果你已经通过日志锁定范围，这里就是最有价值的补充信息。",
    "",
    "### `备注`",
    "",
    "- 适合写判断依据、边界条件、你不希望 agent 误解的限制。",
    "- 备注不是命令，不要把模糊操作写在这里只希望 agent 自己猜。",
    "",
    "## 介入规范建议",
    "",
    "> [!important] 三条核心原则",
    "> 1. 一次只改一个主方向，避免同时给出多个相互竞争的目标。",
    "> 2. 优先写“可执行命令 + 关注文件 + 简短原因”，不要只写抽象判断。",
    "> 3. 如果你只是补充背景，不想打断自动化，就把信息写在本笔记或白板里，不要改输入窗口。",
    "",
    "- 建议把“判断”和“动作”分开写，动作放输入窗口，背景分析留在人工笔记或白板里。",
    "- 建议优先使用仓库已有脚本，避免临时命令让后续复现变差。",
    "- 建议在 `补充记录` 里留下这次介入原因，方便下一轮回看。",
    "- 建议只在确定要改变本轮路径时，把 `状态` 从 `pending` 改掉。",
    "",
    "## 推荐模板",
    "",
    "```text",
    "状态: ready",
    "模式: force-next",
    "下一步指令: npm run agent:zotero:watch-recovery",
    "关注文件: src/app/plugin.js, scripts/zotero-watch-recovery-regression.mjs",
    "备注: 先验证恢复链，再决定是否进入 autofix。",
    "```",
    "",
    "## Reader Verdict 专用模板",
    "",
    "> [!important] 只在当前阶段显示“等待人工 Reader verdict”时使用",
    "> 继续只改 5 个字段：`状态 / 模式 / 下一步指令 / 关注文件 / 备注`。",
    "",
    "### 1. 预期 UI 变化",
    "",
    "```text",
    "状态: ready",
    "模式: force-next",
    "下一步指令: npm run agent:zotero:e2e:update-baseline",
    "关注文件:",
    "备注: 人工确认属于预期 UI 变化；只做一次受控 baseline refresh。",
    "```",
    "",
    "### 2. 真实回归",
    "",
    "```text",
    "状态: hold",
    "模式: hold",
    "下一步指令:",
    "关注文件: src/features/reader.js, zotero-scenarios/baseline.scenario.js",
    "备注: 人工确认属于真实回归；补充差异说明，再由 Codex 新开最小修复批次。",
    "```",
    "",
    "### 3. 证据不足",
    "",
    "```text",
    "状态: hold",
    "模式: hold",
    "下一步指令:",
    "关注文件:",
    "备注: 证据不足；补齐缺失截图、日志或 scenario 证据，不直接刷新 baseline。",
    "```",
    "",
    "## 高级介入常见误区",
    "",
    "- 同时改 `状态`、`模式`、`下一步指令`，但三者语义互相冲突。",
    "- 想表达“暂停”，却只改了 `状态` 没改 `模式`。",
    "- 想表达“优先执行某命令”，却没有把 `模式` 改成 `force-next`。",
    "- 在保留编辑区外修改自动摘要，并期待这些内容会被保留。",
    "",
    "> [!note] 最后提醒",
    "> 高级介入的目标不是替代自动化，而是在自动化不够精确时，给它一个更清晰、更可执行的方向。",
    "",
  ].join("\n");
}

export function buildObsidianInterventionCanvas(summary) {
  const visualModel = buildObsidianVisualViewModel(summary);
  const blockerText = truncateList(visualModel.blockers, 4);
  const fileText = truncateList(visualModel.candidateFiles, 5);
  const commandText = truncateList(visualModel.commands, 5);
  const patchSummary = visualModel.patchSummary && typeof visualModel.patchSummary === "object"
    ? visualModel.patchSummary
    : {};
  const patchText = [
    `计划：${patchSummary.planStatusLabel || "-"}`,
    `功能：${patchSummary.featureLabel || "-"}`,
    `动作：${buildPatchActionDisplay(visualModel)}`,
    `应用：${patchSummary.applicationStatusLabel || "-"}`,
    `白名单阻塞：${patchSummary.unsupportedCategoryLabel || "-"}`,
    `阻塞说明：${buildPatchPriorityNote(visualModel) || patchSummary.unsupportedReason || "-"}`,
    `复验：${patchSummary.verificationOverview || "-"}`,
    `必需失败：${patchSummary.failedRequiredChecks || "-"}`,
    `观察失败：${patchSummary.failedOptionalChecks || "-"}`,
    `类型画像：${patchSummary.failedCheckKinds || "-"}`,
    `阻塞：${truncateList(patchSummary.blockers, 2).join("；") || "-"}`,
  ];

  const nodes = [
    makeNode(
      "root0001",
      0,
      0,
      360,
      180,
      `项目架构与闭环\n\n状态：${visualModel.statusLabel || "待人工介入"}\n结论：${visualModel.headline || "-"}`,
      "2",
    ),
    makeNode(
      "plugin002",
      -40,
      260,
      320,
      180,
      "插件本体\n\nsrc/\naddon-static/\nconfig/\ntypes/",
      "5",
    ),
    makeNode(
      "agent003",
      380,
      250,
      320,
      220,
      "Agent 自动构建链\n\nbuild -> watch/e2e -> autofix -> monitor -> gate -> loop",
      "4",
    ),
    makeNode(
      "human004",
      780,
      0,
      340,
      240,
      "人工介入窗口\n\n10-Zotero-Agent-人工指令窗口.md\n\n如果人工不介入，agent 按自动路径继续。\n如果人工填写下一步指令，agent 以人工指令修正本轮路径。",
      "3",
    ),
    makeNode(
      "guide008",
      780,
      -280,
      340,
      220,
      "人工指南双笔记\n\n03-Zotero-Agent-人工快速上手.md\n04-Zotero-Agent-高级介入规范.md\n\n先看快速上手，再按需要阅读高级规范。",
      "4",
    ),
    makeNode(
      "evidence05",
      790,
      290,
      340,
      220,
      `证据与候选文件\n\n${visualModel.visualEvidenceFocusSummary || "暂无视觉导航摘要"}\n\n${fileText.length === 0 ? "暂无候选文件" : fileText.map((item) => `- ${item}`).join("\n")}`,
      "6",
    ),
    makeNode(
      "path0006",
      1180,
      0,
      320,
      220,
      `下一步路径\n\n${visualModel.nextAction || "-"}\n\n${commandText.map((item) => `- ${item}`).join("\n")}`,
      "4",
    ),
    makeNode(
      "block007",
      1180,
      270,
      340,
      220,
      `当前阻塞\n\n${blockerText.length === 0 ? "暂无明确阻塞项" : blockerText.map((item) => `- ${item}`).join("\n")}`,
      "1",
    ),
    makeNode(
      "patch009",
      380,
      520,
      360,
      220,
      `补丁摘要\n\n${patchText.join("\n")}`,
      "6",
    ),
  ];

  const edges = [
    makeEdge("edge0001", "plugin002", "agent003", "构建"),
    makeEdge("edge0002", "agent003", "human004", "人工窗口"),
    makeEdge("edge0003", "human004", "path0006", "修改路径"),
    makeEdge("edge0004", "agent003", "path0006", "自动继续"),
    makeEdge("edge0005", "agent003", "evidence05", "产出证据"),
    makeEdge("edge0006", "evidence05", "block007", "定位问题"),
    makeEdge("edge0007", "root0001", "plugin002", "项目层"),
    makeEdge("edge0008", "root0001", "agent003", "自动链"),
    makeEdge("edge0009", "guide008", "human004", "先读再改"),
    makeEdge("edge0010", "root0001", "guide008", "人工说明"),
    makeEdge("edge0011", "agent003", "patch009", "补丁计划"),
    makeEdge("edge0012", "patch009", "block007", "阻塞细化"),
  ];

  return {
    nodes,
    edges,
  };
}

export function buildHumanInterventionWindowMarkdown(summary, existingContent = "") {
  const preservedHumanSection = extractHumanEditableSection(existingContent);
  const patchSummary = summary.patchSummary && typeof summary.patchSummary === "object"
    ? summary.patchSummary
    : {};
  const patchActionDisplay = buildPatchActionDisplay(summary);
  const patchPriorityNote = buildPatchPriorityNote(summary);
  const exhaustedStageSummary = buildVisualExhaustedStageSummary(summary);
  const manualVerdictStage = isManualReaderVerdictStage(summary);

  const lines = [
    "---",
    `generated_at: ${summary.generatedAt}`,
    `status_label: ${summary.statusLabel || "待人工介入"}`,
    "type: zotero-agent-human-window",
    "---",
    "",
    "# Zotero Agent 人工指令窗口",
    "",
    "## 自动摘要（每次刷新会更新）",
    "",
    `- 当前状态：${summary.statusLabel || "待人工介入"}`,
    `- 自动结论：${summary.headline || "-"}`,
    `- 自动下一步：\`${summary.nextAction || "-"}\``,
    `- 当前阶段：${manualVerdictStage ? "等待人工 Reader verdict" : "按自动路径继续"}`,
    `- 视觉导航：${summary.visualEvidenceFocusSummary || "暂无"}`,
    `- Attempt 诊断：${summary.visualCaptureAttemptDiagnosisSummary || "暂无"}`,
    `- 视觉采集稳定性：${summary.visualCaptureStabilitySummary || "-"}`,
    `- 视觉主阻断：${summary.visualPrimaryBlockerSummary || "-"}`,
    `- 用尽预算 stage：${exhaustedStageSummary || "暂无"}`,
    `- 证据入口：[[02-Zotero-Agent-证据索引]]`,
    `- 候选文件：${truncateList(summary.candidateFiles, 6).join("、") || "暂无"}`,
    `- 补丁计划：${patchSummary.planStatusLabel || "暂无"}`,
    `- 补丁动作：${patchActionDisplay}`,
    `- 补丁应用：${patchSummary.applicationStatusLabel || "暂无"}`,
    `- 白名单阻塞：${patchSummary.unsupportedCategoryLabel || "暂无"}`,
    `- 阻塞说明：${patchPriorityNote || patchSummary.unsupportedReason || "暂无"}`,
    `- 复验总览：${patchSummary.verificationOverview || "暂无"}`,
    "",
    "## 使用说明",
    "",
    "- 如果你不准备介入，请保持“状态: pending”“模式: auto”。",
    "- 如果你要介入，请只修改下面“人工编辑区（保留）”中的字段。",
    "- `状态` 推荐值：`pending`、`ready`、`skip`、`hold`。",
    "- `模式` 推荐值：`auto`、`force-next`、`hold`。",
    "- `下一步指令` 建议填写一个现有命令，例如 `npm run agent:zotero:autofix`。",
    "- `关注文件` 可填写逗号分隔路径，例如 `src/app/plugin.js, src/features/item-pane.js`。",
    "",
    ...(manualVerdictStage
      ? [
          "## Reader Verdict 推荐模板",
          "",
          "- `预期 UI 变化`：`状态: ready`、`模式: force-next`、`下一步指令: npm run agent:zotero:e2e:update-baseline`。",
          "- `真实回归`：`状态: hold`、`模式: hold`，并补充 `关注文件` 与差异说明；不要直接刷新 baseline。",
          "- `证据不足`：`状态: hold`、`模式: hold`，并在 `备注` 中写明缺失证据项；不要直接刷新 baseline。",
          "",
        ]
      : []),
    preservedHumanSection,
    "",
  ];
  return lines.join("\n");
}
