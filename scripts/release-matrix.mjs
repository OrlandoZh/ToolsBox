import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAgentArtifactPath, resolveAgentArtifactsDir } from "./agent-artifacts.mjs";
import {
  buildReleaseMatrixSummary,
  renderReleaseMatrixMarkdown,
} from "./release-matrix-lib.mjs";
import {
  buildScriptFailureInfo,
  createScriptError,
  resolvePathOption,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function parseArgs(argv) {
  const options = {
    projectRoot: defaultProjectRoot,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/release-matrix.mjs [--project-root <path>]");
      process.exit(0);
    }
    if (arg === "--project-root") {
      options.projectRoot = resolvePathOption(argv[index + 1], {
        name: "project-root",
        baseDir: defaultProjectRoot,
      });
      index += 1;
      continue;
    }
    throw createScriptError("args", `Unknown option: ${arg}`, {
      failedStage: "parse-args",
    });
  }

  return options;
}

function resolveFailureProjectRoot(argv = process.argv.slice(2)) {
  const index = argv.indexOf("--project-root");
  if (index === -1) {
    return defaultProjectRoot;
  }
  const candidate = String(argv[index + 1] || "").trim();
  return candidate
    ? path.resolve(defaultProjectRoot, candidate)
    : defaultProjectRoot;
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

async function readHashIfExists(filePath) {
  return await fs.readFile(filePath)
    .then((content) => createHash("sha256").update(content).digest("hex"))
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });
}

async function readSizeIfExists(filePath) {
  return await fs.stat(filePath)
    .then((stats) => Number(stats.size || 0))
    .catch((error) => {
      if (error && error.code === "ENOENT") {
        return 0;
      }
      throw error;
    });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = options.projectRoot;
  const artifactsDir = resolveAgentArtifactsDir(projectRoot);
  const configPath = path.join(projectRoot, "config", "addon.config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
  const xpiName = `${config.addonRef}-${config.addonVersion}.xpi`;
  const xpiPath = path.join(projectRoot, "dist", xpiName);

  const [buildReport, releaseManifest, updateManifest, preflightReport, releasePlan, installSmokeReport, xpiSHA256Actual, xpiSizeBytesActual] = await Promise.all([
    readJSONIfExists(path.join(projectRoot, "build", config.addonRef, "build-report.json")),
    readJSONIfExists(path.join(projectRoot, "dist", "release-manifest.json")),
    readJSONIfExists(path.join(projectRoot, "dist", "update.json")),
    readJSONIfExists(path.join(projectRoot, "dist", "release-preflight.json")),
    readJSONIfExists(path.join(projectRoot, "dist", "release-plan.json")),
    readJSONIfExists(resolveAgentArtifactPath(projectRoot, "release-install-smoke.json")),
    readHashIfExists(xpiPath),
    readSizeIfExists(xpiPath),
  ]);

  const summary = buildReleaseMatrixSummary({
    config,
    buildReport,
    releaseManifest,
    updateManifest,
    preflightReport,
    installSmokeReport,
    remoteVerification: releasePlan?.remoteVerification || preflightReport?.remoteVerification || null,
    xpiName,
    xpiPath,
    xpiExists: Boolean(xpiSHA256Actual),
    xpiSHA256Actual,
    xpiSizeBytesActual,
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  summary.errorCategory = null;
  summary.errorCategoryLabel = null;
  summary.errorMessage = null;
  summary.failedStage = null;

  const outJSON = resolveAgentArtifactPath(projectRoot, "release-matrix.json");
  const outMD = resolveAgentArtifactPath(projectRoot, "release-matrix.md");
  await fs.mkdir(artifactsDir, { recursive: true });
  await Promise.all([
    writeJSONArtifact(outJSON, summary),
    fs.writeFile(outMD, `${renderReleaseMatrixMarkdown(summary)}\n`, "utf-8"),
  ]);

  console.log(`Release matrix generated: ${outJSON}`);
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  const failureProjectRoot = resolveFailureProjectRoot();
  const outJSON = resolveAgentArtifactPath(failureProjectRoot, "release-matrix.json");
  const outMD = resolveAgentArtifactPath(failureProjectRoot, "release-matrix.md");
  const failureSummary = {
    generatedAt: new Date().toISOString(),
    status: "failed",
    statusLabel: "失败",
    profiles: [],
    passedProfileCount: 0,
    failedProfileCount: 0,
    attentionProfileCount: 0,
    durationMs: failureInfo.durationMs,
    ...failureInfo,
  };
  try {
    await fs.mkdir(resolveAgentArtifactsDir(failureProjectRoot), { recursive: true });
    await writeJSONArtifact(outJSON, failureSummary);
    await fs.writeFile(outMD, [
      "# Release Matrix",
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
