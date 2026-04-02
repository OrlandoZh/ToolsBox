import { summarizeCapabilityCoverage } from "./agent-capability-lib.mjs";
import {
  getVisualBaselineFilename,
  pickVisualCanonicalCoverageKindLabel,
  summarizeVisualCanonicalCoverage,
} from "./agent-zotero-visual-lib.mjs";
import {
  READER_EVENT_KNOWN_TYPES,
  READER_EVENT_PROBE_COMPATIBLE_TYPES,
} from "../src/features/reader.js";
import { normalizeDiagnosisFingerprint } from "./agent-zotero-diagnosis-lib.mjs";

function parseDate(dateLike) {
  if (!dateLike) {
    return null;
  }
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function formatAgeMinutes(ageMinutes) {
  if (ageMinutes === null) {
    return "-";
  }
  if (ageMinutes < 1) {
    return "1 分钟内";
  }
  if (ageMinutes < 60) {
    return `${ageMinutes} 分钟`;
  }
  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;
  if (minutes === 0) {
    return `${hours} 小时`;
  }
  return `${hours} 小时 ${minutes} 分钟`;
}

function summarizeAge(dateLike, now = new Date()) {
  const date = parseDate(dateLike);
  if (!date) {
    return {
      ageMinutes: null,
      ageText: "-",
    };
  }
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const ageMinutes = Math.round(diffMs / 60000);
  return {
    ageMinutes,
    ageText: formatAgeMinutes(ageMinutes),
  };
}

function normalizeRuntimeContextString(value, fallback = "unknown") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeBootModes(values) {
  const modes = uniqueStrings(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeRuntimeContextString(item, ""))
      .filter(Boolean),
  );
  return modes.length > 0 ? modes : ["unknown"];
}

export function normalizeZoteroVersionBucket(version) {
  const normalizedVersion = normalizeRuntimeContextString(version);
  if (normalizedVersion === "unknown") {
    return "unknown";
  }

  const matcher = normalizedVersion.match(/(\d+)\.(\d+)/u);
  if (!matcher) {
    return "unknown";
  }

  const majorMinor = `${matcher[1]}.${matcher[2]}`;
  const lower = normalizedVersion.toLowerCase();
  let channel = "stable";
  if (lower.includes("alpha")) {
    channel = "alpha";
  } else if (lower.includes("beta")) {
    channel = "beta";
  } else if (lower.includes("rc")) {
    channel = "rc";
  }
  return `${majorMinor}-${channel}`;
}

export function summarizeRuntimeContext(source = {}) {
  const runtimeContext = source?.runtimeContext && typeof source.runtimeContext === "object"
    ? source.runtimeContext
    : null;
  const cycles = Array.isArray(source?.cycles) ? source.cycles : [];
  const latestCycle = source?.latestCycle && typeof source.latestCycle === "object"
    ? source.latestCycle
    : (cycles[cycles.length - 1] || null);
  const explicitBootModes = Array.isArray(runtimeContext?.bootModes)
    ? runtimeContext.bootModes
    : (Array.isArray(source?.bootModes) ? source.bootModes : []);
  const cycleBootModes = cycles.map((cycle) => cycle?.bootMode);
  const bootModes = normalizeBootModes([
    ...explicitBootModes,
    ...cycleBootModes,
  ]);
  const latestBootMode = normalizeRuntimeContextString(
    runtimeContext?.latestBootMode
    || source?.latestBootMode
    || latestCycle?.bootMode,
  );
  const zoteroVersion = normalizeRuntimeContextString(
    runtimeContext?.zoteroVersion
    || source?.zoteroVersion
    || latestCycle?.zoteroVersion,
  );
  const zoteroVersionBucket = normalizeZoteroVersionBucket(
    runtimeContext?.zoteroVersionBucket
    || source?.zoteroVersionBucket
    || zoteroVersion,
  );
  const contextObserved = Boolean(
    runtimeContext
    || Array.isArray(source?.bootModes)
    || Object.prototype.hasOwnProperty.call(source || {}, "latestBootMode")
    || Object.prototype.hasOwnProperty.call(source || {}, "zoteroVersion")
    || cycles.some((cycle) => (
      cycle
      && typeof cycle === "object"
      && (
        Object.prototype.hasOwnProperty.call(cycle, "bootMode")
        || Object.prototype.hasOwnProperty.call(cycle, "zoteroVersion")
      )
    )),
  );

  return {
    contextObserved,
    zoteroVersion,
    zoteroVersionBucket,
    latestBootMode,
    bootModes,
  };
}

function pickE2EStatusLabel(status) {
  switch (status) {
    case "passed":
      return "通过";
    case "failed":
      return "失败";
    case "missing":
      return "缺失";
    default:
      return "未知";
  }
}

function pickAutofixStatusLabel(status) {
  switch (status) {
    case "clean":
      return "无需恢复";
    case "recovered":
      return "已恢复";
    case "unrecovered":
      return "未恢复";
    case "missing":
      return "缺失";
    default:
      return "未知";
  }
}

function pickWatchRecoveryStatusLabel(status) {
  switch (status) {
    case "passed":
      return "通过";
    case "failed":
      return "失败";
    case "missing":
      return "缺失";
    default:
      return "未知";
  }
}

export function pickUnsupportedDiagnosisCategoryLabel(category) {
  switch (String(category || "").trim()) {
    case "generic-runtime-failure":
      return "泛化运行时失败";
    case "behavioral-regression":
      return "行为回归";
    case "environment-or-host":
      return "环境或宿主噪声";
    case "unsafe-cross-file":
      return "跨文件高风险回归";
    default:
      return "未分类阻塞";
  }
}

export function pickPatchApplicationStatusLabel(status) {
  switch (status) {
    case "applied":
      return "已应用";
    case "partial":
      return "部分应用";
    case "precheck-failed":
      return "预检失败";
    case "not-applicable":
      return "不适用";
    case "no-drafts":
      return "无补丁草案";
    case "missing-plan":
      return "缺少补丁计划";
    case "not-attempted":
      return "未尝试";
    default:
      return "未知";
  }
}

export function pickPatchBlockReasonLabel(reason) {
  switch (reason) {
    case "whitelist-rule-missing":
      return "白名单规则缺失";
    case "whitelist-rule-mismatch":
      return "白名单规则不匹配";
    case "rule-draft-unresolved":
      return "白名单草案无法重建";
    case "draft-count-mismatch":
      return "补丁草案数量不一致";
    case "draft-mismatch":
      return "补丁草案内容与白名单不一致";
    case "target-outside-whitelist":
      return "目标文件超出白名单范围";
    case "touched-files-limit-exceeded":
      return "补丁触达文件数超出规则上限";
    case "target-file-missing":
      return "目标文件缺失";
    case "target-file-exists":
      return "目标文件已存在";
    case "source-report-missing":
      return "最新 E2E 报告缺失";
    case "source-not-in-latest-e2e":
      return "补丁来源不在最新 E2E 证据内";
    case "visual-target-mismatch":
      return "视觉补丁目标与来源类型不匹配";
    case "visual-draft-set-mismatch":
      return "视觉补丁草案集合与最新 E2E 漂移证据不一致";
    case "source-file-missing":
      return "补丁来源文件缺失";
    case "source-file-outside-project":
      return "补丁来源文件超出项目范围";
    case "source-hash-mismatch":
      return "补丁来源文件哈希不匹配";
    case "draft-content-hash-mismatch":
      return "补丁草案内容哈希不匹配";
    case "anchor-not-found":
      return "锚点不存在";
    case "anchor-not-unique":
      return "锚点不唯一";
    case "before-context-mismatch":
      return "锚点前文不匹配";
    case "after-context-mismatch":
      return "锚点后文不匹配";
    case "block-anchor-mismatch":
      return "块级锚点不匹配";
    case "module-structure-drift":
      return "模块 import/export 结构漂移";
    case "target-already-contains-snippet":
      return "目标已包含补丁片段";
    case "target-already-current":
      return "目标已是最新内容";
    case "applied":
      return "已应用";
    case "ready":
      return "可应用";
    default:
      return "未知原因";
  }
}

export function pickPatchOperationLabel(operation) {
  switch (String(operation || "").trim().toLowerCase()) {
    case "create":
      return "创建文件";
    case "append":
      return "追加内容";
    case "replace":
      return "替换内容";
    case "copy":
      return "刷新基线";
    case "replace-block":
      return "替换代码块";
    case "insert":
      return "插入内容";
    default:
      return "未知操作";
  }
}

const SEVERITY_RANK = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

function isBlockingSeverity(severity) {
  return (SEVERITY_RANK[String(severity || "").toLowerCase()] || 0) >= SEVERITY_RANK.high;
}

function summarizeDiagnosis(diagnosis) {
  if (!diagnosis || typeof diagnosis !== "object") {
    return null;
  }
  return {
    fingerprint: normalizeDiagnosisFingerprint(diagnosis.fingerprint) || null,
    feature: diagnosis.feature || null,
    featureLabel: diagnosis.featureLabel || diagnosis.feature || null,
    severity: diagnosis.severity || null,
    confidence: Number(diagnosis.confidence || 0),
    summary: diagnosis.summary || diagnosis.issue || null,
    issue: diagnosis.issue || null,
    candidateFiles: Array.isArray(diagnosis.candidateFiles) ? diagnosis.candidateFiles.slice(0, 5) : [],
    recommendedActions: Array.isArray(diagnosis.recommendedActions) ? diagnosis.recommendedActions.slice(0, 3) : [],
    cycleIndex: Number.isFinite(diagnosis.cycleIndex) ? diagnosis.cycleIndex : null,
  };
}

function summarizePatchApplicationIssues(patchApplication) {
  const results = Array.isArray(patchApplication?.results)
    ? patchApplication.results
    : [];
  const issueMap = new Map();
  results.forEach((item) => {
    const reason = String(item?.reason || "").trim();
    if (!reason || reason === "ready" || reason === "applied") {
      return;
    }
    if (!issueMap.has(reason)) {
      issueMap.set(reason, {
        count: 0,
        files: new Set(),
      });
    }
    const entry = issueMap.get(reason);
    entry.count += 1;
    const file = String(item?.file || "").trim();
    if (file) {
      entry.files.add(file);
    }
  });

  return Array.from(issueMap.entries())
    .map(([reason, data]) => ({
      reason,
      label: pickPatchBlockReasonLabel(reason),
      count: data.count,
      files: Array.from(data.files).slice(0, 3),
      fileCount: data.files.size,
    }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function summarizePatchDraftOperations(patchPlan) {
  const drafts = Array.isArray(patchPlan?.patchDrafts) ? patchPlan.patchDrafts : [];
  const operationMap = new Map();

  drafts.forEach((draft) => {
    const operation = String(draft?.operation || "insert").trim().toLowerCase() || "insert";
    operationMap.set(operation, (operationMap.get(operation) || 0) + 1);
  });

  return Array.from(operationMap.entries())
    .map(([operation, count]) => ({
      operation,
      label: pickPatchOperationLabel(operation),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.operation.localeCompare(b.operation));
}

function getVerificationKindLabel(kind) {
  switch (String(kind || "").trim()) {
    case "all-cycle-check":
      return "跨轮次检查";
    case "latest-cycle-check":
      return "最新轮次检查";
    case "report-field":
      return "聚合报告字段";
    default:
      return "未知检查";
  }
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

function sortVerificationChecks(checks = []) {
  return (Array.isArray(checks) ? checks : [])
    .filter((item) => item && typeof item === "object")
    .slice()
    .sort((a, b) => {
      const rankDiff = getVerificationKindRank(a?.kind) - getVerificationKindRank(b?.kind);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      const labelDiff = String(a?.label || a?.id || "").localeCompare(String(b?.label || b?.id || ""));
      if (labelDiff !== 0) {
        return labelDiff;
      }
      return String(a?.id || "").localeCompare(String(b?.id || ""));
    });
}

function normalizeVerificationKindEntries(entries = []) {
  const kindMap = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const kind = String(entry?.kind || "").trim();
    if (!kind) {
      return;
    }
    const count = Number(entry?.count || 0);
    if (!Number.isFinite(count) || count <= 0) {
      return;
    }
    if (!kindMap.has(kind)) {
      kindMap.set(kind, {
        kind,
        label: getVerificationKindLabel(kind),
        count: 0,
      });
    }
    kindMap.get(kind).count += count;
  });

  return Array.from(kindMap.values())
    .sort((a, b) => {
      const rankDiff = getVerificationKindRank(a.kind) - getVerificationKindRank(b.kind);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      const labelDiff = String(a.label || "").localeCompare(String(b.label || ""));
      if (labelDiff !== 0) {
        return labelDiff;
      }
      return String(a.kind || "").localeCompare(String(b.kind || ""));
    });
}

function summarizeVerificationKindEntries(checks = []) {
  const kindMap = new Map();
  sortVerificationChecks(checks).forEach((check) => {
    const kind = String(check?.kind || "").trim();
    if (!kind) {
      return;
    }
    if (!kindMap.has(kind)) {
      kindMap.set(kind, {
        kind,
        label: getVerificationKindLabel(kind),
        count: 0,
      });
    }
    kindMap.get(kind).count += 1;
  });
  return normalizeVerificationKindEntries(Array.from(kindMap.values()));
}

function normalizeVerificationFailedChecks(entries = [], required) {
  return sortVerificationChecks((Array.isArray(entries) ? entries : []).map((check) => ({
    ...check,
    required,
    satisfied: false,
  })));
}

export function summarizeVerificationContractStats(verificationContract) {
  const checks = sortVerificationChecks(Array.isArray(verificationContract?.checks)
    ? verificationContract.checks
    : []);
  const requiredChecks = checks.filter((check) => check?.required !== false);
  const optionalChecks = checks.filter((check) => check?.required === false);
  const failedChecksSorted = requiredChecks.filter((check) => check?.satisfied !== true);
  const optionalFailedChecksSorted = optionalChecks.filter((check) => check?.satisfied !== true);
  const computed = {
    requiredTotal: requiredChecks.length,
    requiredPassed: requiredChecks.filter((check) => check?.satisfied === true).length,
    requiredFailed: failedChecksSorted.length,
    optionalTotal: optionalChecks.length,
    optionalPassed: optionalChecks.filter((check) => check?.satisfied === true).length,
    optionalFailed: optionalFailedChecksSorted.length,
    failedChecksSorted,
    optionalFailedChecksSorted,
    failedCheckIds: uniqueStrings(failedChecksSorted.map((check) => check?.id)),
    optionalFailedCheckIds: uniqueStrings(optionalFailedChecksSorted.map((check) => check?.id)),
    failedCheckKinds: summarizeVerificationKindEntries(failedChecksSorted),
    optionalFailedCheckKinds: summarizeVerificationKindEntries(optionalFailedChecksSorted),
  };

  const requiredTotal = Number(verificationContract?.requiredTotal);
  const requiredPassed = Number(verificationContract?.requiredPassed);
  const requiredFailed = Number(verificationContract?.requiredFailed);
  const optionalTotal = Number(verificationContract?.optionalTotal);
  const optionalPassed = Number(verificationContract?.optionalPassed);
  const optionalFailed = Number(verificationContract?.optionalFailed);

  return {
    requiredTotal: Number.isFinite(requiredTotal) ? requiredTotal : computed.requiredTotal,
    requiredPassed: Number.isFinite(requiredPassed) ? requiredPassed : computed.requiredPassed,
    requiredFailed: Number.isFinite(requiredFailed) ? requiredFailed : computed.requiredFailed,
    optionalTotal: Number.isFinite(optionalTotal) ? optionalTotal : computed.optionalTotal,
    optionalPassed: Number.isFinite(optionalPassed) ? optionalPassed : computed.optionalPassed,
    optionalFailed: Number.isFinite(optionalFailed) ? optionalFailed : computed.optionalFailed,
    failedChecksSorted: computed.failedChecksSorted.length > 0
      ? computed.failedChecksSorted
      : normalizeVerificationFailedChecks(verificationContract?.failedChecks, true),
    optionalFailedChecksSorted: computed.optionalFailedChecksSorted.length > 0
      ? computed.optionalFailedChecksSorted
      : normalizeVerificationFailedChecks(verificationContract?.optionalFailedChecks, false),
    failedCheckIds: Array.isArray(verificationContract?.failedCheckIds)
      ? uniqueStrings(verificationContract.failedCheckIds)
      : computed.failedCheckIds,
    optionalFailedCheckIds: Array.isArray(verificationContract?.optionalFailedCheckIds)
      ? uniqueStrings(verificationContract.optionalFailedCheckIds)
      : computed.optionalFailedCheckIds,
    failedCheckKinds: Array.isArray(verificationContract?.failedCheckKinds)
      ? normalizeVerificationKindEntries(verificationContract.failedCheckKinds)
      : computed.failedCheckKinds,
    optionalFailedCheckKinds: Array.isArray(verificationContract?.optionalFailedCheckKinds)
      ? normalizeVerificationKindEntries(verificationContract.optionalFailedCheckKinds)
      : computed.optionalFailedCheckKinds,
  };
}

function summarizeServiceHealth(report, latestCycle) {
  const isRecoverableMissingKeyServiceDegradation = (services) => {
    const list = Array.isArray(services) ? services : [];
    const unhealthy = list.filter((service) => {
      if (!service || typeof service !== "object") {
        return false;
      }
      const status = String(service?.status || "").trim().toLowerCase();
      return service?.health?.ok === false || status === "degraded";
    });
    if (unhealthy.length === 0) {
      return false;
    }
    return unhealthy.every((service) => {
      const serviceID = String(service?.id || "").trim();
      const details = service?.health?.details && typeof service.health.details === "object"
        ? service.health.details
        : {};
      const errors = Array.isArray(details?.errors)
        ? details.errors.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
      return (
        serviceID.endsWith(".ai-runtime")
        && details.configValid === false
        && details.readerChatInitialized === true
        && details.annotationAIInitialized === true
        && errors.length > 0
        && errors.every((entry) => entry === "API key is required for non-local providers")
      );
    });
  };

  const reportServiceSummary = report?.serviceSummary && typeof report.serviceSummary === "object"
    ? report.serviceSummary
    : null;
  const cycleChecks = latestCycle?.checks && typeof latestCycle.checks === "object"
    ? latestCycle.checks
    : null;

  const hasCycleServiceChecks = Boolean(
    cycleChecks
    && (
      Object.prototype.hasOwnProperty.call(cycleChecks, "serviceTotal")
      || Object.prototype.hasOwnProperty.call(cycleChecks, "serviceHealthyCount")
      || Object.prototype.hasOwnProperty.call(cycleChecks, "serviceUnhealthyCount")
      || Object.prototype.hasOwnProperty.call(cycleChecks, "serviceHealthOK")
      || Object.prototype.hasOwnProperty.call(cycleChecks, "serviceStatus")
    ),
  );
  const source = reportServiceSummary || cycleChecks || null;
  const observed = Boolean(reportServiceSummary || hasCycleServiceChecks);
  const serviceDetails = Array.isArray(cycleChecks?.services)
    ? cycleChecks.services
    : Array.isArray(reportServiceSummary?.services)
      ? reportServiceSummary.services
      : [];
  const serviceIssues = uniqueStrings([
    ...(Array.isArray(report?.issues) ? report.issues : []).filter((item) => String(item).includes("服务健康")),
    ...(Array.isArray(latestCycle?.issues) ? latestCycle.issues : []).filter((item) => String(item).includes("服务健康")),
  ]).slice(0, 3);

  return {
    serviceObserved: observed,
    serviceTotal: Number(source?.serviceTotal || source?.total || 0),
    serviceHealthyCount: Number(source?.serviceHealthyCount || source?.healthy || 0),
    serviceUnhealthyCount: Number(source?.serviceUnhealthyCount || source?.unhealthy || 0),
    serviceHealthOK: observed ? Boolean(source?.serviceHealthOK ?? source?.healthOK ?? true) : true,
    serviceStatus: observed ? String(source?.serviceStatus || source?.status || "unknown") : "unknown",
    serviceRecoverableMissingKey: isRecoverableMissingKeyServiceDegradation(serviceDetails),
    serviceIssues,
  };
}

function countFailedBooleanChecks(cycles, field) {
  return (Array.isArray(cycles) ? cycles : []).reduce((sum, cycle) => {
    const checks = cycle?.checks && typeof cycle.checks === "object" ? cycle.checks : null;
    if (!checks || !Object.prototype.hasOwnProperty.call(checks, field)) {
      return sum;
    }
    return sum + (checks[field] === false ? 1 : 0);
  }, 0);
}

function countThresholdFailedChecks(cycles, field, minimum = 1) {
  return (Array.isArray(cycles) ? cycles : []).reduce((sum, cycle) => {
    const checks = cycle?.checks && typeof cycle.checks === "object" ? cycle.checks : null;
    if (!checks || !Object.prototype.hasOwnProperty.call(checks, field)) {
      return sum;
    }
    return sum + (Number(checks[field] || 0) < minimum ? 1 : 0);
  }, 0);
}

function summarizeRegistrationHealth(cycles, latestCycle) {
  const latestChecks = latestCycle?.checks && typeof latestCycle.checks === "object"
    ? latestCycle.checks
    : null;
  const observed = Boolean((Array.isArray(cycles) ? cycles : []).some((cycle) => {
    const checks = cycle?.checks && typeof cycle.checks === "object" ? cycle.checks : null;
    if (!checks) {
      return false;
    }
    return (
      Object.prototype.hasOwnProperty.call(checks, "primaryActionCommandRegistered")
      || Object.prototype.hasOwnProperty.call(checks, "contextActionMenuRegistered")
      || Object.prototype.hasOwnProperty.call(checks, "readerSummaryCommandRegistered")
      || Object.prototype.hasOwnProperty.call(checks, "readerSummaryMenuRegistered")
      || Object.prototype.hasOwnProperty.call(checks, "preferencePaneRegistered")
      || Object.prototype.hasOwnProperty.call(checks, "preferencePaneCount")
      || Object.prototype.hasOwnProperty.call(checks, "officialMenuAPIAvailable")
    );
  }));

  return {
    registrationObserved: observed,
    officialMenuAPIAvailable: observed && latestChecks && Object.prototype.hasOwnProperty.call(latestChecks, "officialMenuAPIAvailable")
      ? Boolean(latestChecks.officialMenuAPIAvailable)
      : null,
    primaryActionCommandRegistered: observed && latestChecks && Object.prototype.hasOwnProperty.call(latestChecks, "primaryActionCommandRegistered")
      ? Boolean(latestChecks.primaryActionCommandRegistered)
      : null,
    contextActionMenuRegistered: observed && latestChecks && Object.prototype.hasOwnProperty.call(latestChecks, "contextActionMenuRegistered")
      ? Boolean(latestChecks.contextActionMenuRegistered)
      : null,
    readerSummaryCommandRegistered: observed && latestChecks && Object.prototype.hasOwnProperty.call(latestChecks, "readerSummaryCommandRegistered")
      ? Boolean(latestChecks.readerSummaryCommandRegistered)
      : null,
    readerSummaryMenuRegistered: observed && latestChecks && Object.prototype.hasOwnProperty.call(latestChecks, "readerSummaryMenuRegistered")
      ? Boolean(latestChecks.readerSummaryMenuRegistered)
      : null,
    preferencePaneRegistered: observed && latestChecks && Object.prototype.hasOwnProperty.call(latestChecks, "preferencePaneRegistered")
      ? Boolean(latestChecks.preferencePaneRegistered)
      : null,
    preferencePaneCount: observed && latestChecks && Object.prototype.hasOwnProperty.call(latestChecks, "preferencePaneCount")
      ? Number(latestChecks.preferencePaneCount || 0)
      : 0,
    primaryActionCommandMissingCycles: countFailedBooleanChecks(cycles, "primaryActionCommandRegistered"),
    contextActionMenuMissingCycles: countFailedBooleanChecks(cycles, "contextActionMenuRegistered"),
    readerSummaryCommandMissingCycles: countFailedBooleanChecks(cycles, "readerSummaryCommandRegistered"),
    readerSummaryMenuMissingCycles: countFailedBooleanChecks(cycles, "readerSummaryMenuRegistered"),
    preferencePaneMissingCycles: countFailedBooleanChecks(cycles, "preferencePaneRegistered"),
    preferencePaneCountMissingCycles: countThresholdFailedChecks(cycles, "preferencePaneCount", 1),
  };
}

function getBooleanField(source, field) {
  if (!source || typeof source !== "object") {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(source, field)) {
    return null;
  }
  return Boolean(source[field]);
}

function getNumericField(source, field) {
  if (!source || typeof source !== "object") {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(source, field)) {
    return null;
  }
  const value = Number(source[field]);
  return Number.isFinite(value) ? value : null;
}

function getArrayField(source, field) {
  if (!source || typeof source !== "object") {
    return [];
  }
  return Array.isArray(source[field]) ? source[field] : [];
}

function pickReaderEventStatusLabel(status) {
  switch (status) {
    case "passed":
      return "通过";
    case "failed":
      return "异常";
    case "missing":
      return "缺失";
    default:
      return "未知";
  }
}

function summarizeReaderEventBridge(report, latestCycle) {
  const latestChecks = latestCycle?.checks && typeof latestCycle.checks === "object"
    ? latestCycle.checks
    : null;
  const scenarioResults = Array.isArray(latestCycle?.scenarios?.results)
    ? latestCycle.scenarios.results
    : [];
  const hookScenario = scenarioResults.find((item) => item?.name === "reader event hook diagnostics") || null;
  const fineGrainedScenario = scenarioResults.find((item) => item?.name === "reader fine-grained hook diagnostics") || null;
  const directReport = [
    latestCycle?.eventAPIReport,
    report?.eventAPIReport,
    hookScenario?.details?.eventAPIReport,
    fineGrainedScenario?.details?.eventAPIReport,
  ].find((item) => item && typeof item === "object") || null;

  const registeredTypes = uniqueStrings([
    ...getArrayField(latestChecks, "readerEventRegisteredTypes"),
    ...getArrayField(directReport, "registeredTypes"),
    ...(Array.isArray(hookScenario?.details?.snapshot?.eventListeners)
      ? hookScenario.details.snapshot.eventListeners.map((item) => item?.type)
      : []),
    ...getArrayField(fineGrainedScenario?.details?.snapshot, "eventTypes"),
  ]);
  const knownTypes = uniqueStrings([
    ...getArrayField(directReport, "knownTypes"),
    ...getArrayField(hookScenario?.details?.snapshot, "knownTypes"),
    ...getArrayField(fineGrainedScenario?.details?.snapshot, "knownTypes"),
  ]);
  const probeCompatibleTypes = uniqueStrings([
    ...getArrayField(latestChecks, "readerEventProbeTypes"),
    ...getArrayField(directReport, "probeCompatibleTypes"),
    ...getArrayField(hookScenario?.details?.snapshot, "probeCompatibleTypes"),
    ...getArrayField(fineGrainedScenario?.details?.snapshot, "probeCompatibleTypes"),
  ]);
  const probeObservedTypes = uniqueStrings([
    fineGrainedScenario?.details?.selectionProbe?.type,
    fineGrainedScenario?.details?.toolbarProbe?.type,
    fineGrainedScenario?.details?.sidebarHeaderProbe?.type,
    ...(Array.isArray(fineGrainedScenario?.details?.menuProbes)
      ? fineGrainedScenario.details.menuProbes.map((item) => item?.type)
      : []),
    ...(Array.isArray(fineGrainedScenario?.details?.probeEvents)
      ? fineGrainedScenario.details.probeEvents
        .map((item) => item?.type)
        .filter((type) => READER_EVENT_PROBE_COMPATIBLE_TYPES.includes(type))
      : []),
  ]);
  const hookObservedTypes = uniqueStrings([
    hookScenario?.details?.firstInvocation?.type,
    ...(Array.isArray(hookScenario?.details?.snapshot?.eventListeners)
      ? hookScenario.details.snapshot.eventListeners.map((item) => item?.type)
      : []),
    fineGrainedScenario?.details?.toolbarProbe?.type,
  ]);
  const hostObservedTypes = uniqueStrings([
    ...hookObservedTypes,
    ...probeObservedTypes,
  ]);
  const dispatchModes = uniqueStrings([
    ...getArrayField(latestChecks, "readerEventDispatchModes"),
    ...getArrayField(directReport, "probeDispatchModes"),
    fineGrainedScenario?.details?.selectionProbe?.dispatchMode,
    fineGrainedScenario?.details?.sidebarHeaderProbe?.dispatchMode,
    fineGrainedScenario?.details?.toolbarProbe?.dispatchMode,
    ...(Array.isArray(fineGrainedScenario?.details?.menuProbes)
      ? fineGrainedScenario.details.menuProbes.map((item) => item?.dispatchMode)
      : []),
    ...(Array.isArray(fineGrainedScenario?.details?.probeEvents)
      ? fineGrainedScenario.details.probeEvents.map((item) => item?.dispatchMode)
      : []),
  ]);
  const missingKnownTypes = knownTypes.length > 0
    ? uniqueStrings(READER_EVENT_KNOWN_TYPES.filter((type) => !knownTypes.includes(type)))
    : [];
  const missingProbeCompatibleTypes = probeCompatibleTypes.length > 0
    ? uniqueStrings(READER_EVENT_PROBE_COMPATIBLE_TYPES.filter((type) => !probeCompatibleTypes.includes(type)))
    : [];
  const unobservedProbeTypes = uniqueStrings(
    READER_EVENT_PROBE_COMPATIBLE_TYPES.filter((type) => !probeObservedTypes.includes(type)),
  );

  const hookScenarioStatus = hookScenario
    ? (hookScenario.status === "passed" ? "passed" : "failed")
    : "missing";
  const fineGrainedScenarioStatus = fineGrainedScenario
    ? (fineGrainedScenario.status === "passed" ? "passed" : "failed")
    : "missing";
  const available = getBooleanField(latestChecks, "readerEventAPIAvailable")
    ?? (typeof directReport?.available === "boolean" ? Boolean(directReport.available) : null)
    ?? ((hookScenarioStatus === "passed" || fineGrainedScenarioStatus === "passed") ? true : null);
  const registeredCount = getNumericField(latestChecks, "readerEventListenerCount")
    ?? getNumericField(directReport, "registeredCount")
    ?? getNumericField(hookScenario?.details?.snapshot, "eventListenerCount")
    ?? (registeredTypes.length > 0 ? registeredTypes.length : 0);
  const knownTypeCount = getNumericField(latestChecks, "readerEventKnownTypeCount")
    ?? (knownTypes.length > 0 ? knownTypes.length : null);
  const probeCompatibleTypeCount = getNumericField(latestChecks, "readerEventProbeTypeCount")
    ?? (probeCompatibleTypes.length > 0 ? probeCompatibleTypes.length : null);
  const syntheticFallbackAvailable = getBooleanField(latestChecks, "readerEventSyntheticFallbackAvailable")
    ?? (typeof directReport?.syntheticFallbackAvailable === "boolean"
      ? Boolean(directReport.syntheticFallbackAvailable)
      : null)
    ?? (dispatchModes.includes("synthetic-fallback") ? true : null);
  const observedScenarioNames = uniqueStrings([
    hookScenario?.name,
    fineGrainedScenario?.name,
  ]);
  const observed = Boolean(
    directReport
    || hookScenario
    || fineGrainedScenario
    || (
      latestChecks
      && (
        Object.prototype.hasOwnProperty.call(latestChecks, "readerEventAPIAvailable")
        || Object.prototype.hasOwnProperty.call(latestChecks, "readerEventListenerCount")
        || Object.prototype.hasOwnProperty.call(latestChecks, "readerEventKnownTypeCount")
        || Object.prototype.hasOwnProperty.call(latestChecks, "readerEventProbeTypeCount")
        || Object.prototype.hasOwnProperty.call(latestChecks, "readerEventSyntheticFallbackAvailable")
      )
    ),
  );
  const knownTypeCoverageOK = knownTypes.length > 0
    ? missingKnownTypes.length === 0
    : (knownTypeCount === null || knownTypeCount >= READER_EVENT_KNOWN_TYPES.length);
  const probeTypeCoverageOK = probeCompatibleTypes.length > 0
    ? missingProbeCompatibleTypes.length === 0
    : (probeCompatibleTypeCount === null || probeCompatibleTypeCount >= READER_EVENT_PROBE_COMPATIBLE_TYPES.length);
  const declarationCoverageOK = knownTypeCoverageOK && probeTypeCoverageOK;
  const toolbarHookObserved = hostObservedTypes.includes("renderToolbar");

  let status = "missing";
  if (observed) {
    status = available === false
      || hookScenarioStatus === "failed"
      || fineGrainedScenarioStatus === "failed"
      || declarationCoverageOK === false
      ? "failed"
      : "passed";
  }

  let note = "当前报告未采集 Reader 事件桥摘要";
  if (status === "passed") {
    note = dispatchModes.includes("synthetic-fallback")
      ? "Reader 事件桥已观测到宿主 Hook，细粒度探针可通过 synthetic-fallback 回放。"
      : "Reader 事件桥已完成宿主与细粒度观测。";
    if (unobservedProbeTypes.length > 0) {
      note += ` 仍有未在本轮主动观测到的 probe 类型：${unobservedProbeTypes.join("、")}。`;
    }
  } else if (status === "failed") {
    const noteParts = ["Reader 事件桥观测到异常，请检查事件 API、声明式类型清单与 Hook 场景结果。"];
    if (missingKnownTypes.length > 0) {
      noteParts.push(`缺少已知类型：${missingKnownTypes.join("、")}。`);
    }
    if (missingProbeCompatibleTypes.length > 0) {
      noteParts.push(`缺少 probe-compatible 类型：${missingProbeCompatibleTypes.join("、")}。`);
    }
    note = noteParts.join(" ");
  }

  return {
    present: observed,
    status,
    statusLabel: pickReaderEventStatusLabel(status),
    available,
    registeredCount,
    registeredTypes,
    knownTypeCount,
    knownTypes: knownTypes.slice(0, 16),
    probeCompatibleTypeCount,
    probeCompatibleTypes: probeCompatibleTypes.slice(0, 16),
    probeObservedTypeCount: probeObservedTypes.length,
    probeObservedTypes: probeObservedTypes.slice(0, 16),
    hostObservedTypeCount: hostObservedTypes.length,
    hostObservedTypes: hostObservedTypes.slice(0, 16),
    missingKnownTypes,
    missingProbeCompatibleTypes,
    unobservedProbeTypes,
    syntheticFallbackAvailable,
    toolbarHookObserved,
    toolbarDispatchMode: fineGrainedScenario?.details?.toolbarProbe?.dispatchMode || null,
    dispatchModes,
    observedScenarioNames,
    hookScenarioStatus,
    hookScenarioStatusLabel: pickReaderEventStatusLabel(hookScenarioStatus),
    fineGrainedScenarioStatus,
    fineGrainedScenarioStatusLabel: pickReaderEventStatusLabel(fineGrainedScenarioStatus),
    note,
  };
}

function hasObservedReaderHostValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function summarizeToolbarEvidence(readerEventReport) {
  if (!readerEventReport || readerEventReport.present !== true) {
    return null;
  }

  const parts = [
    readerEventReport.toolbarHookObserved ? "renderToolbar 宿主点已观测" : "renderToolbar 宿主点未观测",
    `Hook ${readerEventReport.hookScenarioStatusLabel || pickReaderEventStatusLabel(readerEventReport.hookScenarioStatus)}`,
    `细粒度 ${readerEventReport.fineGrainedScenarioStatusLabel || pickReaderEventStatusLabel(readerEventReport.fineGrainedScenarioStatus)}`,
  ];

  if (readerEventReport.toolbarDispatchMode) {
    parts.push(`分发 ${readerEventReport.toolbarDispatchMode}`);
  } else if (readerEventReport.fineGrainedScenarioStatus === "failed") {
    parts.push("分发待补证");
  }

  return parts.join("；");
}

function formatVisualEvidenceSummaryLabel(item) {
  const explicitTarget = String(item?.canonicalTarget || "").trim();
  if (explicitTarget) {
    const basename = explicitTarget.split(/[\\/]/u).pop() || explicitTarget;
    const withoutExtension = basename.replace(/\.[^.]+$/u, "");
    const normalized = withoutExtension.replace(/[-_]+/gu, " ").trim();
    if (normalized) {
      return normalized;
    }
  }

  const bootMode = String(item?.bootMode || "").trim();
  const kind = String(item?.kind || "visual").trim() || "visual";
  return `${bootMode ? `${bootMode} ` : ""}${kind}`.trim();
}

function summarizeVisualEvidenceItem(item) {
  const label = formatVisualEvidenceSummaryLabel(item);
  const issues = Array.isArray(item?.issues) ? item.issues : [];
  if (item?.geometryMatched === false) {
    const actualWidth = Number(item?.actualWidth);
    const actualHeight = Number(item?.actualHeight);
    const baselineWidth = Number(item?.baselineWidth);
    const baselineHeight = Number(item?.baselineHeight);
    const actualSize = formatVisualSize(actualWidth, actualHeight);
    const baselineSize = formatVisualSize(baselineWidth, baselineHeight);
    if (actualSize && baselineSize) {
      return `${label} 尺寸漂移 ${actualSize} / ${baselineSize}`;
    }
    return `${label} 尺寸漂移`;
  }

  const changedRatio = normalizeVisualMetricNumber(item?.changedRatio);
  const meanChannelDiff = normalizeVisualMetricNumber(item?.meanChannelDiff);
  if (changedRatio !== null || meanChannelDiff !== null) {
    return `${label} 漂移 ${formatMaybePercent(changedRatio)} / ${formatMaybeNumber(meanChannelDiff)}`;
  }

  if (issues.some((entry) => /geometry/i.test(String(entry || "")))) {
    return `${label} 基线几何不匹配`;
  }
  if (issues.includes("capture-missing")) {
    return `${label} 截图缺失`;
  }
  if (issues.includes("baseline-missing")) {
    return `${label} 基线缺失`;
  }

  return `${label} 漂移`;
}

function summarizeVisualEvidence(latestCycle, visualEvidence = null) {
  const failingItems = Array.isArray(visualEvidence?.items) ? visualEvidence.items : [];
  if (failingItems.length > 0) {
    const parts = failingItems
      .slice(0, 4)
      .map((item) => summarizeVisualEvidenceItem(item))
      .filter(Boolean);
    if (parts.length > 0) {
      return `${parts.join("；")}${failingItems.length > parts.length ? `；其余 ${failingItems.length - parts.length} 项见证据索引` : ""}`;
    }
  }

  const baselines = Array.isArray(latestCycle?.visuals?.analysis?.baselines)
    ? latestCycle.visuals.analysis.baselines
    : [];
  if (baselines.length > 0) {
    const parts = baselines.slice(0, 4).map((entry) => {
      const kind = String(entry?.kind || "visual").trim() || "visual";
      if (entry?.status === "missing") {
        return `${kind} 基线缺失`;
      }
      if (entry?.status === "error") {
        return `${kind} 基线异常`;
      }
      if (entry?.ok === true) {
        return `${kind} 已对齐`;
      }

      const metrics = entry?.metrics && typeof entry.metrics === "object"
        ? entry.metrics
        : null;
      if (metrics?.sameDimensions === false) {
        return `${kind} 尺寸漂移 ${metrics.actualWidth}x${metrics.actualHeight} / ${metrics.baselineWidth}x${metrics.baselineHeight}`;
      }
      if (metrics && (Number.isFinite(metrics.changedRatio) || Number.isFinite(metrics.meanChannelDiff))) {
        const changedRatio = Number.isFinite(metrics.changedRatio)
          ? `${(Number(metrics.changedRatio) * 100).toFixed(2)}%`
          : "-";
        const meanChannelDiff = Number.isFinite(metrics.meanChannelDiff)
          ? Number(metrics.meanChannelDiff).toFixed(2)
          : "-";
        return `${kind} 漂移 ${changedRatio} / ${meanChannelDiff}`;
      }
      return `${kind} 漂移`;
    });
    return parts.length > 0 ? parts.join("；") : null;
  }

  const baselineSummary = latestCycle?.visuals?.analysis?.summary?.baseline;
  if (!baselineSummary || typeof baselineSummary !== "object") {
    return null;
  }
  const driftCount = Number(baselineSummary.driftCount || 0);
  const missingCount = Number(baselineSummary.missingCount || 0);
  const comparedCount = Number(baselineSummary.comparedCount || 0);
  if (driftCount > 0) {
    return `视觉基线漂移 ${driftCount} 项`;
  }
  if (missingCount > 0) {
    return `视觉基线缺失 ${missingCount} 项`;
  }
  if (comparedCount > 0) {
    return `视觉基线已比对 ${comparedCount} 项`;
  }
  return null;
}

function normalizeVisualMetricNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function formatMaybePercent(value) {
  const normalized = normalizeVisualMetricNumber(value);
  return normalized === null
    ? "-"
    : `${(normalized * 100).toFixed(2)}%`;
}

function formatMaybeNumber(value, digits = 2) {
  const normalized = normalizeVisualMetricNumber(value);
  return normalized === null
    ? "-"
    : normalized.toFixed(digits);
}

function buildVisualEvidenceLabel(item) {
  const cycleText = Number.isFinite(Number(item?.cycleIndex))
    ? `Cycle ${Number(item.cycleIndex)}`
    : "Cycle -";
  const bootMode = String(item?.bootMode || "-").trim() || "-";
  const kind = String(item?.kind || "visual").trim() || "visual";
  const canonicalTarget = String(item?.canonicalTarget || "-").trim() || "-";
  return `${cycleText} / ${bootMode} / ${kind} / ${canonicalTarget}`;
}

function buildVisualAttemptDiagnosisLabel(item) {
  const cycleText = Number.isFinite(Number(item?.cycleIndex))
    ? `Cycle ${Number(item.cycleIndex)}`
    : "Cycle -";
  const bootMode = String(item?.bootMode || "-").trim() || "-";
  const kind = String(item?.kind || "visual").trim() || "visual";
  return `${cycleText} / ${bootMode} / ${kind}`;
}

function formatAttemptBounds(bounds) {
  const record = bounds && typeof bounds === "object" ? bounds : null;
  const x = Number(record?.x);
  const y = Number(record?.y);
  const width = Number(record?.width);
  const height = Number(record?.height);
  if (![x, y, width, height].every((value) => Number.isFinite(value))) {
    return null;
  }
  return `${x},${y} ${width}x${height}`;
}

function formatAttemptRasterSize(attempt) {
  return formatVisualSize(attempt?.width, attempt?.height);
}

function summarizeAttemptUniformity(values) {
  const list = Array.isArray(values) ? values : [];
  if (list.length === 0) {
    return null;
  }
  if (list.some((item) => !item)) {
    return null;
  }
  return new Set(list).size === 1;
}

function summarizeAttemptHashUniqueness(values) {
  const list = Array.isArray(values) ? values : [];
  if (list.length === 0) {
    return null;
  }
  if (list.some((item) => !item)) {
    return null;
  }
  return new Set(list).size === list.length;
}

function buildVisualAttemptDiagnosisPreview(item) {
  if (item?.failureKind) {
    const failureLabel = pickVisualCaptureFailureKindLabel(item.failureKind);
    const failureMessage = String(item?.failureMessage || "").trim();
    return `${buildVisualAttemptDiagnosisLabel(item)}（${failureLabel}${failureMessage ? `：${failureMessage}` : ""}）`;
  }
  const facts = [
    item?.boundsStable === true
      ? "bounds 固定"
      : (item?.boundsStable === false ? "bounds 变化" : "bounds 待补证"),
    item?.rasterSizeStable === true
      ? "光栅固定"
      : (item?.rasterSizeStable === false ? "光栅变化" : "光栅待补证"),
    item?.allHashesUnique === true
      ? "hash 全变"
      : (item?.allHashesUnique === false ? "hash 有重复" : "hash 待补证"),
  ];
  if (
    item?.selectionReason === "stable-low-drift-pair"
    && item?.stabilityMetrics
    && (
      Number.isFinite(Number(item.stabilityMetrics.changedRatio))
      || Number.isFinite(Number(item.stabilityMetrics.meanChannelDiff))
    )
  ) {
    facts.push(
      `终态低漂移 ${formatMaybePercent(item.stabilityMetrics.changedRatio)} / ${formatMaybeNumber(item.stabilityMetrics.meanChannelDiff)}`,
    );
  }
  return `${buildVisualAttemptDiagnosisLabel(item)}（${facts.join("，")}）`;
}

function summarizeVisualEvidenceItems(cycles) {
  const allItems = [];
  const failingItems = [];

  for (const cycle of Array.isArray(cycles) ? cycles : []) {
    const cycleIndex = Number.isFinite(Number(cycle?.index)) ? Number(cycle.index) : null;
    const bootMode = String(cycle?.bootMode || "").trim() || null;
    const captures = Array.isArray(cycle?.visuals?.captures) ? cycle.visuals.captures : [];
    const stages = Array.isArray(cycle?.visuals?.captureStability?.stages)
      ? cycle.visuals.captureStability.stages
      : [];
    const baselines = Array.isArray(cycle?.visuals?.analysis?.baselines)
      ? cycle.visuals.analysis.baselines
      : [];
    const captureMap = new Map();
    const stageMap = new Map();
    const baselineMap = new Map();

    captures.forEach((entry) => {
      const kind = String(entry?.kind || "").trim();
      if (kind) {
        captureMap.set(kind, entry);
      }
    });
    stages.forEach((entry) => {
      const kind = String(entry?.kind || "").trim();
      if (kind) {
        stageMap.set(kind, entry);
      }
    });
    baselines.forEach((entry) => {
      const kind = String(entry?.kind || "").trim();
      if (kind) {
        baselineMap.set(kind, entry);
      }
    });

    const observedKinds = uniqueStrings([
      ...captures.map((entry) => entry?.kind),
      ...stages.map((entry) => entry?.kind),
      ...baselines.map((entry) => entry?.kind),
    ]);

    for (const kind of observedKinds) {
      const capture = captureMap.get(kind) || null;
      const stage = stageMap.get(kind) || null;
      const baseline = baselineMap.get(kind) || null;
      const selectedAttempt = findSelectedVisualAttempt(stage);
      const metrics = baseline?.metrics && typeof baseline.metrics === "object"
        ? baseline.metrics
        : null;
      const issueList = [];

      if (!capture && !stage) {
        issueList.push("capture-missing");
      }
      if (!baseline) {
        issueList.push("baseline-missing");
      }
      if (Array.isArray(baseline?.issues)) {
        baseline.issues.forEach((entry) => {
          const normalized = String(entry || "").trim();
          if (normalized) {
            issueList.push(normalized);
          }
        });
      }

      const geometryMatched = typeof metrics?.sameDimensions === "boolean"
        ? metrics.sameDimensions
        : (typeof baseline?.geometryMatched === "boolean" ? baseline.geometryMatched : null);
      const item = {
        cycleIndex,
        bootMode,
        kind,
        canonicalTarget: extractVisualCanonicalTarget(baseline, bootMode) || null,
        capturePath: String(
          capture?.path
          || stage?.selectedPath
          || selectedAttempt?.path
          || "",
        ).trim() || null,
        baselinePath: String(baseline?.path || "").trim() || null,
        captureStable: stage?.stable === true
          ? true
          : (stage?.stable === false ? false : null),
        selectedAttempt: Number.isInteger(stage?.selectedAttempt)
          ? stage.selectedAttempt
          : null,
        selectionReason: String(stage?.selectionReason || "").trim() || null,
        geometryMatched,
        actualWidth: normalizeVisualMetricNumber(metrics?.actualWidth),
        actualHeight: normalizeVisualMetricNumber(metrics?.actualHeight),
        baselineWidth: normalizeVisualMetricNumber(metrics?.baselineWidth),
        baselineHeight: normalizeVisualMetricNumber(metrics?.baselineHeight),
        changedRatio: normalizeVisualMetricNumber(metrics?.changedRatio),
        meanChannelDiff: normalizeVisualMetricNumber(metrics?.meanChannelDiff),
        issues: uniqueStrings(issueList),
      };

      allItems.push(item);

      const baselineStatus = String(baseline?.status || "").trim();
      const isFailing = (
        !baseline
        || baselineStatus === "missing"
        || baselineStatus === "error"
        || (baselineStatus === "compared" && baseline?.ok !== true)
        || item.issues.length > 0
      );
      if (isFailing) {
        failingItems.push(item);
      }
    }
  }

  let summary = null;
  if (allItems.length > 0) {
    if (failingItems.length === 0) {
      summary = `已观测 ${allItems.length} 项视觉证据，当前无失败 target。`;
    } else {
      const preview = failingItems
        .slice(0, 2)
        .map((item) => buildVisualEvidenceLabel(item))
        .join("；");
      summary = `已观测 ${allItems.length} 项视觉证据，失败 ${failingItems.length} 项：${preview}${failingItems.length > 2 ? "；其余项见证据索引" : ""}`;
    }
  }

  return {
    observed: allItems.length > 0,
    itemCount: allItems.length,
    failingItemCount: failingItems.length,
    summary,
    items: failingItems,
  };
}

function summarizeVisualCaptureAttemptDiagnosis(cycles) {
  const items = [];

  for (const cycle of Array.isArray(cycles) ? cycles : []) {
    const cycleIndex = Number.isFinite(Number(cycle?.index)) ? Number(cycle.index) : null;
    const bootMode = String(cycle?.bootMode || "").trim() || null;
    const stages = Array.isArray(cycle?.visuals?.captureStability?.stages)
      ? cycle.visuals.captureStability.stages
      : [];

    for (const stage of stages) {
      const attempts = Array.isArray(stage?.attempts) ? stage.attempts : [];
      const attemptHashes = attempts.map((entry) => {
        const value = String(entry?.sha256 || "").trim();
        return value || null;
      });
      const attemptBounds = attempts.map((entry) => formatAttemptBounds(entry?.bounds));
      const attemptRasterSizes = attempts.map((entry) => formatAttemptRasterSize(entry));
      items.push({
        cycleIndex,
        bootMode,
        kind: String(stage?.kind || "visual").trim() || "visual",
        selectionReason: String(stage?.selectionReason || "").trim() || null,
        selectedAttempt: Number.isInteger(stage?.selectedAttempt)
          ? stage.selectedAttempt
          : null,
        attemptCount: Math.max(
          0,
          Number(stage?.attemptCount || 0),
          Array.isArray(stage?.attempts) ? stage.attempts.length : 0,
        ),
        allHashesUnique: summarizeAttemptHashUniqueness(attemptHashes),
        boundsStable: summarizeAttemptUniformity(attemptBounds),
        rasterSizeStable: summarizeAttemptUniformity(attemptRasterSizes),
        attemptHashes,
        attemptBounds,
        attemptRasterSizes,
        stabilityMetrics: normalizeVisualStabilityMetrics(stage?.stabilityMetrics),
        failureKind: String(stage?.failureKind || "").trim() || null,
        failureCategory: String(stage?.failureCategory || "").trim() || null,
        failureStage: String(stage?.failureStage || "").trim() || null,
        failureMessage: String(stage?.failureMessage || "").trim() || null,
        boundsSource: String(stage?.boundsSource || stage?.bounds?.source || "").trim() || null,
        windowTitle: String(stage?.windowTitle || stage?.bounds?.title || "").trim() || null,
        command: String(stage?.command || "").trim() || null,
        commandExitCode: Number.isFinite(Number(stage?.commandExitCode))
          ? Number(stage.commandExitCode)
          : null,
        stderr: String(stage?.stderr || "").trim() || null,
        stdout: String(stage?.stdout || "").trim() || null,
        rect: String(stage?.rect || "").trim() || null,
      });
    }
  }

  if (items.length === 0) {
    return {
      observed: false,
      itemCount: 0,
      summary: null,
      items: [],
    };
  }

  const commandFailureItems = items.filter((item) => isVisualCaptureCommandFailure(item));
  const exhaustedItems = items.filter((item) => item.selectionReason === "max-attempt-reached");
  const lowDriftItems = items.filter((item) => item.selectionReason === "stable-low-drift-pair");
  const summaryParts = [`已观测 ${items.length} 个 stage capture attempt 诊断`];

  if (commandFailureItems.length > 0) {
    const preview = commandFailureItems
      .slice(0, 2)
      .map((item) => buildVisualAttemptDiagnosisPreview(item))
      .join("；");
    summaryParts.push(`截图调用失败 ${commandFailureItems.length} 个：${preview}${commandFailureItems.length > 2 ? "；其余项见 attempt 诊断" : ""}`);
  }

  if (exhaustedItems.length > 0) {
    const preview = exhaustedItems
      .slice(0, 2)
      .map((item) => buildVisualAttemptDiagnosisPreview(item))
      .join("；");
    summaryParts.push(`用尽预算 ${exhaustedItems.length} 个：${preview}${exhaustedItems.length > 2 ? "；其余项见 attempt 诊断" : ""}`);
  }

  if (lowDriftItems.length > 0) {
    const preview = lowDriftItems
      .slice(0, 1)
      .map((item) => buildVisualAttemptDiagnosisPreview(item))
      .join("；");
    summaryParts.push(`低漂移收敛 ${lowDriftItems.length} 个：${preview}${lowDriftItems.length > 1 ? "；其余项见 attempt 诊断" : ""}`);
  }

  if (commandFailureItems.length === 0 && exhaustedItems.length === 0 && lowDriftItems.length === 0) {
    summaryParts.push("当前未发现 exhausted stage，attempt 细节仅作补充参考");
  }

  return {
    observed: true,
    itemCount: items.length,
    summary: summaryParts.join("；"),
    items,
  };
}

function formatVisualSize(width, height) {
  const normalizedWidth = Number(width);
  const normalizedHeight = Number(height);
  if (!Number.isFinite(normalizedWidth) || !Number.isFinite(normalizedHeight)) {
    return null;
  }
  if (normalizedWidth <= 0 || normalizedHeight <= 0) {
    return null;
  }
  return `${normalizedWidth}x${normalizedHeight}`;
}

function buildVisualGeometryByKind(latestCycle) {
  const map = new Map();
  const captures = Array.isArray(latestCycle?.visuals?.captures)
    ? latestCycle.visuals.captures
    : [];
  for (const capture of captures) {
    const kind = String(capture?.kind || "visual").trim() || "visual";
    const current = map.get(kind) || {
      kind,
      captureSize: null,
      baselineSize: null,
      geometryMatched: null,
    };
    current.captureSize = current.captureSize || formatVisualSize(
      capture?.analysis?.width,
      capture?.analysis?.height,
    );
    map.set(kind, current);
  }

  const baselines = Array.isArray(latestCycle?.visuals?.analysis?.baselines)
    ? latestCycle.visuals.analysis.baselines
    : [];
  for (const entry of baselines) {
    const kind = String(entry?.kind || "visual").trim() || "visual";
    const current = map.get(kind) || {
      kind,
      captureSize: null,
      baselineSize: null,
      geometryMatched: null,
    };
    const metrics = entry?.metrics && typeof entry.metrics === "object"
      ? entry.metrics
      : null;
    if (metrics) {
      current.captureSize = current.captureSize || formatVisualSize(metrics.actualWidth, metrics.actualHeight);
      current.baselineSize = current.baselineSize || formatVisualSize(metrics.baselineWidth, metrics.baselineHeight);
      if (typeof metrics.sameDimensions === "boolean") {
        current.geometryMatched = metrics.sameDimensions;
      }
    }
    map.set(kind, current);
  }

  return map;
}

function extractVisualCanonicalTarget(entry, cycleBootMode) {
  const explicitTarget = String(entry?.canonicalTarget || entry?.target || "").trim();
  if (explicitTarget) {
    return explicitTarget;
  }

  const pathTarget = String(entry?.path || "").trim().split(/[\\/]/u).pop() || "";
  if (pathTarget) {
    return pathTarget;
  }

  const bootMode = String(cycleBootMode || entry?.bootMode || "").trim();
  const kind = String(entry?.kind || "").trim();
  if (!bootMode || !kind) {
    return null;
  }
  return getVisualBaselineFilename({ bootMode, kind });
}

function summarizeVisualCanonicalCoverageForCycles(cycles) {
  const targetEntries = [];
  const expectedTargets = [];
  const expectedSet = new Set();
  const targetMap = new Map();

  for (const cycle of Array.isArray(cycles) ? cycles : []) {
    const bootMode = String(cycle?.bootMode || "").trim();
    const captures = Array.isArray(cycle?.visuals?.captures)
      ? cycle.visuals.captures
      : [];
    const baselines = Array.isArray(cycle?.visuals?.analysis?.baselines)
      ? cycle.visuals.analysis.baselines
      : [];
    const canonicalCaptures = captures.filter((item) => item?.scope !== "surface-local");
    const canonicalBaselines = baselines.filter((item) => item?.scope !== "surface-local");
    const observedKinds = uniqueStrings([
      ...canonicalCaptures.map((item) => item?.kind),
      ...canonicalBaselines.map((item) => item?.kind),
    ]);

    if (bootMode) {
      for (const kind of observedKinds) {
        const canonicalTarget = getVisualBaselineFilename({ bootMode, kind });
        if (!expectedSet.has(canonicalTarget)) {
          expectedSet.add(canonicalTarget);
          expectedTargets.push(canonicalTarget);
        }
      }
    }

    for (const entry of canonicalBaselines) {
      const canonicalTarget = extractVisualCanonicalTarget(entry, bootMode);
      if (!canonicalTarget) {
        continue;
      }
      if (!expectedSet.has(canonicalTarget)) {
        expectedSet.add(canonicalTarget);
        expectedTargets.push(canonicalTarget);
      }
      const metrics = entry?.metrics && typeof entry.metrics === "object"
        ? entry.metrics
        : null;
      targetMap.set(canonicalTarget, {
        canonicalTarget,
        geometryMatched: typeof metrics?.sameDimensions === "boolean"
          ? metrics.sameDimensions
          : (typeof entry?.geometryMatched === "boolean" ? entry.geometryMatched : null),
      });
    }
  }

  for (const canonicalTarget of expectedTargets) {
    targetEntries.push(targetMap.get(canonicalTarget) || {
      canonicalTarget,
      geometryMatched: null,
    });
  }

  return summarizeVisualCanonicalCoverage(targetEntries, expectedTargets);
}

function findSelectedVisualAttempt(entry) {
  const attempts = Array.isArray(entry?.attempts) ? entry.attempts : [];
  const selectedAttempt = Number(entry?.selectedAttempt || 0);
  if (selectedAttempt > 0) {
    const matched = attempts.find((item) => Number(item?.index || 0) === selectedAttempt);
    if (matched) {
      return matched;
    }
  }
  return attempts[attempts.length - 1] || null;
}

function normalizeVisualStabilityMetrics(metrics) {
  const record = metrics && typeof metrics === "object"
    ? metrics
    : null;
  if (!record) {
    return null;
  }

  const normalized = {
    sameDimensions: typeof record.sameDimensions === "boolean"
      ? record.sameDimensions
      : null,
    changedRatio: normalizeVisualMetricNumber(record.changedRatio),
    meanChannelDiff: normalizeVisualMetricNumber(record.meanChannelDiff),
    thresholdChangedRatio: normalizeVisualMetricNumber(record.thresholdChangedRatio),
    thresholdMeanChannelDiff: normalizeVisualMetricNumber(record.thresholdMeanChannelDiff),
  };
  const hasData = Object.values(normalized).some((value) => value !== null);
  return hasData ? normalized : null;
}

function normalizeVisualPreCaptureSettle(record, fallbackKind = null) {
  const source = record && typeof record === "object"
    ? record
    : null;
  if (!source) {
    return null;
  }

  const pollCount = Math.max(0, Number(source.pollCount || 0));
  const stableSampleTarget = Math.max(0, Number(source.stableSampleTarget || 0));
  const consecutiveStableSamples = Math.max(0, Number(source.consecutiveStableSamples || 0));
  const resetCount = Math.max(0, Number(source.resetCount || 0));
  const normalized = {
    kind: String(source.stage || fallbackKind || "visual").trim() || "visual",
    settled: source.settled === true,
    timedOut: source.timedOut === true,
    pollCount,
    stableSampleTarget,
    consecutiveStableSamples,
    resetCount,
    verificationMatched: typeof source.verificationMatched === "boolean"
      ? source.verificationMatched
      : null,
    snapshotSummary: String(source.snapshotSummary || "").trim() || null,
    summary: String(source.summary || "").trim() || null,
  };
  const hasData = (
    normalized.settled === true
    || normalized.timedOut === true
    || pollCount > 0
    || stableSampleTarget > 0
    || consecutiveStableSamples > 0
    || resetCount > 0
    || normalized.verificationMatched !== null
    || normalized.snapshotSummary !== null
    || normalized.summary !== null
  );
  return hasData ? normalized : null;
}

export function pickVisualCaptureSelectionReasonLabel(reason) {
  switch (String(reason || "").trim()) {
    case "stable-hash-pair":
      return "哈希收敛";
    case "stable-low-drift-pair":
      return "低漂移收敛";
    case "max-attempt-reached":
    default:
      return "重试上限";
  }
}

export function pickVisualCaptureFailureKindLabel(kind) {
  switch (String(kind || "").trim()) {
    case "capture-command-failed":
      return "截图调用失败";
    case "window-bounds-unavailable":
      return "窗口 bounds 不可用";
    case "window-activation-failed":
      return "窗口激活失败";
    case "capture-analysis-failed":
      return "截图分析失败";
    case "visual-state-prepare-failed":
      return "视觉状态准备失败";
    case "capture-stage-failed":
      return "截图阶段失败";
    default:
      return "截图失败";
  }
}

function isVisualCaptureCommandFailure(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const failureCategory = String(entry.failureCategory || "").trim();
  if (failureCategory === "capture-command-failed") {
    return true;
  }
  const failureKind = String(entry.failureKind || "").trim();
  return (
    failureKind === "capture-command-failed"
    || failureKind === "window-bounds-unavailable"
    || failureKind === "window-activation-failed"
  );
}

function summarizeVisualCaptureStability(latestCycle) {
  const stability = latestCycle?.visuals?.captureStability;
  const stages = Array.isArray(stability?.stages)
    ? stability.stages
    : [];
  const visualGeometryByKind = buildVisualGeometryByKind(latestCycle);
  if (stages.length === 0) {
    return {
      observed: false,
      stageCount: 0,
      stableStageCount: 0,
      unstableStageCount: 0,
      allStagesStable: null,
      attemptCount: 0,
      summary: null,
      stages: [],
    };
  }

  const normalizedStages = stages.map((entry) => {
    const kind = String(entry?.kind || "visual");
    const selectedAttempt = findSelectedVisualAttempt(entry);
    const geometry = visualGeometryByKind.get(kind) || {};
    const captureSize = geometry.captureSize
      || formatVisualSize(selectedAttempt?.width, selectedAttempt?.height);
    const failureKind = String(entry?.failureKind || "").trim() || null;
    const failureCategory = String(entry?.failureCategory || "").trim() || null;
    return {
      kind,
      stable: entry?.stable === true,
      attemptCount: Math.max(0, Number(entry?.attemptCount || 0)),
      selectedAttempt: Number.isInteger(entry?.selectedAttempt)
        ? entry.selectedAttempt
        : null,
      selectionReason: entry?.selectionReason || null,
      captureSize,
      baselineSize: geometry.baselineSize || null,
      geometryMatched: typeof geometry.geometryMatched === "boolean"
        ? geometry.geometryMatched
        : null,
      stabilityMetrics: normalizeVisualStabilityMetrics(entry?.stabilityMetrics),
      preCaptureSettle: normalizeVisualPreCaptureSettle(entry?.preCaptureSettle, kind),
      failureKind,
      failureCategory,
      failureStage: String(entry?.failureStage || "").trim() || null,
      failureMessage: String(entry?.failureMessage || "").trim() || null,
      bounds: entry?.bounds && typeof entry.bounds === "object"
        ? {
          x: Number.isFinite(Number(entry.bounds.x)) ? Number(entry.bounds.x) : null,
          y: Number.isFinite(Number(entry.bounds.y)) ? Number(entry.bounds.y) : null,
          width: Number.isFinite(Number(entry.bounds.width)) ? Number(entry.bounds.width) : null,
          height: Number.isFinite(Number(entry.bounds.height)) ? Number(entry.bounds.height) : null,
        }
        : null,
      boundsSource: String(entry?.boundsSource || entry?.bounds?.source || "").trim() || null,
      windowTitle: String(entry?.windowTitle || entry?.bounds?.title || "").trim() || null,
      command: String(entry?.command || "").trim() || null,
      commandExitCode: Number.isFinite(Number(entry?.commandExitCode))
        ? Number(entry.commandExitCode)
        : null,
      stderr: String(entry?.stderr || "").trim() || null,
      stdout: String(entry?.stdout || "").trim() || null,
      rect: String(entry?.rect || "").trim() || null,
    };
  });
  const stableStageCount = normalizedStages.filter((entry) => entry.stable).length;
  const unstableStageCount = normalizedStages.length - stableStageCount;
  const attemptCount = normalizedStages.reduce((sum, entry) => sum + entry.attemptCount, 0);
  const stageSummary = normalizedStages.map((entry) => {
    if (entry.failureKind) {
      return `${entry.kind} 失败（${entry.attemptCount} 次，${pickVisualCaptureFailureKindLabel(entry.failureKind)}）`;
    }
    const stableText = entry.stable ? "稳定" : "待稳";
    const reasonText = entry.selectionReason
      ? pickVisualCaptureSelectionReasonLabel(entry.selectionReason)
      : "未选图";
    return `${entry.kind} ${stableText}（${entry.attemptCount} 次，${reasonText}）`;
  }).join("；");

  return {
    observed: true,
    stageCount: normalizedStages.length,
    stableStageCount,
    unstableStageCount,
    allStagesStable: unstableStageCount === 0,
    attemptCount,
    summary: `视觉采集稳定性：${stageSummary}`,
    stages: normalizedStages,
  };
}

function summarizeVisualPreCaptureSettle(latestCycle) {
  const stability = latestCycle?.visuals?.captureStability;
  const stages = Array.isArray(stability?.stages)
    ? stability.stages
    : [];
  const normalizedStages = stages
    .map((entry) => normalizeVisualPreCaptureSettle(entry?.preCaptureSettle, entry?.kind))
    .filter(Boolean);

  if (normalizedStages.length === 0) {
    return {
      observed: false,
      stageCount: 0,
      settledStageCount: 0,
      timedOutStageCount: 0,
      summary: null,
      stages: [],
    };
  }

  return {
    observed: true,
    stageCount: normalizedStages.length,
    settledStageCount: normalizedStages.filter((entry) => entry.settled === true).length,
    timedOutStageCount: normalizedStages.filter((entry) => entry.timedOut === true).length,
    summary: `预截图 settle：${normalizedStages.map((entry) => entry.summary || `${entry.kind} ${entry.settled ? "达成" : (entry.timedOut ? "超时" : "待定")}`).join("；")}`,
    stages: normalizedStages,
  };
}

export function pickVisualPrimaryBlockerKindLabel(kind) {
  switch (String(kind || "").trim()) {
    case "capture-command-failed":
      return "截图调用失败";
    case "capture-unstable":
      return "采集未稳定";
    case "baseline-geometry-mismatch":
      return "基线几何不匹配";
    case "ui-regression-candidate":
      return "疑似真实界面回归";
    default:
      return "未知视觉阻断";
  }
}

export function listVisualExhaustedStages(e2e) {
  const stages = Array.isArray(e2e?.visualCaptureStabilityStages)
    ? e2e.visualCaptureStabilityStages
    : [];
  return stages
    .filter((entry) => entry?.stable === false && entry?.selectionReason === "max-attempt-reached")
    .map((entry) => {
      const kind = String(entry?.kind || "visual").trim() || "visual";
      const attemptCount = Math.max(0, Number(entry?.attemptCount || 0));
      return {
        kind,
        attemptCount,
      };
    });
}

export function buildVisualExhaustedStageSummary(e2e) {
  const exhaustedStages = listVisualExhaustedStages(e2e);
  if (exhaustedStages.length === 0) {
    return null;
  }
  return exhaustedStages.map((entry) => `${entry.kind}（${entry.attemptCount} 次）`).join("；");
}

export function listVisualCaptureFailureStages(e2e) {
  const stages = Array.isArray(e2e?.visualCaptureStabilityStages)
    ? e2e.visualCaptureStabilityStages
    : [];
  return stages
    .filter((entry) => entry?.failureKind)
    .map((entry) => ({
      kind: String(entry?.kind || "visual").trim() || "visual",
      failureKind: String(entry?.failureKind || "").trim() || "capture-stage-failed",
      failureCategory: String(entry?.failureCategory || "").trim() || null,
      failureMessage: String(entry?.failureMessage || "").trim() || null,
      attemptCount: Math.max(0, Number(entry?.attemptCount || 0)),
    }));
}

export function buildVisualCaptureFailureStageSummary(e2e) {
  const failures = listVisualCaptureFailureStages(e2e);
  if (failures.length === 0) {
    return null;
  }
  return failures
    .map((entry) => `${entry.kind}（${pickVisualCaptureFailureKindLabel(entry.failureKind)}${entry.failureMessage ? `：${entry.failureMessage}` : ""}）`)
    .join("；");
}

function summarizeVisualPrimaryBlocker(latestCycle, visualCaptureStability, visualDriftCount) {
  const normalizedStages = Array.isArray(visualCaptureStability?.stages)
    ? visualCaptureStability.stages
    : [];
  const geometryStageEntries = normalizedStages.length > 0
    ? normalizedStages
    : Array.from(buildVisualGeometryByKind(latestCycle).values());
  const visualGeometryMismatchCount = geometryStageEntries
    .filter((entry) => entry?.geometryMatched === false)
    .length;
  const visualAllStagesGeometryMatched = geometryStageEntries.length > 0
    ? geometryStageEntries.every((entry) => entry?.geometryMatched === true)
    : null;
  const geometryParts = geometryStageEntries
    .map((entry) => {
      const kind = String(entry?.kind || "visual").trim() || "visual";
      if (entry?.geometryMatched === true) {
        return `${kind} 几何一致${entry?.captureSize ? ` ${entry.captureSize}` : ""}`;
      }
      if (entry?.geometryMatched === false) {
        return `${kind} 几何不一致 ${entry?.captureSize || "-"} / ${entry?.baselineSize || "-"}`;
      }
      if (entry?.captureSize || entry?.baselineSize) {
        return `${kind} 几何待补证 ${entry?.captureSize || "-"} / ${entry?.baselineSize || "-"}`;
      }
      return `${kind} 几何待补证`;
    })
    .filter(Boolean);
  let visualPrimaryBlockerKind = "unknown";
  if (normalizedStages.some((entry) => isVisualCaptureCommandFailure(entry))) {
    visualPrimaryBlockerKind = "capture-command-failed";
  } else if (visualCaptureStability?.unstableStageCount > 0) {
    visualPrimaryBlockerKind = "capture-unstable";
  } else if (visualGeometryMismatchCount > 0) {
    visualPrimaryBlockerKind = "baseline-geometry-mismatch";
  } else if (
    visualCaptureStability?.allStagesStable === true
    && visualAllStagesGeometryMatched === true
    && Number(visualDriftCount || 0) > 0
  ) {
    visualPrimaryBlockerKind = "ui-regression-candidate";
  }

  return {
    visualPrimaryBlockerKind,
    visualPrimaryBlockerKindLabel: pickVisualPrimaryBlockerKindLabel(visualPrimaryBlockerKind),
    visualGeometryMismatchCount,
    visualAllStagesGeometryMatched,
    visualGeometrySummary: geometryParts.length > 0 ? geometryParts.join("；") : null,
  };
}

function haveReaderHooksPassed(readerEventReport) {
  return Boolean(
    readerEventReport
    && readerEventReport.present === true
    && readerEventReport.status === "passed"
    && readerEventReport.hookScenarioStatus === "passed"
    && readerEventReport.fineGrainedScenarioStatus === "passed"
  );
}

export function isPureVisualReaderFailure(e2e) {
  if (!e2e || typeof e2e !== "object") {
    return false;
  }
  return (
    e2e.status === "failed"
    && String(e2e.primaryDiagnosis?.fingerprint || "") === "reader-ui:reader-visual-drift"
    && Number(e2e.testFailed || 0) === 0
    && Number(e2e.scenarioFailed || 0) === 0
    && Number(e2e.logErrorCount || 0) === 0
    && haveReaderHooksPassed(e2e.readerEventReport)
  );
}

function pickVisualRefreshPolicyLabel(kind, coverageKind = null) {
  switch (String(kind || "").trim()) {
    case "baseline-geometry-mismatch":
      return String(coverageKind || "").trim() === "partial"
        ? "先转人工排查"
        : "可刷新基线";
    case "capture-command-failed":
    case "capture-unstable":
    case "ui-regression-candidate":
      return "暂不刷新基线";
    default:
      return "刷新基线待定";
  }
}

export function buildVisualPrimaryBlockerSummary(e2e) {
  if (!e2e || typeof e2e !== "object") {
    return null;
  }
  const label = pickVisualPrimaryBlockerKindLabel(e2e.visualPrimaryBlockerKind);
  const exhaustedStageSummary = buildVisualExhaustedStageSummary(e2e);
  const captureFailureSummary = buildVisualCaptureFailureStageSummary(e2e);
  const attemptDiagnosisSummary = String(e2e.visualCaptureAttemptDiagnosisSummary || "").trim() || null;
  const geometrySummary = String(e2e.visualGeometrySummary || "").trim()
    || (
      e2e.visualAllStagesGeometryMatched === true
        ? "几何一致"
        : (Number(e2e.visualGeometryMismatchCount || 0) > 0 ? "几何不一致" : "几何待补证")
    );
  if (String(e2e.visualPrimaryBlockerKind || "").trim() === "capture-command-failed") {
    const policySummary = "先复核窗口 bounds / 激活 / screencapture 调用，再重跑 E2E；暂不进入 baseline refresh、autofix 或 obsidian-first";
    return [
      `视觉主阻断：${label}`,
      geometrySummary,
      captureFailureSummary || "最近一轮存在截图调用失败 stage",
      attemptDiagnosisSummary,
      policySummary,
    ].filter(Boolean).join("；");
  }
  if (String(e2e.visualPrimaryBlockerKind || "").trim() === "capture-unstable") {
    const policySummary = "先重跑 E2E，暂不进入 baseline refresh、autofix 或 obsidian-first";
    return [
      `视觉主阻断：${label}`,
      geometrySummary,
      exhaustedStageSummary ? `用尽预算 stage：${exhaustedStageSummary}` : "仍有 stage 未在现有预算内收敛",
      attemptDiagnosisSummary,
      policySummary,
    ].filter(Boolean).join("；");
  }
  return `视觉主阻断：${label}；${geometrySummary}；${pickVisualRefreshPolicyLabel(e2e.visualPrimaryBlockerKind, e2e.visualCanonicalCoverageKind)}`;
}

export function buildVisualCanonicalCoverageSummary(e2e) {
  if (!e2e || typeof e2e !== "object") {
    return null;
  }
  const preset = String(e2e.visualCanonicalCoverageSummary || "").trim();
  if (preset) {
    return preset;
  }
  const kind = String(e2e.visualCanonicalCoverageKind || "").trim();
  if (!kind) {
    return null;
  }
  const label = pickVisualCanonicalCoverageKindLabel(kind);
  const mismatchedTargets = Array.isArray(e2e.visualCanonicalMismatchedTargets)
    ? e2e.visualCanonicalMismatchedTargets.filter(Boolean)
    : [];
  if (kind === "complete") {
    return `${label}：全部目标已对齐`;
  }
  if (kind === "partial" || kind === "none") {
    return `${label}：${mismatchedTargets.length > 0 ? mismatchedTargets.join("、") : "仍有目标未对齐"}`;
  }
  return `${label}：当前缺少可靠 coverage 证据`;
}

export function buildPureVisualReaderFailureSummary(e2e) {
  if (!e2e || typeof e2e !== "object") {
    return null;
  }
  const parts = [
    buildVisualPrimaryBlockerSummary(e2e),
    buildVisualCanonicalCoverageSummary(e2e),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("；") : null;
}

export function pickPureVisualReaderNextAction(e2e) {
  if (!isPureVisualReaderFailure(e2e)) {
    return null;
  }
  if (String(e2e.visualPrimaryBlockerKind || "") === "capture-command-failed") {
    return "npm run agent:zotero:e2e";
  }
  if (String(e2e.visualPrimaryBlockerKind || "") === "baseline-geometry-mismatch") {
    if (String(e2e.visualCanonicalCoverageKind || "") === "partial") {
      return "npm run agent:obsidian";
    }
    return "npm run agent:zotero:e2e:update-baseline";
  }
  if (
    String(e2e.visualPrimaryBlockerKind || "") === "ui-regression-candidate"
    && String(e2e.visualCanonicalCoverageKind || "") === "complete"
  ) {
    return "npm run agent:obsidian";
  }
  return "npm run agent:zotero:e2e";
}

function summarizeReaderHostState(report, latestCycle) {
  const scenarioResults = Array.isArray(latestCycle?.scenarios?.results)
    ? latestCycle.scenarios.results
    : [];
  const interactionScenario = scenarioResults.find((item) => item?.name === "reader interaction diagnostics") || null;
  const interaction = interactionScenario?.details?.interaction && typeof interactionScenario.details.interaction === "object"
    ? interactionScenario.details.interaction
    : null;
  const interactionDetails = interactionScenario?.details && typeof interactionScenario.details === "object"
    ? interactionScenario.details
    : null;
  const readerSidebarView = hasObservedReaderHostValue(interaction?.sidebarView) ? interaction.sidebarView : null;
  const readerFlowMode = hasObservedReaderHostValue(interaction?.flowMode) ? interaction.flowMode : null;
  const readerSplitType = hasObservedReaderHostValue(interaction?.splitType) ? interaction.splitType : null;
  const readerScrollMode = hasObservedReaderHostValue(interaction?.scrollMode) ? interaction.scrollMode : null;
  const readerSpreadMode = hasObservedReaderHostValue(interaction?.spreadMode) ? interaction.spreadMode : null;
  const readerScale = hasObservedReaderHostValue(interaction?.scale) ? interaction.scale : null;
  const readerContextPaneOpen = typeof interaction?.contextPaneOpen === "boolean"
    ? interaction.contextPaneOpen
    : null;
  const readerHasSecondViewState = typeof interaction?.hasSecondViewState === "boolean"
    ? interaction.hasSecondViewState
    : null;
  const selectionPopupDispatchMode = hasObservedReaderHostValue(interactionDetails?.selectionPopupDispatchMode)
    ? interactionDetails.selectionPopupDispatchMode
    : null;
  const selectionPopupAppendedItemCount = typeof interactionDetails?.selectionPopupAppendedItemCount === "number"
    ? interactionDetails.selectionPopupAppendedItemCount
    : null;
  const sidebarHeaderDispatchMode = hasObservedReaderHostValue(interactionDetails?.sidebarHeaderDispatchMode)
    ? interactionDetails.sidebarHeaderDispatchMode
    : null;
  const sidebarHeaderAppendedItemCount = typeof interactionDetails?.sidebarHeaderAppendedItemCount === "number"
    ? interactionDetails.sidebarHeaderAppendedItemCount
    : null;
  const contextMenuProbeCount = typeof interactionDetails?.contextMenuProbeCount === "number"
    ? interactionDetails.contextMenuProbeCount
    : null;
  const contextMenuObservedTypes = Array.isArray(interactionDetails?.contextMenuObservedTypes)
    ? interactionDetails.contextMenuObservedTypes.slice(0, 8)
    : [];
  const contextMenuSyntheticFallbackTypes = Array.isArray(interactionDetails?.contextMenuSyntheticFallbackTypes)
    ? interactionDetails.contextMenuSyntheticFallbackTypes.slice(0, 8)
    : [];
  const observedCount = [
    readerSidebarView,
    readerFlowMode,
    readerSplitType,
    readerScrollMode,
    readerSpreadMode,
    readerScale,
    readerContextPaneOpen,
    readerHasSecondViewState,
  ].filter(hasObservedReaderHostValue).length;
  const readerHostStateObserved = observedCount > 0;
  const readerHostStateSummary = readerHostStateObserved
    ? [
      `侧边栏视图 ${readerSidebarView ?? "-"}`,
      `流模式 ${readerFlowMode ?? "-"}`,
      `分栏 ${readerSplitType ?? "-"}`,
      `滚动 ${readerScrollMode ?? "-"}`,
      `跨页 ${readerSpreadMode ?? "-"}`,
      `缩放 ${readerScale ?? "-"}`,
      `上下文面板 ${readerContextPaneOpen === null ? "-" : (readerContextPaneOpen ? "打开" : "关闭")}`,
      `第二视图 ${readerHasSecondViewState === null ? "-" : (readerHasSecondViewState ? "存在" : "无")}`,
    ].join("；")
    : "-";
  const readerHostStateNote = !interactionScenario
    ? "Reader interaction diagnostics 场景缺失，暂未读取深层宿主状态。"
    : (readerHostStateObserved
      ? `已从 Reader interaction diagnostics 场景读回 ${observedCount} 项深层宿主状态。`
      : "Reader interaction diagnostics 已执行，但尚未读回可用的深层宿主状态。");
  const readerDispatchSummary = (selectionPopupDispatchMode || sidebarHeaderDispatchMode)
    ? `文本浮层 ${selectionPopupDispatchMode ?? "-"}；侧栏批注头 ${sidebarHeaderDispatchMode ?? "-"}`
    : null;
  const contextMenuSummary = contextMenuObservedTypes.length > 0 || contextMenuSyntheticFallbackTypes.length > 0
    ? `已观测 ${contextMenuObservedTypes.length} 类；synthetic-fallback ${contextMenuSyntheticFallbackTypes.length} 类`
    : null;

  return {
    readerHostStateObserved,
    readerSidebarView,
    readerFlowMode,
    readerSplitType,
    readerScrollMode,
    readerSpreadMode,
    readerScale,
    readerContextPaneOpen,
    readerHasSecondViewState,
    readerHostStateSummary,
    readerHostStateNote,
    selectionPopupDispatchMode,
    selectionPopupAppendedItemCount,
    sidebarHeaderDispatchMode,
    sidebarHeaderAppendedItemCount,
    contextMenuProbeCount,
    contextMenuObservedTypes,
    contextMenuSyntheticFallbackTypes,
    readerDispatchSummary,
    contextMenuSummary,
  };
}

export function summarizeE2EReport(report, options = {}) {
  const now = parseDate(options.now) || new Date();
  if (!report || typeof report !== "object") {
    return {
      present: false,
      status: "missing",
      statusLabel: pickE2EStatusLabel("missing"),
      generatedAt: null,
      ageMinutes: null,
      ageText: "-",
      strategy: null,
      durationMs: 0,
      errorCategory: null,
      errorCategoryLabel: null,
      errorMessage: null,
      failedStage: null,
      contextObserved: false,
      zoteroVersion: "unknown",
      zoteroVersionBucket: "unknown",
      latestBootMode: "unknown",
      bootModes: ["unknown"],
      cycles: 0,
      passedCycles: 0,
      failedCycles: 0,
      testFailed: 0,
      scenarioFailed: 0,
      logErrorCount: 0,
      logWarnCount: 0,
      errorBoundaryHitCount: 0,
      errorBoundaryEvents: [],
      visualDriftCount: 0,
      visualMissingCount: 0,
      visualCaptureStabilityObserved: false,
      visualCaptureStageCount: 0,
      visualCaptureStableStageCount: 0,
      visualCaptureUnstableStageCount: 0,
      visualCaptureAttemptCount: 0,
      visualCaptureAllStagesStable: null,
      visualCaptureStabilitySummary: null,
      visualCaptureStabilityStages: [],
      visualPreCaptureSettleObserved: false,
      visualPreCaptureSettleStageCount: 0,
      visualPreCaptureSettleSettledStageCount: 0,
      visualPreCaptureSettleTimedOutStageCount: 0,
      visualPreCaptureSettleSummary: null,
      visualPreCaptureSettleStages: [],
      visualPrimaryBlockerKind: "unknown",
      visualPrimaryBlockerKindLabel: pickVisualPrimaryBlockerKindLabel("unknown"),
      visualGeometryMismatchCount: 0,
      visualAllStagesGeometryMatched: null,
      visualGeometrySummary: null,
      serviceObserved: false,
      serviceTotal: 0,
      serviceHealthyCount: 0,
      serviceUnhealthyCount: 0,
      serviceHealthOK: true,
      serviceStatus: "unknown",
      serviceIssues: [],
      httpObserved: false,
      httpRequestCount: 0,
      httpSuccessCount: 0,
      httpFailureCount: 0,
      httpTimeoutCount: 0,
      httpRetryCount: 0,
      httpSlowOperationCount: 0,
      httpSlowThresholdMs: 0,
      httpLastRequest: null,
      httpLastErrorKind: null,
      httpLastErrorMessage: null,
      hostReadyDurationMs: 0,
      startupDurationMs: 0,
      shutdownDurationMs: 0,
      lifecycleSlowOperationCount: 0,
      lifecycleSlowThresholdMs: 2000,
      lifecycleLastSlowStage: null,
      lifecycleBoundaryEvents: [],
      registrationObserved: false,
      officialMenuAPIAvailable: null,
      primaryActionCommandRegistered: null,
      contextActionMenuRegistered: null,
      readerSummaryCommandRegistered: null,
      readerSummaryMenuRegistered: null,
      preferencePaneRegistered: null,
      preferencePaneCount: 0,
      primaryActionCommandMissingCycles: 0,
      contextActionMenuMissingCycles: 0,
      readerSummaryCommandMissingCycles: 0,
      readerSummaryMenuMissingCycles: 0,
      preferencePaneMissingCycles: 0,
      preferencePaneCountMissingCycles: 0,
      capabilityObserved: false,
      capabilityTotal: 0,
      capabilityScenarioBoundTotal: 0,
      capabilityCoveredCount: 0,
      capabilityPassedCount: 0,
      capabilityFailedCount: 0,
      capabilityUncoveredCount: 0,
      staticRuntimeMissingCount: 0,
      staticRuntimeDriftCount: 0,
      failedCapabilityIds: [],
      uncoveredCapabilityIds: [],
      capabilityStatuses: [],
      note: null,
      issues: [],
      hints: [],
      diagnosisBlocking: false,
      candidateFiles: [],
      recommendedActions: [],
      primaryDiagnosis: null,
      diagnoses: [],
      details: {
        launchFailure: null,
        runtimeSanitization: null,
      },
      readerHostStateObserved: false,
      readerSidebarView: null,
      readerFlowMode: null,
      readerSplitType: null,
      readerScrollMode: null,
      readerSpreadMode: null,
      readerScale: null,
      readerContextPaneOpen: null,
      readerHasSecondViewState: null,
      readerHostStateSummary: "-",
      readerHostStateNote: "当前报告未采集 Reader 深层宿主状态",
      selectionPopupDispatchMode: null,
      selectionPopupAppendedItemCount: null,
      sidebarHeaderDispatchMode: null,
      sidebarHeaderAppendedItemCount: null,
      contextMenuProbeCount: null,
      contextMenuObservedTypes: [],
      contextMenuSyntheticFallbackTypes: [],
      readerDispatchSummary: null,
      contextMenuSummary: null,
      toolbarEvidenceSummary: null,
      visualEvidenceObserved: false,
      visualEvidenceItemCount: 0,
      visualEvidenceFailingItemCount: 0,
      visualEvidenceSummary: null,
      visualEvidenceItems: [],
      visualCaptureAttemptDiagnosisObserved: false,
      visualCaptureAttemptDiagnosisItemCount: 0,
      visualCaptureAttemptDiagnosisSummary: null,
      visualCaptureAttemptDiagnosisItems: [],
      readerEventReport: {
        present: false,
        status: "missing",
        statusLabel: pickReaderEventStatusLabel("missing"),
        available: null,
        registeredCount: 0,
        registeredTypes: [],
        knownTypeCount: null,
        knownTypes: [],
        probeCompatibleTypeCount: null,
        probeCompatibleTypes: [],
        probeObservedTypeCount: 0,
        probeObservedTypes: [],
        hostObservedTypeCount: 0,
        hostObservedTypes: [],
        missingKnownTypes: [],
        missingProbeCompatibleTypes: [],
        unobservedProbeTypes: [],
        syntheticFallbackAvailable: null,
        toolbarHookObserved: false,
        toolbarDispatchMode: null,
        dispatchModes: [],
        observedScenarioNames: [],
        hookScenarioStatus: "missing",
        hookScenarioStatusLabel: pickReaderEventStatusLabel("missing"),
        fineGrainedScenarioStatus: "missing",
        fineGrainedScenarioStatusLabel: pickReaderEventStatusLabel("missing"),
        note: "当前报告未采集 Reader 事件桥摘要",
      },
    };
  }

  const cycles = Array.isArray(report.cycles) ? report.cycles : [];
  const latestCycle = cycles[cycles.length - 1] || null;
  const passedCycles = cycles.filter((cycle) => cycle?.passed === true).length;
  const failedCycles = cycles.filter((cycle) => cycle?.passed !== true).length;
  const testFailed = cycles.reduce((sum, cycle) => sum + Number(cycle?.tests?.failed || 0), 0);
  const scenarioFailed = cycles.reduce((sum, cycle) => sum + Number(cycle?.scenarios?.failed || 0), 0);
  const logErrorCount = cycles.reduce((sum, cycle) => sum + Number(cycle?.logs?.errorCount || 0), 0);
  const logWarnCount = cycles.reduce((sum, cycle) => sum + Number(cycle?.logs?.warnCount || 0), 0);
  const errorBoundaryHitCount = cycles.reduce((sum, cycle) => {
    return sum + Number(cycle?.logs?.errorBoundaryHitCount || 0);
  }, 0);
  const errorBoundaryEventMap = new Map();
  cycles.forEach((cycle) => {
    const entries = Array.isArray(cycle?.logs?.errorBoundaryEvents) ? cycle.logs.errorBoundaryEvents : [];
    entries.forEach((entry) => {
      const event = String(entry?.event || "").trim();
      if (!event) {
        return;
      }
      errorBoundaryEventMap.set(event, (errorBoundaryEventMap.get(event) || 0) + Number(entry?.count || 0));
    });
  });
  const visualDriftCount = cycles.reduce((sum, cycle) => {
    return sum + Number(cycle?.visuals?.analysis?.summary?.baseline?.driftCount || 0);
  }, 0);
  const visualMissingCount = cycles.reduce((sum, cycle) => {
    return sum + Number(cycle?.visuals?.analysis?.summary?.baseline?.missingCount || 0);
  }, 0);
  const staticRuntimeMissingCount = cycles.reduce((sum, cycle) => {
    return sum + Number(cycle?.checks?.staticRuntimeMissingCount || 0);
  }, 0);
  const staticRuntimeDriftCount = cycles.reduce((sum, cycle) => {
    return sum + Number(cycle?.checks?.staticRuntimeDriftCount || 0);
  }, 0);
  const httpObserved = cycles.some((cycle) => cycle?.checks?.httpObserved === true);
  const httpRequestCount = cycles.reduce((sum, cycle) => sum + Number(cycle?.checks?.httpRequestCount || 0), 0);
  const httpSuccessCount = cycles.reduce((sum, cycle) => sum + Number(cycle?.checks?.httpSuccessCount || 0), 0);
  const httpFailureCount = cycles.reduce((sum, cycle) => sum + Number(cycle?.checks?.httpFailureCount || 0), 0);
  const httpTimeoutCount = cycles.reduce((sum, cycle) => sum + Number(cycle?.checks?.httpTimeoutCount || 0), 0);
  const httpRetryCount = cycles.reduce((sum, cycle) => sum + Number(cycle?.checks?.httpRetryCount || 0), 0);
  const httpSlowOperationCount = cycles.reduce((sum, cycle) => sum + Number(cycle?.checks?.httpSlowOperationCount || 0), 0);
  const httpLatestError = latestCycle?.checks?.httpLastError && typeof latestCycle.checks.httpLastError === "object"
    ? latestCycle.checks.httpLastError
    : null;
  const hostReadyDurationMs = Math.max(0, Number(latestCycle?.checks?.hostReadyDurationMs || 0));
  const startupDurationMs = Math.max(0, Number(latestCycle?.checks?.startupDurationMs || 0));
  const shutdownDurationMs = Math.max(0, Number(latestCycle?.checks?.shutdownDurationMs || 0));
  const lifecycleSlowOperationCount = Math.max(0, Number(latestCycle?.checks?.lifecycleSlowOperationCount || 0));
  const lifecycleSlowThresholdMs = Math.max(0, Number(latestCycle?.checks?.lifecycleSlowThresholdMs || 2000));
  const lifecycleLastSlowStage = typeof latestCycle?.checks?.lifecycleLastSlowStage === "string"
    && latestCycle.checks.lifecycleLastSlowStage.trim()
    ? latestCycle.checks.lifecycleLastSlowStage
    : null;
  const lifecycleBoundaryEvents = Array.isArray(latestCycle?.checks?.lifecycleBoundaryEvents)
    ? latestCycle.checks.lifecycleBoundaryEvents
      .map((entry) => ({
        event: String(entry?.event || "").trim() || "unknown",
        count: Number(entry?.count || 0),
      }))
      .filter((entry) => entry.count > 0)
    : [];
  const status = report.passed === true ? "passed" : "failed";
  const { ageMinutes, ageText } = summarizeAge(report.generatedAt, now);
  const rawDiagnoses = Array.isArray(report.diagnostics)
    ? report.diagnostics
    : cycles.flatMap((cycle) => cycle?.diagnostics || []);
  const diagnoses = rawDiagnoses
    .map((item) => summarizeDiagnosis(item))
    .filter(Boolean)
    .slice(0, 6);
  const primaryDiagnosis = summarizeDiagnosis(report.primaryDiagnosis || diagnoses[0] || null);
  const diagnosisBlocking = isBlockingSeverity(primaryDiagnosis?.severity);
  const candidateFiles = uniqueStrings([
    ...(primaryDiagnosis?.candidateFiles || []),
    ...diagnoses.flatMap((item) => item.candidateFiles || []),
  ]).slice(0, 8);
  const baseRecommendedActions = uniqueStrings([
    ...(primaryDiagnosis?.recommendedActions || []),
    ...diagnoses.flatMap((item) => item.recommendedActions || []),
    ...(Array.isArray(report.hints) ? report.hints : []),
  ]).slice(0, 8);
  const serviceHealth = summarizeServiceHealth(report, latestCycle);
  const registrationHealth = summarizeRegistrationHealth(cycles, latestCycle);
  const capabilitySummary = report.capabilitySummary && typeof report.capabilitySummary === "object"
    ? report.capabilitySummary
    : summarizeCapabilityCoverage(report);
  const readerEventReport = summarizeReaderEventBridge(report, latestCycle);
  const readerHostState = summarizeReaderHostState(report, latestCycle);
  const toolbarEvidenceSummary = summarizeToolbarEvidence(readerEventReport);
  const visualEvidence = summarizeVisualEvidenceItems(cycles);
  const visualEvidenceSummary = summarizeVisualEvidence(latestCycle, visualEvidence);
  const visualCaptureAttemptDiagnosis = summarizeVisualCaptureAttemptDiagnosis(cycles);
  const visualCaptureStability = summarizeVisualCaptureStability(latestCycle);
  const visualPreCaptureSettle = summarizeVisualPreCaptureSettle(latestCycle);
  const visualPrimaryBlocker = summarizeVisualPrimaryBlocker(
    latestCycle,
    visualCaptureStability,
    visualDriftCount,
  );
  const visualCanonicalCoverage = summarizeVisualCanonicalCoverageForCycles(cycles);
  const visualAwareRecommendedActions = [];
  if (String(primaryDiagnosis?.fingerprint || "") === "reader-ui:reader-visual-drift") {
    switch (visualPrimaryBlocker.visualPrimaryBlockerKind) {
      case "capture-command-failed":
        {
          const captureFailureSummary = buildVisualCaptureFailureStageSummary({
            visualCaptureStabilityStages: visualCaptureStability.stages,
          });
          visualAwareRecommendedActions.push(`${captureFailureSummary || "当前存在截图调用失败 stage"}；先复核窗口 bounds、前台激活与 screencapture 调用，再重新执行 \`npm run agent:zotero:e2e\`，暂不进入 baseline refresh、autofix 或 obsidian-first。`);
        }
        break;
      case "capture-unstable":
        {
          const exhaustedStageSummary = buildVisualExhaustedStageSummary({
            visualCaptureStabilityStages: visualCaptureStability.stages,
          });
          visualAwareRecommendedActions.push(
            `${exhaustedStageSummary ? `用尽预算 stage：${exhaustedStageSummary}` : "当前仍有视觉 stage 用尽重试预算"}；先不要刷新视觉基线、进入 autofix 或走 obsidian-first，优先复核视觉采集稳定性后重新执行 \`npm run agent:zotero:e2e\`。`,
          );
        }
        break;
      case "baseline-geometry-mismatch":
        if (visualCanonicalCoverage.visualCanonicalCoverageKind === "partial") {
          visualAwareRecommendedActions.push(`视觉采集已稳定，但 canonical baseline 只部分覆盖；仍不匹配：${visualCanonicalCoverage.visualCanonicalMismatchedTargets.join("、") || "待确认"}。当前先执行 \`npm run agent:obsidian\` 固化证据并决定后续人工收口，不再默认重复刷新 baseline。`);
        } else {
          visualAwareRecommendedActions.push("视觉采集已稳定，但截图与基线尺寸不一致；如当前 UI 变化属预期，可执行 `npm run agent:zotero:e2e:update-baseline` 刷新基线后复验。");
        }
        break;
      case "ui-regression-candidate":
        visualAwareRecommendedActions.push("视觉采集已稳定且几何一致，但仍存在漂移；优先检查 Reader UI / scenario / baseline scene，暂不建议先刷新基线。");
        break;
      default:
        break;
    }
  }
  const recommendedActions = uniqueStrings([
    ...visualAwareRecommendedActions,
    ...baseRecommendedActions.filter((item) => {
      if (String(primaryDiagnosis?.fingerprint || "") !== "reader-ui:reader-visual-drift") {
        return true;
      }
      if (!String(item || "").includes("agent:zotero:e2e:update-baseline")) {
        return true;
      }
      return (
        visualPrimaryBlocker.visualPrimaryBlockerKind === "baseline-geometry-mismatch"
        && visualCanonicalCoverage.visualCanonicalCoverageKind !== "partial"
      );
    }),
  ]).slice(0, 8);
  const runtimeContext = summarizeRuntimeContext(report);
  const reportDetails = report.details && typeof report.details === "object"
    ? report.details
    : {};

  return {
    present: true,
    status,
    statusLabel: pickE2EStatusLabel(status),
    generatedAt: report.generatedAt || null,
    ageMinutes,
    ageText,
    strategy: report.strategy || null,
    durationMs: Math.max(0, Number(report.durationMs || 0)),
    errorCategory: report.errorCategory || null,
    errorCategoryLabel: report.errorCategoryLabel || null,
    errorMessage: report.errorMessage || null,
    failedStage: report.failedStage || null,
    contextObserved: runtimeContext.contextObserved,
    zoteroVersion: runtimeContext.zoteroVersion,
    zoteroVersionBucket: runtimeContext.zoteroVersionBucket,
    latestBootMode: runtimeContext.latestBootMode,
    bootModes: runtimeContext.bootModes,
    cycles: cycles.length,
    passedCycles,
    failedCycles,
    testFailed,
    scenarioFailed,
    logErrorCount,
    logWarnCount,
    errorBoundaryHitCount,
    errorBoundaryEvents: Array.from(errorBoundaryEventMap.entries())
      .map(([event, count]) => ({ event, count }))
      .sort((left, right) => right.count - left.count || left.event.localeCompare(right.event)),
    visualDriftCount,
    visualMissingCount,
    visualCaptureStabilityObserved: visualCaptureStability.observed,
    visualCaptureStageCount: visualCaptureStability.stageCount,
    visualCaptureStableStageCount: visualCaptureStability.stableStageCount,
    visualCaptureUnstableStageCount: visualCaptureStability.unstableStageCount,
    visualCaptureAttemptCount: visualCaptureStability.attemptCount,
    visualCaptureAllStagesStable: visualCaptureStability.allStagesStable,
    visualCaptureStabilitySummary: visualCaptureStability.summary,
    visualCaptureStabilityStages: visualCaptureStability.stages,
    visualPreCaptureSettleObserved: visualPreCaptureSettle.observed,
    visualPreCaptureSettleStageCount: visualPreCaptureSettle.stageCount,
    visualPreCaptureSettleSettledStageCount: visualPreCaptureSettle.settledStageCount,
    visualPreCaptureSettleTimedOutStageCount: visualPreCaptureSettle.timedOutStageCount,
    visualPreCaptureSettleSummary: visualPreCaptureSettle.summary,
    visualPreCaptureSettleStages: visualPreCaptureSettle.stages,
    visualPrimaryBlockerKind: visualPrimaryBlocker.visualPrimaryBlockerKind,
    visualPrimaryBlockerKindLabel: visualPrimaryBlocker.visualPrimaryBlockerKindLabel,
    visualGeometryMismatchCount: visualPrimaryBlocker.visualGeometryMismatchCount,
    visualAllStagesGeometryMatched: visualPrimaryBlocker.visualAllStagesGeometryMatched,
    visualGeometrySummary: visualPrimaryBlocker.visualGeometrySummary,
    visualCanonicalCoverageKind: visualCanonicalCoverage.visualCanonicalCoverageKind,
    visualCanonicalCoverageKindLabel: visualCanonicalCoverage.visualCanonicalCoverageKindLabel,
    visualCanonicalExpectedTargets: visualCanonicalCoverage.visualCanonicalExpectedTargets,
    visualCanonicalMismatchedTargets: visualCanonicalCoverage.visualCanonicalMismatchedTargets,
    visualCanonicalCoverageSummary: visualCanonicalCoverage.visualCanonicalCoverageSummary,
    serviceObserved: serviceHealth.serviceObserved,
    serviceTotal: serviceHealth.serviceTotal,
    serviceHealthyCount: serviceHealth.serviceHealthyCount,
    serviceUnhealthyCount: serviceHealth.serviceUnhealthyCount,
    serviceHealthOK: serviceHealth.serviceHealthOK,
    serviceStatus: serviceHealth.serviceStatus,
    serviceRecoverableMissingKey: serviceHealth.serviceRecoverableMissingKey,
    serviceIssues: serviceHealth.serviceIssues,
    httpObserved,
    httpRequestCount,
    httpSuccessCount,
    httpFailureCount,
    httpTimeoutCount,
    httpRetryCount,
    httpSlowOperationCount,
    httpSlowThresholdMs: Number(latestCycle?.checks?.httpSlowThresholdMs || 0),
    httpLastRequest: latestCycle?.checks?.httpLastRequest || null,
    httpLastErrorKind: httpLatestError?.kind || null,
    httpLastErrorMessage: httpLatestError?.message || null,
    hostReadyDurationMs,
    startupDurationMs,
    shutdownDurationMs,
    lifecycleSlowOperationCount,
    lifecycleSlowThresholdMs,
    lifecycleLastSlowStage,
    lifecycleBoundaryEvents,
    registrationObserved: registrationHealth.registrationObserved,
    officialMenuAPIAvailable: registrationHealth.officialMenuAPIAvailable,
    primaryActionCommandRegistered: registrationHealth.primaryActionCommandRegistered,
    contextActionMenuRegistered: registrationHealth.contextActionMenuRegistered,
    readerSummaryCommandRegistered: registrationHealth.readerSummaryCommandRegistered,
    readerSummaryMenuRegistered: registrationHealth.readerSummaryMenuRegistered,
    preferencePaneRegistered: registrationHealth.preferencePaneRegistered,
    preferencePaneCount: registrationHealth.preferencePaneCount,
    primaryActionCommandMissingCycles: registrationHealth.primaryActionCommandMissingCycles,
    contextActionMenuMissingCycles: registrationHealth.contextActionMenuMissingCycles,
    readerSummaryCommandMissingCycles: registrationHealth.readerSummaryCommandMissingCycles,
    readerSummaryMenuMissingCycles: registrationHealth.readerSummaryMenuMissingCycles,
    preferencePaneMissingCycles: registrationHealth.preferencePaneMissingCycles,
    preferencePaneCountMissingCycles: registrationHealth.preferencePaneCountMissingCycles,
    capabilityObserved: Boolean(capabilitySummary.observed),
    capabilityTotal: Number(capabilitySummary.total || 0),
    capabilityScenarioBoundTotal: Number(capabilitySummary.scenarioBoundTotal || 0),
    capabilityCoveredCount: Number(capabilitySummary.coveredCount || 0),
    capabilityPassedCount: Number(capabilitySummary.passedCount || 0),
    capabilityFailedCount: Number(capabilitySummary.failedCount || 0),
    capabilityUncoveredCount: Number(capabilitySummary.uncoveredCount || 0),
    staticRuntimeMissingCount,
    staticRuntimeDriftCount,
    failedCapabilityIds: uniqueStrings(capabilitySummary.failedCapabilityIds).slice(0, 8),
    uncoveredCapabilityIds: uniqueStrings(capabilitySummary.uncoveredCapabilityIds).slice(0, 8),
    capabilityStatuses: Array.isArray(capabilitySummary.capabilities)
      ? capabilitySummary.capabilities
        .filter((item) => Array.isArray(item.scenarioNames) && item.scenarioNames.length > 0)
        .map((item) => ({
          id: item.id,
          label: item.label || item.id,
          status: item.status,
          scenarioNames: Array.isArray(item.scenarioNames) ? item.scenarioNames.slice(0, 3) : [],
          ownedBy: Array.isArray(item.ownedBy) ? item.ownedBy.slice(0, 3) : [],
        }))
        .slice(0, 12)
      : [],
    note: latestCycle?.summaryNote || report.issues?.[0] || report.hints?.[0] || null,
    issues: Array.isArray(report.issues) ? report.issues : [],
    hints: Array.isArray(report.hints) ? report.hints : [],
    diagnosisBlocking,
    candidateFiles,
    recommendedActions,
    primaryDiagnosis,
    diagnoses,
    details: {
      launchFailure: reportDetails.launchFailure || null,
      runtimeSanitization: reportDetails.runtimeSanitization || null,
    },
    readerEventReport,
    toolbarEvidenceSummary,
    visualEvidenceObserved: visualEvidence.observed,
    visualEvidenceItemCount: visualEvidence.itemCount,
    visualEvidenceFailingItemCount: visualEvidence.failingItemCount,
    visualEvidenceSummary,
    visualEvidenceItems: visualEvidence.items,
    visualCaptureAttemptDiagnosisObserved: visualCaptureAttemptDiagnosis.observed,
    visualCaptureAttemptDiagnosisItemCount: visualCaptureAttemptDiagnosis.itemCount,
    visualCaptureAttemptDiagnosisSummary: visualCaptureAttemptDiagnosis.summary,
    visualCaptureAttemptDiagnosisItems: visualCaptureAttemptDiagnosis.items,
    ...readerHostState,
  };
}

export function summarizeAutofixReport(report, options = {}) {
  const now = parseDate(options.now) || new Date();
  if (!report || typeof report !== "object") {
    return {
      present: false,
      status: "missing",
      statusLabel: pickAutofixStatusLabel("missing"),
      generatedAt: null,
      ageMinutes: null,
      ageText: "-",
      attempts: 0,
      failedAttempts: 0,
      recovered: false,
      durationMs: 0,
      errorCategory: null,
      errorCategoryLabel: null,
      errorMessage: null,
      failedStage: null,
      initialStrategy: null,
      outcomeLabel: null,
      contextObserved: false,
      zoteroVersion: "unknown",
      zoteroVersionBucket: "unknown",
      latestBootMode: "unknown",
      bootModes: ["unknown"],
      totalDurationMs: 0,
      averageDurationMs: 0,
      note: null,
      latestAttemptLabel: null,
      latestAttemptOK: null,
      failedStepBreakdown: [],
      recentAttempts: [],
      recommendations: [],
      patchPlanStatus: "missing",
      patchPlanStatusLabel: "缺失",
      patchPlanMode: "none",
      patchPlanFeature: null,
      patchPlanTargets: [],
      patchDraftCount: 0,
      patchDraftOperations: [],
      patchApplicationStatus: "not-attempted",
      patchApplicationStatusLabel: "未尝试",
      patchApplicationAppliedFiles: [],
      patchApplicationIssues: [],
      patchArchivePresent: false,
      patchArchiveRunId: null,
      patchArchiveEntryPath: null,
      patchArchiveFeature: null,
      patchArchiveDraftOperations: [],
      patchArchiveReasonSummary: [],
      patchVerificationStatus: "missing",
      patchVerificationStatusLabel: "缺失",
      patchVerificationSummary: null,
      patchVerificationChecksTotal: 0,
      patchVerificationChecksFailed: 0,
      patchVerificationChecksOptionalFailed: 0,
      patchVerificationRequiredTotal: 0,
      patchVerificationRequiredPassed: 0,
      patchVerificationRequiredFailed: 0,
      patchVerificationOptionalTotal: 0,
      patchVerificationOptionalPassed: 0,
      patchVerificationOptionalFailed: 0,
      patchVerificationFailedCheckIds: [],
      patchVerificationOptionalFailedCheckIds: [],
      patchVerificationFailedCheckKinds: [],
      patchVerificationOptionalFailedCheckKinds: [],
      patchVerificationFailedChecks: [],
      patchVerificationOptionalFailedChecks: [],
      patchUnsupportedDiagnosisCategory: null,
      patchUnsupportedDiagnosisCategoryLabel: null,
      patchUnsupportedDiagnosisReason: null,
    };
  }

  const attempts = Array.isArray(report.attempts) ? report.attempts : [];
  let status = "unrecovered";
  if (report.outcomeLabel === "无需恢复") {
    status = "clean";
  } else if (report.recovered === true) {
    status = "recovered";
  }
  const { ageMinutes, ageText } = summarizeAge(report.generatedAt, now);
  const latestAttempt = attempts[attempts.length - 1] || null;
  const totalDurationMs = attempts.reduce((sum, attempt) => {
    return sum + Math.max(0, Number(attempt?.durationMs || 0));
  }, 0);
  const averageDurationMs = attempts.length === 0
    ? 0
    : Math.round(totalDurationMs / attempts.length);
  const recentAttempts = attempts.slice(-5).reverse().map((attempt) => ({
    index: attempt?.index ?? null,
    kind: attempt?.kind || "-",
    label: attempt?.label || "-",
    ok: attempt?.ok === true,
    exitCode: attempt?.exitCode ?? null,
    durationMs: Math.max(0, Number(attempt?.durationMs || 0)),
    note: attempt?.note || "-",
  }));
  const failedStepMap = new Map();
  attempts
    .filter((attempt) => attempt?.ok !== true)
    .forEach((attempt) => {
      const label = String(attempt?.label || "未命名步骤");
      failedStepMap.set(label, (failedStepMap.get(label) || 0) + 1);
    });
  const failedStepBreakdown = Array.from(failedStepMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const patchPlan = report.patchPlan && typeof report.patchPlan === "object"
    ? report.patchPlan
    : null;
  const patchApplication = report.patchApplication && typeof report.patchApplication === "object"
    ? report.patchApplication
    : null;
  const patchArchive = report.patchArchive && typeof report.patchArchive === "object"
    ? report.patchArchive
    : null;
  const patchApplicationStatus = patchApplication?.status || "not-attempted";
  const patchApplicationIssues = summarizePatchApplicationIssues(patchApplication);
  const patchDraftOperations = summarizePatchDraftOperations(patchPlan);
  const patchArchiveDraftOperations = Array.isArray(patchArchive?.patch?.draftOperations)
    ? patchArchive.patch.draftOperations.map((entry) => ({
      operation: entry?.operation || null,
      label: entry?.label || pickPatchOperationLabel(entry?.operation),
      count: Number(entry?.count || 0),
      files: Array.isArray(entry?.files) ? entry.files.slice(0, 5) : [],
      fileCount: Number(entry?.fileCount || 0),
    }))
    : [];
  const patchArchiveReasonSummary = Array.isArray(patchArchive?.patch?.resultReasonSummary)
    ? patchArchive.patch.resultReasonSummary.map((entry) => ({
      reason: entry?.reason || null,
      label: entry?.label || pickPatchBlockReasonLabel(entry?.reason),
      count: Number(entry?.count || 0),
      files: Array.isArray(entry?.files) ? entry.files.slice(0, 5) : [],
      fileCount: Number(entry?.fileCount || 0),
    }))
    : [];
  const verificationStats = summarizeVerificationContractStats(patchArchive?.verificationContract);
  const patchVerificationChecksTotal = Number(verificationStats.requiredTotal || 0)
    + Number(verificationStats.optionalTotal || 0);
  const patchUnsupportedDiagnosisCategory = patchArchive?.patch?.unsupportedDiagnosisCategory
    || patchPlan?.unsupportedDiagnosisCategory
    || null;
  const patchUnsupportedDiagnosisCategoryLabel = patchArchive?.patch?.unsupportedDiagnosisCategoryLabel
    || patchPlan?.unsupportedDiagnosisCategoryLabel
    || (patchUnsupportedDiagnosisCategory
      ? pickUnsupportedDiagnosisCategoryLabel(patchUnsupportedDiagnosisCategory)
      : null);
  const patchUnsupportedDiagnosisReason = patchArchive?.patch?.unsupportedDiagnosisReason
    || patchPlan?.unsupportedDiagnosisReason
    || null;
  const runtimeContext = summarizeRuntimeContext(
    report.runtimeContext && typeof report.runtimeContext === "object"
      ? report
      : (patchArchive?.runtimeContext && typeof patchArchive.runtimeContext === "object"
        ? { runtimeContext: patchArchive.runtimeContext }
        : {}),
  );

  return {
    present: true,
    status,
    statusLabel: pickAutofixStatusLabel(status),
    generatedAt: report.generatedAt || null,
    ageMinutes,
    ageText,
    attempts: attempts.length,
    failedAttempts: attempts.filter((attempt) => attempt?.ok !== true).length,
    recovered: Boolean(report.recovered),
    durationMs: Math.max(0, Number(report.durationMs || 0)),
    errorCategory: report.errorCategory || null,
    errorCategoryLabel: report.errorCategoryLabel || null,
    errorMessage: report.errorMessage || null,
    failedStage: report.failedStage || null,
    initialStrategy: report.initialStrategy || null,
    outcomeLabel: report.outcomeLabel || null,
    contextObserved: runtimeContext.contextObserved,
    zoteroVersion: runtimeContext.zoteroVersion,
    zoteroVersionBucket: runtimeContext.zoteroVersionBucket,
    latestBootMode: runtimeContext.latestBootMode,
    bootModes: runtimeContext.bootModes,
    totalDurationMs,
    averageDurationMs,
    note: latestAttempt?.note || report.recommendations?.[0] || null,
    latestAttemptLabel: latestAttempt?.label || null,
    latestAttemptOK: latestAttempt?.ok === true,
    failedStepBreakdown,
    recentAttempts,
    recommendations: Array.isArray(report.recommendations) ? report.recommendations : [],
    patchPlanStatus: patchPlan?.status || "missing",
    patchPlanStatusLabel: patchPlan?.statusLabel || "缺失",
    patchPlanMode: patchPlan?.mode || "none",
    patchPlanFeature: patchPlan?.featureLabel || patchPlan?.feature || null,
    patchPlanTargets: Array.isArray(patchPlan?.allowedTargets) ? patchPlan.allowedTargets.slice(0, 5) : [],
    patchDraftCount: Array.isArray(patchPlan?.patchDrafts) ? patchPlan.patchDrafts.length : 0,
    patchDraftOperations,
    patchApplicationStatus: patchApplicationStatus,
    patchApplicationStatusLabel: pickPatchApplicationStatusLabel(patchApplicationStatus),
    patchApplicationAppliedFiles: Array.isArray(patchApplication?.appliedFiles) ? patchApplication.appliedFiles.slice(0, 5) : [],
    patchApplicationIssues,
    patchArchivePresent: patchArchive?.present === true,
    patchArchiveRunId: patchArchive?.runId || null,
    patchArchiveEntryPath: patchArchive?.entryJSON || null,
    patchArchiveFeature: patchArchive?.patch?.featureLabel || null,
    patchArchiveDraftOperations,
    patchArchiveReasonSummary,
    patchVerificationStatus: patchArchive?.verificationContract?.status || "missing",
    patchVerificationStatusLabel: patchArchive?.verificationContract?.statusLabel || "缺失",
    patchVerificationSummary: patchArchive?.verificationContract?.summary || null,
    patchVerificationChecksTotal,
    patchVerificationChecksFailed: Number(verificationStats.requiredFailed || 0),
    patchVerificationChecksOptionalFailed: Number(verificationStats.optionalFailed || 0),
    patchVerificationRequiredTotal: Number(verificationStats.requiredTotal || 0),
    patchVerificationRequiredPassed: Number(verificationStats.requiredPassed || 0),
    patchVerificationRequiredFailed: Number(verificationStats.requiredFailed || 0),
    patchVerificationOptionalTotal: Number(verificationStats.optionalTotal || 0),
    patchVerificationOptionalPassed: Number(verificationStats.optionalPassed || 0),
    patchVerificationOptionalFailed: Number(verificationStats.optionalFailed || 0),
    patchVerificationFailedCheckIds: verificationStats.failedCheckIds,
    patchVerificationOptionalFailedCheckIds: verificationStats.optionalFailedCheckIds,
    patchVerificationFailedCheckKinds: verificationStats.failedCheckKinds,
    patchVerificationOptionalFailedCheckKinds: verificationStats.optionalFailedCheckKinds,
    patchVerificationFailedChecks: verificationStats.failedChecksSorted,
    patchVerificationOptionalFailedChecks: verificationStats.optionalFailedChecksSorted,
    patchUnsupportedDiagnosisCategory,
    patchUnsupportedDiagnosisCategoryLabel,
    patchUnsupportedDiagnosisReason,
  };
}

export function summarizeWatchRecoveryReport(report, options = {}) {
  const now = parseDate(options.now) || new Date();
  if (!report || typeof report !== "object") {
    return {
      present: false,
      status: "missing",
      statusLabel: pickWatchRecoveryStatusLabel("missing"),
      generatedAt: null,
      ageMinutes: null,
      ageText: "-",
      startupPassed: null,
      latestTrigger: null,
      latestPassed: null,
      latestStatus: null,
      latestAt: null,
      expectedTriggers: [],
      observedTriggers: [],
      summaryNote: null,
      issues: [],
      entries: [],
    };
  }

  const status = report.passed === true ? "passed" : "failed";
  const { ageMinutes, ageText } = summarizeAge(report.generatedAt, now);
  const entries = Array.isArray(report.entries)
    ? report.entries.slice(0, 6).map((entry) => ({
      trigger: entry?.trigger || null,
      passed: entry?.passed === true,
      at: entry?.at || null,
      summaryNote: entry?.summaryNote || null,
      issues: Array.isArray(entry?.issues) ? entry.issues.slice(0, 3) : [],
    }))
    : [];

  return {
    present: true,
    status,
    statusLabel: pickWatchRecoveryStatusLabel(status),
    generatedAt: report.generatedAt || null,
    ageMinutes,
    ageText,
    startupPassed: report.startupPassed === true,
    latestTrigger: report.latestTrigger || null,
    latestPassed: report.latestPassed === true,
    latestStatus: report.latestStatus || null,
    latestAt: report.latestAt || null,
    expectedTriggers: Array.isArray(report.expectedTriggers) ? report.expectedTriggers.slice(0, 5) : [],
    observedTriggers: Array.isArray(report.observedTriggers) ? report.observedTriggers.slice(0, 5) : [],
    summaryNote: report.summaryNote || null,
    issues: Array.isArray(report.issues) ? report.issues.slice(0, 5) : [],
    entries,
  };
}
