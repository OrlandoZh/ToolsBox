import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  buildAutofixMarkdown,
  deriveRecoverySteps,
} from "./agent-zotero-autofix-lib.mjs";
import {
  applyPatchPlan,
  derivePatchPlan,
  evaluatePatchVerificationContract,
} from "./agent-zotero-patch-lib.mjs";
import {
  summarizeE2EReport,
  summarizeVerificationContractStats,
} from "./agent-zotero-validation-lib.mjs";
import {
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";
import { resolveZoteroAutofixArtifacts } from "./zotero-agent-artifacts.mjs";
import { normalizeDiagnosisFingerprint } from "./agent-zotero-diagnosis-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const zoteroArtifacts = resolveZoteroAutofixArtifacts(projectRoot);
const scriptStartedAt = Date.now();

function usage() {
  console.log(`Usage: node scripts/agent-zotero-autofix.mjs [options]

Options:
  --cycles <n>          Validation cycles per E2E run (default: 2)
  --strategy <mode>     Initial E2E strategy: hot | restart (default: hot)
  --max-attempts <n>    Maximum recovery steps to execute (default: 4)
  --apply-whitelisted-patch  Apply whitelisted patch drafts before recovery steps
`);
}

function assert(condition, message, options = {}) {
  assertScript(condition, message, {
    category: options.category || "args",
    failedStage: options.failedStage || "parse-args",
  });
}

function parseArgs(argv) {
  const options = {
    cycles: 2,
    strategy: "hot",
    maxAttempts: 4,
    applyWhitelistedPatch: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--cycles") {
      options.cycles = Number.parseInt(String(argv[index + 1] || "2"), 10);
      index += 1;
      continue;
    }
    if (arg === "--strategy") {
      options.strategy = String(argv[index + 1] || "hot").trim();
      index += 1;
      continue;
    }
    if (arg === "--max-attempts") {
      options.maxAttempts = Number.parseInt(String(argv[index + 1] || "4"), 10);
      index += 1;
      continue;
    }
    if (arg === "--apply-whitelisted-patch") {
      options.applyWhitelistedPatch = true;
      continue;
    }
    throw createScriptError("args", `Unknown option: ${arg}`, {
      failedStage: "parse-args",
    });
  }

  assert(Number.isInteger(options.cycles) && options.cycles >= 1 && options.cycles <= 10, "cycles must be 1-10");
  assert(options.strategy === "hot" || options.strategy === "restart", "strategy must be hot or restart");
  assert(Number.isInteger(options.maxAttempts) && options.maxAttempts >= 1 && options.maxAttempts <= 10, "max-attempts must be 1-10");
  return options;
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function getNodeCommand() {
  return process.execPath;
}

function getE2EReportPath() {
  return zoteroArtifacts.e2eReportJSON;
}

function toArtifactRelativePath(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function createArchiveRunId(dateLike) {
  const date = new Date(dateLike || Date.now());
  const iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  return iso.replaceAll("-", "").replaceAll(":", "").replace(".", "");
}

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  ));
}

function summarizePatchDraftOperations(patchPlan) {
  const drafts = Array.isArray(patchPlan?.patchDrafts) ? patchPlan.patchDrafts : [];
  const operationMap = new Map();

  drafts.forEach((draft) => {
    const operation = String(draft?.operation || "insert").trim().toLowerCase() || "insert";
    if (!operationMap.has(operation)) {
      operationMap.set(operation, {
        count: 0,
        files: new Set(),
      });
    }
    const entry = operationMap.get(operation);
    entry.count += 1;
    const file = String(draft?.file || "").trim();
    if (file) {
      entry.files.add(file);
    }
  });

  return Array.from(operationMap.entries())
    .map(([operation, data]) => ({
      operation,
      count: data.count,
      files: Array.from(data.files).slice(0, 5),
      fileCount: data.files.size,
    }))
    .sort((a, b) => b.count - a.count || a.operation.localeCompare(b.operation));
}

function summarizePatchResultReasons(patchApplication) {
  const reasonMap = new Map();
  const results = Array.isArray(patchApplication?.results) ? patchApplication.results : [];
  results.forEach((item) => {
    const reason = String(item?.reason || "").trim();
    if (!reason) {
      return;
    }
    if (!reasonMap.has(reason)) {
      reasonMap.set(reason, {
        count: 0,
        files: new Set(),
      });
    }
    const entry = reasonMap.get(reason);
    entry.count += 1;
    const file = String(item?.file || "").trim();
    if (file) {
      entry.files.add(file);
    }
  });

  return Array.from(reasonMap.entries())
    .map(([reason, data]) => ({
      reason,
      count: data.count,
      files: Array.from(data.files).slice(0, 5),
      fileCount: data.files.size,
    }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function summarizeVerificationUnsatisfiedChecks(verificationContract, { required = true } = {}) {
  const checks = Array.isArray(verificationContract?.checks) ? verificationContract.checks : [];
  return checks
    .filter((check) => (
      required
        ? (check?.required !== false && check?.satisfied !== true)
        : (check?.required === false && check?.satisfied !== true)
    ))
    .map((check) => ({
      id: check?.id || null,
      label: check?.label || check?.id || "unknown",
      kind: check?.kind || null,
      required: check?.required !== false,
      satisfied: check?.satisfied === true,
      detail: check?.detail || null,
      field: check?.field || null,
      operator: check?.operator || null,
      expected: Object.prototype.hasOwnProperty.call(check || {}, "expected") ? check.expected : null,
      actual: Object.prototype.hasOwnProperty.call(check || {}, "actual") ? check.actual : null,
    }))
    .slice(0, 8);
}

async function writePatchArchive(summary, latestReport) {
  const runId = createArchiveRunId(summary.generatedAt);
  const entryPath = path.join(zoteroArtifacts.historyDir, `${runId}.json`);
  const latestSummary = summarizeE2EReport(latestReport);
  const runtimeContext = {
    contextObserved: latestSummary.contextObserved === true,
    zoteroVersion: latestSummary.zoteroVersion || "unknown",
    zoteroVersionBucket: latestSummary.zoteroVersionBucket || "unknown",
    latestBootMode: latestSummary.latestBootMode || "unknown",
    bootModes: Array.isArray(latestSummary.bootModes) && latestSummary.bootModes.length > 0
      ? latestSummary.bootModes
      : ["unknown"],
  };
  const verificationContractBase = evaluatePatchVerificationContract({
    patchPlan: summary.patchPlan,
    patchApplication: summary.patchApplication,
    latestReport,
    recovered: summary.recovered,
  });
  const verificationContract = {
    ...verificationContractBase,
    failedChecks: summarizeVerificationUnsatisfiedChecks(verificationContractBase, { required: true }),
    optionalFailedChecks: summarizeVerificationUnsatisfiedChecks(verificationContractBase, { required: false }),
    ...summarizeVerificationContractStats(verificationContractBase),
  };
  const patchDraftOperations = summarizePatchDraftOperations(summary.patchPlan);
  const patchApplicationReasonSummary = summarizePatchResultReasons(summary.patchApplication);
  const sourceDiagnosis = latestReport?.primaryDiagnosis && typeof latestReport.primaryDiagnosis === "object"
    ? {
      fingerprint: normalizeDiagnosisFingerprint(latestReport.primaryDiagnosis.fingerprint) || null,
      feature: latestReport.primaryDiagnosis.feature || null,
      featureLabel: latestReport.primaryDiagnosis.featureLabel || latestReport.primaryDiagnosis.feature || null,
      summary: latestReport.primaryDiagnosis.summary || latestReport.primaryDiagnosis.issue || null,
      issue: latestReport.primaryDiagnosis.issue || null,
      candidateFiles: Array.isArray(latestReport.primaryDiagnosis.candidateFiles)
        ? latestReport.primaryDiagnosis.candidateFiles.slice(0, 8)
        : [],
    }
    : null;
  const archiveEntry = {
    schemaVersion: 3,
    runId,
    generatedAt: summary.generatedAt,
    initialStrategy: summary.initialStrategy,
    applyWhitelistedPatch: summary.applyWhitelistedPatch,
    recovered: summary.recovered,
    outcomeLabel: summary.outcomeLabel,
    runtimeContext,
    sourceDiagnosis,
    patch: {
      planStatus: summary.patchPlan?.status || "missing",
      planStatusLabel: summary.patchPlan?.statusLabel || "缺失",
      planMode: summary.patchPlan?.mode || "none",
      whitelistRuleId: summary.patchPlan?.whitelistRuleId || null,
      fingerprint: summary.patchPlan?.fingerprint || null,
      featureLabel: summary.patchPlan?.featureLabel || summary.patchPlan?.feature || null,
      issue: summary.patchPlan?.issue || null,
      rationale: summary.patchPlan?.rationale || null,
      unsupportedDiagnosisCategory: summary.patchPlan?.unsupportedDiagnosisCategory || null,
      unsupportedDiagnosisCategoryLabel: summary.patchPlan?.unsupportedDiagnosisCategoryLabel || null,
      unsupportedDiagnosisReason: summary.patchPlan?.unsupportedDiagnosisReason || null,
      draftCount: Array.isArray(summary.patchPlan?.patchDrafts) ? summary.patchPlan.patchDrafts.length : 0,
      draftOperations: patchDraftOperations,
      draftFiles: uniqueStrings((summary.patchPlan?.patchDrafts || []).map((draft) => draft?.file)).slice(0, 8),
      candidateFiles: Array.isArray(summary.patchPlan?.candidateFiles) ? summary.patchPlan.candidateFiles.slice(0, 8) : [],
      allowedTargets: Array.isArray(summary.patchPlan?.allowedTargets) ? summary.patchPlan.allowedTargets : [],
      proposedEdits: Array.isArray(summary.patchPlan?.proposedEdits) ? summary.patchPlan.proposedEdits.slice(0, 8) : [],
      guardrails: Array.isArray(summary.patchPlan?.guardrails) ? summary.patchPlan.guardrails.slice(0, 8) : [],
      applicationAttempted: summary.patchApplication?.attempted === true,
      applicationOK: summary.patchApplication?.ok === true,
      applicationStatus: summary.patchApplication?.status || "not-attempted",
      appliedFiles: Array.isArray(summary.patchApplication?.appliedFiles) ? summary.patchApplication.appliedFiles : [],
      resultReasonSummary: patchApplicationReasonSummary,
    },
    verificationContract,
    reportRefs: {
      autofixJSON: toArtifactRelativePath(zoteroArtifacts.reportJSON),
      autofixMD: toArtifactRelativePath(zoteroArtifacts.reportMD),
      e2eJSON: toArtifactRelativePath(zoteroArtifacts.e2eReportJSON),
      e2eMD: toArtifactRelativePath(zoteroArtifacts.e2eReportMD),
    },
    attempts: (Array.isArray(summary.attempts) ? summary.attempts : []).map((attempt) => ({
      index: attempt?.index ?? null,
      kind: attempt?.kind || null,
      label: attempt?.label || null,
      ok: attempt?.ok === true,
      exitCode: attempt?.exitCode ?? null,
      durationMs: Math.max(0, Number(attempt?.durationMs || 0)),
      note: attempt?.note || null,
    })),
    recommendations: Array.isArray(summary.recommendations) ? summary.recommendations : [],
  };

  await fs.mkdir(zoteroArtifacts.historyDir, { recursive: true });
  await fs.writeFile(entryPath, `${JSON.stringify(archiveEntry, null, 2)}\n`, "utf-8");
  await fs.writeFile(zoteroArtifacts.historyLatestJSON, `${JSON.stringify(archiveEntry, null, 2)}\n`, "utf-8");

  return {
    present: true,
    runId,
    historyDir: toArtifactRelativePath(zoteroArtifacts.historyDir),
    entryJSON: toArtifactRelativePath(entryPath),
    latestJSON: toArtifactRelativePath(zoteroArtifacts.historyLatestJSON),
    sourceDiagnosis,
    patch: archiveEntry.patch,
    verificationContract,
    runtimeContext,
  };
}

async function readJSON(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

async function runCommand(command, args, label) {
  const startedAt = new Date();
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  const finishedAt = new Date();
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

  return {
    label,
    exitCode,
    ok: exitCode === 0,
    startedAtISO: startedAt.toISOString(),
    finishedAtISO: finishedAt.toISOString(),
    durationMs,
  };
}

async function runE2E(options, label) {
  const args = [
    path.join(projectRoot, "scripts", "agent-zotero-e2e.mjs"),
    "--cycles",
    String(options.cycles),
    "--strategy",
    options.strategy,
  ];
  if (options.fresh) {
    args.push("--fresh");
  }

  const result = await runCommand(getNodeCommand(), args, label);
  const report = await readJSON(getE2EReportPath());
  return {
    ...result,
    report,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const attempts = [];

  const initial = await runE2E(
    {
      cycles: options.cycles,
      strategy: options.strategy,
      fresh: false,
    },
    "初始 Zotero E2E 验证",
  );
  attempts.push({
    index: attempts.length + 1,
    kind: "e2e",
    label: initial.label,
    exitCode: initial.exitCode,
    ok: initial.ok,
    startedAtISO: initial.startedAtISO,
    finishedAtISO: initial.finishedAtISO,
    durationMs: initial.durationMs,
    note: initial.ok ? "初始验证通过" : "初始验证失败，进入恢复流程",
  });

  let latestReport = initial.report;
  let recovered = Boolean(initial.ok && latestReport?.passed);
  let patchPlan = derivePatchPlan(latestReport);
  let patchApplication = {
    attempted: false,
    ok: false,
    status: "not-attempted",
    appliedFiles: [],
    results: [],
  };

  if (!recovered) {
    if (options.applyWhitelistedPatch && patchPlan.status === "review-ready") {
      const startedAt = new Date();
      patchApplication = await applyPatchPlan(projectRoot, patchPlan);
      const finishedAt = new Date();
      const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
      attempts.push({
        index: attempts.length + 1,
        kind: "patch",
        label: "应用白名单补丁草案",
        exitCode: patchApplication.ok ? 0 : 1,
        ok: patchApplication.ok,
        startedAtISO: startedAt.toISOString(),
        finishedAtISO: finishedAt.toISOString(),
        durationMs,
        note: patchApplication.attempted
          ? (patchApplication.appliedFiles.length > 0
            ? `已应用 ${patchApplication.appliedFiles.length} 个目标文件的补丁草案`
            : "补丁草案未实际写入，可能是目标已存在或锚点未命中")
          : "当前补丁计划不可执行，跳过自动应用",
      });
      if (patchApplication.ok && patchApplication.appliedFiles.length > 0) {
        const postApplyVerification = patchPlan?.postApplyVerification && typeof patchPlan.postApplyVerification === "object"
          ? patchPlan.postApplyVerification
          : null;
        const patchVerify = await runE2E(
          {
            cycles: options.cycles,
            strategy: postApplyVerification?.strategy || "restart",
            fresh: postApplyVerification?.fresh === true,
          },
          postApplyVerification?.label || "应用白名单补丁后重新验证",
        );
        latestReport = patchVerify.report;
        attempts.push({
          index: attempts.length + 1,
          kind: "e2e",
          label: patchVerify.label,
          exitCode: patchVerify.exitCode,
          ok: patchVerify.ok && Boolean(latestReport?.passed),
          startedAtISO: patchVerify.startedAtISO,
          finishedAtISO: patchVerify.finishedAtISO,
          durationMs: patchVerify.durationMs,
          note: "对白名单补丁草案进行重启复验",
        });
        recovered = Boolean(patchVerify.ok && latestReport?.passed);
      }
      patchPlan = derivePatchPlan(latestReport);
    }

    const steps = deriveRecoverySteps(latestReport, {
      cycles: options.cycles,
    }).slice(0, options.maxAttempts);

    for (const step of steps) {
      if (recovered) {
        break;
      }
      if (step.kind === "command") {
        const command = step.command[0] === "npm" ? getNpmCommand() : step.command[0];
        const result = await runCommand(command, step.command.slice(1), step.label);
        attempts.push({
          index: attempts.length + 1,
          kind: step.kind,
          label: step.label,
          exitCode: result.exitCode,
          ok: result.ok,
          startedAtISO: result.startedAtISO,
          finishedAtISO: result.finishedAtISO,
          durationMs: result.durationMs,
          note: step.reason,
        });
        continue;
      }

      const result = await runE2E(
        {
          cycles: options.cycles,
          strategy: step.args.includes("restart") ? "restart" : "hot",
          fresh: step.args.includes("--fresh"),
        },
        step.label,
      );
      latestReport = result.report;
      attempts.push({
        index: attempts.length + 1,
        kind: step.kind,
        label: step.label,
        exitCode: result.exitCode,
        ok: result.ok && Boolean(latestReport?.passed),
        startedAtISO: result.startedAtISO,
        finishedAtISO: result.finishedAtISO,
        durationMs: result.durationMs,
        note: step.reason,
      });
      if (result.ok && latestReport?.passed) {
        recovered = true;
        break;
      }
    }
  }

  const latestSummary = summarizeE2EReport(latestReport);
  const summary = {
    generatedAt: new Date().toISOString(),
    initialStrategy: options.strategy,
    maxAttempts: options.maxAttempts,
    applyWhitelistedPatch: options.applyWhitelistedPatch,
    recovered,
    outcomeLabel: initial.ok && initial.report?.passed
      ? "无需恢复"
      : (recovered ? "已恢复" : "未恢复"),
    runtimeContext: {
      contextObserved: latestSummary.contextObserved === true,
      zoteroVersion: latestSummary.zoteroVersion || "unknown",
      zoteroVersionBucket: latestSummary.zoteroVersionBucket || "unknown",
      latestBootMode: latestSummary.latestBootMode || "unknown",
      bootModes: Array.isArray(latestSummary.bootModes) && latestSummary.bootModes.length > 0
        ? latestSummary.bootModes
        : ["unknown"],
    },
    attempts,
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
    totalDurationMs: attempts.reduce((sum, attempt) => sum + Number(attempt?.durationMs || 0), 0),
    finalReportPath: getE2EReportPath(),
    patchPlan,
    patchApplication,
    recommendations: initial.ok && initial.report?.passed
      ? ["初始验证已通过，无需触发恢复步骤。"]
      : (recovered
        ? ["闭环已恢复，可继续进入真实功能开发与回归。"]
        : [
          `请先查看 \`${path.relative(projectRoot, zoteroArtifacts.e2eReportJSON)}\` 与 \`${path.relative(projectRoot, zoteroArtifacts.e2eReportMD)}\` 的最新失败轮次。`,
          "若问题集中在运行时挂载，优先使用 `restart + fresh` 策略复验。",
          "若问题集中在测试失败，优先检查 `zotero-tests/*.test.js` 对应断言与实际功能是否一致。",
        ]),
  };
  if (summary.patchPlan?.status === "review-ready") {
    summary.recommendations.push("当前已生成受限补丁计划，请先审阅白名单范围和补丁护栏，再决定是否进入自动改码。");
  }
  if (summary.patchApplication?.attempted) {
    if (summary.patchApplication.ok && summary.patchApplication.appliedFiles.length > 0) {
      summary.recommendations.push("白名单补丁草案已应用，请重点查看最新 E2E 复验是否已经消除对应主诊断。");
    } else {
      summary.recommendations.push("补丁草案应用未完全成功，请优先检查锚点是否漂移，再决定是否人工调整补丁。");
    }
  }
  summary.patchArchive = await writePatchArchive(summary, latestReport);
  if (!summary.recovered) {
    Object.assign(
      summary,
      buildScriptFailureInfo(
        createScriptError(
          "validation",
          summary.recommendations?.[0] || summary.outcomeLabel || "Autofix unrecovered",
          { failedStage: "validation-summary" },
        ),
        { durationMs: summary.durationMs },
      ),
    );
  } else {
    summary.errorCategory = null;
    summary.errorCategoryLabel = null;
    summary.errorMessage = null;
    summary.failedStage = null;
  }

  await fs.mkdir(zoteroArtifacts.artifactsDir, { recursive: true });
  await writeJSONArtifact(zoteroArtifacts.reportJSON, summary);
  await fs.writeFile(zoteroArtifacts.reportMD, `${buildAutofixMarkdown(summary)}\n`, "utf-8");

  console.log(`Agent Zotero auto-fix report generated: ${zoteroArtifacts.reportJSON}`);
  if (!recovered) {
    process.exit(2);
  }
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  const failureReport = {
    generatedAt: new Date().toISOString(),
    initialStrategy: null,
    maxAttempts: 0,
    applyWhitelistedPatch: false,
    recovered: false,
    outcomeLabel: "异常失败",
    attempts: [],
    durationMs: failureInfo.durationMs,
    totalDurationMs: 0,
    patchPlan: null,
    patchApplication: null,
    patchArchive: null,
    recommendations: [failureInfo.errorMessage],
    ...failureInfo,
  };
  try {
    await fs.mkdir(zoteroArtifacts.artifactsDir, { recursive: true });
    await writeJSONArtifact(zoteroArtifacts.reportJSON, failureReport);
    await fs.writeFile(zoteroArtifacts.reportMD, `${buildAutofixMarkdown(failureReport)}\n`, "utf-8");
  } catch {
    // ignore secondary failure
  }
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
