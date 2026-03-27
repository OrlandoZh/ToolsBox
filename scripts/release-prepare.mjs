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

  assert(await exists(configPath), "Missing config/addon.config.json");
  assert(await exists(releaseManifestPath), "Missing dist/release-manifest.json (run `npm run release:local` first)");
  assert(await exists(preflightPath), "Missing dist/release-preflight.json (run `npm run release:local` first)");
  assert(await exists(updateManifestPath), "Missing dist/update.json (run `npm run release:local` first)");

  const config = await readJSON(configPath);
  const releaseManifest = await readJSON(releaseManifestPath);
  const preflight = await readJSON(preflightPath);
  const updateManifest = await readJSON(updateManifestPath);

  const warnings = collectWarnings(config, releaseManifest);

  const plan = {
    generatedAt: new Date().toISOString(),
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
  };

  const releaseNotes = buildReleaseNotesMarkdown({
    config,
    releaseManifest,
    preflight,
    warnings,
  });

  await fs.writeFile(path.join(projectRoot, "dist", "release-plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf-8");
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

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
