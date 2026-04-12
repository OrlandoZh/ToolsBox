import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runCleanroomAudit } from "./cleanroom-audit-lib.mjs";
import {
  buildPendingRemoteReleaseVerification,
  verifyRemoteRelease,
} from "./release-remote-verification-lib.mjs";
import {
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  parseIntegerOption,
  resolvePathOption,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultProjectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function assert(condition, message, options = {}) {
  assertScript(condition, message, {
    category: options.category || "validation",
    failedStage: options.failedStage || "validate-preflight",
    details: options.details,
  });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJSON(filePath) {
  const content = await fs.readFile(filePath, "utf-8")
    .catch((error) => {
      if (error?.code === "ENOENT") {
        throw createScriptError("environment", `Missing JSON file: ${filePath}`, {
          failedStage: "read-json",
          details: { filePath },
          cause: error,
        });
      }
      throw error;
    });
  try {
    return JSON.parse(content);
  } catch (error) {
    throw createScriptError("validation", `Invalid JSON file: ${filePath}`, {
      failedStage: "read-json",
      details: { filePath },
      cause: error,
    });
  }
}

async function readHash(filePath) {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function summarizeReport(report) {
  return {
    generatedAt: new Date().toISOString(),
    status: "passed",
    addonId: report.addonId,
    addonVersion: report.addonVersion,
    xpiName: report.xpiName,
    xpiSizeBytes: report.xpiSizeBytes,
    xpiSHA256: report.xpiSHA256,
    updateLink: report.updateLink,
    strictMinVersion: report.strictMinVersion,
    strictMaxVersion: report.strictMaxVersion,
    remoteVerification: report.remoteVerification || null,
    chinaLegalStatus: report.chinaLegal?.status || null,
    chinaCommercialDeliveryGateOK: report.chinaLegal?.deliveryGateOK ?? null,
    chinaLegalMissingDocs: Array.isArray(report.chinaLegal?.missingDocs) ? report.chinaLegal.missingDocs : [],
    chinaLegalSummary: report.chinaLegal?.summary || null,
  };
}

function parseArgs(argv) {
  const options = {
    projectRoot: defaultProjectRoot,
    verifyRemote: false,
    remoteUpdateURL: null,
    remoteExpectedUpdateLink: null,
    remoteTimeoutMs: 8000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: node scripts/release-preflight.mjs [--project-root <path>] [--verify-remote]",
        "  [--remote-update-url <url>] [--remote-expected-update-link <url>] [--remote-timeout-ms <ms>]",
      ].join(" "));
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
    if (arg === "--verify-remote") {
      options.verifyRemote = true;
      continue;
    }
    if (arg === "--remote-update-url") {
      const candidate = String(argv[index + 1] || "").trim();
      if (!candidate) {
        throw createScriptError("args", "remote-update-url must be a non-empty URL", {
          failedStage: "parse-args",
        });
      }
      options.remoteUpdateURL = candidate;
      index += 1;
      continue;
    }
    if (arg === "--remote-expected-update-link") {
      const candidate = String(argv[index + 1] || "").trim();
      if (!candidate) {
        throw createScriptError("args", "remote-expected-update-link must be a non-empty URL", {
          failedStage: "parse-args",
        });
      }
      options.remoteExpectedUpdateLink = candidate;
      index += 1;
      continue;
    }
    if (arg === "--remote-timeout-ms") {
      options.remoteTimeoutMs = parseIntegerOption(argv[index + 1], {
        name: "remote-timeout-ms",
        min: 1,
        failedStage: "parse-args",
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = options.projectRoot;
  const configPath = path.join(projectRoot, "config", "addon.config.json");
  const config = await readJSON(configPath);
  assert(typeof config?.addonId === "string" && config.addonId.trim(), "addon.config.json missing addonId", {
    category: "config",
    failedStage: "read-config",
    details: { configPath, field: "addonId" },
  });
  assert(typeof config?.addonRef === "string" && config.addonRef.trim(), "addon.config.json missing addonRef", {
    category: "config",
    failedStage: "read-config",
    details: { configPath, field: "addonRef" },
  });
  assert(typeof config?.addonVersion === "string" && config.addonVersion.trim(), "addon.config.json missing addonVersion", {
    category: "config",
    failedStage: "read-config",
    details: { configPath, field: "addonVersion" },
  });
  assert(typeof config?.updateURL === "string" && config.updateURL.trim(), "addon.config.json missing updateURL", {
    category: "config",
    failedStage: "read-config",
    details: { configPath, field: "updateURL" },
  });

  const buildReportPath = path.join(projectRoot, "build", config.addonRef, "build-report.json");
  const releaseManifestPath = path.join(projectRoot, "dist", "release-manifest.json");
  const updateManifestPath = path.join(projectRoot, "dist", "update.json");
  const xpiPath = path.join(projectRoot, "dist", `${config.addonRef}-${config.addonVersion}.xpi`);

  assert(await exists(buildReportPath), `Missing build report: ${path.relative(projectRoot, buildReportPath)}`, {
    category: "environment",
    failedStage: "validate-artifacts",
    details: { filePath: buildReportPath },
  });
  assert(await exists(releaseManifestPath), `Missing release manifest: ${path.relative(projectRoot, releaseManifestPath)}`, {
    category: "environment",
    failedStage: "validate-artifacts",
    details: { filePath: releaseManifestPath },
  });
  assert(await exists(updateManifestPath), `Missing update manifest: ${path.relative(projectRoot, updateManifestPath)}`, {
    category: "environment",
    failedStage: "validate-artifacts",
    details: { filePath: updateManifestPath },
  });
  assert(await exists(xpiPath), `Missing XPI package: ${path.relative(projectRoot, xpiPath)}`, {
    category: "environment",
    failedStage: "validate-artifacts",
    details: { filePath: xpiPath },
  });

  const buildReport = await readJSON(buildReportPath);
  const releaseManifest = await readJSON(releaseManifestPath);
  const updateManifest = await readJSON(updateManifestPath);
  const xpiStats = await fs.stat(xpiPath);
  const xpiSHA256 = await readHash(xpiPath);

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

  assert(xpiStats.size > 0, "XPI package is empty", {
    category: "validation",
    failedStage: "validate-artifacts",
    details: { filePath: xpiPath, size: xpiStats.size },
  });

  const cleanroomAudit = await runCleanroomAudit({
    mode: "release",
    projectRoot,
    reportDir: path.join(projectRoot, "dist"),
  });
  assert(cleanroomAudit.status === "passed", `Clean-room release audit failed: ${cleanroomAudit.blockers.join(" | ")}`, {
    category: "validation",
    failedStage: "cleanroom-audit",
    details: {
      blockers: Array.isArray(cleanroomAudit.blockers) ? cleanroomAudit.blockers : [],
      similarityStatus: cleanroomAudit?.similarity?.status || null,
      chinaLegal: cleanroomAudit?.chinaLegal || null,
    },
  });

  const remoteVerification = options.verifyRemote
    ? await verifyRemoteRelease({
      config,
      releaseManifest,
      remoteUpdateURL: options.remoteUpdateURL,
      expectedUpdateLink: options.remoteExpectedUpdateLink,
      timeoutMs: options.remoteTimeoutMs,
    })
    : buildPendingRemoteReleaseVerification({
      config,
      releaseManifest,
      remoteUpdateURL: options.remoteUpdateURL,
      expectedUpdateLink: options.remoteExpectedUpdateLink,
    });

  const preflightReport = summarizeReport({
    addonId: config.addonId,
    addonVersion: config.addonVersion,
    xpiName: path.basename(xpiPath),
    xpiSizeBytes: xpiStats.size,
    xpiSHA256,
    updateLink: releaseManifest.updateLink,
    strictMinVersion: config.strictMinVersion,
    strictMaxVersion: config.strictMaxVersion,
    remoteVerification,
    chinaLegal: cleanroomAudit.chinaLegal,
  });
  preflightReport.cleanroomAuditStatus = cleanroomAudit.status;
  preflightReport.cleanroomAuditMode = cleanroomAudit.mode;
  preflightReport.cleanroomSimilarityStatus = cleanroomAudit.similarity.status;
  preflightReport.cleanroomSimilaritySummary = cleanroomAudit.similarity.summary;
  preflightReport.durationMs = Math.max(0, Date.now() - scriptStartedAt);
  preflightReport.errorCategory = null;
  preflightReport.errorCategoryLabel = null;
  preflightReport.errorMessage = null;
  preflightReport.failedStage = null;

  const preflightPath = path.join(projectRoot, "dist", "release-preflight.json");
  await fs.mkdir(path.dirname(preflightPath), { recursive: true });
  await writeJSONArtifact(preflightPath, preflightReport);

  console.log(`Release preflight passed: ${preflightPath} (remote: ${remoteVerification.statusLabel})`);
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  const preflightPath = path.join(resolveFailureProjectRoot(), "dist", "release-preflight.json");
  try {
    await fs.mkdir(path.dirname(preflightPath), { recursive: true });
    const chinaLegal = failureInfo.details?.chinaLegal || null;
    await writeJSONArtifact(preflightPath, {
      generatedAt: new Date().toISOString(),
      status: "failed",
      addonId: null,
      addonVersion: null,
      xpiName: null,
      xpiSizeBytes: 0,
      xpiSHA256: null,
      updateLink: null,
      strictMinVersion: null,
      strictMaxVersion: null,
      chinaLegalStatus: chinaLegal?.status || null,
      chinaCommercialDeliveryGateOK: chinaLegal?.deliveryGateOK ?? null,
      chinaLegalMissingDocs: Array.isArray(chinaLegal?.missingDocs) ? chinaLegal.missingDocs : [],
      chinaLegalSummary: chinaLegal?.summary || null,
      ...failureInfo,
    });
  } catch {
    // ignore secondary failure
  }
  console.error(error.message || error);
  process.exit(1);
});
