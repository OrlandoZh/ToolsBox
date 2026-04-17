import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withBuildLock } from "./build-lock.mjs";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  assertNonEmptyString,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
} from "./script-runtime-lib.mjs";
import { ensureJSConfuserToolReady } from "./package-protection-jsconfuser-preflight.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();
export const DEFAULT_JSCONFUSER_VERSION = "2.0.1";
export const PACKAGE_JSCONFUSER_BOOTSTRAP_DIR_ENV = "CLEANROOM_PACKAGE_JSCONFUSER_BOOTSTRAP_DIR";
const DEFAULT_INSTALL_ATTEMPTS = 2;

function truncateOutput(value, maxChars = 1200) {
  const text = String(value || "");
  return text.length > maxChars
    ? `${text.slice(0, maxChars)}\n...[truncated]`
    : text;
}

function resolveNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function tryReadReadyJSConfuserTool(toolPath) {
  try {
    return await ensureJSConfuserToolReady(toolPath);
  } catch {
    return null;
  }
}

export function parsePackageProtectionJSConfuserBootstrapArgs(argv = process.argv.slice(2)) {
  const options = {
    installDir: null,
    version: DEFAULT_JSCONFUSER_VERSION,
    force: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (!token) {
      continue;
    }

    switch (token) {
      case "--dir":
      case "--install-dir":
        options.installDir = String(argv[index + 1] || "").trim() || null;
        index += 1;
        break;
      case "--version":
        options.version = String(argv[index + 1] || "").trim() || "";
        index += 1;
        break;
      case "--force":
        options.force = true;
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

  options.version = assertNonEmptyString(options.version, "--version", {
    category: "args",
    failedStage: "parse-args",
  });

  return options;
}

export function resolvePackageProtectionJSConfuserBootstrapPaths(
  projectRootPath = projectRoot,
  options = {},
  env = process.env,
) {
  const installRoot = path.resolve(
    String(
      options.installDir
      || env?.[PACKAGE_JSCONFUSER_BOOTSTRAP_DIR_ENV]
      || resolveAgentArtifactPath(projectRootPath, "package-protection-tools", "js-confuser"),
    ).trim(),
  );
  const toolPath = path.join(installRoot, "node_modules", "js-confuser");

  return {
    installRoot,
    toolPath,
    reportPath: resolveAgentArtifactPath(projectRootPath, "package-protection-jsconfuser-bootstrap.json"),
    reportMDPath: resolveAgentArtifactPath(projectRootPath, "package-protection-jsconfuser-bootstrap.md"),
  };
}

export function buildPackageProtectionJSConfuserBootstrapInstallArgs({
  installRoot,
  version = DEFAULT_JSCONFUSER_VERSION,
} = {}) {
  return [
    "install",
    "--prefix",
    path.resolve(String(installRoot || "")),
    `js-confuser@${String(version || "").trim()}`,
    "--no-save",
    "--no-audit",
    "--no-fund",
    "--loglevel",
    "error",
  ];
}

export function renderPackageProtectionJSConfuserBootstrapMarkdown(report = {}) {
  const lines = [
    "# Package Protection JS-Confuser Bootstrap",
    "",
    `- status: ${report.status || "-"}`,
    `- installAction: ${report.installAction || "-"}`,
    `- installAttemptCount: ${report.installAttemptCount ?? "-"}`,
    `- requestedVersion: ${report.requestedVersion || "-"}`,
    `- resolvedVersion: ${report.resolvedVersion || "-"}`,
    `- installRoot: ${report.installRoot || "-"}`,
    `- toolPath: ${report.toolPath || "-"}`,
    `- entryRelativePath: ${report.entryRelativePath || "-"}`,
    `- npmCommand: ${report.npmCommand || "-"}`,
    `- force: ${report.force ? "true" : "false"}`,
    `- summary: ${report.summary || "-"}`,
  ];

  if (report.installCommand) {
    lines.push("", "```bash", report.installCommand, "```");
  }

  return `${lines.join("\n")}\n`;
}

export async function bootstrapPackageProtectionJSConfuser({
  projectRootPath = projectRoot,
  installDir = null,
  version = DEFAULT_JSCONFUSER_VERSION,
  force = false,
  env = process.env,
  spawnSyncImpl = spawnSync,
} = {}) {
  const paths = resolvePackageProtectionJSConfuserBootstrapPaths(projectRootPath, { installDir }, env);
  const requestedVersion = assertNonEmptyString(version, "js-confuser version", {
    category: "args",
    failedStage: "bootstrap-jsconfuser",
  });
  const npmCommand = resolveNpmCommand();
  const installArgs = buildPackageProtectionJSConfuserBootstrapInstallArgs({
    installRoot: paths.installRoot,
    version: requestedVersion,
  });

  const existingInfo = force ? null : await tryReadReadyJSConfuserTool(paths.toolPath);
  const existingVersion = String(existingInfo?.packageJSON?.version || "").trim() || null;
  if (existingInfo && existingVersion === requestedVersion) {
    return {
      generatedAt: new Date().toISOString(),
      advisory: true,
      status: "passed",
      installAction: "reused",
      requestedVersion,
      resolvedVersion: existingVersion,
      installRoot: paths.installRoot,
      toolPath: existingInfo.toolPath,
      entryPath: existingInfo.entryPath,
      entryRelativePath: existingInfo.entryRelativePath,
      npmCommand,
      installArgs,
      installCommand: `${npmCommand} ${installArgs.join(" ")}`,
      installAttemptCount: 0,
      force,
      summary: `已复用现有 js-confuser ${existingVersion}。`,
      stdout: "",
      stderr: "",
    };
  }

  await fs.mkdir(resolveAgentArtifactsDir(projectRootPath), { recursive: true });
  if (force) {
    await fs.rm(paths.installRoot, { recursive: true, force: true });
  }
  await fs.mkdir(paths.installRoot, { recursive: true });

  let result = null;
  let installAttemptCount = 0;
  for (let attempt = 1; attempt <= DEFAULT_INSTALL_ATTEMPTS; attempt += 1) {
    installAttemptCount = attempt;
    result = spawnSyncImpl(npmCommand, installArgs, {
      cwd: projectRootPath,
      env: {
        ...process.env,
        ...env,
      },
      encoding: "utf-8",
      stdio: "pipe",
    });

    if (result.error) {
      throw createScriptError(result.error.code === "ENOENT" ? "environment" : "execution", result.error.message || String(result.error), {
        failedStage: "install-jsconfuser",
        details: {
          npmCommand,
          installRoot: paths.installRoot,
        },
        cause: result.error,
      });
    }

    if (result.status === 0) {
      break;
    }

    if (attempt >= DEFAULT_INSTALL_ATTEMPTS) {
      throw createScriptError("execution", `npm install exited with code ${result.status ?? 1}`, {
        failedStage: "install-jsconfuser",
        details: {
          npmCommand,
          installRoot: paths.installRoot,
          exitCode: result.status ?? 1,
          stderr: truncateOutput(result.stderr),
          installAttemptCount,
        },
      });
    }
  }

  const readyInfo = await ensureJSConfuserToolReady(paths.toolPath);
  const resolvedVersion = String(readyInfo?.packageJSON?.version || requestedVersion).trim() || requestedVersion;

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    status: "passed",
    installAction: "installed",
    requestedVersion,
    resolvedVersion,
    installRoot: paths.installRoot,
    toolPath: readyInfo.toolPath,
    entryPath: readyInfo.entryPath,
    entryRelativePath: readyInfo.entryRelativePath,
    npmCommand,
    installArgs,
    installCommand: `${npmCommand} ${installArgs.join(" ")}`,
    installAttemptCount,
    force,
    summary: `已安装 js-confuser ${resolvedVersion}，后续 package protection 命令可直接自动发现。`,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

export async function main(argv = process.argv.slice(2)) {
  await withBuildLock("package-protection-jsconfuser-bootstrap.mjs", async () => {
    const options = parsePackageProtectionJSConfuserBootstrapArgs(argv);
    const report = await bootstrapPackageProtectionJSConfuser({
      projectRootPath: projectRoot,
      installDir: options.installDir,
      version: options.version,
      force: options.force,
    });
    const paths = resolvePackageProtectionJSConfuserBootstrapPaths(projectRoot, options);

    await fs.writeFile(paths.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
    await fs.writeFile(paths.reportMDPath, renderPackageProtectionJSConfuserBootstrapMarkdown(report), "utf-8");

    console.log(`Package protection js-confuser bootstrap generated: ${paths.reportPath}`);
    console.log(`Install action: ${report.installAction}`);
    console.log(`Tool path: ${report.toolPath}`);
    console.log(`Entry: ${report.entryRelativePath}`);
  });
}

if (isExecutedAsScript(import.meta.url)) {
  main().catch((error) => {
    const failure = buildScriptFailureInfo(error, {
      failedStage: error?.failedStage || "package-protection-jsconfuser-bootstrap",
      durationMs: Date.now() - scriptStartedAt,
    });
    const label = failure.errorCategoryLabel || "未知错误";
    console.error(`${label}: ${failure.errorMessage}`);
    process.exitCode = 1;
  });
}
