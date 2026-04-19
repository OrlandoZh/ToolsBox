import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  PACKAGE_PROTECTION_SMOKE_VARIANTS,
  normalizePackageProtectionSmokeReport,
} from "./package-protection-smoke.mjs";
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

export const DEFAULT_PACKAGE_PROTECTION_PERFORMANCE_VARIANTS = Object.freeze([
  "plain",
  "encrypted",
  "shielded",
  "shielded-jsconfuser-string",
]);

const COMPARISON_CLASSIFICATION_LABELS = Object.freeze({
  "low-overhead-baseline": "低开销基线",
  "baseline-regression": "基线回归",
  "loader-dominant": "loader 主导成本",
  "protected-heavier-than-plain": "保护链显著增重",
  "noisy-faster-but-heavier": "总时长更快但保护链更重",
  "heavier-than-shielded": "比 shielded 更重",
  "lighter-than-shielded": "比 shielded 更轻",
  "same-as-shielded": "与 shielded 接近",
  generic: "通用对比",
  missing: "缺少对比数据",
});

function normalizeVariant(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "descriptor-bind") {
    return "shielded-descriptor-bind";
  }
  if (normalized === "jsconfuser-string") {
    return "shielded-jsconfuser-string";
  }
  if (normalized === "pref-bridge") {
    return "shielded-pref-bridge";
  }
  if (normalized === "surface-scrub") {
    return "shielded-surface-scrub";
  }
  if (normalized === "surface-scrub-wasm-digest" || normalized === "wasm-digest") {
    return "shielded-surface-scrub-wasm-digest";
  }
  return PACKAGE_PROTECTION_SMOKE_VARIANTS.includes(normalized)
    ? normalized
    : null;
}

function normalizeChannel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "stable" || normalized === "beta"
    ? normalized
    : null;
}

export function parsePackageProtectionPerformanceArgs(argv = process.argv.slice(2)) {
  const options = {
    channel: "stable",
    variants: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--channel":
        options.channel = normalizeChannel(argv[index + 1]) || null;
        index += 1;
        break;
      case "--variant":
        options.variants.push(normalizeVariant(argv[index + 1]));
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

  assertScript(Boolean(options.channel), "--channel must be stable or beta", {
    category: "args",
    failedStage: "parse-args",
  });
  if (options.variants.length === 0) {
    options.variants = DEFAULT_PACKAGE_PROTECTION_PERFORMANCE_VARIANTS.slice();
  }
  assertScript(options.variants.every(Boolean), "--variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest", {
    category: "args",
    failedStage: "parse-args",
  });
  options.variants = Array.from(new Set(options.variants));

  return options;
}

function computeMedian(values = []) {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (numericValues.length === 0) {
    return 0;
  }

  const middle = Math.floor(numericValues.length / 2);
  if (numericValues.length % 2 === 1) {
    return numericValues[middle];
  }
  return (numericValues[middle - 1] + numericValues[middle]) / 2;
}

function computePercentile(values = [], percentile = 0.95) {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (numericValues.length === 0) {
    return 0;
  }

  const boundedPercentile = Math.min(1, Math.max(0, Number(percentile || 0)));
  if (boundedPercentile === 0) {
    return numericValues[0];
  }

  const rank = Math.max(0, Math.ceil(boundedPercentile * numericValues.length) - 1);
  return numericValues[Math.min(rank, numericValues.length - 1)];
}

function computeMax(values = []) {
  const numericValues = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return numericValues.length > 0
    ? Math.max(...numericValues)
    : 0;
}

function countByString(values = []) {
  const counts = {};
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .forEach((value) => {
      counts[value] = Number(counts[value] || 0) + 1;
    });
  return counts;
}

function pickDominantKey(counts = {}) {
  return Object.entries(counts)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return String(left[0]).localeCompare(String(right[0]));
    })[0]?.[0] || null;
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

function formatSignedNumber(value, suffix = "") {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric}${suffix}`;
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function buildDelta(baseValue, targetValue) {
  const base = Number(baseValue || 0);
  const target = Number(targetValue || 0);
  const absolute = target - base;
  return {
    base,
    target,
    absolute,
    percent: base > 0 ? (absolute / base) * 100 : null,
  };
}

function classifyCostDriver(metrics) {
  const entries = [
    ["loadSubScript", Number(metrics.loadSubScriptDurationMsMedian || 0)],
    ["prepare", Number(metrics.prepareDurationMsMedian || 0)],
    ["eval", Number(metrics.evalDurationMsMedian || 0)],
    ["decode", Number(metrics.decodeDurationMsMedian || 0)],
    ["decrypt", Number(metrics.decryptDurationMsMedian || 0)],
  ].sort((left, right) => right[1] - left[1]);

  const [topKey, topValue] = entries[0] || [null, 0];
  const secondValue = entries[1]?.[1] || 0;
  if (!topKey || topValue <= 0) {
    return "none";
  }
  if (topValue === secondValue) {
    return "mixed";
  }
  return topKey;
}

function summarizeVariantPerformance({ variant, channel, report }) {
  if (!report) {
    return {
      present: false,
      variant,
      channel,
      smokeStatus: "missing",
      automatedStatus: "missing",
      repeats: 0,
      xpiBytes: 0,
      bundleBytes: 0,
      decodeMethods: {},
      dominantDecodeMethod: null,
      costDriver: "none",
      metrics: {
        durationMsMedian: 0,
        durationMsP95: 0,
        durationMsMax: 0,
        loadSubScriptDurationMsMedian: 0,
        loadSubScriptDurationMsP95: 0,
        loadSubScriptDurationMsMax: 0,
        decodeDurationMsMedian: 0,
        decryptDurationMsMedian: 0,
        evalDurationMsMedian: 0,
        prepareDurationMsMedian: 0,
        prepareDurationMsP95: 0,
        prepareDurationMsMax: 0,
        bootstrapResolveDurationMsMedian: 0,
        bootstrapResolveDurationMsP95: 0,
        bootstrapResolveDurationMsMax: 0,
        protectionPipelineDurationMsMedian: 0,
        protectionPipelineDurationMsP95: 0,
        protectionPipelineDurationMsMax: 0,
      },
      summary: `缺少 ${variant}/${channel} smoke 报告。`,
    };
  }

  const normalized = normalizePackageProtectionSmokeReport(report);
  const runs = Array.isArray(normalized.runs) ? normalized.runs : [];
  const durationValues = runs.map((run) => Number(run?.durationMs || 0));
  const loadSubScriptValues = runs.map((run) => Number(run?.packageProtection?.loadSubScriptDurationMs || 0));
  const decodeValues = runs.map((run) => Number(run?.packageProtection?.decodeDurationMs || 0));
  const decryptValues = runs.map((run) => Number(run?.packageProtection?.decryptDurationMs || 0));
  const evalValues = runs.map((run) => Number(run?.packageProtection?.evalDurationMs || 0));
  const prepareValues = runs.map((run) => Number(run?.packageProtection?.prepareDurationMs || 0));
  const bootstrapResolveValues = runs.map((run) => Number(run?.packageProtection?.bootstrapResolveDurationMs || 0));
  const protectionPipelineValues = runs.map((run) => (
    Number(run?.packageProtection?.loadSubScriptDurationMs || 0)
    + Number(run?.packageProtection?.prepareDurationMs || 0)
  ));
  const metrics = {
    durationMsMedian: computeMedian(durationValues),
    durationMsP95: computePercentile(durationValues, 0.95),
    durationMsMax: computeMax(durationValues),
    loadSubScriptDurationMsMedian: computeMedian(loadSubScriptValues),
    loadSubScriptDurationMsP95: computePercentile(loadSubScriptValues, 0.95),
    loadSubScriptDurationMsMax: computeMax(loadSubScriptValues),
    decodeDurationMsMedian: computeMedian(decodeValues),
    decryptDurationMsMedian: computeMedian(decryptValues),
    evalDurationMsMedian: computeMedian(evalValues),
    prepareDurationMsMedian: computeMedian(prepareValues),
    prepareDurationMsP95: computePercentile(prepareValues, 0.95),
    prepareDurationMsMax: computeMax(prepareValues),
    bootstrapResolveDurationMsMedian: computeMedian(bootstrapResolveValues),
    bootstrapResolveDurationMsP95: computePercentile(bootstrapResolveValues, 0.95),
    bootstrapResolveDurationMsMax: computeMax(bootstrapResolveValues),
    protectionPipelineDurationMsMedian: computeMedian(protectionPipelineValues),
    protectionPipelineDurationMsP95: computePercentile(protectionPipelineValues, 0.95),
    protectionPipelineDurationMsMax: computeMax(protectionPipelineValues),
  };
  const decodeMethods = countByString(runs.map((run) => run?.packageProtection?.decodeMethod || ""));
  const dominantDecodeMethod = pickDominantKey(decodeMethods);
  const costDriver = classifyCostDriver(metrics);

  return {
    present: true,
    variant,
    channel,
    smokeStatus: String(normalized.status || "missing"),
    automatedStatus: String(normalized.automatedScorecard?.status || "missing"),
    repeats: Number(normalized.repeats || runs.length || 0),
    xpiBytes: Number(normalized.xpi?.sizeBytes || 0),
    bundleBytes: Number(normalized.bundle?.sizeBytes || 0),
    decodeMethods,
    dominantDecodeMethod,
    costDriver,
    metrics,
    summary: [
      `duration 中位 ${metrics.durationMsMedian}ms`,
      `protection pipeline 中位 ${metrics.protectionPipelineDurationMsMedian}ms`,
      dominantDecodeMethod ? `decode=${dominantDecodeMethod}` : null,
      costDriver !== "none" ? `cost-driver=${costDriver}` : null,
    ].filter(Boolean).join("；"),
  };
}

function classifyComparison(base, target, deltas) {
  if (!base?.present || !target?.present) {
    return "missing";
  }

  if (base.variant === "plain" && target.variant === "encrypted") {
    return deltas.duration.absolute <= 100 && deltas.protectionPipeline.absolute <= 50
      ? "low-overhead-baseline"
      : "baseline-regression";
  }

  if (base.variant === "plain" && target.variant === "shielded") {
    return target.costDriver === "loadSubScript"
      ? "loader-dominant"
      : "protected-heavier-than-plain";
  }

  if (base.variant === "shielded" && target.variant !== "shielded") {
    if (deltas.protectionPipeline.absolute > 0 && deltas.duration.absolute < 0) {
      return "noisy-faster-but-heavier";
    }
    if (deltas.protectionPipeline.absolute > 0) {
      return "heavier-than-shielded";
    }
    if (deltas.protectionPipeline.absolute < 0) {
      return "lighter-than-shielded";
    }
    return "same-as-shielded";
  }

  return "generic";
}

function buildComparisonInterpretation(base, target, deltas, classification) {
  if (!base?.present || !target?.present) {
    return `缺少 ${base?.variant || "base"} 或 ${target?.variant || "target"} smoke 报告。`;
  }

  switch (classification) {
    case "low-overhead-baseline":
      return `${target.variant} 对 plain 的冷启动增量较小，可继续作为低开销受保护基线。`;
    case "baseline-regression":
      return `${target.variant} 对 plain 的冷启动或保护链成本超出低开销基线预期，应先排查回归。`;
    case "loader-dominant":
      return `${target.variant} 的新增成本主要来自 loader/loadSubScript，而不是 decode/eval 本身。`;
    case "protected-heavier-than-plain":
      return `${target.variant} 相比 plain 有明显保护链成本，但当前成本驱动不再是单一 loader。`;
    case "noisy-faster-but-heavier":
      return `${target.variant} 的总启动时间看起来更快，但 protection pipeline 中位数更高，说明冷启动噪声掩盖了真实保护链增重。`;
    case "heavier-than-shielded":
      return `${target.variant} 相比 shielded 的 protection pipeline 更重，不应仅凭单次总启动更快就升级。`;
    case "lighter-than-shielded":
      return `${target.variant} 相比 shielded 的 protection pipeline 更轻，可继续观察是否保持相同防护阻力。`;
    case "same-as-shielded":
      return `${target.variant} 与 shielded 的 protection pipeline 基本持平，优先按防护收益决定是否保留。`;
    default:
      return `${target.variant} vs ${base.variant} 的差异需要结合 UX 风险和 protection pipeline 一起判断。`;
  }
}

function buildComparison(base, target) {
  if (!base || !target) {
    return null;
  }

  const deltas = {
    duration: buildDelta(base.metrics.durationMsMedian, target.metrics.durationMsMedian),
    loadSubScript: buildDelta(base.metrics.loadSubScriptDurationMsMedian, target.metrics.loadSubScriptDurationMsMedian),
    decode: buildDelta(base.metrics.decodeDurationMsMedian, target.metrics.decodeDurationMsMedian),
    decrypt: buildDelta(base.metrics.decryptDurationMsMedian, target.metrics.decryptDurationMsMedian),
    eval: buildDelta(base.metrics.evalDurationMsMedian, target.metrics.evalDurationMsMedian),
    prepare: buildDelta(base.metrics.prepareDurationMsMedian, target.metrics.prepareDurationMsMedian),
    protectionPipeline: buildDelta(base.metrics.protectionPipelineDurationMsMedian, target.metrics.protectionPipelineDurationMsMedian),
    xpiBytes: buildDelta(base.xpiBytes, target.xpiBytes),
    bundleBytes: buildDelta(base.bundleBytes, target.bundleBytes),
  };

  const classification = classifyComparison(base, target, deltas);
  return {
    id: `${target.variant}-vs-${base.variant}`,
    baseVariant: base.variant,
    targetVariant: target.variant,
    present: base.present === true && target.present === true,
    classification,
    classificationLabel: COMPARISON_CLASSIFICATION_LABELS[classification] || COMPARISON_CLASSIFICATION_LABELS.generic,
    deltas,
    interpretation: buildComparisonInterpretation(base, target, deltas, classification),
  };
}

function buildRecommendations({ plain, encrypted, shielded, jsconfuserString }) {
  const recommendations = [];
  const encryptedVsPlain = plain && encrypted ? buildComparison(plain, encrypted) : null;
  const shieldedVsPlain = plain && shielded ? buildComparison(plain, shielded) : null;
  const jsconfuserVsShielded = shielded && jsconfuserString ? buildComparison(shielded, jsconfuserString) : null;

  if (encryptedVsPlain?.classification === "low-overhead-baseline") {
    recommendations.push("keep-encrypted-baseline");
  }
  if (shieldedVsPlain?.classification === "loader-dominant") {
    recommendations.push("treat-shielded-as-loader-dominant");
  }
  if (
    jsconfuserVsShielded?.classification === "noisy-faster-but-heavier"
    || jsconfuserVsShielded?.classification === "heavier-than-shielded"
  ) {
    recommendations.push("do-not-promote-jsconfuser-string-by-duration-alone");
  }

  return recommendations;
}

export function summarizePackageProtectionPerformanceReport({
  channel = "stable",
  variants = DEFAULT_PACKAGE_PROTECTION_PERFORMANCE_VARIANTS,
  smokeReports = {},
} = {}) {
  const requestedVariants = Array.from(new Set(
    (Array.isArray(variants) ? variants : [])
      .map((variant) => normalizeVariant(variant))
      .filter(Boolean),
  ));
  const variantSummaries = requestedVariants.map((variant) => summarizeVariantPerformance({
    variant,
    channel,
    report: smokeReports[variant] || null,
  }));
  const variantMap = Object.fromEntries(variantSummaries.map((item) => [item.variant, item]));
  const comparisons = [
    buildComparison(variantMap.plain, variantMap.encrypted),
    buildComparison(variantMap.plain, variantMap.shielded),
    buildComparison(variantMap.plain, variantMap["shielded-jsconfuser-string"]),
    buildComparison(variantMap.shielded, variantMap["shielded-descriptor-bind"]),
    buildComparison(variantMap.shielded, variantMap["shielded-pref-bridge"]),
    buildComparison(variantMap.shielded, variantMap["shielded-surface-scrub"]),
    buildComparison(variantMap["shielded-surface-scrub"], variantMap["shielded-surface-scrub-wasm-digest"]),
    buildComparison(variantMap.shielded, variantMap["shielded-jsconfuser-string"]),
  ].filter(Boolean);
  const missingVariants = variantSummaries.filter((item) => !item.present).map((item) => item.variant);
  const recommendations = buildRecommendations({
    plain: variantMap.plain,
    encrypted: variantMap.encrypted,
    shielded: variantMap.shielded,
    jsconfuserString: variantMap["shielded-jsconfuser-string"],
  });

  let summary = "当前 smoke 性能数据已收口。";
  if (missingVariants.length > 0) {
    summary = `存在缺失 smoke 报告：${missingVariants.join(", ")}。`;
  } else if (recommendations.includes("do-not-promote-jsconfuser-string-by-duration-alone")) {
    summary = "encrypted 继续保持低开销基线；shielded 的主要成本来自 loader；shielded-jsconfuser-string 不应仅凭总启动时间更快就升级。";
  } else if (recommendations.includes("treat-shielded-as-loader-dominant")) {
    summary = "encrypted 继续保持低开销基线；shielded 的主要成本来自 loader/loadSubScript。";
  }

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    channel,
    requestedVariants,
    missingVariants,
    status: missingVariants.length === 0 ? "passed" : "partial",
    statusLabel: missingVariants.length === 0 ? "完整" : "部分缺失",
    focusRules: {
      uxRiskMetric: "durationMs",
      protectionOverheadMetric: "loadSubScriptDurationMs + prepareDurationMs",
      note: "用 durationMs 判断体感风险；用 protection pipeline 判断保护链真实成本，避免被 Zotero 冷启动噪声误导。",
    },
    recommendations,
    summary,
    variants: variantSummaries,
    comparisons,
  };
}

export function renderPackageProtectionPerformanceMarkdown(report = {}) {
  const lines = [
    "# Package Protection Performance",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- 渠道: \`${report.channel || "-"}\``,
    `- 状态: \`${report.statusLabel || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- UX 风险指标: \`${report.focusRules?.uxRiskMetric || "durationMs"}\``,
    `- 保护链指标: \`${report.focusRules?.protectionOverheadMetric || "loadSubScriptDurationMs + prepareDurationMs"}\``,
    `- 规则说明: ${report.focusRules?.note || "-"}`,
    `- 摘要: ${report.summary || "-"}`,
    "",
    "## Variants",
    "",
  ];

  (Array.isArray(report.variants) ? report.variants : []).forEach((variant) => {
    lines.push(`### ${variant.variant}`);
    lines.push("");
    lines.push(`- present: \`${variant.present ? "yes" : "no"}\``);
    lines.push(`- smoke: \`${variant.smokeStatus}\``);
    lines.push(`- automated: \`${variant.automatedStatus}\``);
    lines.push(`- repeats: \`${variant.repeats}\``);
    lines.push(`- durationMs median: \`${variant.metrics?.durationMsMedian ?? 0}ms\``);
    lines.push(`- durationMs p95/max: \`${variant.metrics?.durationMsP95 ?? 0}ms / ${variant.metrics?.durationMsMax ?? 0}ms\``);
    lines.push(`- loadSubScript median: \`${variant.metrics?.loadSubScriptDurationMsMedian ?? 0}ms\``);
    lines.push(`- loadSubScript p95/max: \`${variant.metrics?.loadSubScriptDurationMsP95 ?? 0}ms / ${variant.metrics?.loadSubScriptDurationMsMax ?? 0}ms\``);
    lines.push(`- decode median: \`${variant.metrics?.decodeDurationMsMedian ?? 0}ms\``);
    lines.push(`- decrypt median: \`${variant.metrics?.decryptDurationMsMedian ?? 0}ms\``);
    lines.push(`- eval median: \`${variant.metrics?.evalDurationMsMedian ?? 0}ms\``);
    lines.push(`- prepare median: \`${variant.metrics?.prepareDurationMsMedian ?? 0}ms\``);
    lines.push(`- prepare p95/max: \`${variant.metrics?.prepareDurationMsP95 ?? 0}ms / ${variant.metrics?.prepareDurationMsMax ?? 0}ms\``);
    lines.push(`- bootstrap resolve p95/max: \`${variant.metrics?.bootstrapResolveDurationMsP95 ?? 0}ms / ${variant.metrics?.bootstrapResolveDurationMsMax ?? 0}ms\``);
    lines.push(`- protection pipeline median: \`${variant.metrics?.protectionPipelineDurationMsMedian ?? 0}ms\``);
    lines.push(`- protection pipeline p95/max: \`${variant.metrics?.protectionPipelineDurationMsP95 ?? 0}ms / ${variant.metrics?.protectionPipelineDurationMsMax ?? 0}ms\``);
    lines.push(`- decode method: \`${variant.dominantDecodeMethod || "-"}\``);
    lines.push(`- cost driver: \`${variant.costDriver}\``);
    lines.push(`- XPI: \`${formatBytes(variant.xpiBytes)}\``);
    lines.push(`- Bundle: \`${formatBytes(variant.bundleBytes)}\``);
    lines.push(`- 摘要: ${variant.summary}`);
    lines.push("");
  });

  lines.push("## Comparisons");
  lines.push("");
  (Array.isArray(report.comparisons) ? report.comparisons : []).forEach((comparison) => {
    lines.push(`### ${comparison.targetVariant} vs ${comparison.baseVariant}`);
    lines.push("");
    lines.push(`- classification: \`${comparison.classificationLabel}\``);
    lines.push(`- duration delta: \`${formatSignedNumber(comparison.deltas?.duration?.absolute, "ms")} (${formatSignedPercent(comparison.deltas?.duration?.percent)})\``);
    lines.push(`- protection pipeline delta: \`${formatSignedNumber(comparison.deltas?.protectionPipeline?.absolute, "ms")}\``);
    lines.push(`- loadSubScript delta: \`${formatSignedNumber(comparison.deltas?.loadSubScript?.absolute, "ms")}\``);
    lines.push(`- prepare delta: \`${formatSignedNumber(comparison.deltas?.prepare?.absolute, "ms")}\``);
    lines.push(`- decode delta: \`${formatSignedNumber(comparison.deltas?.decode?.absolute, "ms")}\``);
    lines.push(`- eval delta: \`${formatSignedNumber(comparison.deltas?.eval?.absolute, "ms")}\``);
    lines.push(`- XPI delta: \`${formatSignedNumber(comparison.deltas?.xpiBytes?.absolute, "B")}\``);
    lines.push(`- Bundle delta: \`${formatSignedNumber(comparison.deltas?.bundleBytes?.absolute, "B")}\``);
    lines.push(`- 解读: ${comparison.interpretation}`);
    lines.push("");
  });

  lines.push("## Recommendations");
  lines.push("");
  if (Array.isArray(report.recommendations) && report.recommendations.length > 0) {
    report.recommendations.forEach((item) => {
      lines.push(`- \`${item}\``);
    });
  } else {
    lines.push("- 当前没有额外建议。");
  }

  return lines.join("\n");
}

export async function persistPackageProtectionPerformanceReport(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const normalizedChannel = normalizeChannel(report?.channel) || "stable";
  const archiveDir = resolveAgentArtifactPath(projectRootPath, "package-protection-performance");
  const reportPath = resolveAgentArtifactPath(projectRootPath, "package-protection-performance.json");
  const reportMDPath = resolveAgentArtifactPath(projectRootPath, "package-protection-performance.md");
  const archiveJSONPath = path.join(archiveDir, `${normalizedChannel}.json`);
  const archiveMDPath = path.join(archiveDir, `${normalizedChannel}.md`);

  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await fs.mkdir(archiveDir, { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionPerformanceMarkdown(report)}\n`, "utf-8"),
    fs.writeFile(archiveJSONPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(archiveMDPath, `${renderPackageProtectionPerformanceMarkdown(report)}\n`, "utf-8"),
  ]);

  return {
    reportPath,
    reportMDPath,
    archiveJSONPath,
    archiveMDPath,
  };
}

async function readSmokeReport(projectRootPath, variant, channel) {
  const filePath = resolveAgentArtifactPath(projectRootPath, "package-protection-smoke", `${variant}-${channel}.json`);
  try {
    return await readJSONFile(filePath, {
      missingCategory: "environment",
      invalidCategory: "validation",
      missingStage: "read-smoke-report",
      invalidStage: "read-smoke-report",
      label: `dist/package-protection-smoke/${variant}-${channel}.json`,
    });
  } catch (error) {
    if (error?.scriptErrorCategory === "environment" && String(error?.message || "").includes("Missing JSON file")) {
      return null;
    }
    throw error;
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionPerformanceArgs(argv);
  const smokeReports = {};

  for (const variant of options.variants) {
    smokeReports[variant] = await readSmokeReport(projectRoot, variant, options.channel);
  }

  const report = summarizePackageProtectionPerformanceReport({
    channel: options.channel,
    variants: options.variants,
    smokeReports,
  });
  const paths = await persistPackageProtectionPerformanceReport(report, {
    projectRootPath: projectRoot,
  });
  console.log(`Package protection performance report generated: ${paths.reportPath}`);
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
