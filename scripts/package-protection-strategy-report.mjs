import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
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
  passed: "清晰",
  attention: "关注",
});

const DEFAULT_MATRIX_PATH = resolveAgentArtifactPath(projectRoot, "package-protection-matrix.json");
const DEFAULT_RETAINED_REVIEW_PATH = resolveAgentArtifactPath(projectRoot, "package-protection-retained-review.json");
const DEFAULT_WASM_ADMISSION_PATH = resolveAgentArtifactPath(projectRoot, "package-protection-wasm-admission.json");
const DEFAULT_REGISTRY_PATH = path.join(projectRoot, "config", "package-protection-candidates.json");

function normalizeNonEmptyString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function buildCandidateIndex(registry = null) {
  return new Map(
    (Array.isArray(registry?.candidates) ? registry.candidates : [])
      .filter((candidate) => normalizeNonEmptyString(candidate?.id))
      .map((candidate) => [candidate.id, candidate]),
  );
}

function buildLaneSummary(candidate, fallback = {}) {
  if (!candidate) {
    return {
      present: false,
      id: fallback.id || null,
      command: fallback.command || null,
      status: "missing",
      summary: fallback.summary || "未收集到该 lane 的候选信息。",
    };
  }

  return {
    present: true,
    id: normalizeNonEmptyString(candidate.id),
    command: fallback.command || null,
    status: normalizeNonEmptyString(candidate.status) || "unknown",
    class: normalizeNonEmptyString(candidate.class),
    baseVariant: normalizeNonEmptyString(candidate.baseVariant),
    compareVariant: normalizeNonEmptyString(candidate.compareVariant),
    summary: normalizeNonEmptyString(candidate.summary) || fallback.summary || "已存在候选定义。",
  };
}

export function parsePackageProtectionStrategyArgs(argv = process.argv.slice(2)) {
  const options = {
    projectRootPath: projectRoot,
    matrixPath: DEFAULT_MATRIX_PATH,
    retainedReviewPath: DEFAULT_RETAINED_REVIEW_PATH,
    wasmAdmissionPath: DEFAULT_WASM_ADMISSION_PATH,
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
      case "--wasm-admission":
        options.wasmAdmissionPath = path.resolve(String(argv[index + 1] || "").trim() || DEFAULT_WASM_ADMISSION_PATH);
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

async function readJSONIfExists(filePath, metadata = {}) {
  try {
    return await readJSONFile(filePath, {
      missingCategory: "environment",
      invalidCategory: "validation",
      missingStage: metadata.failedStage || "read-json",
      invalidStage: metadata.failedStage || "read-json",
      label: metadata.label || filePath,
    });
  } catch (error) {
    if (error?.scriptErrorCategory === "environment" && String(error?.message || "").includes("Missing JSON file")) {
      return null;
    }
    throw error;
  }
}

export function summarizePackageProtectionStrategy({
  matrixReport = null,
  retainedReviewReport = null,
  wasmAdmissionReport = null,
  registry = null,
} = {}) {
  const candidateIndex = buildCandidateIndex(registry);
  const baseline = buildLaneSummary(candidateIndex.get("encrypted"), {
    id: "encrypted",
    command: "npm run package:encrypted",
    summary: "当前最稳的低开销手动受保护导出基线。",
  });
  const primary = buildLaneSummary(candidateIndex.get("shielded"), {
    id: "shielded",
    command: "npm run package:shielded",
    summary: "当前 primary 手动强保护导出入口。",
  });
  const retainedTopCandidateId = normalizeNonEmptyString(retainedReviewReport?.topCandidate?.id);
  const retainedTop = buildLaneSummary(
    retainedTopCandidateId ? candidateIndex.get(retainedTopCandidateId) : null,
    {
      id: retainedTopCandidateId || "shielded-surface-scrub",
      command: retainedTopCandidateId === "shielded-surface-scrub"
        ? "npm run package:shielded:surface-scrub"
        : null,
      summary: normalizeNonEmptyString(retainedReviewReport?.summary) || "未收集到 retained top candidate。",
    },
  );
  const wasmRouteCandidateId = normalizeNonEmptyString(wasmAdmissionReport?.wasmLane?.route5Candidate?.id);
  const wasmRoute = buildLaneSummary(
    wasmRouteCandidateId ? candidateIndex.get(wasmRouteCandidateId) : null,
    {
      id: wasmRouteCandidateId || "shielded-surface-scrub-wasm-digest",
      command: "npm run package:shielded:surface-scrub:wasm:digest",
      summary: normalizeNonEmptyString(wasmAdmissionReport?.summary) || "Wasm lane 当前未进入显式候选波次。",
    },
  );

  const matrixPassed = normalizeNonEmptyString(matrixReport?.status) === "passed";
  const retainedTopIsSurfaceScrub = retainedTop.id === "shielded-surface-scrub";
  const wasmReady = normalizeNonEmptyString(wasmAdmissionReport?.status) === "ready-for-candidate"
    && wasmRoute.id === "shielded-surface-scrub-wasm-digest";

  let status = "passed";
  let nextAction = "keep-surface-scrub-advisory";
  let summary = "当前保护打包策略已收口：encrypted 继续做低开销基线，shielded 继续做 current primary，shielded-surface-scrub 保持 retained top hardening candidate。";

  if (!matrixPassed || !primary.present) {
    status = "attention";
    nextAction = "keep-current-shielded";
    summary = "当前 protection matrix 或 current primary 信息不完整，先继续保持 shielded，并刷新 matrix / retained review 等证据。";
  } else if (!retainedTopIsSurfaceScrub) {
    status = "attention";
    nextAction = "keep-surface-scrub-advisory";
    summary = "retained top candidate 还没有稳定收口到 shielded-surface-scrub，先冻结 retained review，再决定是否继续提升 hardening 候选。";
  } else if (wasmReady) {
    nextAction = "keep-surface-scrub-advisory";
    summary = "当前保护打包策略已收口：shielded 继续做 current primary，shielded-surface-scrub 保持 retained top hardening candidate；Wasm digest lane 已具备显式候选条件，但仍只保留为 bounded experiment。";
  }

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status,
    statusLabel: STATUS_LABELS[status] || STATUS_LABELS.attention,
    summary,
    nextAction,
    releaseBoundary: "manual-advisory-only",
    lanes: {
      baseline,
      primary,
      retainedTop,
      wasmRoute: {
        ...wasmRoute,
        readyForCandidate: wasmReady,
      },
    },
    recommendations: [
      {
        role: "daily-baseline",
        label: "日常低开销手动保护包",
        command: "npm run package:encrypted",
        summary: "默认优先用 encrypted，成本最低，也最适合日常导出。",
      },
      {
        role: "current-primary",
        label: "当前 primary 强保护包",
        command: "npm run package:shielded",
        summary: "需要进一步提高自动化工具和一轮 AI 的快速直读门槛时，继续使用 shielded。",
      },
      {
        role: "retained-hardening",
        label: "当前推荐高级 hardening 候选",
        command: "npm run package:shielded:surface-scrub",
        summary: "surface-scrub 当前是 retained top candidate，适合在不改变默认 shielded 的前提下做进一步静态 support-surface 收缩。",
      },
      {
        role: "bounded-wasm-experiment",
        label: "有边界的 Wasm 微内核实验",
        command: "npm run package:shielded:surface-scrub:wasm:digest",
        summary: wasmReady
          ? "Wasm digest lane 已具备显式候选条件，但当前仍不替代 shielded 或 surface-scrub。"
          : "Wasm lane 只保留为后续窄微内核实验，不进入默认主推荐路线。",
      },
    ],
  };
}

export function renderPackageProtectionStrategyMarkdown(report) {
  const lines = [
    "# Package Protection Strategy",
    "",
    `- 生成时间: \`${report.generatedAt}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- 状态: \`${report.statusLabel}\``,
    `- nextAction: \`${report.nextAction}\``,
    `- releaseBoundary: \`${report.releaseBoundary}\``,
    `- 摘要: ${report.summary}`,
    "",
    "## Lanes",
    "",
  ];

  const laneSpecs = [
    ["baseline", "Baseline"],
    ["primary", "Primary"],
    ["retainedTop", "Retained Top"],
    ["wasmRoute", "Wasm Route"],
  ];
  laneSpecs.forEach(([key, label]) => {
    const lane = report.lanes?.[key] || {};
    lines.push(`### ${label}`);
    lines.push("");
    lines.push(`- present: \`${lane.present ? "yes" : "no"}\``);
    lines.push(`- id: \`${lane.id || "-"}\``);
    lines.push(`- status: \`${lane.status || "-"}\``);
    lines.push(`- command: \`${lane.command || "-"}\``);
    if (key === "wasmRoute") {
      lines.push(`- readyForCandidate: \`${lane.readyForCandidate ? "yes" : "no"}\``);
    }
    lines.push(`- summary: ${lane.summary || "-"}`);
    lines.push("");
  });

  lines.push("## Recommendations", "");
  (Array.isArray(report.recommendations) ? report.recommendations : []).forEach((item) => {
    lines.push(`### ${item.label}`);
    lines.push("");
    lines.push(`- role: \`${item.role}\``);
    lines.push(`- command: \`${item.command}\``);
    lines.push(`- summary: ${item.summary}`);
    lines.push("");
  });

  return lines.join("\n");
}

export async function persistPackageProtectionStrategy(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const reportPath = resolveAgentArtifactPath(projectRootPath, "package-protection-strategy.json");
  const reportMDPath = resolveAgentArtifactPath(projectRootPath, "package-protection-strategy.md");

  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionStrategyMarkdown(report)}\n`, "utf-8"),
  ]);

  return {
    reportPath,
    reportMDPath,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionStrategyArgs(argv);
  const matrixReport = await readJSONIfExists(options.matrixPath, {
    failedStage: "read-matrix",
    label: options.matrixPath,
  });
  const retainedReviewReport = await readJSONIfExists(options.retainedReviewPath, {
    failedStage: "read-retained-review",
    label: options.retainedReviewPath,
  });
  const wasmAdmissionReport = await readJSONIfExists(options.wasmAdmissionPath, {
    failedStage: "read-wasm-admission",
    label: options.wasmAdmissionPath,
  });
  const registry = await readJSONIfExists(options.registryPath, {
    failedStage: "read-registry",
    label: options.registryPath,
  });
  const report = summarizePackageProtectionStrategy({
    matrixReport,
    retainedReviewReport,
    wasmAdmissionReport,
    registry,
  });
  const paths = await persistPackageProtectionStrategy(report, {
    projectRootPath: options.projectRootPath,
  });
  console.log(`Package protection strategy generated: ${paths.reportPath}`);
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
