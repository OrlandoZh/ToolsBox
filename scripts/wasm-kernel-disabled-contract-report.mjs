import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
} from "./script-runtime-lib.mjs";
import {
  getOptionalBundle,
  inspectOptionalBundleContracts,
  loadOptionalBundleRegistry,
} from "./optional-bundles-lib.mjs";
import {
  resolveZoteroWasmKernelArtifacts,
  resolveZoteroWasmKernelScenarioArtifacts,
} from "./zotero-agent-artifacts.mjs";
import {
  DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME,
  DEFAULT_WASM_KERNEL_SCENARIO_NAME,
  collectWasmKernelAssetInventory,
} from "./wasm-kernel-performance-report.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

const DEFAULT_BUNDLE_ID = "wasm-kernel";
const DEFAULT_EXPORT_REQUIRED_PATHS = Object.freeze([
  "addon-static/content/lib/w/probe.wasm",
  "addon-static/content/lib/w/wasm-probe-worker.js",
  "src/services/wasm-loader.js",
  "src/services/wasm-worker.js",
  "src/features/wasm-kernel-probe.js",
  "scripts/wasm-kernel-smoke.mjs",
  "scripts/wasm-kernel-performance-report.mjs",
  "scripts/wasm-kernel-disabled-contract-report.mjs",
  "scripts/wasm-kernel-matrix-report.mjs",
]);
const DEFAULT_REQUIRED_PACKAGE_SCRIPTS = Object.freeze([
  "wasm:kernel:smoke",
  "wasm:kernel:perf",
  "wasm:kernel:disabled-contract",
  "wasm:kernel:matrix",
]);

function normalizePathOption(value, rootDir = process.cwd()) {
  const normalized = String(value || "").trim();
  return normalized
    ? path.resolve(rootDir, normalized)
    : null;
}

function createCheck(name, ok, details = {}) {
  return {
    name,
    ok: Boolean(ok),
    details: details && typeof details === "object"
      ? JSON.parse(JSON.stringify(details))
      : {},
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function summarizeChecks(checks = []) {
  const normalized = Array.isArray(checks) ? checks : [];
  const passed = normalized.filter((entry) => entry?.ok === true).length;
  return {
    ok: normalized.every((entry) => entry?.ok === true),
    total: normalized.length,
    passed,
    failed: normalized.length - passed,
    checks: normalized,
  };
}

function flattenCheckGroups(groups = []) {
  return groups.flatMap((group) => Array.isArray(group?.checks) ? group.checks : []);
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

function readScript(packageJSON, scriptName) {
  const value = packageJSON?.scripts?.[scriptName];
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function readOptionalBundleEntry(optionalBundles = [], bundleId = DEFAULT_BUNDLE_ID) {
  return (Array.isArray(optionalBundles) ? optionalBundles : []).find((entry) => entry?.id === bundleId) || null;
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildDefaultExportRoot(projectRootPath, addonConfig = {}) {
  return path.join(
    projectRootPath,
    "dist",
    `${String(addonConfig.addonRef || "").trim()}-${String(addonConfig.addonVersion || "").trim()}-pure-project`,
  );
}

export function parseWasmKernelDisabledContractArgs(argv = process.argv.slice(2)) {
  const options = {
    projectRootPath: projectRoot,
    exportRootPath: null,
    smokeReportPath: null,
    performanceReportPath: null,
    scenarioName: DEFAULT_WASM_KERNEL_SCENARIO_NAME,
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
      case "--export-root":
        options.exportRootPath = normalizePathOption(argv[index + 1], process.cwd());
        index += 1;
        break;
      case "--smoke-report":
        options.smokeReportPath = normalizePathOption(argv[index + 1], process.cwd());
        index += 1;
        break;
      case "--performance-report":
        options.performanceReportPath = normalizePathOption(argv[index + 1], process.cwd());
        index += 1;
        break;
      case "--scenario":
        options.scenarioName = String(argv[index + 1] || "").trim();
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

  if (!options.projectRootPath) {
    throw createScriptError("args", "--project-root must be a non-empty path", {
      failedStage: "parse-args",
    });
  }
  if (!options.scenarioName) {
    throw createScriptError("args", "--scenario must be a non-empty string", {
      failedStage: "parse-args",
    });
  }
  return options;
}

export function inspectWasmKernelPackageScriptContract(packageJSON = {}) {
  const buildScript = readScript(packageJSON, "build");
  const packageScript = readScript(packageJSON, "package");
  const checkScript = readScript(packageJSON, "check");
  const optionalScripts = Object.fromEntries(
    DEFAULT_REQUIRED_PACKAGE_SCRIPTS.map((scriptName) => [scriptName, readScript(packageJSON, scriptName)]),
  );

  const checks = [
    createCheck("package.scripts.build", Boolean(buildScript), { script: buildScript }),
    createCheck("package.scripts.package", Boolean(packageScript), { script: packageScript }),
    createCheck("package.scripts.check", Boolean(checkScript), { script: checkScript }),
    createCheck(
      "package.default-build-does-not-call-wasm",
      Boolean(buildScript) && !/wasm:kernel|wasm-kernel/iu.test(buildScript),
      { script: buildScript },
    ),
    createCheck(
      "package.default-package-does-not-call-wasm",
      Boolean(packageScript) && !/wasm:kernel|wasm-kernel/iu.test(packageScript),
      { script: packageScript },
    ),
    createCheck(
      "package.default-check-does-not-call-wasm",
      Boolean(checkScript) && !/wasm:kernel|wasm-kernel/iu.test(checkScript),
      { script: checkScript },
    ),
    ...DEFAULT_REQUIRED_PACKAGE_SCRIPTS.map((scriptName) => createCheck(
      `package.optional-script.${scriptName}`,
      Boolean(optionalScripts[scriptName]),
      { script: optionalScripts[scriptName] || null },
    )),
  ];

  return {
    buildScript,
    packageScript,
    checkScript,
    optionalScripts,
    checks,
  };
}

export function inspectWasmKernelLazySourceContract({
  pluginSource = "",
  hostActionsSource = "",
} = {}) {
  const normalizedPluginSource = String(pluginSource || "");
  const normalizedHostActionsSource = String(hostActionsSource || "");

  const checks = [
    createCheck(
      "plugin.lazy-slot",
      normalizedPluginSource.includes("let wasmKernelProbe = null;"),
    ),
    createCheck(
      "plugin.lazy-getter",
      normalizedPluginSource.includes("function getWasmKernelProbe() {"),
    ),
    createCheck(
      "plugin.lazy-getter-creates-probe",
      normalizedPluginSource.includes("wasmKernelProbe = createWasmKernelProbeImpl({"),
    ),
    createCheck(
      "plugin.no-eager-probe-construction",
      !/(?:const|let)\s+wasmKernelProbe\s*=\s*createWasmKernelProbeImpl\s*\(/u.test(normalizedPluginSource),
    ),
    createCheck(
      "plugin.host-actions-use-getter",
      /createHostActionRunner\(\{[\s\S]*getWasmKernelProbe[\s\S]*\}\)/u.test(normalizedPluginSource)
        || normalizedPluginSource.includes("getWasmKernelProbe,"),
    ),
    createCheck(
      "plugin.shutdown-guards-close",
      normalizedPluginSource.includes('if (typeof wasmKernelProbe?.close === "function") {'),
    ),
    createCheck(
      "host-actions.accepts-lazy-getter",
      /createHostActionRunner\(\{[\s\S]*getWasmKernelProbe[\s\S]*\}\)/u.test(normalizedHostActionsSource)
        || normalizedHostActionsSource.includes("getWasmKernelProbe,"),
    ),
    createCheck(
      "host-actions.resolves-lazy-getter",
      normalizedHostActionsSource.includes("async function resolveWasmKernelProbe() {")
        && normalizedHostActionsSource.includes('if (typeof getWasmKernelProbe === "function") {'),
    ),
    createCheck(
      "host-actions.probe-readiness-supports-lazy-or-eager",
      normalizedHostActionsSource.includes('typeof getWasmKernelProbe === "function" || typeof wasmKernelProbe?.runProbe === "function"'),
    ),
    createCheck(
      "host-actions.digest-readiness-supports-lazy-or-eager",
      normalizedHostActionsSource.includes('typeof getWasmKernelProbe === "function" || typeof wasmKernelProbe?.deriveDigest === "function"'),
    ),
    createCheck(
      "host-actions.digest-uses-derived-entry",
      normalizedHostActionsSource.includes("runRuntimeDeriveWasmKernelDigest")
        && normalizedHostActionsSource.includes("resolvedWasmKernelProbe.deriveDigest(payload)"),
    ),
  ];

  return {
    checks,
  };
}

function inspectWasmKernelRegistryContract({
  registry = null,
  bundle = null,
  contractInspection = { ok: false, issues: [] },
} = {}) {
  const checks = [
    createCheck("registry.present", Boolean(registry)),
    createCheck("registry.bundle-present", Boolean(bundle), {
      bundleId: DEFAULT_BUNDLE_ID,
    }),
    createCheck("registry.bundle-disabled", bundle?.enabled === false, {
      enabled: bundle?.enabled ?? null,
    }),
    createCheck("registry.bundle-planned", bundle?.implementationStatus === "planned", {
      implementationStatus: bundle?.implementationStatus || null,
    }),
    createCheck("registry.bundle-js-core", bundle?.lane === "js-core", {
      lane: bundle?.lane || null,
    }),
    createCheck("registry.bundle-has-validation", Boolean(bundle?.validation), {
      requiredFileCount: Array.isArray(bundle?.validation?.requiredFiles) ? bundle.validation.requiredFiles.length : 0,
      requiredPackageScriptCount: Array.isArray(bundle?.validation?.requiredPackageScripts)
        ? bundle.validation.requiredPackageScripts.length
        : 0,
    }),
    createCheck("registry.contracts-pass", contractInspection?.ok === true, {
      issues: Array.isArray(contractInspection?.issues) ? contractInspection.issues : [],
    }),
  ];

  return {
    checks,
    issues: Array.isArray(contractInspection?.issues) ? contractInspection.issues : [],
  };
}

function inspectWasmKernelAssetContract(assetInventory = {}) {
  const source = assetInventory?.source || {};
  const build = assetInventory?.build || {};
  const deltas = assetInventory?.deltas || {};

  return {
    checks: [
      createCheck("assets.source-wasm-present", source?.wasm?.present === true, {
        path: source?.wasm?.path || null,
        sizeBytes: Number(source?.wasm?.sizeBytes || 0),
      }),
      createCheck("assets.source-worker-present", source?.worker?.present === true, {
        path: source?.worker?.path || null,
        sizeBytes: Number(source?.worker?.sizeBytes || 0),
      }),
      createCheck("assets.build-wasm-present", build?.wasm?.present === true, {
        path: build?.wasm?.path || null,
        sizeBytes: Number(build?.wasm?.sizeBytes || 0),
      }),
      createCheck("assets.build-worker-present", build?.worker?.present === true, {
        path: build?.worker?.path || null,
        sizeBytes: Number(build?.worker?.sizeBytes || 0),
      }),
      createCheck("assets.build-delta-is-zero", Number(deltas?.combinedBytes || 0) === 0, {
        deltaBytes: Number(deltas?.combinedBytes || 0),
      }),
    ],
    assetInventory: clone(assetInventory),
  };
}

async function inspectWasmKernelExportContract({
  exportRootPath,
  bundleId = DEFAULT_BUNDLE_ID,
} = {}) {
  const normalizedExportRootPath = String(exportRootPath || "").trim();
  const checks = [
    createCheck("export.root-present", Boolean(normalizedExportRootPath) && await pathExists(normalizedExportRootPath), {
      exportRootPath: normalizedExportRootPath || null,
    }),
  ];

  if (!checks[0].ok) {
    return {
      exportRootPath: normalizedExportRootPath || null,
      exportManifestPath: normalizedExportRootPath ? path.join(normalizedExportRootPath, "export-manifest.json") : null,
      exportPackagePath: normalizedExportRootPath ? path.join(normalizedExportRootPath, "package.json") : null,
      exportReadmePath: normalizedExportRootPath ? path.join(normalizedExportRootPath, "README.md") : null,
      exportBundle: null,
      checks,
    };
  }

  const exportManifestPath = path.join(normalizedExportRootPath, "export-manifest.json");
  const exportPackagePath = path.join(normalizedExportRootPath, "package.json");
  const exportReadmePath = path.join(normalizedExportRootPath, "README.md");

  const exportManifest = await readJSONIfExists(exportManifestPath, {
    missingStage: "read-export-manifest",
    invalidStage: "read-export-manifest",
    label: exportManifestPath,
  });
  const exportPackage = await readJSONIfExists(exportPackagePath, {
    missingStage: "read-export-package",
    invalidStage: "read-export-package",
    label: exportPackagePath,
  });
  const exportReadme = await readTextIfExists(exportReadmePath);
  const exportBundle = readOptionalBundleEntry(exportManifest?.optionalBundles, bundleId);

  checks.push(
    createCheck("export.manifest-present", Boolean(exportManifest), {
      path: exportManifestPath,
    }),
    createCheck("export.package-present", Boolean(exportPackage), {
      path: exportPackagePath,
    }),
    createCheck("export.readme-present", typeof exportReadme === "string", {
      path: exportReadmePath,
    }),
    createCheck("export.bundle-present", Boolean(exportBundle), {
      bundleId,
    }),
    createCheck("export.bundle-planned", exportBundle?.implementationStatus === "planned", {
      implementationStatus: exportBundle?.implementationStatus || null,
    }),
    createCheck("export.bundle-disabled", exportBundle?.enabled === false, {
      enabled: exportBundle?.enabled ?? null,
    }),
  );

  for (const relativePath of DEFAULT_EXPORT_REQUIRED_PATHS) {
    checks.push(createCheck(
      `export.file.${relativePath}`,
      await pathExists(path.join(normalizedExportRootPath, relativePath)),
      { relativePath },
    ));
  }

  DEFAULT_REQUIRED_PACKAGE_SCRIPTS.forEach((scriptName) => {
    checks.push(createCheck(
      `export.package-script.${scriptName}`,
      typeof exportPackage?.scripts?.[scriptName] === "string",
      { script: exportPackage?.scripts?.[scriptName] || null },
    ));
  });

  checks.push(createCheck(
    "export.readme-mentions-disabled-contract",
    typeof exportReadme === "string" && exportReadme.includes("wasm:kernel:disabled-contract"),
  ));

  return {
    exportRootPath: normalizedExportRootPath,
    exportManifestPath,
    exportPackagePath,
    exportReadmePath,
    exportManifest,
    exportPackage,
    exportReadme,
    exportBundle,
    checks,
  };
}

function inspectWasmKernelSmokeEvidence({
  smokeReport = null,
  smokeReportPath = null,
  scenarioName = DEFAULT_WASM_KERNEL_SCENARIO_NAME,
} = {}) {
  const allowedScenarioNames = scenarioName === DEFAULT_WASM_KERNEL_SCENARIO_NAME
    ? [DEFAULT_WASM_KERNEL_SCENARIO_NAME, DEFAULT_WASM_KERNEL_DIGEST_SCENARIO_NAME]
    : [scenarioName];
  const checks = [
    createCheck("smoke.report-present", Boolean(smokeReport), {
      smokeReportPath,
    }),
  ];

  if (!smokeReport) {
    return {
      checks,
      smokeReportPath,
      status: null,
      summary: null,
      metrics: null,
    };
  }

  checks.push(
    createCheck("smoke.scenario-match", allowedScenarioNames.includes(smokeReport?.scenarioName), {
      actualScenarioName: smokeReport?.scenarioName || null,
      expectedScenarioName: scenarioName,
      allowedScenarioNames,
    }),
    createCheck("smoke.status-passed", smokeReport?.status === "passed", {
      status: smokeReport?.status || null,
      passedRunCount: Number(smokeReport?.passedRunCount || 0),
      repeats: Number(smokeReport?.repeats || 0),
    }),
    createCheck("smoke.all-runs-passed", Number(smokeReport?.failedRunCount || 0) === 0, {
      failedRunCount: Number(smokeReport?.failedRunCount || 0),
    }),
    createCheck(
      "smoke.main-thread-median-recorded",
      Number.isFinite(Number(smokeReport?.metrics?.mainThreadTotalDurationMsMedian)),
      { median: Number(smokeReport?.metrics?.mainThreadTotalDurationMsMedian || 0) },
    ),
    createCheck(
      "smoke.worker-median-recorded",
      Number.isFinite(Number(smokeReport?.metrics?.workerTotalDurationMsMedian)),
      { median: Number(smokeReport?.metrics?.workerTotalDurationMsMedian || 0) },
    ),
  );

  return {
    checks,
    smokeReportPath,
    status: smokeReport.status || null,
    summary: smokeReport.summary || null,
    metrics: smokeReport.metrics || null,
  };
}

function buildWasmKernelDisabledContractSummary({
  ok = false,
  failedChecks = [],
  sourceCombinedBytes = 0,
  mainThreadMedianMs = null,
  workerMedianMs = null,
  probeMedianMs = null,
} = {}) {
  if (!ok) {
    const labels = failedChecks.slice(0, 4).map((entry) => `\`${entry.name}\``).join(", ");
    return labels
      ? `Wasm disabled-contract 仍有失败项：${labels}。`
      : "Wasm disabled-contract 尚未满足。";
  }

  const metrics = [];
  if (Number.isFinite(Number(mainThreadMedianMs))) {
    metrics.push(`main-thread 中位 ${Number(mainThreadMedianMs)}ms`);
  }
  if (Number.isFinite(Number(workerMedianMs))) {
    metrics.push(`worker 中位 ${Number(workerMedianMs)}ms`);
  }
  if (Number.isFinite(Number(probeMedianMs))) {
    metrics.push(`probe 总时延中位 ${Number(probeMedianMs)}ms`);
  }

  const metricsSummary = metrics.length > 0
    ? `；最近 smoke 为 ${metrics.join("、")}`
    : "";

  return `Wasm disabled-contract 已满足：bundle 仍保持 planned + default-disabled，startup 走惰性 Wasm runtime，source/build/export 均保留 ${formatBytes(sourceCombinedBytes)} 级最小资产${metricsSummary}。`;
}

export function summarizeWasmKernelDisabledContractReport({
  bundle = null,
  registryContract = {},
  packageScriptContract = {},
  assetContract = {},
  exportContract = {},
  lazySourceContract = {},
  smokeEvidence = {},
  performanceReport = null,
  artifactPaths = {},
  scenarioName = DEFAULT_WASM_KERNEL_SCENARIO_NAME,
} = {}) {
  const checkGroups = [
    {
      label: "registry",
      checks: Array.isArray(registryContract?.checks) ? registryContract.checks : [],
    },
    {
      label: "package",
      checks: Array.isArray(packageScriptContract?.checks) ? packageScriptContract.checks : [],
    },
    {
      label: "assets",
      checks: Array.isArray(assetContract?.checks) ? assetContract.checks : [],
    },
    {
      label: "export",
      checks: Array.isArray(exportContract?.checks) ? exportContract.checks : [],
    },
    {
      label: "lazy-source",
      checks: Array.isArray(lazySourceContract?.checks) ? lazySourceContract.checks : [],
    },
    {
      label: "smoke",
      checks: Array.isArray(smokeEvidence?.checks) ? smokeEvidence.checks : [],
    },
  ];
  const checks = flattenCheckGroups(checkGroups);
  const summary = summarizeChecks(checks);
  const failedChecks = checks.filter((entry) => entry.ok === false);
  const performanceSnapshot = performanceReport && typeof performanceReport === "object"
    ? {
        reportPath: artifactPaths.performanceReportPath || null,
        artifactSource: performanceReport.artifactSource || null,
        summary: performanceReport.summary || null,
        mainThreadMedianMs: Number(performanceReport?.transports?.mainThread?.totalDurationMs?.median || 0),
        workerMedianMs: Number(performanceReport?.transports?.worker?.totalDurationMs?.median || 0),
        probeMedianMs: Number(performanceReport?.overall?.probeTotalDurationMs?.median || 0),
      }
    : null;

  const smokeMetrics = smokeEvidence?.metrics || {};
  const mainThreadMedianMs = performanceSnapshot?.mainThreadMedianMs
    || Number(smokeMetrics?.mainThreadTotalDurationMsMedian || 0);
  const workerMedianMs = performanceSnapshot?.workerMedianMs
    || Number(smokeMetrics?.workerTotalDurationMsMedian || 0);
  const probeMedianMs = performanceSnapshot?.probeMedianMs
    || Number(smokeMetrics?.probeTotalDurationMsMedian || 0);

  const finalSummary = buildWasmKernelDisabledContractSummary({
    ok: summary.ok,
    failedChecks,
    sourceCombinedBytes: Number(assetContract?.assetInventory?.source?.combinedBytes || 0),
    mainThreadMedianMs,
    workerMedianMs,
    probeMedianMs,
  });

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    bundleId: bundle?.id || DEFAULT_BUNDLE_ID,
    scenarioName,
    status: summary.ok ? "passed" : "failed",
    statusLabel: summary.ok ? "通过" : "失败",
    summary: finalSummary,
    checks: summary,
    failedChecks,
    registry: {
      bundle: bundle ? clone(bundle) : null,
      issues: Array.isArray(registryContract?.issues) ? clone(registryContract.issues) : [],
    },
    packageScripts: {
      build: packageScriptContract?.buildScript || null,
      package: packageScriptContract?.packageScript || null,
      check: packageScriptContract?.checkScript || null,
      optional: packageScriptContract?.optionalScripts
        ? clone(packageScriptContract.optionalScripts)
        : {},
    },
    assets: assetContract?.assetInventory ? clone(assetContract.assetInventory) : null,
    exportContract: {
      exportRootPath: exportContract?.exportRootPath || null,
      exportManifestPath: exportContract?.exportManifestPath || null,
      exportPackagePath: exportContract?.exportPackagePath || null,
      exportReadmePath: exportContract?.exportReadmePath || null,
      exportBundle: exportContract?.exportBundle ? clone(exportContract.exportBundle) : null,
    },
    smokeEvidence: {
      smokeReportPath: smokeEvidence?.smokeReportPath || artifactPaths.smokeReportPath || null,
      status: smokeEvidence?.status || null,
      summary: smokeEvidence?.summary || null,
      metrics: smokeEvidence?.metrics ? clone(smokeEvidence.metrics) : null,
    },
    performanceSnapshot,
    artifactPaths: clone(artifactPaths),
  };
}

export function renderWasmKernelDisabledContractMarkdown(report = {}) {
  const lines = [
    "# Wasm Kernel Disabled Contract",
    "",
    `- Bundle: \`${report.bundleId || DEFAULT_BUNDLE_ID}\``,
    `- 场景: \`${report.scenarioName || DEFAULT_WASM_KERNEL_SCENARIO_NAME}\``,
    `- 状态: \`${report.status || "unknown"}\``,
    `- 摘要: ${report.summary || "-"}`,
    "",
    "## Checks",
    "",
    `- 总数: \`${Number(report?.checks?.total || 0)}\``,
    `- 通过: \`${Number(report?.checks?.passed || 0)}\``,
    `- 失败: \`${Number(report?.checks?.failed || 0)}\``,
    "",
  ];

  const checkList = Array.isArray(report?.checks?.checks) ? report.checks.checks : [];
  if (checkList.length > 0) {
    checkList.forEach((entry) => {
      lines.push(`- [${entry.ok ? "x" : " "}] \`${entry.name}\``);
    });
  } else {
    lines.push("- No checks recorded.");
  }

  lines.push("");
  lines.push("## Assets");
  lines.push("");
  lines.push(`- source combined: \`${formatBytes(report?.assets?.source?.combinedBytes || 0)}\``);
  lines.push(`- build combined: \`${formatBytes(report?.assets?.build?.combinedBytes || 0)}\``);
  lines.push(`- source wasm: \`${report?.assets?.source?.wasm?.present ? "yes" : "no"}\``);
  lines.push(`- source worker: \`${report?.assets?.source?.worker?.present ? "yes" : "no"}\``);
  lines.push(`- build wasm: \`${report?.assets?.build?.wasm?.present ? "yes" : "no"}\``);
  lines.push(`- build worker: \`${report?.assets?.build?.worker?.present ? "yes" : "no"}\``);
  lines.push("");
  lines.push("## Package Scripts");
  lines.push("");
  lines.push(`- build: \`${report?.packageScripts?.build || "-"}\``);
  lines.push(`- package: \`${report?.packageScripts?.package || "-"}\``);
  lines.push(`- check: \`${report?.packageScripts?.check || "-"}\``);
  Object.entries(report?.packageScripts?.optional || {}).forEach(([scriptName, scriptValue]) => {
    lines.push(`- ${scriptName}: \`${scriptValue || "-"}\``);
  });
  lines.push("");
  lines.push("## Export");
  lines.push("");
  lines.push(`- export root: \`${report?.exportContract?.exportRootPath || "-"}\``);
  lines.push(`- export bundle status: \`${report?.exportContract?.exportBundle?.implementationStatus || "-"}\``);
  lines.push(`- export bundle enabled: \`${report?.exportContract?.exportBundle?.enabled === false ? "false" : report?.exportContract?.exportBundle?.enabled === true ? "true" : "-"}\``);
  lines.push("");
  lines.push("## Smoke Evidence");
  lines.push("");
  lines.push(`- smoke report: \`${report?.smokeEvidence?.smokeReportPath || "-"}\``);
  lines.push(`- smoke status: \`${report?.smokeEvidence?.status || "-"}\``);
  lines.push(`- main-thread median: \`${Number(report?.smokeEvidence?.metrics?.mainThreadTotalDurationMsMedian || 0)}ms\``);
  lines.push(`- worker median: \`${Number(report?.smokeEvidence?.metrics?.workerTotalDurationMsMedian || 0)}ms\``);
  lines.push(`- probe total median: \`${Number(report?.smokeEvidence?.metrics?.probeTotalDurationMsMedian || 0)}ms\``);

  if (report?.performanceSnapshot) {
    lines.push("");
    lines.push("## Performance Snapshot");
    lines.push("");
    lines.push(`- artifact source: \`${report.performanceSnapshot.artifactSource || "-"}\``);
    lines.push(`- report path: \`${report.performanceSnapshot.reportPath || "-"}\``);
    lines.push(`- main-thread median: \`${Number(report.performanceSnapshot.mainThreadMedianMs || 0)}ms\``);
    lines.push(`- worker median: \`${Number(report.performanceSnapshot.workerMedianMs || 0)}ms\``);
    lines.push(`- probe total median: \`${Number(report.performanceSnapshot.probeMedianMs || 0)}ms\``);
  }

  return lines.join("\n");
}

export async function persistWasmKernelDisabledContractReport(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const artifacts = resolveZoteroWasmKernelArtifacts(projectRootPath);
  const scenarioArtifacts = resolveZoteroWasmKernelScenarioArtifacts(projectRootPath, report?.scenarioName);
  const reportJSON = `${JSON.stringify(report, null, 2)}\n`;
  const reportMD = `${renderWasmKernelDisabledContractMarkdown(report)}\n`;
  const writeTargets = [
    [scenarioArtifacts.disabledContractJSON, reportJSON],
    [scenarioArtifacts.disabledContractMD, reportMD],
    [scenarioArtifacts.disabledContractLatestJSON, reportJSON],
    [scenarioArtifacts.disabledContractLatestMD, reportMD],
  ];

  await fs.mkdir(artifacts.artifactsDir, { recursive: true });
  await fs.mkdir(scenarioArtifacts.disabledContractDir, { recursive: true });

  if (scenarioArtifacts.isDefaultScenario) {
    await fs.mkdir(artifacts.disabledContractDir, { recursive: true });
    writeTargets.push(
      [artifacts.disabledContractJSON, reportJSON],
      [artifacts.disabledContractMD, reportMD],
      [artifacts.disabledContractLatestJSON, reportJSON],
      [artifacts.disabledContractLatestMD, reportMD],
    );
  }

  await Promise.all(writeTargets.map(([filePath, contents]) => fs.writeFile(filePath, contents, "utf-8")));

  return {
    reportPath: scenarioArtifacts.disabledContractJSON,
    reportMDPath: scenarioArtifacts.disabledContractMD,
    latestJSONPath: scenarioArtifacts.disabledContractLatestJSON,
    latestMDPath: scenarioArtifacts.disabledContractLatestMD,
    defaultReportPath: scenarioArtifacts.isDefaultScenario ? artifacts.disabledContractJSON : null,
    defaultReportMDPath: scenarioArtifacts.isDefaultScenario ? artifacts.disabledContractMD : null,
  };
}

export async function inspectWasmKernelDisabledContract(projectRootPath = projectRoot, options = {}) {
  const absoluteProjectRoot = path.resolve(projectRootPath);
  const addonConfigPath = path.join(absoluteProjectRoot, "config", "addon.config.json");
  const packagePath = path.join(absoluteProjectRoot, "package.json");
  const pluginSourcePath = path.join(absoluteProjectRoot, "src", "app", "plugin.js");
  const hostActionsSourcePath = path.join(absoluteProjectRoot, "dev", "agent-runtime", "host-actions.js");
  const addonConfig = await readJSONFile(addonConfigPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    missingStage: "read-addon-config",
    invalidStage: "read-addon-config",
    label: addonConfigPath,
  });
  const packageJSON = await readJSONFile(packagePath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    missingStage: "read-package-json",
    invalidStage: "read-package-json",
    label: packagePath,
  });
  const pluginSource = await readTextIfExists(pluginSourcePath);
  const hostActionsSource = await readTextIfExists(hostActionsSourcePath);

  if (typeof pluginSource !== "string" || typeof hostActionsSource !== "string") {
    throw createScriptError("environment", "Missing plugin.js or dev host-actions.js source file", {
      failedStage: "read-source-contract",
      details: {
        pluginSourcePath,
        hostActionsSourcePath,
      },
    });
  }

  const { registry } = loadOptionalBundleRegistry(absoluteProjectRoot);
  const bundle = getOptionalBundle(registry, DEFAULT_BUNDLE_ID);
  const contractInspection = inspectOptionalBundleContracts(absoluteProjectRoot, {
    registry,
    packageJSON,
  });
  const assetInventory = await collectWasmKernelAssetInventory(absoluteProjectRoot, addonConfig.addonRef);
  const artifacts = resolveZoteroWasmKernelArtifacts(absoluteProjectRoot);
  const scenarioArtifacts = resolveZoteroWasmKernelScenarioArtifacts(
    absoluteProjectRoot,
    options.scenarioName || DEFAULT_WASM_KERNEL_SCENARIO_NAME,
  );
  const smokeReportPath = options.smokeReportPath || (
    scenarioArtifacts.isDefaultScenario
      ? artifacts.smokeJSON
      : scenarioArtifacts.smokeJSON
  );
  const performanceReportPath = options.performanceReportPath || (
    scenarioArtifacts.isDefaultScenario
      ? artifacts.performanceJSON
      : scenarioArtifacts.performanceJSON
  );
  const exportRootPath = options.exportRootPath || buildDefaultExportRoot(absoluteProjectRoot, addonConfig);
  const [smokeReport, performanceReport] = await Promise.all([
    readJSONIfExists(smokeReportPath, {
      missingStage: "read-smoke-report",
      invalidStage: "read-smoke-report",
      label: smokeReportPath,
    }),
    readJSONIfExists(performanceReportPath, {
      missingStage: "read-performance-report",
      invalidStage: "read-performance-report",
      label: performanceReportPath,
    }),
  ]);

  const registryContract = inspectWasmKernelRegistryContract({
    registry,
    bundle,
    contractInspection,
  });
  const packageScriptContract = inspectWasmKernelPackageScriptContract(packageJSON);
  const assetContract = inspectWasmKernelAssetContract(assetInventory);
  const exportContract = await inspectWasmKernelExportContract({
    exportRootPath,
  });
  const lazySourceContract = inspectWasmKernelLazySourceContract({
    pluginSource,
    hostActionsSource,
  });
  const smokeEvidence = inspectWasmKernelSmokeEvidence({
    smokeReport,
    smokeReportPath,
    scenarioName: options.scenarioName || DEFAULT_WASM_KERNEL_SCENARIO_NAME,
  });

  return summarizeWasmKernelDisabledContractReport({
    bundle,
    registryContract,
    packageScriptContract,
    assetContract,
    exportContract,
    lazySourceContract,
    smokeEvidence,
    performanceReport,
    scenarioName: options.scenarioName || DEFAULT_WASM_KERNEL_SCENARIO_NAME,
    artifactPaths: {
      scenarioName: options.scenarioName || DEFAULT_WASM_KERNEL_SCENARIO_NAME,
      smokeReportPath,
      performanceReportPath,
      pluginSourcePath,
      hostActionsSourcePath,
      exportRootPath,
    },
  });
}

async function main(argv = process.argv.slice(2)) {
  const options = parseWasmKernelDisabledContractArgs(argv);
  const report = await inspectWasmKernelDisabledContract(options.projectRootPath, options);
  const paths = await persistWasmKernelDisabledContractReport(report, {
    projectRootPath: options.projectRootPath,
  });
  console.log(`Wasm kernel disabled-contract report generated: ${paths.reportPath}`);
  if (report.status !== "passed") {
    process.exitCode = 1;
  }
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
