import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  buildManualScorecard,
  normalizePackageProtectionSmokeReport,
} from "./package-protection-smoke.mjs";
import {
  buildScriptFailureInfo,
  isExecutedAsScript,
  readJSONFile,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

const STATUS_LABELS = Object.freeze({
  passed: "通过",
  attention: "关注",
  failed: "失败",
  missing: "缺失",
});

export const PACKAGE_PROTECTION_VERDICT_TARGETS = Object.freeze([
  {
    variant: "plain",
    channel: "stable",
    role: "control",
    required: false,
    manualRequired: false,
  },
  {
    variant: "encrypted",
    channel: "stable",
    role: "required-baseline",
    required: true,
    manualRequired: false,
  },
  {
    variant: "shielded",
    channel: "stable",
    role: "required-primary",
    required: true,
    manualRequired: true,
  },
  {
    variant: "shielded",
    channel: "beta",
    role: "required-compat-confirm",
    required: true,
    manualRequired: false,
  },
]);

function buildReportIndex(reports = []) {
  return new Map(
    (Array.isArray(reports) ? reports : [])
      .map((report) => normalizePackageProtectionSmokeReport(report))
      .map((report) => [`${report.variant}::${report.channel}`, report]),
  );
}

function hasReadableModuleRecovery(report) {
  const manual = report?.manualScorecard || buildManualScorecard();
  return (
    manual.webcrackInitialResult === "readable-module-recovery"
    || manual.llmSinglePassResult === "readable-module-recovery"
  );
}

function buildTargetSummary(spec, report) {
  const present = Boolean(report);
  const manualScorecard = report?.manualScorecard || buildManualScorecard();
  const smokeStatus = present ? String(report.status || "missing") : "missing";
  const automatedStatus = present ? String(report.automatedScorecard?.status || "missing") : "missing";
  const manualStatus = spec.manualRequired
    ? (present ? manualScorecard.status : "missing")
    : "not-required";

  let summary = "未收集到 package protection smoke 报告。";
  if (present && smokeStatus !== "passed") {
    summary = "smoke 未通过，先修复运行时或安装态回归。";
  } else if (present && automatedStatus !== "passed") {
    summary = "自动评分未通过，当前保护表面仍需回退或修正。";
  } else if (spec.manualRequired && manualStatus !== "completed") {
    summary = "手工评分待补，当前只能给 attention 结论。";
  } else if (spec.manualRequired && hasReadableModuleRecovery(report)) {
    summary = "手工评分显示仍可恢复可读模块主体，应进入下一波 hardening 评估。";
  } else if (present) {
    summary = "当前 target 已满足本轮收口条件。";
  }

  return {
    variant: spec.variant,
    channel: spec.channel,
    role: spec.role,
    present,
    smokeStatus,
    automatedStatus,
    manualStatus,
    manualRequired: spec.manualRequired,
    summary,
  };
}

export function summarizePackageProtectionVerdict(aggregate = {}) {
  const reportIndex = buildReportIndex(aggregate?.reports);
  const targets = PACKAGE_PROTECTION_VERDICT_TARGETS.map((spec) => buildTargetSummary(
    spec,
    reportIndex.get(`${spec.variant}::${spec.channel}`) || null,
  ));
  const requiredTargets = targets.filter((target) => target.role !== "control");
  const shieldedStableReport = reportIndex.get("shielded::stable") || null;
  const shieldedStableManual = shieldedStableReport?.manualScorecard || buildManualScorecard();
  const hasMissingRequiredTarget = requiredTargets.some((target) => target.present !== true);
  const hasFailedRequiredTarget = requiredTargets.some((target) => (
    target.smokeStatus !== "passed"
    || target.automatedStatus !== "passed"
  ));

  let status = "passed";
  let nextAction = "keep-current-shielded";
  let summary = "受保护打包当前满足本轮手动收口标准。";

  if (hasMissingRequiredTarget) {
    status = "missing";
    nextAction = "fix-smoke-regression";
    summary = "缺少必需的 smoke 报告，先补齐 encrypted stable / shielded stable / shielded beta 的实验结果。";
  } else if (hasFailedRequiredTarget) {
    status = "failed";
    nextAction = "fix-smoke-regression";
    summary = "必需 target 中存在 smoke 或 automated score 失败，先修复当前保护分支回归。";
  } else if (shieldedStableManual.status !== "completed") {
    status = "attention";
    nextAction = "collect-manual-score";
    summary = "功能兼容与自动评分都已通过，但 shielded stable 仍缺手工评分。";
  } else if (hasReadableModuleRecovery(shieldedStableReport)) {
    status = "attention";
    nextAction = "open-future-hardening-wave";
    summary = "shielded stable 的手工评分表明仍可恢复可读模块主体，建议后续开启 hardening wave。";
  }

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status,
    statusLabel: STATUS_LABELS[status] || STATUS_LABELS.attention,
    summary,
    nextAction,
    targets,
  };
}

export function renderPackageProtectionVerdictMarkdown(verdict) {
  const lines = [
    "# Package Protection Verdict",
    "",
    `- 生成时间: \`${verdict.generatedAt}\``,
    `- Advisory: \`${verdict.advisory ? "yes" : "no"}\``,
    `- 状态: \`${verdict.statusLabel}\``,
    `- nextAction: \`${verdict.nextAction}\``,
    `- 摘要: ${verdict.summary}`,
    "",
    "## Targets",
    "",
  ];

  verdict.targets.forEach((target) => {
    lines.push(`### ${target.variant}/${target.channel}`);
    lines.push("");
    lines.push(`- role: \`${target.role}\``);
    lines.push(`- present: \`${target.present ? "yes" : "no"}\``);
    lines.push(`- smokeStatus: \`${target.smokeStatus}\``);
    lines.push(`- automatedStatus: \`${target.automatedStatus}\``);
    lines.push(`- manualStatus: \`${target.manualStatus}\``);
    lines.push(`- manualRequired: \`${target.manualRequired ? "yes" : "no"}\``);
    lines.push(`- summary: ${target.summary}`);
    lines.push("");
  });

  return lines.join("\n");
}

export async function persistPackageProtectionVerdict(verdict, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const reportPath = resolveAgentArtifactPath(projectRootPath, "package-protection-verdict.json");
  const reportMDPath = resolveAgentArtifactPath(projectRootPath, "package-protection-verdict.md");

  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(verdict, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionVerdictMarkdown(verdict)}\n`, "utf-8"),
  ]);

  return {
    reportPath,
    reportMDPath,
  };
}

async function main() {
  const aggregatePath = resolveAgentArtifactPath(projectRoot, "package-protection-smoke.json");
  const aggregate = await readJSONFile(aggregatePath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-smoke-aggregate",
    label: "package protection smoke aggregate",
  });
  const verdict = summarizePackageProtectionVerdict(aggregate);
  const paths = await persistPackageProtectionVerdict(verdict);
  console.log(`Package protection verdict generated: ${paths.reportPath}`);
  if (verdict.status === "failed" || verdict.status === "missing") {
    process.exitCode = 2;
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
