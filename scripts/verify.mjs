import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { inspectStaticRuntimeBaselineFiles } from "./static-runtime-baseline-lib.mjs";
import {
  assertNonEmptyString,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function verifyWorkspace(projectRoot = root) {
  const required = [
    "config/addon.config.json",
    "addon-static/locale/en-US/main.ftl",
    "addon-static/locale/zh-CN/main.ftl",
    "addon-static/locale/zh-TW/main.ftl",
    "src/main.js",
    "src/app/plugin.js",
    "src/core/i18n.js",
    "scripts/build.mjs",
    "LEGAL_RISK_CHECKLIST.md",
  ];

  const missing = [];
  for (const item of required) {
    const full = path.join(projectRoot, item);
    if (!(await exists(full))) {
      missing.push(item);
    }
  }

  if (missing.length > 0) {
    throw createScriptError("environment", `Missing required files: ${missing.join(", ")}`, {
      failedStage: "validate-required-files",
      details: {
        missing,
      },
    });
  }

  const configPath = path.join(projectRoot, "config", "addon.config.json");
  const config = await readJSONFile(configPath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    missingStage: "read-config",
    invalidStage: "read-config",
    label: "config/addon.config.json",
  });

  assertNonEmptyString(config?.updateURL, "addon.config.json:updateURL", {
    category: "config",
    failedStage: "validate-config",
    details: {
      configPath,
      field: "updateURL",
    },
  });

  const staticRuntime = await inspectStaticRuntimeBaselineFiles(projectRoot, config);
  if (staticRuntime.missingCount > 0) {
    throw createScriptError("environment", `Missing required files: ${staticRuntime.missingEntries.map((entry) => entry.file).join(", ")}`, {
      failedStage: "inspect-static-runtime",
      details: {
        missingEntries: staticRuntime.missingEntries.map((entry) => entry.file),
      },
    });
  }

  return {
    projectRoot,
    status: "passed",
    config,
    staticRuntime,
  };
}

export async function main() {
  await verifyWorkspace(root);
  console.log("Verify complete: core files and config look valid");
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
