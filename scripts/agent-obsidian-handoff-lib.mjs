import {
  summarizeAgentContextSnapshot,
} from "./agent-context-lib.mjs";
import {
  buildVisualExhaustedStageSummary,
  buildPureVisualReaderFailureSummary,
  buildVisualPrimaryBlockerSummary,
  summarizeE2EReport,
  pickVisualCaptureSelectionReasonLabel,
} from "./agent-zotero-validation-lib.mjs";
import {
  createCapabilityManifest as createSourceCapabilityManifest,
} from "../src/app/capability-manifest.js";

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

function makeFileNode(id, x, y, width, height, file, color = "4") {
  return {
    id,
    type: "file",
    file,
    x,
    y,
    width,
    height,
    color,
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

function buildDefaultHumanEditableSection() {
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

function extractHumanEditableSection(existingContent) {
  const marker = "## 人工编辑区（保留）";
  if (typeof existingContent !== "string" || !existingContent.includes(marker)) {
    return buildDefaultHumanEditableSection();
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

function hasMeaningfulFrontpage(frontpage) {
  return Boolean(
    frontpage
      && typeof frontpage === "object"
      && (
        String(frontpage?.statusLabel || "").trim()
        || String(frontpage?.headline || "").trim()
        || String(frontpage?.nextAction || "").trim()
      ),
  );
}

function buildCurrentTruthExcerpt(summaryText, max = 3) {
  return String(summaryText || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean)
    .slice(0, max);
}

function summarizeValidationOverrides(record) {
  const payload = record && typeof record === "object" ? record : null;
  const overrides = Array.isArray(payload?.overrides) ? payload.overrides : [];
  const countsByLevel = {
    "visual-required": 0,
    "visual-recommended": 0,
    "visual-not-needed": 0,
  };
  const focusModules = [];
  overrides.forEach((item) => {
    const level = String(item?.decision || item?.level || "").trim();
    if (countsByLevel[level] !== undefined) {
      countsByLevel[level] += 1;
    }
    const matchers = Array.isArray(item?.matchers) ? item.matchers : [];
    matchers.forEach((matcher) => {
      const value = String(matcher || "").trim();
      if (value) {
        focusModules.push(value);
      }
    });
  });
  const summaryParts = [
    `required=${countsByLevel["visual-required"]}`,
    `recommended=${countsByLevel["visual-recommended"]}`,
    `not-needed=${countsByLevel["visual-not-needed"]}`,
  ];
  return {
    present: Boolean(payload),
    missing: !payload,
    overrideCount: overrides.length,
    countsByLevel,
    focusModules: dedupeList(focusModules, 8),
    summary: overrides.length > 0
      ? `项目覆盖 ${overrides.length} 条：${summaryParts.join(" / ")}`
      : payload
        ? "当前未声明项目级 validation override。"
        : "缺少 project-validation-overrides mirror。",
  };
}

function summarizeExpansionWave(record) {
  const payload = record && typeof record === "object" ? record : null;
  const inScopeModules = dedupeList(payload?.inScopeModules, 8);
  const outOfScopeModules = dedupeList(payload?.outOfScopeModules, 8);
  const explicitVisualUpgradeModules = dedupeList(payload?.explicitVisualUpgradeModules, 8);
  const moduleArchetypes = Array.isArray(payload?.moduleArchetypes)
    ? payload.moduleArchetypes
        .map((item) => {
          const moduleName = String(item?.module || item?.path || "").trim();
          const archetype = String(item?.archetype || "").trim();
          return moduleName && archetype ? `${moduleName} -> ${archetype}` : "";
        })
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const currentWaveName = String(payload?.currentWaveName || "").trim();
  const acceptanceTrack = String(payload?.acceptanceTrack || "").trim();
  const active = Boolean(currentWaveName || acceptanceTrack || inScopeModules.length > 0);
  return {
    present: Boolean(payload),
    missing: !payload,
    status: String(payload?.status || (active ? "declared" : "missing")).trim() || "missing",
    currentWaveName: currentWaveName || null,
    acceptanceTrack: acceptanceTrack || null,
    inScopeModules,
    outOfScopeModules,
    explicitVisualUpgradeModules,
    moduleArchetypes,
    summary: active
      ? `${currentWaveName || "未命名 wave"} / ${acceptanceTrack || "未声明 acceptance track"}`
      : payload
        ? "当前尚未声明项目 expansion wave。"
        : "缺少 project-expansion-wave mirror。",
  };
}

function summarizeValidationDecision(decision) {
  const record = decision && typeof decision === "object" ? decision : {};
  return {
    level: String(record.level || "").trim() || null,
    levelLabel: String(record.levelLabel || "").trim() || null,
    decisionSource: String(record.decisionSource || record.source || "").trim() || null,
    matchedDomain: dedupeList(record.matchedDomain, 6),
    matchedProjectOverride: dedupeList(record.matchedProjectOverride, 6),
    requiredChecks: dedupeList(record.requiredChecks, 6),
    requiredEvidence: dedupeList(record.requiredEvidence, 6),
    escalatedByRuntimeSignals: record.escalatedByRuntimeSignals === true,
    deferredEvidenceAction: String(record.deferredEvidenceAction || "").trim() || null,
  };
}

function summarizeAgentContext(record) {
  const summary = summarizeAgentContextSnapshot(record);
  return {
    ...summary,
    missing: !summary.present,
  };
}

function buildProjectContext({
  currentTruthSummary = null,
  currentTruthActiveBatchId = null,
  projectExpansionWave = null,
  projectValidationOverrides = null,
  validationDecision = null,
} = {}) {
  const truthExcerpt = buildCurrentTruthExcerpt(currentTruthSummary, 3);
  const expansionWave = summarizeExpansionWave(projectExpansionWave);
  const validationOverrides = summarizeValidationOverrides(projectValidationOverrides);
  const validation = summarizeValidationDecision(validationDecision);
  return {
    currentTruth: {
      present: Boolean(currentTruthSummary),
      activeBatchId: String(currentTruthActiveBatchId || "").trim() || null,
      excerpt: truthExcerpt,
      summary: truthExcerpt.length > 0
        ? truthExcerpt.join("；")
        : currentTruthSummary
          ? "当前 truth 已存在，但未提取到可展示摘要。"
          : "缺少 CURRENT_BACKLOG 当前摘要。",
    },
    expansionWave,
    validationOverrides,
    validationDecision: validation,
  };
}

function chooseFrontpageSource(sources) {
  const normalized = (Array.isArray(sources) ? sources : [])
    .filter((item) => item && typeof item === "object" && item.frontpage && typeof item.frontpage === "object");
  if (normalized.length === 0) {
    return null;
  }
  return normalized.find((item) => hasMeaningfulFrontpage(item.frontpage)) || normalized[0] || null;
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
  for (const item of normalized) {
    if (extractRunnableAction(item.nextAction)) {
      return item;
    }
  }
  return normalized[0] || null;
}

function chooseFreshestE2ESummary(candidates) {
  const normalized = (Array.isArray(candidates) ? candidates : [])
    .filter((item) => item && typeof item === "object" && item.present !== false);
  if (normalized.length === 0) {
    return {};
  }
  return normalized
    .map((item) => ({
      summary: item,
      generatedAtMs: parseGeneratedAtMs(item.generatedAt),
      richnessScore: scoreE2ESummary(item),
    }))
    .slice()
    .sort((left, right) => {
      const leftDate = left.generatedAtMs === null ? -1 : Number(left.generatedAtMs || 0);
      const rightDate = right.generatedAtMs === null ? -1 : Number(right.generatedAtMs || 0);
      if (rightDate !== leftDate) {
        return rightDate - leftDate;
      }
      return Number(right.richnessScore || 0) - Number(left.richnessScore || 0);
    })[0]?.summary || {};
}

function normalizeSummaryText(value, placeholders = []) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  if (!text || text === "-") {
    return null;
  }
  return placeholders.includes(text) ? null : text;
}

function isDefaultReaderHostStateNote(value) {
  const text = String(value || "").trim();
  return text === "当前报告未采集 Reader 深层宿主状态"
    || text === "Reader interaction diagnostics 场景缺失，暂未读取深层宿主状态。";
}

function isDefaultVisualCanonicalCoverageSummary(value) {
  const text = String(value || "").trim();
  return text.includes("期望 0 项");
}

function hasMeaningfulList(value) {
  return Array.isArray(value) && value.filter(Boolean).length > 0;
}

function hasMeaningfulPrimaryDiagnosis(summary) {
  const diagnosis = summary?.primaryDiagnosis && typeof summary.primaryDiagnosis === "object"
    ? summary.primaryDiagnosis
    : null;
  return Boolean(
    diagnosis
    && (
      normalizeSummaryText(diagnosis.summary)
      || normalizeSummaryText(diagnosis.issue)
      || normalizeSummaryText(diagnosis.featureLabel)
      || normalizeSummaryText(diagnosis.feature)
      || hasMeaningfulList(diagnosis.candidateFiles)
    )
  );
}

function hasMeaningfulReaderHostState(summary) {
  return Boolean(
    summary?.readerHostStateObserved === true
    || normalizeSummaryText(summary?.readerHostStateSummary, ["当前报告未采集 Reader 深层宿主状态"])
    || (normalizeSummaryText(summary?.readerHostStateNote) && !isDefaultReaderHostStateNote(summary?.readerHostStateNote))
  );
}

function hasMeaningfulReaderDeeperEvidence(summary) {
  return Boolean(
    normalizeSummaryText(summary?.toolbarDispatchMode)
    || typeof summary?.toolbarAppendedItemCount === "number"
    || typeof summary?.selectionPopupAppendedItemCount === "number"
    || typeof summary?.sidebarHeaderAppendedItemCount === "number"
    || typeof summary?.contextMenuProbeCount === "number"
    || normalizeSummaryText(summary?.readerDispatchSummary)
    || normalizeSummaryText(summary?.contextMenuSummary)
    || (Array.isArray(summary?.contextMenuObservedTypes) && summary.contextMenuObservedTypes.length > 0)
    || (Array.isArray(summary?.contextMenuSyntheticFallbackTypes) && summary.contextMenuSyntheticFallbackTypes.length > 0)
    || normalizeSummaryText(summary?.toolbarEvidenceSummary)
  );
}

function hasMeaningfulVisualEvidence(summary) {
  return Boolean(
    summary?.visualEvidenceObserved === true
    || hasMeaningfulList(summary?.visualEvidenceItems)
    || normalizeSummaryText(summary?.visualEvidenceSummary)
  );
}

function hasMeaningfulVisualCaptureAttemptDiagnosis(summary) {
  return Boolean(
    summary?.visualCaptureAttemptDiagnosisObserved === true
    || hasMeaningfulList(summary?.visualCaptureAttemptDiagnosisItems)
    || normalizeSummaryText(summary?.visualCaptureAttemptDiagnosisSummary)
  );
}

function hasMeaningfulVisualCaptureStability(summary) {
  return Boolean(
    hasMeaningfulList(summary?.visualCaptureStabilityStages)
    || normalizeSummaryText(summary?.visualCaptureStabilitySummary)
  );
}

function hasMeaningfulVisualBlocker(summary) {
  const canonicalSummary = normalizeSummaryText(summary?.visualCanonicalCoverageSummary);
  return Boolean(
    normalizeSummaryText(summary?.visualPrimaryBlockerKind, ["unknown"])
    || normalizeSummaryText(summary?.visualPrimaryBlockerSummary)
    || normalizeSummaryText(summary?.visualGeometrySummary)
    || (canonicalSummary && !isDefaultVisualCanonicalCoverageSummary(canonicalSummary))
    || hasMeaningfulList(summary?.visualCanonicalMismatchedTargets)
  );
}

function scoreE2ESummary(summary) {
  let score = 0;
  if (parseGeneratedAtMs(summary?.generatedAt) !== null) {
    score += 1000;
  }
  if (hasMeaningfulPrimaryDiagnosis(summary)) {
    score += 100;
  }
  if (hasMeaningfulReaderHostState(summary)) {
    score += 50;
  }
  if (hasMeaningfulReaderDeeperEvidence(summary)) {
    score += 40;
  }
  if (hasMeaningfulVisualEvidence(summary)) {
    score += 35;
  }
  if (hasMeaningfulVisualCaptureAttemptDiagnosis(summary)) {
    score += 30;
  }
  if (hasMeaningfulVisualCaptureStability(summary)) {
    score += 25;
  }
  if (hasMeaningfulVisualBlocker(summary)) {
    score += 20;
  }
  if (hasMeaningfulList(summary?.candidateFiles)) {
    score += 10;
  }
  return score;
}

function sortE2ESummaries(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .filter((item) => item && typeof item === "object" && item.present !== false)
    .slice()
    .sort((left, right) => {
      const leftDate = parseGeneratedAtMs(left?.generatedAt);
      const rightDate = parseGeneratedAtMs(right?.generatedAt);
      if (leftDate !== rightDate) {
        return Number(rightDate === null ? -1 : rightDate) - Number(leftDate === null ? -1 : leftDate);
      }
      return scoreE2ESummary(right) - scoreE2ESummary(left);
    });
}

function pickE2ESummaryBy(candidates, predicate) {
  return sortE2ESummaries(candidates).find((item) => predicate(item)) || {};
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
  if (
    blockerKind === "capture-command-failed"
    || blockerKind === "capture-unstable"
    || blockerKind === "ui-regression-candidate"
  ) {
    return true;
  }
  return blockerKind === "baseline-geometry-mismatch" && coverageKind === "partial";
}

function isManualReaderVerdictStage(summary) {
  if (isActualRegressionRepairStage(summary)) {
    return false;
  }
  return normalizeNextAction(summary?.nextAction) === "npm run agent:obsidian"
    && String(summary?.visualPrimaryBlockerKind || "").trim() === "ui-regression-candidate"
    && String(summary?.visualCanonicalCoverageKind || "").trim() === "complete";
}

function isActualRegressionRepairStage(summary) {
  return summary?.manualVerdictResolved === true
    || String(summary?.currentTruthActiveBatchId || "").trim() === "READER-HIGH-126";
}

function pickHumanStageLabel(summary) {
  if (isManualReaderVerdictStage(summary)) {
    return "等待人工 Reader verdict";
  }
  if (isActualRegressionRepairStage(summary)) {
    return "已确认真实回归，按修复路径继续";
  }
  return "按自动路径继续";
}

function buildPatchActionDisplay(summary) {
  const patchSummary = summary?.patchSummary && typeof summary.patchSummary === "object"
    ? summary.patchSummary
    : {};
  if (shouldPrioritizeVisualEvidence(summary)) {
    return normalizeNextAction(summary?.nextAction) === "npm run agent:zotero:e2e"
      ? "已降级，先复核稳定性并重跑 E2E"
      : isActualRegressionRepairStage(summary)
        ? "已确认真实回归，按 library-only 修复路径继续"
      : "已降级，先人工复核视觉证据";
  }
  return truncateList(patchSummary.draftOperations, 4).join("；") || "暂无";
}

function buildPatchPriorityNote(summary) {
  if (shouldPrioritizeVisualEvidence(summary)) {
    return normalizeNextAction(summary?.nextAction) === "npm run agent:zotero:e2e"
      ? "当前主路径先复核采集稳定性并重跑 E2E，不默认执行历史补丁动作。"
      : isActualRegressionRepairStage(summary)
        ? "当前正式分支已确认真实回归，按 library-only 修复路径继续，并清理旧人工 verdict 残留；不默认执行 baseline refresh、autofix 或 rerun E2E。"
      : isManualReaderVerdictStage(summary)
        ? "当前主路径等待人工 Reader verdict，不默认执行 baseline refresh、autofix 或 rerun E2E。"
        : "当前主路径先处理视觉证据，不默认执行历史补丁动作。";
  }
  return null;
}

function isStaleBaselineRefreshCarryover(parsed) {
  const nextAction = normalizeNextAction(parsed?.nextActionOverride);
  const note = String(parsed?.note || "").trim();
  const focusFiles = Array.isArray(parsed?.focusFiles) ? parsed.focusFiles : [];
  return nextAction === "npm run agent:zotero:e2e:update-baseline"
    || /预期 UI 变化/u.test(note)
    || /baseline refresh/u.test(note)
    || (
      parsed?.status === "ready"
      && parsed?.mode === "force-next"
      && focusFiles.some((item) => String(item || "").includes("visual-baselines/agent-zotero-e2e/"))
    );
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

function resolveHumanEditableSection(summary, existingContent = "") {
  const preservedSection = extractHumanEditableSection(existingContent);
  if (!isActualRegressionRepairStage(summary)) {
    return preservedSection;
  }
  const parsed = parseHumanInterventionWindow(preservedSection);
  return isStaleBaselineRefreshCarryover(parsed)
    ? buildDefaultHumanEditableSection()
    : preservedSection;
}

export function summarizeObsidianInterventionContext(reports = {}) {
  const loop = reports.loop && typeof reports.loop === "object" ? reports.loop : {};
  const gate = reports.gate && typeof reports.gate === "object" ? reports.gate : {};
  const monitor = reports.monitor && typeof reports.monitor === "object" ? reports.monitor : {};
  const e2e = reports.e2e && typeof reports.e2e === "object" ? reports.e2e : {};
  const bootstrapShell = reports.bootstrapShell === true;
  const agentContext = summarizeAgentContext(reports.agentContext);
  const referenceDistillation = agentContext.referenceDistillationRef && typeof agentContext.referenceDistillationRef === "object"
    ? agentContext.referenceDistillationRef
    : {
      status: "idle",
      pendingCount: 0,
      lastTopic: null,
      lastDistilledAt: null,
      nextSuggestedAction: "继续优先走 REFERENCE_INDEX 路由。",
    };

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
  const gateE2E = gate.zoteroValidation?.e2e && typeof gate.zoteroValidation.e2e === "object"
    ? gate.zoteroValidation.e2e
    : {};
  const directE2E = summarizeE2EReport(e2e);
  const e2eCandidates = [
    directE2E,
    gateE2E,
    monitorE2E,
  ];
  const freshestE2E = chooseFreshestE2ESummary(e2eCandidates);
  const primaryDiagnosisSource = pickE2ESummaryBy(e2eCandidates, hasMeaningfulPrimaryDiagnosis);
  const readerHostStateSource = pickE2ESummaryBy(e2eCandidates, hasMeaningfulReaderHostState);
  const readerDeeperSource = pickE2ESummaryBy(e2eCandidates, hasMeaningfulReaderDeeperEvidence);
  const visualEvidenceSource = pickE2ESummaryBy(e2eCandidates, hasMeaningfulVisualEvidence);
  const visualCaptureAttemptSource = pickE2ESummaryBy(e2eCandidates, hasMeaningfulVisualCaptureAttemptDiagnosis);
  const visualCaptureStabilitySource = pickE2ESummaryBy(e2eCandidates, hasMeaningfulVisualCaptureStability);
  const visualBlockerSource = pickE2ESummaryBy(e2eCandidates, hasMeaningfulVisualBlocker);
  const primaryDiagnosis = primaryDiagnosisSource.primaryDiagnosis && typeof primaryDiagnosisSource.primaryDiagnosis === "object"
    ? primaryDiagnosisSource.primaryDiagnosis
    : freshestE2E.primaryDiagnosis && typeof freshestE2E.primaryDiagnosis === "object"
    ? freshestE2E.primaryDiagnosis
    : {};
  const visualEvidenceItems = normalizeVisualEvidenceItems(visualEvidenceSource.visualEvidenceItems, 8);
  const visualEvidenceSummary = normalizeSummaryText(visualEvidenceSource.visualEvidenceSummary);
  const visualCaptureAttemptDiagnosisItems = normalizeVisualCaptureAttemptDiagnosisItems(
    visualCaptureAttemptSource.visualCaptureAttemptDiagnosisItems,
    8,
  );
  const visualCaptureAttemptDiagnosisSummary = normalizeSummaryText(
    visualCaptureAttemptSource.visualCaptureAttemptDiagnosisSummary,
  );
  const visualCaptureStabilityStages = Array.isArray(visualCaptureStabilitySource.visualCaptureStabilityStages)
    ? visualCaptureStabilitySource.visualCaptureStabilityStages
    : [];
  const visualPrimaryBlockerSummary = hasMeaningfulVisualBlocker(visualBlockerSource)
    ? (
      buildPureVisualReaderFailureSummary(visualBlockerSource)
      || buildVisualPrimaryBlockerSummary(visualBlockerSource)
      || null
    )
    : (hasMeaningfulVisualBlocker(freshestE2E)
      ? (
        buildPureVisualReaderFailureSummary(freshestE2E)
        || buildVisualPrimaryBlockerSummary(freshestE2E)
        || null
      )
      : null);

  const frontpageSources = [
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
    {
      label: "loop",
      frontpage: loopFrontpage,
      generatedAtMs: parseGeneratedAtMs(loop.generatedAt),
      nextAction: loop.nextAction || loopFrontpage.nextAction || "",
    },
  ];
  const currentFrontpageSource = chooseFrontpageSource(frontpageSources);
  const currentActionSource = chooseActionSource(frontpageSources);
  const gatePrimaryBlockers = Array.isArray(gateFrontpage.primaryBlockers) ? gateFrontpage.primaryBlockers : [];
  const monitorPrimarySignals = Array.isArray(monitorFrontpage.primarySignals) ? monitorFrontpage.primarySignals : [];
  const currentValidationDecision = gateFrontpage.validationDecision
    || monitorFrontpage.validationDecision
    || null;
  const projectContext = buildProjectContext({
    currentTruthSummary: reports.currentTruthSummary || null,
    currentTruthActiveBatchId: reports.currentTruthActiveBatchId || null,
    projectExpansionWave: reports.projectExpansionWave || null,
    projectValidationOverrides: reports.projectValidationOverrides || null,
    validationDecision: currentValidationDecision,
  });
  const summarySource = bootstrapShell
    ? "bootstrap-shell"
    : currentFrontpageSource?.label || null;
  const summaryStatusLabel = bootstrapShell
    ? "初始化占位"
    : currentFrontpageSource?.frontpage?.statusLabel
      || "待人工介入";
  const summaryHeadline = bootstrapShell
    ? "当前工作台仍是初始化占位，不代表当前项目结论。"
    : currentFrontpageSource?.frontpage?.headline
      || "当前缺少足够的自动化结论，请人工查看工件。";
  const summaryNextAction = bootstrapShell
    ? "请先执行 `npm run agent:sync` 刷新当前项目态工作台。"
    : String(currentFrontpageSource?.frontpage?.nextAction || currentActionSource?.nextAction || "").trim()
      || "先查看 gate / monitor / e2e 报告。";
  const runnableNextCommand = bootstrapShell
    ? "npm run agent:sync"
    : extractRunnableAction(currentActionSource?.nextAction || summaryNextAction)
      || "";
  const nextAction = runnableNextCommand || summaryNextAction;
  const blockers = bootstrapShell
    ? dedupeList([
      "当前 Obsidian 工作台仍是初始化占位；尚未刷新为当前项目结论。",
      "请先执行 `npm run agent:sync`，再根据 gate / monitor 的 fresh 结论继续推进。",
    ], 8)
    : dedupeList([
      ...gatePrimaryBlockers,
      ...(gatePrimaryBlockers.length === 0 ? monitorPrimarySignals : []),
      ...((currentFrontpageSource?.label === "loop" || !currentFrontpageSource)
        ? [
          ...(Array.isArray(loopState.issues) ? loopState.issues : []),
          ...(Array.isArray(loopFrontpage.primarySignals) ? loopFrontpage.primarySignals : []),
        ]
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
    runnableNextCommand,
    referenceDistillation.status === "failed" && referenceDistillation.nextSuggestedAction
      ? referenceDistillation.nextSuggestedAction
      : "",
    bootstrapShell ? "npm run check" : "",
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
    generationId: `obsidian-${Date.now()}`,
    summarySource,
    summaryStatusLabel,
    summaryHeadline,
    summaryNextAction,
    runnableNextCommand,
    sourceGateGeneratedAt: gate.generatedAt || null,
    sourceMonitorGeneratedAt: monitor.generatedAt || null,
    sourceLoopGeneratedAt: loop.generatedAt || null,
    bootstrapShell,
    statusLabel: summaryStatusLabel,
    headline: summaryHeadline,
    nextAction,
    blockers,
    candidateFiles,
    commands,
    projectContext,
    agentContext,
    referenceDistillation,
    currentTruthActiveBatchId: projectContext.currentTruth.activeBatchId,
    manualVerdictResolved: String(projectContext.currentTruth.activeBatchId || "").trim() === "READER-HIGH-126",
    autoChain: {
      gate: {
        present: hasMeaningfulFrontpage(gateFrontpage),
        generatedAt: gate.generatedAt || null,
        statusLabel: gateFrontpage.statusLabel || null,
        headline: gateFrontpage.headline || null,
        nextAction: gateFrontpage.nextAction || null,
      },
      monitor: {
        present: hasMeaningfulFrontpage(monitorFrontpage),
        generatedAt: monitor.generatedAt || null,
        statusLabel: monitorFrontpage.statusLabel || null,
        headline: monitorFrontpage.headline || null,
        nextAction: monitorFrontpage.nextAction || null,
      },
      watch: monitorFrontpage.watch && typeof monitorFrontpage.watch === "object"
        ? monitorFrontpage.watch
        : null,
      e2e: monitorFrontpage.e2e && typeof monitorFrontpage.e2e === "object"
        ? monitorFrontpage.e2e
        : null,
      watchRecovery: monitorFrontpage.watchRecovery && typeof monitorFrontpage.watchRecovery === "object"
        ? monitorFrontpage.watchRecovery
        : null,
      validationDecision: summarizeValidationDecision(currentValidationDecision),
    },
    diagnosis: primaryDiagnosis.summary || primaryDiagnosis.issue || null,
    diagnosisLabel: primaryDiagnosis.featureLabel || primaryDiagnosis.feature || null,
    readerHostStateSummary: normalizeSummaryText(
      readerHostStateSource.readerHostStateSummary,
      ["当前报告未采集 Reader 深层宿主状态"],
    ),
    readerHostStateNote: isDefaultReaderHostStateNote(readerHostStateSource.readerHostStateNote)
      ? null
      : normalizeSummaryText(readerHostStateSource.readerHostStateNote),
    toolbarDispatchMode: normalizeSummaryText(readerDeeperSource.toolbarDispatchMode),
    toolbarAppendedItemCount: typeof readerDeeperSource.toolbarAppendedItemCount === "number"
      ? Number(readerDeeperSource.toolbarAppendedItemCount)
      : null,
    selectionPopupAppendedItemCount: typeof readerDeeperSource.selectionPopupAppendedItemCount === "number"
      ? Number(readerDeeperSource.selectionPopupAppendedItemCount)
      : null,
    sidebarHeaderAppendedItemCount: typeof readerDeeperSource.sidebarHeaderAppendedItemCount === "number"
      ? Number(readerDeeperSource.sidebarHeaderAppendedItemCount)
      : null,
    contextMenuProbeCount: typeof readerDeeperSource.contextMenuProbeCount === "number"
      ? Number(readerDeeperSource.contextMenuProbeCount)
      : null,
    contextMenuObservedTypes: truncateList(readerDeeperSource.contextMenuObservedTypes, 8),
    contextMenuSyntheticFallbackTypes: truncateList(readerDeeperSource.contextMenuSyntheticFallbackTypes, 8),
    toolbarEvidenceSummary: normalizeSummaryText(readerDeeperSource.toolbarEvidenceSummary),
    visualEvidenceObserved: Boolean(
      visualEvidenceSource.visualEvidenceObserved === true
      || visualEvidenceItems.length > 0
      || visualEvidenceSummary
    ),
    visualEvidenceItemCount: visualEvidenceItems.length > 0
      ? Number(visualEvidenceSource.visualEvidenceItemCount || visualEvidenceItems.length)
      : 0,
    visualEvidenceFailingItemCount: visualEvidenceItems.length > 0
      ? Number(visualEvidenceSource.visualEvidenceFailingItemCount || visualEvidenceItems.length)
      : 0,
    visualEvidenceSummary,
    visualEvidenceItems,
    visualEvidenceFocusSummary: buildVisualEvidenceFocusSummary(visualEvidenceItems),
    visualCaptureAttemptDiagnosisObserved: Boolean(
      visualCaptureAttemptSource.visualCaptureAttemptDiagnosisObserved === true
      || visualCaptureAttemptDiagnosisItems.length > 0
      || visualCaptureAttemptDiagnosisSummary
    ),
    visualCaptureAttemptDiagnosisItemCount: visualCaptureAttemptDiagnosisItems.length > 0
      ? Number(visualCaptureAttemptSource.visualCaptureAttemptDiagnosisItemCount || visualCaptureAttemptDiagnosisItems.length)
      : 0,
    visualCaptureAttemptDiagnosisSummary,
    visualCaptureAttemptDiagnosisItems,
    visualPrimaryBlockerKind: normalizeSummaryText(visualBlockerSource.visualPrimaryBlockerKind, ["unknown"]),
    visualCaptureStabilitySummary: normalizeSummaryText(visualCaptureStabilitySource.visualCaptureStabilitySummary),
    visualCaptureStabilityStages,
    visualPrimaryBlockerSummary,
    visualGeometrySummary: normalizeSummaryText(visualBlockerSource.visualGeometrySummary),
    visualCanonicalCoverageKind: normalizeSummaryText(visualBlockerSource.visualCanonicalCoverageKind, ["unknown"]),
    visualCanonicalCoverageSummary: isDefaultVisualCanonicalCoverageSummary(visualBlockerSource.visualCanonicalCoverageSummary)
      ? null
      : normalizeSummaryText(visualBlockerSource.visualCanonicalCoverageSummary),
    visualCanonicalMismatchedTargets: truncateList(visualBlockerSource.visualCanonicalMismatchedTargets, 8),
    readerDispatchSummary: normalizeSummaryText(readerDeeperSource.readerDispatchSummary),
    contextMenuSummary: normalizeSummaryText(readerDeeperSource.contextMenuSummary),
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
      ...(agentContext.present ? ["dist/agent-context.md"] : []),
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
    toolbarDispatchMode: summary.toolbarDispatchMode || null,
    toolbarAppendedItemCount: typeof summary.toolbarAppendedItemCount === "number"
      ? Number(summary.toolbarAppendedItemCount)
      : null,
    selectionPopupAppendedItemCount: typeof summary.selectionPopupAppendedItemCount === "number"
      ? Number(summary.selectionPopupAppendedItemCount)
      : null,
    sidebarHeaderAppendedItemCount: typeof summary.sidebarHeaderAppendedItemCount === "number"
      ? Number(summary.sidebarHeaderAppendedItemCount)
      : null,
    contextMenuProbeCount: typeof summary.contextMenuProbeCount === "number"
      ? Number(summary.contextMenuProbeCount)
      : null,
    contextMenuObservedTypes: truncateList(summary.contextMenuObservedTypes, 8),
    contextMenuSyntheticFallbackTypes: truncateList(summary.contextMenuSyntheticFallbackTypes, 8),
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
    "type: current-zotero-plugin-visual-flow",
    "---",
    "",
    "# 当前 Zotero 插件交互流转图（Visual Companion）",
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
    "  H[\"Zotero host\"] --> P[\"pane surfaces\"]",
    "  H --> R[\"reader surfaces\"]",
    "  H --> M[\"menu surfaces\"]",
    "  P --> A[\"host action replay\"]",
    "  R --> A",
    "  M --> A",
    "  A --> E[\"surface-local evidence\"]",
    "  E --> S[\"status / evidence notes\"]",
    "  S --> N[\"next command\"]",
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

function createExcalidrawTextBox(
  id,
  x,
  y,
  text,
  seed,
  versionNonce,
  updated,
  options = {},
) {
  const normalizedText = sanitizeDiagramText(text);
  return createExcalidrawElementBase({
    id,
    type: "text",
    x,
    y,
    width: Number.isFinite(Number(options.width)) ? Number(options.width) : 260,
    height: Number.isFinite(Number(options.height)) ? Number(options.height) : 80,
    seed,
    versionNonce,
    updated,
    extra: {
      backgroundColor: "transparent",
      fontSize: Number.isFinite(Number(options.fontSize)) ? Number(options.fontSize) : 16,
      fontFamily: 5,
      strokeColor: options.strokeColor || "#374151",
      text: normalizedText,
      textAlign: options.textAlign || "left",
      verticalAlign: "top",
      baseline: 72,
      containerId: null,
      originalText: normalizedText,
      lineHeight: 1.25,
    },
  });
}

function createExcalidrawText(id, x, y, text, seed, versionNonce, updated) {
  return createExcalidrawTextBox(id, x, y, text, seed, versionNonce, updated);
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
  const blockers = truncateList(viewModel.blockers, 3);
  const files = truncateList(viewModel.candidateFiles, 3);
  return buildLinearConceptExcalidrawMarkdown({
    generatedAt: viewModel.generatedAt,
    title: "当前 Zotero 插件功能版图",
    summary: `状态：${viewModel.statusLabel || "待人工介入"}。把当前插件的 pane、reader、menu 与证据链放在同一张空间图上。`,
    cards: [
      {
        title: "Pane Surfaces",
        body: "preference pane\nItem Pane section / info row / sidenav\ncontext pane / reader sidebar view",
        color: "#dbe4ff",
      },
      {
        title: "Reader Surfaces",
        body: "renderToolbar\nReader ready\nlocal capture\nfuture fine-grained hook lane",
        color: "#c3fae8",
      },
      {
        title: "Menu Surfaces",
        body: "menu item\ncollection menu\ndynamic submenu\nreader/menubar/view menu item",
        color: "#b2f2bb",
      },
      {
        title: "Evidence + Action",
        body: `证据导航\n${viewModel.visualEvidenceFocusSummary || "暂无"}\n下一步：${viewModel.nextAction || "-"}`,
        color: "#ffd8a8",
      },
    ],
    footerTitle: "当前结论",
    footerSummary: `${viewModel.headline || "-"}\n候选文件：${files.length > 0 ? files.join("、") : "暂无"}\n阻塞：${blockers.length > 0 ? blockers.join("；") : "暂无明确阻塞项"}`,
  });
}

const PLUGIN_SURFACE_GROUPS = Object.freeze([
  {
    id: "pane-surfaces",
    title: "偏好设置与宿主窗格",
    surfaces: ["preference pane", "Item Pane section / info row / sidenav", "context pane", "reader sidebar view"],
    productGoal: "把插件设置、条目详情入口和 Reader 相关上下文保持在 Zotero 原生 pane 心智内。",
    userActions: [
      "从 Preferences 打开插件偏好设置并完成控制项交互",
      "在条目详情区查看 section / info row，并切换 item pane sidenav 按钮",
      "在 Reader 右侧切换 context pane / reader sidebar view",
    ],
    modules: [
      "src/app/feature-composer.js",
      "src/features/preference-panes.js",
      "src/features/item-pane.js",
      "src/app/host-actions.js",
      "src/platform/zotero-host.js",
    ],
    route: "宿主注册式 surface -> pane fragment / load bridge -> host action replay -> surface-local evidence",
    whyThisRoute: "这些 surface 都有明确宿主 contract，优先贴附在原生 pane 内，而不是先起独立窗口或 HTML shell。",
    diagramLink: "[[07-当前Zotero插件-偏好设置面板 UI 概念]]",
    scenarioFocus: "偏好设置控制项、窄宽度 degrade、窗格切换与贴边 geometry。",
  },
  {
    id: "reader-surfaces",
    title: "Reader 工具栏与侧栏",
    surfaces: ["reader renderToolbar", "reader sidebar view"],
    productGoal: "把 Reader 入口直接挂进当前阅读上下文，让动作和结果都停留在阅读流内。",
    userActions: [
      "在 Reader toolbar 触发插件动作",
      "切换 Reader sidebar view 并观察内容就绪",
      "让 toolbar / sidebar 结果和当前文档上下文保持同步",
    ],
    modules: [
      "src/app/feature-composer.js",
      "src/features/reader.js",
      "src/features/reader-selection-actions.js",
      "src/app/host-actions.js",
    ],
    route: "Reader event bridge -> renderToolbar / sidebar host surface -> action replay -> surface-local evidence",
    whyThisRoute: "Reader 是独立宿主 surface，优先走官方事件桥与 host action，不把它降级成普通 DOM patch。",
    diagramLink: "[[09-当前Zotero插件-Reader UI 概念]]",
    scenarioFocus: "renderToolbar 注入、sidebar view 切换、selectedTab ready 与 surface-local capture。",
  },
  {
    id: "menu-surfaces",
    title: "菜单与子菜单",
    surfaces: ["menu item", "collection menu", "dynamic submenu", "reader/menubar/view menu item"],
    productGoal: "把常用动作挂到 item / collection / submenu 等场景化入口，并保持 live state 驱动。",
    userActions: [
      "从 item menu 触发单动作入口",
      "在 collection menu 触发批量范围动作",
      "展开 dynamic submenu 并按 menuPath 触发子项",
      "从 reader/menubar/view menu item 进入 Reader 相关命令",
    ],
    modules: [
      "src/app/feature-composer.js",
      "src/features/menu-manager.js",
      "src/features/menu-command.js",
      "src/app/host-actions.js",
      "src/platform/zotero-host.js",
    ],
    route: "MenuManager target registration -> state resolver -> dynamic submenu builder -> menuPath evidence",
    whyThisRoute: "菜单是典型宿主注册面，优先保持 target / submenu / onShowing 语义，不把产品树结构和 toolkit 绑定死。",
    diagramLink: "[[11-当前Zotero插件-菜单与子菜单 UI 概念]]",
    scenarioFocus: "item / collection 场景区分、lazy submenu rebuild、menu.show / menu.trigger 重放。",
  },
]);

function buildPluginCurrentPhase(summary = {}) {
  const projectContext = summary.projectContext && typeof summary.projectContext === "object"
    ? summary.projectContext
    : {};
  const currentTruth = projectContext.currentTruth && typeof projectContext.currentTruth === "object"
    ? projectContext.currentTruth
    : {};
  const activeBatchId = String(currentTruth.activeBatchId || summary.currentTruthActiveBatchId || "").trim();

  if (summary.bootstrapShell === true) {
    return {
      kind: "bootstrap-shell",
      activeBatchId: activeBatchId || null,
      label: "初始化占位",
      summary: "当前工作台仍是初始化占位，必须先刷新到当前项目态后再判断插件功能与 UI。 ",
      surfaceStatus: "待刷新",
      nextFocus: "先执行 `npm run agent:sync`，再读取当前插件状态。",
    };
  }

  if (activeBatchId === "ENG-HIGH-104") {
    return {
      kind: "release-only",
      activeBatchId,
      label: "release-only follow-up",
      summary: "当前宿主可见面已经收敛为稳定基线；未收口项转向远端发布编排与 `updateURL` / `update_link` 分发闭环。",
      surfaceStatus: "稳定基线",
      nextFocus: "保持可见面说明与技术链索引清晰，同时推进远端发布验证，不回写已收口的 UI polish 主线。",
    };
  }

  if (/^HOST-/u.test(activeBatchId)) {
    return {
      kind: "host-visible-polish",
      activeBatchId,
      label: "host-visible polish",
      summary: "当前主线仍在收紧宿主可见面的交互一致性、贴边 geometry 和 surface-local evidence。",
      surfaceStatus: "当前主线",
      nextFocus: "优先围绕 host-visible surface 的真实交互与本地证据补闭环。",
    };
  }

  if (/^READER-/u.test(activeBatchId)) {
    return {
      kind: "reader-focused",
      activeBatchId,
      label: "reader-focused wave",
      summary: "当前主线聚焦 Reader 相关入口、事件点与可见面行为；其他 surface 以协同验证为主。",
      surfaceStatus: "Reader 主线",
      nextFocus: "优先围绕 Reader toolbar / sidebar / deeper event points 推进。",
    };
  }

  return {
    kind: "general",
    activeBatchId: activeBatchId || null,
    label: activeBatchId || "current project phase",
    summary: currentTruth.summary || "当前主线需要结合 CURRENT_BACKLOG 与 gate/monitor 继续判定。",
    surfaceStatus: "已建链",
    nextFocus: summary.summaryNextAction || summary.nextAction || "继续查看状态总览与证据索引。",
  };
}

function resolveSurfaceGroupStatus(group, phase) {
  if (phase.kind === "bootstrap-shell") {
    return "待刷新";
  }
  if (phase.kind === "release-only") {
    return "稳定基线";
  }
  if (phase.kind === "host-visible-polish") {
    return "当前主线";
  }
  if (phase.kind === "reader-focused") {
    return group?.id === "reader-surfaces" ? "当前主线" : "协同 surface";
  }
  return "已建链";
}

function buildPluginSurfaceGroups(summary = {}) {
  const phase = buildPluginCurrentPhase(summary);
  return PLUGIN_SURFACE_GROUPS.map((group) => ({
    ...group,
    statusLabel: resolveSurfaceGroupStatus(group, phase),
  }));
}

function buildPluginSharedTechnicalChain(summary = {}) {
  const phase = buildPluginCurrentPhase(summary);
  return [
    {
      title: "宿主注册优先",
      detail: "优先使用 `PreferencePanes`、`MenuManager`、`Reader.registerEventListener` 这类宿主注册式 surface，而不是先 patch Zotero DOM。",
    },
    {
      title: "统一装配层",
      detail: "`src/app/feature-composer.js` 负责把 pane、reader、menu 等 surface 收到同一插件装配点，避免每个 surface 各写一套入口。",
    },
    {
      title: "可回放 Host Action",
      detail: "`src/app/host-actions.js` 把真实 UI 触达统一成可回放动作，既服务 scenario/smoke，也服务 surface-local evidence。",
    },
    {
      title: "surface-local evidence",
      detail: "`config/project-validation-surfaces.json` 已把 preference pane、pane surfaces、reader、menus 的 smoke contract 固定下来，优先局部证据而不是整窗截图。",
    },
    {
      title: "当前项目焦点",
      detail: phase.summary,
    },
  ];
}

function buildPluginSurfaceSummaryMarkdownLines(summary = {}) {
  const groups = buildPluginSurfaceGroups(summary);
  const lines = [];
  groups.forEach((group) => {
    lines.push(`## ${group.title}`, "");
    lines.push(`- 当前状态：${group.statusLabel}`);
    lines.push(`- 当前 surfaces：${group.surfaces.join("、")}`);
    lines.push(`- 产品目标：${group.productGoal}`);
    lines.push(`- 典型动作：${group.userActions.join("；")}`);
    lines.push(`- 当前模块：${group.modules.map((item) => `\`${item}\``).join("、")}`);
    lines.push(`- 技术路径：${group.route}`);
    lines.push(`- 路线理由：${group.whyThisRoute}`);
    lines.push(`- 当前关注：${group.scenarioFocus}`);
    lines.push(`- 对应概念图：${group.diagramLink}`);
    lines.push("");
  });
  return lines;
}

function buildPluginTechnicalLineageMarkdownLines(summary = {}) {
  const groups = buildPluginSurfaceGroups(summary);
  const sharedChain = buildPluginSharedTechnicalChain(summary);
  const lines = [
    "## 共享技术骨架",
    "",
  ];
  sharedChain.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title}`);
    lines.push(`   ${item.detail}`);
  });
  lines.push("");

  groups.forEach((group) => {
    lines.push(`## ${group.title}`, "");
    lines.push(`- 当前状态：${group.statusLabel}`);
    lines.push(`- 宿主接入：${group.route}`);
    lines.push(`- 当前模块：${group.modules.map((item) => `\`${item}\``).join("、")}`);
    lines.push(`- 应用场景：${group.userActions.join("；")}`);
    lines.push(`- 选型理由：${group.whyThisRoute}`);
    lines.push(`- 参考索引：${group.id === "menu-surfaces"
      ? "[[docs/REFERENCE_PLUGIN_MENU_PATTERNS.md]]、[[docs/REFERENCE_PLUGIN_TECHNICAL_CHAINS.md]]"
      : "[[docs/UI_CREATION_PATHS.md]]、[[docs/REFERENCE_PLUGIN_TECHNICAL_CHAINS.md]]"}`);
    lines.push("");
  });

  lines.push("## 附加参考索引", "");
  lines.push("- `AIAssistant` 的 React panel 创建与切换经验适合作为更重型 HTML micro-app 的补充索引，但不替代当前 pane / reader / menu 的宿主注册主链。");
  lines.push("- 如果未来扩展更复杂的 React surface，优先把它放到附加索引或新 wave 说明，不把当前已收口的主链重新描述成“模板框架演示”。");
  lines.push("");
  return lines;
}

function buildObsidianExcalidrawMarkdown(jsonData) {
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

function buildLinearConceptExcalidrawMarkdown({
  generatedAt,
  title,
  summary,
  cards = [],
  footerTitle,
  footerSummary,
}) {
  const updated = Date.parse(String(generatedAt || "")) || Date.now();
  const normalizedCards = (Array.isArray(cards) ? cards : []).slice(0, 4);
  const positions = [
    { x: 20, y: 190 },
    { x: 360, y: 190 },
    { x: 700, y: 190 },
    { x: 1040, y: 190 },
  ];
  const elements = [
    createExcalidrawRect("root-rect", 20, 20, 620, 110, 1201, 2201, updated, "#dbe4ff"),
    createExcalidrawTextBox(
      "root-text",
      44,
      42,
      `${title}\n${summary}`,
      1202,
      2202,
      updated,
      { width: 580, height: 82, fontSize: 18, strokeColor: "#1e40af" },
    ),
  ];

  normalizedCards.forEach((card, index) => {
    const pos = positions[index];
    const rectID = `card-${index + 1}-rect`;
    const textID = `card-${index + 1}-text`;
    elements.push(
      createExcalidrawRect(
        rectID,
        pos.x,
        pos.y,
        280,
        170,
        1301 + index * 10,
        2301 + index * 10,
        updated,
        card.color || "#fff3bf",
      ),
      createExcalidrawTextBox(
        textID,
        pos.x + 16,
        pos.y + 16,
        `${card.title}\n${card.body}`,
        1302 + index * 10,
        2302 + index * 10,
        updated,
        { width: 248, height: 136, fontSize: 16 },
      ),
    );
  });

  elements.push(
    createExcalidrawRect("footer-rect", 360, 420, 620, 130, 1401, 2401, updated, "#e5dbff"),
    createExcalidrawTextBox(
      "footer-text",
      384,
      444,
      `${footerTitle}\n${footerSummary}`,
      1402,
      2402,
      updated,
      { width: 580, height: 88, fontSize: 16 },
    ),
  );

  elements.push(createExcalidrawArrow("arrow-root-first", 320, 130, -160, 60, 1501, 2501, updated));
  if (normalizedCards.length > 1) {
    elements.push(createExcalidrawArrow("arrow-card-1-2", 300, 275, 60, 0, 1502, 2502, updated));
  }
  if (normalizedCards.length > 2) {
    elements.push(createExcalidrawArrow("arrow-card-2-3", 640, 275, 60, 0, 1503, 2503, updated));
  }
  if (normalizedCards.length > 3) {
    elements.push(createExcalidrawArrow("arrow-card-3-4", 980, 275, 60, 0, 1504, 2504, updated));
  }
  elements.push(createExcalidrawArrow("arrow-last-footer", 1180, 360, -420, 60, 1505, 2505, updated));

  return buildObsidianExcalidrawMarkdown({
    type: "excalidraw",
    version: 2,
    source: "https://github.com/zsviczian/obsidian-excalidraw-plugin",
    elements,
    appState: {
      gridSize: null,
      viewBackgroundColor: "#ffffff",
    },
    files: {},
  });
}

export function buildPluginFeatureMapMarkdown(summary = {}) {
  const phase = buildPluginCurrentPhase(summary);
  return [
    "---",
    `generated_at: ${summary.generatedAt || new Date().toISOString()}`,
    "type: current-zotero-plugin-feature-map",
    "---",
    "",
    "# 当前 Zotero 插件功能与可见面地图",
    "",
    "> [!summary] 当前阅读方式",
    `> 当前主线：${phase.label}`,
    `> 主线说明：${phase.summary}`,
    `> 下一焦点：${phase.nextFocus}`,
    "> 这份笔记优先描述当前 Zotero 插件在宿主里的真实功能面与 UI surface，而不是模板自身的治理链。",
    "",
    ...buildPluginSurfaceSummaryMarkdownLines(summary),
    "## 推荐阅读顺序",
    "",
    "- 先看 [[01-当前Zotero插件-状态总览]]，确认当前主线和风险。",
    "- 再看 [[00-当前Zotero插件-功能与技术脉络]]，建立功能组与技术链的整体空间关系。",
    "- 如果你想按功能模块理解当前项目，再看 [[项目模块图谱/00-当前Zotero插件-功能模块总览]] 和 [[项目模块图谱/当前Zotero插件-功能模块图谱]]。",
    "- 然后按需要打开各 UI 概念图：[[07-当前Zotero插件-偏好设置面板 UI 概念]]、[[08-当前Zotero插件-条目与上下文窗格 UI 概念]]、[[09-当前Zotero插件-Reader UI 概念]]、[[11-当前Zotero插件-菜单与子菜单 UI 概念]]、[[14-当前Zotero插件-UI 具象布局图]]。",
    "- 如果你想看为什么这些 surface 走这条技术路线，再读 [[06-当前Zotero插件-技术脉络与宿主接入]]。",
    "",
  ].join("\n");
}

export function buildObsidianTechnicalLineageMarkdown(summary = {}) {
  const phase = buildPluginCurrentPhase(summary);
  return [
    "---",
    `generated_at: ${summary.generatedAt || new Date().toISOString()}`,
    "type: current-zotero-plugin-technical-lineage",
    "---",
    "",
    "# 当前 Zotero 插件技术脉络与宿主接入",
    "",
    "> [!info] 当前技术视角",
    `> 当前主线：${phase.label}`,
    `> 当前说明：${phase.summary}`,
    "> 这里记录的是“当前插件如何接到 Zotero 宿主、如何验证、如何扩面”的技术脉络，不复述模板治理本身。",
    "",
    ...buildPluginTechnicalLineageMarkdownLines(summary),
  ].join("\n");
}

export function buildPluginUIConceptArtifacts(summary = {}) {
  const phase = buildPluginCurrentPhase(summary);
  return {
    preferencePaneMarkdown: buildLinearConceptExcalidrawMarkdown({
      generatedAt: summary.generatedAt,
      title: "偏好设置面板 UI 概念",
      summary: `当前状态：${phase.surfaceStatus}。核心关注 PreferencePanes host shell、pane root、控制项交互与窄宽度 degrade。`,
      cards: [
        {
          title: "宿主 Preferences Shell",
          body: "Zotero Preferences\n侧边栏选择插件 pane\n宿主窗口边界 800x600",
          color: "#dbe4ff",
        },
        {
          title: "Pane Root + Load Bridge",
          body: "preference pane root\n载入 FTL / stylesheets / bridge\n保持插件设置语义在宿主 pane 内",
          color: "#c3fae8",
        },
        {
          title: "控制项与写回",
          body: "开关 / theme / 偏好写回\n真实交互回放\n结构与内容都要可观察",
          color: "#b2f2bb",
        },
        {
          title: "窄宽度 Hardening",
          body: "geometry ready\nroot width observed\nno horizontal overflow\n必要时 stacked-first degrade",
          color: "#ffd8a8",
        },
      ],
      footerTitle: "对应模块与证据",
      footerSummary: "模块：src/features/preference-panes.js、src/app/host-actions.js、src/platform/zotero-host.js\n证据：preference pane surface smoke + local capture。",
    }),
    paneMarkdown: buildLinearConceptExcalidrawMarkdown({
      generatedAt: summary.generatedAt,
      title: "条目与上下文窗格 UI 概念",
      summary: `当前状态：${phase.surfaceStatus}。核心关注 item pane sidenav、context pane section 与贴边 pane geometry。`,
      cards: [
        {
          title: "Item Pane Sidenav",
          body: "在库视图选择条目\n侧边按钮可见且可切换\nsurface fragment 被真实挂载",
          color: "#dbe4ff",
        },
        {
          title: "条目详情 Surface",
          body: "item pane content root\n与当前选中条目同步\n避免脱离宿主详情流",
          color: "#c3fae8",
        },
        {
          title: "Context Pane Section",
          body: "Reader 右侧 context pane\nsection 可切换\n与活动 tab / reader 上下文对齐",
          color: "#b2f2bb",
        },
        {
          title: "贴边布局与采样",
          body: "edge-mode occupancy\n遵循 live pane bounds\nsurface-local capture 优先",
          color: "#ffd8a8",
        },
      ],
      footerTitle: "对应模块与证据",
      footerSummary: "模块：src/features/item-pane.js、src/app/host-actions.js、src/platform/zotero-host.js\n证据：item/context pane surface smoke、geometry settle、surface-local evidence。",
    }),
    readerMarkdown: buildLinearConceptExcalidrawMarkdown({
      generatedAt: summary.generatedAt,
      title: "Reader UI 概念",
      summary: `当前状态：${phase.surfaceStatus}。核心关注 renderToolbar、reader sidebar view 与 Reader ready 后的真实交互。`,
      cards: [
        {
          title: "Reader Host Shell",
          body: "活动 reader tab\nselectedTab ready\n文档上下文是一等输入",
          color: "#dbe4ff",
        },
        {
          title: "renderToolbar 注入",
          body: "toolbar button / action\n在阅读流内直接可见\n动作后结果可观察",
          color: "#c3fae8",
        },
        {
          title: "Sidebar View",
          body: "reader sidebar view\n切换视图后 surface ready\n贴边布局跟随 live bounds",
          color: "#b2f2bb",
        },
        {
          title: "Reader 证据链",
          body: "surface-local capture\n必要时 synthetic fallback\n不把整窗截图当唯一真相",
          color: "#ffd8a8",
        },
      ],
      footerTitle: "对应模块与证据",
      footerSummary: "模块：src/features/reader.js、src/features/reader-selection-actions.js、src/app/host-actions.js\n证据：reader surface smoke、toolbar trigger、sidebar select、local capture。",
    }),
    menuMarkdown: buildLinearConceptExcalidrawMarkdown({
      generatedAt: summary.generatedAt,
      title: "菜单与子菜单 UI 概念",
      summary: `当前状态：${phase.surfaceStatus}。核心关注 item / collection 场景区分、dynamic submenu rebuild 与 menuPath evidence。`,
      cards: [
        {
          title: "Menu Targets",
          body: "item menu\ncollection menu\n不同 target 对应不同选择语义",
          color: "#dbe4ff",
        },
        {
          title: "State Resolver",
          body: "live selection / prefs / collection context\nonShowing 时求值\n不在启动时一次性写死",
          color: "#c3fae8",
        },
        {
          title: "Dynamic Submenu",
          body: "submenu 是一等结构\n展开时 lazy rebuild children\n保留 separator / path 语义",
          color: "#b2f2bb",
        },
        {
          title: "Trigger + Evidence",
          body: "menu.show / menu.trigger\n通过 menuPath 回放子项\n记录 surface-local evidence",
          color: "#ffd8a8",
        },
      ],
      footerTitle: "对应模块与证据",
      footerSummary: "模块：src/features/menu-manager.js、src/features/menu-command.js、src/app/host-actions.js\n证据：menu surface smoke、collection scene、submenu path 验证。",
    }),
  };
}

function normalizeModuleCardStatus(statusLabel) {
  switch (String(statusLabel || "").trim()) {
    case "待刷新":
      return "bootstrap-shell";
    case "当前主线":
    case "Reader 主线":
      return "current-line";
    case "稳定基线":
      return "stable-baseline";
    default:
      return "implemented";
  }
}

const CAPABILITY_CATEGORY_LABELS = Object.freeze({
  baseline: "基线能力",
  feature: "功能能力",
  governance: "治理能力",
  runtime: "运行时能力",
});

const MODULE_CARD_FILE_NAMES = Object.freeze({
  "pane-mainline": "01-主线-偏好设置与宿主窗格.md",
  "reader-mainline": "02-主线-Reader 工具栏与侧栏.md",
  "menu-mainline": "03-主线-菜单与子菜单.md",
  "compose-support": "04-支撑-统一装配与 Host Action.md",
  "validation-support": "05-支撑-验证与证据闭环.md",
});

const MODULE_CARD_CAPABILITY_IDS = Object.freeze({
  "pane-mainline": [
    "item-presentation",
    "settings-governance",
  ],
  "reader-mainline": [
    "reader-summary",
    "reader-annotation-roundtrip",
    "reader-ui-state",
    "reader-event-hooks",
  ],
  "menu-mainline": [
    "command-nonblocking",
  ],
  "compose-support": [
    "baseline-registration",
    "notifier-sync",
    "host-actions",
    "multi-window-mount",
  ],
  "validation-support": [
    "runtime-bridge-report",
  ],
});

function getObsidianAddonConfig(summary = {}) {
  return summary.addonConfig && typeof summary.addonConfig === "object"
    ? summary.addonConfig
    : {};
}

function buildPluginCapabilityManifest(summary = {}) {
  return createSourceCapabilityManifest({
    config: getObsidianAddonConfig(summary),
  });
}

function buildCapabilityMapById(capabilities = []) {
  return new Map(
    (Array.isArray(capabilities) ? capabilities : [])
      .filter((item) => item && typeof item === "object")
      .map((item) => [String(item.id || "").trim(), item])
      .filter(([id]) => Boolean(id)),
  );
}

function getCapabilityCategoryLabel(category) {
  const key = String(category || "").trim();
  return CAPABILITY_CATEGORY_LABELS[key] || key || "未分类";
}

function buildModuleCardCapabilityRefs(capabilityMap, cardId) {
  return (Array.isArray(MODULE_CARD_CAPABILITY_IDS[cardId]) ? MODULE_CARD_CAPABILITY_IDS[cardId] : [])
    .map((capabilityId) => capabilityMap.get(capabilityId))
    .filter(Boolean)
    .map((capability) => ({
      id: capability.id,
      label: capability.label,
      category: capability.category,
      categoryLabel: getCapabilityCategoryLabel(capability.category),
      agentScenario: String(capability.agentScenario || "").trim() || null,
      zoteroScenarios: truncateList(capability.zoteroScenarios, 3),
    }));
}

function buildCapabilityCategorySummary(capabilities = []) {
  const counts = new Map();
  (Array.isArray(capabilities) ? capabilities : []).forEach((capability) => {
    const category = String(capability?.category || "").trim() || "unknown";
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([category, count]) => ({
      category,
      categoryLabel: getCapabilityCategoryLabel(category),
      count,
    }))
    .sort((left, right) => String(left.category || "").localeCompare(String(right.category || ""), "zh-CN"));
}

function formatModuleArchetypeLabel(value) {
  switch (String(value || "").trim()) {
    case "visible-surface":
      return "可见面";
    case "runtime-capability":
      return "运行时能力";
    case "host-integration":
      return "宿主接入";
    case "workspace-integration":
      return "工作台集成";
    default:
      return String(value || "").trim() || "未声明";
  }
}

function buildWaveArchetypeMap(expansionWave = {}) {
  const map = new Map();
  (Array.isArray(expansionWave.moduleArchetypes) ? expansionWave.moduleArchetypes : []).forEach((item) => {
    const text = String(item || "").trim();
    if (!text) {
      return;
    }
    const [moduleName, archetype] = text.split(/\s*->\s*/u);
    if (moduleName && archetype) {
      map.set(moduleName.trim(), archetype.trim());
    }
  });
  return map;
}

function buildWaveRelationshipSummary(phase, expansionWave = {}) {
  const inScopeText = [
    expansionWave.currentWaveName,
    expansionWave.summary,
    ...(Array.isArray(expansionWave.inScopeModules) ? expansionWave.inScopeModules : []),
    ...(Array.isArray(expansionWave.moduleArchetypes) ? expansionWave.moduleArchetypes : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (phase.kind === "bootstrap-shell") {
    return "当前工作台还是初始化占位，wave 只可视为配置存在与否提示，不能替代 fresh current truth。";
  }
  if (phase.kind === "release-only" && /workbench/u.test(inScopeText)) {
    return "当前 01~05 模块卡片描述的是已经接线并基本收口的插件骨架；active wave 则额外指向 dev-only review workbench / workspace sidecar 焦点，不表示 pane / reader / menu 主线被重新打开。";
  }
  return "01~05 模块卡片描述的是当前插件整体骨架；active wave 只说明本轮扩展焦点，不一定等于所有已接线模块的全量范围。";
}

function buildWaveRecommendedLinks(expansionWave = {}) {
  const archetypeText = (Array.isArray(expansionWave.moduleArchetypes) ? expansionWave.moduleArchetypes : []).join(" ");
  const links = [];
  if (/visible-surface/u.test(archetypeText)) {
    links.push("[[01-主线-偏好设置与宿主窗格]]", "[[02-主线-Reader 工具栏与侧栏]]", "[[14-当前Zotero插件-UI 具象布局图]]");
  }
  if (/host-integration/u.test(archetypeText) || /runtime-capability/u.test(archetypeText)) {
    links.push("[[04-支撑-统一装配与 Host Action]]");
  }
  if (/workspace-integration/u.test(archetypeText) || /validation/u.test(String(expansionWave.summary || ""))) {
    links.push("[[05-支撑-验证与证据闭环]]");
  }
  links.push("[[07-能力目录-当前插件能力清单]]");
  return dedupeList(links, 6);
}

function buildCapabilityToModuleLinks(capabilityId) {
  const links = Object.entries(MODULE_CARD_CAPABILITY_IDS)
    .filter(([, capabilityIds]) => Array.isArray(capabilityIds) && capabilityIds.includes(capabilityId))
    .map(([cardId]) => {
      const fileName = MODULE_CARD_FILE_NAMES[cardId];
      return fileName ? `[[${fileName.replace(/\.md$/u, "")}]]` : "";
    })
    .filter(Boolean);
  return dedupeList(links, 4);
}

function buildPluginModuleCards(summary = {}) {
  const phase = buildPluginCurrentPhase(summary);
  const surfaceGroups = buildPluginSurfaceGroups(summary);
  const capabilityManifest = buildPluginCapabilityManifest(summary);
  const capabilityMap = buildCapabilityMapById(capabilityManifest);
  const projectContext = summary.projectContext && typeof summary.projectContext === "object"
    ? summary.projectContext
    : {};
  const currentTruth = projectContext.currentTruth && typeof projectContext.currentTruth === "object"
    ? projectContext.currentTruth
    : {};
  const expansionWave = projectContext.expansionWave && typeof projectContext.expansionWave === "object"
    ? projectContext.expansionWave
    : {};
  const validationDecision = projectContext.validationDecision && typeof projectContext.validationDecision === "object"
    ? projectContext.validationDecision
    : {};
  const cards = [
    {
      id: "pane-mainline",
      fileName: MODULE_CARD_FILE_NAMES["pane-mainline"],
      title: "主线：偏好设置与宿主窗格",
      layer: "mainline",
      statusLabel: surfaceGroups[0]?.statusLabel || "已建链",
      summary: surfaceGroups[0]?.productGoal || "把插件设置、条目详情入口和上下文 pane 维持在 Zotero 原生 pane 心智内。",
      surfaces: surfaceGroups[0]?.surfaces || [],
      modules: surfaceGroups[0]?.modules || [],
      route: surfaceGroups[0]?.route || "",
      focus: surfaceGroups[0]?.scenarioFocus || phase.nextFocus,
      actions: surfaceGroups[0]?.userActions || [],
      diagramLinks: [
        "[[07-当前Zotero插件-偏好设置面板 UI 概念]]",
        "[[08-当前Zotero插件-条目与上下文窗格 UI 概念]]",
      ],
      routeHighlights: [
        "宿主注册式 surface 是首选，不把 pane 问题直接退化成 DOM patch。",
        "pane fragment / load bridge 负责把宿主 shell 和插件内容接在一起。",
        "交互验证优先依赖 host action replay + surface-local evidence。",
      ],
    },
    {
      id: "reader-mainline",
      fileName: MODULE_CARD_FILE_NAMES["reader-mainline"],
      title: "主线：Reader 工具栏与侧栏",
      layer: "mainline",
      statusLabel: surfaceGroups[1]?.statusLabel || "已建链",
      summary: surfaceGroups[1]?.productGoal || "把 Reader 入口和结果都停留在阅读流内。",
      surfaces: surfaceGroups[1]?.surfaces || [],
      modules: surfaceGroups[1]?.modules || [],
      route: surfaceGroups[1]?.route || "",
      focus: surfaceGroups[1]?.scenarioFocus || phase.nextFocus,
      actions: surfaceGroups[1]?.userActions || [],
      diagramLinks: [
        "[[09-当前Zotero插件-Reader UI 概念]]",
        "[[14-当前Zotero插件-UI 具象布局图]]",
      ],
      routeHighlights: [
        "Reader 是独立宿主 surface，优先走官方事件桥和 renderToolbar 入口。",
        "sidebar view 走 host-visible shell，不把结果藏到独立外壳窗口里。",
        "Reader 证据优先用 local capture 和 deeper event diagnostics 收口。",
      ],
    },
    {
      id: "menu-mainline",
      fileName: MODULE_CARD_FILE_NAMES["menu-mainline"],
      title: "主线：菜单与子菜单",
      layer: "mainline",
      statusLabel: surfaceGroups[2]?.statusLabel || "已建链",
      summary: surfaceGroups[2]?.productGoal || "把常用动作挂到场景化 menu entry，并保持 live state 驱动。",
      surfaces: surfaceGroups[2]?.surfaces || [],
      modules: surfaceGroups[2]?.modules || [],
      route: surfaceGroups[2]?.route || "",
      focus: surfaceGroups[2]?.scenarioFocus || phase.nextFocus,
      actions: surfaceGroups[2]?.userActions || [],
      diagramLinks: [
        "[[11-当前Zotero插件-菜单与子菜单 UI 概念]]",
        "[[14-当前Zotero插件-UI 具象布局图]]",
      ],
      routeHighlights: [
        "菜单入口保持 target / submenu / onShowing 语义，不在启动时一次性写死。",
        "dynamic submenu 以 lazy rebuild 为主，不默认走 popup repair fallback。",
        "回放与验证优先记录 menu.show / menu.trigger / menuPath evidence。",
      ],
    },
    {
      id: "compose-support",
      fileName: MODULE_CARD_FILE_NAMES["compose-support"],
      title: "支撑：统一装配与 Host Action",
      layer: "support",
      statusLabel: phase.kind === "bootstrap-shell" ? "待刷新" : "已建链",
      summary: "把 pane / reader / menu 收到同一装配层，并把宿主动作统一成可回放的开发入口。",
      surfaces: ["feature composer", "host action replay", "Zotero host bridge"],
      modules: [
        "src/app/feature-composer.js",
        "src/app/host-actions.js",
        "src/platform/zotero-host.js",
      ],
      route: "feature-composer -> host action replay -> zotero host adapter -> scenario / evidence consumer",
      focus: phase.nextFocus,
      actions: [
        "按统一装配入口挂载 pane / reader / menu 功能",
        "把真实 UI 触达转换成场景可回放动作",
        "为 scenario、monitor、review workbench 暴露稳定宿主桥接面",
      ],
      diagramLinks: [
        "[[00-当前Zotero插件-功能与技术脉络]]",
        "[[06-当前Zotero插件-技术脉络与宿主接入]]",
      ],
      routeHighlights: [
        "统一装配层避免每个 surface 各自维护一套入口和生命周期。",
        "host action replay 把人工可见操作变成可重放、可定位、可留证的动作。",
        "当未来扩模块时，应优先扩装配与桥接面，而不是直接扩散到场景脚本。",
      ],
    },
    {
      id: "validation-support",
      fileName: MODULE_CARD_FILE_NAMES["validation-support"],
      title: "支撑：验证与证据闭环",
      layer: "support",
      statusLabel: phase.kind === "bootstrap-shell"
        ? "待刷新"
        : validationDecision.levelLabel || validationDecision.level || "已建链",
      summary: "把 surface-local evidence、monitor / gate、Obsidian handoff 与人工窗口接成同一条验证导航链。",
      surfaces: [
        "surface-local evidence",
        "agent:zotero:e2e",
        "agent:monitor / agent:gate",
        "agent:obsidian / human window",
      ],
      modules: [
        "config/project-validation-surfaces.json",
        "scripts/agent-zotero-e2e.mjs",
        "scripts/agent-monitor.mjs",
        "scripts/agent-gate.mjs",
        "scripts/agent-obsidian-handoff.mjs",
      ],
      route: "scenario / smoke -> surface-local evidence -> monitor / gate summary -> obsidian handoff -> human intervention window",
      focus: validationDecision.levelLabel || validationDecision.level || phase.nextFocus,
      actions: [
        "按 route-aware contract 验证可见面，而不是只看整窗截图",
        "把 gate / monitor 当前结论折叠成可导航的当前项目态",
        "在需要人工介入时只暴露一个输入窗口，不新开第二套 verdict 面",
      ],
      diagramLinks: [
        "[[02-当前Zotero插件-证据索引]]",
        "[[10-模板协作-人工指令窗口]]",
      ],
      routeHighlights: [
        "validationDecision 只决定是否需要视觉证据，不替代 watch / host / provenance guard。",
        `当前 active batch：${currentTruth.activeBatchId || "未声明"}`,
        `当前 wave：${expansionWave.currentWaveName || expansionWave.summary || "未声明"}`,
      ],
    },
  ];

  return cards.map((card) => ({
    ...card,
    status: normalizeModuleCardStatus(card.statusLabel),
    relatedCapabilities: buildModuleCardCapabilityRefs(capabilityMap, card.id),
  }));
}

function buildPluginModuleMapOverviewMarkdown(summary = {}) {
  const phase = buildPluginCurrentPhase(summary);
  const cards = buildPluginModuleCards(summary);
  const capabilityManifest = buildPluginCapabilityManifest(summary);
  const capabilitySummary = buildCapabilityCategorySummary(capabilityManifest);
  const projectContext = summary.projectContext && typeof summary.projectContext === "object"
    ? summary.projectContext
    : {};
  const currentTruth = projectContext.currentTruth && typeof projectContext.currentTruth === "object"
    ? projectContext.currentTruth
    : {};
  const expansionWave = projectContext.expansionWave && typeof projectContext.expansionWave === "object"
    ? projectContext.expansionWave
    : {};
  const validationDecision = projectContext.validationDecision && typeof projectContext.validationDecision === "object"
    ? projectContext.validationDecision
    : {};
  const mainlineCards = cards.filter((card) => card.layer === "mainline");
  const supportCards = cards.filter((card) => card.layer === "support");

  return [
    "---",
    "type: module-map",
    `status: ${summary.bootstrapShell === true ? "bootstrap-shell" : "active"}`,
    `updated: ${(summary.generatedAt || new Date().toISOString()).slice(0, 10)}`,
    "---",
    "",
    "# 当前 Zotero 插件功能模块总览",
    "",
    "> [!info]",
    "> 这套图谱只整理当前模板内“已接线且在仓库中有代码落点”的插件功能模块，不替代 `docs/CURRENT_BACKLOG.md` 的单一事实源。",
    "",
    "白板入口：[[当前Zotero插件-功能模块图谱]]",
    "",
    "## 整理依据",
    "",
    "- `docs/CURRENT_BACKLOG.md`",
    "- `config/project-expansion-wave.json`",
    "- `obsidian/agent-workbench/05-当前Zotero插件-功能与可见面地图.md`",
    "- `obsidian/agent-workbench/06-当前Zotero插件-技术脉络与宿主接入.md`",
    "",
    "## 当前判断",
    "",
    `- 当前主线：${phase.label}。`,
    `- 当前主线说明：${phase.summary}`,
    `- 当前 active batch：${currentTruth.activeBatchId || "未声明"}`,
    `- 当前 active wave：${expansionWave.currentWaveName || expansionWave.summary || "未声明"}`,
    `- 当前 validation：${validationDecision.levelLabel || validationDecision.level || "未声明"}`,
    `- 当前能力目录：${capabilityManifest.length} 项（${capabilitySummary.map((item) => `${item.categoryLabel} ${item.count}`).join(" / ") || "未提取"}）`,
    `- 当前推荐下一步：${phase.nextFocus}`,
    "",
    "## 分层导航",
    "",
    "### 主线骨架",
    "",
    ...mainlineCards.map((card) => `- [[${card.fileName.replace(/\.md$/u, "")}]]`),
    "",
    "### 支撑能力",
    "",
    ...supportCards.map((card) => `- [[${card.fileName.replace(/\.md$/u, "")}]]`),
    "",
    "### 项目特定补充",
    "",
    "- [[06-当前扩展波次-模块焦点]]",
    "- [[07-能力目录-当前插件能力清单]]",
    "",
    "## 推荐阅读顺序",
    "",
    "1. 先看 [[01-主线-偏好设置与宿主窗格]]，确认 pane 与 host-visible surface 的默认产品骨架。",
    "2. 再看 [[02-主线-Reader 工具栏与侧栏]]，理解 Reader 入口和阅读流上下文。",
    "3. 然后看 [[03-主线-菜单与子菜单]]，把 menu target / submenu / evidence 串起来。",
    "4. 如果你关心“当前这轮 wave 到底在扩什么”，再看 [[06-当前扩展波次-模块焦点]]。",
    "5. 如果你关心“仓库里已经声明了哪些真实能力”，再看 [[07-能力目录-当前插件能力清单]]。",
    "6. 需要落到统一装配或验证闭环时，再看 `04`、`05` 两张支撑卡片。",
    "7. 如果你要看接近真实界面的空间布局，再打开 [[14-当前Zotero插件-UI 具象布局图]]。",
    "",
  ].join("\n");
}

function buildPluginModuleCardMarkdown(summary = {}, card = {}) {
  const phase = buildPluginCurrentPhase(summary);
  const routeSteps = String(card.route || "")
    .split("->")
    .map((item) => item.trim())
    .filter(Boolean);
  return [
    "---",
    "type: module-card",
    `layer: ${card.layer || "support"}`,
    `status: ${card.status || "implemented"}`,
    `updated: ${(summary.generatedAt || new Date().toISOString()).slice(0, 10)}`,
    "---",
    "",
    `# ${card.title || "当前模块"}`,
    "",
    "## 功能定位",
    "",
    `- ${card.summary || "-"}`,
    `- 当前阶段：${phase.label}`,
    "",
    "## 当前可见面",
    "",
    ...(Array.isArray(card.surfaces) && card.surfaces.length > 0
      ? card.surfaces.map((item) => `- ${item}`)
      : ["- 当前没有额外可见面说明。"]),
    "",
    "## 简要技术链路",
    "",
    ...(routeSteps.length > 0
      ? routeSteps.map((item, index) => `${index + 1}. ${item}`)
      : ["1. 当前未提取到稳定技术链路。"]),
    "",
    "## 关键落点",
    "",
    ...(Array.isArray(card.modules) && card.modules.length > 0
      ? card.modules.map((item) => `- \`${item}\``)
      : ["- 当前未提取到关键落点。"]),
    "",
    "## 当前状态判断",
    "",
    `- 当前状态：${card.statusLabel || "已建链"}`,
    `- 当前关注：${card.focus || phase.nextFocus}`,
    `- 当前说明：${phase.summary}`,
    "",
    "## 典型动作",
    "",
    ...(Array.isArray(card.actions) && card.actions.length > 0
      ? card.actions.map((item) => `- ${item}`)
      : ["- 当前未提取到典型动作。"]),
    "",
    "## 关联能力",
    "",
    ...(Array.isArray(card.relatedCapabilities) && card.relatedCapabilities.length > 0
      ? card.relatedCapabilities.map((item) => {
        const scenarios = Array.isArray(item.zoteroScenarios) && item.zoteroScenarios.length > 0
          ? `；真机场景：${item.zoteroScenarios.join(" / ")}`
          : "";
        const agentScenario = item.agentScenario ? `；agent 场景：${item.agentScenario}` : "";
        return `- \`${item.id}\` · ${item.label}（${item.categoryLabel}）${agentScenario}${scenarios}`;
      })
      : ["- 当前未提取到关联能力。"]),
    "",
    "## 路线提示",
    "",
    ...(Array.isArray(card.routeHighlights) && card.routeHighlights.length > 0
      ? card.routeHighlights.map((item) => `- ${item}`)
      : ["- 当前未提取到路线提示。"]),
    "",
    "## 关联跳转",
    "",
    "- [[00-当前Zotero插件-功能模块总览]]",
    "- [[当前Zotero插件-功能模块图谱]]",
    "- [[06-当前扩展波次-模块焦点]]",
    "- [[07-能力目录-当前插件能力清单]]",
    ...(Array.isArray(card.diagramLinks) && card.diagramLinks.length > 0
      ? card.diagramLinks.map((item) => `- ${item}`)
      : []),
    "",
  ].join("\n");
}

function buildPluginModuleMapCanvas(summary = {}) {
  const phase = buildPluginCurrentPhase(summary);
  const cards = buildPluginModuleCards(summary);
  const projectContext = summary.projectContext && typeof summary.projectContext === "object"
    ? summary.projectContext
    : {};
  const currentTruth = projectContext.currentTruth && typeof projectContext.currentTruth === "object"
    ? projectContext.currentTruth
    : {};
  const expansionWave = projectContext.expansionWave && typeof projectContext.expansionWave === "object"
    ? projectContext.expansionWave
    : {};
  const validationDecision = projectContext.validationDecision && typeof projectContext.validationDecision === "object"
    ? projectContext.validationDecision
    : {};
  return {
    nodes: [
      makeFileNode(
        "module-overview",
        -180,
        -180,
        460,
        250,
        "项目模块图谱/00-当前Zotero插件-功能模块总览.md",
        "5",
      ),
      makeFileNode("module-pane", -180, 180, 360, 250, `项目模块图谱/${cards[0]?.fileName || "01-主线-偏好设置与宿主窗格.md"}`, "4"),
      makeFileNode("module-reader", 260, 180, 360, 280, `项目模块图谱/${cards[1]?.fileName || "02-主线-Reader 工具栏与侧栏.md"}`, "4"),
      makeFileNode("module-menu", 700, 180, 360, 250, `项目模块图谱/${cards[2]?.fileName || "03-主线-菜单与子菜单.md"}`, "4"),
      makeFileNode("module-wave-note", -180, 540, 360, 250, "项目模块图谱/06-当前扩展波次-模块焦点.md", "5"),
      makeFileNode("module-compose", 260, 540, 360, 250, `项目模块图谱/${cards[3]?.fileName || "04-支撑-统一装配与 Host Action.md"}`, "6"),
      makeFileNode("module-validation", 700, 540, 360, 250, `项目模块图谱/${cards[4]?.fileName || "05-支撑-验证与证据闭环.md"}`, "6"),
      makeFileNode("module-capability-note", 260, 900, 360, 250, "项目模块图谱/07-能力目录-当前插件能力清单.md", "3"),
      makeNode(
        "module-phase",
        -620,
        180,
        360,
        260,
        [
          "当前项目上下文",
          "",
          `主线：${phase.label}`,
          `Active batch：${currentTruth.activeBatchId || "-"}`,
          `Wave：${expansionWave.currentWaveName || expansionWave.summary || "-"}`,
          `Validation：${validationDecision.levelLabel || validationDecision.level || "-"}`,
          `下一焦点：${phase.nextFocus}`,
        ].join("\n"),
        "2",
      ),
      makeNode(
        "module-guide",
        -620,
        900,
        360,
        250,
        [
          "阅读建议",
          "",
          "1. 先看总览",
          "2. 再读 01~03 主线卡片",
          "3. 再读 06 当前 wave 焦点",
          "4. 然后回到 04~05 支撑卡片",
          "5. 需要能力入口时看 07 能力目录",
          "6. 需要接近真实界面时再看 14-当前Zotero插件-UI 具象布局图",
        ].join("\n"),
        "3",
      ),
    ],
    edges: [
      makeEdge("module-edge-1", "module-overview", "module-pane", "pane"),
      makeEdge("module-edge-2", "module-overview", "module-reader", "reader"),
      makeEdge("module-edge-3", "module-overview", "module-menu", "menu"),
      makeEdge("module-edge-4", "module-overview", "module-wave-note", "current wave"),
      makeEdge("module-edge-5", "module-pane", "module-compose", "统一装配"),
      makeEdge("module-edge-6", "module-reader", "module-compose", "host action"),
      makeEdge("module-edge-7", "module-menu", "module-compose", "state / replay"),
      makeEdge("module-edge-8", "module-compose", "module-validation", "evidence"),
      makeEdge("module-edge-9", "module-phase", "module-overview", "当前 truth"),
      makeEdge("module-edge-10", "module-phase", "module-wave-note", "扩展判定"),
      makeEdge("module-edge-11", "module-wave-note", "module-validation", "acceptance"),
      makeEdge("module-edge-12", "module-capability-note", "module-compose", "能力映射"),
      makeEdge("module-edge-13", "module-guide", "module-capability-note", "快速定位"),
    ],
  };
}

function buildPluginWaveFocusMarkdown(summary = {}) {
  const phase = buildPluginCurrentPhase(summary);
  const projectContext = summary.projectContext && typeof summary.projectContext === "object"
    ? summary.projectContext
    : {};
  const currentTruth = projectContext.currentTruth && typeof projectContext.currentTruth === "object"
    ? projectContext.currentTruth
    : {};
  const expansionWave = projectContext.expansionWave && typeof projectContext.expansionWave === "object"
    ? projectContext.expansionWave
    : {};
  const validationDecision = projectContext.validationDecision && typeof projectContext.validationDecision === "object"
    ? projectContext.validationDecision
    : {};
  const archetypeMap = buildWaveArchetypeMap(expansionWave);
  const recommendedLinks = buildWaveRecommendedLinks(expansionWave);
  const inScopeModules = Array.isArray(expansionWave.inScopeModules) ? expansionWave.inScopeModules : [];
  const outOfScopeModules = Array.isArray(expansionWave.outOfScopeModules) ? expansionWave.outOfScopeModules : [];
  const explicitVisualUpgradeModules = Array.isArray(expansionWave.explicitVisualUpgradeModules)
    ? expansionWave.explicitVisualUpgradeModules
    : [];
  return [
    "---",
    "type: module-wave-focus",
    `status: ${summary.bootstrapShell === true ? "bootstrap-shell" : expansionWave.status || "active"}`,
    `updated: ${(summary.generatedAt || new Date().toISOString()).slice(0, 10)}`,
    "---",
    "",
    "# 当前扩展波次模块焦点",
    "",
    "> [!info]",
    "> 这份笔记只回答“当前 active wave 在扩什么、暂时不扩什么、它和 01~05 模块卡片是什么关系”。",
    "",
    "## 当前上下文",
    "",
    `- 当前 phase：${phase.label}`,
    `- 当前 active batch：${currentTruth.activeBatchId || "未声明"}`,
    `- 当前 active wave：${expansionWave.currentWaveName || "未声明"}`,
    `- 当前 validation：${validationDecision.levelLabel || validationDecision.level || "未声明"}`,
    `- 当前 acceptance track：${expansionWave.acceptanceTrack || "未声明"}`,
    "",
    "## Wave 摘要",
    "",
    `- ${expansionWave.summary || "当前尚未声明 wave 摘要。"}`,
    "",
    "## 当前 in-scope 模块",
    "",
    ...(inScopeModules.length > 0
      ? inScopeModules.map((moduleName) => {
        const archetype = archetypeMap.get(moduleName);
        return `- \`${moduleName}\`${archetype ? `（${formatModuleArchetypeLabel(archetype)}）` : ""}`;
      })
      : ["- 当前没有声明 in-scope 模块。"]),
    "",
    "## 当前 out-of-scope 模块",
    "",
    ...(outOfScopeModules.length > 0
      ? outOfScopeModules.map((moduleName) => `- \`${moduleName}\``)
      : ["- 当前没有声明 out-of-scope 模块。"]),
    "",
    "## 显式视觉升级模块",
    "",
    ...(explicitVisualUpgradeModules.length > 0
      ? explicitVisualUpgradeModules.map((moduleName) => `- \`${moduleName}\``)
      : ["- 当前 wave 没有声明显式 visual-upgrade 模块。"]),
    "",
    "## 这和模块图谱的关系",
    "",
    `- ${buildWaveRelationshipSummary(phase, expansionWave)}`,
    "- `06` 关注的是“这轮要扩/不扩什么”；`01~05` 关注的是“当前插件已经有哪些稳定功能骨架”。",
    "- 如果 wave 更偏 workspace / telemetry / runtime sidecar，不代表当前 pane / reader / menu 主线被重新判成未完成。",
    "",
    "## 建议跳转",
    "",
    ...recommendedLinks.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function buildPluginCapabilityCatalogMarkdown(summary = {}) {
  const phase = buildPluginCurrentPhase(summary);
  const projectContext = summary.projectContext && typeof summary.projectContext === "object"
    ? summary.projectContext
    : {};
  const expansionWave = projectContext.expansionWave && typeof projectContext.expansionWave === "object"
    ? projectContext.expansionWave
    : {};
  const addonConfig = getObsidianAddonConfig(summary);
  const capabilityManifest = buildPluginCapabilityManifest(summary);
  const categorySummary = buildCapabilityCategorySummary(capabilityManifest);
  const currentWaveText = [
    expansionWave.currentWaveName,
    expansionWave.summary,
    ...(Array.isArray(expansionWave.inScopeModules) ? expansionWave.inScopeModules : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const capabilityText = capabilityManifest
    .map((item) => JSON.stringify(item))
    .join(" ")
    .toLowerCase();
  const currentWaveOutsideCatalog = /workbench/u.test(currentWaveText) && !/workbench/u.test(capabilityText);
  const categoryGroups = new Map();
  capabilityManifest.forEach((capability) => {
    const category = String(capability?.category || "").trim() || "unknown";
    if (!categoryGroups.has(category)) {
      categoryGroups.set(category, []);
    }
    categoryGroups.get(category).push(capability);
  });

  const lines = [
    "---",
    "type: capability-catalog",
    `updated: ${(summary.generatedAt || new Date().toISOString()).slice(0, 10)}`,
    `addon_ref: "${String(addonConfig.addonRef || "cleanroomtemplate").replaceAll('"', "'")}"`,
    "---",
    "",
    "# 当前插件能力清单",
    "",
    "> [!info]",
    "> 这份目录直接派生自 `src/app/capability-manifest.js`，用于说明“当前插件已经声明并接通了哪些能力、入口、场景和责任文件”。",
    "",
    "## 当前概览",
    "",
    `- 插件名称：${addonConfig.addonName || "Zotero Cleanroom Template"}`,
    `- Addon Ref：\`${addonConfig.addonRef || "cleanroomtemplate"}\``,
    `- 当前 phase：${phase.label}`,
    `- 当前 active wave：${expansionWave.currentWaveName || expansionWave.summary || "未声明"}`,
    `- 能力总数：${capabilityManifest.length}`,
    `- 分类分布：${categorySummary.map((item) => `${item.categoryLabel} ${item.count}`).join(" / ") || "未提取"}`,
    "",
    "## 读图提示",
    "",
    "- `01~05` 模块卡片适合看功能骨架；这份目录适合看真实入口、真机场景和责任文件。",
    "- 如果你在找“当前这轮 wave 的 scope”，优先回到 [[06-当前扩展波次-模块焦点]]。",
  ];

  if (currentWaveOutsideCatalog) {
    lines.push("- 当前 active wave 更偏 dev-only review workbench / workspace sidecar；因此它不会完整体现在现有 capability manifest 中。");
  }

  lines.push("", "## 能力清单", "");

  Array.from(categoryGroups.entries())
    .sort((left, right) => String(left[0] || "").localeCompare(String(right[0] || ""), "zh-CN"))
    .forEach(([category, capabilities]) => {
      lines.push(`### ${getCapabilityCategoryLabel(category)}`, "");
      capabilities.forEach((capability) => {
        const moduleLinks = buildCapabilityToModuleLinks(capability.id);
        lines.push(`#### \`${capability.id}\` ${capability.label}`, "");
        lines.push(`- 说明：${capability.description || "-"}`);
        lines.push(`- agent 场景：${capability.agentScenario || "-"}`);
        lines.push(`- 真机场景：${truncateList(capability.zoteroScenarios, 4).join(" / ") || "-"}`);
        lines.push(`- 主要入口：${truncateList(capability.entrypoints, 4).map((item) => `\`${item}\``).join("、") || "-"}`);
        lines.push(`- 责任文件：${truncateList(capability.ownedBy, 4).map((item) => `\`${item}\``).join("、") || "-"}`);
        lines.push(`- 成功信号：${truncateList(capability.successSignals, 4).join("；") || "-"}`);
        lines.push(`- 对应模块图谱：${moduleLinks.join("、") || "-"}`);
        lines.push("");
      });
    });

  return lines.join("\n");
}

function buildPluginUIConcreteExcalidrawMarkdown(summary = {}) {
  const phase = buildPluginCurrentPhase(summary);
  const projectContext = summary.projectContext && typeof summary.projectContext === "object"
    ? summary.projectContext
    : {};
  const expansionWave = projectContext.expansionWave && typeof projectContext.expansionWave === "object"
    ? projectContext.expansionWave
    : {};
  const validationDecision = projectContext.validationDecision && typeof projectContext.validationDecision === "object"
    ? projectContext.validationDecision
    : {};
  const updated = Date.parse(String(summary.generatedAt || "")) || Date.now();
  const elements = [
    createExcalidrawRect("ui-concrete-root", 20, 20, 880, 120, 3001, 4001, updated, "#dbe4ff"),
    createExcalidrawTextBox(
      "ui-concrete-root-text",
      44,
      44,
      `当前 Zotero 插件 UI 具象布局图\n状态：${phase.surfaceStatus}。把 preference pane、library panes、reader toolbar / sidebar 与 menu entry 放回接近真实宿主的布局位置。`,
      3002,
      4002,
      updated,
      { width: 836, height: 84, fontSize: 18, strokeColor: "#1e40af" },
    ),
    createExcalidrawRect("ui-concrete-meta", 940, 20, 380, 120, 3003, 4003, updated, "#fff3bf"),
    createExcalidrawTextBox(
      "ui-concrete-meta-text",
      964,
      44,
      `当前 phase：${phase.label}\n当前 wave：${expansionWave.currentWaveName || expansionWave.summary || "未声明"}\nValidation：${validationDecision.levelLabel || validationDecision.level || "未声明"}\n下一焦点：${phase.nextFocus}`,
      3004,
      4004,
      updated,
      { width: 332, height: 84, fontSize: 16 },
    ),

    createExcalidrawRect("pref-shell", 20, 190, 360, 260, 3010, 4010, updated, "#f8f9fa"),
    createExcalidrawTextBox("pref-shell-text", 40, 206, "Preferences Window\n偏好设置面板", 3011, 4011, updated, {
      width: 320,
      height: 36,
      fontSize: 18,
      strokeColor: "#1f2937",
    }),
    createExcalidrawRect("pref-sidebar", 40, 252, 86, 160, 3012, 4012, updated, "#e7f5ff"),
    createExcalidrawTextBox("pref-sidebar-text", 52, 268, "宿主侧边栏\n插件 pane", 3013, 4013, updated, {
      width: 62,
      height: 80,
      fontSize: 15,
      strokeColor: "#1d4ed8",
      textAlign: "center",
    }),
    createExcalidrawRect("pref-content", 144, 252, 212, 160, 3014, 4014, updated, "#dbe4ff"),
    createExcalidrawTextBox("pref-content-text", 160, 268, "pane root\n开关 / theme / 偏好写回\n窄宽度 degrade\nsurface-local capture", 3015, 4015, updated, {
      width: 180,
      height: 120,
      fontSize: 15,
    }),

    createExcalidrawRect("library-shell", 420, 190, 420, 320, 3020, 4020, updated, "#f8f9fa"),
    createExcalidrawTextBox("library-shell-text", 440, 206, "Library Window\n条目与上下文窗格", 3021, 4021, updated, {
      width: 380,
      height: 36,
      fontSize: 18,
      strokeColor: "#1f2937",
    }),
    createExcalidrawRect("library-tree", 440, 252, 92, 220, 3022, 4022, updated, "#e7f5ff"),
    createExcalidrawTextBox("library-tree-text", 452, 268, "Item Tree\n条目列表", 3023, 4023, updated, {
      width: 68,
      height: 70,
      fontSize: 15,
      textAlign: "center",
    }),
    createExcalidrawRect("library-list", 548, 252, 116, 220, 3024, 4024, updated, "#edf2ff"),
    createExcalidrawTextBox("library-list-text", 562, 268, "选中条目\n主工作区", 3025, 4025, updated, {
      width: 88,
      height: 70,
      fontSize: 15,
      textAlign: "center",
    }),
    createExcalidrawRect("library-item-pane", 680, 252, 140, 100, 3026, 4026, updated, "#dbe4ff"),
    createExcalidrawTextBox("library-item-pane-text", 694, 268, "Item Pane\nsection / info row\nsidenav", 3027, 4027, updated, {
      width: 112,
      height: 70,
      fontSize: 15,
    }),
    createExcalidrawRect("library-context-pane", 680, 372, 140, 100, 3028, 4028, updated, "#c3fae8"),
    createExcalidrawTextBox("library-context-pane-text", 694, 388, "context pane\n与当前条目 / reader tab\n保持同步", 3029, 4029, updated, {
      width: 112,
      height: 70,
      fontSize: 15,
    }),

    createExcalidrawRect("reader-shell", 880, 190, 440, 320, 3030, 4030, updated, "#f8f9fa"),
    createExcalidrawTextBox("reader-shell-text", 900, 206, "Reader Window\nrenderToolbar 与 sidebar view", 3031, 4031, updated, {
      width: 400,
      height: 36,
      fontSize: 18,
      strokeColor: "#1f2937",
    }),
    createExcalidrawRect("reader-toolbar", 900, 252, 396, 50, 3032, 4032, updated, "#e7f5ff"),
    createExcalidrawTextBox("reader-toolbar-text", 916, 268, "renderToolbar / action button / ready state", 3033, 4033, updated, {
      width: 364,
      height: 24,
      fontSize: 15,
      textAlign: "center",
    }),
    createExcalidrawRect("reader-document", 900, 322, 252, 150, 3034, 4034, updated, "#edf2ff"),
    createExcalidrawTextBox("reader-document-text", 916, 338, "阅读正文区域\n文档上下文是一等输入\nlocal capture / selectedTab ready", 3035, 4035, updated, {
      width: 220,
      height: 90,
      fontSize: 15,
    }),
    createExcalidrawRect("reader-sidebar", 1172, 322, 124, 150, 3036, 4036, updated, "#d3f9d8"),
    createExcalidrawTextBox("reader-sidebar-text", 1184, 338, "sidebar view\nannotations /\ncontext", 3037, 4037, updated, {
      width: 96,
      height: 90,
      fontSize: 15,
      textAlign: "center",
    }),

    createExcalidrawRect("menu-rail", 420, 550, 900, 140, 3040, 4040, updated, "#fff9db"),
    createExcalidrawTextBox("menu-rail-text", 444, 566, "Menu Entry Rail\nitem / collection / reader menubar view", 3041, 4041, updated, {
      width: 856,
      height: 30,
      fontSize: 18,
      strokeColor: "#7c2d12",
    }),
    createExcalidrawRect("menu-item", 452, 606, 220, 56, 3042, 4042, updated, "#ffe8cc"),
    createExcalidrawTextBox("menu-item-text", 470, 622, "item menu\n单条目动作入口", 3043, 4043, updated, {
      width: 184,
      height: 26,
      fontSize: 15,
      textAlign: "center",
    }),
    createExcalidrawRect("menu-collection", 700, 606, 220, 56, 3044, 4044, updated, "#ffe8cc"),
    createExcalidrawTextBox("menu-collection-text", 718, 622, "collection menu\n批量范围动作入口", 3045, 4045, updated, {
      width: 184,
      height: 26,
      fontSize: 15,
      textAlign: "center",
    }),
    createExcalidrawRect("menu-view", 948, 606, 220, 56, 3046, 4046, updated, "#ffe8cc"),
    createExcalidrawTextBox("menu-view-text", 966, 622, "reader / menubar / view\nReader 相关命令", 3047, 4047, updated, {
      width: 184,
      height: 26,
      fontSize: 15,
      textAlign: "center",
    }),
    createExcalidrawRect("menu-submenu", 1196, 606, 100, 56, 3048, 4048, updated, "#ffd8a8"),
    createExcalidrawTextBox("menu-submenu-text", 1208, 622, "dynamic\nsubmenu", 3049, 4049, updated, {
      width: 76,
      height: 26,
      fontSize: 15,
      textAlign: "center",
    }),

    createExcalidrawRect("ui-concrete-footer", 20, 550, 360, 140, 3050, 4050, updated, "#e5dbff"),
    createExcalidrawTextBox(
      "ui-concrete-footer-text",
      40,
      570,
      `读图提示\n1. 07~11 负责分 surface 概念图\n2. 14 负责接近真实宿主布局的全局观\n3. 当前推荐命令：${summary.runnableNextCommand || summary.nextAction || "-"}`,
      3051,
      4051,
      updated,
      { width: 320, height: 90, fontSize: 15 },
    ),

    createExcalidrawArrow("ui-arrow-item", 562, 662, 0, -152, 3060, 4060, updated),
    createExcalidrawArrow("ui-arrow-view", 1058, 606, 62, -96, 3061, 4061, updated),
  ];

  return buildObsidianExcalidrawMarkdown({
    type: "excalidraw",
    version: 2,
    source: "https://github.com/zsviczian/obsidian-excalidraw-plugin",
    elements,
    appState: {
      gridSize: null,
      viewBackgroundColor: "#ffffff",
    },
    files: {},
  });
}

export function buildPluginModuleMapArtifacts(summary = {}) {
  const cards = buildPluginModuleCards(summary);
  return {
    overviewMarkdown: buildPluginModuleMapOverviewMarkdown(summary),
    waveMarkdown: buildPluginWaveFocusMarkdown(summary),
    capabilityCatalogMarkdown: buildPluginCapabilityCatalogMarkdown(summary),
    canvas: buildPluginModuleMapCanvas(summary),
    cards: cards.map((card) => ({
      fileName: card.fileName,
      markdown: buildPluginModuleCardMarkdown(summary, card),
    })),
  };
}

export function buildPluginUIConcreteExcalidraw(summary = {}) {
  return buildPluginUIConcreteExcalidrawMarkdown(summary);
}

export function buildObsidianInterventionMarkdown(summary) {
  const blockers = truncateList(summary.blockers, 8);
  const candidateFiles = truncateList(summary.candidateFiles, 8);
  const commands = truncateList(summary.commands, 8);
  const visualEvidenceItems = normalizeVisualEvidenceItems(summary.visualEvidenceItems, 3);
  const visualAttemptDiagnosisItems = normalizeVisualCaptureAttemptDiagnosisItems(summary.visualCaptureAttemptDiagnosisItems, 3);
  const phase = buildPluginCurrentPhase(summary);
  const surfaceGroups = buildPluginSurfaceGroups(summary);
  const sharedChain = buildPluginSharedTechnicalChain(summary);
  const projectContext = summary.projectContext && typeof summary.projectContext === "object"
    ? summary.projectContext
    : {};
  const currentTruth = projectContext.currentTruth && typeof projectContext.currentTruth === "object"
    ? projectContext.currentTruth
    : {};
  const expansionWave = projectContext.expansionWave && typeof projectContext.expansionWave === "object"
    ? projectContext.expansionWave
    : {};
  const validationOverrides = projectContext.validationOverrides && typeof projectContext.validationOverrides === "object"
    ? projectContext.validationOverrides
    : {};
  const validationDecision = projectContext.validationDecision && typeof projectContext.validationDecision === "object"
    ? projectContext.validationDecision
    : {};
  const agentContext = summary.agentContext && typeof summary.agentContext === "object"
    ? summary.agentContext
    : {};
  const autoChain = summary.autoChain && typeof summary.autoChain === "object"
    ? summary.autoChain
    : {};
  const patchSummary = summary.patchSummary && typeof summary.patchSummary === "object"
    ? summary.patchSummary
    : {};
  const patchActionDisplay = buildPatchActionDisplay(summary);
  const patchPriorityNote = buildPatchPriorityNote(summary);
  const exhaustedStageSummary = buildVisualExhaustedStageSummary(summary);
  const humanStageLabel = pickHumanStageLabel(summary);

  const lines = [
    "---",
    `generated_at: ${summary.generatedAt}`,
    `handoff_generation_id: ${summary.generationId || "-"}`,
    `status_label: ${summary.statusLabel || "待人工介入"}`,
    `summary_source: ${summary.summarySource || "unknown"}`,
    `bootstrap_shell: ${summary.bootstrapShell === true ? "true" : "false"}`,
    `current_wave_name: "${String(expansionWave.currentWaveName || "").replaceAll('"', "'")}"`,
    `current_truth_active_batch: "${String(currentTruth.activeBatchId || "").replaceAll('"', "'")}"`,
    `validation_level: ${validationDecision.level || "unknown"}`,
    `next_action: "${String(summary.summaryNextAction || summary.nextAction || "-").replaceAll('"', "'")}"`,
    `agent_context_generated_at: ${agentContext.generatedAt || "-"}`,
    `agent_context_digest: ${agentContext.budgetMeta?.digest || "-"}`,
    `agent_context_alignment_status: ${agentContext.alignmentRef?.status || "-"}`,
    "type: current-zotero-plugin-status",
    "---",
    "",
    "# 当前 Zotero 插件状态总览",
    "",
    "> [!summary] 自动化当前判断",
    `> 状态：${summary.statusLabel || "待人工介入"}`,
    `> 结论：${summary.headline || "-"}`,
    `> 当前主线：${phase.label}`,
    `> 主线说明：${phase.summary}`,
    `> 摘要下一步：${summary.summaryNextAction || "-"}`,
    `> 可执行命令：\`${summary.runnableNextCommand || "-"}\``,
    "> 相关工作台：[[00-当前Zotero插件-功能与技术脉络]] / [[05-当前Zotero插件-功能与可见面地图]] / [[06-当前Zotero插件-技术脉络与宿主接入]]",
    "",
  ];

  if (summary.bootstrapShell === true) {
    lines.push(
      "> [!warning] 初始化占位工作台",
      "> 当前 Obsidian 工作台仅用于初始化占位，不代表当前插件的 fresh gate / monitor 结论。",
      "> 下一步必须先执行 `npm run agent:sync`，再把白板刷新成当前项目态。",
      "",
    );
  }

  if (humanStageLabel !== "按自动路径继续") {
    lines.splice(lines.length - 1, 0, `> 当前阶段：${humanStageLabel}`);
  }

  lines.push("## 当前插件主线", "");
  lines.push(`- 当前 truth active batch：${currentTruth.activeBatchId || "-"}`);
  lines.push(`- 当前主线摘要：${currentTruth.summary || phase.summary || "-"}`);
  lines.push(`- 当前 wave：${expansionWave.currentWaveName || expansionWave.summary || "-"}`);
  lines.push(`- 验收主线：${expansionWave.acceptanceTrack || "-"}`);
  lines.push(`- 可见面状态：${phase.surfaceStatus}`);
  lines.push(`- 下一焦点：${phase.nextFocus}`);
  lines.push(`- Validation mirror：${validationOverrides.summary || "-"}`);
  lines.push(`- Validation level：${validationDecision.levelLabel || validationDecision.level || "-"}`);
  if (Array.isArray(currentTruth.excerpt) && currentTruth.excerpt.length > 0) {
    currentTruth.excerpt.forEach((item) => lines.push(`- truth 要点：${item}`));
  }
  lines.push("");

  lines.push("## 当前插件可见面", "");
  surfaceGroups.forEach((group) => {
    lines.push(`- ${group.title}：${group.statusLabel}；surface=${group.surfaces.join(" / ")}；图=${group.diagramLink}`);
  });
  lines.push("");

  lines.push("## 当前技术脉络", "");
  sharedChain.forEach((item) => {
    lines.push(`- ${item.title}：${item.detail}`);
  });
  lines.push("");

  lines.push("## 当前开发上下文", "");
  if (!agentContext.present) {
    lines.push("- 缺少 `dist/agent-context.json` / `dist/agent-context.md`，当前仍回退到 gate / monitor / truth 汇总。");
  } else {
    lines.push(`- Context 生成时间：${agentContext.generatedAt || "-"}`);
    lines.push(`- Compact Profile：\`${agentContext.budgetMeta?.profile || "-"}\``);
    lines.push(`- Compact Digest：\`${agentContext.budgetMeta?.digest || "-"}\``);
    lines.push(`- Truth Ref：batch=\`${agentContext.truthRef?.activeBatchId || "-"}\` / wave=\`${agentContext.truthRef?.currentWaveName || "-"}\` / validation=\`${agentContext.truthRef?.validationLevel || "-"}\``);
    lines.push(`- Alignment Ref：status=\`${agentContext.alignmentRef?.status || "missing"}\` / stage=\`${agentContext.alignmentRef?.generationStage || "missing"}\` / repair=\`${agentContext.alignmentRef?.preferredRepairCommand || "-"}\``);
    lines.push(`- Action Ref：next=\`${agentContext.actionRef?.nextAction || "-"}\` / blocker=${agentContext.actionRef?.mainBlocker || "-"}`);
    lines.push(`- Status Ref：monitor=\`${agentContext.statusRef?.monitorStatus || "-"}\` / gate=\`${agentContext.statusRef?.gateStatus || "-"}\` / release=\`${agentContext.statusRef?.releaseStatus || "-"}\``);
    lines.push(`- Reference Distillation：status=\`${agentContext.referenceDistillationRef?.status || "idle"}\` / pending=\`${agentContext.referenceDistillationRef?.pendingCount ?? 0}\` / topic=\`${agentContext.referenceDistillationRef?.lastTopic || "-"}\` / last=\`${agentContext.referenceDistillationRef?.lastDistilledAt || "-"}\` / next=\`${agentContext.referenceDistillationRef?.nextSuggestedAction || "-"}\``);
    lines.push(`- 建议证据：${truncateList(agentContext.evidenceRefs, 4).join("；") || "-"}`);
    lines.push(`- Drift 状态：\`${agentContext.driftRef?.status || "missing"}\` / warning \`${agentContext.driftRef?.warningCount ?? 0}\``);
    if (Array.isArray(agentContext.driftRef?.warnings) && agentContext.driftRef.warnings.length > 0) {
      agentContext.driftRef.warnings.forEach((item) => lines.push(`- Drift：${item}`));
    }
  }
  lines.push("");

  lines.push("## 当前自动结论与验证", "");
  lines.push(`- 摘要来源：${summary.summarySource || "-"}`);
  lines.push(`- Gate：${autoChain.gate?.statusLabel || "-"} / ${autoChain.gate?.generatedAt || "-"}`);
  lines.push(`- Monitor：${autoChain.monitor?.statusLabel || "-"} / ${autoChain.monitor?.generatedAt || "-"}`);
  lines.push(`- Watch：${autoChain.watch?.statusLabel || "-"} / ${autoChain.watch?.ageText || "-"}`);
  lines.push(`- E2E：${autoChain.e2e?.statusLabel || "-"} / ${autoChain.e2e?.ageText || "-"}`);
  lines.push(`- Watch Recovery：${autoChain.watchRecovery?.statusLabel || "-"} / ${autoChain.watchRecovery?.ageText || "-"}`);
  lines.push(`- Gate 结论：${autoChain.gate?.headline || "-"}`);
  lines.push(`- Monitor 结论：${autoChain.monitor?.headline || "-"}`);
  lines.push(`- Required checks：${truncateList(validationDecision.requiredChecks, 4).join("；") || "-"}`);
  lines.push(`- Required evidence：${truncateList(validationDecision.requiredEvidence, 4).join("；") || "-"}`);
  lines.push(`- 补证动作：${validationDecision.deferredEvidenceAction || "-"}`);
  lines.push(`- 运行时升级：${validationDecision.escalatedByRuntimeSignals ? "是" : "否"}`);
  lines.push("");

  if (summary.diagnosisLabel || summary.diagnosis) {
    lines.push("> [!note] 主诊断");
    if (summary.diagnosisLabel) {
      lines.push(`> 功能位点：${summary.diagnosisLabel}`);
    }
    if (summary.diagnosis) {
      lines.push(`> 说明：${summary.diagnosis}`);
    }
    lines.push("");
  }

  if (
    summary.readerHostStateSummary
    || summary.readerHostStateNote
    || summary.toolbarDispatchMode
    || summary.toolbarAppendedItemCount !== null
    || summary.selectionPopupAppendedItemCount !== null
    || summary.sidebarHeaderAppendedItemCount !== null
    || summary.contextMenuProbeCount !== null
    || summary.readerDispatchSummary
    || summary.contextMenuSummary
    || summary.contextMenuObservedTypes.length > 0
    || summary.contextMenuSyntheticFallbackTypes.length > 0
  ) {
    lines.push("## Reader 专项证据", "");
    lines.push(`- 状态摘要：${summary.readerHostStateSummary || "-"}`);
    lines.push(`- 备注：${summary.readerHostStateNote || "-"}`);
    lines.push(`- 工具栏分发：${summary.toolbarDispatchMode || "-"}`);
    lines.push(`- 工具栏追加项：${summary.toolbarAppendedItemCount ?? "-"}`);
    lines.push(`- 文本浮层追加项：${summary.selectionPopupAppendedItemCount ?? "-"}`);
    lines.push(`- 侧栏批注头追加项：${summary.sidebarHeaderAppendedItemCount ?? "-"}`);
    lines.push(`- 上下文菜单探针数：${summary.contextMenuProbeCount ?? "-"}`);
    lines.push(`- 分发摘要：${summary.readerDispatchSummary || "-"}`);
    lines.push(`- 上下文菜单：${summary.contextMenuSummary || "-"}`);
    lines.push(`- 已观测类型：${Array.isArray(summary.contextMenuObservedTypes) ? (summary.contextMenuObservedTypes.join("、") || "-") : "-"}`);
    lines.push(`- fallback 类型：${Array.isArray(summary.contextMenuSyntheticFallbackTypes) ? (summary.contextMenuSyntheticFallbackTypes.join("、") || "-") : "-"}`);
    lines.push("");
  }

  if (
    summary.toolbarEvidenceSummary
    || summary.visualEvidenceSummary
    || summary.visualCaptureAttemptDiagnosisSummary
    || summary.visualCaptureStabilitySummary
    || summary.visualPrimaryBlockerSummary
  ) {
    lines.push("## 当前关键证据", "");
    lines.push(`- renderToolbar 证据：${summary.toolbarEvidenceSummary || "-"}`);
    lines.push(`- 视觉证据：${summary.visualEvidenceSummary || "-"}`);
    lines.push(`- 证据导航：${summary.visualEvidenceFocusSummary || "-"}`);
    lines.push(`- Attempt 诊断：${summary.visualCaptureAttemptDiagnosisSummary || "-"}`);
    lines.push(`- 视觉采集稳定性：${summary.visualCaptureStabilitySummary || "-"}`);
    lines.push(`- 用尽预算 stage：${exhaustedStageSummary || "-"}`);
    lines.push(`- 视觉主阻断：${summary.visualPrimaryBlockerSummary || "-"}`);
    lines.push(`- 视觉几何摘要：${summary.visualGeometrySummary || "-"}`);
    lines.push(`- Canonical 覆盖摘要：${summary.visualCanonicalCoverageSummary || "-"}`);
    lines.push(`- Canonical 未对齐目标：${truncateList(summary.visualCanonicalMismatchedTargets, 8).join("、") || "-"}`);
    lines.push("");
  }

  if (summary.visualEvidenceFocusSummary || visualEvidenceItems.length > 0) {
    lines.push("## 视觉证据导航", "");
    lines.push(`- 导航摘要：${summary.visualEvidenceFocusSummary || summary.visualEvidenceSummary || "-"}`);
    lines.push(`- 失败证据项：${summary.visualEvidenceFailingItemCount ?? 0} / ${summary.visualEvidenceItemCount ?? 0}`);
    visualEvidenceItems.forEach((item) => {
      lines.push(`- ${formatVisualEvidenceItemLabel(item)} | Capture: ${toMarkdownLink(item.capturePath)} | Baseline: ${toMarkdownLink(item.baselinePath)}`);
    });
    lines.push("- 详见：[[02-当前Zotero插件-证据索引]]", "");
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
    lines.push("- 详见：[[02-当前Zotero插件-证据索引]]", "");
  }

  lines.push("## 当前风险与阻塞", "");
  if (blockers.length === 0) {
    lines.push("- 当前已满足主要质量闸门，可继续执行推荐命令或进入后续开发 / 发布流程。");
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

  lines.push("", "## 补丁与修复收口", "");
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
    "type: current-zotero-plugin-evidence-index",
    "---",
    "",
    "# 当前 Zotero 插件证据索引",
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
    "## 工作台入口",
    "",
    "- [[01-当前Zotero插件-状态总览]]",
    "- [[05-当前Zotero插件-功能与可见面地图]]",
    "- [[06-当前Zotero插件-技术脉络与宿主接入]]",
    "- [[03-模板协作-人工快速上手]]",
    "- [[04-模板协作-高级介入规范]]",
    "- [[10-模板协作-人工指令窗口]]",
    "",
  );
  return lines.join("\n");
}

export function buildHumanQuickstartMarkdown() {
  return [
    "---",
    "type: template-collaboration-human-quickstart",
    "audience: human-only",
    "agent_reading: disabled",
    "---",
    "",
    "# 模板协作人工快速上手",
    "",
    "> [!abstract] 这份笔记适合谁",
    "> 这是一份给新进入项目的人看的快速上手说明，帮助你先理解工作台、掌握最短操作路径，再决定是否需要人工介入。",
    ">",
    "> agent 不会把这份说明当作执行输入；真正会被读取的是 `10-模板协作-人工指令窗口.md` 中的保留编辑区。",
    "",
    "> [!tip] 一句话理解整套链路",
    "> agent 先自动构建与验证，人工只在需要时介入判断和定向，随后 agent 再根据人工修改继续推进。",
    "",
    "## 快速入口",
    "",
    "> [!info] 先从这里开始",
    "> - 当前插件状态：[[01-当前Zotero插件-状态总览]]",
    "> - 插件功能白板：[[00-当前Zotero插件-功能与技术脉络]]",
    "> - 证据索引：[[02-当前Zotero插件-证据索引]]",
    "> - 功能地图：[[05-当前Zotero插件-功能与可见面地图]]",
    "> - 模块图谱：[[项目模块图谱/00-当前Zotero插件-功能模块总览]]",
    "> - 当前 wave：[[项目模块图谱/06-当前扩展波次-模块焦点]]",
    "> - 能力目录：[[项目模块图谱/07-能力目录-当前插件能力清单]]",
    "> - UI 具象图：[[14-当前Zotero插件-UI 具象布局图]]",
    "> - 高级规范：[[04-模板协作-高级介入规范]]",
    "> - 人工输入窗口：[[10-模板协作-人工指令窗口]]",
    "",
    "## 工作台文件怎么用",
    "",
    "| 文件 | 作用 | 建议用法 |",
    "| --- | --- | --- |",
    "| `00-当前Zotero插件-功能与技术脉络.canvas` | 看当前插件的功能组、UI surface 和技术链空间关系 | 先建立产品与技术全局理解，再决定要不要介入 |",
    "| `01-当前Zotero插件-状态总览.md` | 看当前主线、阻塞项、建议动作 | 先读这个，快速判断是不是需要人工接管 |",
    "| `02-当前Zotero插件-证据索引.md` | 跳转到报告和证据工件 | 当你需要核对日志、报告、旧结论时再下钻 |",
    "| `05-当前Zotero插件-功能与可见面地图.md` | 看当前插件有哪些稳定可见面与入口 | 当你要理解 UI 面的业务分组时优先看这里 |",
    "| `项目模块图谱/00-当前Zotero插件-功能模块总览.md` | 看当前项目按功能模块拆开的主线与支撑层 | 当你要快速理解“哪些模块构成当前插件”时优先看这里 |",
    "| `项目模块图谱/06-当前扩展波次-模块焦点.md` | 看当前 active wave 在扩什么、暂时不扩什么 | 当你想判断“为什么现在在改这批模块”时优先看这里 |",
    "| `项目模块图谱/07-能力目录-当前插件能力清单.md` | 看当前插件已经声明的真实能力入口、场景与责任文件 | 当你要把“模块”进一步落到“可调用能力”时再看 |",
    "| `14-当前Zotero插件-UI 具象布局图.excalidraw.md` | 看接近真实宿主布局的 UI 全局观 | 当你已经知道 surface 名称，想把它们放回真实界面位置时再看 |",
    "| `06-当前Zotero插件-技术脉络与宿主接入.md` | 看这些 surface 为什么走这条宿主接入路径 | 当你要做技术判断或扩面选型时再读 |",
    "| `04-模板协作-高级介入规范.md` | 看字段语义、介入边界、规范建议 | 当你要正式接管一轮路径时再读 |",
    "| `10-模板协作-人工指令窗口.md` | 唯一的人机协作输入窗口 | 只在这里写状态、下一步指令、关注文件、备注 |",
    "",
    "## 推荐操作顺序",
    "",
    "> [!check] 建议按这个顺序使用",
    "> 1. 先看 `01-当前Zotero插件-状态总览.md`，判断现在卡在哪。",
    "> 2. 再看 `00-当前Zotero插件-功能与技术脉络.canvas`，确认问题属于哪个插件功能组。",
    "> 3. 如果你更关心“当前项目有哪些功能模块”，就去 `项目模块图谱/00-当前Zotero插件-功能模块总览.md` 和对应模块卡片。",
    "> 4. 如果你想理解“为什么当前在推进这批模块”，去 `项目模块图谱/06-当前扩展波次-模块焦点.md`。",
    "> 5. 如果你想把模块进一步落到真实入口和场景，去 `项目模块图谱/07-能力目录-当前插件能力清单.md`。",
    "> 6. 需要深挖时，再去 `05-当前Zotero插件-功能与可见面地图.md`、`06-当前Zotero插件-技术脉络与宿主接入.md` 和 `14-当前Zotero插件-UI 具象布局图.excalidraw.md` 找对应说明。",
    "> 7. 需要证据时，再去 `02-当前Zotero插件-证据索引.md` 找对应报告。",
    "> 8. 如果你准备正式介入，再读一遍 `04-模板协作-高级介入规范.md`。",
    "> 9. 只有当你确定要改变本轮路径时，才去修改 `10-模板协作-人工指令窗口.md`。",
    "> 10. 修改完成后，再让 agent 进入下一轮执行。",
    "",
    "## 介入前检查清单",
    "",
    "> [!check] 修改人工指令前，建议先确认",
    "> - 你已经读过当前状态总览，而不是只看标题就下判断。",
    "> - 你能明确说出这轮想让 agent 先做什么。",
    "> - 你知道要改的是“执行路径”，而不是随手记一点想法。",
    "> - 你的下一步指令最好能落到现有脚本命令或明确文件路径。",
    "",
    "## 本地 reference 快照怎么更新",
    "",
    "> [!info] 只在你确实需要刷新本地参考项目版本时才用",
    "> 不要直接手改 `reference/` 目录；先走受管命令链。",
    "",
    "- 先执行 `npm run agent:reference:update -- list`，查看当前有哪些受管的 git-backed reference 项目。",
    "- 更新单个项目时，使用 `npm run agent:reference:update -- update --project <id>`。",
    "- 需要批量刷新全部受管项目时，使用 `npm run agent:reference:update -- update --all`。",
    "- 如果目标目录是脏 worktree、非 git 目录，或者现有 origin 与 manifest 不一致，脚本会默认阻断；只有在你明确接受覆盖时，才使用 `--allow-dirty` 或 `--replace-existing`。",
    "- `config/reference-projects.json` 管的是 rolling git 快照；像 `reference/<project>/<release-version>` 这种版本号写进目录名的 release/archive 快照，继续人工新建版本目录，不走这条命令链。",
    "",
    "## 产品整体 UI 设计草图怎么更新",
    "",
    "> [!info] 只在你需要一轮产品整体 UI 设计 / 改版草图时才用",
    "> 这条链只产出 Obsidian Excalidraw，不改业务源码，也不覆盖默认 `07~11 / 14` 自动图。",
    "",
    "- 先执行 `npm run agent:ui:design -- list`，查看当前可用的人工 UI 设计工作链。",
    "- 运行时使用 `npm run agent:ui:design -- run product-ui-design-update --goal \"<你的设计目标>\"`。",
    "- 产物固定写到 `obsidian/agent-workbench/20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md`。",
    "- 这份 Excalidraw 是设计呈现工件，不是新的 verdict / 输入面；真正改变执行路径，仍然只改 `10-模板协作-人工指令窗口.md`。",
    "- `agent:obsidian` 刷新默认工作台时不会覆盖这份手动 UI 设计草图。",
    "",
    "## Reader Verdict 三模板",
    "",
    "> [!important] 当前阶段如果显示“等待人工 Reader verdict”",
    "> 仍然只改 `10-模板协作-人工指令窗口.md` 里的 5 个字段：`状态 / 模式 / 下一步指令 / 关注文件 / 备注`。",
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
    "> 如果你准备正式接管一轮执行路径，请继续阅读 [[04-模板协作-高级介入规范]]。",
    "",
  ].join("\n");
}

export function buildHumanAdvancedGuideMarkdown() {
  return [
    "---",
    "type: template-collaboration-human-advanced-guide",
    "audience: human-only",
    "agent_reading: disabled",
    "---",
    "",
    "# 模板协作高级介入规范",
    "",
    "> [!important] 这份笔记适合什么时候看",
    "> 当你准备正式改写本轮执行路径、暂停自动链路，或需要给 agent 更高质量的人工判断时，再看这份规范。",
    "",
    "> [!info] 快速跳转",
    "> - 回到快速上手：[[03-模板协作-人工快速上手]]",
    "> - 当前插件状态：[[01-当前Zotero插件-状态总览]]",
    "> - 人工输入窗口：[[10-模板协作-人工指令窗口]]",
    "",
    "## 哪些内容不要改",
    "",
    "> [!danger] 这些区域不要手动改",
    "> - `01-当前Zotero插件-状态总览.md` 里的自动摘要",
    "> - `02-当前Zotero插件-证据索引.md` 的自动生成列表",
    "> - `10-模板协作-人工指令窗口.md` 中 `## 人工编辑区（保留）` 之前的自动摘要说明",
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
    "- 好的写法：`npm run agent:reference:update -- update --project zotero-main`",
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
    "## 产品整体 UI 设计链",
    "",
    "> [!info] 这条链适合什么场景",
    "> 当你需要一轮面向产品整体的 UI 设计 / 改版草图，但又不想让 agent 直接改实现或覆盖默认 `07~11 / 14` 自动图时，优先走这条人工触发链。",
    "",
    "- 推荐命令：`npm run agent:ui:design -- run product-ui-design-update --goal \"统一 preference pane / item pane / reader 的产品层导航\"`",
    "- 设计呈现只允许落在 `obsidian/agent-workbench/20-当前Zotero插件-产品整体 UI 设计与更新流程.excalidraw.md`。",
    "- 这条链默认复用现有 delegation 审查工件，因此仍会在 `dist/agent-delegation/OBSIDIAN-UI-DESIGN-001/` 下留下 run / review 记录。",
    "- 这份 Excalidraw 只负责设计呈现，不是新的执行输入面；要改本轮执行路径，仍然回到 `10-模板协作-人工指令窗口.md`。",
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
  const projectContext = summary.projectContext && typeof summary.projectContext === "object"
    ? summary.projectContext
    : {};
  const currentTruth = projectContext.currentTruth && typeof projectContext.currentTruth === "object"
    ? projectContext.currentTruth
    : {};
  const expansionWave = projectContext.expansionWave && typeof projectContext.expansionWave === "object"
    ? projectContext.expansionWave
    : {};
  const validationDecision = projectContext.validationDecision && typeof projectContext.validationDecision === "object"
    ? projectContext.validationDecision
    : {};
  const phase = buildPluginCurrentPhase(summary);
  const surfaceGroups = buildPluginSurfaceGroups(summary);
  const sharedChain = buildPluginSharedTechnicalChain(summary);
  const blockerText = truncateList(summary.blockers, 5);
  const fileText = truncateList(summary.candidateFiles, 6);
  const commandText = truncateList(summary.commands, 4);
  const autoChain = summary.autoChain && typeof summary.autoChain === "object"
    ? summary.autoChain
    : {};
  const helperText = summary.bootstrapShell === true
    ? [
      "初始化占位 shell",
      "",
      "当前白板不代表真实插件状态。",
      "下一步必须先执行：",
      "- npm run agent:sync",
    ]
    : [
      "协作入口",
      "",
      "03-模板协作-人工快速上手.md",
      "04-模板协作-高级介入规范.md",
      "10-模板协作-人工指令窗口.md",
    ];

  const nodes = [
    makeNode(
      "root0001",
      0,
      0,
      430,
      220,
      `当前 Zotero 插件白板\n\n状态：${summary.statusLabel || "待人工介入"}\n主线：${phase.label}\n结论：${summary.headline || "-"}\n${summary.bootstrapShell === true ? "说明：初始化占位，不代表当前结论" : `可执行：${summary.runnableNextCommand || "-"}`}`,
      summary.bootstrapShell === true ? "1" : "2",
    ),
    makeNode(
      "meta0002",
      0,
      -220,
      430,
      200,
      `工作台元数据\n\ngeneration_id=${summary.generationId || "-"}\nsummary_source=${summary.summarySource || "-"}\nbootstrap_shell=${summary.bootstrapShell === true ? "true" : "false"}\nagent_context_generated_at=${summary.agentContext?.generatedAt || "-"}\nagent_context_digest=${summary.agentContext?.budgetMeta?.digest || "-"}\nstatus_note=01-当前Zotero插件-状态总览.md`,
      "5",
    ),
    makeNode(
      "main0003",
      0,
      280,
      430,
      250,
      `当前主线 / truth\n\nActive batch：${currentTruth.activeBatchId || "-"}\n当前 wave：${expansionWave.currentWaveName || expansionWave.summary || "-"}\nAcceptance：${expansionWave.acceptanceTrack || "-"}\nValidation：${validationDecision.levelLabel || validationDecision.level || "-"}\n摘要：${currentTruth.summary || phase.summary || "-"}\n可见面状态：${phase.surfaceStatus}\n下一焦点：${phase.nextFocus}`,
      "4",
    ),
    makeNode(
      "surface0004",
      500,
      0,
      380,
      210,
      `${surfaceGroups[0]?.title || "偏好设置与宿主窗格"}\n\n状态：${surfaceGroups[0]?.statusLabel || "-"}\nSurface：${surfaceGroups[0]?.surfaces?.join(" / ") || "-"}\n图：07-当前Zotero插件-偏好设置面板 UI 概念`,
      "4",
    ),
    makeNode(
      "surface0005",
      500,
      240,
      380,
      210,
      `${surfaceGroups[1]?.title || "Reader 工具栏与侧栏"}\n\n状态：${surfaceGroups[1]?.statusLabel || "-"}\nSurface：${surfaceGroups[1]?.surfaces?.join(" / ") || "-"}\n图：09-当前Zotero插件-Reader UI 概念`,
      "4",
    ),
    makeNode(
      "surface0006",
      500,
      480,
      380,
      220,
      `${surfaceGroups[2]?.title || "菜单与子菜单"}\n\n状态：${surfaceGroups[2]?.statusLabel || "-"}\nSurface：${surfaceGroups[2]?.surfaces?.join(" / ") || "-"}\n图：11-当前Zotero插件-菜单与子菜单 UI 概念`,
      "4",
    ),
    makeNode(
      "tech0007",
      960,
      0,
      430,
      260,
      `共享技术骨架\n\n${sharedChain.map((item) => `- ${item.title}：${item.detail}`).join("\n")}`,
      "6",
    ),
    makeNode(
      "evidence0008",
      960,
      300,
      430,
      250,
      `证据与风险\n\nGate：${autoChain.gate?.statusLabel || "-"}\nMonitor：${autoChain.monitor?.statusLabel || "-"}\n阻塞：${blockerText.length === 0 ? "暂无明确阻塞项" : ""}\n${blockerText.map((item) => `- ${item}`).join("\n") || ""}\n候选文件：${fileText.length === 0 ? "暂无" : ""}\n${fileText.map((item) => `- ${item}`).join("\n") || ""}`,
      "5",
    ),
    makeNode(
      "next0009",
      1470,
      0,
      360,
      230,
      `下一步动作\n\n摘要下一步：${summary.summaryNextAction || "-"}\n可执行：${summary.runnableNextCommand || "-"}\n${commandText.map((item) => `- ${item}`).join("\n")}`,
      "2",
    ),
    makeNode(
      "helper0010",
      1470,
      280,
      360,
      220,
      helperText.join("\n"),
      "3",
    ),
  ];

  const edges = [
    makeEdge("edge0001", "meta0002", "root0001", "同轮生成"),
    makeEdge("edge0002", "root0001", "main0003", "当前主线"),
    makeEdge("edge0003", "root0001", "surface0004", "pane surfaces"),
    makeEdge("edge0004", "root0001", "surface0005", "reader surfaces"),
    makeEdge("edge0005", "root0001", "surface0006", "menu surfaces"),
    makeEdge("edge0006", "surface0004", "tech0007", "宿主注册"),
    makeEdge("edge0007", "surface0005", "tech0007", "Reader 事件桥"),
    makeEdge("edge0008", "surface0006", "tech0007", "state-driven menu"),
    makeEdge("edge0009", "tech0007", "evidence0008", "surface-local evidence"),
    makeEdge("edge0010", "main0003", "next0009", "当前动作"),
    makeEdge("edge0011", "next0009", "helper0010", summary.bootstrapShell === true ? "先 sync" : "协作入口"),
  ];

  return {
    nodes,
    edges,
  };
}

export function buildHumanInterventionWindowMarkdown(summary, existingContent = "") {
  const preservedHumanSection = resolveHumanEditableSection(summary, existingContent);
  const patchSummary = summary.patchSummary && typeof summary.patchSummary === "object"
    ? summary.patchSummary
    : {};
  const patchActionDisplay = buildPatchActionDisplay(summary);
  const patchPriorityNote = buildPatchPriorityNote(summary);
  const exhaustedStageSummary = buildVisualExhaustedStageSummary(summary);
  const manualVerdictStage = isManualReaderVerdictStage(summary);
  const humanStageLabel = pickHumanStageLabel(summary);

  const lines = [
    "---",
    `generated_at: ${summary.generatedAt}`,
    `status_label: ${summary.statusLabel || "待人工介入"}`,
    "type: template-collaboration-human-window",
    "---",
    "",
    "# 模板协作人工指令窗口",
    "",
    "## 自动摘要（每次刷新会更新）",
    "",
    `- 当前状态：${summary.statusLabel || "待人工介入"}`,
    `- 自动结论：${summary.headline || "-"}`,
    `- 自动下一步：\`${summary.nextAction || "-"}\``,
    `- 当前阶段：${humanStageLabel}`,
    `- 视觉导航：${summary.visualEvidenceFocusSummary || "暂无"}`,
    `- Attempt 诊断：${summary.visualCaptureAttemptDiagnosisSummary || "暂无"}`,
    `- 视觉采集稳定性：${summary.visualCaptureStabilitySummary || "-"}`,
    `- 视觉主阻断：${summary.visualPrimaryBlockerSummary || "-"}`,
    `- 用尽预算 stage：${exhaustedStageSummary || "暂无"}`,
    `- 证据入口：[[02-当前Zotero插件-证据索引]]`,
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
