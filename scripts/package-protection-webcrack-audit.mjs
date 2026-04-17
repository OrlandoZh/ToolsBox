import { execFileSync, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  buildPackageProtectionAuditAnchors,
  scanBundleAnchors,
} from "./package-protection-anchor-audit.mjs";
import {
  resolvePackageProtectionSmokePackageArgs,
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

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_WEBCRACK_BIN = "webcrack";
const PACKAGE_PROTECTION_WEBCRACK_VARIANTS = Object.freeze([
  "plain",
  "encrypted",
  "shielded",
  "shielded-descriptor-bind",
  "shielded-jsconfuser-string",
]);

const STATUS_LABELS = Object.freeze({
  passed: "通过",
  attention: "关注",
  failed: "失败",
});

const LOADER_ANCHORS = Object.freeze([
  {
    id: "package-protection-runtime",
    label: "packageProtection runtime summary",
    needle: "packageProtection",
  },
  {
    id: "bootstrap-plugin",
    label: "bootstrapPlugin",
    needle: "bootstrapPlugin",
  },
  {
    id: "crypto-subtle",
    label: "crypto.subtle",
    needle: "crypto.subtle",
  },
  {
    id: "aes-gcm",
    label: "AES-GCM",
    needle: "AES-GCM",
  },
  {
    id: "new-function",
    label: "new Function",
    needle: "new Function",
  },
  {
    id: "overlay-resolver",
    label: "overlayResolver",
    needle: "overlayResolver",
  },
]);

function normalizeVariant(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "descriptor-bind") {
    return "shielded-descriptor-bind";
  }
  return PACKAGE_PROTECTION_WEBCRACK_VARIANTS.includes(normalized)
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

function truncateOutput(value, maxChars = 1200) {
  const text = String(value || "");
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}\n...[truncated]`
    : text;
}

function countOccurrences(sourceCode, needle) {
  const source = String(sourceCode || "");
  const token = String(needle || "");
  if (!source || !token) {
    return 0;
  }

  let count = 0;
  let cursor = 0;
  while (cursor < source.length) {
    const nextIndex = source.indexOf(token, cursor);
    if (nextIndex === -1) {
      break;
    }
    count += 1;
    cursor = nextIndex + token.length;
  }
  return count;
}

function scanLoaderAnchors(sourceCode = "") {
  const matches = LOADER_ANCHORS.map((anchor) => {
    const count = countOccurrences(sourceCode, anchor.needle);
    return {
      ...anchor,
      count,
      present: count > 0,
    };
  });

  const presentAnchors = matches
    .filter((match) => match.present)
    .map((match) => ({
      id: match.id,
      label: match.label,
      count: match.count,
    }));

  return {
    totalAnchorCount: presentAnchors.length,
    totalMatchCount: matches.reduce((sum, match) => sum + Number(match.count || 0), 0),
    presentAnchors,
    anchors: matches,
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

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function listFilesRecursive(directoryPath, rootPath = directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(absolutePath, rootPath));
      continue;
    }
    if (entry.isFile()) {
      const stats = await fs.stat(absolutePath);
      files.push({
        path: absolutePath,
        relativePath: normalizeRelativePath(path.relative(rootPath, absolutePath)),
        sizeBytes: Number(stats.size || 0),
      });
    }
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
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

function resolvePackageProtectionWebcrackPackageArgs(variant, options = {}) {
  const normalizedVariant = normalizeVariant(variant);
  assertScript(Boolean(normalizedVariant), "variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string", {
    category: "args",
    failedStage: "resolve-variant",
  });
  if (normalizedVariant === "shielded-descriptor-bind") {
    return ["--descriptor-bind", "--skip-release-metadata"];
  }
  return resolvePackageProtectionSmokePackageArgs(normalizedVariant, options);
}

function toAttemptModeKey(mode) {
  return String(mode || "").trim().toLowerCase() === "fallback-loader"
    ? "fallback-loader"
    : "primary";
}

function createEmptyOutputSummary(outputDir) {
  return {
    present: false,
    outputDir,
    totalFileCount: 0,
    jsFileCount: 0,
    totalSizeBytes: 0,
    files: [],
  };
}

async function summarizeOutputDir(outputDir) {
  if (!await pathExists(outputDir)) {
    return createEmptyOutputSummary(outputDir);
  }

  const stats = await fs.stat(outputDir).catch(() => null);
  if (!stats?.isDirectory?.()) {
    return createEmptyOutputSummary(outputDir);
  }

  const files = await listFilesRecursive(outputDir);
  const jsFiles = files.filter((file) => file.relativePath.endsWith(".js"));
  return {
    present: files.length > 0,
    outputDir,
    totalFileCount: files.length,
    jsFileCount: jsFiles.length,
    totalSizeBytes: files.reduce((sum, file) => sum + Number(file.sizeBytes || 0), 0),
    files: files.slice(0, 20),
  };
}

async function readJSOutputSource(outputDir) {
  if (!await pathExists(outputDir)) {
    return "";
  }

  const files = await listFilesRecursive(outputDir);
  const jsFiles = files
    .filter((file) => file.relativePath.endsWith(".js"))
    .slice(0, 12);
  if (jsFiles.length === 0) {
    return "";
  }

  const contents = await Promise.all(
    jsFiles.map((file) => fs.readFile(file.path, "utf-8").catch(() => "")),
  );
  return contents.join("\n");
}

function buildWebcrackAttemptSummary({
  mode,
  outputDir,
  timedOut = false,
  ok = false,
  exitCode = 1,
  durationMs = 0,
  stdout = "",
  stderr = "",
  errorMessage = null,
  output = null,
}) {
  const modeKey = toAttemptModeKey(mode);
  return {
    mode: modeKey,
    ok,
    timedOut,
    exitCode: Number(exitCode ?? 1),
    durationMs: Math.max(0, Number(durationMs || 0)),
    outputDir,
    stdout: truncateOutput(stdout),
    stderr: truncateOutput(stderr),
    errorMessage: errorMessage ? String(errorMessage) : null,
    output: output || createEmptyOutputSummary(outputDir),
  };
}

async function runWebcrackAttempt({
  inputPath,
  outputDir,
  mode,
  webcrackBin,
  timeoutMs,
  extraArgs = [],
}) {
  await fs.rm(outputDir, { recursive: true, force: true });
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const args = [inputPath, "-o", outputDir, "-f", ...extraArgs];
    const child = spawn(webcrackBin, args, {
      cwd: projectRoot,
      stdio: "pipe",
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let closed = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", async (error) => {
      if (closed) {
        return;
      }
      closed = true;
      clearTimeout(timer);
      const output = await summarizeOutputDir(outputDir);
      resolve(buildWebcrackAttemptSummary({
        mode,
        outputDir,
        timedOut,
        ok: false,
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        errorMessage: error?.message || String(error),
        output,
      }));
    });

    child.on("close", async (code) => {
      if (closed) {
        return;
      }
      closed = true;
      clearTimeout(timer);
      const output = await summarizeOutputDir(outputDir);
      resolve(buildWebcrackAttemptSummary({
        mode,
        outputDir,
        timedOut,
        ok: !timedOut && Number(code ?? 1) === 0,
        exitCode: Number(code ?? 1),
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        output,
      }));
    });
  });
}

function selectEffectiveAttempt(primaryAttempt, fallbackAttempt) {
  if (primaryAttempt?.output?.present) {
    return {
      source: "primary",
      attempt: primaryAttempt,
    };
  }
  if (fallbackAttempt?.output?.present) {
    return {
      source: "fallback-loader",
      attempt: fallbackAttempt,
    };
  }
  return {
    source: "none",
    attempt: null,
  };
}

export function summarizePackageProtectionWebcrackAudit({
  variant,
  channel,
  xpi = null,
  extractedInput = null,
  primaryAttempt = null,
  fallbackAttempt = null,
  semanticScan = null,
  loaderScan = null,
} = {}) {
  const effective = selectEffectiveAttempt(primaryAttempt, fallbackAttempt);
  const semanticAnchorCount = Number(semanticScan?.presentAnchors?.length || 0);
  const loaderAnchorCount = Number(loaderScan?.presentAnchors?.length || 0);

  let status = "attention";
  let suggestedWebcrackRating = null;
  let summary = "webcrack 默认首轮未产生可复核输出。";
  let nextAction = "agent-review-raw-loader";

  if (effective.source === "none") {
    if (primaryAttempt?.timedOut) {
      summary = "webcrack 默认首轮直接超时，当前没有成功的输出目录。";
      nextAction = "inspect-timeout-and-loader-fallback";
    } else if (primaryAttempt?.errorMessage) {
      status = "failed";
      summary = "webcrack 调用失败，先修复本地 CLI 或输入工件。";
      nextAction = "fix-webcrack-invocation";
    }
  } else if (semanticAnchorCount > 0) {
    suggestedWebcrackRating = "high-level-architecture";
    summary = "webcrack 输出里仍能直接看到 inner semantic anchors，首轮自动化处理已足够支持高层架构归纳。";
    nextAction = "agent-review-semantic-output";
  } else {
    status = "passed";
    suggestedWebcrackRating = "parse-fail / only-loader";
    summary = effective.source === "fallback-loader"
      ? "webcrack 默认首轮未成功，但 fallback 只恢复出 loader 级表面，未见 inner semantic anchors。"
      : "webcrack 首轮输出未见 inner semantic anchors，当前更像 loader-only surface。";
    nextAction = "agent-review-loader-only";
  }

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    variant,
    channel,
    status,
    statusLabel: STATUS_LABELS[status] || STATUS_LABELS.attention,
    suggestedWebcrackRating,
    summary,
    nextAction,
    xpi,
    extractedInput,
    primaryAttempt,
    fallbackAttempt,
    effectiveOutputSource: effective.source,
    outputScan: {
      semanticAnchorCount,
      semanticMatchCount: Number(semanticScan?.totalMatchCount || 0),
      presentSemanticAnchors: semanticScan?.presentAnchors || [],
      loaderAnchorCount,
      loaderMatchCount: Number(loaderScan?.totalMatchCount || 0),
      presentLoaderAnchors: loaderScan?.presentAnchors || [],
    },
  };
}

function renderAttemptMarkdown(attempt) {
  if (!attempt) {
    return [
      "- mode: `-`",
      "- status: `not-run`",
    ].join("\n");
  }

  return [
    `- mode: \`${attempt.mode}\``,
    `- ok: \`${attempt.ok ? "yes" : "no"}\``,
    `- timedOut: \`${attempt.timedOut ? "yes" : "no"}\``,
    `- exitCode: \`${attempt.exitCode}\``,
    `- durationMs: \`${attempt.durationMs}\``,
    `- outputDir: \`${attempt.outputDir}\``,
    `- outputPresent: \`${attempt.output.present ? "yes" : "no"}\``,
    `- outputFiles: \`${attempt.output.totalFileCount}\``,
    `- outputJSFiles: \`${attempt.output.jsFileCount}\``,
    `- outputSizeBytes: \`${attempt.output.totalSizeBytes}\``,
    `- stdout:`,
    `\`\`\`text\n${attempt.stdout || "-"}\n\`\`\``,
    `- stderr:`,
    `\`\`\`text\n${attempt.stderr || "-"}\n\`\`\``,
    `- errorMessage: \`${attempt.errorMessage || "-"}\``,
  ].join("\n");
}

export function renderPackageProtectionWebcrackAuditMarkdown(report) {
  const lines = [
    "# Package Protection Webcrack Audit",
    "",
    `- 生成时间: \`${report.generatedAt}\``,
    `- Advisory: \`${report.advisory ? "yes" : "no"}\``,
    `- variant/channel: \`${report.variant}/${report.channel}\``,
    `- 状态: \`${report.statusLabel}\``,
    `- suggestedWebcrackRating: \`${report.suggestedWebcrackRating || "pending"}\``,
    `- nextAction: \`${report.nextAction}\``,
    `- 摘要: ${report.summary}`,
    `- effectiveOutputSource: \`${report.effectiveOutputSource}\``,
    "",
    "## Artifacts",
    "",
    `- xpi: \`${report.xpi?.path || "-"}\` (${Number(report.xpi?.sizeBytes || 0)} bytes)`,
    `- extractedInput: \`${report.extractedInput?.path || "-"}\` (${Number(report.extractedInput?.sizeBytes || 0)} bytes)`,
    "",
    "## Output Scan",
    "",
    `- semanticAnchorCount: \`${report.outputScan.semanticAnchorCount}\``,
    `- semanticMatchCount: \`${report.outputScan.semanticMatchCount}\``,
    `- loaderAnchorCount: \`${report.outputScan.loaderAnchorCount}\``,
    `- loaderMatchCount: \`${report.outputScan.loaderMatchCount}\``,
  ];

  if (report.outputScan.presentSemanticAnchors.length === 0) {
    lines.push("- presentSemanticAnchors: 无");
  } else {
    lines.push("- presentSemanticAnchors:");
    report.outputScan.presentSemanticAnchors.forEach((anchor) => {
      lines.push(`  - \`${anchor.id}\` / ${anchor.label} / count=${anchor.count}`);
    });
  }

  if (report.outputScan.presentLoaderAnchors.length === 0) {
    lines.push("- presentLoaderAnchors: 无");
  } else {
    lines.push("- presentLoaderAnchors:");
    report.outputScan.presentLoaderAnchors.forEach((anchor) => {
      lines.push(`  - \`${anchor.id}\` / ${anchor.label} / count=${anchor.count}`);
    });
  }

  lines.push("");
  lines.push("## Primary Attempt");
  lines.push("");
  lines.push(renderAttemptMarkdown(report.primaryAttempt));
  lines.push("");
  lines.push("## Fallback Attempt");
  lines.push("");
  lines.push(renderAttemptMarkdown(report.fallbackAttempt));
  lines.push("");

  return lines.join("\n");
}

export function parsePackageProtectionWebcrackAuditArgs(argv = process.argv.slice(2)) {
  const options = {
    variant: null,
    channel: "stable",
    packageFirst: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    webcrackBin: DEFAULT_WEBCRACK_BIN,
    jsConfuserToolPath: null,
    jsConfuserToolEntry: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--variant":
        options.variant = normalizeVariant(argv[index + 1]);
        index += 1;
        break;
      case "--channel":
        options.channel = normalizeChannel(argv[index + 1]);
        index += 1;
        break;
      case "--timeout-ms":
        options.timeoutMs = normalizePositiveInteger(argv[index + 1], 0);
        index += 1;
        break;
      case "--webcrack-bin":
        options.webcrackBin = String(argv[index + 1] || "").trim() || DEFAULT_WEBCRACK_BIN;
        index += 1;
        break;
      case "--jsconfuser-tool-path":
        options.jsConfuserToolPath = String(argv[index + 1] || "").trim() || null;
        index += 1;
        break;
      case "--jsconfuser-tool-entry":
        options.jsConfuserToolEntry = String(argv[index + 1] || "").trim() || null;
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

  assertScript(Boolean(options.variant), "--variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string", {
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
  assertScript(Boolean(options.webcrackBin), "--webcrack-bin is required", {
    category: "args",
    failedStage: "parse-args",
  });

  return options;
}

async function persistPackageProtectionWebcrackAudit(report, projectRootPath) {
  const artifactsRoot = path.join(resolveAgentArtifactsDir(projectRootPath), "package-protection-webcrack");
  await ensureDir(artifactsRoot);
  const baseName = `${report.variant}-${report.channel}`;
  const reportPath = path.join(artifactsRoot, `${baseName}.json`);
  const reportMDPath = path.join(artifactsRoot, `${baseName}.md`);
  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionWebcrackAuditMarkdown(report)}\n`, "utf-8"),
  ]);
  return {
    reportPath,
    reportMDPath,
  };
}

function packageVariant(projectRootPath, variant, options = {}) {
  const args = [
    "scripts/package.mjs",
    ...resolvePackageProtectionWebcrackPackageArgs(variant, {
      jsConfuserToolPath: options.jsConfuserToolPath,
      jsConfuserToolEntry: options.jsConfuserToolEntry,
    }),
  ];

  execFileSync(process.execPath, args, {
    cwd: projectRootPath,
    stdio: "inherit",
    env: process.env,
  });
}

async function createWebcrackAudit(options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const variant = normalizeVariant(options.variant);
  const channel = normalizeChannel(options.channel) || "stable";
  const timeoutMs = normalizePositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const webcrackBin = String(options.webcrackBin || DEFAULT_WEBCRACK_BIN).trim() || DEFAULT_WEBCRACK_BIN;

  assertScript(Boolean(variant), "variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string", {
    category: "args",
    failedStage: "validate-options",
  });
  assertScript(Boolean(channel), "channel must be stable or beta", {
    category: "args",
    failedStage: "validate-options",
  });

  const config = await readAddonConfig(projectRootPath);
  if (options.packageFirst !== false) {
    packageVariant(projectRootPath, variant, {
      jsConfuserToolPath: options.jsConfuserToolPath,
      jsConfuserToolEntry: options.jsConfuserToolEntry,
    });
  }

  const xpiPath = path.join(projectRootPath, "dist", resolvePackageVariantOutputName(config, variant));
  assertScript(await pathExists(xpiPath), `Missing XPI artifact: ${xpiPath}`, {
    category: "environment",
    failedStage: "resolve-xpi",
    details: {
      variant,
      channel,
      xpiPath,
    },
  });

  const artifactsRoot = path.join(resolveAgentArtifactsDir(projectRootPath), "package-protection-webcrack", `${variant}-${channel}`);
  const inputPath = path.join(artifactsRoot, `${config.addonRef}.js`);
  const primaryOutputDir = path.join(artifactsRoot, "primary-output");
  const fallbackOutputDir = path.join(artifactsRoot, "fallback-loader-output");
  await ensureDir(artifactsRoot);

  const scriptBuffer = execFileSync("unzip", [
    "-p",
    xpiPath,
    `content/scripts/${config.addonRef}.js`,
  ], {
    cwd: projectRootPath,
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
  });
  await fs.writeFile(inputPath, scriptBuffer);

  const [xpiStats, inputStats] = await Promise.all([
    fs.stat(xpiPath),
    fs.stat(inputPath),
  ]);

  const primaryAttempt = await runWebcrackAttempt({
    inputPath,
    outputDir: primaryOutputDir,
    mode: "primary",
    webcrackBin,
    timeoutMs,
  });

  const fallbackAttempt = (!primaryAttempt.ok || primaryAttempt.timedOut)
    ? await runWebcrackAttempt({
      inputPath,
      outputDir: fallbackOutputDir,
      mode: "fallback-loader",
      webcrackBin,
      timeoutMs,
      extraArgs: ["--no-deobfuscate", "--no-unpack"],
    })
    : null;

  const effective = selectEffectiveAttempt(primaryAttempt, fallbackAttempt);
  const outputSource = effective.attempt
    ? await readJSOutputSource(effective.attempt.outputDir)
    : "";
  const semanticAnchors = buildPackageProtectionAuditAnchors(config);
  const semanticScan = scanBundleAnchors(outputSource, semanticAnchors);
  const loaderScan = scanLoaderAnchors(outputSource);

  const report = summarizePackageProtectionWebcrackAudit({
    variant,
    channel,
    xpi: {
      path: xpiPath,
      sizeBytes: Number(xpiStats.size || 0),
    },
    extractedInput: {
      path: inputPath,
      sizeBytes: Number(inputStats.size || 0),
    },
    primaryAttempt,
    fallbackAttempt,
    semanticScan,
    loaderScan,
  });
  const paths = await persistPackageProtectionWebcrackAudit(report, projectRootPath);

  return {
    report,
    paths,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionWebcrackAuditArgs(argv);
  const { report, paths } = await createWebcrackAudit(options);
  console.log(`Package protection webcrack audit generated: ${paths.reportPath}`);
  console.log(`Package protection webcrack status: ${report.status}`);
  console.log(`Suggested webcrack rating: ${report.suggestedWebcrackRating || "pending"}`);
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

export {
  createWebcrackAudit as runPackageProtectionWebcrackAudit,
};
