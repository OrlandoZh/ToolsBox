import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withBuildLock } from "./build-lock.mjs";
import {
  BUILD_MODULE_ID_MODE_ANONYMIZED,
  BUILD_MODULE_ID_MODE_ENV,
  BUILD_SEMANTIC_SCRUB_ENV,
  BUILD_SEMANTIC_SCRUB_PROTECTED,
} from "./build.mjs";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  assertNonEmptyString,
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
  wrapScriptError,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();
const DEFAULT_REPORT_BASENAME = "package-protection-lightweight-preflight";
const KNOWN_COMPAT_PATCH = "object-property-key-skip";

function truncateOutput(value, maxChars = 1200) {
  const text = String(value || "");
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}\n...[truncated]`
    : text;
}

function computeGrowthRatio(inputBytes, outputBytes) {
  const input = Number(inputBytes || 0);
  const output = Number(outputBytes || 0);
  if (!(input > 0) || !(output > 0)) {
    return null;
  }
  return Number((output / input).toFixed(2));
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

export function buildAttemptStatus({
  succeeded = false,
  appliedCompatPatch = false,
  outputBytes = 0,
  inputBytes = 0,
  leakFree = true,
}) {
  if (!succeeded) {
    return "failed";
  }
  if (appliedCompatPatch) {
    return "attention";
  }
  if (leakFree === false) {
    return "attention";
  }
  const growthRatio = computeGrowthRatio(inputBytes, outputBytes);
  if (growthRatio !== null && growthRatio > 4) {
    return "attention";
  }
  return "passed";
}

export function parsePackageProtectionLightweightPreflightArgs(argv = process.argv.slice(2)) {
  const options = {
    toolPath: null,
    bundlePath: null,
    skipKnownCompatPatch: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--tool-path":
        options.toolPath = String(argv[index + 1] || "").trim() || null;
        index += 1;
        break;
      case "--bundle-path":
        options.bundlePath = String(argv[index + 1] || "").trim() || null;
        index += 1;
        break;
      case "--skip-known-compat-patch":
        options.skipKnownCompatPatch = true;
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

  assertScript(Boolean(options.toolPath), "--tool-path is required", {
    category: "args",
    failedStage: "parse-args",
  });

  return options;
}

export function detectLightweightHostileDefaults(sourceCode = "") {
  const source = String(sourceCode || "");
  return {
    selfDefending: /\bselfDefending\s*:\s*true\b/u.test(source),
    debugProtection: /\bdebugProtection\s*:\s*true\b/u.test(source),
    debugProtectionInterval: /\bdebugProtectionInterval\s*:\s*(\d+)/u.exec(source)?.[1]
      ? Number(/\bdebugProtectionInterval\s*:\s*(\d+)/u.exec(source)?.[1])
      : 0,
    disableConsoleOutput: /\bdisableConsoleOutput\s*:\s*true\b/u.test(source),
  };
}

export function buildLightweightCompatPatchedSource(sourceCode = "") {
  const source = String(sourceCode || "");
  if (!source.includes("if (!path.isStringLiteral()) return false;")) {
    return {
      patchedSource: source,
      applied: false,
      patchId: KNOWN_COMPAT_PATCH,
    };
  }

  const marker = "path.parentPath.isObjectProperty()";
  if (source.includes(marker)) {
    return {
      patchedSource: source,
      applied: false,
      patchId: KNOWN_COMPAT_PATCH,
    };
  }

  const replacement = `if (!path.isStringLiteral()) return false;\n\n    if (\n        path.parentPath\n        && path.parentPath.isObjectProperty()\n        && path.parentKey === 'key'\n        && path.parent.computed !== true\n    ) {\n        return true;\n    }`;
  return {
    patchedSource: source.replace("if (!path.isStringLiteral()) return false;", replacement),
    applied: true,
    patchId: KNOWN_COMPAT_PATCH,
  };
}

export function hasKnownLightweightCompatPatch(sourceCode = "") {
  const source = String(sourceCode || "");
  return source.includes("path.parentPath.isObjectProperty()");
}

export function buildLightweightLeakSummary(sourceCode = "", leakMarkers = []) {
  const source = String(sourceCode || "");
  const normalizedMarkers = (Array.isArray(leakMarkers) ? leakMarkers : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const presentMarkers = normalizedMarkers.filter((marker) => source.includes(marker));

  return {
    leakFree: presentMarkers.length === 0,
    presentMarkers,
  };
}

function buildDefaultLeakMarkers(config = {}) {
  return [
    config?.addonRef,
    config?.addonVersion,
    "generatedAt",
    "optionalBundles",
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function classifyKnownCompatError(stderr = "") {
  const text = String(stderr || "");
  if (text.includes("Property key of ObjectProperty")) {
    return "object-property-key";
  }
  return null;
}

function resolveBundlePath(config, rawBundlePath = null) {
  if (rawBundlePath) {
    return path.resolve(rawBundlePath);
  }
  return path.join(projectRoot, "build", config.addonRef, "content", "scripts", `${config.addonRef}.js`);
}

function runNodeScript(scriptPath, args = [], options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd || projectRoot,
    env: {
      ...process.env,
      ...(options.env && typeof options.env === "object" ? options.env : {}),
    },
    encoding: "utf-8",
    stdio: "pipe",
  });

  return {
    ok: result.status === 0 && !result.error,
    exitCode: Number(result.status ?? 1),
    durationMs: Math.max(0, Date.now() - startedAt),
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    errorMessage: result.error ? String(result.error.message || result.error) : null,
  };
}

async function ensureProtectedBuildBundle() {
  const result = runNodeScript(path.join(projectRoot, "scripts", "build.mjs"), [], {
    cwd: projectRoot,
    env: {
      CLEANROOM_BUILD_LOCK_HELD: "1",
      [BUILD_MODULE_ID_MODE_ENV]: BUILD_MODULE_ID_MODE_ANONYMIZED,
      [BUILD_SEMANTIC_SCRUB_ENV]: BUILD_SEMANTIC_SCRUB_PROTECTED,
    },
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (!result.ok) {
    throw createScriptError("execution", "protected build preflight failed", {
      failedStage: "build-protected-bundle",
      details: {
        exitCode: result.exitCode,
        stderr: truncateOutput(result.stderr),
      },
    });
  }
}

async function ensureToolReady(toolPath) {
  const resolvedToolPath = path.resolve(toolPath);
  const packagePath = path.join(resolvedToolPath, "package.json");
  const obfuscatorPath = path.join(resolvedToolPath, "obfuscator.js");
  const nodeModulesPath = path.join(resolvedToolPath, "node_modules");

  const [packageStats, obfuscatorStats, nodeModulesStats] = await Promise.all([
    fs.stat(packagePath).catch(() => null),
    fs.stat(obfuscatorPath).catch(() => null),
    fs.stat(nodeModulesPath).catch(() => null),
  ]);

  assertScript(Boolean(packageStats?.isFile()), "toolPath must contain package.json", {
    category: "environment",
    failedStage: "validate-tool-path",
    details: {
      packagePath,
    },
  });
  assertScript(Boolean(obfuscatorStats?.isFile()), "toolPath must contain obfuscator.js", {
    category: "environment",
    failedStage: "validate-tool-path",
    details: {
      obfuscatorPath,
    },
  });
  assertScript(Boolean(nodeModulesStats?.isDirectory()), "toolPath must have installed dependencies in node_modules", {
    category: "environment",
    failedStage: "validate-tool-path",
    details: {
      nodeModulesPath,
    },
  });

  const packageJSON = await readJSONFile(packagePath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-tool-package",
    label: "lightweight-js-obfuscator package.json",
  });
  const obfuscatorSource = await fs.readFile(obfuscatorPath, "utf-8");

  return {
    toolPath: resolvedToolPath,
    packagePath,
    obfuscatorPath,
    nodeModulesPath,
    packageJSON,
    obfuscatorSource,
    sourceAlreadyCompatPatched: hasKnownLightweightCompatPatch(obfuscatorSource),
    hostileDefaults: detectLightweightHostileDefaults(obfuscatorSource),
  };
}

async function createPatchedToolWorkspace(toolInfo) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lightweight-preflight-"));
  const workspacePath = path.join(tempRoot, "tool");
  await fs.mkdir(workspacePath, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(workspacePath, "package.json"), `${JSON.stringify(toolInfo.packageJSON, null, 2)}\n`, "utf-8"),
    fs.symlink(toolInfo.nodeModulesPath, path.join(workspacePath, "node_modules")),
  ]);

  const patchResult = buildLightweightCompatPatchedSource(toolInfo.obfuscatorSource);
  await fs.writeFile(path.join(workspacePath, "obfuscator.js"), patchResult.patchedSource, "utf-8");

  return {
    workspacePath,
    patchResult,
    cleanup: () => fs.rm(tempRoot, { recursive: true, force: true }),
  };
}

async function readOutputStats(outputPath, leakMarkers) {
  const [stats, source] = await Promise.all([
    fs.stat(outputPath),
    fs.readFile(outputPath, "utf-8"),
  ]);

  return {
    path: outputPath,
    bytes: Number(stats.size || 0),
    leakSummary: buildLightweightLeakSummary(source, leakMarkers),
  };
}

async function runLightweightAttempt({
  toolPath,
  bundlePath,
  leakMarkers,
  inputBytes = 0,
  applyCompatPatch = false,
  toolInfo = null,
}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lightweight-preflight-output-"));
  const outputPath = path.join(tempRoot, "output.js");
  let cleanupPatchedWorkspace = null;
  let executionToolPath = toolPath;
  let appliedCompatPatch = false;
  let patchId = null;

  try {
    if (applyCompatPatch) {
      const patchedWorkspace = await createPatchedToolWorkspace(toolInfo);
      executionToolPath = patchedWorkspace.workspacePath;
      cleanupPatchedWorkspace = patchedWorkspace.cleanup;
      appliedCompatPatch = patchedWorkspace.patchResult.applied;
      patchId = patchedWorkspace.patchResult.patchId;
    }

    const execution = runNodeScript(path.join(executionToolPath, "obfuscator.js"), [bundlePath, outputPath], {
      cwd: executionToolPath,
    });
    const compatError = classifyKnownCompatError(execution.stderr);
    const output = execution.ok
      ? await readOutputStats(outputPath, leakMarkers)
      : null;

    return {
      succeeded: execution.ok,
      status: buildAttemptStatus({
        succeeded: execution.ok,
        appliedCompatPatch,
        inputBytes,
        outputBytes: output?.bytes || 0,
        leakFree: output?.leakSummary?.leakFree !== false,
      }),
      appliedCompatPatch,
      patchId,
      exitCode: execution.exitCode,
      durationMs: execution.durationMs,
      knownCompatError: compatError,
      stdout: truncateOutput(execution.stdout),
      stderr: truncateOutput(execution.stderr),
      errorMessage: execution.errorMessage,
      output,
    };
  } finally {
    if (cleanupPatchedWorkspace) {
      await cleanupPatchedWorkspace();
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export function summarizePackageProtectionLightweightPreflight({
  toolInfo,
  inputBytes,
  rawAttempt,
  compatAttempt,
  bundlePath,
}) {
  const hostileDefaults = toolInfo?.hostileDefaults || detectLightweightHostileDefaults("");
  const sourceAlreadyCompatPatched = toolInfo?.sourceAlreadyCompatPatched === true;
  const hasHostileDefaults = hostileDefaults.selfDefending
    || hostileDefaults.debugProtection
    || hostileDefaults.disableConsoleOutput
    || Number(hostileDefaults.debugProtectionInterval || 0) > 0;
  const patchedSucceeded = compatAttempt?.succeeded === true;
  const rawSucceeded = rawAttempt?.succeeded === true;
  let status = "attention";
  let nextAction = "prepare-local-wrapper";
  let summary = "lightweight preflight 已收集到足够证据，但 direct upstream 仍不适合直接接入模板。";

  if (!rawSucceeded && !patchedSucceeded) {
    status = "failed";
    nextAction = "inspect-upstream-compat";
    summary = "lightweight upstream 对当前 inner bundle 未能成功产出可用结果，先处理 AST 兼容性问题。";
  } else if (sourceAlreadyCompatPatched && hasHostileDefaults) {
    status = "attention";
    nextAction = "prepare-local-wrapper";
    summary = "当前 lightweight checkout 已带本地 compat patch；即便如此，默认 hostile runtime 选项仍与当前模板路线冲突，只适合继续做本地适配实验。";
  } else if (patchedSucceeded && hasHostileDefaults) {
    status = "attention";
    nextAction = "prepare-local-wrapper";
    summary = "direct upstream 仍不适合直接接入模板；patched upstream 虽可产出结果，但默认 hostile runtime 选项与当前模板路线冲突，只适合继续做本地适配实验。";
  } else if (rawSucceeded && !hasHostileDefaults) {
    status = "passed";
    nextAction = "run-zotero-smoke-ab";
    summary = "lightweight preflight 初步通过，可进入更完整的 XPI 级 A/B 验证。";
  }

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status,
    statusLabel: status === "passed" ? "通过" : status === "failed" ? "失败" : "关注",
    summary,
    nextAction,
    tool: {
      path: toolInfo?.toolPath || null,
      name: String(toolInfo?.packageJSON?.name || ""),
      version: String(toolInfo?.packageJSON?.version || ""),
      sourceAlreadyCompatPatched,
      hasHostileDefaults,
      hostileDefaults,
    },
    input: {
      bundlePath,
      bytes: Number(inputBytes || 0),
    },
    attempts: {
      raw: rawAttempt,
      compatPatched: compatAttempt,
    },
  };
}

export function renderPackageProtectionLightweightPreflightMarkdown(report = {}) {
  const raw = report?.attempts?.raw || null;
  const compat = report?.attempts?.compatPatched || null;
  const lines = [
    "# Package Protection Lightweight Preflight",
    "",
    `- 生成时间: \`${report.generatedAt || "-"}\``,
    `- 状态: \`${report.statusLabel || "-"}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- nextAction: \`${report.nextAction || "-"}\``,
    `- 摘要: ${report.summary || "-"}`,
    "",
    "## Tool",
    "",
    `- 路径: \`${report.tool?.path || "-"}\``,
    `- 包名: \`${report.tool?.name || "-"}\``,
    `- 版本: \`${report.tool?.version || "-"}\``,
    `- sourceAlreadyCompatPatched: \`${report.tool?.sourceAlreadyCompatPatched ? "yes" : "no"}\``,
    `- hostile defaults: \`${report.tool?.hasHostileDefaults ? "yes" : "no"}\``,
    `- selfDefending: \`${report.tool?.hostileDefaults?.selfDefending ? "true" : "false"}\``,
    `- debugProtection: \`${report.tool?.hostileDefaults?.debugProtection ? "true" : "false"}\``,
    `- debugProtectionInterval: \`${Number(report.tool?.hostileDefaults?.debugProtectionInterval || 0)}\``,
    `- disableConsoleOutput: \`${report.tool?.hostileDefaults?.disableConsoleOutput ? "true" : "false"}\``,
    "",
    "## Input",
    "",
    `- bundle: \`${report.input?.bundlePath || "-"}\``,
    `- bytes: \`${formatBytes(report.input?.bytes || 0)}\``,
    "",
    "## Attempts",
    "",
  ];

  [
    ["raw", raw],
    ["compatPatched", compat],
  ].forEach(([label, attempt]) => {
    lines.push(`### ${label}`);
    lines.push("");
    if (!attempt) {
      lines.push("- 状态: `missing`");
      lines.push("");
      return;
    }
    lines.push(`- 状态: \`${attempt.status}\``);
    lines.push(`- 成功: \`${attempt.succeeded ? "yes" : "no"}\``);
    lines.push(`- compat patch: \`${attempt.appliedCompatPatch ? attempt.patchId || "applied" : "no"}\``);
    lines.push(`- knownCompatError: \`${attempt.knownCompatError || "-"}\``);
    lines.push(`- durationMs: \`${Number(attempt.durationMs || 0)}\``);
    lines.push(`- exitCode: \`${Number(attempt.exitCode || 0)}\``);
    if (attempt.output) {
      lines.push(`- output bytes: \`${formatBytes(attempt.output.bytes)}\``);
      lines.push(`- growth ratio: \`${computeGrowthRatio(report.input?.bytes || 0, attempt.output.bytes) || "-"}\``);
      lines.push(`- leakFree: \`${attempt.output.leakSummary?.leakFree ? "yes" : "no"}\``);
      lines.push(`- leaked markers: \`${(attempt.output.leakSummary?.presentMarkers || []).join(" | ") || "-"}\``);
    } else {
      lines.push("- output bytes: `-`");
      lines.push("- growth ratio: `-`");
      lines.push("- leakFree: `-`");
      lines.push("- leaked markers: `-`");
    }
    lines.push(`- stderr: \`${attempt.stderr || "-"}\``);
    lines.push("");
  });

  return lines.join("\n");
}

export async function persistPackageProtectionLightweightPreflight(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const reportPath = resolveAgentArtifactPath(projectRootPath, `${DEFAULT_REPORT_BASENAME}.json`);
  const reportMDPath = resolveAgentArtifactPath(projectRootPath, `${DEFAULT_REPORT_BASENAME}.md`);
  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionLightweightPreflightMarkdown(report)}\n`, "utf-8"),
  ]);
  return {
    reportPath,
    reportMDPath,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionLightweightPreflightArgs(argv);
  await withBuildLock("package-protection-lightweight-preflight.mjs", async () => {
    const configPath = path.join(projectRoot, "config", "addon.config.json");
    const config = await readJSONFile(configPath, {
      missingCategory: "environment",
      invalidCategory: "validation",
      failedStage: "read-config",
      label: "config/addon.config.json",
    });
    assertNonEmptyString(config?.addonRef, "addon.config.json:addonRef", {
      category: "config",
      failedStage: "validate-config",
      details: {
        configPath,
        field: "addonRef",
      },
    });
    assertNonEmptyString(config?.addonVersion, "addon.config.json:addonVersion", {
      category: "config",
      failedStage: "validate-config",
      details: {
        configPath,
        field: "addonVersion",
      },
    });

    const toolInfo = await ensureToolReady(options.toolPath);
    if (!options.bundlePath) {
      await ensureProtectedBuildBundle();
    }
    const bundlePath = resolveBundlePath(config, options.bundlePath);
    const bundleSource = await fs.readFile(bundlePath, "utf-8");
    const inputBytes = Buffer.byteLength(bundleSource);
    const leakMarkers = buildDefaultLeakMarkers(config);

    const rawAttempt = await runLightweightAttempt({
      toolPath: toolInfo.toolPath,
      toolInfo,
      bundlePath,
      leakMarkers,
      inputBytes,
      applyCompatPatch: false,
    });
    const compatAttempt = options.skipKnownCompatPatch
      ? null
      : await runLightweightAttempt({
        toolPath: toolInfo.toolPath,
        toolInfo,
        bundlePath,
        leakMarkers,
        inputBytes,
        applyCompatPatch: true,
      });

    const report = summarizePackageProtectionLightweightPreflight({
      toolInfo,
      inputBytes,
      rawAttempt,
      compatAttempt,
      bundlePath,
    });
    const paths = await persistPackageProtectionLightweightPreflight(report);
    console.log(`Package protection lightweight preflight generated: ${paths.reportPath}`);
  });
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
