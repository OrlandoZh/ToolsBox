import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { withBuildLock } from "./build-lock.mjs";
import {
  assertNonEmptyString,
  buildScriptFailureInfo,
  createScriptError,
  isExecutedAsScript,
  readJSONFile,
  wrapScriptError,
} from "./script-runtime-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const scriptStartedAt = Date.now();

const COPY_PATHS = [
  ".env.example",
  ".gitignore",
  "addon-static",
  "config",
  "src",
  "types",
  "scripts/build-lock.mjs",
  "scripts/build-injection-lib.mjs",
  "scripts/build-react-ui.mjs",
  "scripts/build.mjs",
  "scripts/package.mjs",
  "scripts/optional-bundles-lib.mjs",
  "scripts/script-runtime-lib.mjs",
  "scripts/static-runtime-baseline-lib.mjs",
  "scripts/agent-zotero-locale-lib.mjs",
  "scripts/preference-pane-governance-lib.mjs",
  "scripts/verify.mjs",
  "scripts/lint.mjs",
  "scripts/format-check.mjs",
  "scripts/typecheck.mjs",
  "scripts/release-metadata.mjs",
];

const STATIC_RUNTIME_BASELINE_PATHS = [
  "addon-static/bootstrap.js",
  "addon-static/content/preferences.xhtml",
  "addon-static/content/style/main.css",
  "addon-static/content/icons/icon-48.png",
  "addon-static/content/icons/icon-96.png",
  "addon-static/locale/en-US/main.ftl",
  "addon-static/locale/zh-CN/main.ftl",
  "addon-static/locale/zh-TW/main.ftl",
];

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function removeDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

async function copyPath(relativePath, targetRoot) {
  const source = path.join(projectRoot, relativePath);
  const target = path.join(targetRoot, relativePath);
  const stats = await fs.stat(source);
  if (stats.isDirectory()) {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copyPath(path.join(relativePath, entry.name), targetRoot);
    }
    return;
  }
  await ensureDir(path.dirname(target));
  await fs.copyFile(source, target);
}

function buildExportPackageJSON(sourcePackage) {
  const scripts = {
    build: "node scripts/build.mjs",
    package: "node scripts/package.mjs",
    verify: "node scripts/verify.mjs",
    lint: "node scripts/lint.mjs",
    "format:check": "node scripts/format-check.mjs",
    typecheck: "node scripts/typecheck.mjs",
    check: "npm run lint && npm run format:check && npm run typecheck && npm run verify",
  };

  if (typeof sourcePackage?.scripts?.["build:react-ui"] === "string") {
    scripts["build:react-ui"] = sourcePackage.scripts["build:react-ui"];
  }

  return {
    name: sourcePackage.name,
    private: true,
    version: sourcePackage.version,
    type: sourcePackage.type || "module",
    license: sourcePackage.license || "UNLICENSED",
    scripts,
  };
}

function buildExportReadme(config) {
  return `# ${config.addonName} Pure Project Export

这是从主仓库导出的“纯项目”版本，保留插件业务开发与构建所需的最小文件集。

## 已保留

- \`src/\`
- \`addon-static/\`
- \`config/\`
- \`types/\`
- 最小构建脚本：\`build/package/verify/lint/format-check/typecheck\`
- 可选 bundle 构建脚本：\`build:react-ui\`（默认 disabled，不要求主链安装 React）

## 静态运行时基线

以下模板基线资源会随纯项目一起导出，并继续受 \`npm run verify\` 保护：

- \`addon-static/bootstrap.js\`
- \`addon-static/content/preferences.xhtml\`
- \`addon-static/content/style/main.css\`
- \`addon-static/content/icons/icon-48.png\`
- \`addon-static/content/icons/icon-96.png\`
- \`addon-static/locale/en-US/main.ftl\`
- \`addon-static/locale/zh-CN/main.ftl\`
- \`addon-static/locale/zh-TW/main.ftl\`

## 已剔除

- agent 自动化链路脚本与真机编排
- Zotero runner / watch / e2e / autofix / gate 工件
- \`reference/\`、\`docs/\`、\`tests/\`、\`dist/\`、\`.zotero-runtime/\`
- 当前仓库中的分析性与框架性辅助文档

## 可用命令

\`\`\`bash
npm run build
npm run package
npm run verify
npm run check
\`\`\`

导出目标适合继续聚焦插件本体开发；如果需要 agent 闭环、真机 runner、Obsidian 介入包等能力，请回到主仓库。
`;
}

function buildExportManifest(config, outputName) {
  return {
    generatedAt: new Date().toISOString(),
    addonName: config.addonName,
    addonRef: config.addonRef,
    addonVersion: config.addonVersion,
    exportName: outputName,
    includedPaths: COPY_PATHS,
    staticRuntimeBaselineFiles: STATIC_RUNTIME_BASELINE_PATHS,
    excludedCategories: [
      "agent automation",
      "zotero runtime sandboxes",
      "tests",
      "docs",
      "reference",
      "dist artifacts",
    ],
  };
}

export async function main() {
  await withBuildLock("export-project.mjs", async () => {
    const configPath = path.join(projectRoot, "config", "addon.config.json");
    const packagePath = path.join(projectRoot, "package.json");
    const config = await readJSONFile(configPath, {
      missingCategory: "environment",
      invalidCategory: "validation",
      missingStage: "read-config",
      invalidStage: "read-config",
      label: "config/addon.config.json",
    });
    const sourcePackage = await readJSONFile(packagePath, {
      missingCategory: "environment",
      invalidCategory: "validation",
      missingStage: "read-package-json",
      invalidStage: "read-package-json",
      label: "package.json",
    });
    assertNonEmptyString(config?.addonRef, "addon.config.json:addonRef", {
      category: "config",
      failedStage: "validate-config",
      details: { configPath, field: "addonRef" },
    });
    assertNonEmptyString(config?.addonVersion, "addon.config.json:addonVersion", {
      category: "config",
      failedStage: "validate-config",
      details: { configPath, field: "addonVersion" },
    });
    const outputName = `${config.addonRef}-${config.addonVersion}-pure-project`;
    const distRoot = path.join(projectRoot, "dist");
    const exportRoot = path.join(distRoot, outputName);
    const zipPath = path.join(distRoot, `${outputName}.zip`);

    try {
      await ensureDir(distRoot);
      await removeDir(exportRoot);
      await fs.rm(zipPath, { force: true });
      await ensureDir(exportRoot);
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "prepare-export-root",
        details: { exportRoot, zipPath },
      });
    }

    try {
      for (const relativePath of COPY_PATHS) {
        await copyPath(relativePath, exportRoot);
      }
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "copy-export-paths",
        details: { exportRoot },
      });
    }

    try {
      await fs.writeFile(
        path.join(exportRoot, "package.json"),
        `${JSON.stringify(buildExportPackageJSON(sourcePackage), null, 2)}\n`,
        "utf-8",
      );
      await fs.writeFile(
        path.join(exportRoot, "README.md"),
        `${buildExportReadme(config)}\n`,
        "utf-8",
      );
      await fs.writeFile(
        path.join(exportRoot, "export-manifest.json"),
        `${JSON.stringify(buildExportManifest(config, outputName), null, 2)}\n`,
        "utf-8",
      );
    } catch (error) {
      throw wrapScriptError(error, {
        failedStage: "write-export-metadata",
        details: { exportRoot },
      });
    }

    const zip = spawnSync("zip", ["-r", zipPath, "."], {
      cwd: exportRoot,
      stdio: "inherit",
    });
    if (zip.error) {
      throw createScriptError(zip.error.code === "ENOENT" ? "environment" : "execution", zip.error.message || String(zip.error), {
        failedStage: "zip-export",
        details: {
          exportRoot,
          zipPath,
        },
        cause: zip.error,
      });
    }
    if (zip.status !== 0) {
      throw createScriptError("execution", `zip exited with code ${zip.status ?? 1}`, {
        failedStage: "zip-export",
        details: {
          exportRoot,
          zipPath,
          exitCode: zip.status ?? 1,
        },
      });
    }

    console.log(`Pure project export generated: ${exportRoot}`);
    console.log(`Pure project archive generated: ${zipPath}`);
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
