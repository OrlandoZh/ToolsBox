import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import { normalizePackageProtectionSmokeReport } from "./package-protection-smoke.mjs";
import {
  GUIDED_AI_TIERS,
  GUIDED_ATTACKER_TIERS,
  GUIDED_ATTACK_METHODS,
  GUIDED_ROUND_MODES,
  GUIDED_TIME_BUCKETS,
} from "./package-protection-guided-attack-score.mjs";
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

const GUIDED_ATTACKER_TIER_ORDER = Object.freeze(
  Object.fromEntries(GUIDED_ATTACKER_TIERS.map((value, index) => [value, index])),
);
const GUIDED_AI_TIER_ORDER = Object.freeze(
  Object.fromEntries(GUIDED_AI_TIERS.map((value, index) => [value, index])),
);
const GUIDED_ATTACK_METHOD_ORDER = Object.freeze(
  Object.fromEntries(GUIDED_ATTACK_METHODS.map((value, index) => [value, index])),
);
const GUIDED_TIME_BUCKET_ORDER = Object.freeze(
  Object.fromEntries(GUIDED_TIME_BUCKETS.map((value, index) => [value, index])),
);
const GUIDED_ROUND_MODE_ORDER = Object.freeze(
  Object.fromEntries(GUIDED_ROUND_MODES.map((value, index) => [value, index])),
);

function normalizeNonEmptyString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeArray(values = []) {
  return Array.isArray(values)
    ? values.map((item) => normalizeNonEmptyString(item)).filter(Boolean)
    : [];
}

function buildEvidenceStatusFromChecks(checks = []) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return "missing";
  }
  if (checks.every(Boolean)) {
    return "complete";
  }
  if (checks.some(Boolean)) {
    return "partial";
  }
  return "missing";
}

function coverageIncludes(candidate, key) {
  return Array.isArray(candidate?.artifactCoverage)
    && candidate.artifactCoverage.includes(key);
}

function buildVariantEvidenceStatus(candidate, { smoke = null, attackCandidate = null } = {}) {
  const checks = [];

  if (coverageIncludes(candidate, "smoke")) {
    checks.push(Boolean(smoke));
  }
  if (coverageIncludes(candidate, "webcrack") || coverageIncludes(candidate, "guided-attack")) {
    checks.push(normalizeNonEmptyString(attackCandidate?.evidenceStatus) === "complete");
  }

  return checks.length > 0
    ? buildEvidenceStatusFromChecks(checks)
    : (smoke ? "complete" : "missing");
}

function buildCompareEvidenceStatus(candidate, compare = null) {
  if (!compare) {
    return "missing";
  }

  const evidence = compare?.evidence || {};
  const checks = [];

  if (coverageIncludes(candidate, "smoke")) {
    checks.push(evidence.smokeComplete === true);
  }
  if (coverageIncludes(candidate, "webcrack")) {
    checks.push(evidence.webcrackComplete === true);
  }
  if (coverageIncludes(candidate, "anchor-audit") || coverageIncludes(candidate, "compare")) {
    checks.push(evidence.auditPresent === true);
  }
  if (coverageIncludes(candidate, "compare")) {
    checks.push(evidence.llmSymmetryComplete === true);
  }
  if (coverageIncludes(candidate, "inner-audit")) {
    checks.push(evidence.innerAuditComplete === true);
  }
  if (coverageIncludes(candidate, "guided-attack")) {
    checks.push(evidence.guidedAttackSymmetryComplete === true);
  }
  if (coverageIncludes(candidate, "preflight")) {
    checks.push(evidence.preflightPresent === true);
  }

  return checks.length > 0
    ? buildEvidenceStatusFromChecks(checks)
    : "complete";
}

function shouldCollectCompareLLMSymmetry(candidate, compare = null) {
  if (!compare || !coverageIncludes(candidate, "compare")) {
    return false;
  }

  const evidence = compare?.evidence || {};
  const status = normalizeNonEmptyString(compare?.status);
  const decision = normalizeNonEmptyString(compare?.decision);

  if (status !== "passed" || decision !== "hardening-win") {
    return false;
  }

  if (evidence.smokeComplete !== true || evidence.webcrackComplete !== true || evidence.auditPresent !== true) {
    return false;
  }

  if (coverageIncludes(candidate, "inner-audit") && evidence.innerAuditComplete !== true) {
    return false;
  }

  if (coverageIncludes(candidate, "guided-attack") && evidence.guidedAttackSymmetryComplete !== true) {
    return false;
  }

  return evidence.llmSymmetryComplete !== true;
}

function buildCompareRecommendedAction(candidate, compare = null) {
  if (shouldCollectCompareLLMSymmetry(candidate, compare)) {
    return "collect-llm-symmetry-evidence";
  }

  return normalizeNonEmptyString(compare?.nextAction) || candidate.promotionGate;
}

function buildCompareSummary(candidate, compare = null, recommendedAction = null) {
  const baseSummary = normalizeNonEmptyString(compare?.summary) || candidate.summary;
  if (recommendedAction === "collect-llm-symmetry-evidence") {
    return `${baseSummary} 当前 compare 仍缺对称 single-pass LLM 证据，先补齐再谈 promotion。`;
  }
  return baseSummary;
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

function formatMs(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0
    ? `${numeric}ms`
    : "-";
}

function formatSignedNumber(value, suffix = "") {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric}${suffix}`;
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
      baseVariant: normalizeNonEmptyString(candidate?.baseVariant),
      executionMode: normalizeNonEmptyString(candidate?.executionMode) || "unknown",
      evaluationKind: normalizeNonEmptyString(candidate?.evaluationKind) || "future",
      variant: normalizeNonEmptyString(candidate?.variant),
      compareVariant: normalizeNonEmptyString(candidate?.compareVariant),
      channel: normalizeNonEmptyString(candidate?.channel) || "stable",
      preflightArtifact: normalizeNonEmptyString(candidate?.preflightArtifact),
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

export function parsePackageProtectionMatrixArgs(argv = process.argv.slice(2)) {
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

function indexSmokeReports(smokeAggregate = null) {
  const reports = Array.isArray(smokeAggregate?.reports)
    ? smokeAggregate.reports.map((report) => normalizePackageProtectionSmokeReport(report))
    : [];
  return new Map(
    reports.map((report) => [`${report.variant}:${report.channel}`, report]),
  );
}

function indexPerformanceVariants(performanceReport = null) {
  const variants = Array.isArray(performanceReport?.variants) ? performanceReport.variants : [];
  return new Map(
    variants.map((variant) => [`${variant.variant}:${performanceReport?.channel || "stable"}`, variant]),
  );
}

function indexPerformanceComparisons(performanceReport = null) {
  const comparisons = Array.isArray(performanceReport?.comparisons) ? performanceReport.comparisons : [];
  return new Map(
    comparisons.map((comparison) => [comparison.id, comparison]),
  );
}

function buildGuidedAttackProfileStrength(report) {
  const guidedAttack = report?.guidedAttack || {};
  return {
    attackerTier: Number(GUIDED_ATTACKER_TIER_ORDER[guidedAttack.attackerTier] ?? -1),
    aiTier: Number(GUIDED_AI_TIER_ORDER[guidedAttack.aiTier] ?? -1),
    attackMethod: Number(GUIDED_ATTACK_METHOD_ORDER[guidedAttack.attackMethod] ?? -1),
    roundMode: Number(GUIDED_ROUND_MODE_ORDER[guidedAttack.roundMode] ?? -1),
    timeBucket: Number(GUIDED_TIME_BUCKET_ORDER[guidedAttack.timeBucket] ?? -1),
    generatedAt: String(report?.generatedAt || ""),
  };
}

function compareGuidedAttackProfileStrength(left, right) {
  const leftStrength = buildGuidedAttackProfileStrength(left);
  const rightStrength = buildGuidedAttackProfileStrength(right);
  const keys = ["attackerTier", "aiTier", "attackMethod", "roundMode", "timeBucket"];
  for (const key of keys) {
    if (leftStrength[key] !== rightStrength[key]) {
      return leftStrength[key] - rightStrength[key];
    }
  }
  return leftStrength.generatedAt.localeCompare(rightStrength.generatedAt);
}

export function selectStrongestGuidedAttackReport(guidedAggregateReport, options = {}) {
  const variant = normalizeNonEmptyString(options.variant);
  const channel = normalizeNonEmptyString(options.channel) || "stable";
  const fallbackReport = options.fallbackReport || null;
  const reports = Array.isArray(guidedAggregateReport?.reports)
    ? guidedAggregateReport.reports.filter((report) => (
      normalizeNonEmptyString(report?.variant) === variant
      && (normalizeNonEmptyString(report?.channel) || "stable") === channel
    ))
    : [];

  if (!variant || reports.length === 0) {
    return fallbackReport;
  }

  const rankedReports = reports.slice().sort((left, right) => {
    const strengthDelta = compareGuidedAttackProfileStrength(left, right);
    if (strengthDelta !== 0) {
      return -strengthDelta;
    }
    return String(right?.generatedAt || "").localeCompare(String(left?.generatedAt || ""));
  });

  return rankedReports[0] || fallbackReport;
}

function buildVariantPerformanceComparisonID(variant) {
  if (variant === "encrypted" || variant === "shielded" || variant === "shielded-jsconfuser-string") {
    return `${variant}-vs-plain`;
  }
  if (variant === "shielded-pref-bridge") {
    return `${variant}-vs-shielded`;
  }
  if (variant === "shielded-surface-scrub") {
    return `${variant}-vs-shielded`;
  }
  if (variant === "shielded-surface-scrub-wasm-digest") {
    return `${variant}-vs-shielded-surface-scrub`;
  }
  if (variant === "shielded-descriptor-bind") {
    return `${variant}-vs-shielded`;
  }
  return null;
}

function resolveCandidateCompareBaseVariant(candidate = {}) {
  return normalizeNonEmptyString(candidate?.baseVariant) || "shielded";
}

async function collectMatrixArtifacts(projectRootPath, registry = null) {
  const smokeAggregate = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-smoke.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-smoke-aggregate",
      label: "package protection smoke aggregate",
    },
  );
  const verdictReport = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-verdict.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-verdict-report",
      label: "package protection verdict report",
    },
  );
  const attackReport = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-attack-report.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-attack-report",
      label: "package protection attack report",
    },
  );
  const performanceReport = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-performance.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-performance-report",
      label: "package protection performance report",
    },
  );
  const anchorAuditReport = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-anchor-audit.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-anchor-audit",
      label: "package protection anchor audit report",
    },
  );
  const guidedAggregateReport = await readJSONIfExists(
    resolveAgentArtifactPath(projectRootPath, "package-protection-guided-attack.json"),
    {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-guided-attack-aggregate",
      label: "package protection guided attack aggregate",
    },
  );

  const compareReports = {};
  const preflightReports = {};
  const guidedReports = {};
  const webcrackReports = {};

  const registryCandidates = Array.isArray(registry?.candidates) ? registry.candidates : [];
  for (const candidate of registryCandidates) {
    if (candidate.evaluationKind === "compare" && candidate.compareVariant) {
      const compareBaseVariant = resolveCandidateCompareBaseVariant(candidate);
      const comparePath = resolveAgentArtifactPath(
        projectRootPath,
        "package-protection-compare",
        `${candidate.compareVariant}-vs-${compareBaseVariant}-${candidate.channel}.json`,
      );
      compareReports[candidate.compareVariant] = await readJSONIfExists(comparePath, {
        missingCategory: "environment",
        invalidCategory: "validation",
        failedStage: "read-compare-report",
        label: comparePath,
      });
      continue;
    }

    if (candidate.evaluationKind === "preflight" && candidate.preflightArtifact) {
      const preflightPath = resolveAgentArtifactPath(projectRootPath, candidate.preflightArtifact);
      preflightReports[candidate.id] = await readJSONIfExists(preflightPath, {
        missingCategory: "environment",
        invalidCategory: "validation",
        failedStage: "read-preflight-report",
        label: preflightPath,
      });
      continue;
    }

    if (candidate.variant) {
      const guidedPath = resolveAgentArtifactPath(
        projectRootPath,
        "package-protection-guided-attack",
        `${candidate.variant}-${candidate.channel}.json`,
      );
      const guidedFallbackReport = await readJSONIfExists(guidedPath, {
        missingCategory: "environment",
        invalidCategory: "validation",
        failedStage: "read-guided-attack-report",
        label: guidedPath,
      });
      guidedReports[`${candidate.variant}:${candidate.channel}`] = selectStrongestGuidedAttackReport(guidedAggregateReport, {
        variant: candidate.variant,
        channel: candidate.channel,
        fallbackReport: guidedFallbackReport,
      });

      const webcrackPath = resolveAgentArtifactPath(
        projectRootPath,
        "package-protection-webcrack",
        `${candidate.variant}-${candidate.channel}.json`,
      );
      webcrackReports[`${candidate.variant}:${candidate.channel}`] = await readJSONIfExists(webcrackPath, {
        missingCategory: "environment",
        invalidCategory: "validation",
        failedStage: "read-webcrack-report",
        label: webcrackPath,
      });
    }
  }

  return {
    smokeAggregate,
    verdictReport,
    attackReport,
    performanceReport,
    anchorAuditReport,
    compareReports,
    preflightReports,
    guidedReports,
    webcrackReports,
  };
}

function indexAttackCandidatesById(attackReport = null) {
  const candidates = Array.isArray(attackReport?.candidates) ? attackReport.candidates : [];
  return new Map(
    candidates
      .filter((candidate) => normalizeNonEmptyString(candidate?.id))
      .map((candidate) => [normalizeNonEmptyString(candidate.id), candidate]),
  );
}

function indexAttackCandidatesByVariant(attackReport = null) {
  const candidates = Array.isArray(attackReport?.candidates) ? attackReport.candidates : [];
  return new Map(
    candidates
      .filter((candidate) => normalizeNonEmptyString(candidate?.variant))
      .map((candidate) => [`${normalizeNonEmptyString(candidate.variant)}:${normalizeNonEmptyString(candidate.channel) || "stable"}`, candidate]),
  );
}

function normalizeGuidedAttackReport(report = null) {
  if (!report) {
    return {
      present: false,
      rating: null,
      resultTier: null,
      attackerTier: null,
      aiTier: null,
      attackMethod: null,
      timeBucket: null,
      roundMode: null,
      relation: null,
      nextAction: null,
      summary: null,
    };
  }
  return {
    present: true,
    rating: normalizeNonEmptyString(report?.guidedAttack?.rating),
    resultTier: normalizeNonEmptyString(report?.guidedAttack?.resultTier),
    attackerTier: normalizeNonEmptyString(report?.guidedAttack?.attackerTier),
    aiTier: normalizeNonEmptyString(report?.guidedAttack?.aiTier),
    attackMethod: normalizeNonEmptyString(report?.guidedAttack?.attackMethod),
    timeBucket: normalizeNonEmptyString(report?.guidedAttack?.timeBucket),
    roundMode: normalizeNonEmptyString(report?.guidedAttack?.roundMode),
    relation: normalizeNonEmptyString(report?.comparison?.relation),
    nextAction: normalizeNonEmptyString(report?.nextAction),
    summary: normalizeNonEmptyString(report?.guidedAttack?.summary),
  };
}

function normalizeWebcrackReport(report = null) {
  if (!report) {
    return {
      present: false,
      rating: null,
      summary: null,
      loaderAnchorCount: 0,
      semanticAnchorCount: 0,
    };
  }
  return {
    present: true,
    rating: normalizeNonEmptyString(report?.suggestedWebcrackRating),
    summary: normalizeNonEmptyString(report?.summary),
    loaderAnchorCount: Number(report?.outputScan?.loaderAnchorCount || 0),
    semanticAnchorCount: Number(report?.outputScan?.semanticAnchorCount || 0),
  };
}

function summarizeVariantCandidate(candidate, context = {}) {
  const smoke = context.smokeByVariant.get(`${candidate.variant}:${candidate.channel}`) || null;
  const perf = context.performanceByVariant.get(`${candidate.variant}:${candidate.channel}`) || null;
  const performanceComparisonID = buildVariantPerformanceComparisonID(candidate.variant);
  const perfComparison = performanceComparisonID
    ? context.performanceComparisons.get(performanceComparisonID) || null
    : null;
  const verdictTarget = Array.isArray(context.verdictReport?.targets)
    ? context.verdictReport.targets.find((target) => (
      String(target?.variant || "").trim() === candidate.variant
      && String(target?.channel || "").trim() === candidate.channel
    )) || null
    : null;
  const guided = normalizeGuidedAttackReport(context.guidedReports[`${candidate.variant}:${candidate.channel}`] || null);
  const webcrack = normalizeWebcrackReport(context.webcrackReports[`${candidate.variant}:${candidate.channel}`] || null);
  const attackCandidate = context.attackCandidatesById.get(candidate.id)
    || context.attackCandidatesByVariant.get(`${candidate.variant}:${candidate.channel}`)
    || null;
  const sourceProxy = context.anchorAuditReport?.sourceProxy || null;

  const smokeStatus = normalizeNonEmptyString(smoke?.status) || "missing";
  const automatedStatus = normalizeNonEmptyString(smoke?.automatedScorecard?.status) || "missing";
  const manualSinglePass = normalizeNonEmptyString(smoke?.manualScorecard?.llmSinglePassResult);
  const evidenceStatus = buildVariantEvidenceStatus(candidate, {
    smoke,
    attackCandidate,
  });
  const recommendedAction = verdictTarget?.manualRequired === true && smoke?.manualScorecard?.status !== "completed"
    ? "collect-manual-score"
    : (normalizeNonEmptyString(attackCandidate?.recommendedAction) || candidate.promotionGate);
  const summary = verdictTarget?.summary
    || perf?.summary
    || normalizeNonEmptyString(attackCandidate?.summary)
    || guided.summary
    || candidate.summary;

  return {
    id: candidate.id,
    class: candidate.class,
    stage: candidate.stage,
    executionMode: candidate.executionMode,
    registryStatus: candidate.status,
    present: Boolean(smoke),
    evidenceStatus,
    promotionGate: candidate.promotionGate,
    recommendedAction,
    summary,
    artifactCoverage: candidate.artifactCoverage,
    signals: {
      smokeStatus,
      automatedStatus,
      verdictRole: normalizeNonEmptyString(verdictTarget?.role),
      verdictSummary: normalizeNonEmptyString(verdictTarget?.summary),
      manualSinglePass,
      webcrackRating: webcrack.rating,
      guidedAttack: guided,
      attackResistanceLabel: normalizeNonEmptyString(attackCandidate?.resistanceLabel),
      attackRecommendedAction: normalizeNonEmptyString(attackCandidate?.recommendedAction),
      attackEvidenceStatus: normalizeNonEmptyString(attackCandidate?.evidenceStatus),
      attackSinglePassComplete: attackCandidate?.profileCoverage?.singlePassAutomation?.complete === true,
      attackGuidedA2M3Covered: attackCandidate?.profileCoverage?.guidedA2M3?.meetsTarget === true,
      attackSinglePassRating: normalizeNonEmptyString(attackCandidate?.profileCoverage?.singlePassAutomation?.rating),
      attackGuidedRating: normalizeNonEmptyString(attackCandidate?.profileCoverage?.guidedA2M3?.rating),
      durationMsMedian: Number(perf?.metrics?.durationMsMedian || 0),
      protectionPipelineDurationMsMedian: Number(perf?.metrics?.protectionPipelineDurationMsMedian || 0),
      costDriver: normalizeNonEmptyString(perf?.costDriver) || "none",
      xpiBytes: Number(smoke?.xpi?.sizeBytes || perf?.xpiBytes || 0),
      bundleBytes: Number(smoke?.bundle?.sizeBytes || perf?.bundleBytes || 0),
      xpiDelta: Number(perfComparison?.deltas?.xpiBytes?.absolute || 0),
      bundleDelta: Number(perfComparison?.deltas?.bundleBytes?.absolute || 0),
      durationDelta: Number(perfComparison?.deltas?.duration?.absolute || 0),
      protectionPipelineDelta: Number(perfComparison?.deltas?.protectionPipeline?.absolute || 0),
      rawAnchorCount: candidate.variant === "plain"
        ? Number(context.anchorAuditReport?.comparison?.plainCandidateAnchorCount || 0)
        : (candidate.variant === "encrypted"
            ? Number(context.anchorAuditReport?.comparison?.encryptedRawAnchorCount || 0)
            : (candidate.variant === "shielded"
                ? Number(context.anchorAuditReport?.comparison?.shieldedRawAnchorCount || 0)
                : null)),
      sourceProxyReducedAnchorCount: candidate.variant === "shielded"
        ? Number(sourceProxy?.reducedAnchorCount || 0)
        : null,
      sourceProxyReducedMatchCount: candidate.variant === "shielded"
        ? Number(sourceProxy?.reducedMatchCount || 0)
        : null,
      sourceProxyRemainingAnchorIDs: candidate.variant === "shielded"
        ? normalizeArray(sourceProxy?.remainingAnchorIds)
        : [],
      unpackedSurfaceAnchorCount: candidate.variant === "shielded"
        ? Number(context.anchorAuditReport?.unpackedSurface?.totalAnchorCount || 0)
        : null,
      unpackedSurfaceExposedFiles: candidate.variant === "shielded"
        ? normalizeArray(context.anchorAuditReport?.unpackedSurface?.exposedFiles)
        : [],
    },
  };
}

function summarizeCompareCandidate(candidate, context = {}) {
  const compare = context.compareReports[candidate.compareVariant] || null;
  const evidenceStatus = buildCompareEvidenceStatus(candidate, compare);
  const recommendedAction = buildCompareRecommendedAction(candidate, compare);
  const summary = buildCompareSummary(candidate, compare, recommendedAction);

  return {
    id: candidate.id,
    class: candidate.class,
    stage: candidate.stage,
    executionMode: candidate.executionMode,
    registryStatus: candidate.status,
    present: Boolean(compare),
    evidenceStatus,
    promotionGate: candidate.promotionGate,
    recommendedAction,
    summary,
    artifactCoverage: candidate.artifactCoverage,
    signals: {
      compareStatus: normalizeNonEmptyString(compare?.status) || "missing",
      compareDecision: normalizeNonEmptyString(compare?.decision),
      llmSymmetryComplete: compare?.evidence?.llmSymmetryComplete === true,
      guidedAttackSymmetryComplete: compare?.evidence?.guidedAttackSymmetryComplete === true,
      channel: candidate.channel,
      webcrackRating: normalizeNonEmptyString(compare?.candidate?.webcrack?.rating),
      llmSinglePassResult: normalizeNonEmptyString(compare?.candidate?.smoke?.llmSinglePassResult),
      baseInnerAuditRating: normalizeNonEmptyString(compare?.base?.innerAudit?.rating),
      candidateInnerAuditRating: normalizeNonEmptyString(compare?.candidate?.innerAudit?.rating),
      guidedAttackRating: normalizeNonEmptyString(compare?.candidate?.guidedAttack?.rating),
      guidedAttackResultTier: normalizeNonEmptyString(compare?.candidate?.guidedAttack?.resultTier),
      xpiDelta: Number(compare?.deltas?.xpiBytes || 0),
      bundleDelta: Number(compare?.deltas?.bundleBytes || 0),
      decodeDelta: Number(compare?.deltas?.decodeDurationMs || 0),
      prepareDelta: Number(compare?.deltas?.prepareDurationMs || 0),
      rawAnchorDelta: Number(compare?.auditComparison?.rawAnchorDeltaCount || 0),
      rawMatchDelta: Number(compare?.auditComparison?.rawMatchDeltaCount || 0),
      residualFloorReached: compare?.auditComparison?.residualFloorReached === true,
      residualExposedFiles: normalizeArray(compare?.auditComparison?.residualExposedFiles),
      residualAnchorIds: normalizeArray(compare?.auditComparison?.residualAnchorIds),
    },
  };
}

function summarizePreflightCandidate(candidate, context = {}) {
  const report = context.preflightReports[candidate.id] || null;
  const inputBytes = Number(report?.input?.bytes || 0);
  const explicitGrowthRatio = Number(report?.attempt?.growthRatio || 0);
  const rawOutputBytes = Number(report?.attempts?.compatPatched?.output?.bytes || report?.attempts?.raw?.output?.bytes || 0);
  const derivedGrowthRatio = inputBytes > 0 && rawOutputBytes > 0
    ? rawOutputBytes / inputBytes
    : 0;
  return {
    id: candidate.id,
    class: candidate.class,
    stage: candidate.stage,
    executionMode: candidate.executionMode,
    registryStatus: candidate.status,
    present: Boolean(report),
    evidenceStatus: report ? "complete" : "missing",
    promotionGate: candidate.promotionGate,
    recommendedAction: normalizeNonEmptyString(report?.nextAction) || candidate.promotionGate,
    summary: normalizeNonEmptyString(report?.summary) || candidate.summary,
    artifactCoverage: candidate.artifactCoverage,
    signals: {
      preflightStatus: normalizeNonEmptyString(report?.status) || "missing",
      toolVersion: normalizeNonEmptyString(report?.tool?.version),
      growthRatio: explicitGrowthRatio > 0 ? explicitGrowthRatio : derivedGrowthRatio,
      semanticInputAnchorCount: Number(report?.semanticDelta?.inputAnchorCount || 0),
      semanticOutputAnchorCount: Number(report?.semanticDelta?.outputAnchorCount || 0),
      reducedAnchorCount: Number(report?.semanticDelta?.reducedAnchorCount || 0),
      reducedMatchCount: Number(report?.semanticDelta?.reducedMatchCount || 0),
      nextAction: normalizeNonEmptyString(report?.nextAction),
    },
  };
}

function summarizeSourceProxyCandidate(candidate, context = {}) {
  const sourceProxy = context.anchorAuditReport?.sourceProxy || null;
  const unpackedSurface = context.anchorAuditReport?.unpackedSurface || null;
  return {
    id: candidate.id,
    class: candidate.class,
    stage: candidate.stage,
    executionMode: candidate.executionMode,
    registryStatus: candidate.status,
    present: Boolean(sourceProxy?.present),
    evidenceStatus: sourceProxy?.present === true ? "complete" : "missing",
    promotionGate: candidate.promotionGate,
    recommendedAction: normalizeNonEmptyString(unpackedSurface?.nextAction) || normalizeNonEmptyString(context.anchorAuditReport?.nextAction) || candidate.promotionGate,
    summary: normalizeNonEmptyString(unpackedSurface?.summary) || normalizeNonEmptyString(context.anchorAuditReport?.summary) || candidate.summary,
    artifactCoverage: candidate.artifactCoverage,
    signals: {
      sourceProxyReducedAnchorCount: Number(sourceProxy?.reducedAnchorCount || 0),
      sourceProxyReducedMatchCount: Number(sourceProxy?.reducedMatchCount || 0),
      sourceProxyRemainingAnchorIDs: normalizeArray(sourceProxy?.remainingAnchorIds),
      unpackedSurfaceAnchorCount: Number(unpackedSurface?.totalAnchorCount || 0),
      unpackedSurfaceMatchCount: Number(unpackedSurface?.totalMatchCount || 0),
      unpackedSurfaceExposedFiles: normalizeArray(unpackedSurface?.exposedFiles),
      unpackedSurfaceNextAction: normalizeNonEmptyString(unpackedSurface?.nextAction),
    },
  };
}

function summarizePlannedCandidate(candidate) {
  return {
    id: candidate.id,
    class: candidate.class,
    stage: candidate.stage,
    executionMode: candidate.executionMode,
    registryStatus: candidate.status,
    present: false,
    evidenceStatus: "planned",
    promotionGate: candidate.promotionGate,
    recommendedAction: candidate.promotionGate,
    summary: candidate.summary,
    artifactCoverage: candidate.artifactCoverage,
    signals: {},
  };
}

function summarizeMatrixCandidate(candidate, context = {}) {
  switch (candidate.evaluationKind) {
    case "variant":
      return summarizeVariantCandidate(candidate, context);
    case "compare":
      return summarizeCompareCandidate(candidate, context);
    case "preflight":
      return summarizePreflightCandidate(candidate, context);
    case "source-proxy":
      return summarizeSourceProxyCandidate(candidate, context);
    case "future":
    case "paper":
    case "preplan":
    default:
      return summarizePlannedCandidate(candidate, context);
  }
}

function buildMatrixSummary({ verdictReport, candidates }) {
  const currentRows = candidates.filter((candidate) => candidate.class === "current");
  const experimentalRows = candidates.filter((candidate) => candidate.class === "experiment");
  const missingCurrent = currentRows.filter((candidate) => candidate.present !== true);

  let status = "passed";
  let nextAction = normalizeNonEmptyString(verdictReport?.nextAction) || "keep-current-shielded";
  let summary = normalizeNonEmptyString(verdictReport?.summary) || "当前缺少受保护打包收口结论。";

  if (!verdictReport) {
    status = "missing";
    nextAction = "refresh-current-artifacts";
    summary = "缺少 verdict 报告，先补齐当前基线的 smoke -> score -> verdict 工件。";
  } else if (missingCurrent.length > 0 || verdictReport?.status === "missing") {
    status = "missing";
    nextAction = "refresh-current-artifacts";
    summary = "当前矩阵缺少 required current-route 证据，先补齐 encrypted / shielded 的 fresh artifacts。";
  } else if (verdictReport?.status !== "passed") {
    status = "attention";
    nextAction = normalizeNonEmptyString(verdictReport?.nextAction) || "inspect-current-route";
    summary = normalizeNonEmptyString(verdictReport?.summary) || "当前受保护打包路线仍需人工关注。";
  }

  const descriptorBind = experimentalRows.find((candidate) => candidate.id === "shielded-descriptor-bind");
  const jsconfuserString = experimentalRows.find((candidate) => candidate.id === "shielded-jsconfuser-string");
  const experimentalNotes = [
    descriptorBind?.signals?.compareDecision
      ? `descriptor-bind=${descriptorBind.signals.compareDecision}`
      : null,
    jsconfuserString?.signals?.compareDecision
      ? `jsconfuser-string=${jsconfuserString.signals.compareDecision}`
      : null,
  ].filter(Boolean);

  if (status === "passed" && experimentalNotes.length > 0) {
    summary = `${summary} 实验面当前为 ${experimentalNotes.join("；")}。`;
  }

  const currentCoverageGaps = currentRows
    .filter((candidate) => candidate.signals?.attackSinglePassComplete === false || candidate.signals?.attackGuidedA2M3Covered === false)
    .map((candidate) => {
      const gapLabels = [];
      if (candidate.signals?.attackSinglePassComplete === false) {
        gapLabels.push("singlePassAutomation");
      }
      if (candidate.signals?.attackGuidedA2M3Covered === false) {
        gapLabels.push("guidedA2M3");
      }
      return gapLabels.length > 0
        ? `${candidate.id}(${gapLabels.join("+")})`
        : null;
    })
    .filter(Boolean);

  if (status === "passed" && currentCoverageGaps.length > 0) {
    summary = `${summary} 当前仍有 fixed-profile coverage gap：${currentCoverageGaps.join("；")}。`;
  }

  return {
    status,
    statusLabel: pickStatusLabel(status),
    nextAction,
    summary,
  };
}

export function summarizePackageProtectionMatrixReport({
  registry = {},
  smokeAggregate = null,
  verdictReport = null,
  attackReport = null,
  performanceReport = null,
  anchorAuditReport = null,
  compareReports = {},
  preflightReports = {},
  guidedReports = {},
  webcrackReports = {},
} = {}) {
  const normalizedRegistry = normalizeCandidateRegistry(registry);
  const smokeByVariant = indexSmokeReports(smokeAggregate);
  const attackCandidatesById = indexAttackCandidatesById(attackReport);
  const attackCandidatesByVariant = indexAttackCandidatesByVariant(attackReport);
  const performanceByVariant = indexPerformanceVariants(performanceReport);
  const performanceComparisons = indexPerformanceComparisons(performanceReport);

  const candidates = normalizedRegistry.candidates.map((candidate) => summarizeMatrixCandidate(candidate, {
    smokeByVariant,
    attackCandidatesById,
    attackCandidatesByVariant,
    performanceByVariant,
    performanceComparisons,
    verdictReport,
    anchorAuditReport,
    compareReports,
    preflightReports,
    guidedReports,
    webcrackReports,
  }));

  const matrixSummary = buildMatrixSummary({
    verdictReport,
    candidates,
  });

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status: matrixSummary.status,
    statusLabel: matrixSummary.statusLabel,
    summary: matrixSummary.summary,
    nextAction: matrixSummary.nextAction,
    registry: {
      schemaVersion: normalizedRegistry.schemaVersion,
      updatedAt: normalizedRegistry.updatedAt,
      summary: normalizedRegistry.summary,
      candidateCount: normalizedRegistry.candidates.length,
    },
    sources: {
      smokePresent: Boolean(smokeAggregate),
      verdictPresent: Boolean(verdictReport),
      attackReportPresent: Boolean(attackReport),
      performancePresent: Boolean(performanceReport),
      anchorAuditPresent: Boolean(anchorAuditReport),
    },
    candidates,
  };
}

export function renderPackageProtectionMatrixMarkdown(report = {}) {
  const lines = [
    "# Package Protection Experiment Matrix",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- 状态: \`${report.statusLabel || "-"}\``,
    `- nextAction: \`${report.nextAction || "-"}\``,
    `- 摘要: ${report.summary || "-"}`,
    `- registry: \`v${report.registry?.schemaVersion || 1}\` / candidates=\`${report.registry?.candidateCount || 0}\``,
    "",
  ];

  const classes = ["current", "experiment", "preflight", "future", "paper", "preplan", "control"];
  for (const candidateClass of classes) {
    const rows = (Array.isArray(report.candidates) ? report.candidates : [])
      .filter((candidate) => candidate.class === candidateClass);
    if (rows.length === 0) {
      continue;
    }

    lines.push(`## ${candidateClass}`);
    lines.push("");
    rows.forEach((candidate) => {
      lines.push(`### ${candidate.id}`);
      lines.push("");
      lines.push(`- stage: \`${candidate.stage}\``);
      lines.push(`- executionMode: \`${candidate.executionMode}\``);
      lines.push(`- registryStatus: \`${candidate.registryStatus}\``);
      lines.push(`- evidenceStatus: \`${candidate.evidenceStatus}\``);
      lines.push(`- promotionGate: \`${candidate.promotionGate}\``);
      lines.push(`- recommendedAction: \`${candidate.recommendedAction}\``);
      if (candidate.signals?.smokeStatus) {
        lines.push(`- smoke/automated: \`${candidate.signals.smokeStatus}\` / \`${candidate.signals.automatedStatus || "-"}\``);
      }
      if (candidate.signals?.compareDecision) {
        lines.push(`- compare: \`${candidate.signals.compareStatus || "-"}\` / \`${candidate.signals.compareDecision}\``);
      }
      if (candidate.signals?.baseInnerAuditRating || candidate.signals?.candidateInnerAuditRating) {
        lines.push(`- proxyLLM: base=\`${candidate.signals.baseInnerAuditRating || "-"}\` / candidate=\`${candidate.signals.candidateInnerAuditRating || "-"}\``);
      }
      if (candidate.signals?.preflightStatus) {
        lines.push(`- preflight: \`${candidate.signals.preflightStatus}\` / tool=\`${candidate.signals.toolVersion || "-"}\``);
      }
      if (candidate.signals?.webcrackRating || candidate.signals?.manualSinglePass || candidate.signals?.guidedAttack?.present) {
        lines.push(`- attack: webcrack=\`${candidate.signals.webcrackRating || "-"}\` / llm=\`${candidate.signals.manualSinglePass || candidate.signals.llmSinglePassResult || "-"}\` / guided=\`${candidate.signals.guidedAttack?.rating || candidate.signals.guidedAttackRating || "-"}\``);
      }
      if (candidate.signals?.attackResistanceLabel || candidate.signals?.attackSinglePassComplete === false || candidate.signals?.attackGuidedA2M3Covered === false) {
        lines.push(`- fixedProfiles: singlePass=\`${candidate.signals?.attackSinglePassComplete ? "covered" : "missing"}\` / guidedA2M3=\`${candidate.signals?.attackGuidedA2M3Covered ? "covered" : "missing"}\` / resistance=\`${candidate.signals?.attackResistanceLabel || "-"}\``);
      }
      if (Number(candidate.signals?.durationMsMedian || 0) > 0 || Number(candidate.signals?.protectionPipelineDurationMsMedian || 0) > 0) {
        lines.push(`- cost: duration=\`${formatMs(candidate.signals.durationMsMedian)}\` / pipeline=\`${formatMs(candidate.signals.protectionPipelineDurationMsMedian)}\` / XPI=\`${formatBytes(candidate.signals.xpiBytes)}\` / bundle=\`${formatBytes(candidate.signals.bundleBytes)}\``);
        lines.push(`- deltas: duration=\`${formatSignedNumber(candidate.signals.durationDelta, "ms")}\` / pipeline=\`${formatSignedNumber(candidate.signals.protectionPipelineDelta, "ms")}\` / XPI=\`${formatSignedNumber(candidate.signals.xpiDelta, "B")}\` / bundle=\`${formatSignedNumber(candidate.signals.bundleDelta, "B")}\``);
      }
      if (candidate.signals?.sourceProxyReducedAnchorCount != null || candidate.signals?.unpackedSurfaceAnchorCount != null) {
        lines.push(`- surface: sourceProxyReduced=\`${candidate.signals.sourceProxyReducedAnchorCount ?? "-"}\` / unpackedAnchorCount=\`${candidate.signals.unpackedSurfaceAnchorCount ?? "-"}\` / exposedFiles=\`${(candidate.signals.unpackedSurfaceExposedFiles || []).join(", ") || "-"}\``);
      }
      if (candidate.signals?.residualFloorReached === true || (candidate.signals?.residualExposedFiles || []).length > 0) {
        lines.push(`- residualSurface: floor=\`${candidate.signals?.residualFloorReached ? "yes" : "no"}\` / exposedFiles=\`${(candidate.signals?.residualExposedFiles || []).join(", ") || "-"}\` / anchors=\`${(candidate.signals?.residualAnchorIds || []).join(", ") || "-"}\``);
      }
      lines.push(`- 摘要: ${candidate.summary}`);
      lines.push("");
    });
  }

  return lines.join("\n");
}

export async function persistPackageProtectionMatrixReport(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const reportPath = resolveAgentArtifactPath(projectRootPath, "package-protection-matrix.json");
  const reportMDPath = resolveAgentArtifactPath(projectRootPath, "package-protection-matrix.md");
  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionMatrixMarkdown(report)}\n`, "utf-8"),
  ]);
  return {
    reportPath,
    reportMDPath,
  };
}

export async function runPackageProtectionMatrixReport(options = {}) {
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

  const artifacts = await collectMatrixArtifacts(projectRootPath, registry);
  const report = summarizePackageProtectionMatrixReport({
    registry,
    ...artifacts,
  });
  const paths = await persistPackageProtectionMatrixReport(report, {
    projectRootPath,
  });

  return {
    report,
    paths,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionMatrixArgs(argv);
  const { report, paths } = await runPackageProtectionMatrixReport(options);
  console.log(`Package protection matrix generated: ${paths.reportPath}`);
  console.log(`Package protection matrix status: ${report.status}`);
  console.log(`Package protection matrix nextAction: ${report.nextAction}`);
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
