import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath } from "./agent-artifacts.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

const STATUS_LABELS = Object.freeze({
  "not-ready": "未就绪",
  attention: "关注",
  "ready-for-candidate": "可开启候选",
});

const DEFAULT_MATRIX_PATH = resolveAgentArtifactPath(projectRoot, "package-protection-matrix.json");
const DEFAULT_RETAINED_REVIEW_PATH = resolveAgentArtifactPath(projectRoot, "package-protection-retained-review.json");
const DEFAULT_WASM_MATRIX_PATH = resolveAgentArtifactPath(projectRoot, "wasm-kernel-matrix.json");
const DEFAULT_REGISTRY_PATH = path.join(projectRoot, "config", "package-protection-candidates.json");

function normalizeNonEmptyString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeArray(values = []) {
  return Array.isArray(values)
    ? values.map((value) => normalizeNonEmptyString(value)).filter(Boolean)
    : [];
}

function normalizeCandidateRegistry(registry = {}) {
  return {
    schemaVersion: Number(registry?.schemaVersion || 1),
    updatedAt: normalizeNonEmptyString(registry?.updatedAt),
    summary: normalizeNonEmptyString(registry?.summary),
    candidates: Array.isArray(registry?.candidates)
      ? registry.candidates.map((candidate) => ({
        id: normalizeNonEmptyString(candidate?.id),
        class: normalizeNonEmptyString(candidate?.class),
        stage: normalizeNonEmptyString(candidate?.stage),
        baseVariant: normalizeNonEmptyString(candidate?.baseVariant),
        executionMode: normalizeNonEmptyString(candidate?.executionMode),
        evaluationKind: normalizeNonEmptyString(candidate?.evaluationKind),
        compareVariant: normalizeNonEmptyString(candidate?.compareVariant),
        variant: normalizeNonEmptyString(candidate?.variant),
        channel: normalizeNonEmptyString(candidate?.channel) || "stable",
        status: normalizeNonEmptyString(candidate?.status),
        summary: normalizeNonEmptyString(candidate?.summary),
      })).filter((candidate) => candidate.id)
      : [],
  };
}

function normalizeResidualAnchorIDs(values = []) {
  return normalizeArray(values).sort((left, right) => left.localeCompare(right));
}

function hasManifestOnlyResidualFloor(topCandidate = null) {
  const residualExposedFiles = normalizeArray(topCandidate?.signals?.residualExposedFiles);
  const residualAnchorIds = normalizeResidualAnchorIDs(topCandidate?.signals?.residualAnchorIds);
  const allowedResidualAnchors = new Set([
    "addon-version-literal",
    "update-url-literal",
  ]);
  return topCandidate?.signals?.residualFloorReached === true
    && residualExposedFiles.length === 1
    && residualExposedFiles[0] === "manifest.json"
    && residualAnchorIds.length > 0
    && residualAnchorIds.every((id) => allowedResidualAnchors.has(id));
}

function selectRoute5WasmCandidate(registry = null) {
  const candidates = Array.isArray(registry?.candidates) ? registry.candidates : [];
  return candidates.find((candidate) => candidate.id === "shielded-surface-scrub-wasm-digest")
    || candidates.find((candidate) => candidate.id === "wasm-mini-kernel-preplan")
    || candidates.find((candidate) => candidate.stage === "route5-wasm")
    || null;
}

function buildWasmLaneSummary(wasmMatrix = null, registry = null) {
  const bundle = wasmMatrix?.registry?.bundle || {};
  const route5Candidate = selectRoute5WasmCandidate(registry);
  const digestScenario = Array.isArray(wasmMatrix?.scenarios)
    ? wasmMatrix.scenarios.find((scenario) => normalizeNonEmptyString(scenario?.key) === "digest") || null
    : null;
  const digestTargetLocked = Boolean(
    digestScenario?.status === "passed"
    || route5Candidate?.id === "shielded-surface-scrub-wasm-digest"
    || String(route5Candidate?.summary || "").includes("digest"),
  );
  const planned = normalizeNonEmptyString(bundle?.implementationStatus) === "planned";
  const defaultDisabled = bundle?.enabled === false;
  const matrixPassed = normalizeNonEmptyString(wasmMatrix?.status) === "passed";

  return {
    present: Boolean(wasmMatrix),
    status: normalizeNonEmptyString(wasmMatrix?.status) || "missing",
    nextAction: normalizeNonEmptyString(wasmMatrix?.nextAction),
    summary: normalizeNonEmptyString(wasmMatrix?.summary),
    bundleId: normalizeNonEmptyString(bundle?.id),
    implementationStatus: normalizeNonEmptyString(bundle?.implementationStatus),
    defaultDisabled,
    planned,
    matrixPassed,
    digestTargetLocked,
    route5Candidate: route5Candidate ? {
      id: route5Candidate.id,
      class: route5Candidate.class,
      stage: route5Candidate.stage,
      baseVariant: route5Candidate.baseVariant,
      compareVariant: route5Candidate.compareVariant,
      status: route5Candidate.status,
      summary: route5Candidate.summary,
    } : null,
  };
}

export function parsePackageProtectionWasmAdmissionArgs(argv = process.argv.slice(2)) {
  const options = {
    projectRootPath: projectRoot,
    matrixPath: DEFAULT_MATRIX_PATH,
    retainedReviewPath: DEFAULT_RETAINED_REVIEW_PATH,
    wasmMatrixPath: DEFAULT_WASM_MATRIX_PATH,
    registryPath: DEFAULT_REGISTRY_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--project-root":
        options.projectRootPath = path.resolve(String(argv[index + 1] || "").trim() || projectRoot);
        index += 1;
        break;
      case "--matrix":
        options.matrixPath = path.resolve(String(argv[index + 1] || "").trim() || DEFAULT_MATRIX_PATH);
        index += 1;
        break;
      case "--retained-review":
        options.retainedReviewPath = path.resolve(String(argv[index + 1] || "").trim() || DEFAULT_RETAINED_REVIEW_PATH);
        index += 1;
        break;
      case "--wasm-matrix":
        options.wasmMatrixPath = path.resolve(String(argv[index + 1] || "").trim() || DEFAULT_WASM_MATRIX_PATH);
        index += 1;
        break;
      case "--registry":
        options.registryPath = path.resolve(String(argv[index + 1] || "").trim() || DEFAULT_REGISTRY_PATH);
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

  return options;
}

async function readJSONIfExists(filePath, options = {}) {
  try {
    return await readJSONFile(filePath, options);
  } catch (error) {
    if (error?.scriptErrorCategory === "environment" && String(error?.message || "").includes("Missing JSON file")) {
      return null;
    }
    throw error;
  }
}

export function summarizePackageProtectionWasmAdmission({
  matrixReport = null,
  retainedReviewReport = null,
  wasmMatrixReport = null,
  registry = null,
} = {}) {
  const normalizedRegistry = normalizeCandidateRegistry(registry);
  const topCandidate = retainedReviewReport?.topCandidate || null;
  const protectionPassed = normalizeNonEmptyString(matrixReport?.status) === "passed";
  const retainedTopSurfaceScrub = normalizeNonEmptyString(topCandidate?.id) === "shielded-surface-scrub";
  const residualFloorReached = hasManifestOnlyResidualFloor(topCandidate);
  const wasmLane = buildWasmLaneSummary(wasmMatrixReport, normalizedRegistry);
  const wasmLaneReady = wasmLane.present
    && wasmLane.matrixPassed
    && wasmLane.planned
    && wasmLane.defaultDisabled
    && wasmLane.digestTargetLocked;

  let status = "not-ready";
  let nextAction = "keep-current-shielded";
  let summary = "当前 protection 主线尚未满足 Wasm 候选准入前置条件，先继续保持 current shielded。";

  if (!protectionPassed) {
    status = "not-ready";
    nextAction = "keep-current-shielded";
    summary = "package protection matrix 还未 fresh 通过，当前不打开 Wasm candidate wave。";
  } else if (!retainedTopSurfaceScrub || !residualFloorReached) {
    status = "attention";
    nextAction = "freeze-surface-scrub-retained";
    summary = "shielded-surface-scrub 还没有稳定收口为 top retained candidate + manifest 残余下限，先冻结 Stage 2 结论。";
  } else if (!wasmLaneReady) {
    status = "attention";
    nextAction = "refresh-wasm-matrix";
    summary = "Wasm lane 还未同时满足 planned + default-disabled + fresh matrix passed + digest micro-kernel 锁定，先刷新 Wasm matrix。";
  } else {
    status = "ready-for-candidate";
    nextAction = "open-wasm-candidate-wave";
    summary = "当前 protection 主线已 fresh 通过，shielded-surface-scrub 已冻结为 top retained candidate，Wasm digest lane 也满足 planned + default-disabled + fresh matrix passed；可以打开显式 Wasm protection candidate wave。";
  }

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status,
    statusLabel: STATUS_LABELS[status] || STATUS_LABELS.attention,
    summary,
    nextAction,
    sources: {
      matrixPresent: Boolean(matrixReport),
      retainedReviewPresent: Boolean(retainedReviewReport),
      wasmMatrixPresent: Boolean(wasmMatrixReport),
      registryPresent: Boolean(registry),
    },
    protection: {
      present: Boolean(matrixReport),
      status: normalizeNonEmptyString(matrixReport?.status) || "missing",
      nextAction: normalizeNonEmptyString(matrixReport?.nextAction),
      summary: normalizeNonEmptyString(matrixReport?.summary),
      freshUsable: protectionPassed,
    },
    retained: {
      present: Boolean(retainedReviewReport),
      status: normalizeNonEmptyString(retainedReviewReport?.status) || "missing",
      nextAction: normalizeNonEmptyString(retainedReviewReport?.nextAction),
      topCandidate: topCandidate ? {
        id: normalizeNonEmptyString(topCandidate?.id),
        variant: normalizeNonEmptyString(topCandidate?.variant),
        channel: normalizeNonEmptyString(topCandidate?.channel) || "stable",
        compareStatus: normalizeNonEmptyString(topCandidate?.compareStatus),
        compareDecision: normalizeNonEmptyString(topCandidate?.compareDecision),
        residualFloorReached: topCandidate?.signals?.residualFloorReached === true,
        residualExposedFiles: normalizeArray(topCandidate?.signals?.residualExposedFiles),
        residualAnchorIds: normalizeArray(topCandidate?.signals?.residualAnchorIds),
      } : null,
      topCandidateRetained: retainedTopSurfaceScrub,
      residualFloorReached,
    },
    wasmLane,
    registry: {
      schemaVersion: normalizedRegistry.schemaVersion,
      updatedAt: normalizedRegistry.updatedAt,
      candidateCount: normalizedRegistry.candidates.length,
    },
    verdict: {
      protectionFreshUsable: protectionPassed,
      retainedTopSurfaceScrub,
      retainedResidualFloorReached: residualFloorReached,
      wasmLaneReady,
      digestTargetLocked: wasmLane.digestTargetLocked,
    },
  };
}

export function renderPackageProtectionWasmAdmissionMarkdown(report = {}) {
  const lines = [
    "# Package Protection Wasm Admission",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- 状态: \`${report.statusLabel || "-"}\``,
    `- nextAction: \`${report.nextAction || "-"}\``,
    `- 摘要: ${report.summary || "-"}`,
    "",
    "## Protection",
    "",
    `- present: \`${report.protection?.present ? "yes" : "no"}\``,
    `- status: \`${report.protection?.status || "-"}\``,
    `- freshUsable: \`${report.protection?.freshUsable ? "yes" : "no"}\``,
    `- nextAction: \`${report.protection?.nextAction || "-"}\``,
    `- summary: ${report.protection?.summary || "-"}`,
    "",
    "## Retained",
    "",
    `- present: \`${report.retained?.present ? "yes" : "no"}\``,
    `- status: \`${report.retained?.status || "-"}\``,
    `- nextAction: \`${report.retained?.nextAction || "-"}\``,
    `- topCandidate: \`${report.retained?.topCandidate?.id || "-"}\``,
    `- topCandidateRetained: \`${report.retained?.topCandidateRetained ? "yes" : "no"}\``,
    `- residualFloorReached: \`${report.retained?.residualFloorReached ? "yes" : "no"}\``,
    `- residualExposedFiles: \`${(report.retained?.topCandidate?.residualExposedFiles || []).join(", ") || "-"}\``,
    `- residualAnchorIds: \`${(report.retained?.topCandidate?.residualAnchorIds || []).join(", ") || "-"}\``,
    "",
    "## Wasm Lane",
    "",
    `- present: \`${report.wasmLane?.present ? "yes" : "no"}\``,
    `- status: \`${report.wasmLane?.status || "-"}\``,
    `- bundleId: \`${report.wasmLane?.bundleId || "-"}\``,
    `- implementationStatus: \`${report.wasmLane?.implementationStatus || "-"}\``,
    `- defaultDisabled: \`${report.wasmLane?.defaultDisabled ? "yes" : "no"}\``,
    `- planned: \`${report.wasmLane?.planned ? "yes" : "no"}\``,
    `- matrixPassed: \`${report.wasmLane?.matrixPassed ? "yes" : "no"}\``,
    `- digestTargetLocked: \`${report.wasmLane?.digestTargetLocked ? "yes" : "no"}\``,
    `- route5Candidate: \`${report.wasmLane?.route5Candidate?.id || "-"}\``,
    `- route5Class: \`${report.wasmLane?.route5Candidate?.class || "-"}\``,
    `- route5BaseVariant: \`${report.wasmLane?.route5Candidate?.baseVariant || "-"}\``,
    `- route5CompareVariant: \`${report.wasmLane?.route5Candidate?.compareVariant || "-"}\``,
    `- nextAction: \`${report.wasmLane?.nextAction || "-"}\``,
    `- summary: ${report.wasmLane?.summary || "-"}`,
    "",
    "## Verdict",
    "",
    `- protectionFreshUsable: \`${report.verdict?.protectionFreshUsable ? "yes" : "no"}\``,
    `- retainedTopSurfaceScrub: \`${report.verdict?.retainedTopSurfaceScrub ? "yes" : "no"}\``,
    `- retainedResidualFloorReached: \`${report.verdict?.retainedResidualFloorReached ? "yes" : "no"}\``,
    `- wasmLaneReady: \`${report.verdict?.wasmLaneReady ? "yes" : "no"}\``,
    `- digestTargetLocked: \`${report.verdict?.digestTargetLocked ? "yes" : "no"}\``,
  ];

  return lines.join("\n");
}

export async function persistPackageProtectionWasmAdmission(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const reportPath = resolveAgentArtifactPath(projectRootPath, "package-protection-wasm-admission.json");
  const reportMDPath = resolveAgentArtifactPath(projectRootPath, "package-protection-wasm-admission.md");

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionWasmAdmissionMarkdown(report)}\n`, "utf-8"),
  ]);

  return {
    reportPath,
    reportMDPath,
  };
}

async function loadPackageProtectionWasmAdmissionInputs(options = {}) {
  const matrixReport = await readJSONIfExists(options.matrixPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-protection-matrix",
    label: options.matrixPath,
  });
  const retainedReviewReport = await readJSONIfExists(options.retainedReviewPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-retained-review",
    label: options.retainedReviewPath,
  });
  const wasmMatrixReport = await readJSONIfExists(options.wasmMatrixPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-wasm-matrix",
    label: options.wasmMatrixPath,
  });
  const registry = await readJSONIfExists(options.registryPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-registry",
    label: options.registryPath,
  });

  return {
    matrixReport,
    retainedReviewReport,
    wasmMatrixReport,
    registry,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionWasmAdmissionArgs(argv);
  const inputs = await loadPackageProtectionWasmAdmissionInputs(options);
  const report = summarizePackageProtectionWasmAdmission(inputs);
  const paths = await persistPackageProtectionWasmAdmission(report, {
    projectRootPath: options.projectRootPath,
  });
  console.log(`Package protection Wasm admission report written: ${paths.reportPath}`);
  console.log(`status=${report.status} nextAction=${report.nextAction}`);
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
