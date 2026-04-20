import { spawn, execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  normalizeManualScorecardRating,
  PACKAGE_PROTECTION_SMOKE_VARIANTS,
  resolvePackageProtectionSmokePackageArgs,
  withPackageProtectionWorkflowLock,
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

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_OPENCODE_BIN = "opencode";

const STATUS_LABELS = Object.freeze({
  passed: "通过",
  attention: "关注",
  failed: "失败",
});

function normalizeVariant(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "descriptor-bind") {
    return "shielded-descriptor-bind";
  }
  if (normalized === "jsconfuser-string" || normalized === "jsconfuser:string") {
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
  if (normalized === "surface-scrub-wasm-stage2-derive" || normalized === "wasm-stage2-derive") {
    return "shielded-surface-scrub-wasm-stage2-derive";
  }
  if (normalized === "surface-scrub-wasm-entitlement-legacy" || normalized === "wasm-entitlement-legacy") {
    return "shielded-surface-scrub-wasm-entitlement-legacy";
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

function normalizePositiveInteger(value, fallback = 0) {
  const numeric = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(numeric) && numeric > 0
    ? numeric
    : fallback;
}

function normalizeNonEmptyString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeNonEmptyString(item)).filter(Boolean)
    : [];
}

function normalizeSuggestedLLMRating(value) {
  const direct = normalizeManualScorecardRating(value);
  if (direct) {
    return direct;
  }

  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/gu, "-")
    .replace(/-+\/-+/gu, "/");

  if (
    normalized === "parse-fail"
    || normalized === "only-loader"
    || normalized === "loader-only"
    || normalized === "parse-fail/only-loader"
    || normalized === "parse-fail/loader-only"
    || normalized === "parse-fail/-/only-loader"
  ) {
    return "parse-fail / only-loader";
  }
  if (
    normalized === "high-level-architecture"
    || normalized === "high-level"
    || normalized === "architecture"
  ) {
    return "high-level-architecture";
  }
  if (
    normalized === "readable-module-recovery"
    || normalized === "readable-module"
    || normalized === "module-recovery"
  ) {
    return "readable-module-recovery";
  }
  return null;
}

function inferReportStatus(rating) {
  if (rating === "parse-fail / only-loader") {
    return "passed";
  }
  if (rating === "high-level-architecture" || rating === "readable-module-recovery") {
    return "attention";
  }
  return "failed";
}

function normalizeAnalysisStatus(value, rating) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "passed" || normalized === "attention" || normalized === "failed") {
    return normalized;
  }
  return inferReportStatus(rating);
}

function summarizeSuggestedRating(rating) {
  if (rating === "parse-fail / only-loader") {
    return "opencode 单轮静态分析仍停在 loader 层。";
  }
  if (rating === "high-level-architecture") {
    return "opencode 单轮静态分析已经能归纳高层架构。";
  }
  if (rating === "readable-module-recovery") {
    return "opencode 单轮静态分析已经达到可读模块恢复。";
  }
  return "opencode 单轮静态分析未返回可用评级。";
}

function parseJSONCandidate(rawText) {
  const source = String(rawText || "").trim();
  if (!source) {
    return null;
  }

  try {
    return JSON.parse(source);
  } catch {
    // fall through
  }

  const codeFenceMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (codeFenceMatch?.[1]) {
    try {
      return JSON.parse(codeFenceMatch[1].trim());
    } catch {
      // fall through
    }
  }

  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(source.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeAnalysisPayload(payload = {}) {
  const rating = normalizeSuggestedLLMRating(payload?.rating);
  assertScript(Boolean(rating), "opencode output must include a valid rating", {
    category: "validation",
    failedStage: "normalize-opencode-output",
    details: {
      receivedRating: payload?.rating ?? null,
    },
  });

  const status = normalizeAnalysisStatus(payload?.status, rating);
  const summary = normalizeNonEmptyString(payload?.summary) || summarizeSuggestedRating(rating);
  const nextAction = normalizeNonEmptyString(payload?.next_action)
    || (status === "failed" ? "fix-opencode-output-contract" : "record-suggested-llm-rating");

  return {
    status,
    statusLabel: STATUS_LABELS[status] || STATUS_LABELS.attention,
    ownerRole: normalizeNonEmptyString(payload?.owner_role) || "opencode-static-analysis",
    rating,
    summary,
    changedFiles: normalizeStringList(payload?.changed_files),
    checksRun: normalizeStringList(payload?.checks_run),
    risks: normalizeStringList(payload?.risks),
    blockers: normalizeStringList(payload?.blockers),
    nextAction,
    raw: payload,
  };
}

function normalizeRelativePath(value) {
  return String(value || "").split(path.sep).join("/");
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readAddonConfig(projectRootPath) {
  return readJSONFile(path.join(projectRootPath, "config", "addon.config.json"), {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-addon-config",
    label: "config/addon.config.json",
  });
}

function resolvePackageVariantOutputName(config, variant) {
  return variant === "plain"
    ? `${config.addonRef}-${config.addonVersion}.xpi`
    : `${config.addonRef}-${config.addonVersion}-${variant}.xpi`;
}

function packageVariant(projectRootPath, variant, env = process.env) {
  execFileSync(process.execPath, [
    "scripts/package.mjs",
    ...resolvePackageProtectionSmokePackageArgs(variant, {
      jsConfuserToolPath: env.CLEANROOM_PACKAGE_JSCONFUSER_TOOL_PATH,
      jsConfuserToolEntry: env.CLEANROOM_PACKAGE_JSCONFUSER_TOOL_ENTRY,
    }),
  ], {
    cwd: projectRootPath,
    stdio: "inherit",
    env,
  });
}

async function readVariantArtifacts(projectRootPath, variant) {
  const config = await readAddonConfig(projectRootPath);
  const buildRoot = path.join(projectRootPath, "build", config.addonRef);
  const xpiPath = path.join(projectRootPath, "dist", resolvePackageVariantOutputName(config, variant));
  const bundlePath = path.join(buildRoot, "content", "scripts", `${config.addonRef}.js`);
  const manifestPath = path.join(buildRoot, "manifest.json");
  const bootstrapPath = path.join(buildRoot, "bootstrap.js");
  const wasmDir = path.join(buildRoot, "content", "lib", "w");

  const [xpiStats, bundleStats, manifestPresent, bootstrapPresent, wasmPresent] = await Promise.all([
    fs.stat(xpiPath),
    fs.stat(bundlePath),
    pathExists(manifestPath),
    pathExists(bootstrapPath),
    pathExists(wasmDir),
  ]);

  return {
    config,
    buildRoot,
    xpi: {
      path: xpiPath,
      relativePath: normalizeRelativePath(path.relative(projectRootPath, xpiPath)),
      sizeBytes: Number(xpiStats.size || 0),
    },
    bundle: {
      path: bundlePath,
      relativePath: normalizeRelativePath(path.relative(projectRootPath, bundlePath)),
      sizeBytes: Number(bundleStats.size || 0),
    },
    manifestPath: manifestPresent ? manifestPath : null,
    bootstrapPath: bootstrapPresent ? bootstrapPath : null,
    wasmDir: wasmPresent ? wasmDir : null,
  };
}

function buildOpencodePrompt({
  variant,
  channel,
  artifacts,
}) {
  const lines = [
    "你现在做的是只读静态分析。",
    "不要修改任何文件，不要执行任何解密后的 payload，不要运行构建、测试、打包、Zotero 或额外脚本。",
    "只允许基于现有文件做结构归纳和可读性分级。",
    "",
    `分析目标变体: ${variant}`,
    `分析目标渠道: ${channel}`,
    "当前工作目录就是解包后的受保护 build root。",
    `main script: ${normalizeRelativePath(path.relative(artifacts.buildRoot, artifacts.bundle.path))}`,
  ];

  if (artifacts.manifestPath) {
    lines.push(`manifest: ${normalizeRelativePath(path.relative(artifacts.buildRoot, artifacts.manifestPath))}`);
  }
  if (artifacts.bootstrapPath) {
    lines.push(`bootstrap: ${normalizeRelativePath(path.relative(artifacts.buildRoot, artifacts.bootstrapPath))}`);
  }
  if (artifacts.wasmDir) {
    lines.push(`optional wasm assets: ${normalizeRelativePath(path.relative(artifacts.buildRoot, artifacts.wasmDir))}`);
  }

  lines.push(
    "",
    "评级规则只能使用以下三档：",
    "- parse-fail / only-loader: 只能解释 loader、解密壳或启动器，无法稳定归纳真实业务高层架构。",
    "- high-level-architecture: 能归纳启动链、宿主集成面、模块职责或 capability 边界，但不能恢复可读模块主体。",
    "- readable-module-recovery: 已能恢复主要模块主体或关键流程，接近可维护源码阅读。",
    "",
    "输出要求：",
    "- 最终只输出一个 JSON 对象。",
    "- 不要输出 Markdown 代码块。",
    "- changed_files 固定返回空数组。",
    "",
    "JSON 字段固定为：",
    "{",
    '  "status": "passed|attention|failed",',
    '  "owner_role": "opencode-static-analysis",',
    '  "rating": "parse-fail / only-loader|high-level-architecture|readable-module-recovery",',
    '  "summary": "一句话总结当前单轮静态分析能恢复到什么层级",',
    '  "changed_files": [],',
    '  "checks_run": ["列出做过的静态检查"],',
    '  "risks": ["列出当前可见风险或暴露面"],',
    '  "blockers": ["如果没有就返回空数组"],',
    '  "next_action": "建议的下一步动作"',
    "}",
  );

  return lines.join("\n");
}

function parseOpencodeJSONStream(stdout = "") {
  const lines = String(stdout || "")
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter(Boolean);

  const events = [];
  const textParts = [];
  let sessionID = null;
  let stepStartCount = 0;
  let stepFinishCount = 0;

  for (const line of lines) {
    let event = null;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    events.push(event);
    if (typeof event?.sessionID === "string" && event.sessionID.trim()) {
      sessionID = event.sessionID.trim();
    }
    if (event?.type === "step_start") {
      stepStartCount += 1;
    }
    if (event?.type === "step_finish") {
      stepFinishCount += 1;
    }
    if (event?.type === "text" && typeof event?.part?.text === "string") {
      textParts.push(event.part.text);
    }
  }

  return {
    lineCount: lines.length,
    eventCount: events.length,
    textEventCount: textParts.length,
    stepStartCount,
    stepFinishCount,
    sessionID,
    textOutput: textParts.join("\n").trim(),
    events,
  };
}

async function runOpencodeAnalysis(options = {}) {
  const {
    projectRootPath,
    analysisRootPath,
    opencodeBin,
    model,
    agent,
    timeoutMs,
    prompt,
  } = options;

  const opencodeArgs = [
    "run",
    "--pure",
    "--dir",
    analysisRootPath,
    "--format",
    "json",
  ];

  if (model) {
    opencodeArgs.push("--model", model);
  }
  if (agent) {
    opencodeArgs.push("--agent", agent);
  }

  opencodeArgs.push(prompt);

  const runtimeRoot = resolveAgentArtifactPath(projectRootPath, "package-protection-opencode-runtime");
  const stateHome = path.join(runtimeRoot, "state");
  const dataHome = path.join(runtimeRoot, "data");
  const cacheHome = path.join(runtimeRoot, "cache");
  await Promise.all([
    fs.mkdir(stateHome, { recursive: true }),
    fs.mkdir(dataHome, { recursive: true }),
    fs.mkdir(cacheHome, { recursive: true }),
  ]);

  return await new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn("script", [
      "-q",
      "/dev/null",
      opencodeBin,
      ...opencodeArgs,
    ], {
      cwd: analysisRootPath,
      env: {
        ...process.env,
        XDG_STATE_HOME: stateHome,
        XDG_DATA_HOME: dataHome,
        XDG_CACHE_HOME: cacheHome,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr?.on("data", (chunk) => {
      stderrChunks.push(Buffer.from(chunk));
    });
    child.on("error", (error) => {
      clearTimeout(timeoutHandle);
        reject(createScriptError("execution", `Failed to start opencode: ${error?.message || error}`, {
          failedStage: "spawn-opencode",
          details: {
            opencodeBin,
            runner: "script",
          },
          cause: error,
        }));
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeoutHandle);
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      if (timedOut) {
        reject(createScriptError("timeout", `opencode analysis timed out after ${timeoutMs}ms`, {
          failedStage: "run-opencode",
          details: {
            timeoutMs,
            exitCode,
            signal,
          },
        }));
        return;
      }
      if (exitCode !== 0) {
        reject(createScriptError("execution", "opencode analysis failed", {
          failedStage: "run-opencode",
          details: {
            exitCode,
            signal,
            stderr: String(stderr || "").trim() || null,
          },
        }));
        return;
      }
      resolve({
        durationMs: Math.max(0, Date.now() - startedAt),
        exitCode: Number(exitCode || 0),
        signal: signal || null,
        stdout,
        stderr,
      });
    });
  });
}

function summarizePackageProtectionOpencodeReport({
  variant,
  channel,
  artifacts,
  opencodeRuntime,
  analysis,
  packageFirst,
  model,
  agent,
  opencodeBin,
}) {
  const status = analysis.status;
  const suggestedLLMRating = analysis.rating;
  const summary = `${summarizeSuggestedRating(suggestedLLMRating)} ${analysis.summary}`.trim();

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    variant,
    channel,
    status,
    statusLabel: STATUS_LABELS[status] || STATUS_LABELS.attention,
    summary,
    nextAction: analysis.nextAction,
    suggestedLLMRating,
    packageFirst,
    xpi: artifacts.xpi,
    bundle: artifacts.bundle,
    buildRoot: artifacts.buildRoot,
    manifestPath: artifacts.manifestPath,
    bootstrapPath: artifacts.bootstrapPath,
    wasmDir: artifacts.wasmDir,
    opencode: {
      bin: opencodeBin,
      model: model || null,
      agent: agent || null,
      durationMs: opencodeRuntime.durationMs,
      exitCode: opencodeRuntime.exitCode,
      signal: opencodeRuntime.signal,
      stderr: String(opencodeRuntime.stderr || "").trim() || null,
      sessionID: opencodeRuntime.stream.sessionID,
      lineCount: opencodeRuntime.stream.lineCount,
      eventCount: opencodeRuntime.stream.eventCount,
      textEventCount: opencodeRuntime.stream.textEventCount,
      stepStartCount: opencodeRuntime.stream.stepStartCount,
      stepFinishCount: opencodeRuntime.stream.stepFinishCount,
    },
    analysis: {
      status: analysis.status,
      statusLabel: analysis.statusLabel,
      ownerRole: analysis.ownerRole,
      rating: analysis.rating,
      summary: analysis.summary,
      changedFiles: analysis.changedFiles,
      checksRun: analysis.checksRun,
      risks: analysis.risks,
      blockers: analysis.blockers,
      nextAction: analysis.nextAction,
    },
    rawOutputText: opencodeRuntime.stream.textOutput,
  };
}

function renderPackageProtectionOpencodeMarkdown(report = {}) {
  const lines = [
    "# Package Protection Opencode Analysis",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- 变体: \`${report.variant || "-"}\``,
    `- 渠道: \`${report.channel || "-"}\``,
    `- 状态: \`${report.statusLabel || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- 建议 LLM 评级: \`${report.suggestedLLMRating || "-"}\``,
    `- 摘要: ${report.summary || "-"}`,
    `- 下一步: \`${report.nextAction || "-"}\``,
    "",
    "## Inputs",
    "",
    `- packageFirst: \`${report.packageFirst ? "yes" : "no"}\``,
    `- XPI: \`${report.xpi?.path || "-"}\``,
    `- Bundle: \`${report.bundle?.path || "-"}\``,
    `- build root: \`${report.buildRoot || "-"}\``,
    `- manifest: \`${report.manifestPath || "-"}\``,
    `- bootstrap: \`${report.bootstrapPath || "-"}\``,
    `- wasm dir: \`${report.wasmDir || "-"}\``,
    "",
    "## Opencode",
    "",
    `- bin: \`${report.opencode?.bin || "-"}\``,
    `- model: \`${report.opencode?.model || "-"}\``,
    `- agent: \`${report.opencode?.agent || "-"}\``,
    `- duration: \`${report.opencode?.durationMs ?? 0}ms\``,
    `- sessionID: \`${report.opencode?.sessionID || "-"}\``,
    `- lineCount: \`${report.opencode?.lineCount ?? 0}\``,
    `- eventCount: \`${report.opencode?.eventCount ?? 0}\``,
    `- textEventCount: \`${report.opencode?.textEventCount ?? 0}\``,
    `- stderr: \`${report.opencode?.stderr || "-"}\``,
    "",
    "## Analysis",
    "",
    `- owner_role: \`${report.analysis?.ownerRole || "-"}\``,
    `- rating: \`${report.analysis?.rating || "-"}\``,
    `- summary: ${report.analysis?.summary || "-"}`,
    `- changed_files: \`${JSON.stringify(report.analysis?.changedFiles || [])}\``,
    "",
    "## Checks",
    "",
  ];

  const checksRun = Array.isArray(report.analysis?.checksRun) ? report.analysis.checksRun : [];
  if (checksRun.length > 0) {
    checksRun.forEach((item) => {
      lines.push(`- ${item}`);
    });
  } else {
    lines.push("- -");
  }

  lines.push("", "## Risks", "");
  const risks = Array.isArray(report.analysis?.risks) ? report.analysis.risks : [];
  if (risks.length > 0) {
    risks.forEach((item) => {
      lines.push(`- ${item}`);
    });
  } else {
    lines.push("- -");
  }

  lines.push("", "## Blockers", "");
  const blockers = Array.isArray(report.analysis?.blockers) ? report.analysis.blockers : [];
  if (blockers.length > 0) {
    blockers.forEach((item) => {
      lines.push(`- ${item}`);
    });
  } else {
    lines.push("- -");
  }

  return lines.join("\n");
}

async function persistPackageProtectionOpencodeReport(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const archiveDir = resolveAgentArtifactPath(projectRootPath, "package-protection-opencode");
  const reportPath = path.join(archiveDir, `${report.variant}-${report.channel}.json`);
  const reportMDPath = path.join(archiveDir, `${report.variant}-${report.channel}.md`);

  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await fs.mkdir(archiveDir, { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionOpencodeMarkdown(report)}\n`, "utf-8"),
  ]);

  return {
    reportPath,
    reportMDPath,
  };
}

export function parsePackageProtectionOpencodeArgs(argv = process.argv.slice(2)) {
  const options = {
    projectRootPath: projectRoot,
    variant: null,
    channel: null,
    model: null,
    agent: null,
    opencodeBin: DEFAULT_OPENCODE_BIN,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    packageFirst: true,
    jsConfuserToolPath: null,
    jsConfuserToolEntry: null,
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
      case "--variant":
        options.variant = normalizeVariant(argv[index + 1]);
        index += 1;
        break;
      case "--channel":
        options.channel = normalizeChannel(argv[index + 1]);
        index += 1;
        break;
      case "--model":
        options.model = normalizeNonEmptyString(argv[index + 1]);
        index += 1;
        break;
      case "--agent":
        options.agent = normalizeNonEmptyString(argv[index + 1]);
        index += 1;
        break;
      case "--opencode-bin":
        options.opencodeBin = normalizeNonEmptyString(argv[index + 1]) || DEFAULT_OPENCODE_BIN;
        index += 1;
        break;
      case "--timeout-ms":
        options.timeoutMs = normalizePositiveInteger(argv[index + 1], 0);
        index += 1;
        break;
      case "--jsconfuser-tool-path":
        options.jsConfuserToolPath = normalizeNonEmptyString(argv[index + 1]);
        index += 1;
        break;
      case "--jsconfuser-tool-entry":
        options.jsConfuserToolEntry = normalizeNonEmptyString(argv[index + 1]);
        index += 1;
        break;
      case "--no-package":
        options.packageFirst = false;
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

  assertScript(Boolean(options.variant), "--variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest|shielded-surface-scrub-wasm-stage2-derive|shielded-surface-scrub-wasm-entitlement-legacy", {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.channel), "--channel must be stable or beta", {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(options.timeoutMs > 0, "--timeout-ms must be a positive integer", {
    category: "args",
    failedStage: "parse-args",
  });

  return options;
}

export async function runPackageProtectionOpencodeAnalysis(options = {}) {
  return await withPackageProtectionWorkflowLock("package-protection-opencode-analysis.mjs", async () => {
    const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
    const variant = normalizeVariant(options.variant);
    const channel = normalizeChannel(options.channel);
    const model = normalizeNonEmptyString(options.model);
    const agent = normalizeNonEmptyString(options.agent);
    const opencodeBin = normalizeNonEmptyString(options.opencodeBin) || DEFAULT_OPENCODE_BIN;
    const timeoutMs = normalizePositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    const packageFirst = options.packageFirst !== false;
    const jsConfuserToolPath = normalizeNonEmptyString(options.jsConfuserToolPath);
    const jsConfuserToolEntry = normalizeNonEmptyString(options.jsConfuserToolEntry);

    assertScript(Boolean(variant), "variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest|shielded-surface-scrub-wasm-stage2-derive|shielded-surface-scrub-wasm-entitlement-legacy", {
      category: "args",
      failedStage: "validate-options",
    });
    assertScript(Boolean(channel), "channel must be stable or beta", {
      category: "args",
      failedStage: "validate-options",
    });
    assertScript(timeoutMs > 0, "timeoutMs must be a positive integer", {
      category: "args",
      failedStage: "validate-options",
    });

    if (packageFirst) {
      const packageEnv = {
        ...process.env,
        ...(jsConfuserToolPath
          ? { CLEANROOM_PACKAGE_JSCONFUSER_TOOL_PATH: jsConfuserToolPath }
          : {}),
        ...(jsConfuserToolEntry
          ? { CLEANROOM_PACKAGE_JSCONFUSER_TOOL_ENTRY: jsConfuserToolEntry }
          : {}),
      };
      packageVariant(projectRootPath, variant, packageEnv);
    }

    const artifacts = await readVariantArtifacts(projectRootPath, variant);
    const prompt = buildOpencodePrompt({
      variant,
      channel,
      artifacts,
    });
    const runtime = await runOpencodeAnalysis({
      projectRootPath,
      analysisRootPath: artifacts.buildRoot,
      opencodeBin,
      model,
      agent,
      timeoutMs,
      prompt,
    });
    const stream = parseOpencodeJSONStream(runtime.stdout);
    const parsedPayload = parseJSONCandidate(stream.textOutput);

    assertScript(Boolean(parsedPayload), "opencode output did not contain a valid JSON object", {
      category: "validation",
      failedStage: "parse-opencode-output",
      details: {
        variant,
        channel,
        textOutputPreview: stream.textOutput.slice(0, 400) || null,
      },
    });

    const analysis = normalizeAnalysisPayload(parsedPayload);
    const report = summarizePackageProtectionOpencodeReport({
      variant,
      channel,
      artifacts,
      packageFirst,
      model,
      agent,
      opencodeBin,
      analysis,
      opencodeRuntime: {
        ...runtime,
        stream,
      },
    });
    const paths = await persistPackageProtectionOpencodeReport(report, {
      projectRootPath,
    });

    return {
      report,
      paths,
    };
  });
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionOpencodeArgs(argv);
  const { report, paths } = await runPackageProtectionOpencodeAnalysis(options);
  console.log(`Package protection opencode analysis generated: ${paths.reportPath}`);
  console.log(`Suggested LLM rating: ${report.suggestedLLMRating}`);
  console.log(`Status: ${report.statusLabel}`);
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
