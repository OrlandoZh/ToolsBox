import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  getOptionalBundle,
  inspectOptionalBundleContracts,
  loadOptionalBundleRegistry,
} from "./optional-bundles-lib.mjs";
import {
  assertNonEmptyString,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
} from "./script-runtime-lib.mjs";
import {
  resolveZoteroWasmKernelArtifacts,
  resolveZoteroWasmKernelScenarioArtifacts,
} from "./zotero-agent-artifacts.mjs";
import {
  DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
  DEFAULT_WASM_KERNEL_SCENARIO_NAME,
} from "./wasm-kernel-performance-report.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

const DEFAULT_BUNDLE_ID = "wasm-kernel";
const STATUS_LABELS = Object.freeze({
  passed: "通过",
  attention: "关注",
  missing: "缺失",
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePathOption(value, rootDir = process.cwd()) {
  const normalized = String(value || "").trim();
  return normalized
    ? path.resolve(rootDir, normalized)
    : null;
}

function statusLabel(status) {
  return STATUS_LABELS[String(status || "").trim()] || STATUS_LABELS.attention;
}

function formatBytes(bytes) {
  const numeric = Math.max(0, Number(bytes || 0));
  if (numeric >= 1024 * 1024) {
    return `${(numeric / (1024 * 1024)).toFixed(2)}MB`;
  }
  if (numeric >= 1024) {
    return `${(numeric / 1024).toFixed(2)}KB`;
  }
  return `${numeric}B`;
}

function createGate(id, label, ok, summary, details = {}) {
  const status = ok ? "passed" : "attention";
  return {
    id,
    label,
    ok: Boolean(ok),
    status,
    statusLabel: statusLabel(status),
    summary: String(summary || "").trim() || null,
    details: clone(details),
  };
}

async function readJSONIfExists(filePath, options = {}) {
  try {
    return await readJSONFile(filePath, {
      missingCategory: "environment",
      invalidCategory: "validation",
      missingStage: options.missingStage || "read-json",
      invalidStage: options.invalidStage || "read-json",
      label: options.label || filePath,
    });
  } catch (error) {
    if (error?.scriptErrorCategory === "environment" && String(error?.message || "").includes("Missing JSON file")) {
      return null;
    }
    throw error;
  }
}

function normalizeEvidenceStatus(report, passingStatuses = ["passed"]) {
  if (!report || typeof report !== "object") {
    return "missing";
  }
  return passingStatuses.includes(String(report.status || "").trim())
    ? "passed"
    : "attention";
}

function pickNumeric(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
  }
  return null;
}

function pickString(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function summarizeScenarioEvidence({
  key,
  label,
  scenarioName,
  smokeReport,
  performanceReport,
  disabledContractReport,
  artifactPaths,
} = {}) {
  const smokeStatus = normalizeEvidenceStatus(smokeReport, ["passed"]);
  const performanceStatus = normalizeEvidenceStatus(performanceReport, ["passed"]);
  const disabledContractStatus = normalizeEvidenceStatus(disabledContractReport, ["passed"]);
  const statuses = [smokeStatus, performanceStatus, disabledContractStatus];
  const scenarioStatus = statuses.every((entry) => entry === "passed")
    ? "passed"
    : statuses.every((entry) => entry === "missing")
      ? "missing"
      : "attention";

  const sourceCombinedBytes = pickNumeric(
    performanceReport?.assets?.source?.combinedBytes,
    smokeReport?.assets?.source?.combinedBytes,
    disabledContractReport?.assets?.source?.combinedBytes,
  ) || 0;
  const buildCombinedBytes = pickNumeric(
    performanceReport?.assets?.build?.combinedBytes,
    smokeReport?.assets?.build?.combinedBytes,
    disabledContractReport?.assets?.build?.combinedBytes,
  ) || 0;
  const mainThreadMedianMs = pickNumeric(
    performanceReport?.transports?.mainThread?.totalDurationMs?.median,
    smokeReport?.metrics?.mainThreadTotalDurationMsMedian,
    disabledContractReport?.performanceSnapshot?.mainThreadMedianMs,
    disabledContractReport?.smokeEvidence?.metrics?.mainThreadTotalDurationMsMedian,
  ) || 0;
  const workerMedianMs = pickNumeric(
    performanceReport?.transports?.worker?.totalDurationMs?.median,
    smokeReport?.metrics?.workerTotalDurationMsMedian,
    disabledContractReport?.performanceSnapshot?.workerMedianMs,
    disabledContractReport?.smokeEvidence?.metrics?.workerTotalDurationMsMedian,
  ) || 0;
  const probeMedianMs = pickNumeric(
    performanceReport?.overall?.probeTotalDurationMs?.median,
    smokeReport?.metrics?.probeTotalDurationMsMedian,
    disabledContractReport?.performanceSnapshot?.probeMedianMs,
    disabledContractReport?.smokeEvidence?.metrics?.probeTotalDurationMsMedian,
  ) || 0;
  const observedRunCount = pickNumeric(
    performanceReport?.observedRunCount,
    smokeReport?.repeats,
  ) || 0;
  const passedRunCount = pickNumeric(
    performanceReport?.passedRunCount,
    smokeReport?.passedRunCount,
  ) || 0;
  const failedRunCount = pickNumeric(
    performanceReport?.failedRunCount,
    smokeReport?.failedRunCount,
  ) || 0;
  const zoteroVersion = pickString(
    performanceReport?.zoteroVersion,
    smokeReport?.zoteroVersion,
  );
  const blockers = [];
  if (smokeStatus !== "passed") {
    blockers.push("smoke");
  }
  if (performanceStatus !== "passed") {
    blockers.push("performance");
  }
  if (disabledContractStatus !== "passed") {
    blockers.push("disabled-contract");
  }

  let summary = `${label} 证据待补齐。`;
  if (scenarioStatus === "passed") {
    summary = `${label} 证据完整：smoke/perf/disabled-contract 均通过，main-thread 中位 ${mainThreadMedianMs}ms，worker 中位 ${workerMedianMs}ms，probe 总时延中位 ${probeMedianMs}ms。`;
  } else if (scenarioStatus === "attention") {
    summary = `${label} 仍有待补项：${blockers.join(" / ")}。`;
  }

  return {
    key,
    label,
    scenarioName,
    status: scenarioStatus,
    statusLabel: statusLabel(scenarioStatus),
    summary,
    evidence: {
      smokeStatus,
      performanceStatus,
      disabledContractStatus,
    },
    blockers,
    zoteroVersion,
    observedRunCount,
    passedRunCount,
    failedRunCount,
    metrics: {
      sourceCombinedBytes,
      buildCombinedBytes,
      mainThreadMedianMs,
      workerMedianMs,
      probeMedianMs,
    },
    artifactPaths: clone(artifactPaths),
    smoke: smokeReport ? {
      status: smokeReport.status || null,
      summary: smokeReport.summary || null,
    } : null,
    performance: performanceReport ? {
      status: performanceReport.status || null,
      artifactSource: performanceReport.artifactSource || null,
      summary: performanceReport.summary || null,
    } : null,
    disabledContract: disabledContractReport ? {
      status: disabledContractReport.status || null,
      summary: disabledContractReport.summary || null,
    } : null,
  };
}

function buildPromotionGate({
  bundle,
  contractInspection,
  scenarios = [],
} = {}) {
  const scenarioList = Array.isArray(scenarios) ? scenarios : [];
  const assetsPresent = scenarioList.every((scenario) => Number(scenario?.metrics?.sourceCombinedBytes || 0) > 0);
  const smokeReady = scenarioList.every((scenario) => scenario?.evidence?.smokeStatus === "passed");
  const disabledReady = scenarioList.every((scenario) => scenario?.evidence?.disabledContractStatus === "passed");
  const validationReady = Boolean(bundle)
    && bundle.enabled === false
    && bundle.implementationStatus === "planned"
    && bundle.lane === "js-core"
    && bundle.validation
    && (contractInspection?.ok === true)
    && bundle.validation.requiredFiles.includes("scripts/wasm-kernel-matrix-report.mjs")
    && bundle.validation.requiredPackageScripts.includes("wasm:kernel:matrix");
  const exportReady = scenarioList.every((scenario) => scenario?.disabledContract?.status === "passed");
  const costQuantified = scenarioList.every((scenario) => (
    scenario?.evidence?.performanceStatus === "passed"
    && Number(scenario?.observedRunCount || 0) >= 3
  ));

  const gates = [
    createGate(
      "real-assets",
      "Real assets",
      assetsPresent,
      assetsPresent
        ? "source/build 资产已在报告中稳定出现。"
        : "仍缺 source/build 资产证据。",
      {
        sourceCombinedBytes: scenarioList.map((scenario) => ({
          key: scenario.key,
          bytes: Number(scenario?.metrics?.sourceCombinedBytes || 0),
        })),
      },
    ),
    createGate(
      "rooturi-smoke",
      "RootURI smoke",
      smokeReady,
      smokeReady
        ? "probe 与 digest 场景均已通过 bundle-local smoke。"
        : "仍需补齐 probe/digest smoke 证据。",
      {
        scenarios: scenarioList.map((scenario) => ({
          key: scenario.key,
          smokeStatus: scenario?.evidence?.smokeStatus || "missing",
          observedRunCount: Number(scenario?.observedRunCount || 0),
        })),
      },
    ),
    createGate(
      "disabled-contract",
      "Disabled contract",
      disabledReady,
      disabledReady
        ? "default-disabled 惰性与隔离契约已通过。"
        : "default-disabled 契约仍需补齐或修复。",
      {
        scenarios: scenarioList.map((scenario) => ({
          key: scenario.key,
          disabledContractStatus: scenario?.evidence?.disabledContractStatus || "missing",
        })),
      },
    ),
    createGate(
      "validation-contract",
      "Validation contract",
      validationReady,
      validationReady
        ? "registry/validation 已把 matrix 入口纳入固定契约。"
        : "registry validation 仍未完整覆盖 matrix 入口或当前 bundle 状态漂移。",
      {
        registryOK: contractInspection?.ok === true,
        bundleEnabled: bundle?.enabled === true,
        implementationStatus: bundle?.implementationStatus || null,
      },
    ),
    createGate(
      "export-contract",
      "Export contract",
      exportReady,
      exportReady
        ? "pure-project export 已能保留当前 Wasm lane 所需脚本与资产。"
        : "pure-project export 证据仍不完整。",
      {
        scenarios: scenarioList.map((scenario) => ({
          key: scenario.key,
          disabledContractStatus: scenario?.evidence?.disabledContractStatus || "missing",
        })),
      },
    ),
    createGate(
      "cost-quantified",
      "Cost quantified",
      costQuantified,
      costQuantified
        ? "probe 与 digest 均已有重复成本量化。"
        : "仍需补齐 probe/digest 成本量化或重复样本不足。",
      {
        scenarios: scenarioList.map((scenario) => ({
          key: scenario.key,
          performanceStatus: scenario?.evidence?.performanceStatus || "missing",
          observedRunCount: Number(scenario?.observedRunCount || 0),
        })),
      },
    ),
  ];

  const ok = gates.every((gate) => gate.ok === true);
  const failedGates = gates.filter((gate) => gate.ok !== true).map((gate) => gate.id);
  const decision = ok
    ? "keep-planned-default-disabled"
    : failedGates.includes("rooturi-smoke")
      ? "rerun-wasm-kernel-smoke"
      : failedGates.includes("cost-quantified")
        ? "rerun-wasm-kernel-perf"
        : failedGates.includes("disabled-contract") || failedGates.includes("export-contract")
          ? "rerun-wasm-kernel-disabled-contract"
          : "fix-wasm-kernel-registry-contract";
  const summary = ok
    ? "当前 planned + default-disabled lane 的聚合证据已完整。矩阵只作为 controller 收口入口，不自动把 bundle 升级为 implemented。"
    : `仍缺少 ${failedGates.join(", ")} 的固定证据，暂不应推进更高一级 promotion 判断。`;

  return {
    status: ok ? "passed" : "attention",
    statusLabel: statusLabel(ok ? "passed" : "attention"),
    decision,
    summary,
    gateCount: gates.length,
    passedGateCount: gates.filter((gate) => gate.ok === true).length,
    failedGateCount: gates.filter((gate) => gate.ok !== true).length,
    gates,
  };
}

function buildMatrixSummary({
  bundle,
  probeScenario,
  digestScenario,
  promotionGate,
} = {}) {
  const scenarioList = [probeScenario, digestScenario].filter(Boolean);
  const anyEvidencePresent = scenarioList.some((scenario) => scenario.status !== "missing");
  const status = !anyEvidencePresent
    ? "missing"
    : promotionGate.status === "passed"
      ? "passed"
      : "attention";
  const nextAction = !anyEvidencePresent
    ? "collect-wasm-kernel-matrix-evidence"
    : promotionGate.decision || "keep-planned-default-disabled";

  if (status === "missing") {
    return {
      status,
      statusLabel: statusLabel(status),
      nextAction,
      summary: "缺少 Wasm matrix 所需的 smoke/perf/disabled-contract 报告。",
    };
  }

  if (status === "passed") {
    return {
      status,
      statusLabel: statusLabel(status),
      nextAction,
      summary: `Wasm lane 聚合证据已完整：probe 与 digest 均通过，bundle 继续保持 ${bundle?.implementationStatus || "planned"} + default-disabled。`,
    };
  }

  return {
    status,
    statusLabel: statusLabel(status),
    nextAction,
    summary: promotionGate.summary || "Wasm lane 聚合证据仍不完整。",
  };
}

export function parseWasmKernelMatrixArgs(argv = process.argv.slice(2)) {
  const options = {
    projectRootPath: projectRoot,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--project-root":
        options.projectRootPath = normalizePathOption(argv[index + 1], process.cwd());
        index += 1;
        break;
      default:
        throw createScriptError("args", `Unknown option: ${token}`, {
          failedStage: "parse-args",
          details: {
            option: token,
          },
        });
    }
  }

  assertNonEmptyString(options.projectRootPath, "project root", {
    category: "args",
    failedStage: "parse-args",
  });
  return options;
}

export function summarizeWasmKernelMatrixReport({
  bundle = null,
  contractInspection = {},
  probeScenario = null,
  digestScenario = null,
} = {}) {
  const promotionGate = buildPromotionGate({
    bundle,
    contractInspection,
    scenarios: [probeScenario, digestScenario],
  });
  const matrixSummary = buildMatrixSummary({
    bundle,
    probeScenario,
    digestScenario,
    promotionGate,
  });

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    bundleId: bundle?.id || DEFAULT_BUNDLE_ID,
    status: matrixSummary.status,
    statusLabel: matrixSummary.statusLabel,
    nextAction: matrixSummary.nextAction,
    summary: matrixSummary.summary,
    registry: {
      bundle: bundle ? clone(bundle) : null,
      contractOK: contractInspection?.ok === true,
      issueCount: Array.isArray(contractInspection?.issues) ? contractInspection.issues.length : 0,
      issues: Array.isArray(contractInspection?.issues) ? clone(contractInspection.issues) : [],
    },
    sources: {
      probePresent: probeScenario?.status !== "missing",
      digestPresent: digestScenario?.status !== "missing",
    },
    scenarios: [
      probeScenario,
      digestScenario,
    ].filter(Boolean),
    promotionGate,
  };
}

export function renderWasmKernelMatrixMarkdown(report = {}) {
  const lines = [
    "# Wasm Kernel Matrix",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- Bundle: \`${report.bundleId || DEFAULT_BUNDLE_ID}\``,
    `- 状态: \`${report.statusLabel || "-"}\``,
    `- nextAction: \`${report.nextAction || "-"}\``,
    `- 摘要: ${report.summary || "-"}`,
    "",
    "## Registry",
    "",
    `- implementationStatus: \`${report.registry?.bundle?.implementationStatus || "-"}\``,
    `- enabled: \`${report.registry?.bundle?.enabled === true ? "true" : "false"}\``,
    `- lane: \`${report.registry?.bundle?.lane || "-"}\``,
    `- contractOK: \`${report.registry?.contractOK ? "yes" : "no"}\``,
    `- issueCount: \`${Number(report.registry?.issueCount || 0)}\``,
    "",
    "## Promotion Gate",
    "",
    `- 状态: \`${report.promotionGate?.statusLabel || "-"}\``,
    `- 决策: \`${report.promotionGate?.decision || "-"}\``,
    `- 摘要: ${report.promotionGate?.summary || "-"}`,
    "",
  ];

  const gates = Array.isArray(report.promotionGate?.gates) ? report.promotionGate.gates : [];
  gates.forEach((gate) => {
    lines.push(`- [${gate.ok ? "x" : " "}] \`${gate.id}\` (${gate.label})`);
    if (gate.summary) {
      lines.push(`  - ${gate.summary}`);
    }
  });

  const scenarios = Array.isArray(report.scenarios) ? report.scenarios : [];
  scenarios.forEach((scenario) => {
    lines.push("");
    lines.push(`## ${scenario.label}`);
    lines.push("");
    lines.push(`- scenario: \`${scenario.scenarioName || "-"}\``);
    lines.push(`- 状态: \`${scenario.statusLabel || "-"}\``);
    lines.push(`- smoke/perf/disabled: \`${scenario.evidence?.smokeStatus || "missing"}\` / \`${scenario.evidence?.performanceStatus || "missing"}\` / \`${scenario.evidence?.disabledContractStatus || "missing"}\``);
    lines.push(`- runs: \`${Number(scenario.passedRunCount || 0)}/${Number(scenario.observedRunCount || 0)}\``);
    lines.push(`- source/build: \`${formatBytes(scenario.metrics?.sourceCombinedBytes || 0)} / ${formatBytes(scenario.metrics?.buildCombinedBytes || 0)}\``);
    lines.push(`- medians: \`main=${Number(scenario.metrics?.mainThreadMedianMs || 0)}ms / worker=${Number(scenario.metrics?.workerMedianMs || 0)}ms / probe=${Number(scenario.metrics?.probeMedianMs || 0)}ms\``);
    lines.push(`- smoke report: \`${scenario.artifactPaths?.smokeReportPath || "-"}\``);
    lines.push(`- perf report: \`${scenario.artifactPaths?.performanceReportPath || "-"}\``);
    lines.push(`- disabled-contract report: \`${scenario.artifactPaths?.disabledContractReportPath || "-"}\``);
    lines.push(`- 摘要: ${scenario.summary || "-"}`);
  });

  return lines.join("\n");
}

export async function persistWasmKernelMatrixReport(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const artifacts = resolveZoteroWasmKernelArtifacts(projectRootPath);
  await fs.mkdir(artifacts.artifactsDir, { recursive: true });
  await Promise.all([
    fs.writeFile(artifacts.matrixJSON, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(artifacts.matrixMD, `${renderWasmKernelMatrixMarkdown(report)}\n`, "utf-8"),
  ]);
  return {
    reportPath: artifacts.matrixJSON,
    reportMDPath: artifacts.matrixMD,
  };
}

export async function runWasmKernelMatrixReport(options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const { registry } = loadOptionalBundleRegistry(projectRootPath);
  const bundle = getOptionalBundle(registry, DEFAULT_BUNDLE_ID);
  const contractInspection = inspectOptionalBundleContracts(projectRootPath, { registry });
  const probeArtifacts = resolveZoteroWasmKernelScenarioArtifacts(projectRootPath, DEFAULT_WASM_KERNEL_SCENARIO_NAME);
  const digestArtifacts = resolveZoteroWasmKernelScenarioArtifacts(projectRootPath, DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME);

  const [
    probeSmokeReport,
    probePerformanceReport,
    probeDisabledContractReport,
    digestSmokeReport,
    digestPerformanceReport,
    digestDisabledContractReport,
  ] = await Promise.all([
    readJSONIfExists(probeArtifacts.isDefaultScenario
      ? resolveZoteroWasmKernelArtifacts(projectRootPath).smokeJSON
      : probeArtifacts.smokeJSON, {
      missingStage: "read-probe-smoke-report",
      invalidStage: "read-probe-smoke-report",
      label: probeArtifacts.smokeJSON,
    }),
    readJSONIfExists(probeArtifacts.isDefaultScenario
      ? resolveZoteroWasmKernelArtifacts(projectRootPath).performanceJSON
      : probeArtifacts.performanceJSON, {
      missingStage: "read-probe-performance-report",
      invalidStage: "read-probe-performance-report",
      label: probeArtifacts.performanceJSON,
    }),
    readJSONIfExists(probeArtifacts.isDefaultScenario
      ? resolveZoteroWasmKernelArtifacts(projectRootPath).disabledContractJSON
      : probeArtifacts.disabledContractJSON, {
      missingStage: "read-probe-disabled-contract-report",
      invalidStage: "read-probe-disabled-contract-report",
      label: probeArtifacts.disabledContractJSON,
    }),
    readJSONIfExists(digestArtifacts.smokeJSON, {
      missingStage: "read-digest-smoke-report",
      invalidStage: "read-digest-smoke-report",
      label: digestArtifacts.smokeJSON,
    }),
    readJSONIfExists(digestArtifacts.performanceJSON, {
      missingStage: "read-digest-performance-report",
      invalidStage: "read-digest-performance-report",
      label: digestArtifacts.performanceJSON,
    }),
    readJSONIfExists(digestArtifacts.disabledContractJSON, {
      missingStage: "read-digest-disabled-contract-report",
      invalidStage: "read-digest-disabled-contract-report",
      label: digestArtifacts.disabledContractJSON,
    }),
  ]);

  const probeScenario = summarizeScenarioEvidence({
    key: "probe",
    label: "Wasm probe",
    scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
    smokeReport: probeSmokeReport,
    performanceReport: probePerformanceReport,
    disabledContractReport: probeDisabledContractReport,
    artifactPaths: {
      smokeReportPath: resolveZoteroWasmKernelArtifacts(projectRootPath).smokeJSON,
      performanceReportPath: resolveZoteroWasmKernelArtifacts(projectRootPath).performanceJSON,
      disabledContractReportPath: resolveZoteroWasmKernelArtifacts(projectRootPath).disabledContractJSON,
    },
  });
  const digestScenario = summarizeScenarioEvidence({
    key: "digest",
    label: "Wasm digest micro-kernel",
    scenarioName: DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
    smokeReport: digestSmokeReport,
    performanceReport: digestPerformanceReport,
    disabledContractReport: digestDisabledContractReport,
    artifactPaths: {
      smokeReportPath: digestArtifacts.smokeJSON,
      performanceReportPath: digestArtifacts.performanceJSON,
      disabledContractReportPath: digestArtifacts.disabledContractJSON,
    },
  });

  const report = summarizeWasmKernelMatrixReport({
    bundle,
    contractInspection,
    probeScenario,
    digestScenario,
  });
  const paths = await persistWasmKernelMatrixReport(report, {
    projectRootPath,
  });

  return {
    report,
    paths,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseWasmKernelMatrixArgs(argv);
  const { report, paths } = await runWasmKernelMatrixReport(options);
  console.log(`Wasm kernel matrix generated: ${paths.reportPath}`);
  console.log(`Wasm kernel matrix status: ${report.status}`);
  console.log(`Wasm kernel matrix nextAction: ${report.nextAction}`);
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch((error) => {
    const failureInfo = buildScriptFailureInfo(error, {
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    console.error(`${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
    process.exit(1);
  });
}
