import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import { normalizePackageProtectionSmokeReport } from "./package-protection-smoke.mjs";
import {
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();
const DEFAULT_REGISTRY_PATH = path.join(projectRoot, "config", "package-protection-candidates.json");

const STATUS_LABELS = Object.freeze({
  passed: "通过",
  attention: "关注",
  missing: "缺失",
});

const TASK_PRIORITY_ORDER = Object.freeze({
  "p0-current-gap": 0,
  "p1-experiment-gap": 1,
  "p2-experiment-review": 2,
});

const TASK_PRIORITY_LABELS = Object.freeze({
  "p0-current-gap": "Current Gap",
  "p1-experiment-gap": "Experiment Gap",
  "p2-experiment-review": "Experiment Review",
});

const TASK_KIND_ORDER = Object.freeze({
  "refresh-attack-report": 0,
  "collect-single-pass-automation-evidence": 1,
  "collect-guided-a2-m3-evidence": 2,
  "collect-experimental-llm-symmetry-evidence": 3,
  "review-experimental-hardening": 4,
});

const COMPARE_STATUS_ORDER = Object.freeze({
  passed: 0,
  attention: 1,
  missing: 2,
  failed: 3,
});

const COMPARE_DECISION_ORDER = Object.freeze({
  "hardening-win": 0,
  "runtime-only": 1,
  "needs-manual-ab": 2,
  "leaning-same": 3,
  "missing-evidence": 4,
  regression: 5,
});

function normalizeNonEmptyString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeArray(values = []) {
  return Array.isArray(values)
    ? values.map((item) => normalizeNonEmptyString(item)).filter(Boolean)
    : [];
}

function normalizeFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function pickStatusLabel(status) {
  return STATUS_LABELS[String(status || "").trim()] || STATUS_LABELS.attention;
}

function normalizeCandidateRegistry(registry = {}) {
  const candidates = Array.isArray(registry?.candidates)
    ? registry.candidates.map((candidate) => ({
      id: normalizeNonEmptyString(candidate?.id),
      class: normalizeNonEmptyString(candidate?.class) || "unknown",
      stage: normalizeNonEmptyString(candidate?.stage) || "unknown",
      variant: normalizeNonEmptyString(candidate?.variant),
      compareVariant: normalizeNonEmptyString(candidate?.compareVariant),
      channel: normalizeNonEmptyString(candidate?.channel) || "stable",
      artifactCoverage: normalizeArray(candidate?.artifactCoverage),
      promotionGate: normalizeNonEmptyString(candidate?.promotionGate) || "advisory-only",
      status: normalizeNonEmptyString(candidate?.status) || "unknown",
      summary: normalizeNonEmptyString(candidate?.summary) || "No summary provided.",
    })).filter((candidate) => candidate.id)
    : [];

  return {
    schemaVersion: Number(registry?.schemaVersion || 1),
    updatedAt: normalizeNonEmptyString(registry?.updatedAt),
    summary: normalizeNonEmptyString(registry?.summary),
    candidates,
  };
}

function indexByID(items = []) {
  return new Map(
    items
      .filter((item) => normalizeNonEmptyString(item?.id))
      .map((item) => [item.id, item]),
  );
}

function indexSmokeReports(smokeAggregate = null) {
  const reports = Array.isArray(smokeAggregate?.reports)
    ? smokeAggregate.reports.map((report) => normalizePackageProtectionSmokeReport(report))
    : [];
  return new Map(
    reports.map((report) => [`${report.variant}:${report.channel}`, report]),
  );
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

function buildSinglePassCommands({ variant, channel, webcrackMissing, llmMissing }) {
  const commands = [];

  if (webcrackMissing) {
    commands.push(`npm run package:protection:webcrack -- --variant ${variant} --channel ${channel}`);
    commands.push(`npm run package:protection:webcrack:score -- --variant ${variant} --channel ${channel}`);
  }

  if (llmMissing) {
    commands.push(`npm run package:protection:score:llm -- --variant ${variant} --channel ${channel} --llm "<rating>"`);
  }

  return commands;
}

function buildGuidedA2M3Commands({ variant, channel }) {
  return [
    `npm run package:protection:score:guided -- --variant ${variant} --channel ${channel} --rating "<rating>" --result-tier <R0|R1|R2|R3|R4> --attacker-tier A2 --ai-tier M3 --attack-method static+reference --time-bucket 30-120m --round-mode multi-round --summary "<summary>"`,
  ];
}

function buildCompareCommands({ variant, channel }) {
  return [
    `npm run package:protection:compare -- --variant ${variant} --channel ${channel}`,
    "npm run package:protection:attack",
    "npm run package:protection:matrix",
  ];
}

function buildExperimentLLMSymmetryCommands({ variant, channel }) {
  return [
    `npm run package:protection:score:llm -- --variant ${variant} --channel ${channel} --llm "<rating>"`,
    `npm run package:protection:compare -- --variant ${variant} --channel ${channel}`,
    "npm run package:protection:attack",
    "npm run package:protection:matrix",
    "npm run package:protection:review",
  ];
}

function buildMissingAttackEvidenceTask() {
  return {
    id: "refresh-attack-artifacts",
    priority: "p0-current-gap",
    priorityLabel: TASK_PRIORITY_LABELS["p0-current-gap"],
    kind: "refresh-attack-report",
    candidateId: null,
    candidateClass: "controller",
    variant: null,
    channel: null,
    role: null,
    summary: "缺少 package protection attack report，先刷新攻击证据汇总工件。",
    rationale: "guided-attack plan 依赖现有 attack report / matrix 工件；当前至少需要先重新生成 attack report。",
    commands: [
      "npm run package:protection:attack",
      "npm run package:protection:matrix",
    ],
  };
}

function buildSinglePassTask({ candidate, attackCandidate, matrixCandidate, smokeReport }) {
  const variant = attackCandidate?.variant || candidate.variant || candidate.compareVariant || null;
  const channel = attackCandidate?.channel || candidate.channel || "stable";
  const webcrackMissing = !normalizeNonEmptyString(attackCandidate?.attack?.webcrackRating);
  const llmMissing = !normalizeNonEmptyString(attackCandidate?.attack?.llmSinglePassRating);
  const missingParts = [
    webcrackMissing ? "webcrack" : null,
    llmMissing ? "single-pass-llm" : null,
  ].filter(Boolean);
  const smokeStatus = normalizeNonEmptyString(smokeReport?.status) || "missing";

  return {
    id: `${candidate.id}-${channel}-single-pass`,
    priority: "p0-current-gap",
    priorityLabel: TASK_PRIORITY_LABELS["p0-current-gap"],
    kind: "collect-single-pass-automation-evidence",
    candidateId: candidate.id,
    candidateClass: candidate.class,
    variant,
    channel,
    role: normalizeNonEmptyString(matrixCandidate?.signals?.verdictRole),
    summary: `${candidate.id} 仍缺 fixed single-pass coverage，需要补 ${missingParts.join(" + ") || "single-pass evidence"}。`,
    rationale: `attack report 当前把 ${candidate.id} 的 fixed single-pass coverage 标成 incomplete；smoke=${smokeStatus}，manual single-pass rating 仍不足以支持稳定结论。`,
    commands: buildSinglePassCommands({
      variant,
      channel,
      webcrackMissing,
      llmMissing,
    }),
    missingCoverage: missingParts,
  };
}

function buildGuidedA2M3Task({ candidate, attackCandidate, matrixCandidate }) {
  const variant = attackCandidate?.variant || candidate.variant || candidate.compareVariant || null;
  const channel = attackCandidate?.channel || candidate.channel || "stable";
  const strongestProfile = attackCandidate?.attack?.guidedAttack || {};
  return {
    id: `${candidate.id}-${channel}-guided-a2-m3`,
    priority: "p0-current-gap",
    priorityLabel: TASK_PRIORITY_LABELS["p0-current-gap"],
    kind: "collect-guided-a2-m3-evidence",
    candidateId: candidate.id,
    candidateClass: candidate.class,
    variant,
    channel,
    role: normalizeNonEmptyString(matrixCandidate?.signals?.verdictRole),
    summary: `${candidate.id} 仍缺固定 A2/M3 guided profile 覆盖。`,
    rationale: `当前最强已记录画像是 ${[
      strongestProfile.attackerTier || "-",
      strongestProfile.aiTier || "-",
      strongestProfile.attackMethod || "-",
      strongestProfile.roundMode || "-",
      strongestProfile.timeBucket || "-",
    ].join(" / ")}；还没有补到 A2 / M3 / static+reference / multi-round / 30-120m。`,
    commands: buildGuidedA2M3Commands({
      variant,
      channel,
    }),
    missingCoverage: ["guidedA2M3"],
  };
}

function compareNullableNumber(left, right, options = {}) {
  const missingRank = Number(options.missingRank ?? Number.MAX_SAFE_INTEGER);
  const leftValue = normalizeFiniteNumber(left);
  const rightValue = normalizeFiniteNumber(right);
  const leftRank = leftValue === null ? missingRank : leftValue;
  const rightRank = rightValue === null ? missingRank : rightValue;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return 0;
}

function buildExperimentReviewPriority(matrixCandidate = null, compareReport = null) {
  const signals = matrixCandidate?.signals || {};
  const auditComparison = compareReport?.auditComparison || {};
  const deltas = compareReport?.deltas || {};
  return {
    compareStatus: normalizeNonEmptyString(compareReport?.status)
      || normalizeNonEmptyString(signals.compareStatus)
      || "missing",
    compareDecision: normalizeNonEmptyString(compareReport?.decision)
      || normalizeNonEmptyString(signals.compareDecision)
      || "missing-evidence",
    unpackedAnchorDeltaCount: normalizeFiniteNumber(auditComparison?.unpackedAnchorDeltaCount),
    unpackedMatchDeltaCount: normalizeFiniteNumber(auditComparison?.unpackedMatchDeltaCount),
    rawAnchorDeltaCount: normalizeFiniteNumber(auditComparison?.rawAnchorDeltaCount ?? signals.rawAnchorDelta),
    rawMatchDeltaCount: normalizeFiniteNumber(auditComparison?.rawMatchDeltaCount ?? signals.rawMatchDelta),
    xpiDelta: normalizeFiniteNumber(deltas?.xpiBytes ?? signals.xpiDelta),
    bundleDelta: normalizeFiniteNumber(deltas?.bundleBytes ?? signals.bundleDelta),
    decodeDelta: normalizeFiniteNumber(deltas?.decodeDurationMs ?? signals.decodeDelta),
    prepareDelta: normalizeFiniteNumber(deltas?.prepareDurationMs ?? signals.prepareDelta),
  };
}

function compareExperimentReviewPriority(left = {}, right = {}) {
  const leftStatusRank = Number(COMPARE_STATUS_ORDER[left.compareStatus] ?? Number.MAX_SAFE_INTEGER);
  const rightStatusRank = Number(COMPARE_STATUS_ORDER[right.compareStatus] ?? Number.MAX_SAFE_INTEGER);
  if (leftStatusRank !== rightStatusRank) {
    return leftStatusRank - rightStatusRank;
  }

  const leftDecisionRank = Number(COMPARE_DECISION_ORDER[left.compareDecision] ?? Number.MAX_SAFE_INTEGER);
  const rightDecisionRank = Number(COMPARE_DECISION_ORDER[right.compareDecision] ?? Number.MAX_SAFE_INTEGER);
  if (leftDecisionRank !== rightDecisionRank) {
    return leftDecisionRank - rightDecisionRank;
  }

  const unpackedAnchorDelta = compareNullableNumber(left.unpackedAnchorDeltaCount, right.unpackedAnchorDeltaCount);
  if (unpackedAnchorDelta !== 0) {
    return unpackedAnchorDelta;
  }

  const unpackedMatchDelta = compareNullableNumber(left.unpackedMatchDeltaCount, right.unpackedMatchDeltaCount);
  if (unpackedMatchDelta !== 0) {
    return unpackedMatchDelta;
  }

  const xpiDelta = compareNullableNumber(left.xpiDelta, right.xpiDelta);
  if (xpiDelta !== 0) {
    return xpiDelta;
  }

  const prepareDelta = compareNullableNumber(left.prepareDelta, right.prepareDelta);
  if (prepareDelta !== 0) {
    return prepareDelta;
  }

  const decodeDelta = compareNullableNumber(left.decodeDelta, right.decodeDelta);
  if (decodeDelta !== 0) {
    return decodeDelta;
  }

  return compareNullableNumber(left.bundleDelta, right.bundleDelta);
}

function buildExperimentReviewRationale(candidate, matrixCandidate, attackCandidate, reviewPriority) {
  const summary = normalizeNonEmptyString(matrixCandidate?.summary)
    || normalizeNonEmptyString(attackCandidate?.summary)
    || `${candidate.id} 当前已不再是“先补证据”问题，而是“是否值得升级优先级”的评审问题。`;

  const surfaceParts = [];
  if (reviewPriority.unpackedAnchorDeltaCount !== null) {
    surfaceParts.push(`unpacked anchors=${reviewPriority.unpackedAnchorDeltaCount}`);
  }
  if (reviewPriority.unpackedMatchDeltaCount !== null) {
    surfaceParts.push(`unpacked matches=${reviewPriority.unpackedMatchDeltaCount}`);
  }

  const costParts = [];
  if (reviewPriority.xpiDelta !== null) {
    costParts.push(`xpiDelta=${reviewPriority.xpiDelta}`);
  }
  if (reviewPriority.prepareDelta !== null) {
    costParts.push(`prepareDelta=${reviewPriority.prepareDelta}`);
  }
  if (reviewPriority.decodeDelta !== null) {
    costParts.push(`decodeDelta=${reviewPriority.decodeDelta}`);
  }

  const detailParts = [
    `compare=${reviewPriority.compareStatus}/${reviewPriority.compareDecision}`,
    surfaceParts.length > 0 ? surfaceParts.join(", ") : null,
    costParts.length > 0 ? costParts.join(", ") : null,
  ].filter(Boolean);

  if (detailParts.length === 0) {
    return summary;
  }

  return `${summary} 当前排序依据：${detailParts.join(" | ")}。`;
}

function buildExperimentReviewTask({ candidate, attackCandidate, matrixCandidate, compareReport }) {
  const variant = attackCandidate?.variant || candidate.variant || candidate.compareVariant || null;
  const channel = attackCandidate?.channel || candidate.channel || "stable";
  const reviewPriority = buildExperimentReviewPriority(matrixCandidate, compareReport);
  return {
    id: `${candidate.id}-${channel}-review`,
    priority: "p2-experiment-review",
    priorityLabel: TASK_PRIORITY_LABELS["p2-experiment-review"],
    kind: "review-experimental-hardening",
    candidateId: candidate.id,
    candidateClass: candidate.class,
    variant,
    channel,
    role: null,
    summary: `${candidate.id} 已进入可评审实验候选，适合继续做 compare / matrix 收口复核。`,
    rationale: buildExperimentReviewRationale(candidate, matrixCandidate, attackCandidate, reviewPriority),
    commands: buildCompareCommands({
      variant,
      channel,
    }),
    missingCoverage: [],
    reviewPriority,
  };
}

function buildExperimentLLMSymmetryTask({ candidate, attackCandidate, matrixCandidate, compareReport }) {
  const variant = attackCandidate?.variant || candidate.variant || candidate.compareVariant || null;
  const channel = attackCandidate?.channel || candidate.channel || "stable";
  const compareStatus = normalizeNonEmptyString(compareReport?.status) || normalizeNonEmptyString(matrixCandidate?.signals?.compareStatus) || "missing";
  const compareDecision = normalizeNonEmptyString(compareReport?.decision) || normalizeNonEmptyString(matrixCandidate?.signals?.compareDecision) || "missing-evidence";
  const reviewPriority = buildExperimentReviewPriority(matrixCandidate, compareReport);

  return {
    id: `${candidate.id}-${channel}-llm-symmetry`,
    priority: "p1-experiment-gap",
    priorityLabel: TASK_PRIORITY_LABELS["p1-experiment-gap"],
    kind: "collect-experimental-llm-symmetry-evidence",
    candidateId: candidate.id,
    candidateClass: candidate.class,
    variant,
    channel,
    role: null,
    summary: `${candidate.id} 仍缺对称 single-pass LLM 证据，先补 compare 对称性再谈 promotion。`,
    rationale: `${candidate.id} 当前 compare=${compareStatus}/${compareDecision}，但 matrix 已明确要求先补 ` + "`LLM symmetry`" + `；在这一步完成前，不应把它当成已可 promotion 的 retained candidate。`,
    commands: buildExperimentLLMSymmetryCommands({
      variant,
      channel,
    }),
    missingCoverage: ["single-pass-llm-symmetry"],
    reviewPriority,
  };
}

function compareTaskPriority(left, right) {
  const leftRank = Number(TASK_PRIORITY_ORDER[left.priority] ?? Number.MAX_SAFE_INTEGER);
  const rightRank = Number(TASK_PRIORITY_ORDER[right.priority] ?? Number.MAX_SAFE_INTEGER);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  const leftKindRank = Number(TASK_KIND_ORDER[left.kind] ?? Number.MAX_SAFE_INTEGER);
  const rightKindRank = Number(TASK_KIND_ORDER[right.kind] ?? Number.MAX_SAFE_INTEGER);
  if (leftKindRank !== rightKindRank) {
    return leftKindRank - rightKindRank;
  }
  if (
    (left.priority === "p1-experiment-gap" && right.priority === "p1-experiment-gap")
    || (left.priority === "p2-experiment-review" && right.priority === "p2-experiment-review")
  ) {
    const reviewPriorityDelta = compareExperimentReviewPriority(left.reviewPriority, right.reviewPriority);
    if (reviewPriorityDelta !== 0) {
      return reviewPriorityDelta;
    }
  }
  return String(left.id || "").localeCompare(String(right.id || ""));
}

export function parsePackageProtectionGuidedAttackPlanArgs(argv = process.argv.slice(2)) {
  const options = {
    projectRootPath: projectRoot,
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

async function collectGuidedAttackPlanArtifacts(projectRootPath, registry = null) {
  const attackReport = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-attack-report.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-attack-report",
      label: "package protection attack report",
    },
  );
  const matrixReport = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-matrix.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-matrix-report",
      label: "package protection matrix report",
    },
  );
  const smokeAggregate = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-smoke.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-smoke-aggregate",
      label: "package protection smoke aggregate",
    },
  );

  const compareReports = {};
  const registryCandidates = Array.isArray(registry?.candidates) ? registry.candidates : [];
  for (const candidate of registryCandidates) {
    if (!candidate.compareVariant) {
      continue;
    }
    const compareBaseVariant = normalizeNonEmptyString(candidate?.baseVariant) || "shielded";
    const comparePath = resolveAgentArtifactPath(
      projectRootPath,
      "package-protection-compare",
      `${candidate.compareVariant}-vs-${compareBaseVariant}-${candidate.channel}.json`,
    );
    compareReports[candidate.id] = await readJSONIfExists(comparePath, {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-compare-report",
      label: comparePath,
    });
  }

  return {
    attackReport,
    matrixReport,
    smokeAggregate,
    compareReports,
  };
}

export function summarizePackageProtectionGuidedAttackPlan({
  registry = {},
  attackReport = null,
  matrixReport = null,
  smokeAggregate = null,
  compareReports = {},
} = {}) {
  const normalizedRegistry = normalizeCandidateRegistry(registry);
  const smokeByVariant = indexSmokeReports(smokeAggregate);

  if (!attackReport) {
    const task = buildMissingAttackEvidenceTask();
    return {
      generatedAt: new Date().toISOString(),
      advisory: true,
      status: "missing",
      statusLabel: pickStatusLabel("missing"),
      summary: "缺少 package protection attack report，暂时无法生成更细的 guided-attack 补证据计划。",
      nextAction: "refresh-attack-report",
      registry: {
        schemaVersion: normalizedRegistry.schemaVersion,
        updatedAt: normalizedRegistry.updatedAt,
        summary: normalizedRegistry.summary,
        candidateCount: normalizedRegistry.candidates.length,
      },
      sources: {
        attackReportPresent: false,
        matrixReportPresent: Boolean(matrixReport),
        smokeAggregatePresent: Boolean(smokeAggregate),
      },
      counters: {
        taskCount: 1,
        currentGapCount: 1,
        reviewCount: 0,
      },
      tasks: [task],
    };
  }

  const attackByID = indexByID(Array.isArray(attackReport?.candidates) ? attackReport.candidates : []);
  const matrixByID = indexByID(Array.isArray(matrixReport?.candidates) ? matrixReport.candidates : []);

  const tasks = [];
  const currentCandidates = normalizedRegistry.candidates.filter((candidate) => candidate.class === "current");
  currentCandidates.forEach((candidate) => {
    const attackCandidate = attackByID.get(candidate.id) || null;
    const matrixCandidate = matrixByID.get(candidate.id) || null;
    const variant = attackCandidate?.variant || candidate.variant || candidate.compareVariant || null;
    const channel = attackCandidate?.channel || candidate.channel || "stable";
    const smokeReport = variant
      ? smokeByVariant.get(`${variant}:${channel}`) || null
      : null;

    if (attackCandidate?.profileCoverage?.singlePassAutomation?.complete !== true) {
      tasks.push(buildSinglePassTask({
        candidate,
        attackCandidate,
        matrixCandidate,
        smokeReport,
      }));
    }

    if (attackCandidate?.profileCoverage?.guidedA2M3?.meetsTarget !== true) {
      tasks.push(buildGuidedA2M3Task({
        candidate,
        attackCandidate,
        matrixCandidate,
      }));
    }
  });

  const experimentCandidates = normalizedRegistry.candidates.filter((candidate) => candidate.class === "experiment");
  experimentCandidates.forEach((candidate) => {
    const attackCandidate = attackByID.get(candidate.id) || null;
    const matrixCandidate = matrixByID.get(candidate.id) || null;
    const compareReport = compareReports[candidate.id] || null;
    const recommendedAction = normalizeNonEmptyString(matrixCandidate?.recommendedAction)
      || normalizeNonEmptyString(attackCandidate?.recommendedAction);

    if (recommendedAction === "collect-llm-symmetry-evidence") {
      tasks.push(buildExperimentLLMSymmetryTask({
        candidate,
        attackCandidate,
        matrixCandidate,
        compareReport,
      }));
    } else if (recommendedAction === "promote-experimental-candidate") {
      tasks.push(buildExperimentReviewTask({
        candidate,
        attackCandidate,
        matrixCandidate,
        compareReport,
      }));
    }
  });

  const sortedTasks = tasks.slice().sort(compareTaskPriority);
  let reviewRank = 0;
  const annotatedTasks = sortedTasks.map((task) => {
    if (task.priority !== "p1-experiment-gap" && task.priority !== "p2-experiment-review") {
      return task;
    }
    reviewRank += 1;
    return {
      ...task,
      reviewRank,
    };
  });
  const currentGapCount = annotatedTasks.filter((task) => task.priority === "p0-current-gap").length;
  const experimentGapCount = annotatedTasks.filter((task) => task.priority === "p1-experiment-gap").length;
  const reviewCount = annotatedTasks.filter((task) => task.priority === "p2-experiment-review").length;
  const topExperimentGapTask = annotatedTasks.find((task) => task.priority === "p1-experiment-gap") || null;
  const topReviewTask = annotatedTasks.find((task) => task.priority === "p2-experiment-review") || null;

  let status = "passed";
  let nextAction = "keep-current-shielded";
  let summary = "当前 `current` 候选的 fixed-profile coverage 已补齐，暂无新的 guided-attack 补证据任务。";

  if (currentGapCount > 0) {
    status = "attention";
    nextAction = "collect-current-fixed-profile-evidence";
    summary = `当前仍有 ${currentGapCount} 条 current 固定画像缺口，需先补齐后再继续 hardening 候选评审。`;
  } else if (experimentGapCount > 0) {
    status = "attention";
    nextAction = "collect-experimental-symmetry-evidence";
    summary = topExperimentGapTask
      ? `current 固定画像已补齐，但仍有 ${experimentGapCount} 条实验候选缺对称 LLM 证据；优先补 ${topExperimentGapTask.candidateId}。`
      : `current 固定画像已补齐，但仍有 ${experimentGapCount} 条实验候选缺对称 LLM 证据。`;
  } else if (reviewCount > 0) {
    status = "passed";
    nextAction = "review-experimental-hardening";
    summary = topReviewTask
      ? `current 固定画像已补齐；当前有 ${reviewCount} 条实验候选可进入 review / compare 收口，优先顺位为 ${topReviewTask.candidateId}。`
      : `current 固定画像已补齐；当前有 ${reviewCount} 条实验候选可进入 review / compare 收口。`;
  }

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status,
    statusLabel: pickStatusLabel(status),
    summary,
    nextAction,
    registry: {
      schemaVersion: normalizedRegistry.schemaVersion,
      updatedAt: normalizedRegistry.updatedAt,
      summary: normalizedRegistry.summary,
      candidateCount: normalizedRegistry.candidates.length,
    },
    sources: {
      attackReportPresent: Boolean(attackReport),
      matrixReportPresent: Boolean(matrixReport),
      smokeAggregatePresent: Boolean(smokeAggregate),
    },
    counters: {
      taskCount: annotatedTasks.length,
      currentGapCount,
      experimentGapCount,
      reviewCount,
    },
    reviewQueue: topReviewTask
      ? {
        present: true,
        topCandidateId: topReviewTask.candidateId,
        topVariant: topReviewTask.variant,
        topChannel: topReviewTask.channel,
        topReviewRank: Number(topReviewTask.reviewRank || 1),
        rationale: topReviewTask.rationale,
        compareStatus: topReviewTask.reviewPriority?.compareStatus || null,
        compareDecision: topReviewTask.reviewPriority?.compareDecision || null,
        unpackedAnchorDeltaCount: topReviewTask.reviewPriority?.unpackedAnchorDeltaCount ?? null,
        unpackedMatchDeltaCount: topReviewTask.reviewPriority?.unpackedMatchDeltaCount ?? null,
        xpiDelta: topReviewTask.reviewPriority?.xpiDelta ?? null,
        prepareDelta: topReviewTask.reviewPriority?.prepareDelta ?? null,
        decodeDelta: topReviewTask.reviewPriority?.decodeDelta ?? null,
      }
      : {
        present: false,
      },
    tasks: annotatedTasks,
  };
}

export function renderPackageProtectionGuidedAttackPlanMarkdown(report = {}) {
  const lines = [
    "# Package Protection Guided Attack Plan",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- 状态: \`${report.statusLabel || "-"}\``,
    `- nextAction: \`${report.nextAction || "-"}\``,
    `- 摘要: ${report.summary || "-"}`,
    `- tasks: \`${report.counters?.taskCount || 0}\` (current gaps=\`${report.counters?.currentGapCount || 0}\`, review=\`${report.counters?.reviewCount || 0}\`)`,
    "",
  ];

  if (report.reviewQueue?.present) {
    lines.push("## Review Queue");
    lines.push("");
    lines.push(`- topCandidate: \`${report.reviewQueue.topCandidateId || "-"}\``);
    lines.push(`- variant/channel: \`${report.reviewQueue.topVariant || "-"} / ${report.reviewQueue.topChannel || "-"}\``);
    lines.push(`- compare: \`${report.reviewQueue.compareStatus || "-"} / ${report.reviewQueue.compareDecision || "-"}\``);
    lines.push(`- unpacked deltas: anchors=\`${report.reviewQueue.unpackedAnchorDeltaCount ?? "-"}\`, matches=\`${report.reviewQueue.unpackedMatchDeltaCount ?? "-"}\``);
    lines.push(`- cost deltas: xpi=\`${report.reviewQueue.xpiDelta ?? "-"}\`, prepare=\`${report.reviewQueue.prepareDelta ?? "-"}\`, decode=\`${report.reviewQueue.decodeDelta ?? "-"}\``);
    lines.push(`- rationale: ${report.reviewQueue.rationale || "-"}`);
    lines.push("");
  }

  const priorities = ["p0-current-gap", "p1-experiment-review"];
  priorities.forEach((priority) => {
    const tasks = Array.isArray(report.tasks)
      ? report.tasks.filter((task) => task.priority === priority)
      : [];
    if (tasks.length === 0) {
      return;
    }

    lines.push(`## ${TASK_PRIORITY_LABELS[priority] || priority}`);
    lines.push("");
    tasks.forEach((task) => {
      lines.push(`### ${task.id}`);
      lines.push("");
      lines.push(`- kind: \`${task.kind || "-"}\``);
      lines.push(`- candidate: \`${task.candidateId || "-"}\` / class=\`${task.candidateClass || "-"}\``);
      lines.push(`- variant/channel: \`${task.variant || "-"} / ${task.channel || "-"}\``);
      lines.push(`- role: \`${task.role || "-"}\``);
      if (priority === "p1-experiment-review" && Number.isInteger(task.reviewRank)) {
        lines.push(`- reviewRank: \`${task.reviewRank}\``);
      }
      lines.push(`- 摘要: ${task.summary || "-"}`);
      lines.push(`- 原因: ${task.rationale || "-"}`);
      if (Array.isArray(task.missingCoverage) && task.missingCoverage.length > 0) {
        lines.push(`- missingCoverage: \`${task.missingCoverage.join(", ")}\``);
      }
      if (task.reviewPriority) {
        lines.push(`- reviewPriority: compare=\`${task.reviewPriority.compareStatus || "-"} / ${task.reviewPriority.compareDecision || "-"}\`, unpacked anchors=\`${task.reviewPriority.unpackedAnchorDeltaCount ?? "-"}\`, unpacked matches=\`${task.reviewPriority.unpackedMatchDeltaCount ?? "-"}\`, xpi=\`${task.reviewPriority.xpiDelta ?? "-"}\`, prepare=\`${task.reviewPriority.prepareDelta ?? "-"}\`, decode=\`${task.reviewPriority.decodeDelta ?? "-"}\``);
      }
      lines.push("- commands:");
      (Array.isArray(task.commands) ? task.commands : []).forEach((command) => {
        lines.push(`  - \`${command}\``);
      });
      lines.push("");
    });
  });

  if (!Array.isArray(report.tasks) || report.tasks.length === 0) {
    lines.push("当前没有待补的 guided-attack 计划项。");
    lines.push("");
  }

  return lines.join("\n");
}

export async function persistPackageProtectionGuidedAttackPlan(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const reportPath = resolveAgentArtifactPath(projectRootPath, "package-protection-guided-attack-plan.json");
  const reportMDPath = resolveAgentArtifactPath(projectRootPath, "package-protection-guided-attack-plan.md");
  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionGuidedAttackPlanMarkdown(report)}\n`, "utf-8"),
  ]);
  return {
    reportPath,
    reportMDPath,
  };
}

export async function runPackageProtectionGuidedAttackPlan(options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const registryPath = path.resolve(options.registryPath || DEFAULT_REGISTRY_PATH);
  const rawRegistry = await readJSONFile(registryPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-candidate-registry",
    label: "package protection candidate registry",
  });
  const registry = normalizeCandidateRegistry(rawRegistry);
  assertScript(registry.candidates.length > 0, "package protection candidate registry must include at least one candidate", {
    category: "validation",
    failedStage: "validate-candidate-registry",
  });

  const artifacts = await collectGuidedAttackPlanArtifacts(projectRootPath, registry);
  const report = summarizePackageProtectionGuidedAttackPlan({
    registry,
    ...artifacts,
  });
  const paths = await persistPackageProtectionGuidedAttackPlan(report, {
    projectRootPath,
  });

  return {
    report,
    paths,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionGuidedAttackPlanArgs(argv);
  const { report, paths } = await runPackageProtectionGuidedAttackPlan(options);
  console.log(`Package protection guided attack plan generated: ${paths.reportPath}`);
  console.log(`Package protection guided attack plan status: ${report.status}`);
  console.log(`Package protection guided attack plan nextAction: ${report.nextAction}`);
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
