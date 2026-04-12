import {
  deriveCycleDiagnoses,
  pickPrimaryDiagnosis,
} from "./agent-zotero-diagnosis-lib.mjs";
import { summarizeCapabilityCoverage } from "./agent-capability-lib.mjs";
import {
  READER_EVENT_KNOWN_TYPES,
  READER_EVENT_PROBE_COMPATIBLE_TYPES,
} from "../src/features/reader.js";
import {
  buildVisualPrimaryBlockerSummary,
  pickVisualCaptureFailureKindLabel,
  pickVisualCaptureSelectionReasonLabel,
  summarizeE2EReport,
} from "./agent-zotero-validation-lib.mjs";

const READER_HOOK_SCENARIO_NAME = "reader event hook diagnostics";
const ERROR_BOUNDARY_EVENT_PATTERNS = Object.freeze([
  "plugin.start.failed",
  "plugin.shutdown.failed",
  "cleanroom.bootstrap.startup.failed",
  "cleanroom.bootstrap.shutdown.failed",
  "cleanroom.bootstrap.startup.cleanup.failed",
]);

function toStringSafe(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  }
  catch {
    return String(value);
  }
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

function toMarkdownLink(filePath) {
  if (!filePath) {
    return "-";
  }
  const label = String(filePath).split("/").pop() || filePath;
  return `[${label}](${filePath})`;
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

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatMaybePercent(value) {
  return Number.isFinite(Number(value))
    ? formatPercent(Number(value))
    : "-";
}

function formatMaybeNumber(value, digits = 2) {
  return Number.isFinite(Number(value))
    ? Number(value).toFixed(digits)
    : "-";
}

function normalizeFiniteNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function formatBooleanLabel(value) {
  if (value === true) {
    return "是";
  }
  if (value === false) {
    return "否";
  }
  return "待补证";
}

function formatListSummary(values) {
  const list = (Array.isArray(values) ? values : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return list.length > 0 ? list.join("；") : "-";
}

export async function ensureLibraryVisualStageReady(options = {}) {
  const normalizeNumber = (value) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  };
  const normalizeTimeout = (value, fallbackMs) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0
      ? normalized
      : fallbackMs;
  };
  const normalizeStringArray = (value) => {
    if (!Array.isArray(value)) {
      return [];
    }
    return Array.from(new Set(
      value
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean),
    )).sort((left, right) => left.localeCompare(right));
  };
  const runOptionalStepWithTimeout = async (label, handler, timeoutMs) => {
    let timeoutID = null;
    try {
      const value = await Promise.race([
        Promise.resolve().then(() => handler()),
        new Promise((_, reject) => {
          timeoutID = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
      return {
        ok: true,
        value,
        timedOut: false,
        error: null,
      };
    }
    catch (error) {
      const message = error?.message || String(error);
      return {
        ok: false,
        value: false,
        timedOut: /\btimed out\b/i.test(message),
        error: message,
      };
    }
    finally {
      if (timeoutID !== null) {
        clearTimeout(timeoutID);
      }
    }
  };
  const runRequiredStepWithTimeout = async (label, handler, timeoutMs) => {
    const result = await runOptionalStepWithTimeout(label, handler, timeoutMs);
    if (result.ok) {
      return result.value;
    }
    throw new Error(result.error || `${label} failed`);
  };

  const itemID = normalizeNumber(options.itemID);
  if (itemID === null) {
    throw new Error("ensureLibraryVisualStageReady requires a finite itemID");
  }
  if (typeof options.waitForViews !== "function") {
    throw new Error("ensureLibraryVisualStageReady requires waitForViews");
  }
  if (typeof options.selectItem !== "function") {
    throw new Error("ensureLibraryVisualStageReady requires selectItem");
  }
  if (typeof options.waitForSelection !== "function") {
    throw new Error("ensureLibraryVisualStageReady requires waitForSelection");
  }

  const libraryID = normalizeNumber(options.libraryID);
  const preparation = {
    itemID,
    libraryID,
    viewsReady: false,
    libraryRootSelected: null,
    itemsViewLoaded: null,
    itemsViewLoadTimedOut: null,
    itemsViewLoadError: null,
    selectionMatched: false,
    selectionSingleItem: false,
    selectedTabID: null,
    windowTitle: null,
    suppressedBannerIDs: [],
    retainedBannerIDs: [],
    visibleBannerIDs: [],
    stabilizeHostSurfaceError: null,
    libraryRootSelectTimedOut: null,
    libraryRootSelectError: null,
  };

  await options.waitForViews();
  preparation.viewsReady = true;

  if (typeof options.stabilizeHostSurface === "function") {
    const hostSurface = await runOptionalStepWithTimeout(
      "stabilizeHostSurface",
      options.stabilizeHostSurface,
      normalizeTimeout(options.stabilizeHostSurfaceTimeoutMs, 3000),
    );
    if (hostSurface.ok) {
      preparation.suppressedBannerIDs = normalizeStringArray(hostSurface.value?.suppressedBannerIDs);
      preparation.retainedBannerIDs = normalizeStringArray(hostSurface.value?.retainedBannerIDs);
      preparation.visibleBannerIDs = normalizeStringArray(hostSurface.value?.visibleBannerIDs);
    }
    else {
      preparation.stabilizeHostSurfaceError = hostSurface.error;
    }
  }

  if (libraryID !== null && typeof options.selectLibrary === "function") {
    const librarySelection = await runOptionalStepWithTimeout(
      "selectLibrary",
      async () => await options.selectLibrary(libraryID),
      normalizeTimeout(options.selectLibraryTimeoutMs, 5000),
    );
    preparation.libraryRootSelected = librarySelection.ok
      ? librarySelection.value !== false
      : false;
    preparation.libraryRootSelectTimedOut = librarySelection.timedOut;
    preparation.libraryRootSelectError = librarySelection.error;
  }

  if (typeof options.waitForItemsLoad === "function") {
    const itemsViewLoad = await runOptionalStepWithTimeout(
      "waitForItemsLoad",
      options.waitForItemsLoad,
      normalizeTimeout(options.waitForItemsLoadTimeoutMs, 5000),
    );
    preparation.itemsViewLoaded = itemsViewLoad.ok
      ? itemsViewLoad.value !== false
      : false;
    preparation.itemsViewLoadTimedOut = itemsViewLoad.timedOut;
    preparation.itemsViewLoadError = itemsViewLoad.error;
  }

  await runRequiredStepWithTimeout(
    "selectItem",
    async () => await options.selectItem(itemID),
    normalizeTimeout(options.selectItemTimeoutMs, 5000),
  );
  const selectionResult = await runRequiredStepWithTimeout(
    "waitForSelection",
    async () => await options.waitForSelection(itemID),
    normalizeTimeout(options.waitForSelectionTimeoutMs, 5000),
  );
  const selectedIDs = Array.isArray(selectionResult?.selectedIDs)
    ? selectionResult.selectedIDs
      .map((entry) => normalizeNumber(entry))
      .filter((entry) => entry !== null)
    : [];
  const selection = {
    itemID,
    selectedIDs,
    selectedCount: normalizeNumber(selectionResult?.selectedCount) ?? selectedIDs.length,
  };
  preparation.selectionMatched = selectedIDs.includes(itemID);
  preparation.selectionSingleItem = selectedIDs.length === 1 && selectedIDs[0] === itemID;

  if (typeof options.waitForPaint === "function") {
    await runOptionalStepWithTimeout(
      "waitForPaint",
      options.waitForPaint,
      normalizeTimeout(options.waitForPaintTimeoutMs, 2000),
    );
  }

  if (typeof options.readSelectedTabID === "function") {
    const selectedTabID = options.readSelectedTabID();
    preparation.selectedTabID = selectedTabID === null || selectedTabID === undefined
      ? null
      : String(selectedTabID);
  }

  if (typeof options.readWindowTitle === "function") {
    const windowTitle = options.readWindowTitle();
    preparation.windowTitle = windowTitle === null || windowTitle === undefined
      ? null
      : String(windowTitle);
  }

  const summary = typeof options.inspectItem === "function"
    ? await runOptionalStepWithTimeout(
      "inspectItem",
      async () => await options.inspectItem(itemID),
      normalizeTimeout(options.inspectItemTimeoutMs, 3000),
    )
    : null;
  const resolvedSummary = summary?.ok ? summary.value : null;

  return {
    itemID,
    libraryID,
    summary: resolvedSummary,
    selection,
    preparation,
    settleSnapshot: {
      stage: "library",
      itemID: resolvedSummary?.itemID ?? itemID,
      title: resolvedSummary?.title ?? null,
      summary: resolvedSummary?.summary ?? null,
      columnValue: resolvedSummary?.columnValue ?? null,
      selectedCount: selection.selectedCount,
      selectedIDs: selection.selectedIDs,
      visibleBannerIDs: preparation.visibleBannerIDs,
    },
  };
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

function formatProcessLogTailEntry(entry) {
  const message = String(entry?.message || "").trim() || "-";
  const source = String(entry?.source || "unknown").trim() || "unknown";
  return `- [${formatDateTime(entry?.at)}] \`${source}\`: ${message}`;
}

function formatAttemptDiagnosisMetrics(metrics) {
  const record = metrics && typeof metrics === "object"
    ? metrics
    : null;
  if (!record) {
    return "-";
  }
  const facts = [
    `sameDimensions=${formatBooleanLabel(record.sameDimensions)}`,
    `changedRatio=${formatMaybePercent(record.changedRatio)}`,
    `meanChannelDiff=${formatMaybeNumber(record.meanChannelDiff)}`,
    `thresholdChangedRatio=${formatMaybePercent(record.thresholdChangedRatio)}`,
    `thresholdMeanChannelDiff=${formatMaybeNumber(record.thresholdMeanChannelDiff)}`,
  ];
  return facts.join(" / ");
}

function findScenarioResult(scenarios, name) {
  const results = Array.isArray(scenarios?.results) ? scenarios.results : [];
  return results.find((item) => String(item?.name || "").trim() === String(name || "").trim()) || null;
}

function collectReaderHostObservedTypes({ checks = {}, readerHookScenario = null, fineGrainedReaderScenario = null } = {}) {
  return Array.from(new Set(
    [
      ...(Array.isArray(checks?.readerEventHostObservedTypes) ? checks.readerEventHostObservedTypes : []),
      readerHookScenario?.details?.firstInvocation?.type,
      ...(Array.isArray(readerHookScenario?.details?.snapshot?.eventListeners)
        ? readerHookScenario.details.snapshot.eventListeners.map((item) => item?.type)
        : []),
      fineGrainedReaderScenario?.details?.toolbarProbe?.type,
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

function buildStaticRuntimeMissingIssue(entry) {
  const file = String(entry?.file || "").trim();
  if (!file) {
    return null;
  }
  const label = String(entry?.label || "").trim();
  if (!label) {
    return `静态运行时基线缺失：${file}。`;
  }
  return `静态运行时基线缺失：${file}（${label}）。`;
}

function buildStaticRuntimeDriftIssue(entry) {
  const file = String(entry?.file || "").trim();
  if (!file) {
    return null;
  }
  const label = String(entry?.label || "").trim();
  if (!label) {
    return `静态运行时基线漂移：${file}。`;
  }
  return `静态运行时基线漂移：${file}（${label}）。`;
}

function encodeIssueSnippet(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n");
}

function collectRecentLogMessages(logSummary) {
  return [
    ...((logSummary?.recentErrors || []).map((entry) => toStringSafe(entry?.message).toLowerCase())),
    ...((logSummary?.recentWarnings || []).map((entry) => toStringSafe(entry?.message).toLowerCase())),
  ];
}

function buildVisualBaselineRemark(visuals) {
  const baseline = visuals?.analysis?.summary?.baseline;
  if (!baseline) {
    return "-";
  }

  if (baseline.updateRequested) {
    const parts = [];
    if (baseline.createdCount > 0) {
      parts.push(`新建 ${baseline.createdCount}`);
    }
    if (baseline.updatedCount > 0) {
      parts.push(`更新 ${baseline.updatedCount}`);
    }
    if (parts.length === 0) {
      parts.push("未写入");
    }
    return `基线刷新：${parts.join("，")}`;
  }

  if (baseline.comparedCount > 0) {
    const parts = [`基线比对 ${baseline.comparedCount}`];
    if (baseline.driftCount > 0) {
      parts.push(`漂移 ${baseline.driftCount}`);
    }
    if (baseline.missingCount > 0) {
      parts.push(`缺失 ${baseline.missingCount}`);
    }
    if (baseline.errorCount > 0) {
      parts.push(`异常 ${baseline.errorCount}`);
    }
    return parts.join("，");
  }

  if (baseline.missingCount > 0) {
    return `基线缺失 ${baseline.missingCount}，已跳过`;
  }

  if (baseline.errorCount > 0) {
    return `基线异常 ${baseline.errorCount}`;
  }

  return "-";
}

function buildVisualDriftRemark(visuals) {
  const baselines = Array.isArray(visuals?.analysis?.baselines) ? visuals.analysis.baselines : [];
  const drifted = baselines.filter((entry) => entry?.status === "compared" && entry.ok === false);
  if (drifted.length === 0) {
    return null;
  }

  const parts = drifted.slice(0, 2).map((entry) => {
    const ratio = entry?.metrics ? formatPercent(entry.metrics.changedRatio) : "-";
    const mean = entry?.metrics ? Number(entry.metrics.meanChannelDiff || 0).toFixed(2) : "-";
    return `${entry.kind} 漂移 ${ratio} / ${mean}`;
  });
  return parts.join("; ");
}

function isFailingVisualBaseline(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const status = String(entry.status || "").trim();
  return status === "missing"
    || status === "error"
    || (status === "compared" && entry.ok !== true);
}

function collectBlockingVisualIssues(visuals) {
  const analysisIssues = Array.isArray(visuals?.analysis?.issues)
    ? visuals.analysis.issues
    : [];
  if (analysisIssues.length === 0) {
    return [];
  }

  const baselines = Array.isArray(visuals?.analysis?.baselines)
    ? visuals.analysis.baselines
    : [];
  const surfaceLocalBaselines = baselines.filter((entry) => String(entry?.scope || "").trim() === "surface-local");
  if (surfaceLocalBaselines.length === 0) {
    return analysisIssues;
  }

  if (surfaceLocalBaselines.some((entry) => isFailingVisualBaseline(entry))) {
    return analysisIssues;
  }

  const nonSurfaceLocalFailures = baselines.filter((entry) => {
    return String(entry?.scope || "").trim() !== "surface-local" && isFailingVisualBaseline(entry);
  });
  if (nonSurfaceLocalFailures.length > 0) {
    return [];
  }

  return analysisIssues;
}

function buildVisualCaptureStabilityRemark(visuals) {
  const stages = Array.isArray(visuals?.captureStability?.stages)
    ? visuals.captureStability.stages
    : [];
  if (stages.length === 0) {
    return null;
  }

  const parts = stages.slice(0, 2).map((entry) => {
    if (entry?.failureKind) {
      const attemptCount = Number(entry?.attemptCount || 0);
      return `${entry?.kind || "visual"} 失败 ${attemptCount} 次（${pickVisualCaptureFailureKindLabel(entry.failureKind)}）`;
    }
    const stableText = entry?.stable === true ? "稳定" : "待稳";
    const attemptCount = Number(entry?.attemptCount || 0);
    const reasonText = pickVisualCaptureSelectionReasonLabel(entry?.selectionReason);
    return `${entry?.kind || "visual"} ${stableText} ${attemptCount} 次（${reasonText}）`;
  });
  return `采集稳定性 ${parts.join("；")}`;
}

function classifyLog(entry) {
  const level = String(entry?.level || "").toLowerCase();
  const source = String(entry?.source || "").toLowerCase();
  const message = toStringSafe(entry?.message).toLowerCase();
  if (level === "error" || message.includes("[cleanroom:error]")) {
    return "error";
  }
  if (source.startsWith("zotero.")) {
    const looksPluginRelated = (
      message.includes("cleanroom")
      || message.includes("bootstrapplugin")
      || message.includes("instancekey")
      || message.includes("addon")
    );
    if (looksPluginRelated && (message.includes("error") || message.includes("failed"))) {
      return "error";
    }
    if (
      message.includes("[warn")
      || message.includes("warning")
      || message.includes("javascript error:")
      || message.includes("missing chrome or resource url")
      || message.includes("failed to load resource://")
    ) {
      return "warn";
    }
    return "info";
  }
  if (level === "warn" || message.includes("[cleanroom:warn]")) {
    return "warn";
  }
  return "info";
}

function detectErrorBoundaryEvent(message) {
  const normalizedMessage = toStringSafe(message).toLowerCase();
  return ERROR_BOUNDARY_EVENT_PATTERNS.find((pattern) => normalizedMessage.includes(pattern)) || null;
}

export function summarizeLogs(entries = []) {
  const logs = Array.isArray(entries) ? entries : [];
  const summary = {
    total: logs.length,
    errorCount: 0,
    warnCount: 0,
    infoCount: 0,
    errorBoundaryHitCount: 0,
    errorBoundaryEvents: [],
    recentErrors: [],
    recentWarnings: [],
  };
  const boundaryMap = new Map();

  for (const entry of logs) {
    const type = classifyLog(entry);
    const row = {
      at: entry?.at || null,
      source: entry?.source || "unknown",
      level: entry?.level || "unknown",
      message: toStringSafe(entry?.message || ""),
    };

    if (type === "error") {
      summary.errorCount += 1;
      const boundaryEvent = detectErrorBoundaryEvent(row.message);
      if (boundaryEvent) {
        summary.errorBoundaryHitCount += 1;
        boundaryMap.set(boundaryEvent, (boundaryMap.get(boundaryEvent) || 0) + 1);
      }
      if (summary.recentErrors.length < 6) {
        summary.recentErrors.push(row);
      }
      continue;
    }
    if (type === "warn") {
      summary.warnCount += 1;
      if (summary.recentWarnings.length < 6) {
        summary.recentWarnings.push(row);
      }
      continue;
    }
    summary.infoCount += 1;
  }

  summary.errorBoundaryEvents = Array.from(boundaryMap.entries())
    .map(([event, count]) => ({ event, count }))
    .sort((left, right) => right.count - left.count || left.event.localeCompare(right.event));

  return summary;
}

export function deriveFixHints({ issues = [], logSummary = null }) {
  const hints = [];
  const issueText = issues.join("\n").toLowerCase();

  if (issueText.includes("plugin") || issueText.includes("instancekey")) {
    hints.push("检查 `config/addon.config.json` 的 `addonId`、`instanceKey` 与构建产物是否一致。");
  }
  if (issueText.includes("runprimaryaction")) {
    hints.push("检查插件 `enabled` 偏好是否为 true，且主窗口 Tools 菜单可访问。");
  }
  if (issueText.includes("主命令未注册到命令面板")) {
    hints.push("优先核对 `src/app/feature-composer.js` 中 `*-primary-action` 的 command palette 注册块是否仍保留在 baseline 注册链中。");
  }
  if (issueText.includes("主窗口上下文菜单项未注册")) {
    hints.push("优先核对 `src/app/feature-composer.js` 中 `menuManager.registerItemMenuItem(...)` 是否仍位于官方菜单 API 分支内。");
  }
  if (issueText.includes("偏好设置面板未注册")) {
    hints.push("优先核对 `src/app/feature-composer.js` 中 `preferencePanes.registerPane(...)` 是否仍在 baseline 注册阶段执行，并确认 `content/preferences.xhtml` 仍可访问。");
  }
  if (issueText.includes("disabled 状态") || issueText.includes("插件当前已禁用")) {
    hints.push("先使用 fresh profile 复验；如果 fresh 环境仍为 disabled，再检查 `config/addon.config.json` 中的 `defaultPrefs.enabled`。");
  }
  if (issueText.includes("addon-static/bootstrap.js")) {
    hints.push("若 Node 侧静态体检已指向 `addon-static/bootstrap.js` 缺失，优先恢复模板 bootstrap 基线文件，再重新执行 E2E 复验。");
  }
  if (issueText.includes("静态运行时基线漂移：addon-static/bootstrap.js")) {
    hints.push("若 `addon-static/bootstrap.js` 已存在但内容偏离 clean-room 基线，优先使用模板 canonical baseline 回写，再重新执行 E2E 复验。");
  }
  if (issueText.includes("l10nid 漂移") || issueText.includes("本地化引用漂移")) {
    hints.push("优先核对 `src/app/feature-composer.js` 中 ItemPane 的 `l10nID` 是否仍指向 `cleanroom-item-pane-*` 基线键，避免直接改写业务逻辑。");
  }
  if (issueText.includes("addon-static/content/preferences.xhtml")) {
    hints.push("若静态体检已确认 `addon-static/content/preferences.xhtml` 缺失，优先恢复模板最小偏好设置面板资源文件，再重新执行 E2E 复验。");
  }
  if (issueText.includes("静态运行时基线漂移：addon-static/content/preferences.xhtml")) {
    hints.push("若 `addon-static/content/preferences.xhtml` 已存在但内容偏离模板基线，优先回写 clean-room canonical baseline，再重新执行 E2E 复验。");
  }
  if (issueText.includes("addon-static/content/style/main.css")) {
    hints.push("若静态体检已确认 `addon-static/content/style/main.css` 缺失，优先恢复模板最小主窗口样式文件，再重新执行 E2E 复验。");
  }
  if (issueText.includes("静态运行时基线漂移：addon-static/content/style/main.css")) {
    hints.push("若 `addon-static/content/style/main.css` 已存在但内容偏离模板基线，优先回写 clean-room canonical baseline，再重新执行 E2E 复验。");
  }
  if (issueText.includes("addon-static/content/icons/")) {
    hints.push("若静态体检已指向 icon 资源缺失，先核对 `config/addon.config.json > icons` 的声明，再补回对应 `addon-static/content/icons/*` 文件。");
  }
  if (issueText.includes("静态运行时基线漂移：addon-static/content/icons/")) {
    hints.push("若静态体检已指向 icon 资源漂移，先确认 `config/addon.config.json > icons` 仍指向模板基线路径，再仅回写对应 clean-room baseline icon。");
  }
  if (issueText.includes("缺少 ftl key")) {
    hints.push("优先核对 `addon-static/locale/<locale>/main.ftl` 是否缺失基线 key，并只补回单条缺失映射，不要重写整份 locale 文件。");
  }
  if (issueText.includes("main.ftl") && issueText.includes("不存在")) {
    hints.push("若目标 locale 的 `main.ftl` 整体缺失，优先恢复模板最小基线文件，再重新检查 key 缺失与 value 漂移。");
  }
  if (issueText.includes("ftl key") && issueText.includes("值漂移")) {
    hints.push("优先核对 `addon-static/locale/<locale>/main.ftl` 中对应 key 的值是否偏离模板基线，并只替换该 key 的定义块。");
  }
  if (issueText.includes("ftl key") && issueText.includes("结构漂移")) {
    hints.push("优先将 `addon-static/locale/<locale>/main.ftl` 中对应 key 恢复为模板 canonical block，不要重写整份 locale 文件。");
  }
  if (issueText.includes("reader 摘要命令未注册")) {
    hints.push("优先核对 `src/app/feature-composer.js` 中 `*-reader-summary` 的 command palette 注册是否仍保留在 baseline 注册链中。");
  }
  if (issueText.includes("reader view 菜单项未注册")) {
    hints.push("优先核对 `src/app/feature-composer.js` 中 `menuManager.registerReaderMenubarViewMenuItem(...)` 是否仍位于官方菜单 API 分支内。");
  }
  if (issueText.includes("reader 官方事件监听注册异常")) {
    hints.push("优先核对 `src/features/reader.js` 中 `registerEventListener()` / `unregisterEventListener()` 是否仍把官方 listener 正确桥接到 Zotero.Reader。");
  }
  if (issueText.includes("reader renderToolbar 宿主桥接未恢复") || issueText.includes("reader renderToolbar 宿主点未观测")) {
    hints.push("优先核对 `src/features/reader.js` 中 `registerEventListener()`、`supportsSyntheticFallback()` 与 `dispatchSyntheticEvent()` 是否仍覆盖 `renderToolbar` 的宿主桥接链。");
  }
  if (issueText.includes("reader 事件桥缺少 synthetic-fallback 映射")) {
    hints.push("优先核对 `src/features/reader.js` 中 `READER_EVENT_SYNTHETIC_FALLBACK_TYPES` 与 `dispatchSyntheticEvent()` 的类型映射是否仍完整。");
  }
  if (
    issueText.includes("reader 事件桥已知类型声明缺口")
    || issueText.includes("reader 事件桥 probe 声明缺口")
  ) {
    hints.push("优先核对 `src/features/reader.js` 中 `READER_EVENT_KNOWN_TYPES` 与 `READER_EVENT_PROBE_COMPATIBLE_TYPES` 是否仍覆盖模板基线事件类型。");
  }
  if (issueText.includes("test")) {
    hints.push("先执行 `npm run zotero:test` 定位失败用例，再回到 `agent:zotero:e2e` 复验。");
  }
  if (issueText.includes("服务健康") || issueText.includes("service")) {
    hints.push("检查插件服务层状态：确认 service registry 已启动，并查看 selfCheck 中的 service 状态摘要。");
  }
  if (issueText.includes("像素漂移") || issueText.includes("平均通道差异")) {
    hints.push("如果当前 UI 改动是预期行为，执行 `npm run agent:zotero:e2e:update-baseline` 刷新视觉基线后再复验。");
  }

  const errorMessages = (logSummary?.recentErrors || [])
    .map((entry) => toStringSafe(entry.message).toLowerCase())
    .join("\n");

  if (errorMessages.includes("timed out waiting for plugin readiness")) {
    hints.push("启动链路超时：检查 bootstrap 生命周期是否完整执行，以及 RDP 端口连通性。");
  }
  if (errorMessages.includes("missing-bootstrap-plugin")) {
    hints.push("缺少 `bootstrapPlugin`：检查构建产物 `content/scripts/<addonRef>.js` 是否包含入口导出。");
  }
  if (errorMessages.includes("addons.init")) {
    hints.push("Add-on 初始化异常：检查 Zotero profile 中的扩展加载状态与代理安装文件。");
  }
  if (
    issueText.includes("偏好设置面板未注册")
    && (
      errorMessages.includes("preferences.xhtml")
      || errorMessages.includes("missing chrome or resource url")
      || errorMessages.includes("failed to load resource://")
    )
  ) {
    hints.push("若 recent error 指向 `preferences.xhtml` 资源缺失，优先恢复 `addon-static/content/preferences.xhtml` 的模板最小基线文件，再重新执行 E2E 复验。");
  }
  if (
    errorMessages.includes("content/style/main.css")
    && (
      errorMessages.includes("missing chrome or resource url")
      || errorMessages.includes("failed to load resource://")
    )
  ) {
    hints.push("若 recent error 指向 `content/style/main.css` 资源缺失，优先恢复 `addon-static/content/style/main.css` 的模板最小基线文件，再重新执行 E2E 复验。");
  }

  if (hints.length === 0) {
    hints.push("当前未命中特定故障模式，建议先查看 `dist/agent-zotero-e2e.json` 的 cycle 详情。");
  }

  return Array.from(new Set(hints));
}

export function evaluateCycle(cycle) {
  const issues = [];
  const checks = cycle?.checks || {};
  const tests = cycle?.tests || null;
  const scenarios = cycle?.scenarios || null;
  const visuals = cycle?.visuals || null;
  const logSummary = cycle?.logs || summarizeLogs([]);
  const recentLogMessages = collectRecentLogMessages(logSummary);
  const staticRuntimeMissingEntries = Array.isArray(checks.staticRuntimeMissingEntries)
    ? checks.staticRuntimeMissingEntries
    : [];
  const staticRuntimeDriftEntries = Array.isArray(checks.staticRuntimeDriftEntries)
    ? checks.staticRuntimeDriftEntries
    : [];

  if (staticRuntimeMissingEntries.length > 0) {
    staticRuntimeMissingEntries.forEach((entry) => {
      const issue = buildStaticRuntimeMissingIssue(entry);
      if (issue) {
        issues.push(issue);
      }
    });
  }
  else if (Number(checks.staticRuntimeMissingCount || 0) > 0 || checks.staticRuntimeOK === false) {
    issues.push("静态运行时基线存在缺失文件。");
  }
  staticRuntimeDriftEntries.forEach((entry) => {
    const file = String(entry?.file || "").trim();
    if (!file) {
      return;
    }

    const related = (
      (file === "addon-static/bootstrap.js" && (!checks.pluginMounted || !checks.apiMounted))
      || (
        file === "addon-static/content/preferences.xhtml"
        && (
          checks.preferencePaneRegistered === false
          || recentLogMessages.some((message) => (
            message.includes("preferences.xhtml")
          ))
        )
      )
      || (
        file === "addon-static/content/style/main.css"
        && recentLogMessages.some((message) => (
          message.includes("content/style/main.css")
          || message.includes("main.css")
        ))
      )
      || file.startsWith("addon-static/content/icons/")
    );
    if (!related) {
      return;
    }

    const issue = buildStaticRuntimeDriftIssue(entry);
    if (issue) {
      issues.push(issue);
    }
  });
  if (!checks.pluginMounted) {
    issues.push("插件实例未挂载到 Zotero[instanceKey]。");
  }
  if (!checks.apiMounted) {
    issues.push("插件 API 未挂载。");
  }
  if (checks.pluginMounted && checks.apiMounted && checks.enabled === false) {
    issues.push("插件当前为 disabled 状态。");
  }
  if (checks.pluginMounted && checks.apiMounted && checks.primaryActionCommandRegistered === false) {
    issues.push("主命令未注册到命令面板。");
  }
  if (
    checks.pluginMounted
    && checks.apiMounted
    && checks.officialMenuAPIAvailable === true
    && checks.contextActionMenuRegistered === false
  ) {
    issues.push("主窗口上下文菜单项未注册。");
  }
  if (checks.pluginMounted && checks.apiMounted && checks.preferencePaneRegistered === false) {
    issues.push("偏好设置面板未注册。");
  }
  if (checks.primaryActionResult !== true) {
    issues.push("runPrimaryAction 执行结果不是 true。");
  }
  if (checks.agentActionResult !== true) {
    issues.push("runAgentAction 执行结果不是 true。");
  }
  if (Number(checks.itemPaneSections || 0) < 1) {
    issues.push("ItemPane Section 未注册。");
  }
  if (Number(checks.itemPaneInfoRows || 0) < 1) {
    issues.push("ItemPane InfoRow 未注册。");
  }
  const itemPaneL10nDrifts = Array.isArray(checks.itemPaneL10nDrifts) ? checks.itemPaneL10nDrifts : [];
  if (itemPaneL10nDrifts.length > 0) {
    itemPaneL10nDrifts.forEach((drift) => {
      const kind = String(drift?.kind || "").trim().toLowerCase();
      const expected = String(drift?.expected || "").trim();
      const actual = String(drift?.actual || "").trim();
      if (!expected || !actual) {
        return;
      }

      if (kind === "info-row-label") {
        issues.push(`ItemPane InfoRow l10nID 漂移：期望 ${expected}，实际 ${actual}。`);
        return;
      }
      if (kind === "section-header") {
        issues.push(`ItemPane Section Header l10nID 漂移：期望 ${expected}，实际 ${actual}。`);
        return;
      }
      if (kind === "section-sidenav") {
        issues.push(`ItemPane Section Sidenav l10nID 漂移：期望 ${expected}，实际 ${actual}。`);
        return;
      }

      issues.push(`ItemPane 本地化引用漂移：期望 ${expected}，实际 ${actual}。`);
    });
  }
  else if (Number(checks.itemPaneL10nDriftCount || 0) > 0 || checks.itemPaneL10nOK === false) {
    issues.push("ItemPane 存在未展开的本地化引用漂移。");
  }
  const localeFTLMissingEntries = Array.isArray(checks.localeFTLMissingEntries) ? checks.localeFTLMissingEntries : [];
  if (localeFTLMissingEntries.length > 0) {
    localeFTLMissingEntries.forEach((entry) => {
      const locale = String(entry?.locale || "").trim();
      const key = String(entry?.key || "").trim();
      const file = String(entry?.file || "").trim();
      const reason = String(entry?.reason || "").trim();
      if (!locale || !key) {
        return;
      }
      if (reason === "file-missing" && file) {
        issues.push(`Locale ${locale} 缺少 FTL key ${key}（文件 ${file} 不存在）。`);
        return;
      }
      issues.push(`Locale ${locale} 缺少 FTL key ${key}。`);
    });
  }
  else if (Number(checks.localeFTLMissingCount || 0) > 0) {
    issues.push("Locale FTL 存在未展开的缺失 key。");
  }
  const localeFTLValueDriftEntries = Array.isArray(checks.localeFTLValueDriftEntries) ? checks.localeFTLValueDriftEntries : [];
  if (localeFTLValueDriftEntries.length > 0) {
    localeFTLValueDriftEntries.forEach((entry) => {
      const locale = String(entry?.locale || "").trim();
      const key = String(entry?.key || "").trim();
      const expectedValue = String(entry?.expectedValue || "").trim();
      const actualValue = String(entry?.actualValue || "").trim();
      if (!locale || !key || !expectedValue || !actualValue) {
        return;
      }
      const actualLine = String(entry?.actualLine || "").trim();
      const actualLineSuffix = actualLine
        ? ` 实际定义片段 [${encodeIssueSnippet(actualLine)}]。`
        : "";
      issues.push(`Locale ${locale} FTL key ${key} 值漂移：期望 ${expectedValue}，实际 ${actualValue}。${actualLineSuffix}`);
    });
  }
  else if (Number(checks.localeFTLValueDriftCount || 0) > 0) {
    issues.push("Locale FTL 存在未展开的值漂移。");
  }
  const localeFTLStructureDriftEntries = Array.isArray(checks.localeFTLStructureDriftEntries) ? checks.localeFTLStructureDriftEntries : [];
  if (localeFTLStructureDriftEntries.length > 0) {
    localeFTLStructureDriftEntries.forEach((entry) => {
      const locale = String(entry?.locale || "").trim();
      const key = String(entry?.key || "").trim();
      const expectedLine = String(entry?.expectedLine || "").trim();
      const actualLine = String(entry?.actualLine || "").trim();
      if (!locale || !key || !expectedLine || !actualLine) {
        return;
      }
      issues.push(
        `Locale ${locale} FTL key ${key} 结构漂移：期望定义片段 [${encodeIssueSnippet(expectedLine)}]，实际定义片段 [${encodeIssueSnippet(actualLine)}]。`,
      );
    });
  }
  else if (Number(checks.localeFTLStructureDriftCount || 0) > 0) {
    issues.push("Locale FTL 存在未展开的结构漂移。");
  }
  if (Number(checks.itemTreeColumns || 0) < 1) {
    issues.push("ItemTree 自定义列未注册。");
  }
  if (Number(checks.notifierActiveCount || 0) < 1) {
    issues.push("Notifier 未激活。");
  }
  if (checks.pluginMounted && checks.apiMounted && checks.readerSummaryCommandRegistered === false) {
    issues.push("Reader 摘要命令未注册。");
  }
  if (
    checks.pluginMounted
    && checks.apiMounted
    && checks.officialMenuAPIAvailable === true
    && checks.readerSummaryMenuRegistered === false
  ) {
    issues.push("Reader View 菜单项未注册。");
  }
  const readerHookScenario = findScenarioResult(scenarios, READER_HOOK_SCENARIO_NAME);
  const fineGrainedReaderScenario = findScenarioResult(scenarios, "reader fine-grained hook diagnostics");
  const readerHostObservedTypes = collectReaderHostObservedTypes({
    checks,
    readerHookScenario,
    fineGrainedReaderScenario,
  });
  const toolbarObservationObserved = (
    Object.prototype.hasOwnProperty.call(checks, "readerEventToolbarHookObserved")
    || readerHostObservedTypes.length > 0
  );
  const toolbarHookObserved = checks.readerEventToolbarHookObserved === true
    || readerHostObservedTypes.includes("renderToolbar");
  if (
    checks.pluginMounted
    && checks.apiMounted
    && checks.readerEventAPIAvailable === true
    && readerHookScenario
    && readerHookScenario.status !== "passed"
  ) {
    issues.push("Reader 官方事件监听注册异常。");
  }
  if (
    checks.pluginMounted
    && checks.apiMounted
    && checks.readerEventAPIAvailable === true
    && toolbarObservationObserved
    && toolbarHookObserved === false
  ) {
    issues.push(toolbarHookObserved ? "Reader renderToolbar 宿主桥接未恢复。" : "Reader renderToolbar 宿主点未观测。");
  }
  if (
    checks.pluginMounted
    && checks.apiMounted
    && checks.readerEventAPIAvailable === true
    && Number(checks.readerEventKnownTypeCount || 0) > 0
    && Number(checks.readerEventKnownTypeCount || 0) < READER_EVENT_KNOWN_TYPES.length
  ) {
    issues.push(`Reader 事件桥已知类型声明缺口：期望至少 ${READER_EVENT_KNOWN_TYPES.length}，实际 ${Number(checks.readerEventKnownTypeCount || 0)}。`);
  }
  if (
    checks.pluginMounted
    && checks.apiMounted
    && checks.readerEventAPIAvailable === true
    && Number(checks.readerEventProbeTypeCount || 0) > 0
    && Number(checks.readerEventProbeTypeCount || 0) < READER_EVENT_PROBE_COMPATIBLE_TYPES.length
  ) {
    issues.push(`Reader 事件桥 probe 声明缺口：期望至少 ${READER_EVENT_PROBE_COMPATIBLE_TYPES.length}，实际 ${Number(checks.readerEventProbeTypeCount || 0)}。`);
  }
  if (
    checks.pluginMounted
    && checks.apiMounted
    && checks.readerEventAPIAvailable === true
    && Number(checks.readerEventProbeTypeCount || 0) > 0
    && checks.readerEventSyntheticFallbackAvailable === false
  ) {
    issues.push("Reader 事件桥缺少 synthetic-fallback 映射。");
  }
  if (checks.serviceHealthOK === false || Number(checks.serviceUnhealthyCount || 0) > 0) {
    issues.push(`服务健康异常：共 ${Number(checks.serviceTotal || 0)} 个服务，异常 ${Number(checks.serviceUnhealthyCount || 0)} 个。`);
  }
  if (tests && Number(tests.failed || 0) > 0) {
    issues.push(`Zotero 集成测试失败 ${tests.failed} 项。`);
  }
  if (scenarios && Number(scenarios.failed || 0) > 0) {
    issues.push(`Zotero 场景脚本失败 ${scenarios.failed} 项。`);
  }
  if (scenarios?.execution?.incomplete === true) {
    issues.push(
      `Zotero 场景执行未完成：停止于 ${scenarios.execution.lastStartedScenario || "unknown"}（${scenarios.execution.timeoutKind || "runner-failure"}）。`,
    );
  }
  if (visuals?.attempted && visuals?.analysis?.ok === false) {
    issues.push(...collectBlockingVisualIssues(visuals));
  }
  if (Number(logSummary.errorCount || 0) > 0) {
    issues.push(`检测到 ${logSummary.errorCount} 条 error 级日志。`);
  }

  const diagnoses = deriveCycleDiagnoses({
    cycle,
    issues,
    hints: deriveFixHints({ issues, logSummary }),
    logSummary,
  });

  return {
    passed: issues.length === 0,
    issues,
    hints: deriveFixHints({ issues, logSummary }),
    diagnoses,
    primaryDiagnosis: pickPrimaryDiagnosis(diagnoses),
  };
}

export function buildE2EMarkdown(report) {
  const capabilitySummary = summarizeCapabilityCoverage(report);
  const summary = summarizeE2EReport(report);
  const lines = [
    "# Agent Zotero E2E 闭环报告",
    "",
    `- 生成时间: \`${report.generatedAt}\` (${formatDateTime(report.generatedAt)})`,
    `- 策略: \`${report.strategy}\``,
    `- 视觉基线目录: \`${report.visualBaselineDir || "-"}\``,
    `- 视觉基线模式: \`${report.visualBaselineMode || "compare"}\``,
    `- 轮次: \`${report.cycles.length}\``,
    `- 结果: \`${report.passed ? "通过" : "未通过"}\``,
    "",
    "## 轮次汇总",
    "",
    "| 轮次 | 启动策略 | 状态 | 错误日志 | 警告日志 | 测试失败 | 场景失败 | 备注 |",
    "|---:|---|---|---:|---:|---:|---:|---|",
  ];

  report.cycles.forEach((cycle) => {
    const scenarioRemark = cycle.scenarios?.execution?.incomplete === true
      ? ` / incomplete@${cycle.scenarios.execution.lastStartedScenario || "-"}`
      : "";
    lines.push(
      `| ${cycle.index} | ${escapeMarkdown(cycle.bootMode)} | ${cycle.passed ? "通过" : "未通过"} | ${cycle.logs.errorCount} | ${cycle.logs.warnCount} | ${cycle.tests ? cycle.tests.failed : 0} | ${cycle.scenarios ? cycle.scenarios.failed : 0} | ${escapeMarkdown(`${cycle.summaryNote || "-"}${scenarioRemark}`)} |`,
    );
  });

  lines.push("", "## 问题清单", "");
  if (report.issues.length === 0) {
    lines.push("- 无");
  } else {
    report.issues.forEach((item) => lines.push(`- ${item}`));
  }

  lines.push("", "## 修复建议", "");
  if (report.hints.length === 0) {
    lines.push("- 无");
  } else {
    report.hints.forEach((item) => lines.push(`- ${item}`));
  }

  if (summary.domContractReport?.present) {
    lines.push("", "## DOM Contract", "");
    lines.push(`- 状态: \`${summary.domContractReport.statusLabel || summary.domContractReport.status || "-"}\``);
    lines.push(`- Advisory: \`${summary.domContractReport.advisory ? "yes" : "no"}\``);
    lines.push(`- Route: \`${summary.domContractReport.passedRouteCount ?? 0}/${summary.domContractReport.routeCount ?? 0}\``);
    lines.push(`- 缺失 Route: \`${summary.domContractReport.missingRouteCount ?? 0}\``);
    lines.push(`- 摘要: ${summary.domContractReport.summary || "-"}`);
    const routes = Array.isArray(summary.domContractReport.routes) ? summary.domContractReport.routes : [];
    routes.forEach((route) => {
      lines.push(`- Route ${route.routeId || route.adapter || "-" }: \`${route.statusLabel || route.status || "-"}\` / 场景 ${(route.scenarioNames || []).join("、") || "-"}`);
      lines.push(`- Route 摘要: ${route.summary || "-"}`);
      lines.push(`- 失败检查: ${(route.failedChecks || []).join("；") || "-"}`);
    });
  }

  if (
    summary.toolbarDispatchMode
    || summary.toolbarAppendedItemCount !== null
    || summary.selectionPopupAppendedItemCount !== null
    || summary.sidebarHeaderAppendedItemCount !== null
    || summary.contextMenuProbeCount !== null
    || (summary.contextMenuObservedTypes || []).length > 0
    || (summary.contextMenuSyntheticFallbackTypes || []).length > 0
  ) {
    lines.push("", "## Reader 深层事件点", "");
    lines.push(`- 分发摘要: ${summary.readerDispatchSummary || "-"}`);
    lines.push(`- 工具栏分发: \`${summary.toolbarDispatchMode ?? "-"}\``);
    lines.push(`- 工具栏追加项: \`${summary.toolbarAppendedItemCount ?? "-"}\``);
    lines.push(`- 文本浮层追加项: \`${summary.selectionPopupAppendedItemCount ?? "-"}\``);
    lines.push(`- 侧栏批注头追加项: \`${summary.sidebarHeaderAppendedItemCount ?? "-"}\``);
    lines.push(`- 上下文菜单探针数: \`${summary.contextMenuProbeCount ?? "-"}\``);
    lines.push(`- 上下文菜单摘要: ${summary.contextMenuSummary || "-"}`);
    lines.push(`- 已观测类型: ${(summary.contextMenuObservedTypes || []).join("、") || "-"}`);
    lines.push(`- fallback 类型: ${(summary.contextMenuSyntheticFallbackTypes || []).join("、") || "-"}`);
  }

  if (summary.performanceBudget?.present) {
    lines.push("", "## Dev 性能预算", "");
    lines.push(`- 状态: \`${summary.performanceBudget.statusLabel || summary.performanceBudget.status || "-"}\``);
    lines.push(`- 模式: \`${summary.performanceBudget.budgetMode || "-"}\``);
    lines.push(`- 摘要: ${summary.performanceBudget.summary || "-"}`);
    lines.push(`- 宿主动作: \`${summary.performanceBudget.measuredActivityCount ?? 0}/${summary.performanceBudget.expectedActivityCount ?? 0}\``);
    lines.push(`- 超预算项: \`${summary.performanceBudget.violationCount ?? 0}\``);
    lines.push(`- 预算告警: ${summary.performanceBudget.violationSummary || "-"}`);
  }

  const launchFailure = report?.details?.launchFailure || null;
  const runtimeSanitization = report?.details?.runtimeSanitization || null;
  if (launchFailure) {
    lines.push("", "## 启动诊断", "");
    lines.push(`- 类型: \`${launchFailure.kind || "-"}\``);
    lines.push(`- 摘要: ${buildLaunchFailureSummary(launchFailure) || "-"}`);
    lines.push(`- 尝试次数: \`${launchFailure.attemptCount ?? 0}\``);
    lines.push(`- 建联耗时: \`${launchFailure.connectDurationMs ?? 0}ms\``);
    const childExit = launchFailure.childExit;
    lines.push(
      `- 子进程退出: \`${childExit ? `${childExit.code ?? "null"} / ${childExit.signal || "-"}` : "-"}\``,
    );
    const lastConnectError = launchFailure.lastConnectError;
    lines.push(
      `- 最近建联错误: ${
        lastConnectError
          ? `\`${lastConnectError.code || lastConnectError.name || "error"}\` ${lastConnectError.message || "-"}`
          : "-"
      }`,
    );
    if (runtimeSanitization) {
      lines.push(
        `- Runtime 清理: managed=\`${runtimeSanitization.managed ? "yes" : "no"}\` / fresh=\`${runtimeSanitization.fresh ? "yes" : "no"}\` / profileReset=\`${runtimeSanitization.profileReset ? "yes" : "no"}\` / dataReset=\`${runtimeSanitization.dataReset ? "yes" : "no"}\` / removedMarkers=\`${Array.isArray(runtimeSanitization.removedMarkers) ? runtimeSanitization.removedMarkers.length : 0}\``,
      );
    }
    lines.push("", "### 启动前进程日志尾部", "");
    const processLogTail = Array.isArray(launchFailure.processLogTail) ? launchFailure.processLogTail : [];
    if (processLogTail.length === 0) {
      lines.push("- 无");
    } else {
      processLogTail.forEach((entry) => lines.push(formatProcessLogTailEntry(entry)));
    }
  }

  if (summary.present && (
    summary.visualCaptureStabilityObserved
    || Number(summary.visualGeometryMismatchCount || 0) > 0
    || String(summary.primaryDiagnosis?.fingerprint || "") === "reader-ui:reader-visual-drift"
  )) {
    lines.push("", "## Reader 视觉主阻断", "");
    lines.push(`- 类型: \`${summary.visualPrimaryBlockerKindLabel || summary.visualPrimaryBlockerKind || "-"}\``);
    lines.push(`- 摘要: ${buildVisualPrimaryBlockerSummary(summary) || "-"}`);
    lines.push(`- 几何摘要: ${summary.visualGeometrySummary || "-"}`);
    if (summary.visualCanonicalCoverageSummary || Array.isArray(summary.visualCanonicalMismatchedTargets)) {
      lines.push(`- Canonical 覆盖: ${summary.visualCanonicalCoverageSummary || "-"}`);
      lines.push(`- Canonical 未对齐目标: ${(summary.visualCanonicalMismatchedTargets || []).join("、") || "-"}`);
    }
  }

  lines.push("", "## 能力覆盖", "");
  lines.push(`- 能力地图观测: \`${capabilitySummary.observed ? "是" : "否"}\``);
  lines.push(`- 能力总数: \`${capabilitySummary.total}\``);
  lines.push(`- 需场景覆盖能力: \`${capabilitySummary.scenarioBoundTotal}\``);
  lines.push(`- 已覆盖能力: \`${capabilitySummary.coveredCount}\``);
  lines.push(`- 通过能力: \`${capabilitySummary.passedCount}\``);
  lines.push(`- 失败能力: \`${capabilitySummary.failedCount}\``);
  lines.push(`- 未覆盖能力: \`${capabilitySummary.uncoveredCount}\``);
  if (capabilitySummary.observed) {
    lines.push("");
    lines.push("| 能力 | 状态 | 场景 | 责任文件 |");
    lines.push("|---|---|---|---|");
    capabilitySummary.capabilities
      .filter((item) => item.scenarioNames.length > 0)
      .slice(0, 8)
      .forEach((item) => {
        const statusLabel = item.status === "passed"
          ? "通过"
          : item.status === "failed"
            ? "失败"
            : "未覆盖";
        lines.push(
          `| ${escapeMarkdown(item.label || item.id)} | ${statusLabel} | ${escapeMarkdown(item.scenarioNames.join(", ") || "-")} | ${escapeMarkdown((item.ownedBy || []).slice(0, 2).join(", ") || "-")} |`,
        );
      });
  }

  lines.push("", "## 结构化诊断", "");
  if (!Array.isArray(report.diagnostics) || report.diagnostics.length === 0) {
    lines.push("- 无");
  } else {
    lines.push("| 指纹 | 功能 | 严重度 | 置信度 | 候选文件 | 摘要 |");
    lines.push("|---|---|---|---:|---|---|");
    report.diagnostics.slice(0, 6).forEach((item) => {
      lines.push(
        `| ${escapeMarkdown(item.fingerprint || "-")} | ${escapeMarkdown(item.featureLabel || item.feature || "-")} | ${escapeMarkdown(item.severity || "-")} | ${escapeMarkdown(`${Math.round(Number(item.confidence || 0) * 100)}%`)} | ${escapeMarkdown((item.candidateFiles || []).slice(0, 3).join(", ") || "-")} | ${escapeMarkdown(item.summary || item.issue || "-")} |`,
      );
    });
  }

  lines.push("", "## 最近错误日志", "");
  const recentErrors = report.cycles.flatMap((cycle) => (cycle.logs.recentErrors || []).map((entry) => ({
    cycle: cycle.index,
    ...entry,
  })));
  if (recentErrors.length === 0) {
    lines.push("- 无");
  } else {
    recentErrors.slice(0, 12).forEach((entry) => {
      lines.push(
        `- [Cycle ${entry.cycle}] ${formatDateTime(entry.at)} ${entry.source}/${entry.level}: ${entry.message}`,
      );
    });
  }

  lines.push("", "## 可视化验收", "");
  lines.push("| 轮次 | 库视图截图 | Reader 截图 | 校验 | 备注 |");
  lines.push("|---:|---|---|---|---|");
  report.cycles.forEach((cycle) => {
    const captures = Array.isArray(cycle.visuals?.captures) ? cycle.visuals.captures : [];
    const libraryCapture = captures.find((item) => item.kind === "library");
    const readerCapture = captures.find((item) => item.kind === "reader");
    const visualCheck = cycle.visuals?.attempted === false
      ? "跳过"
      : cycle.visuals?.analysis?.ok === false
        ? "未通过"
        : "通过";
    const detailParts = [];
    const warningText = Array.isArray(cycle.visuals?.warnings) && cycle.visuals.warnings.length > 0
      ? cycle.visuals.warnings.join("; ")
      : "";
    const baselineRemark = buildVisualBaselineRemark(cycle.visuals);
    const driftRemark = buildVisualDriftRemark(cycle.visuals);
    const stabilityRemark = buildVisualCaptureStabilityRemark(cycle.visuals);
    if (warningText) {
      detailParts.push(warningText);
    }
    if (baselineRemark && baselineRemark !== "-") {
      detailParts.push(baselineRemark);
    }
    if (driftRemark) {
      detailParts.push(driftRemark);
    }
    if (stabilityRemark) {
      detailParts.push(stabilityRemark);
    }
    const details = detailParts.length > 0 ? detailParts.join(" | ") : "-";
    lines.push(
      `| ${cycle.index} | ${libraryCapture ? toMarkdownLink(libraryCapture.path) : "-"} | ${readerCapture ? toMarkdownLink(readerCapture.path) : "-"} | ${visualCheck} | ${escapeMarkdown(details)} |`,
    );
  });

  if (summary.visualEvidenceObserved || Array.isArray(summary.visualEvidenceItems)) {
    lines.push("", "## 视觉证据索引", "");
    lines.push(`- 已观测证据项: \`${summary.visualEvidenceItemCount ?? 0}\``);
    lines.push(`- 失败证据项: \`${summary.visualEvidenceFailingItemCount ?? 0}\``);
    lines.push(`- 导航摘要: ${summary.visualEvidenceSummary || "-"}`);
    lines.push("");
    if (!Array.isArray(summary.visualEvidenceItems) || summary.visualEvidenceItems.length === 0) {
      lines.push("- 当前没有需要展开的失败视觉证据条目。", "");
    } else {
      summary.visualEvidenceItems.forEach((item) => {
        lines.push(`### Cycle ${item.cycleIndex ?? "-"} / ${item.bootMode || "-"} / ${item.kind || "visual"} / ${item.canonicalTarget || "-"}`);
        lines.push(`- Capture：${toMarkdownLink(item.capturePath)}`);
        lines.push(`- Baseline：${toMarkdownLink(item.baselinePath)}`);
        lines.push(`- 采集稳定：${formatBooleanLabel(item.captureStable)}`);
        lines.push(`- 已选尝试：${item.selectedAttempt ?? "-"}`);
        const selectionReasonLabel = item.selectionReason
          ? `${pickVisualCaptureSelectionReasonLabel(item.selectionReason)} (${item.selectionReason})`
          : "-";
        lines.push(`- 选取原因：${selectionReasonLabel}`);
        lines.push(`- 几何一致：${formatBooleanLabel(item.geometryMatched)}`);
        lines.push(`- Changed Ratio：${formatMaybePercent(item.changedRatio)}`);
        lines.push(`- Mean Channel Diff：${formatMaybeNumber(item.meanChannelDiff)}`);
        lines.push(`- 问题：${Array.isArray(item.issues) && item.issues.length > 0 ? item.issues.join("；") : "-"}`);
        lines.push("");
      });
    }
  }

  if (summary.visualCaptureAttemptDiagnosisObserved || Array.isArray(summary.visualCaptureAttemptDiagnosisItems)) {
    lines.push("", "## Capture Attempt 诊断", "");
    lines.push(`- 已观测诊断项: \`${summary.visualCaptureAttemptDiagnosisItemCount ?? 0}\``);
    lines.push(`- 诊断摘要: ${summary.visualCaptureAttemptDiagnosisSummary || "-"}`);
    lines.push("");
    if (!Array.isArray(summary.visualCaptureAttemptDiagnosisItems) || summary.visualCaptureAttemptDiagnosisItems.length === 0) {
      lines.push("- 当前没有可展开的 stage attempt 诊断。", "");
    } else {
      summary.visualCaptureAttemptDiagnosisItems.forEach((item) => {
        const selectionReasonLabel = item.selectionReason
          ? `${pickVisualCaptureSelectionReasonLabel(item.selectionReason)} (${item.selectionReason})`
          : "-";
        const failureKindLabel = item.failureKind
          ? `${pickVisualCaptureFailureKindLabel(item.failureKind)} (${item.failureKind})`
          : "-";
        lines.push(`### Cycle ${item.cycleIndex ?? "-"} / ${item.bootMode || "-"} / ${item.kind || "visual"}`);
        lines.push(`- 选取原因：${selectionReasonLabel}`);
        lines.push(`- Stage 失败：${failureKindLabel}`);
        lines.push(`- 失败信息：${item.failureMessage || "-"}`);
        lines.push(`- Bounds 来源：${item.boundsSource || "-"}`);
        lines.push(`- 窗口标题：${item.windowTitle || "-"}`);
        lines.push(`- 命令退出码：${item.commandExitCode ?? "-"}`);
        lines.push(`- Stderr：${item.stderr || "-"}`);
        lines.push(`- 已选尝试 / 总次数：${item.selectedAttempt ?? "-"} / ${item.attemptCount ?? 0}`);
        lines.push(`- Hash 全变：${formatBooleanLabel(item.allHashesUnique)}`);
        lines.push(`- Bounds 固定：${formatBooleanLabel(item.boundsStable)}`);
        lines.push(`- 光栅固定：${formatBooleanLabel(item.rasterSizeStable)}`);
        lines.push(`- Attempt Hashes：${formatListSummary(item.attemptHashes)}`);
        lines.push(`- Attempt Bounds：${formatListSummary(item.attemptBounds)}`);
        lines.push(`- Attempt Raster Sizes：${formatListSummary(item.attemptRasterSizes)}`);
        lines.push(`- Stability Metrics：${formatAttemptDiagnosisMetrics(item.stabilityMetrics)}`);
        lines.push("");
      });
    }
  }

  if (summary.visualPreCaptureSettleObserved || Array.isArray(summary.visualPreCaptureSettleStages)) {
    lines.push("", "## Pre-capture Settle 诊断", "");
    lines.push(`- 已观测 stage: \`${summary.visualPreCaptureSettleStageCount ?? 0}\``);
    lines.push(`- 已达成 stage: \`${summary.visualPreCaptureSettleSettledStageCount ?? 0}\``);
    lines.push(`- 超时 stage: \`${summary.visualPreCaptureSettleTimedOutStageCount ?? 0}\``);
    lines.push(`- 摘要: ${summary.visualPreCaptureSettleSummary || "-"}`);
    lines.push("");
    if (!Array.isArray(summary.visualPreCaptureSettleStages) || summary.visualPreCaptureSettleStages.length === 0) {
      lines.push("- 当前没有可展开的 pre-capture settle 诊断。", "");
    } else {
      summary.visualPreCaptureSettleStages.forEach((item) => {
        lines.push(`### ${item.kind || "visual"}`);
        lines.push(`- 状态：\`${item.settled ? "达成" : (item.timedOut ? "超时" : "待定")}\``);
        lines.push(`- 稳定样本：\`${item.consecutiveStableSamples ?? 0} / ${item.stableSampleTarget ?? 0}\``);
        lines.push(`- 轮询次数：\`${item.pollCount ?? 0}\``);
        lines.push(`- 重置次数：\`${item.resetCount ?? 0}\``);
        lines.push(`- 最终复核：\`${item.verificationMatched === null ? "-" : (item.verificationMatched ? "一致" : "变更")}\``);
        lines.push(`- 快照摘要：${item.snapshotSummary || "-"}`);
        lines.push(`- 诊断摘要：${item.summary || "-"}`);
        lines.push("");
      });
    }
  }

  lines.push("");
  return lines.join("\n");
}
