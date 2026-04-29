import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { resolveAgentMemoryArtifacts } from "./agent-artifacts.mjs";
import { normalizeDiagnosisFingerprint } from "./agent-zotero-diagnosis-lib.mjs";
import {
  normalizeZoteroVersionBucket,
  pickPatchBlockReasonLabel,
  pickPatchOperationLabel,
  summarizeAutofixReport,
  summarizeE2EReport,
  summarizeRuntimeContext,
  summarizeVerificationContractStats,
  summarizeWatchRecoveryReport,
} from "./agent-zotero-validation-lib.mjs";
import {
  DEFAULT_WATCH_STALE_AFTER_MINUTES,
  summarizeZoteroWatchStatus,
} from "./zotero-watch-status-lib.mjs";

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

function toISODate(dateLike) {
  const date = parseDate(dateLike);
  return date ? date.toISOString() : null;
}

function toRelativePath(baseRoot, filePath) {
  return path.relative(baseRoot, filePath).split(path.sep).join("/");
}

function createSnapshotId(dateLike) {
  const iso = toISODate(dateLike) || new Date().toISOString();
  return iso.replaceAll("-", "").replaceAll(":", "").replace(".", "");
}

function toDayBucket(dateLike) {
  const iso = toISODate(dateLike);
  return iso ? iso.slice(0, 10) : null;
}

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

function roundRate(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeContextValue(value, fallback = "unknown") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeBootMode(value) {
  return normalizeContextValue(value);
}

function buildContextKey(latestBootMode, zoteroVersionBucket) {
  return `${normalizeBootMode(latestBootMode)}|${normalizeContextValue(zoteroVersionBucket)}`;
}

function buildContextSummaryText(context) {
  if (!context || typeof context !== "object") {
    return "unknown / unknown";
  }
  return `${normalizeBootMode(context.latestBootMode)} / ${normalizeContextValue(context.zoteroVersionBucket)}`;
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

function normalizeReasonText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/\d+/gu, "<n>");
}

function normalizeReasonMatcherText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .replace(/\d+/gu, "<n>")
    .replace(/e<n>e/gu, "e2e")
    .replace(/[，。！？；：]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function createSignalReasonDescriptor(reasonKey, label) {
  const normalizedReasonKey = String(reasonKey || "").trim();
  const normalizedLabel = String(label || "").trim();
  if (!normalizedReasonKey || !normalizedLabel) {
    return null;
  }
  return {
    reasonKey: normalizedReasonKey,
    label: normalizedLabel,
  };
}

function createFallbackSignalReasonDescriptor(normalizedLabel) {
  if (!normalizedLabel) {
    return null;
  }
  return createSignalReasonDescriptor(
    `issue:${sanitizeFingerprintSegment(normalizedLabel, "issue")}`,
    normalizedLabel,
  );
}

function nestSignalReasonDescriptor(prefix, nestedReason, labelPrefix, fallbackLabel) {
  if (!nestedReason) {
    return null;
  }
  const normalizedPrefix = String(prefix || "").trim();
  const normalizedLabelPrefix = String(labelPrefix || "").trim();
  const normalizedFallbackLabel = String(fallbackLabel || "").trim();
  if (!normalizedPrefix || !normalizedLabelPrefix || !normalizedFallbackLabel) {
    return null;
  }
  if (String(nestedReason.reasonKey || "").startsWith("issue:")) {
    return createSignalReasonDescriptor(`${normalizedPrefix}-issue`, normalizedFallbackLabel);
  }
  return createSignalReasonDescriptor(
    `${normalizedPrefix}-${nestedReason.reasonKey}`,
    `${normalizedLabelPrefix} / ${nestedReason.label}`,
  );
}

function classifyWatchSignalIssue(normalizedLabel, matcherText) {
  if (!normalizedLabel || !matcherText) {
    return null;
  }
  if (
    matcherText.includes("健康状态已过期")
    || matcherText.includes("状态已过期")
    || matcherText.includes("已过期")
  ) {
    return createSignalReasonDescriptor("stale", "watch 健康状态已过期");
  }
  if (
    matcherText.includes("状态时间异常")
    || matcherText.includes("报告时间显示为")
    || matcherText.includes("时间异常")
  ) {
    return createSignalReasonDescriptor("future", "watch 状态时间异常");
  }
  if (
    matcherText.includes("watch still unhealthy")
    || matcherText.includes("仍不健康")
    || matcherText.includes("未恢复健康")
    || matcherText.includes("健康检查未通过")
    || matcherText.includes("unhealthy")
  ) {
    return createSignalReasonDescriptor("unhealthy", "热重载后仍不健康");
  }
  if (
    matcherText.includes("热重载失败")
    || matcherText.includes("热重载流程失败")
    || matcherText.includes("reload failed")
    || matcherText.includes("watch-change 失败")
  ) {
    return createSignalReasonDescriptor("reload-failed", "热重载失败");
  }
  return null;
}

function classifyE2ESignalIssue(normalizedLabel, matcherText) {
  if (!normalizedLabel || !matcherText) {
    return null;
  }
  if (
    matcherText.includes("addon-static/bootstrap.js")
    || matcherText.includes("bootstrap 启动脚本")
  ) {
    return createSignalReasonDescriptor("bootstrap-file-missing", "bootstrap 启动脚本缺失");
  }
  if (
    matcherText.includes("addon-static/content/preferences.xhtml")
    || matcherText.includes("偏好设置面板资源")
  ) {
    return createSignalReasonDescriptor("preference-pane-resource-missing", "偏好设置面板资源缺失");
  }
  if (
    matcherText.includes("addon-static/content/style/main.css")
    || matcherText.includes("主窗口样式资源")
  ) {
    return createSignalReasonDescriptor("style-resource-missing", "主窗口样式资源缺失");
  }
  if (
    matcherText.includes("addon-static/content/icons/")
    || matcherText.includes("配置声明的 icon 资源")
  ) {
    return createSignalReasonDescriptor("icon-resource-missing", "icon 资源缺失");
  }
  if (
    matcherText.includes("主命令未注册到命令面板")
  ) {
    return createSignalReasonDescriptor("primary-command-missing", "主命令未注册");
  }
  if (
    matcherText.includes("静态运行时基线缺失")
  ) {
    return createSignalReasonDescriptor("static-runtime-missing", "静态运行时基线缺失");
  }
  if (
    matcherText.includes("主窗口上下文菜单项未注册")
  ) {
    return createSignalReasonDescriptor("context-menu-missing", "上下文菜单项未注册");
  }
  if (
    matcherText.includes("偏好设置面板未注册")
  ) {
    return createSignalReasonDescriptor("preference-pane-missing", "偏好设置面板未注册");
  }
  if (
    matcherText.includes("reader 摘要命令未注册")
    || matcherText.includes("reader view 菜单项未注册")
  ) {
    return createSignalReasonDescriptor("reader-entry-drift", "Reader 声明式入口映射缺口");
  }
  if (
    matcherText.includes("插件实例未挂载")
    || matcherText.includes("未稳定挂载到 zotero")
    || matcherText.includes("plugin not mounted")
  ) {
    return createSignalReasonDescriptor("plugin-not-mounted", "插件实例未挂载");
  }
  if (
    matcherText.includes("服务健康异常")
    || matcherText.includes("service health")
    || matcherText.includes("异常服务")
  ) {
    return createSignalReasonDescriptor("service-unhealthy", "服务健康异常");
  }
  if (
    matcherText.includes("能力地图仍有")
    || matcherText.includes("未被本次 e2e 覆盖")
    || matcherText.includes("覆盖不完整")
  ) {
    return createSignalReasonDescriptor("capability-uncovered", "能力覆盖不完整");
  }
  if (
    matcherText.includes("视觉漂移")
    || matcherText.includes("visual drift")
    || matcherText.includes("drift")
  ) {
    return createSignalReasonDescriptor("visual-drift", "视觉漂移");
  }
  if (
    matcherText.includes("集成测试失败")
    || matcherText.includes("failed tests")
    || matcherText.includes("test failed")
  ) {
    return createSignalReasonDescriptor("test-failed", "集成测试失败");
  }
  if (
    matcherText.includes("场景验证失败")
    || matcherText.includes("scenario failed")
    || matcherText.includes("链路失败")
    || matcherText.includes("闭环失败")
  ) {
    return createSignalReasonDescriptor("scenario-failed", "场景链路失败");
  }
  return null;
}

function classifyE2EDiagnosisFingerprint(fingerprint) {
  const normalized = normalizeDiagnosisFingerprint(fingerprint).toLowerCase();
  if (!normalized) {
    return null;
  }

  switch (normalized) {
    case "bootstrap:bootstrap-file-missing":
      return createSignalReasonDescriptor("bootstrap-file-missing", "bootstrap 启动脚本缺失");
    case "bootstrap:plugin-not-mounted":
      return createSignalReasonDescriptor("plugin-not-mounted", "插件实例未挂载");
    case "config:default-enabled-disabled":
      return createSignalReasonDescriptor("default-enabled-disabled", "默认启用配置漂移");
    case "lifecycle:baseline-registration-missing":
      return createSignalReasonDescriptor("baseline-registration-missing", "基线注册链缺失");
    case "menu-action:primary-command-missing":
      return createSignalReasonDescriptor("primary-command-missing", "主命令未注册");
    case "menu-action:context-menu-missing":
      return createSignalReasonDescriptor("context-menu-missing", "上下文菜单项未注册");
    case "preferences:preference-pane-missing":
      return createSignalReasonDescriptor("preference-pane-missing", "偏好设置面板未注册");
    case "preferences:preference-pane-resource-missing":
      return createSignalReasonDescriptor("preference-pane-resource-missing", "偏好设置面板资源缺失");
    case "agent-action:agent-action-failed":
      return createSignalReasonDescriptor("agent-action-failed", "Agent 动作入口失败");
    case "reader-entry:declarative-reader-mapping-drift":
      return createSignalReasonDescriptor("reader-entry-drift", "Reader 声明式入口映射缺口");
    case "reader-event:toolbar-bridge-registration-drift":
      return createSignalReasonDescriptor("reader-toolbar-bridge-drift", "Reader renderToolbar 桥接漂移");
    case "reader-event:fine-grained-hook-declaration-drift":
      return createSignalReasonDescriptor("reader-hook-declaration-drift", "Reader 细粒度 Hook 声明漂移");
    case "localization:item-pane-info-row-l10n-id-drift":
    case "localization:item-pane-section-header-l10n-id-drift":
    case "localization:item-pane-section-sidenav-l10n-id-drift":
      return createSignalReasonDescriptor("item-pane-l10n-drift", "ItemPane 本地化引用漂移");
    case "localization:item-pane-info-row-ftl-key-missing":
    case "localization:item-pane-section-header-ftl-key-missing":
    case "localization:item-pane-section-sidenav-ftl-key-missing":
      return createSignalReasonDescriptor("locale-ftl-missing", "Locale FTL 资源缺失");
    case "localization:item-pane-info-row-ftl-value-drift":
    case "localization:item-pane-section-header-ftl-value-drift":
    case "localization:item-pane-section-sidenav-ftl-value-drift":
      return createSignalReasonDescriptor("locale-ftl-value-drift", "Locale FTL 值漂移");
    case "item-pane:item-pane-section-missing":
      return createSignalReasonDescriptor("item-pane-section-missing", "ItemPane Section 未注册");
    case "item-pane:item-pane-info-row-missing":
      return createSignalReasonDescriptor("item-pane-info-row-missing", "ItemPane InfoRow 未注册");
    case "item-tree:item-tree-column-missing":
      return createSignalReasonDescriptor("item-tree-column-missing", "ItemTree 自定义列未注册");
    case "notifier:notifier-inactive":
      return createSignalReasonDescriptor("notifier-inactive", "Notifier 未激活");
    case "reader-ui:reader-visual-drift":
      return createSignalReasonDescriptor("visual-drift", "视觉漂移");
    case "runtime-logs:style-sheet-resource-missing":
      return createSignalReasonDescriptor("style-resource-missing", "主窗口样式资源缺失");
    case "assets:icon-resource-missing":
      return createSignalReasonDescriptor("icon-resource-missing", "icon 资源缺失");
    case "assets:icon-resource-drift":
      return createSignalReasonDescriptor("icon-resource-drift", "icon 资源漂移");
    case "runtime-logs:error-logs-present":
      return createSignalReasonDescriptor("error-logs-present", "运行时错误日志");
    case "tests:tests-failed":
      return createSignalReasonDescriptor("test-failed", "集成测试失败");
    case "scenarios:scenarios-failed":
      return createSignalReasonDescriptor("scenario-failed", "场景链路失败");
    default:
      return null;
  }
}

function classifyReaderEventSignalIssue(normalizedLabel, matcherText) {
  if (!normalizedLabel || !matcherText) {
    return null;
  }
  if (
    matcherText.includes("摘要缺失")
    || matcherText.includes("结构化摘要缺失")
  ) {
    return createSignalReasonDescriptor("summary-missing", "Reader 事件桥摘要缺失");
  }
  if (
    matcherText.includes("事件 api 当前不可用")
    || matcherText.includes("事件 api 不可用")
    || matcherText.includes("reader 事件 api 当前不可用")
  ) {
    return createSignalReasonDescriptor("event-api-unavailable", "Reader 事件 API 不可用");
  }
  if (
    matcherText.includes("synthetic-fallback")
    && (
      matcherText.includes("缺少")
      || matcherText.includes("不可用")
    )
  ) {
    return createSignalReasonDescriptor("synthetic-fallback-missing", "缺少 synthetic-fallback");
  }
  if (matcherText.includes("hook 场景") && matcherText.includes("缺失")) {
    return createSignalReasonDescriptor("hook-missing", "Hook 场景缺失");
  }
  if (
    matcherText.includes("hook 场景")
    && (
      matcherText.includes("失败")
      || matcherText.includes("异常")
    )
  ) {
    return createSignalReasonDescriptor("hook-failed", "Hook 场景失败");
  }
  if (matcherText.includes("细粒度 hook") && matcherText.includes("缺失")) {
    return createSignalReasonDescriptor("fine-grained-missing", "细粒度 Hook 缺失");
  }
  if (
    matcherText.includes("细粒度 hook")
    && (
      matcherText.includes("失败")
      || matcherText.includes("异常")
    )
  ) {
    return createSignalReasonDescriptor("fine-grained-failed", "细粒度 Hook 失败");
  }
  if (matcherText.includes("reader 事件桥未通过")) {
    return createSignalReasonDescriptor("bridge-failed", "Reader 事件桥未通过");
  }
  return null;
}

function classifyWatchRecoverySignalIssue(normalizedLabel, matcherText) {
  if (!normalizedLabel || !matcherText) {
    return null;
  }
  if (matcherText.includes("未观测到完整恢复触发序列") || matcherText.includes("未完成闭环")) {
    return createSignalReasonDescriptor("sequence-incomplete", "恢复触发序列不完整");
  }
  if (matcherText.includes("未观测到 session-restart-recovery")) {
    return createSignalReasonDescriptor("missing-session-restart", "未观测到 session-restart-recovery");
  }
  if (matcherText.includes("watch 启动健康检查未通过")) {
    return createSignalReasonDescriptor("startup-unhealthy", "watch 启动健康检查未通过");
  }
  if (matcherText.includes("未观测到预期的 watch-change 失败入口")) {
    return createSignalReasonDescriptor("missing-watch-change", "未观测到 watch-change 失败入口");
  }
  if (matcherText.includes("未观测到预期的 runtime-recovery 失败")) {
    return createSignalReasonDescriptor("missing-runtime-recovery", "未观测到 runtime-recovery 失败");
  }
  if (
    matcherText.includes("session-restart-recovery 未恢复为健康状态")
    || matcherText.includes("最新 session-restart-recovery 结果未通过")
  ) {
    return createSignalReasonDescriptor("session-restart-unhealthy", "session-restart-recovery 未恢复健康");
  }
  if (matcherText.includes("最新触发不是 session-restart-recovery")) {
    return createSignalReasonDescriptor("latest-trigger-unexpected", "最新触发不是 session-restart-recovery");
  }
  return null;
}

function classifyGateSignalIssue(normalizedLabel, matcherText) {
  if (!normalizedLabel || !matcherText) {
    return null;
  }

  if (/^watch 问题[:：]\s*/iu.test(normalizedLabel)) {
    const nestedLabel = normalizeReasonText(normalizedLabel.replace(/^watch 问题[:：]\s*/iu, ""));
    const nestedReason = classifyWatchSignalIssue(nestedLabel, normalizeReasonMatcherText(nestedLabel));
    return nestSignalReasonDescriptor("watch", nestedReason, "watch 问题", "watch 细项问题");
  }

  if (/^恢复回归问题[:：]\s*/u.test(normalizedLabel)) {
    const nestedLabel = normalizeReasonText(normalizedLabel.replace(/^恢复回归问题[:：]\s*/u, ""));
    const nestedReason = classifyWatchRecoverySignalIssue(nestedLabel, normalizeReasonMatcherText(nestedLabel));
    return nestSignalReasonDescriptor(
      "watch-recovery",
      nestedReason,
      "恢复回归问题",
      "恢复回归细项问题",
    );
  }

  if (matcherText.includes("zotero watch 健康状态已过期")) {
    return createSignalReasonDescriptor("watch-stale", "watch 健康状态已过期");
  }
  if (matcherText.includes("zotero watch 状态时间异常")) {
    return createSignalReasonDescriptor("watch-future", "watch 状态时间异常");
  }
  if (matcherText.includes("zotero watch 状态未恢复健康")) {
    return createSignalReasonDescriptor("watch-unhealthy", "watch 未恢复健康");
  }
  if (matcherText.includes("最近 zotero e2e 未通过 且还没有对应的自动修复记录")) {
    return createSignalReasonDescriptor("autofix-missing", "缺少对应自动修复记录");
  }
  if (matcherText.includes("最近 zotero e2e 未通过 但自动修复记录仍早于这次失败结果")) {
    return createSignalReasonDescriptor("autofix-outdated", "自动修复结果落后于当前失败");
  }
  if (matcherText.includes("最近自动修复结果仍为未恢复")) {
    return createSignalReasonDescriptor("autofix-unrecovered", "自动修复仍未恢复");
  }
  if (matcherText.includes("白名单补丁预检失败")) {
    return createSignalReasonDescriptor("patch-precheck-failed", "白名单补丁预检失败");
  }
  if (
    matcherText.includes("能力地图仍有")
    || matcherText.includes("未被本次 e2e 覆盖")
  ) {
    return createSignalReasonDescriptor("capability-uncovered", "能力覆盖不完整");
  }
  if (matcherText.includes("zotero 服务健康异常")) {
    return createSignalReasonDescriptor("service-unhealthy", "服务健康异常");
  }
  if (matcherText.includes("reader 事件桥未通过")) {
    return createSignalReasonDescriptor("reader-event-failed", "Reader 事件桥未通过");
  }
  if (matcherText.includes("reader 事件 api 当前不可用")) {
    return createSignalReasonDescriptor("reader-event-api-unavailable", "Reader 事件 API 不可用");
  }
  if (matcherText.includes("reader 事件桥缺少 synthetic-fallback")) {
    return createSignalReasonDescriptor("reader-event-synthetic-fallback-missing", "Reader 事件桥缺少 synthetic-fallback");
  }
  if (matcherText.includes("reader 事件桥能力已有真机观测 但当前报告缺少结构化摘要")) {
    return createSignalReasonDescriptor("reader-event-summary-missing", "Reader 事件桥摘要缺失");
  }
  if (matcherText.includes("最近 zotero e2e 结果已过期")) {
    return createSignalReasonDescriptor("e2e-stale", "最近 E2E 结果已过期");
  }
  if (matcherText.includes("最近 watch 恢复回归未通过")) {
    return createSignalReasonDescriptor("watch-recovery-failed", "watch 恢复回归未通过");
  }
  if (matcherText.includes("集成测试失败")) {
    return createSignalReasonDescriptor("test-failed", "集成测试失败");
  }
  if (matcherText.includes("场景验证失败")) {
    return createSignalReasonDescriptor("scenario-failed", "场景验证失败");
  }
  if (matcherText.includes("视觉漂移")) {
    return createSignalReasonDescriptor("visual-drift", "视觉漂移");
  }
  if (matcherText.includes("最近 zotero e2e 未通过")) {
    return createSignalReasonDescriptor("e2e-failed", "最近 E2E 未通过");
  }
  return null;
}

function classifySignalIssueReason(signalId, issue) {
  const normalizedLabel = normalizeReasonText(issue);
  if (!normalizedLabel) {
    return null;
  }
  const matcherText = normalizeReasonMatcherText(normalizedLabel);
  let classified = null;

  switch (signalId) {
    case "watch":
      classified = classifyWatchSignalIssue(normalizedLabel, matcherText);
      break;
    case "e2e":
      classified = classifyE2ESignalIssue(normalizedLabel, matcherText);
      break;
    case "readerEvent":
      classified = classifyReaderEventSignalIssue(normalizedLabel, matcherText);
      break;
    case "watchRecovery":
      classified = classifyWatchRecoverySignalIssue(normalizedLabel, matcherText);
      break;
    case "gate":
      classified = classifyGateSignalIssue(normalizedLabel, matcherText);
      break;
    default:
      break;
  }

  return classified || createFallbackSignalReasonDescriptor(normalizedLabel);
}

const SIGNAL_DEFINITIONS = [
  { id: "watch", label: "Watch 热重载" },
  { id: "e2e", label: "Zotero E2E" },
  { id: "readerEvent", label: "Reader 事件桥" },
  { id: "autofix", label: "自动修复" },
  { id: "watchRecovery", label: "恢复回归" },
  { id: "cpuProfiler", label: "CPU Profiler 诊断" },
  { id: "memoryDiagnostics", label: "内存诊断" },
  { id: "gate", label: "质量闸门" },
  { id: "releaseMatrix", label: "本地发布矩阵" },
];

const SIGNAL_METRIC_DEFINITIONS = {
  watch: [
    { id: "issueCount", label: "问题数", better: "lower", highlightPriority: 4 },
    { id: "staleCount", label: "过期次数", better: "lower", highlightPriority: 5 },
    { id: "futureCount", label: "未来时间异常", better: "lower", highlightPriority: 5 },
    { id: "unhealthyCount", label: "不健康次数", better: "lower", highlightPriority: 5 },
  ],
  e2e: [
    { id: "cycleFailedCount", label: "失败轮次", better: "lower", highlightPriority: 5 },
    { id: "logErrorCount", label: "错误日志", better: "lower", highlightPriority: 5 },
    { id: "testFailed", label: "失败测试", better: "lower", highlightPriority: 4 },
    { id: "scenarioFailed", label: "失败场景", better: "lower", highlightPriority: 4 },
    { id: "visualDriftCount", label: "视觉漂移", better: "lower", highlightPriority: 4 },
    { id: "visualMissingCount", label: "视觉缺失", better: "lower", highlightPriority: 4 },
    { id: "serviceUnhealthyCount", label: "异常服务", better: "lower", highlightPriority: 5 },
    { id: "primaryActionCommandMissingCycles", label: "主命令缺失轮次", better: "lower", highlightPriority: 3 },
    { id: "contextActionMenuMissingCycles", label: "上下文菜单缺失轮次", better: "lower", highlightPriority: 3 },
    { id: "readerSummaryCommandMissingCycles", label: "Reader 命令缺失轮次", better: "lower", highlightPriority: 3 },
    { id: "readerSummaryMenuMissingCycles", label: "Reader 菜单缺失轮次", better: "lower", highlightPriority: 3 },
    { id: "preferencePaneMissingCycles", label: "偏好设置面板缺失轮次", better: "lower", highlightPriority: 3 },
    { id: "capabilityFailedCount", label: "失败能力", better: "lower", highlightPriority: 4 },
    { id: "capabilityUncoveredCount", label: "未覆盖能力", better: "lower", highlightPriority: 5 },
    { id: "staticRuntimeMissingCount", label: "静态运行时缺失", better: "lower", highlightPriority: 5 },
  ],
  readerEvent: [
    { id: "unavailableCount", label: "事件 API 不可用", better: "lower", highlightPriority: 5 },
    { id: "syntheticFallbackMissingCount", label: "缺少 synthetic-fallback", better: "lower", highlightPriority: 5 },
    { id: "hookFailedCount", label: "Hook 场景失败", better: "lower", highlightPriority: 4 },
    { id: "hookMissingCount", label: "Hook 场景缺失", better: "lower", highlightPriority: 4 },
    { id: "fineGrainedFailedCount", label: "细粒度 Hook 失败", better: "lower", highlightPriority: 4 },
    { id: "fineGrainedMissingCount", label: "细粒度 Hook 缺失", better: "lower", highlightPriority: 4 },
    { id: "knownTypeCount", label: "已知事件类型", better: "higher", highlightPriority: 1 },
    { id: "probeCompatibleTypeCount", label: "可探针类型", better: "higher", highlightPriority: 1 },
    { id: "probeObservedTypeCount", label: "已观测探针类型", better: "higher", highlightPriority: 1 },
  ],
  autofix: [
    { id: "failedAttempts", label: "失败步骤", better: "lower", highlightPriority: 5 },
    { id: "attempts", label: "恢复尝试", better: "lower", highlightPriority: 1 },
    { id: "patchApplicationIssueCount", label: "补丁阻塞", better: "lower", highlightPriority: 4 },
    { id: "patchVerificationChecksFailed", label: "复验失败项", better: "lower", highlightPriority: 4 },
    { id: "patchVerificationRequiredFailed", label: "必需复验失败", better: "lower", highlightPriority: 5 },
    { id: "patchVerificationOptionalFailed", label: "观察复验失败", better: "lower", highlightPriority: 3 },
  ],
  watchRecovery: [
    { id: "issueCount", label: "恢复问题", better: "lower", highlightPriority: 4 },
    { id: "missingTriggerCount", label: "缺失触发", better: "lower", highlightPriority: 5 },
  ],
  cpuProfiler: [
    { id: "failedActivityCount", label: "Profiler 失败活动", better: "lower", highlightPriority: 5 },
    { id: "successfulActivityCount", label: "Profiler 成功活动", better: "higher", highlightPriority: 3 },
    { id: "currentPluginCpuPercent", label: "当前插件 CPU 占比", better: "lower", highlightPriority: 4 },
    { id: "unknownCpuPercent", label: "Unknown CPU 占比", better: "lower", highlightPriority: 4 },
  ],
  memoryDiagnostics: [
    { id: "failedActivityCount", label: "内存诊断失败活动", better: "lower", highlightPriority: 5 },
    { id: "rssDeltaMb", label: "RSS delta", better: "lower", highlightPriority: 4 },
    { id: "residentDeltaMb", label: "Resident delta", better: "lower", highlightPriority: 4 },
    { id: "explicitDeltaMb", label: "Explicit delta", better: "lower", highlightPriority: 4 },
  ],
  gate: [
    { id: "blockerCount", label: "阻断项", better: "lower", highlightPriority: 5 },
    { id: "recentFailed", label: "最近失败", better: "lower", highlightPriority: 2 },
    { id: "effectiveFailed", label: "有效失败", better: "lower", highlightPriority: 4 },
  ],
  releaseMatrix: [
    { id: "failedProfileCount", label: "失败渠道", better: "lower", highlightPriority: 5 },
    { id: "attentionProfileCount", label: "待补验证渠道", better: "lower", highlightPriority: 4 },
    { id: "installSmokeMissingCount", label: "缺失安装态 smoke", better: "lower", highlightPriority: 4 },
    { id: "artifactCheckFailedCount", label: "工件校验失败", better: "lower", highlightPriority: 5 },
  ],
};

function pickMetricDirectionRank(direction) {
  switch (String(direction || "").trim()) {
    case "regressing":
      return 4;
    case "flat":
      return 3;
    case "improving":
      return 2;
    case "baseline":
      return 1;
    default:
      return 0;
  }
}

function pickMetricHighlights(metricTrends, limit = 3) {
  return (Array.isArray(metricTrends) ? metricTrends : [])
    .filter((item) => Number(item?.latestValue || 0) > 0)
    .sort((a, b) => {
      const priorityDiff = Number(b?.highlightPriority || 0) - Number(a?.highlightPriority || 0);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      const directionDiff = pickMetricDirectionRank(b?.direction) - pickMetricDirectionRank(a?.direction);
      if (directionDiff !== 0) {
        return directionDiff;
      }
      const latestValueDiff = Number(b?.latestValue || 0) - Number(a?.latestValue || 0);
      if (latestValueDiff !== 0) {
        return latestValueDiff;
      }
      const recentAverageDiff = Number(b?.recentAverage || 0) - Number(a?.recentAverage || 0);
      if (recentAverageDiff !== 0) {
        return recentAverageDiff;
      }
      const definitionIndexDiff = Number(a?.definitionIndex ?? Number.MAX_SAFE_INTEGER)
        - Number(b?.definitionIndex ?? Number.MAX_SAFE_INTEGER);
      if (definitionIndexDiff !== 0) {
        return definitionIndexDiff;
      }
      return String(a?.metricId || "").localeCompare(String(b?.metricId || ""));
    })
    .slice(0, Math.max(1, Number(limit || 3)));
}

function pickGateStatusLabel(gatePassed) {
  return gatePassed ? "通过" : "阻断";
}

function buildSignalEntryKey(entry) {
  return `${String(entry?.observedAt || "")}|${String(entry?.status || "")}|${entry?.ok === true ? "ok" : "bad"}`;
}

function buildReasonKey(item) {
  return `${String(item?.reason || "")}|${String(item?.label || "")}`;
}

function dedupeReasonItems(items) {
  const reasonMap = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const reason = String(item?.reason || "").trim();
    const label = String(item?.label || "").trim();
    if (!reason || !label) {
      return;
    }
    const key = buildReasonKey({ reason, label });
    if (!reasonMap.has(key)) {
      reasonMap.set(key, {
        reason,
        label,
        count: 0,
        sourceSignalId: item?.sourceSignalId || null,
        sourceSignalLabel: item?.sourceSignalLabel || null,
      });
    }
    reasonMap.get(key).count += Math.max(1, Number(item?.count || 0) || 1);
  });
  return Array.from(reasonMap.values());
}

function appendUniqueReasonItem(items, item) {
  const list = Array.isArray(items) ? items.slice() : [];
  if (!item || typeof item !== "object") {
    return list;
  }
  if (list.some((entry) => buildReasonKey(entry) === buildReasonKey(item))) {
    return list;
  }
  list.push(item);
  return list;
}

function createSignalIssueReason(signalId, signalLabel, issue) {
  const classified = classifySignalIssueReason(signalId, issue);
  if (!classified) {
    return null;
  }
  return {
    reason: `${signalId}:${classified.reasonKey}`,
    label: `${signalLabel} / ${classified.label}`,
    count: 1,
    sourceSignalId: signalId,
    sourceSignalLabel: signalLabel,
  };
}

function createSignalEntryFallbackReason(signalId, signalLabel, entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  if (signalId === "watch") {
    if (entry.status === "stale") {
      return createSignalIssueReason(signalId, signalLabel, "watch 健康状态已过期");
    }
    if (entry.status === "future") {
      return createSignalIssueReason(signalId, signalLabel, "watch 状态时间异常");
    }
    if (entry.status !== "healthy" && entry.detail) {
      return createSignalIssueReason(signalId, signalLabel, entry.detail);
    }
    return null;
  }

  if (signalId === "e2e" && entry.status !== "passed" && entry.detail) {
    return createSignalIssueReason(signalId, signalLabel, entry.detail);
  }

  if (signalId === "readerEvent" && entry.status !== "passed" && entry.detail) {
    return createSignalIssueReason(signalId, signalLabel, entry.detail);
  }

  if (signalId === "watchRecovery" && entry.status !== "passed" && entry.detail) {
    return createSignalIssueReason(signalId, signalLabel, entry.detail);
  }

  if (signalId === "gate" && entry.status !== "passed" && entry.detail) {
    return createSignalIssueReason(signalId, signalLabel, entry.detail);
  }

  return null;
}

function shouldPreferSignalFallbackReason(signalId, entry) {
  return signalId === "watch" && (entry?.status === "stale" || entry?.status === "future");
}

function createSignalStructuredReason(signalId, signalLabel, reason, label, count = 1) {
  const normalizedReason = String(reason || "").trim();
  const normalizedLabel = String(label || "").trim();
  if (!normalizedReason || !normalizedLabel) {
    return null;
  }
  return {
    reason: `${signalId}:${normalizedReason}`,
    label: `${signalLabel} / ${normalizedLabel}`,
    count: Math.max(1, Number(count || 0) || 1),
    sourceSignalId: signalId,
    sourceSignalLabel: signalLabel,
  };
}

function createSignalReasonHistoryEntry(signalId, signalLabel, entry, reason) {
  if (!entry || !reason) {
    return null;
  }
  return {
    generatedAt: entry.observedAt || null,
    fingerprint: `${signalId}:${reason.reason}`,
    featureLabel: signalLabel || signalId,
    success: entry.ok === true,
    outcomeLabel: entry.statusLabel || (entry.ok === true ? "通过" : "失败"),
    strategyId: `signal:${signalId}`,
    strategyLabel: `${signalLabel || signalId} 信号`,
    candidateFiles: [],
    reason: reason.reason,
    label: reason.label,
    weight: Math.max(1, Number(reason.count || 0) || 1),
  };
}

function normalizeArchivedSignalReason(signalId, signalLabel, reasonItem) {
  if (!reasonItem || typeof reasonItem !== "object") {
    return null;
  }

  const existingReason = String(reasonItem.reason || "").trim();
  const existingLabel = String(reasonItem.label || "").trim();
  const count = Math.max(1, Number(reasonItem.count || 0) || 1);

  if (existingReason.startsWith(`${signalId}:`) && !existingReason.includes(":issue:") && existingLabel) {
    return {
      reason: existingReason,
      label: existingLabel,
      count,
      sourceSignalId: signalId,
      sourceSignalLabel: signalLabel,
    };
  }

  const labelPrefix = `${signalLabel} / `;
  const rawLabel = existingLabel.startsWith(labelPrefix)
    ? existingLabel.slice(labelPrefix.length).trim()
    : existingLabel;
  const fallbackText = rawLabel || existingReason.replace(new RegExp(`^${signalId}:`, "u"), "").trim();
  const classified = classifySignalIssueReason(signalId, fallbackText);
  if (!classified) {
    return null;
  }

  return {
    reason: `${signalId}:${classified.reasonKey}`,
    label: `${signalLabel} / ${classified.label}`,
    count,
    sourceSignalId: signalId,
    sourceSignalLabel: signalLabel,
  };
}

function normalizeArchivedSignalEntry(signalId, entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const definition = SIGNAL_DEFINITIONS.find((item) => item.id === signalId);
  const signalLabel = definition?.label || String(entry.label || signalId);
  const fallbackReason = createSignalEntryFallbackReason(signalId, signalLabel, entry);
  const normalizedReasons = entry.ok === true
    ? []
    : dedupeReasonItems([
      ...(shouldPreferSignalFallbackReason(signalId, entry)
        ? []
        : (Array.isArray(entry.reasons) ? entry.reasons : [])
          .map((item) => normalizeArchivedSignalReason(signalId, signalLabel, item))
          .filter(Boolean)),
      ...(fallbackReason ? [fallbackReason] : []),
    ]);

  return {
    ...entry,
    signalId,
    label: signalLabel,
    reasons: normalizedReasons,
  };
}

function createMetricBucket(day) {
  return {
    day,
    total: 0,
    count: 0,
    max: 0,
  };
}

function finalizeMetricBucket(bucket) {
  return {
    day: bucket.day,
    total: Number(bucket.total || 0),
    count: Number(bucket.count || 0),
    average: Number(bucket.count || 0) === 0
      ? 0
      : roundRate(Number(bucket.total || 0) / Number(bucket.count || 0)),
    max: Number(bucket.max || 0),
  };
}

function createSignalBucket(day) {
  return {
    day,
    total: 0,
    okCount: 0,
    badCount: 0,
    statuses: new Set(),
  };
}

function finalizeSignalBucket(bucket) {
  const total = Number(bucket.total || 0);
  return {
    day: bucket.day,
    total,
    okCount: Number(bucket.okCount || 0),
    badCount: Number(bucket.badCount || 0),
    okRate: total === 0 ? 0 : roundRate((Number(bucket.okCount || 0) / total) * 100),
    statusKinds: bucket.statuses.size,
  };
}

function summarizeSignalWindow(days) {
  const list = Array.isArray(days) ? days : [];
  const total = list.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const okCount = list.reduce((sum, item) => sum + Number(item.okCount || 0), 0);
  const badCount = list.reduce((sum, item) => sum + Number(item.badCount || 0), 0);

  return {
    total,
    okCount,
    badCount,
    okRate: total === 0 ? 0 : roundRate((okCount / total) * 100),
    uniqueDays: list.length,
  };
}

function pickSignalTrendDirection(recentWindow, previousWindow) {
  if (!previousWindow || Number(previousWindow.total || 0) === 0) {
    return {
      direction: "baseline",
      directionLabel: "基线",
      summary: "历史样本还不足以形成前后窗口对比，当前仅作为信号趋势基线。",
    };
  }

  const recentBad = Number(recentWindow.badCount || 0);
  const previousBad = Number(previousWindow.badCount || 0);
  const recentOkRate = Number(recentWindow.okRate || 0);
  const previousOkRate = Number(previousWindow.okRate || 0);

  if (recentBad < previousBad || recentOkRate > previousOkRate) {
    return {
      direction: "improving",
      directionLabel: "改善中",
      summary: "最近窗口的异常状态更少或健康率更高，说明该信号正在变稳。",
    };
  }

  if (recentBad > previousBad || recentOkRate < previousOkRate) {
    return {
      direction: "regressing",
      directionLabel: "回归中",
      summary: "最近窗口的异常状态更多或健康率更低，建议优先回看该信号。",
    };
  }

  return {
    direction: "flat",
    directionLabel: "持平",
    summary: "最近窗口与前序窗口基本持平，尚未观察到明显改善或回归。",
  };
}

function pickMetricTrendDirection(recentAverage, previousAverage, better = "lower") {
  const recent = Number(recentAverage || 0);
  const previous = Number(previousAverage || 0);

  if (previous === 0 && recent === 0) {
    return {
      direction: "flat",
      directionLabel: "持平",
      summary: "最近窗口与前序窗口都没有观察到该异常指标。",
    };
  }

  if (previous === 0) {
    return {
      direction: "baseline",
      directionLabel: "基线",
      summary: "历史样本还不足以形成该指标的前后窗口对比。",
    };
  }

  if (better === "lower") {
    if (recent < previous) {
      return {
        direction: "improving",
        directionLabel: "改善中",
        summary: "最近窗口该异常指标更低，说明问题在缓解。",
      };
    }
    if (recent > previous) {
      return {
        direction: "regressing",
        directionLabel: "回归中",
        summary: "最近窗口该异常指标更高，说明问题在扩大。",
      };
    }
  } else if (recent > previous) {
    return {
      direction: "improving",
      directionLabel: "改善中",
      summary: "最近窗口该指标更高，说明趋势改善。",
    };
  } else if (recent < previous) {
    return {
      direction: "regressing",
      directionLabel: "回归中",
      summary: "最近窗口该指标更低，说明趋势回归。",
    };
  }

  return {
    direction: "flat",
    directionLabel: "持平",
    summary: "最近窗口与前序窗口该指标基本持平。",
  };
}

function buildSignalTrend(entries, options = {}) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const maxDays = Math.max(1, Number(options.maxDays || 7));
  const windowSize = Math.max(1, Number(options.windowSize || 3));
  const bucketMap = new Map();

  normalizedEntries.forEach((entry) => {
    const day = toDayBucket(entry.observedAt);
    if (!day) {
      return;
    }

    if (!bucketMap.has(day)) {
      bucketMap.set(day, createSignalBucket(day));
    }

    const bucket = bucketMap.get(day);
    bucket.total += 1;
    if (entry.ok === true) {
      bucket.okCount += 1;
    } else {
      bucket.badCount += 1;
    }
    bucket.statuses.add(String(entry.status || "unknown"));
  });

  const days = Array.from(bucketMap.values())
    .map((bucket) => finalizeSignalBucket(bucket))
    .sort((a, b) => String(b.day || "").localeCompare(String(a.day || "")))
    .slice(0, maxDays);
  const recentWindowDays = days.slice(0, windowSize);
  const previousWindowDays = days.slice(windowSize, windowSize * 2);
  const recentWindow = summarizeSignalWindow(recentWindowDays);
  const previousWindow = summarizeSignalWindow(previousWindowDays);
  const direction = pickSignalTrendDirection(recentWindow, previousWindow);

  return {
    days,
    recentWindow,
    previousWindow,
    direction: direction.direction,
    directionLabel: direction.directionLabel,
    summary: direction.summary,
  };
}

function buildSignalMetricTrends(signalId, entries, options = {}) {
  const definitions = Array.isArray(SIGNAL_METRIC_DEFINITIONS[signalId])
    ? SIGNAL_METRIC_DEFINITIONS[signalId]
    : [];
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const maxDays = Math.max(1, Number(options.maxDays || 7));
  const windowSize = Math.max(1, Number(options.windowSize || 3));

  return definitions.map((definition, definitionIndex) => {
    const metricEntries = normalizedEntries
      .map((entry) => ({
        observedAt: entry.observedAt,
        value: Number(entry?.metrics?.[definition.id] || 0),
      }))
      .filter((entry) => Number.isFinite(entry.value))
      .sort((a, b) => String(b.observedAt || "").localeCompare(String(a.observedAt || "")));
    const latestValue = metricEntries[0]?.value ?? 0;
    const bucketMap = new Map();

    metricEntries.forEach((entry) => {
      const day = toDayBucket(entry.observedAt);
      if (!day) {
        return;
      }
      if (!bucketMap.has(day)) {
        bucketMap.set(day, createMetricBucket(day));
      }
      const bucket = bucketMap.get(day);
      bucket.total += entry.value;
      bucket.count += 1;
      bucket.max = Math.max(bucket.max, entry.value);
    });

    const days = Array.from(bucketMap.values())
      .map((bucket) => finalizeMetricBucket(bucket))
      .sort((a, b) => String(b.day || "").localeCompare(String(a.day || "")))
      .slice(0, maxDays);
    const recentWindow = days.slice(0, windowSize);
    const previousWindow = days.slice(windowSize, windowSize * 2);
    const recentAverage = recentWindow.length === 0
      ? 0
      : roundRate(recentWindow.reduce((sum, item) => sum + Number(item.average || 0), 0) / recentWindow.length);
    const previousAverage = previousWindow.length === 0
      ? 0
      : roundRate(previousWindow.reduce((sum, item) => sum + Number(item.average || 0), 0) / previousWindow.length);
    const direction = pickMetricTrendDirection(recentAverage, previousAverage, definition.better);

      return {
      metricId: definition.id,
      label: definition.label,
      better: definition.better,
      highlightPriority: Number(definition.highlightPriority || 0),
      definitionIndex,
      latestValue,
      recentAverage,
      previousAverage,
      days,
      direction: direction.direction,
      directionLabel: direction.directionLabel,
      summary: direction.summary,
    };
  });
}

function createTrendBucket(day) {
  return {
    day,
    total: 0,
    successCount: 0,
    failureCount: 0,
    fingerprints: new Set(),
    strategies: new Set(),
  };
}

function finalizeTrendBucket(bucket) {
  const total = Number(bucket.total || 0);
  return {
    day: bucket.day,
    total,
    successCount: Number(bucket.successCount || 0),
    failureCount: Number(bucket.failureCount || 0),
    successRate: total === 0 ? 0 : roundRate((Number(bucket.successCount || 0) / total) * 100),
    uniqueFingerprintCount: bucket.fingerprints.size,
    strategyCount: bucket.strategies.size,
  };
}

function summarizeTrendWindow(days) {
  const list = Array.isArray(days) ? days : [];
  const total = list.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const successCount = list.reduce((sum, item) => sum + Number(item.successCount || 0), 0);
  const failureCount = list.reduce((sum, item) => sum + Number(item.failureCount || 0), 0);
  const uniqueDays = list.length;

  return {
    total,
    successCount,
    failureCount,
    successRate: total === 0 ? 0 : roundRate((successCount / total) * 100),
    uniqueDays,
  };
}

function pickTrendDirection(recentWindow, previousWindow) {
  if (!previousWindow || Number(previousWindow.total || 0) === 0) {
    return {
      direction: "baseline",
      directionLabel: "基线",
      summary: "历史样本还不足以形成前后窗口对比，当前仅作为趋势基线。",
    };
  }

  const recentFailure = Number(recentWindow.failureCount || 0);
  const previousFailure = Number(previousWindow.failureCount || 0);
  const recentSuccessRate = Number(recentWindow.successRate || 0);
  const previousSuccessRate = Number(previousWindow.successRate || 0);

  if (recentFailure < previousFailure || recentSuccessRate > previousSuccessRate) {
    return {
      direction: "improving",
      directionLabel: "改善中",
      summary: "最近窗口的失败样本更少或成功率更高，说明当前恢复路径在变稳。",
    };
  }

  if (recentFailure > previousFailure || recentSuccessRate < previousSuccessRate) {
    return {
      direction: "regressing",
      directionLabel: "回归中",
      summary: "最近窗口的失败样本更多或成功率下滑，建议优先回看回归点。",
    };
  }

  return {
    direction: "flat",
    directionLabel: "持平",
    summary: "最近窗口与前序窗口基本持平，尚未观察到明显改善或回归。",
  };
}

function buildTrendSummary(entries, options = {}) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const maxDays = Math.max(1, Number(options.maxDays || 7));
  const windowSize = Math.max(1, Number(options.windowSize || 3));
  const bucketMap = new Map();

  normalizedEntries.forEach((entry) => {
    const day = toDayBucket(entry.generatedAt);
    if (!day) {
      return;
    }

    if (!bucketMap.has(day)) {
      bucketMap.set(day, createTrendBucket(day));
    }

    const bucket = bucketMap.get(day);
    const weight = Math.max(1, Number(entry.weight || 1));
    bucket.total += weight;
    if (entry.success) {
      bucket.successCount += weight;
    } else {
      bucket.failureCount += weight;
    }
    bucket.fingerprints.add(entry.fingerprint);
    if (entry.strategyId) {
      bucket.strategies.add(entry.strategyId);
    }
  });

  const days = Array.from(bucketMap.values())
    .map((bucket) => finalizeTrendBucket(bucket))
    .sort((a, b) => String(b.day || "").localeCompare(String(a.day || "")))
    .slice(0, maxDays);
  const recentWindowDays = days.slice(0, windowSize);
  const previousWindowDays = days.slice(windowSize, windowSize * 2);
  const recentWindow = summarizeTrendWindow(recentWindowDays);
  const previousWindow = summarizeTrendWindow(previousWindowDays);
  const direction = pickTrendDirection(recentWindow, previousWindow);

  return {
    days,
    recentWindow,
    previousWindow,
    direction: direction.direction,
    directionLabel: direction.directionLabel,
    summary: direction.summary,
  };
}

function buildRecentHistory(entries) {
  return (Array.isArray(entries) ? entries : [])
    .slice(0, 10)
    .map((entry) => ({
      generatedAt: entry.generatedAt,
      fingerprint: entry.fingerprint,
      featureLabel: entry.featureLabel,
      success: entry.success,
      outcomeLabel: entry.outcomeLabel || (entry.success ? "已恢复" : "未恢复"),
      strategyId: entry.strategyId,
      strategyLabel: entry.strategyLabel,
      candidateFiles: entry.candidateFiles.slice(0, 3),
    }));
}

function buildFingerprintRecentHistory(entries, limit = 5) {
  return buildRecentHistory(entries).slice(0, Math.max(1, Number(limit) || 5));
}

function sanitizeFingerprintSegment(value, fallback = "memory-item") {
  const sanitized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  const segment = sanitized || fallback;
  const maxLength = 96;
  if (segment.length <= maxLength) {
    return segment;
  }
  const digest = createHash("sha1")
    .update(segment)
    .digest("hex")
    .slice(0, 10);
  const headLength = Math.max(24, maxLength - digest.length - 1);
  const head = segment.slice(0, headLength).replace(/-+$/u, "");
  return `${head || fallback}-${digest}`;
}

async function readJSONIfExists(filePath) {
  return await fs.readFile(filePath, "utf-8")
    .then((content) => JSON.parse(content))
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
}

function findCapabilityStatus(entries, capabilityId) {
  const list = Array.isArray(entries) ? entries : [];
  return list.find((item) => String(item?.id || "") === String(capabilityId)) || null;
}

function deriveReaderEventSignalPayload(e2ePayload) {
  if (!e2ePayload || typeof e2ePayload !== "object" || e2ePayload.present === false) {
    return null;
  }

  const readerEvent = e2ePayload.readerEventReport && typeof e2ePayload.readerEventReport === "object"
    ? e2ePayload.readerEventReport
    : null;
  const capabilityStatus = findCapabilityStatus(e2ePayload.capabilityStatuses, "reader-event-hooks");
  const relevant = Boolean(
    readerEvent?.present
    || (capabilityStatus && capabilityStatus.status !== "uncovered"),
  );
  if (!relevant) {
    return null;
  }

  if (!readerEvent) {
    return {
      present: true,
      generatedAt: e2ePayload.generatedAt || null,
      status: "missing",
      statusLabel: "缺失",
      available: null,
      knownTypeCount: null,
      probeCompatibleTypeCount: null,
      probeObservedTypeCount: 0,
      syntheticFallbackAvailable: null,
      hookScenarioStatus: "missing",
      fineGrainedScenarioStatus: "missing",
      observedScenarioNames: [],
      note: "Reader 事件桥摘要缺失，无法确认事件 Hook 与探针回放能力。",
    };
  }

  return {
    present: readerEvent.present !== false,
    generatedAt: e2ePayload.generatedAt || null,
    status: readerEvent.status || "missing",
    statusLabel: readerEvent.statusLabel || "缺失",
    available: typeof readerEvent.available === "boolean" ? readerEvent.available : null,
    knownTypeCount: readerEvent.knownTypeCount ?? null,
    probeCompatibleTypeCount: readerEvent.probeCompatibleTypeCount ?? null,
    probeObservedTypeCount: readerEvent.probeObservedTypeCount ?? 0,
    syntheticFallbackAvailable: typeof readerEvent.syntheticFallbackAvailable === "boolean"
      ? readerEvent.syntheticFallbackAvailable
      : null,
    hookScenarioStatus: readerEvent.hookScenarioStatus || "missing",
    fineGrainedScenarioStatus: readerEvent.fineGrainedScenarioStatus || "missing",
    observedScenarioNames: Array.isArray(readerEvent.observedScenarioNames)
      ? readerEvent.observedScenarioNames.slice(0, 8)
      : [],
    note: readerEvent.note || null,
  };
}

function resolveSignalPayload(signalId, signalPayloads = {}) {
  if (signalId === "readerEvent") {
    if (signalPayloads?.readerEvent && typeof signalPayloads.readerEvent === "object") {
      return signalPayloads.readerEvent;
    }
    return deriveReaderEventSignalPayload(signalPayloads?.e2e);
  }
  return signalPayloads?.[signalId] ?? null;
}

function normalizeSignalEntry(signalId, payload, options = {}) {
  const nowISO = toISODate(options.now) || new Date().toISOString();
  const definition = SIGNAL_DEFINITIONS.find((item) => item.id === signalId);
  const label = definition?.label || signalId;

  if (signalId === "gate") {
    if (!payload || typeof payload !== "object" || !payload.generatedAt) {
      return null;
    }
    const gatePassed = payload.gatePassed === true;
    return {
      signalId,
      label,
      observedAt: toISODate(payload.generatedAt) || nowISO,
      status: gatePassed ? "passed" : "blocked",
      statusLabel: pickGateStatusLabel(gatePassed),
      ok: gatePassed,
      detail: Array.isArray(payload.issues) && payload.issues.length > 0
        ? payload.issues[0]
        : (payload.frontpageSummary?.headline || null),
      metrics: {
        profile: payload.profile || "dev",
        blockerCount: Array.isArray(payload.issues) ? payload.issues.length : 0,
        recommendationCount: Array.isArray(payload.recommendations) ? payload.recommendations.length : 0,
        recentFailed: Number(payload.metrics?.recentFailed || 0),
        effectiveFailed: Number(payload.metrics?.effectiveFailed || 0),
      },
      reasons: dedupeReasonItems(
        (Array.isArray(payload.issues) ? payload.issues : [])
          .map((item) => createSignalIssueReason(signalId, label, item))
          .filter(Boolean),
      ),
    };
  }

  if (signalId === "releaseMatrix") {
    if (!payload || typeof payload !== "object" || !payload.generatedAt) {
      return null;
    }
    const status = String(payload.status || "unknown");
    const blockingIssues = Array.isArray(payload.blockingIssues) ? payload.blockingIssues : [];
    const attentionIssues = Array.isArray(payload.attentionIssues) ? payload.attentionIssues : [];
    const artifactChecks = Array.isArray(payload.artifactChecks) ? payload.artifactChecks : [];
    const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
    const installSmokeMissingCount = profiles.reduce((sum, profile) => {
      return sum + (profile?.installSmokePresent === false ? 1 : 0);
    }, 0);
    return {
      signalId,
      label,
      observedAt: toISODate(payload.generatedAt) || nowISO,
      status,
      statusLabel: payload.statusLabel || "未知",
      ok: status === "passed",
      detail: blockingIssues[0] || attentionIssues[0] || payload.summary || null,
      metrics: {
        failedProfileCount: Number(payload.failedProfileCount || 0),
        attentionProfileCount: Number(payload.attentionProfileCount || 0),
        installSmokeMissingCount,
        artifactCheckFailedCount: artifactChecks.filter((item) => item?.passed === false).length,
      },
      reasons: dedupeReasonItems([
        ...blockingIssues.map((item) => createSignalIssueReason(signalId, label, item)).filter(Boolean),
        ...attentionIssues.map((item) => createSignalIssueReason(signalId, label, item)).filter(Boolean),
      ]),
    };
  }

  if (!payload || typeof payload !== "object" || payload.present === false) {
    return null;
  }

  const observedAt = toISODate(payload.generatedAt) || nowISO;
  let detail = null;
  let metrics = {};
  let ok = false;
  let status = String(payload.status || "unknown");
  let statusLabel = String(payload.statusLabel || "未知");
  let reasons = [];

  switch (signalId) {
    case "watch":
      ok = status === "healthy";
      detail = payload.latestSummaryNote || (Array.isArray(payload.latestIssues) ? payload.latestIssues[0] : null) || null;
      metrics = {
        latestTrigger: payload.latestTrigger || null,
        ageText: payload.ageText || "-",
        issueCount: Array.isArray(payload.latestIssues) ? payload.latestIssues.length : 0,
        staleCount: status === "stale" ? 1 : 0,
        futureCount: status === "future" ? 1 : 0,
        unhealthyCount: status !== "healthy" && status !== "stale" && status !== "future" ? 1 : 0,
      };
      reasons = dedupeReasonItems([
        ...((Array.isArray(payload.latestIssues) ? payload.latestIssues : [])
          .map((item) => createSignalIssueReason(signalId, label, item))
          .filter(Boolean)),
        ...(!ok && (!Array.isArray(payload.latestIssues) || payload.latestIssues.length === 0)
          ? [createSignalEntryFallbackReason(signalId, label, { status, detail })].filter(Boolean)
          : []),
      ]);
      break;
    case "e2e":
      ok = status === "passed";
      detail = payload.note || (Array.isArray(payload.issues) ? payload.issues[0] : null) || null;
      metrics = {
        strategy: payload.strategy || null,
        cycleFailedCount: Number(payload.failedCycles || 0),
        testFailed: Number(payload.testFailed || 0),
        scenarioFailed: Number(payload.scenarioFailed || 0),
        logErrorCount: Number(payload.logErrorCount || 0),
        visualDriftCount: Number(payload.visualDriftCount || 0),
        visualMissingCount: Number(payload.visualMissingCount || 0),
        serviceStatus: payload.serviceStatus || "unknown",
        serviceUnhealthyCount: Number(payload.serviceUnhealthyCount || 0),
        primaryActionCommandMissingCycles: Number(payload.primaryActionCommandMissingCycles || 0),
        contextActionMenuMissingCycles: Number(payload.contextActionMenuMissingCycles || 0),
        readerSummaryCommandMissingCycles: Number(payload.readerSummaryCommandMissingCycles || 0),
        readerSummaryMenuMissingCycles: Number(payload.readerSummaryMenuMissingCycles || 0),
        preferencePaneMissingCycles: Number(payload.preferencePaneMissingCycles || 0),
        capabilityFailedCount: Number(payload.capabilityFailedCount || 0),
        capabilityUncoveredCount: Number(payload.capabilityUncoveredCount || 0),
        staticRuntimeMissingCount: Number(payload.staticRuntimeMissingCount || 0),
      };
      reasons = dedupeReasonItems([
        ...((Array.isArray(payload.issues) ? payload.issues : [])
          .map((item) => createSignalIssueReason(signalId, label, item))
          .filter(Boolean)),
        ...(!ok && (!Array.isArray(payload.issues) || payload.issues.length === 0) && payload.note
          ? [createSignalEntryFallbackReason(signalId, label, { status, detail })].filter(Boolean)
          : []),
      ]);
      if (!ok) {
        const fingerprintReason = classifyE2EDiagnosisFingerprint(payload.primaryDiagnosis?.fingerprint);
        if (fingerprintReason) {
          reasons = appendUniqueReasonItem(
            reasons,
            createSignalStructuredReason(
              signalId,
              label,
              fingerprintReason.reasonKey,
              fingerprintReason.label,
            ),
          );
        }
      }
      break;
    case "readerEvent":
      ok = status === "passed"
        && payload.available !== false
        && payload.syntheticFallbackAvailable !== false;
      detail = payload.note
        || (payload.available === false
          ? "Reader 事件 API 当前不可用。"
          : (payload.syntheticFallbackAvailable === false
            ? "Reader 事件桥缺少 synthetic-fallback。"
            : null));
      metrics = {
        available: payload.available,
        unavailableCount: payload.available === false ? 1 : 0,
        syntheticFallbackAvailable: payload.syntheticFallbackAvailable,
        syntheticFallbackMissingCount: payload.syntheticFallbackAvailable === false ? 1 : 0,
        hookScenarioStatus: payload.hookScenarioStatus || "missing",
        hookFailedCount: payload.hookScenarioStatus === "failed" ? 1 : 0,
        hookMissingCount: payload.hookScenarioStatus === "missing" ? 1 : 0,
        fineGrainedScenarioStatus: payload.fineGrainedScenarioStatus || "missing",
        fineGrainedFailedCount: payload.fineGrainedScenarioStatus === "failed" ? 1 : 0,
        fineGrainedMissingCount: payload.fineGrainedScenarioStatus === "missing" ? 1 : 0,
        knownTypeCount: Number(payload.knownTypeCount || 0),
        probeCompatibleTypeCount: Number(payload.probeCompatibleTypeCount || 0),
        probeObservedTypeCount: Number(payload.probeObservedTypeCount || 0),
      };
      reasons = dedupeReasonItems([
        ...(status === "missing"
          ? [createSignalStructuredReason(signalId, label, "summary-missing", "Reader 事件桥摘要缺失")]
          : []),
        ...(payload.available === false
          ? [createSignalStructuredReason(signalId, label, "event-api-unavailable", "Reader 事件 API 不可用")]
          : []),
        ...(payload.syntheticFallbackAvailable === false
          ? [createSignalStructuredReason(signalId, label, "synthetic-fallback-missing", "缺少 synthetic-fallback")]
          : []),
        ...(payload.hookScenarioStatus === "failed"
          ? [createSignalStructuredReason(signalId, label, "hook-failed", "Hook 场景失败")]
          : []),
        ...(payload.hookScenarioStatus === "missing"
          ? [createSignalStructuredReason(signalId, label, "hook-missing", "Hook 场景缺失")]
          : []),
        ...(payload.fineGrainedScenarioStatus === "failed"
          ? [createSignalStructuredReason(signalId, label, "fine-grained-failed", "细粒度 Hook 失败")]
          : []),
        ...(payload.fineGrainedScenarioStatus === "missing"
          ? [createSignalStructuredReason(signalId, label, "fine-grained-missing", "细粒度 Hook 缺失")]
          : []),
      ].filter(Boolean));
      break;
    case "autofix":
      ok = status === "clean" || status === "recovered";
      detail = payload.outcomeLabel || payload.note || null;
      metrics = {
        attempts: Number(payload.attempts || 0),
        failedAttempts: Number(payload.failedAttempts || 0),
        patchPlanStatus: payload.patchPlanStatus || "missing",
        patchApplicationStatus: payload.patchApplicationStatus || "not-attempted",
        patchApplicationIssueCount: Array.isArray(payload.patchApplicationIssues) ? payload.patchApplicationIssues.length : 0,
        patchVerificationChecksFailed: Number(payload.patchVerificationChecksFailed || 0),
        patchVerificationRequiredFailed: Number(payload.patchVerificationRequiredFailed || 0),
        patchVerificationOptionalFailed: Number(payload.patchVerificationOptionalFailed || 0),
      };
      reasons = dedupeReasonItems(
        [
          ...(Array.isArray(payload.patchApplicationIssues) ? payload.patchApplicationIssues : [])
            .map((item) => createSignalStructuredReason(
              signalId,
              label,
              item?.reason,
              item?.label || pickPatchBlockReasonLabel(item?.reason),
              item?.count,
            ))
            .filter(Boolean),
          ...(payload.patchUnsupportedDiagnosisCategory
            ? [
              createSignalStructuredReason(
                signalId,
                label,
                `unsupported:${payload.patchUnsupportedDiagnosisCategory}`,
                `未进入白名单 / ${payload.patchUnsupportedDiagnosisCategoryLabel || payload.patchUnsupportedDiagnosisCategory}`,
              ),
            ]
            : []),
        ]
          .filter(Boolean)
      );
      break;
    case "watchRecovery":
      ok = status === "passed";
      detail = payload.summaryNote || (Array.isArray(payload.issues) ? payload.issues[0] : null) || null;
      metrics = {
        latestTrigger: payload.latestTrigger || null,
        latestStatus: payload.latestStatus || status,
        issueCount: Array.isArray(payload.issues) ? payload.issues.length : 0,
        missingTriggerCount: Math.max(
          0,
          Number((Array.isArray(payload.expectedTriggers) ? payload.expectedTriggers.length : 0))
            - Number((Array.isArray(payload.observedTriggers) ? payload.observedTriggers.length : 0)),
        ),
      };
      reasons = dedupeReasonItems([
        ...((Array.isArray(payload.issues) ? payload.issues : [])
          .map((item) => createSignalIssueReason(signalId, label, item))
          .filter(Boolean)),
        ...(!ok && (!Array.isArray(payload.issues) || payload.issues.length === 0) && payload.summaryNote
          ? [createSignalEntryFallbackReason(signalId, label, { status, detail })].filter(Boolean)
          : []),
      ]);
      break;
    case "cpuProfiler":
      ok = status === "passed";
      detail = payload.summary || null;
      metrics = {
        activityCount: Number(payload.activityCount || 0),
        successfulActivityCount: Number(payload.successfulActivityCount || 0),
        failedActivityCount: Number(payload.failedActivityCount || 0),
        totalCpuTime: Number(payload.totalCpuTime || 0),
        currentPluginCpuPercent: Number(payload.currentPluginCpuPercent || 0),
        unknownCpuPercent: Number(payload.unknownCpuPercent || 0),
      };
      reasons = dedupeReasonItems([
        ...(Number(payload.failedActivityCount || 0) > 0
          ? [createSignalStructuredReason(signalId, label, "activity-failed", "Profiler 活动采样失败", Number(payload.failedActivityCount || 0))]
          : []),
        ...(status === "attention" && payload.errorMessage
          ? [createSignalEntryFallbackReason(signalId, label, { status, detail: payload.errorMessage })].filter(Boolean)
          : []),
      ]);
      break;
    case "memoryDiagnostics":
      ok = status === "passed";
      detail = payload.summary || null;
      metrics = {
        activityCount: Number(payload.activityCount || 0),
        successfulActivityCount: Number(payload.successfulActivityCount || 0),
        failedActivityCount: Number(payload.failedActivityCount || 0),
        rssDeltaMb: Number(payload.rssDeltaMb || 0),
        residentDeltaMb: Number(payload.residentDeltaMb || 0),
        explicitDeltaMb: Number(payload.explicitDeltaMb || 0),
      };
      reasons = dedupeReasonItems([
        ...(Number(payload.failedActivityCount || 0) > 0
          ? [createSignalStructuredReason(signalId, label, "activity-failed", "内存诊断活动采样失败", Number(payload.failedActivityCount || 0))]
          : []),
        ...(status === "attention" && payload.errorMessage
          ? [createSignalEntryFallbackReason(signalId, label, { status, detail: payload.errorMessage })].filter(Boolean)
          : []),
      ]);
      break;
    default:
      ok = false;
      break;
  }

  return {
    signalId,
    label,
    observedAt,
    status,
    statusLabel,
    ok,
    detail,
    metrics,
    reasons,
  };
}

function summarizeSignalHistory(signalId, label, entries, options = {}) {
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === "object")
    .sort((a, b) => String(b.observedAt || "").localeCompare(String(a.observedAt || "")));
  const latest = normalizedEntries[0] || null;
  const trend = buildSignalTrend(normalizedEntries, options);
  const metricTrends = buildSignalMetricTrends(signalId, normalizedEntries, options);
  const totalEntries = normalizedEntries.length;
  const okCount = normalizedEntries.filter((entry) => entry.ok === true).length;
  const badCount = totalEntries - okCount;

  return {
    signalId,
    label,
    present: totalEntries > 0,
    totalEntries,
    okCount,
    badCount,
    okRate: totalEntries === 0 ? 0 : roundRate((okCount / totalEntries) * 100),
    latestStatus: latest?.status || "missing",
    latestStatusLabel: latest?.statusLabel || "缺失",
    latestObservedAt: latest?.observedAt || null,
    latestOK: latest?.ok === true,
    latestDetail: latest?.detail || null,
    trend,
    metricTrends,
    metricHighlights: pickMetricHighlights(metricTrends, 3),
    recentEntries: normalizedEntries.slice(0, 5),
  };
}

export async function archiveAgentSignalHistory(projectRoot, signalPayloads = {}, options = {}) {
  const artifacts = resolveAgentMemoryArtifacts(projectRoot);
  const relativeBase = artifacts.artifactsDir;
  const generatedAt = toISODate(options.now) || new Date().toISOString();
  const signalSummaries = [];
  const signalIndexEntries = [];
  const signalReasonEntries = [];

  await fs.mkdir(artifacts.archiveDir, { recursive: true });
  await fs.mkdir(artifacts.signalsDir, { recursive: true });

  for (const definition of SIGNAL_DEFINITIONS) {
    const signalId = definition.id;
    const filePath = path.join(artifacts.signalsDir, `${signalId}.json`);
    const existing = await readJSONIfExists(filePath);
    const existingEntries = (Array.isArray(existing?.entries) ? existing.entries : [])
      .map((entry) => normalizeArchivedSignalEntry(signalId, entry))
      .filter(Boolean);
    const currentEntry = normalizeArchivedSignalEntry(
      signalId,
      normalizeSignalEntry(signalId, resolveSignalPayload(signalId, signalPayloads), options),
    );
    const seenKeys = new Set();
    const nextEntries = [];

    if (currentEntry) {
      const key = buildSignalEntryKey(currentEntry);
      seenKeys.add(key);
      nextEntries.push(currentEntry);
    }

    existingEntries.forEach((entry) => {
      const key = buildSignalEntryKey(entry);
      if (seenKeys.has(key)) {
        return;
      }
      seenKeys.add(key);
      nextEntries.push(entry);
    });

    nextEntries.sort((a, b) => String(b.observedAt || "").localeCompare(String(a.observedAt || "")));
    const trimmedEntries = nextEntries.slice(0, 120);
    const history = summarizeSignalHistory(signalId, definition.label, trimmedEntries);

    trimmedEntries.forEach((entry) => {
      const reasonItems = Array.isArray(entry.reasons) ? entry.reasons : [];
      reasonItems.forEach((reason) => {
        const normalized = createSignalReasonHistoryEntry(signalId, definition.label, entry, reason);
        if (normalized) {
          signalReasonEntries.push(normalized);
        }
      });
    });

    signalSummaries.push(history);
    signalIndexEntries.push({
      signalId,
      label: definition.label,
      present: history.present,
      latestStatus: history.latestStatus,
      latestStatusLabel: history.latestStatusLabel,
      latestObservedAt: history.latestObservedAt,
      okRate: history.okRate,
      direction: history.trend?.direction || "baseline",
      directionLabel: history.trend?.directionLabel || "基线",
      totalEntries: history.totalEntries,
      metricHighlights: history.metricHighlights,
      path: trimmedEntries.length > 0 ? toRelativePath(relativeBase, filePath) : null,
    });

    if (trimmedEntries.length > 0) {
      await fs.writeFile(filePath, `${JSON.stringify({
        generatedAt,
        signalId,
        label: definition.label,
        entries: trimmedEntries,
        trend: history.trend,
        metricTrends: history.metricTrends,
      }, null, 2)}\n`, "utf-8");
    }
  }

  await fs.writeFile(artifacts.signalIndexJSON, `${JSON.stringify({
    generatedAt,
    entries: signalIndexEntries,
  }, null, 2)}\n`, "utf-8");

  return {
    generatedAt,
    signals: signalSummaries,
    reasonEntries: signalReasonEntries
      .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")))
      .slice(0, 240),
    archive: {
      present: true,
      signalsDir: toRelativePath(relativeBase, artifacts.signalsDir),
      signalIndexJSON: toRelativePath(relativeBase, artifacts.signalIndexJSON),
    },
  };
}

export async function buildAgentSignalPayloads(projectRoot) {
  const artifacts = resolveAgentMemoryArtifacts(projectRoot);
  const watchRaw = await readJSONIfExists(path.join(artifacts.artifactsDir, "zotero-watch-status.json"));
  const e2eRaw = await readJSONIfExists(path.join(artifacts.artifactsDir, "agent-zotero-e2e.json"));
  const autofixRaw = await readJSONIfExists(path.join(artifacts.artifactsDir, "agent-zotero-autofix.json"));
  const watchRecoveryRaw = await readJSONIfExists(path.join(artifacts.artifactsDir, "zotero-watch-recovery-regression.json"));
  const gateRaw = await readJSONIfExists(path.join(artifacts.artifactsDir, "agent-gate.json"));
  const releaseMatrixRaw = await readJSONIfExists(path.join(artifacts.artifactsDir, "release-matrix.json"));

  const e2e = summarizeE2EReport(e2eRaw);

  return {
    watch: summarizeZoteroWatchStatus(watchRaw, {
      staleAfterMinutes: DEFAULT_WATCH_STALE_AFTER_MINUTES,
    }),
    e2e,
    readerEvent: deriveReaderEventSignalPayload(e2e),
    autofix: summarizeAutofixReport(autofixRaw),
    watchRecovery: summarizeWatchRecoveryReport(watchRecoveryRaw),
    gate: gateRaw,
    releaseMatrix: releaseMatrixRaw,
  };
}

function normalizeDraftOperations(entries) {
  const operationMap = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const operation = String(entry?.operation || "insert").trim().toLowerCase() || "insert";
    if (!operationMap.has(operation)) {
      operationMap.set(operation, {
        operation,
        label: pickPatchOperationLabel(operation),
        count: 0,
      });
    }
    operationMap.get(operation).count += Number(entry?.count || 0) || 1;
  });

  return Array.from(operationMap.values())
    .sort((a, b) => b.count - a.count || a.operation.localeCompare(b.operation))
    .slice(0, 5);
}

function normalizeResultReasons(entries) {
  const reasonMap = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const reason = String(entry?.reason || "").trim();
    if (!reason) {
      return;
    }
    if (!reasonMap.has(reason)) {
      reasonMap.set(reason, {
        reason,
        label: pickPatchBlockReasonLabel(reason),
        count: 0,
      });
    }
    reasonMap.get(reason).count += Number(entry?.count || 0) || 1;
  });

  return Array.from(reasonMap.values())
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5);
}

function isBlockingResultReason(reason) {
  const normalized = String(reason || "").trim();
  return Boolean(normalized) && normalized !== "applied" && normalized !== "ready";
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const fingerprint = normalizeDiagnosisFingerprint(
    entry?.sourceDiagnosis?.fingerprint
    || entry?.patch?.fingerprint
    || "",
  );
  if (!fingerprint) {
    return null;
  }

  const featureLabel = String(
    entry?.sourceDiagnosis?.featureLabel
    || entry?.patch?.featureLabel
    || entry?.sourceDiagnosis?.feature
    || "",
  ).trim() || "未知功能";
  const ruleId = String(entry?.patch?.whitelistRuleId || "").trim() || null;
  const strategyId = ruleId || "recovery-only";
  const strategyLabel = ruleId
    ? `${featureLabel} / ${ruleId}`
    : "仅恢复链";
  const success = entry?.verificationContract?.status === "verification-passed"
    || entry?.recovered === true;
  const resultReasons = normalizeResultReasons(entry?.patch?.resultReasonSummary);
  const unsupportedDiagnosisCategory = String(entry?.patch?.unsupportedDiagnosisCategory || "").trim();
  const unsupportedDiagnosisCategoryLabel = String(
    entry?.patch?.unsupportedDiagnosisCategoryLabel
    || unsupportedDiagnosisCategory,
  ).trim();
  const verificationStats = summarizeVerificationContractStats(entry?.verificationContract);
  const hasRuntimeContext = Boolean(
    (entry?.runtimeContext && typeof entry.runtimeContext === "object")
    || Object.prototype.hasOwnProperty.call(entry || {}, "latestBootMode")
    || Object.prototype.hasOwnProperty.call(entry || {}, "zoteroVersion")
    || Object.prototype.hasOwnProperty.call(entry || {}, "zoteroVersionBucket"),
  );
  const runtimeContext = summarizeRuntimeContext(
    entry?.runtimeContext && typeof entry.runtimeContext === "object"
      ? { runtimeContext: entry.runtimeContext }
      : entry,
  );

  return {
    runId: String(entry?.runId || "").trim() || null,
    generatedAt: toISODate(entry?.generatedAt),
    fingerprint,
    featureLabel,
    strategyId,
    strategyLabel,
    ruleId,
    success,
    recovered: entry?.recovered === true,
    outcomeLabel: entry?.outcomeLabel || null,
    verificationStatus: entry?.verificationContract?.status || null,
    verificationPassed: entry?.verificationContract?.status === "verification-passed",
    contextObserved: hasRuntimeContext && runtimeContext.contextObserved === true,
    latestBootMode: normalizeBootMode(runtimeContext.latestBootMode),
    zoteroVersion: normalizeContextValue(entry?.runtimeContext?.zoteroVersion || runtimeContext.zoteroVersion),
    zoteroVersionBucket: normalizeZoteroVersionBucket(
      entry?.runtimeContext?.zoteroVersionBucket
      || runtimeContext.zoteroVersionBucket
      || runtimeContext.zoteroVersion,
    ),
    contextKey: buildContextKey(runtimeContext.latestBootMode, runtimeContext.zoteroVersionBucket),
    verificationRequiredFailed: Number(verificationStats.requiredFailed || 0),
    verificationOptionalFailed: Number(verificationStats.optionalFailed || 0),
    verificationFailedChecks: verificationStats.failedChecksSorted
      .map((check) => ({
        id: check?.id || null,
        label: check?.label || check?.id || "unknown",
        kind: check?.kind || null,
      }))
      .filter((check) => check.id || check.label),
    verificationOptionalFailedChecks: verificationStats.optionalFailedChecksSorted
      .map((check) => ({
        id: check?.id || null,
        label: check?.label || check?.id || "unknown",
        kind: check?.kind || null,
      }))
      .filter((check) => check.id || check.label),
    verificationFailedCheckKinds: Array.isArray(verificationStats.failedCheckKinds)
      ? verificationStats.failedCheckKinds.map((item) => ({
        kind: item?.kind || null,
        label: item?.label || item?.kind || "unknown",
        count: Number(item?.count || 0),
      }))
      : [],
    verificationOptionalFailedCheckKinds: Array.isArray(verificationStats.optionalFailedCheckKinds)
      ? verificationStats.optionalFailedCheckKinds.map((item) => ({
        kind: item?.kind || null,
        label: item?.label || item?.kind || "unknown",
        count: Number(item?.count || 0),
      }))
      : [],
    candidateFiles: uniqueStrings([
      ...(Array.isArray(entry?.sourceDiagnosis?.candidateFiles) ? entry.sourceDiagnosis.candidateFiles : []),
      ...(Array.isArray(entry?.patch?.candidateFiles) ? entry.patch.candidateFiles : []),
      ...(Array.isArray(entry?.patch?.draftFiles) ? entry.patch.draftFiles : []),
      ...(Array.isArray(entry?.patch?.allowedTargets) ? entry.patch.allowedTargets : []),
      ...(Array.isArray(entry?.patch?.appliedFiles) ? entry.patch.appliedFiles : []),
    ]).slice(0, 8),
    draftOperations: normalizeDraftOperations(entry?.patch?.draftOperations),
    resultReasons,
    blockerReasons: [
      ...resultReasons.filter((item) => isBlockingResultReason(item.reason)),
      ...(unsupportedDiagnosisCategory
        ? [{
          reason: `unsupported:${unsupportedDiagnosisCategory}`,
          label: `未进入白名单 / ${unsupportedDiagnosisCategoryLabel}`,
          count: 1,
        }]
        : []),
    ],
  };
}

function pickBetterTimestamp(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  return left > right ? left : right;
}

function createReasonAccumulator(reason, label) {
  return {
    reason,
    label,
    count: 0,
  };
}

function createOperationAccumulator(operation, label) {
  return {
    operation,
    label,
    count: 0,
  };
}

function createVerificationCheckAccumulator(id, label) {
  return {
    id,
    label,
    count: 0,
  };
}

function createVerificationKindAccumulator(kind, label) {
  return {
    kind,
    label,
    count: 0,
  };
}

function createContextAccumulator(latestBootMode, zoteroVersion, zoteroVersionBucket) {
  return {
    contextKey: buildContextKey(latestBootMode, zoteroVersionBucket),
    latestBootMode: normalizeBootMode(latestBootMode),
    zoteroVersion: normalizeContextValue(zoteroVersion),
    zoteroVersionBucket: normalizeContextValue(zoteroVersionBucket),
    count: 0,
    successCount: 0,
    failureCount: 0,
    verificationCount: 0,
    verificationPassedCount: 0,
    lastSeenAt: null,
    lastSuccessfulAt: null,
    lastFailedAt: null,
  };
}

function recordContextObservation(contextMap, entry) {
  if (!(contextMap instanceof Map) || !entry?.contextObserved) {
    return;
  }
  const contextKey = buildContextKey(entry.latestBootMode, entry.zoteroVersionBucket);
  if (!contextMap.has(contextKey)) {
    contextMap.set(contextKey, createContextAccumulator(
      entry.latestBootMode,
      entry.zoteroVersion,
      entry.zoteroVersionBucket,
    ));
  }
  const context = contextMap.get(contextKey);
  context.count += 1;
  context.lastSeenAt = pickBetterTimestamp(context.lastSeenAt, entry.generatedAt);
  if (entry.success) {
    context.successCount += 1;
    context.lastSuccessfulAt = pickBetterTimestamp(context.lastSuccessfulAt, entry.generatedAt);
  } else {
    context.failureCount += 1;
    context.lastFailedAt = pickBetterTimestamp(context.lastFailedAt, entry.generatedAt);
  }
  if (entry.verificationStatus) {
    context.verificationCount += 1;
    if (entry.verificationPassed) {
      context.verificationPassedCount += 1;
    }
  }
}

function finalizeContextSlices(contextMap, limit = 3) {
  return Array.from((contextMap instanceof Map ? contextMap.values() : []))
    .map((context) => ({
      contextKey: context.contextKey,
      latestBootMode: context.latestBootMode,
      zoteroVersion: context.zoteroVersion,
      zoteroVersionBucket: context.zoteroVersionBucket,
      contextSummary: buildContextSummaryText(context),
      attempts: Number(context.count || 0),
      successCount: Number(context.successCount || 0),
      failureCount: Number(context.failureCount || 0),
      successRate: Number(context.count || 0) === 0
        ? 0
        : roundRate((Number(context.successCount || 0) / Number(context.count || 0)) * 100),
      verificationPassedRate: Number(context.verificationCount || 0) === 0
        ? 0
        : roundRate((Number(context.verificationPassedCount || 0) / Number(context.verificationCount || 0)) * 100),
      lastSeenAt: context.lastSeenAt || null,
      lastSuccessfulAt: context.lastSuccessfulAt || null,
      lastFailedAt: context.lastFailedAt || null,
    }))
    .sort((a, b) => {
      if ((b.attempts || 0) !== (a.attempts || 0)) {
        return (b.attempts || 0) - (a.attempts || 0);
      }
      if ((b.successRate || 0) !== (a.successRate || 0)) {
        return (b.successRate || 0) - (a.successRate || 0);
      }
      return String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || ""));
    })
    .slice(0, Math.max(1, Number(limit || 3)));
}

function finalizeCountEntries(map, keyField) {
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || String(a[keyField] || "").localeCompare(String(b[keyField] || "")))
    .slice(0, 5);
}

function finalizeStrategy(strategy) {
  const attempts = Number(strategy.count || 0);
  const successCount = Number(strategy.successCount || 0);
  const failureCount = Number(strategy.failureCount || 0);
  const successRate = attempts === 0 ? 0 : roundRate((successCount / attempts) * 100);
  const verificationAttempts = Number(strategy.verificationCount || 0);
  const verificationPassedCount = Number(strategy.verificationPassedCount || 0);
  const contexts = finalizeContextSlices(strategy.contextMap, 3);
  const dominantContext = contexts[0] || null;

  return {
    strategyId: strategy.strategyId,
    strategyLabel: strategy.strategyLabel,
    ruleId: strategy.ruleId,
    attempts,
    successCount,
    failureCount,
    successRate,
    verificationPassedCount,
    verificationPassedRate: verificationAttempts === 0 ? 0 : roundRate((verificationPassedCount / verificationAttempts) * 100),
    lastSeenAt: strategy.lastSeenAt || null,
    lastSuccessfulAt: strategy.lastSuccessfulAt || null,
    lastFailedAt: strategy.lastFailedAt || null,
    latestBootMode: dominantContext?.latestBootMode || "unknown",
    zoteroVersionBucket: dominantContext?.zoteroVersionBucket || "unknown",
    contextKey: dominantContext?.contextKey || buildContextKey("unknown", "unknown"),
    contextMatchLevel: "strategy-global",
    contextAttempts: Number(dominantContext?.attempts || 0),
    contextSuccessRate: Number(dominantContext?.successRate || 0),
    globalSuccessRate: successRate,
    contextSummary: dominantContext?.contextSummary || buildContextSummaryText({
      latestBootMode: "unknown",
      zoteroVersionBucket: "unknown",
    }),
    candidateFiles: uniqueStrings(Array.from(strategy.candidateFiles)).slice(0, 5),
    draftOperations: finalizeCountEntries(strategy.operationMap, "operation"),
    recentReasons: finalizeCountEntries(strategy.reasonMap, "reason"),
    requiredFailedChecks: finalizeCountEntries(strategy.requiredFailedCheckMap, "id"),
    optionalFailedChecks: finalizeCountEntries(strategy.optionalFailedCheckMap, "id"),
    failedCheckKinds: finalizeCountEntries(strategy.failedKindMap, "kind"),
    optionalFailedCheckKinds: finalizeCountEntries(strategy.optionalFailedKindMap, "kind"),
    contexts,
  };
}

function finalizeReasonGroup(group) {
  const historyEntries = Array.isArray(group.entries)
    ? [...group.entries].sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")))
    : [];
  const latestEntry = historyEntries[0] || null;

  return {
    reason: group.reason,
    label: group.label,
    count: Number(group.count || 0),
    successCount: Number(group.successCount || 0),
    failureCount: Number(group.failureCount || 0),
    successRate: Number(group.count || 0) === 0
      ? 0
      : roundRate((Number(group.successCount || 0) / Number(group.count || 0)) * 100),
    lastSeenAt: group.lastSeenAt || null,
    uniqueFingerprintCount: group.fingerprints.size,
    featureLabels: uniqueStrings(Array.from(group.featureLabels)).slice(0, 5),
    candidateFiles: uniqueStrings(Array.from(group.candidateFiles)).slice(0, 5),
    latestOutcomeLabel: latestEntry?.outcomeLabel || (latestEntry ? (latestEntry.success ? "已恢复" : "未恢复") : null),
    latestStrategyLabel: latestEntry?.strategyLabel || null,
    trend: buildTrendSummary(historyEntries),
    recentHistory: buildFingerprintRecentHistory(historyEntries),
  };
}

function pickPreferredStrategy(strategies) {
  const list = Array.isArray(strategies) ? strategies : [];
  if (list.length === 0) {
    return null;
  }

  return [...list].sort((a, b) => {
    if (b.successCount !== a.successCount) {
      return b.successCount - a.successCount;
    }
    if (b.successRate !== a.successRate) {
      return b.successRate - a.successRate;
    }
    if (b.attempts !== a.attempts) {
      return b.attempts - a.attempts;
    }
    return String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || ""));
  })[0];
}

function pickPreferredContextStrategy(group, currentContext) {
  if (!group || !Array.isArray(group.strategies) || group.strategies.length === 0) {
    return null;
  }

  const normalizedContext = {
    latestBootMode: normalizeBootMode(currentContext?.latestBootMode),
    zoteroVersionBucket: normalizeContextValue(currentContext?.zoteroVersionBucket),
    contextKey: buildContextKey(currentContext?.latestBootMode, currentContext?.zoteroVersionBucket),
  };
  const exactMatches = group.strategies.flatMap((strategy) => {
    const match = (Array.isArray(strategy.contexts) ? strategy.contexts : [])
      .find((context) => context?.contextKey === normalizedContext.contextKey);
    if (!match) {
      return [];
    }
    return [{
      ...strategy,
      attempts: Number(match.attempts || 0),
      successCount: Number(match.successCount || 0),
      failureCount: Number(match.failureCount || 0),
      successRate: Number(match.successRate || 0),
      lastSeenAt: match.lastSeenAt || strategy.lastSeenAt || null,
      latestBootMode: normalizedContext.latestBootMode,
      zoteroVersionBucket: normalizedContext.zoteroVersionBucket,
      contextKey: normalizedContext.contextKey,
      contextMatchLevel: "exact-context",
      contextAttempts: Number(match.attempts || 0),
      contextSuccessRate: Number(match.successRate || 0),
      globalSuccessRate: Number(strategy.successRate || 0),
      contextSummary: match.contextSummary || buildContextSummaryText(normalizedContext),
    }];
  });

  if (exactMatches.length > 0) {
    return pickPreferredStrategy(exactMatches);
  }

  const globalPreferred = pickPreferredStrategy(group.strategies);
  if (!globalPreferred) {
    return null;
  }
  if (Number(globalPreferred.successCount || 0) > 0) {
    return {
      ...globalPreferred,
      latestBootMode: normalizedContext.latestBootMode,
      zoteroVersionBucket: normalizedContext.zoteroVersionBucket,
      contextKey: normalizedContext.contextKey,
      contextMatchLevel: "strategy-global",
      contextAttempts: 0,
      contextSuccessRate: 0,
      globalSuccessRate: Number(globalPreferred.successRate || 0),
      contextSummary: buildContextSummaryText(normalizedContext),
    };
  }
  return {
    ...globalPreferred,
    latestBootMode: normalizedContext.latestBootMode,
    zoteroVersionBucket: normalizedContext.zoteroVersionBucket,
    contextKey: normalizedContext.contextKey,
    contextMatchLevel: "fingerprint-global",
    contextAttempts: 0,
    contextSuccessRate: 0,
    globalSuccessRate: Number(group.successRate || globalPreferred.successRate || 0),
    contextSummary: buildContextSummaryText(normalizedContext),
  };
}

function pickSignalSummary(signals, signalId) {
  const list = Array.isArray(signals) ? signals : [];
  return list.find((item) => item?.signalId === signalId) || null;
}

function getSignalDefinitionIndex(signalId) {
  const index = SIGNAL_DEFINITIONS.findIndex((item) => item.id === signalId);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function normalizeSignalSummaries(signals) {
  return (Array.isArray(signals) ? signals : [])
    .filter((item) => item && typeof item === "object")
    .sort((a, b) => {
      const definitionDiff = getSignalDefinitionIndex(a?.signalId) - getSignalDefinitionIndex(b?.signalId);
      if (definitionDiff !== 0) {
        return definitionDiff;
      }
      const observedAtDiff = String(b?.latestObservedAt || "").localeCompare(String(a?.latestObservedAt || ""));
      if (observedAtDiff !== 0) {
        return observedAtDiff;
      }
      return String(a?.label || a?.signalId || "").localeCompare(String(b?.label || b?.signalId || ""));
    });
}

function pickSignalMetric(signal, metricId) {
  if (!signal || typeof signal !== "object") {
    return null;
  }
  const metricTrends = Array.isArray(signal.metricTrends) ? signal.metricTrends : [];
  return metricTrends.find((item) => item?.metricId === metricId) || null;
}

function createRecommendationMetric(signal, metric) {
  if (!signal || !metric) {
    return null;
  }
  return {
    signalId: signal.signalId || null,
    signalLabel: signal.label || signal.signalId || "-",
    metricId: metric.metricId || null,
    metricLabel: metric.label || metric.metricId || "-",
    value: Number(metric.latestValue || 0),
    direction: metric.direction || "baseline",
    directionLabel: metric.directionLabel || "基线",
  };
}

function appendRecommendationMetric(target, signal, metricId) {
  if (!target || !signal || !metricId) {
    return;
  }
  const metric = pickSignalMetric(signal, metricId);
  if (!metric || Number(metric.latestValue || 0) <= 0) {
    return;
  }
  const normalized = createRecommendationMetric(signal, metric);
  if (!normalized) {
    return;
  }
  const exists = target.some((item) => item.signalId === normalized.signalId && item.metricId === normalized.metricId);
  if (!exists) {
    target.push(normalized);
  }
}

function appendSignalId(target, signalId) {
  if (!Array.isArray(target) || !signalId) {
    return;
  }
  if (!target.includes(signalId)) {
    target.push(signalId);
  }
}

function buildHistoricalRecommendation(currentIncident, signalTrends) {
  const signals = Array.isArray(signalTrends?.signals) ? signalTrends.signals : [];
  const autofixSignal = pickSignalSummary(signals, "autofix");
  const e2eSignal = pickSignalSummary(signals, "e2e");
  const readerEventSignal = pickSignalSummary(signals, "readerEvent");
  const gateSignal = pickSignalSummary(signals, "gate");
  const watchSignal = pickSignalSummary(signals, "watch");
  const watchRecoverySignal = pickSignalSummary(signals, "watchRecovery");
  const preferred = currentIncident?.preferredStrategy || null;
  const regressingSignals = signals.filter((item) => item?.trend?.direction === "regressing");
  const supportingSignals = [];
  const supportingMetrics = [];

  if (!currentIncident && regressingSignals.length === 0) {
    return null;
  }

  let nextAction = "npm run agent:zotero:autofix";
  let title = "优先复用历史最优恢复路径";
  let confidence = preferred && Number(preferred.successCount || 0) > 0 ? "medium" : "low";
  const rationale = [];

  if (preferred && currentIncident) {
    rationale.push(`当前上下文为“${currentIncident.context?.contextSummary || buildContextSummaryText(currentIncident.context)}”。`);
    rationale.push(`该指纹当前建议路径为“${preferred.strategyLabel || preferred.strategyId || "-"}”（${pickContextMatchLevelLabel(preferred.contextMatchLevel)}）。`);
    if (preferred.contextMatchLevel === "exact-context") {
      rationale.push(`当前上下文成功率 ${preferred.contextSuccessRate ?? 0}%（${preferred.successCount ?? 0}/${preferred.attempts ?? 0}），全局成功率 ${preferred.globalSuccessRate ?? preferred.successRate ?? 0}%。`);
    } else {
      rationale.push(`当前上下文暂无直命中样本，回退到历史全局经验；全局成功率 ${preferred.globalSuccessRate ?? preferred.successRate ?? 0}%（${preferred.successCount ?? 0}/${preferred.contextMatchLevel === "fingerprint-global" ? (currentIncident.historyCount ?? 0) : (preferred.attempts ?? 0)}）。`);
    }
  }

  if (Array.isArray(currentIncident?.recentReasons) && currentIncident.recentReasons.length > 0) {
    const blocker = currentIncident.recentReasons[0];
    rationale.push(`最近常见阻塞是“${blocker.label || blocker.reason || "未知原因"}”。`);
  }

  if (watchRecoverySignal?.latestStatus === "failed" || regressingSignals.some((item) => item.signalId === "watchRecovery")) {
    nextAction = "npm run agent:zotero:watch-recovery";
    title = "先重新闭环恢复链";
    confidence = "high";
    appendSignalId(supportingSignals, "watchRecovery");
    appendRecommendationMetric(supportingMetrics, watchRecoverySignal, "missingTriggerCount");
    appendRecommendationMetric(supportingMetrics, watchRecoverySignal, "issueCount");
    rationale.push("历史信号显示恢复回归正在回归，优先验证 watch 恢复链。");
  } else if (watchSignal?.present && watchSignal.latestStatus && watchSignal.latestStatus !== "healthy") {
    nextAction = "npm run zotero:watch";
    title = "先恢复热重载稳定性";
    confidence = "high";
    appendSignalId(supportingSignals, "watch");
    appendRecommendationMetric(supportingMetrics, watchSignal, "issueCount");
    rationale.push(`当前 watch 状态为“${watchSignal.latestStatusLabel || watchSignal.latestStatus}”，应先恢复热重载稳定性。`);
  } else if (regressingSignals.some((item) => item.signalId === "watch")) {
    nextAction = "npm run zotero:watch";
    title = "先刷新热重载链路";
    confidence = "high";
    appendSignalId(supportingSignals, "watch");
    appendRecommendationMetric(supportingMetrics, watchSignal, "issueCount");
    rationale.push("历史信号显示 watch 正在回归，先刷新热重载链路更稳。");
  } else if (
    readerEventSignal
    && readerEventSignal.present !== false
    && (
      readerEventSignal.latestStatus !== "passed"
      || regressingSignals.some((item) => item.signalId === "readerEvent")
    )
  ) {
    nextAction = "npm run agent:zotero:e2e";
    title = "先刷新 Reader 事件桥画像";
    confidence = readerEventSignal?.latestStatus === "failed" ? "high" : "medium";
    appendSignalId(supportingSignals, "readerEvent");
    appendRecommendationMetric(supportingMetrics, readerEventSignal, "unavailableCount");
    appendRecommendationMetric(supportingMetrics, readerEventSignal, "syntheticFallbackMissingCount");
    appendRecommendationMetric(supportingMetrics, readerEventSignal, "hookFailedCount");
    appendRecommendationMetric(supportingMetrics, readerEventSignal, "hookMissingCount");
    appendRecommendationMetric(supportingMetrics, readerEventSignal, "fineGrainedFailedCount");
    appendRecommendationMetric(supportingMetrics, readerEventSignal, "fineGrainedMissingCount");
    appendRecommendationMetric(supportingMetrics, readerEventSignal, "knownTypeCount");
    appendRecommendationMetric(supportingMetrics, readerEventSignal, "probeCompatibleTypeCount");
    rationale.push("Reader 事件桥信号显示事件 API、Hook 场景或 synthetic-fallback 可能发生退化。");
  } else if (currentIncident && preferred && (preferred.ruleId || preferred.strategyId === "recovery-only")) {
    nextAction = "npm run agent:zotero:autofix";
    title = preferred.contextMatchLevel === "exact-context"
      ? "优先复用当前上下文最优恢复路径"
      : (preferred.contextMatchLevel === "strategy-global"
        ? "优先复用该策略的全局恢复路径"
        : "先按指纹全局经验回退");
    confidence = preferred.contextMatchLevel === "exact-context"
      ? (Number(preferred.contextSuccessRate || 0) >= 60 ? "high" : "medium")
      : (Number(preferred.globalSuccessRate || preferred.successRate || 0) >= 60 ? "medium" : "low");
    appendSignalId(supportingSignals, "autofix");
    appendRecommendationMetric(supportingMetrics, autofixSignal, "failedAttempts");
    appendRecommendationMetric(supportingMetrics, autofixSignal, "patchApplicationIssueCount");
    appendRecommendationMetric(supportingMetrics, autofixSignal, "patchVerificationChecksFailed");
    appendRecommendationMetric(supportingMetrics, autofixSignal, "patchVerificationRequiredFailed");
    appendRecommendationMetric(supportingMetrics, autofixSignal, "patchVerificationOptionalFailed");
    rationale.push(preferred.contextMatchLevel === "exact-context"
      ? "该问题在相同 boot mode 与 Zotero 版本桶下已有直接成功样本，可优先复用。"
      : "该问题在当前上下文缺少直接成功样本，先按历史全局经验选择最稳路径。");
  } else if (e2eSignal?.latestStatus === "failed" || regressingSignals.some((item) => item.signalId === "e2e")) {
    nextAction = "npm run agent:zotero:e2e";
    title = "先刷新真机失败画像";
    confidence = "medium";
    appendSignalId(supportingSignals, "e2e");
    appendRecommendationMetric(supportingMetrics, e2eSignal, "cycleFailedCount");
    appendRecommendationMetric(supportingMetrics, e2eSignal, "logErrorCount");
    appendRecommendationMetric(supportingMetrics, e2eSignal, "testFailed");
    appendRecommendationMetric(supportingMetrics, e2eSignal, "scenarioFailed");
    appendRecommendationMetric(supportingMetrics, e2eSignal, "visualDriftCount");
    appendRecommendationMetric(supportingMetrics, e2eSignal, "visualMissingCount");
    appendRecommendationMetric(supportingMetrics, e2eSignal, "serviceUnhealthyCount");
    appendRecommendationMetric(supportingMetrics, e2eSignal, "capabilityUncoveredCount");
    appendRecommendationMetric(supportingMetrics, e2eSignal, "staticRuntimeMissingCount");
    rationale.push("当前 E2E 信号在回归或失败，建议先刷新最新真机失败画像。");
  } else if (gateSignal?.latestStatus === "blocked") {
    nextAction = "npm run agent:gate";
    title = "先刷新质量闸门画像";
    confidence = "medium";
    appendSignalId(supportingSignals, "gate");
    appendRecommendationMetric(supportingMetrics, gateSignal, "blockerCount");
    appendRecommendationMetric(supportingMetrics, gateSignal, "effectiveFailed");
    rationale.push("当前 gate 仍处于阻断态，建议先刷新最新门禁画像。");
  } else if (currentIncident) {
    nextAction = "npm run agent:zotero:e2e";
    title = "先刷新当前故障画像";
    confidence = "low";
    rationale.push("当前已有故障指纹，但历史最优路径还不够稳定，建议先刷新故障画像。");
  }

  if (gateSignal?.metricHighlights?.length > 0) {
    const highlight = gateSignal.metricHighlights[0];
    rationale.push(`当前门禁侧最显著的历史指标是“${highlight.label} ${highlight.latestValue}”。`);
    appendSignalId(supportingSignals, "gate");
  }

  if (autofixSignal?.metricHighlights?.some((item) => item.metricId === "failedAttempts")) {
    const failedAttempts = autofixSignal.metricHighlights.find((item) => item.metricId === "failedAttempts");
    rationale.push(`最近 autofix 历史里失败步骤为 ${failedAttempts?.latestValue ?? 0}。`);
    appendSignalId(supportingSignals, "autofix");
  }

  return {
    title,
    nextAction,
    confidence,
    summary: rationale.join(" "),
    candidateFiles: Array.isArray(currentIncident?.candidateFiles) ? currentIncident.candidateFiles.slice(0, 5) : [],
    strategyId: preferred?.strategyId || null,
    strategyLabel: preferred?.strategyLabel || null,
    supportingSignals,
    supportingMetrics,
  };
}

function finalizeFingerprintGroup(group) {
  const attempts = Number(group.count || 0);
  const successCount = Number(group.successCount || 0);
  const failureCount = Number(group.failureCount || 0);
  const verificationAttempts = Number(group.verificationCount || 0);
  const verificationPassedCount = Number(group.verificationPassedCount || 0);
  const contexts = finalizeContextSlices(group.contextMap, 3);
  const historyEntries = Array.isArray(group.entries)
    ? [...group.entries].sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")))
    : [];
  const latestEntry = historyEntries[0] || null;
  const strategies = Array.from(group.strategies.values()).map((item) => finalizeStrategy(item));
  const preferredStrategy = pickPreferredStrategy(strategies);

  return {
    fingerprint: group.fingerprint,
    featureLabel: group.featureLabel,
    count: attempts,
    successCount,
    failureCount,
    successRate: attempts === 0 ? 0 : roundRate((successCount / attempts) * 100),
    verificationPassedCount,
    verificationPassedRate: verificationAttempts === 0 ? 0 : roundRate((verificationPassedCount / verificationAttempts) * 100),
    lastSeenAt: group.lastSeenAt || null,
    candidateFiles: uniqueStrings(Array.from(group.candidateFiles)).slice(0, 5),
    draftOperations: finalizeCountEntries(group.operationMap, "operation"),
    recentReasons: finalizeCountEntries(group.reasonMap, "reason"),
    requiredFailedChecks: finalizeCountEntries(group.requiredFailedCheckMap, "id"),
    optionalFailedChecks: finalizeCountEntries(group.optionalFailedCheckMap, "id"),
    failedCheckKinds: finalizeCountEntries(group.failedKindMap, "kind"),
    optionalFailedCheckKinds: finalizeCountEntries(group.optionalFailedKindMap, "kind"),
    latestOutcomeLabel: latestEntry?.outcomeLabel || (latestEntry ? (latestEntry.success ? "已恢复" : "未恢复") : null),
    latestStrategyId: latestEntry?.strategyId || null,
    latestStrategyLabel: latestEntry?.strategyLabel || null,
    trend: buildTrendSummary(historyEntries),
    recentHistory: buildFingerprintRecentHistory(historyEntries),
    contexts,
    preferredStrategy,
    strategies,
  };
}

function resolveCurrentDiagnosis(e2eReport, autofixReport) {
  if (e2eReport?.passed !== true && e2eReport?.primaryDiagnosis?.fingerprint) {
    return {
      fingerprint: normalizeDiagnosisFingerprint(e2eReport.primaryDiagnosis.fingerprint),
      featureLabel: e2eReport.primaryDiagnosis.featureLabel || e2eReport.primaryDiagnosis.feature || "未知功能",
      candidateFiles: Array.isArray(e2eReport.primaryDiagnosis.candidateFiles)
        ? e2eReport.primaryDiagnosis.candidateFiles.slice(0, 5)
        : [],
    };
  }

  if (autofixReport?.recovered !== true && autofixReport?.patchPlan?.fingerprint) {
    return {
      fingerprint: normalizeDiagnosisFingerprint(autofixReport.patchPlan.fingerprint),
      featureLabel: autofixReport.patchPlan.featureLabel || autofixReport.patchPlan.feature || "未知功能",
      candidateFiles: Array.isArray(autofixReport.patchPlan.candidateFiles)
        ? autofixReport.patchPlan.candidateFiles.slice(0, 5)
        : [],
    };
  }

  return null;
}

function resolveCurrentContext(e2eReport, autofixReport) {
  const e2eSummary = summarizeE2EReport(e2eReport);
  const autofixSummary = summarizeAutofixReport(autofixReport);
  const source = e2eSummary.present
    ? e2eSummary
    : (autofixSummary.present ? autofixSummary : null);
  const latestBootMode = normalizeBootMode(source?.latestBootMode);
  const zoteroVersion = normalizeContextValue(source?.zoteroVersion);
  const zoteroVersionBucket = normalizeContextValue(source?.zoteroVersionBucket);
  const bootModes = uniqueStrings(Array.isArray(source?.bootModes) ? source.bootModes : []).length > 0
    ? uniqueStrings(source.bootModes)
    : ["unknown"];

  return {
    contextObserved: source?.contextObserved === true,
    latestBootMode,
    zoteroVersion,
    zoteroVersionBucket,
    bootModes,
    contextKey: buildContextKey(latestBootMode, zoteroVersionBucket),
    contextSummary: buildContextSummaryText({
      latestBootMode,
      zoteroVersionBucket,
    }),
  };
}

export async function loadAutofixHistoryEntries(historyDir) {
  const dir = String(historyDir || "").trim();
  if (!dir) {
    return [];
  }

  let entries = [];
  try {
    entries = await fs.readdir(dir);
  }
  catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const targets = entries
    .filter((entry) => entry.endsWith(".json") && entry !== "latest.json")
    .sort()
    .map((entry) => path.join(dir, entry));

  const history = [];
  for (const filePath of targets) {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    history.push(parsed);
  }

  history.sort((a, b) => String(b?.generatedAt || "").localeCompare(String(a?.generatedAt || "")));
  return history;
}

export function summarizeAgentMemory({
  e2eReport = null,
  autofixReport = null,
  historyEntries = [],
  signalTrends = null,
  now = new Date(),
} = {}) {
  const generatedAt = toISODate(now) || new Date().toISOString();
  const normalizedEntries = (Array.isArray(historyEntries) ? historyEntries : [])
    .map((entry) => normalizeHistoryEntry(entry))
    .filter(Boolean)
    .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
  const signalReasonEntries = Array.isArray(signalTrends?.reasonEntries)
    ? signalTrends.reasonEntries
      .filter((entry) => entry && typeof entry === "object" && entry.reason && entry.label)
      .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")))
    : [];

  const fingerprintMap = new Map();
  const blockerReasonMap = new Map();
  normalizedEntries.forEach((entry) => {
    if (!fingerprintMap.has(entry.fingerprint)) {
      fingerprintMap.set(entry.fingerprint, {
        fingerprint: entry.fingerprint,
        featureLabel: entry.featureLabel,
        count: 0,
        successCount: 0,
        failureCount: 0,
        verificationCount: 0,
        verificationPassedCount: 0,
        lastSeenAt: null,
        candidateFiles: new Set(),
        operationMap: new Map(),
        reasonMap: new Map(),
        requiredFailedCheckMap: new Map(),
        optionalFailedCheckMap: new Map(),
        failedKindMap: new Map(),
        optionalFailedKindMap: new Map(),
        contextMap: new Map(),
        entries: [],
        strategies: new Map(),
      });
    }

    const group = fingerprintMap.get(entry.fingerprint);
    group.count += 1;
    group.lastSeenAt = pickBetterTimestamp(group.lastSeenAt, entry.generatedAt);
    group.entries.push(entry);
    entry.candidateFiles.forEach((file) => group.candidateFiles.add(file));
    if (entry.success) {
      group.successCount += 1;
    } else {
      group.failureCount += 1;
    }
    if (entry.verificationStatus) {
      group.verificationCount += 1;
      if (entry.verificationPassed) {
        group.verificationPassedCount += 1;
      }
    }
    recordContextObservation(group.contextMap, entry);

    entry.draftOperations.forEach((operation) => {
      if (!group.operationMap.has(operation.operation)) {
        group.operationMap.set(operation.operation, createOperationAccumulator(operation.operation, operation.label));
      }
      group.operationMap.get(operation.operation).count += Number(operation.count || 0) || 1;
    });

    entry.blockerReasons.forEach((reason) => {
      if (!group.reasonMap.has(reason.reason)) {
        group.reasonMap.set(reason.reason, createReasonAccumulator(reason.reason, reason.label));
      }
      group.reasonMap.get(reason.reason).count += Number(reason.count || 0) || 1;
    });

    entry.verificationFailedChecks.forEach((check) => {
      const key = String(check?.id || check?.label || "").trim();
      if (!key) {
        return;
      }
      if (!group.requiredFailedCheckMap.has(key)) {
        group.requiredFailedCheckMap.set(key, createVerificationCheckAccumulator(
          check?.id || key,
          check?.label || check?.id || key,
        ));
      }
      group.requiredFailedCheckMap.get(key).count += 1;
    });

    entry.verificationOptionalFailedChecks.forEach((check) => {
      const key = String(check?.id || check?.label || "").trim();
      if (!key) {
        return;
      }
      if (!group.optionalFailedCheckMap.has(key)) {
        group.optionalFailedCheckMap.set(key, createVerificationCheckAccumulator(
          check?.id || key,
          check?.label || check?.id || key,
        ));
      }
      group.optionalFailedCheckMap.get(key).count += 1;
    });

    entry.verificationFailedCheckKinds.forEach((kindEntry) => {
      const key = String(kindEntry?.kind || "").trim();
      if (!key) {
        return;
      }
      if (!group.failedKindMap.has(key)) {
        group.failedKindMap.set(key, createVerificationKindAccumulator(
          key,
          kindEntry?.label || key,
        ));
      }
      group.failedKindMap.get(key).count += Number(kindEntry?.count || 0) || 1;
    });

    entry.verificationOptionalFailedCheckKinds.forEach((kindEntry) => {
      const key = String(kindEntry?.kind || "").trim();
      if (!key) {
        return;
      }
      if (!group.optionalFailedKindMap.has(key)) {
        group.optionalFailedKindMap.set(key, createVerificationKindAccumulator(
          key,
          kindEntry?.label || key,
        ));
      }
      group.optionalFailedKindMap.get(key).count += Number(kindEntry?.count || 0) || 1;
    });

    if (!group.strategies.has(entry.strategyId)) {
      group.strategies.set(entry.strategyId, {
        strategyId: entry.strategyId,
        strategyLabel: entry.strategyLabel,
        ruleId: entry.ruleId,
        count: 0,
        successCount: 0,
        failureCount: 0,
        verificationCount: 0,
        verificationPassedCount: 0,
        lastSeenAt: null,
        lastSuccessfulAt: null,
        lastFailedAt: null,
        candidateFiles: new Set(),
        operationMap: new Map(),
        reasonMap: new Map(),
        requiredFailedCheckMap: new Map(),
        optionalFailedCheckMap: new Map(),
        failedKindMap: new Map(),
        optionalFailedKindMap: new Map(),
        contextMap: new Map(),
      });
    }

    const strategy = group.strategies.get(entry.strategyId);
    strategy.count += 1;
    strategy.lastSeenAt = pickBetterTimestamp(strategy.lastSeenAt, entry.generatedAt);
    entry.candidateFiles.forEach((file) => strategy.candidateFiles.add(file));
    if (entry.success) {
      strategy.successCount += 1;
      strategy.lastSuccessfulAt = pickBetterTimestamp(strategy.lastSuccessfulAt, entry.generatedAt);
    } else {
      strategy.failureCount += 1;
      strategy.lastFailedAt = pickBetterTimestamp(strategy.lastFailedAt, entry.generatedAt);
    }
    if (entry.verificationStatus) {
      strategy.verificationCount += 1;
      if (entry.verificationPassed) {
        strategy.verificationPassedCount += 1;
      }
    }
    recordContextObservation(strategy.contextMap, entry);

    entry.draftOperations.forEach((operation) => {
      if (!strategy.operationMap.has(operation.operation)) {
        strategy.operationMap.set(operation.operation, createOperationAccumulator(operation.operation, operation.label));
      }
      strategy.operationMap.get(operation.operation).count += Number(operation.count || 0) || 1;
    });

    entry.blockerReasons.forEach((reason) => {
      if (!strategy.reasonMap.has(reason.reason)) {
        strategy.reasonMap.set(reason.reason, createReasonAccumulator(reason.reason, reason.label));
      }
      strategy.reasonMap.get(reason.reason).count += Number(reason.count || 0) || 1;
    });

    entry.verificationFailedChecks.forEach((check) => {
      const key = String(check?.id || check?.label || "").trim();
      if (!key) {
        return;
      }
      if (!strategy.requiredFailedCheckMap.has(key)) {
        strategy.requiredFailedCheckMap.set(key, createVerificationCheckAccumulator(
          check?.id || key,
          check?.label || check?.id || key,
        ));
      }
      strategy.requiredFailedCheckMap.get(key).count += 1;
    });

    entry.verificationOptionalFailedChecks.forEach((check) => {
      const key = String(check?.id || check?.label || "").trim();
      if (!key) {
        return;
      }
      if (!strategy.optionalFailedCheckMap.has(key)) {
        strategy.optionalFailedCheckMap.set(key, createVerificationCheckAccumulator(
          check?.id || key,
          check?.label || check?.id || key,
        ));
      }
      strategy.optionalFailedCheckMap.get(key).count += 1;
    });

    entry.verificationFailedCheckKinds.forEach((kindEntry) => {
      const key = String(kindEntry?.kind || "").trim();
      if (!key) {
        return;
      }
      if (!strategy.failedKindMap.has(key)) {
        strategy.failedKindMap.set(key, createVerificationKindAccumulator(
          key,
          kindEntry?.label || key,
        ));
      }
      strategy.failedKindMap.get(key).count += Number(kindEntry?.count || 0) || 1;
    });

    entry.verificationOptionalFailedCheckKinds.forEach((kindEntry) => {
      const key = String(kindEntry?.kind || "").trim();
      if (!key) {
        return;
      }
      if (!strategy.optionalFailedKindMap.has(key)) {
        strategy.optionalFailedKindMap.set(key, createVerificationKindAccumulator(
          key,
          kindEntry?.label || key,
        ));
      }
      strategy.optionalFailedKindMap.get(key).count += Number(kindEntry?.count || 0) || 1;
    });

    entry.blockerReasons.forEach((reason) => {
      if (!blockerReasonMap.has(reason.reason)) {
        blockerReasonMap.set(reason.reason, {
          reason: reason.reason,
          label: reason.label,
          count: 0,
          successCount: 0,
          failureCount: 0,
          lastSeenAt: null,
          candidateFiles: new Set(),
          featureLabels: new Set(),
          fingerprints: new Set(),
          entries: [],
        });
      }

      const reasonGroup = blockerReasonMap.get(reason.reason);
      const weight = Math.max(1, Number(reason.count || 0) || 1);
      reasonGroup.count += weight;
      if (entry.success) {
        reasonGroup.successCount += weight;
      } else {
        reasonGroup.failureCount += weight;
      }
      reasonGroup.lastSeenAt = pickBetterTimestamp(reasonGroup.lastSeenAt, entry.generatedAt);
      entry.candidateFiles.forEach((file) => reasonGroup.candidateFiles.add(file));
      if (entry.featureLabel) {
        reasonGroup.featureLabels.add(entry.featureLabel);
      }
      if (entry.fingerprint) {
        reasonGroup.fingerprints.add(entry.fingerprint);
      }
      reasonGroup.entries.push({
        ...entry,
        weight,
        reason: reason.reason,
        label: reason.label,
      });
    });
  });

  const groups = Array.from(fingerprintMap.values())
    .map((item) => finalizeFingerprintGroup(item))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || ""));
    });
  const totalEntries = normalizedEntries.length;
  const successCount = normalizedEntries.filter((entry) => entry.success).length;
  const failureCount = totalEntries - successCount;

  signalReasonEntries.forEach((entry) => {
    if (!blockerReasonMap.has(entry.reason)) {
      blockerReasonMap.set(entry.reason, {
        reason: entry.reason,
        label: entry.label,
        count: 0,
        successCount: 0,
        failureCount: 0,
        lastSeenAt: null,
        candidateFiles: new Set(),
        featureLabels: new Set(),
        fingerprints: new Set(),
        entries: [],
      });
    }

    const reasonGroup = blockerReasonMap.get(entry.reason);
    const weight = Math.max(1, Number(entry.weight || 0) || 1);
    reasonGroup.count += weight;
    if (entry.success) {
      reasonGroup.successCount += weight;
    } else {
      reasonGroup.failureCount += weight;
    }
    reasonGroup.lastSeenAt = pickBetterTimestamp(reasonGroup.lastSeenAt, entry.generatedAt);
    (Array.isArray(entry.candidateFiles) ? entry.candidateFiles : []).forEach((file) => reasonGroup.candidateFiles.add(file));
    if (entry.featureLabel) {
      reasonGroup.featureLabels.add(entry.featureLabel);
    }
    if (entry.fingerprint) {
      reasonGroup.fingerprints.add(entry.fingerprint);
    }
    reasonGroup.entries.push({
      ...entry,
      weight,
    });
  });

  const blockerReasons = Array.from(blockerReasonMap.values())
    .map((item) => finalizeReasonGroup(item))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || ""));
    });
  const currentDiagnosis = resolveCurrentDiagnosis(e2eReport, autofixReport);
  const currentContext = resolveCurrentContext(e2eReport, autofixReport);
  const currentGroup = currentDiagnosis?.fingerprint
    ? groups.find((item) => item.fingerprint === currentDiagnosis.fingerprint) || null
    : null;
  const currentPreferredStrategy = currentGroup
    ? pickPreferredContextStrategy(currentGroup, currentContext)
    : null;
  const currentIncident = currentDiagnosis
    ? {
      fingerprint: currentDiagnosis.fingerprint,
      featureLabel: currentDiagnosis.featureLabel,
      seenBefore: Boolean(currentGroup),
      historyCount: currentGroup?.count || 0,
      successCount: currentGroup?.successCount || 0,
      failureCount: currentGroup?.failureCount || 0,
      lastSeenAt: currentGroup?.lastSeenAt || null,
      candidateFiles: uniqueStrings([
        ...(currentDiagnosis.candidateFiles || []),
        ...(currentGroup?.candidateFiles || []),
      ]).slice(0, 5),
      context: currentContext,
      preferredStrategy: currentPreferredStrategy,
      verificationPassedRate: Number(currentGroup?.verificationPassedRate || 0),
      requiredFailedChecks: Array.isArray(currentGroup?.requiredFailedChecks)
        ? currentGroup.requiredFailedChecks
        : [],
      optionalFailedChecks: Array.isArray(currentGroup?.optionalFailedChecks)
        ? currentGroup.optionalFailedChecks
        : [],
      failedCheckKinds: Array.isArray(currentGroup?.failedCheckKinds)
        ? currentGroup.failedCheckKinds
        : [],
      optionalFailedCheckKinds: Array.isArray(currentGroup?.optionalFailedCheckKinds)
        ? currentGroup.optionalFailedCheckKinds
        : [],
      contexts: Array.isArray(currentGroup?.contexts)
        ? currentGroup.contexts
        : [],
      recentReasons: currentGroup?.recentReasons || [],
      draftOperations: currentGroup?.draftOperations || [],
    }
    : null;
  const fixOutcomeMemory = groups
    .filter((item) => item.preferredStrategy && Number(item.preferredStrategy.successCount || 0) > 0)
    .map((item) => ({
      fingerprint: item.fingerprint,
      featureLabel: item.featureLabel,
      attempts: item.count,
      successCount: item.successCount,
      failureCount: item.failureCount,
      lastSeenAt: item.lastSeenAt,
      candidateFiles: item.candidateFiles,
      preferredStrategy: item.preferredStrategy,
    }))
    .sort((a, b) => {
      if ((b.preferredStrategy?.successCount || 0) !== (a.preferredStrategy?.successCount || 0)) {
        return (b.preferredStrategy?.successCount || 0) - (a.preferredStrategy?.successCount || 0);
      }
      if ((b.preferredStrategy?.successRate || 0) !== (a.preferredStrategy?.successRate || 0)) {
        return (b.preferredStrategy?.successRate || 0) - (a.preferredStrategy?.successRate || 0);
      }
      return String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || ""));
    })
    .slice(0, 5);
  const trend = buildTrendSummary(normalizedEntries);
  const recentHistory = buildRecentHistory(normalizedEntries);
  const normalizedSignalTrends = signalTrends && typeof signalTrends === "object"
    ? {
      ...signalTrends,
      signals: normalizeSignalSummaries(signalTrends.signals),
    }
    : {
      generatedAt,
      signals: [],
      archive: {
        present: false,
        signalsDir: null,
        signalIndexJSON: null,
      },
    };
  const recommendation = buildHistoricalRecommendation(currentIncident, normalizedSignalTrends);

  return {
    present: totalEntries > 0 || Boolean(currentIncident),
    generatedAt,
    totalEntries,
    successCount,
    failureCount,
    uniqueFingerprintCount: groups.length,
    failureMemory: {
      totalEntries,
      successCount,
      failureCount,
      uniqueFingerprintCount: groups.length,
      hotFingerprints: groups.slice(0, 5),
    },
    fixOutcomeMemory,
    currentIncident,
    trend,
    recentHistory,
    recommendation,
    signalTrends: normalizedSignalTrends,
    reasonTrends: {
      present: blockerReasons.length > 0,
      totalReasonKinds: blockerReasons.length,
      topReasons: blockerReasons.slice(0, 5),
      archive: {
        present: false,
        reasonsDir: null,
        reasonIndexJSON: null,
      },
    },
    fingerprints: groups,
  };
}

function formatStrategy(strategy) {
  if (!strategy) {
    return "-";
  }
  return `${strategy.strategyLabel} / 成功率 ${strategy.successRate}% / ${strategy.successCount}/${strategy.attempts}`;
}

function formatContextSummary(context) {
  if (!context || typeof context !== "object") {
    return "unknown / unknown";
  }
  return buildContextSummaryText(context);
}

function formatContextSlicesText(entries, limit = 3) {
  const list = (Array.isArray(entries) ? entries : [])
    .filter((item) => item && typeof item === "object")
    .slice(0, limit)
    .map((item) => `${formatContextSummary(item)} x${Number(item?.attempts || item?.count || 0)}`);
  return list.length > 0 ? list.join("；") : "-";
}

function formatVerificationChecksText(entries, limit = 3) {
  const list = (Array.isArray(entries) ? entries : [])
    .filter((item) => item && typeof item === "object")
    .slice(0, limit)
    .map((item) => {
      const label = String(item?.label || item?.id || "未知检查").trim() || "未知检查";
      const id = String(item?.id || "").trim();
      return id ? `${label}（${id}）` : label;
    });
  return list.length > 0 ? list.join("；") : "-";
}

function formatVerificationKindsText(entries, limit = 3) {
  const kindMap = new Map();
  (Array.isArray(entries) ? entries : [])
    .filter((item) => item && typeof item === "object")
    .forEach((item) => {
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
  const list = Array.from(kindMap.values())
    .sort((a, b) => {
      const rankMap = {
        "all-cycle-check": 0,
        "latest-cycle-check": 1,
        "report-field": 2,
      };
      const rankDiff = Number(rankMap[a.kind] ?? 9) - Number(rankMap[b.kind] ?? 9);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      const labelDiff = String(a.label || a.kind || "").localeCompare(String(b.label || b.kind || ""), "zh-CN");
      if (labelDiff !== 0) {
        return labelDiff;
      }
      return String(a.kind || "").localeCompare(String(b.kind || ""));
    })
    .slice(0, limit)
    .map((item) => `${item.label || item.kind || "未知检查"} x${Number(item.count || 0)}`);
  return list.length > 0 ? list.join("；") : "-";
}

function renderHeading(title, level = 1) {
  return `${"#".repeat(Math.max(1, Math.min(6, Number(level) || 1)))} ${title}`;
}

export function renderAgentMemoryMarkdown(summary, options = {}) {
  const headingLevel = Math.max(1, Math.min(6, Number(options.headingLevel) || 1));
  const fingerprintArchives = Array.isArray(summary?.fingerprints) && summary.fingerprints.length > 0
    ? summary.fingerprints.slice(0, 5)
    : (Array.isArray(summary?.failureMemory?.hotFingerprints) ? summary.failureMemory.hotFingerprints.slice(0, 5) : []);
  const reasonArchives = Array.isArray(summary?.reasonTrends?.topReasons)
    ? summary.reasonTrends.topReasons.slice(0, 5)
    : [];
  const lines = [
    renderHeading("Agent 记忆层", headingLevel),
    "",
    `- 生成时间: \`${summary?.generatedAt || "-"}\``,
    `- 历史样本: \`${summary?.totalEntries ?? 0}\``,
    `- 成功样本: \`${summary?.successCount ?? 0}\``,
    `- 失败样本: \`${summary?.failureCount ?? 0}\``,
    `- 已记忆指纹: \`${summary?.uniqueFingerprintCount ?? 0}\``,
    "",
  ];

  if (summary?.trend) {
    lines.push(
      renderHeading("近期趋势", headingLevel + 1),
      "",
      `- 趋势判断: \`${summary.trend.directionLabel || "未知"}\``,
      `- 趋势摘要: ${summary.trend.summary || "-"}`,
      `- 最近窗口: \`${summary.trend.recentWindow?.total ?? 0}\` 条 / 成功率 \`${summary.trend.recentWindow?.successRate ?? 0}%\``,
      `- 前序窗口: \`${summary.trend.previousWindow?.total ?? 0}\` 条 / 成功率 \`${summary.trend.previousWindow?.successRate ?? 0}%\``,
      "",
      "| 日期 | 样本 | 成功 | 失败 | 成功率 | 指纹数 |",
      "|---|---:|---:|---:|---:|---:|",
    );

    if (!Array.isArray(summary.trend.days) || summary.trend.days.length === 0) {
      lines.push("| - | 0 | 0 | 0 | 0% | 0 |");
    } else {
      summary.trend.days.forEach((item) => {
        lines.push(
          `| ${item.day || "-"} | ${item.total ?? 0} | ${item.successCount ?? 0} | ${item.failureCount ?? 0} | ${item.successRate ?? 0}% | ${item.uniqueFingerprintCount ?? 0} |`,
        );
      });
    }
    lines.push("");
  }

  if (summary?.currentIncident) {
    lines.push(
      renderHeading("当前故障记忆", headingLevel + 1),
      "",
      `- 当前指纹: \`${summary.currentIncident.fingerprint || "-"}\``,
      `- 功能域: \`${summary.currentIncident.featureLabel || "-"}\``,
      `- 是否见过: \`${summary.currentIncident.seenBefore ? "是" : "否"}\``,
      `- 历史次数: \`${summary.currentIncident.historyCount ?? 0}\``,
      `- 历史成功/失败: \`${summary.currentIncident.successCount ?? 0}/${summary.currentIncident.failureCount ?? 0}\``,
      `- 最近一次: \`${summary.currentIncident.lastSeenAt || "-"}\``,
      `- 候选文件: ${(summary.currentIncident.candidateFiles || []).join("、") || "-"}`,
      `- 当前上下文: \`${formatContextSummary(summary.currentIncident.context)}\``,
      `- 历史最优路径: ${formatStrategy(summary.currentIncident.preferredStrategy)}`,
      `- 上下文命中级别: \`${pickContextMatchLevelLabel(summary.currentIncident.preferredStrategy?.contextMatchLevel)}\``,
      `- 上下文样本: \`${summary.currentIncident.preferredStrategy?.contextAttempts ?? 0}\``,
      `- 上下文成功率: \`${summary.currentIncident.preferredStrategy?.contextSuccessRate ?? 0}%\``,
      `- 全局成功率: \`${summary.currentIncident.preferredStrategy?.globalSuccessRate ?? summary.currentIncident.preferredStrategy?.successRate ?? 0}%\``,
      `- 复验通过率: \`${summary.currentIncident.verificationPassedRate ?? 0}%\``,
      `- 历史上下文切片: ${formatContextSlicesText(summary.currentIncident.contexts)}`,
      `- 常见必需失败: ${formatVerificationChecksText(summary.currentIncident.requiredFailedChecks)}`,
      `- 常见观察失败: ${formatVerificationChecksText(summary.currentIncident.optionalFailedChecks)}`,
      `- 失败类型画像: ${formatVerificationKindsText([
        ...(Array.isArray(summary.currentIncident.failedCheckKinds) ? summary.currentIncident.failedCheckKinds : []),
        ...(Array.isArray(summary.currentIncident.optionalFailedCheckKinds) ? summary.currentIncident.optionalFailedCheckKinds : []),
      ])}`,
      `- 常见阻塞: ${(summary.currentIncident.recentReasons || []).map((item) => `${item.label} x${item.count}`).join("；") || "-"}`,
      `- 常见动作: ${(summary.currentIncident.draftOperations || []).map((item) => `${item.label} x${item.count}`).join("；") || "-"}`,
      "",
    );
  }

  if (summary?.recommendation) {
    lines.push(
      renderHeading("历史推荐", headingLevel + 1),
      "",
      `- 推荐标题: ${summary.recommendation.title || "-"}`,
      `- 推荐动作: \`${summary.recommendation.nextAction || "-"}\``,
      `- 推荐置信度: \`${summary.recommendation.confidence || "-"}\``,
      `- 推荐依据: ${summary.recommendation.summary || "-"}`,
      `- 上下文命中: \`${pickContextMatchLevelLabel(summary.currentIncident?.preferredStrategy?.contextMatchLevel)}\``,
      `- 支撑信号: ${(summary.recommendation.supportingSignals || []).join("、") || "-"}`,
      `- 支撑指标: ${(summary.recommendation.supportingMetrics || []).map((item) => `${item.signalLabel}/${item.metricLabel}=${item.value}`).join("；") || "-"}`,
      `- 候选文件: ${(summary.recommendation.candidateFiles || []).join("、") || "-"}`,
      "",
    );
  }

  lines.push(
    renderHeading("最近样本", headingLevel + 1),
    "",
    "| 时间 | 指纹 | 功能域 | 结果 | 路径 | 候选文件 |",
    "|---|---|---|---|---|---|",
  );

  if (!Array.isArray(summary?.recentHistory) || summary.recentHistory.length === 0) {
    lines.push("| - | - | - | - | - | - |");
  } else {
    summary.recentHistory.forEach((item) => {
      lines.push(
        `| ${item.generatedAt || "-"} | ${item.fingerprint || "-"} | ${item.featureLabel || "-"} | ${item.outcomeLabel || (item.success ? "已恢复" : "未恢复")} | ${item.strategyLabel || "-"} | ${(item.candidateFiles || []).join("、") || "-"} |`,
      );
    });
  }
  lines.push("");

  lines.push(
    renderHeading("运行信号趋势", headingLevel + 1),
    "",
    "| 信号 | 最近状态 | 历史样本 | 健康率 | 趋势 | 关键指标 | 最近时间 |",
    "|---|---|---:|---:|---|---|---|",
  );

  if (!Array.isArray(summary?.signalTrends?.signals) || summary.signalTrends.signals.length === 0) {
    lines.push("| - | 缺失 | 0 | 0% | 基线 | - | - |");
  } else {
    summary.signalTrends.signals.forEach((item) => {
      const highlights = Array.isArray(item.metricHighlights)
        ? item.metricHighlights.map((metric) => `${metric.label} ${metric.latestValue}`).join("；")
        : "";
      lines.push(
        `| ${item.label || item.signalId || "-"} | ${item.latestStatusLabel || "缺失"} | ${item.totalEntries ?? 0} | ${item.okRate ?? 0}% | ${item.trend?.directionLabel || "基线"} | ${highlights || "-"} | ${item.latestObservedAt || "-"} |`,
      );
    });
  }
  lines.push("");

  lines.push(
    renderHeading("阻塞原因趋势", headingLevel + 1),
    "",
    "| 原因 | 趋势 | 历史次数 | 成功率 | 最近时间 | 关联指纹 |",
    "|---|---|---:|---:|---|---:|",
  );

  if (reasonArchives.length === 0) {
    lines.push("| - | 基线 | 0 | 0% | - | 0 |");
  } else {
    reasonArchives.forEach((item) => {
      lines.push(
        `| ${(item.label || item.reason || "-")} / ${item.reason || "-"} | ${item.trend?.directionLabel || "基线"} | ${item.count ?? 0} | ${item.successRate ?? 0}% | ${item.lastSeenAt || "-"} | ${item.uniqueFingerprintCount ?? 0} |`,
      );
    });
  }
  lines.push("");

  lines.push(
    renderHeading("故障记忆 Top", headingLevel + 1),
    "",
    "| 指纹 | 功能域 | 历史次数 | 成功率 | 上下文切片 | 最近一次 | 历史最优路径 |",
    "|---|---|---:|---:|---|---|---|",
  );

  if (!Array.isArray(summary?.failureMemory?.hotFingerprints) || summary.failureMemory.hotFingerprints.length === 0) {
    lines.push("| - | - | 0 | 0% | - | - | - |");
  } else {
    summary.failureMemory.hotFingerprints.forEach((item) => {
      lines.push(
        `| ${item.fingerprint || "-"} | ${item.featureLabel || "-"} | ${item.count ?? 0} | ${item.successRate ?? 0}% | ${formatContextSlicesText(item.contexts)} | ${item.lastSeenAt || "-"} | ${formatStrategy(item.preferredStrategy)} |`,
      );
    });
  }
  lines.push("");

  lines.push(
    renderHeading("修复结果记忆", headingLevel + 1),
    "",
    "| 指纹 | 历史最优路径 | 上下文摘要 | 成功率 | 复验通过率 | 最近成功 | 候选文件 |",
    "|---|---|---|---:|---:|---|---|",
  );

  if (!Array.isArray(summary?.fixOutcomeMemory) || summary.fixOutcomeMemory.length === 0) {
    lines.push("| - | - | - | 0% | 0% | - | - |");
  } else {
    summary.fixOutcomeMemory.forEach((item) => {
      lines.push(
        `| ${item.fingerprint || "-"} | ${item.preferredStrategy?.strategyLabel || "-"} | ${formatContextSummary(item.preferredStrategy)} | ${item.preferredStrategy?.successRate ?? 0}% | ${item.preferredStrategy?.verificationPassedRate ?? 0}% | ${item.preferredStrategy?.lastSuccessfulAt || "-"} | ${(item.candidateFiles || []).join("、") || "-"} |`,
      );
    });
  }
  lines.push("");

  lines.push(
    renderHeading("重点指纹时间序列", headingLevel + 1),
    "",
    "| 指纹 | 趋势 | 最近结果 | 最近路径 | 最近时间 |",
    "|---|---|---|---|---|",
  );

  if (fingerprintArchives.length === 0) {
    lines.push("| - | 基线 | - | - | - |");
  } else {
    fingerprintArchives.forEach((item) => {
      const latest = Array.isArray(item.recentHistory) ? item.recentHistory[0] : null;
      lines.push(
        `| ${item.fingerprint || "-"} | ${item.trend?.directionLabel || "基线"} | ${item.latestOutcomeLabel || latest?.outcomeLabel || "-"} | ${item.latestStrategyLabel || latest?.strategyLabel || item.preferredStrategy?.strategyLabel || "-"} | ${latest?.generatedAt || item.lastSeenAt || "-"} |`,
      );
    });
  }
  lines.push("");

  if (summary?.archive?.present) {
    lines.push(
      renderHeading("归档工件", headingLevel + 1),
      "",
      `- 主摘要 JSON: \`${summary.archive.reportJSON || "-"}\``,
      `- 主摘要 Markdown: \`${summary.archive.reportMD || "-"}\``,
      `- 最新快照 JSON: \`${summary.archive.latestJSON || "-"}\``,
      `- 最新快照 Markdown: \`${summary.archive.latestMD || "-"}\``,
      `- 归档快照 JSON: \`${summary.archive.snapshotJSON || "-"}\``,
      `- 归档快照 Markdown: \`${summary.archive.snapshotMD || "-"}\``,
      `- 历史索引: \`${summary.archive.historyIndexJSON || "-"}\``,
      `- 指纹索引: \`${summary.archive.fingerprintIndexJSON || "-"}\``,
      `- 原因索引: \`${summary.reasonTrends?.archive?.reasonIndexJSON || "-"}\``,
      `- 信号索引: \`${summary.signalTrends?.archive?.signalIndexJSON || "-"}\``,
      "",
    );
  }

  return lines.join("\n");
}

export function buildAgentMemoryMarkdown(summary) {
  return renderAgentMemoryMarkdown(summary, { headingLevel: 1 });
}

export async function writeAgentMemoryArtifacts(projectRoot, summary) {
  const artifacts = resolveAgentMemoryArtifacts(projectRoot);
  const relativeBase = artifacts.artifactsDir;
  const snapshotId = createSnapshotId(summary?.generatedAt);
  const snapshotJSONPath = path.join(artifacts.snapshotsDir, `${snapshotId}.json`);
  const snapshotMDPath = path.join(artifacts.snapshotsDir, `${snapshotId}.md`);
  const archive = {
    present: true,
    snapshotId,
    archiveDir: toRelativePath(relativeBase, artifacts.archiveDir),
    reportJSON: toRelativePath(relativeBase, artifacts.reportJSON),
    reportMD: toRelativePath(relativeBase, artifacts.reportMD),
    latestJSON: toRelativePath(relativeBase, artifacts.latestJSON),
    latestMD: toRelativePath(relativeBase, artifacts.latestMD),
    snapshotJSON: toRelativePath(relativeBase, snapshotJSONPath),
    snapshotMD: toRelativePath(relativeBase, snapshotMDPath),
    historyIndexJSON: toRelativePath(relativeBase, artifacts.historyIndexJSON),
    fingerprintsDir: toRelativePath(relativeBase, artifacts.fingerprintsDir),
    fingerprintIndexJSON: toRelativePath(relativeBase, artifacts.fingerprintIndexJSON),
    reasonsDir: toRelativePath(relativeBase, artifacts.reasonsDir),
    reasonIndexJSON: toRelativePath(relativeBase, artifacts.reasonIndexJSON),
  };
  const reasonTrends = summary?.reasonTrends && typeof summary.reasonTrends === "object"
    ? {
      ...summary.reasonTrends,
      archive: {
        present: true,
        reasonsDir: toRelativePath(relativeBase, artifacts.reasonsDir),
        reasonIndexJSON: toRelativePath(relativeBase, artifacts.reasonIndexJSON),
      },
    }
    : {
      present: false,
      totalReasonKinds: 0,
      topReasons: [],
      archive: {
        present: true,
        reasonsDir: toRelativePath(relativeBase, artifacts.reasonsDir),
        reasonIndexJSON: toRelativePath(relativeBase, artifacts.reasonIndexJSON),
      },
    };
  const persistedSummary = {
    ...summary,
    archive,
    reasonTrends,
  };
  const historyIndex = await readJSONIfExists(artifacts.historyIndexJSON);
  const existingSnapshots = Array.isArray(historyIndex?.snapshots)
    ? historyIndex.snapshots
    : [];
  const snapshotEntry = {
    snapshotId,
    generatedAt: persistedSummary.generatedAt || null,
    totalEntries: persistedSummary.totalEntries ?? 0,
    successCount: persistedSummary.successCount ?? 0,
    failureCount: persistedSummary.failureCount ?? 0,
    uniqueFingerprintCount: persistedSummary.uniqueFingerprintCount ?? 0,
    direction: persistedSummary.trend?.direction || "baseline",
    directionLabel: persistedSummary.trend?.directionLabel || "基线",
    currentFingerprint: persistedSummary.currentIncident?.fingerprint || null,
  };
  const snapshots = [
    snapshotEntry,
    ...existingSnapshots.filter((item) => String(item?.snapshotId || "") !== snapshotId),
  ].slice(0, 120);
  const fingerprintEntries = (Array.isArray(persistedSummary.fingerprints) ? persistedSummary.fingerprints : [])
    .slice(0, 20)
    .map((item, index) => {
      const fileName = `${String(index + 1).padStart(2, "0")}-${sanitizeFingerprintSegment(item.fingerprint, `fingerprint-${index + 1}`)}.json`;
      return {
        ...item,
        fileName,
        relativePath: toRelativePath(relativeBase, path.join(artifacts.fingerprintsDir, fileName)),
      };
    });
  const fingerprintIndex = {
    generatedAt: persistedSummary.generatedAt || null,
    snapshotId,
    total: fingerprintEntries.length,
    entries: fingerprintEntries.map((item) => ({
      fingerprint: item.fingerprint,
      featureLabel: item.featureLabel,
      count: item.count,
      successRate: item.successRate,
      lastSeenAt: item.lastSeenAt,
      latestOutcomeLabel: item.latestOutcomeLabel || null,
      latestStrategyLabel: item.latestStrategyLabel || null,
      direction: item.trend?.direction || "baseline",
      directionLabel: item.trend?.directionLabel || "基线",
      contexts: item.contexts,
      preferredStrategy: item.preferredStrategy,
      path: item.relativePath,
    })),
  };
  const reasonEntries = (Array.isArray(persistedSummary.reasonTrends?.topReasons) ? persistedSummary.reasonTrends.topReasons : [])
    .slice(0, 20)
    .map((item, index) => {
      const fileName = `${String(index + 1).padStart(2, "0")}-${sanitizeFingerprintSegment(item.reason, `reason-${index + 1}`)}.json`;
      return {
        ...item,
        fileName,
        relativePath: toRelativePath(relativeBase, path.join(artifacts.reasonsDir, fileName)),
      };
    });
  const reasonIndex = {
    generatedAt: persistedSummary.generatedAt || null,
    snapshotId,
    total: reasonEntries.length,
    entries: reasonEntries.map((item) => ({
      reason: item.reason,
      label: item.label,
      count: item.count,
      successRate: item.successRate,
      lastSeenAt: item.lastSeenAt,
      direction: item.trend?.direction || "baseline",
      directionLabel: item.trend?.directionLabel || "基线",
      path: item.relativePath,
    })),
  };
  const markdown = buildAgentMemoryMarkdown(persistedSummary);

  await fs.mkdir(artifacts.artifactsDir, { recursive: true });
  await fs.mkdir(artifacts.archiveDir, { recursive: true });
  await fs.mkdir(artifacts.snapshotsDir, { recursive: true });
  await fs.mkdir(artifacts.fingerprintsDir, { recursive: true });
  await fs.mkdir(artifacts.reasonsDir, { recursive: true });

  await Promise.all([
    fs.writeFile(artifacts.reportJSON, `${JSON.stringify(persistedSummary, null, 2)}\n`, "utf-8"),
    fs.writeFile(artifacts.reportMD, `${markdown}\n`, "utf-8"),
    fs.writeFile(artifacts.latestJSON, `${JSON.stringify(persistedSummary, null, 2)}\n`, "utf-8"),
    fs.writeFile(artifacts.latestMD, `${markdown}\n`, "utf-8"),
    fs.writeFile(snapshotJSONPath, `${JSON.stringify(persistedSummary, null, 2)}\n`, "utf-8"),
    fs.writeFile(snapshotMDPath, `${markdown}\n`, "utf-8"),
    fs.writeFile(artifacts.historyIndexJSON, `${JSON.stringify({ generatedAt: persistedSummary.generatedAt || null, snapshots }, null, 2)}\n`, "utf-8"),
    fs.writeFile(artifacts.fingerprintIndexJSON, `${JSON.stringify(fingerprintIndex, null, 2)}\n`, "utf-8"),
    fs.writeFile(artifacts.reasonIndexJSON, `${JSON.stringify(reasonIndex, null, 2)}\n`, "utf-8"),
  ]);

  await Promise.all(
    [
      ...fingerprintEntries.map((item) => fs.writeFile(
        path.join(artifacts.fingerprintsDir, item.fileName),
        `${JSON.stringify({
          generatedAt: persistedSummary.generatedAt || null,
          snapshotId,
          fingerprint: item.fingerprint,
          featureLabel: item.featureLabel,
          count: item.count,
          successCount: item.successCount,
          failureCount: item.failureCount,
          successRate: item.successRate,
          lastSeenAt: item.lastSeenAt,
          candidateFiles: item.candidateFiles,
          draftOperations: item.draftOperations,
          recentReasons: item.recentReasons,
          contexts: item.contexts,
          trend: item.trend,
          latestOutcomeLabel: item.latestOutcomeLabel || null,
          latestStrategyLabel: item.latestStrategyLabel || null,
          recentHistory: item.recentHistory,
          preferredStrategy: item.preferredStrategy,
          strategies: item.strategies,
        }, null, 2)}\n`,
        "utf-8",
      )),
      ...reasonEntries.map((item) => fs.writeFile(
        path.join(artifacts.reasonsDir, item.fileName),
        `${JSON.stringify({
          generatedAt: persistedSummary.generatedAt || null,
          snapshotId,
          reason: item.reason,
          label: item.label,
          count: item.count,
          successCount: item.successCount,
          failureCount: item.failureCount,
          successRate: item.successRate,
          lastSeenAt: item.lastSeenAt,
          uniqueFingerprintCount: item.uniqueFingerprintCount,
          featureLabels: item.featureLabels,
          candidateFiles: item.candidateFiles,
          trend: item.trend,
          latestOutcomeLabel: item.latestOutcomeLabel || null,
          latestStrategyLabel: item.latestStrategyLabel || null,
          recentHistory: item.recentHistory,
        }, null, 2)}\n`,
        "utf-8",
      )),
    ],
  );

  return persistedSummary;
}
