import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { withBuildLock } from "./build-lock.mjs";
import {
  assertNonEmptyString,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
  SCRIPT_ERROR_CATEGORY_LABELS,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

export async function readPackageConfig() {
  const filePath = path.join(projectRoot, "config", "addon.config.json");
  const config = await readJSONFile(filePath, {
    missingCategory: "environment",
    invalidCategory: "validation",
    missingStage: "read-config",
    invalidStage: "read-config",
    label: "config/addon.config.json",
  });
  assertNonEmptyString(config?.addonRef, "addon.config.json:addonRef", {
    category: "config",
    failedStage: "validate-config",
    details: { configPath: filePath, field: "addonRef" },
  });
  assertNonEmptyString(config?.addonVersion, "addon.config.json:addonVersion", {
    category: "config",
    failedStage: "validate-config",
    details: { configPath: filePath, field: "addonVersion" },
  });
  return config;
}

export function runNodeScript(scriptPath, failedStage) {
  const labelToCategory = Object.entries(SCRIPT_ERROR_CATEGORY_LABELS)
    .reduce((accumulator, [category, label]) => {
      accumulator[label] = category;
      return accumulator;
    }, {});
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    stdio: "pipe",
    encoding: "utf-8",
    env: {
      ...process.env,
      CLEANROOM_BUILD_LOCK_HELD: "1",
    },
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw createScriptError(result.error.code === "ENOENT" ? "environment" : "execution", result.error.message || String(result.error), {
      failedStage,
      details: {
        scriptPath,
      },
      cause: result.error,
    });
  }

  if (result.status !== 0) {
    const stderrLine = String(result.stderr || "")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .pop() || "";
    const parsed = stderrLine.match(/^(参数错误|配置错误|环境错误|执行错误|验证错误|超时错误|未知错误):\s*(.+)$/u);
    const propagatedCategory = parsed ? labelToCategory[parsed[1]] || "execution" : "execution";
    const propagatedMessage = parsed ? parsed[2] : `Child script exited with code ${result.status ?? 1}: ${path.basename(scriptPath)}`;
    throw createScriptError(propagatedCategory, propagatedMessage, {
      failedStage,
      details: {
        scriptPath,
        exitCode: result.status ?? 1,
      },
    });
  }
}

export async function main() {
  await withBuildLock("package.mjs", async () => {
    const config = await readPackageConfig();
    const buildRoot = path.join(projectRoot, "build", config.addonRef);
    const distRoot = path.join(projectRoot, "dist");

    runNodeScript(path.join(projectRoot, "scripts", "build.mjs"), "run-build");
    const { promises: fs } = await import("node:fs");
    await fs.mkdir(distRoot, { recursive: true });

    const outputName = `${config.addonRef}-${config.addonVersion}.xpi`;
    const outputPath = path.join(distRoot, outputName);
    await fs.rm(outputPath, { force: true });

    const zip = spawnSync("zip", ["-r", outputPath, "."], {
      cwd: buildRoot,
      stdio: "inherit",
    });

    if (zip.error) {
      throw createScriptError(zip.error.code === "ENOENT" ? "environment" : "execution", zip.error.message || String(zip.error), {
        failedStage: "zip-package",
        details: {
          buildRoot,
          outputPath,
        },
        cause: zip.error,
      });
    }
    if (zip.status !== 0) {
      throw createScriptError("execution", `zip exited with code ${zip.status ?? 1}`, {
        failedStage: "zip-package",
        details: {
          buildRoot,
          outputPath,
          exitCode: zip.status ?? 1,
        },
      });
    }

    runNodeScript(path.join(projectRoot, "scripts", "release-metadata.mjs"), "run-release-metadata");

    console.log(`Package complete: ${outputPath}`);
  });
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
