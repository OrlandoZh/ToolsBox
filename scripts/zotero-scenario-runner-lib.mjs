import { promises as fs } from "node:fs";
import path from "node:path";
import {
  findFilesRecursive,
  formatProcessLogTail,
  toFileHref,
} from "./zotero-runner-lib.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
} from "./script-runtime-lib.mjs";

function parseChromeEvalResult(rawResult) {
  if (typeof rawResult === "string") {
    return JSON.parse(rawResult);
  }
  return rawResult;
}

function normalizePattern(pattern) {
  const normalized = String(pattern || "").trim();
  return normalized || null;
}

function normalizeNameList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeMatchValue(value))
      .filter(Boolean),
  ));
}

function normalizeMatchValue(value) {
  return String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function buildFlexibleMatcher(pattern) {
  const normalizedPattern = normalizePattern(pattern);
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

function toRelativeScenarioPath(projectRoot, filePath) {
  return path.relative(projectRoot, filePath).replaceAll(path.sep, "/");
}

function toScenarioFileEntry(projectRoot, filePath) {
  return {
    filePath,
    relativePath: toRelativeScenarioPath(projectRoot, filePath),
    baseName: path.basename(filePath),
    href: toFileHref(filePath),
  };
}

function createEmptyProcessLogSummary() {
  return {
    total: 0,
    errorCount: 0,
    warnCount: 0,
    infoCount: 0,
    errorBoundaryHitCount: 0,
    errorBoundaryEvents: [],
    recentErrors: [],
    recentWarnings: [],
  };
}

export async function discoverZoteroScenarios(projectRoot) {
  const scenarioRoot = path.join(projectRoot, "zotero-scenarios");
  return await findFilesRecursive(
    scenarioRoot,
    (filePath) => filePath.endsWith(".scenario.js"),
  );
}

export function filterScenarioFiles({
  projectRoot,
  scenarioFiles,
  scenarioFilePattern = null,
}) {
  const entries = (Array.isArray(scenarioFiles) ? scenarioFiles : [])
    .map((filePath) => toScenarioFileEntry(projectRoot, filePath));
  const matcher = buildFlexibleMatcher(scenarioFilePattern);
  const selected = entries.filter((entry) => (
    matcher(entry.relativePath) || matcher(entry.baseName)
  ));

  return {
    pattern: normalizePattern(scenarioFilePattern),
    entries,
    selected,
  };
}

export function filterRegisteredScenarios({
  registeredScenarios,
  scenarioPattern = null,
  excludeScenarioNames = [],
}) {
  const matcher = buildFlexibleMatcher(scenarioPattern);
  const entries = Array.isArray(registeredScenarios) ? registeredScenarios : [];
  const excludedNames = new Set(normalizeNameList(excludeScenarioNames));
  const selected = entries.filter((entry) => (
    matcher(entry?.name)
    && !excludedNames.has(normalizeMatchValue(entry?.name))
  ));
  return {
    pattern: normalizePattern(scenarioPattern),
    entries,
    selected,
    excludedNames: Array.from(excludedNames),
  };
}

function buildMinimalAddonConfig(config) {
  const normalizedConfig = config && typeof config === "object" ? config : {};
  return JSON.parse(JSON.stringify(normalizedConfig));
}

function resolveCuratedPdfManifestRuntimePath(projectRoot) {
  const override = String(process.env.CLEANROOM_PDF_TEST_CORPUS_MANIFEST_PATH || "").trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(projectRoot, "dist", "pdf-test-corpus-curated.balanced.json");
}

function mapRegisteredScenarios(projectRoot, payload, fileEntries) {
  const hrefToRelativePath = new Map(fileEntries.map((entry) => [entry.href, entry.relativePath]));
  const registeredScenarios = Array.isArray(payload?.registeredScenarios)
    ? payload.registeredScenarios
    : [];

  return registeredScenarios.map((entry) => ({
    name: String(entry?.name || "").trim(),
    sourceFileHref: String(entry?.sourceFileHref || "").trim() || null,
    sourceFile: hrefToRelativePath.get(String(entry?.sourceFileHref || "").trim()) || null,
  }));
}

function extractTimeoutKind(error) {
  const explicitKind = String(error?.details?.kind || error?.kind || "").trim();
  if (explicitKind) {
    return explicitKind;
  }
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("timed out")) {
    return "chrome-evaluation-timeout";
  }
  return null;
}

function createSyntheticScenarioFailure({
  scenarioName,
  error,
}) {
  const failureInfo = buildScriptFailureInfo(error);
  const timeoutKind = extractTimeoutKind(error);
  return {
    name: scenarioName,
    status: "failed",
    durationMs: 0,
    synthetic: true,
    error: {
      message: failureInfo.errorMessage,
      stack: String(error?.stack || "").trim(),
      kind: timeoutKind || "scenario-execution-failed",
      phase: String(error?.details?.phase || "runner").trim() || "runner",
      step: String(error?.details?.step || "evaluateInChrome").trim() || "evaluateInChrome",
      scenarioName,
    },
  };
}

function buildExecutionSnapshot({
  registeredScenarios,
  selectedScenarios,
  completedScenarios,
  incomplete,
  lastStartedScenario,
  lastCompletedScenario,
  timeoutKind,
  filtersApplied,
}) {
  return {
    registered: registeredScenarios.map((entry) => entry.name),
    selected: selectedScenarios.map((entry) => entry.name),
    completed: completedScenarios.map((entry) => entry.name),
    incomplete,
    lastStartedScenario,
    lastCompletedScenario,
    timeoutKind: timeoutKind || null,
    filtersApplied,
  };
}

export async function initializeScenarioRegistry({
  projectRoot,
  rdp,
  config,
  scenarioFilePattern = null,
  scenarioRuntimeOptions = null,
}) {
  const scenarioFiles = await discoverZoteroScenarios(projectRoot);
  if (scenarioFiles.length === 0) {
    throw createScriptError(
      "environment",
      "No Zotero scenarios found under zotero-scenarios/*.scenario.js",
      {
        failedStage: "discover-scenarios",
      },
    );
  }

  const fileSelection = filterScenarioFiles({
    projectRoot,
    scenarioFiles,
    scenarioFilePattern,
  });
  if (fileSelection.selected.length === 0) {
    throw createScriptError(
      "validation",
      "No Zotero scenarios matched the current --scenario-file filter",
      {
        failedStage: "select-scenario-files",
        details: {
          scenarioFilePattern: normalizePattern(scenarioFilePattern),
        },
      },
    );
  }

  const harnessHref = toFileHref(path.join(projectRoot, "scripts", "zotero-scenario-runtime.js"));
  const runtimeAddonConfig = {
    ...config,
    cleanroomProjectRootPath: projectRoot,
    cleanroomScenarioOptions: scenarioRuntimeOptions && typeof scenarioRuntimeOptions === "object"
      ? JSON.parse(JSON.stringify(scenarioRuntimeOptions))
      : {},
    cleanroomPdfTestCorpus: {
      defaultManifestPath: resolveCuratedPdfManifestRuntimePath(projectRoot),
    },
  };
  const expression = `(async () => {
    Services.scriptloader.loadSubScript(${JSON.stringify(harnessHref)}, globalThis);
    return await globalThis.loadCleanroomZoteroScenarios(${JSON.stringify({
      fileHrefs: fileSelection.selected.map((entry) => entry.href),
      addonConfig: buildMinimalAddonConfig(runtimeAddonConfig),
    })});
  })()`;
  const rawResult = await rdp.evaluateInChrome(expression, {
    label: "scenario:load-registry",
    timeoutMs: 15000,
  });
  const payload = parseChromeEvalResult(rawResult);
  const registeredScenarios = mapRegisteredScenarios(projectRoot, payload, fileSelection.selected)
    .filter((entry) => entry.name);

  return {
    harnessHref,
    fileSelection,
    registeredScenarios,
  };
}

export async function runIntegratedScenarios({
  projectRoot,
  rdp,
  config,
  scenarioPattern = null,
  scenarioFilePattern = null,
  scenarioRuntimeOptions = null,
  excludeScenarioNames = [],
  listOnly = false,
  modeLabel = "zotero:scenario",
  processLogs = [],
}) {
  const registry = await initializeScenarioRegistry({
    projectRoot,
    rdp,
    config,
    scenarioFilePattern,
    scenarioRuntimeOptions,
  });
  const scenarioSelection = filterRegisteredScenarios({
    registeredScenarios: registry.registeredScenarios,
    scenarioPattern,
    excludeScenarioNames,
  });

  if (scenarioSelection.selected.length === 0) {
    throw createScriptError(
      "validation",
      "No Zotero scenarios matched the current filters",
      {
        failedStage: "select-scenarios",
        details: {
          scenarioPattern: normalizePattern(scenarioPattern),
          scenarioFilePattern: registry.fileSelection.pattern,
        },
      },
    );
  }

  const filtersApplied = {
    scenario: scenarioSelection.pattern,
    scenarioFile: registry.fileSelection.pattern,
    listOnly: listOnly === true,
    excludeScenarioNames: scenarioSelection.excludedNames,
  };
  const completedScenarios = [];
  const results = [];
  let incomplete = false;
  let timeoutKind = null;
  let lastStartedScenario = null;
  let lastCompletedScenario = null;
  let failure = null;

  if (!listOnly) {
    for (const scenario of scenarioSelection.selected) {
      lastStartedScenario = scenario.name;
      try {
        const expression = `(async () => {
          return await globalThis.runCleanroomZoteroScenarioByName(${JSON.stringify({
            name: scenario.name,
            selectedScenarioNames: scenarioSelection.selected.map((entry) => entry.name),
          })});
        })()`;
        const rawResult = await rdp.evaluateInChrome(expression, {
          label: `scenario:${scenario.name}`,
          timeoutMs: 15000,
        });
        const payload = parseChromeEvalResult(rawResult);
        const result = payload?.result && typeof payload.result === "object"
          ? payload.result
          : payload;
        results.push(result);
        completedScenarios.push(scenario);
        lastCompletedScenario = scenario.name;
      }
      catch (error) {
        incomplete = true;
        timeoutKind = extractTimeoutKind(error);
        const failureInfo = buildScriptFailureInfo(error);
        failure = {
          ...failureInfo,
          details: {
            ...(failureInfo.details || {}),
            mode: modeLabel,
            currentScenario: scenario.name,
            completedCount: completedScenarios.length,
            processLogTail: formatProcessLogTail(processLogs, 12),
          },
        };
        results.push(createSyntheticScenarioFailure({
          scenarioName: scenario.name,
          error,
        }));
        break;
      }
    }
  }

  const execution = buildExecutionSnapshot({
    registeredScenarios: registry.registeredScenarios,
    selectedScenarios: scenarioSelection.selected,
    completedScenarios,
    incomplete,
    lastStartedScenario,
    lastCompletedScenario,
    timeoutKind,
    filtersApplied,
  });
  const failedResults = results.filter((entry) => entry?.status === "failed");

  return {
    total: scenarioSelection.selected.length,
    passed: results.filter((entry) => entry?.status === "passed").length,
    failed: failedResults.length,
    skipped: Math.max(0, scenarioSelection.selected.length - results.length),
    results,
    failedResults,
    listedOnly: listOnly === true,
    skippedExecution: listOnly === true,
    registeredScenarios: registry.registeredScenarios,
    selectedScenarios: scenarioSelection.selected,
    execution,
    failure,
    processLogSummary: incomplete ? createEmptyProcessLogSummary() : null,
  };
}

export function printScenarioResults(result) {
  if (result?.listedOnly) {
    console.log("[zotero:scenario] Registered scenarios");
    for (const item of result.selectedScenarios || []) {
      const source = item?.sourceFile ? ` (${item.sourceFile})` : "";
      console.log(`[zotero:scenario] LIST ${item.name}${source}`);
    }
    console.log(`[zotero:scenario] Summary: listed ${result.selectedScenarios?.length || 0} scenario(s)`);
    return;
  }

  console.log("[zotero:scenario] Results");
  for (const item of result.results || []) {
    const prefix = item.status === "passed" ? "PASS" : "FAIL";
    console.log(`[zotero:scenario] ${prefix} ${item.name} (${item.durationMs}ms)`);
    if (item.status === "failed" && item.error) {
      console.log(`[zotero:scenario]   ${item.error.message}`);
      if (item.error.kind) {
        console.log(`[zotero:scenario]   kind=${item.error.kind}`);
      }
    }
  }
  console.log(
    `[zotero:scenario] Summary: ${result.passed}/${result.total} passed, ${result.failed} failed, ${result.skipped || 0} skipped`,
  );
  if (result.execution?.incomplete) {
    console.log(
      `[zotero:scenario] Incomplete after ${result.execution.lastStartedScenario || "-"} (${result.execution.timeoutKind || "runner-failure"})`,
    );
  }
}

export function buildScenarioLastRunMarkdown(report) {
  const lines = [
    "# Zotero Scenario Last Run",
    "",
    `- Generated At: \`${report.generatedAt || "-"}\``,
    `- Listed Only: \`${report.listedOnly ? "yes" : "no"}\``,
    `- Registered: \`${Array.isArray(report.registered) ? report.registered.length : 0}\``,
    `- Selected: \`${Array.isArray(report.selected) ? report.selected.length : 0}\``,
    `- Completed: \`${Array.isArray(report.completed) ? report.completed.length : 0}\``,
    `- Result Total: \`${Number(report.total || 0)}\``,
    `- Passed/Failed/Skipped: \`${Number(report.passed || 0)}/${Number(report.failed || 0)}/${Number(report.skipped || 0)}\``,
    `- Incomplete: \`${report.incomplete ? "yes" : "no"}\``,
    `- Last Started Scenario: \`${report.lastStartedScenario || "-"}\``,
    `- Last Completed Scenario: \`${report.lastCompletedScenario || "-"}\``,
    `- Timeout Kind: \`${report.timeoutKind || "-"}\``,
    "",
    "## Filters Applied",
    "",
    `- \`--scenario\`: \`${report.filtersApplied?.scenario || "-"}\``,
    `- \`--scenario-file\`: \`${report.filtersApplied?.scenarioFile || "-"}\``,
    "",
    "## Selected Scenarios",
    "",
  ];

  const selectedScenarios = Array.isArray(report.selectedScenarios) ? report.selectedScenarios : [];
  if (selectedScenarios.length === 0) {
    lines.push("- None");
  }
  else {
    selectedScenarios.forEach((entry) => {
      lines.push(`- \`${entry.name}\`${entry.sourceFile ? ` -> \`${entry.sourceFile}\`` : ""}`);
    });
  }

  lines.push("", "## Selected Results", "");
  const selectedResults = Array.isArray(report.results) ? report.results : [];
  if (selectedResults.length === 0) {
    lines.push("- None");
  }
  else {
    selectedResults.forEach((entry) => {
      lines.push(`- \`${entry.name}\`: \`${entry.status || "-"}\` (${Number(entry.durationMs || 0)}ms)`);
    });
  }

  lines.push("", "## Failed Results", "");
  const failedResults = Array.isArray(report.failedResults) ? report.failedResults : [];
  if (failedResults.length === 0) {
    lines.push("- None");
  }
  else {
    failedResults.forEach((entry) => {
      lines.push(`- \`${entry.name}\`: ${entry.error?.kind || "failed"} / ${entry.error?.message || "-"}`);
    });
  }

  if (report.failure) {
    lines.push("", "## Runner Failure", "");
    lines.push(`- Category: \`${report.failure.errorCategory || "-"}\``);
    lines.push(`- Stage: \`${report.failure.failedStage || "-"}\``);
    lines.push(`- Message: ${report.failure.errorMessage || "-"}`);
    const processLogTail = Array.isArray(report.failure?.details?.processLogTail)
      ? report.failure.details.processLogTail
      : [];
    lines.push("", "### Process Log Tail", "");
    if (processLogTail.length === 0) {
      lines.push("- None");
    }
    else {
      processLogTail.forEach((entry) => {
        lines.push(`- [${entry.at || "-"}] \`${entry.source || "unknown"}\`: ${entry.message || "-"}`);
      });
    }
  }

  return lines.join("\n");
}

export async function writeScenarioLastRunArtifacts({
  projectRoot,
  report,
}) {
  const distDir = path.join(projectRoot, "dist");
  const jsonPath = path.join(distDir, "zotero-scenario-last-run.json");
  const markdownPath = path.join(distDir, "zotero-scenario-last-run.md");
  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  await fs.writeFile(markdownPath, `${buildScenarioLastRunMarkdown(report)}\n`, "utf-8");
  return {
    jsonPath,
    markdownPath,
  };
}
