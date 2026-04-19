import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  buildGateFrontpageSummary,
} from "./agent-frontpage-summary-lib.mjs";
import {
  buildAgentContext,
  loadAgentContextSources,
  summarizeAgentContextSnapshot,
  writeAgentContextArtifacts,
} from "./agent-context-lib.mjs";
import {
  DEFAULT_WATCH_STALE_AFTER_MINUTES,
  summarizeZoteroWatchStatus,
} from "./zotero-watch-status-lib.mjs";
import {
  buildVisualCaptureFailureStageSummary,
  buildVisualExhaustedStageSummary,
  buildPureVisualReaderFailureSummary,
  buildVisualPrimaryBlockerSummary,
  isPureVisualReaderFailure,
  summarizeAutofixReport,
  summarizeE2EReport,
  summarizeWatchRecoveryReport,
} from "./agent-zotero-validation-lib.mjs";
import { summarizeDebugProbeReport } from "./agent-zotero-debug-probe-lib.mjs";
import {
  evaluateObsidianWorkspaceGuard,
} from "./agent-obsidian-guard-lib.mjs";
import {
  buildValidationDecision,
  collectValidationContext,
} from "./agent-validation-decision-lib.mjs";
import { evaluateArtifactProvenance } from "./agent-provenance-lib.mjs";
import {
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";
import { summarizeEngineeringHardening } from "./engineering-hardening-lib.mjs";
import { normalizeRemoteReleaseVerification } from "./release-remote-verification-lib.mjs";
import {
  buildReleaseGateContract,
  RELEASE_PLAN_RUN_DESCRIPTION,
  RELEASE_PLAN_RUN_NAME,
} from "./release-flow-contract-lib.mjs";
import { resolveZoteroDebugProbeArtifacts } from "./zotero-agent-artifacts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

const TASK_DESCRIPTIONS = {
  check: "执行统一质量检查（lint、格式、类型、verify、test）",
  [RELEASE_PLAN_RUN_NAME]: RELEASE_PLAN_RUN_DESCRIPTION,
  "telemetry-test": "遥测成功样例，用于验证日志链路",
  "telemetry-fail-test": "遥测失败样例，用于验证失败统计",
};

const RELEASE_GATE_CONTRACT = buildReleaseGateContract();

const PROFILE_DEFAULTS = {
  dev: {
    minPassRate: 60,
    maxRecentFailed: 2,
    recentWindow: 10,
    requiredRuns: ["check"],
    watchStatusEnabled: true,
    watchStaleAfterMinutes: DEFAULT_WATCH_STALE_AFTER_MINUTES,
    zoteroValidationEnabled: true,
    zoteroE2EStaleAfterMinutes: 8 * 60,
  },
  release: {
    minPassRate: 85,
    maxRecentFailed: 0,
    recentWindow: 10,
    requiredRuns: ["check", RELEASE_PLAN_RUN_NAME],
    watchStatusEnabled: false,
    watchStaleAfterMinutes: DEFAULT_WATCH_STALE_AFTER_MINUTES,
    zoteroValidationEnabled: false,
    zoteroE2EStaleAfterMinutes: 8 * 60,
  },
};

const DIAGNOSTIC_RUN_NAMES = new Set([
  "telemetry-test",
  "telemetry-fail-test",
]);

const SEVERITY_RANK = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function isDiagnosticRunName(runName) {
  const normalized = String(runName || "");
  if (DIAGNOSTIC_RUN_NAMES.has(normalized)) {
    return true;
  }
  return /^gate-.*-case$/u.test(normalized);
}

function assert(condition, message) {
  assertScript(condition, message, {
    category: "validation",
    failedStage: "validate-input",
  });
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

async function loadJSONIfExists(filePath) {
  return await fs.readFile(filePath, "utf-8")
    .then((content) => JSON.parse(content))
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
}

async function loadZoteroValidationSummary() {
  const e2ePath = resolveAgentArtifactPath(projectRoot, "agent-zotero-e2e.json");
  const autofixPath = resolveAgentArtifactPath(projectRoot, "agent-zotero-autofix.json");
  const watchRecoveryPath = resolveAgentArtifactPath(projectRoot, "zotero-watch-recovery-regression.json");
  const debugProbeArtifacts = resolveZoteroDebugProbeArtifacts(projectRoot);
  const [e2eReport, autofixReport, watchRecoveryReport, debugProbeReport] = await Promise.all([
    loadJSONIfExists(e2ePath),
    loadJSONIfExists(autofixPath),
    loadJSONIfExists(watchRecoveryPath),
    loadJSONIfExists(debugProbeArtifacts.reportJSON),
  ]);

  return {
    e2e: summarizeE2EReport(e2eReport),
    autofix: summarizeAutofixReport(autofixReport),
    watchRecovery: summarizeWatchRecoveryReport(watchRecoveryReport),
    debugProbe: summarizeDebugProbeReport(debugProbeReport, {
      e2eGeneratedAt: e2eReport?.generatedAt || null,
    }),
  };
}

function formatDateTime(dateLike) {
  if (!dateLike) {
    return "-";
  }
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return String(dateLike);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function parseArgs(argv) {
  const options = {
    profile: "dev",
    minPassRate: null,
    maxRecentFailed: null,
    recentWindow: null,
    requiredRuns: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--profile") {
      options.profile = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--min-pass-rate") {
      options.minPassRate = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--max-recent-failed") {
      options.maxRecentFailed = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--recent-window") {
      options.recentWindow = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--require") {
      const name = String(argv[i + 1] || "").trim();
      if (name) {
        options.requiredRuns.push(name);
      }
      i += 1;
      continue;
    }
    throw createScriptError("args", `Unknown option: ${arg}`, {
      failedStage: "parse-args",
    });
  }

  assertScript(options.profile === "dev" || options.profile === "release", "profile must be dev or release", {
    category: "args",
    failedStage: "parse-args",
  });
  if (options.minPassRate !== null) {
    assertScript(Number.isFinite(options.minPassRate), "min-pass-rate must be a number", {
      category: "args",
      failedStage: "parse-args",
    });
  }
  if (options.maxRecentFailed !== null) {
    assertScript(Number.isFinite(options.maxRecentFailed), "max-recent-failed must be a number", {
      category: "args",
      failedStage: "parse-args",
    });
  }
  if (options.recentWindow !== null) {
    assertScript(Number.isFinite(options.recentWindow), "recent-window must be a number", {
      category: "args",
      failedStage: "parse-args",
    });
  }
  return options;
}

function resolvePolicy(cliOptions) {
  const defaults = PROFILE_DEFAULTS[cliOptions.profile];
  const policy = {
    profile: cliOptions.profile,
    minPassRate: cliOptions.minPassRate ?? defaults.minPassRate,
    maxRecentFailed: cliOptions.maxRecentFailed ?? defaults.maxRecentFailed,
    recentWindow: cliOptions.recentWindow ?? defaults.recentWindow,
    watchStatusEnabled: Boolean(defaults.watchStatusEnabled),
    watchStaleAfterMinutes: Number(defaults.watchStaleAfterMinutes || DEFAULT_WATCH_STALE_AFTER_MINUTES),
    zoteroValidationEnabled: Boolean(defaults.zoteroValidationEnabled),
    zoteroE2EStaleAfterMinutes: Number(defaults.zoteroE2EStaleAfterMinutes || (8 * 60)),
    requiredRuns: cliOptions.requiredRuns.length > 0
      ? cliOptions.requiredRuns
      : defaults.requiredRuns,
  };

  policy.requiredRuns = Array.from(
    new Set(policy.requiredRuns.map((name) => String(name).trim()).filter(Boolean)),
  );

  return policy;
}

function latestRunByName(runs, runName) {
  return runs.find((run) => String(run.runName || "") === String(runName));
}

function evaluateWatchStatus(watchStatus, policy) {
  if (!policy.watchStatusEnabled) {
    return {
      enabled: false,
      present: Boolean(watchStatus),
      ok: true,
      status: "disabled",
      issues: [],
      recommendations: [],
    };
  }

  if (!watchStatus || typeof watchStatus !== "object") {
    return {
      enabled: true,
      present: false,
      ok: true,
      status: "missing",
      issues: [],
      recommendations: [
        "建议运行 `npm run zotero:watch`，让开发态热重载健康状态进入门禁视野。",
      ],
    };
  }

  const summary = summarizeZoteroWatchStatus(watchStatus, {
    staleAfterMinutes: policy.watchStaleAfterMinutes,
  });
  const issues = [];
  const recommendations = [];
  if (summary.status !== "healthy") {
    if (summary.status === "stale") {
      issues.push(`Zotero watch 健康状态已过期：最近一次状态时间距离现在约 ${summary.ageText}。`);
      recommendations.push("重新执行 `npm run zotero:watch` 或 `npm run agent:zotero:e2e`，刷新当前热重载健康状态。");
    } else if (summary.status === "future") {
      issues.push(`Zotero watch 状态时间异常：报告时间显示为 ${summary.ageText}，请检查系统时间或重新生成 watch 状态。`);
      recommendations.push("优先重新执行 `npm run zotero:watch`，确认新的状态时间与当前机器时间一致。");
    } else {
      issues.push(`Zotero watch 状态未恢复健康：${summary.status}。`);
    }
    if (Array.isArray(summary.latestIssues) && summary.latestIssues.length > 0) {
      summary.latestIssues.slice(0, 3).forEach((item) => {
        issues.push(`watch 问题：${item}`);
      });
    }
    recommendations.push("先查看 `dist/zotero-watch-status.md`，确认热重载失败是否已经自动恢复。");
    recommendations.push("必要时重新执行 `npm run zotero:watch -- --fresh` 或 `npm run agent:zotero:e2e`。");
  }

  return {
    enabled: true,
    present: true,
    ok: issues.length === 0,
    status: summary.status,
    statusLabel: summary.statusLabel,
    severity: summary.severity,
    generatedAt: summary.generatedAt,
    ageText: summary.ageText,
    ageMinutes: summary.ageMinutes,
    stale: summary.stale,
    staleAfterMinutes: summary.staleAfterMinutes,
    latestTrigger: summary.latestTrigger,
    latestPassed: summary.latestPassed,
    latestIssues: summary.latestIssues,
    issues,
    recommendations,
  };
}

function filterConflictingRecommendationsForWatchStatus(recommendations, watchStatus) {
  const list = Array.isArray(recommendations) ? recommendations.filter(Boolean) : [];
  if (watchStatus === "healthy" || watchStatus === "missing" || watchStatus === "disabled") {
    return list;
  }

  const blockedPatterns = [
    /agent:obsidian/u,
    /e2e:update-baseline/u,
  ];
  if (watchStatus === "failed" || watchStatus === "future") {
    blockedPatterns.push(/agent:zotero:autofix/u);
  }

  return list.filter((item) => {
    const text = String(item);
    return blockedPatterns.every((pattern) => !pattern.test(text));
  });
}

function parseISODate(dateLike) {
  if (!dateLike) {
    return null;
  }
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function compareDates(leftDateLike, rightDateLike) {
  const left = parseISODate(leftDateLike);
  const right = parseISODate(rightDateLike);
  if (!left || !right) {
    return null;
  }
  return left.getTime() - right.getTime();
}

function formatConfidence(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function isBlockingSeverity(severity) {
  return (SEVERITY_RANK[String(severity || "").toLowerCase()] || 0) >= SEVERITY_RANK.high;
}

function findCapabilityStatus(e2e, capabilityId) {
  const statuses = Array.isArray(e2e?.capabilityStatuses) ? e2e.capabilityStatuses : [];
  return statuses.find((item) => String(item?.id || "") === String(capabilityId)) || null;
}

function evaluateZoteroValidation(validationSummary, policy, validationDecision = null) {
  if (!policy.zoteroValidationEnabled) {
    return {
      enabled: false,
      ok: true,
      issues: [],
      recommendations: [],
      e2e: {
        present: Boolean(validationSummary?.e2e),
        status: "disabled",
      },
      autofix: {
        present: Boolean(validationSummary?.autofix),
        status: "disabled",
      },
    };
  }

  const e2e = validationSummary?.e2e && typeof validationSummary.e2e === "object"
    ? validationSummary.e2e
    : null;
  const autofix = validationSummary?.autofix && typeof validationSummary.autofix === "object"
    ? validationSummary.autofix
    : null;
  const watchRecovery = validationSummary?.watchRecovery && typeof validationSummary.watchRecovery === "object"
    ? validationSummary.watchRecovery
    : null;
  const debugProbe = validationSummary?.debugProbe && typeof validationSummary.debugProbe === "object"
    ? validationSummary.debugProbe
    : null;

  const issues = [];
  const recommendations = [];
  const primaryDiagnosis = e2e?.primaryDiagnosis && typeof e2e.primaryDiagnosis === "object"
    ? e2e.primaryDiagnosis
    : null;
  const pureVisualReaderFailure = isPureVisualReaderFailure(e2e);
  const visualPrimaryBlockerSummary = buildPureVisualReaderFailureSummary(e2e)
    || buildVisualPrimaryBlockerSummary(e2e);
  const diagnosisBlocking = typeof e2e?.diagnosisBlocking === "boolean"
    ? e2e.diagnosisBlocking
    : isBlockingSeverity(primaryDiagnosis?.severity);
  const autofixVsE2E = compareDates(autofix?.generatedAt, e2e?.generatedAt);
  let autofixRelation = "unknown";
  if (!autofix?.present) {
    autofixRelation = "missing";
  } else if (!e2e?.present) {
    autofixRelation = "no-e2e";
  } else if (autofixVsE2E === null) {
    autofixRelation = "unknown";
  } else if (autofixVsE2E > 0) {
    autofixRelation = "newer";
  } else if (autofixVsE2E < 0) {
    autofixRelation = "older";
  } else {
    autofixRelation = "same";
  }

  const visualLevel = String(validationDecision?.level || "").trim() || "visual-recommended";
  const visualRequired = visualLevel === "visual-required";
  const visualRecommended = visualLevel === "visual-recommended";

  if (visualRequired && validationDecision?.blocking && validationDecision?.issue) {
    issues.push(validationDecision.issue);
    if (validationDecision.recommendation) {
      recommendations.push(validationDecision.recommendation);
    }
  } else if (visualRecommended && validationDecision?.deferredEvidenceAction) {
    recommendations.push(validationDecision.deferredEvidenceAction);
  }

  if (!e2e?.present) {
    recommendations.push("建议运行 `npm run agent:zotero:e2e`，把最近的 Zotero 真机验证结果纳入质量闸门。");
  } else {
    const recoverableMissingKeyService = Boolean(e2e.serviceRecoverableMissingKey);
    const readerEvent = e2e?.readerEventReport && typeof e2e.readerEventReport === "object"
      ? e2e.readerEventReport
      : null;
    const readerEventCapability = findCapabilityStatus(e2e, "reader-event-hooks");
    const readerEventExpected = Boolean(
      readerEvent?.present
      || (readerEventCapability && readerEventCapability.status !== "uncovered"),
    );

    if (e2e.capabilityObserved) {
      if (Number(e2e.capabilityUncoveredCount || 0) > 0) {
        const preview = Array.isArray(e2e.uncoveredCapabilityIds) && e2e.uncoveredCapabilityIds.length > 0
          ? `：${e2e.uncoveredCapabilityIds.slice(0, 3).join("、")}`
          : "。";
        issues.push(`能力地图仍有 ${Number(e2e.capabilityUncoveredCount || 0)} 个需场景覆盖的能力未被本次 E2E 覆盖${preview}`);
        recommendations.push("补齐 capability manifest 与 `zotero-scenarios/` 的映射，确保新增能力都有真机场景覆盖。");
      }
      if (Number(e2e.capabilityFailedCount || 0) > 0) {
        const preview = Array.isArray(e2e.failedCapabilityIds) && e2e.failedCapabilityIds.length > 0
          ? `：${e2e.failedCapabilityIds.slice(0, 3).join("、")}`
          : "。";
        recommendations.push(`本次 E2E 中存在失败能力${preview}，建议优先按能力维度查看对应场景和责任文件。`);
      }
    }
    if (readerEventExpected) {
      if (!readerEvent?.present) {
        issues.push("Reader 事件桥能力已有真机观测，但当前报告缺少结构化摘要。");
        recommendations.push("重新执行 `npm run agent:zotero:e2e`，确保 Reader 事件桥摘要随最新真机报告一并产出。");
      } else {
        if (readerEvent.status !== "passed") {
          issues.push(`Reader 事件桥未通过：${readerEvent.statusLabel || readerEvent.status || "未知"}。`);
        }
        if (readerEvent.available === false) {
          issues.push("Reader 事件 API 当前不可用，agent 无法稳定注册或观测 Reader Hook。");
        }
        if (readerEvent.syntheticFallbackAvailable === false) {
          issues.push("Reader 事件桥缺少 synthetic-fallback，agent 无法稳定回放细粒度 Reader 探针事件。");
        }
        if (readerEvent.status !== "passed" || readerEvent.available === false || readerEvent.syntheticFallbackAvailable === false) {
          recommendations.push("优先检查 `src/features/reader.js` 与 Reader 事件桥注册逻辑，确认官方事件 API 与 synthetic-fallback 都仍可用。");
          recommendations.push("同时复核 `zotero-scenarios/reader-event-hooks.scenario.js` 与 `zotero-scenarios/reader-fine-grained-hooks.scenario.js`，确保真机场景仍能产出结构化 Reader 事件桥证据。");
          recommendations.push("修复后重新执行 `npm run agent:zotero:e2e`，刷新 Reader 事件桥与细粒度 Hook 的真机结论。");
        }
      }
    }
    if (e2e.serviceObserved && (e2e.serviceHealthOK === false || Number(e2e.serviceUnhealthyCount || 0) > 0)) {
      if (recoverableMissingKeyService) {
        recommendations.push("AI runtime 当前仅因缺少非本地 provider 的 API key 而降级；若本轮不验证远端 AI 能力，可继续主线开发。");
        recommendations.push("需要验证 AI provider 闭环时，补充对应 API key 后重新执行 `npm run agent:zotero:e2e`。");
      } else {
        issues.push(`Zotero 服务健康异常：共 ${Number(e2e.serviceTotal || 0)} 个服务，异常 ${Number(e2e.serviceUnhealthyCount || 0)} 个，当前状态 ${e2e.serviceStatus || "unknown"}。`);
        recommendations.push("优先检查 service registry 与各服务的 start/stop/healthCheck 实现，确认异常服务是否已被正确暴露到 selfCheck。");
        if (Array.isArray(e2e.serviceIssues) && e2e.serviceIssues.length > 0) {
          e2e.serviceIssues.slice(0, 3).forEach((item) => {
            recommendations.push(`服务问题：${item}`);
          });
        }
      }
    }
    if (e2e.status !== "passed") {
      const treatAsBlockingVisual = pureVisualReaderFailure && visualRequired;
      if (treatAsBlockingVisual && visualPrimaryBlockerSummary) {
        issues.push(visualPrimaryBlockerSummary);
      }
      if (!pureVisualReaderFailure || visualRequired) {
        issues.push(`最近 Zotero E2E 未通过：${e2e.statusLabel || e2e.status || "unknown"}。`);
      }
      if (primaryDiagnosis) {
        if (!pureVisualReaderFailure || visualRequired) {
          issues.push(
            `主诊断：${primaryDiagnosis.featureLabel || primaryDiagnosis.feature || "未知功能"} / ${primaryDiagnosis.fingerprint || "unknown"}（${primaryDiagnosis.severity || "unknown"}，置信度 ${formatConfidence(primaryDiagnosis.confidence)}）。`,
          );
        }
      }
      if (Number(e2e.testFailed || 0) > 0) {
        issues.push(`Zotero E2E 中仍有 ${e2e.testFailed} 条集成测试失败。`);
      }
      if (Number(e2e.scenarioFailed || 0) > 0) {
        issues.push(`Zotero E2E 中仍有 ${e2e.scenarioFailed} 条场景验证失败。`);
      }
      if (Number(e2e.visualDriftCount || 0) > 0 && visualRequired) {
        issues.push(`Zotero E2E 检测到 ${e2e.visualDriftCount} 处视觉漂移。`);
      }
      if (!pureVisualReaderFailure && !autofix?.present) {
        issues.push("最近 Zotero E2E 未通过，且还没有对应的自动修复记录。");
        recommendations.push("执行 `npm run agent:zotero:autofix`，让 agent 先按既定恢复链路尝试修复一次。");
      } else if (!pureVisualReaderFailure && autofixRelation === "older") {
        issues.push("最近 Zotero E2E 未通过，但自动修复记录仍早于这次失败结果。");
        recommendations.push("重新执行 `npm run agent:zotero:autofix`，确认恢复动作是否能覆盖这次新的失败。");
      }
      if (primaryDiagnosis) {
        if (diagnosisBlocking) {
          recommendations.push(`当前主诊断属于阻断级问题，优先处理“${primaryDiagnosis.featureLabel || primaryDiagnosis.feature || "未知功能"}”而不是继续堆叠新改动。`);
        } else {
          recommendations.push(`优先确认主诊断“${primaryDiagnosis.featureLabel || primaryDiagnosis.feature || "未知功能"}”是否为本次失败的主要根因。`);
        }
        if (Array.isArray(primaryDiagnosis.candidateFiles) && primaryDiagnosis.candidateFiles.length > 0) {
          recommendations.push(`优先查看候选文件：${primaryDiagnosis.candidateFiles.slice(0, 3).join("、")}。`);
        }
      }
      if (Array.isArray(e2e?.recommendedActions) && e2e.recommendedActions.length > 0) {
        e2e.recommendedActions.slice(0, 3).forEach((item) => {
          recommendations.push(`诊断建议：${item}`);
        });
      }
      if (pureVisualReaderFailure && visualRequired) {
        switch (String(e2e.visualPrimaryBlockerKind || "").trim()) {
          case "capture-command-failed":
            {
              const captureFailureSummary = buildVisualCaptureFailureStageSummary(e2e);
              recommendations.push(`${captureFailureSummary || "当前主阻断属于截图调用失败"}；先复核窗口 bounds、前台激活与 screencapture 调用，再重新执行 \`npm run agent:zotero:e2e\`，暂不建议进入 autofix、刷新视觉基线或走 obsidian-first。`);
            }
            break;
          case "capture-unstable":
            {
              const exhaustedStageSummary = buildVisualExhaustedStageSummary(e2e);
              recommendations.push(`${exhaustedStageSummary ? `用尽预算 stage：${exhaustedStageSummary}` : "当前仍有视觉 stage 用尽重试预算"}；当前主阻断属于视觉采集未稳定，先复核稳定性并重新执行 \`npm run agent:zotero:e2e\`，暂不建议进入 autofix、刷新视觉基线或走 obsidian-first。`);
            }
            break;
          case "baseline-geometry-mismatch":
            if (String(e2e.visualCanonicalCoverageKind || "").trim() === "partial") {
              recommendations.push(`当前主阻断仍是视觉基线几何不匹配，但 canonical baseline 只部分覆盖；仍不匹配：${(e2e.visualCanonicalMismatchedTargets || []).join("、") || "待确认"}。当前先执行 \`npm run agent:obsidian\` 固化证据并决定后续人工收口，不再默认重复刷新 baseline。`);
            } else {
              recommendations.push("当前主阻断属于视觉基线几何不匹配；截图已稳定且几何不一致，如当前 UI 变化属预期，可执行 `npm run agent:zotero:e2e:update-baseline` 刷新基线后复验。");
            }
            break;
          case "ui-regression-candidate":
            if (String(e2e.visualCanonicalCoverageKind || "").trim() === "complete") {
              recommendations.push("当前主阻断已排除采集稳定性、几何漂移与 canonical coverage 缺口；先执行 `npm run agent:obsidian` 固化 Reader UI / scenario 的人工复核结论。");
            }
            recommendations.push("当前主阻断更像真实 UI 回归候选，优先检查 Reader UI / scenario / baseline scene，暂不建议先刷新视觉基线。");
            recommendations.push("完成 Reader UI / scenario 复核后，重新执行 `npm run agent:zotero:e2e` 确认视觉结论。");
            break;
          default:
            recommendations.push("当前主阻断仍落在 Reader 视觉链路，优先重新执行 `npm run agent:zotero:e2e` 并复核视觉证据。");
            break;
        }
      } else if (pureVisualReaderFailure && visualRecommended) {
        recommendations.push("当前视觉问题按推荐级处理：先保持功能闭环推进，并在下一次合并前补一轮视觉验证。");
      } else if (pureVisualReaderFailure) {
        recommendations.push("当前改动域默认不做视觉阻断，视觉异常已降级为参考信号。");
      } else {
        recommendations.push("优先重新执行 `npm run agent:zotero:e2e`，确认真实 Zotero 动作、测试与视觉基线是否全部通过。");
      }
      if (!debugProbe?.present || debugProbe.freshForLatestE2E === false) {
        recommendations.push("若需要继续压缩本轮根因，可补跑 `npm run agent:zotero:e2e -- --probe-mode smart` 或独立执行 `npm run agent:zotero:debug-probe -- --mode smart`；该步骤只提供 advisory 解释力，不改 gate 语义。");
      } else if (debugProbe.status === "failed") {
        recommendations.push("最新 debug probe 自身未完成；先查看 `dist/agent-zotero-debug-probe.md`，确认失败 bundle 与 stopReason。");
      } else if (debugProbe.executedProbeCount > 0) {
        recommendations.push(`最新 debug probe 已补充解释：${debugProbe.summary || "可查看对应 bundle 结果"}`);
      }
    } else if (Number.isFinite(e2e.ageMinutes) && e2e.ageMinutes > policy.zoteroE2EStaleAfterMinutes) {
      issues.push(`最近 Zotero E2E 结果已过期：距离现在约 ${e2e.ageText}。`);
      recommendations.push("重新执行 `npm run agent:zotero:e2e`，刷新当前开发态的真机验证结论。");
    }
  }

  if (pureVisualReaderFailure) {
    // Pure visual Reader failures should not default to autofix.
  } else if (!autofix?.present) {
    recommendations.push("如需闭环恢复验证，可运行 `npm run agent:zotero:autofix`。");
  } else if (autofix.status === "unrecovered" && e2e?.status !== "passed") {
    const autofixDate = parseISODate(autofix.generatedAt);
    const e2eDate = parseISODate(e2e?.generatedAt);
    if (!e2eDate || (autofixDate && autofixDate >= e2eDate)) {
      issues.push("最近自动修复结果仍为未恢复，请先处理 Zotero 真机闭环中的剩余失败。");
      recommendations.push("查看 `dist/agent-zotero-autofix.md`，确认自动恢复已经尝试过哪些步骤。");
      if (Array.isArray(autofix.failedStepBreakdown) && autofix.failedStepBreakdown.length > 0) {
        const topFailed = autofix.failedStepBreakdown[0];
        recommendations.push(`自动修复最常失败步骤：${topFailed.label}（${topFailed.count} 次）。`);
      }
    }
    if (autofix.patchPlanStatus === "review-ready" && autofix.patchApplicationStatus === "not-attempted") {
      recommendations.push("当前问题已命中白名单补丁计划，如需尝试自动落盘，可显式运行 `npm run agent:zotero:autofix -- --apply-whitelisted-patch`。");
    }
    if (autofix.patchApplicationStatus === "precheck-failed") {
      const patchIssues = Array.isArray(autofix.patchApplicationIssues)
        ? autofix.patchApplicationIssues
        : [];
      if (patchIssues.length > 0) {
        const issueText = patchIssues
          .slice(0, 3)
          .map((item) => `${item.label || item.reason || "未知原因"} x${item.count ?? 0}`)
          .join("；");
        issues.push(`白名单补丁预检失败：${issueText}。`);
        recommendations.push(`先处理补丁预检阻塞：${issueText}。`);
      } else {
        issues.push("白名单补丁预检失败，请先确认目标文件、锚点与补丁片段状态。");
        recommendations.push("先查看 `dist/agent-zotero-autofix.md` 中的补丁应用结果，再决定是否人工修正锚点或更新白名单草案。");
      }
    }
  }

  if (!watchRecovery?.present) {
    recommendations.push("如需验证 watch 异常恢复韧性，可运行 `npm run agent:zotero:watch-recovery`。");
  } else if (watchRecovery.status === "failed") {
    issues.push("最近 watch 恢复回归未通过，说明受控故障下的恢复链路仍不稳定。");
    if (Array.isArray(watchRecovery.issues) && watchRecovery.issues.length > 0) {
      watchRecovery.issues.slice(0, 3).forEach((item) => {
        issues.push(`恢复回归问题：${item}`);
      });
    }
    recommendations.push("优先查看 `dist/zotero-watch-recovery-regression.md`，确认失败发生在 watch-change、runtime-recovery 还是 session-restart-recovery。");
    recommendations.push("修复后重新执行 `npm run agent:zotero:watch-recovery`，确保恢复链在真机中重新闭环。");
  }

  return {
    enabled: true,
    ok: issues.length === 0,
    autofixRelation,
    e2e: e2e
      ? {
        ...e2e,
        primaryDiagnosis,
        diagnosisBlocking,
      }
      : { present: false, status: "missing", statusLabel: "缺失", primaryDiagnosis: null, diagnosisBlocking: false },
    autofix: autofix || { present: false, status: "missing", statusLabel: "缺失" },
    watchRecovery: watchRecovery || { present: false, status: "missing", statusLabel: "缺失" },
    debugProbe: debugProbe || { present: false, status: "missing", statusLabel: "缺失" },
    issues,
    recommendations,
  };
}

function evaluateReleaseMatrix(releaseMatrix, policy) {
  if (policy.profile !== "release") {
    return {
      enabled: false,
      ok: true,
      issues: [],
      recommendations: [],
      present: Boolean(releaseMatrix),
      status: "disabled",
      statusLabel: "未启用",
    };
  }

  if (!releaseMatrix || typeof releaseMatrix !== "object") {
    return {
      enabled: true,
      ok: false,
      issues: [
        "缺少本地发布矩阵工件，尚未确认 stable/beta 渠道的发布准备状态。",
      ],
      recommendations: [
        `先运行 \`${RELEASE_GATE_CONTRACT.preferredPreparationCommand}\` 生成最新发布工件并记录 \`${RELEASE_GATE_CONTRACT.requiredRunName}\` 遥测。`,
        `随后补跑 \`${RELEASE_GATE_CONTRACT.installSmokeStableCommand}\` 与 \`${RELEASE_GATE_CONTRACT.installSmokeBetaCommand}\`，再执行 \`npm run release:matrix\`。`,
      ],
      present: false,
      status: "missing",
      statusLabel: "缺失",
    };
  }

  const issues = [];
  const recommendations = [];
  if (releaseMatrix.status !== "passed") {
    issues.push(`本地发布矩阵未通过：${releaseMatrix.summary || releaseMatrix.statusLabel || releaseMatrix.status || "未知"}`);
  }
  if (Array.isArray(releaseMatrix.blockingIssues) && releaseMatrix.blockingIssues.length > 0) {
    releaseMatrix.blockingIssues.slice(0, 3).forEach((item) => {
      issues.push(`发布矩阵阻断：${item}`);
    });
  }
  if (Array.isArray(releaseMatrix.attentionIssues) && releaseMatrix.attentionIssues.length > 0) {
    releaseMatrix.attentionIssues.slice(0, 3).forEach((item) => {
      issues.push(`发布矩阵待补验证：${item}`);
    });
  }
  const remoteVerification = releaseMatrix.remoteVerification && typeof releaseMatrix.remoteVerification === "object"
    ? normalizeRemoteReleaseVerification(releaseMatrix.remoteVerification)
    : null;
  if (remoteVerification && remoteVerification.status !== "passed") {
    const remoteLabel = remoteVerification.statusLabel || remoteVerification.status || "未知";
    issues.push(`远端发布验证未通过：${remoteLabel} / ${remoteVerification.summary || "-"}`);
  } else if (remoteVerification && remoteVerification.releaseReady !== true) {
    const evidenceModeLabel = remoteVerification.evidenceModeLabel || remoteVerification.evidenceMode || "未知";
    issues.push(`远端发布验证缺少真实 HTTP(S) 分发证据：${evidenceModeLabel} / ${remoteVerification.summary || "-"}`);
  }

  if (issues.length > 0) {
    recommendations.push("先运行 `npm run release:matrix` 刷新本地发布矩阵。");
    recommendations.push("若缺少安装态验证，请补跑 `npm run release:install-smoke:stable` 与 `npm run release:install-smoke:beta`。");
    if (remoteVerification && (remoteVerification.status !== "passed" || remoteVerification.releaseReady !== true)) {
      recommendations.push("确认自定义发布端已上传最新 `update.json` 与 `.xpi`，再运行 `npm run release:preflight -- --verify-remote`。");
      recommendations.push("随后运行 `npm run release:prepare && npm run release:matrix`，刷新远端验证摘要。");
    }
  }

  return {
    enabled: true,
    ok: issues.length === 0,
    issues,
    recommendations,
    present: true,
    status: releaseMatrix.status || "unknown",
    statusLabel: releaseMatrix.statusLabel || "未知",
    summary: releaseMatrix.summary || null,
    passedProfileCount: Number(releaseMatrix.passedProfileCount || 0),
    failedProfileCount: Number(releaseMatrix.failedProfileCount || 0),
    attentionProfileCount: Number(releaseMatrix.attentionProfileCount || 0),
    blockingRuntimeErrorCount: Number(releaseMatrix.blockingRuntimeErrorCount || 0),
    hostNoiseErrorCount: Number(releaseMatrix.hostNoiseErrorCount || 0),
    blockingRuntimeErrorPortrait: releaseMatrix.blockingRuntimeErrorPortrait || "-",
    hostNoiseRuntimeErrorPortrait: releaseMatrix.hostNoiseRuntimeErrorPortrait || "-",
    blockingIssues: Array.isArray(releaseMatrix.blockingIssues) ? releaseMatrix.blockingIssues : [],
    attentionIssues: Array.isArray(releaseMatrix.attentionIssues) ? releaseMatrix.attentionIssues : [],
    hostNoiseIssues: Array.isArray(releaseMatrix.hostNoiseIssues) ? releaseMatrix.hostNoiseIssues : [],
    profiles: Array.isArray(releaseMatrix.profiles) ? releaseMatrix.profiles : [],
    remoteVerification,
  };
}

function evaluateGate(summary, policy, watchStatus = null, obsidianGuard = null, agentContext = null) {
  const allRuns = Array.isArray(summary.runs) ? summary.runs : [];
  const effectiveRuns = allRuns.filter((run) => !isDiagnosticRunName(run.runName));
  const effectivePassed = effectiveRuns.filter((run) => run.success === true).length;
  const effectivePassRate = effectiveRuns.length === 0
    ? Number(summary.passRate || 0)
    : Number(((effectivePassed / effectiveRuns.length) * 100).toFixed(2));
  const recentRuns = allRuns.slice(0, policy.recentWindow);
  const recentFailed = recentRuns
    .filter((run) => !isDiagnosticRunName(run.runName))
    .filter((run) => run.success === false)
    .length;
  const requiredChecks = policy.requiredRuns.map((runName) => {
    const latest = latestRunByName(summary.runs || [], runName);
    const ok = Boolean(latest && latest.success === true && Number(latest.exitCode) === 0);
    return {
      runName,
      description: TASK_DESCRIPTIONS[runName] || "项目自定义关键任务",
      exists: Boolean(latest),
      ok,
      latestStatus: latest?.status || "missing",
      latestExitCode: latest?.exitCode ?? null,
      latestStartedAtISO: latest?.startedAtISO || null,
    };
  });
  const watchStatusCheck = evaluateWatchStatus(watchStatus, policy);
  const validationDecision = buildValidationDecision({
    projectRoot,
    validationContext: summary.validationContext || null,
    changedPaths: summary.validationContext?.changedPaths || [],
    runNames: allRuns.map((run) => run?.runName).filter(Boolean),
    e2e: summary.zoteroValidation?.e2e || null,
    env: process.env,
  });
  const zoteroValidationCheck = evaluateZoteroValidation(summary.zoteroValidation, policy, validationDecision);
  const releaseMatrixCheck = evaluateReleaseMatrix(summary.releaseMatrix, policy);

  const issues = [];
  if (Number(summary.total || 0) <= 0) {
    issues.push("当前没有任何 agent 执行记录，请先执行 agent 任务。");
  }
  if (effectivePassRate < policy.minPassRate) {
    issues.push(`有效任务成功率 ${effectivePassRate}% 低于阈值 ${policy.minPassRate}%。`);
  }
  if (recentFailed > policy.maxRecentFailed) {
    issues.push(`最近 ${policy.recentWindow} 次执行中失败 ${recentFailed} 次，超过阈值 ${policy.maxRecentFailed} 次。`);
  }
  requiredChecks.forEach((item) => {
    if (!item.exists) {
      if (item.runName === RELEASE_PLAN_RUN_NAME) {
        issues.push(`缺少关键任务记录：${item.runName}（release gate 只认 \`${RELEASE_GATE_CONTRACT.preferredPreparationCommand}\` 产生的遥测，不只认 \`dist/release-plan.json\`）。`);
      } else {
        issues.push(`缺少关键任务记录：${item.runName}。`);
      }
      return;
    }
    if (!item.ok) {
      issues.push(`关键任务最近一次未通过：${item.runName}（退出码 ${item.latestExitCode ?? "-"}）。`);
    }
  });
  issues.push(...watchStatusCheck.issues);
  issues.push(...zoteroValidationCheck.issues);
  issues.push(...releaseMatrixCheck.issues);
  if (summary.provenance?.violation) {
    issues.push(summary.provenance.issue || summary.provenance.message || "检测到跨仓库工件来源。");
  }
  if (obsidianGuard?.violation) {
    issues.push(obsidianGuard.issue || obsidianGuard.message || "Obsidian workspace guard violation");
  }

  const recommendations = [];
  if (issues.length > 0) {
    recommendations.push("先运行 `npm run agent:check` 修复基础质量问题。");
    if (policy.profile === "release") {
      recommendations.push(`发布前运行 \`${RELEASE_GATE_CONTRACT.preferredPreparationCommand}\`，并确认 \`${RELEASE_GATE_CONTRACT.requiredRunName}\` 最近一次为成功。`);
    }
    recommendations.push("运行 `npm run agent:dashboard` 查看失败原因分布与最近记录。");
  } else {
    recommendations.push("当前已满足 agent 质量闸门，可继续推进后续开发或发布流程。");
  }
  recommendations.push(...watchStatusCheck.recommendations);
  recommendations.push(...zoteroValidationCheck.recommendations);
  recommendations.push(...releaseMatrixCheck.recommendations);
  if (Array.isArray(summary.provenance?.recommendations) && summary.provenance.recommendations.length > 0) {
    recommendations.push(...summary.provenance.recommendations);
  }
  if (obsidianGuard?.violation && obsidianGuard.recommendation) {
    recommendations.push(obsidianGuard.recommendation);
  }
  const filteredRecommendations = filterConflictingRecommendationsForWatchStatus(
    recommendations,
    watchStatusCheck.status,
  );
  const contextSummary = summarizeAgentContextSnapshot(agentContext);

  const frontpageSummary = buildGateFrontpageSummary({
    gatePassed: issues.length === 0,
    profile: policy.profile,
    issues,
    recommendations: filteredRecommendations,
    watchStatus: watchStatusCheck,
    obsidianGuard,
    zoteroValidation: zoteroValidationCheck,
    validationDecision,
    releaseMatrix: releaseMatrixCheck,
    deadChainAudit: summary.deadChainAudit || null,
  });
  frontpageSummary.agentContext = contextSummary;

  return {
    generatedAt: new Date().toISOString(),
    profile: policy.profile,
    gatePassed: issues.length === 0,
    policy,
    metrics: {
      total: Number(summary.total || 0),
      passed: Number(summary.passed || 0),
      failed: Number(summary.failed || 0),
      passRate: Number(summary.passRate || 0),
      effectiveTotal: effectiveRuns.length,
      effectivePassed,
      effectiveFailed: effectiveRuns.length - effectivePassed,
      effectivePassRate,
      qualityTotal: Number(summary.qualityTotal || effectiveRuns.length),
      qualityPassed: Number(summary.qualityPassed || effectivePassed),
      qualityFailed: Number(summary.qualityFailed || (effectiveRuns.length - effectivePassed)),
      qualityPassRate: Number(summary.qualityPassRate || effectivePassRate),
      diagnosticTotal: Number(summary.diagnosticTotal || (allRuns.length - effectiveRuns.length)),
      diagnosticPassed: Number(summary.diagnosticPassed ?? Math.max(0, Number(summary.passed || 0) - effectivePassed)),
      diagnosticFailed: Number(summary.diagnosticFailed ?? Math.max(0, Number(summary.failed || 0) - (effectiveRuns.length - effectivePassed))),
      diagnosticPassRate: Number(summary.diagnosticPassRate || 0),
      averageDurationMs: Number(summary.averageDurationMs || 0),
      recentFailed,
    },
    requiredChecks,
    watchStatus: watchStatusCheck,
    obsidianGuard,
    zoteroValidation: zoteroValidationCheck,
    releaseMatrix: releaseMatrixCheck,
    validationDecision,
    provenance: summary.provenance || null,
    deadChainAudit: summary.deadChainAudit || null,
    agentContext: contextSummary,
    readinessSummary: frontpageSummary,
    frontpageSummary,
    issues,
    recommendations: filteredRecommendations,
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Agent 质量闸门报告",
    "",
    `- 生成时间: \`${report.generatedAt}\` (${formatDateTime(report.generatedAt)})`,
    `- 评估档位: \`${report.profile}\``,
    `- 闸门结果: \`${report.gatePassed ? "通过" : "未通过"}\``,
    `- 脚本耗时: \`${report.durationMs ?? 0}ms\``,
    "",
    "## 指标摘要",
    "",
    `- 总执行次数: \`${report.metrics.total}\``,
    `- 成功: \`${report.metrics.passed}\``,
    `- 失败: \`${report.metrics.failed}\``,
    `- 成功率: \`${report.metrics.passRate}%\``,
    `- 有效任务总数: \`${report.metrics.effectiveTotal}\``,
    `- 有效任务成功率: \`${report.metrics.effectivePassRate}%\``,
    `- 平均耗时: \`${report.metrics.averageDurationMs}ms\``,
    `- 最近 ${report.policy.recentWindow} 次失败数: \`${report.metrics.recentFailed}\``,
    "",
    "## 关键任务检查",
    "",
    "| 任务 | 说明 | 最新状态 | 退出码 | 最近开始时间 | 是否通过 |",
    "|---|---|---|---:|---|---|",
  ];

  if (report.errorCategoryLabel || report.failedStage) {
    lines.splice(6, 0,
      "## 脚本失败画像",
      "",
      `- 分类: \`${report.errorCategoryLabel || report.errorCategory || "-"}\``,
      `- 阶段: \`${report.failedStage || "-"}\``,
      `- 信息: ${report.errorMessage || "-"}`,
      "",
    );
  }

  if (report.requiredChecks.length === 0) {
    lines.push("| - | - | - | - | - | - |");
  } else {
    report.requiredChecks.forEach((item) => {
      const timeText = item.latestStartedAtISO
        ? `${formatDateTime(item.latestStartedAtISO)} (${item.latestStartedAtISO})`
        : "-";
      lines.push(
        `| ${escapeMarkdown(item.runName)} | ${escapeMarkdown(item.description)} | ${item.latestStatus} | ${item.latestExitCode ?? "-"} | ${escapeMarkdown(timeText)} | ${item.ok ? "是" : "否"} |`,
      );
    });
  }

  lines.push("", "## Zotero Watch", "");
  if (!report.watchStatus?.enabled) {
    lines.push("- 当前档位未启用 Zotero watch 状态检查。");
  } else if (!report.watchStatus.present) {
    lines.push("- 未发现 `dist/zotero-watch-status.json`，暂不阻塞，但建议补跑 `npm run zotero:watch`。");
  } else {
    lines.push(`- 最近状态: \`${report.watchStatus.status}\` (${report.watchStatus.statusLabel || "未知"})`);
    lines.push(`- 最近触发: \`${report.watchStatus.latestTrigger || "-"}\``);
    lines.push(`- 最近通过: \`${report.watchStatus.latestPassed === null ? "-" : (report.watchStatus.latestPassed ? "true" : "false")}\``);
    lines.push(`- 状态时间: \`${report.watchStatus.generatedAt || "-"}\`${report.watchStatus.generatedAt ? ` (${formatDateTime(report.watchStatus.generatedAt)})` : ""}`);
    lines.push(`- 状态新鲜度: \`${report.watchStatus.ageText || "-"}\``);
    lines.push(`- 过期阈值: \`${report.watchStatus.staleAfterMinutes || DEFAULT_WATCH_STALE_AFTER_MINUTES} 分钟\``);
  }

  lines.push("", "## Obsidian Workspace Guard", "");
  if (!report.obsidianGuard) {
    lines.push("- 未执行 Obsidian 路径归属校验。");
  } else {
    lines.push(`- 校验模式: \`${report.obsidianGuard.strict ? "strict" : "warn"}\``);
    lines.push(`- 校验状态: \`${report.obsidianGuard.status || "unknown"}\``);
    lines.push(`- 当前仓库根目录: \`${report.obsidianGuard.projectRootCanonical || report.obsidianGuard.projectRoot || "-"}\``);
    lines.push(`- handoff 工件: \`${report.obsidianGuard.artifactPath || "-"}\``);
    lines.push(`- workspaceDir: \`${report.obsidianGuard.workspaceDirCanonical || report.obsidianGuard.workspaceDir || "-"}\``);
    lines.push(`- 结果说明: ${report.obsidianGuard.message || "-"}`);
  }

  lines.push("", "## 验证策略判定", "");
  if (!report.validationDecision) {
    lines.push("- 当前未生成验证策略判定。");
  } else {
    lines.push(`- 判定等级: \`${report.validationDecision.level || "unknown"}\` (${report.validationDecision.levelLabel || "未知"})`);
    lines.push(`- 判定来源: \`${report.validationDecision.decisionSource || report.validationDecision.source || "unknown"}\``);
    lines.push(`- 命中验证域: ${(report.validationDecision.matchedDomain || []).join("、") || "-"}`);
    lines.push(`- 命中项目覆盖: ${(report.validationDecision.matchedProjectOverride || []).join("、") || "-"}`);
    lines.push(`- 运行时升级: \`${report.validationDecision.escalatedByRuntimeSignals ? "是" : "否"}\``);
    lines.push(`- 是否阻断: \`${report.validationDecision.blocking ? "是" : "否"}\``);
    lines.push(`- 判定依据: ${(report.validationDecision.reasons || []).join("；") || "-"}`);
    lines.push(`- 所需检查: ${(report.validationDecision.requiredChecks || []).join("；") || "-"}`);
    lines.push(`- 所需证据: ${(report.validationDecision.requiredEvidence || []).join("；") || "-"}`);
    lines.push(`- 补证动作: ${report.validationDecision.deferredEvidenceAction || "-"}`);
  }

  lines.push("", "## 死链与旧链路审计", "");
  if (!report.deadChainAudit) {
    lines.push("- 当前未读取 dead-chain audit 摘要。");
  } else {
    lines.push(`- 状态: \`${report.deadChainAudit.statusLabel || report.deadChainAudit.status || "缺失"}\``);
    lines.push(`- 摘要: ${report.deadChainAudit.summary || "-"}`);
    lines.push(`- 硬死链: \`${report.deadChainAudit.hardDeadCount ?? 0}\``);
    lines.push(`- 已退休旧链路: \`${report.deadChainAudit.retiredChainCount ?? 0}\``);
    lines.push(`- 可继续收缩 delegation 链: \`${report.deadChainAudit.actionableRetiredChainCount ?? 0}\``);
    lines.push(`- 历史治理保留项: \`${report.deadChainAudit.historyRetainedCount ?? 0}\``);
    lines.push(`- Superseded bundle: \`${report.deadChainAudit.supersededBundleCount ?? 0}\``);
    lines.push(`- Safe delete 候选: \`${report.deadChainAudit.safeDeleteCandidateCount ?? 0}\``);
    if (report.deadChainAudit.prunePlan) {
      lines.push(`- 裁剪摘要: ${report.deadChainAudit.prunePlan.summary || "-"}`);
      lines.push(`- 下一波建议: \`${report.deadChainAudit.prunePlan.nextWave?.waveId || "-"}\` / ${report.deadChainAudit.prunePlan.nextWave?.title || "-"} / \`${report.deadChainAudit.prunePlan.nextWave?.candidateCount ?? 0}\``);
      lines.push(`- 手工收缩提案: \`${report.deadChainAudit.prunePlan.nextWaveProposal?.action || "-"}\` / ${(report.deadChainAudit.prunePlan.nextWaveProposal?.removeTaskIds || []).join("、") || "-"}`);
      lines.push(`- 历史链桥接提案: \`${report.deadChainAudit.prunePlan.chainCollapseProposalCount ?? 0}\``);
      lines.push(`- 叶子优先复核: \`${report.deadChainAudit.prunePlan.leafReviewCandidateCount ?? 0}\``);
      lines.push(`- 仅历史链引用: \`${report.deadChainAudit.prunePlan.retiredChainOnlyCount ?? 0}\``);
      lines.push(`- 被 active 依赖阻塞: \`${report.deadChainAudit.prunePlan.blockedByActiveCount ?? 0}\``);
    }
    if (report.deadChainAudit.prunePlan?.nextWaveProposal) {
      lines.push("- 手工收缩提案:");
      lines.push(`- Manifest: \`${report.deadChainAudit.prunePlan.nextWaveProposal.manifestPath || "-"}\``);
      lines.push(`- 动作: \`${report.deadChainAudit.prunePlan.nextWaveProposal.action || "-"}\``);
      lines.push(`- 建议移除: ${(report.deadChainAudit.prunePlan.nextWaveProposal.removeTaskIds || []).join("、") || "-"}`);
      lines.push(`- 摘要: ${report.deadChainAudit.prunePlan.nextWaveProposal.summary || "-"}`);
      lines.push(`- 复核命令: ${(report.deadChainAudit.prunePlan.nextWaveProposal.verificationCommands || []).join(" -> ") || "-"}`);
    }
    if (report.deadChainAudit.prunePlan && Array.isArray(report.deadChainAudit.prunePlan.chainCollapseProposals) && report.deadChainAudit.prunePlan.chainCollapseProposals.length > 0) {
      lines.push("- 历史链桥接提案:");
      report.deadChainAudit.prunePlan.chainCollapseProposals.forEach((proposal) => {
        lines.push(`- ${proposal.proposalId || "chain-collapse"}: ${(proposal.removableTaskIds || []).join(" -> ") || "-"}`);
        lines.push(`- 上游锚点: ${(proposal.upstreamAnchorTaskIds || []).join("、") || "-"}`);
        lines.push(`- 下游边界: ${(proposal.downstreamBoundaryTaskIds || []).join("、") || "-"}`);
        lines.push(`- 摘要: ${proposal.summary || "-"}`);
      });
    }
    if (report.deadChainAudit.prunePlan && Array.isArray(report.deadChainAudit.prunePlan.leafReviewCandidates) && report.deadChainAudit.prunePlan.leafReviewCandidates.length > 0) {
      lines.push("- 叶子优先裁剪候选:");
      report.deadChainAudit.prunePlan.leafReviewCandidates.forEach((item) => {
        lines.push(`- ${item.taskId || "-"}: ${item.recommendedAction || item.summary || "-"}`);
      });
    }
    if (Array.isArray(report.deadChainAudit.items) && report.deadChainAudit.items.length > 0) {
      lines.push("- 审计发现:");
      report.deadChainAudit.items.forEach((item) => {
        lines.push(`- [${item.kind || "unknown"}] ${item.summary || "-"}`);
      });
    }
  }

  lines.push("", "## Agent Context", "");
  if (!report.agentContext?.present) {
    lines.push("- 未发现 `agent-context.json`，当前 gate 仅基于 monitor / memory / gate 原始工件继续评估。");
  } else {
    lines.push(`- Context 生成时间: \`${report.agentContext.generatedAt || "-"}\``);
    lines.push(`- Compact Profile: \`${report.agentContext.budgetMeta?.profile || "-"}\``);
    lines.push(`- Compact Digest: \`${report.agentContext.budgetMeta?.digest || "-"}\``);
    lines.push(`- Truth Ref: batch=\`${report.agentContext.truthRef?.activeBatchId || "-"}\` / wave=\`${report.agentContext.truthRef?.currentWaveName || "-"}\` / validation=\`${report.agentContext.truthRef?.validationLevel || "-"}\``);
    lines.push(`- Action Ref: next=\`${report.agentContext.actionRef?.nextAction || "-"}\` / blocker=${report.agentContext.actionRef?.mainBlocker || "-"}`);
    lines.push(`- Status Ref: monitor=\`${report.agentContext.statusRef?.monitorStatus || "-"}\` / gate=\`${report.agentContext.statusRef?.gateStatus || "-"}\` / memory=\`${report.agentContext.statusRef?.memoryFingerprint || report.agentContext.statusRef?.memoryStrategyLabel || "-"}\` / release=\`${report.agentContext.statusRef?.releaseStatus || "-"}\``);
    lines.push(`- Drift Ref: \`${report.agentContext.driftRef?.status || "missing"}\` / warning \`${report.agentContext.driftRef?.warningCount ?? 0}\``);
    lines.push(`- 建议证据: ${(report.agentContext.evidenceRefs || []).join("；") || "-"}`);
    lines.push(`- Artifact Refs: truth=\`${report.agentContext.artifactRefs?.currentTruth || "-"}\` / monitor=\`${report.agentContext.artifactRefs?.monitor || "-"}\` / gate=\`${report.agentContext.artifactRefs?.gate || "-"}\` / memory=\`${report.agentContext.artifactRefs?.memory || "-"}\``);
    lines.push(`- Budget: \`${report.agentContext.budgetMeta?.withinBudget ? "within-budget" : "warning"}\` / violation \`${report.agentContext.budgetMeta?.violationCount ?? 0}\``);
    if (Array.isArray(report.agentContext.driftRef?.warnings) && report.agentContext.driftRef.warnings.length > 0) {
      lines.push("- Drift 警告:");
      report.agentContext.driftRef.warnings.forEach((item) => {
        lines.push(`- ${item}`);
      });
    }
  }

  lines.push("", "## 工件来源可信度", "");
  if (!report.provenance) {
    lines.push("- 当前未执行工件来源校验。");
  } else {
    lines.push(`- 校验状态: \`${report.provenance.status || "unknown"}\``);
    lines.push(`- 是否越界: \`${report.provenance.violation ? "是" : "否"}\``);
    lines.push(`- 结果说明: ${report.provenance.message || "-"}`);
    lines.push(`- run 归属: in-project ${report.provenance.runRecords?.inProjectCount ?? 0} / out-of-project ${report.provenance.runRecords?.outOfProjectCount ?? 0} / unknown ${report.provenance.runRecords?.unknownCount ?? 0}`);
    lines.push(`- delegation 归属: cwd 越界 ${report.provenance.delegation?.outOfProjectCwdCount ?? 0} / artifact-base 越界 ${report.provenance.delegation?.outOfProjectArtifactBaseCount ?? 0}`);
  }

  lines.push("", "## 恢复韧性摘要", "");
  if (!report.zoteroValidation?.enabled) {
    lines.push("- 当前档位未启用 Zotero 真机恢复韧性检查。");
  } else {
    const watchRecovery = report.zoteroValidation.watchRecovery || {};
    if (!watchRecovery.present) {
      lines.push("- 恢复回归: 未发现 `dist/zotero-watch-recovery-regression.json`。");
    } else {
      lines.push(`- 恢复回归: \`${watchRecovery.status || "unknown"}\` (${watchRecovery.statusLabel || "未知"})`);
      lines.push(`- 恢复回归新鲜度: \`${watchRecovery.ageText || "-"}\``);
      lines.push(`- 恢复回归最新触发: \`${watchRecovery.latestTrigger || "-"}\``);
      lines.push(`- 恢复回归最新状态: \`${watchRecovery.latestStatus || "-"}\``);
      lines.push(`- 恢复回归期望序列: ${(watchRecovery.expectedTriggers || []).join(" -> ") || "-"}`);
      lines.push(`- 恢复回归实际序列: ${(watchRecovery.observedTriggers || []).join(" -> ") || "-"}`);
    }
  }

  lines.push("", "## Zotero 真机验证", "");
  if (!report.zoteroValidation?.enabled) {
    lines.push("- 当前档位未启用 Zotero 真机验证检查。");
  } else {
    const e2e = report.zoteroValidation.e2e || {};
    const autofix = report.zoteroValidation.autofix || {};
    const debugProbe = report.zoteroValidation.debugProbe || {};
    if (!e2e.present) {
      lines.push("- 最近 E2E: 未发现 `dist/agent-zotero-e2e.json`。");
    } else {
      const firstVisualEvidenceItem = Array.isArray(e2e.visualEvidenceItems)
        ? e2e.visualEvidenceItems[0] || null
        : null;
      lines.push(`- 最近 E2E: \`${e2e.status || "unknown"}\` (${e2e.statusLabel || "未知"})`);
      lines.push(`- E2E 策略: \`${e2e.strategy || "-"}\``);
      lines.push(`- E2E 新鲜度: \`${e2e.ageText || "-"}\``);
      lines.push(`- 失败测试: \`${e2e.testFailed ?? 0}\``);
      lines.push(`- 失败场景: \`${e2e.scenarioFailed ?? 0}\``);
      lines.push(`- 视觉漂移: \`${e2e.visualDriftCount ?? 0}\``);
      lines.push(`- 服务状态: \`${e2e.serviceStatus || "unknown"}\``);
      lines.push(`- 服务总数: \`${e2e.serviceTotal ?? 0}\``);
      lines.push(`- 健康服务: \`${e2e.serviceHealthyCount ?? 0}\``);
      lines.push(`- 异常服务: \`${e2e.serviceUnhealthyCount ?? 0}\``);
      lines.push(`- 服务健康: \`${e2e.serviceObserved === false ? "未采集" : (e2e.serviceHealthOK === false ? "异常" : "正常")}\``);
      lines.push(`- 视觉主阻断类型: \`${e2e.visualPrimaryBlockerKindLabel || e2e.visualPrimaryBlockerKind || "-"}\``);
      lines.push(`- 证据导航: ${firstVisualEvidenceItem ? `先看 Cycle ${firstVisualEvidenceItem.cycleIndex ?? "-"} / ${firstVisualEvidenceItem.bootMode || "-"} / ${firstVisualEvidenceItem.kind || "visual"} / ${firstVisualEvidenceItem.canonicalTarget || "-"}` : "-"}`);
      lines.push(`- 失败证据项: \`${e2e.visualEvidenceFailingItemCount ?? 0} / ${e2e.visualEvidenceItemCount ?? 0}\``);
      lines.push(`- Attempt 诊断: ${e2e.visualCaptureAttemptDiagnosisSummary || "-"}`);
      lines.push(`- 视觉几何摘要: ${e2e.visualGeometrySummary || "-"}`);
      lines.push(`- 视觉主阻断: ${buildVisualPrimaryBlockerSummary(e2e) || "-"}`);
      lines.push(`- Canonical 覆盖类型: \`${e2e.visualCanonicalCoverageKindLabel || e2e.visualCanonicalCoverageKind || "-"}\``);
      lines.push(`- Canonical 覆盖摘要: ${e2e.visualCanonicalCoverageSummary || "-"}`);
      lines.push(`- Canonical 未对齐目标: ${(e2e.visualCanonicalMismatchedTargets || []).join("、") || "-"}`);
      if (e2e.domContractReport && typeof e2e.domContractReport === "object") {
        lines.push(`- DOM Contract: \`${e2e.domContractReport.statusLabel || e2e.domContractReport.status || "缺失"}\``);
        lines.push(`- DOM Contract Advisory: \`${e2e.domContractReport.advisory ? "是" : "否"}\``);
        lines.push(`- DOM Contract Route 覆盖: \`${e2e.domContractReport.passedRouteCount ?? 0}/${e2e.domContractReport.routeCount ?? 0}\``);
        lines.push(`- DOM Contract 异常 Route: \`${e2e.domContractReport.failedRouteCount ?? 0}\``);
        lines.push(`- DOM Contract 缺失 Route: \`${e2e.domContractReport.missingRouteCount ?? 0}\``);
        lines.push(`- DOM Contract 摘要: ${e2e.domContractReport.summary || "-"}`);
        const domContractRoutes = Array.isArray(e2e.domContractReport.routes) ? e2e.domContractReport.routes : [];
        if (domContractRoutes.length > 0) {
          lines.push("- DOM Contract Route:");
          domContractRoutes.forEach((route) => {
            lines.push(`- Route 项: ${(route.routeId || route.adapter || "-")} / ${route.statusLabel || route.status || "-"} / ${(route.scenarioNames || []).join("、") || "-"}`);
            lines.push(`- Route 摘要: ${route.summary || "-"}`);
            lines.push(`- 失败检查: ${(route.failedChecks || []).join("；") || "-"}`);
          });
        }
      }
      if (e2e.hangProbe && typeof e2e.hangProbe === "object" && e2e.hangProbe.present) {
        lines.push(`- Hang Probe: \`${e2e.hangProbe.statusLabel || e2e.hangProbe.status || "缺失"}\``);
        lines.push(`- Hang 触发场景: \`${e2e.hangProbe.scenarioName || "-"}\``);
        lines.push(`- Hang 原因: \`${e2e.hangProbe.reasonKind || "-"}\``);
        lines.push(`- Hang 进程存活: \`${e2e.hangProbe.processAlive === null ? "-" : (e2e.hangProbe.processAlive ? "yes" : "no")}\``);
        lines.push(`- Hang RSS: \`${e2e.hangProbe.rssMb === null ? "-" : `${e2e.hangProbe.rssMb.toFixed(1)} MB`}\``);
        lines.push(`- Hang OOM 信号: \`${e2e.hangProbe.oomSignalCount ?? 0}\``);
        lines.push(`- Hang 判断: ${e2e.hangProbe.likelyCauseLabel || "-"}`);
        lines.push(`- Hang 摘要: ${e2e.hangProbe.summary || "-"}`);
      }
      if (e2e.readerEventReport && typeof e2e.readerEventReport === "object") {
        lines.push(`- Reader 事件桥: \`${e2e.readerEventReport.status || "unknown"}\` (${e2e.readerEventReport.statusLabel || "未知"})`);
        lines.push(`- 事件 API: \`${e2e.readerEventReport.available === null ? "-" : (e2e.readerEventReport.available ? "可用" : "不可用")}\``);
        lines.push(`- 已知事件类型: \`${e2e.readerEventReport.knownTypeCount ?? "-"}\``);
        lines.push(`- 可探针类型: \`${e2e.readerEventReport.probeCompatibleTypeCount ?? "-"}\``);
        lines.push(`- synthetic-fallback: \`${e2e.readerEventReport.syntheticFallbackAvailable === null ? "-" : (e2e.readerEventReport.syntheticFallbackAvailable ? "可用" : "不可用")}\``);
        lines.push(`- Hook 场景: \`${e2e.readerEventReport.hookScenarioStatusLabel || "缺失"}\``);
        lines.push(`- 细粒度 Hook: \`${e2e.readerEventReport.fineGrainedScenarioStatusLabel || "缺失"}\``);
        if (
          e2e.toolbarDispatchMode
          || e2e.toolbarAppendedItemCount !== null
          || e2e.selectionPopupAppendedItemCount !== null
          || e2e.sidebarHeaderAppendedItemCount !== null
          || e2e.contextMenuProbeCount !== null
          || Array.isArray(e2e.contextMenuObservedTypes) && e2e.contextMenuObservedTypes.length > 0
          || Array.isArray(e2e.contextMenuSyntheticFallbackTypes) && e2e.contextMenuSyntheticFallbackTypes.length > 0
        ) {
          lines.push(`- Reader 深层事件点: ${e2e.readerDispatchSummary || "-"}`);
          lines.push(`- 工具栏分发: \`${e2e.toolbarDispatchMode ?? "-"}\``);
          lines.push(`- 工具栏追加项: \`${e2e.toolbarAppendedItemCount ?? "-"}\``);
          lines.push(`- 文本浮层追加项: \`${e2e.selectionPopupAppendedItemCount ?? "-"}\``);
          lines.push(`- 侧栏批注头追加项: \`${e2e.sidebarHeaderAppendedItemCount ?? "-"}\``);
          lines.push(`- 上下文菜单探针数: \`${e2e.contextMenuProbeCount ?? "-"}\``);
          lines.push(`- 上下文菜单已观测类型: ${(e2e.contextMenuObservedTypes || []).join("、") || "-"}`);
          lines.push(`- 上下文菜单 fallback 类型: ${(e2e.contextMenuSyntheticFallbackTypes || []).join("、") || "-"}`);
        }
      }
      lines.push(`- 能力地图观测: \`${e2e.capabilityObserved ? "已观测" : "未观测"}\``);
      lines.push(`- 需场景覆盖能力: \`${e2e.capabilityScenarioBoundTotal ?? 0}\``);
      lines.push(`- 已覆盖能力: \`${e2e.capabilityCoveredCount ?? 0}\``);
      lines.push(`- 失败能力: \`${e2e.capabilityFailedCount ?? 0}\``);
      lines.push(`- 未覆盖能力: \`${e2e.capabilityUncoveredCount ?? 0}\``);
      lines.push(`- E2E 过期阈值: \`${report.policy.zoteroE2EStaleAfterMinutes} 分钟\``);
      if (Array.isArray(e2e.capabilityStatuses) && e2e.capabilityStatuses.length > 0) {
        lines.push("- 能力覆盖状态:");
        e2e.capabilityStatuses.slice(0, 5).forEach((item) => {
          lines.push(`- 能力项: ${(item.label || item.id || "-")} / ${item.status || "unknown"} / ${(item.scenarioNames || []).join("、") || "-"}`);
        });
      }
      if (Array.isArray(e2e.serviceIssues) && e2e.serviceIssues.length > 0) {
        lines.push("- 服务健康问题:");
        e2e.serviceIssues.slice(0, 5).forEach((item) => {
          lines.push(`- 服务问题: ${item}`);
        });
      }
      if (e2e.primaryDiagnosis) {
        lines.push(`- 主诊断: \`${e2e.primaryDiagnosis.featureLabel || e2e.primaryDiagnosis.feature || "-"}\``);
        lines.push(`- 诊断指纹: \`${e2e.primaryDiagnosis.fingerprint || "-"}\``);
        lines.push(`- 诊断严重度: \`${e2e.primaryDiagnosis.severity || "-"}\``);
        lines.push(`- 诊断置信度: \`${formatConfidence(e2e.primaryDiagnosis.confidence)}\``);
        lines.push(`- 是否阻断级: \`${e2e.diagnosisBlocking ? "是" : "否"}\``);
        lines.push(`- 候选文件: ${(e2e.primaryDiagnosis.candidateFiles || []).join("、") || "-"}`);
        if (Array.isArray(e2e.recommendedActions) && e2e.recommendedActions.length > 0) {
          lines.push("- 诊断建议动作:");
          e2e.recommendedActions.slice(0, 5).forEach((item) => {
            lines.push(`- 建议动作: ${item}`);
          });
        }
      }
    }
    if (!debugProbe.present) {
      lines.push("- 最近 Debug Probe: 未发现 `dist/agent-zotero-debug-probe.json`。");
    } else {
      lines.push(`- 最近 Debug Probe: \`${debugProbe.status || "unknown"}\` (${debugProbe.statusLabel || "未知"})`);
      lines.push(`- Debug Probe 新鲜度: \`${debugProbe.ageText || "-"}\``);
      lines.push(`- Debug Probe 模式: \`${debugProbe.mode || "-"}\``);
      lines.push(`- Debug Probe 已选 bundles: \`${debugProbe.selectedProbeCount ?? 0}\``);
      lines.push(`- Debug Probe 已执行 bundles: \`${debugProbe.executedProbeCount ?? 0}\``);
      lines.push(`- Debug Probe 失败 bundles: \`${debugProbe.failedProbeCount ?? 0}\``);
      lines.push(`- Debug Probe 对齐最新 E2E: \`${debugProbe.freshForLatestE2E === null ? "-" : (debugProbe.freshForLatestE2E ? "yes" : "no")}\``);
      lines.push(`- Debug Probe Promotion: ${(debugProbe.promotions || []).join("、") || "-"}`);
      lines.push(`- Debug Probe 摘要: ${debugProbe.summary || "-"}`);
      lines.push(`- Debug Probe 下一步: ${debugProbe.nextSuggestedAction || "-"}`);
    }
    if (!autofix.present) {
      lines.push("- 最近自动修复: 未发现 `dist/agent-zotero-autofix.json`。");
    } else {
      lines.push(`- 最近自动修复: \`${autofix.status || "unknown"}\` (${autofix.statusLabel || "未知"})`);
      lines.push(`- 自动修复新鲜度: \`${autofix.ageText || "-"}\``);
      lines.push(`- 自动修复尝试: \`${autofix.attempts ?? 0}\``);
      lines.push(`- 自动修复总耗时: \`${autofix.totalDurationMs ?? 0}ms\``);
      lines.push(`- 自动修复相对 E2E: \`${report.zoteroValidation.autofixRelation || "unknown"}\``);
      lines.push(`- 补丁计划状态: \`${autofix.patchPlanStatusLabel || autofix.patchPlanStatus || "缺失"}\``);
      lines.push(`- 补丁应用状态: \`${autofix.patchApplicationStatusLabel || autofix.patchApplicationStatus || "未尝试"}\``);
      if (Array.isArray(autofix.patchApplicationIssues) && autofix.patchApplicationIssues.length > 0) {
        lines.push("- 补丁预检阻塞:");
        autofix.patchApplicationIssues.slice(0, 3).forEach((entry) => {
          lines.push(`- 预检问题: ${entry.label || entry.reason || "未知原因"}（${entry.count} 次）`);
        });
      }
      if (Array.isArray(autofix.failedStepBreakdown) && autofix.failedStepBreakdown.length > 0) {
        lines.push("- 自动修复失败步骤分布:");
        autofix.failedStepBreakdown.slice(0, 3).forEach((entry) => {
          lines.push(`- 步骤失败: ${entry.label}（${entry.count} 次）`);
        });
      }
    }
  }

  if (report.engineeringHardening) {
    lines.push("", "## 工程化硬化信号", "");
    lines.push(`- 摘要: ${report.engineeringHardening.summary || "-"}`);
    lines.push(`- 错误边界命中: \`${report.engineeringHardening.errorBoundaryHitCount ?? 0}\``);
    lines.push(`- 校验失败分类: \`${report.engineeringHardening.validationFailureCategories.map((item) => `${item.label} x${item.count}`).join("；") || "-"}\``);
    lines.push(`- HTTP timeout: \`${report.engineeringHardening.httpTimeoutCount ?? 0}\``);
    lines.push(`- HTTP retry: \`${report.engineeringHardening.httpRetryCount ?? 0}\``);
    lines.push(`- HTTP 慢操作: \`${report.engineeringHardening.httpSlowOperationCount ?? 0}\``);
    lines.push(`- 慢操作阈值: \`${report.engineeringHardening.httpSlowThresholdMs ?? 0}ms\``);
    lines.push(`- 生命周期时序: \`${report.engineeringHardening.hostReadyDurationMs ?? 0}ms / ${report.engineeringHardening.startupDurationMs ?? 0}ms / ${report.engineeringHardening.shutdownDurationMs ?? 0}ms\``);
    lines.push(`- 生命周期慢操作: \`${report.engineeringHardening.lifecycleSlowOperationCount ?? 0}\``);
    lines.push(`- 生命周期慢阈值: \`${report.engineeringHardening.lifecycleSlowThresholdMs ?? 0}ms\``);
    lines.push(`- 最近生命周期慢阶段: \`${report.engineeringHardening.lifecycleLastSlowStage || "-"}\``);
    lines.push(`- 边界事件: ${(report.engineeringHardening.errorBoundaryEvents || []).map((item) => `${item.event} x${item.count}`).join("；") || "-"}`);
    lines.push(`- 性能预算: \`${report.engineeringHardening.performanceBudget?.statusLabel || report.engineeringHardening.performanceBudget?.status || "-"} / ${report.engineeringHardening.performanceBudget?.budgetMode || "-"}\``);
    lines.push(`- 预算摘要: ${report.engineeringHardening.performanceBudget?.summary || "-"}`);
    lines.push(`- 预算活动: \`${report.engineeringHardening.performanceBudget?.measuredActivityCount ?? 0}/${report.engineeringHardening.performanceBudget?.expectedActivityCount ?? 0}\``);
    lines.push(`- 超预算项: \`${report.engineeringHardening.performanceBudget?.violationCount ?? 0}\``);
    lines.push(`- 预算告警: ${report.engineeringHardening.performanceBudget?.violationSummary || "-"}`);
  }

  lines.push("", "## 本地发布矩阵", "");
  if (!report.releaseMatrix?.enabled) {
    lines.push("- 当前档位未启用发布矩阵检查。");
  } else if (!report.releaseMatrix.present) {
    lines.push("- 未发现 `release-matrix.json`，发布前需先生成本地 stable/beta 发布矩阵。");
  } else {
    lines.push(`- 矩阵状态: \`${report.releaseMatrix.statusLabel || report.releaseMatrix.status || "未知"}\``);
    lines.push(`- 通过渠道: \`${report.releaseMatrix.passedProfileCount ?? 0}\``);
    lines.push(`- 失败渠道: \`${report.releaseMatrix.failedProfileCount ?? 0}\``);
    lines.push(`- 待补验证渠道: \`${report.releaseMatrix.attentionProfileCount ?? 0}\``);
    lines.push(`- 阻断型错误: \`${report.releaseMatrix.blockingRuntimeErrorCount ?? 0}\``);
    lines.push(`- 宿主噪声: \`${report.releaseMatrix.hostNoiseErrorCount ?? 0}\``);
    lines.push(`- 阻断错误画像: ${report.releaseMatrix.blockingRuntimeErrorPortrait || "-"}`);
    lines.push(`- 宿主噪声画像: ${report.releaseMatrix.hostNoiseRuntimeErrorPortrait || "-"}`);
    if (report.releaseMatrix.summary) {
      lines.push(`- 矩阵摘要: ${report.releaseMatrix.summary}`);
    }
    if (report.releaseMatrix.remoteVerification) {
      lines.push(`- 远端验证: \`${report.releaseMatrix.remoteVerification.statusLabel || report.releaseMatrix.remoteVerification.status || "未知"}\``);
      lines.push(`- 远端摘要: ${report.releaseMatrix.remoteVerification.summary || "-"}`);
      lines.push(`- 远端证据模式: \`${report.releaseMatrix.remoteVerification.evidenceModeLabel || report.releaseMatrix.remoteVerification.evidenceMode || "未知"}\``);
      lines.push(`- 远端发布就绪: \`${report.releaseMatrix.remoteVerification.releaseReady === true ? "是" : "否"}\``);
      lines.push(`- 远端 update.json: \`${report.releaseMatrix.remoteVerification.effectiveUpdateURL || "-"}\``);
      lines.push(`- 远端 update_link: \`${report.releaseMatrix.remoteVerification.observedUpdateLink || report.releaseMatrix.remoteVerification.expectedUpdateLink || "-"}\``);
    }
    lines.push("");
    lines.push("| 渠道 | 状态 | 元数据 | XPI | smoke | readiness | 阻断错误 | 宿主噪声 |");
    lines.push("|---|---|---|---|---|---|---|---|");
    const profiles = Array.isArray(report.releaseMatrix.profiles) ? report.releaseMatrix.profiles : [];
    if (profiles.length === 0) {
      lines.push("| - | - | - | - | - | - | - | - |");
    } else {
      profiles.forEach((profile) => {
        lines.push(
          `| ${escapeMarkdown(profile.label || profile.id || "-")} | ${escapeMarkdown(profile.statusLabel || "-")} | ${profile.metadataConsistent ? "通过" : "失败"} | ${profile.packageConsistent ? "通过" : "失败"} | ${profile.installSmokePresent ? (profile.installSmokePassed ? "通过" : "失败") : "未验证"} | ${escapeMarkdown(profile.installSmoke?.readinessMode || "-")} | ${escapeMarkdown(profile.blockingRuntimeErrorPortrait || "-")} | ${escapeMarkdown(profile.hostNoiseRuntimeErrorPortrait || "-")} |`,
        );
      });
    }
    lines.push("");
    if (Array.isArray(report.releaseMatrix.hostNoiseIssues) && report.releaseMatrix.hostNoiseIssues.length > 0) {
      lines.push("- 宿主噪声画像:");
      report.releaseMatrix.hostNoiseIssues.slice(0, 3).forEach((item) => {
        lines.push(`- 宿主噪声: ${item}`);
      });
      lines.push("");
    }
    if (Array.isArray(report.releaseMatrix.remoteVerification?.issues)
      && report.releaseMatrix.remoteVerification.issues.length > 0) {
      lines.push("- 远端验证问题:");
      report.releaseMatrix.remoteVerification.issues.slice(0, 3).forEach((item) => {
        lines.push(`- 远端: ${item}`);
      });
      lines.push("");
    }
  }

  lines.push("", "## 问题清单", "");
  if (report.issues.length === 0) {
    lines.push("- 无");
  } else {
    report.issues.forEach((issue) => lines.push(`- ${issue}`));
  }

  lines.push("", "## 建议动作", "");
  report.recommendations.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
  return lines.join("\n");
}

export async function writeGateArtifacts(gateJSONPath, gateMDPath, report) {
  await writeJSONArtifact(gateJSONPath, report);
  await fs.writeFile(gateMDPath, `${buildMarkdown(report)}\n`, "utf-8");
}

export async function refreshGateObsidianGuardSnapshot(targetProjectRoot, options = {}) {
  const gateJSONPath = resolveAgentArtifactPath(targetProjectRoot, "agent-gate.json");
  const gateMDPath = resolveAgentArtifactPath(targetProjectRoot, "agent-gate.md");
  const report = await loadJSONIfExists(gateJSONPath);
  if (!report || typeof report !== "object") {
    return null;
  }

  report.obsidianGuard = await evaluateObsidianWorkspaceGuard(targetProjectRoot, {
    strict: true,
    scope: "path",
    env: options.env || process.env,
  });
  await writeGateArtifacts(gateJSONPath, gateMDPath, report);
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const policy = resolvePolicy(options);

  const monitorPath = resolveAgentArtifactPath(projectRoot, "agent-monitor.json");
  const watchStatusPath = resolveAgentArtifactPath(projectRoot, "zotero-watch-status.json");
  const gateJSONPath = resolveAgentArtifactPath(projectRoot, "agent-gate.json");
  const gateMDPath = resolveAgentArtifactPath(projectRoot, "agent-gate.md");

  const source = await fs.readFile(monitorPath, "utf-8");
  const summary = JSON.parse(source);
  assert(summary && typeof summary === "object", "Invalid monitor summary");
  summary.zoteroValidation = await loadZoteroValidationSummary();
  summary.validationContext = summary.validationContext || await collectValidationContext(projectRoot);
  summary.provenance = await evaluateArtifactProvenance(projectRoot, summary.runs || [], {
    env: process.env,
  });
  const watchStatus = await fs.readFile(watchStatusPath, "utf-8")
    .then((content) => JSON.parse(content))
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
  const obsidianGuard = await evaluateObsidianWorkspaceGuard(projectRoot, {
    strict: true,
    scope: "path",
    env: process.env,
  });
  const agentContext = await loadJSONIfExists(resolveAgentArtifactPath(projectRoot, "agent-context.json"));

  const report = evaluateGate(summary, policy, watchStatus, obsidianGuard, agentContext);
  report.durationMs = Math.max(0, Date.now() - scriptStartedAt);
  if (!report.gatePassed) {
    Object.assign(
      report,
      buildScriptFailureInfo(
        createScriptError("validation", report.issues?.[0] || "Agent gate not passed", {
          failedStage: "gate-evaluation",
        }),
        { durationMs: report.durationMs },
      ),
    );
  } else {
    report.errorCategory = null;
    report.errorCategoryLabel = null;
    report.errorMessage = null;
    report.failedStage = null;
  }
  report.engineeringHardening = summarizeEngineeringHardening({
    e2e: report.zoteroValidation?.e2e,
    autofix: report.zoteroValidation?.autofix,
    gate: report,
  });
  await fs.mkdir(resolveAgentArtifactsDir(projectRoot), { recursive: true });
  await writeGateArtifacts(gateJSONPath, gateMDPath, report);

  const refreshedContext = buildAgentContext(
    await loadAgentContextSources(projectRoot),
    { generationStage: "post-gate" },
  );
  await writeAgentContextArtifacts(projectRoot, refreshedContext);
  report.agentContext = summarizeAgentContextSnapshot(refreshedContext);
  if (report.frontpageSummary && typeof report.frontpageSummary === "object") {
    report.frontpageSummary.agentContext = report.agentContext;
  }
  await writeGateArtifacts(gateJSONPath, gateMDPath, report);

  console.log(`Agent gate generated: ${gateJSONPath}`);
  if (!report.gatePassed) {
    process.exit(2);
  }
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch(async (error) => {
    const failureInfo = buildScriptFailureInfo(error, {
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
    });
    const gateJSONPath = resolveAgentArtifactPath(projectRoot, "agent-gate.json");
    const gateMDPath = resolveAgentArtifactPath(projectRoot, "agent-gate.md");
    const failureReport = {
      generatedAt: new Date().toISOString(),
      gatePassed: false,
      issues: [failureInfo.errorMessage],
      recommendations: ["先修复 gate 脚本异常，再重新执行 agent:gate。"],
      durationMs: failureInfo.durationMs,
      ...failureInfo,
    };
    try {
      await fs.mkdir(resolveAgentArtifactsDir(projectRoot), { recursive: true });
      await writeJSONArtifact(gateJSONPath, failureReport);
      await fs.writeFile(gateMDPath, [
        "# Agent Gate",
        "",
        `- 状态: 失败`,
        `- 分类: ${failureInfo.errorCategoryLabel}`,
        `- 阶段: ${failureInfo.failedStage}`,
        `- 信息: ${failureInfo.errorMessage}`,
        `- 耗时: ${failureInfo.durationMs}ms`,
        "",
      ].join("\n"), "utf-8");
    } catch {
      // ignore secondary failure
    }
    console.error(error?.message || String(error));
    process.exit(1);
  });
}
