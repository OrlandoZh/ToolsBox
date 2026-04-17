import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { withBuildLock } from "./build-lock.mjs";
import {
  listOptionalBundleRequiredPackages,
  loadOptionalBundleRegistry,
} from "./optional-bundles-lib.mjs";
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
  "LEGAL_RISK_CHECKLIST.md",
  "CODE_PROVENANCE.md",
  "THIRD_PARTY_NOTICES.md",
  "COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md",
  "scripts/build-lock.mjs",
  "scripts/build-injection-lib.mjs",
  "scripts/build-react-ui.mjs",
  "scripts/build.mjs",
  "scripts/package.mjs",
  "scripts/package-protection-anchor-audit.mjs",
  "scripts/package-protection-experiment-compare.mjs",
  "scripts/package-protection-jsconfuser-preflight.mjs",
  "scripts/package-protection-lightweight-preflight.mjs",
  "scripts/package-protection-smoke.mjs",
  "scripts/package-protection-webcrack-audit.mjs",
  "scripts/package-protection-webcrack-score.mjs",
  "scripts/package-protection-manual-score.mjs",
  "scripts/package-protection-verdict.mjs",
  "scripts/package-obfuscation-lib.mjs",
  "scripts/package-protection-lib.mjs",
  "scripts/agent-artifacts.mjs",
  "scripts/optional-bundles-lib.mjs",
  "scripts/release-matrix-lib.mjs",
  "scripts/release-remote-verification-lib.mjs",
  "scripts/script-runtime-lib.mjs",
  "scripts/static-runtime-baseline-lib.mjs",
  "scripts/agent-zotero-locale-lib.mjs",
  "scripts/preference-pane-governance-lib.mjs",
  "scripts/zotero-agent-runtime-lib.mjs",
  "scripts/zotero-runner-lib.mjs",
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

const EXPORTED_TOOLCHAIN_DEV_DEPENDENCIES = [
  "javascript-obfuscator",
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

function buildExportPackageJSON(sourcePackage, optionalBundleRegistry = null) {
  const scripts = {
    build: "node scripts/build.mjs",
    package: "node scripts/package.mjs",
    "package:encrypted": "node scripts/package.mjs --encrypt-bundle --skip-release-metadata",
    "package:shielded": "node scripts/package.mjs --shield-bundle --skip-release-metadata",
    "package:shielded:descriptor-bind": "node scripts/package.mjs --descriptor-bind --skip-release-metadata",
    "package:shielded:jsconfuser:string": "node scripts/package.mjs --jsconfuser-string --skip-release-metadata",
    "package:protection:smoke": "node scripts/package-protection-smoke.mjs",
    "package:protection:smoke:plain": "node scripts/package-protection-smoke.mjs --variant plain",
    "package:protection:smoke:encrypted": "node scripts/package-protection-smoke.mjs --variant encrypted",
    "package:protection:smoke:shielded": "node scripts/package-protection-smoke.mjs --variant shielded",
    "package:protection:smoke:shielded:descriptor-bind": "node scripts/package-protection-smoke.mjs --variant shielded-descriptor-bind",
    "package:protection:smoke:shielded:jsconfuser:string": "node scripts/package-protection-smoke.mjs --variant shielded-jsconfuser-string",
    "package:protection:webcrack": "node scripts/package-protection-webcrack-audit.mjs",
    "package:protection:webcrack:shielded": "node scripts/package-protection-webcrack-audit.mjs --variant shielded",
    "package:protection:webcrack:shielded:descriptor-bind": "node scripts/package-protection-webcrack-audit.mjs --variant shielded-descriptor-bind",
    "package:protection:webcrack:shielded:jsconfuser:string": "node scripts/package-protection-webcrack-audit.mjs --variant shielded-jsconfuser-string",
    "package:protection:webcrack:score": "node scripts/package-protection-webcrack-score.mjs",
    "package:protection:audit": "node scripts/package-protection-anchor-audit.mjs",
    "package:protection:audit:descriptor-bind": "node scripts/package-protection-anchor-audit.mjs --include-descriptor-bind",
    "package:protection:audit:jsconfuser:string": "node scripts/package-protection-anchor-audit.mjs --include-jsconfuser-string",
    "package:protection:compare": "node scripts/package-protection-experiment-compare.mjs",
    "package:protection:compare:descriptor-bind": "node scripts/package-protection-experiment-compare.mjs --variant shielded-descriptor-bind",
    "package:protection:compare:jsconfuser:string": "node scripts/package-protection-experiment-compare.mjs --variant shielded-jsconfuser-string",
    "package:protection:jsconfuser:preflight": "node scripts/package-protection-jsconfuser-preflight.mjs",
    "package:protection:jsconfuser:string:preflight": "node scripts/package-protection-jsconfuser-preflight.mjs --profile targeted-string-concealing",
    "package:protection:lightweight:preflight": "node scripts/package-protection-lightweight-preflight.mjs",
    "package:protection:score": "node scripts/package-protection-manual-score.mjs",
    "package:protection:verdict": "node scripts/package-protection-verdict.mjs",
    verify: "node scripts/verify.mjs",
    lint: "node scripts/lint.mjs",
    "format:check": "node scripts/format-check.mjs",
    typecheck: "node scripts/typecheck.mjs",
    check: "npm run lint && npm run format:check && npm run typecheck && npm run verify",
  };

  if (typeof sourcePackage?.scripts?.["build:react-ui"] === "string") {
    scripts["build:react-ui"] = sourcePackage.scripts["build:react-ui"];
  }

  const exportPackage = {
    name: sourcePackage.name,
    private: true,
    version: sourcePackage.version,
    type: sourcePackage.type || "module",
    license: sourcePackage.license || "UNLICENSED",
    scripts,
  };

  const requiredOptionalPackages = optionalBundleRegistry
    ? listOptionalBundleRequiredPackages(optionalBundleRegistry)
    : [];
  const devDependencies = {};
  const dependencies = {};

  EXPORTED_TOOLCHAIN_DEV_DEPENDENCIES.forEach((packageName) => {
    if (typeof sourcePackage?.devDependencies?.[packageName] === "string") {
      devDependencies[packageName] = sourcePackage.devDependencies[packageName];
    }
  });

  requiredOptionalPackages.forEach((packageName) => {
    if (typeof sourcePackage?.devDependencies?.[packageName] === "string") {
      devDependencies[packageName] = sourcePackage.devDependencies[packageName];
      return;
    }

    if (typeof sourcePackage?.dependencies?.[packageName] === "string") {
      dependencies[packageName] = sourcePackage.dependencies[packageName];
    }
  });

  if (Object.keys(devDependencies).length > 0) {
    exportPackage.devDependencies = devDependencies;
  }

  if (Object.keys(dependencies).length > 0) {
    exportPackage.dependencies = dependencies;
  }

  return exportPackage;
}

function buildExportReadme(config, exportLicense) {
  return `# ${config.addonName} Pure Project Export

这是从主仓库导出的“纯项目”版本，保留插件业务开发与构建所需的最小文件集。

## 已保留

- \`src/\`
- \`addon-static/\`
- \`config/\`
- \`types/\`
- 中国法商业交付骨架：\`LEGAL_RISK_CHECKLIST.md\`、\`CODE_PROVENANCE.md\`、\`THIRD_PARTY_NOTICES.md\`、\`COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md\`
- 最小构建脚本：\`build/package/verify/lint/format-check/typecheck\`
- 可选 bundle 构建脚本：\`build:react-ui\`（默认 disabled，但导出物已声明 \`esbuild / react / react-dom\` 作为 optional lane 的 devDependencies）

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

- 默认 agent 自动化链路脚本与 gate 编排
- Zotero \`watch / e2e / autofix / gate\` 工件
- \`reference/\`、\`docs/\`、\`tests/\`、\`dist/\`、\`.zotero-runtime/\`
- 当前仓库中的分析性与框架性辅助文档

## 中国法交付提示

- 当前模板根仓库仍是 \`${exportLicense}\`；导出物会沿用该声明，不自动授予第三方再分发模板源码的开放许可。
- 商业交付前，至少补齐 \`CODE_PROVENANCE.md\`、\`THIRD_PARTY_NOTICES.md\`、\`COMMERCIAL_DELIVERY_RIGHTS_NOTICE.md\` 与 \`LEGAL_RISK_CHECKLIST.md\` 中的 release-only 证据。
- \`reference/\` 快照、分析笔记、截图基线与 agent 工件不应进入客户交付包或公开发布包。

## 可用命令

\`\`\`bash
npm run build
npm run package
npm run package:encrypted
npm run package:shielded
npm run package:shielded:descriptor-bind
npm run package:shielded:jsconfuser:string # 如自动发现失败，再补 -- --jsconfuser-tool-path /absolute/path/to/js-confuser
npm run package:protection:smoke -- --variant shielded --repeats 3 --channel stable
npm run package:protection:smoke:shielded:descriptor-bind -- --repeats 3 --channel stable
npm run package:protection:smoke:shielded:jsconfuser:string -- --repeats 3 --channel stable # 如自动发现失败，再补 --jsconfuser-tool-path
npm run package:protection:webcrack:shielded -- --channel stable
npm run package:protection:webcrack:shielded:descriptor-bind -- --channel stable
npm run package:protection:webcrack:shielded:jsconfuser:string -- --channel stable # 如自动发现失败，再补 --jsconfuser-tool-path
npm run package:protection:webcrack:score -- --variant shielded --channel stable
npm run package:protection:audit
npm run package:protection:audit:descriptor-bind
npm run package:protection:audit:jsconfuser:string # 如自动发现失败，再补 -- --jsconfuser-tool-path /absolute/path/to/js-confuser
npm run package:protection:compare:descriptor-bind -- --channel stable
npm run package:protection:compare:jsconfuser:string -- --channel stable
npm run package:protection:jsconfuser:preflight # 如自动发现失败，再补 -- --tool-path /absolute/path/to/js-confuser
npm run package:protection:jsconfuser:string:preflight # 如自动发现失败，再补 -- --tool-path /absolute/path/to/js-confuser
npm run package:protection:lightweight:preflight -- --tool-path /absolute/path/to/lightweight-js-obfuscator
npm run package:protection:score -- --variant shielded --channel stable --webcrack "high-level-architecture" --llm "high-level-architecture"
npm run package:protection:verdict
npm run verify
npm run check
npm run build:react-ui
\`\`\`

补充说明：\`package:encrypted\`、\`package:shielded\`、\`package:shielded:descriptor-bind\` 与 \`package:shielded:jsconfuser:string\` 都只生成本地手动触发的受保护 XPI 分支，不参与默认 release metadata / release gate 主线，也不替代服务端保护；其中 \`package:shielded\` 会先对主 bundle 做混淆，再对 protected loader 做一层兼容性优先的混淆，最后做 AES 包装；\`package:shielded:descriptor-bind\` 则是在此基础上额外挂入一个 host-binding-aware 的 capability descriptor overlay 实验入口，仍保持非阻断、手动实验语义；\`package:shielded:jsconfuser:string\` 则会在现有 protected-only source proxy 上额外跑一层显式目标字符串的 \`JS-Confuser stringConcealing\`，优先自动发现本地 \`js-confuser\` 工具，只有自动发现失败时才需要显式传 \`--jsconfuser-tool-path\`。当前正式手动收口链路固定为 \`package:protection:smoke -> package:protection:score -> package:protection:verdict\`：\`package:protection:smoke\` 只用于手动实验 \`plain / encrypted / shielded\` 三个控制组的安装态、\`packageProtection\` 时序与 base64 fast path 支持情况；\`package:protection:webcrack\` 则会在 fresh 打包后提取 XPI 内脚本、调用本地 \`webcrack\` CLI，并在 \`dist/package-protection-webcrack/\` 下落盘默认首轮与 fallback loader-only 两份自动化工件，供 controller / subagent / 人工继续判读；\`package:protection:webcrack:score\` 会把该工件中的 \`suggestedWebcrackRating\` 回填到 smoke report 的 \`manualScorecard.webcrackInitialResult\`，但不会代替 \`llmSinglePassResult\`；\`package:protection:score\` 仍用于补齐完整手工评分；\`package:protection:verdict\` 只生成 advisory 结论，不进入默认 release 主线。\`package:protection:audit\` 是额外的 raw export 语义泄露实验入口，用来判断下一步应该先 trim loader 还是进入 inner bundle semantic scrub；\`package:protection:audit:descriptor-bind\` 与 \`package:protection:audit:jsconfuser:string\` 则是在不改变上述基线判据的前提下，把额外实验变体纳入同一份审计报告。\`package:protection:compare\` 是实验 A/B 的收口入口，用来把 \`shielded\` 基线与某个实验变体的 smoke / webcrack / audit / 手工 LLM 状态收成一份 advisory compare 报告；当前它最适合回答“descriptor-bind 是不是 runtime-only 保留项”“jsconfuser-string 现在到底是 hardening win，还是仍然只是 leaning-same”。\`package:protection:jsconfuser:preflight\` 是当前更前置的 Stage 3 候选预检入口，只用于对外部 \`js-confuser\` checkout 做 \`astScrambler\` 的兼容性、体积和语义压缩预检；\`package:protection:jsconfuser:string:preflight\` 则是更激进但仍保持非 hostile 的次级预检入口，只对显式目标字符串做小范围 \`stringConcealing\` 试验；\`package:protection:lightweight:preflight\` 是更后置的 Stage 3 预检入口，只用于对外部 \`lightweight-js-obfuscator\` checkout 做兼容性与体积预检，不会改写默认 \`shielded\` 路线。

导出目标适合继续聚焦插件本体开发；如果需要完整 agent 闭环、Obsidian 介入包或默认 release gate 编排，请回到主仓库。
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
    const optionalBundleRegistry = loadOptionalBundleRegistry(projectRoot).registry;
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
      const exportLicense = sourcePackage.license || "UNLICENSED";
      await fs.writeFile(
        path.join(exportRoot, "package.json"),
        `${JSON.stringify(buildExportPackageJSON(sourcePackage, optionalBundleRegistry), null, 2)}\n`,
        "utf-8",
      );
      await fs.writeFile(
        path.join(exportRoot, "README.md"),
        `${buildExportReadme(config, exportLicense)}\n`,
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
