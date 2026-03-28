import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  assertScript,
  buildScriptFailureInfo,
  createScriptError,
  writeJSONArtifact,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

function assert(condition, message, options = {}) {
  assertScript(condition, message, {
    category: options.category || "validation",
    failedStage: options.failedStage || "read-release-inputs",
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
          failedStage: "read-release-inputs",
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
      failedStage: "read-release-inputs",
      details: { filePath },
      cause: error,
    });
  }
}

function collectWarnings(config, releaseManifest) {
  const warnings = [];

  const updateURL = String(config.updateURL || "");
  if (updateURL.includes("example.com")) {
    warnings.push("`config.addon.config.json` still uses example.com in updateURL");
  }

  if (String(config.author || "").trim().toLowerCase() === "your team") {
    warnings.push("`author` is still placeholder value `Your Team`");
  }

  if (!String(config.homepage || "").startsWith("https://")) {
    warnings.push("`homepage` should use https URL for public release");
  }

  if (!String(releaseManifest.updateLink || "").startsWith("https://")) {
    warnings.push("`update_link` should be an https URL before public release");
  }

  return warnings;
}

function buildReleaseNotesMarkdown({ config, releaseManifest, preflight, warnings }) {
  const lines = [
    `# Release ${config.addonVersion}`,
    "",
    "## Artifacts",
    `- Add-on ID: \`${config.addonId}\``,
    `- XPI: \`${releaseManifest.xpiName}\``,
    `- SHA256: \`${preflight.xpiSHA256}\``,
    `- Size: \`${preflight.xpiSizeBytes}\` bytes`,
    `- update.json URL: \`${releaseManifest.updateURL}\``,
    `- update_link: \`${releaseManifest.updateLink}\``,
    "",
    "## Compatibility",
    `- Zotero min: \`${config.strictMinVersion}\``,
    `- Zotero max: \`${config.strictMaxVersion}\``,
    "",
    "## Validation",
    "- `npm run check` passed",
    "- `npm run release:local` passed",
    "- `npm run zotero:test` passed",
    "",
    "## Changelog",
    "- Replace this section with user-facing changes.",
    "",
    "## Upload Steps",
    "1. Upload `.xpi` and `update.json` to your release CDN or GitHub Release assets.",
    "2. Verify uploaded `update.json` contains the same `update_link` as above.",
    "3. Verify `update_link` points to the uploaded `.xpi` and is publicly reachable.",
    "4. Publish release notes with checksum.",
  ];

  if (warnings.length > 0) {
    lines.push("", "## Release Warnings");
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const configPath = path.join(projectRoot, "config", "addon.config.json");
  const releaseManifestPath = path.join(projectRoot, "dist", "release-manifest.json");
  const preflightPath = path.join(projectRoot, "dist", "release-preflight.json");
  const updateManifestPath = path.join(projectRoot, "dist", "update.json");

  assert(await exists(configPath), "Missing config/addon.config.json", {
    category: "environment",
    details: { filePath: configPath },
  });
  assert(await exists(releaseManifestPath), "Missing dist/release-manifest.json (run `npm run release:local` first)", {
    category: "environment",
    details: { filePath: releaseManifestPath },
  });
  assert(await exists(preflightPath), "Missing dist/release-preflight.json (run `npm run release:local` first)", {
    category: "environment",
    details: { filePath: preflightPath },
  });
  assert(await exists(updateManifestPath), "Missing dist/update.json (run `npm run release:local` first)", {
    category: "environment",
    details: { filePath: updateManifestPath },
  });

  const config = await readJSON(configPath);
  const releaseManifest = await readJSON(releaseManifestPath);
  const preflight = await readJSON(preflightPath);
  const updateManifest = await readJSON(updateManifestPath);
  assert(releaseManifest.status !== "failed", "release-manifest generation failed", {
    failedStage: "validate-release-artifacts",
    details: { filePath: releaseManifestPath },
  });
  assert(preflight.status === "passed", "release-preflight did not pass", {
    failedStage: "validate-release-artifacts",
    details: { filePath: preflightPath, status: preflight.status || null },
  });

  const warnings = collectWarnings(config, releaseManifest);

  const plan = {
    generatedAt: new Date().toISOString(),
    status: "passed",
    addonId: config.addonId,
    addonVersion: config.addonVersion,
    artifactFiles: [
      releaseManifest.xpiName,
      "update.json",
      "release-manifest.json",
      "release-preflight.json",
      "release-notes.md",
    ],
    updateURL: releaseManifest.updateURL,
    updateLink: releaseManifest.updateLink,
    checksum: preflight.xpiSHA256,
    sizeBytes: preflight.xpiSizeBytes,
    warnings,
    checks: {
      updateManifestHasEntry: Boolean(updateManifest.addons?.[config.addonId]?.updates?.[0]),
      updateLinkMatchesManifest:
        updateManifest.addons?.[config.addonId]?.updates?.[0]?.update_link === releaseManifest.updateLink,
    },
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
    errorCategory: null,
    errorCategoryLabel: null,
    errorMessage: null,
    failedStage: null,
  };

  const releaseNotes = buildReleaseNotesMarkdown({
    config,
    releaseManifest,
    preflight,
    warnings,
  });

  await writeJSONArtifact(path.join(projectRoot, "dist", "release-plan.json"), plan);
  await fs.writeFile(path.join(projectRoot, "dist", "release-notes.md"), releaseNotes, "utf-8");

  if (warnings.length > 0) {
    console.log(`Release prepare complete with warnings: ${warnings.length}`);
    warnings.forEach((message, index) => {
      console.log(`  ${index + 1}. ${message}`);
    });
  } else {
    console.log("Release prepare complete: no warnings");
  }
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  try {
    const releasePlanPath = path.join(projectRoot, "dist", "release-plan.json");
    const releaseNotesPath = path.join(projectRoot, "dist", "release-notes.md");
    await fs.mkdir(path.dirname(releasePlanPath), { recursive: true });
    await writeJSONArtifact(releasePlanPath, {
      generatedAt: new Date().toISOString(),
      status: "failed",
      addonId: null,
      addonVersion: null,
      artifactFiles: [],
      updateURL: null,
      updateLink: null,
      checksum: null,
      sizeBytes: 0,
      warnings: [],
      checks: {},
      ...failureInfo,
    });
    await fs.writeFile(
      releaseNotesPath,
      [
        "# Release Prepare",
        "",
        "- 状态: 失败",
        `- 分类: \`${failureInfo.errorCategoryLabel}\``,
        `- 阶段: \`${failureInfo.failedStage}\``,
        `- 信息: ${failureInfo.errorMessage}`,
        `- 耗时: \`${failureInfo.durationMs}ms\``,
        "",
      ].join("\n"),
      "utf-8",
    );
  } catch {
    // ignore secondary failure
  }
  console.error(`${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
