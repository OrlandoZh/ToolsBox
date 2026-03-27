import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

async function readHash(filePath) {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function summarizeReport(report) {
  return {
    generatedAt: new Date().toISOString(),
    addonId: report.addonId,
    addonVersion: report.addonVersion,
    xpiName: report.xpiName,
    xpiSizeBytes: report.xpiSizeBytes,
    xpiSHA256: report.xpiSHA256,
    updateLink: report.updateLink,
    strictMinVersion: report.strictMinVersion,
    strictMaxVersion: report.strictMaxVersion,
  };
}

async function main() {
  const configPath = path.join(projectRoot, "config", "addon.config.json");
  const config = await readJSON(configPath);

  const buildReportPath = path.join(projectRoot, "build", config.addonRef, "build-report.json");
  const releaseManifestPath = path.join(projectRoot, "dist", "release-manifest.json");
  const updateManifestPath = path.join(projectRoot, "dist", "update.json");
  const xpiPath = path.join(projectRoot, "dist", `${config.addonRef}-${config.addonVersion}.xpi`);

  assert(await exists(buildReportPath), `Missing build report: ${path.relative(projectRoot, buildReportPath)}`);
  assert(await exists(releaseManifestPath), `Missing release manifest: ${path.relative(projectRoot, releaseManifestPath)}`);
  assert(await exists(updateManifestPath), `Missing update manifest: ${path.relative(projectRoot, updateManifestPath)}`);
  assert(await exists(xpiPath), `Missing XPI package: ${path.relative(projectRoot, xpiPath)}`);

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

  assert(xpiStats.size > 0, "XPI package is empty");

  const preflightReport = summarizeReport({
    addonId: config.addonId,
    addonVersion: config.addonVersion,
    xpiName: path.basename(xpiPath),
    xpiSizeBytes: xpiStats.size,
    xpiSHA256,
    updateLink: releaseManifest.updateLink,
    strictMinVersion: config.strictMinVersion,
    strictMaxVersion: config.strictMaxVersion,
  });

  const preflightPath = path.join(projectRoot, "dist", "release-preflight.json");
  await fs.writeFile(preflightPath, `${JSON.stringify(preflightReport, null, 2)}\n`, "utf-8");

  console.log(`Release preflight passed: ${preflightPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
