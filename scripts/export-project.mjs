import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { withBuildLock } from "./build-lock.mjs";
import {
  listOptionalBundles,
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
  "scripts/package-protection-attack-report.mjs",
  "scripts/package-protection-guided-attack-plan.mjs",
  "scripts/package-protection-strategy-report.mjs",
  "scripts/package-protection-experiment-compare.mjs",
  "scripts/package-protection-matrix-report.mjs",
  "scripts/package-protection-wasm-admission.mjs",
  "scripts/package-protection-inner-audit.mjs",
  "scripts/package-protection-jsconfuser-bootstrap.mjs",
  "scripts/package-protection-jsconfuser-preflight.mjs",
  "scripts/package-protection-lightweight-preflight.mjs",
  "scripts/package-protection-guided-attack-score.mjs",
  "scripts/package-protection-llm-score.mjs",
  "scripts/package-protection-performance-report.mjs",
  "scripts/package-protection-smoke.mjs",
  "scripts/package-protection-webcrack-audit.mjs",
  "scripts/package-protection-webcrack-score.mjs",
  "scripts/package-protection-opencode-analysis.mjs",
  "scripts/package-protection-opencode-score.mjs",
  "scripts/package-protection-manual-score.mjs",
  "scripts/package-protection-verdict.mjs",
  "scripts/wasm-kernel-smoke.mjs",
  "scripts/wasm-kernel-performance-report.mjs",
  "scripts/wasm-kernel-disabled-contract-report.mjs",
  "scripts/wasm-kernel-matrix-report.mjs",
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
    "package:shielded:pref-bridge": "node scripts/package.mjs --pref-bridge --skip-release-metadata",
    "package:shielded:surface-scrub": "node scripts/package.mjs --surface-scrub --skip-release-metadata",
    "package:shielded:surface-scrub:wasm:digest": "node scripts/package.mjs --surface-scrub-wasm-digest --skip-release-metadata",
    "package:shielded:surface-scrub:wasm:stage2:derive": "node scripts/package.mjs --surface-scrub-wasm-stage2-derive --skip-release-metadata",
    "package:shielded:surface-scrub:wasm:entitlement:legacy": "node scripts/package.mjs --surface-scrub-wasm-entitlement-legacy --skip-release-metadata",
    "package:protection:smoke": "node scripts/package-protection-smoke.mjs",
    "package:protection:smoke:plain": "node scripts/package-protection-smoke.mjs --variant plain",
    "package:protection:smoke:encrypted": "node scripts/package-protection-smoke.mjs --variant encrypted",
    "package:protection:smoke:shielded": "node scripts/package-protection-smoke.mjs --variant shielded",
    "package:protection:smoke:shielded:descriptor-bind": "node scripts/package-protection-smoke.mjs --variant shielded-descriptor-bind",
    "package:protection:smoke:shielded:jsconfuser:string": "node scripts/package-protection-smoke.mjs --variant shielded-jsconfuser-string",
    "package:protection:smoke:shielded:pref-bridge": "node scripts/package-protection-smoke.mjs --variant shielded-pref-bridge",
    "package:protection:smoke:shielded:surface-scrub": "node scripts/package-protection-smoke.mjs --variant shielded-surface-scrub",
    "package:protection:smoke:shielded:surface-scrub:wasm:stage2:derive": "node scripts/package-protection-smoke.mjs --variant shielded-surface-scrub-wasm-stage2-derive",
    "package:protection:smoke:shielded:surface-scrub:wasm:entitlement:legacy": "node scripts/package-protection-smoke.mjs --variant shielded-surface-scrub-wasm-entitlement-legacy",
    "package:protection:perf": "node scripts/package-protection-performance-report.mjs",
    "package:protection:webcrack": "node scripts/package-protection-webcrack-audit.mjs",
    "package:protection:webcrack:shielded": "node scripts/package-protection-webcrack-audit.mjs --variant shielded",
    "package:protection:webcrack:shielded:descriptor-bind": "node scripts/package-protection-webcrack-audit.mjs --variant shielded-descriptor-bind",
    "package:protection:webcrack:shielded:jsconfuser:string": "node scripts/package-protection-webcrack-audit.mjs --variant shielded-jsconfuser-string",
    "package:protection:webcrack:shielded:pref-bridge": "node scripts/package-protection-webcrack-audit.mjs --variant shielded-pref-bridge",
    "package:protection:webcrack:shielded:surface-scrub": "node scripts/package-protection-webcrack-audit.mjs --variant shielded-surface-scrub",
    "package:protection:webcrack:score": "node scripts/package-protection-webcrack-score.mjs",
    "package:protection:opencode": "node scripts/package-protection-opencode-analysis.mjs",
    "package:protection:opencode:score": "node scripts/package-protection-opencode-score.mjs",
    "package:protection:audit": "node scripts/package-protection-anchor-audit.mjs",
    "package:protection:audit:descriptor-bind": "node scripts/package-protection-anchor-audit.mjs --include-descriptor-bind",
    "package:protection:audit:jsconfuser:string": "node scripts/package-protection-anchor-audit.mjs --include-jsconfuser-string",
    "package:protection:audit:pref-bridge": "node scripts/package-protection-anchor-audit.mjs --include-pref-bridge",
    "package:protection:audit:surface-scrub": "node scripts/package-protection-anchor-audit.mjs --include-surface-scrub",
    "package:protection:attack": "node scripts/package-protection-attack-report.mjs",
    "package:protection:attack:plan": "node scripts/package-protection-guided-attack-plan.mjs",
    "package:protection:strategy": "node scripts/package-protection-strategy-report.mjs",
    "package:protection:review": "node scripts/package-protection-retained-review.mjs",
    "package:protection:matrix": "node scripts/package-protection-matrix-report.mjs",
    "package:protection:wasm:admission": "node scripts/package-protection-wasm-admission.mjs",
    "package:protection:compare": "node scripts/package-protection-experiment-compare.mjs",
    "package:protection:compare:descriptor-bind": "node scripts/package-protection-experiment-compare.mjs --variant shielded-descriptor-bind",
    "package:protection:compare:jsconfuser:string": "node scripts/package-protection-experiment-compare.mjs --variant shielded-jsconfuser-string",
    "package:protection:compare:pref-bridge": "node scripts/package-protection-experiment-compare.mjs --variant shielded-pref-bridge",
    "package:protection:compare:surface-scrub": "node scripts/package-protection-experiment-compare.mjs --variant shielded-surface-scrub",
    "package:protection:compare:surface-scrub:wasm:stage2:derive": "node scripts/package-protection-experiment-compare.mjs --variant shielded-surface-scrub-wasm-stage2-derive",
    "package:protection:compare:surface-scrub:wasm:entitlement:legacy": "node scripts/package-protection-experiment-compare.mjs --variant shielded-surface-scrub-wasm-entitlement-legacy",
    "package:protection:jsconfuser:bootstrap": "node scripts/package-protection-jsconfuser-bootstrap.mjs",
    "package:protection:jsconfuser:preflight": "node scripts/package-protection-jsconfuser-preflight.mjs",
    "package:protection:jsconfuser:string:preflight": "node scripts/package-protection-jsconfuser-preflight.mjs --profile targeted-string-concealing",
    "package:protection:lightweight:preflight": "node scripts/package-protection-lightweight-preflight.mjs",
    "package:protection:inner:audit": "node scripts/package-protection-inner-audit.mjs",
    "package:protection:inner:audit:shielded": "node scripts/package-protection-inner-audit.mjs --variant shielded",
    "package:protection:inner:audit:descriptor-bind": "node scripts/package-protection-inner-audit.mjs --variant shielded-descriptor-bind",
    "package:protection:inner:audit:jsconfuser:string": "node scripts/package-protection-inner-audit.mjs --variant shielded-jsconfuser-string",
    "package:protection:inner:audit:pref-bridge": "node scripts/package-protection-inner-audit.mjs --variant shielded-pref-bridge",
    "package:protection:inner:audit:surface-scrub": "node scripts/package-protection-inner-audit.mjs --variant shielded-surface-scrub",
    "package:protection:score": "node scripts/package-protection-manual-score.mjs",
    "package:protection:score:llm": "node scripts/package-protection-llm-score.mjs",
    "package:protection:score:guided": "node scripts/package-protection-guided-attack-score.mjs",
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
  if (typeof sourcePackage?.scripts?.["wasm:kernel:smoke"] === "string") {
    scripts["wasm:kernel:smoke"] = sourcePackage.scripts["wasm:kernel:smoke"];
  }
  if (typeof sourcePackage?.scripts?.["wasm:kernel:perf"] === "string") {
    scripts["wasm:kernel:perf"] = sourcePackage.scripts["wasm:kernel:perf"];
  }
  if (typeof sourcePackage?.scripts?.["wasm:kernel:disabled-contract"] === "string") {
    scripts["wasm:kernel:disabled-contract"] = sourcePackage.scripts["wasm:kernel:disabled-contract"];
  }
  if (typeof sourcePackage?.scripts?.["wasm:kernel:matrix"] === "string") {
    scripts["wasm:kernel:matrix"] = sourcePackage.scripts["wasm:kernel:matrix"];
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
- 可选 bundle 现状：\`react-ui\` 仍是 implemented + default-disabled；\`wasm-kernel\` 仍是 planned + default-disabled，并保留 checked-in probe 资产用于后续 bundle-local 验证

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

## Wasm Probe Assets

以下 probe 资产会随纯项目一起导出，继续保持 default-disabled，不自动进入主启动链：

- \`addon-static/content/lib/w/probe.wasm\`
- \`addon-static/content/lib/w/wasm-probe-worker.js\`
- \`src/services/wasm-loader.js\`
- \`src/services/wasm-worker.js\`
- \`src/features/wasm-kernel-probe.js\`
- \`scripts/wasm-kernel-smoke.mjs\`
- \`scripts/wasm-kernel-performance-report.mjs\`
- \`scripts/wasm-kernel-disabled-contract-report.mjs\`
- \`scripts/wasm-kernel-matrix-report.mjs\`

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
npm run package:shielded:pref-bridge
npm run package:shielded:surface-scrub
npm run package:shielded:surface-scrub:wasm:digest
npm run package:shielded:surface-scrub:wasm:stage2:derive
npm run package:protection:smoke -- --variant shielded --repeats 3 --channel stable
npm run package:protection:smoke:shielded:descriptor-bind -- --repeats 3 --channel stable
npm run package:protection:smoke:shielded:jsconfuser:string -- --repeats 3 --channel stable # 如自动发现失败，再补 --jsconfuser-tool-path
npm run package:protection:smoke:shielded:pref-bridge -- --repeats 3 --channel stable
npm run package:protection:smoke:shielded:surface-scrub -- --repeats 3 --channel stable
npm run package:protection:smoke:shielded:surface-scrub:wasm:stage2:derive -- --repeats 3 --channel stable
npm run package:protection:perf -- --channel stable
npm run package:protection:webcrack:shielded -- --channel stable
npm run package:protection:webcrack:shielded:descriptor-bind -- --channel stable
npm run package:protection:webcrack:shielded:jsconfuser:string -- --channel stable # 如自动发现失败，再补 --jsconfuser-tool-path
npm run package:protection:webcrack:shielded:pref-bridge -- --channel stable
npm run package:protection:webcrack:shielded:surface-scrub -- --channel stable
npm run package:protection:webcrack:score -- --variant shielded --channel stable
npm run package:protection:opencode -- --variant shielded --channel stable # 当前环境已安装并允许调用 opencode run 时，生成默认 single-pass 静态分析工件
npm run package:protection:opencode:score -- --variant shielded --channel stable # 把 suggestedLLMRating 回填到 smoke report 的 manualScorecard.llmSinglePassResult
npm run package:protection:audit
npm run package:protection:audit:descriptor-bind
npm run package:protection:audit:jsconfuser:string # 如自动发现失败，再补 -- --jsconfuser-tool-path /absolute/path/to/js-confuser
npm run package:protection:audit:pref-bridge
npm run package:protection:audit:surface-scrub
npm run package:protection:attack
npm run package:protection:attack:plan
npm run package:protection:strategy
npm run package:protection:review
npm run package:protection:matrix
npm run package:protection:wasm:admission
npm run package:protection:compare:descriptor-bind -- --channel stable
npm run package:protection:compare:jsconfuser:string -- --channel stable
npm run package:protection:compare:pref-bridge -- --channel stable
npm run package:protection:compare:surface-scrub -- --channel stable
npm run package:protection:compare:surface-scrub:wasm:stage2:derive -- --channel stable
npm run package:protection:jsconfuser:bootstrap # 把 js-confuser 安装到 dist/package-protection-tools/js-confuser，供后续实验自动发现
npm run package:protection:jsconfuser:preflight # 如自动发现失败，优先先跑 bootstrap，再补 -- --tool-path /absolute/path/to/js-confuser
npm run package:protection:jsconfuser:string:preflight # 如自动发现失败，再补 -- --tool-path /absolute/path/to/js-confuser
npm run package:protection:lightweight:preflight # 如自动发现失败，再补 -- --tool-path /absolute/path/to/lightweight-js-obfuscator
npm run package:protection:inner:audit:shielded -- --channel stable
npm run package:protection:inner:audit:descriptor-bind -- --channel stable
npm run package:protection:inner:audit:jsconfuser:string -- --channel stable # 如自动发现失败，再补 --jsconfuser-tool-path
npm run package:protection:inner:audit:pref-bridge -- --channel stable
npm run package:protection:inner:audit:surface-scrub -- --channel stable
npm run package:protection:score:llm -- --variant shielded-jsconfuser-string --channel stable --llm "parse-fail / only-loader" # 手工 fallback；仅在 opencode lane 不可用或需要人工覆盖时使用
npm run package:protection:score -- --variant shielded --channel stable --webcrack "parse-fail / only-loader" --llm "high-level-architecture"
npm run package:protection:score:guided -- --variant shielded --channel stable --rating "high-level-architecture" --result-tier R1 --attacker-tier A2 --ai-tier M3 --attack-method static+reference --time-bucket 30-120m --round-mode multi-round --summary "guided attack recovered lifecycle facade"
npm run package:protection:verdict
npm run verify
npm run check
npm run build:react-ui
npm run wasm:kernel:smoke
npm run wasm:kernel:perf
npm run wasm:kernel:disabled-contract
npm run wasm:kernel:matrix
\`\`\`

补充说明：\`package:encrypted\`、\`package:shielded\`、\`package:shielded:descriptor-bind\`、\`package:shielded:jsconfuser:string\`、\`package:shielded:pref-bridge\`、\`package:shielded:surface-scrub\` 与 \`package:shielded:surface-scrub:wasm:digest\` 都只生成本地手动触发的受保护 XPI 分支，不参与默认 release metadata / release gate 主线，也不替代服务端保护；其中 \`package:shielded\` 会先对主 bundle 做混淆，再对 protected loader 做一层兼容性优先的混淆，最后做 AES 包装；\`package:shielded:descriptor-bind\` 则是在此基础上额外挂入一个 host-binding-aware 的 capability descriptor overlay 实验入口，仍保持非阻断、手动实验语义；\`package:shielded:jsconfuser:string\` 则会在现有 protected-only source proxy 上额外跑一层显式目标字符串的 \`JS-Confuser stringConcealing\`；\`package:shielded:pref-bridge\` 会把偏好设置相关的 pref key / pref pane surface 改写为运行时桥接 alias；\`package:shielded:surface-scrub\` 则继续在同一路线上把 \`bootstrap.js\` 里剩余的 \`addonRef / instanceKey\` 文字面值改写为运行时表达式，目标是进一步收缩解压后可直接静态读取的 support surface，但仍保持实验候选而非默认推荐路线；\`package:shielded:surface-scrub:wasm:digest\` 是第一条 Wasm protection experiment，只在 \`surface-scrub\` 上叠加 default-disabled / lazy 的 digest micro-kernel 候选，不把 Wasm 放进 startup critical path。\`package:protection:strategy\` 会把当前 primary / retained top / Wasm 候选状态收成一份 controller-facing 总览，固定回答“现在日常该用哪条手动导出线、哪条 hardening 候选最值得保留、Wasm 是否只应继续停在 bounded experiment”。\`package:protection:wasm:admission\` 只读取 matrix / retained review / wasm matrix / candidate registry，判断是否允许打开 Wasm candidate wave，不重跑实验、不进入 release gate。\`package:protection:jsconfuser:bootstrap\` 负责把 \`js-confuser\` 安装到 \`dist/package-protection-tools/js-confuser\`，让后续实验命令可以直接自动发现本地工具；只有 bootstrap 和自动发现都失败时，才需要显式传 \`--jsconfuser-tool-path\`。\`package:protection:lightweight:preflight\` 现在会优先自动发现本地 \`lightweight-js-obfuscator\` checkout，默认搜索仓库邻近目录、\`$HOME/.openclaw/workspace-coding*\`、\`~/Downloads\` 与 \`dist/package-protection-tools/lightweight-js-obfuscator\`；只有自动发现失败时，才需要显式传 \`--tool-path\`。当前正式手动收口链路固定为 \`package:protection:smoke -> package:protection:score -> package:protection:verdict\`：\`package:protection:smoke\` 只用于手动实验 \`plain / encrypted / shielded\` 三个控制组的安装态、\`packageProtection\` 时序与 base64 fast path 支持情况；\`package:protection:perf\` 则直接复用已有 smoke 工件，对外固定采用“\`durationMs\` 看体感风险、\`loadSubScript + prepare\` 看保护链真实成本”的双指标口径，避免被 Zotero 冷启动噪声误导；\`package:protection:webcrack\` 会在 fresh 打包后提取 XPI 内脚本、调用本地 \`webcrack\` CLI，并在 \`dist/package-protection-webcrack/\` 下落盘默认首轮与 fallback loader-only 两份自动化工件，供 controller / subagent / 人工继续判读；\`package:protection:webcrack:score\` 会把该工件中的 \`suggestedWebcrackRating\` 回填到 smoke report 的 \`manualScorecard.webcrackInitialResult\`；\`package:protection:opencode\` 则是当前默认 scripted single-pass 静态分析 lane，会在当前环境已安装并允许调用 \`opencode run\` 时生成 \`dist/package-protection-opencode/\` 工件；\`package:protection:opencode:score\` 只把该工件中的 \`suggestedLLMRating\` 回填到 \`manualScorecard.llmSinglePassResult\`；\`package:protection:score:llm\` 降级为手工 fallback，只在 opencode lane 不可用或需要人工覆盖时使用；\`package:protection:score\` 仍用于一次性补齐完整手工评分；\`package:protection:score:guided\` 则用于记录内部实验层的攻击画像，继续保留对外三档 rating，但额外固定记录 attacker tier、AI tier、attack method、time bucket、round mode 与 result tier，并把更强的 guided 攻击结果写入独立工件，不伪装成 single-pass 评分；\`package:protection:attack\` 则把当前 \`webcrack / single-pass LLM / guided-attack / compare\` 证据汇总成单独 attack report，专门回答“当前自动化阻力到哪一档、最强已记录画像能恢复到什么层级”；\`package:protection:attack:plan\` 则把 attack report 里的 fixed-profile coverage gap 翻译成下一步命令模板，优先补 \`current\` 候选的 \`singlePassAutomation / guidedA2M3\` 缺口，再进入 retained experiment review；\`package:protection:review\` 则把 retained review queue、top candidate 的 compare / matrix 信号与排序依据收成单独 advisory 工件，固定回答“当前应继续保留哪个 retained candidate、为什么”；\`package:protection:verdict\` 只生成 advisory 结论，不进入默认 release 主线。\`package:protection:audit\` 是额外的 raw export 语义泄露实验入口，用来判断下一步应该先 trim loader 还是进入 inner bundle semantic scrub；\`package:protection:audit:descriptor-bind\`、\`package:protection:audit:jsconfuser:string\`、\`package:protection:audit:pref-bridge\` 与 \`package:protection:audit:surface-scrub\` 则是在不改变上述基线判据的前提下，把额外实验变体纳入同一份审计报告。\`package:protection:matrix\` 则把当前 \`current / experiment / preflight / paper / preplan\` 候选统一收成一份矩阵，集中展示攻击阻力、性能/体积成本、surface 信号和 promotion gate，但仍保持 advisory-only。\`package:protection:compare\` 是实验 A/B 的收口入口，用来把 \`shielded\` 基线与某个实验变体的 smoke / webcrack / audit / 手工 LLM 状态收成一份 advisory compare 报告；Wasm digest 候选固定只和 \`shielded-surface-scrub\` 比，不和 \`shielded\` 直接做 promotion 判断；当手工 LLM 尚未补齐时，它会额外带上 \`package:protection:inner:audit\` 的 proxy 结果，但不会把 proxy 冒充 manual score。当前最新保守结论是：\`shielded-descriptor-bind = runtime-only\`；\`shielded-jsconfuser-string\` 虽然在 \`stable\` 一度显示 \`hardening-win\`，但 \`beta\` 复验落到 \`leaning-same / stop-current-candidate\`，因此继续保留为实验记录，不升级为当前推荐候选；\`shielded-pref-bridge\` 当前则定位为静态 support-surface hardening 候选，在不增加明显保护链开销的前提下收缩 pref surface；\`shielded-surface-scrub\` 则是 buildable 的 bootstrap-literal scrub 候选，后续只在它持续证明 unpacked support surface 继续收缩、且 runtime/automated 阻力不回退时，才考虑升格。\`package:protection:inner:audit\` 是新增的离线 inner bundle 证据入口：它会从 XPI 中提取 protected loader、在本地拦截 \`new Function(...)\` 前完成解密，再只读扫描 inner semantic anchors / module recovery anchors，并给出一个保守的 \`proxy LLM\` 建议评级；它只补证据，不会自动回填 \`manualScorecard\`。\`package:protection:jsconfuser:preflight\` 是当前更前置的 Stage 3 候选预检入口，只用于对外部 \`js-confuser\` checkout 做 \`astScrambler\` 的兼容性、体积和语义压缩预检；\`package:protection:jsconfuser:string:preflight\` 则是更激进但仍保持非 hostile 的次级预检入口，只对显式目标字符串做小范围 \`stringConcealing\` 试验；\`package:protection:lightweight:preflight\` 是更后置的 Stage 3 预检入口，只用于对外部 \`lightweight-js-obfuscator\` checkout 做兼容性与体积预检，不会改写默认 \`shielded\` 路线。

导出目标适合继续聚焦插件本体开发；如果需要完整 agent 闭环、Obsidian 介入包或默认 release gate 编排，请回到主仓库。
`;
}

function buildExportManifest(config, outputName, optionalBundleRegistry = null) {
  return {
    generatedAt: new Date().toISOString(),
    addonName: config.addonName,
    addonRef: config.addonRef,
    addonVersion: config.addonVersion,
    exportName: outputName,
    includedPaths: COPY_PATHS,
    staticRuntimeBaselineFiles: STATIC_RUNTIME_BASELINE_PATHS,
    optionalBundles: optionalBundleRegistry
      ? listOptionalBundles(optionalBundleRegistry).map((entry) => ({
          id: entry.id,
          enabled: entry.enabled,
          lane: entry.lane,
          implementationStatus: entry.implementationStatus,
        }))
      : [],
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
        `${JSON.stringify(buildExportManifest(config, outputName, optionalBundleRegistry), null, 2)}\n`,
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
