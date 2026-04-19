import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withBuildLock } from "./build-lock.mjs";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  RdpClient,
  buildStartupArgs,
  findFreePort,
  prepareRuntime,
  readAddonRuntimeInfo,
  readRunnerConfig,
  stopChildProcess,
} from "./zotero-runner-lib.mjs";
import {
  clearCapturedLogs,
  ensurePluginReady,
  installRuntimeLogBridge,
  readCapturedLogs,
} from "./zotero-agent-runtime-lib.mjs";
import {
  classifyReleaseInstallSmokeRuntimeErrors,
  formatReleaseRuntimeErrorPortrait,
} from "./release-matrix-lib.mjs";
import {
  buildShieldedObfuscationOptions,
  SHIELDED_LOADER_OBFUSCATION_STAGE,
} from "./package-obfuscation-lib.mjs";
import {
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  wrapScriptError,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();
const PACKAGE_PROTECTION_BUILD_LOCK_TIMEOUT_MS = 10 * 60 * 1000;
let packageProtectionWorkflowQueue = Promise.resolve();

export const PACKAGE_PROTECTION_SMOKE_VARIANTS = Object.freeze([
  "plain",
  "encrypted",
  "shielded",
  "shielded-descriptor-bind",
  "shielded-jsconfuser-string",
  "shielded-pref-bridge",
  "shielded-surface-scrub",
  "shielded-surface-scrub-wasm-digest",
]);

export const MANUAL_SCORECARD_LEVELS = Object.freeze([
  "parse-fail / only-loader",
  "high-level-architecture",
  "readable-module-recovery",
]);
const MANUAL_SCORECARD_LEVEL_SET = new Set(MANUAL_SCORECARD_LEVELS);

export async function withPackageProtectionWorkflowLock(owner, fn) {
  const waitTurn = packageProtectionWorkflowQueue.catch(() => {});
  let releaseTurn = () => {};
  packageProtectionWorkflowQueue = new Promise((resolve) => {
    releaseTurn = resolve;
  });

  await waitTurn;
  const previousBuildLockHeld = process.env.CLEANROOM_BUILD_LOCK_HELD;
  try {
    return await withBuildLock(owner, async () => {
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
  } finally {
    releaseTurn();
  }
}

function normalizeVariant(variant) {
  const normalized = String(variant || "").trim().toLowerCase();
  if (normalized === "descriptor-bind") {
    return "shielded-descriptor-bind";
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

function isShieldedLikeVariant(variant) {
  const normalizedVariant = String(variant || "").trim().toLowerCase();
  return normalizedVariant === "shielded"
    || normalizedVariant === "shielded-descriptor-bind"
    || normalizedVariant === "shielded-jsconfuser-string"
    || normalizedVariant === "shielded-pref-bridge"
    || normalizedVariant === "shielded-surface-scrub"
    || normalizedVariant === "shielded-surface-scrub-wasm-digest";
}

function normalizePositiveInteger(value, fallback = 0) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

export function parsePackageProtectionSmokeArgs(argv = process.argv.slice(2)) {
  const options = {
    variant: null,
    channel: "stable",
    jsConfuserToolEntry: null,
    jsConfuserToolPath: null,
    repeats: 3,
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
        options.channel = String(argv[index + 1] || "").trim().toLowerCase() || "stable";
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
      case "--repeats":
        options.repeats = normalizePositiveInteger(argv[index + 1], 0);
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

  assertScript(Boolean(options.variant), "--variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest", {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(options.channel === "stable" || options.channel === "beta", "channel must be stable or beta", {
    category: "args",
    failedStage: "parse-args",
  });
  assertScript(options.repeats > 0, "--repeats must be a positive integer", {
    category: "args",
    failedStage: "parse-args",
  });

  return options;
}

function buildChannelEnv(channel, env = process.env) {
  const nextEnv = {
    ...env,
  };
  const stableBinary = String(env.ZOTERO_PLUGIN_ZOTERO_STABLE_BIN_PATH || "").trim();
  const betaBinary = String(env.ZOTERO_PLUGIN_ZOTERO_BETA_BIN_PATH || "").trim();

  if (channel === "stable" && stableBinary) {
    nextEnv.ZOTERO_PLUGIN_ZOTERO_BIN_PATH = stableBinary;
  } else if (channel === "beta" && betaBinary) {
    nextEnv.ZOTERO_PLUGIN_ZOTERO_BIN_PATH = betaBinary;
  }

  return nextEnv;
}

export function resolvePackageProtectionSmokePackageArgs(variant, options = {}) {
  const normalizedVariant = normalizeVariant(variant);
  assertScript(Boolean(normalizedVariant), "variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest", {
    category: "args",
    failedStage: "resolve-variant",
  });

  if (normalizedVariant === "plain") {
    return [];
  }
  if (normalizedVariant === "encrypted") {
    return ["--encrypt-bundle", "--skip-release-metadata"];
  }
  if (normalizedVariant === "shielded-descriptor-bind") {
    return ["--descriptor-bind", "--skip-release-metadata"];
  }
  if (normalizedVariant === "shielded-jsconfuser-string") {
    const args = ["--jsconfuser-string", "--skip-release-metadata"];
    if (options.jsConfuserToolPath) {
      args.push("--jsconfuser-tool-path", String(options.jsConfuserToolPath));
    }
    if (options.jsConfuserToolEntry) {
      args.push("--jsconfuser-tool-entry", String(options.jsConfuserToolEntry));
    }
    return args;
  }
  if (normalizedVariant === "shielded-pref-bridge") {
    return ["--pref-bridge", "--skip-release-metadata"];
  }
  if (normalizedVariant === "shielded-surface-scrub") {
    return ["--surface-scrub", "--skip-release-metadata"];
  }
  if (normalizedVariant === "shielded-surface-scrub-wasm-digest") {
    return ["--surface-scrub-wasm-digest", "--skip-release-metadata"];
  }
  return ["--shield-bundle", "--skip-release-metadata"];
}

function resolvePackageVariantOutputName(config, variant) {
  const normalizedVariant = normalizeVariant(variant);
  assertScript(Boolean(normalizedVariant), "variant must be one of plain|encrypted|shielded|shielded-descriptor-bind|shielded-jsconfuser-string|shielded-pref-bridge|shielded-surface-scrub|shielded-surface-scrub-wasm-digest", {
    category: "args",
    failedStage: "resolve-variant",
  });
  return normalizedVariant === "plain"
    ? `${config.addonRef}-${config.addonVersion}.xpi`
    : `${config.addonRef}-${config.addonVersion}-${normalizedVariant}.xpi`;
}

function formatLogTail(chunks, limit = 8) {
  return (Array.isArray(chunks) ? chunks : []).slice(-limit);
}

function buildRunMode(variant, channel) {
  return `package-protection-${variant}-${channel}`;
}

function toSafeTimestamp(dateLike = new Date()) {
  return new Date(dateLike).toISOString().replace(/[:.]/gu, "-");
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

function computeLongestBase64LiteralLength(sourceCode) {
  const source = String(sourceCode || "");
  const pattern = /['"]([A-Za-z0-9+/=]{32,})['"]/gu;
  let match = null;
  let longest = 0;

  while ((match = pattern.exec(source))) {
    longest = Math.max(longest, String(match[1] || "").length);
  }

  return longest;
}

export function buildProtectionAutomationScorecard({ sourceCode, variant, config }) {
  const source = String(sourceCode || "");
  const normalizedVariant = normalizeVariant(variant) || "plain";
  const leaks = [
    config?.addonRef,
    config?.addonVersion,
    "generatedAt",
    "sourceSHA256",
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => source.includes(value));
  const maxBase64LiteralLength = computeLongestBase64LiteralLength(source);
  const loaderOptions = isShieldedLikeVariant(normalizedVariant)
    ? buildShieldedObfuscationOptions({ stage: SHIELDED_LOADER_OBFUSCATION_STAGE })
    : null;
  const hostileRuntimeDisabled = !loaderOptions || (
    loaderOptions.selfDefending === false
    && loaderOptions.debugProtection === false
    && Number(loaderOptions.debugProtectionInterval || 0) === 0
    && loaderOptions.controlFlowFlattening === false
  );

  return {
    metadataLeakFree: leaks.length === 0,
    leakedMarkers: leaks,
    contiguousPayloadHidden: maxBase64LiteralLength < 512,
    maxBase64LiteralLength,
    plainModuleDefsHidden: !source.includes("__moduleDefs"),
    hostileRuntimeOptionsDisabled: hostileRuntimeDisabled,
    loaderOptions: loaderOptions
      ? {
        selfDefending: loaderOptions.selfDefending === true,
        debugProtection: loaderOptions.debugProtection === true,
        debugProtectionInterval: Number(loaderOptions.debugProtectionInterval || 0),
        controlFlowFlattening: loaderOptions.controlFlowFlattening === true,
      }
      : null,
  };
}

export function normalizeManualScorecardRating(value) {
  const normalized = String(value || "").trim();
  return MANUAL_SCORECARD_LEVEL_SET.has(normalized)
    ? normalized
    : null;
}

export function buildManualScorecard(overrides = {}) {
  const webcrackInitialResult = normalizeManualScorecardRating(overrides.webcrackInitialResult);
  const llmSinglePassResult = normalizeManualScorecardRating(overrides.llmSinglePassResult);
  const hasCompleteRatings = Boolean(webcrackInitialResult && llmSinglePassResult);
  const explicitStatus = String(overrides.status || "").trim().toLowerCase();
  const status = hasCompleteRatings && explicitStatus !== "pending"
    ? "completed"
    : "pending";
  const completedAt = status === "completed"
    ? String(overrides.completedAt || "").trim() || null
    : null;

  return {
    webcrackInitialResult,
    llmSinglePassResult,
    status,
    completedAt,
    allowedRatings: MANUAL_SCORECARD_LEVELS.slice(),
  };
}

export function normalizePackageProtectionSmokeReport(report = {}) {
  return {
    ...report,
    manualScorecard: buildManualScorecard(report.manualScorecard || {}),
  };
}

async function readPackageProtectionSummary({ rdp, config }) {
  const raw = await rdp.evaluateInChrome(`(() => {
    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    const summary = plugin?.api?.runtime?.getPackageProtectionSummary?.()
      || plugin?.api?.runAgentSelfCheck?.()?.packageProtection
      || null;
    return JSON.stringify(summary);
  })()`);

  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function readAgentSelfCheck({ rdp, config }) {
  const raw = await rdp.evaluateInChrome(`(() => {
    const plugin = Zotero[${JSON.stringify(config.instanceKey)}];
    const summary = plugin?.api?.runAgentSelfCheck?.() || null;
    return JSON.stringify(summary);
  })()`);

  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function readBase64SupportProbe({ rdp }) {
  const raw = await rdp.evaluateInChrome(`(() => JSON.stringify((() => {
    const typedArray = typeof Uint8Array === "function" ? Uint8Array : null;
    return {
      uint8ArrayAvailable: Boolean(typedArray),
      fromBase64Available: Boolean(typedArray && typeof typedArray.fromBase64 === "function"),
      setFromBase64Available: Boolean(
        typedArray
        && typedArray.prototype
        && typeof typedArray.prototype.setFromBase64 === "function"
      ),
    };
  })()))()`);
  return typeof raw === "string" ? JSON.parse(raw) : raw;
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

function normalizeHostBindingProbe({ packageProtection = null, selfCheck = null } = {}) {
  const hostBinding = packageProtection?.hostBinding && typeof packageProtection.hostBinding === "object"
    ? packageProtection.hostBinding
    : null;
  return {
    available: Boolean(
      hostBinding?.available === true
      || selfCheck?.hostBindingAvailable === true
    ),
    profileHashPresent: Boolean(
      (typeof hostBinding?.profileHash === "string" && hostBinding.profileHash.trim())
      || selfCheck?.hostBindingProfileHashPresent === true
    ),
    schemaBucket: typeof hostBinding?.schemaBucket === "string" && hostBinding.schemaBucket.trim()
      ? hostBinding.schemaBucket.trim()
      : (typeof selfCheck?.hostBindingSchemaBucket === "string" && selfCheck.hostBindingSchemaBucket.trim()
          ? selfCheck.hostBindingSchemaBucket.trim()
          : null),
    zoteroVersionBucket: typeof hostBinding?.zoteroVersionBucket === "string" && hostBinding.zoteroVersionBucket.trim()
      ? hostBinding.zoteroVersionBucket.trim()
      : (typeof selfCheck?.hostBindingZoteroVersionBucket === "string" && selfCheck.hostBindingZoteroVersionBucket.trim()
          ? selfCheck.hostBindingZoteroVersionBucket.trim()
          : null),
    profileBasenameBucket: typeof hostBinding?.profileBasenameBucket === "string" && hostBinding.profileBasenameBucket.trim()
      ? hostBinding.profileBasenameBucket.trim()
      : (typeof selfCheck?.hostBindingProfileBasenameBucket === "string" && selfCheck.hostBindingProfileBasenameBucket.trim()
          ? selfCheck.hostBindingProfileBasenameBucket.trim()
          : null),
    dataDirHashPresent: Boolean(
      (typeof hostBinding?.dataDirHash === "string" && hostBinding.dataDirHash.trim())
      || selfCheck?.hostBindingDataDirHashPresent === true
    ),
    dbAvailable: Boolean(
      hostBinding?.dbAvailable === true
      || selfCheck?.hostBindingDBAvailable === true
    ),
    noncePresent: Boolean(
      hostBinding?.noncePresent === true
      || selfCheck?.hostBindingNoncePresent === true
    ),
    nonceSource: typeof hostBinding?.nonceSource === "string" && hostBinding.nonceSource.trim()
      ? hostBinding.nonceSource.trim()
      : (typeof selfCheck?.hostBindingNonceSource === "string" && selfCheck.hostBindingNonceSource.trim()
          ? selfCheck.hostBindingNonceSource.trim()
          : "unavailable"),
    nonceHashPresent: Boolean(
      (typeof hostBinding?.nonceHash === "string" && hostBinding.nonceHash.trim())
      || selfCheck?.hostBindingNonceHashPresent === true
    ),
    collectionError: typeof hostBinding?.collectionError === "string" && hostBinding.collectionError.trim()
      ? hostBinding.collectionError.trim()
      : (typeof selfCheck?.hostBindingCollectionError === "string" && selfCheck.hostBindingCollectionError.trim()
          ? selfCheck.hostBindingCollectionError.trim()
          : null),
    storeError: typeof hostBinding?.storeError === "string" && hostBinding.storeError.trim()
      ? hostBinding.storeError.trim()
      : (typeof selfCheck?.hostBindingStoreError === "string" && selfCheck.hostBindingStoreError.trim()
          ? selfCheck.hostBindingStoreError.trim()
          : null),
  };
}

function normalizeCapabilityManifestProbe(selfCheck = null) {
  return {
    variant: typeof selfCheck?.capabilityManifestVariant === "string" && selfCheck.capabilityManifestVariant.trim()
      ? selfCheck.capabilityManifestVariant.trim()
      : "source",
    protectedView: Boolean(selfCheck?.capabilityManifestProtectedView),
    detailLevel: typeof selfCheck?.capabilityManifestDetailLevel === "string" && selfCheck.capabilityManifestDetailLevel.trim()
      ? selfCheck.capabilityManifestDetailLevel.trim()
      : "full",
    limitedMode: Boolean(selfCheck?.capabilityManifestLimitedMode),
    overlayAvailable: Boolean(selfCheck?.capabilityManifestOverlayAvailable),
    overlayApplied: Boolean(selfCheck?.capabilityManifestOverlayApplied),
    activationSatisfied: Boolean(selfCheck?.capabilityManifestActivationSatisfied),
    activationMissing: Array.isArray(selfCheck?.capabilityManifestActivationMissing)
      ? selfCheck.capabilityManifestActivationMissing.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
  };
}

async function readVariantArtifacts(projectRootPath, variant) {
  const { config, buildPath } = await readAddonRuntimeInfo(projectRootPath);
  const xpiPath = path.join(projectRootPath, "dist", resolvePackageVariantOutputName(config, variant));
  const bundlePath = path.join(buildPath, "content", "scripts", `${config.addonRef}.js`);
  const [xpiStats, bundleStats, bundleSource] = await Promise.all([
    fs.stat(xpiPath),
    fs.stat(bundlePath),
    fs.readFile(bundlePath, "utf-8"),
  ]);

  return {
    config,
    buildPath,
    xpi: {
      path: xpiPath,
      sizeBytes: Number(xpiStats.size || 0),
    },
    bundle: {
      path: bundlePath,
      sizeBytes: Number(bundleStats.size || 0),
      source: bundleSource,
    },
  };
}

async function runSingleSmokeIteration({
  channel,
  config,
  runnerConfig,
  variant,
  runIndex,
  xpi,
  bundle,
}) {
  const runStartedAt = Date.now();
  const mode = buildRunMode(variant, channel);
  const rdpPort = runnerConfig.rdpPort || await findFreePort().catch((error) => {
    throw wrapScriptError(error, {
      failedStage: "resolve-rdp-port",
      details: {
        variant,
        channel,
        runIndex,
      },
    });
  });
  const processLogs = [];
  const issues = [];
  let child = null;
  let rdp = null;

  try {
    await prepareRuntime({
      projectRoot,
      profilePath: runnerConfig.profilePath,
      dataDir: runnerConfig.dataDir,
      fresh: true,
    });

    const args = buildStartupArgs({
      profilePath: runnerConfig.profilePath,
      dataDir: runnerConfig.dataDir,
      rdpPort,
      devtools: false,
    });

    child = spawn(runnerConfig.binaryPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => {
      String(chunk).split(/\r?\n/gu).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) {
          processLogs.push(`[stdout] ${trimmed}`);
        }
      });
    });
    child.stderr?.on("data", (chunk) => {
      String(chunk).split(/\r?\n/gu).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) {
          processLogs.push(`[stderr] ${trimmed}`);
        }
      });
    });

    rdp = new RdpClient();
    await rdp.connect({ port: rdpPort });
    await installRuntimeLogBridge(rdp);
    await clearCapturedLogs(rdp);

    const installResult = await rdp.installAddonFromFile(xpi.path);
    if (installResult?.ok !== true) {
      issues.push(`XPI 安装未完成：${installResult?.state || "unknown"}${installResult?.error ? ` / ${installResult.error}` : ""}`);
    }

    const observedAddon = await rdp.waitForAddonById(config.addonId, {
      timeoutMs: 15000,
      pollIntervalMs: 250,
    }).catch(() => null);
    if (!observedAddon) {
      issues.push(`未在 Zotero 插件列表中观测到 ${config.addonId}。`);
    }

    const readiness = observedAddon
      ? await ensurePluginReady({ rdp, config }).catch((error) => {
        issues.push(error?.message || String(error));
        return null;
      })
      : null;
    const apiReady = Boolean(readiness && (readiness.mode === "native" || readiness.mode === "plugins-init" || readiness.mode === "manual"));
    const base64Support = await readBase64SupportProbe({ rdp }).catch(() => ({
      uint8ArrayAvailable: false,
      fromBase64Available: false,
      setFromBase64Available: false,
    }));
    const selfCheck = readiness
      ? await readAgentSelfCheck({ rdp, config }).catch(() => null)
      : null;
    const packageProtection = readiness
      ? await readPackageProtectionSummary({ rdp, config }).catch(() => null)
      : null;
    const hostBinding = normalizeHostBindingProbe({ packageProtection, selfCheck });
    const capabilityManifest = normalizeCapabilityManifestProbe(selfCheck);
    const runtimeLogs = await readCapturedLogs(rdp).catch(() => null);
    const runtimeErrorSummary = classifyReleaseInstallSmokeRuntimeErrors(runtimeLogs, processLogs);
    const expectedProtectionActive = variant !== "plain";
    const actualProtectionActive = packageProtection?.active === true;
    const protectionVariant = typeof packageProtection?.variant === "string" ? packageProtection.variant : null;

    if (readiness?.mode !== "native") {
      issues.push(`readiness 未进入 native：${readiness?.mode || "missing"}`);
    }
    if (runtimeErrorSummary.blockingRuntimeErrorCount > 0) {
      issues.push(
        `运行时日志存在 ${runtimeErrorSummary.blockingRuntimeErrorCount} 条阻断型 error：${formatReleaseRuntimeErrorPortrait(runtimeErrorSummary.blockingRuntimeErrors)}`,
      );
    }
    if (expectedProtectionActive && !actualProtectionActive) {
      issues.push(`受保护包未回读到 packageProtection.active=true：${variant}`);
    }
    if (!expectedProtectionActive && actualProtectionActive) {
      issues.push(`plain 包意外回读到 packageProtection.active=true`);
    }
    if (expectedProtectionActive && protectionVariant !== variant) {
      issues.push(`受保护包回读 variant 不匹配：expected=${variant} actual=${protectionVariant || "-"}`);
    }
    if (expectedProtectionActive && capabilityManifest.protectedView !== true) {
      issues.push(`受保护包未回读到 protected capability manifest：${variant}`);
    }
    if (variant === "shielded-descriptor-bind") {
      if (!hostBinding.profileHashPresent) {
        issues.push("descriptor-bind 未回读到 hostBinding.profileHash。");
      }
      if (!hostBinding.dbAvailable) {
        issues.push("descriptor-bind 未回读到 hostBinding.dbAvailable=true。");
      }
      if (!hostBinding.noncePresent) {
        issues.push("descriptor-bind 未回读到 hostBinding.noncePresent=true。");
      }
      if (!capabilityManifest.overlayAvailable) {
        issues.push("descriptor-bind 未回读到 capabilityManifest.overlayAvailable=true。");
      }
      if (!capabilityManifest.overlayApplied) {
        issues.push("descriptor-bind 未回读到 capabilityManifest.overlayApplied=true。");
      }
      if (!capabilityManifest.activationSatisfied) {
        issues.push(`descriptor-bind activation 未满足：${capabilityManifest.activationMissing.join(",") || "-"}`);
      }
      if (capabilityManifest.detailLevel !== "full") {
        issues.push(`descriptor-bind capability manifest detailLevel 异常：${capabilityManifest.detailLevel}`);
      }
    }

    const passed = issues.length === 0;
    return {
      generatedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - runStartedAt),
      runIndex,
      variant,
      channel,
      passed,
      status: passed ? "passed" : "failed",
      statusLabel: passed ? "通过" : "失败",
      xpi,
      bundle: {
        path: bundle.path,
        sizeBytes: bundle.sizeBytes,
      },
      installResult,
      observedAddon: observedAddon
        ? {
          id: observedAddon.id || null,
          name: observedAddon.name || null,
          version: observedAddon.version || null,
          temporarilyInstalled: observedAddon.temporarilyInstalled === true,
        }
        : null,
      readinessMode: readiness?.mode || null,
      apiReady,
      base64Support,
      packageProtection: packageProtection && typeof packageProtection === "object"
        ? {
          active: packageProtection.active === true,
          variant: typeof packageProtection.variant === "string" ? packageProtection.variant : null,
          decodeMethod: typeof packageProtection.decodeMethod === "string" ? packageProtection.decodeMethod : null,
          loadSubScriptDurationMs: Number(packageProtection.loadSubScriptDurationMs || 0),
          decodeDurationMs: Number(packageProtection.decodeDurationMs || 0),
          decryptDurationMs: Number(packageProtection.decryptDurationMs || 0),
          evalDurationMs: Number(packageProtection.evalDurationMs || 0),
          prepareDurationMs: Number(packageProtection.prepareDurationMs || 0),
          bootstrapResolveDurationMs: Number(packageProtection.bootstrapResolveDurationMs || 0),
          bootstrapCallCount: Number(packageProtection.bootstrapCallCount || 0),
        }
        : null,
      hostBinding,
      capabilityManifest,
      runtimeLogs,
      blockingRuntimeErrorCount: runtimeErrorSummary.blockingRuntimeErrorCount,
      hostNoiseErrorCount: runtimeErrorSummary.hostNoiseErrorCount,
      pluginRuntimeErrorCount: runtimeErrorSummary.pluginRuntimeErrorCount,
      resourceRuntimeErrorCount: runtimeErrorSummary.resourceRuntimeErrorCount,
      blockingRuntimeErrorPortrait: formatReleaseRuntimeErrorPortrait(runtimeErrorSummary.blockingRuntimeErrors),
      hostNoiseRuntimeErrorPortrait: formatReleaseRuntimeErrorPortrait(runtimeErrorSummary.hostNoiseRuntimeErrors),
      issues,
      processLogTail: formatLogTail(processLogs),
    };
  } finally {
    if (rdp) {
      rdp.disconnect();
    }
    await stopChildProcess(child);
  }
}

function buildInvocationSummary({ variant, channel, repeats, xpi, bundle, runs, automatedScorecard, manualScorecard }) {
  const runList = Array.isArray(runs) ? runs : [];
  const passedRunCount = runList.filter((run) => run?.passed === true).length;
  const failedRunCount = runList.length - passedRunCount;
  const expectedProtectionActive = variant !== "plain";
  const decodeDurations = runList.map((run) => Number(run?.packageProtection?.decodeDurationMs || 0));
  const prepareDurations = runList.map((run) => Number(run?.packageProtection?.prepareDurationMs || 0));
  const resolveDurations = runList.map((run) => Number(run?.packageProtection?.bootstrapResolveDurationMs || 0));
  const decodeMethods = countByString(runList.map((run) => run?.packageProtection?.decodeMethod || ""));
  const readinessModes = countByString(runList.map((run) => run?.readinessMode || ""));
  const capabilityManifestDetailLevels = countByString(
    runList.map((run) => run?.capabilityManifest?.detailLevel || ""),
  );
  const hostBindingNonceSources = countByString(
    runList.map((run) => run?.hostBinding?.nonceSource || ""),
  );
  const hostBindingAvailableCount = runList.filter((run) => run?.hostBinding?.available === true).length;
  const hostBindingDBAvailableCount = runList.filter((run) => run?.hostBinding?.dbAvailable === true).length;
  const hostBindingNoncePresentCount = runList.filter((run) => run?.hostBinding?.noncePresent === true).length;
  const capabilityManifestOverlayAvailableCount = runList.filter((run) => run?.capabilityManifest?.overlayAvailable === true).length;
  const capabilityManifestOverlayAppliedCount = runList.filter((run) => run?.capabilityManifest?.overlayApplied === true).length;
  const capabilityManifestActivationSatisfiedCount = runList.filter((run) => run?.capabilityManifest?.activationSatisfied === true).length;
  const status = failedRunCount === 0 ? "passed" : "failed";
  const automatedPassed = (
    automatedScorecard.metadataLeakFree
    && automatedScorecard.contiguousPayloadHidden
    && automatedScorecard.plainModuleDefsHidden
    && automatedScorecard.hostileRuntimeOptionsDisabled
  );

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    variant,
    channel,
    repeats,
    expectedProtectionActive,
    passed: failedRunCount === 0,
    status,
    statusLabel: status === "passed" ? "通过" : "失败",
    passedRunCount,
    failedRunCount,
    xpi,
    bundle: {
      path: bundle.path,
      sizeBytes: bundle.sizeBytes,
    },
    automatedScorecard: {
      ...automatedScorecard,
      passed: automatedPassed,
      status: automatedPassed ? "passed" : "attention",
    },
    manualScorecard: buildManualScorecard(manualScorecard),
    medianDecodeDurationMs: computeMedian(decodeDurations),
    medianPrepareDurationMs: computeMedian(prepareDurations),
    medianBootstrapResolveDurationMs: computeMedian(resolveDurations),
    decodeMethods,
    readinessModes,
    hostBindingAvailableCount,
    hostBindingDBAvailableCount,
    hostBindingNoncePresentCount,
    hostBindingNonceSources,
    capabilityManifestDetailLevels,
    capabilityManifestOverlayAvailableCount,
    capabilityManifestOverlayAppliedCount,
    capabilityManifestActivationSatisfiedCount,
    runs: runList,
    summary: failedRunCount === 0
      ? `共 ${runList.length} 次 run，全部满足 readiness=native 且无阻断型 runtime error。`
      : `共 ${runList.length} 次 run，失败 ${failedRunCount} 次；优先检查 readiness 与阻断型 runtime error。`,
  };
}

export function summarizePackageProtectionSmokeReport({
  variant,
  channel,
  repeats,
  xpi,
  bundle,
  runs,
  automatedScorecard,
  manualScorecard,
}) {
  return normalizePackageProtectionSmokeReport(buildInvocationSummary({
    variant,
    channel,
    repeats,
    xpi,
    bundle,
    runs,
    automatedScorecard,
    manualScorecard,
  }));
}

export function renderPackageProtectionSmokeMarkdown(report) {
  const normalizedReport = normalizePackageProtectionSmokeReport(report);
  const lines = [
    "# Package Protection Smoke",
    "",
    `- 生成时间: \`${normalizedReport.generatedAt}\``,
    `- 变体: \`${normalizedReport.variant}\``,
    `- 渠道: \`${normalizedReport.channel}\``,
    `- 状态: \`${normalizedReport.statusLabel}\``,
    `- Advisory: \`${normalizedReport.advisory ? "yes" : "no"}\``,
    `- 重复次数: \`${normalizedReport.repeats}\``,
    `- 通过次数: \`${normalizedReport.passedRunCount}/${normalizedReport.repeats}\``,
    `- XPI: \`${normalizedReport.xpi.path}\` (${formatBytes(normalizedReport.xpi.sizeBytes)})`,
    `- Bundle: \`${normalizedReport.bundle.path}\` (${formatBytes(normalizedReport.bundle.sizeBytes)})`,
    `- 中位 payload decode: \`${normalizedReport.medianDecodeDurationMs}ms\``,
    `- 中位 prepare total: \`${normalizedReport.medianPrepareDurationMs}ms\``,
    `- 中位 bootstrap resolve: \`${normalizedReport.medianBootstrapResolveDurationMs}ms\``,
    `- Decode 方法分布: \`${JSON.stringify(normalizedReport.decodeMethods)}\``,
    `- Readiness 分布: \`${JSON.stringify(normalizedReport.readinessModes)}\``,
    `- Host binding available: \`${normalizedReport.hostBindingAvailableCount}/${normalizedReport.repeats}\``,
    `- Host binding DB available: \`${normalizedReport.hostBindingDBAvailableCount}/${normalizedReport.repeats}\``,
    `- Host binding nonce present: \`${normalizedReport.hostBindingNoncePresentCount}/${normalizedReport.repeats}\``,
    `- Host binding nonce source 分布: \`${JSON.stringify(normalizedReport.hostBindingNonceSources)}\``,
    `- Capability manifest detailLevel 分布: \`${JSON.stringify(normalizedReport.capabilityManifestDetailLevels)}\``,
    `- Capability manifest overlay available: \`${normalizedReport.capabilityManifestOverlayAvailableCount}/${normalizedReport.repeats}\``,
    `- Capability manifest overlay applied: \`${normalizedReport.capabilityManifestOverlayAppliedCount}/${normalizedReport.repeats}\``,
    `- Capability manifest activation satisfied: \`${normalizedReport.capabilityManifestActivationSatisfiedCount}/${normalizedReport.repeats}\``,
    `- 摘要: ${normalizedReport.summary}`,
    "",
    "## 自动评分卡",
    "",
    `- Metadata 泄露: \`${normalizedReport.automatedScorecard.metadataLeakFree ? "通过" : "失败"}\``,
    `- 连续 payload literal: \`${normalizedReport.automatedScorecard.contiguousPayloadHidden ? "通过" : "失败"}\``,
    `- 最长 base64 literal: \`${normalizedReport.automatedScorecard.maxBase64LiteralLength}\``,
    `- __moduleDefs 明文: \`${normalizedReport.automatedScorecard.plainModuleDefsHidden ? "隐藏" : "暴露"}\``,
    `- loader hostile runtime 选项: \`${normalizedReport.automatedScorecard.hostileRuntimeOptionsDisabled ? "关闭" : "存在风险"}\``,
    "",
    "## 手工评分卡",
    "",
    `- 状态: \`${normalizedReport.manualScorecard.status}\``,
    `- webcrack 首轮结果: \`${normalizedReport.manualScorecard.webcrackInitialResult || "pending"}\``,
    `- LLM 单轮解读: \`${normalizedReport.manualScorecard.llmSinglePassResult || "pending"}\``,
    `- 完成时间: \`${normalizedReport.manualScorecard.completedAt || "-"}\``,
    `- 允许评级: \`${normalizedReport.manualScorecard.allowedRatings.join(" | ")}\``,
    "",
    "## Runs",
    "",
  ];

  normalizedReport.runs.forEach((run) => {
    lines.push(`### Run ${run.runIndex}`);
    lines.push("");
    lines.push(`- 状态: \`${run.statusLabel}\``);
    lines.push(`- readiness: \`${run.readinessMode || "-"}\``);
    lines.push(`- API 就绪: \`${run.apiReady ? "是" : "否"}\``);
    lines.push(`- 阻断错误: \`${run.blockingRuntimeErrorCount}\``);
    lines.push(`- 宿主噪声: \`${run.hostNoiseErrorCount}\``);
    lines.push(`- fromBase64: \`${run.base64Support?.fromBase64Available ? "yes" : "no"}\``);
    lines.push(`- setFromBase64: \`${run.base64Support?.setFromBase64Available ? "yes" : "no"}\``);
    lines.push(`- packageProtection variant: \`${run.packageProtection?.variant || "-"}\``);
    lines.push(`- packageProtection decodeMethod: \`${run.packageProtection?.decodeMethod || "-"}\``);
    lines.push(`- packageProtection decode: \`${run.packageProtection?.decodeDurationMs ?? 0}ms\``);
    lines.push(`- packageProtection prepare: \`${run.packageProtection?.prepareDurationMs ?? 0}ms\``);
    lines.push(`- hostBinding available: \`${run.hostBinding?.available ? "yes" : "no"}\``);
    lines.push(`- hostBinding profileHash: \`${run.hostBinding?.profileHashPresent ? "yes" : "no"}\``);
    lines.push(`- hostBinding dbAvailable: \`${run.hostBinding?.dbAvailable ? "yes" : "no"}\``);
    lines.push(`- hostBinding noncePresent: \`${run.hostBinding?.noncePresent ? "yes" : "no"}\``);
    lines.push(`- hostBinding nonceSource: \`${run.hostBinding?.nonceSource || "-"}\``);
    lines.push(`- capabilityManifest variant: \`${run.capabilityManifest?.variant || "-"}\``);
    lines.push(`- capabilityManifest detailLevel: \`${run.capabilityManifest?.detailLevel || "-"}\``);
    lines.push(`- capabilityManifest overlayAvailable: \`${run.capabilityManifest?.overlayAvailable ? "yes" : "no"}\``);
    lines.push(`- capabilityManifest overlayApplied: \`${run.capabilityManifest?.overlayApplied ? "yes" : "no"}\``);
    lines.push(`- capabilityManifest activationSatisfied: \`${run.capabilityManifest?.activationSatisfied ? "yes" : "no"}\``);
    const activationMissing = Array.isArray(run.capabilityManifest?.activationMissing)
      ? run.capabilityManifest.activationMissing.join(",")
      : "";
    lines.push(`- capabilityManifest activationMissing: \`${activationMissing || "-"}\``);
    lines.push(`- issues: ${run.issues.length > 0 ? run.issues.join("；") : "-"}`);
    lines.push("");
  });

  return lines.join("\n");
}

export function renderPackageProtectionSmokeAggregateMarkdown(aggregate = {}) {
  const reports = (Array.isArray(aggregate.reports) ? aggregate.reports : [])
    .map((report) => normalizePackageProtectionSmokeReport(report));
  const lines = [
    "# Package Protection Smoke Aggregate",
    "",
    `- 生成时间: \`${aggregate.generatedAt || "-"}\``,
    `- 报告数: \`${reports.length}\``,
    "",
    "## Reports",
    "",
  ];

  reports.forEach((report) => {
    lines.push(`- \`${report.variant}/${report.channel}\`: smoke=\`${report.status}\` automated=\`${report.automatedScorecard?.status || "missing"}\` manual=\`${report.manualScorecard?.status || "pending"}\``);
    lines.push(`  - 摘要: ${report.summary}`);
  });

  if (reports.length === 0) {
    lines.push("- 当前没有 package protection smoke 报告");
  }

  return lines.join("\n");
}

export async function persistPackageProtectionSmokeReport(report, options = {}) {
  const projectRootPath = path.resolve(options.projectRootPath || projectRoot);
  const normalizedReport = normalizePackageProtectionSmokeReport(report);
  const archiveDir = resolveAgentArtifactPath(projectRootPath, "package-protection-smoke");
  const runsDir = path.join(archiveDir, "runs");
  const reportPath = path.join(archiveDir, `${normalizedReport.variant}-${normalizedReport.channel}.json`);
  const reportMDPath = path.join(archiveDir, `${normalizedReport.variant}-${normalizedReport.channel}.md`);
  const aggregatePath = resolveAgentArtifactPath(projectRootPath, "package-protection-smoke.json");
  const aggregateMDPath = resolveAgentArtifactPath(projectRootPath, "package-protection-smoke.md");
  const existingAggregate = await fs.readFile(aggregatePath, "utf-8")
    .then((content) => JSON.parse(content))
    .catch((error) => {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    });
  const previousReports = Array.isArray(existingAggregate?.reports)
    ? existingAggregate.reports
      .map((item) => normalizePackageProtectionSmokeReport(item))
      .filter((item) => `${item?.variant || ""}::${item?.channel || ""}` !== `${normalizedReport.variant}::${normalizedReport.channel}`)
    : [];
  const aggregate = {
    generatedAt: new Date().toISOString(),
    reports: [normalizedReport, ...previousReports]
      .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || ""))),
  };

  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  await fs.mkdir(archiveDir, { recursive: true });
  await fs.mkdir(runsDir, { recursive: true });

  await Promise.all([
    fs.writeFile(reportPath, `${JSON.stringify(normalizedReport, null, 2)}\n`, "utf-8"),
    fs.writeFile(reportMDPath, `${renderPackageProtectionSmokeMarkdown(normalizedReport)}\n`, "utf-8"),
    fs.writeFile(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf-8"),
    fs.writeFile(aggregateMDPath, `${renderPackageProtectionSmokeAggregateMarkdown(aggregate)}\n`, "utf-8"),
    ...(Array.isArray(normalizedReport.runs) ? normalizedReport.runs : []).map((run) => fs.writeFile(
      path.join(runsDir, `${toSafeTimestamp(run.generatedAt)}-${normalizedReport.variant}-${normalizedReport.channel}-run-${run.runIndex}.json`),
      `${JSON.stringify(run, null, 2)}\n`,
      "utf-8",
    )),
  ]);

  return {
    reportPath,
    reportMDPath,
    aggregatePath,
    aggregateMDPath,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePackageProtectionSmokeArgs(argv);
  await withPackageProtectionWorkflowLock("package-protection-smoke.mjs", async () => {
    const channelEnv = buildChannelEnv(options.channel, {
      ...process.env,
      ...(options.jsConfuserToolPath
        ? { CLEANROOM_PACKAGE_JSCONFUSER_TOOL_PATH: options.jsConfuserToolPath }
        : {}),
      ...(options.jsConfuserToolEntry
        ? { CLEANROOM_PACKAGE_JSCONFUSER_TOOL_ENTRY: options.jsConfuserToolEntry }
        : {}),
    });

    packageVariant(projectRoot, options.variant, channelEnv);
    const artifacts = await readVariantArtifacts(projectRoot, options.variant);
    const automatedScorecard = buildProtectionAutomationScorecard({
      sourceCode: artifacts.bundle.source,
      variant: options.variant,
      config: artifacts.config,
    });
    const runnerConfig = await readRunnerConfig({
      projectRoot,
      mode: buildRunMode(options.variant, options.channel),
      env: channelEnv,
    });

    const runs = [];
    for (let runIndex = 1; runIndex <= options.repeats; runIndex += 1) {
      runs.push(await runSingleSmokeIteration({
        channel: options.channel,
        config: artifacts.config,
        runnerConfig,
        variant: options.variant,
        runIndex,
        xpi: artifacts.xpi,
        bundle: artifacts.bundle,
      }));
    }

    const report = summarizePackageProtectionSmokeReport({
      variant: options.variant,
      channel: options.channel,
      repeats: options.repeats,
      xpi: artifacts.xpi,
      bundle: artifacts.bundle,
      runs,
      automatedScorecard,
    });
    const paths = await persistPackageProtectionSmokeReport(report);

    console.log(`Package protection smoke generated: ${paths.reportPath}`);
    if (!report.passed) {
      process.exitCode = 2;
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
