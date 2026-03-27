import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectStaticRuntimeBaselineFiles } from "./static-runtime-baseline-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
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
    const full = path.join(root, item);
    if (!(await exists(full))) {
      missing.push(item);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required files: ${missing.join(", ")}`);
  }

  const configContent = await fs.readFile(
    path.join(root, "config", "addon.config.json"),
    "utf-8",
  );
  const config = JSON.parse(configContent);

  if (typeof config.updateURL !== "string" || config.updateURL.trim() === "") {
    throw new Error(
      "Invalid config: 'updateURL' must be a non-empty string for Zotero 7/8 packaging and installation.",
    );
  }

  const staticRuntime = await inspectStaticRuntimeBaselineFiles(root, config);
  if (staticRuntime.missingCount > 0) {
    throw new Error(`Missing required files: ${staticRuntime.missingEntries.map((entry) => entry.file).join(", ")}`);
  }

  console.log("Verify complete: core files and config look valid");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
