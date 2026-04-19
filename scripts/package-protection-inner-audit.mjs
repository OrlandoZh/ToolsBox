import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { withBuildLock } from "./build-lock.mjs";
import {
  resolveAgentArtifactPath,
  resolveAgentArtifactsDir,
} from "./agent-artifacts.mjs";
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
  wrapScriptError,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();
const PACKAGE_PROTECTION_BUILD_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

export const PACKAGE_PROTECTION_INNER_AUDIT_VARIANTS = Object.freeze([
  "shielded",
  "shielded-descriptor-bind",
  "shielded-jsconfuser-string",
  "shielded-pref-bridge",
  "shielded-surface-scrub",
  "shielded-surface-scrub-wasm-digest",
  "shielded-surface-scrub-wasm-stage2-derive",
]);

export const PACKAGE_PROTECTION_PROXY_LLM_LEVELS = Object.freeze([
  "parse-fail / only-loader",
  "high-level-architecture",
  "readable-module-recovery",
]);

export const PACKAGE_PROTECTION_MODULE_RECOVERY_ANCHORS = Object.freeze([
  {
    id: "src-app-plugin",
    label: "src/app/plugin.js",
    needle: "src/app/plugin.js",
    category: "module-recovery",
  },
  {
    id: "src-app-runtime-capabilities",
    label: "src/app/runtime-capabilities.js",
    needle: "src/app/runtime-capabilities.js",
    category: "module-recovery",
  },
  {
    id: "src-app-host-action-catalog",
    label: "src/app/host-action-catalog.js",
    needle: "src/app/host-action-catalog.js",
    category: "module-recovery",
  },
  {
    id: "src-features-menu-manager",
    label: "src/features/menu-manager.js",
    needle: "src/features/menu-manager.js",
    category: "module-recovery",
  },
  {
    id: "src-features-item-pane",
    label: "src/features/item-pane.js",
    needle: "src/features/item-pane.js",
    category: "module-recovery",
  },
  {
    id: "src-features-reader",
    label: "src/features/reader.js",
    needle: "src/features/reader.js",
    category: "module-recovery",
  },
  {
    id: "src-core-logger",
    label: "src/core/logger.js",
    needle: "src/core/logger.js",
    category: "module-recovery",
  },
  {
    id: "src-main",
    label: "src/main.js",
    needle: "src/main.js",
    category: "module-recovery",
  },
]);

const STATUS_LABELS = Object.freeze({
  passed: "通过",
  attention: "关注",
  missing: "缺失",
  failed: "失败",
});

async function withPackageProtectionWorkflowLock(owner, fn) {
  const previousBuildLockHeld = process.env.CLEANROOM_BUILD_LOCK_HELD;
  return withBuildLock(owner, async () => {
    process.env.CLEANROOM_BUILD_LOCK_HELD = "1";
    try {
      return await fn();
    } finally {
      if (previousBuildLockHeld === undefined) {
        delete process.env.CLEANROOM_BUILD_LOCK_HELD;
      } else {
        process.env.CLEANROOM_BUILD_LOCK_HELD = previousBuildLockHeld;
      }
    }
  }, {
    timeoutMs: PACKAGE_PROTECTION_BUILD_LOCK_TIMEOUT_MS,
  });
}

function normalizeVariant(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "all") {
    return "all";
  }
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
  if (normalized === "surface-scrub-wasm-stage2-derive" || normalized === "wasm-stage2-derive") {
    return "shielded-surface-scrub-wasm-stage2-derive";
  }
  return PACKAGE_PROTECTION_INNER_AUDIT_VARIANTS.includes(normalized)
    ? normalized
    : null;
}

function normalizeChannel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "stable" || normalized === "beta"
    ? normalized
    : null;
}

function listSelectedVariants(variant) {
  const normalized = normalizeVariant(variant);
  return normalized === "all"
    ? [...PACKAGE_PROTECTION_INNER_AUDIT_VARIANTS]
    : [normalized];
}

function summarizePresentAnchors(scan) {
  return (Array.isArray(scan?.anchors) ? scan.anchors : [])
    .filter((anchor) => anchor.present === true)
    .map((anchor) => ({
      id: anchor.id,
      label: anchor.label,
      category: anchor.category,
      count: Number(anchor.count || 0),
    }));
}

function getArchitectureAnchorMatches(scan) {
  return (Array.isArray(scan?.anchors) ? scan.anchors : [])
    .filter((anchor) => anchor.present === true && anchor.category !== "loader-metadata");
}

function summarizeOverlay(overlayValue) {
  const entries = Array.isArray(overlayValue) ? overlayValue : [];
  return {
    present: entries.length > 0,
    entryCount: entries.length,
    ids: entries
      .map((entry) => String(entry?.id || "").trim())
      .filter(Boolean),
    ownedByCount: entries.reduce((sum, entry) => sum + (Array.isArray(entry?.ownedBy) ? entry.ownedBy.length : 0), 0),
    entrypointCount: entries.reduce((sum, entry) => sum + (Array.isArray(entry?.entrypoints) ? entry.entrypoints.length : 0), 0),
    successSignalCount: entries.reduce((sum, entry) => sum + (Array.isArray(entry?.successSignals) ? entry.successSignals.length : 0), 0),
  };
}

function summarizePackageProtectionState(packageProtection) {
  const summary = packageProtection && typeof packageProtection === "object"
    ? packageProtection
    : {};
  return {
    variant: String(summary.variant || "").trim() || null,
    decodeMethod: String(summary.decodeMethod || "").trim() || null,
    decodeDurationMs: Number(summary.decodeDurationMs || 0),
    decryptDurationMs: Number(summary.decryptDurationMs || 0),
    evalDurationMs: Number(summary.evalDurationMs || 0),
    prepareDurationMs: Number(summary.prepareDurationMs || 0),
    bootstrapResolveDurationMs: Number(summary.bootstrapResolveDurationMs || 0),
    bootstrapCallCount: Number(summary.bootstrapCallCount || 0),
  };
}

function resolvePackageVariantOutputName(config, variant) {
  return `${config.addonRef}-${config.addonVersion}-${variant}.xpi`;
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

async function readAddonConfig(projectRootPath) {
  return readJSONFile(path.join(projectRootPath, "config", "addon.config.json"), {
    missingCategory: "environment",
    invalidCategory: "validation",
    failedStage: "read-addon-config",
    label: "config/addon.config.json",
  });
}

function packageVariant(projectRootPath, variant, options = {}) {
  const args = [
    "scripts/package.mjs",
    ...resolvePackageProtectionSmokePackageArgs(variant, {
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

async function extractPackageScript({
  projectRootPath,
  xpiPath,
  addonRef,
  outputPath,
}) {
  const scriptBuffer = execFileSync("unzip", [
    "-p",
    xpiPath,
    `content/scripts/${addonRef}.js`,
  ], {
    cwd: projectRootPath,
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
  });
  await fs.writeFile(outputPath, scriptBuffer);
  const stats = await fs.stat(outputPath);
  return {
    path: outputPath,
    sizeBytes: Number(stats.size || 0),
  };
}

export function parsePackageProtectionInnerAuditArgs(argv = process.argv.slice(2)) {
  const options = {
    variant: "all",
    channel: "stable",
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
      case "--variant":
        options.variant = normalizeVariant(argv[index + 1]);
        index += 1;
        break;
      case "--channel":
        options.channel = normalizeChannel(argv[index + 1]) || null;
        index += 1;
        break;
      case "--no-package-first":
        options.packageFirst = false;
        break;
      case "--jsconfuser-tool-path":
        options.jsConfuserToolPath = String(argv[index + 1] || "").trim() || null;
        index += 1;
        break;
      case "--jsconfuser-tool-entry":
        options.jsConfuserToolEntry = String(argv[index + 1] || "").trim() || null;
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

  assertScript(Boolean(options.variant), "--variant must be one of shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest|shielded-surface-scrub-wasm-stage2-derive|all", {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(Boolean(options.channel), "--channel must be stable or beta", {
    category: "args",
    failedStage: "parse-args",
  });

  return options;
}

export async function extractShieldedInnerBundleArtifacts(loaderSource, options = {}) {
  const normalizedSource = String(loaderSource || "");
  assertScript(normalizedSource.trim().length > 0, "loader source must be a non-empty string", {
    category: "validation",
    failedStage: "validate-loader-source",
  });

  const capture = {
    decryptedSource: null,
  };

  function InterceptedFunction(...args) {
    const sourceCode = String(args.at(-1) || "");
    return function interceptedRuntimeFactory(__cleanroomScope, globalThisValue) {
      capture.decryptedSource = sourceCode;
      const targetGlobal = globalThisValue && typeof globalThisValue === "object"
        ? globalThisValue
        : (__cleanroomScope && typeof __cleanroomScope === "object" ? __cleanroomScope : null);
      if (targetGlobal && typeof targetGlobal === "object") {
        targetGlobal.bootstrapPlugin = async function bootstrapPluginNoop() {
          return null;
        };
      }
    };
  }

  const sandbox = {
    crypto: crypto.webcrypto,
    TextDecoder,
    Uint8Array,
    Date,
    Math,
    JSON,
    Promise,
    Array,
    Object,
    Number,
    String,
    RegExp,
    Error,
    TypeError,
    Function: InterceptedFunction,
    atob(base64) {
      return Buffer.from(String(base64 || ""), "base64").toString("binary");
    },
    console: {
      log() {},
      warn() {},
      error() {},
    },
  };

  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.global = sandbox;

  const context = vm.createContext(sandbox);
  try {
    new vm.Script(normalizedSource, {
      filename: String(options.filename || "protected-loader.js"),
    }).runInContext(context, {
      timeout: Math.max(1000, Number(options.timeoutMs || 10_000)),
    });
  } catch (error) {
    throw wrapScriptError(error, {
      category: "execution",
      failedStage: "evaluate-loader",
      details: {
        filename: String(options.filename || "protected-loader.js"),
      },
    });
  }

  assertScript(typeof context.bootstrapPlugin === "function", "loader did not expose bootstrapPlugin", {
    category: "validation",
    failedStage: "resolve-loader-bootstrap",
  });

  await context.bootstrapPlugin();

  const runtime = context.__CLEANROOM_TEMPLATE_RUNTIME__;
  const packageProtection = runtime?.packageProtection;
  const overlayValue = typeof packageProtection?.overlayResolver === "function"
    ? packageProtection.overlayResolver()
    : null;

  assertScript(typeof capture.decryptedSource === "string" && capture.decryptedSource.length > 0, "failed to capture decrypted bundle source", {
    category: "validation",
    failedStage: "capture-decrypted-source",
  });

  return {
    decryptedSource: capture.decryptedSource,
    overlayValue,
    packageProtection: summarizePackageProtectionState(packageProtection),
    runtimeVariant: String(context.__CLEANROOM_PACKAGE_VARIANT__ || "").trim() || null,
  };
}

export function suggestPackageProtectionProxyLLMRating({
  innerSemanticScan,
  moduleRecoveryScan,
  overlay,
} = {}) {
  const moduleRecoveryAnchorCount = Number(moduleRecoveryScan?.totalAnchorCount || 0);
  if (moduleRecoveryAnchorCount > 0) {
    return "readable-module-recovery";
  }

  const architectureAnchorCount = getArchitectureAnchorMatches(innerSemanticScan).length;
  if (architectureAnchorCount > 0 || overlay?.present === true) {
    return "high-level-architecture";
  }

  return "parse-fail / only-loader";
}

export function summarizePackageProtectionInnerVariant({
  variant,
  xpi = null,
  extractedInput = null,
  extractedArtifacts,
  config = {},
} = {}) {
  const anchors = buildPackageProtectionAuditAnchors(config);
  const innerSemanticScan = scanBundleAnchors(extractedArtifacts.decryptedSource, anchors);
  const moduleRecoveryScan = scanBundleAnchors(
    extractedArtifacts.decryptedSource,
    PACKAGE_PROTECTION_MODULE_RECOVERY_ANCHORS,
  );
  const overlay = summarizeOverlay(extractedArtifacts.overlayValue);
  const suggestedProxyLLMRating = suggestPackageProtectionProxyLLMRating({
    innerSemanticScan,
    moduleRecoveryScan,
    overlay,
  });
  const architectureAnchors = getArchitectureAnchorMatches(innerSemanticScan);

  return {
    variant,
    status: "passed",
    statusLabel: STATUS_LABELS.passed,
    summary: suggestedProxyLLMRating === "readable-module-recovery"
      ? "离线解密后已能直接定位模块级路径锚点，当前更接近 readable-module-recovery。"
      : suggestedProxyLLMRating === "high-level-architecture"
        ? "离线解密后仍可归纳高层能力面，但未直接恢复到模块级路径锚点。"
        : "离线解密后仍未稳定暴露高层语义锚点，当前更接近 only-loader。",
    xpi,
    extractedInput,
    packageProtection: extractedArtifacts.packageProtection,
    runtimeVariant: extractedArtifacts.runtimeVariant,
    overlay,
    innerSemanticScan: {
      totalAnchorCount: Number(innerSemanticScan.totalAnchorCount || 0),
      totalMatchCount: Number(innerSemanticScan.totalMatchCount || 0),
      categoryCounts: innerSemanticScan.categoryCounts || {},
      presentAnchors: summarizePresentAnchors(innerSemanticScan),
      architectureAnchorCount: architectureAnchors.length,
    },
    moduleRecoveryScan: {
      totalAnchorCount: Number(moduleRecoveryScan.totalAnchorCount || 0),
      totalMatchCount: Number(moduleRecoveryScan.totalMatchCount || 0),
      presentAnchors: summarizePresentAnchors(moduleRecoveryScan),
    },
    suggestedProxyLLMRating,
  };
}

async function createVariantAudit({
  projectRootPath,
  config,
  variant,
  channel,
  packageFirst,
  jsConfuserToolPath,
  jsConfuserToolEntry,
}) {
  const xpiPath = path.join(projectRootPath, "dist", resolvePackageVariantOutputName(config, variant));
  const artifactsRoot = path.join(resolveAgentArtifactsDir(projectRootPath), "package-protection-inner-audit", `${variant}-${channel}`);
  const extractedInputPath = path.join(artifactsRoot, `${config.addonRef}.js`);

  if (packageFirst !== false) {
    packageVariant(projectRootPath, variant, {
      jsConfuserToolPath,
      jsConfuserToolEntry,
    });
  }

  assertScript(await pathExists(xpiPath), `Missing XPI artifact: ${xpiPath}`, {
    category: "environment",
    failedStage: "resolve-xpi",
    details: {
      variant,
      channel,
      xpiPath,
    },
  });

  await ensureDir(artifactsRoot);
  const xpiStats = await fs.stat(xpiPath);
  const extractedInput = await extractPackageScript({
    projectRootPath,
    xpiPath,
    addonRef: config.addonRef,
    outputPath: extractedInputPath,
  });
  const loaderSource = await fs.readFile(extractedInput.path, "utf-8");
  const extractedArtifacts = await extractShieldedInnerBundleArtifacts(loaderSource, {
    filename: extractedInput.path,
  });

  return summarizePackageProtectionInnerVariant({
    variant,
    xpi: {
      path: xpiPath,
      sizeBytes: Number(xpiStats.size || 0),
    },
    extractedInput,
    extractedArtifacts,
    config,
  });
}

export function summarizePackageProtectionInnerAudit({
  channel = "stable",
  variants = [],
} = {}) {
  const selected = Array.isArray(variants) ? variants : [];
  const hasFailed = selected.some((variant) => variant.status === "failed");
  const hasMissing = selected.some((variant) => variant.status === "missing");
  const status = hasFailed
    ? "failed"
    : hasMissing
      ? "attention"
      : "passed";
  const nextAction = status === "passed"
    ? "review-proxy-llm-rating"
    : "fix-inner-audit-input";
  const summaryParts = selected
    .filter((variant) => variant.status === "passed")
    .map((variant) => `${variant.variant}=${variant.suggestedProxyLLMRating}`);

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    channel,
    status,
    statusLabel: STATUS_LABELS[status] || STATUS_LABELS.attention,
    nextAction,
    summary: summaryParts.length > 0
      ? `inner audit 已完成：${summaryParts.join(" / ")}。`
      : "inner audit 缺少可用的受保护变体结果。",
    variants: selected,
  };
}

export function renderPackageProtectionInnerAuditMarkdown(report) {
  const lines = [
    "# Package Protection Inner Audit",
    "",
    `- 生成时间: \`${report.generatedAt}\``,
    `- channel: \`${report.channel}\``,
    `- 状态: \`${report.statusLabel}\``,
    `- nextAction: \`${report.nextAction}\``,
    `- 摘要: ${report.summary}`,
    "",
  ];

  for (const variant of report.variants || []) {
    lines.push(`## ${variant.variant}`);
    lines.push("");
    lines.push(`- 状态: \`${variant.statusLabel || variant.status}\``);
    lines.push(`- suggestedProxyLLMRating: \`${variant.suggestedProxyLLMRating || "-"}\``);
    lines.push(`- decodeMethod: \`${variant.packageProtection?.decodeMethod || "-"}\``);
    lines.push(`- prepareDurationMs: \`${variant.packageProtection?.prepareDurationMs ?? 0}\``);
    lines.push(`- overlayPresent: \`${variant.overlay?.present ? "yes" : "no"}\``);
    lines.push(`- overlayEntryCount: \`${variant.overlay?.entryCount ?? 0}\``);
    lines.push(`- innerSemanticAnchorCount: \`${variant.innerSemanticScan?.totalAnchorCount ?? 0}\``);
    lines.push(`- moduleRecoveryAnchorCount: \`${variant.moduleRecoveryScan?.totalAnchorCount ?? 0}\``);
    lines.push(`- 摘要: ${variant.summary}`);
    if (Array.isArray(variant.innerSemanticScan?.presentAnchors) && variant.innerSemanticScan.presentAnchors.length > 0) {
      lines.push("- innerSemantic present anchors:");
      variant.innerSemanticScan.presentAnchors.forEach((anchor) => {
        lines.push(`  - \`${anchor.id}\` / ${anchor.label} / ${anchor.category} / count=${anchor.count}`);
      });
    }
    if (Array.isArray(variant.moduleRecoveryScan?.presentAnchors) && variant.moduleRecoveryScan.presentAnchors.length > 0) {
      lines.push("- moduleRecovery present anchors:");
      variant.moduleRecoveryScan.presentAnchors.forEach((anchor) => {
        lines.push(`  - \`${anchor.id}\` / ${anchor.label} / count=${anchor.count}`);
      });
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

async function persistPackageProtectionInnerAudit(report, projectRootPath) {
  const artifactsRoot = path.join(resolveAgentArtifactsDir(projectRootPath), "package-protection-inner-audit");
  await ensureDir(artifactsRoot);
  const baseName = report.variants.length === 1
    ? `${report.variants[0].variant}-${report.channel}`
    : `all-${report.channel}`;
  const reportPath = path.join(artifactsRoot, `${baseName}.json`);
  const reportMDPath = path.join(artifactsRoot, `${baseName}.md`);
  const latestReportPath = resolveAgentArtifactPath(projectRootPath, "package-protection-inner-audit.json");
  const latestReportMDPath = resolveAgentArtifactPath(projectRootPath, "package-protection-inner-audit.md");
  const reportJSON = `${JSON.stringify(report, null, 2)}\n`;
  const reportMD = `${renderPackageProtectionInnerAuditMarkdown(report)}\n`;

  await Promise.all([
    fs.writeFile(reportPath, reportJSON, "utf-8"),
    fs.writeFile(reportMDPath, reportMD, "utf-8"),
    fs.writeFile(latestReportPath, reportJSON, "utf-8"),
    fs.writeFile(latestReportMDPath, reportMD, "utf-8"),
  ]);

  return {
    reportPath,
    reportMDPath,
    latestReportPath,
    latestReportMDPath,
  };
}

export async function createPackageProtectionInnerAudit(options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const normalizedChannel = normalizeChannel(options.channel) || "stable";
  const selectedVariants = listSelectedVariants(options.variant);
  assertScript(selectedVariants.every(Boolean), "variant must be one of shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest|shielded-surface-scrub-wasm-stage2-derive|all", {
    category: "args",
    failedStage: "validate-options",
  });
  const config = await readAddonConfig(projectRootPath);
  const variants = [];

  for (const variant of selectedVariants) {
    try {
      variants.push(await createVariantAudit({
        projectRootPath,
        config,
        variant,
        channel: normalizedChannel,
        packageFirst: options.packageFirst,
        jsConfuserToolPath: options.jsConfuserToolPath,
        jsConfuserToolEntry: options.jsConfuserToolEntry,
      }));
    } catch (error) {
      const failureInfo = buildScriptFailureInfo(error);
      variants.push({
        variant,
        status: failureInfo.errorCategory === "environment" ? "missing" : "failed",
        statusLabel: STATUS_LABELS[failureInfo.errorCategory === "environment" ? "missing" : "failed"],
        summary: `${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`,
        failure: failureInfo,
        suggestedProxyLLMRating: null,
      });
    }
  }

  const report = summarizePackageProtectionInnerAudit({
    channel: normalizedChannel,
    variants,
  });
  const paths = await persistPackageProtectionInnerAudit(report, projectRootPath);
  return {
    report,
    paths,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionInnerAuditArgs(argv);
  await withPackageProtectionWorkflowLock("package-protection-inner-audit.mjs", async () => {
    const { report, paths } = await createPackageProtectionInnerAudit(options);
    console.log(`Package protection inner audit generated: ${paths.reportPath}`);
    console.log(`Status: ${report.status}`);
    for (const variant of report.variants || []) {
      console.log(`${variant.variant}: ${variant.suggestedProxyLLMRating || variant.status}`);
    }
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
