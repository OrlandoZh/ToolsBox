import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  RdpClient,
  buildStartupArgs,
  findFreePort,
  packageAddon,
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
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  wrapScriptError,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function parseArgs(argv) {
  const options = {
    channel: "stable",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--channel") {
      options.channel = String(argv[index + 1] || "").trim() || "stable";
      index += 1;
      continue;
    }
    throw createScriptError("args", `Unknown option: ${arg}`, {
      failedStage: "parse-args",
    });
  }

  assertScript(["stable", "beta"].includes(options.channel), "channel must be stable or beta", {
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

function formatLogTail(chunks, limit = 8) {
  return chunks.slice(-limit);
}

function pickChannelFromArgs(argv) {
  const index = argv.indexOf("--channel");
  const candidate = index >= 0 ? String(argv[index + 1] || "").trim() : "";
  return candidate || "stable";
}

function assert(condition, message, options = {}) {
  assertScript(condition, message, {
    category: options.category || "validation",
    failedStage: options.failedStage || "validation",
  });
}

async function readJSONIfExists(filePath) {
  return await fs.readFile(filePath, "utf-8")
    .then((content) => JSON.parse(content))
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
}

async function readJSON(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

async function readHash(filePath) {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function refreshReleasePreflight(projectRoot) {
  const configPath = path.join(projectRoot, "config", "addon.config.json");
  const config = await readJSON(configPath);
  const buildReportPath = path.join(projectRoot, "build", config.addonRef, "build-report.json");
  const releaseManifestPath = path.join(projectRoot, "dist", "release-manifest.json");
  const updateManifestPath = path.join(projectRoot, "dist", "update.json");
  const xpiPath = path.join(projectRoot, "dist", `${config.addonRef}-${config.addonVersion}.xpi`);

  const [buildReport, releaseManifest, updateManifest, xpiStats, xpiSHA256] = await Promise.all([
    readJSON(buildReportPath),
    readJSON(releaseManifestPath),
    readJSON(updateManifestPath),
    fs.stat(xpiPath),
    readHash(xpiPath),
  ]);

  assert(buildReport.addonRef === config.addonRef, "Build report addonRef mismatch");
  assert(buildReport.addonVersion === config.addonVersion, "Build report addonVersion mismatch");
  assert(releaseManifest.addonId === config.addonId, "release-manifest addonId mismatch");
  assert(releaseManifest.addonRef === config.addonRef, "release-manifest addonRef mismatch");
  assert(releaseManifest.addonVersion === config.addonVersion, "release-manifest addonVersion mismatch");
  assert(releaseManifest.xpiName === path.basename(xpiPath), "release-manifest xpiName mismatch");
  assert(path.resolve(releaseManifest.xpiPath) === xpiPath, "release-manifest xpiPath mismatch");

  const updateEntry = updateManifest.addons?.[config.addonId]?.updates?.[0];
  assert(updateEntry, `update.json missing first update entry for addon: ${config.addonId}`);
  assert(updateEntry.version === config.addonVersion, "update.json version mismatch");
  assert(updateEntry.update_link === releaseManifest.updateLink, "update.json update_link mismatch");
  assert(updateEntry.applications?.zotero?.strict_min_version === config.strictMinVersion, "update.json strict_min_version mismatch");
  assert(updateEntry.applications?.zotero?.strict_max_version === config.strictMaxVersion, "update.json strict_max_version mismatch");
  assert(releaseManifest.updateURL === config.updateURL, "release-manifest updateURL mismatch");
  assert(Number(xpiStats.size || 0) > 0, "XPI package is empty");

  const preflightReport = {
    generatedAt: new Date().toISOString(),
    addonId: config.addonId,
    addonVersion: config.addonVersion,
    xpiName: path.basename(xpiPath),
    xpiSizeBytes: Number(xpiStats.size || 0),
    xpiSHA256,
    updateLink: releaseManifest.updateLink,
    strictMinVersion: config.strictMinVersion,
    strictMaxVersion: config.strictMaxVersion,
  };

  const preflightPath = path.join(projectRoot, "dist", "release-preflight.json");
  await fs.writeFile(preflightPath, `${JSON.stringify(preflightReport, null, 2)}\n`, "utf-8");
  return preflightPath;
}

function renderMarkdown(report) {
  const lines = [
    "# 发布安装态 Smoke",
    "",
    `- 生成时间: \`${report.generatedAt}\``,
    `- 渠道: \`${report.channel}\``,
    `- 结果: \`${report.statusLabel}\``,
    `- 安装方式: \`${report.installMethod || "-"}\``,
    `- readiness: \`${report.readinessMode || "-"}\``,
    `- Add-on: \`${report.addonId}\` / \`${report.addonVersion}\``,
    `- XPI: \`${report.xpiPath}\``,
    `- 二进制: \`${report.binaryPath}\``,
    `- Profile: \`${report.profilePath}\``,
    `- DataDir: \`${report.dataDir}\``,
    `- 摘要: ${report.note || "-"}`,
    "",
  ];

  if (report.errorCategoryLabel || report.failedStage) {
    lines.push("## 脚本失败画像", "");
    lines.push(`- 分类: \`${report.errorCategoryLabel || report.errorCategory || "-"}\``);
    lines.push(`- 阶段: \`${report.failedStage || "-"}\``);
    lines.push(`- 信息: ${report.errorMessage || "-"}`, "");
  }

  if (Array.isArray(report.issues) && report.issues.length > 0) {
    lines.push("## 问题", "");
    report.issues.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  lines.push(
    "## 观测",
    "",
    `- 安装结果: \`${report.installResult?.state || "-"}\``,
    `- 安装返回 Add-on ID: \`${report.installResult?.addonId || "-"}\``,
    `- 观测到 Add-on: \`${report.observedAddon?.id || "-"}\``,
    `- 观测到版本: \`${report.observedAddon?.version || "-"}\``,
    `- 是否激活: \`${report.observedAddon?.temporarilyInstalled === true ? "临时安装" : "正式安装"}\``,
    `- API 就绪: \`${report.apiReady ? "是" : "否"}\``,
    `- 日志错误: \`${report.runtimeLogs?.errorCount ?? 0}\``,
    `- 日志警告: \`${report.runtimeLogs?.warnCount ?? 0}\``,
    `- 阻断型错误: \`${report.blockingRuntimeErrorCount ?? 0}\``,
    `- 宿主噪声: \`${report.hostNoiseErrorCount ?? 0}\``,
    `- 插件错误数: \`${report.pluginRuntimeErrorCount ?? 0}\``,
    `- 资源错误数: \`${report.resourceRuntimeErrorCount ?? 0}\``,
    "",
    "## 运行时错误画像",
    "",
    `- 阻断错误: ${report.blockingRuntimeErrorPortrait || "-"}`,
    `- 宿主噪声: ${report.hostNoiseRuntimeErrorPortrait || "-"}`,
    "",
    "## 日志尾部",
    "",
  );

  const tail = Array.isArray(report.processLogTail) ? report.processLogTail : [];
  if (tail.length === 0) {
    lines.push("- -");
  } else {
    tail.forEach((item) => lines.push(`- ${item}`));
  }
  lines.push("");
  return lines.join("\n");
}

async function persistAggregateReport(currentRun) {
  const aggregatePath = resolveAgentArtifactPath(projectRoot, "release-install-smoke.json");
  const aggregateMDPath = resolveAgentArtifactPath(projectRoot, "release-install-smoke.md");
  const perChannelPath = resolveAgentArtifactPath(projectRoot, `release-install-smoke-${currentRun.channel}.json`);
  const existing = await readJSONIfExists(aggregatePath);
  const previousRuns = Array.isArray(existing?.runs)
    ? existing.runs.filter((item) => String(item?.channel || "").trim() !== currentRun.channel)
    : [];
  const runs = [currentRun, ...previousRuns]
    .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
  const aggregate = {
    generatedAt: currentRun.generatedAt,
    runs,
  };

  await fs.mkdir(resolveAgentArtifactsDir(projectRoot), { recursive: true });
  await Promise.all([
    fs.writeFile(perChannelPath, `${JSON.stringify(currentRun, null, 2)}\n`, "utf-8"),
    fs.writeFile(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf-8"),
    fs.writeFile(aggregateMDPath, `${renderMarkdown(currentRun)}\n`, "utf-8"),
  ]);

  return {
    aggregatePath,
    perChannelPath,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const channelEnv = buildChannelEnv(options.channel);

  packageAddon(projectRoot, { env: channelEnv });
  await refreshReleasePreflight(projectRoot);

  const { config, xpiPath } = await readAddonRuntimeInfo(projectRoot);
  if (!xpiPath) {
    throw new Error("Missing packaged XPI. Run `npm run package` first.");
  }

  const mode = `release-install-${options.channel}`;
  const runnerConfig = await readRunnerConfig({
    projectRoot,
    mode,
    env: channelEnv,
  });
  const rdpPort = runnerConfig.rdpPort || await findFreePort().catch((error) => {
    throw wrapScriptError(error, {
      failedStage: "resolve-rdp-port",
    });
  });
  const processLogs = [];
  let child = null;
  let rdp = null;
  const issues = [];

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
      String(chunk).split(/\r?\n/u).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) {
          processLogs.push(`[stdout] ${trimmed}`);
        }
      });
    });
    child.stderr?.on("data", (chunk) => {
      String(chunk).split(/\r?\n/u).forEach((line) => {
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

    const installResult = await rdp.installAddonFromFile(xpiPath);
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
    const apiReady = Boolean(
      readiness
      && (readiness.mode === "native" || readiness.mode === "plugins-init" || readiness.mode === "manual"),
    );

    if (readiness?.mode !== "native") {
      issues.push(`正式安装态未进入原生生命周期，当前 readiness 为 ${readiness?.mode || "missing"}。`);
    }

    const runtimeLogs = await readCapturedLogs(rdp).catch(() => null);
    const runtimeErrorSummary = classifyReleaseInstallSmokeRuntimeErrors(runtimeLogs, processLogs);
    if (runtimeErrorSummary.blockingRuntimeErrorCount > 0) {
      issues.push(
        `运行时日志存在 ${runtimeErrorSummary.blockingRuntimeErrorCount} 条阻断型 error：${formatReleaseRuntimeErrorPortrait(runtimeErrorSummary.blockingRuntimeErrors)}`,
      );
    }
    const blockingRuntimeErrorPortrait = formatReleaseRuntimeErrorPortrait(
      runtimeErrorSummary.blockingRuntimeErrors,
    );
    const hostNoiseRuntimeErrorPortrait = formatReleaseRuntimeErrorPortrait(
      runtimeErrorSummary.hostNoiseRuntimeErrors,
    );
    const passed = issues.length === 0;
    const note = passed
      ? (
        runtimeErrorSummary.hostNoiseErrorCount > 0
          ? `打包产物已通过正式安装态 smoke，并直接进入原生生命周期；${runtimeErrorSummary.hostNoiseErrorCount} 条 error 已归类为宿主噪声，不阻断发布。`
          : "打包产物已通过正式安装态 smoke，并直接进入原生生命周期。"
      )
      : (
        runtimeErrorSummary.blockingRuntimeErrorCount > 0
          ? "正式安装态 smoke 存在阻断型运行时错误，请先处理插件资源、生命周期或脚本异常。"
          : "正式安装态 smoke 未通过，请先处理安装或原生生命周期问题。"
      );

    const report = {
      generatedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - scriptStartedAt),
      channel: options.channel,
      zoteroChannel: options.channel,
      passed,
      status: passed ? "passed" : "failed",
      statusLabel: passed ? "通过" : "失败",
      installMethod: "addon-manager-file",
      addonId: config.addonId,
      addonVersion: config.addonVersion,
      xpiPath,
      binaryPath: runnerConfig.binaryPath,
      profilePath: runnerConfig.profilePath,
      dataDir: runnerConfig.dataDir,
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
      runtimeLogs,
      runtimeErrorClasses: runtimeErrorSummary.runtimeErrorClasses,
      blockingRuntimeErrorCount: runtimeErrorSummary.blockingRuntimeErrorCount,
      hostNoiseErrorCount: runtimeErrorSummary.hostNoiseErrorCount,
      pluginRuntimeErrorCount: runtimeErrorSummary.pluginRuntimeErrorCount,
      resourceRuntimeErrorCount: runtimeErrorSummary.resourceRuntimeErrorCount,
      blockingRuntimeErrors: runtimeErrorSummary.blockingRuntimeErrors,
      hostNoiseRuntimeErrors: runtimeErrorSummary.hostNoiseRuntimeErrors,
      blockingRuntimeErrorPortrait,
      hostNoiseRuntimeErrorPortrait,
      issues,
      note,
      processLogTail: formatLogTail(processLogs),
    };
    if (!report.passed) {
      Object.assign(
        report,
        buildScriptFailureInfo(
          createScriptError("validation", report.issues?.[0] || report.note || "Release install smoke failed", {
            failedStage: "install-smoke-summary",
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

    const paths = await persistAggregateReport(report);
    console.log(`Release install smoke generated: ${paths.aggregatePath}`);
    if (!report.passed) {
      process.exitCode = 2;
    }
  } finally {
    if (rdp) {
      rdp.disconnect();
    }
    await stopChildProcess(child);
  }
}

main().catch(async (error) => {
  const channel = pickChannelFromArgs(process.argv.slice(2));
  const report = {
    generatedAt: new Date().toISOString(),
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
    channel,
    zoteroChannel: channel,
    passed: false,
    status: "failed",
    statusLabel: "失败",
    installMethod: "addon-manager-file",
    addonId: null,
    addonVersion: null,
    xpiPath: null,
    binaryPath: null,
    profilePath: null,
    dataDir: null,
    installResult: null,
    observedAddon: null,
    readinessMode: null,
    apiReady: false,
    runtimeLogs: null,
    runtimeErrorClasses: [],
    blockingRuntimeErrorCount: 0,
    hostNoiseErrorCount: 0,
    pluginRuntimeErrorCount: 0,
    resourceRuntimeErrorCount: 0,
    blockingRuntimeErrors: [],
    hostNoiseRuntimeErrors: [],
    blockingRuntimeErrorPortrait: "-",
    hostNoiseRuntimeErrorPortrait: "-",
    issues: [error?.message || String(error)],
    note: "正式安装态 smoke 执行异常。",
    processLogTail: [],
  };
  Object.assign(report, buildScriptFailureInfo(error, { durationMs: report.durationMs }));
  await persistAggregateReport(report);
  console.error(error?.message || String(error));
  process.exit(1);
});
