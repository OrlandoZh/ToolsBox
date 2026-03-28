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

async function readJSON(filePath) {
  const content = await fs.readFile(filePath, "utf-8")
    .catch((error) => {
      if (error?.code === "ENOENT") {
        throw createScriptError("environment", `Missing JSON file: ${filePath}`, {
          failedStage: "read-config",
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
      failedStage: "read-config",
      details: { filePath },
      cause: error,
    });
  }
}

function assert(condition, message, options = {}) {
  assertScript(condition, message, {
    category: options.category || "validation",
    failedStage: options.failedStage || "read-config",
    details: options.details,
  });
}

function buildUpdateLink(updateURL, outputName) {
  const url = new URL(updateURL);
  const pathname = url.pathname.replace(/\/[^/]*$/, `/${outputName}`);
  url.pathname = pathname;
  return url.toString();
}

async function main() {
  const configPath = path.join(projectRoot, "config", "addon.config.json");
  const config = await readJSON(configPath);
  assert(typeof config?.addonId === "string" && config.addonId.trim(), "addon.config.json missing addonId", {
    category: "config",
    details: { configPath, field: "addonId" },
  });
  assert(typeof config?.addonRef === "string" && config.addonRef.trim(), "addon.config.json missing addonRef", {
    category: "config",
    details: { configPath, field: "addonRef" },
  });
  assert(typeof config?.addonVersion === "string" && config.addonVersion.trim(), "addon.config.json missing addonVersion", {
    category: "config",
    details: { configPath, field: "addonVersion" },
  });
  assert(typeof config?.updateURL === "string" && config.updateURL.trim(), "addon.config.json missing updateURL", {
    category: "config",
    details: { configPath, field: "updateURL" },
  });
  const distRoot = path.join(projectRoot, "dist");
  const outputName = `${config.addonRef}-${config.addonVersion}.xpi`;
  const updateLink = buildUpdateLink(config.updateURL, outputName);

  await fs.mkdir(distRoot, { recursive: true });

  const updateManifest = {
    addons: {
      [config.addonId]: {
        updates: [
          {
            version: config.addonVersion,
            update_link: updateLink,
            applications: {
              zotero: {
                strict_min_version: config.strictMinVersion,
                strict_max_version: config.strictMaxVersion,
              },
            },
          },
        ],
      },
    },
  };

  const releaseManifest = {
    generatedAt: new Date().toISOString(),
    status: "passed",
    addonId: config.addonId,
    addonRef: config.addonRef,
    addonVersion: config.addonVersion,
    xpiName: outputName,
    xpiPath: path.join(distRoot, outputName),
    updateURL: config.updateURL,
    updateLink,
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
    errorCategory: null,
    errorCategoryLabel: null,
    errorMessage: null,
    failedStage: null,
  };

  await writeJSONArtifact(path.join(distRoot, "update.json"), updateManifest);
  await writeJSONArtifact(path.join(distRoot, "release-manifest.json"), releaseManifest);

  console.log(`Release metadata complete: ${path.join(distRoot, "update.json")}`);
}

main().catch(async (error) => {
  const failureInfo = buildScriptFailureInfo(error, {
    durationMs: Math.max(0, Date.now() - scriptStartedAt),
  });
  const distRoot = path.join(projectRoot, "dist");
  try {
    await fs.mkdir(distRoot, { recursive: true });
    await writeJSONArtifact(path.join(distRoot, "release-manifest.json"), {
      generatedAt: new Date().toISOString(),
      status: "failed",
      addonId: null,
      addonRef: null,
      addonVersion: null,
      xpiName: null,
      xpiPath: null,
      updateURL: null,
      updateLink: null,
      ...failureInfo,
    });
  } catch {
    // ignore secondary failure
  }
  console.error(`${failureInfo.errorCategoryLabel}: ${failureInfo.errorMessage}`);
  process.exit(1);
});
