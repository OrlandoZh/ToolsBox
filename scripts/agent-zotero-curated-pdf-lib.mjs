import path from "node:path";
import {
  assertPlainObject,
  createScriptError,
} from "./script-runtime-lib.mjs";

export const CURATED_PDF_SCENARIO_FILE_PATTERN = "curated-pdf";
export const CURATED_PDF_DEFAULT_SCENARIO_NAMES = Object.freeze([
  "curated pdf corpus import smoke",
  "curated pdf scan ocr smoke",
  "curated pdf permission edge smoke",
]);
export const CURATED_PDF_REQUIRED_GROUP_IDS = Object.freeze([
  "core-text-smoke",
  "scan-ocr",
  "permission-edge",
]);

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeMatchValue(value) {
  return normalizeString(value)
    .replaceAll("\\", "/")
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function buildFlexibleMatcher(pattern) {
  const normalizedPattern = normalizeString(pattern);
  if (!normalizedPattern) {
    return () => true;
  }

  const candidatePattern = normalizeMatchValue(normalizedPattern);
  const usesGlob = candidatePattern.includes("*") || candidatePattern.includes("?");

  if (!usesGlob) {
    return (value) => normalizeMatchValue(value).includes(candidatePattern);
  }

  const regex = new RegExp(
    `^${escapeRegExp(candidatePattern)
      .replaceAll("*", ".*")
      .replaceAll("?", ".")}$`,
    "i",
  );
  return (value) => regex.test(normalizeMatchValue(value));
}

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeString(value))
      .filter(Boolean),
  ));
}

function mapScenarioResult(result) {
  const details = result?.details && typeof result.details === "object"
    ? result.details
    : {};
  return {
    name: normalizeString(result?.name),
    status: normalizeString(result?.status) || "unknown",
    fixtureStatus: normalizeString(details.fixtureStatus) || null,
    durationMs: Number(result?.durationMs || 0),
    groupID: normalizeString(details.groupID) || null,
    entryID: normalizeString(details.entryID) || null,
    attachmentID: Number.isFinite(details.attachmentID) ? details.attachmentID : null,
    parentItemID: Number.isFinite(details.parentItemID) ? details.parentItemID : null,
  };
}

function pickStatusLabel(status) {
  switch (normalizeString(status)) {
    case "passed":
      return "通过";
    case "unavailable":
      return "夹具缺失";
    case "failed":
      return "失败";
    default:
      return "未知";
  }
}

export function getDefaultCuratedPdfManifestPath(projectRoot) {
  return path.join(projectRoot, "dist", "pdf-test-corpus-curated.balanced.json");
}

export function summarizeCuratedPdfManifest(manifest, options = {}) {
  const normalizedManifest = assertPlainObject(manifest, "curated manifest", {
    failedStage: "validate-curated-manifest",
  });
  if (!Array.isArray(normalizedManifest.groups)) {
    throw createScriptError("validation", "Curated PDF manifest must contain groups[]", {
      failedStage: "validate-curated-manifest",
    });
  }

  const groupIDs = normalizedManifest.groups.map((group, index) => {
    const groupID = normalizeString(group?.id);
    return groupID || `group-${index + 1}`;
  });
  const missingRequiredGroups = CURATED_PDF_REQUIRED_GROUP_IDS.filter((groupID) => !groupIDs.includes(groupID));
  if (missingRequiredGroups.length > 0) {
    throw createScriptError("validation", `Curated PDF manifest is missing required groups: ${missingRequiredGroups.join(", ")}`, {
      failedStage: "validate-curated-manifest",
      details: {
        missingRequiredGroups,
      },
    });
  }

  const entryCount = normalizedManifest.groups.reduce((count, group) => (
    count + (Array.isArray(group?.entries) ? group.entries.length : 0)
  ), 0);
  const laneCounts = normalizedManifest?.summary?.laneCounts && typeof normalizedManifest.summary.laneCounts === "object"
    ? { ...normalizedManifest.summary.laneCounts }
    : {};

  return {
    manifestPath: normalizeString(options.manifestPath) || null,
    sourceRoot: normalizeString(normalizedManifest.sourceRoot) || null,
    profile: normalizeString(normalizedManifest.profile) || null,
    groupCount: groupIDs.length,
    entryCount,
    groupIDs,
    laneCounts,
  };
}

export function summarizeCuratedPdfScenarioResults(scenarioReport, options = {}) {
  const normalizedReport = assertPlainObject(scenarioReport, "scenario report", {
    failedStage: "summarize-curated-scenarios",
  });
  const matcher = buildFlexibleMatcher(options.scenarioPattern);
  const expectedScenarioNames = uniqueStrings(
    (Array.isArray(options.expectedScenarioNames) && options.expectedScenarioNames.length > 0
      ? options.expectedScenarioNames
      : CURATED_PDF_DEFAULT_SCENARIO_NAMES)
      .filter((name) => matcher(name)),
  );
  const results = (Array.isArray(normalizedReport.results) ? normalizedReport.results : [])
    .map((result) => mapScenarioResult(result))
    .filter((result) => result.name && matcher(result.name));

  const observedScenarioNames = results.map((result) => result.name);
  const importedScenarioNames = results
    .filter((result) => result.fixtureStatus === "imported")
    .map((result) => result.name);
  const unavailableScenarioNames = results
    .filter((result) => result.fixtureStatus === "unavailable")
    .map((result) => result.name);
  const failedScenarioNames = results
    .filter((result) => result.status === "failed")
    .map((result) => result.name);
  const missingScenarioNames = expectedScenarioNames.filter((name) => !observedScenarioNames.includes(name));
  const unexpectedScenarioNames = observedScenarioNames.filter((name) => !expectedScenarioNames.includes(name));

  let status = "passed";
  let summary = `已导入并验证 ${importedScenarioNames.length}/${expectedScenarioNames.length} 条 curated PDF 场景。`;
  if (failedScenarioNames.length > 0 || Number(normalizedReport.failed || 0) > 0) {
    status = "failed";
    summary = `存在 ${failedScenarioNames.length || normalizedReport.failed || 0} 条 curated PDF 场景失败。`;
  }
  else if (unavailableScenarioNames.length > 0) {
    status = "unavailable";
    summary = `当前 curated PDF 夹具不可用：${unavailableScenarioNames.join("、") || "未命名场景"}。`;
  }
  else if (missingScenarioNames.length > 0) {
    status = "failed";
    summary = `缺少预期的 curated PDF 场景结果：${missingScenarioNames.join("、")}。`;
  }
  else if (unexpectedScenarioNames.length > 0) {
    status = "failed";
    summary = `出现未预期的 curated PDF 场景结果：${unexpectedScenarioNames.join("、")}。`;
  }

  return {
    status,
    statusLabel: pickStatusLabel(status),
    summary,
    expectedScenarioNames,
    observedScenarioNames,
    importedScenarioNames,
    unavailableScenarioNames,
    failedScenarioNames,
    missingScenarioNames,
    unexpectedScenarioNames,
    results,
  };
}

export function buildCuratedPdfMarkdown(report) {
  const manifest = report?.manifestSummary && typeof report.manifestSummary === "object"
    ? report.manifestSummary
    : {};
  const summary = report?.scenarioSummary && typeof report.scenarioSummary === "object"
    ? report.scenarioSummary
    : {};
  const results = Array.isArray(summary.results) ? summary.results : [];

  const lines = [
    "# Curated PDF Dev-Only Validation",
    "",
    `- 状态: \`${summary.statusLabel || pickStatusLabel(report?.status)}\``,
    `- 摘要: ${summary.summary || "-"}`,
    `- Manifest: \`${report?.manifestPath || manifest.manifestPath || "-"}\``,
    `- Source Root: \`${manifest.sourceRoot || "-"}\``,
    `- Group Count: \`${manifest.groupCount ?? 0}\``,
    `- Entry Count: \`${manifest.entryCount ?? 0}\``,
    `- Scenario File Filter: \`${report?.scenarioFilePattern || CURATED_PDF_SCENARIO_FILE_PATTERN}\``,
    `- Scenario Name Filter: \`${report?.scenarioPattern || "-"}\``,
    `- Scenario Report: \`${report?.scenarioReportPath || "-"}\``,
  ];

  if (Array.isArray(summary.importedScenarioNames) && summary.importedScenarioNames.length > 0) {
    lines.push(`- Imported Scenarios: ${summary.importedScenarioNames.join("、")}`);
  }
  if (Array.isArray(summary.unavailableScenarioNames) && summary.unavailableScenarioNames.length > 0) {
    lines.push(`- Unavailable Scenarios: ${summary.unavailableScenarioNames.join("、")}`);
  }
  if (Array.isArray(summary.failedScenarioNames) && summary.failedScenarioNames.length > 0) {
    lines.push(`- Failed Scenarios: ${summary.failedScenarioNames.join("、")}`);
  }
  if (Array.isArray(summary.missingScenarioNames) && summary.missingScenarioNames.length > 0) {
    lines.push(`- Missing Scenarios: ${summary.missingScenarioNames.join("、")}`);
  }

  lines.push("", "## Results", "");
  if (results.length === 0) {
    lines.push("- No curated PDF scenarios were observed.");
  }
  else {
    results.forEach((result) => {
      lines.push(`- ${result.name}: \`${result.status}\` / fixture \`${result.fixtureStatus || "-"}\` / group \`${result.groupID || "-"}\` / entry \`${result.entryID || "-"}\``);
    });
  }

  if (report?.errorCategory) {
    lines.push("", "## Error", "");
    lines.push(`- 类别: \`${report.errorCategoryLabel || report.errorCategory}\``);
    lines.push(`- 阶段: \`${report.failedStage || "-"}\``);
    lines.push(`- 信息: ${report.errorMessage || "-"}`);
  }

  return `${lines.join("\n")}\n`;
}
